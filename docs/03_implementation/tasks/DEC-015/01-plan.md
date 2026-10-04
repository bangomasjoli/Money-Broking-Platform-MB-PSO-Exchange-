# 01 Plan — DEC-015: Client Asset, Fiat Banking, Virtual Account, Custody & Settlement Architecture

- **Task ID:** DEC-015
- **Risk:** CRITICAL — reason: defines client-asset ownership, safeguarding, reservation and settlement architecture that every money module's schema will consume
- **Category:** architecture / fund-flow / governance — drafting turn (no implementation authorised)
- **Planner / author:** architecture author / claude-opus-5-5 / HIGH
- **Selected implementer:** none — architecture only; no implementation in this task
- **Baseline commit:** `43f2f34` (`main` = `origin/main` at preflight)
- **Human approval:** business decisions HB-01…HB-13 given by Aiman before the turn (STR-04 §5). **DEC-015 itself: NOT accepted** — PROPOSED / AWAITING INDEPENDENT REVIEW AND HUMAN ACCEPTANCE

## Objective
Freeze the cross-platform client-asset, fiat-banking, virtual-account, custody, reservation,
settlement, fee, safeguarding and reconciliation architecture as proposed decision DEC-015, with a
repository-wide impact matrix and ACC-01/AST-01 compatibility classifications, before any master
or module blueprint is revised.

## Approved scope (this drafting turn)
- Draft `docs/05_strategy/AIX_Client_Asset_Fiat_Banking_Virtual_Account_Custody_Settlement_Architecture_v0.1.md` (`STR-04`).
- Draft three provider-neutral requirements documents in `docs/05_strategy/` — `AIX_Bank_PSP_Settlement_Provider_Requirements_v0.1.md` (`STR-04A`), `AIX_Institutional_Custodian_Requirements_v0.1.md` (`STR-04B`), `AIX_LP_OTC_Counterparty_Requirements_v0.1.md` (`STR-04C`); status DRAFT / DEC-015 SUPPORTING DOCUMENT.
- Read-only inspection of `origin/module/ACC-01` @ `3f23c3d` and `origin/module/AST-01` @ `1978f2e`.
- This task record (`01-plan.md`, `03-evidence.md`, `task.json`).
- Control writes explicitly authorised in the continuation instruction: `docs/00_project_state/CURRENT_STATE.md` (DEC-015 PROPOSED pointer only) and `docs/DOCUMENT_REGISTER.md` (§4d rows for STR-04/04A/04B/04C).

## Exclusions (must not be done)
- No application code, migration, test, seed, sealed hash or runtime-guard change.
- No master or module blueprint modification; no rebaseline.
- No change to `ACC-01` or `AST-01` (no merge, rebase, cherry-pick, branch advance, `PLAN_READY`, acceptance or implementation authorisation).
- No provider selection, capability claim, legal conclusion or regulatory-approval claim.
- No entry in `DECISION_LOG.md`; no promotion into `OPEN_FINDINGS.md`; no `02-implementation-report.md`, `04-review.md`, `05-remediation.md` or `06-acceptance.md` (those stages have not occurred).
- No capability enablement or live money movement.

## Context references (explicit repo-relative files)
| Category | Path | Why |
|---|---|---|
| control | `docs/00_project_state/CURRENT_STATE.md` | Baseline, active task, licence lock |
| control | `docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md` | Model/discipline rules |
| control | `docs/03_implementation/tasks/README.md` | Task-record and checkpoint rules |
| decisions | `docs/DECISION_LOG.md` (DEC-011…DEC-014) | Binding inputs |
| registers | `docs/DOCUMENT_REGISTER.md`, `docs/OPEN_FINDINGS.md` | Versions; findings |
| masters | `docs/01_masters/00_…_v1.5.md` … `11_…_v1.2.md` | Impact assessment |
| module_docs | `docs/02_modules/{LED,DEP,WDR,REC,WLT,E2E,TRD,INC}-01/blueprint/v1.1|v1.2/` | Impact assessment |
| module_docs (branch) | `origin/module/ACC-01:docs/02_modules/ACC-01/blueprint/v0.10/` | Compatibility (read-only) |
| module_docs (branch) | `origin/module/AST-01:docs/02_modules/AST-01/blueprint/v1.8/` | Compatibility (read-only) |
| source | `platform/services/cfg1/src/lib/doc00-baseline.ts`, `platform/apps/web/components/site/public-trust-control.tsx`, `platform/services/wlt1/src/config.ts`, `platform/infra/migrations/061_wlt1_fiat_payout_destination.cjs` | Impact rows |

## Outputs of this turn
| Output | Result |
|---|---|
| DEC-015 architecture (`STR-04` v0.1) | Drafted — 57 sections (53 required + ownership self-check, adversarial questions, stale-assumption search, consuming work plan; decision record moved to §57), 7 diagrams; ends `DEC-015 STATUS: PROPOSED / AWAITING HUMAN ACCEPTANCE` |
| ACC-01 classification | **`DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY`** (STR-04 §51) |
| AST-01 classification | **`DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY`** (STR-04 §52; one conditional trigger FI-AST-2) |
| Embedded decision points | D-1…D-5 (STR-04 §36.3, §53) — each PROPOSED — SUBJECT TO INDEPENDENT DEC-015 REVIEW AND HUMAN ACCEPTANCE. Ownership self-check corrected the first draft: D-1 narrowed (WLT-01 = registry entry + eligibility only); **D-2 LQD-01 extension withdrawn**; **D-3 corrected** (LED-01 owns reservations, WDR-01 transmits); D-4 narrowed (accounting obligation + sequencing); **D-5 corrected** (REC-01 = detective evidence; DEP-01/WDR-01 own operational events) |
| Human decision raised | **HD-DEC015-01** — owner of the non-LP provider arrangement record (pre-existing WF-19 ownership gap) |
| External validation items | EV-01…EV-27 (STR-04 §41.1) |
| Proposed new findings | DEC015-PNF-01…10 (STR-04 §41.2) — not promoted |
| Masters requiring rebaseline | Doc 00 → v1.6; Charter → v1.6; Module Index → v1.5; SRS, Role Matrix, Workflow Map, System Rules → v1.4; 07–11 → v1.3 (STR-04 §44) |

## Next steps (each a separate, human-authorised turn — full derived order in STR-04 §56)
1. **DEC015-T01** — independent separate-context review of `STR-04`, `STR-04A/B/C`.
2. **DEC015-T02** — human acceptance incl. HD-DEC015-01; `DECISION_LOG.md` entry; register status update; `CURRENT_STATE.md` update.
3. **DEC015-T03…T06** — master rebaselines in STR-04 §44 order.
4. **DEC015-T07** — ACC-01 / AST-01 compatibility disposition record (in parallel with the master rebaseline; STR-04 §56 step 4a).
5. **DEC015-T08…T11** — LED-01, WLT-01/LQD-01, DEP-01/WDR-01/REC-01/TRE-01/FEE-01 blueprints, then E2E-01.

## Acceptance criteria (for the review in T01; checkable from repository evidence)
- [ ] Every claim about ACC-01/AST-01 cites the reviewed branch commit and file/section.
- [ ] No provider is described as selected, contracted, approved, capable or integrated.
- [ ] No legal conclusion or regulatory approval is asserted; Exchange approval recorded as `EV-22`.
- [ ] Repository impact matrix covers every material source found by the keyword sweep, with one disposition each.
- [ ] Every financial object in STR-04 §36.1 has exactly one owner; no new top-level module.
- [ ] `DEC-011`…`DEC-014` and the `DEC-013` clause 5 prohibitions are preserved.
- [ ] Nothing outside `docs/05_strategy/` (four new files), `docs/03_implementation/tasks/DEC-015/`, `docs/00_project_state/CURRENT_STATE.md` and `docs/DOCUMENT_REGISTER.md` changed.
- [ ] D-1…D-5 ownership positions survive adversarial review (STR-04 §53) and HD-DEC015-01 is decided at acceptance.
