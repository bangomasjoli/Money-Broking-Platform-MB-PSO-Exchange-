/**
 * @aix/foundation `publishAudit`/`buildAuditEnvelope` unit tests (no DB — a fake in-memory
 * PoolClient captures the `foundation.outbox_event` INSERT params, mirroring
 * tests/unit/iam2-decision-token.test.ts's fake-client pattern).
 *
 * Covers the SEC-01 Phase 2 extension to packages/foundation/src/audit.ts: `source_module` is
 * now required, and the enhanced outbox payload (`payload_ref`) carries every
 * AuditEvent/AuditEnvelope field — including the new SEC-01-compatible optional fields — so a
 * future SEC-01 outbox consumer has full fidelity from the outbox row alone.
 */
import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { createRequestContext, publishAudit, runWithContext } from "@aix/foundation";

class FakeOutboxClient {
  inserted: { params: unknown[] } | undefined;

  async query(text: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
    if (text.includes("INSERT INTO foundation.outbox_event")) {
      this.inserted = { params };
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
}

function withContext<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = createRequestContext({ actorType: "service" });
  return runWithContext(ctx, fn);
}

describe("publishAudit — FND audit publisher produces the SEC-01-enhanced outbox payload", () => {
  it("includes source_module and every new optional field in payload_ref when supplied", async () => {
    const client = new FakeOutboxClient();
    await withContext(() =>
      publishAudit(client as unknown as PoolClient, {
        event_type: "iam2.permission_decision_allow",
        source_module: "IAM-02",
        actor_id: "user_1",
        actor_type: "user",
        entity_type: "role",
        entity_id: "role_1",
        severity: "medium",
        event_category: "permission",
        action: "permission.check",
        result: "success",
        session_id: "sess_1",
        client_id: "client_1",
        source_emission_sequence: 42,
        reason_code: "permission_granted",
        metadata: { role_code: "security_admin" },
      }),
    );

    expect(client.inserted).toBeDefined();
    const payloadRefJson = client.inserted!.params[3] as string;
    const payload = JSON.parse(payloadRefJson);

    expect(payload.source_module).toBe("IAM-02");
    expect(payload.entity_type).toBe("role");
    expect(payload.entity_id).toBe("role_1");
    expect(payload.actor_id).toBe("user_1");
    expect(payload.actor_type).toBe("user");
    expect(payload.severity).toBe("medium");
    expect(payload.event_category).toBe("permission");
    expect(payload.action).toBe("permission.check");
    expect(payload.result).toBe("success");
    expect(payload.session_id).toBe("sess_1");
    expect(payload.client_id).toBe("client_1");
    expect(payload.source_emission_sequence).toBe(42);
    expect(payload.reason_code).toBe("permission_granted");
    expect(payload.metadata).toEqual({ role_code: "security_admin" });
    expect(typeof payload.occurred_at_utc).toBe("string");
    expect(typeof payload.correlation_id).toBe("string");
  });

  it("omits optional fields the caller didn't supply rather than serializing them as null", async () => {
    const client = new FakeOutboxClient();
    await withContext(() =>
      publishAudit(client as unknown as PoolClient, {
        event_type: "foundation.job.enqueued",
        source_module: "FND-01",
        actor_id: "svc_1",
        actor_type: "service",
        entity_type: "job_queue_message",
        entity_id: "job_1",
      }),
    );

    const payload = JSON.parse(client.inserted!.params[3] as string);
    expect(payload.source_module).toBe("FND-01");
    expect("severity" in payload).toBe(false);
    expect("event_category" in payload).toBe(false);
    expect("action" in payload).toBe(false);
    expect("result" in payload).toBe(false);
    expect("session_id" in payload).toBe(false);
    expect("client_id" in payload).toBe(false);
    expect("source_emission_sequence" in payload).toBe(false);
    expect("reason_code" in payload).toBe(false);
  });
});
