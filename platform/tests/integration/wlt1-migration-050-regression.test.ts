/**
 * WLT-01 Phase 2C-A, Gate 2C-A-2 — committed automated regression coverage for
 * `infra/migrations/050_wlt1_screening.cjs`'s own up/down/re-up and evidence-preserving down
 * behaviour (the "migration regression-test coverage gap" carried forward from the accepted Phase
 * 2B independent Opus review — previously verified only manually/independently against real
 * databases, never as a committed test). Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * Provisions a PRIVATE, uniquely-named, throwaway database for this file only (mirrors
 * `tests/integration/aml1-clt1-outcome-delivery-real.test.ts`'s own established pattern — full
 * migration chain via node-pg-migrate's programmatic `runner()` API, the same one `npm run
 * migrate:up`/`migrate:down` use), dropped in `afterAll`. Migration 050 itself is never modified —
 * this file only drives the migration runner and independently verifies real database state via
 * direct SQL after every step.
 *
 * No runtime grants are applied — this file exercises the MIGRATION layer only (schema/data
 * verification via a privileged connection), never the `role_wlt1_runtime` application-privilege
 * surface (already covered by `tests/integration/wlt1-db.test.ts`'s own live privilege matrix).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runner } from "node-pg-migrate";

const TEST_DB = process.env.TEST_DATABASE_URL;
const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "infra", "migrations");

/** Exactly 49 migration files precede `050_wlt1_screening.cjs` in alphabetical/numeric order
 * (verified: `ls infra/migrations/*.cjs | wc -l` = 50 total, `049_wlt1_core.cjs` at position 49,
 * `050_wlt1_screening.cjs` at position 50) — used as an explicit `count` rather than a migration
 * name so this file exercises the SAME `runner()` API the real deployment scripts use. */
const MIGRATIONS_THROUGH_049 = 49;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig050_regr_it_${randomBytes(6).toString("hex")}`;

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

let maintenancePool: Pool;
let privateDbUrl: string;
let verifyPool: Pool;
let schemaReady = false;
// Tracks CREATE DATABASE succeeding independently of whether LATER setup (migrations, role
// creation) completes — teardown must drop the database whenever it was actually created, not
// only when the whole beforeAll finished (which would leak the private database on a partial
// setup failure between CREATE DATABASE and the schemaReady=true assignment).
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

async function wltTableCount(): Promise<number> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1'`);
  return Number(r.rows[0]?.n ?? 0);
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const r = await verifyPool.query(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return Number(r.rows[0]?.n ?? 0) > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const r = await verifyPool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = $1`, [table]);
  return Number(r.rows[0]?.n ?? 0) > 0;
}

describe("WLT-01 Phase 2C-A: migration 050 up/down/re-up + evidence-preserving down (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    // Private, throwaway database — literal token values are irrelevant beyond satisfying
    // migration 008's own fail-closed presence check. Same precedent as
    // aml1-clt1-outcome-delivery-real.test.ts.
    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig050-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig050-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig050-regr-it-private-db-iam02-token";

    verifyPool = new Pool({ connectionString: privateDbUrl });
    verifyPool.on("error", ignoreExpectedDisconnect);
    schemaReady = true;
  }, 60_000);

  afterAll(async () => {
    await verifyPool?.end();
    if (maintenancePool) {
      if (databaseCreated) {
        await maintenancePool.query(`DROP DATABASE IF EXISTS ${PRIVATE_DB_NAME} WITH (FORCE)`).catch(async () => {
          // Older Postgres without WITH (FORCE) support — best-effort fallback.
          await maintenancePool.query(`DROP DATABASE IF EXISTS ${PRIVATE_DB_NAME}`).catch(() => undefined);
        });
      }
      await maintenancePool.end();
    }
  });

  it("A. migrating up through exactly 49 migrations reaches head 049_wlt1_core with none of migration 050's schema present", async () => {
    if (!schemaReady) return;
    await runner({
      databaseUrl: privateDbUrl,
      dir: MIGRATIONS_DIR,
      direction: "up",
      count: MIGRATIONS_THROUGH_049,
      checkOrder: false,
      migrationsTable: "pgmigrations",
      log: silentLog,
    });

    expect(await migrationHead()).toBe("049_wlt1_core");
    expect(await wltTableCount()).toBe(4);
    expect(await columnExists("chain_coverage", "provider_id")).toBe(false);
    expect(await tableExists("wallet_screening_result")).toBe(false);
    expect(await tableExists("vendor_result_inbox")).toBe(false);
  }, 60_000);

  it("B. migrating up one more migration reaches head 050_wlt1_screening with the full Phase 2B schema", async () => {
    if (!schemaReady) return;
    await runner({
      databaseUrl: privateDbUrl,
      dir: MIGRATIONS_DIR,
      direction: "up",
      count: 1,
      checkOrder: false,
      migrationsTable: "pgmigrations",
      log: silentLog,
    });

    expect(await migrationHead()).toBe("050_wlt1_screening");
    expect(await wltTableCount()).toBe(6);
    expect(await columnExists("chain_coverage", "provider_id")).toBe(true);
    expect(await tableExists("wallet_screening_result")).toBe(true);
    expect(await tableExists("vendor_result_inbox")).toBe(true);

    const coverage = await verifyPool.query(`SELECT chain, network, provider_id FROM wlt1.chain_coverage ORDER BY chain`);
    expect(coverage.rows).toEqual([
      { chain: "ethereum", network: "mainnet", provider_id: "stub-wallet-analytics-v1" },
      { chain: "tron", network: "mainnet", provider_id: "stub-wallet-analytics-v1" },
    ]);
  }, 60_000);

  it("C+D. a wallet_screening_result evidence row blocks down; after clearing it, the row is gone and down is no longer blocked by this table", async () => {
    if (!schemaReady) return;
    const destinationId = "wlt1dest_mig050regr_" + randomUUID();
    const screeningResultId = "wlt1screen_mig050regr_" + randomUUID();
    await verifyPool.query(
      `INSERT INTO wlt1.destination (destination_id, client_id, destination_type, natural_key_hash) VALUES ($1, 'clt1client_mig050regr', 'wallet', $2)`,
      [destinationId, "hash_" + randomUUID()],
    );
    await verifyPool.query(
      `INSERT INTO wlt1.wallet_screening_result (screening_result_id, destination_id, screening_result_version, provider_id, provider_adaptor_version, chain, network, address_hash)
       VALUES ($1, $2, 1, 'stub-wallet-analytics-v1', '1', 'ethereum', 'mainnet', $3)`,
      [screeningResultId, destinationId, "addrhash_" + randomUUID()],
    );

    // C. Down must REFUSE while this evidence row exists — the migration's own down() throws;
    // the runner() promise must reject, never silently drop the table/row.
    await expect(
      runner({
        databaseUrl: privateDbUrl,
        dir: MIGRATIONS_DIR,
        direction: "down",
        count: 1,
        checkOrder: false,
        migrationsTable: "pgmigrations",
        log: silentLog,
      }),
    ).rejects.toThrow(/wallet_screening_result contains evidence rows/);

    // Prove atomicity/evidence preservation with real queries, not merely that the promise threw.
    expect(await migrationHead()).toBe("050_wlt1_screening");
    expect(await tableExists("wallet_screening_result")).toBe(true);
    expect(await columnExists("chain_coverage", "provider_id")).toBe(true);
    expect(await tableExists("vendor_result_inbox")).toBe(true);
    const stillThere = await verifyPool.query(`SELECT screening_result_id FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [
      screeningResultId,
    ]);
    expect(stillThere.rows).toHaveLength(1);

    // D. Clear the controlled test fixture row via the privileged test connection — never via a
    // DELETE grant on role_wlt1_runtime (no runtime grant is touched by this test at all).
    await verifyPool.query(`DELETE FROM wlt1.wallet_screening_result WHERE screening_result_id = $1`, [screeningResultId]);
    await verifyPool.query(`DELETE FROM wlt1.destination WHERE destination_id = $1`, [destinationId]);
    const cleared = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result`);
    expect(cleared.rows[0]?.n).toBe(0);
  }, 60_000);

  it("E+F. a vendor_result_inbox evidence row independently blocks down (screening table already empty); after clearing it, the row is gone", async () => {
    if (!schemaReady) return;
    const inboxId = "wlt1inbox_mig050regr_" + randomUUID();
    await verifyPool.query(
      `INSERT INTO wlt1.vendor_result_inbox (inbox_id, provider_id, provider_result_id, result_type, payload_hash, source_authenticated, received_at_utc)
       VALUES ($1, 'stub-wallet-analytics-v1', $2, 'wallet_screening', $3, true, now())`,
      [inboxId, "presult_mig050regr_" + randomUUID(), "sha256:mig050regr_" + randomUUID()],
    );

    // E. Down must REFUSE while ONLY the inbox table holds evidence (screening table is empty,
    // proving the two tables are protected independently, not merely "any evidence anywhere").
    const screeningRowsBefore = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result`);
    expect(screeningRowsBefore.rows[0]?.n).toBe(0);

    await expect(
      runner({
        databaseUrl: privateDbUrl,
        dir: MIGRATIONS_DIR,
        direction: "down",
        count: 1,
        checkOrder: false,
        migrationsTable: "pgmigrations",
        log: silentLog,
      }),
    ).rejects.toThrow(/vendor_result_inbox contains evidence rows/);

    expect(await migrationHead()).toBe("050_wlt1_screening");
    expect(await tableExists("vendor_result_inbox")).toBe(true);
    expect(await columnExists("chain_coverage", "provider_id")).toBe(true);
    expect(await tableExists("wallet_screening_result")).toBe(true);
    const stillThere = await verifyPool.query(`SELECT inbox_id FROM wlt1.vendor_result_inbox WHERE inbox_id = $1`, [inboxId]);
    expect(stillThere.rows).toHaveLength(1);

    // F. Clear the controlled inbox fixture row.
    await verifyPool.query(`DELETE FROM wlt1.vendor_result_inbox WHERE inbox_id = $1`, [inboxId]);
    const cleared = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.vendor_result_inbox`);
    expect(cleared.rows[0]?.n).toBe(0);
  }, 60_000);

  it("G. with both evidence tables genuinely empty, down succeeds cleanly back to head 049", async () => {
    if (!schemaReady) return;
    const screeningRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result`);
    const inboxRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.vendor_result_inbox`);
    expect(screeningRows.rows[0]?.n).toBe(0);
    expect(inboxRows.rows[0]?.n).toBe(0);

    await runner({
      databaseUrl: privateDbUrl,
      dir: MIGRATIONS_DIR,
      direction: "down",
      count: 1,
      checkOrder: false,
      migrationsTable: "pgmigrations",
      log: silentLog,
    });

    expect(await migrationHead()).toBe("049_wlt1_core");
    expect(await wltTableCount()).toBe(4);
    expect(await columnExists("chain_coverage", "provider_id")).toBe(false);
    expect(await tableExists("wallet_screening_result")).toBe(false);
    expect(await tableExists("vendor_result_inbox")).toBe(false);
  }, 60_000);

  it("H. re-up restores the exact Phase 2B schema: head 050, 6 tables, provider_id present, both coverage rows rebound to the frozen stub id", async () => {
    if (!schemaReady) return;
    await runner({
      databaseUrl: privateDbUrl,
      dir: MIGRATIONS_DIR,
      direction: "up",
      count: 1,
      checkOrder: false,
      migrationsTable: "pgmigrations",
      log: silentLog,
    });

    expect(await migrationHead()).toBe("050_wlt1_screening");
    expect(await wltTableCount()).toBe(6);
    expect(await columnExists("chain_coverage", "provider_id")).toBe(true);
    expect(await tableExists("wallet_screening_result")).toBe(true);
    expect(await tableExists("vendor_result_inbox")).toBe(true);

    const coverage = await verifyPool.query(`SELECT chain, network, provider_id FROM wlt1.chain_coverage ORDER BY chain`);
    expect(coverage.rows).toEqual([
      { chain: "ethereum", network: "mainnet", provider_id: "stub-wallet-analytics-v1" },
      { chain: "tron", network: "mainnet", provider_id: "stub-wallet-analytics-v1" },
    ]);

    // Confirm both evidence tables are empty at the end — the private database is dropped in
    // afterAll regardless, but this closes the loop on the exact accepted Phase 2B baseline.
    const screeningRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.wallet_screening_result`);
    const inboxRows = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.vendor_result_inbox`);
    expect(screeningRows.rows[0]?.n).toBe(0);
    expect(inboxRows.rows[0]?.n).toBe(0);
  }, 60_000);
});
