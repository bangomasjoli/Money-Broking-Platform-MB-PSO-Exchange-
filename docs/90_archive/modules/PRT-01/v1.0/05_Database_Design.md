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

## 3. Data Rules

1. Display cache is not source of truth.
2. Cache expiry must be short for financial statuses.
3. Sensitive action must create portal_action_request.
4. Exports require export_request.
5. Message templates require approval before active.
6. Exchange UI configuration prohibited.
