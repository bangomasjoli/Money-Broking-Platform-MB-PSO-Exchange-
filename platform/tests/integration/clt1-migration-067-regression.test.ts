/**
 * Authenticated Principal -> Client Membership Authority — committed automated regression coverage
 * for `infra/migrations/067_clt1_authorised_user_iam_binding.cjs`'s own up/down/re-up behaviour,
 * from day one (mirrors `wlt1-migration-066-regression.test.ts`'s own established pattern). Self-
 * skips unless `TEST_DATABASE_URL` is set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's programmatic
 * `runner()` API, dropped in `afterAll`. Migration 067 itself is never modified — this file only
 * drives the migration runner and independently verifies real database state via direct SQL after
 * every step.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only (schema-owner
 * INSERTs throughout). Grant-boundary behaviour (runtime cannot UPDATE iam_user_id) is covered
 * separately in `tests/integration/clt1-db.test.ts`; the resolution route's own behaviour is
 * covered in `tests/integration/clt1-principal-membership-route.test.ts`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");

/** Exactly 66 migration files precede `067_clt1_authorised_user_iam_binding.cjs`. */
const MIGRATIONS_THROUGH_066 = 66;

const PRIVATE_DB_NAME = `clt1_mig067_regr_it_${randomBytes(6).toString("hex")}`;

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

async function migrateTo(count: number): Promise<void> {
  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
}

async function migrateDown(count: number): Promise<void> {
  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
}

let clientCounter = 0;
async function insertClientProfile(status: "active" | "active_limited" = "active_limited"): Promise<string> {
  clientCounter += 1;
  const clientId = "clt1client_mig067_" + clientCounter + "_" + randomUUID();
  const applicationId = "clt1app_mig067_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO clt1.client_application (application_id, applicant_type, legal_name, client_class_claimed, status, client_id, created_by)
     VALUES ($1, 'corporate', 'Test Co', 'institutional', 'approved', $2, 'tester')`,
    [applicationId, clientId],
  );
  await verifyPool.query(
    `INSERT INTO clt1.client_profile (client_id, application_id, applicant_type, legal_name, client_class, status)
     VALUES ($1, $2, 'corporate', 'Test Co', 'institutional', $3)`,
    [clientId, applicationId, status],
  );
  return clientId;
}

async function insertAuthorisedUser(opts: { clientId: string; iamUserId?: string | null; status?: "active" | "inactive" | "suspended" | "revoked" }): Promise<string> {
  const authorisedUserId = "clt1au_mig067_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO clt1.authorised_user (authorised_user_id, client_id, user_reference, role, status, requested_by, iam_user_id)
     VALUES ($1, $2, 'declared@example.com', 'viewer', $3, 'staff_1', $4)`,
    [authorisedUserId, opts.clientId, opts.status ?? "active", opts.iamUserId ?? null],
  );
  return authorisedUserId;
}

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "clt1-mig067-regr-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "clt1-mig067-regr-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "clt1-mig067-regr-it-private-db-iam02-token";

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

describe("Authenticated Principal -> Client Membership Authority: migration 067 up/down/re-up + evidence-preserving down (committed regression)", () => {
  it("A. migrating up through exactly 66 migrations reaches head 066; the iam_user_id column does not exist yet on either table", async () => {
    if (!schemaReady) return;
    await migrateTo(MIGRATIONS_THROUGH_066);
    expect(await migrationHead()).toBe("066_wlt1_limits");
    const cols = await verifyPool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'clt1' AND table_name IN ('authorised_user','authorised_user_decision_request') AND column_name = 'iam_user_id'`,
    );
    expect(cols.rows).toHaveLength(0);
  }, 60_000);

  it("B. up to 067 adds iam_user_id (varchar(64), nullable) on BOTH tables, and the exact partial unique index", async () => {
    if (!schemaReady) return;
    await migrateTo(1);
    expect(await migrationHead()).toBe("067_clt1_authorised_user_iam_binding");

    const cols = await verifyPool.query(
      `SELECT table_name, is_nullable, character_maximum_length FROM information_schema.columns
        WHERE table_schema = 'clt1' AND column_name = 'iam_user_id' ORDER BY table_name`,
    );
    expect(cols.rows).toEqual([
      { table_name: "authorised_user", is_nullable: "YES", character_maximum_length: 64 },
      { table_name: "authorised_user_decision_request", is_nullable: "YES", character_maximum_length: 64 },
    ]);

    const idx = await verifyPool.query(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'clt1' AND indexname = 'idx_clt1_authorised_user_one_active_per_iam_client'`);
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0].indexdef).toContain("UNIQUE INDEX idx_clt1_authorised_user_one_active_per_iam_client ON clt1.authorised_user USING btree (iam_user_id, client_id)");
    expect(idx.rows[0].indexdef).toContain("WHERE ((iam_user_id IS NOT NULL) AND ((status)::text = 'active'::text))");
  }, 60_000);

  it("C. NO foreign key exists on iam_user_id on either table — no cross-schema dependency from clt1 to iam", async () => {
    if (!schemaReady) return;
    const fks = await verifyPool.query(
      `SELECT tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'clt1' AND kcu.column_name = 'iam_user_id'`,
    );
    expect(fks.rows).toHaveLength(0);
  });

  it("D. multiple UNBOUND (iam_user_id IS NULL) active rows for the same client are unaffected by the partial index", async () => {
    if (!schemaReady) return;
    const clientId = await insertClientProfile();
    await insertAuthorisedUser({ clientId, iamUserId: null, status: "active" });
    await insertAuthorisedUser({ clientId, iamUserId: null, status: "active" });
    const count = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_user WHERE client_id = $1 AND status = 'active'`, [clientId]);
    expect(Number(count.rows[0].count)).toBe(2);
  });

  it("E. the SAME iam_user_id active for TWO DIFFERENT clients is allowed", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_e_" + randomUUID();
    const clientA = await insertClientProfile();
    const clientB = await insertClientProfile();
    await insertAuthorisedUser({ clientId: clientA, iamUserId, status: "active" });
    await insertAuthorisedUser({ clientId: clientB, iamUserId, status: "active" });
    const count = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_user WHERE iam_user_id = $1 AND status = 'active'`, [iamUserId]);
    expect(Number(count.rows[0].count)).toBe(2);
  });

  it("F. the SAME iam_user_id + SAME client can have only ONE active row — a second violates the partial unique index", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_f_" + randomUUID();
    const clientId = await insertClientProfile();
    await insertAuthorisedUser({ clientId, iamUserId, status: "active" });
    await expect(insertAuthorisedUser({ clientId, iamUserId, status: "active" })).rejects.toMatchObject({ code: "23505", constraint: "idx_clt1_authorised_user_one_active_per_iam_client" });
  });

  it("G. a SUSPENDED row and an ACTIVE row for the SAME iam_user_id + client coexist without conflict", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_g_" + randomUUID();
    const clientId = await insertClientProfile();
    await insertAuthorisedUser({ clientId, iamUserId, status: "suspended" });
    await insertAuthorisedUser({ clientId, iamUserId, status: "active" });
    const rows = await verifyPool.query(`SELECT status FROM clt1.authorised_user WHERE iam_user_id = $1 AND client_id = $2 ORDER BY status`, [iamUserId, clientId]);
    expect(rows.rows.map((r) => r.status).sort()).toEqual(["active", "suspended"]);
  });

  it("H. an INACTIVE row and an ACTIVE row for the SAME iam_user_id + client coexist without conflict", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_h_" + randomUUID();
    const clientId = await insertClientProfile();
    await insertAuthorisedUser({ clientId, iamUserId, status: "inactive" });
    await insertAuthorisedUser({ clientId, iamUserId, status: "active" });
    const rows = await verifyPool.query(`SELECT status FROM clt1.authorised_user WHERE iam_user_id = $1 AND client_id = $2 ORDER BY status`, [iamUserId, clientId]);
    expect(rows.rows.map((r) => r.status).sort()).toEqual(["active", "inactive"]);
  });

  it("I. a REVOKED row and an ACTIVE row for the SAME iam_user_id + client coexist without conflict", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_i_" + randomUUID();
    const clientId = await insertClientProfile();
    await insertAuthorisedUser({ clientId, iamUserId, status: "revoked" });
    await insertAuthorisedUser({ clientId, iamUserId, status: "active" });
    const rows = await verifyPool.query(`SELECT status FROM clt1.authorised_user WHERE iam_user_id = $1 AND client_id = $2 ORDER BY status`, [iamUserId, clientId]);
    expect(rows.rows.map((r) => r.status).sort()).toEqual(["active", "revoked"]);
  });

  it("J. iam_user_id can be persisted on authorised_user_decision_request independently of authorised_user", async () => {
    if (!schemaReady) return;
    const clientId = await insertClientProfile();
    const iamUserId = "user_j_" + randomUUID();
    const decisionId = "clt1aud_mig067_" + randomUUID();
    await verifyPool.query(
      `INSERT INTO clt1.authorised_user_decision_request (decision_id, client_id, decision_type, user_reference, role, requested_by, status, payload_hash, iam_user_id)
       VALUES ($1, $2, 'add', 'x@example.com', 'viewer', 'staff_1', 'requested', 'sha256:x', $3)`,
      [decisionId, clientId, iamUserId],
    );
    const row = await verifyPool.query(`SELECT iam_user_id FROM clt1.authorised_user_decision_request WHERE decision_id = $1`, [decisionId]);
    expect(row.rows[0].iam_user_id).toBe(iamUserId);
  });

  it("K. DOWN refuses independently when ONLY authorised_user has a bound row (decision_request clean)", async () => {
    if (!schemaReady) return;
    // Isolate from residue left by tests D-J (deliberately bound rows never cleaned there, since
    // those tests are proving coexistence, not exercising DOWN) — this test's own claim is about
    // exactly ONE bound row in authorised_user with decision_request fully clean.
    await verifyPool.query(`UPDATE clt1.authorised_user SET iam_user_id = NULL WHERE iam_user_id IS NOT NULL`);
    await verifyPool.query(`UPDATE clt1.authorised_user_decision_request SET iam_user_id = NULL WHERE iam_user_id IS NOT NULL`);

    const clientId = await insertClientProfile();
    await insertAuthorisedUser({ clientId, iamUserId: "user_k_" + randomUUID(), status: "active" });
    await expect(migrateDown(1)).rejects.toThrow(/clt1\.authorised_user contains an IAM-bound membership/);
    expect(await migrationHead()).toBe("067_clt1_authorised_user_iam_binding");
    const idx = await verifyPool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'clt1' AND indexname = 'idx_clt1_authorised_user_one_active_per_iam_client'`);
    expect(idx.rows, "a REFUSED down migration must never have dropped the index").toHaveLength(1);
    // Clean up this test's own bound row so it does not interfere with subsequent DOWN tests.
    await verifyPool.query(`UPDATE clt1.authorised_user SET iam_user_id = NULL WHERE client_id = $1`, [clientId]);
  }, 30_000);

  it("L. DOWN refuses independently when ONLY authorised_user_decision_request has a bound row (authorised_user clean)", async () => {
    if (!schemaReady) return;
    // Full global isolation again — authorised_user must be genuinely clean for this scenario to
    // isolate the decision_request-only refusal condition.
    await verifyPool.query(`UPDATE clt1.authorised_user SET iam_user_id = NULL WHERE iam_user_id IS NOT NULL`);
    await verifyPool.query(`UPDATE clt1.authorised_user_decision_request SET iam_user_id = NULL WHERE iam_user_id IS NOT NULL`);

    const clientId = await insertClientProfile();
    const decisionId = "clt1aud_mig067_L_" + randomUUID();
    await verifyPool.query(
      `INSERT INTO clt1.authorised_user_decision_request (decision_id, client_id, decision_type, user_reference, role, requested_by, status, payload_hash, iam_user_id)
       VALUES ($1, $2, 'add', 'x@example.com', 'viewer', 'staff_1', 'requested', 'sha256:x', $3)`,
      [decisionId, clientId, "user_l_" + randomUUID()],
    );
    await expect(migrateDown(1)).rejects.toThrow(/clt1\.authorised_user_decision_request contains an IAM-bound decision request/);
    expect(await migrationHead()).toBe("067_clt1_authorised_user_iam_binding");
    const idx = await verifyPool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'clt1' AND indexname = 'idx_clt1_authorised_user_one_active_per_iam_client'`);
    expect(idx.rows, "a REFUSED down migration must never have dropped the index").toHaveLength(1);
    // Clean up so the fully-clean DOWN test below is genuinely clean.
    await verifyPool.query(`UPDATE clt1.authorised_user_decision_request SET iam_user_id = NULL WHERE decision_id = $1`, [decisionId]);
  }, 30_000);

  it("M. evidence retained: rows inserted across tests A-J still exist (K/L's own bound rows were deliberately nulled by the test itself, not by DOWN)", async () => {
    if (!schemaReady) return;
    const count = await verifyPool.query(`SELECT count(*) FROM clt1.authorised_user`);
    expect(Number(count.rows[0].count)).toBeGreaterThan(0);
  });

  it("N. a fully clean schema (no bound rows anywhere) rolls DOWN successfully, then re-UP succeeds cleanly", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`UPDATE clt1.authorised_user SET iam_user_id = NULL WHERE iam_user_id IS NOT NULL`);
    await verifyPool.query(`UPDATE clt1.authorised_user_decision_request SET iam_user_id = NULL WHERE iam_user_id IS NOT NULL`);

    await migrateDown(1);
    expect(await migrationHead()).toBe("066_wlt1_limits");
    const cols = await verifyPool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'clt1' AND table_name IN ('authorised_user','authorised_user_decision_request') AND column_name = 'iam_user_id'`,
    );
    expect(cols.rows).toHaveLength(0);
    const idx = await verifyPool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'clt1' AND indexname = 'idx_clt1_authorised_user_one_active_per_iam_client'`);
    expect(idx.rows).toHaveLength(0);

    await migrateTo(1);
    expect(await migrationHead()).toBe("067_clt1_authorised_user_iam_binding");
    const colsAfter = await verifyPool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'clt1' AND table_name IN ('authorised_user','authorised_user_decision_request') AND column_name = 'iam_user_id'`,
    );
    expect(colsAfter.rows).toHaveLength(2);
  }, 60_000);
});
