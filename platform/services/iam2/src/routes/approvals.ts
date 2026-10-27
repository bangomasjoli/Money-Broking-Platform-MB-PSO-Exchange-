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
 * architecture to solve. (Carry-forward L3 — NOT remediated by IAM02-AUTHZ-REM-001; see below.)
 *
 * PAYLOAD HASH: computed via `@aix/foundation`'s `fingerprint()` (packages/foundation/src/
 * idempotency.ts) — it already implements exactly the canonical-JSON + sha256 approach this
 * endpoint needs (sorted-key recursive JSON stringify, `sha256:<hex>` prefix), so it is reused
 * directly rather than re-implemented; `payload_canonicalisation_version` records this choice
 * as a literal string so a future change of algorithm has somewhere to record the version.
 *
 * ---------------------------------------------------------------------------------------
 * IAM02-AUTHZ-REM-001 (AZ-01 … AZ-09, AZ-16 … AZ-18) — what changed in this file
 * ---------------------------------------------------------------------------------------
 *  - CREATE: the maker needs `iam2.approval.create` AND the UNDERLYING permission for the
 *    requested `action` (C-2 B: approval is additional to, never a replacement for, the
 *    grant), `resource` must equal the registered permission's resource, exactly one ACTIVE
 *    policy must govern (absent => fail closed, C-6), a policy whose true count is greater
 *    than 1 is refused without lowering it (AZ-18), and the policy's step-up / checker roles /
 *    threshold type are SNAPSHOTTED onto the request (C-5; immutable via migration 072).
 *  - APPROVE: the approver's IAM-01 assertion — purpose `iam2_approval:<approval_id>` (C-4),
 *    belonging to the approver, fresh, held by a live ACTIVE staff/admin identity (OD-1
 *    Option A) — is verified BEFORE the transaction/row lock opens; step-up is UNCONDITIONAL
 *    (no policy/snapshot value can relax it). Inside the transaction: the approver needs
 *    `iam2.approval.approve` through `evaluatePermissionWithStepUp`, the request must carry a
 *    snapshot and a non-`revoked` pinned policy, the snapshot's required checker roles are
 *    enforced, the maker's underlying entitlement is re-checked live, then SoD, then the
 *    decision is inserted inside a SAVEPOINT (lib/approval-decision.ts).
 *  - REJECT: needs `iam2.approval.reject`; a non-maker must meet the snapshot's checker roles
 *    where configured; the maker may reject their own request, audited with `self_reject`.
 *    Reject never issues a token and never changes `approved_count` (D-3).
 *  - Every denial returns a structured outcome from the transaction (so its evidence COMMITS)
 *    and the Iam2Error is thrown once, after commit.
 *
 * NOT remediated here (plan §4B): caller-asserted actor identity (L3) for makers, rejecters
 * and every non-approver; account status of makers/rejecters (R-1); CFG-01 capability gates
 * (R-3). The rejection path takes no assertion, so no IAM-01 eligibility check applies to it.
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
import {
  approvalStepUpPurpose,
  verifyApproverStepUp,
  type ApproverEligibilityFailureCode,
  type VerifyApproverStepUpResult,
} from "../lib/iam01-client.js";
import { checkApprovalSodConflict, lookupActiveRoleCodes } from "../lib/sod.js";
import {
  evaluateEntitlement,
  evaluatePermission,
  evaluatePermissionWithStepUp,
  lookupCacheVersion,
  type PermissionCheckResult,
} from "../lib/guard.js";
import { insertApprovalDecision } from "../lib/approval-decision.js";
import type { Iam2Config } from "../config.js";

// Must fit iam2.approval_request.payload_canonicalisation_version's varchar(16) column.
const PAYLOAD_CANONICALISATION_VERSION = "fnd-fp-v1";

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
  required_approver_roles: unknown;
  threshold_type: string;
}

/** C-6 / AZ-01: every ACTIVE policy for the pair (the unique index in 072 allows at most one;
 * the caller still fails closed on anything other than exactly one). */
async function lookupActivePolicies(client: PoolClient, action: string, resource: string): Promise<ApprovalPolicyRow[]> {
  const rows = await client.query<ApprovalPolicyRow>(
    `SELECT policy_id, required_approval_count, requires_step_up, expiry_minutes,
            required_approver_roles, threshold_type
       FROM iam2.approval_policy
      WHERE action = $1 AND resource = $2 AND status = 'active'
      LIMIT 2`,
    [action, resource],
  );
  return rows.rows;
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
  snapshot_taken_at_utc: string | null;
  snapshot_requires_step_up: boolean | null;
  snapshot_required_approver_roles: unknown;
}

async function lookupApprovalForUpdate(client: PoolClient, approvalId: string): Promise<ApprovalRequestRow | undefined> {
  const rows = await client.query<ApprovalRequestRow>(
    `SELECT approval_id, policy_id, maker_user_id, action, resource, entity_id, client_id,
            payload_hash, status, required_count, approved_count, expires_at_utc,
            snapshot_taken_at_utc, snapshot_requires_step_up, snapshot_required_approver_roles
       FROM iam2.approval_request
      WHERE approval_id = $1
      FOR UPDATE`,
    [approvalId],
  );
  return rows.rows[0];
}

/** RLS scope for the next `iam2.user_role` / `iam2.user_permission_override` read. */
async function scopeTo(client: PoolClient, userId: string): Promise<void> {
  await client.query("SELECT set_config('aix.user_id', $1, true)", [userId]);
}

function stringRoleList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((v) => typeof v === "string") ? (value as string[]) : null;
}

/** Maps a blocking guard answer to the structured error the route throws after commit. */
function guardDenialCode(result: PermissionCheckResult): Iam2ErrorCode {
  switch (result.reason) {
    case "IAM2_PERMISSION_UNKNOWN":
      return "IAM2_PERMISSION_UNKNOWN";
    case "IAM2_LICENCE_LOCKED_PERMISSION":
      return "IAM2_LICENCE_LOCKED_PERMISSION";
    case "IAM2_STEP_UP_REQUIRED":
      return "IAM2_STEP_UP_REQUIRED";
    case "IAM2_APPROVAL_REQUIRED":
      return "IAM2_APPROVAL_REQUIRED";
    default:
      return "IAM2_PERMISSION_DENIED";
  }
}

async function auditDenial(
  client: PoolClient,
  eventType: string,
  actorId: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await publishAudit(client, {
    event_type: eventType,
    source_module: "IAM-02",
    actor_id: actorId,
    actor_type: "user",
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

type Denial = { ok: false; code: Iam2ErrorCode };

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

      type CreateOutcome =
        | { ok: true; approvalId: string; requiredCount: number; expiresAtUtc: string }
        | Denial;

      const outcome = (await withTransaction(async (client): Promise<CreateOutcome> => {
        const entityForLog = body.entity_id ?? body.action;
        await scopeTo(client, body.maker_user_id);

        // AZ-04: the maker may create approval requests at all.
        const createGuard = await evaluatePermission(client, {
          actorId: body.maker_user_id,
          action: "iam2.approval.create",
          resource: "approval",
          ...(body.entity_id !== undefined ? { entityId: body.entity_id } : {}),
        });
        if (createGuard.decision !== "allow") return { ok: false, code: guardDenialCode(createGuard) };

        // AZ-01 / C-2 B / Q1: ... AND holds the UNDERLYING permission for the action.
        await scopeTo(client, body.maker_user_id);
        const entitlement = await evaluateEntitlement(client, {
          actorId: body.maker_user_id,
          action: body.action,
          resource: body.resource,
          ...(body.entity_id !== undefined ? { entityId: body.entity_id } : {}),
          ...(body.client_id !== undefined ? { clientId: body.client_id } : {}),
        });
        if (entitlement.result.decision !== "allow") {
          return { ok: false, code: guardDenialCode(entitlement.result) };
        }

        // AZ-01: the request's resource must equal the registered permission's resource.
        const registered = await client.query<{ resource: string }>(
          `SELECT resource FROM iam2.permission WHERE permission_code = $1 AND status = 'active'`,
          [body.action],
        );
        if (registered.rows[0]?.resource !== body.resource) {
          await auditDenial(client, "iam2.approval_request_denied", body.maker_user_id, body.resource, entityForLog, {
            action: body.action,
            reason: "resource_mismatch",
          });
          return { ok: false, code: "IAM2_APPROVAL_RESOURCE_MISMATCH" };
        }

        // C-6: exactly one ACTIVE policy; an absent (or ambiguous / malformed) policy fails
        // closed — never silently treated as single-approval / no step-up / 24h.
        const policies = await lookupActivePolicies(client, body.action, body.resource);
        const policy = policies.length === 1 ? policies[0]! : undefined;
        const roles = policy ? stringRoleList(policy.required_approver_roles) : null;
        if (
          !policy ||
          roles === null ||
          !Number.isInteger(policy.required_approval_count) ||
          policy.required_approval_count < 1 ||
          !Number.isInteger(policy.expiry_minutes) ||
          policy.expiry_minutes < 1
        ) {
          await auditDenial(client, "iam2.approval_request_denied", body.maker_user_id, body.resource, entityForLog, {
            action: body.action,
            reason: policies.length === 0 ? "policy_missing" : "policy_ambiguous_or_malformed",
          });
          return { ok: false, code: "IAM2_APPROVAL_POLICY_MISSING" };
        }

        // AZ-18 / D-4: multi-approver activation is gated. The TRUE required count stays on the
        // policy; the request is refused (no row is written) — never lowered to one.
        if (policy.required_approval_count > 1) {
          await auditDenial(client, "iam2.approval_request_denied", body.maker_user_id, body.resource, entityForLog, {
            action: body.action,
            reason: "multi_approver_required_not_supported",
            required_approval_count: policy.required_approval_count,
          });
          return { ok: false, code: "IAM2_APPROVAL_MULTI_APPROVER_UNSUPPORTED" };
        }

        const requiredCount = policy.required_approval_count;
        const approvalId = "appr_" + randomUUID();
        const expiresAtUtc = new Date(Date.now() + policy.expiry_minutes * 60_000).toISOString();

        // C-5: SNAPSHOT of the security requirements in force at creation (immutable, 072).
        await client.query(
          `INSERT INTO iam2.approval_request
             (approval_id, policy_id, maker_user_id, action, resource, entity_id, client_id,
              payload_ref, payload_hash, payload_canonicalisation_version, status,
              required_count, approved_count, expires_at_utc, created_at_utc, correlation_id,
              snapshot_taken_at_utc, snapshot_requires_step_up, snapshot_required_approver_roles,
              snapshot_threshold_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,0,$12, now(), $13,
                   now(), $14, $15::jsonb, $16)`,
          [
            approvalId,
            policy.policy_id,
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
            policy.requires_step_up,
            JSON.stringify(roles),
            policy.threshold_type,
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

        return { ok: true, approvalId, requiredCount, expiresAtUtc };
      })) as CreateOutcome;

      if (!outcome.ok) throw new Iam2Error(outcome.code);

      return reply.send(
        successEnvelope(
          {
            approval_id: outcome.approvalId,
            status: "pending",
            required_count: outcome.requiredCount,
            expires_at_utc: outcome.expiresAtUtc,
            ...(payloadHash ? { payload_hash: payloadHash } : {}),
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
      // audit trail (expiry, self-approval, SoD conflict, and every IAM02-AUTHZ-REM-001
      // control) RETURNS a structured outcome from this transaction instead of throwing from
      // inside it. `withTransaction` rolls back the ENTIRE transaction on any thrown error —
      // throwing after `publishAudit`/an UPDATE would silently discard exactly the audit row
      // and status change the denial is supposed to leave behind. This mirrors the already-
      // correct pattern in lib/decision-token.ts — the Iam2Error is thrown OUTSIDE
      // `withTransaction`, once, based on the returned outcome.
      // ---------------------------------------------------------------------------------
      type ApproveOutcome =
        | { ok: true; status: string; approvedCount: number; requiredCount: number; decisionToken?: string }
        | { ok: false; notFound: true }
        | { ok: false; notFound?: false; code: Iam2ErrorCode };

      // AZ-05 / AZ-16: verify the approver's purpose-bound assertion BEFORE the transaction
      // (and therefore before the request row lock) opens: a slow or unavailable IAM-01 must
      // never hold `FOR UPDATE`. Step-up is UNCONDITIONAL — it does not depend on the policy,
      // the snapshot or any caller-supplied value.
      let stepUp: VerifyApproverStepUpResult;
      if (!body.recent_auth_assertion) {
        stepUp = { ok: false, code: "IAM2_STEP_UP_INVALID", reason: "assertion_missing" };
      } else {
        stepUp = await verifyApproverStepUp(
          { baseUrl: config.iam01BaseUrl, internalServiceToken: config.iam01InternalServiceToken, fetchImpl: config.iam01FetchImpl },
          { recentAuthAssertion: body.recent_auth_assertion, approverUserId: body.approver_user_id, approvalId: id },
        );
      }

      const outcome = (await withTransaction(async (client): Promise<ApproveOutcome> => {
        // AZ-04 / AZ-05: the approver must hold `iam2.approval.approve`, with step-up satisfied
        // only by unforgeable evidence bound to THIS approver and THIS approval. The guard
        // answer is evaluated before any request state is read, so an unentitled caller
        // learns nothing about the request. Evaluated even when step-up already failed, so the
        // denial leaves the standard decision-log / audit evidence.
        await scopeTo(client, body.approver_user_id);
        const guard = await evaluatePermissionWithStepUp(
          client,
          { actorId: body.approver_user_id, action: "iam2.approval.approve", resource: "approval", entityId: id },
          stepUp.ok ? { evidence: stepUp.stepUp, expectedPurpose: approvalStepUpPurpose(id) } : undefined,
        );

        if (!stepUp.ok) {
          const failureCode: ApproverEligibilityFailureCode = stepUp.code;
          if (failureCode === "IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED") {
            await auditDenial(client, "iam2.service_account_approver_blocked", body.approver_user_id, "approval", id, {
              approval_id: id,
              reason: stepUp.reason,
              severity: "critical",
            });
          } else if (failureCode === "IAM2_APPROVER_NOT_ELIGIBLE") {
            await auditDenial(client, "iam2.approver_not_eligible", body.approver_user_id, "approval", id, {
              approval_id: id,
              reason: stepUp.reason,
            });
          }
          return { ok: false, code: failureCode };
        }
        if (guard.decision !== "allow") return { ok: false, code: guardDenialCode(guard) };

        const approval = await lookupApprovalForUpdate(client, id);
        if (!approval) return { ok: false, notFound: true };

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
          return { ok: false, code: "IAM2_APPROVAL_EXPIRED" };
        }
        if (approval.status !== "pending") {
          return { ok: false, code: "IAM2_APPROVAL_ALREADY_DECIDED" };
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
          return { ok: false, code: "IAM2_SELF_APPROVAL_BLOCKED" };
        }

        // C-5 / AZ-06: a LEGACY request (pre-072) carries no snapshot and is refused.
        if (approval.snapshot_taken_at_utc === null || approval.policy_id === null) {
          await auditDenial(client, "iam2.approval_request_denied", body.approver_user_id, approval.resource, approval.entity_id ?? id, {
            approval_id: id,
            reason: "snapshot_missing_legacy_request",
          });
          return { ok: false, code: "IAM2_APPROVAL_SNAPSHOT_MISSING" };
        }

        // D-2 / AZ-17: an emergency-REVOKED pinned policy blocks the pending approval. A
        // retired (`inactive`) policy does not: the snapshot governs, subject to the live
        // entitlement / deny / lock / revocation checks below.
        const policyStatus = await client.query<{ status: string }>(
          `SELECT status FROM iam2.approval_policy WHERE policy_id = $1`,
          [approval.policy_id],
        );
        if (!policyStatus.rows[0] || policyStatus.rows[0].status === "revoked") {
          await auditDenial(client, "iam2.approval_policy_revoked_blocked", body.approver_user_id, approval.resource, approval.entity_id ?? id, {
            approval_id: id,
            policy_id: approval.policy_id,
          });
          return { ok: false, code: "IAM2_APPROVAL_POLICY_REVOKED" };
        }

        // AZ-18: only single-approver requests are decidable; never lower a true count.
        if (approval.required_count !== 1) {
          await auditDenial(client, "iam2.approval_request_denied", body.approver_user_id, approval.resource, approval.entity_id ?? id, {
            approval_id: id,
            reason: "multi_approver_required_not_supported",
            required_count: approval.required_count,
          });
          return { ok: false, code: "IAM2_APPROVAL_MULTI_APPROVER_UNSUPPORTED" };
        }

        // AZ-07 / C-8: the approver must hold one of the snapshot's required checker roles
        // (when the list is non-empty). Malformed snapshot roles fail closed.
        const requiredRoles = stringRoleList(approval.snapshot_required_approver_roles);
        if (requiredRoles === null) {
          await auditDenial(client, "iam2.approver_not_eligible", body.approver_user_id, approval.resource, approval.entity_id ?? id, {
            approval_id: id,
            reason: "snapshot_roles_malformed",
          });
          return { ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE" };
        }
        if (requiredRoles.length > 0) {
          const held = await lookupActiveRoleCodes(client, body.approver_user_id);
          if (!requiredRoles.some((r) => held.has(r))) {
            await auditDenial(client, "iam2.approver_not_eligible", body.approver_user_id, approval.resource, approval.entity_id ?? id, {
              approval_id: id,
              reason: "required_checker_role_missing",
            });
            return { ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE" };
          }
        }

        // AZ-02 / C-2 B / Q1: the MAKER's underlying entitlement is re-evaluated live at
        // approval time too, so a revoked grant / new deny override / lock blocks a pending
        // approval before a token is ever minted. (Maker ACCOUNT STATUS is not checked: R-1.)
        await scopeTo(client, approval.maker_user_id);
        const makerEntitlement = await evaluateEntitlement(client, {
          actorId: approval.maker_user_id,
          action: approval.action,
          resource: approval.resource,
          ...(approval.entity_id !== null ? { entityId: approval.entity_id } : {}),
          ...(approval.client_id !== null ? { clientId: approval.client_id } : {}),
        });
        if (makerEntitlement.result.decision !== "allow") {
          return { ok: false, code: guardDenialCode(makerEntitlement.result) };
        }

        // Reference only (never the raw assertion) — mirrors approval_decision's
        // step_up_assertion_ref column intent.
        const stepUpAssertionRef = "verified:" + stepUp.authLevel;

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
          return { ok: false, code: "IAM2_SOD_CONFLICT" };
        }

        // Rule 4 (already checked above): expiry. Insert the decision inside a SAVEPOINT — the
        // DB's own UNIQUE (approval_id, approver_user_id) constraint is the backstop against a
        // duplicate decision from the same approver, and the SAVEPOINT keeps the same-
        // transaction evidence (guard decision log, sod_check, audit) from being discarded.
        const inserted = await insertApprovalDecision(client, {
          decisionId: "apprdec_" + randomUUID(),
          approvalId: id,
          approverUserId: body.approver_user_id,
          decision: "approve",
          decisionReason: body.decision_reason ?? null,
          stepUpAssertionRef,
          sodCheckId,
          correlationId: request.ctx.correlation_id,
        });
        if (inserted === "duplicate") return { ok: false, code: "IAM2_APPROVAL_ALREADY_DECIDED" };

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
          // ANY specific execution. A procedural approval with no business payload is still a
          // LEGITIMATE outcome — it simply mints no redeemable token; the caller gets
          // `status: 'approved'` with no `decision_token` field at all, never a rejected
          // approval.
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

        return { ok: true, status: finalStatus, approvedCount, requiredCount, ...(decisionToken ? { decisionToken } : {}) };
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
      // comment): any denial path that leaves a durable write behind (the expiry UPDATE, the
      // guard decision log) must be returned as a structured outcome, not thrown from inside
      // `withTransaction` — a thrown error rolls back the whole transaction.
      type RejectOutcome =
        | { ok: true; selfReject: boolean }
        | { ok: false; notFound: true }
        | { ok: false; notFound?: false; code: Iam2ErrorCode };

      const outcome = (await withTransaction(async (client): Promise<RejectOutcome> => {
        // AZ-04 / D-3: EVERY rejecter needs `iam2.approval.reject`.
        await scopeTo(client, body.approver_user_id);
        const guard = await evaluatePermission(client, {
          actorId: body.approver_user_id,
          action: "iam2.approval.reject",
          resource: "approval",
          entityId: id,
        });
        if (guard.decision !== "allow") return { ok: false, code: guardDenialCode(guard) };

        const approval = await lookupApprovalForUpdate(client, id);
        if (!approval) return { ok: false, notFound: true };
        if (approval.status === "pending" && new Date(approval.expires_at_utc).getTime() <= Date.now()) {
          await client.query(`UPDATE iam2.approval_request SET status = 'expired' WHERE approval_id = $1`, [id]);
          return { ok: false, code: "IAM2_APPROVAL_EXPIRED" };
        }
        if (approval.status !== "pending") {
          return { ok: false, code: "IAM2_APPROVAL_ALREADY_DECIDED" };
        }

        // D-3 / C-9 / AZ-08: controlled ASYMMETRIC rejection. The maker may reject their own
        // request (audited with `self_reject`); a non-maker must meet the snapshot's required
        // checker roles where configured. Reject never strengthens an approval: no token, no
        // `approved_count` change, no new step-up or SoD obligation.
        const selfReject = body.approver_user_id === approval.maker_user_id;
        if (!selfReject && approval.snapshot_taken_at_utc !== null) {
          const requiredRoles = stringRoleList(approval.snapshot_required_approver_roles);
          let eligible = requiredRoles !== null;
          if (requiredRoles !== null && requiredRoles.length > 0) {
            const held = await lookupActiveRoleCodes(client, body.approver_user_id);
            eligible = requiredRoles.some((r) => held.has(r));
          }
          if (!eligible) {
            await auditDenial(client, "iam2.approver_not_eligible", body.approver_user_id, approval.resource, approval.entity_id ?? id, {
              approval_id: id,
              reason: requiredRoles === null ? "snapshot_roles_malformed" : "required_checker_role_missing",
              operation: "reject",
            });
            return { ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE" };
          }
        }

        const inserted = await insertApprovalDecision(client, {
          decisionId: "apprdec_" + randomUUID(),
          approvalId: id,
          approverUserId: body.approver_user_id,
          decision: "reject",
          decisionReason: body.decision_reason ?? null,
          stepUpAssertionRef: null,
          sodCheckId: null,
          correlationId: request.ctx.correlation_id,
        });
        if (inserted === "duplicate") return { ok: false, code: "IAM2_APPROVAL_ALREADY_DECIDED" };

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
          metadata: { approval_id: id, self_reject: selfReject },
        });

        return { ok: true, selfReject };
      })) as RejectOutcome;

      if (!outcome.ok) {
        if (outcome.notFound) throw new AppError("NOT_FOUND");
        throw new Iam2Error(outcome.code);
      }

      return reply.send(successEnvelope({ approval_id: id, status: "rejected" }, meta(request)));
    },
  );
}
