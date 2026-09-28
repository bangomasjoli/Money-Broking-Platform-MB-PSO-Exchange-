---
document_id: ACC-01-BP-v0.7
title: ACC-01 Blueprint Pack — Account Structure (Master Account & Subaccount)
version: v0.7
document_status: DRAFT
implementation_status: NOT_STARTED
module: ACC-01
control: Master account and subaccount identity, lifecycle, legal-entity ownership
owner: Unassigned
effective_date: 2026-09-29
last_reviewed: 2026-09-29
supersedes: none (v0.1, v0.2, v0.3, v0.4, v0.5 and v0.6 are reviewed historical packs and are preserved unchanged)
baseline_commit: 5a4f872
---

# ACC-01 Blueprint Pack v0.7 — Account Structure

**Status: REMEDIATED (round 6, under a procedural human-decision checkpoint) / AWAITING RE-REVIEW.** Planning only. Nothing is accepted. This pack designs; it authorises **no application code and no migration**, and **implementation is not authorised**. It remediates the findings of the separate-context review of v0.6 ([`04-review-r6.md`](../../../../03_implementation/tasks/ACC-01/04-review-r6.md), verdict REMEDIATE) — **ACC-01-R6-F01** (MEDIUM), **ACC-01-R6-F02** (LOW) and **ACC-01-R6-F03** (INFO) — as **technical corrections within the already-approved decisions (ACC-R3-HD-01, ACC-R4-HD-01, ACC-R5-HD-01)**. **No new human design decision was needed or taken in round 6**; the round-6 checkpoint is procedural only (planning-round continuation). It has **not** been re-reviewed; a further **separate-context re-review** is required. Finding-by-finding evidence: [`05-remediation-r6.md`](../../../../03_implementation/tasks/ACC-01/05-remediation-r6.md).

**How v0.7 came to exist.** Planning rounds were already at a prior human-authorised over-limit entry (6). `04-review-r6.md` required another human-decision cycle before any further planning turn (`PLANNING → PLANNING` is illegal at any count): `PLANNING → HUMAN_DECISION_REQUIRED` (checkpoint [`06-human-decision-r6.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r6.md)), then a `resolve_human_decision` re-entry to `PLANNING` for this remediation (`planning` 6 → 7). The task is **not** `PLAN_READY`.

v0.1 ([`../v0.1/`](../v0.1/)), v0.2 ([`../v0.2/`](../v0.2/)), v0.3 ([`../v0.3/`](../v0.3/)), v0.4 ([`../v0.4/`](../v0.4/)), v0.5 ([`../v0.5/`](../v0.5/)) and v0.6 ([`../v0.6/`](../v0.6/)) are reviewed historical evidence and are **not modified**.

| Version | Status |
|---|---|
| v0.1 | REVIEWED / REMEDIATE |
| v0.2 | REVIEWED / REMEDIATE |
| v0.3 | REVIEWED / REMEDIATE |
| v0.4 | REVIEWED / REMEDIATE |
| v0.5 | REVIEWED / REMEDIATE |
| v0.6 | REVIEWED / REMEDIATE |
| **v0.7** | **REMEDIATED / AWAITING RE-REVIEW** |

## Human decisions binding on this version (approved by Aiman)

**Earlier decisions — unchanged** (file 17 §4.1): ACC-HD-1 (default subaccount structural only), ACC-HD-2 (no local roles; no real-actor apply until `IAM2-FIND-002`), ACC-HD-3 (subaccount limit is configuration), RF-02 (no void/bypass; creation needs a completable closure), Closure safety (barrier → post-barrier attestation → close), Retention (no hard deletion).

**Round-2 decisions** (file 17 §4.3): ACC-R2-HD-01 (drain allow-list), -02 (final checker approval immediately before the seal), **-03 (governed abort — the practical scope is AMENDED by ACC-R4-HD-01)**, **-04 (master + default enter `closing` atomically — the part requiring every child to be `closed` before the master seals is AMENDED by ACC-R3-HD-01)**, -05 (independent barrier), -06 (CFG-01 owns environment availability), -07 (no claim IAM-02 binds the apply actor), -08 (least-privilege peer credentials).

**Round-3 decisions** (file 17 §4.4; recorded as given in [`06-human-decision-r3.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r3.md)): ACC-R3-HD-01 (master-family closure), -02 (maker-only closure initiation; OQ-13 resolved), -03 (dependency evidence rule).

**Round-4 decisions — unchanged** (file 17 §4.5; recorded as given in [`06-human-decision-r4.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r4.md)): ACC-R4-HD-01 (rejected / withdrawn closure initiation; amends the practical scope of ACC-R2-HD-03 — its family scope is confirmed by ACC-R5-HD-01), ACC-R4-HD-02 (ACC-01 not registered in the conductor runtime store).

**Round-5 decision — unchanged** (file 17 §4.6; recorded as given in [`06-human-decision-r5.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r5.md)): ACC-R5-HD-01 (family pre-seal recovery scope — "pre-seal only" applies to the abort **target**, not to every returned row).

**Round 6 — no new decision.** `04-review-r6.md` found no conflict with any approved decision and asked for no human design decision (§7, §18); the round-6 checkpoint ([`06-human-decision-r6.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r6.md)) is a **procedural** `resolve_human_decision` authorising the planning-round continuation only. R6-F01…F03 are implemented as technical corrections **within** ACC-R3-HD-01, ACC-R4-HD-01 and ACC-R5-HD-01, as recorded below.

**Resolved open questions:** OQ-07 (by ACC-R2-HD-03), OQ-11 (by ACC-R2-HD-06), OQ-12 (by ACC-R2-HD-02), OQ-13 (by ACC-R3-HD-02). **Still pending:** HD-4, HD-6, HD-7, HD-8, HD-9 (recommendations, not approved) and the OQ defaults (file 17 §3, §4.2). HD-5 is superseded in substance by ACC-R2-HD-02, not approved. HD-4 interacts with maker-only initiation (file 07 §4 item 5) and is **not** decided by it.

## Reconstruction basis

Unchanged from v0.1–v0.6 (DEC-011, DEC-013, DEC-014, CURRENT_STATE, Module Index §7/§11/§18/§19, Doc 00 §1.D/§2C/§10.2A/§21/§21A/§23, Role Matrix §3.4/§3.6/§3.7/§3.8/§5.1/§5.2A/§7/§23/§29/§30, Workflow WF-26/WF-27/§33A.3, System Rules §18/§26 incl. `OFF-RULE-001`, CLT-01 §5.19). Source facts about IAM-02 and CLT-01 were verified for v0.3 and re-verified by the round-3, round-4, round-5 and round-6 reviews; no IAM-02, CLT-01 or LED-01 fact changed for v0.7. v0.7's changes are entirely about ACC-01's **own database design** (binding `closure_recovery` rows to the actually-transitioned account rows) and precision. The conductor semantics used for the round-6 checkpoint are recorded in `06-human-decision-r6.md`.

## Files

| # | File | Content |
|---|---|---|
| 01 | [Module Blueprint](01_Module_Blueprint.md) | Governed-abort narrative and requirement register updated for database-stamped recovery facts and the normative abort statement order (ACC-REQ-045/057, §7.3, §7.4); rejection-citation cycle/family binding stated normatively (§7.3); stale endpoint-trust claim in §4.5 marked historical |
| 02 | [Workflow](02_Workflow.md) | §7.7 item 3 rewritten as the **normative abort statement order** (R6-F02); rejection-citation cycle/family binding (§7.7 1b, R6-F03(a)) |
| 03 | [Diagrams](03_Diagrams.md) | Unchanged in substance; version label only |
| 04 | [API Specification](04_API_Specification.md) | `abort_closure` payload note: a cited rejected-seal request must belong to the owner's **current** cycle and initiation (R6-F03(a)) |
| 05 | [Database Design](05_Database_Design.md) | **`closure_recovery`'s identity/status/version columns are now database-stamped, not caller-written** (new `trg_acc1_recovery_bind`, R6-F01A/B/E); `trg_acc1_recovery_scope` gains a **commit-time bijection** against `account_status_history` (R6-F01C/D); `trg_acc1_status_transition` binds the applied `abort_closure` request to **this transaction**; `trg_acc1_default_protected` and the immediate/deferred trigger split are stated explicitly (R6-F02); new `trg_acc1_pin_readiness_window` binds `closure_seal_pin_readiness` inserts to the sealing transaction (R6-F03(d)); `trg_acc1_seal`'s fingerprint vs. relational-equality roles clarified (R6-F03(e)) |
| 06 | [State Machine](06_State_Machine.md) | §5 "Recovery" restates the evidence as database-stamped and bijection-checked, not caller-asserted |
| 07 | [Permission Rules](07_Permission_Rules.md) | Unchanged in substance; version label only |
| 08 | [Audit Log Events](08_Audit_Log_Events.md) | Unchanged in substance; version label only |
| 09 | [Error Handling](09_Error_Handling.md) | `ACC1_CLOSURE_ABORT_INVALID` and `ACC1_CLOSURE_APPROVAL_STALE` rows note the new database-level source of the refusal (R6-F01) |
| 10 | [Test Cases](10_Test_Cases.md) | §21 added (T-307…T-329): adversarial raw-DB binding/bijection tests (R6-F01), statement-order tests (R6-F02), precision tests (R6-F03); T-279…T-282 rewritten in place to name the actual refusing mechanism |
| 11 | [Claude Prompt](11_Claude_Prompt.md) | Unchanged in substance; version label only |
| 12 | [Risk and Control Map](12_Risk_And_Control_Map.md) | Row 46 note extended: the abort's structural enforcement now rests on database stamping and a bijection, not a caller-written column |
| 13 | [Reconciliation Design](13_Reconciliation_Design.md) | R-6 wording corrected: "per **pinned required** attester", not "per configured attester" (R6-F03(b)); R-9 extended with the bijection property |
| 14 | [Go-Live Checklist](14_Go_Live_Checklist.md) | L35/L37 endpoint-trust wording aligned with 01 §4.5 (R6-F03(c)) |
| 15 | [Regulatory Mapping](15_Regulatory_Mapping.md) | Unchanged in substance; version label only |
| 16 | [Data Classification](16_Data_Classification.md) | Unchanged in substance; version label only |
| 17 | [Dependency Change Requests and Open Questions](17_Dependency_Change_Requests_And_Open_Questions.md) | DCR-ACC-IAM-08's consumer contract gains the cycle/initiation binding rule (R6-F03(a)); no new DCR; no new human decision |

## What changed from v0.6 (summary; full map in `05-remediation-r6.md`)

1. **`closure_recovery` facts are now database-stamped, not caller-written (R6-F01).** A new `BEFORE INSERT` trigger, `trg_acc1_recovery_bind`, locks the account row (already locked under the established lock order) and the abort's own `account_change_request` row and **stamps** — ignoring any caller-supplied value — `from_status`, `closure_cycle_before`, `closure_seal_version_at_abort`, `closure_family_id`, `family_role` (against `closure_family_member.membership`), and `abort_target_type`/`abort_target_id`/`abort_target_from_status` (derived from the request's own stored target, never from the row the caller wrote). `target_version_approved` is checked against the row's actual pre-abort `version` under lock, not merely trusted. This makes the target-scoped pre-seal `CHECK` and the converse ("never once `closure_sealed`") true of the **actual** account state, not of a value the caller asserted.
2. **A commit-time bijection with `account_status_history` (R6-F01).** `trg_acc1_recovery_scope` (deferred) now also requires, for the same `change_request_id`: every `closure_recovery` row has exactly one matching `closure_abort` status-history row of its target (same `from_status`, `version_after = target_version_approved + 1`, cycle, seal version), and every such status-history row has exactly one `closure_recovery` row. A recovery row with no matching transition, or a transition with no recovery row, refuses the commit — closing the "partial recovery" gap the row-only checks could not see.
3. **The abort request is bound to this transaction (R6-F01).** `trg_acc1_status_transition`'s "applied `abort_closure` request" check, and the new `trg_acc1_recovery_bind`, both require the cited request to have been moved `requested → applied` **in this transaction** (proved by comparing its row's transaction identity to the current transaction), so an older applied request, or one targeting another account or family, can never ground a new abort.
4. **A normative abort statement order (R6-F02).** 02 §7.7 item 3 states one order: lock, apply the request, insert the (now database-stamped) recovery rows, then one coherent `UPDATE` per returned row, then the family status, then audit, then commit — matching what the immediate triggers (`trg_acc1_status_transition`, `trg_acc1_closure_barrier`, `trg_acc1_default_protected`) actually require, with the family-wide checks (`trg_acc1_recovery_scope`, `trg_acc1_closure_family`, `trg_acc1_master_default_invariant`) confirmed at commit.
5. **Precision (R6-F03).** The rejection-citation ground is now normatively bound to the cited request's current cycle and initiation, not only tested (a); reconciliation R-6 is corrected to "per pinned required attester" (b); the stale "a configured endpoint satisfies every runtime dependency" sentence in 01 §4.5 is marked historical (c); `closure_seal_pin_readiness` inserts are now bound to the sealing transaction by a new trigger (d); the fingerprint vs. relational-equality roles of `trg_acc1_seal` are stated explicitly (e).

*v0.7 — REMEDIATED / AWAITING RE-REVIEW. Planning only. Nothing is accepted; implementation is not authorised.*
