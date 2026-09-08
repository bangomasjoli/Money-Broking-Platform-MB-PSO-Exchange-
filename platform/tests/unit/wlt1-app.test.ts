/**
 * WLT-01 app-level tests via app.inject — no database required. Mirrors tests/unit/
 * aml1-app.test.ts's / tests/unit/clt1-app.test.ts's own shape: standard envelope,
 * boot/no-Exchange-guard proof, the exact frozen route surface, and correlation-header
 * propagation. Every route's BEHAVIOUR (against a real Postgres under `role_wlt1_runtime`) is
 * covered by tests/integration/wlt1-db.test.ts — this file only proves the app boots, the route
 * surface is exactly what's approved so far, and unauthenticated/validation edges behave.
 */
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp, WLT1_LOG_REDACT_PATHS } from "../../services/wlt1/src/server.js";

const config: Wlt1Config = {
  environment: "dev",
  databaseUrl: "postgres://unused:unused@localhost:5432/unused",
  internalServiceToken: "test-wlt1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-test",
  artifactHash: "sha256:test",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  wlt1InternalServiceToken: "test-wlt1-internal-token-123",
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
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(config);
});

afterAll(async () => {
  await app.close();
});

describe("WLT-01 service app (no DB) — Phase 1B scaffold", () => {
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
  // Phase 3A-3 + Phase 4A-1 + Phase 4A-2 + Phase 4A-3 + Phase 4B + Destination Revocation +
  // Ongoing Rescreening route surface (17 declared handlers; Fastify auto-adds HEAD for every
  // GET) — captured directly from a running `buildApp()`, not hand-transcribed. Phase 3B (TRON)
  // added no new route, only widened the persisted `verification_scheme` CHECK a migration
  // governs. Phase 4A-1 added exactly two new top-level routes,
  // `/destinations/:destination_id/approve/request` and `/destinations/:destination_id/
  // approve/apply`. Phase 4A-2 added exactly ONE new top-level route,
  // `/destinations/:destination_id/evaluate-use`. Phase 4A-3 added exactly ONE new top-level
  // route, `/destination-decisions/:decision_id/verify` (read-only). Phase 4B added exactly ONE
  // new route, `/destination-decisions/:decision_id/verify-and-consume` — Fastify's own radix
  // tree renders it as a NESTED child of `/verify` (shared path prefix `/destination-decisions/
  // :decision_id/verify`, `-and-consume` is the remaining suffix), not a sibling top-level entry.
  // The Destination Revocation phase added exactly TWO new top-level routes,
  // `/destinations/:destination_id/revoke` and `/aml-revocations`. Ongoing Rescreening adds
  // exactly ONE new top-level route, `/rescreening-runs` — Fastify's own radix tree places it
  // BEFORE `/wallet-destinations` (not after `/aml-revocations` in registration order), exactly
  // why this tree is captured live, never hand-transcribed. Evidence Export added exactly FOUR
  // routes — `/evidence-exports/request` (top-level sibling) and `/evidence-exports/:export_id`
  // (GET/HEAD, with `/apply` and `/download` as nested children). Inbound-Source Screening adds
  // exactly ONE new top-level route, `/inbound-source-screenings`, registered LAST — this pushes
  // `/evidence-exports/:export_id` off the "last top-level entry" position, which changes ITS OWN
  // previously-unindented `/apply`/`/download` children to gain a `│   ` prefix (Fastify's
  // radix-tree rendering is position-dependent, not purely structural) — exactly why this tree is
  // captured live rather than hand-edited incrementally. Stuck-Screening Operational Closure adds
  // exactly TWO new routes — `GET /internal/wlt1/stuck-screenings` (top-level, now registered
  // LAST) and `POST /internal/wlt1/stuck-screenings/:screening_result_id/recover` (rendered as its
  // own nested child, sharing the `/stuck-screenings` prefix) — which in turn pushes
  // `/inbound-source-screenings` off the "last top-level entry" position, changing ITS OWN branch
  // marker from `└──` to `├──` (captured live, same rationale as above). NO release, NO LED route
  // (both remain LED-01, still blocked pending independent WLT-01-complete + Phase 4B acceptance).
  const EXACT_ROUTE_TREE = [
    "├── /internal/wlt1/health (GET, HEAD)",
    "├── /internal/wlt1/readiness (GET, HEAD)",
    "├── /internal/wlt1/rescreening-runs (POST)",
    "├── /internal/wlt1/wallet-destinations (POST)",
    "│   └── /:destination_id (GET, HEAD)",
    "│       ├── /screen (POST)",
    "│       └── /proof-of-control (GET, HEAD)",
    "│           ├── /challenges (POST)",
    "│           └── /verify (POST)",
    "├── /internal/wlt1/provider-results/receipt (POST)",
    "├── /internal/wlt1/payout-destinations (POST)",
    "│   └── /:destination_id (GET, HEAD)",
    "│       └── /assess (POST)",
    "├── /internal/wlt1/destinations/:destination_id/approve/request (POST)",
    "├── /internal/wlt1/destinations/:destination_id/approve/apply (POST)",
    "├── /internal/wlt1/destinations/:destination_id/evaluate-use (POST)",
    "├── /internal/wlt1/destinations/:destination_id/revoke (POST)",
    "├── /internal/wlt1/destination-decisions/:decision_id/verify (POST)",
    "│   └── -and-consume (POST)",
    "├── /internal/wlt1/aml-revocations (POST)",
    "├── /internal/wlt1/evidence-exports/request (POST)",
    "├── /internal/wlt1/evidence-exports/:export_id (GET, HEAD)",
    "│   ├── /apply (POST)",
    "│   └── /download (GET, HEAD)",
    "├── /internal/wlt1/inbound-source-screenings (POST)",
    "└── /internal/wlt1/stuck-screenings (GET, HEAD)",
    "└── /:screening_result_id/recover (POST)",
  ];

  it("registers EXACTLY the frozen Phase 3A-3 + Phase 4A-1 + Phase 4A-2 + Phase 4A-3 + Phase 4B + Destination Revocation + Ongoing Rescreening + Evidence Export + Inbound-Source Screening + Stuck-Screening Operational Closure route tree — an accidental extra route (not just a missing one) fails this test", () => {
    const routePaths = app
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(routePaths).toEqual(EXACT_ROUTE_TREE);
  });

  it("no decision-release/vendor-result route exists this phase, and the REJECTED /inbound-sources/screen SHAPE (a different, never-approved path) still 404s even though inbound-source screening ITSELF is now approved at its own frozen path (screening initiation itself IS now approved — Phase 2C-C2; AML revocation ingestion IS now approved — Destination Revocation phase; ongoing rescreening IS now approved at its own frozen path — asserted present separately below, NOT at the rejected /rescreening/run or /rescreening/trigger shapes; the internal payout-destinations surface IS now approved — Fiat Payout Destinations (APAC) phase — asserted present separately below; the internal evidence-exports surface IS now approved — Evidence Export phase — asserted present separately below; the internal inbound-source-screenings surface IS now approved — Inbound-Source Screening phase — asserted present separately below at its own EXACT path `/internal/wlt1/inbound-source-screenings`, distinct from the rejected `/inbound-sources/screen` shape below; only the PUBLIC /wlt1/payout-destinations and /wlt1/evidence-exports surfaces remain rejected)", async () => {
    const businessPaths = [
      "/internal/wlt1/destination-decisions/dec_1/release",
      "/internal/wlt1/vendor-results/wallet",
      "/internal/wlt1/vendor-results/bank",
      "/internal/wlt1/inbound-sources/screen",
      "/internal/wlt1/rescreening/run",
      "/internal/wlt1/rescreening/trigger",
      "/wlt1/wallet-destinations",
      "/wlt1/payout-destinations",
      "/wlt1/evidence-exports",
    ];
    for (const url of businessPaths) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, `expected 404 for ${url}`).toBe(404);
      const resPost = await app.inject({ method: "POST", url });
      expect(resPost.statusCode, `expected 404 for POST ${url}`).toBe(404);
    }
  });

  it("POST /internal/wlt1/wallet-destinations/:destination_id/screen exists (Phase 2C-C2) and requires the internal-service-token (401 without it, never 404) — body schema validates BEFORE the auth preHandler, so an empty {} body is required to reach it", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown/screen", payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("no vendor-result/resume/approve/revoke/whitelist/execution route exists this phase (Phase 2C-D2/D3+ scope — Phase 2C-D1 itself adds ONLY the generic receipt-ingress route asserted separately below)", async () => {
    const notYetPaths = [
      "/internal/wlt1/vendor-results/wallet",
      "/internal/wlt1/wallet-destinations/wlt1dest_unknown/screen/resume",
      "/internal/wlt1/wallet-destinations/wlt1dest_unknown/approve",
      "/internal/wlt1/wallet-destinations/wlt1dest_unknown/revoke",
    ];
    for (const url of notYetPaths) {
      const res = await app.inject({ method: "POST", url });
      expect(res.statusCode, `expected 404 for ${url}`).toBe(404);
    }
  });

  // -----------------------------------------------------------------------------------------
  // Phase 3A-3 — the signature-verification submission route now exists.
  // -----------------------------------------------------------------------------------------
  it("POST .../proof-of-control/verify exists (Phase 3A-3) and requires the internal-service-token (401 without it, never 404) — body schema validates BEFORE the auth preHandler, so a valid body is required to reach it", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control/verify",
      payload: { client_id: "clt1client_1", challenge_id: "wlt1poc_1", signature: "0x" + "ab".repeat(65) },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST .../proof-of-control/verify rejects an unknown/additional body field (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control/verify",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { client_id: "clt1client_1", challenge_id: "wlt1poc_1", signature: "0x" + "ab".repeat(65), extra: "x" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST .../proof-of-control/verify rejects a malformed signature (wrong length / missing 0x / non-hex) BEFORE authentication — schema validation runs before the preHandler auth guard", async () => {
    for (const badSignature of ["0x" + "ab".repeat(64), "0x" + "ab".repeat(66), "ab".repeat(65), "0x" + "zz".repeat(65), "0x" + "AB".repeat(65).slice(0, -1)]) {
      const res = await app.inject({
        method: "POST",
        url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control/verify",
        payload: { client_id: "clt1client_1", challenge_id: "wlt1poc_1", signature: badSignature },
      });
      expect(res.statusCode, `expected 400 for signature ${badSignature}`).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("POST .../proof-of-control/verify accepts uppercase hex in the signature field at the schema level (case-insensitive pattern)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control/verify",
      payload: { client_id: "clt1client_1", challenge_id: "wlt1poc_1", signature: "0x" + "AB".repeat(65) },
    });
    // Schema accepts it (uppercase hex is valid grammar); falls through to auth, which fails.
    expect(res.statusCode).toBe(401);
  });

  it("POST /internal/wlt1/wallet-destinations/:destination_id/proof-of-control/challenges exists (Phase 3A-2) and requires the internal-service-token (401 without it, never 404) — body schema validates BEFORE the auth preHandler, so a valid client_id body is required to reach it", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control/challenges",
      payload: { client_id: "clt1client_1" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST .../proof-of-control/challenges rejects an unknown/additional body field (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control/challenges",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-poc-1" },
      payload: { client_id: "clt1client_1", nonce: "should-be-rejected-not-stripped" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  // This app instance has no initialised DB pool — assertPoolAvailable() (mirroring every other
  // WLT-01 mutating route) fails closed with WLT1_SERVICE_UNAVAILABLE before the Idempotency-Key
  // check is ever reached; the missing-key case itself is covered against a real DB in
  // tests/integration/wlt1-proof-of-control-route.test.ts.
  it("POST .../proof-of-control/challenges fails closed (503) with no DB pool initialised, after authentication succeeds", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control/challenges",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { client_id: "clt1client_1" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("WLT1_SERVICE_UNAVAILABLE");
  });

  it("GET /internal/wlt1/wallet-destinations/:destination_id/proof-of-control exists (Phase 3A-2) and requires the internal-service-token (401 without it, never 404)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control?client_id=clt1client_1" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("GET .../proof-of-control requires the client_id query parameter (rejects an unknown/additional querystring field too)", async () => {
    const missing = await app.inject({
      method: "GET",
      url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
    });
    expect(missing.statusCode).toBe(400);
    const extra = await app.inject({
      method: "GET",
      url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control?client_id=clt1client_1&extra=x",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
    });
    expect(extra.statusCode).toBe(400);
  });

  it("POST /internal/wlt1/provider-results/receipt exists (Phase 2C-D1) and requires provider-receipt authentication (401 without x-wlt1-provider-id/x-wlt1-provider-receipt-token, never 404, never the generic x-internal-service-token guard)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/provider-results/receipt",
      payload: { screening_reference_id: "wlt1screen_unknown", provider_result_id: "presult_unknown", result: {} },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");

    // The generic x-internal-service-token header (this app's OTHER routes' own auth) must NOT
    // satisfy this route's dedicated provider-receipt guard — proves the two auth mechanisms are
    // genuinely distinct, not an accidental shared fallback.
    const resWithWrongAuth = await app.inject({
      method: "POST",
      url: "/internal/wlt1/provider-results/receipt",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { screening_reference_id: "wlt1screen_unknown", provider_result_id: "presult_unknown", result: {} },
    });
    expect(resWithWrongAuth.statusCode).toBe(401);
  });

  it("no route is registered outside /internal/wlt1/* — no public /wlt1/* surface", () => {
    const routePaths = app
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");
    expect(routePaths).not.toMatch(/(^|\s)\/wlt1\//);
  });

  // "approve" was REMOVED from this forbidden list — Phase 4A-1 (destination whitelist
  // maker-checker approval) is now an authorized, accepted-into-scope route fragment
  // (`.../approve/request`, `.../approve/apply`). "verify-and-consume" was REMOVED — Phase 4B
  // (single-use destination-authority consumption) is now authorized. "revoke"/"aml-revocation"
  // were REMOVED — the Destination Revocation phase (immediate operator containment + AML
  // risk-signal ingestion) is now authorized. "rescreening" was REMOVED — Ongoing Rescreening
  // (periodic due-based + operator-forced single-destination rescreening) is now authorized, at
  // its own frozen `/rescreening-runs` path (asserted present separately below). "payout-
  // destination" was REMOVED — Fiat Payout Destinations (APAC) is now an authorized,
  // accepted-into-scope route fragment (`/payout-destinations`, asserted present separately
  // below). "evidence-export" was REMOVED — Evidence Export is now an authorized,
  // accepted-into-scope route fragment (`/evidence-exports`, asserted present separately below);
  // only the PUBLIC `/wlt1/evidence-exports` surface remains forbidden, asserted by the dedicated
  // public-surface test above. Every other later-phase fragment below remains forbidden; LED-01
  // routes are asserted absent by name in a dedicated test.
  it("no forbidden later-phase business-capability route fragment anywhere in the route surface", () => {
    const routePaths = app.printRoutes({ commonPrefix: false }).toLowerCase();
    for (const forbidden of [
      "exchange",
      "order-book",
      "orderbook",
      "matching",
      "market-making",
      "principal",
      "spread",
      "release",
      "vendor-result",
    ]) {
      expect(routePaths).not.toContain(forbidden);
    }
  });

  it("GET /internal/wlt1/health returns the standard success envelope, unauthenticated", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ status: "alive", module: "WLT-01" });
  });

  it("GET /internal/wlt1/health does not disclose the internal service token or database configuration", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/health" });
    const raw = JSON.stringify(res.json());
    expect(raw).not.toContain(config.wlt1InternalServiceToken);
    expect(raw).not.toContain(config.databaseUrl);
    expect(raw).not.toContain(config.clt1InternalServiceToken);
  });

  it("GET /internal/wlt1/readiness is unauthenticated and fails closed (503) without an initialised DB pool", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/readiness" });
    expect(res.statusCode).toBe(503);
    expect(res.json().data.status).toBe("not_ready");
  });

  it("POST /internal/wlt1/wallet-destinations requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/wallet-destinations",
      payload: {
        client_id: "clt1client_1",
        chain: "ethereum",
        network: "mainnet",
        address: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
        wallet_type: "unknown",
        beneficiary_relationship: "self",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/wlt1/wallet-destinations rejects an unknown/additional body field (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/wallet-destinations",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-1" },
      payload: {
        client_id: "clt1client_1",
        chain: "ethereum",
        network: "mainnet",
        address: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
        wallet_type: "unknown",
        beneficiary_relationship: "self",
        not_a_real_field: "should be rejected, not silently stripped",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/wlt1/wallet-destinations rejects an invalid wallet_type enum value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/wallet-destinations",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-2" },
      payload: {
        client_id: "clt1client_1",
        chain: "ethereum",
        network: "mainnet",
        address: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
        wallet_type: "not_a_real_type",
        beneficiary_relationship: "self",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /internal/wlt1/wallet-destinations rejects an uppercase chain/network identifier (canonical lower-case only)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/wallet-destinations",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-3" },
      payload: {
        client_id: "clt1client_1",
        chain: "Ethereum",
        network: "mainnet",
        address: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
        wallet_type: "unknown",
        beneficiary_relationship: "self",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /internal/wlt1/wallet-destinations/:destination_id requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("propagates/generates request-id and correlation-id headers on every response", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/health" });
    expect(typeof res.headers["x-request-id"]).toBe("string");
    expect(typeof res.headers["x-correlation-id"]).toBe("string");
  });

  it("404s with the standard envelope for an unknown route", async () => {
    const res = await app.inject({ method: "GET", url: "/no-such-route" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
    expect(res.json().success).toBe(false);
  });

  it("buildApp + the health route never call global fetch — the health route itself makes no external HTTP call", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("fetch must never be called by the health route");
    }) as typeof fetch;
    try {
      const scratchApp = await buildApp(config);
      const res = await scratchApp.inject({ method: "GET", url: "/internal/wlt1/health" });
      expect(res.statusCode).toBe(200);
      await scratchApp.close();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // -----------------------------------------------------------------------------------------
  // Phase 2C-D1: the provider-receipt secret must never reach a log line, same rationale as
  // x-internal-service-token above. Asserted against the exported WLT1_LOG_REDACT_PATHS constant
  // directly (mirrors tests/unit/cfg1-log-redaction.test.ts's own identical technique) rather than
  // introspecting pino's internal logger instance.
  // -----------------------------------------------------------------------------------------
  it("WLT1_LOG_REDACT_PATHS includes the provider-receipt token header (Phase 2C-D1)", () => {
    expect(WLT1_LOG_REDACT_PATHS).toContain("req.headers['x-wlt1-provider-receipt-token']");
  });

  it("WLT1_LOG_REDACT_PATHS still includes every pre-existing redaction path — the Phase 2C-D1/4A-1 additions did not replace or drop any prior entry", () => {
    expect(WLT1_LOG_REDACT_PATHS).toEqual(
      expect.arrayContaining([
        "req.headers['x-internal-service-token']",
        "req.body.address",
        "req.body.memo_tag",
        "req.headers['x-wlt1-provider-receipt-token']",
        "req.body.decision_token",
        "req.body.account_identifier",
        "req.body.beneficiary_name",
      ]),
    );
    expect(WLT1_LOG_REDACT_PATHS).toHaveLength(7);
  });

  it("WLT1_LOG_REDACT_PATHS includes the Phase 4A-1 decision-token body field (never logged)", () => {
    expect(WLT1_LOG_REDACT_PATHS).toContain("req.body.decision_token");
  });

  // -----------------------------------------------------------------------------------------
  // Phase 4A-1 — auth boundary + Phase 4A-2/4A-3/4B/LED absence proofs.
  // -----------------------------------------------------------------------------------------
  it("POST .../destinations/:destination_id/approve/request requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/wlt1/destinations/wlt1dest_unknown/approve/request", payload: { actor_id: "staff_1", client_id: "clt1client_1" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST .../destinations/:destination_id/approve/apply requires the internal-service-token (401 without it)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/destinations/wlt1dest_unknown/approve/apply",
      payload: { actor_id: "staff_1", client_id: "clt1client_1", approval_id: "iam2appr_1", decision_token: "tok_1" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST .../destinations/:destination_id/evaluate-use exists (Phase 4A-2) and requires the internal-service-token (401 without it, never 404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/destinations/wlt1dest_unknown/evaluate-use",
      payload: { client_id: "clt1client_1", requested_action: "destination_use", caller_module: "TEST-CALLER", amount: "40", asset_or_currency: "ETH" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST .../destinations/:destination_id/evaluate-use rejects an unknown/additional body field (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/destinations/wlt1dest_unknown/evaluate-use",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { client_id: "clt1client_1", requested_action: "destination_use", caller_module: "TEST-CALLER", amount: "40", asset_or_currency: "ETH", extra: "x" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST .../destinations/:destination_id/evaluate-use requires amount and asset_or_currency (400 when either is absent); amount grammar/asset grammar are enforced (the separate '>0' business rule, which requires a DB pool to reach, is covered against a real database in the integration suite)", async () => {
    const base = { client_id: "clt1client_1", requested_action: "destination_use", caller_module: "TEST-CALLER" };
    for (const payload of [
      { ...base, asset_or_currency: "ETH" },
      { ...base, amount: "40" },
      { ...base, amount: "40", asset_or_currency: "eth" },
      { ...base, amount: "1.1234567890123456789", asset_or_currency: "ETH" },
    ]) {
      const res = await app.inject({ method: "POST", url: "/internal/wlt1/destinations/wlt1dest_unknown/evaluate-use", headers: { "x-internal-service-token": config.wlt1InternalServiceToken }, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("POST .../destination-decisions/:decision_id/verify exists (Phase 4A-3) and requires the internal-service-token (401 without it, never 404) — no actor_id/IAM-02 field in the body at all", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/destination-decisions/wlt1dec_unknown/verify",
      payload: { decision_token: "wlt1dt_" + "a".repeat(43), client_id: "clt1client_1", destination_id: "wlt1dest_1", requested_action: "destination_use" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST .../destination-decisions/:decision_id/verify rejects an unknown/additional body field (additionalProperties: false) — e.g. a caller-supplied actor_id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/destination-decisions/wlt1dec_unknown/verify",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { decision_token: "wlt1dt_" + "a".repeat(43), client_id: "clt1client_1", destination_id: "wlt1dest_1", requested_action: "destination_use", actor_id: "staff_1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST .../destination-decisions/:decision_id/verify-and-consume exists (Phase 4B) and requires the internal-service-token (401 without it, never 404) — no actor_id/IAM-02 field in the body at all", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/destination-decisions/wlt1dec_unknown/verify-and-consume",
      payload: {
        decision_token: "wlt1dt_" + "a".repeat(43),
        client_id: "clt1client_1",
        destination_id: "wlt1dest_1",
        requested_action: "destination_use",
        execution_ref: "exec_1",
        caller_module: "WDR-01",
        amount: "40",
        asset_or_currency: "ETH",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST .../destination-decisions/:decision_id/verify-and-consume rejects an unknown/additional body field (additionalProperties: false) — e.g. a caller-supplied actor_id or consumption_id", async () => {
    const base = {
      decision_token: "wlt1dt_" + "a".repeat(43),
      client_id: "clt1client_1",
      destination_id: "wlt1dest_1",
      requested_action: "destination_use",
      execution_ref: "exec_1",
      caller_module: "WDR-01",
      amount: "40",
      asset_or_currency: "ETH",
    };
    for (const extra of [{ actor_id: "staff_1" }, { consumption_id: "wlt1con_" + "a".repeat(36) }]) {
      const res = await app.inject({
        method: "POST",
        url: "/internal/wlt1/destination-decisions/wlt1dec_unknown/verify-and-consume",
        headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
        payload: { ...base, ...extra },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("POST .../destination-decisions/:decision_id/verify-and-consume requires execution_ref (400 when absent)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/destination-decisions/wlt1dec_unknown/verify-and-consume",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { decision_token: "wlt1dt_" + "a".repeat(43), client_id: "clt1client_1", destination_id: "wlt1dest_1", requested_action: "destination_use", caller_module: "WDR-01", amount: "40", asset_or_currency: "ETH" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST .../destination-decisions/:decision_id/verify-and-consume requires amount and asset_or_currency (400 when either is absent; the separate '>0' business rule requires a DB pool to reach and is covered against a real database in the integration suite)", async () => {
    const base = { decision_token: "wlt1dt_" + "a".repeat(43), client_id: "clt1client_1", destination_id: "wlt1dest_1", requested_action: "destination_use", execution_ref: "exec_1", caller_module: "WDR-01" };
    for (const payload of [
      { ...base, asset_or_currency: "ETH" },
      { ...base, amount: "40" },
    ]) {
      const res = await app.inject({ method: "POST", url: "/internal/wlt1/destination-decisions/wlt1dec_unknown/verify-and-consume", headers: { "x-internal-service-token": config.wlt1InternalServiceToken }, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  // -----------------------------------------------------------------------------------------
  // Destination Revocation + AML Revocation Signal Ingestion — auth boundary + schema edges.
  // -----------------------------------------------------------------------------------------
  it("POST .../destinations/:destination_id/revoke exists and requires the internal-service-token (401 without it, never 404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/destinations/wlt1dest_unknown/revoke",
      payload: { client_id: "clt1client_1", actor_id: "staff_1", reason_code: "compromise" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST .../destinations/:destination_id/revoke rejects an unknown/additional body field (additionalProperties: false) — e.g. a caller-supplied revocation_id/status/revocation_epoch", async () => {
    const base = { client_id: "clt1client_1", actor_id: "staff_1", reason_code: "compromise" };
    for (const extra of [{ revocation_id: "wlt1rev_" + "a".repeat(36) }, { status: "revoked" }, { revocation_epoch: 5 }, { destination_status_version: 5 }, { whitelist_version: 5 }]) {
      const res = await app.inject({
        method: "POST",
        url: "/internal/wlt1/destinations/wlt1dest_unknown/revoke",
        headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
        payload: { ...base, ...extra },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("POST .../destinations/:destination_id/revoke rejects an invalid reason_code enum value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/destinations/wlt1dest_unknown/revoke",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { client_id: "clt1client_1", actor_id: "staff_1", reason_code: "aml_risk_signal" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST .../destinations/:destination_id/revoke requires actor_id (400 when absent)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/destinations/wlt1dest_unknown/revoke",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { client_id: "clt1client_1", reason_code: "compromise" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/wlt1/aml-revocations exists and requires the internal-service-token (401 without it, never 404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/aml-revocations",
      payload: { signal_id: "aml1sig_1", signal_type: "confirmed_hit", client_id: "clt1client_1", destination_id: "wlt1dest_unknown" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/wlt1/aml-revocations rejects an unknown/additional body field (additionalProperties: false) — e.g. a caller-supplied reason_code/revocation_id", async () => {
    const base = { signal_id: "aml1sig_1", signal_type: "confirmed_hit", client_id: "clt1client_1", destination_id: "wlt1dest_unknown" };
    for (const extra of [{ reason_code: "compromise" }, { revocation_id: "wlt1rev_" + "a".repeat(36) }, { actor_id: "staff_1" }]) {
      const res = await app.inject({
        method: "POST",
        url: "/internal/wlt1/aml-revocations",
        headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
        payload: { ...base, ...extra },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("POST /internal/wlt1/aml-revocations rejects an invalid signal_type enum value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/aml-revocations",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { signal_id: "aml1sig_1", signal_type: "not_a_real_type", client_id: "clt1client_1", destination_id: "wlt1dest_unknown" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  // -----------------------------------------------------------------------------------------
  // Ongoing Rescreening — auth boundary + schema edges.
  // -----------------------------------------------------------------------------------------
  it("POST /internal/wlt1/rescreening-runs exists and requires the internal-service-token (401 without it, never 404)", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/wlt1/rescreening-runs", payload: { scope: "periodic_due", requested_by: "staff_1" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/wlt1/rescreening-runs rejects an unknown/additional body field (additionalProperties: false) — e.g. a caller-supplied run_id", async () => {
    const base = { scope: "periodic_due", requested_by: "staff_1" };
    for (const extra of [{ run_id: "wlt1rsr_" + "a".repeat(36) }, { candidates_selected: 5 }, { status: "completed" }]) {
      const res = await app.inject({
        method: "POST",
        url: "/internal/wlt1/rescreening-runs",
        headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
        payload: { ...base, ...extra },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("POST /internal/wlt1/rescreening-runs rejects an invalid scope enum value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/rescreening-runs",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { scope: "not_a_real_scope", requested_by: "staff_1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/wlt1/rescreening-runs requires requested_by (400 when absent)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/rescreening-runs",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { scope: "periodic_due" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/wlt1/rescreening-runs cross-field rejects periodic_due + destination_id/client_id (400, before auth is even relevant since schema/handler validation both precede any DB work)", async () => {
    for (const extra of [{ destination_id: "wlt1dest_1" }, { client_id: "clt1client_1" }]) {
      const res = await app.inject({
        method: "POST",
        url: "/internal/wlt1/rescreening-runs",
        headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
        payload: { scope: "periodic_due", requested_by: "staff_1", ...extra },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("POST /internal/wlt1/rescreening-runs cross-field rejects destination scope missing destination_id/client_id, and rejects batch_size for destination scope", async () => {
    const okDestBody = { scope: "destination", requested_by: "staff_1", destination_id: "wlt1dest_1", client_id: "clt1client_1" };
    const cases = [
      { scope: "destination", requested_by: "staff_1", client_id: "clt1client_1" },
      { scope: "destination", requested_by: "staff_1", destination_id: "wlt1dest_1" },
      { ...okDestBody, batch_size: 10 },
    ];
    for (const payload of cases) {
      const res = await app.inject({
        method: "POST",
        url: "/internal/wlt1/rescreening-runs",
        headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("POST /internal/wlt1/rescreening-runs fails closed (503) with no DB pool initialised, after schema/cross-field validation and authentication succeed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/rescreening-runs",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { scope: "periodic_due", requested_by: "staff_1" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("WLT1_SERVICE_UNAVAILABLE");
  });

  it("no LED route exists this phase: no release, no LED route", async () => {
    const businessPaths = ["/internal/wlt1/destination-decisions/wlt1dec_1/release", "/internal/led1/entries"];
    for (const url of businessPaths) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, `expected 404 for ${url}`).toBe(404);
      const resPost = await app.inject({ method: "POST", url });
      expect(resPost.statusCode, `expected 404 for POST ${url}`).toBe(404);
    }
  });

  // -----------------------------------------------------------------------------------------
  // Evidence Export — auth boundary + schema edges.
  // -----------------------------------------------------------------------------------------
  it("POST /internal/wlt1/evidence-exports/request exists and requires the internal-service-token (401 without it, never 404)", async () => {
    const res = await app.inject({ method: "POST", url: "/internal/wlt1/evidence-exports/request", payload: { actor_id: "staff_1", client_id: "clt1client_1", evidence_types: ["destination_current_state"] } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/wlt1/evidence-exports/:export_id/apply exists and requires the internal-service-token (401 without it, never 404) — Idempotency-Key requirement is proven against a real DB in the integration suite, since assertPoolAvailable() runs BEFORE requireIdempotencyKey() (mirrors payout-destinations.ts's own established ordering) and always 503s first in this no-DB file", async () => {
    const noAuth = await app.inject({ method: "POST", url: "/internal/wlt1/evidence-exports/wlt1exp_1/apply", payload: { actor_id: "staff_1", client_id: "clt1client_1", evidence_types: ["destination_current_state"], approval_id: "iam2appr_1", decision_token: "wlt1dt_" + "x".repeat(43) } });
    expect(noAuth.statusCode).toBe(401);

    const withAuthNoDb = await app.inject({
      method: "POST",
      url: "/internal/wlt1/evidence-exports/wlt1exp_1/apply",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-apply-no-db-1" },
      payload: { actor_id: "staff_1", client_id: "clt1client_1", evidence_types: ["destination_current_state"], approval_id: "iam2appr_1", decision_token: "wlt1dt_" + "x".repeat(43) },
    });
    expect(withAuthNoDb.statusCode).toBe(503);
    expect(withAuthNoDb.json().error.code).toBe("WLT1_SERVICE_UNAVAILABLE");
  });

  it("GET /internal/wlt1/evidence-exports/:export_id exists and requires the internal-service-token (401 without it, never 404) — schema validation requires a complete querystring to reach the 401", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/evidence-exports/wlt1exp_1?actor_id=staff_1&client_id=clt1client_1" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("GET /internal/wlt1/evidence-exports/:export_id/download exists and requires the internal-service-token (401 without it, never 404)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/evidence-exports/wlt1exp_1/download?actor_id=staff_1&client_id=clt1client_1" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("POST /internal/wlt1/evidence-exports/request rejects an unknown/additional body field (additionalProperties: false)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/evidence-exports/request",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      payload: { actor_id: "staff_1", client_id: "clt1client_1", evidence_types: ["destination_current_state"], approved_by: "staff_2" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/wlt1/evidence-exports/:export_id/apply rejects an approved_by body field (additionalProperties: false) — approved_by does not exist anywhere in this API", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/wlt1/evidence-exports/wlt1exp_1/apply",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-approved-by-guard-1" },
      payload: { actor_id: "staff_1", client_id: "clt1client_1", evidence_types: ["destination_current_state"], approval_id: "iam2appr_1", decision_token: "wlt1dt_" + "x".repeat(43), approved_by: "staff_2" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /internal/wlt1/inbound-source-screenings exists and requires the internal-service-token (401 without it, never 404) — Idempotency-Key requirement is proven against a real DB in the integration suite, since assertPoolAvailable() runs BEFORE requireIdempotencyKey() (mirrors evidence-export.ts's own established ordering) and always 503s first in this no-DB file", async () => {
    const noAuth = await app.inject({
      method: "POST",
      url: "/internal/wlt1/inbound-source-screenings",
      payload: { client_id: "clt1client_1", chain: "ethereum", network: "mainnet", source_address: "0x" + "1".repeat(40), transaction_ref: "tx-1" },
    });
    expect(noAuth.statusCode).toBe(401);
    expect(noAuth.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");

    const withAuthNoDb = await app.inject({
      method: "POST",
      url: "/internal/wlt1/inbound-source-screenings",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-inbsrc-nodb-1" },
      payload: { client_id: "clt1client_1", chain: "ethereum", network: "mainnet", source_address: "0x" + "1".repeat(40), transaction_ref: "tx-1" },
    });
    expect(withAuthNoDb.statusCode).toBe(503);
    expect(withAuthNoDb.json().error.code).toBe("WLT1_SERVICE_UNAVAILABLE");
  });

  it("POST /internal/wlt1/inbound-source-screenings rejects an unknown/additional body field (additionalProperties: false) — no actor_id, no amount, no memo/tag on this route", async () => {
    const withActor = await app.inject({
      method: "POST",
      url: "/internal/wlt1/inbound-source-screenings",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-inbsrc-actor-guard-1" },
      payload: { client_id: "clt1client_1", chain: "ethereum", network: "mainnet", source_address: "0x" + "1".repeat(40), transaction_ref: "tx-1", actor_id: "staff_1" },
    });
    expect(withActor.statusCode).toBe(400);
    expect(withActor.json().error.code).toBe("VALIDATION_ERROR");

    const withAmount = await app.inject({
      method: "POST",
      url: "/internal/wlt1/inbound-source-screenings",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-inbsrc-amount-guard-1" },
      payload: { client_id: "clt1client_1", chain: "ethereum", network: "mainnet", source_address: "0x" + "1".repeat(40), transaction_ref: "tx-1", amount: "100" },
    });
    expect(withAmount.statusCode).toBe(400);
    expect(withAmount.json().error.code).toBe("VALIDATION_ERROR");

    const withMemo = await app.inject({
      method: "POST",
      url: "/internal/wlt1/inbound-source-screenings",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-inbsrc-memo-guard-1" },
      payload: { client_id: "clt1client_1", chain: "ethereum", network: "mainnet", source_address: "0x" + "1".repeat(40), transaction_ref: "tx-1", memo_tag: "123" },
    });
    expect(withMemo.statusCode).toBe(400);
    expect(withMemo.json().error.code).toBe("VALIDATION_ERROR");
  });

  // -----------------------------------------------------------------------------------------
  // Stuck-Screening Operational Closure — no IAM, no maker-checker; requireInternal only (same
  // authority model as every other internal route).
  // -----------------------------------------------------------------------------------------
  it("GET /internal/wlt1/stuck-screenings exists and requires the internal-service-token (401 without it, never 404); with auth but no DB pool -> 503 WLT1_SERVICE_UNAVAILABLE", async () => {
    const noAuth = await app.inject({ method: "GET", url: "/internal/wlt1/stuck-screenings" });
    expect(noAuth.statusCode).toBe(401);
    expect(noAuth.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");

    const withAuthNoDb = await app.inject({ method: "GET", url: "/internal/wlt1/stuck-screenings", headers: { "x-internal-service-token": config.wlt1InternalServiceToken } });
    expect(withAuthNoDb.statusCode).toBe(503);
    expect(withAuthNoDb.json().error.code).toBe("WLT1_SERVICE_UNAVAILABLE");
  });

  it("GET /internal/wlt1/stuck-screenings rejects an unknown querystring field (additionalProperties: false)", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/wlt1/stuck-screenings?client_id=x", headers: { "x-internal-service-token": config.wlt1InternalServiceToken } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /internal/wlt1/stuck-screenings/:screening_result_id/recover exists and requires the internal-service-token (401 without it, never 404); with auth but no DB pool -> 503 WLT1_SERVICE_UNAVAILABLE — Idempotency-Key requirement is proven against a real DB in the integration suite, since assertPoolAvailable() runs first and always 503s before requireIdempotencyKey() in this no-DB file", async () => {
    const noAuth = await app.inject({
      method: "POST",
      url: "/internal/wlt1/stuck-screenings/wlt1screen_unknown/recover",
      payload: { actor_id: "staff_1", reason_code: "provider_result_never_delivered" },
    });
    expect(noAuth.statusCode).toBe(401);
    expect(noAuth.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");

    const withAuthNoDb = await app.inject({
      method: "POST",
      url: "/internal/wlt1/stuck-screenings/wlt1screen_unknown/recover",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-stuck-nodb-1" },
      payload: { actor_id: "staff_1", reason_code: "provider_result_never_delivered" },
    });
    expect(withAuthNoDb.statusCode).toBe(503);
    expect(withAuthNoDb.json().error.code).toBe("WLT1_SERVICE_UNAVAILABLE");
  });

  it("POST .../stuck-screenings/:screening_result_id/recover rejects an unknown/additional body field and an invalid reason_code (additionalProperties: false) — no destination_status, no destination_status_version accepted as input either", async () => {
    const withExtra = await app.inject({
      method: "POST",
      url: "/internal/wlt1/stuck-screenings/wlt1screen_unknown/recover",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-stuck-extra-guard-1" },
      payload: { actor_id: "staff_1", reason_code: "provider_result_never_delivered", extra: "x" },
    });
    expect(withExtra.statusCode).toBe(400);
    expect(withExtra.json().error.code).toBe("VALIDATION_ERROR");

    const badReason = await app.inject({
      method: "POST",
      url: "/internal/wlt1/stuck-screenings/wlt1screen_unknown/recover",
      headers: { "x-internal-service-token": config.wlt1InternalServiceToken, "idempotency-key": "idem-stuck-reason-guard-1" },
      payload: { actor_id: "staff_1", reason_code: "not_a_real_reason" },
    });
    expect(badReason.statusCode).toBe(400);
    expect(badReason.json().error.code).toBe("VALIDATION_ERROR");
  });
});
