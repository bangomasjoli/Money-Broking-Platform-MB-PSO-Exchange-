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
| evidence_authenticity_status | varchar | unverified/verified/rejected |
| evidence_verification_source | varchar | LFSA/source mechanism |
| evidence_verified_by | varchar | Verifier |
| effective_from_utc | timestamptz | Effective |
| effective_to_utc | timestamptz | Optional |
| version | int | Version |
| registry_hash | varchar | Registry hash |
| signature_ref | varchar | Signature/seal ref |
| doc00_baseline_hash | varchar | Doc 00 baseline hash |
| last_integrity_check_utc | timestamptz | Last check |
| status | varchar | active/inactive/superseded |
| approved_ref | varchar | IAM-02 approval |
| config_hash | varchar | Signed config hash |
| signature_ref | varchar | Signature/seal ref |
| doc00_baseline_hash | varchar | Doc 00 baseline hash |
| sec_audit_ref | varchar | SEC-01 audit ref |
| signed_change_ref | varchar | Signed change record |
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
| config_hash | varchar | Feature config hash |
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
| prohibited_registry_version | int | Prohibited registry version |
| prohibited_registry_hash | varchar | Registry hash |
| iam2_decision_context_ref | varchar | IAM-02 bound context |
| prohibited_registry_version | int | Prohibited registry version |
| prohibited_registry_hash | varchar | Registry integrity hash |
| integrity_status | varchar | verified/failed/unknown |
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
| prohibited_registry_version | int | Prohibited registry version |
| prohibited_registry_hash | varchar | Registry integrity hash |
| integrity_status | varchar | verified/failed/unknown |
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

### 2.11 `cfg1.config_integrity_seal`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| seal_id | varchar | Unique |
| config_scope | varchar | licence_profile/prohibited_registry/feature |
| config_version | int | Version |
| config_hash | varchar | Hash |
| doc00_baseline_hash | varchar | Doc 00 hash |
| signed_by | varchar | Signer |
| signature_ref | varchar | Signature/seal |
| approval_id | varchar | IAM-02 approval |
| sec_audit_ref | varchar | SEC-01 audit |
| sealed_at_utc | timestamptz | Time |
| status | varchar | active/superseded/failed |

### 2.12 `cfg1.exchange_activation_ceremony`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| ceremony_id | varchar | Unique |
| licence_profile_id | varchar | Licence |
| evidence_ref | varchar | LFSA evidence |
| evidence_authenticity_status | varchar | verified/rejected |
| board_approval_ref | varchar | Board sign-off |
| compliance_approval_ref | varchar | Compliance |
| management_approval_ref | varchar | Management |
| cooldown_until_utc | timestamptz | Time-lock |
| deployment_gate_check_id | varchar | Gate |
| reseal_ref | varchar | Config re-seal |
| status | varchar | requested/evidence_verified/approved/cooldown/ready/activated/rejected/cancelled |
| sec_audit_ref | varchar | Audit |

### 2.13 `cfg1.feature_gate_mapping`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| mapping_id | varchar | Unique |
| protected_action_id | varchar | IAM-02 protected action |
| feature_code | varchar | CFG feature |
| token_required | boolean | Must be true for sensitive |
| owner_module | varchar | Module |
| status | varchar | active/inactive |
| last_verified_utc | timestamptz | Coverage check |

### 2.14 `cfg1.out_of_band_change_finding`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| finding_id | varchar | Unique |
| config_scope | varchar | Scope |
| detected_hash | varchar | Detected |
| expected_hash | varchar | Expected |
| severity | varchar | Severity |
| status | varchar | open/blocked/resolved |
| detected_at_utc | timestamptz | Time |
| sec_alert_ref | varchar | SEC-01 alert |

### 2.15 `cfg1.audit_outage_mode`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| outage_id | varchar | Unique |
| status | varchar | active/resolved |
| started_at_utc | timestamptz | Start |
| resolved_at_utc | timestamptz | End |
| max_duration_seconds | int | Limit |
| allowed_decision_count | int | Count |
| blocked_change_count | int | Count |
| reconciliation_ref | varchar | Reconcile |

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
11. `config_integrity_seal(config_scope, config_version, status)`.
12. `exchange_activation_ceremony(status, cooldown_until_utc)`.
13. `feature_gate_mapping(protected_action_id, feature_code, status)`.
14. `out_of_band_change_finding(status, severity)`.
15. `audit_outage_mode(status, started_at_utc)`.

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
11. Licence/prohibited registry must match signed config integrity seal at decision time.
12. Out-of-band config change fails closed.
13. Exchange activation must use exchange activation ceremony table, not ordinary flag edit.
14. Decision token binds prohibited registry version/hash.
15. Kill-switch and licence suspension/revocation immediately revoke outstanding tokens.
16. Prohibited/Exchange-locked features are hard-blocked in all environments.
17. Synthetic non-prod exceptions must be isolated and synthetic-data-only.
18. SEC-01 synchronous outage can use FND transaction-coupled outbox only for allowed licensed decisions; feature changes remain blocked.
