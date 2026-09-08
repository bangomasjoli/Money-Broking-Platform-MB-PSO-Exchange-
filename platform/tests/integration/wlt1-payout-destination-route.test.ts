/**
 * WLT-01 Fiat Payout Destinations (APAC) — DB-gated integration tests for
 * `POST /internal/wlt1/payout-destinations`, `GET /internal/wlt1/payout-destinations/:destination_id`,
 * and `POST /internal/wlt1/payout-destinations/:destination_id/assess`. Self-skips unless
 * `TEST_DATABASE_URL` points at a Postgres that already has migration 061 applied, with
 * `fnd_runtime_grants.sql` and `wlt1_runtime_grants.sql` applied (mirrors
 * `tests/integration/wlt1-db.test.ts`'s own established harness exactly — own copy per file,
 * consistent with this codebase's per-file DB-gated-integration convention).
 *
 * Connects as `role_wlt1_runtime` via a real LOGIN role, never postgres superuser, for the app
 * itself. A separate superuser `verifyPool` is used for fixture setup (activating a coverage
 * corridor, planting a stub CLT-01 client) and independent verification.
 *
 * CLT-01 is stubbed per-test via `config.clt1FetchImpl` — no live CLT-01 process is started.
 * Beneficiary-verification and fiat-screening providers are the real deterministic STUB providers
 * (`stub-beneficiary-verification-v1` / `stub-fiat-screening-v1`), driven via their own exported
 * fixture name constants — never a hand-rolled fetch stub, since both providers are in-process,
 * not HTTP.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { initPool, closePool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { evaluateFiatApprovalGates } from "../../services/wlt1/src/lib/destination-approval.js";
import {
  WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH,
  WLT1_TEST_STUB_BENEFICIARY_NOT_SUPPORTED,
  WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE,
  WLT1_TEST_STUB_BENEFICIARY_VERIFIED,
} from "../../services/wlt1/src/lib/beneficiary-verification/stub-provider.js";
import {
  WLT1_TEST_STUB_FIAT_SCREENING_BIC,
  WLT1_TEST_STUB_FIAT_SCREENING_CLEAR,
  WLT1_TEST_STUB_FIAT_SCREENING_HIT,
  WLT1_TEST_STUB_FIAT_SCREENING_UNAVAILABLE,
} from "../../services/wlt1/src/lib/fiat-screening/stub-provider.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_app_test";

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

type CltOutcome = "active" | "active_limited" | "suspended" | "not_found" | "unreachable";

function makeClt1StatusFetch(statusByClientId: Record<string, CltOutcome>): typeof fetch {
  return (async (url: unknown) => {
    const urlStr = String(url);
    const match = /\/internal\/clt1\/clients\/([^/]+)\/status$/.exec(urlStr);
    const clientId = match?.[1] ? decodeURIComponent(match[1]) : undefined;
    const outcome = clientId ? statusByClientId[clientId] : undefined;
    if (outcome === "unreachable") throw new Error("network down");
    if (outcome === undefined || outcome === "not_found") {
      return { ok: false, status: 404, json: async () => ({ success: false }) } as unknown as Response;
    }
    if (outcome === "suspended") {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { client_id: clientId, status: "suspended" } }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: { client_id: clientId, status: outcome } }) } as unknown as Response;
  }) as unknown as typeof fetch;
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
  return "clt1client_fiatit_" + randomUUID().replace(/-/g, "").slice(0, 16);
}

function myBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    client_id: freshClientId(),
    beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED,
    beneficiary_type: "individual",
    account_identifier_type: "local_account",
    account_identifier: "12345678",
    bank_identifier: "ABMBMYKL",
    bank_identifier_type: "bic",
    bank_country: "MY",
    currency: "MYR",
    rail: "apac_local_my",
    ...overrides,
  };
}

function hkBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    client_id: freshClientId(),
    beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED,
    beneficiary_type: "individual",
    account_identifier_type: "local_account",
    account_identifier: "123456",
    bank_identifier: "HSBCHKHH",
    bank_identifier_type: "bic",
    branch_identifier: "004",
    bank_country: "HK",
    currency: "HKD",
    rail: "apac_local_hk",
    ...overrides,
  };
}

async function activateCorridor(rail: string, bankCountry: string, currency: string): Promise<void> {
  await verifyPool.query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'active' WHERE rail = $1 AND bank_country = $2 AND currency = $3`, [rail, bankCountry, currency]);
}

async function deactivateCorridor(rail: string, bankCountry: string, currency: string): Promise<void> {
  await verifyPool.query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'inactive' WHERE rail = $1 AND bank_country = $2 AND currency = $3`, [rail, bankCountry, currency]);
}

function register(body: Record<string, unknown>, idemKey: string, clt: CltOutcome = "active") {
  config.clt1FetchImpl = makeClt1StatusFetch({ [body.client_id as string]: clt });
  return app.inject({ method: "POST", url: "/internal/wlt1/payout-destinations", headers: { ...INTERNAL_HEADERS, "idempotency-key": idemKey }, payload: body });
}

function getDestination(destinationId: string, clientId: string) {
  return app.inject({ method: "GET", url: `/internal/wlt1/payout-destinations/${destinationId}?client_id=${encodeURIComponent(clientId)}`, headers: INTERNAL_HEADERS });
}

function assess(destinationId: string, clientId: string, idemKey: string, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/payout-destinations/${destinationId}/assess`,
    headers: { ...INTERNAL_HEADERS, "idempotency-key": idemKey },
    payload: { client_id: clientId, ...overrides },
  });
}

async function countVerificationRows(destinationId: string): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.beneficiary_verification WHERE destination_id = $1`, [destinationId]);
  return Number(r.rows[0]?.n ?? 0);
}

async function countScreeningRows(destinationId: string): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.fiat_screening_result WHERE destination_id = $1`, [destinationId]);
  return Number(r.rows[0]?.n ?? 0);
}

async function countRevocationRows(destinationId: string): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_revocation WHERE destination_id = $1`, [destinationId]);
  return Number(r.rows[0]?.n ?? 0);
}

async function getDestinationCore(destinationId: string): Promise<{ status: string; revocation_epoch: number }> {
  const r = await verifyPool.query(`SELECT status, revocation_epoch FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  return { status: r.rows[0]?.status, revocation_epoch: Number(r.rows[0]?.revocation_epoch ?? 0) };
}

async function loadLatestScreeningSnapshot(destinationId: string): Promise<{ screeningResultId: string; riskStatus: string; validUntilUtc: Date | null } | null> {
  const r = await verifyPool.query(
    `SELECT screening_result_id, risk_status, valid_until_utc FROM wlt1.fiat_screening_result WHERE destination_id = $1 ORDER BY screening_result_version DESC LIMIT 1`,
    [destinationId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { screeningResultId: row.screening_result_id, riskStatus: row.risk_status, validUntilUtc: row.valid_until_utc };
}

async function loadLatestVerificationSnapshot(destinationId: string): Promise<{ verificationId: string; result: string; validUntilUtc: Date | null } | null> {
  const r = await verifyPool.query(
    `SELECT verification_id, result, valid_until_utc FROM wlt1.beneficiary_verification WHERE destination_id = $1 ORDER BY verification_version DESC LIMIT 1`,
    [destinationId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { verificationId: row.verification_id, result: row.result, validUntilUtc: row.valid_until_utc };
}

/** Computes the SAME approval-eligibility verdict the real approve/request route would compute,
 * from genuinely-persisted state — never a hand-rolled duplicate of the gate logic itself. Used
 * only to prove the registration-time evidence STRUCTURALLY implies a given approval verdict; the
 * actual approve/request and approve/apply routes are exercised end-to-end separately in
 * wlt1-fiat-approval-route.test.ts. */
async function computeApprovalEligibility(destinationId: string, railCoverageOk = true): Promise<ReturnType<typeof evaluateFiatApprovalGates>> {
  const core = await getDestinationCore(destinationId);
  const screening = await loadLatestScreeningSnapshot(destinationId);
  const verification = await loadLatestVerificationSnapshot(destinationId);
  return evaluateFiatApprovalGates({ status: core.status, railCoverageOk, screening, verification, nowUtc: new Date() });
}

describe("WLT-01 Fiat Payout Destinations (APAC) — route integration", () => {
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
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
    await verifyPool?.end();
  });

  // H-D3C-1: fail-loud canary — a genuine setup failure (bad TEST_DATABASE_URL, missing migration
  // 061, missing grants) must never be silently indistinguishable from "TEST_DATABASE_URL is
  // simply unset". Mirrors the established convention (wlt1-db.test.ts and siblings).
  it("H-D3C-1 fail-loud canary: schemaReady must be true whenever TEST_DATABASE_URL is set", () => {
    if (!TEST_DB) return;
    expect(schemaReady, "run migrate:up + fnd_runtime_grants.sql + wlt1_runtime_grants.sql (migration 061 required) first").toBe(true);
  });

  afterEach(async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.beneficiary_verification WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE 'clt1client_fiatit_%')`);
    await verifyPool.query(`DELETE FROM wlt1.fiat_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE 'clt1client_fiatit_%')`);
    await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE 'clt1client_fiatit_%')`);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id LIKE 'clt1client_fiatit_%'`);
    await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action LIKE 'wlt1.fiat_payout_destination.%'`);
  });

  // -------------------------------------------------------------------------------------------
  describe("coverage deny-by-default (the centerpiece acceptance property)", () => {
    it("every corridor ships supported+inactive — registration against a genuinely correct MY request fails WLT1_FIAT_RAIL_NOT_SUPPORTED (409) while the corridor is dormant", async () => {
      if (!schemaReady) return;
      const res = await register(myBody(), "idem-cov-dormant-" + randomUUID());
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_FIAT_RAIL_NOT_SUPPORTED");
    });

    it("activating exactly the MY corridor permits MY registration while SG/HK/ID remain denied", async () => {
      if (!schemaReady) return;
      await activateCorridor("apac_local_my", "MY", "MYR");
      try {
        const okRes = await register(myBody(), "idem-cov-my-active-" + randomUUID());
        expect(okRes.statusCode).toBe(201);

        const sgRes = await register(
          { client_id: freshClientId(), beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED, beneficiary_type: "individual", account_identifier_type: "local_account", account_identifier: "12345678", bank_identifier: "DBSSSGSG", bank_identifier_type: "bic", bank_country: "SG", currency: "SGD", rail: "apac_local_sg" },
          "idem-cov-sg-still-inactive-" + randomUUID(),
        );
        expect(sgRes.statusCode).toBe(409);
        expect(sgRes.json().error.code).toBe("WLT1_FIAT_RAIL_NOT_SUPPORTED");
      } finally {
        await deactivateCorridor("apac_local_my", "MY", "MYR");
      }
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("registration — validation (account/BIC/branch canonicalisation)", () => {
    it("MY: non-digit account_identifier -> 422 WLT1_ACCOUNT_IDENTIFIER_INVALID, never echoes the rejected value", async () => {
      if (!schemaReady) return;
      const res = await register(myBody({ account_identifier: "1234abcd" }), "idem-val-1-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_ACCOUNT_IDENTIFIER_INVALID");
      expect(JSON.stringify(res.json())).not.toContain("1234abcd");
    });

    it("MY: BIC naming the wrong country -> 422", async () => {
      if (!schemaReady) return;
      const res = await register(myBody({ bank_identifier: "DBSSSGSG" }), "idem-val-2-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_ACCOUNT_IDENTIFIER_INVALID");
    });

    it("MY: currency/rail not matching the bank_country profile -> 422", async () => {
      if (!schemaReady) return;
      const res = await register(myBody({ currency: "SGD" }), "idem-val-3-" + randomUUID());
      expect(res.statusCode).toBe(422);
    });

    it("MY: supplying a branch_identifier (forbidden for non-HK) -> 422", async () => {
      if (!schemaReady) return;
      const res = await register(myBody({ branch_identifier: "004" }), "idem-val-4-" + randomUUID());
      expect(res.statusCode).toBe(422);
    });

    it("HK: omitting the required branch_identifier -> 422", async () => {
      if (!schemaReady) return;
      const body = hkBody();
      delete body.branch_identifier;
      const res = await register(body, "idem-val-5-" + randomUUID());
      expect(res.statusCode).toBe(422);
    });

    it("HK: a wrong-length branch_identifier -> 422", async () => {
      if (!schemaReady) return;
      const res = await register(hkBody({ branch_identifier: "04" }), "idem-val-6-" + randomUUID());
      expect(res.statusCode).toBe(422);
    });

    it("account_identifier_type other than 'local_account' is rejected by the schema itself (400 VALIDATION_ERROR)", async () => {
      if (!schemaReady) return;
      const res = await register(myBody({ account_identifier_type: "iban" }), "idem-val-7-" + randomUUID());
      expect(res.statusCode).toBe(400);
    });

    it("an unknown top-level field is rejected (additionalProperties:false)", async () => {
      if (!schemaReady) return;
      const res = await register(myBody({ unexpected_field: "x" }), "idem-val-8-" + randomUUID());
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("registration — happy path (MY active corridor) + provider outcomes", () => {
    beforeAll(async () => {
      if (!schemaReady) return;
      await activateCorridor("apac_local_my", "MY", "MYR");
    });
    afterAll(async () => {
      if (!schemaReady) return;
      await deactivateCorridor("apac_local_my", "MY", "MYR");
    });

    it("verified + clear -> 201, destination pending_review, verification_status='verified', safe projection never leaks the account", async () => {
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED });
      const res = await register(body, "idem-happy-1-" + randomUUID());
      expect(res.statusCode).toBe(201);
      const json = res.json().data;
      expect(json.status).toBe("pending_review");
      expect(json.verification_status).toBe("verified");
      expect(json.account_identifier_masked).toBe("••••5678");
      const raw = JSON.stringify(res.json());
      expect(raw).not.toContain("12345678");
      expect(raw).not.toMatch(/"account_identifier":/);
      expect(raw).not.toMatch(/"account_identifier_hash":/);
      expect(raw).not.toMatch(/"account_identifier_encrypted":/);
    });

    it("name_mismatch verification result -> 201, destination still promoted to pending_review (screening alone is a terminal domain), verification_status='name_mismatch'", async () => {
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH });
      const res = await register(body, "idem-happy-2-" + randomUUID());
      expect(res.statusCode).toBe(201);
      expect(res.json().data.verification_status).toBe("name_mismatch");
      expect(res.json().data.status).toBe("pending_review");
    });

    it("both providers technically unavailable -> 201, destination remains draft (zero terminal evidence), verification_status stays 'pending'", async () => {
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE });
      const res = await register(body, "idem-happy-3-" + randomUUID());
      expect(res.statusCode).toBe(201);
      expect(res.json().data.status).toBe("draft");
      expect(res.json().data.verification_status).toBe("pending");
    });

    it("H-3 CLOSURE — a genuine hit-risk screening result (real provider orchestration, no raw-SQL fabrication) does NOT auto-revoke a freshly-created destination and structurally blocks approval", async () => {
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED, bank_identifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.HIT });
      const res = await register(body, "idem-h3-hit-" + randomUUID());
      expect(res.statusCode).toBe(201);
      const destinationId = res.json().data.destination_id;
      expect(res.json().data.status).toBe("pending_review");

      const screening = await loadLatestScreeningSnapshot(destinationId);
      expect(screening?.riskStatus).toBe("hit");

      const core = await getDestinationCore(destinationId);
      expect(core.status).toBe("pending_review");
      expect(core.status).not.toBe("revoked");
      expect(core.revocation_epoch).toBe(0);

      const revocationCount = await countRevocationRows(destinationId);
      expect(revocationCount).toBe(0);

      const rescreeningSourced = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_revocation WHERE destination_id = $1 AND source = 'rescreening'`, [destinationId]);
      expect(Number(rescreeningSourced.rows[0]?.n)).toBe(0);

      const eligibility = await computeApprovalEligibility(destinationId);
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) expect(eligibility.reasonCode).toBe("screening_not_clear");
    });

    it("registration audit metadata never contains the full account, its hash, or the beneficiary name in any form", async () => {
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED, client_id: freshClientId() });
      const res = await register(body, "idem-happy-5-" + randomUUID());
      expect(res.statusCode).toBe(201);
      const rows = await verifyPool.query(`SELECT payload_ref FROM foundation.outbox_event WHERE payload_ref LIKE '%' || $1 || '%'`, [body.client_id]);
      const blob = rows.rows.map((r) => r.payload_ref).join("\n");
      expect(blob).not.toContain("12345678");
      expect(blob.toLowerCase()).not.toContain(String(body.beneficiary_name).toLowerCase());
    });

    it("idempotent replay (same key, same body) returns the SAME destination, does not re-run providers a second time (no new beneficiary_verification/fiat_screening_result row)", async () => {
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED });
      const idemKey = "idem-happy-replay-" + randomUUID();
      const first = await register(body, idemKey);
      expect(first.statusCode).toBe(201);
      const destinationId = first.json().data.destination_id;

      const countBefore = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.beneficiary_verification WHERE destination_id = $1`, [destinationId]);

      const second = await register(body, idemKey);
      expect(second.statusCode).toBe(201);
      expect(second.json().data.destination_id).toBe(destinationId);

      const countAfter = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.beneficiary_verification WHERE destination_id = $1`, [destinationId]);
      expect(countAfter.rows[0]?.n).toBe(countBefore.rows[0]?.n);
    });

    it("the SAME account for a DIFFERENT client is permitted (natural key includes client_id)", async () => {
      const account = "87654321";
      const clientA = freshClientId();
      const clientB = freshClientId();
      const bodyA = myBody({ client_id: clientA, account_identifier: account });
      const bodyB = myBody({ client_id: clientB, account_identifier: account });
      const resA = await register(bodyA, "idem-natkey-a-" + randomUUID());
      const resB = await register(bodyB, "idem-natkey-b-" + randomUUID());
      expect(resA.statusCode).toBe(201);
      expect(resB.statusCode).toBe(201);
      expect(resA.json().data.destination_id).not.toBe(resB.json().data.destination_id);
    });

    it("a duplicate registration of the SAME (client, account) is refused with WLT1_DESTINATION_DUPLICATE", async () => {
      const body = myBody();
      const first = await register(body, "idem-dup-a-" + randomUUID());
      expect(first.statusCode).toBe(201);
      const second = await register({ ...body }, "idem-dup-b-" + randomUUID());
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("WLT1_DESTINATION_DUPLICATE");
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("H-1 CLOSURE — registration outcome matrix (all 10 mandated combinations, real provider orchestration only)", () => {
    beforeAll(async () => {
      if (!schemaReady) return;
      await activateCorridor("apac_local_my", "MY", "MYR");
    });
    afterAll(async () => {
      if (!schemaReady) return;
      await deactivateCorridor("apac_local_my", "MY", "MYR");
    });

    async function registerCase(beneficiaryName: string, bankIdentifier: string, idemKeySuffix: string) {
      const body = myBody({ beneficiary_name: beneficiaryName, bank_identifier: bankIdentifier });
      const res = await register(body, "idem-matrix-" + idemKeySuffix + "-" + randomUUID());
      expect(res.statusCode).toBe(201);
      const destinationId = res.json().data.destination_id;
      return { res, destinationId };
    }

    it("case 1: verified + clear -> both evidence domains commit via the SAME real registration, pending_review, approval eligible", async () => {
      if (!schemaReady) return;
      const { res, destinationId } = await registerCase(WLT1_TEST_STUB_BENEFICIARY_VERIFIED, WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR, "1");
      expect(await countVerificationRows(destinationId)).toBe(1);
      expect(await countScreeningRows(destinationId)).toBe(1);
      expect(res.json().data.status).toBe("pending_review");
      expect(res.json().data.verification_status).toBe("verified");
      const core = await getDestinationCore(destinationId);
      expect(core.status).toBe("pending_review");
      expect(core.revocation_epoch).toBe(0);
      expect(await countRevocationRows(destinationId)).toBe(0);
      const eligibility = await computeApprovalEligibility(destinationId);
      expect(eligibility.eligible).toBe(true);
    });

    it("case 2: verified + review_required -> both rows persisted, pending_review, approval blocked (screening_not_clear)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerCase(WLT1_TEST_STUB_BENEFICIARY_VERIFIED, WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.REVIEW_REQUIRED, "2");
      expect(await countVerificationRows(destinationId)).toBe(1);
      expect(await countScreeningRows(destinationId)).toBe(1);
      const core = await getDestinationCore(destinationId);
      expect(core.status).toBe("pending_review");
      expect(core.revocation_epoch).toBe(0);
      const eligibility = await computeApprovalEligibility(destinationId);
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) expect(eligibility.reasonCode).toBe("screening_not_clear");
    });

    it("case 3: verified + high_risk -> both rows persisted, pending_review, approval blocked (screening_not_clear)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerCase(WLT1_TEST_STUB_BENEFICIARY_VERIFIED, WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.HIGH_RISK, "3");
      expect(await countVerificationRows(destinationId)).toBe(1);
      expect(await countScreeningRows(destinationId)).toBe(1);
      const core = await getDestinationCore(destinationId);
      expect(core.status).toBe("pending_review");
      const eligibility = await computeApprovalEligibility(destinationId);
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) expect(eligibility.reasonCode).toBe("screening_not_clear");
    });

    it("case 4: verified + hit -> both rows persisted, pending_review (not revoked), approval blocked (screening_not_clear)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerCase(WLT1_TEST_STUB_BENEFICIARY_VERIFIED, WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.HIT, "4");
      expect(await countVerificationRows(destinationId)).toBe(1);
      expect(await countScreeningRows(destinationId)).toBe(1);
      const core = await getDestinationCore(destinationId);
      expect(core.status).toBe("pending_review");
      expect(core.revocation_epoch).toBe(0);
      expect(await countRevocationRows(destinationId)).toBe(0);
      const eligibility = await computeApprovalEligibility(destinationId);
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) expect(eligibility.reasonCode).toBe("screening_not_clear");
    });

    it("case 5: verified + screening technical failure (no fixture) -> verification row only, pending_review (verification alone terminal), approval blocked (screening_missing)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerCase(WLT1_TEST_STUB_BENEFICIARY_VERIFIED, "AAAAMYZZ", "5");
      expect(await countVerificationRows(destinationId)).toBe(1);
      expect(await countScreeningRows(destinationId)).toBe(0);
      const core = await getDestinationCore(destinationId);
      expect(core.status).toBe("pending_review");
      const eligibility = await computeApprovalEligibility(destinationId);
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) expect(eligibility.reasonCode).toBe("screening_missing");
    });

    it("case 6: name_mismatch + clear -> both rows persisted, pending_review, approval blocked (verification_not_verified)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerCase(WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH, WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR, "6");
      expect(await countVerificationRows(destinationId)).toBe(1);
      expect(await countScreeningRows(destinationId)).toBe(1);
      const core = await getDestinationCore(destinationId);
      expect(core.status).toBe("pending_review");
      const eligibility = await computeApprovalEligibility(destinationId);
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) expect(eligibility.reasonCode).toBe("verification_not_verified");
    });

    it("case 7: name_mismatch + hit (adverse) -> both rows persisted, pending_review, not revoked, approval blocked (verification_not_verified takes precedence — verification gate evaluated before screening returns clear anyway, but here screening is also non-clear)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerCase(WLT1_TEST_STUB_BENEFICIARY_NAME_MISMATCH, WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.HIT, "7");
      expect(await countVerificationRows(destinationId)).toBe(1);
      expect(await countScreeningRows(destinationId)).toBe(1);
      const core = await getDestinationCore(destinationId);
      expect(core.status).toBe("pending_review");
      expect(core.revocation_epoch).toBe(0);
      expect(await countRevocationRows(destinationId)).toBe(0);
      const eligibility = await computeApprovalEligibility(destinationId);
      expect(eligibility.eligible).toBe(false);
    });

    it("case 8: not_supported + clear -> both rows persisted, pending_review, approval blocked (verification_not_verified)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerCase(WLT1_TEST_STUB_BENEFICIARY_NOT_SUPPORTED, WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR, "8");
      expect(await countVerificationRows(destinationId)).toBe(1);
      expect(await countScreeningRows(destinationId)).toBe(1);
      const core = await getDestinationCore(destinationId);
      expect(core.status).toBe("pending_review");
      const eligibility = await computeApprovalEligibility(destinationId);
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) expect(eligibility.reasonCode).toBe("verification_not_verified");
    });

    it("case 9: verification unavailable + clear -> screening row only (screening alone terminal), pending_review, approval blocked (verification_missing)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerCase(WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE, WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR, "9");
      expect(await countVerificationRows(destinationId)).toBe(0);
      expect(await countScreeningRows(destinationId)).toBe(1);
      const core = await getDestinationCore(destinationId);
      expect(core.status).toBe("pending_review");
      const eligibility = await computeApprovalEligibility(destinationId);
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) expect(eligibility.reasonCode).toBe("verification_missing");
    });

    it("case 10: both domains technically fail -> zero evidence rows, destination stays draft, approval blocked (destination_not_pending_review)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerCase(WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE, WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.UNAVAILABLE, "10");
      expect(await countVerificationRows(destinationId)).toBe(0);
      expect(await countScreeningRows(destinationId)).toBe(0);
      const core = await getDestinationCore(destinationId);
      expect(core.status).toBe("draft");
      expect(core.revocation_epoch).toBe(0);
      const eligibility = await computeApprovalEligibility(destinationId);
      expect(eligibility.eligible).toBe(false);
      if (!eligibility.eligible) expect(eligibility.reasonCode).toBe("destination_not_pending_review");
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("HK profile — branch_identifier as its own structured field", () => {
    beforeAll(async () => {
      if (!schemaReady) return;
      await activateCorridor("apac_local_hk", "HK", "HKD");
    });
    afterAll(async () => {
      if (!schemaReady) return;
      await deactivateCorridor("apac_local_hk", "HK", "HKD");
    });

    it("valid HK registration succeeds, branch_identifier returned unmasked", async () => {
      const res = await register(hkBody(), "idem-hk-1-" + randomUUID());
      expect(res.statusCode).toBe(201);
      expect(res.json().data.branch_identifier).toBe("004");
      expect(res.json().data.bank_identifier).toBe("HSBCHKHH");
    });

    it("HK account below the 6-digit minimum is rejected", async () => {
      const res = await register(hkBody({ account_identifier: "12345" }), "idem-hk-2-" + randomUUID());
      expect(res.statusCode).toBe(422);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("CLT-01 client-status gate (fiat registration reuses the exact wallet precedent)", () => {
    beforeAll(async () => {
      if (!schemaReady) return;
      await activateCorridor("apac_local_my", "MY", "MYR");
    });
    afterAll(async () => {
      if (!schemaReady) return;
      await deactivateCorridor("apac_local_my", "MY", "MYR");
    });

    it("a suspended client is refused with WLT1_CLIENT_STATUS_BLOCKED", async () => {
      const res = await register(myBody(), "idem-clt-1-" + randomUUID(), "suspended");
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_CLIENT_STATUS_BLOCKED");
    });

    it("an unreachable CLT-01 maps to WLT1_CLT1_UNAVAILABLE (503)", async () => {
      const res = await register(myBody(), "idem-clt-2-" + randomUUID(), "unreachable");
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_CLT1_UNAVAILABLE");
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("GET /payout-destinations/:destination_id", () => {
    beforeAll(async () => {
      if (!schemaReady) return;
      await activateCorridor("apac_local_my", "MY", "MYR");
    });
    afterAll(async () => {
      if (!schemaReady) return;
      await deactivateCorridor("apac_local_my", "MY", "MYR");
    });

    it("returns the safe projection for a registered destination", async () => {
      const body = myBody();
      const created = await register(body, "idem-get-1-" + randomUUID());
      const destinationId = created.json().data.destination_id;
      const res = await getDestination(destinationId, body.client_id as string);
      expect(res.statusCode).toBe(200);
      expect(res.json().data.destination_id).toBe(destinationId);
      expect(res.json().data.account_identifier_masked).toMatch(/^••••/);
    });

    it("returns 404 for an unknown destination_id", async () => {
      const res = await getDestination("wlt1dest_doesnotexist_" + randomUUID(), freshClientId());
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });

    it("returns the SAME 404 for the right destination_id with the WRONG client_id (no enumeration oracle)", async () => {
      const body = myBody();
      const created = await register(body, "idem-get-2-" + randomUUID());
      const destinationId = created.json().data.destination_id;
      const res = await getDestination(destinationId, freshClientId());
      expect(res.statusCode).toBe(404);
    });

    it("requires the internal-service-token (schema validation runs before the auth preHandler, so a complete querystring is required to reach the 401, mirroring routes/wallet-destinations.ts's own established precedent)", async () => {
      const res = await app.inject({ method: "GET", url: `/internal/wlt1/payout-destinations/wlt1dest_x?client_id=${freshClientId()}` });
      expect(res.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("assess route — independent dual-domain evaluation", () => {
    beforeAll(async () => {
      if (!schemaReady) return;
      await activateCorridor("apac_local_my", "MY", "MYR");
    });
    afterAll(async () => {
      if (!schemaReady) return;
      await deactivateCorridor("apac_local_my", "MY", "MYR");
    });

    it("both domains already fresh+terminal -> both short_circuited, no new evidence version, no provider re-call", async () => {
      // Registration's own beneficiary_name selects a fixture on BOTH providers independently —
      // the two stub vocabularies are deliberately unrelated (own copy per provider, F3(c)-
      // adjacent), so only the verification domain reaches a terminal fixture match this way
      // (screening technically fails, no_stub_fixture_configured — proven separately below). A
      // fresh screening row is seeded directly here so this test can genuinely exercise BOTH
      // domains' short-circuit path at once.
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED });
      const created = await register(body, "idem-assess-1-" + randomUUID());
      const destinationId = created.json().data.destination_id;
      expect(created.json().data.verification_status).toBe("verified");

      await verifyPool.query(
        `INSERT INTO wlt1.fiat_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, beneficiary_name_hash, bank_country, beneficiary_type, risk_status, issued_at_utc, valid_until_utc)
         VALUES ($1,$2,1,'stub-fiat-screening-v1','1','hash_seed','MY','individual','clear', now(), now() + interval '1 hour')`,
        ["wlt1fscr_" + randomUUID(), destinationId],
      );

      const res = await assess(destinationId, body.client_id as string, "idem-assess-1b-" + randomUUID());
      expect(res.statusCode).toBe(200);
      expect(res.json().data.verification.action).toBe("short_circuited");
      expect(res.json().data.screening.action).toBe("short_circuited");
    });

    it("registration's own screening call against a name with no fiat-screening fixture technically fails — no evidence row, verification is unaffected", async () => {
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED });
      const created = await register(body, "idem-assess-1c-" + randomUUID());
      const destinationId = created.json().data.destination_id;
      const screeningRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.fiat_screening_result WHERE destination_id = $1`, [destinationId]);
      expect(screeningRows.rows[0]?.n).toBe(0);
      expect(created.json().data.verification_status).toBe("verified");
    });

    it("both providers unavailable on a destination with NO prior evidence -> 503, idempotency record not completed (a genuine retry is possible)", async () => {
      // Register with the unavailable fixture so registration itself leaves zero evidence, then
      // assess against the same unavailable fixture name so the assess call's own provider
      // attempts also fail technically.
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE });
      const created = await register(body, "idem-assess-2-" + randomUUID());
      const destinationId = created.json().data.destination_id;
      expect(created.json().data.status).toBe("draft");

      const idemKey = "idem-assess-2b-" + randomUUID();
      const res = await assess(destinationId, body.client_id as string, idemKey);
      expect(res.statusCode).toBe(503);

      const idemRow = await verifyPool.query(`SELECT status FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.fiat_payout_destination.assess' AND idempotency_key = $1`, [idemKey]);
      expect(idemRow.rows[0]?.status).toBe("processing");
    });

    it("assess never returns the account identifier or its hash in any field", async () => {
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED });
      const created = await register(body, "idem-assess-3-" + randomUUID());
      const destinationId = created.json().data.destination_id;
      const res = await assess(destinationId, body.client_id as string, "idem-assess-3b-" + randomUUID());
      const raw = JSON.stringify(res.json());
      expect(raw).not.toContain("12345678");
      expect(raw).not.toMatch(/account_identifier/);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("M-1 CLOSURE — assess account resubmission (fingerprint integrity)", () => {
    beforeAll(async () => {
      if (!schemaReady) return;
      await activateCorridor("apac_local_my", "MY", "MYR");
    });
    afterAll(async () => {
      if (!schemaReady) return;
      await deactivateCorridor("apac_local_my", "MY", "MYR");
    });

    it("a WRONG resubmitted account_identifier -> 422 account_identifier_mismatch, rejected BEFORE any provider call or idempotency-key consumption", async () => {
      if (!schemaReady) return;
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED, account_identifier: "12345678" });
      const created = await register(body, "idem-m1-mismatch-reg-" + randomUUID());
      const destinationId = created.json().data.destination_id;
      const verifBefore = await countVerificationRows(destinationId);
      const screenBefore = await countScreeningRows(destinationId);

      const idemKey = "idem-m1-mismatch-" + randomUUID();
      const res = await assess(destinationId, body.client_id as string, idemKey, { account_identifier: "99999999" });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_ACCOUNT_IDENTIFIER_INVALID");
      expect(res.json().error.details[0]?.issue).toBe("account_identifier_mismatch");
      expect(JSON.stringify(res.json())).not.toContain("99999999");
      expect(JSON.stringify(res.json())).not.toContain("12345678");

      expect(await countVerificationRows(destinationId)).toBe(verifBefore);
      expect(await countScreeningRows(destinationId)).toBe(screenBefore);

      const idemRow = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.fiat_payout_destination.assess' AND idempotency_key = $1`, [idemKey]);
      expect(Number(idemRow.rows[0]?.n)).toBe(0);
    });

    it("Case A — absent account_identifier + screening runs fresh and succeeds -> 200, verification.action=failed, screening.action=performed, idempotency completed", async () => {
      if (!schemaReady) return;
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE, bank_identifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR });
      const created = await register(body, "idem-m1-a-reg-" + randomUUID());
      const destinationId = created.json().data.destination_id;
      expect(await countVerificationRows(destinationId)).toBe(0);
      expect(await countScreeningRows(destinationId)).toBe(1);

      // Permitted use of raw SQL (staleness back-dating a genuinely-persisted row, never
      // fabricating the outcome under test): force the registration-time screening evidence stale
      // so assess must genuinely re-call the (real, deterministic) stub provider rather than
      // short-circuit.
      await verifyPool.query(`UPDATE wlt1.fiat_screening_result SET valid_until_utc = now() - interval '1 hour' WHERE destination_id = $1`, [destinationId]);

      const idemKey = "idem-m1-a-" + randomUUID();
      const res = await assess(destinationId, body.client_id as string, idemKey);
      expect(res.statusCode).toBe(200);
      expect(res.json().data.verification.action).toBe("failed");
      expect(res.json().data.screening.action).toBe("performed");
      expect(res.json().data.screening.screening_result_version).toBe(2);

      const idemRow = await verifyPool.query(`SELECT status FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.fiat_payout_destination.assess' AND idempotency_key = $1`, [idemKey]);
      expect(idemRow.rows[0]?.status).toBe("completed");
    });

    it("Case B — absent account_identifier + screening technically fails again -> 503, idempotency left processing (retryable)", async () => {
      if (!schemaReady) return;
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE, bank_identifier: "AAAAMYYY" });
      const created = await register(body, "idem-m1-b-reg-" + randomUUID());
      const destinationId = created.json().data.destination_id;
      expect(created.json().data.status).toBe("draft");
      expect(await countVerificationRows(destinationId)).toBe(0);
      expect(await countScreeningRows(destinationId)).toBe(0);

      const idemKey = "idem-m1-b-" + randomUUID();
      const res = await assess(destinationId, body.client_id as string, idemKey);
      expect(res.statusCode).toBe(503);

      expect(await countVerificationRows(destinationId)).toBe(0);
      expect(await countScreeningRows(destinationId)).toBe(0);
      const idemRow = await verifyPool.query(`SELECT status FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.fiat_payout_destination.assess' AND idempotency_key = $1`, [idemKey]);
      expect(idemRow.rows[0]?.status).toBe("processing");
    });

    it("Case C — absent account_identifier + screening is already fresh (short-circuits) -> 200, verification.action=failed, screening.action=short_circuited", async () => {
      if (!schemaReady) return;
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE, bank_identifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR });
      const created = await register(body, "idem-m1-c-reg-" + randomUUID());
      const destinationId = created.json().data.destination_id;
      expect(await countScreeningRows(destinationId)).toBe(1);

      const idemKey = "idem-m1-c-" + randomUUID();
      const res = await assess(destinationId, body.client_id as string, idemKey);
      expect(res.statusCode).toBe(200);
      expect(res.json().data.verification.action).toBe("failed");
      expect(res.json().data.screening.action).toBe("short_circuited");
      expect(await countScreeningRows(destinationId)).toBe(1);

      const idemRow = await verifyPool.query(`SELECT status FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.fiat_payout_destination.assess' AND idempotency_key = $1`, [idemKey]);
      expect(idemRow.rows[0]?.status).toBe("completed");
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("Turn-4 CLOSURE — genuine same-key concurrency barrier (real advisory-lock, never a bare Promise.all)", () => {
    beforeAll(async () => {
      if (!schemaReady) return;
      await activateCorridor("apac_local_my", "MY", "MYR");
    });
    afterAll(async () => {
      if (!schemaReady) return;
      await deactivateCorridor("apac_local_my", "MY", "MYR");
    });

    it("a same-key duplicate arriving while the first request is genuinely blocked on the destination's advisory lock settles 503 WITHOUT waiting for the lock, and exactly one evidence version per domain is ever committed", async () => {
      if (!schemaReady) return;

      const body = myBody({
        beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED,
        account_identifier: "55554444",
        bank_identifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR,
      });
      const created = await register(body, "idem-conc-reg-" + randomUUID());
      const destinationId = created.json().data.destination_id;
      expect(await countVerificationRows(destinationId)).toBe(1);
      expect(await countScreeningRows(destinationId)).toBe(1);

      // Back-date BOTH domains' registration-time evidence so the assess call below must
      // genuinely re-run both providers (real work, not a short-circuit) and therefore must
      // genuinely reach TX-2's `acquireDestinationLock` — the exact lock this test's external
      // holder contends on.
      await verifyPool.query(`UPDATE wlt1.beneficiary_verification SET valid_until_utc = now() - interval '1 hour' WHERE destination_id = $1`, [destinationId]);
      await verifyPool.query(`UPDATE wlt1.fiat_screening_result SET valid_until_utc = now() - interval '1 hour' WHERE destination_id = $1`, [destinationId]);

      const lockClient = await verifyPool.connect();
      await lockClient.query("BEGIN");
      await lockClient.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wlt1.destination:${destinationId}`]);

      try {
        const sharedKey = "idem-conc-A-" + randomUUID();
        let aSettled = false;
        const aPromise = assess(destinationId, body.client_id as string, sharedKey, { account_identifier: "55554444" }).then((res) => {
          aSettled = true;
          return res;
        });

        // Bounded proof of non-settlement: A must still be blocked on the externally-held
        // advisory lock after a generous wait.
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(aSettled).toBe(false);

        // Bit-exact objid matching against `hashtext()`'s bigint-cast encoding is brittle across
        // PG versions — a plain existence check for ANY waiting advisory-lock request is
        // sufficient corroborating evidence alongside the bounded non-settlement proof above (this
        // test owns the only advisory-lock contention in flight at this point).
        const waitingLocks = await verifyPool.query(`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted = false`);
        expect(Number(waitingLocks.rows[0]?.n)).toBeGreaterThanOrEqual(1);

        // Request B, SAME idempotency key, fired while A is still genuinely blocked. B must
        // settle immediately (it only reaches `beginIdempotent`'s own short transaction, sees the
        // 'processing' row A already committed, and 503s WITHOUT ever attempting the destination
        // lock).
        const bRes = await assess(destinationId, body.client_id as string, sharedKey, { account_identifier: "55554444" });
        expect(bRes.statusCode).toBe(503);
        expect(aSettled).toBe(false);

        await lockClient.query("COMMIT");

        const aRes = await aPromise;
        expect(aRes.statusCode).toBe(200);
        expect(aRes.json().data.verification.action).toBe("performed");
        expect(aRes.json().data.screening.action).toBe("performed");

        expect(await countVerificationRows(destinationId)).toBe(2);
        expect(await countScreeningRows(destinationId)).toBe(2);
        const verifRows = await verifyPool.query(`SELECT max(verification_version)::int AS v FROM wlt1.beneficiary_verification WHERE destination_id = $1`, [destinationId]);
        const screenRows = await verifyPool.query(`SELECT max(screening_result_version)::int AS v FROM wlt1.fiat_screening_result WHERE destination_id = $1`, [destinationId]);
        expect(Number(verifRows.rows[0]?.v)).toBe(2);
        expect(Number(screenRows.rows[0]?.v)).toBe(2);
      } finally {
        try {
          await lockClient.query("ROLLBACK");
        } catch {
          // already committed above on the success path — ROLLBACK on an already-completed
          // transaction is a harmless no-op guard for the failure path only.
        }
        lockClient.release();
      }
    }, 20000);
  });

  // -------------------------------------------------------------------------------------------
  describe("failed-attempt retry contract — a processing duplicate never re-runs providers; a NEW key is required", () => {
    beforeAll(async () => {
      if (!schemaReady) return;
      await activateCorridor("apac_local_my", "MY", "MYR");
    });
    afterAll(async () => {
      if (!schemaReady) return;
      await deactivateCorridor("apac_local_my", "MY", "MYR");
    });

    it("K1 both-technical-failure -> 503/processing/0 rows; K1 retried (SAME key) -> 503 again, still processing, still 0 rows, no provider side effect; a NEW key against a corrected destination succeeds", async () => {
      if (!schemaReady) return;
      const body = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_UNAVAILABLE, bank_identifier: "AAAAMYYY" });
      const created = await register(body, "idem-retry-reg-" + randomUUID());
      const destinationId = created.json().data.destination_id;
      expect(created.json().data.status).toBe("draft");

      const k1 = "idem-retry-k1-" + randomUUID();
      const first = await assess(destinationId, body.client_id as string, k1);
      expect(first.statusCode).toBe(503);
      expect(await countVerificationRows(destinationId)).toBe(0);
      expect(await countScreeningRows(destinationId)).toBe(0);
      const idemAfterFirst = await verifyPool.query(`SELECT status FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.fiat_payout_destination.assess' AND idempotency_key = $1`, [k1]);
      expect(idemAfterFirst.rows[0]?.status).toBe("processing");

      // SAME key retried — this destination's underlying beneficiary_name/bank_identifier are
      // immutable and permanently unfixturable, so the retry must fail IDENTICALLY (503) purely
      // via the duplicate-processing short-circuit, with zero new provider side effects.
      const retry = await assess(destinationId, body.client_id as string, k1);
      expect(retry.statusCode).toBe(503);
      expect(await countVerificationRows(destinationId)).toBe(0);
      expect(await countScreeningRows(destinationId)).toBe(0);
      const idemAfterRetry = await verifyPool.query(`SELECT status FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.fiat_payout_destination.assess' AND idempotency_key = $1`, [k1]);
      expect(idemAfterRetry.rows[0]?.status).toBe("processing");

      // A NEW Idempotency-Key against a FRESHLY-registered, genuinely fixturable destination
      // proves the overall retry contract is not permanently poisoned — only this one
      // unfixturable destination is (correctly) stuck, and only because it can genuinely never
      // succeed, never because of any idempotency defect.
      const correctedBody = myBody({ beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED, bank_identifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR });
      const correctedCreated = await register(correctedBody, "idem-retry-reg2-" + randomUUID());
      const correctedDestinationId = correctedCreated.json().data.destination_id;
      expect(await countVerificationRows(correctedDestinationId)).toBe(1);
      expect(await countScreeningRows(correctedDestinationId)).toBe(1);

      const k2 = "idem-retry-k2-" + randomUUID();
      const second = await assess(correctedDestinationId, correctedBody.client_id as string, k2);
      expect(second.statusCode).toBe(200);
      expect(second.json().data.verification.action).toBe("short_circuited");
      expect(second.json().data.screening.action).toBe("short_circuited");
      const idemAfterSecond = await verifyPool.query(`SELECT status FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.fiat_payout_destination.assess' AND idempotency_key = $1`, [k2]);
      expect(idemAfterSecond.rows[0]?.status).toBe("completed");
    });
  });
});
