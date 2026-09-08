/**
 * KYC-01 Phase 2A — application-level authoritative-outcome aggregation (approved Phase 2 planning
 * report design D2/D3/D4). Pure function, no DB/HTTP — mirrors `outcome-engine.ts`'s own posture.
 * Computes ONE application-level aggregate from the CURRENT set of KYC-01 cases held for an
 * application, so `POST .../publish-outcome` can never publish a per-case outcome that a sibling
 * anchor's own case would silently override (the risk the Phase 2 planning report's own "Critical
 * finding" identified: CLT-01's `cdd_outcome_status` is a single last-write-wins column, and one
 * application can legitimately hold several concurrently-valid KYC-01 cases — an `individual`/
 * `entity` case plus N `authorised_party` cases — so publishing per case could let a later party
 * `pass` silently overwrite an earlier primary `fail`).
 *
 * THREE LAYERS (D3):
 *   (a) within a case — `kyc_case.current_outcome_status`/`current_outcome_id` are already the
 *       authoritative outcome for that ONE case (kept in sync by `routes/outcome.ts` on every
 *       `compute-outcome` call); nothing here recomputes them.
 *   (b) within an anchor (`(application_id, case_type, COALESCE(party_id,''))` — migration 042's
 *       own anchor key) — the LATEST case wins OUTRIGHT, regardless of whether it has a computed
 *       outcome yet (LOW-7 fix — an earlier version only considered cases WITH an outcome, which
 *       left a corrective same-anchor case invisible to the aggregate while its own outcome was
 *       still uncomputed: a prior terminal `pass` stayed publishable/deliverable during the entire
 *       correction window, defeating the whole point of D4's own "create a new case to correct"
 *       path). Tie-break: `createdAtUtc` DESC, `caseId` DESC — the MED-1 total-order discipline
 *       applied to a second ordering, using only relational operators (never `===`/`!==`) even
 *       though every input here is already a genuine string by the time it reaches this function
 *       (D5's own DB-boundary normalization — see `kyc-case.ts`'s header comment). If the latest
 *       case's own `current_outcome_status` is `NULL` (compute-outcome has never run for it), layer
 *       (c) below treats that anchor as having no resolved status yet — see there for how a
 *       PRIMARY vs PARTY anchor differs in that case.
 *   (c) across anchors — worst-wins (D2): `fail` beats `remediation_required` beats `pass`. A
 *       PRIMARY anchor (`individual`/`entity` case type — there is at most one of each per
 *       application, but nothing here assumes exactly one) that is entirely absent, or whose
 *       latest case has no computed outcome yet, makes the WHOLE aggregate `pending` (not
 *       publishable — see `OutcomeAggregateResult.publishable`) — the primary CDD result is
 *       load-bearing, KYC-01 will not synthesize a decision without it. A PARTY
 *       (`authorised_party`) anchor whose latest case has no computed outcome yet does NOT block
 *       the whole aggregate the same way; it is folded in as `remediation_required` instead
 *       (`"not yet passed, nothing failed either"` is exactly what `remediation_required` already
 *       means at the single-case level). A `pass` aggregate therefore requires EVERY primary
 *       anchor AND EVERY party anchor to have independently passed — a late-arriving party `pass`
 *       can never override an already-fixed primary `fail`, because the fold checks for `fail`
 *       PRESENCE across the WHOLE set, never "whichever anchor was computed most recently"
 *       (worst-wins, never latest-wins — proven directly by this file's own order-independence
 *       tests).
 *
 * CORRECTION PATH (D4): Phase 1's `pass` stays terminal WITHIN a case — no override, no
 * maker-checker, no non-terminal `pass`, all explicitly out of Phase 2A scope. Correction instead
 * happens by creating a NEW case for the same anchor (already possible today — migration 042's own
 * partial unique index only blocks a duplicate ACTIVE case, never a duplicate completed one); this
 * file's own layer (b) picks the new case as that anchor's representative IMMEDIATELY (LOW-7 —
 * latest wins outright, not latest-with-an-outcome), so the correction window itself is visible to
 * layer (c) from the moment the corrective case is created, not only once its own outcome is
 * computed.
 *
 * PHASE 2B — LOW-6/LOW-7 fixes (independent Opus review of Phase 2A). LOW-7: see (b) above — an
 * in-flight corrective case now blocks (primary) or downgrades (party) the aggregate immediately,
 * rather than leaving a stale terminal `pass` silently publishable/deliverable throughout the
 * correction window. LOW-6: `detectTiedConflictingEvidence`'s grouping key gained `caseId` (see
 * its own doc comment below) — a tie is now detected only WITHIN one case's own evidence, never
 * across two independently-consistent cases that happen to share a timestamp.
 */
import type { KycCaseType } from "./kyc-case.js";

export interface AuthoritativeCaseInput {
  caseId: string;
  caseType: KycCaseType;
  partyId: string | null;
  currentOutcomeStatus: "pass" | "fail" | "remediation_required" | null;
  currentOutcomeId: string | null;
  createdAtUtc: string;
}

export type AggregateOutcomeStatus = "pass" | "fail" | "remediation_required";

export interface AuthoritativeOutcomeResult {
  publishable: boolean;
  aggregateStatus: AggregateOutcomeStatus | null;
  /** `case_id`s of every anchor's authoritative case that genuinely contributed a resolved status
   * to the aggregate (sorted by `caseId` ascending — deterministic regardless of input order, so a
   * caller hashing this array for tamper-evidence gets a stable result). Empty when
   * `publishable` is `false`. */
  contributingCaseIds: string[];
  /** `current_outcome_id`s for the SAME cases, in the SAME order as `contributingCaseIds` (paired
   * index-for-index) — the exact `cdd_outcome` rows the aggregate was derived from. */
  contributingOutcomeIds: string[];
}

function anchorKey(c: AuthoritativeCaseInput): string {
  return `${c.caseType}::${c.partyId ?? ""}`;
}

/** Total, deterministic descending-recency order for anchor tie-break: `createdAtUtc` DESC, then
 * `caseId` DESC. Relational operators only — see this file's own header comment (b). */
function compareByRecencyThenCaseId(a: AuthoritativeCaseInput, b: AuthoritativeCaseInput): number {
  if (a.createdAtUtc > b.createdAtUtc) return -1;
  if (a.createdAtUtc < b.createdAtUtc) return 1;
  if (a.caseId > b.caseId) return -1;
  if (a.caseId < b.caseId) return 1;
  return 0;
}

/** Groups `cases` by anchor and picks ONE representative per anchor: the latest case, full stop
 * (LOW-7 fix — see this file's own header comment (b) for why this must NOT filter to only cases
 * that already have a computed outcome). The caller (layer (c)) is responsible for interpreting a
 * representative whose `currentOutcomeStatus` is still `null`. Exported (Phase 4B) so
 * `computeRosterBoundOutcome` below can REUSE the identical latest/corrective-case resolution rule
 * — never a second, alternative case-authority algorithm. */
export function selectAuthoritativeCasePerAnchor(cases: AuthoritativeCaseInput[]): AuthoritativeCaseInput[] {
  const byAnchor = new Map<string, AuthoritativeCaseInput[]>();
  for (const c of cases) {
    const key = anchorKey(c);
    const list = byAnchor.get(key);
    if (list) list.push(c);
    else byAnchor.set(key, [c]);
  }

  const result: AuthoritativeCaseInput[] = [];
  for (const list of byAnchor.values()) {
    result.push([...list].sort(compareByRecencyThenCaseId)[0]!);
  }
  return result;
}

/**
 * Computes the application-level authoritative outcome from the full current set of KYC-01 cases
 * for an application (any case_type/party_id combination, any status — the caller does not need to
 * pre-filter). Order-independent: the SAME case set always produces the SAME result regardless of
 * array order (proven directly by this file's own tests).
 */
export function computeAuthoritativeOutcome(cases: AuthoritativeCaseInput[]): AuthoritativeOutcomeResult {
  const notPublishable: AuthoritativeOutcomeResult = { publishable: false, aggregateStatus: null, contributingCaseIds: [], contributingOutcomeIds: [] };

  const authoritative = selectAuthoritativeCasePerAnchor(cases);
  const primaryAnchors = authoritative.filter((c) => c.caseType !== "authorised_party");
  const partyAnchors = authoritative.filter((c) => c.caseType === "authorised_party");

  // No individual/entity case has EVER been created for this application — nothing to aggregate.
  if (primaryAnchors.length === 0) return notPublishable;
  // A primary anchor exists but its latest case has no computed outcome yet (still
  // pending_documents) — the primary CDD result is load-bearing; do not synthesize a decision.
  if (primaryAnchors.some((c) => c.currentOutcomeStatus === null)) return notPublishable;

  const contributing: AuthoritativeCaseInput[] = [...primaryAnchors];
  const effectiveStatuses: AggregateOutcomeStatus[] = primaryAnchors.map((c) => c.currentOutcomeStatus as AggregateOutcomeStatus);

  for (const party of partyAnchors) {
    if (party.currentOutcomeStatus === null) {
      // Case exists but compute-outcome has never run for it — folded in as remediation_required
      // (see header comment (c)) rather than blocking the whole aggregate the way a missing/
      // uncomputed PRIMARY anchor does. Deliberately NOT added to `contributing` — there is no
      // `current_outcome_id` yet to cite as contributing evidence.
      effectiveStatuses.push("remediation_required");
      continue;
    }
    contributing.push(party);
    effectiveStatuses.push(party.currentOutcomeStatus);
  }

  let aggregateStatus: AggregateOutcomeStatus;
  if (effectiveStatuses.includes("fail")) aggregateStatus = "fail";
  else if (effectiveStatuses.includes("remediation_required")) aggregateStatus = "remediation_required";
  else aggregateStatus = "pass";

  // Sorted by caseId — deterministic regardless of the order `cases` arrived in (Map iteration
  // order otherwise follows first-occurrence order of the INPUT array), so a caller computing
  // payload_hash over these arrays gets a stable result independent of query row order.
  const sortedContributing = [...contributing].sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0));

  return {
    publishable: true,
    aggregateStatus,
    contributingCaseIds: sortedContributing.map((c) => c.caseId),
    contributingOutcomeIds: sortedContributing.map((c) => c.currentOutcomeId as string),
  };
}

export interface EvidenceConflictInput {
  caseId: string;
  resultType: string;
  resultStatus: string;
  receivedAtUtc: string;
}

/**
 * D4 — the INFO-6 remedy. True if ANY `(caseId, resultType, receivedAtUtc)` group among the given
 * verification results contains BOTH a `pass` and a `fail` — the exact MED-1 tie scenario (a
 * genuine, deterministically-arbitrated-but-semantically-arbitrary tie) surfacing at PUBLISH time,
 * not just at compute-outcome time. Pure, order-independent. String equality on `receivedAtUtc` is
 * safe here specifically because D5's own DB-boundary normalization guarantees every caller-
 * supplied value is already a genuine ISO string by the time it reaches this function (never a
 * `Date` object) — see `kyc-case.ts`'s header comment. The caller (`routes/outcome-publication.ts`)
 * only invokes this when the computed aggregate would be `pass`; a `fail`/`remediation_required`
 * aggregate is never blocked by it, since a tie in one case's evidence does not change an already-
 * unfavourable aggregate.
 *
 * LOW-6 FIX (independent Opus review of Phase 2A): `caseId` is now part of the grouping key. The
 * caller flattens every contributing case's own verification results into one array before calling
 * this function — without `caseId` in the key, two DIFFERENT contributing cases (e.g. a primary and
 * a party anchor), each internally consistent, could share one `receivedAtUtc`/`resultType` with
 * opposing statuses and wrongly refuse a publication that has no genuine tie in either case's own
 * evidence. A tie is now detected ONLY within one case's own evidence, matching what this file's
 * and `routes/outcome-publication.ts`'s own doc comments always claimed the check did.
 */
export function detectTiedConflictingEvidence(results: EvidenceConflictInput[]): boolean {
  const groups = new Map<string, Set<string>>();
  for (const r of results) {
    const key = `${r.caseId}::${r.resultType}::${r.receivedAtUtc}`;
    const set = groups.get(key);
    if (set) set.add(r.resultStatus);
    else groups.set(key, new Set([r.resultStatus]));
  }
  for (const set of groups.values()) {
    if (set.has("pass") && set.has("fail")) return true;
  }
  return false;
}

/**
 * ---------------------------------------------------------------------------------------
 * PHASE 4B — CLT-01 roster-bound completeness (`computeRosterBoundOutcome`).
 * ---------------------------------------------------------------------------------------
 * EXTENDS the above (D1's own limitation, closed): `computeAuthoritativeOutcome` aggregates over
 * KYC-01's OWN case set alone — "every anchor KYC-01 itself holds a case for has passed", never
 * "every anchor CLT-01 says SHOULD exist has passed". This function adds that second, previously
 * missing check, using CLT-01's own Phase 4A roster as the authoritative statement of which parties
 * are REQUIRED — without replacing or modifying `computeAuthoritativeOutcome` itself (its own
 * existing tests, and every route/caller that still wants the roster-FREE aggregate, are
 * untouched). REUSES `selectAuthoritativeCasePerAnchor` (above) for anchor resolution — the
 * identical latest/corrective-case tie-break rule, never a second algorithm.
 *
 * APPROVED PHASE 4B COMPLIANCE DECISIONS (not this function's own invention):
 *   - Required `authority_status` values: `pending`/`active`/`restricted`/`suspended`. Excluded
 *     (terminal, never required): `rejected`/`revoked`.
 *   - An extra KYC `authorised_party` case (its `party_id` is NOT in CLT's required set) does NOT
 *     contribute to the aggregate, does NOT satisfy any required party, and does NOT block
 *     publication BY ITSELF — counted only (`extraCaseCount`), for audit visibility.
 *   - A required party missing a KYC case, OR whose case has no computed outcome yet, ALWAYS
 *     blocks — never downgraded to `remediation_required`. This is a DELIBERATE TIGHTENING of
 *     `computeAuthoritativeOutcome`'s own layer (c) (which folds an uncomputed PARTY anchor into
 *     `remediation_required` rather than blocking) — missing CLT-required coverage is a
 *     PUBLICATION-COMPLETENESS failure, not a compliance outcome, and must never be represented as
 *     one. This function does not call, and is not built from, that folding behaviour.
 *
 * MATCHING IS EXACT STRING EQUALITY ONLY — `case.partyId === authorisedPartyId`. Never by
 * position, count, `party_type`, name, `party_reference`, role, or fuzzy comparison; the roster's
 * own `party_type` field is not even read by this function (only `authorisedPartyId` and
 * `authorityStatus` matter for matching/requirement — `party_type` is roster/UI context CLT-01
 * keeps, not a KYC-01 matching key).
 *
 * PRIMARY RESOLUTION: a primary anchor is a case with `caseType` matching CLT's
 * `primarySubjectType` ('individual'/'entity') AND `partyId === null` (existing KYC-01 anchoring
 * rule — a primary case never carries a `party_id`). Three distinct, reachable malformed
 * conditions, each with its own bounded reason code (all fail closed — `publishable: false`):
 *   - `primary_missing` — no case of EITHER primary type exists for this application at all.
 *   - `primary_type_mismatch` — a primary-shaped case exists, but only of the WRONG type (CLT says
 *     'individual', KYC-01 only holds an 'entity' case, or vice versa).
 *   - `anchor_ambiguous` — cases of BOTH 'individual' AND 'entity' exist simultaneously for the
 *     same application — genuinely ambiguous which one CLT's single binary `primary_subject_type`
 *     should bind to; refused rather than guessed.
 *
 * `party_outcome_pending` is deliberately reused for BOTH an uncomputed PRIMARY anchor and an
 * uncomputed REQUIRED PARTY anchor — one generic, genuinely-shared meaning ("this anchor exists but
 * has no resolved outcome yet"), not two names for the same condition (mirrors this file's own
 * `KYC1_CASE_INVALID_STATE` reuse discipline at the error-catalogue layer).
 */
export type PublicationRefusalReasonCode =
  | "primary_missing"
  | "primary_type_mismatch"
  | "anchor_ambiguous"
  | "party_missing"
  | "party_outcome_pending";

export interface RosterCompletenessInput {
  primarySubjectType: "individual" | "entity";
  /** Opaque CLT `authorised_party_id` values whose `authority_status` is one of the four required
   * values — already filtered by the caller (`routes/outcome-publication.ts`) from the full roster;
   * this function does not itself know about `authority_status`'s full value space. Order does not
   * matter — this function treats it as a set. */
  requiredAuthorisedPartyIds: readonly string[];
}

export interface RosterBoundOutcomeResult {
  publishable: boolean;
  aggregateStatus: AggregateOutcomeStatus | null;
  reasonCode: PublicationRefusalReasonCode | null;
  /** Same pairing/ordering contract as `AuthoritativeOutcomeResult` — sorted by `caseId` ascending,
   * empty when `publishable` is `false`. */
  contributingCaseIds: string[];
  contributingOutcomeIds: string[];
  requiredPartyCount: number;
  /** How many required parties were confirmed to have a resolved outcome AT THE POINT this result
   * was computed — always EQUAL to `requiredPartyCount` when `publishable` is `true` (every
   * required party was necessarily resolved to reach that branch); may be LESS than
   * `requiredPartyCount` in a `party_missing`/`party_outcome_pending` refusal (diagnostic value for
   * the refusal audit — "9 of 10 resolved", not merely "refused"), and is always `0` for a
   * primary-side refusal (the party loop is never reached). */
  evaluatedPartyCount: number;
  /** The REQUIRED `authorised_party_id` set, sorted by codepoint order (the same locale-independent
   * comparator CLT-01's own Phase 4A roster route uses) — deterministic regardless of the order
   * `requiredAuthorisedPartyIds` arrived in. Populated ONLY when `publishable` is `true` (empty
   * otherwise) — mirrors `contributingCaseIds`/`contributingOutcomeIds`'s own convention on this
   * type. Opaque IDs only — never `party_reference`, never any PII. */
  contributingPartyIds: string[];
  /** Count of KYC-01 `authorised_party` cases whose `partyId` is NOT in the required set — see this
   * function's own header comment. Always `0` for any refusal reached before the party loop runs
   * (primary-side refusals); computed fully only on the `publishable: true` path. */
  extraCaseCount: number;
}

function sortedByCodePoint(values: readonly string[]): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function computeRosterBoundOutcome(cases: AuthoritativeCaseInput[], roster: RosterCompletenessInput): RosterBoundOutcomeResult {
  const requiredPartyCount = roster.requiredAuthorisedPartyIds.length;
  const refuse = (reasonCode: PublicationRefusalReasonCode, evaluatedPartyCount = 0): RosterBoundOutcomeResult => ({
    publishable: false,
    aggregateStatus: null,
    reasonCode,
    contributingCaseIds: [],
    contributingOutcomeIds: [],
    requiredPartyCount,
    evaluatedPartyCount,
    contributingPartyIds: [],
    extraCaseCount: 0,
  });

  const authoritative = selectAuthoritativeCasePerAnchor(cases);
  const individualCase = authoritative.find((c) => c.caseType === "individual" && c.partyId === null);
  const entityCase = authoritative.find((c) => c.caseType === "entity" && c.partyId === null);

  if (individualCase && entityCase) return refuse("anchor_ambiguous");

  const primaryCase = roster.primarySubjectType === "individual" ? individualCase : entityCase;
  const wrongTypePrimaryCase = roster.primarySubjectType === "individual" ? entityCase : individualCase;
  if (!primaryCase) return refuse(wrongTypePrimaryCase ? "primary_type_mismatch" : "primary_missing");
  if (primaryCase.currentOutcomeStatus === null) return refuse("party_outcome_pending");

  const requiredIdSet = new Set(roster.requiredAuthorisedPartyIds);
  const requiredResults = roster.requiredAuthorisedPartyIds.map((partyId) => ({
    partyId,
    case: authoritative.find((c) => c.caseType === "authorised_party" && c.partyId === partyId),
  }));
  const resolvedCount = requiredResults.filter((r) => r.case !== undefined && r.case.currentOutcomeStatus !== null).length;

  if (requiredResults.some((r) => r.case === undefined)) return refuse("party_missing", resolvedCount);
  if (requiredResults.some((r) => r.case!.currentOutcomeStatus === null)) return refuse("party_outcome_pending", resolvedCount);

  const contributing: AuthoritativeCaseInput[] = [primaryCase, ...requiredResults.map((r) => r.case!)];
  const effectiveStatuses = contributing.map((c) => c.currentOutcomeStatus as AggregateOutcomeStatus);

  let aggregateStatus: AggregateOutcomeStatus;
  if (effectiveStatuses.includes("fail")) aggregateStatus = "fail";
  else if (effectiveStatuses.includes("remediation_required")) aggregateStatus = "remediation_required";
  else aggregateStatus = "pass";

  const sortedContributing = [...contributing].sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0));
  const extraCaseCount = authoritative.filter((c) => c.caseType === "authorised_party" && !requiredIdSet.has(c.partyId ?? "")).length;

  return {
    publishable: true,
    aggregateStatus,
    reasonCode: null,
    contributingCaseIds: sortedContributing.map((c) => c.caseId),
    contributingOutcomeIds: sortedContributing.map((c) => c.currentOutcomeId as string),
    requiredPartyCount,
    evaluatedPartyCount: requiredPartyCount,
    contributingPartyIds: sortedByCodePoint(roster.requiredAuthorisedPartyIds),
    extraCaseCount,
  };
}
