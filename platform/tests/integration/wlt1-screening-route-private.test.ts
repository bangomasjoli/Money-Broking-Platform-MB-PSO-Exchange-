/**
 * WLT-01 `/screen` chain_coverage-mutation probes — PRIVATE, disposable database.
 *
 * M-D3B-2 remediation (Phase 2C-D3C): independent Opus review of Phase 2C-D3B proved that two
 * tests formerly in `wlt1-screening-route.test.ts` — "an unknown provider registry id named by
 * chain_coverage fails closed..." and "provider-identity drift: chain_coverage.provider_id
 * changed..." — mutate the GLOBALLY SHARED `wlt1.chain_coverage` `(ethereum, mainnet)` row on the
 * SHARED canonical database while holding the mutated state across a real `registerDestination` +
 * `screen()` HTTP round trip. Any concurrently-running file's bystander request resolving
 * ethereum/mainnet during that window (e.g. `wlt1-provider-receipt-route.test.ts`'s own
 * `createRealPendingScreening()`, which registers on ethereum/mainnet) observes the temporarily
 * unregistered/wrong provider id and fails closed with `WLT1_SERVICE_UNAVAILABLE` — causally
 * proven by the independent Opus review (holding the identical mutation window on a fresh database
 * reproduced ~50% failure in `wlt1-provider-receipt-route.test.ts` under default file parallelism;
 * `--no-file-parallelism` runs were 100% green).
 *
 * This is the EXACT SAME defect class `wlt1-outbox-acl-private.test.ts` already remediated for
 * outbox-ACL REVOKE/GRANT (see that file's own header comment) — the fix is not a better lock (no
 * advisory-lock discipline protects a bystander that never takes the lock), it is a PRIVATE,
 * uniquely named, disposable database so the mutation can never reach another file's bystander
 * request. Mirrors that file's own provisioning pattern exactly: `CREATE DATABASE`, migrate via
 * node-pg-migrate's programmatic `runner()`, `DROP DATABASE ... WITH (FORCE)` in `afterAll`, a
 * no-op `'error'` listener on every pool that can observe the administrative disconnect during
 * drop.
 *
 * ONLY these two mutating scenarios are moved here — every other `wlt1-screening-route.test.ts`
 * test that does not mutate `chain_coverage` remains in that file, unchanged, against the shared
 * canonical database (M-D3B-2's own scope: do not broaden into repository-wide test cleanup).
 * Assertions and control purpose are preserved verbatim from the moved originals.
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
import { WLT1_TEST_STUB_ADDRESS_CLEAR, WLT1_TEST_STUB_ADDRESS_UNAVAILABLE, stubProvider, STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION } from "../../services/wlt1/src/lib/providers/stub-provider.js";
import type { WalletScreeningInput } from "../../services/wlt1/src/lib/providers/types.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_screening_route_private_test";

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_screening_route_private_it_${randomBytes(6).toString("hex")}`;

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function silentLog(): void {
  /* silence node-pg-migrate's own verbose per-statement logging */
}

/** No-op — expected during `DROP DATABASE ... WITH (FORCE)` teardown, which administratively
 * terminates any remaining backend on the dropped database. Without this listener `pg` surfaces
 * that expected disconnect as an unhandled exception (mirrors wlt1-outbox-acl-private.test.ts's
 * own identical Issue-C hardening). Never swallows an assertion or test-body error — those
 * propagate normally through the awaited query/test promise chain, not through this listener. */
function ignoreExpectedDisconnect(): void {
  /* intentionally empty */
}

let maintenancePool: Pool;
let privateDbUrl: string;
let verifyPool: Pool;
let app: FastifyInstance;
let mainConfig: Wlt1Config;
let schemaReady = false;
let databaseCreated = false;

const OWNED_CLIENT_ID = "clt1client_screenroute_private";

const clt1ActiveFetch: typeof fetch = (async () =>
  new Response(JSON.stringify({ success: true, data: { client_id: OWNED_CLIENT_ID, status: "active" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-screenroute-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-screenroute-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-screenroute-it-private-db-iam02-token";

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
    wlt1InternalServiceToken: "test-wlt1-internal-token-screenrouteprivate-it",
    clt1BaseUrl: "http://127.0.0.1:0",
    clt1InternalServiceToken: "test-clt1-internal-token-it",
    screeningProviderId: STUB_PROVIDER_ID,
    screeningMaxValidityHours: 720,
    providerReceiptSecrets: {},
    clt1FetchImpl: clt1ActiveFetch,
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
  mainConfig.screeningProviderImpl = undefined;
  await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.vendor_result_inbox WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.address_integrity_check WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.wallet_destination WHERE destination_id IN (SELECT destination_id FROM wlt1.destination WHERE client_id = $1)`, [OWNED_CLIENT_ID]);
  await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id = $1`, [OWNED_CLIENT_ID]);
});

function freshKey(prefix = "idem"): string {
  return `${prefix}_${randomUUID()}`;
}

async function registerDestination(opts: { chain: string; network: string; address: string }): Promise<{ destinationId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/internal/wlt1/wallet-destinations",
    headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": freshKey("reg") },
    payload: { client_id: OWNED_CLIENT_ID, chain: opts.chain, network: opts.network, address: opts.address, wallet_type: "unhosted", beneficiary_relationship: "self" },
  });
  if (res.statusCode !== 201) throw new Error(`registration failed: ${res.statusCode} ${res.body}`);
  return { destinationId: res.json().data.destination_id };
}

function screen(destinationId: string, idempotencyKey: string): Promise<{ statusCode: number; body: any }> {
  return app
    .inject({
      method: "POST",
      url: `/internal/wlt1/wallet-destinations/${destinationId}/screen`,
      headers: { "x-internal-service-token": mainConfig.wlt1InternalServiceToken, "idempotency-key": idempotencyKey },
      payload: {},
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.json() }));
}

async function forceEligible(screeningResultId: string): Promise<void> {
  await verifyPool.query(`UPDATE wlt1.wallet_screening_result SET updated_at_utc = now() - interval '31 seconds' WHERE screening_result_id = $1`, [screeningResultId]);
}

describe("WLT-01 /screen chain_coverage-mutation probes (private database)", () => {
  describe("provider resolution (moved from wlt1-screening-route.test.ts)", () => {
    it("an unknown provider registry id named by chain_coverage fails closed as WLT1_SERVICE_UNAVAILABLE, provider id never exposed", async () => {
      if (!schemaReady) return;
      await verifyPool.query(`UPDATE wlt1.chain_coverage SET provider_id = 'not-a-real-registered-provider' WHERE chain = 'ethereum' AND network = 'mainnet'`);
      try {
        const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_CLEAR });
        const res = await screen(destinationId, freshKey());
        expect(res.statusCode).toBe(503);
        expect(res.body.error.code).toBe("WLT1_SERVICE_UNAVAILABLE");
        expect(JSON.stringify(res.body)).not.toContain("not-a-real-registered-provider");
        const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
        expect(rows.rows[0].n).toBe(0);
      } finally {
        await verifyPool.query(`UPDATE wlt1.chain_coverage SET provider_id = 'stub-wallet-analytics-v1' WHERE chain = 'ethereum' AND network = 'mainnet'`);
      }
    });
  });

  describe("Phase 2C-C3 — provider-identity drift (moved from wlt1-screening-route.test.ts)", () => {
    it("provider-identity drift: chain_coverage.provider_id changed since initiation -> WLT1_SERVICE_UNAVAILABLE, NO provider call, same row/version unchanged", async () => {
      if (!schemaReady) return;
      const { destinationId } = await registerDestination({ chain: "ethereum", network: "mainnet", address: WLT1_TEST_STUB_ADDRESS_UNAVAILABLE });
      const first = await screen(destinationId, freshKey());
      expect(first.statusCode).toBe(202);
      const screeningResultId = first.body.data.screening_result_id as string;
      await forceEligible(screeningResultId);

      const before = await verifyPool.query(`SELECT provider_id FROM wlt1.chain_coverage WHERE chain = 'ethereum' AND network = 'mainnet'`);
      const originalProviderId = before.rows[0].provider_id as string;
      await verifyPool.query(`UPDATE wlt1.chain_coverage SET provider_id = 'totally-different-provider-id-drift-test' WHERE chain = 'ethereum' AND network = 'mainnet'`);
      try {
        let called = false;
        mainConfig.screeningProviderImpl = {
          providerId: STUB_PROVIDER_ID,
          adaptorVersion: STUB_ADAPTOR_VERSION,
          async screen(input: WalletScreeningInput) {
            called = true;
            return stubProvider.screen(input);
          },
        };
        const retry = await screen(destinationId, freshKey());
        expect(retry.statusCode).toBe(503);
        expect(retry.body.error.code).toBe("WLT1_SERVICE_UNAVAILABLE");
        expect(called).toBe(false);

        const row = await verifyPool.query(`SELECT screening_result_id, screening_result_version, risk_status FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
        expect(row.rows).toHaveLength(1);
        expect(row.rows[0].screening_result_id).toBe(screeningResultId);
        expect(row.rows[0].screening_result_version).toBe(1);
        expect(row.rows[0].risk_status).toBe("pending");
      } finally {
        await verifyPool.query(`UPDATE wlt1.chain_coverage SET provider_id = $1 WHERE chain = 'ethereum' AND network = 'mainnet'`, [originalProviderId]);
        mainConfig.screeningProviderImpl = undefined;
      }
    });
  });
});
