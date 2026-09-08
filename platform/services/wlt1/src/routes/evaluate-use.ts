/**
 * WLT-01 Phase 4A-2 — `POST /internal/wlt1/destinations/:destination_id/evaluate-use`. Implements
 * the FROZEN architecture (WLT-01 Phase 4A freeze + Phase 4A-2 scope + the PoC Evidence-ID
 * Addendum) exactly — no new architectural decisions are made in this file for the WALLET path,
 * which is UNCHANGED in behavior.
 *
 * FIAT PAYOUT DESTINATIONS (APAC) EXTENSION (4A-2, this addition): the handler now branches on
 * `snapshot.destinationType` immediately after loading TX-A's snapshot. The WALLET branch below is
 * byte-identical in behavior to the pre-fiat implementation (P-ROSTER fail-closed mapping, AML
 * gate, lazy active promotion, decision persistence) — only the destination_decision INSERT
 * statement itself gained four new columns (`destination_type`/`rail`/`currency`/
 * `beneficiary_verification_id`), all `NULL`/`'wallet'` on the wallet path, because migration 061
 * made `destination_type` NOT NULL on every row. The FIAT branch mirrors the wallet branch's own
 * TX-A -> P-ROSTER -> AML -> TX-B structure exactly, using `evaluateFiatLocalGates` (G1-G7) in
 * place of `evaluateLocalGates`, `wlt1.fiat_screening_result`/`wlt1.beneficiary_verification` in
 * place of wallet screening/PoC, and `wlt1.fiat_rail_coverage` in place of `wlt1.chain_coverage`.
 * P-ROSTER and the AML-01 pre-transaction gate are UNCHANGED and shared by both paths — AML-01's
 * own gate is already destination-agnostic (`chain`/`network`/`destination_ref` all optional); the
 * fiat path simply omits `chain`/`network` from its own AML call. No new AML subject type is
 * created.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { AppError, getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import {
  AML1_SUBJECT_REFS_MAX,
  FIAT_DESTINATION_ACCEPTED_TYPE,
  WALLET_DESTINATION_ACCEPTED_TYPE,
  evaluateFiatLocalGates,
  evaluateLocalGates,
  fetchActiveAuthorisedPartyRefs,
  fetchActiveChainCoverage,
  fetchActiveFiatRailCoverage,
  hasEvalStateDrift,
  loadDestinationEvalSnapshot,
  loadDestinationEvalSnapshotForUpdate,
  loadLatestBeneficiaryVerification,
  loadLatestFiatScreeningResult,
  loadLatestScreening,
  loadPocVerified,
  type Wlt1EvaluateUseDenyReason,
} from "../lib/evaluate-use.js";
import { computeBeneficiaryNameHash } from "../lib/fiat/beneficiary-name.js";
import { screenPreTransaction } from "../lib/aml1-client.js";
import { hashToken, mintDecisionId, mintDecisionToken } from "../lib/decision-token.js";
import { getCurrentProofOfControl, isPocSupportedWalletType } from "../lib/proof-of-control/service.js";
import {
  ASSET_OR_CURRENCY_GRAMMAR,
  acquireClientLimitLock,
  breachReasonCode,
  buildLimitDeniedAuditMetadata,
  insertDenyLimitEvaluation,
  mintLimitEvaluationId,
  parseAmountString,
  runLimitEvaluation,
  type LimitDimension,
  type LimitProfileRow,
} from "../lib/limits.js";
import { Wlt1Error } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

const DestinationIdParams = Type.Object({ destination_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

// Amount grammar mirrors lib/limits.ts's own AMOUNT_GRAMMAR exactly, deliberately permissive of
// literal "0" at the schema level — the frozen two-step design requires grammar validation and
// the separate ">0" business rule to be independently observable/testable (parseAmountString owns
// the ">0" enforcement; a bare "0" passes this pattern but is then rejected by parseAmountString).
const AmountSchema = Type.String({ pattern: "^(0|[1-9][0-9]{0,19})(\\.[0-9]{1,18})?$" });
const AssetOrCurrencySchema = Type.String({ pattern: ASSET_OR_CURRENCY_GRAMMAR.source });

const EvaluateUseBody = Type.Object(
  {
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    requested_action: Type.Literal("destination_use"),
    caller_module: Type.String({ minLength: 1, maxLength: 64 }),
    amount: AmountSchema,
    asset_or_currency: AssetOrCurrencySchema,
  },
  { additionalProperties: false },
);
type EvaluateUseBody = Static<typeof EvaluateUseBody>;

/** Grammar-valid but semantically invalid (`0`) — throws the same VALIDATION_ERROR shape every
 * other WLT-01 route uses for a post-schema business-grammar rejection. */
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

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function clt1RosterConfig(app: FastifyInstance): { baseUrl: string; internalServiceToken: string; fetchImpl?: typeof fetch } {
  const config = app.config as Wlt1Config;
  return { baseUrl: config.clt1BaseUrl, internalServiceToken: config.clt1InternalServiceToken, fetchImpl: config.clt1FetchImpl };
}

function aml1Config(app: FastifyInstance): { baseUrl: string; internalServiceToken: string; fetchImpl?: typeof fetch } {
  const config = app.config as Wlt1Config;
  return { baseUrl: config.aml1BaseUrl, internalServiceToken: config.aml1InternalServiceToken, fetchImpl: config.aml1FetchImpl };
}

async function readAuthoritativeNow(): Promise<Date> {
  const rows = await query<{ now_utc: Date }>(getPool(), `SELECT now() AS now_utc`, []);
  return rows[0]!.now_utc;
}

interface DenyAuditInput {
  destinationId: string;
  clientId: string;
  requestedAction: string;
  callerModule: string;
  reasonCode: Wlt1EvaluateUseDenyReason;
  evaluatedAtUtc: Date;
  /** Limits / Velocity / Concentration / First-Use addition — set ONLY for a LIMIT_POLICY denial
   * (`limit_policy_unavailable` or one of the four breach reasons); `undefined`/absent for every
   * PRE_LIMIT or limit-unrelated denial, which persists all four as `null` (never fabricated). */
  breachType?: string;
  breachScope?: string;
  limitEvaluationId?: string;
  amount?: string;
}

function denyMetadata(input: DenyAuditInput): Record<string, unknown> {
  return {
    decision: "deny",
    reason_code: input.reasonCode,
    destination_id: input.destinationId,
    client_id: input.clientId,
    requested_action: input.requestedAction,
    caller_module: input.callerModule,
    evaluated_at_utc: input.evaluatedAtUtc.toISOString(),
    breach_type: input.breachType ?? null,
    breach_scope: input.breachScope ?? null,
    limit_evaluation_id: input.limitEvaluationId ?? null,
    amount: input.amount ?? null,
  };
}

/** Local short audit-only transaction for a deny reached BEFORE (or independent of) TX-B — G1-G9
 * (wallet) / G1-G7 (fiat) local-gate denies and the P-ROSTER/AML business denies all use this.
 * TX-B-detected denies (state_changed_during_evaluation / evidence_expiring) publish their own
 * audit INSIDE TX-B instead — see the STEP 4 callback below. */
async function auditDeny(input: DenyAuditInput): Promise<void> {
  try {
    await withTransaction(async (client) => {
      await publishAudit(client, {
        event_type: "wlt1.destination_use_evaluated",
        source_module: "WLT-01",
        actor_id: "wlt1_internal_service",
        actor_type: "service",
        entity_type: "destination",
        entity_id: input.destinationId,
        metadata: denyMetadata(input),
      });
    });
  } catch (err) {
    if (err instanceof Wlt1Error) throw err;
    throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
  }
}

interface LimitPreCheckDenyOutcome {
  kind: "deny";
  reasonCode: Wlt1EvaluateUseDenyReason;
  breachType: string;
  breachScope: string;
  limitEvaluationId: string;
}
interface LimitPreCheckAllowOutcome {
  kind: "allow";
  firstUse: boolean;
  clientProfile: LimitProfileRow;
  destinationProfile: LimitProfileRow | null;
}

/** Runs the shared resolve+evaluate sequence (`lib/limits.ts`'s own `runLimitEvaluation`) and, on
 * `policy_unavailable`/`breach`, performs the LIMIT_POLICY write side: exactly one deny
 * `wlt1.limit_evaluation` row (`decision_id = null` — evaluate-use never has a decision yet) plus
 * exactly one `wlt1.limit_denied` audit, both in the SAME transaction as the caller's own TX-B. On
 * `pass`, writes nothing — evaluate-use is a pre-check only; the resolved profile references are
 * bound into the decision INSERT by the caller instead. */
async function performLimitPreCheck(
  client: PoolClient,
  input: { clientId: string; destinationId: string; destinationType: "wallet" | "fiat_payout"; whitelistVersion: number; limitsVersion: number; amount: string; dimension: LimitDimension; evaluatedAtUtc: Date },
): Promise<LimitPreCheckDenyOutcome | LimitPreCheckAllowOutcome> {
  const outcome = await runLimitEvaluation(client, {
    clientId: input.clientId,
    destinationId: input.destinationId,
    whitelistVersion: input.whitelistVersion,
    amount: input.amount,
    dimension: input.dimension,
  });

  if (outcome.kind === "pass") {
    return { kind: "allow", firstUse: outcome.firstUse, clientProfile: outcome.clientProfile, destinationProfile: outcome.destinationProfile };
  }

  const breachType = outcome.kind === "policy_unavailable" ? "policy_unavailable" : outcome.breachType;
  const breachScope = outcome.kind === "policy_unavailable" ? "client" : outcome.breachScope;
  const clientProfile = outcome.kind === "policy_unavailable" ? null : outcome.clientProfile;
  const destinationProfile = outcome.kind === "policy_unavailable" ? null : outcome.destinationProfile;
  const reasonCode: Wlt1EvaluateUseDenyReason = outcome.kind === "policy_unavailable" ? "limit_policy_unavailable" : breachReasonCode(outcome.breachType);

  const limitEvaluationId = mintLimitEvaluationId();
  await insertDenyLimitEvaluation(client, {
    limitEvaluationId,
    decisionId: null,
    clientId: input.clientId,
    destinationId: input.destinationId,
    destinationType: input.destinationType,
    whitelistVersion: input.whitelistVersion,
    limitsVersion: input.limitsVersion,
    amount: input.amount,
    dimension: input.dimension,
    breachType,
    breachScope,
    firstUse: outcome.firstUse,
    clientLimitProfile: clientProfile,
    destinationLimitProfile: destinationProfile,
  });
  await publishAudit(client, {
    event_type: "wlt1.limit_denied",
    source_module: "WLT-01",
    actor_id: "wlt1_internal_service",
    actor_type: "service",
    entity_type: "destination",
    entity_id: input.destinationId,
    metadata: buildLimitDeniedAuditMetadata({
      limitEvaluationId,
      decisionId: null,
      clientId: input.clientId,
      destinationId: input.destinationId,
      destinationType: input.destinationType,
      dimension: input.dimension,
      amount: input.amount,
      breachType,
      breachScope,
      firstUse: outcome.firstUse,
      limitsVersion: input.limitsVersion,
      clientLimitProfileId: clientProfile?.limitProfileId ?? null,
      destinationLimitProfileId: destinationProfile?.limitProfileId ?? null,
      evaluatedAtUtc: input.evaluatedAtUtc,
    }),
  });

  return { kind: "deny", reasonCode, breachType, breachScope, limitEvaluationId };
}

function denyBody(input: DenyAuditInput): Record<string, unknown> {
  return {
    decision: "deny",
    reason_code: input.reasonCode,
    evaluated_at_utc: input.evaluatedAtUtc.toISOString(),
    destination_id: input.destinationId,
    client_id: input.clientId,
    requested_action: input.requestedAction,
  };
}

export async function registerEvaluateUseRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard((app.config as Wlt1Config).wlt1InternalServiceToken);

  app.post(
    "/internal/wlt1/destinations/:destination_id/evaluate-use",
    { preValidation: rejectNonStringAmount, preHandler: requireInternal, schema: { params: DestinationIdParams, body: EvaluateUseBody } },
    async (request, reply) => {
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const body = request.body as EvaluateUseBody;
      assertPoolAvailable();
      const config = app.config as Wlt1Config;
      const validatedAmount = requireValidAmount(body.amount);

      // ---------------------------------------------------------------------------------------
      // STEP 1 — TX-A: local read, no lock, no transaction.
      // ---------------------------------------------------------------------------------------
      const nowA = await readAuthoritativeNow();
      const snapshot = await loadDestinationEvalSnapshot(getPool(), destination_id);
      if (!snapshot || snapshot.clientId !== body.client_id) {
        // G1/G2 — unknown destination and foreign-client destination collapse to the SAME 404, no
        // enumeration oracle. Not a business decision — no audit, this is a technical/routing
        // failure.
        throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
      }

      if (snapshot.destinationType !== WALLET_DESTINATION_ACCEPTED_TYPE && snapshot.destinationType !== FIAT_DESTINATION_ACCEPTED_TYPE) {
        const denyInput: DenyAuditInput = { destinationId: destination_id, clientId: body.client_id, requestedAction: body.requested_action, callerModule: body.caller_module, reasonCode: "action_not_supported", evaluatedAtUtc: nowA };
        await auditDeny(denyInput);
        return reply.code(200).send(successEnvelope(denyBody(denyInput), meta(request)));
      }

      const isFiat = snapshot.destinationType === FIAT_DESTINATION_ACCEPTED_TYPE;

      // =========================================================================================
      // WALLET PATH — byte-identical behavior to the pre-fiat implementation.
      // =========================================================================================
      if (!isFiat) {
        const chainCoverage = await fetchActiveChainCoverage(getPool(), snapshot.chain!, snapshot.network!);
        const screeningA = await loadLatestScreening(getPool(), destination_id);
        const pocVerifiedA = await loadPocVerified(getPool(), destination_id);

        const localGateA = evaluateLocalGates({
          status: snapshot.status,
          destinationType: snapshot.destinationType,
          requestedAction: body.requested_action,
          walletType: snapshot.walletType!,
          chainCoverageOk: chainCoverage !== undefined,
          screening: screeningA,
          pocVerified: pocVerifiedA,
          coolingOffUntilUtc: snapshot.coolingOffUntilUtc,
          nowUtc: nowA,
        });

        if (!localGateA.eligible) {
          const denyInput: DenyAuditInput = { destinationId: destination_id, clientId: body.client_id, requestedAction: body.requested_action, callerModule: body.caller_module, reasonCode: localGateA.reasonCode, evaluatedAtUtc: nowA };
          await auditDeny(denyInput);
          return reply.code(200).send(successEnvelope(denyBody(denyInput), meta(request)));
        }

        const roster = await fetchActiveAuthorisedPartyRefs(clt1RosterConfig(app), body.client_id);
        if (roster.outcome !== "ok" || roster.refs.length === 0) {
          const denyInput: DenyAuditInput = { destinationId: destination_id, clientId: body.client_id, requestedAction: body.requested_action, callerModule: body.caller_module, reasonCode: "aml_subjects_unavailable", evaluatedAtUtc: nowA };
          await auditDeny(denyInput);
          return reply.code(200).send(successEnvelope(denyBody(denyInput), meta(request)));
        }
        if (roster.refs.length > AML1_SUBJECT_REFS_MAX) {
          const denyInput: DenyAuditInput = { destinationId: destination_id, clientId: body.client_id, requestedAction: body.requested_action, callerModule: body.caller_module, reasonCode: "aml_subject_limit_exceeded", evaluatedAtUtc: nowA };
          await auditDeny(denyInput);
          return reply.code(200).send(successEnvelope(denyBody(denyInput), meta(request)));
        }

        const amlResult = await screenPreTransaction(aml1Config(app), {
          clientId: body.client_id,
          subjectRefs: roster.refs,
          destinationRef: destination_id,
          chain: snapshot.chain!,
          network: snapshot.network!,
          nowUtc: nowA,
        });

        if (amlResult.outcome === "unavailable") {
          throw new Wlt1Error("WLT1_AML_GATE_UNAVAILABLE");
        }
        if (amlResult.outcome === "not_allow") {
          const denyInput: DenyAuditInput = { destinationId: destination_id, clientId: body.client_id, requestedAction: body.requested_action, callerModule: body.caller_module, reasonCode: "aml_not_allowed", evaluatedAtUtc: nowA };
          await auditDeny(denyInput);
          return reply.code(200).send(successEnvelope(denyBody(denyInput), meta(request)));
        }

        type TxBOutcome =
          | { kind: "deny"; reasonCode: Wlt1EvaluateUseDenyReason; evaluatedAtUtc: Date }
          | { kind: "allow"; decisionId: string; rawToken: string; issuedAtUtc: Date; expiresAtUtc: Date; amlDecisionId: string; firstUse: boolean; limitsVersion: number };

        let outcome: TxBOutcome;
        try {
          outcome = await withTransaction(async (client) => {
            // Limits / Velocity / Concentration / First-Use — the per-client advisory lock MUST
            // be acquired FIRST, before the destination row lock, per the frozen evaluate-use lock
            // order. body.client_id is caller-supplied but non-authoritative here — the existing
            // `locked.clientId !== body.client_id` state-drift check immediately below still gates
            // everything downstream, so an incorrect client_id can only ever lock an unrelated key
            // and then be denied, never bypass anything.
            await acquireClientLimitLock(client, body.client_id);
            const locked = await loadDestinationEvalSnapshotForUpdate(client, destination_id);
            const nowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
            const nowB = nowRows[0]!.now_utc;

            const publishDeny = async (reasonCode: Wlt1EvaluateUseDenyReason, limitEvidence?: { breachType: string; breachScope: string; limitEvaluationId: string }): Promise<TxBOutcome> => {
              await publishAudit(client, {
                event_type: "wlt1.destination_use_evaluated",
                source_module: "WLT-01",
                actor_id: "wlt1_internal_service",
                actor_type: "service",
                entity_type: "destination",
                entity_id: destination_id,
                metadata: denyMetadata({
                  destinationId: destination_id,
                  clientId: body.client_id,
                  requestedAction: body.requested_action,
                  callerModule: body.caller_module,
                  reasonCode,
                  evaluatedAtUtc: nowB,
                  breachType: limitEvidence?.breachType,
                  breachScope: limitEvidence?.breachScope,
                  limitEvaluationId: limitEvidence?.limitEvaluationId,
                  amount: limitEvidence ? validatedAmount : undefined,
                }),
              });
              return { kind: "deny", reasonCode, evaluatedAtUtc: nowB };
            };

            if (!locked || locked.clientId !== body.client_id || locked.status === "revoked" || hasEvalStateDrift(snapshot, locked)) {
              return publishDeny("state_changed_during_evaluation");
            }

            const rechainCoverage = await fetchActiveChainCoverage(client, locked.chain!, locked.network!);
            const rescreening = await loadLatestScreening(client, destination_id);
            const repocVerified = await loadPocVerified(client, destination_id);

            const localGateB = evaluateLocalGates({
              status: locked.status,
              destinationType: locked.destinationType,
              requestedAction: body.requested_action,
              walletType: locked.walletType!,
              chainCoverageOk: rechainCoverage !== undefined,
              screening: rescreening,
              pocVerified: repocVerified,
              coolingOffUntilUtc: locked.coolingOffUntilUtc,
              nowUtc: nowB,
            });
            if (!localGateB.eligible) {
              return publishDeny("state_changed_during_evaluation");
            }
            if (localGateB.screeningResultId !== localGateA.screeningResultId) {
              return publishDeny("state_changed_during_evaluation");
            }

            let pocChallengeId: string | null = null;
            if (isPocSupportedWalletType(locked.walletType!)) {
              const currentProof = await getCurrentProofOfControl(client, destination_id);
              if (currentProof.status !== "verified") {
                return publishDeny("state_changed_during_evaluation");
              }
              pocChallengeId = currentProof.challengeId;
            }

            const ttlMs = config.decisionTokenTtlMinutes * 60_000;
            const candidateExpiryMs = Math.min(
              nowB.getTime() + ttlMs,
              amlResult.validUntilUtc.getTime(),
              rescreening!.validUntilUtc !== null ? rescreening!.validUntilUtc.getTime() : Number.POSITIVE_INFINITY,
            );
            if (candidateExpiryMs <= nowB.getTime()) {
              return publishDeny("evidence_expiring");
            }

            let finalDestinationStatusVersion = locked.destinationStatusVersion;
            let finalWhitelistVersion = locked.whitelistVersion;
            if (locked.status === "approved_pending_cooling") {
              finalDestinationStatusVersion = locked.destinationStatusVersion + 1;
              finalWhitelistVersion = locked.whitelistVersion + 1;
              await query(
                client,
                `UPDATE wlt1.destination SET status = 'active', destination_status_version = $1, whitelist_version = $2, updated_at_utc = $3 WHERE destination_id = $4`,
                [finalDestinationStatusVersion, finalWhitelistVersion, nowB.toISOString(), destination_id],
              );
            }

            // Limits / Velocity / Concentration / First-Use — step 5 of the frozen lock order (run
            // limit pre-check), after every existing gate has passed and AFTER lazy active
            // promotion so first-use/limits binding always uses the FINAL whitelist_version this
            // decision will itself carry.
            const walletDimension: LimitDimension = { destinationType: "wallet", assetOrCurrency: body.asset_or_currency, chain: locked.chain!, network: locked.network!, rail: null };
            const limitOutcome = await performLimitPreCheck(client, {
              clientId: body.client_id,
              destinationId: destination_id,
              destinationType: "wallet",
              whitelistVersion: finalWhitelistVersion,
              limitsVersion: locked.limitsVersion,
              amount: validatedAmount,
              dimension: walletDimension,
              evaluatedAtUtc: nowB,
            });
            if (limitOutcome.kind === "deny") {
              return publishDeny(limitOutcome.reasonCode, { breachType: limitOutcome.breachType, breachScope: limitOutcome.breachScope, limitEvaluationId: limitOutcome.limitEvaluationId });
            }

            const decisionId = mintDecisionId();
            const rawToken = mintDecisionToken();
            const tokenHash = hashToken(rawToken);
            const expiresAtUtc = new Date(candidateExpiryMs);

            await query(
              client,
              `INSERT INTO wlt1.destination_decision
                 (decision_id, token_hash, destination_id, client_id, requested_action, decision, aml_decision_id, aml_valid_until_utc,
                  screening_result_id, poc_challenge_id, destination_status_version, whitelist_version, revocation_epoch, chain, network,
                  destination_type, rail, currency, beneficiary_verification_id,
                  issued_at_utc, expires_at_utc,
                  amount, asset_or_currency, limits_version,
                  client_limit_profile_id, client_limit_profile_version, destination_limit_profile_id, destination_limit_profile_version)
               VALUES ($1,$2,$3,$4,$5,'allow',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NULL,NULL,NULL,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
              [
                decisionId,
                tokenHash,
                destination_id,
                body.client_id,
                body.requested_action,
                amlResult.decisionId,
                amlResult.validUntilUtc.toISOString(),
                localGateB.screeningResultId,
                pocChallengeId,
                finalDestinationStatusVersion,
                finalWhitelistVersion,
                locked.revocationEpoch,
                locked.chain,
                locked.network,
                WALLET_DESTINATION_ACCEPTED_TYPE,
                nowB.toISOString(),
                expiresAtUtc.toISOString(),
                validatedAmount,
                body.asset_or_currency,
                locked.limitsVersion,
                limitOutcome.clientProfile.limitProfileId,
                limitOutcome.clientProfile.version,
                limitOutcome.destinationProfile?.limitProfileId ?? null,
                limitOutcome.destinationProfile?.version ?? null,
              ],
            );

            await publishAudit(client, {
              event_type: "wlt1.destination_use_evaluated",
              source_module: "WLT-01",
              actor_id: "wlt1_internal_service",
              actor_type: "service",
              entity_type: "destination",
              entity_id: destination_id,
              metadata: {
                decision: "allow",
                decision_id: decisionId,
                destination_id: destination_id,
                client_id: body.client_id,
                requested_action: body.requested_action,
                caller_module: body.caller_module,
                aml_decision_id: amlResult.decisionId,
                expires_at_utc: expiresAtUtc.toISOString(),
                evaluated_at_utc: nowB.toISOString(),
                amount: validatedAmount,
                asset_or_currency: body.asset_or_currency,
                limits_version: locked.limitsVersion,
                first_use: limitOutcome.firstUse,
              },
            });

            return { kind: "allow", decisionId, rawToken, issuedAtUtc: nowB, expiresAtUtc, amlDecisionId: amlResult.decisionId, firstUse: limitOutcome.firstUse, limitsVersion: locked.limitsVersion };
          });
        } catch (err) {
          if (err instanceof Wlt1Error) throw err;
          throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
        }

        if (outcome.kind === "deny") {
          const denyInput: DenyAuditInput = { destinationId: destination_id, clientId: body.client_id, requestedAction: body.requested_action, callerModule: body.caller_module, reasonCode: outcome.reasonCode, evaluatedAtUtc: outcome.evaluatedAtUtc };
          return reply.code(200).send(successEnvelope(denyBody(denyInput), meta(request)));
        }

        return reply.code(200).send(
          successEnvelope(
            {
              decision: "allow",
              decision_id: outcome.decisionId,
              decision_token: outcome.rawToken,
              issued_at_utc: outcome.issuedAtUtc.toISOString(),
              expires_at_utc: outcome.expiresAtUtc.toISOString(),
              destination_id: destination_id,
              client_id: body.client_id,
              requested_action: body.requested_action,
              aml_decision_id: outcome.amlDecisionId,
              first_use: outcome.firstUse,
              limits_version: outcome.limitsVersion,
            },
            meta(request),
          ),
        );
      }

      // =========================================================================================
      // FIAT PATH (APAC) — mirrors the wallet path's own structure exactly, gate set G1-G7.
      // =========================================================================================
      const expectedBeneficiaryNameHash = computeBeneficiaryNameHash(snapshot.beneficiaryNameNormalized!);
      const expectedAccountIdentifierHash = snapshot.accountIdentifierHash!;

      const railCoverageA = await fetchActiveFiatRailCoverage(getPool(), snapshot.rail!, snapshot.bankCountry!, snapshot.currency!);
      const fiatScreeningA = await loadLatestFiatScreeningResult(getPool(), destination_id);
      const fiatVerificationA = await loadLatestBeneficiaryVerification(getPool(), destination_id);

      const fiatGateA = evaluateFiatLocalGates({
        status: snapshot.status,
        destinationType: snapshot.destinationType,
        requestedAction: body.requested_action,
        railCoverageOk: railCoverageA !== undefined,
        screening: fiatScreeningA,
        verification: fiatVerificationA,
        expectedBeneficiaryNameHash,
        expectedAccountIdentifierHash,
        coolingOffUntilUtc: snapshot.coolingOffUntilUtc,
        nowUtc: nowA,
      });

      if (!fiatGateA.eligible) {
        const denyInput: DenyAuditInput = { destinationId: destination_id, clientId: body.client_id, requestedAction: body.requested_action, callerModule: body.caller_module, reasonCode: fiatGateA.reasonCode, evaluatedAtUtc: nowA };
        await auditDeny(denyInput);
        return reply.code(200).send(successEnvelope(denyBody(denyInput), meta(request)));
      }

      const roster = await fetchActiveAuthorisedPartyRefs(clt1RosterConfig(app), body.client_id);
      if (roster.outcome !== "ok" || roster.refs.length === 0) {
        const denyInput: DenyAuditInput = { destinationId: destination_id, clientId: body.client_id, requestedAction: body.requested_action, callerModule: body.caller_module, reasonCode: "aml_subjects_unavailable", evaluatedAtUtc: nowA };
        await auditDeny(denyInput);
        return reply.code(200).send(successEnvelope(denyBody(denyInput), meta(request)));
      }
      if (roster.refs.length > AML1_SUBJECT_REFS_MAX) {
        const denyInput: DenyAuditInput = { destinationId: destination_id, clientId: body.client_id, requestedAction: body.requested_action, callerModule: body.caller_module, reasonCode: "aml_subject_limit_exceeded", evaluatedAtUtc: nowA };
        await auditDeny(denyInput);
        return reply.code(200).send(successEnvelope(denyBody(denyInput), meta(request)));
      }

      // Fiat AML context omits chain/network entirely — AML-01's own gate treats both as optional.
      const amlResult = await screenPreTransaction(aml1Config(app), {
        clientId: body.client_id,
        subjectRefs: roster.refs,
        destinationRef: destination_id,
        nowUtc: nowA,
      });

      if (amlResult.outcome === "unavailable") {
        throw new Wlt1Error("WLT1_AML_GATE_UNAVAILABLE");
      }
      if (amlResult.outcome === "not_allow") {
        const denyInput: DenyAuditInput = { destinationId: destination_id, clientId: body.client_id, requestedAction: body.requested_action, callerModule: body.caller_module, reasonCode: "aml_not_allowed", evaluatedAtUtc: nowA };
        await auditDeny(denyInput);
        return reply.code(200).send(successEnvelope(denyBody(denyInput), meta(request)));
      }

      type FiatTxBOutcome =
        | { kind: "deny"; reasonCode: Wlt1EvaluateUseDenyReason; evaluatedAtUtc: Date }
        | { kind: "allow"; decisionId: string; rawToken: string; issuedAtUtc: Date; expiresAtUtc: Date; amlDecisionId: string; firstUse: boolean; limitsVersion: number };

      let fiatOutcome: FiatTxBOutcome;
      try {
        fiatOutcome = await withTransaction(async (client) => {
          // Limits / Velocity / Concentration / First-Use — same lock-order/safety rationale as
          // the wallet path's own identical comment above.
          await acquireClientLimitLock(client, body.client_id);
          const locked = await loadDestinationEvalSnapshotForUpdate(client, destination_id);
          const nowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
          const nowB = nowRows[0]!.now_utc;

          const publishDeny = async (reasonCode: Wlt1EvaluateUseDenyReason, limitEvidence?: { breachType: string; breachScope: string; limitEvaluationId: string }): Promise<FiatTxBOutcome> => {
            await publishAudit(client, {
              event_type: "wlt1.destination_use_evaluated",
              source_module: "WLT-01",
              actor_id: "wlt1_internal_service",
              actor_type: "service",
              entity_type: "destination",
              entity_id: destination_id,
              metadata: denyMetadata({
                destinationId: destination_id,
                clientId: body.client_id,
                requestedAction: body.requested_action,
                callerModule: body.caller_module,
                reasonCode,
                evaluatedAtUtc: nowB,
                breachType: limitEvidence?.breachType,
                breachScope: limitEvidence?.breachScope,
                limitEvaluationId: limitEvidence?.limitEvaluationId,
                amount: limitEvidence ? validatedAmount : undefined,
              }),
            });
            return { kind: "deny", reasonCode, evaluatedAtUtc: nowB };
          };

          if (!locked || locked.clientId !== body.client_id || locked.status === "revoked" || hasEvalStateDrift(snapshot, locked)) {
            return publishDeny("state_changed_during_evaluation");
          }

          const rerailCoverage = await fetchActiveFiatRailCoverage(client, locked.rail!, locked.bankCountry!, locked.currency!);
          const rescreening = await loadLatestFiatScreeningResult(client, destination_id);
          const reverification = await loadLatestBeneficiaryVerification(client, destination_id);

          const fiatGateB = evaluateFiatLocalGates({
            status: locked.status,
            destinationType: locked.destinationType,
            requestedAction: body.requested_action,
            railCoverageOk: rerailCoverage !== undefined,
            screening: rescreening,
            verification: reverification,
            expectedBeneficiaryNameHash,
            expectedAccountIdentifierHash,
            coolingOffUntilUtc: locked.coolingOffUntilUtc,
            nowUtc: nowB,
          });
          if (!fiatGateB.eligible) {
            return publishDeny("state_changed_during_evaluation");
          }
          if (fiatGateB.screeningResultId !== fiatGateA.screeningResultId || fiatGateB.beneficiaryVerificationId !== fiatGateA.beneficiaryVerificationId) {
            return publishDeny("state_changed_during_evaluation");
          }

          const ttlMs = config.decisionTokenTtlMinutes * 60_000;
          const candidateExpiryMs = Math.min(
            nowB.getTime() + ttlMs,
            amlResult.validUntilUtc.getTime(),
            rescreening!.validUntilUtc !== null ? rescreening!.validUntilUtc.getTime() : Number.POSITIVE_INFINITY,
            reverification!.validUntilUtc !== null ? reverification!.validUntilUtc.getTime() : Number.POSITIVE_INFINITY,
          );
          if (candidateExpiryMs <= nowB.getTime()) {
            return publishDeny("evidence_expiring");
          }

          let finalDestinationStatusVersion = locked.destinationStatusVersion;
          let finalWhitelistVersion = locked.whitelistVersion;
          if (locked.status === "approved_pending_cooling") {
            finalDestinationStatusVersion = locked.destinationStatusVersion + 1;
            finalWhitelistVersion = locked.whitelistVersion + 1;
            await query(
              client,
              `UPDATE wlt1.destination SET status = 'active', destination_status_version = $1, whitelist_version = $2, updated_at_utc = $3 WHERE destination_id = $4`,
              [finalDestinationStatusVersion, finalWhitelistVersion, nowB.toISOString(), destination_id],
            );
          }

          // Limits / Velocity / Concentration / First-Use — PRE_LIMIT dimension binding: the
          // caller-supplied asset_or_currency MUST equal the server-owned destination currency.
          // Never a cross-table CHECK; enforced here in application code, before any limit work,
          // writing NO limit_evaluation/limit_denied evidence.
          if (body.asset_or_currency !== locked.currency) {
            return publishDeny("asset_dimension_invalid");
          }

          // Step 5 of the frozen lock order — after every existing gate passes and AFTER lazy
          // active promotion, so first-use/limits binding always uses the FINAL whitelist_version
          // this decision will itself carry.
          const fiatDimension: LimitDimension = { destinationType: "fiat_payout", assetOrCurrency: locked.currency!, chain: null, network: null, rail: locked.rail! };
          const limitOutcome = await performLimitPreCheck(client, {
            clientId: body.client_id,
            destinationId: destination_id,
            destinationType: "fiat_payout",
            whitelistVersion: finalWhitelistVersion,
            limitsVersion: locked.limitsVersion,
            amount: validatedAmount,
            dimension: fiatDimension,
            evaluatedAtUtc: nowB,
          });
          if (limitOutcome.kind === "deny") {
            return publishDeny(limitOutcome.reasonCode, { breachType: limitOutcome.breachType, breachScope: limitOutcome.breachScope, limitEvaluationId: limitOutcome.limitEvaluationId });
          }

          const decisionId = mintDecisionId();
          const rawToken = mintDecisionToken();
          const tokenHash = hashToken(rawToken);
          const expiresAtUtc = new Date(candidateExpiryMs);

          await query(
            client,
            `INSERT INTO wlt1.destination_decision
               (decision_id, token_hash, destination_id, client_id, requested_action, decision, aml_decision_id, aml_valid_until_utc,
                screening_result_id, poc_challenge_id, destination_status_version, whitelist_version, revocation_epoch, chain, network,
                destination_type, rail, currency, beneficiary_verification_id,
                issued_at_utc, expires_at_utc,
                amount, asset_or_currency, limits_version,
                client_limit_profile_id, client_limit_profile_version, destination_limit_profile_id, destination_limit_profile_version)
             VALUES ($1,$2,$3,$4,$5,'allow',$6,$7,$8,NULL,$9,$10,$11,NULL,NULL,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
            [
              decisionId,
              tokenHash,
              destination_id,
              body.client_id,
              body.requested_action,
              amlResult.decisionId,
              amlResult.validUntilUtc.toISOString(),
              fiatGateB.screeningResultId,
              finalDestinationStatusVersion,
              finalWhitelistVersion,
              locked.revocationEpoch,
              FIAT_DESTINATION_ACCEPTED_TYPE,
              locked.rail,
              locked.currency,
              fiatGateB.beneficiaryVerificationId,
              nowB.toISOString(),
              expiresAtUtc.toISOString(),
              validatedAmount,
              body.asset_or_currency,
              locked.limitsVersion,
              limitOutcome.clientProfile.limitProfileId,
              limitOutcome.clientProfile.version,
              limitOutcome.destinationProfile?.limitProfileId ?? null,
              limitOutcome.destinationProfile?.version ?? null,
            ],
          );

          await publishAudit(client, {
            event_type: "wlt1.destination_use_evaluated",
            source_module: "WLT-01",
            actor_id: "wlt1_internal_service",
            actor_type: "service",
            entity_type: "destination",
            entity_id: destination_id,
            metadata: {
              decision: "allow",
              decision_id: decisionId,
              destination_id: destination_id,
              client_id: body.client_id,
              requested_action: body.requested_action,
              caller_module: body.caller_module,
              aml_decision_id: amlResult.decisionId,
              expires_at_utc: expiresAtUtc.toISOString(),
              evaluated_at_utc: nowB.toISOString(),
              amount: validatedAmount,
              asset_or_currency: body.asset_or_currency,
              limits_version: locked.limitsVersion,
              first_use: limitOutcome.firstUse,
            },
          });

          return { kind: "allow", decisionId, rawToken, issuedAtUtc: nowB, expiresAtUtc, amlDecisionId: amlResult.decisionId, firstUse: limitOutcome.firstUse, limitsVersion: locked.limitsVersion };
        });
      } catch (err) {
        if (err instanceof Wlt1Error) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (fiatOutcome.kind === "deny") {
        const denyInput: DenyAuditInput = { destinationId: destination_id, clientId: body.client_id, requestedAction: body.requested_action, callerModule: body.caller_module, reasonCode: fiatOutcome.reasonCode, evaluatedAtUtc: fiatOutcome.evaluatedAtUtc };
        return reply.code(200).send(successEnvelope(denyBody(denyInput), meta(request)));
      }

      return reply.code(200).send(
        successEnvelope(
          {
            decision: "allow",
            decision_id: fiatOutcome.decisionId,
            decision_token: fiatOutcome.rawToken,
            issued_at_utc: fiatOutcome.issuedAtUtc.toISOString(),
            expires_at_utc: fiatOutcome.expiresAtUtc.toISOString(),
            destination_id: destination_id,
            client_id: body.client_id,
            requested_action: body.requested_action,
            aml_decision_id: fiatOutcome.amlDecisionId,
            first_use: fiatOutcome.firstUse,
            limits_version: fiatOutcome.limitsVersion,
          },
          meta(request),
        ),
      );
    },
  );
}
