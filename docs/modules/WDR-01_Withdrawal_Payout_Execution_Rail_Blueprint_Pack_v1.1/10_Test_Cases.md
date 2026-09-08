# WDR-01 Withdrawal / Payout Execution Rail
## 10 Test Cases

## 1. Decision Bundle / Intake Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WDR1-TC-001 | Valid execution request with correlation | Execution created | Critical |
| WDR1-TC-002 | Missing correlation ID | Rejected | Critical |
| WDR1-TC-003 | Unauthorised source workflow | Rejected | Critical |
| WDR1-TC-004 | WLT decision missing | Rejected | Critical |
| WDR1-TC-005 | AML gate stale | Rejected | Critical |
| WDR1-TC-006 | Travel Rule missing where required | Hold/reject | Critical |
| WDR1-TC-007 | LED reserve missing | Rejected | Critical |
| WDR1-TC-008 | LED reserve amount/destination mismatch | Rejected | Critical |
| WDR1-TC-009 | CFG kill-switch active | Blocked | Critical |
| WDR1-TC-010 | IAM/client dual approval missing | Hold/reject | Critical |

## 2. Provider Instruction Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WDR1-TC-011 | Approved provider route | Instruction built | Critical |
| WDR1-TC-012 | Suspended provider | Rejected | Critical |
| WDR1-TC-013 | Provider auth key invalid | Rejected/alert | Critical |
| WDR1-TC-014 | Same idempotency key same payload | Existing result | Critical |
| WDR1-TC-015 | Same idempotency key different payload | Conflict | Critical |
| WDR1-TC-016 | Provider file/API sequence gap | Hold/recon | Critical |

## 3. Timeout / Finality Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WDR1-TC-017 | Provider timeout | Query-back, no blind retry | Critical |
| WDR1-TC-018 | Query-back reports executed | Finality workflow | Critical |
| WDR1-TC-019 | Query-back reports failed | Notify LED failure | Critical |
| WDR1-TC-020 | Unknown beyond SLA | Escalate | Critical |
| WDR1-TC-021 | Provider ack treated as final prematurely | Blocked | Critical |
| WDR1-TC-022 | Chain broadcast without confirmations | Pending | Critical |
| WDR1-TC-023 | Finality reached | Notify LED | Critical |

## 4. Return / Cancellation / Freeze Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WDR1-TC-024 | Provider return received | Notify LED, no local release | Critical |
| WDR1-TC-025 | Provider reversal received | Notify LED, evidence preserved | Critical |
| WDR1-TC-026 | Cancellation before finality | Provider cancel + LED notify | High |
| WDR1-TC-027 | Cancellation after finality | Rejected/too late | Critical |
| WDR1-TC-028 | Late execution after cancellation | Exception/escalate | Critical |
| WDR1-TC-029 | Freeze after submitted before finality | Quiesce/query/cancel if possible | Critical |
| WDR1-TC-030 | Irreversible payout during freeze | Quarantine/escalate | Critical |

## 5. Boundary / Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WDR1-TC-031 | WDR attempts ledger post | Blocked/alert | Critical |
| WDR1-TC-032 | WDR releases LED reserve locally | Blocked | Critical |
| WDR1-TC-033 | Operational account funds payout | Blocked | Critical |
| WDR1-TC-034 | Duplicate provider ack | No duplicate LED settlement | Critical |
| WDR1-TC-035 | Provider finality without LED notification | Recon break | Critical |
| WDR1-TC-036 | LED settlement without provider finality | Critical break | Critical |
| WDR1-TC-037 | Return-to-source shortcut without payout controls | Blocked | Critical |
| WDR1-TC-038 | Return to sanctioned source | Compliance/legal escalation | Critical |
| WDR1-TC-039 | Missing SEC event | Critical break | Critical |
| WDR1-TC-040 | Orphan instruction past SLA | Sweeper/escalation | Critical |


## 6. v1.1 Atomic Send / Double-Pay Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WDR1-TC-041 | WLT revokes after bundle validation before send | No transmit, fail closed | Critical |
| WDR1-TC-042 | CFG kill-switch flips during build→send window | No transmit | Critical |
| WDR1-TC-043 | LED reserve released before send | No transmit | Critical |
| WDR1-TC-044 | Same LED reserve used by two executions | Only one send lock succeeds | Critical |
| WDR1-TC-045 | Duplicate logical payout request | Existing/conflict, no second send | Critical |
| WDR1-TC-046 | Provider send without atomic revalidation path | Design/build fail | Critical |

## 7. v1.1 Value Conservation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WDR1-TC-047 | Reserve != sent + fee + residual | Critical break | Critical |
| WDR1-TC-048 | Network fee funded from AIX operational account | Blocked | Critical |
| WDR1-TC-049 | Partial payout without disposition | Hold/review | Critical |
| WDR1-TC-050 | Rail-side FX slippage absorbed by AIX | Blocked | Critical |
| WDR1-TC-051 | LED finality notified before conservation check | Blocked | Critical |

## 8. v1.1 Beneficiary Integrity Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WDR1-TC-052 | Signed payload destination differs from WLT canonical destination | Blocked | Critical |
| WDR1-TC-053 | Payload hash excludes beneficiary details | Design/build fail | Critical |
| WDR1-TC-054 | High-value payout without four-eyes beneficiary verification | Hold/block | Critical |
| WDR1-TC-055 | Travel Rule payload sent differs from AML-cleared payload | Blocked | Critical |
| WDR1-TC-056 | Counterparty VASP unreachable where required | Hold/review | High |

## 9. v1.1 Batch / File Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WDR1-TC-057 | Batch file has checksum mismatch | Blocked | Critical |
| WDR1-TC-058 | Bank acks file but one item fails | Item-level failure handled | Critical |
| WDR1-TC-059 | Retry batch resends successful item | Blocked | Critical |
| WDR1-TC-060 | Item idempotency conflict | Blocked | Critical |
| WDR1-TC-061 | Batch finality treated as item finality | Blocked | Critical |

## 10. v1.1 State / Key / Status Truth Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WDR1-TC-062 | Out-of-order provider event overwrites final state | CAS blocks/parks | Critical |
| WDR1-TC-063 | Late execution after cancellation | Actual settlement + exception | Critical |
| WDR1-TC-064 | Expired signing key used | Blocked | Critical |
| WDR1-TC-065 | Revoked signing key used | Blocked | Critical |
| WDR1-TC-066 | Reserve pinned unknown beyond SLA | Escalation/orphan sweep | Critical |
| WDR1-TC-067 | Client status shows paid on provider ack only | Blocked/corrected | Critical |
| WDR1-TC-068 | Return/reversal after paid status | Status corrected | Critical |
| WDR1-TC-069 | E2E evidence missing reserve send lock | Critical break | Critical |
| WDR1-TC-070 | SEC event missing for send-time revalidation | Critical break | Critical |

## 11. v1.1 Additional Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WDR1-TC-071 | Provider instruction without reserve-send lock | Critical break | Critical |
| WDR1-TC-072 | Reserve-send lock without provider instruction past SLA | Orphan/escalate | Critical |
| WDR1-TC-073 | Batch item final but LED not notified | Reconciliation break | Critical |
| WDR1-TC-074 | LED settled but provider item failed | Critical break | Critical |
| WDR1-TC-075 | Duplicate provider external ref across executions | Critical break | Critical |
| WDR1-TC-076 | Client-facing complete but LED failed | Status corrected/critical break | Critical |

---

## 12. Go-Live Criteria

```txt
decision_bundle_tests_passed = true
provider_instruction_tests_passed = true
timeout_finality_tests_passed = true
return_cancellation_freeze_tests_passed = true
boundary_reconciliation_tests_passed = true
atomic_send_double_pay_tests_passed = true
value_conservation_tests_passed = true
beneficiary_integrity_tests_passed = true
batch_file_tests_passed = true
state_key_status_truth_tests_passed = true
additional_reconciliation_tests_passed = true
critical_control_coverage = 100_percent
```
