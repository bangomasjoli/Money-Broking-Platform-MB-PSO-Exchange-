/* eslint-disable camelcase */

/**
 * 044_iam2_register_kyc1_phase3a_permissions — KYC-01 Phase 3A, additive registration of KYC-01's
 * FIRST IAM-02 permission. No IAM-02 guard/grant change, no `role_permission` seed (FR-003:
 * role-permission assignment happens only through the approved IAM-02 workflow, never a raw seed
 * INSERT here). No KYC-01 table, no ALTER, no new kyc1 schema object — mirrors the AML-01/CLT-01
 * convention of keeping permission registration in its own migration, separate from any table DDL
 * (migration 035 table -> 036 permissions; 037 -> 038; 039 -> 040/041).
 *
 * `licence_locked=false` — the CFG-01 Phase 3A F-1 lesson, applied consistently since AML-01
 * Phase 2B/3B/3C/3D. This is a compliance/operational read action on KYC-01's own surface, never a
 * genuine business-capability lock.
 *
 *   - `kyc1.evidence.sensitive_read` — the single-record sensitive evidence-read route
 *     (`GET /internal/kyc1/checklist-items/:checklist_item_id/sensitive-detail`), the ONLY KYC-01
 *     route that returns `evidence_ref`/`evidence_hash` (Phase 3A also narrows the existing
 *     checklist route's own projection to drop both fields — see
 *     `services/kyc1/src/lib/kyc-case.ts`). `requires_approval=false`: a read has no execute-verify
 *     fallback, so a genuine baseline `allow` must be the real gate (mirrors
 *     `aml1.screening.sensitive_read` exactly — no maker-checker cycle for a read). `requires_
 *     step_up=false`: no step-up mechanism is wired anywhere in this platform yet; setting the flag
 *     would be decorative today (same posture every other module's own Phase 3 permission takes).
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_kyc1_evidence_sensitive_read', 'kyc1.evidence.sensitive_read', 'document_checklist_item', 'sensitive_read', 'sensitive', false, false, false, false, 'active', 'KYC-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_kyc1_evidence_sensitive_read'
     );
  `);
};
