---
document_id: AST-01-IDX
title: AST-01 — Asset & Instrument Registry + Regulatory Classification
version: N/A
document_status: DRAFT
implementation_status: NOT_STARTED
module: AST-01
control: Asset and instrument identity, regulatory classification gate, derived product eligibility
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: 2026-09-26
supersedes: none
baseline_commit: 43f2f34
---

# AST-01 — Asset & Instrument Registry + Regulatory Classification

**Module ID:** AST-01
**Module name:** Asset & Instrument Registry + Regulatory Classification (Master Module Index v1.4 §9, status `NEW`)
**Available blueprint versions:** v1.0 (planning draft)
**Authoritative blueprint version:** none — v1.0 is **PLANNED / AWAITING REVIEW** and is not promoted. [DOCUMENT_REGISTER.md](../../DOCUMENT_REGISTER.md) decides authority; this README does not.
**Implementation status:** NOT_STARTED. No code, migration or schema exists. This branch (`module/AST-01`) contains documentation only.

## Status

**PLANNED / AWAITING REVIEW.** Blueprint and planning task only. Nothing here is accepted, implemented, or approved for production. The register and `CURRENT_STATE.md` have **not** been updated by this branch (outside the AST-01 ownership boundary); the conductor performs that record checkpoint after review.

## Blueprint

- [blueprint/v1.0/README.md](blueprint/v1.0/README.md) — pack index, reading order, the one-page summary of the design
- Planning task: [03_implementation/tasks/AST-01/](../../03_implementation/tasks/AST-01/) (`01-plan.md`, `task.json`)

## The one rule this module exists to enforce

An instrument classified `SECURITY / SECURITY TOKEN` is **never** eligible for AIX Spot or AIX OTC, in DEVELOPMENT, TEST, UAT, DEMO or PRODUCTION (Doc 00 §12A, `ASSET-RULE-002` rule 1). Unresolved classification is the default and **fails closed**. Product eligibility is **derived** from classification and is never stored as a settable flag.

## Reviews

- none yet

## Acceptance evidence

- none recorded

## Open findings

None raised against AST-01 yet. Blueprint-stage risks and human decisions are in [blueprint/v1.0/17_Dependencies_And_Open_Decisions.md](blueprint/v1.0/17_Dependencies_And_Open_Decisions.md); a human promotes any of them to [OPEN_FINDINGS.md](../../OPEN_FINDINGS.md).
