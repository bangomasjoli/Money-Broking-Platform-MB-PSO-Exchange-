/**
 * KYC-01 Phase 1 — case/checklist domain helpers: case-type validation, the deterministic default
 * checklist seeded at case creation, evidence-reference shape validation, and the safe-response
 * projection points every route reuses.
 *
 * Deliberately pure / DB-free where possible (mirrors `lib/screening.ts`'s own posture in AML-01 —
 * business rules that don't need a connection stay easy to unit-test without one).
 *
 * PHASE 2A — timestamp normalization at the DB boundary (approved Phase 2 planning report D5).
 * `node-postgres` returns `timestamptz` columns as `Date` objects at runtime, not the `string`
 * every row interface in this file declares — the same gap `outcome-engine.ts`'s own MED-1
 * "CORRECTNESS NOTE" documents. Rather than widen every consumer to accept `Date | string`
 * (which legitimises the hazard and lets it spread — MED-1's root cause was exactly this kind of
 * silent mismatch), `normalizeTimestamp`/the `normalize*Row` functions below convert every
 * `timestamptz` field to a genuine ISO-8601 string EXACTLY ONCE, at the point each row leaves the
 * DB layer — every fetcher in this file, and every route that runs its own inline query, calls the
 * matching `normalize*Row` immediately on the result. KYC-01 only; no other module's row
 * interfaces are touched, and no repo-wide `timestamptz` hardening is attempted here (carried
 * forward as a separate platform item — see the Phase 2 planning report §5/§13 R6).
 */
import { query, type Sql } from "@aix/foundation";
import { Kyc1Error } from "./errors.js";

/** Converts a `timestamptz` value to a genuine ISO-8601 string regardless of whether the driver
 * handed back a `Date` (the real runtime shape) or a `string` (what every row interface claims).
 * Exported so `outcome-engine.ts`'s own `normalizeCddOutcomeRow` can reuse the identical
 * conversion rather than duplicating it. */
export function normalizeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export const KYC_CASE_TYPES = ["individual", "entity", "authorised_party"] as const;
export type KycCaseType = (typeof KYC_CASE_TYPES)[number];

export const KYC_CASE_STATUSES = ["pending_documents", "completed", "remediation"] as const;
export type KycCaseStatus = (typeof KYC_CASE_STATUSES)[number];

export const CHECKLIST_ITEM_STATUSES = ["missing", "received", "verified", "rejected", "expired"] as const;
export type ChecklistItemStatus = (typeof CHECKLIST_ITEM_STATUSES)[number];

export interface DefaultChecklistEntry {
  document_type: string;
  required: boolean;
}

/**
 * Deterministic Phase 1 placeholder checklist per case type — the blueprint's own final document
 * checklist by client type/jurisdiction is an explicit Open Item (§13 #2 of
 * 01_Module_Blueprint.md), not decided. This is a documented, clearly-labelled MINIMUM baseline,
 * not a claim of finality — a later phase revising the taxonomy only needs to touch this one
 * table's data, not any route/table shape.
 */
export const DEFAULT_CHECKLIST_BY_CASE_TYPE: Record<KycCaseType, DefaultChecklistEntry[]> = {
  individual: [{ document_type: "identity_document", required: true }],
  entity: [
    { document_type: "certificate_of_incorporation", required: true },
    { document_type: "authorised_representative_evidence", required: true },
  ],
  authorised_party: [
    { document_type: "identity_document", required: true },
    { document_type: "authority_evidence", required: true },
  ],
};

/** Detects migration 042's partial unique index violation
 * (`idx_kyc1_kyc_case_one_active_per_anchor`) so the handoff route can map it to
 * `KYC1_CASE_ALREADY_EXISTS` instead of a generic error — mirrors AML-01's own
 * `isInFlightDuplicateViolation` precedent (`lib/screening-execution.ts`). */
export function isDuplicateActiveCaseViolation(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === "23505" && pgErr?.constraint === "idx_kyc1_kyc_case_one_active_per_anchor";
}

/**
 * Rejects an evidence reference that is blank, oversized, or SHAPED LIKE inline document content
 * (a `data:` URI, or a string long enough / dense enough to plausibly be base64-encoded file
 * bytes rather than a short external pointer/token). KYC-01 never stores raw document content —
 * this is the structural refusal at the input boundary, not merely a house-style convention.
 */
const MAX_EVIDENCE_REF_LENGTH = 256;
/** A bare heuristic ceiling — a genuine external reference (S3 key, DMS token, URL) is never this
 * long; base64-encoded file content routinely is. Kept generous to avoid false-positives on long
 * but legitimate reference tokens. */
const SUSPECT_INLINE_CONTENT_LENGTH = 200;
const BASE64_LIKE = /^[A-Za-z0-9+/]+={0,2}$/;

export function validateEvidenceRef(evidenceRef: string): void {
  const trimmed = evidenceRef.trim();
  if (!trimmed) {
    throw new Kyc1Error("KYC1_EVIDENCE_INVALID", { details: [{ field: "evidence_ref", issue: "must not be blank" }] });
  }
  if (trimmed.length > MAX_EVIDENCE_REF_LENGTH) {
    throw new Kyc1Error("KYC1_EVIDENCE_INVALID", { details: [{ field: "evidence_ref", issue: "exceeds maximum reference length" }] });
  }
  if (trimmed.toLowerCase().startsWith("data:")) {
    throw new Kyc1Error("KYC1_EVIDENCE_INVALID", { details: [{ field: "evidence_ref", issue: "inline data URIs are not accepted; provide an external reference" }] });
  }
  if (trimmed.length > SUSPECT_INLINE_CONTENT_LENGTH && BASE64_LIKE.test(trimmed)) {
    throw new Kyc1Error("KYC1_EVIDENCE_INVALID", { details: [{ field: "evidence_ref", issue: "value looks like inline document content, not an external reference" }] });
  }
}

/** Maps a case's `case_type` to which `verification_result.result_type` values are meaningful for
 * it — used by the verification-results route to reject a mismatched submission
 * (`KYC1_VERIFICATION_RESULT_INVALID`) and by the outcome engine to know which checks apply. */
export function applicableResultTypesForCaseType(caseType: KycCaseType): Array<"document" | "identity" | "entity"> {
  if (caseType === "entity") return ["document", "entity"];
  // individual / authorised_party — both are natural-person verification shapes this phase.
  return ["document", "identity"];
}

export interface KycCaseRow {
  case_id: string;
  application_id: string;
  client_id: string | null;
  party_id: string | null;
  case_type: string;
  status: string;
  current_outcome_status: string | null;
  current_outcome_id: string | null;
  created_from_handoff_id: string | null;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface SafeKycCaseResponse {
  case_id: string;
  application_id: string;
  client_id: string | null;
  party_id: string | null;
  case_type: string;
  status: string;
  current_outcome_status: string | null;
  current_outcome_id: string | null;
  created_from_handoff_id: string | null;
  created_at_utc: string;
  updated_at_utc: string;
}

/** Normalizes `created_at_utc`/`updated_at_utc` — see this file's own header comment. Every route
 * that obtains a `KycCaseRow` from its own inline query calls this immediately on the result. */
export function normalizeKycCaseRow(row: KycCaseRow): KycCaseRow {
  return { ...row, created_at_utc: normalizeTimestamp(row.created_at_utc), updated_at_utc: normalizeTimestamp(row.updated_at_utc) };
}

/** Single safe-response projection point (mirrors every other AML-01/CLT-01 route's own
 * precedent) — never spreads a raw DB row into a response. No PII to exclude this phase (the
 * schema carries none), but the discipline is applied unconditionally, not only when there is
 * something to hide. */
export function safeKycCaseResponse(row: KycCaseRow): SafeKycCaseResponse {
  return {
    case_id: row.case_id,
    application_id: row.application_id,
    client_id: row.client_id,
    party_id: row.party_id,
    case_type: row.case_type,
    status: row.status,
    current_outcome_status: row.current_outcome_status,
    current_outcome_id: row.current_outcome_id,
    created_from_handoff_id: row.created_from_handoff_id,
    created_at_utc: row.created_at_utc,
    updated_at_utc: row.updated_at_utc,
  };
}

export interface ChecklistItemRow {
  checklist_item_id: string;
  case_id: string;
  document_type: string;
  required: boolean;
  status: string;
  evidence_ref: string | null;
  evidence_hash: string | null;
  expiry_date: string | null;
  verification_result_id: string | null;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface SafeChecklistItemResponse {
  checklist_item_id: string;
  case_id: string;
  document_type: string;
  required: boolean;
  status: string;
  expiry_date: string | null;
  verification_result_id: string | null;
  created_at_utc: string;
  updated_at_utc: string;
}

/** Normalizes `created_at_utc`/`updated_at_utc` — see this file's own header comment. */
export function normalizeChecklistItemRow(row: ChecklistItemRow): ChecklistItemRow {
  return { ...row, created_at_utc: normalizeTimestamp(row.created_at_utc), updated_at_utc: normalizeTimestamp(row.updated_at_utc) };
}

/**
 * Single safe-response projection point for ROUTINE checklist reads/writes (`GET .../checklist`
 * and `POST .../evidence`'s own confirmation response) — never spreads a raw DB row into a
 * response.
 *
 * PHASE 3A (D3): `evidence_ref`/`evidence_hash` are DELIBERATELY EXCLUDED here, a narrowing from
 * Phase 1's own posture — both are now sensitive-gated values, reachable only via the new
 * `GET /internal/kyc1/checklist-items/:checklist_item_id/sensitive-detail` route
 * (`routes/sensitive-evidence.ts`, `safeChecklistItemSensitiveResponse` below), which is IAM-02
 * `kyc1.evidence.sensitive_read`-gated and audit-before-return. This function is the SOLE
 * projection point for both the checklist-read route and the evidence-add route's own
 * confirmation response, so narrowing it here structurally guarantees the sensitive route is the
 * ONLY KYC-01 route that ever returns either field — not merely a per-route convention. */
export function safeChecklistItemResponse(row: ChecklistItemRow): SafeChecklistItemResponse {
  return {
    checklist_item_id: row.checklist_item_id,
    case_id: row.case_id,
    document_type: row.document_type,
    required: row.required,
    status: row.status,
    expiry_date: row.expiry_date,
    verification_result_id: row.verification_result_id,
    created_at_utc: row.created_at_utc,
    updated_at_utc: row.updated_at_utc,
  };
}

export interface SafeChecklistItemSensitiveResponse {
  checklist_item_id: string;
  case_id: string;
  document_type: string;
  status: string;
  evidence_ref: string | null;
  evidence_hash: string | null;
  expiry_date: string | null;
}

/**
 * PHASE 3A — the ONE safe-response projection point that returns `evidence_ref`/`evidence_hash`.
 * Used ONLY by `routes/sensitive-evidence.ts`'s single-record read route. Both fields are an
 * OPAQUE external pointer + hash — never raw document content, never base64, never a `data:` URI
 * (`validateEvidenceRef` structurally refuses anything shaped like inline content at write time) —
 * this route returns an evidence REFERENCE, not a document. Deliberately does NOT include
 * `required`/`verification_result_id`/`created_at_utc`/`updated_at_utc` — the approved Phase 3A
 * response field set is exactly the seven fields below, no more. */
export function safeChecklistItemSensitiveResponse(row: ChecklistItemRow): SafeChecklistItemSensitiveResponse {
  return {
    checklist_item_id: row.checklist_item_id,
    case_id: row.case_id,
    document_type: row.document_type,
    status: row.status,
    evidence_ref: row.evidence_ref,
    evidence_hash: row.evidence_hash,
    expiry_date: row.expiry_date,
  };
}

export interface VerificationResultRow {
  verification_result_id: string;
  case_id: string;
  checklist_item_id: string | null;
  source_type: string;
  source_id: string;
  result_type: string;
  result_status: string;
  payload_hash: string;
  received_at_utc: string;
}

export interface SafeVerificationResultResponse {
  verification_result_id: string;
  case_id: string;
  checklist_item_id: string | null;
  source_type: string;
  source_id: string;
  result_type: string;
  result_status: string;
  received_at_utc: string;
}

/** Normalizes `received_at_utc` — see this file's own header comment. This is the exact field
 * whose runtime `Date`-vs-declared-`string` mismatch produced the MED-1 bug
 * (`outcome-engine.ts`'s own "CORRECTNESS NOTE") — normalizing it here means every consumer
 * downstream of a fetcher (including `computeCddOutcome`'s own input) now receives a genuine
 * string, and the comparator's continued relational-only discipline becomes defence-in-depth
 * rather than the sole protection. */
export function normalizeVerificationResultRow(row: VerificationResultRow): VerificationResultRow {
  return { ...row, received_at_utc: normalizeTimestamp(row.received_at_utc) };
}

/** `payload_hash` is deliberately EXCLUDED from the response — it is internal tamper-evidence
 * (recomputable server-side for verification), never a value a caller needs to see. */
export function safeVerificationResultResponse(row: VerificationResultRow): SafeVerificationResultResponse {
  return {
    verification_result_id: row.verification_result_id,
    case_id: row.case_id,
    checklist_item_id: row.checklist_item_id,
    source_type: row.source_type,
    source_id: row.source_id,
    result_type: row.result_type,
    result_status: row.result_status,
    received_at_utc: row.received_at_utc,
  };
}

/** Fetches every verification result for a case — shared by the outcome-computation engine's own
 * data-gathering step. Accepts either a `Pool` or a `PoolClient`, same posture as
 * `fetchChecklistItems`.
 *
 * MED-1 fix: ordered `received_at_utc DESC, verification_result_id DESC` — a deterministic,
 * fully-specified retrieval order (two rows can share `received_at_utc` under concurrent
 * submission; `verification_result_id` is `UNIQUE`, so it always breaks the tie the same way).
 * `lib/outcome-engine.ts`'s own `computeCddOutcome` re-sorts with the identical tie-break
 * internally regardless of the order rows arrive in, so this ordering is defence-in-depth, not the
 * sole guarantee of correctness — but it keeps this query's own natural "most-recent-first" reading
 * order meaningful on its own, independent of the pure function that consumes it. */
export async function fetchVerificationResults(sql: Sql, caseId: string): Promise<VerificationResultRow[]> {
  const rows = await query<VerificationResultRow>(
    sql,
    `SELECT verification_result_id, case_id, checklist_item_id, source_type, source_id, result_type, result_status, payload_hash, received_at_utc
       FROM kyc1.verification_result WHERE case_id = $1 ORDER BY received_at_utc DESC, verification_result_id DESC`,
    [caseId],
  );
  return rows.map(normalizeVerificationResultRow);
}

/** Fetches every checklist item for a case, ordered for deterministic response shape. Shared by
 * the checklist-read route and the outcome-computation engine (both need the SAME view of "what
 * does this case's checklist look like right now"). Accepts either a `Pool` (ordinary reads) or a
 * `PoolClient` (inside a transaction, e.g. compute-outcome) — mirrors AML-01's own
 * `selectStuckScreeningRows` precedent. */
export async function fetchChecklistItems(sql: Sql, caseId: string): Promise<ChecklistItemRow[]> {
  const rows = await query<ChecklistItemRow>(
    sql,
    `SELECT checklist_item_id, case_id, document_type, required, status, evidence_ref, evidence_hash, expiry_date, verification_result_id, created_at_utc, updated_at_utc
       FROM kyc1.document_checklist_item WHERE case_id = $1 ORDER BY document_type`,
    [caseId],
  );
  return rows.map(normalizeChecklistItemRow);
}

/**
 * PHASE 3A — fetches a single checklist item by its own globally-unique `checklist_item_id` (no
 * `case_id` needed — `checklist_item_id` carries a `UNIQUE` constraint, migration 042). Deliberately
 * PURE: returns `undefined` rather than throwing on a miss, so `routes/sensitive-evidence.ts` can
 * call this AFTER its own IAM-02 permission check and decide the not-found throw itself
 * (permission-before-existence — the row must never be materialised, nor a throw decided, before
 * authorization is established). */
export async function fetchChecklistItemById(sql: Sql, checklistItemId: string): Promise<ChecklistItemRow | undefined> {
  const rows = await query<ChecklistItemRow>(
    sql,
    `SELECT checklist_item_id, case_id, document_type, required, status, evidence_ref, evidence_hash, expiry_date, verification_result_id, created_at_utc, updated_at_utc
       FROM kyc1.document_checklist_item WHERE checklist_item_id = $1`,
    [checklistItemId],
  );
  const row = rows[0];
  return row ? normalizeChecklistItemRow(row) : undefined;
}

/**
 * KYC-01 Phase 2A — every `kyc_case` row for an application, regardless of status (approved D1:
 * KYC-01 publishes over its OWN case set only — it does not call CLT-01 to confirm the party
 * roster is complete; see `lib/authoritative-outcome.ts`'s own header comment for the full
 * rationale). No ordering guarantee is load-bearing here — `computeAuthoritativeOutcome` is a
 * pure function that groups/tie-breaks deterministically regardless of input array order (proven
 * directly by its own order-independence tests), so this fetcher does not need to impose one.
 */
export async function fetchCasesForApplication(sql: Sql, applicationId: string): Promise<KycCaseRow[]> {
  const rows = await query<KycCaseRow>(
    sql,
    `SELECT case_id, application_id, client_id, party_id, case_type, status, current_outcome_status, current_outcome_id, created_from_handoff_id, created_at_utc, updated_at_utc
       FROM kyc1.kyc_case WHERE application_id = $1`,
    [applicationId],
  );
  return rows.map(normalizeKycCaseRow);
}
