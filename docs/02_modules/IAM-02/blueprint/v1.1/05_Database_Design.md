# IAM-02 RBAC / Permission Guard / SoD  
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
iam2
```

Runtime DB role:

```txt
role_iam2_runtime
```

Rules:

1. IAM-02 runtime role owns/accesses `iam2` schema only.
2. Other modules call IAM-02 service interfaces.
3. Direct cross-schema permission writes are prohibited.
4. Migration role is separate from runtime role.
5. Permission evidence is Restricted / Security Critical.

---

## 2. Tables

### 2.1 `iam2.role`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| role_id | varchar | Unique |
| role_code | varchar | Canonical role code |
| role_name | varchar | Display name |
| role_type | varchar | client/staff/admin/system/service |
| sensitivity | varchar | normal/sensitive/privileged |
| status | varchar | active/inactive/retired |
| owner_team | varchar | Role owner |
| description | text | Description |
| created_at_utc | timestamptz | Created |
| updated_at_utc | timestamptz | Updated |

### 2.2 `iam2.permission`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| permission_id | varchar | Unique |
| permission_code | varchar | e.g. withdrawal.approve |
| resource | varchar | Resource |
| action | varchar | Action |
| sensitivity | varchar | normal/sensitive/privileged/financial_critical |
| licence_locked | boolean | Cached/index flag; source is config-sealed list until CFG-01, then CFG-01 |
| prohibited | boolean | True if never grantable; cannot be overridden |
| requires_step_up | boolean | IAM-01 step-up required |
| requires_approval | boolean | Maker-checker required |
| status | varchar | active/inactive/retired |
| owner_module | varchar | Owning module |

### 2.3 `iam2.role_permission`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| role_id | varchar | Role |
| permission_id | varchar | Permission |
| status | varchar | active/revoked |
| assigned_by | varchar | Maker |
| approval_id | varchar | Approval reference |
| effective_from_utc | timestamptz | Start |
| revoked_at_utc | timestamptz | Revoked |

Constraints:

1. Licence-locked/prohibited permissions cannot be active.
2. User overrides, temporary grants, delegation, or break-glass cannot satisfy licence-locked/prohibited permissions.
2. Assignment requires approval where sensitive.

### 2.4 `iam2.user_role`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | varchar | User |
| role_id | varchar | Role |
| client_id | varchar | Scope where applicable |
| status | varchar | active/revoked/expired |
| assigned_by | varchar | Maker |
| approval_id | varchar | Approval |
| effective_from_utc | timestamptz | Start |
| expires_at_utc | timestamptz | Optional expiry |
| revoked_at_utc | timestamptz | Revoked |

### 2.5 `iam2.user_permission_override`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | varchar | User |
| permission_id | varchar | Permission |
| effect | varchar | allow/deny |
| scope | jsonb | Scope constraints |
| status | varchar | active/revoked/expired |
| approval_id | varchar | Approval |
| expires_at_utc | timestamptz | Mandatory for allow overrides where sensitive |

Rules:

1. Deny override wins over allow.
2. Sensitive allow override requires expiry and approval.
3. Licence-locked/prohibited permission cannot be allowed.
4. Licence-lock/prohibited deny has precedence over all user overrides.

### 2.6 `iam2.approval_policy`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| policy_id | varchar | Unique |
| action | varchar | Protected action |
| resource | varchar | Resource |
| threshold_type | varchar | value/count/risk/action |
| required_approver_roles | jsonb | Roles |
| required_approval_count | int | Count |
| requires_step_up | boolean | Step-up |
| expiry_minutes | int | Approval expiry |
| status | varchar | active/inactive |

### 2.7 `iam2.approval_request`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| approval_id | varchar | Unique |
| policy_id | varchar | Policy |
| maker_user_id | varchar | Maker |
| action | varchar | Action |
| resource | varchar | Resource |
| entity_id | varchar | Entity |
| client_id | varchar | Scope |
| payload_ref | varchar | Payload reference |
| payload_hash | varchar | Immutable canonical payload hash |
| payload_canonicalisation_version | varchar | Hash/canonicalisation version |
| status | varchar | pending/approved/rejected/expired/cancelled/blocked |
| required_count | int | Required approvals |
| approved_count | int | Count |
| expires_at_utc | timestamptz | Expiry |
| created_at_utc | timestamptz | Created |
| completed_at_utc | timestamptz | Completed |
| correlation_id | varchar | Trace |

### 2.8 `iam2.approval_decision`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| decision_id | varchar | Unique |
| approval_id | varchar | Approval |
| approver_user_id | varchar | Approver |
| decision | varchar | approve/reject |
| decision_reason | text | Safe reason |
| step_up_assertion_ref | varchar | IAM-01 assertion ref |
| sod_check_id | varchar | SoD check |
| decided_at_utc | timestamptz | Time |
| correlation_id | varchar | Trace |

Constraints:

1. `approver_user_id != maker_user_id`.
2. Service account cannot satisfy human checker approval.
3. SoD conflict blocks decision.
4. Unique on `(approval_id, approver_user_id)`.
5. Dual approvers must be distinct and mutually non-conflicting under SoD.
6. Approved count increment must be atomic.

### 2.9 `iam2.sod_rule`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| sod_rule_id | varchar | Unique |
| conflict_type | varchar | role_role/permission_permission/action_action |
| left_ref | varchar | Role/permission/action |
| right_ref | varchar | Role/permission/action |
| severity | varchar | critical/high/medium |
| enforcement | varchar | block/risk_acceptance; Critical must be block |
| status | varchar | active/inactive |
| owner | varchar | Owner |
| matrix_version | int | SoD matrix version |
| rule_hash | varchar | Rule integrity hash |
| risk_acceptance_allowed | boolean | False for Critical |

### 2.10 `iam2.sod_check`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| sod_check_id | varchar | Unique |
| user_id | varchar | User |
| proposed_ref | varchar | Proposed role/permission/action |
| result | varchar | pass/block/risk_acceptance_required |
| matched_rules | jsonb | Rule refs |
| checked_at_utc | timestamptz | Time |
| correlation_id | varchar | Trace |

### 2.11 `iam2.delegation`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| delegation_id | varchar | Unique |
| delegator_user_id | varchar | Delegator |
| delegate_user_id | varchar | Delegate |
| permission_id | varchar | Permission/scope |
| scope | jsonb | Scope |
| status | varchar | active/revoked/expired |
| approval_id | varchar | Approval |
| effective_from_utc | timestamptz | Start |
| expires_at_utc | timestamptz | Mandatory |
| revoked_at_utc | timestamptz | Revoked |

### 2.12 `iam2.temporary_permission`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| grant_id | varchar | Unique |
| user_id | varchar | User |
| permission_id | varchar | Permission |
| scope | jsonb | Scope |
| status | varchar | active/revoked/expired |
| approval_id | varchar | Approval |
| reason | text | Safe reason |
| effective_from_utc | timestamptz | Start |
| expires_at_utc | timestamptz | Mandatory |
| revoked_at_utc | timestamptz | Revoked |

### 2.13 `iam2.break_glass_request`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| break_glass_id | varchar | Unique |
| requester_user_id | varchar | Requester |
| recipient_user_id | varchar | Recipient |
| reason | text | Justification |
| requested_permissions | jsonb | Requested scope, checked against whitelist |
| max_duration_minutes | int | Applied duration ceiling |
| whitelist_version | varchar | Break-glass whitelist version |
| status | varchar | requested/approved/rejected/active/expired/revoked/review_closed |
| approval_id | varchar | Approval |
| effective_from_utc | timestamptz | Start |
| expires_at_utc | timestamptz | Mandatory |
| post_review_status | varchar | pending/closed/escalated |

### 2.14 `iam2.permission_decision_log`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| decision_id | varchar | Unique |
| actor_user_id | varchar | Actor |
| action | varchar | Action |
| resource | varchar | Resource |
| entity_id | varchar | Entity |
| client_id | varchar | Scope |
| decision | varchar | allow/deny/approval_required/step_up_required |
| reason_code | varchar | Reason |
| permission_sources | jsonb | Roles/grants |
| sod_check_id | varchar | SoD check |
| approval_id | varchar | Approval |
| step_up_assertion_ref | varchar | Step-up |
| decision_token_hash | varchar | Decision token reference/hash |
| payload_hash | varchar | Bound payload hash |
| cache_version | int | Bound permission cache version |
| session_id | varchar | IAM-01 session binding |
| auth_level | varchar | IAM-01 auth level binding |
| occurred_at_utc | timestamptz | Time |
| correlation_id | varchar | Trace |

### 2.15 `iam2.protected_action_registry`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| protected_action_id | varchar | Unique |
| owner_module | varchar | Module |
| action | varchar | Canonical action |
| resource | varchar | Resource |
| permission_id | varchar | Required permission |
| approval_policy_id | varchar | Required policy if any |
| requires_step_up | boolean | Step-up |
| licence_locked | boolean | Locked |
| sensitivity | varchar | normal/sensitive/financial_critical |
| test_refs | jsonb | Required tests |
| status | varchar | active/inactive |
| registry_version | int | Version |

### 2.16 `iam2.permission_decision_token`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| decision_token_id | varchar | Unique |
| token_hash | varchar | Hash/reference only |
| actor_user_id | varchar | Actor |
| session_id | varchar | IAM-01 session |
| auth_level | varchar | Auth level |
| action | varchar | Action |
| resource | varchar | Resource |
| entity_id | varchar | Entity |
| client_id | varchar | Scope |
| payload_hash | varchar | Bound payload hash |
| approval_id | varchar | Approval |
| step_up_assertion_ref | varchar | Step-up |
| cache_version | int | Subject cache version at issue |
| status | varchar | active/consumed/expired/revoked |
| issued_at_utc | timestamptz | Issued |
| expires_at_utc | timestamptz | Expiry |

### 2.17 `iam2.sod_risk_acceptance`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| risk_acceptance_id | varchar | Unique |
| sod_rule_id | varchar | SoD rule |
| user_id | varchar | Affected user |
| conflict_ref | varchar | Conflict reference |
| severity | varchar | high/medium only |
| status | varchar | pending/approved/expired/revoked |
| approval_id | varchar | Compliance + Management approval |
| expires_at_utc | timestamptz | Mandatory |
| reattestation_due_utc | timestamptz | Re-attestation |
| rationale | text | Safe rationale |

### 2.18 `iam2.break_glass_permission_whitelist`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| whitelist_id | varchar | Unique |
| permission_id | varchar | Eligible permission |
| emergency_category | varchar | Category |
| max_duration_minutes | int | Maximum |
| status | varchar | active/inactive |
| approved_ref | varchar | Approval evidence |

### 2.19 `iam2.permission_cache_version`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| subject_id | varchar | User/service |
| cache_version | int | Version |
| invalidated_at_utc | timestamptz | Last invalidated |
| reason | varchar | Reason |

---

## 3. Indexes

1. `role(role_code, status)`.
2. `permission(permission_code, status)`.
3. `role_permission(role_id, permission_id, status)`.
4. `user_role(user_id, status)`.
5. `approval_request(maker_user_id, status)`.
6. `approval_decision(approval_id, approver_user_id)`.
7. `sod_rule(left_ref, right_ref, status)`.
8. `delegation(delegate_user_id, status)`.
9. `temporary_permission(user_id, status, expires_at_utc)`.
10. `break_glass_request(recipient_user_id, status)`.
11. `permission_decision_log(actor_user_id, occurred_at_utc)`.
12. `protected_action_registry(action, status)`.
13. `permission_decision_token(token_hash, status)`.
14. `sod_risk_acceptance(user_id, status, expires_at_utc)`.
15. `break_glass_permission_whitelist(permission_id, status)`.
16. `permission_cache_version(subject_id)`.

---

## 4. Data Rules

1. Approval payload uses `payload_ref`, not full sensitive payload.
2. Permission decision logs are restricted.
3. Break-glass reason must be safe and not include secrets.
4. Sensitive read of permissions/evidence is audited.
5. Expired temporary permissions and delegations must not evaluate as active.
6. Licence-locked/prohibited permissions cannot become active.
7. Approval decision requires immutable audit event.
8. Approval execution requires payload hash verification.
9. Decision token must be short-lived and positive-version checked.
10. Critical SoD conflicts cannot be risk accepted.
11. Re-delegation is prohibited.
12. Local licence_locked flag is not source of truth.
