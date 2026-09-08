/**
 * WLT-01 Phase 2C-B — committed automated regression coverage for
 * `infra/migrations/051_wlt1_screening_lifecycle.cjs`'s own up/down/re-up and evidence-preserving
 * down behaviour, from day one (per the migration-050 regression lesson — never repeat the Phase
 * 2B manual-only coverage gap). Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * Mirrors `tests/integration/wlt1-migration-050-regression.test.ts`'s own established pattern
 * exactly: a PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's
 * programmatic `runner()` API, dropped in `afterAll`. Migration 051 itself is never modified —
 * this file only drives the migration runner and independently verifies real database state via
 * direct SQL after every step.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");

/** Exactly 50 migration files precede `051_wlt1_screening_lifecycle.cjs`. */
const MIGRATIONS_THROUGH_050 = 50;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig051_regr_it_${randomBytes(6).toString("hex")}`;

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

async function destinationStatusConstraint(): Promise<{ conname: string; def: string } | undefined> {
  const r = await verifyPool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination'::regclass AND contype = 'c' AND conname LIKE '%status%'`,
  );
  return r.rows[0];
}

async function statusColumnMaxLength(): Promise<number | undefined> {
  const r = await verifyPool.query(
    `SELECT character_maximum_length AS len FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'destination' AND column_name = 'status'`,
  );
  return r.rows[0]?.len;
}

async function insertDestination(destinationId: string, status: string): Promise<void> {
  await verifyPool.query(
    `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, $4)`,
    [destinationId, "clt1client_mig051regr", "hash_" + randomUUID(), status],
  );
}

describe("WLT-01 Phase 2C-B: migration 051 up/down/re-up + evidence-preserving down (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig051-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig051-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig051-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 50 migrations reaches head 050_wlt1_screening with the accepted two-state CHECK", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_050, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("050_wlt1_screening");
    const constraint = await destinationStatusConstraint();
    expect(constraint?.conname).toBe("destination_status_check");
    expect(constraint?.def).toContain("draft");
    expect(constraint?.def).toContain("revoked");
    expect(constraint?.def).not.toContain("pending_screening");
    expect(await statusColumnMaxLength()).toBe(16);
  }, 60_000);

  it("B. migrating up one more migration reaches head 051 with the exact four-state CHECK under the explicit stable name, column widened", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("051_wlt1_screening_lifecycle");
    const constraint = await destinationStatusConstraint();
    expect(constraint?.conname).toBe("chk_wlt1_destination_status");
    expect(constraint?.def).toContain("draft");
    expect(constraint?.def).toContain("pending_screening");
    expect(constraint?.def).toContain("pending_review");
    expect(constraint?.def).toContain("revoked");
    expect(await statusColumnMaxLength()).toBe(32);

    // No unrelated schema drift.
    const tableCount = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1'`);
    expect(Number(tableCount.rows[0]?.n)).toBe(6);
  }, 60_000);

  it("actually accepts a pending_screening insert (proves the column-width fix, not merely the CHECK)", async () => {
    if (!schemaReady) return;
    const id = "wlt1dest_051w_" + randomUUID();
    await insertDestination(id, "pending_screening");
    const row = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [id]);
    expect(row.rows[0]?.status).toBe("pending_screening");
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [id]);
  }, 60_000);

  it("C+D. a destination in pending_screening independently blocks down; after clearing it, down is no longer blocked", async () => {
    if (!schemaReady) return;
    const id = "wlt1dest_mig051regr_ps_" + randomUUID();
    await insertDestination(id, "pending_screening");

    await expect(
      runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog }),
    ).rejects.toThrow(/pending_screening\/pending_review/);

    // Prove atomicity/state preservation with real queries, not merely that the promise threw.
    expect(await migrationHead()).toBe("051_wlt1_screening_lifecycle");
    const constraint = await destinationStatusConstraint();
    expect(constraint?.conname).toBe("chk_wlt1_destination_status");
    const stillThere = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [id]);
    expect(stillThere.rows).toEqual([{ status: "pending_screening" }]);

    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [id]);
    const cleared = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE status IN ('pending_screening','pending_review')`);
    expect(cleared.rows[0]?.n).toBe(0);
  }, 60_000);

  it("E+F. a destination in pending_review INDEPENDENTLY blocks down (proven separately from pending_screening); after clearing it, down is no longer blocked", async () => {
    if (!schemaReady) return;
    const id = "wlt1dest_mig051regr_pr_" + randomUUID();
    await insertDestination(id, "pending_review");

    const lifecycleRowsBefore = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE status IN ('pending_screening','pending_review')`);
    expect(lifecycleRowsBefore.rows[0]?.n).toBe(1);

    await expect(
      runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog }),
    ).rejects.toThrow(/pending_screening\/pending_review/);

    expect(await migrationHead()).toBe("051_wlt1_screening_lifecycle");
    const stillThere = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [id]);
    expect(stillThere.rows).toEqual([{ status: "pending_review" }]);

    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [id]);
    const cleared = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE status IN ('pending_screening','pending_review')`);
    expect(cleared.rows[0]?.n).toBe(0);
  }, 60_000);

  it("G. with no destination in pending_screening/pending_review, down succeeds cleanly back to head 050 with the exact prior CHECK/width restored", async () => {
    if (!schemaReady) return;
    const lifecycleRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE status IN ('pending_screening','pending_review')`);
    expect(lifecycleRows.rows[0]?.n).toBe(0);

    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("050_wlt1_screening");
    const constraint = await destinationStatusConstraint();
    expect(constraint?.conname).toBe("destination_status_check");
    expect(constraint?.def).toContain("draft");
    expect(constraint?.def).toContain("revoked");
    expect(constraint?.def).not.toContain("pending_screening");
    expect(constraint?.def).not.toContain("pending_review");
    expect(await statusColumnMaxLength()).toBe(16);
  }, 60_000);

  it("H. re-up restores the exact Phase 2C-B schema: head 051, explicit four-state CHECK, widened column", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("051_wlt1_screening_lifecycle");
    const constraint = await destinationStatusConstraint();
    expect(constraint?.conname).toBe("chk_wlt1_destination_status");
    expect(constraint?.def).toContain("draft");
    expect(constraint?.def).toContain("pending_screening");
    expect(constraint?.def).toContain("pending_review");
    expect(constraint?.def).toContain("revoked");
    expect(await statusColumnMaxLength()).toBe(32);

    const lifecycleRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE status IN ('pending_screening','pending_review')`);
    expect(lifecycleRows.rows[0]?.n).toBe(0);
  }, 60_000);
});
