/**
 * IAM-02 app-level tests via app.inject — no database required. Mirrors
 * tests/unit/iam-app.test.ts's shape: standard envelope, the fail-closed internal-identity
 * guard, and the Idempotency/validation backend-enforcement baseline for the one route this
 * stage builds.
 */
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Iam2Config } from "../../services/iam2/src/config.js";
import { buildApp } from "../../services/iam2/src/server.js";

const config: Iam2Config = {
  environment: "dev",
  databaseUrl: "postgres://unused:unused@localhost:5432/unused",
  internalServiceToken: "test-iam2-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-test",
  artifactHash: "sha256:test",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  iam2InternalServiceToken: "test-iam2-internal-token-123",
  iam01BaseUrl: "http://127.0.0.1:0",
  iam01InternalServiceToken: "test-iam01-shared-secret-unused",
  bootstrapTransitionEnabled: false,
};

const internal = { "x-internal-service-token": "test-iam2-internal-token-123" };

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(config);
});

afterAll(async () => {
  await app.close();
});

describe("IAM-02 service app (no DB)", () => {
  it("boots clean (buildApp did not throw) — the no-Exchange boot guard passed", () => {
    expect(app).toBeDefined();
  });

  it("registers no Exchange-runtime route surface (assertNoExchangeRuntime ran at boot without throwing)", () => {
    const routePaths = app
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const hits = routePaths.filter((p) => p.toLowerCase().includes("exchange"));
    expect(hits).toEqual([]);
  });

  it("fails closed with no internal-service-token header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/iam2/permission/check",
      payload: { actor_id: "user_1", action: "iam2.role.read", resource: "role" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("fails closed with a wrong internal-service-token header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/iam2/permission/check",
      headers: { "x-internal-service-token": "totally-wrong-token" },
      payload: { actor_id: "user_1", action: "iam2.role.read", resource: "role" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("rejects a body missing required fields (backend validation) even with a valid internal token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/iam2/permission/check",
      headers: internal,
      payload: { actor_id: "user_1" }, // missing action + resource
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a body with unexpected extra fields (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/iam2/permission/check",
      headers: internal,
      payload: { actor_id: "user_1", action: "iam2.role.read", resource: "role", not_a_real_field: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("propagates/generates request-id and correlation-id headers on every response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/iam2/permission/check",
      headers: internal,
      payload: { actor_id: "user_1" },
    });
    expect(typeof res.headers["x-request-id"]).toBe("string");
    expect(typeof res.headers["x-correlation-id"]).toBe("string");
  });

  it("404s with the standard envelope for an unknown route", async () => {
    const res = await app.inject({ method: "GET", url: "/no-such-route" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
    expect(res.json().success).toBe(false);
  });
});
