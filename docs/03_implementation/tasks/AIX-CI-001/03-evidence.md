# 03 Evidence — AIX-CI-001

> Evidence cross-checked through the connected GitHub repository and hosted-run logs; local implementation/reviewer scratch outcomes remain attributed to their respective reports.

- **Collected:** 2026-11-02T18:30:55.560Z
- **Original implementation baseline:** `dd730962860d9e3e1e2469b37b4303b57d9f865c`
- **Reviewed implementation commit:** `f35ae84bf738dca61a9e53874e983dd85c56dcf9`
- **Merge commit and verified protected `main` HEAD:** `54a4ee231f0446467cf6df146a69512b0afa9869`
- **Merged PR:** [#13](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/pull/13)
- **Hosted run:** [#41497209788](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/actions/runs/41497209788)
- **Remote verification:** merged PR, two-parent merge commit and protected main HEAD verified; local worktree cleanliness is **implementer/reviewer-reported**, not remotely independently observable.

## Verified hosted checks

| Check | Observed outcome | Evidence |
|---|---|---|
| Static and frontend | SUCCESS | Hosted job `A. Static and frontend checks` |
| Unit | **137 files, 2705 tests passed, 0 failed, 0 skipped** | Hosted unit job `VERIFIED` and JSON artifact `unit-test-report` ID `13167455955` |
| PostgreSQL migration-072 | **5 passed, 0 failed, 0 skipped** | Hosted PG16.15 job `VERIFIED`, JSON artifact `pg-migration-072-report` ID `13167625646` |
| Database guard | PASSED on ephemeral loopback `aix_ci`, PostgreSQL **16.15** | Hosted PostgreSQL job log |
| Verifier and guard controls | SUCCESS | Hosted `CI verifier self-test (negative controls)` job |
| Final aggregate | SUCCESS; all four prerequisites exactly `success` | Hosted `PR verification result` job log |

No tests outside this pilot's focused suites are claimed as hosted verified. The independent Opus review report, supplied by the owner in chat, reports 20 self-test passes and independent negative-control reproduction; these are not represented as submitted GitHub PR reviews.

## Verified diff and merge

- `dd730962... → f35ae84bf738dca61a9e53874e983dd85c56dcf9`: exactly **one implementation commit**, **five added files**, **753 insertions, zero deletions**.
- PR #13 was merged with two-parent merge commit `54a4ee231f0446467cf6df146a69512b0afa9869`:
  1. `dd730962860d9e3e1e2469b37b4303b57d9f865c`
  2. `f35ae84bf738dca61a9e53874e983dd85c56dcf9`
- `main` points to merge commit `54a4ee231f0446467cf6df146a69512b0afa9869` at evidence collection.
- No changes to existing tests, migrations, grants, runtime/permission code, licence guards or UI in the implementation diff.

## Open controls

- GitHub ruleset `AIX Main Branch Protection` (ID `26356065`) is enforced for default branch but currently has **no required-status-check rule**.
- `PR verification result` is the exact successful GitHub Actions check name observed on the implementation head.
- G-1 issue [#14](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/issues/14) remains OPEN.
- L-1/L-2/L-3 hardening issue [#15](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/issues/15) remains OPEN.
