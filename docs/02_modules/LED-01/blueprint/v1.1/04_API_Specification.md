# LED-01 Ledger / Settlement / Safeguarding
## 04 API Specification

## 1. API Principles

All LED-01 APIs use FND request/correlation ID, idempotency and standard error envelope.

Financial APIs require strict idempotency.

Sensitive APIs require IAM-02 permission guard.

Ledger read/export emits SEC-01 audit where sensitive.

---

## 2. Journal APIs

### 2.1 POST `/internal/led1/journals`

Post balanced journal.

### 2.2 GET `/led1/journals/{journal_id}`

Read journal.

### 2.3 POST `/led1/journals/{journal_id}/reverse`

Request reversal.

---

## 3. Balance APIs

### 3.1 GET `/led1/clients/{client_id}/balances`

Read client derived balances.

### 3.2 GET `/internal/led1/accounts/{account_id}/balance`

Read account balance.

---

## 4. Deposit APIs

### 4.1 POST `/internal/led1/deposits/pending`

Create pending deposit.

### 4.2 POST `/internal/led1/deposits/{deposit_id}/credit`

Credit deposit to available after controls clear.

### 4.3 POST `/internal/led1/deposits/{deposit_id}/quarantine`

Mark deposit held/quarantined.

---

## 5. Hold / Reserve APIs

### 5.1 POST `/internal/led1/holds`

Create prefunded hold/reserve.

### 5.2 POST `/internal/led1/holds/{hold_id}/consume`

Consume hold into settlement.

### 5.3 POST `/internal/led1/holds/{hold_id}/release`

Release hold.

---

## 6. Atomic Reservation / DvP / Safeguarding APIs

### 9.1 POST `/internal/led1/reservations/atomic`

Create atomic conditional reservation.

### 9.2 POST `/internal/led1/dvp-settlements`

Create linked two-leg DvP settlement group.

### 9.3 POST `/internal/led1/backing/encumber`

Encumber safeguarded backing.

### 7.4 POST `/internal/led1/conversions`

Create cross-asset conversion event.

### 6.5 POST `/internal/led1/journal-chain/verify`

Verify journal hash-chain.

### 6.6 POST `/internal/led1/clawbacks`

Create post-credit clawback case.

---

## 7. Settlement APIs

### 9.1 POST `/internal/led1/settlements/payout`

Create payout settlement case.

### 9.2 POST `/internal/led1/settlements/trade`

Create trade/LP settlement case.

### 9.3 POST `/internal/led1/settlements/{settlement_id}/confirm`

Confirm settlement outcome and post final journal.

### 7.4 POST `/internal/led1/settlements/{settlement_id}/fail`

Mark settlement failed and route hold handling.

---

## 8. Reconciliation APIs

### 9.1 POST `/internal/led1/reconciliation/run`

Run reconciliation.

### 9.2 GET `/led1/reconciliation/{run_id}`

Read reconciliation result.

### 9.3 POST `/led1/exceptions/{exception_id}/resolve`

Resolve exception.

---

## 9. Close / Freeze APIs

### 9.1 POST `/led1/freeze`

Create freeze.

### 9.2 POST `/led1/freeze/{freeze_id}/release`

Release freeze.

### 9.3 POST `/led1/period-close`

Close period.

---

## 10. Error Codes

| Code | Meaning |
|---|---|
| `LED1_UNBALANCED_JOURNAL` | Debits and credits do not balance |
| `LED1_DIRECT_BALANCE_EDIT_PROHIBITED` | Direct balance edit prohibited |
| `LED1_DUPLICATE_SOURCE_EVENT` | Duplicate source event/idempotency |
| `LED1_ACCOUNT_NOT_FOUND` | Ledger account not found |
| `LED1_PERIOD_CLOSED` | Period closed |
| `LED1_SCOPE_FROZEN` | Client/asset/module/rail frozen |
| `LED1_INSUFFICIENT_AVAILABLE_BALANCE` | Available balance insufficient |
| `LED1_NEGATIVE_AVAILABLE_PROHIBITED` | Negative available balance prohibited |
| `LED1_BACKING_NOT_VERIFIED` | Safeguarded backing not verified |
| `LED1_SAFEGUARDING_INVARIANT_BREACH` | Client liabilities exceed assets |
| `LED1_DEPOSIT_SOURCE_NOT_CLEAR` | WLT/inbound source not clear |
| `LED1_RECEIPT_NOT_CONFIRMED` | Receipt confirmation missing |
| `LED1_WLT_DECISION_REQUIRED` | WLT decision required |
| `LED1_WLT_DECISION_INVALID` | WLT decision invalid/stale/scope mismatch |
| `LED1_AML_GATE_REQUIRED` | AML gate required |
| `LED1_AML_DECISION_STALE` | AML decision stale/revoked |
| `LED1_HOLD_REQUIRED` | Hold required |
| `LED1_HOLD_EXPIRED` | Hold expired/released |
| `LED1_DVP_SEQUENCE_INVALID` | DvP sequence invalid |
| `LED1_AIX_EXPOSURE_PROHIBITED` | AIX exposure prohibited |
| `LED1_FEE_DISCLOSURE_REQUIRED` | Fee disclosure required |
| `LED1_REVERSAL_APPROVAL_REQUIRED` | Reversal approval required |
| `LED1_RECONCILIATION_BREAK` | Reconciliation break |
| `LED1_ATOMIC_RESERVATION_REQUIRED` | Atomic reservation required |
| `LED1_BALANCE_VERSION_CONFLICT` | Live balance version conflict |
| `LED1_SNAPSHOT_RESERVATION_PROHIBITED` | Snapshot cannot be reservation source |
| `LED1_DVP_TWO_LEG_REQUIRED` | Two-leg DvP required |
| `LED1_PARTIAL_SETTLEMENT_PENDING` | One leg settled/other pending |
| `LED1_COMPENSATING_UNWIND_REQUIRED` | Compensating unwind required |
| `LED1_BACKING_ENCUMBERED` | Backing already encumbered |
| `LED1_FREE_BACKING_INSUFFICIENT` | Free backing insufficient |
| `LED1_CONVERSION_LEGS_REQUIRED` | Linked conversion legs required |
| `LED1_RESIDUAL_POLICY_REQUIRED` | Rounding/residual policy required |
| `LED1_AIX_NET_POSITION_NONZERO` | AIX net position non-zero |
| `LED1_JOURNAL_HASH_CHAIN_INVALID` | Journal hash-chain invalid |
| `LED1_EXTERNAL_ANCHOR_MISSING` | External anchor missing |
| `LED1_HOLD_PINNED_INFLIGHT` | Hold pinned by in-flight settlement |
| `LED1_CLAWBACK_REQUIRED` | Reorg/recall clawback required |
| `LED1_IDEMPOTENCY_PAYLOAD_CONFLICT` | Same key different payload |
| `LED1_OPERATIONAL_ACCOUNT_BOUND_BREACH` | Operational/clearing bound breach |
| `LED1_FEE_SETTLEMENT_ATOMICITY_REQUIRED` | Fee settlement atomicity required |
