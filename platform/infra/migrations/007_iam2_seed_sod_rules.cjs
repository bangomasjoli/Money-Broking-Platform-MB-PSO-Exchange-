/* eslint-disable camelcase */

/**
 * 007_iam2_seed_sod_rules — IAM-02 Phase 3-5 additive migration (RBAC/Permission Guard/SoD
 * stage 2). Two independent additions, both additive-only (no stage-1 table/column changes):
 *
 * 1. META-SOD SEED ROWS (07_Permission_Rules.md §5.6A.7 / §10 rule 5: "SoD matrix editor
 *    cannot also assign roles or permissions"). Seeded as `conflict_type = 'permission_permission'`
 *    rows because the conflict is expressed at the PERMISSION level (`iam2.sod.manage` vs.
 *    `iam2.role.assign_user` / `iam2.permission.assign_role`), not the role level — no role in
 *    the provisional bootstrap catalogue is itself named "sod manager". TWO rows are needed
 *    (left_ref/right_ref is a single pair per row) to cover both conflicting permissions.
 *    `severity = 'critical'` + `enforcement = 'block'` + `risk_acceptance_allowed = false` is
 *    required by 006's own CHECK constraints (critical implies block-only, never risk-
 *    acceptable) — this rule could not be seeded any other way even if we wanted to.
 *    See services/iam2/src/lib/sod.ts for HOW this gets evaluated (it is not inert — both
 *    `checkRoleAssignmentSodConflict` and `checkApprovalSodConflict` resolve
 *    `permission_permission` rows against each side's EFFECTIVE permission set, not just role
 *    codes, which is what makes this seeded row actually enforceable).
 *
 * 2. `iam2.fn_count_active_role_assignments(varchar[])` — a narrow SECURITY DEFINER helper
 *    function, needed by the bootstrap-to-RBAC transition endpoint (routes/bootstrap.ts) to
 *    check condition (d) of the approved design: "no active iam2.user_role row exists yet for
 *    role_code IN ('security_admin','tech_admin') ANYWHERE IN THE TABLE". `iam2.user_role`
 *    carries ENABLE + FORCE ROW LEVEL SECURITY with an ownership policy scoped to
 *    `current_setting('aix.user_id', true)` (006) — an ordinary scoped query can only ever see
 *    ONE user's rows, never "does any row exist for this role across every user". This is
 *    structurally the same class of problem IAM-01 already solved for its own pre-auth/
 *    global-scope lookups via a SECURITY DEFINER function (see 006's header comment on
 *    `permission_decision_token`'s RLS design, and IAM-01's own precedent for
 *    `iam.session`/`iam.refresh_token`) — this migration applies that SAME established
 *    pattern to a new spot rather than inventing new architecture. The function is `SECURITY
 *    DEFINER` (runs with the privileges of whichever role owns it, i.e. whoever ran this
 *    migration — expected to be a superuser/BYPASSRLS/table-owning role in every environment,
 *    exactly like every other SECURITY DEFINER escape hatch on this platform) and does NOT
 *    grant table-level SELECT on `iam2.user_role` to `role_iam2_runtime` — only EXECUTE on
 *    this one narrow, purpose-built, boolean-shaped (well, count-shaped) function. It returns
 *    a COUNT, not row contents, so it cannot be used to exfiltrate any other user's role
 *    assignments — the least-privilege surface stays as narrow as the one call site needs.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.sod_rule
      (sod_rule_id, conflict_type, left_ref, right_ref, severity, enforcement, status, owner, matrix_version, risk_acceptance_allowed)
    VALUES
      ('sod_meta_sod_manage_vs_role_assign_user',
       'permission_permission', 'iam2.sod.manage', 'iam2.role.assign_user',
       'critical', 'block', 'active', 'IAM-02', 1, false),
      ('sod_meta_sod_manage_vs_permission_assign_role',
       'permission_permission', 'iam2.sod.manage', 'iam2.permission.assign_role',
       'critical', 'block', 'active', 'IAM-02', 1, false);

    CREATE OR REPLACE FUNCTION iam2.fn_count_active_role_assignments(p_role_codes varchar(64)[])
    RETURNS bigint
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = iam2, pg_temp
    AS $$
      SELECT count(*)::bigint
        FROM iam2.user_role ur
        JOIN iam2.role r ON r.role_id = ur.role_id
       WHERE r.role_code = ANY(p_role_codes)
         AND ur.status = 'active'
         AND ur.revoked_at_utc IS NULL
         AND (ur.expires_at_utc IS NULL OR ur.expires_at_utc > now());
    $$;

    GRANT EXECUTE ON FUNCTION iam2.fn_count_active_role_assignments(varchar(64)[]) TO role_iam2_runtime;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP FUNCTION IF EXISTS iam2.fn_count_active_role_assignments(varchar(64)[]);
    DELETE FROM iam2.sod_rule WHERE sod_rule_id IN (
      'sod_meta_sod_manage_vs_role_assign_user',
      'sod_meta_sod_manage_vs_permission_assign_role'
    );
  `);
};
