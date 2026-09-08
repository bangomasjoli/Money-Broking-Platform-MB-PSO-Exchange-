# LED-01 Ledger / Settlement / Safeguarding
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this LED-01 Ledger / Settlement / Safeguarding Blueprint Pack v1.0 as a principal fintech platform architect, regulated fintech money-flow architect, double-entry ledger reviewer, settlement/DvP reviewer, safeguarding/client-money reviewer, and security governance reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending and all Exchange features are locked.
- AIX must not act as principal, market maker, or inventory absorber.
- No public exchange order book, matching engine, client-to-client matching, principal dealing, or AIX spread markup.
- Revenue is disclosed brokerage/commission/approved fee only.
- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 Audit Log / Security Monitoring accepted v1.2.
- CFG-01 Feature Flag / Licence Lock accepted v1.2.
- CLT-01 Client Onboarding / Client Profile accepted v1.2.
- KYC-01 KYC/KYB Verification accepted v1.2.
- AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening accepted v1.2.
- WLT-01 Wallet Screening / Payout Destination Whitelist accepted v1.2.
- LED-01 owns ledger, settlement state, safeguarding invariant, prefunded holds and reconciliation.
- LED-01 must consume WLT-01 verify-and-consume destination decisions and AML-01 pre-transaction gates.
- LED-01 must not implement KYC, AML screening, wallet screening, payment execution, blockchain signing, LP quoting, LP execution, order book, matching, market making, principal dealing, or Exchange features.

Review for:
1. Missing double-entry / immutable ledger controls.
2. Missing no-direct-balance-edit controls.
3. Missing full-backing / safeguarding invariant.
4. Missing deposit pending/confirmed/credited controls.
5. Missing withdrawal/payout reserve/settlement controls.
6. Missing WLT-01 verify-and-consume integration.
7. Missing AML-01 pre-transaction gate integration.
8. Missing prefunded hold before LP execution.
9. Missing DvP sequencing.
10. Missing no-AIX-principal-exposure / no-inventory controls.
11. Missing fee disclosure / no-spread-markup controls.
12. Missing reversal/correction controls.
13. Missing ledger close/freeze controls.
14. Missing idempotency/ordering/concurrency controls.
15. Missing reconciliation/safeguarding reporting controls.
16. Missing deployment/rollback/money-flow quiescence controls.
17. Any path that allows unbalanced journal, direct balance edit, negative available balance, available credit before confirmed backing, payout without WLT/AML, LP execution without hold, settlement before receipt, AIX funding client settlement, hidden spread, Super Admin, break-glass, service account manual override, direct DB edit, or unreconciled safeguarding breach.
18. Any conflict with master docs 00–11 or accepted modules FND/IAM/SEC/CFG/CLT/KYC/AML/WLT.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional LED-01 requirements or parameters to add.
```
