/**
 * WLT-01 Phase 1B — wallet-destination registration and read.
 *
 * REGISTRATION ORDER (resolve-once discipline — no HTTP call while a WLT-01 transaction is open,
 * mirrors `services/kyc1/src/routes/roster-sync.ts`'s own `fetchClt1KycRoster` outside
 * `withTransaction`):
 *   1. strict request schema (TypeBox, enforced by Fastify before this handler runs)
 *   2. internal-service authentication (preHandler guard)
 *   3-4. CLT-01 client-status check, OUTSIDE any transaction, and validated
 *   5-6. deterministic address canonicalisation + integrity outcome, pure in-process
 *   7-17. ONE WLT-01 transaction: advisory lock -> idempotency -> chain-coverage re-read ->
 *         natural-key re-check -> inserts -> audit -> idempotency completion -> commit
 *   18. safe response
 *
 * Two kinds of refusal exist, and they are handled differently on purpose:
 *   - A refusal BEFORE any transaction opens (CLT-01 status blocked/unavailable, or address
 *     canonicalisation/integrity failure) is recorded through its OWN short-lived "refusal
 *     evidence" transaction (`recordRefusal`) — durable evidence without ever creating a
 *     destination. If that refusal-evidence transaction's own audit publish fails, the refusal
 *     transaction itself rolls back and the caller sees `WLT1_AUDIT_REQUIRED` — this codebase
 *     never claims a refusal was durably recorded when it was not.
 *   - A refusal DISCOVERED INSIDE the main registration transaction (the proactive natural-key
 *     duplicate re-check, step 11) is NOT thrown — the transaction commits with the refusal audit
 *     event, and the route handler throws `WLT1_DESTINATION_DUPLICATE` only AFTER that commit
 *     succeeds (the same "return a discriminated outcome, throw outside `withTransaction`" idiom
 *     CLT-01's/AML-01's own routes use). The RARE concurrent-race backstop (the partial unique
 *     index's own `23505`) is a genuine throw INSIDE the transaction — that loser's attempt rolls
 *     back in full, with no separate refusal audit for that specific race loss (precedented:
 *     KYC-01's/AML-01's own `23505`-backstop mappings behave identically).
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AppError,
  beginIdempotent,
  completeIdempotent,
  fingerprint,
  getPool,
  publishAudit,
  query,
  successEnvelope,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { canonicaliseAddress } from "../lib/address/index.js";
import { checkClientStatus, type Clt1ClientConfig } from "../lib/clt1-client.js";
import { fetchActiveChainCoverage } from "../lib/chain-coverage.js";
import {
  IDEMPOTENCY_REFUSED_RESULT_REF,
  WALLET_DESTINATION_TYPE,
  computeAddressHash,
  computeNaturalKeyHash,
  fetchWalletDestinationById,
  fetchWalletDestinationByNaturalKey,
  isDuplicateNaturalKeyViolation,
  newAddressCheckId,
  newDestinationId,
  takeRegistrationLock,
} from "../lib/destinations.js";
import { safeWalletDestinationResponse, type WalletDestinationRow } from "../lib/safe-response.js";
import { Wlt1Error, type Wlt1ErrorCode } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

const WALLET_TYPES = ["hosted", "unhosted", "unknown"] as const;
const BENEFICIARY_RELATIONSHIPS = ["self", "related_party", "third_party"] as const;
/** Canonical lower-case chain/network identifiers only — an uppercase/mixed-case value is a clean
 * 400 VALIDATION_ERROR here rather than silently falling through to `WLT1_UNSUPPORTED_CHAIN`. */
const CHAIN_NETWORK_PATTERN = "^[a-z0-9_]+$";

const RegisterWalletDestinationBody = Type.Object(
  {
    client_id: Type.String({ minLength: 1, maxLength: 64 }),
    chain: Type.String({ minLength: 1, maxLength: 16, pattern: CHAIN_NETWORK_PATTERN }),
    network: Type.String({ minLength: 1, maxLength: 16, pattern: CHAIN_NETWORK_PATTERN }),
    address: Type.String({ minLength: 1, maxLength: 128 }),
    memo_tag: Type.Optional(Type.String({ maxLength: 128 })),
    wallet_type: Type.Union(WALLET_TYPES.map((v) => Type.Literal(v))),
    beneficiary_relationship: Type.Union(BENEFICIARY_RELATIONSHIPS.map((v) => Type.Literal(v))),
  },
  { additionalProperties: false },
);
type RegisterWalletDestinationBody = Static<typeof RegisterWalletDestinationBody>;

const DestinationIdParams = Type.Object({ destination_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

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

/** The reason codes `lib/address/{ethereum,tron}.ts`/`lib/address/index.ts` can return, mapped
 * onto the three distinct WLT-01 error codes that cover them. Everything not explicitly listed
 * here is a raw-shape defect -> `WLT1_WALLET_ADDRESS_INVALID` (the default branch). */
function mapAddressReasonCode(reasonCode: string): Wlt1ErrorCode {
  if (reasonCode === "unsupported_chain") return "WLT1_UNSUPPORTED_CHAIN";
  if (reasonCode === "alias_shaped_input") return "WLT1_NAME_SERVICE_ALIAS_NOT_ALLOWED";
  if (reasonCode === "invalid_eip55_checksum" || reasonCode === "invalid_base58check_checksum") {
    return "WLT1_ADDRESS_CANONICALISATION_FAILED";
  }
  return "WLT1_WALLET_ADDRESS_INVALID";
}

interface RefusalInput {
  clientId: string;
  reasonCode: string;
  /** Present only for a refusal that occurred AFTER address parsing was attempted — a CLT-01
   * status refusal has none of these, per this file's own header comment. */
  addressStage?: {
    chain: string;
    network: string;
    rawAddressHash: string;
    canonicalAddressHash: string | null;
    canonicalisationVersion: string | null;
    checksumValid: boolean;
  };
}

/** Records durable refusal evidence in its OWN short-lived transaction — see this file's header
 * comment for why this is separate from the main registration transaction. Always takes the SAME
 * client-scoped lock namespace as registration, so refusal and registration attempts for the same
 * client are always serialized against each other in one consistent order. */
async function recordRefusal(app: FastifyInstance, input: RefusalInput): Promise<void> {
  await withTransaction(async (client) => {
    await takeRegistrationLock(client, input.clientId);

    let checkId: string | undefined;
    if (input.addressStage) {
      checkId = newAddressCheckId();
      await query(
        client,
        `INSERT INTO wlt1.address_integrity_check
           (address_check_id, destination_id, client_id, chain, network, raw_address_hash, canonical_address_hash, canonicalisation_version, checksum_valid, result_status, reason_code)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, 'fail', $9)`,
        [
          checkId,
          input.clientId,
          input.addressStage.chain,
          input.addressStage.network,
          input.addressStage.rawAddressHash,
          input.addressStage.canonicalAddressHash,
          input.addressStage.canonicalisationVersion,
          input.addressStage.checksumValid,
          input.reasonCode,
        ],
      );
      await publishAudit(client, {
        event_type: "wlt1.address_integrity_checked",
        source_module: "WLT-01",
        actor_id: "wlt1_internal_service",
        actor_type: "service",
        entity_type: "address_integrity_check",
        entity_id: checkId,
        metadata: {
          destination_id: null,
          client_id: input.clientId,
          chain: input.addressStage.chain,
          network: input.addressStage.network,
          raw_address_hash: input.addressStage.rawAddressHash,
          canonical_address_hash: input.addressStage.canonicalAddressHash,
          canonicalisation_version: input.addressStage.canonicalisationVersion,
          checksum_valid: input.addressStage.checksumValid,
          result_status: "fail",
          reason_code: input.reasonCode,
        },
      });
    }

    await publishAudit(client, {
      event_type: "wlt1.destination_registration_refused",
      source_module: "WLT-01",
      actor_id: "wlt1_internal_service",
      actor_type: "service",
      entity_type: "destination_registration",
      entity_id: checkId ?? input.clientId,
      metadata: {
        client_id: input.clientId,
        reason_code: input.reasonCode,
        ...(input.addressStage ? { chain: input.addressStage.chain, network: input.addressStage.network } : {}),
      },
    });
  }).catch((err) => {
    // The refusal transaction itself rolled back (e.g. an audit/outbox write failed) — never
    // claim the refusal was durably recorded.
    throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
  });
}

type RegistrationOutcome =
  | { kind: "created" | "idempotent_replay"; row: WalletDestinationRow }
  | { kind: "duplicate" };

export async function registerWalletDestinationRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeWlt1InternalIdentityGuard(app.config.wlt1InternalServiceToken);

  app.post(
    "/internal/wlt1/wallet-destinations",
    { preHandler: requireInternal, schema: { body: RegisterWalletDestinationBody } },
    async (request, reply) => {
      assertPoolAvailable();
      const body = request.body as RegisterWalletDestinationBody;
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = request.ctx.actor_id ?? "wlt1_internal_service";

      // Steps 3-4: CLT-01 client-status check, OUTSIDE any transaction.
      const clt = await checkClientStatus(clt1Config(app), body.client_id);
      if (!clt.eligible) {
        await recordRefusal(app, { clientId: body.client_id, reasonCode: clt.reasonCode });
        throw new Wlt1Error(clt.reasonCode === "clt1_unavailable" ? "WLT1_CLT1_UNAVAILABLE" : "WLT1_CLIENT_STATUS_BLOCKED");
      }

      // Steps 5-6: deterministic address canonicalisation + integrity, pure in-process.
      const memoTagInput = body.memo_tag ?? "";
      const rawAddressHash = fingerprint({ chain: body.chain, network: body.network, raw_address: body.address, memo_tag: memoTagInput });
      const canon = canonicaliseAddress(body.chain, body.network, body.address, body.memo_tag);
      if (!canon.ok) {
        await recordRefusal(app, {
          clientId: body.client_id,
          reasonCode: canon.reasonCode,
          addressStage: {
            chain: body.chain,
            network: body.network,
            rawAddressHash,
            canonicalAddressHash: null,
            canonicalisationVersion: null,
            checksumValid: false,
          },
        });
        throw new Wlt1Error(mapAddressReasonCode(canon.reasonCode));
      }

      const memoTagIdentity = ""; // both Phase 1B chains forbid memo/tag; canon.ok already proved this
      const addressHash = computeAddressHash(body.chain, body.network, canon.canonicalAddress, memoTagIdentity);
      const naturalKeyHash = computeNaturalKeyHash(body.client_id, WALLET_DESTINATION_TYPE, addressHash);

      const idemScope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "wlt1.wallet_destination.register",
        key: idempotencyKey,
        request: body,
        sourceModule: "WLT-01",
      };

      // Steps 7-17: the ONE registration transaction.
      let outcome: RegistrationOutcome;
      try {
        outcome = await withTransaction(async (client) => {
        await takeRegistrationLock(client, body.client_id); // step 8

        const idem = await beginIdempotent(client, idemScope); // step 9
        if (idem.status === "duplicate") {
          if (idem.resultRef === IDEMPOTENCY_REFUSED_RESULT_REF) {
            return { kind: "duplicate" };
          }
          const existingRow = await fetchWalletDestinationById(client, idem.resultRef as string);
          if (!existingRow) {
            throw new AppError("INTERNAL_ERROR", { message: "Idempotent replay target destination could not be resolved." });
          }
          return { kind: "idempotent_replay", row: existingRow };
        }

        // Step 10: re-read chain coverage under lock. Defensive-only in Phase 1B — coverage rows
        // are seeded once by migration 049 and never mutated at runtime, so this branch is not
        // organically reachable; kept as a genuine re-verification, not a decorative check.
        const coverage = await fetchActiveChainCoverage(client, body.chain, body.network);
        if (!coverage) {
          throw new Wlt1Error("WLT1_UNSUPPORTED_CHAIN");
        }

        // Step 11: proactive natural-key duplicate re-check.
        const existing = await fetchWalletDestinationByNaturalKey(client, naturalKeyHash);
        if (existing) {
          await publishAudit(client, {
            event_type: "wlt1.destination_registration_refused",
            source_module: "WLT-01",
            actor_id: actorId,
            actor_type: "service",
            entity_type: "destination_registration",
            entity_id: existing.destination_id,
            metadata: { client_id: body.client_id, chain: body.chain, network: body.network, reason_code: "destination_already_registered" },
          });
          await completeIdempotent(client, idemScope, IDEMPOTENCY_REFUSED_RESULT_REF);
          return { kind: "duplicate" };
        }

        // Steps 12-14: inserts.
        const destinationId = newDestinationId();
        const checkId = newAddressCheckId();

        try {
          await query(
            client,
            `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status, client_status_ref)
             VALUES ($1, $2, $3, $4, 'draft', $5)`,
            [destinationId, body.client_id, WALLET_DESTINATION_TYPE, naturalKeyHash, clt.status],
          );
        } catch (err) {
          if (isDuplicateNaturalKeyViolation(err)) {
            throw new Wlt1Error("WLT1_DESTINATION_DUPLICATE", { cause: err });
          }
          throw err;
        }

        await query(
          client,
          `INSERT INTO wlt1.wallet_destination
             (destination_id, chain, network, canonical_address, address_hash, memo_tag_identity, canonicalisation_version, wallet_type, beneficiary_relationship)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [destinationId, body.chain, body.network, canon.canonicalAddress, addressHash, memoTagIdentity, canon.canonicalisationVersion, body.wallet_type, body.beneficiary_relationship],
        );

        await query(
          client,
          `INSERT INTO wlt1.address_integrity_check
             (address_check_id, destination_id, client_id, chain, network, raw_address_hash, canonical_address_hash, canonicalisation_version, checksum_valid, result_status, reason_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'pass', 'canonicalisation_succeeded')`,
          [checkId, destinationId, body.client_id, body.chain, body.network, rawAddressHash, addressHash, canon.canonicalisationVersion],
        );

        // Step 15: publish audit events.
        await publishAudit(client, {
          event_type: "wlt1.address_integrity_checked",
          source_module: "WLT-01",
          actor_id: actorId,
          actor_type: "service",
          entity_type: "address_integrity_check",
          entity_id: checkId,
          metadata: {
            destination_id: destinationId,
            client_id: body.client_id,
            chain: body.chain,
            network: body.network,
            raw_address_hash: rawAddressHash,
            canonical_address_hash: addressHash,
            canonicalisation_version: canon.canonicalisationVersion,
            checksum_valid: true,
            result_status: "pass",
            reason_code: "canonicalisation_succeeded",
          },
        });
        await publishAudit(client, {
          event_type: "wlt1.wallet_registered",
          source_module: "WLT-01",
          actor_id: actorId,
          actor_type: "service",
          entity_type: "destination",
          entity_id: destinationId,
          metadata: {
            client_id: body.client_id,
            chain: body.chain,
            network: body.network,
            address_hash: addressHash,
            canonicalisation_version: canon.canonicalisationVersion,
            wallet_type: body.wallet_type,
            beneficiary_relationship: body.beneficiary_relationship,
            status: "draft",
          },
        });

        // Step 16.
        await completeIdempotent(client, idemScope, destinationId);

        const row = await fetchWalletDestinationById(client, destinationId);
        if (!row) {
          throw new AppError("INTERNAL_ERROR", { message: "Newly-registered destination could not be resolved." });
        }
        return { kind: "created", row };
        }); // step 17: commit (or rollback, on any throw above)
      } catch (err) {
        // A deliberate Wlt1Error/AppError thrown above (WLT1_UNSUPPORTED_CHAIN, the idempotency-
        // mismatch VALIDATION_ERROR, the defensive INTERNAL_ERROR guards) propagates unchanged.
        // Anything else reaching here is an unexpected failure INSIDE an otherwise fully-validated
        // transaction — the only realistic cause left at this point is an audit/outbox write
        // failure (mirrors KYC-01's own roster-sync catch-order precedent: known errors pass
        // through unchanged, everything else maps to the module's own AUDIT_REQUIRED code).
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "duplicate") {
        throw new Wlt1Error("WLT1_DESTINATION_DUPLICATE");
      }
      // Step 18: safe response. Same 201 for both a fresh registration and an idempotent replay.
      return reply.code(201).send(successEnvelope(safeWalletDestinationResponse(outcome.row), meta(request)));
    },
  );

  app.get(
    "/internal/wlt1/wallet-destinations/:destination_id",
    { preHandler: requireInternal, schema: { params: DestinationIdParams } },
    async (request, reply) => {
      assertPoolAvailable();
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;
      const row = await fetchWalletDestinationById(getPool(), destination_id);
      if (!row) throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");
      return reply.send(successEnvelope(safeWalletDestinationResponse(row), meta(request)));
    },
  );
}
