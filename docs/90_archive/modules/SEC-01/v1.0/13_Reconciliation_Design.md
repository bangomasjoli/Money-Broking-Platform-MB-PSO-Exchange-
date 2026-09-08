# SEC-01 Audit Log / Security Monitoring  
## 13 Reconciliation Design

## 1. Purpose

SEC-01 reconciliation ensures audit completeness, integrity, outbox delivery, interim audit handoff, and monitoring consistency.

---

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| FND outbox vs SEC-01 | FND audit outbox | sec1.audit_event | Detect undelivered events |
| IAM-01 interim audit | IAM-01 local index | sec1.audit_event | Handoff auth/session audit |
| IAM-02 interim audit | IAM-02 local index | sec1.audit_event | Handoff permission/approval audit |
| Hash chain | audit_event sequence/hash | audit_stream latest hash | Detect gaps/tamper |
| Batch seal | audit_event range | audit_seal_batch | Verify seals |
| Event schema | event_type registry | audit_event | Detect unknown/malformed event |
| Alert coverage | monitoring rules | critical event types | Detect unmonitored critical events |
| Evidence export | export manifest | audit_event/seals | Verify export evidence |
| Sensitive read | read/export access logs | audit queries/downloads | Detect unlogged reads |
| Retention/legal hold | retention rules | archived events | Detect early archive/delete |

---

## 3. Scheduled Jobs

1. FND outbox delivery reconciliation.
2. Audit hash-chain verification.
3. Batch seal verification.
4. IAM-01/IAM-02 interim audit handoff.
5. Event schema compliance scan.
6. Critical event monitoring-rule coverage scan.
7. Sensitive read coverage scan.
8. Evidence export package verification.
9. Retention/legal hold scan.
10. Security alert SLA breach scan.

---

## 4. Reconciliation Findings

| Finding | Severity |
|---|---|
| Missing sensitive audit event | Critical |
| Hash mismatch | Critical |
| Sequence gap | Critical |
| Audit event modified/deleted | Critical |
| Critical event type without monitoring rule | High/Critical |
| Sensitive read not logged | Critical |
| Evidence export without manifest hash | High |
| Legal hold violation | Critical |
| Alert SLA breached | High |
| Interim audit handoff missing event | Critical |

---

## 5. Reconciliation Output

Each run must produce:

1. run ID.
2. source range.
3. counts checked.
4. findings.
5. severity.
6. linked audit refs.
7. recommended action.
8. alert references.
9. reviewer sign-off where required.
