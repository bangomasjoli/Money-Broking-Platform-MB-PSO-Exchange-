/**
 * IAM-02 Phase 4 — real SoD (Segregation of Duties) enforcement.
 *
 * `guard.ts` step 5 stays a documented no-op (see its inline comment): a plain
 * `permission/check` call has no "proposed change" to test against `iam2.sod_rule`. SoD is
 * instead enforced at the two places something is actually ASSIGNED or DECIDED:
 *   - `routes/roles.ts` -> `checkRoleAssignmentSodConflict` (assigning role R to user U).
 *   - `routes/approvals.ts` -> `checkApprovalSodConflict` (approver A deciding maker M's
 *     request).
 *
 * ---------------------------------------------------------------------------------------
 * DESIGN — how the meta-SoD (`permission_permission`) rule is actually evaluated.
 * ---------------------------------------------------------------------------------------
 * `iam2.sod_rule.conflict_type` has three shapes: `role_role`, `permission_permission`,
 * `action_action`. A naive "conflict_type = role_role" check (comparing only the target
 * ROLE CODE against the user's existing role codes) would never fire for the meta-SoD rule
 * seeded in 007 (`iam2.sod.manage` conflicts with `iam2.role.assign_user` /
 * `iam2.permission.assign_role`), because that rule's `left_ref`/`right_ref` are PERMISSION
 * codes, not role codes, and no role in the provisional bootstrap catalogue is itself named
 * `iam2.sod.manage`. Seeding it and never evaluating it would be "present but inert" — the
 * task brief explicitly asks not to do that.
 *
 * So both functions here resolve conflicts at the PERMISSION level, not just the role-code
 * level: for a candidate assignment/decision, compute the EFFECTIVE set of permission codes
 * each side would hold (role -> role_permission -> permission_code, unioned across every
 * active role that side holds), and test every active `permission_permission` sod_rule row
 * for cross-membership. `role_role` rows are ALSO evaluated (directly comparing role codes)
 * so any future row of that shape is enforced too, even though none is seeded this stage
 * (07_Permission_Rules.md §13 leaves the full canonical matrix open — only the meta-SoD row
 * is seeded now, per the brief). `action_action` rows are not evaluated — no seed data of
 * that shape exists and the brief does not require it this stage.
 */
import type { PoolClient } from "pg";

export interface SodCheckResult {
  blocked: boolean;
  matchedRuleIds: string[];
}

interface SodRuleRow {
  sod_rule_id: string;
  conflict_type: "role_role" | "permission_permission" | "action_action";
  left_ref: string;
  right_ref: string;
}

async function activeSodRules(client: PoolClient): Promise<SodRuleRow[]> {
  const rows = await client.query<SodRuleRow>(
    `SELECT sod_rule_id, conflict_type, left_ref, right_ref
       FROM iam2.sod_rule
      WHERE status = 'active' AND conflict_type IN ('role_role','permission_permission')`,
  );
  return rows.rows;
}

interface EffectiveGrants {
  roleCodes: Set<string>;
  permissionCodes: Set<string>;
}

/**
 * A user's CURRENT effective role codes + permission codes (via their active roles). Reads
 * `iam2.user_role` (RLS ownership by `user_id`) — scopes `aix.user_id` to `userId` first, same
 * pattern as guard.ts's `lookupActiveRoleGrants`.
 */
async function effectiveGrants(client: PoolClient, userId: string): Promise<EffectiveGrants> {
  await client.query("SELECT set_config('aix.user_id', $1, true)", [userId]);
  const rows = await client.query<{ role_code: string; permission_code: string | null }>(
    `SELECT DISTINCT r.role_code, p.permission_code
       FROM iam2.user_role ur
       JOIN iam2.role r ON r.role_id = ur.role_id
       LEFT JOIN iam2.role_permission rp
              ON rp.role_id = ur.role_id AND rp.status = 'active' AND rp.revoked_at_utc IS NULL
             AND rp.effective_from_utc <= now()
       LEFT JOIN iam2.permission p ON p.permission_id = rp.permission_id AND p.status = 'active'
      WHERE ur.user_id = $1
        AND ur.status = 'active'
        AND ur.revoked_at_utc IS NULL
        AND ur.effective_from_utc <= now()
        AND (ur.expires_at_utc IS NULL OR ur.expires_at_utc > now())
        AND r.status = 'active'`,
    [userId],
  );
  const roleCodes = new Set<string>();
  const permissionCodes = new Set<string>();
  for (const row of rows.rows) {
    roleCodes.add(row.role_code);
    if (row.permission_code) permissionCodes.add(row.permission_code);
  }
  return { roleCodes, permissionCodes };
}

/** The permission codes a specific (not-yet-assigned) role WOULD grant. */
async function rolePermissionCodes(client: PoolClient, roleId: string): Promise<Set<string>> {
  const rows = await client.query<{ permission_code: string }>(
    `SELECT p.permission_code
       FROM iam2.role_permission rp
       JOIN iam2.permission p ON p.permission_id = rp.permission_id AND p.status = 'active'
      WHERE rp.role_id = $1 AND rp.status = 'active' AND rp.revoked_at_utc IS NULL
        AND rp.effective_from_utc <= now()`,
    [roleId],
  );
  return new Set(rows.rows.map((r) => r.permission_code));
}

function crossMatches(rules: SodRuleRow[], left: EffectiveGrants | Set<string>, right: EffectiveGrants | Set<string>): string[] {
  const leftRoles = left instanceof Set ? new Set<string>() : left.roleCodes;
  const leftPerms = left instanceof Set ? left : left.permissionCodes;
  const rightRoles = right instanceof Set ? new Set<string>() : right.roleCodes;
  const rightPerms = right instanceof Set ? right : right.permissionCodes;

  const matched: string[] = [];
  for (const rule of rules) {
    if (rule.conflict_type === "role_role") {
      const hit =
        (leftRoles.has(rule.left_ref) && rightRoles.has(rule.right_ref)) ||
        (leftRoles.has(rule.right_ref) && rightRoles.has(rule.left_ref));
      if (hit) matched.push(rule.sod_rule_id);
    } else if (rule.conflict_type === "permission_permission") {
      const hit =
        (leftPerms.has(rule.left_ref) && rightPerms.has(rule.right_ref)) ||
        (leftPerms.has(rule.right_ref) && rightPerms.has(rule.left_ref));
      if (hit) matched.push(rule.sod_rule_id);
    }
  }
  return matched;
}

export interface RoleAssignmentSodInput {
  targetUserId: string;
  targetRoleId: string;
  targetRoleCode: string;
}

/**
 * Role-assignment-time SoD check (07_Permission_Rules.md §4 rule "SoD conflict rules at role
 * assignment time"). Compares the role BEING ASSIGNED against the user's EXISTING active
 * grants, at both the role-code level (role_role rules) and the effective-permission level
 * (permission_permission rules, including the meta-SoD rule).
 */
export async function checkRoleAssignmentSodConflict(
  client: PoolClient,
  input: RoleAssignmentSodInput,
): Promise<SodCheckResult> {
  // F2 fix — sequential awaits, never Promise.all, on this shared PoolClient. Even though
  // TODAY only one of these three calls (`effectiveGrants`) issues a `set_config`, so nothing
  // currently races to clobber `aix.user_id` before its own SELECT, this is refactored to the
  // same serialized discipline as `checkApprovalSodConflict` below rather than left as the
  // anti-pattern "because it happens to be safe right now". RLS scope via
  // `set_config`/`current_setting('aix.user_id', ...)` is transaction-local SESSION STATE on a
  // shared PoolClient — concurrent `.query()` calls that mutate it can interleave in ways that
  // depend on exactly which call happens to reach the wire first (see the file-level review
  // note in `checkApprovalSodConflict`), causing a subsequent RLS-gated read to silently run
  // under the WRONG scope and return the wrong (often empty) rows. That is a fail-open SECURITY
  // risk on a control this module exists to enforce, not merely a performance concern — so the
  // same discipline is applied everywhere this pattern appears, not only where it is provably
  // broken today.
  const rules = await activeSodRules(client);
  const targetPerms = await rolePermissionCodes(client, input.targetRoleId);
  const existing = await effectiveGrants(client, input.targetUserId);

  const targetAsGrants: EffectiveGrants = { roleCodes: new Set([input.targetRoleCode]), permissionCodes: targetPerms };
  const matched = crossMatches(rules, targetAsGrants, existing);
  return { blocked: matched.length > 0, matchedRuleIds: [...new Set(matched)] };
}

export interface ApprovalSodInput {
  makerUserId: string;
  approverUserId: string;
}

/**
 * Approval-decision-time SoD check (07_Permission_Rules.md §5 "Role assigner and approver
 * same user" / "Permission admin approving own privilege escalation"). Generic: compares the
 * MAKER's effective grants against the APPROVER's effective grants for any role_role or
 * permission_permission conflict — this is what makes the meta-SoD rule bite here too (a
 * maker who holds `iam2.role.assign_user` being approved by someone who holds
 * `iam2.sod.manage` via their own role is exactly the conflict this function is meant to
 * catch, independent of — and in addition to — the separate maker != approver identity check).
 */
export async function checkApprovalSodConflict(client: PoolClient, input: ApprovalSodInput): Promise<SodCheckResult> {
  // F2 fix — was `Promise.all([effectiveGrants(maker), effectiveGrants(approver), rules])`.
  // BOTH `effectiveGrants` calls mutate transaction-local RLS scope on this SAME PoolClient
  // (`SELECT set_config('aix.user_id', $userId, true)`) before their own SELECT. JS evaluates
  // a `Promise.all` array's function calls SYNCHRONOUSLY, left-to-right, up to each one's
  // first `await`; node-postgres queues `.query()` calls on one client in submission order.
  // So with `Promise.all`, the sequence on the wire was: SET maker, SET approver (queued
  // immediately behind, BEFORE maker's own follow-up SELECT is even submitted), then maker's
  // SELECT (which runs with `aix.user_id` already overwritten to APPROVER), then approver's
  // SELECT (correct, coincidentally). Under FORCE ROW LEVEL SECURITY, maker's SELECT — scoped
  // to the WRONG user — returns ZERO rows deterministically, not just "sometimes": a genuine
  // maker<->approver SoD conflict silently goes undetected (fail-open on the exact control
  // this function exists to provide). This is the identical failure class the codebase already
  // hit once (IAM-01 `withUserScope`). Fix: run the two `effectiveGrants` calls to FULL
  // completion, one after the other — never concurrently relative to each other on this
  // client. `activeSodRules` never touches `aix.user_id`, so it may run before/after/between
  // them safely (kept first here, but that ordering is not load-bearing).
  const rules = await activeSodRules(client);
  const maker = await effectiveGrants(client, input.makerUserId);
  const approver = await effectiveGrants(client, input.approverUserId);
  const matched = crossMatches(rules, maker, approver);
  return { blocked: matched.length > 0, matchedRuleIds: [...new Set(matched)] };
}
