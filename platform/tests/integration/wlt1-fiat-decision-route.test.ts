/**
 * WLT-01 Fiat Payout Destinations (APAC) — DB-gated integration tests for the fiat path through
 * `POST /internal/wlt1/destinations/:destination_id/evaluate-use`,
 * `POST /internal/wlt1/destination-decisions/:decision_id/verify`, and
 * `POST /internal/wlt1/destination-decisions/:decision_id/verify-and-consume`. Self-skips unless
 * `TEST_DATABASE_URL` is set (mirrors `tests/integration/wlt1-payout-destination-route.test.ts`'s
 * own harness exactly).
 *
 * Fixture destinations are seeded DIRECTLY via SQL (superuser `verifyPool`, never through the
 * registration route) — this file's own concern is the EVALUATE-USE / VERIFY / CONSUME fiat gate
 * logic, not registration (already covered in `wlt1-payout-destination-route.test.ts`). This
 * mirrors the established privileged-fixture convention used throughout this codebase's own
 * migration-regression test files.
 *
 * P-ROSTER (CLT-01) and AML-01 are both stubbed via `config.clt1FetchImpl`/`config.aml1FetchImpl`
 * — own copy of the fake-fetch shape `wlt1-evaluate-use-route.test.ts` already established,
 * F3(c)-adjacent (test files, not services, but the same "no live dependency process" discipline).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { initPool, closePool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { computeBeneficiaryNameHash, normalizeBeneficiaryName } from "../../services/wlt1/src/lib/fiat/beneficiary-name.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_app_test";
const OWNED_CLIENT_PREFIX = "clt1client_fiatdec_";
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

// -------------------------------------------------------------------------------------------
// P-ROSTER (CLT-01) fake fetch — own copy, mirrors wlt1-evaluate-use-route.test.ts's own shape.
// -------------------------------------------------------------------------------------------
type RosterMode = { kind: "ok"; refs: string[] } | { kind: "unavailable" };

function clt1RosterFetch(clientId: string, mode: RosterMode = { kind: "ok", refs: ["ap_1"] }): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/authorised-parties/active-refs")) {
      if (mode.kind === "unavailable") return { ok: false, status: 500, json: async () => ({}) } as Response;
      return { ok: true, json: async () => ({ success: true, data: { client_id: clientId, authorised_party_refs: mode.refs } }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: { client_id: clientId, status: "active" } }) } as Response;
  }) as typeof fetch;
}

// -------------------------------------------------------------------------------------------
// AML-01 fake fetch — own copy, mirrors wlt1-evaluate-use-route.test.ts's own shape. Asserts the
// request body carries NO chain/network keys for the fiat path (the frozen fiat AML-context rule).
// -------------------------------------------------------------------------------------------
type AmlMode = { kind: "allow" } | { kind: "deny" };

function aml1Fetch(clientId: string, mode: AmlMode = { kind: "allow" }): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const parsedBody = init?.body ? JSON.parse(init.body as string) : {};
    if ("chain" in parsedBody || "network" in parsedBody) {
      throw new Error("TEST ASSERTION FAILURE: fiat AML-01 call must omit chain/network entirely");
    }
    const now = new Date();
    if (mode.kind === "deny") {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { decision: "deny", decision_id: "aml1ptd_" + randomUUID(), reason_code: "evidence_sanctioned", evaluated_at_utc: now.toISOString(), valid_until_utc: new Date(now.getTime() + AML_VALID_MINUTES_DEFAULT * 60_000).toISOString(), evidence_provider_ids: ["stub-v1"], client_id: clientId, requested_action: "destination_use" },
        }),
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: { decision: "allow", decision_id: "aml1ptd_" + randomUUID(), reason_code: "evidence_clear", evaluated_at_utc: now.toISOString(), valid_until_utc: new Date(now.getTime() + AML_VALID_MINUTES_DEFAULT * 60_000).toISOString(), evidence_provider_ids: ["stub-v1"], client_id: clientId, requested_action: "destination_use" },
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
  verificationResult?: string;
  coolingOffUntilUtc?: string | null;
}

async function createFiatFixture(clientId: string, opts: FiatFixtureOptions = {}): Promise<string> {
  const destinationId = "wlt1dest_fiatdec_" + randomUUID();
  const status = opts.status ?? "active";
  await verifyPool.query(
    `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status, cooling_off_until_utc) VALUES ($1,$2,'fiat_payout',$3,$4,$5)`,
    [destinationId, clientId, "hash_" + randomUUID(), status, opts.coolingOffUntilUtc ?? null],
  );
  await verifyPool.query(
    `INSERT INTO wlt1.fiat_payout_destination (destination_id, beneficiary_name, beneficiary_name_normalized, beneficiary_type, bank_country, bank_identifier, bank_identifier_type, account_identifier_type, account_identifier_masked, account_identifier_hash, account_identifier_encrypted, currency, rail)
     VALUES ($1,'Test User','TEST USER','individual','MY','ABMBMYKL','bic','local_account','••••5678',$2,'ciphertext','MYR','apac_local_my')`,
    [destinationId, "hash_acct_" + destinationId],
  );
  // Limits / Velocity / Concentration / First-Use — a permissive fiat client-default policy for
  // this fixture's own client_id, so any ALLOW-path test reaching evaluate-use/verify-and-consume
  // can genuinely pass. Schema-owner provisioning fixture (superuser `verifyPool`, never through a
  // runtime route — this phase implements no policy-mutation API). Harmless for deny-path tests,
  // which never reach the limits check.
  await verifyPool.query(
    `INSERT INTO wlt1.destination_limit_profile
       (limit_profile_id, version, client_id, destination_type, asset_or_currency, rail,
        per_transaction_limit, daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status, approved_ref)
     VALUES ($1,1,$2,'fiat_payout','MYR','apac_local_my','1000000','1000000','1000000',24,'500000','active','test-approved')
     ON CONFLICT DO NOTHING`,
    ["wlt1lp_fiatdec_" + clientId, clientId],
  );
  if (opts.withVerification !== false) {
    // Binding realism: evaluate-use's G6 gate compares this row's own beneficiary_name_hash
    // against `computeBeneficiaryNameHash(destination.beneficiary_name_normalized)`, computed
    // live from the SAME production function — a placeholder literal would fail the binding
    // check even for an otherwise-genuinely-'verified' row.
    const beneficiaryNameHash = computeBeneficiaryNameHash(normalizeBeneficiaryName("Test User"));
    await verifyPool.query(
      `INSERT INTO wlt1.beneficiary_verification (verification_id, destination_id, verification_version, provider_id, provider_adaptor_version, result, beneficiary_name_hash, account_identifier_hash, issued_at_utc, valid_until_utc)
       VALUES ($1,$2,1,'stub-beneficiary-verification-v1','1',$3,$4,$5, now(), now() + interval '1 year')`,
      ["wlt1bv_" + randomUUID(), destinationId, opts.verificationResult ?? "verified", beneficiaryNameHash, "hash_acct_" + destinationId],
    );
  }
  if (opts.withScreening !== false) {
    await verifyPool.query(
      `INSERT INTO wlt1.fiat_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, beneficiary_name_hash, bank_country, beneficiary_type, risk_status, issued_at_utc, valid_until_utc)
       VALUES ($1,$2,1,'stub-fiat-screening-v1','1','hash_name','MY','individual',$3, now(), now() + interval '1 hour')`,
      ["wlt1fscr_" + randomUUID(), destinationId, opts.screeningRiskStatus ?? "clear"],
    );
  }
  return destinationId;
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

describe("WLT-01 Fiat Payout Destinations (APAC) — evaluate-use / verify / verify-and-consume route integration", () => {
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
    app = await buildApp(config);
    await activateMyCorridor();
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    if (schemaReady) await deactivateMyCorridor();
    await verifyPool?.end();
  });

  // H-D3C-1: fail-loud canary — a genuine setup failure must never be silently indistinguishable
  // from "TEST_DATABASE_URL is simply unset". Mirrors the established convention.
  it("H-D3C-1 fail-loud canary: schemaReady must be true whenever TEST_DATABASE_URL is set", () => {
    if (!TEST_DB) return;
    expect(schemaReady, "run migrate:up + fnd_runtime_grants.sql + wlt1_runtime_grants.sql (migration 061 required) first").toBe(true);
  });

  afterEach(async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.limit_evaluation WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM wlt1.destination_limit_profile WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.beneficiary_verification WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.fiat_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
  });

  describe("evaluate-use — fiat gates G1-G7", () => {
    it("all gates pass -> allow, decision persisted with fiat shape (rail/currency set, chain/network NULL, poc_challenge_id NULL, destination_type='fiat_payout')", async () => {
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      config.clt1FetchImpl = clt1RosterFetch(clientId);
      config.aml1FetchImpl = aml1Fetch(clientId);

      const res = await evaluateUse(destinationId, clientId);
      expect(res.statusCode).toBe(200);
      expect(res.json().data.decision).toBe("allow");
      const decisionId = res.json().data.decision_id;

      const row = await verifyPool.query(
        `SELECT destination_type, rail, currency, chain, network, poc_challenge_id, beneficiary_verification_id FROM wlt1.destination_decision WHERE decision_id = $1`,
        [decisionId],
      );
      expect(row.rows[0]).toMatchObject({ destination_type: "fiat_payout", rail: "apac_local_my", currency: "MYR", chain: null, network: null, poc_challenge_id: null });
      expect(row.rows[0]?.beneficiary_verification_id).not.toBeNull();
    });

    it("G1: revoked destination -> destination_revoked", async () => {
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId, { status: "revoked" });
      config.clt1FetchImpl = clt1RosterFetch(clientId);
      config.aml1FetchImpl = aml1Fetch(clientId);
      const res = await evaluateUse(destinationId, clientId);
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "destination_revoked" });
    });

    it("G3: rail not (yet) active -> rail_not_supported", async () => {
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      await deactivateMyCorridor();
      try {
        config.clt1FetchImpl = clt1RosterFetch(clientId);
        config.aml1FetchImpl = aml1Fetch(clientId);
        const res = await evaluateUse(destinationId, clientId);
        expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "rail_not_supported" });
      } finally {
        await activateMyCorridor();
      }
    });

    it("G4: screening not clear -> screening_not_clear", async () => {
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId, { screeningRiskStatus: "high_risk" });
      config.clt1FetchImpl = clt1RosterFetch(clientId);
      config.aml1FetchImpl = aml1Fetch(clientId);
      const res = await evaluateUse(destinationId, clientId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "screening_not_clear" });
    });

    it("G6: no beneficiary verification evidence at all -> beneficiary_verification_invalid", async () => {
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId, { withVerification: false });
      config.clt1FetchImpl = clt1RosterFetch(clientId);
      config.aml1FetchImpl = aml1Fetch(clientId);
      const res = await evaluateUse(destinationId, clientId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "beneficiary_verification_invalid" });
    });

    it("G6: verification result is name_mismatch (not 'verified') -> beneficiary_verification_invalid", async () => {
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId, { verificationResult: "name_mismatch" });
      config.clt1FetchImpl = clt1RosterFetch(clientId);
      config.aml1FetchImpl = aml1Fetch(clientId);
      const res = await evaluateUse(destinationId, clientId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "beneficiary_verification_invalid" });
    });

    it("G7: pending_review status -> destination_not_whitelisted", async () => {
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId, { status: "pending_review" });
      config.clt1FetchImpl = clt1RosterFetch(clientId);
      config.aml1FetchImpl = aml1Fetch(clientId);
      const res = await evaluateUse(destinationId, clientId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "destination_not_whitelisted" });
    });

    it("G7: approved_pending_cooling with cooling elapsed -> allow, lazy-promotes to active", async () => {
      const clientId = freshClientId();
      const past = new Date(Date.now() - 3600_000).toISOString();
      const destinationId = await createFiatFixture(clientId, { status: "approved_pending_cooling", coolingOffUntilUtc: past });
      config.clt1FetchImpl = clt1RosterFetch(clientId);
      config.aml1FetchImpl = aml1Fetch(clientId);
      const res = await evaluateUse(destinationId, clientId);
      expect(res.json().data.decision).toBe("allow");
      const row = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      expect(row.rows[0]?.status).toBe("active");
    });

    it("AML deny -> aml_not_allowed", async () => {
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      config.clt1FetchImpl = clt1RosterFetch(clientId);
      config.aml1FetchImpl = aml1Fetch(clientId, { kind: "deny" });
      const res = await evaluateUse(destinationId, clientId);
      expect(res.json().data).toMatchObject({ decision: "deny", reason_code: "aml_not_allowed" });
    });

    it("the fiat AML-01 call omits chain/network entirely (asserted inside the fetch stub itself — a violation throws and fails the test)", async () => {
      const clientId = freshClientId();
      const destinationId = await createFiatFixture(clientId);
      config.clt1FetchImpl = clt1RosterFetch(clientId);
      config.aml1FetchImpl = aml1Fetch(clientId);
      const res = await evaluateUse(destinationId, clientId);
      expect(res.statusCode).toBe(200);
    });
  });

  describe("decision-verify + verify-and-consume — fiat decisions", () => {
    async function issueFiatDecision(clientId: string): Promise<{ decisionId: string; token: string; destinationId: string }> {
      const destinationId = await createFiatFixture(clientId);
      config.clt1FetchImpl = clt1RosterFetch(clientId);
      config.aml1FetchImpl = aml1Fetch(clientId);
      const res = await evaluateUse(destinationId, clientId);
      expect(res.json().data.decision).toBe("allow");
      return { decisionId: res.json().data.decision_id, token: res.json().data.decision_token, destinationId };
    }

    it("verify: a genuinely valid fiat decision returns valid:true", async () => {
      const clientId = freshClientId();
      const { decisionId, token, destinationId } = await issueFiatDecision(clientId);
      const res = await verifyDecision(decisionId, { decision_token: token, client_id: clientId, destination_id: destinationId, requested_action: "destination_use" });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.valid).toBe(true);
    });

    it("verify: wrong client_id -> binding_mismatch (never a 404, never token_mismatch)", async () => {
      const clientId = freshClientId();
      const { decisionId, token, destinationId } = await issueFiatDecision(clientId);
      const res = await verifyDecision(decisionId, { decision_token: token, client_id: freshClientId(), destination_id: destinationId, requested_action: "destination_use" });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ valid: false, reason_code: "binding_mismatch" });
    });

    it("verify: wrong token -> token_mismatch, indistinguishable from an unknown decision_id", async () => {
      const clientId = freshClientId();
      const { decisionId, destinationId } = await issueFiatDecision(clientId);
      const res = await verifyDecision(decisionId, { decision_token: "wlt1dt_" + "x".repeat(43), client_id: clientId, destination_id: destinationId, requested_action: "destination_use" });
      expect(res.json().data).toMatchObject({ valid: false, reason_code: "token_mismatch" });
    });

    it("consume: consumes exactly once; a replay with the SAME execution_ref returns the ORIGINAL consumption receipt", async () => {
      const clientId = freshClientId();
      const { decisionId, token, destinationId } = await issueFiatDecision(clientId);
      const executionRef = "exec_" + randomUUID();
      const body = { decision_token: token, client_id: clientId, destination_id: destinationId, requested_action: "destination_use", execution_ref: executionRef, caller_module: "TEST", amount: "500", asset_or_currency: "MYR" };

      const first = await consumeDecision(decisionId, body, "idem-consume-1-" + randomUUID());
      expect(first.statusCode).toBe(200);
      expect(first.json().data).toMatchObject({ consumed: true, replay: false });
      const consumptionId = first.json().data.consumption_id;

      const second = await consumeDecision(decisionId, body, "idem-consume-2-" + randomUUID());
      expect(second.statusCode).toBe(200);
      expect(second.json().data).toMatchObject({ consumed: true, replay: true, consumption_id: consumptionId });
    });

    it("consume: a SECOND distinct execution_ref against an already-consumed decision is denied 'already_consumed'", async () => {
      const clientId = freshClientId();
      const { decisionId, token, destinationId } = await issueFiatDecision(clientId);
      const body1 = { decision_token: token, client_id: clientId, destination_id: destinationId, requested_action: "destination_use", execution_ref: "exec_" + randomUUID(), caller_module: "TEST", amount: "500", asset_or_currency: "MYR" };
      const first = await consumeDecision(decisionId, body1, "idem-consume-3a-" + randomUUID());
      expect(first.json().data.consumed).toBe(true);

      const body2 = { ...body1, execution_ref: "exec_" + randomUUID() };
      const second = await consumeDecision(decisionId, body2, "idem-consume-3b-" + randomUUID());
      expect(second.json().data).toMatchObject({ consumed: false, reason_code: "already_consumed" });
    });

    it("consume: after the destination is revoked, an unconsumed fiat decision is denied 'revoked'", async () => {
      const clientId = freshClientId();
      const { decisionId, token, destinationId } = await issueFiatDecision(clientId);
      await app.inject({ method: "POST", url: `/internal/wlt1/destinations/${destinationId}/revoke`, headers: { ...INTERNAL_HEADERS, "idempotency-key": "idem-revoke-" + randomUUID() }, payload: { client_id: clientId, reason_code: "compromise", actor_id: "staff_fiatdec_it" } });

      const body = { decision_token: token, client_id: clientId, destination_id: destinationId, requested_action: "destination_use", execution_ref: "exec_" + randomUUID(), caller_module: "TEST", amount: "500", asset_or_currency: "MYR" };
      const res = await consumeDecision(decisionId, body, "idem-consume-4-" + randomUUID());
      expect(res.json().data).toMatchObject({ consumed: false, reason_code: "revoked" });
    });
  });
});
