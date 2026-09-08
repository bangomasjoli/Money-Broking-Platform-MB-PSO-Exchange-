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
| 25 | Management sign-off | Pending |

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
