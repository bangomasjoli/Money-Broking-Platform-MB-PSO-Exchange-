# SEC-01 Audit Log / Security Monitoring  
## 09 Error Handling

## 1. Error Principles

1. Sensitive actions fail closed if audit cannot be persisted/queued.
2. Audit read/export errors must not leak sensitive data.
3. Integrity errors are Critical.
4. Event ingestion is idempotent.
5. Rejected critical events create alerts.
6. Error response includes request/correlation ID.

---

## 2. Error Codes

| Code | Severity | Handling |
|---|---|---|
| `SEC1_AUDIT_EVENT_INVALID` | High | Reject event |
| `SEC1_EVENT_TYPE_UNKNOWN` | High/Critical | Reject; alert if sensitive |
| `SEC1_REQUIRED_FIELD_MISSING` | High | Reject event |
| `SEC1_IDEMPOTENCY_CONFLICT` | High | Reject and alert if mismatch |
| `SEC1_HASH_CHAIN_UNAVAILABLE` | Critical | Fail closed for sensitive |
| `SEC1_AUDIT_PERSIST_FAILED` | Critical | Fail closed for sensitive |
| `SEC1_SENSITIVE_AUDIT_FAIL_CLOSED` | Critical | Block business action |
| `SEC1_UNAUTHORISED_AUDIT_READ` | High | Deny |
| `SEC1_SENSITIVE_READ_LOG_FAILED` | Critical | Deny read/export |
| `SEC1_EXPORT_APPROVAL_REQUIRED` | High | Approval required |
| `SEC1_EXPORT_SCOPE_INVALID` | High | Reject export |
| `SEC1_HASH_MISMATCH` | Critical | Alert/incident |
| `SEC1_SEQUENCE_GAP` | Critical | Alert/incident |
| `SEC1_ALERT_CLOSURE_EVIDENCE_REQUIRED` | High | Closure blocked |
| `SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED` | High | Approval required |
| `SEC1_RETENTION_BLOCKED_BY_LEGAL_HOLD` | High | Archive/delete blocked |
| `SEC1_INTERIM_HANDOFF_MISSING_EVENT` | Critical | Alert/incident |
| `SEC1_EXTERNAL_SEAL_REQUIRED` | Critical | Block production authority |
| `SEC1_EXTERNAL_SEAL_MISMATCH` | Critical | Alert/incident |
| `SEC1_TRUSTED_TIMESTAMP_REQUIRED` | High/Critical | Seal invalid |
| `SEC1_SOURCE_MODULE_IDENTITY_MISMATCH` | Critical | Reject event |
| `SEC1_SOURCE_SEQUENCE_GAP` | Critical | Alert/incident |
| `SEC1_EXPECTED_EVENT_MISSING` | Critical | Alert/incident |
| `SEC1_CLOCK_SKEW_EXCEEDED` | High/Critical | Flag/quarantine |
| `SEC1_ALERT_PIPELINE_BACKLOG` | High/Critical | Dead-letter/replay/alert |
| `SEC1_RESTORE_VERIFICATION_REQUIRED` | Critical | Not authoritative |
| `SEC1_AUDIT_CORRECTION_SOD_BLOCKED` | Critical | Block correction |
| `SEC1_INTERIM_BACKFILL_SOURCE_INVALID` | Critical | Block backfill |
| `SEC1_IAM02_REGISTRY_MISSING` | Critical | Fail closed |

---

## 3. Fail-Closed Cases

SEC-01 fails closed for sensitive action when:

1. Audit outbox enqueue fails.
2. Audit event schema unavailable.
3. Event validation unavailable.
4. Hash-chain state unavailable.
5. Required audit event cannot persist.
6. Sensitive read log cannot be recorded.
7. Evidence export cannot be logged.
8. Audit authority status unknown.
9. External seal anchor required but unavailable.
10. Trusted timestamp unavailable for production seal.
11. Ingestion identity does not match source module.
12. Expected event reconciliation for sensitive action fails.
13. Restored audit store has not passed recovery integrity verification.
14. Emergency incident read cannot be logged/sealed.

---

## 4. Safe User Messages

| Scenario | Message |
|---|---|
| Audit read denied | You are not authorised to access this audit evidence |
| Export approval needed | Evidence export requires approval |
| Audit unavailable | Action cannot proceed because audit control is unavailable |
| Integrity failure | Audit integrity verification failed |
| Alert closure blocked | Closure requires evidence or approval |
