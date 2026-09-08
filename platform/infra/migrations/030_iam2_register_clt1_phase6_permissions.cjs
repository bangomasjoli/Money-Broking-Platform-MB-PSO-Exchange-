/* eslint-disable camelcase */

/**
 * 030_iam2_register_clt1_phase6_permissions — cross-module catalogue registration ONLY, same
 * precedent as `028_iam2_register_clt1_phase5_permissions.cjs` (and `011`/`013`/`017`/`019`/`022`/
 * `024`/`026` before it): an `iam2`-scoped migration inserting `iam2.permission` rows on behalf of
 * a consumer module (CLT-01), because `role_clt1_runtime` has — and keeps — ZERO grants into
 * `iam2.*`. Does NOT touch `services/iam2/src/lib/guard.ts` or any other IAM-02 guard logic, does
 * NOT add/relax any grant, and does NOT seed any `iam2.role_permission` row.
 *
 * Registers exactly the 5 permissions CLT-01 Phase 6 routes actually check. The blueprint itself
 * (`07_Permission_Rules.md` §2) names only ONE duplicate-related permission —
 * `clt1.duplicate.review` — and its own Maker-Checker Required list (§3, exactly 10 items) names
 * only "Duplicate resolution override" (item 8), not create/update/read separately. `create`/
 * `.update`/`.confirm`/`.dismiss` are therefore a documented, reasoned extension of the blueprint's
 * single permission into the granular action set Phase 6's request/apply routes actually need — the
 * same reasoning already applied to `authorised_party.add/.update/.remove` (Phase 4) and
 * `related_party.add/.update/.remove` (Phase 5).
 *
 * Explicitly NOT registered (approved Phase 6 design decisions): `clt1.duplicate.review` itself
 * (the blueprint's own literal code — superseded by the granular set below, never dual-registered);
 * any `needs_more_info`-transition permission (no route exists for it this phase); any
 * duplicate-detection, fuzzy-matching, scoring, graph-traversal, or screening permission of any
 * kind; no wallet/deposit/withdraw/trade/Exchange permission.
 *
 * `licence_locked = false` for every row here — the CFG-01 Phase 3A F-1 lesson, applied
 * consistently for a sixth time across this codebase, not rediscovered.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_clt1_duplicate_candidate_read',    'clt1.duplicate_candidate.read',    'duplicate_candidate', 'read',    'normal',    false, false, false, false, 'active', 'CLT-01'),
      ('perm_clt1_duplicate_candidate_create',  'clt1.duplicate_candidate.create',  'duplicate_candidate', 'create',  'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_duplicate_candidate_update',  'clt1.duplicate_candidate.update',  'duplicate_candidate', 'update',  'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_duplicate_candidate_confirm', 'clt1.duplicate_candidate.confirm', 'duplicate_candidate', 'confirm', 'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_duplicate_candidate_dismiss', 'clt1.duplicate_candidate.dismiss', 'duplicate_candidate', 'dismiss', 'sensitive', false, false, false, true,  'active', 'CLT-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_clt1_duplicate_candidate_read',
       'perm_clt1_duplicate_candidate_create',
       'perm_clt1_duplicate_candidate_update',
       'perm_clt1_duplicate_candidate_confirm',
       'perm_clt1_duplicate_candidate_dismiss'
     );
  `);
};
