# WDR-01 Withdrawal / Payout Execution Rail
## 14 Go-Live Checklist

## 1. WDR-01 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | WDR-01 blueprint accepted | Pending |
| 2 | FND-01 accepted | Complete |
| 3 | IAM-01 accepted | Complete |
| 4 | IAM-02 accepted | Complete |
| 5 | SEC-01 accepted | Complete |
| 6 | CFG-01 accepted | Complete |
| 7 | CLT-01 accepted | Complete |
| 8 | KYC-01 accepted | Complete |
| 9 | AML-01 accepted | Complete |
| 10 | WLT-01 accepted | Complete |
| 11 | LED-01 accepted | Complete |
| 12 | E2E-01 accepted | Complete |
| 13 | DEP-01 accepted | Complete |
| 14 | Execution intake defined | Pending |
| 15 | Decision-bundle validation defined | Pending |
| 16 | WLT verify-and-consume defined | Pending |
| 17 | AML/Travel Rule gate defined | Pending |
| 18 | LED reserve validation defined | Pending |
| 19 | CFG/IAM validation defined | Pending |
| 20 | Provider routing/authentication defined | Pending |
| 21 | Idempotency/replay controls defined | Pending |
| 22 | Timeout query-back defined | Pending |
| 23 | Finality model defined | Pending |
| 24 | Return/reversal handling defined | Pending |
| 25 | Cancellation/late execution handling defined | Pending |
| 26 | Freeze/kill-switch handling defined | Pending |
| 27 | No-principal funding defined | Pending |
| 28 | Return-to-source controls defined | Pending |
| 29 | Reconciliation jobs defined | Pending |
| 30 | Tests WDR1-TC-001 to WDR1-TC-040 defined | Pending |
| 31 | Compliance sign-off | Pending |
| 32 | Finance sign-off | Pending |
| 33 | Security sign-off | Pending |
| 34 | Management sign-off | Pending |

## 2. Blocking Failures

1. execution without LED reserve.
2. execution without WLT/AML/Travel Rule.
3. provider instruction without auth.
4. timeout blind retry.
5. premature finality.
6. return/reversal ignored.
7. WDR releases reserve or posts ledger.
8. AIX operational/principal funding.
9. missing correlation/audit.
