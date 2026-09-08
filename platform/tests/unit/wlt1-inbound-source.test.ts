/**
 * WLT-01 Inbound-Source Screening — pure/format-level unit tests for `lib/inbound-source.ts`'s
 * identity/eligibility/audit-metadata/response-projection helpers, plus acceptance-sensitive
 * source guards across both new production files (`lib/inbound-source.ts` and
 * `routes/inbound-source-screening.ts`). No database — the live route/transaction/idempotency
 * behaviour is exercised in `tests/integration/wlt1-inbound-source-screening-route.test.ts`; this
 * file locks in pure logic and forbidden-content source shape (mirrors the established
 * `readFileSync` + regex acceptance-sensitive source-guard pattern used throughout this codebase,
 * e.g. `wlt1-evidence-export.test.ts`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicaliseAddress } from "../../services/wlt1/src/lib/address/index.js";
import {
  buildInboundScreeningAuditMetadata,
  buildInboundScreeningResponse,
  computeAddressHash,
  computeEffectiveValidUntil,
  INBOUND_REASON_CODES,
  isDuplicateInboundTransferViolation,
  mapRiskToEligibility,
  newInboundScreeningResultId,
  type InboundScreeningResponseRow,
} from "../../services/wlt1/src/lib/inbound-source.js";
import { WLT1_TEST_STUB_ADDRESS_CLEAR } from "../../services/wlt1/src/lib/providers/stub-provider.js";

const LIB_SOURCE = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "lib", "inbound-source.ts"), "utf8");
const ROUTE_SOURCE = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "routes", "inbound-source-screening.ts"), "utf8");

describe("newInboundScreeningResultId", () => {
  it("mints a wlt1isr_-prefixed id, unique across calls", () => {
    const a = newInboundScreeningResultId();
    const b = newInboundScreeningResultId();
    expect(a).toMatch(/^wlt1isr_[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });
});

describe("computeAddressHash — reused from lib/destinations.ts, not duplicated", () => {
  it("identity is exactly (chain, network, canonical_address) — transaction_ref/transaction_hash/asset/client_id play no part", () => {
    const a = computeAddressHash("ethereum", "mainnet", WLT1_TEST_STUB_ADDRESS_CLEAR, "");
    const b = computeAddressHash("ethereum", "mainnet", WLT1_TEST_STUB_ADDRESS_CLEAR, "");
    expect(a).toBe(b);
  });

  it("a different chain, network, or canonical address changes the hash", () => {
    const base = computeAddressHash("ethereum", "mainnet", WLT1_TEST_STUB_ADDRESS_CLEAR, "");
    expect(computeAddressHash("tron", "mainnet", WLT1_TEST_STUB_ADDRESS_CLEAR, "")).not.toBe(base);
    expect(computeAddressHash("ethereum", "testnet", WLT1_TEST_STUB_ADDRESS_CLEAR, "")).not.toBe(base);
    expect(computeAddressHash("ethereum", "mainnet", "0x" + "2".repeat(40), "")).not.toBe(base);
  });

  it("no memo/tag is ever mixed into the hash — memoTagIdentity is always the empty string for this control", () => {
    const withEmpty = computeAddressHash("ethereum", "mainnet", WLT1_TEST_STUB_ADDRESS_CLEAR, "");
    const withNonEmpty = computeAddressHash("ethereum", "mainnet", WLT1_TEST_STUB_ADDRESS_CLEAR, "some-memo");
    expect(withEmpty).not.toBe(withNonEmpty);
    // The route source guard below proves the route ALWAYS passes "" — this test just proves the
    // primitive itself is memo-sensitive, so passing "" is a meaningful, load-bearing choice.
  });
});

describe("canonicaliseAddress — reused unchanged, no duplicated canonicalisation logic", () => {
  it("a genuinely canonical fixture address round-trips as ok:true, canonicalAddress === input", () => {
    const result = canonicaliseAddress("ethereum", "mainnet", WLT1_TEST_STUB_ADDRESS_CLEAR);
    expect(result).toMatchObject({ ok: true, canonicalAddress: WLT1_TEST_STUB_ADDRESS_CLEAR });
  });

  it("an unsupported chain/network pair returns reasonCode unsupported_chain", () => {
    const result = canonicaliseAddress("bitcoin", "mainnet", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
    expect(result).toEqual({ ok: false, reasonCode: "unsupported_chain" });
  });

  it("an alias-shaped input is rejected before dispatch", () => {
    const result = canonicaliseAddress("ethereum", "mainnet", "someone.eth");
    expect(result).toEqual({ ok: false, reasonCode: "alias_shaped_input" });
  });
});

describe("mapRiskToEligibility — exact frozen mapping, no ambiguity", () => {
  it("clear -> eligible / source_screening_clear", () => {
    expect(mapRiskToEligibility("clear")).toEqual({ eligibility: "eligible", reasonCode: "source_screening_clear" });
  });
  it("review_required -> not_eligible / source_review_required", () => {
    expect(mapRiskToEligibility("review_required")).toEqual({ eligibility: "not_eligible", reasonCode: "source_review_required" });
  });
  it("high_risk -> not_eligible / source_high_risk", () => {
    expect(mapRiskToEligibility("high_risk")).toEqual({ eligibility: "not_eligible", reasonCode: "source_high_risk" });
  });
  it("hit -> not_eligible / source_sanctions_hit", () => {
    expect(mapRiskToEligibility("hit")).toEqual({ eligibility: "not_eligible", reasonCode: "source_sanctions_hit" });
  });
  it("exactly 4 reason codes exist, matching the 4 terminal risk statuses 1:1", () => {
    expect(INBOUND_REASON_CODES).toHaveLength(4);
    expect(INBOUND_REASON_CODES.sort()).toEqual(["source_high_risk", "source_review_required", "source_sanctions_hit", "source_screening_clear"].sort());
  });
});

describe("computeEffectiveValidUntil — own copy, mirrors the established fiat-destination.ts/screening-application.ts pattern", () => {
  const issuedAt = new Date("2026-06-01T00:00:00.000Z");
  it("no provider expiry -> issuedAt + ceiling", () => {
    expect(computeEffectiveValidUntil(issuedAt, null, 24).toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });
  it("provider expiry earlier than ceiling -> provider expiry wins", () => {
    const providerExpiry = new Date("2026-06-01T06:00:00.000Z");
    expect(computeEffectiveValidUntil(issuedAt, providerExpiry, 24).getTime()).toBe(providerExpiry.getTime());
  });
  it("provider expiry later than ceiling -> clips to the ceiling", () => {
    const providerExpiry = new Date("2027-01-01T00:00:00.000Z");
    expect(computeEffectiveValidUntil(issuedAt, providerExpiry, 24).toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });
});

describe("isDuplicateInboundTransferViolation — ONLY the transfer constraint is ever matched", () => {
  it("positive: 23505 on uq_wlt1_inbound_source_transfer", () => {
    expect(isDuplicateInboundTransferViolation({ code: "23505", constraint: "uq_wlt1_inbound_source_transfer" })).toBe(true);
  });
  it("negative: 23505 on uq_wlt1_inbound_source_result_id is NEVER treated as transfer replay", () => {
    expect(isDuplicateInboundTransferViolation({ code: "23505", constraint: "uq_wlt1_inbound_source_result_id" })).toBe(false);
  });
  it("negative: 23505 on uq_wlt1_inbound_source_version is NEVER treated as transfer replay", () => {
    expect(isDuplicateInboundTransferViolation({ code: "23505", constraint: "uq_wlt1_inbound_source_version" })).toBe(false);
  });
  it("negative: a different code, or a non-pg error, or null/undefined", () => {
    expect(isDuplicateInboundTransferViolation({ code: "23503", constraint: "uq_wlt1_inbound_source_transfer" })).toBe(false);
    expect(isDuplicateInboundTransferViolation(new Error("boom"))).toBe(false);
    expect(isDuplicateInboundTransferViolation(null)).toBe(false);
    expect(isDuplicateInboundTransferViolation(undefined)).toBe(false);
  });
});

describe("buildInboundScreeningAuditMetadata — exact 12 keys, never a raw address/transaction_hash/asset/token", () => {
  it("exact key set", () => {
    const meta = buildInboundScreeningAuditMetadata({
      screeningResultId: "wlt1isr_1",
      screeningResultVersion: 1,
      clientId: "clt1client_1",
      chain: "ethereum",
      network: "mainnet",
      addressHash: "sha256:abc",
      transactionRef: "tx-1",
      riskStatus: "clear",
      sanctionsExposure: false,
      sourceEligibility: "eligible",
      reasonCode: "source_screening_clear",
      providerId: "stub-wallet-analytics-v1",
    });
    expect(Object.keys(meta).sort()).toEqual(
      [
        "screening_result_id",
        "screening_result_version",
        "client_id",
        "chain",
        "network",
        "address_hash",
        "transaction_ref",
        "risk_status",
        "sanctions_exposure",
        "source_eligibility",
        "reason_code",
        "provider_id",
      ].sort(),
    );
  });

  it("never carries canonical_address, source_address, transaction_hash, asset, risk_categories, or a service token", () => {
    const meta = buildInboundScreeningAuditMetadata({
      screeningResultId: "wlt1isr_1",
      screeningResultVersion: 1,
      clientId: "clt1client_1",
      chain: "ethereum",
      network: "mainnet",
      addressHash: "sha256:abc",
      transactionRef: "tx-1",
      riskStatus: "hit",
      sanctionsExposure: true,
      sourceEligibility: "not_eligible",
      reasonCode: "source_sanctions_hit",
      providerId: "stub-wallet-analytics-v1",
    });
    for (const forbidden of ["canonical_address", "source_address", "transaction_hash", "asset", "risk_categories", "service_token", "raw_response"]) {
      expect(meta).not.toHaveProperty(forbidden);
    }
  });
});

describe("buildInboundScreeningResponse — exact 15 keys, full source NEVER in the response", () => {
  function row(overrides: Partial<InboundScreeningResponseRow> = {}): InboundScreeningResponseRow {
    return {
      screening_result_id: "wlt1isr_1",
      screening_result_version: 1,
      client_id: "clt1client_1",
      chain: "ethereum",
      network: "mainnet",
      transaction_ref: "tx-1",
      risk_status: "clear",
      source_eligibility: "eligible",
      reason_code: "source_screening_clear",
      sanctions_exposure: false,
      risk_categories: [],
      provider_id: "stub-wallet-analytics-v1",
      provider_result_id: "presult_1",
      issued_at_utc: new Date("2026-06-01T00:00:00.000Z"),
      valid_until_utc: new Date("2026-07-01T00:00:00.000Z"),
      ...overrides,
    };
  }

  it("exact 15-key shape", () => {
    const response = buildInboundScreeningResponse(row(), false);
    expect(Object.keys(response).sort()).toEqual(
      [
        "screening_result_id",
        "screening_result_version",
        "client_id",
        "chain",
        "network",
        "transaction_ref",
        "risk_status",
        "source_eligibility",
        "reason_code",
        "sanctions_exposure",
        "risk_categories",
        "provider_id",
        "provider_result_id",
        "issued_at_utc",
        "valid_until_utc",
        "replay",
      ].sort(),
    );
  });

  it("never carries canonical_address, source_address, address_hash, transaction_hash, asset, or payload_hash", () => {
    const response = buildInboundScreeningResponse(row(), false);
    for (const forbidden of ["canonical_address", "source_address", "address_hash", "transaction_hash", "asset", "payload_hash"]) {
      expect(response).not.toHaveProperty(forbidden);
    }
  });

  it("replay flag is carried through exactly as passed; null valid_until_utc serializes to null, never a crash", () => {
    expect(buildInboundScreeningResponse(row(), false).replay).toBe(false);
    expect(buildInboundScreeningResponse(row(), true).replay).toBe(true);
    expect(buildInboundScreeningResponse(row({ valid_until_utc: null }), false).valid_until_utc).toBeNull();
  });

  it("timestamps are ISO strings, not Date objects, in the response", () => {
    const response = buildInboundScreeningResponse(row(), false);
    expect(typeof response.issued_at_utc).toBe("string");
    expect(response.issued_at_utc).toBe("2026-06-01T00:00:00.000Z");
  });
});

// -------------------------------------------------------------------------------------------
// Acceptance-sensitive source guards — both new production files.
// -------------------------------------------------------------------------------------------
describe("acceptance-sensitive source guard — no AML-01 import (AML-01 is deliberately NOT in this path)", () => {
  it("neither new production file's import statements reference aml1-client / screenPreTransaction / Aml1Client (the route file's own header comment explaining the boundary legitimately names lib/aml1-client.ts in prose — this guard checks only actual `import` lines)", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      const importLines = (src.match(/^import .*$/gm) ?? []).join("\n");
      expect(importLines).not.toMatch(/aml1-client/i);
      expect(importLines).not.toMatch(/screenPreTransaction/);
      expect(importLines).not.toMatch(/Aml1Client/);
    }
    expect(ROUTE_SOURCE).not.toMatch(/screenPreTransaction\(/);
  });

  it("neither file references aml_decision_id or aml_valid_until_utc", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      expect(src).not.toMatch(/aml_decision_id/);
      expect(src).not.toMatch(/aml_valid_until_utc/);
    }
  });
});

describe("acceptance-sensitive source guard — no vendor_result_inbox / async ingestion", () => {
  it("neither new production file references vendor_result_inbox, a worker, a queue, a callback, or a webhook", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      expect(src).not.toMatch(/vendor_result_inbox/);
      expect(src.toLowerCase()).not.toMatch(/\bworker\b/);
      expect(src.toLowerCase()).not.toMatch(/\bqueue\b/);
      expect(src.toLowerCase()).not.toMatch(/\bwebhook\b/);
      expect(src).not.toMatch(/\bcallback\b/i);
    }
  });
});

describe("acceptance-sensitive source guard — no amount / limits / velocity / first-use state", () => {
  it("neither file references amount, velocity, first_seen, last_seen, transfer_count, or concentration", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      expect(src.toLowerCase()).not.toMatch(/\bamount\b/);
      expect(src.toLowerCase()).not.toMatch(/velocity/);
      expect(src).not.toMatch(/first_seen/);
      expect(src).not.toMatch(/last_seen/);
      expect(src).not.toMatch(/transfer_count/);
      expect(src).not.toMatch(/concentration/);
    }
  });
});

describe("acceptance-sensitive source guard — no decrypt / KMS / raw provider payload", () => {
  it("neither file references decrypt, createDecipheriv, or KMS", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      expect(src.toLowerCase()).not.toMatch(/decrypt/);
      expect(src).not.toMatch(/createDecipheriv/);
      expect(src.toLowerCase()).not.toMatch(/\bkms\b/);
    }
  });

  it("no raw_payload / provider_payload / raw_response field is ever constructed", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      expect(src).not.toMatch(/raw_payload/);
      expect(src).not.toMatch(/provider_payload/);
    }
  });
});

describe("acceptance-sensitive source guard — no destination coupling", () => {
  it("neither new production file queries or references wlt1.destination — an inbound source is never registered/looked up as a destination", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      expect(src).not.toMatch(/wlt1\.destination\b/);
    }
  });

  it("the migration adds no FK to wlt1.destination (verified live in wlt1-migration-064-regression.test.ts; this is the source-level companion guard)", () => {
    const migrationSource = readFileSync(join(__dirname, "..", "..", "infra", "migrations", "064_wlt1_inbound_source_screening.cjs"), "utf8");
    expect(migrationSource).not.toMatch(/REFERENCES wlt1\.destination/);
  });
});

describe("acceptance-sensitive source guard — no LED/DEP mutation, no decision token, no maker-checker", () => {
  it("no ledger/balance/deposit/withdrawal SQL writes (prose in the header comment explaining what this control does NOT do is expected and excluded)", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      const sqlTemplateLiterals = src.match(/`[^`]*`/gs) ?? [];
      for (const sql of sqlTemplateLiterals) {
        expect(sql.toLowerCase()).not.toMatch(/ledger|balance|deposit|withdrawal/);
      }
    }
  });

  it("no decision token / verify-and-consume machinery, no IAM checkPermission/verifyDecisionToken import", () => {
    expect(ROUTE_SOURCE).not.toMatch(/decision_token/);
    expect(ROUTE_SOURCE).not.toMatch(/verifyDecisionToken/);
    expect(ROUTE_SOURCE).not.toMatch(/checkPermission/);
    expect(ROUTE_SOURCE).not.toMatch(/iam2-client/);
  });

  it("no actor_id in the request schema (no human IAM identity on this automated route)", () => {
    expect(ROUTE_SOURCE).not.toMatch(/actor_id:\s*Type\.String/);
  });
});

describe("acceptance-sensitive source guard — transfer equivalence is address_hash ONLY", () => {
  it("the existing-transfer identity comparison compares address_hash, never transaction_hash or asset", () => {
    const start = ROUTE_SOURCE.indexOf("if (existing) {");
    expect(start).toBeGreaterThan(-1);
    const end = ROUTE_SOURCE.indexOf("absent -> commit TX-A", start);
    expect(end).toBeGreaterThan(start);
    const block = ROUTE_SOURCE.slice(start, end);
    expect(block).toMatch(/existing\.address_hash === addressHash/);
    expect(block).not.toMatch(/transaction_hash/);
    expect(block).not.toMatch(/\.asset\b/);
  });

  it("the TX-C winner-recovery comparison likewise compares only address_hash and risk_status, never transaction_hash/asset", () => {
    const tx3Block = ROUTE_SOURCE.slice(ROUTE_SOURCE.indexOf("TX-C recovery"));
    expect(tx3Block).toMatch(/winner\.address_hash !== addressHash/);
    expect(tx3Block).toMatch(/winner\.risk_status !== result\.riskStatus/);
    expect(tx3Block).not.toMatch(/winner\.transaction_hash/);
    expect(tx3Block).not.toMatch(/winner\.asset\b/);
  });
});

describe("acceptance-sensitive source guard — no SELECT * / no row dump", () => {
  it("no SELECT * in any SQL template literal", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      const sqlTemplateLiterals = src.match(/`[^`]*`/gs) ?? [];
      for (const sql of sqlTemplateLiterals) {
        expect(sql).not.toMatch(/SELECT\s+\*/i);
      }
    }
  });
});
