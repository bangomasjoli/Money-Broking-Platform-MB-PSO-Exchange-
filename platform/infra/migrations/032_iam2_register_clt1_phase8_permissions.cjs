/* eslint-disable camelcase */

/**
 * 032_iam2_register_clt1_phase8_permissions — cross-module catalogue registration ONLY, same
 * precedent as `022`/`024`/`026`/`028`/`030` before it: an `iam2`-scoped migration inserting
 * `iam2.permission` rows on behalf of a consumer module (CLT-01), because `role_clt1_runtime` has
 * — and keeps — ZERO grants into `iam2.*`. Does NOT touch `services/iam2/src/lib/guard.ts` or any
 * other IAM-02 guard logic, does NOT add/relax any grant, and does NOT seed any
 * `iam2.role_permission` row.
 *
 * Registers exactly the 3 permissions CLT-01 Phase 8 routes actually check. All 3 are
 * `requires_approval = true` — every lifecycle mutation (suspend/reactivate/close) is
 * maker-checker, execute-verify-bound (approved Phase 8 design decision — no single-step lifecycle
 * mutation exists). `licence_locked = false` for every row — the CFG-01 Phase 3A F-1 lesson,
 * applied consistently for an eighth time across this codebase, not rediscovered: these are
 * admin/governance actions on CLT-01's own client-relationship surface, never genuine
 * licence-locked business capabilities.
 *
 * Explicitly NOT registered (approved Phase 8 design decisions): `clt1.client_profile.read` (the
 * existing `GET /internal/clt1/clients/:client_id/status` route stays internal-identity-only, the
 * same blueprint §3.5 posture it has had since Phase 2 — no human-permission-gated read this
 * phase), `clt1.client_profile.history`/`.activate`/`.reopen` (no lifecycle-history route, no
 * reopen-from-closed path — closed is terminal), and no wallet/trading/deposit/withdrawal/Exchange
 * permission of any kind.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_clt1_client_profile_suspend',    'clt1.client_profile.suspend',    'client_profile', 'suspend',    'sensitive', false, false, false, true, 'active', 'CLT-01'),
      ('perm_clt1_client_profile_reactivate', 'clt1.client_profile.reactivate', 'client_profile', 'reactivate', 'sensitive', false, false, false, true, 'active', 'CLT-01'),
      ('perm_clt1_client_profile_close',      'clt1.client_profile.close',      'client_profile', 'close',      'sensitive', false, false, false, true, 'active', 'CLT-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_clt1_client_profile_suspend',
       'perm_clt1_client_profile_reactivate',
       'perm_clt1_client_profile_close'
     );
  `);
};
