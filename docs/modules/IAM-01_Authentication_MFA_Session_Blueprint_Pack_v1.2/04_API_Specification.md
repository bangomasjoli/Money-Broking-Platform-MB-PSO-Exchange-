# IAM-01 Authentication / MFA / Session  
## 04 API Specification

## 1. API Scope

IAM-01 APIs cover authentication, MFA, sessions, password reset, device/session metadata, and service-account auth.

All APIs inherit FND standard envelope, request context, audit/outbox, log-scrubbing, rate-limit, and error format.

---

## 2. Public / User APIs

### 2.1 POST `/auth/login`

Request:

```json
{
  "identifier": "user@example.com",
  "password": "not_logged",
  "device": {
    "device_id": "dev_...",
    "device_name": "Chrome on macOS"
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "status": "mfa_required",
    "challenge_id": "mfa_chal_..."
  }
}
```

or

```json
{
  "success": true,
  "data": {
    "status": "authenticated",
    "access_token": "returned_once",
    "refresh_token": "returned_once",
    "expires_at_utc": "2026-01-01T00:15:00Z"
  }
}
```

Rules:

1. Do not disclose whether user exists.
2. Password is never logged.
3. Rate limit applies.
4. MFA required where policy says so.
5. Audit event emitted.

### 2.2 POST `/auth/mfa/challenge/verify`

Request:

```json
{
  "challenge_id": "mfa_chal_...",
  "code_or_assertion": "not_logged"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "status": "authenticated",
    "access_token": "returned_once",
    "refresh_token": "returned_once"
  }
}
```

### 2.3 POST `/auth/password-reset/request`

Request:

```json
{
  "identifier": "user@example.com"
}
```

Response always generic:

```json
{
  "success": true,
  "data": {
    "status": "if_eligible_notification_sent"
  }
}
```

### 2.4 POST `/auth/password-reset/confirm`

Request:

```json
{
  "reset_token": "not_logged",
  "new_password": "not_logged"
}
```

Rules:

1. Token single-use.
2. Token short-lived.
3. New password policy enforced.
4. Active sessions revoked.

### 2.5 POST `/auth/refresh`

Request:

```json
{
  "refresh_token": "not_logged"
}
```

Rules:

1. Refresh token rotated on use.
2. Reuse detection revokes token family.
3. Token never logged.

### 2.6 POST `/auth/logout`

Request:

```json
{
  "session_id": "current"
}
```

Result:

```json
{
  "success": true,
  "data": {
    "status": "revoked"
  }
}
```

### 2.7 GET `/auth/sessions`

Purpose: list own active sessions.

Auth: authenticated user.

### 2.8 DELETE `/auth/sessions/{session_id}`

Purpose: revoke own session.

Auth: authenticated user.

### 2.9 POST `/auth/mfa/enroll/start`

Purpose: start MFA enrolment.

Auth: authenticated user.

### 2.10 POST `/auth/mfa/enroll/verify`

Purpose: verify MFA enrolment.

Auth: authenticated user.

### 2.11 POST `/auth/mfa/reset/request`

Purpose: request MFA reset.

Auth: authenticated user or controlled recovery process.

---

### 2.12 POST `/auth/step-up/start`

Purpose: start step-up authentication for sensitive action.

Auth: authenticated user.

Request:

```json
{
  "purpose": "withdrawal_approval",
  "action_scope": "withdrawal:wdr_...",
  "required_level": "mfa_or_webauthn"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "challenge_id": "step_chal_...",
    "challenge_type": "step_up",
    "expires_at_utc": "2026-01-01T00:05:00Z"
  }
}
```

### 2.13 POST `/auth/step-up/verify`

Purpose: verify step-up challenge and issue recent-auth assertion.

Auth: authenticated user.

Request:

```json
{
  "challenge_id": "step_chal_...",
  "code_or_assertion": "not_logged"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "recent_auth_assertion": "returned_once_or_reference",
    "auth_level": "mfa",
    "purpose": "withdrawal_approval",
    "expires_at_utc": "2026-01-01T00:10:00Z"
  }
}
```

### 2.14 POST `/auth/step-up/verify-assertion`

Purpose: downstream module verifies recent-auth assertion.

Auth: internal service.

Request:

```json
{
  "recent_auth_assertion": "not_logged_or_reference",
  "required_purpose": "withdrawal_approval",
  "session_id": "sess_..."
}
```

Response:

```json
{
  "success": true,
  "data": {
    "valid": true,
    "user_id": "user_...",
    "auth_level": "mfa",
    "fresh_until_utc": "2026-01-01T00:10:00Z"
  }
}
```

### 2.15 POST `/auth/logout-all`

Purpose: revoke all own sessions.

Auth: authenticated user with step-up where required.

--- 

## 3. Admin / Internal APIs

### 3.1 POST `/internal/auth/session/revoke`

Purpose: revoke sessions due to security/admin event.

Auth: internal service / authorised admin via IAM-02.

### 3.2 GET `/internal/auth/users/{user_id}/auth-status`

Purpose: read auth status metadata.

Auth: Security Admin / authorised admin.

### 3.3 POST `/internal/auth/freeze-event`

Purpose: receive account freeze/suspension revocation event.

Auth: approved internal service.

Request:

```json
{
  "user_id": "user_...",
  "client_id": "client_...",
  "event_type": "account_frozen",
  "source_module": "CMP",
  "reason_ref": "case_...",
  "correlation_id": "corr_..."
}
```

Rules:

1. Event source must be verified.
2. Active sessions must be revoked.
3. Refresh must be denied after freeze.

### 3.4 POST `/internal/auth/session/revoke-all`

Purpose: revoke all sessions for a user due to admin/security/compliance event.

Auth: Security Admin / approved internal service.

### 3.5 POST `/internal/auth/service-account/validate`

Purpose: validate internal non-human service account context.

Auth: internal.

---

## 4. Standard Error Codes

| Code | Meaning |
|---|---|
| `AUTH_INVALID_CREDENTIALS` | Generic invalid login |
| `AUTH_MFA_REQUIRED` | MFA required |
| `AUTH_MFA_FAILED` | MFA verification failed |
| `AUTH_MFA_ENROLMENT_REQUIRED` | MFA setup required |
| `AUTH_SESSION_EXPIRED` | Session expired |
| `AUTH_SESSION_REVOKED` | Session revoked |
| `AUTH_REFRESH_REUSE_DETECTED` | Refresh token reuse detected |
| `AUTH_ACCOUNT_LOCKED` | Account locked |
| `AUTH_RATE_LIMITED` | Rate limit applied |
| `AUTH_PASSWORD_POLICY_FAILED` | Password policy failed |
| `AUTH_RESET_TOKEN_INVALID` | Reset token invalid/expired/used |
| `AUTH_PRIVILEGED_MFA_REQUIRED` | Privileged MFA required |
| `AUTH_SERVICE_ACCOUNT_INVALID` | Service account invalid |
| `AUTH_AUDIT_REQUIRED` | Required audit/outbox failed |
| `AUTH_STEP_UP_REQUIRED` | Step-up required |
| `AUTH_STEP_UP_FAILED` | Step-up verification failed |
| `AUTH_RECENT_AUTH_INVALID` | Recent-auth assertion invalid/expired |
| `AUTH_MFA_RESET_APPROVAL_REQUIRED` | MFA reset requires approval |
| `AUTH_ACCOUNT_FROZEN` | Account frozen/suspended |
| `AUTH_SESSION_ANOMALY` | Mid-session anomaly detected |
| `AUTH_CONCURRENT_SESSION_LIMIT` | Concurrent-session limit reached |
| `AUTH_BREACHED_PASSWORD` | Password appears in breached list |
| `AUTH_PASSWORD_REUSE_BLOCKED` | Password history reuse blocked |

---

## 5. Security Rules

1. Never return password hash.
2. Never return MFA secret after enrolment setup.
3. Never return refresh token except issuance/rotation response.
4. Never log credential/token fields.
5. Always use server UTC for expiry.
6. Always emit auth audit event for sensitive flows.
7. Step-up assertions are short-lived and scoped.
8. Refresh token requests re-check account/freeze status.
9. Access-token anomaly triggers step-up or revoke.
10. Downstream sensitive modules verify recent-auth assertions via IAM-01.
