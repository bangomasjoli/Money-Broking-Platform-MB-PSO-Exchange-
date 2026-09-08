# PRT-01 Client / Staff / Admin Portal Workflows
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
prt1
```

Rules:
1. PRT-01 stores portal preferences, UI workflow state, template references and audit references only.
2. PRT-01 must not store ledger, balances or financial source-of-truth records.
3. Sensitive cache must be avoided or short-lived.
4. Portal records must link to source module refs.

## 2. Tables

### 2.1 `prt1.portal_session_context`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| context_id | varchar | Unique |
| user_id | varchar | User |
| role_snapshot_hash | varchar | IAM snapshot |
| session_id | varchar | IAM session |
| last_step_up_at_utc | timestamptz | MFA |
| active_incident_context_hash | varchar | INC context |
| invalidation_epoch | varchar | Current epoch |
| data_scope_hash | varchar | Object entitlement scope |
| sec_audit_ref | varchar | Audit |

### 2.2 `prt1.portal_action_request`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| portal_action_id | varchar | Unique |
| user_id | varchar | User |
| action_type | varchar | deposit/withdrawal/trade/export/approval/admin |
| source_module | varchar | Owning module |
| source_request_ref | varchar | Source ref |
| correlation_id | varchar | FND/E2E correlation |
| end_user_entitlement_hash | varchar | Scoped entitlement |
| source_status_version | varchar | Source version/epoch |
| idempotency_key | varchar | Idempotency |
| status | varchar | created/submitted/accepted/rejected/failed |
| sec_audit_ref | varchar | Audit |

### 2.3 `prt1.display_status_cache`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| cache_id | varchar | Unique |
| source_module | varchar | Source |
| source_ref | varchar | Ref |
| status_code | varchar | Display code |
| source_timestamp_utc | timestamptz | Source time |
| cache_expiry_utc | timestamptz | Expiry |
| status_hash | varchar | Hash |
| source_status_version | varchar | Monotonic source status version |
| overlay_epoch | varchar | Freeze/revocation/restatement overlay epoch |
| non_regression_status | varchar | pass/fail/unknown |
| sec_audit_ref | varchar | Audit |

### 2.4 `prt1.message_template`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| template_id | varchar | Unique |
| template_type | varchar | aml_hold/incident/freeze/action_status/notification |
| audience | varchar | client/staff/admin/management |
| version | varchar | Version |
| content_hash | varchar | Hash |
| approval_ref | varchar | Approval |
| client_safe_reason_code | varchar | Safe code |
| internal_reason_ref_allowed | boolean | Must be false for client templates |
| status | varchar | draft/approved/retired |
| sec_audit_ref | varchar | Audit |

### 2.5 `prt1.export_request`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| export_request_id | varchar | Unique |
| requested_by | varchar | User |
| export_type | varchar | report/evidence/document |
| source_module | varchar | REC/SEC/INC/etc |
| masking_policy_ref | varchar | Policy |
| recipient_ref | varchar | Recipient |
| purpose | varchar | Purpose |
| lawful_or_regulatory_basis | varchar | Basis |
| disclosure_log_ref | varchar | Disclosure log |
| watermark_policy_ref | varchar | Watermark |
| generation_recheck_status | varchar | pass/fail |
| download_recheck_status | varchar | pass/fail |
| approval_ref | varchar | Approval |
| status | varchar | requested/approved/generated/rejected/downloaded |
| sec_audit_ref | varchar | Audit |

### 2.6 `prt1.user_preference`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| user_id | varchar | User |
| preference_key | varchar | Key |
| preference_value | varchar | Value |
| updated_at_utc | timestamptz | Time |


### 2.7 `prt1.object_entitlement_check`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| entitlement_check_id | varchar | Unique |
| user_id | varchar | User |
| resource_type | varchar | Resource |
| resource_ref | varchar | Object |
| entitlement_scope_hash | varchar | Scope |
| decision | varchar | allow/deny |
| source_module | varchar | Source |
| correlation_id | varchar | Correlation |
| sec_audit_ref | varchar | Audit |

### 2.8 `prt1.invalidation_epoch`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| invalidation_id | varchar | Unique |
| source_module | varchar | INC/AML/WLT/REC/DEP/WDR/TRD/LED |
| resource_type | varchar | Scope |
| resource_ref | varchar | Ref |
| epoch_value | varchar | Epoch |
| reason_type | varchar | freeze/revocation/reversal/restatement/return/quarantine |
| received_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.9 `prt1.download_token`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| token_id | varchar | Unique |
| export_request_id | varchar | Export |
| recipient_ref | varchar | Recipient |
| expires_at_utc | timestamptz | Expiry |
| max_use_count | int | Default 1 |
| use_count | int | Count |
| token_status | varchar | active/used/expired/revoked |
| sec_audit_ref | varchar | Audit |

### 2.10 `prt1.upload_intake`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| upload_id | varchar | Unique |
| user_id | varchar | User |
| source_module | varchar | Target |
| file_name_hash | varchar | Name hash |
| file_type | varchar | Type |
| file_size_bytes | bigint | Size |
| malware_scan_status | varchar | pass/fail/pending |
| sanitization_status | varchar | pass/fail/not_required |
| upload_status | varchar | quarantined/accepted/rejected |
| sec_audit_ref | varchar | Audit |

### 2.11 `prt1.notification_outbox`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| notification_id | varchar | Unique |
| source_module | varchar | Source |
| source_ref | varchar | Ref |
| source_status_version | varchar | Version |
| notification_version | varchar | Version |
| supersedes_notification_id | varchar | Superseded |
| reconcile_before_send_status | varchar | pass/suppressed/superseded |
| sent_status | varchar | pending/sent/suppressed |
| sec_audit_ref | varchar | Audit |


## 3. Data Rules

1. Display cache is not source of truth.
2. Cache expiry must be short for financial statuses.
3. Sensitive action must create portal_action_request.
4. Exports require export_request.
5. Message templates require approval before active.
6. Exchange UI configuration prohibited.
7. Portal display status must carry source status version.
8. Object read requires entitlement check.
9. Invalidation epoch must be tracked.
10. Export download uses recipient-bound single-use token.
11. Uploads remain quarantined until scan/sanitization passes.
12. Notification must reconcile before send.
13. Portal action request must carry correlation ID.
14. Display cache cannot render more favourable status than source truth.
