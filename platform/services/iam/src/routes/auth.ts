/**
 * IAM-01 §04.2 core authentication/session endpoints: login, refresh, logout, logout-all,
 * own-session listing/revoke.
 *
 * Every sensitive/state-mutating handler here follows the same shape as the FND-01
 * reference routes (services/fnd/src/routes/scheduler.ts / jobs.ts): TypeBox backend
 * validation (additionalProperties: false), a required Idempotency-Key header checked
 * BEFORE any DB work, and publishAudit committed inside the SAME withTransaction as the
 * state change.
 *
 * Login/refresh/MFA-verify/step-up-verify are a special case for idempotency: their
 * success response carries a ONE-TIME secret (opaque access/refresh token or step-up
 * assertion) that — per decision #2 — is never persisted in a re-derivable form (only its
 * hash is stored). A byte-for-byte idempotent REPLAY of the exact same secret is therefore
 * impossible by design, unlike e.g. FND's job registration whose result is a deterministic,
 * re-readable job_code. beginIdempotent/completeIdempotent are still used on these routes
 * (dedup side effects: a retried request with the same key+body must not rotate/mint a
 * second token silently), but a "duplicate" outcome returns an explicit
 * `{ status: "duplicate_submission", reference: <non-secret id> }` envelope rather than
 * attempting to resend the secret. See IAM-01_IMPLEMENTATION_NOTES.md "known gaps".
 */
import { randomUUID } from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AppError,
  beginIdempotent,
  completeIdempotent,
  getPool,
  publishAudit,
  successEnvelope,
  systemTime,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { requireUserSession, withUserScope } from "../plugins/user-session.js";
import { IamError } from "../lib/errors.js";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "../lib/password.js";
import { checkLocked, lockoutScopeHash, recordFailure, resetOnSuccess } from "../lib/rate-limit.js";
import {
  createSession,
  generateOpaqueToken,
  insertAuthEvent,
  revokeAllSessionsForUser,
  revokeSession,
  rotateRefreshToken,
  sha256Hex,
  upsertDevice,
  type RotatedSession,
  type UserClass,
} from "../lib/session.js";

const DeviceInfo = Type.Object(
  { device_id: Type.String({ minLength: 1, maxLength: 128 }), device_name: Type.Optional(Type.String({ maxLength: 256 })) },
  { additionalProperties: false },
);

const LoginBody = Type.Object(
  {
    identifier: Type.String({ minLength: 1, maxLength: 256 }),
    password: Type.String({ minLength: 1, maxLength: 512 }),
    device: Type.Optional(DeviceInfo),
  },
  { additionalProperties: false },
);
interface LoginBodyT {
  identifier: string;
  password: string;
  device?: { device_id: string; device_name?: string };
}

const RefreshBody = Type.Object(
  { refresh_token: Type.String({ minLength: 1, maxLength: 512 }) },
  { additionalProperties: false },
);

const LogoutBody = Type.Object({ session_id: Type.Optional(Type.Literal("current")) }, { additionalProperties: false });

const SessionRevokeParams = Type.Object({ sessionId: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

type LoginOutcome =
  | { tag: "duplicate"; resultRef: string | null }
  | { tag: "locked" }
  | { tag: "invalid_credentials" }
  | { tag: "account_frozen" }
  | { tag: "mfa_enrolment_required"; enrolmentSessionId: string; expiresAtUtc: string }
  | { tag: "mfa_required"; challengeId: string; expiresAtUtc: string }
  | { tag: "authenticated"; session: { accessToken: string; refreshToken: string; expiresAtUtc: string } };

type RefreshOutcome =
  | { tag: "duplicate"; resultRef: string | null }
  | { tag: "locked" }
  | { tag: "not_found" }
  | { tag: "reuse_detected" }
  | { tag: "expired" }
  | { tag: "session_revoked" }
  | { tag: "account_frozen" }
  | { tag: "rotated"; session: RotatedSession };

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const rateLimit = app.config.rateLimit;

  app.post("/auth/login", { schema: { body: LoginBody } }, async (request, reply) => {
    const body = request.body as LoginBodyT;
    const idempotencyKey = requireIdempotencyKey(request);
    const correlationId = request.ctx.correlation_id;

    const identifierNormalised = body.identifier.trim().toLowerCase();
    const identifierHash = sha256Hex(identifierNormalised);
    const scopeHash = lockoutScopeHash("login", identifierHash);
    const actorId = "anon_" + identifierHash;
    const idemScope: IdempotencyScope = {
      actorId,
      actorType: "user",
      action: "iam.auth.login",
      key: idempotencyKey,
      request: body,
      sourceModule: "IAM-01",
    };

    const outcome: LoginOutcome = await withTransaction(async (client) => {
      const idem = await beginIdempotent(client, idemScope);
      if (idem.status === "duplicate") return { tag: "duplicate", resultRef: idem.resultRef };

      const lockState = await checkLocked(client, { scopeHash, action: "login" });
      if (lockState.locked) {
        await publishAudit(client, {
          event_type: "iam.login_rate_limited",
          source_module: "IAM-01",
          actor_id: actorId,
          actor_type: "user",
          entity_type: "user_identity",
          entity_id: identifierHash,
          metadata: { reason: "scope_locked" },
        });
        await insertAuthEvent(client, {
          eventType: "iam.login_rate_limited",
          userId: null,
          result: "blocked",
          correlationId,
        });
        await completeIdempotent(client, idemScope, "locked");
        return { tag: "locked" };
      }

      const userRows = await client.query<{
        user_id: string;
        user_class: UserClass;
        status: string;
        mfa_required: boolean;
      }>(`SELECT user_id, user_class, status, mfa_required FROM iam.user_identity WHERE identifier_hash = $1`, [
        identifierHash,
      ]);
      const user = userRows.rows[0];

      const credRows = user
        ? await client.query<{ password_hash: string }>(
            `SELECT password_hash FROM iam.credential_password WHERE user_id = $1`,
            [user.user_id],
          )
        : { rows: [] as { password_hash: string }[] };
      const cred = credRows.rows[0];

      // Always verify() even when no user/credential resolves, against a fixed dummy hash,
      // so failure timing does not disclose account existence (§09 §3.3 / no-enumeration).
      const passwordOk = await verifyPassword(cred?.password_hash ?? DUMMY_PASSWORD_HASH, body.password);

      if (!user || !cred || !passwordOk) {
        await recordFailure(client, {
          scopeHash,
          action: "login",
          userId: user?.user_id ?? null,
          thresholds: { maxAttempts: rateLimit.loginMaxAttempts, lockoutMinutes: rateLimit.loginLockoutMinutes },
        });
        await publishAudit(client, {
          event_type: "iam.login_failed",
          source_module: "IAM-01",
          actor_id: user?.user_id ?? actorId,
          actor_type: "user",
          entity_type: "user_identity",
          entity_id: user?.user_id ?? identifierHash,
          metadata: { reason: !user ? "no_such_identifier" : "bad_password" },
        });
        await insertAuthEvent(client, {
          eventType: "iam.login_failed",
          userId: user?.user_id ?? null,
          result: "failure",
          correlationId,
        });
        await completeIdempotent(client, idemScope, "invalid_credentials");
        return { tag: "invalid_credentials" };
      }

      if (user.status !== "active") {
        await publishAudit(client, {
          event_type: "iam.login_failed",
          source_module: "IAM-01",
          actor_id: user.user_id,
          actor_type: "user",
          entity_type: "user_identity",
          entity_id: user.user_id,
          metadata: { reason: "account_" + user.status },
        });
        await insertAuthEvent(client, {
          eventType: "iam.login_failed",
          userId: user.user_id,
          result: "blocked",
          correlationId,
        });
        await completeIdempotent(client, idemScope, "account_frozen");
        return { tag: "account_frozen" };
      }

      await resetOnSuccess(client, { scopeHash, action: "login" });

      // S1 gap-closing patch: iam.mfa_factor/iam.device_registry/iam.session/iam.refresh_token
      // all carry FORCE RLS ownership policies. Everything from here on in this transaction
      // operates on THIS authenticated user's own rows, so scope aix.user_id once, up front —
      // covers the device upsert below, the mfa_factor lookup, and (redundantly but harmlessly)
      // createSession's own scoping.
      await client.query("SELECT set_config('aix.user_id', $1, true)", [user.user_id]);

      if (body.device?.device_id) {
        await upsertDevice(client, {
          userId: user.user_id,
          deviceId: body.device.device_id,
          ...(body.device.device_name ? { deviceLabel: body.device.device_name } : {}),
        });
      }

      if (user.mfa_required) {
        const factorRows = await client.query<{ factor_id: string }>(
          `SELECT factor_id FROM iam.mfa_factor WHERE user_id = $1 AND factor_type = 'totp' AND factor_status = 'active' LIMIT 1`,
          [user.user_id],
        );
        const factor = factorRows.rows[0];
        if (!factor) {
          // S2 gap-closing patch: mfa_required is set but no active factor exists yet (e.g.
          // the break-glass bootstrap admin, or an operator flag flip). Password is already
          // verified at this point, so issue a purpose-scoped, short-lived "enrolment
          // session" — NOT a full session — that grants ONLY the ability to complete TOTP
          // enrolment for this same user_id via POST /auth/mfa/enrol/start + /verify. Opaque,
          // hash-only at rest (decision #2 discipline), single-use, expiring.
          const enrolmentId = "mfa_enrol_" + randomUUID();
          const enrolmentSecret = generateOpaqueToken();
          const enrolmentExpiresAtUtc = new Date(systemTime.nowDate().getTime() + 15 * 60_000).toISOString();
          await client.query(
            `INSERT INTO iam.mfa_enrolment_session
               (enrolment_id, session_token_hash, user_id, status, expires_at_utc, correlation_id, created_at_utc)
             VALUES ($1,$2,$3,'active',$4,$5,now())`,
            [enrolmentId, sha256Hex(enrolmentSecret), user.user_id, enrolmentExpiresAtUtc, correlationId],
          );
          await publishAudit(client, {
            event_type: "iam.mfa_enrolment_required",
            source_module: "IAM-01",
            actor_id: user.user_id,
            actor_type: "user",
            entity_type: "user_identity",
            entity_id: user.user_id,
            metadata: { enrolment_id: enrolmentId },
          });
          await insertAuthEvent(client, {
            eventType: "iam.mfa_enrolment_required",
            userId: user.user_id,
            result: "blocked",
            correlationId,
          });
          await completeIdempotent(client, idemScope, enrolmentId);
          return { tag: "mfa_enrolment_required", enrolmentSessionId: enrolmentSecret, expiresAtUtc: enrolmentExpiresAtUtc };
        }

        const challengeId = "mfa_chal_" + randomUUID();
        const expiresAtUtc = new Date(systemTime.nowDate().getTime() + 5 * 60_000).toISOString();
        await client.query(
          `INSERT INTO iam.mfa_challenge
             (challenge_id, user_id, factor_id, challenge_type, status, expires_at_utc, attempt_count, correlation_id, created_at_utc)
           VALUES ($1,$2,$3,'totp','pending',$4,0,$5,now())`,
          [challengeId, user.user_id, factor.factor_id, expiresAtUtc, correlationId],
        );
        await publishAudit(client, {
          event_type: "iam.mfa_challenge_created",
          source_module: "IAM-01",
          actor_id: user.user_id,
          actor_type: "user",
          entity_type: "mfa_challenge",
          entity_id: challengeId,
          metadata: {},
        });
        await insertAuthEvent(client, {
          eventType: "iam.mfa_challenge_created",
          userId: user.user_id,
          result: "success",
          correlationId,
        });
        await completeIdempotent(client, idemScope, challengeId);
        return { tag: "mfa_required", challengeId, expiresAtUtc };
      }

      const session = await createSession(client, {
        userId: user.user_id,
        userClass: user.user_class,
        authLevel: "password",
        correlationId,
        ...(body.device?.device_id ? { deviceId: body.device.device_id } : {}),
      });
      await publishAudit(client, {
        event_type: "iam.login_success",
        source_module: "IAM-01",
        actor_id: user.user_id,
        actor_type: "user",
        entity_type: "user_identity",
        entity_id: user.user_id,
        metadata: { session_id: session.sessionId },
      });
      await publishAudit(client, {
        event_type: "iam.session_created",
        source_module: "IAM-01",
        actor_id: user.user_id,
        actor_type: "user",
        entity_type: "session",
        entity_id: session.sessionId,
        metadata: {},
      });
      await insertAuthEvent(client, {
        eventType: "iam.login_success",
        userId: user.user_id,
        result: "success",
        correlationId,
      });
      await completeIdempotent(client, idemScope, session.sessionId);
      return {
        tag: "authenticated",
        session: {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAtUtc: session.expiresAtUtc,
        },
      };
    });

    switch (outcome.tag) {
      case "duplicate":
        return reply.send(
          successEnvelope({ status: "duplicate_submission", reference: outcome.resultRef }, meta(request)),
        );
      case "locked":
        throw new IamError("AUTH_ACCOUNT_LOCKED");
      case "invalid_credentials":
        throw new IamError("AUTH_INVALID_CREDENTIALS");
      case "account_frozen":
        throw new IamError("AUTH_ACCOUNT_FROZEN");
      case "mfa_enrolment_required":
        return reply.send(
          successEnvelope(
            {
              status: "mfa_enrolment_required",
              enrolment_session_id: outcome.enrolmentSessionId,
              expires_at_utc: outcome.expiresAtUtc,
            },
            meta(request),
          ),
        );
      case "mfa_required":
        return reply.send(
          successEnvelope(
            { status: "mfa_required", challenge_id: outcome.challengeId, expires_at_utc: outcome.expiresAtUtc },
            meta(request),
          ),
        );
      case "authenticated":
        return reply.send(
          successEnvelope(
            {
              status: "authenticated",
              access_token: outcome.session.accessToken,
              refresh_token: outcome.session.refreshToken,
              expires_at_utc: outcome.session.expiresAtUtc,
            },
            meta(request),
          ),
        );
    }
  });

  app.post("/auth/refresh", { schema: { body: RefreshBody } }, async (request, reply) => {
    const body = request.body as { refresh_token: string };
    const idempotencyKey = requireIdempotencyKey(request);
    const correlationId = request.ctx.correlation_id;

    const tokenRef = sha256Hex(body.refresh_token);
    const scopeHash = lockoutScopeHash("refresh", tokenRef);
    const actorId = "reftok_" + tokenRef.slice(0, 16);
    const idemScope: IdempotencyScope = {
      actorId,
      actorType: "user",
      action: "iam.auth.refresh",
      key: idempotencyKey,
      request: body,
      sourceModule: "IAM-01",
    };

    const outcome: RefreshOutcome = await withTransaction(async (client) => {
      const idem = await beginIdempotent(client, idemScope);
      if (idem.status === "duplicate") return { tag: "duplicate", resultRef: idem.resultRef };

      const lockState = await checkLocked(client, { scopeHash, action: "refresh" });
      if (lockState.locked) {
        await completeIdempotent(client, idemScope, "locked");
        return { tag: "locked" };
      }

      const result = await rotateRefreshToken(client, { refreshToken: body.refresh_token, correlationId });

      if (result.outcome === "rotated") {
        await resetOnSuccess(client, { scopeHash, action: "refresh" });
        await completeIdempotent(client, idemScope, result.session.sessionId);
        return { tag: "rotated", session: result.session };
      }

      if (result.outcome === "not_found" || result.outcome === "expired") {
        await recordFailure(client, {
          scopeHash,
          action: "refresh",
          userId: null,
          thresholds: { maxAttempts: rateLimit.refreshMaxAttempts, lockoutMinutes: rateLimit.refreshLockoutMinutes },
        });
      }
      await completeIdempotent(client, idemScope, result.outcome);
      return { tag: result.outcome };
    });

    switch (outcome.tag) {
      case "duplicate":
        return reply.send(
          successEnvelope({ status: "duplicate_submission", reference: outcome.resultRef }, meta(request)),
        );
      case "locked":
        throw new IamError("AUTH_RATE_LIMITED");
      case "not_found":
        throw new IamError("AUTH_SESSION_REQUIRED");
      case "reuse_detected":
        throw new IamError("AUTH_REFRESH_REUSE_DETECTED");
      case "expired":
        throw new IamError("AUTH_SESSION_EXPIRED");
      case "session_revoked":
        throw new IamError("AUTH_SESSION_REVOKED");
      case "account_frozen":
        throw new IamError("AUTH_ACCOUNT_FROZEN");
      case "rotated":
        return reply.send(
          successEnvelope(
            {
              status: "authenticated",
              access_token: outcome.session.accessToken,
              refresh_token: outcome.session.refreshToken,
              expires_at_utc: outcome.session.expiresAtUtc,
            },
            meta(request),
          ),
        );
    }
  });

  app.post(
    "/auth/logout",
    { preHandler: requireUserSession, schema: { body: LogoutBody } },
    async (request, reply) => {
      const idempotencyKey = requireIdempotencyKey(request);
      const { sessionId, userId } = request.iamSession!;
      const correlationId = request.ctx.correlation_id;
      const idemScope: IdempotencyScope = {
        actorId: userId,
        actorType: "user",
        action: "iam.session.revoke",
        key: idempotencyKey,
        request: { sessionId },
        sourceModule: "IAM-01",
      };

      await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return;

        const revoked = await revokeSession(client, { sessionId, userId, reason: "logout" });
        if (revoked) {
          await publishAudit(client, {
            event_type: "iam.session_revoked",
            source_module: "IAM-01",
            actor_id: userId,
            actor_type: "user",
            entity_type: "session",
            entity_id: sessionId,
            metadata: { reason: "logout" },
          });
          await insertAuthEvent(client, { eventType: "iam.session_revoked", userId, result: "success", correlationId });
        }
        await completeIdempotent(client, idemScope, sessionId);
      });

      return reply.send(successEnvelope({ status: "revoked" }, meta(request)));
    },
  );

  app.post(
    "/auth/logout-all",
    { preHandler: requireUserSession, schema: { body: LogoutBody } },
    async (request, reply) => {
      const idempotencyKey = requireIdempotencyKey(request);
      const { userId } = request.iamSession!;
      const correlationId = request.ctx.correlation_id;
      const idemScope: IdempotencyScope = {
        actorId: userId,
        actorType: "user",
        action: "iam.session.revoke_all",
        key: idempotencyKey,
        request: {},
        sourceModule: "IAM-01",
      };

      const revokedCount = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return 0;

        const count = await revokeAllSessionsForUser(client, { userId, reason: "global_logout" });
        await publishAudit(client, {
          event_type: "iam.global_logout",
          source_module: "IAM-01",
          actor_id: userId,
          actor_type: "user",
          entity_type: "user_identity",
          entity_id: userId,
          metadata: { revoked_session_count: count },
        });
        await insertAuthEvent(client, { eventType: "iam.global_logout", userId, result: "success", correlationId });
        await completeIdempotent(client, idemScope, String(count));
        return count;
      });

      return reply.send(successEnvelope({ status: "revoked", revoked_session_count: revokedCount }, meta(request)));
    },
  );

  app.get("/auth/sessions", { preHandler: requireUserSession }, async (request, reply) => {
    const { userId } = request.iamSession!;
    const client = await getPool().connect();
    try {
      const rows = await withUserScope(client, userId, async () => {
        const res = await client.query<{
          session_id: string;
          session_status: string;
          issued_at_utc: string;
          expires_at_utc: string;
          user_class: string;
          auth_level: string;
          device_id: string | null;
          last_seen_at_utc: string | null;
        }>(
          `SELECT session_id, session_status, issued_at_utc, expires_at_utc, user_class, auth_level, device_id, last_seen_at_utc
             FROM iam.session WHERE user_id = $1 ORDER BY issued_at_utc DESC`,
          [userId],
        );
        return res.rows;
      });
      return reply.send(successEnvelope({ sessions: rows }, meta(request)));
    } finally {
      client.release();
    }
  });

  app.post(
    "/auth/sessions/:sessionId/revoke",
    { preHandler: requireUserSession, schema: { params: SessionRevokeParams } },
    async (request, reply) => {
      const idempotencyKey = requireIdempotencyKey(request);
      const { userId } = request.iamSession!;
      const { sessionId } = request.params as { sessionId: string };
      const correlationId = request.ctx.correlation_id;
      const idemScope: IdempotencyScope = {
        actorId: userId,
        actorType: "user",
        action: "iam.session.revoke",
        key: idempotencyKey,
        request: { sessionId },
        sourceModule: "IAM-01",
      };

      await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return;

        // S1 gap-closing patch: iam.session carries FORCE RLS, so this ownership pre-check
        // must scope aix.user_id to the CALLER's own id first — otherwise, under
        // role_iam_runtime, the SELECT below would return zero rows even for a session the
        // caller genuinely owns, which happens to look identical to the (intended) cross-user
        // no-existence-disclosure case but for the wrong reason. Scoping first keeps that
        // NOT_FOUND meaningful (a real ownership mismatch) rather than an RLS false negative.
        await client.query("SELECT set_config('aix.user_id', $1, true)", [userId]);

        // Ownership check before any mutation: cross-user revoke attempts get the SAME
        // NOT_FOUND response as a genuinely-missing session id (no existence disclosure).
        const owned = await client.query(`SELECT 1 FROM iam.session WHERE session_id = $1 AND user_id = $2`, [
          sessionId,
          userId,
        ]);
        if (owned.rowCount === 0) {
          throw new AppError("NOT_FOUND");
        }

        const revoked = await revokeSession(client, { sessionId, userId, reason: "user_revoked" });
        if (revoked) {
          await publishAudit(client, {
            event_type: "iam.session_revoked",
            source_module: "IAM-01",
            actor_id: userId,
            actor_type: "user",
            entity_type: "session",
            entity_id: sessionId,
            metadata: { reason: "user_revoked" },
          });
          await insertAuthEvent(client, { eventType: "iam.session_revoked", userId, result: "success", correlationId });
        }
        await completeIdempotent(client, idemScope, sessionId);
      });

      return reply.send(successEnvelope({ status: "revoked" }, meta(request)));
    },
  );
}
