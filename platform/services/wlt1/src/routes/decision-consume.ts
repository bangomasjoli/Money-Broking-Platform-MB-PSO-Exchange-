/**
 * WLT-01 Phase 4B — `POST /internal/wlt1/destination-decisions/:decision_id/verify-and-consume`.
 * Implements the FROZEN architecture (WLT-01 Phase 4B Architecture Addendum, CLOSED + Micro-
 * Addendum, CLOSED) exactly — no new architectural decisions are made in this file.
 *
 * SINGLE-USE, RACE-SAFE (frozen, load-bearing): `SELECT ... FOR UPDATE` on the decision row
 * serializes concurrent consumers of the SAME decision_id; the CAS `UPDATE ... WHERE status =
 * 'issued'` is defence-in-depth on top of the lock, mirroring `lib/evaluate-use.ts`'s own
 * `FOR UPDATE OF d` precedent. This DELIBERATELY does NOT copy IAM-02's own
 * `verifyAndConsumeDecisionToken` pattern (`services/iam2/src/lib/decision-token.ts`), which issues
 * an UNLOCKED `SELECT` followed by an unconditional `UPDATE` — a genuine double-consume race a
 * separate architecture review identified and flagged as out-of-scope-but-must-not-be-copied.
 *
 * NO NETWORK CALLS (frozen phase boundary): no AML-01, no P-ROSTER, no CLT-01, no LED-01 call
 * anywhere in this route. The entire operation is one short locked transaction with no TOCTOU
 * window, because there is nothing to race against.
 *
 * C-1 AMENDMENT (Destination Revocation Addendum, mandatory, shipped in the same commit as the
 * revocation routes): the destination row is now read via `loadDestinationEvalSnapshotForUpdate`
 * (`SELECT ... FOR UPDATE`), not the unlocked `loadDestinationEvalSnapshot` this route originally
 * used — the prior unlocked read was a genuine revocation race (a concurrent
 * `POST .../destinations/:destination_id/revoke` could commit between this route's unlocked read
 * and its own CAS UPDATE, letting a consumption proceed against a destination that is, by the time
 * this transaction commits, already revoked). Frozen global lock order:
 * `destination_decision -> destination` — this route already holds the decision row's own lock
 * FIRST (STEP 2 below), so locking the destination row second here introduces no new lock-order
 * hazard; revocation itself only ever locks `wlt1.destination` alone.
 *
 * REUSE, NEVER DUPLICATE: `evaluateDecisionVerification`/`tokenHashMatches`/`DUMMY_TOKEN_HASH` are
 * imported UNMODIFIED from Phase 4A-3's own files and called in-process. Neither file is edited by
 * this route.
 *
 * ANTI-ORACLE (frozen, unchanged from 4A-3): an unknown `decision_id` and an existing decision
 * presented with the wrong token are indistinguishable — both run the identical hash+
 * `timingSafeEqual` comparison shape and return the identical `200 {consumed:false,
 * reason_code:"token_mismatch"}` shape. No 404, no `WLT1_DECISION_NOT_FOUND`.
 *
 * NO FAILURE MUTATION (frozen, load-bearing): none of the six business-deny outcomes ever writes
 * to `wlt1.destination_decision` — the runtime role's own column-scoped UPDATE grant (exactly
 * `status`/`consumed_at_utc`/`consumption_id`/`execution_ref`) is the structural enforcement that
 * every other column can never be mutated by this route, by any caller, under any outcome.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError, getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { DUMMY_TOKEN_HASH, tokenHashMatches } from "../lib/decision-token.js";
import { evaluateDecisionVerification } from "../lib/decision-verify.js";
import { evaluateConsumeOutcome, loadDecisionForConsumeUpdate, mintConsumptionId, type Wlt1ConsumeReasonCode } from "../lib/decision-consume.js";
import { loadDestinationEvalSnapshotForUpdate } from "../lib/evaluate-use.js";
import {
  ASSET_OR_CURRENCY_GRAMMAR,
  acquireClientLimitLock,
  breachReasonCode,
  buildLimitDeniedAuditMetadata,
  hasLimitPolicyDrift,
  insertDenyLimitEvaluation,
  insertPassLimitEvaluation,
  loadPassLimitEvaluationByDecisionId,
  mintLimitEvaluationId,
  parseAmountString,
  resolveClientLimitProfile,
  resolveDestinationLimitProfile,
  runLimitEvaluation,
  toFixedPointBigInt,
  type LimitDestinationType,
  type LimitDimension,
} from "../lib/limits.js";
import { Wlt1Error } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

const DecisionIdParams = Type.Object({ decision_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

// Amount grammar mirrors lib/limits.ts's own AMOUNT_GRAMMAR — see evaluate-use.ts's own identical
// comment for why "0" is deliberately schema-valid and rejected by the separate parseAmountString
// ">0" business rule instead.
const AmountSchema = Type.String({ pattern: "^(0|[1-9][0-9]{0,19})(\\.[0-9]{1,18})?$" });
const AssetOrCurrencySchema = Type.String({ pattern: ASSET_OR_CURRENCY_GRAMMAR.source });

const DecisionConsumeBody = Type.Object(
  {
    decision_token: Type.String({ minLength: 1, maxLength: 64 }),
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    destination_id: Type.String({ minLength: 1, maxLength: 64 }),
    requested_action: Type.Literal("destination_use"),
    execution_ref: Type.String({ minLength: 1, maxLength: 64 }),
    caller_module: Type.String({ minLength: 1, maxLength: 64 }),
    amount: AmountSchema,
    asset_or_currency: AssetOrCurrencySchema,
  },
  { additionalProperties: false },
);
type DecisionConsumeBody = Static<typeof DecisionConsumeBody>;

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function requireValidAmount(raw: string): string {
  const parsed = parseAmountString(raw);
  if (parsed === undefined) {
    throw new AppError("VALIDATION_ERROR", { details: [{ field: "amount", issue: "must be strictly greater than 0" }] });
  }
  return parsed;
}

/** Route-level `preValidation` — runs BEFORE Fastify's schema/Ajv validation, so it observes the
 * body's ORIGINAL JSON type, before Ajv's default `coerceTypes` would silently stringify a JSON
 * number (losing precision beyond ~17 significant digits, e.g. `1.123456789012345678` ->
 * `"1.123456789012345700"`). `amount` MUST be sent as a JSON string on the wire — a JSON number is
 * rejected here, before it can ever be coerced. */
function rejectNonStringAmount(request: FastifyRequest, _reply: FastifyReply, done: (err?: Error) => void): void {
  const body = request.body as { amount?: unknown } | undefined;
  if (body && "amount" in body && typeof body.amount !== "string") {
    return done(new AppError("VALIDATION_ERROR", { details: [{ field: "amount", issue: "must be a JSON string, not a JSON number" }] }));
  }
  done();
}

function denyBody(reasonCode: Wlt1ConsumeReasonCode) {
  return { consumed: false as const, reason_code: reasonCode };
}

interface ConsumedReceipt {
  decisionId: string;
  destinationId: string;
  clientId: string;
  requestedAction: string;
  executionRef: string;
  consumptionId: string;
  consumedAtUtc: Date;
}

function successBody(replay: boolean, receipt: ConsumedReceipt) {
  return {
    consumed: true as const,
    replay,
    consumption_id: receipt.consumptionId,
    decision_id: receipt.decisionId,
    destination_id: receipt.destinationId,
    client_id: receipt.clientId,
    requested_action: receipt.requestedAction,
    execution_ref: receipt.executionRef,
    consumed_at_utc: receipt.consumedAtUtc.toISOString(),
  };
}

export async function registerDecisionConsumeRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard((app.config as Wlt1Config).wlt1InternalServiceToken);

  app.post(
    "/internal/wlt1/destination-decisions/:decision_id/verify-and-consume",
    { preValidation: rejectNonStringAmount, preHandler: requireInternal, schema: { params: DecisionIdParams, body: DecisionConsumeBody } },
    async (request, reply) => {
      const { decision_id } = request.params as Static<typeof DecisionIdParams>;
      const body = request.body as DecisionConsumeBody;
      assertPoolAvailable();
      const validatedAmount = requireValidAmount(body.amount);

      type TxOutcome = { kind: "deny"; reasonCode: Wlt1ConsumeReasonCode } | { kind: "success"; replay: boolean; receipt: ConsumedReceipt };

      let outcome: TxOutcome;

      try {
        outcome = await withTransaction(async (client) => {
          // Limits / Velocity / Concentration / First-Use — the per-client advisory lock MUST be
          // acquired FIRST, before the decision row lock, per the frozen verify-and-consume lock
          // order. body.client_id is caller-supplied but non-authoritative here — STEP 5's own
          // binding cross-check (unchanged, existing) still gates everything downstream, so an
          // incorrect client_id can only ever lock an unrelated key and then be denied.
          await acquireClientLimitLock(client, body.client_id);

          // STEP 2 — locked read. Serializes every concurrent consumer of this exact decision_id.
          const row = await loadDecisionForConsumeUpdate(client, decision_id);

          // STEP 3 — ANTI-ORACLE: the SAME hash+timingSafeEqual comparison shape runs whether or
          // not a row exists — against the real stored hash when it does, against the fixed
          // DUMMY_TOKEN_HASH when it does not.
          const tokenAuthenticated = tokenHashMatches(body.decision_token, row?.tokenHash ?? DUMMY_TOKEN_HASH);

          if (!row || !tokenAuthenticated) {
            return { kind: "deny", reasonCode: "token_mismatch" };
          }

          // STEP 4 — reuse the accepted Phase 4A-3 evaluator UNCONDITIONALLY, with the row's REAL
          // persisted state (including its real status). PostgreSQL-authoritative time only — the
          // evaluator's own expiry check must never be judged against Date.now()/new Date().
          const nowForEvaluationRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
          const nowForEvaluation = nowForEvaluationRows[0]!.now_utc;
          // C-1 amendment (Destination Revocation Addendum): the destination row is now locked
          // FOR UPDATE, not merely read — an unlocked read here raced against a concurrent
          // revocation (revocation only locks `wlt1.destination`; this route already holds the
          // decision row's own lock first, so locking the destination row second here cannot
          // introduce a new lock-order hazard). Frozen global lock order:
          // destination_decision -> destination.
          // Fiat Payout Destinations (APAC) extension: loadDestinationEvalSnapshotForUpdate is
          // now type-aware (LEFT JOIN wallet_destination + fiat_payout_destination) — the
          // currentDestination shape passed to the evaluator is type-discriminated, never
          // assuming a wallet-shaped walletType field unconditionally.
          const currentDestination = await loadDestinationEvalSnapshotForUpdate(client, row.destinationId);
          const evaluatorResult = currentDestination
            ? evaluateDecisionVerification({
                callerClientId: body.client_id,
                callerDestinationId: body.destination_id,
                callerRequestedAction: body.requested_action,
                decision: row,
                currentDestination:
                  currentDestination.destinationType === "fiat_payout"
                    ? { status: currentDestination.status, revocationEpoch: currentDestination.revocationEpoch, destinationType: currentDestination.destinationType, rail: currentDestination.rail, currency: currentDestination.currency }
                    : { status: currentDestination.status, revocationEpoch: currentDestination.revocationEpoch, destinationType: currentDestination.destinationType, walletType: currentDestination.walletType },
                nowUtc: nowForEvaluation,
              })
            : ({ eligible: false, reasonCode: "evidence_integrity_invalid" } as const);

          // STEPS 5-7 — the frozen consume-outcome precedence (binding_mismatch always wins; then
          // consumed-vs-issued; then, only on the issued path, the evaluator's remaining verdict).
          const consumeOutcome = evaluateConsumeOutcome({
            evaluatorResult,
            rowStatus: row.status,
            rowConsumptionId: row.consumptionId,
            rowConsumedAtUtc: row.consumedAtUtc,
            rowExecutionRef: row.executionRef,
            callerExecutionRef: body.execution_ref,
          });

          if (consumeOutcome.kind === "deny") {
            await publishAudit(client, {
              event_type: "wlt1.destination_decision_consumed",
              source_module: "WLT-01",
              actor_id: "wlt1_internal_service",
              actor_type: "service",
              entity_type: "destination_decision",
              entity_id: decision_id,
              metadata: {
                decision_id: decision_id,
                outcome: "denied",
                reason_code: consumeOutcome.reasonCode,
                consumption_id: null,
                execution_ref: body.execution_ref,
                client_id: row.clientId,
                destination_id: row.destinationId,
                requested_action: body.requested_action,
                caller_module: body.caller_module,
                consumed_at_utc: null,
                // Limits / Velocity / Concentration / First-Use — this deny path (binding_mismatch/
                // already_consumed/expired/revoked/evidence_integrity_invalid) is entirely
                // PRE_LIMIT: limit evaluation never runs, so all four keys are deterministically
                // null, never fabricated.
                amount: null,
                asset_or_currency: null,
                first_use: null,
                limit_evaluation_id: null,
              },
            });
            return { kind: "deny", reasonCode: consumeOutcome.reasonCode };
          }

          if (consumeOutcome.kind === "replay") {
            const receipt: ConsumedReceipt = {
              decisionId: row.decisionId,
              destinationId: row.destinationId,
              clientId: row.clientId,
              requestedAction: row.requestedAction,
              executionRef: row.executionRef as string,
              consumptionId: consumeOutcome.consumptionId,
              consumedAtUtc: consumeOutcome.consumedAtUtc,
            };
            // Limits / Velocity / Concentration / First-Use — historically-honest replay: the
            // ORIGINAL pass evaluation's own first_use/limit_evaluation_id, never recomputed
            // against current state. row.amount/assetOrCurrency are the decision's own immutable
            // bound values (identical to what the original pass evaluation recorded).
            const originalPassEvaluation = await loadPassLimitEvaluationByDecisionId(client, decision_id);
            await publishAudit(client, {
              event_type: "wlt1.destination_decision_consumed",
              source_module: "WLT-01",
              actor_id: "wlt1_internal_service",
              actor_type: "service",
              entity_type: "destination_decision",
              entity_id: decision_id,
              metadata: {
                decision_id: decision_id,
                outcome: "replayed",
                reason_code: null,
                consumption_id: receipt.consumptionId,
                execution_ref: receipt.executionRef,
                client_id: receipt.clientId,
                destination_id: receipt.destinationId,
                requested_action: receipt.requestedAction,
                caller_module: body.caller_module,
                consumed_at_utc: receipt.consumedAtUtc.toISOString(),
                amount: row.amount,
                asset_or_currency: row.assetOrCurrency,
                first_use: originalPassEvaluation?.firstUse ?? null,
                limit_evaluation_id: originalPassEvaluation?.limitEvaluationId ?? null,
              },
            });
            return { kind: "success", replay: true, receipt };
          }

          // consumeOutcome.kind === "consume" from here on — a genuine new consumption. Limits /
          // Velocity / Concentration / First-Use — steps 5-8 of the frozen consume lock order.
          // PRE_LIMIT checks first (frozen order: limits_not_bound -> amount_mismatch ->
          // limits_version_changed) — none of these ever write wlt1.limit_evaluation or
          // wlt1.limit_denied; a failure here leaves the decision 'issued', unconsumed, zero
          // capacity debited. `currentDestination` is guaranteed non-null here — a null value would
          // have already produced `evidence_integrity_invalid`, an evaluator-verdict deny already
          // returned above.
          if (row.amount === null) {
            await publishAudit(client, {
              event_type: "wlt1.destination_decision_consumed",
              source_module: "WLT-01",
              actor_id: "wlt1_internal_service",
              actor_type: "service",
              entity_type: "destination_decision",
              entity_id: decision_id,
              metadata: {
                decision_id: decision_id,
                outcome: "denied",
                reason_code: "limits_not_bound",
                consumption_id: null,
                execution_ref: body.execution_ref,
                client_id: row.clientId,
                destination_id: row.destinationId,
                requested_action: body.requested_action,
                caller_module: body.caller_module,
                consumed_at_utc: null,
                amount: null,
                asset_or_currency: null,
                first_use: null,
                limit_evaluation_id: null,
              },
            });
            return { kind: "deny", reasonCode: "limits_not_bound" };
          }

          // `numeric(38,18)` always round-trips fully zero-padded (e.g. "40.000000000000000000"
          // for a caller-sent "40") — compare fixed-point VALUE equality, never raw strings.
          if (toFixedPointBigInt(row.amount) !== toFixedPointBigInt(validatedAmount) || row.assetOrCurrency !== body.asset_or_currency) {
            await publishAudit(client, {
              event_type: "wlt1.destination_decision_consumed",
              source_module: "WLT-01",
              actor_id: "wlt1_internal_service",
              actor_type: "service",
              entity_type: "destination_decision",
              entity_id: decision_id,
              metadata: {
                decision_id: decision_id,
                outcome: "denied",
                reason_code: "amount_mismatch",
                consumption_id: null,
                execution_ref: body.execution_ref,
                client_id: row.clientId,
                destination_id: row.destinationId,
                requested_action: body.requested_action,
                caller_module: body.caller_module,
                consumed_at_utc: null,
                // Never echo the bound amount/asset back on a substitution-mismatch attempt.
                amount: null,
                asset_or_currency: null,
                first_use: null,
                limit_evaluation_id: null,
              },
            });
            return { kind: "deny", reasonCode: "amount_mismatch" };
          }

          if (currentDestination!.limitsVersion !== row.limitsVersion) {
            await publishAudit(client, {
              event_type: "wlt1.destination_decision_consumed",
              source_module: "WLT-01",
              actor_id: "wlt1_internal_service",
              actor_type: "service",
              entity_type: "destination_decision",
              entity_id: decision_id,
              metadata: {
                decision_id: decision_id,
                outcome: "denied",
                reason_code: "limits_version_changed",
                consumption_id: null,
                execution_ref: body.execution_ref,
                client_id: row.clientId,
                destination_id: row.destinationId,
                requested_action: body.requested_action,
                caller_module: body.caller_module,
                consumed_at_utc: null,
                amount: row.amount,
                asset_or_currency: row.assetOrCurrency,
                first_use: null,
                limit_evaluation_id: null,
              },
            });
            return { kind: "deny", reasonCode: "limits_version_changed" };
          }

          const limitDimension: LimitDimension =
            row.destinationType === "wallet"
              ? { destinationType: "wallet", assetOrCurrency: row.assetOrCurrency, chain: row.chain, network: row.network, rail: null }
              : { destinationType: "fiat_payout", assetOrCurrency: row.assetOrCurrency, chain: null, network: null, rail: row.rail };

          const currentClientProfile = await resolveClientLimitProfile(client, row.clientId, limitDimension);
          const currentDestinationProfile = await resolveDestinationLimitProfile(client, row.clientId, row.destinationId, limitDimension);

          if (
            hasLimitPolicyDrift({
              boundClientLimitProfileId: row.clientLimitProfileId as string,
              boundClientLimitProfileVersion: row.clientLimitProfileVersion as number,
              boundDestinationLimitProfileId: row.destinationLimitProfileId,
              boundDestinationLimitProfileVersion: row.destinationLimitProfileVersion,
              currentClientProfile,
              currentDestinationProfile,
            })
          ) {
            await publishAudit(client, {
              event_type: "wlt1.destination_decision_consumed",
              source_module: "WLT-01",
              actor_id: "wlt1_internal_service",
              actor_type: "service",
              entity_type: "destination_decision",
              entity_id: decision_id,
              metadata: {
                decision_id: decision_id,
                outcome: "denied",
                reason_code: "limits_version_changed",
                consumption_id: null,
                execution_ref: body.execution_ref,
                client_id: row.clientId,
                destination_id: row.destinationId,
                requested_action: body.requested_action,
                caller_module: body.caller_module,
                consumed_at_utc: null,
                amount: row.amount,
                asset_or_currency: row.assetOrCurrency,
                first_use: null,
                limit_evaluation_id: null,
              },
            });
            return { kind: "deny", reasonCode: "limits_version_changed" };
          }

          // Step 8 — AUTHORITATIVE limit evaluation, under the already-held client lock + decision/
          // destination row locks. This is the SAME resolve+evaluate sequence evaluate-use's own
          // pre-check runs (lib/limits.ts's own `runLimitEvaluation`), re-executed here because the
          // drift check above only proves the BOUND profile references are still current — it does
          // NOT itself prove the amount is still within threshold against TODAY's usage.
          const limitOutcome = await runLimitEvaluation(client, {
            clientId: row.clientId,
            destinationId: row.destinationId,
            whitelistVersion: currentDestination!.whitelistVersion,
            amount: row.amount,
            dimension: limitDimension,
          });

          if (limitOutcome.kind !== "pass") {
            const breachType = limitOutcome.kind === "policy_unavailable" ? "policy_unavailable" : limitOutcome.breachType;
            const breachScope = limitOutcome.kind === "policy_unavailable" ? "client" : limitOutcome.breachScope;
            const evidenceClientProfile = limitOutcome.kind === "policy_unavailable" ? null : limitOutcome.clientProfile;
            const evidenceDestinationProfile = limitOutcome.kind === "policy_unavailable" ? null : limitOutcome.destinationProfile;
            const limitReasonCode: Wlt1ConsumeReasonCode = limitOutcome.kind === "policy_unavailable" ? "limit_policy_unavailable" : breachReasonCode(limitOutcome.breachType);

            const denyLimitEvaluationId = mintLimitEvaluationId();
            await insertDenyLimitEvaluation(client, {
              limitEvaluationId: denyLimitEvaluationId,
              decisionId: decision_id,
              clientId: row.clientId,
              destinationId: row.destinationId,
              destinationType: row.destinationType as LimitDestinationType,
              whitelistVersion: currentDestination!.whitelistVersion,
              limitsVersion: row.limitsVersion as number,
              amount: row.amount,
              dimension: limitDimension,
              breachType,
              breachScope,
              firstUse: limitOutcome.firstUse,
              clientLimitProfile: evidenceClientProfile,
              destinationLimitProfile: evidenceDestinationProfile,
            });
            await publishAudit(client, {
              event_type: "wlt1.limit_denied",
              source_module: "WLT-01",
              actor_id: "wlt1_internal_service",
              actor_type: "service",
              entity_type: "destination_decision",
              entity_id: decision_id,
              metadata: buildLimitDeniedAuditMetadata({
                limitEvaluationId: denyLimitEvaluationId,
                decisionId: decision_id,
                clientId: row.clientId,
                destinationId: row.destinationId,
                destinationType: row.destinationType as LimitDestinationType,
                dimension: limitDimension,
                amount: row.amount,
                breachType,
                breachScope,
                firstUse: limitOutcome.firstUse,
                limitsVersion: row.limitsVersion as number,
                clientLimitProfileId: evidenceClientProfile?.limitProfileId ?? null,
                destinationLimitProfileId: evidenceDestinationProfile?.limitProfileId ?? null,
                evaluatedAtUtc: nowForEvaluation,
              }),
            });
            await publishAudit(client, {
              event_type: "wlt1.destination_decision_consumed",
              source_module: "WLT-01",
              actor_id: "wlt1_internal_service",
              actor_type: "service",
              entity_type: "destination_decision",
              entity_id: decision_id,
              metadata: {
                decision_id: decision_id,
                outcome: "denied",
                reason_code: limitReasonCode,
                consumption_id: null,
                execution_ref: body.execution_ref,
                client_id: row.clientId,
                destination_id: row.destinationId,
                requested_action: body.requested_action,
                caller_module: body.caller_module,
                consumed_at_utc: null,
                amount: row.amount,
                asset_or_currency: row.assetOrCurrency,
                first_use: limitOutcome.firstUse,
                limit_evaluation_id: denyLimitEvaluationId,
              },
            });
            return { kind: "deny", reasonCode: limitReasonCode };
          }

          const limitAuthoritative = {
            limitEvaluationId: mintLimitEvaluationId(),
            destinationType: row.destinationType as LimitDestinationType,
            whitelistVersion: currentDestination!.whitelistVersion,
            dimension: limitDimension,
            firstUse: limitOutcome.firstUse,
            clientProfile: limitOutcome.clientProfile,
            destinationProfile: limitOutcome.destinationProfile,
          };

          // STEP 9 — mint + CAS UPDATE.
          const nowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
          const nowUtc = nowRows[0]!.now_utc;
          const consumptionId = mintConsumptionId();

          const updateResult = await client.query(
            `UPDATE wlt1.destination_decision
                SET status = 'consumed', consumed_at_utc = $1, consumption_id = $2, execution_ref = $3
              WHERE decision_id = $4 AND status = 'issued'`,
            [nowUtc.toISOString(), consumptionId, body.execution_ref, decision_id],
          );

          if (updateResult.rowCount !== 1) {
            // Lost the race despite FOR UPDATE (structurally near-impossible — defended anyway,
            // never fabricate success). Re-read and classify per the same consumed/replay rules.
            const reread = await loadDecisionForConsumeUpdate(client, decision_id);
            if (reread && reread.status === "consumed" && reread.executionRef === body.execution_ref) {
              const receipt: ConsumedReceipt = {
                decisionId: reread.decisionId,
                destinationId: reread.destinationId,
                clientId: reread.clientId,
                requestedAction: reread.requestedAction,
                executionRef: reread.executionRef as string,
                consumptionId: reread.consumptionId as string,
                consumedAtUtc: reread.consumedAtUtc as Date,
              };
              const racedOriginalPass = await loadPassLimitEvaluationByDecisionId(client, decision_id);
              await publishAudit(client, {
                event_type: "wlt1.destination_decision_consumed",
                source_module: "WLT-01",
                actor_id: "wlt1_internal_service",
                actor_type: "service",
                entity_type: "destination_decision",
                entity_id: decision_id,
                metadata: {
                  decision_id: decision_id,
                  outcome: "replayed",
                  reason_code: null,
                  consumption_id: receipt.consumptionId,
                  execution_ref: receipt.executionRef,
                  client_id: receipt.clientId,
                  destination_id: receipt.destinationId,
                  requested_action: receipt.requestedAction,
                  caller_module: body.caller_module,
                  consumed_at_utc: receipt.consumedAtUtc.toISOString(),
                  amount: row.amount,
                  asset_or_currency: row.assetOrCurrency,
                  first_use: racedOriginalPass?.firstUse ?? null,
                  limit_evaluation_id: racedOriginalPass?.limitEvaluationId ?? null,
                },
              });
              return { kind: "success", replay: true, receipt };
            }
            await publishAudit(client, {
              event_type: "wlt1.destination_decision_consumed",
              source_module: "WLT-01",
              actor_id: "wlt1_internal_service",
              actor_type: "service",
              entity_type: "destination_decision",
              entity_id: decision_id,
              metadata: {
                decision_id: decision_id,
                outcome: "denied",
                reason_code: "already_consumed",
                consumption_id: null,
                execution_ref: body.execution_ref,
                client_id: row.clientId,
                destination_id: row.destinationId,
                requested_action: body.requested_action,
                caller_module: body.caller_module,
                consumed_at_utc: null,
                amount: null,
                asset_or_currency: null,
                first_use: null,
                limit_evaluation_id: null,
              },
            });
            return { kind: "deny", reasonCode: "already_consumed" };
          }

          const receipt: ConsumedReceipt = {
            decisionId: row.decisionId,
            destinationId: row.destinationId,
            clientId: row.clientId,
            requestedAction: row.requestedAction,
            executionRef: body.execution_ref,
            consumptionId,
            consumedAtUtc: nowUtc,
          };

          // Limits / Velocity / Concentration / First-Use — steps 9-10 of the frozen consume lock
          // order: PASS accounting event. INSERT the pass usage row AFTER the CAS UPDATE has
          // already committed this decision to 'consumed' (above), BEFORE the mandatory consume
          // audit — all three (CAS, pass-row insert, audit) share this SAME transaction, so a
          // failure at any point rolls back all of them together (ONE mutation TX, mirroring the
          // accepted stuck-screening precedent).
          await insertPassLimitEvaluation(client, {
            limitEvaluationId: limitAuthoritative.limitEvaluationId,
            decisionId: decision_id,
            consumptionId,
            executionRef: body.execution_ref,
            clientId: row.clientId,
            destinationId: row.destinationId,
            destinationType: limitAuthoritative.destinationType,
            whitelistVersion: limitAuthoritative.whitelistVersion,
            limitsVersion: row.limitsVersion as number,
            amount: row.amount as string,
            dimension: limitAuthoritative.dimension,
            firstUse: limitAuthoritative.firstUse,
            clientLimitProfile: limitAuthoritative.clientProfile,
            destinationLimitProfile: limitAuthoritative.destinationProfile,
          });

          // STEP 11 — mandatory consume audit, same transaction as the CAS UPDATE + pass-row insert.
          await publishAudit(client, {
            event_type: "wlt1.destination_decision_consumed",
            source_module: "WLT-01",
            actor_id: "wlt1_internal_service",
            actor_type: "service",
            entity_type: "destination_decision",
            entity_id: decision_id,
            metadata: {
              decision_id: decision_id,
              outcome: "consumed",
              reason_code: null,
              consumption_id: receipt.consumptionId,
              execution_ref: receipt.executionRef,
              client_id: receipt.clientId,
              destination_id: receipt.destinationId,
              requested_action: receipt.requestedAction,
              caller_module: body.caller_module,
              consumed_at_utc: receipt.consumedAtUtc.toISOString(),
              amount: row.amount,
              asset_or_currency: row.assetOrCurrency,
              first_use: limitAuthoritative.firstUse,
              limit_evaluation_id: limitAuthoritative.limitEvaluationId,
            },
          });

          return { kind: "success", replay: false, receipt };
        });
      } catch (err) {
        if (err instanceof Wlt1Error) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "deny") {
        return reply.code(200).send(successEnvelope(denyBody(outcome.reasonCode), meta(request)));
      }
      return reply.code(200).send(successEnvelope(successBody(outcome.replay, outcome.receipt), meta(request)));
    },
  );
}
