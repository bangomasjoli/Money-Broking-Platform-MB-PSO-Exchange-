/**
 * IAM02-AUTHZ-REM-001 (AZ-09, F07, Q4) — safe insertion of an `approval_decision` row.
 *
 * Before: a duplicate `(approval_id, approver_user_id)` raised `23505`, the surrounding
 * transaction went into the aborted state, and `COMMIT` silently became `ROLLBACK`,
 * discarding the same-transaction `sod_check`, guard decision-log and audit rows (E-6).
 *
 * Now: the insert runs inside a SAVEPOINT. ONLY the named duplicate constraint is treated as
 * a duplicate; ANY other error — including a `decision_id` collision
 * (`approval_decision_decision_id_key`) — is rethrown after rolling back to the savepoint and
 * aborts the surrounding transaction fail-closed. No `ON CONFLICT` and no `RETURNING`: the
 * runtime role holds INSERT only on `approval_decision` and both fail `42501`.
 *
 * With the AZ-18 count-1 gate the duplicate branch is not reachable through the application
 * (the request row lock serialises attempts and the second sees a terminal status); this
 * function is exported so the database-level regression tests (T-24, T-25, T-44) exercise the
 * PRODUCTION SQL as `role_iam2_runtime` rather than a copy, and so the control stays correct
 * for the later multi-approver lifting task.
 */
import type { PoolClient } from "pg";

/** The implicit name Postgres gave `UNIQUE (approval_id, approver_user_id)` in migration 006. */
export const APPROVAL_DECISION_DUPLICATE_CONSTRAINT = "approval_decision_approval_id_approver_user_id_key";

const SAVEPOINT = "iam2_approval_decision_insert";

export interface InsertApprovalDecisionInput {
  decisionId: string;
  approvalId: string;
  approverUserId: string;
  decision: "approve" | "reject";
  decisionReason: string | null;
  stepUpAssertionRef: string | null;
  sodCheckId: string | null;
  correlationId: string | null;
}

export async function insertApprovalDecision(
  client: PoolClient,
  input: InsertApprovalDecisionInput,
): Promise<"inserted" | "duplicate"> {
  await client.query(`SAVEPOINT ${SAVEPOINT}`);
  try {
    await client.query(
      `INSERT INTO iam2.approval_decision
         (decision_id, approval_id, approver_user_id, decision, decision_reason,
          step_up_assertion_ref, sod_check_id, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.decisionId,
        input.approvalId,
        input.approverUserId,
        input.decision,
        input.decisionReason,
        input.stepUpAssertionRef,
        input.sodCheckId,
        input.correlationId,
      ],
    );
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
    await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr.code === "23505" && pgErr.constraint === APPROVAL_DECISION_DUPLICATE_CONSTRAINT) {
      return "duplicate";
    }
    throw err;
  }
  await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
  return "inserted";
}
