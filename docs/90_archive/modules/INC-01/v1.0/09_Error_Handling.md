# INC-01 Incident / Freeze / Recovery
## 09 Error Handling

## 1. Principles

1. Unknown incident impact is treated conservatively.
2. Missing freeze acknowledgement escalates.
3. Resume fails closed.
4. Closure fails closed.
5. Evidence access/export fails closed.
6. Source mutation is prohibited.

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `INC1_SOURCE_MUTATION_PROHIBITED` | Critical | Reject/alert |
| `INC1_LEDGER_POST_PROHIBITED` | Critical | Reject/alert |
| `INC1_BALANCE_EDIT_PROHIBITED` | Critical | Reject/alert |
| `INC1_FREEZE_SCOPE_REQUIRED` | High/Critical | Reject |
| `INC1_FREEZE_ACK_MISSING` | Critical/High | Escalate |
| `INC1_RESUME_GATE_REQUIRED` | Critical | Block |
| `INC1_INFLIGHT_DISPOSITION_REQUIRED` | Critical/High | Block closure/resume |
| `INC1_POINT_OF_NO_RETURN` | High/Critical | Exception path |
| `INC1_EVIDENCE_REQUIRED` | High/Critical | Block closure/export |
| `INC1_NOTIFICATION_OBLIGATION_REQUIRED` | High/Critical | Track/escalate |
| `INC1_REC_VALIDATION_REQUIRED` | High/Critical | Block resume |
| `INC1_SIGNOFF_REQUIRED` | High/Critical | Block |
| `INC1_CLOSURE_BLOCKED` | High/Critical | Block |
| `INC1_STATUS_TRUTH_REQUIRED` | High/Critical | Correct status |
| `INC1_AUDIT_REQUIRED` | Critical | Fail closed |
