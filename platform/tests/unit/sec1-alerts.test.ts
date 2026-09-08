/**
 * Unit tests for SEC-01 Phase 5 alert lifecycle transition validation and cursor encode/decode
 * (services/sec1/src/lib/alerts.ts). No DB required — a fake `PoolClient` returns a canned
 * alert row for every `FOR UPDATE` lookup, so these tests isolate the STATE-MACHINE validation
 * (06_State_Machine.md §2) from real persistence, which is covered at the integration level.
 */
import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { AppError } from "@aix/foundation";
import {
  assignAlert,
  closeAlert,
  triageAlert,
  decodeAlertCursor,
  encodeAlertCursor,
  type AlertStatus,
} from "../../services/sec1/src/lib/alerts.js";
import { Sec1Error } from "../../services/sec1/src/lib/errors.js";

function fakeAlertClient(status: AlertStatus | null): PoolClient {
  const row = status
    ? {
        alert_id: "alert_1",
        rule_id: "rule_1",
        severity: "high",
        status,
        title: "Test alert",
        description: null,
        actor_user_id: "user_1",
        client_id: null,
        entity_type: null,
        entity_id: null,
        linked_audit_events: [],
        assigned_to: null,
        created_at_utc: new Date(),
        due_at_utc: null,
        closed_at_utc: null,
        closure_reason: null,
        closure_evidence_ref: null,
      }
    : null;
  return {
    query: async (sql: string) => {
      if (sql.includes("FOR UPDATE")) {
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      // UPDATE/INSERT statements — no-op success, the "after" lockAlertForUpdate re-read
      // returns the SAME canned row (transition correctness is what's under test here, not
      // the exact post-write field values, which the integration suite covers against a real
      // DB).
      return { rows: [], rowCount: 1 };
    },
  } as unknown as PoolClient;
}

describe("assignAlert — valid/invalid transitions", () => {
  it("allows assignment from 'open'", async () => {
    const client = fakeAlertClient("open");
    await expect(assignAlert(client, { alertId: "alert_1", assignedTo: "user_2" })).resolves.toBeDefined();
  });

  it("allows re-assignment from 'assigned'", async () => {
    const client = fakeAlertClient("assigned");
    await expect(assignAlert(client, { alertId: "alert_1", assignedTo: "user_2" })).resolves.toBeDefined();
  });

  it("rejects assignment from 'triaged' with SEC1_ALERT_INVALID_TRANSITION", async () => {
    const client = fakeAlertClient("triaged");
    await expect(assignAlert(client, { alertId: "alert_1", assignedTo: "user_2" })).rejects.toMatchObject({
      code: "SEC1_ALERT_INVALID_TRANSITION",
    });
  });

  it("rejects assignment from 'closed'", async () => {
    const client = fakeAlertClient("closed");
    await expect(assignAlert(client, { alertId: "alert_1", assignedTo: "user_2" })).rejects.toBeInstanceOf(Sec1Error);
  });

  it("throws NOT_FOUND when the alert does not exist", async () => {
    const client = fakeAlertClient(null);
    await expect(assignAlert(client, { alertId: "missing", assignedTo: "user_2" })).rejects.toBeInstanceOf(AppError);
  });
});

describe("triageAlert — valid/invalid transitions", () => {
  it("allows triage from 'assigned'", async () => {
    const client = fakeAlertClient("assigned");
    await expect(
      triageAlert(client, { alertId: "alert_1", reviewerUserId: "user_2", triageStatus: "true_positive" }),
    ).resolves.toBeDefined();
  });

  it("allows re-triage from 'triaged'", async () => {
    const client = fakeAlertClient("triaged");
    await expect(
      triageAlert(client, { alertId: "alert_1", reviewerUserId: "user_2", triageStatus: "duplicate" }),
    ).resolves.toBeDefined();
  });

  it("rejects triage from 'open' (must be assigned first)", async () => {
    const client = fakeAlertClient("open");
    await expect(
      triageAlert(client, { alertId: "alert_1", reviewerUserId: "user_2", triageStatus: "true_positive" }),
    ).rejects.toMatchObject({ code: "SEC1_ALERT_INVALID_TRANSITION" });
  });

  it("rejects triage from 'escalated'", async () => {
    const client = fakeAlertClient("escalated");
    await expect(
      triageAlert(client, { alertId: "alert_1", reviewerUserId: "user_2", triageStatus: "true_positive" }),
    ).rejects.toMatchObject({ code: "SEC1_ALERT_INVALID_TRANSITION" });
  });
});

describe("closeAlert — valid/invalid transitions", () => {
  it("allows close from 'triaged'", async () => {
    const client = fakeAlertClient("triaged");
    await expect(
      closeAlert(client, { alertId: "alert_1", closureReason: "reviewed", closureEvidenceRef: "evidence_1" }),
    ).resolves.toBeDefined();
  });

  it("rejects close from 'open'", async () => {
    const client = fakeAlertClient("open");
    await expect(
      closeAlert(client, { alertId: "alert_1", closureReason: "reviewed", closureEvidenceRef: "evidence_1" }),
    ).rejects.toMatchObject({ code: "SEC1_ALERT_INVALID_TRANSITION" });
  });

  it("rejects close from 'assigned'", async () => {
    const client = fakeAlertClient("assigned");
    await expect(
      closeAlert(client, { alertId: "alert_1", closureReason: "reviewed", closureEvidenceRef: "evidence_1" }),
    ).rejects.toMatchObject({ code: "SEC1_ALERT_INVALID_TRANSITION" });
  });

  it("rejects close from 'escalated' (no forward transition exists this phase — INC-01 does not exist)", async () => {
    const client = fakeAlertClient("escalated");
    await expect(
      closeAlert(client, { alertId: "alert_1", closureReason: "reviewed", closureEvidenceRef: "evidence_1" }),
    ).rejects.toMatchObject({ code: "SEC1_ALERT_INVALID_TRANSITION" });
  });

  it("rejects close from 'closed' (already closed)", async () => {
    const client = fakeAlertClient("closed");
    await expect(
      closeAlert(client, { alertId: "alert_1", closureReason: "reviewed", closureEvidenceRef: "evidence_1" }),
    ).rejects.toMatchObject({ code: "SEC1_ALERT_INVALID_TRANSITION" });
  });
});

describe("alert search cursor encode/decode", () => {
  it("round-trips a cursor losslessly", () => {
    const cursor = { created_at_utc: "2026-01-01T00:00:00.123456Z", alert_id: "alert_1" };
    expect(decodeAlertCursor(encodeAlertCursor(cursor))).toEqual(cursor);
  });

  it("returns undefined for an undefined input (no cursor supplied)", () => {
    expect(decodeAlertCursor(undefined)).toBeUndefined();
  });

  it("rejects a malformed (non-base64url-JSON) cursor", () => {
    expect(() => decodeAlertCursor("not-a-real-cursor!!!")).toThrow();
  });

  it("rejects a structurally-invalid decoded cursor (missing fields)", () => {
    const bogus = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8").toString("base64url");
    expect(() => decodeAlertCursor(bogus)).toThrow();
  });
});
