/**
 * Unit tests for services/clt1/src/lib/cfg1-client.ts — CLT-01's own copy of the CFG-01 HTTP
 * client (F3(c), no live CFG-01 service). Mirrors tests/unit/sec1-iam2-client.test.ts /
 * tests/unit/cfg1-iam2-client.test.ts's shape for the identical class of dependency: class-code
 * mapping is pure and tested directly; the fetch call is stubbed via the `fetchImpl` DI seam.
 */
import { describe, expect, it } from "vitest";
import { evaluateOnboardingGate, onboardingFeatureCodeForClass } from "../../services/clt1/src/lib/cfg1-client.js";

const config = { baseUrl: "http://cfg1.test", internalServiceToken: "test-token" };

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    json: async () => body,
  })) as unknown as typeof fetch;
}

function throwingFetch(): typeof fetch {
  return (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

describe("onboardingFeatureCodeForClass", () => {
  it("maps institutional/hnwi/professional to their own onboarding.* feature codes", () => {
    expect(onboardingFeatureCodeForClass("institutional")).toBe("onboarding.institutional");
    expect(onboardingFeatureCodeForClass("hnwi")).toBe("onboarding.hnwi");
    expect(onboardingFeatureCodeForClass("professional")).toBe("onboarding.professional");
  });

  it("maps retail and unknown BOTH to onboarding.retail_default — no local special-casing", () => {
    expect(onboardingFeatureCodeForClass("retail")).toBe("onboarding.retail_default");
    expect(onboardingFeatureCodeForClass("unknown")).toBe("onboarding.retail_default");
  });
});

describe("evaluateOnboardingGate", () => {
  it("returns allowed: true on a real CFG-01 allow decision", async () => {
    const result = await evaluateOnboardingGate(
      { ...config, fetchImpl: fakeFetch(200, { success: true, data: { decision: "allow", reason_code: "feature_allowed", decision_id: "cfgdec_1" } }) },
      { clientClass: "institutional", applicationId: "clt1app_1", environment: "dev" },
    );
    expect(result.allowed).toBe(true);
    expect(result.featureCode).toBe("onboarding.institutional");
    expect(result.decisionId).toBe("cfgdec_1");
    expect(result.reasonCode).toBe("feature_allowed");
  });

  it("returns allowed: false on a real CFG-01 deny decision (e.g. unknown_fail_closed)", async () => {
    const result = await evaluateOnboardingGate(
      { ...config, fetchImpl: fakeFetch(200, { success: true, data: { decision: "deny", reason_code: "unknown_fail_closed", decision_id: "cfgdec_2" } }) },
      { clientClass: "hnwi", applicationId: "clt1app_2", environment: "dev" },
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("unknown_fail_closed");
  });

  it("fails closed (allowed: false) on a non-2xx response", async () => {
    const result = await evaluateOnboardingGate(
      { ...config, fetchImpl: fakeFetch(503, { success: false }) },
      { clientClass: "professional", applicationId: "clt1app_3", environment: "dev" },
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("cfg1_unavailable");
  });

  it("fails closed (allowed: false) on a malformed/unparseable success body", async () => {
    const result = await evaluateOnboardingGate(
      { ...config, fetchImpl: fakeFetch(200, { success: true, data: {} }) },
      { clientClass: "institutional", applicationId: "clt1app_4", environment: "dev" },
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("cfg1_unavailable");
  });

  it("fails closed (allowed: false) on a network error", async () => {
    const result = await evaluateOnboardingGate(
      { ...config, fetchImpl: throwingFetch() },
      { clientClass: "institutional", applicationId: "clt1app_5", environment: "dev" },
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("cfg1_unavailable");
  });

  it("retail and unknown are sent as onboarding.retail_default — never a bespoke local code", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const captureFetch = (async (_url: unknown, init?: unknown) => {
      capturedBody = JSON.parse(((init as { body?: string }).body) ?? "{}");
      return { ok: true, json: async () => ({ success: true, data: { decision: "deny", reason_code: "prohibited", decision_id: "cfgdec_6" } }) };
    }) as unknown as typeof fetch;

    await evaluateOnboardingGate({ ...config, fetchImpl: captureFetch }, { clientClass: "retail", applicationId: "clt1app_6", environment: "dev" });
    expect(capturedBody?.feature_code).toBe("onboarding.retail_default");
    expect(capturedBody?.caller_module).toBe("CLT-01");
    expect(capturedBody?.action).toBe("onboard");
  });

  it("never sends or returns a raw decision token — only decision_id/reason_code/feature_code", async () => {
    const result = await evaluateOnboardingGate(
      { ...config, fetchImpl: fakeFetch(200, { success: true, data: { decision: "allow", reason_code: "feature_allowed", decision_id: "cfgdec_7", decision_token: "should-be-ignored" } }) },
      { clientClass: "institutional", applicationId: "clt1app_7", environment: "dev" },
    );
    expect(result).not.toHaveProperty("decisionToken");
    expect(Object.keys(result).sort()).toEqual(["allowed", "decisionId", "evaluatedAtUtc", "featureCode", "reasonCode"].sort());
  });
});
