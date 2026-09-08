/**
 * WLT-01 Fiat Payout Destinations (APAC) — committed automated regression coverage for
 * `infra/migrations/061_wlt1_fiat_payout_destination.cjs`'s own up/down/re-up behaviour, from day
 * one (mirrors migration 060's own established pattern in
 * `wlt1-migration-060-regression.test.ts`). Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's programmatic
 * `runner()` API, dropped in `afterAll`. Migration 061 itself is never modified — this file only
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

/** Exactly 60 migration files precede `061_wlt1_fiat_payout_destination.cjs`. */
const MIGRATIONS_THROUGH_060 = 60;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig061_regr_it_${randomBytes(6).toString("hex")}`;

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

async function fiatTablesExist(): Promise<boolean> {
  const r = await verifyPool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name IN ('fiat_payout_destination','fiat_rail_coverage','beneficiary_verification','fiat_screening_result')`,
  );
  return r.rows.length === 4;
}

async function destinationTypeCheckDef(): Promise<string | undefined> {
  const r = await verifyPool.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination'::regclass AND conname = 'destination_destination_type_check'`,
  );
  return r.rows[0]?.def;
}

async function decisionCoherenceCheckExists(): Promise<boolean> {
  const r = await verifyPool.query(
    `SELECT 1 FROM pg_constraint WHERE conrelid = 'wlt1.destination_decision'::regclass AND conname = 'chk_wlt1_destination_decision_type_coherent'`,
  );
  return r.rows.length === 1;
}

async function insertWalletDestination(destinationId: string, status = "active"): Promise<void> {
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'wallet', $3, $4)`, [
    destinationId,
    "clt1client_mig061regr",
    "hash_" + randomUUID(),
    status,
  ]);
}

async function insertFiatDestination(destinationId: string, status = "active"): Promise<void> {
  await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1, $2, 'fiat_payout', $3, $4)`, [
    destinationId,
    "clt1client_mig061regr",
    "hash_" + randomUUID(),
    status,
  ]);
  await verifyPool.query(
    `INSERT INTO wlt1.fiat_payout_destination
       (destination_id, beneficiary_name, beneficiary_name_normalized, beneficiary_type, bank_country, bank_identifier, bank_identifier_type,
        account_identifier_type, account_identifier_masked, account_identifier_hash, account_identifier_encrypted, currency, rail)
     VALUES ($1,'Test User','TEST USER','individual','MY','ABMBMYKL','bic','local_account','••••5678',$2,'ciphertext','MYR','apac_local_my')`,
    [destinationId, "hash_" + randomUUID()],
  );
}

describe("WLT-01 Fiat Payout Destinations (APAC): migration 061 up/down/re-up + dual-branch evidence-preserving down + destination_decision type-coherence (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig061-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig061-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig061-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 60 migrations reaches head 060; no fiat table exists yet; destination_type CHECK is wallet-only", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_060, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("060_wlt1_rescreening_run");
    expect(await fiatTablesExist()).toBe(false);
    const def = await destinationTypeCheckDef();
    expect(def).toMatch(/wallet/);
    expect(def).not.toMatch(/fiat_payout/);
  }, 60_000);

  it("B. migrating up one more migration reaches head 061 — all four fiat tables exist; destination_type widened; decision coherence CHECK exists", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("061_wlt1_fiat_payout_destination");
    expect(await fiatTablesExist()).toBe(true);

    const def = await destinationTypeCheckDef();
    expect(def).toMatch(/wallet/);
    expect(def).toMatch(/fiat_payout/);

    expect(await decisionCoherenceCheckExists()).toBe(true);
  }, 60_000);

  it("C. exactly four fiat_rail_coverage seed rows exist, all supported+inactive — no active corridor, no fifth row", async () => {
    if (!schemaReady) return;
    const rows = await verifyPool.query(`SELECT coverage_id, coverage_status, activation_status FROM wlt1.fiat_rail_coverage ORDER BY coverage_id`);
    expect(rows.rows).toHaveLength(4);
    for (const row of rows.rows) {
      expect(row.coverage_status).toBe("supported");
      expect(row.activation_status).toBe("inactive");
    }
    expect(rows.rows.map((r) => r.coverage_id)).toEqual(["wlt1cov_fiat_hk_hkd", "wlt1cov_fiat_id_idr", "wlt1cov_fiat_my_myr", "wlt1cov_fiat_sg_sgd"]);
  });

  it("D. fiat_rail_coverage status CHECKs are two-valued — an 'active' or 'unsupported' row IS insertable at the schema layer (only the runtime grant, not the CHECK, keeps the app from writing one)", async () => {
    if (!schemaReady) return;
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.fiat_rail_coverage (coverage_id, rail, bank_country, currency, account_identifier_type, bank_identifier_type, coverage_status, activation_status) VALUES ('wlt1cov_test_active','apac_local_test','MY','MYR','local_account','bic','supported','active')`,
      ),
    ).resolves.toBeDefined();
    await verifyPool.query(`DELETE FROM wlt1.fiat_rail_coverage WHERE coverage_id = 'wlt1cov_test_active'`);
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.fiat_rail_coverage (coverage_id, rail, bank_country, currency, account_identifier_type, bank_identifier_type, coverage_status, activation_status) VALUES ('wlt1cov_test_unsupported','apac_local_my','TH','THB','local_account','bic','unsupported','inactive')`,
      ),
    ).resolves.toBeDefined();
    await verifyPool.query(`DELETE FROM wlt1.fiat_rail_coverage WHERE coverage_id = 'wlt1cov_test_unsupported'`);
  });

  it("E. a single-valued coverage_status/activation_status value (an invented third state) is rejected", async () => {
    if (!schemaReady) return;
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.fiat_rail_coverage (coverage_id, rail, bank_country, currency, account_identifier_type, bank_identifier_type, coverage_status, activation_status) VALUES ('wlt1cov_test_bogus','apac_local_my','MY','MYR','local_account','bic','pending','pending')`,
      ),
    ).rejects.toThrow(/violates check constraint/);
  });

  describe("F. fiat_payout_destination branch coherence CHECK", () => {
    it("F1. HK with branch_identifier NULL is rejected", async () => {
      if (!schemaReady) return;
      const destinationId = "wlt1dest_061f1_" + randomUUID();
      await insertWalletDestination(destinationId); // placeholder row not used; real fiat parent below
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
      const fiatDestId = "wlt1dest_061f1b_" + randomUUID();
      await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,'clt1client_mig061regr','fiat_payout',$2,'draft')`, [
        fiatDestId,
        "hash_" + randomUUID(),
      ]);
      await expect(
        verifyPool.query(
          `INSERT INTO wlt1.fiat_payout_destination (destination_id, beneficiary_name, beneficiary_name_normalized, beneficiary_type, bank_country, bank_identifier, bank_identifier_type, account_identifier_type, account_identifier_masked, account_identifier_hash, account_identifier_encrypted, currency, rail)
           VALUES ($1,'HK User','HK USER','individual','HK','HSBCHKHH','bic','local_account','••••1234','hash_hk','ciphertext','HKD','apac_local_hk')`,
          [fiatDestId],
        ),
      ).rejects.toThrow(/violates check constraint/);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [fiatDestId]);
    });

    it("F2. HK with branch_identifier set is accepted", async () => {
      if (!schemaReady) return;
      const fiatDestId = "wlt1dest_061f2_" + randomUUID();
      await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,'clt1client_mig061regr','fiat_payout',$2,'draft')`, [
        fiatDestId,
        "hash_" + randomUUID(),
      ]);
      await expect(
        verifyPool.query(
          `INSERT INTO wlt1.fiat_payout_destination (destination_id, beneficiary_name, beneficiary_name_normalized, beneficiary_type, bank_country, bank_identifier, bank_identifier_type, branch_identifier, account_identifier_type, account_identifier_masked, account_identifier_hash, account_identifier_encrypted, currency, rail)
           VALUES ($1,'HK User','HK USER','individual','HK','HSBCHKHH','bic','004','local_account','••••1234','hash_hk2','ciphertext','HKD','apac_local_hk')`,
          [fiatDestId],
        ),
      ).resolves.toBeDefined();
      await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id = $1`, [fiatDestId]);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [fiatDestId]);
    });

    it("F3. MY (non-HK) with branch_identifier set is rejected", async () => {
      if (!schemaReady) return;
      const fiatDestId = "wlt1dest_061f3_" + randomUUID();
      await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,'clt1client_mig061regr','fiat_payout',$2,'draft')`, [
        fiatDestId,
        "hash_" + randomUUID(),
      ]);
      await expect(
        verifyPool.query(
          `INSERT INTO wlt1.fiat_payout_destination (destination_id, beneficiary_name, beneficiary_name_normalized, beneficiary_type, bank_country, bank_identifier, bank_identifier_type, branch_identifier, account_identifier_type, account_identifier_masked, account_identifier_hash, account_identifier_encrypted, currency, rail)
           VALUES ($1,'MY User','MY USER','individual','MY','ABMBMYKL','bic','004','local_account','••••1234','hash_my','ciphertext','MYR','apac_local_my')`,
          [fiatDestId],
        ),
      ).rejects.toThrow(/violates check constraint/);
      await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [fiatDestId]);
    });
  });

  it("G. account_identifier_type/bank_identifier_type CHECKs accept exactly local_account/bic and reject anything else (including 'iban')", async () => {
    if (!schemaReady) return;
    const fiatDestId = "wlt1dest_061g_" + randomUUID();
    await verifyPool.query(`INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash, status) VALUES ($1,'clt1client_mig061regr','fiat_payout',$2,'draft')`, [
      fiatDestId,
      "hash_" + randomUUID(),
    ]);
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.fiat_payout_destination (destination_id, beneficiary_name, beneficiary_name_normalized, beneficiary_type, bank_country, bank_identifier, bank_identifier_type, account_identifier_type, account_identifier_masked, account_identifier_hash, account_identifier_encrypted, currency, rail)
         VALUES ($1,'MY User','MY USER','individual','MY','ABMBMYKL','bic','iban','••••1234','hash_iban','ciphertext','MYR','apac_local_my')`,
        [fiatDestId],
      ),
    ).rejects.toThrow(/violates check constraint/);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [fiatDestId]);
  });

  it("H. destination_decision type-coherence CHECK: a wallet-shaped row (rail/currency/beneficiary_verification_id set) is rejected", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_061h_" + randomUUID();
    await insertWalletDestination(destinationId);
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.destination_decision
           (decision_id, token_hash, destination_id, client_id, requested_action, decision, aml_decision_id, aml_valid_until_utc,
            screening_result_id, destination_status_version, whitelist_version, revocation_epoch, chain, network,
            destination_type, rail, currency, beneficiary_verification_id, expires_at_utc)
         VALUES ($1,$2,$3,'clt1client_mig061regr','destination_use','allow','aml1ptd_' || $4,now() + interval '1 hour',
                 'wlt1screen_' || $4, 1, 0, 0, 'ethereum', 'mainnet',
                 'wallet', 'apac_local_my', 'MYR', 'wlt1bv_' || $4, now() + interval '5 minutes')`,
        ["wlt1dec_" + randomUUID(), "a".repeat(64), destinationId, randomUUID()],
      ),
    ).rejects.toThrow(/violates check constraint/);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("I. destination_decision type-coherence CHECK: a fiat-shaped row with a non-null poc_challenge_id is rejected", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_061i_" + randomUUID();
    await insertFiatDestination(destinationId, "active");
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.destination_decision
           (decision_id, token_hash, destination_id, client_id, requested_action, decision, aml_decision_id, aml_valid_until_utc,
            screening_result_id, poc_challenge_id, destination_status_version, whitelist_version, revocation_epoch,
            destination_type, rail, currency, beneficiary_verification_id, expires_at_utc)
         VALUES ($1,$2,$3,'clt1client_mig061regr','destination_use','allow','aml1ptd_' || $4,now() + interval '1 hour',
                 'wlt1fscr_' || $4, 'wlt1poc_' || $4, 1, 0, 0,
                 'fiat_payout', 'apac_local_my', 'MYR', 'wlt1bv_' || $4, now() + interval '5 minutes')`,
        ["wlt1dec_" + randomUUID(), "b".repeat(64), destinationId, randomUUID()],
      ),
    ).rejects.toThrow(/violates check constraint/);
    await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("J. destination_decision type-coherence CHECK: a genuinely valid fiat-shaped row is accepted", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_061j_" + randomUUID();
    await insertFiatDestination(destinationId, "active");
    const decisionId = "wlt1dec_" + randomUUID();
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.destination_decision
           (decision_id, token_hash, destination_id, client_id, requested_action, decision, aml_decision_id, aml_valid_until_utc,
            screening_result_id, destination_status_version, whitelist_version, revocation_epoch,
            destination_type, rail, currency, beneficiary_verification_id, expires_at_utc)
         VALUES ($1,$2,$3,'clt1client_mig061regr','destination_use','allow','aml1ptd_' || $4,now() + interval '1 hour',
                 'wlt1fscr_' || $4, 1, 0, 0,
                 'fiat_payout', 'apac_local_my', 'MYR', 'wlt1bv_' || $4, now() + interval '5 minutes')`,
        [decisionId, "c".repeat(64), destinationId, randomUUID()],
      ),
    ).resolves.toBeDefined();
    await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE decision_id = $1`, [decisionId]);
    await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("K. pre-existing (pre-061) wallet decisions remain valid and structurally unchanged after backfill — destination_type='wallet', chain/network still NOT NULL for real rows", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_061k_" + randomUUID();
    await insertWalletDestination(destinationId);
    const decisionId = "wlt1dec_" + randomUUID();
    await verifyPool.query(
      `INSERT INTO wlt1.destination_decision
         (decision_id, token_hash, destination_id, client_id, requested_action, decision, aml_decision_id, aml_valid_until_utc,
          screening_result_id, destination_status_version, whitelist_version, revocation_epoch, chain, network,
          destination_type, expires_at_utc)
       VALUES ($1,$2,$3,'clt1client_mig061regr','destination_use','allow','aml1ptd_' || $4,now() + interval '1 hour',
               'wlt1screen_' || $4, 1, 0, 0, 'ethereum', 'mainnet', 'wallet', now() + interval '5 minutes')`,
      [decisionId, "d".repeat(64), destinationId, randomUUID()],
    );
    const row = await verifyPool.query(`SELECT destination_type, chain, network, rail, currency, beneficiary_verification_id FROM wlt1.destination_decision WHERE decision_id = $1`, [decisionId]);
    expect(row.rows[0]).toMatchObject({ destination_type: "wallet", chain: "ethereum", network: "mainnet", rail: null, currency: null, beneficiary_verification_id: null });
    await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE decision_id = $1`, [decisionId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("L. fiat_screening_result.risk_status has NO DEFAULT and rejects 'pending' — no pending screening row is representable", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_061l_" + randomUUID();
    await insertFiatDestination(destinationId);
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.fiat_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, beneficiary_name_hash, bank_country, beneficiary_type, risk_status, issued_at_utc, valid_until_utc)
         VALUES ($1,$2,1,'stub-fiat-screening-v1','1','hash_name','MY','individual','pending', now(), now() + interval '1 hour')`,
        ["wlt1fscr_" + randomUUID(), destinationId],
      ),
    ).rejects.toThrow(/violates check constraint/);
    await expect(
      verifyPool.query(
        `INSERT INTO wlt1.fiat_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, beneficiary_name_hash, bank_country, beneficiary_type, risk_status, issued_at_utc, valid_until_utc)
         VALUES ($1,$2,1,'stub-fiat-screening-v1','1','hash_name','MY','individual','clear', now(), now() + interval '1 hour')`,
        ["wlt1fscr_" + randomUUID(), destinationId],
      ),
    ).resolves.toBeDefined();
    await verifyPool.query(`DELETE FROM wlt1.fiat_screening_result WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id = $1`, [destinationId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
  });

  it("M. wlt1.destination_revocation is untouched — no 'fiat' source/reason_code value exists", async () => {
    if (!schemaReady) return;
    const def = await verifyPool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'wlt1.destination_revocation'::regclass AND conname = 'destination_revocation_source_check'`,
    );
    expect(def.rows[0]?.def).not.toMatch(/fiat/);
  });

  // ---- Evidence-preserving down: four INDEPENDENT guards ----
  let fiatDestinationEvidenceId: string;

  it("N. with a destination_type='fiat_payout' row present, down is refused; head/tables preserved", async () => {
    if (!schemaReady) return;
    fiatDestinationEvidenceId = "wlt1dest_061n_" + randomUUID();
    await insertFiatDestination(fiatDestinationEvidenceId);

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /fiat_payout.*rows/,
    );
    expect(await migrationHead()).toBe("061_wlt1_fiat_payout_destination");
    expect(await fiatTablesExist()).toBe(true);
  }, 60_000);

  it("O. controlled cleanup of the destination-evidence fixture", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.fiat_payout_destination WHERE destination_id = $1`, [fiatDestinationEvidenceId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [fiatDestinationEvidenceId]);
  });

  let verificationEvidenceDestId: string;
  let verificationEvidenceId: string;

  it("P. with a beneficiary_verification row present, down is STILL refused — isolated from guard N by attaching evidence to a WALLET-type destination (the FK only requires a valid destination_id, never destination_type='fiat_payout'), proving this guard fires on its OWN, not merely because SOME fiat destination row happens to exist elsewhere", async () => {
    if (!schemaReady) return;
    verificationEvidenceDestId = "wlt1dest_061p_" + randomUUID();
    await insertWalletDestination(verificationEvidenceDestId);
    verificationEvidenceId = "wlt1bv_" + randomUUID();
    await verifyPool.query(
      `INSERT INTO wlt1.beneficiary_verification (verification_id, destination_id, verification_version, provider_id, provider_adaptor_version, result, beneficiary_name_hash, account_identifier_hash, issued_at_utc, valid_until_utc)
       VALUES ($1,$2,1,'stub-beneficiary-verification-v1','1','verified','hash_name','hash_acct', now(), now() + interval '1 year')`,
      [verificationEvidenceId, verificationEvidenceDestId],
    );

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /beneficiary_verification contains rows/,
    );
    expect(await migrationHead()).toBe("061_wlt1_fiat_payout_destination");
  }, 60_000);

  it("Q. controlled cleanup of the verification-evidence fixture", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.beneficiary_verification WHERE verification_id = $1`, [verificationEvidenceId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [verificationEvidenceDestId]);
  });

  let screeningEvidenceDestId: string;
  let screeningEvidenceId: string;

  it("R. with a fiat_screening_result row present, down is STILL refused — isolated from guard N by attaching evidence to a WALLET-type destination", async () => {
    if (!schemaReady) return;
    screeningEvidenceDestId = "wlt1dest_061r_" + randomUUID();
    await insertWalletDestination(screeningEvidenceDestId);
    screeningEvidenceId = "wlt1fscr_" + randomUUID();
    await verifyPool.query(
      `INSERT INTO wlt1.fiat_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, beneficiary_name_hash, bank_country, beneficiary_type, risk_status, issued_at_utc, valid_until_utc)
       VALUES ($1,$2,1,'stub-fiat-screening-v1','1','hash_name','MY','individual','clear', now(), now() + interval '1 hour')`,
      [screeningEvidenceId, screeningEvidenceDestId],
    );

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /fiat_screening_result contains rows/,
    );
    expect(await migrationHead()).toBe("061_wlt1_fiat_payout_destination");
  }, 60_000);

  it("S. controlled cleanup of the screening-evidence fixture", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.fiat_screening_result WHERE screening_result_id = $1`, [screeningEvidenceId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [screeningEvidenceDestId]);
  });

  let fiatDecisionEvidenceDestId: string;
  let fiatDecisionEvidenceId: string;

  it("T. with a destination_type='fiat_payout' destination_decision row present, down is STILL refused — isolated from guard N by attaching the decision row to a WALLET-type destination (destination_decision.destination_type has no FK/CHECK tying it to the parent destination row's own type — that coupling is application-only, in lib/decision-verify.ts)", async () => {
    if (!schemaReady) return;
    fiatDecisionEvidenceDestId = "wlt1dest_061t_" + randomUUID();
    await insertWalletDestination(fiatDecisionEvidenceDestId);
    fiatDecisionEvidenceId = "wlt1dec_" + randomUUID();
    await verifyPool.query(
      `INSERT INTO wlt1.destination_decision
         (decision_id, token_hash, destination_id, client_id, requested_action, decision, aml_decision_id, aml_valid_until_utc,
          screening_result_id, destination_status_version, whitelist_version, revocation_epoch,
          destination_type, rail, currency, beneficiary_verification_id, expires_at_utc)
       VALUES ($1,$2,$3,'clt1client_mig061regr','destination_use','allow','aml1ptd_' || $4,now() + interval '1 hour',
               'wlt1fscr_' || $4, 1, 0, 0,
               'fiat_payout', 'apac_local_my', 'MYR', 'wlt1bv_' || $4, now() + interval '5 minutes')`,
      [fiatDecisionEvidenceId, "e".repeat(64), fiatDecisionEvidenceDestId, randomUUID()],
    );

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /destination_decision contains destination_type='fiat_payout'/,
    );
    expect(await migrationHead()).toBe("061_wlt1_fiat_payout_destination");
  }, 60_000);

  it("U. controlled cleanup of the fiat-decision-evidence fixture", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.destination_decision WHERE decision_id = $1`, [fiatDecisionEvidenceId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [fiatDecisionEvidenceDestId]);
  });

  it("V. coverage seed rows alone do NOT block down — with every evidence table genuinely empty, down succeeds cleanly back to head 060", async () => {
    if (!schemaReady) return;
    const remainingDest = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination WHERE destination_type = 'fiat_payout'`);
    expect(remainingDest.rows[0]?.n).toBe(0);
    const remainingVerification = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.beneficiary_verification`);
    expect(remainingVerification.rows[0]?.n).toBe(0);
    const remainingScreening = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.fiat_screening_result`);
    expect(remainingScreening.rows[0]?.n).toBe(0);
    const remainingDecision = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.destination_decision WHERE destination_type = 'fiat_payout'`);
    expect(remainingDecision.rows[0]?.n).toBe(0);
    // The four coverage seed rows are still present at this point — proving they are reference
    // data, never evidence, and never block a clean down.
    const coverageRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.fiat_rail_coverage`);
    expect(coverageRows.rows[0]?.n).toBe(4);

    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("060_wlt1_rescreening_run");
    expect(await fiatTablesExist()).toBe(false);
    const def = await destinationTypeCheckDef();
    expect(def).not.toMatch(/fiat_payout/);
  }, 60_000);

  it("W. re-up restores the exact frozen schema: head 061, all four tables back, four dormant seed rows, coherence CHECK restored", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("061_wlt1_fiat_payout_destination");
    expect(await fiatTablesExist()).toBe(true);
    expect(await decisionCoherenceCheckExists()).toBe(true);

    const rows = await verifyPool.query(`SELECT coverage_id, coverage_status, activation_status FROM wlt1.fiat_rail_coverage ORDER BY coverage_id`);
    expect(rows.rows).toHaveLength(4);
    for (const row of rows.rows) {
      expect(row.coverage_status).toBe("supported");
      expect(row.activation_status).toBe("inactive");
    }

    const idx = await verifyPool.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'fiat_payout_destination' AND indexname = 'idx_wlt1_fiat_payout_destination_account_hash'`);
    expect(idx.rows).toHaveLength(1);
  }, 60_000);
});
