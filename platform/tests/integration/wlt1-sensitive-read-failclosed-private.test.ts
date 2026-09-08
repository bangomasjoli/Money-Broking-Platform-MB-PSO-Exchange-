/**
 * WLT-01 Sensitive Read Logging (FR-018) — fail-closed failure injection, PRIVATE disposable
 * database. Mirrors `wlt1-poc-audit-atomicity-private.test.ts`'s own established rationale
 * exactly: this file's own mechanism is to REVOKE/GRANT `role_wlt1_runtime`'s INSERT privilege
 * on `foundation.outbox_event` — an ACL mutation against the SHARED canonical database's shared
 * role would remove ordinary INSERT privilege from any bystander request another concurrently-
 * running file's test might issue. This file provisions its own PRIVATE, uniquely named,
 * disposable database (migrated to head, with the real `fnd`/`wlt1` runtime grant files applied)
 * so its ACL mutation can never reach any other file's bystander request. The shared canonical
 * database's `role_wlt1_runtime` privilege state is never touched by this file.
 *
 * REAL failure injection, not a mocked helper: a genuinely `verified` Proof-of-Control challenge
 * (real golden-key cryptography through the real routes) is set up first; the outbox INSERT is
 * then forced to fail for the runtime role; the sensitive GET is invoked; the assertion is that
 * the outward HTTP response is 503 `WLT1_SENSITIVE_READ_LOG_REQUIRED` and its body contains NO
 * substring of the real disclosed wallet address — proving the sensitive value never escaped.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { closePool, initPool } from "@aix/foundation";
import type { Wlt1Config } from "../../services/wlt1/src/config.js";
import { buildApp } from "../../services/wlt1/src/server.js";
import { STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION } from "../../services/wlt1/src/lib/providers/stub-provider.js";
import type { WalletAnalyticsProvider, WalletScreeningInput } from "../../services/wlt1/src/lib/providers/types.js";
import { withOutboxAclLock } from "../helpers/outbox-acl-lock.js";
import { POC_TEST_ADDRESS_RAW, POC_TEST_ADDRESS_CANONICAL, signPocMessage } from "../helpers/poc-test-signing.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_sensread_failclosed_private_test";

const PRIVATE_DB_NAME = `wlt1_sensread_it_${randomBytes(6).toString("hex")}`;

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function silentLog(): void {
  /* silence node-pg-migrate's own verbose per-statement logging */
}

function ignoreExpectedDisconnect(): void {
  /* intentionally empty — expected during DROP DATABASE ... WITH (FORCE) teardown */
}

let maintenancePool: Pool;
let privateDbUrl: string;
let verifyPool: Pool;
let app: FastifyInstance;
let mainConfig: Wlt1Config;
let schemaReady = false;
let databaseCreated = false;

const OWNED_CLIENT_ID = "clt1client_sensreadfcp";

const clt1ActiveFetch: typeof fetch = (async () =>
  new Response(JSON.stringify({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

/** The golden test key's own derived address has no stub-provider fixture entry — the SAME
 * established `screeningProviderImpl` test-injection seam every prior WLT-01 PoC test file uses. */
const alwaysClearProvider: WalletAnalyticsProvider = {
  providerId: STUB_PROVIDER_ID,
  adaptorVersion: STUB_ADAPTOR_VERSION,
  async screen(_input: WalletScreeningInput) {
    return {
      kind: "screened" as const,
      result: {
        providerResultId: "presult_sensreadfcp_" + randomUUID(),
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

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-sensread-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-sensread-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-sensread-it-private-db-iam02-token";

  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

  verifyPool = new Pool({ connectionString: privateDbUrl });
  verifyPool.on("error", ignoreExpectedDisconnect);

  await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "fnd_runtime_grants.sql"), "utf8"));
  await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "wlt1_runtime_grants.sql"), "utf8"));

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

  const runtimeDbUrl = privateDbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
  initPool(runtimeDbUrl);

  mainConfig = {
    environment: "dev",
    databaseUrl: privateDbUrl,
    internalServiceToken: "test-wlt1-shared-token-unused",
    port: 0,
    releaseVersion: "v0.1.0-it",
    artifactHash: "sha256:it",
    buildTimeUtc: "2026-01-01T00:00:00Z",
    wlt1InternalServiceToken: "test-wlt1-internal-token-sensreadfcp-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: STUB_PROVIDER_ID,
    screeningMaxValidityHours: 720,
    providerReceiptSecrets: {},
    pocChallengeTtlMinutes: 15,
    pocMaxAttempts: 5,
    clt1FetchImpl: clt1ActiveFetch,
    screeningProviderImpl: alwaysClearProvider,
  };
  app = await buildApp(mainConfig);

  schemaReady = true;
}, 60_000);

afterAll(async () => {
  if (app) await app.close();
  await closePool();
  await verifyPool?.end();
  if (maintenancePool) {
    if (databaseCreated) {
      await maintenancePool.query(`DROP DATABASE IF EXISTS ${PRIVATE_DB_NAME} WITH (FORCE)`).catch(async () => {
        await maintenancePool.query(`DROP DATABASE IF EXISTS ${PRIVATE_DB_NAME}`).catch(() => undefined);
      });
    }
    await maintenancePool.end();
  }
});

afterEach(async () => {
  if (!schemaReady) return;
  await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id = $1`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM foundation.idempotency_record WHERE source_module = 'WLT-01' AND action = 'wlt1.proof_of_control.challenge.create'`);
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

async function createSignableDestination(): Promise<{ destinationId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: { client_id: OWNED_CLIENT_ID, chain: "ethereum", network: "mainnet", address: POC_TEST_ADDRESS_RAW, wallet_type: "unhosted", beneficiary_relationship: "self" },
  });
  if (res.statusCode !== 201) throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  const destinationId = res.json().data.destination_id;
  const screenRes = await app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey() },
    payload: {},
  });
  if (screenRes.statusCode !== 200) throw new Error(`expected terminal screening, got ${screenRes.statusCode} ${screenRes.body}`);
  return { destinationId };
}

function createChallenge(destinationId: string, idempotencyKey: string) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control/challenges`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": idempotencyKey },
    payload: { client_id: OWNED_CLIENT_ID },
  });
}

function submitVerify(destinationId: string, challengeId: string, signature: string) {
  return app.inject({
    method: "POST",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control/verify`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
    payload: { client_id: OWNED_CLIENT_ID, challenge_id: challengeId, signature },
  });
}

function getCurrentProof(destinationId: string) {
  return app.inject({
    method: "GET",
    url: `/internal/wlt1/wallet-destinations/${destinationId}/proof-of-control?client_id=${encodeURIComponent(OWNED_CLIENT_ID)}`,
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken },
  });
}

describe("WLT-01 Sensitive Read Logging — fail-closed audit atomicity (private database)", () => {
  it("PRECONDITION (M-REV-1 interim rule): the runtime connection genuinely runs as the restricted role, never postgres superuser", async () => {
    if (!schemaReady) return;
    const r = await verifyPool.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`, [RUNTIME_ROLE_USER]);
    expect(r.rows[0].rolsuper).toBe(false);
    expect(r.rows[0].rolbypassrls).toBe(false);
  });

  it("REAL failure injection: a genuinely verified PoC challenge exists (real crypto, would disclose the real address) — the sensitive-read audit INSERT is forced to fail — the GET route returns 503 WLT1_SENSITIVE_READ_LOG_REQUIRED and its body contains NO substring of the real wallet address; ACL is restored and a genuine retry then succeeds and discloses correctly", async () => {
    if (!schemaReady) return;
    const { destinationId } = await createSignableDestination();
    const challengeRes = await createChallenge(destinationId, freshKey());
    expect(challengeRes.statusCode).toBe(201);
    const challengeId = challengeRes.json().data.challenge_id;
    const message = challengeRes.json().data.message;
    const signature = signPocMessage(message);

    const verifyRes = await submitVerify(destinationId, challengeId, signature);
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().data.verified_address).toBe(POC_TEST_ADDRESS_CANONICAL);

    // Sanity: the sensitive-read events from the challenge-create ("issued", discloses `message`)
    // AND the verify ("verified", discloses `verified_address`) calls both DID commit (ACL not
    // yet touched) — proves the harness is genuinely exercising the real logging path, not a
    // no-op.
    const beforeInjection = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.sensitive_destination_read'`);
    expect(Number(beforeInjection.rows[0].n)).toBe(2);

    await withOutboxAclLock(TEST_DB as string, async () => {
      await verifyPool.query(`REVOKE INSERT ON foundation.outbox_event FROM role_wlt1_runtime`);
      try {
        const res = await getCurrentProof(destinationId);
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("WLT1_SENSITIVE_READ_LOG_REQUIRED");
        // CRITICAL: the sensitive value must never have escaped, in any field, in any casing.
        const raw = JSON.stringify(res.json());
        expect(raw).not.toContain(POC_TEST_ADDRESS_RAW);
        expect(raw.toLowerCase()).not.toContain(POC_TEST_ADDRESS_CANONICAL.toLowerCase());
        expect(raw).not.toMatch(/verified_address/);
      } finally {
        await verifyPool.query(`GRANT INSERT ON foundation.outbox_event TO role_wlt1_runtime`);
      }
    });

    // No sensitive-read record was left behind by the forced failure.
    const afterInjection = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.sensitive_destination_read'`);
    expect(Number(afterInjection.rows[0].n)).toBe(2); // still just the two from challenge-create + verify above

    // The underlying `wlt1.proof_of_control` row is completely untouched by the failed GET —
    // this route makes no mutation at all, so there is nothing to roll back; the ONLY effect of
    // the forced failure was correctly withholding the response.
    const row = await verifyPool.query(`SELECT verification_status, recovered_address FROM wlt1.proof_of_control WHERE challenge_id = $1`, [challengeId]);
    expect(row.rows[0].verification_status).toBe("verified");
    expect(row.rows[0].recovered_address).toBe(POC_TEST_ADDRESS_CANONICAL);

    // A genuine retry after ACL restoration succeeds for real and discloses correctly.
    const retry = await getCurrentProof(destinationId);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data.verified_address).toBe(POC_TEST_ADDRESS_CANONICAL);
    const afterRetry = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.outbox_event WHERE event_type = 'wlt1.sensitive_destination_read'`);
    expect(Number(afterRetry.rows[0].n)).toBe(3); // the earlier two records + this retry's own new record
  });
});
