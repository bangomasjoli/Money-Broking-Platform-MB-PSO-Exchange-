# CFG-01 Feature Flag / Licence Lock  
## 10 Test Cases

## 1. Runtime Evaluation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CFG1-TC-001 | Known allowed feature | Allow | Critical |
| CFG1-TC-002 | Unknown feature | Deny fail closed | Critical |
| CFG1-TC-003 | Unknown licence state | Deny fail closed | Critical |
| CFG1-TC-004 | Prohibited feature evaluated | Deny + Critical audit | Critical |
| CFG1-TC-005 | Exchange feature while pending | Deny | Critical |
| CFG1-TC-006 | Retail onboarding default | Deny | Critical |
| CFG1-TC-007 | Client class not allowed | Deny | Critical |
| CFG1-TC-008 | Environment not allowed | Deny | High |
| CFG1-TC-009 | Dependency not ready | Deny | High |
| CFG1-TC-010 | Sensitive allow emits SEC-01 audit | Audit present | Critical |

---

## 2. Prohibited Feature Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CFG1-TC-011 | Enable matching engine | Blocked | Critical |
| CFG1-TC-012 | Enable public order book | Blocked | Critical |
| CFG1-TC-013 | Enable client-to-client matching | Blocked | Critical |
| CFG1-TC-014 | Enable market making | Blocked | Critical |
| CFG1-TC-015 | Enable principal dealing | Blocked | Critical |
| CFG1-TC-016 | Enable AIX spread markup | Blocked | Critical |
| CFG1-TC-017 | Enable audit bypass | Blocked | Critical |
| CFG1-TC-018 | Enable permission bypass | Blocked | Critical |

---

## 3. Feature Change Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CFG1-TC-019 | Feature change without IAM-02 permission | Blocked | Critical |
| CFG1-TC-020 | Feature change without approval | Blocked | Critical |
| CFG1-TC-021 | Feature change with self-approval | Blocked by IAM-02 | Critical |
| CFG1-TC-022 | Sensitive feature change without step-up | Blocked | Critical |
| CFG1-TC-023 | Approved feature change | Applied + version increment | High |
| CFG1-TC-024 | Feature change emits SEC-01 audit | Audit present | Critical |
| CFG1-TC-025 | Prohibited feature as ordinary flag | Blocked | Critical |

---

## 4. Licence Profile Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CFG1-TC-026 | Licence profile change without evidence | Blocked | Critical |
| CFG1-TC-027 | Pending licence treated as approved | Blocked | Critical |
| CFG1-TC-028 | Suspended licence | Affected features denied | Critical |
| CFG1-TC-029 | Exchange approval but not activated | Exchange features still locked | Critical |
| CFG1-TC-030 | Approved licence profile activation | New profile version active | High |
| CFG1-TC-031 | IAM permission override licence lock | Blocked | Critical |

---

## 5. Decision Token / Cache Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CFG1-TC-032 | Decision token valid | Accepted | High |
| CFG1-TC-033 | Decision token reused for different client/action | Blocked | Critical |
| CFG1-TC-034 | Decision token expired | Blocked | High |
| CFG1-TC-035 | Feature version changed after token issued | Blocked/revalidate | Critical |
| CFG1-TC-036 | Licence profile version changed after token issued | Blocked/revalidate | Critical |
| CFG1-TC-037 | TTL valid but version stale | Blocked | Critical |

---

## 6. Kill-Switch Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CFG1-TC-038 | Kill-switch disables business feature | Disabled + audit | Critical |
| CFG1-TC-039 | Kill-switch tries to enable feature | Blocked | Critical |
| CFG1-TC-040 | Kill-switch disables audit/IAM/licence lock | Blocked | Critical |
| CFG1-TC-041 | Kill-switch deactivation without approval | Blocked | High |
| CFG1-TC-042 | Runtime after kill-switch | Denied | Critical |

---

## 7. Deployment Gate Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CFG1-TC-043 | Deployment activates registered allowed feature | Gate pass | High |
| CFG1-TC-044 | Deployment activates unregistered feature | Gate blocked | Critical |
| CFG1-TC-045 | Deployment activates licence-locked feature | Gate blocked | Critical |
| CFG1-TC-046 | Deployment missing test evidence | Gate blocked | High |
| CFG1-TC-047 | Deployment missing rollback/kill-switch plan | Gate blocked | High |
| CFG1-TC-048 | Deployment with SEC-01 audit unavailable | Gate blocked | Critical |

---

## 8. Handoff / Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CFG1-TC-049 | IAM-02 interim lock list matches CFG-01 | Reconciled | High |
| CFG1-TC-050 | SEC-01 interim assumption matches CFG-01 | Reconciled | High |
| CFG1-TC-051 | Doc00 prohibited feature missing from CFG-01 | Critical mismatch | Critical |
| CFG1-TC-052 | CFG-01 allows feature locked in IAM-02 interim | Critical mismatch | Critical |
| CFG1-TC-053 | Runtime/deployment drift detected | Alert/finding | Critical |
| CFG1-TC-054 | Handoff mismatch unresolved | Affected feature blocked | Critical |

---

## 9. Evidence / Permission Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CFG1-TC-055 | Evidence export without permission | Blocked | High |
| CFG1-TC-056 | Sensitive evidence export without approval | Blocked | High |
| CFG1-TC-057 | Evidence export generated | Includes audit refs | High |
| CFG1-TC-058 | Prohibited registry change without Compliance/Security/Management approval | Blocked | Critical |
| CFG1-TC-059 | Super Admin bypasses licence lock | Blocked | Critical |
| CFG1-TC-060 | Break-glass enables locked feature | Blocked | Critical |

---

## 10. Go-Live Criteria

```txt
runtime_evaluation_tests_passed = true
prohibited_feature_tests_passed = true
feature_change_tests_passed = true
licence_profile_tests_passed = true
decision_token_cache_tests_passed = true
kill_switch_tests_passed = true
deployment_gate_tests_passed = true
handoff_reconciliation_tests_passed = true
evidence_permission_tests_passed = true
critical_control_coverage = 100_percent
```
