/**
 * IAM-02 §04 API Specification §2.1 internal permission-guard endpoint. Guarded by IAM-02's
 * own interim internal-identity seam (plugins/internal-identity.ts) — fail closed when
 * absent/wrong, same pattern as IAM-01's `routes/internal.ts`.
 *
 * JUDGMENT CALL — no Idempotency-Key on this endpoint. Every other mutating internal
 * endpoint in this codebase (IAM-01's freeze-event/revoke-user-sessions) requires one, but
 * IAM-01's own read-only `service-account/validate` does NOT — the dividing line is
 * mutation-with-replay-risk vs. a read/decision report. `permission/check` writes exactly
 * one `iam2.permission_decision_log` row per call, which is intentional per-call evidence
 * (not a side effect whose duplication would be harmful), and `04_API_Specification.md`
 * §2.1's documented request shape has no Idempotency-Key field. Requiring one would also be
 * an unusual burden on every downstream module calling this on every protected action.
 */
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeIam2InternalIdentityGuard } from "../plugins/internal-identity.js";
import { evaluatePermission } from "../lib/guard.js";
import { verifyAndConsumeDecisionToken } from "../lib/decision-token.js";
import { Iam2Error } from "../lib/errors.js";

const PermissionCheckBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    session_id: Type.Optional(Type.String({ maxLength: 64 })),
    action: Type.String({ minLength: 1, maxLength: 128 }),
    resource: Type.String({ minLength: 1, maxLength: 64 }),
    entity_id: Type.Optional(Type.String({ maxLength: 64 })),
    client_id: Type.Optional(Type.String({ maxLength: 64 })),
    // Free-form business context (amount/currency/etc. per 04_API_Specification.md §2.1's
    // example) — varies by calling module; not interpreted by this stage's guard at all
    // (context-aware evaluation beyond the permission-catalogue flags is a later phase).
    context: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    // Phase 3 addition: canonical hash of the business payload this check is guarding (see
    // lib/guard.ts PermissionCheckInput.payloadHash header comment). Optional — a read action
    // has none.
    payload_hash: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  },
  { additionalProperties: false },
);

// §2.2 execute-verify — the approval-to-execution binding check. See lib/decision-token.ts
// for the full verification order (existence/status/expiry -> binding fields
// actor/action/resource/entity/client [F1 fix] -> payload hash -> cache version).
const ExecuteVerifyBody = Type.Object(
  {
    decision_token: Type.String({ minLength: 1, maxLength: 512 }),
    approval_id: Type.Optional(Type.String({ maxLength: 64 })),
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    session_id: Type.Optional(Type.String({ maxLength: 64 })),
    action: Type.String({ minLength: 1, maxLength: 128 }),
    resource: Type.String({ minLength: 1, maxLength: 64 }),
    entity_id: Type.Optional(Type.String({ maxLength: 64 })),
    client_id: Type.Optional(Type.String({ maxLength: 64 })),
    current_payload_hash: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  },
  { additionalProperties: false },
);

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeIam2InternalIdentityGuard(app.config.iam2InternalServiceToken);

  app.post(
    "/internal/iam2/permission/check",
    { preHandler: requireInternal, schema: { body: PermissionCheckBody } },
    async (request, reply) => {
      const body = request.body as {
        actor_id: string;
        session_id?: string;
        action: string;
        resource: string;
        entity_id?: string;
        client_id?: string;
        context?: Record<string, unknown>;
        payload_hash?: string;
      };

      const result = await withTransaction(async (client) => {
        // Scope this transaction to the actor BEFORE touching any RLS-protected iam2 table
        // (iam2.user_role / iam2.user_permission_override) — mirrors IAM-01's
        // withUserScope / the C2 aix.module pattern. `true` = transaction-local, safe here
        // because this whole handler runs inside withTransaction's single BEGIN/COMMIT.
        await client.query("SELECT set_config('aix.user_id', $1, true)", [body.actor_id]);
        return evaluatePermission(client, {
          actorId: body.actor_id,
          ...(body.session_id !== undefined ? { sessionId: body.session_id } : {}),
          action: body.action,
          resource: body.resource,
          ...(body.entity_id !== undefined ? { entityId: body.entity_id } : {}),
          ...(body.client_id !== undefined ? { clientId: body.client_id } : {}),
          ...(body.context !== undefined ? { context: body.context } : {}),
          ...(body.payload_hash !== undefined ? { payloadHash: body.payload_hash } : {}),
        });
      });

      // Phase 3: decision_token/payload_hash are now real, but only present on the wire when
      // the guard actually computed them (a plain read with no payload never gets a token).
      return reply.send(
        successEnvelope(
          {
            decision: result.decision,
            reason: result.reason,
            cache_version: result.cacheVersion,
            sod_conflict: result.sodConflict,
            step_up_required: result.stepUpRequired,
            approval_required: result.approvalRequired,
            ...(result.decisionToken !== undefined ? { decision_token: result.decisionToken } : {}),
            ...(result.payloadHash !== undefined ? { payload_hash: result.payloadHash } : {}),
          },
          meta(request),
        ),
      );
    },
  );

  // ---------------------------------------------------------------------------------------
  // §2.2 POST /internal/iam2/permission/execute-verify — Phase 3 approval-to-execution
  // binding. A generic verification endpoint any downstream module (or IAM-02's own
  // routes/roles.ts, in-process) calls before committing an approval-gated mutation. This
  // route itself performs NO business mutation — it only resolves/consumes the decision
  // token and reports whether execution is authorised; the caller is responsible for the
  // actual write, in the SAME spirit as the guard's `permission/check` being advisory-only
  // until an execute-verify (or, for roles.ts, an in-process token check) confirms it.
  // ---------------------------------------------------------------------------------------
  app.post(
    "/internal/iam2/permission/execute-verify",
    { preHandler: requireInternal, schema: { body: ExecuteVerifyBody } },
    async (request, reply) => {
      const body = request.body as {
        decision_token: string;
        approval_id?: string;
        actor_id: string;
        session_id?: string;
        action: string;
        resource: string;
        entity_id?: string;
        client_id?: string;
        current_payload_hash?: string;
      };

      // F1 fix: pass every presented binding field through — actor/action/resource/entity/
      // client are compared against the token's stored bound values inside
      // verifyAndConsumeDecisionToken itself (07_Permission_Rules.md §9), not left unchecked.
      const result = await withTransaction((client) =>
        verifyAndConsumeDecisionToken(client, {
          tokenRaw: body.decision_token,
          actorUserId: body.actor_id,
          action: body.action,
          resource: body.resource,
          entityId: body.entity_id ?? null,
          clientId: body.client_id ?? null,
          currentPayloadHash: body.current_payload_hash ?? null,
          sessionId: body.session_id ?? null,
        }),
      );

      if (!result.ok) {
        throw new Iam2Error(result.reasonCode);
      }

      return reply.send(
        successEnvelope(
          {
            execution_authorised: true,
            decision: "allow",
            // F1 fix: these now reflect what verifyAndConsumeDecisionToken actually checked,
            // not a hardcoded `true` regardless of input.
            verified_payload_hash: result.verifiedPayloadHash,
            verified_cache_version: result.verifiedCacheVersion,
            verified_session: result.verifiedSession,
          },
          meta(request),
        ),
      );
    },
  );
}
