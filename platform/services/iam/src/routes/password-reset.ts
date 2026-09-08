/**
 * Password-reset completeness patch (IAM-01 Security Review Opus v0.1, §4 "must close before
 * final sign-off"). Blueprint §04.2.3-2.4: `POST /auth/password-reset/request` and
 * `POST /auth/password-reset/confirm`.
 *
 * No-enumeration discipline (blueprint §09 §3/§5): the request endpoint returns the SAME
 * generic success envelope (`{status: "if_eligible_notification_sent"}`) whether or not the
 * identifier resolves to a user — the route handler always sends this response; only the
 * server-side audit/outbox trail (visible to SEC-01, never to the caller) distinguishes the
 * two cases. No email/SMS provider exists this pass — the "delivery" is an outbox event
 * placeholder a future notification worker will drain, exactly like every other async side
 * effect in this codebase (§3.8).
 */
import { randomUUID } from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  beginIdempotent,
  completeIdempotent,
  enqueueOutbox,
  publishAudit,
  successEnvelope,
  systemTime,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { IamError } from "../lib/errors.js";
import { hashPassword, validatePasswordPolicy } from "../lib/password.js";
import { checkLocked, lockoutScopeHash, recordFailure, resetOnSuccess } from "../lib/rate-limit.js";
import { generateOpaqueToken, insertAuthEvent, revokeAllSessionsForUser, sha256Hex } from "../lib/session.js";

const ResetRequestBody = Type.Object(
  { identifier: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);

const ResetConfirmBody = Type.Object(
  {
    reset_token: Type.String({ minLength: 1, maxLength: 512 }),
    new_password: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

type ConfirmOutcome =
  | { tag: "duplicate"; resultRef: string | null }
  | { tag: "locked" }
  | { tag: "invalid_token" }
  | { tag: "policy_failed"; issues: string[] }
  | { tag: "reset" };

export async function registerPasswordResetRoutes(app: FastifyInstance): Promise<void> {
  const rateLimit = app.config.rateLimit;

  app.post(
    "/auth/password-reset/request",
    { schema: { body: ResetRequestBody } },
    async (request, reply) => {
      const body = request.body as { identifier: string };
      const idempotencyKey = requireIdempotencyKey(request);
      const correlationId = request.ctx.correlation_id;

      const identifierNormalised = body.identifier.trim().toLowerCase();
      const identifierHash = sha256Hex(identifierNormalised);
      const scopeHash = lockoutScopeHash("reset", identifierHash);
      const idemScope: IdempotencyScope = {
        actorId: "anon_" + identifierHash,
        actorType: "user",
        action: "iam.auth.password_reset.request",
        key: idempotencyKey,
        request: body,
        sourceModule: "IAM-01",
      };

      // The response is IDENTICAL regardless of outcome (no enumeration) — the transaction
      // below only decides what happens server-side (token minted or not); it never changes
      // what is sent back to the caller.
      await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return;

        const lockState = await checkLocked(client, { scopeHash, action: "reset" });
        if (lockState.locked) {
          await completeIdempotent(client, idemScope, "locked");
          return;
        }

        const userRows = await client.query<{ user_id: string; status: string }>(
          `SELECT user_id, status FROM iam.user_identity WHERE identifier_hash = $1`,
          [identifierHash],
        );
        const user = userRows.rows[0];

        // Every request (whether or not it resolves to a user) counts toward the throttle —
        // otherwise an attacker could distinguish "exists" vs. "doesn't" by which one gets
        // rate-limited first.
        await recordFailure(client, {
          scopeHash,
          action: "reset",
          userId: user?.user_id ?? null,
          thresholds: { maxAttempts: rateLimit.passwordResetMaxAttempts, lockoutMinutes: rateLimit.passwordResetLockoutMinutes },
        });

        if (!user || user.status !== "active") {
          await publishAudit(client, {
            event_type: "iam.password_reset_requested",
            source_module: "IAM-01",
            actor_id: user?.user_id ?? "anon_" + identifierHash,
            actor_type: "user",
            entity_type: "user_identity",
            entity_id: user?.user_id ?? identifierHash,
            metadata: { user_found: false },
          });
          await insertAuthEvent(client, {
            eventType: "iam.password_reset_requested",
            userId: user?.user_id ?? null,
            result: "blocked",
            correlationId,
          });
          await completeIdempotent(client, idemScope, "no_such_identifier");
          return;
        }

        const resetId = "pwreset_" + randomUUID();
        const resetToken = generateOpaqueToken(); // opaque, hash-only at rest (decision #2)
        const tokenHash = sha256Hex(resetToken);
        const expiresAtUtc = new Date(systemTime.nowDate().getTime() + 30 * 60_000).toISOString();

        await client.query(
          `INSERT INTO iam.password_reset_token
             (reset_id, user_id, token_hash, status, expires_at_utc, requested_at_utc, request_context_ref)
           VALUES ($1,$2,$3,'active',$4,now(),$5)`,
          [resetId, user.user_id, tokenHash, expiresAtUtc, correlationId],
        );

        // Delivery placeholder (no email/SMS provider this pass) — a future notification
        // worker drains this topic. The raw token itself is NEVER put in the outbox payload
        // (decision #2 discipline: hash-only at rest, and outbox rows are durable/queryable).
        await enqueueOutbox(client, {
          topic: "notification.delivery",
          event_type: "iam.password_reset_requested_delivery",
          payload_ref: JSON.stringify({ user_id: user.user_id, reset_id: resetId, channel: "email_placeholder" }),
          correlation_id: correlationId,
        });

        await publishAudit(client, {
          event_type: "iam.password_reset_requested",
          source_module: "IAM-01",
          actor_id: user.user_id,
          actor_type: "user",
          entity_type: "user_identity",
          entity_id: user.user_id,
          metadata: { user_found: true, reset_id: resetId },
        });
        await insertAuthEvent(client, {
          eventType: "iam.password_reset_requested",
          userId: user.user_id,
          result: "success",
          correlationId,
        });
        await completeIdempotent(client, idemScope, resetId);
      });

      return reply.send(successEnvelope({ status: "if_eligible_notification_sent" }, meta(request)));
    },
  );

  app.post(
    "/auth/password-reset/confirm",
    { schema: { body: ResetConfirmBody } },
    async (request, reply) => {
      const body = request.body as { reset_token: string; new_password: string };
      const idempotencyKey = requireIdempotencyKey(request);
      const correlationId = request.ctx.correlation_id;
      const tokenHash = sha256Hex(body.reset_token);
      const scopeHash = lockoutScopeHash("reset_confirm", tokenHash);
      const idemScope: IdempotencyScope = {
        actorId: "resettok_" + tokenHash.slice(0, 16),
        actorType: "user",
        action: "iam.auth.password_reset.confirm",
        key: idempotencyKey,
        request: { reset_token: body.reset_token },
        sourceModule: "IAM-01",
      };

      const outcome: ConfirmOutcome = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") return { tag: "duplicate", resultRef: idem.resultRef };

        const lockState = await checkLocked(client, { scopeHash, action: "reset" });
        if (lockState.locked) {
          await completeIdempotent(client, idemScope, "locked");
          return { tag: "locked" };
        }

        const tokenRows = await client.query<{ reset_id: string; user_id: string; status: string; expires_at_utc: string }>(
          `SELECT reset_id, user_id, status, expires_at_utc FROM iam.password_reset_token WHERE token_hash = $1`,
          [tokenHash],
        );
        const token = tokenRows.rows[0];
        if (!token || token.status !== "active" || new Date(token.expires_at_utc).getTime() <= Date.now() || !token.user_id) {
          await recordFailure(client, {
            scopeHash,
            action: "reset",
            userId: token?.user_id ?? null,
            thresholds: { maxAttempts: rateLimit.passwordResetMaxAttempts, lockoutMinutes: rateLimit.passwordResetLockoutMinutes },
          });
          await completeIdempotent(client, idemScope, "invalid_token");
          return { tag: "invalid_token" };
        }

        const policy = validatePasswordPolicy(body.new_password);
        if (!policy.ok) {
          await completeIdempotent(client, idemScope, "policy_failed");
          return { tag: "policy_failed", issues: policy.issues };
        }

        // S1 gap-closing patch: iam.session/iam.refresh_token carry FORCE RLS ownership;
        // scope before revokeAllSessionsForUser touches them (it also self-scopes, this line
        // is redundant-but-harmless defence-in-depth given user_id is already known here).
        await client.query("SELECT set_config('aix.user_id', $1, true)", [token.user_id]);

        const hashed = await hashPassword(body.new_password);
        await client.query(
          `UPDATE iam.credential_password
              SET password_hash = $2, hash_algorithm = $3, hash_params = $4, password_changed_at_utc = now(),
                  must_change_password = false, failed_attempt_count = 0, locked_until_utc = NULL, updated_at_utc = now()
            WHERE user_id = $1`,
          [token.user_id, hashed.hash, hashed.algorithm, JSON.stringify(hashed.params)],
        );
        await client.query(
          `INSERT INTO iam.password_history (user_id, password_hash_fingerprint, algorithm, created_at_utc)
           VALUES ($1,$2,$3,now())`,
          [token.user_id, hashed.hash, hashed.algorithm],
        );

        const revokedCount = await revokeAllSessionsForUser(client, { userId: token.user_id, reason: "password_reset" });

        await client.query(
          `UPDATE iam.password_reset_token SET status = 'used', used_at_utc = now()
             WHERE reset_id = $1 AND status = 'active'`,
          [token.reset_id],
        );

        await publishAudit(client, {
          event_type: "iam.password_reset_completed",
          source_module: "IAM-01",
          actor_id: token.user_id,
          actor_type: "user",
          entity_type: "user_identity",
          entity_id: token.user_id,
          metadata: { reset_id: token.reset_id, revoked_session_count: revokedCount },
        });
        await insertAuthEvent(client, {
          eventType: "iam.password_reset_completed",
          userId: token.user_id,
          result: "success",
          correlationId,
        });
        await resetOnSuccess(client, { scopeHash, action: "reset" });
        await completeIdempotent(client, idemScope, token.reset_id);
        return { tag: "reset" };
      });

      switch (outcome.tag) {
        case "duplicate":
          return reply.send(
            successEnvelope({ status: "duplicate_submission", reference: outcome.resultRef }, meta(request)),
          );
        case "locked":
          throw new IamError("AUTH_RATE_LIMITED");
        case "invalid_token":
          throw new IamError("AUTH_RESET_TOKEN_INVALID");
        case "policy_failed":
          throw new IamError("AUTH_PASSWORD_POLICY_FAILED", {
            details: outcome.issues.map((issue) => ({ field: "new_password", issue })),
          });
        case "reset":
          return reply.send(successEnvelope({ status: "password_reset" }, meta(request)));
      }
    },
  );
}
