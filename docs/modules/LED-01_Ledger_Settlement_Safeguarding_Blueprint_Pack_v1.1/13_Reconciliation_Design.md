# LED-01 Ledger / Settlement / Safeguarding
## 13 Reconciliation Design

## 1. Purpose

LED-01 reconciliation proves the ledger is balanced, client liabilities are fully backed, and every settlement/deposit/withdrawal/trade has matching source evidence and controls.

---

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| Journal balance | journal | journal_line | Debits equal credits |
| Balance snapshot | journal_line | balance_snapshot | Derived balance integrity |
| Client liabilities | client sub-ledger | safeguarding assets | Full-backing |
| Fiat bank | fiat ledger | bank statement | Fiat backing |
| Custodian asset | digital asset ledger | custodian statement | Asset backing |
| Chain deposit | deposit ledger | chain confirmation | Receipt confirmation |
| Holds | holds | trade/payout/settlement | Hold integrity |
| WLT decision | settlement | WLT decision | Destination control |
| AML decision | settlement | AML decision | Screening control |
| Fee | fee journal | fee schedule/disclosure | Fee control |
| Reversal | reversal journal | original journal | Correction traceability |

---

## 3. Scheduled Jobs

1. Journal debit/credit balance scan.
2. Duplicate source event scan.
3. Negative available balance scan.
4. Client liabilities vs safeguarded assets scan.
5. Bank statement vs fiat ledger scan.
6. Custodian statement vs asset ledger scan.
7. Chain confirmation vs deposit credit scan.
8. Holds vs settlement records scan.
9. WLT decision consumed vs movement scan.
10. AML decision current vs movement scan.
11. LP execution vs hold scan.
12. Fees vs disclosure scan.
13. Reversal trace scan.
14. Frozen/closed scope posting scan.

---

## 4. Critical Findings

| Finding | Severity |
|---|---|
| Unbalanced posted journal | Critical |
| Direct balance edit suspected | Critical |
| Negative available balance | Critical |
| Client liabilities exceed safeguarded assets | Critical |
| Available credit without confirmed backing | Critical |
| Payout without WLT/AML | Critical |
| LP execution without hold | Critical |
| DvP sequence breach | Critical |
| AIX principal exposure | Critical |
| Critical break unresolved | Critical |

---

## 5. Output

Each reconciliation run produces:

1. run ID.
2. checked counts.
3. findings.
4. severity.
5. affected accounts/journals/clients.
6. asset/currency.
7. SEC-01 audit refs.
8. recommended action.
9. freeze recommendation.
10. reviewer sign-off.

## v1.1 Additional Reconciliation

Additional scheduled jobs:

1. Live balance vs journal/hold reconstruction scan.
2. Atomic reservation conflict scan.
3. Balance snapshot used for reservation scan.
4. Settlement group vs settlement legs scan.
5. One-leg-settled pending aging scan.
6. Backing free vs encumbered scan.
7. Conversion event A-out/B-in/residual scan.
8. AIX net asset position scan.
9. Residual/dust account bound scan.
10. Journal hash-chain verification.
11. External anchor verification.
12. Clawback/reorg/recall case scan.
13. Idempotency same-key/different-payload scan.
14. Hold pinned while in-flight scan.
15. Operational/clearing/suspense account bound scan.
16. Fee/settlement atomicity scan.

Critical findings:

1. Concurrent reservation overspend.
2. One-leg settlement exposure.
3. Encumbered backing reused.
4. AIX net asset position nonzero.
5. Journal hash-chain mismatch.
6. Clawback required but not processed.
7. Operational account funds client settlement.
