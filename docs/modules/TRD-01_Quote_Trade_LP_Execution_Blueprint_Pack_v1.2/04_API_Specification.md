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

## 6. Resolution / Conservation / Confirmation APIs

### 7.1 POST `/internal/trd1/lp-orders/{lp_order_id}/query-status`

Query LP order status after timeout.

### 7.2 POST `/internal/trd1/trades/{trade_id}/validate-fill-conservation`

Validate LP/client fill conservation.

### 6.3 POST `/internal/trd1/trades/{trade_id}/revalidate-cfg`

Revalidate CFG-01 licence lock at execution/settlement.

### 6.4 POST `/internal/trd1/trades/{trade_id}/led-settlement-outcome`

Receive LED-01 settlement outcome and update confirmation.

---

## 7. Reconciliation APIs

### 7.1 POST `/internal/trd1/reconciliation/run`

Run reconciliation.

### 7.2 GET `/trd1/reconciliation/{run_id}`

Read reconciliation result.

---

## 8. Error Codes

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
| `TRD1_PRINCIPAL_WINDOW_PROHIBITED` | Accept-to-fill principal window prohibited |
| `TRD1_LP_QUOTE_NOT_FIRM` | Firm quote required but LP quote not firm |
| `TRD1_CLIENT_QUOTE_EXCEEDS_LP_VALIDITY` | Client quote validity exceeds LP quote validity |
| `TRD1_FILL_CONSERVATION_FAILED` | Client fill not conserved against LP fill |
| `TRD1_LP_FILL_ALREADY_ALLOCATED` | LP fill quantity already allocated |
| `TRD1_PRICE_IDENTITY_FAILED` | Client price not equal to LP price +/- disclosed fee |
| `TRD1_QUOTE_HASH_LP_EVIDENCE_MISSING` | Quote hash missing LP evidence |
| `TRD1_LP_TIMEOUT_QUERYBACK_REQUIRED` | LP timeout requires status query-back |
| `TRD1_LATE_FILL_GUARD` | Late fill cannot settle |
| `TRD1_INTERNALISATION_PROHIBITED` | Internal crossing/netting prohibited |
| `TRD1_SYNTHETIC_LP_FILL_PROHIBITED` | Synthetic LP fill prohibited |
| `TRD1_CFG_REVALIDATION_REQUIRED` | CFG revalidation required |
| `TRD1_CFG_DECISION_STALE` | CFG decision stale/revoked |
| `TRD1_BEST_EXECUTION_RECORD_REQUIRED` | LP-selection evidence required |
| `TRD1_POSITIVE_SLIPPAGE_TO_CLIENT_REQUIRED` | Positive slippage must pass to client |
| `TRD1_PARTIAL_HOLD_RELEASE_ATOMIC_REQUIRED` | Partial hold release must be LED-atomic |
| `TRD1_TRADE_STATE_VERSION_CONFLICT` | Trade state compare-and-set conflict |
| `TRD1_CONFIRMATION_LED_OUTCOME_REQUIRED` | Confirmation requires LED actual outcome |
