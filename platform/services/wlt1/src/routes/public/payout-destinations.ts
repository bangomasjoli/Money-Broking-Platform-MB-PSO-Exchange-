/**
 * WLT-01 Public Client Surface — `POST /wlt1/payout-destinations`. A client-safe public
 * projection of the already-accepted internal fiat-payout registration capability
 * (`routes/payout-destinations.ts`) — same underlying lib functions (country-profile resolution,
 * account/BIC canonicalisation, rail-coverage, beneficiary-verification/fiat-screening provider
 * calls), same TX-1/provider-phase/TX-2 shape, same audit events. `client_id` is ALWAYS
 * server-derived (no `client_id` field in this schema). Same frozen "supported-but-inactive rail
 * collapses to the SAME `WLT1_FIAT_RAIL_NOT_SUPPORTED` as unsupported" behaviour as the internal
 * route (`lib/fiat/rail-coverage.ts`'s own `fetchActiveFiatRailCoverage` already requires BOTH
 * `coverage_status='supported'` AND `activation_status='active'`) — no new error code, no
 * capability-catalogue disclosure, no inactive-rail execution.
 *
 * ORDER: requirePublicClientAuthority -> FND-01 rate-limit check (MUTATE_REGISTER/client) ->
 * canonicalisation -> CLT-01 client-status check -> TX-1 (idempotency -> rail-coverage re-read ->
 * natural-key re-check -> inserts -> audit -> idempotency completion -> commit) -> provider phase
 * (fresh registration only) -> TX-2 -> public-safe response.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, beginIdempotent, completeIdempotent, getPool, publishAudit, query, successEnvelope, withTransaction, type IdempotencyScope } from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../../plugins/request-context.js";
import { makePublicClientAuthorityGuard, checkPublicRateLimit, publicIdempotencyActorId } from "../../plugins/public-auth.js";
import { APAC_BANK_COUNTRIES, resolveCountryProfile, type ApacBankCountry } from "../../lib/fiat/country-profiles.js";
import {
  buildCanonicalAccountIdentity,
  canonicaliseAccountIdentifier,
  canonicaliseBic,
  canonicalStringify,
  computeAccountIdentifierHash,
  maskAccountIdentifier,
  validateBranchIdentifier,
} from "../../lib/fiat/account-identifier.js";
import { normalizeBeneficiaryName, computeBeneficiaryNameHash } from "../../lib/fiat/beneficiary-name.js";
import { deriveFiatAccountEncryptionKey, encryptFiatAccountIdentifier } from "../../lib/fiat/encryption.js";
import { fetchActiveFiatRailCoverage } from "../../lib/fiat/rail-coverage.js";
import { checkClientStatus, type Clt1ClientConfig } from "../../lib/clt1-client.js";
import {
  FIAT_DESTINATION_TYPE,
  acquireDestinationLock,
  buildBeneficiaryVerificationAuditMetadata,
  buildFiatRegistrationAuditMetadata,
  buildFiatScreeningAuditMetadata,
  computeEffectiveValidUntil,
  computeNaturalKeyHash,
  fetchFiatPayoutDestinationById,
  fetchFiatPayoutDestinationByNaturalKey,
  promoteDraftToPendingReview,
  updateFiatDestinationVerificationStatus,
  persistBeneficiaryVerificationResult,
  persistFiatScreeningResult,
  type FiatPayoutDestinationRow,
} from "../../lib/fiat-destination.js";
import { isDuplicateNaturalKeyViolation, newDestinationId, takeRegistrationLock, IDEMPOTENCY_REFUSED_RESULT_REF } from "../../lib/destinations.js";
import { resolveBeneficiaryVerificationProvider, verifyViaProvider } from "../../lib/beneficiary-verification/registry.js";
import { resolveFiatScreeningProvider, screenFiatDestinationViaProvider } from "../../lib/fiat-screening/registry.js";
import { publicFiatDestinationResponse } from "../../lib/public/dto.js";
import { Wlt1Error } from "../../lib/errors.js";
import type { Wlt1Config } from "../../config.js";

const BENEFICIARY_TYPES = ["individual", "corporate"] as const;

const RegisterFiatPayoutDestinationBody = Type.Object(
  {
    beneficiary_name: Type.String({ minLength: 1, maxLength: 140 }),
    beneficiary_type: Type.Union(BENEFICIARY_TYPES.map((v) => Type.Literal(v))),
    account_identifier_type: Type.Literal("local_account"),
    account_identifier: Type.String({ minLength: 1, maxLength: 34 }),
    bank_identifier: Type.String({ minLength: 1, maxLength: 16 }),
    bank_identifier_type: Type.Literal("bic"),
    branch_identifier: Type.Optional(Type.String({ minLength: 1, maxLength: 8 })),
    bank_country: Type.Union(APAC_BANK_COUNTRIES.map((v) => Type.Literal(v))),
    currency: Type.Union(["MYR", "SGD", "HKD", "IDR"].map((v) => Type.Literal(v))),
    rail: Type.Union(["apac_local_my", "apac_local_sg", "apac_local_hk", "apac_local_id"].map((v) => Type.Literal(v))),
  },
  { additionalProperties: false },
);
type RegisterFiatPayoutDestinationBody = Static<typeof RegisterFiatPayoutDestinationBody>;

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function clt1Config(config: Wlt1Config) {
  return { baseUrl: config.clt1BaseUrl, internalServiceToken: config.clt1InternalServiceToken, fetchImpl: config.clt1FetchImpl } satisfies Clt1ClientConfig;
}

function invalidAccount(issue: string): never {
  throw new Wlt1Error("WLT1_ACCOUNT_IDENTIFIER_INVALID", { details: [{ issue }] });
}

function validateAndCanonicalise(body: RegisterFiatPayoutDestinationBody) {
  const profile = resolveCountryProfile(body.bank_country);
  if (!profile) invalidAccount("unknown_bank_country");
  if (body.currency !== profile!.currency) invalidAccount("currency_rail_country_mismatch");
  if (body.rail !== profile!.rail) invalidAccount("currency_rail_country_mismatch");

  const account = canonicaliseAccountIdentifier(body.account_identifier, profile!);
  if (!account.ok) invalidAccount(account.reasonCode);

  const bic = canonicaliseBic(body.bank_identifier, body.bank_country as ApacBankCountry);
  if (!bic.ok) invalidAccount(bic.reasonCode);

  const branch = validateBranchIdentifier(body.branch_identifier, profile!);
  if (!branch.ok) invalidAccount(branch.reasonCode);

  const identity = buildCanonicalAccountIdentity({
    accountIdentifier: account.canonical,
    bankCountry: body.bank_country as ApacBankCountry,
    bankIdentifier: bic.canonical,
    branchIdentifier: branch.canonical,
  });
  const accountIdentifierHash = computeAccountIdentifierHash(identity);
  const accountIdentifierMasked = maskAccountIdentifier(account.canonical);
  const beneficiaryNameNormalized = normalizeBeneficiaryName(body.beneficiary_name);
  const beneficiaryNameHash = computeBeneficiaryNameHash(beneficiaryNameNormalized);

  return { profile: profile!, identity, accountIdentifierHash, accountIdentifierMasked, beneficiaryNameNormalized, beneficiaryNameHash };
}

type RegistrationOutcome = { kind: "created" | "idempotent_replay"; row: FiatPayoutDestinationRow } | { kind: "duplicate" };

export async function registerPublicFiatPayoutDestinationRoutes(app: FastifyInstance): Promise<void> {
  const requireAuthority = makePublicClientAuthorityGuard();

  app.post(
    "/wlt1/payout-destinations",
    { preHandler: requireAuthority, schema: { body: RegisterFiatPayoutDestinationBody } },
    async (request, reply) => {
      assertPoolAvailable();
      const config = app.config as Wlt1Config;
      const { clientId, iamUserId } = request.publicAuth!;
      const body = request.body as RegisterFiatPayoutDestinationBody;
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = iamUserId;

      await checkPublicRateLimit(config, { bucket: "MUTATE_REGISTER", subjectType: "client", subjectId: clientId });

      const canon = validateAndCanonicalise(body);

      const clt = await checkClientStatus(clt1Config(config), clientId);
      if (!clt.eligible) {
        throw new Wlt1Error(clt.reasonCode === "clt1_unavailable" ? "WLT1_CLT1_UNAVAILABLE" : "WLT1_CLIENT_STATUS_BLOCKED");
      }

      const naturalKeyHash = computeNaturalKeyHash(clientId, FIAT_DESTINATION_TYPE, canon.accountIdentifierHash);

      const idemScope: IdempotencyScope = {
        // Binds actor + derived client authority — see `publicIdempotencyActorId`'s own header
        // comment (`plugins/public-auth.ts`). `actor_id` here is an idempotency-uniqueness key
        // only; audit attribution below always uses the plain `actorId` (iamUserId).
        actorId: publicIdempotencyActorId(actorId, clientId),
        actorType: "user",
        action: "wlt1.public.fiat_payout_destination.register",
        key: idempotencyKey,
        request: body,
        sourceModule: "WLT-01",
      };

      let outcome: RegistrationOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          await takeRegistrationLock(client, clientId);

          const idem = await beginIdempotent(client, idemScope);
          if (idem.status === "duplicate") {
            if (idem.resultRef === IDEMPOTENCY_REFUSED_RESULT_REF) {
              return { kind: "duplicate" };
            }
            const existingRow = await fetchFiatPayoutDestinationById(client, idem.resultRef as string);
            if (!existingRow) {
              throw new AppError("INTERNAL_ERROR", { message: "Idempotent replay target destination could not be resolved." });
            }
            return { kind: "idempotent_replay", row: existingRow };
          }

          const coverage = await fetchActiveFiatRailCoverage(client, canon.profile.rail, canon.profile.bankCountry, canon.profile.currency);
          if (!coverage) {
            throw new Wlt1Error("WLT1_FIAT_RAIL_NOT_SUPPORTED");
          }

          const existing = await fetchFiatPayoutDestinationByNaturalKey(client, naturalKeyHash);
          if (existing) {
            await publishAudit(client, {
              event_type: "wlt1.destination_registration_refused",
              source_module: "WLT-01",
              actor_id: actorId,
              actor_type: "user",
              entity_type: "destination_registration",
              entity_id: existing.destination_id,
              metadata: { client_id: clientId, destination_type: FIAT_DESTINATION_TYPE, reason_code: "destination_already_registered" },
            });
            await completeIdempotent(client, idemScope, IDEMPOTENCY_REFUSED_RESULT_REF);
            return { kind: "duplicate" };
          }

          const destinationId = newDestinationId();

          try {
            await query(
              client,
              `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status, client_status_ref)
               VALUES ($1, $2, $3, $4, 'draft', $5)`,
              [destinationId, clientId, FIAT_DESTINATION_TYPE, naturalKeyHash, clt.status],
            );
          } catch (err) {
            if (isDuplicateNaturalKeyViolation(err)) {
              throw new Wlt1Error("WLT1_DESTINATION_DUPLICATE", { cause: err });
            }
            throw err;
          }

          const encKey = deriveFiatAccountEncryptionKey(config.fiatEncKey);
          const encrypted = encryptFiatAccountIdentifier(canonicalStringify(canon.identity), encKey, destinationId);

          await query(
            client,
            `INSERT INTO wlt1.fiat_payout_destination
               (destination_id, beneficiary_name, beneficiary_name_normalized, beneficiary_type, bank_country, bank_identifier, bank_identifier_type,
                branch_identifier, account_identifier_type, account_identifier_masked, account_identifier_hash, account_identifier_encrypted, currency, rail)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              destinationId,
              body.beneficiary_name,
              canon.beneficiaryNameNormalized,
              body.beneficiary_type,
              canon.profile.bankCountry,
              canon.identity.bank_identifier,
              "bic",
              canon.identity.branch_identifier ?? null,
              "local_account",
              canon.accountIdentifierMasked,
              canon.accountIdentifierHash,
              encrypted,
              canon.profile.currency,
              canon.profile.rail,
            ],
          );

          await publishAudit(client, {
            event_type: "wlt1.fiat_payout_destination_registered",
            source_module: "WLT-01",
            actor_id: actorId,
            actor_type: "user",
            entity_type: "destination",
            entity_id: destinationId,
            metadata: buildFiatRegistrationAuditMetadata({
              destinationId,
              clientId,
              bankCountry: canon.profile.bankCountry,
              currency: canon.profile.currency,
              rail: canon.profile.rail,
              bankIdentifier: canon.identity.bank_identifier,
              branchIdentifier: canon.identity.branch_identifier ?? null,
              accountIdentifierMasked: canon.accountIdentifierMasked,
              beneficiaryType: body.beneficiary_type,
            }),
          });

          await completeIdempotent(client, idemScope, destinationId);

          const row = await fetchFiatPayoutDestinationById(client, destinationId);
          if (!row) throw new AppError("INTERNAL_ERROR", { message: "Newly-registered fiat destination could not be resolved." });
          return { kind: "created", row };
        });
      } catch (err) {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "duplicate") {
        throw new Wlt1Error("WLT1_DESTINATION_DUPLICATE");
      }

      let finalRow = outcome.row;

      if (outcome.kind === "created") {
        const destinationId = outcome.row.destination_id;

        const verificationProvider = resolveBeneficiaryVerificationProvider(config.beneficiaryVerificationProviderId);
        const verificationOutcome = await verifyViaProvider(verificationProvider, {
          beneficiaryNameNormalized: canon.beneficiaryNameNormalized,
          beneficiaryType: body.beneficiary_type,
          bankCountry: canon.profile.bankCountry,
          bankIdentifier: canon.identity.bank_identifier,
          branchIdentifier: canon.identity.branch_identifier,
          accountIdentifier: canon.identity.account_identifier,
          accountIdentifierType: "local_account",
          verificationReferenceId: destinationId,
        });

        const screeningProvider = resolveFiatScreeningProvider(config.fiatScreeningProviderId);
        const screeningOutcome = await screenFiatDestinationViaProvider(screeningProvider, {
          beneficiaryNameNormalized: canon.beneficiaryNameNormalized,
          beneficiaryType: body.beneficiary_type,
          bankCountry: canon.profile.bankCountry,
          bankIdentifier: canon.identity.bank_identifier,
          screeningReferenceId: destinationId,
        });

        try {
          await withTransaction(async (client) => {
            await acquireDestinationLock(client, destinationId);
            const nowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
            const nowUtc = nowRows[0]!.now_utc;

            let anyTerminal = false;

            if (verificationOutcome.kind === "completed") {
              const issuedAtUtc = new Date(verificationOutcome.result.issuedAtUtc);
              const validUntilUtc = computeEffectiveValidUntil(
                issuedAtUtc,
                verificationOutcome.result.validUntilUtc ? new Date(verificationOutcome.result.validUntilUtc) : null,
                config.beneficiaryVerificationValidityHours,
              );
              const verificationRow = await persistBeneficiaryVerificationResult(client, {
                destinationId,
                providerId: verificationProvider.providerId,
                providerAdaptorVersion: verificationProvider.adaptorVersion,
                result: verificationOutcome.result.result,
                matchScore: verificationOutcome.result.matchScore,
                beneficiaryNameHash: canon.beneficiaryNameHash,
                accountIdentifierHash: canon.accountIdentifierHash,
                issuedAtUtc,
                validUntilUtc,
                nowUtc,
              });
              await updateFiatDestinationVerificationStatus(client, destinationId, verificationRow.result, nowUtc);
              await publishAudit(client, {
                event_type: "wlt1.beneficiary_verification_completed",
                source_module: "WLT-01",
                actor_id: actorId,
                actor_type: "user",
                entity_type: "beneficiary_verification",
                entity_id: verificationRow.verificationId,
                metadata: buildBeneficiaryVerificationAuditMetadata({
                  destinationId,
                  verificationId: verificationRow.verificationId,
                  verificationVersion: verificationRow.verificationVersion,
                  result: verificationRow.result,
                  providerId: verificationProvider.providerId,
                  matchScore: verificationRow.matchScore,
                  validUntilUtc,
                  verifiedAtUtc: nowUtc,
                }),
              });
              anyTerminal = true;
            }

            if (screeningOutcome.kind === "screened") {
              const issuedAtUtc = new Date(screeningOutcome.result.issuedAtUtc);
              const validUntilUtc = computeEffectiveValidUntil(
                issuedAtUtc,
                screeningOutcome.result.validUntilUtc ? new Date(screeningOutcome.result.validUntilUtc) : null,
                config.fiatScreeningMaxValidityHours,
              );
              const screeningRow = await persistFiatScreeningResult(client, {
                destinationId,
                providerId: screeningProvider.providerId,
                providerAdaptorVersion: screeningProvider.adaptorVersion,
                providerResultId: screeningOutcome.result.providerResultId,
                riskStatus: screeningOutcome.result.riskStatus,
                riskScore: screeningOutcome.result.riskScore,
                riskCategories: screeningOutcome.result.riskCategories,
                sanctionsExposure: screeningOutcome.result.sanctionsExposure,
                matchedNameNormalized: screeningOutcome.result.matchedNameNormalized,
                beneficiaryNameHash: canon.beneficiaryNameHash,
                bankCountry: canon.profile.bankCountry,
                beneficiaryType: body.beneficiary_type,
                issuedAtUtc,
                validUntilUtc,
                nowUtc,
              });
              await publishAudit(client, {
                event_type: "wlt1.fiat_screening_completed",
                source_module: "WLT-01",
                actor_id: actorId,
                actor_type: "user",
                entity_type: "fiat_screening_result",
                entity_id: screeningRow.screeningResultId,
                metadata: buildFiatScreeningAuditMetadata({
                  destinationId,
                  screeningResultId: screeningRow.screeningResultId,
                  screeningResultVersion: screeningRow.screeningResultVersion,
                  riskStatus: screeningRow.riskStatus,
                  sanctionsExposure: screeningRow.sanctionsExposure,
                  riskCategories: screeningRow.riskCategories,
                  providerId: screeningProvider.providerId,
                  validUntilUtc,
                  screenedAtUtc: nowUtc,
                }),
              });
              anyTerminal = true;
            }

            if (anyTerminal) {
              await promoteDraftToPendingReview(client, destinationId, "draft", nowUtc);
            }
          });
        } catch (err) {
          if (err instanceof Wlt1Error) throw err;
          throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
        }

        const refreshed = await fetchFiatPayoutDestinationById(getPool(), destinationId);
        if (refreshed) finalRow = refreshed;
      }

      return reply.code(201).send(successEnvelope(publicFiatDestinationResponse(finalRow), meta(request)));
    },
  );
}
