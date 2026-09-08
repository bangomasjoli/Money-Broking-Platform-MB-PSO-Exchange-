/**
 * WLT-01 — committed automated regression coverage for
 * `infra/migrations/059_wlt1_destination_revocation.cjs`'s own up/down/re-up behaviour, from day
 * one (mirrors migration 058's own established pattern in
 * `wlt1-migration-058-regression.test.ts`). Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's programmatic
 * `runner()` API, dropped in `afterAll`. Migration 059 itself is never modified — this file only
 * drives the migration runner and independently verifies real database state via direct SQL after
 * every step.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only. Grant-boundary
 * behaviour (SELECT+INSERT, no UPDATE/DELETE/TRUNCATE) is covered separately in
 * `tests/integration/wlt1-db.test.ts`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");

/** Exactly 58 migration files precede `059_wlt1_destination_revocation.cjs`. */
const MIGRATIONS_THROUGH_058 = 58;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig059_regr_it_${randomBytes(6).toString("hex")}`;

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

async function tableExists(): Promise<boolean> {
  const r = await verifyPool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'destination_revocation'`);
  return r.rows.length === 1;
}

async function insertDestination(destinationId: string, status = "active"): Promise<void> {
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, $4)`, [
    destinationId,
    "clt1client_mig059regr",
    "hash_" + randomUUID(),
    status,
  ]);
}

function revocationFixture(overrides: Record<string, unknown> = {}) {
  return {
    revocation_id: "wlt1rev_" + randomUUID(),
    client_id: "clt1client_mig059regr",
    source: "operator",
    reason_code: "compromise",
    reason_detail: null,
    actor_id: "staff_mig059regr",
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
       (revocation_id, destination_id, client_id, source, reason_code, reason_detail, actor_id, signal_ref, signal_type,
        destination_status_version_after, revocation_epoch_after)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [f.revocation_id, destinationId, f.client_id, f.source, f.reason_code, f.reason_detail, f.actor_id, f.signal_ref, f.signal_type, f.destination_status_version_after, f.revocation_epoch_after],
  );
  return f.revocation_id as string;
}

describe("WLT-01 Destination Revocation: migration 059 up/down/re-up + evidence-preserving down + source-coherence CHECK (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig059-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig059-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig059-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 58 migrations reaches head 058; wlt1.destination_revocation does not exist yet", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_058, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("058_wlt1_destination_decision_consumption");
    expect(await tableExists()).toBe(false);
  }, 60_000);

  it("B. migrating up one more migration reaches head 059 — wlt1.destination_revocation exists with the frozen 15-column shape", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("059_wlt1_destination_revocation");
    expect(await tableExists()).toBe(true);

    const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'destination_revocation' ORDER BY ordinal_position`);
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      "id",
      "revocation_id",
      "destination_id",
      "client_id",
      "source",
      "reason_code",
      "reason_detail",
      "actor_id",
      "signal_ref",
      "signal_type",
      "destination_status_version_after",
      "revocation_epoch_after",
      "revoked_at_utc",
      "created_at_utc",
    ]);
  }, 60_000);

  it("C. an operator-sourced row (actor_id set, signal_ref/signal_type null) is insertable", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_059c_" + randomUUID();
    await insertDestination(destinationId);
    await expect(insertRevocation(destinationId, { source: "operator", actor_id: "staff_1", signal_ref: null, signal_type: null })).resolves.toBeDefined();
    await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("D. an aml-sourced row (actor_id null, signal_ref/signal_type set) is insertable", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_059d_" + randomUUID();
    await insertDestination(destinationId);
    await expect(
      insertRevocation(destinationId, { source: "aml", reason_code: "aml_risk_signal", actor_id: null, signal_ref: "aml1sig_" + randomUUID(), signal_type: "confirmed_hit" }),
    ).resolves.toBeDefined();
    await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("E. an unrecognised source value is rejected", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_059e_" + randomUUID();
    await insertDestination(destinationId);
    await expect(insertRevocation(destinationId, { source: "unknown_source" })).rejects.toThrow(/violates check constraint/);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("F. an unrecognised reason_code value is rejected", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_059f_" + randomUUID();
    await insertDestination(destinationId);
    await expect(insertRevocation(destinationId, { reason_code: "not_a_real_reason" })).rejects.toThrow(/violates check constraint/);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  describe("G. source-coherence CHECK", () => {
    it("G1. source='operator' with a signal_ref or signal_type set is rejected", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_059g1_" + randomUUID();
      await insertDestination(destinationId);
      await expect(insertRevocation(destinationId, { source: "operator", actor_id: "staff_1", signal_ref: "aml1sig_x" })).rejects.toThrow(/violates check constraint/);
      await expect(insertRevocation(destinationId, { source: "operator", actor_id: "staff_1", signal_type: "confirmed_hit" })).rejects.toThrow(/violates check constraint/);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });

    it("G2. source='operator' with actor_id NULL is rejected", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_059g2_" + randomUUID();
      await insertDestination(destinationId);
      await expect(insertRevocation(destinationId, { source: "operator", actor_id: null })).rejects.toThrow(/violates check constraint/);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });

    it("G3. source='aml' with actor_id set is rejected", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_059g3_" + randomUUID();
      await insertDestination(destinationId);
      await expect(
        insertRevocation(destinationId, { source: "aml", reason_code: "aml_risk_signal", actor_id: "staff_1", signal_ref: "aml1sig_x", signal_type: "confirmed_hit" }),
      ).rejects.toThrow(/violates check constraint/);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });

    it("G4. source='aml' with signal_ref or signal_type missing is rejected", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_059g4_" + randomUUID();
      await insertDestination(destinationId);
      await expect(insertRevocation(destinationId, { source: "aml", reason_code: "aml_risk_signal", actor_id: null, signal_ref: null, signal_type: "confirmed_hit" })).rejects.toThrow(
        /violates check constraint/,
      );
      await expect(insertRevocation(destinationId, { source: "aml", reason_code: "aml_risk_signal", actor_id: null, signal_ref: "aml1sig_x", signal_type: null })).rejects.toThrow(
        /violates check constraint/,
      );
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });
  });

  it("H. signal_ref uniqueness — a duplicate signal_ref across two different destinations is rejected", async () => {
    if (!schemaReady) return;
    const destinationId1 = "wlt1dest_059h1_" + randomUUID();
    const destinationId2 = "wlt1dest_059h2_" + randomUUID();
    await insertDestination(destinationId1);
    await insertDestination(destinationId2);
    const sharedSignalRef = "aml1sig_" + randomUUID();
    await insertRevocation(destinationId1, { source: "aml", reason_code: "aml_risk_signal", actor_id: null, signal_ref: sharedSignalRef, signal_type: "confirmed_hit" });
    await expect(
      insertRevocation(destinationId2, { source: "aml", reason_code: "aml_risk_signal", actor_id: null, signal_ref: sharedSignalRef, signal_type: "confirmed_hit" }),
    ).rejects.toThrow(/duplicate key value/);
    await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id = ANY($1)`, [[destinationId1, destinationId2]]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = ANY($1)`, [[destinationId1, destinationId2]]);
  });

  it("I. multiple rows with signal_ref = NULL (all operator-sourced) coexist without violating the partial unique index", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_059i_" + randomUUID();
    await insertDestination(destinationId);
    await insertRevocation(destinationId, { source: "operator", actor_id: "staff_1" });
    await expect(insertRevocation(destinationId, { source: "operator", actor_id: "staff_2", revocation_epoch_after: 2, destination_status_version_after: 2 })).resolves.toBeDefined();
    await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("J. destination_id foreign key rejects a revocation row against a non-existent destination", async () => {
    if (!schemaReady) return;
    await expect(insertRevocation("wlt1dest_059noexist_" + randomUUID(), { source: "operator", actor_id: "staff_1" })).rejects.toThrow(/violates foreign key constraint/);
  });

  let evidenceRevocationId: string;
  let evidenceDestinationId: string;

  it("K. with an evidence row present, down is refused; head/table/row are preserved", async () => {
    if (!schemaReady) return;
    evidenceDestinationId = "wlt1dest_059down_evidence_" + randomUUID();
    await insertDestination(evidenceDestinationId, "revoked");
    evidenceRevocationId = await insertRevocation(evidenceDestinationId, { source: "operator", actor_id: "staff_down_test" });

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /evidence rows/,
    );

    expect(await migrationHead()).toBe("059_wlt1_destination_revocation");
    expect(await tableExists()).toBe(true);
    const stillThere = await verifyPool.query(`SELECT revocation_id FROM wlt1.destination_revocation WHERE revocation_id = $1`, [evidenceRevocationId]);
    expect(stillThere.rows).toEqual([{ revocation_id: evidenceRevocationId }]);
  }, 60_000);

  it("L. controlled cleanup of the fixture row (privileged test setup, not a runtime DELETE grant)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.destination_revocation WHERE revocation_id = $1`, [evidenceRevocationId]);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_revocation`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it("M. with no evidence remaining, down succeeds cleanly back to head 058 — table dropped entirely", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("058_wlt1_destination_decision_consumption");
    expect(await tableExists()).toBe(false);
  }, 60_000);

  it("N. re-up restores the exact frozen schema: head 059, table back with all constraints/indexes", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("059_wlt1_destination_revocation");
    expect(await tableExists()).toBe(true);

    const coherence = await verifyPool.query(
      `SELECT 1 FROM pg_constraint WHERE conrelid = 'wlt1.destination_revocation'::regclass AND conname = 'chk_wlt1_destination_revocation_source_coherent'`,
    );
    expect(coherence.rows).toHaveLength(1);
    const signalIdx = await verifyPool.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'destination_revocation' AND indexname = 'idx_wlt1_destination_revocation_signal_ref'`);
    expect(signalIdx.rows).toHaveLength(1);
    const destIdx = await verifyPool.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'destination_revocation' AND indexname = 'idx_wlt1_destination_revocation_destination'`);
    expect(destIdx.rows).toHaveLength(1);
  }, 60_000);
});
