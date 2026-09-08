/**
 * WLT-01 Evidence Export — pure scope/payload/hash helpers plus the bounded, explicitly-projected
 * evidence-collection logic. Implements the FROZEN architecture (WLT-01 Evidence Export
 * Implementation-Contract Architecture Addendum + Final Micro-Clarification + IAM/Idempotency +
 * Manifest Final Correction) exactly — no new architectural decisions are made in this file.
 *
 * IMPLEMENTATION COMPLETENESS NOTE (disclosed, not silently decided): the frozen per-type field
 * allowlists for `wallet_screening_result`/`fiat_screening_result`/`beneficiary_verification`/
 * `proof_of_control`/`destination_revocation` did not name `destination_id` among their exported
 * fields (unlike the other five types, which all explicitly include it). Omitting it would make
 * those five evidence arrays unlinkable to the destination they concern — incoherent with the
 * frozen definition of a "formal evidentiary package" and with this file's own frozen sort tuples,
 * every one of which already orders by `destination_id` first. `destination_id` is therefore
 * INCLUDED in all 10 projections below (it is already a plain, non-Restricted identifier exported
 * by the other five types, and appears on no forbidden-field list anywhere in the addendum) —
 * flagged here for the independent reviewer rather than silently added.
 *
 * NO SELECT *, NO whole-row JSON.stringify anywhere in this file — every projection is an explicit
 * SQL column list AND an explicit mapper function (addendum's own "no row dump" acceptance rule).
 *
 * NO provider network call, NO SEC-01 query — this module reads ONLY already-stored WLT domain
 * tables via the caller-supplied `PoolClient` (the caller is responsible for opening the
 * REPEATABLE READ generation transaction BEFORE calling `collectAllEvidence`).
 */
import type { PoolClient, QueryResultRow } from "pg";
import { fingerprint, query } from "@aix/foundation";
import { Wlt1Error } from "./errors.js";

// -------------------------------------------------------------------------------------------
// Evidence type enum — this IS the canonical ordering (addendum Issue 16/24).
// -------------------------------------------------------------------------------------------
export const EVIDENCE_TYPES = [
  "destination_current_state",
  "wallet_destination",
  "fiat_payout_destination",
  "address_integrity_check",
  "wallet_screening_result",
  "fiat_screening_result",
  "beneficiary_verification",
  "proof_of_control",
  "destination_decision",
  "destination_revocation",
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

const EVIDENCE_TYPE_ORDER: Readonly<Record<string, number>> = Object.freeze(Object.fromEntries(EVIDENCE_TYPES.map((t, i) => [t, i])));

export function isKnownEvidenceType(value: string): value is EvidenceType {
  return Object.prototype.hasOwnProperty.call(EVIDENCE_TYPE_ORDER, value);
}

/** Rejects unknown values and duplicates (never silently deduplicated — addendum Issue 18/24),
 * then sorts into the fixed canonical enum order. Caller-supplied array order never affects the
 * output — approval hash, scope hash, queries, manifest, and content hash are all built from this
 * canonicalised array. */
export function canonicaliseEvidenceTypes(raw: readonly string[]): { ok: true; types: EvidenceType[] } | { ok: false; issue: string } {
  const seen = new Set<string>();
  for (const t of raw) {
    if (!isKnownEvidenceType(t)) return { ok: false, issue: "unknown_evidence_type" };
    if (seen.has(t)) return { ok: false, issue: "duplicate_evidence_type" };
    seen.add(t);
  }
  const sorted = Array.from(seen).sort((a, b) => EVIDENCE_TYPE_ORDER[a]! - EVIDENCE_TYPE_ORDER[b]!) as EvidenceType[];
  return { ok: true, types: sorted };
}

// -------------------------------------------------------------------------------------------
// Date range normalisation (addendum Issue 19/25/26) — explicit offset required; half-open
// [from, to) semantics; canonical UTC ISO-8601 with milliseconds.
// -------------------------------------------------------------------------------------------
const ISO_OFFSET_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/;

function normaliseOneDate(raw: string | undefined): string | null | "invalid" {
  if (raw === undefined) return null;
  if (!ISO_OFFSET_SUFFIX.test(raw)) return "invalid";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return "invalid";
  return new Date(ms).toISOString();
}

export function normaliseDateRange(fromRaw: string | undefined, toRaw: string | undefined): { ok: true; fromUtc: string | null; toUtc: string | null } | { ok: false; issue: string } {
  const fromUtc = normaliseOneDate(fromRaw);
  if (fromUtc === "invalid") return { ok: false, issue: "invalid_from_utc" };
  const toUtc = normaliseOneDate(toRaw);
  if (toUtc === "invalid") return { ok: false, issue: "invalid_to_utc" };
  if (fromUtc !== null && toUtc !== null && Date.parse(fromUtc) >= Date.parse(toUtc)) {
    return { ok: false, issue: "from_utc_not_before_to_utc" };
  }
  return { ok: true, fromUtc, toUtc };
}

// -------------------------------------------------------------------------------------------
// Approval payload / hashes — fingerprint() is @aix/foundation's own existing sorted-key
// canonical-JSON SHA-256 primitive; no custom serializer, no Foundation change.
// -------------------------------------------------------------------------------------------
export const EVIDENCE_EXPORT_SCHEMA_VERSION = "wlt1.evidence_export.v1";

export interface EvidenceExportScopeInput {
  destinationId: string | null;
  evidenceTypes: EvidenceType[];
  fromUtc: string | null;
  toUtc: string | null;
}

export interface ApprovalPayload {
  schema_version: string;
  export_id: string;
  client_id: string;
  requested_by: string;
  evidence_types: EvidenceType[];
  destination_id: string | null;
  from_utc: string | null;
  to_utc: string | null;
  reason: string | null;
}

/** Absent optionals are explicit `null` — NEVER `undefined` (JSON.stringify drops `undefined`
 * keys, which would break the byte-exact round-trip invariant). */
export function buildApprovalPayload(input: { exportId: string; clientId: string; requestedBy: string; scope: EvidenceExportScopeInput; reason: string | null }): ApprovalPayload {
  return {
    schema_version: EVIDENCE_EXPORT_SCHEMA_VERSION,
    export_id: input.exportId,
    client_id: input.clientId,
    requested_by: input.requestedBy,
    evidence_types: input.scope.evidenceTypes,
    destination_id: input.scope.destinationId,
    from_utc: input.scope.fromUtc,
    to_utc: input.scope.toUtc,
    reason: input.reason,
  };
}

export function computeApprovalPayloadHash(payload: ApprovalPayload): string {
  return fingerprint(payload);
}

/** EXCLUDES `reason`/`requested_by`/`export_id` — the scope hash means exactly one thing: which
 * data was selected (addendum Issue 17/23). */
export function computeScopeHash(input: { clientId: string; scope: EvidenceExportScopeInput }): string {
  return fingerprint({
    client_id: input.clientId,
    destination_id: input.scope.destinationId,
    evidence_types: input.scope.evidenceTypes,
    from_utc: input.scope.fromUtc,
    to_utc: input.scope.toUtc,
  });
}

// -------------------------------------------------------------------------------------------
// Duplicate approval_ref detection (WLT-side IAM-02 double-consume backstop, addendum §22).
// -------------------------------------------------------------------------------------------
export function isDuplicateApprovalRefViolation(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === "23505" && pgErr?.constraint === "uq_wlt1_evidence_export_approval_ref";
}

// -------------------------------------------------------------------------------------------
// disclosed_data_class vocabulary (addendum Issue 28/36/37) — fixed order, computed from
// evidence ACTUALLY PRESENT, deduplicated (trivially, since each rule fires at most once).
// -------------------------------------------------------------------------------------------
const DISCLOSED_DATA_CLASS_ORDER = ["wallet_canonical_address", "beneficiary_name", "matched_name", "screening_risk_evidence", "proof_of_control_evidence"] as const;

export function computeDisclosedDataClasses(evidence: Record<string, unknown[]>): string[] {
  const classes: string[] = [];
  const has = (t: EvidenceType) => (evidence[t]?.length ?? 0) > 0;
  if (has("wallet_destination") || has("proof_of_control")) classes.push("wallet_canonical_address");
  if (has("fiat_payout_destination")) classes.push("beneficiary_name");
  if ((evidence.fiat_screening_result as Array<{ matched_name_normalized: string | null }> | undefined)?.some((r) => r.matched_name_normalized !== null)) {
    classes.push("matched_name");
  }
  if (has("wallet_screening_result") || has("fiat_screening_result")) classes.push("screening_risk_evidence");
  if (has("proof_of_control")) classes.push("proof_of_control_evidence");
  // Preserve the fixed vocabulary order regardless of the push order above.
  return DISCLOSED_DATA_CLASS_ORDER.filter((c) => classes.includes(c));
}

// -------------------------------------------------------------------------------------------
// Evidence collection — bounded, explicit-column, explicit-mapper, REPEATABLE READ (set by the
// CALLER as the first statement of its own transaction, never by this file).
// -------------------------------------------------------------------------------------------
function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export interface CollectionScope {
  clientId: string;
  destinationId: string | null;
  evidenceTypes: EvidenceType[];
  fromUtc: string | null;
  toUtc: string | null;
}

export interface CollectionResult {
  evidence: Record<string, unknown[]>;
  recordCounts: Record<string, number>;
  recordCount: number;
}

async function resolveDestinationIds(client: PoolClient, clientId: string, destinationId: string | null): Promise<string[]> {
  if (destinationId !== null) {
    const rows = await query<{ destination_id: string }>(client, `SELECT destination_id FROM wlt1.destination WHERE destination_id = $1 AND client_id = $2`, [destinationId, clientId]);
    return rows.map((r) => r.destination_id);
  }
  const rows = await query<{ destination_id: string }>(client, `SELECT destination_id FROM wlt1.destination WHERE client_id = $1`, [clientId]);
  return rows.map((r) => r.destination_id);
}

/** Runs one bounded query: `LIMIT remaining + 1` proves in ONE round trip whether the result
 * would exceed the remaining budget — never collects unbounded rows first and counts afterward
 * (addendum Issue 22/29). Throws `WLT1_EVIDENCE_EXPORT_SCOPE_INVALID` if exceeded. */
async function boundedRows<T extends QueryResultRow>(client: PoolClient, sql: string, params: unknown[], remaining: number): Promise<T[]> {
  const rows = await query<T>(client, `${sql} LIMIT $${params.length + 1}`, [...params, remaining + 1]);
  if (rows.length > remaining) {
    throw new Wlt1Error("WLT1_EVIDENCE_EXPORT_SCOPE_INVALID", { details: [{ issue: "max_records_exceeded" }] });
  }
  return rows;
}

interface DestinationCurrentStateRow {
  destination_id: string;
  destination_type: string;
  status: string;
  destination_status_version: number;
  whitelist_version: number;
  revocation_epoch: number;
  limits_version: number;
  cooling_off_until_utc: Date | null;
  whitelist_approval_ref: string | null;
  created_at_utc: Date;
  updated_at_utc: Date;
}

async function collectDestinationCurrentState(client: PoolClient, destinationIds: string[], remaining: number): Promise<unknown[]> {
  const rows = await boundedRows<DestinationCurrentStateRow>(
    client,
    `SELECT destination_id, destination_type, status, destination_status_version, whitelist_version, revocation_epoch, limits_version, cooling_off_until_utc, whitelist_approval_ref, created_at_utc, updated_at_utc
       FROM wlt1.destination
      WHERE destination_id = ANY($1)
      ORDER BY destination_id COLLATE "C"`,
    [destinationIds],
    remaining,
  );
  return rows.map((r) => ({
    destination_id: r.destination_id,
    destination_type: r.destination_type,
    status: r.status,
    destination_status_version: r.destination_status_version,
    whitelist_version: r.whitelist_version,
    revocation_epoch: r.revocation_epoch,
    limits_version: r.limits_version,
    cooling_off_until_utc: iso(r.cooling_off_until_utc),
    whitelist_approval_ref: r.whitelist_approval_ref,
    created_at_utc: iso(r.created_at_utc),
    updated_at_utc: iso(r.updated_at_utc),
  }));
}

interface WalletDestinationRow {
  destination_id: string;
  chain: string;
  network: string;
  canonical_address: string;
  canonicalisation_version: string;
  wallet_type: string;
  beneficiary_relationship: string;
  created_at_utc: Date;
  memo_tag_present: boolean;
}

async function collectWalletDestination(client: PoolClient, destinationIds: string[], remaining: number): Promise<unknown[]> {
  const rows = await boundedRows<WalletDestinationRow>(
    client,
    `SELECT destination_id, chain, network, canonical_address, canonicalisation_version, wallet_type, beneficiary_relationship, created_at_utc, (length(memo_tag_identity) > 0) AS memo_tag_present
       FROM wlt1.wallet_destination
      WHERE destination_id = ANY($1)
      ORDER BY destination_id COLLATE "C"`,
    [destinationIds],
    remaining,
  );
  return rows.map((r) => ({
    destination_id: r.destination_id,
    chain: r.chain,
    network: r.network,
    canonical_address: r.canonical_address,
    memo_tag_present: r.memo_tag_present,
    canonicalisation_version: r.canonicalisation_version,
    wallet_type: r.wallet_type,
    beneficiary_relationship: r.beneficiary_relationship,
    created_at_utc: iso(r.created_at_utc),
  }));
}

interface FiatPayoutDestinationRow {
  destination_id: string;
  beneficiary_name: string;
  beneficiary_type: string;
  bank_country: string;
  bank_identifier: string;
  bank_identifier_type: string;
  branch_identifier: string | null;
  account_identifier_type: string;
  account_identifier_masked: string;
  currency: string;
  rail: string;
  verification_status: string;
  created_at_utc: Date;
  updated_at_utc: Date;
}

async function collectFiatPayoutDestination(client: PoolClient, destinationIds: string[], remaining: number): Promise<unknown[]> {
  const rows = await boundedRows<FiatPayoutDestinationRow>(
    client,
    `SELECT destination_id, beneficiary_name, beneficiary_type, bank_country, bank_identifier, bank_identifier_type, branch_identifier, account_identifier_type, account_identifier_masked, currency, rail, verification_status, created_at_utc, updated_at_utc
       FROM wlt1.fiat_payout_destination
      WHERE destination_id = ANY($1)
      ORDER BY destination_id COLLATE "C"`,
    [destinationIds],
    remaining,
  );
  return rows.map((r) => ({
    destination_id: r.destination_id,
    beneficiary_name: r.beneficiary_name,
    beneficiary_type: r.beneficiary_type,
    bank_country: r.bank_country,
    bank_identifier: r.bank_identifier,
    bank_identifier_type: r.bank_identifier_type,
    branch_identifier: r.branch_identifier,
    account_identifier_type: r.account_identifier_type,
    account_identifier_masked: r.account_identifier_masked,
    currency: r.currency,
    rail: r.rail,
    verification_status: r.verification_status,
    created_at_utc: iso(r.created_at_utc),
    updated_at_utc: iso(r.updated_at_utc),
  }));
}

interface AddressIntegrityCheckRow {
  address_check_id: string;
  destination_id: string;
  chain: string;
  network: string;
  canonicalisation_version: string;
  checksum_valid: boolean;
  poisoning_screen_status: string | null;
  result_status: string;
  reason_code: string | null;
  created_at_utc: Date;
}

async function collectAddressIntegrityCheck(client: PoolClient, destinationIds: string[], fromUtc: string | null, toUtc: string | null, remaining: number): Promise<unknown[]> {
  const params: unknown[] = [destinationIds];
  let whereDate = "";
  if (fromUtc !== null) {
    params.push(fromUtc);
    whereDate += ` AND created_at_utc >= $${params.length}`;
  }
  if (toUtc !== null) {
    params.push(toUtc);
    whereDate += ` AND created_at_utc < $${params.length}`;
  }
  const rows = await boundedRows<AddressIntegrityCheckRow>(
    client,
    `SELECT address_check_id, destination_id, chain, network, canonicalisation_version, checksum_valid, poisoning_screen_status, result_status, reason_code, created_at_utc
       FROM wlt1.address_integrity_check
      WHERE destination_id = ANY($1)${whereDate}
      ORDER BY destination_id COLLATE "C", created_at_utc, address_check_id COLLATE "C"`,
    params,
    remaining,
  );
  return rows.map((r) => ({
    address_check_id: r.address_check_id,
    destination_id: r.destination_id,
    chain: r.chain,
    network: r.network,
    canonicalisation_version: r.canonicalisation_version,
    checksum_valid: r.checksum_valid,
    poisoning_screen_status: r.poisoning_screen_status,
    result_status: r.result_status,
    reason_code: r.reason_code,
    created_at_utc: iso(r.created_at_utc),
  }));
}

interface WalletScreeningResultRow {
  destination_id: string;
  screening_result_id: string;
  screening_result_version: number;
  provider_id: string;
  provider_adaptor_version: string;
  provider_result_id: string | null;
  chain: string;
  network: string;
  risk_status: string;
  risk_score: string | null;
  risk_categories: unknown;
  direct_exposure: unknown;
  indirect_exposure: unknown;
  sanctions_exposure: boolean | null;
  cluster_ref: string | null;
  source_authenticated: boolean | null;
  issued_at_utc: Date;
  valid_until_utc: Date | null;
}

async function collectWalletScreeningResult(client: PoolClient, destinationIds: string[], fromUtc: string | null, toUtc: string | null, remaining: number): Promise<unknown[]> {
  const params: unknown[] = [destinationIds];
  let whereDate = "";
  if (fromUtc !== null) {
    params.push(fromUtc);
    whereDate += ` AND issued_at_utc >= $${params.length}`;
  }
  if (toUtc !== null) {
    params.push(toUtc);
    whereDate += ` AND issued_at_utc < $${params.length}`;
  }
  const rows = await boundedRows<WalletScreeningResultRow>(
    client,
    `SELECT destination_id, screening_result_id, screening_result_version, provider_id, provider_adaptor_version, provider_result_id, chain, network, risk_status, risk_score, risk_categories, direct_exposure, indirect_exposure, sanctions_exposure, cluster_ref, source_authenticated, issued_at_utc, valid_until_utc
       FROM wlt1.wallet_screening_result
      WHERE destination_id = ANY($1)${whereDate}
      ORDER BY destination_id COLLATE "C", screening_result_version, screening_result_id COLLATE "C"`,
    params,
    remaining,
  );
  return rows.map((r) => ({
    destination_id: r.destination_id,
    screening_result_id: r.screening_result_id,
    screening_result_version: r.screening_result_version,
    provider_id: r.provider_id,
    provider_adaptor_version: r.provider_adaptor_version,
    provider_result_id: r.provider_result_id,
    chain: r.chain,
    network: r.network,
    risk_status: r.risk_status,
    risk_score: r.risk_score === null ? null : Number(r.risk_score),
    risk_categories: r.risk_categories ?? [],
    direct_exposure: r.direct_exposure ?? [],
    indirect_exposure: r.indirect_exposure ?? [],
    sanctions_exposure: r.sanctions_exposure,
    cluster_ref: r.cluster_ref,
    source_authenticated: r.source_authenticated,
    issued_at_utc: iso(r.issued_at_utc),
    valid_until_utc: iso(r.valid_until_utc),
  }));
}

interface FiatScreeningResultRow {
  destination_id: string;
  screening_result_id: string;
  screening_result_version: number;
  provider_id: string;
  provider_adaptor_version: string;
  provider_result_id: string | null;
  bank_country: string;
  beneficiary_type: string;
  risk_status: string;
  risk_score: string | null;
  risk_categories: unknown;
  sanctions_exposure: boolean | null;
  matched_name_normalized: string | null;
  issued_at_utc: Date;
  valid_until_utc: Date;
  screened_at_utc: Date;
}

async function collectFiatScreeningResult(client: PoolClient, destinationIds: string[], fromUtc: string | null, toUtc: string | null, remaining: number): Promise<unknown[]> {
  const params: unknown[] = [destinationIds];
  let whereDate = "";
  if (fromUtc !== null) {
    params.push(fromUtc);
    whereDate += ` AND issued_at_utc >= $${params.length}`;
  }
  if (toUtc !== null) {
    params.push(toUtc);
    whereDate += ` AND issued_at_utc < $${params.length}`;
  }
  const rows = await boundedRows<FiatScreeningResultRow>(
    client,
    `SELECT destination_id, screening_result_id, screening_result_version, provider_id, provider_adaptor_version, provider_result_id, bank_country, beneficiary_type, risk_status, risk_score, risk_categories, sanctions_exposure, matched_name_normalized, issued_at_utc, valid_until_utc, screened_at_utc
       FROM wlt1.fiat_screening_result
      WHERE destination_id = ANY($1)${whereDate}
      ORDER BY destination_id COLLATE "C", screening_result_version, screening_result_id COLLATE "C"`,
    params,
    remaining,
  );
  return rows.map((r) => ({
    destination_id: r.destination_id,
    screening_result_id: r.screening_result_id,
    screening_result_version: r.screening_result_version,
    provider_id: r.provider_id,
    provider_adaptor_version: r.provider_adaptor_version,
    provider_result_id: r.provider_result_id,
    bank_country: r.bank_country,
    beneficiary_type: r.beneficiary_type,
    risk_status: r.risk_status,
    risk_score: r.risk_score === null ? null : Number(r.risk_score),
    risk_categories: r.risk_categories ?? [],
    sanctions_exposure: r.sanctions_exposure,
    matched_name_normalized: r.matched_name_normalized,
    issued_at_utc: iso(r.issued_at_utc),
    valid_until_utc: iso(r.valid_until_utc),
    screened_at_utc: iso(r.screened_at_utc),
  }));
}

interface BeneficiaryVerificationRow {
  destination_id: string;
  verification_id: string;
  verification_version: number;
  provider_id: string;
  provider_adaptor_version: string;
  result: string;
  match_score: string | null;
  issued_at_utc: Date;
  valid_until_utc: Date;
  verified_at_utc: Date | null;
}

async function collectBeneficiaryVerification(client: PoolClient, destinationIds: string[], fromUtc: string | null, toUtc: string | null, remaining: number): Promise<unknown[]> {
  const params: unknown[] = [destinationIds];
  let whereDate = "";
  if (fromUtc !== null) {
    params.push(fromUtc);
    whereDate += ` AND issued_at_utc >= $${params.length}`;
  }
  if (toUtc !== null) {
    params.push(toUtc);
    whereDate += ` AND issued_at_utc < $${params.length}`;
  }
  const rows = await boundedRows<BeneficiaryVerificationRow>(
    client,
    `SELECT destination_id, verification_id, verification_version, provider_id, provider_adaptor_version, result, match_score, issued_at_utc, valid_until_utc, verified_at_utc
       FROM wlt1.beneficiary_verification
      WHERE destination_id = ANY($1)${whereDate}
      ORDER BY destination_id COLLATE "C", verification_version, verification_id COLLATE "C"`,
    params,
    remaining,
  );
  return rows.map((r) => ({
    destination_id: r.destination_id,
    verification_id: r.verification_id,
    verification_version: r.verification_version,
    provider_id: r.provider_id,
    provider_adaptor_version: r.provider_adaptor_version,
    result: r.result,
    match_score: r.match_score === null ? null : Number(r.match_score),
    issued_at_utc: iso(r.issued_at_utc),
    valid_until_utc: iso(r.valid_until_utc),
    verified_at_utc: iso(r.verified_at_utc),
  }));
}

interface ProofOfControlRow {
  challenge_id: string;
  destination_id: string;
  chain: string;
  network: string;
  canonical_address: string;
  proof_method: string;
  verification_scheme: string;
  message_format_version: number;
  domain_environment: string;
  message_hash: string;
  verification_status: string;
  attempt_count: number;
  signature_hash: string | null;
  recovered_address: string | null;
  last_failure_reason_code: string | null;
  issued_at_utc: Date;
  expires_at_utc: Date;
  verified_at_utc: Date | null;
}

async function collectProofOfControl(client: PoolClient, destinationIds: string[], fromUtc: string | null, toUtc: string | null, remaining: number): Promise<unknown[]> {
  const params: unknown[] = [destinationIds];
  let whereDate = "";
  if (fromUtc !== null) {
    params.push(fromUtc);
    whereDate += ` AND issued_at_utc >= $${params.length}`;
  }
  if (toUtc !== null) {
    params.push(toUtc);
    whereDate += ` AND issued_at_utc < $${params.length}`;
  }
  const rows = await boundedRows<ProofOfControlRow>(
    client,
    `SELECT challenge_id, destination_id, chain, network, canonical_address, proof_method, verification_scheme, message_format_version, domain_environment, message_hash, verification_status, attempt_count, signature_hash, recovered_address, last_failure_reason_code, issued_at_utc, expires_at_utc, verified_at_utc
       FROM wlt1.proof_of_control
      WHERE destination_id = ANY($1)${whereDate}
      ORDER BY destination_id COLLATE "C", issued_at_utc, challenge_id COLLATE "C"`,
    params,
    remaining,
  );
  return rows.map((r) => ({
    challenge_id: r.challenge_id,
    destination_id: r.destination_id,
    chain: r.chain,
    network: r.network,
    canonical_address: r.canonical_address,
    proof_method: r.proof_method,
    verification_scheme: r.verification_scheme,
    message_format_version: r.message_format_version,
    domain_environment: r.domain_environment,
    message_hash: r.message_hash,
    verification_status: r.verification_status,
    attempt_count: r.attempt_count,
    signature_hash: r.signature_hash,
    recovered_address: r.recovered_address,
    last_failure_reason_code: r.last_failure_reason_code,
    issued_at_utc: iso(r.issued_at_utc),
    expires_at_utc: iso(r.expires_at_utc),
    verified_at_utc: iso(r.verified_at_utc),
  }));
}

interface DestinationDecisionRow {
  decision_id: string;
  destination_id: string;
  destination_type: string;
  requested_action: string;
  decision: string;
  status: string;
  aml_decision_id: string | null;
  aml_valid_until_utc: Date | null;
  screening_result_id: string | null;
  beneficiary_verification_id: string | null;
  poc_challenge_id: string | null;
  destination_status_version: number;
  whitelist_version: number;
  revocation_epoch: number;
  chain: string | null;
  network: string | null;
  rail: string | null;
  currency: string | null;
  issued_at_utc: Date;
  expires_at_utc: Date;
  consumed_at_utc: Date | null;
  consumption_id: string | null;
  execution_ref: string | null;
}

async function collectDestinationDecision(client: PoolClient, destinationIds: string[], fromUtc: string | null, toUtc: string | null, remaining: number): Promise<unknown[]> {
  const params: unknown[] = [destinationIds];
  let whereDate = "";
  if (fromUtc !== null) {
    params.push(fromUtc);
    whereDate += ` AND issued_at_utc >= $${params.length}`;
  }
  if (toUtc !== null) {
    params.push(toUtc);
    whereDate += ` AND issued_at_utc < $${params.length}`;
  }
  const rows = await boundedRows<DestinationDecisionRow>(
    client,
    `SELECT decision_id, destination_id, destination_type, requested_action, decision, status, aml_decision_id, aml_valid_until_utc, screening_result_id, beneficiary_verification_id, poc_challenge_id, destination_status_version, whitelist_version, revocation_epoch, chain, network, rail, currency, issued_at_utc, expires_at_utc, consumed_at_utc, consumption_id, execution_ref
       FROM wlt1.destination_decision
      WHERE destination_id = ANY($1)${whereDate}
      ORDER BY destination_id COLLATE "C", issued_at_utc, decision_id COLLATE "C"`,
    params,
    remaining,
  );
  return rows.map((r) => ({
    decision_id: r.decision_id,
    destination_id: r.destination_id,
    destination_type: r.destination_type,
    requested_action: r.requested_action,
    decision: r.decision,
    status: r.status,
    aml_decision_id: r.aml_decision_id,
    aml_valid_until_utc: iso(r.aml_valid_until_utc),
    screening_result_id: r.screening_result_id,
    beneficiary_verification_id: r.beneficiary_verification_id,
    poc_challenge_id: r.poc_challenge_id,
    destination_status_version: r.destination_status_version,
    whitelist_version: r.whitelist_version,
    revocation_epoch: r.revocation_epoch,
    chain: r.chain,
    network: r.network,
    rail: r.rail,
    currency: r.currency,
    issued_at_utc: iso(r.issued_at_utc),
    expires_at_utc: iso(r.expires_at_utc),
    consumed_at_utc: iso(r.consumed_at_utc),
    consumption_id: r.consumption_id,
    execution_ref: r.execution_ref,
  }));
}

interface DestinationRevocationRow {
  revocation_id: string;
  destination_id: string;
  source: string;
  reason_code: string;
  reason_detail: string | null;
  actor_id: string | null;
  signal_ref: string | null;
  signal_type: string | null;
  destination_status_version_after: number;
  revocation_epoch_after: number;
  revoked_at_utc: Date;
}

async function collectDestinationRevocation(client: PoolClient, destinationIds: string[], fromUtc: string | null, toUtc: string | null, remaining: number): Promise<unknown[]> {
  const params: unknown[] = [destinationIds];
  let whereDate = "";
  if (fromUtc !== null) {
    params.push(fromUtc);
    whereDate += ` AND revoked_at_utc >= $${params.length}`;
  }
  if (toUtc !== null) {
    params.push(toUtc);
    whereDate += ` AND revoked_at_utc < $${params.length}`;
  }
  const rows = await boundedRows<DestinationRevocationRow>(
    client,
    `SELECT revocation_id, destination_id, source, reason_code, reason_detail, actor_id, signal_ref, signal_type, destination_status_version_after, revocation_epoch_after, revoked_at_utc
       FROM wlt1.destination_revocation
      WHERE destination_id = ANY($1)${whereDate}
      ORDER BY destination_id COLLATE "C", revoked_at_utc, revocation_id COLLATE "C"`,
    params,
    remaining,
  );
  return rows.map((r) => ({
    revocation_id: r.revocation_id,
    destination_id: r.destination_id,
    source: r.source,
    reason_code: r.reason_code,
    reason_detail: r.reason_detail,
    actor_id: r.actor_id,
    signal_ref: r.signal_ref,
    signal_type: r.signal_type,
    destination_status_version_after: r.destination_status_version_after,
    revocation_epoch_after: r.revocation_epoch_after,
    revoked_at_utc: iso(r.revoked_at_utc),
  }));
}

/** ONE consistent snapshot: the caller MUST have already executed `SET TRANSACTION ISOLATION
 * LEVEL REPEATABLE READ` as the FIRST statement of `client`'s own transaction before calling this
 * function (addendum Issue 57/58/64) — never set here, so this function stays a pure collector
 * with no transaction-lifecycle responsibility of its own. */
export async function collectAllEvidence(client: PoolClient, scope: CollectionScope, maxRecords: number): Promise<CollectionResult> {
  const destinationIds = await resolveDestinationIds(client, scope.clientId, scope.destinationId);
  const evidence: Record<string, unknown[]> = {};
  const recordCounts: Record<string, number> = {};
  let remaining = maxRecords;
  let total = 0;

  for (const type of scope.evidenceTypes) {
    let rows: unknown[];
    switch (type) {
      case "destination_current_state":
        rows = await collectDestinationCurrentState(client, destinationIds, remaining);
        break;
      case "wallet_destination":
        rows = await collectWalletDestination(client, destinationIds, remaining);
        break;
      case "fiat_payout_destination":
        rows = await collectFiatPayoutDestination(client, destinationIds, remaining);
        break;
      case "address_integrity_check":
        rows = await collectAddressIntegrityCheck(client, destinationIds, scope.fromUtc, scope.toUtc, remaining);
        break;
      case "wallet_screening_result":
        rows = await collectWalletScreeningResult(client, destinationIds, scope.fromUtc, scope.toUtc, remaining);
        break;
      case "fiat_screening_result":
        rows = await collectFiatScreeningResult(client, destinationIds, scope.fromUtc, scope.toUtc, remaining);
        break;
      case "beneficiary_verification":
        rows = await collectBeneficiaryVerification(client, destinationIds, scope.fromUtc, scope.toUtc, remaining);
        break;
      case "proof_of_control":
        rows = await collectProofOfControl(client, destinationIds, scope.fromUtc, scope.toUtc, remaining);
        break;
      case "destination_decision":
        rows = await collectDestinationDecision(client, destinationIds, scope.fromUtc, scope.toUtc, remaining);
        break;
      case "destination_revocation":
        rows = await collectDestinationRevocation(client, destinationIds, scope.fromUtc, scope.toUtc, remaining);
        break;
    }
    evidence[type] = rows;
    recordCounts[type] = rows.length;
    remaining -= rows.length;
    total += rows.length;
  }

  return { evidence, recordCounts, recordCount: total };
}

// -------------------------------------------------------------------------------------------
// Manifest / body / content hash.
// -------------------------------------------------------------------------------------------
export const EVIDENCE_EXPORT_EXCLUDED_NOTE = "SEC-01-owned audit events and sensitive-read access records are outside WLT-01 Evidence Export v1 scope.";

export interface Manifest {
  schema_version: string;
  source_module: "WLT-01";
  export_id: string;
  client_id: string;
  generated_at_utc: string;
  scope: { destination_id: string | null; evidence_types: EvidenceType[]; from_utc: string | null; to_utc: string | null };
  requested_by: string;
  approval_ref: string;
  reason: string | null;
  request_id: string | null;
  correlation_id: string;
  record_counts: Record<string, number>;
  record_count: number;
  excluded_evidence_note: string;
}

export function buildManifest(input: {
  exportId: string;
  clientId: string;
  generatedAtUtc: string;
  scope: EvidenceExportScopeInput;
  requestedBy: string;
  approvalRef: string;
  reason: string | null;
  requestId: string | null;
  correlationId: string;
  recordCounts: Record<string, number>;
  recordCount: number;
}): Manifest {
  return {
    schema_version: EVIDENCE_EXPORT_SCHEMA_VERSION,
    source_module: "WLT-01",
    export_id: input.exportId,
    client_id: input.clientId,
    generated_at_utc: input.generatedAtUtc,
    scope: { destination_id: input.scope.destinationId, evidence_types: input.scope.evidenceTypes, from_utc: input.scope.fromUtc, to_utc: input.scope.toUtc },
    requested_by: input.requestedBy,
    approval_ref: input.approvalRef,
    reason: input.reason,
    request_id: input.requestId,
    correlation_id: input.correlationId,
    record_counts: input.recordCounts,
    record_count: input.recordCount,
    excluded_evidence_note: EVIDENCE_EXPORT_EXCLUDED_NOTE,
  };
}

export interface ExportBody {
  manifest: Manifest;
  evidence: Record<string, unknown[]>;
}

/** `content` is `JSON.stringify(body)` — no Foundation change, no custom canonical serializer
 * (none is exported; see this file's own header + the controlling addendum's Issue 24 ruling).
 * Determinism comes from frozen literal key order, canonical evidence-type order, explicitly
 * sorted rows, and the NEVER-`undefined` rule enforced throughout every mapper above. */
export function buildExportContent(body: ExportBody): { content: string; contentHash: string } {
  const content = JSON.stringify(body);
  const contentHash = fingerprint(body);
  return { content, contentHash };
}
