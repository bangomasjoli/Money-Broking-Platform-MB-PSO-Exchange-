/**
 * AML-01 Phase 3C — route-triggered monitoring run persistence + candidate selection (confirmed
 * decision D3: route-triggered monitoring ONLY — no external scheduler, no cron, no queue
 * scheduler; a `monitoring_run` row exists only because `POST /internal/aml1/monitoring-runs` was
 * called). `routes/monitoring.ts` is the only caller.
 *
 * Candidate selection ("select due subjects based on latest screening/provider attempt
 * information", confirmed Phase 3C requirement) always resolves each subject's LATEST screening
 * request first (`DISTINCT ON (subject_type, subject_ref) ... ORDER BY created_at_utc DESC`) —a
 * subject whose latest request is still `requested` (in-flight) or `failed` is NEVER selected this
 * run: an in-flight subject is already being processed (selecting it too would immediately race
 * against migration 039's own partial unique index), and a `failed` latest attempt is left for a
 * `manual` re-screen rather than silently retried by an automated run (no unbounded retry inside
 * one run — confirmed requirement). This is a deliberate simplification, not an oversight.
 *
 *   - `periodic_due` — a subject is due when its latest COMPLETED screen's `completed_at_utc` is
 *     older than the configured due-window (`AML1_RESCREEN_DUE_DAYS`, see config.ts).
 *   - `list_version_changed` — a subject is due when its latest completed screen's own successful
 *     provider attempt used a `provider_list_version` that differs from the operator-supplied
 *     `current_list_version` request field (no separate list-version registry table exists this
 *     phase — out of Phase 3C scope; the caller is the source of truth for "what changed").
 *
 * `rescreen_overdue` risk-signal emission (confirmed decision D9's third bullet, "for overdue
 * screening") happens ONLY for `periodic_due` candidates — being selected under that trigger IS the
 * overdue condition; `list_version_changed` candidates are not "overdue" in that sense (their prior
 * screen may be recent) and never get this signal type.
 */
import type { PoolClient } from "pg";
import { publishAudit } from "@aix/foundation";
import { emitRiskSignal } from "./risk-signals.js";
import { selectStuckScreeningRows } from "./stuck-screening.js";
import { Aml1Error } from "./errors.js";

export interface MonitoringCandidate {
  subjectType: string;
  subjectRef: string;
  subjectParentRef: string | null;
  sourceScreeningRequestId: string;
}

interface CandidateRow {
  subject_type: string;
  subject_ref: string;
  subject_parent_ref: string | null;
  screening_request_id: string;
}

/** `periodic_due` candidate selection — see file header comment. */
export async function selectPeriodicDueCandidates(client: PoolClient, dueBeforeUtc: Date, batchSize: number): Promise<MonitoringCandidate[]> {
  const res = await client.query<CandidateRow>(
    `WITH latest AS (
       SELECT DISTINCT ON (subject_type, subject_ref)
         subject_type, subject_ref, subject_parent_ref, screening_request_id, status, completed_at_utc
       FROM aml1.screening_request
       ORDER BY subject_type, subject_ref, created_at_utc DESC
     )
     SELECT subject_type, subject_ref, subject_parent_ref, screening_request_id
     FROM latest
     WHERE status = 'completed' AND completed_at_utc < $1
     ORDER BY completed_at_utc ASC
     LIMIT $2`,
    [dueBeforeUtc.toISOString(), batchSize],
  );
  return res.rows.map((r) => ({ subjectType: r.subject_type, subjectRef: r.subject_ref, subjectParentRef: r.subject_parent_ref, sourceScreeningRequestId: r.screening_request_id }));
}

/** `list_version_changed` candidate selection — see file header comment. */
export async function selectListVersionChangedCandidates(client: PoolClient, currentListVersion: string, batchSize: number): Promise<MonitoringCandidate[]> {
  const res = await client.query<CandidateRow>(
    `WITH latest AS (
       SELECT DISTINCT ON (sr.subject_type, sr.subject_ref)
         sr.subject_type, sr.subject_ref, sr.subject_parent_ref, sr.screening_request_id, sr.status,
         spa.status AS attempt_status, spa.provider_list_version
       FROM aml1.screening_request sr
       JOIN aml1.screening_provider_attempt spa ON spa.screening_request_id = sr.screening_request_id
       ORDER BY sr.subject_type, sr.subject_ref, sr.created_at_utc DESC
     )
     SELECT subject_type, subject_ref, subject_parent_ref, screening_request_id
     FROM latest
     WHERE status = 'completed' AND attempt_status = 'succeeded' AND provider_list_version IS DISTINCT FROM $1
     ORDER BY subject_type, subject_ref
     LIMIT $2`,
    [currentListVersion, batchSize],
  );
  return res.rows.map((r) => ({ subjectType: r.subject_type, subjectRef: r.subject_ref, subjectParentRef: r.subject_parent_ref, sourceScreeningRequestId: r.screening_request_id }));
}

/** Emits a `rescreen_overdue` risk signal (severity `medium`) for every candidate, subject to
 * `lib/risk-signals.ts`'s own open-duplicate suppression (a subject already carrying an open,
 * unacknowledged overdue signal does not accumulate another one on the next run). Runs INSIDE the
 * caller's own transaction — atomic with the `monitoring_run` row's own creation. */
export async function emitOverdueSignalsForCandidates(
  client: PoolClient,
  candidates: MonitoringCandidate[],
  requestedBy: string,
  requestId?: string,
  correlationId?: string,
): Promise<void> {
  for (const candidate of candidates) {
    await emitRiskSignal(client, {
      signalType: "rescreen_overdue",
      subjectType: candidate.subjectType,
      subjectRef: candidate.subjectRef,
      subjectParentRef: candidate.subjectParentRef,
      screeningRequestId: candidate.sourceScreeningRequestId,
      screeningMatchId: null,
      severity: "medium",
      actorId: requestedBy,
      actorType: "service",
      requestId,
      correlationId,
    });
  }
}

/**
 * Phase 3D — stuck-requested-subject VISIBILITY pass (confirmed decision D6: monitoring detects and
 * signals; it never auto-recovers or auto-fails a stuck request — recovery remains an explicit,
 * separately IAM-02-gated operator action, `routes/stuck-screening.ts`'s own recover route). Runs
 * INSIDE the caller's own locked transaction (`routes/monitoring.ts`'s Phase A), on the SAME
 * `lockClient` `createMonitoringRun`/`emitOverdueSignalsForCandidates` already use — atomic with
 * the run row's own creation, same posture as every other Phase 3C monitoring write.
 *
 * Deliberately NOT folded into `selectPeriodicDueCandidates`/the claim loop: a stuck subject cannot
 * be re-screened (migration 039's own partial unique index rejects it — the subject already has an
 * in-flight `requested` row), so attempting to claim it would only inflate `failures` with an
 * always-losing race, corrupting a counter that means "provider trouble". Reuses the existing
 * `rescreen_overdue` signal type (confirmed decision — no `risk_signal.signal_type` CHECK/schema
 * change; a stuck subject genuinely IS overdue for re-screening, and `lib/risk-signals.ts`'s own
 * subject-keyed dedup already prevents a repeat monitoring run from spamming a fresh signal for a
 * subject that already has one open). Runs for BOTH trigger reasons (`periodic_due` and
 * `list_version_changed`) — stuckness is trigger-independent.
 */
export async function emitStuckScreeningSignalsForCandidates(
  client: PoolClient,
  thresholdSeconds: number,
  batchSize: number,
  requestedBy: string,
): Promise<void> {
  const stuckRows = await selectStuckScreeningRows(client, thresholdSeconds, batchSize);
  for (const row of stuckRows) {
    await emitRiskSignal(client, {
      signalType: "rescreen_overdue",
      subjectType: row.subject_type,
      subjectRef: row.subject_ref,
      subjectParentRef: row.subject_parent_ref,
      screeningRequestId: row.screening_request_id,
      screeningMatchId: null,
      severity: "medium",
      actorId: requestedBy,
      actorType: "service",
    });

    await publishAudit(client, {
      event_type: "aml1.stuck_screening_detected",
      source_module: "AML-01",
      actor_id: requestedBy,
      actor_type: "service",
      entity_type: "screening_request",
      entity_id: row.screening_request_id,
      severity: "medium",
      action: "screening_request.stuck_detect",
      result: "success",
      metadata: {
        screening_request_id: row.screening_request_id,
        attempt_id: row.attempt_id,
        subject_type: row.subject_type,
        subject_ref: row.subject_ref,
        subject_parent_ref: row.subject_parent_ref,
        trigger_reason: row.trigger_reason,
        age_seconds: row.age_seconds,
      },
    });
  }
}

export interface CreateMonitoringRunInput {
  runId: string;
  triggerReason: "periodic_due" | "list_version_changed";
  requestedBy: string;
  candidatesSelected: number;
  requestId?: string;
  correlationId?: string;
}

export async function createMonitoringRun(client: PoolClient, input: CreateMonitoringRunInput): Promise<void> {
  await client.query(
    `INSERT INTO aml1.monitoring_run (run_id, status, trigger_reason, candidates_selected, requested_by, request_id, correlation_id)
     VALUES ($1,'running',$2,$3,$4,$5,$6)`,
    [input.runId, input.triggerReason, input.candidatesSelected, input.requestedBy, input.requestId ?? null, input.correlationId ?? null],
  );
  await publishAudit(client, {
    event_type: "aml1.monitoring_run_started",
    source_module: "AML-01",
    actor_id: input.requestedBy,
    actor_type: "service",
    entity_type: "monitoring_run",
    entity_id: input.runId,
    severity: "medium",
    action: "monitoring_run.start",
    result: "success",
    metadata: { monitoring_run_id: input.runId, trigger_reason: input.triggerReason, candidates_selected: input.candidatesSelected },
  });
}

export interface FinalizeMonitoringRunInput {
  runId: string;
  candidatesSelected: number;
  rescreensCreated: number;
  failures: number;
  requestedBy: string;
}

/**
 * Atomically finalizes a `running` monitoring run to `completed`/`failed` (`UPDATE ... WHERE
 * status = 'running'` — zero affected rows throws `AML1_MONITORING_RUN_INVALID_STATE`, a real,
 * reachable defence-in-depth guard, not a decorative one — see lib/errors.ts's own header comment).
 *
 * Status rule: `failed` ONLY when the run selected at least one candidate and EVERY single one
 * failed (a systemic signal — e.g. the provider itself is down for the whole batch — worth
 * distinguishing from an ordinary partial-success run); `completed` otherwise, including the
 * legitimate zero-candidates case and any run with at least one successful re-screen. A monitoring
 * run may always complete PARTIALLY (confirmed requirement) — partial success is `completed`, not
 * `failed`.
 */
export async function finalizeMonitoringRun(client: PoolClient, input: FinalizeMonitoringRunInput): Promise<"completed" | "failed"> {
  const status: "completed" | "failed" =
    input.candidatesSelected > 0 && input.rescreensCreated === 0 && input.failures === input.candidatesSelected ? "failed" : "completed";

  const res = await client.query(
    `UPDATE aml1.monitoring_run SET status = $2, rescreens_created = $3, failures = $4, completed_at_utc = now()
     WHERE run_id = $1 AND status = 'running'`,
    [input.runId, status, input.rescreensCreated, input.failures],
  );
  if ((res.rowCount ?? 0) === 0) throw new Aml1Error("AML1_MONITORING_RUN_INVALID_STATE");

  await publishAudit(client, {
    event_type: status === "failed" ? "aml1.monitoring_run_failed" : "aml1.monitoring_run_completed",
    source_module: "AML-01",
    actor_id: input.requestedBy,
    actor_type: "service",
    entity_type: "monitoring_run",
    entity_id: input.runId,
    severity: status === "failed" ? "high" : "medium",
    action: "monitoring_run.finalize",
    result: status === "failed" ? "failure" : "success",
    metadata: {
      monitoring_run_id: input.runId,
      status,
      candidates_selected: input.candidatesSelected,
      rescreens_created: input.rescreensCreated,
      failures: input.failures,
    },
  });

  return status;
}
