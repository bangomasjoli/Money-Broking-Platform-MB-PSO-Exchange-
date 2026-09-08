# SEC-01 Audit Log / Security Monitoring  
## 14 Go-Live Checklist

## 1. SEC-01 Go-Live Gates

| # | Gate | Status |
|---:|---|---|
| 1 | SEC-01 blueprint accepted | Pending |
| 2 | FND-01 dependency accepted | Complete |
| 3 | IAM-01 dependency accepted | Complete |
| 4 | IAM-02 dependency accepted | Complete |
| 5 | Audit event schema registry defined | Pending |
| 6 | Audit ingestion defined | Pending |
| 7 | FND outbox integration defined | Pending |
| 8 | Immutable audit event store defined | Pending |
| 9 | Hash-chain design defined | Pending |
| 10 | Batch seal design defined | Pending |
| 11 | Integrity verification job defined | Pending |
| 12 | Audit failure fail-closed defined | Pending |
| 13 | Security monitoring rules defined | Pending |
| 14 | Alert lifecycle defined | Pending |
| 15 | Sensitive read logging defined | Pending |
| 16 | Evidence export controls defined | Pending |
| 17 | IAM-01/IAM-02 interim handoff defined | Pending |
| 18 | Retention/legal hold/archive defined | Pending |
| 19 | Audit access permissions defined | Pending |
| 20 | Audit admin SoD defined | Pending |
| 21 | Reconciliation jobs defined | Pending |
| 22 | Test cases SEC1-TC-001 to SEC1-TC-060 defined | Pending |
| 23 | Security sign-off | Pending |
| 24 | Compliance sign-off | Pending |
| 25 | External seal anchor defined | Pending |
| 26 | WORM/object-lock immutability defined | Pending |
| 27 | Trusted timestamp authority defined | Pending |
| 28 | Immutable/air-gapped backup defined | Pending |
| 29 | Source emission sequence defined | Pending |
| 30 | IAM-02 expected-event reconciliation defined | Pending |
| 31 | Ingestion identity binding defined | Pending |
| 32 | Clock-skew detection defined | Pending |
| 33 | SEC-01 permissions registered in IAM-02 protected-action registry | Pending |
| 34 | Incident break-glass audit-read defined | Pending |
| 35 | Interim backfill integrity-from-ingestion defined | Pending |
| 36 | Alert pipeline dead-letter/replay defined | Pending |
| 37 | Audit correction SoD defined | Pending |
| 38 | Recovery integrity verification defined | Pending |
| 39 | PII minimisation/legal retention basis defined | Pending |
| 40 | Storage jurisdiction approved | Pending |
| 41 | Management sign-off | Pending |

---

## 2. Blocking Failures

1. Audit events can be modified/deleted.
2. Audit can be disabled/bypassed.
3. Sensitive action can proceed without required audit.
4. Hash-chain integrity cannot be verified.
5. Sensitive audit read is not logged.
6. Evidence export can occur without audit/approval where required.
7. Critical alert can close without evidence.
8. IAM-01/IAM-02 interim audit handoff missing.
9. Audit metadata stores secrets.
10. Business module can directly write audit store.
11. Audit admin can modify own audit trail.
12. Security monitoring not defined for critical IAM/licence/security events.
13. Production seal is internal-only.
14. No storage-level WORM/object-lock.
15. No trusted timestamp on production seal.
16. Source emission sequence missing for sensitive streams.
17. Expected sensitive event reconciliation missing.
18. source_module not bound to ingestion identity.
19. SEC-01 permissions not registered in IAM-02.
20. Incident audit-read path bypasses audit.
21. Free-form interim backfill allowed.
22. Restored audit store can be authoritative before verification.
23. Alert pipeline backlog can suppress Critical monitoring.
24. Audit correction can hide original event or be created by original actor.
25. Audit storage jurisdiction not approved for PSO/payment audit data.
