/**
 * IAM-01 §04.2.9-2.11 MFA endpoints: enrolment (start + verify/activate), login-continuation
 * challenges, and the interim MFA-reset request placeholder.
 *
 * Design note (enrolment vs. login MFA gate): `POST /auth/login` already creates the
 * `iam.mfa_challenge` row and returns its `challenge_id` directly when a user's active TOTP
 * factor requires it (see routes/auth.ts) — that matches the blueprint's login response
 * shape. `POST /auth/mfa/challenges` here is for RE-ISSUING an existing (expired/failed)
 * challenge without restarting login, and `POST /auth/mfa/challenges/{id}/verify` is the
 * unauthenticated login-continuation endpoint that turns a passed challenge into a full
 * session — mirroring how `POST /auth/refresh` completes `POST /auth/login`.
 *
 * Only TOTP is implemented this pass (webauthn/security_key/recovery factor types are
 * DEFERRED — the `iam.mfa_factor` table already has columns for them, unused here).
 */
import { randomUUID } from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AppError,
  beginIdempotent,
  completeIdempotent,
  publishAudit,
  successEnvelope,
  systemTime,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { requireUserSession } from "../plugins/user-session.js";
import { IamError } from "../lib/errors.js";
import { decryptMfaSecret, deriveMfaEncryptionKey, encryptMfaSecret } from "../lib/mfa-secret-crypto.js";
import { checkLocked, lockoutScopeHash, recordFailure, resetOnSuccess } from "../lib/rate-limit.js";
import { createSession, insertAuthEvent, sha256Hex, type UserClass } from "../lib/session.js";
import { buildOtpauthUri, generateTotpSecretBase32, verifyTotp } from "../lib/totp.js";

const EnrolBody = Type.Object({ factor_type: Type.Literal("totp") }, { additionalProperties: false });

const EnrolVerifyBody = Type.Object(
  { factor_id: Type.String({ minLength: 1, maxLength: 64 }), code: Type.String({ minLength: 1, maxLength: 16 }) },
  { additionalProperties: false },
);

const ChallengeReissueBody = Type.Object(
  { challenge_id: Type.String({ minLength: 1, maxLength: 64 }) },
  { additionalProperties: false },
);

const ChallengeVerifyParams = Type.Object({ id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const ChallengeVerifyBody = Type.Object({ code: Type.String({ minLength: 1, maxLength: 16 }) }, { additionalProperties: false });

const ResetRequestBody = Type.Object({}, { additionalProperties: false });

// S2 gap-closing patch: enrolment-during-login (blueprint decision #3 gap). The
// `enrolment_session_id` presented here is the RAW opaque bearer secret POST /auth/login
// returned in the `mfa_enrolment_required` response — never a session/access token, and
// scoped to exactly one purpose (completing TOTP enrolment for the same user_id).
const EnrolSessionStartBody = Type.Object(
  { enrolment_session_id: Type.String({ minLength: 1, maxLength: 512 }) },
  { additionalProperties: false },
);

const EnrolSessionVerifyBody = Type.Object(
  {
    enrolment_session_id: Type.String({ minLength: 1, maxLength: 512 }),
    factor_id: Type.String({ minLength: 1, maxLength: 64 }),
    code: Type.String({ minLength: 1, maxLength: 16 }),
  },
  { additionalProperties: false },
);

type EnrolVerifyOutcome =
  | { tag: "duplicate"; resultRef: string | null }
  | { tag: "locked" }
  | { tag: "not_found" }
  | { tag: "failed" }
  | { tag: "enrolled" };

type EnrolSessionStartOutcome =
  | { tag: "duplicate"; resultRef: string | null }
  | { tag: "invalid" }
  | { tag: "started"; factorId: string };

type EnrolSessionVerifyOutcome =
  | { tag: "duplicate"; resultRef: string | null }
  | { tag: "invalid" }
  | { tag: "locked" }
  | { tag: "failed" }
  | { tag: "authenticated"; accessToken: string; refreshToken: string; expiresAtUtc: string };

type ChallengeVerifyOutcome =
  | { tag: "duplicate"; resultRef: string | null }
  | { tag: "not_found" }
  | { tag: "expired" }
  | { tag: "locked" }
  | { tag: "failed" }
  | { tag: "authenticated"; accessToken: string; refreshToken: string; expiresAtUtc: string };

export async function registerMfaRoutes(app: FastifyInstance): Promise<void> {
  const rateLimit = app.config.rateLimit;
  const encryptionKey = deriveMfaEncryptionKey(app.config.mfaSecretEncryptionKey);

  app.post(
    "/auth/mfa/enrol",
    { preHandler: requireUserSession, schema: { body: EnrolBody } },
    async (request, reply) => {
      const idempotencyKey = requireIdempotencyKey(request);
      const { userId } = request.iamSession!;
      const correlationId = request.ctx.correlation_id;
      const idemScope: IdempotencyScope = {
        actorId: userId,
        actorType: "user",
        action: "iam.mfa.enrol",
        key: idempotencyKey,
        request: {},
        sourceModule: "IAM-01",
      };

      const secret = generateTotpSecretBase32();
      const factorId = "mfa_fac_" + randomUUID();

      const result = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") {
          // Secret is never re-derivable/re-sent on replay (decision #1/#2 discipline).
          return { replayed: true as const, factorId: idem.resultRef };
        }

        // S1 gap-closing patch: iam.mfa_factor carries FORCE RLS ownership; scope before
        // touching it.
        await client.query("SELECT set_config('aix.user_id', $1, true)", [userId]);

        // Superseding pending factors: only one pending TOTP enrolment in flight at a time.
        await client.query(
          `UPDATE iam.mfa_factor SET factor_status = 'revoked', revoked_at_utc = now()
             WHERE user_id = $1 AND factor_type = 'totp' AND factor_status = 'pending'`,
          [userId],
        );

        const encrypted = encryptMfaSecret(secret, encryptionKey);
        await client.query(
          `INSERT INTO iam.mfa_factor (factor_id, user_id, factor_type, factor_status, secret_encrypted, phishing_resistant)
           VALUES ($1,$2,'totp','pending',$3,false)`,
          [factorId, userId, encrypted],
        );

        await publishAudit(client, {
          event_type: "iam.mfa_enrolment_started",
          source_module: "IAM-01",
          actor_id: userId,
          actor_type: "user",
          entity_type: "mfa_factor",
          entity_id: factorId,
          metadata: { factor_type: "totp" },
        });
        await insertAuthEvent(client, {
          eventType: "iam.mfa_enrolment_started",
          userId,
          result: "success",
          correlationId,
        });
        await completeIdempotent(client, idemScope, factorId);
        return { replayed: false as const, factorId };
      });

      if (result.replayed) {
        // Same key+body replay: do not mint/return a second raw secret.
        return reply.send(
          successEnvelope({ status: "duplicate_submission", reference: result.factorId }, meta(request)),
        );
      }

      return reply.code(201).send(
        successEnvelope(
          {
            factor_id: result.factorId,
            factor_type: "totp",
            secret: secret,
            otpauth_url: buildOtpauthUri({ secretBase32: secret, accountLabel: userId, issuer: "AIX" }),
          },
          meta(request),
        ),
      );
    },
  );

  app.post(
    "/auth/mfa/verify",
    { preHandler: requireUserSession, schema: { body: EnrolVerifyBody } },
    async (request, reply) => {
      const body = request.body as { factor_id: string; code: string };
      const idempotencyKey = requireIdempotencyKey(request);
      const { userId } = request.iamSession!;
      const correlationId = request.ctx.correlation_id;
      const scopeHash = lockoutScopeHash("mfa", userId);
      const idemScope: IdempotencyScope = {
        actorId: userId,
        actorType: "user",
        action: "iam.mfa.verify",
        key: idempotencyKey,
        request: body,
        sourceModule: "IAM-01",
      };

      const outcome: EnrolVerifyOutcome = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return { tag: "duplicate", resultRef: idem.resultRef };

        const lockState = await checkLocked(client, { scopeHash, action: "mfa" });
        if (lockState.locked) {
          await completeIdempotent(client, idemScope, "locked");
          return { tag: "locked" };
        }

        // S1 gap-closing patch: iam.mfa_factor carries FORCE RLS ownership; scope before
        // touching it.
        await client.query("SELECT set_config('aix.user_id', $1, true)", [userId]);

        const factorRows = await client.query<{ secret_encrypted: string }>(
          `SELECT secret_encrypted FROM iam.mfa_factor
             WHERE factor_id = $1 AND user_id = $2 AND factor_type = 'totp' AND factor_status = 'pending'`,
          [body.factor_id, userId],
        );
        const factor = factorRows.rows[0];
        if (!factor || !factor.secret_encrypted) {
          await completeIdempotent(client, idemScope, "not_found");
          return { tag: "not_found" };
        }

        const secret = decryptMfaSecret(factor.secret_encrypted, encryptionKey);
        const codeOk = verifyTotp(secret, body.code);

        if (!codeOk) {
          await recordFailure(client, {
            scopeHash,
            action: "mfa",
            userId,
            thresholds: { maxAttempts: rateLimit.mfaMaxAttempts, lockoutMinutes: rateLimit.mfaLockoutMinutes },
          });
          await publishAudit(client, {
            event_type: "iam.mfa_challenge_failed",
            source_module: "IAM-01",
            actor_id: userId,
            actor_type: "user",
            entity_type: "mfa_factor",
            entity_id: body.factor_id,
            metadata: { context: "enrolment" },
          });
          await insertAuthEvent(client, {
            eventType: "iam.mfa_challenge_failed",
            userId,
            result: "failure",
            correlationId,
          });
          await completeIdempotent(client, idemScope, "failed");
          return { tag: "failed" };
        }

        await resetOnSuccess(client, { scopeHash, action: "mfa" });
        await client.query(
          `UPDATE iam.mfa_factor SET factor_status = 'active', enrolled_at_utc = now() WHERE factor_id = $1`,
          [body.factor_id],
        );
        await client.query(`UPDATE iam.user_identity SET mfa_required = true, updated_at_utc = now() WHERE user_id = $1`, [
          userId,
        ]);
        await publishAudit(client, {
          event_type: "iam.mfa_enrolled",
          source_module: "IAM-01",
          actor_id: userId,
          actor_type: "user",
          entity_type: "mfa_factor",
          entity_id: body.factor_id,
          metadata: { factor_type: "totp" },
        });
        await insertAuthEvent(client, { eventType: "iam.mfa_enrolled", userId, result: "success", correlationId });
        await completeIdempotent(client, idemScope, body.factor_id);
        return { tag: "enrolled" };
      });

      switch (outcome.tag) {
        case "duplicate":
          return reply.send(
            successEnvelope({ status: "duplicate_submission", reference: outcome.resultRef }, meta(request)),
          );
        case "locked":
          throw new IamError("AUTH_RATE_LIMITED");
        case "not_found":
          throw new AppError("NOT_FOUND");
        case "failed":
          throw new IamError("AUTH_MFA_FAILED");
        case "enrolled":
          return reply.send(successEnvelope({ status: "enrolled", factor_id: body.factor_id }, meta(request)));
      }
    },
  );

  // ---------------------------------------------------------------------------------------
  // S2 gap-closing patch: enrolment-during-login. Unauthenticated (no bearer session exists
  // yet) — authority comes entirely from possessing the raw enrolment_session_id secret that
  // POST /auth/login returned when mfa_required is set but no active factor exists.
  // ---------------------------------------------------------------------------------------
  app.post(
    "/auth/mfa/enrol/start",
    { schema: { body: EnrolSessionStartBody } },
    async (request, reply) => {
      const body = request.body as { enrolment_session_id: string };
      const idempotencyKey = requireIdempotencyKey(request);
      const correlationId = request.ctx.correlation_id;
      const enrolHash = sha256Hex(body.enrolment_session_id);
      const idemScope: IdempotencyScope = {
        actorId: "mfa_enrol_" + enrolHash.slice(0, 16),
        actorType: "user",
        action: "iam.mfa.enrol_session.start",
        key: idempotencyKey,
        request: {},
        sourceModule: "IAM-01",
      };

      const secret = generateTotpSecretBase32();
      const factorId = "mfa_fac_" + randomUUID();

      const outcome: EnrolSessionStartOutcome = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return { tag: "duplicate", resultRef: idem.resultRef };

        // iam.mfa_enrolment_session deliberately carries NO RLS (same precedent as
        // iam.mfa_challenge / iam.step_up_assertion — see infra/migrations/
        // 004_iam_mfa_enrolment_session.cjs): it is looked up by a pre-auth secret hash,
        // before any user_id scope can be established.
        const rows = await client.query<{ enrolment_id: string; user_id: string; status: string; expires_at_utc: string }>(
          `SELECT enrolment_id, user_id, status, expires_at_utc FROM iam.mfa_enrolment_session WHERE session_token_hash = $1`,
          [enrolHash],
        );
        const enrolment = rows.rows[0];
        if (!enrolment || enrolment.status !== "active" || new Date(enrolment.expires_at_utc).getTime() <= Date.now()) {
          await completeIdempotent(client, idemScope, "invalid");
          return { tag: "invalid" };
        }

        // S1 gap-closing patch: iam.mfa_factor carries FORCE RLS ownership; scope before
        // touching it.
        await client.query("SELECT set_config('aix.user_id', $1, true)", [enrolment.user_id]);

        // Superseding pending factors: only one pending TOTP enrolment in flight at a time.
        await client.query(
          `UPDATE iam.mfa_factor SET factor_status = 'revoked', revoked_at_utc = now()
             WHERE user_id = $1 AND factor_type = 'totp' AND factor_status = 'pending'`,
          [enrolment.user_id],
        );

        const encrypted = encryptMfaSecret(secret, encryptionKey);
        await client.query(
          `INSERT INTO iam.mfa_factor (factor_id, user_id, factor_type, factor_status, secret_encrypted, phishing_resistant)
           VALUES ($1,$2,'totp','pending',$3,false)`,
          [factorId, enrolment.user_id, encrypted],
        );
        await client.query(`UPDATE iam.mfa_enrolment_session SET factor_id = $2 WHERE enrolment_id = $1`, [
          enrolment.enrolment_id,
          factorId,
        ]);

        await publishAudit(client, {
          event_type: "iam.mfa_enrolment_started",
          source_module: "IAM-01",
          actor_id: enrolment.user_id,
          actor_type: "user",
          entity_type: "mfa_factor",
          entity_id: factorId,
          metadata: { factor_type: "totp", enrolment_id: enrolment.enrolment_id },
        });
        await insertAuthEvent(client, {
          eventType: "iam.mfa_enrolment_started",
          userId: enrolment.user_id,
          result: "success",
          correlationId,
        });
        await completeIdempotent(client, idemScope, factorId);
        return { tag: "started", factorId };
      });

      switch (outcome.tag) {
        case "duplicate":
          return reply.send(
            successEnvelope({ status: "duplicate_submission", reference: outcome.resultRef }, meta(request)),
          );
        case "invalid":
          throw new IamError("AUTH_ENROLMENT_SESSION_INVALID");
        case "started":
          return reply.code(201).send(
            successEnvelope(
              {
                factor_id: outcome.factorId,
                factor_type: "totp",
                secret: secret,
                otpauth_url: buildOtpauthUri({ secretBase32: secret, accountLabel: outcome.factorId, issuer: "AIX" }),
              },
              meta(request),
            ),
          );
      }
    },
  );

  app.post(
    "/auth/mfa/enrol/verify",
    { schema: { body: EnrolSessionVerifyBody } },
    async (request, reply) => {
      const body = request.body as { enrolment_session_id: string; factor_id: string; code: string };
      const idempotencyKey = requireIdempotencyKey(request);
      const correlationId = request.ctx.correlation_id;
      const enrolHash = sha256Hex(body.enrolment_session_id);
      const idemScope: IdempotencyScope = {
        actorId: "mfa_enrol_" + enrolHash.slice(0, 16),
        actorType: "user",
        action: "iam.mfa.enrol_session.verify",
        key: idempotencyKey,
        request: { factor_id: body.factor_id, code: body.code },
        sourceModule: "IAM-01",
      };

      const outcome: EnrolSessionVerifyOutcome = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return { tag: "duplicate", resultRef: idem.resultRef };

        const rows = await client.query<{
          enrolment_id: string;
          user_id: string;
          factor_id: string | null;
          status: string;
          expires_at_utc: string;
        }>(
          `SELECT enrolment_id, user_id, factor_id, status, expires_at_utc FROM iam.mfa_enrolment_session
             WHERE session_token_hash = $1`,
          [enrolHash],
        );
        const enrolment = rows.rows[0];
        if (
          !enrolment ||
          enrolment.status !== "active" ||
          new Date(enrolment.expires_at_utc).getTime() <= Date.now() ||
          enrolment.factor_id !== body.factor_id
        ) {
          await completeIdempotent(client, idemScope, "invalid");
          return { tag: "invalid" };
        }

        const scopeHash = lockoutScopeHash("mfa_enrolment", enrolHash);
        const lockState = await checkLocked(client, { scopeHash, action: "mfa" });
        if (lockState.locked) {
          await completeIdempotent(client, idemScope, "locked");
          return { tag: "locked" };
        }

        // S1 gap-closing patch: iam.mfa_factor/iam.session/iam.refresh_token all carry FORCE
        // RLS ownership; scope to the enrolment session's OWN user_id before touching any of
        // them (createSession below re-scopes redundantly but harmlessly).
        await client.query("SELECT set_config('aix.user_id', $1, true)", [enrolment.user_id]);

        const factorRows = await client.query<{ secret_encrypted: string }>(
          `SELECT secret_encrypted FROM iam.mfa_factor
             WHERE factor_id = $1 AND user_id = $2 AND factor_type = 'totp' AND factor_status = 'pending'`,
          [body.factor_id, enrolment.user_id],
        );
        const factor = factorRows.rows[0];
        const codeOk = factor?.secret_encrypted
          ? verifyTotp(decryptMfaSecret(factor.secret_encrypted, encryptionKey), body.code)
          : false;

        if (!codeOk) {
          await recordFailure(client, {
            scopeHash,
            action: "mfa",
            userId: enrolment.user_id,
            thresholds: { maxAttempts: rateLimit.mfaMaxAttempts, lockoutMinutes: rateLimit.mfaLockoutMinutes },
          });
          await publishAudit(client, {
            event_type: "iam.mfa_challenge_failed",
            source_module: "IAM-01",
            actor_id: enrolment.user_id,
            actor_type: "user",
            entity_type: "mfa_factor",
            entity_id: body.factor_id,
            metadata: { context: "enrolment_session" },
          });
          await insertAuthEvent(client, {
            eventType: "iam.mfa_challenge_failed",
            userId: enrolment.user_id,
            result: "failure",
            correlationId,
          });
          await completeIdempotent(client, idemScope, "failed");
          return { tag: "failed" };
        }

        await resetOnSuccess(client, { scopeHash, action: "mfa" });
        await client.query(
          `UPDATE iam.mfa_factor SET factor_status = 'active', enrolled_at_utc = now() WHERE factor_id = $1`,
          [body.factor_id],
        );
        await client.query(`UPDATE iam.user_identity SET mfa_required = true, updated_at_utc = now() WHERE user_id = $1`, [
          enrolment.user_id,
        ]);
        // Single-use: reject a replay of the SAME enrolment_session_id after success.
        await client.query(
          `UPDATE iam.mfa_enrolment_session SET status = 'used', used_at_utc = now()
             WHERE enrolment_id = $1 AND status = 'active'`,
          [enrolment.enrolment_id],
        );
        await publishAudit(client, {
          event_type: "iam.mfa_enrolment_verified",
          source_module: "IAM-01",
          actor_id: enrolment.user_id,
          actor_type: "user",
          entity_type: "mfa_factor",
          entity_id: body.factor_id,
          metadata: { factor_type: "totp", enrolment_id: enrolment.enrolment_id },
        });
        await insertAuthEvent(client, {
          eventType: "iam.mfa_enrolment_verified",
          userId: enrolment.user_id,
          result: "success",
          correlationId,
        });

        const userRows = await client.query<{ user_class: UserClass; status: string; is_interim_admin: boolean }>(
          `SELECT user_class, status, is_interim_admin FROM iam.user_identity WHERE user_id = $1`,
          [enrolment.user_id],
        );
        const user = userRows.rows[0];
        if (!user || user.status !== "active") {
          await completeIdempotent(client, idemScope, "account_frozen");
          return { tag: "invalid" };
        }

        if (user.is_interim_admin) {
          // Closes the specific gap S2 targets: the break-glass bootstrap admin (decision #3)
          // can now complete login end-to-end for the first time.
          await publishAudit(client, {
            event_type: "iam.bootstrap_admin_mfa_completed",
            source_module: "IAM-01",
            actor_id: enrolment.user_id,
            actor_type: "user",
            entity_type: "user_identity",
            entity_id: enrolment.user_id,
            metadata: {},
          });
          await insertAuthEvent(client, {
            eventType: "iam.bootstrap_admin_mfa_completed",
            userId: enrolment.user_id,
            result: "success",
            correlationId,
          });
        }

        const session = await createSession(client, {
          userId: enrolment.user_id,
          userClass: user.user_class,
          authLevel: "mfa",
          correlationId,
        });
        await publishAudit(client, {
          event_type: "iam.login_success",
          source_module: "IAM-01",
          actor_id: enrolment.user_id,
          actor_type: "user",
          entity_type: "user_identity",
          entity_id: enrolment.user_id,
          metadata: { session_id: session.sessionId, via: "mfa_enrolment_session" },
        });
        await completeIdempotent(client, idemScope, session.sessionId);
        return {
          tag: "authenticated",
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAtUtc: session.expiresAtUtc,
        };
      });

      switch (outcome.tag) {
        case "duplicate":
          return reply.send(
            successEnvelope({ status: "duplicate_submission", reference: outcome.resultRef }, meta(request)),
          );
        case "invalid":
          throw new IamError("AUTH_ENROLMENT_SESSION_INVALID");
        case "locked":
          throw new IamError("AUTH_RATE_LIMITED");
        case "failed":
          throw new IamError("AUTH_MFA_FAILED");
        case "authenticated":
          return reply.send(
            successEnvelope(
              {
                status: "authenticated",
                access_token: outcome.accessToken,
                refresh_token: outcome.refreshToken,
                expires_at_utc: outcome.expiresAtUtc,
              },
              meta(request),
            ),
          );
      }
    },
  );

  app.post("/auth/mfa/challenges", { schema: { body: ChallengeReissueBody } }, async (request, reply) => {
    const body = request.body as { challenge_id: string };
    const idempotencyKey = requireIdempotencyKey(request);
    const correlationId = request.ctx.correlation_id;
    const scopeHash = lockoutScopeHash("mfa_challenge_reissue", body.challenge_id);
    const idemScope: IdempotencyScope = {
      actorId: "chal_" + body.challenge_id,
      actorType: "user",
      action: "iam.mfa.challenge.reissue",
      key: idempotencyKey,
      request: body,
      sourceModule: "IAM-01",
    };

    const outcome = await withTransaction(async (client) => {
      const idem = await beginIdempotent(client, idemScope);
      if (idem.status === "duplicate") return { tag: "duplicate" as const, resultRef: idem.resultRef };

      const lockState = await checkLocked(client, { scopeHash, action: "mfa" });
      if (lockState.locked) {
        await completeIdempotent(client, idemScope, "locked");
        return { tag: "locked" as const };
      }

      const existingRows = await client.query<{ user_id: string; factor_id: string | null; status: string }>(
        `SELECT user_id, factor_id, status FROM iam.mfa_challenge WHERE challenge_id = $1`,
        [body.challenge_id],
      );
      const existing = existingRows.rows[0];
      if (!existing || existing.status === "passed") {
        await completeIdempotent(client, idemScope, "not_found");
        return { tag: "not_found" as const };
      }

      const newChallengeId = "mfa_chal_" + randomUUID();
      const expiresAtUtc = new Date(systemTime.nowDate().getTime() + 5 * 60_000).toISOString();
      await client.query(`UPDATE iam.mfa_challenge SET status = 'expired' WHERE challenge_id = $1 AND status = 'pending'`, [
        body.challenge_id,
      ]);
      await client.query(
        `INSERT INTO iam.mfa_challenge
           (challenge_id, user_id, factor_id, challenge_type, status, expires_at_utc, attempt_count, correlation_id, created_at_utc)
         VALUES ($1,$2,$3,'totp','pending',$4,0,$5,now())`,
        [newChallengeId, existing.user_id, existing.factor_id, expiresAtUtc, correlationId],
      );
      await publishAudit(client, {
        event_type: "iam.mfa_challenge_created",
        source_module: "IAM-01",
        actor_id: existing.user_id,
        actor_type: "user",
        entity_type: "mfa_challenge",
        entity_id: newChallengeId,
        metadata: { reissued_from: body.challenge_id },
      });
      await insertAuthEvent(client, {
        eventType: "iam.mfa_challenge_created",
        userId: existing.user_id,
        result: "success",
        correlationId,
      });
      await completeIdempotent(client, idemScope, newChallengeId);
      return { tag: "reissued" as const, challengeId: newChallengeId, expiresAtUtc };
    });

    switch (outcome.tag) {
      case "duplicate":
        return reply.send(
          successEnvelope({ status: "duplicate_submission", reference: outcome.resultRef }, meta(request)),
        );
      case "locked":
        throw new IamError("AUTH_RATE_LIMITED");
      case "not_found":
        throw new AppError("NOT_FOUND");
      case "reissued":
        return reply.send(
          successEnvelope(
            { status: "mfa_required", challenge_id: outcome.challengeId, expires_at_utc: outcome.expiresAtUtc },
            meta(request),
          ),
        );
    }
  });

  app.post(
    "/auth/mfa/challenges/:id/verify",
    { schema: { params: ChallengeVerifyParams, body: ChallengeVerifyBody } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { code: string };
      const idempotencyKey = requireIdempotencyKey(request);
      const correlationId = request.ctx.correlation_id;
      const idemScope: IdempotencyScope = {
        actorId: "chal_" + id,
        actorType: "user",
        action: "iam.mfa.verify",
        key: idempotencyKey,
        request: body,
        sourceModule: "IAM-01",
      };

      const outcome: ChallengeVerifyOutcome = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return { tag: "duplicate", resultRef: idem.resultRef };

        const challengeRows = await client.query<{
          user_id: string;
          factor_id: string | null;
          status: string;
          expires_at_utc: string;
          attempt_count: number;
        }>(`SELECT user_id, factor_id, status, expires_at_utc, attempt_count FROM iam.mfa_challenge WHERE challenge_id = $1`, [
          id,
        ]);
        const challenge = challengeRows.rows[0];
        if (!challenge || challenge.status === "passed") {
          await completeIdempotent(client, idemScope, "not_found");
          return { tag: "not_found" };
        }

        if (challenge.status !== "pending" || new Date(challenge.expires_at_utc).getTime() <= Date.now()) {
          await client.query(`UPDATE iam.mfa_challenge SET status = 'expired' WHERE challenge_id = $1 AND status = 'pending'`, [
            id,
          ]);
          await completeIdempotent(client, idemScope, "expired");
          return { tag: "expired" };
        }

        const scopeHash = lockoutScopeHash("mfa", challenge.user_id);
        const lockState = await checkLocked(client, { scopeHash, action: "mfa" });
        if (lockState.locked) {
          await completeIdempotent(client, idemScope, "locked");
          return { tag: "locked" };
        }

        // S1 gap-closing patch: iam.mfa_factor carries FORCE RLS ownership; this route is
        // unauthenticated (login-continuation), so `challenge.user_id` — already resolved
        // above from the RLS-unprotected iam.mfa_challenge table — is the scope source.
        await client.query("SELECT set_config('aix.user_id', $1, true)", [challenge.user_id]);

        const factorRows = challenge.factor_id
          ? await client.query<{ secret_encrypted: string }>(
              `SELECT secret_encrypted FROM iam.mfa_factor WHERE factor_id = $1 AND factor_status = 'active'`,
              [challenge.factor_id],
            )
          : { rows: [] as { secret_encrypted: string }[] };
        const factor = factorRows.rows[0];
        const codeOk = factor?.secret_encrypted
          ? verifyTotp(decryptMfaSecret(factor.secret_encrypted, encryptionKey), body.code)
          : false;

        if (!codeOk) {
          const nextAttempts = challenge.attempt_count + 1;
          const failThreshold = nextAttempts >= rateLimit.mfaMaxAttempts;
          await client.query(
            `UPDATE iam.mfa_challenge SET attempt_count = $2, status = $3 WHERE challenge_id = $1`,
            [id, nextAttempts, failThreshold ? "failed" : "pending"],
          );
          await recordFailure(client, {
            scopeHash,
            action: "mfa",
            userId: challenge.user_id,
            thresholds: { maxAttempts: rateLimit.mfaMaxAttempts, lockoutMinutes: rateLimit.mfaLockoutMinutes },
          });
          await publishAudit(client, {
            event_type: "iam.mfa_challenge_failed",
            source_module: "IAM-01",
            actor_id: challenge.user_id,
            actor_type: "user",
            entity_type: "mfa_challenge",
            entity_id: id,
            metadata: { attempt_count: nextAttempts },
          });
          await insertAuthEvent(client, {
            eventType: "iam.mfa_challenge_failed",
            userId: challenge.user_id,
            result: "failure",
            correlationId,
          });
          await completeIdempotent(client, idemScope, "failed");
          return { tag: "failed" };
        }

        await resetOnSuccess(client, { scopeHash, action: "mfa" });
        await client.query(`UPDATE iam.mfa_challenge SET status = 'passed', completed_at_utc = now() WHERE challenge_id = $1`, [
          id,
        ]);

        const userRows = await client.query<{ user_class: UserClass; status: string }>(
          `SELECT user_class, status FROM iam.user_identity WHERE user_id = $1`,
          [challenge.user_id],
        );
        const user = userRows.rows[0];
        if (!user || user.status !== "active") {
          await completeIdempotent(client, idemScope, "account_frozen");
          return { tag: "not_found" };
        }

        const session = await createSession(client, {
          userId: challenge.user_id,
          userClass: user.user_class,
          authLevel: "mfa",
          correlationId,
        });
        await publishAudit(client, {
          event_type: "iam.mfa_challenge_passed",
          source_module: "IAM-01",
          actor_id: challenge.user_id,
          actor_type: "user",
          entity_type: "mfa_challenge",
          entity_id: id,
          metadata: { session_id: session.sessionId },
        });
        await publishAudit(client, {
          event_type: "iam.login_success",
          source_module: "IAM-01",
          actor_id: challenge.user_id,
          actor_type: "user",
          entity_type: "user_identity",
          entity_id: challenge.user_id,
          metadata: { session_id: session.sessionId, via: "mfa_challenge" },
        });
        await insertAuthEvent(client, {
          eventType: "iam.mfa_challenge_passed",
          userId: challenge.user_id,
          result: "success",
          correlationId,
        });
        await completeIdempotent(client, idemScope, session.sessionId);
        return {
          tag: "authenticated",
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAtUtc: session.expiresAtUtc,
        };
      });

      switch (outcome.tag) {
        case "duplicate":
          return reply.send(
            successEnvelope({ status: "duplicate_submission", reference: outcome.resultRef }, meta(request)),
          );
        case "not_found":
          throw new AppError("NOT_FOUND");
        case "expired":
          throw new IamError("AUTH_SESSION_EXPIRED");
        case "locked":
          throw new IamError("AUTH_RATE_LIMITED");
        case "failed":
          throw new IamError("AUTH_MFA_FAILED");
        case "authenticated":
          return reply.send(
            successEnvelope(
              {
                status: "authenticated",
                access_token: outcome.accessToken,
                refresh_token: outcome.refreshToken,
                expires_at_utc: outcome.expiresAtUtc,
              },
              meta(request),
            ),
          );
      }
    },
  );

  app.post(
    "/auth/mfa/reset/request",
    { preHandler: requireUserSession, schema: { body: ResetRequestBody } },
    async (request, reply) => {
      const idempotencyKey = requireIdempotencyKey(request);
      const { userId } = request.iamSession!;
      const correlationId = request.ctx.correlation_id;
      const idemScope: IdempotencyScope = {
        actorId: userId,
        actorType: "user",
        action: "iam.mfa.reset_request",
        key: idempotencyKey,
        request: {},
        sourceModule: "IAM-01",
      };

      const resetRequestId = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return idem.resultRef ?? "duplicate";

        const id = "mfa_reset_" + randomUUID();
        // Interim placeholder (decision, permission rules §3 item 9): dual-Security-Admin
        // approval workflow does not exist until IAM-02. This endpoint only FILES the
        // request — it can never auto-complete a reset this pass.
        await client.query(
          `INSERT INTO iam.mfa_reset_request
             (reset_request_id, user_id, requested_by, request_type, status, approval_mode, requested_at_utc)
           VALUES ($1,$2,$3,'self_service','pending','iam01_dual_security_admin',now())`,
          [id, userId, userId],
        );
        await publishAudit(client, {
          event_type: "iam.mfa_reset_requested",
          source_module: "IAM-01",
          actor_id: userId,
          actor_type: "user",
          entity_type: "mfa_reset_request",
          entity_id: id,
          metadata: { approval_mode: "iam01_dual_security_admin" },
        });
        await insertAuthEvent(client, {
          eventType: "iam.mfa_reset_requested",
          userId,
          result: "success",
          correlationId,
        });
        await completeIdempotent(client, idemScope, id);
        return id;
      });

      return reply
        .code(202)
        .send(successEnvelope({ status: "pending_approval", reset_request_id: resetRequestId }, meta(request)));
    },
  );
}
