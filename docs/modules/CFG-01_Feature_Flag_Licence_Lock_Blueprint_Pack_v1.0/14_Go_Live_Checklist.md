# CFG-01 Feature Flag / Licence Lock  
## 14 Go-Live Checklist

## 1. CFG-01 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | CFG-01 blueprint accepted | Pending |
| 2 | FND-01 dependency accepted | Complete |
| 3 | IAM-01 dependency accepted | Complete |
| 4 | IAM-02 dependency accepted | Complete |
| 5 | SEC-01 dependency accepted | Complete |
| 6 | Licence profile registry defined | Pending |
| 7 | Feature registry defined | Pending |
| 8 | Prohibited feature registry defined | Pending |
| 9 | Exchange-pending locks defined | Pending |
| 10 | Runtime evaluation defined | Pending |
| 11 | Decision token/version check defined | Pending |
| 12 | Feature change workflow defined | Pending |
| 13 | Licence profile change workflow defined | Pending |
| 14 | Kill-switch workflow defined | Pending |
| 15 | Deployment gate defined | Pending |
| 16 | IAM-02 integration defined | Pending |
| 17 | SEC-01 audit integration defined | Pending |
| 18 | Interim handoff reconciliation defined | Pending |
| 19 | Drift reconciliation defined | Pending |
| 20 | Client-class/environment constraints defined | Pending |
| 21 | Tests CFG1-TC-001 to CFG1-TC-060 defined | Pending |
| 22 | Security sign-off | Pending |
| 23 | Compliance sign-off | Pending |
| 24 | Management sign-off | Pending |

---

## 2. Blocking Failures

1. Prohibited feature can be enabled.
2. Exchange feature can be enabled while Exchange pending.
3. IAM-02 permission can override licence lock.
4. Super Admin can bypass licence lock.
5. Break-glass can enable locked feature.
6. Feature state unknown but action allowed.
7. Licence state unknown but action allowed.
8. Stale feature token/cache allowed.
9. Deployment can activate unregistered feature.
10. Sensitive feature decision missing SEC-01 audit.
11. Kill-switch can disable audit/IAM/SEC/licence control.
12. Interim handoff mismatch unresolved.
13. Doc00 prohibited feature missing from CFG-01.
14. Feature change can self-approve.
