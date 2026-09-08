/* eslint-disable camelcase */

/**
 * 040_iam2_register_aml1_phase3c_permissions — AML-01 Phase 3C, additive registration of AML-01's
 * NEXT FOUR IAM-02 permissions (bringing AML-01's total to 9: 5 from Phase 2B/3B + these 4). No
 * IAM-02 guard/grant change, no `role_permission` seed (FR-003: role-permission assignment happens
 * only through the approved IAM-02 workflow, never a raw seed INSERT here).
 *
 * All four `licence_locked=false` — the CFG-01 Phase 3A F-1 lesson, applied consistently since
 * AML-01 Phase 2B/3B. These are compliance/operational actions on AML-01's own surface, never a
 * genuine business-capability lock.
 *
 *   - `aml1.rescreen.request` — the manual/monitoring-triggered re-screen route
 *     (`POST .../screening-requests/:id/rescreen`). `requires_approval=false`: re-screening is a
 *     compliance-operational action (creating a NEW, append-only screening request that never
 *     mutates history — confirmed decision D1), gated by permission + the route's own loop-
 *     prevention/in-flight-duplicate check, not a full maker-checker cycle (mirrors the reasoning
 *     already applied to `aml1.screening.read`/`aml1.provider.read`).
 *   - `aml1.monitoring.run` — the route-triggered monitoring-run route
 *     (`POST /internal/aml1/monitoring-runs`) and its read companion
 *     (`GET /internal/aml1/monitoring-runs/:run_id`) — ONE permission gates both, mirroring
 *     CFG-01's kill-switch `.activate` precedent (a bounded, reversible operational action, not a
 *     mutation of compliance evidence). `requires_approval=false` for the same reason
 *     `cfg1.kill_switch.activate` is: there is no second execute-verify gate for this action, so a
 *     genuine baseline `allow` must be the real gate (enforced structurally in
 *     `routes/monitoring.ts`, mirroring `routes/kill-switches.ts`'s own `permission_granted`
 *     assertion).
 *   - `aml1.risk_signal.read` — the bounded, subject-scoped risk-signal read route
 *     (`GET /internal/aml1/risk-signals`). `sensitivity=normal` — the response never includes any
 *     PII/evidence field (`lib/risk-signals.ts`'s own safe-response projection).
 *   - `aml1.risk_signal.acknowledge` — the risk-signal acknowledge route
 *     (`POST /internal/aml1/risk-signals/:signal_id/acknowledge`). `requires_approval=false`:
 *     acknowledging a signal records that a human has seen it — it never confirms/dismisses the
 *     underlying screening match (that remains `aml1.match.confirm`/`.dismiss`'s own, separately
 *     approval-gated, action) and never mutates any downstream module.
 */

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO iam2.permission
      (permission_id, permission_code, resource, action, sensitivity, licence_locked, prohibited, requires_step_up, requires_approval, status, owner_module)
    VALUES
      ('perm_aml1_rescreen_request',      'aml1.rescreen.request',      'screening',     'rescreen',     'sensitive', false, false, false, false, 'active', 'AML-01'),
      ('perm_aml1_monitoring_run',        'aml1.monitoring.run',        'monitoring_run','run',          'sensitive', false, false, false, false, 'active', 'AML-01'),
      ('perm_aml1_risk_signal_read',      'aml1.risk_signal.read',      'risk_signal',   'read',         'normal',    false, false, false, false, 'active', 'AML-01'),
      ('perm_aml1_risk_signal_acknowledge','aml1.risk_signal.acknowledge','risk_signal', 'acknowledge',  'normal',    false, false, false, false, 'active', 'AML-01');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM iam2.permission
     WHERE permission_id IN (
       'perm_aml1_rescreen_request',
       'perm_aml1_monitoring_run',
       'perm_aml1_risk_signal_read',
       'perm_aml1_risk_signal_acknowledge'
     );
  `);
};
