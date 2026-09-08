/**
 * Unit tests for SEC-01's IAM-02 permission-guard HTTP client
 * (services/sec1/src/lib/iam2-client.ts). No DB, no live IAM-02 service required — the
 * `fetchImpl` dependency-injection seam is stubbed, mirroring the exact pattern
 * tests/integration/iam2-db.test.ts already uses for the equivalent IAM-02 -> IAM-01 client
 * (`makeFakeIam01Fetch`).
 */
import { describe, expect, it } from "vitest";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../../services/sec1/src/lib/iam2-client.js";

interface FakeCall {
  url: string;
  init: { method?: string; headers?: Record<string, string>; body?: string };
}

function makeFakeIam2Fetch(
  respond: (call: FakeCall) => { ok: boolean; body?: unknown } | Promise<{ ok: boolean; body?: unknown }>,
): { fetchImpl: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const fetchImpl = (async (url: unknown, init?: unknown) => {
    const call: FakeCall = { url: String(url), init: (init ?? {}) as FakeCall["init"] };
    calls.push(call);
    const result = await respond(call);
    return { ok: result.ok, json: async () => result.body ?? {} } as Response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const baseConfig: Omit<Iam2ClientConfig, "fetchImpl"> = {
  baseUrl: "http://127.0.0.1:0",
  internalServiceToken: "test-token",
};

describe("checkPermission — allow path", () => {
  it("returns allowed:true and calls the real endpoint with the internal-service-token header", async () => {
    const { fetchImpl, calls } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "allow", reason: "permission_granted" } },
    }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "user_1", action: "sec1.audit_event.search", resource: "audit_event" },
    );
    expect(result).toEqual({ allowed: true, reason: "permission_granted" });
    expect(calls[0]!.url).toBe("http://127.0.0.1:0/internal/iam2/permission/check");
    expect(calls[0]!.init.headers?.["x-internal-service-token"]).toBe("test-token");
    const body = JSON.parse(calls[0]!.init.body ?? "{}");
    expect(body).toEqual({ actor_id: "user_1", action: "sec1.audit_event.search", resource: "audit_event" });
  });

  it("forwards optional session_id/entity_id/client_id only when supplied", async () => {
    const { fetchImpl, calls } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "allow", reason: "permission_granted" } },
    }));
    await checkPermission(
      { ...baseConfig, fetchImpl },
      {
        actorId: "user_1",
        sessionId: "session_1",
        action: "sec1.audit_event.read",
        resource: "audit_event",
        entityId: "audit_1",
        clientId: "client_1",
      },
    );
    const body = JSON.parse(calls[0]!.init.body ?? "{}");
    expect(body).toEqual({
      actor_id: "user_1",
      session_id: "session_1",
      action: "sec1.audit_event.read",
      resource: "audit_event",
      entity_id: "audit_1",
      client_id: "client_1",
    });
  });
});

describe("checkPermission — fail-closed paths (ALL must resolve allowed:false)", () => {
  it("fails closed on an explicit deny decision", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "deny", reason: "IAM2_PERMISSION_DENIED" } },
    }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "user_1", action: "sec1.audit_event.search", resource: "audit_event" },
    );
    expect(result).toEqual({ allowed: false, reason: "IAM2_PERMISSION_DENIED" });
  });

  it("fails closed on step_up_required (never treated as a grant)", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "step_up_required", reason: "IAM2_STEP_UP_REQUIRED" } },
    }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "user_1", action: "sec1.audit_event.read_sensitive", resource: "audit_event" },
    );
    expect(result.allowed).toBe(false);
  });

  it("fails closed on licence_locked", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "licence_locked", reason: "IAM2_LICENCE_LOCKED_PERMISSION" } },
    }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "user_1", action: "sec1.audit_event.search", resource: "audit_event" },
    );
    expect(result.allowed).toBe(false);
  });

  it("fails closed on IAM2_PERMISSION_UNKNOWN (catalogue gap), reason surfaced verbatim", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "deny", reason: "IAM2_PERMISSION_UNKNOWN" } },
    }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "user_1", action: "sec1.audit_event.search", resource: "audit_event" },
    );
    expect(result).toEqual({ allowed: false, reason: "IAM2_PERMISSION_UNKNOWN" });
  });

  it("fails closed on a non-2xx HTTP response", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: false }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "user_1", action: "sec1.audit_event.search", resource: "audit_event" },
    );
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed on a malformed/unexpected response body (missing data.decision)", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: true, body: { success: true } }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "user_1", action: "sec1.audit_event.search", resource: "audit_event" },
    );
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed on success:false", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: true, body: { success: false } }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "user_1", action: "sec1.audit_event.search", resource: "audit_event" },
    );
    expect(result.allowed).toBe(false);
  });

  it("fails closed on a network error (fetch throws)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "user_1", action: "sec1.audit_event.search", resource: "audit_event" },
    );
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed when res.json() itself throws (malformed JSON)", async () => {
    const fetchImpl = (async () => ({ ok: true, json: async () => { throw new Error("bad json"); } })) as unknown as typeof fetch;
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "user_1", action: "sec1.audit_event.search", resource: "audit_event" },
    );
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed on a timeout-shaped error (AbortError)", async () => {
    const fetchImpl = (async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    }) as typeof fetch;
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "user_1", action: "sec1.audit_event.search", resource: "audit_event" },
    );
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });
});

// =================================================================================================
// Phase 5 — verifyDecisionToken (SEC-01's client for IAM-02's execute-verify, the Critical-
// alert-closure approval binding). Same fail-closed discipline as checkPermission, but IAM-02's
// execute-verify route THROWS (non-2xx) on any failure rather than returning 200 with a decision
// field — this client must treat that shape correctly too.
// =================================================================================================
describe("verifyDecisionToken — allow path", () => {
  it("returns authorised:true and calls the real endpoint with every binding field", async () => {
    const { fetchImpl, calls } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { execution_authorised: true, verified_payload_hash: true, verified_cache_version: true, verified_session: false } },
    }));
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      {
        decisionToken: "tok_abc",
        approvalId: "appr_1",
        actorId: "user_1",
        action: "sec1.security_alert.close",
        resource: "security_alert",
        entityId: "alert_1",
        currentPayloadHash: "sha256:deadbeef",
      },
    );
    expect(result).toEqual({ authorised: true });
    expect(calls[0]!.url).toBe("http://127.0.0.1:0/internal/iam2/permission/execute-verify");
    const body = JSON.parse(calls[0]!.init.body ?? "{}");
    expect(body).toEqual({
      decision_token: "tok_abc",
      approval_id: "appr_1",
      actor_id: "user_1",
      action: "sec1.security_alert.close",
      resource: "security_alert",
      entity_id: "alert_1",
      current_payload_hash: "sha256:deadbeef",
    });
  });
});

describe("verifyDecisionToken — fail-closed paths (ALL must resolve authorised:false)", () => {
  it("fails closed when IAM-02 throws IAM2_DECISION_TOKEN_INVALID (non-2xx)", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: false,
      body: { success: false, error: { code: "IAM2_DECISION_TOKEN_INVALID" } },
    }));
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      { decisionToken: "bad", actorId: "user_1", action: "sec1.security_alert.close", resource: "security_alert" },
    );
    expect(result).toEqual({ authorised: false, reason: "IAM2_DECISION_TOKEN_INVALID" });
  });

  it("fails closed on IAM2_PAYLOAD_HASH_MISMATCH", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: false,
      body: { error: { code: "IAM2_PAYLOAD_HASH_MISMATCH" } },
    }));
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      { decisionToken: "tok", actorId: "user_1", action: "sec1.security_alert.close", resource: "security_alert" },
    );
    expect(result).toEqual({ authorised: false, reason: "IAM2_PAYLOAD_HASH_MISMATCH" });
  });

  it("fails closed on IAM2_DECISION_TOKEN_STALE", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: false,
      body: { error: { code: "IAM2_DECISION_TOKEN_STALE" } },
    }));
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      { decisionToken: "tok", actorId: "user_1", action: "sec1.security_alert.close", resource: "security_alert" },
    );
    expect(result).toEqual({ authorised: false, reason: "IAM2_DECISION_TOKEN_STALE" });
  });

  it("falls back to the generic sentinel when the non-2xx error body is unparseable", async () => {
    const fetchImpl = (async () => ({ ok: false, json: async () => { throw new Error("bad json"); } })) as unknown as typeof fetch;
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      { decisionToken: "tok", actorId: "user_1", action: "sec1.security_alert.close", resource: "security_alert" },
    );
    expect(result).toEqual({ authorised: false, reason: "iam2_unavailable" });
  });

  it("fails closed when a 200 response has execution_authorised !== true (malformed)", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: true, body: { success: true, data: {} } }));
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      { decisionToken: "tok", actorId: "user_1", action: "sec1.security_alert.close", resource: "security_alert" },
    );
    expect(result).toEqual({ authorised: false, reason: "iam2_unavailable" });
  });

  it("fails closed on a network error (fetch throws)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      { decisionToken: "tok", actorId: "user_1", action: "sec1.security_alert.close", resource: "security_alert" },
    );
    expect(result).toEqual({ authorised: false, reason: "iam2_unavailable" });
  });
});
