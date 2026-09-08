/**
 * CFG-01 Phase 3A — governed licence-profile mutation workflow. Documented blueprint extension
 * (approved decision #4 — see `infra/migrations/016_cfg1_mutation_workflow.cjs`'s header comment
 * for why `cfg1.licence_profile_change` exists even though the blueprint's own `05_Database_
 * Design.md` §2 table list never defined one). Structurally mirrors `routes/feature-changes.ts`
 * field-for-field wherever the two concepts line up — see that file's header comment for the
 * full design rationale (IAM-02 approval reuse, operational payload-hash contract, actor
 * identity binding, token-consumed-after-verify discipline); this file's comments only note
 * where licence-profile mutation genuinely differs.
 *
 * Only `MB`/`PSO`/`EXCHANGE` — the three rows Phase 1 seeded — can ever be the target of a
 * change; no row is ever created here (unlike `cfg1.feature`, which Phase 3A's feature workflow
 * CAN create). `to_status` is restricted to `approved`/`suspended`/`revoked` (approved Phase 3A
 * permission list: `.activate`/`.suspend`/`.revoke` — `locked`/`retired`, both legal values on
 * `cfg1.licence_profile.licence_status`'s own CHECK constraint, have no corresponding permission
 * this phase and are therefore not reachable through this route, same "reserved for later"
 * discipline `feature_state_change.status`'s own unreachable values already carry).
 *
 * SECURITY NOTE (regression, not new behaviour): flipping `EXCHANGE`'s `licence_status` to
 * `approved` through this route does NOT enable any `exchange.*` feature. Phase 1's layered
 * enforcement is untouched by this phase — every `exchange.*` code remains separately
 * hard-blocked in `cfg1.prohibited_feature` (immutable, no route anywhere can clear it — approved
 * decisions #5/#6/#7) and `assertNoExchangeRuntime`'s boot-time route-table scan is independent
 * of any DB state entirely. Proven by a dedicated integration test, not merely asserted here.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, fingerprint, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeCfg1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { assertPoolAvailable } from "./features.js";
import { resealScope } from "../lib/integrity-seal.js";
import { sha256Hex } from "../lib/canonical.js";
import { checkPermission, verifyDecisionToken as verifyIam2DecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { Cfg1Error } from "../lib/errors.js";
import type { Cfg1Config } from "../config.js";

const LICENCE_CODES = ["MB", "PSO", "EXCHANGE"] as const;
const TO_STATUSES = ["approved", "suspended", "revoked"] as const;

const RequestBody = Type.Object(
  {
    licence_code: Type.Union(LICENCE_CODES.map((c) => Type.Literal(c))),
    to_status: Type.Union(TO_STATUSES.map((s) => Type.Literal(s))),
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

function permissionForToStatus(toStatus: (typeof TO_STATUSES)[number]): string {
  if (toStatus === "approved") return "cfg1.licence_profile.activate";
  if (toStatus === "suspended") return "cfg1.licence_profile.suspend";
  return "cfg1.licence_profile.revoke";
}

function changePayload(row: { change_id: string; licence_profile_id: string; licence_code: string; to_status: string }): Record<string, unknown> {
  return { change_id: row.change_id, licence_profile_id: row.licence_profile_id, licence_code: row.licence_code, to_status: row.to_status };
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Cfg1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

export async function registerLicenceChangeRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeCfg1InternalIdentityGuard(app.config.cfg1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/cfg1/licence-profile-changes/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/cfg1/licence-profile-changes/request",
    { preHandler: requireInternal, schema: { body: RequestBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof RequestBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const baseline = await checkPermission(iam2, {
        actorId: body.requested_by,
        action: "cfg1.licence_profile.change_request",
        resource: "licence_profile",
        entityId: body.licence_code,
      });
      if (!baseline.allowed) throw new Cfg1Error("CFG1_MUTATION_UNAUTHORISED");

      const result = await withTransaction(async (client) => {
        const rows = await query<{ licence_profile_id: string; licence_status: string; version: number }>(
          client,
          `SELECT licence_profile_id, licence_status, version FROM cfg1.licence_profile WHERE licence_code = $1`,
          [body.licence_code],
        );
        const existing = rows[0];
        if (!existing) return { kind: "not_found" as const };

        const changeId = "lpc_" + randomUUID();
        const payloadHash = fingerprint(
          changePayload({ change_id: changeId, licence_profile_id: existing.licence_profile_id, licence_code: body.licence_code, to_status: body.to_status }),
        );

        await client.query(
          `INSERT INTO cfg1.licence_profile_change
             (change_id, licence_profile_id, licence_code, from_status, to_status, change_reason,
              requested_by, status, payload_hash, request_id, correlation_id, created_at_utc)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'requested',$8,$9,$10, now())`,
          [
            changeId,
            existing.licence_profile_id,
            body.licence_code,
            existing.licence_status,
            body.to_status,
            body.change_reason,
            body.requested_by,
            payloadHash,
            request.ctx.request_id,
            request.ctx.correlation_id,
          ],
        );

        await publishAudit(client, {
          event_type: "cfg1.licence_profile.change_requested",
          source_module: "CFG-01",
          actor_id: body.requested_by,
          actor_type: "user",
          entity_type: "licence_profile",
          entity_id: body.licence_code,
          severity: "medium",
          action: "change_request",
          result: "success",
          metadata: { change_id: changeId, to_status: body.to_status },
        });

        return { kind: "created" as const, changeId, payloadHash };
      }).catch((err) => {
        throw new Cfg1Error("CFG1_AUDIT_REQUIRED", { cause: err });
      });

      if (result.kind === "not_found") throw new AppError("NOT_FOUND");

      return reply.send(
        successEnvelope(
          { change_id: result.changeId, status: "requested", licence_code: body.licence_code, to_status: body.to_status, payload_hash: result.payloadHash },
          meta(request),
        ),
      );
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/cfg1/licence-profile-changes/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/cfg1/licence-profile-changes/apply",
    { preHandler: requireInternal, schema: { body: ApplyBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      interface ChangeRow {
        change_id: string;
        licence_profile_id: string;
        licence_code: string;
        to_status: string;
        requested_by: string;
        status: string;
      }
      const changeRows = await withTransaction((client) =>
        query<ChangeRow>(
          client,
          `SELECT change_id, licence_profile_id, licence_code, to_status, requested_by, status
             FROM cfg1.licence_profile_change WHERE change_id = $1`,
          [body.change_id],
        ),
      );
      const changeRow = changeRows[0];
      if (!changeRow) throw new AppError("NOT_FOUND");
      if (changeRow.status !== "requested") throw new Cfg1Error("CFG1_CHANGE_REQUEST_INVALID_STATE");

      const action = permissionForToStatus(changeRow.to_status as (typeof TO_STATUSES)[number]);

      const baseline = await checkPermission(iam2, {
        actorId: changeRow.requested_by,
        action,
        resource: "licence_profile",
        entityId: changeRow.licence_code,
      });
      if (!baseline.allowed) throw new Cfg1Error("CFG1_MUTATION_UNAUTHORISED");

      // No DB lock held across this network call — see routes/feature-changes.ts's header
      // comment for the full rationale (identical here).
      const currentPayloadHash = fingerprint(changePayload(changeRow));
      const verify = await verifyIam2DecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: changeRow.requested_by,
        action,
        resource: "licence_profile",
        entityId: changeRow.licence_code,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Cfg1Error("CFG1_MUTATION_APPROVAL_REQUIRED");

      // IAM-02's token is now CONSUMED. The change row is deliberately NOT forced into a
      // 'failed' terminal status here — see routes/feature-changes.ts's identical header
      // rationale (a separate "mark as failed" write would face the exact same audit-durability
      // requirement that may itself be what's failing; the row simply stays 'requested',
      // retriable with a FRESH IAM-02 approval). Fields pulled into local consts (rather than
      // referencing `changeRow` directly) so TypeScript's control-flow narrowing survives the
      // nested closure below.
      const decisionTokenHash = sha256Hex(body.decision_token);
      const requestedBy = changeRow.requested_by;
      const licenceCode = changeRow.licence_code;
      async function recordFailureAudit(reasonCode: string, resealFailed: boolean): Promise<void> {
        await withTransaction(async (client) => {
          await publishAudit(client, {
            event_type: "cfg1.licence_profile.change_failed",
            source_module: "CFG-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "licence_profile",
            entity_id: licenceCode,
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
              entity_type: "licence_profile",
              entity_id: licenceCode,
              severity: "critical",
              action: "reseal",
              result: "failure",
              metadata: { change_id: body.change_id, scope: "licence_profile" },
            });
          }
        }).catch(() => {
          // Best-effort only — see routes/feature-changes.ts's identical rationale.
        });
      }

      type ApplyOutcome = { kind: "raced" } | { kind: "applied"; previousVersion: number; newVersion: number; sealVersion: number };
      let outcome: ApplyOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          const locked = await client.query<{ status: string }>(
            `SELECT status FROM cfg1.licence_profile_change WHERE change_id = $1 FOR UPDATE`,
            [body.change_id],
          );
          if (locked.rows[0]?.status !== "requested") {
            return { kind: "raced" as const };
          }

          const current = await query<{ version: number }>(
            client,
            `SELECT version FROM cfg1.licence_profile WHERE licence_profile_id = $1 FOR UPDATE`,
            [changeRow.licence_profile_id],
          );
          const previousVersion = current[0]?.version ?? 0;
          const newVersion = previousVersion + 1;

          await client.query(
            `UPDATE cfg1.licence_profile SET licence_status = $2, version = $3, updated_at_utc = now() WHERE licence_profile_id = $1`,
            [changeRow.licence_profile_id, changeRow.to_status, newVersion],
          );

          const seal = await resealScope(client, "licence_profile", { approvalId: body.approval_id });

          await client.query(
            `UPDATE cfg1.licence_profile_change
                SET status = 'applied', approval_id = $2, decision_token_hash = $3,
                    previous_version = $4, new_version = $5, applied_at_utc = now(), effective_at_utc = now()
              WHERE change_id = $1`,
            [body.change_id, body.approval_id, decisionTokenHash, previousVersion, newVersion],
          );

          await publishAudit(client, {
            event_type: "cfg1.licence_profile.change_applied",
            source_module: "CFG-01",
            actor_id: changeRow.requested_by,
            actor_type: "user",
            entity_type: "licence_profile",
            entity_id: changeRow.licence_code,
            severity: "high",
            action,
            result: "success",
            metadata: { change_id: body.change_id, previous_version: previousVersion, new_version: newVersion, to_status: changeRow.to_status },
          });
          await publishAudit(client, {
            event_type: "cfg1.reseal.completed",
            source_module: "CFG-01",
            actor_id: changeRow.requested_by,
            actor_type: "user",
            entity_type: "licence_profile",
            entity_id: changeRow.licence_code,
            severity: "medium",
            action: "reseal",
            result: "success",
            metadata: { change_id: body.change_id, scope: "licence_profile", new_seal_version: seal.newVersion },
          });

          return { kind: "applied" as const, previousVersion, newVersion, sealVersion: seal.newVersion };
        });
      } catch (err) {
        const resealFailed = err instanceof Error && err.message.startsWith("resealScope:");
        await recordFailureAudit("apply_transaction_failed", resealFailed);
        throw new Cfg1Error("CFG1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced") throw new Cfg1Error("CFG1_CHANGE_REQUEST_INVALID_STATE");

      return reply.send(
        successEnvelope(
          {
            change_id: body.change_id,
            status: "applied",
            licence_code: changeRow.licence_code,
            previous_version: outcome.previousVersion,
            new_version: outcome.newVersion,
            seal: { scope: "licence_profile", new_version: outcome.sealVersion },
          },
          meta(request),
        ),
      );
    },
  );
}
