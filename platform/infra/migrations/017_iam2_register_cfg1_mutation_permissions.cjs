/* eslint-disable camelcase */

/**
 * 017_iam2_register_cfg1_mutation_permissions — cross-module catalogue registration ONLY,
 * same precedent as `011_iam2_register_sec1_permissions.cjs` / `013_iam2_register_sec1_alert_
 * permissions.cjs`: an `iam2`-scoped migration that inserts `iam2.permission` rows on behalf of
 * a consumer module (CFG-01), because `role_cfg1_runtime` has — and keeps — ZERO grants into
 * `iam2.*` and could never run this migration itself even if it were authored in CFG-01's own
 * migration file. Does NOT touch `services/iam2/src/lib/guard.ts` or any other IAM-02 guard
 * logic, does NOT add/relax any grant, and does NOT seed any `iam2.role_permission` row (role
 * wiring happens only through IAM-02's own approved workflow, never a raw seed — same rule
 * `006`/`011` already documented for their own catalogues).
 *
 * Registers ONLY the 8 Phase 3A permission codes the approved scope names. Explicitly NOT
 * registered (approved decisions #5/#6/#9, and the Phase 3A "DO NOT IMPLEMENT" list):
 * `cfg1.prohibited_feature.manage` (no route can ever call it — no placeholder row, same
 * discipline `011`'s header comment documents for its own deferred SEC-01 permissions),
 * `cfg1.kill_switch.activate`/`.deactivate` (Phase 3B), any Exchange-activation/deployment-gate/
 * evidence-export/reconciliation permission (out of scope entirely this phase).
 *
 * `requires_approval`/`requires_step_up` on this catalogue are ADVISORY context only — the same
 * limitation `013`'s header comment documents for SEC-01's Critical-only closure rule: IAM-02's
 * guard precedence chain gates these as a static, binary property of the permission CODE, which
 * cannot express "approval required only when actually mutating state, not when merely
 * proposing one." The REAL gate is enforced at the CFG-01 route layer (`routes/feature-changes.ts`/
 * `routes/licence-changes.ts`), which requires a verified IAM-02 approval/decision-token binding
 * on every APPLY call regardless of what this catalogue row says — do not rely on these flags
 * alone to reason about what is actually enforced.
 *
 * ---------------------------------------------------------------------------------------
 * `licence_locked = false` for every row here — F-1 fix (independent Opus Phase 3A review,
 * initial verdict DO NOT ACCEPT).
 * ---------------------------------------------------------------------------------------
 * The original version of this migration set `licence_locked = true` on the six sensitive
 * mutation permissions (`feature.enable`/`.disable`, all four `licence_profile.*` actions),
 * reasoning loosely that anything licence-related should carry the licence flag. That was wrong:
 * `services/iam2/src/lib/guard.ts`'s step 1 treats `licence_locked = true` as an UNCONDITIONAL,
 * non-overridable deny — "This IS real enforcement this stage (not a stub)" per that file's own
 * comment — checked BEFORE any role, approval, or override logic runs at all. It exists to hard-
 * block genuinely licence-locked BUSINESS capabilities (the Exchange-shaped features CFG-01's own
 * `cfg1.prohibited_feature` registry independently blocks), not to flag "this permission concerns
 * licence administration." Registering CFG-01's own governance permissions this way meant IAM-02
 * denied every real feature-apply and every licence-profile call outright, for every actor,
 * always — the entire Phase 3A mutation workflow was fail-closed but permanently non-functional
 * against the real guard. Every integration test stubbed `iam2FetchImpl` to return `allow`
 * directly, so this was invisible to the self-reported 646/646 result; it was caught only by the
 * independent Opus review reading `guard.ts`'s own source and tracing the real decision path.
 *
 * These 8 permissions are ADMIN/GOVERNANCE actions on CFG-01's own configuration surface — they
 * are correctly gated by `requires_approval` (already `true` for every apply action),
 * `requires_step_up` (already `true` for `licence_profile.activate`), and the CFG-01 route-layer
 * execute-verify binding (§ above) — never by the licence-lock step, which is reserved for
 * business-capability locks CFG-01's own prohibited-feature registry already owns. All 8 rows now
 * carry `licence_locked = false`.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_cfg1_config_change_read',            'cfg1.config_change.read',            'config_change',    'read',            'normal',    false, false, false, false, 'active', 'CFG-01'),
      ('perm_cfg1_feature_change_request',        'cfg1.feature.change_request',        'feature',          'change_request',  'normal',    false, false, false, false, 'active', 'CFG-01'),
      ('perm_cfg1_feature_enable',                'cfg1.feature.enable',                'feature',          'enable',          'sensitive', false, false, false, true,  'active', 'CFG-01'),
      ('perm_cfg1_feature_disable',                'cfg1.feature.disable',               'feature',          'disable',         'sensitive', false, false, false, true,  'active', 'CFG-01'),
      ('perm_cfg1_licence_profile_change_request', 'cfg1.licence_profile.change_request', 'licence_profile',  'change_request',  'normal',    false, false, false, false, 'active', 'CFG-01'),
      ('perm_cfg1_licence_profile_activate',       'cfg1.licence_profile.activate',       'licence_profile',  'activate',        'sensitive', false, false, true,  true,  'active', 'CFG-01'),
      ('perm_cfg1_licence_profile_suspend',        'cfg1.licence_profile.suspend',        'licence_profile',  'suspend',         'sensitive', false, false, false, true,  'active', 'CFG-01'),
      ('perm_cfg1_licence_profile_revoke',         'cfg1.licence_profile.revoke',         'licence_profile',  'revoke',          'sensitive', false, false, false, true,  'active', 'CFG-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_cfg1_config_change_read',
       'perm_cfg1_feature_change_request',
       'perm_cfg1_feature_enable',
       'perm_cfg1_feature_disable',
       'perm_cfg1_licence_profile_change_request',
       'perm_cfg1_licence_profile_activate',
       'perm_cfg1_licence_profile_suspend',
       'perm_cfg1_licence_profile_revoke'
     );
  `);
};
