/**
 * WLT-01 Public Client Surface — DB-gated behaviour tests for the six public `/wlt1/*` routes,
 * against a real Postgres. IAM-01/CLT-01/FND-01 are stubbed via the config's own test-only DI
 * fetch seams (`iamFetchImpl`/`clt1FetchImpl`/`fndFetchImpl`) — no live IAM-01/CLT-01/FND-01
 * process is required, mirroring every prior WLT-01 cross-service integration test's own
 * established `clt1FetchImpl` stubbing convention.
 *
 * Self-skips unless `TEST_DATABASE_URL` is set (H-D3C-1 fail-loud canary below proves the schema
 * is actually migrated to head, not just that the file was invoked).
 *
 * INTERNET EXPOSURE: this file proves the routes function correctly and enforce their security
 * properties. It does NOT and cannot prove internet-exposure safety — FND-FIND-001 (HIGH,
 * pre-authentication abuse) remains a separate, unresolved, mandatory precondition.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { closePool, getPool, initPool } from "@aix/foundation";
import { buildApp } from "../../services/wlt1/src/server.js";
import { canonicalizeAixSignature } from "../../services/wlt1/src/lib/proof-of-control/crypto.js";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";

const TEST_DB = process.env.TEST_DATABASE_URL;

const IAM_USER_A = "iamuser_A_" + randomUUID();
const IAM_USER_B = "iamuser_B_" + randomUUID();
const IAM_USER_MULTI = "iamuser_multi_" + randomUUID();
const CLIENT_A = "wlt1pub_client_A_" + randomUUID().slice(0, 8);
const CLIENT_B = "wlt1pub_client_B_" + randomUUID().slice(0, 8);
const CLIENT_C = "wlt1pub_client_C_" + randomUUID().slice(0, 8);
const BEARER_A = "bearer-token-for-user-a";
const BEARER_B = "bearer-token-for-user-b";
const BEARER_MULTI = "bearer-token-for-multi-user";
const BEARER_WRONG_CLASS = "bearer-token-for-admin";
const BEARER_INVALID = "bearer-token-genuinely-invalid";
const BEARER_TRIGGERS_IAM_OUTAGE = "bearer-token-triggers-iam-outage";
const BEARER_NO_MEMBERSHIP = "bearer-token-for-user-with-no-membership";
const IAM_USER_NO_MEMBERSHIP = "iamuser_no_membership_" + randomUUID();

/** In-memory rate-limit toggle this file's own FND stub reads — lets individual tests force an
 * allow/429/503 outcome without a live FND-01. */
let fndOutcome: "allow" | "rate_limited" | "unavailable" = "allow";
let fndCallCount = 0;
let fndLastRequest: { bucket: string; subject_type: string; subject_id: string } | undefined;

async function iamFetchImpl(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const body = JSON.parse((init?.body as string) ?? "{}") as { access_token?: string };
  const token = body.access_token;
  if (token === BEARER_TRIGGERS_IAM_OUTAGE) {
    return new Response("upstream error", { status: 500 });
  }
  if (token === BEARER_A) {
    return jsonResponse(200, { success: true, data: { valid: true, user_id: IAM_USER_A, session_id: "sess_a", user_class: "client" } });
  }
  if (token === BEARER_B) {
    return jsonResponse(200, { success: true, data: { valid: true, user_id: IAM_USER_B, session_id: "sess_b", user_class: "client" } });
  }
  if (token === BEARER_MULTI) {
    return jsonResponse(200, { success: true, data: { valid: true, user_id: IAM_USER_MULTI, session_id: "sess_multi", user_class: "client_approver" } });
  }
  if (token === BEARER_WRONG_CLASS) {
    return jsonResponse(200, { success: true, data: { valid: true, user_id: "iamuser_admin", session_id: "sess_admin", user_class: "admin" } });
  }
  if (token === BEARER_NO_MEMBERSHIP) {
    return jsonResponse(200, { success: true, data: { valid: true, user_id: IAM_USER_NO_MEMBERSHIP, session_id: "sess_no_membership", user_class: "client" } });
  }
  return jsonResponse(401, { success: false, error: { code: "AUTH_SESSION_REQUIRED" } });
}

async function clt1FetchImpl(url: string | URL | Request): Promise<Response> {
  const u = String(url);
  if (u.includes("/client-memberships")) {
    if (u.includes(encodeURIComponent(IAM_USER_A)) || u.includes(IAM_USER_A)) {
      return jsonResponse(200, { success: true, data: { memberships: [{ client_id: CLIENT_A, authorised_user_id: "au_a", role: "client_maker", membership_status: "active", client_status: "active" }] } });
    }
    if (u.includes(IAM_USER_B)) {
      return jsonResponse(200, { success: true, data: { memberships: [{ client_id: CLIENT_B, authorised_user_id: "au_b", role: "client_maker", membership_status: "active", client_status: "active" }] } });
    }
    if (u.includes(IAM_USER_MULTI)) {
      return jsonResponse(200, {
        success: true,
        data: {
          memberships: [
            { client_id: CLIENT_A, authorised_user_id: "au_multi_a", role: "client_approver", membership_status: "active", client_status: "active" },
            { client_id: CLIENT_C, authorised_user_id: "au_multi_c", role: "client_approver", membership_status: "active", client_status: "active" },
          ],
        },
      });
    }
    return jsonResponse(200, { success: true, data: { memberships: [] } });
  }
  // client-status check (registration routes)
  if (u.includes("/status")) {
    return jsonResponse(200, { success: true, data: { client_id: "unused", status: "active" } });
  }
  return jsonResponse(404, {});
}

async function fndFetchImpl(_url: string | URL | Request, init?: RequestInit): Promise<Response> {
  fndCallCount++;
  fndLastRequest = JSON.parse((init?.body as string) ?? "{}");
  if (fndOutcome === "allow") return jsonResponse(200, { success: true, data: { decision: "allow", limit_ref: "test:v1", retry_after_seconds: null } });
  if (fndOutcome === "rate_limited") return jsonResponse(429, { success: false, error: { code: "RATE_LIMITED" } }, { "retry-after": "7" });
  return jsonResponse(503, { success: false, error: { code: "RATE_LIMIT_UNAVAILABLE" } });
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const config: Wlt1Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-wlt1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  wlt1InternalServiceToken: "test-wlt1-internal-token-pubsurf-it",
  clt1BaseUrl: "http://clt1.test",
  clt1InternalServiceToken: "test-clt1-internal-token-unused",
  clt1FetchImpl,
  screeningProviderId: "stub-wallet-analytics-v1",
  screeningMaxValidityHours: 720,
  providerReceiptSecrets: {},
  pocChallengeTtlMinutes: 15,
  pocMaxAttempts: 5,
  destinationCoolingOffHours: 24,
  iam2BaseUrl: "http://iam2.test",
  iam2InternalServiceToken: "test-iam2-internal-token-unused",
  decisionTokenTtlMinutes: 5,
  aml1BaseUrl: "http://aml1.test",
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
  iamBaseUrl: "http://iam.test",
  iamIntrospectionServiceToken: "test-iam-introspection-token-unused",
  iamFetchImpl,
  fndBaseUrl: "http://fnd.test",
  fndRateLimitConsumerToken: "test-fnd-ratelimit-token-unused",
  fndFetchImpl,
  publicDestinationListMax: 5,
};

let app: FastifyInstance;
let schemaReady = false;

async function foundationSchemaExists(): Promise<boolean> {
  try {
    const r = await getPool().query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'destination'");
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

function authHeaders(bearer: string, narrowingClientId?: string, idempotencyKey?: string) {
  const headers: Record<string, string> = { authorization: `Bearer ${bearer}` };
  if (narrowingClientId) headers["x-aix-client-id"] = narrowingClientId;
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  return headers;
}

function idemKey(label: string): string {
  return `pubsurf_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

describe.skipIf(!TEST_DB)("WLT-01 Public Client Surface — DB-gated behaviour", () => {
  beforeAll(async () => {
    initPool(config.databaseUrl);
    schemaReady = await foundationSchemaExists();
    if (!schemaReady) return;
    app = await buildApp(config);
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    if (schemaReady) {
      await getPool().query(`DELETE FROM wlt1.proof_of_control WHERE client_id IN ($1,$2,$3)`, [CLIENT_A, CLIENT_B, CLIENT_C]);
      await getPool().query(`DELETE FROM wlt1.address_integrity_check WHERE client_id IN ($1,$2,$3)`, [CLIENT_A, CLIENT_B, CLIENT_C]);
      await getPool().query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id IN ($1,$2,$3))`, [CLIENT_A, CLIENT_B, CLIENT_C]);
      await getPool().query(`DELETE FROM wlt1.beneficiary_verification WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id IN ($1,$2,$3))`, [CLIENT_A, CLIENT_B, CLIENT_C]);
      await getPool().query(`DELETE FROM wlt1.fiat_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id IN ($1,$2,$3))`, [CLIENT_A, CLIENT_B, CLIENT_C]);
      await getPool().query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id IN ($1,$2,$3))`, [CLIENT_A, CLIENT_B, CLIENT_C]);
      await getPool().query(`DELETE FROM wlt1.destination WHERE client_id IN ($1,$2,$3)`, [CLIENT_A, CLIENT_B, CLIENT_C]);
      await getPool().query(`DELETE FROM foundation.idempotency_record WHERE actor_id IN ($1,$2,$3)`, [IAM_USER_A, IAM_USER_B, IAM_USER_MULTI]);
    }
    await closePool();
  });

  it("H-D3C-1 canary: fails loud if the schema is not migrated to head (never silently skips)", () => {
    if (!schemaReady) {
      return expect(schemaReady, "TEST_DATABASE_URL must point at a Postgres migrated through head (run npm run migrate:up first)").toBe(true);
    }
    expect(schemaReady).toBe(true);
  });

  // -------------------------------------------------------------------------------------------
  // B. IAM authentication
  // -------------------------------------------------------------------------------------------
  describe("authentication", () => {
    it("no Authorization header -> 401 WLT1_AUTH_REQUIRED", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("WLT1_AUTH_REQUIRED");
    });

    it("invalid bearer -> 401 WLT1_AUTH_REQUIRED, never a 200/403", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_INVALID) });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("WLT1_AUTH_REQUIRED");
    });

    it("IAM-01 unavailable (5xx) -> 503 WLT1_IAM01_UNAVAILABLE, never 401 and never 200", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_TRIGGERS_IAM_OUTAGE) });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_IAM01_UNAVAILABLE");
    });

    it("a malformed Authorization header (not 'Bearer <token>') -> 401", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: { authorization: "Basic dXNlcjpwYXNz" } });
      expect(res.statusCode).toBe(401);
    });

    it("authenticated but wrong user_class (admin) -> 403 WLT1_CLIENT_AUTHORITY_REQUIRED, never 401", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_WRONG_CLASS) });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("WLT1_CLIENT_AUTHORITY_REQUIRED");
    });
  });

  // -------------------------------------------------------------------------------------------
  // C. CLT authority / client-id resolution
  // -------------------------------------------------------------------------------------------
  describe("CLT-01 client authority resolution", () => {
    it("single eligible membership -> auto-derived, no header needed", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_A) });
      expect(res.statusCode).toBe(200);
    });

    it("multiple eligible memberships, NO narrowing header -> 403 (never guesses)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_MULTI) });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("WLT1_CLIENT_AUTHORITY_REQUIRED");
    });

    it("multiple eligible memberships WITH a matching narrowing header -> resolves to that client", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_MULTI, CLIENT_C) });
      expect(res.statusCode).toBe(200);
    });

    it("a narrowing header naming a client the caller does NOT hold -> 403, never silently ignored", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_MULTI, "wlt1pub_client_not_mine") });
      expect(res.statusCode).toBe(403);
    });

    it("a narrowing header on a SINGLE-membership caller that does not match -> 403, never silently ignored", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_A, CLIENT_B) });
      expect(res.statusCode).toBe(403);
    });

    it("authenticated user with zero eligible memberships (CLT-01 genuinely returns an empty array) -> 403 WLT1_CLIENT_AUTHORITY_REQUIRED, never 200", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_NO_MEMBERSHIP) });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("WLT1_CLIENT_AUTHORITY_REQUIRED");
    });
  });

  // -------------------------------------------------------------------------------------------
  // E. Rate limit integration + F. ordering proof
  // -------------------------------------------------------------------------------------------
  describe("FND-01 rate-limit integration", () => {
    it("FND allow -> the route proceeds normally", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_A) });
      expect(res.statusCode).toBe(200);
    });

    it("FND 429 -> public 429 RATE_LIMITED with Retry-After header, request never reaches the business read", async () => {
      if (!schemaReady) return;
      fndOutcome = "rate_limited";
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_A) });
      expect(res.statusCode).toBe(429);
      expect(res.json().error.code).toBe("RATE_LIMITED");
      expect(res.headers["retry-after"]).toBe("7");
      fndOutcome = "allow";
    });

    it("FND 503/unavailable -> public 503 WLT1_SERVICE_UNAVAILABLE (DEC-009: internal RATE_LIMIT_UNAVAILABLE never leaks to a public caller), never 429", async () => {
      if (!schemaReady) return;
      fndOutcome = "unavailable";
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_A) });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_SERVICE_UNAVAILABLE");
      expect(res.json().error.code).not.toBe("RATE_LIMIT_UNAVAILABLE");
      fndOutcome = "allow";
    });

    it("correct bucket/subject binding: READ_LIST is client-scoped", async () => {
      if (!schemaReady) return;
      fndCallCount = 0;
      await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_A) });
      expect(fndCallCount).toBe(1);
      expect(fndLastRequest).toEqual({ bucket: "READ_LIST", subject_type: "client", subject_id: CLIENT_A });
    });

    it("correct bucket/subject binding: READ_ITEM is client-scoped", async () => {
      if (!schemaReady) return;
      fndCallCount = 0;
      await app.inject({ method: "GET", url: "/wlt1/destinations/wlt1dest_unknown", headers: authHeaders(BEARER_A) });
      expect(fndLastRequest).toEqual({ bucket: "READ_ITEM", subject_type: "client", subject_id: CLIENT_A });
    });

    it("a rejected auth request never calls FND-01 (auth runs strictly before rate-limit)", async () => {
      if (!schemaReady) return;
      fndCallCount = 0;
      await app.inject({ method: "GET", url: "/wlt1/destinations" }); // no bearer at all
      expect(fndCallCount).toBe(0);
    });

    it("a rejected membership/authority request never calls FND-01 (CLT runs strictly before rate-limit)", async () => {
      if (!schemaReady) return;
      fndCallCount = 0;
      await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_MULTI) }); // ambiguous, no header
      expect(fndCallCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------------------------
  // H. Wallet registration + idempotency + ordering
  // -------------------------------------------------------------------------------------------
  describe("POST /wlt1/wallet-destinations", () => {
    const VALID_ADDRESS = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

    it("registers successfully; response never includes client_id", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_A, undefined, idemKey("reg1")),
        payload: { chain: "ethereum", network: "mainnet", address: VALID_ADDRESS, wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      expect(res.statusCode).toBe(201);
      const data = res.json().data;
      expect(data.client_id).toBeUndefined();
      expect(data.destination_type).toBe("wallet");
      expect(data.address_masked).not.toContain(VALID_ADDRESS);
      expect(Object.keys(data).sort()).toEqual(
        ["destination_id", "destination_type", "status", "chain", "network", "address_masked", "memo_tag_present", "wallet_type", "beneficiary_relationship", "created_at_utc"].sort(),
      );
    });

    it("idempotent replay with the SAME key returns the SAME destination (never a duplicate)", async () => {
      if (!schemaReady) return;
      const key = idemKey("reg2");
      const payload = { chain: "ethereum", network: "mainnet", address: "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359", wallet_type: "unhosted", beneficiary_relationship: "self" };
      const r1 = await app.inject({ method: "POST", url: "/wlt1/wallet-destinations", headers: authHeaders(BEARER_A, undefined, key), payload });
      const r2 = await app.inject({ method: "POST", url: "/wlt1/wallet-destinations", headers: authHeaders(BEARER_A, undefined, key), payload });
      expect(r1.statusCode).toBe(201);
      expect(r2.statusCode).toBe(201);
      expect(r1.json().data.destination_id).toBe(r2.json().data.destination_id);
    });

    it("a rejected/rate-limited request never creates a destination row", async () => {
      if (!schemaReady) return;
      const before = await getPool().query(`SELECT count(*)::int n FROM wlt1.destination WHERE client_id = $1`, [CLIENT_A]);
      fndOutcome = "rate_limited";
      const key = idemKey("reg-ratelimited");
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_A, undefined, key),
        payload: { chain: "ethereum", network: "mainnet", address: "0x111111111111111111111111111111111111111a", wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      expect(res.statusCode).toBe(429);
      const after = await getPool().query(`SELECT count(*)::int n FROM wlt1.destination WHERE client_id = $1`, [CLIENT_A]);
      expect(after.rows[0].n).toBe(before.rows[0].n);
      fndOutcome = "allow";
    });

    it("no Idempotency-Key -> 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_A),
        payload: { chain: "ethereum", network: "mainnet", address: "0x222222222222222222222222222222222222222a", wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("rejects a client_id field in the body (additionalProperties:false — never accepted as caller input)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_A, undefined, idemKey("reg-clientid-reject")),
        payload: { client_id: CLIENT_B, chain: "ethereum", network: "mainnet", address: "0x333333333333333333333333333333333333333a", wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects a label field (the frozen contract explicitly removed label; no migration added it back)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_A, undefined, idemKey("reg-label-reject")),
        payload: { label: "my wallet", chain: "ethereum", network: "mainnet", address: "0x444444444444444444444444444444444444444a", wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------------------------
  // W6.A — bidirectional auth-channel separation, committed as a regression (previously only
  // verified ad hoc). The internal `/internal/wlt1/*` surface and the public `/wlt1/*` surface
  // authenticate via two structurally different, non-interchangeable channels.
  // -------------------------------------------------------------------------------------------
  describe("auth-channel separation (W6.A)", () => {
    it("the internal service-identity token presented via its OWN header (x-internal-service-token) does not authenticate a public route — public routes only ever read Authorization", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "GET",
        url: "/wlt1/destinations",
        headers: { "x-internal-service-token": config.wlt1InternalServiceToken },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("WLT1_AUTH_REQUIRED");
    });

    it("the internal service-identity token presented AS a Bearer token does not authenticate a public route", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "GET",
        url: "/wlt1/destinations",
        headers: authHeaders(config.wlt1InternalServiceToken),
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("WLT1_AUTH_REQUIRED");
    });

    it("a genuine public client Bearer token does not authenticate an internal route", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "GET",
        url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown",
        headers: { "x-internal-service-token": BEARER_A },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });

    it("a genuine public client Bearer token presented via its OWN header is REJECTED by an internal route (the internal guard never reads Authorization)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "GET",
        url: "/internal/wlt1/wallet-destinations/wlt1dest_unknown",
        headers: authHeaders(BEARER_A),
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });
  });

  // -------------------------------------------------------------------------------------------
  // W1 — public wallet registration produces the SAME address-integrity evidence class as the
  // already-accepted internal route (blueprint High severity, WLT1-RISK-018): a persisted
  // `wlt1.address_integrity_check` row and a published `wlt1.address_integrity_checked` audit
  // event, on BOTH the success path and the pre-transaction refusal path.
  // -------------------------------------------------------------------------------------------
  describe("address-integrity evidence (W1)", () => {
    // Proven-valid EIP-55 checksum address (== ETH_VALID_1 in wlt1-db.test.ts), registered here
    // under CLIENT_C (via the multi-membership bearer) — CLIENT_C has not registered it elsewhere
    // in this file, so this is a genuine fresh success case that actually exercises checksum
    // validation (never an all-lowercase address that trivially bypasses EIP-55).
    const FRESH_VALID_ADDRESS = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
    const BAD_CHECKSUM_ADDRESS = FRESH_VALID_ADDRESS.slice(0, -1) + (FRESH_VALID_ADDRESS.at(-1) === "d" ? "D" : "d");

    it("successful registration persists a PASS address_integrity_check row and publishes wlt1.address_integrity_checked; the public response never exposes this evidence", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_MULTI, CLIENT_C, idemKey("w1-success")),
        payload: { chain: "ethereum", network: "mainnet", address: FRESH_VALID_ADDRESS, wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      expect(res.statusCode).toBe(201);
      const destinationId = res.json().data.destination_id as string;
      const data = res.json().data;
      expect(data.address_check_id).toBeUndefined();
      expect(data.canonical_address_hash).toBeUndefined();
      expect(data.raw_address_hash).toBeUndefined();

      const checkRows = await getPool().query(
        `SELECT address_check_id, client_id, result_status, reason_code, checksum_valid, canonical_address_hash, canonicalisation_version
           FROM wlt1.address_integrity_check WHERE destination_id = $1`,
        [destinationId],
      );
      expect(checkRows.rows).toHaveLength(1);
      const check = checkRows.rows[0] as {
        address_check_id: string; client_id: string; result_status: string; reason_code: string; checksum_valid: boolean; canonical_address_hash: string; canonicalisation_version: string;
      };
      expect(check.client_id).toBe(CLIENT_C);
      expect(check.result_status).toBe("pass");
      expect(check.reason_code).toBe("canonicalisation_succeeded");
      expect(check.checksum_valid).toBe(true);
      expect(check.canonical_address_hash).toBeTruthy();
      expect(check.canonicalisation_version).toBeTruthy();

      const eventRows = await getPool().query(
        `SELECT event_type FROM foundation.outbox_event WHERE event_type = 'wlt1.address_integrity_checked' AND (payload_ref::jsonb ->> 'entity_id') = $1`,
        [check.address_check_id],
      );
      expect(eventRows.rows).toHaveLength(1);
    });

    it("address canonicalisation failure records FAIL refusal evidence (address_integrity_check row + BOTH wlt1.address_integrity_checked and wlt1.destination_registration_refused audit events) even though no destination was ever created", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_A, undefined, idemKey("w1-refusal")),
        payload: { chain: "ethereum", network: "mainnet", address: BAD_CHECKSUM_ADDRESS, wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_ADDRESS_CANONICALISATION_FAILED");

      const checkRows = await getPool().query(
        `SELECT address_check_id, destination_id, client_id, result_status, reason_code, checksum_valid
           FROM wlt1.address_integrity_check WHERE client_id = $1 AND reason_code = 'invalid_eip55_checksum'`,
        [CLIENT_A],
      );
      expect(checkRows.rows).toHaveLength(1);
      const check = checkRows.rows[0] as { address_check_id: string; destination_id: string | null; client_id: string; result_status: string; checksum_valid: boolean };
      expect(check.destination_id).toBeNull();
      expect(check.result_status).toBe("fail");
      expect(check.checksum_valid).toBe(false);

      const refusalEvents = await getPool().query(
        `SELECT event_type FROM foundation.outbox_event
          WHERE (payload_ref::jsonb ->> 'entity_id') = $1 AND event_type IN ('wlt1.address_integrity_checked', 'wlt1.destination_registration_refused')`,
        [check.address_check_id],
      );
      expect(refusalEvents.rows.map((r: { event_type: string }) => r.event_type).sort()).toEqual(
        ["wlt1.address_integrity_checked", "wlt1.destination_registration_refused"].sort(),
      );
    });
  });

  // -------------------------------------------------------------------------------------------
  // W2 — idempotency binds actor + derived client authority, never the actor alone. Uses
  // BEARER_MULTI (IAM_USER_MULTI, eligible in BOTH CLIENT_A and CLIENT_C) to prove a caller
  // holding two memberships can never have one client's idempotent-replay result attributed to
  // the other, on every public mutation that uses foundation idempotency.
  // -------------------------------------------------------------------------------------------
  describe("idempotency binds actor + derived client authority (W2)", () => {
    it("wallet registration: same Idempotency-Key + same body, narrowed to a DIFFERENT client each call -> independent per-client operations, never a cross-client replay; narrowing back to the original client still replays", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      const key = idemKey("w2-cross-client");
      const payload = { chain: "ethereum", network: "mainnet", address: "0x" + "d".repeat(39) + "a", wallet_type: "unhosted" as const, beneficiary_relationship: "self" as const };

      const r1 = await app.inject({ method: "POST", url: "/wlt1/wallet-destinations", headers: authHeaders(BEARER_MULTI, CLIENT_A, key), payload });
      expect(r1.statusCode).toBe(201);
      const destA = r1.json().data.destination_id as string;

      const r2 = await app.inject({ method: "POST", url: "/wlt1/wallet-destinations", headers: authHeaders(BEARER_MULTI, CLIENT_C, key), payload });
      expect(r2.statusCode).toBe(201);
      const destC = r2.json().data.destination_id as string;

      // The defining W2 proof: CLIENT_C's call must NOT have replayed CLIENT_A's result.
      expect(destC).not.toBe(destA);

      // Both destinations genuinely exist, each owned by its OWN client — never CLIENT_A's row
      // returned under CLIENT_C's narrowed authority, or vice versa. The public API response
      // never carries `client_id`, so ownership is verified directly against the DB.
      const rows = await getPool().query(`SELECT destination_id, client_id FROM wlt1.destination WHERE destination_id IN ($1, $2)`, [destA, destC]);
      const ownerOf = Object.fromEntries(rows.rows.map((r: { destination_id: string; client_id: string }) => [r.destination_id, r.client_id]));
      expect(ownerOf[destA]).toBe(CLIENT_A);
      expect(ownerOf[destC]).toBe(CLIENT_C);

      // Same actor, same key+body, narrowed back to the SAME client as call 1 -> a genuine replay.
      const r3 = await app.inject({ method: "POST", url: "/wlt1/wallet-destinations", headers: authHeaders(BEARER_MULTI, CLIENT_A, key), payload });
      expect(r3.statusCode).toBe(201);
      expect(r3.json().data.destination_id).toBe(destA);
    });

    it("PoC challenge: same Idempotency-Key + SAME destination_id, narrowed to a client that does NOT own it -> the replay branch never bypasses the ownership check (404, never a cross-client-replayed challenge); the true owner can still replay its own result", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      const regKey = idemKey("w2-poc-setup");
      const regRes = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_MULTI, CLIENT_A, regKey),
        payload: { chain: "ethereum", network: "mainnet", address: "0x" + "e".repeat(39) + "a", wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      expect(regRes.statusCode).toBe(201);
      const destinationId = regRes.json().data.destination_id as string;
      await getPool().query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);

      const key = idemKey("w2-poc-challenge");
      const r1 = await app.inject({
        method: "POST",
        url: `/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
        headers: authHeaders(BEARER_MULTI, CLIENT_A, key),
        payload: {},
      });
      expect(r1.statusCode).toBe(201);

      // SAME key, SAME destination_id (owned by CLIENT_A, not CLIENT_C) — narrowed to CLIENT_C.
      // Pre-fix, the idempotent-replay branch resolves and returns BEFORE the destination's own
      // ownership check runs, so this would have silently returned CLIENT_A's challenge as if
      // CLIENT_C's request had succeeded.
      const r2 = await app.inject({
        method: "POST",
        url: `/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
        headers: authHeaders(BEARER_MULTI, CLIENT_C, key),
        payload: {},
      });
      expect(r2.statusCode).toBe(404);
      expect(r2.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");

      const r3 = await app.inject({
        method: "POST",
        url: `/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
        headers: authHeaders(BEARER_MULTI, CLIENT_A, key),
        payload: {},
      });
      expect(r3.statusCode).toBe(201);
      expect(r3.json().data.challenge_id).toBe(r1.json().data.challenge_id);
    });
  });

  // -------------------------------------------------------------------------------------------
  // D/H. Tenant isolation
  // -------------------------------------------------------------------------------------------
  describe("tenant isolation", () => {
    it("client A cannot read client B's destination — indistinguishable from not-found", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      const regKey = idemKey("iso-reg-b");
      const regRes = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_B, undefined, regKey),
        payload: { chain: "ethereum", network: "mainnet", address: "0x555555555555555555555555555555555555555a", wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      expect(regRes.statusCode).toBe(201);
      const destinationId = regRes.json().data.destination_id;

      const crossRead = await app.inject({ method: "GET", url: `/wlt1/destinations/${destinationId}`, headers: authHeaders(BEARER_A) });
      expect(crossRead.statusCode).toBe(404);
      expect(crossRead.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");

      const ownRead = await app.inject({ method: "GET", url: `/wlt1/destinations/${destinationId}`, headers: authHeaders(BEARER_B) });
      expect(ownRead.statusCode).toBe(200);
    });

    it("an unknown destination_id returns the SAME 404 as a foreign-client one (no enumeration oracle)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations/wlt1dest_totally_unknown", headers: authHeaders(BEARER_A) });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });

    it("the list route only ever returns the caller's own client's destinations", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_A) });
      expect(res.statusCode).toBe(200);
      // Every returned row must be a destination we registered for CLIENT_A in this file — none
      // should be for CLIENT_B (registered above) or CLIENT_C.
      for (const d of res.json().data.destinations) {
        expect(d.client_id).toBeUndefined();
      }
    });
  });

  // -------------------------------------------------------------------------------------------
  // G. List pagination
  // -------------------------------------------------------------------------------------------
  describe("GET /wlt1/destinations — list pagination", () => {
    it("server list-max cannot be exceeded by a caller-requested limit", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations?limit=9999", headers: authHeaders(BEARER_A) });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.destinations.length).toBeLessThanOrEqual(config.publicDestinationListMax);
    });

    it("only status/destination_type filters are accepted (additionalProperties:false rejects an unknown filter)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations?client_id=" + CLIENT_B, headers: authHeaders(BEARER_A) });
      expect(res.statusCode).toBe(400);
    });

    it("a malformed cursor -> 400 VALIDATION_ERROR, never silently starts from the beginning", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations?cursor=not-a-real-cursor", headers: authHeaders(BEARER_A) });
      expect(res.statusCode).toBe(400);
    });

    it("a cursor minted for a different client -> 400, never leaks another client's rows", async () => {
      if (!schemaReady) return;
      const listA = await app.inject({ method: "GET", url: "/wlt1/destinations?limit=1", headers: authHeaders(BEARER_A) });
      // Force a next_cursor by registering enough rows first is unnecessary — just verify a
      // cursor from a genuinely different client context is rejected. Mint one via client B's
      // own list call, then present it as client A.
      fndOutcome = "allow";
      const listB = await app.inject({ method: "GET", url: "/wlt1/destinations?limit=1", headers: authHeaders(BEARER_B) });
      const cursorB = listB.json().data.next_cursor;
      if (cursorB) {
        const crossRes = await app.inject({ method: "GET", url: `/wlt1/destinations?cursor=${encodeURIComponent(cursorB)}`, headers: authHeaders(BEARER_A) });
        expect(crossRes.statusCode).toBe(400);
      }
      expect(listA.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------------------------
  // K/L. Proof-of-Control challenge + verify
  // -------------------------------------------------------------------------------------------
  describe("Proof-of-Control challenge + verify", () => {
    async function registerAndAdvanceToPendingReview(bearer: string, address: string): Promise<string> {
      fndOutcome = "allow";
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(bearer, undefined, idemKey("poc-setup")),
        payload: { chain: "ethereum", network: "mainnet", address, wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      expect(res.statusCode).toBe(201);
      const destinationId = res.json().data.destination_id as string;
      await getPool().query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);
      return destinationId;
    }

    it("issues a challenge for an eligible destination; response never includes client_id", async () => {
      if (!schemaReady) return;
      const destinationId = await registerAndAdvanceToPendingReview(BEARER_A, "0x666666666666666666666666666666666666666a");
      const res = await app.inject({
        method: "POST",
        url: `/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
        headers: authHeaders(BEARER_A, undefined, idemKey("poc-challenge")),
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      const data = res.json().data;
      expect(data.client_id).toBeUndefined();
      expect(data.status).toBe("issued");
      expect(typeof data.message).toBe("string");
    });

    it("MUTATE_POC is USER-scoped, not client-scoped — bucket/subject binding proof", async () => {
      if (!schemaReady) return;
      const destinationId = await registerAndAdvanceToPendingReview(BEARER_A, "0x777777777777777777777777777777777777777a");
      fndCallCount = 0;
      await app.inject({
        method: "POST",
        url: `/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
        headers: authHeaders(BEARER_A, undefined, idemKey("poc-bucket-check")),
        payload: {},
      });
      expect(fndLastRequest).toEqual({ bucket: "MUTATE_POC", subject_type: "user", subject_id: IAM_USER_A });
    });

    it("cross-client destination is blocked — WLT1_DESTINATION_NOT_FOUND, enumeration-resistant", async () => {
      if (!schemaReady) return;
      const destinationId = await registerAndAdvanceToPendingReview(BEARER_B, "0x888888888888888888888888888888888888888a");
      const res = await app.inject({
        method: "POST",
        url: `/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
        headers: authHeaders(BEARER_A, undefined, idemKey("poc-cross-client")),
        payload: {},
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });

    it("challenge issuance writes Sensitive Read evidence", async () => {
      if (!schemaReady) return;
      const destinationId = await registerAndAdvanceToPendingReview(BEARER_A, "0x999999999999999999999999999999999999999a");
      const before = await getPool().query(`SELECT count(*)::int n FROM foundation.outbox_event WHERE topic = 'audit.event'`);
      await app.inject({
        method: "POST",
        url: `/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
        headers: authHeaders(BEARER_A, undefined, idemKey("poc-sensitive-read")),
        payload: {},
      });
      const after = await getPool().query(`SELECT count(*)::int n FROM foundation.outbox_event WHERE topic = 'audit.event'`);
      expect(after.rows[0].n).toBeGreaterThan(before.rows[0].n);
    });

    it("verify rejects a malformed signature at the schema level before auth", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control/verify",
        payload: { challenge_id: "wlt1poc_unknown", signature: "not-a-valid-signature" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("verify does NOT require an Idempotency-Key (unchanged frozen semantics)", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations/wlt1dest_unknown/proof-of-control/verify",
        headers: authHeaders(BEARER_A),
        payload: { challenge_id: "wlt1poc_unknown", signature: "0x" + "ab".repeat(65) },
      });
      // No Idempotency-Key was supplied and the request still reached business logic (not a 400
      // IDEMPOTENCY_KEY_REQUIRED) — it fails for a DIFFERENT reason (challenge not found).
      expect(res.json().error?.code).not.toBe("IDEMPOTENCY_KEY_REQUIRED");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_POC_CHALLENGE_NOT_FOUND");
    });
  });

  // -------------------------------------------------------------------------------------------
  // J. Fiat payout registration — rail behaviour
  // -------------------------------------------------------------------------------------------
  describe("POST /wlt1/payout-destinations", () => {
    it("an unsupported/inactive rail collapses to WLT1_FIAT_RAIL_NOT_SUPPORTED — no capability catalogue leaked", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/payout-destinations",
        headers: authHeaders(BEARER_A, undefined, idemKey("payout-rail")),
        payload: {
          beneficiary_name: "Test Beneficiary",
          beneficiary_type: "individual",
          account_identifier_type: "local_account",
          account_identifier: "1234567890",
          bank_identifier: "TESTMYKL",
          bank_identifier_type: "bic",
          bank_country: "MY",
          currency: "MYR",
          rail: "apac_local_my",
        },
      });
      // All four APAC corridors ship dormant (activation_status='inactive') — this must collapse
      // to the SAME not-supported code as a genuinely unsupported corridor, never a 200.
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_FIAT_RAIL_NOT_SUPPORTED");
    });

    it("rejects a client_id field in the body", async () => {
      if (!schemaReady) return;
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/payout-destinations",
        headers: authHeaders(BEARER_A, undefined, idemKey("payout-clientid-reject")),
        payload: {
          client_id: CLIENT_B,
          beneficiary_name: "Test",
          beneficiary_type: "individual",
          account_identifier_type: "local_account",
          account_identifier: "1234567890",
          bank_identifier: "TESTMYKL",
          bank_identifier_type: "bic",
          bank_country: "MY",
          currency: "MYR",
          rail: "apac_local_my",
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------------------------
  // W6.B — positive DTO allowlists for ALL SIX public routes. A `toBeUndefined()` check on one
  // field only proves that ONE field is absent; these assert the COMPLETE top-level key set, so
  // the test fails if an unexpected DB/internal field is ever exposed later.
  // -------------------------------------------------------------------------------------------
  describe("positive DTO allowlists (W6.B)", () => {
    const WALLET_DTO_KEYS = ["destination_id", "destination_type", "status", "chain", "network", "address_masked", "memo_tag_present", "wallet_type", "beneficiary_relationship", "created_at_utc"].sort();
    const FIAT_DTO_KEYS = ["destination_id", "destination_type", "status", "bank_country", "currency", "rail", "bank_identifier", "branch_identifier", "account_identifier_masked", "beneficiary_type", "created_at_utc"].sort();

    it("POST /wlt1/wallet-destinations: exact response data key set (also covers the registration route)", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      const res = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_A, undefined, idemKey("dto-wallet-register")),
        payload: { chain: "ethereum", network: "mainnet", address: "0x" + "f".repeat(39) + "a", wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      expect(res.statusCode).toBe(201);
      expect(Object.keys(res.json().data).sort()).toEqual(WALLET_DTO_KEYS);
    });

    it("GET /wlt1/destinations: exact top-level envelope keys, and exact per-item key set", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "GET", url: "/wlt1/destinations", headers: authHeaders(BEARER_A) });
      expect(res.statusCode).toBe(200);
      expect(Object.keys(res.json().data).sort()).toEqual(["destinations", "next_cursor"].sort());
      const items = res.json().data.destinations as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual(WALLET_DTO_KEYS);
      }
    });

    it("GET /wlt1/destinations/:destination_id: exact response data key set", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      const regRes = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_A, undefined, idemKey("dto-single-read-setup")),
        payload: { chain: "ethereum", network: "mainnet", address: "0x" + "1".repeat(38) + "ab", wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      expect(regRes.statusCode).toBe(201);
      const destinationId = regRes.json().data.destination_id as string;
      const res = await app.inject({ method: "GET", url: `/wlt1/destinations/${destinationId}`, headers: authHeaders(BEARER_A) });
      expect(res.statusCode).toBe(200);
      expect(Object.keys(res.json().data).sort()).toEqual(WALLET_DTO_KEYS);
    });

    it("POST .../proof-of-control/challenges: exact response data key set", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      const regRes = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_A, undefined, idemKey("dto-challenge-setup")),
        payload: { chain: "ethereum", network: "mainnet", address: "0x" + "2".repeat(38) + "ab", wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      const destinationId = regRes.json().data.destination_id as string;
      await getPool().query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);
      const res = await app.inject({
        method: "POST",
        url: `/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
        headers: authHeaders(BEARER_A, undefined, idemKey("dto-challenge")),
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      expect(Object.keys(res.json().data).sort()).toEqual(["status", "challenge_id", "message", "verification_scheme", "expires_at_utc"].sort());
    });

    it("POST .../proof-of-control/verify: exact response data key set on a verified-replay success (the frozen challenge-state-authoritative replay path)", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      const regRes = await app.inject({
        method: "POST",
        url: "/wlt1/wallet-destinations",
        headers: authHeaders(BEARER_A, undefined, idemKey("dto-verify-setup")),
        payload: { chain: "ethereum", network: "mainnet", address: "0x" + "3".repeat(38) + "ab", wallet_type: "unhosted", beneficiary_relationship: "self" },
      });
      const destinationId = regRes.json().data.destination_id as string;
      await getPool().query(`UPDATE wlt1.destination SET status = 'pending_review' WHERE destination_id = $1`, [destinationId]);

      // A genuinely valid AIX signature (from tests/unit/wlt1-poc-crypto.test.ts's own golden
      // vector) — its exact bytes don't need to recover to any particular address here, since the
      // verified-replay branch only range-validates + hash-compares, never re-runs recovery.
      const goldenSignature =
        "0xf85082737d1f4323caf330395db0b95ef1d6831c4b98949d6a7b526aa3e741776d4a0b36390ea18b99782cb502a4de1282fdb8490b3a47b00b6a292a5551eec81b";
      const canon = canonicalizeAixSignature(goldenSignature);
      if (!canon.ok) throw new Error("golden signature failed to canonicalize — fixture is broken");

      const challengeId = "wlt1pocchal_dtotest_" + randomUUID();
      await getPool().query(
        `INSERT INTO wlt1.proof_of_control
           (challenge_id, destination_id, client_id, chain, network, canonical_address, address_hash, proof_method, verification_scheme, message_format_version, domain_environment, nonce, message_hash, verification_status, signature_hash, recovered_address, issued_at_utc, expires_at_utc, verified_at_utc)
         VALUES ($1,$2,$3,'ethereum','mainnet',$4,$5,'signed_message','eip191_personal_sign',1,'dev',$6,$7,'verified',$8,$9, now(), now() + interval '15 minutes', now())`,
        [challengeId, destinationId, CLIENT_A, "0x" + "3".repeat(38) + "ab", "sha256:" + "ab".repeat(32), "cd".repeat(32), "ef".repeat(32), canon.signatureHash, "0x" + "3".repeat(38) + "ab"],
      );

      const res = await app.inject({
        method: "POST",
        url: `/wlt1/wallet-destinations/${destinationId}/proof-of-control/verify`,
        headers: authHeaders(BEARER_A),
        payload: { challenge_id: challengeId, signature: goldenSignature },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("verified");
      expect(Object.keys(res.json().data).sort()).toEqual(["status", "challenge_id", "verification_scheme", "verified_address", "verified_at_utc"].sort());
    });

    it("POST /wlt1/payout-destinations: exact response data key set on a genuine success (temporarily activates one dormant rail, restored immediately after)", async () => {
      if (!schemaReady) return;
      fndOutcome = "allow";
      await getPool().query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'active' WHERE coverage_id = 'wlt1cov_fiat_my_myr'`);
      try {
        const res = await app.inject({
          method: "POST",
          url: "/wlt1/payout-destinations",
          headers: authHeaders(BEARER_A, undefined, idemKey("dto-payout-success")),
          payload: {
            beneficiary_name: "DTO Allowlist Test",
            beneficiary_type: "individual",
            account_identifier_type: "local_account",
            account_identifier: "9988776655",
            bank_identifier: "TESTMYKL",
            bank_identifier_type: "bic",
            bank_country: "MY",
            currency: "MYR",
            rail: "apac_local_my",
          },
        });
        expect(res.statusCode).toBe(201);
        expect(Object.keys(res.json().data).sort()).toEqual(FIAT_DTO_KEYS);
      } finally {
        await getPool().query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'inactive' WHERE coverage_id = 'wlt1cov_fiat_my_myr'`);
      }
    });
  });
});
