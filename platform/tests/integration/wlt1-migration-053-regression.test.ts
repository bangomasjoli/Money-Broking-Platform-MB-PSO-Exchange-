/**
 * WLT-01 Phase 3A-1 — committed automated regression coverage for
 * `infra/migrations/053_wlt1_proof_of_control.cjs`'s own up/down/re-up and evidence-preserving
 * down behaviour, from day one (per the migration-050 regression lesson — never repeat the
 * Phase 2B manual-only coverage gap). Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * Mirrors `tests/integration/wlt1-migration-052-regression.test.ts`'s own established pattern
 * exactly: a PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's
 * programmatic `runner()` API, dropped in `afterAll`. Migration 053 itself is never modified —
 * this file only drives the migration runner and independently verifies real database state via
 * direct SQL after every step.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only. Grant-boundary
 * behaviour (least-privilege UPDATE column scoping, DELETE/TRUNCATE/DDL denial, restricted-role
 * identity) is covered separately in `wlt1-poc-grants-private.test.ts`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");

/** Exactly 52 migration files precede `053_wlt1_proof_of_control.cjs`. */
const MIGRATIONS_THROUGH_052 = 52;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig053_regr_it_${randomBytes(6).toString("hex")}`;

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

/** No-op — expected during `DROP DATABASE ... WITH (FORCE)` teardown, which administratively
 * terminates any remaining backend on the dropped database. Without this listener `pg` surfaces
 * that expected disconnect as an unhandled exception. Never swallows an assertion or test-body
 * error — those propagate normally through the awaited query/test promise chain, not through this
 * listener. */
function ignoreExpectedDisconnect(): void {
  /* intentionally empty */
}

async function migrationHead(): Promise<string | undefined> {
  const r = await verifyPool.query(`SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1`);
  return r.rows[0]?.name;
}

async function tableCount(): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1'`);
  return Number(r.rows[0]?.n);
}

async function columns(): Promise<Array<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null; character_maximum_length: number | null }>> {
  const r = await verifyPool.query(
    `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
       FROM information_schema.columns
      WHERE table_schema = 'wlt1' AND table_name = 'proof_of_control'
      ORDER BY ordinal_position`,
  );
  return r.rows;
}

async function insertPendingReviewDestination(destinationId: string): Promise<void> {
  await verifyPool.query(
    `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, 'pending_review')`,
    [destinationId, "clt1client_mig053regr", "hash_" + randomUUID()],
  );
}

function issuedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    challenge_id: "wlt1pocchal_" + randomUUID(),
    client_id: "clt1client_mig053regr",
    chain: "ethereum",
    network: "mainnet",
    canonical_address: "0x6acb427ACF0724871b29023428f65AEb3B5d1255",
    address_hash: "sha256:" + "ab".repeat(32),
    proof_method: "signed_message",
    verification_scheme: "eip191_personal_sign",
    message_format_version: 1,
    domain_environment: "dev",
    nonce: "cd".repeat(32),
    message_hash: "ef".repeat(32),
    issued_at_utc: new Date().toISOString(),
    expires_at_utc: new Date(Date.now() + 15 * 60_000).toISOString(),
    ...overrides,
  };
}

async function insertProofOfControl(destinationId: string, row: Record<string, unknown>): Promise<void> {
  const columnNames = Object.keys(row);
  const placeholders = columnNames.map((_, i) => `$${i + 2}`);
  await verifyPool.query(
    `INSERT INTO wlt1.proof_of_control (destination_id, ${columnNames.join(", ")}) VALUES ($1, ${placeholders.join(", ")})`,
    [destinationId, ...columnNames.map((c) => row[c])],
  );
}

describe("WLT-01 Phase 3A-1: migration 053 up/down/re-up + evidence-preserving down (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig053-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig053-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig053-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 52 migrations reaches head 052_wlt1_screening_address_hash_width, no proof_of_control table yet", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_052, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("052_wlt1_screening_address_hash_width");
    expect(await tableCount()).toBe(6);
  }, 60_000);

  it("B. migrating up one more migration reaches head 053 with wlt1.proof_of_control created — exactly 24 physical columns, no unrelated schema drift", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("053_wlt1_proof_of_control");
    expect(await tableCount()).toBe(7);

    const cols = await columns();
    expect(cols.map((c) => c.column_name)).toEqual([
      "id",
      "challenge_id",
      "destination_id",
      "client_id",
      "chain",
      "network",
      "canonical_address",
      "address_hash",
      "proof_method",
      "verification_scheme",
      "message_format_version",
      "domain_environment",
      "nonce",
      "message_hash",
      "verification_status",
      "attempt_count",
      "signature_hash",
      "recovered_address",
      "last_failure_reason_code",
      "issued_at_utc",
      "expires_at_utc",
      "verified_at_utc",
      "created_at_utc",
      "updated_at_utc",
    ]);
    expect(cols).toHaveLength(24);
  }, 60_000);

  it("C. column types/nullability/widths match the enumerated schema exactly", async () => {
    if (!schemaReady) return;
    const cols = await columns();
    const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]));

    expect(byName.id?.is_nullable).toBe("NO");
    expect(byName.challenge_id?.data_type).toBe("character varying");
    expect(Number(byName.challenge_id?.character_maximum_length)).toBe(64);
    expect(byName.challenge_id?.is_nullable).toBe("NO");
    expect(byName.destination_id?.is_nullable).toBe("NO");
    expect(Number(byName.destination_id?.character_maximum_length)).toBe(64);
    expect(byName.client_id?.is_nullable).toBe("NO");
    expect(byName.chain?.is_nullable).toBe("NO");
    expect(byName.network?.is_nullable).toBe("NO");
    expect(Number(byName.canonical_address?.character_maximum_length)).toBe(128);
    expect(Number(byName.address_hash?.character_maximum_length)).toBe(128);
    expect(byName.proof_method?.is_nullable).toBe("NO");
    expect(byName.verification_scheme?.is_nullable).toBe("NO");
    expect(byName.message_format_version?.data_type).toBe("smallint");
    expect(byName.message_format_version?.is_nullable).toBe("NO");
    expect(byName.domain_environment?.is_nullable).toBe("NO");
    expect(byName.nonce?.is_nullable).toBe("NO");
    expect(byName.message_hash?.is_nullable).toBe("NO");
    expect(byName.verification_status?.is_nullable).toBe("NO");
    expect(byName.verification_status?.column_default).toContain("issued");
    expect(byName.attempt_count?.data_type).toBe("integer");
    expect(byName.attempt_count?.column_default).toContain("0");
    expect(byName.signature_hash?.is_nullable).toBe("YES");
    expect(byName.recovered_address?.is_nullable).toBe("YES");
    expect(byName.last_failure_reason_code?.is_nullable).toBe("YES");
    expect(byName.issued_at_utc?.is_nullable).toBe("NO");
    expect(byName.expires_at_utc?.is_nullable).toBe("NO");
    expect(byName.verified_at_utc?.is_nullable).toBe("YES");
    expect(byName.created_at_utc?.is_nullable).toBe("NO");
    expect(byName.updated_at_utc?.is_nullable).toBe("NO");
  });

  it("D. CHECK constraints: proof_method / verification_scheme (3A-only) / message_format_version / domain_environment / verification_status all reject an out-of-set value", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_053chk_" + randomUUID();
    await insertPendingReviewDestination(destinationId);

    await expect(insertProofOfControl(destinationId, issuedRow({ proof_method: "microdeposit" }))).rejects.toThrow(/violates check constraint/);
    await expect(insertProofOfControl(destinationId, issuedRow({ verification_scheme: "tron_personal_sign" }))).rejects.toThrow(/violates check constraint/);
    await expect(insertProofOfControl(destinationId, issuedRow({ message_format_version: 2 }))).rejects.toThrow(/violates check constraint/);
    await expect(insertProofOfControl(destinationId, issuedRow({ domain_environment: "sandbox" }))).rejects.toThrow(/violates check constraint/);
    await expect(insertProofOfControl(destinationId, issuedRow({ verification_status: "active" }))).rejects.toThrow(/violates check constraint/);

    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("E. verified-row-integrity CHECK: a 'verified' row without signature_hash/recovered_address/verified_at_utc (or WITH a non-null last_failure_reason_code) is rejected; a fully-evidenced verified row is accepted", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_053integ_" + randomUUID();
    await insertPendingReviewDestination(destinationId);

    await expect(insertProofOfControl(destinationId, issuedRow({ verification_status: "verified" }))).rejects.toThrow(/violates check constraint/);
    await expect(
      insertProofOfControl(
        destinationId,
        issuedRow({ verification_status: "verified", signature_hash: "aa".repeat(32), recovered_address: "0x6acb427ACF0724871b29023428f65AEb3B5d1255", verified_at_utc: new Date().toISOString() }),
      ),
    ).resolves.toBeUndefined();

    const secondDestinationId = "wlt1dest_053integ2_" + randomUUID();
    await insertPendingReviewDestination(secondDestinationId);
    await expect(
      insertProofOfControl(secondDestinationId, {
        ...issuedRow({
          verification_status: "verified",
          signature_hash: "bb".repeat(32),
          recovered_address: "0x6acb427ACF0724871b29023428f65AEb3B5d1255",
          verified_at_utc: new Date().toISOString(),
        }),
        last_failure_reason_code: "recovery_failed",
      }),
    ).rejects.toThrow(/violates check constraint/);

    await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id = ANY($1)`, [[destinationId, secondDestinationId]]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = ANY($1)`, [[destinationId, secondDestinationId]]);
  });

  it("F. partial unique index: at most one 'issued' row per destination; a second 'issued' row for the SAME destination is rejected", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_053issued_" + randomUUID();
    await insertPendingReviewDestination(destinationId);
    await insertProofOfControl(destinationId, issuedRow());
    await expect(insertProofOfControl(destinationId, issuedRow())).rejects.toThrow(/duplicate key value violates unique constraint/);

    await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("G. partial unique index: at most one 'verified' row per destination (Model A); a second verified row for the SAME destination is rejected even under a DIFFERENT challenge_id", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_053verified_" + randomUUID();
    await insertPendingReviewDestination(destinationId);
    const evidence = { verification_status: "verified", signature_hash: "cc".repeat(32), recovered_address: "0x6acb427ACF0724871b29023428f65AEb3B5d1255", verified_at_utc: new Date().toISOString() };
    await insertProofOfControl(destinationId, issuedRow(evidence));
    await expect(insertProofOfControl(destinationId, issuedRow(evidence))).rejects.toThrow(/duplicate key value violates unique constraint/);

    await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("H. FK destination_id -> wlt1.destination(destination_id) is enforced — an unknown destination_id is rejected", async () => {
    if (!schemaReady) return;
    await expect(insertProofOfControl("wlt1dest_053nonexistent_" + randomUUID(), issuedRow())).rejects.toThrow(/violates foreign key constraint/);
  });

  it("I. challenge_id UNIQUE is enforced", async () => {
    if (!schemaReady) return;
    const destA = "wlt1dest_053uniqA_" + randomUUID();
    const destB = "wlt1dest_053uniqB_" + randomUUID();
    await insertPendingReviewDestination(destA);
    await insertPendingReviewDestination(destB);
    const sharedChallengeId = "wlt1pocchal_shared_" + randomUUID();
    await insertProofOfControl(destA, issuedRow({ challenge_id: sharedChallengeId }));
    await expect(insertProofOfControl(destB, issuedRow({ challenge_id: sharedChallengeId }))).rejects.toThrow(/duplicate key value violates unique constraint/);

    await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id = ANY($1)`, [[destA, destB]]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = ANY($1)`, [[destA, destB]]);
  });

  it("J. expected indexes exist: one-issued partial unique, one-verified partial unique, destination_id+verification_status plain index", async () => {
    if (!schemaReady) return;
    const idx = await verifyPool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'proof_of_control' ORDER BY indexname`);
    const names = idx.rows.map((r) => r.indexname);
    expect(names).toContain("idx_wlt1_proof_of_control_one_issued");
    expect(names).toContain("idx_wlt1_proof_of_control_one_verified");
    expect(names).toContain("idx_wlt1_proof_of_control_destination_status");
    const oneIssued = idx.rows.find((r) => r.indexname === "idx_wlt1_proof_of_control_one_issued");
    expect(oneIssued.indexdef).toMatch(/UNIQUE/);
    expect(oneIssued.indexdef).toMatch(/verification_status\)::text = 'issued'::text/);
    const oneVerified = idx.rows.find((r) => r.indexname === "idx_wlt1_proof_of_control_one_verified");
    expect(oneVerified.indexdef).toMatch(/UNIQUE/);
    expect(oneVerified.indexdef).toMatch(/verification_status\)::text = 'verified'::text/);
  });

  let evidenceDestinationId: string;

  it("K. with a 'verified' row present, down is refused; head/table/row are preserved", async () => {
    if (!schemaReady) return;
    evidenceDestinationId = "wlt1dest_053down_" + randomUUID();
    await insertPendingReviewDestination(evidenceDestinationId);
    await insertProofOfControl(
      evidenceDestinationId,
      issuedRow({ verification_status: "verified", signature_hash: "dd".repeat(32), recovered_address: "0x6acb427ACF0724871b29023428f65AEb3B5d1255", verified_at_utc: new Date().toISOString() }),
    );

    await expect(
      runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog }),
    ).rejects.toThrow(/verified proof/);

    expect(await migrationHead()).toBe("053_wlt1_proof_of_control");
    expect(await tableCount()).toBe(7);
    const stillThere = await verifyPool.query(`SELECT verification_status FROM wlt1.proof_of_control WHERE destination_id = $1`, [evidenceDestinationId]);
    expect(stillThere.rows).toEqual([{ verification_status: "verified" }]);
  }, 60_000);

  it("L. controlled cleanup of the migration-test fixtures (privileged test setup, not a runtime DELETE grant)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id = $1`, [evidenceDestinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [evidenceDestinationId]);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE verification_status = 'verified'`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it("M. with no verified evidence remaining, down succeeds cleanly back to head 052 — table dropped", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("052_wlt1_screening_address_hash_width");
    expect(await tableCount()).toBe(6);
  }, 60_000);

  it("N. re-up restores the exact Phase 3A-1 schema: head 053, 24 columns, table recreated cleanly", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("053_wlt1_proof_of_control");
    expect(await tableCount()).toBe(7);
    const cols = await columns();
    expect(cols).toHaveLength(24);
  }, 60_000);
});
