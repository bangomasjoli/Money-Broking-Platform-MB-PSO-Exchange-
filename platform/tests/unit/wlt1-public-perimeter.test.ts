/**
 * WLT-01 Public Perimeter / Pre-Authentication Abuse Control (`DECISION_LOG.md` DEC-010, L3) —
 * no database required. Covers:
 *   (1) `makePublicPerimeterGuard` directly (missing/wrong/correct token, no Fastify app needed);
 *   (2) the route-registration gate at `buildApp` level — disabled (0 public routes) vs enabled
 *       (6 public routes), 27 internal routes unaffected either way;
 *   (3) 404-equivalence: disabled surface, invalid-provenance-enabled surface, and a genuinely
 *       unknown route must be externally indistinguishable;
 *   (4) credential separation — the perimeter token and the internal-service token are two
 *       independent secrets; neither can satisfy the other's guard.
 *
 * The full authenticated-chain behaviour behind a VALID perimeter token (IAM -> CLT -> FND ->
 * business operation) is covered against a real Postgres in
 * tests/integration/wlt1-public-surface-db.test.ts — this file only proves admission, not
 * business behaviour.
 */
import { describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { makePublicPerimeterGuard, PUBLIC_PERIMETER_TOKEN_HEADER } from "../../services/wlt1/src/plugins/public-perimeter.js";

const PERIMETER_TOKEN = "test-wlt1-perimeter-token-at-least-32-characters-long";
const WRONG_PERIMETER_TOKEN = "wrong-wlt1-perimeter-token-also-at-least-32-chars";
const INTERNAL_SERVICE_TOKEN = "test-wlt1-internal-token-perimeter-unit-it";

const PUBLIC_ROUTE_PATHS: Array<{ method: "GET" | "POST"; url: string }> = [
  { method: "GET", url: "/wlt1/destinations" },
  { method: "GET", url: "/wlt1/destinations/wlt1dest_unknown" },
  { method: "POST", url: "/wlt1/wallet-destinations" },
  { method: "POST", url: "/wlt1/payout-destinations" },
  { method: "POST", url: "/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control/challenges" },
  { method: "POST", url: "/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control/verify" },
];

function baseConfig(overrides: Partial<Wlt1Config>): Wlt1Config {
  return {
    environment: "dev",
    databaseUrl: "postgres://unused:unused@localhost:5432/unused",
    internalServiceToken: "test-wlt1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-test",
    artifactHash: "sha256:test",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    wlt1InternalServiceToken: INTERNAL_SERVICE_TOKEN,
    clt1BaseUrl: "http://localhost:8085",
    clt1InternalServiceToken: "test-clt1-internal-token-unused",
    screeningProviderId: "stub-wallet-analytics-v1",
    screeningMaxValidityHours: 720,
    providerReceiptSecrets: {},
    pocChallengeTtlMinutes: 15,
    pocMaxAttempts: 5,
    destinationCoolingOffHours: 24,
    iam2BaseUrl: "http://localhost:8082",
    iam2InternalServiceToken: "test-iam2-internal-token-unused",
    decisionTokenTtlMinutes: 5,
    aml1BaseUrl: "http://localhost:8088",
    aml1InternalServiceToken: "test-aml1-internal-token-unused",
    rescreenLeadTimeHours: 72,
    rescreenBatchSizeDefault: 50,
    rescreenBatchSizeMax: 200,
    fiatScreeningMaxValidityHours: 720,
    beneficiaryVerificationValidityHours: 8760,
    fiatEncKey: "test-fiat-enc-key-at-least-32-characters-long",
    beneficiaryVerificationProviderId: "stub-beneficiary-verification-v1",
    fiatScreeningProviderId: "stub-fiat-screening-v1",
    fiatVerificationRequired: true,
    evidenceExportMaxRecords: 5000,
    stuckScreeningThresholdSeconds: 300,
    iamBaseUrl: "http://localhost:8081",
    iamIntrospectionServiceToken: "test-iam-introspection-token-unused",
    fndBaseUrl: "http://localhost:8080",
    fndRateLimitConsumerToken: "test-fnd-ratelimit-token-unused",
    publicDestinationListMax: 100,
    publicSurfaceEnabled: false,
    publicPerimeterToken: undefined,
    ...overrides,
  };
}

function routePaths(app: FastifyInstance): string[] {
  return app
    .printRoutes({ commonPrefix: false })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

describe("makePublicPerimeterGuard — direct unit tests (no Fastify app)", () => {
  function fakeRequest(headers: Record<string, string | string[] | undefined>) {
    return { headers } as unknown as Parameters<ReturnType<typeof makePublicPerimeterGuard>>[0];
  }
  const noopReply = {} as Parameters<ReturnType<typeof makePublicPerimeterGuard>>[1];

  it("rejects when the header is absent", async () => {
    const guard = makePublicPerimeterGuard(PERIMETER_TOKEN);
    await expect(guard(fakeRequest({}), noopReply)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects when the header is blank", async () => {
    const guard = makePublicPerimeterGuard(PERIMETER_TOKEN);
    await expect(guard(fakeRequest({ [PUBLIC_PERIMETER_TOKEN_HEADER]: "" }), noopReply)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects when the header value is wrong (same length, different content)", async () => {
    const guard = makePublicPerimeterGuard(PERIMETER_TOKEN);
    await expect(guard(fakeRequest({ [PUBLIC_PERIMETER_TOKEN_HEADER]: WRONG_PERIMETER_TOKEN }), noopReply)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects when the header value has a different length entirely", async () => {
    const guard = makePublicPerimeterGuard(PERIMETER_TOKEN);
    await expect(guard(fakeRequest({ [PUBLIC_PERIMETER_TOKEN_HEADER]: "short" }), noopReply)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("resolves (never throws) when the header value matches exactly", async () => {
    const guard = makePublicPerimeterGuard(PERIMETER_TOKEN);
    await expect(guard(fakeRequest({ [PUBLIC_PERIMETER_TOKEN_HEADER]: PERIMETER_TOKEN }), noopReply)).resolves.toBeUndefined();
  });

  it("handles a duplicated header (array form) by comparing only the first value", async () => {
    const guard = makePublicPerimeterGuard(PERIMETER_TOKEN);
    await expect(guard(fakeRequest({ [PUBLIC_PERIMETER_TOKEN_HEADER]: [PERIMETER_TOKEN, "extra"] }), noopReply)).resolves.toBeUndefined();
    await expect(guard(fakeRequest({ [PUBLIC_PERIMETER_TOKEN_HEADER]: ["extra", PERIMETER_TOKEN] }), noopReply)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("the internal-service-token value never satisfies the perimeter guard, and vice versa (two independent secrets)", async () => {
    const guard = makePublicPerimeterGuard(PERIMETER_TOKEN);
    await expect(guard(fakeRequest({ [PUBLIC_PERIMETER_TOKEN_HEADER]: INTERNAL_SERVICE_TOKEN }), noopReply)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("Public-route registration gate — DISABLED (safe default)", () => {
  it("registers ZERO public routes; all 27 internal routes remain present", async () => {
    const app = await buildApp(baseConfig({ publicSurfaceEnabled: false, publicPerimeterToken: undefined }));
    try {
      const lines = routePaths(app);
      // Public paths are top-level entries beginning "├──"/"└── /wlt1/..." (never nested under
      // "/internal/wlt1/..."). Checking exact line prefixes, not substrings, so this never
      // false-positives against the legitimately-present /internal/wlt1/wallet-destinations etc.
      const publicTopLevelLines = lines.filter((l) => /^(├──|└──)\s+\/wlt1\//.test(l));
      expect(publicTopLevelLines).toEqual([]);
      // Internal surface unaffected — spot-check a handful of the 27 internal routes.
      const tree = lines.join("\n");
      expect(tree).toContain("/internal/wlt1/health (GET, HEAD)");
      expect(tree).toContain("/internal/wlt1/wallet-destinations (POST)");
      expect(tree).toContain("/internal/wlt1/stuck-screenings (GET, HEAD)");
    } finally {
      await app.close();
    }
  });

  it("every one of the six public paths 404s exactly like an unknown route — no handler exists at all", async () => {
    const app = await buildApp(baseConfig({ publicSurfaceEnabled: false, publicPerimeterToken: undefined }));
    try {
      for (const p of PUBLIC_ROUTE_PATHS) {
        const res = await app.inject({ method: p.method, url: p.url });
        expect(res.statusCode, `${p.method} ${p.url}`).toBe(404);
        expect(res.json().error.code).toBe("NOT_FOUND");
      }
    } finally {
      await app.close();
    }
  });

  it("internal routes remain reachable (401 without the internal token, never 404) when the public surface is disabled", async () => {
    const app = await buildApp(baseConfig({ publicSurfaceEnabled: false, publicPerimeterToken: undefined }));
    try {
      const res = await app.inject({ method: "GET", url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    } finally {
      await app.close();
    }
  });
});

describe("Public-route registration gate — ENABLED", () => {
  it("registers EXACTLY six public routes; all 27 internal routes remain present", async () => {
    const app = await buildApp(baseConfig({ publicSurfaceEnabled: true, publicPerimeterToken: PERIMETER_TOKEN }));
    try {
      const tree = routePaths(app).join("\n");
      expect(tree).toContain("/wlt1/destinations (GET, HEAD)");
      expect(tree).toContain("/wlt1/wallet-destinations (POST)");
      expect(tree).toContain("/wlt1/payout-destinations (POST)");
      expect(tree).toContain("proof-of-control/challenges (POST)");
      expect(tree).toContain("proof-of-control/verify (POST)");
      expect(tree).toContain("/internal/wlt1/health (GET, HEAD)");
      expect(tree).toContain("/internal/wlt1/stuck-screenings (GET, HEAD)");
    } finally {
      await app.close();
    }
  });

  it("missing perimeter token -> 404 on every public path, zero difference in shape from an unknown route", async () => {
    const app = await buildApp(baseConfig({ publicSurfaceEnabled: true, publicPerimeterToken: PERIMETER_TOKEN }));
    try {
      for (const p of PUBLIC_ROUTE_PATHS) {
        const res = await app.inject({ method: p.method, url: p.url });
        expect(res.statusCode, `${p.method} ${p.url}`).toBe(404);
        expect(res.json().error.code).toBe("NOT_FOUND");
      }
    } finally {
      await app.close();
    }
  });

  it("wrong perimeter token -> 404, identically to missing", async () => {
    const app = await buildApp(baseConfig({ publicSurfaceEnabled: true, publicPerimeterToken: PERIMETER_TOKEN }));
    try {
      for (const p of PUBLIC_ROUTE_PATHS) {
        const res = await app.inject({ method: p.method, url: p.url, headers: { [PUBLIC_PERIMETER_TOKEN_HEADER]: WRONG_PERIMETER_TOKEN } });
        expect(res.statusCode, `${p.method} ${p.url}`).toBe(404);
        expect(res.json().error.code).toBe("NOT_FOUND");
      }
    } finally {
      await app.close();
    }
  });

  it("correct perimeter token clears admission — the request proceeds past the perimeter into the existing auth chain (fails at IAM, not at the perimeter; no DB pool is initialised in this file so a proceeding request never reaches business logic either)", async () => {
    const app = await buildApp(baseConfig({ publicSurfaceEnabled: true, publicPerimeterToken: PERIMETER_TOKEN }));
    try {
      const res = await app.inject({
        method: "GET",
        url: "/wlt1/destinations",
        headers: { [PUBLIC_PERIMETER_TOKEN_HEADER]: PERIMETER_TOKEN, authorization: "Bearer whatever" },
      });
      // Never the perimeter's own NOT_FOUND — a genuinely different failure mode proves admission
      // was granted (this app has no live IAM-01, so introspection itself fails closed).
      expect(res.statusCode).not.toBe(404);
      expect(res.json().error.code).not.toBe("NOT_FOUND");
    } finally {
      await app.close();
    }
  });

  it("the internal-service-token value does not satisfy the public perimeter (two independent secrets)", async () => {
    const app = await buildApp(baseConfig({ publicSurfaceEnabled: true, publicPerimeterToken: PERIMETER_TOKEN }));
    try {
      const res = await app.inject({
        method: "GET",
        url: "/wlt1/destinations",
        headers: { [PUBLIC_PERIMETER_TOKEN_HEADER]: INTERNAL_SERVICE_TOKEN },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("the perimeter token value does not satisfy an internal route's own guard (two independent secrets, in the other direction)", async () => {
    const app = await buildApp(baseConfig({ publicSurfaceEnabled: true, publicPerimeterToken: PERIMETER_TOKEN }));
    try {
      const res = await app.inject({
        method: "GET",
        url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown",
        headers: { "x-internal-service-token": PERIMETER_TOKEN },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    } finally {
      await app.close();
    }
  });
});

describe("404 equivalence — disabled surface vs invalid-provenance-enabled surface vs a genuinely unknown route", () => {
  it("all three produce the identical status/body shape (modulo request_id/correlation_id, which legitimately differ per request)", async () => {
    const disabledApp = await buildApp(baseConfig({ publicSurfaceEnabled: false, publicPerimeterToken: undefined }));
    const enabledApp = await buildApp(baseConfig({ publicSurfaceEnabled: true, publicPerimeterToken: PERIMETER_TOKEN }));
    try {
      const disabledRes = await disabledApp.inject({ method: "GET", url: "/wlt1/destinations" });
      const invalidProvenanceRes = await enabledApp.inject({ method: "GET", url: "/wlt1/destinations" });
      const unknownRouteRes = await disabledApp.inject({ method: "GET", url: "/no-such-route-at-all" });

      for (const res of [disabledRes, invalidProvenanceRes, unknownRouteRes]) {
        expect(res.statusCode).toBe(404);
      }
      const strip = (body: Record<string, unknown>) => {
        const { request_id: _rid, correlation_id: _cid, server_time_utc: _t, ...rest } = body;
        return rest;
      };
      expect(strip(disabledRes.json())).toEqual(strip(invalidProvenanceRes.json()));
      expect(strip(disabledRes.json())).toEqual(strip(unknownRouteRes.json()));
    } finally {
      await disabledApp.close();
      await enabledApp.close();
    }
  });
});
