/**
 * IAM-01 §04.2.12-2.14 step-up authentication: start a challenge for a sensitive downstream
 * action, verify it into a short-lived "recent-auth" assertion, and let a downstream
 * internal service verify that assertion. Reuses `iam.mfa_challenge` (challenge_type =
 * 'step_up') for the challenge phase and `iam.step_up_assertion` for the resulting proof,
 * matching the tables the interrupted run already migrated.
 *
 * `POST /internal/auth/verify-assertion` is the "reusable capability downstream modules
 * will call" (task spec) — it is deliberately NOT gated behind an Idempotency-Key: it is a
 * verify/read operation with an audit side effect, not a resource-creating write, and
 * downstream callers are expected to call it repeatedly within the assertion's freshness
 * window (that is its whole purpose), so treating repeat calls as "duplicates to dedupe"
 * would be the wrong idempotency model. See IAM-01_IMPLEMENTATION_NOTES.md.
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
import { makeIamInternalIdentityGuard } from "../plugins/internal-identity.js";
import { requireUserSession } from "../plugins/user-session.js";
import { IamError } from "../lib/errors.js";
import { decryptMfaSecret, deriveMfaEncryptionKey } from "../lib/mfa-secret-crypto.js";
import { checkLocked, lockoutScopeHash, recordFailure, resetOnSuccess } from "../lib/rate-limit.js";
import { generateOpaqueToken, insertAuthEvent, sha256Hex } from "../lib/session.js";
import { verifyTotp } from "../lib/totp.js";

const StepUpStartBody = Type.Object(
  {
    purpose: Type.String({ minLength: 1, maxLength: 64 }),
    action_scope: Type.Optional(Type.String({ maxLength: 128 })),
  },
  { additionalProperties: false },
);

const StepUpVerifyBody = Type.Object(
  { challenge_id: Type.String({ minLength: 1, maxLength: 64 }), code: Type.String({ minLength: 1, maxLength: 16 }) },
  { additionalProperties: false },
);

const VerifyAssertionBody = Type.Object(
  {
    recent_auth_assertion: Type.String({ minLength: 1, maxLength: 512 }),
    required_purpose: Type.String({ minLength: 1, maxLength: 64 }),
    session_id: Type.Optional(Type.String({ maxLength: 64 })),
  },
  { additionalProperties: false },
);

type StepUpVerifyOutcome =
  | { tag: "duplicate"; resultRef: string | null }
  | { tag: "not_found" }
  | { tag: "expired" }
  | { tag: "locked" }
  | { tag: "failed" }
  | { tag: "verified"; assertion: string; authLevel: string; purpose: string; expiresAtUtc: string };

export async function registerStepUpRoutes(app: FastifyInstance): Promise<void> {
  const rateLimit = app.config.rateLimit;
  const encryptionKey = deriveMfaEncryptionKey(app.config.mfaSecretEncryptionKey);
  const requireInternal = makeIamInternalIdentityGuard(app.config.iamInternalServiceToken);

  app.post(
    "/auth/step-up",
    { preHandler: requireUserSession, schema: { body: StepUpStartBody } },
    async (request, reply) => {
      const body = request.body as { purpose: string; action_scope?: string };
      const idempotencyKey = requireIdempotencyKey(request);
      const { userId, sessionId } = request.iamSession!;
      const correlationId = request.ctx.correlation_id;
      const idemScope: IdempotencyScope = {
        actorId: userId,
        actorType: "user",
        action: "iam.step_up.start",
        key: idempotencyKey,
        request: body,
        sourceModule: "IAM-01",
      };

      const result = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return { replayed: true as const, resultRef: idem.resultRef };

        // S1 gap-closing patch: iam.mfa_factor carries FORCE RLS ownership; scope before
        // touching it.
        await client.query("SELECT set_config('aix.user_id', $1, true)", [userId]);

        const factorRows = await client.query<{ factor_id: string }>(
          `SELECT factor_id FROM iam.mfa_factor WHERE user_id = $1 AND factor_type = 'totp' AND factor_status = 'active' LIMIT 1`,
          [userId],
        );
        const factor = factorRows.rows[0];
        if (!factor) {
          await completeIdempotent(client, idemScope, "mfa_enrolment_required");
          return { replayed: false as const, mfaRequired: true as const };
        }

        const challengeId = "step_chal_" + randomUUID();
        const expiresAtUtc = new Date(systemTime.nowDate().getTime() + 5 * 60_000).toISOString();
        await client.query(
          `INSERT INTO iam.mfa_challenge
             (challenge_id, user_id, factor_id, challenge_type, status, expires_at_utc, attempt_count,
              correlation_id, purpose, action_scope, session_id, created_at_utc)
           VALUES ($1,$2,$3,'step_up','pending',$4,0,$5,$6,$7,$8,now())`,
          [challengeId, userId, factor.factor_id, expiresAtUtc, correlationId, body.purpose, body.action_scope ?? null, sessionId],
        );
        await publishAudit(client, {
          event_type: "iam.step_up_started",
          source_module: "IAM-01",
          actor_id: userId,
          actor_type: "user",
          entity_type: "mfa_challenge",
          entity_id: challengeId,
          metadata: { purpose: body.purpose, action_scope: body.action_scope ?? null },
        });
        await insertAuthEvent(client, { eventType: "iam.step_up_started", userId, result: "success", correlationId });
        await completeIdempotent(client, idemScope, challengeId);
        return { replayed: false as const, mfaRequired: false as const, challengeId, expiresAtUtc };
      });

      if (result.replayed) {
        return reply.send(
          successEnvelope({ status: "duplicate_submission", reference: result.resultRef }, meta(request)),
        );
      }
      if (result.mfaRequired) {
        throw new IamError("AUTH_MFA_ENROLMENT_REQUIRED");
      }
      return reply.send(
        successEnvelope(
          { challenge_id: result.challengeId, challenge_type: "step_up", expires_at_utc: result.expiresAtUtc },
          meta(request),
        ),
      );
    },
  );

  app.post(
    "/auth/step-up/verify",
    { preHandler: requireUserSession, schema: { body: StepUpVerifyBody } },
    async (request, reply) => {
      const body = request.body as { challenge_id: string; code: string };
      const idempotencyKey = requireIdempotencyKey(request);
      const { userId, sessionId } = request.iamSession!;
      const correlationId = request.ctx.correlation_id;
      const idemScope: IdempotencyScope = {
        actorId: userId,
        actorType: "user",
        action: "iam.step_up.verify",
        key: idempotencyKey,
        request: body,
        sourceModule: "IAM-01",
      };

      const assertionToken = generateOpaqueToken();

      const outcome: StepUpVerifyOutcome = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return { tag: "duplicate", resultRef: idem.resultRef };

        const challengeRows = await client.query<{
          user_id: string;
          factor_id: string | null;
          status: string;
          expires_at_utc: string;
          attempt_count: number;
          purpose: string | null;
          action_scope: string | null;
        }>(
          `SELECT user_id, factor_id, status, expires_at_utc, attempt_count, purpose, action_scope
             FROM iam.mfa_challenge WHERE challenge_id = $1 AND challenge_type = 'step_up'`,
          [body.challenge_id],
        );
        const challenge = challengeRows.rows[0];
        if (!challenge || challenge.user_id !== userId) {
          await completeIdempotent(client, idemScope, "not_found");
          return { tag: "not_found" };
        }
        if (challenge.status !== "pending" || new Date(challenge.expires_at_utc).getTime() <= Date.now()) {
          await client.query(`UPDATE iam.mfa_challenge SET status = 'expired' WHERE challenge_id = $1 AND status = 'pending'`, [
            body.challenge_id,
          ]);
          await completeIdempotent(client, idemScope, "expired");
          return { tag: "expired" };
        }

        const scopeHash = lockoutScopeHash("mfa", userId);
        const lockState = await checkLocked(client, { scopeHash, action: "mfa" });
        if (lockState.locked) {
          await completeIdempotent(client, idemScope, "locked");
          return { tag: "locked" };
        }

        // S1 gap-closing patch: iam.mfa_factor/iam.session carry FORCE RLS ownership; scope
        // before touching either (the step_up_assertion INSERT below is on an unprotected
        // table by design — see step_up_assertion's own no-RLS precedent).
        await client.query("SELECT set_config('aix.user_id', $1, true)", [userId]);

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
          await client.query(`UPDATE iam.mfa_challenge SET attempt_count = $2, status = $3 WHERE challenge_id = $1`, [
            body.challenge_id,
            nextAttempts,
            failThreshold ? "failed" : "pending",
          ]);
          await recordFailure(client, {
            scopeHash,
            action: "mfa",
            userId,
            thresholds: { maxAttempts: rateLimit.mfaMaxAttempts, lockoutMinutes: rateLimit.mfaLockoutMinutes },
          });
          await publishAudit(client, {
            event_type: "iam.step_up_failed",
            source_module: "IAM-01",
            actor_id: userId,
            actor_type: "user",
            entity_type: "mfa_challenge",
            entity_id: body.challenge_id,
            metadata: { attempt_count: nextAttempts },
          });
          await insertAuthEvent(client, { eventType: "iam.step_up_failed", userId, result: "failure", correlationId });
          await completeIdempotent(client, idemScope, "failed");
          return { tag: "failed" };
        }

        await resetOnSuccess(client, { scopeHash, action: "mfa" });
        await client.query(`UPDATE iam.mfa_challenge SET status = 'passed', completed_at_utc = now() WHERE challenge_id = $1`, [
          body.challenge_id,
        ]);

        const assertionId = "step_assert_" + randomUUID();
        const expiresAtUtc = new Date(systemTime.nowDate().getTime() + 10 * 60_000).toISOString();
        await client.query(
          `INSERT INTO iam.step_up_assertion
             (assertion_id, assertion_hash, user_id, session_id, purpose, action_scope, auth_level,
              issued_at_utc, expires_at_utc, status, correlation_id)
           VALUES ($1,$2,$3,$4,$5,$6,'mfa',now(),$7,'active',$8)`,
          [
            assertionId,
            sha256Hex(assertionToken),
            userId,
            sessionId,
            challenge.purpose ?? "unspecified",
            challenge.action_scope,
            expiresAtUtc,
            correlationId,
          ],
        );
        await publishAudit(client, {
          event_type: "iam.step_up_passed",
          source_module: "IAM-01",
          actor_id: userId,
          actor_type: "user",
          entity_type: "step_up_assertion",
          entity_id: assertionId,
          metadata: { purpose: challenge.purpose, action_scope: challenge.action_scope },
        });
        await insertAuthEvent(client, { eventType: "iam.step_up_passed", userId, result: "success", correlationId });
        await completeIdempotent(client, idemScope, assertionId);
        return {
          tag: "verified",
          assertion: assertionToken,
          authLevel: "mfa",
          purpose: challenge.purpose ?? "unspecified",
          expiresAtUtc,
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
          throw new IamError("AUTH_STEP_UP_REQUIRED");
        case "locked":
          throw new IamError("AUTH_RATE_LIMITED");
        case "failed":
          throw new IamError("AUTH_STEP_UP_FAILED");
        case "verified":
          return reply.send(
            successEnvelope(
              {
                recent_auth_assertion: outcome.assertion,
                auth_level: outcome.authLevel,
                purpose: outcome.purpose,
                expires_at_utc: outcome.expiresAtUtc,
              },
              meta(request),
            ),
          );
      }
    },
  );

  app.post(
    "/internal/auth/verify-assertion",
    { preHandler: requireInternal, schema: { body: VerifyAssertionBody } },
    async (request, reply) => {
      const body = request.body as { recent_auth_assertion: string; required_purpose: string; session_id?: string };
      const correlationId = request.ctx.correlation_id;
      const assertionHash = sha256Hex(body.recent_auth_assertion);

      const result = await withTransaction(async (client) => {
        const rows = await client.query<{
          assertion_id: string;
          user_id: string;
          session_id: string | null;
          purpose: string;
          auth_level: string;
          expires_at_utc: string;
          status: string;
        }>(
          `SELECT assertion_id, user_id, session_id, purpose, auth_level, expires_at_utc, status
             FROM iam.step_up_assertion WHERE assertion_hash = $1`,
          [assertionHash],
        );
        const assertion = rows.rows[0];
        const valid =
          !!assertion &&
          assertion.status === "active" &&
          assertion.purpose === body.required_purpose &&
          new Date(assertion.expires_at_utc).getTime() > Date.now() &&
          (!body.session_id || assertion.session_id === body.session_id);

        await publishAudit(client, {
          event_type: "iam.recent_auth_assertion_verified",
          source_module: "IAM-01",
          actor_id: assertion?.user_id ?? "unknown",
          actor_type: "service",
          entity_type: "step_up_assertion",
          entity_id: assertion?.assertion_id ?? "unresolved",
          metadata: { valid, required_purpose: body.required_purpose },
        });
        if (assertion) {
          await insertAuthEvent(client, {
            eventType: "iam.recent_auth_assertion_verified",
            userId: assertion.user_id,
            result: valid ? "success" : "blocked",
            correlationId,
          });
        }

        return valid && assertion
          ? { valid: true as const, userId: assertion.user_id, authLevel: assertion.auth_level, freshUntilUtc: assertion.expires_at_utc }
          : { valid: false as const };
      });

      if (!result.valid) {
        throw new IamError("AUTH_RECENT_AUTH_INVALID");
      }
      return reply.send(
        successEnvelope(
          { valid: true, user_id: result.userId, auth_level: result.authLevel, fresh_until_utc: result.freshUntilUtc },
          meta(request),
        ),
      );
    },
  );
}
