# IAM-02 RBAC / Permission Guard / SoD  
## 14 Go-Live Checklist

## 1. IAM-02 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | IAM-02 blueprint accepted | Pending |
| 2 | FND-01 dependency accepted | Complete |
| 3 | IAM-01 dependency accepted | Complete |
| 4 | Role catalogue implemented | Pending |
| 5 | Permission catalogue implemented | Pending |
| 6 | Permission guard implemented | Pending |
| 7 | Maker-checker engine implemented | Pending |
| 8 | Self-approval block implemented | Pending |
| 9 | SoD matrix implemented | Pending |
| 10 | Approval policy engine implemented | Pending |
| 11 | IAM-01 step-up integration implemented | Pending |
| 12 | Licence-locked permission deny implemented | Pending |
| 13 | Delegation implemented | Pending |
| 14 | Temporary permission expiry implemented | Pending |
| 15 | Break-glass workflow implemented | Pending |
| 16 | Break-glass post-review implemented | Pending |
| 17 | Permission cache invalidation implemented | Pending |
| 18 | Revocation propagation implemented | Pending |
| 19 | Client-side dual authorization support implemented | Pending |
| 20 | Sensitive read logging implemented | Pending |
| 21 | Service account approval block implemented | Pending |
| 22 | Reconciliation jobs implemented | Pending |
| 23 | Test suite IAM2-TC passed | Pending |
| 24 | Security sign-off | Pending |
| 25 | Compliance sign-off | Pending |
| 26 | Approval payload hash implemented | Pending |
| 27 | Decision token implemented | Pending |
| 28 | Protected-action registry implemented | Pending |
| 29 | Guard-coverage/orphan-action check implemented | Pending |
| 30 | SoD risk acceptance controls implemented | Pending |
| 31 | IAM-02 meta-SoD implemented | Pending |
| 32 | SoD matrix versioning/integrity reconciliation implemented | Pending |
| 33 | Break-glass whitelist/ceiling implemented | Pending |
| 34 | Break-glass max duration/concurrent limit implemented | Pending |
| 35 | Interim CFG-01 sealed licence-lock source implemented | Pending |
| 36 | Interim SEC-01 audit authority contract implemented | Pending |
| 37 | Positive cache version check implemented | Pending |
| 38 | Re-delegation block implemented | Pending |
| 39 | Management sign-off for permission model | Pending |

---

## 2. Blocking Failures

1. Permission guard default allow.
2. Unknown permission allowed.
3. Self-approval possible.
4. SoD conflict not blocked.
5. Licence-locked permission grant possible.
6. Break-glass can bypass audit/licence lock.
7. Temporary permission without expiry.
8. Delegation without expiry.
9. Revoked permission still works.
10. Client maker can approve own action.
11. Service account can approve human action.
12. Sensitive read not audited.
13. Permission cache stale after revocation.
14. Approval can execute with changed payload hash.
15. Action can execute without fresh decision token where required.
16. Sensitive action not registered in protected-action registry.
17. Critical SoD conflict can be risk accepted.
18. SoD matrix editor can assign roles/permissions.
19. Break-glass can grant IAM-02 admin, SoD, licence, or Exchange permission.
20. CFG-01/SEC-01 interim contract absent.
21. Delegation can be re-delegated.
