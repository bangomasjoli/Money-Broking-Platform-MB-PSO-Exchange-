# AIX Full Compliance — instructions for Claude Code

Concise operating rules. They link to the authoritative sources and do not replace them.

## 1. Identity and exclusion
- This repository contains `docs/` (the governance record) and `platform/` (the code). The authoritative remote is `bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-`.
- It is **independently developed software, separate from AIX Investment Group and from any licence or authorisation that entity or any other holds.** Do not state or imply that this repository is, represents or evidences a licensed entity or a regulatory approval. How the software relates to any licensed operator is an open governance decision.
- **Never access `aix-financial-infrastructure-platform`.**

## 2. Authority and reading order
Search and list first. Never load very large files whole (sizes are listed in `CURRENT_STATE.md` §11). Read in this order:
1. [`docs/00_project_state/CURRENT_STATE.md`](docs/00_project_state/CURRENT_STATE.md)
2. [`docs/DOCUMENT_REGISTER.md`](docs/DOCUMENT_REGISTER.md) (the sole authority for document versions)
3. [`docs/OPEN_FINDINGS.md`](docs/OPEN_FINDINGS.md)
4. [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md), by decision ID
5. [`docs/00_project_state/MODULE_STATUS.md`](docs/00_project_state/MODULE_STATUS.md)
6. Then the relevant authoritative masters (`docs/01_masters/`), module records (`docs/02_modules/<MODULE>/`) and task records (`docs/03_implementation/tasks/`).

- **A summary never overrides its authoritative source.** If `CURRENT_STATE.md` or any README disagrees with the register, a decision, a finding row or an acceptance record, the source wins; report the discrepancy.
- **Historical handovers never override later accepted architecture or current implementation evidence.** `PROJECT_HANDOVER.md`, the tail of `SESSION_START_PROMPT.md`, `docs/90_archive/` and the IMP-01 version lists are history, not instructions.

## 3. Architecture boundaries (DEC-011, DEC-012, DEC-013; Doc 00 v1.5; Charter v1.5 §6.3)
Three different classes. Do not collapse them, and do not describe every "locked" item as production-gated.
- **Permanently prohibited, no activation path, every environment including local development:** Money Broking Spot internal client-to-client matching (Model C), an AIX order book or matching engine for MB Spot, crossing or netting clients against each other, proprietary market making, principal dealing, AIX principal liquidity. No approval, flag, permission, environment or future Exchange approval lifts these. MB Spot is external LP routing, agency / back-to-back.
- **Build-authorised, production-gated:** AIX Exchange (securities domain, including its own order book and matching engine in `EXO-01`), AIX RWA securities capabilities, AIX Pay beyond the baseline, Model B routing. Design, implementation and controlled testing are authorised; production activation fails closed. The Exchange engine must never be reachable from an MB-domain module.
- **Out of scope, no build** (Doc 00 v1.5 §20.6 and `DEC-013` clause 6; the prohibitions are listed at §8.1 and §8.2): derivatives, perpetual futures and futures; margin and leveraged trading; lending / borrowing of client assets; staking, yield / earn products and DeFi yield; privacy coins; **algorithmic stablecoins where currently prohibited**; **MYR trading pairs where currently prohibited**; self-custody wallet service. Keep the two "where currently prohibited" qualifications exactly as the master states them; do not widen them into unconditional prohibitions.
- Existing protective guards stay in place. **`assertNoExchangeRuntime` is active and unweakened; `MIG-001` is specified, not authorised.** Do not weaken, bypass, rename or work around any runtime guard, capability gate, seeded lock or sealed hash unless a separately approved task or migration explicitly authorises that exact change.
- `DEC-015` (`STR-04` v0.4) is **NOT_ACCEPTED**. Treat it as a proposal, not as architecture. Round-4 review needs explicit authorisation.

## 4. Status discipline
Never infer, record or write any of the following:
- a blueprint review ACCEPT means the module is implemented or human-accepted;
- an accepted implementation means it is production-ready;
- build authorisation means permission to conduct live regulated Exchange (or any regulated) activity;
- `DEC-015` is accepted;
- a remediation report, or a model's own statement, closes a finding. Closure needs repository evidence (commit and reproduced result).

Do not mark anything IMPLEMENTED from a blueprint, ACCEPTED without explicit, documented human acceptance in the authoritative repository acceptance record (for conductor tasks, `06-acceptance.md` and the `acceptance` object in `task.json`; for older modules, the record under `docs/02_modules/<MODULE>/acceptance/`), or PRODUCTION_READY without evidence. Preserve historical and superseded records; do not rewrite them.

## 5. Work selection and approvals
- No task is active by default. `CURRENT_STATE.md` §5 and §8 state what the repository records as next; **a human decides.** Report options and wait. One module or task per session.
- Human approval is required for: acceptance, merge, push, new migrations, runtime guards and capability gates, architecture decisions, `DECISION_LOG.md` edits, status-vocabulary changes, and changes to `platform/BLUEPRINT_VERSION`.

## 6. Git and branch safety
- Before any change run a read-only preflight: `git rev-parse --show-toplevel`, `git remote get-url origin`, current branch, HEAD, `git status`.
- Never commit directly to `main`. Use a dedicated branch. Never force-push, amend published commits, merge or push without explicit approval.
- **Documentation-only tasks:** you may edit specifically authorised Markdown or documentation files in any directory (for example a README under `platform/`) provided application behaviour is unchanged. Do not touch code, migrations, configuration, grants or lockfiles in a documentation task.

## 7. Nested instructions
`platform/apps/web/CLAUDE.md` (which imports `AGENTS.md`) adds Next.js rules for that directory and does not conflict with this file. UI work also follows [`docs/04_ui/README.md`](docs/04_ui/README.md) and the `aix-ui-design` skill in `.claude/skills/`. Models and working discipline: [`CLAUDE_CODE_USAGE_RULES.md`](docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md).
