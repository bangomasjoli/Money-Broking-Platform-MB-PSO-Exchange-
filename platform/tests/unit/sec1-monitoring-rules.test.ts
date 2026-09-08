/**
 * Unit tests for SEC-01 Phase 5's threshold/count-window rule evaluator
 * (services/sec1/src/lib/monitoring-rules.ts). No DB required — a fake `PoolClient` routes
 * queries by their SQL text (count query / de-dup check / linked-refs query / alert INSERT),
 * mirroring tests/unit/sec1-read-query.test.ts's own fake-client convention.
 */
import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { evaluateOneRule } from "../../services/sec1/src/lib/monitoring-rules.js";

interface FakeResponses {
  count?: number;
  alreadyOpen?: boolean;
  linkedRefs?: string[];
}

interface CapturedInsert {
  sql: string;
  params: unknown[];
}

function fakeClient(responses: FakeResponses): { client: PoolClient; inserts: CapturedInsert[] } {
  const inserts: CapturedInsert[] = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("pg_advisory_xact_lock")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT count(*)::text AS n FROM sec1.audit_event")) {
        return { rows: [{ n: String(responses.count ?? 0) }], rowCount: 1 };
      }
      if (sql.includes("FROM sec1.security_alert WHERE rule_id")) {
        return { rows: responses.alreadyOpen ? [{ exists: 1 }] : [], rowCount: responses.alreadyOpen ? 1 : 0 };
      }
      if (sql.includes("SELECT audit_event_ref FROM sec1.audit_event WHERE")) {
        const refs = responses.linkedRefs ?? [];
        return { rows: refs.map((r) => ({ audit_event_ref: r })), rowCount: refs.length };
      }
      if (sql.includes("INSERT INTO sec1.security_alert")) {
        inserts.push({ sql, params: params ?? [] });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query in test fake: ${sql}`);
    },
  } as unknown as PoolClient;
  return { client, inserts };
}

function rawRule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rule_id: "rule_test",
    rule_name: "Test rule",
    event_type_filter: ["iam01.generic_event"],
    condition: { scope_column: "actor_user_id", action: "login", result: "failure" },
    threshold: { count: 5, window_seconds: 300 },
    severity: "high",
    ...overrides,
  };
}

function event(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    auditEventRef: "audit_1",
    eventType: "iam01.generic_event",
    sourceModule: "IAM-01",
    actorUserId: "user_1",
    clientId: null,
    entityType: null,
    entityId: null,
    action: "login",
    result: "failure",
    ...overrides,
  };
}

describe("evaluateOneRule — threshold/count-window firing", () => {
  it("creates an alert when the count meets the threshold and no open alert exists", async () => {
    const { client, inserts } = fakeClient({ count: 5, alreadyOpen: false, linkedRefs: ["audit_1", "audit_2"] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await evaluateOneRule(client, rawRule() as any, event() as any);
    expect(inserts).toHaveLength(1);
    const params = inserts[0]!.params;
    expect(params).toContain("rule_test");
    expect(params).toContain("high");
  });

  it("does NOT create an alert when the count is below the threshold", async () => {
    const { client, inserts } = fakeClient({ count: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await evaluateOneRule(client, rawRule() as any, event() as any);
    expect(inserts).toHaveLength(0);
  });

  it("does NOT create a duplicate alert when an open alert already covers this rule+scope", async () => {
    const { client, inserts } = fakeClient({ count: 10, alreadyOpen: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await evaluateOneRule(client, rawRule() as any, event() as any);
    expect(inserts).toHaveLength(0);
  });

  it("skips (no query at all) when the event's action does not match condition.action", async () => {
    const { client, inserts } = fakeClient({ count: 999 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await evaluateOneRule(client, rawRule() as any, event({ action: "logout" }) as any);
    expect(inserts).toHaveLength(0);
  });

  it("skips when the event's result does not match condition.result", async () => {
    const { client, inserts } = fakeClient({ count: 999 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await evaluateOneRule(client, rawRule() as any, event({ result: "success" }) as any);
    expect(inserts).toHaveLength(0);
  });

  it("skips when the event has no value for the rule's scope_column (nothing to scope by)", async () => {
    const { client, inserts } = fakeClient({ count: 999 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await evaluateOneRule(client, rawRule() as any, event({ actorUserId: null }) as any);
    expect(inserts).toHaveLength(0);
  });

  it("fires with no scope_column at all (rule-wide, not per-actor)", async () => {
    const { client, inserts } = fakeClient({ count: 1, alreadyOpen: false, linkedRefs: ["audit_1"] });
    await evaluateOneRule(
      client,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rawRule({ condition: { action: "sod_conflict" }, threshold: { count: 1, window_seconds: 60 } }) as any,
      event({ action: "sod_conflict", actorUserId: null }) as any,
    );
    expect(inserts).toHaveLength(1);
  });
});

describe("evaluateOneRule — malformed rule row throws (caught+dead-lettered by the caller)", () => {
  it("throws when condition.scope_column is not an allowed value", async () => {
    const { client } = fakeClient({});
    await expect(
      evaluateOneRule(
        client,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawRule({ condition: { scope_column: "source_module" } }) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event() as any,
      ),
    ).rejects.toThrow(/scope_column/);
  });

  it("throws when threshold.count is missing/invalid", async () => {
    const { client } = fakeClient({});
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      evaluateOneRule(client, rawRule({ threshold: { window_seconds: 60 } }) as any, event() as any),
    ).rejects.toThrow(/threshold\.count/);
  });

  it("throws when threshold.window_seconds is missing/invalid", async () => {
    const { client } = fakeClient({});
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      evaluateOneRule(client, rawRule({ threshold: { count: 5 } }) as any, event() as any),
    ).rejects.toThrow(/window_seconds/);
  });
});
