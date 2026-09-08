# INC-01 Incident / Freeze / Recovery
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
inc1
```

Runtime DB role:

```txt
role_inc1_runtime
```

Rules:

1. INC-01 owns incident records only.
2. No ledger or balance tables.
3. No source module data mutation.
4. Evidence is hash-linked.
5. Freeze and resume actions are audited.

---

## 2. Tables

### 2.1 `inc1.incident`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| incident_id | varchar | Unique |
| incident_type | varchar | security/aml/ledger/safeguarding/vendor/deposit/payout/trade/audit/regulatory/ops |
| severity | varchar | low/medium/high/critical |
| status | varchar | open/triage/frozen/investigating/recovering/resume_pending/resolved/closed |
| incident_owner | varchar | Owner |
| incident_commander | varchar | Commander |
| trigger_source | varchar | Source |
| trigger_payload_hash | varchar | Hash |
| detected_at_utc | timestamptz | Detection |
| closed_at_utc | timestamptz | Closure |
| sec_audit_ref | varchar | Audit |

### 2.2 `inc1.incident_scope`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| scope_id | varchar | Unique |
| incident_id | varchar | Incident |
| scope_type | varchar | platform/module/client/asset/rail/provider/correlation/user |
| scope_ref | varchar | Reference |
| impact_status | varchar | suspected/confirmed/cleared |
| sec_audit_ref | varchar | Audit |

### 2.3 `inc1.freeze_order`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| freeze_order_id | varchar | Unique |
| incident_id | varchar | Incident |
| freeze_scope | jsonb | Scope |
| freeze_reason | varchar | Reason |
| status | varchar | requested/propagating/active/partial/failed/release_pending/released |
| requested_by | varchar | Actor |
| approval_ref | varchar | Approval |
| sec_audit_ref | varchar | Audit |

### 2.4 `inc1.freeze_acknowledgement`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| acknowledgement_id | varchar | Unique |
| freeze_order_id | varchar | Freeze |
| module_code | varchar | Module |
| acknowledgement_status | varchar | acknowledged/failed/timeout/not_applicable |
| effective_at_utc | timestamptz | Time |
| evidence_ref | varchar | Evidence |
| sec_audit_ref | varchar | Audit |

### 2.5 `inc1.inflight_item`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| inflight_item_id | varchar | Unique |
| incident_id | varchar | Incident |
| correlation_id | varchar | E2E |
| source_module | varchar | DEP/WDR/TRD/LED |
| item_ref | varchar | Source ref |
| flow_type | varchar | deposit/withdrawal/trade/ledger |
| stage | varchar | before_hold/hold_reserved/external_sent/external_final/ledger_settled/reversal_pending |
| disposition | varchar | stop/cancel/pause/quarantine/monitor/recover/exception |
| owner_module | varchar | Owning module |
| sec_audit_ref | varchar | Audit |

### 2.6 `inc1.evidence_item`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| evidence_id | varchar | Unique |
| incident_id | varchar | Incident |
| evidence_type | varchar | audit/source/provider/screenshot/log/communication/remediation/recovery |
| evidence_ref | varchar | Ref |
| evidence_hash | varchar | Hash |
| chain_of_custody_status | varchar | captured/restricted/exported |
| sec_audit_ref | varchar | Audit |

### 2.7 `inc1.notification_obligation`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| obligation_id | varchar | Unique |
| incident_id | varchar | Incident |
| recipient_type | varchar | management/regulator/client/vendor/auditor |
| due_at_utc | timestamptz | Due |
| status | varchar | not_required/draft/review/approved/submitted/acknowledged/late |
| submission_hash | varchar | Hash |
| acknowledgement_ref | varchar | Ack |
| sec_audit_ref | varchar | Audit |

### 2.8 `inc1.recovery_plan`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| recovery_plan_id | varchar | Unique |
| incident_id | varchar | Incident |
| root_cause_summary | text | RCA |
| remediation_summary | text | Remediation |
| validation_plan | jsonb | Tests |
| residual_risk | text | Risk |
| status | varchar | draft/approved/executing/validated/rejected |
| approval_ref | varchar | Approval |
| sec_audit_ref | varchar | Audit |

### 2.9 `inc1.resume_gate`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| resume_gate_id | varchar | Unique |
| incident_id | varchar | Incident |
| freeze_order_id | varchar | Freeze |
| source_safe_state_status | varchar | pass/fail |
| rec_validation_status | varchar | pass/fail/not_required |
| sec_evidence_status | varchar | pass/fail |
| signoff_status | varchar | pass/fail |
| resume_status | varchar | blocked/approved/released |
| sec_audit_ref | varchar | Audit |

### 2.10 `inc1.post_incident_review`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| pir_id | varchar | Unique |
| incident_id | varchar | Incident |
| timeline_hash | varchar | Timeline |
| root_cause | text | Root cause |
| impact_summary | text | Impact |
| lessons_learned | text | Lessons |
| management_approval_ref | varchar | Approval |
| sec_audit_ref | varchar | Audit |

### 2.11 `inc1.remediation_action`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| action_id | varchar | Unique |
| incident_id | varchar | Incident |
| action_owner | varchar | Owner |
| action_description | text | Action |
| due_at_utc | timestamptz | Due |
| status | varchar | open/in_progress/completed/overdue/accepted |
| evidence_ref | varchar | Evidence |
| sec_audit_ref | varchar | Audit |

---

## 3. Indexes

1. `incident(severity, status)`.
2. `incident_scope(incident_id, scope_type, scope_ref)`.
3. `freeze_order(incident_id, status)`.
4. `freeze_acknowledgement(freeze_order_id, module_code)`.
5. `inflight_item(incident_id, correlation_id, stage)`.
6. `evidence_item(incident_id, evidence_type)`.
7. `notification_obligation(incident_id, due_at_utc, status)`.
8. `recovery_plan(incident_id, status)`.
9. `resume_gate(incident_id, resume_status)`.
10. `post_incident_review(incident_id)`.
11. `remediation_action(incident_id, status, due_at_utc)`.

## 4. Data Rules

1. Incident record cannot be deleted.
2. Freeze release requires resume gate.
3. In-flight items require disposition.
4. High/critical closure requires evidence pack.
5. Evidence hash cannot be changed.
6. Notification obligation cannot be hidden once required.
7. REC validation required where money affected.
8. Closure requires required sign-offs.
9. No ledger/balance/source mutation.
10. Post-incident review required for high/critical incidents.
