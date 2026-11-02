/**
 * IAM02-AUTHZ-REM-001 — duplicate-decision / SAVEPOINT regression at the DATABASE level, as
 * the runtime role (plan §8.1 exception X-2, §8 intro; T-24, T-25, T-44; owner clarification 1,
 * Issue #6 comment 6340858922).
 *
 * Why database level: with the AZ-18 count-1 gate the `23505` branch of the decision insert is
 * not reachable through the application (the request row lock serialises same-approver
 * attempts and the second sees a terminal status — covered at the application level by
 * iam2-db.test.ts "a duplicate approval decision ..." at count 1). The control itself is still
 * required (latent for the later multi-approver lifting task), so this file exercises the
 * PRODUCTION SQL (`insertApprovalDecision`, lib/approval-decision.ts) inside real transactions
 * on a LOGIN role that is a member of `role_iam2_runtime` only.
 *
 * PREREQUISITES ARE NEVER SILENTLY SKIPPED (IMPL-02 / N-1 convention). With TEST_DATABASE_URL unset the
 * suite is skipped with an explicit, named reason. With it SET, the database must hold foundation, iam
 * and iam2 (006, 072) migrated and the fnd/iam/iam2 grant files applied; if it does not (or is
 * unreachable, or the test login role cannot be prepared) EVERY test FAILS with the prerequisite
 * evidence. There is no early-return that passes.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import {
  APPROVAL_DECISION_DUPLICATE_CONSTRAINT,
  insertApprovalDecision,
} from "../../services/iam2/src/lib/approval-decision.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "iam2_authz_rem_decision_rt";

let verifyPool: Pool;
let runtimePool: Pool;
/** Set when a prerequisite is unavailable; every test then FAILS with this evidence. */
let prerequisiteError: Error | undefined;

function assertPrerequisites(): void {
  if (prerequisiteError) throw prerequisiteError;
}

const SKIP_REASON =
  "TEST_DATABASE_URL is not configured: the IAM-02 duplicate-decision / SAVEPOINT database tests are SKIPPED, not passed. " +
  "Set it to a Postgres superuser URL with foundation, iam and iam2 (incl. migration 072) migrated and the fnd/iam/iam2 grant files applied.";

// Explicit, named skip when the database environment is not configured.
// Registered ONLY when unconfigured, so a configured run reports no spurious skips.
if (!TEST_DB) {
  describe("IAM02-AUTHZ-REM-001 — duplicate decision / SAVEPOINT (runtime role, database level) (not configured)", () => {
    it.skip(SKIP_REASON, () => {});
  });
}

/** Everything this file needs that a configured TEST_DATABASE_URL must already provide. */
async function missingPrerequisites(pool: Pool, extraGrants: Array<[table: string, privilege: string]>): Promise<string[]> {
  const missing: string[] = [];
  const schemas = await pool.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('foundation','iam','iam2')`,
  );
  const have = new Set(schemas.rows.map((r) => r.schema_name));
  for (const s of ["foundation", "iam", "iam2"]) if (!have.has(s)) missing.push(`schema ${s} is missing (run migrate:up)`);
  const role = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'role_iam2_runtime'`);
  if ((role.rowCount ?? 0) === 0) missing.push("role role_iam2_runtime is missing (create the runtime roles before migrating)");
  if (have.has("iam2")) {
    const col = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'iam2' AND table_name = 'approval_request' AND column_name = 'snapshot_taken_at_utc'`,
    );
    if ((col.rowCount ?? 0) === 0) missing.push("migration 072 is not applied (iam2.approval_request.snapshot_taken_at_utc is missing)");
    if ((role.rowCount ?? 0) > 0) {
      for (const [table, privilege] of [["iam2.approval_request", "SELECT"], ...extraGrants]) {
        const grant = await pool.query<{ ok: boolean | null }>(
          `SELECT to_regclass($1) IS NOT NULL AND has_table_privilege('role_iam2_runtime', $1, $2) AS ok`,
          [table, privilege],
        );
        if (grant.rows[0]?.ok !== true) missing.push(`iam2_runtime_grants.sql is not applied (role_iam2_runtime lacks ${privilege} on ${table})`);
      }
    }
  }
  return missing;
}

async function newApproval(): Promise<string> {
  const id = "appr_rem_dec_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO iam2.approval_request (approval_id, maker_user_id, action, resource, status, required_count, approved_count, expires_at_utc)
     VALUES ($1,'user_rem_dec_maker','iam2.rem.dec','rem','pending',1,0, now() + interval '1 hour')`,
    [id],
  );
  return id;
}

async function sodCheck(client: PoolClient, user: string, tag: string): Promise<void> {
  await client.query(
    `INSERT INTO iam2.sod_check (sod_check_id, user_id, proposed_ref, result, matched_rules) VALUES ($1,$2,$3,'pass','[]')`,
    ["sodchk_rem_" + randomUUID(), user, tag],
  );
}

function decisionInput(approvalId: string, approver: string, decisionId = "apprdec_rem_" + randomUUID()) {
  return {
    decisionId,
    approvalId,
    approverUserId: approver,
    decision: "approve" as const,
    decisionReason: null,
    stepUpAssertionRef: null,
    sodCheckId: null,
    correlationId: null,
  };
}

async function sodCount(tag: string): Promise<number> {
  const r = await verifyPool.query(`SELECT 1 FROM iam2.sod_check WHERE proposed_ref LIKE $1`, [`${tag}%`]);
  return r.rowCount ?? 0;
}

describe.skipIf(!TEST_DB)("IAM02-AUTHZ-REM-001 — duplicate decision / SAVEPOINT (runtime role, database level)", () => {
  beforeAll(async () => {
    try {
      verifyPool = new Pool({ connectionString: TEST_DB ?? "postgres://unused" });
      const missing = await missingPrerequisites(verifyPool, [["iam2.approval_decision", "INSERT"], ["iam2.sod_check", "INSERT"]]);
      if (missing.length > 0) {
        prerequisiteError = new Error(
          `PREREQUISITE UNAVAILABLE: TEST_DATABASE_URL is configured but the IAM-02 test database is not ready: ${missing.join("; ")}. ` +
            "Run migrate:up (001-072) and apply infra/grants/{fnd,iam,iam2}_runtime_grants.sql; this test refuses to pass without running.",
        );
        return;
      }
      await verifyPool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN; END IF; END $$;`);
      await verifyPool.query(`GRANT role_iam2_runtime TO ${RUNTIME_ROLE_USER}`);
      runtimePool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
      const who = await runtimePool.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`);
      expect(who.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      prerequisiteError = new Error(
        `PREREQUISITE UNAVAILABLE: TEST_DATABASE_URL is configured but the test environment could not be prepared: [${e.code ?? "no sqlstate"}] ${e.message ?? String(err)}. ` +
          "Use a superuser (or CREATEROLE) URL to a migrated database; this test refuses to pass without running.",
      );
    }
  }, 60_000);
  afterAll(async () => {
    if (runtimePool) await runtimePool.end();
    if (verifyPool) await verifyPool.end();
  });

  it("control (the F07 defect without the SAVEPOINT): a duplicate aborts the transaction and COMMIT becomes ROLLBACK, discarding the same-transaction evidence", async () => {
    assertPrerequisites();
    const approvalId = await newApproval();
    const tag = "rem_ctl_" + randomUUID();
    const c = await runtimePool.connect();
    try {
      await c.query("BEGIN");
      await sodCheck(c, "user_a", tag + "_before");
      const sql = `INSERT INTO iam2.approval_decision (decision_id, approval_id, approver_user_id, decision) VALUES ($1,$2,'user_a','approve')`;
      await c.query(sql, ["apprdec_rem_" + randomUUID(), approvalId]);
      await expect(c.query(sql, ["apprdec_rem_" + randomUUID(), approvalId])).rejects.toMatchObject({ code: "23505", constraint: APPROVAL_DECISION_DUPLICATE_CONSTRAINT });
      await expect(sodCheck(c, "user_a", tag + "_after")).rejects.toMatchObject({ code: "25P02" });
      const commit = await c.query("COMMIT");
      expect(commit.command).toBe("ROLLBACK");
    } finally {
      c.release();
    }
    expect(await sodCount(tag)).toBe(0);
  });

  it("T-24: with the SAVEPOINT a duplicate (approval_id, approver_user_id) is detected, and the surrounding sod_check / decision-log evidence is COMMITTED", async () => {
    assertPrerequisites();
    const approvalId = await newApproval();
    const tag = "rem_t24_" + randomUUID();
    const c = await runtimePool.connect();
    try {
      await c.query("BEGIN");
      await sodCheck(c, "user_a", tag + "_before");
      expect(await insertApprovalDecision(c, decisionInput(approvalId, "user_a"))).toBe("inserted");
      await sodCheck(c, "user_a", tag + "_mid");
      expect(await insertApprovalDecision(c, decisionInput(approvalId, "user_a"))).toBe("duplicate");
      await sodCheck(c, "user_a", tag + "_after");
      await c.query(
        `INSERT INTO iam2.permission_decision_log (decision_id, actor_user_id, action, resource, decision, reason_code) VALUES ($1,'user_a','iam2.approval.approve','approval','allow','role_permission_grant')`,
        ["dec_rem_" + randomUUID()],
      );
      const commit = await c.query("COMMIT");
      expect(commit.command).toBe("COMMIT");
    } finally {
      c.release();
    }
    expect(await sodCount(tag)).toBe(3);
    const decisions = await verifyPool.query(`SELECT 1 FROM iam2.approval_decision WHERE approval_id = $1`, [approvalId]);
    expect(decisions.rowCount).toBe(1);
  });

  it("T-25: ONLY the named (approval_id, approver_user_id) constraint is a duplicate; a decision_id collision and any other error abort fail-closed; both constraint names exist", async () => {
    assertPrerequisites();
    const names = await verifyPool.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'iam2.approval_decision'::regclass AND contype = 'u'`,
    );
    const have = names.rows.map((r) => r.conname);
    expect(have).toContain(APPROVAL_DECISION_DUPLICATE_CONSTRAINT);
    expect(have).toContain("approval_decision_decision_id_key");

    // decision_id collision across DIFFERENT approvers: 23505 on the OTHER constraint -> rethrown.
    const approvalId = await newApproval();
    const tag = "rem_t25_" + randomUUID();
    const sharedDecisionId = "apprdec_rem_shared_" + randomUUID();
    const c = await runtimePool.connect();
    try {
      await c.query("BEGIN");
      await sodCheck(c, "user_a", tag);
      expect(await insertApprovalDecision(c, decisionInput(approvalId, "user_a", sharedDecisionId))).toBe("inserted");
      await expect(insertApprovalDecision(c, decisionInput(approvalId, "user_b", sharedDecisionId))).rejects.toMatchObject({
        code: "23505",
        constraint: "approval_decision_decision_id_key",
      });
      // The caller's transaction is still usable only because the SAVEPOINT was rolled back; the
      // application does not continue — it throws, and the transaction rolls back fail-closed.
      await c.query("ROLLBACK");
    } finally {
      c.release();
    }
    expect(await sodCount(tag)).toBe(0);
    expect((await verifyPool.query(`SELECT 1 FROM iam2.approval_decision WHERE approval_id = $1`, [approvalId])).rowCount).toBe(0);

    // any other error (FK violation: unknown approval) is rethrown, never swallowed as a duplicate
    const c2 = await runtimePool.connect();
    try {
      await c2.query("BEGIN");
      await expect(insertApprovalDecision(c2, decisionInput("appr_rem_does_not_exist_" + randomUUID(), "user_a"))).rejects.toMatchObject({ code: "23503" });
      await c2.query("ROLLBACK");
    } finally {
      c2.release();
    }
  });

  it("T-44: three simultaneous same-approver transactions -> exactly one decision row, two 'duplicate' outcomes, and ALL surrounding evidence persisted", async () => {
    assertPrerequisites();
    const approvalId = await newApproval();
    const tag = "rem_t44_" + randomUUID();
    const run = async (n: number): Promise<"inserted" | "duplicate"> => {
      const c = await runtimePool.connect();
      try {
        await c.query("BEGIN");
        await sodCheck(c, "user_a", `${tag}_${n}_before`);
        const outcome = await insertApprovalDecision(c, decisionInput(approvalId, "user_a"));
        await sodCheck(c, "user_a", `${tag}_${n}_after`);
        const commit = await c.query("COMMIT");
        expect(commit.command).toBe("COMMIT");
        return outcome;
      } finally {
        c.release();
      }
    };
    const outcomes = await Promise.all([run(1), run(2), run(3)]);
    expect(outcomes.filter((o) => o === "inserted").length).toBe(1);
    expect(outcomes.filter((o) => o === "duplicate").length).toBe(2);
    expect((await verifyPool.query(`SELECT 1 FROM iam2.approval_decision WHERE approval_id = $1`, [approvalId])).rowCount).toBe(1);
    expect(await sodCount(tag)).toBe(6);
  });

  it("T-44: the runtime role still lacks ON CONFLICT / RETURNING on approval_decision (the reason the SAVEPOINT strategy is used) and holds no DELETE", async () => {
    assertPrerequisites();
    const approvalId = await newApproval();
    await expect(
      runtimePool.query(`INSERT INTO iam2.approval_decision (decision_id, approval_id, approver_user_id, decision) VALUES ($1,$2,'u','approve') ON CONFLICT (approval_id, approver_user_id) DO NOTHING`, ["apprdec_rem_" + randomUUID(), approvalId]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      runtimePool.query(`INSERT INTO iam2.approval_decision (decision_id, approval_id, approver_user_id, decision) VALUES ($1,$2,'u','approve') RETURNING decision_id`, ["apprdec_rem_" + randomUUID(), approvalId]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(runtimePool.query(`DELETE FROM iam2.approval_decision WHERE approval_id = $1`, [approvalId])).rejects.toMatchObject({ code: "42501" });
  });
});
