# CLT-01 Client Onboarding / Client Profile
## 13 Reconciliation Design

## 1. Purpose

CLT-01 reconciliation detects stale applications, missing handoffs, class/status inconsistencies, unresolved duplicates, expired mandates, and downstream access drift.

---

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| Application vs CFG | client_application | CFG-01 feature decisions | Detect invalid class/onboarding |
| Application vs KYC | handoff_status | KYC/KYB module | Detect missing handoff |
| Application vs AML | handoff_status | AML module | Detect missing handoff |
| Client status vs downstream | client_profile.status | downstream access | Detect suspended/closed active access |
| Duplicate review | duplicate_candidate | application approval status | Block unresolved duplicates |
| Mandate expiry | client_mandate | authorised users/actions | Detect expired mandate |
| Profile audit | profile changes | SEC-01 refs | Detect missing audit |
| Class evidence | classification evidence | client_class | Detect unsupported class |
| Authorised users | mandate | IAM users | Detect users outside mandate |

---

## 3. Scheduled Jobs

1. Stale draft/submitted application scan.
2. Missing KYC/KYB handoff scan.
3. Missing AML handoff scan.
4. Duplicate unresolved scan.
5. Active retail/ineligible client scan.
6. Suspended/closed downstream active access scan.
7. Mandate expiry scan.
8. Sensitive profile update missing audit scan.
9. Authorised user outside mandate scan.
10. Client-class evidence expiry scan.

---

## 4. Critical Findings

| Finding | Severity |
|---|---|
| Approved client without KYC/KYB handoff | Critical |
| Approved client without AML handoff | Critical |
| Active retail/ineligible client | Critical |
| Suspended/closed client active downstream | Critical |
| Client-class upgrade without approval | Critical |
| Direct client status edit suspected | Critical |
| Sensitive profile update missing audit | Critical |
| Break-glass onboarding approval attempt | Critical |

---

## 5. Output

Each reconciliation run produces:

1. run ID.
2. checked counts.
3. findings.
4. severity.
5. affected application/client IDs.
6. SEC-01 audit refs.
7. recommended action.
8. reviewer sign-off where required.
