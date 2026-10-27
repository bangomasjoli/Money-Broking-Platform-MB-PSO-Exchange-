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
 * Self-skips unless TEST_DATABASE_URL points at a Postgres with iam2 (006, 072) migrated and the
 * fnd/iam/iam2 grant files applied.
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
let schemaReady = false;

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
    verifyPool = new Pool({ connectionString: TEST_DB ?? "postgres://unused" });
    const r = await verifyPool.query(`SELECT count(*) AS n FROM information_schema.schemata WHERE schema_name = 'iam2'`);
    schemaReady = Number(r.rows[0]?.n) > 0;
    if (!schemaReady) return;
    await verifyPool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN; END IF; END $$;`);
    await verifyPool.query(`GRANT role_iam2_runtime TO ${RUNTIME_ROLE_USER}`);
    runtimePool = new Pool({ connectionString: (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`) });
    const who = await runtimePool.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`);
    expect(who.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
  });
  afterAll(async () => {
    if (runtimePool) await runtimePool.end();
    if (verifyPool) await verifyPool.end();
  });

  it("control (the F07 defect without the SAVEPOINT): a duplicate aborts the transaction and COMMIT becomes ROLLBACK, discarding the same-transaction evidence", async () => {
    if (!schemaReady) return;
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
    if (!schemaReady) return;
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
    if (!schemaReady) return;
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
    if (!schemaReady) return;
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
    if (!schemaReady) return;
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
