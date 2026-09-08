/**
 * WLT-01 Phase 4A-3 — read-only destination-decision verification: the decision-row DB loader and
 * the pure POST-TOKEN-AUTH verification evaluator. Implements the FROZEN architecture (WLT-01
 * Phase 4A-3 addendum, CLOSED) exactly — no new architectural decisions are made in this file.
 *
 * SCOPE (frozen, load-bearing): this module answers "is the already-issued artifact still
 * structurally valid," never "should the withdrawal proceed right now." It does NOT re-run
 * screening, AML, P-ROSTER, chain coverage, cooling-off, whitelist eligibility, or PoC
 * cryptography — those remain `routes/evaluate-use.ts`'s own concern (issuance-time) or a future
 * Phase 4B's concern (consumption-time). This file's own current-state reads are exactly two:
 * destination revocation state (`status`/`revocation_epoch`) and `wallet_destination.wallet_type`
 * (for structural PoC-nullability interpretation only) — reused directly from
 * `lib/evaluate-use.ts`'s existing `loadDestinationEvalSnapshot` (same-service reuse, F3(c)
 * governs cross-SERVICE boundaries only, mirrors `lib/evaluate-use.ts`'s own reuse of
 * `lib/destination-approval.ts`).
 *
 * TOKEN AUTHENTICATION IS NOT THIS MODULE'S CONCERN: `routes/decision-verify.ts` calls
 * `lib/decision-token.ts`'s `tokenHashMatches` BEFORE ever calling `evaluateDecisionVerification`
 * below — a `token_mismatch` (unknown decision_id OR wrong token, deliberately indistinguishable)
 * never reaches this evaluator at all. This file therefore encodes exactly the frozen POST-AUTH
 * precedence: binding -> expiry -> revocation -> status/evidence-integrity.
 */
import { query, type Sql } from "@aix/foundation";
import { isPocSupportedWalletType } from "./proof-of-control/service.js";

/** Frozen exhaustive `valid:false` reason vocabulary (WLT-01 Phase 4A-3 addendum) — `token_mismatch`
 * is decided by the ROUTE (before this evaluator ever runs); the other four are this evaluator's
 * own output. No `not_found`, no `already_consumed`, no `screening_changed`/`aml_changed`/
 * `poc_expired`. */
export type Wlt1DecisionVerifyReasonCode = "token_mismatch" | "binding_mismatch" | "expired" | "revoked" | "evidence_integrity_invalid";

/** The evaluator's own output never includes `token_mismatch` — that reason is only ever produced
 * by the route's own pre-evaluator token-authentication step. */
export type Wlt1DecisionVerifyEvaluatorReasonCode = Exclude<Wlt1DecisionVerifyReasonCode, "token_mismatch">;

export interface StoredDecisionRow {
  decisionId: string;
  tokenHash: string;
  destinationId: string;
  clientId: string;
  requestedAction: string;
  status: string;
  expiresAtUtc: Date;
  revocationEpoch: number;
  pocChallengeId: string | null;
  /** Fiat Payout Destinations (APAC) extension — the decision's OWN persisted type/rail/currency/
   * beneficiary-verification binding, from migration 061. `destinationType` is always present;
   * `rail`/`currency`/`beneficiaryVerificationId` are `null` for a wallet decision. */
  destinationType: string;
  rail: string | null;
  currency: string | null;
  beneficiaryVerificationId: string | null;
}

interface StoredDecisionSqlRow {
  decision_id: string;
  token_hash: string;
  destination_id: string;
  client_id: string;
  requested_action: string;
  status: string;
  expires_at_utc: Date;
  revocation_epoch: number;
  poc_challenge_id: string | null;
  destination_type: string;
  rail: string | null;
  currency: string | null;
  beneficiary_verification_id: string | null;
}

/** Reads exactly the columns needed to authenticate and structurally verify a decision — never
 * SELECT * (no AML/screening evidence detail is read; this route never returns or audits it).
 * Returns `null` if no row exists for this `decision_id` — the route's own dummy timing-safe
 * comparison path handles that case, never a special-cased early return here. */
export async function loadDecisionByDecisionId(sql: Sql, decisionId: string): Promise<StoredDecisionRow | null> {
  const rows = await query<StoredDecisionSqlRow>(
    sql,
    `SELECT decision_id, token_hash, destination_id, client_id, requested_action, status, expires_at_utc, revocation_epoch, poc_challenge_id,
            destination_type, rail, currency, beneficiary_verification_id
       FROM wlt1.destination_decision
      WHERE decision_id = $1`,
    [decisionId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    decisionId: row.decision_id,
    tokenHash: row.token_hash,
    destinationId: row.destination_id,
    clientId: row.client_id,
    requestedAction: row.requested_action,
    status: row.status,
    expiresAtUtc: row.expires_at_utc,
    revocationEpoch: row.revocation_epoch,
    pocChallengeId: row.poc_challenge_id,
    destinationType: row.destination_type,
    rail: row.rail,
    currency: row.currency,
    beneficiaryVerificationId: row.beneficiary_verification_id,
  };
}

export interface CurrentDestinationState {
  status: string;
  revocationEpoch: number;
  destinationType: string;
  /** Wallet-only — present iff `destinationType === 'wallet'`. */
  walletType?: string;
  /** Fiat-only — present iff `destinationType === 'fiat_payout'`. */
  rail?: string;
  currency?: string;
}

export interface DecisionVerifyInput {
  /** Caller-presented bindings (request body) — chain/network are deliberately NOT part of this
   * shape; they are persisted evidence bindings, never caller-selected verification inputs. */
  callerClientId: string;
  callerDestinationId: string;
  callerRequestedAction: string;
  decision: StoredDecisionRow;
  currentDestination: CurrentDestinationState;
  nowUtc: Date;
}

export type DecisionVerifyResult = { eligible: true } | { eligible: false; reasonCode: Wlt1DecisionVerifyEvaluatorReasonCode };

/**
 * Pure evaluation of the POST-TOKEN-AUTH verification precedence (frozen, security-sensitive
 * ordering — binding before expiry before revocation before status/evidence-integrity).
 * Deterministic, no I/O — independently unit-testable.
 */
export function evaluateDecisionVerification(input: DecisionVerifyInput): DecisionVerifyResult {
  if (
    input.decision.clientId !== input.callerClientId ||
    input.decision.destinationId !== input.callerDestinationId ||
    input.decision.requestedAction !== input.callerRequestedAction
  ) {
    return { eligible: false, reasonCode: "binding_mismatch" };
  }

  if (input.nowUtc.getTime() >= input.decision.expiresAtUtc.getTime()) {
    return { eligible: false, reasonCode: "expired" };
  }

  // revocation_epoch is the ONLY current-state signal that invalidates an already-issued
  // artifact — destination_status_version/whitelist_version are deliberately NEVER checked here:
  // a legitimate approved_pending_cooling -> active promotion bumps both without revoking
  // anything, and an already-issued decision must remain valid through that transition.
  if (input.currentDestination.status === "revoked" || input.currentDestination.revocationEpoch !== input.decision.revocationEpoch) {
    return { eligible: false, reasonCode: "revoked" };
  }

  // Structurally unreachable today (migration 057's CHECK permits only 'issued') — a forward-safe
  // guard so a future Phase 4B CHECK-widening (adding 'consumed') is rejected here without any
  // change to this evaluator.
  if (input.decision.status !== "issued") {
    return { eligible: false, reasonCode: "evidence_integrity_invalid" };
  }

  // Fiat Payout Destinations (APAC) extension: the decision's OWN destination_type must match the
  // CURRENT destination's type — a destination can never change type after creation (immutable,
  // no UPDATE grant), so a mismatch here means the decision row itself is structurally
  // inconsistent, never a legitimate state to honor.
  if (input.decision.destinationType !== input.currentDestination.destinationType) {
    return { eligible: false, reasonCode: "evidence_integrity_invalid" };
  }

  if (input.currentDestination.destinationType === "fiat_payout") {
    // Fiat integrity (mirror-image of the wallet PoC biconditional below): NO PoC ever
    // (poc_challenge_id must be NULL), a beneficiary-verification evidence reference IS required,
    // and the decision's own persisted rail/currency must match the CURRENT destination's
    // persisted rail/currency (both immutable after registration, so a mismatch here is likewise
    // a structural anomaly, never a legitimate drift to tolerate).
    if (
      input.decision.pocChallengeId !== null ||
      input.decision.beneficiaryVerificationId === null ||
      input.decision.rail !== input.currentDestination.rail ||
      input.decision.currency !== input.currentDestination.currency
    ) {
      return { eligible: false, reasonCode: "evidence_integrity_invalid" };
    }
  } else {
    // PoC Evidence-ID Addendum (frozen biconditional): poc_challenge_id IS NULL iff PoC is NOT
    // applicable for this wallet_type. Reuses the existing canonical isPocSupportedWalletType —
    // never reimplemented. This is a STRUCTURAL check only (nullness vs wallet_type) — it never
    // queries wlt1.proof_of_control to confirm the referenced challenge still exists, never
    // re-verifies a signature, and never re-checks freshness/ownership/custody; that would be
    // Phase 4B's concern.
    const pocApplicable = isPocSupportedWalletType(input.currentDestination.walletType as string);
    const hasPocChallenge = input.decision.pocChallengeId !== null;
    if (pocApplicable !== hasPocChallenge) {
      return { eligible: false, reasonCode: "evidence_integrity_invalid" };
    }
  }

  return { eligible: true };
}
