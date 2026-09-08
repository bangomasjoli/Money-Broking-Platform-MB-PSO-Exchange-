/**
 * SEC-01 §5.5 tamper-evidence — deterministic canonical JSON serialization + per-stream event
 * hashing (SEC1-FR-005).
 *
 * Canonicalisation rule (explicit, deterministic, NOT raw `JSON.stringify` of an
 * insertion-order-dependent object): every object's keys are recursively sorted
 * lexicographically before serialization, at every nesting depth (arrays preserve element
 * order — order IS meaningful there). This is the same deep-sort algorithm
 * `packages/foundation/src/idempotency.ts`'s internal (unexported) `canonical()` helper uses
 * for its own fingerprinting — SEC-01 has its own copy here (not imported; that helper isn't
 * part of `@aix/foundation`'s public surface, and SEC-01 must not depend on IAM/IAM2/FND
 * internals per the F3(c) import-boundary rule anyway) rather than inventing a different
 * algorithm. Sorting keys (rather than trusting whatever order the input object happens to
 * carry) is what makes this "explicitly field-ordered": the same logical event object hashes
 * identically regardless of how its fields were assembled upstream.
 */
import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Canonical hash-format versioning (Phase 3, L1 carry-forward from the Opus review —
 * docs/SEC-01_Security_Review_Opus_v0.1.md §L1 / IMPLEMENTATION_NOTES.md §18).
 *
 * v1 = the pre-Phase-3 formula: `classification`/`retention_class` are NOT bound into the
 * hash. v2 = `classification`/`retention_class` ARE bound into the hash. Every row ingested
 * before Phase 3 is v1 (backfilled by migration 009's `ADD COLUMN ... DEFAULT 1`); every row
 * ingested from Phase 3 onward is v2.
 *
 * Named constants only — never a bare `1`/`2` literal scattered across files, so the meaning
 * of "which formula" is always traceable to one place.
 */
export const CANONICAL_FORMAT_VERSION_V1 = 1;
export const CANONICAL_FORMAT_VERSION_V2 = 2;
/** Alias for whichever format version is current — the value every FRESH ingest writes. */
export const CURRENT_CANONICAL_FORMAT_VERSION = CANONICAL_FORMAT_VERSION_V2;

/**
 * The exact set of fields bound into an audit event's hash — an explicit allow-list (not
 * "whatever the caller happened to send") so the hash is stable/meaningful and cannot silently
 * absorb extraneous or attacker-controlled fields. Deliberately excludes `metadata_redacted`'s
 * pre-redaction raw form — the CANONICAL, HASHED metadata is always the ALREADY-REDACTED
 * version (see lib/redaction.ts): the hash-chain protects what SEC-01 actually stored and
 * attests to, not a raw payload SEC-01 never persists.
 *
 * `classification`/`retention_class` are OPTIONAL and deliberately versioned via omission, not
 * via a branch inside `computeEventHash`/`canonicalJson`:
 *   - `canonicalJson` already filters out any key whose value is `undefined` before
 *     serializing (`Object.keys(obj).filter((k) => obj[k] !== undefined)`), so an
 *     undefined-valued key and an ABSENT key serialize identically.
 *   - A v1 row's reconstructed `CanonicalEventFields` simply OMITS these two fields (leaves
 *     them `undefined`) — `canonicalJson` then produces byte-identical output to the
 *     pre-Phase-3 formula, with ZERO changes needed inside `computeEventHash` itself.
 *   - A v2 row's reconstruction POPULATES both with the row's real values.
 *   - This is the deliberate minimal-risk design: versioning lives entirely in what the
 *     CALLER passes into this type, not in the hash function's own logic — it cannot
 *     introduce a NEW class of hash-formula bug the way branching inside `computeEventHash`
 *     might. See `sec1-canonical.test.ts`'s direct equivalence proof of this property.
 *
 * P3-F1 gap patch — similar-field risk review: `metadata_redacted` (jsonb) and
 * `source_emission_sequence` (bigint) were reviewed for the same "hash a representation the DB
 * won't return identically" bug class as `occurred_at_utc` and found NOT to have it — both
 * already pass through JS's own JSON/number semantics on the way IN (before ever being hashed),
 * so there is no "raw wire value vs. DB-normalized value" split for a DB round-trip to
 * introduce. See `tests/integration/sec1-db.test.ts`'s "Similar-field review" describe block for
 * the full reasoning and the empirical (real Postgres round-trip) proof.
 */
export interface CanonicalEventFields {
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
  occurred_at_utc: string;
  source_emission_sequence: number | null;
  source_emission_stream: string | null;
  idempotency_key: string;
  metadata_redacted: Record<string, unknown>;
  /** v2+ only — omit (leave undefined) when reconstructing a v1 row. */
  classification?: string;
  /** v2+ only — omit (leave undefined) when reconstructing a v1 row. */
  retention_class?: string;
}

/**
 * `event_hash = sha256(canonical_event_json + "|" + (previous_hash ?? "GENESIS"))`.
 * `previous_hash` is `null` for the genesis row of a stream — the literal separator token
 * "GENESIS" is used in that case so a genesis event's hash can never coincidentally collide
 * with a non-genesis event whose canonical JSON happens to be identical to some other event's
 * (canonical JSON + a real previous_hash string) — the separator is always present either way,
 * only its value changes.
 */
export function computeEventHash(fields: CanonicalEventFields, previousHash: string | null): string {
  const canonical = canonicalJson(fields);
  return sha256Hex(canonical + "|" + (previousHash ?? "GENESIS"));
}
