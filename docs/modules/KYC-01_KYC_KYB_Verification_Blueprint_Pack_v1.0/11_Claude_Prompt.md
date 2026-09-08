# KYC-01 KYC / KYB Verification
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this KYC-01 KYC / KYB Verification Blueprint Pack v1.0 as a principal fintech platform architect, regulated fintech AML/CFT architect, customer due diligence control reviewer, KYB/UBO reviewer, and security governance reviewer.

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
- CLT-01 Client Onboarding / Client Profile accepted v1.2.
- KYC-01 provides the KYC/KYB CDD outcome that CLT-01 final approval depends on.
- KYC-01 must not implement sanctions/PEP/adverse media, transaction monitoring, wallet screening, payout whitelist, ledger, trading, settlement or Exchange features.

Review for:
1. Missing KYC/KYB CDD outcome controls.
2. Missing handoff-vs-outcome separation.
3. Missing individual identity verification controls.
4. Missing entity/KYB legal existence controls.
5. Missing UBO/controller identification and verification controls.
6. Missing authorised-party verification controls.
7. Missing document checklist/evidence integrity controls.
8. Missing EDD routing and approval controls.
9. Missing maker-checker/SoD for manual decisions.
10. Missing vendor-result authenticity and payload-integrity controls.
11. Missing periodic review/stale outcome controls.
12. Missing outcome publication integrity to CLT-01.
13. Missing sensitive read/export and data protection controls.
14. Any path that allows CDD pass with missing documents, missing UBOs, failed verification, stale outcome, manual override, Super Admin, break-glass, service account, or direct DB edit.
15. Any path that lets KYC pass grant trading/deposit/withdrawal/Exchange access.
16. Any conflict with master docs 00–11, FND-01, IAM-01, IAM-02, SEC-01, CFG-01 or CLT-01.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional KYC-01 requirements or parameters to add.
```
