# TRD-01 Quote / Trade / LP Execution
## 10 Test Cases

## 1. Quote / Eligibility Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| TRD1-TC-001 | Eligible client requests quote | LP quote + client quote | Critical |
| TRD1-TC-002 | Ineligible/suspended client | Rejected | Critical |
| TRD1-TC-003 | Instrument not allowed | Rejected | Critical |
| TRD1-TC-004 | Unapproved LP | Rejected | Critical |
| TRD1-TC-005 | LP quote source invalid | Rejected | Critical |
| TRD1-TC-006 | Client quote without LP quote | Blocked | Critical |
| TRD1-TC-007 | Fee disclosure missing | Rejected | Critical |

---

## 2. Quote Acceptance / Hold Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| TRD1-TC-008 | Accept unexpired quote | Accepted | Critical |
| TRD1-TC-009 | Accept expired quote | Rejected | Critical |
| TRD1-TC-010 | Quote hash mismatch | Rejected | Critical |
| TRD1-TC-011 | Mandate requires client approval | Approval required | High |
| TRD1-TC-012 | LED hold successful | Trade hold_created | Critical |
| TRD1-TC-013 | LED hold fails | No LP execution | Critical |
| TRD1-TC-014 | AML stale | No LP execution | Critical |

---

## 3. LP Execution Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| TRD1-TC-015 | LP execution with active hold | Submitted | Critical |
| TRD1-TC-016 | LP execution without hold | Rejected | Critical |
| TRD1-TC-017 | LP unavailable | Fail closed | Critical |
| TRD1-TC-018 | Duplicate client acceptance | No duplicate LP order | Critical |
| TRD1-TC-019 | Same idempotency key different payload | Reject conflict | Critical |
| TRD1-TC-020 | LP timeout | Pending reconciliation, no blind retry | Critical |

---

## 4. Fill / Slippage / Partial Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| TRD1-TC-021 | Full LP fill within tolerance | Client fill + settlement handoff | Critical |
| TRD1-TC-022 | Client fill without LP fill | Blocked | Critical |
| TRD1-TC-023 | Duplicate LP fill | No duplicate client fill | Critical |
| TRD1-TC-024 | Slippage beyond tolerance | Requote/void/confirm | Critical |
| TRD1-TC-025 | Partial fill not permitted | Void/requote/release | Critical |
| TRD1-TC-026 | Residual absorbed by AIX | Blocked | Critical |

---

## 5. Settlement / Principal / Fee Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| TRD1-TC-027 | Valid fill handoff to LED | Sent/acknowledged | Critical |
| TRD1-TC-028 | Handoff without execution evidence | Rejected | Critical |
| TRD1-TC-029 | AIX funds client settlement | Blocked | Critical |
| TRD1-TC-030 | AIX inventory used | Blocked | Critical |
| TRD1-TC-031 | Hidden spread markup | Blocked | Critical |
| TRD1-TC-032 | Fee not disclosed | Blocked | Critical |

---

## 6. Exchange-Lock / Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| TRD1-TC-033 | Order book feature enabled | Blocked | Critical |
| TRD1-TC-034 | Matching engine route | Blocked | Critical |
| TRD1-TC-035 | Client-to-client matching | Blocked | Critical |
| TRD1-TC-036 | Market maker permission | Blocked | Critical |
| TRD1-TC-037 | LP fill without LED settlement ack | Reconciliation finding | Critical |
| TRD1-TC-038 | Accepted quote without hold | Reconciliation finding | Critical |
| TRD1-TC-039 | Client fill without LP fill | Critical finding | Critical |
| TRD1-TC-040 | Settlement handoff deadletter | Escalate | Critical |

---


## 7. Agency Window / LP Firmness Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| TRD1-TC-041 | Firm client quote accepted but LP quote not firm/executable | Rejected or contingent/requote | Critical |
| TRD1-TC-042 | Client quote validity exceeds LP validity | Rejected | Critical |
| TRD1-TC-043 | Client acceptance creates fixed fill before LP execution | Blocked | Critical |
| TRD1-TC-044 | Contingent quote clearly finalises only after LP fill | Pass | Critical |

---

## 8. Fill Conservation / Price Identity Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| TRD1-TC-045 | Client fill quantity differs from LP fill | Blocked | Critical |
| TRD1-TC-046 | Multi-tranche LP fills sum to client fill | Pass with VWAP identity | Critical |
| TRD1-TC-047 | LP fill reused for two client fills | Blocked / recon break | Critical |
| TRD1-TC-048 | Client price differs from LP price beyond disclosed fee | Blocked | Critical |
| TRD1-TC-049 | Quote hash excludes LP payload hash | Rejected/go-live fail | Critical |
| TRD1-TC-050 | Positive slippage retained by AIX | Blocked | Critical |

---

## 9. Timeout / Late Fill Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| TRD1-TC-051 | LP timeout | Query-back started, hold pinned | Critical |
| TRD1-TC-052 | Timeout query-back returns filled | Fill processed via conservation | Critical |
| TRD1-TC-053 | Timeout query-back remains unknown past SLA | Escalated | Critical |
| TRD1-TC-054 | Late fill after trade voided | Park exception, no settlement | Critical |
| TRD1-TC-055 | Late fill after hold released | Block settlement | Critical |

---

## 10. No-Internalisation / CFG Revalidation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| TRD1-TC-056 | Client buy and sell internally crossed | Blocked | Critical |
| TRD1-TC-057 | Synthetic LP fill used | Blocked | Critical |
| TRD1-TC-058 | LP fill not from approved external LP | Blocked | Critical |
| TRD1-TC-059 | CFG licence lock stale at LP execution | Blocked | Critical |
| TRD1-TC-060 | CFG licence lock stale at settlement handoff | Blocked | Critical |

---

## 11. Corrections / Settlement Truth Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| TRD1-TC-061 | Multiple LPs available | Best-execution record captured | High |
| TRD1-TC-062 | Manual LP selection without reason | Blocked | High |
| TRD1-TC-063 | Partial fill residual release not LED-atomic | Blocked | Critical |
| TRD1-TC-064 | Requote reuses released hold | Blocked | Critical |
| TRD1-TC-065 | Out-of-order LP event without CAS | Rejected/parked | Critical |
| TRD1-TC-066 | Fill after terminal state | Park exception | Critical |
| TRD1-TC-067 | Client confirmation says settled before LED confirms | Blocked | Critical |
| TRD1-TC-068 | LED settlement failure after fill | Confirmation corrected + exception | Critical |

---

## 12. Additional Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| TRD1-TC-069 | Unconserved client fill exists | Critical finding | Critical |
| TRD1-TC-070 | Price identity failure exists | Critical finding | Critical |
| TRD1-TC-071 | Two client fills share one LP fill | Critical finding | Critical |

---

## 13. Go-Live Criteria

```txt
quote_eligibility_tests_passed = true
acceptance_hold_tests_passed = true
lp_execution_tests_passed = true
fill_slippage_tests_passed = true
settlement_principal_fee_tests_passed = true
exchange_lock_reconciliation_tests_passed = true
agency_window_tests_passed = true
fill_conservation_price_identity_tests_passed = true
timeout_latefill_tests_passed = true
no_internalisation_cfg_tests_passed = true
settlement_truth_tests_passed = true
additional_reconciliation_tests_passed = true
critical_control_coverage = 100_percent
```
