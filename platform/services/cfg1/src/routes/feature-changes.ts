/**
 * CFG-01 Phase 3A — governed feature-state mutation workflow (blueprint
 * `05_Database_Design.md` §2.4, `07_Permission_Rules.md` §4/§5, approved Phase 3A scope).
 *
 * Two routes: `request` (propose, no state mutation) and `apply` (verify-and-mutate, atomic).
 * CFG-01 builds NO maker-checker tables of its own (approved decision #2) — the actual
 * maker-checker/approval workflow is IAM-02's EXISTING `/iam2/approvals/request` +
 * `/iam2/approvals/:id/approve` (run by an operator OUTSIDE this service, e.g. operational
 * tooling or a future PRT-01 BFF), reused exactly as SEC-01 Phase 5's Critical-alert-closure
 * route reuses it (`services/sec1/src/routes/alerts.ts`) — no new IAM-02 code, no IAM-02 guard
 * change.
 *
 * OPERATIONAL CONTRACT (mirrors SEC-01's own documented precedent): to redeem the resulting
 * decision token, the operator's IAM-02 approval MUST have been created with a `payload` object
 * whose `fingerprint()` (canonical-JSON sha256, `@aix/foundation`) equals exactly the
 * `payload_hash` this service's `request` route returns. That payload's exact shape is:
 *   `{ change_id, feature_code, to_state, feature_name, licence_code }`
 * (`feature_name`/`licence_code` are `null` when not supplied). `apply` recomputes this SAME
 * hash from the STORED change row (never from a re-submitted request body — the apply body
 * carries only `change_id`/`approval_id`/`decision_token`) and passes it to IAM-02's
 * execute-verify as `current_payload_hash`; any mismatch fails closed.
 *
 * IDENTITY: the IAM-02 decision token is bound to the ORIGINAL REQUESTER
 * (`iam2.approval_request.maker_user_id`, set to whatever `requested_by` the request route was
 * called with — services/iam2/src/routes/approvals.ts issues the token with
 * `actorUserId: approval.maker_user_id`) — `apply` therefore passes the STORED row's own
 * `requested_by` as `actor_id` to execute-verify, never a caller-supplied value, so a caller
 * cannot redeem someone else's approval by simply claiming to be them.
 *
 * DOUBLE-GUARDED PROHIBITED/EXCHANGE PROTECTION (approved decisions #5/#6/#7): both `request`
 * and `apply` call `lib/decision.ts`'s `isFeatureMutationBlocked` — checked at REQUEST time so a
 * doomed proposal never wastes an IAM-02 approval cycle, and RE-CHECKED at APPLY time as
 * defence in depth (the registry cannot actually change this phase, but this does not assume
 * that invariant can never be bypassed by a future phase or an out-of-band write).
 *
 * TOKEN-CONSUMED-AFTER-VERIFY DISCIPLINE: IAM-02's `execute-verify` call happens BEFORE this
 * route opens its own local transaction (network round-trip never held under a DB lock — same
 * discipline SEC-01's alert-close route documents). This means IAM-02's decision token is
 * ALREADY CONSUMED (single-use, unlike CFG-01's own Phase 2 bounded-reuse tokens) the moment
 * `verifyDecisionToken` returns `authorised: true` — a failure ANYWHERE after that point (the
 * mutation itself, the reseal, the audit publish) can no longer be silently retried with the SAME
 * token. The change row is deliberately NOT forced into a separate `failed` terminal status if
 * that happens: a distinct "mark as failed" write would face the exact same audit-durability
 * requirement (approved decision #11 — no state mutation without a durable audit trail) that may
 * itself be what's broken (the common failure case is the audit/outbox write itself), so it
 * cannot be relied on to succeed either. Instead, the whole apply transaction rolls back and the
 * row is left exactly as it was — `requested`, always safely retriable with a FRESH IAM-02
 * approval; only the now-consumed token itself needs replacing. `recordFailureAudit()` makes a
 * best-effort, audit-only attempt (no row mutation) to record what happened for observability
 * when the failure is NOT itself an audit/outbox failure — if even that fails, it is silently
 * swallowed and the original error is still what the caller sees. This is a known, accepted,
 * documented limitation of reusing IAM-02's cross-service approval primitive rather than a
 * single shared transaction — the identical shape SEC-01 Phase 5's own Critical-alert-closure
 * route already accepts.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { AppError, fingerprint, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeCfg1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { assertPoolAvailable } from "./features.js";
import { isFeatureMutationBlocked } from "../lib/decision.js";
import { resealScope } from "../lib/integrity-seal.js";
import { sha256Hex } from "../lib/canonical.js";
import { checkPermission, verifyDecisionToken as verifyIam2DecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { Cfg1Error } from "../lib/errors.js";
import type { Cfg1Config } from "../config.js";

const LICENCE_CODES = ["MB", "PSO", "EXCHANGE"] as const;
const TO_STATES = ["enabled", "disabled"] as const;

const RequestBody = Type.Object(
  {
    feature_code: Type.String({ minLength: 1, maxLength: 128 }),
    to_state: Type.Union(TO_STATES.map((s) => Type.Literal(s))),
    feature_name: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    licence_code: Type.Optional(Type.Union(LICENCE_CODES.map((c) => Type.Literal(c)))),
    change_reason: Type.String({ minLength: 1, maxLength: 1024 }),
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const ApplyBody = Type.Object(
  {
    change_id: Type.String({ minLength: 1, maxLength: 64 }),
    approval_id: Type.String({ minLength: 1, maxLength: 64 }),
    decision_token: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

interface FeatureLookupRow {
  feature_id: string;
  current_state: string;
  version: number;
  licence_profile_id: string | null;
}

async function lookupFeature(client: PoolClient, featureCode: string): Promise<FeatureLookupRow | undefined> {
  const rows = await query<FeatureLookupRow>(
    client,
    `SELECT feature_id, current_state, version, licence_profile_id FROM cfg1.feature WHERE feature_code = $1`,
    [featureCode],
  );
  return rows[0];
}

function changePayload(row: { change_id: string; feature_code: string; to_state: string; feature_name: string | null; licence_code: string | null }): Record<string, unknown> {
  return {
    change_id: row.change_id,
    feature_code: row.feature_code,
    to_state: row.to_state,
    feature_name: row.feature_name,
    licence_code: row.licence_code,
  };
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Cfg1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

export async function registerFeatureChangeRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeCfg1InternalIdentityGuard(app.config.cfg1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/cfg1/feature-changes/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/cfg1/feature-changes/request",
    { preHandler: requireInternal, schema: { body: RequestBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof RequestBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const baseline = await checkPermission(iam2, {
        actorId: body.requested_by,
        action: "cfg1.feature.change_request",
        resource: "feature",
        entityId: body.feature_code,
      });
      if (!baseline.allowed) {
        throw new Cfg1Error("CFG1_MUTATION_UNAUTHORISED");
      }

      const result = await withTransaction(async (client) => {
        const blocked = await isFeatureMutationBlocked(client, body.feature_code);
        if (blocked.blocked) {
          await publishAudit(client, {
            event_type: "cfg1.prohibited_mutation.blocked",
            source_module: "CFG-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "feature",
            entity_id: body.feature_code,
            severity: "critical",
            action: "change_request",
            result: "blocked",
            reason_code: blocked.reason,
          });
          return { kind: "blocked" as const };
        }

        const existing = await lookupFeature(client, body.feature_code);
        if (!existing && body.to_state !== "enabled") {
          return { kind: "feature_not_found" as const };
        }
        if (!existing && body.to_state === "enabled" && !body.feature_name) {
          return { kind: "feature_name_required" as const };
        }

        let licenceProfileId: string | null = existing?.licence_profile_id ?? null;
        if (!existing && body.licence_code) {
          const lp = await query<{ licence_profile_id: string }>(
            client,
            `SELECT licence_profile_id FROM cfg1.licence_profile WHERE licence_code = $1`,
            [body.licence_code],
          );
          licenceProfileId = lp[0]?.licence_profile_id ?? null;
        }

        const changeId = "fsc_" + randomUUID();
        const featureName = existing ? null : (body.feature_name ?? null);
        const payloadHash = fingerprint(
          changePayload({ change_id: changeId, feature_code: body.feature_code, to_state: body.to_state, feature_name: featureName, licence_code: body.licence_code ?? null }),
        );

        await client.query(
          `INSERT INTO cfg1.feature_state_change
             (change_id, feature_code, from_state, to_state, feature_name, licence_code, change_reason,
              requested_by, licence_profile_id, status, payload_hash, request_id, correlation_id, created_at_utc)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'requested',$10,$11,$12, now())`,
          [
            changeId,
            body.feature_code,
            existing?.current_state ?? null,
            body.to_state,
            featureName,
            body.licence_code ?? null,
            body.change_reason,
            body.requested_by,
            licenceProfileId,
            payloadHash,
            request.ctx.request_id,
            request.ctx.correlation_id,
          ],
        );

        await publishAudit(client, {
          event_type: "cfg1.feature_state.change_requested",
          source_module: "CFG-01",
          actor_id: body.requested_by,
          actor_type: "user",
          entity_type: "feature",
          entity_id: body.feature_code,
          severity: "medium",
          action: "change_request",
          result: "success",
          metadata: { change_id: changeId, to_state: body.to_state },
        });

        return { kind: "created" as const, changeId, payloadHash };
      }).catch((err) => {
        throw new Cfg1Error("CFG1_AUDIT_REQUIRED", { cause: err });
      });

      if (result.kind === "blocked") throw new Cfg1Error("CFG1_FEATURE_PROHIBITED");
      if (result.kind === "feature_not_found") throw new AppError("NOT_FOUND");
      if (result.kind === "feature_name_required") {
        throw new AppError("VALIDATION_ERROR", { message: "feature_name is required when enabling a feature that does not yet exist." });
      }

      return reply.send(
        successEnvelope(
          { change_id: result.changeId, status: "requested", feature_code: body.feature_code, to_state: body.to_state, payload_hash: result.payloadHash },
          meta(request),
        ),
      );
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/cfg1/feature-changes/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/cfg1/feature-changes/apply",
    { preHandler: requireInternal, schema: { body: ApplyBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      interface ChangeRow {
        change_id: string;
        feature_code: string;
        to_state: string;
        feature_name: string | null;
        licence_code: string | null;
        requested_by: string;
        status: string;
      }
      const changeRows = await withTransaction((client) =>
        query<ChangeRow>(
          client,
          `SELECT change_id, feature_code, to_state, feature_name, licence_code, requested_by, status
             FROM cfg1.feature_state_change WHERE change_id = $1`,
          [body.change_id],
        ),
      );
      const changeRow = changeRows[0];
      if (!changeRow) throw new AppError("NOT_FOUND");
      if (changeRow.status !== "requested") throw new Cfg1Error("CFG1_CHANGE_REQUEST_INVALID_STATE");

      const action = changeRow.to_state === "enabled" ? "cfg1.feature.enable" : "cfg1.feature.disable";

      const baseline = await checkPermission(iam2, {
        actorId: changeRow.requested_by,
        action,
        resource: "feature",
        entityId: changeRow.feature_code,
      });
      if (!baseline.allowed) throw new Cfg1Error("CFG1_MUTATION_UNAUTHORISED");

      // No DB lock held across this network call — see file header comment.
      const currentPayloadHash = fingerprint(changePayload(changeRow));
      const verify = await verifyIam2DecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: changeRow.requested_by,
        action,
        resource: "feature",
        entityId: changeRow.feature_code,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Cfg1Error("CFG1_MUTATION_APPROVAL_REQUIRED");

      // From here on, IAM-02's decision token is CONSUMED. The change row is deliberately NOT
      // forced into a 'failed' terminal status here: if the main apply transaction below fails
      // (including — the common case — because the audit/outbox write ITSELF is what's broken),
      // attempting a SEPARATE "mark as failed" write would face the exact same audit-durability
      // requirement (approved decision #11: no state mutation without a durable audit trail) and
      // could not reliably succeed either. Simpler and equally safe: the failed transaction rolls
      // back entirely, the row is left exactly as it was ('requested'), and a caller who obtains
      // a FRESH IAM-02 approval can simply retry the SAME change_id — a 'requested' row is always
      // retriable by construction, there is no special "half-failed" state to reason about. Only
      // the now-consumed IAM-02 token itself cannot be reused; a new one is required, which is
      // the correct, minor, accepted cost of an audit-system outage (mirrors the platform-wide
      // "audit unavailable -> action cannot proceed" fail-closed principle). recordFailureAudit
      // is a BEST-EFFORT, audit-only attempt (no row mutation) so an operator has a chance of
      // seeing what happened when the audit system itself is healthy but something else failed
      // (e.g. a reseal bug) — if even this fails, it is silently swallowed; the original error is
      // what the caller sees either way.
      const decisionTokenHash = sha256Hex(body.decision_token);
      const requestedBy = changeRow.requested_by;
      const featureCode = changeRow.feature_code;
      async function recordFailureAudit(reasonCode: string, resealFailed: boolean): Promise<void> {
        await withTransaction(async (client) => {
          await publishAudit(client, {
            event_type: "cfg1.feature_state.change_failed",
            source_module: "CFG-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "feature",
            entity_id: featureCode,
            severity: "high",
            action,
            result: "failure",
            reason_code: reasonCode,
            metadata: { change_id: body.change_id },
          });
          if (resealFailed) {
            await publishAudit(client, {
              event_type: "cfg1.reseal.failed",
              source_module: "CFG-01",
              actor_id: requestedBy,
              actor_type: "user",
              entity_type: "feature",
              entity_id: featureCode,
              severity: "critical",
              action: "reseal",
              result: "failure",
              metadata: { change_id: body.change_id, scope: "feature" },
            });
          }
        }).catch(() => {
          // Best-effort only — see comment above.
        });
      }

      type ApplyOutcome = { kind: "raced" } | { kind: "blocked_post_verify" } | { kind: "applied"; previousVersion: number | null; newVersion: number; sealVersion: number };
      let outcome: ApplyOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          const locked = await client.query<{ status: string }>(
            `SELECT status FROM cfg1.feature_state_change WHERE change_id = $1 FOR UPDATE`,
            [body.change_id],
          );
          if (locked.rows[0]?.status !== "requested") {
            return { kind: "raced" as const };
          }

          const blocked = await isFeatureMutationBlocked(client, changeRow.feature_code);
          if (blocked.blocked) {
            return { kind: "blocked_post_verify" as const };
          }

          const existing = await lookupFeature(client, changeRow.feature_code);
          const previousVersion = existing?.version ?? null;
          const newVersion = (existing?.version ?? 0) + 1;

          if (!existing) {
            const lpRow = changeRow.licence_code
              ? await query<{ licence_profile_id: string }>(client, `SELECT licence_profile_id FROM cfg1.licence_profile WHERE licence_code = $1`, [changeRow.licence_code])
              : [];
            await client.query(
              `INSERT INTO cfg1.feature (feature_id, feature_code, feature_name, current_state, licence_profile_id, version, created_at_utc, updated_at_utc)
               VALUES ($1,$2,$3,$4,$5,1, now(), now())`,
              ["feat_" + randomUUID(), changeRow.feature_code, changeRow.feature_name, changeRow.to_state, lpRow[0]?.licence_profile_id ?? null],
            );
          } else {
            await client.query(`UPDATE cfg1.feature SET current_state = $2, version = $3, updated_at_utc = now() WHERE feature_code = $1`, [
              changeRow.feature_code,
              changeRow.to_state,
              newVersion,
            ]);
          }

          await client.query(
            `INSERT INTO cfg1.feature_version (feature_version_id, feature_id, feature_code, version, state_snapshot, created_at_utc)
             VALUES ($1,(SELECT feature_id FROM cfg1.feature WHERE feature_code = $2),$2,$3,$4, now())`,
            ["featver_" + randomUUID(), changeRow.feature_code, newVersion, JSON.stringify({ current_state: changeRow.to_state })],
          );

          const seal = await resealScope(client, "feature", { approvalId: body.approval_id });

          await client.query(
            `UPDATE cfg1.feature_state_change
                SET status = 'applied', approval_id = $2, decision_token_hash = $3,
                    previous_version = $4, new_version = $5, applied_at_utc = now(), effective_at_utc = now()
              WHERE change_id = $1`,
            [body.change_id, body.approval_id, decisionTokenHash, previousVersion, newVersion],
          );

          await publishAudit(client, {
            event_type: "cfg1.feature_state.change_applied",
            source_module: "CFG-01",
            actor_id: changeRow.requested_by,
            actor_type: "user",
            entity_type: "feature",
            entity_id: changeRow.feature_code,
            severity: "high",
            action,
            result: "success",
            metadata: { change_id: body.change_id, previous_version: previousVersion, new_version: newVersion },
          });
          await publishAudit(client, {
            event_type: "cfg1.reseal.completed",
            source_module: "CFG-01",
            actor_id: changeRow.requested_by,
            actor_type: "user",
            entity_type: "feature",
            entity_id: changeRow.feature_code,
            severity: "medium",
            action: "reseal",
            result: "success",
            metadata: { change_id: body.change_id, scope: "feature", new_seal_version: seal.newVersion },
          });

          return { kind: "applied" as const, previousVersion, newVersion, sealVersion: seal.newVersion };
        });
      } catch (err) {
        const resealFailed = err instanceof Error && err.message.startsWith("resealScope:");
        await recordFailureAudit("apply_transaction_failed", resealFailed);
        throw new Cfg1Error("CFG1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced") throw new Cfg1Error("CFG1_CHANGE_REQUEST_INVALID_STATE");
      if (outcome.kind === "blocked_post_verify") {
        await recordFailureAudit("prohibited_registry", false);
        throw new Cfg1Error("CFG1_FEATURE_PROHIBITED");
      }

      return reply.send(
        successEnvelope(
          {
            change_id: body.change_id,
            status: "applied",
            feature_code: changeRow.feature_code,
            previous_version: outcome.previousVersion,
            new_version: outcome.newVersion,
            seal: { scope: "feature", new_version: outcome.sealVersion },
          },
          meta(request),
        ),
      );
    },
  );
}
