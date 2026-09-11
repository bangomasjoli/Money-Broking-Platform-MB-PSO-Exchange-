/**
 * WLT-01 Public Client Surface — `POST /wlt1/wallet-destinations`. A client-safe public
 * projection of the already-accepted internal wallet-registration capability
 * (`routes/wallet-destinations.ts`) — same underlying lib functions (address canonicalisation,
 * chain-coverage, natural-key duplicate detection, refusal-evidence recording), same
 * registration-transaction shape, same audit events (including the address-integrity evidence
 * chain — `wlt1.address_integrity_check` + `wlt1.address_integrity_checked`, blueprint High
 * severity, WLT1-RISK-018). The ONLY differences from the internal route: `client_id` is ALWAYS
 * server-derived from the public-auth chain (never accepted in the body — no `client_id` field in
 * this schema at all), the actor attribution is the authenticated human end-user (not the generic
 * `wlt1_internal_service`), the idempotency action namespace is public-distinct
 * (`wlt1.public.wallet_destination.register`, never colliding with the internal
 * `wlt1.wallet_destination.register`), the idempotency scope's `actorId` additionally binds the
 * derived `client_id` (see `publicIdempotencyActorId` — a caller holding memberships in more than
 * one client can never have one client's idempotent-replay result returned for another, since the
 * foundation scope key has no independent client column of its own), an FND-01 rate-limit check
 * runs before idempotency, and the response is projected through the public-safe DTO (no
 * `client_id`).
 *
 * ORDER: requirePublicClientAuthority -> FND-01 rate-limit check (MUTATE_REGISTER/client) ->
 * CLT-01 client-status check (unchanged from internal route) -> address canonicalisation ->
 * registration transaction (idempotency -> chain-coverage re-read -> natural-key re-check ->
 * inserts -> address-integrity evidence -> audit -> idempotency completion -> commit) ->
 * public-safe response.
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
  successEnvelope,
  withTransaction,
  query,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../../plugins/request-context.js";
import { makePublicClientAuthorityGuard, checkPublicRateLimit, publicIdempotencyActorId } from "../../plugins/public-auth.js";
import { canonicaliseAddress } from "../../lib/address/index.js";
import { checkClientStatus, type Clt1ClientConfig } from "../../lib/clt1-client.js";
import { fetchActiveChainCoverage } from "../../lib/chain-coverage.js";
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
  recordRefusal,
  takeRegistrationLock,
} from "../../lib/destinations.js";
import { publicWalletDestinationResponse } from "../../lib/public/dto.js";
import type { WalletDestinationRow } from "../../lib/safe-response.js";
import { Wlt1Error, type Wlt1ErrorCode } from "../../lib/errors.js";
import type { Wlt1Config } from "../../config.js";

const WALLET_TYPES = ["hosted", "unhosted", "unknown"] as const;
const BENEFICIARY_RELATIONSHIPS = ["self", "related_party", "third_party"] as const;
const CHAIN_NETWORK_PATTERN = "^[a-z0-9_]+$";

const RegisterWalletDestinationBody = Type.Object(
  {
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

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function clt1Config(config: Wlt1Config): Clt1ClientConfig {
  return { baseUrl: config.clt1BaseUrl, internalServiceToken: config.clt1InternalServiceToken, fetchImpl: config.clt1FetchImpl };
}

function mapAddressReasonCode(reasonCode: string): Wlt1ErrorCode {
  if (reasonCode === "unsupported_chain") return "WLT1_UNSUPPORTED_CHAIN";
  if (reasonCode === "alias_shaped_input") return "WLT1_NAME_SERVICE_ALIAS_NOT_ALLOWED";
  if (reasonCode === "invalid_eip55_checksum" || reasonCode === "invalid_base58check_checksum") {
    return "WLT1_ADDRESS_CANONICALISATION_FAILED";
  }
  return "WLT1_WALLET_ADDRESS_INVALID";
}

type RegistrationOutcome = { kind: "created" | "idempotent_replay"; row: WalletDestinationRow } | { kind: "duplicate" };

export async function registerPublicWalletDestinationRoutes(app: FastifyInstance): Promise<void> {
  const requireAuthority = makePublicClientAuthorityGuard();

  app.post(
    "/wlt1/wallet-destinations",
    { preHandler: requireAuthority, schema: { body: RegisterWalletDestinationBody } },
    async (request, reply) => {
      assertPoolAvailable();
      const config = app.config as Wlt1Config;
      const { clientId, iamUserId } = request.publicAuth!;
      const body = request.body as RegisterWalletDestinationBody;
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = iamUserId;

      // FND-01 rate-limit check — BEFORE idempotency/business mutation (frozen ordering).
      await checkPublicRateLimit(config, { bucket: "MUTATE_REGISTER", subjectType: "client", subjectId: clientId });

      // CLT-01 client-status check, OUTSIDE any transaction — unchanged from the internal route.
      const clt = await checkClientStatus(clt1Config(config), clientId);
      if (!clt.eligible) {
        await recordRefusal({ clientId, reasonCode: clt.reasonCode, actorId, actorType: "user" });
        throw new Wlt1Error(clt.reasonCode === "clt1_unavailable" ? "WLT1_CLT1_UNAVAILABLE" : "WLT1_CLIENT_STATUS_BLOCKED");
      }

      // Deterministic address canonicalisation + integrity, pure in-process — same evidence shape
      // as the internal route (`rawAddressHash` computed unconditionally, before canon.ok is known,
      // since a refusal needs it too).
      const memoTagInput = body.memo_tag ?? "";
      const rawAddressHash = fingerprint({ chain: body.chain, network: body.network, raw_address: body.address, memo_tag: memoTagInput });
      const canon = canonicaliseAddress(body.chain, body.network, body.address, body.memo_tag);
      if (!canon.ok) {
        await recordRefusal({
          clientId,
          reasonCode: canon.reasonCode,
          actorId,
          actorType: "user",
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

      const memoTagIdentity = ""; // both supported chains forbid memo/tag; canon.ok already proved this
      const addressHash = computeAddressHash(body.chain, body.network, canon.canonicalAddress, memoTagIdentity);
      const naturalKeyHash = computeNaturalKeyHash(clientId, WALLET_DESTINATION_TYPE, addressHash);

      const idemScope: IdempotencyScope = {
        // Binds BOTH the authenticated human actor AND the derived client authority — the
        // foundation idempotency scope key has no independent client column (see
        // packages/foundation/src/idempotency.ts's own header comment), so without this a caller
        // holding memberships in more than one client could submit the identical Idempotency-Key
        // and body narrowed to a DIFFERENT client on each call and silently receive the FIRST
        // client's result on the second. `actor_id` here is an idempotency-uniqueness key only —
        // audit attribution below always uses the plain `actorId` (iamUserId).
        actorId: publicIdempotencyActorId(actorId, clientId),
        actorType: "user",
        // Public-distinct namespace — never collides with the internal
        // "wlt1.wallet_destination.register" action even under the same actorId.
        action: "wlt1.public.wallet_destination.register",
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
            const existingRow = await fetchWalletDestinationById(client, idem.resultRef as string);
            if (!existingRow) {
              throw new AppError("INTERNAL_ERROR", { message: "Idempotent replay target destination could not be resolved." });
            }
            return { kind: "idempotent_replay", row: existingRow };
          }

          const coverage = await fetchActiveChainCoverage(client, body.chain, body.network);
          if (!coverage) {
            throw new Wlt1Error("WLT1_UNSUPPORTED_CHAIN");
          }

          const existing = await fetchWalletDestinationByNaturalKey(client, naturalKeyHash);
          if (existing) {
            await publishAudit(client, {
              event_type: "wlt1.destination_registration_refused",
              source_module: "WLT-01",
              actor_id: actorId,
              actor_type: "user",
              entity_type: "destination_registration",
              entity_id: existing.destination_id,
              metadata: { client_id: clientId, chain: body.chain, network: body.network, reason_code: "destination_already_registered" },
            });
            await completeIdempotent(client, idemScope, IDEMPOTENCY_REFUSED_RESULT_REF);
            return { kind: "duplicate" };
          }

          const destinationId = newDestinationId();
          const checkId = newAddressCheckId();

          try {
            await query(
              client,
              `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status, client_status_ref)
               VALUES ($1, $2, $3, $4, 'draft', $5)`,
              [destinationId, clientId, WALLET_DESTINATION_TYPE, naturalKeyHash, clt.status],
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
            [checkId, destinationId, clientId, body.chain, body.network, rawAddressHash, addressHash, canon.canonicalisationVersion],
          );

          await publishAudit(client, {
            event_type: "wlt1.address_integrity_checked",
            source_module: "WLT-01",
            actor_id: actorId,
            actor_type: "user",
            entity_type: "address_integrity_check",
            entity_id: checkId,
            metadata: {
              destination_id: destinationId,
              client_id: clientId,
              chain: body.chain,
              network: body.network,
              raw_address_hash: rawAddressHash,
              canonical_address_hash: addressHash,
              canonicalisation_version: canon.canonicalisationVersion,
              checksum_valid: true,
              result_status: "pass",
              reason_code: "canonicalisation_succeeded",
              public_surface: true,
            },
          });

          await publishAudit(client, {
            event_type: "wlt1.wallet_registered",
            source_module: "WLT-01",
            actor_id: actorId,
            actor_type: "user",
            entity_type: "destination",
            entity_id: destinationId,
            metadata: {
              client_id: clientId,
              chain: body.chain,
              network: body.network,
              address_hash: addressHash,
              canonicalisation_version: canon.canonicalisationVersion,
              wallet_type: body.wallet_type,
              beneficiary_relationship: body.beneficiary_relationship,
              status: "draft",
              public_surface: true,
            },
          });

          await completeIdempotent(client, idemScope, destinationId);

          const row = await fetchWalletDestinationById(client, destinationId);
          if (!row) {
            throw new AppError("INTERNAL_ERROR", { message: "Newly-registered destination could not be resolved." });
          }
          return { kind: "created", row };
        });
      } catch (err) {
        if (err instanceof Wlt1Error || err instanceof AppError) throw err;
        throw new Wlt1Error("WLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "duplicate") {
        throw new Wlt1Error("WLT1_DESTINATION_DUPLICATE");
      }
      return reply.code(201).send(successEnvelope(publicWalletDestinationResponse(outcome.row), meta(request)));
    },
  );
}
