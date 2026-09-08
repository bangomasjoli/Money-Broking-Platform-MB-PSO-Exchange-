/**
 * Unit tests for CFG-01's IAM-02 permission/approval-guard HTTP client
 * (services/cfg1/src/lib/iam2-client.ts). No DB, no live IAM-02 service required — the
 * `fetchImpl` dependency-injection seam is stubbed, mirroring
 * tests/unit/sec1-iam2-client.test.ts's own identical structure (same dependency shape, CFG-01's
 * own fresh copy per F3(c) — not imported from services/sec1).
 */
import { describe, expect, it } from "vitest";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../../services/cfg1/src/lib/iam2-client.js";

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
      { actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" },
    );
    expect(result).toEqual({ allowed: true, reason: "permission_granted" });
    expect(calls[0]!.url).toBe("http://127.0.0.1:0/internal/iam2/permission/check");
    expect(calls[0]!.init.headers?.["x-internal-service-token"]).toBe("test-token");
    const body = JSON.parse(calls[0]!.init.body ?? "{}");
    expect(body).toEqual({ actor_id: "user_1", action: "cfg1.feature.enable", resource: "feature" });
  });

  it("forwards optional session_id/entity_id/client_id only when supplied", async () => {
    const { fetchImpl, calls } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "allow", reason: "permission_granted" } },
    }));
    await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "user_1", sessionId: "session_1", action: "cfg1.feature.enable", resource: "feature", entityId: "feature.x", clientId: "client_1" },
    );
    const body = JSON.parse(calls[0]!.init.body ?? "{}");
    expect(body).toEqual({
      actor_id: "user_1",
      session_id: "session_1",
      action: "cfg1.feature.enable",
      resource: "feature",
      entity_id: "feature.x",
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
    const result = await checkPermission({ ...baseConfig, fetchImpl }, { actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" });
    expect(result).toEqual({ allowed: false, reason: "IAM2_PERMISSION_DENIED" });
  });

  it("fails closed on a non-2xx HTTP response", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: false }));
    const result = await checkPermission({ ...baseConfig, fetchImpl }, { actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" });
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed on a malformed/unexpected response body (missing data.decision)", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: true, body: { success: true } }));
    const result = await checkPermission({ ...baseConfig, fetchImpl }, { actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" });
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed on success:false", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: true, body: { success: false } }));
    const result = await checkPermission({ ...baseConfig, fetchImpl }, { actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" });
    expect(result.allowed).toBe(false);
  });

  it("fails closed on a network error (fetch throws)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const result = await checkPermission({ ...baseConfig, fetchImpl }, { actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" });
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed when res.json() itself throws (malformed JSON)", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => {
        throw new Error("bad json");
      },
    })) as unknown as typeof fetch;
    const result = await checkPermission({ ...baseConfig, fetchImpl }, { actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" });
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed on licence_locked (a genuine, real business-capability lock, unlike approval_required/step_up_required below)", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "licence_locked", reason: "IAM2_LICENCE_LOCKED_PERMISSION" } },
    }));
    const result = await checkPermission({ ...baseConfig, fetchImpl }, { actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" });
    expect(result).toEqual({ allowed: false, reason: "IAM2_LICENCE_LOCKED_PERMISSION" });
  });
});

// =================================================================================================
// checkPermission — approval_required/step_up_required PASS the baseline check (second finding
// closed alongside F-1's licence_locked fix, independent Opus Phase 3A re-review). All 6 sensitive
// CFG-01 mutation permissions carry requires_approval=true (and .activate additionally carries
// requires_step_up=true), so the REAL IAM-02 guard returns one of these two decisions
// UNCONDITIONALLY for these actions — never "allow" — regardless of role grants (empirically
// confirmed against the real guard, not a stub, during this fix). Treating them as denials would
// make the baseline check permanently unsatisfiable for every apply route; the real gate is the
// separate, mandatory execute-verify call, not this one. See this file's own header comment.
// =================================================================================================
describe("checkPermission — approval_required / step_up_required PASS the baseline (they are not denials)", () => {
  it("treats approval_required as allowed:true (the real gate is execute-verify, not this call)", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "approval_required", reason: "IAM2_APPROVAL_REQUIRED" } },
    }));
    const result = await checkPermission({ ...baseConfig, fetchImpl }, { actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" });
    expect(result).toEqual({ allowed: true, reason: "IAM2_APPROVAL_REQUIRED" });
  });

  it("treats step_up_required as allowed:true (cfg1.licence_profile.activate's shape — requires_step_up fires before requires_approval in IAM-02's own precedence chain)", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "step_up_required", reason: "IAM2_STEP_UP_REQUIRED" } },
    }));
    const result = await checkPermission({ ...baseConfig, fetchImpl }, { actorId: "user_1", action: "cfg1.licence_profile.activate", resource: "licence_profile" });
    expect(result).toEqual({ allowed: true, reason: "IAM2_STEP_UP_REQUIRED" });
  });
});

// =================================================================================================
// verifyDecisionToken — CFG-01's client for IAM-02's execute-verify, the approved-mutation-apply
// binding (approved decision #1). Same fail-closed discipline as checkPermission, but IAM-02's
// execute-verify route THROWS (non-2xx) on any failure rather than returning 200 with a decision
// field — this client must treat that shape correctly too.
// =================================================================================================
describe("verifyDecisionToken — allow path", () => {
  it("returns authorised:true and calls the real endpoint with every binding field, actorId bound to the ORIGINAL REQUESTER", async () => {
    const { fetchImpl, calls } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { execution_authorised: true } },
    }));
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      {
        decisionToken: "tok_abc",
        approvalId: "appr_1",
        actorId: "user_maker_1",
        action: "cfg1.feature.enable",
        resource: "feature",
        entityId: "otc.rfq.submit",
        currentPayloadHash: "sha256:deadbeef",
      },
    );
    expect(result).toEqual({ authorised: true });
    expect(calls[0]!.url).toBe("http://127.0.0.1:0/internal/iam2/permission/execute-verify");
    const body = JSON.parse(calls[0]!.init.body ?? "{}");
    expect(body).toEqual({
      decision_token: "tok_abc",
      approval_id: "appr_1",
      actor_id: "user_maker_1",
      action: "cfg1.feature.enable",
      resource: "feature",
      entity_id: "otc.rfq.submit",
      current_payload_hash: "sha256:deadbeef",
    });
  });
});

describe("verifyDecisionToken — fail-closed paths (ALL must resolve authorised:false)", () => {
  it("fails closed when IAM-02 throws IAM2_DECISION_TOKEN_INVALID (non-2xx)", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: false, body: { success: false, error: { code: "IAM2_DECISION_TOKEN_INVALID" } } }));
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      { decisionToken: "bad", actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" },
    );
    expect(result).toEqual({ authorised: false, reason: "IAM2_DECISION_TOKEN_INVALID" });
  });

  it("fails closed on IAM2_PAYLOAD_HASH_MISMATCH", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: false, body: { error: { code: "IAM2_PAYLOAD_HASH_MISMATCH" } } }));
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      { decisionToken: "tok", actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" },
    );
    expect(result).toEqual({ authorised: false, reason: "IAM2_PAYLOAD_HASH_MISMATCH" });
  });

  it("falls back to the generic sentinel when the non-2xx error body is unparseable", async () => {
    const fetchImpl = (async () => ({
      ok: false,
      json: async () => {
        throw new Error("bad json");
      },
    })) as unknown as typeof fetch;
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      { decisionToken: "tok", actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" },
    );
    expect(result).toEqual({ authorised: false, reason: "iam2_unavailable" });
  });

  it("fails closed when a 200 response has execution_authorised !== true (malformed)", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: true, body: { success: true, data: {} } }));
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      { decisionToken: "tok", actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" },
    );
    expect(result).toEqual({ authorised: false, reason: "iam2_unavailable" });
  });

  it("fails closed on a network error (fetch throws)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const result = await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      { decisionToken: "tok", actorId: "user_1", action: "cfg1.feature.enable", resource: "feature" },
    );
    expect(result).toEqual({ authorised: false, reason: "iam2_unavailable" });
  });
});
