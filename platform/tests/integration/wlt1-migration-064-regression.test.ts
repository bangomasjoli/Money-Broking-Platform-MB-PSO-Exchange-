/**
 * WLT-01 Inbound-Source Screening — committed automated regression coverage for
 * `infra/migrations/064_wlt1_inbound_source_screening.cjs`'s own up/down/re-up behaviour, from day
 * one (mirrors migration 062's own established pattern in `wlt1-migration-062-regression.test.ts`).
 * Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's programmatic
 * `runner()` API, dropped in `afterAll`. Migration 064 itself is never modified — this file only
 * drives the migration runner and independently verifies real database state via direct SQL after
 * every step.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only. Grant-boundary
 * behaviour is covered separately in `tests/integration/wlt1-db.test.ts`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");

/** Exactly 63 migration files precede `064_wlt1_inbound_source_screening.cjs`. */
const MIGRATIONS_THROUGH_063 = 63;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig064_regr_it_${randomBytes(6).toString("hex")}`;

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

async function tableExists(): Promise<boolean> {
  const r = await verifyPool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'inbound_source_screening_result'`);
  return r.rows.length === 1;
}

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    screening_result_id: "wlt1isr_" + randomUUID(),
    client_id: "clt1client_mig064regr",
    chain: "ethereum",
    network: "mainnet",
    canonical_address: "0x" + "1".repeat(40),
    address_hash: "sha256:" + randomUUID().replace(/-/g, ""),
    canonicalisation_version: "ethereum-eip55-v1",
    screening_result_version: 1,
    transaction_ref: "tx-" + randomUUID(),
    transaction_hash: null,
    asset: null,
    provider_id: "stub-wallet-analytics-v1",
    provider_adaptor_version: "1",
    provider_result_id: "presult_" + randomUUID(),
    risk_status: "clear",
    risk_score: null,
    risk_categories: JSON.stringify([]),
    direct_exposure: JSON.stringify([]),
    indirect_exposure: JSON.stringify([]),
    sanctions_exposure: false,
    cluster_ref: null,
    source_eligibility: "eligible",
    reason_code: "source_screening_clear",
    issued_at_utc: new Date().toISOString(),
    valid_until_utc: new Date(Date.now() + 3600_000).toISOString(),
    request_id: "req_" + randomUUID(),
    correlation_id: "corr_" + randomUUID(),
    ...overrides,
  };
}

async function insertRow(overrides: Record<string, unknown> = {}): Promise<string> {
  const f = fixture(overrides);
  await verifyPool.query(
    `INSERT INTO wlt1.inbound_source_screening_result
       (screening_result_id, client_id, chain, network, canonical_address, address_hash, canonicalisation_version, screening_result_version,
        transaction_ref, transaction_hash, asset, provider_id, provider_adaptor_version, provider_result_id,
        risk_status, risk_score, risk_categories, direct_exposure, indirect_exposure, sanctions_exposure, cluster_ref,
        source_eligibility, reason_code, issued_at_utc, valid_until_utc, request_id, correlation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
    [
      f.screening_result_id,
      f.client_id,
      f.chain,
      f.network,
      f.canonical_address,
      f.address_hash,
      f.canonicalisation_version,
      f.screening_result_version,
      f.transaction_ref,
      f.transaction_hash,
      f.asset,
      f.provider_id,
      f.provider_adaptor_version,
      f.provider_result_id,
      f.risk_status,
      f.risk_score,
      f.risk_categories,
      f.direct_exposure,
      f.indirect_exposure,
      f.sanctions_exposure,
      f.cluster_ref,
      f.source_eligibility,
      f.reason_code,
      f.issued_at_utc,
      f.valid_until_utc,
      f.request_id,
      f.correlation_id,
    ],
  );
  return f.screening_result_id as string;
}

describe("WLT-01 Inbound-Source Screening: migration 064 up/down/re-up + evidence-preserving down + 3 named UNIQUE constraints (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig064-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig064-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig064-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 63 migrations reaches head 063; wlt1.inbound_source_screening_result does not exist yet", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_063, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("063_iam2_register_wlt1_evidence_export_permissions");
    expect(await tableExists()).toBe(false);
  }, 60_000);

  it("B. migrating up one more migration reaches head 064 — wlt1.inbound_source_screening_result exists with the frozen 27-column shape", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("064_wlt1_inbound_source_screening");
    expect(await tableExists()).toBe(true);

    const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'inbound_source_screening_result' ORDER BY ordinal_position`);
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      "id",
      "screening_result_id",
      "client_id",
      "chain",
      "network",
      "canonical_address",
      "address_hash",
      "canonicalisation_version",
      "screening_result_version",
      "transaction_ref",
      "transaction_hash",
      "asset",
      "provider_id",
      "provider_adaptor_version",
      "provider_result_id",
      "risk_status",
      "risk_score",
      "risk_categories",
      "direct_exposure",
      "indirect_exposure",
      "sanctions_exposure",
      "cluster_ref",
      "source_eligibility",
      "reason_code",
      "issued_at_utc",
      "valid_until_utc",
      "request_id",
      "correlation_id",
      "created_at_utc",
    ]);
  }, 60_000);

  it("C. no FK to wlt1.destination exists (inbound source is deliberately NOT an outbound destination)", async () => {
    if (!schemaReady) return;
    const fks = await verifyPool.query(
      `SELECT 1 FROM pg_constraint WHERE conrelid = 'wlt1.inbound_source_screening_result'::regclass AND contype = 'f'`,
    );
    expect(fks.rows).toHaveLength(0);
  });

  it("D. no raw provider payload column exists, and risk_status has no 'pending' member (row-exists <=> terminal)", async () => {
    if (!schemaReady) return;
    const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'inbound_source_screening_result'`);
    const names = cols.rows.map((r) => r.column_name);
    expect(names).not.toContain("raw_payload");
    expect(names).not.toContain("provider_payload");
    expect(names).not.toContain("raw_response");
    expect(names).not.toContain("status");
    await expect(insertRow({ risk_status: "pending" })).rejects.toThrow(/violates check constraint/);
  });

  it("E. no first_seen/last_seen/transfer_count/velocity columns exist (limits/velocity is explicitly out of scope)", async () => {
    if (!schemaReady) return;
    const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'inbound_source_screening_result'`);
    const names = cols.rows.map((r) => r.column_name);
    for (const forbidden of ["first_seen_at", "last_seen_at", "transfer_count", "velocity", "amount"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("F. a well-formed screening row is insertable", async () => {
    if (!schemaReady) return;
    const id = await insertRow();
    const row = await verifyPool.query(`SELECT screening_result_id FROM wlt1.inbound_source_screening_result WHERE screening_result_id = $1`, [id]);
    expect(row.rows).toEqual([{ screening_result_id: id }]);
    await verifyPool.query(`DELETE FROM wlt1.inbound_source_screening_result WHERE screening_result_id = $1`, [id]);
  });

  it("G. risk_status CHECK rejects an unrecognised value", async () => {
    if (!schemaReady) return;
    await expect(insertRow({ risk_status: "not_real" })).rejects.toThrow(/violates check constraint/);
  });

  it("H. screening_result_version <= 0 is rejected by the CHECK constraint", async () => {
    if (!schemaReady) return;
    await expect(insertRow({ screening_result_version: 0 })).rejects.toThrow(/violates check constraint/);
    await expect(insertRow({ screening_result_version: -1 })).rejects.toThrow(/violates check constraint/);
  });

  it("I. the eligibility-coherence CHECK enforces (source_eligibility='eligible') = (risk_status='clear')", async () => {
    if (!schemaReady) return;
    await expect(insertRow({ risk_status: "clear", source_eligibility: "not_eligible" })).rejects.toThrow(/violates check constraint/);
    await expect(insertRow({ risk_status: "hit", source_eligibility: "eligible" })).rejects.toThrow(/violates check constraint/);
    const okId = await insertRow({ risk_status: "high_risk", source_eligibility: "not_eligible" });
    await verifyPool.query(`DELETE FROM wlt1.inbound_source_screening_result WHERE screening_result_id = $1`, [okId]);
  });

  describe("J. three explicitly-named UNIQUE constraints", () => {
    it("J1. uq_wlt1_inbound_source_result_id UNIQUE(screening_result_id) — duplicate rejected", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(`SELECT 1 FROM pg_constraint WHERE conrelid = 'wlt1.inbound_source_screening_result'::regclass AND conname = 'uq_wlt1_inbound_source_result_id'`);
      expect(r.rows).toHaveLength(1);
      const id = "wlt1isr_" + randomUUID();
      await insertRow({ screening_result_id: id, transaction_ref: "tx-" + randomUUID() });
      await expect(insertRow({ screening_result_id: id, transaction_ref: "tx-" + randomUUID() })).rejects.toThrow(/duplicate key value.*uq_wlt1_inbound_source_result_id|violates unique constraint "uq_wlt1_inbound_source_result_id"/);
      await verifyPool.query(`DELETE FROM wlt1.inbound_source_screening_result WHERE screening_result_id = $1`, [id]);
    });

    it("J2. uq_wlt1_inbound_source_transfer UNIQUE(client_id, chain, network, transaction_ref) — duplicate transfer rejected", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(`SELECT 1 FROM pg_constraint WHERE conrelid = 'wlt1.inbound_source_screening_result'::regclass AND conname = 'uq_wlt1_inbound_source_transfer'`);
      expect(r.rows).toHaveLength(1);
      const clientId = "clt1client_mig064_j2";
      const transactionRef = "tx-" + randomUUID();
      const firstId = await insertRow({ client_id: clientId, transaction_ref: transactionRef });
      await expect(insertRow({ client_id: clientId, transaction_ref: transactionRef })).rejects.toThrow(
        /duplicate key value.*uq_wlt1_inbound_source_transfer|violates unique constraint "uq_wlt1_inbound_source_transfer"/,
      );
      await verifyPool.query(`DELETE FROM wlt1.inbound_source_screening_result WHERE screening_result_id = $1`, [firstId]);
    });

    it("J3. uq_wlt1_inbound_source_version UNIQUE(client_id, address_hash, screening_result_version) — duplicate version rejected", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(`SELECT 1 FROM pg_constraint WHERE conrelid = 'wlt1.inbound_source_screening_result'::regclass AND conname = 'uq_wlt1_inbound_source_version'`);
      expect(r.rows).toHaveLength(1);
      const clientId = "clt1client_mig064_j3";
      const addressHash = "sha256:" + randomUUID().replace(/-/g, "");
      const firstId = await insertRow({ client_id: clientId, address_hash: addressHash, screening_result_version: 1, transaction_ref: "tx-" + randomUUID() });
      await expect(
        insertRow({ client_id: clientId, address_hash: addressHash, screening_result_version: 1, transaction_ref: "tx-" + randomUUID() }),
      ).rejects.toThrow(/duplicate key value.*uq_wlt1_inbound_source_version|violates unique constraint "uq_wlt1_inbound_source_version"/);
      await verifyPool.query(`DELETE FROM wlt1.inbound_source_screening_result WHERE screening_result_id = $1`, [firstId]);
    });

    it("J4. different chain/network with the SAME transaction_ref is NOT a transfer conflict (chain/network are part of the natural key)", async () => {
      if (!schemaReady) return;
      const clientId = "clt1client_mig064_j4";
      const transactionRef = "tx-" + randomUUID();
      const a = await insertRow({ client_id: clientId, chain: "ethereum", network: "mainnet", transaction_ref: transactionRef });
      const b = await insertRow({ client_id: clientId, chain: "tron", network: "mainnet", transaction_ref: transactionRef, canonical_address: "T" + "1".repeat(33), canonicalisation_version: "tron-base58check-v1" });
      const rows = await verifyPool.query(`SELECT screening_result_id FROM wlt1.inbound_source_screening_result WHERE screening_result_id = ANY($1)`, [[a, b]]);
      expect(rows.rows).toHaveLength(2);
      await verifyPool.query(`DELETE FROM wlt1.inbound_source_screening_result WHERE screening_result_id = ANY($1)`, [[a, b]]);
    });
  });

  it("K. both indexes exist", async () => {
    if (!schemaReady) return;
    const idx = await verifyPool.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'inbound_source_screening_result' AND indexname IN ('idx_wlt1_inbound_source_client_time', 'idx_wlt1_inbound_source_address')`,
    );
    expect(idx.rows.map((r) => r.indexname).sort()).toEqual(["idx_wlt1_inbound_source_address", "idx_wlt1_inbound_source_client_time"]);
  });

  let evidenceId: string;

  it("L. with a screening row present, down is refused; head/table/row are preserved", async () => {
    if (!schemaReady) return;
    evidenceId = await insertRow();

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /contains evidence rows/,
    );

    expect(await migrationHead()).toBe("064_wlt1_inbound_source_screening");
    expect(await tableExists()).toBe(true);
    const stillThere = await verifyPool.query(`SELECT screening_result_id FROM wlt1.inbound_source_screening_result WHERE screening_result_id = $1`, [evidenceId]);
    expect(stillThere.rows).toEqual([{ screening_result_id: evidenceId }]);
  }, 60_000);

  it("M. controlled cleanup of the fixture (privileged test setup, not a runtime DELETE grant)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.inbound_source_screening_result WHERE screening_result_id = $1`, [evidenceId]);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.inbound_source_screening_result`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it("N. with no evidence remaining, down succeeds cleanly back to head 063 — table dropped", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("063_iam2_register_wlt1_evidence_export_permissions");
    expect(await tableExists()).toBe(false);
  }, 60_000);

  it("O. re-up restores the exact frozen schema: head 064, table back, all 3 named UNIQUE constraints + eligibility CHECK back", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("064_wlt1_inbound_source_screening");
    expect(await tableExists()).toBe(true);

    const constraints = await verifyPool.query(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'wlt1.inbound_source_screening_result'::regclass AND conname IN ('uq_wlt1_inbound_source_result_id', 'uq_wlt1_inbound_source_transfer', 'uq_wlt1_inbound_source_version', 'chk_wlt1_inbound_source_eligibility_coherent')`,
    );
    expect(constraints.rows.map((r) => r.conname).sort()).toEqual([
      "chk_wlt1_inbound_source_eligibility_coherent",
      "uq_wlt1_inbound_source_result_id",
      "uq_wlt1_inbound_source_transfer",
      "uq_wlt1_inbound_source_version",
    ]);

    await expect(insertRow({ risk_status: "clear", source_eligibility: "not_eligible" })).rejects.toThrow(/violates check constraint/);

    const idx = await verifyPool.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'inbound_source_screening_result' AND indexname = 'idx_wlt1_inbound_source_client_time'`);
    expect(idx.rows).toHaveLength(1);
  }, 60_000);
});
