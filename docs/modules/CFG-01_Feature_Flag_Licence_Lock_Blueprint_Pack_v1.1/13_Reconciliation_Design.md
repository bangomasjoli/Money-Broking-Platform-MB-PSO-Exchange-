# CFG-01 Feature Flag / Licence Lock  
## 13 Reconciliation Design

## 1. Purpose

CFG-01 reconciliation detects drift between licence scope, feature registry, runtime decisions, deployment state, IAM-02 interim locks, SEC-01 monitoring assumptions, and Master Document 00.

---

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| Doc00 vs CFG-01 | Master Doc 00 baseline hash/seal | prohibited_feature / feature signed hash | Ensure prohibited list complete and sealed |
| IAM-02 interim | IAM-02 sealed list | CFG-01 licence locks | Handoff interim lock list |
| SEC-01 interim | SEC monitoring assumptions | CFG-01 locks | Align monitoring assumptions |
| Runtime decisions | feature_decision_log | feature/licence/prohibited versions | Detect stale/incorrect decisions |
| Deployment | deployment config | CFG feature registry | Detect unregistered feature |
| Permission registry | IAM-02 protected actions | CFG feature policies + decision token requirement | Detect missing guard/orphan gate |
| Audit | SEC-01 audit refs/FND outbox | CFG sensitive events | Detect missing audit and outage-mode backlog |
| Kill-switch | kill_switch active | runtime decisions | Ensure disabled feature denied |
| Prohibited registry | prohibited_feature | feature current_state | Detect prohibited feature enabled |
| Licence profile | verified LFSA evidence | licence_profile | Detect unsupported licence status |
| Config integrity | signed change records | live cfg1 tables | Detect out-of-band config changes |
| Exchange activation | ceremony sequence | feature/licence activation | Detect incomplete unlock |
| Environment promotion | non-prod config | production deployment | Block locked-feature promotion |

---

## 3. Scheduled Jobs

1. Doc00 prohibited feature reconciliation.
2. IAM-02 interim handoff reconciliation.
3. SEC-01 interim monitoring reconciliation.
4. Runtime feature decision reconciliation.
5. Deployment feature drift scan.
6. IAM-02 protected-action mapping scan.
7. SEC-01 audit-reference scan.
8. Kill-switch enforcement scan.
9. Licence profile evidence scan.
10. Feature review/expiry scan.
11. Decision-time config integrity scan.
12. Feature gate coverage/orphan-gate scan.
13. Exchange activation ceremony completeness scan.
14. Audit outage mode reconciliation.
15. Token revocation reconciliation after kill-switch/licence suspension.
16. Non-prod locked-feature promotion scan.

---

## 4. Critical Findings

| Finding | Severity |
|---|---|
| Prohibited Doc00 feature missing from CFG-01 | Critical |
| Prohibited feature enabled | Critical |
| Exchange feature enabled while pending | Critical |
| IAM-02 lock list mismatch | Critical |
| SEC-01 monitoring assumption mismatch | Critical |
| Deployment activates unregistered feature | Critical |
| Runtime decision allowed stale/locked feature | Critical |
| Sensitive decision missing SEC-01 audit | Critical |
| Licence profile active without evidence | Critical |
| Kill-switch active but runtime allows feature | Critical |
| Config integrity seal mismatch | Critical |
| Out-of-band config table change | Critical |
| Feature-gated action missing CFG invocation | Critical |
| Exchange activation ceremony incomplete | Critical |
| Non-prod locked feature promoted to production | Critical |
| Suspended/revoked licence with active tokens | Critical |
| Prohibited registry changed but old tokens active | Critical |

---

## 5. Reconciliation Output

Each run must produce:

1. reconciliation ID.
2. source data refs.
3. config version.
4. licence profile version.
5. matched/mismatch count.
6. critical findings.
7. blocked features.
8. SEC-01 audit refs.
9. reviewer/sign-off where required.
