# IAM-01 Authentication / MFA / Session  
## 13 Reconciliation Design

## 1. Purpose

IAM-01 reconciliation ensures authentication state is internally consistent and expired/high-risk credentials do not remain usable.

---

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| Active sessions | `iam.session` | token validation cache/store | Detect stale active tokens |
| Refresh token family | `iam.refresh_token` | session state | Detect orphaned active refresh tokens |
| MFA factor | `iam.mfa_factor` | user MFA policy | Detect user missing required MFA |
| Password reset tokens | `iam.password_reset_token` | expiry/status | Detect expired active tokens |
| Lockout records | `iam.account_lockout` | user status | Detect stale locks |
| Service accounts | `iam.service_account` | KMS/vault refs | Detect expired or unrotated credentials |
| Auth events | auth action | SEC-01 audit event ref | Detect missing authoritative audit |
| Device registry | sessions | device records | Detect orphaned device references |
| Step-up assertions | session/account status | assertion status | Invalidate stale assertions |
| Session policy | user class | active sessions | Detect TTL/reauth policy breach |
| Freeze revocation | freeze events | session/refresh status | Detect sessions not revoked |
| Session anomalies | request metadata | session binding | Detect hijack signals |
| Concurrent sessions | session table | session policy | Detect over-limit sessions |
| Password policy | new password | history/breached source | Detect reuse/breached passwords |

---

## 3. Scheduled Jobs

IAM-01 scheduled jobs:

1. Expired session cleanup.
2. Expired refresh token cleanup.
3. Expired password reset token cleanup.
4. Stale lockout cleanup.
5. Privileged MFA compliance check.
6. Service account credential expiry check.
7. Missing auth audit reconciliation.
8. Step-up assertion expiry/revocation cleanup.
9. Session policy compliance check.
10. Freeze/suspension session revocation reconciliation.
11. Concurrent-session limit reconciliation.

All jobs inherit FND scheduler missed-run detection.

---

## 4. Reconciliation Tests

1. Expired session cannot be used.
2. Expired reset token marked expired.
3. Revoked MFA factor not usable.
4. Privileged user missing MFA appears in report.
5. Service account nearing expiry alerts.
6. Auth action without audit is detected.
7. Token family reuse revokes all related tokens.


---

## 5. Freeze / Session Revocation Reconciliation

Steps:

1. Read freeze/suspension events.
2. Identify affected users/sessions.
3. Verify active sessions are revoked.
4. Verify refresh tokens are denied/revoked.
5. Verify step-up assertions are invalidated.
6. Alert if any active session remains.

---

## 6. Session Policy Reconciliation

Steps:

1. Load session policy by user class.
2. Compare active sessions to TTL/idle/reauth/concurrent-session policy.
3. Flag privileged sessions exceeding policy.
4. Revoke or require step-up according to policy.

---

## 7. Auth Event Authority Reconciliation

Rules:

1. SEC-01 audit store is authoritative.
2. `iam.auth_event` is local non-authoritative index only.
3. Missing SEC-01 audit ref for sensitive auth action is Critical.
