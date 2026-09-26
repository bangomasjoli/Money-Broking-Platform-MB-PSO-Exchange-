---
document_id: AST-01-BP-v1.3
title: AST-01 Blueprint Pack — Asset & Instrument Registry + Regulatory Classification
version: v1.3
document_status: DRAFT
implementation_status: NOT_STARTED
module: AST-01
control: Instrument identity, classification gate, derived product eligibility
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: 2026-09-26
supersedes: none (v1.0, v1.1 and v1.2 remain reviewed historical evidence; not overwritten)
baseline_commit: 56b0d6d
---

# AST-01 Blueprint Pack v1.3 — **REMEDIATED / AWAITING RE-REVIEW**

Planning only. **No application code, no migration, no test code, no schema change.** Nothing here is accepted, approved for implementation, or promoted. **Implementation is not authorised.** v1.3 remediates the round-3 findings **F27 (MEDIUM), F26 (MEDIUM) and F28 (LOW)** of the separate-context review [`04-review-r3.md`](../../../../03_implementation/tasks/AST-01/04-review-r3.md) (`REMEDIATE`, against v1.2 `f769689`). The finding-by-finding record is [`05-remediation-r3.md`](../../../../03_implementation/tasks/AST-01/05-remediation-r3.md). **v1.0 ([../v1.0/](../v1.0/README.md)), v1.1 ([../v1.1/](../v1.1/README.md)) and v1.2 ([../v1.2/](../v1.2/README.md)) are unchanged and are reviewed historical evidence.** Closed design (F18, F19, F22–F25) is preserved; F17 and F21 remain external gates; F20 is superseded by F27.

## Reading order

| # | File | Contents |
|---|---|---|
| 01 | [01_Module_Blueprint.md](01_Module_Blueprint.md) | Ownership, invariants INV-01…**23**, identity, canonical resolution, lineage, classification, the **merge-aware lineage conjunct (§4.7A)**, class correction (§3.4), elevated approval with **sequence-ordered evidence (§4.7)**, derivation, allow-list and token binding |
| 02 | [02_Workflow.md](02_Workflow.md) | Registration, classification, reclassification, holds, admission, evaluate/verify, `WF-32`, **W11 (record), W12 (merge apply), W13 (class correction apply)** |
| 04 | [04_API_Specification.md](04_API_Specification.md) | Internal API, single-selector reference, single-transaction `verify-decision`, merge and correction routes |
| 05 | [05_Database_Design.md](05_Database_Design.md) | `ast1` schema; **§2.1 database-enforced canonical address; §3 lineage gate, `merge_global_seq`, immutable `lineage`; §5 evidence sequence, `class_correction_marker`; §7 `record_fingerprint_matches`, merge-aware predicate, B1–B12; §7.1 sweep rules; §7A the global lock order, cycle analysis, merge and correction transactions** |
| 06 | [06_State_Machine.md](06_State_Machine.md) | Nine state machines |
| 07 | [07_Permission_Rules.md](07_Permission_Rules.md) | Roles, permissions, change-kind authority map (DCR-006 extended) |
| 08 | [08_Audit_Log_Events.md](08_Audit_Log_Events.md) | Events, evidence, retention |
| 09 | [09_Error_Handling.md](09_Error_Handling.md) | Reason codes (`CLASSIFICATION_REQUIRED_AFTER_CORRECTION`), thrown errors, database errors `AS001–AS006` |
| 10 | [10_Test_Cases.md](10_Test_Cases.md) | Test IDs incl. `T-LIN-15…27`, **`T-FPR`, `T-ADR`, `T-LOK`** |
| 12 | [12_Risk_And_Control_Map.md](12_Risk_And_Control_Map.md) | Risks AR-01…**31** |
| 17 | [17_Dependencies_And_Open_Decisions.md](17_Dependencies_And_Open_Decisions.md) | Approved decisions, DCR-AST1-001…009 (DCR-006 extended), gates, **OQ-8 still open** |

## What changed from v1.2

| Finding | v1.3 |
|---|---|
| **F27** lineage merge does not fail-close existing `NON_SECURITY` members | A governed merge is a ledger event with a **DB-assigned `merge_global_seq`** (same sequence as records; drawn only after the gate and every affected instrument are locked; no caller value). `lineage_review_required` gains clause (b): a merge newer than X's current record whose tree holds a real `SECURITY` record recorded before the merge — over X's own tree **and** its underlyings' trees; stated identically in TypeScript C0b and SQL B8. **The merge transaction itself narrows**: identifies the affected instruments and wrappers, revokes their tokens, audits `…security_determination_propagated`. Cleared only by a newer elevated review whose evidence is newer (by sequence) than the triggering **record or merge** and bound to it. Sweep extended (defence in depth; safety never depends on it). DCR-006 extended |
| **F26** `ASSET_CLASS_CORRECTION` invisible to SQL | `authoritative_state().record_fingerprint_matches` (never supplied) + backstop rule **B12**: no mint, consumption, admission approval, attestation, custody or operational enable on a record whose fingerprint no longer matches. The correction is now a locked writer (asset row → every instrument ascending → tokens) that revokes tokens (`asset_class_corrected`). A **`class_correction_marker`** (governing change reference) separates *expected governed correction* (`NOT_ASSESSED` `CLASSIFICATION_REQUIRED_AFTER_CORRECTION`, no hold) from *unexplained drift* (`SYSTEM` hold). The first-instrument-insert / class-freeze race is closed by one asset-row lock discipline |
| **F28(a)** canonical address only in TypeScript | Versioned SQL canonicaliser keyed on the network registry; `CHECK` + `BEFORE INSERT/UPDATE` trigger **reject** a non-canonical value (never rewrite); resolver uses the same function; TypeScript is a parity-tested mirror; sweep re-canonicalises and detects collisions |
| **F28(b)** application-suppliable timestamps in the elevated-evidence rule | One DB sequence for records, merges, evidence and markers; `evidence_global_seq` assigned under the locks; `recorded_at_utc` trigger-filled and audit-only; explicit `follows_event_*` binding; exact invariant INV-21 |
| **F28(c)** `lineage.synthetic` updatable | `lineage` is insert-only: no `UPDATE` grant, immutable by trigger for every role; source of the value stated |
| Implementation notes folded in | Lock-set re-derivation after locking (05 §7A); class/form race with the first instrument insert (05 §4.1, §7A); `VOLATILE` requirement for the locking/backstop functions (05 §7) |
| **Global lock order** | governed change → lineage gate → asset row → instrument rows (ascending) → token rows → append-only inserts. The accepted v1.2 order (instrument(s) first, then token(s)) is preserved; cycle analysis over all ten participants in 05 §7A |

## What this pack does not do

It classifies **no** asset, approves **no** venue, order type or asset, answers **no** regulatory open question (`R4-Q3`, `R4-Q5`, `R4-Q6`, `R4-Q7`, `R1-Q1b`, `R4-Q2` stay open and are modelled as fail-closed gaps or CFG-01 matters), builds no trading, matching, ledger or RWA issuance, and changes no other module. Cross-module changes are DCRs in file 17, **none implemented or executed**; DCR-AST1-002 (incl. the WLT-01 contract-identity gap), -004 and -008(c) are external gates (F17, F21). **OQ-8 remains open**; v1.3 adds no draft-correction path.
