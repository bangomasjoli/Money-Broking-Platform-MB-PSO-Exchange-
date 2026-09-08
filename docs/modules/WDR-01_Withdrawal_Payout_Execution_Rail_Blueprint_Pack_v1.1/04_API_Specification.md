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

### 2.4 POST `/internal/wdr1/payout-executions/{payout_execution_id}/revalidate-and-submit`

Atomically revalidate bundle and submit provider instruction.

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

## 5. Batch / Conservation / Integrity APIs

### 6.1 POST `/internal/wdr1/batches`

Create batch envelope.

### 6.2 POST `/internal/wdr1/batches/{batch_id}/submit`

Submit batch/file payout after atomic revalidation.

### 5.3 POST `/internal/wdr1/payout-executions/{payout_execution_id}/validate-value-conservation`

Validate payout conservation.

### 5.4 POST `/internal/wdr1/payout-executions/{payout_execution_id}/verify-beneficiary-integrity`

Verify signed payload against WLT canonical destination.

### 5.5 POST `/internal/wdr1/provider-keys/{key_id}/validate`

Validate signing key status before use.

---

## 6. Reconciliation APIs

### 6.1 POST `/internal/wdr1/reconciliation/run`

Run payout reconciliation.

### 6.2 GET `/wdr1/reconciliation/{run_id}`

Read reconciliation result.

---

## 7. Error Codes

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
| `WDR1_SEND_TIME_REVALIDATION_REQUIRED` | Send-time revalidation required |
| `WDR1_STALE_BUNDLE_AT_SEND` | Bundle stale/revoked at send |
| `WDR1_RESERVE_SEND_LOCK_FAILED` | Reserve already bound/sent |
| `WDR1_PAYOUT_CONSERVATION_FAILED` | Reserve/sent/fee/residual mismatch |
| `WDR1_NETWORK_FEE_DISPOSITION_REQUIRED` | Network/rail fee disposition required |
| `WDR1_PARTIAL_PAYOUT_DISPOSITION_REQUIRED` | Partial payout disposition required |
| `WDR1_RAIL_FX_DISPOSITION_REQUIRED` | Rail-side FX disposition required |
| `WDR1_BENEFICIARY_INTEGRITY_FAILED` | Payload differs from WLT canonical destination |
| `WDR1_HIGH_VALUE_BENEFICIARY_CHECK_REQUIRED` | Four-eyes beneficiary verification required |
| `WDR1_BATCH_ENVELOPE_REQUIRED` | Batch/file envelope required |
| `WDR1_BATCH_FILE_INTEGRITY_FAILED` | Batch checksum/manifest failed |
| `WDR1_ITEM_IDEMPOTENCY_CONFLICT` | Batch item idempotency conflict |
| `WDR1_LOGICAL_PAYOUT_DUPLICATE` | Logical payout duplicate |
| `WDR1_STATE_VERSION_CONFLICT` | CAS status version conflict |
| `WDR1_EXECUTED_LATE` | Provider executed after cancellation |
| `WDR1_SIGNING_KEY_INVALID` | Provider signing key invalid/expired/revoked |
| `WDR1_TRAVEL_RULE_PAYLOAD_MISMATCH` | Travel Rule payload mismatch |
| `WDR1_STUCK_PAYOUT_SLA_EXCEEDED` | Pinned reserve / payout SLA exceeded |
| `WDR1_CLIENT_STATUS_TRUTH_REQUIRED` | Client status must reflect rail + LED truth |
