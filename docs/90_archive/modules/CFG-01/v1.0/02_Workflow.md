# CFG-01 Feature Flag / Licence Lock  
## 02 Workflow

## 1. Workflow Scope

CFG-01 workflows cover runtime feature decision, feature change, licence-lock change, kill-switch, deployment gate, handoff reconciliation, stale-cache handling, and evidence export.

---

## 2. WF-CFG01-01 Runtime Feature Evaluation

### Trigger

A downstream module needs to execute a feature-protected action.

### Steps

1. Receive request context from FND.
2. Identify feature code/action/resource.
3. Identify environment.
4. Identify client ID and client class where applicable.
5. Identify licence profile.
6. Load feature registry.
7. Load prohibited feature registry.
8. Load licence-lock state.
9. Check feature version.
10. Evaluate licence-scope allow/deny.
11. Evaluate feature flag state.
12. Evaluate environment/client-class constraints.
13. Evaluate dependency readiness.
14. Return allow/deny and reason.
15. For sensitive actions, issue short-lived feature decision token.
16. Emit SEC-01 audit event for sensitive allow/deny/violation.

### Fail-Closed Conditions

1. Unknown feature.
2. Unknown licence profile.
3. Unknown environment.
4. Stale feature state.
5. Unknown client class for client-scoped feature.
6. Prohibited feature match.
7. SEC-01 audit unavailable for sensitive decision.
8. Feature decision token cannot be issued where required.

---

## 3. WF-CFG01-02 Feature Change Request

### Trigger

Authorised user requests feature state change.

### Steps

1. Request feature change.
2. IAM-02 permission guard checks `cfg1.feature.change_request`.
3. Capture current feature version.
4. Validate target feature state.
5. Check licence profile.
6. Check prohibited feature registry.
7. Determine approval policy.
8. Require IAM-01 step-up where sensitive.
9. Create IAM-02 approval request.
10. Approver checks evidence and SoD.
11. If approved, update feature config version.
12. Invalidate feature cache.
13. Emit SEC-01 audit event.
14. Notify downstream modules if required.
15. Monitor for drift.

### Rules

1. Prohibited features cannot be enabled through this workflow.
2. Exchange features cannot be enabled while Exchange pending.
3. Break-glass cannot enable a locked feature.
4. Super Admin cannot bypass approval.
5. Sensitive feature change requires dual approval where policy says so.

---

## 4. WF-CFG01-03 Licence Profile Change

### Trigger

Licence status changes or formal licence evidence is received.

### Steps

1. Create licence profile change request.
2. Attach licence evidence reference.
3. Validate source of evidence.
4. IAM-02 permission and approval required.
5. Compliance approval required.
6. Management/Board approval required for high-risk licence activation.
7. SEC-01 audit event emitted.
8. New licence profile version created.
9. Affected feature locks recalculated.
10. Downstream caches invalidated.
11. Reconciliation job verifies transition.

### Rules

1. Licence profile cannot be changed without evidence.
2. Pending licence cannot be treated as approved.
3. Licence suspended/revoked causes affected features to fail closed.
4. Exchange approval requires formal activation workflow before Exchange features can be enabled.

---

## 5. WF-CFG01-04 Kill-Switch

### Trigger

Security/compliance/operational risk requires feature disablement.

### Steps

1. Authorised actor triggers kill-switch.
2. IAM-02 permission guard validates kill-switch permission.
3. Capture reason and scope.
4. Disable feature immediately or within SLA.
5. Invalidate feature cache.
6. Emit SEC-01 Critical/High audit event.
7. Notify affected modules/users where required.
8. Create post-action review.
9. Require retrospective approval if emergency path used.
10. Monitor feature remains disabled.

### Rules

1. Kill-switch can disable business features.
2. Kill-switch cannot disable audit, IAM, licence lock, SEC-01, or core safety controls.
3. Kill-switch cannot enable any feature.
4. Kill-switch is not audit bypass.

---

## 6. WF-CFG01-05 Deployment Gate

### Trigger

Deployment or production feature activation.

### Steps

1. Deployment pipeline queries CFG-01 deployment gate.
2. CFG-01 verifies feature is registered.
3. CFG-01 verifies licence profile allows feature.
4. CFG-01 verifies prohibited feature not matched.
5. CFG-01 verifies approval/evidence exists.
6. CFG-01 verifies tests/go-live checklist complete.
7. CFG-01 verifies SEC-01 audit is active.
8. CFG-01 verifies rollback/kill-switch plan exists.
9. Return pass/fail.
10. Fail blocks deployment/activation.

---

## 7. WF-CFG01-06 Interim Handoff Reconciliation

### Trigger

CFG-01 goes live or scheduled reconciliation runs.

### Steps

1. Load IAM-02 interim sealed licence-lock list.
2. Load SEC-01 interim licence monitoring assumptions.
3. Load Master Document 00 licence/prohibited scope.
4. Compare with CFG-01 licence profile and prohibited feature registry.
5. Identify mismatches.
6. Block activation of affected features until resolved.
7. Emit SEC-01 audit event.
8. Produce reconciliation report.
9. Mark handoff complete when no Critical mismatches remain.

---

## 8. WF-CFG01-07 Stale Cache / Version Check

### Trigger

Downstream module presents cached feature decision/token.

### Steps

1. Receive feature decision token/reference.
2. Validate token scope.
3. Validate feature config version.
4. Validate licence profile version.
5. Validate expiry.
6. Validate environment/client/action binding.
7. If stale or mismatched, deny/revalidate.
8. Emit audit event for sensitive stale-deny.

---

## 9. WF-CFG01-08 Evidence Export

### Trigger

Auditor/regulator/internal user requests feature/licence evidence.

### Steps

1. User requests evidence export.
2. IAM-02 checks permission.
3. Approval/step-up required if sensitive.
4. CFG-01 builds export package.
5. Package includes licence profile, feature state, decision logs, approvals, SEC-01 audit refs, and reconciliation reports.
6. SEC-01 logs export.
7. Export access expires.
