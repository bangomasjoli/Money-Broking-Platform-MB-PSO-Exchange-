/**
 * MIG-004 — committed regression coverage for `infra/migrations/071_cfg1_environment_scope.cjs`
 * (`docs/03_implementation/tasks/MIG-004/01-plan.md` §4, §9, §12): backfill of pre-existing
 * `cfg1.feature` rows, the strict CHECK, the ordering-independent runtime grant restriction, and
 * the down/up round trip. Mirrors `wlt1-migration-066-regression.test.ts`'s pattern: a PRIVATE,
 * uniquely-named throwaway database, node-pg-migrate's programmatic `runner()`, dropped in
 * `afterAll`. Migration 071 itself is never modified — this file only drives the runner and
 * verifies real database state with direct SQL after every step. Self-skips unless
 * `TEST_DATABASE_URL` is set. Tests run in order and build on each other.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const PRIVATE_DB_NAME = `cfg1_mig071_regr_it_${randomBytes(6).toString("hex")}`;

/** Exactly 70 migration files precede `071_cfg1_environment_scope.cjs`. */
const MIGRATIONS_THROUGH_070 = 70;

const ALL_DISABLED = { DEVELOPMENT: "DISABLED", TEST: "DISABLED", UAT: "DISABLED", DEMO: "DISABLED", PRODUCTION: "DISABLED" };

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}
function silentLog(): void {
  /* silence node-pg-migrate's per-statement logging */
}
function ignoreExpectedDisconnect(): void {
  /* expected during DROP DATABASE ... WITH (FORCE) teardown */
}

let maintenancePool: Pool;
let verifyPool: Pool;
let privateDbUrl: string;
let databaseCreated = false;
let schemaReady = false;

async function migrate(direction: "up" | "down", count: number): Promise<void> {
  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction, count, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
}
async function migrationHead(): Promise<string | undefined> {
  return (await verifyPool.query(`SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1`)).rows[0]?.name;
}
async function columnExists(): Promise<boolean> {
  const r = await verifyPool.query(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'cfg1' AND table_name = 'feature' AND column_name = 'environment_scope'`,
  );
  return r.rows[0].n === 1;
}
async function constraintExists(): Promise<boolean> {
  return (await verifyPool.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'cfg1_feature_environment_scope_valid'`)).rows[0].n === 1;
}
async function scopesByCode(): Promise<Record<string, unknown>> {
  const r = await verifyPool.query(`SELECT feature_code, environment_scope FROM cfg1.feature WHERE feature_code LIKE 'test.mig071.%' ORDER BY feature_code`);
  return Object.fromEntries(r.rows.map((row) => [row.feature_code, row.environment_scope]));
}
/** Runs one statement as role_cfg1_runtime (SET LOCAL ROLE inside a rolled-back transaction). */
async function asRuntimeRole(sql: string, params: unknown[] = []): Promise<void> {
  const client = await verifyPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE role_cfg1_runtime");
    await client.query(sql, params);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}
async function runtimePrivileges() {
  return (
    await verifyPool.query(
      `SELECT has_table_privilege('role_cfg1_runtime', 'cfg1.feature', 'INSERT') AS table_insert,
              has_column_privilege('role_cfg1_runtime', 'cfg1.feature', 'environment_scope', 'INSERT') AS scope_insert,
              has_column_privilege('role_cfg1_runtime', 'cfg1.feature', 'environment_scope', 'UPDATE') AS scope_update,
              has_column_privilege('role_cfg1_runtime', 'cfg1.feature', 'feature_code', 'INSERT') AS code_insert,
              has_column_privilege('role_cfg1_runtime', 'cfg1.feature', 'current_state', 'UPDATE') AS state_update`,
    )
  ).rows[0];
}

describe("CFG-01 migration 071 (environment_scope): backfill, CHECK, grant ordering, down/up (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;
    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);
    process.env.SEC1_INGEST_TOKEN_FND01 ??= "cfg1-mig071-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "cfg1-mig071-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "cfg1-mig071-regr-it-private-db-iam02-token";
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

  function ready(): boolean {
    if (!TEST_DB) return false;
    expect(schemaReady, "private DB creation must have succeeded").toBe(true);
    return true;
  }

  it("A. migrating up through exactly 70 migrations reaches head 070; environment_scope does not exist yet", async () => {
    if (!ready()) return;
    await migrate("up", MIGRATIONS_THROUGH_070);
    expect(await migrationHead()).toBe("070_fnd_rate_limit_policy_privilege_hardening");
    expect(await columnExists()).toBe(false);
  }, 120_000);

  it("B. pre-071 deployment state: grants applied BEFORE 071 with the old TABLE-level INSERT, plus pre-existing cfg1.feature rows", async () => {
    if (!ready()) return;
    await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "fnd_runtime_grants.sql"), "utf8"));
    await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "cfg1_runtime_grants.sql"), "utf8"));
    // Reproduce exactly what the pre-MIG-004 grants file left behind.
    await verifyPool.query(`GRANT INSERT ON cfg1.feature TO role_cfg1_runtime`);
    // (has_column_privilege on environment_scope would itself error here — the column does not exist yet.)
    const r = await verifyPool.query(`SELECT has_table_privilege('role_cfg1_runtime', 'cfg1.feature', 'INSERT') AS table_insert`);
    expect(r.rows[0].table_insert).toBe(true);

    await verifyPool.query(
      `INSERT INTO cfg1.feature (feature_id, feature_code, feature_name, current_state, version, created_at_utc, updated_at_utc) VALUES
         ('feat_mig071_a', 'test.mig071.enabled_before', 'pre-071 enabled row', 'enabled', 3, now(), now()),
         ('feat_mig071_b', 'test.mig071.disabled_before', 'pre-071 disabled row', 'disabled', 1, now(), now())`,
    );
  });

  it("C. migrating up 071 backfills EVERY pre-existing row to all-DISABLED — an enabled row becomes available nowhere", async () => {
    if (!ready()) return;
    await migrate("up", 1);
    expect(await migrationHead()).toBe("071_cfg1_environment_scope");
    expect(await columnExists()).toBe(true);
    expect(await constraintExists()).toBe(true);
    expect(await scopesByCode()).toEqual({ "test.mig071.disabled_before": ALL_DISABLED, "test.mig071.enabled_before": ALL_DISABLED });
    // current_state and version are untouched by the migration.
    const r = await verifyPool.query(`SELECT current_state, version FROM cfg1.feature WHERE feature_code = 'test.mig071.enabled_before'`);
    expect(r.rows[0]).toEqual({ current_state: "enabled", version: 3 });
    const col = await verifyPool.query(
      `SELECT data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'cfg1' AND table_name = 'feature' AND column_name = 'environment_scope'`,
    );
    expect(col.rows[0]).toEqual({ data_type: "jsonb", is_nullable: "NO" });
  });

  it("D. grants-BEFORE-071 ordering: the migration itself removes table-level INSERT, so role_cfg1_runtime can neither INSERT nor UPDATE environment_scope", async () => {
    if (!ready()) return;
    expect(await runtimePrivileges()).toEqual({ table_insert: false, scope_insert: false, scope_update: false, code_insert: true, state_update: true });
    await expect(
      asRuntimeRole(
        `INSERT INTO cfg1.feature (feature_id, feature_code, feature_name, current_state, environment_scope) VALUES ('feat_x', 'test.mig071.rt_ins', 'x', 'enabled', $1::jsonb)`,
        [JSON.stringify({ ...ALL_DISABLED, PRODUCTION: "ENABLED" })],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asRuntimeRole(`UPDATE cfg1.feature SET environment_scope = $1::jsonb WHERE feature_code = 'test.mig071.enabled_before'`, [
        JSON.stringify({ ...ALL_DISABLED, PRODUCTION: "ENABLED" }),
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    // The permitted column-scoped INSERT still works (and takes the default).
    await expect(
      asRuntimeRole(
        `INSERT INTO cfg1.feature (feature_id, feature_code, feature_name, current_state, licence_profile_id, version, created_at_utc, updated_at_utc)
         VALUES ('feat_mig071_rt_ok', 'test.mig071.rt_ok', 'x', 'enabled', NULL, 1, now(), now())`,
      ),
    ).resolves.toBeUndefined();
  });

  it("E. re-applying the grants file (twice) keeps the same restricted privileges — idempotent", async () => {
    if (!ready()) return;
    const grants = readFileSync(join(REPO_ROOT, "infra", "grants", "cfg1_runtime_grants.sql"), "utf8");
    await verifyPool.query(grants);
    await verifyPool.query(grants);
    expect(await runtimePrivileges()).toEqual({ table_insert: false, scope_insert: false, scope_update: false, code_insert: true, state_update: true });
  });

  describe("F. the CHECK constraint rejects every malformed environment_scope (23514) and accepts every valid one", () => {
    const malformed: Array<[string, unknown]> = [
      ["not an object (array)", ["ENABLED"]],
      ["not an object (string)", "ENABLED"],
      ["not an object (number)", 1],
      ["JSON null", null],
      ["empty object", {}],
      ["missing PRODUCTION", { DEVELOPMENT: "DISABLED", TEST: "DISABLED", UAT: "DISABLED", DEMO: "DISABLED" }],
      ["missing DEMO", { DEVELOPMENT: "DISABLED", TEST: "DISABLED", UAT: "DISABLED", PRODUCTION: "DISABLED" }],
      ["extra STAGING key", { ...ALL_DISABLED, STAGING: "DISABLED" }],
      ["STAGING instead of PRODUCTION", { DEVELOPMENT: "DISABLED", TEST: "DISABLED", UAT: "DISABLED", DEMO: "DISABLED", STAGING: "ENABLED" }],
      ["wildcard key", { ...ALL_DISABLED, "*": "ENABLED" }],
      ["lower-case keys", { development: "DISABLED", test: "DISABLED", uat: "DISABLED", demo: "DISABLED", production: "DISABLED" }],
      ["lower-case value", { ...ALL_DISABLED, DEVELOPMENT: "enabled" }],
      ["unknown value", { ...ALL_DISABLED, DEVELOPMENT: "ALLOWED" }],
      ["boolean shorthand", { ...ALL_DISABLED, PRODUCTION: true }],
      ["numeric value", { ...ALL_DISABLED, TEST: 1 }],
      ["null value", { ...ALL_DISABLED, UAT: null }],
      ["nested value", { ...ALL_DISABLED, DEMO: { state: "ENABLED" } }],
      ["array value", { ...ALL_DISABLED, DEMO: ["ENABLED"] }],
    ];

    it.each(malformed)("%s → rejected on INSERT and on UPDATE", async (_label, value) => {
      if (!ready()) return;
      await expect(
        verifyPool.query(
          `INSERT INTO cfg1.feature (feature_id, feature_code, feature_name, current_state, environment_scope) VALUES ('feat_mig071_bad', 'test.mig071.bad', 'x', 'enabled', $1::jsonb)`,
          [JSON.stringify(value)],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        verifyPool.query(`UPDATE cfg1.feature SET environment_scope = $1::jsonb WHERE feature_code = 'test.mig071.disabled_before'`, [JSON.stringify(value)]),
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("SQL NULL is rejected by NOT NULL (23502)", async () => {
      if (!ready()) return;
      await expect(verifyPool.query(`UPDATE cfg1.feature SET environment_scope = NULL WHERE feature_code = 'test.mig071.disabled_before'`)).rejects.toMatchObject({
        code: "23502",
      });
    });

    it.each(["ENABLED", "DISABLED", "NOT_APPLICABLE"])("every key accepts %s", async (state) => {
      if (!ready()) return;
      for (const key of Object.keys(ALL_DISABLED)) {
        await verifyPool.query(`UPDATE cfg1.feature SET environment_scope = $1::jsonb WHERE feature_code = 'test.mig071.disabled_before'`, [
          JSON.stringify({ ...ALL_DISABLED, [key]: state }),
        ]);
      }
      await verifyPool.query(`UPDATE cfg1.feature SET environment_scope = $1::jsonb WHERE feature_code = 'test.mig071.disabled_before'`, [JSON.stringify(ALL_DISABLED)]);
    });
  });

  it("G. down 071 removes the constraint and the column and leaves every feature row intact; head returns to 070", async () => {
    if (!ready()) return;
    await verifyPool.query(`UPDATE cfg1.feature SET environment_scope = $1::jsonb WHERE feature_code = 'test.mig071.enabled_before'`, [
      JSON.stringify({ ...ALL_DISABLED, DEVELOPMENT: "ENABLED" }),
    ]);
    await migrate("down", 1);
    expect(await migrationHead()).toBe("070_fnd_rate_limit_policy_privilege_hardening");
    expect(await columnExists()).toBe(false);
    expect(await constraintExists()).toBe(false);
    const r = await verifyPool.query(`SELECT count(*)::int AS n FROM cfg1.feature WHERE feature_code LIKE 'test.mig071.%'`);
    expect(r.rows[0].n).toBe(2); // the two pre-071 rows (D's runtime-role inserts ran in rolled-back transactions)
  });

  it("H. re-up 071 backfills all-DISABLED again — availability set before the down is NOT resurrected", async () => {
    if (!ready()) return;
    await migrate("up", 1);
    expect(await migrationHead()).toBe("071_cfg1_environment_scope");
    expect(await constraintExists()).toBe(true);
    const scopes = await scopesByCode();
    for (const code of Object.keys(scopes)) expect(scopes[code]).toEqual(ALL_DISABLED);
    expect((await runtimePrivileges()).scope_insert).toBe(false);
  });
});
