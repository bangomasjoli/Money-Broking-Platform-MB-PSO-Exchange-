/**
 * WLT-01 Sensitive Read Logging (FR-018) — the ONE place a `wlt1.sensitive_destination_read`
 * audit event is constructed and published. Implements the frozen "Sensitive Read Logging
 * Implementation-Contract Architecture Addendum" exactly.
 *
 * OWNERSHIP (addendum Issue 7/8/12): SEC-01 is the canonical evidence owner, reached the SAME
 * way every other WLT-01 audit event already reaches it — `publishAudit` -> the transaction-
 * coupled `foundation.outbox_event` (`topic: "audit.event"`) -> SEC-01's own downstream
 * ingestion / hash-chained store. This module NEVER writes `sec1.*` directly and NEVER calls
 * SEC-01 over HTTP — WLT holds no grant on the `sec1` schema and no SEC-01 client exists in this
 * service (verified independently; see the accompanying source-guard tests).
 *
 * SYNCHRONOUS / FAIL-CLOSED (addendum Issue 20/21/22): the caller MUST await this function and
 * MUST NOT release the sensitive response until it resolves. `publishAudit`'s own outbox INSERT
 * is transaction-coupled — if it cannot commit, the error propagates here and is mapped to
 * `WLT1_SENSITIVE_READ_LOG_REQUIRED` (503), which the caller must then throw BEFORE building or
 * sending any sensitive response body. This is a SEPARATE, short local DB transaction — never
 * held open across a network call, never touching SEC-01 directly (addendum Issue 23).
 *
 * DATA MINIMISATION (addendup Issue 18/19): the metadata allowlist below is exhaustive. The
 * disclosed Restricted value itself (a full/canonical wallet address, a PoC message, a
 * signature, a recovered address, an account identifier, a beneficiary name, or any hash/
 * ciphertext derived from any of these) is NEVER accepted as an input to this function's own
 * metadata, by construction — the input type below has no field capable of carrying one. This
 * access log must never become a second sensitive-data store.
 *
 * IDEMPOTENT REPLAY (addendum Issue 32/33/34, load-bearing): this function is called once per
 * ACTUAL disclosure, never deduplicated via `foundation.idempotency_record` — an idempotent
 * replay of the underlying PoC action that discloses the SAME sensitive value again is a SECOND
 * disclosure and therefore produces a SECOND sensitive-read record. Callers must invoke this
 * function on every code path that is about to place a Restricted value into a response body,
 * including idempotent-replay paths — never only on the "fresh" path.
 */
import { publishAudit, withTransaction } from "@aix/foundation";
import { Wlt1Error } from "./errors.js";

/** v1 exact vocabulary (addendum Issue 13/14) — only the values this phase's own three PoC
 * routes actually need. No unused future values (`decrypt`/`export`/other resource types) are
 * reserved — there is no table/CHECK constraint to migrate later, so reserving them now would be
 * pure dead vocabulary. */
export const SENSITIVE_READ_RESOURCE_TYPE_PROOF_OF_CONTROL = "proof_of_control";
export const SENSITIVE_READ_ACCESS_ACTION_READ = "read";
export const SENSITIVE_READ_DATA_CLASS_WALLET_CANONICAL_ADDRESS = "wallet_canonical_address";

export interface LogSensitiveDestinationReadInput {
  /** `request.ctx.actor_id ?? "wlt1_internal_service"` — the SAME truthful service-level actor
   * attribution every other WLT-01 audit event already uses. Never a fabricated human/staff id. */
  actorId: string;
  /** The PoC challenge this disclosure concerns — becomes the audit envelope's `entity_id`. */
  challengeId: string;
  destinationId: string;
  clientId: string;
  chain: string;
  network: string;
  /** Optional caller-supplied business reason — mirrors SEC-01's own `reason` precedent
   * (`services/sec1/src/routes/read.ts`). No route in this phase supplies one; the field exists
   * only so a future caller with a genuine reason need not change this helper's shape. */
  reason?: string;
}

/**
 * Publishes ONE `wlt1.sensitive_destination_read` audit event in its own short local
 * transaction. Throws `Wlt1Error("WLT1_SENSITIVE_READ_LOG_REQUIRED")` if the write cannot commit
 * — the caller MUST let this propagate and MUST NOT send the sensitive response.
 */
export async function logSensitiveDestinationRead(input: LogSensitiveDestinationReadInput): Promise<void> {
  try {
    await withTransaction(async (client) => {
      await publishAudit(client, {
        event_type: "wlt1.sensitive_destination_read",
        source_module: "WLT-01",
        actor_id: input.actorId,
        actor_type: "service",
        entity_type: "proof_of_control",
        entity_id: input.challengeId,
        metadata: {
          destination_id: input.destinationId,
          client_id: input.clientId,
          resource_type: SENSITIVE_READ_RESOURCE_TYPE_PROOF_OF_CONTROL,
          access_action: SENSITIVE_READ_ACCESS_ACTION_READ,
          disclosed_data_class: SENSITIVE_READ_DATA_CLASS_WALLET_CANONICAL_ADDRESS,
          chain: input.chain,
          network: input.network,
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
        },
      });
    });
  } catch (err) {
    throw new Wlt1Error("WLT1_SENSITIVE_READ_LOG_REQUIRED", { cause: err });
  }
}
