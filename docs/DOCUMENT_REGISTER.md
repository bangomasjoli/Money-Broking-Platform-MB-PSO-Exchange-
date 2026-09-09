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
| ARC-00 | Licence Scope & Feature Lock | Platform-wide | Licence scope / feature-lock governance | v1.3 | APPROVED | N/A (governance doc) | `01_masters/00_Licence_Scope_And_Feature_Lock_v1.3.md` | Unassigned | N/A | See `01_masters/reviews/00_Licence_Scope_And_Feature_Lock_v1.2_Review.md` + `00-01_v1.2_to_v1.3_Delta_Note.md` | v1.0, v1.1, v1.2 (archived) | c1765f5 |
| ARC-01 | Project Charter | Platform-wide | Project charter / scope | v1.3 | APPROVED | N/A (governance doc) | `01_masters/01_Project_Charter_v1.3.md` | Unassigned | N/A | See `01_masters/reviews/01_Project_Charter_v1.2_Review.md` + `00-01_v1.2_to_v1.3_Delta_Note.md` | v1.1, v1.2 (archived) | c1765f5 |
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
| `00_project_state/` | Session-handover docs: `PROJECT_HANDOVER.md`, `MODULE_STATUS.md`, `SESSION_START_PROMPT.md`, `CLAUDE_CODE_USAGE_RULES.md` |
| `01_masters/` | Current authoritative master documents (00–11) + `reviews/` |
| `02_modules/<MODULE>/` | `blueprint/v1.x/`, `reviews/`, `acceptance/`, `notes/` per module |
| `02_modules/_cross_module/` | Documents that genuinely span more than one module |
| `03_implementation/` | Master implementation handover pack(s) |
| `90_archive/masters/` | Superseded master document versions |
| `90_archive/modules/<MODULE>/v1.0/` | Superseded v1.0 blueprint packs |

---

## Regulatory guardrails enforced across all reviews

Money Broking + PSO approved; **Exchange pending — all exchange/order-book/matching/
market-making/principal-dealing LOCKED**. Agency back-to-back execution; disclosed
brokerage fee only; AIX inventory = zero. Third-party custody; client-money
safeguarding (full-backing). Institutional/HNWI only; retail off by default.
