# SEC-01 Audit Log / Security Monitoring  
## 10 Test Cases

## 1. Audit Ingestion Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| SEC1-TC-001 | Valid event ingested | Stored with audit ref | Critical |
| SEC1-TC-002 | Missing mandatory field | Rejected | Critical |
| SEC1-TC-003 | Unknown event type for sensitive action | Rejected + alert | Critical |
| SEC1-TC-004 | Duplicate same idempotency payload | Idempotent success | High |
| SEC1-TC-005 | Duplicate event different payload | Conflict/error | Critical |
| SEC1-TC-006 | Business module direct DB write attempt | Blocked | Critical |
| SEC1-TC-007 | Metadata contains secret/token | Rejected/redacted | Critical |

---

## 2. Hash Chain / Integrity Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| SEC1-TC-008 | Event hash generated | Hash stored | Critical |
| SEC1-TC-009 | Previous hash linked | Chain valid | Critical |
| SEC1-TC-010 | Sequence gap introduced | Critical alert | Critical |
| SEC1-TC-011 | Event modified/tampered | Hash mismatch alert | Critical |
| SEC1-TC-012 | Batch seal generated | Seal stored | High |
| SEC1-TC-013 | Integrity verification pass | Pass recorded | High |
| SEC1-TC-014 | Integrity verification fail | Critical alert | Critical |

---

## 3. Audit Failure Fail-Closed Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| SEC1-TC-015 | Sensitive action audit persist fails | Action blocked | Critical |
| SEC1-TC-016 | Sensitive action outbox enqueue fails | Action blocked | Critical |
| SEC1-TC-017 | Non-sensitive event temporary failure | Retry queued if safe | Medium |
| SEC1-TC-018 | Repeated ingestion failures | Alert created | High |

---

## 4. Security Monitoring Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| SEC1-TC-019 | Failed login spike | Alert created | High |
| SEC1-TC-020 | MFA reset abuse | Critical/High alert | Critical |
| SEC1-TC-021 | Permission escalation | Alert created | Critical |
| SEC1-TC-022 | Self-approval attempt | Critical alert | Critical |
| SEC1-TC-023 | SoD conflict event | Alert created | Critical |
| SEC1-TC-024 | Break-glass activation | Critical alert | Critical |
| SEC1-TC-025 | Licence-locked permission attempt | Critical alert | Critical |
| SEC1-TC-026 | Audit hash mismatch | Critical alert | Critical |
| SEC1-TC-027 | Production privileged access | Alert/evidence created | Critical |
| SEC1-TC-028 | Service account anomaly | Alert created | High |

---

## 5. Alert Lifecycle Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| SEC1-TC-029 | Alert created | Status open | High |
| SEC1-TC-030 | Alert assigned | Status assigned | Medium |
| SEC1-TC-031 | Alert triaged | Triage note recorded | Medium |
| SEC1-TC-032 | Alert closed without reason | Blocked | High |
| SEC1-TC-033 | Critical alert closed without approval where required | Blocked | Critical |
| SEC1-TC-034 | Alert escalated to incident | Incident handoff created | High |

---

## 6. Audit Read / Export Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| SEC1-TC-035 | Authorised normal audit read | Allowed | High |
| SEC1-TC-036 | Unauthorised audit read | Denied | Critical |
| SEC1-TC-037 | Sensitive audit read | Read logged | Critical |
| SEC1-TC-038 | Sensitive read log fails | Read denied | Critical |
| SEC1-TC-039 | Evidence export requested | Export request created | High |
| SEC1-TC-040 | Sensitive export without approval | Blocked | Critical |
| SEC1-TC-041 | Export generated | Manifest/package hash stored | High |
| SEC1-TC-042 | Export downloaded | Download logged | High |
| SEC1-TC-043 | Export scope exceeds permission | Blocked | Critical |

---

## 7. Interim Handoff / Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| SEC1-TC-044 | IAM-01 local event matched to SEC-01 | Reconciled | High |
| SEC1-TC-045 | IAM-02 local event matched to SEC-01 | Reconciled | High |
| SEC1-TC-046 | Sensitive interim event missing | Critical alert | Critical |
| SEC1-TC-047 | Outbox event missing from SEC-01 | Reconciliation finding | Critical |
| SEC1-TC-048 | Duplicate handoff event | Idempotent | Medium |

---

## 8. Retention / Correction Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| SEC1-TC-049 | Audit correction created | Append-only correction event | Critical |
| SEC1-TC-050 | Attempt to modify original event | Blocked | Critical |
| SEC1-TC-051 | Attempt to delete audit event | Blocked | Critical |
| SEC1-TC-052 | Archive before retention period | Blocked | Critical |
| SEC1-TC-053 | Archive blocked by legal hold | Blocked | High |
| SEC1-TC-054 | Archive eligible event | Archived with verification metadata | Medium |

---

## 9. Permission / SoD Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| SEC1-TC-055 | Audit admin tries to modify own audit trail | Blocked | Critical |
| SEC1-TC-056 | Evidence requester approves own export | Blocked | Critical |
| SEC1-TC-057 | Service account approves export | Blocked | Critical |
| SEC1-TC-058 | Monitoring rule change without approval | Blocked | Critical |
| SEC1-TC-059 | Critical event schema change without approval | Blocked | Critical |
| SEC1-TC-060 | Sensitive audit export requires step-up | Step-up required | High |

---

## 10. Go-Live Criteria

```txt
audit_ingestion_tests_passed = true
hash_chain_tests_passed = true
integrity_verification_tests_passed = true
audit_failure_fail_closed_tests_passed = true
security_monitoring_tests_passed = true
alert_lifecycle_tests_passed = true
sensitive_read_tests_passed = true
evidence_export_tests_passed = true
interim_handoff_tests_passed = true
retention_correction_tests_passed = true
permission_sod_tests_passed = true
critical_control_coverage = 100_percent
```
