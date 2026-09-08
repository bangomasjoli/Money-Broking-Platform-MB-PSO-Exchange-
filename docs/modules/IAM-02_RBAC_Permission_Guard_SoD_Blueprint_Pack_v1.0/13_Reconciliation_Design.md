# IAM-02 RBAC / Permission Guard / SoD  
## 13 Reconciliation Design

## 1. Purpose

IAM-02 reconciliation detects permission drift, expired grants, stale cache, unresolved approvals, SoD conflicts, and break-glass review gaps.

---

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| Role-permission | role_permission | permission catalogue | Detect invalid/locked permission grants |
| User-role | user_role | role catalogue | Detect invalid/expired user roles |
| SoD | user roles/permissions | SoD matrix | Detect conflicts |
| Approval | approval_request | approval_decision | Detect stale/expired approvals |
| Delegation | delegation | expiry/status | Detect expired active delegations |
| Temporary permission | temporary_permission | expiry/status | Detect expired active grants |
| Break-glass | break_glass_request | expiry/post-review | Detect active expired grants/review gaps |
| Permission cache | cache version | role/permission changes | Detect stale cache |
| Audit evidence | IAM-02 evidence | SEC-01 audit refs | Detect missing audit |
| Licence lock | permission catalogue | CFG/licence lock state | Detect active locked permissions |

---

## 3. Scheduled Jobs

IAM-02 scheduled jobs:

1. Approval expiry job.
2. Delegation expiry job.
3. Temporary permission expiry job.
4. Break-glass expiry job.
5. Break-glass post-review overdue job.
6. SoD conflict scan.
7. Permission cache version reconciliation.
8. Licence-locked permission scan.
9. Audit evidence reconciliation.

All jobs inherit FND scheduler missed-run detection.

---

## 4. Reconciliation Rules

1. Expired grant must not remain active.
2. Active locked/prohibited permission is Critical.
3. Self-approval evidence is Critical.
4. Break-glass without post-review is High/Critical.
5. Stale cache after revocation is Critical.
6. Missing SEC-01 audit reference is Critical for sensitive actions.
7. SoD conflict must create case/alert.
