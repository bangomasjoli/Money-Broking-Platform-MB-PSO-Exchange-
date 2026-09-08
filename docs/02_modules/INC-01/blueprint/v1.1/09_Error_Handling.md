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
| `INC1_FREEZE_EFFECTIVENESS_REQUIRED` | Critical | Block contained/resume |
| `INC1_FREEZE_PARTIAL_FAIL_CLOSED` | Critical | Broaden/escalate |
| `INC1_FREEZE_ACK_GAP_DENY` | Critical/High | Deny affected money movement |
| `INC1_FREEZE_AUTHORITY_REQUIRED` | High/Critical | Reject/hold |
| `INC1_RESUME_AUTHORITY_SEPARATION_REQUIRED` | Critical | Reject |
| `INC1_INCIDENT_SUPPRESSION_DETECTED` | Critical/High | Create incident/escalate |
| `INC1_SEVERITY_DOWNGRADE_APPROVAL_REQUIRED` | High/Critical | Block downgrade |
| `INC1_INC_RECORD_ANCHOR_REQUIRED` | Critical/High | Block finalisation |
| `INC1_DEGRADED_MODE_REQUIRED` | Critical | Activate degraded path |
| `INC1_OUT_OF_BAND_FREEZE_REQUIRED` | Critical | Use independent path |
| `INC1_INDEPENDENT_EVIDENCE_REQUIRED` | Critical/High | Capture independent evidence |
| `INC1_TERMINAL_CORRECTED_STATE_REQUIRED` | Critical | Block resume |
| `INC1_VALUE_POSITION_NOT_RESTORED` | Critical | Block resume |
| `INC1_SAFEGUARDING_NOT_PROVEN` | Critical | Block resume |
| `INC1_MINIMUM_SCOPE_REQUIRED` | High | Require justification |
| `INC1_FREEZE_REJUSTIFICATION_REQUIRED` | High/Critical | Escalate/extend approval |
| `INC1_CLIENT_ACCESS_DENIAL_TRACKING_REQUIRED` | High/Critical | Track/notify |
| `INC1_OVERLAPPING_FREEZE_ACTIVE` | High/Critical | Block release |
| `INC1_AUTO_FREEZE_REQUIRED` | Critical | Trigger freeze |
| `INC1_E2E_COMPENSATION_REQUIRED` | High/Critical | Block recovery/resume |
| `INC1_NOTIFICATION_CLOCK_REQUIRED` | High/Critical | Correct deadline |
| `INC1_COMMS_APPROVAL_REQUIRED` | High/Critical | Block communication |
