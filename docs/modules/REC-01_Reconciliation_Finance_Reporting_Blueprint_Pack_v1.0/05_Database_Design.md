# REC-01 Reconciliation / Finance Reporting
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
rec1
```

Runtime DB role:

```txt
role_rec1_runtime
```

Rules:

1. REC-01 has read-only access to source module views/extracts.
2. REC-01 writes only reconciliation/reporting/break records.
3. No ledger journal table owned by REC.
4. No balance source-of-truth table owned by REC.
5. Reconciliation run records are immutable after finalisation.

---

## 2. Tables

### 2.1 `rec1.reconciliation_run`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| run_id | varchar | Unique |
| run_type | varchar | ledger/deposit/withdrawal/trade/fee/safeguarding/audit/e2e/full |
| run_scope | jsonb | Scope |
| period_start_utc | timestamptz | Start |
| period_end_utc | timestamptz | End |
| status | varchar | created/running/completed/failed/finalised |
| source_versions | jsonb | Module versions |
| rule_set_version | varchar | Rules |
| input_hash | varchar | Input dataset hash |
| output_hash | varchar | Result hash |
| break_count | int | Count |
| critical_break_count | int | Count |
| created_by | varchar | Actor |
| sec_audit_ref | varchar | Audit |

### 2.2 `rec1.source_snapshot`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| snapshot_id | varchar | Unique |
| run_id | varchar | Run |
| source_module | varchar | LED/DEP/WDR/TRD/etc |
| source_period_start_utc | timestamptz | Start |
| source_period_end_utc | timestamptz | End |
| extract_time_utc | timestamptz | Extract |
| source_record_count | int | Count |
| source_hash | varchar | Hash |
| completeness_status | varchar | complete/partial/missing/unavailable |
| sec_audit_ref | varchar | Audit |

### 2.3 `rec1.reconciliation_break`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| break_id | varchar | Unique |
| run_id | varchar | Run |
| correlation_id | varchar | E2E |
| break_type | varchar | ledger/deposit/withdrawal/trade/fee/safeguarding/audit/e2e/external |
| severity | varchar | low/medium/high/critical |
| status | varchar | open/assigned/investigating/remediation_pending/closure_requested/closed/escalated |
| affected_module | varchar | Source module |
| affected_ref | varchar | Source ref |
| root_cause | varchar | Root cause |
| owner | varchar | Owner |
| sla_due_utc | timestamptz | SLA |
| closure_status | varchar | open/approved/rejected |
| sec_audit_ref | varchar | Audit |

### 2.4 `rec1.break_evidence`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| evidence_id | varchar | Unique |
| break_id | varchar | Break |
| evidence_type | varchar | note/file/source_ref/report/remediation_ref |
| evidence_ref | varchar | Ref |
| evidence_hash | varchar | Hash |
| added_by | varchar | Actor |
| sec_audit_ref | varchar | Audit |

### 2.5 `rec1.break_closure`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| closure_id | varchar | Unique |
| break_id | varchar | Break |
| requested_by | varchar | Requester |
| approved_by | varchar | Approver |
| closure_reason | varchar | Reason |
| remediation_ref | varchar | Source module remediation |
| validation_run_id | varchar | Rerun/validation |
| sod_status | varchar | pass/fail |
| closure_hash | varchar | Hash |
| sec_audit_ref | varchar | Audit |

### 2.6 `rec1.safeguarding_report`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| safeguarding_report_id | varchar | Unique |
| run_id | varchar | Run |
| asset_or_currency | varchar | Asset |
| client_liability_total | numeric | Liability |
| safeguarded_asset_total | numeric | External asset |
| encumbered_amount | numeric | Holds/reserves |
| free_backing_amount | numeric | Free |
| surplus_deficit_amount | numeric | Surplus/deficit |
| status | varchar | pass/fail/warning |
| sec_audit_ref | varchar | Audit |

### 2.7 `rec1.value_conservation_report`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| conservation_report_id | varchar | Unique |
| run_id | varchar | Run |
| correlation_id | varchar | E2E |
| flow_type | varchar | deposit/trade/withdrawal/fee/reversal |
| value_in | numeric | In |
| value_out | numeric | Out |
| fee_amount | numeric | Fee |
| residual_amount | numeric | Residual |
| aix_net_position | numeric | AIX net |
| status | varchar | pass/fail/warning |
| sec_audit_ref | varchar | Audit |

### 2.8 `rec1.audit_completeness_report`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| audit_completeness_id | varchar | Unique |
| run_id | varchar | Run |
| correlation_id | varchar | E2E |
| expected_event_count | int | Expected |
| emitted_event_count | int | Emitted |
| missing_event_count | int | Missing |
| sequence_status | varchar | pass/fail/warning |
| sec_audit_ref | varchar | Audit |

### 2.9 `rec1.finance_report`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| report_id | varchar | Unique |
| report_type | varchar | daily_movement/fee/safeguarding/open_break/management/regulatory |
| run_id | varchar | Run |
| period_start_utc | timestamptz | Start |
| period_end_utc | timestamptz | End |
| status | varchar | draft/final/revoked |
| open_break_warning | boolean | Warning |
| report_hash | varchar | Hash |
| generated_by | varchar | Actor |
| sec_audit_ref | varchar | Audit |

### 2.10 `rec1.evidence_pack`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| evidence_pack_id | varchar | Unique |
| scope_type | varchar | correlation/client/period/regulatory/audit |
| scope_ref | varchar | Scope |
| run_ids | jsonb | Runs |
| export_status | varchar | requested/approved/generated/rejected/revoked |
| masking_policy_ref | varchar | Masking |
| export_hash | varchar | Hash |
| approval_ref | varchar | Maker-checker |
| sec_audit_ref | varchar | Audit |

### 2.11 `rec1.close_signoff`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| close_signoff_id | varchar | Unique |
| close_type | varchar | daily/weekly/monthly |
| close_date | date | Date |
| required_runs | jsonb | Runs |
| blocking_break_count | int | Count |
| status | varchar | open/blocked/signed_off/reopened |
| finance_signoff_ref | varchar | Finance |
| compliance_signoff_ref | varchar | Compliance |
| management_signoff_ref | varchar | Management |
| sec_audit_ref | varchar | Audit |

---

## 3. Indexes

1. `reconciliation_run(run_type, period_start_utc, period_end_utc)`.
2. `source_snapshot(run_id, source_module)`.
3. `reconciliation_break(run_id, severity, status)`.
4. `reconciliation_break(correlation_id, status)`.
5. `break_evidence(break_id)`.
6. `break_closure(break_id, sod_status)`.
7. `safeguarding_report(run_id, asset_or_currency)`.
8. `value_conservation_report(run_id, correlation_id, status)`.
9. `audit_completeness_report(run_id, correlation_id, sequence_status)`.
10. `finance_report(report_type, period_start_utc, period_end_utc)`.
11. `evidence_pack(scope_type, scope_ref, export_status)`.
12. `close_signoff(close_date, close_type, status)`.

## 4. Data Rules

1. Reconciliation run finalised record is immutable.
2. Source snapshot hash cannot be edited.
3. Break record cannot be deleted.
4. Break closure requires evidence.
5. Critical/high closure requires maker-checker.
6. Source data remediation must occur in source module.
7. Safeguarding deficit creates critical break.
8. Value conservation fail creates critical/high break by policy.
9. Missing SEC critical event creates critical/high break.
10. Report must link to run ID and period.
