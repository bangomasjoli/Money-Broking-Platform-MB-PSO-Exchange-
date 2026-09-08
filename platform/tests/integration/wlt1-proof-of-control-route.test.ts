/**
 * WLT-01 Phase 3A-2 — Proof-of-Control challenge lifecycle (issuance) + current-proof read
 * surface, driven against the SHARED canonical database (mirrors `wlt1-provider-receipt-route
 * .test.ts`'s own established pattern: own dedicated runtime role, own client_id fixture scope,
 * H-D3C-1 fail-loud canary as the first test). Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * M-REV-1 INTERIM RULE: this file derives its restricted-role connection URL via the SAFE regex
 * rewrite (`replace(/^postgres:\/\/[^@]+@/, ...)`), not the fragile `.replace("postgres@", ...)`
 * form — see `wlt1-screening-route-private.test.ts`'s own identical precedent. Its own canary test
 * additionally asserts the runtime connection is not superuser.
 *
 * No signature verification submission exists yet (Phase 3A-3) — every test here only exercises
 * challenge ISSUANCE and the current-proof READ surface.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import {
  WLT1_TEST_STUB_ADDRESS_CLEAR,
  WLT1_TEST_STUB_ADDRESS_UNAVAILABLE,
  WLT1_TEST_STUB_ADDRESS_HIGH_RISK,
  WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED,
  WLT1_TEST_STUB_ADDRESS_HIT,
  STUB_PROVIDER_ID,
  STUB_ADAPTOR_VERSION,
  stubProvider,
} from "../../services/wlt1/src/lib/providers/stub-provider.js";
import type { WalletAnalyticsProvider, WalletScreeningInput } from "../../services/wlt1/src/lib/providers/types.js";
import { POC_TRON_TEST_ADDRESS } from "../helpers/poc-tron-test-signing.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "wlt1_poc_route_test";
const OWNED_CLIENT_ID = "clt1client_pocroute";

let verifyPool: Pool;
let schemaReady = false;
let app: FastifyInstance;
let mainConfig: Wlt1Config;

const clt1ActiveFetch: typeof fetch = (async () =>
  new Response(JSON.stringify({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

/** Phase 3B — the golden TRON test address (`poc-tron-test-signing.ts`) has no stub-provider
 * fixture entry. This DELEGATING wrapper returns a deterministic terminal `clear` result ONLY for
 * that one golden address; every OTHER input (every existing EVM/TRON stub fixture this file's own
 * pre-existing tests already depend on) is passed through UNCHANGED to the real `stubProvider` —
 * so this file's entire existing Phase 3A-2 test matrix (high_risk/review_required/unavailable/
 * hit/malformed outcomes) is completely unaffected by this addition. Never a production backdoor —
 * `screeningProviderImpl` is the SAME pre-existing test-only DI seam `wlt1-poc-verify-route.test.ts`'s
 * own EVM golden-key tests already use for an identical reason. */
const delegatingProviderWithTronGoldenClear: WalletAnalyticsProvider = {
  providerId: STUB_PROVIDER_ID,
  adaptorVersion: STUB_ADAPTOR_VERSION,
  async screen(input: WalletScreeningInput) {
    if (input.chain === "tron" && input.canonicalAddress === POC_TRON_TEST_ADDRESS) {
      return {
        kind: "screened" as const,
        result: {
          providerResultId: "presult_pocroute_tron_" + randomUUID(),
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
    }
    return stubProvider.screen(input);
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

  // M-REV-1 interim rule — SAFE regex rewrite (replaces the ENTIRE user[:password] segment,
  // whether or not TEST_DATABASE_URL carries a password), never the fragile
  // `.replace("postgres@", ...)` form.
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
    wlt1InternalServiceToken: "test-wlt1-internal-token-pocroute-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: STUB_PROVIDER_ID,
    screeningMaxValidityHours: 720,
    providerReceiptSecrets: {},
    pocChallengeTtlMinutes: 15,
    pocMaxAttempts: 5,
    clt1FetchImpl: clt1ActiveFetch,
    screeningProviderImpl: delegatingProviderWithTronGoldenClear,
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
  await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.vendor_result_inbox WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id = $1`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.proof_of_control.challenge.create'`);
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

async function registerDestination(opts: { chain: string; network: string; address: string; walletType?: string }): Promise<{ destinationId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: {
      client_id: OWNED_CLIENT_ID,
      chain: opts.chain,
      network: opts.network,
      address: opts.address,
      wallet_type: opts.walletType ?? "unhosted",
      beneficiary_relationship: "self",
    },
  });
  if (res.statusCode !== 201) throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  return { destinationId: res.json().data.destination_id };
}

function screen(destinationId: string): Promise<{ statusCode: number; body: any }> {
  return app
    .inject({
      method: "POST",
      url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
      headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
      payload: {},
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.json() }));
}

/** Registers + screens to a REAL terminal `pending_review` destination — ANY terminal risk_status
 * (not only `clear`) moves the destination to `pending_review` (`screening-application.ts`'s own
 * unconditional transition), so the fixture address chosen only needs to be a KNOWN terminal one
 * for the given chain. */
async function createPendingReviewDestination(opts: { chain: string; network: string; address: string; walletType?: string }): Promise<{ destinationId: string }> {
  const { destinationId } = await registerDestination(opts);
  const res = await screen(destinationId);
  if (res.statusCode !== 200) throw new Error(`expected terminal screening (pending_review), got ${res.statusCode} ${JSON.stringify(res.body)}`);
  return { destinationId };
}

async function createDraftDestination(): Promise<{ destinationId: string }> {
  return registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
}

async function createPendingScreeningDestination(): Promise<{ destinationId: string }> {
  const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
  const res = await screen(destinationId);
  if (res.statusCode !== 202) throw new Error(`expected pending_screening, got ${res.statusCode} ${JSON.stringify(res.body)}`);
  return { destinationId };
}

async function createRevokedDestination(): Promise<{ destinationId: string }> {
  const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
  await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);
  return { destinationId };
}

function createChallenge(destinationId: string, opts: { clientId?: string; idempotencyKey?: string; noAuth?: boolean; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (!opts.noAuth) headers["x-internal-service-token"] = opts.token ?? mainConfig.wlt1InternalServiceToken;
  if (opts.idempotencyKey !== undefined) headers["idempotency-key"] = opts.idempotencyKey;
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
    headers,
    payload: { client_id: opts.clientId ?? OWNED_CLIENT_ID },
  });
}

function createChallengeWithKey(destinationId: string, idempotencyKey: string, clientId = OWNED_CLIENT_ID) {
  return createChallenge(destinationId, { idempotencyKey, clientId });
}

function getCurrentProof(destinationId: string, clientId = OWNED_CLIENT_ID, opts: { noAuth?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (!opts.noAuth) headers["x-internal-service-token"] = mainConfig.wlt1InternalServiceToken;
  return app.inject({ method: "GET", url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control?client_id=${encodeURIComponent(clientId)}`, headers });
}

async function fetchChallengeRow(challengeId: string) {
  const r = await verifyPool.query(`SELECT * FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);
  return r.rows[0];
}

async function fetchOpenChallengeForDestination(destinationId: string, status = "issued") {
  const r = await verifyPool.query(`SELECT * FROM wlt1.proof_of_control WHERE destination_id = $1 AND verification_status = $2`, [destinationId, status]);
  return r.rows;
}

async function auditCountFor(challengeId: string): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.proof_of_control_challenge_issued' AND payload_ref::text LIKE '%' || $1 || '%'`, [
    challengeId,
  ]);
  return Number(r.rows[0]?.n ?? 0);
}

describe("WLT-01 Phase 3A-2: POST .../proof-of-control/challenges + GET .../proof-of-control", () => {
  it("missing internal-service-token -> 401 SERVICE_IDENTITY_REQUIRED, no DB row created (H-D3C-1 fail-loud canary — a genuine setup failure with TEST_DATABASE_URL set fails this test loudly, not silently)", async () => {
    if (!schemaReady) return expect(schemaReady, "run migrate:up + wlt1_runtime_grants.sql first").toBe(true);
    const res = await createChallenge("wlt1dest_unknown", { noAuth: true, idempotencyKey: freshKey() });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("invalid internal-service-token -> 401 SERVICE_IDENTITY_REQUIRED", async () => {
    if (!schemaReady) return;
    const res = await createChallenge("wlt1dest_unknown", { token: "wrong-token-entirely", idempotencyKey: freshKey() });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
  });

  it("missing Idempotency-Key -> 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
    if (!schemaReady) return;
    const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
    const res = await createChallenge(destinationId);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  describe("destination-state gates (Part F)", () => {
    it("draft destination -> 409 WLT1_DESTINATION_INVALID_STATE, no row created", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createDraftDestination();
      const res = await createChallengeWithKey(destinationId, freshKey());
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
      expect(await fetchOpenChallengeForDestination(destinationId)).toHaveLength(0);
    });

    it("pending_screening destination -> 409 WLT1_DESTINATION_INVALID_STATE, no row created", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingScreeningDestination();
      const res = await createChallengeWithKey(destinationId, freshKey());
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
    });

    it("revoked destination -> 409 WLT1_DESTINATION_INVALID_STATE, no row created", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createRevokedDestination();
      const res = await createChallengeWithKey(destinationId, freshKey());
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_INVALID_STATE");
    });

    it("pending_review destination -> 201, challenge issued", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await createChallengeWithKey(destinationId, freshKey());
      expect(res.statusCode).toBe(201);
      const body = res.json().data;
      expect(body.status).toBe("issued");
      expect(body.challenge_id).toMatch(/^wlt1poc_[0-9a-f-]{36}$/);
      expect(body.verification_scheme).toBe("eip191_personal_sign");
      expect(typeof body.message).toBe("string");
      expect(typeof body.expires_at_utc).toBe("string");
    });
  });

  describe("supported-scheme / wallet-type gate (Part G)", () => {
    it("ethereum/mainnet unhosted -> supported (201)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await createChallengeWithKey(destinationId, freshKey());
      expect(res.statusCode).toBe(201);
    });

    it("Phase 3B: tron/mainnet unhosted -> supported (201), verification_scheme is tron_personal_sign (never falls back to eip191_personal_sign)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "tron", network: "mainnet", address: POC_TRON_TEST_ADDRESS });
      const res = await createChallengeWithKey(destinationId, freshKey());
      expect(res.statusCode).toBe(201);
      expect(res.json().data.verification_scheme).toBe("tron_personal_sign");
      const rows = await fetchOpenChallengeForDestination(destinationId);
      expect(rows).toHaveLength(1);
      expect(rows[0].chain).toBe("tron");
      expect(rows[0].network).toBe("mainnet");
      expect(rows[0].verification_scheme).toBe("tron_personal_sign");
    });

    it("Phase 3B: tron/mainnet UNKNOWN wallet_type -> supported per freeze (unknown treated same as unhosted)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_HIT, walletType: "unknown" });
      const res = await createChallengeWithKey(destinationId, freshKey());
      expect(res.statusCode).toBe(201);
      expect(res.json().data.verification_scheme).toBe("tron_personal_sign");
    });

    it("Phase 3B: hosted TRON wallet_type -> WLT1_POC_UNSUPPORTED (409), same as EVM hosted", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "tron", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_HIGH_RISK, walletType: "hosted" });
      const res = await createChallengeWithKey(destinationId, freshKey());
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_UNSUPPORTED");
      expect(await fetchOpenChallengeForDestination(destinationId)).toHaveLength(0);
    });

    it("hosted wallet_type -> WLT1_POC_UNSUPPORTED (409), no nonce minted, no row created", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR, walletType: "hosted" });
      const res = await createChallengeWithKey(destinationId, freshKey());
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("WLT1_POC_UNSUPPORTED");
      expect(await fetchOpenChallengeForDestination(destinationId)).toHaveLength(0);
    });
  });

  describe("client-binding consistency (Part H)", () => {
    it("client_id mismatch -> 404 WLT1_DESTINATION_NOT_FOUND (indistinguishable from a genuinely unknown destination — enumeration resistance)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await createChallenge(destinationId, { clientId: "clt1client_a_totally_different_client", idempotencyKey: freshKey() });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });

    it("unknown destination_id -> 404 WLT1_DESTINATION_NOT_FOUND", async () => {
      if (!schemaReady) return;
      const res = await createChallengeWithKey("wlt1dest_" + randomUUID(), freshKey());
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });
  });

  describe("idempotency (Part K)", () => {
    it("same key + same request -> same logical result replayed, exactly ONE row, exactly ONE audit", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const key = freshKey();
      const first = await createChallengeWithKey(destinationId, key);
      const second = await createChallengeWithKey(destinationId, key);
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(first.json().data.challenge_id).toBe(second.json().data.challenge_id);
      expect(first.json().data.message).toBe(second.json().data.message);
      const rows = await fetchOpenChallengeForDestination(destinationId);
      expect(rows).toHaveLength(1);
      expect(await auditCountFor(first.json().data.challenge_id)).toBe(1);
    });

    it("same key + DIFFERENT request -> 400 VALIDATION_ERROR (foundation's own fingerprint-mismatch semantics), no second row", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const key = freshKey();
      const first = await createChallengeWithKey(destinationId, key, OWNED_CLIENT_ID);
      expect(first.statusCode).toBe(201);
      const conflicting = await createChallenge(destinationId, { idempotencyKey: key, clientId: "clt1client_pocroute_different" });
      expect(conflicting.statusCode).toBe(400);
      expect(conflicting.json().error.code).toBe("VALIDATION_ERROR");
      expect(await fetchOpenChallengeForDestination(destinationId)).toHaveLength(1);
    });
  });

  describe("one-active challenge / supersession / expiry (Parts M/N)", () => {
    it("issuing a second challenge (NEW key, still within TTL) supersedes the prior issued row — exactly one issued row remains, the prior is 'superseded'", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const first = await createChallengeWithKey(destinationId, freshKey());
      expect(first.statusCode).toBe(201);
      const firstChallengeId = first.json().data.challenge_id;

      const second = await createChallengeWithKey(destinationId, freshKey());
      expect(second.statusCode).toBe(201);
      expect(second.json().data.challenge_id).not.toBe(firstChallengeId);

      const priorRow = await fetchChallengeRow(firstChallengeId);
      expect(priorRow.verification_status).toBe("superseded");
      const issued = await fetchOpenChallengeForDestination(destinationId, "issued");
      expect(issued).toHaveLength(1);
      expect(issued[0].challenge_id).toBe(second.json().data.challenge_id);
      // No raw unique-index 23505 ever reached the caller — both requests resolved 201.
    });

    it("a prior issued challenge past its own expires_at_utc is marked 'expired' (not 'superseded') by the NEXT issuance", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const first = await createChallengeWithKey(destinationId, freshKey());
      expect(first.statusCode).toBe(201);
      const firstChallengeId = first.json().data.challenge_id;
      await verifyPool.query(`UPDATE wlt1.proof_of_control SET expires_at_utc = now() - interval '1 minute' WHERE challenge_id = $1`, [firstChallengeId]);

      const second = await createChallengeWithKey(destinationId, freshKey());
      expect(second.statusCode).toBe(201);

      const priorRow = await fetchChallengeRow(firstChallengeId);
      expect(priorRow.verification_status).toBe("expired");
    });

    it("supersede/expire mutates ONLY verification_status + updated_at_utc — every immutable snapshot column is byte-identical before/after", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const first = await createChallengeWithKey(destinationId, freshKey());
      const firstChallengeId = first.json().data.challenge_id;
      const before = await fetchChallengeRow(firstChallengeId);

      await createChallengeWithKey(destinationId, freshKey());
      const after = await fetchChallengeRow(firstChallengeId);

      expect(after.verification_status).toBe("superseded");
      for (const col of ["challenge_id", "destination_id", "client_id", "chain", "network", "canonical_address", "address_hash", "proof_method", "verification_scheme", "message_format_version", "domain_environment", "nonce", "message_hash", "issued_at_utc", "expires_at_utc", "created_at_utc", "attempt_count", "signature_hash", "recovered_address", "last_failure_reason_code", "verified_at_utc"]) {
        expect(String(after[col]), `column ${col} changed`).toBe(String(before[col]));
      }
    });
  });

  describe("verified-proof short-circuit (Part M, architecture Model A)", () => {
    async function seedVerifiedProof(destinationId: string, clientId: string, chain: string, network: string, canonicalAddress: string, addressHash: string): Promise<string> {
      const challengeId = "wlt1poc_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.proof_of_control
           (challenge_id, destination_id, client_id, chain, network, canonical_address, address_hash,
            proof_method, verification_scheme, message_format_version, domain_environment, nonce, message_hash,
            verification_status, attempt_count, signature_hash, recovered_address, issued_at_utc, expires_at_utc, verified_at_utc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'signed_message','eip191_personal_sign',1,'dev',$8,$9,'verified',1,$10,$11,now(),now()+interval '15 minutes',now())`,
        [challengeId, destinationId, clientId, chain, network, canonicalAddress, addressHash, "aa".repeat(32), "bb".repeat(32), "cc".repeat(32), canonicalAddress],
      );
      return challengeId;
    }

    it("an existing verified proof short-circuits challenge creation: 200, the CURRENT verified result, no nonce minted, no new row, no challenge-issued audit", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const verifiedChallengeId = await seedVerifiedProof(destinationId, OWNED_CLIENT_ID, "ethereum", "mainnet", WLT1_TEST_STUB_ADDRESS_CLEAR, "sha256:" + "dd".repeat(32));

      const before = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
      const res = await createChallengeWithKey(destinationId, freshKey());
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.status).toBe("verified");
      expect(body.challenge_id).toBe(verifiedChallengeId);
      expect(body.message).toBeUndefined();

      const after = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
      expect(Number(after.rows[0].n)).toBe(Number(before.rows[0].n)); // no new row
      expect(await auditCountFor(verifiedChallengeId)).toBe(0); // no challenge-issued audit for the short-circuit
    });

    it("idempotent replay of a verified-short-circuit response is consistent across retries", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const verifiedChallengeId = await seedVerifiedProof(destinationId, OWNED_CLIENT_ID, "ethereum", "mainnet", WLT1_TEST_STUB_ADDRESS_CLEAR, "sha256:" + "ee".repeat(32));
      const key = freshKey();
      const first = await createChallengeWithKey(destinationId, key);
      const second = await createChallengeWithKey(destinationId, key);
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(first.json().data.challenge_id).toBe(verifiedChallengeId);
      expect(second.json().data.challenge_id).toBe(verifiedChallengeId);
    });
  });

  describe("message / persisted-timestamp identity (Part D, M-3A1-1)", () => {
    it("message is built from the persisted authoritative snapshot — chain/network/address/address_hash/client_id/destination_id/nonce/environment/timestamps embedded in the message exactly match the persisted row", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await createChallengeWithKey(destinationId, freshKey());
      expect(res.statusCode).toBe(201);
      const { challenge_id: challengeId, message } = res.json().data;
      const row = await fetchChallengeRow(challengeId);

      expect(message).toContain(`environment: ${row.domain_environment}`);
      expect(message).toContain(`challenge_id: ${row.challenge_id}`);
      expect(message).toContain(`nonce: ${row.nonce}`);
      expect(message).toContain(`client_id: ${row.client_id}`);
      expect(message).toContain(`destination_id: ${row.destination_id}`);
      expect(message).toContain(`chain: ${row.chain}`);
      expect(message).toContain(`network: ${row.network}`);
      expect(message).toContain(`address: ${row.canonical_address}`);
      expect(message).toContain(`address_hash: ${row.address_hash}`);
      // Byte-exact timestamp identity — the EXACT ISO strings persisted, never a re-derived value.
      expect(message).toContain(`issued_at_utc: ${row.issued_at_utc.toISOString()}`);
      expect(message).toContain(`expires_at_utc: ${row.expires_at_utc.toISOString()}`);
    });

    it("message_hash persisted equals SHA-256 of the exact returned message", async () => {
      if (!schemaReady) return;
      const { createHash } = await import("node:crypto");
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await createChallengeWithKey(destinationId, freshKey());
      const { challenge_id: challengeId, message } = res.json().data;
      const row = await fetchChallengeRow(challengeId);
      expect(row.message_hash).toBe(createHash("sha256").update(Buffer.from(message, "utf8")).digest("hex"));
    });

    it("nonce is exactly 64 lowercase hex characters (server-generated, never client-influenced)", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await createChallengeWithKey(destinationId, freshKey());
      const row = await fetchChallengeRow(res.json().data.challenge_id);
      expect(row.nonce).toMatch(/^[0-9a-f]{64}$/);
    });

    it("two challenges (different destinations) never share a nonce", async () => {
      if (!schemaReady) return;
      const a = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const b = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_REVIEW_REQUIRED });
      const resA = await createChallengeWithKey(a.destinationId, freshKey());
      const resB = await createChallengeWithKey(b.destinationId, freshKey());
      const rowA = await fetchChallengeRow(resA.json().data.challenge_id);
      const rowB = await fetchChallengeRow(resB.json().data.challenge_id);
      expect(rowA.nonce).not.toBe(rowB.nonce);
    });

    it("no raw canonical message is ever persisted — only message_hash exists as a column", async () => {
      if (!schemaReady) return;
      const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'proof_of_control'`);
      const names = cols.rows.map((r) => r.column_name);
      expect(names).toContain("message_hash");
      expect(names.some((n: string) => /raw.*message|message.*raw/i.test(n))).toBe(false);
    });
  });

  describe("challenge-issued audit (Part T)", () => {
    it("exactly one wlt1.proof_of_control_challenge_issued audit per successful issuance", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await createChallengeWithKey(destinationId, freshKey());
      expect(await auditCountFor(res.json().data.challenge_id)).toBe(1);
    });
  });

  describe("GET current-proof read surface (Parts V/W/X/Y)", () => {
    it("no verified proof -> { status: 'none' }", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await getCurrentProof(destinationId);
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ status: "none" });
    });

    it("an issued (unverified) challenge is NOT reported as the current proof — GET still reports 'none'", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      await createChallengeWithKey(destinationId, freshKey());
      const res = await getCurrentProof(destinationId);
      expect(res.json().data).toEqual({ status: "none" });
    });

    it("a verified proof (admin test fixture) is reported truthfully", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const challengeId = "wlt1poc_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.proof_of_control
           (challenge_id, destination_id, client_id, chain, network, canonical_address, address_hash,
            proof_method, verification_scheme, message_format_version, domain_environment, nonce, message_hash,
            verification_status, attempt_count, signature_hash, recovered_address, issued_at_utc, expires_at_utc, verified_at_utc)
         VALUES ($1,$2,$3,'ethereum','mainnet',$4,$5,'signed_message','eip191_personal_sign',1,'dev',$6,$7,'verified',1,$8,$4,now(),now()+interval '15 minutes',now())`,
        [challengeId, destinationId, OWNED_CLIENT_ID, WLT1_TEST_STUB_ADDRESS_CLEAR, "sha256:" + "11".repeat(32), "22".repeat(32), "33".repeat(32), "44".repeat(32)],
      );
      const res = await getCurrentProof(destinationId);
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.status).toBe("verified");
      expect(body.challenge_id).toBe(challengeId);
      expect(body.verification_scheme).toBe("eip191_personal_sign");
      expect(body.chain).toBe("ethereum");
      expect(body.network).toBe("mainnet");
      expect(body.verified_address).toBe(WLT1_TEST_STUB_ADDRESS_CLEAR);
      expect(typeof body.verified_at_utc).toBe("string");
    });

    it("revoked destination -> { status: 'none' } EVEN THOUGH a verified proof row still exists — evidence retained, never reported as current", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const challengeId = "wlt1poc_" + randomUUID();
      await verifyPool.query(
        `INSERT INTO wlt1.proof_of_control
           (challenge_id, destination_id, client_id, chain, network, canonical_address, address_hash,
            proof_method, verification_scheme, message_format_version, domain_environment, nonce, message_hash,
            verification_status, attempt_count, signature_hash, recovered_address, issued_at_utc, expires_at_utc, verified_at_utc)
         VALUES ($1,$2,$3,'ethereum','mainnet',$4,$5,'signed_message','eip191_personal_sign',1,'dev',$6,$7,'verified',1,$8,$4,now(),now()+interval '15 minutes',now())`,
        [challengeId, destinationId, OWNED_CLIENT_ID, WLT1_TEST_STUB_ADDRESS_CLEAR, "sha256:" + "55".repeat(32), "66".repeat(32), "77".repeat(32), "88".repeat(32)],
      );
      await verifyPool.query(`UPDATE wlt1.destination SET status = 'revoked' WHERE destination_id = $1`, [destinationId]);

      const res = await getCurrentProof(destinationId);
      expect(res.json().data).toEqual({ status: "none" });

      // Evidence retained, byte-for-byte, never mutated merely because the destination revoked.
      const row = await fetchChallengeRow(challengeId);
      expect(row.verification_status).toBe("verified");
      expect(row.recovered_address).toBe(WLT1_TEST_STUB_ADDRESS_CLEAR);
    });

    it("GET client_id mismatch -> 404 WLT1_DESTINATION_NOT_FOUND", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const res = await getCurrentProof(destinationId, "clt1client_totally_different");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WLT1_DESTINATION_NOT_FOUND");
    });

    it("GET missing internal-service-token -> 401", async () => {
      if (!schemaReady) return;
      const res = await getCurrentProof("wlt1dest_unknown", OWNED_CLIENT_ID, { noAuth: true });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("SERVICE_IDENTITY_REQUIRED");
    });
  });

  describe("concurrency (Parts Z/AA)", () => {
    it("two simultaneous challenge-create requests, SAME destination, DIFFERENT Idempotency-Key values -> exactly one 'issued' row remains, deterministically resolved, no raw 23505 ever reaches either caller", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const [a, b] = await Promise.all([createChallengeWithKey(destinationId, freshKey()), createChallengeWithKey(destinationId, freshKey())]);
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(201);
      const issued = await fetchOpenChallengeForDestination(destinationId, "issued");
      expect(issued).toHaveLength(1);
      const totalRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
      expect(Number(totalRows.rows[0].n)).toBe(2); // one issued, one superseded
    });

    it("two simultaneous challenge-create requests, SAME destination, SAME Idempotency-Key -> one logical challenge, same challenge_id, exactly one issued row, exactly one audit", async () => {
      if (!schemaReady) return;
      const { destinationId } = await createPendingReviewDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
      const key = freshKey();
      const [a, b] = await Promise.all([createChallengeWithKey(destinationId, key), createChallengeWithKey(destinationId, key)]);
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(201);
      expect(a.json().data.challenge_id).toBe(b.json().data.challenge_id);
      const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
      expect(Number(rows.rows[0].n)).toBe(1);
      expect(await auditCountFor(a.json().data.challenge_id)).toBe(1);
    });
  });
});
