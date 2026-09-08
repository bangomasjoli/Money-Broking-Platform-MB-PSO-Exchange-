# TRD-01 Quote / Trade / LP Execution
## 04 API Specification

## 1. API Principles

All TRD-01 APIs use FND request/correlation ID, idempotency and standard error envelope.

Trade APIs require strict idempotency and audit.

---

## 2. Quote APIs

### 2.1 POST `/trd1/quotes`

Request client quote.

### 2.2 GET `/trd1/quotes/{quote_id}`

Read quote.

### 2.3 POST `/trd1/quotes/{quote_id}/accept`

Accept quote.

### 2.4 POST `/trd1/quotes/{quote_id}/cancel`

Cancel/decline quote.

---

## 3. Trade APIs

### 3.1 GET `/trd1/trades/{trade_id}`

Read trade.

### 3.2 POST `/internal/trd1/trades/{trade_id}/execute`

Submit LP execution.

### 3.3 POST `/internal/trd1/trades/{trade_id}/settlement-handoff`

Send settlement handoff to LED-01.

---

## 4. LP APIs

### 4.1 POST `/internal/trd1/lp/quotes`

Request LP quote.

### 4.2 POST `/internal/trd1/lp/executions`

Submit LP execution.

### 4.3 POST `/internal/trd1/lp/updates`

Receive LP update/fill/reject.

---

## 5. Admin APIs

### 5.1 POST `/trd1/admin/instruments`

Configure instrument/pair.

### 5.2 POST `/trd1/admin/lps`

Configure LP.

### 5.3 POST `/trd1/admin/slippage-policy`

Configure slippage policy.

---

## 6. Reconciliation APIs

### 6.1 POST `/internal/trd1/reconciliation/run`

Run reconciliation.

### 6.2 GET `/trd1/reconciliation/{run_id}`

Read reconciliation result.

---

## 7. Error Codes

| Code | Meaning |
|---|---|
| `TRD1_FEATURE_LOCKED` | Feature/licence locked |
| `TRD1_EXCHANGE_FEATURE_PROHIBITED` | Exchange feature prohibited |
| `TRD1_CLIENT_NOT_ELIGIBLE` | Client not eligible |
| `TRD1_INSTRUMENT_NOT_ALLOWED` | Instrument/pair not allowed |
| `TRD1_LP_NOT_APPROVED` | LP not approved |
| `TRD1_LP_UNAVAILABLE` | LP unavailable |
| `TRD1_LP_QUOTE_INVALID` | LP quote invalid |
| `TRD1_QUOTE_EXPIRED` | Quote expired |
| `TRD1_QUOTE_HASH_INVALID` | Quote hash invalid |
| `TRD1_FEE_DISCLOSURE_REQUIRED` | Fee disclosure required |
| `TRD1_LED_HOLD_REQUIRED` | LED prefunded hold required |
| `TRD1_LED_HOLD_INVALID` | LED hold invalid |
| `TRD1_AML_GATE_REQUIRED` | AML gate required |
| `TRD1_AML_DECISION_STALE` | AML decision stale |
| `TRD1_LP_EXECUTION_TIMEOUT` | LP execution timeout |
| `TRD1_SLIPPAGE_EXCEEDED` | Slippage exceeded |
| `TRD1_PARTIAL_FILL_REVIEW` | Partial fill review required |
| `TRD1_NO_LP_FILL` | No LP fill |
| `TRD1_PRINCIPAL_EXPOSURE_PROHIBITED` | AIX exposure prohibited |
| `TRD1_SPREAD_MARKUP_PROHIBITED` | Spread markup prohibited |
| `TRD1_IDEMPOTENCY_CONFLICT` | Same key different payload |
| `TRD1_SETTLEMENT_HANDOFF_FAILED` | LED settlement handoff failed |
