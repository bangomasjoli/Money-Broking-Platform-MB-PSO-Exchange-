---
document_id: ACC-01-BP-v0.10
title: ACC-01 Blueprint Pack — Account Structure (Master Account & Subaccount)
version: v0.10
document_status: DRAFT
implementation_status: NOT_STARTED
module: ACC-01
control: Master account and subaccount identity, lifecycle, legal-entity ownership
owner: Unassigned
effective_date: 2026-09-29
last_reviewed: 2026-09-29
supersedes: none (v0.1, v0.2, v0.3, v0.4, v0.5, v0.6, v0.7, v0.8 and v0.9 are reviewed historical packs and are preserved unchanged)
baseline_commit: 5a4f872
---

# ACC-01 Blueprint Pack v0.10 — Account Structure

**Status: REMEDIATED (round 9, under a procedural human-decision checkpoint) / AWAITING RE-REVIEW.** Planning only. Nothing is accepted. This pack designs; it authorises **no application code and no migration**, and **implementation is not authorised**. It remediates the findings of the separate-context review of v0.9 ([`04-review-r9.md`](../../../../03_implementation/tasks/ACC-01/04-review-r9.md), verdict REMEDIATE) — **ACC-01-R9-F01** (MEDIUM), **ACC-01-R9-F02** (LOW) and **ACC-01-R9-F03** (INFO, six precision items) — as **technical corrections within the already-approved decisions (ACC-R3-HD-01, ACC-R3-HD-02, ACC-R4-HD-01, ACC-R5-HD-01)**. **No new human design decision was needed or taken in round 9**; the round-9 checkpoint ([`06-human-decision-r9.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r9.md)) recorded the procedural question, and the human's later, separate statement "approve ACC R9 procedural continuation" is procedural only. It has **not** been re-reviewed; a further **separate-context re-review** is required. **R9-F01 and R9-F02 are not claimed closed: only an independent reviewer can close them.** Finding-by-finding evidence: [`05-remediation-r9.md`](../../../../03_implementation/tasks/ACC-01/05-remediation-r9.md).

**How v0.10 came to exist.** Planning rounds were already at a prior human-authorised over-limit entry (9). `04-review-r9.md` required another human-decision cycle before any further planning turn (`PLANNING → PLANNING` is illegal at any count): `PLANNING(9) → HUMAN_DECISION_REQUIRED` (checkpoint [`06-human-decision-r9.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r9.md); `planning` stays 9, `escalation` stays 0), then a `resolve_human_decision` re-entry to `PLANNING` (`approvedBy` AimanRahimi) for this remediation (`planning` 9 → 10, `escalation` 0). The task is **not** `PLAN_READY`.

v0.1 ([`../v0.1/`](../v0.1/)), v0.2 ([`../v0.2/`](../v0.2/)), v0.3 ([`../v0.3/`](../v0.3/)), v0.4 ([`../v0.4/`](../v0.4/)), v0.5 ([`../v0.5/`](../v0.5/)), v0.6 ([`../v0.6/`](../v0.6/)), v0.7 ([`../v0.7/`](../v0.7/)), v0.8 ([`../v0.8/`](../v0.8/)) and v0.9 ([`../v0.9/`](../v0.9/)) are reviewed historical evidence and are **not modified**.

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
| v0.9 | REVIEWED / REMEDIATE |
| **v0.10** | **REMEDIATED / AWAITING RE-REVIEW** |

## Human decisions binding on this version (approved by Aiman)

**Earlier decisions — unchanged** (file 17 §4.1): ACC-HD-1 (default subaccount structural only), ACC-HD-2 (no local roles; no real-actor apply until `IAM2-FIND-002`), ACC-HD-3 (subaccount limit is configuration), RF-02 (no void/bypass; creation needs a completable closure), Closure safety (barrier → post-barrier attestation → close), Retention (no hard deletion).

**Round-2 decisions** (file 17 §4.3): ACC-R2-HD-01 (drain allow-list), -02 (final checker approval immediately before the seal), **-03 (governed abort — the practical scope is AMENDED by ACC-R4-HD-01)**, **-04 (master + default enter `closing` atomically — the part requiring every child to be `closed` before the master seals is AMENDED by ACC-R3-HD-01)**, -05 (independent barrier), -06 (CFG-01 owns environment availability), -07 (no claim IAM-02 binds the apply actor), -08 (least-privilege peer credentials).

**Round-3 decisions** (file 17 §4.4; recorded as given in [`06-human-decision-r3.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r3.md)): ACC-R3-HD-01 (master-family closure), -02 (maker-only closure initiation; OQ-13 resolved), -03 (dependency evidence rule).

**Round-4 decisions — unchanged** (file 17 §4.5; recorded as given in [`06-human-decision-r4.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r4.md)): ACC-R4-HD-01 (rejected / withdrawn closure initiation; amends the practical scope of ACC-R2-HD-03 — its family scope is confirmed by ACC-R5-HD-01), ACC-R4-HD-02 (ACC-01 not registered in the conductor runtime store).

**Round-5 decision — unchanged** (file 17 §4.6; recorded as given in [`06-human-decision-r5.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r5.md)): ACC-R5-HD-01 (family pre-seal recovery scope — "pre-seal only" applies to the abort **target**, not to every returned row).

**Round 9 — no new decision.** `04-review-r9.md` found no conflict with any approved decision and asked for no human design decision (§7, §22); the round-9 checkpoint ([`06-human-decision-r9.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r9.md)) records the procedural question, and the human's later statement "approve ACC R9 procedural continuation" authorises the planning-round continuation only (`HUMAN_DECISION_REQUIRED → PLANNING(10)`, `resolve_human_decision`). R9-F01…F03 are implemented as technical corrections **within** ACC-R3-HD-01, ACC-R3-HD-02 (maker-only initiation — unchanged; initiation gains a completeness proof, never a checker), ACC-R4-HD-01 and ACC-R5-HD-01, as recorded below. ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02 and ACC-R5-HD-01 are preserved exactly.

**Round 8 — no new decision.** `04-review-r8.md` found no conflict with any approved decision and asked for no human design decision (§7, §21); the round-8 checkpoint ([`06-human-decision-r8.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r8.md)) is a **procedural** `resolve_human_decision` authorising the planning-round continuation only. R8-F01…F04 are implemented as technical corrections **within** ACC-R3-HD-01, ACC-R3-HD-02 (maker-only initiation — unchanged; only its request lifecycle and schema wording are corrected), ACC-R4-HD-01 and ACC-R5-HD-01, as recorded below. ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02 and ACC-R5-HD-01 are preserved exactly.

**Round 7 — no new decision.** `04-review-r7.md` found no conflict with any approved decision and asked for no human design decision (§7, §20); the round-7 checkpoint ([`06-human-decision-r7.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r7.md)) is a **procedural** `resolve_human_decision` authorising the planning-round continuation only. R7-F01 and R7-F02 are implemented as technical corrections **within** ACC-R3-HD-01, ACC-R4-HD-01 and ACC-R5-HD-01, as recorded below. ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02 and ACC-R5-HD-01 are preserved exactly.

**Round 6 — no new decision.** `04-review-r6.md` found no conflict with any approved decision and asked for no human design decision (§7, §18); the round-6 checkpoint ([`06-human-decision-r6.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r6.md)) is a **procedural** `resolve_human_decision` authorising the planning-round continuation only. R6-F01…F03 are implemented as technical corrections **within** ACC-R3-HD-01, ACC-R4-HD-01 and ACC-R5-HD-01, as recorded below.

**Resolved open questions:** OQ-07 (by ACC-R2-HD-03), OQ-11 (by ACC-R2-HD-06), OQ-12 (by ACC-R2-HD-02), OQ-13 (by ACC-R3-HD-02). **Still pending:** HD-4, HD-6, HD-7, HD-8, HD-9 (recommendations, not approved) and the OQ defaults (file 17 §3, §4.2). HD-5 is superseded in substance by ACC-R2-HD-02, not approved. HD-4 interacts with maker-only initiation (file 07 §4 item 5) and is **not** decided by it.

## Reconstruction basis

Unchanged from v0.1–v0.9 (DEC-011, DEC-013, DEC-014, CURRENT_STATE, Module Index §7/§11/§18/§19, Doc 00 §1.D/§2C/§10.2A/§21/§21A/§23, Role Matrix §3.4/§3.6/§3.7/§3.8/§5.1/§5.2A/§7/§23/§29/§30, Workflow WF-26/WF-27/§33A.3, System Rules §18/§26 incl. `OFF-RULE-001`, CLT-01 §5.19). Source facts about IAM-02 and CLT-01 were verified for v0.3 and re-verified by the round-3…round-8 reviews; no IAM-02, CLT-01 or LED-01 fact changed for v0.9. v0.9's changes are entirely about ACC-01's **own database design** (making the database ownership of counters and pointers, the seal pin and the maker-only initiation match the architecture already approved) and precision. The conductor semantics used for the round-8 checkpoint are recorded in `06-human-decision-r8.md`.

## Files

| # | File | Content |
|---|---|---|
| 01 | [Module Blueprint](01_Module_Blueprint.md) | **New ACC-REQ-065** (name resolution pinned and qualified for every function; temporary relations irrelevant) and **ACC-REQ-066** (an applied maker-only initiation always has its initiation effect); ACC-REQ-063/-064 extended |
| 02 | [Workflow](02_Workflow.md) | §7.1 item 3: `approval_id_source` NULL stated; new (e) — the deferred initiation-completeness proof at `COMMIT`; version label |
| 03 | [Diagrams](03_Diagrams.md) | Unchanged in substance; version label only |
| 04 | [API Specification](04_API_Specification.md) | Initiation route: the completeness refusal (`ACC1_CLOSURE_INITIATION_INCOMPLETE`) |
| 05 | [Database Design](05_Database_Design.md) | **Core of the remediation.** §1 rule 8 (`TEMPORARY` deliberately tolerated) and **new rule 10 (name resolution)**; §2.4 / §2.4.2 (full maker-only `CHECK`, completeness proof in the lifecycle); §2.4.3 and §2.9 (exactly-once required attesters, bidirectional equality, `UNIQUE (seal_pin_id, readiness_id)`); trigger table (**`_ins`/`_upd` pairs for status history and restriction version**, `trg_acc1_restriction_cancel_recheck`, **`trg_acc1_initiation_apply_complete` / `_family_scope` / `_history_scope`**, `trg_acc1_family_member_window`, abort-in-initiating-transaction refusal); §5.3 timing inventory; **§5.6.1 initiation-completeness proof (new)**; **§5.7 function and name-resolution hardening (new)**; §6 functions; §7 rules 5z, 5aa; §8 |
| 06 | [State Machine](06_State_Machine.md) | Request-lifecycle paragraph: the initiation completeness proof |
| 07 | [Permission Rules](07_Permission_Rules.md) | Unchanged in substance; version label only |
| 08 | [Audit Log Events](08_Audit_Log_Events.md) | Unchanged in substance; version label only |
| 09 | [Error Handling](09_Error_Handling.md) | New database-raised `ACC1_CLOSURE_INITIATION_INCOMPLETE`; `ACC1_CLOSURE_ABORT_INVALID` extended (no abort in the initiating transaction) |
| 10 | [Test Cases](10_Test_Cases.md) | T-320, T-361, T-390, T-391, T-369 and T-396 rewritten in place; **§24 added (T-401…T-431)**: name-resolution catalogue and source guards and the fresh-session temporary-shadow attacks, initiation completeness under `COMMIT` / `SET CONSTRAINTS` / `SAVEPOINT` / `ROLLBACK TO SAVEPOINT`, the six precision items, whole-pack sweep, regression |
| 11 | [Claude Prompt](11_Claude_Prompt.md) | Round-9 rules: every function pinned and qualified; split triggers; initiation completeness; attester exactly-once |
| 12 | [Risk and Control Map](12_Risk_And_Control_Map.md) | Rows 56–58 added |
| 13 | [Reconciliation Design](13_Reconciliation_Design.md) | Unchanged in substance; version label only |
| 14 | [Go-Live Checklist](14_Go_Live_Checklist.md) | Round-9 test gate added (T-401…T-431) |
| 15 | [Regulatory Mapping](15_Regulatory_Mapping.md) | Unchanged in substance; version label only |
| 16 | [Data Classification](16_Data_Classification.md) | Unchanged in substance; version label only |
| 17 | [Dependency Change Requests and Open Questions](17_Dependency_Change_Requests_And_Open_Questions.md) | §4.10 (round 9 — no new human decision); no new DCR |

## What changed from v0.9 (summary; full map in `05-remediation-r9.md`)

1. **Name resolution is pinned and qualified for EVERY ACC-01 function (R9-F01).** v0.9 specified `search_path = pg_catalog, acc1` for the one `SECURITY DEFINER` function — which leaves the session's temporary schema first for relation lookup — and no path or qualification for any other function, while `role_acc1_runtime` may create temporary tables. A temporary table named like an `acc1` table could capture the restriction touch (no `version` bump) or feed a trigger forged evidence. v0.10 states **one normative rule with no exception** (file 05 §1 rule 10, §5.7): every trigger function, the definer function and every helper or proof procedure carries `SET search_path = pg_catalog, acc1, pg_temp` (`pg_temp` explicit and last) **and** names every `acc1` relation schema-qualified — both, not either. Temporary relations are attacker-controlled but irrelevant; correctness does **not** depend on revoking `TEMPORARY`. Catalogue and source guards plus fresh-session shadow tests (T-401…T-411).
2. **Maker-only initiation has a request-level completeness proof (R9-F02, option (a)).** A `close_master_account` / `close_subaccount` request that reaches `requested → applied` cannot commit unless its target(s) are in `closing` under it, with the same-transaction `closure_initiation` history and coherent versions, and — for a master — its `closure_family`, immutable member snapshot and every master-directed member under that exact family, with `independent_preserved` members untouched (file 05 §5.6.1). One read-only proof, three deferred entry points (`trg_acc1_initiation_apply_complete`, `_family_scope`, `_history_scope`), correct under `COMMIT`, `SET CONSTRAINTS … IMMEDIATE`, `SAVEPOINT` and `ROLLBACK TO SAVEPOINT`; an initiation is never aborted in the transaction that applied it, and a family snapshot cannot grow after the closing `UPDATE`s (`trg_acc1_family_member_window`).
3. **Precision (R9-F03, six items).** Valid `_ins`/`_upd` trigger DDL for status history and restriction version (v0.9's combined `WHEN` was invalid); `SET status = status` on a restriction causes no synthetic bump; the clock-based deferred cancel recheck is named, inventoried and described accurately (statement-time check authoritative); required attesters have exactly-once, bidirectional-equality semantics; the applied maker-only `CHECK` includes `approval_id_source IS NULL`; T-320 and T-361 name the refusing layer correctly.

**What the database still does not prove:** IAM-02's authorisation of the approval and the genuineness of a cited seal rejection. Those remain the external gates RF-01 / `IAM2-FIND-002`, DCR-ACC-IAM-07/-08 and DCR-ACC-FND-02, unchanged and not claimed closed. RF-01, RF-02, RF-05 and RF-09 remain open external gates.

*v0.10 — REMEDIATED / AWAITING RE-REVIEW. Planning only. Nothing is accepted; implementation is not authorised.*
