/* eslint-disable camelcase */

/**
 * 013_iam2_register_sec1_alert_permissions — cross-module catalogue registration ONLY.
 *
 * SEC-01 Phase 5 (`docs/implementation/SEC-01_Phase5_Implementation_Plan_v1.0.md` §9) needs
 * three new `iam2.permission` catalogue rows so its new alert lifecycle routes can call
 * IAM-02's already-accepted `POST /internal/iam2/permission/check` and get a real allow/deny
 * decision instead of `IAM2_PERMISSION_UNKNOWN`. This migration inserts ONLY those catalogue
 * rows — it does not touch `services/iam2/src/lib/guard.ts` or any other IAM-02 guard logic,
 * does not add/relax any grant, and does not implement IAM-02 Phase 6/7 (delegation, temporary
 * permissions, steady-state break-glass, SoD risk acceptance).
 *
 * Same ownership shape as migration 011 (`011_iam2_register_sec1_permissions.cjs`): a catalogue
 * owner (IAM-02) seeding rows ABOUT a consumer (SEC-01), at the consumer's request — never the
 * consumer writing into the catalogue itself. `role_sec1_runtime` has — and keeps — ZERO
 * grants into `iam2.*`.
 *
 * ---------------------------------------------------------------------------------------
 * requires_step_up / requires_approval — all three FALSE at the catalogue level:
 * ---------------------------------------------------------------------------------------
 * `07_Permission_Rules.md` §4 item 4 ("Critical alert closure where configured") is a
 * SEVERITY-CONDITIONAL requirement, which IAM-02's guard precedence chain cannot express as a
 * static per-permission-code flag (it would gate every closure, not just Critical ones — see
 * the Phase 5 plan §9's own reasoning). Per the approved implementation brief, the Critical-only
 * approval requirement is enforced at the SEC-01 ROUTE layer instead, reusing IAM-02's EXISTING
 * generic approval-request (`/iam2/approvals/request`, `/iam2/approvals/:id/approve`) and
 * execute-verify (`/internal/iam2/permission/execute-verify`) endpoints as a building block —
 * no new IAM-02 permission code, no IAM-02 guard change, no requires_approval=true anywhere in
 * this migration.
 *
 * ---------------------------------------------------------------------------------------
 * NO role_permission rows seeded — same rule migration 006/011 already documented: FR-003
 * requires role-permission assignment to happen "only through approved workflow," so a raw seed
 * INSERT here would violate that rule for these permissions exactly as it would for any other
 * module's. Test fixtures drive IAM-02's decision via a fake iam2FetchImpl (mirrors migration
 * 011's own test-fixture precedent) or, for the real-catalogue-row assertions, direct SQL
 * against the real table.
 *
 * NO placeholder/reserved rows for other still-deferred SEC-01 alert-adjacent permissions
 * (`sec1.monitoring_rule.read`/`.manage`, `sec1.evidence_export.*`, ...) — Phase 5 has no code
 * path that would reference them yet; a later phase adds its own additive migration when it
 * needs them, same discipline as migration 011.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_sec1_security_alert_read',    'sec1.security_alert.read',    'security_alert', 'read',    'normal', false, false, false, false, 'active', 'SEC-01'),
      ('perm_sec1_security_alert_triage',  'sec1.security_alert.triage',  'security_alert', 'triage',  'normal', false, false, false, false, 'active', 'SEC-01'),
      ('perm_sec1_security_alert_close',   'sec1.security_alert.close',   'security_alert', 'close',   'normal', false, false, false, false, 'active', 'SEC-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_sec1_security_alert_read',
       'perm_sec1_security_alert_triage',
       'perm_sec1_security_alert_close'
     );
  `);
};
