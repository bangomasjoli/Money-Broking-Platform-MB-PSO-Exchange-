/**
 * AML-01 Phase 2A — pure CLT-01 outcome-mapping logic. No DB access, no HTTP — routes/
 * clt-outcome-delivery.ts is the only caller. Kept pure and DB-free so every rule here is
 * unit-testable without a database, same discipline lib/screening.ts already established.
 *
 * ---------------------------------------------------------------------------------------
 * CORRECTION carried from the accepted AML-01 Phase 2 planning report (§0, C1): `dismissed` is a
 * `screening_match.match_status` value, NOT an `overall_status`/effective-status value.
 * `screening_result.overall_status` (migration 033) is CHECK'd to exactly `clear`/
 * `potential_match`/`confirmed_hit`/`error` — there is no result-level `dismissed`. This module
 * therefore derives its OWN "effective status" from the current set of `screening_match.
 * match_status` values, rather than reading `overall_status` directly — `overall_status` stays the
 * IMMUTABLE record of what the automated screen said (never mutated by this phase or Phase 2A
 * code); `deriveEffectiveStatus` is what a later human-disposition phase (2B) will re-derive from
 * after `dismissed`/`confirmed_hit` match-level dispositions exist. In Phase 2A, no match is ever
 * `dismissed` (no disposition route exists yet), so `clear_after_review` is reachable only via a
 * screen with zero matches after all matches would have been dismissed — i.e. it is NOT reachable
 * from Phase 2A code paths today, but the function handles it correctly for forward-compatibility
 * with Phase 2B, which will call this same pure function unchanged.
 *
 * ---------------------------------------------------------------------------------------
 * CORRECTION (§0, C2): CLT-01 exposes TWO receipt endpoints with DIFFERENT status vocabularies and
 * DIFFERENT lifecycle preconditions — mapping is per-endpoint, never a single shared table:
 *   - Application-level (`POST .../applications/:application_id/outcomes`) — 9-value vocabulary,
 *     this module writes only `pass`/`pending`/`hit`. Requires `client_application.status =
 *     'under_review'` (CLT-01-side precondition, not enforced here).
 *   - Authorised-party-level (`POST .../authorised-parties/:id/screening-outcome`) — 4-value
 *     vocabulary, this module writes only `clear`/`review_required`/`hit` (never
 *     `identity_verification_status` — that belongs to KYC-01). Requires `client_profile.status =
 *     'active_limited'` (CLT-01-side precondition, not enforced here).
 */
export const EFFECTIVE_STATUSES = ["clear", "potential_match", "confirmed_hit", "clear_after_review"] as const;
export type EffectiveStatus = (typeof EFFECTIVE_STATUSES)[number];

export const APPLICATION_OUTCOME_TYPES = ["aml_sanctions", "pep_adverse_media"] as const;
export type ApplicationOutcomeType = (typeof APPLICATION_OUTCOME_TYPES)[number];

export type ApplicationDeliveredStatus = "pass" | "pending" | "hit";
export type AuthorisedPartyDeliveredStatus = "clear" | "review_required" | "hit";

export interface ScreeningMatchSummary {
  category: "sanctions" | "pep" | "adverse_media";
  match_status: "potential_match" | "confirmed_hit" | "dismissed";
}

/**
 * Derives AML-01's own effective status from a set of match-level statuses — never reads
 * `screening_result.overall_status` directly (see file header C1). Precedence: a single
 * `confirmed_hit` outranks everything; else a single `potential_match` outranks a resolved
 * `dismissed`; only when every match is resolved as `dismissed` (and at least one match exists)
 * does the screen count as reviewed-and-cleared, distinct from a screen that never matched
 * anything at all.
 */
export function deriveEffectiveStatus(matchStatuses: ReadonlyArray<ScreeningMatchSummary["match_status"]>): EffectiveStatus {
  if (matchStatuses.length === 0) return "clear";
  if (matchStatuses.includes("confirmed_hit")) return "confirmed_hit";
  if (matchStatuses.includes("potential_match")) return "potential_match";
  return "clear_after_review";
}

/** Application-level mapping — see file header C2. Never produces `fail`/`rejected`/`stale`/
 * `remediation_required`/`unavailable`/`not_required` (no AML-01 effective status maps to them). */
export function mapEffectiveStatusToApplicationOutcome(status: EffectiveStatus): ApplicationDeliveredStatus {
  switch (status) {
    case "clear":
    case "clear_after_review":
      return "pass";
    case "potential_match":
      return "pending";
    case "confirmed_hit":
      return "hit";
  }
}

/** Authorised-party-level mapping — see file header C2. Never writes `identity_verification_status`. */
export function mapEffectiveStatusToAuthorisedPartyOutcome(status: EffectiveStatus): AuthorisedPartyDeliveredStatus {
  switch (status) {
    case "clear":
    case "clear_after_review":
      return "clear";
    case "potential_match":
      return "review_required";
    case "confirmed_hit":
      return "hit";
  }
}

export interface ApplicationDeliveryPlanItem {
  outcome_type: ApplicationOutcomeType;
  effective_status: EffectiveStatus;
  delivered_status: ApplicationDeliveredStatus;
}

/**
 * Application-level delivery ALWAYS plans exactly two targets — `aml_sanctions` (driven only by
 * `sanctions`-category matches) and `pep_adverse_media` (driven by BOTH `pep` and `adverse_media`
 * matches, since CLT-01's own vocabulary fuses the two into one outcome type) — even when one
 * group has zero matches (delivers `pass` for that group), per the approved Phase 2A mapping plan.
 */
export function planApplicationDeliveries(matches: ReadonlyArray<ScreeningMatchSummary>): ApplicationDeliveryPlanItem[] {
  const sanctionsStatuses = matches.filter((m) => m.category === "sanctions").map((m) => m.match_status);
  const pepAdverseMediaStatuses = matches.filter((m) => m.category === "pep" || m.category === "adverse_media").map((m) => m.match_status);

  const sanctionsEffective = deriveEffectiveStatus(sanctionsStatuses);
  const pepAdverseMediaEffective = deriveEffectiveStatus(pepAdverseMediaStatuses);

  return [
    { outcome_type: "aml_sanctions", effective_status: sanctionsEffective, delivered_status: mapEffectiveStatusToApplicationOutcome(sanctionsEffective) },
    { outcome_type: "pep_adverse_media", effective_status: pepAdverseMediaEffective, delivered_status: mapEffectiveStatusToApplicationOutcome(pepAdverseMediaEffective) },
  ];
}

export interface AuthorisedPartyDeliveryPlan {
  effective_status: EffectiveStatus;
  delivered_status: AuthorisedPartyDeliveredStatus;
}

/** Authorised-party-level delivery plans exactly ONE target, driven by ALL matches regardless of
 * category (CLT-01's `sanctions_pep_status` column has no category axis). */
export function planAuthorisedPartyDelivery(matches: ReadonlyArray<ScreeningMatchSummary>): AuthorisedPartyDeliveryPlan {
  const effective = deriveEffectiveStatus(matches.map((m) => m.match_status));
  return { effective_status: effective, delivered_status: mapEffectiveStatusToAuthorisedPartyOutcome(effective) };
}
