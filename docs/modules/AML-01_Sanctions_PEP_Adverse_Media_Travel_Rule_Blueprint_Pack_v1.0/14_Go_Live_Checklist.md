# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 14 Go-Live Checklist

## 1. AML-01 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | AML-01 blueprint accepted | Pending |
| 2 | FND-01 dependency accepted | Complete |
| 3 | IAM-01 dependency accepted | Complete |
| 4 | IAM-02 dependency accepted | Complete |
| 5 | SEC-01 dependency accepted | Complete |
| 6 | CFG-01 dependency accepted | Complete |
| 7 | CLT-01 dependency accepted | Complete |
| 8 | KYC-01 dependency accepted | Complete |
| 9 | Screening case creation defined | Pending |
| 10 | Handoff vs outcome separation defined | Pending |
| 11 | KYC pass vs AML clear boundary defined | Pending |
| 12 | Sanctions/PEP/adverse media screening defined | Pending |
| 13 | List/provider version capture defined | Pending |
| 14 | Match score/threshold defined | Pending |
| 15 | False-positive/true-hit review defined | Pending |
| 16 | True-hit hard-block and escalation defined | Pending |
| 17 | Outcome publication to CLT defined | Pending |
| 18 | KYC EDD trigger defined | Pending |
| 19 | Ongoing rescreening defined | Pending |
| 20 | Travel Rule screening support defined | Pending |
| 21 | STR/tipping-off protection defined | Pending |
| 22 | Vendor/list integrity defined | Pending |
| 23 | Sensitive read/export controls defined | Pending |
| 24 | Reconciliation jobs defined | Pending |
| 25 | Tests AML1-TC-001 to AML1-TC-043 defined | Pending |
| 26 | Security sign-off | Pending |
| 27 | Compliance sign-off | Pending |
| 28 | Management sign-off | Pending |

---

## 2. Blocking Failures

1. Handoff delivery treated as AML clear.
2. KYC pass treated as AML clear.
3. Sanctions true hit can be cleared by Super Admin/break-glass.
4. False positive without reason/evidence.
5. True hit without Compliance/MLRO escalation.
6. Missing list/provider version.
7. Vendor result unauthenticated.
8. List update without rescreening.
9. Travel Rule missing data treated as clear.
10. STR/suspicion visible to unauthorised role.
11. Tipping-off possible.
12. Sensitive read/export not logged.
13. Direct DB outcome edit.
14. AML clear grants trading/deposit/withdrawal.
