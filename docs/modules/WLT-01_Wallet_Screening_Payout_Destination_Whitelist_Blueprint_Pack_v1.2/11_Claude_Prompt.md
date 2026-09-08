# WLT-01 Wallet Screening / Payout Destination Whitelist
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this WLT-01 Wallet Screening / Payout Destination Whitelist Blueprint Pack v1.2 as a principal fintech platform architect, regulated fintech AML/CFT architect, payment/digital-asset destination-control reviewer, Travel Rule reviewer, fund-flow control reviewer, and security governance reviewer.

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
7. Missing destination decision-token execution-time revalidation/scope/freshness/revocation-epoch controls.
8. Missing value/velocity/first-use limit controls.
9. Missing inbound deposit-source screening/quarantine controls.
10. Missing immediate revocation/propagation controls.
11. Missing ongoing rescreening controls.
12. Missing vendor/source authenticity, supported-chain coverage and payload integrity controls.
13. Missing hosted/unhosted wallet/proof-of-control and own-name binding controls.
14. Missing beneficiary mismatch/third-party payout controls.
15. Missing crypto address canonicalisation/name-service/address-poisoning controls.
16. Missing AML outcome revocation subscription controls.
17. Missing cooling-off new-risk cancellation controls.
18. Missing sensitive read/export and data-protection controls.
19. Any path that allows destination use with stale AML decision, revoked destination, cooling-off active, scope mismatch, high-risk wallet, beneficiary mismatch, missing Travel Rule data, Super Admin, break-glass, service account, direct DB edit, or stale vendor result.
20. Any path that lets WLT-01 execute payment, settlement, wallet signing, ledger posting, trading, or Exchange features.
21. Any conflict with master docs 00–11, FND-01, IAM-01, IAM-02, SEC-01, CFG-01, CLT-01, KYC-01 or AML-01.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional WLT-01 requirements or parameters to add.
```

## Final Verification Note

WLT-01 v1.2 is accepted / final verified.

v1.1 resolved all 5 critical gaps and all 6 recommended corrections from Claude Opus review. v1.2 is a cosmetic version-cell cleanup release only with no substantive control change.

WLT-01 now provides destination eligibility/whitelist controls to downstream money-movement modules using execution-time verify-and-consume destination decisions.

Next module: LED-01 Ledger / Settlement / Safeguarding.
