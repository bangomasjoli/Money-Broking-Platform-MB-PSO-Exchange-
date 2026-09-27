---
document_id: ACC-01-BP-v0.5
title: ACC-01 Blueprint Pack — Account Structure (Master Account & Subaccount)
version: v0.5
document_status: DRAFT
implementation_status: NOT_STARTED
module: ACC-01
control: Master account and subaccount identity, lifecycle, legal-entity ownership
owner: Unassigned
effective_date: 2026-09-28
last_reviewed: 2026-09-28
supersedes: none (v0.1, v0.2, v0.3 and v0.4 are reviewed historical packs and are preserved unchanged)
baseline_commit: 5a4f872
---

# ACC-01 Blueprint Pack v0.5 — Account Structure

**Status: REMEDIATED (round 4, under a human-decision escalation) / AWAITING RE-REVIEW.** Planning only. Nothing is accepted. This pack designs; it authorises **no application code and no migration**, and **implementation is not authorised**. It remediates the findings of the separate-context review of v0.4 ([`04-review-r4.md`](../../../../03_implementation/tasks/ACC-01/04-review-r4.md), verdict REMEDIATE) under two round-4 human decisions, ACC-R4-HD-01 and ACC-R4-HD-02, plus a technical (non-human-decision) correction of R4-F02 within ACC-R3-HD-01. It has **not** been re-reviewed; a further **separate-context re-review** is required. Finding-by-finding evidence: [`05-remediation-r4.md`](../../../../03_implementation/tasks/ACC-01/05-remediation-r4.md).

**How v0.5 came to exist.** Planning rounds were already at a prior human-authorised over-limit entry (4). `04-review-r4.md` required another human-decision cycle before any further planning turn: `PLANNING → HUMAN_DECISION_REQUIRED` (checkpoint [`06-human-decision-r4.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r4.md)), then a `resolve_human_decision` re-entry to `PLANNING` for this remediation. The task is **not** `PLAN_READY`.

v0.1 ([`../v0.1/`](../v0.1/)), v0.2 ([`../v0.2/`](../v0.2/)), v0.3 ([`../v0.3/`](../v0.3/)) and v0.4 ([`../v0.4/`](../v0.4/)) are reviewed historical evidence and are **not modified**.

| Version | Status |
|---|---|
| v0.1 | REVIEWED / REMEDIATE |
| v0.2 | REVIEWED / REMEDIATE |
| v0.3 | REVIEWED / REMEDIATE |
| v0.4 | REVIEWED / REMEDIATE |
| **v0.5** | **REMEDIATED / AWAITING RE-REVIEW** |

## Human decisions binding on this version (approved by Aiman)

**Earlier decisions — unchanged** (file 17 §4.1): ACC-HD-1 (default subaccount structural only), ACC-HD-2 (no local roles; no real-actor apply until `IAM2-FIND-002`), ACC-HD-3 (subaccount limit is configuration), RF-02 (no void/bypass; creation needs a completable closure), Closure safety (barrier → post-barrier attestation → close), Retention (no hard deletion).

**Round-2 decisions** (file 17 §4.3): ACC-R2-HD-01 (drain allow-list), -02 (final checker approval immediately before the seal), **-03 (governed abort — the practical scope is AMENDED by ACC-R4-HD-01)**, **-04 (master + default enter `closing` atomically — the part requiring every child to be `closed` before the master seals is AMENDED by ACC-R3-HD-01)**, -05 (independent barrier), -06 (CFG-01 owns environment availability), -07 (no claim IAM-02 binds the apply actor), -08 (least-privilege peer credentials).

**Round-3 decisions** (file 17 §4.4; recorded as given in [`06-human-decision-r3.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r3.md)): ACC-R3-HD-01 (master-family closure), -02 (maker-only closure initiation; OQ-13 resolved), -03 (dependency evidence rule).

**Round-4 decisions — new** (file 17 §4.5; recorded as given in [`06-human-decision-r4.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r4.md)):

| ID | Decision | Where applied |
|---|---|---|
| ACC-R4-HD-01 | **Rejected / withdrawn closure initiation.** Where a target is `closing` and has not reached `closure_sealed`, governed `abort_closure` returns it when the checker rejects the seal or the initiation is formally withdrawn — maker-checker, evidence-bound, legal only from `closing`, never once `closure_sealed`; represents WF-27 `rejected`. Amends the practical scope of ACC-R2-HD-03 | 01 §7.3, ACC-REQ-045/057; 02 §7.7; 05 §2.8; 06 §1 rule 8; 07 §4; 09; 10 §19.3; 12 row 46 |
| ACC-R4-HD-02 | **Conductor runtime registration.** ACC-01 is not registered into `aix-conductor/state/tasks/` during this task; git task records remain the durable authority. The historical "no CLI command" statement is corrected prospectively, not retroactively | `06-human-decision-r4.md` §1, §4 |

**R4-F02 (independent-child deadlock)** is corrected as a **technical design choice within ACC-R3-HD-01** (review option (b)) and needed no separate human decision.

**Resolved open questions:** OQ-07 (by ACC-R2-HD-03), OQ-11 (by ACC-R2-HD-06), OQ-12 (by ACC-R2-HD-02), OQ-13 (by ACC-R3-HD-02). **Still pending:** HD-4, HD-6, HD-7, HD-8, HD-9 (recommendations, not approved) and the OQ defaults (file 17 §3, §4.2). HD-5 is superseded in substance by ACC-R2-HD-02, not approved. HD-4 interacts with maker-only initiation (file 07 §4 item 5) and is **not** decided by it.

## Reconstruction basis

Unchanged from v0.1–v0.4 (DEC-011, DEC-013, DEC-014, CURRENT_STATE, Module Index §7/§11/§18/§19, Doc 00 §1.D/§2C/§10.2A/§21/§21A/§23, Role Matrix §3.4/§3.6/§3.7/§3.8/§5.1/§5.2A/§7/§23/§29/§30, Workflow WF-26/WF-27/§33A.3, System Rules §18/§26 incl. `OFF-RULE-001`, CLT-01 §5.19). Source facts about IAM-02 and CLT-01 were verified for v0.3 and by the round-3 and round-4 reviews; **v0.5 re-read only IAM-02's `permission/check` route** (`routes/internal.ts`, confirming `actor_id` is a body field, for the R4-F06 precision fix) — its other changes concern *target* contracts and ACC-01's own design. The conductor semantics used for the round-4 escalation (`aix-conductor` `00a7bde`, re-verified in this session) are recorded in `06-human-decision-r4.md`.

## Files

| # | File | Content |
|---|---|---|
| 01 | [Module Blueprint](01_Module_Blueprint.md) | Ownership, requirements (ACC-REQ-055…057 new), dependency evidence classification (§4.5, **peer-identity trust anchor**), lifecycle, drain allow-list, pinned readiness and attestation, governed abort (**new pre-seal and family-unattainable grounds**), **master-family closure (§7.4, liveness-corrected)**, consumer evaluation order |
| 02 | [Workflow](02_Workflow.md) | IAM-02 reality and actor provenance, change request, apply, create, subaccount, restriction (database clock), lift/cancel, maker-only initiation, pinned seal (**required-attester-set pinning**), family completion and **abort (rewritten §7.7)**, resolve |
| 03 | [Diagrams](03_Diagrams.md) | Hierarchy, sequences, evaluation order, closure sequence, family closure sequence (**re-attestation and new abort grounds**), **new: pre-seal rejection/withdrawal sequence (§5b)** |
| 04 | [API Specification](04_API_Specification.md) | Staff, internal, deferred client routes; initiate/preview routes; `resolve` with `closure_barrier` and `closure_initiation_id`; **seal/abort bodies updated for pinned attester set and new abort grounds** |
| 05 | [Database Design](05_Database_Design.md) | `acc1` schema: family, seal-pin (**now the pinned required attester set**) and readiness/attestation binding tables; **`family_set_hash` rewritten to immutable seal facts only**; **new abort `reason_code`s and `CHECK`** |
| 06 | [State Machine](06_State_Machine.md) | Statuses, transitions incl. family completion and abort (**scope corrected**), consumer evaluation order, restriction lifecycle |
| 07 | [Permission Rules](07_Permission_Rules.md) | Catalogue (`close_initiate` non-approval); IAM-02 reality (**precision on body `actor_id`**); actor-provenance and maker-initiation target contracts; **false HD-4 mitigation withdrawn and corrected** |
| 08 | [Audit Log Events](08_Audit_Log_Events.md) | `acc1.*` events (**new abort `reason_code`s noted**) |
| 09 | [Error Handling](09_Error_Handling.md) | `ACC1_*` codes (**new: `ACC1_CLOSURE_FAMILY_UNATTAINABLE`; `ACC1_CLOSURE_ABORT_INVALID` extended**) |
| 10 | [Test Cases](10_Test_Cases.md) | Test plan (**T-249…T-275 added, §19**) |
| 11 | [Claude Prompt](11_Claude_Prompt.md) | **Future** phased brief — not authorised |
| 12 | [Risk and Control Map](12_Risk_And_Control_Map.md) | Risks and controls (**rows 41, 46 corrected; rows 48–49 added**) |
| 13 | [Reconciliation Design](13_Reconciliation_Design.md) | Structural reconciliation R-1…R-10 (**R-9, R-10 corrected**) |
| 14 | [Go-Live Checklist](14_Go_Live_Checklist.md) | Dependency evidence table (**peer-identity trust anchor**), configuration, runbooks (**new grounds**) |
| 15 | [Regulatory Mapping](15_Regulatory_Mapping.md) | Internal-rule mapping (**WF-27 `rejected` mapped**) |
| 16 | [Data Classification](16_Data_Classification.md) | Classification |
| 17 | [Dependency Change Requests and Open Questions](17_Dependency_Change_Requests_And_Open_Questions.md) | `DCR-ACC-*` (**FND-02 new**), `OQ-*`, decisions incl. ACC-R4-HD-01…02 |

## What changed from v0.4 (summary; full map in `05-remediation-r4.md`)

1. **Family attester liveness (R4-F01):** the master's `family_set_hash` binds only immutable seal facts, never an attestation id, so a sealed family can never be permanently barred by ordinary re-attestation; each seal separately pins its own **required attester set**; completion always re-reads the latest attestation fresh; a genuinely, persistently blocked/unavailable pinned attester grounds a new governed-abort reason (`family_completion_unattainable`).
2. **Independent-child liveness (R4-F02, technical design choice within ACC-R3-HD-01):** an `independent_preserved` member cannot itself abort back to operational while its master is `closing` under that family (the structural trigger forbids an operational child under a `closing` master); instead its blocking evidence grounds the **master's** abort without adopting, reopening or reversing it. A false v0.4 claim that the child's own abort "succeeds even while its master is closing" is withdrawn. Membership never carries forward to a later family generation.
3. **Rejected / withdrawn closure initiation (R4-F03, ACC-R4-HD-01):** a maker-checker `abort_closure` with `reason_code ∈ {checker_rejected_seal, closure_initiation_withdrawn}` returns a `closing` (never `closure_sealed`) target, representing WF-27 `rejected`. The v0.4 claim that the existing governed abort already covered this for a drained target is withdrawn as false.
4. **Attester / configuration precision (R4-F04):** peer identity is recorded as an explicit deployment trust anchor requiring an authenticated internal channel (new DCR-ACC-FND-02), not something ACC-01's application logic verifies; the commit-ordered watermark is stated precisely as LED-01's own reviewed, declared property, never something ACC-01 proves at runtime.
5. **Conductor record correction (R4-F05, ACC-R4-HD-02):** the historical claim that the conductor has no CLI resolution command is corrected prospectively (`06-human-decision-r4.md`); `06-human-decision-r3.md` and `05-remediation-r3.md` are left unmodified. ACC-01 is not registered in the conductor's runtime store.
6. **Precision (R4-F06):** the `ACC-REQ-045` table row's stray column is fixed; "genuine entitlement check" wording is corrected to distinguish the guard's step-10 role lookup (of the asserted actor) from the attested entitlement proof; the stale `OQ-04` version label is corrected.
