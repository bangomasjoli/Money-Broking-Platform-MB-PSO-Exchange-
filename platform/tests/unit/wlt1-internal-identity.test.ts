/**
 * Unit tests for WLT-01's own interim internal-identity guard
 * (services/wlt1/src/plugins/internal-identity.ts) — missing/wrong/correct token behaviour.
 *
 * Phase 0 registers exactly one route (`GET /internal/wlt1/health`), which is deliberately
 * UNAUTHENTICATED (a liveness probe must not require an internal-service-token — mirrors
 * FND-01's own `/foundation/health`), so the real `buildApp()` surface has no guarded route to
 * exercise the guard against yet. The guard function itself must still be proven correct before
 * Phase 1+ routes depend on it — this file mounts it on a throwaway scratch route built INSIDE
 * the test, never registered by the real service, the same self-test discipline
 * tests/unit/aml1-internal-identity.test.ts / tests/unit/clt1-internal-identity.test.ts already
 * established. This is not a second business endpoint; it never ships.
 */
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerRequestContext } from "../../services/wlt1/src/plugins/request-context.js";
import { makeWlt1InternalIdentityGuard } from "../../services/wlt1/src/plugins/internal-identity.js";

const EXPECTED_TOKEN = "test-wlt1-internal-token-scratch";

async function buildScratchApp() {
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  await registerRequestContext(app);
  const requireInternal = makeWlt1InternalIdentityGuard(EXPECTED_TOKEN);
  app.get("/scratch/internal-only", { preHandler: requireInternal }, async (request) => ({ ok: true, actor_id: request.ctx.actor_id }));
  await app.ready();
  return app;
}

describe("WLT-01 internal-identity guard", () => {
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

  it("rejects safely when the header is supplied twice (array form takes the first value, still must match)", async () => {
    const app = await buildScratchApp();
    const res = await app.inject({
      method: "GET",
      url: "/scratch/internal-only",
      headers: { "x-internal-service-token": ["totally-wrong-token", EXPECTED_TOKEN] },
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
    expect(res.json().ok).toBe(true);
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

  it("never trusts a caller-supplied actor_id — stamps the generic internal-service actor on success", async () => {
    const app = await buildScratchApp();
    const res = await app.inject({
      method: "GET",
      url: "/scratch/internal-only?actor_id=someone-else",
      headers: { "x-internal-service-token": EXPECTED_TOKEN, "x-actor-id": "someone-else" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().actor_id).toBe("wlt1_internal_service");
    await app.close();
  });

  it("the 401 response body never contains the expected token value", async () => {
    const app = await buildScratchApp();
    const res = await app.inject({
      method: "GET",
      url: "/scratch/internal-only",
      headers: { "x-internal-service-token": "totally-wrong-token" },
    });
    expect(JSON.stringify(res.json())).not.toContain(EXPECTED_TOKEN);
    await app.close();
  });
});
