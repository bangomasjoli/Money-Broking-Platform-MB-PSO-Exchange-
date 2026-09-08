/**
 * SEC-01 Phase 5 security alert store — creation (from the rule engine AND from the Phase 3
 * integrity/seal verification-failure hooks), search/detail, and lifecycle transitions
 * (`05_Database_Design.md` §2.7/§2.8; `06_State_Machine.md` §2;
 * `docs/implementation/SEC-01_Phase5_Implementation_Plan_v1.0.md`).
 *
 * `sec1.security_alert` is the one deliberately MUTABLE table in this schema (see migration
 * 012's own header comment) — this file is the SOLE owner of writes to it and to
 * `sec1.alert_triage_note`, mirroring how `lib/stream.ts` is the sole owner of
 * `sec1.audit_stream` writes.
 *
 * LIFECYCLE (06_State_Machine.md §2, enforced exactly as drawn — no transition invented beyond
 * it): `open -> assigned -> triaged -> {closed, escalated}`, `escalated -> incident_handoff`.
 * INC-01 does not exist yet, so an `escalated` alert has no forward transition this phase — it
 * simply stays `escalated` (a known, blueprint-inherited limitation, not a bug introduced here;
 * see the Phase 5 implementation notes).
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { AppError } from "@aix/foundation";
import { Sec1Error } from "./errors.js";
import type { MonitoringSeverity } from "./monitoring-dead-letter.js";

export type AlertStatus = "open" | "assigned" | "triaged" | "escalated" | "closed";
export type TriageStatus = "true_positive" | "false_positive" | "duplicate" | "expected" | "escalated";

export interface AlertRow {
  alert_id: string;
  rule_id: string | null;
  severity: MonitoringSeverity;
  status: AlertStatus;
  title: string;
  description: string | null;
  actor_user_id: string | null;
  client_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  linked_audit_events: string[];
  assigned_to: string | null;
  created_at_utc: string;
  due_at_utc: string | null;
  closed_at_utc: string | null;
  closure_reason: string | null;
  closure_evidence_ref: string | null;
}

interface RawAlertRow {
  alert_id: string;
  rule_id: string | null;
  severity: MonitoringSeverity;
  status: AlertStatus;
  title: string;
  description: string | null;
  actor_user_id: string | null;
  client_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  linked_audit_events: string[];
  assigned_to: string | null;
  created_at_utc: Date;
  due_at_utc: Date | null;
  closed_at_utc: Date | null;
  closure_reason: string | null;
  closure_evidence_ref: string | null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toAlertRow(row: RawAlertRow): AlertRow {
  return {
    ...row,
    created_at_utc: row.created_at_utc.toISOString(),
    due_at_utc: toIso(row.due_at_utc),
    closed_at_utc: toIso(row.closed_at_utc),
  };
}

const ALERT_COLUMNS = `
  alert_id, rule_id, severity, status, title, description, actor_user_id, client_id,
  entity_type, entity_id, linked_audit_events, assigned_to, created_at_utc, due_at_utc,
  closed_at_utc, closure_reason, closure_evidence_ref
`;

// =============================================================================================
// Creation — shared by lib/monitoring-rules.ts (rule engine) and routes/integrity.ts /
// routes/seals.ts (Phase 3 verification-failure hooks). Both callers are responsible for their
// OWN de-duplication check (an open alert already covering the same rule+scope, or the same
// verification entity) BEFORE calling this — this function always inserts.
// =============================================================================================

export interface CreateSystemAlertInput {
  ruleId: string | null;
  severity: MonitoringSeverity;
  title: string;
  description?: string;
  actorUserId?: string | null;
  clientId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Capped by the caller (Phase 5 plan §6: last 20) — this function does not cap it itself. */
  linkedAuditEvents?: string[];
}

export async function createSystemAlert(client: PoolClient, input: CreateSystemAlertInput): Promise<{ alertId: string }> {
  const alertId = "alert_" + randomUUID();
  await client.query(
    `INSERT INTO sec1.security_alert
       (alert_id, rule_id, severity, status, title, description, actor_user_id, client_id,
        entity_type, entity_id, linked_audit_events, created_at_utc)
     VALUES ($1,$2,$3,'open',$4,$5,$6,$7,$8,$9,$10::jsonb, now())`,
    [
      alertId,
      input.ruleId,
      input.severity,
      input.title,
      input.description ?? null,
      input.actorUserId ?? null,
      input.clientId ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      JSON.stringify(input.linkedAuditEvents ?? []),
    ],
  );
  return { alertId };
}

/** De-dup for the rule engine: an OPEN (non-closed) alert already exists for this
 * `(rule_id, scope value)` pair — see `lib/monitoring-rules.ts`'s own de-dup reasoning. Only
 * `actor_user_id`/`client_id` are supported scope columns (the two `security_alert` itself can
 * store — see migration 012's own column-choice comment). */
export async function findOpenAlertByRuleScope(
  client: PoolClient,
  ruleId: string,
  scopeColumn: "actor_user_id" | "client_id" | null,
  scopeValue: string | null,
): Promise<boolean> {
  const sql =
    scopeColumn === "actor_user_id"
      ? `SELECT 1 FROM sec1.security_alert WHERE rule_id = $1 AND status <> 'closed' AND actor_user_id = $2 LIMIT 1`
      : scopeColumn === "client_id"
        ? `SELECT 1 FROM sec1.security_alert WHERE rule_id = $1 AND status <> 'closed' AND client_id = $2 LIMIT 1`
        : `SELECT 1 FROM sec1.security_alert WHERE rule_id = $1 AND status <> 'closed' LIMIT 1`;
  const params = scopeColumn ? [ruleId, scopeValue] : [ruleId];
  const res = await client.query(sql, params);
  return (res.rowCount ?? 0) > 0;
}

/** De-dup for the Phase 3 verification-failure hooks (`entity_type`/`entity_id` reference the
 * `integrity_verification_run.verification_id` or `audit_seal_batch.seal_batch_id`) — this is
 * what makes alert creation naturally idempotent across a `verify-range`/seal-verify
 * IDEMPOTENCY-KEY replay: a replayed call recomputes the SAME verification/seal outcome, and
 * this check finds the alert the FIRST call already created rather than creating a duplicate. */
export async function findOpenAlertByEntity(client: PoolClient, entityType: string, entityId: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM sec1.security_alert WHERE entity_type = $1 AND entity_id = $2 AND status <> 'closed' LIMIT 1`,
    [entityType, entityId],
  );
  return (res.rowCount ?? 0) > 0;
}

// =============================================================================================
// Search / detail.
// =============================================================================================

export interface AlertSearchFilters {
  status?: AlertStatus;
  severity?: MonitoringSeverity;
  rule_id?: string;
  assigned_to?: string;
}

export interface AlertSearchCursor {
  /** Full-microsecond-precision text form, Postgres-rendered — same F-1-lesson discipline
   * `lib/read-query.ts` already established: never build a keyset cursor boundary from a JS
   * `Date`/`.toISOString()` (millisecond precision) against a `timestamptz` column
   * (microsecond precision), which would silently drop same-millisecond rows at page
   * boundaries. Applied proactively here from day one, not retrofitted after a bug report. */
  created_at_utc: string;
  alert_id: string;
}

export const DEFAULT_ALERT_SEARCH_LIMIT = 50;
export const MAX_ALERT_SEARCH_LIMIT = 200;

export function encodeAlertCursor(cursor: AlertSearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAlertCursor(raw: string | undefined): AlertSearchCursor | undefined {
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new AppError("VALIDATION_ERROR", { details: [{ field: "cursor", issue: "malformed cursor" }] });
  }
  const candidate = parsed as Partial<AlertSearchCursor>;
  if (typeof candidate.created_at_utc !== "string" || typeof candidate.alert_id !== "string") {
    throw new AppError("VALIDATION_ERROR", { details: [{ field: "cursor", issue: "malformed cursor" }] });
  }
  return { created_at_utc: candidate.created_at_utc, alert_id: candidate.alert_id };
}

interface RawSearchRow extends RawAlertRow {
  created_at_utc_cursor: string;
}

export async function searchAlerts(
  client: PoolClient,
  filters: AlertSearchFilters,
  limit: number,
  cursor?: AlertSearchCursor,
): Promise<{ rows: AlertRow[]; nextCursor: AlertSearchCursor | null }> {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const eq = (column: string, value: string | undefined) => {
    if (value === undefined) return;
    params.push(value);
    clauses.push(`${column} = $${params.length}`);
  };
  eq("status", filters.status);
  eq("severity", filters.severity);
  eq("rule_id", filters.rule_id);
  eq("assigned_to", filters.assigned_to);

  if (cursor) {
    params.push(cursor.created_at_utc, cursor.alert_id);
    clauses.push(`(created_at_utc, alert_id) < ($${params.length - 1}::timestamptz, $${params.length})`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const cappedLimit = Math.min(Math.max(limit, 1), MAX_ALERT_SEARCH_LIMIT);
  params.push(cappedLimit + 1);

  const result = await client.query<RawSearchRow>(
    `SELECT ${ALERT_COLUMNS},
            to_char(created_at_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_utc_cursor
       FROM sec1.security_alert
       ${where}
      ORDER BY created_at_utc DESC, alert_id DESC
      LIMIT $${params.length}`,
    params,
  );

  const hasMore = result.rows.length > cappedLimit;
  const pageRows = hasMore ? result.rows.slice(0, cappedLimit) : result.rows;
  const nextCursor: AlertSearchCursor | null =
    hasMore && pageRows.length > 0
      ? { created_at_utc: pageRows[pageRows.length - 1]!.created_at_utc_cursor, alert_id: pageRows[pageRows.length - 1]!.alert_id }
      : null;

  return { rows: pageRows.map(toAlertRow), nextCursor };
}

export async function getAlertDetail(client: PoolClient, alertId: string): Promise<AlertRow | null> {
  const res = await client.query<RawAlertRow>(`SELECT ${ALERT_COLUMNS} FROM sec1.security_alert WHERE alert_id = $1`, [
    alertId,
  ]);
  const row = res.rows[0];
  return row ? toAlertRow(row) : null;
}

/** `SELECT ... FOR UPDATE` — mirrors `lockStreamForUpdate`/`lookupApprovalForUpdate`'s own
 * discipline so two concurrent lifecycle calls against the SAME alert never race on its
 * status. Used by assign/triage/close, each within its own transaction. */
export async function lockAlertForUpdate(client: PoolClient, alertId: string): Promise<AlertRow | null> {
  const res = await client.query<RawAlertRow>(
    `SELECT ${ALERT_COLUMNS} FROM sec1.security_alert WHERE alert_id = $1 FOR UPDATE`,
    [alertId],
  );
  const row = res.rows[0];
  return row ? toAlertRow(row) : null;
}

// =============================================================================================
// Lifecycle transitions.
// =============================================================================================

const ASSIGNABLE_FROM: readonly AlertStatus[] = ["open", "assigned"];
const TRIAGEABLE_FROM: readonly AlertStatus[] = ["assigned", "triaged"];
const CLOSABLE_FROM: AlertStatus = "triaged";

export interface AssignAlertInput {
  alertId: string;
  assignedTo: string;
}

export async function assignAlert(client: PoolClient, input: AssignAlertInput): Promise<AlertRow> {
  const alert = await lockAlertForUpdate(client, input.alertId);
  if (!alert) throw new AppError("NOT_FOUND", { details: [{ field: "alert_id", issue: "no matching alert" }] });
  if (!ASSIGNABLE_FROM.includes(alert.status)) {
    throw new Sec1Error("SEC1_ALERT_INVALID_TRANSITION", {
      message: `Alert cannot be assigned from status '${alert.status}'.`,
    });
  }
  await client.query(`UPDATE sec1.security_alert SET status = 'assigned', assigned_to = $2 WHERE alert_id = $1`, [
    input.alertId,
    input.assignedTo,
  ]);
  const updated = await lockAlertForUpdate(client, input.alertId);
  return updated as AlertRow;
}

export interface TriageAlertInput {
  alertId: string;
  reviewerUserId: string;
  triageStatus: TriageStatus;
  note?: string;
  evidenceRefs?: string[];
}

export async function triageAlert(client: PoolClient, input: TriageAlertInput): Promise<AlertRow> {
  const alert = await lockAlertForUpdate(client, input.alertId);
  if (!alert) throw new AppError("NOT_FOUND", { details: [{ field: "alert_id", issue: "no matching alert" }] });
  if (!TRIAGEABLE_FROM.includes(alert.status)) {
    throw new Sec1Error("SEC1_ALERT_INVALID_TRANSITION", {
      message: `Alert cannot be triaged from status '${alert.status}'.`,
    });
  }
  const noteId = "note_" + randomUUID();
  await client.query(
    `INSERT INTO sec1.alert_triage_note (note_id, alert_id, reviewer_user_id, triage_status, note, evidence_refs, created_at_utc)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb, now())`,
    [noteId, input.alertId, input.reviewerUserId, input.triageStatus, input.note ?? null, JSON.stringify(input.evidenceRefs ?? [])],
  );
  const nextStatus: AlertStatus = input.triageStatus === "escalated" ? "escalated" : "triaged";
  await client.query(`UPDATE sec1.security_alert SET status = $2 WHERE alert_id = $1`, [input.alertId, nextStatus]);
  const updated = await lockAlertForUpdate(client, input.alertId);
  return updated as AlertRow;
}

export interface CloseAlertInput {
  alertId: string;
  closureReason: string;
  closureEvidenceRef: string;
}

/**
 * Performs the DB write for closure ONLY — the Critical-severity approval/decision-token
 * verification (an IAM-02 HTTP round-trip) is owned by `routes/alerts.ts`, called BEFORE this
 * function, using an alert snapshot read outside any row lock (never hold a Postgres row lock
 * across a network call). This function re-locks and re-validates the transition (`status ===
 * 'triaged'`) itself, so a state change between the route's pre-check and this write (a TOCTOU
 * race) still fails closed rather than silently closing a no-longer-triaged alert.
 */
export async function closeAlert(client: PoolClient, input: CloseAlertInput): Promise<AlertRow> {
  const alert = await lockAlertForUpdate(client, input.alertId);
  if (!alert) throw new AppError("NOT_FOUND", { details: [{ field: "alert_id", issue: "no matching alert" }] });
  if (alert.status !== CLOSABLE_FROM) {
    throw new Sec1Error("SEC1_ALERT_INVALID_TRANSITION", {
      message: `Alert cannot be closed from status '${alert.status}'; only a 'triaged' alert can be closed.`,
    });
  }
  await client.query(
    `UPDATE sec1.security_alert
        SET status = 'closed', closed_at_utc = now(), closure_reason = $2, closure_evidence_ref = $3
      WHERE alert_id = $1`,
    [input.alertId, input.closureReason, input.closureEvidenceRef],
  );
  const updated = await lockAlertForUpdate(client, input.alertId);
  return updated as AlertRow;
}

// =============================================================================================
// Verification-failure alert hooks (Phase 5 plan §6) — closes the `failed -> alert_created`
// state-machine transition (`06_State_Machine.md` §4) that Phase 3 built the `failed` half of
// but never wired to an alert. Called from `routes/integrity.ts`/`routes/seals.ts` AFTER their
// own already-accepted verification transaction has committed (never inside it — the
// verification RESULT is authoritative and must be returned regardless of whether this
// best-effort alert-creation side-effect succeeds; see those routes' own call sites). Both
// helpers are naturally idempotent via `findOpenAlertByEntity` — a `verify-range`/seal-verify
// call replayed under the same Idempotency-Key (or, for seals.ts, simply re-run) recomputes the
// SAME outcome and finds the alert the FIRST call already created rather than duplicating it.
// `rule_id = null` — these alerts do not come from the rule engine.
// =============================================================================================

const INTEGRITY_VERIFICATION_ENTITY_TYPE = "integrity_verification_run";
const SEAL_BATCH_ENTITY_TYPE = "audit_seal_batch";

/** Same race class as `lib/monitoring-rules.ts::evaluateOneRule`'s own advisory-lock fix: the
 * de-dup check (`findOpenAlertByEntity`) and the eventual INSERT are two separate statements
 * with no row to lock yet. For `audit_seal_batch`, `entity_id` (the `seal_batch_id`) is STABLE
 * across repeated calls to the same `/seal-batches/:id/verify` route (which, per that route's
 * own header comment, re-runs `verifySealBatch` unconditionally on every call, including
 * concurrent ones) — so two concurrent failed-verification calls for the SAME batch could each
 * see "no open alert yet" before either commits. For `integrity_verification_run`,
 * `verification_id` is a fresh UUID per invocation (routes/integrity.ts's own idempotent-replay
 * path reuses the SAME prior id, which is already correctly de-duped), so this lock is a
 * structural no-op there — applied anyway for consistency and defense-in-depth, at negligible
 * cost. */
async function lockAlertEntity(client: PoolClient, entityType: string, entityId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`sec1.alert_entity:${entityType}:${entityId}`]);
}

export interface FailedIntegrityVerificationInput {
  verificationId: string;
  streamId: string;
  fromSequenceNo: number;
  toSequenceNo: number;
  gapCount: number;
  mismatchCount: number;
}

/** Returns `true` if a NEW alert was created, `false` if an open alert already covered this
 * verification run (de-dup) — callers do not need the distinction for correctness, only for
 * test assertions. */
export async function createAlertForFailedIntegrityVerification(
  client: PoolClient,
  input: FailedIntegrityVerificationInput,
): Promise<boolean> {
  await lockAlertEntity(client, INTEGRITY_VERIFICATION_ENTITY_TYPE, input.verificationId);
  const alreadyOpen = await findOpenAlertByEntity(client, INTEGRITY_VERIFICATION_ENTITY_TYPE, input.verificationId);
  if (alreadyOpen) return false;
  await createSystemAlert(client, {
    ruleId: null,
    severity: "critical",
    title: `Audit integrity verification failed (${input.streamId})`,
    description: `Integrity verification ${input.verificationId} over ${input.streamId} [${input.fromSequenceNo}, ${input.toSequenceNo}] failed: gap_count=${input.gapCount}, mismatch_count=${input.mismatchCount}.`,
    entityType: INTEGRITY_VERIFICATION_ENTITY_TYPE,
    entityId: input.verificationId,
  });
  return true;
}

export interface FailedSealVerificationInput {
  sealBatchId: string;
}

export async function createAlertForFailedSealVerification(
  client: PoolClient,
  input: FailedSealVerificationInput,
): Promise<boolean> {
  await lockAlertEntity(client, SEAL_BATCH_ENTITY_TYPE, input.sealBatchId);
  const alreadyOpen = await findOpenAlertByEntity(client, SEAL_BATCH_ENTITY_TYPE, input.sealBatchId);
  if (alreadyOpen) return false;
  await createSystemAlert(client, {
    ruleId: null,
    severity: "critical",
    title: `Audit seal verification failed (${input.sealBatchId})`,
    description: `Seal batch ${input.sealBatchId} failed hash re-verification (recomputed batch hash did not match the stored value).`,
    entityType: SEAL_BATCH_ENTITY_TYPE,
    entityId: input.sealBatchId,
  });
  return true;
}
