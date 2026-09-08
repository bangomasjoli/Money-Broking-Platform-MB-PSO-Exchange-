/* eslint-disable camelcase */

/**
 * 019_iam2_register_cfg1_kill_switch_permissions — cross-module catalogue registration ONLY,
 * same precedent as `011`/`013`/`017`: an `iam2`-scoped migration inserting `iam2.permission`
 * rows on behalf of CFG-01 (`role_cfg1_runtime` has, and keeps, ZERO grants into `iam2.*`).
 * Does NOT touch `services/iam2/src/lib/guard.ts` or any other IAM-02 guard/schema/grant logic.
 * Does NOT seed any `iam2.role_permission` row (role wiring only through IAM-02's own approved
 * workflow, never a raw seed — same rule every prior catalogue migration in this codebase
 * already documented).
 *
 * ---------------------------------------------------------------------------------------
 * `licence_locked = false` on all three rows — mandatory, non-negotiable, per the Phase 3A
 * re-review's own explicit carry-forward condition.
 * ---------------------------------------------------------------------------------------
 * Phase 3A's original migration 017 set `licence_locked = true` on its sensitive permissions,
 * which `services/iam2/src/lib/guard.ts` step 1 treats as an UNCONDITIONAL, non-overridable
 * deny — checked before any role/approval logic runs at all — making the entire Phase 3A
 * mutation workflow non-functional against the real guard until fixed (F-1, independent Opus
 * review, initial verdict DO NOT ACCEPT). `licence_locked = true` is reserved for genuinely
 * licence-locked BUSINESS capabilities (the Exchange-shaped features `cfg1.prohibited_feature`
 * already blocks structurally) — never for CFG-01's own admin/governance/emergency-control
 * permissions. All three kill-switch permissions are exactly that class: `licence_locked =
 * false` from this migration's first line, per the Phase 3A re-review's explicit condition for
 * Phase 3B ("Phase 3B's own cfg1.kill_switch.* permission registration must use the corrected
 * pattern... extend the real-IAM-02-guard test file to cover the new codes").
 *
 * ---------------------------------------------------------------------------------------
 * Blueprint deviation — TWO codes where the blueprint names one, `cfg1.feature.kill_switch`.
 * ---------------------------------------------------------------------------------------
 * `07_Permission_Rules.md` §2 lists a single `cfg1.feature.kill_switch` permission ("Emergency
 * feature disable"). IAM-02's guard gates `requires_approval` as a STATIC property of the
 * permission CODE (steps 6/7 of the precedence chain, checked before role-grant lookup) — the
 * exact mechanic the Phase 3A F-1/second-defect fix had to work around. Activation (approved
 * decision #4: permission-gated, no execute-verify) and deactivation (approved decision #5:
 * approval-bound, execute-verify mandatory) have STRUCTURALLY DIFFERENT approval requirements
 * and therefore cannot share one permission code — a shared code would force them to share one
 * `requires_approval` value, which is incompatible with either action's design. This migration
 * therefore registers `cfg1.kill_switch.activate` / `.deactivate_request` / `.deactivate`
 * instead — three codes, matching the exact naming convention `cfg1.licence_profile.activate`/
 * `.suspend`/`.revoke` already established in migration 017, not the blueprint's own shorthand.
 * Documented here per this codebase's own "document a deviation, don't silently pick one"
 * discipline (same class of judgment call SEC-01's own migration 011 header comment documents
 * for its permission-naming resolution).
 *
 * ---------------------------------------------------------------------------------------
 * `cfg1.kill_switch.read` is explicitly NOT registered (approved decisions #10/#11) — no read/
 * list route exists in Phase 3B's approved scope, so a `.read` row would be exactly the kind of
 * unreachable placeholder permission `011`'s own header comment already rejected ("no
 * placeholder rows for later permissions... Adding unused catalogue rows now would be exactly
 * the kind of 'design for a hypothetical future requirement' this codebase's own conventions
 * avoid").
 *
 * ---------------------------------------------------------------------------------------
 * `cfg1.kill_switch.activate`'s `requires_approval = false` / `requires_step_up = false` is
 * STRUCTURAL, not merely a fast-path preference.
 * ---------------------------------------------------------------------------------------
 * Unlike every other CFG-01 mutation action, activation is a SINGLE-STEP route with no
 * execute-verify call following it — there is no second gate to fall back on. The baseline
 * `permission/check` call for `.activate` must itself resolve to a genuine `decision: "allow"`
 * (a real role grant, reaching guard step 10), never `approval_required`/`step_up_required` —
 * `routes/kill-switches.ts` additionally asserts `reason === "permission_granted"` as a
 * defence-in-depth check that this specific permission's baseline pass really is a role-granted
 * allow, not merely CFG-01's own advisory approval_required/step_up_required collapse (`lib/
 * iam2-client.ts`'s `BASELINE_PASS_DECISIONS`) — see that route file's own header comment.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_cfg1_kill_switch_activate',          'cfg1.kill_switch.activate',          'feature', 'kill_switch_activate',   'sensitive', false, false, false, false, 'active', 'CFG-01'),
      ('perm_cfg1_kill_switch_deactivate_request', 'cfg1.kill_switch.deactivate_request', 'feature', 'kill_switch_deactivate_request', 'normal', false, false, false, false, 'active', 'CFG-01'),
      ('perm_cfg1_kill_switch_deactivate',         'cfg1.kill_switch.deactivate',         'feature', 'kill_switch_deactivate', 'sensitive', false, false, false, true,  'active', 'CFG-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_cfg1_kill_switch_activate',
       'perm_cfg1_kill_switch_deactivate_request',
       'perm_cfg1_kill_switch_deactivate'
     );
  `);
};
