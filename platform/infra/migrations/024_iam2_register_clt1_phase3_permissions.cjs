/* eslint-disable camelcase */

/**
 * 024_iam2_register_clt1_phase3_permissions — cross-module catalogue registration ONLY, same
 * precedent as `022_iam2_register_clt1_permissions.cjs` (and `011`/`013`/`017`/`019` before it):
 * an `iam2`-scoped migration inserting `iam2.permission` rows on behalf of a consumer module
 * (CLT-01), because `role_clt1_runtime` has — and keeps — ZERO grants into `iam2.*`. Does NOT
 * touch `services/iam2/src/lib/guard.ts` or any other IAM-02 guard logic, does NOT add/relax any
 * grant, and does NOT seed any `iam2.role_permission` row.
 *
 * Registers exactly the 8 permissions CLT-01 Phase 3 routes actually check. Explicitly NOT
 * registered (approved Phase 3 design decisions): any `clt1.authorised_party.*` code (the table
 * itself is deferred entirely), any `clt1.*mandate_check*` code (the mandate-check endpoint is
 * deferred — no route exists to gate), and no wallet/deposit/withdraw/trade/Exchange permission of
 * any kind.
 *
 * `requires_approval = true` on exactly the 4 maker-checker actions
 * (`authorised_user.add`/`.remove`, `client_mandate.create`/`.update`), bound to IAM-02's
 * execute-verify request/apply flow (`services/clt1/src/routes/authorised-users.ts` /
 * `mandates.ts`). The other 4 (`authorised_user.read`/`.suspend`/`.reactivate`,
 * `client_mandate.read`) are single-step actions gated purely by this catalogue's baseline
 * `permission/check` — `read` because it is a query, `suspend`/`.reactivate` because the
 * blueprint names no maker-checker requirement for them and they are proportionate,
 * reversible, protective-control toggles (the same reasoning CFG-01 Phase 3B applied to
 * kill-switch activation vs. deactivation).
 *
 * `licence_locked = false` for every row here — the CFG-01 Phase 3A F-1 lesson, applied
 * consistently for a third time across this codebase, not rediscovered. `services/iam2/src/lib/
 * guard.ts`'s step 1 treats `licence_locked = true` as an UNCONDITIONAL, non-overridable deny —
 * reserved for genuine licence-locked BUSINESS capabilities, never for admin/governance actions
 * on CLT-01's own client-relationship surface.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_clt1_authorised_user_read',       'clt1.authorised_user.read',       'authorised_user', 'read',       'normal',    false, false, false, false, 'active', 'CLT-01'),
      ('perm_clt1_authorised_user_add',        'clt1.authorised_user.add',        'authorised_user', 'add',        'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_authorised_user_remove',     'clt1.authorised_user.remove',     'authorised_user', 'remove',     'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_authorised_user_suspend',    'clt1.authorised_user.suspend',    'authorised_user', 'suspend',    'normal',    false, false, false, false, 'active', 'CLT-01'),
      ('perm_clt1_authorised_user_reactivate', 'clt1.authorised_user.reactivate', 'authorised_user', 'reactivate', 'normal',    false, false, false, false, 'active', 'CLT-01'),
      ('perm_clt1_client_mandate_read',        'clt1.client_mandate.read',        'client_mandate',  'read',       'normal',    false, false, false, false, 'active', 'CLT-01'),
      ('perm_clt1_client_mandate_create',      'clt1.client_mandate.create',      'client_mandate',  'create',     'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_client_mandate_update',      'clt1.client_mandate.update',      'client_mandate',  'update',     'sensitive', false, false, false, true,  'active', 'CLT-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_clt1_authorised_user_read',
       'perm_clt1_authorised_user_add',
       'perm_clt1_authorised_user_remove',
       'perm_clt1_authorised_user_suspend',
       'perm_clt1_authorised_user_reactivate',
       'perm_clt1_client_mandate_read',
       'perm_clt1_client_mandate_create',
       'perm_clt1_client_mandate_update'
     );
  `);
};
