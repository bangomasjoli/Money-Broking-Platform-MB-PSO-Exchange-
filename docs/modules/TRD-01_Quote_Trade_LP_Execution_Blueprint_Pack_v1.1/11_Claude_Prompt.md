# TRD-01 Quote / Trade / LP Execution
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this TRD-01 Quote / Trade / LP Execution Blueprint Pack v1.1 as a principal fintech platform architect, regulated Money Broking architect, agency/back-to-back execution reviewer, LP execution reviewer, settlement handoff reviewer, and Exchange-feature-lock reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending and all Exchange features are locked.
- No public order book, no matching engine, no client-to-client matching, no market making, no principal dealing, no AIX inventory, no AIX spread markup.
- Revenue is disclosed brokerage/commission/approved fee only.
- TRD-01 owns quote, trade and LP execution lifecycle only.
- TRD-01 must consume LED-01 prefunded holds and settlement controls.
- TRD-01 must consume AML-01 pre-transaction gate where required.
- TRD-01 must not post ledger, move funds/assets, custody keys, run Exchange order book/matching, or act as principal.
- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 Audit Log / Security Monitoring accepted v1.2.
- CFG-01 Feature Flag / Licence Lock accepted v1.2.
- CLT-01 Client Onboarding / Client Profile accepted v1.2.
- KYC-01 KYC/KYB Verification accepted v1.2.
- AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening accepted v1.2.
- WLT-01 Wallet Screening / Payout Destination Whitelist accepted v1.2.
- LED-01 Ledger / Settlement / Safeguarding accepted v1.2.

Review for:
1. Missing Money Broking agency/back-to-back controls, including accept-to-fill principal-window controls.
2. Missing Exchange-feature-lock controls.
3. Missing no-principal/no-inventory/no-spread controls.
4. Missing LP approval, coverage, source-auth and payload-integrity controls.
5. Missing client eligibility controls.
6. Missing quote expiry/hash/tamper and LP quote firmness/RFQ controls.
7. Missing fee disclosure, brokerage-only and price-construction identity controls.
8. Missing LED-01 prefunded hold integration.
9. Missing AML-01 pre-transaction gate integration.
10. Missing LP execution idempotency/retry/timeout query-back and late-fill controls.
11. Missing fill conservation, partial-fill/slippage/requote/void controls.
12. Missing settlement handoff to LED-01, partial hold release atomicity, confirmation settlement-truth and conversion/residual evidence controls.
13. Missing structural no-internalisation/no-netting and CFG execution/settlement revalidation controls.
14. Missing best-execution/LP-selection evidence controls.
15. Missing trade state compare-and-set concurrency controls.
16. Missing reconciliation controls.
17. Any path that allows client fill without LP fill, LP execution without hold, stale quote acceptance, hidden spread, AIX residual absorption, LP timeout blind retry, duplicate fill, order book, matching engine, market making, principal dealing, service-account approval, Super Admin bypass, break-glass trade, direct DB trade edit, or Exchange feature.
18. Any conflict with master docs 00–11 or accepted modules FND/IAM/SEC/CFG/CLT/KYC/AML/WLT/LED.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional TRD-01 requirements or parameters to add.
```
