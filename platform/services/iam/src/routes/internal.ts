/**
 * IAM-01 §04.3 internal/admin-facing endpoints: freeze-event revocation, bulk session
 * revocation, baseline service-account credential validation, and internal client-session
 * introspection. All guarded by IAM's own interim internal-identity seam (decision #4) — fail
 * closed when absent/wrong.
 */
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import {
  beginIdempotent,
  completeIdempotent,
  getPool,
  publishAudit,
  successEnvelope,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeIamInternalIdentityGuard } from "../plugins/internal-identity.js";
import { IamError } from "../lib/errors.js";
import {
  insertAuthEvent,
  revokeAllSessionsForUser,
  sha256Hex,
  validateAccessToken,
  SESSION_VALIDATION_NEGATIVE_CODES,
} from "../lib/session.js";

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

// Internal Session Introspection seam (WLT-01 BLOCKER-1 prerequisite, Opus architecture "IAM-01
// SESSION INTROSPECTION: ACCEPTED FOR IMPLEMENTATION"). `access_token` is the presented CLIENT
// bearer token being introspected — a secret, submitted in the body (never `Authorization`,
// which on this route identifies the CALLING SERVICE instead — see the route's own comment
// below). `maxLength: 512` bounds parsing without revealing the real token's length (opaque
// tokens are `randomBytes(32).toString("base64url")`, 43 characters).
const SessionValidateBody = Type.Object(
  {
    access_token: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeIamInternalIdentityGuard(app.config.iamInternalServiceToken);
  // Internal Session Introspection seam: a DEDICATED capability guard, bound to its own secret
  // (never `iamInternalServiceToken`) — see IamConfig's own field comment for why. The general
  // internal-service token must NOT open this route, and this route's own token must not open
  // any other `/internal/auth/*` route.
  const requireIntrospection = makeIamInternalIdentityGuard(app.config.iamIntrospectionServiceToken);

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

  // -------------------------------------------------------------------------------------------
  // Internal Session Introspection seam (WLT-01 BLOCKER-1 prerequisite, Opus architecture "IAM-01
  // SESSION INTROSPECTION: ACCEPTED FOR IMPLEMENTATION"). Resolves a presented IAM CLIENT bearer
  // access token through the SAME canonical `validateAccessToken` `requireUserSession` itself
  // uses — reused verbatim below, never reimplemented (no independent `sha256Hex` hashing, no
  // independent `fn_resolve_session_by_token_hash` call, no independent session-status check in
  // this handler). `requireUserSession` and its four distinct thrown codes are entirely
  // untouched by this route.
  //
  // `Authorization` on THIS route identifies the CALLING SERVICE (via `requireIntrospection`
  // above) — the token being introspected travels in the body as `access_token` instead, so a
  // third party's secret is never mistaken for the caller's own credential.
  //
  // Negative collapse: every code in `SESSION_VALIDATION_NEGATIVE_CODES` (unknown/malformed
  // token, revoked, expired, inactive/locked/suspended/deactivated user) collapses to the SAME
  // `AUTH_SESSION_REQUIRED`/401 — deliberately, since `AUTH_ACCOUNT_FROZEN` alone is 403 and
  // passing it through would let a caller distinguish "real but frozen account" from "meaningless
  // token" by status code alone (an account-state oracle). Every other exception — a pool-acquire
  // failure, a query error inside `validateAccessToken`, anything not in that set — is treated as
  // infrastructure unavailability (`AUTH_SESSION_INTROSPECTION_UNAVAILABLE`/503), never as a
  // negative-auth result: WLT-01's fail-closed posture depends on being able to tell "the
  // identity is invalid" apart from "IAM could not determine validity".
  //
  // No cache, no transaction (mirrors `requireUserSession`'s own bare-pooled-connection shape),
  // and — deliberately — no `expires_at_utc` in the response: a caller with no expiry to hold
  // onto cannot be tempted to cache authority across requests.
  app.post(
    "/internal/auth/session/validate",
    { preHandler: requireIntrospection, schema: { body: SessionValidateBody } },
    async (request, reply) => {
      const body = request.body as { access_token: string };
      const correlationId = request.ctx.correlation_id;

      let client: PoolClient;
      try {
        client = await getPool().connect();
      } catch (err) {
        throw new IamError("AUTH_SESSION_INTROSPECTION_UNAVAILABLE", { cause: err });
      }

      try {
        let session;
        try {
          session = await validateAccessToken(client, body.access_token);
        } catch (err) {
          if (err instanceof IamError && (SESSION_VALIDATION_NEGATIVE_CODES as readonly string[]).includes(err.code)) {
            // IAM-local security log only — no SEC-01/business audit event for a high-frequency
            // negative-auth outcome (every WLT-01 public request could hit this path). Never the
            // raw token or its hash; `iam.auth_event` carries no field capable of holding either.
            await insertAuthEvent(client, {
              eventType: "iam.session_introspection_denied",
              userId: null,
              result: "blocked",
              correlationId,
            });
            throw new IamError("AUTH_SESSION_REQUIRED");
          }
          // Anything else (a pg query error mid-`validateAccessToken`, an unexpected exception)
          // is infrastructure failure, never a negative-auth result.
          throw new IamError("AUTH_SESSION_INTROSPECTION_UNAVAILABLE", { cause: err });
        }

        // Minimal response-field allowlist (§8 of the accepted architecture): valid, user_id,
        // session_id, user_class — nothing else. `user_class` is `iam.session`'s own snapshot
        // column, the SAME value `requireUserSession` resolves (FINDING-A, not fixed here: this
        // is a pre-existing snapshot, not a live `iam.user_identity.user_class` read).
        return reply.send(
          successEnvelope(
            { valid: true, user_id: session.user_id, session_id: session.session_id, user_class: session.user_class },
            meta(request),
          ),
        );
      } finally {
        client.release();
      }
    },
  );
}
