/**
 * SEC-01 Phase 2 audit ingestion core (SEC1-FR-002/003/004/005/018; 04_API_Specification.md
 * §2.1/§2.2). One function, `ingestAuditEvent`, used by BOTH the single-event and batch
 * routes so behaviour (validation order, hash-chain, idempotency) is identical either way.
 *
 * INGEST ORDER (each step fails closed into a specific error code):
 *   1. Source identity binding already resolved by plugins/source-identity.ts before this runs
 *      (`resolvedSourceModule`); here we only check the EVENT's declared `source_module`
 *      matches it (SEC1_SOURCE_MODULE_IDENTITY_MISMATCH) — see that plugin's header comment
 *      for why authentication and this per-event authorization check are kept separate.
 *   2. Event-schema lookup (SEC1_EVENT_TYPE_UNKNOWN) + mandatory-field validation
 *      (SEC1_REQUIRED_FIELD_MISSING).
 *   3. Metadata redaction (lib/redaction.ts) — the hash-chain only ever binds the REDACTED
 *      form.
 *   4. Duplicate (source_module, event_id) handling — FND-01's own documented-safe pattern
 *      (`INSERT ... ON CONFLICT DO NOTHING` followed by a `SELECT` under the unique
 *      constraint; see FND-01_Final_Review_Opus_v1.0.md §1 F1) — but sequence/hash assignment
 *      (step 5) is deferred until AFTER we know the insert will actually land, so a duplicate
 *      NEVER burns a sequence number or advances the stream (no gap is ever created by a
 *      replay or a losing side of a race).
 *   5. Per-stream `SELECT ... FOR UPDATE` lock (lib/stream.ts) -> sequence_no/previous_hash
 *      assignment -> canonical hash (lib/canonical.ts) -> INSERT `ON CONFLICT
 *      (source_module, event_id) DO NOTHING` -> only on confirmed success, advance the stream
 *      pointer. On a lost race (0 rows), re-read the existing row and resolve exactly like a
 *      normal duplicate (steps below) WITHOUT ever having touched the stream pointer.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { Sec1Error } from "./errors.js";
import { assertEventTypeKnown, assertMandatoryFieldsPresent, lookupEventSchema } from "./schema-registry.js";
import { redactMetadata } from "./redaction.js";
import {
  computeEventHash,
  sha256Hex,
  canonicalJson,
  CURRENT_CANONICAL_FORMAT_VERSION,
  type CanonicalEventFields,
} from "./canonical.js";
import { deriveStreamId, lockStreamForUpdate, advanceStream } from "./stream.js";

export interface IngestAuditEventInput {
  event_id: string;
  event_type: string;
  event_category?: string;
  severity: string;
  source_module: string;
  source_emission_sequence?: number;
  source_emission_stream?: string;
  actor_user_id?: string;
  actor_type: string;
  session_id?: string;
  client_id?: string;
  entity_type?: string;
  entity_id?: string;
  action: string;
  result: string;
  reason_code?: string;
  request_id: string;
  correlation_id: string;
  occurred_at_utc: string;
  metadata?: Record<string, unknown>;
  idempotency_key: string;
}

export interface IngestAuditEventResult {
  audit_event_ref: string;
  sequence_no: number;
  event_hash: string;
  previous_hash: string | null;
  seal_batch_id: null;
  external_anchor_ref: null;
  trusted_timestamp_ref: null;
  clock_skew_status: "not_evaluated";
  replayed: boolean;
}

interface StoredEventRow {
  audit_event_ref: string;
  sequence_no: string;
  event_hash: string;
  previous_hash: string | null;
  ingest_payload_hash: string;
}

/**
 * F1 fix (Opus review, docs/SEC-01_Security_Review_Opus_v0.1.md): `event_category` MUST be
 * resolved to the SAME value used for both the canonical hash and the stored column. Before
 * this fix, the hash bound `input.event_category ?? null` while the INSERT stored
 * `input.event_category ?? schema.category` — an event that omitted `event_category` would
 * hash against `null` but persist the schema default (e.g. `'system'`), so any later
 * reconstruction of canonical fields FROM THE STORED ROW (exactly what tamper verification
 * does) would recompute a different hash and report a false `hashMismatch` on an untampered
 * event. `resolvedEventCategory` is computed ONCE by the caller and threaded into both the
 * hash (`buildCanonicalFields`) and the INSERT — never re-derived independently in two places.
 *
 * Phase 3 (L1 carry-forward closed): `classification`/`retention_class` are threaded through
 * with the EXACT SAME discipline as the F1 fix above — both are resolved ONCE (always
 * `schema.classification`/`schema.retention_class`, never caller-supplied — see
 * lib/schema-registry.ts) and those same resolved values are used for BOTH the hash and the
 * INSERT below, never independently re-derived in two places. Every FRESH ingest is a v2 row
 * (see canonical.ts's CURRENT_CANONICAL_FORMAT_VERSION), so both fields are always populated
 * here — the omission-when-undefined path in `CanonicalEventFields` only matters when
 * RECONSTRUCTING an existing v1 row for verification (lib/integrity.ts / lib/seal.ts).
 *
 * P3-F1 gap patch (Opus review, docs/SEC-01_Phase3_Security_Review_Opus_v0.1.md): `occurred_at_utc`
 * gets the EXACT SAME resolve-once discipline. Before this fix, the hash bound the caller's RAW
 * string while the INSERT also stored the raw string — but Postgres's `timestamptz` column
 * silently NORMALIZES it on round-trip (millisecond truncation, `Z`/offset canonicalization),
 * so `lib/integrity.ts`'s reconstruction-from-stored-row (`row.occurred_at_utc.toISOString()`)
 * would recompute a DIFFERENT hash than what was actually stored for any caller format other
 * than JS-millisecond ISO — a false tamper alarm on an untampered event, the identical failure
 * class as the F1 `event_category` divergence. `resolvedOccurredAtUtc` is computed ONCE in
 * `ingestAuditEvent` (`new Date(input.occurred_at_utc).toISOString()`) and threaded into BOTH
 * the hash and the INSERT below, so the hashed string and the DB-round-tripped value are
 * identical BY CONSTRUCTION — there is no second, independent derivation for either field to
 * diverge from.
 */
function buildCanonicalFields(
  input: IngestAuditEventInput,
  redactedMetadata: Record<string, unknown>,
  resolvedEventCategory: string | null,
  resolvedClassification: string,
  resolvedRetentionClass: string,
  resolvedOccurredAtUtc: string,
): CanonicalEventFields {
  return {
    event_id: input.event_id,
    source_module: input.source_module,
    event_type: input.event_type,
    event_category: resolvedEventCategory,
    severity: input.severity,
    actor_user_id: input.actor_user_id ?? null,
    actor_type: input.actor_type,
    session_id: input.session_id ?? null,
    client_id: input.client_id ?? null,
    entity_type: input.entity_type ?? null,
    entity_id: input.entity_id ?? null,
    action: input.action,
    result: input.result,
    reason_code: input.reason_code ?? null,
    request_id: input.request_id,
    correlation_id: input.correlation_id,
    occurred_at_utc: resolvedOccurredAtUtc,
    source_emission_sequence: input.source_emission_sequence ?? null,
    source_emission_stream: input.source_emission_stream ?? null,
    idempotency_key: input.idempotency_key,
    metadata_redacted: redactedMetadata,
    classification: resolvedClassification,
    retention_class: resolvedRetentionClass,
  };
}

/** Hash of the FULL validated inbound payload (pre-redaction) — used ONLY for duplicate-vs-
 * conflict detection on (source_module, event_id), distinct from the hash-chain's event_hash
 * (which binds the stored, REDACTED form). Storing this separately means a duplicate check
 * never has to reverse-engineer whether two differently-redacted rows came from the same
 * original submission. */
function computeIngestPayloadHash(input: IngestAuditEventInput): string {
  return sha256Hex(canonicalJson(input));
}

export async function ingestAuditEvent(
  client: PoolClient,
  resolvedSourceModule: string,
  input: IngestAuditEventInput,
): Promise<IngestAuditEventResult> {
  if (input.source_module !== resolvedSourceModule) {
    throw new Sec1Error("SEC1_SOURCE_MODULE_IDENTITY_MISMATCH", {
      details: [{ field: "source_module", issue: "does not match authenticated ingestion identity" }],
    });
  }

  const schema = await lookupEventSchema(client, input.event_type);
  assertEventTypeKnown(schema, input.event_type);
  assertMandatoryFieldsPresent(schema, input as unknown as Record<string, unknown>);

  const redactedMetadata = redactMetadata(input.metadata);
  const ingestPayloadHash = computeIngestPayloadHash(input);
  // F1 fix: resolved ONCE, used for both the hash and the stored column below — never
  // re-derived independently (that duplication was the root cause of the divergence).
  const resolvedEventCategory = input.event_category ?? schema.category;
  // P3-F1 fix: normalize occurred_at_utc to a single canonical millisecond-precision ISO
  // string ONCE, here — the same string is used for both the hash and the INSERT below, so
  // the hashed representation and what Postgres's timestamptz column round-trips back are
  // identical by construction (see buildCanonicalFields's header comment). Fail closed on an
  // unparseable timestamp rather than silently hashing/storing garbage.
  const occurredAt = new Date(input.occurred_at_utc);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Sec1Error("SEC1_AUDIT_EVENT_INVALID", {
      details: [{ field: "occurred_at_utc", issue: "not a parseable timestamp" }],
    });
  }
  const resolvedOccurredAtUtc = occurredAt.toISOString();

  const streamId = deriveStreamId(input.source_module, input.source_emission_stream);

  const locked = await lockStreamForUpdate(client, streamId, input.source_module);
  const nextSequenceNo = locked.latestSequenceNo + 1;
  const previousHash = locked.latestHash;
  // L1 fix: schema.classification/schema.retention_class resolved ONCE here (schema-derived,
  // never caller-supplied) and threaded into BOTH the hash and the INSERT below — same
  // discipline as resolvedEventCategory above.
  const canonicalFields = buildCanonicalFields(
    input,
    redactedMetadata,
    resolvedEventCategory,
    schema.classification,
    schema.retention_class,
    resolvedOccurredAtUtc,
  );
  const eventHash = computeEventHash(canonicalFields, previousHash);
  const auditEventRef = "audit_" + randomUUID();

  const inserted = await client.query<{ audit_event_ref: string }>(
    `INSERT INTO sec1.audit_event
       (audit_event_ref, event_id, source_emission_stream, source_emission_sequence, idempotency_key,
        event_type, event_category, severity, source_module, actor_user_id, actor_type, session_id,
        client_id, entity_type, entity_id, action, result, reason_code, request_id, correlation_id,
        occurred_at_utc, ingested_at_utc, metadata_redacted, classification, retention_class,
        stream_id, sequence_no, previous_hash, event_hash, ingest_payload_hash,
        canonical_format_version, backfilled, integrity_from, status)
     VALUES
       ($1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,$18,$19,$20,
        $21, now(), $22, $23, $24,
        $25,$26,$27,$28,$29,
        $30, false, 'ingestion_time', 'active')
     ON CONFLICT (source_module, event_id) DO NOTHING
     RETURNING audit_event_ref`,
    [
      auditEventRef,
      input.event_id,
      input.source_emission_stream ?? null,
      input.source_emission_sequence ?? null,
      input.idempotency_key,
      input.event_type,
      resolvedEventCategory,
      input.severity,
      input.source_module,
      input.actor_user_id ?? null,
      input.actor_type,
      input.session_id ?? null,
      input.client_id ?? null,
      input.entity_type ?? null,
      input.entity_id ?? null,
      input.action,
      input.result,
      input.reason_code ?? null,
      input.request_id,
      input.correlation_id,
      resolvedOccurredAtUtc,
      JSON.stringify(redactedMetadata),
      schema.classification,
      schema.retention_class,
      streamId,
      nextSequenceNo,
      previousHash,
      eventHash,
      ingestPayloadHash,
      CURRENT_CANONICAL_FORMAT_VERSION,
    ],
  );

  if ((inserted.rowCount ?? 0) > 0) {
    // Confirmed landed — ONLY NOW advance the stream pointer.
    await advanceStream(client, streamId, nextSequenceNo, eventHash);
    return {
      audit_event_ref: auditEventRef,
      sequence_no: nextSequenceNo,
      event_hash: eventHash,
      previous_hash: previousHash,
      seal_batch_id: null,
      external_anchor_ref: null,
      trusted_timestamp_ref: null,
      clock_skew_status: "not_evaluated",
      replayed: false,
    };
  }

  // Lost the race (or a genuine replay): a row for (source_module, event_id) already exists.
  // The stream pointer was NEVER touched by this attempt — no gap, no double count.
  const existing = await client.query<StoredEventRow>(
    `SELECT audit_event_ref, sequence_no, event_hash, previous_hash, ingest_payload_hash
       FROM sec1.audit_event
      WHERE source_module = $1 AND event_id = $2`,
    [input.source_module, input.event_id],
  );
  const row = existing.rows[0];
  if (!row) {
    // Extremely rare race: row vanished between insert-conflict and select. Fail closed.
    throw new Sec1Error("SEC1_AUDIT_PERSIST_FAILED", {
      message: "Audit event could not be resolved after a duplicate-key conflict.",
    });
  }
  if (row.ingest_payload_hash !== ingestPayloadHash) {
    throw new Sec1Error("SEC1_IDEMPOTENCY_CONFLICT", {
      details: [{ field: "event_id", issue: "already ingested with a different payload" }],
    });
  }
  return {
    audit_event_ref: row.audit_event_ref,
    sequence_no: Number(row.sequence_no),
    event_hash: row.event_hash,
    previous_hash: row.previous_hash,
    seal_batch_id: null,
    external_anchor_ref: null,
    trusted_timestamp_ref: null,
    clock_skew_status: "not_evaluated",
    replayed: true,
  };
}
