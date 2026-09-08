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

## 6. Go-Live Criteria

```txt
decision_bundle_tests_passed = true
provider_instruction_tests_passed = true
timeout_finality_tests_passed = true
return_cancellation_freeze_tests_passed = true
boundary_reconciliation_tests_passed = true
critical_control_coverage = 100_percent
```
