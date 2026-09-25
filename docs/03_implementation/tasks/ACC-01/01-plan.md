# 01 Plan — ACC-01: Account Structure (Master Account & Subaccount) — blueprint and implementation planning

- **Task ID:** ACC-01
- **Status:** **PLANNED / AWAITING REVIEW**
- **Risk:** MODERATE for this task (documentation only). The **module it plans is Money-Critical / Compliance-Critical**; any implementation task derived from it should be classed HIGH–CRITICAL and independently reviewed by an Opus-class reviewer (CLAUDE_CODE_USAGE_RULES: architecture/security/compliance/fund-flow review).
- **Category:** Phase C institutional foundation (`DEC-011`; Module Index §18)
- **Planner:** blueprint / implementation planner / claude-sonnet-5 / effort not specified by the assignment
- **Selected implementer:** none — **planning only**; no implementer is selected and none is authorised
- **Baseline commit:** `43f2f34` (repository HEAD at planning time); accepted platform baseline `5a4f872`, migration head `071` (CURRENT_STATE 2026-09-25)
- **Branch:** `module/ACC-01` (worktree `AIX-worktrees/acc-01`)
- **Human approval:** **none yet.** Nothing in this plan or the pack it produced is approved. Approval of the pack is required before any implementation task exists.

## Objective
Reconstruct ACC-01's requirements from `DEC-011`, `DEC-013`, `DEC-014`, CURRENT_STATE and the relevant Master Module Index, SRS, Role Matrix, Workflow and System Rules sections, and produce the ACC-01 blueprint pack and this planning record: master-account lifecycle, subaccount lifecycle, legal-entity ownership, identifiers, account statuses, subaccount scoping, permissions, maker-checker, audit, API, database design, state machines, errors, testing and dependencies. No application code and no migration.

## Approved scope
- Create `docs/02_modules/ACC-01/README.md` and `docs/02_modules/ACC-01/blueprint/v0.1/` (README + files 01–17).
- Create `docs/03_implementation/tasks/ACC-01/01-plan.md` and `task.json`.
- Record dependency-change requests, open questions and proposed human decisions (blueprint file 17).

## Exclusions (must not be done)
- No application code, migration, test, dependency or configuration change.
- No change to `main`, no merge.
- No change to CLT-01, IAM-02, CFG-01, AST-01, LED-01, shared foundation, the masters, or the governance registers (`DOCUMENT_REGISTER.md`, `MODULE_STATUS.md`, `CURRENT_STATE.md`, `DECISION_LOG.md`, `OPEN_FINDINGS.md`). Required changes are recorded as `DCR-ACC-*` requests only.
- CLT-01 remains sole owner of legal entity, client identity and membership. LED-01 remains sole owner of ledger account, balances, journals and postings. ACC-01 owns master account and subaccount only.
- No claim of acceptance, approval or production readiness; no regulatory conclusion (`A2-Q1`/`A2-Q2` remain open).

## Context references (explicit repo-relative files)
| Category | Path | Why |
|---|---|---|
| decisions | `docs/DECISION_LOG.md` — `DEC-011`, `DEC-013`, `DEC-014` | Hierarchy; build-unlocked/production-gated model; `current_state` semantics |
| control | `docs/00_project_state/CURRENT_STATE.md` | Baseline, open findings (`IAM2-FIND-002`, `CFG-FIND-002`) |
| control | `docs/05_strategy/AIX_Re-Baseline_Governance_Decision_Pack_v0.1.md` §4, §4.9, §4.10 | The 14 binding requirements; LED-01 consequence |
| masters | `docs/01_masters/03_Master_Module_Index_v1.4.md` §7, §11, §18, §19 | ACC-01 row, dependencies, sequence, rules |
| masters | `docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.5.md` §2C, §21, §21A, §23 | Hierarchy rules, condition 9, `A2-Q1/Q2` |
| masters | `docs/01_masters/04_Role_And_Permission_Matrix_v1.3.md` §3.7, §3.8, §5.1, §5.2A, §7, §23, §29, §30 | Permission ≠ activation; scoping; maker-checker |
| masters | `docs/01_masters/05_Master_Workflow_Map_v1.3.md` WF-26, WF-27, §33A.3 | Freeze/closure; merchant account creation |
| masters | `docs/01_masters/06_Master_System_Rules_v1.3.md` §18, §26 | `FRZ-RULE-*`, `OFF-RULE-001`, error set |
| masters | `docs/01_masters/02_Software_Requirement_Specification_v1.3.md` (`PAY-SRS-002`, `RWA-SRS-024`) | Consumers of the hierarchy |
| module_docs | `docs/02_modules/CLT-01/blueprint/v1.2/*` (05, 06, 08, 09), `docs/02_modules/LED-01/blueprint/v1.2/05_Database_Design.md`, `docs/02_modules/IAM-02/blueprint/v1.1/04_API_Specification.md` | Conventions and seams (inspected, not modified) |
| source (inspected) | `platform/infra/migrations/006`, `020`, `022`, `067`; `platform/services/clt1/src/routes/clients.ts`, `principal-memberships.ts`, `lib/iam2-client.ts`, `lib/cfg1-client.ts`; `platform/services/iam2/src/lib/guard.ts`, `errors.ts` | Real schema, statuses, seams, error and permission conventions |

## Produced artefacts
Pack: `docs/02_modules/ACC-01/blueprint/v0.1/` — 17 files plus README; module index page `docs/02_modules/ACC-01/README.md`.

## Key design outcomes (all proposals for review)
1. ACC-01 stores no legal-entity, membership, ledger or balance data; owner is a `client_id` reference validated through CLT-01's **existing** `/internal/clt1/clients/:client_id/status` seam — **no CLT-01 change is needed to build ACC-01**.
2. Cross-client subaccount ownership is unrepresentable (composite FK + trigger); ownership immutable from creation; no transfer path.
3. Effective status is computed live and fails closed; never cascaded, never cached in v0.1.
4. All create/close/restrict/lift changes are governed change requests with IAM-02 maker-checker and a crash-window-safe apply.
5. ACC-01 is not a capability: it supplies Doc 00 §21 condition 9 as an input only (`DEC-013`/`DEC-014` respected).
6. Thirteen dependency-change requests, ten open questions and ten proposed human decisions recorded (file 17). Highest-impact: **DCR-ACC-LED-01** (LED-01 must consume `DEC-011` and this pack before schema freeze), **DCR-ACC-IAM-02/03** (approval policy rows and `IAM2-FIND-002`).

## Acceptance criteria for this planning task (checkable from repository evidence)
- [x] Pack exists at the paths above; every file listed in its README exists.
- [x] Every requirement `ACC-REQ-*` carries a source; DEC-011 §4.9 items 1–14 are each covered.
- [x] No file under `platform/**` changed; no migration added; only paths under `docs/02_modules/ACC-01/**` and `docs/03_implementation/tasks/ACC-01/**` changed (`git diff --stat` against `43f2f34`).
- [x] No other module, master, register or `main` modified.
- [x] Dependency changes recorded as `DCR-ACC-*`, not made.
- [x] Status recorded as PLANNED / AWAITING REVIEW; nothing marked accepted.
- [ ] **Independent review** of the pack (recommended: Opus-class, not the authoring session) — pending.
- [ ] **Human decision** on HD-1…HD-10 and approval to proceed — pending.

## Next steps (none started)
1. Independent review of the pack; remediate findings in a new pack version.
2. Human decisions HD-1…HD-10.
3. Sequence `DCR-ACC-LED-01` ahead of LED-01's design freeze; sequence `DCR-ACC-IAM-02/03` ahead of any governed apply.
4. On acceptance, governance follow-ups (`DCR-ACC-GOV-01/02/03`) as a separate record checkpoint.
5. Only then: an approved implementation task per phase (file 11).
