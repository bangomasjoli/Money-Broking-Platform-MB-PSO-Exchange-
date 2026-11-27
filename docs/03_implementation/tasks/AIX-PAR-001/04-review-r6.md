# 04 Review — AIX-PAR-001 (round 6)

- **Reviewer:** described in the implementer's draft as an "independent Opus review" of commit `9bf8312`, 2026-11-23. Model and effort are not stated beyond that; the review text is **NOT PRESERVED**; no execution ID; not a GitHub-submitted review.
- **Source class:** **SECONDARY.** The implementer's evidence draft (N15 to N17 record) describes this review; the review report itself is **NOT PRESERVED**. Reviewer, model, effort and verdict are therefore **UNVERIFIED** beyond what the draft states.
- **Decision:** REMEDIATE (LOW findings only), per the implementer's draft
- **Human approval required:** true
- **Evidence reviewed:** PR #19 head `9bf831246ed5d60c1a47f6df41b84fea759e1603`, CI run `42969611159` (success). Source for this record: the N15 to N17 implementer draft (SECONDARY).

## Findings
| ID | Severity | Category | Description | Evidence | Recommended action |
|---|---|---|---|---|---|
| PAR-N15 | LOW | Ancestry override | `--no-replace-objects` does not neutralise a legacy `info/grafts` file; a shared graft can make an unapproved base look like an ancestor | reproduced in the implementer's scratch run | `GIT_GRAFT_FILE=/dev/null` in the wrapper plus a fail-closed graft-file gate |
| PAR-N16 | LOW | Push safety | The push command was not pinned; remote identity and ref effects were not checked | reproduced (global `push.followTags` publishing an unnamed tag; `pushurl`/`insteadOf` redirect) | Pin the exact command; remote identity gate; ref comparison |
| PAR-N17 | LOW | Policy reference | `policy_merge_sha` had no format or authority rule | reproduced (a provisional PR merge commit passes every Git-side check) | 40-hex lowercase; equals the post-merge GitHub `merge_commit_sha`; ancestor of every approved base |

Informational observations O1 to O7 and their dispositions (from the draft):
| # | Observation | Disposition |
|---|---|---|
| O1 | Fetch bypasses the wrapper; `url.*.insteadOf` redirects it | Addressed; **owner-authorised scope extension, retained 2026-11-23** |
| O2 | Gates are pipelines; a failing config command is masked | **Accepted limitation, pending owner decision** (wording only) |
| O3 | Environment gate also stops on `GIT_AUTHOR_*` / `GIT_COMMITTER_*` | **Accepted limitation, pending owner decision** (liveness cost; fails closed) |
| O4 | Root check uses plain git once (a symlinked temporary-directory path can mismatch the recorded root) | Safety addressed; canonical-path recording **requires separate wording remediation** |
| O5 | Config gate pattern matches non-existent keys | **Accepted limitation** (harmless false positive) |
| O6 | `--ignored=matching` collapses directories; hides nested content | Addressed by one fail-closed sentence; **owner-authorised scope extension, retained 2026-11-23** |
| O7 | Git 2.32 floor and `--end-of-options` | Floor documented; **unverified by execution** on any Git other than 2.50.1 (PAR-N18 followed) |

The draft also records, as implementer-identified residual risks, PAR-N18 (version floor stated but not enforced), operator Git configuration outside the wrapper, and the acceptance-head binding gap; all three were taken forward in round 7.

## Escalation decision
none

## Rationale
Findings and dispositions are carried from the implementer's draft. Remediation: [05-remediation-r6.md](05-remediation-r6.md). *Part A wording, corrected in Part B (finding N-1):* "O2 to O5 remain pending owner decisions (carried in `task.json`, not in the findings register)". In fact Part A tracked them nowhere. Owner dispositions (Issue #18 comment `7155988583` §3): O2 and O3 remain documented fail-closed limitations; O4 requires a later canonical-path clarification; O5 is accepted as a non-blocking false-positive limitation. They are now registered as `PAR-O2`..`PAR-O5` in [OPEN_FINDINGS.md](../../../OPEN_FINDINGS.md) and listed in `task.json`.
