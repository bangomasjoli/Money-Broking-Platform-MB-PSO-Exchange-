/**
 * WLT-01 Evidence Export — committed automated regression coverage for
 * `infra/migrations/062_wlt1_evidence_export.cjs`'s own up/down/re-up behaviour, from day one
 * (mirrors migration 060's own established pattern in `wlt1-migration-060-regression.test.ts`).
 * Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * A PRIVATE, uniquely-named, throwaway database for this file only, node-pg-migrate's programmatic
 * `runner()` API, dropped in `afterAll`. Migration 062 itself is never modified — this file only
 * drives the migration runner and independently verifies real database state via direct SQL after
 * every step. Migration 063 (the 3 IAM-02 permission rows) is deliberately NOT given a separate
 * regression file here — it is verified via `tests/integration/wlt1-db.test.ts`'s own permission-
 * inventory test, per the task's own explicit file plan.
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

/** Exactly 61 migration files precede `062_wlt1_evidence_export.cjs`. */
const MIGRATIONS_THROUGH_061 = 61;

/** A unique, private database for THIS FILE ONLY — never shared with any other test file. */
const PRIVATE_DB_NAME = `wlt1_mig062_regr_it_${randomBytes(6).toString("hex")}`;

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
  const r = await verifyPool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'wlt1' AND table_name = 'evidence_export'`);
  return r.rows.length === 1;
}

function exportFixture(overrides: Record<string, unknown> = {}) {
  return {
    export_id: "wlt1exp_" + randomUUID(),
    client_id: "clt1client_mig062regr",
    scope_destination_id: null,
    scope_evidence_types: JSON.stringify(["wallet_destination"]),
    scope_from_utc: null,
    scope_to_utc: null,
    scope_hash: "sha256:" + randomUUID().replace(/-/g, ""),
    requested_by: "staff_mig062regr",
    approval_ref: "iam2approval_" + randomUUID(),
    reason: null,
    schema_version: "wlt1.evidence_export.v1",
    record_count: 0,
    scope_record_counts: JSON.stringify({}),
    content_hash: "sha256:" + randomUUID().replace(/-/g, ""),
    content: '{"manifest":{},"evidence":{}}',
    request_id: "req_" + randomUUID(),
    correlation_id: "corr_" + randomUUID(),
    generated_at_utc: new Date().toISOString(),
    ...overrides,
  };
}

async function insertExport(overrides: Record<string, unknown> = {}): Promise<string> {
  const f = exportFixture(overrides);
  await verifyPool.query(
    `INSERT INTO wlt1.evidence_export
       (export_id, client_id, scope_destination_id, scope_evidence_types, scope_from_utc, scope_to_utc, scope_hash, requested_by, approval_ref, reason, schema_version, record_count, scope_record_counts, content_hash, content, request_id, correlation_id, generated_at_utc)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      f.export_id,
      f.client_id,
      f.scope_destination_id,
      f.scope_evidence_types,
      f.scope_from_utc,
      f.scope_to_utc,
      f.scope_hash,
      f.requested_by,
      f.approval_ref,
      f.reason,
      f.schema_version,
      f.record_count,
      f.scope_record_counts,
      f.content_hash,
      f.content,
      f.request_id,
      f.correlation_id,
      f.generated_at_utc,
    ],
  );
  return f.export_id as string;
}

describe("WLT-01 Evidence Export: migration 062 up/down/re-up + evidence-preserving down + UNIQUE(approval_ref) (committed regression)", () => {
  beforeAll(async () => {
    if (!TEST_DB) return;

    maintenancePool = new Pool({ connectionString: withDatabase(TEST_DB, "postgres") });
    maintenancePool.on("error", ignoreExpectedDisconnect);
    await maintenancePool.query(`CREATE DATABASE ${PRIVATE_DB_NAME}`);
    databaseCreated = true;
    privateDbUrl = withDatabase(TEST_DB, PRIVATE_DB_NAME);

    process.env.SEC1_INGEST_TOKEN_FND01 ??= "wlt1-mig062-regr-it-private-db-fnd01-token";
    process.env.SEC1_INGEST_TOKEN_IAM01 ??= "wlt1-mig062-regr-it-private-db-iam01-token";
    process.env.SEC1_INGEST_TOKEN_IAM02 ??= "wlt1-mig062-regr-it-private-db-iam02-token";

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

  it("A. migrating up through exactly 61 migrations reaches head 061; wlt1.evidence_export does not exist yet", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: MIGRATIONS_THROUGH_061, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("061_wlt1_fiat_payout_destination");
    expect(await tableExists()).toBe(false);
  }, 60_000);

  it("B. migrating up one more migration reaches head 062 — wlt1.evidence_export exists with the frozen 20-column shape (including the disclosed scope_record_counts addition)", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });
    expect(await migrationHead()).toBe("062_wlt1_evidence_export");
    expect(await tableExists()).toBe(true);

    const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'evidence_export' ORDER BY ordinal_position`);
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      "id",
      "export_id",
      "client_id",
      "scope_destination_id",
      "scope_evidence_types",
      "scope_from_utc",
      "scope_to_utc",
      "scope_hash",
      "requested_by",
      "approval_ref",
      "reason",
      "schema_version",
      "record_count",
      "scope_record_counts",
      "content_hash",
      "content",
      "request_id",
      "correlation_id",
      "generated_at_utc",
      "created_at_utc",
    ]);
  }, 60_000);

  it("C. no approved_by column exists (the frozen ruling: WLT-01 cannot truthfully know the IAM-02 checker's identity)", async () => {
    if (!schemaReady) return;
    const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'evidence_export'`);
    expect(cols.rows.map((r) => r.column_name)).not.toContain("approved_by");
  });

  it("D. content is text, not jsonb (jsonb would silently reorder keys and break the byte-exact round-trip invariant)", async () => {
    if (!schemaReady) return;
    const col = await verifyPool.query(`SELECT data_type FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'evidence_export' AND column_name = 'content'`);
    expect(col.rows[0]?.data_type).toBe("text");
  });

  it("E. no status column exists (row-exists <=> ready lifecycle — no separate status/lifecycle column)", async () => {
    if (!schemaReady) return;
    const cols = await verifyPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'wlt1' AND table_name = 'evidence_export'`);
    expect(cols.rows.map((r) => r.column_name)).not.toContain("status");
  });

  it("F. a well-formed export row is insertable", async () => {
    if (!schemaReady) return;
    const exportId = await insertExport();
    const row = await verifyPool.query(`SELECT export_id FROM wlt1.evidence_export WHERE export_id = $1`, [exportId]);
    expect(row.rows).toEqual([{ export_id: exportId }]);
    await verifyPool.query(`DELETE FROM wlt1.evidence_export WHERE export_id = $1`, [exportId]);
  });

  it("G. record_count < 0 is rejected by the CHECK constraint", async () => {
    if (!schemaReady) return;
    await expect(insertExport({ record_count: -1 })).rejects.toThrow(/violates check constraint/);
  });

  it("H. export_id uniqueness — a duplicate export_id is rejected", async () => {
    if (!schemaReady) return;
    const exportId = "wlt1exp_" + randomUUID();
    await insertExport({ export_id: exportId });
    await expect(insertExport({ export_id: exportId, approval_ref: "iam2approval_" + randomUUID() })).rejects.toThrow(/duplicate key value/);
    await verifyPool.query(`DELETE FROM wlt1.evidence_export WHERE export_id = $1`, [exportId]);
  });

  describe("I. UNIQUE(approval_ref) — the WLT-side IAM-02 double-consume defensive backstop", () => {
    it("I1. the constraint is named exactly uq_wlt1_evidence_export_approval_ref", async () => {
      if (!schemaReady) return;
      const r = await verifyPool.query(`SELECT 1 FROM pg_constraint WHERE conrelid = 'wlt1.evidence_export'::regclass AND conname = 'uq_wlt1_evidence_export_approval_ref'`);
      expect(r.rows).toHaveLength(1);
    });

    it("I2. a second row sharing the SAME approval_ref (different export_id) is rejected with a live duplicate-insert proof", async () => {
      if (!schemaReady) return;
      const approvalRef = "iam2approval_" + randomUUID();
      const firstExportId = await insertExport({ approval_ref: approvalRef });
      await expect(insertExport({ approval_ref: approvalRef })).rejects.toThrow(/duplicate key value.*uq_wlt1_evidence_export_approval_ref|violates unique constraint "uq_wlt1_evidence_export_approval_ref"/);
      await verifyPool.query(`DELETE FROM wlt1.evidence_export WHERE export_id = $1`, [firstExportId]);
    });

    it("I3. two DIFFERENT approval_refs are both insertable without conflict", async () => {
      if (!schemaReady) return;
      const a = await insertExport();
      const b = await insertExport();
      const rows = await verifyPool.query(`SELECT export_id FROM wlt1.evidence_export WHERE export_id = ANY($1)`, [[a, b]]);
      expect(rows.rows).toHaveLength(2);
      await verifyPool.query(`DELETE FROM wlt1.evidence_export WHERE export_id = ANY($1)`, [[a, b]]);
    });
  });

  it("J. the client-scoped index idx_wlt1_evidence_export_client exists on (client_id, generated_at_utc DESC)", async () => {
    if (!schemaReady) return;
    const idx = await verifyPool.query(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'evidence_export' AND indexname = 'idx_wlt1_evidence_export_client'`);
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0]?.indexdef).toMatch(/client_id.*generated_at_utc DESC/);
  });

  let evidenceExportId: string;

  it("K. with an evidence_export row present, down is refused; head/table/row are preserved", async () => {
    if (!schemaReady) return;
    evidenceExportId = await insertExport();

    await expect(runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog })).rejects.toThrow(
      /evidence_export contains evidence rows/,
    );

    expect(await migrationHead()).toBe("062_wlt1_evidence_export");
    expect(await tableExists()).toBe(true);
    const stillThere = await verifyPool.query(`SELECT export_id FROM wlt1.evidence_export WHERE export_id = $1`, [evidenceExportId]);
    expect(stillThere.rows).toEqual([{ export_id: evidenceExportId }]);
  }, 60_000);

  it("L. controlled cleanup of the export fixture (privileged test setup, not a runtime DELETE grant)", async () => {
    if (!schemaReady) return;
    await verifyPool.query(`DELETE FROM wlt1.evidence_export WHERE export_id = $1`, [evidenceExportId]);
    const remaining = await verifyPool.query(`SELECT count(*)::int AS n FROM wlt1.evidence_export`);
    expect(remaining.rows[0]?.n).toBe(0);
  });

  it("M. with no evidence remaining, down succeeds cleanly back to head 061 — evidence_export table dropped", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "down", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("061_wlt1_fiat_payout_destination");
    expect(await tableExists()).toBe(false);
  }, 60_000);

  it("N. re-up restores the exact frozen schema: head 062, table back, UNIQUE(approval_ref) constraint back, CHECK back", async () => {
    if (!schemaReady) return;
    await runner({ databaseUrl: privateDbUrl, dir: MIGRATIONS_DIR, direction: "up", count: 1, checkOrder: false, migrationsTable: "pgmigrations", log: silentLog });

    expect(await migrationHead()).toBe("062_wlt1_evidence_export");
    expect(await tableExists()).toBe(true);

    const uniqueConstraint = await verifyPool.query(`SELECT 1 FROM pg_constraint WHERE conrelid = 'wlt1.evidence_export'::regclass AND conname = 'uq_wlt1_evidence_export_approval_ref'`);
    expect(uniqueConstraint.rows).toHaveLength(1);

    await expect(insertExport({ record_count: -1 })).rejects.toThrow(/violates check constraint/);

    const idx = await verifyPool.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'wlt1' AND tablename = 'evidence_export' AND indexname = 'idx_wlt1_evidence_export_client'`);
    expect(idx.rows).toHaveLength(1);
  }, 60_000);
});
