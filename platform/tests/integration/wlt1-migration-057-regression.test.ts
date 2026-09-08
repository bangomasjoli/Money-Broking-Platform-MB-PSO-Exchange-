/**
 * WLT-01 Phase 4A-2 — committed automated regression coverage for
 * `infra/migrations/057_wlt1_destination_decision.cjs`'s own up/down/re-up behaviour, from day
 * one (mirrors migration 055's own established pattern in
 * `wlt1-migration-055-regression.test.ts`). Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's programmatic
 * `runner()` API, dropped in `afterAll`. Migration 057 itself is never modified — this file only
 * drives the migration runner and independently verifies real database state via direct SQL after
 * every step.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only. Grant-boundary
 * behaviour (SELECT+INSERT only, no UPDATE/DELETE) is covered separately in
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

/** Exactly 56 migration files precede `057_wlt1_destination_decision.cjs`. */
const MIGRATIONS_THROUGH_056 = 56;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig057_regr_it_${randomBytes(6).toString("hex")}`;

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

async function decisionColumns(): Promise<Array<{ column_name: string; is_nullable: string; data_type: string }>> {
  const r = await verifyPool.query(
    `SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'destination_decision' ORDER BY ordinal_position`,
  );
  return r.rows;
}

async function insertDestination(destinationId: string): Promise<void> {
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, 'active')`, [
    destinationId,
    "clt1client_mig057regr",
    "hash_" + randomUUID(),
  ]);
}

function decisionFixture(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    decision_id: "wlt1dec_" + randomUUID(),
    token_hash: randomBytes(32).toString("hex"),
    client_id: "clt1client_mig057regr",
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
    ...overrides,
  };
}

async function insertDecision(destinationId: string, overrides: Record<string, unknown> = {}): Promise<void> {
  const f = decisionFixture(overrides);
  await verifyPool.query(
    `INSERT INTO wlt1.destination_decision
       (decision_id, token_hash, destination_id, client_id, requested_action, decision,
        aml_decision_id, aml_valid_until_utc, screening_result_id, poc_challenge_id,
        destination_status_version, whitelist_version, revocation_epoch, chain, network,
        issued_at_utc, expires_at_utc)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
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
    ],
  );
}

describe("WLT-01 Phase 4A-2: migration 057 up/down/re-up + nullable poc_challenge_id (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig057-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig057-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig057-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 56 migrations reaches head 056; no destination_decision table yet", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_056, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("056_iam2_register_wlt1_destination_permissions");
    expect(await tableCount()).toBe(7);
    const exists = await verifyPool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'destination_decision'`);
    expect(exists.rows).toHaveLength(0);
  }, 60_000);

  it("B. migrating up one more migration reaches head 057 — wlt1.destination_decision now exists; table count 7 -> 8", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("057_wlt1_destination_decision");
    expect(await tableCount()).toBe(8);
  }, 60_000);

  it("C. poc_challenge_id is nullable (the PoC Evidence-ID Addendum); every other identity/evidence column is NOT NULL", async () => {
    if (!schemaReady) return;
    const cols = await decisionColumns();
    const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]));
    expect(byName.poc_challenge_id?.is_nullable).toBe("YES");
    for (const name of [
      "decision_id",
      "token_hash",
      "destination_id",
      "client_id",
      "requested_action",
      "decision",
      "status",
      "aml_decision_id",
      "aml_valid_until_utc",
      "screening_result_id",
      "destination_status_version",
      "whitelist_version",
      "revocation_epoch",
      "chain",
      "network",
      "issued_at_utc",
      "expires_at_utc",
      "created_at_utc",
    ]) {
      expect(byName[name]?.is_nullable, name).toBe("NO");
    }
  });

  it("D. NO consumed_at_utc / execution_ref column exists (Phase 4B-only, deliberately absent this phase)", async () => {
    if (!schemaReady) return;
    const cols = await decisionColumns();
    const names = cols.map((c) => c.column_name);
    expect(names).not.toContain("consumed_at_utc");
    expect(names).not.toContain("execution_ref");
  });

  it("E. requested_action/decision/status CHECKs are single-valued as frozen", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_057check_" + randomUUID();
    await insertDestination(destinationId);
    await expect(insertDecision(destinationId, { requested_action: "something_else" })).rejects.toThrow(/violates check constraint/);
    await expect(insertDecision(destinationId, { decision: "deny" })).rejects.toThrow(/violates check constraint/);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("F. expires_at_utc must be strictly after issued_at_utc (chk_wlt1_destination_decision_expiry)", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_057expiry_" + randomUUID();
    await insertDestination(destinationId);
    const now = new Date();
    await expect(insertDecision(destinationId, { issued_at_utc: now.toISOString(), expires_at_utc: now.toISOString() })).rejects.toThrow(/violates check constraint/);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("G. a row with poc_challenge_id NULL inserts successfully (hosted-wallet, PoC not applicable)", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_057nullpoc_" + randomUUID();
    await insertDestination(destinationId);
    await expect(insertDecision(destinationId, { poc_challenge_id: null })).resolves.toBeUndefined();
    const row = await verifyPool.query(`SELECT poc_challenge_id FROM wlt1.destination_decision WHERE destination_id = $1`, [destinationId]);
    expect(row.rows[0].poc_challenge_id).toBeNull();
  });

  it("H. a row with a genuine non-null poc_challenge_id also inserts successfully (unhosted/unknown-wallet, PoC applicable)", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_057withpoc_" + randomUUID();
    await insertDestination(destinationId);
    await expect(insertDecision(destinationId, { poc_challenge_id: "wlt1poc_" + randomUUID() })).resolves.toBeUndefined();
    const row = await verifyPool.query(`SELECT poc_challenge_id FROM wlt1.destination_decision WHERE destination_id = $1`, [destinationId]);
    expect(row.rows[0].poc_challenge_id).not.toBeNull();
  });

  it("I. decision_id and token_hash are each unique", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_057uniq_" + randomUUID();
    await insertDestination(destinationId);
    const sharedDecisionId = "wlt1dec_" + randomUUID();
    await insertDecision(destinationId, { decision_id: sharedDecisionId });
    await expect(insertDecision(destinationId, { decision_id: sharedDecisionId })).rejects.toThrow(/duplicate key value/);

    const sharedTokenHash = randomBytes(32).toString("hex");
    await insertDecision(destinationId, { token_hash: sharedTokenHash });
    await expect(insertDecision(destinationId, { token_hash: sharedTokenHash })).rejects.toThrow(/duplicate key value/);
  });

  it("J. destination_id has a FK to wlt1.destination — an unknown destination_id is rejected", async () => {
    if (!schemaReady) return;
    await expect(insertDecision("wlt1dest_057doesnotexist_" + randomUUID())).rejects.toThrow(/violates foreign key constraint/);
  });

  it("K. the covering index idx_wlt1_destination_decision_destination_issued exists", async () => {
    if (!schemaReady) return;
    const idx = await verifyPool.query(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'destination_decision' AND indexname = 'idx_wlt1_destination_decision_destination_issued'`);
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0].indexdef).toMatch(/destination_id/);
    expect(idx.rows[0].indexdef).toMatch(/issued_at_utc/);
  });

  it("L. down drops wlt1.destination_decision unconditionally (no evidence-preserving refusal — this table has no cross-phase evidence yet)", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("056_iam2_register_wlt1_destination_permissions");
    expect(await tableCount()).toBe(7);
    const exists = await verifyPool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'destination_decision'`);
    expect(exists.rows).toHaveLength(0);
  }, 60_000);

  it("M. re-up restores the exact Phase 4A-2 schema: head 057, table present, poc_challenge_id nullable again", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("057_wlt1_destination_decision");
    expect(await tableCount()).toBe(8);
    const cols = await decisionColumns();
    const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]));
    expect(byName.poc_challenge_id?.is_nullable).toBe("YES");
  }, 60_000);
});
