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
| 26 | Management sign-off for permission model | Pending |

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
