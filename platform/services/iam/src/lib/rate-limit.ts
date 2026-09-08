/**
 * IAM-01 rate-limit / account-lockout baseline (decision #5, IAM-FR-016/010).
 *
 * Enforced and recorded entirely within the IAM schema (`iam.account_lockout`) — never the
 * foundation schema, which would violate the F3(c) isolation being proven this pass. Scoped
 * by (scope_hash, action) so login/mfa/reset/refresh each have independent counters; the
 * scope_hash itself is caller-supplied (typically a hash of the normalised identifier) so no
 * raw identifier is required here.
 */
import type { PoolClient } from "pg";
import { publishAudit } from "@aix/foundation";
import { IamError } from "./errors.js";
import { sha256Hex } from "./session.js";

export type LockoutAction = "login" | "mfa" | "reset" | "refresh";

export interface LockoutThresholds {
  maxAttempts: number;
  lockoutMinutes: number;
}

export function lockoutScopeHash(...parts: string[]): string {
  return sha256Hex(parts.join(":"));
}

/**
 * Fail closed BEFORE attempting the sensitive operation if the scope is currently locked.
 * Throws — use in flows where "still locked" needs no additional audit write (the audit
 * event was already emitted at the moment the scope transitioned into "locked", by
 * `recordFailure` below).
 */
export async function assertNotLocked(
  client: PoolClient,
  input: { scopeHash: string; action: LockoutAction },
): Promise<void> {
  const state = await checkLocked(client, input);
  if (state.locked) {
    throw new IamError("AUTH_ACCOUNT_LOCKED");
  }
}

/**
 * Non-throwing lockout check. Used by route handlers that need to emit a tagged
 * "iam.login_rate_limited"-style audit event on EVERY throttled attempt (not just the one
 * that caused the lock) and therefore must stay inside a committing `withTransaction` call
 * rather than letting a thrown error roll the audit write back — mirrors the tagged-outcome
 * pattern used by `rotateRefreshToken` in lib/session.ts.
 */
export async function checkLocked(
  client: PoolClient,
  input: { scopeHash: string; action: LockoutAction },
): Promise<{ locked: boolean; lockedUntilUtc: string | null }> {
  const rows = await client.query<{ locked_until_utc: string | null }>(
    `SELECT locked_until_utc FROM iam.account_lockout WHERE scope_hash = $1 AND action = $2`,
    [input.scopeHash, input.action],
  );
  const lockedUntil = rows.rows[0]?.locked_until_utc ?? null;
  const locked = Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now());
  return { locked, lockedUntilUtc: lockedUntil };
}

/**
 * Record a failed attempt; locks the scope once `maxAttempts` is reached within the window
 * (progressive: each failure while already locked extends `locked_until_utc`). Emits
 * `iam.account_locked` the moment the scope transitions into a locked state.
 */
export async function recordFailure(
  client: PoolClient,
  input: { scopeHash: string; action: LockoutAction; userId: string | null; thresholds: LockoutThresholds },
): Promise<{ locked: boolean; failedCount: number }> {
  const rows = await client.query<{ failed_count: number; locked_until_utc: string | null }>(
    `INSERT INTO iam.account_lockout (scope_hash, user_id, action, failed_count, last_failure_at_utc)
     VALUES ($1,$2,$3,1,now())
     ON CONFLICT (scope_hash, action) DO UPDATE
       SET failed_count = iam.account_lockout.failed_count + 1,
           user_id = COALESCE(EXCLUDED.user_id, iam.account_lockout.user_id),
           last_failure_at_utc = now()
     RETURNING failed_count, locked_until_utc`,
    [input.scopeHash, input.userId, input.action],
  );
  const row = rows.rows[0];
  const failedCount = row?.failed_count ?? 1;
  const alreadyLocked = row?.locked_until_utc && new Date(row.locked_until_utc).getTime() > Date.now();

  if (failedCount >= input.thresholds.maxAttempts) {
    const lockedUntil = new Date(Date.now() + input.thresholds.lockoutMinutes * 60_000).toISOString();
    await client.query(`UPDATE iam.account_lockout SET locked_until_utc = $3 WHERE scope_hash = $1 AND action = $2`, [
      input.scopeHash,
      input.action,
      lockedUntil,
    ]);
    if (!alreadyLocked) {
      await publishAudit(client, {
        event_type: "iam.account_locked",
        source_module: "IAM-01",
        actor_id: input.userId ?? "unknown",
        actor_type: "user",
        entity_type: "account_lockout",
        entity_id: input.scopeHash,
        metadata: { action: input.action, failed_count: failedCount },
      });
    }
    return { locked: true, failedCount };
  }
  return { locked: false, failedCount };
}

export async function resetOnSuccess(
  client: PoolClient,
  input: { scopeHash: string; action: LockoutAction },
): Promise<void> {
  await client.query(
    `UPDATE iam.account_lockout SET failed_count = 0, locked_until_utc = NULL, progressive_delay_until_utc = NULL
      WHERE scope_hash = $1 AND action = $2`,
    [input.scopeHash, input.action],
  );
}
