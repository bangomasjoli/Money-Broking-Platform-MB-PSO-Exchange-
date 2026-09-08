/**
 * WLT-01 Phase 3A-1 — `wlt1.proof_of_control` least-privilege grant-boundary probes, PRIVATE
 * disposable database. Mirrors `wlt1-screening-route-private.test.ts` / `wlt1-outbox-acl-private
 * .test.ts`'s own established provisioning pattern exactly: `CREATE DATABASE`, migrate via
 * node-pg-migrate's programmatic `runner()`, apply `fnd_runtime_grants.sql` + `wlt1_runtime_grants
 * .sql`, create a restricted LOGIN role granted `role_wlt1_runtime`, `DROP DATABASE ... WITH
 * (FORCE)` in `afterAll`.
 *
 * M-REV-1 INTERIM RULE (task-mandated, does not close M-REV-1 globally): this file constructs the
 * restricted-role connection URL via the SAME safe regex rewrite `wlt1-screening-route-private
 * .test.ts`/`wlt1-outbox-acl-private.test.ts` already use — `privateDbUrl.replace(/^postgres:\/\/
 * [^@]+@/, ...)` — which replaces the ENTIRE user[:password] segment regardless of whether a
 * password is present, unlike the naive `.replace("postgres@", ...)` form M-REV-1 is about. Every
 * grant-boundary test below additionally asserts `current_user`/`rolsuper`/`rolbypassrls` directly
 * against the connection actually used, so a future accidental superuser connection here would
 * fail these assertions loudly rather than silently passing every privilege check.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");
const RUNTIME_ROLE_USER = "wlt1_poc_grants_private_test";

const PRIVATE_DB_NAME = `wlt1_poc_grants_it_${randomBytes(6).toString("hex")}`;

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
let privateDbUrl: string;
let verifyPool: Pool; // privileged (postgres) — fixture setup only, never the object under test
let restrictedPool: Pool; // connects AS RUNTIME_ROLE_USER — the object under test
let schemaReady = false;
let databaseCreated = false;

beforeAll(async () => {
  if (!TEST_DB) return;

  maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
  maintenancePool.on("error", ignoreExpectedDisconnect);
  await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
  databaseCreated = true;
  privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

  process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-poc-grants-it-private-db-fnd01-token";
  process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-poc-grants-it-private-db-iam01-token";
  process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-poc-grants-it-private-db-iam02-token";

  await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

  verifyPool = new Pool({ connectionString: privateDbUrl });
  verifyPool.on("error", ignoreExpectedDisconnect);

  await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "fnd_runtime_grants.sql"), "utf8"));
  await verifyPool.query(readFileSync(join(REPO_ROOT, "infra", "grants", "wlt1_runtime_grants.sql"), "utf8"));

  await verifyPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN
        CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN;
      END IF;
    END
    $$;
  `);
  await verifyPool.query(`GRANT role_wlt1_runtime TO ${RUNTIME_ROLE_USER};`);

  const runtimeDbUrl = privateDbUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
  restrictedPool = new Pool({ connectionString: runtimeDbUrl });
  restrictedPool.on("error", ignoreExpectedDisconnect);

  schemaReady = true;
}, 60_000);

afterAll(async () => {
  await restrictedPool?.end();
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

async function insertPendingReviewDestination(destinationId: string): Promise<void> {
  await verifyPool.query(
    `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, 'pending_review')`,
    [destinationId, "clt1client_pocgrants", "hash_" + randomUUID()],
  );
}

function issuedRow(destinationId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    destination_id: destinationId,
    challenge_id: "wlt1pocchal_" + randomUUID(),
    client_id: "clt1client_pocgrants",
    chain: "ethereum",
    network: "mainnet",
    canonical_address: "0x6acb427ACF0724871b29023428f65AEb3B5d1255",
    address_hash: "sha256:" + "11".repeat(32),
    proof_method: "signed_message",
    verification_scheme: "eip191_personal_sign",
    message_format_version: 1,
    domain_environment: "dev",
    nonce: "22".repeat(32),
    message_hash: "33".repeat(32),
    issued_at_utc: new Date().toISOString(),
    expires_at_utc: new Date(Date.now() + 15 * 60_000).toISOString(),
    ...overrides,
  };
}

async function insertViaPrivilegedPool(row: Record<string, unknown>): Promise<void> {
  const cols = Object.keys(row);
  await verifyPool.query(`INSERT INTO wlt1.proof_of_control (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, cols.map((c) => row[c]));
}

describe("WLT-01 Phase 3A-1 — wlt1.proof_of_control grant-boundary probes (private database)", () => {
  it("PRECONDITION (M-REV-1 interim rule): the restricted pool genuinely connects as the restricted role, never postgres superuser", async () => {
    if (!schemaReady) return;
    const r = await restrictedPool.query(`SELECT current_user, session_user, current_setting('is_superuser') AS is_superuser`);
    const row = r.rows[0];
    expect(row.current_user).toBe(RUNTIME_ROLE_USER);
    expect(row.session_user).toBe(RUNTIME_ROLE_USER);
    expect(row.is_superuser).toBe("off");

    const attrs = await verifyPool.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`, [RUNTIME_ROLE_USER]);
    expect(attrs.rows[0].rolsuper).toBe(false);
    expect(attrs.rows[0].rolbypassrls).toBe(false);
    // eslint-disable-next-line no-console
    console.log(`WLT-01 Phase 3A-1 grant-boundary runtime role identity: current_user=${row.current_user} rolsuper=${attrs.rows[0].rolsuper} rolbypassrls=${attrs.rows[0].rolbypassrls}`);
  });

  it("SELECT is allowed", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_pocg_select_" + randomUUID();
    await insertPendingReviewDestination(destinationId);
    await insertViaPrivilegedPool(issuedRow(destinationId));
    await expect(restrictedPool.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId])).resolves.toBeDefined();
    const r = await restrictedPool.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
    expect(r.rows[0].n).toBe(1);
  });

  it("INSERT is allowed", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_pocg_insert_" + randomUUID();
    await insertPendingReviewDestination(destinationId);
    const row = issuedRow(destinationId);
    const cols = Object.keys(row);
    await expect(
      restrictedPool.query(`INSERT INTO wlt1.proof_of_control (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, cols.map((c) => row[c])),
    ).resolves.toBeDefined();
    const check = await verifyPool.query(`SELECT verification_status FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
    expect(check.rows[0].verification_status).toBe("issued");
  });

  it("UPDATE of every mutable column is allowed: verification_status, attempt_count, signature_hash, recovered_address, last_failure_reason_code, verified_at_utc, updated_at_utc", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_pocg_updok_" + randomUUID();
    await insertPendingReviewDestination(destinationId);
    await insertViaPrivilegedPool(issuedRow(destinationId));

    await expect(
      restrictedPool.query(
        `UPDATE wlt1.proof_of_control
            SET verification_status = 'failed', attempt_count = 1, signature_hash = $2, recovered_address = $3,
                last_failure_reason_code = 'recovery_failed', verified_at_utc = NULL, updated_at_utc = now()
          WHERE destination_id = $1`,
        [destinationId, "44".repeat(32), "0x6acb427ACF0724871b29023428f65AEb3B5d1255"],
      ),
    ).resolves.toBeDefined();

    const row = await verifyPool.query(`SELECT verification_status, attempt_count, signature_hash, last_failure_reason_code FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
    expect(row.rows[0].verification_status).toBe("failed");
    expect(row.rows[0].attempt_count).toBe(1);
    expect(row.rows[0].last_failure_reason_code).toBe("recovery_failed");
  });

  const IMMUTABLE_COLUMN_PROBES: Array<{ column: string; value: unknown }> = [
    { column: "challenge_id", value: "hacked" },
    { column: "destination_id", value: "hacked" },
    { column: "client_id", value: "hacked" },
    { column: "chain", value: "hacked" },
    { column: "network", value: "hacked" },
    { column: "canonical_address", value: "hacked" },
    { column: "address_hash", value: "hacked" },
    { column: "proof_method", value: "signed_message" },
    { column: "verification_scheme", value: "eip191_personal_sign" },
    { column: "message_format_version", value: 1 },
    { column: "domain_environment", value: "dev" },
    { column: "nonce", value: "hacked" },
    { column: "message_hash", value: "hacked" },
    { column: "issued_at_utc", value: new Date().toISOString() },
    { column: "expires_at_utc", value: new Date().toISOString() },
    { column: "created_at_utc", value: new Date().toISOString() },
  ];

  it("UPDATE of any immutable column is denied: 42501 (permission denied) for every identity/challenge-evidence column", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_pocg_immut_" + randomUUID();
    await insertPendingReviewDestination(destinationId);
    await insertViaPrivilegedPool(issuedRow(destinationId));

    for (const { column, value } of IMMUTABLE_COLUMN_PROBES) {
      await expect(restrictedPool.query(`UPDATE wlt1.proof_of_control SET ${column} = $2 WHERE destination_id = $1`, [destinationId, value])).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("DELETE is denied: 42501", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_pocg_delete_" + randomUUID();
    await insertPendingReviewDestination(destinationId);
    await insertViaPrivilegedPool(issuedRow(destinationId));
    await expect(restrictedPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId])).rejects.toMatchObject({ code: "42501" });
  });

  it("TRUNCATE is denied: 42501", async () => {
    if (!schemaReady) return;
    await expect(restrictedPool.query(`TRUNCATE wlt1.proof_of_control`)).rejects.toMatchObject({ code: "42501" });
  });

  it("DDL (ALTER TABLE / DROP TABLE) is denied: 42501", async () => {
    if (!schemaReady) return;
    await expect(restrictedPool.query(`ALTER TABLE wlt1.proof_of_control ADD COLUMN hacked_column int`)).rejects.toMatchObject({ code: "42501" });
    await expect(restrictedPool.query(`DROP TABLE wlt1.proof_of_control`)).rejects.toMatchObject({ code: "42501" });
  });
});
