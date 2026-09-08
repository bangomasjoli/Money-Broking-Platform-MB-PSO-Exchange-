# TRD-01 Quote / Trade / LP Execution
## 09 Error Handling

## 1. Principles

1. LP uncertainty fails to pending reconciliation, not blind retry.
2. No LP fill means no final client fill.
3. Unknown hold/AML/client status fails closed.
4. Expired quote is not executable.
5. Prohibited Exchange features fail closed.
6. Error response does not expose LP secrets or internal routing.

---

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `TRD1_FEATURE_LOCKED` | Critical/High | Reject |
| `TRD1_EXCHANGE_FEATURE_PROHIBITED` | Critical | Reject/alert |
| `TRD1_CLIENT_NOT_ELIGIBLE` | High | Reject |
| `TRD1_INSTRUMENT_NOT_ALLOWED` | High | Reject |
| `TRD1_LP_NOT_APPROVED` | High | Reject |
| `TRD1_LP_UNAVAILABLE` | High | Fail closed |
| `TRD1_LP_QUOTE_INVALID` | High | Reject |
| `TRD1_QUOTE_EXPIRED` | High | Reject |
| `TRD1_QUOTE_HASH_INVALID` | Critical/High | Reject |
| `TRD1_FEE_DISCLOSURE_REQUIRED` | High | Reject |
| `TRD1_LED_HOLD_REQUIRED` | Critical | Reject |
| `TRD1_LED_HOLD_INVALID` | Critical | Reject |
| `TRD1_AML_GATE_REQUIRED` | Critical | Reject |
| `TRD1_AML_DECISION_STALE` | Critical | Reject |
| `TRD1_LP_EXECUTION_TIMEOUT` | High | Reconcile |
| `TRD1_SLIPPAGE_EXCEEDED` | High/Critical | Requote/void/confirm |
| `TRD1_PARTIAL_FILL_REVIEW` | High | Review |
| `TRD1_NO_LP_FILL` | Critical | No client fill |
| `TRD1_PRINCIPAL_EXPOSURE_PROHIBITED` | Critical | Reject/alert |
| `TRD1_SPREAD_MARKUP_PROHIBITED` | Critical | Reject/alert |
| `TRD1_IDEMPOTENCY_CONFLICT` | Critical/High | Reject |
| `TRD1_SETTLEMENT_HANDOFF_FAILED` | Critical/High | Retry/deadletter/escalate |
| `TRD1_PRINCIPAL_WINDOW_PROHIBITED` | Critical | Reject/requote/contingent |
| `TRD1_LP_QUOTE_NOT_FIRM` | High/Critical | Requote/contingent |
| `TRD1_CLIENT_QUOTE_EXCEEDS_LP_VALIDITY` | High/Critical | Reject |
| `TRD1_FILL_CONSERVATION_FAILED` | Critical | Block client fill |
| `TRD1_LP_FILL_ALREADY_ALLOCATED` | Critical | Block/alert |
| `TRD1_PRICE_IDENTITY_FAILED` | Critical | Block/alert |
| `TRD1_QUOTE_HASH_LP_EVIDENCE_MISSING` | Critical | Reject |
| `TRD1_LP_TIMEOUT_QUERYBACK_REQUIRED` | High/Critical | Query-back |
| `TRD1_LATE_FILL_GUARD` | Critical/High | Park exception |
| `TRD1_INTERNALISATION_PROHIBITED` | Critical | Reject/alert |
| `TRD1_SYNTHETIC_LP_FILL_PROHIBITED` | Critical | Reject/alert |
| `TRD1_CFG_REVALIDATION_REQUIRED` | Critical | Reject |
| `TRD1_CFG_DECISION_STALE` | Critical | Reject |
| `TRD1_BEST_EXECUTION_RECORD_REQUIRED` | High | Hold/review |
| `TRD1_POSITIVE_SLIPPAGE_TO_CLIENT_REQUIRED` | Critical/High | Correct/block |
| `TRD1_PARTIAL_HOLD_RELEASE_ATOMIC_REQUIRED` | High/Critical | Hold/retry |
| `TRD1_TRADE_STATE_VERSION_CONFLICT` | High | Retry/park |
| `TRD1_CONFIRMATION_LED_OUTCOME_REQUIRED` | High/Critical | Pending, not settled |
