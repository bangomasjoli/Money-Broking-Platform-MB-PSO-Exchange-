# DEP-01 Deposit Execution / Inbound Receipt
## 04 API Specification

## 1. API Principles

All DEP-01 APIs use FND request/correlation ID, idempotency and standard error envelope.

DEP-01 APIs do not credit balance or post ledger.

---

## 2. Client Deposit APIs

### 2.1 POST `/dep1/deposit-intents`

Create deposit intent/reference.

### 2.2 GET `/dep1/deposit-intents/{deposit_intent_id}`

Read deposit intent.

### 2.3 GET `/dep1/deposits/{deposit_id}`

Read deposit status.

---

## 3. Receipt Ingestion APIs

### 3.1 POST `/internal/dep1/receipts/fiat`

Ingest fiat bank receipt.

### 3.2 POST `/internal/dep1/receipts/custodian`

Ingest custodian receipt.

### 3.3 POST `/internal/dep1/receipts/chain`

Ingest chain receipt/confirmation.

### 3.4 POST `/internal/dep1/receipts/{receipt_id}/confirmation`

Update confirmation status.

### 3.5 POST `/internal/dep1/receipts/{receipt_id}/reversal`

Ingest reorg/recall/reversal.

---

## 4. Matching / Quarantine APIs

### 4.1 POST `/internal/dep1/receipts/{receipt_id}/match`

Run matching.

### 4.2 POST `/dep1/quarantine-cases/{case_id}/resolve`

Resolve quarantine case.

### 4.3 GET `/dep1/quarantine-cases/{case_id}`

Read quarantine case.

---

## 5. Handoff APIs

### 5.1 POST `/internal/dep1/deposits/{deposit_id}/send-wlt-screening`

Send inbound source to WLT-01.

### 5.2 POST `/internal/dep1/deposits/{deposit_id}/send-aml-gate`

Send source/counterparty to AML-01.

### 5.3 POST `/internal/dep1/deposits/{deposit_id}/create-led-pending`

Create LED pending deposit.

### 5.4 POST `/internal/dep1/deposits/{deposit_id}/request-led-credit-evaluation`

Request LED credit evaluation.

### 5.5 POST `/internal/dep1/deposits/{deposit_id}/notify-led-clawback`

Notify LED reversal/clawback.

---

## 6. Reconciliation APIs

### 6.1 POST `/internal/dep1/reconciliation/run`

Run deposit reconciliation.

### 6.2 GET `/dep1/reconciliation/{run_id}`

Read reconciliation result.

---

## 7. Error Codes

| Code | Meaning |
|---|---|
| `DEP1_LED_CREDIT_PROHIBITED` | DEP cannot credit ledger |
| `DEP1_FEATURE_LOCKED` | Deposit feature locked |
| `DEP1_CLIENT_NOT_ELIGIBLE` | Client not eligible |
| `DEP1_UNSUPPORTED_RAIL_ASSET` | Unsupported rail/asset/chain |
| `DEP1_RECEIPT_UNAUTHENTICATED` | Receipt source authentication failed |
| `DEP1_RECEIPT_PAYLOAD_INVALID` | Payload invalid |
| `DEP1_DUPLICATE_RECEIPT` | Duplicate receipt |
| `DEP1_IDEMPOTENCY_PAYLOAD_CONFLICT` | Same event different payload |
| `DEP1_RECEIPT_UNMATCHED` | No client/intent match |
| `DEP1_RECEIPT_AMBIGUOUS_MATCH` | Multiple possible matches |
| `DEP1_SOURCE_SCREENING_REQUIRED` | WLT screening required |
| `DEP1_AML_GATE_REQUIRED` | AML gate required |
| `DEP1_CONFIRMATION_INSUFFICIENT` | Confirmation threshold not met |
| `DEP1_DEPOSIT_QUARANTINED` | Deposit quarantined |
| `DEP1_LED_PENDING_REQUIRED` | LED pending deposit required |
| `DEP1_LED_CREDIT_EVALUATION_REJECTED` | LED rejected credit evaluation |
| `DEP1_REVERSAL_EVENT_RECEIVED` | Reorg/recall/reversal received |
| `DEP1_CORRELATION_REQUIRED` | Correlation ID required |
| `DEP1_AUDIT_REQUIRED` | SEC audit required |
