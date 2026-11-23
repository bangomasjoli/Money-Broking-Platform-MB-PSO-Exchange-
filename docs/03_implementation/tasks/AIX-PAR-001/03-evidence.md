# 03 Evidence — AIX-PAR-001

> Independent facts read from Git and GitHub on 2026-11-23, plus clearly labelled secondary sources. **A passing CI run is not evidence that the policy text is correct, reviewed or accepted.** **Status: NOT_ACCEPTED. Pilot: NOT_ACTIVE.** Classification: **VERIFIED** = read from Git or the GitHub API in this checkpoint; **SECONDARY** = taken from a preserved implementer draft or reconstructed report; **NOT PRESERVED** = no source survives.

## 1. Repository and PR state (VERIFIED, 2026-11-23)

| Item | Value |
|---|---|
| Protected `main` | `c995e0fc420a09d1437ebfd4e333029871496085` (`git ls-remote`) |
| Draft PR #19 head | `2eb8e14ffcaeed76cf37835399346375ee38ea26` (`refs/pull/19/head` and REST `head.sha`) |
| PR #19 state | open, draft, not merged; 9 commits; 1 file; +48/−0; base `main` `c995e0f` |
| GitHub PR reviews on PR #19 | 0 |
| Issue #18 / PR #19 comments | 8 / 11; the newest on each was posted 2026-11-03; every one carries `performed_via_github_app` slug `chatgpt-codex-connector` |
| Owner `AIX-PAR-001 STATE:` comments on Issue #18 | none |
| `main` ruleset (ID `26356065`) | deletion and non-fast-forward blocked; pull request required with 0 required approvals; required check `PR verification result` (GitHub Actions, integration 15368) with strict/up-to-date `true`; allowed merge method `merge` only. Rules for sample non-default branch names returned none (lane branches have no server-side rule). Ruleset bypass actors are not visible anonymously: **UNVERIFIED** |

## 2. Commits

The nine-commit chain, dates, line counts and trailers are in [02-implementation-report.md](02-implementation-report.md) (VERIFIED from `git log`/`git show`). Commits 1 to 5 carry no model trailer; commits 6 to 9 carry `Co-Authored-By: Claude Sonnet 5.5`.

## 3. CI runs on branch `docs/AIX-PAR-001-limited-policy-amendment` (VERIFIED: run list read from the Actions API)

All eight runs: workflow `AIX CI PR`, event `pull_request`, attempt 1, conclusion `success`. Commit `4145be83` has no run of its own (the first run is at `b206e7e1`).

| Run ID | Head | Created (UTC) | Job-level read-back |
|---|---|---|---|
| `41508081537` | `b206e7e1` | 2026-11-02T19:14:28Z | five jobs success, per PR #19 comment `6597200492` (SECONDARY) |
| `41591926990` | `b157716f` | 2026-11-03T06:45:41Z | five jobs success, per PR #19 comment `6597316810` (SECONDARY) |
| `41607007072` | `868f18bc` | 2026-11-03T08:56:17Z | five jobs success, per PR #19 comment `6599455491` (SECONDARY) |
| `41613455360` | `a9ea48f4` | 2026-11-03T09:44:22Z | five jobs success, per PR #19 comment `6600358176` (SECONDARY) |
| `42947546484` | `09ad3bfd` | 2026-11-11T02:39:48Z | run conclusion only |
| `42969611159` | `9bf83124` | 2026-11-11T06:02:07Z | run conclusion only |
| `45129087716` | `10f63bba` | 2026-11-23T07:09:44Z | five check-runs success (VERIFIED) |
| `45151125787` | `2eb8e14f` | 2026-11-23T09:53:50Z | five jobs success (VERIFIED), table below |

Run `45151125787` jobs: `A. Static and frontend checks` (137612484944), `B. Unit tests (tests/unit, no database)` (137612485116), `C. PostgreSQL 16 regression (iam2-migration-072)` (137612485180), `CI verifier self-test (negative controls)` (137612485225), `PR verification result` (137613005794), all `completed` / `success`.

## 4. Operator push of `2eb8e14f` (SECONDARY: implementer evidence draft, Addendum B; refs re-verified in this checkpoint)

On 2026-11-23, after fresh gates (a) to (f) and the remote identity gate, an owner-authorised fast-forward push `10f63bba..2eb8e14f` was made to the PR #19 branch. The full 28-reference remote list before and after differed in exactly three references: the lane branch, `refs/pull/19/head` and `refs/pull/19/merge` (the last two refreshed by GitHub about a minute after the push). The local configuration was byte-identical. An earlier push attempt that day was denied by the permission system and changed nothing. The push on `2eb8e14f` is the only push evidenced here with its operator output; earlier pushes (commits 6 to 8) are evidenced only by the existence of CI runs at those heads and by the preserved N15 to N17 draft. The remote state after the push (head `2eb8e14f`) is VERIFIED above.

## 5. Evidence that could not be recovered (NOT PRESERVED)

| Missing | Consequence |
|---|---|
| Any report for the rounds that raised `PAR-N12` (round 4) and `PAR-N14`, `PAR-INFO-1`, `PAR-INFO-2` (round 5), 2026-11-11 period | Findings are named only in commit messages (commits 6 and 7). Whether these were two review sessions is **INFERRED**; reviewer, model and verdict are **UNVERIFIED** (see [04-review-r4.md](04-review-r4.md), [04-review-r5.md](04-review-r5.md)). |
| The definition and origin of `PAR-N13` | No source on GitHub or in the repository defines it; the preserved drafts use it for canonical-record reconciliation. |
| Full text of the 2026-11-23 reviews of `9bf8312` (round 6) and `10f63bba` (round 7) | Known only through the implementer's drafts (SECONDARY). |
| Owner authorisation text for commits 6 and 7 and for the 2026-11-23 commits and pushes | Not on GitHub; relayed in session only. |
| The 2026-11-11 evidence record(s) and test fixtures for `PAR-N12` and `PAR-N14` | Surviving files are empty scratch directories. |
| An execution ID or GitHub-submitted review for any review round | None exists; all reviews were supplied by the owner or reported by the reviewer. |

## 6. Preserved private evidence archive (outside the repository)

On 2026-11-23, surviving temporary evidence was copied, unmodified, to a private owner-held directory outside the repository (96 files, with a SHA-256 manifest). It includes the N15 to N17 and N18 to N21 implementer drafts and patches, scratch reproduction scripts and outputs, the GitHub issue and comment snapshots, the push logs, and a reconstruction of the delta review and PAR-N13 plan from the transcript. Secrets and excluded-repository material were scanned for; none found (the excluded repository's name appears only in policy and incident text). Absolute locations are deliberately not recorded in this repository. The archive is **not** a canonical record.

## 7. Proposed acceptance sequencing (PROPOSAL; D1 in the PAR-N13 plan; not an owner decision)

**Circularity (VERIFIED from the `main` ruleset above and the drafted binding):** an acceptance record cannot be committed to PR #19 because that changes the head it records; merging a records PR to `main` before PR #19 makes PR #19 out of date (strict check), forcing a branch update and a new head, which voids the acceptance.

**Proposal (two-part acceptance):**
1. Part A (this PAR-N13 checkpoint): history, registers and state, NOT_ACCEPTED; **never merged before PR #19**.
2. Before the merge: the owner personally posts, in the browser on Issue #18, a decision comment (not beginning `AIX-PAR-001 STATE:`) recording `accepted_head_sha`, scope, evidence and carry-forwards; origin read back via REST (`performed_via_github_app` null, not edited) and the comment ID confirmed in session. On its own this does not satisfy root `CLAUDE.md` §4.
3. Merge freeze, then separately authorised Ready-for-Review and merge of PR #19 (merge commit; head equal to `accepted_head_sha`), then the post-merge binding checks.
4. Part B: bring `main` into the records branch with a normal merge, add `06-acceptance.md` and the `task.json` acceptance object (citing the decision comment ID, `accepted_head_sha` and `policy_merge_sha`), finalise registers and state; independent review; then merge.

Candidate value only, not yet an owner acceptance: `accepted_head_sha=2eb8e14ffcaeed76cf37835399346375ee38ea26`. Any new commit on the PR #19 branch, or any merge to `main` before it, voids that candidate.

## 8. Task state value (VERIFIED at the source)

The conductor's state set was read from its own source (`src/types.ts`, `TASK_STATES`, at conductor commit `f6a6571`, the commit the tasks README cites; read-only, no code run): `IDLE`, `PLANNING`, `PLAN_READY`, `APPROVED_FOR_IMPLEMENTATION`, `IMPLEMENTING`, `IMPLEMENTATION_COMPLETE`, `REVIEWING`, `REMEDIATION_REQUIRED`, `ESCALATION_REQUIRED`, `HUMAN_DECISION_REQUIRED`, `ACCEPTED`, `FAILED`. Its risk set (`ROUTINE`, `MODERATE`, `HIGH`, `CRITICAL`) includes the `HIGH` used here.

`task.json` `state` is **`IDLE`**, the canonical template value. **No conductor execution is claimed.** This task was not conductor-managed (`planner`, `implementer` and `reviewer` are `null`; `selectedEfforts` is `{}`), so no value that implies a position in the conductor's workflow (`PLAN_READY`, `REVIEWING`, `HUMAN_DECISION_REQUIRED`) is asserted. The conductor's own acceptance path expects a `PLAN_READY` / `NOT_ACCEPTED` plan record in `REVIEWING`; that path does not apply to this record, and its acceptance, if the owner grants it, is a human acceptance recorded in `06-acceptance.md` as for `AIX-CI-001`. The owner may substitute another valid value.

## 9. Proposed severities

`task.json` counts and the register rows use severities taken from reviewer tables where a preserved source gives one, and otherwise **proposed in this record** (marked "proposed"): `PAR-N13`, `PAR-N27` and `PAR-N28`. They are for the owner to confirm.

## 10. Review-round and remediation-round reconciliation

The PAR-N13 planning source counted eight review rounds (R1 to R8). The records hold **eight** review files and **seven** remediation files. An earlier draft of this checkpoint folded the planning source's R4 and R5 into one unrecovered record; they are now separate, each marked INFERRED. No remediation was created to match a count: every remediation file corresponds to one commit that names the findings it addresses.

| Round | Reviewed commit | Source class | Findings | Remediation commit | Record |
|---|---|---|---|---|---|
| R1 | `b206e7e` | GITHUB-CONTEMPORANEOUS (GPT, not Opus) | PAR-R1 to R3 | `b157716` | [04-review.md](04-review.md) / [05-remediation.md](05-remediation.md) |
| R2 | `b157716` | GITHUB-CONTEMPORANEOUS ACCOUNT of an owner-supplied report | PAR-N1 to N7, R2-INFO-1 | `868f18b` | [04-review-r2.md](04-review-r2.md) / [05-remediation-r2.md](05-remediation-r2.md) |
| R3 | `868f18b` | GITHUB-CONTEMPORANEOUS ACCOUNT of an owner-supplied report | PAR-N8 to N11 | `a9ea48f` | [04-review-r3.md](04-review-r3.md) / [05-remediation-r3.md](05-remediation-r3.md) |
| R4 | `a9ea48f` (inferred) | NOT PRESERVED; existence INFERRED | PAR-N12 | `09ad3bf` | [04-review-r4.md](04-review-r4.md) / [05-remediation-r4.md](05-remediation-r4.md) |
| R5 | `09ad3bf` (inferred) | NOT PRESERVED; existence INFERRED | PAR-N14, PAR-INFO-1, PAR-INFO-2 | `9bf8312` | [04-review-r5.md](04-review-r5.md) / [05-remediation-r5.md](05-remediation-r5.md) |
| R6 | `9bf8312` | SECONDARY (implementer draft) | PAR-N15 to N17, O1 to O7 | `10f63bba` | [04-review-r6.md](04-review-r6.md) / [05-remediation-r6.md](05-remediation-r6.md) |
| R7 | `10f63bba` | SECONDARY / NOT PRESERVED | PAR-N18 to N21, acceptance-head binding, INFO-a to g | `2eb8e14f` | [04-review-r7.md](04-review-r7.md) / [05-remediation-r7.md](05-remediation-r7.md) |
| R8 | `2eb8e14f` | DERIVED (chat transcript) | PAR-N22 to N27, PAR-INFO-3 (proposed IDs) | none (ACCEPT recommendation; findings open) | [04-review-r8.md](04-review-r8.md) |

The eighth review (R8) was not omitted; it was previously numbered 7 because R4 and R5 shared a file. `task.json` records `review: 8` and `remediation: 7`; counts for R4 and R5 are inferred, not evidenced.

## 11. Evidence classification used in this record

| Class | Meaning |
|---|---|
| GITHUB-CONTEMPORANEOUS | Text posted to GitHub at the time. Every such comment is an **agent-authored** post (via the `chatgpt-codex-connector` app), so for owner-supplied reports it is an account of the report, not the report |
| SECONDARY | An implementer's draft or description (preserved in the private archive only) |
| DERIVED | Reconstructed after the fact from a transcript or from commit messages; labelled as such wherever it appears |
| NOT PRESERVED | No source survives |
| SESSION-RELAYED | An owner approval known only from a session's own account; no GitHub or repository text records it |
| VERIFIED | Read from Git, GitHub or the conductor source in this checkpoint |
| INFERRED | Reasoned from evidence, not demonstrated |

**Items that sources do not call defects.** `GOV-FIND-004` (the MIG-005 "G-1" follow-up) is called "not a finding" by its own source; it is registered only as a proposed tracking row (informational), and the owner may remove it. All severities marked "proposed", all D3 identifiers (`PAR-N22` to `PAR-N28`, `PAR-INFO-3`, `GOV-FIND-*`, `CI-FIND-*`) and the two-part acceptance process are **proposals, not owner decisions**.
