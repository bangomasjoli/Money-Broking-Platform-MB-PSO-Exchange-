# SEC-01 Audit Log / Security Monitoring  
## 02 Workflow

## 1. Workflow Scope

SEC-01 workflows cover audit event ingestion, validation, storage, hash-chain sealing, security monitoring, alerting, evidence export, sensitive read logging, reconciliation, and interim audit handoff.

---

## 2. WF-SEC01-01 Audit Event Ingestion

### Trigger

Any platform module emits audit/security event.

### Steps

1. Module emits event directly to SEC-01 or through FND audit outbox.
2. SEC-01 receives event.
3. Validate event schema.
4. Validate event type exists in registry.
5. Validate mandatory fields.
6. Validate actor/session/request/correlation references.
7. Check idempotency key/event ID.
8. Assign audit stream.
9. Assign monotonic sequence number.
10. Calculate event hash.
11. Link previous event hash.
12. Persist immutable audit event.
13. Emit ingestion success metric.
14. For critical events, trigger security rule evaluation.

### Fail-Closed Conditions

1. Sensitive event cannot be queued/persisted.
2. Required event fields missing.
3. Event schema unknown for sensitive action.
4. Event hash-chain state unavailable.
5. Outbox enqueue fails for sensitive action.

---

## 3. WF-SEC01-02 Hash Chain and Batch Seal

### Trigger

Audit event persisted or scheduled seal interval.

### Steps

1. Load audit stream latest sequence.
2. Compute canonical event representation.
3. Compute event hash.
4. Store previous hash reference.
5. Periodically compute batch seal hash.
6. Store seal record.
7. Run integrity verification.
8. Alert on gap, duplicate sequence, missing previous hash, or mismatch.

---

## 4. WF-SEC01-03 Security Monitoring Rule Evaluation

### Trigger

Audit/security event ingested.

### Steps

1. Identify event category/severity.
2. Load active security monitoring rules.
3. Match rule conditions.
4. Check threshold/window.
5. Create alert if rule triggered.
6. Assign severity.
7. Route alert.
8. Notify configured recipients for Critical/High alerts.
9. Link alert to audit event references.
10. Store alert evidence.

---

## 5. WF-SEC01-04 Alert Triage

### Trigger

Security alert created.

### Steps

1. Alert status = open.
2. Security/Compliance/Operations reviewer assigned.
3. Reviewer investigates linked events.
4. Reviewer records triage notes.
5. Alert is classified as true positive, false positive, duplicate, expected, or escalated.
6. If incident required, create incident handoff.
7. Closure requires reason and evidence.
8. Critical alert closure requires approval where configured.
9. Closure event audited.

---

## 6. WF-SEC01-05 Sensitive Audit Read

### Trigger

User searches/reads sensitive audit evidence.

### Steps

1. User requests audit search/read/export.
2. IAM-02 checks permission.
3. IAM-02 requires step-up/approval where sensitive.
4. SEC-01 executes search/read.
5. SEC-01 records sensitive read event.
6. SEC-01 returns minimal permitted data.
7. Export requires traceable package and export audit event.

### Rules

1. Sensitive read must be logged.
2. Unauthorised read must be denied.
3. Audit admin cannot hide own sensitive reads.
4. Export is more sensitive than read.

---

## 7. WF-SEC01-06 Evidence Export

### Trigger

Authorised user requests evidence export.

### Steps

1. User selects event scope/time range/entities.
2. IAM-02 checks export permission.
3. Sensitive export approval is created where required.
4. SEC-01 validates export scope.
5. SEC-01 generates export manifest.
6. SEC-01 includes event hashes/seal references.
7. SEC-01 watermarks/labels export.
8. SEC-01 records export audit event.
9. Export package made available through controlled channel.
10. Export access expires.

---

## 8. WF-SEC01-07 Interim Audit Handoff from IAM-01/IAM-02

### Trigger

SEC-01 goes live or reconciliation job runs.

### Steps

1. Load IAM-01/IAM-02 interim local audit indexes.
2. Match local event refs to FND outbox/SEC-01 events.
3. Ingest missing authoritative events where available.
4. Mark local index as reconciled.
5. Identify missing audit refs.
6. Raise Critical alert if sensitive audit evidence missing.
7. Produce handoff reconciliation report.

---

## 9. WF-SEC01-08 Audit Integrity Verification

### Trigger

Scheduled job, manual verification, evidence export, or incident.

### Steps

1. Select stream/time range.
2. Verify sequence continuity.
3. Verify previous hash/current hash.
4. Verify batch seal.
5. Verify no deletion/modification.
6. Verify retention/archive status.
7. Emit verification result.
8. Alert on mismatch/gap/tamper evidence.

---

## 10. WF-SEC01-09 Audit Retention / Archive

### Trigger

Retention job.

### Steps

1. Classify event retention class.
2. Check legal hold.
3. Check minimum retention period.
4. Archive eligible events using approved archival method.
5. Retain hash/seal verification metadata.
6. Never delete before retention period.
7. Audit archive action.

---

## 11. WF-SEC01-10 Audit Failure Handling

### Trigger

Audit persistence/outbox/ingestion failure.

### Steps

1. Detect audit failure.
2. Classify event/action sensitivity.
3. If sensitive action, fail closed before business commit.
4. If non-sensitive event, queue retry if safe.
5. Create security alert for repeated failures.
6. Reconcile missing events when service recovers.
7. Record incident/evidence.
