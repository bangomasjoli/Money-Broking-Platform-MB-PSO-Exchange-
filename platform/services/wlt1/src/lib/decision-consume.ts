/**
 * WLT-01 Phase 4B — single-use consumption of an already-issued destination-use decision: the
 * row-locked DB loader and the pure post-authentication consume-outcome evaluator. Implements the
 * FROZEN architecture (WLT-01 Phase 4B Architecture Addendum, CLOSED + Micro-Addendum, CLOSED)
 * exactly — no new architectural decisions are made in this file.
 *
 * REUSE, NEVER DUPLICATE: `evaluateDecisionVerification` (`lib/decision-verify.ts`) and
 * `tokenHashMatches`/`DUMMY_TOKEN_HASH` (`lib/decision-token.ts`) are imported UNMODIFIED and
 * called in-process — never over HTTP. Both files are untouched by Phase 4B; Phase 4A-3 remains
 * independently valid.
 *
 * BINDING SCOPE (frozen, load-bearing): authority bindings are exactly `client_id`,
 * `destination_id`, `requested_action`, plus token possession, expiry, terminal revocation
 * (`revocation_epoch`), and structural PoC integrity — the SAME set 4A-3 verifies. `execution_ref`
 * is NOT an authority-scope binding; it is the caller-generated idempotency/execution-correlation
 * key that identifies WHICH consumption event this is, never WHAT was authorized. No
 * amount/asset/rail/chain/network is ever caller-supplied or consulted here.
 *
 * FINAL PRECEDENCE (frozen, security-sensitive, supersedes 4A-3's own 5-value ordering for THIS
 * route only): token_mismatch -> binding_mismatch -> already_consumed -> expired -> revoked ->
 * evidence_integrity_invalid. Bindings are checked on EVERY authenticated request, including
 * replays — a caller must prove both token possession AND the correct authority bindings before
 * ever receiving a stored replay receipt.
 *
 * REPLAY IS A RECEIPT, NOT FRESH AUTHORIZATION: once `status='consumed'` and the presented
 * `execution_ref` matches the persisted one (after binding passes), this module returns the
 * ORIGINAL `consumption_id`/`consumed_at_utc` — it does NOT re-consult `evaluateDecisionVerification`'s
 * expiry/revocation/evidence-integrity verdict at all. A decision that has since expired, or whose
 * destination has since been revoked, still replays successfully, because the consumption already
 * happened, at a time when those gates did pass.
 */
import { randomUUID } from "node:crypto";
import { query, type Sql } from "@aix/foundation";
import type { DecisionVerifyResult, StoredDecisionRow, Wlt1DecisionVerifyEvaluatorReasonCode } from "./decision-verify.js";

const CONSUMPTION_ID_PREFIX = "wlt1con_";

/** `wlt1con_` + a UUID (36 characters, lowercase hex + hyphens) — 44 characters total. Exact
 * structural analogue of `lib/decision-token.ts`'s own `DECISION_ID_REGEX`. */
export const CONSUMPTION_ID_REGEX = /^wlt1con_[0-9a-f-]{36}$/;

/** Mints a new consumption_id — server-generated only, never caller-supplied (the request schema
 * has no such field). Called ONLY on the successful first-consumption CAS path, immediately before
 * the UPDATE — never on a deny, never on a replay (which returns the ORIGINAL persisted id). */
export function mintConsumptionId(): string {
  return CONSUMPTION_ID_PREFIX + randomUUID();
}

/** Frozen exhaustive Phase 4B business-deny vocabulary — the 4A-3 five, plus `already_consumed`.
 * No `not_found`, no `state_changed`, no `screening_changed`, no `aml_changed`, no `poc_expired`.
 *
 * Limits / Velocity / Concentration / First-Use addition — PRE_LIMIT (`limits_not_bound`,
 * `amount_mismatch`, `limits_version_changed`: never write `wlt1.limit_evaluation` or
 * `wlt1.limit_denied`) and LIMIT_POLICY (`limit_policy_unavailable`,
 * `per_transaction_limit_exceeded`, `first_use_limit_exceeded`, `daily_velocity_exceeded`,
 * `rolling_velocity_exceeded`: each writes exactly one deny `wlt1.limit_evaluation` row + one
 * `wlt1.limit_denied` audit) — see `lib/limits.ts`'s own header for the frozen breach-precedence
 * order and the PRE_LIMIT/LIMIT_POLICY split rationale. Both classes leave the decision `issued`;
 * neither ever consumes it. */
export type Wlt1ConsumeReasonCode =
  | "token_mismatch"
  | "binding_mismatch"
  | "already_consumed"
  | "expired"
  | "revoked"
  | "evidence_integrity_invalid"
  | "limits_not_bound"
  | "amount_mismatch"
  | "limits_version_changed"
  | "limit_policy_unavailable"
  | "per_transaction_limit_exceeded"
  | "first_use_limit_exceeded"
  | "daily_velocity_exceeded"
  | "rolling_velocity_exceeded";

/** The full persisted row Phase 4B needs — a strict superset of 4A-3's own `StoredDecisionRow`
 * (structurally assignable to it, so it can be passed directly as `evaluateDecisionVerification`'s
 * own `decision` input without any conversion). Adds the three Phase 4B consumption columns, plus
 * (Limits / Velocity / Concentration / First-Use) `chain`/`network` and the seven limit-binding
 * columns migration 066 added — `amount` is `null` for a legacy pre-limits decision, which the
 * consume route treats as `limits_not_bound` (PRE_LIMIT, fails closed). */
export interface ConsumeDecisionRow extends StoredDecisionRow {
  consumedAtUtc: Date | null;
  consumptionId: string | null;
  executionRef: string | null;
  chain: string | null;
  network: string | null;
  amount: string | null;
  assetOrCurrency: string | null;
  limitsVersion: number | null;
  clientLimitProfileId: string | null;
  clientLimitProfileVersion: number | null;
  destinationLimitProfileId: string | null;
  destinationLimitProfileVersion: number | null;
}

interface ConsumeDecisionSqlRow {
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
  chain: string | null;
  network: string | null;
  rail: string | null;
  currency: string | null;
  beneficiary_verification_id: string | null;
  consumed_at_utc: Date | null;
  consumption_id: string | null;
  execution_ref: string | null;
  amount: string | null;
  asset_or_currency: string | null;
  limits_version: number | null;
  client_limit_profile_id: string | null;
  client_limit_profile_version: number | null;
  destination_limit_profile_id: string | null;
  destination_limit_profile_version: number | null;
}

/** Row-locked read for the consume transaction's own STEP 2 — a `PoolClient` (never a bare `Pool`)
 * is required to meaningfully hold the lock across the transaction's subsequent statements. Reads
 * exactly the columns Phase 4B (+ Fiat Payout Destinations APAC extension) needs — never SELECT *
 * (no AML/screening evidence detail is read; this route never returns or audits it, mirroring
 * `loadDecisionByDecisionId`'s own discipline). */
export async function loadDecisionForConsumeUpdate(sql: Sql, decisionId: string): Promise<ConsumeDecisionRow | null> {
  const rows = await query<ConsumeDecisionSqlRow>(
    sql,
    `SELECT decision_id, token_hash, destination_id, client_id, requested_action, status, expires_at_utc, revocation_epoch, poc_challenge_id,
            destination_type, chain, network, rail, currency, beneficiary_verification_id,
            consumed_at_utc, consumption_id, execution_ref,
            amount, asset_or_currency, limits_version,
            client_limit_profile_id, client_limit_profile_version,
            destination_limit_profile_id, destination_limit_profile_version
       FROM wlt1.destination_decision
      WHERE decision_id = $1
      FOR UPDATE`,
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
    chain: row.chain,
    network: row.network,
    rail: row.rail,
    currency: row.currency,
    beneficiaryVerificationId: row.beneficiary_verification_id,
    consumedAtUtc: row.consumed_at_utc,
    consumptionId: row.consumption_id,
    executionRef: row.execution_ref,
    amount: row.amount,
    assetOrCurrency: row.asset_or_currency,
    limitsVersion: row.limits_version,
    clientLimitProfileId: row.client_limit_profile_id,
    clientLimitProfileVersion: row.client_limit_profile_version,
    destinationLimitProfileId: row.destination_limit_profile_id,
    destinationLimitProfileVersion: row.destination_limit_profile_version,
  };
}

export interface EvaluateConsumeInput {
  /** The UNCONDITIONAL result of calling `evaluateDecisionVerification` with the row's REAL
   * persisted state (real status included) — see this module's own header comment for exactly how
   * its verdict is consulted differently depending on whether the row is 'issued' or 'consumed'. */
  evaluatorResult: DecisionVerifyResult;
  rowStatus: string;
  rowConsumptionId: string | null;
  rowConsumedAtUtc: Date | null;
  rowExecutionRef: string | null;
  callerExecutionRef: string;
}

export type ConsumeOutcome =
  | { kind: "consume" }
  | { kind: "replay"; consumptionId: string; consumedAtUtc: Date }
  | { kind: "deny"; reasonCode: Exclude<Wlt1ConsumeReasonCode, "token_mismatch"> };

/**
 * Pure evaluation of the POST-TOKEN-AUTH, POST-BINDING-CHECK consume outcome (frozen precedence:
 * binding_mismatch always wins; then consumed-vs-issued state; then, ONLY on the issued path, the
 * evaluator's remaining expired/revoked/evidence_integrity_invalid verdict). Deterministic, no I/O
 * — independently unit-testable.
 */
export function evaluateConsumeOutcome(input: EvaluateConsumeInput): ConsumeOutcome {
  // STEP 5 (frozen): a binding mismatch always wins, checked BEFORE consumed-state/replay handling
  // — even a caller replaying a consumed decision must prove the correct authority bindings before
  // ever receiving a stored receipt.
  if (!input.evaluatorResult.eligible && input.evaluatorResult.reasonCode === "binding_mismatch") {
    return { kind: "deny", reasonCode: "binding_mismatch" };
  }

  // STEP 6 (frozen): consumed-state branch. The evaluator's own remaining verdict (expired/
  // revoked/evidence_integrity_invalid — the latter is what the evaluator itself would report for
  // a non-'issued' status) is DELIBERATELY IGNORED here — replay is historical evidence of a past
  // successful consumption, never a fresh eligibility re-check.
  if (input.rowStatus === "consumed") {
    if (input.rowExecutionRef === input.callerExecutionRef) {
      // Coherence CHECK (migration 058) guarantees both are non-null whenever status='consumed'.
      return { kind: "replay", consumptionId: input.rowConsumptionId as string, consumedAtUtc: input.rowConsumedAtUtc as Date };
    }
    return { kind: "deny", reasonCode: "already_consumed" };
  }

  // STEP 7 (frozen): issued path — use the evaluator's remaining verdict (never binding_mismatch
  // here, already handled above; never a status-based evidence_integrity_invalid either, since
  // status genuinely is 'issued' at this point, so if the evaluator returns
  // evidence_integrity_invalid here it is a genuine PoC structural anomaly, not a status artifact).
  if (input.rowStatus === "issued") {
    if (!input.evaluatorResult.eligible) {
      return { kind: "deny", reasonCode: input.evaluatorResult.reasonCode as Wlt1DecisionVerifyEvaluatorReasonCode };
    }
    return { kind: "consume" };
  }

  // Defensive: any other persisted status is structurally unreachable (migration 058's own CHECK
  // permits only 'issued'/'consumed') — never a WLT1_ERROR, always a business deny, mirroring
  // 4A-3's own identical "forward-safe guard" discipline.
  return { kind: "deny", reasonCode: "evidence_integrity_invalid" };
}
