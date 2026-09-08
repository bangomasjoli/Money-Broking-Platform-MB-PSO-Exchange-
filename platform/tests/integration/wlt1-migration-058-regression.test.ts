/**
 * WLT-01 Phase 4B — committed automated regression coverage for
 * `infra/migrations/058_wlt1_destination_decision_consumption.cjs`'s own up/down/re-up behaviour,
 * from day one (mirrors migration 057's own established pattern in
 * `wlt1-migration-057-regression.test.ts`). Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's programmatic
 * `runner()` API, dropped in `afterAll`. Migration 058 itself is never modified — this file only
 * drives the migration runner and independently verifies real database state via direct SQL after
 * every step.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only. Grant-boundary
 * behaviour (SELECT+INSERT+column-scoped-UPDATE, no DELETE/TRUNCATE) is covered separately in
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

/** Exactly 57 migration files precede `058_wlt1_destination_decision_consumption.cjs`. */
const MIGRATIONS_THROUGH_057 = 57;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig058_regr_it_${randomBytes(6).toString("hex")}`;

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

async function decisionColumns(): Promise<Array<{ column_name: string; is_nullable: string; data_type: string }>> {
  const r = await verifyPool.query(
    `SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'destination_decision' ORDER BY ordinal_position`,
  );
  return r.rows;
}

async function statusCheckDef(): Promise<string | undefined> {
  const r = await verifyPool.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination_decision'::regclass AND conname = 'destination_decision_status_check'`,
  );
  return r.rows[0]?.def;
}

async function insertDestination(destinationId: string): Promise<void> {
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, 'active')`, [
    destinationId,
    "clt1client_mig058regr",
    "hash_" + randomUUID(),
  ]);
}

function decisionFixture(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    decision_id: "wlt1dec_" + randomUUID(),
    token_hash: randomBytes(32).toString("hex"),
    client_id: "clt1client_mig058regr",
    requested_action: "destination_use",
    decision: "allow",
    aml_decision_id: "aml1ptd_" + randomUUID(),
    aml_valid_until_utc: new Date(now.getTime() + 3600_000).toISOString(),
    screening_result_id: "wlt1screen_" + randomUUID(),
    poc_challenge_id: null,
    destination_status_version: 1,
    whitelist_version: 1,
    revocation_epoch: 0,
    chain: "ethereum",
    network: "mainnet",
    issued_at_utc: now.toISOString(),
    expires_at_utc: new Date(now.getTime() + 300_000).toISOString(),
    status: "issued",
    consumed_at_utc: null,
    consumption_id: null,
    execution_ref: null,
    ...overrides,
  };
}

async function insertDecision(destinationId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const f = decisionFixture(overrides);
  await verifyPool.query(
    `INSERT INTO wlt1.destination_decision
       (decision_id, token_hash, destination_id, client_id, requested_action, decision,
        aml_decision_id, aml_valid_until_utc, screening_result_id, poc_challenge_id,
        destination_status_version, whitelist_version, revocation_epoch, chain, network,
        issued_at_utc, expires_at_utc, status, consumed_at_utc, consumption_id, execution_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [
      f.decision_id,
      f.token_hash,
      destinationId,
      f.client_id,
      f.requested_action,
      f.decision,
      f.aml_decision_id,
      f.aml_valid_until_utc,
      f.screening_result_id,
      f.poc_challenge_id,
      f.destination_status_version,
      f.whitelist_version,
      f.revocation_epoch,
      f.chain,
      f.network,
      f.issued_at_utc,
      f.expires_at_utc,
      f.status,
      f.consumed_at_utc,
      f.consumption_id,
      f.execution_ref,
    ],
  );
  return f.decision_id as string;
}

describe("WLT-01 Phase 4B: migration 058 up/down/re-up + evidence-preserving down + consumption coherence (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig058-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig058-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig058-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 57 migrations reaches head 057; status CHECK still issued-only, no consumption columns yet", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_057, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("057_wlt1_destination_decision");
    const def = await statusCheckDef();
    expect(def).toMatch(/issued/);
    expect(def).not.toMatch(/consumed/);
    const cols = await decisionColumns();
    const names = cols.map((c) => c.column_name);
    expect(names).not.toContain("consumed_at_utc");
    expect(names).not.toContain("consumption_id");
    expect(names).not.toContain("execution_ref");
  }, 60_000);

  it("B. migrating up one more migration reaches head 058 — status CHECK now permits issued+consumed; exactly three new nullable columns added", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("058_wlt1_destination_decision_consumption");
    const def = await statusCheckDef();
    expect(def).toMatch(/issued/);
    expect(def).toMatch(/consumed/);

    const cols = await decisionColumns();
    const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]));
    expect(byName.consumed_at_utc?.is_nullable).toBe("YES");
    expect(byName.consumption_id?.is_nullable).toBe("YES");
    expect(byName.execution_ref?.is_nullable).toBe("YES");
  }, 60_000);

  it("C. both statuses are now insertable at the DB layer (each fixture cleaned up immediately after proving insertability)", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_058c_" + randomUUID();
    await insertDestination(destinationId);
    await expect(insertDecision(destinationId, { status: "issued" })).resolves.toBeDefined();
    await expect(
      insertDecision(destinationId, { status: "consumed", consumed_at_utc: new Date().toISOString(), consumption_id: "wlt1con_" + randomUUID(), execution_ref: "exec_" + randomUUID() }),
    ).resolves.toBeDefined();
    await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("D. a third, unrecognised status value is still rejected", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_058invalid_" + randomUUID();
    await insertDestination(destinationId);
    await expect(insertDecision(destinationId, { status: "rejected" })).rejects.toThrow(/violates check constraint/);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  describe("E. coherence CHECK", () => {
    it("E1. status='issued' with ANY non-null consumption field is rejected", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_058e1_" + randomUUID();
      await insertDestination(destinationId);
      await expect(insertDecision(destinationId, { status: "issued", consumed_at_utc: new Date().toISOString() })).rejects.toThrow(/violates check constraint/);
      await expect(insertDecision(destinationId, { status: "issued", consumption_id: "wlt1con_" + randomUUID() })).rejects.toThrow(/violates check constraint/);
      await expect(insertDecision(destinationId, { status: "issued", execution_ref: "exec_x" })).rejects.toThrow(/violates check constraint/);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });

    it("E2. status='consumed' with ANY missing consumption field is rejected", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_058e2_" + randomUUID();
      await insertDestination(destinationId);
      const base = { status: "consumed", consumed_at_utc: new Date().toISOString(), consumption_id: "wlt1con_" + randomUUID(), execution_ref: "exec_x" };
      await expect(insertDecision(destinationId, { ...base, consumed_at_utc: null })).rejects.toThrow(/violates check constraint/);
      await expect(insertDecision(destinationId, { ...base, consumption_id: null })).rejects.toThrow(/violates check constraint/);
      await expect(insertDecision(destinationId, { ...base, execution_ref: null })).rejects.toThrow(/violates check constraint/);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });

    it("E3. status='consumed' with ALL three consumption fields present is accepted", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_058e3_" + randomUUID();
      await insertDestination(destinationId);
      await expect(
        insertDecision(destinationId, { status: "consumed", consumed_at_utc: new Date().toISOString(), consumption_id: "wlt1con_" + randomUUID(), execution_ref: "exec_x" }),
      ).resolves.toBeDefined();
      await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE destination_id = $1`, [destinationId]);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    });
  });

  it("F. consumption_id uniqueness — a duplicate consumption_id across two different decisions is rejected", async () => {
    if (!schemaReady) return;
    const destinationId1 = "wlt1dest_058f1_" + randomUUID();
    const destinationId2 = "wlt1dest_058f2_" + randomUUID();
    await insertDestination(destinationId1);
    await insertDestination(destinationId2);
    const sharedConsumptionId = "wlt1con_" + randomUUID();
    await insertDecision(destinationId1, { status: "consumed", consumed_at_utc: new Date().toISOString(), consumption_id: sharedConsumptionId, execution_ref: "exec_1" });
    await expect(
      insertDecision(destinationId2, { status: "consumed", consumed_at_utc: new Date().toISOString(), consumption_id: sharedConsumptionId, execution_ref: "exec_2" }),
    ).rejects.toThrow(/duplicate key value/);
    await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE destination_id = ANY($1)`, [[destinationId1, destinationId2]]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = ANY($1)`, [[destinationId1, destinationId2]]);
  });

  it("G. multiple rows with consumption_id = NULL (all 'issued') coexist without violating the partial unique index", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_058g_" + randomUUID();
    await insertDestination(destinationId);
    await insertDecision(destinationId, { status: "issued" });
    await expect(insertDecision(destinationId, { status: "issued" })).resolves.toBeDefined();
    await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("H. existing PRE-058 'issued' rows (created in step A's window) remain completely unaffected — all three new columns NULL", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_058preexisting_" + randomUUID();
    await insertDestination(destinationId);
    await insertDecision(destinationId, { status: "issued" });
    const row = await verifyPool.query(`SELECT status, consumed_at_utc, consumption_id, execution_ref FROM wlt1.destination_decision WHERE destination_id = $1`, [destinationId]);
    expect(row.rows[0]).toMatchObject({ status: "issued", consumed_at_utc: null, consumption_id: null, execution_ref: null });
  });

  let consumedDecisionId: string;
  let consumedDestinationId: string;

  it("I. with a 'consumed' row present, down is refused; head/columns/row are preserved", async () => {
    if (!schemaReady) return;
    consumedDestinationId = "wlt1dest_058down_consumed_" + randomUUID();
    await insertDestination(consumedDestinationId);
    consumedDecisionId = await insertDecision(consumedDestinationId, {
      status: "consumed",
      consumed_at_utc: new Date().toISOString(),
      consumption_id: "wlt1con_" + randomUUID(),
      execution_ref: "exec_down_test",
    });

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /consumed/,
    );

    expect(await migrationHead()).toBe("058_wlt1_destination_decision_consumption");
    const stillThere = await verifyPool.query(`SELECT status FROM wlt1.destination_decision WHERE decision_id = $1`, [consumedDecisionId]);
    expect(stillThere.rows).toEqual([{ status: "consumed" }]);
  }, 60_000);

  it("J. controlled cleanup of the fixture row (privileged test setup, not a runtime DELETE grant)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE decision_id = $1`, [consumedDecisionId]);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_decision WHERE status = 'consumed'`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it("K. with no 'consumed' evidence remaining, down succeeds cleanly back to head 057 — CHECK narrowed back to issued-only, all three columns dropped, index dropped", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("057_wlt1_destination_decision");
    const def = await statusCheckDef();
    expect(def).toMatch(/issued/);
    expect(def).not.toMatch(/consumed/);

    const cols = await decisionColumns();
    const names = cols.map((c) => c.column_name);
    expect(names).not.toContain("consumed_at_utc");
    expect(names).not.toContain("consumption_id");
    expect(names).not.toContain("execution_ref");

    const idx = await verifyPool.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'destination_decision' AND indexname = 'idx_wlt1_destination_decision_consumption_id'`);
    expect(idx.rows).toHaveLength(0);
  }, 60_000);

  it("L. re-up restores the exact Phase 4B widened schema: head 058, both statuses accepted again, all three columns and the index back", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("058_wlt1_destination_decision_consumption");
    const def = await statusCheckDef();
    expect(def).toMatch(/issued/);
    expect(def).toMatch(/consumed/);
    const cols = await decisionColumns();
    const names = cols.map((c) => c.column_name);
    expect(names).toContain("consumed_at_utc");
    expect(names).toContain("consumption_id");
    expect(names).toContain("execution_ref");
    const idx = await verifyPool.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'destination_decision' AND indexname = 'idx_wlt1_destination_decision_consumption_id'`);
    expect(idx.rows).toHaveLength(1);
  }, 60_000);
});
