/**
 * WLT-01 Fiat Payout Destinations (APAC) — fiat destination identity, natural-key hashing,
 * evidence (beneficiary verification / fiat screening) persistence, freshness/effective-validity
 * computation, and lifecycle-transition helpers. Implements the FROZEN architecture exactly
 * (WLT-01 Fiat Payout Destinations Implementation-Exact Architecture Addendum + Provider/Decision
 * Artifact/Coverage/File-Plan Micro-Addendum + APAC-First Local-Account Architecture Pivot, all
 * CLOSED) — no new architectural decisions are made in this file.
 *
 * `routes/payout-destinations.ts` is the sole caller for the network-call orchestration
 * (registration TX-2's provider phase, the standalone assess route) — this file owns no
 * HTTP/network concerns and performs NO provider calls itself; every exported function here is
 * either pure or DB-only, called strictly OUTSIDE any provider network call (Provider Network/
 * Lock Rule: no provider call while a transaction is open or a lock is held).
 *
 * VERSIONING (mirrors `wlt1.wallet_screening_result`'s own established pattern exactly): both
 * evidence tables are append-only and version-numbered per destination. `acquireDestinationLock`
 * (same advisory-lock namespace `wlt1.destination:<destinationId>` this service already uses for
 * screening-application/evaluate-use/decision-consume/revocation — see those files' own header
 * comments) MUST be taken before either `persist*Result` function computes its next version
 * number, by the caller, inside the same transaction.
 *
 * NO PENDING ROW EVER (load-bearing, mirrors `wlt1.wallet_screening_result`'s Phase 2B posture):
 * both `persist*Result` functions are called ONLY with an already-TERMINAL provider outcome — a
 * technical `unavailable`/`invalid_response` provider outcome never reaches either function; the
 * caller (route) simply does not insert a row for that domain this attempt.
 */
import { publishAudit, query, type Sql } from "@aix/foundation";
import { randomUUID } from "node:crypto";
import { fingerprint } from "@aix/foundation";
import type { VerificationResult } from "./beneficiary-verification/types.js";
import type { FiatRiskStatus } from "./fiat-screening/types.js";

export const FIAT_DESTINATION_TYPE = "fiat_payout";

export async function acquireDestinationLock(client: Sql, destinationId: string): Promise<void> {
  await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${destinationId}`]);
}

export function computeNaturalKeyHash(clientId: string, destinationType: string, accountIdentifierHash: string): string {
  return fingerprint({ client_id: clientId, destination_type: destinationType, address_hash: accountIdentifierHash });
}

const VERIFICATION_ID_PREFIX = "wlt1bv_";
const SCREENING_RESULT_ID_PREFIX = "wlt1fscr_";

export function mintBeneficiaryVerificationId(): string {
  return VERIFICATION_ID_PREFIX + randomUUID();
}

export function mintFiatScreeningResultId(): string {
  return SCREENING_RESULT_ID_PREFIX + randomUUID();
}

// -------------------------------------------------------------------------------------------
// Destination + fiat detail read helpers.
// -------------------------------------------------------------------------------------------

export interface FiatPayoutDestinationRow {
  destination_id: string;
  client_id: string;
  destination_type: string;
  status: string;
  destination_status_version: number;
  whitelist_version: number;
  revocation_epoch: number;
  beneficiary_name: string;
  beneficiary_name_normalized: string;
  beneficiary_type: string;
  bank_country: string;
  bank_identifier: string;
  bank_identifier_type: string;
  branch_identifier: string | null;
  account_identifier_type: string;
  account_identifier_masked: string;
  account_identifier_hash: string;
  currency: string;
  rail: string;
  verification_status: string;
  created_at_utc: string;
}

const FIAT_DESTINATION_SELECT = `
  SELECT d.destination_id, d.client_id, d.destination_type, d.status, d.destination_status_version, d.whitelist_version, d.revocation_epoch,
         f.beneficiary_name, f.beneficiary_name_normalized, f.beneficiary_type, f.bank_country, f.bank_identifier, f.bank_identifier_type,
         f.branch_identifier, f.account_identifier_type, f.account_identifier_masked, f.account_identifier_hash, f.currency, f.rail,
         f.verification_status, d.created_at_utc
    FROM wlt1.destination d
    JOIN wlt1.fiat_payout_destination f ON f.destination_id = d.destination_id
`;

export async function fetchFiatPayoutDestinationById(sql: Sql, destinationId: string): Promise<FiatPayoutDestinationRow | undefined> {
  const rows = await query<FiatPayoutDestinationRow>(sql, `${FIAT_DESTINATION_SELECT} WHERE d.destination_id = $1`, [destinationId]);
  return rows[0];
}

export async function fetchFiatPayoutDestinationByNaturalKey(sql: Sql, naturalKeyHash: string): Promise<FiatPayoutDestinationRow | undefined> {
  const rows = await query<FiatPayoutDestinationRow>(sql, `${FIAT_DESTINATION_SELECT} WHERE d.natural_key_hash = $1 AND d.status <> 'revoked'`, [naturalKeyHash]);
  return rows[0];
}

// -------------------------------------------------------------------------------------------
// Beneficiary verification evidence.
// -------------------------------------------------------------------------------------------

export interface BeneficiaryVerificationEvidenceRow {
  verificationId: string;
  verificationVersion: number;
  result: VerificationResult;
  matchScore: number | null;
  beneficiaryNameHash: string;
  accountIdentifierHash: string;
  providerId: string;
  issuedAtUtc: Date;
  validUntilUtc: Date;
}

interface BeneficiaryVerificationSqlRow {
  verification_id: string;
  verification_version: number;
  result: string;
  match_score: string | null;
  beneficiary_name_hash: string;
  account_identifier_hash: string;
  provider_id: string;
  issued_at_utc: Date;
  valid_until_utc: Date;
}

function toVerificationRow(row: BeneficiaryVerificationSqlRow): BeneficiaryVerificationEvidenceRow {
  return {
    verificationId: row.verification_id,
    verificationVersion: row.verification_version,
    result: row.result as VerificationResult,
    matchScore: row.match_score === null ? null : Number(row.match_score),
    beneficiaryNameHash: row.beneficiary_name_hash,
    accountIdentifierHash: row.account_identifier_hash,
    providerId: row.provider_id,
    issuedAtUtc: row.issued_at_utc,
    validUntilUtc: row.valid_until_utc,
  };
}

/** Latest verification by `verification_version DESC` — frozen selection order, mirrors
 * `loadLatestScreening`'s own precedent. */
export async function loadLatestBeneficiaryVerification(sql: Sql, destinationId: string): Promise<BeneficiaryVerificationEvidenceRow | null> {
  const rows = await query<BeneficiaryVerificationSqlRow>(
    sql,
    `SELECT verification_id, verification_version, result, match_score, beneficiary_name_hash, account_identifier_hash, provider_id, issued_at_utc, valid_until_utc
       FROM wlt1.beneficiary_verification
      WHERE destination_id = $1
      ORDER BY verification_version DESC
      LIMIT 1`,
    [destinationId],
  );
  const row = rows[0];
  return row ? toVerificationRow(row) : null;
}

/** Inserts a NEW versioned verification evidence row. Caller MUST hold `acquireDestinationLock`
 * for this `destinationId` on the SAME transaction before calling — this function does not lock
 * itself, so two concurrent callers without the lock could race on `verification_version`. */
export async function persistBeneficiaryVerificationResult(
  client: Sql,
  input: {
    destinationId: string;
    providerId: string;
    providerAdaptorVersion: string;
    result: VerificationResult;
    matchScore: number | null;
    beneficiaryNameHash: string;
    accountIdentifierHash: string;
    issuedAtUtc: Date;
    validUntilUtc: Date;
    nowUtc: Date;
  },
): Promise<BeneficiaryVerificationEvidenceRow> {
  const versionRows = await query<{ next_version: number }>(
    client,
    `SELECT COALESCE(MAX(verification_version), 0) + 1 AS next_version FROM wlt1.beneficiary_verification WHERE destination_id = $1`,
    [input.destinationId],
  );
  const nextVersion = versionRows[0]!.next_version;
  const verificationId = mintBeneficiaryVerificationId();

  await query(
    client,
    `INSERT INTO wlt1.beneficiary_verification
       (verification_id, destination_id, verification_version, provider_id, provider_adaptor_version, result, match_score,
        beneficiary_name_hash, account_identifier_hash, issued_at_utc, valid_until_utc, verified_at_utc)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      verificationId,
      input.destinationId,
      nextVersion,
      input.providerId,
      input.providerAdaptorVersion,
      input.result,
      input.matchScore,
      input.beneficiaryNameHash,
      input.accountIdentifierHash,
      input.issuedAtUtc.toISOString(),
      input.validUntilUtc.toISOString(),
      input.nowUtc.toISOString(),
    ],
  );

  return {
    verificationId,
    verificationVersion: nextVersion,
    result: input.result,
    matchScore: input.matchScore,
    beneficiaryNameHash: input.beneficiaryNameHash,
    accountIdentifierHash: input.accountIdentifierHash,
    providerId: input.providerId,
    issuedAtUtc: input.issuedAtUtc,
    validUntilUtc: input.validUntilUtc,
  };
}

// -------------------------------------------------------------------------------------------
// Fiat destination screening evidence.
// -------------------------------------------------------------------------------------------

export interface FiatScreeningEvidenceRow {
  screeningResultId: string;
  screeningResultVersion: number;
  riskStatus: FiatRiskStatus;
  riskScore: number | null;
  riskCategories: string[];
  sanctionsExposure: boolean | null;
  matchedNameNormalized: string | null;
  beneficiaryNameHash: string;
  bankCountry: string;
  beneficiaryType: string;
  providerId: string;
  issuedAtUtc: Date;
  validUntilUtc: Date;
}

interface FiatScreeningSqlRow {
  screening_result_id: string;
  screening_result_version: number;
  risk_status: string;
  risk_score: string | null;
  risk_categories: unknown;
  sanctions_exposure: boolean | null;
  matched_name_normalized: string | null;
  beneficiary_name_hash: string;
  bank_country: string;
  beneficiary_type: string;
  provider_id: string;
  issued_at_utc: Date;
  valid_until_utc: Date;
}

function toScreeningRow(row: FiatScreeningSqlRow): FiatScreeningEvidenceRow {
  return {
    screeningResultId: row.screening_result_id,
    screeningResultVersion: row.screening_result_version,
    riskStatus: row.risk_status as FiatRiskStatus,
    riskScore: row.risk_score === null ? null : Number(row.risk_score),
    riskCategories: Array.isArray(row.risk_categories) ? (row.risk_categories as string[]) : [],
    sanctionsExposure: row.sanctions_exposure,
    matchedNameNormalized: row.matched_name_normalized,
    beneficiaryNameHash: row.beneficiary_name_hash,
    bankCountry: row.bank_country,
    beneficiaryType: row.beneficiary_type,
    providerId: row.provider_id,
    issuedAtUtc: row.issued_at_utc,
    validUntilUtc: row.valid_until_utc,
  };
}

export async function loadLatestFiatScreeningResult(sql: Sql, destinationId: string): Promise<FiatScreeningEvidenceRow | null> {
  const rows = await query<FiatScreeningSqlRow>(
    sql,
    `SELECT screening_result_id, screening_result_version, risk_status, risk_score, risk_categories, sanctions_exposure, matched_name_normalized,
            beneficiary_name_hash, bank_country, beneficiary_type, provider_id, issued_at_utc, valid_until_utc
       FROM wlt1.fiat_screening_result
      WHERE destination_id = $1
      ORDER BY screening_result_version DESC
      LIMIT 1`,
    [destinationId],
  );
  const row = rows[0];
  return row ? toScreeningRow(row) : null;
}

/** Inserts a NEW versioned screening evidence row. Same locking precondition as
 * `persistBeneficiaryVerificationResult`. */
export async function persistFiatScreeningResult(
  client: Sql,
  input: {
    destinationId: string;
    providerId: string;
    providerAdaptorVersion: string;
    providerResultId: string;
    riskStatus: FiatRiskStatus;
    riskScore: number | null;
    riskCategories: string[];
    sanctionsExposure: boolean | null;
    matchedNameNormalized: string | null;
    beneficiaryNameHash: string;
    bankCountry: string;
    beneficiaryType: string;
    issuedAtUtc: Date;
    validUntilUtc: Date;
    nowUtc: Date;
  },
): Promise<FiatScreeningEvidenceRow> {
  const versionRows = await query<{ next_version: number }>(
    client,
    `SELECT COALESCE(MAX(screening_result_version), 0) + 1 AS next_version FROM wlt1.fiat_screening_result WHERE destination_id = $1`,
    [input.destinationId],
  );
  const nextVersion = versionRows[0]!.next_version;
  const screeningResultId = mintFiatScreeningResultId();

  await query(
    client,
    `INSERT INTO wlt1.fiat_screening_result
       (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, provider_result_id,
        beneficiary_name_hash, bank_country, beneficiary_type, risk_status, risk_score, risk_categories, sanctions_exposure,
        matched_name_normalized, issued_at_utc, valid_until_utc, screened_at_utc)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      screeningResultId,
      input.destinationId,
      nextVersion,
      input.providerId,
      input.providerAdaptorVersion,
      input.providerResultId,
      input.beneficiaryNameHash,
      input.bankCountry,
      input.beneficiaryType,
      input.riskStatus,
      input.riskScore,
      JSON.stringify(input.riskCategories),
      input.sanctionsExposure,
      input.matchedNameNormalized,
      input.issuedAtUtc.toISOString(),
      input.validUntilUtc.toISOString(),
      input.nowUtc.toISOString(),
    ],
  );

  return {
    screeningResultId,
    screeningResultVersion: nextVersion,
    riskStatus: input.riskStatus,
    riskScore: input.riskScore,
    riskCategories: input.riskCategories,
    sanctionsExposure: input.sanctionsExposure,
    matchedNameNormalized: input.matchedNameNormalized,
    beneficiaryNameHash: input.beneficiaryNameHash,
    bankCountry: input.bankCountry,
    beneficiaryType: input.beneficiaryType,
    providerId: input.providerId,
    issuedAtUtc: input.issuedAtUtc,
    validUntilUtc: input.validUntilUtc,
  };
}

// -------------------------------------------------------------------------------------------
// Freshness / effective-validity — pure, shared by both evidence domains.
// -------------------------------------------------------------------------------------------

/** `effectiveValidUntil = min(providerValidUntil ?? +Infinity, issuedAtUtc + ceilingHours)` —
 * mirrors `lib/screening-application.ts`'s own `computeEffectiveValidUntil` exactly (own copy,
 * within-service reuse would couple two independently-evolving evidence domains — F3(c)-adjacent
 * discipline). The DB stores this EFFECTIVE value, never the unconstrained provider expiry. */
export function computeEffectiveValidUntil(issuedAtUtc: Date, providerValidUntil: Date | null, ceilingHours: number): Date {
  const localCeiling = new Date(issuedAtUtc.getTime() + ceilingHours * 60 * 60 * 1000);
  if (providerValidUntil === null) return localCeiling;
  return providerValidUntil.getTime() < localCeiling.getTime() ? providerValidUntil : localCeiling;
}

export function isEvidenceFresh(validUntilUtc: Date, nowUtc: Date): boolean {
  return nowUtc.getTime() < validUntilUtc.getTime();
}

// -------------------------------------------------------------------------------------------
// Destination-level verification_status + lifecycle transition.
// -------------------------------------------------------------------------------------------

export async function updateFiatDestinationVerificationStatus(client: Sql, destinationId: string, verificationStatus: VerificationResult, nowUtc: Date): Promise<void> {
  await query(
    client,
    `UPDATE wlt1.fiat_payout_destination SET verification_status = $1, updated_at_utc = $2 WHERE destination_id = $3`,
    [verificationStatus, nowUtc.toISOString(), destinationId],
  );
}

/** Frozen transition rule: if AT LEAST ONE terminal evidence domain now exists (verification OR
 * screening, checked by the caller before invoking this), a `draft` destination promotes to
 * `pending_review`. A no-op (returns `false`, no write) for any other current status — this
 * function never demotes, never re-promotes an already-`pending_review`+ destination. */
export async function promoteDraftToPendingReview(client: Sql, destinationId: string, currentStatus: string, nowUtc: Date): Promise<boolean> {
  if (currentStatus !== "draft") return false;
  await query(
    client,
    `UPDATE wlt1.destination SET status = 'pending_review', destination_status_version = destination_status_version + 1, updated_at_utc = $1 WHERE destination_id = $2 AND status = 'draft'`,
    [nowUtc.toISOString(), destinationId],
  );
  return true;
}

// -------------------------------------------------------------------------------------------
// Audit metadata builders — the frozen exact key allowlists (Fiat APAC task spec).
// -------------------------------------------------------------------------------------------

export function buildFiatRegistrationAuditMetadata(input: {
  destinationId: string;
  clientId: string;
  bankCountry: string;
  currency: string;
  rail: string;
  bankIdentifier: string;
  branchIdentifier: string | null;
  accountIdentifierMasked: string;
  beneficiaryType: string;
}): Record<string, unknown> {
  return {
    destination_id: input.destinationId,
    client_id: input.clientId,
    destination_type: FIAT_DESTINATION_TYPE,
    bank_country: input.bankCountry,
    currency: input.currency,
    rail: input.rail,
    bank_identifier: input.bankIdentifier,
    branch_identifier: input.branchIdentifier,
    account_identifier_masked: input.accountIdentifierMasked,
    beneficiary_type: input.beneficiaryType,
  };
}

export function buildBeneficiaryVerificationAuditMetadata(input: {
  destinationId: string;
  verificationId: string;
  verificationVersion: number;
  result: string;
  providerId: string;
  matchScore: number | null;
  validUntilUtc: Date;
  verifiedAtUtc: Date;
}): Record<string, unknown> {
  return {
    destination_id: input.destinationId,
    verification_id: input.verificationId,
    verification_version: input.verificationVersion,
    result: input.result,
    provider_id: input.providerId,
    match_score: input.matchScore,
    valid_until_utc: input.validUntilUtc.toISOString(),
    verified_at_utc: input.verifiedAtUtc.toISOString(),
  };
}

export function buildFiatScreeningAuditMetadata(input: {
  destinationId: string;
  screeningResultId: string;
  screeningResultVersion: number;
  riskStatus: string;
  sanctionsExposure: boolean | null;
  riskCategories: string[];
  providerId: string;
  validUntilUtc: Date;
  screenedAtUtc: Date;
}): Record<string, unknown> {
  return {
    destination_id: input.destinationId,
    screening_result_id: input.screeningResultId,
    screening_result_version: input.screeningResultVersion,
    risk_status: input.riskStatus,
    sanctions_exposure: input.sanctionsExposure,
    risk_categories: input.riskCategories,
    provider_id: input.providerId,
    valid_until_utc: input.validUntilUtc.toISOString(),
    screened_at_utc: input.screenedAtUtc.toISOString(),
  };
}

// Re-exported so route files publish audits with a single import surface, mirroring
// `routes/wallet-destinations.ts`'s own direct `publishAudit` usage.
export { publishAudit };
