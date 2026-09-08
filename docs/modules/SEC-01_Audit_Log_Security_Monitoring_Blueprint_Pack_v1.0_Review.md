# Principal Fintech Platform Architect Review — SEC-01 Audit Log / Security Monitoring v1.0

| Item | Details |
|---|---|
| Reviewed pack | SEC-01 Audit Log / Security Monitoring Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2 |
| Review type | Principal Fintech Platform Architect — Initial Blueprint Review |
| Verdict | Strong foundation; **5 critical gaps** before acceptance. Most serious is C1 — tamper-evidence is self-contained, so the "authoritative" store can be silently rewritten by whoever controls its own trust domain. |

---

## 0. Summary

SEC-01 is a strong, mature blueprint. It inherits FND-01 cleanly (outbox, correlation, schema-isolated `role_sec1_runtime`, scheduler), correctly implements the IAM-01/IAM-02 interim audit handoff (closing the thread IAM-02 §5.14 / IAM-01 §2.16 opened), and correctly stays **out** of being the licence-lock source of truth while still monitoring exchange-lock breach attempts (§5.10, TC-025). Hash-chain, batch seal, sensitive-action fail-closed, sensitive-read logging, evidence export, and monitoring-rule coverage reconciliation are all present. The five critical gaps are mostly about whether the evidence can actually be **trusted** and whether **missing** events are detectable — the two properties an authoritative audit store exists to guarantee.

---

## Critical Gaps

### C1 — Tamper-evidence is self-contained; the store can be silently rewritten — **HIGHEST PRIORITY**
**Area:** 05 §2.1/§2.4 (`event_hash`, `previous_hash`, `audit_seal_batch.seal_method = internal/external`), 01 §5.2/5.5, 08 §1 (SEC-01 audits itself into itself).

The hash chain and batch seals are stored **in SEC-01's own database/trust domain**, and `seal_method` allows "internal" with "external" left undefined. Immutability is asserted only at the **application layer** ("no update/delete through runtime role") — the migration/DBA/infra identity can still rewrite at the storage layer, recompute the entire chain, and re-seal. SEC-01 also audits its own admin actions **into itself**, so a compromised SEC-01 operator can tamper *and* write the "all-clean" record. An audit store that can be internally recomputed end-to-end is not authoritative.

Needed: **external/independent seal anchoring** (WORM/object-lock storage with retention lock, plus an external timestamp authority or append to an independent ledger outside SEC-01's write control); **storage-level immutability** (object-lock, not just a withheld SQL grant); **immutable/air-gapped backups** (ransomware); and **SoD so no single identity both writes events and controls the seal root / can self-audit unilaterally**.

### C2 — Completeness is unprovable: suppressed or lost source events are undetectable
**Area:** 02 WF-SEC01-01 step 9 (SEC-01 assigns the monotonic sequence at ingestion), 05 §2.1 constraint 2, 13 §2 (outbox↔SEC-01 recon).

The monotonic sequence is assigned **by SEC-01 at ingestion**. So an event that never arrives (outbox lost before enqueue, or a compromised/buggy module that simply never emits) leaves **no gap** — SEC-01's chain stays continuous. The hash chain proves *integrity of what was stored*, not *completeness of what should exist*. The outbox↔SEC-01 reconciliation only catches events that reached the outbox.

Needed: (a) a **per-source-module emission sequence** assigned by the *source* (SEC-01 verifies source-sequence continuity, so a missing/suppressed source event is detectable); and (b) an **expected-event / negative-assurance reconciliation** — every sensitive action in IAM-02's protected-action registry must have a corresponding audit event within an SLA, else Critical. Today you can delete-by-never-sending and nothing notices.

### C3 — Ingestion authenticity: source events can be spoofed, and interim backfill can fabricate history
**Area:** 04 §2.1 (ingestion API), 05 §4 rule 9 (service account scoped by source module), 02 WF-SEC01-07 (interim handoff backfill).

`source_module` is a self-declared field in the ingestion payload. Data rule 9 says service-account ingestion is "scoped by source module," but nothing states that `source_module` is **verified against the authenticated ingestion identity** — so a compromised (or over-scoped) service account could emit events *attributed to another module*, poisoning evidence or framing. Separately, the interim handoff **backfills historical events** into the authoritative store; without constraint, that path can inject fabricated "historical" events.

Needed: cryptographically **bind `source_module` to the authenticated ingestion credential** (reject mismatches); and constrain interim backfill to events carrying **FND outbox delivery evidence only**, marked as backfilled with integrity-attested-from-ingestion (see C5), never free-form historical inserts.

### C4 — Trusted time is missing; chain order ≠ event order
**Area:** 05 §2.1 (`occurred_at_utc` source-supplied vs `ingested_at_utc`), 02 WF-SEC01-02 (chain built in ingestion order).

`occurred_at_utc` is **supplied by the source** and untrusted — a skewed or malicious clock can misdate events — while the hash chain is ordered by **ingestion sequence**, not event time. Batch seals carry no **trusted timestamp**. For regulator/court-grade evidence and incident reconstruction, defensible time is essential.

Needed: **trusted timestamping on seals** (RFC-3161-style timestamp authority or equivalent), **clock-skew detection** (flag/quarantine events whose `occurred_at_utc` deviates from `ingested_at_utc` beyond a bound), and explicit documentation that **chain order = ingestion order** with `occurred_at_utc` treated as attested-but-untrusted.

### C5 — Circular dependency with IAM-02 + audit-access continuity + interim-window integrity
**Area:** 01 §7.1.7 (SEC-01 read/export/admin gated by IAM-02), IAM-02 §5.14 (IAM-02 audit non-authoritative until SEC-01), 02 WF-SEC01-07, 04 §4–5.

SEC-01 depends on **IAM-02** for its own access control, while IAM-02 depends on **SEC-01** for authoritative audit — a mutual dependency with two unresolved consequences: (a) SEC-01's own `sec1.*` read/export/admin permissions must be **registered in IAM-02's protected-action registry** (they aren't referenced), or SEC-01 access is ungoverned; (b) if IAM-02 is degraded during a security incident, responders may be **locked out of the very audit evidence** they need — yet you cannot open an audit-bypass. Also, interim-handoff events are only tamper-evident **from backfill time onward**, with no proof they weren't altered during the pre-SEC-01 window.

Needed: register `sec1.*` in IAM-02 and define their SoD; a **defined break-glass read path** for incident response that is itself fully audited (access under emergency, never an audit-bypass); and an explicit statement that backfilled interim events carry **integrity-from-ingestion** semantics (relying on FND outbox delivery evidence for the interim window, not chain integrity).

---

## Recommended Corrections

1. **Concretely define `seal_method = external`** (WORM/object-lock + timestamp authority) rather than leaving it open — directly supports C1.
2. **`audit_correction` SoD (05 §2.12):** corrector must not be the subject/actor of the original event; corrections stay append-only and visible (cannot functionally hide the original).
3. **Alert-pipeline failure handling:** WF-SEC01-03 evaluates rules inline on ingestion — define what happens if rule evaluation fails or backlogs (dead-letter + guaranteed evaluation for Critical categories) so an ingestion flood can't silently suppress monitoring.
4. **Data-protection reconciliation:** state that immutable audit **overrides erasure/right-to-be-forgotten** (retained on legal/regulatory basis), with **PII minimisation** in audit (reference/pseudonymised, not raw personal data); define the **retention schedule per regulatory class** (Open Item 1) and **storage jurisdiction** for PSO data.
5. **Anti-spoofing made explicit:** enforce `source_module == authenticated ingestion identity` (ties to C3).
6. **Recovery integrity:** on restore from backup, require **hash-chain re-verification + seal reconciliation** before the restored store is treated as authoritative.

---

## Additional Parameters to Define

```txt
# Tamper anchoring / immutability (C1)
audit_seal_anchor                     = external_worm_plus_timestamp_authority
audit_store_immutability              = storage_object_lock_not_runtime_grant_only
audit_backup                          = immutable_air_gapped_worm
audit_self_admin_sod                  = operator_ne_seal_controller

# Completeness / anti-suppression (C2)
source_emission_sequence_required     = true
expected_event_reconciliation         = iam2_action_registry_to_audit_within_sla
expected_event_sla_seconds            = to_be_defined
audit_ingestion_transaction_coupled   = fnd_outbox_commit_implies_enqueue

# Ingestion authenticity (C3)
source_module_bound_to_ingest_identity = true
interim_backfill_source                = fnd_outbox_delivery_evidence_only
interim_backfill_integrity_from        = ingestion_time_marked

# Trusted time (C4)
trusted_timestamp_on_seal             = required
occurred_at_utc_skew_max_seconds      = to_be_defined
chain_order                           = ingestion_order_documented

# Dependency / access continuity (C5)
sec1_permissions_registered_in_iam02  = true
audit_read_incident_break_glass       = allowed_fully_audited_no_bypass

# Corrections
audit_correction_sod                  = corrector_ne_original_subject
pii_in_audit                          = reference_or_pseudonymised
erasure_vs_audit                      = audit_retained_legal_basis
```

---

## Consistency Note

FND-01 inheritance is clean (outbox, correlation, `role_sec1_runtime` isolation, scheduler). SEC-01 correctly **defers licence-lock source-of-truth to CFG-01** while monitoring exchange-lock breach attempts (§5.10, TC-025) — consistent with 00 v1.3 and IAM-02 §5.14 — and it properly implements the **IAM-01/IAM-02 interim audit handoff**, closing the thread those packs opened. Two structural tensions surface here: the **self-audit trust** problem (C1) and the **circular dependency** with IAM-02 (C5). One concrete traceability item: SEC-01's own `sec1.*` permissions are not yet registered in IAM-02's protected-action registry (correction 5 / C5).

---

## Top Priorities

1. **C1** — external anchoring + storage-level immutability + immutable backups + self-audit SoD. An audit store that can be internally recomputed is not authoritative; nothing else matters if this stays open.
2. **C2** — source-assigned sequence + expected-event reconciliation. You currently cannot detect a *suppressed* event.
3. **C3 / C4** — ingestion authenticity (anti-spoofing) and trusted time for defensible evidence.
4. **C5** — resolve the IAM-02 circular dependency, register `sec1.*` permissions, and define audited break-glass read for incident response.
