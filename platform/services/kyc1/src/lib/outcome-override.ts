/**
 * KYC-01 Phase 3B — pure manual-override logic (payload canonicalisation, self-override SoD check,
 * safe-response projections, reason-code guards). No DB access, no HTTP —
 * `routes/outcome-override.ts` is the only caller. Kept pure and DB-free where possible, mirroring
 * `lib/match-disposition.ts`'s own posture in AML-01 (the shape this file deliberately follows,
 * not imported from — F3(c)).
 *
 * D2 (approved Phase 3B planning report): the ONLY permitted override target is the case-level
 * `cdd_outcome` status. `verification_result`/`document_checklist_item`/publication-eligibility/
 * evidence-conflict/stale-publication refusals are all explicitly FORBIDDEN override targets —
 * there is no code anywhere in this file (or `routes/outcome-override.ts`) that can mutate any of
 * them; the only table this phase's apply route ever INSERTs into (never UPDATEs) is `cdd_outcome`
 * itself, and the only table it ever UPDATEs is `kyc_case`'s own existing four-column grant
 * (`status`/`current_outcome_status`/`current_outcome_id`/`updated_at_utc` — identical to what
 * `compute-outcome` already writes, via the SAME `caseStatusForOutcome` helper,
 * `routes/outcome.ts`).
 */
import { Kyc1Error } from "./errors.js";

export const OVERRIDE_TARGET_TYPES = ["cdd_outcome"] as const;
export type OverrideTargetType = (typeof OVERRIDE_TARGET_TYPES)[number];

export const OVERRIDE_TARGET_OUTCOME_STATUSES = ["pass", "fail", "remediation_required"] as const;
export type OverrideTargetOutcomeStatus = (typeof OVERRIDE_TARGET_OUTCOME_STATUSES)[number];

/** D9 (approved Phase 3B planning report): bounded reason codes only — no free-text `reason`
 * field, a deliberate divergence from AML-01's own `match_disposition_decision_request.reason`.
 * Extends the "no free text in audit payloads" property KYC-01 already applies structurally to
 * `cdd_outcome.outcome_reason` (migration 042) to the override REQUEST's own reason as well. */
export const OVERRIDE_REASON_CODES = ["system_derived_outcome_incorrect", "manual_evidence_review", "documented_compliance_exception"] as const;
export type OverrideReasonCode = (typeof OVERRIDE_REASON_CODES)[number];

/** The `cdd_outcome.outcome_reason` value written by the apply route for each target status — an
 * engine-generated code, never operator-typed free text, mirroring every other reason code this
 * table has ever carried (`all_required_checks_passed`, `required_evidence_incomplete`, etc.).
 * D5's own recompute-lock (`routes/outcome.ts`) detects these three values specifically. */
export function manualOverrideOutcomeReason(targetStatus: OverrideTargetOutcomeStatus): "manual_override_pass" | "manual_override_fail" | "manual_override_remediation_required" {
  return `manual_override_${targetStatus}` as "manual_override_pass" | "manual_override_fail" | "manual_override_remediation_required";
}

/** The exact three reason-code values D5's recompute-lock (`routes/outcome.ts`) treats a case's
 * latest outcome as terminal against further `compute-outcome` calls. Exported so both the apply
 * route (which WRITES one of these) and the compute-outcome route (which READS for this set) share
 * a single source of truth rather than two independently-maintained literal lists. */
export const MANUAL_OVERRIDE_REASON_CODES = new Set(["manual_override_pass", "manual_override_fail", "manual_override_remediation_required"]);

export function overrideNotFound(): never {
  throw new Kyc1Error("KYC1_OVERRIDE_NOT_FOUND");
}

/**
 * Strict SoD (approved Phase 3B D6/mandatory design decision): the override requester may never be
 * the SAME actor who supplied a manual verification finding on the SAME case. IAM-02 separately
 * and unconditionally enforces requester != approver at execute-verify — so the normal workflow
 * needs the manual verifier, the override requester, and the approver as three distinct
 * identities. Checked ONCE, at request time, mirroring AML-01's own
 * `checkSelfDispositionBlocked`/CLT-01's own self-review-block precedent exactly (request-time-
 * only, never re-checked at apply).
 *
 * Deliberately takes a pre-computed BOOLEAN, not a list of `source_id`s to compare against —
 * `routes/outcome-override.ts` resolves the comparison with a single `SELECT EXISTS(...)` query
 * server-side, so no manual verifier's `source_id` value is ever pulled into application memory
 * (defence-in-depth against ever accidentally logging one — `lib/errors.ts`'s own "Do not log
 * source_id" rule for the resulting refusal audit).
 *
 * KNOWN LIMITATION (recorded, not silently accepted — see `lib/errors.ts`'s own header comment for
 * the full rationale): for a case whose verification results are ALL `source_type='registry'` (no
 * human manual verifier ever recorded a finding), `isSelfProvided` is always `false` and this check
 * is structurally vacuous. SoD for such a case degrades to IAM-02's own unconditional requester !=
 * approver rule alone — a strictly weaker two-identity guarantee. This function does not, and
 * cannot, close that gap; callers must not present it as a full three-identity guarantee in that
 * case.
 *
 * LOW-9 (carried forward from Phase 3A): `requested_by` is caller-asserted under the shared
 * internal-service-token identity model, not a cryptographically authenticated human identity.
 * This check compares two caller-asserted strings — it cannot and does not attempt to solve the
 * platform-wide identity model in Phase 3B.
 */
export function checkSelfOverrideBlocked(isSelfProvided: boolean): void {
  if (isSelfProvided) {
    throw new Kyc1Error("KYC1_SELF_OVERRIDE_BLOCKED");
  }
}

/** Detects migration 045's partial unique index violation
 * (`idx_kyc1_manual_override_request_one_open_per_case`) so the request route can map it to a
 * clean `{kind:"duplicate_open_request"}` result instead of letting a raw `23505` surface — mirrors
 * `kyc-case.ts`'s own `isDuplicateActiveCaseViolation` precedent. Genuinely defensive-only here:
 * the request route's own `pg_advisory_xact_lock` (taken before this INSERT is attempted) already
 * serializes every concurrent request for the SAME case, so this constraint should never actually
 * fire in practice — it exists as the same race-safe backstop every other "at most one active row"
 * table in this schema carries, the MED-2 lesson applied from day one rather than discovered by
 * review. */
export function isDuplicateOpenOverrideViolation(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === "23505" && pgErr?.constraint === "idx_kyc1_manual_override_request_one_open_per_case";
}

/**
 * Canonical payload bound into `manual_override_request.payload_hash` at request time and
 * recomputed from the STORED row at apply time (never from caller-supplied apply-body input) —
 * the same `fingerprint()`-over-canonical-object pattern every prior maker-checker table in this
 * codebase uses (mirrors `lib/match-disposition.ts`'s own `decisionPayload` exactly). Deterministic
 * key ordering is `fingerprint()`'s own concern (packages/foundation's canonical-JSON serializer
 * sorts object keys) — this function only needs to supply a stable field SET, not a stable field
 * ORDER.
 *
 * MED-3 fix: `approved_against_outcome_id`/`approved_against_outcome_status` are now part of the
 * canonical payload — the IAM-02 approval this hash is bound into (via `current_payload_hash` at
 * execute-verify) is therefore cryptographically bound to the EXACT case-outcome snapshot the
 * approval was granted against, not merely to the override's own bookkeeping fields. Both values
 * are ALWAYS taken from the STORED row (never caller-supplied) at every call site.
 */
export function overridePayload(row: {
  override_id: string;
  case_id: string;
  target_type: string;
  target_outcome_status: string;
  reason_code: string;
  approved_against_outcome_id: string;
  approved_against_outcome_status: string;
  requested_by: string;
}): Record<string, unknown> {
  return {
    override_id: row.override_id,
    case_id: row.case_id,
    target_type: row.target_type,
    target_outcome_status: row.target_outcome_status,
    reason_code: row.reason_code,
    approved_against_outcome_id: row.approved_against_outcome_id,
    approved_against_outcome_status: row.approved_against_outcome_status,
    requested_by: row.requested_by,
  };
}

export interface ManualOverrideRequestRow {
  override_id: string;
  case_id: string;
  target_type: string;
  target_outcome_status: string;
  reason_code: string;
  /** MED-3 fix — see this file's own `overridePayload` doc comment and migration 045's own header
   * comment. */
  approved_against_outcome_id: string;
  approved_against_outcome_status: string;
  requested_by: string;
  approval_id: string | null;
  status: string;
  payload_hash: string;
  applied_outcome_id: string | null;
  created_at_utc: string;
  applied_at_utc: string | null;
}

/** The reachable `kyc1.manual_override_refused` reason codes — used only for this constant's own
 * documentation purposes (the route itself passes a literal string to `publishAudit`); kept here
 * as a single source of truth for what this event's `reason_code` may legitimately be.
 * `self_override_blocked` — the request-time SoD check (`checkSelfOverrideBlocked`).
 * `case_state_changed` (MED-3, new) — the apply-time snapshot-mismatch check: the case's current
 * outcome no longer matches what the IAM-02 approval was granted against. */
export const OVERRIDE_REFUSAL_REASON_CODES = ["self_override_blocked", "case_state_changed"] as const;
export type OverrideRefusalReasonCode = (typeof OVERRIDE_REFUSAL_REASON_CODES)[number];

export interface SafeOverrideRequestResponse {
  override_id: string;
  case_id: string;
  target_outcome_status: string;
  status: string;
  payload_hash: string;
}

/** Single safe-response projection point for the request route's own confirmation response —
 * never spreads a raw DB row. Deliberately excludes `decision_token_hash` (internal
 * tamper-evidence, never a caller-facing value, mirrors `cdd_outcome.payload_hash`'s own exclusion
 * from `safeCddOutcomeResponse`) and `reason_code`/`requested_by`/`approval_id`/timestamps — the
 * approved Phase 3B response field set is exactly the five fields below. */
export function safeOverrideRequestResponse(row: ManualOverrideRequestRow): SafeOverrideRequestResponse {
  return {
    override_id: row.override_id,
    case_id: row.case_id,
    target_outcome_status: row.target_outcome_status,
    status: row.status,
    payload_hash: row.payload_hash,
  };
}
