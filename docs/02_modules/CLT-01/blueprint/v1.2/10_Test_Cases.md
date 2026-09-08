# CLT-01 Client Onboarding / Client Profile
## 10 Test Cases

## 1. Application Intake Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CLT1-TC-001 | Start eligible institutional application | Draft created | Critical |
| CLT1-TC-002 | CFG onboarding feature unavailable | Blocked | Critical |
| CLT1-TC-003 | Unknown client class | Hold/deny progression | Critical |
| CLT1-TC-004 | Application creation emits audit | SEC-01 audit present | High |
| CLT1-TC-005 | Missing mandatory field on submit | Submission blocked | High |

---

## 2. Retail / Client-Class Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CLT1-TC-006 | Retail applicant | Blocked/held | Critical |
| CLT1-TC-007 | HNWI claimed without evidence ref | Hold | High |
| CLT1-TC-008 | Client class not allowed by CFG | Blocked | Critical |
| CLT1-TC-009 | Client-class upgrade without approval | Blocked | Critical |
| CLT1-TC-010 | Client-class change emits audit | Audit present | High |

---

## 3. Submission / Handoff Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CLT1-TC-011 | Submit complete application | Submitted + handoffs | Critical |
| CLT1-TC-012 | Submit without consent | Blocked | High |
| CLT1-TC-013 | KYC handoff missing | Approval blocked | Critical |
| CLT1-TC-014 | AML handoff missing | Approval blocked | Critical |
| CLT1-TC-015 | Handoff payload hash stored | Present | High |

---

## 4. Approval Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CLT1-TC-016 | Final approval without IAM-02 approval | Blocked | Critical |
| CLT1-TC-017 | Self-approval attempt | Blocked | Critical |
| CLT1-TC-018 | Final approval with unresolved duplicate | Blocked | Critical |
| CLT1-TC-019 | Final approval with valid checks | Approved | Critical |
| CLT1-TC-020 | Approved profile grants trading directly | Blocked / downstream controlled | Critical |

---

## 5. Mandate / Authorised User Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CLT1-TC-021 | Add authorised user without evidence | Blocked | High |
| CLT1-TC-022 | Add authorised user with approval | Added | High |
| CLT1-TC-023 | Mandate without expiry/review where required | Blocked | High |
| CLT1-TC-024 | Client maker approves own action | Blocked | Critical |
| CLT1-TC-025 | Mandate change emits audit | Audit present | High |

---

## 6. Duplicate / Status Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CLT1-TC-026 | Duplicate candidate detected | Review required | High |
| CLT1-TC-027 | Duplicate ignored and approval attempted | Blocked | Critical |
| CLT1-TC-028 | Suspended client downstream access | Blocked | Critical |
| CLT1-TC-029 | Closed client downstream access | Blocked | Critical |
| CLT1-TC-030 | Direct DB status edit suspected | Reconciliation finding | Critical |

---

## 7. Sensitive Read / Export Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CLT1-TC-031 | Sensitive profile read authorised | Read logged | High |
| CLT1-TC-032 | Sensitive read logging fails | Read denied | Critical |
| CLT1-TC-033 | Evidence export without permission | Blocked | High |
| CLT1-TC-034 | Evidence export with approval | Export generated + audit | High |
| CLT1-TC-035 | Super Admin bypass attempt | Blocked | Critical |
| CLT1-TC-036 | Break-glass approval attempt | Blocked | Critical |

---

## 8. Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CLT1-TC-037 | Submitted application no KYC handoff | Finding | Critical |
| CLT1-TC-038 | Approved profile no AML handoff | Critical finding | Critical |
| CLT1-TC-039 | Active client with retail class | Critical finding | Critical |
| CLT1-TC-040 | Mandate expired but active | Finding / revoke | High |
| CLT1-TC-041 | Profile update missing audit ref | Critical finding | Critical |

---


## 9. CDD Outcome Gate Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CLT1-TC-042 | KYC handoff delivered but CDD pending | Approval blocked | Critical |
| CLT1-TC-043 | KYC completed with failed outcome | Approval blocked | Critical |
| CLT1-TC-044 | AML sanctions hit | Hard block | Critical |
| CLT1-TC-045 | Risk rating missing | Approval blocked | Critical |
| CLT1-TC-046 | All CDD/AML/risk outcomes satisfactory | Approval may proceed | Critical |
| CLT1-TC-047 | PEP/adverse media review required | Hold/review | Critical |

## 10. Authorised Party / UBO Screening Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CLT1-TC-048 | Authorised signatory added without screening | Authority blocked | Critical |
| CLT1-TC-049 | Director/UBO sanctions hit | Client/authority restricted | Critical |
| CLT1-TC-050 | UBO threshold not assessed | Application held | High |
| CLT1-TC-051 | Screened authorised party clear | Authority may activate | High |
| CLT1-TC-052 | Authorised user revoked | IAM-02 authority/session/cache invalidated | Critical |

## 11. Ongoing Monitoring Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CLT1-TC-053 | Active client receives sanctions re-hit | Suspended/restricted | Critical |
| CLT1-TC-054 | KYC document expiry | Review required/restricted | High |
| CLT1-TC-055 | Periodic review overdue | Restricted/review required | High |
| CLT1-TC-056 | Remediation clears hit with approval | Status can reinstate | High |
| CLT1-TC-057 | Downstream hit not reflected in CLT | Critical reconciliation finding | Critical |

## 12. Verified Class / Uniqueness / Data Protection / Mandate Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| CLT1-TC-058 | HNWI evidence provided but unverified | Treated retail-locked/held | Critical |
| CLT1-TC-059 | Verified class evidence approved | CFG re-gate and proceed if allowed | Critical |
| CLT1-TC-060 | Two active clients same verified identity | Blocked unless exception approved | Critical |
| CLT1-TC-061 | Related-party edge missing for UBO | Reconciliation finding | High |
| CLT1-TC-062 | DSAR access request | Processed with audit | High |
| CLT1-TC-063 | Erasure request for AML-retained record | Retain/restrict/pseudonymise with legal basis | High |
| CLT1-TC-064 | Free-form invalid mandate JSON | Blocked | Critical |
| CLT1-TC-065 | Mandate schema consistent with IAM-02 dual-auth | Accepted | Critical |


## 13. Go-Live Criteria

```txt
application_intake_tests_passed = true
retail_client_class_tests_passed = true
submission_handoff_tests_passed = true
approval_tests_passed = true
mandate_authorised_user_tests_passed = true
duplicate_status_tests_passed = true
sensitive_read_export_tests_passed = true
reconciliation_tests_passed = true
cdd_outcome_gate_tests_passed = true
authorised_party_ubo_tests_passed = true
ongoing_monitoring_tests_passed = true
verified_class_uniqueness_data_protection_tests_passed = true
critical_control_coverage = 100_percent
```
