---
document_id: ACC-01-BP-v0.6
title: ACC-01 Blueprint Pack — Account Structure (Master Account & Subaccount)
version: v0.6
document_status: DRAFT
implementation_status: NOT_STARTED
module: ACC-01
control: Master account and subaccount identity, lifecycle, legal-entity ownership
owner: Unassigned
effective_date: 2026-09-28
last_reviewed: 2026-09-28
supersedes: none (v0.1, v0.2, v0.3, v0.4 and v0.5 are reviewed historical packs and are preserved unchanged)
baseline_commit: 5a4f872
---

# ACC-01 Blueprint Pack v0.6 — Account Structure

**Status: REMEDIATED (round 5, under a human-decision escalation) / AWAITING RE-REVIEW.** Planning only. Nothing is accepted. This pack designs; it authorises **no application code and no migration**, and **implementation is not authorised**. It remediates the findings of the separate-context review of v0.5 ([`04-review-r5.md`](../../../../03_implementation/tasks/ACC-01/04-review-r5.md), verdict REMEDIATE) under one round-5 human decision, ACC-R5-HD-01, plus technical (non-human-decision) corrections of R5-F02…R5-F05 using the routes the review left open to the author, and precision fixes for R5-F06. It has **not** been re-reviewed; a further **separate-context re-review** is required. Finding-by-finding evidence: [`05-remediation-r5.md`](../../../../03_implementation/tasks/ACC-01/05-remediation-r5.md).

**How v0.6 came to exist.** Planning rounds were already at a prior human-authorised over-limit entry (5). `04-review-r5.md` required another human-decision cycle before any further planning turn: `PLANNING → HUMAN_DECISION_REQUIRED` (checkpoint [`06-human-decision-r5.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r5.md)), then a `resolve_human_decision` re-entry to `PLANNING` for this remediation (`planning` 5 → 6). The task is **not** `PLAN_READY`.

v0.1 ([`../v0.1/`](../v0.1/)), v0.2 ([`../v0.2/`](../v0.2/)), v0.3 ([`../v0.3/`](../v0.3/)), v0.4 ([`../v0.4/`](../v0.4/)) and v0.5 ([`../v0.5/`](../v0.5/)) are reviewed historical evidence and are **not modified**.

| Version | Status |
|---|---|
| v0.1 | REVIEWED / REMEDIATE |
| v0.2 | REVIEWED / REMEDIATE |
| v0.3 | REVIEWED / REMEDIATE |
| v0.4 | REVIEWED / REMEDIATE |
| v0.5 | REVIEWED / REMEDIATE |
| **v0.6** | **REMEDIATED / AWAITING RE-REVIEW** |

## Human decisions binding on this version (approved by Aiman)

**Earlier decisions — unchanged** (file 17 §4.1): ACC-HD-1 (default subaccount structural only), ACC-HD-2 (no local roles; no real-actor apply until `IAM2-FIND-002`), ACC-HD-3 (subaccount limit is configuration), RF-02 (no void/bypass; creation needs a completable closure), Closure safety (barrier → post-barrier attestation → close), Retention (no hard deletion).

**Round-2 decisions** (file 17 §4.3): ACC-R2-HD-01 (drain allow-list), -02 (final checker approval immediately before the seal), **-03 (governed abort — the practical scope is AMENDED by ACC-R4-HD-01)**, **-04 (master + default enter `closing` atomically — the part requiring every child to be `closed` before the master seals is AMENDED by ACC-R3-HD-01)**, -05 (independent barrier), -06 (CFG-01 owns environment availability), -07 (no claim IAM-02 binds the apply actor), -08 (least-privilege peer credentials).

**Round-3 decisions** (file 17 §4.4; recorded as given in [`06-human-decision-r3.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r3.md)): ACC-R3-HD-01 (master-family closure), -02 (maker-only closure initiation; OQ-13 resolved), -03 (dependency evidence rule).

**Round-4 decisions — unchanged** (file 17 §4.5; recorded as given in [`06-human-decision-r4.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r4.md)): ACC-R4-HD-01 (rejected / withdrawn closure initiation; amends the practical scope of ACC-R2-HD-03 — its family scope is confirmed by ACC-R5-HD-01 below), ACC-R4-HD-02 (ACC-01 not registered in the conductor runtime store).

**Round-5 decision — new** (file 17 §4.6; recorded as given in [`06-human-decision-r5.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r5.md)):

| ID | Decision | Where applied |
|---|---|---|
| ACC-R5-HD-01 | **Family pre-seal recovery scope.** "Pre-seal only" (ACC-R4-HD-01) applies to the **target** of the governed abort/withdrawal. While `master.status = closing` and the master has not reached `closure_sealed`, a governed pre-seal rejection or withdrawal may trigger a family abort that atomically returns the master, the default and every master-directed child of that family — **even if** some have already reached `closure_sealed`; their barriers are cleared only inside that governed family transaction (ACC-R3-HD-01), never by independent reopening. A master-directed child's seal rejected while the master is `closing` may ground the family abort; the child is not aborted alone. Once the master is `closure_sealed` the pre-seal grounds are no longer legal | 01 ACC-REQ-045/057, §7.3, §7.4; 02 §7.7; 03 §5a, §5b; 04 §2.1.1; 05 §2.8, §5 `trg_acc1_recovery_scope`, §7 5k; 06 §1 rule 8, §1.1; 09; 10 §20.1; 12 row 46; 13 R-9; 14 §5; 15 |

**R5-F02…R5-F05** are corrected as **technical choices the review left open to the author** — R5-F02 option (a), R5-F03 route 1, R5-F04 as specified, R5-F05 option (ii) — confirmed by the human as within the existing approved decisions and needing no separate human decision. **R5-F06** is precision and record accuracy only.

**Resolved open questions:** OQ-07 (by ACC-R2-HD-03), OQ-11 (by ACC-R2-HD-06), OQ-12 (by ACC-R2-HD-02), OQ-13 (by ACC-R3-HD-02). **Still pending:** HD-4, HD-6, HD-7, HD-8, HD-9 (recommendations, not approved) and the OQ defaults (file 17 §3, §4.2). HD-5 is superseded in substance by ACC-R2-HD-02, not approved. HD-4 interacts with maker-only initiation (file 07 §4 item 5) and is **not** decided by it.

## Reconstruction basis

Unchanged from v0.1–v0.5 (DEC-011, DEC-013, DEC-014, CURRENT_STATE, Module Index §7/§11/§18/§19, Doc 00 §1.D/§2C/§10.2A/§21/§21A/§23, Role Matrix §3.4/§3.6/§3.7/§3.8/§5.1/§5.2A/§7/§23/§29/§30, Workflow WF-26/WF-27/§33A.3, System Rules §18/§26 incl. `OFF-RULE-001`, CLT-01 §5.19). Source facts about IAM-02 and CLT-01 were verified for v0.3 and by the round-3, round-4 and round-5 reviews; v0.5 re-read IAM-02's `routes/internal.ts`; **the round-5 review re-read `routes/approvals.ts` and `routes/internal.ts`** (`04-review-r5.md` §2: a rejection is durably recorded, but no route exposes an approval's outcome), and **the v0.6 remediation session re-confirmed that route inventory read-only** (file 02 §0, R5-F06.2). v0.6's other changes concern *target* contracts and ACC-01's own design. The conductor semantics used for the round-5 escalation are recorded in `06-human-decision-r5.md`.

## Files

| # | File | Content |
|---|---|---|
| 01 | [Module Blueprint](01_Module_Blueprint.md) | Ownership, requirements (**ACC-REQ-058 new; 045, 055, 056, 057 amended**), dependency evidence classification (§4.5, **new `DEP-IAM-SEAL-REJECTION-EVIDENCE`; peer authentication fail-closed**), lifecycle, drain allow-list, pinned readiness and attestation (**authenticated attester identity, non-empty set**), governed abort (**pre-seal grounds scoped to the abort target; version-bound; `checker_rejected_seal` hard-unavailable**), master-family closure (§7.4), consumer evaluation order |
| 02 | [Workflow](02_Workflow.md) | IAM-02 reality (**§0 re-read note corrected; fact 8 added**) and actor provenance, change request, apply (**abort version re-check at A4**), create, subaccount, restriction, lift/cancel, maker-only initiation, pinned seal (**attester identity**), family completion and **abort (§7.7 1a/1b/2/3 rewritten)**, resolve |
| 03 | [Diagrams](03_Diagrams.md) | Hierarchy, sequences, evaluation order, closure sequence, family closure sequence (**family pre-seal return**), **pre-seal rejection/withdrawal sequence (§5b rewritten: target-scoped, IAM-08-gated)** |
| 04 | [API Specification](04_API_Specification.md) | Staff, internal, deferred client routes; **seal body carries attester identity/count/set hash; abort body version-bound, target-scoped, independent-member grounds** |
| 05 | [Database Design](05_Database_Design.md) | `acc1` schema: **`closure_recovery` gains `abort_target_type`/`abort_target_id`/`abort_target_from_status`/`target_version_approved`/rejection ids and a target-scoped `CHECK`; new `trg_acc1_recovery_scope`; attester identity on readiness/pin/attestation; `pinned_required_attester_count >= 1`** |
| 06 | [State Machine](06_State_Machine.md) | Statuses, transitions incl. family completion and abort (**rule 8 and §1.1 rescoped to the abort target**), consumer evaluation order, restriction lifecycle |
| 07 | [Permission Rules](07_Permission_Rules.md) | Catalogue (**step-10 wording qualified on every non-approval closure row**); IAM-02 reality; maker-initiation; HD-4 interaction (**withdrawal control stated plainly**) |
| 08 | [Audit Log Events](08_Audit_Log_Events.md) | `acc1.*` events (**abort event records target, bound versions, ground owner, IAM-02 rejection evidence; `PEER_NOT_AUTHENTICATED`**) |
| 09 | [Error Handling](09_Error_Handling.md) | `ACC1_*` codes (**`ACC1_CLOSURE_APPROVAL_STALE` extended to abort; `ACC1_CLOSURE_ABORT_INVALID` per-target; `ACC1_DEPENDENCY_NOT_SATISFIED` for `checker_rejected_seal`**) |
| 10 | [Test Cases](10_Test_Cases.md) | Test plan (**T-276…T-306 added, §20; T-237, T-238, T-255, T-256, T-262…T-266, T-269 rewritten in place**) |
| 11 | [Claude Prompt](11_Claude_Prompt.md) | **Future** phased brief — not authorised (non-negotiable 10 and 4a aligned) |
| 12 | [Risk and Control Map](12_Risk_And_Control_Map.md) | Risks and controls (**rows 41, 46, 48 corrected; row 50 added**) |
| 13 | [Reconciliation Design](13_Reconciliation_Design.md) | Structural reconciliation R-1…R-10 (**R-9 rescoped to the abort target; R-10 attester set**) |
| 14 | [Go-Live Checklist](14_Go_Live_Checklist.md) | Dependency evidence table (**`DEP-IAM-SEAL-REJECTION-EVIDENCE`; FND-02 fail-closed**), configuration, runbooks (**withdrawal as today's route; family pre-seal return; no persistence rule**) |
| 15 | [Regulatory Mapping](15_Regulatory_Mapping.md) | Internal-rule mapping (**WF-27 `rejected` for a master's final approval; evidence honesty**) |
| 16 | [Data Classification](16_Data_Classification.md) | Classification |
| 17 | [Dependency Change Requests and Open Questions](17_Dependency_Change_Requests_And_Open_Questions.md) | `DCR-ACC-*` (**IAM-08 new; FND-02 reclassified ACC-REAL-USE**), `OQ-*`, decisions incl. **ACC-R5-HD-01 (§4.6)** |

## What changed from v0.5 (summary; full map in `05-remediation-r5.md`)

1. **Family pre-seal recovery scope (R5-F01, ACC-R5-HD-01):** `checker_rejected_seal` / `closure_initiation_withdrawn` are legal while the **abort target** is `closing` — the master, for a family — so a master family is returned even after members sealed, including for the master's own final approval (WF-27 `rejected` for client offboarding) and a master-directed child's declined seal. `closure_recovery` records the target explicitly; a target-scoped `CHECK` and a new deferred `trg_acc1_recovery_scope` replace v0.5's per-row `CHECK` and forbid partial family recovery.
2. **Independent member's pre-seal rejection or withdrawal (R5-F02, option (a)):** it grounds the master-family abort, which returns the master, the default and the master-directed children only and never touches the independent member; the member's own governed return follows.
3. **Rejection evidence and version binding (R5-F03, route 1):** `checker_rejected_seal` is **hard-unavailable** (`ACC1_DEPENDENCY_NOT_SATISFIED`, new `DEP-IAM-SEAL-REJECTION-EVIDENCE`) until a new IAM-02 immutable approval-outcome seam exists (**DCR-ACC-IAM-08**); a local `requested` status is never rejection evidence; a checker-declined closure returns through `closure_initiation_withdrawn` today. Every abort now binds and re-checks the target's version (for a family, every returned member's version, cycle, seal version and role) — `ACC1_CLOSURE_APPROVAL_STALE`.
4. **Attester identity (R5-F04):** each pin binds `attester_module` + the channel-authenticated service identity + descriptor contract id/version, recorded identically on readiness and every counting attestation; DCR-ACC-FND-02 is reclassified **ACC-REAL-USE**, so no runtime `DEP-*` can be satisfied for real without an authenticated peer (`PEER_NOT_AUTHENTICATED`); the database refuses an empty pinned set or one differing from the checker-approved list, and completion refuses an empty set.
5. **`family_completion_unattainable` (R5-F05, option (ii)):** "persistently"/"exhausted" is withdrawn — one latest bound `blocked`/`unavailable` pinned row is the machine ground; the misuse control is maker-checker, current evidence, version/family binding and the Critical audit; its relation to `postseal_attestation_*` is stated.
6. **Precision (R5-F06):** step-10 wording qualified in file 07 §2 (and file 04 §2.4); file 02 §0's re-read note corrected; `closure_initiation_withdrawn`'s trivially-met evidence stated plainly; the `task.json` timestamp observation is recorded prospectively in `05-remediation-r5.md`, not in history.

*v0.6 — REMEDIATED / AWAITING RE-REVIEW. Planning only. Nothing is accepted; implementation is not authorised.*
