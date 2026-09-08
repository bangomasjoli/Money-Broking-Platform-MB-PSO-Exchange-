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
| `REC1_POPULATION_COVERAGE_REQUIRED` | Critical/High | Block full report |
| `REC1_POPULATION_GAP_DETECTED` | Critical/High | Create break |
| `REC1_AS_OF_SEQUENCE_REQUIRED` | High/Critical | Block full recon |
| `REC1_IN_FLIGHT_ITEM_SLA_EXCEEDED` | High/Critical | Convert to break |
| `REC1_EXTERNAL_STATEMENT_AUTH_FAILED` | Critical/High | Reject/break |
| `REC1_STATEMENT_ACCOUNT_UNIVERSE_INCOMPLETE` | Critical/High | Break/block safeguarding |
| `REC1_STATEMENT_STALE` | High/Critical | Warning/break |
| `REC1_STATEMENT_INGESTION_SOD_REQUIRED` | High/Critical | Hold |
| `REC1_HASH_CHAIN_REQUIRED` | Critical/High | Block finalisation |
| `REC1_RUN_SCOPE_NARROWED` | High/Critical | Warning/approval |
| `REC1_INDEPENDENCE_SOD_REQUIRED` | High/Critical | Reject |
| `REC1_CLEAN_RERECON_REQUIRED` | Critical/High | Reject closure |
| `REC1_RECURRENCE_DETECTED` | High/Critical | Escalate |
| `REC1_TOLERANCE_POLICY_REQUIRED` | High | Block tolerance |
| `REC1_ZERO_TOLERANCE_APPLIED` | Critical | Reject/alert |
| `REC1_RULE_CHANGE_APPROVAL_REQUIRED` | High/Critical | Reject |
| `REC1_REPORT_RESTATEMENT_REQUIRED` | High/Critical | Restate |
| `REC1_REGULATORY_OBLIGATION_DUE` | High/Critical | Escalate |
