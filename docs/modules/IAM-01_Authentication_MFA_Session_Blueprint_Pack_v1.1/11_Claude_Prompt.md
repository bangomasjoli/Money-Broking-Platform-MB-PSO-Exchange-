# IAM-01 Authentication / MFA / Session  
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this IAM-01 Authentication / MFA / Session Blueprint Pack v1.1 as a principal fintech platform architect, regulated fintech security architect, authentication architect, and QA reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending.
- MVP supports institutional and HNWI/professional clients only.
- Retail onboarding is disabled by default.
- FND-01 Platform Foundation v1.1 is accepted and must be inherited.
- IAM-01 covers login, password, MFA, step-up authentication/recent-auth assertions, session, refresh token, freeze/suspension session revocation, account lockout, per-user-class session policy, access-token binding, mid-session anomaly detection, concurrent-session/global logout, new-device/new-location notification, service-account authentication, authentication audit, and auth data security.
- IAM-01 must not implement RBAC/business authorization, KYC, AML, ledger, trading, settlement, or Exchange features.
- AIX spread markup, principal dealing, market making, internal matching, client-to-client matching, public order book, matching engine, and public exchange trading are blocked.

Review for:
1. Missing authentication controls.
2. Missing password hashing/reset controls.
3. Missing MFA enrolment, verification, reset, or privileged phishing-resistant MFA controls.
4. Missing session, refresh-token, revocation, token-reuse, freeze/suspension revocation, or active-session invalidation controls.
5. Missing account-lockout/progressive-delay controls.
6. Missing new-device/new-location notification or step-up/recent-auth assertion controls.
7. Missing service-account identity controls.
8. Missing per-user-class session policy, privileged re-auth, concurrent-session limit, or global logout controls.
9. Missing access-token binding, session hijack, or mid-session anomaly controls.
10. Missing password-history, breached-password, or password policy controls.
11. Missing audit/outbox transaction-coupling controls.
12. Missing data classification, field-level encryption, or log-scrubbing controls.
13. Missing API, DB, workflow, state-machine, permission, risk, test, or go-live controls.
14. Any IAM feature that could accidentally make authorization decisions, bypass RBAC/SoD, enable Exchange functionality, or expose credentials/tokens.
15. Any conflict with master docs 00–11 or accepted FND-01.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional IAM-01 requirements or parameters to add.
```

## Claude Sonnet Coding Prompt

Do not use this until Claude Opus accepts the blueprint.

```txt
Implement IAM-01 Authentication / MFA / Session only.

Do not implement:
- RBAC permission engine.
- Maker-checker engine.
- Client onboarding/KYC.
- AML/STR/Travel Rule.
- Trading/ledger/settlement.
- Exchange features.

Implement:
- Login.
- Password hashing.
- Password reset.
- MFA enrolment/verification/reset request.
- Privileged MFA enforcement hooks.
- Session issuance/revocation.
- Refresh token rotation/reuse detection.
- Account lockout/progressive delay.
- New-device/new-location notification hook.
- Service account validation.
- Auth audit events.
- Auth test cases.

Follow accepted FND-01 v1.1 patterns.
```
