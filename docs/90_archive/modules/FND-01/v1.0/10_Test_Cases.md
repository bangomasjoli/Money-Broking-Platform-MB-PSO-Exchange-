# FND-01 Platform Foundation  
## 10 Test Cases

## 1. Test Scope

These tests verify foundation readiness before regulated modules are built.

---

## 2. Startup and Configuration Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| FND-TC-001 | Application starts with valid config | Ready | Critical |
| FND-TC-002 | Missing critical config | Startup fails | Critical |
| FND-TC-003 | Unknown environment | Startup fails | Critical |
| FND-TC-004 | Missing database | Startup fails/readiness failed | Critical |
| FND-TC-005 | Missing KMS/vault in production | Startup fails/readiness failed | Critical |
| FND-TC-006 | Licence-lock interface unavailable in production | Fail closed | Critical |
| FND-TC-007 | Feature-flag interface unavailable | Fail closed | High |
| FND-TC-008 | Critical config drift detected | Alert/block | Critical |

---

## 3. Request Context Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| FND-TC-009 | Request ID generated | Present | High |
| FND-TC-010 | Correlation ID propagated | Present across logs/events | High |
| FND-TC-011 | Server UTC timestamp generated | Present | High |
| FND-TC-012 | Missing tenant scope for scoped endpoint | Blocked | Critical |
| FND-TC-013 | Client-supplied client_id conflicts with session | Server-derived scope wins / blocked | Critical |
| FND-TC-014 | Request context appears in audit event | Present | High |

---

## 4. API Envelope Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| FND-TC-015 | Standard success response | Correct envelope | Medium |
| FND-TC-016 | Standard error response | Correct envelope | Medium |
| FND-TC-017 | Error response contains stack trace | Not present | Critical |
| FND-TC-018 | Error response missing correlation ID | Fail test | High |
| FND-TC-019 | Sensitive vendor/internal detail in response | Not present | Critical |

---

## 5. Health / Readiness / Version Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| FND-TC-020 | Health endpoint when process alive | Alive | High |
| FND-TC-021 | Readiness endpoint all dependencies pass | Ready | Critical |
| FND-TC-022 | Readiness endpoint DB failure | Not ready | Critical |
| FND-TC-023 | Readiness endpoint time-source failure | Not ready / degraded fail closed | High |
| FND-TC-024 | Version endpoint shows artifact hash | Present | High |
| FND-TC-025 | Version hash mismatches deployment artifact | Deployment blocked | Critical |

---

## 6. Module Registry and Boundary Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| FND-TC-026 | Register valid module | Registered | High |
| FND-TC-027 | Module dependency missing | Activation blocked | Critical |
| FND-TC-028 | Future-locked Exchange module active in MVP | Blocked | Critical |
| FND-TC-029 | Module owner missing | Activation blocked | High |
| FND-TC-030 | Cross-module direct schema access | Test fails / blocked | Critical |
| FND-TC-031 | Ledger schema accessed by non-ledger module | Blocked | Critical |
| FND-TC-032 | Compliance schema modified by non-compliance module | Blocked | Critical |

---

## 7. Time Service Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| FND-TC-033 | Server UTC returned | Valid UTC | High |
| FND-TC-034 | Client-provided time used for decision | Not used | Critical |
| FND-TC-035 | NTP/clock drift beyond threshold | Alert/fail closed where critical | High |
| FND-TC-036 | Quote/hold expiry uses time service in dependent test | Server UTC used | Critical |

---

## 8. Audit / Outbox / Idempotency Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| FND-TC-037 | Audit envelope generated | Valid envelope | High |
| FND-TC-038 | Audit event contains secret | Fail/block | Critical |
| FND-TC-039 | Outbox event created | Pending event | High |
| FND-TC-040 | Outbox retry | Safe retry | High |
| FND-TC-041 | Outbox dead-letter | Alert | High |
| FND-TC-042 | Idempotency same key/same fingerprint | Safe replay | High |
| FND-TC-043 | Idempotency same key/different fingerprint | Rejected | Critical |

---

## 9. Observability and Log-Scrubbing Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| FND-TC-044 | Structured log generated | Contains request/correlation ID | High |
| FND-TC-045 | Password/OTP/token in log | Scrubbed / fail test | Critical |
| FND-TC-046 | Full PII in log | Scrubbed / fail test | Critical |
| FND-TC-047 | STR-like sensitive payload in log | Scrubbed / fail test | Critical |
| FND-TC-048 | Metrics emitted | Visible | Medium |
| FND-TC-049 | Trace emitted | Correlation visible | Medium |

---

## 10. Deployment Smoke Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| FND-TC-050 | Pre-deploy smoke | Passed | Critical |
| FND-TC-051 | Post-deploy smoke | Passed | Critical |
| FND-TC-052 | Smoke detects Exchange component | Critical fail | Critical |
| FND-TC-053 | Smoke detects feature flag drift | Fail/block | Critical |
| FND-TC-054 | Smoke evidence stored | Evidence link | High |
| FND-TC-055 | Smoke with insufficient permission | Blocked | High |

---

## 11. Permission Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| FND-TC-056 | Auditor reads evidence | Allowed read-only | Medium |
| FND-TC-057 | Auditor runs smoke test | Blocked | High |
| FND-TC-058 | Admin activates module without permission | Blocked | High |
| FND-TC-059 | Tech Admin bypasses licence lock | Blocked | Critical |
| FND-TC-060 | System job performs human approval | Blocked | Critical |

---

## 12. Go-Live Criteria

FND-01 passes only when:

```txt
critical_tests_passed = 100_percent
module_boundary_tests_passed = true
exchange_component_absence_verified = true
request_context_tests_passed = true
health_readiness_tests_passed = true
audit_outbox_idempotency_baseline_tests_passed = true
log_scrubbing_tests_passed = true
deployment_smoke_tests_passed = true
```
