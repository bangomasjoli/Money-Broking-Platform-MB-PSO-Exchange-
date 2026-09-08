/* eslint-disable camelcase */

/**
 * 046_iam2_register_kyc1_phase3b_permissions — KYC-01 Phase 3B, additive registration of KYC-01's
 * SECOND IAM-02 permission (bringing KYC-01's total to 2: `kyc1.evidence.sensitive_read` from
 * Phase 3A + this one). No IAM-02 guard/grant change, no `role_permission` seed (FR-003:
 * role-permission assignment happens only through the approved IAM-02 workflow, never a raw seed
 * INSERT here). No KYC-01 table, no ALTER, no new kyc1 schema object — kept in its own migration,
 * separate from migration 045's table DDL, mirroring the established table-then-permission
 * convention (migration 035 table -> 036 permissions; 044 -> the Phase 3A permission itself had no
 * preceding table).
 *
 *   - `kyc1.outcome.override` — the maker-checker manual-override request/apply routes
 *     (`routes/outcome-override.ts`). `requires_approval=true` — UNLIKE Phase 3A's read-only
 *     permission, this one gates a mutation capable of changing a compliance outcome without new
 *     evidence, so the real gate is IAM-02 execute-verify, not this baseline check alone. The
 *     baseline `checkPermission` call still exists at BOTH request and apply (catches genuine
 *     `deny`/`licence_locked` and IAM-02 outages before wasting an approval cycle) — KYC-01's own
 *     `lib/iam2-client.ts` already treats `approval_required` as a baseline PASS (Phase 3A's own
 *     forward-looking coverage, added specifically so this exact permission would not trigger the
 *     CFG-01 Phase 3A F-1 regression: treating `approval_required` as a denial would make the
 *     baseline check permanently unsatisfiable for the one permission that is SUPPOSED to require
 *     approval).
 *     `licence_locked=false` — the CFG-01 Phase 3A F-1 lesson, applied consistently since AML-01
 *     Phase 2B/3B/3C/3D and KYC-01's own Phase 3A permission. This is a compliance/operational
 *     mutation on KYC-01's own surface, never a genuine business-capability lock.
 *     `requires_step_up=false` — no step-up mechanism is wired anywhere in this platform yet;
 *     setting the flag would be decorative today, same posture every other module's own
 *     approval-gated permission takes.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_kyc1_outcome_override', 'kyc1.outcome.override', 'cdd_outcome', 'override', 'sensitive', false, false, false, true, 'active', 'KYC-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_kyc1_outcome_override'
     );
  `);
};
