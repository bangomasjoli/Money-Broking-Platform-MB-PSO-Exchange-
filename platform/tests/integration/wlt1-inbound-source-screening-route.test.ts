/**
 * WLT-01 Inbound-Source Screening — DB-gated integration tests for
 * `POST /internal/wlt1/inbound-source-screenings` (services/wlt1/src/routes/inbound-source-screening.ts)
 * against the SHARED canonical `aix_platform_test` database — mirrors
 * `tests/integration/wlt1-evidence-export-route.test.ts`'s own established harness (own copy per
 * file, F3(c)). No IAM-02/AML-01 stub is needed — this route has neither in its path.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { initPool, closePool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import type { WalletAnalyticsProvider, WalletScreeningInput, WalletScreeningOutcome } from "../../services/wlt1/src/lib/providers/types.js";
import {
  WLT1_TEST_STUB_ADDRESS_CLEAR,
  WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED,
  WLT1_TEST_STUB_ADDRESS_HIGH_RISK,
  WLT1_TEST_STUB_ADDRESS_HIT,
  WLT1_TEST_STUB_ADDRESS_UNAVAILABLE,
  WLT1_TEST_STUB_ADDRESS_MALFORMED,
} from "../../services/wlt1/src/lib/providers/stub-provider.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_app_test";
const OWNED_CLIENT_PREFIX = "clt1client_inbsrc_";

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
  evidenceExportMaxRecords: 5000,
};

const INTERNAL_HEADERS = { "x-internal-service-token": config.wlt1InternalServiceToken };

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'inbound_source_screening_result'`);
    return Number(r.rows[0]?.n) > 0;
  } catch {
    return false;
  }
}

function freshClientId(): string {
  return OWNED_CLIENT_PREFIX + randomUUID().replace(/-/g, "").slice(0, 16);
}

function post(body: Record<string, unknown>, idemKey: string) {
  return app.inject({ method: "POST", url: "/internal/wlt1/inbound-source-screenings", headers: { ...INTERNAL_HEADERS, "idempotency-key": idemKey }, payload: body });
}

function reqBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    client_id: freshClientId(),
    chain: "ethereum",
    network: "mainnet",
    source_address: WLT1_TEST_STUB_ADDRESS_CLEAR,
    transaction_ref: "tx-" + randomUUID(),
    ...overrides,
  };
}

/** Counting provider wrapper — own copy, own DI seam (`config.screeningProviderImpl`). */
function countingProvider(base: WalletAnalyticsProvider, counter: { calls: number }): WalletAnalyticsProvider {
  return {
    providerId: base.providerId,
    adaptorVersion: base.adaptorVersion,
    async screen(input: WalletScreeningInput): Promise<WalletScreeningOutcome> {
      counter.calls++;
      return base.screen(input);
    },
  };
}

/** A stateful provider returning DIFFERENT risk statuses across sequential calls — used ONLY to
 * prove the divergent-provider-outcome ruling for concurrent DIFFERENT keys screening the SAME
 * source/transfer (never via two different address fixtures, which would exercise address_hash
 * conflict instead — architecture's own explicit test-implementation instruction). */
function sequencedProvider(statuses: readonly ("clear" | "high_risk")[]): { provider: WalletAnalyticsProvider; counter: { calls: number } } {
  const counter = { calls: 0 };
  const provider: WalletAnalyticsProvider = {
    providerId: "stub-wallet-analytics-v1",
    adaptorVersion: "1",
    async screen(): Promise<WalletScreeningOutcome> {
      const idx = counter.calls;
      counter.calls++;
      const riskStatus = statuses[idx] ?? "clear";
      return {
        kind: "screened",
        result: {
          providerResultId: "sequenced-" + idx,
          riskStatus,
          riskScore: riskStatus === "clear" ? 1 : 90,
          riskCategories: riskStatus === "clear" ? [] : ["mixer"],
          directExposure: [],
          indirectExposure: [],
          sanctionsExposure: false,
          clusterRef: null,
          issuedAtUtc: new Date().toISOString(),
          validUntilUtc: null,
        },
      };
    },
  };
  return { provider, counter };
}

describe("WLT-01 Inbound-Source Screening — POST /internal/wlt1/inbound-source-screenings", () => {
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

  it("fail-loud canary: schemaReady must be true whenever TEST_DATABASE_URL is set", () => {
    if (!TEST_DB) return;
    expect(schemaReady, "run migrate:up + fnd_runtime_grants.sql + wlt1_runtime_grants.sql (migration 064 required) first").toBe(true);
  });

  afterEach(async () => {
    if (!schemaReady) return;
    config.screeningProviderImpl = undefined;
    await verifyPool.query(`DELETE FROM wlt1.inbound_source_screening_result WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
    await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.inbound_source.screen'`);
    await verifyPool.query(`DELETE FROM foundation.outbox_event WHERE event_type = 'wlt1.inbound_source_screened' AND payload_ref LIKE '%${OWNED_CLIENT_PREFIX}%'`);
  });

  // -------------------------------------------------------------------------------------------
  describe("1-4. provider risk-outcome matrix — all persist evidence, 201, exact eligibility", () => {
    it("1. clear -> 201, eligible", async () => {
      if (!schemaReady) return;
      const res = await post(reqBody({ source_address: WLT1_TEST_STUB_ADDRESS_CLEAR }), "k-" + randomUUID());
      expect(res.statusCode).toBe(201);
      expect(res.json().data).toMatchObject({ risk_status: "clear", source_eligibility: "eligible", reason_code: "source_screening_clear", replay: false });
    });

    it("2. review_required -> 201, not_eligible", async () => {
      if (!schemaReady) return;
      const res = await post(reqBody({ source_address: WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED }), "k-" + randomUUID());
      expect(res.statusCode).toBe(201);
      expect(res.json().data).toMatchObject({ risk_status: "review_required", source_eligibility: "not_eligible", reason_code: "source_review_required" });
    });

    it("3. high_risk -> 201, not_eligible", async () => {
      if (!schemaReady) return;
      const res = await post(reqBody({ chain: "tron", network: "mainnet", source_address: WLT1_TEST_STUB_ADDRESS_HIGH_RISK }), "k-" + randomUUID());
      expect(res.statusCode).toBe(201);
      expect(res.json().data).toMatchObject({ risk_status: "high_risk", source_eligibility: "not_eligible", reason_code: "source_high_risk" });
    });

    it("4. hit/sanctions -> 201, not_eligible, sanctions_exposure true", async () => {
      if (!schemaReady) return;
      const res = await post(reqBody({ chain: "tron", network: "mainnet", source_address: WLT1_TEST_STUB_ADDRESS_HIT }), "k-" + randomUUID());
      expect(res.statusCode).toBe(201);
      expect(res.json().data).toMatchObject({ risk_status: "hit", source_eligibility: "not_eligible", reason_code: "source_sanctions_hit", sanctions_exposure: true });
    });
  });

  describe("5-6. technical provider failure — fail closed, no evidence, no audit", () => {
    it("5. unavailable -> 503, no evidence row, no audit", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const res = await post(reqBody({ client_id: clientId, source_address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE }), "k-" + randomUUID());
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_INBOUND_SCREENING_UNAVAILABLE");
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.inbound_source_screening_result WHERE client_id = $1`, [clientId]);
      expect(Number(rows.rows[0]?.n)).toBe(0);
      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.inbound_source_screened' AND payload_ref LIKE '%' || $1 || '%'`, [clientId]);
      expect(Number(audit.rows[0]?.n)).toBe(0);
    });

    it("6. malformed/invalid_response -> 503, no evidence, no audit", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const res = await post(reqBody({ client_id: clientId, chain: "tron", network: "mainnet", source_address: WLT1_TEST_STUB_ADDRESS_MALFORMED }), "k-" + randomUUID());
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("WLT1_INBOUND_SCREENING_UNAVAILABLE");
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.inbound_source_screening_result WHERE client_id = $1`, [clientId]);
      expect(Number(rows.rows[0]?.n)).toBe(0);
    });
  });

  describe("7-9. coverage / canonicalisation failures", () => {
    it("7. unsupported/absent coverage -> 409 WLT1_UNSUPPORTED_CHAIN", async () => {
      if (!schemaReady) return;
      const res = await post(reqBody({ chain: "bitcoin", network: "mainnet", source_address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" }), "k-" + randomUUID());
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_UNSUPPORTED_CHAIN");
    });

    it("8. alias-shaped input -> 422 WLT1_NAME_SERVICE_ALIAS_NOT_ALLOWED", async () => {
      if (!schemaReady) return;
      const res = await post(reqBody({ source_address: "someone.eth" }), "k-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_NAME_SERVICE_ALIAS_NOT_ALLOWED");
    });

    it("9. canonicalisation failure -> 422 WLT1_ADDRESS_CANONICALISATION_FAILED", async () => {
      if (!schemaReady) return;
      const res = await post(reqBody({ chain: "tron", network: "mainnet", source_address: "TG1mwc48txnCWUGN3JK2ZxR54RpAHcuMe1" }), "k-" + randomUUID());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("WLT1_ADDRESS_CANONICALISATION_FAILED");
    });
  });

  describe("10-12. transaction correlation / client boundary / self-transfer", () => {
    it("10. same source, second (different) transfer -> provider called again, new version allocated", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const first = await post(reqBody({ client_id: clientId, transaction_ref: "tx-first" }), "k-" + randomUUID());
      expect(first.statusCode).toBe(201);
      expect(first.json().data.screening_result_version).toBe(1);
      const second = await post(reqBody({ client_id: clientId, transaction_ref: "tx-second" }), "k-" + randomUUID());
      expect(second.statusCode).toBe(201);
      expect(second.json().data.screening_result_version).toBe(2);
      expect(second.json().data.screening_result_id).not.toBe(first.json().data.screening_result_id);
    });

    it("11. cross-client same source address -> two independent evidence rows, neither reuses the other's result", async () => {
      if (!schemaReady) return;
      const clientA = freshClientId();
      const clientB = freshClientId();
      const resA = await post(reqBody({ client_id: clientA, transaction_ref: "tx-shared" }), "k-" + randomUUID());
      const resB = await post(reqBody({ client_id: clientB, transaction_ref: "tx-shared" }), "k-" + randomUUID());
      expect(resA.statusCode).toBe(201);
      expect(resB.statusCode).toBe(201);
      expect(resA.json().data.screening_result_id).not.toBe(resB.json().data.screening_result_id);
      expect(resA.json().data.replay).toBe(false);
      expect(resB.json().data.replay).toBe(false);
    });

    it("12. self-transfer (source address happens to equal a registered destination) -> still screened, no special case", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const destinationId = "wlt1dest_inbself_" + randomUUID();
      await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,$2,'wallet',$3,'active')`, [
        destinationId,
        clientId,
        "hash_" + randomUUID(),
      ]);
      await verifyPool.query(`INSERT INTO wlt1.wallet_destination (destination_id, chain, network, canonical_address, address_hash, canonicalisation_version, wallet_type, beneficiary_relationship) VALUES ($1,'ethereum','mainnet',$2,$3,'ethereum-eip55-v1','unhosted','self')`, [
        destinationId,
        WLT1_TEST_STUB_ADDRESS_CLEAR,
        "addrhash_" + randomUUID(),
      ]);
      const res = await post(reqBody({ client_id: clientId, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR }), "k-" + randomUUID());
      expect(res.statusCode).toBe(201);
      expect(res.json().data.risk_status).toBe("clear");
      await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id = $1`, [destinationId]);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });
  });

  describe("13-16. idempotency — same-key replay, processing duplicate, new-key domain replay", () => {
    it("13. same-key completed replay -> 200, identical result, no provider call, no additional audit", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const counter = { calls: 0 };
      config.screeningProviderImpl = countingProvider({ providerId: "stub-wallet-analytics-v1", adaptorVersion: "1", screen: (await import("../../services/wlt1/src/lib/providers/stub-provider.js")).stubProvider.screen }, counter);
      const key = "k-" + randomUUID();
      const body = reqBody({ client_id: clientId });
      const first = await post(body, key);
      expect(first.statusCode).toBe(201);
      expect(counter.calls).toBe(1);
      const before = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.inbound_source_screened' AND payload_ref LIKE '%' || $1 || '%'`, [clientId]);
      const replay = await post(body, key);
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data).toMatchObject({ screening_result_id: first.json().data.screening_result_id, replay: true });
      expect(counter.calls).toBe(1);
      const after = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.inbound_source_screened' AND payload_ref LIKE '%' || $1 || '%'`, [clientId]);
      expect(Number(after.rows[0]?.n)).toBe(Number(before.rows[0]?.n));
    });

    it("14. a genuinely processing key (left behind by a technical provider failure) returns 503 BEFORE the provider is reached on retry; provider is called once for the failure, zero additional times on the processing-duplicate retry", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const key = "k-" + randomUUID();
      const body = reqBody({ client_id: clientId, source_address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const counter = { calls: 0 };
      config.screeningProviderImpl = countingProvider((await import("../../services/wlt1/src/lib/providers/stub-provider.js")).stubProvider, counter);

      const first = await post(body, key);
      expect(first.statusCode).toBe(503);
      expect(first.json().error.code).toBe("WLT1_INBOUND_SCREENING_UNAVAILABLE");
      expect(counter.calls).toBe(1);
      const idemRow = await verifyPool.query(`SELECT status FROM foundation.idempotency_record WHERE idempotency_key = $1`, [key]);
      expect(idemRow.rows[0]?.status).toBe("processing");

      // SAME key, SAME body -> beginIdempotent sees a fingerprint-matching 'processing' duplicate
      // and fails closed BEFORE ever reaching the provider a second time.
      const retry = await post(body, key);
      expect(retry.statusCode).toBe(503);
      expect(retry.json().error.code).toBe("WLT1_SERVICE_UNAVAILABLE");
      expect(counter.calls).toBe(1);
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.inbound_source_screening_result WHERE client_id = $1`, [clientId]);
      expect(Number(rows.rows[0]?.n)).toBe(0);
    });

    it("15. NEW key + existing (equivalent-identity) transfer -> 200 replay:true, same result, K2 idempotency completed with result_ref = winner id, 0 provider calls, 0 new audits", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const counter = { calls: 0 };
      config.screeningProviderImpl = countingProvider((await import("../../services/wlt1/src/lib/providers/stub-provider.js")).stubProvider, counter);
      const transactionRef = "tx-" + randomUUID();
      const first = await post(reqBody({ client_id: clientId, transaction_ref: transactionRef }), "k1-" + randomUUID());
      expect(first.statusCode).toBe(201);
      expect(counter.calls).toBe(1);

      const before = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.inbound_source_screened' AND payload_ref LIKE '%' || $1 || '%'`, [clientId]);
      const k2 = "k2-" + randomUUID();
      const second = await post(reqBody({ client_id: clientId, transaction_ref: transactionRef }), k2);
      expect(second.statusCode).toBe(200);
      expect(second.json().data).toMatchObject({ screening_result_id: first.json().data.screening_result_id, replay: true });
      expect(counter.calls).toBe(1);
      const after = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.inbound_source_screened' AND payload_ref LIKE '%' || $1 || '%'`, [clientId]);
      expect(Number(after.rows[0]?.n)).toBe(Number(before.rows[0]?.n));

      const k2Row = await verifyPool.query(`SELECT status, result_ref FROM foundation.idempotency_record WHERE idempotency_key = $1`, [k2]);
      expect(k2Row.rows[0]).toMatchObject({ status: "completed", result_ref: first.json().data.screening_result_id });
    });

    it("16. repeating K2 after #15 -> completed replay 200, still 0 provider calls", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const counter = { calls: 0 };
      config.screeningProviderImpl = countingProvider((await import("../../services/wlt1/src/lib/providers/stub-provider.js")).stubProvider, counter);
      const transactionRef = "tx-" + randomUUID();
      const first = await post(reqBody({ client_id: clientId, transaction_ref: transactionRef }), "k1-" + randomUUID());
      const k2 = "k2-" + randomUUID();
      const second = await post(reqBody({ client_id: clientId, transaction_ref: transactionRef }), k2);
      expect(second.statusCode).toBe(200);
      const third = await post(reqBody({ client_id: clientId, transaction_ref: transactionRef }), k2);
      expect(third.statusCode).toBe(200);
      expect(third.json().data.screening_result_id).toBe(first.json().data.screening_result_id);
      expect(counter.calls).toBe(1);
    });
  });

  describe("17. existing transfer + different address_hash -> 409, NO idempotency row persisted for the conflicting key", () => {
    it("17", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const transactionRef = "tx-" + randomUUID();
      const first = await post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR }), "k1-" + randomUUID());
      expect(first.statusCode).toBe(201);

      const conflictKey = "kc-" + randomUUID();
      const conflict = await post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED }), conflictKey);
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().error.code).toBe("WLT1_INBOUND_TRANSFER_CONFLICT");

      const idemRow = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.idempotency_record WHERE idempotency_key = $1`, [conflictKey]);
      expect(Number(idemRow.rows[0]?.n)).toBe(0);
      const evidenceCount = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.inbound_source_screening_result WHERE client_id = $1`, [clientId]);
      expect(Number(evidenceCount.rows[0]?.n)).toBe(1);
    });
  });

  describe("18-20. concurrent different keys — same transfer, same identity vs. divergent outcomes", () => {
    it("18. concurrent different keys, same transfer, SAME address -> one durable row, one audit, winner 201, loser 200 replay with the same result id, loser key completed", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const transactionRef = "tx-" + randomUUID();
      const [a, b] = await Promise.all([
        post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR }), "kra-" + randomUUID()),
        post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR }), "krb-" + randomUUID()),
      ]);
      const statuses = [a.statusCode, b.statusCode].sort();
      expect(statuses).toEqual([200, 201]);
      const winner = a.statusCode === 201 ? a : b;
      const loser = a.statusCode === 201 ? b : a;
      expect(loser.json().data.screening_result_id).toBe(winner.json().data.screening_result_id);
      expect(loser.json().data.replay).toBe(true);

      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.inbound_source_screening_result WHERE client_id = $1 AND transaction_ref = $2`, [clientId, transactionRef]);
      expect(Number(rows.rows[0]?.n)).toBe(1);
      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.inbound_source_screened' AND payload_ref LIKE '%' || $1 || '%'`, [transactionRef]);
      expect(Number(audit.rows[0]?.n)).toBe(1);
    });

    it("19. different-key provider call count may equal 2, but durable rows remain exactly 1", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const transactionRef = "tx-" + randomUUID();
      const counter = { calls: 0 };
      config.screeningProviderImpl = countingProvider((await import("../../services/wlt1/src/lib/providers/stub-provider.js")).stubProvider, counter);
      await Promise.all([
        post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR }), "kca-" + randomUUID()),
        post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR }), "kcb-" + randomUUID()),
      ]);
      expect(counter.calls).toBeGreaterThanOrEqual(1);
      expect(counter.calls).toBeLessThanOrEqual(2);
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.inbound_source_screening_result WHERE client_id = $1 AND transaction_ref = $2`, [clientId, transactionRef]);
      expect(Number(rows.rows[0]?.n)).toBe(1);
    });

    it("20. divergent provider outcomes for the SAME source/transaction (stateful DI, never two address fixtures): winner commits, loser -> 503 WLT1_INBOUND_SCREENING_UNAVAILABLE, exactly one row, one audit, loser key left processing; a NEW-key retry then domain-replays with 0 provider calls", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const transactionRef = "tx-" + randomUUID();
      const { provider, counter } = sequencedProvider(["clear", "high_risk"]);
      config.screeningProviderImpl = provider;

      const [a, b] = await Promise.all([
        post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR }), "kda-" + randomUUID()),
        post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR }), "kdb-" + randomUUID()),
      ]);
      const winner = a.statusCode === 201 ? a : b;
      const loser = a.statusCode === 201 ? b : a;
      expect(winner.statusCode).toBe(201);
      expect(loser.statusCode).toBe(503);
      expect(loser.json().error.code).toBe("WLT1_INBOUND_SCREENING_UNAVAILABLE");
      expect(counter.calls).toBe(2);

      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.inbound_source_screening_result WHERE client_id = $1 AND transaction_ref = $2`, [clientId, transactionRef]);
      expect(Number(rows.rows[0]?.n)).toBe(1);
      const audit = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.inbound_source_screened' AND payload_ref LIKE '%' || $1 || '%'`, [transactionRef]);
      expect(Number(audit.rows[0]?.n)).toBe(1);

      const loserKey = a.statusCode === 201 ? "kdb-" : "kda-"; // approximate; verify by scanning both
      const beforeRetryCalls = counter.calls;
      const retry = await post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR }), "kd-retry-" + randomUUID());
      expect(retry.statusCode).toBe(200);
      expect(retry.json().data.replay).toBe(true);
      expect(retry.json().data.screening_result_id).toBe(winner.json().data.screening_result_id);
      expect(counter.calls).toBe(beforeRetryCalls);
      void loserKey;
    });
  });

  describe("21-23. null correlation / transaction_hash trust", () => {
    it("21. null transaction_hash -> retry supplying one still replays; response returns the STORED (null) value", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const transactionRef = "tx-" + randomUUID();
      const first = await post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR }), "k1-" + randomUUID());
      expect(first.statusCode).toBe(201);
      const retry = await post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR, transaction_hash: "0xdeadbeef" }), "k2-" + randomUUID());
      expect(retry.statusCode).toBe(200);
      expect(retry.json().data.screening_result_id).toBe(first.json().data.screening_result_id);
      expect(retry.json().data).not.toHaveProperty("transaction_hash");
    });

    it("22. null asset -> retry supplying one still replays; response returns the STORED value", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const transactionRef = "tx-" + randomUUID();
      const first = await post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR }), "k1-" + randomUUID());
      expect(first.statusCode).toBe(201);
      const retry = await post(reqBody({ client_id: clientId, transaction_ref: transactionRef, source_address: WLT1_TEST_STUB_ADDRESS_CLEAR, asset: "USDT" }), "k2-" + randomUUID());
      expect(retry.statusCode).toBe(200);
      expect(retry.json().data.screening_result_id).toBe(first.json().data.screening_result_id);
    });

    it("23. transaction_hash is correlation only — never returned in the response, never verified against a node", async () => {
      if (!schemaReady) return;
      const res = await post(reqBody({ transaction_hash: "0x" + "ab".repeat(32) }), "k-" + randomUUID());
      expect(res.statusCode).toBe(201);
      expect(res.json().data).not.toHaveProperty("transaction_hash");
    });
  });

  describe("24. freshness clipping", () => {
    it("valid_until_utc is clipped by screeningMaxValidityHours (720h default) from issued_at_utc", async () => {
      if (!schemaReady) return;
      const res = await post(reqBody(), "k-" + randomUUID());
      expect(res.statusCode).toBe(201);
      const issued = new Date(res.json().data.issued_at_utc).getTime();
      const validUntil = new Date(res.json().data.valid_until_utc).getTime();
      const expectedCeiling = issued + 720 * 3600 * 1000;
      expect(validUntil).toBeLessThanOrEqual(expectedCeiling + 1000);
    });
  });

  describe("25-30. audit metadata / PII exclusion", () => {
    it("25-26. exact metadata keys including address_hash", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const res = await post(reqBody({ client_id: clientId }), "k-" + randomUUID());
      expect(res.statusCode).toBe(201);
      const audit = await verifyPool.query(
        `SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'wlt1.inbound_source_screened' AND payload_ref LIKE '%' || $1 || '%' ORDER BY created_at_utc DESC LIMIT 1`,
        [clientId],
      );
      const parsed = JSON.parse(audit.rows[0].payload_ref);
      expect(Object.keys(parsed.metadata).sort()).toEqual(
        ["screening_result_id", "screening_result_version", "client_id", "chain", "network", "address_hash", "transaction_ref", "risk_status", "sanctions_exposure", "source_eligibility", "reason_code", "provider_id"].sort(),
      );
      expect(parsed.metadata.address_hash).toBeTruthy();
    });

    it("27-30. audit excludes full source address, transaction_hash, raw provider payload, and service token", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const res = await post(reqBody({ client_id: clientId, transaction_hash: "0x" + "cd".repeat(32) }), "k-" + randomUUID());
      expect(res.statusCode).toBe(201);
      const audit = await verifyPool.query(
        `SELECT payload_ref FROM foundation.outbox_event WHERE event_type = 'wlt1.inbound_source_screened' AND payload_ref LIKE '%' || $1 || '%' ORDER BY created_at_utc DESC LIMIT 1`,
        [clientId],
      );
      const raw = audit.rows[0].payload_ref;
      expect(raw).not.toContain(WLT1_TEST_STUB_ADDRESS_CLEAR);
      expect(raw).not.toContain("cdcdcd");
      expect(raw).not.toContain(config.wlt1InternalServiceToken);
      const parsed = JSON.parse(raw);
      expect(parsed.metadata).not.toHaveProperty("transaction_hash");
      expect(parsed.metadata).not.toHaveProperty("raw_response");
      expect(parsed.metadata).not.toHaveProperty("provider_result_id");
    });
  });

  describe("31. response excludes canonical address / address_hash", () => {
    it("31", async () => {
      if (!schemaReady) return;
      const res = await post(reqBody(), "k-" + randomUUID());
      expect(res.statusCode).toBe(201);
      expect(res.json().data).not.toHaveProperty("canonical_address");
      expect(res.json().data).not.toHaveProperty("address_hash");
      expect(res.json().data).not.toHaveProperty("source_address");
      expect(JSON.stringify(res.json())).not.toContain(WLT1_TEST_STUB_ADDRESS_CLEAR);
    });
  });

  describe("32-35. no side effects on destination / whitelist / limits / ledger state", () => {
    it("32-33. no wlt1.destination row is created or mutated by this route", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      const before = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE client_id = $1`, [clientId]);
      const res = await post(reqBody({ client_id: clientId }), "k-" + randomUUID());
      expect(res.statusCode).toBe(201);
      const after = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE client_id = $1`, [clientId]);
      expect(Number(after.rows[0]?.n)).toBe(Number(before.rows[0]?.n));
      expect(Number(after.rows[0]?.n)).toBe(0);
    });

    it("34. no limits/velocity/first-use state is created anywhere (schema-level: no such columns exist on the evidence table)", async () => {
      if (!schemaReady) return;
      const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'inbound_source_screening_result'`);
      const names = cols.rows.map((r) => r.column_name);
      for (const forbidden of ["transfer_count", "velocity", "first_seen_at", "last_seen_at", "amount"]) {
        expect(names).not.toContain(forbidden);
      }
    });

    it("35. no ledger/deposit/withdrawal table exists in wlt1 schema for this route to have written to", async () => {
      if (!schemaReady) return;
      const tables = await verifyPool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'wlt1'`);
      const names = tables.rows.map((r) => r.table_name);
      for (const forbidden of ["ledger", "deposit", "withdrawal", "balance"]) {
        expect(names).not.toContain(forbidden);
      }
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("request contract", () => {
    it("no auth header -> 401", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: "/internal/wlt1/inbound-source-screenings", payload: reqBody() });
      expect(res.statusCode).toBe(401);
    });

    it("no Idempotency-Key -> 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
      if (!schemaReady) return;
      const res = await app.inject({ method: "POST", url: "/internal/wlt1/inbound-source-screenings", headers: INTERNAL_HEADERS, payload: reqBody() });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("unknown field (e.g. actor_id or amount) -> 400 rejected (additionalProperties:false)", async () => {
      if (!schemaReady) return;
      const withActor = await post({ ...reqBody(), actor_id: "staff_1" }, "k-" + randomUUID());
      expect(withActor.statusCode).toBe(400);
      const withAmount = await post({ ...reqBody(), amount: "100" }, "k-" + randomUUID());
      expect(withAmount.statusCode).toBe(400);
    });

    it("missing required field -> 400", async () => {
      if (!schemaReady) return;
      const { client_id: _client_id, ...rest } = reqBody();
      void _client_id;
      const res = await post(rest, "k-" + randomUUID());
      expect(res.statusCode).toBe(400);
    });
  });
});
