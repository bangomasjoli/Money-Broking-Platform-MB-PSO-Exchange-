/**
 * AML-01 Phase 2B — pure match-disposition logic. No DB access, no HTTP — routes/matches.ts is
 * the only caller. Kept pure and DB-free so every rule here is unit-testable without a database,
 * same discipline lib/screening.ts / lib/clt1-outcome-mapping.ts already established.
 */
import { Aml1Error } from "./errors.js";

export const MATCH_DISPOSITION_TYPES = ["confirm", "dismiss"] as const;
export type MatchDispositionType = (typeof MATCH_DISPOSITION_TYPES)[number];

/** The `screening_match.match_status` value a given disposition type resolves a `potential_match`
 * row to. */
export function targetMatchStatusFor(decisionType: MatchDispositionType): "confirmed_hit" | "dismissed" {
  return decisionType === "confirm" ? "confirmed_hit" : "dismissed";
}

/**
 * Both `confirmed_hit` and `dismissed` are TERMINAL — no re-open path. A wrong disposition is
 * corrected by a fresh screening request, never by mutating history (approved Phase 2B design
 * decision — mirrors CLT-01's own `duplicate_candidate` terminal-state posture, applied to a
 * higher-stakes compliance record).
 */
export function validateMatchTransition(currentStatus: string): void {
  if (currentStatus !== "potential_match") {
    throw new Aml1Error("AML1_MATCH_INVALID_STATE", {
      details: [{ field: "match_status", issue: `cannot dispose of a match in status '${currentStatus}'` }],
    });
  }
}

export function matchNotFound(): never {
  throw new Aml1Error("AML1_SCREENING_MATCH_NOT_FOUND");
}

export function dispositionNotFound(): never {
  throw new Aml1Error("AML1_DISPOSITION_NOT_FOUND");
}

/**
 * Strict SoD (approved Phase 2B mandatory design decision): the disposition requester may never
 * be the same actor who requested the ORIGINAL screening. IAM-02 separately and unconditionally
 * enforces requester != approver at execute-verify — so the normal workflow needs the screener,
 * the disposition requester, and the approver as three distinct identities. Checked once, at
 * request time, mirroring CLT-01's own `checkDuplicateSelfReviewBlocked`/self-approval-block
 * precedent (also request-time-only, never re-checked at apply).
 */
export function checkSelfDispositionBlocked(dispositionRequestedBy: string, screeningRequestedBy: string): void {
  if (dispositionRequestedBy === screeningRequestedBy) {
    throw new Aml1Error("AML1_SELF_DISPOSITION_BLOCKED");
  }
}

/**
 * Canonical payload bound into `payload_hash` at request time and recomputed from the STORED row
 * at apply time (never from caller-supplied input at apply time) — the same `fingerprint()`-over-
 * canonical-object pattern every prior maker-checker table in this codebase uses.
 */
export function decisionPayload(row: { decision_id: string; screening_match_id: string; decision_type: string; reason: string | null; requested_by: string }): Record<string, unknown> {
  return {
    decision_id: row.decision_id,
    screening_match_id: row.screening_match_id,
    decision_type: row.decision_type,
    reason: row.reason,
    requested_by: row.requested_by,
  };
}
