/**
 * WLT-01 Fiat Payout Destinations (APAC) — `POST /internal/wlt1/payout-destinations` (register),
 * `GET /internal/wlt1/payout-destinations/:destination_id` (read), `POST
 * /internal/wlt1/payout-destinations/:destination_id/assess` (independent dual-domain
 * verification + screening assessment). Implements the FROZEN architecture exactly (WLT-01 Fiat
 * Payout Destinations Implementation-Exact Architecture Addendum + Provider/Decision Artifact/
 * Coverage/File-Plan Micro-Addendum + APAC-First Local-Account Architecture Pivot, all CLOSED) —
 * no new architectural decisions are made in this file.
 *
 * REGISTRATION ORDER (resolve-once discipline, mirrors `routes/wallet-destinations.ts`):
 *   1. strict request schema + internal-service auth
 *   2. country-profile resolution from `bank_country` + cross-field validation (currency/rail/
 *      branch requirement) + account/BIC canonicalisation — pure, in-process
 *   3. CLT-01 client-status check, OUTSIDE any transaction
 *   4. TX-1: registration advisory lock -> idempotency -> rail-coverage re-read -> natural-key
 *      re-check -> inserts -> registration audit -> idempotency completion -> commit
 *   5. (fresh registration only, never on idempotent replay) beneficiary-verification + fiat-
 *      screening provider calls, OUTSIDE any transaction, BOTH always attempted regardless of
 *      each other's outcome
 *   6. TX-2: destination advisory lock -> persist whichever evidence domain(s) returned a
 *      terminal result -> lifecycle transition (draft -> pending_review iff >=1 terminal domain)
 *      -> audits -> commit
 *   7. safe response (201, same shape for fresh registration and idempotent replay)
 *
 * PROVIDER OUTCOMES NEVER CONVERT REGISTRATION TO 4xx/5xx (frozen) — a technical
 * unavailable/invalid_response from either provider leaves the destination `draft` (if the OTHER
 * domain also failed) or `pending_review` (if the other domain succeeded), never an error
 * response. TX-2 itself failing (a genuine DB/audit fault) DOES map to `WLT1_AUDIT_REQUIRED` —
 * that is a service fault, not a business outcome, mirroring `routes/evaluate-use.ts`'s own TX-B
 * failure-mapping discipline.
 *
 * ASSESS (frozen): evaluates verification and screening INDEPENDENTLY. Per domain: an existing
 * TERMINAL+FRESH row short-circuits (no provider call); anything else (missing, or terminal-but-
 * stale) calls the provider. Idempotency is enforced by a short begin-transaction BEFORE any
 * provider call; a DUPLICATE replay (same key+fingerprint) NEVER calls a provider — it returns
 * purely from currently-stored evidence. If BOTH domains fail technically this call, the route
 * throws `WLT1_SERVICE_UNAVAILABLE` and deliberately does NOT complete the idempotency record (a
 * genuine retry remains possible).
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AppError,
  beginIdempotent,
  completeIdempotent,
  getPool,
  publishAudit,
  query,
  successEnvelope,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { APAC_BANK_COUNTRIES, resolveCountryProfile, type ApacBankCountry } from "../lib/fiat/country-profiles.js";
import {
  buildCanonicalAccountIdentity,
  canonicaliseAccountIdentifier,
  canonicaliseBic,
  canonicalStringify,
  computeAccountIdentifierHash,
  maskAccountIdentifier,
  validateBranchIdentifier,
} from "../lib/fiat/account-identifier.js";
import { normalizeBeneficiaryName, computeBeneficiaryNameHash } from "../lib/fiat/beneficiary-name.js";
import { deriveFiatAccountEncryptionKey, encryptFiatAccountIdentifier } from "../lib/fiat/encryption.js";
import { fetchActiveFiatRailCoverage } from "../lib/fiat/rail-coverage.js";
import { checkClientStatus, type Clt1ClientConfig } from "../lib/clt1-client.js";
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
  isEvidenceFresh,
  loadLatestBeneficiaryVerification,
  loadLatestFiatScreeningResult,
  persistBeneficiaryVerificationResult,
  persistFiatScreeningResult,
  promoteDraftToPendingReview,
  updateFiatDestinationVerificationStatus,
  type FiatPayoutDestinationRow,
} from "../lib/fiat-destination.js";
import { isDuplicateNaturalKeyViolation, newDestinationId, takeRegistrationLock, IDEMPOTENCY_REFUSED_RESULT_REF } from "../lib/destinations.js";
import { resolveBeneficiaryVerificationProvider, verifyViaProvider } from "../lib/beneficiary-verification/registry.js";
import { resolveFiatScreeningProvider, screenFiatDestinationViaProvider } from "../lib/fiat-screening/registry.js";
import { Wlt1Error } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

const BENEFICIARY_TYPES = ["individual", "corporate"] as const;

const RegisterFiatPayoutDestinationBody = Type.Object(
  {
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
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

const DestinationIdParams = Type.Object({ destination_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const AssessBody = Type.Object(
  {
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    // ACCEPTANCE REMEDIATION (M-1): optional caller-resupplied canonical account identifier — see
    // `validateResubmittedAccountIdentifier` below for the full fingerprint-integrity contract.
    // Never persisted, returned, audited, or logged (already redacted via server.ts's own
    // `req.body.account_identifier` path) — never passed to fiat screening.
    account_identifier: Type.Optional(Type.String({ minLength: 1, maxLength: 34 })),
  },
  { additionalProperties: false },
);
type AssessBody = Static<typeof AssessBody>;

const GetDestinationQuerystring = Type.Object({ client_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function clt1Config(app: FastifyInstance): Clt1ClientConfig {
  const config = app.config as Wlt1Config;
  return { baseUrl: config.clt1BaseUrl, internalServiceToken: config.clt1InternalServiceToken, fetchImpl: config.clt1FetchImpl };
}

async function readAuthoritativeNow(): Promise<Date> {
  const rows = await query<{ now_utc: Date }>(getPool(), `SELECT now() AS now_utc`, []);
  return rows[0]!.now_utc;
}

function invalidAccount(issue: string): never {
  throw new Wlt1Error("WLT1_ACCOUNT_IDENTIFIER_INVALID", { details: [{ issue }] });
}

/** Resolves the profile, validates every cross-field rule (currency/rail match the profile for
 * `bank_country`; branch requirement), canonicalises the account digits and BIC, validates the
 * branch identifier, and builds the canonical account identity object + its hash. Pure — no I/O.
 * Every failure maps to `WLT1_ACCOUNT_IDENTIFIER_INVALID` with a bounded, non-sensitive
 * `details.issue` — never echoing the rejected raw value. */
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

/**
 * ACCEPTANCE REMEDIATION (M-1) — validates a caller-resupplied `account_identifier` on `/assess`
 * against the PERSISTED destination's own country profile and stored `account_identifier_hash`.
 * WLT never decrypts the stored ciphertext to recover the account — this function instead
 * canonicalises the caller's OWN resubmitted value using the destination's own persisted
 * `bank_country`/`bank_identifier`/`branch_identifier` and requires the reconstructed fingerprint
 * to equal the persisted hash EXACTLY before the real canonical digits may reach
 * `BeneficiaryVerificationProvider`.
 *
 * A mismatch (malformed canonicalisation OR a fingerprint that does not match) is a
 * REQUEST-INTEGRITY FAILURE, not a partial-capability condition: it maps to the SAME
 * `WLT1_ACCOUNT_IDENTIFIER_INVALID` (422) the registration route already uses, with
 * `details.issue = "account_identifier_mismatch"` on the fingerprint-mismatch branch — never
 * disclosing the stored hash, the expected account, or whether another client holds that account.
 * Called strictly BEFORE `beginIdempotent` (see the assess route below) so a bad sensitive input
 * never consumes an idempotency key.
 */
function validateResubmittedAccountIdentifier(rawAccountIdentifier: string, destination: FiatPayoutDestinationRow): string {
  const profile = resolveCountryProfile(destination.bank_country);
  if (!profile) invalidAccount("unknown_bank_country"); // structurally unreachable — defended anyway

  const account = canonicaliseAccountIdentifier(rawAccountIdentifier, profile!);
  if (!account.ok) invalidAccount(account.reasonCode);

  const identity = buildCanonicalAccountIdentity({
    accountIdentifier: account.canonical,
    bankCountry: destination.bank_country as ApacBankCountry,
    bankIdentifier: destination.bank_identifier,
    branchIdentifier: destination.branch_identifier ?? undefined,
  });
  const reconstructedHash = computeAccountIdentifierHash(identity);
  if (reconstructedHash !== destination.account_identifier_hash) {
    invalidAccount("account_identifier_mismatch");
  }

  return account.canonical;
}

type RegistrationOutcome = { kind: "created" | "idempotent_replay"; row: FiatPayoutDestinationRow } | { kind: "duplicate" };

export async function registerFiatPayoutDestinationRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard((app.config as Wlt1Config).wlt1InternalServiceToken);

  app.post(
    "/internal/wlt1/payout-destinations",
    { preHandler: requireInternal, schema: { body: RegisterFiatPayoutDestinationBody } },
    async (request, reply) => {
      assertPoolAvailable();
      const config = app.config as Wlt1Config;
      const body = request.body as RegisterFiatPayoutDestinationBody;
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = request.ctx.actor_id ?? "wlt1_internal_service";

      const canon = validateAndCanonicalise(body);

      // Step 3: CLT-01 client-status check, OUTSIDE any transaction.
      const clt = await checkClientStatus(clt1Config(app), body.client_id);
      if (!clt.eligible) {
        throw new Wlt1Error(clt.reasonCode === "clt1_unavailable" ? "WLT1_CLT1_UNAVAILABLE" : "WLT1_CLIENT_STATUS_BLOCKED");
      }

      const naturalKeyHash = computeNaturalKeyHash(body.client_id, FIAT_DESTINATION_TYPE, canon.accountIdentifierHash);

      const idemScope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "wlt1.fiat_payout_destination.register",
        key: idempotencyKey,
        request: body,
        sourceModule: "WLT-01",
      };

      // ------------------------------------------------------------------------------------
      // TX-1
      // ------------------------------------------------------------------------------------
      let outcome: RegistrationOutcome;
      try {
        outcome = await withTransaction(async (client) => {
          await takeRegistrationLock(client, body.client_id);

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
              actor_type: "service",
              entity_type: "destination_registration",
              entity_id: existing.destination_id,
              metadata: { client_id: body.client_id, destination_type: FIAT_DESTINATION_TYPE, reason_code: "destination_already_registered" },
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
              [destinationId, body.client_id, FIAT_DESTINATION_TYPE, naturalKeyHash, clt.status],
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
            actor_type: "service",
            entity_type: "destination",
            entity_id: destinationId,
            metadata: buildFiatRegistrationAuditMetadata({
              destinationId,
              clientId: body.client_id,
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

      // Steps 5-6: provider phase + TX-2 — ONLY for a genuinely fresh registration, never on
      // idempotent replay (an already-completed request performs no new provider work).
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
                actor_type: "service",
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
                actor_type: "service",
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

      return reply.code(201).send(successEnvelope(safeFiatDestinationResponse(finalRow), meta(request)));
    },
  );

  app.get(
    "/internal/wlt1/payout-destinations/:destination_id",
    { preHandler: requireInternal, schema: { params: DestinationIdParams, querystring: GetDestinationQuerystring } },
    async (request, reply) => {
      assertPoolAvailable();
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const { client_id } = request.query as Static<typeof GetDestinationQuerystring>;
      const row = await fetchFiatPayoutDestinationById(getPool(), destination_id);
      // Unknown destination and a foreign-client destination collapse to the SAME 404 — no
      // enumeration oracle, matching every other WLT-01 client-scoped route's established
      // convention.
      if (!row || row.client_id !== client_id) throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
      return reply.send(successEnvelope(safeFiatDestinationResponse(row), meta(request)));
    },
  );

  app.post(
    "/internal/wlt1/payout-destinations/:destination_id/assess",
    { preHandler: requireInternal, schema: { params: DestinationIdParams, body: AssessBody } },
    async (request, reply) => {
      assertPoolAvailable();
      const config = app.config as Wlt1Config;
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const body = request.body as AssessBody;
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = request.ctx.actor_id ?? "wlt1_internal_service";

      const destination = await fetchFiatPayoutDestinationById(getPool(), destination_id);
      if (!destination || destination.client_id !== body.client_id) {
        throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
      }

      // ACCEPTANCE REMEDIATION (M-1) — account fingerprint integrity validation happens BEFORE
      // beginIdempotent, so a bad sensitive input never consumes an idempotency key and a
      // corrected resubmission may reuse the SAME Idempotency-Key. A mismatch is a
      // request-integrity failure: 422, no provider call of any kind, no evidence, no audit, no
      // idempotency record. `account_identifier` is NEVER passed to fiat screening.
      let validatedAccountIdentifier: string | undefined;
      if (body.account_identifier !== undefined) {
        validatedAccountIdentifier = validateResubmittedAccountIdentifier(body.account_identifier, destination);
      }

      const idemScope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "wlt1.fiat_payout_destination.assess",
        key: idempotencyKey,
        request: body,
        sourceModule: "WLT-01",
      };

      // ACCEPTANCE REMEDIATION (idempotency processing concurrency, WITHDRAWING the earlier
      // "re-run providers on a processing duplicate" rule): the foundation idempotency layer has
      // NO lease/ownership/heartbeat mechanism, so `recordStatus === 'processing'` can mean EITHER
      // a dead prior attempt OR one still genuinely in flight — these are indistinguishable. Only
      // `recordStatus === 'completed'` is safe to treat as a replay (no provider calls). Anything
      // else (processing, or the currently-unreachable 'failed') fails closed with 503 and
      // performs NO provider work and NO completion — the caller must retry with a NEW
      // Idempotency-Key. This is what makes concurrent same-key requests structurally safe: at
      // most one call can ever reach the provider phase for a given live operation.
      let isReplay = false;
      try {
        await withTransaction(async (client) => {
          const idem = await beginIdempotent(client, idemScope);
          if (idem.status === "new") return;
          if (idem.recordStatus === "completed") {
            isReplay = true;
            return;
          }
          throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE");
        });
      } catch (err) {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      const nowUtc = await readAuthoritativeNow();
      const latestVerification = await loadLatestBeneficiaryVerification(getPool(), destination_id);
      const latestScreening = await loadLatestFiatScreeningResult(getPool(), destination_id);

      const verificationShortCircuit = latestVerification !== null && (isReplay || isEvidenceFresh(latestVerification.validUntilUtc, nowUtc));
      const screeningShortCircuit = latestScreening !== null && (isReplay || isEvidenceFresh(latestScreening.validUntilUtc, nowUtc));

      // Independent domains: an ABSENT account_identifier (distinct from a MISMATCHING one, which
      // already threw 422 above) means verification simply cannot run this call — no provider
      // call, no evidence — while screening remains wholly independent and unaffected.
      let verificationSkippedNoAccount = false;
      let verificationOutcome: Awaited<ReturnType<typeof verifyViaProvider>> | undefined;
      let verificationProvider: ReturnType<typeof resolveBeneficiaryVerificationProvider> | undefined;
      if (!verificationShortCircuit && !isReplay) {
        if (validatedAccountIdentifier === undefined) {
          verificationSkippedNoAccount = true;
        } else {
          verificationProvider = resolveBeneficiaryVerificationProvider(config.beneficiaryVerificationProviderId);
          verificationOutcome = await verifyViaProvider(verificationProvider, {
            beneficiaryNameNormalized: destination.beneficiary_name_normalized,
            beneficiaryType: destination.beneficiary_type,
            bankCountry: destination.bank_country,
            bankIdentifier: destination.bank_identifier,
            branchIdentifier: destination.branch_identifier ?? undefined,
            // The REAL canonical account digits, fingerprint-validated above against the
            // persisted hash — NEVER account_identifier_hash, a mask, or ciphertext (forbidden:
            // see this file's own `validateResubmittedAccountIdentifier` header comment).
            accountIdentifier: validatedAccountIdentifier,
            accountIdentifierType: "local_account",
            verificationReferenceId: destination_id,
          });
        }
      }

      let screeningOutcome: Awaited<ReturnType<typeof screenFiatDestinationViaProvider>> | undefined;
      let screeningProvider: ReturnType<typeof resolveFiatScreeningProvider> | undefined;
      if (!screeningShortCircuit && !isReplay) {
        screeningProvider = resolveFiatScreeningProvider(config.fiatScreeningProviderId);
        screeningOutcome = await screenFiatDestinationViaProvider(screeningProvider, {
          beneficiaryNameNormalized: destination.beneficiary_name_normalized,
          beneficiaryType: destination.beneficiary_type,
          bankCountry: destination.bank_country,
          bankIdentifier: destination.bank_identifier,
          screeningReferenceId: destination_id,
        });
      }

      const verificationTerminal = verificationOutcome?.kind === "completed";
      const screeningTerminal = screeningOutcome?.kind === "screened";
      const verificationTechnicalFailure = verificationSkippedNoAccount || (verificationOutcome !== undefined && !verificationTerminal);
      const screeningTechnicalFailure = screeningOutcome !== undefined && !screeningTerminal;

      // 503 RULE (frozen, amended): return 503 ONLY when NEITHER domain persisted evidence AND
      // NEITHER domain short-circuited — i.e. nothing useful was accomplished and a genuine retry
      // could accomplish something. An absent-account verification skip counts toward "neither
      // domain persisted evidence" exactly like a technical provider failure does.
      const verificationAccomplishedNothing = !verificationShortCircuit && !verificationTerminal;
      const screeningAccomplishedNothing = !screeningShortCircuit && !screeningTerminal;
      if (verificationAccomplishedNothing && screeningAccomplishedNothing) {
        // Neither domain accomplished anything this call — 503, idempotency record left
        // 'processing' (never completed), a genuine retry (under a NEW Idempotency-Key) remains
        // possible.
        throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE");
      }

      let persistedVerification: Awaited<ReturnType<typeof persistBeneficiaryVerificationResult>> | undefined;
      let persistedScreening: Awaited<ReturnType<typeof persistFiatScreeningResult>> | undefined;

      // A pure replay (recordStatus was already 'completed') performs NO transaction at all — no
      // new lock, no new write, and critically NO re-completion of the idempotency record (the
      // frozen final-state rule: only `recordStatus === 'completed'` triggers replay, and replay
      // must never re-run `completeIdempotent`).
      if (!isReplay) {
        try {
          await withTransaction(async (client) => {
            await acquireDestinationLock(client, destination_id);
            const txNowRows = await query<{ now_utc: Date }>(client, `SELECT now() AS now_utc`, []);
            const txNow = txNowRows[0]!.now_utc;
            let anyTerminal = false;

            if (verificationTerminal && verificationOutcome?.kind === "completed") {
              const issuedAtUtc = new Date(verificationOutcome.result.issuedAtUtc);
              const validUntilUtc = computeEffectiveValidUntil(
                issuedAtUtc,
                verificationOutcome.result.validUntilUtc ? new Date(verificationOutcome.result.validUntilUtc) : null,
                config.beneficiaryVerificationValidityHours,
              );
              const beneficiaryNameHash = computeBeneficiaryNameHash(destination.beneficiary_name_normalized);
              persistedVerification = await persistBeneficiaryVerificationResult(client, {
                destinationId: destination_id,
                providerId: (verificationProvider as NonNullable<typeof verificationProvider>).providerId,
                providerAdaptorVersion: (verificationProvider as NonNullable<typeof verificationProvider>).adaptorVersion,
                result: verificationOutcome.result.result,
                matchScore: verificationOutcome.result.matchScore,
                beneficiaryNameHash,
                accountIdentifierHash: destination.account_identifier_hash,
                issuedAtUtc,
                validUntilUtc,
                nowUtc: txNow,
              });
              await updateFiatDestinationVerificationStatus(client, destination_id, persistedVerification.result, txNow);
              await publishAudit(client, {
                event_type: "wlt1.beneficiary_verification_completed",
                source_module: "WLT-01",
                actor_id: actorId,
                actor_type: "service",
                entity_type: "beneficiary_verification",
                entity_id: persistedVerification.verificationId,
                metadata: buildBeneficiaryVerificationAuditMetadata({
                  destinationId: destination_id,
                  verificationId: persistedVerification.verificationId,
                  verificationVersion: persistedVerification.verificationVersion,
                  result: persistedVerification.result,
                  providerId: (verificationProvider as NonNullable<typeof verificationProvider>).providerId,
                  matchScore: persistedVerification.matchScore,
                  validUntilUtc,
                  verifiedAtUtc: txNow,
                }),
              });
              anyTerminal = true;
            }

            if (screeningTerminal && screeningOutcome?.kind === "screened") {
              const issuedAtUtc = new Date(screeningOutcome.result.issuedAtUtc);
              const validUntilUtc = computeEffectiveValidUntil(
                issuedAtUtc,
                screeningOutcome.result.validUntilUtc ? new Date(screeningOutcome.result.validUntilUtc) : null,
                config.fiatScreeningMaxValidityHours,
              );
              persistedScreening = await persistFiatScreeningResult(client, {
                destinationId: destination_id,
                providerId: (screeningProvider as NonNullable<typeof screeningProvider>).providerId,
                providerAdaptorVersion: (screeningProvider as NonNullable<typeof screeningProvider>).adaptorVersion,
                providerResultId: screeningOutcome.result.providerResultId,
                riskStatus: screeningOutcome.result.riskStatus,
                riskScore: screeningOutcome.result.riskScore,
                riskCategories: screeningOutcome.result.riskCategories,
                sanctionsExposure: screeningOutcome.result.sanctionsExposure,
                matchedNameNormalized: screeningOutcome.result.matchedNameNormalized,
                beneficiaryNameHash: computeBeneficiaryNameHash(destination.beneficiary_name_normalized),
                bankCountry: destination.bank_country,
                beneficiaryType: destination.beneficiary_type,
                issuedAtUtc,
                validUntilUtc,
                nowUtc: txNow,
              });
              await publishAudit(client, {
                event_type: "wlt1.fiat_screening_completed",
                source_module: "WLT-01",
                actor_id: actorId,
                actor_type: "service",
                entity_type: "fiat_screening_result",
                entity_id: persistedScreening.screeningResultId,
                metadata: buildFiatScreeningAuditMetadata({
                  destinationId: destination_id,
                  screeningResultId: persistedScreening.screeningResultId,
                  screeningResultVersion: persistedScreening.screeningResultVersion,
                  riskStatus: persistedScreening.riskStatus,
                  sanctionsExposure: persistedScreening.sanctionsExposure,
                  riskCategories: persistedScreening.riskCategories,
                  providerId: (screeningProvider as NonNullable<typeof screeningProvider>).providerId,
                  validUntilUtc,
                  screenedAtUtc: txNow,
                }),
              });
              anyTerminal = true;
            }

            if (anyTerminal) {
              await promoteDraftToPendingReview(client, destination_id, destination.status, txNow);
            }

            await completeIdempotent(client, idemScope, destination_id);
          });
        } catch (err) {
          if (err instanceof Wlt1Error) throw err;
          throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
        }
      }

      const finalVerification = persistedVerification ?? latestVerification;
      const finalScreening = persistedScreening ?? latestScreening;

      const verificationAction = persistedVerification ? "performed" : verificationTerminal ? "performed" : verificationTechnicalFailure ? "failed" : verificationShortCircuit ? "short_circuited" : "failed";
      const screeningAction = persistedScreening ? "performed" : screeningTerminal ? "performed" : screeningTechnicalFailure ? "failed" : screeningShortCircuit ? "short_circuited" : "failed";

      return reply.code(200).send(
        successEnvelope(
          {
            destination_id,
            status: destination.status,
            verification: finalVerification
              ? {
                  verification_id: finalVerification.verificationId,
                  verification_version: finalVerification.verificationVersion,
                  result: finalVerification.result,
                  valid_until_utc: finalVerification.validUntilUtc.toISOString(),
                  action: verificationAction,
                }
              : { verification_id: null, verification_version: null, result: null, valid_until_utc: null, action: verificationAction },
            screening: finalScreening
              ? {
                  screening_result_id: finalScreening.screeningResultId,
                  screening_result_version: finalScreening.screeningResultVersion,
                  risk_status: finalScreening.riskStatus,
                  valid_until_utc: finalScreening.validUntilUtc.toISOString(),
                  action: screeningAction,
                }
              : { screening_result_id: null, screening_result_version: null, risk_status: null, valid_until_utc: null, action: screeningAction },
          },
          meta(request),
        ),
      );
    },
  );
}

function safeFiatDestinationResponse(row: FiatPayoutDestinationRow) {
  return {
    destination_id: row.destination_id,
    client_id: row.client_id,
    destination_type: FIAT_DESTINATION_TYPE,
    status: row.status,
    bank_country: row.bank_country,
    currency: row.currency,
    rail: row.rail,
    bank_identifier: row.bank_identifier,
    branch_identifier: row.branch_identifier,
    account_identifier_type: row.account_identifier_type,
    account_identifier_masked: row.account_identifier_masked,
    beneficiary_type: row.beneficiary_type,
    verification_status: row.verification_status,
    destination_status_version: row.destination_status_version,
    whitelist_version: row.whitelist_version,
    created_at_utc: row.created_at_utc,
  };
}
