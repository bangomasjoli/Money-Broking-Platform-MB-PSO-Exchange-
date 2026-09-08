/**
 * AML-01 Phase 3D — stuck requested-screening detection + operator recovery (closes Phase 3C
 * MEDIUM-1: a crashed/orphaned `screening_request` left at `status='requested'` with a `pending`
 * provider attempt permanently blocks re-screening for its subject, via migration 039's own
 * `idx_aml1_screening_request_one_inflight_per_subject` partial unique index — and, before this
 * phase, was never even visible to an operator or to monitoring).
 *
 * Confirmed Phase 3D decisions:
 *   D1 — recovery marks the stuck request/attempt `failed`. No evidence is ever deleted, no new
 *        `cancelled` status is added, the provider call is never resumed, and a re-screen is never
 *        auto-started — recovery and re-screen stay separate, independently auditable actions.
 *   D4 — `reason_code` is a closed enum (`STUCK_SCREENING_REASON_CODES` below). No free text is
 *        ever accepted or stored — a constrained code is non-PII by construction, so it can be
 *        written straight into audit metadata (see `recoverStuckScreening`'s own `publishAudit`
 *        call) without a new decision-request table to hold it.
 *   D5 — the stuck-age threshold is `AML1_STUCK_SCREENING_THRESHOLD_SECONDS` (config.ts), with a
 *        hard floor. `recoverStuckScreening` re-checks THIS SAME configured value against the
 *        request's actual age inside its own transaction — a caller-supplied age is never trusted
 *        (mirrors the general "never rely only on a list route's snapshot" discipline).
 *
 * A request is "stuck" when it is `status='requested'` AND its LATEST provider attempt is old
 * enough — `selectStuckScreeningRows` below is deliberately NOT restricted to a `pending` attempt
 * status: a `requested` request whose latest attempt is NOT `pending` is a narrower, rarer crash
 * shape (a crash between the attempt's own terminal UPDATE and the request's own terminal UPDATE,
 * inside `lib/screening-execution.ts`'s TX2) that this phase surfaces (`recoverable=false` in the
 * safe projection) but deliberately does NOT recover — `recoverStuckScreening` requires the latest
 * attempt to be `pending`, and rejects anything else as `AML1_STUCK_SCREENING_INVALID_STATE`. This
 * is a documented Phase 3D limitation, not an oversight — see the implementation notes' own
 * carry-forward list.
 *
 * No new `aml1` table, no schema change of any kind — see `recoverStuckScreening`'s own header
 * comment for why the existing `screening_request`/`screening_provider_attempt` columns (and their
 * EXISTING runtime grants) already suffice.
 */
import { publishAudit, query, withTransaction, type Sql } from "@aix/foundation";
import { Aml1Error } from "./errors.js";

export const STUCK_SCREENING_REASON_CODES = [
  "process_crash_orphan",
  "provider_call_abandoned",
  "deployment_interruption",
  "manual_operator_recovery",
] as const;
export type StuckScreeningReasonCode = (typeof STUCK_SCREENING_REASON_CODES)[number];

export interface StuckScreeningRow {
  screening_request_id: string;
  subject_type: string;
  subject_ref: string;
  subject_parent_ref: string | null;
  status: string;
  trigger_reason: string | null;
  rescreen_of_request_id: string | null;
  attempt_id: string;
  attempt_status: string;
  created_at_utc: string;
  age_seconds: number;
}

export interface SafeStuckScreeningResponse {
  screening_request_id: string;
  subject_type: string;
  subject_ref: string;
  subject_parent_ref: string | null;
  status: string;
  trigger_reason: string | null;
  rescreen_of_request_id: string | null;
  attempt_id: string;
  attempt_status: string;
  age_seconds: number;
  created_at_utc: string;
  recoverable: boolean;
}

/** Single safe-response projection point (mirrors every other AML-01 route's own precedent) —
 * never `name`/`registration_number`/`date_of_birth`/`nationality`/`matched_name`/`match_detail`/
 * `score`/raw provider payload; this query never selects any of those columns in the first place,
 * but the explicit projection keeps the same "never spread a raw DB row into a response" discipline
 * every other AML-01 route follows. `recoverable` is derived, never stored — a `requested` request
 * whose latest attempt is not `pending` is listed but `recoverable=false` (see file header). */
export function safeStuckScreeningResponse(row: StuckScreeningRow): SafeStuckScreeningResponse {
  return {
    screening_request_id: row.screening_request_id,
    subject_type: row.subject_type,
    subject_ref: row.subject_ref,
    subject_parent_ref: row.subject_parent_ref,
    status: row.status,
    trigger_reason: row.trigger_reason,
    rescreen_of_request_id: row.rescreen_of_request_id,
    attempt_id: row.attempt_id,
    attempt_status: row.attempt_status,
    age_seconds: row.age_seconds,
    created_at_utc: row.created_at_utc,
    recoverable: row.attempt_status === "pending",
  };
}

/**
 * Detection query — every `status='requested'` screening request whose `created_at_utc` is older
 * than `thresholdSeconds`, joined to its LATEST provider attempt (every `requested` row has exactly
 * one attempt inserted in the same TX1 — `lib/screening-execution.ts`'s `beginScreening` — an INNER
 * JOIN encodes that structural invariant the same way `lib/rescreen.ts`'s own snapshot lookup
 * does). Accepts either a `Pool` (the list route, via `getPool()`) or a `PoolClient` (monitoring's
 * own locked transaction — `lib/monitoring.ts`'s `emitStuckScreeningSignalsForCandidates`) — both
 * share the same `.query()` shape `@aix/foundation`'s own `query()` helper wraps.
 */
export async function selectStuckScreeningRows(sql: Sql, thresholdSeconds: number, limit: number): Promise<StuckScreeningRow[]> {
  const cutoffUtc = new Date(Date.now() - thresholdSeconds * 1000).toISOString();
  return query<StuckScreeningRow>(
    sql as Sql,
    `WITH latest_attempt AS (
       SELECT DISTINCT ON (screening_request_id) screening_request_id, attempt_id, status AS attempt_status
       FROM aml1.screening_provider_attempt
       ORDER BY screening_request_id, created_at_utc DESC
     )
     SELECT
       sr.screening_request_id, sr.subject_type, sr.subject_ref, sr.subject_parent_ref, sr.status,
       sr.trigger_reason, sr.rescreen_of_request_id, sr.created_at_utc,
       la.attempt_id, la.attempt_status,
       -- ::int (not ::bigint) so node-postgres returns a native JS number, not a string — a
       -- request's age in seconds never approaches int overflow (~68 years).
       EXTRACT(EPOCH FROM (now() - sr.created_at_utc))::int AS age_seconds
     FROM aml1.screening_request sr
     JOIN latest_attempt la ON la.screening_request_id = sr.screening_request_id
     WHERE sr.status = 'requested' AND sr.created_at_utc < $1
     ORDER BY sr.created_at_utc ASC
     LIMIT $2`,
    [cutoffUtc, limit],
  );
}

export interface RecoverStuckScreeningInput {
  screeningRequestId: string;
  actorId: string;
  reasonCode: StuckScreeningReasonCode;
  thresholdSeconds: number;
}

export type RecoverStuckScreeningOutcome =
  | { kind: "not_found" }
  | { kind: "invalid_state" }
  | { kind: "too_fresh" }
  | { kind: "recovered"; row: StuckScreeningRow };

/**
 * The single-step recovery transaction (confirmed decision D2 — no maker-checker; the route's own
 * IAM-02 `permission_granted` assertion is the gate, this function assumes it already passed).
 *
 * Marks the request `failed` and its latest attempt `failed` with a `stuck_recovery_`-prefixed
 * `failure_reason_code` — distinguishing an operator-recovered orphan from an ordinary provider
 * failure reason (e.g. `provider_unavailable`) IN THE SAME COLUMN, so no new schema/grant is
 * needed. `FOR UPDATE` on both rows is the SAME lock `lib/screening-execution.ts`'s own TX2
 * concurrency guard takes on `screening_request` — the two transactions serialize on that row: a
 * late-landing TX2 either loses this race (observes `status != 'requested'` and aborts, per that
 * function's own header comment) or wins it (this function then observes `status != 'requested'`
 * here and returns `invalid_state` — recovery never overwrites a request that just legitimately
 * completed/failed on its own).
 *
 * Zero `aml1` schema change: `screening_request.(status, version)` and
 * `screening_provider_attempt.(status, failure_reason_code, checked_at_utc)` are already granted to
 * `role_aml1_runtime` (Phase 1 / Phase 3B) — this function writes nothing new.
 */
export async function recoverStuckScreening(input: RecoverStuckScreeningInput): Promise<RecoverStuckScreeningOutcome> {
  try {
    return await withTransaction(async (client) => {
      const requestRows = await client.query<{
        status: string;
        created_at_utc: string;
        subject_type: string;
        subject_ref: string;
        subject_parent_ref: string | null;
        trigger_reason: string | null;
        rescreen_of_request_id: string | null;
      }>(
        `SELECT status, created_at_utc, subject_type, subject_ref, subject_parent_ref, trigger_reason, rescreen_of_request_id
           FROM aml1.screening_request WHERE screening_request_id = $1 FOR UPDATE`,
        [input.screeningRequestId],
      );
      const requestRow = requestRows.rows[0];
      if (!requestRow) return { kind: "not_found" };

      const attemptRows = await client.query<{ attempt_id: string; status: string }>(
        `SELECT attempt_id, status FROM aml1.screening_provider_attempt
           WHERE screening_request_id = $1 ORDER BY created_at_utc DESC LIMIT 1 FOR UPDATE`,
        [input.screeningRequestId],
      );
      const attemptRow = attemptRows.rows[0];

      if (requestRow.status !== "requested" || !attemptRow || attemptRow.status !== "pending") {
        return { kind: "invalid_state" };
      }

      const ageSeconds = Math.floor((Date.now() - new Date(requestRow.created_at_utc).getTime()) / 1000);
      if (ageSeconds < input.thresholdSeconds) return { kind: "too_fresh" };

      const failureReasonCode = `stuck_recovery_${input.reasonCode}`;

      await client.query(`UPDATE aml1.screening_request SET status = 'failed', version = version + 1 WHERE screening_request_id = $1`, [
        input.screeningRequestId,
      ]);
      await client.query(
        `UPDATE aml1.screening_provider_attempt SET status = 'failed', failure_reason_code = $2, checked_at_utc = now() WHERE attempt_id = $1`,
        [attemptRow.attempt_id, failureReasonCode],
      );

      await publishAudit(client, {
        event_type: "aml1.stuck_screening_recovered",
        source_module: "AML-01",
        actor_id: input.actorId,
        actor_type: "user",
        entity_type: "screening_request",
        entity_id: input.screeningRequestId,
        severity: "high",
        action: "screening_request.recover",
        result: "success",
        reason_code: input.reasonCode,
        metadata: {
          screening_request_id: input.screeningRequestId,
          attempt_id: attemptRow.attempt_id,
          subject_type: requestRow.subject_type,
          subject_ref: requestRow.subject_ref,
          subject_parent_ref: requestRow.subject_parent_ref,
          trigger_reason: requestRow.trigger_reason,
          age_seconds: ageSeconds,
          reason_code: input.reasonCode,
        },
      });

      return {
        kind: "recovered",
        row: {
          screening_request_id: input.screeningRequestId,
          subject_type: requestRow.subject_type,
          subject_ref: requestRow.subject_ref,
          subject_parent_ref: requestRow.subject_parent_ref,
          status: "failed",
          trigger_reason: requestRow.trigger_reason,
          rescreen_of_request_id: requestRow.rescreen_of_request_id,
          attempt_id: attemptRow.attempt_id,
          attempt_status: "failed",
          created_at_utc: requestRow.created_at_utc,
          age_seconds: ageSeconds,
        },
      };
    });
  } catch (err) {
    if (err instanceof Aml1Error) throw err;
    throw new Aml1Error("AML1_AUDIT_REQUIRED", { cause: err });
  }
}
