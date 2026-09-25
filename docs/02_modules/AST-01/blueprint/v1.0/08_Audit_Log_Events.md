# AST-01 — 08 Audit, Evidence and Retention

**Status: PLANNED / AWAITING REVIEW.** Events are published through the FND-01 audit publisher (`publishAudit`, transactional outbox — the audit row commits with the state change or neither does). Envelope fields follow FND-01 (`AuditEvent`): actor, action, entity, severity, request/correlation ids, metadata. **Metadata never contains evidence document bytes, raw tokens or client identifiers.**

Namespace `ast1.` (never `exchange.` — `DEC-013` cl. 10). Severity: **C**ritical / **H**igh / **M**edium / **L**ow.

## 1. Event catalogue

### 1.1 Registry

| Event | Trigger | Sev |
|---|---|---|
| `ast1.issuer_reference.created` | Issuer reference created | M |
| `ast1.asset.created` | Asset created | M |
| `ast1.instrument.created` | Instrument created `DRAFT` (metadata: code, class, form, declared_synthetic, attr_* flags) | M |
| `ast1.instrument.draft_updated` | Draft identity edited | L |
| `ast1.instrument.identity_locked` | First case submitted; fingerprint frozen | H |
| `ast1.instrument.retired` | Retired | H |
| `ast1.instrument.identity_drift_detected` | Recomputed fingerprint ≠ record fingerprint | **C** |

### 1.2 Classification

| Event | Trigger | Sev |
|---|---|---|
| `ast1.classification.case_opened` / `case_withdrawn` / `case_rejected` | Case lifecycle | M |
| `ast1.classification.evidence_recorded` | Evidence attached (hash, type, object_ref — no bytes) | M |
| `ast1.classification.submitted` | Maker submits; `payload_hash` | H |
| `ast1.classification.recorded` | Record appended (outcome, seq, maker, checker, approval, evidence_bundle_hash, standard, environment) | **C** for security or synthetic outcomes and for any loosening; H otherwise |
| `ast1.classification.approval_rejected` | IAM-02 approval rejected/expired | M |
| `ast1.classification.apply_failed` | Apply aborted (reason) | H |
| `ast1.classification.self_approval_blocked` | maker = checker detected at any layer | **C** |
| `ast1.classification.class_conflict_blocked` | Presumptive-securities class + `NON_SECURITY` proposed | H |
| `ast1.classification.evidence_standard_missing` | Approval attempted with no applicable approved standard | H |
| `ast1.evidence_standard.proposed` / `approved` / `retired` | Standard lifecycle (approve records `r4q3_resolution_ref`) | H |

### 1.3 Holds

| Event | Trigger | Sev |
|---|---|---|
| `ast1.hold.placed` | Hold placed (actor or `system`, reason) | **C** |
| `ast1.hold.release_requested` / `released` | Release lifecycle | H |
| `ast1.hold.system_placed` | Integrity sweep / synthetic-in-PRODUCTION / standard retired | **C** |

### 1.4 Eligibility

| Event | Trigger | Sev |
|---|---|---|
| `ast1.eligibility.allow` | `ELIGIBLE` decision (token minted) | L (sampled to logs; the **decision-log row is always written**) |
| `ast1.eligibility.deny` | Any deny | L; M for `SECURITY × SPOT/OTC`, `ASSET_NOT_ALLOWED`, `UNRESOLVED` on a production path |
| `ast1.eligibility.security_instrument_refused_for_mb_product` | Any evaluate/verify/admission attempt for `SPOT`/`OTC`/`PAY` on a security outcome | **H** (a caller is asking for something that must never happen — surveillance signal, `SUR-01`) |
| `ast1.eligibility.environment_mismatch` | Caller-asserted ≠ own environment (metadata: authoritative, canonical, asserted) | **C** |
| `ast1.eligibility.token_verified` / `token_rejected` | verify-decision outcome (`stale`, `expired`, `consumed`, `binding_mismatch`) | L / H for stale-after-reclassification |
| `ast1.eligibility.instrument_revoked` | Tokens revoked because eligibility narrowed (reclassification, hold, admission suspended) | H |
| `ast1.eligibility.hard_rule_backstop_triggered` | DB CHECK rejected an `allow` insert — **means application logic was wrong** | **C** |
| `ast1.eligibility.matrix_invariant_failed` | Boot-time matrix self-test failed (service refuses to start; event best-effort) | **C** |
| `ast1.eligibility.synthetic_in_production` | Synthetic instrument present/evaluated in PRODUCTION | **C** |

### 1.5 Conjunct configuration

| Event | Trigger | Sev |
|---|---|---|
| `ast1.admission.requested` / `approved` / `suspended` / `withdrawn` | Admission lifecycle | H |
| `ast1.admission.inert_after_reclassification` | Admission `APPROVED` against a superseded record | H |
| `ast1.custody.approved` / `withdrawn` | Custody support | H |
| `ast1.operational_state.enabled` / `suspended` / `disabled` | Deposit/withdrawal state | H |
| `ast1.transfer_restriction.added` / `lifted` / `profile_assessed` | Restrictions | H |
| `ast1.jurisdiction_rule.added` / `lifted` | Jurisdiction rules | H |
| `ast1.securities_market_admission.received` / `withdrawn` | EXM-01 attestation | H |
| `ast1.governed_change.requested` / `applied` / `rejected` / `cancelled` / `failed` | Envelope | H |

### 1.6 Integrity

| Event | Trigger | Sev |
|---|---|---|
| `ast1.integrity.sweep_completed` | Sweep finished (counts) | M |
| `ast1.integrity.orphaned_admission_found` | Admission against non-current record | M |
| `ast1.integrity.registry_tamper_suspected` | Row hash/immutability violation attempt detected | **C** |

## 2. Evidence produced per decision

Every eligibility decision row carries: instrument, subject, decision, derived state, reason, effective outcome, synthetic emulation, the **classification record id and sequence** used, matrix version, AST-01's own environment, the caller-asserted environment, client jurisdiction fact, caller service, request/correlation ids, timestamp. From this an auditor can reconstruct **why** an instrument was or was not admitted to a product at a given instant, which classification supported it, who approved that classification, on what evidence bundle and under which evidence standard — the chain required by Doc 00 §12A ("affirmative, evidenced, approval-bound record") and by `DEC-012` clause 1 rule 7 (pre-trade checks retained).

## 3. Retention

| Data | Retention | Basis |
|---|---|---|
| Decision log, classification ledger, evidence metadata, governed changes | **≥ 6 years** from record date | LFSA-DMB-2025 ¶5.12 (six-year retention for order and trade records; **target requirement, effective 1 January 2027 — not currently in force**, Doc 00 §22 temporal rule) and `DEC-012` cl. 1 rule 7 |
| Audit events | Per SEC-01 policy | SEC-01 |
| Evidence documents | Held in the document store, not AST-01; AST-01 holds hash + `object_ref`; retention set by that store must be ≥ the above (DCR-AST1-005) | — |

Partition/archive strategy for the decision log is an implementation-phase decision; nothing is deleted before retention expiry and nothing is ever updated.

## 4. Evidence export (later phase)

`ast1` evidence export (`request → apply → download`), maker-checkered, mirrors WLT-01/CFG-01 exports. Contents per instrument: identity + fingerprint history, classification ledger with maker/checker/approval, evidence hashes, decision-log extract, holds, admissions. **Not in the first implementation task.**

## 5. Log hygiene

No PII (AST-01 holds none). No document bytes. No raw tokens (hash only). Reason codes are stable identifiers, never free text. Free-text `rationale`/`detail` is stored in the ledger, not echoed into audit metadata beyond a hash.
