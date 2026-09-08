/**
 * WLT-01 — committed automated regression coverage for
 * `infra/migrations/060_wlt1_rescreening_run.cjs`'s own up/down/re-up behaviour, from day one
 * (mirrors migration 059's own established pattern in `wlt1-migration-059-regression.test.ts`).
 * Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's programmatic
 * `runner()` API, dropped in `afterAll`. Migration 060 itself is never modified — this file only
 * drives the migration runner and independently verifies real database state via direct SQL after
 * every step.
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

/** Exactly 59 migration files precede `060_wlt1_rescreening_run.cjs`. */
const MIGRATIONS_THROUGH_059 = 59;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig060_regr_it_${randomBytes(6).toString("hex")}`;

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

async function runTableExists(): Promise<boolean> {
  const r = await verifyPool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'rescreening_run'`);
  return r.rows.length === 1;
}

async function revocationSourceCheckDef(): Promise<string | undefined> {
  const r = await verifyPool.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination_revocation'::regclass AND conname = 'destination_revocation_source_check'`,
  );
  return r.rows[0]?.def;
}

async function insertDestination(destinationId: string, status = "active"): Promise<void> {
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, $4)`, [
    destinationId,
    "clt1client_mig060regr",
    "hash_" + randomUUID(),
    status,
  ]);
}

function runFixture(overrides: Record<string, unknown> = {}) {
  return {
    run_id: "wlt1rsr_" + randomUUID(),
    scope: "periodic_due",
    requested_by: "staff_mig060regr",
    target_destination_id: null,
    ...overrides,
  };
}

async function insertRun(overrides: Record<string, unknown> = {}): Promise<string> {
  const f = runFixture(overrides);
  await verifyPool.query(
    `INSERT INTO wlt1.rescreening_run (run_id, scope, requested_by, target_destination_id, status, completed_at_utc)
     VALUES ($1, $2, $3, $4, 'completed', now())`,
    [f.run_id, f.scope, f.requested_by, f.target_destination_id],
  );
  return f.run_id as string;
}

function revocationFixture(overrides: Record<string, unknown> = {}) {
  return {
    revocation_id: "wlt1rev_" + randomUUID(),
    client_id: "clt1client_mig060regr",
    source: "operator",
    reason_code: "compromise",
    actor_id: "staff_mig060regr",
    signal_ref: null,
    signal_type: null,
    destination_status_version_after: 1,
    revocation_epoch_after: 1,
    ...overrides,
  };
}

async function insertRevocation(destinationId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const f = revocationFixture(overrides);
  await verifyPool.query(
    `INSERT INTO wlt1.destination_revocation
       (revocation_id, destination_id, client_id, source, reason_code, actor_id, signal_ref, signal_type,
        destination_status_version_after, revocation_epoch_after)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [f.revocation_id, destinationId, f.client_id, f.source, f.reason_code, f.actor_id, f.signal_ref, f.signal_type, f.destination_status_version_after, f.revocation_epoch_after],
  );
  return f.revocation_id as string;
}

describe("WLT-01 Ongoing Rescreening: migration 060 up/down/re-up + dual evidence-preserving down + revocation-CHECK widening (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig060-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig060-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig060-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 59 migrations reaches head 059; wlt1.rescreening_run does not exist yet; revocation source CHECK is still operator/aml-only", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_059, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("059_wlt1_destination_revocation");
    expect(await runTableExists()).toBe(false);
    const def = await revocationSourceCheckDef();
    expect(def).not.toMatch(/rescreening/);
  }, 60_000);

  it("B. migrating up one more migration reaches head 060 — wlt1.rescreening_run exists with the frozen 14-column shape; revocation CHECKs widened", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("060_wlt1_rescreening_run");
    expect(await runTableExists()).toBe(true);

    const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'rescreening_run' ORDER BY ordinal_position`);
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      "id",
      "run_id",
      "scope",
      "status",
      "requested_by",
      "target_destination_id",
      "candidates_selected",
      "rescreened_clear",
      "rescreened_adverse",
      "revocations_triggered",
      "skipped",
      "failures",
      "request_id",
      "correlation_id",
      "started_at_utc",
      "completed_at_utc",
    ]);

    const def = await revocationSourceCheckDef();
    expect(def).toMatch(/rescreening/);
  }, 60_000);

  it("C. a periodic_due run row (no target) is insertable; a destination-scope run row (with target) is insertable", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_060c_" + randomUUID();
    await insertDestination(destinationId);
    await expect(insertRun({ scope: "periodic_due", target_destination_id: null })).resolves.toBeDefined();
    await expect(insertRun({ scope: "destination", target_destination_id: destinationId })).resolves.toBeDefined();
    await verifyPool.query(`DELETE FROM wlt1.rescreening_run WHERE requested_by = 'staff_mig060regr'`);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("D. an unrecognised scope value is rejected", async () => {
    if (!schemaReady) return;
    await expect(insertRun({ scope: "not_a_real_scope" })).rejects.toThrow(/violates check constraint/);
  });

  it("E. an unrecognised status value is rejected", async () => {
    if (!schemaReady) return;
    const runId = "wlt1rsr_" + randomUUID();
    await expect(
      verifyPool.query(`INSERT INTO wlt1.rescreening_run (run_id, scope, requested_by, status, completed_at_utc) VALUES ($1, 'periodic_due', 'staff_mig060regr', 'bogus_status', now())`, [runId]),
    ).rejects.toThrow(/violates check constraint/);
  });

  describe("F. scope-coherence CHECK", () => {
    it("F1. scope='destination' with target_destination_id NULL is rejected", async () => {
      if (!schemaReady) return;
      const runId = "wlt1rsr_" + randomUUID();
      await expect(
        verifyPool.query(`INSERT INTO wlt1.rescreening_run (run_id, scope, requested_by, target_destination_id) VALUES ($1, 'destination', 'staff_mig060regr', NULL)`, [runId]),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("F2. scope='periodic_due' with target_destination_id set is rejected", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_060f2_" + randomUUID();
      await insertDestination(destinationId);
      const runId = "wlt1rsr_" + randomUUID();
      await expect(
        verifyPool.query(`INSERT INTO wlt1.rescreening_run (run_id, scope, requested_by, target_destination_id) VALUES ($1, 'periodic_due', 'staff_mig060regr', $2)`, [runId, destinationId]),
      ).rejects.toThrow(/violates check constraint/);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });
  });

  describe("G. terminal-coherence CHECK", () => {
    it("G1. status='running' (default) with completed_at_utc set is rejected", async () => {
      if (!schemaReady) return;
      const runId = "wlt1rsr_" + randomUUID();
      await expect(
        verifyPool.query(`INSERT INTO wlt1.rescreening_run (run_id, scope, requested_by, completed_at_utc) VALUES ($1, 'periodic_due', 'staff_mig060regr', now())`, [runId]),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("G2. status='completed' with completed_at_utc NULL is rejected", async () => {
      if (!schemaReady) return;
      const runId = "wlt1rsr_" + randomUUID();
      await expect(
        verifyPool.query(`INSERT INTO wlt1.rescreening_run (run_id, scope, requested_by, status, completed_at_utc) VALUES ($1, 'periodic_due', 'staff_mig060regr', 'completed', NULL)`, [runId]),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("G3. status='running' with completed_at_utc NULL (the default) is accepted", async () => {
      if (!schemaReady) return;
      const runId = "wlt1rsr_" + randomUUID();
      await expect(verifyPool.query(`INSERT INTO wlt1.rescreening_run (run_id, scope, requested_by) VALUES ($1, 'periodic_due', 'staff_mig060regr')`, [runId])).resolves.toBeDefined();
      await verifyPool.query(`DELETE FROM wlt1.rescreening_run WHERE run_id = $1`, [runId]);
    });
  });

  it("H. run_id uniqueness — a duplicate run_id is rejected", async () => {
    if (!schemaReady) return;
    const runId = "wlt1rsr_" + randomUUID();
    await insertRun({ run_id: runId });
    await expect(insertRun({ run_id: runId })).rejects.toThrow(/duplicate key value/);
    await verifyPool.query(`DELETE FROM wlt1.rescreening_run WHERE run_id = $1`, [runId]);
  });

  it("I. target_destination_id foreign key rejects a destination-scope row against a non-existent destination", async () => {
    if (!schemaReady) return;
    const runId = "wlt1rsr_" + randomUUID();
    await expect(
      verifyPool.query(`INSERT INTO wlt1.rescreening_run (run_id, scope, requested_by, target_destination_id) VALUES ($1, 'destination', 'staff_mig060regr', $2)`, [
        runId,
        "wlt1dest_060noexist_" + randomUUID(),
      ]),
    ).rejects.toThrow(/violates foreign key constraint/);
  });

  describe("J. revocation source='rescreening' coherence", () => {
    it("J1. source='rescreening' with actor_id NULL, signal_ref set, signal_type NULL is accepted", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_060j1_" + randomUUID();
      await insertDestination(destinationId);
      await expect(
        insertRevocation(destinationId, { source: "rescreening", reason_code: "rescreen_adverse", actor_id: null, signal_ref: "wlt1screen_" + randomUUID(), signal_type: null }),
      ).resolves.toBeDefined();
      await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id = $1`, [destinationId]);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });

    it("J2. source='rescreening' with actor_id set is rejected", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_060j2_" + randomUUID();
      await insertDestination(destinationId);
      await expect(
        insertRevocation(destinationId, { source: "rescreening", reason_code: "rescreen_adverse", actor_id: "staff_1", signal_ref: "wlt1screen_" + randomUUID(), signal_type: null }),
      ).rejects.toThrow(/violates check constraint/);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });

    it("J3. source='rescreening' with signal_ref NULL is rejected", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_060j3_" + randomUUID();
      await insertDestination(destinationId);
      await expect(insertRevocation(destinationId, { source: "rescreening", reason_code: "rescreen_adverse", actor_id: null, signal_ref: null, signal_type: null })).rejects.toThrow(
        /violates check constraint/,
      );
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });

    it("J4. source='rescreening' with signal_type set (non-null) is rejected", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_060j4_" + randomUUID();
      await insertDestination(destinationId);
      await expect(
        insertRevocation(destinationId, { source: "rescreening", reason_code: "rescreen_adverse", actor_id: null, signal_ref: "wlt1screen_" + randomUUID(), signal_type: "confirmed_hit" }),
      ).rejects.toThrow(/violates check constraint/);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });

    it("J5. source='rescreening' with a non-rescreen_adverse reason_code (e.g. 'compromise') is rejected by the reason_code CHECK-vs-application-discipline boundary is NOT enforced at the DB layer — the coherence CHECK couples source only to actor_id/signal_ref/signal_type, never to reason_code; document this precisely rather than assert a coupling the schema does not have", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_060j5_" + randomUUID();
      await insertDestination(destinationId);
      // reason_code='compromise' is one of the pre-existing operator reasons, valid under the
      // (unchanged) reason_code CHECK regardless of source — but source='rescreening' still
      // requires the coherence CHECK's own actor_id/signal_ref/signal_type shape, which THIS row
      // satisfies (actor_id NULL, signal_ref set, signal_type NULL). The row is therefore
      // accepted — reason_code and source are deliberately NOT cross-validated against each
      // other by any CHECK; only application code (lib/rescreening.ts) ever pairs
      // source='rescreening' with reason_code='rescreen_adverse' in practice.
      const revocationId = await insertRevocation(destinationId, { source: "rescreening", reason_code: "compromise", actor_id: null, signal_ref: "wlt1screen_" + randomUUID(), signal_type: null });
      expect(revocationId).toBeDefined();
      await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id = $1`, [destinationId]);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });

    it("J6. existing operator/aml branches remain valid and unchanged after the widening", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_060j6_" + randomUUID();
      await insertDestination(destinationId);
      await expect(insertRevocation(destinationId, { source: "operator", reason_code: "compromise", actor_id: "staff_1", signal_ref: null, signal_type: null })).resolves.toBeDefined();
      await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id = $1`, [destinationId]);
      await expect(
        insertRevocation(destinationId, { source: "aml", reason_code: "aml_risk_signal", actor_id: null, signal_ref: "aml1sig_" + randomUUID(), signal_type: "confirmed_hit" }),
      ).resolves.toBeDefined();
      await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id = $1`, [destinationId]);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });
  });

  let evidenceRunId: string;

  it("K. with a rescreening_run row present, down is refused; head/table/row are preserved", async () => {
    if (!schemaReady) return;
    evidenceRunId = await insertRun();

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /rescreening_run contains rows/,
    );

    expect(await migrationHead()).toBe("060_wlt1_rescreening_run");
    expect(await runTableExists()).toBe(true);
    const stillThere = await verifyPool.query(`SELECT run_id FROM wlt1.rescreening_run WHERE run_id = $1`, [evidenceRunId]);
    expect(stillThere.rows).toEqual([{ run_id: evidenceRunId }]);
  }, 60_000);

  it("L. controlled cleanup of the run fixture (privileged test setup, not a runtime DELETE grant)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.rescreening_run WHERE run_id = $1`, [evidenceRunId]);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.rescreening_run`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  let rescreeningRevocationDestinationId: string;
  let rescreeningRevocationId: string;

  it("M. with the run table empty but a source='rescreening' revocation row present, down is STILL refused", async () => {
    if (!schemaReady) return;
    rescreeningRevocationDestinationId = "wlt1dest_060down_rescreen_" + randomUUID();
    await insertDestination(rescreeningRevocationDestinationId, "revoked");
    rescreeningRevocationId = await insertRevocation(rescreeningRevocationDestinationId, {
      source: "rescreening",
      reason_code: "rescreen_adverse",
      actor_id: null,
      signal_ref: "wlt1screen_" + randomUUID(),
      signal_type: null,
    });

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /source='rescreening'/,
    );

    expect(await migrationHead()).toBe("060_wlt1_rescreening_run");
    const stillThere = await verifyPool.query(`SELECT revocation_id FROM wlt1.destination_revocation WHERE revocation_id = $1`, [rescreeningRevocationId]);
    expect(stillThere.rows).toEqual([{ revocation_id: rescreeningRevocationId }]);
  }, 60_000);

  it("N. controlled cleanup of the rescreening-revocation fixture", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE revocation_id = $1`, [rescreeningRevocationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [rescreeningRevocationDestinationId]);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_revocation WHERE source = 'rescreening'`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it("O. with no evidence remaining anywhere, down succeeds cleanly back to head 059 — rescreening_run table dropped; revocation CHECKs narrowed back", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("059_wlt1_destination_revocation");
    expect(await runTableExists()).toBe(false);
    const def = await revocationSourceCheckDef();
    expect(def).not.toMatch(/rescreening/);
  }, 60_000);

  it("P. re-up restores the exact frozen schema: head 060, table back, revocation CHECKs widened again", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("060_wlt1_rescreening_run");
    expect(await runTableExists()).toBe(true);
    const def = await revocationSourceCheckDef();
    expect(def).toMatch(/rescreening/);

    const scopeCheck = await verifyPool.query(
      `SELECT 1 FROM pg_constraint WHERE conrelid = 'wlt1.rescreening_run'::regclass AND conname = 'chk_wlt1_rescreening_run_scope_coherent'`,
    );
    expect(scopeCheck.rows).toHaveLength(1);
    const idx = await verifyPool.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'rescreening_run' AND indexname = 'idx_wlt1_rescreening_run_status_started'`);
    expect(idx.rows).toHaveLength(1);
  }, 60_000);
});
