# LED-01 Ledger / Settlement / Safeguarding
## 10 Test Cases

## 1. Journal Integrity Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| LED1-TC-001 | Balanced journal | Posted | Critical |
| LED1-TC-002 | Unbalanced journal | Rejected | Critical |
| LED1-TC-003 | Posted journal update/delete | Blocked | Critical |
| LED1-TC-004 | Direct balance edit attempt | Blocked/alert | Critical |
| LED1-TC-005 | Duplicate source event | No double-post | Critical |
| LED1-TC-006 | Out-of-order event | Rejected | Critical |

---

## 2. Deposit Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| LED1-TC-007 | Pending deposit | Pending only | Critical |
| LED1-TC-008 | Confirmed receipt + clear source | Available credit | Critical |
| LED1-TC-009 | Unconfirmed receipt | No available credit | Critical |
| LED1-TC-010 | Quarantined source | No available credit | Critical |
| LED1-TC-011 | Backing not verified | No credit | Critical |
| LED1-TC-012 | Duplicate deposit event | No double-credit | Critical |

---

## 3. Withdrawal / Payout Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| LED1-TC-013 | Payout with valid WLT/AML/balance | Reserve then settle | Critical |
| LED1-TC-014 | Payout without WLT consume | Rejected | Critical |
| LED1-TC-015 | Payout with stale AML | Rejected | Critical |
| LED1-TC-016 | Insufficient available balance | Rejected | Critical |
| LED1-TC-017 | Payout creates negative available | Blocked | Critical |
| LED1-TC-018 | Settlement execution failed | Hold handled, no false debit | Critical |

---

## 4. Hold / LP / DvP Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| LED1-TC-019 | Create hold within available | Hold active | Critical |
| LED1-TC-020 | Hold exceeds available | Rejected | Critical |
| LED1-TC-021 | LP execution without hold | Rejected | Critical |
| LED1-TC-022 | Consume expired hold | Rejected | Critical |
| LED1-TC-023 | DvP credit before receipt | Rejected | Critical |
| LED1-TC-024 | LP fail | Hold release/exception | Critical |
| LED1-TC-025 | AIX absorbs residual | Blocked | Critical |

---

## 5. Safeguarding / Fee / Reversal Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| LED1-TC-026 | Liabilities <= assets | Safeguarding pass | Critical |
| LED1-TC-027 | Liabilities > assets | Freeze + critical exception | Critical |
| LED1-TC-028 | Hidden spread fee | Blocked | Critical |
| LED1-TC-029 | Fee disclosure missing | Blocked | High |
| LED1-TC-030 | Manual adjustment no approval | Blocked | Critical |
| LED1-TC-031 | Reversal edits original journal | Blocked | Critical |
| LED1-TC-032 | Valid reversal | New reversal journal | High |

---

## 6. Close / Freeze / Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| LED1-TC-033 | Post into closed period | Rejected | High |
| LED1-TC-034 | Post into frozen scope | Rejected | Critical |
| LED1-TC-035 | Critical recon break | Exception/freeze as policy | Critical |
| LED1-TC-036 | Recon break auto-cleared | Blocked | Critical |
| LED1-TC-037 | WLT consumed decision no settlement | Reconciliation finding | Critical |
| LED1-TC-038 | Settlement without AML decision | Reconciliation finding | Critical |
| LED1-TC-039 | Safeguarding report generated | Evidence report | High |
| LED1-TC-040 | Production/test ledger mixed | Blocked | Critical |

---

## 7. Go-Live Criteria

```txt
journal_integrity_tests_passed = true
deposit_tests_passed = true
withdrawal_payout_tests_passed = true
hold_lp_dvp_tests_passed = true
safeguarding_fee_reversal_tests_passed = true
close_freeze_reconciliation_tests_passed = true
critical_control_coverage = 100_percent
```
