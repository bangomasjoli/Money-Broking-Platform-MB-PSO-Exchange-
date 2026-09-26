---
document_id: ACC-01-BP-v0.3
title: ACC-01 Blueprint Pack — Account Structure (Master Account & Subaccount)
version: v0.3
document_status: DRAFT
implementation_status: NOT_STARTED
module: ACC-01
control: Master account and subaccount identity, lifecycle, legal-entity ownership
owner: Unassigned
effective_date: 2026-09-26
last_reviewed: 2026-09-26
supersedes: none (v0.1 and v0.2 are reviewed historical packs and are preserved unchanged)
baseline_commit: 5a4f872
---

# ACC-01 Blueprint Pack v0.3 — Account Structure

**Status: REMEDIATED / AWAITING RE-REVIEW.** Planning only. Nothing is accepted. This pack designs; it authorises **no application code and no migration**, and **implementation is not authorised**. It remediates the findings of the separate-context review of v0.2 ([`04-review-r2.md`](../../../../03_implementation/tasks/ACC-01/04-review-r2.md), verdict REMEDIATE) and records the eight round-2 human decisions ACC-R2-HD-01…08. It has **not** been re-reviewed; a further **separate-context re-review** is required. Finding-by-finding evidence: [`05-remediation-r2.md`](../../../../03_implementation/tasks/ACC-01/05-remediation-r2.md).

v0.1 ([`../v0.1/`](../v0.1/)) and v0.2 ([`../v0.2/`](../v0.2/)) are reviewed historical evidence and are **not modified**.

| Version | Status |
|---|---|
| v0.1 | REVIEWED / REMEDIATE |
| v0.2 | REVIEWED / REMEDIATE |
| **v0.3** | **REMEDIATED / AWAITING RE-REVIEW** |

## Human decisions binding on this version (approved by Aiman)

**Earlier decisions — unchanged** (file 17 §4.1): ACC-HD-1 (default subaccount structural only), ACC-HD-2 (no local roles; no real-actor apply until `IAM2-FIND-002`), ACC-HD-3 (subaccount limit is configuration), RF-02 (no void/bypass; creation needs a completable closure), Closure safety (barrier → post-barrier attestation → close), Retention (no hard deletion).

**Round-2 decisions — new** (file 17 §4.3):

| ID | Decision | Where applied |
|---|---|---|
| ACC-R2-HD-01 | Closure draining: `closing` permits **only** an explicit closure-drain allow-list; everything else denied; not a generally active state | 01 §7.1, §10; 06 §2.0 |
| ACC-R2-HD-02 | Final checker approval **immediately before the seal**; post-seal steps machine-verified; no second checker | 01 §7; 02 §7 |
| ACC-R2-HD-03 | Governed abort/unseal from `closing` or `closure_sealed`; maker-checker; audited Critical; barrier cleared only there | 01 §7.3; 02 §7.7; 05 |
| ACC-R2-HD-04 | Master + default subaccount enter `closing` atomically; every child (default included) closes before the master seals | 01 §7, §8; 02 §7.1; 05 §5; 06 |
| ACC-R2-HD-05 | `closure_barrier` is an independent fact; consumers evaluate it first | 01 §10; 04 §3.1; 06 §2 |
| ACC-R2-HD-06 | CFG-01 owns environment availability; ACC-01 enforces only environment-agnostic `DEP-*` prerequisites; test doubles are dependency injection | 01 §4.5; 14 §2 |
| ACC-R2-HD-07 | No claim that current IAM-02 binds the apply actor; explicit IAM-02 dependency; real governed apply gated | 02 §0, §1; 07 §4 |
| ACC-R2-HD-08 | Least-privilege peer credentials in **every** environment; no general CLT-01/IAM-02 token, no temporary exception | 01 §2, §4.5; 04 §1 |

**Resolved open questions:** OQ-07 (by HD-03), OQ-11 (by HD-06), OQ-12 (by HD-02). **Still pending:** HD-4, HD-6, HD-7, HD-8, HD-9 (recommendations, not approved), OQ-13 (initiation approval; non-blocking) and the OQ defaults (file 17 §3, §4.2). HD-5 is superseded in substance by ACC-R2-HD-02, not approved.

## Reconstruction basis

Unchanged from v0.1/v0.2 (DEC-011, DEC-013, DEC-014, CURRENT_STATE, Module Index §7/§11/§18/§19, Doc 00 §1.D/§2C/§10.2A/§21/§21A/§23, Role Matrix §3.4/§3.6/§3.7/§3.8/§5.1/§5.2A/§7/§23/§29/§30, Workflow WF-26/WF-27/§33A.3, System Rules §18/§26 incl. `OFF-RULE-001`, CLT-01 §5.19). Source re-verified for v0.3: IAM-02 `guard.ts` (step 6 step-up precedes step 7 approval precedes step 10 role lookup), `routes/internal.ts` (`execute-verify`: body `actor_id`; `approval_id` accepted but unverified), `routes/approvals.ts` (token returned to the approve caller).

## Files

| # | File | Content |
|---|---|---|
| 01 | [Module Blueprint](01_Module_Blueprint.md) | Ownership, requirements, identifiers, **dependency prerequisites (§4.5)**, lifecycle, drain allow-list, pre-seal readiness/attestation, governed abort, consumer evaluation order |
| 02 | [Workflow](02_Workflow.md) | IAM-02 reality, change request, apply, create, subaccount, restriction, lift/cancel, **completable closure**, resolve |
| 03 | [Diagrams](03_Diagrams.md) | Hierarchy, sequences, evaluation order, closure sequence |
| 04 | [API Specification](04_API_Specification.md) | Staff, internal, deferred client routes; `resolve` with `closure_barrier` |
| 05 | [Database Design](05_Database_Design.md) | `acc1` schema: barrier/cycle/seal-version columns, readiness/attestation/recovery tables, triggers |
| 06 | [State Machine](06_State_Machine.md) | Statuses, transitions incl. abort, consumer evaluation order, restriction lifecycle |
| 07 | [Permission Rules](07_Permission_Rules.md) | Catalogue; IAM-02 reality; actor-binding target contract |
| 08 | [Audit Log Events](08_Audit_Log_Events.md) | `acc1.*` events |
| 09 | [Error Handling](09_Error_Handling.md) | `ACC1_*` codes |
| 10 | [Test Cases](10_Test_Cases.md) | Test plan (T-153…T-198 added) |
| 11 | [Claude Prompt](11_Claude_Prompt.md) | **Future** phased brief — not authorised |
| 12 | [Risk and Control Map](12_Risk_And_Control_Map.md) | Risks and controls |
| 13 | [Reconciliation Design](13_Reconciliation_Design.md) | Structural reconciliation R-1…R-9 |
| 14 | [Go-Live Checklist](14_Go_Live_Checklist.md) | Dependency prerequisites, configuration, runbooks |
| 15 | [Regulatory Mapping](15_Regulatory_Mapping.md) | Internal-rule mapping |
| 16 | [Data Classification](16_Data_Classification.md) | Classification |
| 17 | [Dependency Change Requests and Open Questions](17_Dependency_Change_Requests_And_Open_Questions.md) | `DCR-ACC-*`, `OQ-*`, decisions incl. ACC-R2-HD-01…08 |

## What changed from v0.2 (summary; full map in `05-remediation-r2.md`)

1. **Closure (R2-F01):** closure is now completable — closure-drain allow-list, pre-seal readiness, final checker approval before the seal, version/watermark attestation with latest-attestation-only semantics, governed abort.
2. **Master/default (R2-F02):** master and default enter `closing` atomically; every child closes first; subaccount creation locks the master.
3. **Barrier (R2-F03):** `closure_barrier` is an independent stored fact and the first consumer check.
4. **Apply binding (R2-F04):** false claims withdrawn; IAM-02 actor-binding contract recorded as `DEP-IAM-ACTOR-BINDING` (DCR-ACC-IAM-06); step-up ordering corrected.
5. **Credentials (R2-F05):** every CLT-01 read uses the read-scoped credential; least privilege in every environment.
6. **Tests (R2-F06):** T-048/T-066 and other residual entitlement assumptions corrected.
7. **Restrictions (R2-F07):** `cancel_scheduled_restriction`; lift by effective time.
8. **Environment control (R2-F08):** G1–G6 withdrawn; environment-agnostic `DEP-*` prerequisites; CFG-01 owns availability.
9. **Editorial (R2-F09):** cross-references and duplicates fixed.
