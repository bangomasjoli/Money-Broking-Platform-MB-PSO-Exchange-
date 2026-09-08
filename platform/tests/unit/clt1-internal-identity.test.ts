/**
 * Unit tests for CLT-01's own interim internal-identity guard
 * (services/clt1/src/plugins/internal-identity.ts) — missing/wrong/correct token behaviour.
 *
 * Phase 0 registers exactly one route (`GET /internal/clt1/health`), which is deliberately
 * UNAUTHENTICATED (a liveness probe must not require an internal-service-token — mirrors
 * FND-01's own `/foundation/health`), so the real `buildApp()` surface has no guarded route to
 * exercise the guard against yet. The guard function itself must still be proven correct before
 * Phase 1+ routes depend on it — this file mounts it on a throwaway scratch route built INSIDE
 * the test, never registered by the real service, the same self-test discipline
 * tests/unit/cfg1-internal-identity.test.ts already established. This is not a second business
 * endpoint; it never ships.
 */
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerRequestContext } from "../../services/clt1/src/plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../../services/clt1/src/plugins/internal-identity.js";

const EXPECTED_TOKEN = "test-clt1-internal-token-scratch";

async function buildScratchApp() {
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  await registerRequestContext(app);
  const requireInternal = makeClt1InternalIdentityGuard(EXPECTED_TOKEN);
  app.get("/scratch/internal-only", { preHandler: requireInternal }, async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe("CLT-01 internal-identity guard", () => {
  it("rejects a request with no internal-service-token header", async () => {
    const app = await buildScratchApp();
    const res = await app.inject({ method: "GET", url: "/scratch/internal-only" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    await app.close();
  });

  it("rejects a request with a wrong internal-service-token header", async () => {
    const app = await buildScratchApp();
    const res = await app.inject({
      method: "GET",
      url: "/scratch/internal-only",
      headers: { "x-internal-service-token": "totally-wrong-token" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    await app.close();
  });

  it("rejects a blank internal-service-token header", async () => {
    const app = await buildScratchApp();
    const res = await app.inject({
      method: "GET",
      url: "/scratch/internal-only",
      headers: { "x-internal-service-token": "" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    await app.close();
  });

  it("accepts a request with the correct internal-service-token header", async () => {
    const app = await buildScratchApp();
    const res = await app.inject({
      method: "GET",
      url: "/scratch/internal-only",
      headers: { "x-internal-service-token": EXPECTED_TOKEN },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it("does not accept a token that differs only in length (constant-time compare boundary)", async () => {
    const app = await buildScratchApp();
    const res = await app.inject({
      method: "GET",
      url: "/scratch/internal-only",
      headers: { "x-internal-service-token": EXPECTED_TOKEN + "x" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
