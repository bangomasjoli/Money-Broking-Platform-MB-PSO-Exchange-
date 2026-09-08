# IAM-01 Authentication / MFA / Session  
## 08 Audit Log Events

## 1. Audit Principles

IAM-01 audit events must use the FND audit envelope and transaction-coupled audit/outbox contract.

No event may contain passwords, OTPs, MFA secrets, session tokens, refresh tokens, or reset tokens.

---

## 2. Required Events

| Event Type | Trigger | Severity |
|---|---|---|
| `iam.login_success` | Successful login | Medium |
| `iam.login_failed` | Failed login | Medium/High |
| `iam.login_rate_limited` | Login throttled | High |
| `iam.mfa_challenge_created` | MFA challenge | Medium |
| `iam.mfa_challenge_passed` | MFA success | Medium |
| `iam.mfa_challenge_failed` | MFA failure | High |
| `iam.mfa_enrolled` | MFA factor active | High |
| `iam.mfa_reset_requested` | MFA reset request | High |
| `iam.mfa_reset_approved` | MFA reset approved | High |
| `iam.mfa_reset_completed` | MFA reset completed | High |
| `iam.password_reset_requested` | Password reset request | Medium |
| `iam.password_reset_completed` | Password reset complete | High |
| `iam.session_created` | Session created | Medium |
| `iam.session_refreshed` | Session refreshed | Low/Medium |
| `iam.session_revoked` | Session revoked | Medium |
| `iam.refresh_reuse_detected` | Refresh token reuse | Critical |
| `iam.account_locked` | Account locked | High |
| `iam.account_unlocked` | Account unlocked | High |
| `iam.new_device_login` | New device/location | High |
| `iam.login_notification_sent` | Notification sent | Low |
| `iam.service_account_validated` | Service account auth | Medium |
| `iam.service_account_rotated` | Credential rotation | High |
| `iam.privileged_mfa_missing` | Privileged MFA missing | Critical/High |
| `iam.sensitive_read` | Sensitive auth metadata read | Medium |

---

## 3. Required Metadata

Events should include safe metadata:

1. user_id.
2. user_type.
3. session_id reference where applicable.
4. device_id reference.
5. source_ip_hash.
6. result.
7. reason code.
8. correlation_id.
9. causation_id where async.
10. server UTC time.
11. notification reference where applicable.

---

## 4. Prohibited Metadata

Never include:

1. Plaintext password.
2. Password hash.
3. MFA code.
4. MFA seed.
5. Recovery code.
6. Reset token.
7. Session token.
8. Refresh token.
9. Full IP if not required.
10. Full device fingerprint.

---

## 5. Alert Events

Critical alerts:

1. Refresh token reuse.
2. Privileged MFA missing.
3. Brute force attack pattern.
4. MFA reset abuse.
5. Service account misuse.
6. Human use of service account.
7. Auth audit/outbox failure.
