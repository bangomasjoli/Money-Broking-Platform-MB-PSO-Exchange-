# 02 Implementation Report — AIX-PAR-001

> **This records what the implementers' commits and messages say. It does not prove correctness.** Evidence is in [03-evidence.md](03-evidence.md); review is in `04-review*.md`. **Status: policy merged at `2655850`; acceptance in [06-acceptance.md](06-acceptance.md), effective once on protected `main`. Pilot: NOT_ACTIVE.** *(Part A: "Status: NOT_ACCEPTED".)*

- **Implementation model / effort:** see "Implementer model" below; effort not recorded.
- **Round:** 1 plus remediation rounds 1 to 7 ([05-remediation.md](05-remediation.md) to [05-remediation-r7.md](05-remediation-r7.md)).
- **Baseline:** `main` `c995e0fc420a09d1437ebfd4e333029871496085`.
- **Resulting head (PR #19):** `2eb8e14ffcaeed76cf37835399346375ee38ea26`, merged into protected `main` by `26558507055533dcf439eaf8cf44f9a31c6631a9` on 2026-11-25. Nine commits, one changed file in every commit: `docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md`; PR total +48/−0.
- **Commit author names (VERIFIED):** commits 1 to 5 are authored as "Mohd Aiman Rahimi", commits 6 to 9 as "AimanRahimi". The differing Git author configuration supports, but does not prove, the use of different tooling (finding N-4).
- **Implementer model:** recorded only by the `Co-Authored-By: Claude Sonnet 5.5` trailer on commits 6 to 9. Commits 1 to 5 carry no model trailer, and no preserved source names the model or tool that wrote them. The GitHub comments describing them were posted through the `chatgpt-codex-connector` app, which suggests but does not prove that connector's involvement. **UNVERIFIED; none is inferred here.**
- **Conductor execution records:** none exist (`planner`, `implementer` and `reviewer` are `null` in `task.json`).

## Commit chain (source: `git log c995e0f..2eb8e14`)

| # | Commit | Committed (Asia/Kuching) | Lines | Stated purpose (commit message or GitHub account) | Findings addressed |
|---|---|---|---|---|---|
| 1 | `4145be830d886cfaf5dd0b237a9e3b342a6e32e7` | 2026-11-03 03:12:46 | +26/−0 | propose conditional two-worktree pilot exception | initial draft |
| 2 | `b206e7e130123d9f25382e37c51a8df543e83486` | 2026-11-03 03:13:34 | +10/−10 | correct policy draft Markdown formatting | none |
| 3 | `b157716f3c6ce8b2e7ff2b38bd71968611a4b0e0` | 2026-11-03 14:45:31 | +7/−3 | remediate activation and path safety findings | PAR-R1, PAR-R2, PAR-R3 |
| 4 | `868f18bc163cf9b4622bfe79f8c683f474ab56ca` | 2026-11-03 16:56:07 | +46/−29 | clarify owner authority and worktree safety | PAR-N1 to PAR-N7 |
| 5 | `a9ea48f40da40bac135d399bfa83946bbb5d1fbd` | 2026-11-03 17:44:12 | +11/−11 | clarify N8-N11 pilot controls | PAR-N8 to PAR-N11 |
| 6 | `09ad3bfd7e6aee04674f2d7a163f2dd9d1201f64` | 2026-11-11 10:39:35 | +3/−3 | fix PAR-N12 worktree-root evidence commands | PAR-N12 |
| 7 | `9bf831246ed5d60c1a47f6df41b84fea759e1603` | 2026-11-11 12:09:02 | +6/−6 | harden Git evidence environment | PAR-N14, PAR-INFO-1, PAR-INFO-2 |
| 8 | `10f63bba87263245bc230ecb59c559c1ddfa411e` | 2026-11-23 14:58:45 | +5/−5 | remediate PAR-N15/N16/N17 Git evidence controls | PAR-N15, PAR-N16, PAR-N17, O1, O6 |
| 9 | `2eb8e14ffcaeed76cf37835399346375ee38ea26` | 2026-11-23 16:49:39 | +5/−4 | harden ancestry, push and acceptance binding | PAR-N18, PAR-N19, PAR-N20, PAR-N21, acceptance-head binding |

Commit 9 also extends the pinned operator `fetch` with `--no-replace-objects -c core.commitGraph=false`. The commit message states this fetch extension was owner-authorised; the authorisation text is not preserved (see [01-plan.md](01-plan.md)).

## What the amendment does (from commit messages; not independently re-verified here)

- Adds a conditional, one-time, time-limited exception that is `NOT_ACTIVE` by default: no two-writer permission even after the text is accepted or merged. Activation needs an accepted and merged policy, separately approved task lanes and an owner-personally-posted `AIX-PAR-001 STATE: ACTIVE` comment in Issue #18 that the owner reconfirms in session (commits 3, 4, 5).
- Adds Git-evidence hardening: verified worktree root (N12), clean environment and fixed wrapper (N14), approved-base format (PAR-INFO-1), legacy `info/grafts` neutralisation (N15), pinned push with a remote identity gate (N16), `policy_merge_sha` format and authority (N17), version gate (N18), commit-graph and object-integrity gates (N19), history-rewrite protection (N20), pre-push hook handling and full remote-ref comparison (N21), and acceptance-head binding.
- Commit messages for commits 6 to 9 state: "Documentation only; no lane boundary, file-mode rule, approval authority, expiry or permission widened" and "NOT_ACCEPTED; AIX-PAR-001 remains NOT_ACTIVE".

## Known issues and carried items

See [04-review-r8.md](04-review-r8.md) (open findings `PAR-N22` to `PAR-N28`, `PAR-INFO-c`, `-d`, `-e`, `-f`, `-3`), `PAR-N13` (this canonical-record gap), `PAR-O2` to `PAR-O5` (round-6 observations) and `PAR-N29` (action attribution) in [OPEN_FINDINGS.md](../../../OPEN_FINDINGS.md).

---

## Status addendum, 2026-11-28 (AIX-PAR-003)

The owner withdrew the AIX-PAR-001 pilot on 2026-11-28 (Issue #18 comment `7235586939`). Nothing above is rewritten: the policy-text acceptance in [06-acceptance.md](06-acceptance.md) is historical, the pilot was never activated, and no finding is closed or waived. Record of the withdrawal: [../AIX-PAR-003/02-implementation-report.md](../AIX-PAR-003/02-implementation-report.md).
