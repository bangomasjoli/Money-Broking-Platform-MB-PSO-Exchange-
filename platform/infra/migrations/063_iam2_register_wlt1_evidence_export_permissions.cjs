/* eslint-disable camelcase */

/**
 * 063_iam2_register_wlt1_evidence_export_permissions — WLT-01 Evidence Export, additive
 * registration of WLT-01's THIRD/FOURTH/FIFTH IAM-02 permissions (bringing WLT-01's total to 5,
 * from 2). No IAM-02 guard/grant change, no `role_permission` seed (FR-003: role-permission
 * assignment happens only through the approved IAM-02 workflow, never a raw seed INSERT here).
 * Mirrors migration 056's own established `NNN_iam2_register_<module>_<phase>_permissions`
 * convention exactly.
 *
 * All three `licence_locked=false` (the CFG-01 Phase 3A F-1 lesson, applied consistently since
 * AML-01/CLT-01/WLT-01 migration 056) — evidence export is an operational/compliance control on
 * WLT-01's own surface, never a genuine business-capability lock.
 *
 *   - `wlt1.evidence_export.request` — the maker's read-only preflight
 *     (`POST /internal/wlt1/evidence-exports/request`). `requires_approval = false`: this route
 *     performs no persistence, only an advisory IAM-02 baseline check.
 *   - `wlt1.evidence_export.apply` — the checker's actual export-generation execution
 *     (`POST /internal/wlt1/evidence-exports/:export_id/apply`). `requires_approval = true`: this
 *     is the genuinely sensitive, maker-checker-gated action — an operator must create a real
 *     IAM-02 approval (via IAM-02's own existing `/iam2/approvals/request` +
 *     `/iam2/approvals/:id/approve`) and this route's own `verifyDecisionToken` call is the sole
 *     real gate on package generation. Mirrors `wlt1.destination.approve_apply`'s own identical
 *     shape exactly.
 *   - `wlt1.evidence_export.download` — the retrieval gate for BOTH the status route
 *     (`GET /internal/wlt1/evidence-exports/:export_id`) and the download route
 *     (`GET /internal/wlt1/evidence-exports/:export_id/download`). `requires_approval = false`:
 *     the package is already dual-authorized by `apply`'s own maker-checker; this permission
 *     gates WHO may retrieve an already-generated package, not a second maker-checker cycle.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_wlt1_evidence_export_request',  'wlt1.evidence_export.request',  'evidence_export', 'request',  'sensitive', false, false, false, false, 'active', 'WLT-01'),
      ('perm_wlt1_evidence_export_apply',    'wlt1.evidence_export.apply',    'evidence_export', 'apply',    'sensitive', false, false, false, true,  'active', 'WLT-01'),
      ('perm_wlt1_evidence_export_download', 'wlt1.evidence_export.download', 'evidence_export', 'download', 'sensitive', false, false, false, false, 'active', 'WLT-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_wlt1_evidence_export_request',
       'perm_wlt1_evidence_export_apply',
       'perm_wlt1_evidence_export_download'
     );
  `);
};
