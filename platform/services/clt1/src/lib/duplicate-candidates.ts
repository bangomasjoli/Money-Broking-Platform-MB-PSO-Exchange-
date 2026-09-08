/**
 * CLT-01 Phase 6 — pure duplicate-candidate validation logic. No DB access, no HTTP —
 * routes/duplicate-candidates.ts is the only caller. Kept pure and DB-free so every rule here is
 * unit-testable without a database, same discipline lib/related-party-edges.ts and
 * lib/authorised-parties.ts already established.
 *
 * `subject_type`/`matched_type` generalize the blueprint's own `05_Database_Design.md` §2.8 literal
 * columns (`application_id` subject, `matched_client_id` matched) into a polymorphic pair limited
 * to `application`/`client`/`party` — `authorised_user`/`client_mandate` are deliberately NOT node
 * types (approved Phase 6 design decision; the blueprint's own duplicate concept never references
 * either). `match_type` and `status` both adopt the blueprint's own exact enums verbatim.
 *
 * Node EXISTENCE validation (does a `application`/`client`/`party` row with this ID actually
 * exist) requires a DB read and therefore lives in routes/duplicate-candidates.ts, not here — this
 * file only validates the SHAPE of a proposed candidate (self-reference), which needs no DB access.
 */
import { AppError } from "@aix/foundation";
import { Clt1Error } from "./errors.js";

export const DUPLICATE_CANDIDATE_NODE_TYPES = ["application", "client", "party"] as const;
export type DuplicateCandidateNodeType = (typeof DUPLICATE_CANDIDATE_NODE_TYPES)[number];

export const MATCH_TYPES = ["name", "id", "email", "phone", "corporate_ref"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const DUPLICATE_CANDIDATE_STATUSES = ["open", "duplicate", "not_duplicate", "needs_more_info"] as const;
export type DuplicateCandidateStatus = (typeof DUPLICATE_CANDIDATE_STATUSES)[number];

export const DUPLICATE_CANDIDATE_SOURCE_TYPES = ["manual", "future_detector"] as const;
export type DuplicateCandidateSourceType = (typeof DUPLICATE_CANDIDATE_SOURCE_TYPES)[number];

export interface DuplicateCandidateRow {
  duplicate_candidate_id: string;
  subject_type: DuplicateCandidateNodeType;
  subject_ref: string;
  matched_type: DuplicateCandidateNodeType;
  matched_ref: string;
  match_type: MatchType;
  match_score: string | null;
  status: DuplicateCandidateStatus;
  source_type: DuplicateCandidateSourceType;
  source_ref: string | null;
  evidence_ref: string | null;
  reviewed_by: string | null;
  reviewed_at_utc: string | null;
  approval_id: string | null;
  requested_by: string;
  sec_audit_ref: string | null;
  version: number;
  created_at_utc: string;
  updated_at_utc: string;
}

/** Non-PII projection of a duplicate_candidate row — every column here is an internal ID, enum
 * value, or free-text evidence/source reference, never a joined PII field like
 * `client_application.legal_name`/`authorised_party.party_reference` (the caller must never join
 * that in). Excludes `reviewed_by`/`requested_by`/`approval_id`/`sec_audit_ref` — actor
 * attribution stays internal, same discipline `related_party_edge`'s safe response established. */
export function safeDuplicateCandidateResponse(row: DuplicateCandidateRow): Record<string, unknown> {
  return {
    duplicate_candidate_id: row.duplicate_candidate_id,
    subject_type: row.subject_type,
    subject_ref: row.subject_ref,
    matched_type: row.matched_type,
    matched_ref: row.matched_ref,
    match_type: row.match_type,
    match_score: row.match_score,
    status: row.status,
    source_type: row.source_type,
    source_ref: row.source_ref,
    evidence_ref: row.evidence_ref,
    reviewed_at_utc: row.reviewed_at_utc,
    version: row.version,
    created_at_utc: row.created_at_utc,
    updated_at_utc: row.updated_at_utc,
  };
}

/** Throws the shared foundation VALIDATION_ERROR (not a new CLT-01 code — same discipline
 * lib/related-party-edges.ts's validateNotSelfReference already established) if the proposed
 * candidate's `subject`/`matched` node is identical (same type, same ref) — a self-candidate. The
 * DB's own CHECK constraint (migration 029) is a backstop; this is the primary, earlier check so a
 * self-candidate never reaches a decision-request row at all. */
export function validateNotSelfCandidate(subjectType: DuplicateCandidateNodeType, subjectRef: string, matchedType: DuplicateCandidateNodeType, matchedRef: string): void {
  if (subjectType === matchedType && subjectRef === matchedRef) {
    throw new AppError("VALIDATION_ERROR", {
      details: [{ field: "matched_ref", issue: "subject and matched must not reference the same entity" }],
    });
  }
}

type CandidateAction = "update" | "confirm" | "dismiss";

/** Throws CLT1_DUPLICATE_CANDIDATE_INVALID_STATE if `currentStatus` does not allow `action`. All
 * three of update/confirm/dismiss require the candidate to currently be 'open' — there is nothing
 * to update or resolve on an already-resolved ('duplicate'/'not_duplicate') candidate, and
 * 'needs_more_info' has no reachable transition this phase (present-but-defensive, see file header
 * comment and migration 029's own header comment). */
export function validateDuplicateCandidateTransition(currentStatus: DuplicateCandidateStatus, action: CandidateAction): void {
  if (currentStatus !== "open") {
    throw new Clt1Error("CLT1_DUPLICATE_CANDIDATE_INVALID_STATE", {
      details: [{ field: "status", issue: `cannot perform '${action}' on a duplicate candidate in status '${currentStatus}'` }],
    });
  }
}

export function duplicateCandidateNotFound(): never {
  throw new Clt1Error("CLT1_DUPLICATE_CANDIDATE_NOT_FOUND");
}

export function duplicateCandidateNodeNotFound(): never {
  throw new Clt1Error("CLT1_DUPLICATE_NODE_NOT_FOUND");
}

/**
 * Blueprint SoD rule 4 (`07_Permission_Rules.md` §3 item 8's own supporting rule): "Duplicate
 * reviewer cannot approve own duplicate override if they created the application." Resolves EVERY
 * `application`-typed side of the pair (subject, matched, or both — a candidate can legitimately be
 * application-vs-application) and blocks if `requestedBy` equals ANY of those applications' own
 * `created_by`. A local, CLT-01-owned check — no IAM-02 change — mirrors Phase 2's own
 * `CLT1_SELF_APPROVAL_BLOCKED` local-SoD-check precedent.
 *
 * Deliberately a NO-OP (never throws) when neither side of the pair is `application`-typed (e.g. a
 * `party`-vs-`party` or `client`-vs-`client` candidate) — the blueprint's own rule only speaks to
 * the application-creator case; there is no equivalent "creator" concept for a bare client/party
 * pair, so this check has nothing to compare against and correctly does nothing.
 */
export function checkDuplicateSelfReviewBlocked(requestedBy: string, applicationCreatedByValues: readonly string[]): void {
  if (applicationCreatedByValues.includes(requestedBy)) {
    throw new Clt1Error("CLT1_DUPLICATE_SELF_REVIEW_BLOCKED");
  }
}

/**
 * CLT-01 Phase 7 — final approval compliance gate. `open`/`duplicate`/`needs_more_info` are all
 * unresolved-or-adverse from a final-approval standpoint: `open` and `needs_more_info` mean no
 * reviewer conclusion exists yet; `duplicate` means a reviewer already CONFIRMED an adverse
 * duplicate finding (approving the application would defeat the entire point of that review).
 * Only `not_duplicate` (a reviewer-confirmed safe resolution) allows approval to proceed. An empty
 * candidate list — no `duplicate_candidate` row touches this application or any of its
 * `authorised_party` nodes — also allows approval (nothing to resolve).
 *
 * `needs_more_info` blocks defensively even though no Phase 6 code path can currently produce it
 * (present-but-unreachable, same posture as the column's own CHECK constraint) — a later phase
 * adding that transition must not silently bypass this gate by omission.
 */
export const DUPLICATE_CANDIDATE_BLOCKING_STATUSES: ReadonlySet<DuplicateCandidateStatus> = new Set(["open", "duplicate", "needs_more_info"]);

export interface DuplicateCandidateGateRow {
  duplicate_candidate_id: string;
  status: DuplicateCandidateStatus;
}

/** Throws CLT1_DUPLICATE_REVIEW_REQUIRED if any candidate in `candidates` has a blocking status.
 * `details` carries only `duplicate_candidate_id`/`status` — both internal IDs/enums, never PII
 * (the caller must never pass a PII-joined row here; see routes/decisions.ts's own fetch helper,
 * which selects `duplicate_candidate_id`/`status` only). */
export function evaluateDuplicateCandidateGateForApproval(candidates: readonly DuplicateCandidateGateRow[]): void {
  const blocking = candidates.find((c) => DUPLICATE_CANDIDATE_BLOCKING_STATUSES.has(c.status));
  if (blocking) {
    throw new Clt1Error("CLT1_DUPLICATE_REVIEW_REQUIRED", {
      details: [{ field: "duplicate_candidate_id", issue: `duplicate_candidate_id=${blocking.duplicate_candidate_id} status=${blocking.status}` }],
    });
  }
}
