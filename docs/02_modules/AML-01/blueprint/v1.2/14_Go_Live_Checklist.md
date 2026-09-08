# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 14 Go-Live Checklist

## 1. AML-01 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | AML-01 blueprint accepted | Complete |
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
| 26 | Security sign-off | Complete for blueprint acceptance |
| 27 | Compliance sign-off | Complete for blueprint acceptance |
| 28 | Management sign-off | Pending for implementation/go-live |

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

## v1.1 Additional Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 29 | Pre-transaction sanctions gate defined | Pending |
| 30 | MON/settlement/Travel Rule hard contract defined | Pending |
| 31 | List-update SLA and interim block defined | Pending |
| 32 | Mandatory sanctions list coverage defined | Pending |
| 33 | List freshness assurance defined | Pending |
| 34 | Matching-quality standard and threshold floor defined | Pending |
| 35 | Ownership-based 50 percent rule using KYC-01 graph defined | Pending |
| 36 | Minimum screening-input dataset defined | Pending |
| 37 | STR statutory clock/deadline defined | Pending |
| 38 | Pending-STR transaction policy defined | Pending |
| 39 | Sanctions false-positive dual review defined | Pending |
| 40 | Standing false-positive re-attestation defined | Pending |
| 41 | AML outcome seal/freshness/revocation defined | Pending |
| 42 | PEP/RCA/declassification handling defined | Pending |
| 43 | Country/high-risk jurisdiction source defined | Pending |
| 44 | De-listing controlled unblock defined | Pending |
| 45 | Travel Rule threshold/sunrise handling defined | Pending |
