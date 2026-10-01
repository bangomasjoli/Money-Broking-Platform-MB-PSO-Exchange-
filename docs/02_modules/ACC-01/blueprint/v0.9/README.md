---
document_id: ACC-01-BP-v0.9
title: ACC-01 Blueprint Pack — Account Structure (Master Account & Subaccount)
version: v0.9
document_status: DRAFT
implementation_status: NOT_STARTED
module: ACC-01
control: Master account and subaccount identity, lifecycle, legal-entity ownership
owner: Unassigned
effective_date: 2026-09-29
last_reviewed: 2026-09-29
supersedes: none (v0.1, v0.2, v0.3, v0.4, v0.5, v0.6, v0.7 and v0.8 are reviewed historical packs and are preserved unchanged)
baseline_commit: 5a4f872
---

# ACC-01 Blueprint Pack v0.9 — Account Structure

**Status: REMEDIATED (round 8, under a procedural human-decision checkpoint) / AWAITING RE-REVIEW.** Planning only. Nothing is accepted. This pack designs; it authorises **no application code and no migration**, and **implementation is not authorised**. It remediates the findings of the separate-context review of v0.8 ([`04-review-r8.md`](../../../../03_implementation/tasks/ACC-01/04-review-r8.md), verdict REMEDIATE) — **ACC-01-R8-F01** (MEDIUM), **ACC-01-R8-F02** (LOW), **ACC-01-R8-F03** (LOW) and **ACC-01-R8-F04** (INFO) — as **technical corrections within the already-approved decisions (ACC-R3-HD-01, ACC-R3-HD-02, ACC-R4-HD-01, ACC-R5-HD-01)**. **No new human design decision was needed or taken in round 8**; the round-8 checkpoint ([`06-human-decision-r8.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r8.md), human authorisation "approve ACC R8 procedural continuation") is procedural only. It has **not** been re-reviewed; a further **separate-context re-review** is required. Finding-by-finding evidence: [`05-remediation-r8.md`](../../../../03_implementation/tasks/ACC-01/05-remediation-r8.md).

**How v0.9 came to exist.** Planning rounds were already at a prior human-authorised over-limit entry (8). `04-review-r8.md` required another human-decision cycle before any further planning turn (`PLANNING → PLANNING` is illegal at any count): `PLANNING(8) → HUMAN_DECISION_REQUIRED` (checkpoint [`06-human-decision-r8.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r8.md); `planning` stays 8, `escalation` stays 0), then a `resolve_human_decision` re-entry to `PLANNING` for this remediation (`planning` 8 → 9). The task is **not** `PLAN_READY`.

v0.1 ([`../v0.1/`](../v0.1/)), v0.2 ([`../v0.2/`](../v0.2/)), v0.3 ([`../v0.3/`](../v0.3/)), v0.4 ([`../v0.4/`](../v0.4/)), v0.5 ([`../v0.5/`](../v0.5/)), v0.6 ([`../v0.6/`](../v0.6/)), v0.7 ([`../v0.7/`](../v0.7/)) and v0.8 ([`../v0.8/`](../v0.8/)) are reviewed historical evidence and are **not modified**.

v0.1 ([`../v0.1/`](../v0.1/)), v0.2 ([`../v0.2/`](../v0.2/)), v0.3 ([`../v0.3/`](../v0.3/)), v0.4 ([`../v0.4/`](../v0.4/)), v0.5 ([`../v0.5/`](../v0.5/)), v0.6 ([`../v0.6/`](../v0.6/)) and v0.7 ([`../v0.7/`](../v0.7/)) are reviewed historical evidence and are **not modified**.

| Version | Status |
|---|---|
| v0.1 | REVIEWED / REMEDIATE |
| v0.2 | REVIEWED / REMEDIATE |
| v0.3 | REVIEWED / REMEDIATE |
| v0.4 | REVIEWED / REMEDIATE |
| v0.5 | REVIEWED / REMEDIATE |
| v0.6 | REVIEWED / REMEDIATE |
| v0.7 | REVIEWED / REMEDIATE |
| v0.8 | REVIEWED / REMEDIATE |
| **v0.9** | **REMEDIATED / AWAITING RE-REVIEW** |

## Human decisions binding on this version (approved by Aiman)

**Earlier decisions — unchanged** (file 17 §4.1): ACC-HD-1 (default subaccount structural only), ACC-HD-2 (no local roles; no real-actor apply until `IAM2-FIND-002`), ACC-HD-3 (subaccount limit is configuration), RF-02 (no void/bypass; creation needs a completable closure), Closure safety (barrier → post-barrier attestation → close), Retention (no hard deletion).

**Round-2 decisions** (file 17 §4.3): ACC-R2-HD-01 (drain allow-list), -02 (final checker approval immediately before the seal), **-03 (governed abort — the practical scope is AMENDED by ACC-R4-HD-01)**, **-04 (master + default enter `closing` atomically — the part requiring every child to be `closed` before the master seals is AMENDED by ACC-R3-HD-01)**, -05 (independent barrier), -06 (CFG-01 owns environment availability), -07 (no claim IAM-02 binds the apply actor), -08 (least-privilege peer credentials).

**Round-3 decisions** (file 17 §4.4; recorded as given in [`06-human-decision-r3.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r3.md)): ACC-R3-HD-01 (master-family closure), -02 (maker-only closure initiation; OQ-13 resolved), -03 (dependency evidence rule).

**Round-4 decisions — unchanged** (file 17 §4.5; recorded as given in [`06-human-decision-r4.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r4.md)): ACC-R4-HD-01 (rejected / withdrawn closure initiation; amends the practical scope of ACC-R2-HD-03 — its family scope is confirmed by ACC-R5-HD-01), ACC-R4-HD-02 (ACC-01 not registered in the conductor runtime store).

**Round-5 decision — unchanged** (file 17 §4.6; recorded as given in [`06-human-decision-r5.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r5.md)): ACC-R5-HD-01 (family pre-seal recovery scope — "pre-seal only" applies to the abort **target**, not to every returned row).

**Round 8 — no new decision.** `04-review-r8.md` found no conflict with any approved decision and asked for no human design decision (§7, §21); the round-8 checkpoint ([`06-human-decision-r8.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r8.md)) is a **procedural** `resolve_human_decision` authorising the planning-round continuation only. R8-F01…F04 are implemented as technical corrections **within** ACC-R3-HD-01, ACC-R3-HD-02 (maker-only initiation — unchanged; only its request lifecycle and schema wording are corrected), ACC-R4-HD-01 and ACC-R5-HD-01, as recorded below. ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02 and ACC-R5-HD-01 are preserved exactly.

**Round 7 — no new decision.** `04-review-r7.md` found no conflict with any approved decision and asked for no human design decision (§7, §20); the round-7 checkpoint ([`06-human-decision-r7.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r7.md)) is a **procedural** `resolve_human_decision` authorising the planning-round continuation only. R7-F01 and R7-F02 are implemented as technical corrections **within** ACC-R3-HD-01, ACC-R4-HD-01 and ACC-R5-HD-01, as recorded below. ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02 and ACC-R5-HD-01 are preserved exactly.

**Round 6 — no new decision.** `04-review-r6.md` found no conflict with any approved decision and asked for no human design decision (§7, §18); the round-6 checkpoint ([`06-human-decision-r6.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r6.md)) is a **procedural** `resolve_human_decision` authorising the planning-round continuation only. R6-F01…F03 are implemented as technical corrections **within** ACC-R3-HD-01, ACC-R4-HD-01 and ACC-R5-HD-01, as recorded below.

**Resolved open questions:** OQ-07 (by ACC-R2-HD-03), OQ-11 (by ACC-R2-HD-06), OQ-12 (by ACC-R2-HD-02), OQ-13 (by ACC-R3-HD-02). **Still pending:** HD-4, HD-6, HD-7, HD-8, HD-9 (recommendations, not approved) and the OQ defaults (file 17 §3, §4.2). HD-5 is superseded in substance by ACC-R2-HD-02, not approved. HD-4 interacts with maker-only initiation (file 07 §4 item 5) and is **not** decided by it.

## Reconstruction basis

Unchanged from v0.1–v0.8 (DEC-011, DEC-013, DEC-014, CURRENT_STATE, Module Index §7/§11/§18/§19, Doc 00 §1.D/§2C/§10.2A/§21/§21A/§23, Role Matrix §3.4/§3.6/§3.7/§3.8/§5.1/§5.2A/§7/§23/§29/§30, Workflow WF-26/WF-27/§33A.3, System Rules §18/§26 incl. `OFF-RULE-001`, CLT-01 §5.19). Source facts about IAM-02 and CLT-01 were verified for v0.3 and re-verified by the round-3…round-8 reviews; no IAM-02, CLT-01 or LED-01 fact changed for v0.9. v0.9's changes are entirely about ACC-01's **own database design** (making the database ownership of counters and pointers, the seal pin and the maker-only initiation match the architecture already approved) and precision. The conductor semantics used for the round-8 checkpoint are recorded in `06-human-decision-r8.md`.

## Files

| # | File | Content |
|---|---|---|
| 01 | [Module Blueprint](01_Module_Blueprint.md) | ACC-REQ-060 refined (the single version owner is `trg_acc1_counter_guard`); **new ACC-REQ-061** (protected columns: one owner, two layers), **-062** (seal pin legal only inside its seal), **-063** (maker-only initiation follows the request state machine), **-064** (runtime role never an owner); ACC-REQ-041/059 and the §7.3/§7.4 narrative aligned |
| 02 | [Workflow](02_Workflow.md) | A4: the application never writes a protected column; apply-owned fields (incl. `sec_audit_ref`, `result_ref`) in the single `requested → applied` `UPDATE`, references pre-allocated; §5 restriction apply; **§7.1 item 3 rewritten (INSERT `requested` → UPDATE `applied` → `closing`; never INSERT `applied`)**; §7.4 item 3 and §7.7 item 3 (steps 3, 4, 6, 8, 9) updated: the `UPDATE` names only `status`; §9 profile |
| 03 | [Diagrams](03_Diagrams.md) | One abort-note line corrected (counters owned by the guard); version label |
| 04 | [API Specification](04_API_Specification.md) | `seal_closure` row: the exact stored payload shape (file 05 §2.4.3); initiation routes: the §5.6 order |
| 05 | [Database Design](05_Database_Design.md) | **Core of the remediation.** §1 rules 8–9 (runtime role never an owner; two layers); §2.2.1 (**the protected-column set and the column classes**); §2.4/§2.4.2 (maker-only `CHECK`s scoped to `applied`, apply-owned fields terminal, pre-allocated references, `id` immutable, `updated_at_utc` meaningless); **§2.4.3 (stored `seal_closure` payload)**; §2.9/§2.9.1 (seal-pin column ownership); §5.0 (`xid8` correlation only; seal request applied in the sealing transaction); trigger table (**new `trg_acc1_counter_guard`, `trg_acc1_seal_pin_bind`, `trg_acc1_seal_pin_complete`**; `trg_acc1_status_transition` and `trg_acc1_seal` no longer assign; `trg_acc1_closure_barrier` folded into the guard; `trg_acc1_restriction_version` `SECURITY DEFINER`); §5.1/§5.2 orders updated; §5.3 timing wording; **§5.4 the counter guard, §5.5 seal-pin bind and completeness, §5.6 initiation order (new)**; §6 grants (protected columns removed; column-level `INSERT`); §7 rules 5s–5y; §8 |
| 06 | [State Machine](06_State_Machine.md) | Rule 3 / version-evidence / §4 text; invariants 9a–9d and 10 (no orphan pin) |
| 07 | [Permission Rules](07_Permission_Rules.md) | Unchanged in substance; version label only |
| 08 | [Audit Log Events](08_Audit_Log_Events.md) | Unchanged in substance; version label only |
| 09 | [Error Handling](09_Error_Handling.md) | New database-raised `ACC1_COUNTER_OWNERSHIP_VIOLATION`, `ACC1_SEAL_PIN_INVALID`, `ACC1_SEAL_PIN_ORPHAN`; `ACC1_CLOSURE_APPROVAL_STALE`, `ACC1_CLOSURE_RECOVERY_INTEGRITY`, `ACC1_CHANGE_REQUEST_STATE_INVALID` rows extended |
| 10 | [Test Cases](10_Test_Cases.md) | T-092, T-240, T-242, T-316, T-329, T-335, T-344, T-346, T-352, T-355 rewritten in place; **§23 added (T-357…T-400)**: protected-column two-layer ownership (raw rewinds, stale-approval attack, `status` named but unchanged, one increment per mutation), seal pin only inside its seal (both savepoint structures), maker-only initiation lifecycle, timing/`xid8`/non-ownership/apply-owned-field precision, whole-pack sweep, regression |
| 11 | [Claude Prompt](11_Claude_Prompt.md) | Round-8 rules: never write a protected column; seal-pin and initiation orders; non-ownership; correlation-only `xid8`; no `SET CONSTRAINTS` in apply paths |
| 12 | [Risk and Control Map](12_Risk_And_Control_Map.md) | Rows 52–55 added (counters, seal pin, maker-only lifecycle, precision) |
| 13 | [Reconciliation Design](13_Reconciliation_Design.md) | R-9 also checks counter monotonicity / pointer agreement against the history chain and that no orphan pin exists; `xid8` is audit metadata only |
| 14 | [Go-Live Checklist](14_Go_Live_Checklist.md) | Round-8 test gate added (incl. the P1 non-ownership criterion) |
| 15 | [Regulatory Mapping](15_Regulatory_Mapping.md) | Unchanged in substance; version label only |
| 16 | [Data Classification](16_Data_Classification.md) | Unchanged in substance; version label only |
| 17 | [Dependency Change Requests and Open Questions](17_Dependency_Change_Requests_And_Open_Questions.md) | §4.9 (round 8 — no new human decision); no new DCR |

## What changed from v0.8 (summary; full map in `05-remediation-r8.md`)

1. **The counters and pointers have one database owner and two enforcement layers (R8-F01).** v0.8 owned `version`, `closure_cycle`, `closure_seal_version` and the closure pointers by `BEFORE UPDATE OF status` triggers while the runtime role could `UPDATE` those columns directly — a statement that did not name `status` bypassed every owner and could rewind `version` to cure a stale approval. v0.9 defines **one protected set** (file 05 §2.2.1: `version`, `close_change_request_id`, `closure_family_id`, `closure_seal_pin_id`, `closure_barrier`, `closure_cycle`, `closure_sealed_at_utc`, `closure_seal_version`, `closure_sealed_at_version`, `closed_at_utc`), removes the runtime role's `INSERT`/`UPDATE` privilege on it (**Layer 1**) and adds an immediate guard, `trg_acc1_counter_guard`, that runs on **every** `INSERT`/`UPDATE` and is the **single owner** of `version` and every protected column (**Layer 2**, §5.4). It states why a `BEFORE` trigger may assign what the caller may not name (privileges are checked against the statement's named columns; the runtime role is a grantee, not the owner). `SET status = status` is not a transition; one version increment per version-relevant mutation, none for a no-op; the restriction path bumps through a `SECURITY DEFINER` touch. `trg_acc1_status_transition` and `trg_acc1_seal` no longer assign; `trg_acc1_closure_barrier` is folded into the guard unweakened.
2. **A seal pin is legal only inside its own seal (R8-F02).** The stored `seal_closure` payload has an exact shape (file 05 §2.4.3). `trg_acc1_seal_pin_bind` (immediate) requires the seal request applied in this transaction, a locked `closing` target with no pin and `closure_seal_version = current + 1`, and **stamps** every approval-owned pin column from the stored payload, comparing it with the live row (a stale seal cannot be cured by writing current values into the pin); `trg_acc1_seal_pin_complete` (deferred) refuses any commit that leaves a pin that is not the committed seal pin of a `closure_sealed` target, so a swallowed-`SAVEPOINT` orphan can never permanently block a target's next seal. Both savepoint structures are specified and tested; pin column ownership is one class per column (§2.9.1).
3. **Maker-only initiation matches the request state machine (R8-F03).** `INSERT requested` (apply-owned fields NULL) → `UPDATE requested → applied` in the same transaction → the account enters `closing` under that applied request; the maker-only evidence `CHECK`s are scoped to `applied`; a direct `INSERT applied` is refused; no checker at initiation (ACC-R3-HD-02 unchanged); the final seal keeps its checker. File 02 §7.1 item 3 and file 05 §2.4/§2.4.2/§5.6 now agree.
4. **Precision (R8-F04).** Deferred proofs are read-only and **correct whenever they fire** (at commit or earlier under `SET CONSTRAINTS … IMMEDIATE`; "evaluated once at commit" / "once per abort" withdrawn); `applied_xact_id`/`created_xact_id` are **current-transaction correlation only**, every same-transaction check paired with live bindings; `role_acc1_runtime` is a grantee, never an owner (a **P1 acceptance criterion**; T-092 corrected); every apply-owned request field, `sec_audit_ref` and `result_ref` included, is written in the single `requested → applied` `UPDATE` (audit references pre-allocated); `id` joins the immutable request columns; `updated_at_utc` carries no security meaning.

**What the database still does not prove:** IAM-02's authorisation of the approval and the genuineness of a cited seal rejection. Those remain the external gates RF-01 / `IAM2-FIND-002`, DCR-ACC-IAM-07/-08 and DCR-ACC-FND-02, unchanged and not claimed closed. RF-01, RF-02, RF-05 and RF-09 remain open external gates.

*v0.9 — REMEDIATED / AWAITING RE-REVIEW. Planning only. Nothing is accepted; implementation is not authorised.*
