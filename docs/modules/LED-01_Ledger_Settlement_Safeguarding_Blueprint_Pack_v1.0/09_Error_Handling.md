# LED-01 Ledger / Settlement / Safeguarding
## 09 Error Handling

## 1. Principles

1. Financial uncertainty fails closed.
2. Unknown backing fails closed.
3. Unknown WLT/AML status fails closed.
4. Duplicate source event does not double-post.
5. Reconciliation break does not auto-clear.
6. Safeguarding breach freezes affected scope.
7. Error response does not expose sensitive banking/custody data.

---

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `LED1_UNBALANCED_JOURNAL` | Critical/High | Reject |
| `LED1_DIRECT_BALANCE_EDIT_PROHIBITED` | Critical | Reject/alert |
| `LED1_DUPLICATE_SOURCE_EVENT` | Medium/High | Return prior result |
| `LED1_ACCOUNT_NOT_FOUND` | High | Reject |
| `LED1_PERIOD_CLOSED` | High | Reject |
| `LED1_SCOPE_FROZEN` | Critical/High | Reject |
| `LED1_INSUFFICIENT_AVAILABLE_BALANCE` | High | Reject |
| `LED1_NEGATIVE_AVAILABLE_PROHIBITED` | Critical | Reject/alert |
| `LED1_BACKING_NOT_VERIFIED` | Critical/High | Hold/reject |
| `LED1_SAFEGUARDING_INVARIANT_BREACH` | Critical | Freeze/escalate |
| `LED1_DEPOSIT_SOURCE_NOT_CLEAR` | Critical/High | Quarantine/hold |
| `LED1_RECEIPT_NOT_CONFIRMED` | High | Keep pending |
| `LED1_WLT_DECISION_REQUIRED` | Critical | Reject |
| `LED1_WLT_DECISION_INVALID` | Critical | Reject |
| `LED1_AML_GATE_REQUIRED` | Critical | Reject |
| `LED1_AML_DECISION_STALE` | Critical | Reject |
| `LED1_HOLD_REQUIRED` | Critical | Reject |
| `LED1_HOLD_EXPIRED` | High/Critical | Reject/release |
| `LED1_DVP_SEQUENCE_INVALID` | Critical | Reject |
| `LED1_AIX_EXPOSURE_PROHIBITED` | Critical | Reject/freeze |
| `LED1_FEE_DISCLOSURE_REQUIRED` | High | Reject |
| `LED1_REVERSAL_APPROVAL_REQUIRED` | High | Approval required |
| `LED1_RECONCILIATION_BREAK` | High/Critical | Exception |
