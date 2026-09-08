/**
 * WLT-01 Inbound-Source Screening. Implements the FROZEN architecture (WLT-01 Inbound-Source
 * Screening Implementation-Contract Architecture Addendum + Transfer-Replay/Idempotency Final
 * Micro-Correction) exactly — no new architectural decisions are made in this file. The Final
 * Micro-Correction supersedes the original addendum on every transfer-replay/idempotency question
 * below.
 *
 * ONE route: `POST /internal/wlt1/inbound-source-screenings`. Assesses the RISK OF THE EXTERNAL
 * SOURCE ADDRESS of an inbound transfer and persists durable, versioned evidence — it never
 * accepts a deposit, credits funds, posts a ledger, settles anything, proves sender ownership,
 * makes an AML disposition, whitelists, revokes a destination, or consumes a decision token.
 *
 * AML-01 IS DELIBERATELY NOT IN THIS PATH: `lib/aml1-client.ts`'s only route
 * (`/internal/aml1/pre-transaction/screen`) evaluates the CLIENT'S OWN authorised parties
 * (`requested_action` is a closed `["destination_use"]` literal union) — it structurally cannot
 * assess an arbitrary external blockchain address. This file imports no AML client of any kind.
 *
 * IDEMPOTENCY/TRANSFER-REPLAY (frozen Final Micro-Correction — the load-bearing correction over
 * the original addendum): the existing-transfer lookup is MERGED INTO TX-A, the same transaction
 * as `beginIdempotent`, so that:
 *   - a NEW Idempotency-Key whose transfer already has a committed, IDENTITY-EQUIVALENT screening
 *     completes THAT SAME key (`completeIdempotent`, same transaction) before returning a 200
 *     domain replay — a key must never be left `processing` after a successful 200 response;
 *   - a NEW Idempotency-Key whose transfer already has a committed, IDENTITY-DIFFERENT screening
 *     throws `409 WLT1_INBOUND_TRANSFER_CONFLICT` INSIDE TX-A, so the WHOLE transaction — including
 *     the `beginIdempotent` INSERT — rolls back; no idempotency row is left behind for that key.
 * `TRANSFER EQUIVALENCE = address_hash ONLY` — `transaction_hash`/`asset` are correlation metadata,
 * never blockchain-authenticated, and never compared for conflict purposes.
 *
 * CONCURRENT DIFFERENT KEYS on the SAME transfer MAY both pass TX-A and both call the provider —
 * this is ACCEPTED (a transfer-scoped advisory lock held across provider network I/O would violate
 * the "no external call while holding a DB transaction/lock" rule). `uq_wlt1_inbound_source_transfer`
 * is the sole correctness guarantee: exactly one INSERT survives TX-B; the loser's `23505` triggers
 * TX-C, which SELECTs the committed winner and either completes the loser's own key against the
 * winner (identity AND risk_status both equivalent), or fails closed — `409` (identity differs) or
 * `503 WLT1_INBOUND_SCREENING_UNAVAILABLE` (risk_status diverges: the loser's own discarded
 * provider observation is NEVER silently discarded in favour of a possibly-more-favourable winner
 * it did not itself observe). Only `uq_wlt1_inbound_source_transfer` is ever constraint-name-matched
 * as replay/conflict — `uq_wlt1_inbound_source_result_id`/`uq_wlt1_inbound_source_version` never are.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, beginIdempotent, completeIdempotent, getPool, publishAudit, query, successEnvelope, withTransaction, type IdempotencyScope, type Sql } from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { canonicaliseAddress } from "../lib/address/index.js";
import { fetchActiveChainCoverage } from "../lib/chain-coverage.js";
import { resolveCurrentWalletAnalyticsProvider, screenViaProvider } from "../lib/providers/registry.js";
import type { RiskCategory, WalletAnalyticsProvider, WalletScreeningInput } from "../lib/providers/types.js";
import {
  buildInboundScreeningAuditMetadata,
  buildInboundScreeningResponse,
  computeAddressHash,
  computeEffectiveValidUntil,
  isDuplicateInboundTransferViolation,
  mapRiskToEligibility,
  newInboundScreeningResultId,
  type InboundRiskStatus,
} from "../lib/inbound-source.js";
import { Wlt1Error, type Wlt1ErrorCode } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

const RequestBody = Type.Object(
  {
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    chain: Type.String({ minLength: 1, maxLength: 16 }),
    network: Type.String({ minLength: 1, maxLength: 16 }),
    source_address: Type.String({ minLength: 1, maxLength: 128 }),
    transaction_ref: Type.String({ minLength: 1, maxLength: 128 }),
    transaction_hash: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    asset: Type.Optional(Type.String({ minLength: 1, maxLength: 16 })),
  },
  { additionalProperties: false },
);
type RequestBody = Static<typeof RequestBody>;

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

/** Own copy — mirrors `routes/wallet-destinations.ts`'s own identical `mapAddressReasonCode`
 * shape (F3(c): own copy per route file). */
function mapAddressReasonCode(reasonCode: string): Wlt1ErrorCode {
  if (reasonCode === "unsupported_chain") return "WLT1_UNSUPPORTED_CHAIN";
  if (reasonCode === "alias_shaped_input") return "WLT1_NAME_SERVICE_ALIAS_NOT_ALLOWED";
  return "WLT1_ADDRESS_CANONICALISATION_FAILED";
}

interface InboundScreeningRow {
  screening_result_id: string;
  screening_result_version: number;
  client_id: string;
  chain: string;
  network: string;
  address_hash: string;
  transaction_ref: string;
  risk_status: InboundRiskStatus;
  source_eligibility: "eligible" | "not_eligible";
  reason_code: string;
  sanctions_exposure: boolean | null;
  risk_categories: RiskCategory[];
  provider_id: string;
  provider_result_id: string | null;
  issued_at_utc: Date;
  valid_until_utc: Date | null;
}

const ROW_COLUMNS =
  "screening_result_id, screening_result_version, client_id, chain, network, address_hash, transaction_ref, risk_status, source_eligibility, reason_code, sanctions_exposure, risk_categories, provider_id, provider_result_id, issued_at_utc, valid_until_utc";

async function fetchByResultId(sql: Sql, screeningResultId: string): Promise<InboundScreeningRow | undefined> {
  const rows = await query<InboundScreeningRow>(sql, `SELECT ${ROW_COLUMNS} FROM wlt1.inbound_source_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
  return rows[0];
}

async function fetchByTransfer(sql: Sql, clientId: string, chain: string, network: string, transactionRef: string): Promise<InboundScreeningRow | undefined> {
  const rows = await query<InboundScreeningRow>(
    sql,
    `SELECT ${ROW_COLUMNS} FROM wlt1.inbound_source_screening_result WHERE client_id = $1 AND chain = $2 AND network = $3 AND transaction_ref = $4`,
    [clientId, chain, network, transactionRef],
  );
  return rows[0];
}

export async function registerInboundSourceScreeningRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard((app.config as Wlt1Config).wlt1InternalServiceToken);

  app.post(
    "/internal/wlt1/inbound-source-screenings",
    { preHandler: requireInternal, schema: { body: RequestBody } },
    async (request, reply) => {
      const body = request.body as RequestBody;
      assertPoolAvailable();
      const idempotencyKey = requireIdempotencyKey(request);
      const config = app.config as Wlt1Config;

      // Step 5: pure canonicalisation. No memo/tag — every chain this route supports forbids one.
      const canon = canonicaliseAddress(body.chain, body.network, body.source_address);
      if (!canon.ok) {
        throw new Wlt1Error(mapAddressReasonCode(canon.reasonCode));
      }
      const addressHash = computeAddressHash(body.chain, body.network, canon.canonicalAddress, "");

      // Step 6: active-coverage check — a plain pre-transaction read.
      const coverage = await fetchActiveChainCoverage(getPool(), body.chain, body.network);
      if (!coverage) throw new Wlt1Error("WLT1_UNSUPPORTED_CHAIN");

      const idemScope: IdempotencyScope = {
        actorId: body.client_id,
        actorType: "service",
        action: "wlt1.inbound_source.screen",
        key: idempotencyKey,
        request: body,
        sourceModule: "WLT-01",
      };

      // Step 7: TX-A — ONE atomic transaction merging beginIdempotent + the existing-transfer
      // lookup (the Final Micro-Correction's own load-bearing fix over the original addendum).
      let replayRow: InboundScreeningRow | undefined;
      try {
        await withTransaction(async (client) => {
          const idem = await beginIdempotent(client, idemScope);
          if (idem.status === "duplicate") {
            if (idem.recordStatus === "completed") {
              if (!idem.resultRef) throw new AppError("INTERNAL_ERROR", { message: "Idempotent inbound-source-screening replay has no result reference." });
              const row = await fetchByResultId(client, idem.resultRef);
              if (!row || row.client_id !== body.client_id) {
                throw new AppError("INTERNAL_ERROR", { message: "Idempotent inbound-source-screening replay target could not be resolved for this client." });
              }
              replayRow = row;
              return;
            }
            // processing (or the currently-unreachable failed) — fail closed BEFORE any provider
            // call, zero evidence, zero token/version consumption.
            throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE");
          }

          // new -> existing-transfer lookup, merged into the SAME transaction as the begin.
          const existing = await fetchByTransfer(client, body.client_id, body.chain, body.network, body.transaction_ref);
          if (existing) {
            if (existing.address_hash === addressHash) {
              // New-key domain replay: complete THIS key against the already-committed screening —
              // the frozen invariant "any 200 domain replay leaves its key completed" (Final
              // Micro-Correction §1/§2).
              await completeIdempotent(client, idemScope, existing.screening_result_id);
              replayRow = existing;
              return;
            }
            // Deterministic conflict — throwing here rolls back the WHOLE transaction, including
            // the beginIdempotent INSERT just performed. No idempotency row persists for this key.
            throw new Wlt1Error("WLT1_INBOUND_TRANSFER_CONFLICT");
          }
          // absent -> commit TX-A with nothing further; proceed to the provider.
        });
      } catch (err) {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (replayRow) {
        return reply.code(200).send(successEnvelope(buildInboundScreeningResponse(replayRow, true), meta(request)));
      }

      // Step 8: provider resolution — coverage.provider_id is the ONLY identity source; a
      // test-only screeningProviderImpl may replace the CALLABLE implementation and its own
      // adaptorVersion, never providerId (mirrors wallet-screening's own P2CC2-LOW-2 discipline).
      let registryProvider: WalletAnalyticsProvider;
      try {
        registryProvider = resolveCurrentWalletAnalyticsProvider(coverage.provider_id);
      } catch (err) {
        throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
      }
      const testProviderImpl = config.screeningProviderImpl;
      const provider: WalletAnalyticsProvider = testProviderImpl
        ? { providerId: registryProvider.providerId, adaptorVersion: testProviderImpl.adaptorVersion, screen: testProviderImpl.screen }
        : registryProvider;

      const screeningResultId = newInboundScreeningResultId();
      const providerInput: WalletScreeningInput = { chain: body.chain, network: body.network, canonicalAddress: canon.canonicalAddress, screeningReferenceId: screeningResultId };

      // Step 9: provider call — OUTSIDE any DB transaction or lock (accepted architecture:
      // different-key concurrency may call the provider twice; DB uniqueness below guarantees
      // exactly one durable result).
      const outcome = await screenViaProvider(provider, providerInput);
      if (outcome.kind !== "screened") {
        // Step 10: technical failure. No evidence, no audit, no completeIdempotent — the key
        // remains `processing`; recovery requires a NEW Idempotency-Key.
        throw new Wlt1Error("WLT1_INBOUND_SCREENING_UNAVAILABLE");
      }
      const result = outcome.result;
      const { eligibility, reasonCode } = mapRiskToEligibility(result.riskStatus);

      // Step 11: TX-B — the REPEATABLE version-allocation + INSERT + audit + completeIdempotent
      // transaction. All four commit or roll back together.
      let outcomeRow: InboundScreeningRow;
      try {
        outcomeRow = await withTransaction(async (client) => {
          await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.inbound_source:${body.client_id}:${addressHash}`]);

          const versionRows = await query<{ max_version: number }>(
            client,
            `SELECT COALESCE(MAX(screening_result_version), 0) AS max_version FROM wlt1.inbound_source_screening_result WHERE client_id = $1 AND address_hash = $2`,
            [body.client_id, addressHash],
          );
          const version = Number(versionRows[0]?.max_version ?? 0) + 1;

          const issuedAt = new Date(result.issuedAtUtc);
          const providerValidUntil = result.validUntilUtc !== null ? new Date(result.validUntilUtc) : null;
          const effectiveValidUntil = computeEffectiveValidUntil(issuedAt, providerValidUntil, config.screeningMaxValidityHours);

          await query(
            client,
            `INSERT INTO wlt1.inbound_source_screening_result
               (screening_result_id, client_id, chain, network, canonical_address, address_hash, canonicalisation_version, screening_result_version,
                transaction_ref, transaction_hash, asset, provider_id, provider_adaptor_version, provider_result_id,
                risk_status, risk_score, risk_categories, direct_exposure, indirect_exposure, sanctions_exposure, cluster_ref,
                source_eligibility, reason_code, issued_at_utc, valid_until_utc, request_id, correlation_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
            [
              screeningResultId,
              body.client_id,
              body.chain,
              body.network,
              canon.canonicalAddress,
              addressHash,
              canon.canonicalisationVersion,
              version,
              body.transaction_ref,
              body.transaction_hash ?? null,
              body.asset ?? null,
              provider.providerId,
              provider.adaptorVersion,
              result.providerResultId,
              result.riskStatus,
              result.riskScore,
              JSON.stringify(result.riskCategories),
              JSON.stringify(result.directExposure),
              JSON.stringify(result.indirectExposure),
              result.sanctionsExposure,
              result.clusterRef,
              eligibility,
              reasonCode,
              issuedAt.toISOString(),
              effectiveValidUntil.toISOString(),
              request.ctx.request_id ?? null,
              request.ctx.correlation_id,
            ],
          );

          await publishAudit(client, {
            event_type: "wlt1.inbound_source_screened",
            source_module: "WLT-01",
            actor_id: body.client_id,
            actor_type: "service",
            entity_type: "inbound_source_screening_result",
            entity_id: screeningResultId,
            metadata: buildInboundScreeningAuditMetadata({
              screeningResultId,
              screeningResultVersion: version,
              clientId: body.client_id,
              chain: body.chain,
              network: body.network,
              addressHash,
              transactionRef: body.transaction_ref,
              riskStatus: result.riskStatus,
              sanctionsExposure: result.sanctionsExposure,
              sourceEligibility: eligibility,
              reasonCode,
              providerId: provider.providerId,
            }),
          });

          await completeIdempotent(client, idemScope, screeningResultId);

          const row = await fetchByResultId(client, screeningResultId);
          return row!;
        });
      } catch (err) {
        if (isDuplicateInboundTransferViolation(err)) {
          // Step 12/13: TX-B fully rolled back. TX-C recovery against the committed winner.
          try {
            const winnerRow = await withTransaction(async (client) => {
              const winner = await fetchByTransfer(client, body.client_id, body.chain, body.network, body.transaction_ref);
              if (!winner) throw new AppError("INTERNAL_ERROR", { message: "Inbound-source transfer uniqueness conflict but no committed winner could be resolved." });
              if (winner.address_hash !== addressHash) {
                throw new Wlt1Error("WLT1_INBOUND_TRANSFER_CONFLICT");
              }
              if (winner.risk_status !== result.riskStatus) {
                // Divergent-provider-outcome ruling: the loser's own discarded observation is
                // never silently replaced by a possibly-more-favourable committed winner.
                throw new Wlt1Error("WLT1_INBOUND_SCREENING_UNAVAILABLE");
              }
              await completeIdempotent(client, idemScope, winner.screening_result_id);
              return winner;
            });
            return reply.code(200).send(successEnvelope(buildInboundScreeningResponse(winnerRow, true), meta(request)));
          } catch (recoveryErr) {
            if (recoveryErr instanceof Wlt1Error || recoveryErr instanceof AppError) throw recoveryErr;
            throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: recoveryErr });
          }
        }
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(201).send(successEnvelope(buildInboundScreeningResponse(outcomeRow, false), meta(request)));
    },
  );
}
