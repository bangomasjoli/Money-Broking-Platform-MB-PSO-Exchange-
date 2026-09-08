/**
 * AML-01 Phase 3C — risk-signal emission (with duplicate suppression), and the safe-response
 * projection for `GET /internal/aml1/risk-signals`.
 *
 * Confirmed decision D4: AML-01 EMITS signals only — it never freezes, blocks, debits, settles,
 * trades, or mutates any downstream module. No code in this file (or anywhere in Phase 3C) ever
 * calls a WLT/DEP/WDR/TRD/LED/INC route or holds a grant into their schema.
 *
 * Unlike `lib/screening.ts` / `lib/match-disposition.ts` (deliberately pure, no DB/HTTP), this
 * file performs real DB writes — same posture `lib/screening-execution.ts` already established for
 * Phase 3C — every write happens INSIDE the caller's own transaction (`client: PoolClient`), never
 * opening one of its own, so a signal emission is always atomic with whatever screening/disposition
 * write produced it.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { publishAudit } from "@aix/foundation";
import type { ScreeningMatchCategory } from "./screening.js";

export const RISK_SIGNAL_TYPES = ["confirmed_hit", "potential_match_unresolved", "rescreen_overdue"] as const;
export type RiskSignalType = (typeof RISK_SIGNAL_TYPES)[number];

export const RISK_SIGNAL_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type RiskSignalSeverity = (typeof RISK_SIGNAL_SEVERITIES)[number];

export const RISK_SIGNAL_STATUSES = ["open", "acknowledged", "superseded"] as const;
export type RiskSignalStatus = (typeof RISK_SIGNAL_STATUSES)[number];

/**
 * Conservative severity assignment for a `potential_match_unresolved` signal surfaced by a
 * re-screen/monitoring run (confirmed decision D9: "severity=high or medium, decide
 * conservatively"). `sanctions` is treated as the highest-risk of the three match categories — a
 * sanctions hit carries the most severe downstream consequence (a sanctioned party) — everything
 * else (`pep`/`adverse_media`) defaults to `medium`. Never `critical`: that severity is reserved
 * for `confirmed_hit` (a HUMAN-confirmed match via Phase 2B disposition), never an unresolved
 * provider-surfaced match no human has reviewed yet.
 */
export function severityForUnresolvedMatch(category: ScreeningMatchCategory): "high" | "medium" {
  return category === "sanctions" ? "high" : "medium";
}

export interface RiskSignalInput {
  signalType: RiskSignalType;
  subjectType: string;
  subjectRef: string;
  subjectParentRef: string | null;
  screeningRequestId: string | null;
  screeningMatchId: string | null;
  severity: RiskSignalSeverity;
  actorId: string;
  actorType: "user" | "service";
  requestId?: string;
  correlationId?: string;
}

/**
 * Duplicate-signal suppression (confirmed decision D9: "should prevent obvious duplicates if
 * practical"). Dedup key depends on `signal_type`:
 *   - `confirmed_hit` / `potential_match_unresolved` — keyed on `screening_match_id`: a specific
 *     match row should never accumulate more than one OPEN signal of the same type. In practice
 *     `confirmed_hit` can never actually collide (a `screening_match` row transitions
 *     `potential_match` -> `confirmed_hit` exactly once, terminally — `lib/match-disposition.ts`'s
 *     own `validateMatchTransition` already makes a second confirm on the same match row
 *     unreachable), but the check is real and unconditional, not decorative.
 *   - `rescreen_overdue` — keyed on `(subject_type, subject_ref)`: there is no single
 *     `screening_match_id` for this signal type (it represents the SUBJECT being overdue, not a
 *     specific match) — repeated monitoring runs must not spam a fresh overdue signal every batch
 *     for a subject that already has one open and unacknowledged.
 */
async function findOpenDuplicate(client: PoolClient, input: RiskSignalInput): Promise<boolean> {
  if (input.screeningMatchId) {
    const res = await client.query(`SELECT 1 FROM aml1.risk_signal WHERE signal_type = $1 AND screening_match_id = $2 AND status = 'open'`, [
      input.signalType,
      input.screeningMatchId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }
  const res = await client.query(`SELECT 1 FROM aml1.risk_signal WHERE signal_type = $1 AND subject_type = $2 AND subject_ref = $3 AND status = 'open'`, [
    input.signalType,
    input.subjectType,
    input.subjectRef,
  ]);
  return (res.rowCount ?? 0) > 0;
}

export type EmitRiskSignalOutcome = { kind: "created"; signalId: string } | { kind: "duplicate_suppressed" };

/**
 * Creates a `risk_signal` row (INSIDE the caller's own transaction) and publishes
 * `aml1.risk_signal_emitted` — unless an OPEN duplicate already exists for the dedup key (see
 * `findOpenDuplicate`), in which case this is a no-op. Audit metadata carries only non-PII
 * evidence pointers/classification — never a subject name, matched_name, match_detail, or score
 * (confirmed decision D11's own PII exclusion list).
 */
export async function emitRiskSignal(client: PoolClient, input: RiskSignalInput): Promise<EmitRiskSignalOutcome> {
  if (await findOpenDuplicate(client, input)) {
    return { kind: "duplicate_suppressed" };
  }

  const signalId = "aml1sig_" + randomUUID();
  await client.query(
    `INSERT INTO aml1.risk_signal
       (signal_id, signal_type, subject_type, subject_ref, subject_parent_ref, screening_request_id, screening_match_id, severity, status, request_id, correlation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10)`,
    [
      signalId,
      input.signalType,
      input.subjectType,
      input.subjectRef,
      input.subjectParentRef,
      input.screeningRequestId,
      input.screeningMatchId,
      input.severity,
      input.requestId ?? null,
      input.correlationId ?? null,
    ],
  );

  await publishAudit(client, {
    event_type: "aml1.risk_signal_emitted",
    source_module: "AML-01",
    actor_id: input.actorId,
    actor_type: input.actorType,
    entity_type: "risk_signal",
    entity_id: signalId,
    severity: input.severity,
    action: "risk_signal.emit",
    result: "success",
    metadata: {
      signal_id: signalId,
      signal_type: input.signalType,
      subject_type: input.subjectType,
      subject_ref: input.subjectRef,
      subject_parent_ref: input.subjectParentRef,
      screening_match_id: input.screeningMatchId,
      severity: input.severity,
      status: "open",
    },
  });

  return { kind: "created", signalId };
}

export interface RiskSignalRow {
  signal_id: string;
  signal_type: string;
  subject_type: string;
  subject_ref: string;
  subject_parent_ref: string | null;
  screening_request_id: string | null;
  screening_match_id: string | null;
  severity: string;
  status: string;
  created_at_utc: string;
  acknowledged_at_utc: string | null;
}

export interface SafeRiskSignalResponse {
  signal_id: string;
  signal_type: string;
  subject_type: string;
  subject_ref: string;
  subject_parent_ref: string | null;
  screening_request_id: string | null;
  screening_match_id: string | null;
  severity: string;
  status: string;
  created_at_utc: string;
  acknowledged_at_utc: string | null;
}

/** Single safe-response projection point (mirrors every other AML-01 route's own precedent) —
 * exactly the approved Phase 3C field set. Never `matched_name`/`match_detail`/`score`/subject
 * name/`registration_number`/DOB/nationality — this table has no such columns in the first place,
 * but the explicit projection keeps the same "never spread a raw DB row into a response" discipline
 * every other AML-01 route follows. */
export function safeRiskSignalResponse(row: RiskSignalRow): SafeRiskSignalResponse {
  return {
    signal_id: row.signal_id,
    signal_type: row.signal_type,
    subject_type: row.subject_type,
    subject_ref: row.subject_ref,
    subject_parent_ref: row.subject_parent_ref,
    screening_request_id: row.screening_request_id,
    screening_match_id: row.screening_match_id,
    severity: row.severity,
    status: row.status,
    created_at_utc: row.created_at_utc,
    acknowledged_at_utc: row.acknowledged_at_utc,
  };
}
