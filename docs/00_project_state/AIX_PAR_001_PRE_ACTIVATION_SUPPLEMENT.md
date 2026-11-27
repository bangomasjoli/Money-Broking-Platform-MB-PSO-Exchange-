---
document_id: STATE-007
title: AIX-PAR-001 Pilot Pre-Activation Supplement
version: N/A
document_status: DRAFT
implementation_status: N/A
module: N/A
control: Pilot pre-activation controls (supplement to the AIX-PAR-001 exception in STATE-004)
owner: Unassigned
effective_date: N/A
last_reviewed: N/A
supersedes: none
baseline_commit: 6d875ea
---

# AIX-PAR-001 — Pilot Pre-Activation Supplement (task `AIX-PAR-002`)

> **DRAFT. Not accepted, not effective.** Prepared 2026-11-27 on protected `main` `6d875ead5c8f6ec9d42902a67fef695ff7eb595e`; remediated three times: R1 after an independent fresh-context review, R2 (narrow: the write boundary, policy-content binding and explicit T-1 adoption) after a targeted delta review, and R3 (narrow: shared object-store containment, symlink wording, T-1 decision binding) after the final R2 verification, each earlier review having the verdict REMEDIATE (chat-only reports). A focused independent verification of R3 is still required. It is to be reviewed again and published **together with a narrow amendment of `STATE-004`** in one pull request. The front-matter `document_status` is never evidence of acceptance: this text takes effect only through the gate chain in §1. **The AIX-PAR-001 pilot is `NOT_ACTIVE`. Nothing here activates it, authorises a lane, closes a finding or changes a ruleset, credential, connector or account.** Classes used below: **TECHNICAL** (enforced by something the agent cannot bypass), **PROCEDURAL** (an agent or operator is trusted to follow it), **OWNER CONFIGURATION** (an external setting the owner makes and tests separately).

## 0. Relationship, precedence and preserved controls

- This supplement **adds requirements** to the AIX-PAR-001 exception in [`CLAUDE_CODE_USAGE_RULES.md`](CLAUDE_CODE_USAGE_RULES.md) (`STATE-004`), whose original acceptance is unchanged: `accepted_head_sha` `2eb8e14ffcaeed76cf37835399346375ee38ea26`, `policy_merge_sha` `26558507055533dcf439eaf8cf44f9a31c6631a9` and the **historical policy blob** `83d5cf1ddc16228b2d0ca8648e7b00b1bf882805` (the blob at both). Those SHA values appear unchanged in every ACTIVE comment. **Owner decision (R1): the narrow `STATE-004` amendment route.** The same pull request therefore also changes `STATE-004`: a new subsection, one pointer bullet and one gate-1 sentence, all pure insertions. The blob identity of the **amended** `STATE-004` is derived from the reviewed commit and recorded only outside these two files (the owner's decision comment and the canonical acceptance record), so that no file contains a hash of itself. The historical blob identifies the policy as originally accepted and is never replaced or confused with the amended blob.
- **Precedence is narrow and explicit.** The amended `STATE-004` lists exhaustively what this supplement replaces or adds (the fetch form, the push form and its hook option, the remote-baseline capture, the ACTIVE-comment fields, and gate 1 for PR #19 only) and nothing else. There is no general override mechanism; on any other conflict `STATE-004` governs and the pilot is `NOT_ACTIVE`. The amendment and this supplement have **no effect** until the sequence in §1 reaches S7 (exact reviewed contents, the owner's decision on the exact published head, a merge with retained pre-merge evidence, and the bootstrap verification of §8.3). Draft text, a local commit, a published branch or a draft pull request change nothing. The supplement can add checks and stricter command forms; it cannot relax a `STATE-004` control.
- Root `CLAUDE.md` is unchanged. Where §7 is stricter than `CLAUDE.md` §1 it adds a pilot procedure, not a repository rule.
- **Preserved unchanged:** one controlled writer by default; at most two implementation writers; the 72-hour maximum; the lane allowlists; serial publication and integration windows; mandatory independent review and CI (green CI is not independent approval); terminal `STOPPED`; owner-only, personally confirmed activation; browser-posted `STATE` and `LANE-RESUME` comments with in-session comment-ID confirmation and the PAR-N10 REST read-back; the architecture, licence and runtime restrictions of `CLAUDE.md` §3; the historical findings and limitations in [`OPEN_FINDINGS.md`](../OPEN_FINDINGS.md) and [`tasks/AIX-PAR-001/`](../03_implementation/tasks/AIX-PAR-001/).
- **Executable blocks.** Each `par-block` below is the exact text the prepared tests ran. Run them under `/bin/bash` (3.2 compatible) with `ROOT` (verified worktree root, absolute) and `D` (an empty evidence directory) set. Source all eleven blocks, in the order shown, before calling any function (functions call each other across blocks). Sourcing only defines functions and constants.

<!-- par-block: wrapper -->
```bash
# E  = PAR-N14 evidence wrapper (unchanged from STATE-004).
# CF = credential-free read/fetch wrapper (§5.2): empty environment, no user or system Git configuration,
#      no askpass, credential helpers reset, hooks disabled. CF_EXTRA may add NAME=value pairs without spaces.
E()  { env -i PATH="$PATH" GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_GRAFT_FILE=/dev/null git --no-replace-objects -C "$ROOT" -c core.fsmonitor=false -c core.commitGraph=false -c advice.graftFileDeprecated=false "$@"; }
CF() { env -i PATH="$PATH" GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_GRAFT_FILE=/dev/null GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/usr/bin/false ${CF_EXTRA:-} git --no-replace-objects -C "$ROOT" -c credential.helper= -c core.hooksPath=/dev/null -c core.commitGraph=false -c core.fsmonitor=false -c advice.graftFileDeprecated=false "$@"; }
# The two approved lane branches (§6), exact and without any override. Every lane identity used below is checked with par_lane_ok.
PAR_LANE_UI=task/V2-SHELL-01-shadcn
PAR_LANE_CI=task/AIX-CI-HARD-001-L1
par_lane_ok() { [ "${1:-}" = "$PAR_LANE_UI" ] || [ "${1:-}" = "$PAR_LANE_CI" ]; }
```

## 1. Sequence of steps (no circular requirement)

Twelve steps. **A step requires only lower-numbered steps, and no step is satisfied by evidence produced at a later step.** The merge of the supplement does not authorise activation. S1 to S7 are used for the supplement pull request (`supplement_pr`) and, with their own evidence, again for the records pull request (`records_pr`, S10).

| Step | Content | Authority / evidence | Requires |
|---|---|---|---|
| S1 | Prepare the candidate: exactly the authorised paths | Preparer; raw digests recorded outside the repository | requires: none |
| S2 | Independent review of the **exact raw file contents** (fresh context). The review records the raw SHA-256 of every file (`RAWMAN`) and the exact changed-path inventory (`PZ`) with their digests | Review record (a chat-only review is labelled as such) | requires: S1 |
| S3 | Separately authorised **local commit** by the owner; `par_commit_bind` passes: the commit `H` has the approved base `B` as its only parent, every committed file equals its reviewed raw digest, and the changed paths equal `PZ` | Owner; `par_commit_bind` output retained | requires: S2 |
| S4 | Separately authorised **publication and draft pull request**; `H` is the published pull-request head | Owner personally (§5.3); `par_push` form | requires: S3 |
| S5 | **Owner acceptance of the exact published head:** a decision comment (not beginning with a state token) recording `H`, the digest of `PZ`, the digest of `RAWMAN`, the blob identity of `STATE-004` at `H` (`amended_policy_blob_sha`), the digests of the eleven command blocks as extracted from `H`, and the T-1 decision as **one exact line**, `T-1: ADOPTED` or `T-1: REJECTED`, with no other mention of T-1 **in any spelling** and **exactly one** accepted-head line `supplement_accepted_head_sha: <H>`, in a plain-ASCII comment (`par_t1_adopted`, §8.1; an omitted, rejected, duplicated, contradictory or ambiguous decision means T-1 does not apply); REST `head.sha` and `refs/pull/<n>/head` must equal `H` | Owner decision comment; its `created_at` becomes `DECISION_AT` | requires: S4 |
| S6 | **Retained immediate pre-merge verification** (§8.2, `par_premerge`) | Owner-held evidence file | requires: S5 |
| S7 | Separately authorised **merge** (`supplement_merge_sha`); post-merge `par_bind` (prospective) and `par_rest_pr` with `DECISION_AT`; §8.3 bootstrap verification passes. The amended `STATE-004` and this supplement become operative here, and only here | Owner; evidence archived | requires: S6 |
| S8 | **External control configuration and tests:** X1 lane ruleset and probe (§6), X2 agent capability boundary and attribution (§5), X3 repository isolation, read **and** write (§7). Each operation needs its own owner authorisation | Owner-operated; evidence archived with a SHA-256 manifest | requires: S7 |
| S9 | **Independent verification** of the S8 evidence (fresh context) | Review record | requires: S8 |
| S10 | **Canonical acceptance and finding dispositions:** a separate records pull request carries the `AIX-PAR-002` `06-acceptance.md`, the `task.json` acceptance object, the S8/S9 evidence digests and any `OPEN_FINDINGS.md` change the owner decides. It is **independently reviewed on its exact raw contents**, then follows S3 to S7 (`records_pr`, `records_accepted_head_sha`, `records_merge_sha`). Its reviewed path inventory names **neither policy document** (`STATE-004`, `STATE-007`) and `par_policy_pin` passes (V4). Nothing closes automatically | Owner acceptance | requires: S9 |
| S11 | Separate **lane approvals** (`V2-SHELL-01`, `AIX-CI-HARD-001` L-1), each citing `policy_merge_sha`, `supplement_merge_sha` and `records_merge_sha` | Owner (`STATE-004` activation gate 2) | requires: S10 |
| S12 | **Personal owner activation:** the browser-posted `AIX-PAR-001 STATE: ACTIVE` comment | Owner (`STATE-004` activation gate 3) | requires: S11 |

**Why this is not circular.** The owner's decision (S5) is made on a commit that already exists and is already published (S3, S4), so it can name its SHA. The reviewed contents are bound by raw digests (S2) that are checked against what is committed (S3) and again at the merge (S7). The merge is bound to the same head by `par_bind`. No step needs the merge SHA before the merge exists, and no file records its own hash.

**Additional ACTIVE-comment fields** (a missing or wrong field means `NOT_ACTIVE`): `supplement_pr`, `supplement_accepted_head_sha`, `supplement_merge_sha`, `amended_policy_blob_sha`, `records_pr`, `records_accepted_head_sha`, `records_merge_sha`, `lane_ruleset_id`, `controls_evidence_ref`. Before the comment, and at every session start or resume, all of these must pass (point-in-time, never reused):

- V1 every SHA is a complete lowercase 40-hex commit that `E rev-parse --verify --end-of-options "<sha>^{commit}"` prints back.
- V2 `par_rest_pr` (merged) passes for `supplement_pr` and for `records_pr`, each with `DECISION_AT` set to the `created_at` of the owner's decision comment for that pull request (mandatory).
- V3 `par_bind` (prospective) passes for both merges against their reviewed inventories; the `par_commit_bind` (S3) and `par_premerge` (S6) records are retained for both.
- V4 (N-3) `par_policy_pin` passes: for **both** policy documents (`STATE-004` and `STATE-007`) the blob at `supplement_merge_sha` equals the blob at `supplement_accepted_head_sha` and the blob at `records_merge_sha` (so neither changed after the accepted head, including in the records pull request); the `STATE-004` blob at `supplement_merge_sha` equals `amended_policy_blob_sha`; the same path at `policy_merge_sha` prints the historical blob `83d5cf1ddc16228b2d0ca8648e7b00b1bf882805` (the original identity, never replaced); and the reviewed inventory of the records pull request names neither document. Only existing commit and blob identities are used, so no file contains a hash of itself.
- V5 `policy_merge_sha` is an ancestor of `supplement_merge_sha`, which is an ancestor of `records_merge_sha`, which is an ancestor of every `ui_base_sha`, `ci_base_sha` and new approved base.
- V6 the canonical `AIX-PAR-002` acceptance record at `records_merge_sha` names `supplement_accepted_head_sha`, `amended_policy_blob_sha` and the S8/S9 evidence digests.
- V7 `par_lane_readback` passes freshly for `lane_ruleset_id`, and the owner has attested the bypass-actor list from the authenticated view.
- V8 the T-1 replay of §8.1 passes, **including the explicit adoption of item (iv)** (while T-1 is the only basis for the PR #19 gate-1 limitation). Without an explicit adoption T-1 is not an eligibility basis and activation stays prohibited.
- V9 `controls_evidence_ref` shows X1 read-back and probe passed, and X2 and X3 with **every** test classified TECHNICAL. A PROCEDURAL or UNVERIFIED X2 or X3 keeps activation prohibited; this supplement offers no waiver.

## 2. Remote reference capture and comparison (`PAR-N24`)

- **No pipeline whose exit status matters.** A capture is written to a file, its exit status is checked, and its content is validated before use.
- **Expected `main` is an explicit parameter of every capture**, and differs before and after a merge. Before a merge it is the pre-merge base `B`; after it, the merge `M` (read from REST and checked by §4). `HEAD` on GitHub follows the default branch, so after a merge `HEAD` and `refs/heads/main` move together and a capture requires them to be equal.
- A capture is **valid only if**: `ls-remote` exits 0; the output is non-empty; nothing is written to standard error; every line is exactly `<40 lowercase hex><TAB><name>`; no name repeats; `refs/heads/main` occurs exactly once and equals the expected value; `HEAD` occurs exactly once and equals `main`; and the **symbolic** `HEAD` (`ls-remote --symref`, one request) occurs exactly once and resolves to `refs/heads/main`, so a default-branch change to another branch that merely shares `main`'s SHA is `STOP`. The local configuration must contain no `url.*` rewrite key and every repository-local and worktree key must pass the allowlist `par_cfg_gate` (§3, H4), and the remote URL gate of `STATE-004` (PAR-N16) must have passed.
- **Permitted deltas** between two valid captures, by operation (`par_delta`; `continuity` is defined below): `none` for a fetch, a dry run, a gate or a rejected push (nothing may differ); `lane-push` requires `refs/heads/<lane>` to be added or changed to the pushed tip `t`, and permits, when the owner recorded pull request `n`, `refs/pull/<n>/head` changing to `t` and `refs/pull/<n>/merge` changing (GitHub generates both; they can lag about a minute, so an unchanged value is also acceptable and is reconciled by the continuity check); `merge` requires `refs/heads/main` and `HEAD` to move together from `B` to `M`, permits `refs/pull/<n>/merge` of the merged PR to change, requires `refs/pull/<n>/head` to stay unchanged, and permits `refs/pull/<m>/merge` **only** for pull requests the owner listed in `GHGEN` after reconciling each by REST (open, base `main`, unchanged head).
- **Nothing is silently exempt.** A `refs/pull/<m>/head`, a tag, a note, another branch, a removal or any other difference is `STOP` with the delta report retained. **Explicit reconciliation** is a separate owner record per unexpected reference (REST evidence, decision); it never rewrites a capture, and only a fresh valid capture made after the record becomes the new baseline.
- **Continuity:** each new `before` capture is compared with the last recorded `after` with `OP=continuity` (and the preceding operation's `PRN`, pushed tip `T` and reconciled `GHGEN`). It permits only the lagging GitHub-generated references (`refs/pull/<n>/head` arriving at `T`, `refs/pull/<n>/merge`, owner-reconciled `refs/pull/<m>/merge`) and requires nothing; anything else is `STOP`. **Without a pull request number** (after a fetch, a first push before a pull request exists, or a merge), `PRN` and `T` are both omitted and only owner-reconciled `refs/pull/<m>/merge` references (`GHGEN`) may differ; `T` without `PRN`, or `PRN` without `T`, is `STOP`. `LANE` must be one of the two approved lane branches (§6) in every operation that names one.

<!-- par-block: capture -->
```bash
# Source every block of this document, in the order shown, before using any function (a function may call one defined in another block).
# par_identity: the PAR-N16 remote identity gate, run with the operator's own configuration. Needs ROOT and EXPECTED_URL.
par_identity() {
  local a p
  a=$(git -C "$ROOT" remote get-url --all origin) || return 1
  p=$(git -C "$ROOT" remote get-url --all --push origin) || return 1
  [ -n "${EXPECTED_URL:-}" ] && [ "$a" = "$EXPECTED_URL" ] && [ "$p" = "$EXPECTED_URL" ] || { echo "IDENTITY STOP"; return 1; }
}
# par_capture <label> <expected_main>: fail-closed capture of the complete remote reference list into $D/<label>.txt.
# One request: ls-remote --symref. The symbolic HEAD must resolve to refs/heads/main (a branch that merely shares main's SHA is STOP).
par_capture() {
  local lbl=$1 em=${2:-} rc
  [ -n "${ROOT:-}" ] && [ -d "${D:-}" ] || { echo "CAPTURE STOP: ROOT or D unset"; return 1; }
  case "$em" in ""|*[!0-9a-f]*) echo "CAPTURE STOP: expected main is not lowercase hex"; return 1;; esac
  [ "${#em}" -eq 40 ] || { echo "CAPTURE STOP: expected main is not 40 characters"; return 1; }
  E config --get-regexp '^url\.' >/dev/null 2>&1; rc=$?
  [ "$rc" -eq 1 ] || { echo "CAPTURE STOP: url rewrite key present or config unreadable (exit $rc)"; return 1; }
  par_cfg_gate >/dev/null || { echo "CAPTURE STOP: local configuration is outside the allowlist"; return 1; }
  CF ls-remote --symref origin >"$D/$lbl.raw" 2>"$D/$lbl.err"; rc=$?
  [ "$rc" -eq 0 ] || { echo "CAPTURE STOP: ls-remote exit $rc"; return 1; }
  [ -s "$D/$lbl.raw" ] || { echo "CAPTURE STOP: empty output"; return 1; }
  [ ! -s "$D/$lbl.err" ] || { echo "CAPTURE STOP: diagnostics on standard error"; return 1; }
  : >"$D/$lbl.symref"; : >"$D/$lbl.refs"
  LC_ALL=C awk -v sf="$D/$lbl.symref" -v rf="$D/$lbl.refs" '/^ref: / { print > sf; next } { print > rf }' "$D/$lbl.raw" || { echo "CAPTURE STOP: split failed"; return 1; }
  [ "$(wc -l <"$D/$lbl.symref" | tr -d ' ')" -eq 1 ] && [ "$(cat "$D/$lbl.symref")" = "$(printf 'ref: refs/heads/main\tHEAD')" ] || { echo "CAPTURE STOP: symbolic HEAD is missing, repeated or does not resolve to refs/heads/main"; return 1; }
  [ -s "$D/$lbl.refs" ] || { echo "CAPTURE STOP: no references"; return 1; }
  LC_ALL=C awk -F'\t' -v main="$em" '
    NF != 2 { print "bad field count, line " NR; bad = 1; next }
    length($1) != 40 || $1 !~ /^[0-9a-f]+$/ { print "bad object id, line " NR; bad = 1 }
    $2 !~ /^(HEAD|refs\/[!-~]+)$/ { print "bad reference name, line " NR; bad = 1 }
    seen[$2]++ { print "duplicate reference " $2; bad = 1 }
    $2 == "refs/heads/main" { m++; ms = $1; if ($1 != main) { print "main is " $1 ", expected " main; bad = 1 } }
    $2 == "HEAD" { h++; hs = $1 }
    END {
      if (m != 1) { print "refs/heads/main occurs " m+0 " times"; bad = 1 }
      if (h != 1) { print "HEAD occurs " h+0 " times"; bad = 1 } else if (hs != ms) { print "HEAD differs from main"; bad = 1 }
      exit bad
    }' "$D/$lbl.refs" || { echo "CAPTURE STOP: validation failed"; return 1; }
  LC_ALL=C sort "$D/$lbl.refs" >"$D/$lbl.txt" || return 1
  echo "CAPTURE OK $lbl"
}
```

<!-- par-block: delta -->
```bash
# par_delta <before.txt> <after.txt>   env: OP=none|lane-push|merge|continuity, LANE (an approved lane), T, PRN, B, M, GHGEN (space-separated PR numbers)
# continuity: PRN and T are optional together (both or neither); without them only owner-reconciled GHGEN merge references may differ.
par_delta() {
  local bf=${1:-} af=${2:-} x v
  [ -s "$bf" ] && [ -s "$af" ] || { echo "DELTA STOP: capture missing"; return 1; }
  case "${OP:-}" in
    none) ;;
    lane-push) for x in T; do v=${!x:-}; case "$v" in ""|*[!0-9a-f]*) echo "DELTA STOP: $x not lowercase hex"; return 1;; esac; [ "${#v}" -eq 40 ] || { echo "DELTA STOP: $x not 40 characters"; return 1; }; done
               par_lane_ok "${LANE:-}" || { echo "DELTA STOP: LANE is not one of the two approved lane branches"; return 1; } ;;
    continuity) if [ -n "${PRN:-}" ]; then
                  v=${T:-}; case "$v" in ""|*[!0-9a-f]*) echo "DELTA STOP: T not lowercase hex"; return 1;; esac; [ "${#v}" -eq 40 ] || { echo "DELTA STOP: T not 40 characters"; return 1; }
                else [ -z "${T:-}" ] || { echo "DELTA STOP: T given without PRN"; return 1; }; fi ;;
    merge) for x in B M; do v=${!x:-}; case "$v" in ""|*[!0-9a-f]*) echo "DELTA STOP: $x not lowercase hex"; return 1;; esac; [ "${#v}" -eq 40 ] || { echo "DELTA STOP: $x not 40 characters"; return 1; }; done
           [ -n "${PRN:-}" ] || { echo "DELTA STOP: PRN unset"; return 1; } ;;
    *) echo "DELTA STOP: unknown OP"; return 1 ;;
  esac
  LC_ALL=C awk -F'\t' -v op="$OP" -v lane="${LANE:-}" -v t="${T:-}" -v prn="${PRN:-}" -v b="${B:-}" -v m="${M:-}" -v gh=" ${GHGEN:-} " '
    FNR == NR { bef[$2] = $1; next }
    { aft[$2] = $1 }
    END {
      for (r in bef) u[r] = 1
      for (r in aft) u[r] = 1
      for (r in u) {
        bs = (r in bef) ? bef[r] : "-"; as = (r in aft) ? aft[r] : "-"
        if (bs == as) continue
        cls = (bs == "-") ? "added" : ((as == "-") ? "removed" : "changed")
        ok = 0; why = ""
        if (op == "lane-push" && r == ("refs/heads/" lane) && cls != "removed" && as == t) { ok = 1; reqa = 1; why = "required lane update" }
        else if (op == "lane-push" && prn != "" && r == ("refs/pull/" prn "/head") && cls != "removed" && as == t) { ok = 1; why = "GitHub-generated pull head equal to the pushed tip" }
        else if (op == "lane-push" && prn != "" && r == ("refs/pull/" prn "/merge")) { ok = 1; why = "GitHub-generated test-merge reference" }
        else if (op == "merge" && r == "refs/heads/main" && cls == "changed" && bs == b && as == m) { ok = 1; reqa = 1; why = "required main advance B to M" }
        else if (op == "merge" && r == "HEAD" && cls == "changed" && bs == b && as == m) { ok = 1; reqh = 1; why = "HEAD follows main" }
        else if (op == "continuity" && prn != "" && r == ("refs/pull/" prn "/head") && cls != "removed" && as == t) { ok = 1; why = "late GitHub refresh of the pull head to the pushed tip" }
        else if (op == "continuity" && prn != "" && r == ("refs/pull/" prn "/merge")) { ok = 1; why = "late GitHub refresh of the test-merge reference" }
        else if (op == "merge" && r == ("refs/pull/" prn "/merge")) { ok = 1; why = "GitHub-generated merge reference of the merged PR" }
        else if ((op == "merge" || op == "continuity") && r ~ /^refs\/pull\/[0-9]+\/merge$/) {
          n = r; sub(/^refs\/pull\//, "", n); sub(/\/merge$/, "", n)
          if (index(gh, " " n " ") > 0) { ok = 1; why = "GitHub-generated merge reference of owner-reconciled PR " n }
        }
        if (ok) print "ALLOWED " cls " " r " " bs " " as " (" why ")"
        else { print "STOP unexpected " cls " " r " " bs " " as; bad = 1 }
      }
      if (op == "lane-push" && !reqa) { print "STOP required change missing: refs/heads/" lane; bad = 1 }
      if (op == "merge" && (!reqa || !reqh)) { print "STOP required change missing: main and HEAD must both advance"; bad = 1 }
      exit bad
    }' "$bf" "$af"
}
```

## 3. Hook inventory, fetch and push forms (`PAR-N22`)

Immediately before every operator fetch or push, after gates (a)–(f) and the remote identity gate of `STATE-004` have passed in that shell:

- **H1** every entry directly under `<common>/hooks` (dotfiles, symlinks and directories included) ends in `.sample`; **H2** `core.hooksPath` is set in no scope the operator's Git reads; **H3** with `-c core.hooksPath=/dev/null`, `rev-parse --git-path hooks/reference-transaction` prints `/dev/null/reference-transaction`. **H4** (`par_cfg_gate`): every key of the repository-local and worktree configuration (names only, never values) must be on a justified allowlist: `core.repositoryformatversion`, `filemode`, `bare`, `logallrefupdates`, `ignorecase`, `precomposeunicode`; `remote.origin.url` and `remote.origin.fetch`; `user.name` and `user.email`; and `branch.<name>.remote`, `.merge` and `.vscode-merge-base`. Any other key is `STOP`; in particular `remote.<name>.vcs`, `uploadpack`, `receivepack`, `proxy` and `pushurl`, `url.*`, `http.*`, `include*`, `core.sshCommand`, `core.gitProxy`, `core.askpass`, `core.hooksPath`, `core.fsmonitor`, `filter.*` and `credential.*` select an executable, a transport, a redirect, an include or a hook location, and a second remote is not permitted. For a push the gate also runs in `operator` mode over every scope the operator's Git reads and rejects the same executable, transport, redirect, include and hook keys there (the owner's own `credential.*` channel is not judged by it). These are inventory checks. The hook-disabling option on the command itself is what prevents execution (T06), so both are required.
- **Fetch** (the PAR-N8 fetch as replaced by the amended `STATE-004`, credential-free): `par_fetch_main`, which also runs the remote identity gate and `par_cfg_gate` itself. The owner must separately authorise each fetch. The authorised-by-SHA form used to add one commit object without touching references is a separate owner instruction and is not part of this procedure.
- **Push** (PAR-N16 as replaced by the amended `STATE-004`; the owner runs it personally, §5.3): `par_push`. It adds `-c core.hooksPath=/dev/null` to the quoted push command (the amended `STATE-004` permits that option next to `--no-verify`; this is stricter, not a relaxation) and **accepts only three invocation forms**: no argument, `--porcelain`, and `--dry-run --porcelain` in that order. Force, deletion, mirror, all-refs, tags, upstream, other remotes, other refspecs and any unexpected argument are `STOP`. Only `origin` and only the two approved lane branches (§6) are possible, the refspec is fixed to `refs/heads/<lane>:refs/heads/<lane>`, and the remote identity gate and `par_cfg_gate operator` run first.
- **Around each operation** capture the complete remote list (§2) and the local state with `par_local_state` before and after. The local comparison (`par_local_delta`) permits only the named remote-tracking reference to change, to its expected value, and a symbolic reference that points at it (`refs/remotes/origin/HEAD`) to follow it with an unchanged target; refs, `HEAD`, the configuration digest and the hooks digest must otherwise be identical. Only digests of configuration output are retained, never values.
- Any failure is `STOP`; an unexpected mutation is `STOPPED` under `STATE-004`.

<!-- par-block: hooks -->
```bash
# par_cfg_gate [operator]: fail-closed gate on configuration KEY NAMES (values are never read or printed). Needs ROOT.
#  * Local and worktree scope (the only scopes CF and E read): every key must match the allowlist, which is exactly what a plain clone,
#    a lane branch and the pinned remote need. Any other key is STOP, because remote.<n>.vcs, uploadpack, receivepack, proxy, pushurl,
#    url.*, http.*, include.*, core.sshCommand, core.gitProxy, core.askpass, core.hooksPath, core.fsmonitor, filter.* and credential.*
#    select an executable, a transport, a redirect, an include or a hook location.
#  * 'operator': additionally, in every scope the operator's own Git reads, the same executable/transport/redirect/include/hook keys are STOP
#    (credential.* is the owner's own channel and is not judged here; the identity gate and X2 cover it).
par_cfg_gate() {
  local mode=${1:-} names bad
  names=$(E config --list --show-scope --name-only) || { echo "CFG STOP: configuration unreadable"; return 1; }
  bad=$(printf '%s\n' "$names" | awk -F'\t' '
    $1 == "command" && tolower($2) ~ /^(core\.fsmonitor|core\.commitgraph|advice\.graftfiledeprecated)$/ { next }
    ($1 == "local" || $1 == "worktree") && tolower($2) ~ /^(core\.(repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode)|remote\.origin\.(url|fetch)|user\.(name|email)|branch\..+\.(remote|merge|vscode-merge-base))$/ { next }
    { print $1 "\t" $2 }')
  [ -z "$bad" ] || { echo "CFG STOP: keys outside the allowlist (names only):"; printf '%s\n' "$bad" | sed 's/^/  /'; return 1; }
  if [ "$mode" = operator ]; then
    names=$(git -C "$ROOT" config --list --show-scope --name-only) || { echo "CFG STOP: operator configuration unreadable"; return 1; }
    bad=$(printf '%s\n' "$names" | awk -F'\t' 'tolower($2) ~ /^(core\.(sshcommand|gitproxy|askpass|fsmonitor|hookspath)|http\.|https\.|url\.|include\.|includeif\.|remote\..+\.(vcs|uploadpack|receivepack|proxy|pushurl|promisor)|protocol\.|filter\.|gpg\.program|transfer\.)/ { print $1 "\t" $2 }')
    [ -z "$bad" ] || { echo "CFG STOP: operator keys that select an executable, transport, redirect, include or hook (names only):"; printf '%s\n' "$bad" | sed 's/^/  /'; return 1; }
  fi
  echo "CFG PASS"
}
par_hooks() {   # par_hooks [operator]
  local c f rc
  c=$(E rev-parse --path-format=absolute --git-common-dir) && [ -n "$c" ] || { echo "H0 STOP: no common directory"; return 1; }
  [ -d "$c/hooks" ] && [ ! -L "$c/hooks" ] || { echo "H1 STOP: hooks directory missing or a symlink"; return 1; }
  find "$c/hooks" -mindepth 1 -maxdepth 1 -print0 >"$D/hooks.lst" || { echo "H1 STOP: listing failed"; return 1; }
  while IFS= read -r -d '' f; do
    case "$f" in *.sample) ;; *) echo "H1 STOP: non-sample hook entry ${f##*/}"; return 1;; esac
  done <"$D/hooks.lst"
  git -C "$ROOT" config --get-all core.hooksPath >/dev/null 2>&1; rc=$?
  [ "$rc" -eq 1 ] || { echo "H2 STOP: core.hooksPath is set or configuration unreadable (exit $rc)"; return 1; }
  [ "$(git -C "$ROOT" -c core.hooksPath=/dev/null rev-parse --git-path hooks/reference-transaction 2>/dev/null)" = "/dev/null/reference-transaction" ] || { echo "H3 STOP: hooks path override ineffective"; return 1; }
  par_cfg_gate "${1:-}" >"$D/cfg.out" || { echo "H4 STOP: $(cat "$D/cfg.out")"; return 1; }
  echo "H1-H4 PASS"
}
par_hooks_hash() {   # par_hooks_hash <label>: digest of the hooks directory (entries and file contents)
  local c; c=$(E rev-parse --path-format=absolute --git-common-dir) && [ -n "$c" ] || return 1
  ( cd "$c/hooks" && find . -mindepth 1 \( -type f -exec shasum -a 256 {} + \) -o -print ) >"$D/hooks.$1.txt" || return 1
  LC_ALL=C sort "$D/hooks.$1.txt" -o "$D/hooks.$1.txt" || return 1
  shasum -a 256 <"$D/hooks.$1.txt" | cut -d' ' -f1
}
par_local_state() {   # par_local_state <label>: refs, HEAD, configuration digests, hooks digest (no configuration values stored)
  local c cfg hk
  c=$(E rev-parse --path-format=absolute --git-common-dir) && [ -n "$c" ] || return 1
  E for-each-ref --format='%(objectname) %(refname) symref=%(symref)' >"$D/$1.local" || return 1
  E config --list --show-origin -z >"$D/$1.cfg.tmp" || return 1
  cfg=$(shasum -a 256 <"$D/$1.cfg.tmp" | cut -d' ' -f1); rm -f "$D/$1.cfg.tmp"
  hk=$(par_hooks_hash "$1") || return 1
  { echo "HEAD $(E symbolic-ref -q HEAD) $(E rev-parse --verify HEAD)"
    echo "config $cfg"
    echo "configfile $(shasum -a 256 <"$c/config" | cut -d' ' -f1)"
    echo "hooks $hk"; } >>"$D/$1.local"
}
# par_local_delta <before> <after> <ref>=<expected_sha>: only that reference may differ, and must equal the expected value.
# A symbolic reference that points at it (refs/remotes/origin/HEAD) may follow it; its target must be the same before and after.
par_local_delta() {
  local ref=${3%%=*} exp=${3#*=}
  grep -q -x -F "$exp $ref symref=" "$D/$2.local" || { echo "LOCAL STOP: $ref is not $exp (or is symbolic)"; return 1; }
  awk -v r="$ref" '$2 == r { next } $3 == "symref=" r { print $2, $3; next } { print }' "$D/$1.local" >"$D/$1.local.f" || return 1
  awk -v r="$ref" '$2 == r { next } $3 == "symref=" r { print $2, $3; next } { print }' "$D/$2.local" >"$D/$2.local.f" || return 1
  cmp -s "$D/$1.local.f" "$D/$2.local.f" || { echo "LOCAL STOP: refs, configuration or hooks changed"; diff "$D/$1.local.f" "$D/$2.local.f" | head -5; return 1; }
  echo "LOCAL PASS"
}
par_local_unchanged() { cmp -s "$D/$1.local" "$D/$2.local" || { echo "LOCAL STOP: local state changed"; return 1; }; echo "LOCAL PASS (unchanged)"; }
```

<!-- par-block: fetchpush -->
```bash
# par_fetch_main: credential-free fetch of main into the remote-tracking reference only. Owner authorisation required for each use.
par_fetch_main() {
  par_identity || return 1
  par_cfg_gate >/dev/null || { echo "FETCH STOP: local configuration is outside the allowlist"; return 1; }
  CF fetch --no-tags --no-write-fetch-head --no-recurse-submodules --no-auto-maintenance origin refs/heads/main:refs/remotes/origin/main
}
# par_push <approved lane> [--porcelain | --dry-run --porcelain]: the owner's personal push (operator environment, so the owner's own credential
# method applies; an agent must never run it). Only these three argument forms, only origin, only the two approved lane branches and only the
# refspec refs/heads/<lane>:refs/heads/<lane> are possible. Force, deletion, mirror, all, tags, upstream, other destinations, other refspecs
# and any unexpected argument are STOP.
par_push() {
  local lane
  [ $# -ge 1 ] || { echo "PUSH STOP: no lane"; return 1; }
  lane=$1; shift
  par_lane_ok "$lane" || { echo "PUSH STOP: $lane is not one of the two approved lane branches"; return 1; }
  if [ $# -eq 0 ]; then :
  elif [ $# -eq 1 ] && [ "$1" = "--porcelain" ]; then :
  elif [ $# -eq 2 ] && [ "$1" = "--dry-run" ] && [ "$2" = "--porcelain" ]; then :
  else echo "PUSH STOP: only no argument, --porcelain, or --dry-run --porcelain is authorised"; return 1; fi
  par_identity || return 1
  par_cfg_gate operator >/dev/null || { echo "PUSH STOP: configuration gate failed"; return 1; }
  git --no-replace-objects -c core.hooksPath=/dev/null -c core.commitGraph=false -C "$ROOT" push --no-verify --no-follow-tags --no-recurse-submodules "$@" origin "refs/heads/$lane:refs/heads/$lane"
}
```

## 4. Exact-file merge binding (`PAR-N23`)

A reusable post-merge procedure for any merge on which the pilot depends: the supplement PR, the records PR and every lane PR. **Inputs:** `H` (the accepted head), `B` (the pre-merge `main`, from the §8.2 capture), `M` (the merge, from REST `merge_commit_sha`), `PZ` (the NUL-separated **exact path inventory the independent review approved**) and `PZ_SHA256` (its digest, recorded in the owner's decision), and, for a prospective merge, `PMS` (`policy_merge_sha`). An allowlist is not an inventory: a path that is merely permitted but absent from the reviewed inventory fails. **Before any merge** (steps S3 and S5) `par_commit_bind` checks the candidate commit itself, with the reviewed raw-file manifest `RAWMAN` (`<sha256>  <path>` lines) and its digest `RAWMAN_SHA256` in addition: the only parent of `H` is the approved base `B`; every committed file equals its reviewed raw digest; the changed paths equal `PZ`; the manifest paths equal `PZ`; every change is status `A` or `M` with mode `100644`. The bootstrap for the supplement and records pull requests is in §8.3.

All must hold (`par_bind`): complete lowercase 40-hex commits that exist; `M^1 = B`; `M^2 = H`; no `M^3`; `B` is an ancestor of `H`; **prospective mode only:** `PMS` is an ancestor of `B`; `M` and `H` have the same tree (exact reviewed content); `PZ` has the recorded digest, is non-empty, contains only safe relative paths (and, if `ALLOW_RE` is set, only paths matching it); the sorted changed-path set `B..M` equals the sorted `PZ`; every change is status `A` or `M` with mode `100644` (`100755`, symlinks, gitlinks, deletions, renames and type changes are `STOP`; a lane that needs an executable file needs a separate reviewed extension).

- **Two modes, never mixed.** *Historical replay* (`MODE=historical`) re-checks a merge that predates this supplement and does **not** require `PMS` to be an ancestor of `B`: PR #19's base `c995e0f…` cannot contain its own future merge `26558507…`. *Prospective* (`MODE=prospective`) is the rule for every merge after the policy merge.
- **PR #19** passed an exact-file check (one path, `CLAUDE_CODE_USAGE_RULES.md`) in `tasks/AIX-PAR-001/03-evidence.md` §12. That historical result is unchanged. The prepared tests replay it in historical mode; the replay does not re-establish anything the original check did not.
- **Policy pin (N-3).** `par_policy_pin` (end of the `bind` block) checks the two policy documents by blob identity across `policy_merge_sha`, `supplement_accepted_head_sha`, `supplement_merge_sha` and `records_merge_sha`, and refuses a records pull request whose reviewed inventory names either document. It is a separate check from `par_bind`; V4 requires both.
- **Failure:** for a policy, supplement or records PR no activation; for a lane PR, `STOPPED`.

<!-- par-block: bind -->
```bash
# par_pz_load: validate the reviewed path inventory. env: PZ (NUL-separated file), PZ_SHA256, optional ALLOW_RE. Sets PAR_PZ_N.
par_pz_load() {
  local got path n=0
  [ -s "${PZ:-}" ] || { echo "BIND STOP: reviewed path inventory missing or empty"; return 1; }
  [ "$(tail -c 1 "$PZ" | od -An -tx1 | tr -d ' \n')" = "00" ] || { echo "BIND STOP: inventory is not NUL-terminated"; return 1; }
  case "${PZ_SHA256:-}" in ""|*[!0-9a-f]*) echo "BIND STOP: inventory digest malformed"; return 1;; esac
  [ "${#PZ_SHA256}" -eq 64 ] || { echo "BIND STOP: inventory digest is not 64 characters"; return 1; }
  got=$(shasum -a 256 <"$PZ" | cut -d' ' -f1); [ "$got" = "$PZ_SHA256" ] || { echo "BIND STOP: inventory digest mismatch"; return 1; }
  while IFS= read -r -d '' path; do
    case "$path" in ""|/*|..|../*|*/../*|*/..|.|./*|*/./*|*[[:cntrl:]]*) echo "BIND STOP: unsafe path in inventory"; return 1;; esac
    if [ -n "${ALLOW_RE:-}" ]; then [[ "$path" =~ $ALLOW_RE ]] || { echo "BIND STOP: $path is outside the allowlist"; return 1; }; fi
    n=$((n+1))
  done <"$PZ"
  PAR_PZ_N=$n
}
par_bind() {
  local x v r p1 p2 t1 t2 got meta path st nm n=0 mode="${MODE:-}" names="H B M"
  case "$mode" in prospective) names="H B M PMS";; historical) ;; *) echo "BIND STOP: MODE must be prospective or historical"; return 1;; esac
  [ -n "${ROOT:-}" ] && [ -d "${D:-}" ] || { echo "BIND STOP: ROOT or D unset"; return 1; }
  for x in $names; do
    v=${!x:-}
    case "$v" in ""|*[!0-9a-f]*) echo "BIND STOP: $x is not lowercase hex"; return 1;; esac
    [ "${#v}" -eq 40 ] || { echo "BIND STOP: $x is not 40 characters"; return 1; }
    r=$(E rev-parse --verify --end-of-options "$v^{commit}" 2>/dev/null) && [ "$r" = "$v" ] || { echo "BIND STOP: $x is not an existing commit"; return 1; }
  done
  p1=$(E rev-parse --verify --end-of-options "$M^1" 2>/dev/null) && [ "$p1" = "$B" ] || { echo "BIND STOP: first parent is not B"; return 1; }
  p2=$(E rev-parse --verify --end-of-options "$M^2" 2>/dev/null) && [ "$p2" = "$H" ] || { echo "BIND STOP: second parent is not H (not a normal two-parent merge of the accepted head)"; return 1; }
  if E rev-parse --verify --quiet --end-of-options "$M^3" >/dev/null 2>&1; then echo "BIND STOP: a third parent is present"; return 1; fi
  E merge-base --is-ancestor "$B" "$H"; r=$?; [ "$r" -eq 0 ] || { echo "BIND STOP: B is not an ancestor of H (exit $r)"; return 1; }
  if [ "$mode" = prospective ]; then
    E merge-base --is-ancestor "$PMS" "$B"; r=$?; [ "$r" -eq 0 ] || { echo "BIND STOP: policy merge is not an ancestor of B (exit $r)"; return 1; }
  fi
  t1=$(E rev-parse --verify --end-of-options "$M^{tree}") && t2=$(E rev-parse --verify --end-of-options "$H^{tree}") && [ -n "$t1" ] && [ "$t1" = "$t2" ] || { echo "BIND STOP: merged content differs from the reviewed head"; return 1; }
  par_pz_load || return 1; n=$PAR_PZ_N
  E diff --name-only -z --no-renames --ignore-submodules=none "$B" "$M" >"$D/bind.diff.z" || { echo "BIND STOP: diff failed"; return 1; }
  LC_ALL=C sort -z "$D/bind.diff.z" >"$D/bind.diff.sorted.z" && LC_ALL=C sort -z "$PZ" >"$D/bind.pz.sorted.z" || return 1
  cmp -s "$D/bind.diff.sorted.z" "$D/bind.pz.sorted.z" || { echo "BIND STOP: changed paths differ from the reviewed inventory"; return 1; }
  E diff --raw -z --no-renames --ignore-submodules=none "$B" "$M" >"$D/bind.raw.z" || { echo "BIND STOP: raw diff failed"; return 1; }
  while IFS= read -r -d '' meta && IFS= read -r -d '' path; do
    set -- $meta; st=${5:-}; nm=${2:-}
    case "$st" in A|M) ;; *) echo "BIND STOP: status $st for $path"; return 1;; esac
    [ "$nm" = 100644 ] || { echo "BIND STOP: mode $nm for $path"; return 1; }
  done <"$D/bind.raw.z"
  echo "BIND PASS ($mode): $n paths, tree $t1"
}
# par_premerge: retained pre-merge evidence (§8.2). env: PRN, H, B, PRE_REST (pulls/<n> JSON read immediately before the merge),
# PRE_CAP (valid capture .txt taken immediately before the merge, expected main = B). Missing evidence is STOP.
par_premerge() {
  local r
  [ -s "${PRE_REST:-}" ] && [ -s "${PRE_CAP:-}" ] || { echo "PREMERGE STOP: retained pre-merge evidence missing"; return 1; }
  par_rest_pr "$PRE_REST" no || return 1
  awk -F'\t' -v n="$PRN" -v h="$H" -v b="$B" '$2 == ("refs/pull/" n "/head") { ph = $1 } $2 == "refs/heads/main" { mn = $1 } END { exit !(ph == h && mn == b) }' "$PRE_CAP" || { echo "PREMERGE STOP: capture does not show refs/pull/<n>/head = H and main = B"; return 1; }
  E merge-base --is-ancestor "$B" "$H"; r=$?; [ "$r" -eq 0 ] || { echo "PREMERGE STOP: B is not an ancestor of H (exit $r)"; return 1; }
  echo "PREMERGE PASS"
}
# par_commit_bind: exact-candidate check of a commit H BEFORE any merge (steps S3 and S5, and the bootstrap of §8.3). env: H (candidate),
# B (approved base), PZ and PZ_SHA256 (reviewed inventory), RAWMAN (file of "<sha256>  <path>" lines: the reviewed raw digests) and
# RAWMAN_SHA256, optional ALLOW_RE. Needs ROOT and D. No network, no write outside D.
par_commit_bind() {
  local x v r p got line pth dg st nm n=0
  [ -n "${ROOT:-}" ] && [ -d "${D:-}" ] || { echo "COMMIT STOP: ROOT or D unset"; return 1; }
  for x in H B; do
    v=${!x:-}
    case "$v" in ""|*[!0-9a-f]*) echo "COMMIT STOP: $x is not lowercase hex"; return 1;; esac
    [ "${#v}" -eq 40 ] || { echo "COMMIT STOP: $x is not 40 characters"; return 1; }
    r=$(E rev-parse --verify --end-of-options "$v^{commit}" 2>/dev/null) && [ "$r" = "$v" ] || { echo "COMMIT STOP: $x is not an existing commit"; return 1; }
  done
  p=$(E rev-parse --verify --end-of-options "$H^1" 2>/dev/null) && [ "$p" = "$B" ] || { echo "COMMIT STOP: the parent of H is not the approved base B"; return 1; }
  if E rev-parse --verify --quiet --end-of-options "$H^2" >/dev/null 2>&1; then echo "COMMIT STOP: H has more than one parent"; return 1; fi
  par_pz_load || return 1
  [ -s "${RAWMAN:-}" ] || { echo "COMMIT STOP: reviewed raw-file manifest missing or empty"; return 1; }
  case "${RAWMAN_SHA256:-}" in ""|*[!0-9a-f]*) echo "COMMIT STOP: manifest digest malformed"; return 1;; esac
  [ "${#RAWMAN_SHA256}" -eq 64 ] || { echo "COMMIT STOP: manifest digest is not 64 characters"; return 1; }
  got=$(shasum -a 256 <"$RAWMAN" | cut -d' ' -f1); [ "$got" = "$RAWMAN_SHA256" ] || { echo "COMMIT STOP: manifest digest mismatch"; return 1; }
  E diff --name-only -z --no-renames --ignore-submodules=none "$B" "$H" >"$D/commit.diff.z" || { echo "COMMIT STOP: diff failed"; return 1; }
  LC_ALL=C sort -z "$D/commit.diff.z" >"$D/commit.diff.sorted.z" && LC_ALL=C sort -z "$PZ" >"$D/commit.pz.sorted.z" || return 1
  cmp -s "$D/commit.diff.sorted.z" "$D/commit.pz.sorted.z" || { echo "COMMIT STOP: changed paths differ from the reviewed inventory"; return 1; }
  E diff --raw -z --no-renames --ignore-submodules=none "$B" "$H" >"$D/commit.raw.z" || { echo "COMMIT STOP: raw diff failed"; return 1; }
  while IFS= read -r -d '' meta && IFS= read -r -d '' pth; do
    set -- $meta; st=${5:-}; nm=${2:-}
    case "$st" in A|M) ;; *) echo "COMMIT STOP: status $st for $pth"; return 1;; esac
    [ "$nm" = 100644 ] || { echo "COMMIT STOP: mode $nm for $pth"; return 1; }
  done <"$D/commit.raw.z"
  : >"$D/commit.man.paths"
  while IFS= read -r line; do
    [[ "$line" =~ ^([0-9a-f]{64})\ \ (.+)$ ]] || { echo "COMMIT STOP: malformed manifest line"; return 1; }
    dg=${BASH_REMATCH[1]}; pth=${BASH_REMATCH[2]}
    E cat-file blob "$H:$pth" >"$D/commit.blob" 2>/dev/null || { echo "COMMIT STOP: $pth is not a blob at H"; return 1; }
    got=$(shasum -a 256 <"$D/commit.blob" | cut -d' ' -f1); [ "$got" = "$dg" ] || { echo "COMMIT STOP: committed content of $pth differs from the reviewed raw digest"; return 1; }
    printf '%s\n' "$pth" >>"$D/commit.man.paths"; n=$((n+1))
  done <"$RAWMAN"
  tr '\0' '\n' <"$PZ" | LC_ALL=C sort >"$D/commit.pz.paths"; LC_ALL=C sort "$D/commit.man.paths" >"$D/commit.man.sorted"
  [ -z "$(uniq -d "$D/commit.pz.paths")$(uniq -d "$D/commit.man.sorted")" ] || { echo "COMMIT STOP: duplicate path"; return 1; }
  cmp -s "$D/commit.pz.paths" "$D/commit.man.sorted" || { echo "COMMIT STOP: manifest paths differ from the reviewed inventory"; return 1; }
  echo "COMMIT BIND PASS: $n files, tree $(E rev-parse --verify --end-of-options "$H^{tree}")"
}
# par_policy_pin (N-3): both policy documents at the records merge are the very blobs accepted at the supplement merge, and the records pull
# request's reviewed inventory names neither. env: PMS (policy_merge_sha), SH (supplement_accepted_head_sha), SM (supplement_merge_sha),
# RM (records_merge_sha), AB (amended_policy_blob_sha), PZ and PZ_SHA256 (the RECORDS pull request's reviewed inventory). Needs ROOT and D.
PAR_POL_004=docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md
PAR_POL_007=docs/00_project_state/AIX_PAR_001_PRE_ACTIVATION_SUPPLEMENT.md
PAR_BLOB_HIST=83d5cf1ddc16228b2d0ca8648e7b00b1bf882805
par_policy_pin() {
  local x v r path a b c t pz
  [ -n "${ROOT:-}" ] && [ -d "${D:-}" ] || { echo "PIN STOP: ROOT or D unset"; return 1; }
  for x in PMS SH SM RM AB; do
    v=${!x:-}
    case "$v" in ""|*[!0-9a-f]*) echo "PIN STOP: $x is not lowercase hex"; return 1;; esac
    [ "${#v}" -eq 40 ] || { echo "PIN STOP: $x is not 40 characters"; return 1; }
  done
  for x in PMS SH SM RM; do
    v=${!x}; r=$(E rev-parse --verify --end-of-options "$v^{commit}" 2>/dev/null) && [ "$r" = "$v" ] || { echo "PIN STOP: $x is not an existing commit"; return 1; }
  done
  E merge-base --is-ancestor "$PMS" "$SM"; r=$?; [ "$r" -eq 0 ] || { echo "PIN STOP: policy merge is not an ancestor of the supplement merge (exit $r)"; return 1; }
  E merge-base --is-ancestor "$SM" "$RM"; r=$?; [ "$r" -eq 0 ] || { echo "PIN STOP: supplement merge is not an ancestor of the records merge (exit $r)"; return 1; }
  for path in "$PAR_POL_004" "$PAR_POL_007"; do
    a=$(E rev-parse --verify --end-of-options "$SM:$path" 2>/dev/null) && b=$(E rev-parse --verify --end-of-options "$SH:$path" 2>/dev/null) && c=$(E rev-parse --verify --end-of-options "$RM:$path" 2>/dev/null) || { echo "PIN STOP: ${path##*/} is missing at the supplement head, supplement merge or records merge"; return 1; }
    t=$(E cat-file -t "$a" 2>/dev/null); [ "$t" = blob ] || { echo "PIN STOP: ${path##*/} is not a regular blob"; return 1; }
    [ "$a" = "$b" ] || { echo "PIN STOP: ${path##*/} at the supplement merge differs from the accepted head"; return 1; }
    [ "$a" = "$c" ] || { echo "PIN STOP: ${path##*/} changed between the supplement merge and the records merge"; return 1; }
  done
  [ "$(E rev-parse --verify --end-of-options "$SM:$PAR_POL_004")" = "$AB" ] || { echo "PIN STOP: STATE-004 at the supplement merge is not the amended blob"; return 1; }
  [ "$(E rev-parse --verify --end-of-options "$PMS:$PAR_POL_004" 2>/dev/null)" = "$PAR_BLOB_HIST" ] || { echo "PIN STOP: STATE-004 at the policy merge is not the historical blob"; return 1; }
  [ "$AB" != "$PAR_BLOB_HIST" ] || { echo "PIN STOP: the amended blob equals the historical blob"; return 1; }
  par_pz_load || return 1
  while IFS= read -r -d '' pz; do
    [ "$pz" != "$PAR_POL_004" ] && [ "$pz" != "$PAR_POL_007" ] || { echo "PIN STOP: the records inventory names a policy document ($pz)"; return 1; }
  done <"$PZ"
  echo "PIN PASS"
}
```

<!-- par-block: rest -->
```bash
# par_rest_pr <pulls-n.json> <yes|no>   env: PRN, H, M (when yes), DECISION_AT (mandatory when yes: UTC time of the owner decision comment; merged_at must be later)
# Reads a saved REST response; fields are checked as present, never assumed.
par_rest_pr() {
  python3 -I - "${1:-}" "${2:-}" "${PRN:-}" "${H:-}" "${M:-}" "${DECISION_AT:-}" <<'PY'
import json, re, sys
PAT = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")
f, merged, n, h, m, decision = sys.argv[1:7]
bad = []
try:
    d = json.load(open(f))
except Exception as e:
    print("REST STOP: unreadable response"); sys.exit(1)
def need(ok, what):
    if not ok: bad.append(what)
need(str(d.get("number")) == n, "number")
need((d.get("base") or {}).get("ref") == "main", "base.ref")
need((d.get("head") or {}).get("sha") == h, "head.sha")
if merged == "yes":
    need(d.get("merged") is True, "merged")
    need(bool(d.get("merged_at")), "merged_at")
    need(d.get("state") == "closed", "state")
    need(d.get("merge_commit_sha") == m, "merge_commit_sha")
    ma = d.get("merged_at")
    need(bool(PAT.match(decision or "")), "DECISION_AT is required (UTC YYYY-MM-DDTHH:MM:SSZ)")
    need(isinstance(ma, str) and bool(PAT.match(ma)), "merged_at format")
    if PAT.match(decision or "") and isinstance(ma, str) and PAT.match(ma): need(ma > decision, "merge after the owner decision")
else:
    need(d.get("state") == "open", "state open")
    need(d.get("merged") is False, "merged false")
print("REST STOP: " + ", ".join(bad) if bad else "REST PASS")
sys.exit(1 if bad else 0)
PY
}
# par_t1_adopted <issue-comment.json>   env: OWNER_LOGIN, H (supplement_accepted_head_sha), DECISION_AT (the comment's created_at)
# N-4, hardened in R3 (L-2): T-1 counts only if the exact-head S5 decision comment ADOPTS it. The body must be plain ASCII (tab, CR, LF, 0x20-0x7E);
# exactly ONE line may name the field supplement_accepted_head_sha and it must be exactly "supplement_accepted_head_sha: <H>"; exactly ONE line may
# mention T-1 IN ANY SPELLING (T-1, T1, t 1, T-01, ...) and it must be exactly "T-1: ADOPTED". Rejected, omitted, reworded, repeated, contradictory
# or ambiguous declarations are STOP. Reads a saved REST response.
par_t1_adopted() {
  python3 -I - "${1:-}" "${OWNER_LOGIN:-}" "${H:-}" "${DECISION_AT:-}" <<'PY'
import json, re, sys
PAT = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")
f, owner, h, decision = sys.argv[1:5]
bad = []
try:
    c = json.load(open(f))
except Exception:
    print("T1 STOP: unreadable response"); sys.exit(1)
if not isinstance(c, dict):
    print("T1 STOP: not a comment object"); sys.exit(1)
def need(ok, what):
    if not ok: bad.append(what)
need(bool(owner) and (c.get("user") or {}).get("login") == owner, "author is not OWNER_LOGIN")
need(bool(PAT.match(decision or "")), "DECISION_AT is required (UTC YYYY-MM-DDTHH:MM:SSZ)")
need(c.get("created_at") == decision, "created_at differs from DECISION_AT")
need(c.get("updated_at") == c.get("created_at"), "comment edited or timestamps missing")
need(bool(re.fullmatch(r"[0-9a-f]{40}", h or "")), "H is not a lowercase 40-hex SHA")
body = c.get("body")
need(isinstance(body, str), "body missing")
if isinstance(body, str):
    need(re.fullmatch(r"[\t\n\r\x20-\x7e]*", body) is not None, "body is not plain ASCII (a control or non-ASCII character)")
    lines = re.split(r"\r\n|\r|\n", body)   # CR LF, CR and LF all end a line
    need(not body.startswith(("AIX-PAR-001 STATE:", "AIX-PAR-001 LANE-RESUME:")), "begins with a state token")
    field = "supplement_accepted_head_sha"
    need([l for l in lines if field in l.lower()] == [field + ": " + (h or "")], "the accepted-head line is missing, repeated, altered or has another value")
    mentions = [l for l in lines if re.search(r"(?<![a-z0-9])t[^a-z0-9]*0*1(?![a-z0-9])", l.lower())]
    need(mentions == ["T-1: ADOPTED"], "T-1 decision is missing, is a rejection, is reworded, is ambiguous or is mentioned more than once")
print("T1 STOP: " + ", ".join(bad) if bad else "T1 ADOPTED")
sys.exit(1 if bad else 0)
PY
}
```

## 5. Credential isolation and agent capability boundary (`PAR-N29`)

### 5.1 What each mechanism proves

| Mechanism | Class | What it shows | What it does **not** show |
|---|---|---|---|
| `credential.helper=` on a command | PROCEDURAL | Helpers configured in Git are not consulted by that command | It does not remove inherited tokens, askpass, `http.*` authentication or header configuration, URL credentials, `~/.netrc`, other tools, connectors or browser automation; and an agent can run a different command |
| `CF` (empty environment, no user or system Git configuration, askpass disabled, helpers reset, hooks off) | PROCEDURAL | A specific read-only operation was constructed without the session's inherited environment or helper configuration | It is not a boundary on the agent. Whether, and when, any tool (Git's HTTP library, `curl`, others) consults `~/.netrc` or another credential store is **UNVERIFIED** and was not tested against real files; the required boundary is that no credential store is reachable from the agent environment (X2) |
| `par_cred_inventory` | PROCEDURAL | Names of risky environment variables and configuration keys are absent from the session | Values, credential stores, keychain reachability, connectors, browser or computer-use tools |
| `par_trace_check` on a redacted `GIT_TRACE_CURL` trace | PROCEDURAL, per operation | That operation sent no `Authorization`, `Proxy-Authorization` or `Cookie` header and received no authentication challenge | Anything about other operations |
| Stored credentials unreachable from the agent's execution environment, verified by owner tests (X2) | TECHNICAL, if the tests pass | The agent cannot use the owner's credential | — |

A prompt restriction is **not** equivalent to a technical permission restriction. GitHub fine-grained tokens cannot restrict individual comment contents (an `Issues` write permission allows any comment), so **the enforceable boundary is that no write-capable credential or channel exists in the agent's environment**; there is no permission that lets an agent post an owner comment but not a `STATE` comment. Domain-level network filtering cannot separate GitHub reads from writes (one host serves both).

### 5.2 Credential-free reads and the inventory

Agents may read GitHub through `CF ls-remote` and unauthenticated REST reads only. For each operation that is to be called credential-free, run `par_cred_inventory` and `par_trace_check` (with `CF_EXTRA="GIT_TRACE_CURL=<file> GIT_TRACE_CURL_NO_DATA=1"` and `GIT_TRACE_REDACT` unset). Configuration inspection prints key names and scopes only, never values. The macOS Command Line Tools system Git configuration registers a credential helper (key name and file only inspected; no value read); `CF` ignores system and user configuration, and any plain-Git control test must set `GIT_CONFIG_NOSYSTEM=1` so that it cannot reach that helper. Names that the session legitimately needs are listed by the owner in `ENV_ALLOW_FILE` (one name per line) and recorded; the allowlist is part of the evidence.

<!-- par-block: credential -->
```bash
# par_cred_inventory: names only; never prints a value. env: ENV_ALLOW_FILE (optional). Needs ROOT, D.
par_cred_inventory() {
  local bad al="${ENV_ALLOW_FILE:-/dev/null}" fail=0 u
  bad=$(env | cut -d= -f1 | grep -i -E '(^|_)(TOKEN|SECRET|PASSWORD|PASSWD|PAT|APIKEY|API_KEY)$|ASKPASS|NETRC|CREDENTIAL|^GH_|^GITHUB_|^GCM_|^GIT_(SSH|HTTP|CURL|SSL|CONFIG|PROXY|EXTERNAL)|^(HTTPS?|ALL)_PROXY$|^SSH_AUTH_SOCK$' | grep -v -x -F -f "$al")
  if [ -n "$bad" ]; then echo "CRED STOP: risky environment variable names:"; echo "$bad" | sed 's/^/  /'; fail=1; fi
  E config --list --show-scope --name-only >"$D/cred.cfgnames" || { echo "CRED STOP: configuration unreadable"; return 1; }
  bad=$(grep -v -i -E '^command[[:space:]]' "$D/cred.cfgnames" | grep -i -E '^[a-z]+[[:space:]](credential\.|http\.|https\.|url\.|include\.|includeif\.|core\.(askpass|sshcommand|gitproxy|fsmonitor|hookspath)|remote\..+\.(pushurl|proxy|vcs|uploadpack|receivepack|promisor)|protocol\.|filter\.|gpg\.program)')
  if [ -n "$bad" ]; then echo "CRED STOP: risky configuration keys (names only):"; echo "$bad" | sed 's/^/  /'; fail=1; fi
  for u in "$(E remote get-url --all origin)" "$(E remote get-url --all --push origin)"; do
    case "$u" in *://*@*) echo "CRED STOP: remote URL carries credentials or userinfo"; fail=1;; esac
  done
  echo "CRED NOT CHECKED BY MACHINE: credential stores and keychain reachability, ~/.netrc, connector scopes, browser and computer-use tools, harness-internal credentials (X2, owner-run)"
  [ "$fail" -eq 0 ] && echo "CRED PASS (inventory only)"
  return $fail
}
# par_trace_check <redacted-trace-file>
par_trace_check() {
  local f=${1:-}
  [ -s "$f" ] || { echo "TRACE STOP: no trace"; return 1; }
  case "${GIT_TRACE_REDACT:-}" in 0|false|no|off) echo "TRACE STOP: redaction disabled"; return 1;; esac
  if grep -q -i -E 'Send header: *(Proxy-)?(Authorization|Cookie):' "$f"; then echo "TRACE STOP: a credential-bearing request header was sent"; return 1; fi
  grep -q -E 'Send header: (GET|POST) ' "$f" || { echo "TRACE STOP: no HTTP request recorded, so the trace is not evidence"; return 1; }
  if grep -q -E 'Recv header: HTTP/[0-9.]+ (401|407)' "$f"; then echo "TRACE STOP: an authentication challenge was received"; return 1; fi
  echo "TRACE PASS"
}
```

### 5.3 Agent capability boundary (owner configuration, step S8 / X2)

- **Owner-only writes during the pilot (HD-05):** every authenticated Git push, pull request creation, Ready-for-Review, merge, `STATE` and `LANE-RESUME` comment, decision or ledger comment, ruleset change and acceptance is performed personally by the owner, each recorded as `{action, target, UTC time, resulting ID or SHA, method}`. The in-session confirmation of each comment ID stays mandatory. Agent GitHub access is **read-only** during the pilot (HD-05b); any connector change needs a separate owner approval.
- **Isolation assessment (HD-05a), prefer existing sandbox isolation.** Documentation reports that the sandboxed Bash tool restricts filesystem writes and, through a proxy, network access by domain; that **reads are open by default, including credential files, until `denyRead` is configured**; and that a `Read(...)` permission deny rule applies to the dedicated tools while sandbox filesystem rules apply to subprocesses (SECONDARY evidence, vendor documentation and a community bug report that disputes `denyRead` effectiveness; to be re-read at step S8). In the preparation session no sandbox proxy environment variable was present and `api.github.com` was reachable directly, so **active sandbox enforcement is UNVERIFIED and not assumed**. A separate operating-system account is recommended **only if** the X2 tests show the sandbox cannot make the stored credential unreachable; removing a stored credential or creating an account needs separate owner authorisation.
- **X2 tests (owner-run; none is run by this task), each recorded as TECHNICAL or PROCEDURAL:** (1) the agent session's tool inventory has no GitHub-write connector, no browser-automation and no computer-use tool; (2) the effective sandbox and permission settings, read out as key names and scopes, deny the agent's access to credential stores and keychain paths; (3) from the agent environment an authenticated read of the credential fails without the credential value ever being displayed; (4) an unauthenticated REST write is refused (401) — **supporting evidence only**; (5) a failed dry-run push from the agent environment — **supporting evidence only**, because a failure shows the absence of one credential path in one configuration, not the absence of write capability.
- **Field availability.** GitHub resources differ: Issue comments carry `performed_via_github_app`, `created_at` and `updated_at`; issue and pull-request events carry `created_at` and may not carry the app field; pull-request reviews carry `submitted_at`; commit dates are author-controlled and mutable. A missing field is **unavailable, not null**, is reported, and is never used as evidence. For `STATE` and `LANE-RESUME` comments `STATE-004` PAR-N10 is unchanged: the field must be present and null and the comment unedited.

### 5.4 Scoped audit

At each session start and at pilot close, `par_audit` maps every mutation in the pilot window to an owner-declared action. In scope: Issue #18 comments, the events of the declared pull requests, every difference between consecutive remote captures, and the ruleset listing. Out of scope: unrelated repository activity (it is not audited). **An unexplained mutation in scope is `STOPPED`.** Declared actions that are not observed are reported for owner reconciliation and do not by themselves stop the pilot. The audit proves consistency with what the owner declared; it does not prove who acted.

<!-- par-block: audit -->
```bash
# par_audit --declared f --start T --end T [--comments f] [--events f] [--captures f f ...] [--rulesets before after]
par_audit() {
  python3 -I - "$@" <<'PY'
import argparse, json, sys
ap = argparse.ArgumentParser()
ap.add_argument("--declared", required=True); ap.add_argument("--start", required=True); ap.add_argument("--end", required=True)
ap.add_argument("--comments"); ap.add_argument("--events")
ap.add_argument("--captures", nargs="*", default=[]); ap.add_argument("--rulesets", nargs="*", default=[])
a = ap.parse_args()
declared = {(d["kind"], str(d["id"])) for d in json.load(open(a.declared))}
seen, bad = set(), 0
def inwin(t): return isinstance(t, str) and a.start <= t <= a.end
def explain(kind, ident, desc):
    global bad
    k = (kind, str(ident))
    if k in declared: seen.add(k); print("EXPLAINED", kind, ident, desc)
    else: bad = 1; print("UNEXPLAINED", kind, ident, desc)
STATE = ("AIX-PAR-001 STATE:", "AIX-PAR-001 LANE-RESUME:")
if a.comments:
    for c in json.load(open(a.comments)):
        cid, cr, up = c.get("id"), c.get("created_at"), c.get("updated_at")
        is_state = (c.get("body") or "").startswith(STATE)
        if is_state and not ("performed_via_github_app" in c and c["performed_via_github_app"] is None and cr == up):
            bad = 1; print("STATE-VIOLATION", cid, "app marker absent or non-null, or comment edited")
        if inwin(cr): explain("comment", cid, "created " + str(cr) + (" (state token)" if is_state else ""))
        if up != cr and inwin(up): explain("comment-edit", cid, "edited " + str(up))
        if "performed_via_github_app" not in c: print("FIELD-UNAVAILABLE comment", cid, "no app marker evidence")
if a.events:
    for e in json.load(open(a.events)):
        if inwin(e.get("created_at")): explain("event", e.get("id"), str(e.get("event")))
        if "performed_via_github_app" not in e: print("FIELD-UNAVAILABLE event", e.get("id"), "no app marker evidence")
def load(p):
    r = {}
    for line in open(p):
        s = line.rstrip("\n").split("\t")
        if len(s) == 2: r[s[1]] = s[0]
    return r
for i in range(len(a.captures) - 1):
    x, y = load(a.captures[i]), load(a.captures[i + 1])
    for ref in sorted(set(x) | set(y)):
        if x.get(ref) != y.get(ref): explain("ref", ref, "%s -> %s" % (x.get(ref, "-")[:12], y.get(ref, "-")[:12]))
if len(a.rulesets) == 2:
    x, y = [sorted(json.load(open(p)), key=lambda r: r.get("id", 0)) for p in a.rulesets]
    if x != y: explain("ruleset", "listing", "ruleset listing changed")
for k in sorted(declared - seen): print("DECLARED-NOT-OBSERVED", k[0], k[1])
sys.exit(bad)
PY
}
```

## 6. Lane-branch protection (`PAR-N28`)

- **Lane names are pre-declared:** `ui_branch` = `task/V2-SHELL-01-shadcn`, `ci_branch` = `task/AIX-CI-HARD-001-L1` (Issue #18 §3, consistent with Issues #12 and #15). The probe branch is `test/AIX-PAR-002-ruleset-probe`. The two lane names are constants in the wrapper block (`PAR_LANE_UI`, `PAR_LANE_CI`) and `par_lane_ok` accepts exactly them: `par_push`, `par_delta` (`lane-push`) and `par_write_ok` reject `main`, the probe branch and every other name. The probe branch is not a lane and has no push form in this supplement; its test pushes are performed by the owner at S8.
- **Ruleset (owner configuration X1; separate owner authorisation; not created by this task):** one branch ruleset, enforcement active, including exactly `refs/heads/task/V2-SHELL-01-shadcn`, `refs/heads/task/AIX-CI-HARD-001-L1` and `refs/heads/test/AIX-PAR-002-ruleset-probe`, excluding nothing, with exactly the rules `non_fast_forward` and `deletion`, and **no bypass actors**. No `creation`, `update` or `pull_request` rule (they would block the operator's own pushes). Ruleset `26356065` for `main` stays unchanged. A pattern broader than the exact names is not permitted.
- **Anonymous read-back (`par_lane_readback`)** for each of the three names, for `main` (exactly its four existing rules), for a non-protected control name (no rules), and for the ruleset itself. Bypass actors are not visible anonymously, so the owner attests the list from the authenticated view and the read-back reports it UNVERIFIED until then. GitHub repository and plan capabilities that make this possible (rulesets on a user-owned repository, bypass-actor visibility) are for the owner to verify.
- **Probe test (owner-run, X1; never `main`, never a lane branch):** with §2 captures around each step: (1) push `57242a65513fd80bda8016277a4e1fb7b3558cca` to the probe, accepted; (2) fast-forward it to `6d875ead5c8f6ec9d42902a67fef695ff7eb595e`, accepted; (3) a forced rewrite of the probe, **rejected by GitHub**; (4) deletion of the probe, **rejected by GitHub**. After the pilot the owner relaxes the ruleset before any branch clean-up.

<!-- par-block: readback -->
```bash
# par_lane_readback --id N --main-id N --ruleset f --rules name=f [name=f ...] --main f --neg f   (saved anonymous REST responses)
par_lane_readback() {
  python3 -I - "$@" <<'PY'
import argparse, json, sys
ap = argparse.ArgumentParser()
ap.add_argument("--id", type=int, required=True); ap.add_argument("--main-id", type=int, required=True)
ap.add_argument("--ruleset", required=True); ap.add_argument("--rules", nargs="+", required=True)
ap.add_argument("--main", required=True); ap.add_argument("--neg", required=True)
a = ap.parse_args()
WANT = sorted(["deletion", "non_fast_forward"])
MAIN = sorted(["deletion", "non_fast_forward", "pull_request", "required_status_checks"])
bad, note = [], ""
rs = json.load(open(a.ruleset))
names = []; rules = {}
for kv in a.rules:
    n, f = kv.split("=", 1); names.append(n); rules[n] = json.load(open(f))
if rs.get("id") != a.id: bad.append("ruleset id")
if rs.get("target") != "branch": bad.append("target")
if rs.get("enforcement") != "active": bad.append("enforcement")
rn = (rs.get("conditions") or {}).get("ref_name") or {}
if sorted(rn.get("include") or []) != sorted("refs/heads/" + n for n in names): bad.append("include set")
if (rn.get("exclude") or []) != []: bad.append("exclude set")
if sorted(r.get("type") for r in rs.get("rules", [])) != WANT: bad.append("rule types")
ba = rs.get("bypass_actors")
if ba is None: note = "bypass actors UNVERIFIED (not visible anonymously): owner attestation required"
elif ba != []: bad.append("bypass actors present")
for n in names:
    got = rules[n]
    if sorted(r.get("type") for r in got) != WANT or any(r.get("ruleset_id") != a.id for r in got): bad.append("rules for " + n)
m = json.load(open(a.main))
if sorted(r.get("type") for r in m) != MAIN or any(r.get("ruleset_id") != a.main_id for r in m): bad.append("main rules changed")
if json.load(open(a.neg)) != []: bad.append("control name is protected")
print("READBACK STOP: " + ", ".join(bad) if bad else "READBACK PASS" + ("; " + note if note else ""))
sys.exit(1 if bad else 0)
PY
}
```

## 7. Repository isolation (`GOV-FIND-001`)

- **Permitted roots, declared in every pilot prompt as absolute paths:** the lane worktree; its Git common directory (`rev-parse --path-format=absolute --git-common-dir`); any named read-only known path (for example the conductor); the harness scratch and tool-output directories; the owner's evidence archive (write only if separately authorised). **Read and write are separate boundaries**, set out in the table below. **The harness memory directory is not a root** unless the owner explicitly authorises it for that session (HD-06a), and then it is read only after `CLAUDE.md`.
- **Instruction-first:** the first command of a session reads the worktree's root `CLAUDE.md` by its known path. No filesystem, Git, network or search command precedes it. Recurring tasks use known-path references; **an unknown or unresolved path is `STOP`, ask, never search**.
- **Forbidden:** `find`, `ls`, glob, `grep`, `mdfind` or `locate` outside the roots; broad home-directory or neighbouring-repository discovery; entering the sibling worktrees that `git worktree list` prints; `-C` to a non-root. Never access `aix-financial-infrastructure-platform`, including read-only.
- **Path validation (supporting control, PROCEDURAL):** a path is permitted only if its **canonical** path — symlinks and `..` resolved physically, a not-yet-existing tail resolved through its existing parent — equals a root's canonical path or lies **beneath it at a component boundary** (`/r/root-evil` is not beneath `/r/root`). Case is folded **only when the volume holding that root is detected case-insensitive** by a probe of the actual filesystem; an undetermined case is `STOP`. A linked worktree's `gitdir`, `commondir` and `.git` file must resolve into the declared common directory (`par_wt_containment`), and `par_write_ok` applies the write table to a candidate path. **Write boundary (N-1a, R2; corrected in R3 for review items L-1 and NF-1):** `par_write_ok` does not trust where a permitted-looking path *resolves*. A path **spelled** inside the Git common directory is judged by its spelling and chain: it must lie lexically under the declared common directory with no `.`, `..`, empty or trailing-slash component, and no component from the common directory down to the target may be a symbolic link; its resolved physical path must then equal one of the exact permitted targets, which are built from the physical common directory and never resolved themselves. **The cases are distinct (L-1).** (1) **A write redirected into a prohibited location** (a link at a lane reference or at `refs/heads/task` pointing at `config`, `hooks/`, another reference, `objects/pack`, `objects/info` or a sibling worktree's administrative directory) is STOP. (2) **A path spelled inside the common directory that resolves outside it**, including into another permitted write root such as the worktree or a scratch root (for example a link planted at `objects/ab`, at a lane reference or at `logs`), is **also STOP**. R2 allowed this second case because the bytes would land in a permitted root; R3 refuses it, because Git would then read lane-controlled content as a reference, a reflog or an object. (3) **A path spelled outside the common directory** (the lane worktree, a scratch root) is judged by where it resolves: into another permitted write root it is allowed, since the write lands in a root the lane may write anyway; into the common directory it is STOP (a worktree link to a lane reference is not a permitted spelling). **Detection of unexpected Git metadata symbolic links is separate and detective:** `par_meta_symlinks` (any symbolic link under the common directory is STOP; none is expected) and `par_objects_snapshot` (a symbolic link, a special file or a file with more than one hard link under `objects/`, or a missing fan-out directory, is STOP). **When they run:** by the owner or the supervised operator, **never by a lane**, with both implementation sessions stopped, (a) once as the baseline after the owner has pre-created the lane branches and the 256 fan-out directories and before the first session, (b) at every session start and resume, (c) before every operator fetch, push or integration merge, (d) when a lane stops and when the pilot ends, and (e) after any unexplained Git error or STOP; `par_objects_delta` compares each snapshot with the previous one. **A result other than PASS is STOP for both lanes:** the owner stops both sessions, retains the output and both snapshots unchanged, and investigates in an exclusive window; nothing is repaired or deleted until the evidence is archived, and whether the pilot may resume is decided under the pause and resume rules of `STATE-004`. These checks cannot undo a substitution already made and do not run by themselves. **They catch mistakes by a cooperating process; they are not a substitute for enforceable filesystem isolation, because a process can simply not run them, and a path function cannot see a hard link.**
- **Technical enforcement (OWNER CONFIGURATION, X3), read and write:** a sandbox filesystem **read** restriction (deny reads under the home directory with the permitted roots allowed back, as the vendor documentation describes) **and a filesystem write allowlist** that makes the table below true for every subprocess (including tests W1 to W7 below), and/or tool-level path rules. Each negative and positive test is recorded as TECHNICAL (the operation was blocked or permitted by something the agent cannot bypass) or PROCEDURAL (only a rule forbids it). **If the real environment cannot enforce the read or the write boundary, X3 is UNVERIFIED or PROCEDURAL and activation stays prohibited (V9).** Enforcement must be re-tested after any change to the harness or its settings.
- **Shared object store (NF-1, R3): lane permissions versus operator maintenance.** The two lanes share one object store, so a lane must not be able to alter what the other lane or the operator reads from it. **A lane may do only what a local commit needs:** create a **new** loose object (`objects/<2hex>/` plus 38 lowercase hex characters) and the `tmp_obj_*` temporary file that Git writes beside it, in a fan-out directory that **already exists**. The owner pre-creates all 256 directories `objects/00` to `objects/ff` in a separately authorised serial operator step; a lane creates no directory, and a lane commit that needs a missing directory fails closed. **Nothing else under `objects/` is writable by a lane:** nothing under `objects/pack/` (no `.pack`, `.idx`, `.rev`, `.bitmap`, `tmp_pack_*`, `tmp_idx_*`, `multi-pack-index`), nothing under `objects/info/` (no `alternates`, `packs`, `commit-graph`), no file directly in `objects/`; no existing object is modified, replaced, renamed, hard-linked, deleted or moved; and no object path is created as a symbolic link or a hard link. *Why:* Git reads packs before loose objects, so a new pack file can shadow an existing object, and a hard or symbolic link at an object path leaves the object's content writable through another path. The shadow-pack case was reported by the R2 final verification (chat-only, not preserved): on a disposable fixture whose allowlist granted `tmp_pack_*` and `tmp_idx_*`, a lane built a pack that claimed an existing blob, an ordinary `git merge` in the other lane then wrote forged content into that lane's worktree, and renaming the index file away made `git fsck` pass again. **Lane Git commands perform no shared maintenance:** a lane never runs `git gc`, `repack`, `prune`, `prune-packed`, `maintenance`, `pack-refs`, `commit-graph`, `multi-pack-index`, `unpack-objects`, `index-pack`, `fetch`, `clone`, `fsck --lost-found` or `worktree prune`, and passes `-c gc.auto=0 -c maintenance.auto=false` on every Git command line (a supporting, PROCEDURAL measure: it is a command-line setting, not a configuration-file key, so it does not touch the allowlist of `par_cfg_gate`). The technical backstop is the write allowlist, under which an attempted automatic maintenance fails closed instead of writing a pack. **Operator maintenance is a separate operation.** Pre-creating the fan-out directories, removing a leftover `tmp_obj_*` file, and any repack, prune or garbage collection of the shared store are done only by the owner or the supervised operator, each under its own owner authorisation, in the exclusive serial window with both implementation sessions stopped and with a `par_objects_snapshot` before and after. This supplement authorises none of them, and a lane never needs them. **`git fsck` is not proof by itself.** The `STATE-004` gate (f) `fsck` is point-in-time evidence that the objects it examines hash correctly at that moment. It does not show that nothing changed in between, and it does not examine an index file that was renamed away, so a passing `fsck` is never the only evidence of shared-object integrity. `par_objects_snapshot` and `par_objects_delta` are required in addition: no pre-existing file changed, was removed or replaced; nothing added under `objects/pack/` or `objects/info/`; every addition is a loose object; no symbolic link, special file or hard-linked file. They are detective only, and a passing result does not prove continuous integrity between two snapshots. **Technical enforcement requirements for X3 (R3), to be demonstrated in the real operating environment:** (X3-a) writes limited to exact loose-object paths and `tmp_obj_*` files in existing fan-out directories, with the rename of a temporary file onto a **new** name permitted; (X3-b) every write, create, rename and delete under `objects/pack/` and `objects/info/` denied; (X3-c) overwrite, append, `chmod`, rename-over and deletion of an existing loose object denied; (X3-d) creation of a symbolic link or a hard link under the common directory denied, and a hard link to an existing object denied from any writable location (Git falls back to renaming the temporary file when it cannot link, so this does not prevent a commit); (X3-e) lane Git maintenance commands fail without changing the store. If the real harness cannot express any of X3-a to X3-e, the corresponding W7 test is PROCEDURAL or UNVERIFIED and **activation stays prohibited (V9), with no waiver**. Each of X3-a to X3-e could be expressed on the disposable macOS Seatbelt fixture (`03-evidence.md` §12); that is evidence about that fixture, host and Git version only. **Alternative for owner decision, not adopted:** give each lane a private object directory under its worktree and expose the shared store to it read-only as an alternate, so that a lane has no write access to the shared store at all. That changes the operating model (the operator would have to import each lane's objects before any push) and needs its own decision.
- **Read and write boundaries** (the write column is what `par_write_ok` models and what the disposable-fixture OS test enforced):

| Path | Read | Write |
|---|---|---|
| The lane worktree | yes | yes (the lane's own path allowlist and `NO-WRITE` rules of `STATE-004` still apply to what may be committed) |
| The worktree's `.git` file | yes | **no** |
| Git common directory: the loose-object fan-out `objects/<2hex>/` (256 directories that the owner pre-creates; a lane never creates one) | yes | **create only, files only:** a **new** file whose name is exactly 38 lowercase hex characters (a loose object) and `tmp_obj_*` temporary files in the same directory (created, written, finalised by rename onto a new name, deleted). Modifying, replacing, renaming, hard-linking or deleting an existing object, and creating any directory, symbolic link or hard link here, is not permitted |
| Git common directory: `objects/pack/`, `objects/info/` and every other path under `objects/` (including `*.pack`, `*.idx`, `*.rev`, `*.bitmap`, `tmp_pack_*`, `tmp_idx_*`, `multi-pack-index`, `commit-graph`, `alternates`, `packs`, and a `tmp_obj_*` outside a fan-out directory) | yes | **no** (no create, write, rename or delete; R3 removed the `tmp_pack_*` and `tmp_idx_*` grants) |
| Common directory: exactly four files, `refs/heads/<lane>`, `refs/heads/<lane>.lock`, `logs/refs/heads/<lane>` and `logs/refs/heads/<lane>.lock`. The owner pre-creates each lane branch (branch creation is an owner operation, §3), so the reference and its reflog exist | yes | yes (the assigned branch only). **No directory is writable here:** neither `refs/heads/task` nor `logs/refs/heads/task` (both shared by the two lanes) nor any parent. The other lane's reference and reflog are not writable |
| The worktree's own administrative directory `worktrees/<name>/`: `index`, `index.lock`, `HEAD.lock`, `COMMIT_EDITMSG`, `ORIG_HEAD`, `ORIG_HEAD.lock`, `MERGE_HEAD`, `MERGE_MSG`, `MERGE_MODE`, `AUTO_MERGE`, `logs/` | yes | yes (a lane commit needs these; an integration merge is not a lane operation, see the integration-merge rule below) |
| Everything else in the common directory: `config`, `hooks/`, `info/`, `packed-refs`, `shallow`, `HEAD`, every other reference (including `refs/remotes`, tags and `refs/replace`), the worktree's `HEAD`, `commondir`, `gitdir` and `config.worktree`, and every other `worktrees/*` | yes | **no** |
| Sibling worktrees | no | **no** |
| Named read-only paths (the conductor) | yes | **no** |
| Harness scratch and tool-output directories | yes | yes |
| The owner's evidence archive | yes | only if separately authorised for that session |
| Everything else, including the excluded repository | **no** | **no** |

  Operator fetch, push and branch-creating operations are the owner's and run outside the lane boundary under §3. The minimal Git write set above was derived by running a real `git add` and `git commit` of a lane under an OS write allowlist on a disposable fixture: the first attempt failed on `HEAD.lock`, which was then added; the commit succeeded and a denied-attempt set (config, hook, other reference, `packed-refs`, other branch creation) failed. That is evidence about the **shape** of an enforceable boundary on one host and Git version, not about the real harness. **R2:** the directory-level grant of the earlier text (the one directory above the lane name) was removed; a lane commit without it was re-run under the same kind of fixture and advanced only the assigned branch, while renaming the shared directory was denied. **R3:** the `tmp_pack_*` and `tmp_idx_*` grants and every other write under `objects/pack/` and `objects/info/` were removed, directory creation under `objects/` was removed (the owner pre-creates the fan-out directories), and a lane commit under the narrowed allowlist, with hard-link and symbolic-link creation under the common directory denied, still succeeded on a disposable fixture (`03-evidence.md` §12).

  **Integration merges are serial operator operations (I-1, R3).** A separately authorised non-rewriting integration merge into a lane branch (`STATE-004`) takes place only in the exclusive serial integration window, with both implementation sessions stopped, run by the owner or the supervised operator outside the lane write boundary (§3). It is not a lane operation, and **no write permission is added to the lane boundary to accommodate it.** The merge-state names `MERGE_HEAD`, `MERGE_MSG`, `MERGE_MODE` and `AUTO_MERGE` remain in the administrative-directory row exactly as in R2; they are not an authorisation to merge. The R2 final verification observed that a merge attempted *inside* the lane boundary fails closed, because Git also needs `AUTO_MERGE.lock` in the worktree's administrative directory (no other missing permission was tested). **Identified for separate owner approval and not granted:** if the owner ever decides that a lane must merge inside the boundary, the additional permission would be the literal path `worktrees/<lane>/AUTO_MERGE.lock`; this supplement does not grant it and V9 does not depend on it.
- **X3 write-boundary tests (owner-run; none was run by this task; each recorded TECHNICAL or PROCEDURAL, and all must be TECHNICAL under V9):** **W1** an assigned-lane `git add` and `git commit` succeeds, advances only the assigned branch and leaves `fsck` clean. **W2** renaming or removing the shared `refs/heads/task` directory (the parent of both lane references) is denied. **W3** the same for `logs/refs/heads/task`. **W4** writing the other lane's reference is denied. **W5** writing the other lane's reflog is denied. **W6** symlink redirection is denied: a symlink at the lane reference, at the lane reflog and at each ancestor, pointing at `config`, `hooks/`, another reference and a sibling worktree's administrative directory; the write **through** each is blocked, and `par_meta_symlinks` reports it (under a plain path allowlist, creating the link at a permitted target may itself succeed, because such an allowlist cannot tell `symlink` from `rename`; X3-d, which the object store already requires, denies it where the harness can express it). **W7 (NF-1, R3; run only in a harmless synthetic repository that the real harness treats exactly like the real one, never against the real repository; for every sub-test the owner retains the command, its output and a `par_objects_snapshot` before and after, and each is recorded TECHNICAL or PROCEDURAL; all must be TECHNICAL under V9):** **W7a** (positive control) an assigned-lane `git add` and `git commit` succeeds with `-c gc.auto=0 -c maintenance.auto=false`, adds only new loose objects, and `par_objects_delta` passes. **W7b** creating a new file under `objects/pack/` is denied under every name Git or an attacker might use (`pack-<hex>.pack`, `pack-<hex>.idx`, `tmp_pack_*`, `tmp_idx_*`, `*.rev`, `*.bitmap`, `multi-pack-index`); the directory listing is unchanged. **W7c** creating, writing, renaming or deleting anything under `objects/info/` (including `alternates`, `packs` and `commit-graph`) or directly in `objects/` is denied. **W7d** appending to, overwriting, `chmod`-ing then writing, renaming another file over, deleting, hard-linking over, and moving the directory of an **existing** loose object are each denied, and its SHA-256 is unchanged. **W7e** creating a hard link or a symbolic link at a **new** object name, creating a hard link to an **existing** object in a writable location, and creating a fan-out directory are each denied (X3-d); an object path that is a link is never accepted. **W7f** `git gc`, `git repack -ad`, `git prune --expire=now`, `git maintenance run` and `git pack-refs --all`, run as the lane, change nothing in the object store (the allowlist makes them fail closed) and delete no existing object. **W7g** after all of the above the other lane's reads are unchanged: every object that existed before has an identical SHA-256, `git cat-file` of a sample of existing objects in the other lane's worktree returns identical bytes, and the other lane's commit and `status` behave as before. **W7h** (the detective control works) the owner, not an agent, plants in the synthetic repository one change at a time: an altered byte in an existing object, a removed object, a new file in `objects/pack/`, a new file in `objects/info/`, a leftover `tmp_obj_*`, a symbolic link, a hard link and a missing fan-out directory; `par_objects_snapshot` or `par_objects_delta` reports STOP for each, and the STOP procedure of §7 (path validation) is followed. **What W7 does not show:** a passing `git fsck` after the tests is point-in-time and is not accepted as the evidence of W7d, W7e or W7g. `par_write_ok` sees only a path, so it cannot show W7e or W7f. Whether the real harness can express X3-a to X3-e is UNVERIFIED; if it cannot, the affected sub-test is PROCEDURAL or UNVERIFIED and activation stays prohibited (V9), with no waiver. Hard links are covered by W7e and X3-d; bind mounts and other aliasing through mounts are not covered. A fixture result is not evidence that the real Claude Code environment is isolated.
- **Negative tests use only harmless synthetic fixtures** (a directory outside a disposable allowed root holding a random-token canary file, standing in for any excluded path) and never the excluded repository. **Evidence retention:** session transcripts or command logs are retained with a SHA-256 manifest (not tamper-evident; a hash gives integrity only from the time it is taken). Historical incidents and their unverified provenance stay recorded in `GOV-FIND-001` and the task records; this section changes none of them and does not close the finding.

<!-- par-block: path -->
```bash
# par_realpath <absolute path>: physical, symlink-resolved path; the tail may not exist yet. Returns 1 if it cannot be resolved.
par_realpath() {
  local p=${1:-} n=0 t r
  case "$p" in /*) ;; *) return 1;; esac
  while [ "${#p}" -gt 1 ] && [ "${p%/}" != "$p" ]; do p=${p%/}; done
  while [ -L "$p" ]; do
    n=$((n+1)); [ "$n" -le 40 ] || return 1
    t=$(readlink "$p") || return 1
    case "$t" in /*) p=$t;; *) p="${p%/*}/$t";; esac
  done
  if [ -d "$p" ]; then ( cd -P "$p" 2>/dev/null && pwd -P ); return; fi
  case "${p##*/}" in .|..|"") return 1;; esac
  r=$(par_realpath "${p%/*}") || return 1
  [ "$r" = / ] && r=""
  printf '%s/%s\n' "$r" "${p##*/}"
}
# par_ci_volume <existing path>: yes|no. Probes the real filesystem; returns 1 (STOP) if it cannot tell.
par_ci_volume() {
  local p=${1:-} sw
  [ -e "$p" ] || return 1
  sw=$(printf '%s' "$p" | tr 'A-Za-z' 'a-zA-Z')
  [ "$sw" != "$p" ] || return 1
  if [ -e "$sw" ] && [ "$p" -ef "$sw" ]; then echo yes; else echo no; fi
}
# par_path_ok <candidate> <root> [<root> ...]
par_path_ok() {
  local cand=${1:-} root rr cr ci a b; shift
  cr=$(par_realpath "$cand") || { echo "PATH STOP: cannot resolve the candidate"; return 1; }
  for root in "$@"; do
    rr=$(par_realpath "$root") || { echo "PATH STOP: a root cannot be resolved"; return 1; }
    [ "$rr" != / ] || { echo "PATH STOP: / is not a permitted root"; return 1; }
    ci=$(par_ci_volume "$rr") || { echo "PATH STOP: case sensitivity of $rr cannot be determined"; return 1; }
    a=$cr; b=$rr
    if [ "$ci" = yes ]; then a=$(printf '%s' "$a" | tr 'A-Z' 'a-z'); b=$(printf '%s' "$b" | tr 'A-Z' 'a-z'); fi
    case "$a/" in "$b"/*) return 0;; esac
  done
  echo "PATH STOP: outside the permitted roots: $cr"; return 1
}
# par_wt_containment <worktree> <declared common dir>
par_wt_containment() {
  local wt=${1:-} common=${2:-} gd cd l
  gd=$(git -C "$wt" rev-parse --absolute-git-dir 2>/dev/null) && cd=$(git -C "$wt" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || { echo "WT STOP: not a worktree"; return 1; }
  par_path_ok "$cd" "$common" >/dev/null && par_path_ok "$common" "$cd" >/dev/null || { echo "WT STOP: common directory is not the declared one"; return 1; }
  par_path_ok "$gd" "$common/worktrees" >/dev/null || [ "$(par_realpath "$gd")" = "$(par_realpath "$common")" ] || { echo "WT STOP: git directory is outside the declared common directory"; return 1; }
  if [ -f "$wt/.git" ]; then
    l=$(sed -n 's/^gitdir: //p' "$wt/.git"); case "$l" in /*) ;; *) l="$wt/$l";; esac
    par_path_ok "$l" "$common/worktrees" >/dev/null || { echo "WT STOP: .git file points outside the declared common directory"; return 1; }
  fi
  if [ -f "$gd/commondir" ]; then
    l=$(cat "$gd/commondir"); case "$l" in /*) ;; *) l="$gd/$l";; esac
    par_path_ok "$l" "$common" >/dev/null && par_path_ok "$common" "$l" >/dev/null || { echo "WT STOP: commondir file resolves elsewhere"; return 1; }
  fi
  echo "WT PASS"
}
# par_lex_under <path> <base>: succeeds only if <path> is <base> or lies beneath it, spelled WITHOUT '.', '..', empty or trailing-slash
# components, and no existing component from <base> down to <path> is a symbolic link. The base itself is the declared root and is not tested.
par_lex_under() {
  local p=${1:-} b=${2:-} rest cur c
  case "$p" in /*) ;; *) return 1;; esac
  case "$b" in /*) ;; *) return 1;; esac
  case "$p" in *//*|*/./*|*/../*|*/.|*/..|*/) return 1;; esac
  case "$p/" in "$b"/*) ;; *) return 1;; esac
  [ "$p" = "$b" ] && return 0
  rest=${p#"$b"/}; cur=$b
  while [ -n "$rest" ]; do
    c=${rest%%/*}; cur="$cur/$c"
    [ -L "$cur" ] && return 1
    case "$rest" in */*) rest=${rest#*/};; *) rest=;; esac
  done
  return 0
}
# par_meta_symlinks <declared common dir>: detective check. Any symbolic link under the common directory is STOP.
par_meta_symlinks() {
  local c=${1:-} out n
  [ -d "$c" ] || { echo "META STOP: common directory missing"; return 1; }
  out=$(find "$c" -type l -print 2>/dev/null) || { echo "META STOP: scan failed"; return 1; }
  [ -z "$out" ] && { echo "META PASS"; return 0; }
  n=$(printf '%s\n' "$out" | wc -l | tr -d ' ')
  echo "META STOP: $n symbolic link(s) under the common directory:"; printf '%s\n' "$out" | sed 's/^/  /'; return 1
}
# par_objects_snapshot <declared common dir> <out file> (detective, R3 / NF-1; run by the owner or operator, never by a lane): records every directory
# ("D", path) and every file ("F", path, bytes, SHA-256) under objects/ in sorted order. STOP if anything under objects/ is a symbolic link or a special
# file, if any file has more than one hard link, if a name holds a control character, or if any of the 256 fan-out directories objects/00..ff is missing.
# The file is written even on STOP, as evidence. Point-in-time only; it does not prove integrity between two snapshots.
par_objects_snapshot() {
  python3 -I - "${1:-}" "${2:-}" <<'PY'
import hashlib, os, re, stat, sys
c, out = sys.argv[1:3]
if not c or not out:
    print("OBJ STOP: arguments"); sys.exit(1)
o = os.path.join(c, "objects")
try:
    st = os.lstat(o)
except OSError:
    print("OBJ STOP: objects directory missing"); sys.exit(1)
if not stat.S_ISDIR(st.st_mode):
    print("OBJ STOP: objects is not a real directory"); sys.exit(1)
bad, rows, dirs = [], [], set()
for dp, dns, fns in os.walk(o, followlinks=False):
    for n in dns + fns:
        p = os.path.join(dp, n); rel = os.path.relpath(p, o)
        if re.search(r"[\x00-\x1f\x7f]", rel):
            bad.append("control character in a name: %r" % rel); continue
        s = os.lstat(p); m = s.st_mode
        if stat.S_ISLNK(m): bad.append("symbolic link: " + rel)
        elif stat.S_ISDIR(m): rows.append(("D", rel, "", "")); dirs.add(rel)
        elif stat.S_ISREG(m):
            if s.st_nlink != 1: bad.append("hard link count %d: %s" % (s.st_nlink, rel))
            h = hashlib.sha256()
            with open(p, "rb") as f:
                for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
            rows.append(("F", rel, str(s.st_size), h.hexdigest()))
        else: bad.append("special file: " + rel)
for i in range(256):
    if ("%02x" % i) not in dirs: bad.append("fan-out directory missing: %02x" % i)
rows.sort(key=lambda r: r[1].encode())
with open(out, "w", encoding="utf-8") as f:
    for r in rows: f.write("\t".join(r) + "\n")
if bad:
    print("OBJ STOP: %d anomaly(ies):" % len(bad))
    for b in bad[:50]: print("  " + b)
    sys.exit(1)
print("OBJ SNAPSHOT PASS: %d entries" % len(rows))
PY
}
# par_objects_delta <before snapshot> <after snapshot> (detective, R3 / NF-1): PASS only if every entry of <before> is present and identical in <after>
# and every addition is a loose object (objects/<2hex>/<38 lowercase hex>). A removal, a change, a replacement, an added directory, an addition under
# objects/pack or objects/info, a leftover tmp_obj_* or any other addition is STOP. A new loose object is still verified by git fsck (STATE-004 gate f).
par_objects_delta() {
  python3 -I - "${1:-}" "${2:-}" <<'PY'
import re, sys
def load(f):
    d = {}
    try:
        data = open(f, encoding="utf-8").read()
    except Exception:
        print("OBJ STOP: unreadable snapshot " + f); sys.exit(1)
    for l in data.split("\n"):
        if not l: continue
        p = l.split("\t")
        if len(p) != 4 or p[0] not in ("D", "F") or p[1] in d:
            print("OBJ STOP: malformed or duplicate snapshot line in " + f); sys.exit(1)
        d[p[1]] = tuple(p)
    if not d:
        print("OBJ STOP: empty snapshot " + f); sys.exit(1)
    return d
b, a = load(sys.argv[1]), load(sys.argv[2])
bad = []
for k, v in b.items():
    if k not in a: bad.append("removed: " + k)
    elif a[k] != v: bad.append("changed: " + k)
new = 0
for k, v in a.items():
    if k in b: continue
    if v[0] == "F" and re.fullmatch(r"[0-9a-f]{2}/[0-9a-f]{38}", k): new += 1
    else: bad.append("unexplained addition: " + k)
if bad:
    print("OBJ STOP: %d unexplained change(s):" % len(bad))
    for x in sorted(bad)[:50]: print("  " + x)
    sys.exit(1)
print("OBJ DELTA PASS: %d new loose object(s), no existing entry changed" % new)
PY
}
# par_write_ok <candidate> <lane worktree> <declared common dir> <approved lane> [<scratch root> ...]: the WRITE boundary of §7 (supporting, PROCEDURAL).
# Inside the Git common directory a path is judged by its SPELLING AND CHAIN (par_lex_under: no symlink, dot or alias on the way), never by where a
# permitted-looking path resolves to; the permitted targets are then compared as literal physical paths that are never themselves resolved.
# A path SPELLED inside the common directory that resolves outside it is STOP, even into a permitted write root (R3, L-1).
# Permitted in the common directory (R3, NF-1): (1) objects/<2hex>/<38 lowercase hex> as a NEW file, and objects/<2hex>/tmp_obj_*, in a fan-out
# directory that already exists (a lane creates no directory); (2) exactly four lane files (the assigned branch reference, its reflog and their
# .lock files; NO directory); (3) the named files of the worktree's own administrative directory. Everything else there is STOP: objects/pack,
# objects/info, every other path under objects/, config, hooks, info, packed-refs, every other reference and reflog, other worktrees, and the shared
# refs/heads/<dir> and logs/refs/heads/<dir>.
# Outside it: the lane worktree (never its .git file) and the listed scratch roots; anything else, including a read-only named path, is STOP.
# This function sees only a path: it cannot see a hard-link count, it cannot stop a process that does not call it, and it is not enforcement (X3).
par_write_ok() {
  local cand=${1:-} wt=${2:-} com=${3:-} lane=${4:-} cr wr cm gd g rest n
  [ $# -ge 4 ] || { echo "WRITE STOP: arguments"; return 1; }
  shift 4
  par_lane_ok "$lane" || { echo "WRITE STOP: not an approved lane"; return 1; }
  cr=$(par_realpath "$cand") || { echo "WRITE STOP: cannot resolve the candidate"; return 1; }
  wr=$(par_realpath "$wt") && cm=$(par_realpath "$com") || { echo "WRITE STOP: a root cannot be resolved"; return 1; }
  gd=$(git -C "$wt" rev-parse --absolute-git-dir 2>/dev/null) && gd=$(par_realpath "$gd") || { echo "WRITE STOP: worktree git directory cannot be resolved"; return 1; }
  par_path_ok "$gd" "$cm/worktrees" >/dev/null || { echo "WRITE STOP: worktree administrative directory is not under the common directory"; return 1; }
  case "$cand" in "$com"|"$com"/*|"$cm"|"$cm"/*)
    par_path_ok "$cr" "$cm" >/dev/null || { echo "WRITE STOP: spelled inside the Git common directory but resolves outside it (symlink, alias or dot component): $cr"; return 1; };;
  esac
  if par_path_ok "$cr" "$cm" >/dev/null; then
    par_lex_under "$cand" "$cm" || par_lex_under "$cand" "$com" || { echo "WRITE STOP: inside the Git common directory only through a symlink, an alias, a dot component or another spelling: $cr"; return 1; }
    if par_path_ok "$cr" "$cm/objects" >/dev/null; then
      rest=${cr#"$cm"/objects/}
      case "$rest" in
        [0-9a-f][0-9a-f]/tmp_obj_*)
          case "${rest#*/}" in */*) ;; *) [ -d "${cr%/*}" ] && return 0;; esac;;
        [0-9a-f][0-9a-f]/*)
          n=${rest#*/}
          if [ "${#n}" -eq 38 ]; then
            case "$n" in *[!0-9a-f]*) ;; *) [ -d "${cr%/*}" ] && [ ! -e "$cr" ] && [ ! -L "$cr" ] && return 0;; esac
          fi;;
      esac
      echo "WRITE STOP: under objects/ a lane may only create a new loose object or a tmp_obj_* file in an existing fan-out directory: $cr"; return 1
    fi
    for g in "$cm/refs/heads/$lane" "$cm/refs/heads/$lane.lock" "$cm/logs/refs/heads/$lane" "$cm/logs/refs/heads/$lane.lock"; do
      [ "$cr" = "$g" ] && return 0
    done
    case "$cr" in
      "$gd"/*) rest=${cr#"$gd"/}
        case "$rest" in index|index.lock|HEAD.lock|COMMIT_EDITMSG|ORIG_HEAD|ORIG_HEAD.lock|MERGE_HEAD|MERGE_MSG|MERGE_MODE|AUTO_MERGE|logs/*) return 0;; esac ;;
    esac
    echo "WRITE STOP: shared or foreign Git metadata: $cr"; return 1
  fi
  [ "$cr" != "$wr/.git" ] || { echo "WRITE STOP: the worktree .git file is not writable"; return 1; }
  par_path_ok "$cr" "$wr" >/dev/null && return 0
  for g in "$@"; do par_path_ok "$cr" "$g" >/dev/null && return 0; done
  echo "WRITE STOP: outside the writable roots: $cr"; return 1
}
```

## 8. PR #19 limitation and future merges

### 8.1 Transitional provision T-1 (narrow; recognised by `STATE-004` gate 1 once operative)

- **Fact preserved:** the immediate pre-merge read-back required by `STATE-004` activation gate 1 (`pulls/19` `head.sha` and `git ls-remote origin refs/pull/19/head` equal to `accepted_head_sha`) **was not performed** for PR #19 (owner-stated, session-relayed), and no pre-merge REST read-back is preserved. The later parent, exact-file and content-binding checks passed; they show what was merged and **do not establish the omitted reads**. Nothing in this section claims otherwise, alters `2eb8e14…`, `26558507…`, the historical blob `83d5cf1d…` or any historical record, or changes `06-acceptance.md` or the `PAR-N27` closure. The only `STATE-004` change is the narrow gate-1 recognition of this provision, inert until operative.
- **Provision:** for evaluating gate 1 for this pilot only, and **only once the amended `STATE-004` and this supplement are operative (S7)**, the amended gate 1 recognises as the eligibility basis these items, re-verified immediately before the ACTIVE comment and at each session start: (i) `par_bind` in `historical` mode passes with `H=2eb8e14ffcaeed76cf37835399346375ee38ea26`, `B=c995e0fc420a09d1437ebfd4e333029871496085`, `M=26558507055533dcf439eaf8cf44f9a31c6631a9` and an inventory of the single path `docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md`; (ii) `par_rest_pr` (merged) passes for `pulls/19` with `DECISION_AT` `2026-11-25T07:33:17Z` (comment `7155988583`); (iii) the policy blob at the historical merge `M` is the **historical** blob `83d5cf1ddc16228b2d0ca8648e7b00b1bf882805` (not the amended blob); (iv) **explicit adoption (N-4):** the owner's S5 decision comment for `supplement_pr` adopts T-1, shown by `par_t1_adopted` (block `rest`), which requires the author to be `OWNER_LOGIN`, the comment unedited, its `created_at` equal to `DECISION_AT`, a plain-ASCII body, **exactly one** line that names the field `supplement_accepted_head_sha` and that line exactly `supplement_accepted_head_sha: <H>`, and exactly one mention of T-1 **in any spelling** (`T-1`, `T1`, `t 1`, `T-01`, another dash, a zero-width character and so on), which is the exact line `T-1: ADOPTED`. A rejection (`T-1: REJECTED`), an omitted decision, different wording or any second mention of T-1 (in any spelling), a repeated or altered accepted-head line or a non-ASCII character means T-1 is **not** an eligibility basis, gate 1 for PR #19 is then not satisfied, and activation stays prohibited. The limitation stays recorded as not performed in every case.
- **Limits:** T-1 counts only on the explicit adoption of item (iv); it cannot be cited for any other merge; it is an accepted basis, not a finding that the check occurred; the limitation stays recorded as "not performed". The alternatives considered were fresh re-acceptance of the policy (heavier; it cannot create a pre-merge read for a merge that already happened, and a new policy merge would change `policy_merge_sha`) and an informal waiver (rejected: an unchanged mandatory requirement is not satisfied by a waiver). T-1 is the simpler defensible option. It is valid authority only because `STATE-004` gate 1 itself now recognises it (R1); the earlier draft's route through a separate document alone was rejected by the independent review, and a `STATE-004` amendment is that review's recommended minimum.

### 8.2 Retained pre-merge evidence for every later merge

For every merge on which the pilot depends, including `supplement_pr` and `records_pr`, the following are retained before the owner authorises the merge (`par_premerge`): REST `pulls/<n>` read immediately beforehand showing `head.sha = H` and the PR open; a valid §2 capture made immediately beforehand showing `refs/pull/<n>/head = H` and `refs/heads/main = B`; `B` an ancestor of `H`. **Missing evidence makes the merge invalid for pilot purposes.**

### 8.3 Non-circular bootstrap verification (the supplement and records pull requests themselves)

The procedures of this supplement are not operative before S7, so the pull request that introduces them cannot depend on their operation. The owner runs the reviewed blocks once, as an **owner-authorised bootstrap** that the S5 decision names, extracted from the exact reviewed head (`git show H:<this file>`), whose eleven block digests must equal those recorded by the S2 review:

1. **S3, before the owner's decision:** `par_commit_bind` (the only parent is `B`, every file equals its reviewed raw digest, the changed paths equal `PZ`). Nothing is fetched or written outside the evidence directory.
2. **S5:** REST `pulls/<n>` is open with `head.sha` equal to `H`, and a valid §2 capture shows `refs/pull/<n>/head` equal to `H` and `refs/heads/main` equal to `B`. The owner's decision comment records the values listed in S5.
3. **S6:** `par_premerge` (§8.2) immediately before the merge.
4. **S7, after the merge:** `par_bind` in `prospective` mode with the same `PZ` and `PMS` = `policy_merge_sha`, and `par_rest_pr` with `DECISION_AT` equal to the decision comment's `created_at`.

Because the amended text becomes operative only at S7, no check above depends on it, and the same four checks then apply unchanged to the records pull request at S10. The independent review of the records pull request (S10) is mandatory.

## 9. Evidence, tests and rollback

- **Evidence retention:** every capture, delta report, gate output, probe output and the X1–X3 tests are stored as files in the owner's evidence archive with a SHA-256 manifest; digests and results are summarised in `tasks/AIX-PAR-002/03-evidence.md` and the S10 records pull request. Pilot-time entries are posted by the owner to the Issue #18 ledger. `controls_evidence_ref` cites that evidence.
- **Test classes:** the prepared tests use disposable synthetic repositories and **fake** credentials planted in the plain helper, URL-scoped helper, included-configuration and environment-name channels, each with a positive control proving the channel works when not isolated; and an OS write allowlist on a disposable fixture. They are PROCEDURAL-logic evidence, plus TECHNICAL evidence about the fixture only. They are not evidence that GitHub, the harness sandbox or any owner configuration behaves as required; that is what X1–X3 are for.
- **Rollback and STOP:** before S12 the amendment and the supplement authorise no concurrent writing. From S7 the replaced fetch and push command forms apply to any operator fetch or push; they only add checks. A revert pull request, separately authorised by the owner and itself subject to S3 to S7, restores the historical `STATE-004` text (blob `83d5cf1d…`) and withdraws the supplement; the default `STATE-004` behaviour then applies, which already blocks activation until its gates pass. After S12 any failure of a requirement here is `STOPPED` under `STATE-004`. The owner alone relaxes a ruleset, only after the pilot ends. Findings change state only by the owner's recorded decision.
