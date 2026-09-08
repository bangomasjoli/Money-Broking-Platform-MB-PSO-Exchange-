/**
 * SEC-01 internal seal stub (SEC1-FR-006, scoped-down for Phase 0-2 per the task brief: "an
 * internal seal stub only... Do not claim external WORM/timestamp authority").
 *
 * `sealBatch` computes a batch hash over a contiguous `sequence_no` range of one stream (a
 * hash-of-hashes: sha256 of the ordered concatenation of each row's `event_hash`) and records
 * one `sec1.audit_seal_batch` row with:
 *   - `seal_method = 'internal'`
 *   - `external_anchor_ref = null`
 *   - `trusted_timestamp_ref = null`
 *   - `verification_status = 'pending'`
 *
 * This is EXPLICITLY NON-AUTHORITATIVE for production external evidence (05_5.5A: "seal_method
 * = external is mandatory for authoritative production audit sealing... Internal seal is
 * allowed only for development/test or pre-production non-authoritative evidence"). Real
 * WORM/object-lock storage, a real trusted timestamp authority, and the verification job that
 * would flip `verification_status` are ALL deferred — this function only proves the SHAPE of
 * batch sealing exists (a library function, no HTTP route this pass, per the task brief: "an
 * HTTP route is optional").
 */
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { AppError } from "@aix/foundation";
import { Sec1Error } from "./errors.js";

export interface SealBatchInput {
  streamId: string;
  fromSequenceNo: number;
  toSequenceNo: number;
  /** Identity of whoever invoked the seal — recorded for the SoD/"operator != seal controller" governance rule that a LATER phase enforces; not enforced here. */
  sealControllerId: string;
}

export interface SealBatchResult {
  sealBatchId: string;
  batchHash: string;
  sealMethod: "internal";
  externalAnchorRef: null;
  trustedTimestampRef: null;
  verificationStatus: "pending";
}

export async function sealBatch(client: PoolClient, input: SealBatchInput): Promise<SealBatchResult> {
  const rows = await client.query<{ event_hash: string }>(
    `SELECT event_hash FROM sec1.audit_event
      WHERE stream_id = $1 AND sequence_no BETWEEN $2 AND $3
      ORDER BY sequence_no ASC`,
    [input.streamId, input.fromSequenceNo, input.toSequenceNo],
  );
  if (rows.rows.length === 0) {
    throw new Sec1Error("SEC1_HASH_CHAIN_UNAVAILABLE", {
      message: "No audit events found in the requested seal range.",
    });
  }
  const batchHash = createHash("sha256")
    .update(rows.rows.map((r) => r.event_hash).join("|"), "utf8")
    .digest("hex");
  const sealBatchId = "seal_" + randomUUID();

  await client.query(
    `INSERT INTO sec1.audit_seal_batch
       (seal_batch_id, stream_id, from_sequence_no, to_sequence_no, batch_hash, seal_method,
        sealed_at_utc, external_anchor_ref, object_lock_retention_until_utc, trusted_timestamp_ref,
        trusted_timestamp_utc, verification_status, seal_controller_id)
     VALUES ($1,$2,$3,$4,$5,'internal', now(), NULL, NULL, NULL, NULL, 'pending', $6)`,
    [sealBatchId, input.streamId, input.fromSequenceNo, input.toSequenceNo, batchHash, input.sealControllerId],
  );

  return {
    sealBatchId,
    batchHash,
    sealMethod: "internal",
    externalAnchorRef: null,
    trustedTimestampRef: null,
    verificationStatus: "pending",
  };
}

/**
 * SEC-01 Phase 3 seal VERIFICATION (extends the creation-only stub above; SEC1-FR-006
 * continuation, approved plan §5). Recomputes the batch hash from the stored `event_hash`
 * values over the seal's OWN recorded `[from_sequence_no, to_sequence_no]` range, using the
 * EXACT SAME concatenation/hashing method `sealBatch` above already uses (ordered
 * `event_hash` values joined with `"|"`, sha256), and compares it to the stored `batch_hash`.
 *
 * Writes ONLY `verification_status` — structurally cannot write `seal_method`,
 * `external_anchor_ref`, or `trusted_timestamp_ref`: those three columns simply do not appear
 * anywhere in this function's UPDATE statement's write set, so there is no code path here that
 * could ever "promote" an internal seal to look externally anchored. The narrowly-scoped
 * column-level grant (`GRANT UPDATE (verification_status) ON sec1.audit_seal_batch`,
 * infra/grants/sec1_runtime_grants.sql) enforces the same restriction independently at the DB
 * layer — belt and braces, not a substitute for each other.
 *
 * `production_authoritative` is unconditionally `false` this phase — every seal batch created
 * this phase has `seal_method = 'internal'` (no external-anchor code path exists AT ALL — see
 * lib/external-anchor.ts's header comment), so this is never conditional on a branch that
 * could ever evaluate to `true` yet. That would itself be the "no fake external anchor"
 * violation this phase must not commit.
 */
export interface VerifySealBatchResult {
  seal_batch_id: string;
  verification_status: "valid" | "failed";
  recomputed_batch_hash: string;
  stored_batch_hash: string;
  production_authoritative: false;
}

export async function verifySealBatch(client: PoolClient, sealBatchId: string): Promise<VerifySealBatchResult> {
  const sealRes = await client.query<{
    seal_batch_id: string;
    stream_id: string;
    from_sequence_no: string;
    to_sequence_no: string;
    batch_hash: string;
  }>(
    `SELECT seal_batch_id, stream_id, from_sequence_no, to_sequence_no, batch_hash
       FROM sec1.audit_seal_batch
      WHERE seal_batch_id = $1`,
    [sealBatchId],
  );
  const seal = sealRes.rows[0];
  if (!seal) {
    // No SEC-01-specific code fits "seal batch not found" (SEC1_ERROR_CODES is scoped to what
    // ingestion can throw) — reuse the generic foundation NOT_FOUND rather than add a new
    // catalogue entry for a single call site.
    throw new AppError("NOT_FOUND", {
      message: "Seal batch not found.",
      details: [{ field: "seal_batch_id", issue: "no matching seal batch" }],
    });
  }

  const rows = await client.query<{ event_hash: string }>(
    `SELECT event_hash FROM sec1.audit_event
      WHERE stream_id = $1 AND sequence_no BETWEEN $2 AND $3
      ORDER BY sequence_no ASC`,
    [seal.stream_id, seal.from_sequence_no, seal.to_sequence_no],
  );
  const recomputedBatchHash = createHash("sha256")
    .update(rows.rows.map((r) => r.event_hash).join("|"), "utf8")
    .digest("hex");

  const verificationStatus: "valid" | "failed" = recomputedBatchHash === seal.batch_hash ? "valid" : "failed";

  // Write set is ONLY verification_status — see header comment above for why this is
  // structural, not incidental.
  await client.query(`UPDATE sec1.audit_seal_batch SET verification_status = $2 WHERE seal_batch_id = $1`, [
    sealBatchId,
    verificationStatus,
  ]);

  return {
    seal_batch_id: sealBatchId,
    verification_status: verificationStatus,
    recomputed_batch_hash: recomputedBatchHash,
    stored_batch_hash: seal.batch_hash,
    production_authoritative: false,
  };
}
