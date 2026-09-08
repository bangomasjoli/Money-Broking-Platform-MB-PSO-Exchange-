/**
 * Unit tests for KYC-01's IAM-02 permission-guard + execute-verify HTTP client
 * (services/kyc1/src/lib/iam2-client.ts). No DB, no live IAM-02 service required — the
 * `fetchImpl` dependency-injection seam is stubbed, mirroring tests/unit/aml1-iam2-client.test.ts's
 * own `checkPermission`/`verifyDecisionToken` coverage shape (KYC-01's own fresh copy per F3(c) —
 * not imported from services/aml1). Phase 3B adds `verifyDecisionToken` — the outcome-override
 * apply route (`routes/outcome-override.ts`) is its only caller.
 */
import { describe, expect, it } from "vitest";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../../services/kyc1/src/lib/iam2-client.js";

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
      { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" },
    );
    expect(result).toEqual({ allowed: true, reason: "permission_granted" });
    expect(calls[0]!.url).toBe("http://127.0.0.1:0/internal/iam2/permission/check");
    expect(calls[0]!.init.headers?.["x-internal-service-token"]).toBe("test-token");
    const body = JSON.parse(calls[0]!.init.body ?? "{}");
    expect(body).toEqual({ actor_id: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" });
  });

  it("forwards optional session_id/entity_id/client_id only when supplied", async () => {
    const { fetchImpl, calls } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "allow", reason: "permission_granted" } },
    }));
    await checkPermission(
      { ...baseConfig, fetchImpl },
      {
        actorId: "staff_1",
        sessionId: "session_1",
        action: "kyc1.evidence.sensitive_read",
        resource: "document_checklist_item",
        entityId: "kyc1item_1",
        clientId: "clt1client_1",
      },
    );
    const body = JSON.parse(calls[0]!.init.body ?? "{}");
    expect(body).toEqual({
      actor_id: "staff_1",
      session_id: "session_1",
      action: "kyc1.evidence.sensitive_read",
      resource: "document_checklist_item",
      entity_id: "kyc1item_1",
      client_id: "clt1client_1",
    });
  });

  it("never includes the token in the request BODY (only in the header)", async () => {
    const { fetchImpl, calls } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "allow", reason: "permission_granted" } },
    }));
    await checkPermission({ ...baseConfig, fetchImpl }, { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" });
    expect(calls[0]!.init.body ?? "").not.toContain("test-token");
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
      { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" },
    );
    expect(result).toEqual({ allowed: false, reason: "IAM2_PERMISSION_DENIED" });
  });

  it("fails closed on licence_locked", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "licence_locked", reason: "IAM2_LICENCE_LOCKED_PERMISSION" } },
    }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" },
    );
    expect(result).toEqual({ allowed: false, reason: "IAM2_LICENCE_LOCKED_PERMISSION" });
  });

  it("fails closed on a non-2xx HTTP response", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: false }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" },
    );
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed on a malformed/unexpected response body (missing data.decision)", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: true, body: { success: true } }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" },
    );
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed on success:false", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: true, body: { success: false } }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" },
    );
    expect(result.allowed).toBe(false);
  });

  it("fails closed when decision is present but success is missing/false-ish", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: true, body: { data: { decision: "allow" } } }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" },
    );
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed on a network error (fetch throws)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" },
    );
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed when res.json() itself throws (malformed JSON)", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => {
        throw new Error("bad json");
      },
    })) as unknown as typeof fetch;
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" },
    );
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });

  it("fails closed on a request timeout (AbortSignal.timeout firing surfaces as a thrown error, caught by the generic catch)", async () => {
    const fetchImpl = (async () => {
      const err = new Error("The operation was aborted");
      err.name = "TimeoutError";
      throw err;
    }) as typeof fetch;
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" },
    );
    expect(result).toEqual({ allowed: false, reason: "iam2_unavailable" });
  });
});

// =================================================================================================
// checkPermission — approval_required/step_up_required PASS the baseline check. `kyc1.outcome.
// override` (migration 046) carries `requires_approval=true`, exercising this for real — the exact
// CFG-01 Phase 3A F-1 lesson, defended against since Phase 3A's own forward-looking coverage. See
// lib/iam2-client.ts's own header comment.
// =================================================================================================
describe("checkPermission — approval_required/step_up_required PASS the baseline (neither is a denial)", () => {
  it("treats approval_required as allowed:true", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "approval_required", reason: "IAM2_APPROVAL_REQUIRED" } },
    }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" },
    );
    expect(result).toEqual({ allowed: true, reason: "IAM2_APPROVAL_REQUIRED" });
  });

  it("treats step_up_required as allowed:true", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({
      ok: true,
      body: { success: true, data: { decision: "step_up_required", reason: "IAM2_STEP_UP_REQUIRED" } },
    }));
    const result = await checkPermission(
      { ...baseConfig, fetchImpl },
      { actorId: "staff_1", action: "kyc1.evidence.sensitive_read", resource: "document_checklist_item" },
    );
    expect(result).toEqual({ allowed: true, reason: "IAM2_STEP_UP_REQUIRED" });
  });
});

// =================================================================================================
// verifyDecisionToken (Phase 3B) — KYC-01's client for IAM-02's execute-verify, used only by
// routes/outcome-override.ts's apply route. Same fail-closed discipline as checkPermission, but
// IAM-02's execute-verify route THROWS (non-2xx) on any failure rather than returning 200 with a
// decision field — this client must treat that shape correctly too. Mirrors tests/unit/
// aml1-iam2-client.test.ts's own verifyDecisionToken coverage shape exactly.
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
        actorId: "requester_1",
        action: "kyc1.outcome.override",
        resource: "cdd_outcome",
        entityId: "kyc1case_1",
        currentPayloadHash: "sha256:deadbeef",
      },
    );
    expect(result).toEqual({ authorised: true });
    expect(calls[0]!.url).toBe("http://127.0.0.1:0/internal/iam2/permission/execute-verify");
    const body = JSON.parse(calls[0]!.init.body ?? "{}");
    expect(body).toEqual({
      decision_token: "tok_abc",
      approval_id: "appr_1",
      actor_id: "requester_1",
      action: "kyc1.outcome.override",
      resource: "cdd_outcome",
      entity_id: "kyc1case_1",
      current_payload_hash: "sha256:deadbeef",
    });
  });

  it("never includes the raw decision token in any header — only in the body, which is never logged (lib/iam2-client.ts's own no-raw-body-logging discipline)", async () => {
    const { fetchImpl, calls } = makeFakeIam2Fetch(() => ({ ok: true, body: { success: true, data: { execution_authorised: true } } }));
    await verifyDecisionToken(
      { ...baseConfig, fetchImpl },
      { decisionToken: "super-secret-token", actorId: "requester_1", action: "kyc1.outcome.override", resource: "cdd_outcome" },
    );
    expect(Object.values(calls[0]!.init.headers ?? {})).not.toContain("super-secret-token");
  });
});

describe("verifyDecisionToken — fail-closed paths (ALL must resolve authorised:false, mapped by the caller to KYC1_APPROVAL_REQUIRED — except the unavailable sentinel, mapped to KYC1_IAM2_UNAVAILABLE)", () => {
  it("fails closed when IAM-02 throws IAM2_DECISION_TOKEN_INVALID (non-2xx) — absent/invalid token", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: false, body: { success: false, error: { code: "IAM2_DECISION_TOKEN_INVALID" } } }));
    const result = await verifyDecisionToken({ ...baseConfig, fetchImpl }, { decisionToken: "bad", actorId: "requester_1", action: "kyc1.outcome.override", resource: "cdd_outcome" });
    expect(result).toEqual({ authorised: false, reason: "IAM2_DECISION_TOKEN_INVALID" });
  });

  it("fails closed on IAM2_DECISION_TOKEN_STALE — expired token", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: false, body: { success: false, error: { code: "IAM2_DECISION_TOKEN_STALE" } } }));
    const result = await verifyDecisionToken({ ...baseConfig, fetchImpl }, { decisionToken: "expired", actorId: "requester_1", action: "kyc1.outcome.override", resource: "cdd_outcome" });
    expect(result).toEqual({ authorised: false, reason: "IAM2_DECISION_TOKEN_STALE" });
  });

  it("fails closed on IAM2_DECISION_TOKEN_ALREADY_USED — replayed token", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: false, body: { success: false, error: { code: "IAM2_DECISION_TOKEN_ALREADY_USED" } } }));
    const result = await verifyDecisionToken({ ...baseConfig, fetchImpl }, { decisionToken: "replayed", actorId: "requester_1", action: "kyc1.outcome.override", resource: "cdd_outcome" });
    expect(result).toEqual({ authorised: false, reason: "IAM2_DECISION_TOKEN_ALREADY_USED" });
  });

  it("fails closed on IAM2_PAYLOAD_HASH_MISMATCH", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: false, body: { error: { code: "IAM2_PAYLOAD_HASH_MISMATCH" } } }));
    const result = await verifyDecisionToken({ ...baseConfig, fetchImpl }, { decisionToken: "tok", actorId: "requester_1", action: "kyc1.outcome.override", resource: "cdd_outcome" });
    expect(result).toEqual({ authorised: false, reason: "IAM2_PAYLOAD_HASH_MISMATCH" });
  });

  it("fails closed on IAM2_APPROVER_MISMATCH — approval/requester mismatch", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: false, body: { error: { code: "IAM2_APPROVER_MISMATCH" } } }));
    const result = await verifyDecisionToken({ ...baseConfig, fetchImpl }, { decisionToken: "tok", actorId: "requester_1", action: "kyc1.outcome.override", resource: "cdd_outcome" });
    expect(result).toEqual({ authorised: false, reason: "IAM2_APPROVER_MISMATCH" });
  });

  it("falls back to the generic sentinel when the non-2xx error body is unparseable", async () => {
    const fetchImpl = (async () => ({
      ok: false,
      json: async () => {
        throw new Error("bad json");
      },
    })) as unknown as typeof fetch;
    const result = await verifyDecisionToken({ ...baseConfig, fetchImpl }, { decisionToken: "tok", actorId: "requester_1", action: "kyc1.outcome.override", resource: "cdd_outcome" });
    expect(result).toEqual({ authorised: false, reason: "iam2_unavailable" });
  });

  it("fails closed when a 200 response has execution_authorised !== true (malformed)", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: true, body: { success: true, data: {} } }));
    const result = await verifyDecisionToken({ ...baseConfig, fetchImpl }, { decisionToken: "tok", actorId: "requester_1", action: "kyc1.outcome.override", resource: "cdd_outcome" });
    expect(result).toEqual({ authorised: false, reason: "iam2_unavailable" });
  });

  it("fails closed when success:false on a 200 response", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: true, body: { success: false } }));
    const result = await verifyDecisionToken({ ...baseConfig, fetchImpl }, { decisionToken: "tok", actorId: "requester_1", action: "kyc1.outcome.override", resource: "cdd_outcome" });
    expect(result).toEqual({ authorised: false, reason: "iam2_unavailable" });
  });

  it("fails closed on a network error (fetch throws) — IAM-02 unreachable", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const result = await verifyDecisionToken({ ...baseConfig, fetchImpl }, { decisionToken: "tok", actorId: "requester_1", action: "kyc1.outcome.override", resource: "cdd_outcome" });
    expect(result).toEqual({ authorised: false, reason: "iam2_unavailable" });
  });

  it("fails closed on a request timeout — IAM-02 unreachable", async () => {
    const fetchImpl = (async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    }) as typeof fetch;
    const result = await verifyDecisionToken({ ...baseConfig, fetchImpl }, { decisionToken: "tok", actorId: "requester_1", action: "kyc1.outcome.override", resource: "cdd_outcome" });
    expect(result).toEqual({ authorised: false, reason: "iam2_unavailable" });
  });

  it("fails closed on a non-2xx response with an unparseable body — the ONLY reason value the caller maps to KYC1_IAM2_UNAVAILABLE rather than KYC1_APPROVAL_REQUIRED", async () => {
    const { fetchImpl } = makeFakeIam2Fetch(() => ({ ok: false }));
    const result = await verifyDecisionToken({ ...baseConfig, fetchImpl }, { decisionToken: "tok", actorId: "requester_1", action: "kyc1.outcome.override", resource: "cdd_outcome" });
    expect(result).toEqual({ authorised: false, reason: "iam2_unavailable" });
  });
});
