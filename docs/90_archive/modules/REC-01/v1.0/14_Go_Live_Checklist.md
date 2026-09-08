# REC-01 Reconciliation / Finance Reporting
## 14 Go-Live Checklist

## 1. REC-01 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | REC-01 blueprint accepted | Pending |
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
| 12 | TRD-01 accepted | Complete |
| 13 | E2E-01 accepted | Complete |
| 14 | DEP-01 accepted | Complete |
| 15 | WDR-01 accepted | Complete |
| 16 | Reconciliation orchestration defined | Pending |
| 17 | Source snapshot/hashing defined | Pending |
| 18 | Ledger reconciliation defined | Pending |
| 19 | Deposit reconciliation defined | Pending |
| 20 | Withdrawal reconciliation defined | Pending |
| 21 | Trade reconciliation defined | Pending |
| 22 | Fee reconciliation defined | Pending |
| 23 | Safeguarding report defined | Pending |
| 24 | Value conservation defined | Pending |
| 25 | Audit completeness defined | Pending |
| 26 | E2E correlation completeness defined | Pending |
| 27 | External statement reconciliation defined | Pending |
| 28 | Break lifecycle defined | Pending |
| 29 | Break closure controls defined | Pending |
| 30 | Close sign-off defined | Pending |
| 31 | Report/export controls defined | Pending |
| 32 | Evidence pack defined | Pending |
| 33 | Tests REC1-TC-001 to REC1-TC-038 defined | Pending |
| 34 | Compliance sign-off | Pending |
| 35 | Finance sign-off | Pending |
| 36 | Security sign-off | Pending |
| 37 | Management sign-off | Pending |

## 2. Blocking Failures

1. REC can mutate source data.
2. REC can post ledger/edit balances.
3. critical break auto-clears.
4. safeguarding deficit not critical.
5. daily close can pass with unresolved critical break.
6. source hashes missing.
7. missing SEC event ignored.
8. report hides material break.
9. sensitive export without approval.
