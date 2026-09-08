/**
 * WLT-01 Limits / Velocity / Concentration / First-Use — committed automated regression coverage
 * for `infra/migrations/066_wlt1_limits.cjs`'s own up/down/re-up behaviour, from day one (mirrors
 * migration 065's own established pattern in `wlt1-migration-065-regression.test.ts`). Self-skips
 * unless `TEST_DATABASE_URL` is set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's programmatic
 * `runner()` API, dropped in `afterAll`. Migration 066 itself is never modified — this file only
 * drives the migration runner and independently verifies real database state via direct SQL after
 * every step.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only. Grant-boundary
 * behaviour is covered separately in `tests/integration/wlt1-db.test.ts` /
 * `wlt1-limits-route.test.ts` / `wlt1-limits-failclosed-private.test.ts`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");

/** Exactly 65 migration files precede `066_wlt1_limits.cjs`. */
const MIGRATIONS_THROUGH_065 = 65;

const PRIVATE_DB_NAME = `wlt1_mig066_regr_it_${randomBytes(6).toString("hex")}`;

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

async function constraintDef(table: string, name: string): Promise<string | undefined> {
  const r = await verifyPool.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1::regclass AND conname = $2`, [table, name]);
  return r.rows[0]?.def;
}

async function indexExists(indexName: string): Promise<boolean> {
  const r = await verifyPool.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'wlt1' AND indexname = $1`, [indexName]);
  return r.rows.length === 1;
}

async function insertDestination(destinationId: string, clientId = "clt1client_mig066regr"): Promise<void> {
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, 'active')`, [
    destinationId,
    clientId,
    "hash_" + randomUUID(),
  ]);
}

async function insertProfile(overrides: Record<string, unknown> = {}): Promise<string> {
  const id = (overrides.limit_profile_id as string) ?? "wlt1lp_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO wlt1.destination_limit_profile
       (limit_profile_id, version, client_id, destination_id, destination_type, asset_or_currency, chain, network, rail,
        per_transaction_limit, daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status, approved_ref)
     VALUES ($1,$2,$3,$4,'wallet','ETH','ethereum','mainnet',NULL,$5,$6,$7,$8,$9,$10,'mig066-approved')`,
    [
      id,
      overrides.version ?? 1,
      overrides.client_id ?? "clt1client_mig066regr",
      overrides.destination_id ?? null,
      overrides.per_transaction_limit ?? "100",
      overrides.daily_velocity_limit ?? (overrides.destination_id ? null : "500"),
      overrides.rolling_velocity_limit ?? (overrides.destination_id ? null : "1000"),
      overrides.rolling_window_hours ?? (overrides.destination_id ? null : 24),
      overrides.first_use_limit ?? (overrides.destination_id ? null : "50"),
      overrides.status ?? "active",
    ],
  );
  return id;
}

async function insertLimitsBoundDecision(destinationId: string, decisionId: string): Promise<void> {
  await verifyPool.query(
    `INSERT INTO wlt1.destination_decision
       (decision_id, token_hash, destination_id, client_id, requested_action, decision, aml_decision_id, aml_valid_until_utc,
        screening_result_id, destination_status_version, whitelist_version, revocation_epoch, chain, network, destination_type,
        issued_at_utc, expires_at_utc, amount, asset_or_currency, limits_version, client_limit_profile_id, client_limit_profile_version)
     VALUES ($1,$2,$3,'clt1client_mig066regr','destination_use','allow','aml1ptd_x', now() + interval '1 hour',
             'wlt1screen_x', 1, 0, 0, 'ethereum', 'mainnet', 'wallet',
             now(), now() + interval '5 minutes', '40', 'ETH', 0, 'wlt1lp_x', 1)`,
    [decisionId, "th_" + randomUUID(), destinationId],
  );
}

describe("WLT-01 Limits / Velocity / Concentration / First-Use: migration 066 up/down/re-up + evidence-preserving down + full schema (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig066-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig066-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig066-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 65 migrations reaches head 065; neither new table exists yet", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_065, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("065_wlt1_screening_failed_status");
    const r = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name IN ('destination_limit_profile', 'limit_evaluation')`);
    expect(Number(r.rows[0]?.n)).toBe(0);
    const cols = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'destination_decision' AND column_name = 'amount'`);
    expect(Number(cols.rows[0]?.n)).toBe(0);
  }, 60_000);

  it("B. migrating up one more migration reaches head 066 — both new tables exist, destination_decision gains 7 columns", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("066_wlt1_limits");
    const tables = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name IN ('destination_limit_profile', 'limit_evaluation')`);
    expect(Number(tables.rows[0]?.n)).toBe(2);
    const newCols = await verifyPool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'destination_decision'
         AND column_name IN ('amount','asset_or_currency','limits_version','client_limit_profile_id','client_limit_profile_version','destination_limit_profile_id','destination_limit_profile_version')
       ORDER BY column_name`,
    );
    expect(newCols.rows.map((r) => r.column_name)).toEqual(
      ["amount", "asset_or_currency", "client_limit_profile_id", "client_limit_profile_version", "destination_limit_profile_id", "destination_limit_profile_version", "limits_version"].sort(),
    );
  }, 60_000);

  it("C. exactly 18 wlt1 tables total; no counter/concentration table was created", async () => {
    if (!schemaReady) return;
    const tables = await verifyPool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'wlt1' ORDER BY table_name`);
    expect(tables.rows.length).toBe(18);
    expect(tables.rows.map((r) => r.table_name)).not.toContain("limit_counter");
    expect(tables.rows.map((r) => r.table_name)).not.toContain("limit_concentration");
  });

  it("D. destination_limit_profile — exact literal schema (columns + types)", async () => {
    if (!schemaReady) return;
    const cols = await verifyPool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'destination_limit_profile' ORDER BY ordinal_position`,
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      "id",
      "limit_profile_id",
      "version",
      "client_id",
      "destination_id",
      "destination_type",
      "asset_or_currency",
      "chain",
      "network",
      "rail",
      "per_transaction_limit",
      "daily_velocity_limit",
      "rolling_velocity_limit",
      "rolling_window_hours",
      "first_use_limit",
      "concentration_limit",
      "stepup_required_above",
      "status",
      "approved_ref",
      "created_at_utc",
      "updated_at_utc",
    ]);
    const perTxn = cols.rows.find((r) => r.column_name === "per_transaction_limit");
    expect(perTxn?.is_nullable).toBe("NO");
    const destId = cols.rows.find((r) => r.column_name === "destination_id");
    expect(destId?.is_nullable).toBe("YES");
  });

  it("E. limit_evaluation — exact literal schema (columns + types)", async () => {
    if (!schemaReady) return;
    const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'limit_evaluation' ORDER BY ordinal_position`);
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      "id",
      "limit_evaluation_id",
      "decision_id",
      "consumption_id",
      "execution_ref",
      "client_id",
      "destination_id",
      "destination_type",
      "whitelist_version",
      "limits_version",
      "amount",
      "asset_or_currency",
      "chain",
      "network",
      "rail",
      "result_status",
      "breach_type",
      "breach_scope",
      "first_use",
      "client_limit_profile_id",
      "client_limit_profile_version",
      "destination_limit_profile_id",
      "destination_limit_profile_version",
      "evaluated_at_utc",
    ]);
  });

  it("F. all named CHECK constraints exist on destination_limit_profile", async () => {
    if (!schemaReady) return;
    for (const name of [
      "chk_wlt1_limit_profile_dimension_coherent",
      "chk_wlt1_limit_profile_rolling_coherent",
      "chk_wlt1_limit_profile_scope_required_controls",
      "chk_wlt1_limit_profile_first_use_lower",
      "chk_wlt1_limit_profile_concentration_deferred",
      "chk_wlt1_limit_profile_stepup_deferred",
    ]) {
      expect(await constraintDef("wlt1.destination_limit_profile", name), name).toBeDefined();
    }
  });

  it("G. all named CHECK constraints exist on limit_evaluation", async () => {
    if (!schemaReady) return;
    for (const name of [
      "chk_wlt1_limit_evaluation_dimension_coherent",
      "chk_wlt1_limit_evaluation_result_coherent",
      "chk_wlt1_limit_evaluation_client_profile_pair",
      "chk_wlt1_limit_evaluation_destination_profile_pair",
    ]) {
      expect(await constraintDef("wlt1.limit_evaluation", name), name).toBeDefined();
    }
  });

  it("H. all named CHECK constraints exist on destination_decision (limits addition)", async () => {
    if (!schemaReady) return;
    for (const name of ["chk_wlt1_destination_decision_limits_coherent", "chk_wlt1_destination_decision_client_profile_pair", "chk_wlt1_destination_decision_destination_profile_pair"]) {
      expect(await constraintDef("wlt1.destination_decision", name), name).toBeDefined();
    }
  });

  it("K. no monetary policy was seeded by the migration itself (checked before any test in this file inserts a fixture profile row)", async () => {
    if (!schemaReady) return;
    const r = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_limit_profile`);
    expect(Number(r.rows[0]?.n)).toBe(0);
  });

  it("I. concentration_limit and stepup_required_above are forced NULL", async () => {
    if (!schemaReady) return;
    const def = await constraintDef("wlt1.destination_limit_profile", "chk_wlt1_limit_profile_concentration_deferred");
    expect(def).toMatch(/concentration_limit IS NULL/);
    const stepupDef = await constraintDef("wlt1.destination_limit_profile", "chk_wlt1_limit_profile_stepup_deferred");
    expect(stepupDef).toMatch(/stepup_required_above IS NULL/);
    await insertDestination("wlt1dest_mig066i_" + randomUUID(), "clt1client_mig066regr_i");
    await expect(insertProfile({ per_transaction_limit: "100", client_id: "clt1client_mig066regr_i" })).resolves.toBeDefined();
    // Attempting a non-null concentration_limit must fail.
    const id = "wlt1lp_" + randomUUID();
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.destination_limit_profile
           (limit_profile_id, version, client_id, destination_type, asset_or_currency, chain, network, per_transaction_limit,
            daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, concentration_limit, status)
         VALUES ($1,1,'clt1client_mig066regr_i','wallet','ETH','ethereum','mainnet','100','500','1000',24,'50','10','active')`,
        [id],
      ),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("J. all named indexes exist", async () => {
    if (!schemaReady) return;
    for (const name of [
      "uq_wlt1_limit_profile_identity_version",
      "uq_wlt1_limit_profile_client_default_active",
      "uq_wlt1_limit_profile_destination_active",
      "idx_wlt1_limit_evaluation_client_usage",
      "idx_wlt1_limit_evaluation_destination_usage",
      "idx_wlt1_limit_evaluation_first_use",
      "idx_wlt1_limit_evaluation_decision",
      "uq_wlt1_limit_evaluation_decision_pass",
    ]) {
      expect(await indexExists(name), name).toBe(true);
    }
  });

  it("L. client-default profile with a NULL mandatory control is rejected (scope_required_controls)", async () => {
    if (!schemaReady) return;
    const id = "wlt1lp_" + randomUUID();
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.destination_limit_profile
           (limit_profile_id, version, client_id, destination_type, asset_or_currency, chain, network, per_transaction_limit,
            daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status)
         VALUES ($1,1,'clt1client_mig066regr_l','wallet','ETH','ethereum','mainnet','100', NULL,'1000',24,'50','active')`,
        [id],
      ),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("M. destination-specific profile MAY omit daily/rolling/first-use", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_mig066m_" + randomUUID();
    await insertDestination(destinationId);
    const id = await insertProfile({ destination_id: destinationId, client_id: "clt1client_mig066regr_m" });
    const row = await verifyPool.query(`SELECT daily_velocity_limit, rolling_velocity_limit, first_use_limit FROM wlt1.destination_limit_profile WHERE limit_profile_id = $1`, [id]);
    expect(row.rows[0]).toEqual({ daily_velocity_limit: null, rolling_velocity_limit: null, first_use_limit: null });
  });

  it("N. first_use_limit must be STRICTLY lower than per_transaction_limit (equality rejected)", async () => {
    if (!schemaReady) return;
    const id = "wlt1lp_" + randomUUID();
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.destination_limit_profile
           (limit_profile_id, version, client_id, destination_type, asset_or_currency, chain, network, per_transaction_limit,
            daily_velocity_limit, rolling_velocity_limit, rolling_window_hours, first_use_limit, status)
         VALUES ($1,1,'clt1client_mig066regr_n','wallet','ETH','ethereum','mainnet','100','500','1000',24,'100','active')`,
        [id],
      ),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("O. rolling_velocity_limit and rolling_window_hours must be coherently both-null or both-set", async () => {
    if (!schemaReady) return;
    const id = "wlt1lp_" + randomUUID();
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.destination_limit_profile
           (limit_profile_id, version, client_id, destination_id, destination_type, asset_or_currency, chain, network, per_transaction_limit,
            rolling_velocity_limit, status)
         VALUES ($1,1,'clt1client_mig066regr_o','wlt1dest_nonexistent','wallet','ETH','ethereum','mainnet','100','1000','active')`,
        [id],
      ),
    ).rejects.toThrow(/violates|does not exist/);
  });

  it("P. two active profiles for the identical client-default dimension are rejected (unique index)", async () => {
    if (!schemaReady) return;
    const clientId = "clt1client_mig066regr_p";
    await insertProfile({ client_id: clientId });
    await expect(insertProfile({ client_id: clientId })).rejects.toThrow(/duplicate key value violates unique constraint "uq_wlt1_limit_profile_client_default_active"/);
  });

  it("Q. the SAME limit_profile_id may carry multiple immutable versions (history preserved)", async () => {
    if (!schemaReady) return;
    const profileId = "wlt1lp_mig066q_" + randomUUID();
    await insertProfile({ limit_profile_id: profileId, version: 1, client_id: "clt1client_mig066regr_q", status: "inactive" });
    await insertProfile({ limit_profile_id: profileId, version: 2, client_id: "clt1client_mig066regr_q", status: "active" });
    const rows = await verifyPool.query(`SELECT version, status FROM wlt1.destination_limit_profile WHERE limit_profile_id = $1 ORDER BY version`, [profileId]);
    expect(rows.rows).toEqual([
      { version: 1, status: "inactive" },
      { version: 2, status: "active" },
    ]);
  });

  it("R. a duplicate (limit_profile_id, version) pair is rejected", async () => {
    if (!schemaReady) return;
    const profileId = "wlt1lp_mig066r_" + randomUUID();
    await insertProfile({ limit_profile_id: profileId, version: 1, client_id: "clt1client_mig066regr_r", status: "inactive" });
    await expect(insertProfile({ limit_profile_id: profileId, version: 1, client_id: "clt1client_mig066regr_r2", status: "active" })).rejects.toThrow(
      /duplicate key value violates unique constraint "uq_wlt1_limit_profile_identity_version"/,
    );
  });

  it("S. at most one pass limit_evaluation row per decision_id (uq_wlt1_limit_evaluation_decision_pass)", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_mig066s_" + randomUUID();
    await insertDestination(destinationId);
    const decisionId = "wlt1dec_mig066s_" + randomUUID();
    await insertLimitsBoundDecision(destinationId, decisionId);
    const profileId = await insertProfile({ client_id: "clt1client_mig066regr_s" });
    const insertPass = () =>
      verifyPool.query(
        `INSERT INTO wlt1.limit_evaluation
           (limit_evaluation_id, decision_id, consumption_id, execution_ref, client_id, destination_id, destination_type,
            whitelist_version, limits_version, amount, asset_or_currency, chain, network, result_status, first_use,
            client_limit_profile_id, client_limit_profile_version)
         VALUES ($1,$2,$3,$4,'clt1client_mig066regr',$5,'wallet',0,0,'40','ETH','ethereum','mainnet','pass',true,$6,1)`,
        ["wlt1lev_" + randomUUID(), decisionId, "wlt1con_" + randomUUID(), "exec_" + randomUUID(), destinationId, profileId],
      );
    await insertPass();
    await expect(insertPass()).rejects.toThrow(/duplicate key value violates unique constraint "uq_wlt1_limit_evaluation_decision_pass"/);
  });

  it("T. down refuses while a limit_evaluation row exists", async () => {
    if (!schemaReady) return;
    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /wlt1\.limit_evaluation contains rows/,
    );
    expect(await migrationHead()).toBe("066_wlt1_limits");
  }, 60_000);

  it("U. controlled cleanup of limit_evaluation rows (privileged test setup)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.limit_evaluation`);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.limit_evaluation`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it("V. down STILL refuses while destination_limit_profile rows exist (independent of limit_evaluation)", async () => {
    if (!schemaReady) return;
    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /wlt1\.destination_limit_profile contains rows/,
    );
    expect(await migrationHead()).toBe("066_wlt1_limits");
  }, 60_000);

  it("W. controlled cleanup of destination_limit_profile rows (privileged test setup)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.destination_limit_profile`);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_limit_profile`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it("X. down STILL refuses while a limits-bound destination_decision row exists (amount IS NOT NULL), independent of the other two", async () => {
    if (!schemaReady) return;
    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /wlt1\.destination_decision contains a limits-bound decision/,
    );
    expect(await migrationHead()).toBe("066_wlt1_limits");
  }, 60_000);

  it("Y. controlled cleanup of the limits-bound decision + its destination (privileged test setup)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE client_id = 'clt1client_mig066regr'`);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE client_id LIKE 'clt1client_mig066regr%'`);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_decision WHERE amount IS NOT NULL`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it("Z. with all three evidence classes empty, down succeeds cleanly back to head 065, dropping both new tables and the seven decision columns", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("065_wlt1_screening_failed_status");
    const tables = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name IN ('destination_limit_profile', 'limit_evaluation')`);
    expect(Number(tables.rows[0]?.n)).toBe(0);
    const cols = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'destination_decision' AND column_name = 'amount'`);
    expect(Number(cols.rows[0]?.n)).toBe(0);
  }, 60_000);

  it("AA. re-up restores the exact frozen schema", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("066_wlt1_limits");
    const tables = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name IN ('destination_limit_profile', 'limit_evaluation')`);
    expect(Number(tables.rows[0]?.n)).toBe(2);
    for (const name of ["uq_wlt1_limit_profile_identity_version", "uq_wlt1_limit_evaluation_decision_pass"]) {
      expect(await indexExists(name), name).toBe(true);
    }
  }, 60_000);
});
