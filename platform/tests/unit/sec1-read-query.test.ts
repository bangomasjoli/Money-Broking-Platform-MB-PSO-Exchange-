/**
 * Unit tests for SEC-01 Phase 4 read/search query building
 * (services/sec1/src/lib/read-query.ts). No DB required — a fake `PoolClient` captures the
 * exact SQL text and parameter array passed to `.query()`, so these tests can assert
 * parameterization (no filter value ever concatenated into SQL text), the whitelist filter
 * set, capped/deterministic pagination, and strict date parsing without a real Postgres.
 */
import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { AppError } from "@aix/foundation";
import {
  searchAuditEvents,
  getAuditEventDetail,
  decodeCursor,
  encodeCursor,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
} from "../../services/sec1/src/lib/read-query.js";

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

function fakeClient(rows: unknown[] = []): { client: PoolClient; captured: CapturedQuery[] } {
  const captured: CapturedQuery[] = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      captured.push({ sql, params: params ?? [] });
      return { rows, rowCount: rows.length };
    },
  } as unknown as PoolClient;
  return { client, captured };
}

describe("searchAuditEvents — parameterization and filter whitelist", () => {
  it("binds every supplied filter as a positional parameter, never string-interpolated", async () => {
    const { client, captured } = fakeClient([]);
    await searchAuditEvents(client, {
      filters: { source_module: "FND-01", event_type: "fnd01.generic_event", severity: "high" },
      limit: 10,
    });
    const { sql, params } = captured[0]!;
    expect(sql).toContain("ae.source_module = $1");
    expect(sql).toContain("ae.event_type = $2");
    expect(sql).toContain("ae.severity = $3");
    expect(params.slice(0, 3)).toEqual(["FND-01", "fnd01.generic_event", "high"]);
    // The SQL TEXT itself never contains the filter VALUES — only the column/param placeholders.
    expect(sql).not.toContain("FND-01");
    expect(sql).not.toContain("fnd01.generic_event");
  });

  it("treats a SQL-injection-shaped filter value as an inert parameter, never as SQL text", async () => {
    const malicious = "FND-01'; DROP TABLE sec1.audit_event; --";
    const { client, captured } = fakeClient([]);
    await searchAuditEvents(client, { filters: { source_module: malicious }, limit: 10 });
    const { sql, params } = captured[0]!;
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain(malicious);
    expect(params).toContain(malicious);
  });

  it("only ever builds WHERE clauses from the fixed whitelisted column list", async () => {
    const { client, captured } = fakeClient([]);
    await searchAuditEvents(client, {
      filters: {
        source_module: "FND-01",
        event_type: "x",
        severity: "high",
        result: "success",
        actor_user_id: "u1",
        client_id: "c1",
        entity_type: "e",
        entity_id: "eid",
        correlation_id: "corr1",
        request_id: "req1",
      },
      limit: 10,
    });
    const { sql } = captured[0]!;
    for (const column of [
      "ae.source_module",
      "ae.event_type",
      "ae.severity",
      "ae.result",
      "ae.actor_user_id",
      "ae.client_id",
      "ae.entity_type",
      "ae.entity_id",
      "ae.correlation_id",
      "ae.request_id",
    ]) {
      expect(sql).toContain(`${column} = $`);
    }
  });

  it("joins sec1.event_schema to resolve sensitive_read, and never mutates audit_event", async () => {
    const { client, captured } = fakeClient([]);
    await searchAuditEvents(client, { filters: {}, limit: 10 });
    const { sql } = captured[0]!;
    expect(sql).toMatch(/JOIN sec1\.event_schema es ON es\.event_type = ae\.event_type/);
    expect(sql.toUpperCase()).not.toMatch(/UPDATE|DELETE|INSERT/);
  });

  it("caps the limit at MAX_SEARCH_LIMIT even if a larger value is somehow passed through", async () => {
    const { client, captured } = fakeClient([]);
    await searchAuditEvents(client, { filters: {}, limit: MAX_SEARCH_LIMIT + 500 });
    const { params } = captured[0]!;
    // Fetches one extra row beyond the (capped) limit to detect a next page.
    expect(params[params.length - 1]).toBe(MAX_SEARCH_LIMIT + 1);
  });

  it("defaults to at least 1 row requested even for a non-positive limit", async () => {
    const { client, captured } = fakeClient([]);
    await searchAuditEvents(client, { filters: {}, limit: 0 });
    const { params } = captured[0]!;
    expect(params[params.length - 1]).toBe(2); // capped-to-1 limit + 1 lookahead row
  });

  it("applies a strict keyset cursor comparison, never OFFSET", async () => {
    const { client, captured } = fakeClient([]);
    await searchAuditEvents(client, {
      filters: {},
      limit: 10,
      cursor: { ingested_at_utc: "2026-01-01T00:00:00.000Z", audit_event_ref: "audit_5" },
    });
    const { sql } = captured[0]!;
    // F-1 fix: the cursor boundary is explicitly cast back to timestamptz — never left as a
    // bare text parameter implicitly compared, and never built from a JS Date round-trip.
    expect(sql).toMatch(/\(ae\.ingested_at_utc, ae\.audit_event_ref\) < \(\$\d+::timestamptz, \$\d+\)/);
    expect(sql.toUpperCase()).not.toContain("OFFSET");
  });

  it("selects a Postgres-rendered full-precision ingested_at_utc_cursor column (F-1 fix)", async () => {
    const { client, captured } = fakeClient([]);
    await searchAuditEvents(client, { filters: {}, limit: 10 });
    const { sql } = captured[0]!;
    expect(sql).toMatch(/to_char\(ae\.ingested_at_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS\.US"Z"'\) AS ingested_at_utc_cursor/);
  });

  it("computes a next_cursor only when more rows exist beyond the page", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => sampleRawRow(`audit_${i}`));
    const { client } = fakeClient(rows);
    const result = await searchAuditEvents(client, { filters: {}, limit: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
    expect(result.nextCursor?.audit_event_ref).toBe("audit_1");
  });

  it("F-1 fix: next_cursor is built from ingested_at_utc_cursor (full microsecond text), never from the Date-typed ingested_at_utc", async () => {
    // The Date-typed ingested_at_utc is deliberately identical across all rows (millisecond
    // precision only) while ingested_at_utc_cursor carries distinct microsecond values — proves
    // the cursor is sourced from the precise text column, not a toIso()-truncated Date.
    const rows = [
      sampleRawRow("audit_a", { ingestedAtUtcCursor: "2026-06-01T00:00:00.123800Z" }),
      sampleRawRow("audit_b", { ingestedAtUtcCursor: "2026-06-01T00:00:00.123400Z" }),
      sampleRawRow("audit_c", { ingestedAtUtcCursor: "2026-06-01T00:00:00.123000Z" }),
    ];
    const { client } = fakeClient(rows);
    const result = await searchAuditEvents(client, { filters: {}, limit: 2 });
    expect(result.nextCursor).toEqual({
      ingested_at_utc: "2026-06-01T00:00:00.123400Z",
      audit_event_ref: "audit_b",
    });
  });

  it("returns null next_cursor when the result set fits within the page", async () => {
    const rows = [sampleRawRow("audit_0")];
    const { client } = fakeClient(rows);
    const result = await searchAuditEvents(client, { filters: {}, limit: 10 });
    expect(result.nextCursor).toBeNull();
  });

  it("rejects an unparseable occurred_at_from filter, fail closed", async () => {
    const { client } = fakeClient([]);
    await expect(
      searchAuditEvents(client, { filters: { occurred_at_from: "not-a-date" }, limit: 10 }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("accepts the blueprint's documented ISO timestamp formats for date filters", async () => {
    const { client, captured } = fakeClient([]);
    await searchAuditEvents(client, {
      filters: { occurred_at_from: "2026-01-01T00:00:00Z", occurred_at_to: "2026-01-31T23:59:59+00:00" },
      limit: 10,
    });
    const { params } = captured[0]!;
    expect(params[0]).toBeInstanceOf(Date);
    expect(params[1]).toBeInstanceOf(Date);
  });
});

describe("cursor encode/decode", () => {
  it("round-trips a cursor through encode/decode", () => {
    const cursor = { ingested_at_utc: "2026-01-01T00:00:00.000Z", audit_event_ref: "audit_1" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("returns undefined for an undefined raw cursor", () => {
    expect(decodeCursor(undefined)).toBeUndefined();
  });

  it("rejects a malformed cursor, fail closed", () => {
    expect(() => decodeCursor("not-base64-json")).toThrow(AppError);
    expect(() => decodeCursor(Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64url"))).toThrow(AppError);
  });
});

describe("getAuditEventDetail", () => {
  it("looks up by audit_event_ref when supplied", async () => {
    const { client, captured } = fakeClient([sampleRawRow("audit_1")]);
    await getAuditEventDetail(client, { auditEventRef: "audit_1" });
    expect(captured[0]!.sql).toContain("ae.audit_event_ref = $1");
    expect(captured[0]!.params).toEqual(["audit_1"]);
  });

  it("looks up by (source_module, event_id) when audit_event_ref is absent", async () => {
    const { client, captured } = fakeClient([sampleRawRow("audit_1")]);
    await getAuditEventDetail(client, { sourceModule: "FND-01", eventId: "evt_1" });
    expect(captured[0]!.sql).toContain("ae.source_module = $1 AND ae.event_id = $2");
    expect(captured[0]!.params).toEqual(["FND-01", "evt_1"]);
  });

  it("fails closed (VALIDATION_ERROR) when neither lookup key is supplied", async () => {
    const { client } = fakeClient([]);
    await expect(getAuditEventDetail(client, {})).rejects.toBeInstanceOf(AppError);
  });

  it("returns null (not an error) when no row matches", async () => {
    const { client } = fakeClient([]);
    const result = await getAuditEventDetail(client, { auditEventRef: "audit_missing" });
    expect(result).toBeNull();
  });
});

describe("pagination constants", () => {
  it("DEFAULT_SEARCH_LIMIT is within MAX_SEARCH_LIMIT", () => {
    expect(DEFAULT_SEARCH_LIMIT).toBeLessThanOrEqual(MAX_SEARCH_LIMIT);
  });
});

function sampleRawRow(auditEventRef: string, overrides: { ingestedAtUtcCursor?: string } = {}) {
  return {
    audit_event_ref: auditEventRef,
    event_type: "sec1.self_audit_event",
    event_category: "security",
    severity: "medium",
    source_module: "SEC-01",
    actor_user_id: "user_1",
    actor_type: "staff",
    session_id: "session_1",
    client_id: "client_1",
    entity_type: null,
    entity_id: null,
    action: "test.action",
    result: "success",
    reason_code: null,
    request_id: "req_1",
    correlation_id: "corr_1",
    occurred_at_utc: new Date("2026-01-01T00:00:00.000Z"),
    ingested_at_utc: new Date("2026-01-01T00:00:01.000Z"),
    metadata_redacted: {},
    classification: "restricted",
    retention_class: "standard",
    status: "active",
    sensitive_read: true,
    ingested_at_utc_cursor: overrides.ingestedAtUtcCursor ?? "2026-01-01T00:00:01.000000Z",
  };
}
