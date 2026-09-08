# FND-01 Platform Foundation  
## 09 Error Handling

## 1. Error Handling Principles

1. Fail closed for critical controls.
2. Do not leak secrets or stack traces.
3. Always return request ID and correlation ID.
4. Use stable error codes.
5. Log internal detail safely.
6. Audit sensitive failures.
7. Map vendor/internal errors to safe client/staff messages.

---

## 2. Standard Error Envelope

```json
{
  "success": false,
  "request_id": "req_...",
  "correlation_id": "corr_...",
  "error": {
    "code": "FOUNDATION_NOT_READY",
    "message": "The platform is not ready to process this request.",
    "details": []
  },
  "server_time_utc": "2026-01-01T00:00:00Z"
}
```

---

## 3. Error Code Catalogue

| Code | Severity | User Visible | Description |
|---|---|---:|---|
| `FOUNDATION_NOT_READY` | High | Yes | Foundation dependencies not ready |
| `REQUEST_CONTEXT_INVALID` | High | No/Generic | Request context invalid |
| `CORRELATION_ID_INVALID` | Medium | No/Generic | Correlation ID invalid |
| `CONFIGURATION_INVALID` | Critical | No | Critical config invalid |
| `CONFIGURATION_DRIFT` | High/Critical | No | Runtime config drift |
| `MODULE_NOT_REGISTERED` | High | No | Unknown module |
| `MODULE_DEPENDENCY_NOT_MET` | High | No | Module dependency missing |
| `MODULE_BOUNDARY_VIOLATION` | Critical | No | Cross-module boundary violation |
| `FEATURE_FLAG_UNAVAILABLE` | High | Generic | Feature flag interface unavailable |
| `LICENCE_LOCK_UNAVAILABLE` | Critical | Generic | Licence lock interface unavailable |
| `TIME_SOURCE_UNHEALTHY` | High | Generic | Trusted time unhealthy |
| `AUDIT_PUBLISH_FAILED` | High/Critical | Generic | Audit publish/outbox failed |
| `OUTBOX_UNAVAILABLE` | High/Critical | Generic | Outbox unavailable |
| `IDEMPOTENCY_CONFLICT` | High | Yes/Generic | Same key, different fingerprint |
| `SMOKE_TEST_FAILED` | Critical | No | Deployment smoke failed |
| `SENSITIVE_DATA_LOG_BLOCKED` | High | No | Log scrubbing blocked event |
| `EXCHANGE_COMPONENT_DETECTED` | Critical | No | Future-locked component found |
| `SCHEDULED_JOB_MISSED` | Critical/High | No | Scheduled job missed run window |
| `JOB_QUEUE_DEAD_LETTER` | High/Critical | No | Job dead-lettered |
| `RATE_LIMITED` | Medium | Yes/Generic | Rate limit reached |
| `DB_ISOLATION_VIOLATION` | Critical | No | DB grant/RLS isolation breach |
| `ASYNC_CORRELATION_MISSING` | High | No | Async job/event missing trace context |
| `AUDIT_OUTBOX_REQUIRED` | Critical | Generic | Required audit/outbox could not be persisted |

---

## 4. Failure Behaviour

### 4.1 Startup Failures

Critical startup failure stops application.

Examples:

1. Missing DB.
2. Missing critical config.
3. Missing production secrets.
4. Unknown environment.
5. Licence-lock interface invalid.
6. Audit/outbox unavailable where required.

### 4.2 Readiness Failures

Readiness returns failed if:

1. Database unavailable.
2. Required queue unavailable.
3. Time source unhealthy.
4. Critical config drift.
5. Audit/outbox unavailable.
6. Exchange component detected.

### 4.3 Request Context Failures

Request rejected if:

1. Request context cannot be created.
2. Correlation ID invalid.
3. Tenant scope missing where required.
4. Server timestamp unavailable.

### 4.4 Module Boundary Failure

Boundary violation must:

1. Block action.
2. Emit Critical event.
3. Alert Security/Architecture.
4. Create defect/incident.
5. Block release if detected in test.

---

## 5. Safe Messages

| Internal Error | External Message |
|---|---|
| DB unavailable | Service temporarily unavailable |
| Licence lock unavailable | Service temporarily unavailable |
| Feature flag unknown | Feature unavailable |
| Config drift | Service temporarily unavailable |
| Audit publish failed | Service temporarily unavailable |
| Module boundary violation | Service temporarily unavailable |

---

## 6. Logging Rules

1. Log error code.
2. Log request/correlation ID.
3. Log safe context.
4. Do not log secrets.
5. Do not log full PII.
6. Do not log credentials, OTP, token, STR, or full bank/wallet data.


---

## 7. Scheduler / Job Queue Failure Behaviour

| Failure | Behaviour |
|---|---|
| Critical scheduled job missed | Critical alert and incident |
| Job duplicate detected | Idempotent safe replay/no-op |
| Job retries exhausted | Dead-letter and alert |
| Job missing correlation ID | Reject or generate controlled correlation with alert |
| Worker restart mid-job | Resume safely or retry idempotently |

---

## 8. Audit / Outbox Atomicity Failure Behaviour

| Failure | Behaviour |
|---|---|
| Required audit event cannot be written | Sensitive action fails closed |
| Required money-event outbox cannot be written | Money action fails closed |
| Outbox worker unavailable after commit | Event remains pending and alert if SLA breached |
| Outbox dead-letter | Alert and controlled remediation |
| Missing audit/outbox reconciliation gap | Critical alert |

---

## 9. DB Isolation Failure Behaviour

| Failure | Behaviour |
|---|---|
| Runtime role cross-schema access denied | Expected block and audit/security event |
| Runtime role unexpectedly has cross-schema access | Critical defect / deployment blocked |
| RLS permits cross-client row | Critical defect / deployment blocked |
