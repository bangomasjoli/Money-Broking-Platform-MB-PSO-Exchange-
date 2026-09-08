# SEC-01 Audit Log / Security Monitoring  
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | SEC-01 |
| Module name | Audit Log / Security Monitoring |
| Pack version | v1.2 |
| Status | Accepted / final verified; v1.2 is final rollup only, no substantive control change from v1.1 |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Security / Audit / Evidence / Monitoring |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2 |
| Becomes authority for | Audit log store, immutable audit evidence, security event monitoring, alerting, audit export |

Base documents:
- 00_Licence_Scope_And_Feature_Lock_v1.3.md
- 01_Project_Charter_v1.3.md
- 02_Software_Requirement_Specification_v1.2.md
- 03_Master_Module_Index_v1.2.md
- 04_Role_And_Permission_Matrix_v1.2.md
- 05_Master_Workflow_Map_v1.2.md
- 06_Master_System_Rules_v1.2.md
- 07_Master_Data_Flow_v1.2.md
- 08_Master_Technical_Architecture_v1.2.md
- 09_Master_Security_Architecture_v1.2.md
- 10_Master_Testing_Strategy_v1.2.md
- 11_Master_Deployment_Strategy_v1.2.md
- FND-01_Platform_Foundation_Blueprint_Pack_v1.2
- IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.2
- IAM-02_RBAC_Permission_Guard_SoD_Blueprint_Pack_v1.2


---

## 2. Module Purpose

SEC-01 is the authoritative audit and security monitoring module.

It must provide:

1. Immutable audit event ingestion.
2. Audit event validation.
3. Audit sequence integrity.
4. Hash-chain / tamper-evidence.
5. Event signing or seal reference.
6. Event retention.
7. Event search and evidence export.
8. Security event monitoring.
9. Alerting and escalation.
10. Security incident handoff.
11. Audit evidence reconciliation.
12. Protection against audit deletion, modification, or disablement.
13. Authoritative audit handoff from IAM-01/IAM-02 interim audit indexes.

SEC-01 answers:

```txt
What happened, who did it, when, from where, under which approval/session/context, and can the evidence be trusted?
```

---

## 3. In Scope

SEC-01 covers:

1. Authoritative audit event store.
2. Audit event ingestion API.
3. FND audit/outbox consumption.
4. Event validation.
5. Event schema registry.
6. Event category and severity classification.
7. Event sequence numbering.
8. Per-tenant/per-module/event hash chain.
9. Tamper-evident event sealing.
10. Write-once audit storage design.
11. Security monitoring rules.
12. Security alert generation.
13. Alert triage lifecycle.
14. Incident escalation interface.
15. Audit evidence search.
16. Audit export package.
17. Sensitive audit read logging.
18. Audit retention policy.
19. Audit reconciliation jobs.
20. Audit integrity verification.
21. IAM-01 and IAM-02 interim audit handoff.
22. Audit monitoring dashboard data.
23. Security event notification.
24. Audit access control.
25. Production audit access evidence.

---

## 4. Out of Scope

SEC-01 does not implement:

1. Authentication, MFA, session management.
2. RBAC / permission decision engine.
3. Feature flags or licence-lock source of truth.
4. KYC / KYB.
5. AML / sanctions / Travel Rule.
6. Ledger posting.
7. Trading / quote / LP execution.
8. Payment or settlement execution.
9. Case management beyond security alert lifecycle.
10. SIEM vendor selection or managed SOC contract.
11. Regulatory reporting content generation.

SEC-01 stores and monitors events. It does not own the business action itself.

---

## 5. Critical Principles

### 5.1 Audit Must Be Authoritative

Once SEC-01 is live, SEC-01 is the authoritative audit store.

Earlier module local audit indexes are non-authoritative and must reconcile to SEC-01.

### 5.2 Audit Must Be Immutable

Audit events must not be modified or deleted through normal application paths.

Corrections must be append-only.

### 5.3 Audit Failure Must Fail Closed for Sensitive Actions

For sensitive actions, if required audit event cannot be persisted or queued through FND outbox, the action must fail closed.

Examples:

1. Permission change.
2. MFA reset approval.
3. Break-glass activation.
4. Payout destination change.
5. Withdrawal approval.
6. Trade approval.
7. Ledger posting.
8. Settlement approval.
9. Licence-lock/feature change.
10. Production privileged access.

### 5.4 No Audit Bypass

The platform must not contain permissions, flags, service accounts, or emergency flows that bypass audit.

Prohibited:

```txt
audit.delete
audit.modify
audit.disable
audit.bypass
bypass_audit
break_glass_without_audit
```

### 5.5 Tamper Evidence

SEC-01 must make tampering detectable using:

1. Monotonic sequence.
2. Previous hash reference.
3. Current event hash.
4. Batch seal.
5. Integrity verification job.
6. Alert on gap/hash mismatch.


### 5.5A External Seal Anchoring and Storage-Level Immutability

SEC-01 tamper evidence must not rely only on SEC-01's own database or application permissions.

Rules:

1. Audit event batches must be externally anchored.
2. External anchoring must use WORM/object-lock storage with retention lock and trusted timestamp authority or equivalent independent timestamp/ledger anchoring.
3. `seal_method = external` is mandatory for authoritative production audit sealing.
4. Internal seal is allowed only for development/test or pre-production non-authoritative evidence.
5. Audit storage immutability must be enforced at storage/object-lock level, not only by application SQL grants.
6. Immutable or air-gapped WORM backup is required.
7. Restore from backup must pass hash-chain and external seal reconciliation before restored data is treated as authoritative.
8. No single identity may write audit events, control seal anchors, control object-lock policy, and close its own audit evidence.

Parameters:

```txt
audit_seal_anchor = external_worm_plus_timestamp_authority
audit_store_immutability = storage_object_lock_not_runtime_grant_only
audit_backup = immutable_air_gapped_worm
audit_self_admin_sod = operator_ne_seal_controller
```

### 5.5B Source Completeness and Anti-Suppression

SEC-01 hash chain proves integrity of stored events, not completeness of events that should have existed.

SEC-01 must therefore implement:

1. Per-source-module emission sequence assigned by the source module.
2. Verification of source sequence continuity.
3. Expected-event reconciliation against IAM-02 protected-action registry.
4. SLA-based check that every sensitive protected action has required audit event within defined time.
5. Critical alert when a sensitive action has no matching audit event within SLA.
6. FND outbox commit coupling: sensitive action commit must imply audit outbox enqueue.

Parameters:

```txt
source_emission_sequence_required = true
expected_event_reconciliation = iam2_action_registry_to_audit_within_sla
expected_event_sla_seconds = to_be_defined
audit_ingestion_transaction_coupled = fnd_outbox_commit_implies_enqueue
```

### 5.5C Ingestion Authenticity

SEC-01 must verify that an audit event came from the module it claims to represent.

Rules:

1. `source_module` must be bound to authenticated ingestion credential.
2. SEC-01 must reject ingestion where payload `source_module` does not match authenticated ingestion identity/scope.
3. Ingestion credentials must be module-scoped.
4. Over-scoped ingestion service accounts are prohibited.
5. Cross-module event submission is prohibited unless explicitly approved integration route exists and is separately audited.

Parameter:

```txt
source_module_bound_to_ingest_identity = true
```

### 5.5D Trusted Time and Chain Order

SEC-01 must distinguish source-reported event time from trusted evidence time.

Rules:

1. `occurred_at_utc` is source-attested but not independently trusted.
2. `ingested_at_utc` is SEC-01 ingestion time.
3. Hash-chain order is ingestion order.
4. External seal must carry trusted timestamp.
5. SEC-01 must detect and flag clock skew between `occurred_at_utc` and `ingested_at_utc`.
6. Events exceeding clock-skew threshold are flagged/quarantined for review but still preserved.

Parameters:

```txt
trusted_timestamp_on_seal = required
occurred_at_utc_skew_max_seconds = to_be_defined
chain_order = ingestion_order_documented
```

### 5.6 Sensitive Read Is Also Audited

Reading sensitive audit data is itself auditable.

Examples:

1. Exporting security event logs.
2. Reading privileged audit trails.
3. Reading client sensitive audit events.
4. Reading break-glass records.
5. Reading permission decision evidence.
6. Reading login/session anomaly evidence.

### 5.7 Security Monitoring

SEC-01 must detect and alert on suspicious or critical activity, including:

1. Failed login spikes.
2. MFA reset abuse.
3. Session anomaly.
4. Permission escalation.
5. Self-approval attempt.
6. SoD conflict.
7. Break-glass activation.
8. Audit ingestion failure.
9. Audit hash mismatch.
10. Licence-locked permission attempt.
11. Multiple failed withdrawal approvals.
12. LP/vendor integration anomaly.
13. Production privileged access.
14. Service account anomaly.
15. Data export anomaly.

### 5.8 Alerting Must Be Actionable

Every alert must include:

1. Severity.
2. Trigger rule.
3. Actor.
4. Event references.
5. Affected entity/client/module.
6. Recommended triage action.
7. SLA.
8. Escalation path.

### 5.9 Audit Evidence Must Be Exportable

SEC-01 must support controlled evidence export for:

1. Internal audit.
2. External audit.
3. Board review.
4. LFSA/regulatory review.
5. Incident investigation.
6. Legal/dispute evidence.

Exports must be access controlled, approved where sensitive, watermarked/traceable, and logged.


### 5.9A IAM-02 Access Continuity and Circular Dependency Control

SEC-01 read/export/admin access is governed by IAM-02, but incident response must not be blocked when IAM-02 is degraded.

Rules:

1. All `sec1.*` permissions must be registered in IAM-02 protected-action registry.
2. SEC-01 SoD rules must be registered in IAM-02.
3. Normal SEC-01 access requires IAM-02 permission guard.
4. Emergency incident audit-read path is allowed only as IAM-02 break-glass read access.
5. Emergency access is not an audit bypass.
6. Emergency audit-read must itself be audit logged, externally sealed, time-boxed, scoped, and post-reviewed.
7. Break-glass read does not allow audit modification, deletion, suppression, or rule changes.
8. If IAM-02 is degraded, a pre-registered emergency access procedure may permit read-only evidence access with dual approval and mandatory post-event reconciliation.

Parameters:

```txt
sec1_permissions_registered_in_iam02 = true
audit_read_incident_break_glass = allowed_fully_audited_no_bypass
```

### 5.9B Interim Backfill Integrity

Interim IAM-01/IAM-02 events before SEC-01 live cannot become tamper-evident before SEC-01 ingestion time.

Rules:

1. Backfilled interim events must be sourced from FND outbox delivery evidence only.
2. Free-form historical inserts are prohibited.
3. Backfilled events must be marked `backfilled = true`.
4. Backfilled events must carry `integrity_from = ingestion_time`.
5. SEC-01 must not claim pre-SEC-01 chain integrity for events that were not sealed at original occurrence.
6. Missing sensitive interim event remains Critical.

Parameters:

```txt
interim_backfill_source = fnd_outbox_delivery_evidence_only
interim_backfill_integrity_from = ingestion_time_marked
```

### 5.10 Licence Scope Protection

SEC-01 must monitor and alert on any attempt to enable or use Exchange-locked/prohibited features.

SEC-01 is not the licence-lock source of truth, but it must detect and evidence breach attempts.


### 5.11 Data Protection, Retention Basis, and Jurisdiction

SEC-01 must minimise personal data in audit while preserving legally required audit evidence.

Rules:

1. Audit evidence is retained on legal/regulatory/legitimate-interest basis where applicable.
2. Erasure requests do not delete immutable audit evidence required for legal/regulatory purposes.
3. PII in audit metadata must be minimised, referenced, masked, hashed, or pseudonymised where possible.
4. Raw personal data is stored only when required for evidence and approved by classification rules.
5. Storage jurisdiction for PSO/client/payment-related audit data must be approved before production.
6. Legal hold overrides normal retention/archive lifecycle.
7. Retention schedule must be defined by regulatory class before go-live.

Parameters:

```txt
pii_in_audit = reference_or_pseudonymised
erasure_vs_audit = audit_retained_legal_basis
audit_storage_jurisdiction = to_be_defined
```

---

## 6. Actors

| Actor | Role in SEC-01 |
|---|---|
| System Module | Emits audit/security events |
| FND Outbox Worker | Delivers events |
| Security Admin | Reviews security alerts |
| Compliance Officer / MLRO | Reviews compliance/security evidence |
| Operations Manager | Reviews operational alerts |
| Auditor | Read-only audit evidence access |
| Super Admin | Limited admin, cannot modify/delete audit history |
| Incident Manager | Owns escalated incident |
| Service Account | Scoped event ingestion/search automation |
| Regulator/External Auditor | Evidence recipient through export process |

---

## 7. Dependencies

### 7.1 Upstream Dependencies

1. FND-01 request/correlation ID.
2. FND-01 audit/outbox contract.
3. FND-01 scheduler/job baseline.
4. FND-01 DB isolation baseline.
5. IAM-01 authentication/session events.
6. IAM-02 permission and approval events.
7. IAM-02 permission guard for SEC-01 read/export/admin access.

### 7.2 Downstream Dependencies

SEC-01 supports all modules that require authoritative audit evidence.

Priority modules:

1. CFG-01 Feature Flag / Licence Lock.
2. KYC/KYB modules.
3. AML/Travel Rule modules.
4. Wallet/payout whitelist modules.
5. Trading/quote modules.
6. Ledger/settlement modules.
7. Reconciliation modules.
8. Admin/staff/client portals.

---

## 8. Components

| Component | Description |
|---|---|
| Audit Ingestion API | Accepts validated audit events |
| Audit Outbox Consumer | Consumes FND audit/outbox events |
| Source Sequence Verifier | Verifies source-module emission sequence continuity |
| Expected Event Reconciler | Reconciles IAM-02 protected actions to required audit events |
| Event Schema Registry | Defines event types and mandatory fields |
| Event Validator | Validates event schema, actor, module, severity and ingestion identity binding |
| Audit Event Store | Authoritative immutable audit records |
| Event Hash Chain | Per stream tamper-evident chain |
| Batch Seal Service | Periodic batch sealing |
| External Seal Anchor | WORM/object-lock and trusted timestamp anchoring outside SEC-01 DB trust domain |
| Trusted Timestamp Service | Trusted timestamp on seal batches |
| Integrity Verification Job | Detects gaps/hash mismatch/tampering and validates external seal anchor |
| Audit Search Service | Controlled search/read |
| Evidence Export Service | Generates traceable export packages |
| Sensitive Read Logger | Logs reads/searches/exports |
| Security Rule Engine | Applies security monitoring rules |
| Alert Engine | Creates and routes security alerts with backlog/failure handling |
| Alert Triage Service | Tracks alert lifecycle |
| Incident Handoff Interface | Sends/escalates incident items |
| Retention Manager | Applies retention/archival policy |
| Reconciliation Jobs | Reconcile interim/local audit indexes, source sequences, protected actions, seals, backups, and source events |
| Monitoring Dashboard | Operational/security metrics |

---

## 9. Functional Requirements

### SEC1-FR-001 Authoritative Audit Store

The platform shall store authoritative audit events in SEC-01.

### SEC1-FR-002 Event Ingestion

The platform shall ingest audit events from modules through API and/or FND outbox.

### SEC1-FR-003 Event Validation

The platform shall reject malformed audit events and alert on invalid critical events.

### SEC1-FR-004 Event Schema Registry

The platform shall maintain a registry of event types, categories, severity, mandatory fields, retention class, and sensitivity.

### SEC1-FR-005 Event Hash Chain

The platform shall hash-chain audit events per stream.

### SEC1-FR-006 Batch Seal

The platform shall seal audit event batches periodically.

### SEC1-FR-007 Tamper Detection

The platform shall run integrity verification jobs and alert on gaps/hash mismatch.

### SEC1-FR-008 Sensitive Read Logging

The platform shall log reads/searches/exports of sensitive audit evidence.

### SEC1-FR-009 Evidence Export

The platform shall generate controlled evidence export packages.

### SEC1-FR-010 Security Rule Engine

The platform shall apply security monitoring rules.

### SEC1-FR-011 Alert Lifecycle

The platform shall create, assign, escalate, close, and evidence security alerts.

### SEC1-FR-012 Audit Failure Handling

The platform shall fail closed for sensitive actions if required audit persistence or outbox enqueue fails.

### SEC1-FR-013 Interim Audit Handoff

The platform shall reconcile IAM-01/IAM-02 interim local audit indexes into SEC-01.

### SEC1-FR-014 Audit Retention

The platform shall retain audit events according to records, regulatory, security, and legal requirements.

### SEC1-FR-015 Audit Access Control

The platform shall require IAM-02 permission and approval/step-up where needed for audit reads/exports/admin.

### SEC1-FR-016 Audit Admin Protection

The platform shall prohibit audit deletion/modification/disablement permissions.

### SEC1-FR-017 Event Search

The platform shall support controlled search by event type, actor, entity, client, module, correlation ID, request ID, time range, and severity.

### SEC1-FR-018 Event Replay / Reconciliation

The platform shall support idempotent event ingestion and source/outbox reconciliation.

### SEC1-FR-019 Security Alert Notifications

The platform shall notify defined recipients for Critical/High alerts.

### SEC1-FR-020 Production Access Evidence

The platform shall record and monitor privileged production access events.

### SEC1-FR-021 External Seal Anchor

The platform shall externally anchor audit seal batches using WORM/object-lock storage and trusted timestamp authority or equivalent independent anchoring.

### SEC1-FR-022 Storage-Level Immutability

The platform shall enforce storage-level immutability, not only application permission immutability.

### SEC1-FR-023 Immutable Backup

The platform shall maintain immutable/air-gapped WORM backups for audit evidence.

### SEC1-FR-024 Source Emission Sequence

The platform shall require and verify per-source-module emission sequence continuity.

### SEC1-FR-025 Expected Event Reconciliation

The platform shall reconcile IAM-02 protected sensitive actions to expected audit events within SLA.

### SEC1-FR-026 Ingestion Identity Binding

The platform shall bind `source_module` to authenticated ingestion identity and reject mismatches.

### SEC1-FR-027 Trusted Timestamp

The platform shall apply trusted timestamp to external seal batches.

### SEC1-FR-028 Clock Skew Detection

The platform shall detect and flag source event clock skew beyond configured threshold.

### SEC1-FR-029 IAM-02 SEC-01 Permission Registration

The platform shall register all `sec1.*` permissions and protected actions in IAM-02.

### SEC1-FR-030 Incident Break-Glass Audit Read

The platform shall support a fully audited, read-only, time-boxed incident break-glass audit-read path without audit bypass.

### SEC1-FR-031 Interim Backfill Integrity

The platform shall backfill interim IAM-01/IAM-02 audit only from FND outbox delivery evidence and mark integrity-from-ingestion.

### SEC1-FR-032 Alert Pipeline Failure Handling

The platform shall dead-letter, alert, and guarantee eventual rule evaluation for Critical categories when monitoring rule evaluation fails or backlogs.

### SEC1-FR-033 Audit Correction SoD

The platform shall prevent the correction creator/approver from being the subject or actor of the original event.

### SEC1-FR-034 Recovery Integrity

The platform shall verify hash-chain and external seal reconciliation after restore before audit store is authoritative.

### SEC1-FR-035 Data Protection Basis

The platform shall minimise PII while retaining immutable audit evidence on legal/regulatory basis where required.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Audit event immutability | Required at application and storage/WORM layer |
| Audit deletion/modification | Prohibited |
| Event hash-chain integrity | Required |
| Event batch sealing | External anchor with trusted timestamp required |
| Sensitive action audit failure | Fail closed |
| Ingestion idempotency | Required |
| Event ordering | Monotonic per stream |
| Search access | IAM-02 controlled |
| Sensitive read logging | Required |
| Alerting for Critical events | Required |
| Reconciliation | Required |
| Retention | Policy-controlled |
| Data classification | Restricted / Security Critical |
| Export traceability | Required |
| Recovery from outbox backlog | Required |
| Missing event detection | Source sequence + expected-event reconciliation required |
| Ingestion authenticity | source_module bound to authenticated ingestion identity |
| Trusted timestamp | Required on external seal |
| Immutable backup | Required |
| Incident break-glass audit read | Read-only, time-boxed, fully audited |
| Alert pipeline failure | Dead-letter + guaranteed critical evaluation |
| Recovery integrity | Verify chain and seals before authoritative use |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

SEC-01 must not allow:

1. Audit event deletion.
2. Audit event modification.
3. Audit log disablement.
4. Audit bypass.
5. Silent ingestion failure for sensitive event.
6. Sensitive action proceeding without required audit event/outbox.
7. Unauthorised audit export.
8. Unlogged sensitive audit read.
9. Break-glass without audit.
10. Permission change without audit.
11. Production privileged access without audit.
12. Manual sequence correction without append-only correction event.
13. Hash-chain reset without governance and evidence.
14. Alert closure without reason/evidence.
15. Critical alert suppression without approval.
16. Service account broad audit read/export.
17. Audit admin modifying own audit trail.
18. Audit storage direct write by business module.
19. Retention deletion before approved retention period.
20. Licence-locked/prohibited feature activation without Critical alert.
21. Production audit seal stored only inside SEC-01 database.
22. Recomputing audit chain without external seal mismatch detection.
23. Source module spoofing by ingestion credential.
24. Free-form historical backfill.
25. Claiming pre-SEC-01 chain integrity for backfilled interim events.
26. Audit read incident access without audit logging.
27. Audit correction by original event subject/actor.
28. Treating restored audit backup as authoritative before chain/seal verification.
29. Suppressing alert evaluation failure or backlog.
30. Deleting immutable audit evidence due erasure request where legal/regulatory retention applies.

---

## 12. Acceptance Criteria

SEC-01 is accepted only if:

1. SEC-01 authoritative audit store is defined.
2. Audit event ingestion is defined.
3. Event schema registry is defined.
4. Event validation rules are defined.
5. Hash-chain / tamper-evidence is defined.
6. Batch sealing is defined.
7. Sensitive action audit failure fail-closed rule is defined.
8. Sensitive read logging is defined.
9. Evidence export controls are defined.
10. Security monitoring rules are defined.
11. Alert lifecycle is defined.
12. IAM-01/IAM-02 interim audit handoff is defined.
13. Audit access control through IAM-02 is defined.
14. Audit deletion/modification/disablement is prohibited.
15. Reconciliation jobs are defined.
16. Critical tests pass.
17. External seal anchoring is defined.
18. Storage-level WORM/object-lock immutability is defined.
19. Immutable/air-gapped backup is defined.
20. Source emission sequence is defined.
21. Expected-event reconciliation to IAM-02 protected-action registry is defined.
22. Ingestion identity binding is defined.
23. Trusted timestamp and clock-skew detection are defined.
24. IAM-02 registration of `sec1.*` permissions is defined.
25. Incident break-glass audit-read is defined.
26. Interim backfill integrity-from-ingestion is defined.
27. Alert pipeline failure handling is defined.
28. Recovery integrity verification is defined.
29. Data protection and retention basis are defined.
30. Go-live checklist complete.

---

## 13. Open Items

1. Final audit retention period by event class.
2. Final batch seal interval.
3. Final hash algorithm and canonical event format.
4. Final audit storage technology.
5. Final alert notification channels.
6. Final alert SLA by severity.
7. Final evidence export format.
8. Final SIEM/SOC integration choice.
9. Final regulator/auditor export procedure.
10. Final production access event source.
11. Final backup/archive design.
12. Final legal hold process.
13. Final trusted timestamp authority / external anchor provider.
14. Final WORM/object-lock storage configuration.
15. Final immutable backup storage and restore procedure.
16. Final source-emission sequence format.
17. Final expected-event SLA seconds.
18. Final occurred_at_utc skew threshold.
19. Final SEC-01 permission registration handoff into IAM-02.
20. Final incident break-glass audit-read procedure.
21. Final storage jurisdiction for PSO/payment audit data.
22. Final alert pipeline dead-letter and replay configuration.
