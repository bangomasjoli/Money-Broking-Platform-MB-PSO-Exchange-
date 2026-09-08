/* eslint-disable camelcase */

/**
 * 056_iam2_register_wlt1_destination_permissions — WLT-01 Phase 4A-1, additive registration of
 * WLT-01's FIRST TWO IAM-02 permissions (bringing WLT-01's total to 2, from 0). No IAM-02 guard/
 * grant change, no `role_permission` seed (FR-003: role-permission assignment happens only through
 * the approved IAM-02 workflow, never a raw seed INSERT here). Mirrors migration 041's own
 * established `NNN_iam2_register_<module>_<phase>_permissions` convention exactly.
 *
 * Both `licence_locked=false` (the CFG-01 Phase 3A F-1 lesson, applied consistently since AML-01
 * Phase 2B/3B/3C and CLT-01) — whitelist approval is an operational/compliance control on WLT-01's
 * own surface, never a genuine business-capability lock.
 *
 *   - `wlt1.destination.approve_request` — the maker's baseline-eligibility preflight
 *     (`POST /internal/wlt1/destinations/:destination_id/approve/request`). `requires_approval =
 *     false`: this route performs no destination mutation, only an advisory IAM-02 baseline check
 *     plus a local audit write.
 *   - `wlt1.destination.approve_apply` — the checker's actual whitelist-approval execution
 *     (`POST /internal/wlt1/destinations/:destination_id/approve/apply`). `requires_approval =
 *     true`: this is the genuinely sensitive, maker-checker-gated action — an operator must create
 *     a real IAM-02 approval (via IAM-02's own existing `/iam2/approvals/request` +
 *     `/iam2/approvals/:id/approve`) and this route's own `verifyDecisionToken` call is the sole
 *     real gate on the `pending_review -> approved_pending_cooling` transition.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_wlt1_destination_approve_request', 'wlt1.destination.approve_request', 'destination', 'approve_request', 'sensitive', false, false, false, false, 'active', 'WLT-01'),
      ('perm_wlt1_destination_approve_apply',   'wlt1.destination.approve_apply',   'destination', 'approve_apply',   'sensitive', false, false, false, true,  'active', 'WLT-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_wlt1_destination_approve_request',
       'perm_wlt1_destination_approve_apply'
     );
  `);
};
