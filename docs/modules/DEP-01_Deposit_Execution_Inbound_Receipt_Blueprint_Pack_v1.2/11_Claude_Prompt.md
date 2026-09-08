# DEP-01 Deposit Execution / Inbound Receipt
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this DEP-01 Deposit Execution / Inbound Receipt Blueprint Pack v1.2 as a principal fintech platform architect, regulated Money Broking + PSO fund-flow reviewer, deposit/rail integration reviewer, ledger/safeguarding reviewer, AML/CFT integration reviewer, and cross-module saga reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending and all Exchange features are locked.
- DEP-01 owns inbound receipt detection and deposit execution boundary only.
- DEP-01 must never credit client balance or post ledger.
- LED-01 owns pending deposit, credit, ledger posting, safeguarding and clawback.
- WLT-01 owns inbound source screening.
- AML-01 owns AML source/counterparty decisions.
- E2E-01 owns saga/correlation, decision-bundle coherence and orphan sweeper.
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

Review for:
1. Missing no-ledger-credit boundary controls.
2. Missing receipt authentication / source integrity controls.
3. Missing deduplication / replay controls.
4. Missing deposit matching and mis-attribution controls.
5. Missing source extraction for WLT/AML.
6. Missing crypto confirmation / fiat finality controls.
7. Missing WLT-01 / AML-01 / LED-01 handoff contracts, including credit-request coherent bundle revalidation.
8. Missing quarantine / exception and revocation-pullback controls.
9. Missing reorg / recall / reversal and original-correlation binding controls.
10. Missing E2E saga / correlation, decision-bundle freshness and orphan control integration.
11. Missing SEC audit and evidence continuity.
12. Missing own-source / SoF / Travel Rule controls.
13. Missing finality / provider-authentication / fabricated-receipt controls.
14. Missing reference/correlation/amount-disposition controls.
15. Missing reconciliation controls.
16. Any path that lets DEP credit balance, bypass WLT/AML/LED, auto-credit ambiguous or unauthenticated receipts, ignore reversal events, duplicate-credit, or break E2E saga consistency.
17. Any conflict with accepted module contracts or E2E-01.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional DEP-01 requirements or parameters to add.
```

## Final Verification Note

DEP-01 v1.2 is accepted / final verified.

v1.1 resolved all 5 critical gaps and all 6 recommended corrections from Claude Opus review. v1.2 is a cosmetic version-cell and baseline-repin cleanup release only with no substantive control change.

DEP-01 now provides the inbound deposit execution boundary:
- authenticated receipt evidence.
- no ledger credit by DEP.
- coherent screening-bundle revalidation.
- AML/WLT revocation pullback.
- inbound own-source / SoF controls.
- robust finality and fabricated-receipt controls.
- reference/correlation/amount integrity.
- controlled reversal and return paths.
