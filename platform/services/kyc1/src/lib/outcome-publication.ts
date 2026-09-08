/**
 * KYC-01 Phase 2A — `kyc1.outcome_publication` row shape + safe-response projection. The table
 * itself (migration `043_kyc1_outcome_publication.cjs`) carries the application-level authoritative
 * outcome (`lib/authoritative-outcome.ts`) that `routes/outcome-publication.ts`'s publish route
 * inserts. `status` tracks the DELIVERY lifecycle (`pending` this phase — no CLT-01 client exists
 * yet; `succeeded`/`failed` are Phase 2B-only; `superseded` is genuinely reachable this phase, set
 * when a later publish call for the same application supersedes an earlier active row) — distinct
 * from `aggregate_status`, which is the KYC outcome BEING published, never the publication attempt's
 * own delivery status.
 *
 * PHASE 4B addition (migration `048_kyc1_publication_roster_binding.cjs`): five nullable
 * roster-binding evidence fields — see that migration's own header comment for the full field-by-
 * field rationale, the all-or-none binding invariant, and which sub-rules are DB-enforced vs
 * application-guaranteed. `NULL` on all five means a pre-048 (legacy) publication — see
 * `routes/outcome-publication.ts`'s delivery route for the resulting fail-closed behaviour.
 */
import { normalizeTimestamp } from "./kyc-case.js";

export interface OutcomePublicationRow {
  publication_id: string;
  application_id: string;
  aggregate_status: string;
  contributing_case_ids: string[];
  contributing_outcome_ids: string[];
  payload_hash: string;
  status: string;
  attempt_count: number;
  failure_reason_code: string | null;
  response_ref: string | null;
  requested_by: string;
  version: number;
  created_at_utc: string;
  delivered_at_utc: string | null;
  /** Phase 4B — CLT-owned roster digest this publication was validated against; `NULL` for a
   * pre-048 (legacy) publication. */
  roster_hash: string | null;
  required_party_count: number | null;
  evaluated_party_count: number | null;
  /** Opaque CLT `authorised_party_id` values only — never PII. `NULL` for a legacy publication. */
  contributing_party_ids: string[] | null;
  roster_fetched_at_utc: string | null;
}

export interface SafeOutcomePublicationResponse {
  publication_id: string;
  application_id: string;
  aggregate_status: string;
  contributing_case_ids: string[];
  contributing_outcome_ids: string[];
  status: string;
  attempt_count: number;
  failure_reason_code: string | null;
  response_ref: string | null;
  requested_by: string;
  created_at_utc: string;
  delivered_at_utc: string | null;
  roster_hash: string | null;
  required_party_count: number | null;
  evaluated_party_count: number | null;
  contributing_party_ids: string[] | null;
  roster_fetched_at_utc: string | null;
}

/** Normalizes `created_at_utc`/`delivered_at_utc`/`roster_fetched_at_utc` — see `kyc-case.ts`'s
 * own header comment (D5). */
export function normalizeOutcomePublicationRow(row: OutcomePublicationRow): OutcomePublicationRow {
  return {
    ...row,
    created_at_utc: normalizeTimestamp(row.created_at_utc),
    delivered_at_utc: row.delivered_at_utc === null ? null : normalizeTimestamp(row.delivered_at_utc),
    roster_fetched_at_utc: row.roster_fetched_at_utc === null ? null : normalizeTimestamp(row.roster_fetched_at_utc),
  };
}

/** `payload_hash` is deliberately EXCLUDED — internal tamper-evidence, mirrors
 * `outcome-engine.ts`'s own `safeCddOutcomeResponse` precedent exactly. No CLT-01 response body,
 * no PII, no raw evidence_ref, no document content — `response_ref` is an opaque CLT-01-side id
 * (Phase 2B only; always `null` this phase), never the full delivery response. The five Phase 4B
 * roster-binding fields ARE included — every one is non-PII (a digest, bounded counts, opaque
 * `authorised_party_id` values, a timestamp), and exposing them is what makes a publication's
 * evidence independently inspectable by an operator, the same transparency
 * `contributing_case_ids`/`contributing_outcome_ids` already provide. */
export function safeOutcomePublicationResponse(row: OutcomePublicationRow): SafeOutcomePublicationResponse {
  return {
    publication_id: row.publication_id,
    application_id: row.application_id,
    aggregate_status: row.aggregate_status,
    contributing_case_ids: row.contributing_case_ids,
    contributing_outcome_ids: row.contributing_outcome_ids,
    status: row.status,
    attempt_count: row.attempt_count,
    failure_reason_code: row.failure_reason_code,
    response_ref: row.response_ref,
    requested_by: row.requested_by,
    created_at_utc: row.created_at_utc,
    delivered_at_utc: row.delivered_at_utc,
    roster_hash: row.roster_hash,
    required_party_count: row.required_party_count,
    evaluated_party_count: row.evaluated_party_count,
    contributing_party_ids: row.contributing_party_ids,
    roster_fetched_at_utc: row.roster_fetched_at_utc,
  };
}
