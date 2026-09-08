/**
 * WLT-01 Named Vendor-Result Ingestion / Async Path — Stuck-Screening Operational Closure — pure/
 * format-level unit tests for `lib/stuck-screening.ts`'s response-projection helpers, plus
 * acceptance-sensitive source guards across both new production files (`lib/stuck-screening.ts`
 * and `routes/stuck-screening.ts`). No database — the live route/transaction/idempotency/race
 * behaviour is exercised in `tests/integration/wlt1-stuck-screening-route.test.ts`; this file
 * locks in pure logic and forbidden-content source shape (mirrors the established `readFileSync`
 * + regex acceptance-sensitive source-guard pattern used throughout this codebase, e.g.
 * `wlt1-inbound-source.test.ts`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeStuckScreeningResponse, STUCK_SCREENING_LIST_LIMIT, STUCK_SCREENING_REASON_CODES, type StuckScreeningRow } from "../../services/wlt1/src/lib/stuck-screening.js";

const LIB_SOURCE = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "lib", "stuck-screening.ts"), "utf8");
const ROUTE_SOURCE = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "routes", "stuck-screening.ts"), "utf8");
const PROVIDER_RECEIPT_ROUTE_SOURCE = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "routes", "provider-receipt.ts"), "utf8");

/** Strips `/* ... *\/` block comments and `// ...` line comments before scanning — mirrors
 * `wlt1-screening-pending-row-mutation-boundary.test.ts`'s own identical helper exactly, so a doc
 * comment explaining this control's own boundary (which legitimately names `vendor_result_inbox`,
 * `provider-receipt.ts`, `FOR UPDATE`, "no worker/queue" in prose) can never trip a source guard;
 * only real code counts. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const LIB_CODE = stripComments(LIB_SOURCE);
const ROUTE_CODE = stripComments(ROUTE_SOURCE);

describe("STUCK_SCREENING_REASON_CODES / STUCK_SCREENING_LIST_LIMIT", () => {
  it("exactly the 3 frozen reason codes", () => {
    expect([...STUCK_SCREENING_REASON_CODES].sort()).toEqual(["operator_containment", "provider_outage", "provider_result_never_delivered"].sort());
  });

  it("list bound is exactly 200, a fixed module constant (never caller-supplied)", () => {
    expect(STUCK_SCREENING_LIST_LIMIT).toBe(200);
  });
});

describe("safeStuckScreeningResponse — exact 11-key safe projection", () => {
  function row(overrides: Partial<StuckScreeningRow> = {}): StuckScreeningRow {
    return {
      screening_result_id: "wlt1screen_1",
      screening_result_version: 1,
      destination_id: "wlt1dest_1",
      chain: "ethereum",
      network: "mainnet",
      provider_id: "stub-wallet-analytics-v1",
      provider_adaptor_version: "1",
      created_at_utc: "2026-06-01T00:00:00.000Z",
      last_attempt_at_utc: "2026-06-01T00:10:00.000Z",
      age_seconds: 1200,
      destination_status: "pending_screening",
      ...overrides,
    };
  }

  it("exact key set", () => {
    const response = safeStuckScreeningResponse(row());
    expect(Object.keys(response).sort()).toEqual(
      [
        "screening_result_id",
        "screening_result_version",
        "destination_id",
        "chain",
        "network",
        "provider_id",
        "provider_adaptor_version",
        "created_at_utc",
        "last_attempt_at_utc",
        "age_seconds",
        "recoverable",
      ].sort(),
    );
  });

  it("never carries destination_status, canonical_address, address_hash, client_id, risk_score, or risk_categories", () => {
    const response = safeStuckScreeningResponse(row());
    for (const forbidden of ["destination_status", "canonical_address", "address_hash", "client_id", "risk_score", "risk_categories"]) {
      expect(response).not.toHaveProperty(forbidden);
    }
  });

  it("recoverable: true when destination_status === 'pending_screening'", () => {
    expect(safeStuckScreeningResponse(row({ destination_status: "pending_screening" })).recoverable).toBe(true);
  });

  it("recoverable: false for any other destination_status (a rarer crash shape — visible but not recoverable)", () => {
    for (const status of ["draft", "pending_review", "approved_pending_cooling", "active", "revoked"]) {
      expect(safeStuckScreeningResponse(row({ destination_status: status })).recoverable).toBe(false);
    }
  });
});

describe("acceptance-sensitive source guard — audit metadata is exactly the 10 frozen keys", () => {
  it("exact key set, no PII, no raw payload, no secret", () => {
    const start = LIB_SOURCE.indexOf('event_type: "wlt1.screening_recovered"');
    expect(start).toBeGreaterThan(-1);
    const metaStart = LIB_SOURCE.indexOf("metadata: {", start);
    const metaEnd = LIB_SOURCE.indexOf("},", metaStart);
    const block = LIB_SOURCE.slice(metaStart, metaEnd);
    const keys: string[] = [];
    const re = /^\s{6}(\w+):/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) keys.push(m[1]);
    expect(keys.sort()).toEqual(
      [
        "screening_result_id",
        "screening_result_version",
        "destination_id",
        "provider_id",
        "provider_adaptor_version",
        "reason_code",
        "pending_age_seconds",
        "destination_status_after",
        "destination_status_version_after",
        "recovered_at_utc",
      ].sort(),
    );
    for (const forbidden of ["canonical_address", "address_hash", "client_id", "raw_response", "secret", "signature", "service_token"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("acceptance-sensitive source guard — POST response never exposes current destination state (Final Micro-Clarification §10)", () => {
  it("recoveryResponse's own literal object never contains destination_status or destination_status_version keys", () => {
    const start = ROUTE_SOURCE.indexOf("function recoveryResponse(");
    expect(start).toBeGreaterThan(-1);
    const end = ROUTE_SOURCE.indexOf("\n}", start);
    const block = ROUTE_SOURCE.slice(start, end);
    expect(block).not.toMatch(/destination_status:/);
    expect(block).not.toMatch(/destination_status_version:/);
    expect(block).toMatch(/destination_released:\s*true/);
  });
});

describe("acceptance-sensitive source guard — min_age_seconds may only RAISE the effective threshold", () => {
  it("the effective-threshold expression is Math.max(configured, min_age_seconds ?? 0) — never a bare min_age_seconds substitution", () => {
    expect(ROUTE_SOURCE).toMatch(/Math\.max\(config\.stuckScreeningThresholdSeconds,\s*q\.min_age_seconds\s*\?\?\s*0\)/);
  });
});

describe("acceptance-sensitive source guard — unknown id returns 404 BEFORE beginIdempotent", () => {
  it("WLT1_STUCK_SCREENING_NOT_FOUND is thrown before the beginIdempotent call site in the route source", () => {
    const notFoundIdx = ROUTE_SOURCE.indexOf("WLT1_STUCK_SCREENING_NOT_FOUND");
    const beginIdx = ROUTE_SOURCE.indexOf("beginIdempotent(client");
    expect(notFoundIdx).toBeGreaterThan(-1);
    expect(beginIdx).toBeGreaterThan(-1);
    expect(notFoundIdx).toBeLessThan(beginIdx);
  });
});

describe("acceptance-sensitive source guard — advisory lock precedes both row locks", () => {
  it("pg_advisory_xact_lock appears before both FOR UPDATE row-lock sites in lib/stuck-screening.ts's own real code (comments excluded)", () => {
    const lockIdx = LIB_CODE.indexOf("pg_advisory_xact_lock");
    const forUpdateIndices = [...LIB_CODE.matchAll(/FOR UPDATE/g)].map((m) => m.index ?? -1);
    expect(lockIdx).toBeGreaterThan(-1);
    expect(forUpdateIndices.length).toBeGreaterThanOrEqual(2);
    for (const idx of forUpdateIndices) expect(lockIdx).toBeLessThan(idx);
  });
});

describe("acceptance-sensitive source guard — this is NOT a new async ingestion path", () => {
  it("neither new production file's real code references vendor_result_inbox, provider-receipt, or the provider registry (the header comments legitimately name these in prose explaining the boundary — comments are excluded from this scan)", () => {
    for (const code of [LIB_CODE, ROUTE_CODE]) {
      expect(code).not.toMatch(/vendor_result_inbox/);
      expect(code).not.toMatch(/provider-receipt/);
      expect(code).not.toMatch(/providers\/registry/);
      expect(code).not.toMatch(/screenViaProvider/);
      expect(code).not.toMatch(/normalizeReceipt/);
    }
  });

  it("neither file's real code references a worker, queue, or webhook", () => {
    for (const code of [LIB_CODE, ROUTE_CODE]) {
      expect(code.toLowerCase()).not.toMatch(/\bworker\b/);
      expect(code.toLowerCase()).not.toMatch(/\bqueue\b/);
      expect(code.toLowerCase()).not.toMatch(/\bwebhook\b/);
    }
  });
});

describe("acceptance-sensitive source guard — the vendor-result/receipt ingestion path cannot target wlt1.inbound_source_screening_result (Named Vendor-Result Ingestion / Async Path addendum: inbound-source screening is a synchronous, provider-receipt-independent path — the shared async ingestion route must never be extended to write this table, and stuck-screening recovery is unrelated to and does not touch it either)", () => {
  it("services/wlt1/src/routes/provider-receipt.ts contains no reference whatsoever (code or comment) to inbound_source_screening_result or the inbound-source-screening module", () => {
    expect(PROVIDER_RECEIPT_ROUTE_SOURCE).not.toMatch(/inbound_source_screening_result/);
    expect(PROVIDER_RECEIPT_ROUTE_SOURCE).not.toMatch(/inbound-source/i);
  });
});

describe("acceptance-sensitive source guard — no IAM, no decrypt, no limits, no LED/DEP", () => {
  it("no IAM client import in either new production file's actual import statements", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      const importLines = (src.match(/^import .*$/gm) ?? []).join("\n");
      expect(importLines).not.toMatch(/iam2-client/i);
      expect(importLines).not.toMatch(/checkPermission/);
      expect(importLines).not.toMatch(/verifyDecisionToken/);
    }
    expect(ROUTE_SOURCE).not.toMatch(/checkPermission\(/);
    expect(ROUTE_SOURCE).not.toMatch(/verifyDecisionToken\(/);
  });

  it("no decrypt / KMS / raw provider payload", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      expect(src.toLowerCase()).not.toMatch(/decrypt/);
      expect(src).not.toMatch(/createDecipheriv/);
      expect(src.toLowerCase()).not.toMatch(/\bkms\b/);
    }
  });

  it("no limits/velocity/first-use/aggregate-amount state", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      expect(src.toLowerCase()).not.toMatch(/velocity/);
      expect(src).not.toMatch(/transfer_count/);
      expect(src).not.toMatch(/first_seen/);
      expect(src.toLowerCase()).not.toMatch(/concentration/);
    }
  });

  it("no ledger/deposit/withdrawal/balance SQL writes (prose explaining what this control does NOT do is expected and excluded)", () => {
    for (const src of [LIB_SOURCE, ROUTE_SOURCE]) {
      const sqlTemplateLiterals = src.match(/`[^`]*`/gs) ?? [];
      for (const sql of sqlTemplateLiterals) {
        expect(sql.toLowerCase()).not.toMatch(/ledger|balance|deposit|withdrawal/);
      }
    }
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

describe("acceptance-sensitive source guard — recovery mutation is guarded (never an unconditional UPDATE)", () => {
  it("the screening UPDATE guards on risk_status = 'pending' and sets risk_status = 'failed', never the reverse", () => {
    const updateIdx = LIB_SOURCE.indexOf("UPDATE wlt1.wallet_screening_result");
    expect(updateIdx).toBeGreaterThan(-1);
    const window = LIB_SOURCE.slice(updateIdx, updateIdx + 400);
    expect(window).toContain("SET risk_status = 'failed'");
    expect(window).toMatch(/WHERE\s+screening_result_id\s*=\s*\$1\s+AND\s+risk_status\s*=\s*'pending'/);
  });

  it("lib/stuck-screening.ts never sets risk_status = 'pending' anywhere", () => {
    expect(LIB_SOURCE).not.toMatch(/risk_status\s*=\s*'pending'\s*,/);
    expect(LIB_SOURCE).not.toMatch(/SET risk_status = 'pending'/);
  });
});
