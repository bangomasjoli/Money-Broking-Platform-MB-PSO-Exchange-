# E2E-01 Cross-Module End-to-End Fund-Flow Review
## 13 Saga And Compensation Model

## 1. Purpose

This file defines the global consistency model for multi-hop money paths crossing independent module transactions and external side effects.

## 2. Saga Spine

Every money path must have:

```txt
correlation_id
saga_id
saga_type
client_id
action_type
amount
asset_or_currency
initiating_module
current_step
status
created_at_utc
sec_audit_ref
```

## 3. Saga Types

1. deposit_credit_saga.
2. payout_withdrawal_saga.
3. trade_execution_saga.
4. settlement_reversal_saga.
5. freeze_recovery_saga.

## 4. Trade Execution Saga Steps

| Step | Forward Action | Compensation | Owner | SLA |
|---|---|---|---|---|
| T1 | Create eligibility snapshot | expire snapshot | E2E/FND | immediate |
| T2 | Verify CFG/AML/client bundle | mark bundle failed | CFG/AML/CLT | immediate |
| T3 | Create LED hold | release hold | LED | configured |
| T4 | Submit LP order | query/cancel LP order | TRD | configured |
| T5 | Receive LP fill | query-back / exception | TRD | configured |
| T6 | Settlement handoff | retry/deadletter/escalate | TRD/LED | configured |
| T7 | LED settlement | reverse/compensate if needed | LED | configured |
| T8 | Client confirmation | correction notice | TRD | configured |

## 5. Payout Saga Steps

| Step | Forward Action | Compensation | Owner | SLA |
|---|---|---|---|---|
| P1 | Create eligibility snapshot | expire snapshot | E2E/FND | immediate |
| P2 | WLT verify-and-consume | release/expire decision if no reserve | WLT | configured |
| P3 | LED atomic reserve | release reserve | LED | configured |
| P4 | Rail instruction | query/cancel rail if possible | WDR pending | configured |
| P5 | Rail confirmation | query/escalate | WDR/LED | configured |
| P6 | Ledger settlement | reversal/exception | LED | configured |

## 6. Deposit Saga Steps

| Step | Forward Action | Compensation | Owner | SLA |
|---|---|---|---|---|
| D1 | Receive external deposit | mark pending | DEP pending/LED | immediate |
| D2 | Screen/match source | quarantine if not clear | WLT/AML | configured |
| D3 | Confirm backing | keep pending/quarantine | LED | configured |
| D4 | Credit ledger | clawback if external reversal | LED | configured |
| D5 | Reconcile | exception | LED | configured |

## 7. Orphaned Intermediate-State Sweeper

Scheduled sweeper must detect:

1. WLT decision consumed without LED reserve.
2. LED hold active without live trade/payout.
3. TRD LP order submitted without terminal resolution.
4. LP fill without client fill.
5. client fill without LED settlement.
6. settlement handoff without LED outcome.
7. rail instruction without ledger settlement.
8. pending deposit older than SLA.
9. frozen saga still progressing.

Sweeper action:

```txt
detect -> classify -> compensate_or_hold -> escalate -> audit -> reconcile
```

## 8. Compensation Principles

1. Compensation must not create hidden principal exposure.
2. Compensation must be auditable.
3. Compensation cannot delete original evidence.
4. Compensation must preserve ledger hash-chain.
5. Compensation of irreversible external action routes to quarantine/exception, not silent completion.
