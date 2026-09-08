/**
 * Pure/DB-free tests for services/cfg1/src/lib/kill-switch.ts, via a fake PoolClient that
 * records every `.query()` call in submission order (mirrors tests/unit/cfg1-decision-token.
 * test.ts's own `fakeClient` exactly). The full end-to-end workflow (activate -> request
 * deactivation -> apply -> decision-engine deny -> verify-decision revocation) against a real
 * database is covered by tests/integration/cfg1-db.test.ts — a real disposable Postgres is a
 * stronger proof for this kind of multi-table, transaction-shaped logic than a heavily-mocked
 * unit test would be; this file only proves the PURE branching logic in isolation.
 */
import { describe, expect, it } from "vitest";
import {
  activateKillSwitch,
  applyKillSwitchDeactivation,
  computeKillSwitchDeactivationPayloadHash,
  isKillSwitchActiveForFeature,
  requestKillSwitchDeactivation,
} from "../../services/cfg1/src/lib/kill-switch.js";

interface RecordedCall {
  sql: string;
  params: unknown[];
}

function fakeClient(queryResults: Array<{ rows: unknown[] }>) {
  const calls: RecordedCall[] = [];
  let i = 0;
  return {
    calls,
    client: {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        const result = queryResults[i] ?? { rows: [] };
        i += 1;
        // rowCount: 1 by default — @aix/foundation's enqueueOutbox (called transitively via
        // publishAudit, which every lib/kill-switch.ts function calls) checks
        // `result.rowCount !== 1` and fails closed otherwise; every write in these tests is a
        // genuine single-row INSERT/UPDATE, so this is the correct default, not a shortcut.
        return { rowCount: 1, ...result };
      },
    } as never,
  };
}

describe("isKillSwitchActiveForFeature", () => {
  it("returns true when an active row exists", async () => {
    const { client } = fakeClient([{ rows: [{ status: "active" }] }]);
    expect(await isKillSwitchActiveForFeature(client, "otc.rfq.submit")).toBe(true);
  });

  it("returns false when no active row exists", async () => {
    const { client } = fakeClient([{ rows: [] }]);
    expect(await isKillSwitchActiveForFeature(client, "otc.rfq.submit")).toBe(false);
  });
});

describe("computeKillSwitchDeactivationPayloadHash", () => {
  it("is deterministic and sha256:-prefixed", () => {
    const input = { changeId: "ksdr_1", killSwitchId: "ks_1", featureCode: "otc.rfq.submit" };
    const h1 = computeKillSwitchDeactivationPayloadHash(input);
    expect(h1).toBe(computeKillSwitchDeactivationPayloadHash({ ...input }));
    expect(h1.startsWith("sha256:")).toBe(true);
  });

  it("is tamper-sensitive to every bound field", () => {
    const base = { changeId: "ksdr_1", killSwitchId: "ks_1", featureCode: "otc.rfq.submit" };
    const h1 = computeKillSwitchDeactivationPayloadHash(base);
    expect(computeKillSwitchDeactivationPayloadHash({ ...base, changeId: "ksdr_2" })).not.toBe(h1);
    expect(computeKillSwitchDeactivationPayloadHash({ ...base, killSwitchId: "ks_2" })).not.toBe(h1);
    expect(computeKillSwitchDeactivationPayloadHash({ ...base, featureCode: "otc.rfq.cancel" })).not.toBe(h1);
  });
});

describe("activateKillSwitch", () => {
  const baseInput = { featureCode: "otc.rfq.submit", reason: "incident-123", activatedBy: "user_ops_1", requestId: "req_1", correlationId: "corr_1" };

  it("creates a fresh row (version 1) when no prior row exists for the feature_code, and writes the activated event + audit", async () => {
    // advisory lock -> FOR UPDATE lookup (empty) -> INSERT kill_switch -> INSERT kill_switch_event -> publishAudit's outbox INSERT.
    const { calls, client } = fakeClient([{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }]);
    const outcome = await activateKillSwitch(client, baseInput);
    expect(outcome).toMatchObject({ kind: "activated", version: 1 });
    if (outcome.kind === "activated") {
      expect(outcome.killSwitchId.startsWith("ks_")).toBe(true);
    }
    expect(calls[0]!.sql).toMatch(/pg_advisory_xact_lock/);
    expect(calls[2]!.sql).toMatch(/INSERT INTO cfg1\.kill_switch\b/);
    expect(calls[3]!.sql).toMatch(/INSERT INTO cfg1\.kill_switch_event/);
    // event_type is a literal in the SQL text (CHECK-constrained enum), not a bound parameter.
    expect(calls[3]!.sql).toMatch(/'activated'/);
  });

  it("returns already_active without writing anything when an active row already exists", async () => {
    const { calls, client } = fakeClient([{ rows: [] }, { rows: [{ kill_switch_id: "ks_1", feature_code: "otc.rfq.submit", status: "active", activated_by: "user_x", version: 1 }] }]);
    const outcome = await activateKillSwitch(client, baseInput);
    expect(outcome).toEqual({ kind: "already_active" });
    expect(calls).toHaveLength(2); // advisory lock + lookup — no INSERT/UPDATE/audit attempted
  });

  it("reactivates an existing INACTIVE row by UPDATE (not a fresh INSERT), incrementing version", async () => {
    const { calls, client } = fakeClient([
      { rows: [] },
      { rows: [{ kill_switch_id: "ks_1", feature_code: "otc.rfq.submit", status: "inactive", activated_by: "user_prev", version: 3 }] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ]);
    const outcome = await activateKillSwitch(client, baseInput);
    expect(outcome).toMatchObject({ kind: "activated", killSwitchId: "ks_1", version: 4 });
    expect(calls[2]!.sql).toMatch(/UPDATE cfg1\.kill_switch\b/);
    expect(calls[2]!.sql).not.toMatch(/INSERT/);
  });

  it("takes a transaction-scoped advisory lock keyed by feature_code BEFORE the lookup, serializing concurrent first-ever-activation attempts (self-review fix)", async () => {
    const { calls, client } = fakeClient([{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }]);
    await activateKillSwitch(client, baseInput);
    expect(calls[0]!.sql).toMatch(/SELECT pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
    expect(calls[0]!.params).toEqual(["cfg1.kill_switch:otc.rfq.submit"]);
  });
});

describe("requestKillSwitchDeactivation", () => {
  const baseInput = { featureCode: "otc.rfq.submit", changeReason: "resolved", requestedBy: "user_ops_2", requestId: "req_2", correlationId: "corr_2" };

  it("returns not_active when no active kill-switch exists for the feature_code", async () => {
    const { client } = fakeClient([{ rows: [] }]);
    const outcome = await requestKillSwitchDeactivation(client, baseInput);
    expect(outcome).toEqual({ kind: "not_active" });
  });

  it("returns self_deactivation_blocked when requestedBy equals the kill-switch's own activated_by (approved decisions #6/#7)", async () => {
    const { calls, client } = fakeClient([{ rows: [{ kill_switch_id: "ks_1", feature_code: "otc.rfq.submit", status: "active", activated_by: "user_ops_2", version: 1 }] }]);
    const outcome = await requestKillSwitchDeactivation(client, baseInput);
    expect(outcome).toEqual({ kind: "self_deactivation_blocked" });
    expect(calls).toHaveLength(1); // no row written for a blocked self-request
  });

  it("creates a requested row + event + audit when a different actor proposes deactivation", async () => {
    const { calls, client } = fakeClient([
      { rows: [{ kill_switch_id: "ks_1", feature_code: "otc.rfq.submit", status: "active", activated_by: "user_activator", version: 1 }] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ]);
    const outcome = await requestKillSwitchDeactivation(client, baseInput);
    expect(outcome).toMatchObject({ kind: "requested", killSwitchId: "ks_1" });
    if (outcome.kind === "requested") {
      expect(outcome.changeId.startsWith("ksdr_")).toBe(true);
      expect(outcome.payloadHash.startsWith("sha256:")).toBe(true);
    }
    expect(calls[1]!.sql).toMatch(/INSERT INTO cfg1\.kill_switch_deactivation_request/);
    expect(calls[2]!.sql).toMatch(/INSERT INTO cfg1\.kill_switch_event/);
    // event_type is a literal in the SQL text (CHECK-constrained enum), not a bound parameter.
    expect(calls[2]!.sql).toMatch(/'deactivation_requested'/);
  });
});

describe("applyKillSwitchDeactivation", () => {
  const baseInput = { changeId: "ksdr_1", approvalId: "appr_1", decisionTokenHash: "deadbeef", requestedBy: "user_ops_2" };

  it("returns raced when the change row is not (or no longer) 'requested'", async () => {
    const { client } = fakeClient([{ rows: [{ change_id: "ksdr_1", kill_switch_id: "ks_1", feature_code: "otc.rfq.submit", status: "applied" }] }]);
    const outcome = await applyKillSwitchDeactivation(client, baseInput);
    expect(outcome).toEqual({ kind: "raced" });
  });

  it("returns raced when the change row does not exist", async () => {
    const { client } = fakeClient([{ rows: [] }]);
    const outcome = await applyKillSwitchDeactivation(client, baseInput);
    expect(outcome).toEqual({ kind: "raced" });
  });

  it("returns not_active when the kill_switch is no longer active (defensive — should not happen in practice)", async () => {
    const { client } = fakeClient([
      { rows: [{ change_id: "ksdr_1", kill_switch_id: "ks_1", feature_code: "otc.rfq.submit", status: "requested" }] },
      { rows: [{ kill_switch_id: "ks_1", feature_code: "otc.rfq.submit", status: "inactive", activated_by: "user_x", version: 2 }] },
    ]);
    const outcome = await applyKillSwitchDeactivation(client, baseInput);
    expect(outcome).toEqual({ kind: "not_active" });
  });

  it("deactivates cleanly on the normal path: updates kill_switch, updates the request row, writes the event + audit", async () => {
    const { calls, client } = fakeClient([
      { rows: [{ change_id: "ksdr_1", kill_switch_id: "ks_1", feature_code: "otc.rfq.submit", status: "requested" }] },
      { rows: [{ kill_switch_id: "ks_1", feature_code: "otc.rfq.submit", status: "active", activated_by: "user_x", version: 2 }] },
      { rows: [] }, // UPDATE kill_switch
      { rows: [] }, // UPDATE kill_switch_deactivation_request
      { rows: [] }, // INSERT kill_switch_event
      { rows: [] }, // publishAudit outbox INSERT
    ]);
    const outcome = await applyKillSwitchDeactivation(client, baseInput);
    expect(outcome).toMatchObject({ kind: "deactivated", killSwitchId: "ks_1", featureCode: "otc.rfq.submit", newVersion: 3 });
    expect(calls[2]!.sql).toMatch(/UPDATE cfg1\.kill_switch SET status = 'inactive'/);
    expect(calls[3]!.sql).toMatch(/UPDATE cfg1\.kill_switch_deactivation_request\s+SET status = 'applied'/);
    expect(calls[4]!.sql).toMatch(/INSERT INTO cfg1\.kill_switch_event/);
    // event_type is a literal in the SQL text (CHECK-constrained enum), not a bound parameter.
    expect(calls[4]!.sql).toMatch(/'deactivated'/);
    // Only the ALREADY-HASHED token value (computed by the caller, routes/kill-switches.ts,
    // before this function is ever called) is written — this function never sees or handles a
    // raw token at all.
    expect(calls[3]!.params).toContain("deadbeef");
  });
});
