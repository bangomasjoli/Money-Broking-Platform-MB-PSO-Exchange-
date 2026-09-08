/**
 * CLT-01 Phase 2 — pure CDD-outcome gate logic. No DB access, no HTTP — routes/outcomes.ts and
 * routes/decisions.ts are the only callers. Kept pure and DB-free so every rule here is
 * unit-testable without a database (tests/unit/clt1-outcomes.test.ts), same discipline
 * lib/applications.ts already established for Phase 1's transition/gate rules.
 *
 * Canonical outcome-status enum and the outcomeType -> rollup-column mapping are the single
 * source of truth both routes/outcomes.ts (writing) and this file's own gate evaluation
 * (reading) use — see infra/migrations/021_clt1_cdd_final_approval.cjs's header comment for why
 * the enum is normalised to ONE shared vocabulary rather than mirroring the blueprint's own
 * inconsistent per-column wording.
 */
import { Clt1Error } from "./errors.js";

export const CDD_OUTCOME_TYPES = ["kyc_kyb", "aml_sanctions", "pep_adverse_media", "risk_rating"] as const;
export type CddOutcomeType = (typeof CDD_OUTCOME_TYPES)[number];

export const CDD_OUTCOME_STATUSES = [
  "pending",
  "pass",
  "fail",
  "hit",
  "rejected",
  "stale",
  "remediation_required",
  "unavailable",
  "not_required",
] as const;
export type CddOutcomeStatus = (typeof CDD_OUTCOME_STATUSES)[number];

export const CDD_RISK_RATINGS = ["low", "medium", "high", "prohibited"] as const;
export type CddRiskRating = (typeof CDD_RISK_RATINGS)[number];

export type CddRollupColumn = "cdd_outcome_status" | "aml_sanctions_status" | "pep_adverse_media_status" | "risk_rating_status";

/** The single source of truth for which `client_application` rollup column a given
 * `cdd_outcome.outcome_type` updates — "latest received outcome wins" per type. */
export function rollupColumnForOutcomeType(outcomeType: CddOutcomeType): CddRollupColumn {
  switch (outcomeType) {
    case "kyc_kyb":
      return "cdd_outcome_status";
    case "aml_sanctions":
      return "aml_sanctions_status";
    case "pep_adverse_media":
      return "pep_adverse_media_status";
    case "risk_rating":
      return "risk_rating_status";
  }
}

export interface CddGateColumns {
  cdd_outcome_status: string;
  aml_sanctions_status: string;
  pep_adverse_media_status: string;
  risk_rating_status: string;
}

/** Statuses that mean "not yet satisfied" (as opposed to "asked and got a bad answer") — grouped
 * under the REQUIRED code rather than the FAILED code, since the remedy is "wait for/request the
 * outcome", not "this application cannot proceed". */
const NOT_YET_SATISFIED: ReadonlySet<string> = new Set(["pending", "unavailable", "not_required"]);

/**
 * Throws the sharpest applicable error if `columns` does not satisfy final-approval requirements.
 * Approval requires ALL FOUR rollup columns to read exactly 'pass' — blueprint §07 "CDD Outcome
 * Approval Rules" / data rule 11. Sharper, named codes (CLT1_AML_SANCTIONS_HIT,
 * CLT1_RISK_REJECTED) are checked FIRST, ahead of the generic required/failed codes, so an
 * operator sees the most specific reason available rather than a generic one.
 */
export function evaluateCddGateForApproval(columns: CddGateColumns): void {
  if (columns.aml_sanctions_status === "hit") {
    throw new Clt1Error("CLT1_AML_SANCTIONS_HIT");
  }
  if (columns.risk_rating_status === "rejected") {
    throw new Clt1Error("CLT1_RISK_REJECTED");
  }

  const fields: Array<[string, string]> = [
    ["cdd_outcome_status", columns.cdd_outcome_status],
    ["aml_sanctions_status", columns.aml_sanctions_status],
    ["pep_adverse_media_status", columns.pep_adverse_media_status],
    ["risk_rating_status", columns.risk_rating_status],
  ];
  for (const [field, status] of fields) {
    if (status === "pass") continue;
    if (NOT_YET_SATISFIED.has(status)) {
      throw new Clt1Error("CLT1_CDD_OUTCOME_REQUIRED", {
        details: [{ field, issue: `outcome status is '${status}', required 'pass'` }],
      });
    }
    throw new Clt1Error("CLT1_CDD_OUTCOME_FAILED", {
      details: [{ field, issue: `outcome status is '${status}'` }],
    });
  }
}

export interface HandoffPresence {
  hasKyc: boolean;
  hasAml: boolean;
}

/** Blueprint data rule 3: "Final approval requires KYC/KYB and AML handoff creation" — a
 * requirement independent of what `cdd_outcome` says (blueprint data rule 12: delivery is
 * tracked separately from outcome). */
export function requireHandoffsForApproval(presence: HandoffPresence): void {
  if (!presence.hasKyc) throw new Clt1Error("CLT1_KYC_HANDOFF_REQUIRED");
  if (!presence.hasAml) throw new Clt1Error("CLT1_AML_HANDOFF_REQUIRED");
}

/** Non-throwing variant used by the outcome-status read route, which reports gate readiness as a
 * boolean field rather than failing the request. */
export function isCddGateReady(columns: CddGateColumns): boolean {
  try {
    evaluateCddGateForApproval(columns);
    return true;
  } catch {
    return false;
  }
}
