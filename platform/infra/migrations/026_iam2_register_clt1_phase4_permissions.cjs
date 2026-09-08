/* eslint-disable camelcase */

/**
 * 026_iam2_register_clt1_phase4_permissions — cross-module catalogue registration ONLY, same
 * precedent as `024_iam2_register_clt1_phase3_permissions.cjs` (and `011`/`013`/`017`/`019`/`022`
 * before it): an `iam2`-scoped migration inserting `iam2.permission` rows on behalf of a consumer
 * module (CLT-01), because `role_clt1_runtime` has — and keeps — ZERO grants into `iam2.*`. Does
 * NOT touch `services/iam2/src/lib/guard.ts` or any other IAM-02 guard logic, does NOT add/relax
 * any grant, and does NOT seed any `iam2.role_permission` row.
 *
 * Registers exactly the 8 permissions CLT-01 Phase 4 routes actually check. Explicitly NOT
 * registered (approved Phase 4 design decisions): `clt1.authorised_party.screening_outcome.receive`
 * (service-to-service ingestion, internal-identity-guarded only — mirrors Phase 2's
 * `clt1.cdd_outcome.receive`, which was likewise never registered), any duplicate-detection or
 * related-party-graph permission (both deferred entirely this phase), any identity-verification
 * permission, and no wallet/deposit/withdraw/trade/Exchange permission of any kind.
 *
 * `requires_approval = true` on exactly the 4 maker-checker actions
 * (`authorised_party.add`/`.update`/`.remove`/`.activate`) — `add`/`update`/`remove` create or
 * materially change a legal/compliance party record; `activate` is the moment real UBO/director/
 * signatory authority becomes usable (directly analogous to Phase 2's `application.approve`, not
 * to Phase 3's `suspend`/`reactivate`). No blueprint "Maker-Checker Required" item names
 * authorised_party directly (`07_Permission_Rules.md` §3 lists exactly 10 items, none covering
 * it) — this is a documented, reasoned extension of the same abuse-prone-in-both-directions
 * reasoning Phase 3 already applied to `authorised_user.remove`, not a direct blueprint mapping.
 * The other 4 (`authorised_party.read`/`.restrict`/`.reject`/`.suspend`) are single-step actions
 * gated purely by baseline `permission/check` — `read` because it is a query, `restrict`/
 * `.reject`/`.suspend` because they are protective/restrictive actions (same reasoning CFG-01
 * Phase 3B applied to kill-switch deactivation and Phase 3 applied to `authorised_user.suspend`).
 *
 * `licence_locked = false` for every row here — the CFG-01 Phase 3A F-1 lesson, applied
 * consistently for a fourth time across this codebase, not rediscovered.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_clt1_authorised_party_read',      'clt1.authorised_party.read',      'authorised_party', 'read',     'normal',    false, false, false, false, 'active', 'CLT-01'),
      ('perm_clt1_authorised_party_add',       'clt1.authorised_party.add',       'authorised_party', 'add',      'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_authorised_party_update',    'clt1.authorised_party.update',    'authorised_party', 'update',   'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_authorised_party_remove',    'clt1.authorised_party.remove',    'authorised_party', 'remove',   'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_authorised_party_activate',  'clt1.authorised_party.activate',  'authorised_party', 'activate', 'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_authorised_party_restrict',  'clt1.authorised_party.restrict',  'authorised_party', 'restrict', 'normal',    false, false, false, false, 'active', 'CLT-01'),
      ('perm_clt1_authorised_party_reject',    'clt1.authorised_party.reject',    'authorised_party', 'reject',   'normal',    false, false, false, false, 'active', 'CLT-01'),
      ('perm_clt1_authorised_party_suspend',   'clt1.authorised_party.suspend',   'authorised_party', 'suspend',  'normal',    false, false, false, false, 'active', 'CLT-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_clt1_authorised_party_read',
       'perm_clt1_authorised_party_add',
       'perm_clt1_authorised_party_update',
       'perm_clt1_authorised_party_remove',
       'perm_clt1_authorised_party_activate',
       'perm_clt1_authorised_party_restrict',
       'perm_clt1_authorised_party_reject',
       'perm_clt1_authorised_party_suspend'
     );
  `);
};
