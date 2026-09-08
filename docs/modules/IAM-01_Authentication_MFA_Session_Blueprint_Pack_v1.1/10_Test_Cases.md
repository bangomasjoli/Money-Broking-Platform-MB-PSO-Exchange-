# IAM-01 Authentication / MFA / Session  
## 10 Test Cases

## 1. Login Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM1-TC-001 | Valid username/password without MFA requirement | Session issued | Critical |
| IAM1-TC-002 | Invalid password | Generic failure | Critical |
| IAM1-TC-003 | Unknown username | Generic failure, no enumeration | Critical |
| IAM1-TC-004 | Login rate limit exceeded | Throttled | Critical |
| IAM1-TC-005 | Locked account login | Blocked | Critical |
| IAM1-TC-006 | Suspended/deactivated user login | Blocked | Critical |
| IAM1-TC-007 | Login audit event emitted | Audit present | High |
| IAM1-TC-008 | Password appears in logs | Fail/block | Critical |

---

## 2. Password and Reset Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM1-TC-009 | Password stored | Adaptive hash only | Critical |
| IAM1-TC-010 | Weak password reset | Rejected | High |
| IAM1-TC-011 | Password reset request for real user | Generic response | High |
| IAM1-TC-012 | Password reset request for unknown user | Same generic response | Critical |
| IAM1-TC-013 | Reset token reuse | Blocked | Critical |
| IAM1-TC-014 | Expired reset token | Blocked | High |
| IAM1-TC-015 | Password reset revokes sessions | Sessions revoked | Critical |
| IAM1-TC-016 | Reset token appears in logs | Fail/block | Critical |

---

## 3. MFA Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM1-TC-017 | MFA enrolment | Factor active after verification | Critical |
| IAM1-TC-018 | MFA secret storage | Field-level encrypted | Critical |
| IAM1-TC-019 | Login requiring MFA | Challenge issued | Critical |
| IAM1-TC-020 | Correct MFA | Session issued | Critical |
| IAM1-TC-021 | Incorrect MFA | Blocked/counter increment | Critical |
| IAM1-TC-022 | Expired MFA challenge | Blocked | High |
| IAM1-TC-023 | Privileged user without phishing-resistant MFA | Blocked or risk accepted | Critical |
| IAM1-TC-024 | SMS-only MFA for privileged production role | Blocked or risk accepted | Critical |
| IAM1-TC-025 | MFA reset without approval | Blocked | Critical |
| IAM1-TC-026 | MFA reset revokes sessions | Sessions revoked | Critical |
| IAM1-TC-027 | MFA code/secret appears in logs | Fail/block | Critical |

---

## 4. Session and Token Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM1-TC-028 | Session expiry | Re-auth required | Critical |
| IAM1-TC-029 | Logout | Session revoked | High |
| IAM1-TC-030 | Revoked session used | Blocked | Critical |
| IAM1-TC-031 | Refresh token rotation | New token issued, old marked used | Critical |
| IAM1-TC-032 | Refresh token reuse | Token family revoked + alert | Critical |
| IAM1-TC-033 | Token after password reset | Blocked | Critical |
| IAM1-TC-034 | Token after MFA reset | Blocked | Critical |
| IAM1-TC-035 | Token after role/permission change | Revalidated/revoked | High |
| IAM1-TC-036 | Session token appears in logs | Fail/block | Critical |

---

## 5. Lockout / Device / Notification Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM1-TC-037 | Multiple failed logins | Progressive delay/lockout | Critical |
| IAM1-TC-038 | Lockout DoS scenario | Safe recovery path | High |
| IAM1-TC-039 | New device login | Notification/step-up | High |
| IAM1-TC-040 | New location login | Notification/step-up | High |
| IAM1-TC-041 | Notification payload contains password/token | Blocked | Critical |
| IAM1-TC-042 | Notification avoids unnecessary PII | Pass | High |

---

## 6. Service Account Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM1-TC-043 | Valid service account | Service auth context | Critical |
| IAM1-TC-044 | Disabled service account | Blocked | Critical |
| IAM1-TC-045 | Expired service credential | Blocked | Critical |
| IAM1-TC-046 | Human interactive login as service account | Blocked | Critical |
| IAM1-TC-047 | Service scope exceeded | Blocked | Critical |
| IAM1-TC-048 | Service credential rotation | Rotation audited | High |

---

## 7. Audit / Data Protection Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM1-TC-049 | Auth audit/outbox unavailable for sensitive action | Action fails closed | Critical |
| IAM1-TC-050 | Auth event includes correlation ID | Present | High |
| IAM1-TC-051 | Sensitive auth metadata read | Sensitive read audit | High |
| IAM1-TC-052 | Cross-user session read | Denied | Critical |
| IAM1-TC-053 | IAM runtime role reads non-IAM schema | Denied | Critical |
| IAM1-TC-054 | Non-IAM role reads IAM credential table | Denied | Critical |

---

## 8. Step-Up Authentication Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM1-TC-055 | Start step-up for sensitive action | Challenge issued | Critical |
| IAM1-TC-056 | Verify step-up successfully | Recent-auth assertion issued | Critical |
| IAM1-TC-057 | Use expired recent-auth assertion | Blocked | Critical |
| IAM1-TC-058 | Use assertion for wrong action scope | Blocked | Critical |
| IAM1-TC-059 | Downstream module verifies assertion | Valid only if fresh/session-bound | Critical |
| IAM1-TC-060 | MFA reset without step-up | Blocked | Critical |

---

## 9. Freeze / Suspension Revocation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM1-TC-061 | Freeze event received for active user | Active sessions revoked | Critical |
| IAM1-TC-062 | Frozen user uses access token mid-session | Blocked after revocation/status check | Critical |
| IAM1-TC-063 | Frozen user refreshes token | Denied | Critical |
| IAM1-TC-064 | Freeze invalidates step-up assertion | Assertion invalid | Critical |
| IAM1-TC-065 | Freeze revocation audit event | Present | High |

---

## 10. Session Policy / Hijack / Concurrent Session Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM1-TC-066 | Admin session TTL policy | Shorter than staff/client | Critical |
| IAM1-TC-067 | Privileged re-auth interval reached | Step-up/re-auth required | Critical |
| IAM1-TC-068 | Client session follows client policy | Correct TTL/idle timeout | High |
| IAM1-TC-069 | Access token replay from different device/IP | Step-up or revoke | Critical |
| IAM1-TC-070 | High-risk session anomaly | Session + token family revoked | Critical |
| IAM1-TC-071 | Privileged concurrent-session limit exceeded | Excess/new session blocked or old revoked | Critical |
| IAM1-TC-072 | User global logout | All sessions revoked | High |
| IAM1-TC-073 | Admin/security revoke all sessions | All target sessions revoked and audited | High |

---

## 11. Password Policy and Additional Rate-Limit Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM1-TC-074 | Password history reuse | Blocked | High |
| IAM1-TC-075 | Breached password detected | Blocked | High |
| IAM1-TC-076 | MFA verify rate limit exceeded | Throttled | Critical |
| IAM1-TC-077 | Token refresh rate limit exceeded | Throttled | High |
| IAM1-TC-078 | Password policy minimum length | Enforced | High |

---

## 12. Auth Event Authority Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| IAM1-TC-079 | `iam.auth_event` exists without SEC-01 audit ref | Critical defect / blocked |
| IAM1-TC-080 | Conflict between local auth_event and SEC-01 audit | SEC-01 audit authoritative |
| IAM1-TC-081 | Sensitive auth action without central audit | Fails closed / Critical defect |

---

## 13. Go-Live Criteria

```txt
login_tests_passed = true
password_reset_tests_passed = true
mfa_tests_passed = true
privileged_mfa_tests_passed = true
session_revocation_tests_passed = true
refresh_token_reuse_tests_passed = true
lockout_tests_passed = true
new_device_notification_tests_passed = true
service_account_tests_passed = true
auth_audit_tests_passed = true
no_secret_logging_tests_passed = true
db_isolation_tests_passed = true
step_up_tests_passed = true
freeze_revocation_tests_passed = true
session_policy_tests_passed = true
session_anomaly_tests_passed = true
concurrent_session_tests_passed = true
password_history_breached_password_tests_passed = true
mfa_verify_refresh_rate_limit_tests_passed = true
auth_event_authority_tests_passed = true
```
