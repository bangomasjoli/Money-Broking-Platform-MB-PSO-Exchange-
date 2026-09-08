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

## v1.1 Additional Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 38 | Population denominator SEC/E2E defined | Pending |
| 39 | Population coverage proof defined | Pending |
| 40 | Monotonic sequence gap detection defined | Pending |
| 41 | Consistent as-of snapshot model defined | Pending |
| 42 | In-flight reconciling item class defined | Pending |
| 43 | External statement trust model defined | Pending |
| 44 | All safeguarding accounts completeness check defined | Pending |
| 45 | REC hash-chain/external anchor defined | Pending |
| 46 | Mandated scope enforcement defined | Pending |
| 47 | Reconciliation independence SoD defined | Pending |
| 48 | Safeguarding four-eyes sign-off defined | Pending |
| 49 | Clean re-reconciliation closure defined | Pending |
| 50 | Recurrence detection defined | Pending |
| 51 | Materiality/tolerance governance defined | Pending |
| 52 | Severity mapping governance defined | Pending |
| 53 | Reconciliation rule-change governance defined | Pending |
| 54 | Report restatement workflow defined | Pending |
| 55 | Regulatory obligation tracker defined | Pending |
| 56 | Tests REC1-TC-039 to REC1-TC-081 defined | Pending |
