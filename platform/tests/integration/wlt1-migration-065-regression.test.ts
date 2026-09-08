/**
 * WLT-01 Named Vendor-Result Ingestion / Async Path — Stuck-Screening Operational Closure —
 * committed automated regression coverage for
 * `infra/migrations/065_wlt1_screening_failed_status.cjs`'s own up/down/re-up behaviour, from day
 * one (mirrors migration 060's own established `DROP CONSTRAINT`/`ADD CONSTRAINT` widening
 * pattern in `wlt1-migration-060-regression.test.ts`). Self-skips unless `TEST_DATABASE_URL` is
 * set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's programmatic
 * `runner()` API, dropped in `afterAll`. Migration 065 itself is never modified — this file only
 * drives the migration runner and independently verifies real database state via direct SQL after
 * every step.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only. Grant-boundary
 * behaviour (proving NO grant change was needed) is covered separately in
 * `tests/integration/wlt1-db.test.ts` / `wlt1-stuck-screening-route.test.ts`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");

/** Exactly 64 migration files precede `065_wlt1_screening_failed_status.cjs`. */
const MIGRATIONS_THROUGH_064 = 64;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig065_regr_it_${randomBytes(6).toString("hex")}`;

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

let maintenancePool: Pool;
let privateDbUrl: string;
let verifyPool: Pool;
let schemaReady = false;
let databaseCreated = false;

function silentLog(): void {
  /* silence node-pg-migrate's own verbose per-statement logging */
}

function ignoreExpectedDisconnect(): void {
  /* intentionally empty — expected during DROP DATABASE ... WITH (FORCE) teardown */
}

async function migrationHead(): Promise<string | undefined> {
  const r = await verifyPool.query(`SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1`);
  return r.rows[0]?.name;
}

async function riskStatusCheckDef(): Promise<string | undefined> {
  const r = await verifyPool.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.wallet_screening_result'::regclass AND conname = 'wallet_screening_result_risk_status_check'`,
  );
  return r.rows[0]?.def;
}

async function insertDestination(destinationId: string, status = "pending_screening"): Promise<void> {
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, $4)`, [
    destinationId,
    "clt1client_mig065regr",
    "hash_" + randomUUID(),
    status,
  ]);
}

async function insertScreening(destinationId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const screeningResultId = (overrides.screening_result_id as string) ?? "wlt1screen_" + randomUUID();
  const riskStatus = (overrides.risk_status as string) ?? "pending";
  const version = (overrides.screening_result_version as number) ?? 1;
  await verifyPool.query(
    `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash, risk_status, issued_at_utc)
     VALUES ($1,$2,$5,'stub-wallet-analytics-v1','1','ethereum','mainnet',$3,$4, now())`,
    [screeningResultId, destinationId, "addrhash_" + randomUUID(), riskStatus, version],
  );
  return screeningResultId;
}

describe("WLT-01 Stuck-Screening Operational Closure: migration 065 up/down/re-up + evidence-preserving down + risk_status CHECK widening (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig065-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig065-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig065-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 64 migrations reaches head 064; risk_status CHECK does not yet accept 'failed'", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_064, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("064_wlt1_inbound_source_screening");
    const def = await riskStatusCheckDef();
    expect(def).not.toMatch(/failed/);
  }, 60_000);

  it("B. migrating up one more migration reaches head 065 — risk_status CHECK now accepts 'failed'", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("065_wlt1_screening_failed_status");
    const def = await riskStatusCheckDef();
    expect(def).toMatch(/failed/);
  }, 60_000);

  it("C. no new table and no new column were introduced — wlt1.wallet_screening_result column list is byte-identical to the pre-065 shape", async () => {
    if (!schemaReady) return;
    const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'wallet_screening_result' ORDER BY ordinal_position`);
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      "id",
      "screening_result_id",
      "destination_id",
      "screening_result_version",
      "provider_id",
      "provider_adaptor_version",
      "provider_result_id",
      "chain",
      "network",
      "address_hash",
      "risk_status",
      "risk_score",
      "risk_categories",
      "direct_exposure",
      "indirect_exposure",
      "sanctions_exposure",
      "cluster_ref",
      "payload_hash",
      "source_authenticated",
      "issued_at_utc",
      "valid_until_utc",
      "created_at_utc",
      "updated_at_utc",
    ]);
    const tables = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1'`);
    expect(Number(tables.rows[0]?.n)).toBe(16);
  });

  it("D. vendor_result_inbox and inbound_source_screening_result are untouched by this migration", async () => {
    if (!schemaReady) return;
    const inboxCols = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'vendor_result_inbox'`);
    expect(Number(inboxCols.rows[0]?.n)).toBe(14);
    const inboundCols = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'inbound_source_screening_result'`);
    expect(Number(inboundCols.rows[0]?.n)).toBe(29);
  });

  it("E. all five original risk_status values remain accepted", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_mig065e_" + randomUUID();
    await insertDestination(destinationId);
    let version = 1;
    for (const riskStatus of ["pending", "clear", "review_required", "high_risk", "hit"]) {
      const id = await insertScreening(destinationId, { risk_status: riskStatus, screening_result_id: "wlt1screen_" + randomUUID(), screening_result_version: version++ });
      const row = await verifyPool.query(`SELECT risk_status FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [id]);
      expect(row.rows[0]?.risk_status).toBe(riskStatus);
    }
    await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("F. 'failed' is now accepted", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_mig065f_" + randomUUID();
    await insertDestination(destinationId);
    const id = await insertScreening(destinationId, { risk_status: "failed" });
    const row = await verifyPool.query(`SELECT risk_status FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [id]);
    expect(row.rows[0]?.risk_status).toBe("failed");
    await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("G. an unrecognised risk_status value is still rejected", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_mig065g_" + randomUUID();
    await insertDestination(destinationId);
    await expect(insertScreening(destinationId, { risk_status: "not_real" })).rejects.toThrow(/violates check constraint/);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("H. down with zero 'failed' rows succeeds cleanly back to head 064 — risk_status CHECK narrows back", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("064_wlt1_inbound_source_screening");
    const def = await riskStatusCheckDef();
    expect(def).not.toMatch(/failed/);
  }, 60_000);

  it("I. re-up restores the exact frozen widened CHECK", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("065_wlt1_screening_failed_status");
    const def = await riskStatusCheckDef();
    expect(def).toMatch(/failed/);
  }, 60_000);

  let evidenceDestinationId: string;
  let evidenceScreeningId: string;

  it("J. with a 'failed' row present, down is refused; head/CHECK/row are preserved", async () => {
    if (!schemaReady) return;
    evidenceDestinationId = "wlt1dest_mig065j_" + randomUUID();
    await insertDestination(evidenceDestinationId);
    evidenceScreeningId = await insertScreening(evidenceDestinationId, { risk_status: "failed" });

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /risk_status = 'failed'/,
    );

    expect(await migrationHead()).toBe("065_wlt1_screening_failed_status");
    const def = await riskStatusCheckDef();
    expect(def).toMatch(/failed/);
    const stillThere = await verifyPool.query(`SELECT screening_result_id FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [evidenceScreeningId]);
    expect(stillThere.rows).toEqual([{ screening_result_id: evidenceScreeningId }]);
  }, 60_000);

  it("K. controlled cleanup of the evidence fixture (privileged test setup, not a runtime UPDATE-to-non-failed grant)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [evidenceScreeningId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [evidenceDestinationId]);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result WHERE risk_status = 'failed'`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it("L. with no 'failed' rows remaining, down succeeds cleanly back to head 064", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("064_wlt1_inbound_source_screening");
    const def = await riskStatusCheckDef();
    expect(def).not.toMatch(/failed/);
  }, 60_000);

  it("M. final re-up restores head 065 for any test file running after this one in the same shared DB", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("065_wlt1_screening_failed_status");
  }, 60_000);
});
