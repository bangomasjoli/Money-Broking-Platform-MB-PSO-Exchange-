# INC-01 Incident / Freeze / Recovery
## 04 API Specification

## 1. API Principles

All INC-01 APIs use FND request/correlation ID, IAM permission checks, maker-checker where required and SEC audit events.

INC-01 APIs do not post ledger, edit balances or mutate source-of-truth financial records.

---

## 2. Incident APIs

### 2.1 POST `/inc1/incidents`

Create incident.

### 2.2 GET `/inc1/incidents/{incident_id}`

Read incident.

### 2.3 POST `/inc1/incidents/{incident_id}/classify`

Classify severity/category.

### 2.4 POST `/inc1/incidents/{incident_id}/assign-command`

Assign incident roles.

### 2.5 POST `/inc1/incidents/{incident_id}/close`

Close incident.

---

## 3. Freeze APIs

### 3.1 POST `/inc1/incidents/{incident_id}/freeze-atomic`

Create ordered atomic verified freeze order.

### 3.2 POST `/internal/inc1/freeze-acknowledgements`

Receive module freeze acknowledgement.

### 3.3 POST `/inc1/incidents/{incident_id}/resume-gate`

Run resume gate.

### 3.4 POST `/inc1/incidents/{incident_id}/release-freeze`

Release freeze after resume gate.

---

## 4. Quiescence / Recovery APIs

### 4.1 POST `/inc1/incidents/{incident_id}/quiesce-money-flows`

Classify and disposition in-flight items.

### 4.2 POST `/inc1/incidents/{incident_id}/recovery-plan`

Create recovery plan.

### 4.3 POST `/inc1/incidents/{incident_id}/evidence`

Attach evidence.

### 4.4 POST `/inc1/incidents/{incident_id}/notification-obligation`

Create notification obligation.

### 4.5 POST `/inc1/incidents/{incident_id}/post-incident-review`

Create post-incident review.

---

## 5. Degraded / Recovery / Governance APIs

### 5.1 POST `/inc1/incidents/{incident_id}/auto-freeze`

Trigger auto-freeze for critical condition.

### 5.2 POST `/inc1/incidents/{incident_id}/verify-freeze-effectiveness`

Verify module freeze effectiveness.

### 5.3 POST `/inc1/incidents/{incident_id}/activate-degraded-mode`

Activate degraded-mode operation.

### 5.4 POST `/inc1/incidents/{incident_id}/verify-money-recovery`

Verify terminal corrected money recovery.

### 5.5 POST `/inc1/incidents/{incident_id}/freeze-extension`

Request freeze extension / re-justification.

### 5.6 POST `/inc1/incidents/{incident_id}/communications-approval`

Route incident communication approval.

---

## 6. Error Codes

| Code | Meaning |
|---|---|
| `INC1_SOURCE_MUTATION_PROHIBITED` | INC cannot mutate source records |
| `INC1_LEDGER_POST_PROHIBITED` | INC cannot post ledger |
| `INC1_BALANCE_EDIT_PROHIBITED` | INC cannot edit balances |
| `INC1_FREEZE_SCOPE_REQUIRED` | Freeze scope required |
| `INC1_FREEZE_ACK_MISSING` | Module freeze acknowledgement missing |
| `INC1_RESUME_GATE_REQUIRED` | Resume gate required |
| `INC1_INFLIGHT_DISPOSITION_REQUIRED` | In-flight disposition required |
| `INC1_POINT_OF_NO_RETURN` | Action is irreversible |
| `INC1_EVIDENCE_REQUIRED` | Evidence required |
| `INC1_NOTIFICATION_OBLIGATION_REQUIRED` | Notification required |
| `INC1_REC_VALIDATION_REQUIRED` | REC validation required |
| `INC1_SIGNOFF_REQUIRED` | Required sign-off missing |
| `INC1_CLOSURE_BLOCKED` | Incident closure blocked |
| `INC1_STATUS_TRUTH_REQUIRED` | Client/staff status truth required |
| `INC1_AUDIT_REQUIRED` | SEC audit required |
| `INC1_FREEZE_EFFECTIVENESS_REQUIRED` | Freeze effectiveness proof required |
| `INC1_FREEZE_PARTIAL_FAIL_CLOSED` | Partial freeze must fail closed/escalate |
| `INC1_FREEZE_ACK_GAP_DENY` | Money movement denied during ack gap |
| `INC1_FREEZE_AUTHORITY_REQUIRED` | Maker-checker/SoD for freeze required |
| `INC1_RESUME_AUTHORITY_SEPARATION_REQUIRED` | Resume authority separated from resolved declaration |
| `INC1_INCIDENT_SUPPRESSION_DETECTED` | Qualifying alert not raised |
| `INC1_SEVERITY_DOWNGRADE_APPROVAL_REQUIRED` | Downgrade requires approval |
| `INC1_INC_RECORD_ANCHOR_REQUIRED` | INC hash-chain/external anchor required |
| `INC1_DEGRADED_MODE_REQUIRED` | Degraded mode required |
| `INC1_OUT_OF_BAND_FREEZE_REQUIRED` | Out-of-band freeze required |
| `INC1_INDEPENDENT_EVIDENCE_REQUIRED` | Independent evidence required |
| `INC1_TERMINAL_CORRECTED_STATE_REQUIRED` | In-flight item not terminal corrected |
| `INC1_VALUE_POSITION_NOT_RESTORED` | Incident value position unresolved |
| `INC1_SAFEGUARDING_NOT_PROVEN` | Safeguarding not proven intact |
| `INC1_MINIMUM_SCOPE_REQUIRED` | Minimum scope justification required |
| `INC1_FREEZE_REJUSTIFICATION_REQUIRED` | Freeze extension/rejustification required |
| `INC1_CLIENT_ACCESS_DENIAL_TRACKING_REQUIRED` | Client access denial tracking required |
| `INC1_OVERLAPPING_FREEZE_ACTIVE` | Other active freeze prevents release |
| `INC1_AUTO_FREEZE_REQUIRED` | Auto-freeze condition requires containment |
| `INC1_E2E_COMPENSATION_REQUIRED` | E2E compensation binding required |
| `INC1_NOTIFICATION_CLOCK_REQUIRED` | Detection-time notification clock required |
| `INC1_COMMS_APPROVAL_REQUIRED` | Compliance/Security communication approval required |
