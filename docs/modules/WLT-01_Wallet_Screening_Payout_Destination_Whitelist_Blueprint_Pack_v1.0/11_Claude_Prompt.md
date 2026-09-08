# WLT-01 Wallet Screening / Payout Destination Whitelist
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this WLT-01 Wallet Screening / Payout Destination Whitelist Blueprint Pack v1.0 as a principal fintech platform architect, regulated fintech AML/CFT architect, payment/digital-asset destination-control reviewer, Travel Rule reviewer, fund-flow control reviewer, and security governance reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending and all Exchange features are locked.
- AIX is not providing custody wallet service in this module.
- No private keys, transaction signing, ledger posting, settlement or payment execution is owned by WLT-01.
- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 Audit Log / Security Monitoring accepted v1.2.
- CFG-01 Feature Flag / Licence Lock accepted v1.2.
- CLT-01 Client Onboarding / Client Profile accepted v1.2.
- KYC-01 KYC/KYB Verification accepted v1.2.
- AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening accepted v1.2.
- WLT-01 provides destination eligibility/whitelist outcomes to payout/withdrawal/settlement/deposit modules.
- WLT-01 must consume AML-01 pre-transaction sanctions gate and Travel Rule support.
- WLT-01 must not execute transfers, sign blockchain transactions, post ledger entries, or move funds/assets.

Review for:
1. Missing wallet screening controls.
2. Missing payout destination/beneficiary verification controls.
3. Missing destination whitelist approval/cooling-off controls.
4. Missing client-side dual authorisation / IAM-02 maker-checker controls.
5. Missing AML-01 pre-transaction gate integration.
6. Missing Travel Rule data handling controls.
7. Missing destination decision-token scope/freshness controls.
8. Missing immediate revocation/propagation controls.
9. Missing ongoing rescreening controls.
10. Missing vendor/source authenticity and payload integrity controls.
11. Missing hosted/unhosted wallet/proof-of-control controls.
12. Missing beneficiary mismatch/third-party payout controls.
13. Missing sensitive read/export and data-protection controls.
14. Any path that allows destination use with stale AML decision, revoked destination, cooling-off active, scope mismatch, high-risk wallet, beneficiary mismatch, missing Travel Rule data, Super Admin, break-glass, service account, direct DB edit, or stale vendor result.
15. Any path that lets WLT-01 execute payment, settlement, wallet signing, ledger posting, trading, or Exchange features.
16. Any conflict with master docs 00–11, FND-01, IAM-01, IAM-02, SEC-01, CFG-01, CLT-01, KYC-01 or AML-01.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional WLT-01 requirements or parameters to add.
```
