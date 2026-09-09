/**
 * Shared Rate-Limit Engine — core enforcement logic (WLT-01 BLOCKER-2 prerequisite, DEC-009).
 *
 * PostgreSQL-backed DUAL FIXED WINDOWS (burst + sustained), both maintained in ONE
 * `foundation.rate_limit_counter` row, incremented atomically by a single
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement — the platform's own established
 * counter idiom (`iam.account_lockout`, `foundation.idempotency_record`). No advisory lock: the
 * single atomic upsert is provably sufficient (see the transition-detection note below), so
 * none is added.
 *
 * TRANSITION-ONLY DENIAL LOGGING (load-bearing, race-free by construction): for the INCREMENT
 * path, `new_count = old_count + 1` always holds in commit order — Postgres serializes
 * concurrent `ON CONFLICT DO UPDATE`s on the same key via row-level locking, so whichever
 * request's atomic upsert returns a given `new_count` is unambiguously the request that made
 * the counter equal that value. For the ROLLOVER path, `new_count` always resets to exactly 1,
 * and 1 <= any positive `*_limit` is guaranteed by the `CHECK (... > 0)` constraint, so a
 * rollover can never itself be a deny. Both cases collapse to one identity:
 *
 *     previous_count = new_count - 1   (always true — increment adds exactly 1; rollover's
 *                                        new_count is 1, so new_count - 1 = 0, which is also
 *                                        the correct "counter did not exist / was reset"
 *                                        previous value)
 *
 * This makes "was the PREVIOUS combined state allow, and is the NEW combined state deny" a
 * PURE ARITHMETIC function of the single atomically-returned `new_count` per dimension plus the
 * (immutable, already-loaded) policy limits — no separate locking read, no CTE snapshot
 * ordering hazard (empirically verified NOT to be reliable across sibling CTEs referencing the
 * same base table by name in this Postgres version — a bare `WITH old AS (SELECT ... FOR
 * UPDATE), new AS (INSERT ... ON CONFLICT DO UPDATE ... RETURNING ...) SELECT old.*, new.* FROM
 * old, new` was proven to silently drop the row when no prior row existed, because the `old`
 * CTE's table scan does not see `new`'s write within the same statement unless explicitly
 * chained through the writing CTE's own output). Two concurrent requests that both cross a
 * threshold therefore CANNOT both see "previous was allow" — Postgres's own row-lock
 * serialization on the upsert guarantees at most one request ever observes the exact
 * `new_count == limit + 1` transition point.
 */
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { AppError, getPool, query, withTransaction, type Sql } from "@aix/foundation";

/** Saturating ceiling — mirrors the accepted architecture's own stated bound. An `int` column
 * never overflows before reaching this; arithmetic never wraps into a false "allow". */
const COUNTER_SATURATION_CEILING = 2_147_483_000;

/** Null-byte separator for subject-hash derivation — a value in any of the four fields can
 * never itself legitimately contain a NUL byte, so this guarantees the four-part concatenation
 * cannot collide across a different split of the same characters (e.g. module="AB" + bucket=
 * "CD..." vs module="ABC" + bucket="D..." are distinguishable because the separator itself can
 * never appear inside a field). */
const HASH_SEPARATOR = String.fromCharCode(0);

export interface RateLimitCheckInput {
  /** Derived from the matched consumer secret — never caller-supplied. */
  module: string;
  bucket: string;
  subjectType: string;
  subjectId: string;
  correlationId: string;
}

export type RateLimitCheckResult =
  | { decision: "allow"; limitRef: string }
  | { decision: "deny"; limitRef: string; retryAfterSeconds: number };

export interface PolicyRow {
  policy_id: string;
  burst_limit: number;
  burst_window_seconds: number;
  sustained_limit: number;
  sustained_window_seconds: number;
  version: number;
}

export interface CounterRow {
  burst_count: number;
  sustained_count: number;
  burst_window_start_utc: string;
  sustained_window_start_utc: string;
  server_now_utc: string;
}

/** Server-side subject-hash derivation — the raw `subject_id` is NEVER persisted or logged,
 * only this hash. `module` and `bucket` are folded into the hash input (not just the storage
 * key) so a caller can never construct a hash collision across a different module/bucket
 * namespace even if it somehow bypassed the composite-key isolation. */
export function deriveSubjectHash(module: string, bucket: string, subjectType: string, subjectId: string): string {
  const input = module + HASH_SEPARATOR + bucket + HASH_SEPARATOR + subjectType + HASH_SEPARATOR + subjectId;
  return createHash("sha256").update(input, "utf8").digest("hex");
}

async function loadPolicy(sql: Sql, module: string, bucket: string): Promise<PolicyRow> {
  const rows = await query<PolicyRow>(
    sql,
    `SELECT policy_id, burst_limit, burst_window_seconds, sustained_limit, sustained_window_seconds, version
       FROM foundation.rate_limit_policy
      WHERE module = $1 AND bucket = $2 AND status = 'active'`,
    [module, bucket],
  );
  const row = rows[0];
  // Missing or inactive policy — enforcement cannot be determined. Fail closed as unavailable,
  // never as an implicit allow and never as a genuine-quota 429.
  if (!row) throw new AppError("RATE_LIMIT_UNAVAILABLE");
  // Defensive sanity check against a malformed/unexpected persistence result — the DB CHECK
  // constraints already guarantee this for any row that could exist, but a corrupted read
  // (or a future schema drift) must still fail closed here rather than propagate a bad policy.
  if (
    !(row.burst_limit > 0) ||
    !(row.sustained_limit > 0) ||
    !(row.burst_window_seconds > 0) ||
    !(row.sustained_window_seconds > 0) ||
    !(row.burst_limit <= row.sustained_limit) ||
    !(row.burst_window_seconds <= row.sustained_window_seconds)
  ) {
    throw new AppError("RATE_LIMIT_UNAVAILABLE");
  }
  return row;
}

/**
 * The single atomic dual-window increment. `now()` (PostgreSQL's own clock — the sole time
 * authority) is used for every comparison and write; the caller receives `server_now_utc` from
 * the SAME statement so any post-hoc retry-after computation uses the identical time source,
 * never the application server's own clock.
 */
async function upsertCounter(
  client: PoolClient,
  module: string,
  bucket: string,
  subjectHash: string,
  burstWindowSeconds: number,
  sustainedWindowSeconds: number,
): Promise<CounterRow> {
  const rows = await query<CounterRow>(
    client,
    `INSERT INTO foundation.rate_limit_counter AS c
       (module, bucket, subject_hash, burst_window_start_utc, burst_count,
        sustained_window_start_utc, sustained_count, updated_at_utc)
     VALUES ($1, $2, $3, now(), 1, now(), 1, now())
     ON CONFLICT (module, bucket, subject_hash) DO UPDATE SET
       burst_window_start_utc = CASE
         WHEN c.burst_window_start_utc <= now() - make_interval(secs => $4) THEN now()
         ELSE c.burst_window_start_utc
       END,
       burst_count = CASE
         WHEN c.burst_window_start_utc <= now() - make_interval(secs => $4) THEN 1
         ELSE LEAST(c.burst_count + 1, ${COUNTER_SATURATION_CEILING})
       END,
       sustained_window_start_utc = CASE
         WHEN c.sustained_window_start_utc <= now() - make_interval(secs => $5) THEN now()
         ELSE c.sustained_window_start_utc
       END,
       sustained_count = CASE
         WHEN c.sustained_window_start_utc <= now() - make_interval(secs => $5) THEN 1
         ELSE LEAST(c.sustained_count + 1, ${COUNTER_SATURATION_CEILING})
       END,
       updated_at_utc = now()
     RETURNING burst_count, sustained_count, burst_window_start_utc, sustained_window_start_utc, now() AS server_now_utc`,
    [module, bucket, subjectHash, burstWindowSeconds, sustainedWindowSeconds],
  );
  const row = rows[0];
  if (!row) throw new AppError("RATE_LIMIT_UNAVAILABLE");
  return row;
}

export interface DecisionComputation {
  allowed: boolean;
  isTransitionToDeny: boolean;
  retryAfterSeconds: number;
}

/** Pure arithmetic — see this module's own header comment for the race-free derivation. */
export function computeDecision(counter: CounterRow, policy: PolicyRow): DecisionComputation {
  const previousBurstCount = counter.burst_count - 1;
  const previousSustainedCount = counter.sustained_count - 1;
  const previousAllowed = previousBurstCount <= policy.burst_limit && previousSustainedCount <= policy.sustained_limit;

  const newBurstAllowed = counter.burst_count <= policy.burst_limit;
  const newSustainedAllowed = counter.sustained_count <= policy.sustained_limit;
  const newAllowed = newBurstAllowed && newSustainedAllowed;

  const isTransitionToDeny = previousAllowed && !newAllowed;

  let retryAfterSeconds = 1;
  if (!newAllowed) {
    const serverNowMs = new Date(counter.server_now_utc).getTime();
    const burstResetMs = new Date(counter.burst_window_start_utc).getTime() + policy.burst_window_seconds * 1000;
    const sustainedResetMs = new Date(counter.sustained_window_start_utc).getTime() + policy.sustained_window_seconds * 1000;
    // If both windows deny, use the LATER reset (the caller genuinely cannot retry sooner).
    let resetMs = 0;
    if (!newBurstAllowed) resetMs = Math.max(resetMs, burstResetMs);
    if (!newSustainedAllowed) resetMs = Math.max(resetMs, sustainedResetMs);
    retryAfterSeconds = Math.max(1, Math.ceil((resetMs - serverNowMs) / 1000));
  }

  return { allowed: newAllowed, isTransitionToDeny, retryAfterSeconds };
}

async function insertDecisionLog(
  client: PoolClient,
  input: { module: string; bucket: string; subjectHash: string; limitRef: string; retryAfterSeconds: number; correlationId: string },
): Promise<void> {
  const decisionId = "frld_" + randomUUID();
  await client.query(
    `INSERT INTO foundation.rate_limit_decision_log
       (decision_id, scope_hash, action, decision, limit_ref, retry_after_seconds, occurred_at_utc, correlation_id)
     VALUES ($1, $2, $3, 'throttle', $4, $5, now(), $6)`,
    [decisionId, input.subjectHash, `${input.module}.${input.bucket}`, input.limitRef, input.retryAfterSeconds, input.correlationId],
  );
}

/**
 * The single entry point the route calls. Never returns a decision when enforcement could not
 * be determined — throws `AppError("RATE_LIMIT_UNAVAILABLE")` (503) instead, for: missing/
 * inactive/malformed policy, DB connection failure, or any query error. A genuine quota exceed
 * is the ONLY case that returns `decision: "deny"`.
 */
export async function checkRateLimit(input: RateLimitCheckInput): Promise<RateLimitCheckResult> {
  let limitRef: string;
  let computation: DecisionComputation;
  try {
    // Policy load and the counter transaction share ONE try/catch — a pool-unavailable or
    // query failure at EITHER step must fail closed as RATE_LIMIT_UNAVAILABLE (503), never
    // propagate as an unmapped 500. `loadPolicy` itself already throws AppError for a missing/
    // inactive/malformed row; the outer catch below re-throws any AppError unchanged and wraps
    // anything else (pool-connect failure, query error) as RATE_LIMIT_UNAVAILABLE.
    const policy = await loadPolicy(getPool(), input.module, input.bucket);
    limitRef = `${policy.policy_id}:v${policy.version}`;
    const subjectHash = deriveSubjectHash(input.module, input.bucket, input.subjectType, input.subjectId);

    computation = await withTransaction(async (client) => {
      const counter = await upsertCounter(
        client,
        input.module,
        input.bucket,
        subjectHash,
        policy.burst_window_seconds,
        policy.sustained_window_seconds,
      );
      const decision = computeDecision(counter, policy);
      // Denied request remains counted (already true — the upsert above already incremented
      // before this decision was computed) and is NEVER refunded because a later business
      // operation fails; that is entirely outside this engine's scope.
      if (decision.isTransitionToDeny) {
        await insertDecisionLog(client, {
          module: input.module,
          bucket: input.bucket,
          subjectHash,
          limitRef,
          retryAfterSeconds: decision.retryAfterSeconds,
          correlationId: input.correlationId,
        });
      }
      return decision;
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("RATE_LIMIT_UNAVAILABLE", { cause: err });
  }

  if (computation.allowed) {
    return { decision: "allow", limitRef };
  }
  return { decision: "deny", limitRef, retryAfterSeconds: computation.retryAfterSeconds };
}
