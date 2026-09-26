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
baseline_commit: ccec2ff
---

# AST-01 — Asset & Instrument Registry + Regulatory Classification

**Module ID:** AST-01
**Module name:** Asset & Instrument Registry + Regulatory Classification (Master Module Index v1.4 §9, status `NEW`)
**Available blueprint versions:** v1.0, v1.1, v1.2
**Authoritative blueprint version:** none — no version is promoted. [DOCUMENT_REGISTER.md](../../DOCUMENT_REGISTER.md) decides authority; this README does not.
- **v1.0** = **REVIEWED / REMEDIATE** (independent review `04-review.md` at `45d9a2f`; kept unchanged as historical evidence).
- **v1.1** = **REVIEWED / REMEDIATE** (separate-context review `04-review-r2.md` at `ccec2ff`; kept unchanged as historical evidence).
- **v1.2** = **REMEDIATED / AWAITING RE-REVIEW** (`05-remediation-r2.md`). Nothing is accepted.
**Implementation status:** NOT_STARTED. No code, migration or schema exists. This branch (`module/AST-01`) contains documentation only.

## Status

**v1.2: REMEDIATED / AWAITING RE-REVIEW** (v1.0 and v1.1: REVIEWED / REMEDIATE). Blueprint and planning task only. Nothing here is accepted, implemented, or approved for production. **Implementation is not authorised.** The register and `CURRENT_STATE.md` have **not** been updated by this branch (outside the AST-01 ownership boundary); the conductor performs that record checkpoint after review.

## Blueprint

- [blueprint/v1.2/README.md](blueprint/v1.2/README.md) — **current** pack (round-2 remediated); what changed from v1.1
- [blueprint/v1.1/README.md](blueprint/v1.1/README.md) — reviewed historical version (unchanged)
- [blueprint/v1.0/README.md](blueprint/v1.0/README.md) — reviewed historical version (unchanged)
- Planning task: [03_implementation/tasks/AST-01/](../../03_implementation/tasks/AST-01/) (`01-plan.md`, `04-review.md`, `04-review-r2.md`, `05-remediation.md`, `05-remediation-r2.md`, `task.json`)

## The one rule this module exists to enforce

An instrument classified `SECURITY / SECURITY TOKEN` is **never** eligible for AIX Spot, AIX OTC, or any Money Broking / PSO-domain path (including MB wallet deposit/withdrawal), in DEVELOPMENT, TEST, UAT, DEMO or PRODUCTION (Doc 00 §12A, `ASSET-RULE-002` rule 1; Module Index §19 rules 5A/5B). Unresolved classification is the default and **fails closed**. Product eligibility is **derived** from classification and is never stored as a settable flag.

## Reviews

- [04-review.md](../../03_implementation/tasks/AST-01/04-review.md) — independent architecture/compliance review of v1.0: **REMEDIATE** (not context-independent; separate-context re-review recommended)
- [04-review-r2.md](../../03_implementation/tasks/AST-01/04-review-r2.md) — separate-context re-review of v1.1: **REMEDIATE** (F17–F25; context-independent, not model-family-independent)
- Re-review of v1.2: **pending**

## Acceptance evidence

- none recorded

## Open findings

Round-1 findings F01–F16 are dispositioned in `04-review-r2.md` (F03, F07, F09–F16 closed; F02, F05 external gates; F01, F04, F06, F08 superseded by F17–F21). Round-2 findings F17–F24 are remediated in v1.2 and remain open until re-review closes them; F25 is resolved by human decision `AST-R2-HD-01` (`05-remediation-r2.md`). Human decisions, DCRs and open questions are in [blueprint/v1.1/17_Dependencies_And_Open_Decisions.md](blueprint/v1.1/17_Dependencies_And_Open_Decisions.md); a human promotes any of them to [OPEN_FINDINGS.md](../../OPEN_FINDINGS.md).
