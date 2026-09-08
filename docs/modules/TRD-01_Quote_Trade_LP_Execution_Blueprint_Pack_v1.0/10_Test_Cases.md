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

## 7. Go-Live Criteria

```txt
quote_eligibility_tests_passed = true
acceptance_hold_tests_passed = true
lp_execution_tests_passed = true
fill_slippage_tests_passed = true
settlement_principal_fee_tests_passed = true
exchange_lock_reconciliation_tests_passed = true
critical_control_coverage = 100_percent
```
