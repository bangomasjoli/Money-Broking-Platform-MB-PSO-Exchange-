# FND-01 Platform Foundation  
## 02 Workflow

## 1. Workflow Scope

This document defines foundation workflows required by all platform modules.

The workflows are not client-business workflows. They are platform operational workflows.

---

## 2. WF-FND-01 Application Startup

### Trigger

Application process starts.

### Steps

1. Load environment identifier.
2. Load required configuration.
3. Validate critical configuration.
4. Validate KMS/vault connectivity where applicable.
5. Validate database connectivity.
6. Validate queue/cache connectivity where applicable.
7. Validate feature flag/licence-lock interface availability.
8. Register module versions.
9. Start health endpoint.
10. Start readiness endpoint.
11. Emit application_started audit/system event.

### Fail Conditions

| Condition | Result |
|---|---|
| Critical config missing | Startup fails |
| Database unavailable | Startup fails |
| Required secret missing | Startup fails |
| Unknown environment | Startup fails |
| Licence-lock interface unavailable in production | Startup fails or degraded-fail-closed |
| Audit/outbox baseline unavailable for production | Startup fails or degraded-fail-closed |

---

## 3. WF-FND-02 Request Lifecycle

### Trigger

API request received.

### Steps

1. API gateway receives request.
2. Request ID is generated if absent.
3. Correlation ID is generated or propagated.
4. Request timestamp captured in server UTC.
5. Source metadata captured.
6. Request payload validated.
7. Authentication context is attached where available.
8. Tenant/client scope is attached where applicable.
9. Permission guard handoff occurs where protected.
10. Feature flag/licence-lock check occurs where applicable.
11. Domain handler executes.
12. Audit event emitted where sensitive.
13. Standard response returned.

### Failure Behaviour

1. Validation failure returns `VALIDATION_ERROR`.
2. Rate limit returns `RATE_LIMITED`.
3. Missing permission returns `PERMISSION_DENIED`.
4. Unknown feature flag returns `FEATURE_DISABLED` or fail-closed.
5. Missing request context returns `REQUEST_CONTEXT_INVALID`.

---

## 4. WF-FND-03 Module Registration

### Trigger

Application startup or module deployment.

### Steps

1. Module declares code and version.
2. Module declares owner.
3. Module declares dependencies.
4. Module declares schema ownership.
5. Module declares audit events.
6. Module declares feature flags.
7. Module declares go-live status.
8. Registry stores module metadata.
9. Deployment evidence links to module version.

### Rules

1. Unregistered module cannot be production-active.
2. Module with unmet dependency cannot activate.
3. Future-locked Exchange module cannot activate in MVP.
4. Module owner must be defined.

---

## 5. WF-FND-04 Foundation Health Check

### Trigger

Health/readiness endpoint call or monitoring probe.

### Health Check Types

| Check | Purpose |
|---|---|
| Liveness | Process running |
| Readiness | Ready to serve traffic |
| Version | Release/artifact identity |
| Dependency | DB/queue/cache/vendor baseline |
| Time | Server UTC/NTP status |
| Config | Critical config present |
| Feature lock | Locked feature status |
| Audit/outbox | Audit/outbox baseline status |

### Result

1. Healthy.
2. Degraded.
3. Not ready.
4. Failed.

Critical failures must fail readiness.

---

## 6. WF-FND-05 Deployment Smoke Hook

### Trigger

Pre-deployment or post-deployment smoke test.

### Steps

1. Verify release artifact version.
2. Verify application starts.
3. Verify health endpoint.
4. Verify readiness endpoint.
5. Verify server UTC time.
6. Verify feature flag interface.
7. Verify licence lock interface.
8. Verify module registry.
9. Verify audit publisher test event.
10. Verify outbox enqueue/dequeue.
11. Verify log scrubbing with test payload.
12. Verify Exchange locked module absence.
13. Record smoke evidence.

### Failure

Any Critical smoke failure blocks deployment.

---

## 7. WF-FND-06 Configuration Drift Detection

### Trigger

Scheduled job, deployment, or manual admin check.

### Steps

1. Read approved config baseline.
2. Read runtime config.
3. Compare feature flag values.
4. Compare licence-lock values.
5. Compare critical vendor endpoint refs.
6. Compare environment ID.
7. Compare monitoring status.
8. Compare backup/DR status where applicable.
9. Generate drift report.
10. Alert if Critical drift.

### Critical Drift Examples

1. Exchange flag enabled.
2. Production environment uses sandbox vendor credential.
3. Unknown feature flag state.
4. Monitoring disabled.
5. Audit/outbox disabled.
6. Data residency config mismatch.

---

## 8. WF-FND-07 Foundation Incident Detection

### Trigger

Foundation-level Critical alert.

### Examples

1. App cannot start.
2. Readiness fails.
3. Request context missing.
4. Cross-module boundary violation detected.
5. Audit/outbox unavailable.
6. Time drift alert.
7. Critical config drift.
8. Exchange-locked component detected.

### Steps

1. Alert generated.
2. Incident owner assigned.
3. Impact assessed.
4. Deployment freeze considered.
5. Corrective action executed.
6. Evidence preserved.
7. Post-incident review completed.

---

## 9. WF-FND-08 Scheduler Registration and Missed-Run Detection

### Trigger

A module registers a scheduled job or deployment loads scheduler definitions.

### Steps

1. Module declares job code.
2. Module declares owner module.
3. Module declares schedule expression.
4. Module declares criticality.
5. Module declares idempotency key strategy.
6. Module declares maximum tolerated lateness.
7. Scheduler validates registration.
8. Scheduler persists scheduled job metadata.
9. Scheduler creates expected run windows.
10. Scheduler starts run at scheduled time.
11. Job run carries correlation ID and causation ID.
12. Job run writes start/end status.
13. Missed-run detector checks expected run windows.
14. Critical missed run emits alert and audit event.

### Rules

1. Critical jobs must have missed-run detection.
2. Jobs must be idempotent.
3. Jobs must be safe to retry.
4. Job execution must propagate correlation IDs.
5. Scheduler status must be visible to readiness/monitoring where Critical.

### Failure Behaviour

| Failure | Result |
|---|---|
| Job registration invalid | Module activation blocked |
| Critical scheduled job missed | Critical alert |
| Duplicate job run | Idempotent no-op or safe rejection |
| Job fails after max retries | Dead-letter / incident |
| Correlation missing | Job rejected or generated with trace event |

---

## 10. WF-FND-09 Background Job Queue Lifecycle

### Trigger

A module enqueues background work.

### Steps

1. Caller creates job payload reference.
2. Caller attaches correlation ID and causation ID.
3. Caller attaches source entity/event reference.
4. Job is persisted in queue/job table.
5. Worker claims job with lock.
6. Worker executes idempotently.
7. Worker emits audit/log events using same correlation ID.
8. Worker marks job completed, retry_scheduled, or dead_letter.
9. Dead-letter creates alert according to severity.
10. Remediation is recorded.

### Rules

1. Queue messages must be durable.
2. Queue jobs must be idempotent.
3. Worker restart must not duplicate side effects.
4. Retry policy must be explicit.
5. Dead-letter must be visible and auditable.
6. Sensitive payload should be referenced, not stored inline.

---

## 11. WF-FND-10 Rate-Limit Decision

### Trigger

API request reaches gateway or backend rate-limit check.

### Steps

1. Determine actor/IP/client/action scope.
2. Check applicable rate-limit rule.
3. Allow, throttle, or block.
4. Return standard `RATE_LIMITED` error if throttled.
5. Emit metric and security event where suspicious.

### Rules

1. Gateway may enforce first layer.
2. Backend must provide decision/handoff baseline for sensitive actions.
3. Rate limit failures must not leak account existence.
4. Rate-limit rules must be configurable and audit-tracked in later CFG module.

---

## 9. State Transition Summary

| Workflow | States |
|---|---|
| Startup | initialising → validating → ready / failed |
| Request | received → validated → authorised → processed → responded / rejected |
| Module registration | declared → validated → registered → active / blocked |
| Health check | unknown → healthy / degraded / failed |
| Deployment smoke | pending → running → passed / failed |
| Config drift | scheduled → compared → no_drift / drift_detected / critical_drift |
| Incident | detected → triaged → contained → resolved → reviewed |
| Scheduler | registered → scheduled → running → completed / failed / missed |
| Job queue | queued → claimed → running → completed / retry_scheduled / dead_letter |
| Rate limit | unchecked → allowed / throttled / blocked |
