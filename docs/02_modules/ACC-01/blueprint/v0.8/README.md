---
document_id: ACC-01-BP-v0.8
title: ACC-01 Blueprint Pack — Account Structure (Master Account & Subaccount)
version: v0.8
document_status: DRAFT
implementation_status: NOT_STARTED
module: ACC-01
control: Master account and subaccount identity, lifecycle, legal-entity ownership
owner: Unassigned
effective_date: 2026-09-29
last_reviewed: 2026-09-29
supersedes: none (v0.1, v0.2, v0.3, v0.4, v0.5, v0.6 and v0.7 are reviewed historical packs and are preserved unchanged)
baseline_commit: 5a4f872
---

# ACC-01 Blueprint Pack v0.8 — Account Structure

**Status: REMEDIATED (round 7, under a procedural human-decision checkpoint) / AWAITING RE-REVIEW.** Planning only. Nothing is accepted. This pack designs; it authorises **no application code and no migration**, and **implementation is not authorised**. It remediates the findings of the separate-context review of v0.7 ([`04-review-r7.md`](../../../../03_implementation/tasks/ACC-01/04-review-r7.md), verdict REMEDIATE) — **ACC-01-R7-F01** (MEDIUM) and **ACC-01-R7-F02** (INFO) — as **technical corrections within the already-approved decisions (ACC-R3-HD-01, ACC-R4-HD-01, ACC-R5-HD-01)**. **No new human design decision was needed or taken in round 7**; the round-7 checkpoint ([`06-human-decision-r7.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r7.md), human authorisation "approve ACC R7 procedural continuation") is procedural only. It has **not** been re-reviewed; a further **separate-context re-review** is required. Finding-by-finding evidence: [`05-remediation-r7.md`](../../../../03_implementation/tasks/ACC-01/05-remediation-r7.md).

**How v0.8 came to exist.** Planning rounds were already at a prior human-authorised over-limit entry (7). `04-review-r7.md` required another human-decision cycle before any further planning turn (`PLANNING → PLANNING` is illegal at any count): `PLANNING(7) → HUMAN_DECISION_REQUIRED` (checkpoint [`06-human-decision-r7.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r7.md); `planning` stays 7, `escalation` stays 0), then a `resolve_human_decision` re-entry to `PLANNING` for this remediation (`planning` 7 → 8). The task is **not** `PLAN_READY`.

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
| **v0.8** | **REMEDIATED / AWAITING RE-REVIEW** |

## Human decisions binding on this version (approved by Aiman)

**Earlier decisions — unchanged** (file 17 §4.1): ACC-HD-1 (default subaccount structural only), ACC-HD-2 (no local roles; no real-actor apply until `IAM2-FIND-002`), ACC-HD-3 (subaccount limit is configuration), RF-02 (no void/bypass; creation needs a completable closure), Closure safety (barrier → post-barrier attestation → close), Retention (no hard deletion).

**Round-2 decisions** (file 17 §4.3): ACC-R2-HD-01 (drain allow-list), -02 (final checker approval immediately before the seal), **-03 (governed abort — the practical scope is AMENDED by ACC-R4-HD-01)**, **-04 (master + default enter `closing` atomically — the part requiring every child to be `closed` before the master seals is AMENDED by ACC-R3-HD-01)**, -05 (independent barrier), -06 (CFG-01 owns environment availability), -07 (no claim IAM-02 binds the apply actor), -08 (least-privilege peer credentials).

**Round-3 decisions** (file 17 §4.4; recorded as given in [`06-human-decision-r3.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r3.md)): ACC-R3-HD-01 (master-family closure), -02 (maker-only closure initiation; OQ-13 resolved), -03 (dependency evidence rule).

**Round-4 decisions — unchanged** (file 17 §4.5; recorded as given in [`06-human-decision-r4.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r4.md)): ACC-R4-HD-01 (rejected / withdrawn closure initiation; amends the practical scope of ACC-R2-HD-03 — its family scope is confirmed by ACC-R5-HD-01), ACC-R4-HD-02 (ACC-01 not registered in the conductor runtime store).

**Round-5 decision — unchanged** (file 17 §4.6; recorded as given in [`06-human-decision-r5.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r5.md)): ACC-R5-HD-01 (family pre-seal recovery scope — "pre-seal only" applies to the abort **target**, not to every returned row).

**Round 7 — no new decision.** `04-review-r7.md` found no conflict with any approved decision and asked for no human design decision (§7, §20); the round-7 checkpoint ([`06-human-decision-r7.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r7.md)) is a **procedural** `resolve_human_decision` authorising the planning-round continuation only. R7-F01 and R7-F02 are implemented as technical corrections **within** ACC-R3-HD-01, ACC-R4-HD-01 and ACC-R5-HD-01, as recorded below. ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02 and ACC-R5-HD-01 are preserved exactly.

**Round 6 — no new decision.** `04-review-r6.md` found no conflict with any approved decision and asked for no human design decision (§7, §18); the round-6 checkpoint ([`06-human-decision-r6.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r6.md)) is a **procedural** `resolve_human_decision` authorising the planning-round continuation only. R6-F01…F03 are implemented as technical corrections **within** ACC-R3-HD-01, ACC-R4-HD-01 and ACC-R5-HD-01, as recorded below.

**Resolved open questions:** OQ-07 (by ACC-R2-HD-03), OQ-11 (by ACC-R2-HD-06), OQ-12 (by ACC-R2-HD-02), OQ-13 (by ACC-R3-HD-02). **Still pending:** HD-4, HD-6, HD-7, HD-8, HD-9 (recommendations, not approved) and the OQ defaults (file 17 §3, §4.2). HD-5 is superseded in substance by ACC-R2-HD-02, not approved. HD-4 interacts with maker-only initiation (file 07 §4 item 5) and is **not** decided by it.

## Reconstruction basis

Unchanged from v0.1–v0.7 (DEC-011, DEC-013, DEC-014, CURRENT_STATE, Module Index §7/§11/§18/§19, Doc 00 §1.D/§2C/§10.2A/§21/§21A/§23, Role Matrix §3.4/§3.6/§3.7/§3.8/§5.1/§5.2A/§7/§23/§29/§30, Workflow WF-26/WF-27/§33A.3, System Rules §18/§26 incl. `OFF-RULE-001`, CLT-01 §5.19). Source facts about IAM-02 and CLT-01 were verified for v0.3 and re-verified by the round-3…round-7 reviews; no IAM-02, CLT-01 or LED-01 fact changed for v0.8. v0.8's changes are entirely about ACC-01's **own database design** (making the database proof match the architecture already approved) and precision. The conductor semantics used for the round-7 checkpoint are recorded in `06-human-decision-r7.md`.

## Files

| # | File | Content |
|---|---|---|
| 01 | [Module Blueprint](01_Module_Blueprint.md) | ACC-REQ-059 rewritten (both-direction, stored-payload, one-transaction-identity proof); ACC-REQ-060 (single version owner; normative abort and seal orders); §7.3/§7.4 narrative aligned |
| 02 | [Workflow](02_Workflow.md) | A4 states that its generic order does not apply to `abort_closure`/`seal_closure` (R7-F02.1); §7.4 item 3 defers to the one normative seal order (R7-F02.2); §7.7 item 3 rewritten (request `applied` with a database-stamped `applied_xact_id`; recovery rows stamped from the stored payload; the `UPDATE` does not set `version`) |
| 03 | [Diagrams](03_Diagrams.md) | One abort-note line corrected (version/cycle owned by the trigger); version label |
| 04 | [API Specification](04_API_Specification.md) | `abort_closure` row: the canonical stored payload shape (file 05 §2.4.1) and that the database reads it |
| 05 | [Database Design](05_Database_Design.md) | **Core of the remediation.** §2.4: `applied_xact_id`, the stored `abort_closure` payload (§2.4.1), the request status guard and payload immutability (§2.4.2); §2.5: `version_before`, `created_xact_id`; §2.8: one stamping model, stamped from the stored payload, `created_xact_id`; §2.9: `closure_seal_pin.created_xact_id`; §5.0 transaction identity (one meaning, never `xmin`); rewritten `trg_acc1_status_transition`, `trg_acc1_recovery_bind`, `trg_acc1_closure_barrier`, `trg_acc1_recovery_scope`, `trg_acc1_pin_readiness_window`; new `trg_acc1_change_request_status`, `trg_acc1_change_request_immutable`, `trg_acc1_history_abort_scope`, `trg_acc1_abort_apply_complete`, `trg_acc1_family_abort_guard`, `trg_acc1_history_stamp`, `trg_acc1_pin_stamp`; §5.1 abort order amended, §5.2 **seal order (new)**, §5.3 the **abort-set proof** |
| 06 | [State Machine](06_State_Machine.md) | §4 request state diagram is now database-enforced; recovery evidence restated as stamped from the stored payload |
| 07 | [Permission Rules](07_Permission_Rules.md) | Unchanged in substance; version label only |
| 08 | [Audit Log Events](08_Audit_Log_Events.md) | Unchanged in substance; version label only |
| 09 | [Error Handling](09_Error_Handling.md) | New database-raised `ACC1_CLOSURE_RECOVERY_INTEGRITY`; `ACC1_CLOSURE_APPROVAL_STALE`, `ACC1_CLOSURE_ABORT_INVALID` and `ACC1_CHANGE_REQUEST_STATE_INVALID` rows note their database sources |
| 10 | [Test Cases](10_Test_Cases.md) | T-282, T-297, T-309…T-316, T-319, T-320, T-322, T-323, T-325, T-328 rewritten in place to name their mechanism; §22 added (T-329…T-356) |
| 11 | [Claude Prompt](11_Claude_Prompt.md) | Future-implementation brief gains the transaction-identity / stored-payload / statement-order rules |
| 12 | [Risk and Control Map](12_Risk_And_Control_Map.md) | Row 51 (recovery integrity) added |
| 13 | [Reconciliation Design](13_Reconciliation_Design.md) | R-9 compares the stored payload ↔ recovery ↔ history ↔ authoritative account/family history, never a caller value against itself |
| 14 | [Go-Live Checklist](14_Go_Live_Checklist.md) | Round-7 test gate added |
| 15 | [Regulatory Mapping](15_Regulatory_Mapping.md) | Unchanged in substance; version label only |
| 16 | [Data Classification](16_Data_Classification.md) | Unchanged in substance; version label only |
| 17 | [Dependency Change Requests and Open Questions](17_Dependency_Change_Requests_And_Open_Questions.md) | DCR-ACC-IAM-08's cross-reference corrected (R7-F02.4); §4.8 (round 7 — no new human decision); no new DCR |

## What changed from v0.7 (summary; full map in `05-remediation-r7.md`)

1. **The reverse direction of the bijection is enforced from the account side (R7-F01(a)).** `trg_acc1_status_transition` now refuses, **at the status `UPDATE`**, any exit from `closing`/`closure_sealed` under `closure_abort` unless **this target's own** same-transaction `closure_recovery` row for that cause already exists — independent target, master, default and master-directed children alike — removing the zero-recovery-row bypass. A deferred `AFTER INSERT` constraint trigger on `account_status_history` and one on the applied request run the same commit-time **abort-set proof** as the recovery-side trigger, so no direction depends on the other table having a row. `trg_acc1_closure_barrier` is now bound to this target, this cause and this transaction; a `closure_family` cannot become `aborted` without an applied request and the master's recovery row.
2. **"Applied in this transaction" has one explicit mechanism (R7-F01(b)).** `pg_current_xact_id()` (`xid8`, top-level, savepoint-stable) is stamped by the database into `account_change_request.applied_xact_id`, `closure_recovery.created_xact_id`, `account_status_history.created_xact_id` and `closure_seal_pin.created_xact_id`. `account_change_request` gains a status guard (`requested → applied | cancelled | expired` only; terminal thereafter; a no-op re-write cannot re-stamp). `xmin` is never used; the v0.7 "whichever pattern" wording is withdrawn.
3. **The stored approved payload is the authority (R7-F01(c)).** The exact immutable `abort_closure` payload shape is defined (file 05 §2.4.1; immutable from `INSERT`). `trg_acc1_recovery_bind` reads it, **stamps** `abort_target_*`, `reason_code`, `evidence_*`, family id, role and `target_version_approved` from it (one model — stamping, everywhere), and refuses a stale or foreign row; the payload's returned set, the authoritative family set, the recovery targets and the actual `closure_abort` transitions must be **equal** (four-way). R-9 compares the payload, never a caller value with itself.
4. **Precision (R7-F02).** Generic A4 no longer governs `abort_closure`/`seal_closure`; the seal has its own normative statement order (file 05 §5.2); `trg_acc1_status_transition` is the **single owner of `version`** on a status transition (the application never sets it, so `version_after = version_before + 1` exactly); the false "01 §7.3" cross-reference is removed.

**What the database still does not prove:** IAM-02's authorisation of the approval and the genuineness of a cited seal rejection. Those remain the external gates RF-01 / `IAM2-FIND-002`, DCR-ACC-IAM-07/-08 and DCR-ACC-FND-02, unchanged and not claimed closed. RF-01, RF-02, RF-05 and RF-09 remain open external gates.

*v0.8 — REMEDIATED / AWAITING RE-REVIEW. Planning only. Nothing is accepted; implementation is not authorised.*
