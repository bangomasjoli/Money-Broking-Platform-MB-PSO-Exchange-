/**
 * WLT-01 Sensitive Read Logging (FR-018) — DB-gated integration tests for `wlt1.sensitive_
 * destination_read` evidence emission, driven against the SHARED canonical database. Mirrors
 * `wlt1-poc-verify-route.test.ts`'s own established harness (own dedicated runtime role, own
 * client_id fixture scope, golden-key real cryptography via `tests/helpers/poc-test-signing.ts`,
 * `screeningProviderImpl` test-injection seam for the golden key's own unfixtured address).
 * Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * Proves, through REAL HTTP calls to the REAL three Proof-of-Control routes (never raw-SQL
 * fabrication of the disclosure itself), each of the six disclosure points named in the
 * controlling addendum, that idempotent replay still logs, that sequential and genuinely
 * concurrent reads each produce their own independent record, that anti-enumeration is
 * unweakened, and that the other 17 WLT routes never emit this event.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION, WLT1_TEST_STUB_ADDRESS_CLEAR } from "../../services/wlt1/src/lib/providers/stub-provider.js";
import type { WalletAnalyticsProvider, WalletScreeningInput } from "../../services/wlt1/src/lib/providers/types.js";
import { POC_TEST_ADDRESS_RAW, signPocMessage } from "../helpers/poc-test-signing.js";
import { WLT1_TEST_STUB_BENEFICIARY_VERIFIED } from "../../services/wlt1/src/lib/beneficiary-verification/stub-provider.js";
import { WLT1_TEST_STUB_FIAT_SCREENING_BIC } from "../../services/wlt1/src/lib/fiat-screening/stub-provider.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_sensitive_read_route_test";
const OWNED_CLIENT_ID = "clt1client_sensread";
const OWNED_CLIENT_PREFIX = "clt1client_sensread";

let verifyPool: Pool;
let schemaReady = false;
let app: FastifyInstance;
let mainConfig: Wlt1Config;

const clt1ActiveFetchFor = (clientId: string): typeof fetch =>
  (async () => new Response(JSON.stringify({ success: true, data: { client_id: clientId, status: "active" } }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

const clt1RosterFetchFor = (clientId: string): typeof fetch =>
  (async (url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes("/authorised-parties/active-refs")) {
      return { ok: true, json: async () => ({ success: true, data: { client_id: clientId, authorised_party_refs: ["ap_1"] } }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: { client_id: clientId, status: "active" } }) } as Response;
  }) as typeof fetch;

const aml1AllowFetchFor = (clientId: string): typeof fetch =>
  (async () => {
    const now = new Date();
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: { decision: "allow", decision_id: "aml1ptd_" + randomUUID(), reason_code: "evidence_clear", evaluated_at_utc: now.toISOString(), valid_until_utc: new Date(now.getTime() + 600_000).toISOString(), evidence_provider_ids: ["stub-v1"], client_id: clientId, requested_action: "destination_use" },
      }),
    } as Response;
  }) as typeof fetch;

/** The golden test key's own derived address has no stub-provider fixture entry — this synthetic
 * provider returns a deterministic terminal `clear` result for ANY input, the SAME established
 * `screeningProviderImpl` test-injection seam every prior WLT-01 PoC test file already uses. */
const alwaysClearProvider: WalletAnalyticsProvider = {
  providerId: STUB_PROVIDER_ID,
  adaptorVersion: STUB_ADAPTOR_VERSION,
  async screen(_input: WalletScreeningInput) {
    return {
      kind: "screened" as const,
      result: {
        providerResultId: "presult_sensread_" + randomUUID(),
        riskStatus: "clear" as const,
        riskScore: 1.0,
        riskCategories: [],
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

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(`SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'proof_of_control') AS n`);
    return Number(r.rows[0]?.n) > 0;
  } catch {
    return false;
  }
}

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

  mainConfig = {
    environment: "dev",
    databaseUrl: TEST_DB ?? "postgres://unused",
    internalServiceToken: "test-wlt1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-it",
    artifactHash: "sha256:it",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    wlt1InternalServiceToken: "test-wlt1-internal-token-sensread-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: STUB_PROVIDER_ID,
    screeningMaxValidityHours: 720,
    providerReceiptSecrets: {},
    pocChallengeTtlMinutes: 15,
    pocMaxAttempts: 3,
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
    clt1FetchImpl: clt1ActiveFetchFor(OWNED_CLIENT_ID),
    screeningProviderImpl: alwaysClearProvider,
  };
  app = await buildApp(mainConfig);
}, 60_000);

afterAll(async () => {
  if (app) await app.close();
  await closePool();
  await verifyPool?.end();
});

afterEach(async () => {
  if (!schemaReady) return;
  await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
  await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
  await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
  await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
  await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
  await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
  await verifyPool.query(`DELETE FROM wlt1.beneficiary_verification WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
  await verifyPool.query(`DELETE FROM wlt1.fiat_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
  await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%')`);
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id LIKE '${OWNED_CLIENT_PREFIX}%'`);
  await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND (action = 'wlt1.proof_of_control.challenge.create' OR action LIKE 'wlt1.fiat_payout_destination.%')`);
  await verifyPool.query(`DELETE FROM foundation.outbox_event WHERE event_type = 'wlt1.sensitive_destination_read' AND payload_ref LIKE '%${OWNED_CLIENT_PREFIX}%'`);
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

function freshClientId(): string {
  return OWNED_CLIENT_PREFIX + "_" + randomUUID().replace(/-/g, "").slice(0, 12);
}

async function sensitiveReadEventsFor(destinationId: string): Promise<Array<Record<string, unknown>>> {
  // `event_type` lives on the outbox row itself (foundation's own `enqueueOutbox` contract), NOT
  // inside `payload_ref`'s JSON — merged back in here so callers can assert on it directly.
  const rows = await verifyPool.query(
    `SELECT event_type, payload_ref FROM foundation.outbox_event WHERE event_type = 'wlt1.sensitive_destination_read' AND payload_ref LIKE '%' || $1 || '%' ORDER BY created_at_utc ASC`,
    [destinationId],
  );
  return rows.rows.map((r) => ({ event_type: r.event_type, ...JSON.parse(r.payload_ref) }));
}

async function totalSensitiveReadCount(): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.sensitive_destination_read'`);
  return Number(r.rows[0]?.n ?? 0);
}

async function registerDestination(opts: { chain: string; network: string; address: string; walletType?: string; clientId?: string }): Promise<{ destinationId: string }> {
  mainConfig.clt1FetchImpl = clt1ActiveFetchFor(opts.clientId ?? OWNED_CLIENT_ID);
  const res = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: { client_id: opts.clientId ?? OWNED_CLIENT_ID, chain: opts.chain, network: opts.network, address: opts.address, wallet_type: opts.walletType ?? "unhosted", beneficiary_relationship: "self" },
  });
  if (res.statusCode !== 201) throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  return { destinationId: res.json().data.destination_id };
}

function screen(destinationId: string) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
    payload: {},
  });
}

/** A `pending_review` destination whose canonical address is the GOLDEN key's own derived
 * address — the only address the shared signing helper can produce a valid proof for. */
async function createSignableDestination(clientId = OWNED_CLIENT_ID): Promise<{ destinationId: string }> {
  const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: POC_TEST_ADDRESS_RAW, clientId });
  const res = await screen(destinationId);
  if (res.statusCode !== 200) throw new Error(`expected terminal screening, got ${res.statusCode} ${JSON.stringify(res.json())}`);
  return { destinationId };
}

function createChallenge(destinationId: string, idempotencyKey: string, clientId = OWNED_CLIENT_ID) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": idempotencyKey },
    payload: { client_id: clientId },
  });
}

function submitVerify(destinationId: string, challengeId: string, signature: string, clientId = OWNED_CLIENT_ID) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control/verify`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: { client_id: clientId, challenge_id: challengeId, signature },
  });
}

function getCurrentProof(destinationId: string, clientId = OWNED_CLIENT_ID) {
  return app.inject({
    method: "GET",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control?client_id=${encodeURIComponent(clientId)}`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
  });
}

describe("WLT-01 Sensitive Read Logging — proof-of-control route integration", () => {
  it("H-D3C-1 fail-loud canary: schemaReady must be true whenever TEST_DATABASE_URL is set", () => {
    if (!TEST_DB) return;
    expect(schemaReady, "run migrate:up + fnd_runtime_grants.sql + wlt1_runtime_grants.sql first").toBe(true);
  });

  // -------------------------------------------------------------------------------------------
  describe("the six disclosure points — one real record per disclosure, exact envelope shape", () => {
    it("all six disclosure points, driven end-to-end through the real routes with real cryptography, each produce exactly one wlt1.sensitive_destination_read record with the correct envelope", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();

      // ---- Disclosure #1: newly-issued challenge (201, `message`) ----
      const k1 = freshKey();
      const res1 = await createChallenge(destinationId, k1);
      expect(res1.statusCode).toBe(201);
      const challengeId = res1.json().data.challenge_id;
      const message = res1.json().data.message;

      // ---- Disclosure #4: idempotent replay of the SAME still-`issued` challenge (201, rebuilt `message`) ----
      const res4 = await createChallenge(destinationId, k1);
      expect(res4.statusCode).toBe(201);
      expect(res4.json().data.challenge_id).toBe(challengeId);

      // ---- Disclosure #5 (first genuine "verified" transition) ----
      const signature = signPocMessage(message);
      const verifyRes1 = await submitVerify(destinationId, challengeId, signature);
      expect(verifyRes1.statusCode).toBe(200);
      expect(verifyRes1.json().data.verified_address).toBeTruthy();

      // ---- Disclosure #5 (second call — "verified_replay_match", the SAME sensitive value disclosed AGAIN) ----
      const verifyRes2 = await submitVerify(destinationId, challengeId, signature);
      expect(verifyRes2.statusCode).toBe(200);

      // ---- Disclosure #2: already-verified early return via challenge-create (NEW key) ----
      const k2 = freshKey();
      const res2 = await createChallenge(destinationId, k2);
      expect(res2.statusCode).toBe(200);
      expect(res2.json().data.status).toBe("verified");

      // ---- Disclosure #3: idempotent replay of the already-verified challenge-create outcome ----
      const res3 = await createChallenge(destinationId, k2);
      expect(res3.statusCode).toBe(200);
      expect(res3.json().data.status).toBe("verified");

      // ---- Disclosure #6: GET current proof (verified) ----
      const getRes = await getCurrentProof(destinationId);
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().data.verified_address).toBeTruthy();

      // Exactly 7 sensitive-read records: #1, #4, #5(x2), #2, #3, #6.
      const events = await sensitiveReadEventsFor(destinationId);
      expect(events.length).toBe(7);

      for (const ev of events) {
        expect(ev).toMatchObject({
          event_type: "wlt1.sensitive_destination_read",
          source_module: "WLT-01",
          actor_id: "wlt1_internal_service",
          actor_type: "service",
          entity_type: "proof_of_control",
          entity_id: challengeId,
        });
        expect(typeof ev.request_id === "string" || ev.request_id === undefined).toBe(true);
        expect(typeof ev.correlation_id).toBe("string");
        expect(typeof ev.occurred_at_utc).toBe("string");
        const metadata = ev.metadata as Record<string, unknown>;
        expect(metadata).toMatchObject({
          destination_id: destinationId,
          client_id: OWNED_CLIENT_ID,
          resource_type: "proof_of_control",
          access_action: "read",
          disclosed_data_class: "wallet_canonical_address",
          chain: "ethereum",
          network: "mainnet",
        });
      }

      // Correlation propagation: the GET call's own response headers match its own event.
      const lastEvent = events[events.length - 1]!;
      expect(getRes.headers["x-correlation-id"]).toBe(lastEvent.correlation_id);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("PII / forbidden-fragment sweep across every sensitive-read outbox payload", () => {
    it("no sensitive-read payload_ref ever contains the disclosed address, the PoC message, a signature, or any hash of any of these", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const res1 = await createChallenge(destinationId, freshKey());
      const message = res1.json().data.message;
      const signature = signPocMessage(message);
      const challengeId = res1.json().data.challenge_id;
      const verifyRes = await submitVerify(destinationId, challengeId, signature);
      const verifiedAddress = verifyRes.json().data.verified_address as string;
      await getCurrentProof(destinationId);

      const events = await sensitiveReadEventsFor(destinationId);
      expect(events.length).toBeGreaterThanOrEqual(3);
      const blob = JSON.stringify(events);
      expect(blob).not.toContain(POC_TEST_ADDRESS_RAW);
      expect(blob.toLowerCase()).not.toContain(verifiedAddress.toLowerCase());
      expect(blob).not.toContain(message);
      expect(blob).not.toContain(signature);
      expect(blob).not.toMatch(/"message":/);
      expect(blob).not.toMatch(/"signature":/);
      expect(blob).not.toMatch(/message_hash/);
      expect(blob).not.toMatch(/signature_hash/);
      expect(blob).not.toMatch(/recovered_address/);
      expect(blob).not.toMatch(/account_identifier/);
      expect(blob).not.toMatch(/beneficiary_name/);
      expect(blob).not.toContain(mainConfig.wlt1InternalServiceToken);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("sequential and genuinely concurrent reads — no deduplication", () => {
    it("two sequential GET reads of the same verified destination produce exactly TWO independent records", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const res1 = await createChallenge(destinationId, freshKey());
      const signature = signPocMessage(res1.json().data.message);
      await submitVerify(destinationId, res1.json().data.challenge_id, signature);

      const before = await sensitiveReadEventsFor(destinationId);
      const beforeCount = before.length; // the verify call itself already logged one

      const g1 = await getCurrentProof(destinationId);
      const g2 = await getCurrentProof(destinationId);
      expect(g1.statusCode).toBe(200);
      expect(g2.statusCode).toBe(200);

      const after = await sensitiveReadEventsFor(destinationId);
      expect(after.length).toBe(beforeCount + 2);
    });

    it("two GENUINELY CONCURRENT, independently-authorized GET reads each produce their own record — proved by asserting BOTH real responses genuinely disclosed the value, not merely that Promise.all resolved", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const res1 = await createChallenge(destinationId, freshKey());
      const signature = signPocMessage(res1.json().data.message);
      const verifyRes = await submitVerify(destinationId, res1.json().data.challenge_id, signature);
      const expectedAddress = verifyRes.json().data.verified_address;

      const before = await totalSensitiveReadCount();

      const [a, b] = await Promise.all([getCurrentProof(destinationId), getCurrentProof(destinationId)]);

      // Proof both requests GENUINELY executed and disclosed the real value — not merely that
      // two promises settled.
      expect(a.statusCode).toBe(200);
      expect(b.statusCode).toBe(200);
      expect(a.json().data.verified_address).toBe(expectedAddress);
      expect(b.json().data.verified_address).toBe(expectedAddress);

      const after = await totalSensitiveReadCount();
      expect(after - before).toBe(2); // never deduplicated, never merged into one record
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("anti-enumeration is unweakened", () => {
    it("unknown destination_id and a foreign-client destination both return the SAME 404, and NEITHER produces sensitive-read evidence", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const unknownId = "wlt1dest_doesnotexist_" + randomUUID();

      const before = await totalSensitiveReadCount();

      const unknownRes = await getCurrentProof(unknownId, OWNED_CLIENT_ID);
      const foreignRes = await getCurrentProof(destinationId, "clt1client_sensread_foreign_" + randomUUID());

      expect(unknownRes.statusCode).toBe(404);
      expect(foreignRes.statusCode).toBe(404);
      expect(unknownRes.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
      expect(foreignRes.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
      // Byte-equivalent outward bodies except for envelope timing/correlation fields.
      expect(unknownRes.json().error).toEqual(foreignRes.json().error);

      const after = await totalSensitiveReadCount();
      expect(after).toBe(before);
    });

    it("the SAME anti-enumeration collapse holds for the verify route (unknown challenge_id vs. a real challenge under the wrong client_id)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createSignableDestination();
      const res1 = await createChallenge(destinationId, freshKey());
      const challengeId = res1.json().data.challenge_id;

      const before = await totalSensitiveReadCount();
      const unknown = await submitVerify(destinationId, "wlt1poc_doesnotexist_" + randomUUID(), signPocMessage("irrelevant"));
      const foreign = await submitVerify(destinationId, challengeId, signPocMessage(res1.json().data.message), "clt1client_sensread_foreign_" + randomUUID());
      expect(unknown.json().error.code).toBe("WLT1_POC_CHALLENGE_NOT_FOUND");
      expect(foreign.json().error.code).toBe("WLT1_POC_CHALLENGE_NOT_FOUND");
      const after = await totalSensitiveReadCount();
      expect(after).toBe(before);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe("the 17 excluded routes never emit wlt1.sensitive_destination_read", () => {
    it("wallet-destinations POST (safe/masked projection) — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const before = await totalSensitiveReadCount();
      const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      expect(destinationId).toBeTruthy();
      expect(await totalSensitiveReadCount()).toBe(before);
    });

    it("wallet-destinations GET (safe/masked projection) — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const before = await totalSensitiveReadCount();
      const res = await app.inject({ method: "GET", url: `/internal/wlt1/wallet-destinations/${destinationId}`, headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken } });
      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.json())).not.toContain(WLT1_TEST_STUB_ADDRESS_CLEAR);
      expect(await totalSensitiveReadCount()).toBe(before);
    });

    it("wallet screen route — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const before = await totalSensitiveReadCount();
      const res = await screen(destinationId);
      expect(res.statusCode).toBe(200);
      expect(await totalSensitiveReadCount()).toBe(before);
    });

    it("approve/request and approve/apply (unknown destination) — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const before = await totalSensitiveReadCount();
      const unknownId = "wlt1dest_doesnotexist_" + randomUUID();
      const r1 = await app.inject({ method: "POST", url: `/internal/wlt1/destinations/${unknownId}/approve/request`, headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken }, payload: { actor_id: "staff_sensread_it", client_id: OWNED_CLIENT_ID } });
      const r2 = await app.inject({ method: "POST", url: `/internal/wlt1/destinations/${unknownId}/approve/apply`, headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken }, payload: { actor_id: "staff_sensread_it", client_id: OWNED_CLIENT_ID, approval_id: "iam2appr_" + randomUUID(), decision_token: "wlt1dt_" + "x".repeat(43) } });
      expect(r1.statusCode).toBe(404);
      expect(r2.statusCode).toBe(404);
      expect(await totalSensitiveReadCount()).toBe(before);
    });

    it("evaluate-use (unknown destination) — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const before = await totalSensitiveReadCount();
      const res = await app.inject({ method: "POST", url: `/internal/wlt1/destinations/wlt1dest_doesnotexist_${randomUUID()}/evaluate-use`, headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken }, payload: { client_id: OWNED_CLIENT_ID, requested_action: "destination_use", caller_module: "TEST", amount: "40", asset_or_currency: "ETH" } });
      expect(res.statusCode).toBe(404);
      expect(await totalSensitiveReadCount()).toBe(before);
    });

    it("decision verify and verify-and-consume (unknown decision) — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const before = await totalSensitiveReadCount();
      const unknownDecisionId = "wlt1dec_doesnotexist_" + randomUUID();
      const r1 = await app.inject({ method: "POST", url: `/internal/wlt1/destination-decisions/${unknownDecisionId}/verify`, headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken }, payload: { decision_token: "wlt1dt_" + "x".repeat(43), client_id: OWNED_CLIENT_ID, destination_id: "wlt1dest_doesnotexist_" + randomUUID(), requested_action: "destination_use" } });
      const r2 = await app.inject({
        method: "POST",
        url: `/internal/wlt1/destination-decisions/${unknownDecisionId}/verify-and-consume`,
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
        payload: { decision_token: "wlt1dt_" + "x".repeat(43), client_id: OWNED_CLIENT_ID, destination_id: "wlt1dest_doesnotexist_" + randomUUID(), requested_action: "destination_use", execution_ref: "exec_" + randomUUID(), caller_module: "TEST", amount: "40", asset_or_currency: "ETH" },
      });
      expect(r1.statusCode).toBe(200);
      expect(r1.json().data.valid).toBe(false);
      expect(r2.statusCode).toBe(200);
      expect(r2.json().data.consumed).toBe(false);
      expect(await totalSensitiveReadCount()).toBe(before);
    });

    it("revoke (unknown destination) — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const before = await totalSensitiveReadCount();
      const res = await app.inject({ method: "POST", url: `/internal/wlt1/destinations/wlt1dest_doesnotexist_${randomUUID()}/revoke`, headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() }, payload: { client_id: OWNED_CLIENT_ID, actor_id: "staff_sensread_it", reason_code: "compromise" } });
      expect(res.statusCode).toBe(404);
      expect(await totalSensitiveReadCount()).toBe(before);
    });

    it("AML revocation (unknown destination) — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const before = await totalSensitiveReadCount();
      const res = await app.inject({
        method: "POST",
        url: "/internal/wlt1/aml-revocations",
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
        payload: { signal_id: "amlsig_" + randomUUID(), signal_type: "sanctions_match", client_id: OWNED_CLIENT_ID, destination_id: "wlt1dest_doesnotexist_" + randomUUID() },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(200);
      expect(await totalSensitiveReadCount()).toBe(before);
    });

    it("rescreening-runs (periodic_due scope, no matching destinations) — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const before = await totalSensitiveReadCount();
      const res = await app.inject({
        method: "POST",
        url: "/internal/wlt1/rescreening-runs",
        headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
        payload: { scope: "periodic_due", requested_by: "staff_sensread_it", batch_size: 1 },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(200);
      expect(await totalSensitiveReadCount()).toBe(before);
    });

    it("provider-results/receipt (malformed/unauthenticated) — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const before = await totalSensitiveReadCount();
      const res = await app.inject({ method: "POST", url: "/internal/wlt1/provider-results/receipt", headers: { "content-type": "application/json" }, payload: { bogus: true } });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(await totalSensitiveReadCount()).toBe(before);
    });

    it("fiat payout-destinations POST (masked account projection) — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      await verifyPool.query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'active' WHERE rail = 'apac_local_my' AND bank_country = 'MY' AND currency = 'MYR'`);
      try {
        mainConfig.clt1FetchImpl = clt1ActiveFetchFor(clientId);
        const before = await totalSensitiveReadCount();
        const res = await app.inject({
          method: "POST",
          url: "/internal/wlt1/payout-destinations",
          headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
          payload: {
            client_id: clientId,
            beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED,
            beneficiary_type: "individual",
            account_identifier_type: "local_account",
            account_identifier: "12345678",
            bank_identifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR,
            bank_identifier_type: "bic",
            bank_country: "MY",
            currency: "MYR",
            rail: "apac_local_my",
          },
        });
        expect(res.statusCode).toBe(201);
        expect(JSON.stringify(res.json())).not.toContain("12345678");
        expect(await totalSensitiveReadCount()).toBe(before);
      } finally {
        await verifyPool.query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'inactive' WHERE rail = 'apac_local_my' AND bank_country = 'MY' AND currency = 'MYR'`);
      }
    });

    it("fiat payout-destinations GET (masked account projection) and assess — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const clientId = freshClientId();
      await verifyPool.query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'active' WHERE rail = 'apac_local_my' AND bank_country = 'MY' AND currency = 'MYR'`);
      try {
        mainConfig.clt1FetchImpl = clt1ActiveFetchFor(clientId);
        const created = await app.inject({
          method: "POST",
          url: "/internal/wlt1/payout-destinations",
          headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
          payload: {
            client_id: clientId,
            beneficiary_name: WLT1_TEST_STUB_BENEFICIARY_VERIFIED,
            beneficiary_type: "individual",
            account_identifier_type: "local_account",
            account_identifier: "12345678",
            bank_identifier: WLT1_TEST_STUB_FIAT_SCREENING_BIC.MY.CLEAR,
            bank_identifier_type: "bic",
            bank_country: "MY",
            currency: "MYR",
            rail: "apac_local_my",
          },
        });
        expect(created.statusCode).toBe(201);
        const destId = created.json().data.destination_id;

        const before = await totalSensitiveReadCount();
        const getRes = await app.inject({ method: "GET", url: `/internal/wlt1/payout-destinations/${destId}?client_id=${encodeURIComponent(clientId)}`, headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken } });
        expect(getRes.statusCode).toBe(200);
        expect(JSON.stringify(getRes.json())).not.toContain("12345678");

        const assessRes = await app.inject({ method: "POST", url: `/internal/wlt1/payout-destinations/${destId}/assess`, headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() }, payload: { client_id: clientId } });
        expect(assessRes.statusCode).toBeGreaterThanOrEqual(200);

        expect(await totalSensitiveReadCount()).toBe(before);
      } finally {
        await verifyPool.query(`UPDATE wlt1.fiat_rail_coverage SET activation_status = 'inactive' WHERE rail = 'apac_local_my' AND bank_country = 'MY' AND currency = 'MYR'`);
      }
    });

    it("health and readiness — zero sensitive-read events", async () => {
      if (!schemaReady) return;
      const before = await totalSensitiveReadCount();
      const h = await app.inject({ method: "GET", url: "/internal/wlt1/health" });
      const r = await app.inject({ method: "GET", url: "/internal/wlt1/readiness" });
      expect(h.statusCode).toBe(200);
      expect(r.statusCode).toBeGreaterThanOrEqual(200);
      expect(await totalSensitiveReadCount()).toBe(before);
    });
  });
});
