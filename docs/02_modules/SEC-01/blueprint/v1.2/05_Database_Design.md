# SEC-01 Audit Log / Security Monitoring  
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
sec1
```

Runtime DB role:

```txt
role_sec1_runtime
```

Rules:

1. SEC-01 runtime role owns/accesses SEC-01 schema only.
2. Business modules cannot directly write to audit event store.
3. Business modules emit events through SEC-01 API or FND outbox.
4. Audit event update/delete is prohibited through application runtime role.
5. Correction is append-only.

---

## 2. Tables

### 2.1 `sec1.audit_event`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| audit_event_ref | varchar | Unique |
| event_id | varchar | Source event ID |
| source_emission_stream | varchar | Source stream |
| source_emission_sequence | bigint | Source-assigned sequence |
| idempotency_key | varchar | Idempotency |
| event_type | varchar | Event type |
| event_category | varchar | auth/permission/money/security/system |
| severity | varchar | info/low/medium/high/critical |
| source_module | varchar | Module |
| actor_user_id | varchar | Actor |
| actor_type | varchar | client/staff/system/service |
| session_id | varchar | IAM-01 session ref |
| client_id | varchar | Client scope |
| entity_type | varchar | Entity |
| entity_id | varchar | Entity ID |
| action | varchar | Action |
| result | varchar | success/failure/blocked |
| reason_code | varchar | Reason |
| request_id | varchar | FND request ID |
| correlation_id | varchar | FND correlation ID |
| occurred_at_utc | timestamptz | Source-attested time, not independently trusted |
| ingested_at_utc | timestamptz | SEC-01 ingestion time |
| metadata_redacted | jsonb | Safe metadata |
| classification | varchar | Data classification |
| retention_class | varchar | Retention class |
| stream_id | varchar | Hash stream |
| sequence_no | bigint | Monotonic per stream |
| previous_hash | varchar | Previous event hash |
| event_hash | varchar | Current event hash |
| seal_batch_id | varchar | Batch seal |
| external_anchor_ref | varchar | External WORM/timestamp anchor |
| trusted_timestamp_ref | varchar | Trusted timestamp reference |
| clock_skew_seconds | int | Source vs ingestion time skew |
| clock_skew_status | varchar | within_threshold/flagged/quarantined |
| backfilled | boolean | Backfilled interim event |
| integrity_from | varchar | occurrence_time/ingestion_time |
| status | varchar | active/corrected/archived |

Constraints:

1. Unique `(source_module, event_id)`.
2. Unique `(stream_id, sequence_no)`.
3. Unique `(source_module, source_emission_stream, source_emission_sequence)` where source sequence applies.
4. No update/delete through runtime path.
5. Correction requires separate correction event.

### 2.2 `sec1.event_schema`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| event_type | varchar | Unique |
| source_module | varchar | Owner |
| category | varchar | Category |
| default_severity | varchar | Severity |
| mandatory_fields | jsonb | Mandatory fields |
| allowed_metadata_keys | jsonb | Allowed metadata |
| classification | varchar | Data class |
| retention_class | varchar | Retention |
| sensitive_read | boolean | Sensitive read flag |
| status | varchar | active/inactive |
| version | int | Schema version |

### 2.3 `sec1.audit_stream`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| stream_id | varchar | Unique |
| stream_type | varchar | global/module/client/entity |
| source_module | varchar | Module |
| latest_sequence_no | bigint | Latest |
| latest_hash | varchar | Latest hash |
| status | varchar | active/paused/error |
| updated_at_utc | timestamptz | Updated |

### 2.4 `sec1.audit_seal_batch`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| seal_batch_id | varchar | Unique |
| stream_id | varchar | Stream |
| from_sequence_no | bigint | From |
| to_sequence_no | bigint | To |
| batch_hash | varchar | Batch hash |
| seal_method | varchar | external required in production; internal only non-authoritative dev/test |
| sealed_at_utc | timestamptz | Sealed |
| external_anchor_ref | varchar | WORM/object-lock/ledger anchor |
| object_lock_retention_until_utc | timestamptz | WORM retention lock |
| trusted_timestamp_ref | varchar | Timestamp authority reference |
| trusted_timestamp_utc | timestamptz | Trusted timestamp |
| verification_status | varchar | valid/failed/pending |
| seal_controller_id | varchar | Seal controller identity |

### 2.5 `sec1.security_monitoring_rule`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| rule_id | varchar | Unique |
| rule_name | varchar | Name |
| event_type_filter | jsonb | Event types |
| condition | jsonb | Rule condition |
| threshold | jsonb | Count/window |
| severity | varchar | Alert severity |
| recipient_policy | jsonb | Recipients |
| status | varchar | active/inactive |
| approval_id | varchar | IAM-02 approval |

### 2.6 `sec1.monitoring_dead_letter`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| dead_letter_id | varchar | Unique |
| audit_event_ref | varchar | Event |
| rule_id | varchar | Rule if known |
| failure_reason | varchar | Reason |
| severity | varchar | Severity |
| retry_count | int | Retries |
| status | varchar | pending/replayed/failed/escalated |
| created_at_utc | timestamptz | Created |
| next_retry_at_utc | timestamptz | Retry |

### 2.7 `sec1.security_alert`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| alert_id | varchar | Unique |
| rule_id | varchar | Trigger rule |
| severity | varchar | Severity |
| status | varchar | open/assigned/triaged/escalated/closed |
| title | varchar | Alert title |
| description | text | Safe description |
| actor_user_id | varchar | Actor |
| client_id | varchar | Client |
| entity_type | varchar | Entity |
| entity_id | varchar | Entity |
| linked_audit_events | jsonb | Event refs |
| assigned_to | varchar | Reviewer |
| created_at_utc | timestamptz | Created |
| due_at_utc | timestamptz | SLA |
| closed_at_utc | timestamptz | Closed |
| closure_reason | text | Closure |
| closure_evidence_ref | varchar | Evidence |

### 2.8 `sec1.alert_triage_note`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| note_id | varchar | Unique |
| alert_id | varchar | Alert |
| reviewer_user_id | varchar | Reviewer |
| triage_status | varchar | true_positive/false_positive/duplicate/expected/escalated |
| note | text | Safe note |
| evidence_refs | jsonb | Evidence |
| created_at_utc | timestamptz | Created |

### 2.9 `sec1.evidence_export`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| export_id | varchar | Unique |
| requested_by | varchar | User |
| purpose | varchar | Purpose |
| recipient_type | varchar | auditor/regulator/board/internal/legal |
| scope | jsonb | Export scope |
| status | varchar | requested/approved/generating/ready/downloaded/expired/cancelled |
| approval_id | varchar | IAM-02 approval |
| manifest_hash | varchar | Export manifest hash |
| package_hash | varchar | Export package hash |
| watermark_id | varchar | Traceability |
| expires_at_utc | timestamptz | Expiry |
| created_at_utc | timestamptz | Created |

### 2.10 `sec1.sensitive_read_log`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| read_id | varchar | Unique |
| user_id | varchar | Reader |
| action | varchar | search/read/export/download |
| audit_event_ref | varchar | Optional event |
| export_id | varchar | Optional export |
| search_scope_hash | varchar | Search scope |
| reason | text | Purpose |
| request_id | varchar | Request |
| correlation_id | varchar | Correlation |
| occurred_at_utc | timestamptz | Time |

### 2.11 `sec1.integrity_verification_run`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| verification_id | varchar | Unique |
| stream_id | varchar | Stream |
| from_sequence_no | bigint | From |
| to_sequence_no | bigint | To |
| result | varchar | pass/fail |
| gap_count | int | Gaps |
| mismatch_count | int | Hash mismatches |
| findings | jsonb | Findings |
| run_at_utc | timestamptz | Time |

### 2.12 `sec1.interim_audit_handoff`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| handoff_id | varchar | Unique |
| source_module | varchar | IAM-01/IAM-02/etc |
| local_index_ref | varchar | Source ref |
| audit_event_ref | varchar | SEC-01 ref |
| handoff_status | varchar | matched/ingested/missing/failed |
| fnd_outbox_evidence_ref | varchar | Required for backfill |
| backfilled_audit_event_ref | varchar | SEC-01 backfilled ref |
| integrity_from | varchar | ingestion_time for interim backfill |
| sensitivity | varchar | Sensitivity |
| finding | text | Safe finding |
| reconciled_at_utc | timestamptz | Time |

### 2.13 `sec1.audit_correction`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| correction_id | varchar | Unique |
| original_audit_event_ref | varchar | Original |
| correction_audit_event_ref | varchar | Correction event |
| correction_reason | text | Reason |
| approval_id | varchar | IAM-02 approval |
| created_by | varchar | User |
| original_actor_user_id | varchar | Original event actor/subject |
| sod_check_id | varchar | IAM-02 SoD check |
| created_at_utc | timestamptz | Time |

---

### 2.14 `sec1.source_identity_binding`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| binding_id | varchar | Unique |
| source_module | varchar | Module |
| ingestion_identity_id | varchar | Service account/client cert/key ref |
| allowed_streams | jsonb | Source streams |
| status | varchar | active/inactive |
| approved_ref | varchar | IAM-02 approval |

### 2.15 `sec1.expected_event_reconciliation`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| expected_event_id | varchar | Unique |
| source_module | varchar | Module |
| protected_action_id | varchar | IAM-02 registry ref |
| action_entity_id | varchar | Business action entity |
| expected_event_type | varchar | Expected event |
| expected_by_utc | timestamptz | SLA deadline |
| matched_audit_event_ref | varchar | Matched event |
| status | varchar | pending/matched/late/missing/escalated |
| finding | text | Safe finding |

### 2.16 `sec1.recovery_integrity_run`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| recovery_run_id | varchar | Unique |
| restore_point_ref | varchar | Backup/restore ref |
| hash_chain_result | varchar | pass/fail |
| external_seal_result | varchar | pass/fail |
| trusted_timestamp_result | varchar | pass/fail |
| expected_event_result | varchar | pass/fail |
| authoritative_status | varchar | pending/authoritative/blocked |
| run_at_utc | timestamptz | Time |
| approved_ref | varchar | Sign-off if required |

## 3. Indexes

1. `audit_event(event_type, occurred_at_utc)`.
2. `audit_event(actor_user_id, occurred_at_utc)`.
3. `audit_event(client_id, occurred_at_utc)`.
4. `audit_event(entity_type, entity_id)`.
5. `audit_event(correlation_id)`.
6. `audit_event(stream_id, sequence_no)`.
7. `audit_event(severity, occurred_at_utc)`.
8. `event_schema(event_type, status)`.
9. `security_alert(status, severity, due_at_utc)`.
10. `evidence_export(requested_by, status)`.
11. `sensitive_read_log(user_id, occurred_at_utc)`.
12. `interim_audit_handoff(source_module, handoff_status)`.
13. `audit_event(source_module, source_emission_stream, source_emission_sequence)`.
14. `source_identity_binding(source_module, ingestion_identity_id, status)`.
15. `expected_event_reconciliation(status, expected_by_utc)`.
16. `monitoring_dead_letter(status, next_retry_at_utc)`.
17. `recovery_integrity_run(authoritative_status, run_at_utc)`.

---

## 4. Data Rules

1. No direct business-module write to `sec1.audit_event`.
2. No update/delete on audit event through runtime role.
3. Metadata must be redacted/safe.
4. Sensitive read log must be created before returning sensitive data.
5. Export manifest/package hash required.
6. Correction must be append-only.
7. Hash chain must be verified.
8. Legal hold blocks retention/archive deletion.
9. Service account ingestion must be scoped by source module.
10. Audit event canonicalisation version must be retained.
11. Production batch seals require external anchor and trusted timestamp.
12. `source_module` must match authenticated ingestion identity.
13. Source emission sequence must be verified where required.
14. Interim backfill requires FND outbox delivery evidence and is marked integrity-from-ingestion.
15. Restore is non-authoritative until chain/seal/expected-event verification passes.
16. Correction creator must not be original event subject/actor.
17. Audit metadata should use reference/pseudonymised/minimised personal data.
18. Erasure request cannot delete legal/regulatory immutable audit evidence before retention/legal basis expires.
