# KYC-01 KYC / KYB Verification
## 10 Test Cases

## 1. Case / Handoff Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| KYC1-TC-001 | Valid CLT handoff | Case created | Critical |
| KYC1-TC-002 | Invalid handoff payload | Rejected/deadlettered | Critical |
| KYC1-TC-003 | Handoff delivery treated as pass | Blocked | Critical |
| KYC1-TC-004 | Case creation emits audit | SEC-01 audit | High |

---

## 2. Document / Evidence Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| KYC1-TC-005 | Required document missing | Pass blocked | Critical |
| KYC1-TC-006 | Expired document | Remediation/stale | High |
| KYC1-TC-007 | Invalid/tampered document | Fail/block | Critical |
| KYC1-TC-008 | Evidence ref missing hash | Rejected | High |
| KYC1-TC-009 | Document verified | Checklist item verified | High |

---

## 3. Verification Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| KYC1-TC-010 | Individual identity verified | Pass component satisfied | Critical |
| KYC1-TC-011 | Individual identity failed | Outcome fail/remediation | Critical |
| KYC1-TC-012 | Entity registry verified | Entity component satisfied | Critical |
| KYC1-TC-013 | Entity registry failed | Outcome fail/remediation | Critical |
| KYC1-TC-014 | Vendor result unauthenticated | Rejected + alert | Critical |
| KYC1-TC-015 | Vendor payload hash mismatch | Rejected | Critical |

---

## 4. UBO / Authorised Party Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| KYC1-TC-016 | UBO threshold identifies UBO | UBO case required | Critical |
| KYC1-TC-017 | Missing UBO verification | Pass blocked | Critical |
| KYC1-TC-018 | Complex ownership triggers EDD | EDD required | High |
| KYC1-TC-019 | Authorised party verified | Outcome published | Critical |
| KYC1-TC-020 | Authorised party not verified | Authority blocked | Critical |

---

## 5. Outcome Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| KYC1-TC-021 | All required checks pass | Outcome pass | Critical |
| KYC1-TC-022 | Required check missing | Outcome pending/fail | Critical |
| KYC1-TC-023 | EDD required but not approved | Pass blocked | Critical |
| KYC1-TC-024 | Manual pass without approval | Blocked | Critical |
| KYC1-TC-025 | Outcome published to CLT | CLT receives outcome | Critical |
| KYC1-TC-026 | Outcome publication fails | Retry/deadletter/escalate | Critical |

---

## 6. EDD / Remediation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| KYC1-TC-027 | EDD trigger detected | EDD route | High |
| KYC1-TC-028 | EDD approved by Compliance | Outcome may progress | High |
| KYC1-TC-029 | Remediation requested | Applicant asked for evidence | High |
| KYC1-TC-030 | Remediation clears issue | Outcome recomputed | High |

---

## 7. Periodic Review / Stale Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| KYC1-TC-031 | Review overdue | Outcome stale published | Critical |
| KYC1-TC-032 | Document expired after pass | Outcome stale/remediation | Critical |
| KYC1-TC-033 | Stale outcome treated as pass | Blocked | Critical |
| KYC1-TC-034 | Updated evidence passes | Outcome refreshed | High |

---

## 8. Sensitive Access / Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| KYC1-TC-035 | Sensitive evidence read | SEC-01 read log | High |
| KYC1-TC-036 | Sensitive read log fails | Read denied | Critical |
| KYC1-TC-037 | Passed outcome missing required doc | Reconciliation critical | Critical |
| KYC1-TC-038 | Passed outcome missing UBO | Reconciliation critical | Critical |
| KYC1-TC-039 | Manual override missing IAM-02 approval | Reconciliation critical | Critical |
| KYC1-TC-040 | Direct DB outcome edit suspected | Critical finding | Critical |

---


## 9. UBO Look-Through Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| KYC1-TC-041 | Layered entity ownership resolves to natural person | UBO verified | Critical |
| KYC1-TC-042 | Indirect ownership across branches exceeds threshold | UBO required | Critical |
| KYC1-TC-043 | Trust role missing beneficiary/protector info | Remediation/EDD | Critical |
| KYC1-TC-044 | Ownership branch untraceable | EDD or fail, never pass | Critical |
| KYC1-TC-045 | Pass outcome with untraced ownership branch | Blocked/reconciliation Critical | Critical |

---

## 10. Vendor Reliance / Proofing Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| KYC1-TC-046 | Vendor not accredited | Result rejected | Critical |
| KYC1-TC-047 | Vendor records not obtainable | Reliance rejected | Critical |
| KYC1-TC-048 | Vendor confidence below threshold | Not pass | Critical |
| KYC1-TC-049 | Vendor result inconclusive | Manual/remediation, not pass | Critical |
| KYC1-TC-050 | Vendor outage without fallback | Fail closed | Critical |
| KYC1-TC-051 | Vendor result expired | Stale/reverify | High |
| KYC1-TC-052 | Non-face-to-face without liveness where required | Not pass | Critical |
| KYC1-TC-053 | HNWI/EDD without SoW/SoF | Not pass | Critical |
| KYC1-TC-054 | Identity details mismatch CLT application | Remediation/EDD | Critical |

---

## 11. KYC/AML Boundary / Evidence Store Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| KYC1-TC-055 | KYC pass interpreted as AML clear | Blocked by contract | Critical |
| KYC1-TC-056 | AML PEP trigger received | KYC EDD/remediation/stale review | Critical |
| KYC1-TC-057 | Combined CDD without AML clear | CLT cannot approve | Critical |
| KYC1-TC-058 | Evidence store contract missing | Evidence cannot be trusted | Critical |
| KYC1-TC-059 | Evidence hash mismatch on read | Block + Critical alert | Critical |
| KYC1-TC-060 | Evidence retention/destruction undefined | Go-live blocked | High |
| KYC1-TC-061 | Verified identity hash basis differs from CLT | Reconciliation finding/block | Critical |
| KYC1-TC-062 | EDD missing minimum measures | EDD cannot approve | Critical |

---

## 12. Go-Live Criteria

```txt
case_handoff_tests_passed = true
document_evidence_tests_passed = true
verification_tests_passed = true
ubo_authorised_party_tests_passed = true
outcome_tests_passed = true
edd_remediation_tests_passed = true
periodic_review_stale_tests_passed = true
sensitive_access_reconciliation_tests_passed = true
ubo_lookthrough_tests_passed = true
vendor_reliance_proofing_tests_passed = true
kyc_aml_boundary_evidence_store_tests_passed = true
critical_control_coverage = 100_percent
```
