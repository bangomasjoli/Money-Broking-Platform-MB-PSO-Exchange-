# 04 Review — AIX-PAR-001 (round 4: UNRECOVERED; existence INFERRED)

> **This file records a gap, not a review.** No review report for this round survives in the repository, on GitHub or in the preserved evidence. Nothing below is a reviewer's statement.

- **Source class:** NOT PRESERVED. The existence of a distinct review round is **INFERRED** only (see "Why a round is recorded").
- **Reviewed commit (inferred):** `a9ea48f40da40bac135d399bfa83946bbb5d1fbd` (CI run `41613455360` success), the PR head when the next remediation was committed.
- **Reviewer / model / effort:** UNVERIFIED
- **Decision / verdict:** UNVERIFIED
- **Human approval required:** true

## Why a round is recorded
- PR #19 comment [`6600348964`](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/pull/19#issuecomment-6600348964) is a **prompt** for a diff-focused Opus review of `a9ea48f`. It is a handoff, not a verdict, and does not show that a review took place.
- Commit `09ad3bfd7e6aee04674f2d7a163f2dd9d1201f64` (2026-11-11) fixes a finding named `PAR-N12`. No preserved source says who raised it.
- Whether this round and [04-review-r5.md](04-review-r5.md) were two sessions or one cannot be determined. They are counted separately because two sequential remediation commits name different findings against different heads; the owner may merge them if that is wrong.

## Finding named by the remediation commit (reviewer and severity not preserved)
| ID | Severity | Category | Description (as the commit message states it) | Evidence | Recommended action |
|---|---|---|---|---|---|
| PAR-N12 | not preserved | Path evidence | Git evidence commands depended on the current directory: `ls-tree`, `ls-files --others` and `ls-files -v` could silently omit paths or flags when run from a subdirectory | commit `09ad3bf` message | Run every command as `git -C <verified-worktree-root>`; use `ls-tree --full-tree` |

## Identifier note
`PAR-N13` is **not defined by any preserved source**. It sits between `PAR-N12` (this round) and `PAR-N14` ([round 5](04-review-r5.md)); the preserved implementer drafts use it for canonical-record reconciliation. Which round, if any, raised it is **UNVERIFIED**.

## Escalation decision
none

## Rationale
Preserved as an explicit gap so that no report, reviewer or verdict is invented. Remediation: [05-remediation-r4.md](05-remediation-r4.md).
