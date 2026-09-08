# WLT-01 Wallet Screening / Payout Destination Whitelist
## 13 Reconciliation Design

## 1. Purpose

WLT-01 reconciliation detects destination/control drift, stale screening, revoked destination use, cooling-off bypass, beneficiary mismatch, Travel Rule gaps, and downstream use without current eligibility.

---

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| Active destination vs client status | destination | CLT-01 status | Detect blocked client active destination |
| Destination vs AML decision | destination_decision | AML-01 outcome | Detect stale/revoked AML |
| Destination vs cooling-off | destination | cooling_off | Detect early activation |
| Wallet vs screening | wallet_destination | wallet_screening_result | Detect missing/stale screening |
| Payout vs beneficiary | payout_destination | KYC/CLT data | Detect mismatch |
| Destination vs downstream use | destination_decision | payout/settlement/deposit modules | Detect unapproved use |
| Revocation vs downstream | revocation_event | downstream modules | Confirm propagation |
| Travel Rule | destination_decision | Travel Rule/AML data | Detect missing data clear |
| Sensitive access | sensitive_access_log | SEC-01 | Detect unlogged read/export |

---

## 3. Scheduled Jobs

1. Active destination with blocked client scan.
2. Active destination with stale AML decision scan.
3. Active wallet with stale wallet screening scan.
4. Active payout with beneficiary mismatch scan.
5. Cooling-off early activation scan.
6. Revoked destination downstream use scan.
7. Decision-token scope mismatch scan.
8. High-risk wallet without Compliance approval scan.
9. Travel Rule missing data scan.
10. Sensitive read/export missing audit scan.
11. Direct whitelist DB edit scan.

---

## 4. Critical Findings

| Finding | Severity |
|---|---|
| Revoked destination used | Critical |
| Active destination with stale AML decision | Critical |
| Destination used before cooling-off complete | Critical |
| Wallet sanctions exposure active | Critical |
| High-risk wallet active without approval | Critical |
| Beneficiary mismatch active without approval | Critical |
| Travel Rule missing data treated clear | Critical |
| Direct DB whitelist edit suspected | Critical |
| Sensitive read/export without SEC-01 audit | Critical |

---

## 5. Output

Each reconciliation run produces:

1. run ID.
2. checked counts.
3. findings.
4. severity.
5. affected destination/decision IDs.
6. SEC-01 audit refs.
7. recommended action.
8. reviewer sign-off where required.
