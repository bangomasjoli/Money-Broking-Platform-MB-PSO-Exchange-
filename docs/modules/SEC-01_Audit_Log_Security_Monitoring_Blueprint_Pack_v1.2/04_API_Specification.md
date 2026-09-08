# SEC-01 Audit Log / Security Monitoring  
## 04 API Specification

## 1. API Principles

All SEC-01 APIs use FND standard request envelope, correlation ID, error envelope, idempotency, and audit/outbox rules.

All read/export/admin APIs require IAM-02 permission guard.

---

## 2. Audit Ingestion APIs

### 2.1 POST `/internal/sec1/audit-events`

Purpose: ingest audit event.

Auth: internal service account with scoped event ingestion permission.

Request:

```json
{
  "event_id": "evt_...",
  "event_type": "iam2.approval_approved",
  "event_category": "security",
  "severity": "high",
  "source_module": "IAM-02",
  "source_emission_sequence": 1001,
  "source_emission_stream": "iam2-primary",
  "actor_user_id": "user_...",
  "actor_type": "staff",
  "session_id": "sess_...",
  "client_id": "client_...",
  "entity_type": "approval_request",
  "entity_id": "approval_...",
  "action": "approve",
  "result": "success",
  "reason_code": "approval_policy_satisfied",
  "request_id": "req_...",
  "correlation_id": "corr_...",
  "occurred_at_utc": "2026-01-01T00:00:00Z",
  "source_clock_id": "iam2-clock-ref",
  "metadata": {
    "approval_id": "approval_...",
    "sod_check_id": "sod_...",
    "step_up_assertion_ref": "stepup_..."
  },
  "idempotency_key": "..."
}
```

Response:

```json
{
  "success": true,
  "data": {
    "audit_event_ref": "audit_...",
    "sequence_no": 12345,
    "event_hash": "sha256:...",
    "previous_hash": "sha256:...",
    "seal_batch_id": null,
    "external_anchor_ref": null,
    "trusted_timestamp_ref": null,
    "clock_skew_status": "within_threshold"
  }
}
```

### 2.2 POST `/internal/sec1/audit-events/batch`

Batch ingest audit events.

Rules:

1. Each event must have unique event ID/idempotency key.
2. Partial success must be explicit.
3. `source_module` must match authenticated ingestion identity.
4. Critical event ingestion failure must alert.

---

## 3. Event Schema Registry APIs

### 3.1 GET `/sec1/event-schemas`

Read event schemas.

### 3.2 POST `/sec1/event-schemas`

Create/update event schema.

Requires Security Admin + Compliance approval for sensitive/critical event types.

---

## 4. Audit Search / Read APIs

### 4.1 GET `/sec1/audit-events`

Search audit events.

Common filters:

```txt
event_type
source_module
actor_user_id
client_id
entity_type
entity_id
request_id
correlation_id
severity
time_from
time_to
```

Rules:

1. IAM-02 permission required.
2. Sensitive reads are logged.
3. Result redaction applies based on permission/classification.

### 4.2 GET `/sec1/audit-events/{audit_event_ref}`

Read specific audit event.

### 4.3 GET `/sec1/audit-streams/{stream_id}/verify`

Verify hash chain for stream/range.

---

## 5. Evidence Export APIs

### 5.1 POST `/sec1/evidence-exports`

Request evidence export.

Request:

```json
{
  "scope": {
    "event_refs": ["audit_..."],
    "time_from": "2026-01-01T00:00:00Z",
    "time_to": "2026-01-31T23:59:59Z",
    "client_id": "client_..."
  },
  "purpose": "external_audit",
  "recipient_type": "auditor"
}
```

### 5.2 GET `/sec1/evidence-exports/{export_id}`

Read export status.

### 5.3 GET `/sec1/evidence-exports/{export_id}/download`

Download export package.

Requires permission, approval/step-up where sensitive, and logs export access.

---

## 6. Security Alert APIs

### 6.1 GET `/sec1/security-alerts`

List alerts.

### 6.2 GET `/sec1/security-alerts/{alert_id}`

Read alert.

### 6.3 POST `/sec1/security-alerts/{alert_id}/assign`

Assign alert.

### 6.4 POST `/sec1/security-alerts/{alert_id}/triage`

Submit triage decision.

### 6.5 POST `/sec1/security-alerts/{alert_id}/close`

Close alert with reason/evidence.

Critical alert closure may require approval.

---

## 7. Monitoring Rule APIs

### 7.1 GET `/sec1/monitoring-rules`

Read monitoring rules.

### 7.2 POST `/sec1/monitoring-rules`

Create/update rule.

Requires approval.

---

## 8. Seal / Recovery / Reconciliation / Handoff APIs

### 8.1 POST `/internal/sec1/seals/external-anchor`

Create external seal anchor record.

Requires seal-controller identity and SoD separate from audit operator.

### 8.2 GET `/sec1/seals/{seal_batch_id}/verify`

Verify seal, WORM/object-lock anchor, and trusted timestamp.

### 8.3 POST `/internal/sec1/recovery/verify`

Run recovery integrity verification after restore.

### 8.4 POST `/internal/sec1/reconciliation/expected-events`

Run IAM-02 protected-action to audit expected-event reconciliation.



### 8.5 POST `/internal/sec1/reconciliation/run`

Run reconciliation job.

### 8.6 GET `/sec1/reconciliation-runs/{run_id}`

Read reconciliation result.

### 8.7 POST `/internal/sec1/handoff/iam-interim-audit`

Run IAM-01/IAM-02 interim audit handoff.

---

## 9. Incident Break-Glass Audit Read APIs

### 9.1 POST `/sec1/incident-break-glass/read-request`

Request emergency read-only audit access.

Rules:

1. Read-only only.
2. Time-boxed.
3. Fully audited.
4. Externally sealed.
5. No audit modification/deletion/disablement.

### 9.2 POST `/sec1/incident-break-glass/{request_id}/close-review`

Close post-event review.

---

## 10. Error Codes

| Code | Meaning |
|---|---|
| `SEC1_AUDIT_EVENT_INVALID` | Audit event schema invalid |
| `SEC1_EVENT_TYPE_UNKNOWN` | Event type not registered |
| `SEC1_REQUIRED_FIELD_MISSING` | Mandatory audit field missing |
| `SEC1_IDEMPOTENCY_CONFLICT` | Event already ingested with different payload |
| `SEC1_HASH_CHAIN_UNAVAILABLE` | Hash-chain state unavailable |
| `SEC1_AUDIT_PERSIST_FAILED` | Audit persist failed |
| `SEC1_SENSITIVE_AUDIT_FAIL_CLOSED` | Sensitive action blocked because audit failed |
| `SEC1_UNAUTHORISED_AUDIT_READ` | User not authorised to read audit |
| `SEC1_SENSITIVE_READ_LOG_FAILED` | Sensitive read could not be logged |
| `SEC1_EXPORT_APPROVAL_REQUIRED` | Evidence export requires approval |
| `SEC1_EXPORT_SCOPE_INVALID` | Export scope invalid |
| `SEC1_HASH_MISMATCH` | Hash verification failed |
| `SEC1_SEQUENCE_GAP` | Audit sequence gap detected |
| `SEC1_ALERT_CLOSURE_EVIDENCE_REQUIRED` | Alert closure missing evidence |
| `SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED` | Critical alert closure requires approval |
| `SEC1_RETENTION_BLOCKED_BY_LEGAL_HOLD` | Retention action blocked by legal hold |
| `SEC1_INTERIM_HANDOFF_MISSING_EVENT` | Interim audit handoff missing event |
| `SEC1_EXTERNAL_SEAL_REQUIRED` | Production seal lacks external anchor |
| `SEC1_EXTERNAL_SEAL_MISMATCH` | External seal verification failed |
| `SEC1_TRUSTED_TIMESTAMP_REQUIRED` | Trusted timestamp missing |
| `SEC1_SOURCE_MODULE_IDENTITY_MISMATCH` | source_module does not match authenticated identity |
| `SEC1_SOURCE_SEQUENCE_GAP` | Source emission sequence gap detected |
| `SEC1_EXPECTED_EVENT_MISSING` | Expected audit event missing for sensitive action |
| `SEC1_CLOCK_SKEW_EXCEEDED` | occurred_at_utc skew exceeds threshold |
| `SEC1_ALERT_PIPELINE_BACKLOG` | Alert evaluation backlog exceeded SLA |
| `SEC1_RESTORE_VERIFICATION_REQUIRED` | Restore cannot be authoritative until verified |
| `SEC1_AUDIT_CORRECTION_SOD_BLOCKED` | Corrector is subject/actor of original event |
| `SEC1_INTERIM_BACKFILL_SOURCE_INVALID` | Backfill not supported by FND outbox evidence |
| `SEC1_IAM02_REGISTRY_MISSING` | SEC-01 permission/action missing in IAM-02 registry |
