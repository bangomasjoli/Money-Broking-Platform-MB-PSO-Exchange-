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

## 5. WF-IAM01-04 Step-Up Authentication

### Trigger

A downstream module or IAM-01 sensitive action requires recent authentication.

Examples:

1. Withdrawal approval.
2. Payout-destination creation or change.
3. High-value trade confirmation.
4. MFA reset.
5. Privileged admin action.
6. Service/security-sensitive action.

### Steps

1. Caller requests step-up requirement or verifies recent-auth assertion.
2. IAM-01 checks current session validity.
3. IAM-01 checks account/freeze/suspension status.
4. IAM-01 checks session anomaly status.
5. IAM-01 determines required auth strength.
6. IAM-01 creates step-up challenge.
7. User verifies password/MFA/WebAuthn as required.
8. IAM-01 issues short-lived recent-auth assertion bound to session, device, user, and purpose/action scope.
9. Downstream module verifies assertion before action.
10. Audit event emitted.

### Rules

1. Assertion must be short-lived.
2. Assertion must be bound to session and device.
3. Assertion cannot be reused outside its purpose/action scope where scoped.
4. Assertion invalidates on freeze/suspension, session revocation, password reset, or MFA reset.
5. Failed step-up counts toward risk/lockout policy.

---

## 6. WF-IAM01-04 Password Reset

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

## 7. WF-IAM01-05 Session Refresh

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

## 8. WF-IAM01-06 Session Revocation

### Trigger

Logout, password reset, MFA reset, suspicious activity, admin action, account freeze/suspension, or role change.

### Steps

1. Identify session(s).
2. Mark session revoked.
3. Revoke refresh token family where required.
4. Emit audit event.
5. Notify user where required.

---

## 9. WF-IAM01-07 MFA Reset

### Trigger

User requests MFA reset or admin initiates reset.

### Steps

1. Verify identity.
2. Create MFA reset request.
3. If IAM-02 is live, require IAM-02 maker-checker approval; if IAM-02 is not live, require IAM-01 interim dual Security Admin approval or keep admin/staff-initiated MFA reset disabled.
4. Invalidate existing MFA device/secret only after approval.
5. Revoke active sessions.
6. Require re-enrolment.
7. Audit event emitted.
8. Notify user.

### Rules

1. MFA reset is high-risk.
2. Admin/staff-initiated MFA reset without approval is prohibited before IAM-02.
3. Self-service MFA reset requires step-up/re-verification according to policy.
2. Self-approval prohibited.
3. Reset without audit is prohibited.

---

## 10. WF-IAM01-08 Account Lockout / Progressive Delay

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

## 11. WF-IAM01-09 New Device / New Location

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

## 12. WF-IAM01-10 Service Account Authentication

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


---

## 13. WF-IAM01-11 Freeze / Suspension Session Revocation

### Trigger

Freeze/suspension event received from compliance/client/operations module, or status check detects frozen/suspended user.

### Steps

1. Receive event with user/client reference and correlation ID.
2. Validate event source.
3. Identify active sessions.
4. Revoke active sessions.
5. Revoke refresh token families where required.
6. Invalidate step-up assertions.
7. Deny future token refresh.
8. Emit audit/security event.
9. Notify relevant user/operations where policy permits.

### Token Refresh Rule

Every token refresh must re-check account status. Frozen/suspended user refresh is denied.

---

## 14. WF-IAM01-12 Mid-Session Anomaly / Session Hijack Response

### Trigger

Active access token is used from materially changed device/IP/user-agent/risk profile.

### Steps

1. Compare request device/session metadata with session binding.
2. Classify anomaly level.
3. For low/medium risk, require step-up.
4. For high risk, revoke session and refresh token family.
5. Emit audit/security event.
6. Notify user where configured.

---

## 15. WF-IAM01-13 Global Logout / Concurrent Session Enforcement

### Trigger

User requests logout all, admin/security revokes all, or max concurrent session policy exceeded.

### Steps

1. Identify user sessions.
2. Apply user-class concurrent-session policy.
3. Revoke excess or selected sessions.
4. Revoke refresh token families where required.
5. Emit audit event.
6. Notify user where configured.

Rules:

1. Privileged users have stricter concurrent-session policy.
2. Service accounts follow separate non-interactive session policy.
