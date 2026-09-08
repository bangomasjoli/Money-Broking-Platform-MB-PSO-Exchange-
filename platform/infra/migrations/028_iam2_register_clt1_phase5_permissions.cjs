/* eslint-disable camelcase */

/**
 * 028_iam2_register_clt1_phase5_permissions — cross-module catalogue registration ONLY, same
 * precedent as `026_iam2_register_clt1_phase4_permissions.cjs` (and `011`/`013`/`017`/`019`/`022`/
 * `024` before it): an `iam2`-scoped migration inserting `iam2.permission` rows on behalf of a
 * consumer module (CLT-01), because `role_clt1_runtime` has — and keeps — ZERO grants into
 * `iam2.*`. Does NOT touch `services/iam2/src/lib/guard.ts` or any other IAM-02 guard logic, does
 * NOT add/relax any grant, and does NOT seed any `iam2.role_permission` row.
 *
 * Registers exactly the 4 permissions CLT-01 Phase 5 routes actually check. The blueprint itself
 * (`07_Permission_Rules.md` §2) names only ONE of these — `clt1.related_party.read` — and no
 * "Maker-Checker Required" item (§3, exactly 10 items) covers related-party edges at all. `add`/
 * `.update`/`.remove` are therefore a documented, reasoned extension (an even bigger inferential
 * leap than Phase 4's own `authorised_party` extension, since there isn't even a partial-match
 * blueprint item to anchor against) — a wrong relationship claim has real compliance-
 * interpretation consequences (wrongly linking, or wrongly failing to link, two clients), the
 * same reasoning already applied to `authorised_party.add`/`.update`/`.remove`.
 *
 * Explicitly NOT registered (approved Phase 5 design decisions): any duplicate-detection,
 * graph-traversal, UBO-threshold, or screening permission of any kind, and no wallet/deposit/
 * withdraw/trade/Exchange permission.
 *
 * `licence_locked = false` for every row here — the CFG-01 Phase 3A F-1 lesson, applied
 * consistently for a fifth time across this codebase, not rediscovered.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_clt1_related_party_read',    'clt1.related_party.read',    'related_party_edge', 'read',   'normal',    false, false, false, false, 'active', 'CLT-01'),
      ('perm_clt1_related_party_add',     'clt1.related_party.add',     'related_party_edge', 'add',    'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_related_party_update',  'clt1.related_party.update',  'related_party_edge', 'update', 'sensitive', false, false, false, true,  'active', 'CLT-01'),
      ('perm_clt1_related_party_remove',  'clt1.related_party.remove',  'related_party_edge', 'remove', 'sensitive', false, false, false, true,  'active', 'CLT-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_clt1_related_party_read',
       'perm_clt1_related_party_add',
       'perm_clt1_related_party_update',
       'perm_clt1_related_party_remove'
     );
  `);
};
