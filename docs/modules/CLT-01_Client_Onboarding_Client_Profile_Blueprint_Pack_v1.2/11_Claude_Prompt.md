# CLT-01 Client Onboarding / Client Profile
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this CLT-01 Client Onboarding / Client Profile Blueprint Pack v1.2 as a principal fintech platform architect, regulated fintech compliance architect, onboarding/KYC control reviewer, client mandate control reviewer, and security governance reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending and all Exchange features are locked.
- Retail onboarding is disabled by default.
- MVP supports institutional, HNWI, professional or approved non-retail client classes only.
- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 Audit Log / Security Monitoring accepted v1.2.
- CFG-01 Feature Flag / Licence Lock accepted v1.2.
- CLT-01 must not implement KYC/KYB, AML, wallet screening, payout whitelist, ledger, trading, settlement, or Exchange features.
- CLT-01 creates client applications/profiles and controls onboarding lifecycle/mandate only.

Review for:
1. Missing client-class / retail-lock controls.
2. Missing CDD/screening/risk outcome gating controls.
2. Missing CFG-01 licence/feature gate controls.
3. Missing final onboarding maker-checker/SoD controls.
4. Missing status-based downstream access controls.
5. Missing handoff delivery vs outcome separation and failure handling.
6. Missing authorised-party, UBO, director, controller and signatory screening controls.
7. Missing client mandate / authorised-user controls.
7. Missing client-side dual authorisation setup controls.
8. Missing duplicate detection, verified-identity uniqueness and related-party graph controls.
9. Missing ongoing monitoring / downstream-to-CLT status feedback controls.
10. Missing sensitive read/export and data-protection controls.
10. Missing SEC-01 audit events.
11. Missing IAM-02 protected-action and approval integration.
12. Any path that lets onboarding approval grant trading, deposit, withdrawal, Exchange access, or bypass KYC/AML.
13. Any path that allows Super Admin, break-glass, service account, direct DB edit, or client-class override to bypass licence/KYC/AML/client-class controls.
14. Any conflict with master docs 00–11, FND-01, IAM-01, IAM-02, SEC-01, or CFG-01.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional CLT-01 requirements or parameters to add.
```

## Final Verification Note

CLT-01 v1.2 is accepted / final verified.

v1.1 resolved all 5 critical gaps and all 6 recommended corrections from Claude Opus review. v1.2 is a cosmetic placement/index cleanup release only with no substantive control change.

CLT-01 is the first accepted business-tier module and now feeds outcome-gated handoffs to KYC/KYB, AML/sanctions, risk, wallet/payout, and trading-eligibility consumers.
