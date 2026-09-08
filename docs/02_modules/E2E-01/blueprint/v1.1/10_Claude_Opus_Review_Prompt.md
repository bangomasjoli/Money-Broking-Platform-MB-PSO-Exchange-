# E2E-01 Cross-Module End-to-End Fund-Flow Review
## 10 Claude Opus Review Prompt

```txt
Review this E2E-01 Cross-Module End-to-End Fund-Flow Review Pack v1.1 as a principal fintech platform architect, regulated Money Broking + PSO platform reviewer, fund-flow control reviewer, AML/CFT integration reviewer, ledger/safeguarding reviewer, trade/LP execution reviewer, and implementation readiness reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending and all Exchange features are locked.
- The accepted core blueprint chain is:
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
- The platform model is Money Broking agency/back-to-back with approved LPs.
- AIX must not run an Exchange runtime, order book, matching engine, client-to-client matching, market making, principal dealing, AIX inventory, or AIX spread markup.
- Ledger must be immutable double-entry with live atomic reservations and full-backing safeguarding.
- AML/WLT/LED/TRD gates must fail closed.
- SEC-01 audit evidence must be continuous.

Review for:
1. Cross-module contract gaps, including saga/orchestration gaps.
2. Any stale decision-token, incoherent decision-bundle or TOCTOU issue across modules.
3. Any money movement path that bypasses AML, WLT, LED or CFG runtime checks.
4. Any trade path that creates AIX principal exposure.
5. Any internalisation/client-to-client matching path.
6. Any deposit path that credits before confirmed/free backing.
7. Any payout path that uses stale/revoked destination.
8. Any settlement path that bypasses LED DvP or safeguarding.
9. Any audit/reconciliation gap.
10. Any implementation dependency order issue.
11. Any missing E2E test.
12. Any go-live readiness gap.

Do not write code.

Return only:
- Critical cross-module gaps.
- Recommended corrections.
- Missing E2E tests.
- Missing go-live gates.
- Final verdict on whether the accepted blueprint chain is implementation-ready.
```

Additional v1.1 review focus:
- global saga and compensation model.
- orphaned intermediate-state sweeper.
- decision-bundle coherence and point-in-time snapshot.
- global freshness windows and revocation propagation SLA.
- end-to-end value conservation across TRD/LED/safeguarding.
- cross-module freeze propagation and orchestrated recovery gate.
- SEC expected-vs-emitted event manifest.
- jointly retrievable evidence bundle by correlation ID.
- pending deposit/withdrawal rail execution boundary.
