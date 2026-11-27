# 04 Review — AIX-PAR-001 (round 8: delta review of `2eb8e14f`)

- **Reviewer:** Claude Opus 5.5 (model per the session transcript), read-only, 2026-11-23, in a separate session, but **not fully unprimed**: previous project context was available to it. The owner acknowledged this limitation in Issue #18 comment `7155988583` §1. *(Part A wording, superseded: "fresh-context Claude Opus 5.5"; the Part A record gave no memory-context disclosure, finding F03 in [03-evidence.md](03-evidence.md) §13.)* The report was delivered in chat only; **no GitHub comment, no GitHub-submitted review and no execution ID**. The reviewer stated that it shares a model family with earlier reviewers, and that only Git 2.50.1 (Apple Git-155) was available. The preserved text is a reconstruction from the transcript (SECONDARY; labelled as such in the private archive).
- **Source class:** **DERIVED.** The review was delivered in chat only. The text in the private archive is a reconstruction from the session transcript, labelled as such; the implementer's Addendum B (SECONDARY) restates its outcome. No original report file exists.
- **Decision:** ACCEPT as a recommendation. **Not owner acceptance.** Commit `2eb8e14f` reported suitable for an owner-authorised push.
- **Human approval required:** true
- **Evidence reviewed:** commit `2eb8e14ffcaeed76cf37835399346375ee38ea26`, parent `10f63bba87263245bc230ecb59c559c1ddfa411e`, one file `+5/−4` (committed patch byte-identical to the implementer's tested patch). About 40 scratch scenarios (forged commit-graph, substituted objects, replace refs, legacy graft, history-rewrite pushes and fetches, pre-push and reference-transaction hooks, merge shapes against the acceptance-head binding) and the live read-only gates (a) to (f). CI at that head: run `45151125787`, success (after the push).
- **Dispositions reproduced as fixed:** PAR-N18, PAR-N19, PAR-N20, PAR-N21 and the acceptance-head binding, on Git 2.50.1 only. No BLOCKER, HIGH or MEDIUM item.

## Findings
Proposed identifiers follow decision D3 of the PAR-N13 plan (**proposal, not an owner decision**); the review's own labels are G1 to G6.

| ID | Review label | Severity | Category | Description | Evidence | Recommended action |
|---|---|---|---|---|---|---|
| PAR-N22 | G1 | LOW | Hooks | A planted `reference-transaction` hook ran during the pinned fetch and created a remote ref; the fetch procedure compares only local refs and config | scratch reproduction | Compare the remote list around the fetch, or add a hook-inventory gate, or allow an empty `core.hooksPath` on operator commands |
| PAR-N23 | G2 | LOW | Merge binding | The post-merge binding checks only the policy file; a merge commit that also changes other files passes (mitigated by the merge-only ruleset; bypass actors unverified) | scratch reproduction | Also require the name-only diff of the merge to list exactly the policy file |
| PAR-N24 | G3 | LOW | Evidence capture | `ls-remote \| LC_ALL=C sort` masks an `ls-remote` failure; an empty baseline would skip the ancestry step | scratch reproduction | `pipefail` and a non-empty baseline containing `refs/heads/main` |
| PAR-N25 | G4 | INFO | Dry run | The dry-run flag is not tied to whether the remote branch exists | review | `*` only when the remote branch is absent, space only when present |
| PAR-N26 | G5 | INFO | Operations | `refs/pull/N/*` refresh asynchronously; an immediate compare can show them unchanged | reproduced in the later operator push | Document that GitHub refresh lag is expected |
| PAR-N27 | G6 | LOW (proposed) | Acceptance record | The policy does not say where the formal owner acceptance record lives; committing it to PR #19 changes the head it records | review; ruleset read-back | Adopt the two-part acceptance process in [03-evidence.md](03-evidence.md) §7; **must be settled before owner acceptance** |
| PAR-INFO-3 | G-INFO | INFO | Version gate | The N18 awk accepts the malformed `2x.40`; with multi-line output any passing line wins | scratch test | No change needed |

Other items: lane-branch server-side protection absent, so PAR-N20 protection is client-side only (**`PAR-N28`**, owner decision, LOW proposed); `PAR-INFO-c` and `PAR-INFO-f` residual risks (owner decision); `PAR-INFO-d` and `PAR-INFO-e` deferred. **Unverified:** behaviour on Git 2.32 to 2.49; ruleset bypass actors; GitHub's real push output (observed later in the operator push, see [03-evidence.md](03-evidence.md) §4).

## Escalation decision
none

## Rationale
This is the "R8" of the PAR-N13 planning table (the chat label). The review recommends but does not accept; owner acceptance is a separate act, recorded only in [06-acceptance.md](06-acceptance.md). *(Part A wording: "which does not exist". In Part B it was prepared after the PR #19 merge; it takes effect once on protected `main`.)* `PAR-N27` was settled by the owner's adoption of the two-stage process (comment `7155988583` §2).
