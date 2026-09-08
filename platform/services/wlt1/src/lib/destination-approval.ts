/**
 * WLT-01 Phase 4A-1 — destination whitelist-approval evidence resolution + eligibility-gate
 * evaluation + approval fingerprint. Implements the FROZEN architecture (WLT-01 Phase 4A freeze +
 * the Phase 4A-1 implementation-contract addendum) exactly — no new architectural decisions are
 * made in this file.
 *
 * Shared by BOTH `approve/request` and `approve/apply` (`routes/destination-approval.ts`) so the
 * two routes can never drift onto two different gate definitions — `resolveApprovalContext` is the
 * ONE place all five approval gates (destination existence, client binding, status, screening
 * clear+fresh, required PoC) are evaluated, called independently by each route against its own
 * freshly-read snapshot (never a value passed between requests).
 *
 * PURE where possible: `evaluateApprovalGates` and `computeApprovalFingerprint` take no DB
 * argument and are independently unit-testable. `loadDestinationSnapshot`/`loadLatestScreening` are
 * the only DB-touching functions.
 */
import type { PoolClient } from "pg";
import { fingerprint, query, type Sql } from "@aix/foundation";
import { getCurrentProofOfControl, isPocSupportedWalletType } from "./proof-of-control/service.js";
import { fetchActiveFiatRailCoverage } from "./fiat/rail-coverage.js";
import { loadLatestBeneficiaryVerification, loadLatestFiatScreeningResult, FIAT_DESTINATION_TYPE } from "./fiat-destination.js";

/** Frozen approval-eligible destination lifecycle state (addendum Issue 11) — `pending_review`
 * only. `approved_pending_cooling`/`active`/`draft`/`pending_screening`/`revoked` all fail closed. */
export const APPROVAL_ELIGIBLE_STATUS = "pending_review";

/** Frozen approval-eligible screening outcome (addendum Issue 11 / H-4A1-1) — ONLY `clear`.
 * `review_required`/`high_risk`/`hit`/`pending` must never be whitelist-approved. */
const APPROVAL_ELIGIBLE_RISK_STATUS = "clear";

export interface DestinationSnapshot {
  destinationId: string;
  clientId: string;
  status: string;
  destinationStatusVersion: number;
  whitelistVersion: number;
  naturalKeyHash: string;
  destinationType: string;
  /** Wallet-only — present iff `destinationType === 'wallet'`. */
  walletType?: string;
  /** Fiat-only — present iff `destinationType === 'fiat_payout'`. */
  bankCountry?: string;
  currency?: string;
  rail?: string;
}

interface DestinationRow {
  destination_id: string;
  client_id: string;
  status: string;
  destination_status_version: number;
  whitelist_version: number;
  natural_key_hash: string;
  destination_type: string;
}

interface WalletTypeRow {
  wallet_type: string;
}

interface FiatCorridorRow {
  bank_country: string;
  currency: string;
  rail: string;
}

/** Reads the destination + its type-specific detail in one additional round trip. Returns `null`
 * if the destination does not exist — the caller (route) is responsible for mapping that to the
 * SAME outward 404 a foreign-client destination produces (no enumeration oracle). Does NOT lock
 * the row — callers needing a lock (approve/apply's Phase C) issue their own `FOR UPDATE` read
 * separately. */
export async function loadDestinationSnapshot(sql: Sql, destinationId: string): Promise<DestinationSnapshot | null> {
  const rows = await query<DestinationRow>(
    sql,
    `SELECT destination_id, client_id, status, destination_status_version, whitelist_version, natural_key_hash, destination_type
       FROM wlt1.destination WHERE destination_id = $1`,
    [destinationId],
  );
  const row = rows[0];
  if (!row) return null;

  if (row.destination_type === FIAT_DESTINATION_TYPE) {
    const fiatRows = await query<FiatCorridorRow>(sql, `SELECT bank_country, currency, rail FROM wlt1.fiat_payout_destination WHERE destination_id = $1`, [destinationId]);
    const fiat = fiatRows[0];
    // Structurally unreachable under the accepted registration transaction — defended anyway.
    if (!fiat) return null;
    return {
      destinationId: row.destination_id,
      clientId: row.client_id,
      status: row.status,
      destinationStatusVersion: row.destination_status_version,
      whitelistVersion: row.whitelist_version,
      naturalKeyHash: row.natural_key_hash,
      destinationType: row.destination_type,
      bankCountry: fiat.bank_country,
      currency: fiat.currency,
      rail: fiat.rail,
    };
  }

  const walletRows = await query<WalletTypeRow>(sql, `SELECT wallet_type FROM wlt1.wallet_destination WHERE destination_id = $1`, [destinationId]);
  const walletType = walletRows[0]?.wallet_type;
  // A `wlt1.destination` row with no corresponding `wlt1.wallet_destination` row is structurally
  // unreachable under the accepted registration transaction (both rows are inserted together, see
  // routes/wallet-destinations.ts) — defended anyway, never trusted merely because today's write
  // path happens to be correct (this codebase's own established "structurally unreachable, checked
  // anyway" discipline).
  if (!walletType) return null;

  return {
    destinationId: row.destination_id,
    clientId: row.client_id,
    status: row.status,
    destinationStatusVersion: row.destination_status_version,
    whitelistVersion: row.whitelist_version,
    naturalKeyHash: row.natural_key_hash,
    destinationType: row.destination_type,
    walletType,
  };
}

export interface LatestScreeningSnapshot {
  screeningResultId: string;
  riskStatus: string;
  validUntilUtc: Date | null;
}

interface WalletScreeningResultRow {
  screening_result_id: string;
  risk_status: string;
  valid_until_utc: Date | null;
}

/** The latest screening result by `screening_result_version DESC` (frozen — never any other
 * selection order; a destination may have multiple historical screening_result rows across its
 * pending_screening/pending_review lifecycle, and only the newest is ever approval-relevant). */
export async function loadLatestScreening(sql: Sql, destinationId: string): Promise<LatestScreeningSnapshot | null> {
  const rows = await query<WalletScreeningResultRow>(
    sql,
    `SELECT screening_result_id, risk_status, valid_until_utc
       FROM wlt1.wallet_screening_result
      WHERE destination_id = $1
      ORDER BY screening_result_version DESC
      LIMIT 1`,
    [destinationId],
  );
  const row = rows[0];
  if (!row) return null;
  return { screeningResultId: row.screening_result_id, riskStatus: row.risk_status, validUntilUtc: row.valid_until_utc };
}

export type ApprovalGateFailureReason =
  | "destination_not_pending_review"
  | "screening_missing"
  | "screening_not_clear"
  | "screening_expired"
  | "proof_of_control_missing"
  // Fiat Payout Destinations (APAC) extension.
  | "rail_not_supported"
  | "verification_missing"
  | "verification_not_verified"
  | "verification_expired";

export type ApprovalGateResult =
  | { eligible: true; screeningResultId: string; providerIds?: never }
  | { eligible: false; reasonCode: ApprovalGateFailureReason };

/**
 * Pure evaluation of all five approval gates (frozen architecture Part §Issue 11/12): destination
 * status, latest screening existence, screening clear, screening freshness, required PoC. Takes no
 * I/O — `screening`/`pocVerified`/`nowUtc` are all supplied by the caller, so this function is
 * fully deterministic and independently unit-testable. Called identically by approve/request and
 * approve/apply (each against its own freshly-resolved snapshot) — this is the SAME logic, never
 * two divergent copies.
 */
export function evaluateApprovalGates(input: { status: string; walletType: string; screening: LatestScreeningSnapshot | null; pocVerified: boolean; nowUtc: Date }): ApprovalGateResult {
  if (input.status !== APPROVAL_ELIGIBLE_STATUS) {
    return { eligible: false, reasonCode: "destination_not_pending_review" };
  }
  if (!input.screening) {
    return { eligible: false, reasonCode: "screening_missing" };
  }
  if (input.screening.riskStatus !== APPROVAL_ELIGIBLE_RISK_STATUS) {
    return { eligible: false, reasonCode: "screening_not_clear" };
  }
  if (input.screening.validUntilUtc !== null && input.nowUtc.getTime() >= input.screening.validUntilUtc.getTime()) {
    return { eligible: false, reasonCode: "screening_expired" };
  }
  // C-4A1-1: PoC is mandatory at BOTH approve/request and approve/apply for unhosted/unknown
  // wallets — approving without it would strand the destination permanently (PoC can only be
  // obtained while pending_review, and approval leaves pending_review for good).
  if (isPocSupportedWalletType(input.walletType) && !input.pocVerified) {
    return { eligible: false, reasonCode: "proof_of_control_missing" };
  }
  return { eligible: true, screeningResultId: input.screening.screeningResultId };
}

/**
 * Fiat Payout Destinations (APAC) extension — mirror-image of `evaluateApprovalGates` for a fiat
 * destination: destination status, rail-coverage supported+active, latest fiat screening clear
 * +fresh, latest beneficiary verification verified+fresh. No PoC gate exists for fiat (beneficiary
 * verification is its evidentiary substitute). Pure, no I/O — independently unit-testable.
 */
export function evaluateFiatApprovalGates(input: {
  status: string;
  railCoverageOk: boolean;
  screening: { screeningResultId: string; riskStatus: string; validUntilUtc: Date | null } | null;
  verification: { verificationId: string; result: string; validUntilUtc: Date | null } | null;
  nowUtc: Date;
}): ApprovalGateResult {
  if (input.status !== APPROVAL_ELIGIBLE_STATUS) {
    return { eligible: false, reasonCode: "destination_not_pending_review" };
  }
  if (!input.railCoverageOk) {
    return { eligible: false, reasonCode: "rail_not_supported" };
  }
  if (!input.screening) {
    return { eligible: false, reasonCode: "screening_missing" };
  }
  if (input.screening.riskStatus !== APPROVAL_ELIGIBLE_RISK_STATUS) {
    return { eligible: false, reasonCode: "screening_not_clear" };
  }
  if (input.screening.validUntilUtc !== null && input.nowUtc.getTime() >= input.screening.validUntilUtc.getTime()) {
    return { eligible: false, reasonCode: "screening_expired" };
  }
  if (!input.verification) {
    return { eligible: false, reasonCode: "verification_missing" };
  }
  if (input.verification.result !== "verified") {
    return { eligible: false, reasonCode: "verification_not_verified" };
  }
  if (input.verification.validUntilUtc !== null && input.nowUtc.getTime() >= input.verification.validUntilUtc.getTime()) {
    return { eligible: false, reasonCode: "verification_expired" };
  }
  return { eligible: true, screeningResultId: input.screening.screeningResultId };
}

/** Resolves verified-PoC status via the existing accepted Phase 3A-2 read seam — never re-runs
 * cryptography, never reads a raw signature (Part §Issue 12). */
export async function loadPocVerified(sql: Sql, destinationId: string): Promise<boolean> {
  const proof = await getCurrentProofOfControl(sql, destinationId);
  return proof.status === "verified";
}

export interface ApprovalPayload {
  destination_id: string;
  client_id: string;
  natural_key_hash: string;
  screening_result_id: string;
  whitelist_version: number;
}

/** Frozen exact canonical field set (addendum Issue 7 / task's own "APPROVAL FINGERPRINT" section)
 * — destination_id, client_id, natural_key_hash, screening_result_id, whitelist_version. NO PoC
 * challenge id, NO destination_status_version, NO cooling-off duration, NO actor_id/reason. Uses
 * the shared `fingerprint()` from `@aix/foundation` (sorted-key canonical JSON SHA-256) — never a
 * hand-rolled hash. */
export function buildApprovalPayload(snapshot: DestinationSnapshot, screeningResultId: string): ApprovalPayload {
  return {
    destination_id: snapshot.destinationId,
    client_id: snapshot.clientId,
    natural_key_hash: snapshot.naturalKeyHash,
    screening_result_id: screeningResultId,
    whitelist_version: snapshot.whitelistVersion,
  };
}

export function computeApprovalFingerprint(payload: ApprovalPayload): string {
  return fingerprint(payload);
}

export type ApprovalContextResult =
  | { ok: true; snapshot: DestinationSnapshot; screeningResultId: string; payload: ApprovalPayload; payloadHash: string }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "gate_failed"; reasonCode: ApprovalGateFailureReason };

/**
 * The ONE function both approve/request and approve/apply call to resolve+validate the full
 * approval context from a fresh read. `sql` may be a `Pool` (approve/request's own pre-IAM read, or
 * approve/apply's Phase A pre-IAM read) or a `PoolClient` inside approve/apply's locked transaction
 * (Phase C's own re-check) — `getCurrentProofOfControl`/`query` both accept either via the shared
 * `Sql` type, so no separate "transactional" variant of this function is needed.
 *
 * Client binding is checked HERE, not left to the caller: an unknown `destinationId` and a
 * `destinationId` that exists but belongs to a different `clientId` both collapse to the SAME
 * `{ok: false, kind: "not_found"}` — no enumeration oracle, matching every other WLT-01/AML-01
 * client-scoped route's established convention.
 */
export async function resolveApprovalContext(sql: Sql, destinationId: string, clientId: string, nowUtc: Date): Promise<ApprovalContextResult> {
  const snapshot = await loadDestinationSnapshot(sql, destinationId);
  if (!snapshot || snapshot.clientId !== clientId) return { ok: false, kind: "not_found" };

  let gate: ApprovalGateResult;
  if (snapshot.destinationType === FIAT_DESTINATION_TYPE) {
    const coverage = await fetchActiveFiatRailCoverage(sql, snapshot.rail as string, snapshot.bankCountry as string, snapshot.currency as string);
    const screening = await loadLatestFiatScreeningResult(sql, destinationId);
    const verification = await loadLatestBeneficiaryVerification(sql, destinationId);
    gate = evaluateFiatApprovalGates({
      status: snapshot.status,
      railCoverageOk: coverage !== undefined,
      screening: screening ? { screeningResultId: screening.screeningResultId, riskStatus: screening.riskStatus, validUntilUtc: screening.validUntilUtc } : null,
      verification: verification ? { verificationId: verification.verificationId, result: verification.result, validUntilUtc: verification.validUntilUtc } : null,
      nowUtc,
    });
  } else {
    const screening = await loadLatestScreening(sql, destinationId);
    const pocVerified = await loadPocVerified(sql, destinationId);
    gate = evaluateApprovalGates({ status: snapshot.status, walletType: snapshot.walletType as string, screening, pocVerified, nowUtc });
  }
  if (!gate.eligible) return { ok: false, kind: "gate_failed", reasonCode: gate.reasonCode };

  const payload = buildApprovalPayload(snapshot, gate.screeningResultId);
  const payloadHash = computeApprovalFingerprint(payload);
  return { ok: true, snapshot, screeningResultId: gate.screeningResultId, payload, payloadHash };
}

/** Phase C's own drift re-check (addendum Issue 10) — compares a freshly re-resolved context
 * against the Phase A snapshot's `destinationStatusVersion`/`whitelistVersion`. A drift in either
 * means the destination changed between the pre-IAM read and the post-execute-verify write
 * transaction — the approval must not be applied to a state it was never actually evaluated
 * against. Re-running the FULL gate check (via `resolveApprovalContext`, called separately by the
 * route before this) already re-validates status/screening/PoC; this function adds the narrower
 * version-equality check those gates alone cannot express. */
export function hasVersionDrift(before: { destinationStatusVersion: number; whitelistVersion: number }, after: { destinationStatusVersion: number; whitelistVersion: number }): boolean {
  return before.destinationStatusVersion !== after.destinationStatusVersion || before.whitelistVersion !== after.whitelistVersion;
}

/** Used only by test/route code operating inside an already-open transaction that needs the
 * locked row read (`SELECT ... FOR UPDATE`) — kept separate from `loadDestinationSnapshot` because
 * only approve/apply's Phase C ever needs the lock, and only a `PoolClient` (never a bare `Pool`)
 * can meaningfully hold one across subsequent statements in the same transaction. */
export async function loadDestinationForUpdate(client: PoolClient, destinationId: string): Promise<{ status: string; destinationStatusVersion: number; whitelistVersion: number } | null> {
  const rows = await query<{ status: string; destination_status_version: number; whitelist_version: number }>(
    client,
    `SELECT status, destination_status_version, whitelist_version FROM wlt1.destination WHERE destination_id = $1 FOR UPDATE`,
    [destinationId],
  );
  const row = rows[0];
  if (!row) return null;
  return { status: row.status, destinationStatusVersion: row.destination_status_version, whitelistVersion: row.whitelist_version };
}
