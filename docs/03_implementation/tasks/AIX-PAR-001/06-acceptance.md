# 06 Acceptance — AIX-PAR-001

> **Status of this record.** This is the canonical owner-acceptance record for the AIX-PAR-001 policy text, prepared under PAR-N13 Part B. **It becomes the authoritative acceptance record only when it reaches protected `main` through PR #20**, which needs its own independent review and a separately authorised merge. Until then, protected `main` records AIX-PAR-001 as **NOT_ACCEPTED** (owner decision, Issue #18 comment `7155988583` §2). **Pilot: NOT_ACTIVE**, before and after this record takes effect.

- **Final decision:** **ACCEPTED — POLICY DOCUMENT TEXT ONLY.** The accepted object is the AIX-PAR-001 amendment to [`CLAUDE_CODE_USAGE_RULES.md`](../../../00_project_state/CLAUDE_CODE_USAGE_RULES.md) (`STATE-004`) at the exact head below. Nothing else is accepted.
- **Accepted commit (`accepted_head_sha`):** `2eb8e14ffcaeed76cf37835399346375ee38ea26` (PR #19 head; policy blob `83d5cf1ddc16228b2d0ca8648e7b00b1bf882805`).
- **Policy merge commit (`policy_merge_sha`):** `26558507055533dcf439eaf8cf44f9a31c6631a9` (merge of PR #19 into protected `main`, committed by GitHub 2026-11-25T07:35:39Z). `task.json` records it as `resultingCommit`.
- **Accepted by (human):** Aiman, project owner (GitHub `bangomasjoli`). Decision: [Issue #18 comment `7155988583`](https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/issues/18#issuecomment-7155988583).
- **Origin of the timestamp:** `acceptedAt` = `2026-11-25T07:33:17Z`, the comment's GitHub `created_at`. It is not the time this file was written.
- **Origin evidence for the decision comment (VERIFIED by REST read-back, 2026-11-25):** `created_at` equals `updated_at` (not edited); `author_association` `OWNER`; `performed_via_github_app` `null`. **A null app marker does not prove personal human authorship** (`PAR-N29`). Personal authorship rests on the owner's own confirmation, given in the preceding supervised session, that they posted comment `7155988583` (**SESSION-RELAYED**; not on GitHub).
- **Reviewer / model / effort:** round 8 delta review of `2eb8e14f`: Claude Opus 5.5, effort not recorded, recommendation **ACCEPT** (not owner acceptance). Source class **DERIVED** (chat only, reconstructed from transcript). **Not fully unprimed:** previous project context was available to that session, as the owner's decision acknowledges. See [04-review-r8.md](04-review-r8.md). No conductor review execution exists; `task.json.acceptance.reviewExecutionId` is `null`.
- **Acceptance evidence:** [03-evidence.md](03-evidence.md) (Part A snapshot §1–§11; post-merge verification §12; Part A records review §13); review rounds [04-review.md](04-review.md) to [04-review-r8.md](04-review-r8.md); policy CI run `45151125787` at `2eb8e14f`; the PR #20 evidence snapshot `8945de01ec09e6c645c72408910b9cdd6beb8465` cited by the owner decision.

## Two-stage acceptance procedure (owner-adopted, D1 / `PAR-N27`)

The owner adopted it in comment `7155988583` §2. Each step and its evidence:

| Step | Requirement | Evidence | Result |
|---|---|---|---|
| 1 | Owner decision on the exact reviewed head | Comment `7155988583` records `accepted_head_sha=2eb8e14ffcaeed76cf37835399346375ee38ea26` and evidence snapshot `8945de01…` | VERIFIED (REST) |
| 2 | Separate authorisation to mark PR #19 Ready for Review and to merge it | Not preserved in the repository or on GitHub | **SESSION-RELAYED / UNVERIFIED** (see §"Limitations") |
| 3 | Normal two-parent merge commit; second parent = accepted head | `2655850…` parents: (1) `c995e0fc420a09d1437ebfd4e333029871496085`, the previous protected `main`; (2) `2eb8e14ffcaeed76cf37835399346375ee38ea26`. Exactly two parents | VERIFIED (Git) |
| 4a | Accepted policy content unchanged | Policy blob at `2eb8e14` and at `2655850` are both `83d5cf1d…`; `git diff 2eb8e14 2655850` is empty (merge tree equals accepted head tree) | VERIFIED (Git) |
| 4b | **`PAR-N23` exact-file check** (owner-required) | `git diff --name-status c995e0f 2655850` lists exactly one path: `M docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md` | VERIFIED (Git) |
| 4c | Protected `main` equals the merge | `git ls-remote origin refs/heads/main` = `2655850…` | VERIFIED |
| 5 | Canonical record through Part B | This file and the `task.json` acceptance object, on PR #20 | **Prepared; effective only on PR #20 merge** |

Merge freeze: the owner barred any other merge to `main` before the PR #19 merge (comment §5). `2655850` has first parent `c995e0f`, so no other merge landed in between (VERIFIED). PR #19's REST merge fields are recorded in [03-evidence.md](03-evidence.md) §12.

## Scope of acceptance and explicit exclusions

Accepted: the policy **text** at `2eb8e14`, as merged at `2655850`.

**Not accepted, authorised or implied:** pilot activation (no `AIX-PAR-001 STATE: ACTIVE` comment exists; the pilot is **NOT_ACTIVE** and stays so until all three gates in the policy are met); any second writer; `V2-SHELL-01` or `AIX-CI-HARD-001` implementation; any operational, regulatory or production approval; production or regulated operations; any change to root `CLAUDE.md`, the ruleset or CI. Software or policy acceptance is not regulatory approval.

## Carry-forward findings (LOW / MEDIUM and informational) — NOT CLOSED

Details and state: [OPEN_FINDINGS.md](../../../OPEN_FINDINGS.md). Retained by owner decision `7155988583` §3 and §4. Severities: `PAR-N29` is retained as an OPEN MEDIUM by owner direction. `PAR-N13`, `PAR-N27`, `PAR-N28` and `GOV-FIND-003` ("LOW (proposed)") and the `GOV-FIND-*` and `CI-FIND-*` identifiers remain unconfirmed proposals.

- `PAR-N29` — **MEDIUM**, governance: GitHub action attribution when an automated session can use the owner's personal credential (PR #20 was created that way). Owner restriction in force; see the register row.
- `PAR-N13` — LOW: canonical-record gap; its closure condition is the merge of PR #20.
- `PAR-N22` — LOW: hooks during the operator fetch; before pilot activation.
- `PAR-N23` — LOW: exact-file binding; the check was performed and passed for this merge (step 4b); the policy text is unchanged; closure is an owner decision.
- `PAR-N24` — LOW: `ls-remote` failure masking; before pilot activation.
- `PAR-N27` — LOW: acceptance-record location; process adopted; closure condition is the merge of PR #20.
- `PAR-N28` — LOW: lane branches have no server-side protection; before pilot activation.
- `PAR-N25`, `PAR-N26`, `PAR-INFO-3` — informational.
- `PAR-INFO-c`, `PAR-INFO-f` — residual risks, owner decision; `PAR-INFO-d`, `PAR-INFO-e` — deferred.
- `PAR-O2`, `PAR-O3` — documented fail-closed limitations; `PAR-O4` — later canonical-path clarification; `PAR-O5` — accepted false-positive limitation (owner dispositions, comment §3).
- Not closed by this acceptance: `GOV-FIND-001` (Issue #14), `GOV-FIND-002`..`004`, `CI-FIND-001`..`003`.

## Limitations accepted with this decision

- Round 8 was not fully unprimed (acknowledged by the owner). Rounds 2, 3 and 8 and the Part A records review were Claude Opus 5.5 sessions; rounds 6 and 7 are described only as "Opus" reviews in implementer drafts. Round 1 (GPT) is the only review recorded from a different model family.
- Rounds 4 and 5 are unrecovered (existence INFERRED); rounds 6 and 7 are known only from implementer drafts.
- Owner approvals after 2026-11-03, including the PR #19 Ready-for-Review and merge authorisations, are SESSION-RELAYED. Whether the PR #19 merge was performed personally in the browser or by an agent session using the owner's account is **UNVERIFIED** (merge commit author: the owner's GitHub identity; committer: GitHub).
- Ruleset bypass actors remain UNVERIFIED (not visible anonymously).
- Policy behaviour was exercised on Git 2.50.1 only.

## Independence of this record

This record was prepared by **Claude Opus 5.5**, in the same conversation that performed the PAR-N13 Part A records review (see [03-evidence.md](03-evidence.md) §13). That departs from the original assignment, which named a Sonnet model. It was committed locally by a **Claude Sonnet 5.5** session in the same conversation. **Neither session may perform or count as the independent Part B review.** Part B needs a separate fresh-context review before PR #20 is merged. The preparer and committer cannot approve, accept or certify it.
