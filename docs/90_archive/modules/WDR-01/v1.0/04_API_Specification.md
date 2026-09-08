# WDR-01 Withdrawal / Payout Execution Rail
## 04 API Specification

## 1. API Principles

All WDR-01 APIs use FND request/correlation ID, idempotency and standard error envelope.

WDR-01 APIs do not post ledger or credit/debit client balances directly.

---

## 2. Execution APIs

### 2.1 POST `/internal/wdr1/payout-executions`

Create payout execution from authorised request.

### 2.2 GET `/wdr1/payout-executions/{payout_execution_id}`

Read payout execution.

### 2.3 POST `/internal/wdr1/payout-executions/{payout_execution_id}/validate-bundle`

Validate coherent decision bundle.

### 2.4 POST `/internal/wdr1/payout-executions/{payout_execution_id}/submit`

Submit provider instruction.

### 2.5 POST `/internal/wdr1/payout-executions/{payout_execution_id}/cancel`

Cancel provider instruction where permitted.

---

## 3. Provider Callback APIs

### 3.1 POST `/internal/wdr1/provider/acknowledgements`

Receive provider acknowledgement.

### 3.2 POST `/internal/wdr1/provider/status-updates`

Receive provider status/finality update.

### 3.3 POST `/internal/wdr1/provider/returns-reversals`

Receive return/reversal.

### 3.4 POST `/internal/wdr1/provider/query-back`

Query provider for indeterminate instruction.

---

## 4. LED Notification APIs

### 4.1 POST `/internal/wdr1/payout-executions/{payout_execution_id}/notify-led-finality`

Notify LED of finality.

### 4.2 POST `/internal/wdr1/payout-executions/{payout_execution_id}/notify-led-failure`

Notify LED of failure/return/reversal.

---

## 5. Reconciliation APIs

### 5.1 POST `/internal/wdr1/reconciliation/run`

Run payout reconciliation.

### 5.2 GET `/wdr1/reconciliation/{run_id}`

Read reconciliation result.

---

## 6. Error Codes

| Code | Meaning |
|---|---|
| `WDR1_LEDGER_POST_PROHIBITED` | WDR cannot post ledger |
| `WDR1_UNAUTHORISED_SOURCE` | Execution request source not authorised |
| `WDR1_CORRELATION_REQUIRED` | Correlation ID required |
| `WDR1_DECISION_BUNDLE_INVALID` | Decision bundle invalid |
| `WDR1_WLT_DECISION_REQUIRED` | WLT verify-and-consume required |
| `WDR1_WLT_DECISION_STALE` | WLT decision stale/revoked |
| `WDR1_AML_GATE_REQUIRED` | AML gate required |
| `WDR1_TRAVEL_RULE_REQUIRED` | Travel Rule data required |
| `WDR1_LED_RESERVE_REQUIRED` | LED reserve required |
| `WDR1_LED_RESERVE_INVALID` | LED reserve invalid/stale/released |
| `WDR1_CFG_LOCKED` | CFG feature/kill-switch locked |
| `WDR1_IAM_APPROVAL_REQUIRED` | IAM approval required |
| `WDR1_PROVIDER_NOT_APPROVED` | Provider not approved |
| `WDR1_PROVIDER_AUTH_FAILED` | Provider auth/signing failed |
| `WDR1_IDEMPOTENCY_CONFLICT` | Same key different payload |
| `WDR1_TIMEOUT_QUERYBACK_REQUIRED` | Query-back required |
| `WDR1_FINALITY_NOT_REACHED` | Finality not reached |
| `WDR1_RETURN_REVERSAL_RECEIVED` | Return/reversal received |
| `WDR1_CANCELLATION_NOT_ALLOWED` | Cancellation not allowed |
| `WDR1_PRINCIPAL_FUNDING_PROHIBITED` | AIX principal funding prohibited |
| `WDR1_AUDIT_REQUIRED` | SEC audit required |
