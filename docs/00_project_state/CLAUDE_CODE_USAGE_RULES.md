---
document_id: STATE-004
title: AIX Platform — Claude Code Usage Rules
version: N/A
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Model selection / working-discipline rules
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# Claude Code Usage Rules

## Model selection
| Model | Use for |
|---|---|
| **Sonnet** | Normal coding, testing, refactoring, doc editing, mechanical fixes |
| **Opus** | Architecture, security, compliance, and fund-flow review only |
| **Fable** | UX copy, help text, error/notification wording only |

## Working discipline
- **Search/list before opening files.** Do not open files speculatively.
- **Focused diffs only.** Change the minimum; do not rewrite whole packs.
- **One module per session.** Finish, accept, then move on.
- Run **`/compact`** (or start a fresh session) after each module completes.
- On **explicit, documented human acceptance** recorded in the authoritative acceptance record, update [CURRENT_STATE.md](CURRENT_STATE.md), [MODULE_STATUS.md](MODULE_STATUS.md) and [DOCUMENT_REGISTER.md](../DOCUMENT_REGISTER.md). [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) is a historical narrative and is no longer maintained.
- **Do not upload or analyse unrelated files** or deep-scan the whole repository.

## AIX-PAR-001 — one-time two-worktree pilot exception (status controlled in Issue #18)

This section defines a **conditional and time-limited exception for AIX-PAR-001 (GitHub Issue #18)**. Its presence, an approved document header or a successful PR check **does not activate parallel work**. The default is **one controlled repository implementation writer**, with **one task/module per Claude Code session**. The `CLAUDE.md` identity, scope, approval and Git safety rules remain controlling.

**Authoritative pilot state:** The default state is `NOT_ACTIVE`, including after this policy merges. Only a later explicit **project-owner** decision comment in Issue #18 may set `PILOT-START / ACTIVE`; that comment must cite this policy's accepted merge SHA, both task approvals, each lane's owner/branch/base SHA/allowlist, and its effective time. Before **every session start or resume**, verify the latest owner state decision and all activation gates; missing, ambiguous, superseded or conflicting evidence means `NOT_ACTIVE` (no second writer). `STOPPED` applies immediately on a later owner stop decision, the fail-stop conditions below, or automatic expiry under the sunset rule. Record the stop in Issue #18; a stale `ACTIVE` comment never overrides expiry. Once `STOPPED`, this one-time exception cannot be restarted without a separately reviewed and approved policy decision. Issue/PR titles, agent comments and the static heading are **not** activation authority.

**Activation requires all of the following**, recorded by the owner in Issue #18:
1. This documentation-only policy amendment has been independently reviewed, explicitly accepted by the owner and merged to protected `main`.
2. Both task-level implementations have **separate explicit owner approval**: `V2-SHELL-01` (Issue #12) and **only L-1** of `AIX-CI-HARD-001` (Issue #15); each has a named session owner, a clean and verified Git worktree, a fixed branch/base SHA, a path allowlist, and test/acceptance criteria.
3. A **separate explicit owner PILOT-START decision** authorises two concurrent implementation writers for this specific pairing. No other tasks or additional writers are included. Until all gates pass, the default one-writer rule remains in force.

**Exclusive lane ownership during the active pilot:**
- **UI lane:** may create **new files only** under `platform/apps/web/app/v2/**`, `platform/apps/web/components/v2/**` and `platform/apps/web/lib/v2/**`. Existing pages and components stay unchanged. New test paths require a separate explicit allowance before editing.
- **CI lane:** may edit **only** `platform/ci/assert-disposable-database.mjs` and `platform/ci/assert-disposable-database.selftest.mjs` for L-1 contamination detection. No L-2/L-3 work in this pilot slice.
- **Globally excluded from both concurrent writers:** `docs/**`, `CLAUDE.md`, `.claude/**`, `.github/**`, shared package manifests and lockfiles, `platform/apps/web/components.json`, `platform/vitest.config.ts`, shared CSS/tokens, TypeScript configs, existing shadcn primitives, backend services, foundations, migrations, grants, IAM/ledger/custody/settlement controls and runtime/licence guards. No live data, vendor access or regulated activity.
- If a lane needs any shared/excluded file, **STOP that lane** and ask for separate, serialised owner authorisation. No self-expanding allowlists, generated config changes or inter-lane cherry-picks.

**Isolation and incident prevention:**
- Confirm the permitted AIX Full Compliance repository and read its `CLAUDE.md` **before exploratory commands**. Never access the excluded `aix-financial-infrastructure-platform` repository, even read-only. G-1 (Issue #14) remains OPEN.
- Keep separate branch, worktree, process, `node_modules`, build outputs, temporary databases/clusters and developer ports; never share a mutable database, workspace, or test fixture. Inspect each worktree's `git status` and `git worktree list --porcelain` before writing; never auto-stash, reset, clean or overwrite another session's work.
- **Fail-closed changed-path proof:** In **each lane**, before its local commit and again before any approved push/PR, collect `git status --porcelain=v1 --untracked-files=all`, `git diff --name-status --no-renames` (unstaged), `git diff --cached --name-status --no-renames` (staged), `git ls-files --others --exclude-standard` (untracked), and `git diff --name-status --no-renames <approved-base>...HEAD` (already committed). Inspect **every** changed, staged, deleted, renamed, type-changed and untracked path, including exact casing; check tracked-file modes and symlinks. Use NUL-delimited output for automated pathname parsing. All paths must stay inside that lane's **exact** approved allowlist with no symlink/realpath traversal. UI must additionally prove every proposed V2 file **did not exist at its approved base**; CI changes must be confined to its two named files. An unclassifiable, ignored/generated source/config change, unexpected path or unverifiable base is a **STOP**; do not claim a clean allowlist from `git diff` alone. Record the checks and file inventory in the Issue #18 lane ledger.
- **Next.js generated-file rule (PAR-R3):** `platform/apps/web/AGENTS.md` can be regenerated by `next dev` and is an **existing excluded file**, never a UI lane exception. If it or another excluded file becomes dirty, STOP that lane and report the generated change; do not auto-commit, auto-revert, hide it through ignore rules or expand the allowlist. Resolve only through a **separately authorised, serial** change after implementation writers stop.
- Maintain a small lane ledger in Issue #18: task ID, owner, base SHA, branch, permitted paths, relative worktree path, start/stop times, files touched, tests, conflicts, review outcome and local commit. No hidden background writer or unattended task.
- **Only implementation writers may overlap.** Governance record checkpoints, architecture decision writes and acceptance/status/register updates remain a single exclusive writer with **all implementation writers stopped**, as required by `docs/03_implementation/tasks/README.md`.

**Review, integration and sunset:**
- Each lane stops after one focused **local commit** and independent review. Pushing, opening a PR, owner acceptance and merging require their **own explicit authorisations**. Protected `main` uses the required `PR verification result` GitHub Actions check; merge-commit only; merge PRs **one at a time** and revalidate the remaining PR against the new base. CI-path changes require independent control review and an explicit owner decision; a green status alone is insufficient.
- **Immediately STOP both lanes** on path overlap, wrong repository, unauthorized file change, shared DB/test state, unsafe environment, skipped/missing required tests, policy/scope conflict or unauthorized parallel writer. Preserve evidence; do not force-push or discard changes.
- The exception **expires automatically** as soon as both original pilot slices reach their owner disposition (accepted or stopped), or on any earlier owner cancellation or fail-stop event; at that point pilot state is `STOPPED` even if no one has yet posted the stop comment. Record the stop in Issue #18. Revert immediately to the default one-writer policy; further concurrent sessions need a new separately reviewed owner decision. Completing the pilot does not imply permission to deploy or enable a gated capability.

## Guardrails
- Enforce the licence boundary in every review. Authority: [CURRENT_STATE.md](CURRENT_STATE.md) §9, Doc 00 v1.6 and `DEC-012`/`DEC-013` in [DECISION_LOG.md](../DECISION_LOG.md) — not PROJECT_HANDOVER.md, which is historical.
  - **MB Spot:** external LP routing, agency / back-to-back; no internal client-to-client matching, no AIX order book or matching engine for MB Spot, no proprietary market making, no principal dealing — permanent, in every environment.
  - **AIX Exchange (securities) and RWA securities capabilities:** build-authorised, production-gated — architecture, implementation and controlled testing authorised; production activation stays gated; no regulatory approval implied. For these (and only these) "locked" means production activation is closed, not "may not build".
  - **Not production-gated — do not confuse:** the MB Spot prohibitions above are permanent with no activation path, and the out-of-scope items in Doc 00 v1.6 §20.6 (derivatives, futures, margin, lending, staking, yield, privacy coins, algorithmic stablecoins *where currently prohibited*, MYR pairs *where currently prohibited*, self-custody wallet service) have no build authorised (`DEC-013` clauses 5 and 6).
  - **Runtime:** `assertNoExchangeRuntime` stays active; `MIG-001` is specified, not authorised. Never weaken or bypass a runtime guard.
  - **`DEC-015` / `STR-04` v0.4:** NOT_ACCEPTED; not authoritative.
- No code during architecture/security reviews — return gaps, corrections, and parameters only.
