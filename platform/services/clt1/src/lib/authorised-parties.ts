/**
 * CLT-01 Phase 4 — pure authorised-party state-transition and screening-gate logic. No DB
 * access, no HTTP — routes/authorised-parties.ts is the only caller. Kept pure and DB-free so
 * every rule here is unit-testable without a database, same discipline lib/authorised-users.ts
 * and lib/mandates.ts already established.
 *
 * `party_type` is narrowed to the blueprint's own §2.12 enum MINUS `client_admin`/
 * `client_approver` — those two are identical to `authorised_user.role` values (a blueprint-side
 * conflation, not a task-brief paraphrase) and are excluded so `authorised_party` (compliance/
 * legal party) and `authorised_user` (operational actor) stay genuinely separate. `authority_
 * status` reconciles a real inconsistency between `05_Database_Design.md` §2.12 (`pending/
 * active/restricted/revoked`) and `06_State_Machine.md`'s diagram (which also needs `rejected`
 * and `suspended`) — the union of both is used here. No reactivation path exists: the blueprint's
 * own diagram draws no arrow back to `active`/`pending` from any terminal-shaped state.
 *
 * `validateOwnershipPercentagePrecision` closes Opus Phase 4 review L1 (a payload-hash-mismatch
 * bug for sub-hundredths `ownership_percentage` values) — see its own doc comment for why TypeBox's
 * `multipleOf` keyword was tried first and rejected as unreliable.
 */
import { AppError } from "@aix/foundation";
import { Clt1Error } from "./errors.js";

export const AUTHORISED_PARTY_TYPES = ["signatory", "director", "controller", "ubo"] as const;
export type AuthorisedPartyType = (typeof AUTHORISED_PARTY_TYPES)[number];

export const IDENTITY_VERIFICATION_STATUSES = ["pending", "pass", "fail", "stale"] as const;
export type IdentityVerificationStatus = (typeof IDENTITY_VERIFICATION_STATUSES)[number];

export const SANCTIONS_PEP_STATUSES = ["pending", "clear", "hit", "review_required"] as const;
export type SanctionsPepStatus = (typeof SANCTIONS_PEP_STATUSES)[number];

export const AUTHORITY_STATUSES = ["pending", "active", "restricted", "rejected", "revoked", "suspended"] as const;
export type AuthorityStatus = (typeof AUTHORITY_STATUSES)[number];

/** Screening states that satisfy blueprint Rule 3 ("Authority cannot become active until
 * screening is pass/clear") — `review_required` is locked as an additional acceptable state
 * alongside `clear` per the approved Phase 4 design decision (LOCKED DESIGN DECISION 21). */
const SANCTIONS_STATES_ALLOWING_ACTIVATION: readonly SanctionsPepStatus[] = ["clear", "review_required"];

export interface AuthorisedPartyRow {
  authorised_party_id: string;
  application_id: string;
  party_type: AuthorisedPartyType;
  party_reference: string;
  ownership_percentage: string | null;
  identity_verification_status: IdentityVerificationStatus;
  sanctions_pep_status: SanctionsPepStatus;
  authority_status: AuthorityStatus;
  sec_audit_ref: string | null;
  last_screened_at_utc: string | null;
  screening_source_module: string | null;
  approval_id: string | null;
  requested_by: string;
  version: number;
  created_at_utc: string;
  updated_at_utc: string;
}

/**
 * Non-PII projection of an authorised_party row (approved Phase 4 design decision:
 * `party_reference` is stored but never returned by the default list route) — mirrors
 * `safeAuthorisedUserResponse`'s discipline exactly. `ownership_percentage`/`sec_audit_ref` are
 * business/compliance data, not personal identifiers — included, same reasoning
 * `client_mandate.rules` was included in Phase 3.
 */
export function safeAuthorisedPartyResponse(row: AuthorisedPartyRow): Record<string, unknown> {
  return {
    authorised_party_id: row.authorised_party_id,
    application_id: row.application_id,
    party_type: row.party_type,
    ownership_percentage: row.ownership_percentage,
    identity_verification_status: row.identity_verification_status,
    sanctions_pep_status: row.sanctions_pep_status,
    authority_status: row.authority_status,
    sec_audit_ref: row.sec_audit_ref,
    last_screened_at_utc: row.last_screened_at_utc,
    screening_source_module: row.screening_source_module,
    version: row.version,
    created_at_utc: row.created_at_utc,
    updated_at_utc: row.updated_at_utc,
  };
}

/** Throws CLT1_SELF_APPROVAL_BLOCKED if the requester's declared identity is the same as the
 * party being added/removed — same weak-but-real declared-identity check Phase 3 applies to
 * `authorised_user` via `requireNotSelfAdd`. */
export function requireNotSelfAction(requestedBy: string, partyReference: string): void {
  if (requestedBy === partyReference) {
    throw new Clt1Error("CLT1_SELF_APPROVAL_BLOCKED");
  }
}

/** Throws CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED unless both screening columns satisfy
 * blueprint Rule 3 (identity_verification_status='pass' AND sanctions_pep_status IN
 * ('clear','review_required')) — the gate `activate/apply` must pass before authority_status may
 * become 'active'. */
export function requireScreeningPassForActivation(identityStatus: IdentityVerificationStatus, sanctionsStatus: SanctionsPepStatus): void {
  const identityOk = identityStatus === "pass";
  const sanctionsOk = SANCTIONS_STATES_ALLOWING_ACTIVATION.includes(sanctionsStatus);
  if (!identityOk || !sanctionsOk) {
    throw new Clt1Error("CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED", {
      details: [{ field: "screening", issue: `identity_verification_status='${identityStatus}', sanctions_pep_status='${sanctionsStatus}'` }],
    });
  }
}

type PartyAction = "update" | "remove" | "activate" | "restrict" | "reject" | "suspend";

/** Throws CLT1_AUTHORISED_PARTY_INVALID_STATE if `currentStatus` does not allow `action`. No
 * reactivation path exists this phase (approved design decision) — every allowed-from list below
 * only ever narrows toward a terminal-shaped state, never back toward 'active'/'pending'. */
export function validateAuthorisedPartyTransition(currentStatus: AuthorityStatus, action: PartyAction): void {
  const allowed: Record<PartyAction, readonly AuthorityStatus[]> = {
    update: ["pending", "active"],
    remove: ["pending", "active", "restricted", "suspended", "rejected"],
    activate: ["pending"],
    restrict: ["pending"],
    reject: ["pending"],
    suspend: ["active"],
  } as const;
  if (!allowed[action].includes(currentStatus)) {
    throw new Clt1Error("CLT1_AUTHORISED_PARTY_INVALID_STATE", {
      details: [{ field: "authority_status", issue: `cannot perform '${action}' on an authorised party in authority_status '${currentStatus}'` }],
    });
  }
}

export function authorisedPartyNotFound(): never {
  throw new Clt1Error("CLT1_AUTHORISED_PARTY_NOT_FOUND");
}

/**
 * Throws the shared foundation `VALIDATION_ERROR` (not a new CLT-01 code — same discipline
 * `lib/mandates.ts`'s `validateMandateRules` already established) if `value` carries more than 2
 * decimal places of precision.
 *
 * TypeBox's own `multipleOf` JSON-Schema keyword was tried first and rejected: it is implemented
 * via a raw `value % multipleOf === 0`-shaped check, which is unreliable for decimal `multipleOf`
 * values because `0.01` has no exact IEEE-754 binary representation — empirically, `multipleOf:
 * 0.01` rejects ordinary values including whole integers (`45 % 0.01 === 0.009999999999999063` in
 * JS), which would have made every non-trivial `ownership_percentage` request fail with a
 * confusing 400. This function instead round-trips through a fixed 2-decimal-place rounding and
 * compares for exact equality — stable for every real value in the `[0,100]` domain, and this is
 * what actually closes Opus Phase 4 review L1 (a schema-valid sub-hundredths value like
 * `0.0000001` renders via JS's own `String(...)` as exponential notation, which Postgres's
 * `numeric` column does not preserve on round-trip, silently diverging the request-time and
 * apply-time payload hashes).
 */
export function validateOwnershipPercentagePrecision(value: number): void {
  if (Math.round(value * 100) / 100 !== value) {
    throw new AppError("VALIDATION_ERROR", {
      details: [{ field: "ownership_percentage", issue: "must not exceed 2 decimal places" }],
    });
  }
}
