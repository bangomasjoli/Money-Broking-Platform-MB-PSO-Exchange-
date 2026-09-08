# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 10 Test Cases

## 1. Case / Handoff Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| AML1-TC-001 | Valid CLT handoff | Case created | Critical |
| AML1-TC-002 | Invalid handoff | Rejected/deadlettered | Critical |
| AML1-TC-003 | Handoff delivery treated as clear | Blocked | Critical |
| AML1-TC-004 | KYC pass treated as AML clear | Blocked | Critical |

---

## 2. Screening / Vendor Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| AML1-TC-005 | Sanctions no match | Clear component | Critical |
| AML1-TC-006 | Sanctions possible match | Review required | Critical |
| AML1-TC-007 | Sanctions true hit | Hard block/escalate | Critical |
| AML1-TC-008 | PEP match | Review/EDD | High |
| AML1-TC-009 | Adverse media match | Review/EDD | High |
| AML1-TC-010 | List version missing | Block clear | Critical |
| AML1-TC-011 | Vendor source unauthenticated | Reject/alert | Critical |
| AML1-TC-012 | Payload hash mismatch | Reject | Critical |

---

## 3. Match Decision Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| AML1-TC-013 | False-positive no reason | Blocked | High |
| AML1-TC-014 | False-positive with evidence | Clear allowed | High |
| AML1-TC-015 | True hit no MLRO escalation | Blocked | Critical |
| AML1-TC-016 | Super Admin clears sanctions hit | Blocked | Critical |
| AML1-TC-017 | Break-glass clears sanctions hit | Blocked | Critical |
| AML1-TC-018 | Service account decides match | Blocked | Critical |

---

## 4. Outcome / Publication Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| AML1-TC-019 | All required scopes clear | Outcome clear | Critical |
| AML1-TC-020 | Unresolved possible match | Outcome review_required | Critical |
| AML1-TC-021 | Outcome published to CLT | CLT receives | Critical |
| AML1-TC-022 | Outcome publish fails | Retry/deadletter/escalate | Critical |
| AML1-TC-023 | KYC EDD trigger required | KYC trigger sent | High |
| AML1-TC-024 | AML clear grants trading directly | Blocked / downstream controlled | Critical |

---

## 5. Rescreening Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| AML1-TC-025 | List update received | Rescreening run created | Critical |
| AML1-TC-026 | List update without rescreening | Critical finding | Critical |
| AML1-TC-027 | Profile change | Rescreen required | High |
| AML1-TC-028 | Stale outcome treated as clear | Blocked | Critical |
| AML1-TC-029 | New hit on rescreening | CLT restrict + KYC trigger | Critical |

---

## 6. Travel Rule Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| AML1-TC-030 | Travel Rule data complete and clear | Clear | High |
| AML1-TC-031 | Required Travel Rule data missing | Missing data outcome | Critical |
| AML1-TC-032 | Travel Rule party hit | Review/escalate | Critical |
| AML1-TC-033 | Travel Rule clear posts transfer directly | Blocked / downstream controlled | Critical |

---

## 7. STR / Tipping-Off Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| AML1-TC-034 | True hit creates STR review case | Restricted case | Critical |
| AML1-TC-035 | Client-facing user reads STR case | Denied | Critical |
| AML1-TC-036 | Unsafe client notification | Suppressed / safe reason | Critical |
| AML1-TC-037 | STR decision without MLRO/Compliance | Blocked | Critical |
| AML1-TC-038 | STR sensitive read logs SEC-01 | Audit present | Critical |

---

## 8. Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| AML1-TC-039 | Clear outcome with unresolved match | Critical finding | Critical |
| AML1-TC-040 | True hit no CLT restriction feedback | Critical finding | Critical |
| AML1-TC-041 | True hit no KYC EDD trigger | Critical finding | Critical |
| AML1-TC-042 | Sensitive read missing SEC audit | Critical finding | Critical |
| AML1-TC-043 | Direct DB outcome edit suspected | Critical finding | Critical |

---


## 9. Pre-Transaction / List Update Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| AML1-TC-044 | Payment/settlement without pre-transaction sanctions gate | Blocked | Critical |
| AML1-TC-045 | Pre-transaction screening stale | Hold/deny | Critical |
| AML1-TC-046 | List update received | Interim block + rescreen SLA | Critical |
| AML1-TC-047 | List update SLA breached | Critical alert | Critical |
| AML1-TC-048 | Affected party transacts before rescreen | Blocked | Critical |

---

## 10. Coverage / 50 Percent / Input Quality Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| AML1-TC-049 | Missing required sanctions regime list | Clear blocked | Critical |
| AML1-TC-050 | KYC UBO graph shows sanctioned 50pct owner | Entity hit/restricted | Critical |
| AML1-TC-051 | KYC UBO graph stale/incomplete | Review/pending, not clear | Critical |
| AML1-TC-052 | Name-only thin screening input | Review_required, not clear | Critical |
| AML1-TC-053 | Alias/transliteration match | Possible match/review | Critical |
| AML1-TC-054 | Threshold set below floor | Config blocked | Critical |

---

## 11. STR / FP / Outcome Freshness Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| AML1-TC-055 | Suspicion forms | STR clock starts | Critical |
| AML1-TC-056 | STR filing deadline breached | Critical escalation | Critical |
| AML1-TC-057 | Pending STR transaction with no policy | Hold/escalate | Critical |
| AML1-TC-058 | Sanctions false positive without dual review | Blocked | Critical |
| AML1-TC-059 | Standing FP re-attestation expired | Re-review required | High |
| AML1-TC-060 | New hit after clear outcome | Outcome revoked + CLT update | Critical |
| AML1-TC-061 | CLT uses AML outcome with bad payload hash | Blocked | Critical |

---

## 12. PEP / Jurisdiction / De-Listing / Travel Rule Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| AML1-TC-062 | RCA match | PEP/RCA review/EDD | High |
| AML1-TC-063 | PEP declassification period not defined | Go-live blocked | High |
| AML1-TC-064 | FATF high-risk jurisdiction match | EDD/restrict/reject according policy | High |
| AML1-TC-065 | De-listing event | Controlled unblock review | High |
| AML1-TC-066 | Travel Rule threshold missing | Policy activation blocked | High |
| AML1-TC-067 | Counterparty VASP not Travel-Rule capable | Sunrise review/hold | High |

---

## 13. Go-Live Criteria

```txt
case_handoff_tests_passed = true
screening_vendor_tests_passed = true
match_decision_tests_passed = true
outcome_publication_tests_passed = true
rescreening_tests_passed = true
travel_rule_tests_passed = true
str_tipping_off_tests_passed = true
reconciliation_tests_passed = true
pre_transaction_list_update_tests_passed = true
coverage_50pct_input_quality_tests_passed = true
str_fp_outcome_freshness_tests_passed = true
pep_jurisdiction_delisting_travel_rule_tests_passed = true
critical_control_coverage = 100_percent
```
