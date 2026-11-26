# 03 Evidence — AIX-PAR-001

> Independent facts read from Git and GitHub, plus clearly labelled secondary sources. §1 to §11 are the **Part A snapshot** (collected 2026-11-23, committed at `8945de0`); they describe the state before the PR #19 merge and are preserved as history. §12 to §14 were added by **PAR-N13 Part B** (collected 2026-11-25) after the policy merge. **A passing CI run is not evidence that the policy text is correct, reviewed or accepted.** **Status: policy merged at `2655850`; acceptance recorded in [06-acceptance.md](06-acceptance.md), effective only once that record is on protected `main` (PR #20). Pilot: NOT_ACTIVE.** Classification: **VERIFIED** = read from Git or the GitHub API in the checkpoint that wrote the section; **SECONDARY** = taken from a preserved implementer draft or reconstructed report; **NOT PRESERVED** = no source survives.

- **Collected:** Part A 2026-11-23 (time of day not recorded); Part B 2026-11-25 (§12).
- **Baseline commit:** `c995e0fc420a09d1437ebfd4e333029871496085` (protected `main` before the policy merge).
- **Resulting commit:** `26558507055533dcf439eaf8cf44f9a31c6631a9` (policy merge of PR #19; accepted head `2eb8e14ffcaeed76cf37835399346375ee38ea26`).
- **Branch:** policy `docs/AIX-PAR-001-limited-policy-amendment` (PR #19, merged); records `docs/AIX-PAR-001-canonical-records` (PR #20, draft).
- **Working tree clean:** Part A record worktree clean before Part B started (§12). Part B changes are uncommitted until separately authorised.

## 1. Repository and PR state (VERIFIED, 2026-11-23; Part A snapshot, superseded by §12)

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

## 7. Proposed acceptance sequencing (PROPOSAL at Part A; D1 in the PAR-N13 plan)

> **Part B note:** the owner adopted this two-stage procedure in Issue #18 comment `7155988583` §2 (2026-11-25T07:33:17Z), adding the `PAR-N23` exact-file check and a merge freeze. The text below is the Part A proposal, preserved as written; execution evidence is in §12.

**Circularity (VERIFIED from the `main` ruleset above and the drafted binding):** an acceptance record cannot be committed to PR #19 because that changes the head it records; merging a records PR to `main` before PR #19 makes PR #19 out of date (strict check), forcing a branch update and a new head, which voids the acceptance.

**Proposal (two-part acceptance):**
1. Part A (this PAR-N13 checkpoint): history, registers and state, NOT_ACCEPTED; **never merged before PR #19**.
2. Before the merge: the owner personally posts, in the browser on Issue #18, a decision comment (not beginning `AIX-PAR-001 STATE:`) recording `accepted_head_sha`, scope, evidence and carry-forwards; origin read back via REST (`performed_via_github_app` null, not edited) and the comment ID confirmed in session. On its own this does not satisfy root `CLAUDE.md` §4.
3. Merge freeze, then separately authorised Ready-for-Review and merge of PR #19 (merge commit; head equal to `accepted_head_sha`), then the post-merge binding checks.
4. Part B: bring `main` into the records branch with a normal merge, add `06-acceptance.md` and the `task.json` acceptance object (citing the decision comment ID, `accepted_head_sha` and `policy_merge_sha`), finalise registers and state; independent review; then merge.

Candidate value only, not yet an owner acceptance: `accepted_head_sha=2eb8e14ffcaeed76cf37835399346375ee38ea26`. Any new commit on the PR #19 branch, or any merge to `main` before it, voids that candidate.

## 8. Task state value (VERIFIED at the source)

The conductor's state set was read from its own source (`src/types.ts`, `TASK_STATES`, at conductor commit `f6a6571`, the commit the tasks README cites; read-only, no code run): `IDLE`, `PLANNING`, `PLAN_READY`, `APPROVED_FOR_IMPLEMENTATION`, `IMPLEMENTING`, `IMPLEMENTATION_COMPLETE`, `REVIEWING`, `REMEDIATION_REQUIRED`, `ESCALATION_REQUIRED`, `HUMAN_DECISION_REQUIRED`, `ACCEPTED`, `FAILED`. Its risk set (`ROUTINE`, `MODERATE`, `HIGH`, `CRITICAL`) includes the `HIGH` used here.

*Part A value, superseded in Part B:* `task.json` `state` was **`IDLE`**, the canonical template value. In Part B it is `ACCEPTED`, with `acceptanceStatus` `ACCEPTED` and the `acceptance` object, matching the `AIX-CI-001` precedent (a human acceptance outside the conductor, recorded on a documentation PR before that PR merges). Those values take effect only when the record is on protected `main`. **No conductor execution is claimed.** This task was not conductor-managed (`planner`, `implementer` and `reviewer` are `null`; `selectedEfforts` is `{}`), so no value that implies a position in the conductor's workflow (`PLAN_READY`, `REVIEWING`, `HUMAN_DECISION_REQUIRED`) is asserted. The conductor's own acceptance path expects a `PLAN_READY` / `NOT_ACCEPTED` plan record in `REVIEWING`; that path does not apply to this record, and its acceptance, if the owner grants it, is a human acceptance recorded in `06-acceptance.md` as for `AIX-CI-001`. The owner may substitute another valid value.

## 9. Proposed severities

`task.json` counts and the register rows use severities taken from reviewer tables where a preserved source gives one, and otherwise **proposed in this record** (marked "proposed"): `PAR-N13`, `PAR-N27` and `PAR-N28`. They are for the owner to confirm. *Part B:* owner comment `7155988583` §3 retains `PAR-N22` to `PAR-N28` and the applicable informational findings "with their recorded limitations and required resolution stages". That retains the identifiers and the recorded severities; it does not separately confirm severities marked "proposed". §4 records `PAR-N29` as a proposed MEDIUM; the Part B authorisation (SESSION-RELAYED) directs recording it as an open MEDIUM finding.

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

**Items that sources do not call defects.** `GOV-FIND-004` (the MIG-005 "G-1" follow-up) is called "not a finding" by its own source; it is registered only as a proposed tracking row (informational), and the owner may remove it. All severities marked "proposed", all D3 identifiers (`PAR-N22` to `PAR-N28`, `PAR-INFO-3`, `GOV-FIND-*`, `CI-FIND-*`) and the two-part acceptance process are **proposals, not owner decisions**. *(Part A wording. Part B status: the two-part process and the `PAR-N22`..`N28` / informational identifiers were adopted or retained by owner comment `7155988583`; `GOV-FIND-*`, `CI-FIND-*`, `PAR-N13` and the "proposed" severities remain unconfirmed proposals.)*

## 12. Post-merge verification (PAR-N13 Part B, VERIFIED 2026-11-25)

Commands ran read-only from the records worktree, except one fetch, made with the policy's pinned form and the credential helper disabled: `git --no-replace-objects -c core.commitGraph=false -c credential.helper= fetch --no-tags --no-write-fetch-head --no-auto-maintenance origin refs/heads/main:refs/remotes/origin/main`. Before it ran, the worktree had no hooks, no `url.*` rewrites, no `info/grafts` and no replace refs. REST reads were unauthenticated. No stored credential was used.

| Check | Command / source | Result |
|---|---|---|
| Protected `main` | `git ls-remote origin refs/heads/main` | `26558507055533dcf439eaf8cf44f9a31c6631a9` |
| Merge parents | `git rev-list --parents -1 2655850` | exactly 2: `c995e0fc420a09d1437ebfd4e333029871496085`, `2eb8e14ffcaeed76cf37835399346375ee38ea26` |
| Merge identity | `git log -1 2655850` | subject "Merge pull request #19: conditional AIX-PAR-001 two-worktree policy"; author the owner's GitHub identity, committer GitHub, 2026-11-25T07:35:39Z (after the decision at 07:33:17Z) |
| `PAR-N23` exact file | `git diff --name-status c995e0f 2655850` | one path only: `M docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md` |
| Merge tree vs accepted head | `git diff 2eb8e14 2655850` | empty |
| Policy bytes | `git rev-parse 2eb8e14:<policy> 2655850:<policy>` | both `83d5cf1ddc16228b2d0ca8648e7b00b1bf882805` |
| PR #19 REST | `GET pulls/19` | see "REST read-back" below |
| Decision comment | `GET issues/comments/7155988583` | `created_at` = `updated_at` = `2026-11-25T07:33:17Z`; `author_association` `OWNER`; `performed_via_github_app` `null`; body records `accepted_head_sha=2eb8e14ffcaeed76cf37835399346375ee38ea26` and evidence snapshot `8945de01ec09e6c645c72408910b9cdd6beb8465` |
| PR #20 head | `git ls-remote origin` | `refs/heads/docs/AIX-PAR-001-canonical-records` and `refs/pull/20/head` = `8945de01ec09e6c645c72408910b9cdd6beb8465` |
| Policy CI | check-runs on `2eb8e14` (read 2026-11-25 during the Part A records review) | five check-runs `completed` / `success`, including `PR verification result` (app 15368); run `45151125787` per §3 |
| Competing writers | `git worktree list`; `git status` in each worktree; process list | no uncommitted change in any other worktree; no Git write process running |
| Records worktree before Part B | `git status --porcelain=v1 --ignored -uall` | clean at `8945de0` |

**REST read-back of PR #19 and PR #20 (unauthenticated, 2026-11-25):**
- **PR #19** (`GET pulls/19`): `state` closed, `merged` true, `merged_at` `2026-11-25T07:35:40Z`, `merge_commit_sha` `26558507055533dcf439eaf8cf44f9a31c6631a9`, `base.ref` `main`, `head.sha` `2eb8e14ffcaeed76cf37835399346375ee38ea26`; 9 commits, 1 changed file; `merged_by` the owner's account (this does not show whether the merge was personal or agent-performed; `PAR-N29`). This satisfies the policy's `policy_merge_sha` authority rule (PAR-N17): it is a complete 40-hex SHA equal to the post-merge `merge_commit_sha`.
- **PR #20** (`GET pulls/20`): open, **draft**, not merged, head `8945de01ec09e6c645c72408910b9cdd6beb8465`, 1 commit, 22 files.
- **Policy CI** (`GET actions/runs/45151125787`): `AIX CI PR`, `pull_request`, head `2eb8e14f…`, attempt 1, `completed` / `success`.
- **Issue #18** (`GET issues/18/comments`): 9 comments; the only one after 2026-11-03 is `7155988583` (no app). No comment begins `AIX-PAR-001 STATE:`.

**Integration (prepared, not committed):** `git merge --no-ff --no-commit 26558507055533dcf439eaf8cf44f9a31c6631a9` in the records worktree reported "Automatic merge went well; stopped before committing". `MERGE_HEAD` is `2655850`; `HEAD` stays `8945de0`. The only path staged by the integration is the policy file, and the staged blob equals the accepted head. No conflict, rebase, squash or force-push. Once separately authorised, the resulting commit will have parents `8945de0` (Part A history) and `2655850`.

**Who performed the PR #19 Ready-for-Review and merge** (personally in the browser, or an agent session using the owner's account) is not recorded in Git or REST: **UNVERIFIED**. The authorisation text is SESSION-RELAYED.

## 13. PAR-N13 Part A records review and Part B remediation

**Source:** an independent acceptance-gate review of PR #20 at `8945de0` (Part A only; not a policy review round, so it is not counted in `roundCounts.review`). Claude Opus 5.5, read-only, 2026-11-25, delivered in chat. Verdict **REMEDIATE (all fixes deferred to Part B)**. Source class: the report is in the session transcript only (DERIVED for this record). **Limitations disclosed by that reviewer:** its context auto-loaded a memory index summarising PR #19 and PR #20 state, so it was not unprimed; it shares a model family with rounds 2, 3 and 8; and **Part B was prepared in that same session**, so the reviewer of Part A is not independent of Part B. A separate fresh-context review of Part B is required.

| Finding | Severity | Summary | Part B correction | Where |
|---|---|---|---|---|
| F01 | LOW | `task.json` `updatedAt` `2026-11-23T11:30:00.000Z` was 42 min after the commit (`10:47:48Z`) that contained it, so it could not be a real event time; the origin of `createdAt` was not stated | `updatedAt` replaced with the actual Part B record-preparation time; meanings stated in §14 | `task.json`, §14 |
| F02 | LOW | `STATE-004` row used `UNKNOWN` (register convention `N/A`) and the copied front-matter baseline `780e116` (register convention: the commit at which the entry was confirmed) | Dates `N/A`; Baseline Commit `2655850`; row describes the merged amendment | `DOCUMENT_REGISTER.md` §4e |
| F03 | LOW | Round 8 was called "fresh-context" without a memory-context disclosure | Reviewer line corrected: not fully unprimed, as the owner's decision acknowledges | `04-review-r8.md` |
| F04 | LOW | Stale wording ("uncommitted proposal", "until the owner reviews and commits it", "not on `main`", "not started") | Updated, with each superseded Part A statement marked rather than deleted | `01-plan.md`, `OPEN_FINDINGS.md`, `DOCUMENT_REGISTER.md`, `CURRENT_STATE.md`, `task.json` title |
| F05 | INFO | Template header fields missing | Header fields added to `01-plan`, `03-evidence` and the `05-*` files from existing evidence; reviewer role and effort are not recorded anywhere, so none was invented | those files |
| F06 | LOW | `CURRENT_STATE` front matter (`last_reviewed` 2026-10-19, `baseline_commit` 5a4f872) contradicted its own body | `last_reviewed` 2026-11-25; `baseline_commit` `f35ae84` (newest non-governance commit on `main`); previous values preserved in §2 | `CURRENT_STATE.md` |
| N-1 | LOW | `04-review-r6.md` said O2 to O5 were "carried in task.json"; they were not tracked anywhere | Registered as `PAR-O2`..`PAR-O5` with the owner's dispositions; reference corrected | `OPEN_FINDINGS.md`, `task.json`, `04-review-r6.md` |
| N-2 | LOW | The Part A authorisation (named files; commit, push and PR) was not recorded | Recorded as SESSION-RELAYED in the approval history; no GitHub evidence is claimed | `01-plan.md` |
| N-3 | MEDIUM (proposed) | O-1: PR #20 was created with the owner's stored credential; `performed_via_github_app` is null, the same as a browser action | Registered as `PAR-N29`, OPEN, with the owner's restriction | `OPEN_FINDINGS.md` |
| N-4 | INFO | Commits 1 to 5 are authored as "Mohd Aiman Rahimi", 6 to 9 as "AimanRahimi" | Noted | `02-implementation-report.md` |

Closure of F01 to F06, N-1 and N-2 is **not claimed here**. It needs the separate Part B review to verify the corrections.

**Additional source-backed discrepancy (owner-authorised clarification; recorded, not resolved):** `CURRENT_STATE.md` §2 and §4 name `MIG-004` (`5a4f872`) as the last accepted backend implementation commit, while [IAM02-AUTHZ-REM-001/06-acceptance.md](../IAM02-AUTHZ-REM-001/06-acceptance.md) records a later, source-code-only acceptance of `b468c5d` (source `39639c0`) on 2026-11-02. It pre-dates Part B and is outside the AIX-PAR-001 scope. Part B only marks it in `CURRENT_STATE.md` (§2 and a pointer in §4); it invents no replacement baseline and rewrites no acceptance record. Which wording is current is a human decision.

**Preparation and commit attribution (recorded deviation).** The Part B preparation was assigned to a Claude Sonnet session but was **performed by Claude Opus 5.5**, in the same conversation that performed the Part A records review above. The no-commit integration and every documentation change in the Part B commits were prepared by that Opus 5.5 session. The two authorised local commits were made afterwards by a Claude Sonnet 5.5 session in the same conversation, which verified the preflight state and the prepared files and did not independently re-derive them. Commit trailers name both models. **Neither session may perform or count as the independent Part B review.** That review must be a fresh-context session that did not prepare or commit this record. Neither session approves, accepts or certifies this record; acceptance is the owner's act.

**Severity status (accurate as of Part B).** Owner-directed: `PAR-N29` is retained as an OPEN MEDIUM finding (owner authorisations for Part B preparation and for the two local commits, SESSION-RELAYED; the decision comment `7155988583` §4 calls it a "proposed MEDIUM"). Still proposals awaiting owner confirmation: `PAR-N13`, `PAR-N27`, `PAR-N28`, `GOV-FIND-003` (each "LOW (proposed)") and the `GOV-FIND-*` and `CI-FIND-*` identifiers. `GOV-FIND-001` stays OPEN.

## 14. `task.json` timestamps (provenance)

- `createdAt` `2026-11-02T19:05:57.000Z`: the GitHub `created_at` of Issue #18, the event that opened this task (VERIFIED by REST). It is not the time the task-record files were created; those were first committed in `8945de0` (author time 2026-11-23T10:47:48Z).
- `updatedAt`: the UTC time at which Part B prepared `task.json` (read from the system clock when written; it precedes any commit of the record). The Part A value `2026-11-23T11:30:00.000Z` was not a real event time (F01) and is superseded; it remains in commit `8945de0`.
- `acceptance.acceptedAt` `2026-11-25T07:33:17Z`: the `created_at` of the owner decision comment `7155988583` (VERIFIED).
