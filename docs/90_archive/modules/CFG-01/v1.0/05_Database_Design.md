# CFG-01 Feature Flag / Licence Lock  
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
cfg1
```

Runtime DB role:

```txt
role_cfg1_runtime
```

Rules:

1. CFG-01 runtime role owns/accesses CFG-01 schema only.
2. Downstream modules do not directly edit CFG-01 tables.
3. Feature/licence changes are append-versioned.
4. Prohibited feature registry cannot be bypassed by ordinary feature flag.

---

## 2. Tables

### 2.1 `cfg1.licence_profile`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| licence_profile_id | varchar | Unique |
| licence_code | varchar | MB/PSO/Exchange |
| licence_status | varchar | approved/pending/locked/suspended/revoked/retired |
| authority | varchar | LFSA/Board/Internal |
| evidence_ref | varchar | Evidence reference |
| effective_from_utc | timestamptz | Effective |
| effective_to_utc | timestamptz | Optional |
| version | int | Version |
| status | varchar | active/inactive/superseded |
| approved_ref | varchar | IAM-02 approval |
| created_at_utc | timestamptz | Created |

### 2.2 `cfg1.feature`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| feature_code | varchar | Unique |
| feature_name | varchar | Name |
| owner_module | varchar | Module |
| feature_type | varchar | business/security/licence/system/deployment |
| licence_code | varchar | Required licence |
| risk_class | varchar | low/medium/high/critical |
| default_state | varchar | enabled/disabled/locked |
| current_state | varchar | enabled/disabled/locked/prohibited |
| environment_scope | jsonb | Environments |
| client_class_scope | jsonb | Client class constraints |
| dependency_refs | jsonb | Dependencies |
| version | int | Feature config version |
| status | varchar | active/inactive/retired |
| review_due_utc | timestamptz | Review |
| created_at_utc | timestamptz | Created |
| updated_at_utc | timestamptz | Updated |

### 2.3 `cfg1.prohibited_feature`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| prohibited_feature_id | varchar | Unique |
| feature_code | varchar | Feature |
| prohibition_reason | varchar | Licence/security/control |
| prohibition_source | varchar | Doc00/LFSA/Board/Security |
| applies_until | varchar | Until formal licence transition or permanent |
| status | varchar | active/inactive |
| approved_ref | varchar | Approval |
| version | int | Version |

### 2.4 `cfg1.feature_state_change`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| change_id | varchar | Unique |
| feature_code | varchar | Feature |
| from_state | varchar | Previous |
| to_state | varchar | Target |
| change_reason | text | Safe reason |
| requested_by | varchar | User |
| approval_id | varchar | IAM-02 approval |
| licence_profile_id | varchar | Licence profile |
| effective_at_utc | timestamptz | Effective |
| status | varchar | requested/approved/applied/rejected/cancelled/rolled_back |
| previous_version | int | Previous |
| new_version | int | New |
| sec_audit_ref | varchar | SEC-01 audit ref |

### 2.5 `cfg1.feature_decision_log`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| decision_id | varchar | Unique |
| feature_code | varchar | Feature |
| action | varchar | Action |
| resource | varchar | Resource |
| environment | varchar | Environment |
| client_id | varchar | Client |
| client_class | varchar | Class |
| decision | varchar | allow/deny/locked/prohibited/stale |
| reason_code | varchar | Reason |
| feature_config_version | int | Feature version |
| licence_profile_version | int | Licence version |
| decision_token_hash | varchar | Token hash/ref |
| expires_at_utc | timestamptz | Expiry |
| request_id | varchar | Request |
| correlation_id | varchar | Correlation |
| occurred_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | SEC-01 ref |

### 2.6 `cfg1.feature_decision_token`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| token_id | varchar | Unique |
| token_hash | varchar | Hash/reference |
| feature_code | varchar | Feature |
| action | varchar | Action |
| resource | varchar | Resource |
| environment | varchar | Environment |
| client_id | varchar | Client |
| client_class | varchar | Class |
| feature_config_version | int | Feature version |
| licence_profile_version | int | Licence version |
| status | varchar | active/consumed/expired/revoked |
| issued_at_utc | timestamptz | Issued |
| expires_at_utc | timestamptz | Expiry |

### 2.7 `cfg1.kill_switch`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| kill_switch_id | varchar | Unique |
| feature_code | varchar | Feature |
| scope | jsonb | Environment/client/module scope |
| reason | text | Safe reason |
| activated_by | varchar | User |
| approval_id | varchar | Approval/post approval |
| activated_at_utc | timestamptz | Activated |
| deactivated_at_utc | timestamptz | Optional |
| status | varchar | active/inactive |
| sec_audit_ref | varchar | Audit |

### 2.8 `cfg1.deployment_gate_check`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| gate_check_id | varchar | Unique |
| deployment_id | varchar | Deployment |
| environment | varchar | Environment |
| release_version | varchar | Release |
| requested_features | jsonb | Feature list |
| gate_result | varchar | pass/fail |
| blocking_findings | jsonb | Findings |
| evidence_refs | jsonb | Evidence |
| checked_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.9 `cfg1.handoff_reconciliation`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| reconciliation_id | varchar | Unique |
| source | varchar | IAM-02/SEC-01/Doc00 |
| source_ref | varchar | Source reference |
| cfg_ref | varchar | CFG reference |
| result | varchar | matched/mismatch/missing/blocked |
| finding | text | Safe finding |
| severity | varchar | Severity |
| run_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.10 `cfg1.feature_version`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| version_id | varchar | Unique |
| feature_code | varchar | Feature |
| version | int | Version |
| config_hash | varchar | Config hash |
| changed_by | varchar | User |
| change_id | varchar | Change |
| effective_at_utc | timestamptz | Effective |

---

## 3. Indexes

1. `licence_profile(licence_code, status, version)`.
2. `feature(feature_code, status, version)`.
3. `prohibited_feature(feature_code, status)`.
4. `feature_state_change(feature_code, status)`.
5. `feature_decision_log(feature_code, occurred_at_utc)`.
6. `feature_decision_log(client_id, occurred_at_utc)`.
7. `feature_decision_token(token_hash, status)`.
8. `kill_switch(feature_code, status)`.
9. `deployment_gate_check(deployment_id, environment)`.
10. `handoff_reconciliation(result, severity)`.

---

## 4. Data Rules

1. Feature changes are append-versioned.
2. Prohibited feature cannot be enabled through `feature_state_change`.
3. Licence profile change requires evidence reference.
4. Feature decision token stores hash/reference only.
5. SEC-01 audit reference required for sensitive change.
6. Current state cannot contradict active prohibited feature.
7. Unknown licence profile results in deny.
8. Kill-switch cannot target audit/IAM/licence safety controls for disablement.
9. Runtime cached decision must positive-version check.
10. Handoff mismatch blocks affected feature activation.
