/**
 * SEC-01 per-stream hash-chain sequencing (SEC1-FR-005; IAM-02 F2 lesson applied from day one —
 * see docs/implementation/IAM-02_IMPLEMENTATION_NOTES.md §10.2 / the task brief's "S1"/"F2"
 * notes). `sequence_no`/`previous_hash` assignment MUST happen via `SELECT ... FOR UPDATE`
 * row-locking on the stream's own row, held for the full duration of the ingest transaction —
 * never a racy read-then-write, and never two queries that mutate/read the SAME stream row
 * concurrently on one PoolClient outside of strict sequential awaits.
 *
 * Stream derivation (judgment call, since no stream-registration API exists this pass): one
 * hash-chain stream per source module by default (`stream_id = source_module`), OR, when the
 * caller supplies `source_emission_stream`, a composite `"<source_module>:<source_emission_
 * stream>"` — this keeps `stream_id` deterministic and collision-free across modules without
 * requiring an admin API to pre-register streams (05_Database_Design.md's `sec1.audit_stream`
 * table exists precisely to hold this state; nothing else in Phase 0-2 writes to it).
 */
import type { PoolClient } from "pg";
import { Sec1Error } from "./errors.js";

export function deriveStreamId(sourceModule: string, sourceEmissionStream?: string | null): string {
  return sourceEmissionStream ? `${sourceModule}:${sourceEmissionStream}` : sourceModule;
}

export interface LockedStream {
  streamId: string;
  latestSequenceNo: number;
  latestHash: string | null;
}

/**
 * Ensure the stream row exists (idempotent create via `ON CONFLICT (stream_id) DO NOTHING`),
 * then lock it with `FOR UPDATE` for the remainder of the caller's transaction. Concurrent
 * ingest calls targeting the SAME stream serialize on this lock — the mechanism the required
 * concurrency test (tests/integration/sec1-db.test.ts) proves is real, not just documented.
 */
export async function lockStreamForUpdate(
  client: PoolClient,
  streamId: string,
  sourceModule: string,
  streamType: "module" | "global" | "client" | "entity" = "module",
): Promise<LockedStream> {
  await client.query(
    `INSERT INTO sec1.audit_stream (stream_id, stream_type, source_module, latest_sequence_no, latest_hash, status, updated_at_utc)
     VALUES ($1, $2, $3, 0, NULL, 'active', now())
     ON CONFLICT (stream_id) DO NOTHING`,
    [streamId, streamType, sourceModule],
  );
  const res = await client.query<{ latest_sequence_no: string; latest_hash: string | null }>(
    `SELECT latest_sequence_no, latest_hash FROM sec1.audit_stream WHERE stream_id = $1 FOR UPDATE`,
    [streamId],
  );
  const row = res.rows[0];
  if (!row) {
    // Unreachable in practice (the INSERT above guarantees the row exists before this SELECT
    // runs on the SAME transaction) — fail closed rather than silently proceed with no lock.
    throw new Sec1Error("SEC1_HASH_CHAIN_UNAVAILABLE", {
      message: "Audit stream state could not be locked.",
    });
  }
  return {
    streamId,
    latestSequenceNo: Number(row.latest_sequence_no),
    latestHash: row.latest_hash,
  };
}

/** Advance the stream pointer AFTER the audit_event insert is confirmed to have landed. */
export async function advanceStream(
  client: PoolClient,
  streamId: string,
  newSequenceNo: number,
  newHash: string,
): Promise<void> {
  await client.query(
    `UPDATE sec1.audit_stream SET latest_sequence_no = $2, latest_hash = $3, updated_at_utc = now() WHERE stream_id = $1`,
    [streamId, newSequenceNo, newHash],
  );
}
