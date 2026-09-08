/**
 * SEC-01 tamper/gap detection helper (SEC1-FR-007 — a small, pure, easily-testable building
 * block for a LATER integrity-verification job; no job/schedule/alert is built this pass, only
 * the detection logic itself, per the task brief: "a small integrity-check helper — optional,
 * only if it fits cleanly").
 *
 * Given a stream's rows ordered by `sequence_no` ascending, detects:
 *   - sequence gaps (a missing sequence_no — rows are not contiguous from the first row's
 *     sequence_no)
 *   - hash-chain breaks (a row's stored `previous_hash` does not equal the prior row's stored
 *     `event_hash`, OR a row's recomputed `event_hash` no longer matches what is stored —
 *     tampering)
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { computeEventHash, CANONICAL_FORMAT_VERSION_V2, type CanonicalEventFields } from "./canonical.js";
import { Sec1Error } from "./errors.js";

export interface ChainRow {
  sequence_no: number;
  previous_hash: string | null;
  event_hash: string;
  /** Present only when the caller wants tamper (recompute-mismatch) detection, not just gap/link detection. */
  canonicalFields?: CanonicalEventFields;
}

export interface ChainVerificationResult {
  gapAt: number[];
  brokenLinkAt: number[];
  hashMismatchAt: number[];
  pass: boolean;
}

export function verifyChainSegment(rows: readonly ChainRow[]): ChainVerificationResult {
  const gapAt: number[] = [];
  const brokenLinkAt: number[] = [];
  const hashMismatchAt: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (i > 0) {
      const prev = rows[i - 1];
      if (prev && row.sequence_no !== prev.sequence_no + 1) {
        gapAt.push(row.sequence_no);
      }
      if (prev && row.previous_hash !== prev.event_hash) {
        brokenLinkAt.push(row.sequence_no);
      }
    } else if (row.previous_hash !== null) {
      // First row in the segment carries a non-null previous_hash but we have nothing to
      // compare it to in THIS segment — not itself flagged as broken here (a full-stream
      // verification run would carry the true prior segment's tail hash in; a partial-segment
      // check like this one cannot know if it's genuinely the stream's genesis row).
    }
    if (row.canonicalFields) {
      const recomputed = computeEventHash(row.canonicalFields, row.previous_hash);
      if (recomputed !== row.event_hash) {
        hashMismatchAt.push(row.sequence_no);
      }
    }
  }

  return {
    gapAt,
    brokenLinkAt,
    hashMismatchAt,
    pass: gapAt.length === 0 && brokenLinkAt.length === 0 && hashMismatchAt.length === 0,
  };
}

/**
 * SEC-01 Phase 3 DB-backed integrity-verification RUN (blueprint §2.11; approved plan §6).
 * A separate, related mechanism from seal verification (lib/seal.ts's `verifySealBatch`) —
 * this checks ANY stream range on demand, sealed or not, and persists one
 * `sec1.integrity_verification_run` row per invocation. It is genuinely low-risk: it wires
 * the already-tested pure `verifyChainSegment` above to persistence, adding no new
 * verification LOGIC of its own.
 *
 * Reconstructs each row's `CanonicalEventFields` using THAT ROW'S OWN `canonical_format_version`
 * (§L1 versioning, canonical.ts) — a mixed-version range (v1 rows ingested before Phase 3,
 * v2 rows ingested after) is handled correctly because each row is reconstructed under its
 * own formula, never a single formula applied uniformly across the whole range.
 *
 * Read-only against `sec1.audit_event` — only ever SELECTs from it; the sole write is the
 * single INSERT into `sec1.integrity_verification_run`.
 */
export interface IntegrityVerificationRunInput {
  streamId: string;
  fromSequenceNo: number;
  toSequenceNo: number;
}

export interface IntegrityVerificationRunFindings {
  gapAt: number[];
  brokenLinkAt: number[];
  hashMismatchAt: number[];
}

export interface IntegrityVerificationRunResult {
  verification_id: string;
  stream_id: string;
  from_sequence_no: number;
  to_sequence_no: number;
  result: "pass" | "fail";
  gap_count: number;
  mismatch_count: number;
  findings: IntegrityVerificationRunFindings;
  run_at_utc: string;
}

interface StoredEventRowForVerification {
  event_id: string;
  source_module: string;
  event_type: string;
  event_category: string | null;
  severity: string;
  actor_user_id: string | null;
  actor_type: string;
  session_id: string | null;
  client_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action: string;
  result: string;
  reason_code: string | null;
  request_id: string;
  correlation_id: string;
  occurred_at_utc: Date;
  source_emission_sequence: string | null;
  source_emission_stream: string | null;
  idempotency_key: string;
  metadata_redacted: Record<string, unknown>;
  classification: string;
  retention_class: string;
  canonical_format_version: number;
  sequence_no: string;
  previous_hash: string | null;
  event_hash: string;
}

export async function runIntegrityVerification(
  client: PoolClient,
  input: IntegrityVerificationRunInput,
): Promise<IntegrityVerificationRunResult> {
  const selected = await client.query<StoredEventRowForVerification>(
    `SELECT event_id, source_module, event_type, event_category, severity, actor_user_id, actor_type,
            session_id, client_id, entity_type, entity_id, action, result, reason_code, request_id,
            correlation_id, occurred_at_utc, source_emission_sequence, source_emission_stream,
            idempotency_key, metadata_redacted, classification, retention_class,
            canonical_format_version, sequence_no, previous_hash, event_hash
       FROM sec1.audit_event
      WHERE stream_id = $1 AND sequence_no BETWEEN $2 AND $3
      ORDER BY sequence_no ASC`,
    [input.streamId, input.fromSequenceNo, input.toSequenceNo],
  );

  const chainRows: ChainRow[] = selected.rows.map((row) => {
    const canonicalFields: CanonicalEventFields = {
      event_id: row.event_id,
      source_module: row.source_module,
      event_type: row.event_type,
      event_category: row.event_category,
      severity: row.severity,
      actor_user_id: row.actor_user_id,
      actor_type: row.actor_type,
      session_id: row.session_id,
      client_id: row.client_id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      result: row.result,
      reason_code: row.reason_code,
      request_id: row.request_id,
      correlation_id: row.correlation_id,
      occurred_at_utc: row.occurred_at_utc.toISOString(),
      source_emission_sequence: row.source_emission_sequence === null ? null : Number(row.source_emission_sequence),
      source_emission_stream: row.source_emission_stream,
      idempotency_key: row.idempotency_key,
      metadata_redacted: row.metadata_redacted,
      // §L1: only a v2+ row had classification/retention_class bound into its hash at
      // ingest time. Reconstructing a v1 row WITH these fields populated would recompute a
      // DIFFERENT hash than what it was actually hashed under, falsely reporting tamper on
      // an untampered legacy row — so a v1 row must omit them (leave undefined) here.
      ...(row.canonical_format_version >= CANONICAL_FORMAT_VERSION_V2
        ? { classification: row.classification, retention_class: row.retention_class }
        : {}),
    };
    return {
      sequence_no: Number(row.sequence_no),
      previous_hash: row.previous_hash,
      event_hash: row.event_hash,
      canonicalFields,
    };
  });

  const verification = verifyChainSegment(chainRows);
  const verificationId = "iv_" + randomUUID();
  const findings: IntegrityVerificationRunFindings = {
    gapAt: verification.gapAt,
    brokenLinkAt: verification.brokenLinkAt,
    hashMismatchAt: verification.hashMismatchAt,
  };
  const result: "pass" | "fail" = verification.pass ? "pass" : "fail";

  const inserted = await client.query<{
    verification_id: string;
    stream_id: string;
    from_sequence_no: string;
    to_sequence_no: string;
    result: string;
    gap_count: number;
    mismatch_count: number;
    findings: IntegrityVerificationRunFindings;
    run_at_utc: Date;
  }>(
    `INSERT INTO sec1.integrity_verification_run
       (verification_id, stream_id, from_sequence_no, to_sequence_no, result, gap_count, mismatch_count, findings, run_at_utc)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     RETURNING verification_id, stream_id, from_sequence_no, to_sequence_no, result, gap_count, mismatch_count, findings, run_at_utc`,
    [
      verificationId,
      input.streamId,
      input.fromSequenceNo,
      input.toSequenceNo,
      result,
      verification.gapAt.length,
      verification.hashMismatchAt.length,
      JSON.stringify(findings),
    ],
  );

  const row = inserted.rows[0];
  if (!row) {
    throw new Sec1Error("SEC1_AUDIT_PERSIST_FAILED", {
      message: "Integrity verification run could not be persisted.",
    });
  }

  return {
    verification_id: row.verification_id,
    stream_id: row.stream_id,
    from_sequence_no: Number(row.from_sequence_no),
    to_sequence_no: Number(row.to_sequence_no),
    result: row.result as "pass" | "fail",
    gap_count: Number(row.gap_count),
    mismatch_count: Number(row.mismatch_count),
    findings: row.findings,
    run_at_utc: row.run_at_utc.toISOString(),
  };
}

/**
 * P3-L1 gap patch (Opus review, docs/SEC-01_Phase3_Security_Review_Opus_v0.1.md): looks up a
 * previously-persisted `integrity_verification_run` row by its `verification_id`, so
 * `routes/integrity.ts` can return the ORIGINAL recorded response on an idempotent replay
 * (same `Idempotency-Key` + same body) instead of calling `runIntegrityVerification` again and
 * inserting a second run row for what should be a single logical request. Read-only — never
 * mutates `audit_event` or `integrity_verification_run`.
 */
export async function getIntegrityVerificationRunById(
  client: PoolClient,
  verificationId: string,
): Promise<IntegrityVerificationRunResult | null> {
  const result = await client.query<{
    verification_id: string;
    stream_id: string;
    from_sequence_no: string;
    to_sequence_no: string;
    result: string;
    gap_count: number;
    mismatch_count: number;
    findings: IntegrityVerificationRunFindings;
    run_at_utc: Date;
  }>(
    `SELECT verification_id, stream_id, from_sequence_no, to_sequence_no, result, gap_count, mismatch_count, findings, run_at_utc
       FROM sec1.integrity_verification_run
      WHERE verification_id = $1`,
    [verificationId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    verification_id: row.verification_id,
    stream_id: row.stream_id,
    from_sequence_no: Number(row.from_sequence_no),
    to_sequence_no: Number(row.to_sequence_no),
    result: row.result as "pass" | "fail",
    gap_count: Number(row.gap_count),
    mismatch_count: Number(row.mismatch_count),
    findings: row.findings,
    run_at_utc: row.run_at_utc.toISOString(),
  };
}
