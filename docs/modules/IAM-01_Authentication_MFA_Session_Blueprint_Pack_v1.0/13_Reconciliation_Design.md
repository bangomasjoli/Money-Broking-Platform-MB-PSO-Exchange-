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
| Auth events | auth action | audit event ref | Detect missing audit |
| Device registry | sessions | device records | Detect orphaned device references |

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
