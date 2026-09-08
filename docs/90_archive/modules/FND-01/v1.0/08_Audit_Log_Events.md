# FND-01 Platform Foundation  
## 08 Audit Log Events

## 1. Audit Principles

FND-01 must emit audit events for foundation-sensitive operations.

Audit events must use the standard audit envelope defined by the platform.

---

## 2. Standard Event Envelope

```json
{
  "event_type": "foundation.event_name",
  "event_id": "evt_...",
  "request_id": "req_...",
  "correlation_id": "corr_...",
  "actor_id": "user_or_service",
  "actor_type": "user|service|system",
  "actor_role": "TECH_ADMIN",
  "entity_type": "foundation_entity",
  "entity_id": "entity_id",
  "action": "action_name",
  "result": "success|failure|blocked",
  "reason": "safe reason",
  "occurred_at_utc": "2026-01-01T00:00:00Z",
  "metadata": {}
}
```

Rules:

1. No secrets.
2. No OTP.
3. No session tokens.
4. No full sensitive config values.
5. No STR or business-sensitive payloads.
6. Use IDs/references where possible.

---

## 3. Required Events

| Event Type | Trigger | Severity |
|---|---|---|
| `foundation.application_started` | Application startup success | Low |
| `foundation.application_start_failed` | Startup failure | High/Critical |
| `foundation.readiness_failed` | Readiness fails | High |
| `foundation.module_registered` | Module registered | Medium |
| `foundation.module_activation_blocked` | Module activation blocked | High |
| `foundation.exchange_module_detected` | Future-locked runtime detected | Critical |
| `foundation.smoke_test_started` | Smoke test start | Low |
| `foundation.smoke_test_passed` | Smoke passed | Low |
| `foundation.smoke_test_failed` | Smoke failed | High/Critical |
| `foundation.config_drift_detected` | Drift detected | Medium/High |
| `foundation.critical_config_drift_detected` | Critical drift | Critical |
| `foundation.config_drift_resolved` | Drift resolved | Medium |
| `foundation.time_source_unhealthy` | Time/NTP unhealthy | High |
| `foundation.module_boundary_violation` | Boundary violation detected | Critical |
| `foundation.outbox_dead_letter` | Outbox dead letter | High/Critical |
| `foundation.idempotency_conflict` | Idempotency fingerprint mismatch | High |
| `foundation.sensitive_read` | Sensitive foundation evidence read | Medium |
| `foundation.deployment_probe_run` | Deployment probe/smoke | Low |
| `foundation.production_access_check_failed` | Prod access check fails | Critical |

---

## 4. Audit Event Requirements

### 4.1 Startup

Startup events must include:

1. environment.
2. release_id.
3. artifact_hash.
4. module count.
5. status.

### 4.2 Smoke Test

Smoke events must include:

1. smoke_test_id.
2. release_id.
3. environment.
4. check count.
5. failed critical checks.
6. evidence reference.

### 4.3 Config Drift

Drift events must include:

1. run_id.
2. drift level.
3. config key reference.
4. expected hash/reference.
5. actual hash/reference.
6. owner.

### 4.4 Module Boundary

Boundary violation events must include:

1. source module.
2. target module/schema.
3. violation type.
4. detection method.
5. blocked status.

---

## 5. Audit Tests

1. All required events emitted.
2. Sensitive events do not log secrets.
3. Failed startup emits audit/system event.
4. Critical config drift emits Critical alert.
5. Exchange module detection emits Critical alert.
6. Smoke-test evidence is linked.
7. Sensitive read is meta-audited.
