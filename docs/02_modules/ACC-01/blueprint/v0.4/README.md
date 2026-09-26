---
document_id: ACC-01-BP-v0.4
title: ACC-01 Blueprint Pack — Account Structure (Master Account & Subaccount)
version: v0.4
document_status: DRAFT
implementation_status: NOT_STARTED
module: ACC-01
control: Master account and subaccount identity, lifecycle, legal-entity ownership
owner: Unassigned
effective_date: 2026-09-27
last_reviewed: 2026-09-27
supersedes: none (v0.1, v0.2 and v0.3 are reviewed historical packs and are preserved unchanged)
baseline_commit: 5a4f872
---

# ACC-01 Blueprint Pack v0.4 — Account Structure

**Status: REMEDIATED (round 3, under a human-decision escalation) / AWAITING RE-REVIEW.** Planning only. Nothing is accepted. This pack designs; it authorises **no application code and no migration**, and **implementation is not authorised**. It remediates the findings of the separate-context review of v0.3 ([`04-review-r3.md`](../../../../03_implementation/tasks/ACC-01/04-review-r3.md), verdict REMEDIATE) under the three round-3 human decisions ACC-R3-HD-01…03. It has **not** been re-reviewed; a further **separate-context re-review** is required. Finding-by-finding evidence: [`05-remediation-r3.md`](../../../../03_implementation/tasks/ACC-01/05-remediation-r3.md).

**How v0.4 came to exist.** Planning rounds were exhausted (3 of `maxPlanningRounds` 3), so the conductor's legal path was used, not a silent fourth round: `PLANNING → HUMAN_DECISION_REQUIRED` (checkpoint [`06-human-decision-r3.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r3.md)), then a `resolve_human_decision` re-entry to `PLANNING` for this remediation. The task is **not** `PLAN_READY`.

v0.1 ([`../v0.1/`](../v0.1/)), v0.2 ([`../v0.2/`](../v0.2/)) and v0.3 ([`../v0.3/`](../v0.3/)) are reviewed historical evidence and are **not modified**.

| Version | Status |
|---|---|
| v0.1 | REVIEWED / REMEDIATE |
| v0.2 | REVIEWED / REMEDIATE |
| v0.3 | REVIEWED / REMEDIATE |
| **v0.4** | **REMEDIATED / AWAITING RE-REVIEW** |

## Human decisions binding on this version (approved by Aiman)

**Earlier decisions — unchanged** (file 17 §4.1): ACC-HD-1 (default subaccount structural only), ACC-HD-2 (no local roles; no real-actor apply until `IAM2-FIND-002`), ACC-HD-3 (subaccount limit is configuration), RF-02 (no void/bypass; creation needs a completable closure), Closure safety (barrier → post-barrier attestation → close), Retention (no hard deletion).

**Round-2 decisions** (file 17 §4.3): ACC-R2-HD-01 (drain allow-list), -02 (final checker approval immediately before the seal), -03 (governed abort), **-04 (master + default enter `closing` atomically — the part requiring every child to be `closed` before the master seals is AMENDED by ACC-R3-HD-01)**, -05 (independent barrier), -06 (CFG-01 owns environment availability), -07 (no claim IAM-02 binds the apply actor), -08 (least-privilege peer credentials).

**Round-3 decisions — new** (file 17 §4.4; recorded as given in [`06-human-decision-r3.md`](../../../../03_implementation/tasks/ACC-01/06-human-decision-r3.md)):

| ID | Decision | Where applied |
|---|---|---|
| ACC-R3-HD-01 | **Master-family closure.** Invariant: every non-`closed` master has exactly one non-`closed` default. Master-directed children (default included) stop at `closure_sealed`; the master seals when all are sealed and attested; **one atomic transaction** closes every master-directed child, the default and the master; master abort reverses the whole family; independent child closures are identified, preserved and never silently reversed; the default is never independently closed | 01 §4.2 (ACC-REQ-046/050/051), §7.4, §8; 02 §7; 03 §5a; 05 §2.10, §5; 06 §1; 10 §18.1 |
| ACC-R3-HD-02 | **Closure initiation is maker-only + entitlement-checked + audited (not maker-checker)**; the one final human approval is the checker's, immediately before the seal. No approval-gated code for initiation; real initiation externally gated until IAM-02 / Role Matrix expose the seam. **OQ-13 resolved** | 01 (ACC-REQ-054); 02 §7.1; 04 §2.4; 07 §2, §4.2; 10 §18.6; DCR-ACC-IAM-07 |
| ACC-R3-HD-03 | **Dependency evidence.** A configuration string or self-declared version never satisfies a safety dependency; only behaviour verified from the owning service, or an authoritative governance source outside ACC-01's configuration. Governance-only dependencies stay **hard-unsatisfied in ACC-01** until a governance checkpoint closes them. CFG-01 remains the sole owner of `ENVIRONMENT_AVAILABILITY` | 01 §4.5 (ACC-REQ-053); 05 §8; 07 §4.1; 14 §2; 10 §18.3–18.4; DCR-ACC-IAM-05/-06, -GOV-05, -FND-01 |

**Resolved open questions:** OQ-07 (by ACC-R2-HD-03), OQ-11 (by ACC-R2-HD-06), OQ-12 (by ACC-R2-HD-02), **OQ-13 (by ACC-R3-HD-02)**. **Still pending:** HD-4, HD-6, HD-7, HD-8, HD-9 (recommendations, not approved) and the OQ defaults (file 17 §3, §4.2). HD-5 is superseded in substance by ACC-R2-HD-02, not approved. HD-4 interacts with maker-only initiation (file 07 §4 item 5) and is **not** decided by it.

## Reconstruction basis

Unchanged from v0.1–v0.3 (DEC-011, DEC-013, DEC-014, CURRENT_STATE, Module Index §7/§11/§18/§19, Doc 00 §1.D/§2C/§10.2A/§21/§21A/§23, Role Matrix §3.4/§3.6/§3.7/§3.8/§5.1/§5.2A/§7/§23/§29/§30, Workflow WF-26/WF-27/§33A.3, System Rules §18/§26 incl. `OFF-RULE-001`, CLT-01 §5.19). Source facts about IAM-02 and CLT-01 were verified for v0.3 and by the round-3 review; **v0.4 re-read no peer source** — its changes concern *target* contracts and ACC-01's own design. The conductor semantics used for the escalation (`aix-conductor` `00a7bde`) are recorded in `06-human-decision-r3.md`.

## Files

| # | File | Content |
|---|---|---|
| 01 | [Module Blueprint](01_Module_Blueprint.md) | Ownership, requirements (ACC-REQ-050…054 new), **dependency evidence classification (§4.5)**, lifecycle, drain allow-list, pinned readiness and attestation, governed abort, **master-family closure (§7.4)**, consumer evaluation order |
| 02 | [Workflow](02_Workflow.md) | IAM-02 reality and actor provenance, change request, apply, create, subaccount, restriction (database clock), lift/cancel, **maker-only initiation, pinned seal, family completion and abort**, resolve |
| 03 | [Diagrams](03_Diagrams.md) | Hierarchy, sequences, evaluation order, closure sequence, **family closure sequence** |
| 04 | [API Specification](04_API_Specification.md) | Staff, internal, deferred client routes; **initiate/preview routes**; `resolve` with `closure_barrier` and `closure_initiation_id` |
| 05 | [Database Design](05_Database_Design.md) | `acc1` schema: family, seal-pin and readiness/attestation binding tables; the structural-invariant and readiness-insert triggers |
| 06 | [State Machine](06_State_Machine.md) | Statuses, transitions incl. family completion and abort, consumer evaluation order, restriction lifecycle |
| 07 | [Permission Rules](07_Permission_Rules.md) | Catalogue (`close_initiate` non-approval); IAM-02 reality; actor-provenance and maker-initiation target contracts |
| 08 | [Audit Log Events](08_Audit_Log_Events.md) | `acc1.*` events |
| 09 | [Error Handling](09_Error_Handling.md) | `ACC1_*` codes |
| 10 | [Test Cases](10_Test_Cases.md) | Test plan (T-199…T-248 added) |
| 11 | [Claude Prompt](11_Claude_Prompt.md) | **Future** phased brief — not authorised |
| 12 | [Risk and Control Map](12_Risk_And_Control_Map.md) | Risks and controls (rows 40–47 added) |
| 13 | [Reconciliation Design](13_Reconciliation_Design.md) | Structural reconciliation R-1…R-10 |
| 14 | [Go-Live Checklist](14_Go_Live_Checklist.md) | Dependency evidence table, configuration, runbooks |
| 15 | [Regulatory Mapping](15_Regulatory_Mapping.md) | Internal-rule mapping |
| 16 | [Data Classification](16_Data_Classification.md) | Classification |
| 17 | [Dependency Change Requests and Open Questions](17_Dependency_Change_Requests_And_Open_Questions.md) | `DCR-ACC-*` (IAM-07 new), `OQ-*`, decisions incl. ACC-R3-HD-01…03 |

## What changed from v0.3 (summary; full map in `05-remediation-r3.md`)

1. **Master-family closure (R3-F01, ACC-R3-HD-01):** master-directed children — the default included — stop at `closure_sealed`; the whole family closes in one atomic transaction; a master abort reverses the family; independent child closures are identified (`closure_family_member`), preserved and never adopted or reversed; a deferred constraint trigger makes "non-`closed` master without exactly one non-`closed` default" unrepresentable.
2. **Pinned readiness (R3-F02):** the checker approves specific readiness evidence; the seal persists an immutable seal pin; readiness inserts are refused after the seal; completion and attestation compare against the pin, never "the latest readiness"; the seal re-checks the approved target `version`; watermarks must be commit-ordered; attestations also assert the drained state.
3. **Dependency evidence (R3-F03, ACC-R3-HD-03):** every `DEP-*` is classified runtime (verified per operation from the owning service) or governance-only (hard-unsatisfied in code); configuration declarations are removed; the boot-time "general token detection" overclaim is withdrawn.
4. **Actor provenance (R3-F04):** IAM-02 must verify the actor independently of ACC-01 (IAM-01 session/recent-auth/assertion); an ACC-01-minted assertion never satisfies the dependency.
5. **Abort independent of LED-01 (R3-F05):** abort needs the governed-apply set only; family evidence scope defined; independent closures preserved; the evidence-test limitation stated plainly.
6. **OQ-13 resolved (R3-F06, ACC-R3-HD-02):** maker-only, entitlement-checked, audited initiation; new DCR-ACC-IAM-07.
7. **Precision (R3-F07):** master readiness wording; database-clock time source with a commit-time backstop for restriction cancel; CDA-1 discriminator (`closure_initiation_id`).
