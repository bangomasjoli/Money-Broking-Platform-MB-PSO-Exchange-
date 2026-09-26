# AST-01 — 02 Workflow (v1.1)

**Status: REMEDIATED / AWAITING RE-REVIEW.** Refines `WF-35` (Workflow Map v1.3 §33F) and interlocks with `WF-31`, `WF-32`, `WF-34`. `WF-35`'s later states (`eligibility_derived`, `operationally_eligible`, `activated`) are derived views or other modules' states, not AST-01 stored states (06 §9). Changes from v1.0 tagged **[v1.1: Fnn]**.

Legend: **M** maker, **C** checker (IAM-02 approval, attested approver identity — 01 §4.8), **sys** system origin (integrity), **svc** service identity.

---

## W1. Instrument registration (`WF-35` steps 1–2)

| Step | Action | Actor | Rule |
|---:|---|---|---|
| 1 | Create issuer reference (if needed) | `RWA_OPERATIONS_OFFICER` / `ADMIN` | Descriptive only |
| 2 | **Create asset with a predecessor declaration** [F06] | same | `NONE_DECLARED` (attested) or `SAME_ECONOMIC_SUBJECT(ref)` → lineage assigned |
| 3 | Create instrument `DRAFT` | same | Every `attr_*`, `amount_scale`, `declared_synthetic`/`synthetic_emulates` stated, **the last two and the code immutable from this insert** [F09]. Network in registry; contract canonicalised; **a previously registered on-chain identity forces the prior lineage** [F06] |
| 4 | Add underlying reference(s) | same | Stablecoin needs known backing before submission |
| 5 | Edit draft | same | Identity only in `DRAFT` |
| 6 | **Fiat:** register as reference data (`FIAT`, precision, MYR attribute, references) | same | No case, no admission, no eligibility [F08] |

Creation grants nothing: with no valid classification the instrument is `UNRESOLVED` and every subject denies (INV-02).

## W2. Classification (`WF-35` steps 2–4, `ASSET-RULE-002` rule 4)

```
DRAFT ─► open case ─► evidence ─► submit (M; computes `elevated`, lineage candidates) ─► IAM-02 approval (C, attested)
       ─► apply ─► record appended       │ reject / cancel ─► case closed; classification unchanged
```

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Open case (`INITIAL`/`RECLASSIFICATION`) | `INSTRUMENT_CLASSIFIER` | One open case per instrument; refused for fiat |
| 2 | Attach evidence | Classifier | Immutable, hashed |
| 3 | Declare proposed outcome, rationale, features assessment | `INSTRUMENT_CLASSIFIER` (M) | Validated against the approved evidence standard; `SECURITY_LABELLED` + `NON_SECURITY` refused [01 §3.4]; completeness gate |
| 4 | **Submit** — identity locks; `payload_hash`; **`elevated` computed from the lineage ledger** [F06]; lineage candidates listed | M | Payload binds instrument, fingerprint, lineage, outcome, bundle hash, standard, environment |
| 5 | Approval | `COMPLIANCE_OFFICER` (+ `MLRO` if `elevated`) (C) | **Approver identities must be IAM-02-attested** [F05]; maker ∉ approvers; checker who attached evidence excluded |
| 6 | **Apply** — recheck fingerprint/standard/lineage; append record (triggers recompute environment, lineage, `elevated`); revoke tokens if any subject narrows | sys | **Disabled until DCR-AST1-001(a)+(d) delivered** [F05] |
| 7 | Consumers see the new effective classification on their next evaluation; tokens for the instrument are stale | — | `verify-decision` revalidates against the current record id |

**Production:** step 3 cannot complete without an `APPROVED` PRODUCTION-applicable evidence standard, which requires `R4-Q3` to be answered by governance. A non-production classification of a real instrument is **provisional test data**, never evidence in PRODUCTION (INV-08).

## W3. Reclassification, reversion, lineage [F06, AST-HD-8]

`elevated` = any real `SECURITY` determination anywhere in the instrument's lineage.

| Change | Approval |
|---|---|
| `UNRESOLVED → NON_SECURITY` where **not** `elevated` | M + `COMPLIANCE_OFFICER` |
| **Any** `→ NON_SECURITY` where **`elevated`** (including `SECURITY → UNRESOLVED → NON_SECURITY`, retire→recreate, replacement asset in the same lineage) | M + `COMPLIANCE_OFFICER` **and** `MLRO`; **≥ 1 new evidence item recorded after the last `SECURITY` record, not reusing its evidence**; "lineage reviewed" attested |
| `→ SECURITY`, `→ UNRESOLVED` | M + `COMPLIANCE_OFFICER` (a hold may bridge the gap) |
| Lineage merge | M + `COMPLIANCE_OFFICER`; irreversible |

On apply of a record that ends eligibility for any subject, AST-01 revokes outstanding tokens and emits `ast1.eligibility.instrument_revoked`. AST-01 does not cancel orders; consumers cancel or re-check in-flight work.

## W4. Holds [F07, AST-HD-6]

```
System-detected integrity failure ─► SYSTEM hold ─► INSTRUMENT_ON_HOLD immediately
Human concern ─► hold REQUEST (M) ─► IAM-02 approval (C) ─► HUMAN hold ─► INSTRUMENT_ON_HOLD
release (either origin): M + C ─► classification unchanged throughout
```
A hold **never** changes the classification outcome; a held `SECURITY` instrument still returns the MB-domain hard-rule reason. System holds fire on: fingerprint drift, synthetic-in-PRODUCTION, evidence-standard retirement, backstop trip, sweep anomalies. **No single-actor human hold exists** until the Role Matrix establishes one (DCR-AST1-006); `SYS-RULE-008` and the kill switch are precedent only.

## W5. Product admission (`WF-35` step 5)

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Request admission for (instrument, product), attesting `jurisdiction_assessed` | analyst/ops | Refused unless the matrix currently says `PERMITS` for the **current** record |
| 2 | Approve | `COMPLIANCE_OFFICER` (C) | Bound to `classification_record_id`; **DB trigger re-checks against the ledger** [F04] |
| 3 | Suspend / withdraw / re-approve | M + C | Human-initiated ⇒ maker-checker [F07] |

A newer classification record leaves the admission **inert** (never `ELIGIBLE`). Admission is not production activation (`DEC-014`). Pair activation is outside AST-01 (OQ-6).

## W6. Operational enablement (`WF-35` step 6) [F01]

Custody support approval (domain `MB_PSO` or `SECURITIES`) → operational state enable per domain-scoped subject → all M + C. Enabling an `MB_PSO` subject for a security outcome is refused by the backstop. Defaults `DISABLED`/`UNASSESSED`; absence denies.

## W7. Eligibility evaluation on an execution path

```
consumer (allow-listed for the subject)
  ─► evaluate {instrument, subject, consumer_service, client_facts}
      AST-01: fiat? → not_applicable │ own environment → effective classification → hard rule → matrix → conjuncts
              → log (SQL backstop reads the ledger) → token bound to subject/domain/consumer/instrument/env/record
  ─► consumer ALSO evaluates CFG-01 (features/environment/activation) and IAM-02 (permission)
  ─► immediately before EACH routing/execution attempt: verify-decision (single use, subject/instrument/consumer bound)
```
`evaluate` is advisory; `verify-decision` gates. AST-01 unavailability is **deny** for the consumer. A token is **not** an order-lifetime entitlement: pending orders re-evaluate and re-verify at each attempt (`DEC-012` cl. 1 rule 5).

## W8. Securities-market admission attestation and `WF-32` sequencing [F13]

```
EXM-01 (WF-32 step 1) ─► evaluate SECONDARY_MARKET  (AST-01 steps 2–3; no attestation dependency)
   ─► admission review (step 4) ─► EXM-01 posts attestation (bound to the CURRENT record)
   ─► SECURITIES_MARKET can now derive ELIGIBLE (synthetic in non-production; real: NOT_ASSESSED, 01 §5.3⁵)
   ─► CFG-01 production gate (step 7)
```
Reclassification makes the attestation inert until re-attested. No circularity.

## W9. Evidence standard lifecycle

`DRAFT → APPROVED (M + C) → RETIRED`; PRODUCTION-applicable needs `r4q3_resolution_ref`. Retirement ⇒ SYSTEM holds on instruments relying on it.

## W10. Synthetic instrument lifecycle

Created `declared_synthetic` with `SYN-` code and `synthetic_emulates` (immutable from insert) in non-production; classified `SYNTHETIC_TEST_INSTRUMENT` with full control parity (Doc 00 §21A rule 7); may exercise the whole lifecycle including the securities route; **never** promoted; all-`INELIGIBLE` and a SYSTEM hold in PRODUCTION. To onboard the real analogue, W1–W2 start again on real evidence; the real instrument has its own (real) lineage and never inherits from the synthetic.
