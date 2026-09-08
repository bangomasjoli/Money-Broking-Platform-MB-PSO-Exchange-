/**
 * CLT-01 app-level tests via app.inject — no database required. Mirrors tests/unit/
 * cfg1-app.test.ts's shape: standard envelope, boot/no-Exchange-guard proof, the exact
 * Phase 0+1+2+3+4+5+6+8 route surface, and readiness's fail-closed-without-a-DB behaviour. Every
 * mutation/gate route's REAL behaviour (against a real Postgres, a stubbed CFG-01, and a
 * stubbed/real IAM-02) is covered by tests/integration/clt1-db.test.ts and
 * tests/integration/clt1-iam2-guard-real.test.ts — this file only proves the app boots, the route
 * surface is exactly what Phase 1+2+3+4+5+6+8 approved (still no public /clt1/* or Exchange-shaped
 * route, no sensitive authorised-party detail route, no duplicate-DETECTION/scoring/fuzzy-matching
 * or graph-traversal route, no lifecycle-history/client-portal route — Phase 6's own
 * manually-declared `duplicate-candidates` review routes and Phase 8's own
 * suspend/reactivate/close lifecycle routes are legitimate and expected, not forbidden — and
 * still no out-of-scope business route), validation rejects unknown fields, and readiness fails
 * closed (503) when the DB pool was never initialised, which is exactly this file's own no-DB
 * test setup.
 *
 * Phase 9 (closure/hardening) hardened the route-surface assertion from substring/`.toContain`
 * matching (which can only prove an EXPECTED route exists, never that an unexpected EXTRA route
 * is absent) to an exact frozen-tree equality check against a real `app.printRoutes()` capture —
 * see `EXACT_ROUTE_TREE` below.
 */
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Clt1Config } from "../../services/clt1/src/config.js";
import { buildApp } from "../../services/clt1/src/server.js";

const config: Clt1Config = {
  environment: "dev",
  databaseUrl: "postgres://unused:unused@localhost:5432/unused",
  internalServiceToken: "test-clt1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-test",
  artifactHash: "sha256:test",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  clt1InternalServiceToken: "test-clt1-internal-token-123",
  cfg1BaseUrl: "http://127.0.0.1:0",
  cfg1InternalServiceToken: "test-clt1-cfg1-token-unused",
  iam2BaseUrl: "http://127.0.0.1:0",
  iam2InternalServiceToken: "test-clt1-iam2-token-unused",
};

const internalHeaders = { "x-internal-service-token": "test-clt1-internal-token-123" };

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(config);
});

afterAll(async () => {
  await app.close();
});

describe("CLT-01 service app (no DB) — Phase 0 + Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5 + Phase 6 + Phase 8 + Phase 4A.2A scaffold", () => {
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

  // Phase 9 (+ Phase 4A, + Phase 4A.1, + Phase 4A.2A) — exact runtime route-set assertion
  // (hardened from the prior substring/`.toContain` style, which could not detect an accidental
  // EXTRA route, only a missing expected one). This is the exact, frozen output of
  // `app.printRoutes({ commonPrefix: false })` for the approved Phase 0+1+2+3+4+5+6+8+4A.2A route
  // surface — any added, removed, or method-changed route fails this test. Captured directly from
  // a real `buildApp()` run, not hand-transcribed from source.
  const EXACT_ROUTE_TREE = [
    "├── /internal/clt1/health (GET, HEAD)",
    "├── /internal/clt1/readiness (GET, HEAD)",
    "├── /internal/clt1/related-party-edges/add/request (POST)",
    "├── /internal/clt1/related-party-edges/add/apply (POST)",
    "├── /internal/clt1/related-party-edges/:related_party_edge_id/update/request (POST)",
    "├── /internal/clt1/related-party-edges/:related_party_edge_id/update/apply (POST)",
    "├── /internal/clt1/related-party-edges/:related_party_edge_id/remove/request (POST)",
    "├── /internal/clt1/related-party-edges/:related_party_edge_id/remove/apply (POST)",
    "├── /internal/clt1/applications (POST)",
    "│   └── /:application_id (PATCH, GET, HEAD)",
    "│       ├── /classification-evidence (POST)",
    "│       ├── /consents (POST)",
    "│       ├── /cancel (POST)",
    "│       ├── /submit (POST)",
    "│       ├── /start-review (POST)",
    "│       ├── /outcomes (POST)",
    "│       ├── /outcome-status (GET, HEAD)",
    "│       ├── /handoff/kyc-kyb (POST)",
    "│       ├── /handoff/aml (POST)",
    "│       ├── /handoff-status (GET, HEAD)",
    "│       ├── /hold (POST)",
    "│       ├── /approve/request (POST)",
    "│       ├── /approve/apply (POST)",
    // Phase 4A.2A — application-keyed pre-approval authorised-party capture. Deliberately
    // excludes activate/restrict/reject/suspend (out of this phase's scope — see
    // routes/application-authorised-parties.ts's own header comment).
    "│       ├── /authorised-parties (GET, HEAD)",
    "│       │   ├── /add/request (POST)",
    "│       │   ├── /add/apply (POST)",
    "│       │   ├── /:authorised_party_id/update/request (POST)",
    "│       │   ├── /:authorised_party_id/update/apply (POST)",
    "│       │   ├── /:authorised_party_id/remove/request (POST)",
    "│       │   ├── /:authorised_party_id/remove/apply (POST)",
    "│       │   └── /:authorised_party_id/screening-outcome (POST)",
    "│       ├── /reject (POST)",
    "│       ├── /duplicate-candidates (GET, HEAD)",
    // Phase 4A — the application-keyed KYC roster contract. The ONLY route Phase 4A adds.
    "│       └── /kyc-roster (GET, HEAD)",
    "├── /internal/clt1/clients/:client_id/status (GET, HEAD)",
    "├── /internal/clt1/clients/:client_id/suspend/request (POST)",
    "├── /internal/clt1/clients/:client_id/suspend/apply (POST)",
    "├── /internal/clt1/clients/:client_id/related-parties (GET, HEAD)",
    "├── /internal/clt1/clients/:client_id/reactivate/request (POST)",
    "├── /internal/clt1/clients/:client_id/reactivate/apply (POST)",
    "├── /internal/clt1/clients/:client_id/authorised-users (GET, HEAD)",
    "│   ├── /add/request (POST)",
    "│   ├── /add/apply (POST)",
    "│   ├── /:authorised_user_id/remove/request (POST)",
    "│   ├── /:authorised_user_id/remove/apply (POST)",
    "│   ├── /:authorised_user_id/reactivate (POST)",
    "│   └── /:authorised_user_id/suspend (POST)",
    "├── /internal/clt1/clients/:client_id/authorised-parties (GET, HEAD)",
    "│   ├── /add/request (POST)",
    "│   ├── /add/apply (POST)",
    // P-ROSTER (WLT-01 Phase 4A prerequisite) — machine-to-machine active authorised_party_id
    // reference seam, no actor_id, no IAM-02 permission. See routes/authorised-parties.ts's own
    // header comment on this route.
    "│   ├── /active-refs (GET, HEAD)",
    "│   ├── /:authorised_party_id/update/request (POST)",
    "│   ├── /:authorised_party_id/update/apply (POST)",
    "│   ├── /:authorised_party_id/remove/request (POST)",
    "│   ├── /:authorised_party_id/remove/apply (POST)",
    "│   ├── /:authorised_party_id/restrict (POST)",
    "│   ├── /:authorised_party_id/reject (POST)",
    "│   ├── /:authorised_party_id/activate/request (POST)",
    "│   ├── /:authorised_party_id/activate/apply (POST)",
    "│   ├── /:authorised_party_id/suspend (POST)",
    "│   └── /:authorised_party_id/screening-outcome (POST)",
    "├── /internal/clt1/clients/:client_id/mandates/create/request (POST)",
    "├── /internal/clt1/clients/:client_id/mandates/create/apply (POST)",
    "├── /internal/clt1/clients/:client_id/mandates/current (GET, HEAD)",
    "├── /internal/clt1/clients/:client_id/mandates/:mandate_id/update/request (POST)",
    "├── /internal/clt1/clients/:client_id/mandates/:mandate_id/update/apply (POST)",
    "├── /internal/clt1/clients/:client_id/duplicate-candidates (GET, HEAD)",
    "├── /internal/clt1/clients/:client_id/close/request (POST)",
    "├── /internal/clt1/clients/:client_id/close/apply (POST)",
    // Authenticated Principal -> Client Membership Authority (frozen architecture) — the ONE
    // route this phase adds. Internal-only, read-only resolution seam; no public /clt1/* route.
    "├── /internal/clt1/principals/:iam_user_id/client-memberships (GET, HEAD)",
    "├── /internal/clt1/duplicate-candidates/create/request (POST)",
    "├── /internal/clt1/duplicate-candidates/create/apply (POST)",
    "├── /internal/clt1/duplicate-candidates/:duplicate_candidate_id/update/request (POST)",
    "├── /internal/clt1/duplicate-candidates/:duplicate_candidate_id/update/apply (POST)",
    "├── /internal/clt1/duplicate-candidates/:duplicate_candidate_id/confirm/request (POST)",
    "├── /internal/clt1/duplicate-candidates/:duplicate_candidate_id/confirm/apply (POST)",
    "├── /internal/clt1/duplicate-candidates/:duplicate_candidate_id/dismiss/request (POST)",
    "└── /internal/clt1/duplicate-candidates/:duplicate_candidate_id/dismiss/apply (POST)",
  ];

  it("registers EXACTLY the frozen Phase 0+1+2+3+4+5+6+8 route tree — an accidental extra route (not just a missing expected one) now fails this test", () => {
    const routePaths = app
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(routePaths).toEqual(EXACT_ROUTE_TREE);
  });

  it("status route and both lifecycle routes are present and internal-only", () => {
    const joined = EXACT_ROUTE_TREE.join("\n");
    expect(joined).toContain("/internal/clt1/clients/:client_id/status (GET, HEAD)");
    expect(joined).toContain("/internal/clt1/clients/:client_id/suspend/request (POST)");
    expect(joined).toContain("/internal/clt1/clients/:client_id/suspend/apply (POST)");
    expect(joined).toContain("/internal/clt1/clients/:client_id/reactivate/request (POST)");
    expect(joined).toContain("/internal/clt1/clients/:client_id/reactivate/apply (POST)");
    expect(joined).toContain("/internal/clt1/clients/:client_id/close/request (POST)");
    expect(joined).toContain("/internal/clt1/clients/:client_id/close/apply (POST)");
    for (const line of EXACT_ROUTE_TREE) {
      expect(line.includes("/internal/clt1/") || !line.match(/\/internal\//)).toBe(true);
    }
  });

  it("no forbidden route fragment anywhere in the route surface (defense-in-depth alongside the exact-set assertion above)", () => {
    const joined = EXACT_ROUTE_TREE.join("\n").toLowerCase();
    for (const forbidden of [
      "mandate-check",
      "duplicate-detection",
      "duplicate-scoring",
      "fuzzy-match",
      "needs-more-info",
      "needs_more_info",
      "beneficial-ownership",
      "ubo-graph",
      "identity-graph",
      "data-protection",
      "evidence-exports",
      "sensitive-detail",
      "lifecycle-history",
      "client-portal",
      "order-book",
      "orderbook",
      "matching",
      "market-making",
      // "principal" alone is NOT listed here: it collides with the legitimate Authenticated
      // Principal -> Client Membership Authority route (`/internal/clt1/principals/...`), an
      // IAM/security identity concept unrelated to the market-microstructure "principal trading"
      // concept this guard exists to catch.
      "principal-trading",
      "spread",
      "trading",
      "execution",
      "kyc-engine",
      "aml-engine",
      "sanctions-screen",
      "wallet",
      "deposit",
      "withdrawal",
      "settlement",
      "exchange",
    ]) {
      expect(joined).not.toContain(forbidden);
    }
  });

  it("no route is registered outside /internal/clt1/* — no public /clt1/* surface (Design Issue 2)", () => {
    const routePaths = app
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");
    expect(routePaths).not.toMatch(/(^|\s)\/clt1\//);
  });

  it("GET /internal/clt1/health returns the standard success envelope, unauthenticated", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/clt1/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ status: "alive" });
  });

  it("GET /internal/clt1/readiness fails closed (503, not_ready) when the DB pool was never initialised — unauthenticated, like health", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/clt1/readiness" });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.data.status).toBe("not_ready");
    expect(body.data.checks[0]).toMatchObject({ scope: "database", status: "fail" });
  });

  it("propagates/generates request-id and correlation-id headers on every response", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/clt1/health" });
    expect(typeof res.headers["x-request-id"]).toBe("string");
    expect(typeof res.headers["x-correlation-id"]).toBe("string");
  });

  it("404s with the standard envelope for an unknown route", async () => {
    const res = await app.inject({ method: "GET", url: "/no-such-route" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
    expect(res.json().success).toBe(false);
  });

  it("POST /internal/clt1/applications requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/clt1/applications",
      payload: { applicant_type: "corporate", legal_name: "Test Co", client_class_claimed: "institutional", created_by: "user_1" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/clt1/applications rejects an unknown/additional body field (additionalProperties: false, removeAdditional: false override)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/clt1/applications",
      headers: internalHeaders,
      payload: {
        applicant_type: "corporate",
        legal_name: "Test Co",
        client_class_claimed: "institutional",
        created_by: "user_1",
        not_a_real_field: "should be rejected, not silently stripped",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/clt1/applications rejects an invalid client_class_claimed enum value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/clt1/applications",
      headers: internalHeaders,
      payload: { applicant_type: "corporate", legal_name: "Test Co", client_class_claimed: "not_a_real_class", created_by: "user_1" },
    });
    expect(res.statusCode).toBe(400);
  });
});
