# 01 Plan — AIX-PAR-001

> **Status: NOT_ACCEPTED. Pilot: NOT_ACTIVE.** This is a canonical history record prepared under PAR-N13 Part A. It records the objective, scope and approvals as GitHub and repository evidence show them. It accepts nothing, merges nothing and activates nothing. The policy text described here is **not on `main`**: it exists only on draft PR #19.

## Objective

[Issue #18](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/issues/18) (opened 2026-11-02T19:05:57Z) plans a limited two-worktree implementation pilot to shorten delivery time without weakening existing source, governance and approval controls. The task deliverable is **one documentation-only amendment** to [`CLAUDE_CODE_USAGE_RULES.md`](../../../00_project_state/CLAUDE_CODE_USAGE_RULES.md) (`STATE-004`): a conditional, one-time, time-limited exception to the default rule of one controlled repository writer and one module or task per Claude Code session. It is carried by [draft PR #19](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/pull/19), branch `docs/AIX-PAR-001-limited-policy-amendment`, base `main` `c995e0fc420a09d1437ebfd4e333029871496085`.

Issue #18 §6 requests authority for "a documentation-only task to add a bounded two-worktree exception, without running two writers yet". Actual pilot start is a later, separate owner gate.

## Scope

- **In scope:** the single file `docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md`, as an amendment that stays conditional until separately reviewed, owner-accepted and merged, then needs a further explicit pilot-start decision and task-specific approvals (Issue #18 comment `6586056937`).
- **Proposed lanes (planned, not started):** at most two writers, for `V2-SHELL-01` ([Issue #12](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/issues/12), new V2 paths) and `AIX-CI-HARD-001` L-1 ([Issue #15](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/issues/15), two database-guard files), with exclusive path allowlists (Issue #18 comment `6586120829`).
- **Retained unchanged:** root `CLAUDE.md`; the one-task-per-session rule; the record-checkpoint exclusivity in [tasks/README.md](../README.md).

## Exclusions

Activating parallel implementers; application code, migrations, CI workflow or dependency changes; branch-ruleset changes; closing `G-1` (Issue #14); accepting the policy; merging PR #19; creating worktrees for lanes; starting `V2-SHELL-01` or `AIX-CI-HARD-001`; any access to the excluded repository `aix-financial-infrastructure-platform`.

## Risk

HIGH (proposed in this record; no preserved source assigns a conductor risk class). The amendment governs concurrency, Git write authority and activation of a second writer.

## Approval history (sources)

All Issue #18 and PR #19 comments in this record's period were posted through the `chatgpt-codex-connector` GitHub app, so none is browser-posted owner text. Each is an agent-authored account of an owner approval. **SESSION-RELAYED** means the approval is known only from the implementer's or the preparation session's own account of an owner instruction; no GitHub or repository text records it.

| Date (Asia/Kuching) | Approval | Source | Status |
|---|---|---|---|
| 2026-11-03 | Prepare the policy amendment for independent review only (documentation-only) | Issue #18 comment `6586056937` | On GitHub (agent-authored) |
| 2026-11-03 | Focused remediation of PAR-R1/R2/R3 | Issue #18 comment `6597306329`; PR #19 comment `6597305039` | On GitHub (agent-authored) |
| 2026-11-03 | Seven-finding remediation PAR-N1 to N7, with personally browser-posted state decisions chosen as the activation authority | PR #19 comment `6599435405`; Issue #18 comment `6599437004` | On GitHub (agent-authored) |
| 2026-11-03 | One final correction for PAR-N8 to N11, then exact-head CI and diff-focused re-review | PR #19 comment `6600328132`; Issue #18 comment `6600329893` | On GitHub (agent-authored) |
| 2026-11-11 | Commits `09ad3bf` (PAR-N12) and `9bf8312` (PAR-N14, PAR-INFO-1, PAR-INFO-2) and their pushes | Branch heads existed with CI runs `42947546484` and `42969611159` | **NOT PRESERVED** (neither on GitHub nor in the repository) |
| 2026-11-23 | Commit `10f63bba` (PAR-N15 to N17, with owner-authorised O1 and O6): local commit, then push | Preserved implementer evidence draft (`04-review-r6.md`, `05-remediation-r6.md`); CI run `45129087716` | **SESSION-RELAYED** (no GitHub record) |
| 2026-11-23 | Commit `2eb8e14f` (PAR-N18 to N21 and acceptance-head binding, with the pinned-fetch extension): local commit, then an explicit written push authorisation | Preserved implementer evidence draft, Addenda A and B; CI run `45151125787` | **SESSION-RELAYED** (no GitHub record) |
| 2026-11-23 | PAR-N13 Part A preparation only (no commit, push or PR) | Owner instruction in the preparation session | **SESSION-RELAYED** (not on GitHub) |

No source preserved in the repository or on GitHub records owner policy acceptance, Ready-for-Review, merge or pilot activation.

## Acceptance criteria (contract)

1. Independent fresh-context review of the exact head, then explicit, documented human acceptance recorded in the authoritative acceptance record (`06-acceptance.md` and the `task.json` acceptance object), per root `CLAUDE.md` §4. **A decision comment on Issue #18 alone does not satisfy this.**
2. The accepted PR head is bound by `accepted_head_sha` as drafted in the policy (candidate value only: `2eb8e14ffcaeed76cf37835399346375ee38ea26`, not yet a recorded owner acceptance). The proposed two-part acceptance process (decision comment before merge, canonical record after merge) is in [03-evidence.md](03-evidence.md) and [OPEN_FINDINGS.md](../../../OPEN_FINDINGS.md) `PAR-N27`; it is a **proposal**, not an accepted decision.
3. Merge of PR #19 with a merge commit whose second parent equals `accepted_head_sha`, then the post-merge binding checks.
4. Separately: owner-posted `AIX-PAR-001 STATE: ACTIVE` comment, `UI` and `CI` task approvals and an explicit pilot-start decision. None exists.

## Related records (not part of this task)

- [Issue #10](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/issues/10) `AIX-ACCEL-001`: staged acceleration plan, **PLANNING / NOT_ACCEPTED**.
- [Issue #12](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/issues/12) `AIX-UI-V2-001` and its first implementation `V2-SHELL-01`: **planned, not implemented, not started**; no branch or code exists.
- [Issue #15](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/issues/15) `AIX-CI-HARD-001` (L-1 to L-3): **open, not started**.
- [Issue #17](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/issues/17) `AIX-CI-GATE-001`: the required `PR verification result` check is configured and read back (see [AIX-CI-001 acceptance](../AIX-CI-001/06-acceptance.md)); the issue's own completion checklist is still unticked on GitHub.
- [Issue #14](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/issues/14) `G-1` incident: **OPEN** (`GOV-FIND-001`).
- [AIX-CI-001](../AIX-CI-001/): **ACCEPTED as a CI pilot only** (2026-11-03), carried-forward findings OPEN.
