# AST-01 — 08 Audit, Evidence and Retention (v1.3)

**Status: REMEDIATED / AWAITING RE-REVIEW.** Events are published through the FND-01 audit publisher (`publishAudit`, transactional outbox — the audit row commits with the state change or neither does). Envelope fields follow FND-01 (`AuditEvent`): actor, action, entity, severity, request/correlation ids, metadata. **Metadata never contains evidence document bytes, raw tokens or client identifiers.**

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
| `ast1.instrument.identity_drift_detected` | **Unexplained** fingerprint mismatch: no verified `class_correction_marker` explains the difference between the record's and the instrument's fingerprint (or the cached fingerprint disagrees with a recompute). A governed correction awaiting reclassification does **not** raise this event [v1.3: F26] | **C** |
| `ast1.instrument.lineage_assigned` / `lineage_forced` | Lineage set at creation (immutable thereafter [F19.D]); **forced** by a declared predecessor or same-asset membership [F06] | H |
| `ast1.instrument.duplicate_identity_rejected` | Registration of a canonical identity (token contract, or native chain+network) already registered in any status [F19.E] | H |
| `ast1.asset.class_corrected` | Governed `ASSET_CLASS_CORRECTION` applied; earlier records become unusable (SQL B12); all instruments' tokens revoked (`asset_class_corrected`); markers written. Metadata: asset, from/to class, governing `change_id`, instrument ids, marker ids, revoked-token count. **Expected governed state — not an integrity event and no `SYSTEM` hold** [AST-P-3; v1.3: F26] | **C** |
| `ast1.lineage.merged` | Governed, irreversible merge. **[v1.3: F27]** Metadata: both roots, `merge_id`, **`merge_global_seq`** (DB-assigned), `change_id` | **C** |
| `ast1.lineage.security_determination_propagated` | A real `SECURITY` record **or a lineage merge that joined security history** applied: affected sibling/wrapper instruments now fail closed (`LINEAGE_SECURITY_REVIEW_REQUIRED`); tokens revoked (metadata: **`trigger` = `RECORD` \| `MERGE`**, triggering record/merge id and sequence, affected count, ids, wrapper ids) [F20; v1.3: F27] | **C** |
| `ast1.instrument.address_not_canonical_rejected` | Registration of a contract address that is not in the database's canonical form for its network (or on a network with no supported rule) [v1.3: F28.a] | H |
| `ast1.currency.registered` / `retired` | Fiat reference data changes [F08] | M |

### 1.2 Classification

| Event | Trigger | Sev |
|---|---|---|
| `ast1.classification.case_opened` / `case_withdrawn` / `case_rejected` | Case lifecycle | M |
| `ast1.classification.evidence_recorded` | Evidence attached (hash, type, object_ref — no bytes) | M |
| `ast1.classification.submitted` | Maker submits; `payload_hash` | H |
| `ast1.classification.recorded` | Record appended (outcome, seq, maker, **IAM-02-attested approver ids and policy id**, approval, evidence_bundle_hash, standard, environment, lineage, `elevated`) | **C** for security or synthetic outcomes, any loosening and any `elevated` record; H otherwise |
| `ast1.classification.elevated_path_applied` | `elevated` record approved with ≥ 2 checkers and new evidence [F06] | **C** |
| `ast1.classification.elevated_path_violation_blocked` | Attempt to loosen with a lineage `SECURITY` history without the elevated requirements | **C** |
| `ast1.classification.approver_attestation_missing` | IAM-02 returned no attested approver identity; apply refused [F05] | H |
| `ast1.classification.approval_rejected` | IAM-02 approval rejected/expired | M |
| `ast1.classification.apply_failed` | Apply aborted (reason) | H |
| `ast1.classification.self_approval_blocked` | maker ∈ attested approvers | **C** |
| `ast1.classification.class_conflict_blocked` | Presumptive-securities class + `NON_SECURITY` proposed | H |
| `ast1.classification.evidence_standard_missing` | Approval attempted with no applicable approved standard | H |
| `ast1.evidence_standard.proposed` / `approved` / `retired` | Standard lifecycle (approve records `r4q3_resolution_ref`) | H |

### 1.3 Holds [F07]

| Event | Trigger | Sev |
|---|---|---|
| `ast1.hold.requested` | Human hold requested (governed change) | H |
| `ast1.hold.placed` | Hold in effect (`origin` HUMAN or SYSTEM) — classification unchanged | **C** |
| `ast1.hold.system_placed` | Integrity sweep / synthetic-in-PRODUCTION / standard retired / backstop trip — immediate, no human approval. After a backstop trip it is written by the **application in a separate transaction** [F24] | **C** |
| `ast1.hold.release_requested` / `released` | Release lifecycle (maker-checker) | H |

### 1.4 Eligibility

| Event | Trigger | Sev |
|---|---|---|
| `ast1.eligibility.allow` | `ELIGIBLE` decision (token minted) | L (sampled to logs; the **decision-log row is always written**) |
| `ast1.eligibility.deny` | Any deny | L; M for `SECURITY × SPOT/OTC`, `ASSET_NOT_ALLOWED`, `UNRESOLVED` on a production path |
| `ast1.eligibility.security_instrument_refused_for_mb_product` | Any evaluate/verify/admission/custody/operational attempt for an **MB/PSO-domain subject** (`SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO`) on a security outcome | **H** (surveillance signal, `SUR-01`) |
| `ast1.eligibility.not_applicable_fiat` | `evaluate` called for a fiat instrument (`SUBJECT_NOT_APPLICABLE_FIAT`) | L |
| `ast1.eligibility.subject_not_permitted_for_caller` | Service asked for a subject outside its allow-list [F02] | **H** |
| `ast1.eligibility.real_securities_route_not_assessed` | Real security instrument on a securities-route subject → `NOT_ASSESSED` [F03] | L |
| `ast1.eligibility.environment_mismatch` | Caller-asserted ≠ own environment (metadata: authoritative, canonical, asserted) | **C** |
| `ast1.eligibility.token_verified` / `token_rejected` | verify-decision outcome (`stale`, `expired`, `consumed`, `binding_mismatch` incl. **wrong subject / consumer / instrument**) | L / H for stale-after-reclassification, **C** for a cross-domain subject mismatch |
| `ast1.eligibility.instrument_revoked` | Tokens revoked because eligibility narrowed (reclassification, hold, admission suspended) | H |
| `ast1.eligibility.hard_rule_backstop_triggered` | The **SQL backstop (reads the ledger)** rejected an `allow` insert (`AS001`) — **means application logic was wrong**. The failed transaction is rolled back; the application then places the SYSTEM hold and writes this event in a **separate** transaction | **C** |
| `ast1.eligibility.consume_backstop_triggered` | The SQL trigger rejected a **token consumption** (`AS003`) that the application had not flagged, or the SQL hard rule B1 fired at consumption [F18] | **C** |
| `ast1.eligibility.token_consume_rejected` | Consumption refused for a stale record or a now-denying conjunct (application and SQL agree) [F18] | H |
| `ast1.eligibility.instrument_reference_unresolved` | `evaluate` reference matched 0 instruments (surveillance signal for unsolicited inbound, `SUR-01`) [F17] | H |
| `ast1.eligibility.instrument_reference_ambiguous` | Reference matched >1 instrument or had conflicting selectors — should be impossible; indicates tampered or restored data [F17] | **C** |
| `ast1.eligibility.lineage_security_review_required` | Deny by conjunct C0b (metadata: `lineage_review_trigger` = `SECURITY_RECORD` \| `LINEAGE_MERGE` \| `UNDERLYING_LINEAGE`) [F20; v1.3: F27] | M |
| `ast1.eligibility.classification_required_after_correction` | Deny: the instrument's class was corrected by a governed `ASSET_CLASS_CORRECTION`; a new classification is required (`CLASSIFICATION_REQUIRED_AFTER_CORRECTION`) [v1.3: F26] | L |
| `ast1.eligibility.myr_pair_control_unresolved` | Digital MYR-denominated instrument evaluated; `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED` [F21] | L |
| `ast1.eligibility.real_instrument_non_production_basis` | Real `NON_SECURITY` record without a production-applicable standard treated as unusable [F25] | L |
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
| `ast1.securities_market_admission.received` / `withdrawn` / `stale` | EXM-01 attestation; **stale** = a later classification record made it inert [F13] | H |
| `ast1.governed_change.requested` / `applied` / `rejected` / `cancelled` / `failed` | Envelope | H |

### 1.6 Integrity

| Event | Trigger | Sev |
|---|---|---|
| `ast1.integrity.sweep_completed` | Sweep finished (counts) | M |
| `ast1.integrity.orphaned_admission_found` | Admission or attestation against a non-current record | M |
| `ast1.integrity.lineage_gap_found` | Canonical-identity uniqueness breached in restored/tampered data; or a current real `NON_SECURITY` record whose transitive underlying reaches a `SECURITY` lineage lacks `UNDERLYING_LINEAGE` in `elevated_basis` [F19]; **[v1.3: F27] or a lineage-review requirement (own tree, underlying tree, or merge-introduced) whose propagation failed: SQL/independent divergence, a live token, a missing governing change or propagation audit, or a non-elevated record after the security history (05 §7.1 S5, S7)** | **C** |
| `ast1.integrity.lineage_review_pending` | **Explained** lineage-review requirement awaiting the elevated review (no control failed): trigger, event sequence, instrument. Informational — no hold [v1.3: F27] | M |
| `ast1.integrity.class_correction_reclassification_pending` | **Explained** fingerprint mismatch: a verified governing correction awaits a new classification. Informational — no hold [v1.3: F26] | M |
| `ast1.integrity.address_canonical_violation` | A stored contract identity is not canonical under the current network rule, two identities collide under it, or an identity index is missing [v1.3: F28.a] | **C** |
| `ast1.integrity.registry_tamper_suspected` | Row hash/immutability violation attempt detected; **[v1.3]** a marker that does not verify, a ledger-order break (`global_seq` / `merge_global_seq` not in commit order), a missing or disabled immutability trigger, or a `lineage.synthetic` disagreement (05 §7.1 S3, S8, S10) | **C** |

## 2. Evidence produced per decision

Every eligibility decision row carries: instrument, subject, decision, derived state, reason, effective outcome, synthetic emulation, the **classification record id and sequence** used, matrix version, AST-01's own environment, the caller-asserted environment, client jurisdiction and class facts, the caller/operation reference, the `payload_hash` (which also covers the client reference), the **canonical requested instrument reference** (also for unresolved requests), caller service, request/correlation ids, timestamp. From this an auditor can reconstruct **why** an instrument was or was not admitted to a product at a given instant, which classification supported it, who approved that classification, on what evidence bundle and under which evidence standard — the chain required by Doc 00 §12A ("affirmative, evidenced, approval-bound record") and by `DEC-012` clause 1 rule 7 (pre-trade checks retained).

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
