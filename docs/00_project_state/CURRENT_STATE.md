---
document_id: STATE-005
title: AIX Platform — Current State
version: N/A
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Compact navigation / current-state record
owner: Unassigned
effective_date: 2026-09-20
last_reviewed: 2026-09-20
supersedes: none
baseline_commit: ae3322e
---

# AIX Platform — Current State

> **CURRENT_STATE.md is a compact navigation/current-state record. It does not replace the authoritative registers and decision records it references.**

Keep this file to ~120 lines. Current state only: no history, no narrative, no copied register rows. When it disagrees with a referenced source, the source wins; fix this file. Update it at each accepted task or checkpoint (see [tasks/README.md](../03_implementation/tasks/README.md)).

## 1. Identity
AIX Full Compliance — Labuan FSA **Money Broking + PSO** platform (Exchange application pending). Documentation in `docs/`, code in `platform/` (npm workspaces: `packages/*`, `services/*`, `apps/*`). Docs entry point: [../README.md](../README.md).

## 2. Baseline (verified against the repository, 2026-09-19)
- Branch `main` at `ae3322e` — `feat(ui): add admin edd review page`.
- Migration head **070** (`platform/infra/migrations/070_fnd_rate_limit_policy_privilege_hardening.cjs`, 70 migrations); also stated in [OPEN_FINDINGS.md](../OPEN_FINDINGS.md) (FND-01 Shared Rate-Limit Engine).
- Checks (from `platform/package.json`): `npm test` (vitest), `npm run typecheck` (`tsc -b`), `npm run lint:web`, `npm run typecheck:web`, `npm run build:web`. Test totals live in the acceptance records, not here.

## 3. Current phase
- **Backend:** module implementation is recorded per module in [MODULE_STATUS.md](MODULE_STATUS.md) (Implementation status table). Deployment/perimeter pack **IMP-02 is IN_PROGRESS** ([IMP-02 README](../03_implementation/IMP-02/README.md)); internet exposure is prohibited there.
- **UI:** public homepage **VISUALLY ACCEPTED / CLOSED** (UI Phase 1R). Authenticated platform: Phases 2A–2Q recorded in [04_ui/README.md](../04_ui/README.md) — 4 Client, 5 Staff/Ops and 4 Admin pages **IMPLEMENTED / VISUAL QA DEFERRED** by an explicit program decision; no API/auth integration on any page; four Admin areas remain unimplemented.

## 4. Most recently accepted
- **Backend:** IMP-02 Measurement Harness Turn M-A, commit `d57b436` — record `IMP-02-ACC-004` ([DOCUMENT_REGISTER.md](../DOCUMENT_REGISTER.md) §4b).
- **Modules:** accepted baselines and phases are in [MODULE_STATUS.md](MODULE_STATUS.md); per-module acceptance records are under `02_modules/<MODULE>/acceptance/` (indexed in DOCUMENT_REGISTER §4a).
- **UI:** the most recent commits (Phases 2N–2Q) are implementations, not acceptances. `AUTHENTICATED SHELL: VISUALLY ACCEPTED` is not recorded anywhere (04_ui README).

## 5. Active task
**IMP02-MA-HARDEN-001** — Harden IMP-02 Turn M-A evidence paths and result validation. State `PLAN_READY`: the plan is recorded and awaiting human approval to implement; nothing is implemented or accepted. Risk MODERATE. Intended to close the two IMP-02 Turn M-B gate findings (`IMP-02-FIND-010`, `IMP-02-FIND-011`) once independently accepted; they remain open. Records: [tasks/IMP02-MA-HARDEN-001/](../03_implementation/tasks/IMP02-MA-HARDEN-001/).

## 6. Open findings (IDs only — details and state in [OPEN_FINDINGS.md](../OPEN_FINDINGS.md))
- **HIGH:** `FND-FIND-001` — pre-authentication abuse control; trigger: before any WLT-01 public route is internet-exposed; resolved via IMP-02.
- **BLOCKED:** `WDR-FIND-001` — WDR-01 implementation blocked on KMS as a platform prerequisite.
- **OPEN, above LOW:** `IAM1-FIND-003` (MEDIUM), `IAM2-FIND-001` (severity recorded as "Requires triage"), `WLT-FIND-004` (prerequisites and implementation complete; see register).
- **OPEN, LOW/INFORMATIONAL:** all remaining OPEN rows (CLT, FND, IAM1, IMP-02, WLT families).
- **Mandatory gate:** `IMP-02-FIND-010` and `IMP-02-FIND-011` must close before IMP-02 Turn M-B.
- **Deferred / environment:** `IAM1-FIND-002`, `WLT-FIND-002`, `WLT-FIND-003` (deferred), `ENV-FIND-001` (shared test-DB grant drift, local state).
- No other row in the register carries HIGH or BLOCKER severity at this baseline.

## 7. Decisions ([DECISION_LOG.md](../DECISION_LOG.md))
- Governance: DEC-001…DEC-007 (single Git authority, module-centric layout, Git as history, blueprint promotion rule, findings owned by OPEN_FINDINGS, versions owned by DOCUMENT_REGISTER, AIX Full Compliance distinct from AIX Revamp).
- Architecture: **DEC-008** IAM-01 internal session-introspection seam; **DEC-009** shared rate-limit engine; **DEC-010** public perimeter / pre-auth abuse control (four layers).

## 8. Next intended work (only what the repository states)
- IMP-02: Turn M-B is gated on `IMP-02-FIND-010`/`011` (IMP-02 README).
- UI: build out the four remaining Admin areas, then one consolidated visual QA pass (04_ui README, Phase 2D/2E program decision).
- Anything else is not stated in a single authoritative place. A human decides; do not infer it from this file.

## 9. Operating constraints
- **Licence lock (non-negotiable):** Money Broking + PSO approved; **all Exchange features LOCKED** — no order book, matching, market making, principal dealing, spread markup; agency/back-to-back through approved LP; disclosed brokerage fee only; AIX inventory zero; third-party custody; institutional/HNWI only ([PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) §Licence).
- Models and discipline: [CLAUDE_CODE_USAGE_RULES.md](CLAUDE_CODE_USAGE_RULES.md) — Sonnet normal coding; Opus architecture/security/compliance/fund-flow review; Fable UX copy; one module per session; search before opening; focused diffs.
- UI work follows `docs/04_ui/` and the `aix-ui-design` skill (`.claude/skills/`).
- Findings are closed only on repository evidence (commit + reproduced result), never on a model's own report.
- Conductor record checkpoints are separate governance/evidence commits unless an approved task says otherwise ([tasks/README.md](../03_implementation/tasks/README.md)).

## 10. Authoritative sources
| Need | Source |
|---|---|
| Document versions, acceptance-record index | [DOCUMENT_REGISTER.md](../DOCUMENT_REGISTER.md) |
| Unresolved findings | [OPEN_FINDINGS.md](../OPEN_FINDINGS.md) |
| Decisions | [DECISION_LOG.md](../DECISION_LOG.md) |
| Module implementation status | [MODULE_STATUS.md](MODULE_STATUS.md) |
| Historical narrative (do not load whole) | [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) |
| Module docs / acceptance | `02_modules/<MODULE>/` |
| Deployment / perimeter | [IMP-02 README](../03_implementation/IMP-02/README.md) |
| UI governance | [04_ui/README.md](../04_ui/README.md) |
| Conductor task records | [tasks/README.md](../03_implementation/tasks/README.md) |

## 11. Do not load whole (size guard)
`SESSION_START_PROMPT.md` (~3,800 lines), `PROJECT_HANDOVER.md` (~1,270), `04_ui/README.md` (~1,000), `DECISION_LOG.md` (~840). Reference by ID or section; load an excerpt only when a task needs it.
