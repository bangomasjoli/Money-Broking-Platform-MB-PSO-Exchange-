# WDR-01 Withdrawal / Payout Execution Rail
## 13 Reconciliation Design

## 1. Purpose

WDR-01 reconciliation proves every outbound instruction is backed by a coherent decision bundle, active LED reserve, valid provider evidence, finality evidence, and LED outcome.

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| Execution request vs decision bundle | payout_execution | decision_bundle | Control completeness |
| WLT/AML/LED decisions | decision_bundle | source modules | Freshness and coherence |
| Provider instruction vs request | provider_instruction | payout_execution | Instruction mapping |
| Provider status vs instruction | provider_status_event | provider_instruction | Rail evidence |
| Finality vs LED outcome | finality_record | LED settlement | Settlement truth |
| Return/reversal vs LED notification | return_reversal_case | LED clawback/failure | Recovery |
| Audit manifest | expected events | SEC events | Evidence completeness |
| E2E saga | correlation | evidence bundle | Orphan detection |

## 3. Scheduled Jobs

1. Payout without decision bundle.
2. Payout without WLT decision.
3. Payout without AML gate.
4. Payout without LED reserve.
5. Provider instruction without approval/bundle.
6. Timeout unresolved beyond SLA.
7. Provider finality without LED notification.
8. LED settlement without provider finality.
9. Return/reversal without LED notification.
10. Duplicate provider instruction.
11. Duplicate provider event.
12. SEC event gap.
13. E2E orphan instruction.

## 4. Critical Findings

1. instruction without reserve.
2. instruction without WLT/AML.
3. operational funding suspected.
4. provider timeout blind retry.
5. premature finality.
6. ignored return/reversal.
7. reserve locally released by WDR.
8. sanctioned return without review.
