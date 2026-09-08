# IAM-01 Authentication / MFA / Session  
## 02 Workflow

## 1. Workflow Scope

This document defines authentication and session workflows.

---

## 2. WF-IAM01-01 User Login

### Trigger

User submits login request.

### Steps

1. FND request context created.
2. Rate-limit check performed.
3. User identifier normalised.
4. Credential record located without account enumeration.
5. Password verified.
6. Account status checked.
7. Lockout/progressive-delay checked.
8. MFA requirement determined.
9. MFA challenge issued if required.
10. Session issued only after required MFA passes.
11. Device/session metadata recorded.
12. Login notification triggered where required.
13. Audit event emitted.

### Failure

| Failure | Result |
|---|---|
| Invalid credential | Generic login failure |
| Rate-limit exceeded | `AUTH_RATE_LIMITED` |
| Account locked | Generic failure or safe lock message |
| MFA required | Challenge pending |
| MFA failure | Deny and increment failure |
| Audit/outbox failure | Sensitive action fails closed |

---

## 3. WF-IAM01-02 MFA Enrolment

### Trigger

User or admin flow starts MFA enrolment.

### Steps

1. Verify authenticated session.
2. Verify enrolment permission or policy.
3. Generate MFA secret/challenge.
4. Store MFA secret field-level encrypted.
5. User verifies first MFA code or device assertion.
6. Mark MFA enrolled.
7. Generate recovery codes where approved.
8. Store recovery codes hashed/encrypted.
9. Audit event emitted.

### Rules

1. MFA secret is never logged.
2. Recovery codes are shown once.
3. Privileged users require approved phishing-resistant MFA where configured.
4. Enrolment cannot bypass maker-checker for admin-forced reset flows.

---

## 4. WF-IAM01-03 MFA Challenge

### Trigger

Login or step-up requires MFA.

### Steps

1. Create MFA challenge.
2. Set short challenge expiry.
3. Send challenge or prompt device assertion.
4. Verify response.
5. Mark challenge passed/failed.
6. On pass, continue login/session elevation.
7. On fail, increment counter.
8. Audit event emitted.

---

## 5. WF-IAM01-04 Password Reset

### Trigger

User requests password reset.

### Steps

1. Accept identifier without account enumeration.
2. Rate-limit request.
3. Generate single-use reset token if account eligible.
4. Store reset token hashed.
5. Send reset notification with minimised payload.
6. User submits token and new password.
7. Verify token, expiry, and unused status.
8. Validate password policy.
9. Store new password hash.
10. Mark token used.
11. Revoke active sessions.
12. Trigger login notification.
13. Audit event emitted.

---

## 6. WF-IAM01-05 Session Refresh

### Trigger

Client presents refresh token.

### Steps

1. Validate refresh token hash/reference.
2. Check session status.
3. Detect token reuse.
4. Rotate refresh token.
5. Issue new access token/session reference.
6. Revoke old refresh token.
7. Audit event emitted where sensitive.

### Reuse Detection

If reused token detected:

1. Revoke token family.
2. Revoke active sessions.
3. Create security alert.
4. Require re-authentication.

---

## 7. WF-IAM01-06 Session Revocation

### Trigger

Logout, password reset, MFA reset, suspicious activity, admin action, account freeze/suspension, or role change.

### Steps

1. Identify session(s).
2. Mark session revoked.
3. Revoke refresh token family where required.
4. Emit audit event.
5. Notify user where required.

---

## 8. WF-IAM01-07 MFA Reset

### Trigger

User requests MFA reset or admin initiates reset.

### Steps

1. Verify identity.
2. Create MFA reset request.
3. Require approval via IAM-02 maker-checker where applicable.
4. Invalidate existing MFA device/secret only after approval.
5. Revoke active sessions.
6. Require re-enrolment.
7. Audit event emitted.
8. Notify user.

### Rules

1. MFA reset is high-risk.
2. Self-approval prohibited.
3. Reset without audit is prohibited.

---

## 9. WF-IAM01-08 Account Lockout / Progressive Delay

### Trigger

Failed login/MFA/reset attempts.

### Steps

1. Count failed attempts by user/IP/device/action.
2. Apply progressive delay or lockout.
3. Avoid account enumeration.
4. Allow approved unlock/recovery path.
5. Audit/security event emitted.
6. Alert if attack pattern detected.

### DoS Control

Lockout policy must consider malicious lockout attack and allow safe recovery.

---

## 10. WF-IAM01-09 New Device / New Location

### Trigger

Successful login from new device/location or suspicious signal.

### Steps

1. Compare device/session metadata.
2. Classify risk.
3. Trigger notification.
4. Require step-up where configured.
5. Record known device if approved.
6. Audit event emitted.

---

## 11. WF-IAM01-10 Service Account Authentication

### Trigger

Internal service calls protected endpoint.

### Steps

1. Validate service credential/workload identity.
2. Confirm service account is active.
3. Confirm scope.
4. Confirm rotation status.
5. Create service auth context.
6. Audit event emitted where sensitive.

Rules:

1. Service accounts cannot be used for human login.
2. Service scopes are least privilege.
3. Service credentials must be rotated.
