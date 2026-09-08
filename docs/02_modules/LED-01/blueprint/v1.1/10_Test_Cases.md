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


## 7. Atomic Reservation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| LED1-TC-041 | Two concurrent holds read same balance | Only one commits / no overspend | Critical |
| LED1-TC-042 | Hold uses balance snapshot | Blocked | Critical |
| LED1-TC-043 | Balance version changes during hold | Conflict/retry/reject | Critical |
| LED1-TC-044 | Active holds exceed available via race | Impossible / Critical finding | Critical |

---

## 8. Two-Leg DvP / Partial Settlement Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| LED1-TC-045 | DvP settlement with only one leg | Rejected | Critical |
| LED1-TC-046 | One leg confirmed, other pending | one_leg_settled_other_pending | Critical |
| LED1-TC-047 | One leg fails after other confirms | Compensating unwind / suspense | Critical |
| LED1-TC-048 | In-flight leg booked to AIX inventory | Blocked | Critical |

---

## 9. Preventive Safeguarding Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| LED1-TC-049 | Credit with free confirmed backing | Credit allowed | Critical |
| LED1-TC-050 | Credit reuses encumbered backing | Blocked | Critical |
| LED1-TC-051 | Outbound settlement encumbers backing | Encumbrance created | Critical |
| LED1-TC-052 | Per-movement invariant breach | Block + freeze | Critical |
| LED1-TC-053 | Daily snapshot only, no preventive check | Blocked/go-live fail | Critical |

---

## 10. Conversion / Residual Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| LED1-TC-054 | Cross-asset conversion without linked legs | Rejected | Critical |
| LED1-TC-055 | Rounding residual without policy | Rejected | Critical |
| LED1-TC-056 | Residual exceeds bound | Exception/freeze | Critical |
| LED1-TC-057 | AIX net position nonzero after conversion | Block/freeze | Critical |
| LED1-TC-058 | Hidden spread via residual | Blocked | Critical |

---

## 11. Hash-Chain / Clawback / Idempotency Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| LED1-TC-059 | Posted journal missing hash-chain | Rejected/go-live fail | Critical |
| LED1-TC-060 | Historical journal tampered | Chain verification fails + freeze | Critical |
| LED1-TC-061 | Reversal hides original journal | Blocked | Critical |
| LED1-TC-062 | External anchor missing | Alert/review | High |
| LED1-TC-063 | Chain reorg after credit | Clawback workflow | Critical |
| LED1-TC-064 | Fiat recall after credit spent | Shortfall exception/restriction | Critical |
| LED1-TC-065 | Same idempotency key different payload | Conflict reject | Critical |

---

## 12. Operational Account / Fee Atomicity / Hold Pinning Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| LED1-TC-066 | Hold expires while settlement instructed | Expiry blocked / hold pinned | Critical |
| LED1-TC-067 | Operational account funds client settlement | Blocked | Critical |
| LED1-TC-068 | Clearing/suspense balance exceeds bound | Exception/freeze | Critical |
| LED1-TC-069 | Settlement posts but fee fails | Atomic rollback or compensated saga | Critical |
| LED1-TC-070 | Fee posts but settlement fails | Compensation | Critical |
| LED1-TC-071 | Intraday safeguarding scan detects break | Freeze/escalate | Critical |
| LED1-TC-072 | Production/test journal chain mixed | Blocked | Critical |

---

## 13. Go-Live Criteria

```txt
journal_integrity_tests_passed = true
deposit_tests_passed = true
withdrawal_payout_tests_passed = true
hold_lp_dvp_tests_passed = true
safeguarding_fee_reversal_tests_passed = true
close_freeze_reconciliation_tests_passed = true
atomic_reservation_tests_passed = true
two_leg_dvp_tests_passed = true
preventive_safeguarding_tests_passed = true
conversion_residual_tests_passed = true
hashchain_clawback_idempotency_tests_passed = true
operational_fee_hold_tests_passed = true
critical_control_coverage = 100_percent
```
