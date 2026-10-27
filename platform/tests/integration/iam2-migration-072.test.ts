/**
 * IAM02-AUTHZ-REM-001 — migration 072 (schema only) on a DISPOSABLE database created and dropped
 * by this test (plan §7, §8; AZ-13, AZ-17, AZ-18; T-33, T-48; D-8).
 *
 * It never touches TEST_DATABASE_URL's own database: it connects to the server's maintenance
 * database to `CREATE DATABASE aix_mig072_<random>`, runs the repository's own migration chain
 * against THAT database with `node-pg-migrate` (001…071, then 072), checks forward behaviour,
 * legacy-data fail-closed handling, runtime-grant compatibility, the rollback and the
 * emergency-revocation-safe rollback REFUSAL, then drops the database.
 *
 * PREREQUISITES ARE NEVER SILENTLY SKIPPED (IMPL-02): when TEST_DATABASE_URL is not configured the
 * suite is skipped EXPLICITLY, with a named skipped test stating why (the repository convention
 * for database tests). When TEST_DATABASE_URL IS configured, an unavailable prerequisite — a
 * missing `node-pg-migrate` binary, a role that cannot CREATE ROLE / CREATE DATABASE, an
 * unreachable server — makes EVERY test in this file FAIL with the underlying evidence, instead
 * of passing without running anything.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const TEST_DB = process.env.TEST_DATABASE_URL;
const PLATFORM_DIR = resolve(__dirname, "..", "..");
const BIN = resolve(PLATFORM_DIR, "node_modules", ".bin", "node-pg-migrate");
const DB_NAME = "aix_mig072_" + randomUUID().replace(/-/g, "").slice(0, 12);

function urlFor(db: string): string {
  const u = new URL(TEST_DB as string);
  u.pathname = "/" + db;
  return u.toString();
}

function migrate(args: string[]): { ok: boolean; output: string } {
  try {
    const out = execFileSync(BIN, ["-m", "infra/migrations", "--no-check-order", ...args], {
      cwd: PLATFORM_DIR,
      env: {
        ...process.env,
        DATABASE_URL: urlFor(DB_NAME),
        SEC1_INGEST_TOKEN_FND01: "test-fnd01-ingest-token-it",
        SEC1_INGEST_TOKEN_IAM01: "test-iam01-ingest-token-it",
        SEC1_INGEST_TOKEN_IAM02: "test-iam02-ingest-token-it",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output: out };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

let admin: Pool;
let db: Pool;
/** Set when a prerequisite is unavailable; every test then FAILS with this evidence. */
let prerequisiteError: Error | undefined;
let databaseCreated = false;

function assertPrerequisites(): void {
  if (prerequisiteError) throw prerequisiteError;
}

async function applied(): Promise<string[]> {
  const r = await db.query<{ name: string }>(`SELECT name FROM pgmigrations ORDER BY id`);
  return r.rows.map((x) => x.name);
}
async function snapshotColumns(): Promise<string[]> {
  const r = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'iam2' AND table_name = 'approval_request' AND column_name LIKE 'snapshot%' ORDER BY 1`,
  );
  return r.rows.map((x) => x.column_name);
}

const SKIP_REASON =
  "TEST_DATABASE_URL is not configured: the migration 072 disposable-database tests are SKIPPED, not passed. " +
  "Set it to a Postgres superuser URL (a role that can CREATE ROLE and CREATE DATABASE) to run them.";

// Explicit, named skip when the database environment is not configured.
// Registered ONLY when unconfigured, so a configured run reports no spurious skips.
if (!TEST_DB) {
  describe("IAM02-AUTHZ-REM-001 — migration 072 on a disposable database (not configured)", () => {
    it.skip(SKIP_REASON, () => {});
  });
}

describe.skipIf(!TEST_DB)("IAM02-AUTHZ-REM-001 — migration 072 on a disposable database", () => {
  beforeAll(async () => {
    if (!existsSync(BIN)) {
      prerequisiteError = new Error(
        `PREREQUISITE UNAVAILABLE: the node-pg-migrate binary was not found at ${BIN}. ` +
          "Run `npm install` in platform/ so the repository's own migration runner is available; this test refuses to pass without running the migration chain.",
      );
      return;
    }
    admin = new Pool({ connectionString: urlFor("postgres") });
    try {
      for (const r of ["aml1", "cfg1", "clt1", "fnd", "iam2", "iam", "kyc1", "sec1", "wlt1"]) {
        await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_${r}_runtime') THEN CREATE ROLE role_${r}_runtime NOLOGIN; END IF; END $$;`);
      }
      await admin.query(`CREATE DATABASE ${DB_NAME}`);
      databaseCreated = true;
    } catch (err) {
      const e = err as { code?: string; message?: string };
      prerequisiteError = new Error(
        `PREREQUISITE UNAVAILABLE: TEST_DATABASE_URL is configured but this role cannot prepare the disposable migration database ` +
          `(CREATE ROLE / CREATE DATABASE ${DB_NAME} on the server's maintenance database): [${e.code ?? "no sqlstate"}] ${e.message ?? String(err)}. ` +
          "Use a superuser (or CREATEROLE + CREATEDB) URL; this test refuses to pass without running the migration chain.",
      );
    }
  });
  afterAll(async () => {
    if (db) await db.end();
    if (admin) {
      if (databaseCreated) await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
      await admin.end();
    }
  });

  it("forward: 001…071 apply, legacy approval data is seeded, then 072 applies WITHOUT touching it (legacy rows stay snapshot-less => fail closed in the application)", { timeout: 240_000 }, async () => {
    assertPrerequisites();
    const upTo71 = migrate(["up", "71"]);
    expect(upTo71.ok, upTo71.output).toBe(true);
    db = new Pool({ connectionString: urlFor(DB_NAME) });
    expect((await applied()).at(-1)).toBe("071_cfg1_environment_scope");
    expect(await snapshotColumns()).toEqual([]);

    // Pre-072 ("legacy") data, including a state 072 must tolerate: a pending request with count 2.
    await db.query(
      `INSERT INTO iam2.approval_policy (policy_id, action, resource, threshold_type, required_approver_roles, required_approval_count, requires_step_up, expiry_minutes, status)
       VALUES ('pol_legacy','a.b.c','r','count','[]'::jsonb,2,true,60,'active')`,
    );
    await db.query(
      `INSERT INTO iam2.approval_request (approval_id, policy_id, maker_user_id, action, resource, status, required_count, approved_count, expires_at_utc)
       VALUES ('appr_legacy_pending','pol_legacy','u_maker','a.b.c','r','pending',2,0, now() + interval '1 hour'),
              ('appr_legacy_approved','pol_legacy','u_maker','a.b.c','r','approved',1,1, now() + interval '1 hour')`,
    );

    const up72 = migrate(["up"]);
    expect(up72.ok, up72.output).toBe(true);
    expect((await applied()).at(-1)).toBe("072_iam2_approval_authz_hardening");
    expect(await snapshotColumns()).toEqual(["snapshot_required_approver_roles", "snapshot_requires_step_up", "snapshot_taken_at_utc", "snapshot_threshold_type"]);

    const legacy = await db.query(`SELECT approval_id, required_count, status, snapshot_taken_at_utc, snapshot_requires_step_up, snapshot_required_approver_roles, snapshot_threshold_type FROM iam2.approval_request ORDER BY approval_id`);
    expect(legacy.rows).toHaveLength(2);
    for (const row of legacy.rows) {
      expect(row.snapshot_taken_at_utc).toBeNull();
      expect(row.snapshot_requires_step_up).toBeNull();
      expect(row.snapshot_required_approver_roles).toBeNull();
      expect(row.snapshot_threshold_type).toBeNull();
    }
    expect(legacy.rows.find((r) => r.approval_id === "appr_legacy_pending")).toMatchObject({ required_count: 2, status: "pending" });
    // The policy's TRUE count is untouched (never lowered).
    expect((await db.query(`SELECT required_approval_count FROM iam2.approval_policy WHERE policy_id = 'pol_legacy'`)).rows[0]!.required_approval_count).toBe(2);
  });

  it("policy uniqueness, snapshot CHECKs and the all-or-none snapshot rule", { timeout: 60_000 }, async () => {
    assertPrerequisites();
    await expect(
      db.query(`INSERT INTO iam2.approval_policy (policy_id, action, resource, threshold_type, status) VALUES ('pol_dup','a.b.c','r','count','active')`),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      db.query(`INSERT INTO iam2.approval_policy (policy_id, action, resource, threshold_type, status) VALUES ('pol_ret','a.b.c','r','count','inactive')`),
    ).resolves.toBeTruthy();
    // partial snapshot (only some columns) is rejected
    await expect(
      db.query(
        `INSERT INTO iam2.approval_request (approval_id, policy_id, maker_user_id, action, resource, status, required_count, approved_count, expires_at_utc, snapshot_taken_at_utc)
         VALUES ('appr_partial','pol_legacy','u','a.b.c','r','pending',1,0, now() + interval '1 hour', now())`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    // a full snapshot with count 1 is accepted; count 2 is rejected
    const ins = (count: number) =>
      db.query(
        `INSERT INTO iam2.approval_request (approval_id, policy_id, maker_user_id, action, resource, status, required_count, approved_count, expires_at_utc,
           snapshot_taken_at_utc, snapshot_requires_step_up, snapshot_required_approver_roles, snapshot_threshold_type)
         VALUES ($1,'pol_legacy','u','a.b.c','r','pending',$2,0, now() + interval '1 hour', now(), true, '[]'::jsonb, 'count')`,
        ["appr_full_" + randomUUID(), count],
      );
    await expect(ins(1)).resolves.toBeTruthy();
    await expect(ins(2)).rejects.toMatchObject({ code: "23514" });
  });

  it("runtime-grant compatibility: 072 needs and changes NO grant — the runtime role's privileges on the two tables are exactly the existing ones", { timeout: 60_000 }, async () => {
    assertPrerequisites();
    const grantsFile = resolve(PLATFORM_DIR, "infra", "grants", "iam2_runtime_grants.sql");
    expect(existsSync(grantsFile)).toBe(true);
    const r = await db.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'role_iam2_runtime' AND table_schema = 'iam2' AND table_name IN ('approval_policy','approval_request','approval_decision')
        ORDER BY 1,2`,
    );
    // Before the grants file is applied to THIS disposable database there are none — and
    // 072 itself granted nothing. Apply the unchanged file and compare.
    expect(r.rows).toEqual([]);
    // Apply the three UNCHANGED grant files as plain SQL (multi-statement simple query, no psql needed).
    for (const f of ["fnd_runtime_grants.sql", "iam_runtime_grants.sql", "iam2_runtime_grants.sql"]) {
      await db.query(readFileSync(resolve(PLATFORM_DIR, "infra", "grants", f), "utf8"));
    }
    const after = await db.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'role_iam2_runtime' AND table_schema = 'iam2' AND table_name IN ('approval_policy','approval_request','approval_decision')
        ORDER BY 1,2`,
    );
    expect(after.rows.map((x) => `${x.table_name}:${x.privilege_type}`)).toEqual([
      "approval_decision:INSERT",
      "approval_policy:SELECT",
      "approval_request:INSERT",
      "approval_request:SELECT",
      "approval_request:UPDATE",
    ]);
  });

  it("IMPL-03: the immutability trigger IS the control — with the trigger disabled the binding columns are mutable (and only some are guarded by CHECKs); with it enabled every one is rejected with SQLSTATE 23514 from the trigger function", { timeout: 60_000 }, async () => {
    assertPrerequisites();
    const approvalId = "appr_trg_" + randomUUID();
    await db.query(
      `INSERT INTO iam2.approval_request (approval_id, policy_id, maker_user_id, action, resource, entity_id, client_id, payload_hash, status, required_count, approved_count, expires_at_utc,
         snapshot_taken_at_utc, snapshot_requires_step_up, snapshot_required_approver_roles, snapshot_threshold_type)
       VALUES ($1,'pol_legacy','u_maker','a.b.c','r','e','c','sha256:x','pending',1,0, now() + interval '1 hour', now(), true, '[]'::jsonb, 'count')`,
      [approvalId],
    );
    const columns: Array<[string, string]> = [
      ["maker_user_id", "maker_user_id = 'u_evil'"],
      ["action", "action = 'x.other'"],
      ["resource", "resource = 'other'"],
      ["entity_id", "entity_id = 'other'"],
      ["client_id", "client_id = 'other'"],
      ["payload_hash", "payload_hash = 'sha256:evil'"],
      ["payload_ref", "payload_ref = 'evil'"],
      ["required_count (+expires_at_utc)", "required_count = 1, expires_at_utc = now() + interval '9 days'"],
      ["expires_at_utc", "expires_at_utc = now() + interval '9 days'"],
      ["created_at_utc", "created_at_utc = now() - interval '1 day'"],
      ["snapshot_requires_step_up", "snapshot_requires_step_up = false"],
      ["snapshot_required_approver_roles", "snapshot_required_approver_roles = '[\"x\"]'::jsonb"],
      ["snapshot_threshold_type", "snapshot_threshold_type = 'risk'"],
      // Columns that table CHECKs would ALSO catch if the trigger were absent:
      ["policy_id (CHECK-guarded)", "policy_id = NULL"],
      ["snapshot_taken_at_utc (CHECK-guarded)", "snapshot_taken_at_utc = NULL"],
    ];
    const tryUpdate = async (setClause: string) => {
      const c = await db.connect();
      try {
        await c.query("BEGIN");
        await c.query(`UPDATE iam2.approval_request SET ${setClause} WHERE approval_id = $1`, [approvalId]);
        return { ok: true as const };
      } catch (err) {
        return { ok: false as const, err: err as { code?: string; message?: string; constraint?: string; where?: string } };
      } finally {
        await c.query("ROLLBACK").catch(() => undefined);
        c.release();
      }
    };

    // WITHOUT the trigger: the table CHECKs alone leave most binding columns mutable.
    await db.query(`ALTER TABLE iam2.approval_request DISABLE TRIGGER trg_iam2_approval_request_binding_is_immutable`);
    let mutableWithoutTrigger = 0;
    try {
      for (const [name, set] of columns) {
        const r = await tryUpdate(set);
        if (name.endsWith("(CHECK-guarded)")) {
          expect(r.ok, `${name} without the trigger`).toBe(false);
          if (!r.ok) expect(r.err.constraint, `${name} without the trigger fails on a CHECK`).toBeTruthy();
        } else {
          expect(r.ok, `${name} must be mutable without the trigger (so the trigger is what protects it)`).toBe(true);
          mutableWithoutTrigger += 1;
        }
      }
    } finally {
      await db.query(`ALTER TABLE iam2.approval_request ENABLE TRIGGER trg_iam2_approval_request_binding_is_immutable`);
    }
    expect(mutableWithoutTrigger).toBe(13);

    // WITH the trigger: every one is rejected by the trigger function, never by a table constraint.
    for (const [name, set] of columns) {
      const r = await tryUpdate(set);
      expect(r.ok, name).toBe(false);
      if (r.ok) continue;
      expect(r.err.code, `${name}: SQLSTATE`).toBe("23514");
      expect(r.err.message, `${name}: message`).toBe(`iam2.approval_request ${approvalId} binding and snapshot columns are immutable`);
      expect(r.err.constraint, `${name}: not a table constraint`).toBeUndefined();
      expect(r.err.where, `${name}: raised in the trigger function`).toContain("fn_approval_request_binding_is_immutable");
    }
    // Legitimate transitions stay possible.
    const ok = await tryUpdate("status = 'expired', approved_count = approved_count, completed_at_utc = now()");
    expect(ok.ok).toBe(true);
  });

  it("T-48 rollback: with NO revoked policy `down` succeeds and restores the previous schema; `up` re-applies; revoked blocks the rollback atomically (REFUSAL)", { timeout: 240_000 }, async () => {
    assertPrerequisites();
    const down = migrate(["down", "1"]);
    expect(down.ok, down.output).toBe(true);
    expect((await applied()).at(-1)).toBe("071_cfg1_environment_scope");
    expect(await snapshotColumns()).toEqual([]);
    const statusDef = await db.query<{ def: string }>(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'approval_policy_status_check'`);
    expect(statusDef.rows[0]!.def).toContain("inactive");
    expect(statusDef.rows[0]!.def).not.toContain("revoked");
    expect((await db.query(`SELECT 1 FROM pg_trigger WHERE tgname IN ('trg_iam2_approval_request_binding_is_immutable','trg_iam2_approval_policy_revoked_is_terminal')`)).rowCount).toBe(0);
    // legacy data survived the round trip
    expect((await db.query(`SELECT 1 FROM iam2.approval_request WHERE approval_id LIKE 'appr_legacy%'`)).rowCount).toBe(2);

    const upAgain = migrate(["up"]);
    expect(upAgain.ok, upAgain.output).toBe(true);
    expect((await applied()).at(-1)).toBe("072_iam2_approval_authz_hardening");

    // Emergency revocation recorded -> rollback must REFUSE and change nothing.
    await db.query(`UPDATE iam2.approval_policy SET status = 'revoked' WHERE policy_id = 'pol_legacy'`);
    const refused = migrate(["down", "1"]);
    expect(refused.ok).toBe(false);
    expect(refused.output).toContain("072 down refused");
    expect((await applied()).at(-1)).toBe("072_iam2_approval_authz_hardening");
    expect(await snapshotColumns()).toHaveLength(4);
    const policy = await db.query(`SELECT status FROM iam2.approval_policy WHERE policy_id = 'pol_legacy'`);
    expect(policy.rows[0]!.status).toBe("revoked"); // NEVER converted into 'inactive'
    expect((await db.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'trg_iam2_approval_request_binding_is_immutable'`)).rowCount).toBe(1);
    // revoked is terminal: it cannot be quietly un-revoked to unblock a rollback
    await expect(db.query(`UPDATE iam2.approval_policy SET status = 'inactive' WHERE policy_id = 'pol_legacy'`)).rejects.toMatchObject({ code: "23514" });
  });
});
