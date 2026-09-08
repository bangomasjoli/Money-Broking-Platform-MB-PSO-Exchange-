/* eslint-disable camelcase */

/**
 * 036_iam2_register_aml1_permissions — AML-01 Phase 2B, additive registration of AML-01's FIRST
 * IAM-02 permissions. No IAM-02 guard/grant change, no `role_permission` seed (FR-003: role-
 * permission assignment happens only through the approved IAM-02 workflow, never a raw seed
 * INSERT here).
 *
 * All four `licence_locked=false` — the CFG-01 Phase 3A F-1 lesson, applied from day one rather
 * than discovered by a later review pass. These are compliance/governance actions on AML-01's own
 * surface, correctly gated by `requires_approval` + route-layer execute-verify — `licence_locked`
 * is reserved for genuine business-capability locks (the Exchange-shaped features CFG-01's own
 * prohibited-feature registry already blocks), never for "this permission concerns compliance
 * administration." `licence_locked=true` would make IAM-02's guard hard-deny this permission
 * unconditionally, before any role/approval logic runs — permanently non-functional against the
 * real guard, invisible to a self-reported green suite if every test stubs IAM-02 (which is
 * exactly why `tests/integration/aml1-iam2-guard-real.test.ts` exists — a real, listening IAM-02
 * server, never a stub, for the positive path).
 *
 *   - `aml1.screening.read` — match-inventory read (GET .../screening-requests/:id/matches).
 *     `requires_approval=false`: a bounded, PII-free read needs permission, not a full approval
 *     cycle.
 *   - `aml1.screening.sensitive_read` — full match-detail read (GET .../matches/:id/
 *     sensitive-detail). `requires_approval=false` for the same reason — enforced instead by
 *     permission + mandatory write-before-return audit logging, mirroring SEC-01's own
 *     `sec1.audit_event.read_sensitive` precedent.
 *   - `aml1.match.confirm` / `aml1.match.dismiss` — the two disposition actions.
 *     `requires_approval=true`: maker-checker, execute-verify-bound — confirming a sanctions hit
 *     or dismissing one as a false positive is exactly the class of action that must not be
 *     unilateral.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_aml1_screening_read',           'aml1.screening.read',           'screening',       'read',           'normal',    false, false, false, false, 'active', 'AML-01'),
      ('perm_aml1_screening_sensitive_read', 'aml1.screening.sensitive_read', 'screening',       'sensitive_read', 'sensitive', false, false, false, false, 'active', 'AML-01'),
      ('perm_aml1_match_confirm',            'aml1.match.confirm',            'screening_match', 'confirm',        'sensitive', false, false, false, true,  'active', 'AML-01'),
      ('perm_aml1_match_dismiss',            'aml1.match.dismiss',            'screening_match', 'dismiss',        'sensitive', false, false, false, true,  'active', 'AML-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_aml1_screening_read',
       'perm_aml1_screening_sensitive_read',
       'perm_aml1_match_confirm',
       'perm_aml1_match_dismiss'
     );
  `);
};
