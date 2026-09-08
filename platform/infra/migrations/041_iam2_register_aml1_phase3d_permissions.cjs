/* eslint-disable camelcase */

/**
 * 041_iam2_register_aml1_phase3d_permissions — AML-01 Phase 3D, additive registration of AML-01's
 * NEXT TWO IAM-02 permissions (bringing AML-01's total to 11: 9 from Phase 2B/3B/3C + these 2). No
 * IAM-02 guard/grant change, no `role_permission` seed (FR-003: role-permission assignment happens
 * only through the approved IAM-02 workflow, never a raw seed INSERT here).
 *
 * Both `licence_locked=false` — the CFG-01 Phase 3A F-1 lesson, applied consistently since AML-01
 * Phase 2B/3B/3C. These are compliance/operational actions on AML-01's own surface, never a genuine
 * business-capability lock.
 *
 *   - `aml1.screening.stuck_read` — the stuck-screening list route
 *     (`GET /internal/aml1/screening-requests/stuck`). `sensitivity=normal` — the response is the
 *     same bounded, PII-free safe projection every other AML-01 read route uses
 *     (`lib/stuck-screening.ts`'s own safe-response projection: no name/registration_number/
 *     date_of_birth/nationality/matched_name/match_detail/score/raw provider payload).
 *   - `aml1.screening.stuck_recover` — the stuck-screening recovery route
 *     (`POST /internal/aml1/screening-requests/:screening_request_id/recover`).
 *     `sensitivity=sensitive`, `requires_approval=false`: recovery is a bounded, evidence-preserving
 *     operational action (marks a stuck request/attempt `failed` — no row is ever deleted, and a
 *     `failed` request cannot be delivered to CLT-01, so there is no onboarding-bypass path —
 *     confirmed Phase 3D decision D2), gated by permission plus the route's own structural
 *     `permission_granted` assertion (mirrors `cfg1.kill_switch.activate` / `aml1.monitoring.run`
 *     precedent — no execute-verify fallback exists for this permission), not a full maker-checker
 *     cycle: an approval cycle would defeat recovery during the very incident it addresses.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_aml1_screening_stuck_read',    'aml1.screening.stuck_read',    'screening', 'stuck_read',    'normal',    false, false, false, false, 'active', 'AML-01'),
      ('perm_aml1_screening_stuck_recover', 'aml1.screening.stuck_recover', 'screening', 'stuck_recover', 'sensitive', false, false, false, false, 'active', 'AML-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_aml1_screening_stuck_read',
       'perm_aml1_screening_stuck_recover'
     );
  `);
};
