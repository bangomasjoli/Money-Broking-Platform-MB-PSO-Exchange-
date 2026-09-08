# IAM-01 Authentication / MFA / Session  
## 07 Permission Rules

## 1. Principle

IAM-01 handles authentication actions but does not decide business authorization.

Administrative IAM-01 actions must be protected by IAM-02 when IAM-02 is implemented.

---

## 2. Permissions

| Permission | Description | Candidate Roles |
|---|---|---|
| `iam.auth.login` | Login attempt | Public/user |
| `iam.auth.logout` | Logout own session | Authenticated user |
| `iam.session.read_own` | Read own sessions | Authenticated user |
| `iam.session.revoke_own` | Revoke own session | Authenticated user |
| `iam.session.revoke_all_own` | Global logout own sessions | Authenticated user |
| `iam.password_reset.request` | Request reset | Public/user |
| `iam.password_reset.confirm` | Confirm reset | Public/user |
| `iam.mfa.enroll_own` | Enrol own MFA | Authenticated user |
| `iam.mfa.reset_request_own` | Request own MFA reset | Authenticated user |
| `iam.step_up.start_own` | Start own step-up challenge | Authenticated user |
| `iam.step_up.verify_own` | Verify own step-up challenge | Authenticated user |
| `iam.step_up.verify_assertion` | Verify recent-auth assertion | Internal service only |
| `iam.auth_status.read` | Read auth metadata | Security Admin / authorised Admin |
| `iam.session.revoke_any` | Revoke user sessions | Security Admin / authorised Admin |
| `iam.session.revoke_frozen_user` | Revoke sessions due to freeze/suspension | Approved internal service / Security Admin |
| `iam.session_policy.read` | Read session policy | Security Admin / Auditor |
| `iam.session_policy.manage` | Manage session policy | Security Admin + approval |
| `iam.mfa.reset_admin` | Admin-initiate MFA reset | Security Admin with maker-checker or IAM-01 interim dual approval |
| `iam.account.unlock` | Unlock account | Security Admin with approval where required |
| `iam.service_account.read` | Read service account metadata | Tech Admin / Security Admin |
| `iam.service_account.manage` | Manage service-account status | Tech Admin + Security approval |
| `iam.auth_event.read` | Read auth event metadata | Security Admin / Auditor |

---

## 3. Maker-Checker Requirements

Maker-checker or equivalent approval required for:

1. MFA reset by staff/admin.
2. Account unlock for privileged user.
3. Service account creation.
4. Service account credential rotation.
5. Privileged MFA risk acceptance.
6. Bulk session revocation.
7. Auth policy threshold changes.
8. Session policy changes.
9. Admin/staff-initiated MFA reset before IAM-02 using interim approval.

---

## 4. SoD Rules

1. User cannot approve own MFA reset where maker-checker applies.
2. Admin cannot approve own MFA reset.
3. Service account creator cannot approve same service account activation.
4. Security risk acceptance maker cannot approve own request.
5. No human may authenticate as service account.

---

## 5. Sensitive Read Logging

Sensitive read logging required for:

1. Auth status of another user.
2. MFA factor metadata.
3. Session metadata of another user.
4. Account lockout data.
5. Service account metadata.
6. Auth event metadata.

---

## 6. Prohibited Permissions

The following must not exist:

```txt
iam.view_plaintext_password
iam.view_plaintext_mfa_secret
iam.view_session_token
iam.view_refresh_token
iam.bypass_mfa
iam.bypass_password_check
iam.bypass_lockout
iam.create_session_without_auth
iam.login_as_service_account_human
iam.grant_business_permission
iam.enable_exchange_access
iam.admin_mfa_reset_without_approval
iam.bypass_step_up
iam.refresh_frozen_user_session
iam.disable_session_anomaly_detection
iam.unlimited_privileged_sessions
```
