# REC-01 Reconciliation / Finance Reporting
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this REC-01 Reconciliation / Finance Reporting Blueprint Pack v1.2 as a principal fintech platform architect, finance control reviewer, regulated Money Broking + PSO safeguarding reviewer, audit evidence reviewer, AML/CFT reconciliation reviewer, and ledger/reporting reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending and all Exchange features are locked.
- REC-01 is a reconciliation/reporting module only.
- REC-01 must not post ledger, edit balances, execute deposits/withdrawals/trades, alter audit events, or override source module decisions.
- LED-01 owns ledger, settlement, safeguarding and journals.
- DEP-01 owns inbound receipt evidence.
- WDR-01 owns outbound payout execution evidence.
- TRD-01 owns quote/trade/LP execution evidence.
- SEC-01 owns audit evidence.
- E2E-01 owns saga/correlation evidence.
- No order book, matching engine, client-to-client matching, principal dealing, AIX inventory or spread markup.

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

Review for:
1. Missing reconciliation source-of-truth boundaries.
2. Any path that allows REC-01 to mutate source records or ledger/balances.
3. Missing run reproducibility, source hashes, immutable results and REC hash-chain/external anchoring.
4. Missing ledger/safeguarding reconciliation.
5. Missing deposit/withdrawal/trade/fee reconciliation.
6. Missing E2E correlation/saga reconciliation.
7. Missing SEC expected-vs-emitted audit completeness.
8. Missing value-conservation checks.
9. Missing external statement reconciliation trust: authenticity, completeness, freshness and ingestion independence.
10. Missing break severity/lifecycle/closure controls, including clean re-reconciliation and recurrence detection.
11. Missing population coverage, consistent as-of cut-off, daily close and finance sign-off gates.
12. Missing report/export controls.
13. Missing regulatory/auditor evidence pack requirements.
14. Missing materiality/tolerance, severity, rule-change and report-restatement governance.
15. Missing regulatory obligation/deadline tracking.
16. Missing tests or go-live gates.
17. Any conflict with accepted module contracts.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional REC-01 requirements or parameters to add.
```

## Final Verification Note

REC-01 v1.2 is accepted / final verified.

v1.1 resolved all 5 critical gaps and all 6 recommended corrections from Claude Opus review. v1.2 is a cosmetic version-cell and baseline-repin cleanup release only with no substantive control change.

REC-01 now provides the independent reconciliation and finance reporting assurance layer:
- full-population coverage proof.
- consistent as-of snapshot.
- external statement trust model.
- REC hash-chain/external anchoring.
- mandated scope enforcement.
- independent SoD and four-eyes safeguarding sign-off.
- closed-loop break remediation.
- recurrence detection.
- tolerance/severity/rule governance.
- report restatement.
- regulatory obligation tracking.
