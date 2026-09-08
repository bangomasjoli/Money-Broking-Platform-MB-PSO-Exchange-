# WDR-01 Withdrawal / Payout Execution Rail
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this WDR-01 Withdrawal / Payout Execution Rail Blueprint Pack v1.2 as a principal fintech platform architect, regulated PSO / Money Broking payout reviewer, AML/CFT and Travel Rule reviewer, ledger/safeguarding reviewer, and E2E saga reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending and Exchange features are locked.
- WDR-01 is the outbound execution boundary.
- WDR-01 must never approve destination eligibility, own AML decisions, post ledger, release reserves, calculate available balance, or fund payouts from AIX operational/principal accounts.
- WLT-01 owns destination whitelist/verify-and-consume.
- AML-01 owns AML/sanctions/Travel Rule gates.
- LED-01 owns reserves, settlement, journals and safeguarding.
- E2E-01 owns saga/correlation/orphan sweeper.
- DEP-01 return path depends on WDR-01 and must use the same payout controls.
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

Review for:
1. Missing outbound execution boundary controls.
2. Missing WLT verify-and-consume controls.
3. Missing AML/Travel Rule gate controls.
4. Missing LED reserve / settlement handoff and one-reserve-one-send controls.
5. Missing provider authentication / atomic send-time revalidation / transmission controls.
6. Missing idempotency / timeout / query-back controls.
7. Missing finality / failed / returned / reversed payout and outbound value-conservation controls.
8. Missing cancellation / executed-late / CAS state controls.
9. Missing freeze / kill-switch in-flight handling.
10. Missing no-principal/no-operational funding controls.
11. Missing return-to-source controls for DEP-01 rejected/unmatched deposits.
12. Missing E2E saga / correlation / orphan sweeper controls.
13. Missing batch/file execution controls.
14. Missing last-mile beneficiary integrity and Travel Rule payload consistency controls.
15. Missing SEC audit and reconciliation controls.
16. Any path that lets WDR execute without WLT/AML/LED, retry blindly, mark finality early, release reserves locally, fund payout from AIX, return to sanctioned source, or bypass maker-checker/client dual authorisation.
17. Any conflict with accepted module contracts.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional WDR-01 requirements or parameters to add.
```

## Final Verification Note

WDR-01 v1.2 is accepted / final verified.

v1.1 resolved all 5 critical gaps and all 6 recommended corrections from Claude Opus review. v1.2 is a cosmetic version-cell and baseline-repin cleanup release only with no substantive control change.

WDR-01 now provides the outbound payout execution boundary:
- atomic revalidate-and-transmit.
- exclusive reserve send lock.
- logical payout dedup.
- outbound value conservation.
- last-mile beneficiary integrity.
- batch/file payout controls.
- executed-late settlement treatment.
- provider signing-key governance.
- Travel Rule payload consistency.
- pinned reserve SLA.
- client-facing status truth.
