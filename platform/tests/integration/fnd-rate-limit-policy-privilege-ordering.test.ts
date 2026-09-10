/**
 * Shared Rate-Limit Engine — NEW-1 deployment-order regression (independent Opus post-
 * acceptance review of the Shared Rate-Limit Engine, `068_fnd_rate_limit_engine.cjs` /
 * `069_fnd_rate_limit_policy_seed.cjs`, closed by `070_fnd_rate_limit_policy_privilege_
 * hardening.cjs`). Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * PROBLEM THIS FILE IS THE ACCEPTANCE ORACLE FOR: `foundation.rate_limit_policy`'s runtime
 * immutability (role_fnd_runtime must never INSERT/UPDATE/DELETE it) used to depend ENTIRELY
 * on `infra/grants/fnd_runtime_grants.sql`'s own guarded REVOKE running AFTER migration 068
 * creates the table. Independent acceptance proved a realistic opposite deployment order —
 * grants applied once against a pre-068 database, migrations run later, grants never
 * re-applied — left role_fnd_runtime able to write the governance-owned policy table (Postgres's
 * `ALTER DEFAULT PRIVILEGES` grants write access to the new table automatically). Migration 070
 * performs the identical guarded REVOKE at MIGRATION TIME so the control no longer depends on
 * grants-file re-application timing.
 *
 * TWO PRIVATE, uniquely-named, throwaway databases (one per deployment-order scenario), each
 * dropped in `afterAll`. Neither 068 nor 069 is ever modified. This is a "private-disposable-DB"
 * file — fail-loud by construction (an unreachable Postgres server or a failed `CREATE DATABASE`
 * throws in `beforeAll`, failing every test loudly; no pre-existing-schema ambiguity to silently
 * skip past, unlike a shared-DB file — mirrors `fnd-migration-068-regression.test.ts`'s own
 * convention).
 *
 * Both scenarios connect as a REAL restricted LOGIN role inheriting `role_fnd_runtime` — never
 * superuser — and prove the identical final ACL: SELECT allowed, INSERT/UPDATE/DELETE denied.
 */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const FND_GRANTS_SQL = readFileSync(join(REPO_ROOT, "infra", "grants", "fnd_runtime_grants.sql"), "utf8");

/** Exactly 67 migration files precede `068_fnd_rate_limit_engine.cjs` — mirrors
 * `fnd-migration-068-regression.test.ts`'s own constant. */
const MIGRATIONS_THROUGH_067 = 67;

const SUFFIX_A = randomBytes(6).toString("hex");
const SUFFIX_B = randomBytes(6).toString("hex");

const DB_NAME_A = `fnd_ord_a_it_${SUFFIX_A}`;
const DB_NAME_B = `fnd_ord_b_it_${SUFFIX_B}`;
const ROLE_USER_A = `fnd_ord_a_role_${SUFFIX_A}`;
const ROLE_USER_B = `fnd_ord_b_role_${SUFFIX_B}`;

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function silentLog(): void {
  /* silence node-pg-migrate's own verbose per-statement logging */
}
function ignoreExpectedDisconnect(): void {
  /* intentionally empty — expected during DROP DATABASE ... WITH (FORCE) teardown */
}

let maintenancePool: Pool;
let dbUrlA: string;
let dbUrlB: string;
let verifyPoolA: Pool;
let verifyPoolB: Pool;
let schemaReady = false;
let databaseACreated = false;
let databaseBCreated = false;

/** Connects as the given restricted LOGIN role (never superuser) and asserts the exact
 * accepted-architecture ACL on `foundation.rate_limit_policy`: SELECT allowed, INSERT/UPDATE/
 * DELETE all denied with `42501` (insufficient_privilege) — never a silent no-op or a different
 * error class, so a regression here cannot be mistaken for an unrelated failure. */
async function assertPolicyImmutableUnderRestrictedRole(dbUrl: string, roleUser: string): Promise<void> {
  const runtimeDbUrl = dbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${roleUser}@`);
  const runtimePool = new Pool({ connectionString: runtimeDbUrl });
  const runtimeClient = await runtimePool.connect();
  try {
    const readRes = await runtimeClient.query(`SELECT count(*)::int AS n FROM foundation.rate_limit_policy`);
    expect(Number(readRes.rows[0]?.n)).toBe(4); // the four DEC-009 seed rows, untouched

    await expect(
      runtimeClient.query(
        `INSERT INTO foundation.rate_limit_policy (policy_id, module, bucket, burst_limit, burst_window_seconds, sustained_limit, sustained_window_seconds) VALUES ('ord_should_fail', 'WLT-01', 'ORDSHOULDFAIL', 10, 60, 60, 3600)`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      runtimeClient.query(`UPDATE foundation.rate_limit_policy SET burst_limit = 999999 WHERE policy_id = 'frl_wlt1_read_list'`),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      runtimeClient.query(`DELETE FROM foundation.rate_limit_policy WHERE policy_id = 'frl_wlt1_read_list'`),
    ).rejects.toMatchObject({ code: "42501" });
  } finally {
    runtimeClient.release();
    // End the whole ad-hoc pool (not just release) so `afterAll`'s `DROP DATABASE ... WITH
    // (FORCE)` never has to forcibly kill a still-open connection mid-flight.
    await runtimePool.end();
  }
}

async function createRestrictedLoginRole(verifyPool: Pool, roleUser: string): Promise<void> {
  await verifyPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleUser}') THEN
        CREATE ROLE ${roleUser} LOGIN;
      END IF;
    END
    $$;
  `);
  await verifyPool.query(`GRANT role_fnd_runtime TO ${roleUser};`);
}

describe("Shared Rate-Limit Engine — NEW-1: policy immutability is deployment-order-independent", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${DB_NAME_A}`);
    databaseACreated = true;
    await maintenancePool.query(`CREATE DATABASE ${DB_NAME_B}`);
    databaseBCreated = true;

    dbUrlA = withDatabase(TEST_DB, DB_NAME_A);
    dbUrlB = withDatabase(TEST_DB, DB_NAME_B);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "fnd-ord-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "fnd-ord-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "fnd-ord-it-private-db-iam02-token";

    verifyPoolA = new Pool({ connectionString: dbUrlA });
    verifyPoolA.on("error", ignoreExpectedDisconnect);
    verifyPoolB = new Pool({ connectionString: dbUrlB });
    verifyPoolB.on("error", ignoreExpectedDisconnect);
    schemaReady = true;
  }, 60_000);

  afterAll(async () => {
    if (verifyPoolA) await verifyPoolA.query(`DROP ROLE IF EXISTS ${ROLE_USER_A}`).catch(() => undefined);
    if (verifyPoolB) await verifyPoolB.query(`DROP ROLE IF EXISTS ${ROLE_USER_B}`).catch(() => undefined);
    await verifyPoolA?.end();
    await verifyPoolB?.end();
    if (maintenancePool) {
      if (databaseACreated) {
        await maintenancePool.query(`DROP DATABASE IF EXISTS ${DB_NAME_A} WITH (FORCE)`).catch(async () => {
          await maintenancePool.query(`DROP DATABASE IF EXISTS ${DB_NAME_A}`).catch(() => undefined);
        });
      }
      if (databaseBCreated) {
        await maintenancePool.query(`DROP DATABASE IF EXISTS ${DB_NAME_B} WITH (FORCE)`).catch(async () => {
          await maintenancePool.query(`DROP DATABASE IF EXISTS ${DB_NAME_B}`).catch(() => undefined);
        });
      }
      await maintenancePool.end();
    }
  });

  it("H-D3C-1 canary: fails loud if TEST_DATABASE_URL is not set (never silently skips)", () => {
    if (!TEST_DB) {
      return expect(TEST_DB, "TEST_DATABASE_URL must be set for this deployment-order regression to run").toBeDefined();
    }
    expect(schemaReady).toBe(true);
  });

  it("SEQUENCE A — migrations-through-latest, THEN grants: role_fnd_runtime ends SELECT-only on policy", async () => {
    if (!schemaReady) return;

    // Migrate straight to head (068, 069, 070 all apply in one pass — no explicit count means
    // "everything pending", matching a real fresh deployment).
    await runner({ databaseUrl: dbUrlA, dir: MIGRATIONS_DIR, direction: "up", checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    const head = await verifyPoolA.query(`SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1`);
    expect(head.rows[0]?.name).toBe("070_fnd_rate_limit_policy_privilege_hardening");

    // NOTE: roles are CLUSTER-global in PostgreSQL, not per-database — role_fnd_runtime may
    // already exist here (e.g. created by another database's grants file in the same shared
    // test cluster), or may not. Migration 070 is deliberately guarded on role existence
    // (`pg_roles`) precisely so it is safe either way: a no-op if the role is genuinely absent,
    // or a REVOKE-of-nothing (a harmless no-op in PostgreSQL, not an error) if the role exists
    // but was never granted anything on this brand-new table. Either way, no assertion on
    // pre-existing cluster role state belongs in this test — only the FINAL ACL after grants
    // below is the property NEW-1 requires.

    // NOW apply grants (the normal "migrations first" deployment order).
    const grantsPoolA = new Pool({ connectionString: dbUrlA });
    const grantsClientA = await grantsPoolA.connect();
    try {
      await grantsClientA.query(FND_GRANTS_SQL);
    } finally {
      grantsClientA.release();
      await grantsPoolA.end();
    }

    const priv = await verifyPoolA.query(
      `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'foundation' AND table_name = 'rate_limit_policy' AND grantee = 'role_fnd_runtime' ORDER BY privilege_type`,
    );
    expect(priv.rows.map((r) => r.privilege_type)).toEqual(["SELECT"]);

    await createRestrictedLoginRole(verifyPoolA, ROLE_USER_A);
    await assertPolicyImmutableUnderRestrictedRole(dbUrlA, ROLE_USER_A);
  }, 90_000);

  it("SEQUENCE B — grants applied BEFORE 068 exists, migrations run to latest, grants NEVER re-applied: SAME final ACL", async () => {
    if (!schemaReady) return;

    // 1. Migrate only through 067 — rate_limit_policy does not exist yet.
    await runner({ databaseUrl: dbUrlB, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_067, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    const headAt067 = await verifyPoolB.query(`SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1`);
    expect(headAt067.rows[0]?.name).toBe("067_clt1_authorised_user_iam_binding");
    const tableExistsAt067 = await verifyPoolB.query(`SELECT to_regclass('foundation.rate_limit_policy') AS r`);
    expect(tableExistsAt067.rows[0]?.r).toBeNull();

    // 2. Apply grants NOW, against the pre-068 database. role_fnd_runtime is created here; the
    // grants file's own guarded REVOKE no-ops (to_regclass IS NULL — table does not exist yet).
    const grantsPoolB = new Pool({ connectionString: dbUrlB });
    const grantsClientB = await grantsPoolB.connect();
    try {
      await grantsClientB.query(FND_GRANTS_SQL);
    } finally {
      grantsClientB.release();
      await grantsPoolB.end();
    }
    const roleExistsAfterGrants = await verifyPoolB.query(`SELECT 1 FROM pg_roles WHERE rolname = 'role_fnd_runtime'`);
    expect(roleExistsAfterGrants.rowCount).toBe(1);

    // 3. NOW migrate the rest of the way to head (068 creates the table — Postgres's own
    // ALTER DEFAULT PRIVILEGES from step 2 grants SELECT/INSERT/UPDATE to role_fnd_runtime
    // automatically; 069 seeds; 070 must independently REVOKE INSERT/UPDATE/DELETE since
    // role_fnd_runtime already exists at this point).
    await runner({ databaseUrl: dbUrlB, dir: MIGRATIONS_DIR, direction: "up", checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    const headFinal = await verifyPoolB.query(`SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1`);
    expect(headFinal.rows[0]?.name).toBe("070_fnd_rate_limit_policy_privilege_hardening");

    // 4. Deliberately do NOT re-apply grants. This is the exact sequence independent
    // acceptance proved broken pre-070: without this step, INSERT/UPDATE would still be granted.
    const priv = await verifyPoolB.query(
      `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'foundation' AND table_name = 'rate_limit_policy' AND grantee = 'role_fnd_runtime' ORDER BY privilege_type`,
    );
    expect(priv.rows.map((r) => r.privilege_type)).toEqual(["SELECT"]);

    await createRestrictedLoginRole(verifyPoolB, ROLE_USER_B);
    await assertPolicyImmutableUnderRestrictedRole(dbUrlB, ROLE_USER_B);
  }, 90_000);
});
