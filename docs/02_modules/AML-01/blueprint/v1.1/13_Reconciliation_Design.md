# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 13 Reconciliation Design

## 1. Purpose

AML-01 reconciliation detects missing cases, missing outcomes, unresolved matches, stale list versions, missing publications, missed KYC triggers, missing restrictions and sensitive access gaps.

---

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| Handoff vs case | CLT/KYC handoff | screening_case | Detect missing case |
| Case vs outcome | screening_case | aml_outcome | Detect missing outcome |
| Outcome vs matches | aml_outcome | match_candidate/decision | Detect clear with unresolved match |
| True hit vs CLT | true-hit decision | CLT status feedback | Detect missing restriction |
| True hit vs KYC | true-hit/EDD decision | KYC trigger publication | Detect missing EDD trigger |
| List update vs rescreening | list provider version | rescreening_run | Detect missing rescreen |
| Outcome publication | aml_outcome | outcome_publication/CLT | Detect unpublished outcome |
| Travel Rule data | travel_rule_screening | required fields | Detect missing-data clear |
| STR access | str_case/sensitive_access | SEC-01 | Detect unlogged/unauthorised read |

---

## 3. Scheduled Jobs

1. Handoff without screening case scan.
2. Case without outcome scan.
3. Clear outcome with unresolved match scan.
4. True hit without CLT restriction scan.
5. True hit without KYC EDD trigger scan.
6. List update without rescreen scan.
7. Stale outcome still clear scan.
8. Travel Rule missing-data clear scan.
9. STR unauthorised access scan.
10. Sensitive read/export missing audit scan.

---

## 4. Critical Findings

| Finding | Severity |
|---|---|
| Sanctions true hit not restricted | Critical |
| Clear outcome with unresolved match | Critical |
| List update without rescreen | Critical |
| KYC pass treated as AML clear | Critical |
| Travel Rule missing data treated clear | Critical |
| STR visible to unauthorised role | Critical |
| Tipping-off attempt | Critical |
| Sensitive AML read without SEC-01 audit | Critical |
| Direct DB outcome edit suspected | Critical |

---

## 5. Output

Each reconciliation run produces:

1. run ID.
2. checked counts.
3. findings.
4. severity.
5. affected case/outcome IDs.
6. SEC-01 audit refs.
7. recommended action.
8. reviewer sign-off where required.

## v1.1 Additional Reconciliation

Additional scheduled jobs:

1. Transaction request without AML pre-transaction gate scan.
2. List-update SLA and interim-block scan.
3. Sanctions list coverage/freshness scan.
4. Ownership-based sanctions vs KYC-01 UBO graph scan.
5. Screening input completeness scan.
6. STR clock/deadline scan.
7. Sanctions false-positive re-attestation scan.
8. Match threshold below floor scan.
9. AML outcome seal/hash/freshness scan.
10. PEP/RCA/country policy coverage scan.
11. De-listing/unblock review scan.
12. Travel Rule threshold/sunrise policy scan.

Critical findings:

1. Transaction proceeded without required sanctions gate.
2. Affected party transacted before list-update rescreen.
3. Entity clear despite sanctioned 50 percent owner.
4. AML clear with incomplete input.
5. STR deadline breach.
6. Sanctions false positive without dual review.
7. CLT used revoked/hash-invalid AML outcome.
