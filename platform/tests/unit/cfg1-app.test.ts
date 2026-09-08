/**
 * CFG-01 app-level tests via app.inject — no database required. Mirrors
 * tests/unit/iam2-app.test.ts's shape: standard envelope, boot/no-Exchange-guard proof, and
 * the routes Phase 0-3A register (health, readiness, features/evaluate,
 * features/verify-decision, feature-changes/request+apply, licence-profile-changes/
 * request+apply). Readiness's actual DB-backed pass/fail behaviour, and every mutation/decision
 * route's actual behaviour, are covered by tests/integration/cfg1-db.test.ts (real Postgres) —
 * this file only proves readiness fails closed (503) when the DB pool was never initialised,
 * which is exactly this file's own no-DB test setup.
 */
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Cfg1Config } from "../../services/cfg1/src/config.js";
import { buildApp } from "../../services/cfg1/src/server.js";

const config: Cfg1Config = {
  environment: "dev",
  databaseUrl: "postgres://unused:unused@localhost:5432/unused",
  internalServiceToken: "test-cfg1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-test",
  artifactHash: "sha256:test",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  cfg1InternalServiceToken: "test-cfg1-internal-token-123",
  iam2BaseUrl: "http://127.0.0.1:0",
  iam2InternalServiceToken: "test-cfg1-iam2-token-unused",
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(config);
});

afterAll(async () => {
  await app.close();
});

describe("CFG-01 service app (no DB) — Phase 0/1 scaffold + readiness", () => {
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

  it("registers exactly health + readiness + features/evaluate + features/verify-decision + feature-changes/{request,apply} + licence-profile-changes/{request,apply} + kill-switches/activate + kill-switch-deactivation-requests/{request,apply} — no kill-switch read/list, ceremony, or deployment-gate surface exists yet", () => {
    const routePaths = app
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // Route tree formatting varies (tree-drawing characters), so match on substring presence
    // rather than an exact-string route table.
    const joined = routePaths.join("\n");
    expect(joined).toContain("cfg1/health");
    expect(joined).toContain("cfg1/readiness");
    expect(joined).toContain("features/evaluate");
    expect(joined).toContain("features/verify-decision");
    expect(joined).toContain("feature-changes/request");
    expect(joined).toContain("feature-changes/apply");
    expect(joined).toContain("licence-profile-changes/request");
    expect(joined).toContain("licence-profile-changes/apply");
    expect(joined).toContain("kill-switches/activate");
    expect(joined).toContain("kill-switch-deactivation-requests/request");
    expect(joined).toContain("kill-switch-deactivation-requests/apply");
    // Approved decisions #10/#11 (Phase 3B) — no read/list route for kill-switch state exists.
    expect(joined).not.toContain("kill-switches/read");
    expect(joined).not.toContain("kill-switches/list");
    for (const forbidden of [
      "exchange-activation",
      "deployment-gate",
      "reconciliation",
      "evidence-export",
      "prohibited-feature",
      "prohibited-registry",
    ]) {
      expect(joined).not.toContain(forbidden);
    }
  });

  it("GET /internal/cfg1/health returns the standard success envelope, unauthenticated", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/cfg1/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ status: "alive" });
    expect(typeof body.request_id).toBe("string");
    expect(typeof body.correlation_id).toBe("string");
  });

  it("propagates/generates request-id and correlation-id headers on every response", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/cfg1/health" });
    expect(typeof res.headers["x-request-id"]).toBe("string");
    expect(typeof res.headers["x-correlation-id"]).toBe("string");
  });

  it("404s with the standard envelope for an unknown route", async () => {
    const res = await app.inject({ method: "GET", url: "/no-such-route" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
    expect(res.json().success).toBe(false);
  });

  it("GET /internal/cfg1/readiness fails closed (503, not_ready) when the DB pool is unavailable, unauthenticated", async () => {
    // This file's config never calls initPool — getPool() throws, which the route must catch
    // and report as db_unavailable rather than crash or leak the underlying error.
    const res = await app.inject({ method: "GET", url: "/internal/cfg1/readiness" });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("not_ready");
    expect(body.data.checks).toEqual([{ scope: "database", status: "fail", reason: "db_unavailable" }]);
  });

  it("readiness response never includes raw registry rows or hash values", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/cfg1/readiness" });
    const raw = JSON.stringify(res.json());
    expect(raw).not.toContain("sha256:");
    expect(raw).not.toContain("licence_code");
    expect(raw).not.toContain("feature_code");
  });
});
