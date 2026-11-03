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

## AIX-PAR-001 — one-time two-worktree pilot exception (conditional; state in Issue #18)

This is a **time-limited, one-time proposal for AIX-PAR-001** (Issue #18). Merely merging this text, seeing `document_status: APPROVED`, or passing CI **does not permit concurrent implementation**. The default remains one controlled repository writer and **one module/task per Claude Code session**. All `CLAUDE.md` repository, product-scope, approval and Git protections remain in force. `NOT_ACTIVE`, `ACTIVE`, `LANE_PAUSED` and `STOPPED` are *pilot-control labels only*, not module/task status-vocabulary changes.

### Owner authentication and authoritative state — PAR-N1

- **Default `NOT_ACTIVE`:** no two-writer permission, including after this policy is accepted or merged. Two-writer activation requires all three independent gates below.
- **Only the project owner personally using the GitHub browser UI** may create an authoritative pilot state comment in **Issue #18**. A connected agent using the same GitHub account must **never** post a state-token comment, even if quoting the owner or writing on their behalf; agent-authored ledger, review and issue comments are not activation authority. GitHub username/account ownership **alone is insufficient proof** of personal authorship.
- The owner's new comment must begin with **exactly** `AIX-PAR-001 STATE: ACTIVE` or `AIX-PAR-001 STATE: STOPPED`, followed by explicit `policy_merge_sha`, `ui_approval_ref`, `ci_approval_ref`, `ui_owner`, `ui_branch`, `ui_base_sha`, `ui_allowlist`, `ci_owner`, `ci_branch`, `ci_base_sha`, `ci_allowlist`, `effective_at_utc`, `expires_at_utc` and a reason. No agent post may start with `AIX-PAR-001 STATE:`; no lane ledger comment may use that prefix. **The owner must separately confirm the exact state comment ID inside the supervised session at every session start/resume**, and the reviewer/agent must verify that comment and all listed approvals. Without this human confirmation, do not activate or resume, even if the author is the owner account. This is procedural corroboration, **not cryptographic proof**.
- If a cited owner state comment is deleted, edited (GitHub `updated_at` differs from `created_at`), inaccessible, has incorrect/missing fields, was not personally confirmed, is contradicted by a later authentic STOPPED decision, or its effective/expiry time does not permit work, **fail closed to `NOT_ACTIVE` or `STOPPED`** as applicable. A stale ACTIVE never overrides STOPPED/expiry. Ambiguous chronology or authenticity means no concurrent work. An agent cannot change any state through a comment or a local file.
- **Pilot `STOPPED` is terminal for this one-time exception.** A separate reviewed and approved policy is needed before any later two-writer session; a new ACTIVE comment alone cannot restart it.

### Activation gates (all required)

1. This exact documentation amendment is independently reviewed, human-accepted and **merged** to protected `main`, with the merge SHA recorded in the owner state comment. No acceptance or merge is inferred from this draft.
2. **Separate owner implementation approvals** exist for UI `V2-SHELL-01` (#12) and CI `AIX-CI-HARD-001` **L-1 only** (#15). Each approval identifies session owner, assigned branch, approved base SHA, exact path allowlist, test criteria and isolated worktree relative path. Before any implementation/dev command (including `next dev`), each lane must read the accepted pilot policy **at its merged SHA**, after first confirming the authorised repository and reading root `CLAUDE.md`.
3. A later, separate owner-posted, personally confirmed `AIX-PAR-001 STATE: ACTIVE` comment authorises **only these two named lanes**, states an exact UTC start and UTC deadline, and expires **no later than 72 hours after activation**. No third writer, no unattended session and no overlap with documentation checkpoint writers.

### Exclusive file and worktree ownership

- **UI lane — NEW files only:** `platform/apps/web/app/v2/**`, `platform/apps/web/components/v2/**`, `platform/apps/web/lib/v2/**`. New test files require separate explicit scope approval; no editing existing pages, shared UI primitives, styles, config or shadcn-generated defaults.
- **CI lane — exactly two existing files:** `platform/ci/assert-disposable-database.mjs` and `platform/ci/assert-disposable-database.selftest.mjs`. L-2/L-3, workflow and migration changes are excluded.
- **NO-WRITE for both implementation lanes:** `docs/**`, `CLAUDE.md`, `.claude/**`, `.github/**`, packages/lockfiles, `platform/apps/web/AGENTS.md`, `components.json`, shared CSS/tokens, TypeScript configs, existing shadcn primitives, backend, security/custody/ledger/settlement, migrations, grants, runtime and licence controls. No API/live customer funds, real database, production integration, or regulated operation.
- Both worktrees must be **inside one explicitly designated AIX Full Compliance workspace root**, not a sibling-repository directory. The sole supervised operator creates/removes worktrees **serially before/after** the active pilot, after verifying a clean root, repository remote, worktree paths, branch/base SHAs and `git worktree list --porcelain`. Lane agents must not run `git worktree add/remove/prune`, `git stash`, or access neighbouring repositories. **Never access `aix-financial-infrastructure-platform`, including read-only.** The G-1 incident (#14) remains OPEN.
- Linked worktrees share Git common state. **No agent-initiated writes** to common `config`, hooks, `info/exclude`, attributes, remotes, stash or refs outside its assigned branch; no reconfiguration of ignore rules. Git's normal object/reflog writes and updates of **its own assigned branch ref during an expressly authorised local commit** are the only allowed shared Git housekeeping. No branch switches, force-pushes or rewrites.
- Separate processes, worktree build outputs, `node_modules`, temporary databases/clusters and developer ports. No shared mutable test fixtures, environment configuration or generated source files. If isolation cannot be proved, STOP the pilot.

### Required fail-closed file evidence — PAR-N3/PAR-N4/PAR-N5

Before **each local commit**, and again before any separately authorised push or PR, record the following per-lane proof against the **currently owner-approved base SHA**, from that lane's correct worktree (all path-output parsers must handle `-z`/NUL delimiters, with no word-splitting):

- Confirm branch, origin, worktree root and base; run `git cat-file -e <approved-base>^{commit}` and `git merge-base --is-ancestor <approved-base> HEAD`. If either fails, STOP; never silently substitute a new base SHA.
- Capture `git status --porcelain=v1 -z --untracked-files=all --ignored=matching`, `git diff --raw -z --no-renames`, `git diff --cached --raw -z --no-renames`, `git ls-files --others --exclude-standard -z`, `git ls-files -v` and `git diff --raw -z --no-renames <approved-base>...HEAD`. Check `h` (assume-unchanged) and `S` (skip-worktree) flags; a hidden tracked change or unexpected flag requires STOP.
- Inspect **all tracked, staged, unstaged, untracked, renamed, deleted, type-changed and ignored paths** with case-sensitive matching and raw modes; reject symlinks (Git mode `120000`), path traversal, unmatched paths and unapproved hidden changes. Ignored `node_modules` or build output is permissible **only** under a specific preapproved per-lane output inventory, never as permission to modify ignored source, credentials, env/config or other shared files. If an ignored path cannot be classified safely, STOP.
- Every UI file proposed must be new at approved base: verify `git cat-file -e <approved-base>:<repo-relative-path>` **fails because that path is absent**, after independently confirming the base is valid; reject any other error. CI changed paths must match the two exact filenames. No gitignore exclusion or automatic cleaning may conceal exceptions.
- **Generated `AGENTS.md` rule (PAR-N7):** the nested `platform/apps/web/AGENTS.md` instruction to commit its `next dev` regenerated block **does not authorise a concurrent UI writer to commit it**. Because that file is excluded, a dirty `AGENTS.md` or other unexpected generated file is `LANE_PAUSED` at minimum: report it without auto-commit, auto-revert, ignore, reset, clean or expanding the allowlist. Resolve, if authorised, in a separate exclusive governance/implementation window when both implementation sessions are stopped.
- Record command outcomes, changed-path inventory, base ancestry result, allowed ignored outputs and exceptions in the Issue #18 lane ledger. Agent ledger comments are **informational only** and may never use the state-decision prefix.

### Pause, resumption, integration and automatic sunset — PAR-N2/PAR-N3/PAR-N6

- **`LANE_PAUSED` (recoverable, not pilot STOPPED):** before any unapproved edit/commit, if one worktree has a generated excluded file (e.g. `AGENTS.md`), needs a shared-file change, or has a remediable **isolated** unclear file inventory, immediately stop **that lane** and record why. The other lane may continue only if the supervising operator verifies that the issue is confined to the paused worktree and shared Git/DB state is unaffected. No edits to fix it during parallel writing. To resume, the **owner personally posts** a new Issue #18 comment starting with exactly `AIX-PAR-001 LANE-RESUME: UI` or `AIX-PAR-001 LANE-RESUME: CI`, identifying the original ACTIVE comment ID, paused lane, reason, corrective serial-work approval/evidence and current branch/base; agent ledger comments may not use this prefix. The supervising human confirms the exact RESUME comment ID in-session. Recheck the original unedited/unexpired ACTIVE decision and every gate. A resume does not extend expiry or restart STOPPED.
- **`STOPPED` (terminal for this pilot):** immediately stop **both** writers for a wrong/excluded repository access, actual forbidden file write/commit, overlapping ownership, shared Git/DB mutation, unapproved writer, scope/guard breach, failure of containment, missed deadline, owner cancellation, or another material safety violation. The state is STOPPED **even if no STOPPED comment has been posted yet**; owner should personally post the STOPPED token promptly, and the ledger may record the incident without pretending to be state authority. No further implementation work under this exception.
- The pilot also **expires automatically** when **both original slices** reach their owner disposition (accepted or stopped), or at the exact `expires_at_utc` in the approved ACTIVE comment, **whichever happens first**, never beyond 72 hours from activation. There is no implicit extension or new branch pairing. A paused lane whose expiry arrives becomes STOPPED, not resumable.
- Each lane stops at one focused **local commit** plus independent review; explicit, separate owner authorisations remain mandatory for push, PR, acceptance and merge. `PR verification result` must succeed at the current head, but **green CI is not independent approval**. CI guard changes require an independent control review. Only **one merge-commit PR merge at a time**. Following the first merge, STOP the remaining lane's integration until the owner records a **new approved-base SHA** in Issue #18 and separately approves a **non-rewriting merge commit** bringing updated protected `main` into that task branch. Rerun ancestry checks, all changed-path checks with `git diff --raw -z --no-renames <new-base>...HEAD`, and current-head required CI before any further push/merge; no silent rebase/force push or informal base swap.
- **Governance record checkpoints are exclusive** and run only with both implementation writers stopped, as specified in `docs/03_implementation/tasks/README.md`. Any status, register, decision or master change requires its own approval and serial checkpoint. No implementation writer may write `docs/**` during the pilot.
- The policy reverts to the **default one-writer rule immediately** at STOPPED or expiry. Restarting concurrency requires a newly reviewed and approved exception. This pilot does not confer deployment, regulatory, licence or production readiness permission.

## Guardrails
- Enforce the licence boundary in every review. Authority: [CURRENT_STATE.md](CURRENT_STATE.md) §9, Doc 00 v1.6 and `DEC-012`/`DEC-013` in [DECISION_LOG.md](../DECISION_LOG.md) — not PROJECT_HANDOVER.md, which is historical.
  - **MB Spot:** external LP routing, agency / back-to-back; no internal client-to-client matching, no AIX order book or matching engine for MB Spot, no proprietary market making, no principal dealing — permanent, in every environment.
  - **AIX Exchange (securities) and RWA securities capabilities:** build-authorised, production-gated — architecture, implementation and controlled testing authorised; production activation stays gated; no regulatory approval implied. For these (and only these) "locked" means production activation is closed, not "may not build".
  - **Not production-gated — do not confuse:** the MB Spot prohibitions above are permanent with no activation path, and the out-of-scope items in Doc 00 v1.6 §20.6 (derivatives, futures, margin, lending, staking, yield, privacy coins, algorithmic stablecoins *where currently prohibited*, MYR pairs *where currently prohibited*, self-custody wallet service) have no build authorised (`DEC-013` clauses 5 and 6).
  - **Runtime:** `assertNoExchangeRuntime` stays active; `MIG-001` is specified, not authorised. Never weaken or bypass a runtime guard.
  - **`DEC-015` / `STR-04` v0.4:** NOT_ACCEPTED; not authoritative.
- No code during architecture/security reviews — return gaps, corrections, and parameters only.
