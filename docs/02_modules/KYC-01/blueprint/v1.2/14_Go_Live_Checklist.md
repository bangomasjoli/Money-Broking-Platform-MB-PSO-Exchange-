# KYC-01 KYC / KYB Verification
## 14 Go-Live Checklist

## 1. KYC-01 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | KYC-01 blueprint accepted | Complete |
| 2 | FND-01 dependency accepted | Complete |
| 3 | IAM-01 dependency accepted | Complete |
| 4 | IAM-02 dependency accepted | Complete |
| 5 | SEC-01 dependency accepted | Complete |
| 6 | CFG-01 dependency accepted | Complete |
| 7 | CLT-01 dependency accepted | Complete |
| 8 | KYC/KYB case creation defined | Pending |
| 9 | Handoff vs outcome separation defined | Pending |
| 10 | Document checklist defined | Pending |
| 11 | Individual verification defined | Pending |
| 12 | Entity verification defined | Pending |
| 13 | UBO/controller verification defined | Pending |
| 14 | Authorised-party verification defined | Pending |
| 15 | CDD outcome engine defined | Pending |
| 16 | Outcome publication to CLT defined | Pending |
| 17 | EDD routing defined | Pending |
| 18 | Manual review maker-checker defined | Pending |
| 19 | Vendor result authenticity defined | Pending |
| 20 | Periodic review/stale outcome defined | Pending |
| 21 | Sensitive read/export controls defined | Pending |
| 22 | Reconciliation jobs defined | Pending |
| 23 | Tests KYC1-TC-001 to KYC1-TC-040 defined | Pending |
| 24 | Security sign-off | Complete for blueprint acceptance |
| 25 | Compliance sign-off | Complete for blueprint acceptance |
| 26 | Management sign-off | Pending for implementation/go-live |

---

## 2. Blocking Failures

1. Handoff delivery treated as CDD pass.
2. CDD pass with missing required document.
3. CDD pass with failed identity/entity verification.
4. CDD pass with missing UBO/controller verification.
5. Authorised party activates without verification.
6. Manual pass without IAM-02 approval.
7. Vendor result unauthenticated.
8. Stale outcome treated as pass.
9. Outcome not published to CLT.
10. Sensitive evidence read/export not logged.
11. Direct DB outcome edit.
12. KYC pass grants trading/deposit/withdrawal.

## v1.1 Additional Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 27 | UBO look-through to natural persons defined | Pending |
| 28 | Indirect ownership aggregation defined | Pending |
| 29 | Trust/nominee role model defined | Pending |
| 30 | Vendor reliance framework defined | Pending |
| 31 | Vendor degraded-mode defined | Pending |
| 32 | Confidence threshold and validity window defined | Pending |
| 33 | Identity-proofing assurance policy defined | Pending |
| 34 | Liveness/biometric binding policy defined | Pending |
| 35 | SoW/SoF EDD policy defined | Pending |
| 36 | KYC/AML boundary hard contract defined | Pending |
| 37 | Evidence-store security contract defined | Pending |
| 38 | Evidence hash re-verification defined | Pending |
| 39 | Verified identity hash alignment with CLT-01 defined | Pending |
| 40 | Minimum EDD measures defined | Pending |
