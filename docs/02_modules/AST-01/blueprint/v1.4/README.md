---
document_id: AST-01-BP-v1.4
title: AST-01 Blueprint Pack — Asset & Instrument Registry + Regulatory Classification
version: v1.4
document_status: DRAFT
implementation_status: NOT_STARTED
module: AST-01
control: Instrument identity, classification gate, derived product eligibility
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: 2026-09-28
supersedes: none (v1.0, v1.1, v1.2 and v1.3 remain reviewed historical evidence; not overwritten)
baseline_commit: 3c222f4
---

# AST-01 Blueprint Pack v1.4 — **REMEDIATED / AWAITING RE-REVIEW**

Planning only. **No application code, no migration, no test code, no schema change.** Nothing here is accepted, approved for implementation, or promoted. **Implementation is not authorised.** v1.4 remediates the round-4 findings **F29, F30, F31, F32 — all LOW** — of the separate-context review [`04-review-r4.md`](../../../../03_implementation/tasks/AST-01/04-review-r4.md) (`REMEDIATE`, against v1.3 `b56950f`). The finding-by-finding record is [`05-remediation-r4.md`](../../../../03_implementation/tasks/AST-01/05-remediation-r4.md). **v1.0 ([../v1.0/](../v1.0/README.md)), v1.1 ([../v1.1/](../v1.1/README.md)), v1.2 ([../v1.2/](../v1.2/README.md)) and v1.3 ([../v1.3/](../v1.3/README.md)) are unchanged and are reviewed historical evidence.** Closed design (F17–F28, minus the two external gates below) is preserved; F17, F21, F02, F05 remain external gates; F20 is superseded by F27 (closed in blueprint); F26 is superseded by F29.

## Reading order

| # | File | Contents |
|---|---|---|
| 01 | [01_Module_Blueprint.md](01_Module_Blueprint.md) | Ownership, invariants INV-01…**25**, identity, canonical resolution, lineage, classification, elevated approval, derivation, allow-list and token binding. **New: INV-24 (SQL-authoritative class binding), INV-25 (ordering-guarantee scope and enforced isolation); INV-20/21/23 extended** |
| 02 | [02_Workflow.md](02_Workflow.md) | Registration, classification, reclassification, holds, admission, evaluate/verify, `WF-32`, W11/W12/W13 **reordered for the corrected lock/gate sequencing (F30.b, F31)**; W3 row 2 re-worded to the exact review-floor concept |
| 04 | [04_API_Specification.md](04_API_Specification.md) | Internal API, single-selector reference, single-transaction `verify-decision`, merge and correction routes; **locking section notes the isolation assertion and the corrected lineage-wide lock order** |
| 05 | [05_Database_Design.md](05_Database_Design.md) | `ast1` schema. **New in v1.4: §5.1 `classification_record.asset_class_at_record` and B12's independent class-binding check (F29); §7 the `AS007` isolation precondition and its exact scope (F30.a/c); §3 `trg_lineage_merge_apply` reordered gate-first with `lineage_root()`'s fail-closed cycle contract (F30.b); §5.1 trigger 2 and §7A reordered so a lineage-wide writer never locks itself before its set, plus the intra-level ascending lock guard (F31); §2.1 canonicalisation-version immutability once referenced (F32.a); §6 `securities_market_admission_attestation.attestation_seq` (F32.b)** |
| 06 | [06_State_Machine.md](06_State_Machine.md) | Nine state machines; SM-3 extended for the independent class-binding drift arrow |
| 07 | [07_Permission_Rules.md](07_Permission_Rules.md) | Roles, permissions, change-kind authority map (unchanged — no new authority is created) |
| 08 | [08_Audit_Log_Events.md](08_Audit_Log_Events.md) | Events, evidence, retention. **New: `class_binding_drift_detected`, `class_binding_drift` deny event** |
| 09 | [09_Error_Handling.md](09_Error_Handling.md) | Reason codes (**new: `CLASSIFICATION_ASSET_CLASS_DRIFT`**), thrown errors (**new: `AST1_UNSUPPORTED_TX_ISOLATION`**), database errors `AS001–AS007` (**new: `AS007`; `AS004` extended to `lineage_root()` cycles; `AS006` extended to the intra-level guard**) |
| 10 | [10_Test_Cases.md](10_Test_Cases.md) | Test IDs incl. **new `T-FPR-11`, suite `T-ISO`, `T-LIN-28`, `T-LOK-07`, `T-ADR-13`, suite `T-ATT`**; amended `T-LOK-01/02`, `T-CON-07`, `T-ADR-10` |
| 12 | [12_Risk_And_Control_Map.md](12_Risk_And_Control_Map.md) | Risks AR-01…**34**. **AR-31 residual closed; new AR-32 (F29), AR-33 (F30), AR-34 (F32)** |
| 17 | [17_Dependencies_And_Open_Decisions.md](17_Dependencies_And_Open_Decisions.md) | Approved decisions, DCR-AST1-001…009 (unchanged), gates, **OQ-8 still open, unaffected by F29–F32** |

## What changed from v1.3

| Finding | Sev | v1.4 |
|---|---|---|
| **F29** B12 depends on an application-written cached fingerprint; SQL never asserts the correction actually changed it (supersedes F26) | LOW | New `classification_record.asset_class_at_record`, trigger-filled from the **live** `asset.asset_class` under the instrument's own lock, immutable. B12 gains a **second, independent** input, `class_binding_matches`: it denies whenever the record's stamped class no longer equals the asset's current class — a comparison that needs no cached value to have been correctly recomputed, because `ASSET_CLASS_CORRECTION` is *defined* as the `UPDATE` that changes `asset.asset_class`. A defective correction writer that leaves the cached fingerprint untouched still trips B12. The deferred constraint additionally requires the fingerprint to have actually changed and the marker to chain to it, and now also requires `marker.asset_id = instrument.asset_id`. New reason `CLASSIFICATION_ASSET_CLASS_DRIFT` for the unexplained case; the sweep (S1/S2) and the marker's explained/unexplained split extend to cover it |
| **F30** Ordering-visibility gaps: (a) `READ COMMITTED` was load-bearing but unenforced; (b) the merge trigger checked roots/cycles before taking the gate; (c) the ordering claim was stated too broadly | LOW | (a) `authoritative_state()` and every lock helper assert `READ COMMITTED` as their first statement and fail closed (`AS007`) otherwise — a connection-pool misconfiguration is now an availability failure, never a silent safety gap. (b) `trg_lineage_merge_apply` and the application-level merge apply now take the exclusive gate **first**, and resolve roots / reject a self-merge only under it, so a raw caller racing two opposite merges can never commit a cycle; `lineage_root()` itself raises rather than returning a partial answer for a corrupted or cyclic ancestry. (c) INV-21/INV-25 and 05 §7A now state the ordering guarantee's exact scope — a pair sharing an instrument lock or the exclusive gate — and explicitly exclude `class_correction_marker` from any claim beyond same-instrument comparisons (which the scope statement already covers) |
| **F31** Deadlock-prone lock inversion: a real `SECURITY` apply locked its own instrument before the rest of its ascending affected set | LOW | A lineage-wide writer now derives its **full** affected set — its own triggering instrument included — before locking any of it, then locks the whole set ascending in **one** pass. A new intra-level lock-tracking guard rejects a descending `instrument_id` acquisition within level 2 (`AS006`) instead of risking a PostgreSQL deadlock. The cycle-analysis table gains the two previously-omitted pairs (`ASSET_CLASS_CORRECTION` ↔ real `SECURITY` apply; evidence-standard retirement ↔ real `SECURITY` apply), both now provably acyclic. A `Case submit` row is added to the lock table (no path is left unspecified) |
| **F32** Residual DB hygiene: (a) the canonicaliser allowed an existing referenced version's rule to change; the `UPDATE` trigger arm was ambiguous about re-reading the registry; (b) the attestation table's "newest wins" had no DB-authoritative ordering key | LOW | (a) Once any instrument references an `(address_format, canonicalisation_version)` pair, that pair's rule is **frozen** for as long as any row names it; new behaviour is always a new version; the `UPDATE` trigger arm compares `OLD`/`NEW` identity columns only and never re-reads `network_registry`, so retiring or correcting an instrument is unaffected by a later version bump or a `SUSPENDED` network. Re-mapping existing identities is a separate, collision-checked, governed migration. (b) `securities_market_admission_attestation.attestation_seq`, DB-assigned under the instrument lock, is the sole "newest wins" authority; `received_at_utc` is audit-only |
| Editorial | — | 02 W3 row 2's "evidence after the last `SECURITY` record" restated as the exact review-floor concept (a record or a qualifying merge, whichever is newer) |

## What this pack does not do

It classifies **no** asset, approves **no** venue, order type or asset, answers **no** regulatory open question, builds no trading, matching, ledger or RWA issuance, and changes no other module. Cross-module changes are DCRs in file 17, **none implemented or executed**; DCR-AST1-002 (incl. the WLT-01 contract-identity gap), -004 and -008(c) are external gates (F17, F21, F02, F05). **OQ-8 remains open**; v1.4 adds no draft-correction path and does not touch OQ-8 in any way — the F32(a) version-immutability rule is orthogonal to it. **No human decision arises from F29–F32**: each is a technical correction inside a decision already approved (AST-P-3 for F29; no new decision-shaped question for F30–F32), per `04-review-r4.md`.
