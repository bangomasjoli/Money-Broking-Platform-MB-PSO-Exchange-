/**
 * KYC-01 Phase 1 — the deterministic CDD outcome engine. Pure function, no DB/HTTP — mirrors
 * `lib/screening.ts`'s deliberately-pure posture in AML-01. Given the CURRENT checklist and
 * verification-result state for a case, computes exactly one of `pass`/`fail`/
 * `remediation_required` — NEVER `pending` (see migration 042's own header comment: `pending` is
 * schema-present but unreachable this phase, since this engine is fully synchronous and always
 * resolves).
 *
 * No human override, no maker-checker, no AML/vendor/biometric input of any kind this phase
 * (confirmed Phase 1 scope) — the engine only ever looks at `document_checklist_item`/
 * `verification_result` rows already durably recorded by Phase 1's own manual/registry-entry
 * routes.
 *
 * MED-1 fix (independent Opus review of Phase 0+1): "latest verification result of a type" is now
 * a fully deterministic total order (`receivedAtUtc` DESC, `verificationResultId` DESC tie-break —
 * see `compareByRecencyThenId`), not merely "sorted by timestamp with an incomplete comparator".
 * Two `verification_result` rows can share `received_at_utc` under concurrent submission; before
 * this fix the outcome for a genuinely conflicting pass/fail pair depended on unspecified sort/
 * array order — and because `compute-outcome` treats a `pass` outcome as terminal this phase, a
 * nondeterministically-wrong `pass` was not correctable through the API. No business rule changed:
 * only WHICH result is treated as "latest" when timestamps tie is now well-defined.
 *
 * CORRECTNESS NOTE — the comparator uses ONLY relational operators (`<`/`>`), never `===`/`!==`,
 * to detect a tie. `node-postgres` returns `timestamptz` columns as `Date` objects at runtime
 * (despite this interface declaring `receivedAtUtc: string` — the same "typed as string, actually a
 * Date" gap this codebase's `timestamptz` columns carry elsewhere), and two DISTINCT `Date`
 * instances representing the IDENTICAL instant are always `!==` (reference inequality) even though
 * `<`/`>` correctly coerce both to their numeric value. An initial version of this fix used `!==`
 * to detect a tie and was caught, by `tests/integration/kyc1-db.test.ts`'s own DB-level coverage
 * (never by the pure-string-input unit tests, which can't exercise this), silently never reaching
 * its own tie-break branch against real `pg`-returned `Date` values — falling through to a fixed
 * `-1` and reintroducing exactly the non-determinism this fix exists to remove. `<`/`>` alone are
 * immune to this regardless of whether the caller passes a `Date` or a `string`.
 *
 * PHASE 2A — `kyc-case.ts`'s fetchers now normalize every `timestamptz` field to a genuine ISO
 * string at the DB boundary (approved Phase 2 planning report D5), so the `Date`-object hazard
 * this file's own comparator defends against no longer reaches this function in practice from any
 * real KYC-01 call site. The comparator's relational-only discipline is kept exactly as-is
 * regardless — defence-in-depth, not a guarantee this file is willing to give up.
 */
import { normalizeTimestamp, type KycCaseType } from "./kyc-case.js";

export interface OutcomeChecklistInput {
  required: boolean;
  status: string;
}

export interface OutcomeVerificationResultInput {
  verificationResultId: string;
  resultType: string;
  resultStatus: string;
  receivedAtUtc: string;
}

export interface OutcomeEngineInput {
  caseType: KycCaseType;
  checklistItems: OutcomeChecklistInput[];
  verificationResults: OutcomeVerificationResultInput[];
}

export type OutcomeReasonCode =
  | "identity_verification_failed"
  | "entity_verification_failed"
  | "required_document_invalid_or_expired"
  | "all_required_checks_passed"
  | "required_evidence_incomplete";

export interface OutcomeEngineResult {
  outcomeStatus: "pass" | "fail" | "remediation_required";
  outcomeReason: OutcomeReasonCode;
  /** Structured, non-free-text, non-PII — booleans and a classification only. Written verbatim
   * into `cdd_outcome.verification_scope` (jsonb) and safe to include in audit metadata. */
  verificationScope: {
    case_type: KycCaseType;
    required_documents_complete: boolean;
    identity_verified: boolean | null;
    entity_verified: boolean | null;
  };
}

/**
 * Total, deterministic descending-recency order: `receivedAtUtc` DESC, then `verificationResultId`
 * DESC as a tie-break. MED-1 fix — the previous comparator (`receivedAtUtc` only) never returned
 * `0` and had no tie-break, so two rows sharing a `receivedAtUtc` (routinely true under concurrent
 * submission — Postgres `now()` resolution is coarser than back-to-back inserts in the same
 * transaction/millisecond) produced a result that depended on whatever order the DB/array handed
 * them in, not on which one was genuinely latest. `verificationResultId` doesn't need to be
 * chronologically meaningful — it only needs to be STABLE and UNIQUE per row, which the
 * `varchar(64) UNIQUE` column already guarantees, so the SAME input set always sorts to the SAME
 * winner regardless of array order (verified directly: see `kyc1-outcome-engine.test.ts`'s own
 * order-independence tests).
 */
function compareByRecencyThenId(a: OutcomeVerificationResultInput, b: OutcomeVerificationResultInput): number {
  // Relational operators only — see this file's own "CORRECTNESS NOTE" above for why `===`/`!==`
  // cannot be used to detect a tie here.
  if (a.receivedAtUtc > b.receivedAtUtc) return -1;
  if (a.receivedAtUtc < b.receivedAtUtc) return 1;
  if (a.verificationResultId > b.verificationResultId) return -1;
  if (a.verificationResultId < b.verificationResultId) return 1;
  return 0;
}

/** Latest (by `receivedAtUtc`, tie-broken by `verificationResultId`) verification result of a
 * given type, or `undefined` if none exists yet. A later result always supersedes an earlier one
 * for outcome purposes — mirrors the "latest wins" convention already established elsewhere in
 * this codebase (e.g. AML-01's own latest-provider-attempt lookups) — now made genuinely
 * deterministic under a tie. */
function latestResultOfType(results: OutcomeVerificationResultInput[], resultType: string): OutcomeVerificationResultInput | undefined {
  return results
    .filter((r) => r.resultType === resultType)
    .sort(compareByRecencyThenId)[0];
}

export function computeCddOutcome(input: OutcomeEngineInput): OutcomeEngineResult {
  const { caseType, checklistItems, verificationResults } = input;

  const requiredItems = checklistItems.filter((i) => i.required);
  const requiredDocumentsComplete = requiredItems.length === 0 || requiredItems.every((i) => i.status === "verified");
  const anyRequiredInvalid = requiredItems.some((i) => i.status === "rejected" || i.status === "expired");

  const needsIdentity = caseType === "individual" || caseType === "authorised_party";
  const needsEntity = caseType === "entity";

  const identityResult = needsIdentity ? latestResultOfType(verificationResults, "identity") : undefined;
  const entityResult = needsEntity ? latestResultOfType(verificationResults, "entity") : undefined;

  const identityVerified = needsIdentity ? identityResult?.resultStatus === "pass" : null;
  const entityVerified = needsEntity ? entityResult?.resultStatus === "pass" : null;

  const verificationScope: OutcomeEngineResult["verificationScope"] = {
    case_type: caseType,
    required_documents_complete: requiredDocumentsComplete,
    identity_verified: identityVerified,
    entity_verified: entityVerified,
  };

  if (needsIdentity && identityResult?.resultStatus === "fail") {
    return { outcomeStatus: "fail", outcomeReason: "identity_verification_failed", verificationScope };
  }
  if (needsEntity && entityResult?.resultStatus === "fail") {
    return { outcomeStatus: "fail", outcomeReason: "entity_verification_failed", verificationScope };
  }
  if (anyRequiredInvalid) {
    return { outcomeStatus: "fail", outcomeReason: "required_document_invalid_or_expired", verificationScope };
  }
  const identityOk = !needsIdentity || identityVerified === true;
  const entityOk = !needsEntity || entityVerified === true;
  if (requiredDocumentsComplete && identityOk && entityOk) {
    return { outcomeStatus: "pass", outcomeReason: "all_required_checks_passed", verificationScope };
  }
  return { outcomeStatus: "remediation_required", outcomeReason: "required_evidence_incomplete", verificationScope };
}

export interface CddOutcomeRow {
  outcome_id: string;
  case_id: string;
  outcome_status: string;
  outcome_reason: string;
  verification_scope: Record<string, unknown>;
  evidence_refs: Record<string, unknown>;
  outcome_version: number;
  created_at_utc: string;
}

export interface SafeCddOutcomeResponse {
  outcome_id: string;
  case_id: string;
  outcome_status: string;
  outcome_reason: string;
  verification_scope: Record<string, unknown>;
  evidence_refs: Record<string, unknown>;
  outcome_version: number;
  created_at_utc: string;
}

/** PHASE 2A — normalizes `created_at_utc` (approved Phase 2 planning report D5; see
 * `kyc-case.ts`'s own header comment for the full rationale). `cdd_outcome.created_at_utc` is a
 * `timestamptz` like every other KYC-01 timestamp column, so it carries the identical `Date`-at-
 * runtime-vs-`string`-declared gap. */
export function normalizeCddOutcomeRow(row: CddOutcomeRow): CddOutcomeRow {
  return { ...row, created_at_utc: normalizeTimestamp(row.created_at_utc) };
}

/** `payload_hash` is deliberately EXCLUDED — internal tamper-evidence, not a caller-facing value.
 * `verification_scope`/`evidence_refs` are safe to return verbatim — both are structurally
 * constrained to booleans/IDs by `computeCddOutcome` itself, never free text or PII. */
export function safeCddOutcomeResponse(row: CddOutcomeRow): SafeCddOutcomeResponse {
  return {
    outcome_id: row.outcome_id,
    case_id: row.case_id,
    outcome_status: row.outcome_status,
    outcome_reason: row.outcome_reason,
    verification_scope: row.verification_scope,
    evidence_refs: row.evidence_refs,
    outcome_version: row.outcome_version,
    created_at_utc: row.created_at_utc,
  };
}
