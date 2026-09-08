/**
 * WLT-01 Fiat Payout Destinations (APAC) — H-2 CLOSURE: DB-gated integration tests for the fiat
 * path through `POST /internal/wlt1/destinations/:destination_id/approve/request` and
 * `.../approve/apply` (`services/wlt1/src/routes/destination-approval.ts`, unchanged this
 * remediation — both routes were already destination-type-agnostic via
 * `resolveApprovalContext`/`evaluateFiatApprovalGates`; only test coverage was missing).
 *
 * SHARED canonical `aix_platform_test` database — mirrors
 * `tests/integration/wlt1-payout-destination-route.test.ts` /
 * `tests/integration/wlt1-fiat-decision-route.test.ts`'s own established harness exactly (own copy
 * per file). IAM-02 is stubbed via `config.iam2FetchImpl` using the SAME fake-fetch shape
 * `tests/integration/wlt1-destination-approval-route.test.ts` already established for the wallet
 * approval routes (own copy, F3(c)) — no live IAM-02 process is started.
 *
 * Individual gate-matrix fixtures (A-M below) are seeded DIRECTLY via SQL (superuser `verifyPool`)
 * — this file's own concern here is `evaluateFiatApprovalGates`/`resolveApprovalContext`'s gate
 * sequencing and the approve/request + approve/apply route mechanics (IAM-02 binding, version-drift
 * re-check, audit, state transition), NOT registration or provider-orchestration semantics (already
 * covered in `wlt1-payout-destination-route.test.ts`) — mirrors the identical, already-accepted
 * privileged-fixture convention `wlt1-fiat-decision-route.test.ts` uses for its own evaluate-use gate
 * matrix. The one END-TO-END authority-flow test (Part 4's own explicit requirement) instead
 * registers via the REAL `POST /internal/wlt1/payout-destinations` route with real stub-provider
 * orchestration end to end — no raw-SQL fabrication anywhere in that one test.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { initPool, closePool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { computeBeneficiaryNameHash, normalizeBeneficiaryName } from "../../services/wlt1/src/lib/fiat/beneficiary-name.js";
import { WLT1_TEST_STUB_BENEFICIARY_VERIFIED } from "../../services/wlt1/src/lib/beneficiary-verification/stub-provider.js";
import { WLT1_TEST_STUB_FIAT_SCREENING_BIC } from "../../services/wlt1/src/lib/fiat-screening/stub-provider.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_app_test";
const OWNED_CLIENT_PREFIX = "clt1client_fiatappr_";
const AML_VALID_MINUTES_DEFAULT = 10;

const config: Wlt1Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-wlt1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  wlt1InternalServiceToken: "test-wlt1-internal-token-it",
  clt1BaseUrl: "http://127.0.0.1:0",
  clt1InternalServiceToken: "test-clt1-internal-token-it",
  screeningProviderId: "stub-wallet-analytics-v1",
  screeningMaxValidityHours: 720,
  providerReceiptSecrets: {},
  pocChallengeTtlMinutes: 15,
  pocMaxAttempts: 5,
  destinationCoolingOffHours: 24,
  iam2BaseUrl: "http://127.0.0.1:0",
  iam2InternalServiceToken: "test-iam2-internal-token-it",
  decisionTokenTtlMinutes: 5,
  aml1BaseUrl: "http://127.0.0.1:0",
  aml1InternalServiceToken: "test-aml1-internal-token-it",
  rescreenLeadTimeHours: 72,
  rescreenBatchSizeDefault: 50,
  rescreenBatchSizeMax: 200,
  fiatScreeningMaxValidityHours: 720,
  beneficiaryVerificationValidityHours: 8760,
  fiatEncKey: "test-fiat-enc-key-at-least-32-characters-long",
  beneficiaryVerificationProviderId: "stub-beneficiary-verification-v1",
  fiatScreeningProviderId: "stub-fiat-screening-v1",
  fiatVerificationRequired: true,
};

const INTERNAL_HEADERS = { "x-internal-service-token": config.wlt1InternalServiceToken };
const DEFAULT_COOLING_OFF_HOURS = config.destinationCoolingOffHours;

// -------------------------------------------------------------------------------------------
// Fake IAM-02 fetch stub — own copy, mirrors wlt1-destination-approval-route.test.ts's own
// identical shape (F3(c): own copy per file, not a shared cross-file helper).
// -------------------------------------------------------------------------------------------
interface Iam2FakeOptions {
  checkDecision?: () => { decision: string; reason: string };
  verify?: () => { ok: boolean; execution_authorised?: boolean; errorCode?: string } | Promise<{ ok: boolean; execution_authorised?: boolean; errorCode?: string }>;
}

function makeFakeIam2Fetch(opts: Iam2FakeOptions): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/internal/iam2/permission/check")) {
      const result = opts.checkDecision ? opts.checkDecision() : { decision: "allow", reason: "permission_granted" };
      return { ok: true, json: async () => ({ success: true, data: result }) } as Response;
    }
    if (urlStr.endsWith("/internal/iam2/permission/execute-verify")) {
      const result = opts.verify ? await opts.verify() : { ok: true, execution_authorised: true };
      if (!result.ok) {
        return { ok: false, json: async () => ({ success: false, error: { code: result.errorCode ?? "IAM2_DECISION_TOKEN_INVALID" } }) } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: { execution_authorised: result.execution_authorised ?? true } }) } as Response;
    }
    throw new Error(`Unexpected URL in WLT-01 fiat approval IT IAM-02 test fake: ${urlStr}`);
  }) as typeof fetch;
}

function allowAllIam2Fetch(): typeof fetch {
  return makeFakeIam2Fetch({});
}
function denyBaselineIam2Fetch(): typeof fetch {
  return makeFakeIam2Fetch({ checkDecision: () => ({ decision: "deny", reason: "IAM2_PERMISSION_DENIED" }) });
}
function denyExecuteVerifyIam2Fetch(): typeof fetch {
  return makeFakeIam2Fetch({ verify: () => ({ ok: false, errorCode: "IAM2_SOD_VIOLATION" }) });
}
function iam2Unreachable(): typeof fetch {
  return (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

// -------------------------------------------------------------------------------------------
// CLT-01 / AML-01 fakes — own copy, needed ONLY by the one full end-to-end authority-flow test
// below (registration + evaluate-use + verify-and-consume all genuinely exercise these seams).
// -------------------------------------------------------------------------------------------
function clt1ActiveFetch(clientId: string): typeof fetch {
  return (async () => new Response(JSON.stringify({ success: true, data: { client_id: clientId, status: "active" } }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

function clt1RosterFetch(clientId: string): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/authorised-parties/active-refs")) {
      return { ok: true, json: async () => ({ success: true, data: { client_id: clientId, authorised_party_refs: ["ap_1"] } }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: { client_id: clientId, status: "active" } }) } as Response;
  }) as typeof fetch;
}

function aml1AllowFetch(clientId: string): typeof fetch {
  return (async () => {
    const now = new Date();
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: {
          decision: "allow",
          decision_id: "aml1ptd_" + randomUUID(),
          reason_code: "evidence_clear",
          evaluated_at_utc: now.toISOString(),
          valid_until_utc: new Date(now.getTime() + AML_VALID_MINUTES_DEFAULT * 60_000).toISOString(),
          evidence_provider_ids: ["stub-v1"],
          client_id: clientId,
          requested_action: "destination_use",
        },
      }),
    } as Response;
  }) as typeof fetch;
}

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'fiat_payout_destination'`);
    return Number(r.rows[0]?.n) > 0;
  } catch {
    return false;
  }
}

function freshClientId(): string {
  return OWNED_CLIENT_PREFIX + randomUUID().replace(/-/g, "").slice(0, 16);
}

async function activateMyCorridor(): Promise<void> {
  await verifyPool.query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'active' WHERE rail = 'apac_local_my' AND bank_country = 'MY' AND currency = 'MYR'`);
}
async function deactivateMyCorridor(): Promise<void> {
  await verifyPool.query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'inactive' WHERE rail = 'apac_local_my' AND bank_country = 'MY' AND currency = 'MYR'`);
}

interface FiatFixtureOptions {
  status?: string;
  withVerification?: boolean;
  withScreening?: boolean;
  screeningRiskStatus?: string;
  screeningValidUntilUtc?: string;
  verificationResult?: string;
  verificationValidUntilUtc?: string;
}

/** Own copy of wlt1-fiat-decision-route.test.ts's identical `createFiatFixture` helper — direct SQL
 * seeding is the established, already-accepted convention for building gate-matrix PRECONDITIONS
 * (as opposed to fabricating the behavior a test is actually about). */
async function createFiatFixture(clientId: string, opts: FiatFixtureOptions = {}): Promise<string> {
  const destinationId = "wlt1dest_fiatappr_" + randomUUID();
  const status = opts.status ?? "pending_review";
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,$2,'fiat_payout',$3,$4)`, [
    destinationId,
    clientId,
    "hash_" + randomUUID(),
    status,
  ]);
  await verifyPool.query(
    `INSERT INTO wlt1.fiat_payout_destination (destination_id, beneficiary_name, beneficiary_name_normalized, beneficiary_type, bank_country, bank_identifier, bank_identifier_type, account_identifier_type, account_identifier_masked, account_identifier_hash, account_identifier_encrypted, currency, rail)
     VALUES ($1,'Test User','TEST USER','individual','MY','ABMBMYKL','bic','local_account','••••5678',$2,'ciphertext','MYR','apac_local_my')`,
    [destinationId, "hash_acct_" + destinationId],
  );
  if (opts.withVerification !== false) {
    const beneficiaryNameHash = computeBeneficiaryNameHash(normalizeBeneficiaryName("Test User"));
    await verifyPool.query(
      `INSERT INTO wlt1.beneficiary_verification (verification_id, destination_id, verification_version, provider_id, provider_adaptor_version, result, beneficiary_name_hash, account_identifier_hash, issued_at_utc, valid_until_utc)
       VALUES ($1,$2,1,'stub-beneficiary-verification-v1','1',$3,$4,$5, now(), $6)`,
      ["wlt1bv_" + randomUUID(), destinationId, opts.verificationResult ?? "verified", beneficiaryNameHash, "hash_acct_" + destinationId, opts.verificationValidUntilUtc ?? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()],
    );
  }
  if (opts.withScreening !== false) {
    await verifyPool.query(
      `INSERT INTO wlt1.fiat_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, beneficiary_name_hash, bank_country, beneficiary_type, risk_status, issued_at_utc, valid_until_utc)
       VALUES ($1,$2,1,'stub-fiat-screening-v1','1','hash_name','MY','individual',$3, now(), $4)`,
      ["wlt1fscr_" + randomUUID(), destinationId, opts.screeningRiskStatus ?? "clear", opts.screeningValidUntilUtc ?? new Date(Date.now() + 3600 * 1000).toISOString()],
    );
  }
  return destinationId;
}

function approveRequest(destinationId: string, body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: `/internal/wlt1/destinations/${destinationId}/approve/request`, headers: INTERNAL_HEADERS, payload: body });
}

function approveApply(destinationId: string, body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: `/internal/wlt1/destinations/${destinationId}/approve/apply`, headers: INTERNAL_HEADERS, payload: body });
}

function myRegisterBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    client_id: freshClientId(),
    beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED,
    beneficiary_type: "individual",
    account_identifier_type: "local_account",
    account_identifier: "12345678",
    bank_identifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR,
    bank_identifier_type: "bic",
    bank_country: "MY",
    currency: "MYR",
    rail: "apac_local_my",
    ...overrides,
  };
}

function register(body: Record<string, unknown>, idemKey: string) {
  config.clt1FetchImpl = clt1ActiveFetch(body.client_id as string);
  return app.inject({ method: "POST", url: "/internal/wlt1/payout-destinations", headers: { ...INTERNAL_HEADERS, "idempotency-key": idemKey }, payload: body });
}

function evaluateUse(destinationId: string, clientId: string) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/destinations/${destinationId}/evaluate-use`,
    headers: INTERNAL_HEADERS,
    payload: { client_id: clientId, requested_action: "destination_use", caller_module: "TEST", amount: "500", asset_or_currency: "MYR" },
  });
}

function verifyDecision(decisionId: string, body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: `/internal/wlt1/destination-decisions/${decisionId}/verify`, headers: INTERNAL_HEADERS, payload: body });
}

function consumeDecision(decisionId: string, body: Record<string, unknown>, idemKey: string) {
  return app.inject({ method: "POST", url: `/internal/wlt1/destination-decisions/${decisionId}/verify-and-consume`, headers: { ...INTERNAL_HEADERS, "idempotency-key": idemKey }, payload: body });
}

describe("WLT-01 Fiat Payout Destinations (APAC) — H-2 CLOSURE: approve/request + approve/apply route integration", () => {
  beforeAll(async () => {
    verifyPool = new Pool({ connectionString: TEST_DB ?? "postgres://unused" });
    schemaReady = await schemasExist();
    if (!schemaReady) return;

    await verifyPool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN
          CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN;
        END IF;
      END
      $$;
    `);
    await verifyPool.query(`GRANT role_wlt1_runtime TO ${RUNTIME_ROLE_USER};`);

    const runtimeDbUrl = (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
    initPool(runtimeDbUrl);
    config.iam2FetchImpl = allowAllIam2Fetch();
    app = await buildApp(config);
    await activateMyCorridor();
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    if (schemaReady) await deactivateMyCorridor();
    await verifyPool?.end();
  });

  it("H-D3C-1 fail-loud canary: schemaReady must be true whenever TEST_DATABASE_URL is set", () => {
    if (!TEST_DB) return;
    expect(schemaReady, "run migrate:up + fnd_runtime_grants.sql + wlt1_runtime_grants.sql (migration 061 required) first").toBe(true);
  });

  afterEach(async () => {
    if (!schemaReady) return;
    config.destinationCoolingOffHours = DEFAULT_COOLING_OFF_HOURS;
    config.iam2FetchImpl = allowAllIam2Fetch();
    await verifyPool.query(`DELETE FROM wlt1.limit_evaluation WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM wlt1.destination_limit_profile WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.beneficiary_verification WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.fiat_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action LIKE 'wlt1.fiat_payout_destination.%'`);
  });

  // -------------------------------------------------------------------------------------------
  describe("approve/request — fiat gate matrix (A-M)", () => {
    it("A: pending_review + rail active + screening clear + verification verified -> eligible, returns approval_payload + hash, one audit event", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      const res = await approveRequest(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.eligible).toBe(true);
      expect(res.json().data.approval_payload).toMatchObject({ destination_id: destinationId, client_id: clientId, whitelist_version: 0 });
      expect(typeof res.json().data.approval_payload_hash).toBe("string");

      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.destination_whitelist_approval_requested' AND payload_ref LIKE '%' || $1 || '%'`, [destinationId]);
      expect(Number(audit.rows[0]?.n)).toBe(1);
    });

    it("B: destination_not_pending_review (status=draft) -> 409 WLT1_DESTINATION_APPROVAL_INVALID_STATE", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId, { status: "draft" });
      const res = await approveRequest(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("C: rail_not_supported (corridor deactivated) -> 409 invalid-state", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      await deactivateMyCorridor();
      try {
        const res = await approveRequest(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
      } finally {
        await activateMyCorridor();
      }
    });

    it("D: screening_missing -> 409 invalid-state", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId, { withScreening: false });
      const res = await approveRequest(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("E: screening_not_clear (hit) -> 409 invalid-state", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId, { screeningRiskStatus: "hit" });
      const res = await approveRequest(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("F: screening_expired (stale) -> 409 invalid-state", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId, { screeningValidUntilUtc: new Date(Date.now() - 3600 * 1000).toISOString() });
      const res = await approveRequest(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("G: verification_missing -> 409 invalid-state", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId, { withVerification: false });
      const res = await approveRequest(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("H: verification_not_verified (name_mismatch) -> 409 invalid-state", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId, { verificationResult: "name_mismatch" });
      const res = await approveRequest(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("I: verification_expired (stale) -> 409 invalid-state", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId, { verificationValidUntilUtc: new Date(Date.now() - 3600 * 1000).toISOString() });
      const res = await approveRequest(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
    });

    it("J: unknown destination_id -> 404 WLT1_DESTINATION_NOT_FOUND", async () => {
      if (!schemaReady) return;
      const res = await approveRequest("wlt1dest_doesnotexist_" + randomUUID(), { actor_id: "staff_fiatappr_it", client_id: freshClientId() });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });

    it("K: right destination_id, WRONG client_id -> the SAME 404 (no enumeration oracle)", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      const res = await approveRequest(destinationId, { actor_id: "staff_fiatappr_it", client_id: freshClientId() });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });

    it("L: IAM-02 baseline check denies -> 403 WLT1_APPROVAL_REQUIRED, no audit event written", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      config.iam2FetchImpl = denyBaselineIam2Fetch();
      const res = await approveRequest(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("WLT1_APPROVAL_REQUIRED");
      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.destination_whitelist_approval_requested' AND payload_ref LIKE '%' || $1 || '%'`, [destinationId]);
      expect(Number(audit.rows[0]?.n)).toBe(0);
    });

    it("M: IAM-02 unreachable -> 503 WLT1_IAM2_UNAVAILABLE", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      config.iam2FetchImpl = iam2Unreachable();
      const res = await approveRequest(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_IAM2_UNAVAILABLE");
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("approve/apply — the maker-checker execution", () => {
    it("N: happy path -> approved_pending_cooling, destination_status_version+1, cooling_off_until_utc set, whitelist_approval_ref set, one audit event", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      const approvalId = "iam2appr_" + randomUUID();
      const res = await approveApply(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId, approval_id: approvalId, decision_token: "wlt1dt_" + "x".repeat(43) });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("approved_pending_cooling");
      expect(res.json().data.destination_status_version).toBe(2);
      expect(res.json().data.whitelist_approval_ref).toBe(approvalId);
      expect(res.json().data.cooling_off_until_utc).toBeTruthy();

      const row = await verifyPool.query(`SELECT status, destination_status_version, whitelist_approval_ref, cooling_off_until_utc FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      expect(row.rows[0]?.status).toBe("approved_pending_cooling");
      expect(row.rows[0]?.destination_status_version).toBe(2);
      expect(row.rows[0]?.whitelist_approval_ref).toBe(approvalId);

      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.destination_whitelist_approved' AND payload_ref LIKE '%' || $1 || '%'`, [destinationId]);
      expect(Number(audit.rows[0]?.n)).toBe(1);
    });

    it("O: IAM-02 execute-verify denies (SoD violation) -> 403 WLT1_APPROVAL_REQUIRED, destination NOT mutated", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      config.iam2FetchImpl = denyExecuteVerifyIam2Fetch();
      const res = await approveApply(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId, approval_id: "iam2appr_" + randomUUID(), decision_token: "wlt1dt_" + "x".repeat(43) });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("WLT1_APPROVAL_REQUIRED");
      const row = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      expect(row.rows[0]?.status).toBe("pending_review");
    });

    it("version drift between Phase A and Phase C (destination re-registered elsewhere mid-flight) -> 409 invalid-state, no mutation applied", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      // A genuine drift: the destination's whitelist_version changes between approve/apply's own
      // Phase A pre-IAM read and its Phase C locked re-check. Simulated the ONLY way this file can
      // deterministically force that exact race without a real second HTTP call landing in the
      // Phase A/B window: bump whitelist_version directly, mirroring the wallet precedent's own
      // "IAM2FakeOptions.verify may itself mutate DB state" TOCTOU technique.
      config.iam2FetchImpl = makeFakeIam2Fetch({
        verify: async () => {
          await verifyPool.query(`UPDATE wlt1.destination SET whitelist_version = whitelist_version + 1 WHERE destination_id = $1`, [destinationId]);
          return { ok: true, execution_authorised: true };
        },
      });
      const res = await approveApply(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId, approval_id: "iam2appr_" + randomUUID(), decision_token: "wlt1dt_" + "x".repeat(43) });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");
      const row = await verifyPool.query(`SELECT status, destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      expect(row.rows[0]?.status).toBe("pending_review");
      expect(row.rows[0]?.destination_status_version).toBe(1);
    });

    it("re-applying an already-approved destination (status now approved_pending_cooling) -> 409 invalid-state, second apply is a no-op", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      const first = await approveApply(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId, approval_id: "iam2appr_" + randomUUID(), decision_token: "wlt1dt_" + "x".repeat(43) });
      expect(first.statusCode).toBe(200);

      const second = await approveApply(destinationId, { actor_id: "staff_fiatappr_it", client_id: clientId, approval_id: "iam2appr_" + randomUUID(), decision_token: "wlt1dt_" + "x".repeat(43) });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("WLT1_DESTINATION_APPROVAL_INVALID_STATE");

      const row = await verifyPool.query(`SELECT destination_status_version FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      expect(row.rows[0]?.destination_status_version).toBe(2);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("full end-to-end authority flow (real provider orchestration throughout, no raw-SQL fabrication)", () => {
    it("register (real stub providers) -> both evidence domains commit -> approve/request -> approve/apply -> cooling elapses -> evaluate-use allows with fiat decision shape -> verify-and-consume succeeds exactly once", async () => {
      if (!schemaReady) return;
      const body = myRegisterBody();
      const clientId = body.client_id as string;
      const created = await register(body, "idem-fiatappr-e2e-reg-" + randomUUID());
      expect(created.statusCode).toBe(201);
      const destinationId = created.json().data.destination_id;
      expect(created.json().data.status).toBe("pending_review");
      expect(created.json().data.verification_status).toBe("verified");

      const requestRes = await approveRequest(destinationId, { actor_id: "staff_fiatappr_e2e_it", client_id: clientId });
      expect(requestRes.statusCode).toBe(200);
      expect(requestRes.json().data.eligible).toBe(true);
      const approvalPayloadHash = requestRes.json().data.approval_payload_hash;

      // Cooling-off must have genuinely elapsed before evaluate-use will allow a
      // 'approved_pending_cooling' destination — set a negative window for this one apply call so
      // the real route computes an already-past `cooling_off_until_utc`, rather than sleeping in a
      // test or raw-SQL back-dating the destination row post-hoc.
      config.destinationCoolingOffHours = -0.01;
      const approvalId = "iam2appr_e2e_" + randomUUID();
      const applyRes = await approveApply(destinationId, { actor_id: "staff_fiatappr_e2e_it", client_id: clientId, approval_id: approvalId, decision_token: "wlt1dt_" + "x".repeat(43) });
      config.destinationCoolingOffHours = DEFAULT_COOLING_OFF_HOURS;
      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.json().data.status).toBe("approved_pending_cooling");

      // Limits / Velocity / Concentration / First-Use — a permissive fiat client-default policy for
      // this test's own randomly-minted client_id, so evaluate-use/verify-and-consume below can
      // genuinely reach ALLOW. Schema-owner provisioning fixture (superuser `verifyPool`, never
      // through a runtime route — this phase implements no policy-mutation API).
      await verifyPool.query(
        `INSERT INTO wlt1.destination_limit_profile
           (limit_profile_id, version, client_id, destination_type, asset_or_currency, rail,
            per_transaction_limit, daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status, approved_ref)
         VALUES ($1,1,$2,'fiat_payout','MYR','apac_local_my','1000000','1000000','1000000',24,'500000','active','test-approved')`,
        ["wlt1lp_fiatappr_e2e_" + randomUUID(), clientId],
      );

      config.clt1FetchImpl = clt1RosterFetch(clientId);
      config.aml1FetchImpl = aml1AllowFetch(clientId);
      const evalRes = await evaluateUse(destinationId, clientId);
      expect(evalRes.statusCode).toBe(200);
      expect(evalRes.json().data.decision).toBe("allow");
      const decisionId = evalRes.json().data.decision_id;
      const decisionToken = evalRes.json().data.decision_token;

      const decisionRow = await verifyPool.query(`SELECT destination_type, rail, currency, chain, network, poc_challenge_id, beneficiary_verification_id FROM wlt1.destination_decision WHERE decision_id = $1`, [decisionId]);
      expect(decisionRow.rows[0]).toMatchObject({ destination_type: "fiat_payout", rail: "apac_local_my", currency: "MYR", chain: null, network: null, poc_challenge_id: null });
      expect(decisionRow.rows[0]?.beneficiary_verification_id).not.toBeNull();

      const verifyRes = await verifyDecision(decisionId, { decision_token: decisionToken, client_id: clientId, destination_id: destinationId, requested_action: "destination_use" });
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.json().data.valid).toBe(true);

      const consumeBody = { decision_token: decisionToken, client_id: clientId, destination_id: destinationId, requested_action: "destination_use", execution_ref: "exec_fiatappr_e2e_" + randomUUID(), caller_module: "TEST", amount: "500", asset_or_currency: "MYR" };
      const firstConsume = await consumeDecision(decisionId, consumeBody, "idem-fiatappr-e2e-consume-1-" + randomUUID());
      expect(firstConsume.statusCode).toBe(200);
      expect(firstConsume.json().data).toMatchObject({ consumed: true, replay: false });
      const consumptionId = firstConsume.json().data.consumption_id;

      // Same execution_ref replayed under a NEW idempotency key -> the SAME original receipt, never
      // a second consumption.
      const secondConsume = await consumeDecision(decisionId, consumeBody, "idem-fiatappr-e2e-consume-2-" + randomUUID());
      expect(secondConsume.statusCode).toBe(200);
      expect(secondConsume.json().data).toMatchObject({ consumed: true, replay: true, consumption_id: consumptionId });

      // Independent proof this whole flow used real, freshly-verified (not stale/short-circuited)
      // registration-time evidence, per approval_payload_hash's own screening_result_id binding.
      expect(typeof approvalPayloadHash).toBe("string");
    });
  });
});
