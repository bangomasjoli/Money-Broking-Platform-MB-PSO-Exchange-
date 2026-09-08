# IAM-01 Authentication / MFA / Session  
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | IAM-01 |
| Module name | Authentication / MFA / Session |
| Pack version | v1.0 |
| Status | Initial module blueprint for review |
| Platform | AIX Money Broking Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | IAM / Security |
| Depends on | FND-01 Platform Foundation v1.2 |
| Blocks | IAM-02 RBAC / Permission Guard / SoD; all protected modules |

Base documents:
- 00_Licence_Scope_And_Feature_Lock_v1.3.md
- 01_Project_Charter_v1.3.md
- 02_Software_Requirement_Specification_v1.2.md
- 03_Master_Module_Index_v1.2.md
- 04_Role_And_Permission_Matrix_v1.2.md
- 05_Master_Workflow_Map_v1.2.md
- 06_Master_System_Rules_v1.2.md
- 07_Master_Data_Flow_v1.2.md
- 08_Master_Technical_Architecture_v1.2.md
- 09_Master_Security_Architecture_v1.2.md
- 10_Master_Testing_Strategy_v1.2.md
- 11_Master_Deployment_Strategy_v1.2.md
- FND-01_Platform_Foundation_Blueprint_Pack_v1.2.zip


---

## 2. Module Purpose

IAM-01 provides the authentication foundation for the platform.

It defines:

1. User login.
2. Password authentication.
3. MFA enrolment and verification.
4. Privileged phishing-resistant MFA requirement.
5. Session creation and revocation.
6. Refresh token rotation.
7. Password reset.
8. MFA reset.
9. New device / new location detection.
10. Login notification.
11. Account lockout and progressive delay.
12. Service-account authentication baseline.
13. Authentication audit events.
14. Authentication security monitoring.
15. Authentication data classification and retention.

---

## 3. In Scope

IAM-01 covers:

1. Staff login.
2. Admin login.
3. Client login.
4. Password hashing and verification.
5. Password reset token flow.
6. MFA enrolment.
7. MFA challenge and verification.
8. MFA reset workflow.
9. Phishing-resistant MFA requirement for privileged roles.
10. Session issuance.
11. Session validation.
12. Session expiry.
13. Session revocation.
14. Refresh token rotation.
15. Active session invalidation after high-risk events.
16. Account lockout/progressive delay.
17. New-device/new-location detection.
18. Login security notification.
19. Service account identity validation.
20. Authentication audit logs.
21. Authentication-related rate-limit interface usage.

---

## 4. Out of Scope

IAM-01 does not implement:

1. RBAC permission decisions.
2. Maker-checker decision engine.
3. SoD conflict matrix.
4. Client onboarding/KYC/KYB.
5. AML, STR, sanctions, Travel Rule, wallet screening.
6. Ledger, balance, settlement, reconciliation.
7. Trading, LP execution, OTC/RFQ.
8. Feature flag administration.
9. Licence lock administration.
10. Staff impersonation / support-view execution controls beyond authentication markers.
11. Full break-glass workflow beyond authentication support hooks.
12. Public exchange access.

These are separate modules.

---

## 5. Critical Principles

### 5.1 Authentication Is Not Authorization

IAM-01 proves identity and session validity only.

It must not grant business permissions by itself.

Authorization belongs to IAM-02.

### 5.2 Backend Source of Truth

Login, MFA, session validation, session revocation, and token refresh must be enforced on the backend.

Frontend session state is not trusted.

### 5.3 Fail Closed

Authentication fails closed when:

1. Password verification fails.
2. MFA required but missing.
3. MFA verification fails.
4. Session token invalid.
5. Session revoked.
6. Refresh token reused.
7. Account locked.
8. User suspended/frozen where downstream status is known.
9. Time source unavailable for token expiry.
10. Authentication audit/outbox cannot be written for sensitive auth actions.

### 5.4 MFA by Risk

MFA requirements:

1. Staff MFA required.
2. Admin/Super Admin/Security/Tech privileged MFA required.
3. Phishing-resistant MFA is required for privileged roles before production unless formally risk accepted.
4. Client MFA or step-up MFA required for sensitive flows where configured.
5. MFA reset requires maker-checker in IAM-02 or equivalent approval workflow.
6. SMS-only MFA is not sufficient for privileged roles.

### 5.5 Session Security

Sessions must be:

1. Short-lived or revocable.
2. Bound to device/session metadata where feasible.
3. Invalidated after password reset.
4. Invalidated after MFA reset.
5. Invalidated after account freeze/suspension where applicable.
6. Invalidated or revalidated after role/permission change.
7. Logged out on suspicious activity where required.

### 5.6 No Secrets in Logs

IAM-01 must never log:

1. Plaintext passwords.
2. Password hash material beyond safe metadata.
3. OTP/MFA codes.
4. MFA seed/secrets.
5. Recovery codes.
6. Session tokens.
7. Refresh tokens.
8. Password reset tokens.
9. API keys.
10. Full device fingerprint where sensitive.

---

## 6. Users / Actors

| Actor | IAM-01 Use |
|---|---|
| Client User | Login, MFA, session, password reset |
| Client Approver | Login, stronger MFA/step-up support |
| Staff User | Login, MFA, session |
| Admin / Super Admin | Privileged login, phishing-resistant MFA |
| Security Admin | MFA reset review, auth event monitoring |
| Tech Admin | Auth operations support, no credential viewing |
| Service Account | Non-human authentication |
| System Job | Session cleanup, token cleanup |
| Auditor | Auth evidence read-only |

---

## 7. Dependencies

### 7.1 Upstream

1. FND-01 request context.
2. FND-01 audit/outbox baseline.
3. FND-01 rate-limit interface.
4. FND-01 standard API/error envelope.
5. FND-01 server UTC time service.
6. FND-01 module registry.
7. FND-01 DB isolation baseline.

### 7.2 Downstream

1. IAM-02 RBAC / Permission Guard / SoD.
2. SEC-01 Audit Log / Security Monitoring.
3. CFG-01 Feature Flag / Licence Lock.
4. Client onboarding.
5. Staff/admin/client portals.
6. All protected modules.

---

## 8. Components

| Component | Description |
|---|---|
| Auth Service | Login, credential verification, session issuance |
| Credential Store | Password hash and credential metadata |
| Password Policy Engine | Password rules and reset handling |
| MFA Service | Enrolment, challenge, verification, reset support |
| MFA Secret Store | Field-level encrypted MFA secrets |
| Session Service | Access/refresh token lifecycle |
| Refresh Token Store | Rotation and reuse detection |
| Device Registry | Known device/session metadata |
| Login Risk Engine | New-device/new-location/rate-limit signals |
| Account Lockout Engine | Progressive delay and lockout |
| Notification Handoff | New login/password/MFA notification |
| Service Account Auth | Non-human identity validation |
| Auth Audit Publisher | Auth event emission using FND envelope |
| Token Cleanup Job | Expired token/session cleanup |
| Security Monitoring Hook | Auth anomaly alerts |

---

## 9. Functional Requirements

### IAM-FR-001 Login

The platform shall authenticate users using approved credentials and issue a session only after all required checks pass.

### IAM-FR-002 Password Hashing

The platform shall store passwords using approved adaptive hashing such as Argon2id or bcrypt.

### IAM-FR-003 Password Reset

The platform shall support secure password reset using short-lived, single-use reset token.

### IAM-FR-004 MFA Enrolment

The platform shall support MFA enrolment for users required to use MFA.

### IAM-FR-005 MFA Verification

The platform shall verify MFA challenge before creating or elevating a session where required.

### IAM-FR-006 Privileged MFA

The platform shall require phishing-resistant MFA for privileged users before production unless formally risk accepted.

### IAM-FR-007 Session Issuance

The platform shall issue short-lived or revocable sessions after successful authentication.

### IAM-FR-008 Session Revocation

The platform shall revoke sessions after password reset, MFA reset, account lock, account suspension/freeze, or security event.

### IAM-FR-009 Refresh Token Rotation

The platform shall rotate refresh tokens and detect refresh token reuse.

### IAM-FR-010 Account Lockout

The platform shall apply progressive delay and/or lockout after repeated failed login attempts.

### IAM-FR-011 New Device / Location

The platform shall detect new device/location login and trigger notification and/or step-up where required.

### IAM-FR-012 Login Notification

The platform shall notify users for important authentication events using minimised payload.

### IAM-FR-013 Service Account Authentication

The platform shall support non-human service-account authentication with scoped credentials and rotation.

### IAM-FR-014 Auth Audit Events

The platform shall emit audit events for authentication and credential lifecycle actions.

### IAM-FR-015 Token Cleanup

The platform shall clean expired tokens/sessions through scheduled job.

### IAM-FR-016 Rate-Limit Integration

The platform shall use the FND rate-limit interface for login, password reset, MFA, OTP, token refresh, and recovery flows.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Password storage | Argon2id or bcrypt, no plaintext |
| MFA secrets | Field-level encrypted |
| Token storage | Hashed or opaque reference only |
| Session tokens in logs | Prohibited |
| Refresh-token reuse detection | Required |
| MFA reset audit | Required |
| Auth event correlation ID | Required |
| Login rate limiting | Required |
| New-device notification | Required |
| Privileged phishing-resistant MFA | Required before production unless risk accepted |
| Account lockout DoS awareness | Required |
| Auth availability | To be defined in deployment SLO |
| Time source | Server UTC via FND |
| Data residency | Approved before production |

---

## 11. Prohibited Behaviours

IAM-01 must not allow:

1. Plaintext password storage.
2. Plaintext MFA seed storage.
3. OTP/MFA code logging.
4. Session/refresh token logging.
5. Refresh token reuse.
6. Login without required MFA.
7. Privileged role access without privileged MFA where required.
8. MFA reset without approval.
9. Password reset token reuse.
10. Account enumeration through error messages.
11. Service account interactive login.
12. Human use of service account credentials.
13. Authentication bypass by feature flag.
14. Exchange-lock bypass.
15. Direct permission grant.
16. Direct ledger/balance access.

---

## 12. Acceptance Criteria

IAM-01 is accepted only if:

1. Login flow works for approved user.
2. Invalid login fails safely.
3. Passwords are adaptively hashed.
4. Password reset token is single-use and short-lived.
5. MFA enrolment and verification work.
6. MFA secrets are field-level encrypted.
7. Privileged MFA requirement is enforceable.
8. Session expiry/revocation works.
9. Refresh token rotation and reuse detection work.
10. Account lockout/progressive delay works.
11. New-device/new-location notification works.
12. Rate limiting works.
13. Auth events are audited.
14. Sensitive values are not logged.
15. Service account identity is non-human and scoped.
16. Token cleanup scheduled job works.
17. Permission decisions are not made inside IAM-01.
18. Test suite passes.

---

## 13. Open Items

1. Final password hashing algorithm and parameters.
2. Final MFA provider/type.
3. FIDO2/WebAuthn rollout approach.
4. Final session timeout.
5. Final refresh token lifetime.
6. Final lockout/progressive delay thresholds.
7. Final new-device/new-location detection method.
8. Final auth notification templates.
9. Final service-account credential method.
10. Final account recovery policy.
11. Final token storage strategy.
12. Final MFA recovery-code strategy.
