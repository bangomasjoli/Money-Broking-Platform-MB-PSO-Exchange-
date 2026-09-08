/**
 * WLT-01 Phase 2C-C1 — committed automated regression coverage for
 * `infra/migrations/052_wlt1_screening_address_hash_width.cjs`'s own up/down/re-up and
 * evidence-preserving down behaviour, from day one (per the migration-050 regression lesson —
 * never repeat the Phase 2B manual-only coverage gap). Self-skips unless `TEST_DATABASE_URL` is
 * set.
 *
 * Mirrors `tests/integration/wlt1-migration-051-regression.test.ts`'s own established pattern
 * exactly: a PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's
 * programmatic `runner()` API, dropped in `afterAll`. Migration 052 itself is never modified —
 * this file only drives the migration runner and independently verifies real database state via
 * direct SQL after every step.
 *
 * REAL HASH, NOT A SYNTHETIC SHORT LITERAL: this file reproduces the exact case that fails
 * against the pre-052 schema by generating a REAL address_hash through the accepted
 * `computeAddressHash(...)` (`services/wlt1/src/lib/destinations.ts`) — the foundation
 * `fingerprint()` representation, `"sha256:" + <64 hex chars>` = 71 characters — never a
 * hand-shortened stand-in.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";
import { computeAddressHash } from "../../services/wlt1/src/lib/destinations.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");

/** Exactly 51 migration files precede `052_wlt1_screening_address_hash_width.cjs`. */
const MIGRATIONS_THROUGH_051 = 51;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig052_regr_it_${randomBytes(6).toString("hex")}`;

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

let maintenancePool: Pool;
let privateDbUrl: string;
let verifyPool: Pool;
let schemaReady = false;
// Tracks CREATE DATABASE succeeding independently of whether LATER setup (migrations, role
// creation) completes — teardown must drop the database whenever it was actually created, not
// only when the whole beforeAll finished (which would leak the private database on a partial
// setup failure between CREATE DATABASE and the schemaReady=true assignment).
let databaseCreated = false;

function silentLog(): void {
  /* silence node-pg-migrate's own verbose per-statement logging */
}

/** No-op — expected during `DROP DATABASE ... WITH (FORCE)` teardown, which administratively
 * terminates any remaining backend on the dropped database. Without this listener `pg` surfaces
 * that expected disconnect as an unhandled exception. Never swallows an assertion or test-body
 * error — those propagate normally through the awaited query/test promise chain, not through this
 * listener. */
function ignoreExpectedDisconnect(): void {
  /* intentionally empty */
}

async function migrationHead(): Promise<string | undefined> {
  const r = await verifyPool.query(`SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1`);
  return r.rows[0]?.name;
}

async function addressHashColumnShape(): Promise<{ data_type: string; character_maximum_length: number } | undefined> {
  const r = await verifyPool.query(
    `SELECT data_type, character_maximum_length FROM information_schema.columns
      WHERE table_schema = 'wlt1' AND table_name = 'wallet_screening_result' AND column_name = 'address_hash'`,
  );
  return r.rows[0];
}

async function insertDestinationAndPendingScreening(destinationId: string, screeningResultId: string, addressHash: string): Promise<void> {
  await verifyPool.query(
    `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, 'pending_screening')`,
    [destinationId, "clt1client_mig052regr", "hash_" + randomUUID()],
  );
  await verifyPool.query(
    `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash)
     VALUES ($1, $2, 1, 'stub-wallet-analytics-v1', '1', 'ethereum', 'mainnet', $3)`,
    [screeningResultId, destinationId, addressHash],
  );
}

describe("WLT-01 Phase 2C-C1: migration 052 up/down/re-up + evidence-preserving down (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig052-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig052-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig052-regr-it-private-db-iam02-token";

    verifyPool = new Pool({ connectionString: privateDbUrl });
    verifyPool.on("error", ignoreExpectedDisconnect);
    schemaReady = true;
  }, 60_000);

  afterAll(async () => {
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

  it("A. migrating up through exactly 51 migrations reaches head 051_wlt1_screening_lifecycle with address_hash varchar(64)", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_051, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("051_wlt1_screening_lifecycle");
    const shape = await addressHashColumnShape();
    expect(shape?.data_type).toBe("character varying");
    expect(Number(shape?.character_maximum_length)).toBe(64);
  }, 60_000);

  it("B. migrating up one more migration reaches head 052 with address_hash widened to varchar(128), no unrelated schema drift", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("052_wlt1_screening_address_hash_width");
    const shape = await addressHashColumnShape();
    expect(shape?.data_type).toBe("character varying");
    expect(Number(shape?.character_maximum_length)).toBe(128);

    const tableCount = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1'`);
    expect(Number(tableCount.rows[0]?.n)).toBe(6);
  }, 60_000);

  let evidenceDestinationId: string;
  let evidenceScreeningResultId: string;
  let realAddressHash: string;

  it("C. real computeAddressHash is 71 characters and persists byte-for-byte — the exact case that overflows varchar(64)", async () => {
    if (!schemaReady) return;
    realAddressHash = computeAddressHash("ethereum", "mainnet", "0x56445b274e67797c7a0C151919085239322a31c5", "");
    expect(realAddressHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(realAddressHash.length).toBe(71);

    evidenceDestinationId = "wlt1dest_052w_" + randomUUID();
    evidenceScreeningResultId = "wlt1screen_052w_" + randomUUID();
    await insertDestinationAndPendingScreening(evidenceDestinationId, evidenceScreeningResultId, realAddressHash);

    const row = await verifyPool.query(`SELECT address_hash FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [evidenceScreeningResultId]);
    expect(row.rows[0]?.address_hash).toBe(realAddressHash);
  }, 60_000);

  it("D. with the 71-character evidence row present, down is refused; head/width/row/all tables are preserved", async () => {
    if (!schemaReady) return;
    await expect(
      runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog }),
    ).rejects.toThrow(/address_hash value longer than 64 characters/);

    expect(await migrationHead()).toBe("052_wlt1_screening_address_hash_width");
    const shape = await addressHashColumnShape();
    expect(Number(shape?.character_maximum_length)).toBe(128);
    const stillThere = await verifyPool.query(`SELECT address_hash FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [evidenceScreeningResultId]);
    expect(stillThere.rows).toEqual([{ address_hash: realAddressHash }]);
    const tableCount = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1'`);
    expect(Number(tableCount.rows[0]?.n)).toBe(6);
  }, 60_000);

  it("E. controlled cleanup of the migration-test fixture (privileged test setup, not a runtime DELETE grant)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [evidenceScreeningResultId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [evidenceDestinationId]);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE address_hash IS NOT NULL AND length(address_hash) > 64`);
    expect(remaining.rows[0]?.n).toBe(0);
  }, 60_000);

  it("F. with no over-length evidence remaining, down succeeds cleanly back to head 051 with address_hash restored to varchar(64)", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("051_wlt1_screening_lifecycle");
    const shape = await addressHashColumnShape();
    expect(shape?.data_type).toBe("character varying");
    expect(Number(shape?.character_maximum_length)).toBe(64);
  }, 60_000);

  it("G. re-up restores the exact Phase 2C-C1 schema: head 052, address_hash varchar(128)", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("052_wlt1_screening_address_hash_width");
    const shape = await addressHashColumnShape();
    expect(Number(shape?.character_maximum_length)).toBe(128);

    // Re-up also re-accepts the real 71-character hash, proving the width fix is genuinely durable.
    const reDestinationId = "wlt1dest_052w_reup_" + randomUUID();
    const reScreeningResultId = "wlt1screen_052w_reup_" + randomUUID();
    const reHash = computeAddressHash("tron", "mainnet", "TG1mwc48txnCWUGN3JK2ZxR54RpAHcuMeM", "");
    expect(reHash.length).toBe(71);
    await insertDestinationAndPendingScreening(reDestinationId, reScreeningResultId, reHash);
    const row = await verifyPool.query(`SELECT address_hash FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [reScreeningResultId]);
    expect(row.rows[0]?.address_hash).toBe(reHash);
    await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [reScreeningResultId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [reDestinationId]);
  }, 60_000);
});
