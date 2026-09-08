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
| 24 | Config integrity seal defined | Pending |
| 25 | Decision-time integrity verification defined | Pending |
| 26 | Out-of-band config change detection defined | Pending |
| 27 | Exchange activation ceremony defined | Pending |
| 28 | LFSA evidence authenticity source defined | Pending |
| 29 | Feature-gate binding to IAM-02 defined | Pending |
| 30 | Feature-gate coverage reconciliation defined | Pending |
| 31 | Asymmetric audit outage mode defined | Pending |
| 32 | FND transaction-coupled outbox rule defined | Pending |
| 33 | All-environment prohibited lock defined | Pending |
| 34 | Synthetic-data-only non-prod exception defined | Pending |
| 35 | Kill-switch token revocation defined | Pending |
| 36 | Suspended/revoked licence token revocation defined | Pending |
| 37 | Prohibited-registry version/hash token binding defined | Pending |
| 38 | Management sign-off | Pending |

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
15. Licence/prohibited registry can be changed out-of-band without detection.
16. Decision-time integrity check missing for Exchange/prohibited features.
17. Exchange activation can occur through ordinary feature edit.
18. LFSA evidence authenticity is unverified.
19. Feature-gated action can execute without CFG-01 token.
20. SEC-01 outage bricks allowed licensed activity despite FND outbox availability.
21. Non-prod locked feature can be promoted to production.
22. Kill-switch or licence suspension leaves outstanding tokens active.
23. Prohibited-registry change does not invalidate old tokens.
