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
8. Verify `source_module` matches authenticated ingestion identity/scope.
9. Verify source emission sequence continuity for source module.
10. Assign audit stream.
11. Assign SEC-01 ingestion-order monotonic sequence number.
12. Detect `occurred_at_utc` to `ingested_at_utc` clock skew.
13. Calculate event hash.
14. Link previous event hash.
15. Persist immutable audit event.
16. Emit ingestion success metric.
17. For Critical/High events, enqueue guaranteed monitoring-rule evaluation.

### Fail-Closed Conditions

1. Sensitive event cannot be queued/persisted.
2. Required event fields missing.
3. Event schema unknown for sensitive action.
4. Event hash-chain state unavailable.
5. Outbox enqueue fails for sensitive action.
6. Source module identity mismatch.
7. Source emission sequence gap for sensitive stream.
8. Clock skew exceeds hard threshold and policy requires quarantine.

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
6. Anchor seal externally using WORM/object-lock storage and trusted timestamp authority or equivalent.
7. Store external seal reference and trusted timestamp.
8. Run integrity verification.
9. Alert on gap, duplicate sequence, missing previous hash, mismatch, external anchor mismatch, or trusted timestamp failure.

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
11. If rule evaluation fails or backlog exceeds SLA, send event to monitoring dead-letter/replay queue.
12. Critical categories require guaranteed eventual evaluation and failure alert.

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
3. Ingest missing authoritative events only where FND outbox delivery evidence exists.
4. Mark backfilled events as `backfilled = true` and `integrity_from = ingestion_time`.
5. Mark local index as reconciled.
6. Identify missing audit refs.
7. Raise Critical alert if sensitive audit evidence missing.
8. Produce handoff reconciliation report.

---

## 9. WF-SEC01-08 Audit Integrity Verification

### Trigger

Scheduled job, manual verification, evidence export, or incident.

### Steps

1. Select stream/time range.
2. Verify sequence continuity.
3. Verify previous hash/current hash.
4. Verify batch seal.
5. Verify external anchor and trusted timestamp.
6. Verify no deletion/modification.
7. Verify retention/archive status.
8. Emit verification result.
9. Alert on mismatch/gap/tamper evidence/external anchor mismatch.

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


---

## 12. WF-SEC01-11 Expected Event Reconciliation

### Trigger

Scheduled job, deployment smoke test, incident investigation, or IAM-02 protected-action registry update.

### Steps

1. Load IAM-02 protected-action registry.
2. Identify sensitive actions requiring SEC-01 audit.
3. Load action execution records/decision tokens/approval events where applicable.
4. Match each sensitive action to expected SEC-01 audit event.
5. Verify event arrived within SLA.
6. Verify event source_module and source emission sequence.
7. Create Critical alert for missing event, late event, or source-sequence gap.
8. Generate reconciliation evidence.

---

## 13. WF-SEC01-12 Incident Break-Glass Audit Read

### Trigger

Security incident requires audit evidence but normal IAM-02 path is degraded or emergency access is required.

### Steps

1. Incident responder requests read-only emergency audit access.
2. Dual authorised emergency approvers approve according to IAM-02 break-glass policy or pre-registered emergency procedure.
3. Access is scoped, time-boxed, and read-only.
4. SEC-01 records emergency access request, approval, reads, searches, and exports.
5. Emergency access cannot modify, delete, suppress, or disable audit.
6. All emergency reads are externally sealed.
7. Post-event review is mandatory.
8. Emergency access is reconciled when IAM-02 normal operation resumes.

---

## 14. WF-SEC01-13 Recovery Integrity Verification

### Trigger

Restore from backup, disaster recovery, or audit store recovery.

### Steps

1. Restore audit store to recovery environment.
2. Verify hash-chain continuity.
3. Reconcile batch seals.
4. Verify external WORM/object-lock anchor and trusted timestamp.
5. Verify immutable backup seal.
6. Run source sequence and expected-event reconciliation.
7. Produce recovery integrity report.
8. Only mark restored store authoritative if verification passes.
9. Critical alert and management/compliance sign-off required on failure.

---

## 15. WF-SEC01-14 Audit Correction

### Trigger

Approved correction to audit evidence is required.

### Steps

1. Correction request created.
2. Original event remains visible and unchanged.
3. Corrector must not be subject/actor of original event.
4. Correction requires IAM-02 approval and step-up where sensitive.
5. Append-only correction event is created.
6. Correction references original event and reason.
7. Correction is externally sealed.
8. Sensitive correction read/export remains logged.
