# PRT-01 Client / Staff / Admin Portal Workflows
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this PRT-01 Client / Staff / Admin Portal Workflows Blueprint Pack v1.2 as a principal fintech platform architect, regulated portal/UX control reviewer, AML tipping-off reviewer, security/IAM reviewer, and money-flow status truth reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending and all Exchange features are locked.
- PRT-01 is portal/workflow presentation only.
- PRT-01 must not own source-of-truth decisions, post ledger, edit balances, execute deposits/withdrawals/trades, override AML/WLT/KYC, release incident freezes, clear REC breaks, delete audit evidence or expose Exchange UI.
- All material statuses must come from backend source modules.
- Backend controls always revalidate.

Accepted baseline:
- FND-01 v1.2
- IAM-01 v1.2
- IAM-02 v1.2
- SEC-01 v1.2
- CFG-01 v1.2
- CLT-01 v1.2
- KYC-01 v1.2
- AML-01 v1.2
- WLT-01 v1.2
- LED-01 v1.2
- TRD-01 v1.2
- E2E-01 v1.2
- DEP-01 v1.2
- WDR-01 v1.2
- REC-01 v1.2
- INC-01 v1.2

Review for:
1. Missing source-of-truth/status truth and display non-regression controls.
2. Missing backend revalidation controls.
3. Missing IAM/CFG/INC context enforcement and push invalidation controls.
4. Missing maker-checker/client dual-authorisation UX controls.
5. Missing AML tipping-off-safe message controls.
6. Missing masking/data minimisation/export egress hardening controls.
7. Missing incident/freeze-aware UX controls.
8. Missing report/restatement/open-break warning controls.
9. Missing admin superuser boundary controls.
10. Missing Exchange UI prohibition.
11. Missing portal audit/security controls and hostile browser/input boundary controls.
12. Missing object-level read authorization and service-account re-scoping.
13. Missing notification supersession, action-bound step-up, disclosed-fee display truth and correlation propagation.
14. Missing tests or go-live gates.
15. Any path that allows the portal to become a bypass around accepted backend controls.
16. Any conflict with accepted module contracts.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional PRT-01 requirements or parameters to add.
```


## Final Verification Note

PRT-01 v1.2 is accepted / final verified. v1.2 is a cosmetic version-cell and baseline-repin cleanup release only with no substantive control change.
