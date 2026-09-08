# WDR-01 Withdrawal / Payout Execution Rail
## 09 Error Handling

## 1. Principles

1. Unknown provider status becomes reconcile_required.
2. Timeout is not a failure and not success until query-back.
3. WDR never releases reserve locally.
4. WDR never posts ledger.
5. Stale decision bundle fails closed.
6. Return/reversal is preserved and sent to LED.

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `WDR1_LEDGER_POST_PROHIBITED` | Critical | Reject/alert |
| `WDR1_UNAUTHORISED_SOURCE` | Critical/High | Reject |
| `WDR1_CORRELATION_REQUIRED` | Critical/High | Reject |
| `WDR1_DECISION_BUNDLE_INVALID` | Critical | Reject |
| `WDR1_WLT_DECISION_REQUIRED` | Critical | Reject |
| `WDR1_WLT_DECISION_STALE` | Critical | Reject |
| `WDR1_AML_GATE_REQUIRED` | Critical | Reject |
| `WDR1_TRAVEL_RULE_REQUIRED` | Critical/High | Hold |
| `WDR1_LED_RESERVE_REQUIRED` | Critical | Reject |
| `WDR1_LED_RESERVE_INVALID` | Critical | Reject |
| `WDR1_CFG_LOCKED` | Critical | Reject/quiesce |
| `WDR1_IAM_APPROVAL_REQUIRED` | High/Critical | Hold/reject |
| `WDR1_PROVIDER_NOT_APPROVED` | High | Reject |
| `WDR1_PROVIDER_AUTH_FAILED` | Critical/High | Reject/alert |
| `WDR1_IDEMPOTENCY_CONFLICT` | Critical/High | Reject |
| `WDR1_TIMEOUT_QUERYBACK_REQUIRED` | High/Critical | Query-back |
| `WDR1_FINALITY_NOT_REACHED` | High | Pending |
| `WDR1_RETURN_REVERSAL_RECEIVED` | Critical/High | Notify LED |
| `WDR1_CANCELLATION_NOT_ALLOWED` | High | Reject/escalate |
| `WDR1_PRINCIPAL_FUNDING_PROHIBITED` | Critical | Reject/alert |
| `WDR1_AUDIT_REQUIRED` | Critical | Fail closed |
| `WDR1_SEND_TIME_REVALIDATION_REQUIRED` | Critical | Block send |
| `WDR1_STALE_BUNDLE_AT_SEND` | Critical | Reject/no transmit |
| `WDR1_RESERVE_SEND_LOCK_FAILED` | Critical | Reject/alert |
| `WDR1_PAYOUT_CONSERVATION_FAILED` | Critical | Block LED finality notify |
| `WDR1_NETWORK_FEE_DISPOSITION_REQUIRED` | High/Critical | Hold/review |
| `WDR1_PARTIAL_PAYOUT_DISPOSITION_REQUIRED` | High/Critical | Hold/review |
| `WDR1_RAIL_FX_DISPOSITION_REQUIRED` | High/Critical | Hold/review |
| `WDR1_BENEFICIARY_INTEGRITY_FAILED` | Critical | Block send |
| `WDR1_HIGH_VALUE_BENEFICIARY_CHECK_REQUIRED` | High/Critical | Hold |
| `WDR1_BATCH_ENVELOPE_REQUIRED` | High/Critical | Reject |
| `WDR1_BATCH_FILE_INTEGRITY_FAILED` | Critical | Block send |
| `WDR1_ITEM_IDEMPOTENCY_CONFLICT` | Critical/High | Reject |
| `WDR1_LOGICAL_PAYOUT_DUPLICATE` | Critical/High | Return existing/conflict |
| `WDR1_STATE_VERSION_CONFLICT` | High | Retry/park |
| `WDR1_EXECUTED_LATE` | Critical | Settle+exception |
| `WDR1_SIGNING_KEY_INVALID` | Critical | Block send |
| `WDR1_TRAVEL_RULE_PAYLOAD_MISMATCH` | Critical/High | Block send |
| `WDR1_STUCK_PAYOUT_SLA_EXCEEDED` | High/Critical | Escalate |
| `WDR1_CLIENT_STATUS_TRUTH_REQUIRED` | High/Critical | Correct status |
