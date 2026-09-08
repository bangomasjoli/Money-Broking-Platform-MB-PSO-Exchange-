/**
 * IAM-02 Phase 3/4 — approval lifecycle (`04_API_Specification.md` §4, `07_Permission_Rules.md`
 * §9 "Approval Binding Rules", §4 "Maker-Checker Required Actions").
 *
 * Guarded by IAM-02's own internal-identity guard (same as routes/internal.ts) — IAM-02 has no
 * user-session surface of its own this stage (see config.ts / plugins/internal-identity.ts
 * header comments), so the acting user's identity travels as an explicit body field
 * (`maker_user_id` / `approver_user_id`), exactly like `permission/check`'s `actor_id`
 * convention. A future stage that gives IAM-02 real user-session auth would replace this
 * field with an authenticated identity instead of trusting the caller's body — flagged as a
 * judgment call in the implementation report, not something this stage invents new
 * architecture to solve.
 *
 * PAYLOAD HASH: computed via `@aix/foundation`'s `fingerprint()` (packages/foundation/src/
 * idempotency.ts) — it already implements exactly the canonical-JSON + sha256 approach this
 * endpoint needs (sorted-key recursive JSON stringify, `sha256:<hex>` prefix), so it is reused
 * directly rather than re-implemented; `payload_canonicalisation_version` records this choice
 * as a literal string so a future change of algorithm has somewhere to record the version.
 */
import { randomUUID } from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { AppError, fingerprint, publishAudit, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeIam2InternalIdentityGuard } from "../plugins/internal-identity.js";
import { Iam2Error, type Iam2ErrorCode } from "../lib/errors.js";
import { issueDecisionToken } from "../lib/decision-token.js";
import { verifyStepUpAssertion } from "../lib/iam01-client.js";
import { checkApprovalSodConflict } from "../lib/sod.js";
import { lookupCacheVersion } from "../lib/guard.js";
import type { Iam2Config } from "../config.js";

// Must fit iam2.approval_request.payload_canonicalisation_version's varchar(16) column.
const PAYLOAD_CANONICALISATION_VERSION = "fnd-fp-v1";
/** §9 rule requires a purpose-bound IAM-01 assertion; a single generic purpose is used across
 * every approval decision (documented judgment call — see class header + implementation
 * report) rather than one purpose string per action, keeping the operational step-up flow
 * ("call /auth/step-up with purpose=X") simple and uniform for approvers. */
const APPROVAL_STEP_UP_PURPOSE = "iam2_approval";

const CreateApprovalBody = Type.Object(
  {
    maker_user_id: Type.String({ minLength: 1, maxLength: 64 }),
    action: Type.String({ minLength: 1, maxLength: 128 }),
    resource: Type.String({ minLength: 1, maxLength: 64 }),
    entity_id: Type.Optional(Type.String({ maxLength: 64 })),
    client_id: Type.Optional(Type.String({ maxLength: 64 })),
    payload_ref: Type.Optional(Type.String({ maxLength: 128 })),
    // The actual business payload to hash — NEVER a caller-supplied hash (which would let a
    // caller forge a hash that doesn't match the real payload); the server computes it.
    payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

const ApproveBody = Type.Object(
  {
    approver_user_id: Type.String({ minLength: 1, maxLength: 64 }),
    recent_auth_assertion: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
    decision_reason: Type.Optional(Type.String({ maxLength: 512 })),
  },
  { additionalProperties: false },
);

const RejectBody = Type.Object(
  {
    approver_user_id: Type.String({ minLength: 1, maxLength: 64 }),
    decision_reason: Type.Optional(Type.String({ maxLength: 512 })),
  },
  { additionalProperties: false },
);

interface ApprovalPolicyRow {
  policy_id: string;
  required_approval_count: number;
  requires_step_up: boolean;
  expiry_minutes: number;
}

async function lookupPolicy(client: PoolClient, action: string, resource: string): Promise<ApprovalPolicyRow | undefined> {
  const rows = await client.query<ApprovalPolicyRow>(
    `SELECT policy_id, required_approval_count, requires_step_up, expiry_minutes
       FROM iam2.approval_policy
      WHERE action = $1 AND resource = $2 AND status = 'active'
      LIMIT 1`,
    [action, resource],
  );
  return rows.rows[0];
}

interface ApprovalRequestRow {
  approval_id: string;
  policy_id: string | null;
  maker_user_id: string;
  action: string;
  resource: string;
  entity_id: string | null;
  client_id: string | null;
  payload_hash: string | null;
  status: string;
  required_count: number;
  approved_count: number;
  expires_at_utc: string;
}

async function lookupApprovalForUpdate(client: PoolClient, approvalId: string): Promise<ApprovalRequestRow | undefined> {
  const rows = await client.query<ApprovalRequestRow>(
    `SELECT approval_id, policy_id, maker_user_id, action, resource, entity_id, client_id,
            payload_hash, status, required_count, approved_count, expires_at_utc
       FROM iam2.approval_request
      WHERE approval_id = $1
      FOR UPDATE`,
    [approvalId],
  );
  return rows.rows[0];
}

export async function registerApprovalRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeIam2InternalIdentityGuard(app.config.iam2InternalServiceToken);
  const config = app.config as Iam2Config;

  // -----------------------------------------------------------------------------------------
  // POST /iam2/approvals/request
  // -----------------------------------------------------------------------------------------
  app.post(
    "/iam2/approvals/request",
    { preHandler: requireInternal, schema: { body: CreateApprovalBody } },
    async (request, reply) => {
      const body = request.body as {
        maker_user_id: string;
        action: string;
        resource: string;
        entity_id?: string;
        client_id?: string;
        payload_ref?: string;
        payload?: Record<string, unknown>;
      };

      const payloadHash = body.payload !== undefined ? fingerprint(body.payload) : null;

      const result = await withTransaction(async (client) => {
        const policy = await lookupPolicy(client, body.action, body.resource);
        // Sensible default per the brief: single approval, no step-up, 24h expiry.
        const requiredCount = policy?.required_approval_count ?? 1;
        const expiryMinutes = policy?.expiry_minutes ?? 1440;
        const approvalId = "appr_" + randomUUID();
        const expiresAtUtc = new Date(Date.now() + expiryMinutes * 60_000).toISOString();

        await client.query(
          `INSERT INTO iam2.approval_request
             (approval_id, policy_id, maker_user_id, action, resource, entity_id, client_id,
              payload_ref, payload_hash, payload_canonicalisation_version, status,
              required_count, approved_count, expires_at_utc, created_at_utc, correlation_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,0,$12, now(), $13)`,
          [
            approvalId,
            policy?.policy_id ?? null,
            body.maker_user_id,
            body.action,
            body.resource,
            body.entity_id ?? null,
            body.client_id ?? null,
            body.payload_ref ?? null,
            payloadHash,
            payloadHash ? PAYLOAD_CANONICALISATION_VERSION : null,
            requiredCount,
            expiresAtUtc,
            request.ctx.correlation_id,
          ],
        );

        await publishAudit(client, {
          event_type: "iam2.approval_requested",
          source_module: "IAM-02",
          actor_id: body.maker_user_id,
          actor_type: "user",
          entity_type: body.resource,
          entity_id: body.entity_id ?? approvalId,
          metadata: { approval_id: approvalId, action: body.action, required_count: requiredCount },
        });
        if (payloadHash) {
          await publishAudit(client, {
            event_type: "iam2.approval_payload_hash_created",
            source_module: "IAM-02",
            actor_id: body.maker_user_id,
            actor_type: "user",
            entity_type: body.resource,
            entity_id: body.entity_id ?? approvalId,
            metadata: { approval_id: approvalId },
          });
        }

        return { approvalId, requiredCount, expiresAtUtc, payloadHash };
      });

      return reply.send(
        successEnvelope(
          {
            approval_id: result.approvalId,
            status: "pending",
            required_count: result.requiredCount,
            expires_at_utc: result.expiresAtUtc,
            ...(result.payloadHash ? { payload_hash: result.payloadHash } : {}),
          },
          meta(request),
        ),
      );
    },
  );

  // -----------------------------------------------------------------------------------------
  // POST /iam2/approvals/:id/approve
  // -----------------------------------------------------------------------------------------
  app.post(
    "/iam2/approvals/:id/approve",
    { preHandler: requireInternal, schema: { body: ApproveBody } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { approver_user_id: string; recent_auth_assertion?: string; decision_reason?: string };

      // ---------------------------------------------------------------------------------
      // JUDGMENT CALL / BUG FIX — every denial path below that needs to leave a DURABLE
      // audit trail (expiry, self-approval, SoD conflict) RETURNS a structured outcome from
      // this transaction instead of throwing from inside it. `withTransaction` rolls back
      // the ENTIRE transaction on any thrown error — throwing after `publishAudit`/an UPDATE
      // would silently discard exactly the audit row and status change the denial is
      // supposed to leave behind. This mirrors the already-correct pattern in
      // lib/decision-token.ts's `verifyAndConsumeDecisionToken` (returns `{ok:false,...}`;
      // the ROUTE throws only AFTER the transaction has committed) — the Iam2Error is thrown
      // OUTSIDE `withTransaction`, once, based on the returned outcome. Paths with NO prior
      // write in this transaction (not-found, already-decided, missing/invalid step-up
      // assertion, duplicate-decision unique-constraint conflict) have nothing to lose and
      // could throw directly, but are written the same way for consistency/simplicity.
      // ---------------------------------------------------------------------------------
      type ApproveOutcome =
        | { ok: true; status: string; approvedCount: number; requiredCount: number; decisionToken?: string }
        | { ok: false; notFound: true }
        | { ok: false; notFound?: false; code: Iam2ErrorCode };

      const outcome = (await withTransaction(async (client) => {
        const approval = await lookupApprovalForUpdate(client, id);
        if (!approval) return { ok: false, notFound: true } as ApproveOutcome;

        // Expiry check (before self-approval — an expired request is expired regardless of
        // who's looking at it).
        if (approval.status === "pending" && new Date(approval.expires_at_utc).getTime() <= Date.now()) {
          await client.query(`UPDATE iam2.approval_request SET status = 'expired' WHERE approval_id = $1`, [id]);
          await publishAudit(client, {
            event_type: "iam2.approval_expired",
            source_module: "IAM-02",
            actor_id: body.approver_user_id,
            actor_type: "user",
            entity_type: approval.resource,
            entity_id: approval.entity_id ?? id,
            metadata: { approval_id: id },
          });
          return { ok: false, code: "IAM2_APPROVAL_EXPIRED" } as ApproveOutcome;
        }
        if (approval.status !== "pending") {
          return { ok: false, code: "IAM2_APPROVAL_ALREADY_DECIDED" } as ApproveOutcome;
        }

        // Rule 1: approver cannot be maker (Constraint 1 from 006's approval_decision comment —
        // enforced here in application code, exactly as that migration's header comment says).
        if (body.approver_user_id === approval.maker_user_id) {
          await publishAudit(client, {
            event_type: "iam2.self_approval_blocked",
            source_module: "IAM-02",
            actor_id: body.approver_user_id,
            actor_type: "user",
            entity_type: approval.resource,
            entity_id: approval.entity_id ?? id,
            metadata: { approval_id: id },
          });
          return { ok: false, code: "IAM2_SELF_APPROVAL_BLOCKED" } as ApproveOutcome;
        }

        // Rule 3: step-up required where policy says so.
        const policy = approval.policy_id ? await lookupPolicy(client, approval.action, approval.resource) : undefined;
        let stepUpAssertionRef: string | null = null;
        if (policy?.requires_step_up) {
          if (!body.recent_auth_assertion) {
            return { ok: false, code: "IAM2_STEP_UP_INVALID" } as ApproveOutcome;
          }
          const verified = await verifyStepUpAssertion(
            { baseUrl: config.iam01BaseUrl, internalServiceToken: config.iam01InternalServiceToken, fetchImpl: config.iam01FetchImpl },
            { recentAuthAssertion: body.recent_auth_assertion, requiredPurpose: APPROVAL_STEP_UP_PURPOSE },
          );
          if (!verified.valid) {
            return { ok: false, code: "IAM2_STEP_UP_INVALID" } as ApproveOutcome;
          }
          // Reference only (never the raw assertion) — mirrors approval_decision's
          // step_up_assertion_ref column intent.
          stepUpAssertionRef = "verified:" + verified.authLevel;
        }

        // Rule 2: SoD conflict must be checked (approver vs. maker's effective grants —
        // lib/sod.ts's generic cross-check, which is what makes the meta-SoD rule bite here).
        const sod = await checkApprovalSodConflict(client, { makerUserId: approval.maker_user_id, approverUserId: body.approver_user_id });
        const sodCheckId = "sodchk_" + randomUUID();
        await client.query(
          `INSERT INTO iam2.sod_check (sod_check_id, user_id, proposed_ref, result, matched_rules, correlation_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            sodCheckId,
            body.approver_user_id,
            `approval:${id}`,
            sod.blocked ? "block" : "pass",
            JSON.stringify(sod.matchedRuleIds),
            request.ctx.correlation_id,
          ],
        );
        if (sod.blocked) {
          await client.query(`UPDATE iam2.approval_request SET status = 'blocked' WHERE approval_id = $1`, [id]);
          await publishAudit(client, {
            event_type: "iam2.sod_conflict_detected",
            source_module: "IAM-02",
            actor_id: body.approver_user_id,
            actor_type: "user",
            entity_type: approval.resource,
            entity_id: approval.entity_id ?? id,
            metadata: { approval_id: id, sod_check_id: sodCheckId, matched_rules: sod.matchedRuleIds },
          });
          return { ok: false, code: "IAM2_SOD_CONFLICT" } as ApproveOutcome;
        }

        // Rule 4 (already checked above): expiry. Insert the decision — the DB's own UNIQUE
        // (approval_id, approver_user_id) constraint is the backstop against a duplicate
        // decision from the same approver; catch it as a clean error, not a crash.
        const decisionId = "apprdec_" + randomUUID();
        try {
          await client.query(
            `INSERT INTO iam2.approval_decision
               (decision_id, approval_id, approver_user_id, decision, decision_reason,
                step_up_assertion_ref, sod_check_id, correlation_id)
             VALUES ($1,$2,$3,'approve',$4,$5,$6,$7)`,
            [decisionId, id, body.approver_user_id, body.decision_reason ?? null, stepUpAssertionRef, sodCheckId, request.ctx.correlation_id],
          );
        } catch (err) {
          const pgErr = err as { code?: string };
          if (pgErr.code === "23505") {
            return { ok: false, code: "IAM2_APPROVAL_ALREADY_DECIDED" } as ApproveOutcome;
          }
          throw err;
        }

        // Atomic increment — avoids a non-atomic read-then-write race.
        const incremented = await client.query<{ approved_count: number; required_count: number }>(
          `UPDATE iam2.approval_request
              SET approved_count = approved_count + 1
            WHERE approval_id = $1 AND status = 'pending'
          RETURNING approved_count, required_count`,
          [id],
        );
        const approvedCount = incremented.rows[0]?.approved_count ?? approval.approved_count + 1;
        const requiredCount = incremented.rows[0]?.required_count ?? approval.required_count;

        await publishAudit(client, {
          event_type: "iam2.approval_approved",
          source_module: "IAM-02",
          actor_id: body.approver_user_id,
          actor_type: "user",
          entity_type: approval.resource,
          entity_id: approval.entity_id ?? id,
          metadata: { approval_id: id, approved_count: approvedCount, required_count: requiredCount },
        });

        let decisionToken: string | undefined;
        let finalStatus = "pending";
        if (approvedCount >= requiredCount) {
          await client.query(
            `UPDATE iam2.approval_request SET status = 'approved', completed_at_utc = now() WHERE approval_id = $1`,
            [id],
          );
          finalStatus = "approved";
          // F1 fix — an approval-issued decision token MUST be bound to a real payload hash.
          // Before this fix, an approval created with no `payload` (payload_hash = null) still
          // minted a token, and verifyAndConsumeDecisionToken's payload-hash check passed
          // trivially on null == null — producing a pure single-use bearer token unbound to
          // ANY specific execution (redeemable for any action/entity/actor once the F1 binding
          // check is also in place, this alone wouldn't be exploitable, but a null-payload
          // token is still a token bound to nothing worth verifying). A procedural approval
          // with no business payload is still a LEGITIMATE outcome (e.g. an approval whose
          // action genuinely has nothing to hash) — it simply mints no redeemable token; the
          // caller gets `status: 'approved'` with no `decision_token` field at all, never a
          // rejected approval.
          if (approval.payload_hash !== null) {
            const cacheVersion = await lookupCacheVersion(client, approval.maker_user_id);
            const issued = await issueDecisionToken(client, {
              actorUserId: approval.maker_user_id,
              action: approval.action,
              resource: approval.resource,
              entityId: approval.entity_id,
              clientId: approval.client_id,
              payloadHash: approval.payload_hash,
              approvalId: id,
              stepUpAssertionRef,
              cacheVersion,
            });
            decisionToken = issued.rawToken;
          }
        }

        return { ok: true, status: finalStatus, approvedCount, requiredCount, decisionToken } as ApproveOutcome;
      })) as ApproveOutcome;

      if (!outcome.ok) {
        if (outcome.notFound) throw new AppError("NOT_FOUND");
        throw new Iam2Error(outcome.code);
      }

      return reply.send(
        successEnvelope(
          {
            approval_id: id,
            status: outcome.status,
            approved_count: outcome.approvedCount,
            required_count: outcome.requiredCount,
            ...(outcome.decisionToken ? { decision_token: outcome.decisionToken } : {}),
          },
          meta(request),
        ),
      );
    },
  );

  // -----------------------------------------------------------------------------------------
  // POST /iam2/approvals/:id/reject
  // -----------------------------------------------------------------------------------------
  app.post(
    "/iam2/approvals/:id/reject",
    { preHandler: requireInternal, schema: { body: RejectBody } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { approver_user_id: string; decision_reason?: string };

      // Same discipline as the approve handler above (see its JUDGMENT CALL / BUG FIX
      // comment): any denial path that leaves a durable write behind (the expiry UPDATE)
      // must be returned as a structured outcome, not thrown from inside `withTransaction` —
      // a thrown error rolls back the whole transaction, silently discarding that write.
      type RejectOutcome =
        | { ok: true }
        | { ok: false; notFound: true }
        | { ok: false; notFound?: false; code: Iam2ErrorCode };

      const outcome = (await withTransaction(async (client) => {
        const approval = await lookupApprovalForUpdate(client, id);
        if (!approval) return { ok: false, notFound: true } as RejectOutcome;
        if (approval.status === "pending" && new Date(approval.expires_at_utc).getTime() <= Date.now()) {
          await client.query(`UPDATE iam2.approval_request SET status = 'expired' WHERE approval_id = $1`, [id]);
          return { ok: false, code: "IAM2_APPROVAL_EXPIRED" } as RejectOutcome;
        }
        if (approval.status !== "pending") {
          return { ok: false, code: "IAM2_APPROVAL_ALREADY_DECIDED" } as RejectOutcome;
        }

        const decisionId = "apprdec_" + randomUUID();
        try {
          await client.query(
            `INSERT INTO iam2.approval_decision (decision_id, approval_id, approver_user_id, decision, decision_reason, correlation_id)
             VALUES ($1,$2,$3,'reject',$4,$5)`,
            [decisionId, id, body.approver_user_id, body.decision_reason ?? null, request.ctx.correlation_id],
          );
        } catch (err) {
          const pgErr = err as { code?: string };
          if (pgErr.code === "23505") return { ok: false, code: "IAM2_APPROVAL_ALREADY_DECIDED" } as RejectOutcome;
          throw err;
        }

        await client.query(
          `UPDATE iam2.approval_request SET status = 'rejected', completed_at_utc = now() WHERE approval_id = $1`,
          [id],
        );
        await publishAudit(client, {
          event_type: "iam2.approval_rejected",
          source_module: "IAM-02",
          actor_id: body.approver_user_id,
          actor_type: "user",
          entity_type: approval.resource,
          entity_id: approval.entity_id ?? id,
          metadata: { approval_id: id },
        });

        return { ok: true } as RejectOutcome;
      })) as RejectOutcome;

      if (!outcome.ok) {
        if (outcome.notFound) throw new AppError("NOT_FOUND");
        throw new Iam2Error(outcome.code);
      }

      return reply.send(successEnvelope({ approval_id: id, status: "rejected" }, meta(request)));
    },
  );
}
