# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening Blueprint Pack v1.0 as a principal fintech platform architect, regulated fintech AML/CFT architect, sanctions-screening control reviewer, Travel Rule reviewer, STR/tipping-off reviewer, and security governance reviewer.

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
- KYC-01 KYC/KYB Verification accepted v1.2.
- AML-01 provides screening outcomes required by CLT-01 and EDD triggers consumed by KYC-01.
- AML-01 must not implement KYC/KYB verification, ledger, settlement, trading, wallet screening, payout whitelist, or Exchange features.

Review for:
1. Missing sanctions/PEP/adverse-media/watchlist screening controls.
2. Missing KYC pass vs AML clear boundary controls.
3. Missing handoff-vs-outcome separation.
4. Missing list/provider version and screening evidence controls.
5. Missing match-scoring and false-positive/true-hit decision controls.
6. Missing sanctions true-hit hard-block controls.
7. Missing ongoing rescreening/list-update controls.
8. Missing outcome publication to CLT-01 controls.
9. Missing EDD/remediation trigger to KYC-01 controls.
10. Missing Travel Rule data validation and screening controls.
11. Missing STR/suspicion and tipping-off protection controls.
12. Missing vendor/list source authenticity and payload integrity controls.
13. Missing sensitive read/export and data-protection controls.
14. Any path that allows AML clear with unresolved match, stale screening, missing list version, missing Travel Rule data, vendor spoofing, manual override, Super Admin, break-glass, service account, or direct DB edit.
15. Any path that lets AML clear grant trading/deposit/withdrawal/Exchange access.
16. Any conflict with master docs 00–11, FND-01, IAM-01, IAM-02, SEC-01, CFG-01, CLT-01 or KYC-01.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional AML-01 requirements or parameters to add.
```
