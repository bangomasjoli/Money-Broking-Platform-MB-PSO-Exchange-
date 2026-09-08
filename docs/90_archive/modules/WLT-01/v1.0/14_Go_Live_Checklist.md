# WLT-01 Wallet Screening / Payout Destination Whitelist
## 14 Go-Live Checklist

## 1. WLT-01 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | WLT-01 blueprint accepted | Pending |
| 2 | FND-01 dependency accepted | Complete |
| 3 | IAM-01 dependency accepted | Complete |
| 4 | IAM-02 dependency accepted | Complete |
| 5 | SEC-01 dependency accepted | Complete |
| 6 | CFG-01 dependency accepted | Complete |
| 7 | CLT-01 dependency accepted | Complete |
| 8 | KYC-01 dependency accepted | Complete |
| 9 | AML-01 dependency accepted | Complete |
| 10 | Wallet registration defined | Pending |
| 11 | Wallet screening defined | Pending |
| 12 | Wallet ownership/control evidence defined | Pending |
| 13 | Payout destination verification defined | Pending |
| 14 | Beneficiary mismatch controls defined | Pending |
| 15 | Whitelist approval defined | Pending |
| 16 | Cooling-off defined | Pending |
| 17 | Client-side dual authorisation defined | Pending |
| 18 | AML-01 gate integration defined | Pending |
| 19 | Travel Rule data support defined | Pending |
| 20 | Destination decision token defined | Pending |
| 21 | Immediate revocation defined | Pending |
| 22 | Ongoing rescreening defined | Pending |
| 23 | Vendor integrity defined | Pending |
| 24 | Sensitive read/export defined | Pending |
| 25 | Reconciliation jobs defined | Pending |
| 26 | Tests WLT1-TC-001 to WLT1-TC-040 defined | Pending |
| 27 | Security sign-off | Pending |
| 28 | Compliance sign-off | Pending |
| 29 | Management sign-off | Pending |

---

## 2. Blocking Failures

1. Unwhitelisted destination can be used.
2. Wallet private key stored.
3. WLT executes payment/transfer/ledger action.
4. High-risk/sanctions wallet active.
5. Beneficiary mismatch active without approval.
6. Third-party payout unapproved.
7. Cooling-off bypass.
8. AML gate missing/stale.
9. Travel Rule missing data treated clear.
10. Revoked destination used.
11. Decision token reused outside scope.
12. Sensitive read/export not logged.
13. Direct DB whitelist edit.
