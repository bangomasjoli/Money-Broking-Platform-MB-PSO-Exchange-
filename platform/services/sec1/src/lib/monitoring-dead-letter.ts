/**
 * SEC-01 Phase 5 monitoring dead-letter write/read path (`05_Database_Design.md` §2.6;
 * `docs/implementation/SEC-01_Phase5_Implementation_Plan_v1.0.md` §8).
 *
 * A dead-letter row is written whenever a rule's own evaluation throws (malformed
 * `condition`/`threshold` jsonb, a transient DB error on the COUNT query — see
 * `lib/monitoring-rules.ts::evaluateRulesForEvent`), or when a Phase 3 integrity/seal
 * verification-failure alert-creation attempt itself fails (`routes/integrity.ts`/
 * `routes/seals.ts`). `severity` is INHERITED from the failing rule's own severity (or
 * 'critical' for a pipeline-level/verification-hook failure with no specific rule), so a
 * Critical rule's evaluation failure is itself flagged Critical — the starting point FR-032
 * ("guarantee eventual rule evaluation for Critical categories") requires.
 *
 * This module NEVER throws back to its caller for the write path — `writeMonitoringDeadLetter`
 * is the fallback-of-last-resort when monitoring itself has already failed; if the dead-letter
 * INSERT also fails, the caller (always already inside its own try/catch) swallows it rather
 * than letting a monitoring-of-monitoring failure propagate anywhere near the audit ingestion
 * or verification response path.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { AppError } from "@aix/foundation";

export type MonitoringSeverity = "info" | "low" | "medium" | "high" | "critical";
export type DeadLetterStatus = "pending" | "replayed" | "failed" | "escalated";

/** Retry_count crossing this threshold moves a dead-letter row to 'escalated' — a simple,
 * testable code-level threshold (Phase 5 plan §8/§12 risk item 5: not a documented blueprint
 * requirement, a placeholder judgment call pending a real notification/paging mechanism). */
export const DEAD_LETTER_ESCALATE_AFTER_RETRIES = 5;

/** Linear backoff: retry N is scheduled (N+1) * 5 minutes after the failed attempt. A simple,
 * documented placeholder — no scheduler exists this phase to actually consume this column
 * automatically (Phase 5 plan §8); it exists so a later scheduled-replay phase has real data to
 * work from without a further migration. */
function nextRetryDelayMs(retryCount: number): number {
  return (retryCount + 1) * 5 * 60_000;
}

export interface WriteMonitoringDeadLetterInput {
  auditEventRef: string | null;
  ruleId: string | null;
  failureReason: string;
  severity: MonitoringSeverity;
}

export async function writeMonitoringDeadLetter(
  client: PoolClient,
  input: WriteMonitoringDeadLetterInput,
): Promise<string> {
  const deadLetterId = "dlq_" + randomUUID();
  await client.query(
    `INSERT INTO sec1.monitoring_dead_letter
       (dead_letter_id, audit_event_ref, rule_id, failure_reason, severity, retry_count, status, created_at_utc, next_retry_at_utc)
     VALUES ($1,$2,$3,$4,$5,0,'pending', now(), now())`,
    [deadLetterId, input.auditEventRef, input.ruleId, input.failureReason, input.severity],
  );
  return deadLetterId;
}

export interface MonitoringDeadLetterRow {
  dead_letter_id: string;
  audit_event_ref: string | null;
  rule_id: string | null;
  failure_reason: string;
  severity: MonitoringSeverity;
  retry_count: number;
  status: DeadLetterStatus;
  created_at_utc: string;
  next_retry_at_utc: string | null;
}

interface RawDeadLetterRow {
  dead_letter_id: string;
  audit_event_ref: string | null;
  rule_id: string | null;
  failure_reason: string;
  severity: MonitoringSeverity;
  retry_count: number;
  status: DeadLetterStatus;
  created_at_utc: Date;
  next_retry_at_utc: Date | null;
}

function toRow(row: RawDeadLetterRow): MonitoringDeadLetterRow {
  return {
    ...row,
    created_at_utc: row.created_at_utc.toISOString(),
    next_retry_at_utc: row.next_retry_at_utc ? row.next_retry_at_utc.toISOString() : null,
  };
}

/** Locks the row for the duration of a replay attempt — mirrors `lockStreamForUpdate`/
 * `lookupApprovalForUpdate`'s own `SELECT ... FOR UPDATE` discipline, so two concurrent replay
 * calls against the SAME dead-letter row never race on its retry_count/status. */
export async function fetchDeadLetterForUpdate(
  client: PoolClient,
  deadLetterId: string,
): Promise<MonitoringDeadLetterRow | null> {
  const res = await client.query<RawDeadLetterRow>(
    `SELECT dead_letter_id, audit_event_ref, rule_id, failure_reason, severity, retry_count, status, created_at_utc, next_retry_at_utc
       FROM sec1.monitoring_dead_letter
      WHERE dead_letter_id = $1
      FOR UPDATE`,
    [deadLetterId],
  );
  const row = res.rows[0];
  return row ? toRow(row) : null;
}

/** Eligible = status IN ('pending','failed') AND next_retry_at_utc <= now(). Ordered oldest
 * first so a backlog drains in creation order, not arbitrarily. */
export async function listEligibleDeadLetters(client: PoolClient, limit: number): Promise<MonitoringDeadLetterRow[]> {
  const res = await client.query<RawDeadLetterRow>(
    `SELECT dead_letter_id, audit_event_ref, rule_id, failure_reason, severity, retry_count, status, created_at_utc, next_retry_at_utc
       FROM sec1.monitoring_dead_letter
      WHERE status IN ('pending','failed') AND (next_retry_at_utc IS NULL OR next_retry_at_utc <= now())
      ORDER BY created_at_utc ASC
      LIMIT $1
      FOR UPDATE`,
    [limit],
  );
  return res.rows.map(toRow);
}

/** Counts how many rows are CURRENTLY eligible for replay, regardless of the caller's own
 * requested batch size — used by `routes/alerts.ts`'s replay route to decide whether the
 * backlog itself has grown beyond a sane bound (`SEC1_ALERT_PIPELINE_BACKLOG`). */
export async function countEligibleDeadLetters(client: PoolClient): Promise<number> {
  const res = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM sec1.monitoring_dead_letter
      WHERE status IN ('pending','failed') AND (next_retry_at_utc IS NULL OR next_retry_at_utc <= now())`,
  );
  return Number(res.rows[0]?.n ?? "0");
}

/** Marks a dead-letter row 'replayed' after a successful re-evaluation. No DELETE — a
 * dead-letter row is never removed, only transitioned (Phase 5 plan §8). */
export async function markDeadLetterReplayed(client: PoolClient, deadLetterId: string): Promise<void> {
  await client.query(`UPDATE sec1.monitoring_dead_letter SET status = 'replayed' WHERE dead_letter_id = $1`, [
    deadLetterId,
  ]);
}

/**
 * Records a FAILED replay attempt: increments retry_count, overwrites failure_reason with the
 * LATEST failure (see this file's header + migration 012's own comment for why there is no
 * separate "last_error" column), and either bumps next_retry_at_utc (a future retry stays
 * possible) or escalates once `DEAD_LETTER_ESCALATE_AFTER_RETRIES` is crossed.
 */
export async function recordDeadLetterReplayFailure(
  client: PoolClient,
  row: MonitoringDeadLetterRow,
  failureReason: string,
): Promise<{ status: "failed" | "escalated"; retryCount: number }> {
  const retryCount = row.retry_count + 1;
  const escalate = retryCount >= DEAD_LETTER_ESCALATE_AFTER_RETRIES;
  const status: "failed" | "escalated" = escalate ? "escalated" : "failed";
  await client.query(
    `UPDATE sec1.monitoring_dead_letter
        SET retry_count = $2, status = $3, failure_reason = $4,
            next_retry_at_utc = $5
      WHERE dead_letter_id = $1`,
    [
      row.dead_letter_id,
      retryCount,
      status,
      failureReason,
      escalate ? null : new Date(Date.now() + nextRetryDelayMs(retryCount)).toISOString(),
    ],
  );
  return { status, retryCount };
}

/** Thrown when a caller requests a specific `dead_letter_id` that does not exist — reuses the
 * generic foundation NOT_FOUND, same discipline `lib/seal.ts::verifySealBatch` already applies
 * for a single call site rather than adding a new SEC1-specific catalogue entry. */
export function assertDeadLetterFound(row: MonitoringDeadLetterRow | null): asserts row is MonitoringDeadLetterRow {
  if (!row) {
    throw new AppError("NOT_FOUND", {
      message: "Dead-letter item not found.",
      details: [{ field: "dead_letter_id", issue: "no matching dead-letter item" }],
    });
  }
}
