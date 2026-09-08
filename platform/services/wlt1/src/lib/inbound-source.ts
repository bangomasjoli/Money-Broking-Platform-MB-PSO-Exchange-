/**
 * WLT-01 Inbound-Source Screening — pure identity/eligibility/audit-metadata/response-projection
 * helpers. Implements the FROZEN architecture (WLT-01 Inbound-Source Screening
 * Implementation-Contract Architecture Addendum + Transfer-Replay/Idempotency Final
 * Micro-Correction) exactly — no new architectural decisions are made in this file.
 *
 * SCREENING-SUBJECT IDENTITY is `(chain, network, canonical_address)`, hashed via the SAME
 * `computeAddressHash` primitive `lib/destinations.ts` already exports — no duplicated
 * canonicalisation/hashing logic. `memoTagIdentity` is always `""` (no chain this route supports
 * permits a memo/tag — `wlt1.chain_coverage.memo_tag_requirement` is `'not_permitted'`-only).
 * `client_id` scopes evidence but is deliberately NOT part of `address_hash` (an inbound source
 * address is a fact about the chain, not about any one client).
 *
 * TRANSACTION correlation metadata (`transaction_ref`/`transaction_hash`/`asset`) is NEVER part of
 * the screening-subject identity and NEVER part of `address_hash` — frozen addendum Issue 1/§4.
 *
 * `isDuplicateInboundTransferViolation` is the ONE constraint this file (and the route) ever
 * treats as transfer-replay/conflict — a bare `23505` is never sufficient; the exact named
 * constraint `uq_wlt1_inbound_source_transfer` must match (frozen Final Micro-Correction §15).
 * `uq_wlt1_inbound_source_result_id`/`uq_wlt1_inbound_source_version` are NEVER matched here.
 */
import { randomUUID } from "node:crypto";
import { computeAddressHash } from "./destinations.js";
import type { RiskCategory } from "./providers/types.js";

export { computeAddressHash };

export function newInboundScreeningResultId(): string {
  return "wlt1isr_" + randomUUID();
}

export const TRANSFER_UNIQUE_CONSTRAINT = "uq_wlt1_inbound_source_transfer";

/** ONLY this exact named constraint is ever treated as transfer-replay/conflict — never a bare
 * `23505`, and never `uq_wlt1_inbound_source_result_id`/`uq_wlt1_inbound_source_version`, both of
 * which indicate an unrelated (and unexpected) uniqueness failure that must propagate as
 * `WLT1_AUDIT_REQUIRED`, not be silently reinterpreted as a domain replay/conflict. */
export function isDuplicateInboundTransferViolation(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === "23505" && pgErr?.constraint === TRANSFER_UNIQUE_CONSTRAINT;
}

// -------------------------------------------------------------------------------------------
// Risk -> eligibility mapping (frozen addendum Issue 19/20/23/24 — exact, no ambiguity).
// -------------------------------------------------------------------------------------------
export type InboundRiskStatus = "clear" | "review_required" | "high_risk" | "hit";
export type InboundSourceEligibility = "eligible" | "not_eligible";

export const INBOUND_REASON_CODES = ["source_screening_clear", "source_review_required", "source_high_risk", "source_sanctions_hit"] as const;
export type InboundReasonCode = (typeof INBOUND_REASON_CODES)[number];

const RISK_TO_ELIGIBILITY: Readonly<Record<InboundRiskStatus, { eligibility: InboundSourceEligibility; reasonCode: InboundReasonCode }>> = Object.freeze({
  clear: { eligibility: "eligible", reasonCode: "source_screening_clear" },
  review_required: { eligibility: "not_eligible", reasonCode: "source_review_required" },
  high_risk: { eligibility: "not_eligible", reasonCode: "source_high_risk" },
  hit: { eligibility: "not_eligible", reasonCode: "source_sanctions_hit" },
});

/** Pure mapping — never called for a technical-failure outcome (`unavailable`/`invalid_response`),
 * which is never an eligibility value at all (frozen addendum Issue 20). */
export function mapRiskToEligibility(riskStatus: InboundRiskStatus): { eligibility: InboundSourceEligibility; reasonCode: InboundReasonCode } {
  return RISK_TO_ELIGIBILITY[riskStatus];
}

// -------------------------------------------------------------------------------------------
// Audit metadata — exactly the 12 frozen keys, never a raw address/transaction_hash/asset/token.
// -------------------------------------------------------------------------------------------
export interface InboundScreeningAuditMetadataInput {
  screeningResultId: string;
  screeningResultVersion: number;
  clientId: string;
  chain: string;
  network: string;
  addressHash: string;
  transactionRef: string;
  riskStatus: InboundRiskStatus;
  sanctionsExposure: boolean | null;
  sourceEligibility: InboundSourceEligibility;
  reasonCode: InboundReasonCode;
  providerId: string;
}

export function buildInboundScreeningAuditMetadata(input: InboundScreeningAuditMetadataInput): Record<string, unknown> {
  return {
    screening_result_id: input.screeningResultId,
    screening_result_version: input.screeningResultVersion,
    client_id: input.clientId,
    chain: input.chain,
    network: input.network,
    address_hash: input.addressHash,
    transaction_ref: input.transactionRef,
    risk_status: input.riskStatus,
    sanctions_exposure: input.sanctionsExposure,
    source_eligibility: input.sourceEligibility,
    reason_code: input.reasonCode,
    provider_id: input.providerId,
  };
}

// -------------------------------------------------------------------------------------------
// Response projection — exactly the 15 frozen keys. NEVER canonical_address/source_address/
// address_hash/transaction_hash/asset/payload_hash/raw provider payload/service token.
// -------------------------------------------------------------------------------------------
export interface InboundScreeningResponseRow {
  screening_result_id: string;
  screening_result_version: number;
  client_id: string;
  chain: string;
  network: string;
  transaction_ref: string;
  risk_status: InboundRiskStatus;
  source_eligibility: InboundSourceEligibility;
  reason_code: string;
  sanctions_exposure: boolean | null;
  risk_categories: RiskCategory[];
  provider_id: string;
  provider_result_id: string | null;
  issued_at_utc: Date;
  valid_until_utc: Date | null;
}

/** Own copy — mirrors `lib/screening-application.ts`'s/`lib/fiat-destination.ts`'s own identical
 * `computeEffectiveValidUntil` exactly (F3(c)-adjacent discipline: each evidence domain owns its
 * trivial pure clipping helper rather than importing across domains). The DB stores this
 * EFFECTIVE value, never the unconstrained provider expiry — freshness exists solely as the
 * frozen seam for a future DEP consumer (addendum §61); this route itself never short-circuits on
 * it. */
export function computeEffectiveValidUntil(issuedAtUtc: Date, providerValidUntil: Date | null, ceilingHours: number): Date {
  const localCeiling = new Date(issuedAtUtc.getTime() + ceilingHours * 60 * 60 * 1000);
  if (providerValidUntil === null) return localCeiling;
  return providerValidUntil.getTime() < localCeiling.getTime() ? providerValidUntil : localCeiling;
}

export function buildInboundScreeningResponse(row: InboundScreeningResponseRow, replay: boolean): Record<string, unknown> {
  return {
    screening_result_id: row.screening_result_id,
    screening_result_version: row.screening_result_version,
    client_id: row.client_id,
    chain: row.chain,
    network: row.network,
    transaction_ref: row.transaction_ref,
    risk_status: row.risk_status,
    source_eligibility: row.source_eligibility,
    reason_code: row.reason_code,
    sanctions_exposure: row.sanctions_exposure,
    risk_categories: row.risk_categories,
    provider_id: row.provider_id,
    provider_result_id: row.provider_result_id,
    issued_at_utc: row.issued_at_utc.toISOString(),
    valid_until_utc: row.valid_until_utc ? row.valid_until_utc.toISOString() : null,
    replay,
  };
}
