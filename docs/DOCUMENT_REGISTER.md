---
document_id: GOV-001
title: AIX Full Compliance — Document Register
version: 1.0
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Controlled-document version and status authority
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: INDEX.md
baseline_commit: 780e116
---

# AIX Full Compliance — Document Register

This document is the **sole authority** for controlled-document version, document status,
implementation module mapping, control/subject, current authoritative path, superseded
version, review/certification state, and baseline commit.

It does **not** own implementation status detail — see
[00_project_state/MODULE_STATUS.md](00_project_state/MODULE_STATUS.md) for that.
It does not own open findings — see [OPEN_FINDINGS.md](OPEN_FINDINGS.md).
It does not own governance decisions — see [DECISION_LOG.md](DECISION_LOG.md).

**Authority rule:** a document version becomes authoritative only when repository
evidence (a `*_Review.md` or `*_Delta_Note.md`) proves review/certification. Version
number, modification date, or presence on disk do **not** by themselves confer
authority.

**Baseline Commit** below records the commit at which this register entry's path and
status were last confirmed accurate — not necessarily the commit that created the file.
As of this revision that is `c1765f5b26a91827dd897c0da762427846d4f7c0`.

**Effective Date / Last Reviewed** are not formally tracked prior to this register and
are marked `N/A` rather than inferred from filesystem metadata. Formal date tracking
begins with the Turn C2 metadata rollout. **Owner** is `Unassigned` throughout — no
per-document ownership registry has existed until now.

---

## 1. Master SDLC Foundation Pack (docs 00–11)

Current authoritative versions live in `01_masters/`; superseded versions live in
`90_archive/masters/`; review/delta evidence lives in `01_masters/reviews/`.

| Doc ID | Title | Module | Control / Subject | Version | Document Status | Implementation Status | Authoritative Path | Owner | Effective Date | Last Reviewed | Supersedes | Baseline Commit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ARC-00 | Licence Scope & Feature Lock | Platform-wide | Licence scope / feature-lock governance — AIX Institutional Digital Asset & Tokenized Securities Platform: four product pillars (Spot / OTC / Pay / RWA), product-architecture vs regulatory-permission separation, Model A/B/C execution architecture with internal client-to-client matching as a standing prohibition, provider-neutral counterparty model, platform-wide Asset & Instrument classification gate, capability matrix, fail-closed feature-lock model, 1 Jan 2027 temporal rule, 20 preserved regulatory questions | v1.4 | APPROVED | N/A (governance doc) | `01_masters/00_Licence_Scope_And_Feature_Lock_v1.4.md` | Unassigned | N/A | [`01_masters/reviews/00_Licence_Scope_And_Feature_Lock_v1.4_Review.md`](01_masters/reviews/00_Licence_Scope_And_Feature_Lock_v1.4_Review.md) (independent adversarial review, ACCEPT, 5 findings corrected) | v1.0, v1.1, v1.2, v1.3 (archived) | 1ad3cf3 |
| ARC-01 | Project Charter | Platform-wide | Project charter / scope — **AIX Institutional Digital Asset & RWA Platform**: four products (Spot / OTC / Pay / RWA) over one shared institutional core, target institutional architecture (§12A), programme delivery model with the repository as authoritative control plane (§15.0). Re-baselined on approved Doc 00 v1.4; all accepted governance controls preserved | v1.4 | APPROVED | N/A (governance doc) | `01_masters/01_Project_Charter_v1.4.md` | Unassigned | N/A | Internally reviewed against approved Doc 00 v1.4 (3 stale base-document references and 2 approval-unlock contradictions found and corrected) | v1.1, v1.2, v1.3 (archived) | 1fa3168 |
| ARC-02 | Software Requirement Specification | Platform-wide | Platform-wide SRS | v1.2 | APPROVED | N/A (governance doc) | `01_masters/02_Software_Requirement_Specification_v1.2.md` | Unassigned | N/A | See `01_masters/reviews/02_Software_Requirement_Specification_v1.1_Review.md` (v1.2 = clean rollup) | v1.0, v1.1 (archived) | c1765f5 |
| ARC-03 | Master Module Index | Platform-wide | Module index / build order | v1.2 | APPROVED | N/A (governance doc) | `01_masters/03_Master_Module_Index_v1.2.md` | Unassigned | N/A | See `01_masters/reviews/03_Master_Module_Index_v1.1_Review.md` (v1.2 = clean rollup) | v1.0, v1.1 (archived) | c1765f5 |
| ARC-04 | Role & Permission Matrix | Platform-wide | RBAC / role governance | v1.2 | APPROVED | N/A (governance doc) | `01_masters/04_Role_And_Permission_Matrix_v1.2.md` | Unassigned | N/A | See `01_masters/reviews/04_Role_And_Permission_Matrix_v1.1_Review.md` (v1.2 = clean rollup) | v1.0, v1.1 (archived) | c1765f5 |
| ARC-05 | Master Workflow Map | Platform-wide | Cross-module workflow map | v1.2 | APPROVED | N/A (governance doc) | `01_masters/05_Master_Workflow_Map_v1.2.md` | Unassigned | N/A | See `01_masters/reviews/05_Master_Workflow_Map_v1.1_Review.md` (v1.2 = clean rollup) | v1.0, v1.1 (archived) | c1765f5 |
| ARC-06 | Master System Rules | Platform-wide | Platform business rules | v1.2 | APPROVED | N/A (governance doc) | `01_masters/06_Master_System_Rules_v1.2.md` | Unassigned | N/A | See `01_masters/reviews/06_Master_System_Rules_v1.1_Review.md` (v1.2 = clean rollup, AML-RULE-001A→006 rename confirmed) | v1.0, v1.1 (archived) | c1765f5 |
| ARC-07 | Master Data Flow | Platform-wide | Cross-module data flow | v1.2 | APPROVED | N/A (governance doc) | `01_masters/07_Master_Data_Flow_v1.2.md` | Unassigned | N/A | See `01_masters/reviews/07_Master_Data_Flow_v1.1_Review.md` (v1.2 = clean rollup) | v1.0, v1.1 (archived) | c1765f5 |
| ARC-08 | Master Technical Architecture | Platform-wide | Technical architecture | v1.2 | APPROVED | N/A (governance doc) | `01_masters/08_Master_Technical_Architecture_v1.2.md` | Unassigned | N/A | See `01_masters/reviews/08_Master_Technical_Architecture_v1.1_Review.md` (v1.2 = clean rollup) | v1.0, v1.1 (archived) | c1765f5 |
| ARC-09 | Master Security Architecture | Platform-wide | Security architecture | v1.2 | APPROVED | N/A (governance doc) | `01_masters/09_Master_Security_Architecture_v1.2.md` | Unassigned | N/A | See `01_masters/reviews/09_Master_Security_Architecture_v1.1_Review.md` (v1.2 = clean rollup) | v1.0, v1.1 (archived) | c1765f5 |
| ARC-10 | Master Testing Strategy | Platform-wide | Testing strategy | v1.2 | APPROVED | N/A (governance doc) | `01_masters/10_Master_Testing_Strategy_v1.2.md` | Unassigned | N/A | See `01_masters/reviews/10_Master_Testing_Strategy_v1.1_Review.md` (v1.2 = clean rollup) | v1.0, v1.1 (archived) | c1765f5 |
| ARC-11 | Master Deployment Strategy | Platform-wide | Deployment strategy | v1.2 | APPROVED | N/A (governance doc) | `01_masters/11_Master_Deployment_Strategy_v1.2.md` | Unassigned | N/A | See `01_masters/reviews/11_Master_Deployment_Strategy_v1.1_Review.md` + `11_..._v1.1_to_v1.2_Delta_Note.md` | v1.0, v1.1 (archived) | c1765f5 |

**ARC-00 promoted to v1.4.** `v1.4` is the authoritative Doc 00, promoted on independent
adversarial review evidence (five material findings raised and corrected before promotion).
`v1.3` is superseded and archived at `90_archive/masters/`, unmodified. CFG-01's vendored Doc 00
baseline and its sealed hash remain valid — v1.4 changed neither the licence status nor the
seeded prohibited-feature registry; only the constant's version label is stale, recorded as a
downstream code requirement in Doc 00 §25.3.

**Base-version traceability:** `00–07` chain verified end-to-end via
`01_masters/reviews/00-07_Base_Version_Delta_Review.md`. `08–11` each carry a v1.1
final-verification review plus a confirmed clean v1.2 rollup.

---

## 2. Module Blueprint Packs — Certified (delta-note evidence exists)

These 6 modules have explicit review or delta-note evidence supporting their current
authoritative version. Superseded v1.0 packs live in `90_archive/modules/<MODULE>/v1.0/`.

| Doc ID | Title | Module | Control / Subject | Version | Document Status | Implementation Status | Authoritative Path | Owner | Effective Date | Last Reviewed | Supersedes | Baseline Commit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BP-FND-01 | Platform Foundation Blueprint Pack | FND-01 | Platform foundation (scheduler/RLS/audit-outbox/correlation) | v1.2 | APPROVED | ACCEPTED | `02_modules/FND-01/blueprint/v1.2/` | Unassigned | N/A | `02_modules/FND-01/reviews/FND-01_..._v1.1_Review.md` + [`FND-01_IAM-01_v1.1_to_v1.2_Delta_Note.md`](02_modules/_cross_module/reviews/FND-01_IAM-01_v1.1_to_v1.2_Delta_Note.md) | v1.0 (archived), v1.1 (superseded, retained) | c1765f5 |
| BP-IAM-01 | Authentication / MFA / Session Blueprint Pack | IAM-01 | Auth, MFA, session, step-up | v1.2 | APPROVED | ACCEPTED | `02_modules/IAM-01/blueprint/v1.2/` | Unassigned | N/A | `02_modules/IAM-01/reviews/IAM-01_..._v1.1_Review.md` + [`FND-01_IAM-01_v1.1_to_v1.2_Delta_Note.md`](02_modules/_cross_module/reviews/FND-01_IAM-01_v1.1_to_v1.2_Delta_Note.md) | v1.0 (archived), v1.1 (superseded, retained) | c1765f5 |
| BP-IAM-02 | RBAC / Permission Guard / SoD Blueprint Pack | IAM-02 | RBAC, permission guard, segregation of duties | v1.2 | APPROVED | ACCEPTED | `02_modules/IAM-02/blueprint/v1.2/` | Unassigned | N/A | `02_modules/IAM-02/reviews/IAM-02_..._v1.1_Review.md` + `IAM-02_v1.1_to_v1.2_Delta_Note.md` | v1.0 (archived), v1.1 (superseded, retained) | c1765f5 |
| BP-SEC-01 | Audit Log / Security Monitoring Blueprint Pack | SEC-01 | Audit log, security monitoring | v1.2 | APPROVED | ACCEPTED | `02_modules/SEC-01/blueprint/v1.2/` | Unassigned | N/A | `02_modules/SEC-01/reviews/SEC-01_..._v1.1_Review.md` + `SEC-01_v1.1_to_v1.2_Delta_Note.md` | v1.0 (archived), v1.1 (superseded, retained) | c1765f5 |
| BP-TRD-01 | Quote / Trade / LP Execution Blueprint Pack | TRD-01 | Quote, trade, LP execution | v1.2 | APPROVED | NOT_STARTED | `02_modules/TRD-01/blueprint/v1.2/` | Unassigned | N/A | `02_modules/TRD-01/reviews/TRD-01_..._v1.1_Review.md` + `TRD-01_v1.1_to_v1.2_Delta_Note.md` | v1.0 (archived), v1.1 (superseded, retained) | c1765f5 |
| BP-CFG-01 | Feature-Flag / Licence-Lock Blueprint Pack | CFG-01 | Feature flags, licence-lock source-of-truth | v1.1 | APPROVED | ACCEPTED | `02_modules/CFG-01/blueprint/v1.1/` | Unassigned | N/A | `02_modules/CFG-01/reviews/CFG-01_..._v1.1_Review.md` | v1.0 (archived). No v1.2 exists. | c1765f5 |

---

## 3. Module Blueprint Packs — REVIEW_REQUIRED (v1.2 present, no certification evidence)

For every module below, `v1.2` exists on disk but **no** `*_v1.2_Review.md` or
`*_v1.1_to_v1.2_Delta_Note.md` exists anywhere in the repository. Per the authority
rule, `v1.1` remains the certified/authoritative version and `v1.2` is registered as
**REVIEW_REQUIRED** — present, not promoted, not archived. This turn does **not**
adjudicate any of these; adjudication requires a dedicated Opus review per module.

| Doc ID | Title | Module | Control / Subject | Version | Document Status | Implementation Status | Authoritative Path | Owner | Effective Date | Last Reviewed | Supersedes | Baseline Commit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BP-CLT-01-v1.1 | Client Onboarding / Client Profile Blueprint Pack | CLT-01 | Client onboarding, client profile | v1.1 | APPROVED (authoritative) | ACCEPTED (core Phases 0-9 + KYC roster integration; Membership Authority slice separately accepted) | `02_modules/CLT-01/blueprint/v1.1/` | Unassigned | N/A | `02_modules/CLT-01/reviews/CLT-01_..._v1.1_Review.md` | v1.0 (archived) | c1765f5 |
| BP-CLT-01-v1.2 | Client Onboarding / Client Profile Blueprint Pack | CLT-01 | Client onboarding, client profile | v1.2 | REVIEW_REQUIRED | — | `02_modules/CLT-01/blueprint/v1.2/` | Unassigned | N/A | No review/delta evidence found | — | c1765f5 |
| BP-KYC-01-v1.1 | KYC / KYB Verification Blueprint Pack | KYC-01 | KYC / KYB verification | v1.1 | APPROVED (authoritative) | ACCEPTED (baseline through Phase 4B) | `02_modules/KYC-01/blueprint/v1.1/` | Unassigned | N/A | `02_modules/KYC-01/reviews/KYC-01_..._v1.1_Review.md` | v1.0 (archived) | c1765f5 |
| BP-KYC-01-v1.2 | KYC / KYB Verification Blueprint Pack | KYC-01 | KYC / KYB verification | v1.2 | REVIEW_REQUIRED | — | `02_modules/KYC-01/blueprint/v1.2/` | Unassigned | N/A | No review/delta evidence found | — | c1765f5 |
| BP-AML-01-v1.1 | Sanctions / PEP / Adverse-Media / Travel Rule Blueprint Pack | AML-01 | Sanctions, PEP, adverse media, travel rule | v1.1 | APPROVED (authoritative) | ACCEPTED (baseline through Phase 3E) | `02_modules/AML-01/blueprint/v1.1/` | Unassigned | N/A | `02_modules/AML-01/reviews/AML-01_..._v1.1_Review.md` | v1.0 (archived) | c1765f5 |
| BP-AML-01-v1.2 | Sanctions / PEP / Adverse-Media / Travel Rule Blueprint Pack | AML-01 | Sanctions, PEP, adverse media, travel rule | v1.2 | REVIEW_REQUIRED | — | `02_modules/AML-01/blueprint/v1.2/` | Unassigned | N/A | No review/delta evidence found | — | c1765f5 |
| BP-WLT-01-v1.1 | Wallet Screening / Payout-Destination Whitelist Blueprint Pack | WLT-01 | Wallet screening, payout-destination whitelist | v1.1 | APPROVED (authoritative) | IN_PROGRESS (see `MODULE_STATUS.md`; public `/wlt1/*` surface remains open) | `02_modules/WLT-01/blueprint/v1.1/` | Unassigned | N/A | `02_modules/WLT-01/reviews/WLT-01_..._v1.1_Review.md` | v1.0 (archived) | c1765f5 |
| BP-WLT-01-v1.2 | Wallet Screening / Payout-Destination Whitelist Blueprint Pack | WLT-01 | Wallet screening, payout-destination whitelist | v1.2 | **REVIEW_REQUIRED — CONFLICT** | — | `02_modules/WLT-01/blueprint/v1.2/` | Unassigned | N/A | No review/delta evidence found. `docs/00_project_state/MODULE_STATUS.md` previously described this version as "accepted... clean cosmetic rollup" without citing delta-note evidence; the original `INDEX.md` blueprint table (this register's predecessor) cited v1.1 as authoritative. **This is an unresolved conflict, not silently decided here.** Requires a dedicated Opus adjudication. | — | c1765f5 |
| BP-LED-01-v1.1 | Ledger / Settlement / Safeguarding Blueprint Pack | LED-01 | Ledger, settlement, safeguarding | v1.1 | APPROVED (authoritative) | NOT_STARTED | `02_modules/LED-01/blueprint/v1.1/` | Unassigned | N/A | `02_modules/LED-01/reviews/LED-01_..._v1.1_Review.md` | v1.0 (archived) | c1765f5 |
| BP-LED-01-v1.2 | Ledger / Settlement / Safeguarding Blueprint Pack | LED-01 | Ledger, settlement, safeguarding | v1.2 | REVIEW_REQUIRED | — | `02_modules/LED-01/blueprint/v1.2/` | Unassigned | N/A | No review/delta evidence found | — | c1765f5 |
| BP-E2E-01-v1.1 | Cross-Module End-to-End Fund-Flow Review Pack | E2E-01 | Cross-module end-to-end fund flow | v1.1 | APPROVED (authoritative) | NOT_STARTED | `02_modules/E2E-01/blueprint/v1.1/` | Unassigned | N/A | `02_modules/E2E-01/reviews/E2E-01_..._v1.1_Review.md` | v1.0 (archived) | c1765f5 |
| BP-E2E-01-v1.2 | Cross-Module End-to-End Fund-Flow Review Pack | E2E-01 | Cross-module end-to-end fund flow | v1.2 | REVIEW_REQUIRED | — | `02_modules/E2E-01/blueprint/v1.2/` | Unassigned | N/A | No review/delta evidence found | — | c1765f5 |
| BP-DEP-01-v1.1 | Deposit Execution / Inbound Receipt Blueprint Pack | DEP-01 | Deposit execution, inbound receipt | v1.1 | APPROVED (authoritative) | NOT_STARTED | `02_modules/DEP-01/blueprint/v1.1/` | Unassigned | N/A | `02_modules/DEP-01/reviews/DEP-01_..._v1.1_Review.md` | v1.0 (archived) | c1765f5 |
| BP-DEP-01-v1.2 | Deposit Execution / Inbound Receipt Blueprint Pack | DEP-01 | Deposit execution, inbound receipt | v1.2 | REVIEW_REQUIRED | — | `02_modules/DEP-01/blueprint/v1.2/` | Unassigned | N/A | No review/delta evidence found | — | c1765f5 |
| BP-WDR-01-v1.1 | Withdrawal / Payout Execution Rail Blueprint Pack | WDR-01 | Withdrawal, payout execution rail | v1.1 | APPROVED (authoritative) | NOT_STARTED (blocked on KMS, see `OPEN_FINDINGS.md`) | `02_modules/WDR-01/blueprint/v1.1/` | Unassigned | N/A | `02_modules/WDR-01/reviews/WDR-01_..._v1.1_Review.md` | v1.0 (archived) | c1765f5 |
| BP-WDR-01-v1.2 | Withdrawal / Payout Execution Rail Blueprint Pack | WDR-01 | Withdrawal, payout execution rail | v1.2 | REVIEW_REQUIRED | — | `02_modules/WDR-01/blueprint/v1.2/` | Unassigned | N/A | No review/delta evidence found | — | c1765f5 |
| BP-REC-01-v1.1 | Reconciliation / Finance Reporting Blueprint Pack | REC-01 | Reconciliation, finance reporting | v1.1 | APPROVED (authoritative) | NOT_STARTED | `02_modules/REC-01/blueprint/v1.1/` | Unassigned | N/A | `02_modules/REC-01/reviews/REC-01_..._v1.1_Review.md` | v1.0 (archived) | c1765f5 |
| BP-REC-01-v1.2 | Reconciliation / Finance Reporting Blueprint Pack | REC-01 | Reconciliation, finance reporting | v1.2 | REVIEW_REQUIRED | — | `02_modules/REC-01/blueprint/v1.2/` | Unassigned | N/A | No review/delta evidence found | — | c1765f5 |
| BP-INC-01-v1.1 | Incident / Freeze / Recovery Blueprint Pack | INC-01 | Incident, freeze, recovery | v1.1 | APPROVED (authoritative) | NOT_STARTED | `02_modules/INC-01/blueprint/v1.1/` | Unassigned | N/A | `02_modules/INC-01/reviews/INC-01_..._v1.1_Review.md` | v1.0 (archived) | c1765f5 |
| BP-INC-01-v1.2 | Incident / Freeze / Recovery Blueprint Pack | INC-01 | Incident, freeze, recovery | v1.2 | REVIEW_REQUIRED | — | `02_modules/INC-01/blueprint/v1.2/` | Unassigned | N/A | No review/delta evidence found | — | c1765f5 |
| BP-PRT-01-v1.1 | Client / Staff / Admin Portal Workflows Blueprint Pack | PRT-01 | Client/staff/admin portal workflows | v1.1 | APPROVED (authoritative) | NOT_STARTED | `02_modules/PRT-01/blueprint/v1.1/` | Unassigned | N/A | `02_modules/PRT-01/reviews/PRT-01_..._v1.1_Review.md` | v1.0 (archived) | c1765f5 |
| BP-PRT-01-v1.2 | Client / Staff / Admin Portal Workflows Blueprint Pack | PRT-01 | Client/staff/admin portal workflows | v1.2 | REVIEW_REQUIRED | — | `02_modules/PRT-01/blueprint/v1.2/` | Unassigned | N/A | No review/delta evidence found | — | c1765f5 |

---

## 4. Implementation Handover

| Doc ID | Title | Module | Control / Subject | Version | Document Status | Implementation Status | Authoritative Path | Owner | Effective Date | Last Reviewed | Supersedes | Baseline Commit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IMP-01 | AIX Master Implementation Handover | Platform-wide | Build order, dependency map, migration order, go-live roadmap | v1.0 | DRAFT | IN_PROGRESS | `03_implementation/IMP-01/README.md` | Unassigned | N/A | Draft / ready for implementation use | — | c1765f5 |
| IMP-02 | AIX Platform Deployment and Perimeter Implementation Pack | Platform-wide | Trusted edge, network isolation, deployment perimeter (`DECISION_LOG.md` DEC-010 L1/L2; closes `FND-FIND-001` once implemented and independently accepted) | v1.0 | DRAFT | IN_PROGRESS | `03_implementation/IMP-02/README.md` | Unassigned | N/A | N/A | none | 6262a81 |

---

## 4a. Module-Level Independent Acceptance Records

Post-blueprint-acceptance implementation extensions certified by an independent
review, registered individually as controlled evidence. Not an exhaustive backfill
of every historical acceptance record — see `02_modules/<MODULE>/acceptance/` for
the full evidence trail per module; this section registers records added going
forward.

| Doc ID | Title | Module | Control / Subject | Version | Document Status | Implementation Status | Authoritative Path | Owner | Effective Date | Last Reviewed | Supersedes | Baseline Commit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IAM-01-ACC-003 | IAM-01 Internal Session Introspection — Independent Final Acceptance | IAM-01 | Internal client session-introspection seam (`POST /internal/auth/session/validate`) — WLT-01 BLOCKER-1 prerequisite | N/A | APPROVED | ACCEPTED | [`02_modules/IAM-01/acceptance/IAM-01_Session_Introspection_Opus_v1.0.md`](02_modules/IAM-01/acceptance/IAM-01_Session_Introspection_Opus_v1.0.md) | Unassigned | N/A | N/A | none | 5a29559 |
| FND-01-ACC-003 | FND-01 Shared Rate-Limit Engine — Independent Acceptance + Post-Acceptance Hardening | FND-01 | Shared rate-limit engine (`POST /foundation/rate-limit/check`) — WLT-01 BLOCKER-2 prerequisite; migrations `068`/`069`/`070` | N/A | APPROVED | ACCEPTED | [`02_modules/FND-01/acceptance/FND-01_Rate_Limit_Hardening_Opus_v1.0.md`](02_modules/FND-01/acceptance/FND-01_Rate_Limit_Hardening_Opus_v1.0.md) | Unassigned | N/A | N/A | none | eb4a767 |
| WLT-01-ACC-001 | WLT-01 Public Client Surface — Independent Acceptance | WLT-01 | Client-facing public `/wlt1/*` surface (6-route contract) — downstream consumer of WLT-01 BLOCKER-1/BLOCKER-2 | N/A | APPROVED | ACCEPTED | [`02_modules/WLT-01/acceptance/WLT-01_Public_Client_Surface_Opus_Acceptance_v1.0.md`](02_modules/WLT-01/acceptance/WLT-01_Public_Client_Surface_Opus_Acceptance_v1.0.md) | Unassigned | N/A | N/A | none | 7f9fc8a |
| WLT-01-ACC-002 | WLT-01 Public Perimeter Application Gate — Independent Acceptance | WLT-01 | Public-surface enablement gate + perimeter-provenance admission (DECISION_LOG.md DEC-010, layer L3) | N/A | APPROVED | ACCEPTED | [`02_modules/WLT-01/acceptance/WLT-01_Public_Perimeter_Application_Gate_Opus_Acceptance_v1.0.md`](02_modules/WLT-01/acceptance/WLT-01_Public_Perimeter_Application_Gate_Opus_Acceptance_v1.0.md) | Unassigned | N/A | N/A | none | af52fe8 |
| IAM-02-ACC-003 | IAM-02 Approval Control Observations — Independent Adjudication | IAM-02 | Approval authorization, maker-checker asymmetry, approval policy, SoD coverage and approval evidence — adjudication of UI Phase 2L/2R observations (registers IAM2-FIND-002/003/004) | v1.0 | APPROVED | N/A | [`02_modules/IAM-02/acceptance/IAM-02_Approval_Control_Adjudication_Opus_v1.0.md`](02_modules/IAM-02/acceptance/IAM-02_Approval_Control_Adjudication_Opus_v1.0.md) | Unassigned | 2026-09-21 | 2026-09-21 | none | 49498f9 |

---

## 4b. Implementation-Level Independent Acceptance Records

The `03_implementation/` tier's own acceptance records — distinct from §4a
because packs registered in §4 (`IMP-01`, `IMP-02`, …) are explicitly not
`02_modules/` entries (see `DECISION_LOG.md` DEC-010 Turn 2 Prerequisites and
`03_implementation/IMP-02/README.md`'s "Why IMP-02, and Not an 18th Module").
Registering these under §4a's "Module-Level" heading would misclassify them.

| Doc ID | Title | Module | Control / Subject | Version | Document Status | Implementation Status | Authoritative Path | Owner | Effective Date | Last Reviewed | Supersedes | Baseline Commit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IMP-02-ACC-001 | IMP-02 UAT Trusted Edge (Turn A) — Independent Acceptance | Platform-wide | DEC-010 Layer L1 UAT HTTP reference implementation (HAProxy 3.0.27) — six-path allowlist, header strip/inject, pre-auth request-rate/connection limiting, VERSION enforcement. Turn A only; Turn B (L2 network isolation) NOT STARTED | N/A | APPROVED | ACCEPTED | [`03_implementation/IMP-02/acceptance/IMP-02_UAT_Trusted_Edge_Turn_A_Opus_Acceptance_v1.0.md`](03_implementation/IMP-02/acceptance/IMP-02_UAT_Trusted_Edge_Turn_A_Opus_Acceptance_v1.0.md) | Unassigned | N/A | N/A | none | 65fca52 |
| IMP-02-ACC-002 | IMP-02 UAT L2 Network Isolation (Turn B) — Independent Acceptance | Platform-wide | DEC-010 Layer L2 mandatory network isolation UAT proof — direct-to-WLT bypass prevention (A3, disposable Lima/netns harness), positive edge-path control, L3 regression through the isolated topology (A4). UAT proof only; production L2 deployment NOT PROVEN | N/A | APPROVED | ACCEPTED | [`03_implementation/IMP-02/acceptance/IMP-02_UAT_L2_Network_Isolation_Turn_B_Opus_Acceptance_v1.0.md`](03_implementation/IMP-02/acceptance/IMP-02_UAT_L2_Network_Isolation_Turn_B_Opus_Acceptance_v1.0.md) | Unassigned | N/A | N/A | none | 7132057 |
| IMP-02-ACC-003 | IMP-02 UAT TLS Termination (Turn C) — Independent Acceptance | Platform-wide | DEC-010 Layer L1 TLS capability — functional UAT TLS termination at the accepted trusted edge (governed HAProxy 3.0.27, USE_OPENSSL=1), ephemeral UAT certificate model, TLS 1.2-minimum protocol policy. UAT functional proof only; production certificate lifecycle/cipher policy/backend TLS/mTLS NOT ESTABLISHED | N/A | APPROVED | ACCEPTED | [`03_implementation/IMP-02/acceptance/IMP-02_UAT_TLS_Termination_Turn_C_Opus_Acceptance_v1.0.md`](03_implementation/IMP-02/acceptance/IMP-02_UAT_TLS_Termination_Turn_C_Opus_Acceptance_v1.0.md) | Unassigned | N/A | N/A | none | d568fa0 |
| IMP-02-ACC-004 | IMP-02 Measurement Harness (Turn M-A) — Independent Acceptance | Platform-wide | IMP-02 M1-M8 capacity-calibration measurement foundation — result schema, environment fingerprinting, evidence safety, run identity, M2a runtime observation, C_iam/DB-budget arithmetic helpers. Foundation only; NO capacity calibration performed; M1/M3/M4/M5/M6/M7/M8a NOT PERFORMED; production C_iam UNDETERMINED | N/A | APPROVED | ACCEPTED | [`03_implementation/IMP-02/acceptance/IMP-02_Measurement_Harness_Turn_M-A_Opus_Acceptance_v1.0.md`](03_implementation/IMP-02/acceptance/IMP-02_Measurement_Harness_Turn_M-A_Opus_Acceptance_v1.0.md) | Unassigned | N/A | N/A | none | d57b436 |

---

## 4c. UI Design Governance

A new, non-`02_modules/` governed tier for AIX UI design direction and
discipline — parallel in nature to `03_implementation/`'s master handover
packs (see `03_implementation/IMP-01`), registered here rather than under §4
because its subject is UI design governance, not backend implementation
handover. Index-only documents (`<CODE>-IDX`, e.g. `04_ui/README.md`) are
not separately registered here, matching the convention already used for
every `02_modules/<MODULE>/README.md`.

| Doc ID | Title | Module | Control / Subject | Version | Document Status | Implementation Status | Authoritative Path | Owner | Effective Date | Last Reviewed | Supersedes | Baseline Commit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| UI-01 | AIX UI Design Foundation | N/A | UI design governance — direction, visual references, measurement discipline, token policy, model-use guidance. DRAFT / CONTROLLED FOUNDATION; no frontend code, page, component, or package exists yet; no final token values approved | v0.1 | DRAFT | N/A | [`04_ui/AIX_UI_DESIGN_FOUNDATION_v0.1.md`](04_ui/AIX_UI_DESIGN_FOUNDATION_v0.1.md) | Unassigned | N/A | N/A | none | 4c30c58 |
| UI-02 | AIX UI Measurement Specification | N/A | UI design governance — dimensional/measurement specification: spacing tokens, control-height system, radius hierarchy, typography roles, content-width categories, page gutters, floating-pill-navigation geometry, visual QA tolerances, icon sizes, table/form/color direction. DRAFT / MEASUREMENT SPECIFICATION; every dimension PROVISIONAL and/or DESIGN REVIEW REQUIRED; no frontend code or package exists yet; Phantom reference image registered (see 04_ui/references/), §10 dimensions not yet re-validated against it | v0.1 | DRAFT | N/A | [`04_ui/AIX_UI_MEASUREMENT_SPEC_v0.1.md`](04_ui/AIX_UI_MEASUREMENT_SPEC_v0.1.md) | Unassigned | N/A | N/A | none | c5981ac |
| UI-03 | AIX UI Frontend Technical Foundation | N/A | UI design governance — frontend runtime/toolchain foundation: platform/apps/web/ npm-workspace integration, Next.js 16 (App Router)/React 19/Tailwind CSS v4/shadcn-radix-nova initialization, TypeScript model, design-token scaffolding. CONTROLLED IMPLEMENTATION FOUNDATION; toolchain only — no visual design, no final color palette, no final font, no backend API integration approved | v0.1 | DRAFT | IN_PROGRESS | [`04_ui/AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md`](04_ui/AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md) | Unassigned | N/A | N/A | none | 38c260c |
| UI-04 | AIX Authenticated Platform UI Architecture | PRT-01 (design track only — implementation NOT started) | UI design governance — authenticated platform information architecture: Client/Staff-Operations/Admin-Compliance portal boundaries, route/shell/navigation/density models, A/B/C page-classification register against actual backend route evidence, shadcn adoption map, domain-wrapper classification. DRAFT / CONTROLLED ARCHITECTURE; no authenticated page, route, or component exists yet; no shadcn installed for this scope | v0.1 | DRAFT | N/A | [`04_ui/AIX_AUTHENTICATED_PLATFORM_UI_ARCHITECTURE_v0.1.md`](04_ui/AIX_AUTHENTICATED_PLATFORM_UI_ARCHITECTURE_v0.1.md) | Unassigned | N/A | N/A | none | 41e76e4 |

---

## 4d. Platform Strategy

A governed tier for platform-wide product/architecture strategy analysis —
registered here rather than under §1 because these documents are **not** master
SDLC documents and carry **no** authority over scope, licence or architecture.
They analyse the current baseline and propose controlled updates to the §1
masters; the masters themselves remain the authority until separately revised.
Placing a DRAFT analysis inside `01_masters/` (whose convention is the numbered,
APPROVED `00`–`11` pack) would misrepresent its status. This follows §4c's own
precedent for creating a governed tier when a subject fits no existing one.

| Doc ID | Title | Module | Control / Subject | Version | Document Status | Implementation Status | Authoritative Path | Owner | Effective Date | Last Reviewed | Supersedes | Baseline Commit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| STR-01 | AIX Institutional Platform Strategic Re-Baseline | N/A (platform-wide) | Strategic product/architecture re-baseline — non-destructive gap analysis of the proposed four-pillar direction (AIX Spot / OTC / Pay / RWA over a shared institutional core) against the current accepted Money Broking + PSO baseline. Records current state, target state, a KEEP/EXTEND/REFACTOR/DEFER/NEW matrix, regulatory terminology conflicts, liquidity/execution, institutional account, RWA and payments gaps, module and governance-document impact, migration sequence, risks and unresolved decisions. **ANALYSIS ONLY — supersedes nothing, approves no scope, creates no finding, authorises no implementation** | v0.1 | DRAFT | N/A | [`05_strategy/AIX_Institutional_Platform_Strategic_Re-Baseline_v0.1.md`](05_strategy/AIX_Institutional_Platform_Strategic_Re-Baseline_v0.1.md) | Unassigned | N/A | N/A | none | 48b9478 |
| STR-02 | AIX Re-Baseline Governance Decision Pack | N/A (platform-wide) | Governance decision pack for the four decisions blocking the master re-baseline: `DEC-REQ-R1` (regulatory/product meaning of "Exchange", with a semantic classification of all 315 occurrences across the 12 masters), `DEC-REQ-R3` (AIX Spot order/execution model — external-venue routing vs multi-LP SOR vs internal matching), `DEC-REQ-R4` (RWA regulatory classification gate), `DEC-REQ-A2` (organisation/account/subaccount hierarchy — LED-01 decision window), plus an inspection-only assessment of `assertNoExchangeRuntime` (`DEC-REQ-A7`). Carries an **independently verified** regulatory evidence register (§0.2) citing the LFSA Digital Money Broking guidelines (Final, **effective 1 Jan 2027**), Money Broking Establishment guidelines (2024) and the Exchange business-area description, plus a proposed master re-baseline order (§7.1). Depends on `STR-01`. **DRAFT — `DEC-REQ-A2` graduated to `DECISION_LOG.md` as `DEC-011`; R3 Models A/B, the market-depth and product terminology rules and the asset-gate placement graduated as `DEC-012`. NOT approved: the scope of AIX's Exchange approval, Model C internal matching, the R4 securities route, and any specific order type, venue or asset. Creates no finding, authorises no implementation** | v0.1 | DRAFT | N/A | [`05_strategy/AIX_Re-Baseline_Governance_Decision_Pack_v0.1.md`](05_strategy/AIX_Re-Baseline_Governance_Decision_Pack_v0.1.md) | Unassigned | N/A | N/A | none | 284e2e7 |

---

## 5. Cross-Module Documents

| Doc ID | Title | Module | Control / Subject | Version | Document Status | Implementation Status | Authoritative Path | Owner | Effective Date | Last Reviewed | Supersedes | Baseline Commit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| XMOD-001 | FND-01 / IAM-01 v1.1→v1.2 Delta Note | FND-01, IAM-01 | Certification evidence for both modules' v1.2 promotion | 1 (single physical copy) | APPROVED | N/A | [`02_modules/_cross_module/reviews/FND-01_IAM-01_v1.1_to_v1.2_Delta_Note.md`](02_modules/_cross_module/reviews/FND-01_IAM-01_v1.1_to_v1.2_Delta_Note.md) | Unassigned | N/A | N/A | — | c1765f5 |

This document applies to two modules and is deliberately **not duplicated**. Both
`02_modules/FND-01/README.md` and `02_modules/IAM-01/README.md` reference it by link.

---

## 6. Where things live

| Folder | Contents |
|---|---|
| `00_project_state/` | Session-handover docs: `PROJECT_HANDOVER.md`, `MODULE_STATUS.md`, `SESSION_START_PROMPT.md`, `CLAUDE_CODE_USAGE_RULES.md`, and the compact `CURRENT_STATE.md` navigation record (does not replace this register) |
| `01_masters/` | Current authoritative master documents (00–11) + `reviews/` |
| `02_modules/<MODULE>/` | `blueprint/v1.x/`, `reviews/`, `acceptance/`, `notes/` per module |
| `02_modules/_cross_module/` | Documents that genuinely span more than one module |
| `04_ui/` | AIX UI design governance: direction, visual references, measurement discipline, token policy — see §4c |
| `03_implementation/` | Master implementation handover pack(s); `tasks/` holds canonical conductor-managed task records (see `03_implementation/tasks/README.md`) |
| `05_strategy/` | Platform-wide product/architecture strategy analysis — see §4d. Analysis only; carries no authority over the §1 masters |
| `90_archive/masters/` | Superseded master document versions |
| `90_archive/modules/<MODULE>/v1.0/` | Superseded v1.0 blueprint packs |

---

## Regulatory guardrails enforced across all reviews

Money Broking + PSO approved; **Exchange pending — all exchange/order-book/matching/
market-making/principal-dealing LOCKED**. Agency back-to-back execution; disclosed
brokerage fee only; AIX inventory = zero. Third-party custody; client-money
safeguarding (full-backing). Institutional/HNWI only; retail off by default.
