/**
 * WLT-01 Public Client Surface — the three cross-service HTTP clients the public-auth chain
 * depends on: `lib/iam-client.ts` (IAM-01 introspection), `lib/clt1-client.ts`'s
 * `resolveClientMemberships` (CLT-01 membership), `lib/fnd-rate-limit-client.ts` (FND-01
 * rate-limit check). No DB, no live network — every test injects a stub `fetchImpl`.
 */
import { describe, it, expect } from "vitest";
import { introspectSession, ELIGIBLE_IAM_USER_CLASSES } from "../../services/wlt1/src/lib/iam-client.js";
import { resolveClientMemberships } from "../../services/wlt1/src/lib/clt1-client.js";
import { checkRateLimit } from "../../services/wlt1/src/lib/fnd-rate-limit-client.js";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const IAM_CFG = { baseUrl: "http://iam.test", introspectionServiceToken: "iam-token" };
const CLT_CFG = { baseUrl: "http://clt.test", internalServiceToken: "clt-token" };
const FND_CFG = { baseUrl: "http://fnd.test", consumerToken: "fnd-token" };

describe("WLT-01 Public Client Surface — IAM-01 introspection client", () => {
  it("eligible user classes are exactly client and client_approver", () => {
    expect(ELIGIBLE_IAM_USER_CLASSES.has("client")).toBe(true);
    expect(ELIGIBLE_IAM_USER_CLASSES.has("client_approver")).toBe(true);
    expect(ELIGIBLE_IAM_USER_CLASSES.has("admin")).toBe(false);
    expect(ELIGIBLE_IAM_USER_CLASSES.has("staff")).toBe(false);
    expect(ELIGIBLE_IAM_USER_CLASSES.has("service")).toBe(false);
  });

  it("200 + valid:true -> authenticated, with user_id/session_id/user_class carried through", async () => {
    const fetchImpl = async () => jsonResponse(200, { success: true, data: { valid: true, user_id: "iamuser_1", session_id: "iamsess_1", user_class: "client" } });
    const result = await introspectSession({ ...IAM_CFG, fetchImpl }, "bearer-token-1");
    expect(result).toEqual({ outcome: "authenticated", userId: "iamuser_1", sessionId: "iamsess_1", userClass: "client" });
  });

  it("401 -> invalid (never treated as authenticated, never conflated with unavailable)", async () => {
    const fetchImpl = async () => jsonResponse(401, { success: false, error: { code: "AUTH_SESSION_REQUIRED" } });
    const result = await introspectSession({ ...IAM_CFG, fetchImpl }, "bad-token");
    expect(result).toEqual({ outcome: "invalid" });
  });

  it("a 200 body with valid:false is NEVER treated as authenticated (fails to unavailable, not silently 'invalid')", async () => {
    const fetchImpl = async () => jsonResponse(200, { success: true, data: { valid: false } });
    const result = await introspectSession({ ...IAM_CFG, fetchImpl }, "token");
    expect(result.outcome).toBe("unavailable");
  });

  it("every other status (500/503/400) -> unavailable, never authenticated", async () => {
    for (const status of [500, 503, 400, 403, 404]) {
      const fetchImpl = async () => jsonResponse(status, {});
      const result = await introspectSession({ ...IAM_CFG, fetchImpl }, "token");
      expect(result.outcome, `status ${status}`).toBe("unavailable");
    }
  });

  it("network error -> unavailable", async () => {
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    const result = await introspectSession({ ...IAM_CFG, fetchImpl }, "token");
    expect(result).toEqual({ outcome: "unavailable" });
  });

  it("timeout -> unavailable", async () => {
    const fetchImpl = async () => {
      throw new DOMException("The operation was aborted.", "TimeoutError");
    };
    const result = await introspectSession({ ...IAM_CFG, fetchImpl }, "token");
    expect(result).toEqual({ outcome: "unavailable" });
  });

  it("malformed JSON body -> unavailable", async () => {
    const fetchImpl = async () => new Response("{not valid json", { status: 200, headers: { "content-type": "application/json" } });
    const result = await introspectSession({ ...IAM_CFG, fetchImpl }, "token");
    expect(result).toEqual({ outcome: "unavailable" });
  });

  it("200 body missing user_id/session_id/user_class -> unavailable, never authenticated with a fabricated identity", async () => {
    const fetchImpl = async () => jsonResponse(200, { success: true, data: { valid: true } });
    const result = await introspectSession({ ...IAM_CFG, fetchImpl }, "token");
    expect(result.outcome).toBe("unavailable");
  });

  it("sends the exact request body {access_token} and the dedicated x-internal-service-token header — never the raw bearer forwarded as-is in a different shape", async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl: string | undefined;
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return jsonResponse(200, { success: true, data: { valid: true, user_id: "u", session_id: "s", user_class: "client" } });
    };
    await introspectSession({ ...IAM_CFG, fetchImpl }, "the-bearer-token");
    expect(capturedUrl).toBe("http://iam.test/internal/auth/session/validate");
    expect(JSON.parse(capturedInit!.body as string)).toEqual({ access_token: "the-bearer-token" });
    expect((capturedInit!.headers as Record<string, string>)["x-internal-service-token"]).toBe("iam-token");
  });
});

describe("WLT-01 Public Client Surface — CLT-01 membership-resolution client", () => {
  it("returns the memberships array on a genuine 200 response", async () => {
    const fetchImpl = async () =>
      jsonResponse(200, { success: true, data: { iam_user_id: "u1", memberships: [{ client_id: "c1", authorised_user_id: "au1", role: "client_maker", membership_status: "active", client_status: "active" }] } });
    const result = await resolveClientMemberships({ ...CLT_CFG, fetchImpl }, "u1");
    expect(result).toEqual({ available: true, memberships: [{ clientId: "c1", authorisedUserId: "au1", role: "client_maker", membershipStatus: "active", clientStatus: "active" }] });
  });

  it("returns available:true with an empty array when the caller has zero eligible memberships (never conflated with unavailable)", async () => {
    const fetchImpl = async () => jsonResponse(200, { success: true, data: { iam_user_id: "u1", memberships: [] } });
    const result = await resolveClientMemberships({ ...CLT_CFG, fetchImpl }, "u1");
    expect(result).toEqual({ available: true, memberships: [] });
  });

  it("network error / timeout / non-2xx / malformed body all resolve to available:false", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => {
        throw new Error("network");
      },
      async () => jsonResponse(500, {}),
      async () => jsonResponse(404, {}),
      async () => new Response("not json", { status: 200 }),
      async () => jsonResponse(200, { success: true, data: {} }), // missing memberships array
    ];
    for (const fetchImpl of cases) {
      const result = await resolveClientMemberships({ ...CLT_CFG, fetchImpl }, "u1");
      expect(result).toEqual({ available: false });
    }
  });

  it("a malformed individual membership entry fails the WHOLE call closed (never silently drops one row)", async () => {
    const fetchImpl = async () =>
      jsonResponse(200, { success: true, data: { memberships: [{ client_id: "c1", authorised_user_id: "au1", role: "client_maker", membership_status: "active", client_status: "active" }, { client_id: "c2" }] } });
    const result = await resolveClientMemberships({ ...CLT_CFG, fetchImpl }, "u1");
    expect(result).toEqual({ available: false });
  });
});

describe("WLT-01 Public Client Surface — FND-01 rate-limit client", () => {
  it("200 + decision:allow -> allow", async () => {
    const fetchImpl = async () => jsonResponse(200, { success: true, data: { decision: "allow", limit_ref: "frl_wlt1_read_list:v1", retry_after_seconds: null } });
    const result = await checkRateLimit({ ...FND_CFG, fetchImpl }, { bucket: "READ_LIST", subjectType: "client", subjectId: "c1" });
    expect(result).toEqual({ outcome: "allow" });
  });

  it("429 with Retry-After -> rate_limited with the parsed retry-after value", async () => {
    const fetchImpl = async () => jsonResponse(429, { success: false, error: { code: "RATE_LIMITED" } }, { "retry-after": "42" });
    const result = await checkRateLimit({ ...FND_CFG, fetchImpl }, { bucket: "MUTATE_REGISTER", subjectType: "client", subjectId: "c1" });
    expect(result).toEqual({ outcome: "rate_limited", retryAfterSeconds: 42 });
  });

  it("429 with no/invalid Retry-After header defaults to 1 second (never 0/negative)", async () => {
    const fetchImpl = async () => jsonResponse(429, {});
    const result = await checkRateLimit({ ...FND_CFG, fetchImpl }, { bucket: "MUTATE_REGISTER", subjectType: "client", subjectId: "c1" });
    expect(result).toEqual({ outcome: "rate_limited", retryAfterSeconds: 1 });
  });

  it("503 RATE_LIMIT_UNAVAILABLE -> unavailable, never rate_limited", async () => {
    const fetchImpl = async () => jsonResponse(503, { success: false, error: { code: "RATE_LIMIT_UNAVAILABLE" } });
    const result = await checkRateLimit({ ...FND_CFG, fetchImpl }, { bucket: "READ_LIST", subjectType: "client", subjectId: "c1" });
    expect(result).toEqual({ outcome: "unavailable" });
  });

  it("401/400/other unexpected status, timeout, network error, malformed body all map to unavailable — never allow, never rate_limited", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => jsonResponse(401, {}),
      async () => jsonResponse(400, {}),
      async () => jsonResponse(500, {}),
      async () => {
        throw new Error("ECONNREFUSED");
      },
      async () => new Response("not json", { status: 200 }),
      async () => jsonResponse(200, { success: true, data: { decision: "deny" } }), // never a real FND decision value, but defensively handled
    ];
    for (const fetchImpl of cases) {
      const result = await checkRateLimit({ ...FND_CFG, fetchImpl }, { bucket: "READ_LIST", subjectType: "client", subjectId: "c1" });
      expect(result.outcome).toBe("unavailable");
    }
  });

  it("sends the exact bucket/subject_type/subject_id request body and the dedicated consumer token header — never FND's generic internal-service token", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return jsonResponse(200, { success: true, data: { decision: "allow" } });
    };
    await checkRateLimit({ ...FND_CFG, fetchImpl }, { bucket: "MUTATE_POC", subjectType: "user", subjectId: "iamuser_1" });
    expect(JSON.parse(capturedInit!.body as string)).toEqual({ bucket: "MUTATE_POC", subject_type: "user", subject_id: "iamuser_1" });
    expect((capturedInit!.headers as Record<string, string>)["x-internal-service-token"]).toBe("fnd-token");
  });
});
