/**
 * KYC-01 app-level tests via app.inject — no database required. Mirrors tests/unit/
 * aml1-app.test.ts's shape: standard envelope, boot/no-Exchange-guard proof, the exact Phase
 * 0+1+2A+2B+3A+3B route surface, and correlation-header propagation. Every route's BEHAVIOUR
 * (against a real Postgres under `role_kyc1_runtime`) is covered by tests/integration/
 * kyc1-db.test.ts — this file only proves the app boots, the route surface is exactly what's
 * approved so far, validation rejects unknown fields, and readiness fails closed (503) when the DB
 * pool was never initialised.
 */
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Kyc1Config } from "../../services/kyc1/src/config.js";
import { buildApp } from "../../services/kyc1/src/server.js";

const config: Kyc1Config = {
  environment: "dev",
  databaseUrl: "postgres://unused:unused@localhost:5432/unused",
  internalServiceToken: "test-kyc1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-test",
  artifactHash: "sha256:test",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  kyc1InternalServiceToken: "test-kyc1-internal-token-123",
  clt1BaseUrl: "http://unused.invalid",
  clt1InternalServiceToken: "test-clt1-shared-token-unused",
  iam2BaseUrl: "http://unused.invalid",
  iam2InternalServiceToken: "test-iam2-shared-token-unused",
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(config);
});

afterAll(async () => {
  await app.close();
});

const internalHeaders = { "x-internal-service-token": "test-kyc1-internal-token-123" };

describe("KYC-01 service app (no DB) — Phase 0 + Phase 1 + Phase 2A scaffold", () => {
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
  // Phase 0+1+2A+2B+3A+3B+4A.2B route surface (17 routes) — captured directly from a running
  // `buildApp()`, not hand-transcribed. Re-captured for Phase 3B: `/cases/:case_id/outcome-
  // override/request` and `/.../apply` share the literal string prefix "outcome" with the
  // existing `/outcome` (GET) route in find-my-way's own radix trie, so Fastify's real router-tree
  // printer nests them as `-override/request`/`-override/apply` continuation lines UNDER the
  // `/outcome` line — this is genuine router-trie structure, not a test artefact, and holds
  // regardless of `commonPrefix: false` (that flag affects a different display concern). The
  // vertical-bar (`│`) continuation characters are likewise the installed Fastify version's own
  // real tree-drawing output — trust a fresh run over a stale array. Re-captured for Phase 4A.2B:
  // `/internal/kyc1/applications/:application_id/roster-sync` shares the
  // `/internal/kyc1/applications/:application_id/` prefix with the existing `publish-outcome`
  // route, so it nests as a sibling line under the same `:application_id` branch.
  const EXACT_ROUTE_TREE = [
    "├── /internal/kyc1/health (GET, HEAD)",
    "├── /internal/kyc1/handoffs (POST)",
    "├── /internal/kyc1/readiness (GET, HEAD)",
    "├── /internal/kyc1/cases (GET, HEAD)",
    "│   └── /:case_id (GET, HEAD)",
    "│       ├── /checklist (GET, HEAD)",
    "│       ├── /compute-outcome (POST)",
    "│       ├── /evidence (POST)",
    "│       ├── /verification-results (POST)",
    "│       └── /outcome (GET, HEAD)",
    "│           ├── -override/request (POST)",
    "│           └── -override/apply (POST)",
    "├── /internal/kyc1/checklist-items/:checklist_item_id/sensitive-detail (GET, HEAD)",
    "├── /internal/kyc1/applications/:application_id/publish-outcome (POST)",
    "├── /internal/kyc1/applications/:application_id/roster-sync (POST)",
    "└── /internal/kyc1/outcome-publications/:publication_id (GET, HEAD)",
    "└── /deliver (POST)",
  ];

  it("registers EXACTLY the frozen Phase 0+1+2A+2B+3A+3B+4A.2B route tree — an accidental extra route (not just a missing one) fails this test", () => {
    const routePaths = app
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(routePaths).toEqual(EXACT_ROUTE_TREE);
  });

  it("total KYC-01 route count is 17 (1 Phase 0 health + 9 Phase 1 routes + 2 Phase 2A routes + 1 Phase 2B route + 1 Phase 3A route + 2 Phase 3B routes + 1 Phase 4A.2B route)", () => {
    const routePaths = app
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const routeCount = routePaths.filter((l) => /\(.*\)$/.test(l)).length;
    expect(routeCount).toBe(17);
  });

  it("readiness route exists (Phase 1)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/kyc1/readiness" });
    expect(res.statusCode).toBe(503); // no DB pool initialised in this no-DB test file
    expect(res.json().data.status).toBe("not_ready");
  });

  it("no route is registered outside /internal/kyc1/* — no public /kyc1/* surface", () => {
    const routePaths = app
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");
    expect(routePaths).not.toMatch(/(^|\s)\/kyc1\//);
  });

  it("no forbidden business-capability route fragment anywhere in the route surface", () => {
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
      "vendor",
      "ubo",
      "biometric",
      "liveness",
    ]) {
      expect(routePaths).not.toContain(forbidden);
    }
  });

  it("GET /internal/kyc1/health returns the standard success envelope, unauthenticated", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/kyc1/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ status: "alive" });
  });

  it("POST /internal/kyc1/handoffs requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/handoffs",
      payload: { application_id: "clt1app_1", case_type: "individual" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/kyc1/handoffs rejects an unknown/additional body field (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/handoffs",
      headers: internalHeaders,
      payload: { application_id: "clt1app_1", case_type: "individual", not_a_real_field: "should be rejected" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/kyc1/handoffs rejects an invalid case_type enum value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/handoffs",
      headers: internalHeaders,
      payload: { application_id: "clt1app_1", case_type: "ubo" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /internal/kyc1/handoffs rejects a request missing application_id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/handoffs",
      headers: internalHeaders,
      payload: { case_type: "individual" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /internal/kyc1/cases/:id requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/kyc1/cases/kyc1case_unknown" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("GET /internal/kyc1/cases requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/kyc1/cases" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/kyc1/cases/:id/evidence requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/cases/kyc1case_unknown/evidence",
      payload: { document_type: "identity_document", evidence_ref: "ref-1" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/kyc1/cases/:id/verification-results rejects an invalid source_type (vendor is not accepted this phase)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/cases/kyc1case_unknown/verification-results",
      headers: internalHeaders,
      payload: { source_type: "vendor", source_id: "staff_1", result_type: "identity", result_status: "pass" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/kyc1/cases/:id/verification-results rejects an invalid result_status (inconclusive is not accepted this phase)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/cases/kyc1case_unknown/verification-results",
      headers: internalHeaders,
      payload: { source_type: "manual", source_id: "staff_1", result_type: "identity", result_status: "inconclusive" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/kyc1/cases/:id/compute-outcome requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/kyc1/cases/kyc1case_unknown/compute-outcome" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("GET /internal/kyc1/cases/:id/outcome requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/kyc1/cases/kyc1case_unknown/outcome" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/kyc1/applications/:id/publish-outcome requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/applications/clt1app_unknown/publish-outcome",
      payload: { requested_by: "staff_1" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/kyc1/applications/:id/publish-outcome rejects an unknown/additional body field (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/applications/clt1app_unknown/publish-outcome",
      headers: internalHeaders,
      payload: { requested_by: "staff_1", not_a_real_field: "should be rejected" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /internal/kyc1/outcome-publications/:id requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/kyc1/outcome-publications/kyc1pub_unknown" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/kyc1/outcome-publications/:id/deliver requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/outcome-publications/kyc1pub_unknown/deliver",
      payload: { requested_by: "staff_1" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/kyc1/outcome-publications/:id/deliver rejects an unknown/additional body field (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/outcome-publications/kyc1pub_unknown/deliver",
      headers: internalHeaders,
      payload: { requested_by: "staff_1", not_a_real_field: "should be rejected" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/kyc1/applications/:id/roster-sync requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/kyc1/applications/clt1app_unknown/roster-sync", payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/kyc1/applications/:id/roster-sync rejects an unknown/additional body field (additionalProperties: false — empty body only)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/applications/clt1app_unknown/roster-sync",
      headers: internalHeaders,
      payload: { not_a_real_field: "should be rejected" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /internal/kyc1/checklist-items/:id/sensitive-detail requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/internal/kyc1/checklist-items/kyc1item_unknown/sensitive-detail?actor_id=staff_1",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("GET /internal/kyc1/checklist-items/:id/sensitive-detail rejects a missing actor_id (400, VALIDATION_ERROR — never reaches IAM-02)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/internal/kyc1/checklist-items/kyc1item_unknown/sensitive-detail",
      headers: internalHeaders,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /internal/kyc1/checklist-items/:id/sensitive-detail rejects an unknown/additional query field (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/internal/kyc1/checklist-items/kyc1item_unknown/sensitive-detail?actor_id=staff_1&not_a_real_field=x",
      headers: internalHeaders,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/kyc1/cases/:id/outcome-override/request requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/cases/kyc1case_unknown/outcome-override/request",
      payload: { requested_by: "staff_1", target_outcome_status: "fail", reason_code: "manual_evidence_review" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/kyc1/cases/:id/outcome-override/request rejects an invalid target_outcome_status enum value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/cases/kyc1case_unknown/outcome-override/request",
      headers: internalHeaders,
      payload: { requested_by: "staff_1", target_outcome_status: "pending", reason_code: "manual_evidence_review" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/kyc1/cases/:id/outcome-override/request rejects an invalid reason_code (no free text accepted)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/cases/kyc1case_unknown/outcome-override/request",
      headers: internalHeaders,
      payload: { requested_by: "staff_1", target_outcome_status: "fail", reason_code: "because I said so" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/kyc1/cases/:id/outcome-override/request rejects an unknown/additional body field (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/cases/kyc1case_unknown/outcome-override/request",
      headers: internalHeaders,
      payload: { requested_by: "staff_1", target_outcome_status: "fail", reason_code: "manual_evidence_review", not_a_real_field: "x" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/kyc1/cases/:id/outcome-override/apply requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/cases/kyc1case_unknown/outcome-override/apply",
      payload: { override_id: "kyc1ovr_unknown", approval_id: "appr_1", decision_token: "tok_1" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/kyc1/cases/:id/outcome-override/apply rejects an unknown/additional body field (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/cases/kyc1case_unknown/outcome-override/apply",
      headers: internalHeaders,
      payload: { override_id: "kyc1ovr_unknown", approval_id: "appr_1", decision_token: "tok_1", not_a_real_field: "x" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/kyc1/cases/:id/outcome-override/apply rejects a request missing decision_token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/kyc1/cases/kyc1case_unknown/outcome-override/apply",
      headers: internalHeaders,
      payload: { override_id: "kyc1ovr_unknown", approval_id: "appr_1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("propagates/generates request-id and correlation-id headers on every response", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/kyc1/health" });
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
