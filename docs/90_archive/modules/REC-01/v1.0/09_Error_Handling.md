# REC-01 Reconciliation / Finance Reporting
## 09 Error Handling

## 1. Principles

1. REC errors do not mutate source records.
2. Missing source data produces partial/missing status and break.
3. Critical run failure escalates.
4. Reports generated from incomplete data must show warnings.
5. Sensitive exports fail closed without approval.

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `REC1_SOURCE_MUTATION_PROHIBITED` | Critical | Reject/alert |
| `REC1_LEDGER_POST_PROHIBITED` | Critical | Reject/alert |
| `REC1_RUN_SCOPE_INVALID` | High | Reject |
| `REC1_SOURCE_UNAVAILABLE` | High/Critical | Partial/break |
| `REC1_SOURCE_HASH_MISMATCH` | Critical/High | Break/escalate |
| `REC1_RUN_ALREADY_FINAL` | Medium | Create rerun |
| `REC1_CRITICAL_BREAK_AUTO_CLEAR_PROHIBITED` | Critical | Reject |
| `REC1_BREAK_CLOSURE_EVIDENCE_REQUIRED` | High | Reject |
| `REC1_SOD_VIOLATION` | High/Critical | Reject |
| `REC1_DAILY_CLOSE_BLOCKED` | Critical/High | Block |
| `REC1_SAFEGUARDING_DEFICIT` | Critical | Escalate |
| `REC1_VALUE_CONSERVATION_FAILED` | Critical/High | Break |
| `REC1_AUDIT_EVENT_MISSING` | Critical/High | Break |
| `REC1_EXPORT_APPROVAL_REQUIRED` | High | Hold |
| `REC1_REPORT_OPEN_BREAK_WARNING` | Medium/High | Label warning |
