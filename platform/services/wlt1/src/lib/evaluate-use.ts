/**
 * WLT-01 Phase 4A-2 — evaluate-use local eligibility gates (G1-G9), destination/screening
 * snapshot resolution, and the P-ROSTER (CLT-01) client. Implements the FROZEN architecture
 * (WLT-01 Phase 4A freeze + Phase 4A-2 scope) exactly — no new architectural decisions are made in
 * this file.
 *
 * `routes/evaluate-use.ts` is the sole caller; this file owns no HTTP/route concerns. `lib/aml1-
 * client.ts` (a separate file) owns the AML-01 call; `lib/decision-token.ts` owns token identifier
 * minting/hashing.
 *
 * Reuses `lib/destination-approval.ts`'s existing `loadLatestScreening`/`loadPocVerified` (Phase
 * 4A-1, same service, not a cross-service import — F3(c) governs SERVICE boundaries, not
 * within-service reuse) rather than duplicating that logic a second time.
 */
import type { PoolClient } from "pg";
import { query, type Sql } from "@aix/foundation";
import { fetchActiveChainCoverage } from "./chain-coverage.js";
import { isPocSupportedWalletType } from "./proof-of-control/service.js";
import { loadLatestScreening, loadPocVerified, type LatestScreeningSnapshot } from "./destination-approval.js";

export const WALLET_DESTINATION_ACCEPTED_TYPE = "wallet";
export const FIAT_DESTINATION_ACCEPTED_TYPE = "fiat_payout";
export const EVALUATE_USE_ACCEPTED_ACTION = "destination_use";

/** Statuses G8/G9 treat as potentially eligible for use — `active` outright, or
 * `approved_pending_cooling` once cooling-off has elapsed (checked separately). Every other
 * status (`draft`/`pending_screening`/`pending_review`) is never whitelist-eligible; `revoked` is
 * handled earlier as its own gate (G3), never reaching this check. */
const USABLE_STATUS_ACTIVE = "active";
const USABLE_STATUS_COOLING = "approved_pending_cooling";

/**
 * FIAT EXTENSION (4A-3): both loaders below now `LEFT JOIN` `wallet_destination` AND
 * `fiat_payout_destination`, instead of the original `INNER JOIN wallet_destination` — the
 * original inner join structurally hid every fiat destination from evaluate-use (a fiat
 * destination has no `wallet_destination` row, so the join produced zero rows). Wallet-only
 * fields (`chain`/`network`/`walletType`) and fiat-only fields (`bankCountry`/`currency`/`rail`)
 * are therefore both OPTIONAL on this shared snapshot shape — exactly one set is populated,
 * selected by `destinationType`, and callers must branch on `destinationType` before reading
 * either set (never accessed unguarded — see `routes/evaluate-use.ts`'s own type dispatch).
 */
export interface DestinationEvalSnapshot {
  destinationId: string;
  clientId: string;
  status: string;
  destinationType: string;
  destinationStatusVersion: number;
  whitelistVersion: number;
  revocationEpoch: number;
  limitsVersion: number;
  coolingOffUntilUtc: Date | null;
  chain?: string;
  network?: string;
  walletType?: string;
  bankCountry?: string;
  currency?: string;
  rail?: string;
  beneficiaryNameNormalized?: string;
  accountIdentifierHash?: string;
}

interface DestinationEvalRow {
  destination_id: string;
  client_id: string;
  status: string;
  destination_type: string;
  destination_status_version: number;
  whitelist_version: number;
  revocation_epoch: number;
  limits_version: number;
  cooling_off_until_utc: Date | null;
  chain: string | null;
  network: string | null;
  wallet_type: string | null;
  bank_country: string | null;
  currency: string | null;
  rail: string | null;
  beneficiary_name_normalized: string | null;
  account_identifier_hash: string | null;
}

function toDestinationEvalSnapshot(row: DestinationEvalRow): DestinationEvalSnapshot {
  return {
    destinationId: row.destination_id,
    clientId: row.client_id,
    status: row.status,
    destinationType: row.destination_type,
    destinationStatusVersion: row.destination_status_version,
    whitelistVersion: row.whitelist_version,
    revocationEpoch: row.revocation_epoch,
    limitsVersion: row.limits_version,
    coolingOffUntilUtc: row.cooling_off_until_utc,
    chain: row.chain ?? undefined,
    network: row.network ?? undefined,
    walletType: row.wallet_type ?? undefined,
    bankCountry: row.bank_country ?? undefined,
    currency: row.currency ?? undefined,
    rail: row.rail ?? undefined,
    beneficiaryNameNormalized: row.beneficiary_name_normalized ?? undefined,
    accountIdentifierHash: row.account_identifier_hash ?? undefined,
  };
}

const DESTINATION_EVAL_SELECT = `
  SELECT d.destination_id, d.client_id, d.status, d.destination_type, d.destination_status_version, d.whitelist_version,
         d.revocation_epoch, d.limits_version, d.cooling_off_until_utc, wd.chain, wd.network, wd.wallet_type,
         fd.bank_country, fd.currency, fd.rail, fd.beneficiary_name_normalized, fd.account_identifier_hash
    FROM wlt1.destination d
    LEFT JOIN wlt1.wallet_destination wd ON wd.destination_id = d.destination_id
    LEFT JOIN wlt1.fiat_payout_destination fd ON fd.destination_id = d.destination_id
`;

/** Reads the destination + its type-specific detail row in one statement. Returns `null` if the
 * destination does not exist. Does NOT lock the row — the route's own TX-B issues its own `FOR
 * UPDATE` read separately. */
export async function loadDestinationEvalSnapshot(sql: Sql, destinationId: string): Promise<DestinationEvalSnapshot | null> {
  const rows = await query<DestinationEvalRow>(sql, `${DESTINATION_EVAL_SELECT} WHERE d.destination_id = $1`, [destinationId]);
  const row = rows[0];
  return row ? toDestinationEvalSnapshot(row) : null;
}

/** Row-locked variant for TX-B's own re-check — a `PoolClient` (never a bare `Pool`) is required
 * to meaningfully hold the lock across subsequent statements in the same transaction. */
export async function loadDestinationEvalSnapshotForUpdate(client: PoolClient, destinationId: string): Promise<DestinationEvalSnapshot | null> {
  const rows = await query<DestinationEvalRow>(client, `${DESTINATION_EVAL_SELECT} WHERE d.destination_id = $1 FOR UPDATE OF d`, [destinationId]);
  const row = rows[0];
  return row ? toDestinationEvalSnapshot(row) : null;
}

export { loadLatestScreening, loadPocVerified, type LatestScreeningSnapshot };

export type Wlt1EvaluateUseDenyReason =
  | "destination_revoked"
  | "action_not_supported"
  | "chain_not_supported"
  | "screening_not_clear"
  | "screening_stale"
  | "proof_of_control_missing"
  | "destination_not_whitelisted"
  | "cooling_off_active"
  | "aml_not_allowed"
  | "aml_subjects_unavailable"
  | "aml_subject_limit_exceeded"
  | "state_changed_during_evaluation"
  | "evidence_expiring"
  // Fiat Payout Destinations (APAC) — G3/G6 (rail coverage / beneficiary verification).
  | "rail_not_supported"
  | "beneficiary_verification_invalid"
  // Limits / Velocity / Concentration / First-Use — PRE_LIMIT (no limit_evaluation, no
  // wlt1.limit_denied): the fiat request's caller-supplied asset_or_currency did not match the
  // server-owned destination currency (never a cross-table CHECK — enforced here in application
  // code before any limit work).
  | "asset_dimension_invalid"
  // LIMIT_POLICY (writes exactly one deny wlt1.limit_evaluation row + one wlt1.limit_denied
  // audit each) — see lib/limits.ts's own header for the frozen breach-precedence order.
  | "limit_policy_unavailable"
  | "per_transaction_limit_exceeded"
  | "first_use_limit_exceeded"
  | "daily_velocity_exceeded"
  | "rolling_velocity_exceeded";

export interface LocalGateInput {
  status: string;
  destinationType: string;
  requestedAction: string;
  walletType: string;
  chainCoverageOk: boolean;
  screening: LatestScreeningSnapshot | null;
  pocVerified: boolean;
  coolingOffUntilUtc: Date | null;
  nowUtc: Date;
}

export type LocalGateResult = { eligible: true; screeningResultId: string } | { eligible: false; reasonCode: Wlt1EvaluateUseDenyReason };

/**
 * Pure evaluation of local gates G3-G9 (frozen order — G1/G2 destination-existence/client-binding
 * are the route's own 404 concern, never a business deny; G10 AML is a separate, later network
 * call). Deterministic, no I/O — independently unit-testable.
 */
export function evaluateLocalGates(input: LocalGateInput): LocalGateResult {
  if (input.status === "revoked") {
    return { eligible: false, reasonCode: "destination_revoked" };
  }
  if (input.destinationType !== WALLET_DESTINATION_ACCEPTED_TYPE || input.requestedAction !== EVALUATE_USE_ACCEPTED_ACTION) {
    return { eligible: false, reasonCode: "action_not_supported" };
  }
  if (!input.chainCoverageOk) {
    return { eligible: false, reasonCode: "chain_not_supported" };
  }
  if (!input.screening || input.screening.riskStatus !== "clear") {
    return { eligible: false, reasonCode: "screening_not_clear" };
  }
  if (input.screening.validUntilUtc !== null && input.nowUtc.getTime() >= input.screening.validUntilUtc.getTime()) {
    return { eligible: false, reasonCode: "screening_stale" };
  }
  if (isPocSupportedWalletType(input.walletType) && !input.pocVerified) {
    return { eligible: false, reasonCode: "proof_of_control_missing" };
  }
  if (input.status === USABLE_STATUS_ACTIVE) {
    // Whitelist-eligible outright.
  } else if (input.status === USABLE_STATUS_COOLING) {
    if (input.coolingOffUntilUtc === null || input.nowUtc.getTime() < input.coolingOffUntilUtc.getTime()) {
      return { eligible: false, reasonCode: "cooling_off_active" };
    }
    // Cooling-off has elapsed — eligible, but NOT yet promoted here (Part §Lazy Active Promotion —
    // promotion is deferred to the locked TX-B transaction, never the unlocked initial read).
  } else {
    // draft / pending_screening / pending_review.
    return { eligible: false, reasonCode: "destination_not_whitelisted" };
  }
  return { eligible: true, screeningResultId: input.screening.screeningResultId };
}

// -------------------------------------------------------------------------------------------
// Fiat Payout Destinations (APAC) — evaluate-use local gates G1-G7 (frozen order): revoked ->
// type/action -> rail coverage -> screening clear -> screening fresh -> beneficiary verification
// (verified + fresh + binding valid) -> whitelist/cooling. A SEPARATE function from
// `evaluateLocalGates` (never a shared/parameterized one) — wallet behavior must remain byte-
// identical, and PoC/beneficiary-verification are structurally different evidence shapes.
// -------------------------------------------------------------------------------------------

export interface FiatLatestScreeningSnapshot {
  screeningResultId: string;
  riskStatus: string;
  validUntilUtc: Date | null;
}

export interface FiatLatestVerificationSnapshot {
  verificationId: string;
  result: string;
  validUntilUtc: Date | null;
  beneficiaryNameHash: string;
  accountIdentifierHash: string;
}

export interface FiatLocalGateInput {
  status: string;
  destinationType: string;
  requestedAction: string;
  railCoverageOk: boolean;
  screening: FiatLatestScreeningSnapshot | null;
  verification: FiatLatestVerificationSnapshot | null;
  /** The destination's OWN persisted binding — never caller-supplied — that a fresh verification
   * must still match. A verification bound to a DIFFERENT (now-changed) beneficiary/account
   * identity is never treated as valid, even if otherwise fresh + `verified`. */
  expectedBeneficiaryNameHash: string;
  expectedAccountIdentifierHash: string;
  coolingOffUntilUtc: Date | null;
  nowUtc: Date;
}

export type FiatLocalGateResult =
  | { eligible: true; screeningResultId: string; beneficiaryVerificationId: string }
  | { eligible: false; reasonCode: Wlt1EvaluateUseDenyReason };

export function evaluateFiatLocalGates(input: FiatLocalGateInput): FiatLocalGateResult {
  // G1
  if (input.status === "revoked") {
    return { eligible: false, reasonCode: "destination_revoked" };
  }
  // G2
  if (input.destinationType !== FIAT_DESTINATION_ACCEPTED_TYPE || input.requestedAction !== EVALUATE_USE_ACCEPTED_ACTION) {
    return { eligible: false, reasonCode: "action_not_supported" };
  }
  // G3
  if (!input.railCoverageOk) {
    return { eligible: false, reasonCode: "rail_not_supported" };
  }
  // G4
  if (!input.screening || input.screening.riskStatus !== "clear") {
    return { eligible: false, reasonCode: "screening_not_clear" };
  }
  // G5
  if (input.screening.validUntilUtc !== null && input.nowUtc.getTime() >= input.screening.validUntilUtc.getTime()) {
    return { eligible: false, reasonCode: "screening_stale" };
  }
  // G6 — verified + fresh + binding valid, all three required; anything else collapses to the
  // SAME reason code (no oracle on which sub-condition failed).
  const verification = input.verification;
  const verificationFresh = verification !== null && (verification.validUntilUtc === null || input.nowUtc.getTime() < verification.validUntilUtc.getTime());
  const verificationBindingValid =
    verification !== null &&
    verification.beneficiaryNameHash === input.expectedBeneficiaryNameHash &&
    verification.accountIdentifierHash === input.expectedAccountIdentifierHash;
  if (!verification || verification.result !== "verified" || !verificationFresh || !verificationBindingValid) {
    return { eligible: false, reasonCode: "beneficiary_verification_invalid" };
  }
  // G7
  if (input.status === USABLE_STATUS_ACTIVE) {
    // Whitelist-eligible outright.
  } else if (input.status === USABLE_STATUS_COOLING) {
    if (input.coolingOffUntilUtc === null || input.nowUtc.getTime() < input.coolingOffUntilUtc.getTime()) {
      return { eligible: false, reasonCode: "cooling_off_active" };
    }
  } else {
    return { eligible: false, reasonCode: "destination_not_whitelisted" };
  }
  return { eligible: true, screeningResultId: input.screening.screeningResultId, beneficiaryVerificationId: verification.verificationId };
}

export { fetchActiveChainCoverage };
export { fetchActiveFiatRailCoverage } from "./fiat/rail-coverage.js";
export { loadLatestBeneficiaryVerification, loadLatestFiatScreeningResult } from "./fiat-destination.js";

// -------------------------------------------------------------------------------------------
// P-ROSTER client — GET /internal/clt1/clients/:client_id/authorised-parties/active-refs
// (CLT-01, accepted). Reuses the EXISTING clt1BaseUrl/clt1InternalServiceToken config fields
// (Phase 1B) — no new CLT-01 config is introduced this phase.
// -------------------------------------------------------------------------------------------
const P_ROSTER_TIMEOUT_MS = 5000;

/** Frozen AML-01 Phase 3E subject_refs cap (1..20) — evaluate-use must never silently truncate a
 * larger roster; it fails closed instead (aml_subject_limit_exceeded). */
export const AML1_SUBJECT_REFS_MAX = 20;

export interface RosterClientConfig {
  baseUrl: string;
  internalServiceToken: string;
  fetchImpl?: typeof fetch;
}

export type RosterResult = { outcome: "ok"; refs: readonly string[] } | { outcome: "unavailable" };

interface RosterResponseBody {
  success?: boolean;
  data?: { client_id?: string; authorised_party_refs?: unknown };
}

/**
 * Fetches the client's active authorised_party references from CLT-01's P-ROSTER seam.
 *
 * FAIL-CLOSED, uniformly: network error, timeout, non-2xx (this collapses CLT-01's own
 * `404 CLT1_CLIENT_NOT_FOUND` and `409 CLT1_CLIENT_NOT_ACTIVE` into the identical outcome — the
 * frozen architecture assigns evaluate-use exactly one reason code, `aml_subjects_unavailable`,
 * for every roster-unreachable/roster-unusable case; there is no separate WLT error code for a
 * roster-specific technical failure, by design — see `routes/evaluate-use.ts`'s own header
 * comment for the full reasoning), and a malformed/unparseable/binding-mismatched body are ALL
 * treated identically as `"unavailable"` — never treated as an empty-but-valid roster.
 */
export async function fetchActiveAuthorisedPartyRefs(config: RosterClientConfig, clientId: string): Promise<RosterResult> {
  const doFetch = config.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${config.baseUrl}/internal/clt1/clients/${encodeURIComponent(clientId)}/authorised-parties/active-refs`, {
      method: "GET",
      headers: { "x-internal-service-token": config.internalServiceToken },
      signal: AbortSignal.timeout(P_ROSTER_TIMEOUT_MS),
    });
  } catch {
    return { outcome: "unavailable" };
  }

  if (!res.ok) {
    return { outcome: "unavailable" };
  }

  let body: RosterResponseBody;
  try {
    body = (await res.json()) as RosterResponseBody;
  } catch {
    return { outcome: "unavailable" };
  }

  if (!body?.success || !body.data || body.data.client_id !== clientId || !Array.isArray(body.data.authorised_party_refs) || !body.data.authorised_party_refs.every((r) => typeof r === "string")) {
    return { outcome: "unavailable" };
  }

  return { outcome: "ok", refs: body.data.authorised_party_refs as readonly string[] };
}

/** Compares a TX-A snapshot against a TX-B re-read — any difference in any of these three fields
 * means the destination changed between the two reads, and the evaluation must fail closed rather
 * than proceed against a state it was never actually validated against. */
export function hasEvalStateDrift(before: { destinationStatusVersion: number; whitelistVersion: number; revocationEpoch: number }, after: { destinationStatusVersion: number; whitelistVersion: number; revocationEpoch: number }): boolean {
  return before.destinationStatusVersion !== after.destinationStatusVersion || before.whitelistVersion !== after.whitelistVersion || before.revocationEpoch !== after.revocationEpoch;
}
