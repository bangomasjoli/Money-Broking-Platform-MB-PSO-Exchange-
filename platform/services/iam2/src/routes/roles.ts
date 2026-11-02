/**
 * IAM-02 Phase 4 — `POST /iam2/users/{user_id}/roles` (assign role to user).
 * `04_API_Specification.md` §3.6 "Requires SoD check, approval, and step-up where privileged."
 *
 * ---------------------------------------------------------------------------------------
 * DESIGN — why this endpoint takes an (optional) `decision_token`, not just a role_code.
 * ---------------------------------------------------------------------------------------
 * The seeded `iam2.role.assign_user` permission has `requires_step_up = true` AND
 * `requires_approval = true` (006's seed data). `evaluatePermission`'s steps 6/7 are
 * UNCONDITIONAL flag checks (Phase 2 design, unchanged this stage) — they never resolve to
 * "allow" for this permission code no matter who calls it, because nothing in
 * `evaluatePermission` tracks "this actor already completed step-up/approval for this call".
 * That tracking mechanism is exactly what Phase 3's approval + decision-token flow IS: an
 * actor who wants to assign a role first calls `POST /iam2/approvals/request` (action =
 * `iam2.role.assign_user`, entity_id = the target user), gets it approved (step-up verified
 * inside that approve flow), receives a `decision_token`, and THEN calls this endpoint bearing
 * that token — mirroring exactly how any other protected action on the platform would
 * integrate with the guard + execute-verify pattern.
 *
 * So this endpoint's real behaviour is two-tiered, per the task brief's own instruction
 * ("this endpoint should itself call evaluatePermission ... and if the guard says
 * approval_required/step_up_required, return that rather than performing the assignment"):
 *   - NO `decision_token` supplied: call the guard (dogfooding — also produces the standard
 *     permission_decision_log/audit trail), and return whatever it says (which will be
 *     `step_up_required`, per the paragraph above) WITHOUT touching `iam2.user_role`. This is
 *     the literal behaviour the brief describes.
 *   - `decision_token` supplied: verify it (same binding logic execute-verify uses) as proof
 *     that steps 6/7 have already been satisfied via the approval flow, THEN run the SoD
 *     check (Phase 4) and perform the assignment.
 * This is what makes the "SoD conflict blocks role assignment" test reachable in this stage's
 * design — flagged explicitly as a judgment call for the product owner / an Opus review.
 *
 * ---------------------------------------------------------------------------------------
 * F1 FIX — a role-assignment approval is expected to carry a `payload`.
 * ---------------------------------------------------------------------------------------
 * `routes/approvals.ts` now refuses to mint a decision_token for an approval whose
 * `payload_hash` is null (a null-payload approval-issued token would be a bearer credential
 * bound to nothing worth verifying). Since THIS endpoint's only path to a real assignment
 * requires a decision_token, the caller of `POST /iam2/approvals/request` for an
 * `iam2.role.assign_user` action MUST supply a `payload` — e.g. `{ role_code, target_user_id }`
 * (the actual role being granted, to the actual target) — so the resulting approval has a
 * non-null `payload_hash` and actually mints a redeemable token. This has a second, deliberate
 * benefit beyond "a token exists at all": the payload-hash binding now also protects the
 * SPECIFIC role code being granted — a token minted to authorise granting role X can no longer
 * be replayed against this endpoint to grant role Y.
 *
 * D7-01 CORRECTION — that protection only held if the CALLER's `current_payload_hash` was honest:
 * it was compared as given, so presenting role X's approved hash while asking for role Y assigned
 * Y. The server now DERIVES `fingerprint({ role_code, target_user_id })` from the role and target
 * it is actually about to assign and compares THAT to the token's bound hash. `current_payload_hash`
 * is optional and, when supplied, must equal the server-derived value (otherwise the token is
 * revoked and a Critical `iam2.approval_payload_hash_mismatch` audit is committed).
 */
import { randomUUID } from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { fingerprint, publishAudit, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeIam2InternalIdentityGuard } from "../plugins/internal-identity.js";
import { Iam2Error, type Iam2ErrorCode } from "../lib/errors.js";
import { evaluatePermission } from "../lib/guard.js";
import { verifyAndConsumeForExecution } from "../lib/decision-token.js";
import { checkRoleAssignmentSodConflict } from "../lib/sod.js";
import { bumpCacheVersion } from "../lib/cache-version.js";

const AssignRoleBody = Type.Object(
  {
    acting_admin_user_id: Type.String({ minLength: 1, maxLength: 64 }),
    role_code: Type.String({ minLength: 1, maxLength: 64 }),
    decision_token: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
    approval_id: Type.Optional(Type.String({ maxLength: 64 })),
    current_payload_hash: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  },
  { additionalProperties: false },
);

interface RoleRow {
  role_id: string;
  role_code: string;
}

export async function registerRoleRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeIam2InternalIdentityGuard(app.config.iam2InternalServiceToken);

  app.post(
    "/iam2/users/:user_id/roles",
    { preHandler: requireInternal, schema: { body: AssignRoleBody } },
    async (request, reply) => {
      const { user_id: targetUserId } = request.params as { user_id: string };
      const body = request.body as {
        acting_admin_user_id: string;
        role_code: string;
        decision_token?: string;
        approval_id?: string;
        current_payload_hash?: string;
      };

      // ---------------------------------------------------------------------------------
      // JUDGMENT CALL / BUG FIX — same discipline as routes/approvals.ts's approve handler:
      // any denial path that leaves a DURABLE write behind (the SoD-block sod_check row +
      // its Critical audit; also verifyAndConsumeDecisionToken's OWN writes on a mismatch/
      // stale outcome, since it shares THIS transaction's client) must be returned as a
      // structured outcome, never thrown from inside `withTransaction` — a thrown error
      // rolls back the WHOLE transaction, silently discarding those writes. Only
      // IAM2_ROLE_UNKNOWN (nothing written yet at that point) is safe to throw directly, but
      // is written the same way for consistency.
      // ---------------------------------------------------------------------------------
      type RoleAssignOutcome =
        | { performed: true }
        | { performed: false; guardResult: Awaited<ReturnType<typeof evaluatePermission>> }
        | { performed: false; errorCode: Iam2ErrorCode };

      const outcome: RoleAssignOutcome = await withTransaction(async (client) => {
        const roleRows = await client.query<RoleRow>(
          `SELECT role_id, role_code FROM iam2.role WHERE role_code = $1 AND status = 'active'`,
          [body.role_code],
        );
        const role = roleRows.rows[0];
        if (!role) {
          return { performed: false, errorCode: "IAM2_ROLE_UNKNOWN" };
        }

        // Dogfood the guard for the ACTING ADMIN's own permission to perform this action —
        // always run (produces the standard decision-log/audit trail) regardless of whether
        // a decision_token is also supplied.
        await client.query("SELECT set_config('aix.user_id', $1, true)", [body.acting_admin_user_id]);
        const guardResult = await evaluatePermission(client, {
          actorId: body.acting_admin_user_id,
          action: "iam2.role.assign_user",
          resource: "role",
          entityId: targetUserId,
        });

        if (!body.decision_token) {
          // No proof of a completed approval+step-up flow — return the guard's decision
          // rather than performing the assignment (see class header comment).
          return { performed: false, guardResult };
        }

        // IAM02-AUTHZ-REM-001 (AZ-03, F01 / R1 / N3): the token is NOT a substitute for the
        // acting admin's own entitlement. The central execution wrapper — the same one
        // `execute-verify` uses — binds the token (actor/action/resource/entity/payload and,
        // when the caller presents one, the approval id), RE-EVALUATES the acting admin's
        // underlying `iam2.role.assign_user` entitlement live (explicit deny, default deny,
        // zero-role, revocation, locks all refuse), re-reads the real approval for
        // provenance under a non-revoked policy, and consumes the token atomically.
        //
        // D7-01 (role substitution): the payload hash compared against the token's bound hash is
        // DERIVED HERE, by the server, from the operation actually about to be performed — the
        // role being assigned and the resolved target — using the same canonical `fingerprint` and
        // field names the approval request was hashed with. The caller's `current_payload_hash` is
        // no longer the authoritative fingerprint: if supplied it must EQUAL the server value (a
        // difference is a payload-hash mismatch: token revoked, Critical audit, nothing assigned).
        // An approval for role A therefore cannot assign role B, nor a different target, by
        // presenting A's approved hash.
        const operationPayloadHash = fingerprint({ role_code: body.role_code, target_user_id: targetUserId });
        const verified = await verifyAndConsumeForExecution(client, {
          tokenRaw: body.decision_token,
          actorUserId: body.acting_admin_user_id,
          action: "iam2.role.assign_user",
          resource: "role",
          entityId: targetUserId,
          currentPayloadHash: operationPayloadHash,
          assertedPayloadHash: body.current_payload_hash ?? null,
          approvalId: body.approval_id ?? null,
        });
        if (!verified.ok) {
          return { performed: false, errorCode: verified.reasonCode };
        }
        // Defense-in-depth only at this point — the wrapper already rejected any actor/action/
        // entity mismatch (it was given the exact same values), so this re-check can never
        // actually fire in a way the shared verifier didn't already catch. Left in place
        // deliberately (belt-and-braces on a security-critical control).
        if (
          verified.action !== "iam2.role.assign_user" ||
          verified.actorUserId !== body.acting_admin_user_id ||
          verified.entityId !== targetUserId
        ) {
          return { performed: false, errorCode: "IAM2_DECISION_TOKEN_INVALID" };
        }

        // Phase 4: SoD check BEFORE inserting the role.
        const sod = await checkRoleAssignmentSodConflict(client, {
          targetUserId,
          targetRoleId: role.role_id,
          targetRoleCode: role.role_code,
        });
        const sodCheckId = "sodchk_" + randomUUID();
        await client.query(
          `INSERT INTO iam2.sod_check (sod_check_id, user_id, proposed_ref, result, matched_rules, correlation_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            sodCheckId,
            targetUserId,
            `role_assign:${role.role_code}`,
            sod.blocked ? "block" : "pass",
            JSON.stringify(sod.matchedRuleIds),
            request.ctx.correlation_id,
          ],
        );
        if (sod.blocked) {
          await publishAudit(client, {
            event_type: "iam2.sod_conflict_detected",
            source_module: "IAM-02",
            actor_id: body.acting_admin_user_id,
            actor_type: "user",
            entity_type: "role",
            entity_id: targetUserId,
            metadata: { role_code: role.role_code, sod_check_id: sodCheckId, matched_rules: sod.matchedRuleIds },
          });
          return { performed: false, errorCode: "IAM2_SOD_CONFLICT" };
        }

        // No conflict — perform the assignment. RLS ownership requires aix.user_id = the row's
        // own owner (the target user), not the acting admin.
        await client.query("SELECT set_config('aix.user_id', $1, true)", [targetUserId]);
        await client.query(
          `INSERT INTO iam2.user_role (user_id, role_id, status, assigned_by, approval_id, effective_from_utc)
           VALUES ($1,$2,'active',$3,$4, now())`,
          [targetUserId, role.role_id, body.acting_admin_user_id, verified.approvalId],
        );
        await publishAudit(client, {
          event_type: "iam2.role_assigned",
          source_module: "IAM-02",
          actor_id: body.acting_admin_user_id,
          actor_type: "user",
          entity_type: "role",
          entity_id: targetUserId,
          metadata: { role_code: role.role_code, approval_id: verified.approvalId },
        });
        await bumpCacheVersion(client, targetUserId, "role_assigned");

        return { performed: true };
      });

      if (!outcome.performed) {
        if ("errorCode" in outcome) {
          throw new Iam2Error(outcome.errorCode);
        }
        return reply.send(
          successEnvelope(
            {
              decision: outcome.guardResult.decision,
              reason: outcome.guardResult.reason,
              step_up_required: outcome.guardResult.stepUpRequired,
              approval_required: outcome.guardResult.approvalRequired,
            },
            meta(request),
          ),
        );
      }

      return reply.send(successEnvelope({ user_id: targetUserId, role_code: body.role_code, status: "assigned" }, meta(request)));
    },
  );
}
