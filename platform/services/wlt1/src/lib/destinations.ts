/**
 * WLT-01 Phase 1B — wallet-destination identity, natural-key hashing, and read helpers.
 *
 * Natural-key design (architecture plan §12): the wallet natural identity is
 * `(client_id, chain, network, canonical_address_hash, memo_tag_identity)`. `destination_id` is
 * only the external opaque SURROGATE — never the natural identity, never the sole binding for
 * duplicate detection.
 *
 * Both hashes are computed via `@aix/foundation`'s `fingerprint()` (sorted-key canonical-JSON
 * SHA-256) rather than any hand-rolled string concatenation — JSON string encoding escapes quotes/
 * backslashes, so two structurally different inputs can never collide onto the same canonical
 * JSON text the way an ambiguous delimiter-joined string could (e.g. `"a"+"bc"` vs `"ab"+"c"`).
 * `address_hash` (per §5.25 rule 8 of the blueprint: "address hash must be based on canonical raw
 * address, chain and network — never the address alone") is computed first, over
 * `{chain, network, canonical_address, memo_tag_identity}`; `natural_key_hash` is computed over
 * `{client_id, destination_type, address_hash}`, folding the first hash in rather than
 * re-serializing the raw address a second time.
 */
import type { Sql } from "@aix/foundation";
import { fingerprint, publishAudit, query, withTransaction } from "@aix/foundation";
import { randomUUID } from "node:crypto";
import type { WalletDestinationRow } from "./safe-response.js";
import { Wlt1Error } from "./errors.js";

export const WALLET_DESTINATION_TYPE = "wallet";

/** MUST be the first business SQL statement inside the registration/refusal transaction, and MUST
 * NOT be held across an HTTP call. Client-scoped (not destination-scoped) because at registration
 * time no `destination_id` exists yet — mirrors KYC-01's own `takeKycApplicationLock` /
 * CFG-01's own kill-switch lock precedent for the identical "one namespace, first statement in the
 * transaction" idiom. */
export async function takeRegistrationLock(client: Sql, clientId: string): Promise<void> {
  await query(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination_registration:${clientId}`]);
}

/** Sentinel `result_ref` value `completeIdempotent` stores for a request that was durably
 * REFUSED (no destination created) — distinguishes "this key's request was tried and refused" from
 * a real `destination_id` on idempotent replay, so a replay of a refused request deterministically
 * re-refuses rather than mis-resolving to a nonexistent destination. */
export const IDEMPOTENCY_REFUSED_RESULT_REF = "refused";

export function newDestinationId(): string {
  return "wlt1dest_" + randomUUID();
}

export function newAddressCheckId(): string {
  return "wlt1check_" + randomUUID();
}

export function computeAddressHash(chain: string, network: string, canonicalAddress: string, memoTagIdentity: string): string {
  return fingerprint({ chain, network, canonical_address: canonicalAddress, memo_tag_identity: memoTagIdentity });
}

export function computeNaturalKeyHash(clientId: string, destinationType: string, addressHash: string): string {
  return fingerprint({ client_id: clientId, destination_type: destinationType, address_hash: addressHash });
}

/** Detects migration 049's partial unique index violation (`idx_wlt1_destination_natural_key`) so
 * the registration route can map it to `WLT1_DESTINATION_DUPLICATE` instead of a generic error —
 * mirrors KYC-01's own `isDuplicateActiveCaseViolation` / AML-01's own
 * `isInFlightDuplicateViolation` precedent for the identical "named partial unique index ->
 * specific error code" pattern. */
export function isDuplicateNaturalKeyViolation(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === "23505" && pgErr?.constraint === "idx_wlt1_destination_natural_key";
}

export async function fetchWalletDestinationById(sql: Sql, destinationId: string): Promise<WalletDestinationRow | undefined> {
  const rows = await query<WalletDestinationRow>(
    sql,
    `SELECT d.destination_id, d.client_id, d.destination_type, d.status,
            w.chain, w.network, w.canonical_address, w.memo_tag_identity, w.canonicalisation_version,
            w.wallet_type, w.beneficiary_relationship,
            d.whitelist_version, d.revocation_epoch, d.created_at_utc
       FROM wlt1.destination d
       JOIN wlt1.wallet_destination w ON w.destination_id = d.destination_id
      WHERE d.destination_id = $1`,
    [destinationId],
  );
  return rows[0];
}

export async function fetchWalletDestinationByNaturalKey(sql: Sql, naturalKeyHash: string): Promise<WalletDestinationRow | undefined> {
  const rows = await query<WalletDestinationRow>(
    sql,
    `SELECT d.destination_id, d.client_id, d.destination_type, d.status,
            w.chain, w.network, w.canonical_address, w.memo_tag_identity, w.canonicalisation_version,
            w.wallet_type, w.beneficiary_relationship,
            d.whitelist_version, d.revocation_epoch, d.created_at_utc
       FROM wlt1.destination d
       JOIN wlt1.wallet_destination w ON w.destination_id = d.destination_id
      WHERE d.natural_key_hash = $1 AND d.status <> 'revoked'`,
    [naturalKeyHash],
  );
  return rows[0];
}

export interface RefusalInput {
  clientId: string;
  reasonCode: string;
  /** Attribution for the refusal-evidence audit trail — the internal route's own generic
   * `wlt1_internal_service`/`service`, or the public route's own authenticated human actor
   * (`iamUserId`/`user`). Both callers already have this identity resolved before any refusal
   * can occur (internal: preHandler service-identity guard; public: `requirePublicClientAuthority`
   * preHandler) — never fabricated inside this function. */
  actorId: string;
  actorType: "user" | "service";
  /** Present only for a refusal that occurred AFTER address parsing was attempted — a CLT-01
   * status refusal has none of these. */
  addressStage?: {
    chain: string;
    network: string;
    rawAddressHash: string;
    canonicalAddressHash: string | null;
    canonicalisationVersion: string | null;
    checksumValid: boolean;
  };
}

/**
 * Records durable refusal evidence for a wallet-destination-registration refusal that occurs
 * BEFORE any registration transaction opens (CLT-01 status blocked/unavailable, or address
 * canonicalisation/integrity failure) — the shared evidence-persistence helper both the internal
 * (`routes/wallet-destinations.ts`) and public (`routes/public/wallet-destinations.ts`) routes
 * reuse identically, so the two surfaces never diverge in what evidence a refusal produces.
 *
 * Runs in its OWN short-lived transaction, taking the SAME client-scoped lock namespace as
 * registration, so refusal and registration attempts for the same client are always serialized
 * against each other in one consistent order. If this transaction's own audit publish fails, it
 * rolls back and the caller sees `WLT1_AUDIT_REQUIRED` — a refusal is never claimed as durably
 * recorded when it was not (blueprint `wlt1.address_integrity_checked` is High-severity evidence,
 * mapped to WLT1-RISK-018 — address poisoning/canonicalisation-loss risk).
 */
export async function recordRefusal(input: RefusalInput): Promise<void> {
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
        actor_id: input.actorId,
        actor_type: input.actorType,
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
      actor_id: input.actorId,
      actor_type: input.actorType,
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
