# DEP-01 Deposit Execution / Inbound Receipt
## 14 Go-Live Checklist

## 1. DEP-01 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | DEP-01 blueprint accepted | Pending |
| 2 | FND-01 dependency accepted | Complete |
| 3 | IAM-01 dependency accepted | Complete |
| 4 | IAM-02 dependency accepted | Complete |
| 5 | SEC-01 dependency accepted | Complete |
| 6 | CFG-01 dependency accepted | Complete |
| 7 | CLT-01 dependency accepted | Complete |
| 8 | KYC-01 dependency accepted | Complete |
| 9 | AML-01 dependency accepted | Complete |
| 10 | WLT-01 dependency accepted | Complete |
| 11 | LED-01 dependency accepted | Complete |
| 12 | E2E-01 dependency accepted | Complete |
| 13 | Deposit intent/reference defined | Pending |
| 14 | Receipt ingestion defined | Pending |
| 15 | Receipt authentication defined | Pending |
| 16 | Deduplication/replay control defined | Pending |
| 17 | Matching/mis-attribution guard defined | Pending |
| 18 | Source extraction defined | Pending |
| 19 | Confirmation policy defined | Pending |
| 20 | WLT handoff defined | Pending |
| 21 | AML handoff defined | Pending |
| 22 | LED pending/credit handoff defined | Pending |
| 23 | Quarantine workflow defined | Pending |
| 24 | Reversal/recall flow defined | Pending |
| 25 | Reconciliation jobs defined | Pending |
| 26 | E2E saga/correlation defined | Pending |
| 27 | Tests DEP1-TC-001 to DEP1-TC-033 defined | Pending |
| 28 | Compliance sign-off | Pending |
| 29 | Finance sign-off | Pending |
| 30 | Security sign-off | Pending |
| 31 | Management sign-off | Pending |

## 2. Blocking Failures

1. DEP can credit balance.
2. unauthenticated receipt can proceed.
3. duplicate receipt can create duplicate credit.
4. ambiguous deposit can auto-match.
5. WLT/AML bypass possible.
6. LED handoff bypass possible.
7. reversal ignored.
8. correlation ID missing.
9. SEC audit missing.

## v1.1 Additional Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 32 | Credit-request coherent bundle revalidation defined | Pending |
| 33 | AML/WLT revocation subscription defined | Pending |
| 34 | Inbound own-source / SoF binding defined | Pending |
| 35 | SoF/SoW evidence policy defined | Pending |
| 36 | Crypto finality model defined | Pending |
| 37 | Fiat return-window finality defined | Pending |
| 38 | Provider identity/key-rotation model defined | Pending |
| 39 | File-feed completeness controls defined | Pending |
| 40 | Independent truth reconciliation defined | Pending |
| 41 | Reference/address reuse policy defined | Pending |
| 42 | Expired intent deposit policy defined | Pending |
| 43 | Amount disposition policy defined | Pending |
| 44 | Inbound Travel Rule capture defined | Pending |
| 45 | LED pending orphan control defined | Pending |
| 46 | Controlled return path defined | Pending |
| 47 | Credit-time eligibility recheck defined | Pending |
| 48 | Reversal correlation/saga binding defined | Pending |
