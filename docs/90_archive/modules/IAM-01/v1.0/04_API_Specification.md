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

## 3. Admin / Internal APIs

### 3.1 POST `/internal/auth/session/revoke`

Purpose: revoke sessions due to security/admin event.

Auth: internal service / authorised admin via IAM-02.

### 3.2 GET `/internal/auth/users/{user_id}/auth-status`

Purpose: read auth status metadata.

Auth: Security Admin / authorised admin.

### 3.3 POST `/internal/auth/service-account/validate`

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

---

## 5. Security Rules

1. Never return password hash.
2. Never return MFA secret after enrolment setup.
3. Never return refresh token except issuance/rotation response.
4. Never log credential/token fields.
5. Always use server UTC for expiry.
6. Always emit auth audit event for sensitive flows.
