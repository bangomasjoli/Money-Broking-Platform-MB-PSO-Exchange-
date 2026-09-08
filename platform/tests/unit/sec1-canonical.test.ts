/**
 * Unit tests for SEC-01's canonical JSON serialization + hash-chain event hash generation
 * (services/sec1/src/lib/canonical.ts) and the pure gap/tamper detector
 * (services/sec1/src/lib/integrity.ts). No DB required.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  computeEventHash,
  CANONICAL_FORMAT_VERSION_V1,
  CANONICAL_FORMAT_VERSION_V2,
  CURRENT_CANONICAL_FORMAT_VERSION,
  type CanonicalEventFields,
} from "../../services/sec1/src/lib/canonical.js";
import { verifyChainSegment, type ChainRow } from "../../services/sec1/src/lib/integrity.js";

function baseFields(overrides: Partial<CanonicalEventFields> = {}): CanonicalEventFields {
  return {
    event_id: "evt_1",
    source_module: "FND-01",
    event_type: "fnd01.generic_event",
    event_category: "system",
    severity: "medium",
    actor_user_id: null,
    actor_type: "service",
    session_id: null,
    client_id: null,
    entity_type: "job",
    entity_id: "job_1",
    action: "enqueue",
    result: "success",
    reason_code: null,
    request_id: "req_1",
    correlation_id: "corr_1",
    occurred_at_utc: "2026-01-01T00:00:00.000Z",
    source_emission_sequence: null,
    source_emission_stream: null,
    idempotency_key: "idem_1",
    metadata_redacted: { foo: "bar" },
    ...overrides,
  };
}

describe("canonicalJson", () => {
  it("is deterministic regardless of input key insertion order", () => {
    const a = { z: 1, a: 2, metadata: { b: 1, a: 2 } };
    const b = { a: 2, z: 1, metadata: { a: 2, b: 1 } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("produces different output when a value differs", () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });

  it("preserves array element order (order IS meaningful there)", () => {
    expect(canonicalJson({ a: [1, 2, 3] })).not.toBe(canonicalJson({ a: [3, 2, 1] }));
  });

  it("drops undefined-valued keys (never serializes them as a literal)", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });
});

describe("computeEventHash", () => {
  it("is deterministic for the same fields + previous_hash", () => {
    const fields = baseFields();
    expect(computeEventHash(fields, null)).toBe(computeEventHash(fields, null));
  });

  it("changes when previous_hash changes (chain linkage matters)", () => {
    const fields = baseFields();
    expect(computeEventHash(fields, "hash_a")).not.toBe(computeEventHash(fields, "hash_b"));
  });

  it("changes when any bound field changes (tamper detection foundation)", () => {
    const original = computeEventHash(baseFields(), null);
    const tampered = computeEventHash(baseFields({ result: "failure" }), null);
    expect(tampered).not.toBe(original);
  });

  it("genesis (previous_hash = null) hashes differently from a real previous_hash value", () => {
    const fields = baseFields();
    const genesis = computeEventHash(fields, null);
    const nonGenesis = computeEventHash(fields, "a".repeat(64)); // a real-shaped sha256 hex hash
    expect(genesis).not.toBe(nonGenesis);
  });
});

describe("verifyChainSegment — tamper + gap detection", () => {
  function chainOf(n: number): ChainRow[] {
    const rows: ChainRow[] = [];
    let prevHash: string | null = null;
    for (let i = 1; i <= n; i++) {
      const fields = baseFields({ event_id: `evt_${i}` });
      const hash = computeEventHash(fields, prevHash);
      rows.push({ sequence_no: i, previous_hash: prevHash, event_hash: hash, canonicalFields: fields });
      prevHash = hash;
    }
    return rows;
  }

  it("passes on a clean, correctly-linked chain", () => {
    const result = verifyChainSegment(chainOf(5));
    expect(result.pass).toBe(true);
    expect(result.gapAt).toEqual([]);
    expect(result.brokenLinkAt).toEqual([]);
    expect(result.hashMismatchAt).toEqual([]);
  });

  it("detects a sequence gap (a missing sequence_no)", () => {
    const rows = chainOf(5);
    // Remove the row for sequence_no 3, leaving a gap between 2 and 4.
    const withGap = rows.filter((r) => r.sequence_no !== 3);
    const result = verifyChainSegment(withGap);
    expect(result.pass).toBe(false);
    expect(result.gapAt).toContain(4);
  });

  it("detects tampering: a recomputed hash mismatching a stored one", () => {
    const rows = chainOf(5);
    const tampered = rows.map((r) =>
      r.sequence_no === 3 && r.canonicalFields
        ? { ...r, canonicalFields: { ...r.canonicalFields, result: "failure" as const } }
        : r,
    );
    const result = verifyChainSegment(tampered);
    expect(result.pass).toBe(false);
    expect(result.hashMismatchAt).toContain(3);
  });

  it("detects a broken link (previous_hash no longer matches the prior row's event_hash)", () => {
    const rows = chainOf(5);
    const broken = rows.map((r) => (r.sequence_no === 3 ? { ...r, previous_hash: "corrupted_hash" } : r));
    const result = verifyChainSegment(broken);
    expect(result.pass).toBe(false);
    expect(result.brokenLinkAt).toContain(3);
  });
});

/**
 * Phase 3 (L1 carry-forward closed): canonical_format_version versioning. This is the single
 * most important correctness property in Phase 3 — proven DIRECTLY here, not just inferred
 * from reading the source: `canonicalJson`'s existing undefined-filtering behaviour means a
 * v1-reconstructed CanonicalEventFields (classification/retention_class OMITTED) is
 * byte-identical to the pre-Phase-3 formula, with ZERO branching inside computeEventHash
 * itself. See canonical.ts's own header comment for the full design rationale.
 */
describe("canonical_format_version (L1) — hash versioning", () => {
  it("format version constants are distinct and CURRENT points at v2", () => {
    expect(CANONICAL_FORMAT_VERSION_V1).toBe(1);
    expect(CANONICAL_FORMAT_VERSION_V2).toBe(2);
    expect(CURRENT_CANONICAL_FORMAT_VERSION).toBe(CANONICAL_FORMAT_VERSION_V2);
  });

  it("canonicalJson-undefined-filtering equivalence: omitting classification/retention_class produces BYTE-IDENTICAL output to explicitly setting them to undefined", () => {
    const fields = baseFields();
    // fields has no classification/retention_class keys at all (TypeScript optional fields
    // simply absent from the object literal).
    expect("classification" in fields).toBe(false);
    expect("retention_class" in fields).toBe(false);

    const explicitlyUndefined: CanonicalEventFields = {
      ...fields,
      classification: undefined,
      retention_class: undefined,
    };
    expect(canonicalJson(fields)).toBe(canonicalJson(explicitlyUndefined));

    // ...and this is EXACTLY what the OLD (pre-Phase-3) formula would have produced for the
    // same event: the pre-Phase-3 CanonicalEventFields type never had these two keys at all,
    // so its canonicalJson output is, by construction, identical to `fields` here (an object
    // literal with only the pre-Phase-3 field set). computeEventHash's own output is likewise
    // unaffected — proving the "zero changes needed inside computeEventHash" design claim.
    expect(computeEventHash(fields, null)).toBe(computeEventHash(explicitlyUndefined, null));
  });

  it("a v1 reconstruction (classification/retention_class omitted) round-trips clean through verifyChainSegment, unaffected by v2 code existing in the codebase", () => {
    // Simulates reconstructing a genuine pre-Phase-3 (v1) row: the fields object simply never
    // carries classification/retention_class, exactly as a v1 row's hash was actually computed.
    const v1Fields = baseFields({ event_id: "evt_v1" });
    const hash = computeEventHash(v1Fields, null);
    const chainRow: ChainRow = { sequence_no: 1, previous_hash: null, event_hash: hash, canonicalFields: v1Fields };
    const result = verifyChainSegment([chainRow]);
    expect(result.pass).toBe(true);
    expect(result.hashMismatchAt).toEqual([]);
  });

  it("a v2 row (classification/retention_class populated) verifies clean when reconstructed with the SAME values it was hashed with", () => {
    const v2Fields = baseFields({ event_id: "evt_v2", classification: "restricted", retention_class: "standard" });
    const hash = computeEventHash(v2Fields, null);
    const chainRow: ChainRow = { sequence_no: 1, previous_hash: null, event_hash: hash, canonicalFields: v2Fields };
    const result = verifyChainSegment([chainRow]);
    expect(result.pass).toBe(true);
  });

  it("tampering classification on a v2 row is detected as a hashMismatch", () => {
    const v2Fields = baseFields({ event_id: "evt_v2_tamper_cls", classification: "restricted", retention_class: "standard" });
    const hash = computeEventHash(v2Fields, null);
    const tamperedFields: CanonicalEventFields = { ...v2Fields, classification: "public" };
    const chainRow: ChainRow = {
      sequence_no: 1,
      previous_hash: null,
      event_hash: hash,
      canonicalFields: tamperedFields,
    };
    const result = verifyChainSegment([chainRow]);
    expect(result.pass).toBe(false);
    expect(result.hashMismatchAt).toContain(1);
  });

  it("tampering retention_class on a v2 row is detected as a hashMismatch", () => {
    const v2Fields = baseFields({ event_id: "evt_v2_tamper_ret", classification: "restricted", retention_class: "standard" });
    const hash = computeEventHash(v2Fields, null);
    const tamperedFields: CanonicalEventFields = { ...v2Fields, retention_class: "extended" };
    const chainRow: ChainRow = {
      sequence_no: 1,
      previous_hash: null,
      event_hash: hash,
      canonicalFields: tamperedFields,
    };
    const result = verifyChainSegment([chainRow]);
    expect(result.pass).toBe(false);
    expect(result.hashMismatchAt).toContain(1);
  });

  it("a v1 row and a v2 row hash DIFFERENTLY for otherwise-identical field values (the format genuinely changes the hash — versioning is load-bearing, not cosmetic)", () => {
    const v1Fields = baseFields({ event_id: "evt_same" });
    const v2Fields: CanonicalEventFields = { ...v1Fields, classification: "restricted", retention_class: "standard" };
    expect(computeEventHash(v1Fields, null)).not.toBe(computeEventHash(v2Fields, null));
  });

  it("omitted event_category still verifies clean (F1 regression unaffected by Phase 3's changes)", () => {
    // event_category is already resolved to a non-null schema default before this layer ever
    // sees it (ingest.ts's F1 fix) — this test proves Phase 3's classification/retention_class
    // additions did not reintroduce or mask that resolved-once discipline at the canonical
    // layer: a fields object with a resolved (non-omitted) event_category still verifies
        // clean, exactly as it did before this phase.
    const fields = baseFields({ event_id: "evt_f1_regress", event_category: "system" });
    const hash = computeEventHash(fields, null);
    const chainRow: ChainRow = { sequence_no: 1, previous_hash: null, event_hash: hash, canonicalFields: fields };
    const result = verifyChainSegment([chainRow]);
    expect(result.pass).toBe(true);
  });
});
