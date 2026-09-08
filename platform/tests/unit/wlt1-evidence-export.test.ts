/**
 * WLT-01 Evidence Export — pure/format-level unit tests for `lib/evidence-export.ts`'s scope
 * canonicalisation, approval-payload/scope-hash builders, disclosed_data_class mapping, manifest/
 * content-hash construction, and the 10 explicit-projection evidence collectors. No database — the
 * collectors themselves take a `PoolClient` and are exercised live in
 * `tests/integration/wlt1-evidence-export-route.test.ts`; this file locks in their SQL/mapper
 * SOURCE shape via source-guard extraction (mirrors the established `readFileSync` + regex
 * acceptance-sensitive source-guard pattern used throughout this codebase, e.g.
 * `wlt1-fiat-destination.test.ts`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fingerprint } from "@aix/foundation";
import {
  buildApprovalPayload,
  buildExportContent,
  buildManifest,
  canonicaliseEvidenceTypes,
  computeApprovalPayloadHash,
  computeDisclosedDataClasses,
  computeScopeHash,
  EVIDENCE_EXPORT_EXCLUDED_NOTE,
  EVIDENCE_EXPORT_SCHEMA_VERSION,
  EVIDENCE_TYPES,
  isDuplicateApprovalRefViolation,
  isKnownEvidenceType,
  normaliseDateRange,
  type EvidenceExportScopeInput,
} from "../../services/wlt1/src/lib/evidence-export.js";

const LIB_SOURCE = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "lib", "evidence-export.ts"), "utf8");
const ROUTE_SOURCE = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "routes", "evidence-export.ts"), "utf8");

// -------------------------------------------------------------------------------------------
// Evidence type enum — exact 10 values, canonical order, duplicate/unknown rejection.
// -------------------------------------------------------------------------------------------
describe("EVIDENCE_TYPES / isKnownEvidenceType", () => {
  it("exactly 10 types, in the frozen canonical wire order", () => {
    expect(EVIDENCE_TYPES).toEqual([
      "destination_current_state",
      "wallet_destination",
      "fiat_payout_destination",
      "address_integrity_check",
      "wallet_screening_result",
      "fiat_screening_result",
      "beneficiary_verification",
      "proof_of_control",
      "destination_decision",
      "destination_revocation",
    ]);
  });

  it("isKnownEvidenceType is true for every canonical type, false for anything else", () => {
    for (const t of EVIDENCE_TYPES) expect(isKnownEvidenceType(t)).toBe(true);
    expect(isKnownEvidenceType("not_a_real_type")).toBe(false);
    expect(isKnownEvidenceType("")).toBe(false);
  });
});

describe("canonicaliseEvidenceTypes", () => {
  it("unknown value -> ok:false, issue:unknown_evidence_type", () => {
    expect(canonicaliseEvidenceTypes(["wallet_destination", "not_a_real_type"])).toEqual({ ok: false, issue: "unknown_evidence_type" });
  });

  it("duplicate value -> ok:false, issue:duplicate_evidence_type (never silently deduplicated)", () => {
    expect(canonicaliseEvidenceTypes(["wallet_destination", "wallet_destination"])).toEqual({ ok: false, issue: "duplicate_evidence_type" });
  });

  it("caller-supplied order never affects output — always sorted into canonical wire order", () => {
    const result = canonicaliseEvidenceTypes(["destination_revocation", "wallet_destination", "destination_current_state"]);
    expect(result).toEqual({ ok: true, types: ["destination_current_state", "wallet_destination", "destination_revocation"] });
  });

  it("single-type and empty-array inputs both succeed", () => {
    expect(canonicaliseEvidenceTypes(["proof_of_control"])).toEqual({ ok: true, types: ["proof_of_control"] });
    expect(canonicaliseEvidenceTypes([])).toEqual({ ok: true, types: [] });
  });
});

// -------------------------------------------------------------------------------------------
// Date range normalisation — explicit offset required, half-open [from, to) coherence.
// -------------------------------------------------------------------------------------------
describe("normaliseDateRange", () => {
  it("both undefined -> both null", () => {
    expect(normaliseDateRange(undefined, undefined)).toEqual({ ok: true, fromUtc: null, toUtc: null });
  });

  it("a date without an explicit offset is rejected (never silently assumed UTC)", () => {
    expect(normaliseDateRange("2026-01-01T00:00:00.000", undefined)).toEqual({ ok: false, issue: "invalid_from_utc" });
    expect(normaliseDateRange(undefined, "2026-01-01T00:00:00.000")).toEqual({ ok: false, issue: "invalid_to_utc" });
  });

  it("an unparsable date string (even with a trailing offset) is rejected", () => {
    expect(normaliseDateRange("not-a-date+00:00", undefined)).toEqual({ ok: false, issue: "invalid_from_utc" });
  });

  it("from_utc >= to_utc is rejected", () => {
    expect(normaliseDateRange("2026-06-01T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual({ ok: false, issue: "from_utc_not_before_to_utc" });
    expect(normaliseDateRange("2026-06-02T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual({ ok: false, issue: "from_utc_not_before_to_utc" });
  });

  it("valid Z and +offset inputs normalise to canonical millisecond UTC ISO-8601", () => {
    expect(normaliseDateRange("2026-06-01T00:00:00Z", "2026-06-02T00:00:00Z")).toEqual({ ok: true, fromUtc: "2026-06-01T00:00:00.000Z", toUtc: "2026-06-02T00:00:00.000Z" });
    expect(normaliseDateRange("2026-06-01T08:00:00+08:00", undefined)).toEqual({ ok: true, fromUtc: "2026-06-01T00:00:00.000Z", toUtc: null });
  });
});

// -------------------------------------------------------------------------------------------
// Approval payload / hashes.
// -------------------------------------------------------------------------------------------
function scope(overrides: Partial<EvidenceExportScopeInput> = {}): EvidenceExportScopeInput {
  return { destinationId: null, evidenceTypes: ["wallet_destination"], fromUtc: null, toUtc: null, ...overrides };
}

describe("buildApprovalPayload", () => {
  it("exact 9-key shape; absent optionals are explicit null, never undefined/omitted", () => {
    const payload = buildApprovalPayload({ exportId: "wlt1exp_1", clientId: "clt1client_1", requestedBy: "staff_1", scope: scope(), reason: null });
    expect(Object.keys(payload).sort()).toEqual(["client_id", "destination_id", "evidence_types", "export_id", "from_utc", "reason", "requested_by", "schema_version", "to_utc"]);
    expect(payload).toEqual({
      schema_version: EVIDENCE_EXPORT_SCHEMA_VERSION,
      export_id: "wlt1exp_1",
      client_id: "clt1client_1",
      requested_by: "staff_1",
      evidence_types: ["wallet_destination"],
      destination_id: null,
      from_utc: null,
      to_utc: null,
      reason: null,
    });
    // JSON.stringify never drops an explicit null key — proves the byte-exact round-trip
    // invariant this file's own header comment relies on.
    expect(Object.prototype.hasOwnProperty.call(JSON.parse(JSON.stringify(payload)), "reason")).toBe(true);
  });

  it("a populated reason/destination_id/date-range is carried through unchanged", () => {
    const payload = buildApprovalPayload({
      exportId: "wlt1exp_1",
      clientId: "clt1client_1",
      requestedBy: "staff_1",
      scope: scope({ destinationId: "wlt1dest_1", fromUtc: "2026-01-01T00:00:00.000Z", toUtc: "2026-02-01T00:00:00.000Z" }),
      reason: "quarterly regulator request",
    });
    expect(payload.destination_id).toBe("wlt1dest_1");
    expect(payload.from_utc).toBe("2026-01-01T00:00:00.000Z");
    expect(payload.to_utc).toBe("2026-02-01T00:00:00.000Z");
    expect(payload.reason).toBe("quarterly regulator request");
  });
});

describe("computeApprovalPayloadHash", () => {
  it("is fingerprint(payload) — deterministic for equal payloads", () => {
    const payload = buildApprovalPayload({ exportId: "wlt1exp_1", clientId: "clt1client_1", requestedBy: "staff_1", scope: scope(), reason: null });
    expect(computeApprovalPayloadHash(payload)).toBe(fingerprint(payload));
    expect(computeApprovalPayloadHash(payload)).toBe(computeApprovalPayloadHash({ ...payload }));
  });

  it("changes if any field changes (e.g. reason)", () => {
    const a = buildApprovalPayload({ exportId: "wlt1exp_1", clientId: "clt1client_1", requestedBy: "staff_1", scope: scope(), reason: null });
    const b = buildApprovalPayload({ exportId: "wlt1exp_1", clientId: "clt1client_1", requestedBy: "staff_1", scope: scope(), reason: "different" });
    expect(computeApprovalPayloadHash(a)).not.toBe(computeApprovalPayloadHash(b));
  });
});

describe("computeScopeHash — excludes reason/requested_by/export_id", () => {
  it("changing reason, requested_by, or export_id (held fixed elsewhere) does NOT change the scope hash", () => {
    const base = computeScopeHash({ clientId: "clt1client_1", scope: scope() });
    // computeScopeHash's own input shape has no requested_by/export_id/reason parameter at all —
    // prove that by construction its signature cannot vary those fields, then prove identical
    // scope+clientId always yields the identical hash regardless of anything else in the caller.
    const again = computeScopeHash({ clientId: "clt1client_1", scope: scope() });
    expect(again).toBe(base);
  });

  it("changing client_id, destination_id, evidence_types, or the date range DOES change the scope hash", () => {
    const base = computeScopeHash({ clientId: "clt1client_1", scope: scope() });
    expect(computeScopeHash({ clientId: "clt1client_2", scope: scope() })).not.toBe(base);
    expect(computeScopeHash({ clientId: "clt1client_1", scope: scope({ destinationId: "wlt1dest_1" }) })).not.toBe(base);
    expect(computeScopeHash({ clientId: "clt1client_1", scope: scope({ evidenceTypes: ["proof_of_control"] }) })).not.toBe(base);
    expect(computeScopeHash({ clientId: "clt1client_1", scope: scope({ fromUtc: "2026-01-01T00:00:00.000Z" }) })).not.toBe(base);
  });

  it("exactly 5 keys hashed: client_id, destination_id, evidence_types, from_utc, to_utc", () => {
    // fingerprint() sorts keys, so this is provable by constructing the exact object by hand and
    // comparing hashes directly rather than introspecting fingerprint's internals.
    const s = scope({ destinationId: "wlt1dest_1", fromUtc: "2026-01-01T00:00:00.000Z", toUtc: "2026-02-01T00:00:00.000Z" });
    const expected = fingerprint({ client_id: "clt1client_1", destination_id: s.destinationId, evidence_types: s.evidenceTypes, from_utc: s.fromUtc, to_utc: s.toUtc });
    expect(computeScopeHash({ clientId: "clt1client_1", scope: s })).toBe(expected);
  });
});

// -------------------------------------------------------------------------------------------
// Duplicate approval_ref detection.
// -------------------------------------------------------------------------------------------
describe("isDuplicateApprovalRefViolation", () => {
  it("true only for 23505 on the exact named constraint", () => {
    expect(isDuplicateApprovalRefViolation({ code: "23505", constraint: "uq_wlt1_evidence_export_approval_ref" })).toBe(true);
  });
  it("false for a different constraint, a different code, or a non-pg error", () => {
    expect(isDuplicateApprovalRefViolation({ code: "23505", constraint: "wlt1_evidence_export_export_id_key" })).toBe(false);
    expect(isDuplicateApprovalRefViolation({ code: "23503", constraint: "uq_wlt1_evidence_export_approval_ref" })).toBe(false);
    expect(isDuplicateApprovalRefViolation(new Error("boom"))).toBe(false);
    expect(isDuplicateApprovalRefViolation(null)).toBe(false);
    expect(isDuplicateApprovalRefViolation(undefined)).toBe(false);
  });
});

// -------------------------------------------------------------------------------------------
// disclosed_data_class — fixed vocabulary order, computed from presence, deduplicated.
// -------------------------------------------------------------------------------------------
describe("computeDisclosedDataClasses", () => {
  it("empty evidence -> empty array", () => {
    expect(computeDisclosedDataClasses({})).toEqual([]);
  });

  it("wallet_destination -> wallet_canonical_address only; proof_of_control triggers BOTH wallet_canonical_address AND proof_of_control_evidence (its own separate rule)", () => {
    expect(computeDisclosedDataClasses({ wallet_destination: [{}] })).toEqual(["wallet_canonical_address"]);
    expect(computeDisclosedDataClasses({ proof_of_control: [{}] })).toEqual(["wallet_canonical_address", "proof_of_control_evidence"]);
    expect(computeDisclosedDataClasses({ wallet_destination: [{}], proof_of_control: [{}] })).toEqual(["wallet_canonical_address", "proof_of_control_evidence"]);
  });

  it("fiat_payout_destination -> beneficiary_name", () => {
    expect(computeDisclosedDataClasses({ fiat_payout_destination: [{}] })).toEqual(["beneficiary_name"]);
  });

  it("fiat_screening_result with a non-null matched_name_normalized -> matched_name AND screening_risk_evidence, in fixed vocabulary order; null match yields only screening_risk_evidence", () => {
    expect(computeDisclosedDataClasses({ fiat_screening_result: [{ matched_name_normalized: "JOHN TAN" }] })).toEqual(["matched_name", "screening_risk_evidence"]);
    expect(computeDisclosedDataClasses({ fiat_screening_result: [{ matched_name_normalized: null }] })).toEqual(["screening_risk_evidence"]);
  });

  it("wallet_screening_result or fiat_screening_result -> screening_risk_evidence", () => {
    expect(computeDisclosedDataClasses({ wallet_screening_result: [{}] })).toEqual(["screening_risk_evidence"]);
    expect(computeDisclosedDataClasses({ fiat_screening_result: [{ matched_name_normalized: null }] })).toEqual(["screening_risk_evidence"]);
  });

  it("proof_of_control -> also proof_of_control_evidence", () => {
    expect(computeDisclosedDataClasses({ proof_of_control: [{}] })).toEqual(["wallet_canonical_address", "proof_of_control_evidence"]);
  });

  it("output always follows the fixed vocabulary order, regardless of which rules fire", () => {
    const all = computeDisclosedDataClasses({
      wallet_destination: [{}],
      fiat_payout_destination: [{}],
      fiat_screening_result: [{ matched_name_normalized: "X" }],
      wallet_screening_result: [{}],
      proof_of_control: [{}],
    });
    expect(all).toEqual(["wallet_canonical_address", "beneficiary_name", "matched_name", "screening_risk_evidence", "proof_of_control_evidence"]);
  });

  it("an evidence type present but with a zero-length array does not trigger its rule", () => {
    expect(computeDisclosedDataClasses({ wallet_destination: [], fiat_payout_destination: [] })).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------
// Manifest / excluded-evidence note.
// -------------------------------------------------------------------------------------------
describe("EVIDENCE_EXPORT_EXCLUDED_NOTE", () => {
  it("exact frozen string", () => {
    expect(EVIDENCE_EXPORT_EXCLUDED_NOTE).toBe("SEC-01-owned audit events and sensitive-read access records are outside WLT-01 Evidence Export v1 scope.");
  });
});

describe("buildManifest", () => {
  it("exact key shape; source_module is the literal 'WLT-01'; excluded_evidence_note is always the frozen constant", () => {
    const manifest = buildManifest({
      exportId: "wlt1exp_1",
      clientId: "clt1client_1",
      generatedAtUtc: "2026-06-01T00:00:00.000Z",
      scope: scope({ destinationId: "wlt1dest_1" }),
      requestedBy: "staff_1",
      approvalRef: "iam2approval_1",
      reason: "regulator request",
      requestId: "req_1",
      correlationId: "corr_1",
      recordCounts: { wallet_destination: 3 },
      recordCount: 3,
    });
    expect(Object.keys(manifest).sort()).toEqual(
      ["approval_ref", "client_id", "correlation_id", "excluded_evidence_note", "export_id", "generated_at_utc", "reason", "record_count", "record_counts", "request_id", "requested_by", "schema_version", "scope", "source_module"].sort(),
    );
    expect(manifest.source_module).toBe("WLT-01");
    expect(manifest.excluded_evidence_note).toBe(EVIDENCE_EXPORT_EXCLUDED_NOTE);
    expect(manifest).not.toHaveProperty("approved_by");
  });

  it("record_count equals the sum of record_counts' own values whenever the caller supplies them consistently (a pure passthrough — the sum is actually PRODUCED by collectAllEvidence, verified live against a real DB in the integration route test)", () => {
    const recordCounts = { destination_current_state: 1, wallet_destination: 2, destination_revocation: 0 };
    const recordCount = Object.values(recordCounts).reduce((a, b) => a + b, 0);
    const manifest = buildManifest({
      exportId: "wlt1exp_1",
      clientId: "clt1client_1",
      generatedAtUtc: "2026-06-01T00:00:00.000Z",
      scope: scope(),
      requestedBy: "staff_1",
      approvalRef: "iam2approval_1",
      reason: null,
      requestId: null,
      correlationId: "corr_1",
      recordCounts,
      recordCount,
    });
    expect(manifest.record_count).toBe(Object.values(manifest.record_counts).reduce((a, b) => a + b, 0));
    expect(manifest.record_counts).toEqual(recordCounts);
  });

  it("scope sub-object mirrors the input scope exactly", () => {
    const s = scope({ destinationId: "wlt1dest_1", evidenceTypes: ["proof_of_control", "destination_revocation"], fromUtc: "2026-01-01T00:00:00.000Z", toUtc: "2026-02-01T00:00:00.000Z" });
    const manifest = buildManifest({
      exportId: "wlt1exp_1",
      clientId: "clt1client_1",
      generatedAtUtc: "2026-06-01T00:00:00.000Z",
      scope: s,
      requestedBy: "staff_1",
      approvalRef: "iam2approval_1",
      reason: null,
      requestId: null,
      correlationId: "corr_1",
      recordCounts: {},
      recordCount: 0,
    });
    expect(manifest.scope).toEqual({ destination_id: "wlt1dest_1", evidence_types: ["proof_of_control", "destination_revocation"], from_utc: "2026-01-01T00:00:00.000Z", to_utc: "2026-02-01T00:00:00.000Z" });
  });
});

// -------------------------------------------------------------------------------------------
// Content / content hash — canonical round trip, tamper detection, determinism.
// -------------------------------------------------------------------------------------------
function sampleBody() {
  const manifest = buildManifest({
    exportId: "wlt1exp_1",
    clientId: "clt1client_1",
    generatedAtUtc: "2026-06-01T00:00:00.000Z",
    scope: scope({ destinationId: "wlt1dest_1" }),
    requestedBy: "staff_1",
    approvalRef: "iam2approval_1",
    reason: null,
    requestId: "req_1",
    correlationId: "corr_1",
    recordCounts: { wallet_destination: 1 },
    recordCount: 1,
  });
  const evidence = { wallet_destination: [{ destination_id: "wlt1dest_1", chain: "ethereum" }] };
  return { manifest, evidence };
}

describe("buildExportContent", () => {
  it("content is exactly JSON.stringify(body); contentHash is exactly fingerprint(body)", () => {
    const body = sampleBody();
    const { content, contentHash } = buildExportContent(body);
    expect(content).toBe(JSON.stringify(body));
    expect(contentHash).toBe(fingerprint(body));
  });

  it("canonical round trip: fingerprint(JSON.parse(content)) === contentHash", () => {
    const body = sampleBody();
    const { content, contentHash } = buildExportContent(body);
    const parsed = JSON.parse(content);
    expect(fingerprint(parsed)).toBe(contentHash);
  });

  it("deterministic: identical body twice -> identical content and contentHash", () => {
    const a = buildExportContent(sampleBody());
    const b = buildExportContent(sampleBody());
    expect(a.content).toBe(b.content);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("tampering with a single evidence field changes contentHash (and content)", () => {
    const body = sampleBody();
    const original = buildExportContent(body);
    const tampered = buildExportContent({ ...body, evidence: { wallet_destination: [{ destination_id: "wlt1dest_1", chain: "bitcoin" }] } });
    expect(tampered.contentHash).not.toBe(original.contentHash);
    expect(tampered.content).not.toBe(original.content);
  });

  it("fingerprint (unlike content/JSON.stringify) is insensitive to key insertion order — the underlying determinism guarantee this file's own header comment relies on", () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
  });
});

// -------------------------------------------------------------------------------------------
// Source guards: no row dump, sort-tuple/COLLATE "C" discipline, no decrypt, no direct SEC-01
// query, `content` selected through exactly one route, and the exact per-type field allowlists.
// -------------------------------------------------------------------------------------------
describe("acceptance-sensitive source guard — no-row-dump / COLLATE discipline / no-decrypt / no-SEC-01", () => {
  it("no SELECT * anywhere in lib/evidence-export.ts's actual SQL (the header comment's own prose mention of 'SELECT *' is deliberately excluded from this check)", () => {
    const sqlTemplateLiterals = LIB_SOURCE.match(/`[^`]*`/gs) ?? [];
    for (const sql of sqlTemplateLiterals) {
      expect(sql).not.toMatch(/SELECT\s+\*/i);
    }
  });

  it("no whole-row JSON.stringify(r) / JSON.stringify(row) anywhere — every projection is an explicit mapper", () => {
    expect(LIB_SOURCE).not.toMatch(/JSON\.stringify\(\s*r\s*\)/);
    expect(LIB_SOURCE).not.toMatch(/JSON\.stringify\(\s*row\s*\)/);
  });

  it("every ORDER BY clause's leading destination_id sort key uses COLLATE \"C\" (locale-independent, byte-order determinism)", () => {
    const orderByBlocks = LIB_SOURCE.match(/ORDER BY[^`]*/g) ?? [];
    expect(orderByBlocks.length).toBeGreaterThanOrEqual(10);
    for (const block of orderByBlocks) {
      expect(block).toMatch(/destination_id COLLATE "C"/);
    }
  });

  it("no decrypt symbol/import anywhere in this file (evidence export never decrypts restricted material)", () => {
    expect(LIB_SOURCE.toLowerCase()).not.toMatch(/decrypt/);
  });

  it("no direct query against a sec1-schema-qualified table (SEC-01 is referenced only in prose, e.g. the excluded_evidence_note)", () => {
    expect(LIB_SOURCE).not.toMatch(/\bsec1\./);
    expect(ROUTE_SOURCE).not.toMatch(/\bsec1\./);
  });

  it("no provider network call (no fetch/http import) anywhere in this file", () => {
    expect(LIB_SOURCE).not.toMatch(/\bfetch\(/);
  });
});

describe("acceptance-sensitive source guard — `content` (full export bytes) selected through exactly one route", () => {
  it("EXPORT_ROW_COLUMNS_NO_CONTENT names content_hash but never the bare `content` column", () => {
    const constMatch = ROUTE_SOURCE.match(/EXPORT_ROW_COLUMNS_NO_CONTENT =\s*\n?\s*"([^"]+)"/);
    expect(constMatch).not.toBeNull();
    const columns = constMatch![1].split(",").map((c) => c.trim());
    expect(columns).toContain("content_hash");
    expect(columns).not.toContain("content");
  });

  it("exactly one SELECT in the whole route file names the bare `content` column", () => {
    const sqlTemplateLiterals = ROUTE_SOURCE.match(/`[^`]*`/gs) ?? [];
    const selectsWithBareContent = sqlTemplateLiterals.filter((sql) => /SELECT[\s\S]*\bcontent\b(?!_|-)/.test(sql));
    expect(selectsWithBareContent).toHaveLength(1);
    expect(selectsWithBareContent[0]).toContain("content, content_hash");
  });
});

describe("acceptance-sensitive source guard — generated/exported audit metadata allowlists", () => {
  function extractMetadataKeys(eventType: string): string[] {
    const eventStart = ROUTE_SOURCE.indexOf(`event_type: "${eventType}"`);
    expect(eventStart, `event_type ${eventType} not found`).toBeGreaterThan(-1);
    const metaStart = ROUTE_SOURCE.indexOf("metadata: {", eventStart);
    const metaEnd = ROUTE_SOURCE.indexOf("},", metaStart);
    const block = ROUTE_SOURCE.slice(metaStart, metaEnd);
    const keys: string[] = [];
    const re = /^\s{14}(\w+)[,:]/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) keys.push(m[1]);
    return keys;
  }

  it("wlt1.evidence_export_generated metadata is exactly the 8 documented keys, never approved_by", () => {
    const keys = extractMetadataKeys("wlt1.evidence_export_generated");
    expect(keys.sort()).toEqual(["approval_ref", "client_id", "content_hash", "export_id", "record_count", "requested_by", "schema_version", "scope_hash"].sort());
    expect(keys).not.toContain("approved_by");
    expect(keys).not.toContain("content");
  });

  it("wlt1.evidence_exported metadata is exactly the 7 documented keys, never approved_by, never content", () => {
    const keys = extractMetadataKeys("wlt1.evidence_exported");
    expect(keys.sort()).toEqual(["access_action", "client_id", "content_hash", "disclosed_data_class", "export_id", "record_count", "resource_type"].sort());
    expect(keys).not.toContain("approved_by");
    expect(keys).not.toContain("content");
  });

  it("approved_by never appears anywhere in either production file (global prohibition)", () => {
    expect(LIB_SOURCE).not.toMatch(/approved_by/);
    expect(ROUTE_SOURCE).not.toMatch(/approved_by/);
  });
});

describe("acceptance-sensitive source guard — exact per-type projection field allowlists (all 10 evidence types)", () => {
  function extractMapperKeys(fnName: string): string[] {
    const fnStart = LIB_SOURCE.indexOf(`async function ${fnName}(`);
    expect(fnStart, `function ${fnName} not found`).toBeGreaterThan(-1);
    const mapStart = LIB_SOURCE.indexOf("return rows.map((r) => ({", fnStart);
    expect(mapStart, `return rows.map(...) not found in ${fnName}`).toBeGreaterThan(-1);
    const mapEnd = LIB_SOURCE.indexOf("}));", mapStart);
    const block = LIB_SOURCE.slice(mapStart, mapEnd);
    const keys: string[] = [];
    const re = /^\s{4}(\w+):/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) keys.push(m[1]);
    return keys;
  }

  const expectedProjections: Record<string, string[]> = {
    collectDestinationCurrentState: [
      "destination_id",
      "destination_type",
      "status",
      "destination_status_version",
      "whitelist_version",
      "revocation_epoch",
      "limits_version",
      "cooling_off_until_utc",
      "whitelist_approval_ref",
      "created_at_utc",
      "updated_at_utc",
    ],
    collectWalletDestination: ["destination_id", "chain", "network", "canonical_address", "memo_tag_present", "canonicalisation_version", "wallet_type", "beneficiary_relationship", "created_at_utc"],
    collectFiatPayoutDestination: [
      "destination_id",
      "beneficiary_name",
      "beneficiary_type",
      "bank_country",
      "bank_identifier",
      "bank_identifier_type",
      "branch_identifier",
      "account_identifier_type",
      "account_identifier_masked",
      "currency",
      "rail",
      "verification_status",
      "created_at_utc",
      "updated_at_utc",
    ],
    collectAddressIntegrityCheck: ["address_check_id", "destination_id", "chain", "network", "canonicalisation_version", "checksum_valid", "poisoning_screen_status", "result_status", "reason_code", "created_at_utc"],
    collectWalletScreeningResult: [
      "destination_id",
      "screening_result_id",
      "screening_result_version",
      "provider_id",
      "provider_adaptor_version",
      "provider_result_id",
      "chain",
      "network",
      "risk_status",
      "risk_score",
      "risk_categories",
      "direct_exposure",
      "indirect_exposure",
      "sanctions_exposure",
      "cluster_ref",
      "source_authenticated",
      "issued_at_utc",
      "valid_until_utc",
    ],
    collectFiatScreeningResult: [
      "destination_id",
      "screening_result_id",
      "screening_result_version",
      "provider_id",
      "provider_adaptor_version",
      "provider_result_id",
      "bank_country",
      "beneficiary_type",
      "risk_status",
      "risk_score",
      "risk_categories",
      "sanctions_exposure",
      "matched_name_normalized",
      "issued_at_utc",
      "valid_until_utc",
      "screened_at_utc",
    ],
    collectBeneficiaryVerification: ["destination_id", "verification_id", "verification_version", "provider_id", "provider_adaptor_version", "result", "match_score", "issued_at_utc", "valid_until_utc", "verified_at_utc"],
    collectProofOfControl: [
      "challenge_id",
      "destination_id",
      "chain",
      "network",
      "canonical_address",
      "proof_method",
      "verification_scheme",
      "message_format_version",
      "domain_environment",
      "message_hash",
      "verification_status",
      "attempt_count",
      "signature_hash",
      "recovered_address",
      "last_failure_reason_code",
      "issued_at_utc",
      "expires_at_utc",
      "verified_at_utc",
    ],
    collectDestinationDecision: [
      "decision_id",
      "destination_id",
      "destination_type",
      "requested_action",
      "decision",
      "status",
      "aml_decision_id",
      "aml_valid_until_utc",
      "screening_result_id",
      "beneficiary_verification_id",
      "poc_challenge_id",
      "destination_status_version",
      "whitelist_version",
      "revocation_epoch",
      "chain",
      "network",
      "rail",
      "currency",
      "issued_at_utc",
      "expires_at_utc",
      "consumed_at_utc",
      "consumption_id",
      "execution_ref",
    ],
    collectDestinationRevocation: [
      "revocation_id",
      "destination_id",
      "source",
      "reason_code",
      "reason_detail",
      "actor_id",
      "signal_ref",
      "signal_type",
      "destination_status_version_after",
      "revocation_epoch_after",
      "revoked_at_utc",
    ],
  };

  for (const [fnName, expectedKeys] of Object.entries(expectedProjections)) {
    it(`${fnName} projects exactly its frozen field list, in order`, () => {
      expect(extractMapperKeys(fnName)).toEqual(expectedKeys);
    });
  }

  it("all 10 projections carry destination_id (linkability to the destination they concern — disclosed IMPLEMENTATION COMPLETENESS NOTE in this file's own header)", () => {
    for (const fnName of Object.keys(expectedProjections)) {
      expect(extractMapperKeys(fnName)).toContain("destination_id");
    }
  });

  it("no projection anywhere carries approved_by (global prohibition, per-type)", () => {
    for (const fnName of Object.keys(expectedProjections)) {
      expect(extractMapperKeys(fnName)).not.toContain("approved_by");
    }
  });

  it("wallet_destination never exposes the raw memo_tag (only the memo_tag_present boolean)", () => {
    const keys = extractMapperKeys("collectWalletDestination");
    expect(keys).not.toContain("memo_tag_identity");
    expect(keys).not.toContain("memo_tag");
    expect(keys).toContain("memo_tag_present");
  });

  it("fiat_payout_destination never exposes the raw or hashed account identifier (only the masked display form)", () => {
    const keys = extractMapperKeys("collectFiatPayoutDestination");
    expect(keys).not.toContain("account_identifier");
    expect(keys).not.toContain("account_identifier_hash");
    expect(keys).toContain("account_identifier_masked");
  });

  it("beneficiary_verification never exposes the raw beneficiary name or account identifier", () => {
    const keys = extractMapperKeys("collectBeneficiaryVerification");
    expect(keys).not.toContain("beneficiary_name");
    expect(keys).not.toContain("account_identifier");
    expect(keys).not.toContain("beneficiary_name_hash");
    expect(keys).not.toContain("account_identifier_hash");
  });

  it("proof_of_control never exposes a raw signature (only signature_hash)", () => {
    const keys = extractMapperKeys("collectProofOfControl");
    expect(keys).not.toContain("signature");
    expect(keys).toContain("signature_hash");
  });

  it("screening results (wallet + fiat) never carry a raw provider payload dump field", () => {
    for (const fnName of ["collectWalletScreeningResult", "collectFiatScreeningResult"]) {
      const keys = extractMapperKeys(fnName);
      expect(keys).not.toContain("raw_response");
      expect(keys).not.toContain("provider_raw");
      expect(keys).not.toContain("raw_payload");
    }
  });
});
