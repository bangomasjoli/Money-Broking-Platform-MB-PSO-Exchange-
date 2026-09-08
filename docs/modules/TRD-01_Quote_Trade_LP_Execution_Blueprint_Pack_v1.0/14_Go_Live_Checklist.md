# TRD-01 Quote / Trade / LP Execution
## 14 Go-Live Checklist

## 1. TRD-01 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | TRD-01 blueprint accepted | Pending |
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
| 12 | Instrument/pair registry defined | Pending |
| 13 | LP registry/coverage defined | Pending |
| 14 | Client eligibility defined | Pending |
| 15 | LP quote flow defined | Pending |
| 16 | Client quote/fee disclosure defined | Pending |
| 17 | Quote expiry/hash defined | Pending |
| 18 | Quote acceptance defined | Pending |
| 19 | LED prefunded hold integration defined | Pending |
| 20 | AML gate defined | Pending |
| 21 | LP execution defined | Pending |
| 22 | Fill/partial/slippage controls defined | Pending |
| 23 | Settlement handoff to LED defined | Pending |
| 24 | No principal/inventory/spread controls defined | Pending |
| 25 | Exchange feature lock defined | Pending |
| 26 | Reconciliation jobs defined | Pending |
| 27 | Tests TRD1-TC-001 to TRD1-TC-040 defined | Pending |
| 28 | Compliance sign-off | Pending |
| 29 | Finance sign-off | Pending |
| 30 | Security sign-off | Pending |
| 31 | Management sign-off | Pending |

---

## 2. Blocking Failures

1. Order book/matching possible.
2. Principal dealing possible.
3. AIX inventory possible.
4. AIX spread markup possible.
5. Client fill without LP fill.
6. LP execution without LED hold.
7. Quote accepted after expiry.
8. LP timeout blind retry.
9. Duplicate LP fill creates settlement.
10. Slippage beyond tolerance silently accepted.
11. Settlement handoff without evidence.
12. Fee disclosure missing.
