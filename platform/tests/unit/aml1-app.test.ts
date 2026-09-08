/**
 * AML-01 app-level tests via app.inject — no database required. Mirrors tests/unit/
 * clt1-app.test.ts's shape: standard envelope, boot/no-Exchange-guard proof, the exact
 * Phase 0+1+2A+2B route surface, and correlation-header propagation. Every route's BEHAVIOUR
 * (against a real Postgres under `role_aml1_runtime`) is covered by tests/integration/
 * aml1-db.test.ts — this file only proves the app boots, the route surface is exactly what's
 * approved so far, validation rejects unknown fields, and readiness fails closed (503) when the
 * DB pool was never initialised.
 *
 * Phase 1 update: the forbidden-fragment sweep below was deliberately revised to drop
 * `screening`/`match`/`disposition` — Phase 1's own `screening-requests` routes legitimately use
 * "screening", and a future disposition/match-detail route may legitimately use "match" — while
 * still forbidding every Exchange/wallet/trading/settlement fragment and any public route. This
 * was flagged as a required, deliberate Phase 1 edit by the Phase 0 Opus review (INFO-2), not a
 * surprise regression. Phase 2A's own `clt-outcome`/`clt-outcome-deliveries`/`retry` route
 * fragments, Phase 2B's own `matches`/`sensitive-detail`/`confirm`/`dismiss`/`request`/`apply`
 * fragments, and Phase 3B's own `provider`/`status` fragments, don't collide with anything on this
 * list either — no further edit was needed any of those times.
 */
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Aml1Config } from "../../services/aml1/src/config.js";
import { buildApp } from "../../services/aml1/src/server.js";

const config: Aml1Config = {
  environment: "dev",
  databaseUrl: "postgres://unused:unused@localhost:5432/unused",
  internalServiceToken: "test-aml1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-test",
  artifactHash: "sha256:test",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  aml1InternalServiceToken: "test-aml1-internal-token-123",
  clt1BaseUrl: "http://localhost:8085",
  clt1InternalServiceToken: "test-clt1-internal-token-unused",
  iam2BaseUrl: "http://localhost:8082",
  iam2InternalServiceToken: "test-iam02-internal-token-unused",
  screeningProviderId: "stub-v1",
  rescreenDueDays: 90,
  monitoringBatchSizeDefault: 50,
  monitoringBatchSizeMax: 200,
  stuckScreeningThresholdSeconds: 900,
  pretransactionEvidenceMaxAgeHours: 2160,
  pretransactionDecisionTtlMinutes: 5,
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(config);
});

afterAll(async () => {
  await app.close();
});

describe("AML-01 service app (no DB) — Phase 0 + Phase 1 + Phase 2A + Phase 2B + Phase 3B + Phase 3C scaffold", () => {
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

  // The exact, frozen output of `app.printRoutes({ commonPrefix: false })` for the approved
  // Phase 0+1+2A+2B+3B+3C+3D+3E route surface (22 routes) — captured directly from a running
  // `buildApp()`, not hand-transcribed. Phase 3E's own `/pre-transaction/screen` lands last in
  // Fastify's own radix-tree print order, not registration order.
  const EXACT_ROUTE_TREE = [
    "├── /internal/aml1/health (GET, HEAD)",
    "├── /internal/aml1/readiness (GET, HEAD)",
    "├── /internal/aml1/risk-signals (GET, HEAD)",
    "│   └── /:signal_id/acknowledge (POST)",
    "├── /internal/aml1/screening-requests (POST)",
    "│   ├── /stuck (GET, HEAD)",
    "│   └── /:screening_request_id (GET, HEAD)",
    "│       ├── /clt-outcome (POST)",
    "│       ├── /matches (GET, HEAD)",
    "│       ├── /rescreen (POST)",
    "│       └── /recover (POST)",
    "├── /internal/aml1/clt-outcome-deliveries/:delivery_id (GET, HEAD)",
    "│   └── /retry (POST)",
    "├── /internal/aml1/matches/:screening_match_id/sensitive-detail (GET, HEAD)",
    "├── /internal/aml1/matches/:screening_match_id/confirm/request (POST)",
    "├── /internal/aml1/matches/:screening_match_id/confirm/apply (POST)",
    "├── /internal/aml1/matches/:screening_match_id/dismiss/request (POST)",
    "├── /internal/aml1/matches/:screening_match_id/dismiss/apply (POST)",
    "├── /internal/aml1/monitoring-runs (POST)",
    "│   └── /:run_id (GET, HEAD)",
    "├── /internal/aml1/provider/status (GET, HEAD)",
    "└── /internal/aml1/pre-transaction/screen (POST)",
  ];

  it("registers EXACTLY the frozen Phase 0+1+2A+2B+3B+3C+3D+3E route tree — an accidental extra route (not just a missing one) fails this test", () => {
    const routePaths = app
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(routePaths).toEqual(EXACT_ROUTE_TREE);
  });

  it("readiness route exists (Phase 1 — mirrors CLT-01's own Phase 0->1 precedent)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/aml1/readiness" });
    expect(res.statusCode).toBe(503); // no DB pool initialised in this no-DB test file
    expect(res.json().data.status).toBe("not_ready");
  });

  it("no route is registered outside /internal/aml1/* — no public /aml1/* surface", () => {
    const routePaths = app
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");
    expect(routePaths).not.toMatch(/(^|\s)\/aml1\//);
  });

  it("no forbidden business-capability route fragment anywhere in the route surface (screening/match/disposition deliberately dropped from this list in Phase 1 — see file header)", () => {
    const routePaths = app.printRoutes({ commonPrefix: false }).toLowerCase();
    for (const forbidden of [
      "exchange",
      "order-book",
      "orderbook",
      "matching",
      "market-making",
      "principal",
      "spread",
      "wallet",
      "wallet-address",
      "deposit",
      "withdraw",
      "withdrawal",
      "trading",
      "settlement",
    ]) {
      expect(routePaths).not.toContain(forbidden);
    }
  });

  it("GET /internal/aml1/health returns the standard success envelope, unauthenticated", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/aml1/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ status: "alive" });
  });

  it("POST /internal/aml1/screening-requests requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/aml1/screening-requests",
      payload: { subject_type: "client_application", subject_ref: "clt1app_1", subject_nature: "entity", provenance: "declared_identity", requested_by: "staff_1", declared_identity: { name: "Test" } },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/aml1/screening-requests rejects an unknown/additional body field (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/aml1/screening-requests",
      headers: { "x-internal-service-token": "test-aml1-internal-token-123" },
      payload: {
        subject_type: "client_application",
        subject_ref: "clt1app_1",
        subject_nature: "entity",
        provenance: "declared_identity",
        requested_by: "staff_1",
        declared_identity: { name: "Test" },
        not_a_real_field: "should be rejected, not silently stripped",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/aml1/screening-requests rejects an invalid subject_type enum value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/aml1/screening-requests",
      headers: { "x-internal-service-token": "test-aml1-internal-token-123" },
      payload: { subject_type: "wallet_address", subject_ref: "x", provenance: "declared_identity", requested_by: "staff_1", declared_identity: { name: "Test" } },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /internal/aml1/screening-requests/:id requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/aml1/screening-requests/aml1req_unknown" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("Phase 3B: POST /internal/aml1/screening-requests rejects a body missing the now-required subject_nature field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/aml1/screening-requests",
      headers: { "x-internal-service-token": "test-aml1-internal-token-123" },
      payload: { subject_type: "client_application", subject_ref: "clt1app_1", provenance: "declared_identity", requested_by: "staff_1", declared_identity: { name: "Test" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Phase 3B: POST /internal/aml1/screening-requests rejects an invalid subject_nature enum value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/aml1/screening-requests",
      headers: { "x-internal-service-token": "test-aml1-internal-token-123" },
      payload: {
        subject_type: "client_application",
        subject_ref: "clt1app_1",
        subject_nature: "not_a_real_nature",
        provenance: "declared_identity",
        requested_by: "staff_1",
        declared_identity: { name: "Test" },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Phase 3B: GET /internal/aml1/provider/status requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/aml1/provider/status?actor_id=staff_1" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("Phase 3C: POST .../screening-requests/:id/rescreen requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/aml1/screening-requests/aml1req_unknown/rescreen", payload: { trigger_reason: "manual", requested_by: "staff_1" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("Phase 3C: POST .../screening-requests/:id/rescreen rejects an out-of-scope trigger_reason (kyc_profile_changed/transaction_triggered are not accepted)", async () => {
    for (const trigger_reason of ["kyc_profile_changed", "transaction_triggered", "remediation_check"]) {
      const res = await app.inject({
        method: "POST",
        url: "/internal/aml1/screening-requests/aml1req_unknown/rescreen",
        headers: { "x-internal-service-token": "test-aml1-internal-token-123" },
        payload: { trigger_reason, requested_by: "staff_1" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("Phase 3C: POST /internal/aml1/monitoring-runs requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/aml1/monitoring-runs", payload: { trigger_reason: "periodic_due", requested_by: "staff_1" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("Phase 3C: POST /internal/aml1/monitoring-runs rejects trigger_reason='manual' (monitoring runs never accept manual)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/aml1/monitoring-runs",
      headers: { "x-internal-service-token": "test-aml1-internal-token-123" },
      payload: { trigger_reason: "manual", requested_by: "staff_1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Phase 3C: GET /internal/aml1/risk-signals requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/aml1/risk-signals?actor_id=staff_1&subject_type=client_application&subject_ref=clt1app_1" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("Phase 3C: GET /internal/aml1/risk-signals rejects a request missing subject_type/subject_ref (no global unbounded dump)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/internal/aml1/risk-signals?actor_id=staff_1",
      headers: { "x-internal-service-token": "test-aml1-internal-token-123" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Phase 3C: POST /internal/aml1/risk-signals/:signal_id/acknowledge requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/aml1/risk-signals/aml1sig_unknown/acknowledge", payload: { actor_id: "staff_1" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("Phase 3D: GET /internal/aml1/screening-requests/stuck requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/aml1/screening-requests/stuck?actor_id=staff_1" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("Phase 3D: GET /internal/aml1/screening-requests/stuck rejects a request missing actor_id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/internal/aml1/screening-requests/stuck",
      headers: { "x-internal-service-token": "test-aml1-internal-token-123" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("Phase 3D: POST .../screening-requests/:id/recover requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/aml1/screening-requests/aml1req_unknown/recover",
      payload: { actor_id: "staff_1", reason_code: "process_crash_orphan" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("Phase 3D: POST .../screening-requests/:id/recover rejects a non-closed-set reason_code (no free text)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/aml1/screening-requests/aml1req_unknown/recover",
      headers: { "x-internal-service-token": "test-aml1-internal-token-123" },
      payload: { actor_id: "staff_1", reason_code: "something the operator typed" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("propagates/generates request-id and correlation-id headers on every response", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/aml1/health" });
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
