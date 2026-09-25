# 01 Plan — AST-01: Asset & Instrument Registry + Regulatory Classification (blueprint / implementation planning)

- **Task ID:** AST-01
- **Status:** **PLANNED / AWAITING REVIEW**
- **Risk:** CRITICAL — compliance-critical classification gate; the module that keeps securities-featured instruments out of Money Broking products.
- **Category:** Module blueprint and implementation planning (`DEC-013` module blueprints phase)
- **Planner:** blueprint author / claude-sonnet-5 / effort not specified in the invocation. *Selection note:* `CLAUDE_CODE_USAGE_RULES.md` reserves architecture, security, compliance and fund-flow **review** for Opus; this blueprint should receive an independent Opus-class or GPT review before any human approval.
- **Selected implementer:** none — this task authorises **no implementation**.
- **Baseline commit:** `43f2f34` (`docs: accept MIG-004 environment availability control`)
- **Branch:** `module/AST-01` (worktree `AIX-worktrees/ast-01`). `main` is untouched. Nothing merged.
- **Human approval:** none yet. **Not accepted. Not approved for implementation.**

## Objective

Design the AST-01 module completely enough that a later, separately approved implementation task has no architectural decision left open other than the human decisions HD-1…HD-10 and the dependency-change requests recorded in the blueprint. The design must make it **structurally impossible** for a `SECURITY / SECURITY TOKEN` classified instrument to become eligible for AIX Spot or AIX Money Broking (OTC), must **fail closed** on unresolved classification, and must **derive** every product eligibility from classification with no independent flags.

## Approved scope (this task)

Documentation only, inside the ownership boundary:

- `docs/02_modules/AST-01/**` — module README and blueprint pack v1.0 ([blueprint/v1.0/](../../../02_modules/AST-01/blueprint/v1.0/README.md)).
- `docs/03_implementation/tasks/AST-01/**` — this plan and `task.json`.

Design coverage required by the task brief, and where it is answered:

| Required design area | Location |
|---|---|
| Asset identity / instrument identity | 01 §3.1–3.3 |
| Classification lifecycle; classification evidence | 01 §4; 02 W2–W4; 06 SM-2/3/4; 05 §4 |
| Asset classes | 01 §3.4 |
| Jurisdictions | 01 §8; 05 §5 |
| Issuer relationship / underlying relationship | 01 §3.5, §3.6 |
| Blockchain / network details; precision | 01 §3.7, §3.8; 05 §2–3 |
| Custody support | 01 §6 |
| Deposit / withdrawal eligibility | 01 §5.7 |
| Spot / OTC / Pay / RWA / secondary-market / Exchange eligibility | 01 §5 (derivation matrix) |
| Transfer restrictions | 01 §7; 05 §5 |
| Maker-checker | 07 §5; 02; 04 §3 |
| Audit / evidence | 08 |
| API; database model; state machines; errors; tests | 04; 05; 06; 09; 10 |

## Exclusions (must not be done — and were not)

- No application code, no migration, no schema change, no test code, no seeded identifier.
- No trading, Exchange matching, ledger, or RWA issuance design beyond the consumption boundary.
- No modification of `main`, CFG-01, KYC-01, WLT-01, LED-01, RWA, Exchange modules, `@aix/foundation`, IAM-02, or any control-layer file (`DOCUMENT_REGISTER.md`, `CURRENT_STATE.md`, `MODULE_STATUS.md`, `OPEN_FINDINGS.md`, `DECISION_LOG.md`).
- No classification of any asset; no answer to any regulatory open question; no approval of any venue, order type or asset.
- Any change needed elsewhere is a **dependency-change request** in [17](../../../02_modules/AST-01/blueprint/v1.0/17_Dependencies_And_Open_Decisions.md) (DCR-AST1-001…009), not a change.

## Key design decisions (summary — full text in the blueprint)

1. **Derived, never stored.** Eligibility is a pure function of (effective classification, asset class, environment, narrowing conjuncts). No `*_eligible` column or endpoint exists; a schema-lint test enforces it. `UNRESOLVED` is the *absence* of a valid classification record.
2. **Hard rule in three layers:** frozen matrix constant with boot-time invariant assertion; pure derivation with exhaustive property tests; database CHECKs on the decision log and token tables (and an admission trigger) that make an `allow` for `SECURITY × SPOT/OTC` unrecordable.
3. **Append-only classification ledger** bound to an identity fingerprint; drift collapses to `UNRESOLVED`; environment-bound; maker-checker with `maker ≠ checker` enforced three times (IAM-02, service, DB).
4. **Evidence standard is data, not code.** `R4-Q3` is open, so PRODUCTION classification is impossible until governance supplies an approved standard with a resolution reference. Non-production is unblocked (`DEC-013` cl. 4).
5. **Synthetic instruments** are declared at creation, distinguishable by code prefix, valid non-production only, fail closed in PRODUCTION, and structurally unpromotable (no promotion operation exists).
6. **Tighten fast, loosen slowly.** Holds and other tightening are single-actor and immediate; loosening is maker-checker (`SYS-RULE-008` precedent). Classification itself stays maker-checkered both ways (Role Matrix §5.2A rule 9).
7. **AST-01 answers one conjunct** (`PRODUCT_ASSET_ELIGIBILITY_STATE`) and says so in every response; it never returns "access granted".
8. **Own-environment authority** (`CFG-FIND-001` lesson): the caller's environment is an asserted consistency field only.
9. **Code-derived constraint:** `assertNoExchangeRuntime` rejects any route path containing `exchange`; Exchange eligibility appears only as a payload enum value.

## Proposed implementation phasing (for a later, separately approved task — nothing here is authorised)

| Phase | Content | Depends on | Gate to start |
|---|---|---|---|
| **AST1-P0** | Human decisions HD-1…HD-10 resolved; blueprint independently reviewed and promoted (DOCUMENT_REGISTER) | This plan | Independent review ACCEPT; human approval |
| **AST1-P1** | `ast1` schema: reference + core + classification ledger + triggers + grants; DB tests T-DB-*, T-SCH-*, T-SEC-04…06 | P0; migration head re-checked | Approved implementation plan naming the migration number |
| **AST1-P2** | Pure derivation, matrix constant + boot invariant, evaluate/verify + decision log/token; T-DER-*, T-SEC-*, T-ENV-*, T-TOK-*, T-API-* | P1 | — |
| **AST1-P3** | Governed changes and conjuncts (admission, custody, operational state, restrictions, jurisdiction, attestation); IAM-02 request/apply | P2; **DCR-AST1-001 (a) at least for non-prod stubs** | — |
| **AST1-P4** | Holds, integrity sweep, evidence standard lifecycle | P3; DCR-AST1-006 | — |
| **AST1-P5** | Evidence export (maker-checkered) | P4; DCR-AST1-005 | Later |

**Not before real-instrument use in PRODUCTION:** DCR-AST1-001 (a)–(c) closed, `R4-Q3` answered by governance with an approved evidence standard, and CFG-01 production activation path built (`PRODUCTION_ACTIVATION_STATE`, `DEC-014`). Each of those is outside this task.

## Context references (repo-relative)

| Category | Path | Why |
|---|---|---|
| decisions | `docs/DECISION_LOG.md` (`DEC-012`, `DEC-013`, `DEC-014`) | Clause 6 gate; four-state model; build-unlocked/production-gated; `current_state` conjunct |
| control | `docs/00_project_state/CURRENT_STATE.md` | Baseline, head 071, next work |
| masters | Doc 00 §1.D, §8, §12A, §21, §21A, §22, §23, §25.3; Module Index §5.4, §9, §17; SRS `AST-SRS-001/001A/002/003`; Role Matrix §3.4, §3.7, §5.2, §5.2A, §22; Workflow `WF-31/32/34/35`; System Rules `SYS-RULE-007…011`, `ASSET-RULE-001/002`, `LED-RULE-005` | Requirements |
| source (read-only) | `platform/services/cfg1/src/**`, `platform/packages/foundation/src/{environment,audit,no-exchange,idempotency}.ts`, `platform/infra/migrations/{014,016,049,066,071}*` | Conventions only |
| module docs | `docs/02_modules/CFG-01/blueprint/v1.1/`, `docs/03_implementation/tasks/MIG-004/01-plan.md` | Pattern precedent |

## Acceptance criteria for this planning task (checkable from repository evidence)

- [ ] Only files under the two permitted paths changed; `git diff --stat main..module/AST-01` shows no other path.
- [ ] No `platform/**` change; no migration; no test code.
- [ ] Blueprint states the SECURITY-never-Spot/OTC rule and its three enforcement layers (01 §2 INV-01, §5.5; 05 §6.1).
- [ ] Blueprint makes unresolved classification derivable as a fail-closed absence (INV-02) and forbids stored eligibility (INV-03).
- [ ] Every required design area in the brief maps to a section (table above).
- [ ] Every cross-module change is a DCR, none performed.
- [ ] No regulatory open question is answered; `R4-Q3`, `R4-Q6`, `R4-Q7`, `R4-Q5`, `R1-Q1b` recorded as fail-closed gaps.
- [ ] Status recorded as **PLANNED / AWAITING REVIEW** everywhere; no document claims acceptance, activation or approval.
- [ ] Committed only to `module/AST-01` and pushed to `origin`; not merged.

## Review request

Independent review is requested before human approval, concentrating on: (1) whether `product_admission` (HD-2) is an acceptable conjunct under "no independently settable eligibility"; (2) the derivation matrix cells marked `NOT_ASSESSED` for open regulatory questions; (3) the three-layer hard-rule defence and the decision-log CHECKs; (4) the `R4-Q3` evidence-standard modelling; (5) tighten/loosen asymmetry versus Role Matrix §5.2A rule 9; (6) the `exchange` route-path constraint.
