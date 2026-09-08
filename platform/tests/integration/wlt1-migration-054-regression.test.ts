/**
 * WLT-01 Phase 3B — committed automated regression coverage for
 * `infra/migrations/054_wlt1_proof_of_control_tron_scheme.cjs`'s own up/down/re-up and
 * evidence-preserving down behaviour, from day one (mirrors migration 053's own established
 * pattern — never repeat the Phase 2B manual-only coverage gap). Self-skips unless
 * `TEST_DATABASE_URL` is set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's
 * programmatic `runner()` API, dropped in `afterAll`. Migration 054 itself is never modified —
 * this file only drives the migration runner and independently verifies real database state via
 * direct SQL after every step.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only. Grant-boundary
 * behaviour is covered separately in `wlt1-poc-grants-private.test.ts` (unchanged by Phase 3B —
 * migration 054 adds no new column, so no new grant is needed).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");

/** Exactly 53 migration files precede `054_wlt1_proof_of_control_tron_scheme.cjs`. */
const MIGRATIONS_THROUGH_053 = 53;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig054_regr_it_${randomBytes(6).toString("hex")}`;

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

async function columnNames(): Promise<string[]> {
  const r = await verifyPool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'proof_of_control' ORDER BY ordinal_position`,
  );
  return r.rows.map((row) => row.column_name);
}

async function constraintDef(name: string): Promise<string | undefined> {
  const r = await verifyPool.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.proof_of_control'::regclass AND conname = $1`, [name]);
  return r.rows[0]?.def;
}

async function insertPendingReviewDestination(destinationId: string): Promise<void> {
  await verifyPool.query(
    `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, 'pending_review')`,
    [destinationId, "clt1client_mig054regr", "hash_" + randomUUID()],
  );
}

function evmRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    challenge_id: "wlt1pocchal_" + randomUUID(),
    client_id: "clt1client_mig054regr",
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

function tronRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    challenge_id: "wlt1pocchal_" + randomUUID(),
    client_id: "clt1client_mig054regr",
    chain: "tron",
    network: "mainnet",
    canonical_address: "TBVnfLnh9xL2RcUWziezQFL5P6Z4HekyRC",
    address_hash: "sha256:" + "12".repeat(32),
    proof_method: "signed_message",
    verification_scheme: "tron_personal_sign",
    message_format_version: 1,
    domain_environment: "dev",
    nonce: "34".repeat(32),
    message_hash: "56".repeat(32),
    issued_at_utc: new Date().toISOString(),
    expires_at_utc: new Date(Date.now() + 15 * 60_000).toISOString(),
    ...overrides,
  };
}

async function insertProofOfControl(destinationId: string, row: Record<string, unknown>): Promise<void> {
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 2}`);
  await verifyPool.query(`INSERT INTO wlt1.proof_of_control (destination_id, ${cols.join(", ")}) VALUES ($1, ${placeholders.join(", ")})`, [destinationId, ...cols.map((c) => row[c])]);
}

describe("WLT-01 Phase 3B: migration 054 up/down/re-up + evidence-preserving down (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig054-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig054-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig054-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 53 migrations reaches head 053_wlt1_proof_of_control; verification_scheme CHECK still EVM-only", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_053, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("053_wlt1_proof_of_control");
    expect(await tableCount()).toBe(7);
    expect(await constraintDef("proof_of_control_verification_scheme_check")).toMatch(/'eip191_personal_sign'/);
    expect(await constraintDef("proof_of_control_verification_scheme_check")).not.toMatch(/tron_personal_sign/);
  }, 60_000);

  it("B. migrating up one more migration reaches head 054 — verification_scheme CHECK now permits BOTH schemes; table count / 24 columns / proof_method CHECK all unchanged", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("054_wlt1_proof_of_control_tron_scheme");
    expect(await tableCount()).toBe(7);

    const def = await constraintDef("proof_of_control_verification_scheme_check");
    expect(def).toMatch(/eip191_personal_sign/);
    expect(def).toMatch(/tron_personal_sign/);

    // proof_method CHECK untouched — Phase 3B introduces no new proof_method.
    expect(await constraintDef("proof_of_control_proof_method_check")).toMatch(/'signed_message'/);

    const cols = await columnNames();
    expect(cols).toHaveLength(24);
    expect(cols).not.toContain("tron_signature");
    expect(cols).not.toContain("tron_evidence");
  }, 60_000);

  it("C. eip191_personal_sign insert still accepted after 054", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_054evm_" + randomUUID();
    await insertPendingReviewDestination(destinationId);
    await expect(insertProofOfControl(destinationId, evmRow())).resolves.toBeUndefined();
    await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("D. tron_personal_sign insert now accepted (was rejected before 054)", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_054tron_" + randomUUID();
    await insertPendingReviewDestination(destinationId);
    await expect(insertProofOfControl(destinationId, tronRow())).resolves.toBeUndefined();
    await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("E. any third scheme is still rejected", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_054third_" + randomUUID();
    await insertPendingReviewDestination(destinationId);
    await expect(insertProofOfControl(destinationId, evmRow({ verification_scheme: "solana_personal_sign" }))).rejects.toThrow(/violates check constraint/);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("F. indexes/other constraints from 053 are completely unchanged after 054", async () => {
    if (!schemaReady) return;
    const idx = await verifyPool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'proof_of_control' ORDER BY indexname`);
    const names = idx.rows.map((r) => r.indexname);
    expect(names).toContain("idx_wlt1_proof_of_control_one_issued");
    expect(names).toContain("idx_wlt1_proof_of_control_one_verified");
    expect(names).toContain("idx_wlt1_proof_of_control_destination_status");
    expect(await constraintDef("chk_wlt1_proof_of_control_verified_integrity")).toMatch(/verification_status/);
  });

  let tronEvidenceDestinationId: string;

  it("G. with a tron_personal_sign row present, down is refused; head/table/row are preserved", async () => {
    if (!schemaReady) return;
    tronEvidenceDestinationId = "wlt1dest_054down_" + randomUUID();
    await insertPendingReviewDestination(tronEvidenceDestinationId);
    await insertProofOfControl(tronEvidenceDestinationId, tronRow());

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /tron_personal_sign/,
    );

    expect(await migrationHead()).toBe("054_wlt1_proof_of_control_tron_scheme");
    expect(await tableCount()).toBe(7);
    const stillThere = await verifyPool.query(`SELECT verification_scheme FROM wlt1.proof_of_control WHERE destination_id = $1`, [tronEvidenceDestinationId]);
    expect(stillThere.rows).toEqual([{ verification_scheme: "tron_personal_sign" }]);
  }, 60_000);

  it("H. controlled cleanup of the TRON evidence fixture (privileged test setup, not a runtime DELETE grant)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.proof_of_control WHERE destination_id = $1`, [tronEvidenceDestinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [tronEvidenceDestinationId]);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.proof_of_control WHERE verification_scheme = 'tron_personal_sign'`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it("I. with no TRON evidence remaining, down succeeds cleanly back to head 053 — CHECK narrowed back to EVM-only exactly", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("053_wlt1_proof_of_control");
    expect(await tableCount()).toBe(7);
    const def = await constraintDef("proof_of_control_verification_scheme_check");
    expect(def).toMatch(/'eip191_personal_sign'/);
    expect(def).not.toMatch(/tron_personal_sign/);
  }, 60_000);

  it("J. re-up restores the exact Phase 3B widened CHECK: head 054, both schemes accepted again, 24 columns unchanged", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("054_wlt1_proof_of_control_tron_scheme");
    expect(await tableCount()).toBe(7);
    const def = await constraintDef("proof_of_control_verification_scheme_check");
    expect(def).toMatch(/eip191_personal_sign/);
    expect(def).toMatch(/tron_personal_sign/);
    expect(await columnNames()).toHaveLength(24);
  }, 60_000);
});
