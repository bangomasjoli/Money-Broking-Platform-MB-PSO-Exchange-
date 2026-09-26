---
document_id: ACC-01-BP-v0.2
title: ACC-01 Blueprint Pack — Account Structure (Master Account & Subaccount)
version: v0.2
document_status: DRAFT
implementation_status: NOT_STARTED
module: ACC-01
control: Master account and subaccount identity, lifecycle, legal-entity ownership
owner: Unassigned
effective_date: 2026-09-26
last_reviewed: 2026-09-26
supersedes: none (v0.1 is the reviewed historical pack and is preserved unchanged)
baseline_commit: 5a4f872
---

# ACC-01 Blueprint Pack v0.2 — Account Structure

**Status: REMEDIATED / AWAITING RE-REVIEW.** Planning only. Nothing is accepted. This pack designs; it authorises **no application code and no migration**. It remediates every finding of the independent review of v0.1 ([`04-review.md`](../../../../03_implementation/tasks/ACC-01/04-review.md), verdict REMEDIATE). It has **not** been re-reviewed; the remediation was authored in the same session context family as the original, so re-review must run in a **separate context**. Finding-by-finding evidence: [`05-remediation.md`](../../../../03_implementation/tasks/ACC-01/05-remediation.md).

v0.1 ([`../v0.1/`](../v0.1/)) is the reviewed historical pack and is **not modified**.

## Human decisions binding on this version (approved by Aiman)

| ID | Decision | Where applied |
|---|---|---|
| ACC-HD-1 | One default `general` subaccount is created atomically with a master account — **structural only**; never a catch-all scope, fallback trading/payment account, product-authorisation target, or evidence a capability is available | 01 §8; 04 §3.1; 10 |
| ACC-HD-2 | ACC-01 invents **no** role assignments; the Role & Permission Matrix and IAM-02 define maker/checker authority; **no real-actor governed apply** until `IAM2-FIND-002` is fixed and those DCRs are governed; DEV/TEST build permitted | 01 §4.5; 07; 17 |
| ACC-HD-3 | Maximum subaccounts per master is **configuration**, never hard-coded; missing/invalid ⇒ fail closed; a concrete value must be set before real use; master initial policy stays 1 (DEC-011) | 01 §6 |
| RF-02 | No bypass/void because LED-01 does not yet exist. Account creation is built/tested in DEVELOPMENT/TEST only and **unavailable for real governed use** until the LED-01 readiness attester exists; ownership immutability and the empty-attester fail-closed rule are unchanged | 01 §4.5, §9; 02 §7 |
| Closure safety | Closure is **preventive**: closing barrier → block all new transactional/posting activity → **fresh post-barrier** LED-01 attestation → close only while the barrier stays effective | 01 §7; 02 §7; 06 |
| Retention | No hard deletion; ACC-01 uses the platform/client-record retention policy once formally defined and invents none | 15 §3; 16; 17 |

Not newly decided this turn: whether a *second* human approval is needed for closure completion — the reviewed maker-checker model is preserved. HD-4, HD-6, HD-7, HD-8 and HD-9 were adjudicated SUPPORTED in the review but were **not** separately approved by a human in this turn; they are carried as recommendations (file 17 §3).

## Reconstruction basis

Unchanged from v0.1 (DEC-011, DEC-013, DEC-014, CURRENT_STATE, Module Index §7/§11/§18/§19, Doc 00 §2C/§10.2A/§21/§21A/§23, Role Matrix §3.4/§3.6/§3.7/§3.8/§5.1/§5.2A/§7/§23/§29/§30, Workflow WF-26/WF-27/§33A.3, System Rules §18/§26, CLT-01 §5.19). Additionally verified in v0.2 against repository source: IAM-02 `guard.ts` (steps 1–10), `routes/approvals.ts`, `routes/internal.ts` (execute-verify), `lib/decision-token.ts`; CLT-01 `routes/decisions.ts` and `routes/clients.ts`; `@aix/foundation` `fingerprint`.

## Files

| # | File | Content |
|---|---|---|
| 01 | [Module Blueprint](01_Module_Blueprint.md) | Ownership, requirements, identifiers, lifecycles, real-use gates, integration, runtime dependency graph |
| 02 | [Workflow](02_Workflow.md) | Change request, create, subaccount, restriction, lift, **preventive closure**, resolve |
| 03 | [Diagrams](03_Diagrams.md) | Hierarchy, sequences |
| 04 | [API Specification](04_API_Specification.md) | Staff, internal, deferred client routes |
| 05 | [Database Design](05_Database_Design.md) | `acc1` schema (restriction owner binding, closure barrier columns) |
| 06 | [State Machine](06_State_Machine.md) | Statuses incl. `closure_sealed`; effective status; consumer rule |
| 07 | [Permission Rules](07_Permission_Rules.md) | Catalogue; IAM-02 reality; no local role assignments |
| 08 | [Audit Log Events](08_Audit_Log_Events.md) | `acc1.*` events |
| 09 | [Error Handling](09_Error_Handling.md) | `ACC1_*` codes |
| 10 | [Test Cases](10_Test_Cases.md) | Test plan (known-gap tests, consumer conformance, barrier) |
| 11 | [Claude Prompt](11_Claude_Prompt.md) | **Future** phased brief — not authorised |
| 12 | [Risk and Control Map](12_Risk_And_Control_Map.md) | Risks and controls |
| 13 | [Reconciliation Design](13_Reconciliation_Design.md) | Structural reconciliation |
| 14 | [Go-Live Checklist](14_Go_Live_Checklist.md) | Gates |
| 15 | [Regulatory Mapping](15_Regulatory_Mapping.md) | Internal-rule mapping |
| 16 | [Data Classification](16_Data_Classification.md) | Classification |
| 17 | [Dependency Change Requests and Open Questions](17_Dependency_Change_Requests_And_Open_Questions.md) | `DCR-ACC-*` re-classified, `OQ-*`, decisions |

## What changed from v0.1 (summary; full map in `05-remediation.md`)

1. **IAM-02 honesty (RF-01/RF-07):** current IAM-02 does **not** entitlement-check makers or checkers of approval-gated actions; the false default-deny claim is removed; real-actor governed apply is gated; apply mechanics mirror the accepted CLT-01/CFG-01 request/apply precedent (no invented seam).
2. **Closure (RF-02/RF-03):** creation gated to DEV/TEST until the LED-01 attester exists; `closing` rows still count against limits; a preventive `closure_sealed` barrier with post-barrier attestation replaces the stale-attestation model; master closure rules for child subaccounts.
3. **Consumer rule (RF-04):** any `effective_status ≠ active` denies transactional activity unless explicitly authorised by authoritative policy; `blocked_scopes` is explanatory only; `active_limited` ⇒ report-only.
4. **Credentials (RF-05):** ACC-01 never holds CLT-01's or IAM-02's general internal credential; dedicated read/verify-scoped credentials are DCRs.
5. **Schema (RF-06/RF-08):** restriction bound to the subaccount owner by composite FK; every restriction change bumps the target `version`, plus `applied_restriction_ids` evidence; scheduled restrictions are effective by time, not by job.
6. **Governance (RF-09/RF-10/RF-11):** freeze ownership DCR; DCRs re-classified into five classes; runtime dependency graph documented; readiness validates configuration/contract, not peer liveness; ACC-01's client checks are a local structural backstop, not an eligibility authority.
