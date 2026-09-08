/* eslint-disable camelcase */

/**
 * 038_iam2_register_aml1_provider_permission — AML-01 Phase 3B, additive registration of AML-01's
 * FIFTH IAM-02 permission (the first Phase 3B one). No IAM-02 guard/grant change, no
 * `role_permission` seed (FR-003: role-permission assignment happens only through the approved
 * IAM-02 workflow, never a raw seed INSERT here).
 *
 * `licence_locked=false` — the CFG-01 Phase 3A F-1 lesson, applied consistently since AML-01
 * Phase 2B. This is a bounded, non-sensitive configuration READ (which provider is active, its
 * adaptor version, whether it's the stub) — `requires_approval=false`, same reasoning as
 * `aml1.screening.read`. No `aml1.provider_config.manage` mutation permission is registered this
 * phase — provider selection is env-driven at boot (`AML1_SCREENING_PROVIDER`), not a runtime
 * mutation route; registering a permission with no reachable route has been avoided in this
 * codebase since AML-01 Phase 0.
 *
 *   - `aml1.provider.read` — provider-status read (`GET /internal/aml1/provider/status`).
 *     `requires_approval=false`: a bounded, non-sensitive configuration read needs permission, not
 *     a full approval cycle.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_aml1_provider_read', 'aml1.provider.read', 'provider', 'read', 'normal', false, false, false, false, 'active', 'AML-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN ('perm_aml1_provider_read');
  `);
};
