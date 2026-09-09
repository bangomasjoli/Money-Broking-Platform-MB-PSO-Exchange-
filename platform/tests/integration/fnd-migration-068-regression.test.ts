/**
 * Shared Rate-Limit Engine — committed automated regression coverage for
 * `infra/migrations/068_fnd_rate_limit_engine.cjs` and `069_fnd_rate_limit_policy_seed.cjs`'s
 * own up/down/re-up behaviour, from day one (mirrors the established WLT-01 per-migration
 * regression pattern, e.g. `wlt1-migration-066-regression.test.ts`). Self-skips unless
 * `TEST_DATABASE_URL` is set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's
 * programmatic `runner()` API, dropped in `afterAll`. Neither migration is ever modified — this
 * file only drives the migration runner and independently verifies real database state via
 * direct SQL after every step. This is a "private-disposable-DB" file — it is fail-loud by
 * construction (an unreachable Postgres server or a failed `CREATE DATABASE` throws in
 * `beforeAll`, failing every test loudly; there is no pre-existing-schema ambiguity to
 * silently skip past, unlike a shared-DB file).
 *
 * Grant-boundary behaviour (the runtime role genuinely cannot write policy) is verified here
 * too, since it is inseparable from proving the migration + its grants-file companion change
 * actually close the loop — `fnd_runtime_grants.sql` is applied against this SAME private
 * database at the relevant points.
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

/** Exactly 67 migration files precede `068_fnd_rate_limit_engine.cjs`. */
const MIGRATIONS_THROUGH_067 = 67;

const PRIVATE_DB_NAME = `fnd_mig068_regr_it_${randomBytes(6).toString("hex")}`;
const RUNTIME_ROLE_USER = `fnd_mig068_regr_role_${randomBytes(4).toString("hex")}`;

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

describe("Shared Rate-Limit Engine: migrations 068/069 up/down/re-up + full schema + grants (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "fnd-mig068-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "fnd-mig068-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "fnd-mig068-regr-it-private-db-iam02-token";

    verifyPool = new Pool({ connectionString: privateDbUrl });
    verifyPool.on("error", ignoreExpectedDisconnect);
    schemaReady = true;
  }, 60_000);

  afterAll(async () => {
    // Test I creates a genuine LOGIN role (to prove privilege denial under a real restricted
    // connection, not a superuser assumption) — drop it here so disposable regression roles do
    // not accumulate in the shared Postgres instance across repeated test runs.
    if (verifyPool) {
      await verifyPool.query(`DROP ROLE IF EXISTS ${RUNTIME_ROLE_USER}`).catch(() => undefined);
    }
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

  it("A. migrating up through exactly 67 migrations reaches head 067; neither new table exists yet", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_067, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("067_clt1_authorised_user_iam_binding");
    const r = await verifyPool.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'foundation' AND table_name IN ('rate_limit_counter', 'rate_limit_policy')`,
    );
    expect(Number(r.rows[0]?.n)).toBe(0);
  }, 60_000);

  it("B. migrating up one more (068) reaches head 068 — both new tables exist, ZERO policy rows seeded", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("068_fnd_rate_limit_engine");

    const tables = await verifyPool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'foundation' AND table_name IN ('rate_limit_counter', 'rate_limit_policy') ORDER BY table_name`,
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual(["rate_limit_counter", "rate_limit_policy"]);

    const policyCount = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.rate_limit_policy`);
    expect(Number(policyCount.rows[0]?.n)).toBe(0);
  }, 60_000);

  it("C. rate_limit_counter has the exact expected columns, composite PK, and CHECKs", async () => {
    if (!schemaReady) return;
    const cols = await verifyPool.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'foundation' AND table_name = 'rate_limit_counter'
        ORDER BY ordinal_position`,
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      "module",
      "bucket",
      "subject_hash",
      "burst_window_start_utc",
      "burst_count",
      "sustained_window_start_utc",
      "sustained_count",
      "updated_at_utc",
    ]);
    expect(cols.rows.every((r) => r.is_nullable === "NO")).toBe(true);

    const pk = await verifyPool.query(
      `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'foundation.rate_limit_counter'::regclass AND i.indisprimary
        ORDER BY array_position(i.indkey, a.attnum)`,
    );
    expect(pk.rows.map((r) => r.attname)).toEqual(["module", "bucket", "subject_hash"]);

    // module/bucket CHECK patterns reject malformed values even at the DB layer.
    await expect(
      verifyPool.query(
        `INSERT INTO foundation.rate_limit_counter (module, bucket, subject_hash, burst_window_start_utc, burst_count, sustained_window_start_utc, sustained_count) VALUES ('bad', 'READ_LIST', 'h', now(), 1, now(), 1)`,
      ),
    ).rejects.toThrow();
    await expect(
      verifyPool.query(
        `INSERT INTO foundation.rate_limit_counter (module, bucket, subject_hash, burst_window_start_utc, burst_count, sustained_window_start_utc, sustained_count) VALUES ('WLT-01', 'read_list', 'h', now(), 1, now(), 1)`,
      ),
    ).rejects.toThrow();
    await expect(
      verifyPool.query(
        `INSERT INTO foundation.rate_limit_counter (module, bucket, subject_hash, burst_window_start_utc, burst_count, sustained_window_start_utc, sustained_count) VALUES ('WLT-01', 'READ_LIST', 'h', now(), -1, now(), 1)`,
      ),
    ).rejects.toThrow();
  });

  it("D. rate_limit_policy has the exact expected columns/UNIQUE and rejects incoherent rows", async () => {
    if (!schemaReady) return;
    const cols = await verifyPool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'foundation' AND table_name = 'rate_limit_policy' ORDER BY ordinal_position`,
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      "policy_id",
      "module",
      "bucket",
      "burst_limit",
      "burst_window_seconds",
      "sustained_limit",
      "sustained_window_seconds",
      "status",
      "version",
      "created_at_utc",
      "updated_at_utc",
    ]);

    const uniqueIdx = await verifyPool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'foundation' AND tablename = 'rate_limit_policy'`);
    expect(uniqueIdx.rows.length).toBeGreaterThanOrEqual(2); // primary policy_id UNIQUE + (module,bucket) UNIQUE

    // burst_window_seconds > sustained_window_seconds -> rejected by coherence CHECK.
    await expect(
      verifyPool.query(
        `INSERT INTO foundation.rate_limit_policy (policy_id, module, bucket, burst_limit, burst_window_seconds, sustained_limit, sustained_window_seconds) VALUES ('bad1', 'WLT-01', 'TESTBUCKET1', 10, 3600, 60, 60)`,
      ),
    ).rejects.toThrow();

    // burst_limit > sustained_limit -> rejected.
    await expect(
      verifyPool.query(
        `INSERT INTO foundation.rate_limit_policy (policy_id, module, bucket, burst_limit, burst_window_seconds, sustained_limit, sustained_window_seconds) VALUES ('bad2', 'WLT-01', 'TESTBUCKET2', 100, 60, 10, 3600)`,
      ),
    ).rejects.toThrow();

    // status outside ('active','inactive') -> rejected.
    await expect(
      verifyPool.query(
        `INSERT INTO foundation.rate_limit_policy (policy_id, module, bucket, burst_limit, burst_window_seconds, sustained_limit, sustained_window_seconds, status) VALUES ('bad3', 'WLT-01', 'TESTBUCKET3', 10, 60, 60, 3600, 'pending')`,
      ),
    ).rejects.toThrow();

    // Duplicate (module, bucket) -> rejected by the UNIQUE constraint.
    await verifyPool.query(
      `INSERT INTO foundation.rate_limit_policy (policy_id, module, bucket, burst_limit, burst_window_seconds, sustained_limit, sustained_window_seconds) VALUES ('dupA', 'WLT-01', 'TESTBUCKET4', 10, 60, 60, 3600)`,
    );
    await expect(
      verifyPool.query(
        `INSERT INTO foundation.rate_limit_policy (policy_id, module, bucket, burst_limit, burst_window_seconds, sustained_limit, sustained_window_seconds) VALUES ('dupB', 'WLT-01', 'TESTBUCKET4', 10, 60, 60, 3600)`,
      ),
    ).rejects.toThrow();
    await verifyPool.query(`DELETE FROM foundation.rate_limit_policy WHERE policy_id = 'dupA'`);
  });

  it("E. NO RLS on either new table (deliberate — see migration's own header comment)", async () => {
    if (!schemaReady) return;
    const r = await verifyPool.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('rate_limit_counter', 'rate_limit_policy') ORDER BY relname`,
    );
    expect(r.rows).toEqual([
      { relname: "rate_limit_counter", relrowsecurity: false, relforcerowsecurity: false },
      { relname: "rate_limit_policy", relrowsecurity: false, relforcerowsecurity: false },
    ]);
  });

  it("F. fnd_runtime_grants.sql applies cleanly at head 068 (pre-069, table exists, guarded REVOKE fires)", async () => {
    if (!schemaReady) return;
    await maintenancePool.query(`SET search_path = public`).catch(() => undefined);
    const roleCheck = await verifyPool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'role_fnd_runtime'`);
    // Idempotent create-if-missing inside the grants file itself handles role creation.
    void roleCheck;
    const privPool1 = new Pool({ connectionString: privateDbUrl });
    const privClient = await privPool1.connect();
    try {
      await privClient.query(FND_GRANTS_SQL);
    } finally {
      privClient.release();
      await privPool1.end();
    }
    const priv = await verifyPool.query(
      `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'foundation' AND table_name = 'rate_limit_policy' AND grantee = 'role_fnd_runtime' ORDER BY privilege_type`,
    );
    expect(priv.rows.map((r) => r.privilege_type)).toEqual(["SELECT"]);
  }, 30_000);

  it("G. migrating up one more (069) reaches head 069 — exactly the four DEC-009 rows, exact values", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("069_fnd_rate_limit_policy_seed");

    const rows = await verifyPool.query(
      `SELECT policy_id, module, bucket, burst_limit, burst_window_seconds, sustained_limit, sustained_window_seconds, status, version
         FROM foundation.rate_limit_policy
        WHERE policy_id LIKE 'frl_wlt1_%'
        ORDER BY policy_id`,
    );
    expect(rows.rows).toEqual([
      { policy_id: "frl_wlt1_mutate_poc", module: "WLT-01", bucket: "MUTATE_POC", burst_limit: 10, burst_window_seconds: 60, sustained_limit: 60, sustained_window_seconds: 3600, status: "active", version: 1 },
      { policy_id: "frl_wlt1_mutate_register", module: "WLT-01", bucket: "MUTATE_REGISTER", burst_limit: 10, burst_window_seconds: 60, sustained_limit: 60, sustained_window_seconds: 3600, status: "active", version: 1 },
      { policy_id: "frl_wlt1_read_item", module: "WLT-01", bucket: "READ_ITEM", burst_limit: 200, burst_window_seconds: 60, sustained_limit: 2400, sustained_window_seconds: 3600, status: "active", version: 1 },
      { policy_id: "frl_wlt1_read_list", module: "WLT-01", bucket: "READ_LIST", burst_limit: 100, burst_window_seconds: 60, sustained_limit: 1200, sustained_window_seconds: 3600, status: "active", version: 1 },
    ]);
    // No AUTH_FAILURE, no per-IP row.
    const total = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.rate_limit_policy`);
    expect(Number(total.rows[0]?.n)).toBe(4);
  }, 60_000);

  it("H. fnd_runtime_grants.sql re-run at head 069 (post-069) is still safe and idempotent", async () => {
    if (!schemaReady) return;
    const privPool2 = new Pool({ connectionString: privateDbUrl });
    const privClient = await privPool2.connect();
    try {
      await privClient.query(FND_GRANTS_SQL);
      await privClient.query(FND_GRANTS_SQL); // re-run a second time — must not error
    } finally {
      privClient.release();
      await privPool2.end();
    }
    const priv = await verifyPool.query(
      `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'foundation' AND table_name = 'rate_limit_policy' AND grantee = 'role_fnd_runtime' ORDER BY privilege_type`,
    );
    expect(priv.rows.map((r) => r.privilege_type)).toEqual(["SELECT"]);
  });

  it("I. role_fnd_runtime genuinely cannot INSERT/UPDATE/DELETE policy under the REAL restricted role (not superuser)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN
          CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN;
        END IF;
      END
      $$;
    `);
    await verifyPool.query(`GRANT role_fnd_runtime TO ${RUNTIME_ROLE_USER};`);

    const runtimeDbUrl = privateDbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
    const runtimePool = new Pool({ connectionString: runtimeDbUrl });
    const runtimeClient = await runtimePool.connect();
    try {
      // SELECT succeeds (inherited grant).
      const readRes = await runtimeClient.query(`SELECT count(*)::int AS n FROM foundation.rate_limit_policy`);
      expect(Number(readRes.rows[0]?.n)).toBe(4);

      // INSERT/UPDATE/DELETE all denied.
      await expect(
        runtimeClient.query(
          `INSERT INTO foundation.rate_limit_policy (policy_id, module, bucket, burst_limit, burst_window_seconds, sustained_limit, sustained_window_seconds) VALUES ('should_fail', 'WLT-01', 'SHOULDFAIL', 10, 60, 60, 3600)`,
        ),
      ).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege
      await expect(runtimeClient.query(`UPDATE foundation.rate_limit_policy SET burst_limit = 999 WHERE policy_id = 'frl_wlt1_read_list'`)).rejects.toMatchObject({ code: "42501" });
      await expect(runtimeClient.query(`DELETE FROM foundation.rate_limit_policy WHERE policy_id = 'frl_wlt1_read_list'`)).rejects.toMatchObject({ code: "42501" });

      // Counter table: runtime INSERT/UPDATE (the atomic upsert the engine itself issues) works.
      // DELETE is deliberately NOT granted to role_fnd_runtime on ANY foundation table (the
      // blanket grant in fnd_runtime_grants.sql is SELECT, INSERT, UPDATE only) — the engine
      // never deletes counter rows itself (rollover is an UPDATE), so this is correct, not a gap.
      await runtimeClient.query(
        `INSERT INTO foundation.rate_limit_counter (module, bucket, subject_hash, burst_window_start_utc, burst_count, sustained_window_start_utc, sustained_count) VALUES ('WLT-01', 'READ_LIST', 'runtime_test_hash', now(), 1, now(), 1) ON CONFLICT (module, bucket, subject_hash) DO UPDATE SET burst_count = foundation.rate_limit_counter.burst_count + 1`,
      );
      const counterRow = await runtimeClient.query(`SELECT burst_count FROM foundation.rate_limit_counter WHERE subject_hash = 'runtime_test_hash'`);
      expect(Number(counterRow.rows[0]?.burst_count)).toBe(1);
      await expect(runtimeClient.query(`DELETE FROM foundation.rate_limit_counter WHERE subject_hash = 'runtime_test_hash'`)).rejects.toMatchObject({ code: "42501" });
    } finally {
      runtimeClient.release();
      // End the whole ad-hoc pool, not just release the client back to it — an un-ended pool
      // leaves a dangling connection that `afterAll`'s `DROP DATABASE ... WITH (FORCE)` would
      // otherwise forcibly kill mid-flight, surfacing as an uncaught "terminating connection
      // due to administrator command" error outside this test's own try/finally.
      await runtimePool.end();
    }
    // Clean up via the privileged connection (role_fnd_runtime cannot DELETE, proven above) —
    // later tests (K) prove DOWN 068 is refused while the counter table holds ANY row, so this
    // test must not leave one behind for a reason unrelated to its own scope.
    await verifyPool.query(`DELETE FROM foundation.rate_limit_counter WHERE subject_hash = 'runtime_test_hash'`);
  }, 30_000);

  it("J. DOWN 069 succeeds (seed rows untouched) and removes exactly the four seeded rows", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("068_fnd_rate_limit_engine");
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.rate_limit_policy`);
    expect(Number(remaining.rows[0]?.n)).toBe(0);
  }, 60_000);

  it("K. DOWN 068 succeeds (tables empty) and drops both tables", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("067_clt1_authorised_user_iam_binding");
    const tables = await verifyPool.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'foundation' AND table_name IN ('rate_limit_counter', 'rate_limit_policy')`,
    );
    expect(Number(tables.rows[0]?.n)).toBe(0);
  }, 60_000);

  it("L. RE-UP 068 then 069 succeeds cleanly (full round trip)", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 2, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("069_fnd_rate_limit_policy_seed");
    const rows = await verifyPool.query(`SELECT count(*)::int AS n FROM foundation.rate_limit_policy`);
    expect(Number(rows.rows[0]?.n)).toBe(4);
  }, 60_000);

  it("M. DOWN 068 is REFUSED while the counter table holds a row (evidence-preserving down)", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog }); // down 069 first
    await verifyPool.query(
      `INSERT INTO foundation.rate_limit_counter (module, bucket, subject_hash, burst_window_start_utc, burst_count, sustained_window_start_utc, sustained_count) VALUES ('WLT-01', 'READ_LIST', 'evidence_hash', now(), 1, now(), 1)`,
    );
    await expect(
      runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog }),
    ).rejects.toThrow(/rate_limit_counter contains rows/);
    expect(await migrationHead()).toBe("068_fnd_rate_limit_engine");
    // Clean up so the file's own final state is tidy (not load-bearing for the test itself).
    await verifyPool.query(`DELETE FROM foundation.rate_limit_counter WHERE subject_hash = 'evidence_hash'`);
  }, 60_000);
});
