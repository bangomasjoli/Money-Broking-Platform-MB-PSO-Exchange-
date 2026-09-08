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

1. Outbox write must be transaction-coupled to the business/sensitive action where applicable.
2. Money modules must use durable transaction-coupled outbox.
3. Sensitive action must fail closed if required audit/outbox record cannot be written.
4. Payload should avoid full sensitive data.
5. Outbox event must carry correlation_id and causation_id.

---

### 3.9 `foundation.scheduled_job`

Purpose: scheduled job registration baseline.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| job_code | varchar | Unique job code |
| owner_module | varchar | Module owner |
| schedule_expression | varchar | RRULE/cron equivalent |
| criticality | varchar | critical/high/medium/low |
| enabled | boolean | Active flag |
| max_lateness_minutes | int | Missed-run threshold |
| idempotency_strategy | varchar | e.g. job_code_period |
| missed_run_detection | boolean | Required for Critical/High |
| next_due_at_utc | timestamptz | Next expected run |
| created_at_utc | timestamptz | Created |
| updated_at_utc | timestamptz | Updated |

Constraints:

1. `job_code` unique.
2. Critical/High job requires `missed_run_detection = true`.
3. Owner module must be registered.

---

### 3.10 `foundation.job_run`

Purpose: scheduled/background job run tracking.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| job_run_id | varchar | Unique |
| job_code | varchar | Job reference |
| owner_module | varchar | Owner |
| scheduled_for_utc | timestamptz | Expected run time |
| started_at_utc | timestamptz | Start |
| completed_at_utc | timestamptz | End |
| status | varchar | queued/running/completed/failed/missed/dead_letter |
| correlation_id | varchar | Async trace |
| causation_id | varchar | Source event/job |
| idempotency_key | varchar | Job idempotency |
| attempt_count | int | Attempts |
| error_code | varchar | Safe error |
| evidence_ref | varchar | Evidence link |

Indexes:

1. `(job_code, scheduled_for_utc)`.
2. `(status, scheduled_for_utc)`.
3. `(correlation_id)`.

---

### 3.11 `foundation.job_queue_message`

Purpose: durable background job queue baseline.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| queue_message_id | varchar | Unique |
| job_type | varchar | Job type |
| owner_module | varchar | Owner |
| payload_ref | varchar | Payload reference |
| status | varchar | queued/claimed/running/completed/retry_scheduled/dead_letter |
| correlation_id | varchar | Required |
| causation_id | varchar | Source event/job |
| source_ref | varchar | Source entity/event |
| idempotency_key | varchar | Duplicate prevention |
| available_at_utc | timestamptz | Delayed/retry time |
| claimed_by | varchar | Worker |
| claimed_at_utc | timestamptz | Claim time |
| attempt_count | int | Attempts |
| max_attempts | int | Max |
| last_error_code | varchar | Safe error |
| created_at_utc | timestamptz | Created |
| updated_at_utc | timestamptz | Updated |

Rules:

1. `correlation_id` required.
2. Job execution must be idempotent.
3. Dead-letter must alert for Critical/High jobs.
4. Sensitive payload must be referenced, not stored inline.

---

### 3.12 `foundation.rate_limit_decision_log`

Purpose: baseline record for rate-limit decisions where logged.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| decision_id | varchar | Unique |
| scope_hash | varchar | Hash of actor/IP/client/action scope |
| action | varchar | Action checked |
| decision | varchar | allow/throttle/block |
| limit_ref | varchar | Rule reference |
| retry_after_seconds | int | Retry time |
| occurred_at_utc | timestamptz | Server UTC |
| correlation_id | varchar | Trace ID |

Rules:

1. Avoid storing raw IP/client details unless required.
2. Suspicious throttling events should emit security metrics.


## 4. Indexes

Recommended:

1. `module_registry(module_code)`.
2. `release_registry(release_id, environment)`.
3. `config_baseline(config_key, environment, status)`.
4. `config_drift_result(run_id, environment)`.
5. `smoke_test_run(release_id, environment, status)`.
6. `idempotency_record(actor_id, action, idempotency_key)`.
7. `outbox_event(status, next_retry_at_utc)`.
8. `scheduled_job(job_code)`.
9. `job_run(job_code, scheduled_for_utc)`.
10. `job_queue_message(status, available_at_utc)`.
11. `rate_limit_decision_log(scope_hash, action)`.

---

## 5. Database-Level Isolation Baseline

### 5.1 Per-Module Database Roles

Each module must run with a least-privilege DB role.

Pattern:

```txt
role_fnd_runtime
role_iam_runtime
role_clt_runtime
role_cmp_runtime
role_mon_runtime
role_rpt_runtime
```

Rules:

1. Runtime role may access own schema only.
2. Runtime role may access approved shared foundation views/interfaces only.
3. Runtime role must not have broad cross-schema read/write.
4. Ledger/compliance/security schemas require stricter grants.
5. Migration role must be separate from runtime role.
6. Production human DB role must not be used for normal application runtime.

### 5.2 RLS Baseline for Client-Owned Tables

Any module table containing client-owned records must implement:

1. `client_id` or equivalent tenant ownership key.
2. App-level scope check.
3. Database-level row-level security or equivalent where feasible.
4. Tests proving cross-client access is denied.
5. Reporting read models preserving client scope.

### 5.3 Deployment Tests

1. Runtime role cannot read another module schema.
2. Runtime role cannot write another module schema.
3. Client-owned table denies cross-client access.
4. Missing client scope fails closed.

---

## 6. Data Retention

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

## 7. Security

1. Schema access restricted to application service.
2. No direct production edit except controlled emergency.
3. Sensitive config values stored as hash/reference only.
4. Smoke evidence must not contain secrets.
5. Read access to deployment evidence logged where sensitive.
