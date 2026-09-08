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

## 6. Revocation / Bundle / Finality APIs

### 7.1 POST `/internal/dep1/revocations/aml-wlt`

Receive AML/WLT revocation or new-hit signal.

### 7.2 POST `/internal/dep1/deposits/{deposit_id}/revalidate-credit-bundle`

Revalidate coherent bundle before LED credit evaluation.

### 6.3 POST `/internal/dep1/deposits/{deposit_id}/source-of-funds`

Record own-source / third-party / SoF review outcome.

### 6.4 POST `/internal/dep1/receipts/{receipt_id}/finality-evaluate`

Evaluate per-source finality model.

### 6.5 POST `/internal/dep1/receipts/{receipt_id}/independent-truth-check`

Perform bank/chain/custodian independent truth check.

### 6.6 POST `/internal/dep1/deposits/{deposit_id}/return-case`

Create controlled return/remediation case.

---

## 7. Reconciliation APIs

### 7.1 POST `/internal/dep1/reconciliation/run`

Run deposit reconciliation.

### 7.2 GET `/dep1/reconciliation/{run_id}`

Read reconciliation result.

---

## 8. Error Codes

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
| `DEP1_CREDIT_BUNDLE_REVALIDATION_REQUIRED` | Coherent bundle revalidation required |
| `DEP1_SCREENING_DECISION_STALE` | WLT/AML screening decision stale |
| `DEP1_SCREENING_REVOKED` | AML/WLT revocation received |
| `DEP1_SOURCE_OWNERSHIP_REQUIRED` | Own-source binding required |
| `DEP1_THIRD_PARTY_SOURCE_REVIEW` | Third-party source requires SoF review |
| `DEP1_SOF_SOW_EVIDENCE_REQUIRED` | SoF/SoW evidence required |
| `DEP1_FINALITY_MODEL_REQUIRED` | Finality model required |
| `DEP1_CRYPTO_FINALITY_UNCORROBORATED` | Crypto finality not corroborated |
| `DEP1_FIAT_RETURN_WINDOW_OPEN` | Fiat return/recall window open |
| `DEP1_PROVIDER_IDENTITY_INVALID` | Provider identity/authentication invalid |
| `DEP1_FILE_FEED_SEQUENCE_GAP` | File feed missing sequence |
| `DEP1_INDEPENDENT_TRUTH_REQUIRED` | Independent truth check required |
| `DEP1_REFERENCE_REUSE_REVIEW` | Reference/address reuse requires review |
| `DEP1_EXPIRED_INTENT_DEPOSIT` | Deposit to expired/cancelled intent |
| `DEP1_AMOUNT_DISPOSITION_REQUIRED` | Partial/over/under/dust policy required |
| `DEP1_INBOUND_TRAVEL_RULE_REQUIRED` | Inbound Travel Rule data required |
| `DEP1_RETURN_PATH_CONTROL_REQUIRED` | Return must use payout controls |
| `DEP1_REVERSAL_CORRELATION_REQUIRED` | Reversal must bind original correlation |
