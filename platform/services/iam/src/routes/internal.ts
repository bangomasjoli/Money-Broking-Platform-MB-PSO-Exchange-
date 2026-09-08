/**
 * IAM-01 §04.3 internal/admin-facing endpoints: freeze-event revocation, bulk session
 * revocation, and baseline service-account credential validation. All guarded by IAM's own
 * interim internal-identity seam (decision #4) — fail closed when absent/wrong.
 */
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  beginIdempotent,
  completeIdempotent,
  publishAudit,
  successEnvelope,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeIamInternalIdentityGuard } from "../plugins/internal-identity.js";
import { IamError } from "../lib/errors.js";
import { insertAuthEvent, revokeAllSessionsForUser, sha256Hex } from "../lib/session.js";

const FreezeEventBody = Type.Object(
  {
    user_id: Type.String({ minLength: 1, maxLength: 64 }),
    client_id: Type.Optional(Type.String({ maxLength: 64 })),
    event_type: Type.String({ minLength: 1, maxLength: 64 }),
    source_module: Type.String({ minLength: 1, maxLength: 32 }),
    reason_ref: Type.Optional(Type.String({ maxLength: 128 })),
  },
  { additionalProperties: false },
);

const RevokeUserSessionsBody = Type.Object(
  {
    user_id: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.String({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false },
);

const ServiceAccountValidateBody = Type.Object(
  {
    service_account_id: Type.String({ minLength: 1, maxLength: 64 }),
    credential: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeIamInternalIdentityGuard(app.config.iamInternalServiceToken);

  app.post(
    "/internal/auth/freeze-event",
    { preHandler: requireInternal, schema: { body: FreezeEventBody } },
    async (request, reply) => {
      const body = request.body as {
        user_id: string;
        client_id?: string;
        event_type: string;
        source_module: string;
        reason_ref?: string;
      };
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = request.ctx.actor_id ?? "iam_internal_service";
      const correlationId = request.ctx.correlation_id;
      const idemScope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "iam.internal.freeze_event",
        key: idempotencyKey,
        request: body,
        sourceModule: "IAM-01",
      };

      const revokedCount = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return -1;

        // Interim status mapping (§06 state machine not fully built this pass): every
        // freeze/suspension event source is treated as a hard suspend — active sessions AND
        // future refresh must both be denied (blueprint §3.3 rules 2-3; enforced again on
        // every refresh call by rotateRefreshToken's account-status re-check in lib/session.ts).
        await client.query(`UPDATE iam.user_identity SET status = 'suspended', updated_at_utc = now() WHERE user_id = $1`, [
          body.user_id,
        ]);
        const count = await revokeAllSessionsForUser(client, { userId: body.user_id, reason: "freeze_event" });

        await publishAudit(client, {
          event_type: "iam.freeze_session_revocation",
          source_module: "IAM-01",
          actor_id: actorId,
          actor_type: "service",
          entity_type: "user_identity",
          entity_id: body.user_id,
          metadata: {
            event_type: body.event_type,
            source_module: body.source_module,
            reason_ref: body.reason_ref ?? null,
            client_id: body.client_id ?? null,
            revoked_session_count: count,
          },
        });
        await insertAuthEvent(client, {
          eventType: "iam.freeze_session_revocation",
          userId: body.user_id,
          result: "success",
          correlationId,
        });
        await completeIdempotent(client, idemScope, String(count));
        return count;
      });

      return reply.send(
        successEnvelope(
          { status: "processed", revoked_session_count: revokedCount >= 0 ? revokedCount : null },
          meta(request),
        ),
      );
    },
  );

  app.post(
    "/internal/auth/revoke-user-sessions",
    { preHandler: requireInternal, schema: { body: RevokeUserSessionsBody } },
    async (request, reply) => {
      const body = request.body as { user_id: string; reason: string };
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = request.ctx.actor_id ?? "iam_internal_service";
      const correlationId = request.ctx.correlation_id;
      const idemScope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "iam.internal.revoke_user_sessions",
        key: idempotencyKey,
        request: body,
        sourceModule: "IAM-01",
      };

      const revokedCount = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return -1;

        const count = await revokeAllSessionsForUser(client, { userId: body.user_id, reason: body.reason });
        await publishAudit(client, {
          event_type: "iam.session_revoked",
          source_module: "IAM-01",
          actor_id: actorId,
          actor_type: "service",
          entity_type: "user_identity",
          entity_id: body.user_id,
          metadata: { reason: body.reason, revoked_session_count: count, scope: "all_sessions" },
        });
        await insertAuthEvent(client, {
          eventType: "iam.session_revoked",
          userId: body.user_id,
          result: "success",
          correlationId,
        });
        await completeIdempotent(client, idemScope, String(count));
        return count;
      });

      return reply.send(
        successEnvelope(
          { status: "processed", revoked_session_count: revokedCount >= 0 ? revokedCount : null },
          meta(request),
        ),
      );
    },
  );

  app.post(
    "/internal/auth/service-account/validate",
    { preHandler: requireInternal, schema: { body: ServiceAccountValidateBody } },
    async (request, reply) => {
      const body = request.body as { service_account_id: string; credential: string };
      const correlationId = request.ctx.correlation_id;
      const actorId = request.ctx.actor_id ?? "iam_internal_service";

      // Baseline only (blueprint §3.5): real credential rotation/hashing scheme is a known
      // open item (see IAM-01_IMPLEMENTATION_NOTES.md). `credential_ref` is compared as a
      // sha256 hex digest of the presented credential — never the plaintext credential
      // itself, and never logged.
      const credentialHash = sha256Hex(body.credential);

      const result = await withTransaction(async (client) => {
        const rows = await client.query<{ service_account_id: string; status: string; scope: unknown }>(
          `SELECT service_account_id, status, scope FROM iam.service_account
             WHERE service_account_id = $1 AND credential_ref = $2`,
          [body.service_account_id, credentialHash],
        );
        const account = rows.rows[0];
        const valid = !!account && account.status === "active";

        await publishAudit(client, {
          event_type: "iam.service_account_validated",
          source_module: "IAM-01",
          actor_id: actorId,
          actor_type: "service",
          entity_type: "service_account",
          entity_id: body.service_account_id,
          metadata: { valid },
        });
        await insertAuthEvent(client, {
          eventType: "iam.service_account_validated",
          userId: null,
          result: valid ? "success" : "failure",
          correlationId,
        });

        return valid && account ? { valid: true as const, scope: account.scope } : { valid: false as const };
      });

      if (!result.valid) {
        throw new IamError("AUTH_SERVICE_ACCOUNT_INVALID");
      }
      return reply.send(
        successEnvelope({ valid: true, service_account_id: body.service_account_id, scope: result.scope }, meta(request)),
      );
    },
  );
}
