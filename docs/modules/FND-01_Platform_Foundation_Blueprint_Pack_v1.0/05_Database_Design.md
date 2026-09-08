# FND-01 Platform Foundation  
## 05 Database Design

## 1. Database Scope

FND-01 owns only foundation metadata.

It does not own client, compliance, trading, money, ledger, audit-log, or reporting business tables.

---

## 2. Logical Schema

Recommended schema:

```txt
foundation
```

---

## 3. Tables

### 3.1 `foundation.module_registry`

Purpose: records registered modules.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| module_code | varchar | Unique, e.g. FND-01 |
| module_name | varchar | Human-readable |
| module_version | varchar | Module version |
| module_group | varchar | FND/IAM/CLT/CMP/MON/etc |
| owner_team | varchar | Responsible owner |
| runtime_enabled | boolean | Runtime active |
| go_live_status | varchar | draft/review/approved/active/retired |
| dependencies | jsonb | Module dependency list |
| schema_owner | varchar | Owned schema |
| created_at_utc | timestamptz | Server UTC |
| updated_at_utc | timestamptz | Server UTC |

Constraints:

1. `module_code` unique.
2. `runtime_enabled` cannot be true if dependency not met.
3. Future-locked Exchange modules cannot be active in MVP.

---

### 3.2 `foundation.release_registry`

Purpose: release and artifact identity.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| release_id | varchar | Unique |
| artifact_hash | varchar | sha256 digest |
| build_version | varchar | Build version |
| build_time_utc | timestamptz | Build time |
| environment | varchar | dev/qa/uat/staging/prod |
| deployed_at_utc | timestamptz | Deployment time |
| deployed_by | varchar | pipeline/service identity |
| deployment_status | varchar | pending/deployed/failed/rolled_back |
| evidence_ref | varchar | Evidence repository link |

Rules:

1. Production release must match staging artifact hash.
2. Production rebuild is prohibited.
3. Release evidence must be linked.

---

### 3.3 `foundation.config_baseline`

Purpose: approved baseline for critical runtime config references.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| config_key | varchar | Unique per environment |
| config_class | varchar | feature/vendor/security/system |
| approved_value_hash | varchar | Hash only where sensitive |
| environment | varchar | Environment |
| owner_team | varchar | Owner |
| approval_ref | varchar | Approval evidence |
| effective_from_utc | timestamptz | Effective time |
| status | varchar | active/retired |

Rules:

1. Sensitive values must not be stored plaintext.
2. Baseline comparison must use hash/reference.

---

### 3.4 `foundation.config_drift_result`

Purpose: store drift detection results.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| run_id | varchar | Drift run reference |
| environment | varchar | Environment |
| drift_level | varchar | none/low/high/critical |
| config_key | varchar | Key checked |
| expected_hash | varchar | Expected reference/hash |
| actual_hash | varchar | Actual reference/hash |
| detected_at_utc | timestamptz | Detection time |
| status | varchar | open/resolved/accepted |
| resolved_at_utc | timestamptz | Resolution time |

---

### 3.5 `foundation.smoke_test_run`

Purpose: deployment smoke test evidence.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| smoke_test_id | varchar | Unique |
| release_id | varchar | Release reference |
| environment | varchar | Environment |
| scope | varchar | pre_deploy/post_deploy/manual |
| status | varchar | running/passed/failed |
| started_at_utc | timestamptz | Start time |
| completed_at_utc | timestamptz | End time |
| triggered_by | varchar | Actor/service |
| evidence_ref | varchar | Evidence link |

---

### 3.6 `foundation.smoke_test_check`

Purpose: individual smoke check result.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| smoke_test_run_id | uuid | FK |
| check_name | varchar | Check name |
| check_status | varchar | passed/failed/skipped |
| severity | varchar | critical/high/medium/low |
| message | text | Safe non-sensitive message |
| evidence | jsonb | Non-sensitive evidence |
| checked_at_utc | timestamptz | Time |

---

### 3.7 `foundation.idempotency_record`

Purpose: baseline durable idempotency for foundation and shared pattern.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| idempotency_key | varchar | Unique per actor/action scope |
| request_fingerprint | varchar | Hash of canonical request |
| actor_id | varchar | User/service |
| actor_type | varchar | user/system/service |
| action | varchar | Action name |
| status | varchar | processing/completed/failed |
| result_ref | varchar | Result reference |
| expires_at_utc | timestamptz | Retention expiry |
| created_at_utc | timestamptz | Created |
| updated_at_utc | timestamptz | Updated |

Constraints:

1. Unique on `(actor_id, action, idempotency_key)`.
2. Duplicate key with different fingerprint rejected.
3. Financial modules may extend or own separate schema but must follow this pattern.

---

### 3.8 `foundation.outbox_event`

Purpose: baseline outbox event pattern.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| outbox_id | varchar | Unique |
| topic | varchar | Topic |
| event_type | varchar | Event type |
| payload_ref | varchar | Payload ref or safe payload |
| status | varchar | pending/published/failed/dead_letter |
| retry_count | int | Retry count |
| next_retry_at_utc | timestamptz | Retry time |
| created_at_utc | timestamptz | Created |
| published_at_utc | timestamptz | Published |

Rules:

1. Money modules must use durable transaction-coupled outbox.
2. Payload should avoid full sensitive data.

---

## 4. Indexes

Recommended:

1. `module_registry(module_code)`.
2. `release_registry(release_id, environment)`.
3. `config_baseline(config_key, environment, status)`.
4. `config_drift_result(run_id, environment)`.
5. `smoke_test_run(release_id, environment, status)`.
6. `idempotency_record(actor_id, action, idempotency_key)`.
7. `outbox_event(status, next_retry_at_utc)`.

---

## 5. Data Retention

| Table | Retention |
|---|---|
| module_registry | Life of platform + records retention |
| release_registry | Release records retention |
| config_baseline | Config records retention |
| config_drift_result | Operational/security retention |
| smoke_test_run/check | Deployment evidence retention |
| idempotency_record | According to action type |
| outbox_event | According to event type |

---

## 6. Security

1. Schema access restricted to application service.
2. No direct production edit except controlled emergency.
3. Sensitive config values stored as hash/reference only.
4. Smoke evidence must not contain secrets.
5. Read access to deployment evidence logged where sensitive.
