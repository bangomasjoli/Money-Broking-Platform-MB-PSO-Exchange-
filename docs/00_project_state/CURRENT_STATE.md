---
document_id: STATE-005
title: AIX Platform — Current State
version: N/A
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Compact navigation / current-state record
owner: Unassigned
effective_date: 2026-09-22
last_reviewed: 2026-09-25
supersedes: none
baseline_commit: 5f78a0b
---

# AIX Platform — Current State

> **CURRENT_STATE.md is a compact navigation/current-state record. It does not replace the authoritative registers and decision records it references.**

Keep this file to ~120 lines. Current state only: no history, no narrative, no copied register rows. When it disagrees with a referenced source, the source wins; fix this file. Update it at each accepted task or checkpoint (see [tasks/README.md](../03_implementation/tasks/README.md)).

## 1. Identity
AIX Full Compliance — Labuan FSA **Money Broking + PSO** platform (Exchange application pending). Documentation in `docs/`, code in `platform/` (npm workspaces: `packages/*`, `services/*`, `apps/*`). Docs entry point: [../README.md](../README.md).

## 2. Baseline (verified against the repository, 2026-09-25)
- Baseline commit: `5f78a0b` — `feat(foundation): add governed environment capability model (MIG-005)` (parent `9bc49aa`). The last UI commit is unchanged: `bff15e8` — `feat(ui): add admin approval queue` (UI Phase 2R). This is the front matter `baseline_commit`: the newest non-governance commit this file was verified against, and the current accepted baseline. It is not the repository HEAD, which this file never records; the conductor reads HEAD from Git. Only control-layer records (this file, the registers, `tasks/**`) follow it. The last accepted **backend** implementation commit is `5f78a0b` (`MIG-005`; see §4). Before it: `9b0bab7` — `fix(perf): harden IMP-02 measurement evidence validation`.
- Migration head **070** (`platform/infra/migrations/070_fnd_rate_limit_policy_privilege_hardening.cjs`, 70 migrations); also stated in [OPEN_FINDINGS.md](../OPEN_FINDINGS.md) (FND-01 Shared Rate-Limit Engine).
- Checks (from `platform/package.json`): `npm test` (vitest), `npm run typecheck` (`tsc -b`), `npm run lint:web`, `npm run typecheck:web`, `npm run build:web`. Test totals live in the acceptance records, not here.

## 3. Current phase
- **Backend:** module implementation is recorded per module in [MODULE_STATUS.md](MODULE_STATUS.md) (Implementation status table). Deployment/perimeter pack **IMP-02 is IN_PROGRESS** ([IMP-02 README](../03_implementation/IMP-02/README.md)); internet exposure is prohibited there.
- **UI:** public homepage **VISUALLY ACCEPTED / CLOSED** (UI Phase 1R). Authenticated platform: Phases 2A–2R recorded in [04_ui/README.md](../04_ui/README.md) — 4 Client, 5 Staff/Ops and 5 Admin pages **IMPLEMENTED / VISUAL QA DEFERRED** by an explicit program decision; no API/auth integration on any page; three Admin areas remain unimplemented (Users / Roles / Permissions, Feature Flags / Configuration, Audit / Sensitive Access).

## 4. Most recently accepted
- **Backend:** `MIG-005` canonical environment model, commit `5f78a0b` — [06-acceptance.md](../03_implementation/tasks/MIG-005/06-acceptance.md). Before it: `IMP02-MA-HARDEN-001` (closes `IMP-02-FIND-010` and `IMP-02-FIND-011`), commit `9b0bab7` — [06-acceptance.md](../03_implementation/tasks/IMP02-MA-HARDEN-001/06-acceptance.md). Before it: IMP-02 Measurement Harness Turn M-A, commit `d57b436` — record `IMP-02-ACC-004` ([DOCUMENT_REGISTER.md](../DOCUMENT_REGISTER.md) §4b).
- **Modules:** accepted baselines and phases are in [MODULE_STATUS.md](MODULE_STATUS.md); per-module acceptance records are under `02_modules/<MODULE>/acceptance/` (indexed in DOCUMENT_REGISTER §4a).
- **UI:** the most recent commits (Phases 2N–2R) are implementations, not acceptances. `AUTHENTICATED SHELL: VISUALLY ACCEPTED` is not recorded anywhere (04_ui README).

## 5. Active task

None. **MIG-005** (canonical five-environment model in `@aix/foundation`; `demo` added; `staging` and unknown → PRODUCTION) is **ACCEPTED** at `5f78a0b`, with controlled carry-forwards. The review ran in the same session as the implementation; the human accepted knowing this. Records: [tasks/MIG-005/](../03_implementation/tasks/MIG-005/). Carry-forwards: `CFG-FIND-001` (HIGH, must close inside `MIG-004`), `FND-FIND-012`, `FND-FIND-013`, `WLT-FIND-016`, plus governance cleanup G-1 (record the staging mapping as decided in the masters). **`MIG-004` MAY START but is NOT STARTED**; its plan must meet the four conditions in [04-review.md](../03_implementation/tasks/MIG-005/04-review.md) ("MIG-004 gate"). No capability enabled, no migration added.

The previous active task **IMP02-MA-HARDEN-001** is **ACCEPTED**: independent GPT review `ACCEPT` (no findings), then human acceptance. Records: [tasks/IMP02-MA-HARDEN-001/](../03_implementation/tasks/IMP02-MA-HARDEN-001/). One residual behaviour was accepted by the human: `writeEvidenceAtomic` creates the target directory before its realpath containment check, so a symlink escape may create an empty directory outside `perf/evidence/` before the write is refused; no evidence file is written outside the root (`REVIEW_CONCERN-001`, see [04-review.md](../03_implementation/tasks/IMP02-MA-HARDEN-001/04-review.md)).

## 6. Open findings (IDs only — details and state in [OPEN_FINDINGS.md](../OPEN_FINDINGS.md))
- **HIGH:** `FND-FIND-001` — pre-authentication abuse control; trigger: before any WLT-01 public route is internet-exposed; resolved via IMP-02.
- **HIGH:** `CFG-FIND-001` — CFG-01 evaluates a caller-asserted `environment`; latent production-gate bypass; trigger: must close inside `MIG-004` (acceptance criterion).
- **HIGH:** `IAM2-FIND-002` — IAM-02 approval endpoints evaluate no permission entitlement for create/approve/reject; trigger: before real-actor approval integration, UAT of maker-checker, or production exposure. Does not block UI Phase 2S (`IAM-02-ACC-003`).
- **BLOCKED:** `WDR-FIND-001` — WDR-01 implementation blocked on KMS as a platform prerequisite.
- **OPEN, above LOW:** `IAM1-FIND-003` (MEDIUM), `IAM2-FIND-001` (severity recorded as "Requires triage"), `IAM2-FIND-003` (MEDIUM — no approval policy seeded; weakest control applied silently), `WLT-FIND-004` (prerequisites and implementation complete; see register).
- **OPEN, LOW/INFORMATIONAL:** all remaining OPEN rows (CLT, FND, IAM1, IAM2, IMP-02, WLT families).
- **Closed:** `IMP-02-FIND-010` and `IMP-02-FIND-011` (`IMP02-MA-HARDEN-001`, commit `9b0bab7`); the Turn M-B gate on them is satisfied. Turn M-B has not started.
- **Deferred / environment:** `IAM1-FIND-002`, `WLT-FIND-002`, `WLT-FIND-003` (deferred), `ENV-FIND-001` (shared test-DB grant drift, local state).
- No other row in the register carries HIGH or BLOCKER severity at this baseline.

## 7. Decisions ([DECISION_LOG.md](../DECISION_LOG.md))
- Governance: DEC-001…DEC-007 (single Git authority, module-centric layout, Git as history, blueprint promotion rule, findings owned by OPEN_FINDINGS, versions owned by DOCUMENT_REGISTER, AIX Full Compliance distinct from AIX Revamp).
- Architecture: **DEC-008** IAM-01 internal session-introspection seam; **DEC-009** shared rate-limit engine; **DEC-010** public perimeter / pre-auth abuse control (four layers); **DEC-011** institutional account hierarchy (Legal Entity → Master Account → Subaccount → Ledger Account, extending CLT-01) — **`LED-01` may not freeze its schema design until it consumes DEC-011**; **DEC-012** AIX Spot execution architecture (Model A external-venue routing ACCEPTED; Model B multi-venue routing accepted as a PRODUCTION-GATED capability; **Model C internal client-to-client matching BLOCKED**; market-depth vs client-order-store vs internal-matching-book terminology; AIX Spot / AIX Exchange product terminology direction; securities-feature gate at the Asset & Instrument Registry). **DEC-012 approves no venue, no production order type and no asset**, and modifies no runtime guard; **DEC-013** build-unlocked / production-gated capability model — four separate states (`CAPABILITY_BUILD_STATE`, `ENVIRONMENT_AVAILABILITY`, `PRODUCTION_ACTIVATION_STATE`, `PRODUCT_ASSET_ELIGIBILITY_STATE`) across five environments (DEVELOPMENT / TEST / UAT / DEMO / PRODUCTION); confirmed target capabilities may be built and tested while production activation stays fail-closed; **AIX Exchange and AIX RWA securities capabilities build-unlocked, production gated**; four Exchange modules authorised. **DEC-013 approves no live regulated activity, claims no approval AIX has not received, answers no regulatory open question, and reaffirms Model C, principal dealing and proprietary market making as prohibited in every environment.**

## 7A. Master re-baseline — core masters COMPLETE
All six core masters are re-baselined on `DEC-013`. Each carries promotion-review evidence in [`01_masters/reviews/`](../01_masters/reviews/); superseded versions are archived intact in [`90_archive/masters/`](../90_archive/masters/).

| Doc | Version | Substance |
|---|---|---|
| **Doc 00** | **`v1.5`** | §1.D four-state capability model, §1.E five environments, §12E AIX Exchange, §20 matrices with build and environment columns, §20.6 out-of-scope, §21 production activation gate, §21A eight binding rules, §25.3 `MIG-001`…`MIG-010` |
| **Charter** | **`v1.5`** | §6.3 permanent MB venue prohibitions, §6.4 build-unlocked scope, §6.5 out-of-scope, §12A.6 AIX Exchange, §26.1 five-environment matrix |
| **Module Index** | **`v1.4`** | **37 modules** — 33 retained unrenumbered + `EXM-01`, `EXO-01`, `EXC-01`, `EXP-01` (§16A); §5.4 build/activation status; §17 split three ways |
| **SRS** | **`v1.3`** | §2A `IMPLEMENTED_CAPABILITY` / `ENVIRONMENT_AVAILABILITY` / `PRODUCTION_REGULATORY_ACTIVATION`, §2B environments, `SPT-SRS-*`, `PAY-SRS-*`, `RWA-SRS-*`, `EXG-SRS-*`, §19 replaced |
| **Role Matrix** | **`v1.3`** | §3.7 a permission never activates a capability, §19A activation permissions, 19 roles added, §22 replaced |
| **Workflow Map** | **`v1.3`** | §3.7 production activation gate step, `WF-30`…`WF-35`, `WF-11` Model A order lifecycle, `WF-29` replaced |
| **System Rules** | **`v1.3`** | `SYS-RULE-006`…`011`, `LIC-RULE-002` rewritten as permanent, `LIC-RULE-002A`, `LIC-RULE-005`, `ASSET-RULE-002`, `CFG-RULE-004`/`005` |

- Lock-review evidence: [`STR-03`](../05_strategy/AIX_Capability_Lock_Review_v0.1.md) — 72 locks classified A–F, `MIG-001`…`MIG-010` registered.
- **Still `CAN WAIT` (Doc 00 §25.1):** masters 07–11. Their Document Control base-document rows remain at `v1.3`/`v1.2` and are knowingly stale until they are re-baselined.
- Next: module blueprints — `EXM-01`, `EXO-01`, `EXC-01`, `EXP-01` (new), plus `TRD-01`, `LED-01`, `DEP-01`, `PRT-01`, `AST-01`, `CFG-01`, `IAM-02`, `OMS-01`, `EXE-01`, `SUR-01`, `PAY-01`, `RWA-01`…`RWA-04`. **`LED-01` may not freeze its schema design until it consumes `DEC-011`.**
- **The re-baseline itself changed no code, migration, test, seeded identifier, sealed hash or runtime guard.** Deferred code requirements: `MIG-001`…`MIG-010` (Doc 00 §25.3), including the CFG-01 `DOC00_SOURCE_VERSION` label bump + reseal (`MIG-008`); the sealed hash itself remains valid because neither hash input changed.

## 8. Next intended work (only what the repository states)
- **Governance / masters:** the `DEC-013` core re-baseline is complete (§7A). The stated next phase is **module blueprints**: create `EXM-01`, `EXO-01`, `EXC-01`, `EXP-01`; update the blueprints Doc 00 §25.2 lists as affected. **The re-baseline authorises no application code**; the `MIG-001`…`MIG-010` migrations each require their own approved task record. `MIG-005` is **ACCEPTED** (`5f78a0b`); `MIG-004` is next and **MAY START** under the conditions in [MIG-005 04-review.md](../03_implementation/tasks/MIG-005/04-review.md); nothing else is started.
- IMP-02: the Turn M-B gate findings (`IMP-02-FIND-010`/`IMP-02-FIND-011`) are closed. Turn M-B is not started, and whether it proceeds is not stated in a single authoritative place. Next work is to be determined by the planner, with a human deciding.
- UI: three Admin areas remain. Planned order, as set by the human at the Phase 2R checkpoint: **2S** Users / Roles / Permissions → **2T** Feature Flags / Configuration → **2U** Audit / Sensitive Access. After 2U the planned authenticated UI build is complete; then a controlled SHADCN CONSISTENCY / UPGRADE AUDIT if still warranted (04_ui `UI-03` §46), then one consolidated Client / Ops / Admin visual QA and remediation pass (04_ui README, Phase 2D/2E program decision). None is started.
- Anything else is not stated in a single authoritative place. A human decides; do not infer it from this file.

## 9. Operating constraints
- **Licence lock (non-negotiable), as restated by `DEC-013` and Doc 00 v1.5:**
  - **Permanent, every environment including local development** — no AIX order book for MB Spot, no MB Spot matching engine, no client-to-client matching/crossing/netting, no market making, no principal dealing, no AIX principal liquidity, no spread markup, no maker/taker fees. **No approval of any scope lifts these** (Doc 00 §6, §7.7, §1.D.4; `LIC-RULE-002`).
  - **Build-unlocked, production-gated** — AIX Exchange (securities domain), AIX RWA securities capabilities, AIX Pay beyond the Doc 00 §5.2 baseline, Model B multi-venue routing, and the unresolved order types. Built and tested now; **production activation fail-closed** (Doc 00 §20, §21; `LIC-RULE-002A`).
  - **Out of scope, no build** — derivatives, futures, margin, leverage, lending, staking, yield, DeFi yield, privacy coins, algorithmic stablecoins, MYR pairs, self-custody wallet service.
  - Unchanged: agency/back-to-back through approved LP; disclosed brokerage fee only; AIX inventory zero; third-party custody; institutional/HNWI only ([PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) §Licence).
  - **The AIX Exchange matching engine (`EXO-01`) is the securities domain only and grants AIX Spot nothing** (`LIC-RULE-005`).
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
| Capability lock classification and code-migration register | [`STR-03`](../05_strategy/AIX_Capability_Lock_Review_v0.1.md) — DRAFT, analysis only; 72 locks classified A–F; `MIG-001`…`MIG-010`; the `assertNoExchangeRuntime`, `securities.token_trading` and `exchange.*` special reviews |
| Platform strategy analysis (no authority over masters) | [05_strategy/](../05_strategy/) — `STR-01` re-baseline analysis and `STR-02` decision pack, both DRAFT. `STR-02`'s `DEC-REQ-A2` → `DEC-011` and its R3/terminology/asset-gate decisions → `DEC-012`; the scope of AIX's Exchange approval, Model C and the R4 securities route remain unapproved |

## 11. Do not load whole (size guard)
`SESSION_START_PROMPT.md` (~3,800 lines), `PROJECT_HANDOVER.md` (~1,270), `04_ui/README.md` (~1,000), `DECISION_LOG.md` (~1,190); `00_..._v1.5.md` (~2,450); `05_Master_Workflow_Map_v1.3.md` (~2,530); `06_Master_System_Rules_v1.3.md` (~2,100); `02_..._v1.3.md` (~2,300). Reference by ID or section; load an excerpt only when a task needs it.
