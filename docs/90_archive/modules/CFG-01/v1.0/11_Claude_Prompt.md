# CFG-01 Feature Flag / Licence Lock  
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this CFG-01 Feature Flag / Licence Lock Blueprint Pack v1.0 as a principal fintech platform architect, regulated fintech compliance architect, licence-scope control reviewer, feature flag architect, and security governance reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending and all Exchange features are locked.
- No public order book.
- No matching engine.
- No client-to-client matching.
- No market making.
- No principal dealing.
- No AIX spread markup.
- Retail onboarding is disabled by default.
- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 Audit Log / Security Monitoring accepted v1.2.
- CFG-01 becomes the authoritative licence-lock source of truth.
- IAM-02 and SEC-01 interim sealed licence-lock lists must hand off to CFG-01.
- CFG-01 must not implement authentication, RBAC, audit store, KYC, AML, ledger, trading, settlement, or Exchange features.

Review for:
1. Missing licence-lock source-of-truth controls.
2. Missing prohibited feature hard-block controls.
3. Missing runtime feature evaluation controls.
4. Missing Exchange-pending lock controls.
5. Missing IAM-02 permission/maker-checker/SoD integration.
6. Missing SEC-01 audit/security monitoring integration.
7. Missing deployment gate controls.
8. Missing kill-switch controls.
9. Missing cache/version/decision-token controls.
10. Missing interim handoff from IAM-02/SEC-01 sealed lists.
11. Missing feature drift/reconciliation controls.
12. Missing client-class/environment constraints.
13. Any path that allows Super Admin, break-glass, user override, temporary permission, service account, or deployment to bypass licence lock.
14. Any path that allows prohibited features to be treated as normal flags.
15. Any conflict with master docs 00–11, FND-01, IAM-01, IAM-02, or SEC-01.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional CFG-01 requirements or parameters to add.
```
