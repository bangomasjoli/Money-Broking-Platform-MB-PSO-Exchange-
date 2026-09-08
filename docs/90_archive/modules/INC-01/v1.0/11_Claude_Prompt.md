# INC-01 Incident / Freeze / Recovery
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this INC-01 Incident / Freeze / Recovery Blueprint Pack v1.0 as a principal fintech platform architect, operational resilience reviewer, security incident reviewer, AML/CFT incident reviewer, ledger/safeguarding incident reviewer, and E2E fund-flow recovery reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending and all Exchange features are locked.
- INC-01 is an incident coordination and recovery module only.
- INC-01 must never post ledger, edit balances, execute payouts, credit deposits, execute trades, clear REC breaks, delete audit evidence, or override AML/WLT decisions.
- CFG-01 owns feature/kill-switch state.
- IAM owns access/session/permission freeze.
- LED-01 owns ledger/reserve/settlement controls.
- DEP-01 owns deposit gates.
- WDR-01 owns payout gates.
- TRD-01 owns quote/trade/LP gates.
- REC-01 owns reconciliation validation.
- SEC-01 owns audit evidence.
- E2E-01 owns correlation/saga freeze and recovery model.
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
- REC-01 v1.2

Review for:
1. Missing incident command and severity controls.
2. Missing freeze scope/propagation controls.
3. Missing cross-module freeze acknowledgement and fail-closed handling.
4. Missing in-flight money-flow quiescence by stage.
5. Missing point-of-no-return / irreversible-leg handling.
6. Missing evidence preservation and chain-of-custody controls.
7. Missing regulatory/management/client notification tracking.
8. Missing recovery plan and resume gate controls.
9. Missing REC validation before resume.
10. Missing SEC evidence completeness before closure.
11. Missing post-incident review and remediation tracking.
12. Missing status truthfulness controls.
13. Any path that allows INC to mutate source data, post ledger, release reserves, bypass AML/WLT/LED/WDR/DEP/TRD, delete audit evidence, hide notification obligations, or resume without gate.
14. Any conflict with accepted module contracts.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional INC-01 requirements or parameters to add.
```
