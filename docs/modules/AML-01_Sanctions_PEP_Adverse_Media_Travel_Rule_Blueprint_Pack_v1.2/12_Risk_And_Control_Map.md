# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| AML1-RISK-001 | Handoff treated as AML clear | AML bypass | Outcome separation | AML1-TC-003 |
| AML1-RISK-002 | KYC pass treated as AML clear | Screening bypass | KYC/AML boundary | AML1-TC-004 |
| AML1-RISK-003 | Sanctions true hit cleared | Regulatory breach | Hard block/MLRO escalation | AML1-TC-007/015-017 |
| AML1-RISK-004 | False positive without evidence | Bad clearance | Review reason/evidence | AML1-TC-013/014 |
| AML1-RISK-005 | Vendor/list spoofing | False screening | Source auth/payload hash | AML1-TC-011/012 |
| AML1-RISK-006 | List update not rescreened | Stale screening | Rescreening | AML1-TC-025-029 |
| AML1-RISK-007 | Outcome not published to CLT | Incorrect onboarding | Publication/recon | AML1-TC-021/022 |
| AML1-RISK-008 | KYC EDD trigger missing | CDD gap | KYC trigger recon | AML1-TC-023/041 |
| AML1-RISK-009 | Travel Rule missing data clear | Transfer compliance breach | Missing-data outcome | AML1-TC-031 |
| AML1-RISK-010 | Tipping-off | Legal/regulatory breach | Tipping-off guard | AML1-TC-035-036 |
| AML1-RISK-011 | STR data overexposed | Confidentiality breach | Restricted access | AML1-TC-035/038 |
| AML1-RISK-012 | Direct DB outcome edit | Control bypass | Append/recon/audit | AML1-TC-043 |

## Critical Controls

1. KYC pass vs AML clear boundary.
2. Sanctions true-hit hard block.
3. Match review maker-checker.
4. List/provider version capture.
5. Vendor source authentication.
6. Outcome publication to CLT.
7. KYC EDD trigger.
8. Ongoing rescreening.
9. Travel Rule missing-data control.
10. STR/tipping-off guard.
11. SEC-01 sensitive read logging.

## v1.1 Additional Risk Controls

| Risk ID | Risk | Control | Tests |
|---|---|---|---|
| AML1-RISK-013 | Transaction proceeds without sanctions gate | Pre-transaction synchronous gate | AML1-TC-044-045 |
| AML1-RISK-014 | List update not handled within SLA | SLA + interim block | AML1-TC-046-048 |
| AML1-RISK-015 | Incomplete sanctions coverage | List coverage baseline | AML1-TC-049 |
| AML1-RISK-016 | Sanctioned owner controls entity | 50 percent rule using KYC UBO graph | AML1-TC-050-051 |
| AML1-RISK-017 | Thin screening input produces false clear | Input-quality gate | AML1-TC-052-053 |
| AML1-RISK-018 | STR deadline missed | STR clock/deadline | AML1-TC-055-057 |
| AML1-RISK-019 | Sanctions FP over-cleared | Dual review + re-attestation | AML1-TC-058-059 |
| AML1-RISK-020 | Clear outcome stale after new hit | Outcome revocation/freshness | AML1-TC-060-061 |
| AML1-RISK-021 | PEP/RCA or jurisdiction depth missing | PEP/RCA/country policy | AML1-TC-062-064 |
| AML1-RISK-022 | De-listing auto-unblocks | Controlled unblock | AML1-TC-065 |
| AML1-RISK-023 | Travel Rule sunrise not handled | Threshold/sunrise policy | AML1-TC-066-067 |
