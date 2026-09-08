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
8. Verify prohibited registry and licence profile signed integrity.
9. Load licence-lock state.
10. Check feature version, licence profile version, prohibited registry version, and integrity hash.
11. Evaluate licence-scope allow/deny.
12. Evaluate feature flag state.
13. Evaluate environment/client-class constraints.
14. Evaluate dependency readiness.
15. For feature-gated protected actions, bind decision to IAM-02 permission context.
16. Return allow/deny and reason.
17. For sensitive actions, issue short-lived feature decision token bound to feature/licence/prohibited versions.
18. Emit SEC-01 audit event or durably enqueue through FND transaction-coupled outbox according to asymmetric audit rule.

### Fail-Closed Conditions

1. Unknown feature.
2. Unknown licence profile.
3. Unknown environment.
4. Stale feature state.
5. Unknown client class for client-scoped feature.
6. Prohibited feature match.
7. Prohibited/licence integrity seal mismatch.
8. Out-of-band config change detected.
9. SEC-01 audit unavailable and FND transaction-coupled outbox enqueue unavailable for sensitive decision.
10. Feature decision token cannot be issued where required.
11. Feature-gated action has no IAM-02-bound CFG decision.

---

## 3. WF-CFG01-02 Feature Change Request

### Trigger

Authorised user requests feature state change.

### Steps

1. Request feature change.
2. IAM-02 permission guard checks `cfg1.feature.change_request`.
3. Capture current feature version.
4. Validate target feature state.
5. Verify licence profile and prohibited registry integrity.
6. Check prohibited feature registry.
7. Determine approval policy.
8. Require IAM-01 step-up where sensitive.
9. Create IAM-02 approval request.
10. Approver checks evidence and SoD.
11. If approved, create signed change record.
12. Update feature config version and re-seal affected config.
13. Invalidate feature cache and revoke affected decision tokens.
14. Emit SEC-01 audit event.
15. Notify downstream modules if required.
16. Monitor for drift.

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
3. Verify LFSA evidence authenticity using defined verification source/mechanism.
4. IAM-02 permission and approval required.
5. Compliance approval required.
6. Management/Board approval required for high-risk licence activation.
7. Apply prohibited-registry meta-SoD check.
8. SEC-01 audit event emitted.
9. New licence profile version created and signed.
10. Affected feature locks recalculated.
11. Outstanding decision tokens revoked for suspended/revoked/materially changed licence.
12. Downstream caches invalidated.
13. Reconciliation job verifies transition.

### Rules

1. Licence profile cannot be changed without evidence.
2. Pending licence cannot be treated as approved.
3. Licence suspended/revoked causes affected features to fail closed.
4. Exchange approval requires dedicated Exchange activation ceremony before Exchange features can be enabled.
5. Suspended/revoked licence immediately revokes outstanding decision tokens.

---

## 5. WF-CFG01-04 Kill-Switch

### Trigger

Security/compliance/operational risk requires feature disablement.

### Steps

1. Authorised actor triggers kill-switch.
2. IAM-02 permission guard validates kill-switch permission.
3. Capture reason and scope.
4. Disable feature immediately or within SLA.
5. Increment feature version immediately.
6. Revoke outstanding feature decision tokens.
7. Invalidate feature cache.
8. Emit SEC-01 Critical/High audit event.
9. Notify affected modules/users where required.
10. Create post-action review.
11. Require retrospective approval if emergency path used.
12. Monitor feature remains disabled.

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
5. CFG-01 hard-blocks production release carrying non-prod enabled locked feature config.
6. CFG-01 verifies approval/evidence exists.
7. CFG-01 verifies tests/go-live checklist complete.
8. CFG-01 verifies SEC-01 audit or FND audit-outbox mode is available.
9. CFG-01 verifies rollback/kill-switch plan exists.
10. Return pass/fail.
11. Fail blocks deployment/activation.

---

## 7. WF-CFG01-06 Interim Handoff Reconciliation

### Trigger

CFG-01 goes live or scheduled reconciliation runs.

### Steps

1. Load IAM-02 interim sealed licence-lock list.
2. Load SEC-01 interim licence monitoring assumptions.
3. Load Master Document 00 licence/prohibited scope and baseline hash/seal.
4. Compare with CFG-01 licence profile and prohibited feature registry signed hashes.
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
5. Validate prohibited registry version and integrity hash.
6. Validate expiry.
7. Validate environment/client/action binding.
8. If stale or mismatched, deny/revalidate.
9. Emit audit event for sensitive stale-deny.

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


---

## 10. WF-CFG01-09 Exchange Activation Ceremony

### Trigger

Formal Exchange approval evidence is received and AIX intends to activate Exchange-related feature scope.

### Steps

1. Create Exchange activation ceremony record.
2. Attach LFSA/MOF/Board evidence references.
3. Verify licence evidence authenticity using approved verification source.
4. Compliance validates licence conditions.
5. Legal/Company Secretary validates corporate evidence where required.
6. Board signs off activation.
7. Management signs off operational readiness.
8. Prohibited-registry removal request created per feature.
9. Licence profile transition request created.
10. IAM-02 verifies prohibited-removal meta-SoD.
11. IAM-02 requires step-up and dual/multi-party approval.
12. Cooldown/time-lock starts after approval.
13. Deployment gate validates feature, tests, rollback, SEC-01 audit, and operational readiness.
14. CFG-01 re-seals licence profile and prohibited registry.
15. SEC-01 records external audit evidence.
16. Feature remains locked until all sequence steps complete.

### Rules

1. No ordinary feature edit can activate Exchange.
2. No single role/person can complete activation.
3. Pending licence cannot be treated as approved.
4. Evidence authenticity must be verified before approval.
5. Production activation waits for cooldown/time-lock and deployment gate.

---

## 11. WF-CFG01-10 Feature Gate Coverage Reconciliation

### Trigger

CI/build, deployment, scheduled reconciliation, or protected-action registry update.

### Steps

1. Load IAM-02 protected-action registry.
2. Load CFG-01 feature policy mapping.
3. Identify feature/licence-relevant actions.
4. Verify each action requires CFG-01 decision token.
5. Verify downstream module calls CFG-01 evaluate or verifies token before commit.
6. Detect orphan feature gates or unguarded feature actions.
7. Block deployment or alert Critical on orphan gate.
8. Emit SEC-01 audit event.

---

## 12. WF-CFG01-11 Config Integrity Verification

### Trigger

Runtime decision, scheduled reconciliation, deployment gate, feature change, or incident.

### Steps

1. Load licence profile/prohibited registry row set.
2. Load signed change records.
3. Load Doc 00 baseline hash/seal.
4. Recompute registry hash.
5. Verify signer, approval reference, version, and SEC-01 audit reference.
6. Detect out-of-band table changes.
7. For prohibited/Exchange/licence-sensitive feature, fail closed on mismatch.
8. Emit Critical SEC-01 alert on mismatch.

---

## 13. WF-CFG01-12 Audit Outage Mode

### Trigger

SEC-01 synchronous ingest is unavailable.

### Steps

1. Determine whether decision is locked/prohibited/unknown or allowed licensed.
2. Locked/prohibited/unknown decisions deny.
3. Allowed licensed decision may proceed only if FND transaction-coupled outbox enqueue succeeds.
4. If outbox enqueue fails, fail closed.
5. Feature changes, licence changes, Exchange activation, kill-switch deactivation, prohibited registry changes, and deployment overrides remain blocked.
6. Raise SEC-01/FND outage alert.
7. Reconcile queued audit events when SEC-01 recovers.
8. Exit outage mode after reconciliation.
