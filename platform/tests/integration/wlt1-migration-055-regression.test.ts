/**
 * WLT-01 Phase 4A-1 — committed automated regression coverage for
 * `infra/migrations/055_wlt1_destination_activation.cjs`'s own up/down/re-up and
 * evidence-preserving down behaviour, from day one (mirrors migration 054's own established
 * pattern in `wlt1-migration-054-regression.test.ts`). Self-skips unless `TEST_DATABASE_URL` is
 * set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's
 * programmatic `runner()` API, dropped in `afterAll`. Migration 055 itself is never modified —
 * this file only drives the migration runner and independently verifies real database state via
 * direct SQL after every step.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only. Grant-boundary
 * behaviour is covered separately in `tests/integration/wlt1-db.test.ts`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");

/** Exactly 54 migration files precede `055_wlt1_destination_activation.cjs`. */
const MIGRATIONS_THROUGH_054 = 54;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig055_regr_it_${randomBytes(6).toString("hex")}`;

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

async function tableCount(): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1'`);
  return Number(r.rows[0]?.n);
}

async function destinationColumnNames(): Promise<string[]> {
  const r = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'destination' ORDER BY ordinal_position`);
  return r.rows.map((row) => row.column_name);
}

async function constraintDef(name: string): Promise<string | undefined> {
  const r = await verifyPool.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination'::regclass AND conname = $1`, [name]);
  return r.rows[0]?.def;
}

async function insertDestination(destinationId: string, status: string): Promise<void> {
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, $4)`, [
    destinationId,
    "clt1client_mig055regr",
    "hash_" + randomUUID(),
    status,
  ]);
}

describe("WLT-01 Phase 4A-1: migration 055 up/down/re-up + evidence-preserving down (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig055-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig055-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig055-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 54 migrations reaches head 054_wlt1_proof_of_control_tron_scheme; status CHECK still the four-state Phase 2C-B set", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_054, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("054_wlt1_proof_of_control_tron_scheme");
    expect(await tableCount()).toBe(7);
    const def = await constraintDef("chk_wlt1_destination_status");
    expect(def).toMatch(/pending_review/);
    expect(def).not.toMatch(/approved_pending_cooling/);
  }, 60_000);

  it("B. migrating up one more migration reaches head 055 — status CHECK now permits the full six-state set; exactly two new nullable columns added; table count unchanged", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("055_wlt1_destination_activation");
    expect(await tableCount()).toBe(7);

    const def = await constraintDef("chk_wlt1_destination_status");
    for (const status of ["draft", "pending_screening", "pending_review", "approved_pending_cooling", "active", "revoked"]) {
      expect(def).toMatch(new RegExp(status));
    }

    const cols = await destinationColumnNames();
    expect(cols).toContain("cooling_off_until_utc");
    expect(cols).toContain("whitelist_approval_ref");
  }, 60_000);

  it("C. all six status values are now insertable (each fixture cleaned up immediately after proving insertability)", async () => {
    if (!schemaReady) return;
    let n = 0;
    for (const status of ["draft", "pending_screening", "pending_review", "approved_pending_cooling", "active", "revoked"]) {
      const destinationId = `wlt1dest_055c${n++}_` + randomUUID();
      await expect(insertDestination(destinationId, status)).resolves.toBeUndefined();
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    }
  });

  it("D. a seventh, unrecognised status value is still rejected", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_055invalid_" + randomUUID();
    await expect(insertDestination(destinationId, "some_future_status")).rejects.toThrow(/violates check constraint/);
  });

  it("E. cooling_off_until_utc / whitelist_approval_ref are both nullable and settable independently", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_055cols_" + randomUUID();
    await insertDestination(destinationId, "approved_pending_cooling");
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await expect(
      verifyPool.query(`UPDATE wlt1.destination SET cooling_off_until_utc = $1, whitelist_approval_ref = $2 WHERE destination_id = $3`, [until, "iam2appr_055test", destinationId]),
    ).resolves.toBeDefined();
    const row = await verifyPool.query(`SELECT cooling_off_until_utc, whitelist_approval_ref FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    expect(row.rows[0].whitelist_approval_ref).toBe("iam2appr_055test");
    expect(row.rows[0].cooling_off_until_utc).not.toBeNull();
    // Cleanup: this fixture's status is approved_pending_cooling, which would otherwise cause the
    // later evidence-preserving-down tests (H/I/J/K) to see an unaccounted-for extra row.
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("F. the partial index idx_wlt1_destination_status_cooling exists, scoped to approved_pending_cooling", async () => {
    if (!schemaReady) return;
    const idx = await verifyPool.query(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'destination' AND indexname = 'idx_wlt1_destination_status_cooling'`);
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0].indexdef).toMatch(/approved_pending_cooling/);
  });

  it("G. existing rows from BEFORE migration 055 (created in step A's window, still 'pending_screening'/'pending_review' etc.) are completely unaffected", async () => {
    if (!schemaReady) return;
    // Every destination inserted in step C already proves post-055 inserts work; this test proves
    // no EXISTING row was rewritten by the ALTER TABLE itself.
    const destinationId = "wlt1dest_055preexisting_" + randomUUID();
    await insertDestination(destinationId, "pending_review");
    const row = await verifyPool.query(`SELECT status, cooling_off_until_utc, whitelist_approval_ref FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    expect(row.rows[0]).toMatchObject({ status: "pending_review", cooling_off_until_utc: null, whitelist_approval_ref: null });
  });

  let cooledDestinationId: string;
  let activeDestinationId: string;

  it("H. with an approved_pending_cooling row present, down is refused; head/table/row are preserved", async () => {
    if (!schemaReady) return;
    cooledDestinationId = "wlt1dest_055down_cooling_" + randomUUID();
    await insertDestination(cooledDestinationId, "approved_pending_cooling");

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /approved_pending_cooling/,
    );

    expect(await migrationHead()).toBe("055_wlt1_destination_activation");
    expect(await tableCount()).toBe(7);
    const stillThere = await verifyPool.query(`SELECT status FROM wlt1.destination WHERE destination_id = $1`, [cooledDestinationId]);
    expect(stillThere.rows).toEqual([{ status: "approved_pending_cooling" }]);
  }, 60_000);

  it("I. with an active row present (and the cooling row still present), down is ALSO refused", async () => {
    if (!schemaReady) return;
    activeDestinationId = "wlt1dest_055down_active_" + randomUUID();
    await insertDestination(activeDestinationId, "active");

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /approved_pending_cooling\/active/,
    );

    expect(await migrationHead()).toBe("055_wlt1_destination_activation");
  }, 60_000);

  it("J. controlled cleanup of the fixture rows (privileged test setup, not a runtime DELETE grant)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = ANY($1)`, [[cooledDestinationId, activeDestinationId]]);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE status IN ('approved_pending_cooling', 'active')`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it("K. with no approved_pending_cooling/active evidence remaining, down succeeds cleanly back to head 054 — CHECK narrowed back to the four-state set, both new columns dropped, index dropped", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("054_wlt1_proof_of_control_tron_scheme");
    expect(await tableCount()).toBe(7);
    const def = await constraintDef("chk_wlt1_destination_status");
    expect(def).toMatch(/pending_review/);
    expect(def).not.toMatch(/approved_pending_cooling/);

    const cols = await destinationColumnNames();
    expect(cols).not.toContain("cooling_off_until_utc");
    expect(cols).not.toContain("whitelist_approval_ref");

    const idx = await verifyPool.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'destination' AND indexname = 'idx_wlt1_destination_status_cooling'`);
    expect(idx.rows).toHaveLength(0);
  }, 60_000);

  it("L. re-up restores the exact Phase 4A-1 widened schema: head 055, all six statuses accepted again, both columns and the index back", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("055_wlt1_destination_activation");
    expect(await tableCount()).toBe(7);
    const def = await constraintDef("chk_wlt1_destination_status");
    for (const status of ["draft", "pending_screening", "pending_review", "approved_pending_cooling", "active", "revoked"]) {
      expect(def).toMatch(new RegExp(status));
    }
    const cols = await destinationColumnNames();
    expect(cols).toContain("cooling_off_until_utc");
    expect(cols).toContain("whitelist_approval_ref");
    const idx = await verifyPool.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'destination' AND indexname = 'idx_wlt1_destination_status_cooling'`);
    expect(idx.rows).toHaveLength(1);
  }, 60_000);
});
