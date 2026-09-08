# DEP-01 Deposit Execution / Inbound Receipt
## 09 Error Handling

## 1. Principles

1. Deposit uncertainty remains pending or quarantined.
2. DEP-01 never credits balance.
3. Unauthenticated receipts fail closed.
4. Ambiguous matching fails to quarantine.
5. External reversal triggers LED clawback notification.
6. Error response does not expose full bank/account/wallet details.

---

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `DEP1_LED_CREDIT_PROHIBITED` | Critical | Reject/alert |
| `DEP1_FEATURE_LOCKED` | Critical/High | Reject |
| `DEP1_CLIENT_NOT_ELIGIBLE` | High | Reject |
| `DEP1_UNSUPPORTED_RAIL_ASSET` | High | Reject |
| `DEP1_RECEIPT_UNAUTHENTICATED` | Critical/High | Reject |
| `DEP1_RECEIPT_PAYLOAD_INVALID` | High | Reject |
| `DEP1_DUPLICATE_RECEIPT` | Medium/High | Return existing |
| `DEP1_IDEMPOTENCY_PAYLOAD_CONFLICT` | Critical/High | Reject/alert |
| `DEP1_RECEIPT_UNMATCHED` | High | Quarantine/unmatched |
| `DEP1_RECEIPT_AMBIGUOUS_MATCH` | Critical/High | Quarantine |
| `DEP1_SOURCE_SCREENING_REQUIRED` | High/Critical | Hold |
| `DEP1_AML_GATE_REQUIRED` | High/Critical | Hold |
| `DEP1_CONFIRMATION_INSUFFICIENT` | High | Pending |
| `DEP1_DEPOSIT_QUARANTINED` | High/Critical | Hold |
| `DEP1_LED_PENDING_REQUIRED` | High | Create/retry |
| `DEP1_LED_CREDIT_EVALUATION_REJECTED` | High/Critical | Hold/exception |
| `DEP1_REVERSAL_EVENT_RECEIVED` | Critical/High | Notify LED |
| `DEP1_CORRELATION_REQUIRED` | Critical/High | Reject/hold |
| `DEP1_AUDIT_REQUIRED` | Critical | Fail closed |
