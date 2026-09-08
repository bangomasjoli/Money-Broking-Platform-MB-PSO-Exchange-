/* eslint-disable camelcase */

/**
 * 022_iam2_register_clt1_permissions — cross-module catalogue registration ONLY, same precedent
 * as `011_iam2_register_sec1_permissions.cjs` / `013_iam2_register_sec1_alert_permissions.cjs` /
 * `017_iam2_register_cfg1_mutation_permissions.cjs`: an `iam2`-scoped migration that inserts
 * `iam2.permission` rows on behalf of a consumer module (CLT-01), because `role_clt1_runtime` has
 * — and keeps — ZERO grants into `iam2.*` and could never run this migration itself even if it
 * were authored in CLT-01's own migration file. Does NOT touch `services/iam2/src/lib/guard.ts`
 * or any other IAM-02 guard logic, does NOT add/relax any grant, and does NOT seed any
 * `iam2.role_permission` row (role wiring happens only through IAM-02's own approved workflow,
 * never a raw seed).
 *
 * Registers exactly the 5 permissions CLT-01 Phase 2 routes actually check. Explicitly NOT
 * registered (approved Phase 2 design decisions): `clt1.cdd_outcome.receive` (the outcome-receipt
 * route is internal service-to-service ingestion, guarded by the internal-identity token only —
 * same posture CFG-01's own `evaluate()` and SEC-01's audit-ingestion API use for the identical
 * dependency shape, not a human-permission-checked action) and `clt1.client_profile.create` (not
 * an independently invokable action — client_profile creation is a same-transaction CONSEQUENCE
 * of a successful `clt1.application.approve` apply, never a separate call a caller makes).
 *
 * `requires_approval` is set ONLY on `clt1.application.approve` (true) — the sole action this
 * phase that is bound to IAM-02's execute-verify request/apply flow
 * (services/clt1/src/routes/decisions.ts). `review`/`reject`/`hold`/`cdd_outcome.read` are
 * `requires_approval = false`: single-step actions gated purely by this catalogue's baseline
 * `permission/check`, per the approved Phase 2 decision that only the capability-granting action
 * (`approve`) needs the full maker-checker ceremony.
 *
 * ---------------------------------------------------------------------------------------
 * `licence_locked = false` for every row here — CFG-01 Phase 3A's F-1 lesson, applied from day
 * one this time, not discovered by a later review pass.
 * ---------------------------------------------------------------------------------------
 * `services/iam2/src/lib/guard.ts`'s step 1 treats `licence_locked = true` as an UNCONDITIONAL,
 * non-overridable deny, checked before any role/approval logic — reserved for genuine
 * licence-locked BUSINESS capabilities (the Exchange-shaped features CFG-01's own
 * `cfg1.prohibited_feature` registry independently blocks), never for "this concerns
 * governance/administration". These 5 permissions are CLT-01's own onboarding-governance
 * actions on its own application/CDD surface — correctly gated by `requires_approval`
 * (`clt1.application.approve` only) and CLT-01's own route-layer execute-verify binding, never by
 * the licence-lock step.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_clt1_application_review',   'clt1.application.review',   'application',  'review',   'normal',    false, false, false, false, 'active', 'CLT-01'),
      ('perm_clt1_application_approve',  'clt1.application.approve',  'application',  'approve',  'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_application_reject',   'clt1.application.reject',   'application',  'reject',   'normal',    false, false, false, false, 'active', 'CLT-01'),
      ('perm_clt1_application_hold',     'clt1.application.hold',     'application',  'hold',     'normal',    false, false, false, false, 'active', 'CLT-01'),
      ('perm_clt1_cdd_outcome_read',     'clt1.cdd_outcome.read',     'cdd_outcome',  'read',     'normal',    false, false, false, false, 'active', 'CLT-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_clt1_application_review',
       'perm_clt1_application_approve',
       'perm_clt1_application_reject',
       'perm_clt1_application_hold',
       'perm_clt1_cdd_outcome_read'
     );
  `);
};
