# 01 Plan — AIX-PAR-002: AIX-PAR-001 pilot pre-activation control supplement

> **Status: DRAFT preparation, remediation R1 and narrow remediations R2 and R3 prepared. Not accepted, not committed by this record.** The supplement [`STATE-007`](../../../00_project_state/AIX_PAR_001_PRE_ACTIVATION_SUPPLEMENT.md) and a narrow amendment of `STATE-004` are proposals. They have no operative effect until the twelve-step sequence in `STATE-007` §1 reaches S7, and they do not activate the AIX-PAR-001 pilot (**NOT_ACTIVE**). One independent fresh-context review returned REMEDIATE (chat-only report); the targeted delta review of R1 also returned REMEDIATE (narrow, chat-only report: N-1 to N-6), R2 was prepared; the final narrow verification of R2 also returned REMEDIATE (narrow, chat-only report: one MEDIUM finding NF-1 and the LOW observations L-1, L-2 and I-1), R3 was prepared, and a focused independent verification of R3 is still required. No finding is closed or dispositioned by this record.

- **Task ID:** AIX-PAR-002 (the identifier was verified unused on 2026-11-27 in all 21 issues and pull requests, in `docs/` at `6d875ead`, and in remote branch names; `STATE-007` and `PAR-N30` likewise unused; see [03-evidence.md](03-evidence.md) §1)
- **Risk:** HIGH — reason: governs Git write authority, credential attribution, repository isolation and the activation preconditions of a second writer
- **Category:** Governance control / pilot pre-activation
- **Planner:** not a conductor execution (`task.json` `planner: null`). The design basis is the AIX-PAR-002A consolidated design report (Claude Opus 5.5, read-only, 2026-11-27), a chat-only report that is not preserved in the repository (DERIVED)
- **Selected implementer:** Claude Sonnet 5.5 (effort not recorded), same conversation as the design report after a model switch, so **not independent** of it
- **Baseline commit:** `6d875ead5c8f6ec9d42902a67fef695ff7eb595e` (protected `main`; PR #21 governance closure merge)
- **Human approval:** the project owner's task instruction of 2026-11-27 adopting HD-01 to HD-08 **as design requirements for preparing `STATE-007`, subject to independent review and subsequent formal acceptance**, and authorising preparation only. **SESSION-RELAYED**: no GitHub or repository text records it

## Objective

Prepare one coherent, minimal supplement that closes the pre-activation gaps recorded for the AIX-PAR-001 pilot (`PAR-N22`, `PAR-N23`, `PAR-N24`, `PAR-N28`, `PAR-N29`, `GOV-FIND-001` and the PR #19 pre-merge limitation) without editing the accepted policy text, replacing any historical SHA, rewriting historical evidence, or weakening an existing control. The supplement separates procedural controls from technically enforced controls and from owner-operated external configuration, and states plainly which is which.

## Approved scope (round 0: exactly seven paths; R1: eight, see "R1 update" below)

ADD: `docs/00_project_state/AIX_PAR_001_PRE_ACTIVATION_SUPPLEMENT.md`; `docs/03_implementation/tasks/AIX-PAR-002/01-plan.md`, `02-implementation-report.md`, `03-evidence.md`, `task.json`.
MODIFY: `docs/DOCUMENT_REGISTER.md` (one new row in §4e); `docs/00_project_state/CURRENT_STATE.md` (`last_reviewed`, §5 and §8 statements about AIX-PAR).

## Exclusions (must not be done)

`STATE-004` (round 0: blob had to stay `83d5cf1ddc16228b2d0ca8648e7b00b1bf882805`; **R1: it is now the eighth authorised path, narrow insertions only**), root `CLAUDE.md`, `OPEN_FINDINGS.md`, historical `tasks/AIX-PAR-001/**` records, the conductor and all application code; any commit, push, PR, merge, ruleset, credential, connector or account change; creating `PAR-N30`; configuring GitHub interaction limits; closing or dispositioning any finding; activating the pilot; starting `V2-SHELL-01` or `AIX-CI-HARD-001`; accessing the excluded repository; owner-operated external tests T28–T36 and T38–T44 (reported NOT RUN).

## Owner decisions applied (SESSION-RELAYED)

| Decision | How it is applied in `STATE-007` |
|---|---|
| HD-01 hook and reference verification | §2 capture and delta; §3 hook inventory, fetch and push forms |
| HD-02 mandatory exact-file binding | §4, prospective and historical modes; §8.2 retained pre-merge evidence |
| HD-03 fail-closed baseline capture | §2 `par_capture`, replacing the pipeline in `STATE-004` push step (2) for the pilot |
| HD-04 server-side lane protection | §6: pre-declared lane names, exact-name ruleset, read-back, probe test (owner-run, separately authorised) |
| HD-05 owner-operated writes, read-only agents | §5.3 owner-only writes; read-only agent access |
| HD-05a prefer existing sandbox isolation; assess before recommending a separate account | §5.3 capability assessment: active sandbox enforcement UNVERIFIED; a separate account recommended only if owner tests X2 show the sandbox insufficient. No account created, no credential removed |
| HD-05b agent GitHub access read-only during the active pilot | §5.3; connector changes need separate approval (none made) |
| HD-06 explicit repository isolation with verifiable enforcement | §7: roots, instruction-first, canonical component-aware checks (supporting), enforcement as owner configuration X3 |
| HD-06a no memory-directory access unless explicitly authorised | §7: the memory directory is not a root; this task did not read it |
| HD-07 formally resolve the PR #19 deviation | §8.1 narrow transitional provision T-1, effective only after the amended `STATE-004` and the supplement are operative and, from R2, only on explicit adoption at S5 *(round-0 design reference: gates G1 and G2; current: steps S5 and S7)*; §8.2 for future merges |
| HD-08 separate supplement document, two-stage acceptance | the supplement is a separate document `STATE-007`; §1 *(round-0 design reference: gates G1 to G7; superseded in R1 by the twelve steps S1 to S12)* |
| No `PAR-N30`; no GitHub interaction limits; preserve all findings and limitations | `PAR-N30` not introduced; no interaction-limit configuration; every finding stays as recorded |

## Design corrections applied (A to G of the task instruction)

| Correction | Where |
|---|---|
| A. HEAD follows main; permitted GitHub-generated pull references; separate expected main before and after a merge; no silent exemptions | §2 (`par_capture` takes the expected main per capture; `par_delta` operations `none`, `lane-push`, `merge`, `continuity`; explicit reconciliation) |
| B. Credential isolation is more than `credential.helper=` | §5.1 table; `CF`; `par_cred_inventory`; `par_trace_check`; names only; PROCEDURAL versus TECHNICAL |
| C. Acceptance sequencing without circular requirements | §1 *(round-0 design reference: gates G1 to G7 and checks V1 to V8; current requirement: steps S1 to S12 and checks V1 to V9)*, each requiring only lower steps; additional ACTIVE fields and checks |
| D. Canonical component-aware paths, no unconditional case folding, synthetic fixtures | §7 `par_realpath`, `par_ci_volume`, `par_path_ok`, `par_wt_containment` |
| E. Bind to the exact reviewed inventory; historical replay does not require PR #19's base to contain its own merge | §4 `PZ` digest-bound inventory; `MODE` historical versus prospective |
| F. Attribution tests: dry-run push is supporting only; field availability; scoped audit | §5.3 X2 tests and field availability; §5.4 `par_audit` |
| G. T-1 narrow, preserves "not performed", no effect before review and acceptance | §8.1 |

## Context references (explicit repo-relative files)

| Category | Path | Why |
|---|---|---|
| control | `docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md` (`STATE-004`, lines 33 to 80) | the accepted AIX-PAR-001 exception that this supplement adds to |
| control | `docs/00_project_state/CURRENT_STATE.md` | navigation record (edited) |
| register | `docs/DOCUMENT_REGISTER.md`, `docs/OPEN_FINDINGS.md` | document register (edited, one row); findings rows `GOV-FIND-001`, `PAR-N22` to `PAR-N29` (read only) |
| tasks | `docs/03_implementation/tasks/README.md`, `AIX-PAR-001/03-evidence.md` §12 and §19, `AIX-PAR-001/06-acceptance.md`, `AIX-PAR-001/task.json` | record layout; historical verification and the proposed pre-activation matrix |
| issues | #10, #12, #14, #15, #18 (read through the REST API) | lane names, G-1 incident, owner decision comment `7155988583` |

## Acceptance criteria (checkable from repository evidence; none is accepted by this record)

- [x] Review 1: an independent fresh-context review of `STATE-007` (Claude Opus 5.5; chat-only report) returned REMEDIATE (2 HIGH, 2 MEDIUM, 6 LOW, 4 INFORMATIONAL). It decided the former §0 open question against a separate-document-only route (a `STATE-004` amendment is the minimum).
- [ ] A targeted fresh-context delta review of the R1 remediation (not the design reviewer, not the preparer) accepts the corrections. *(Performed once: verdict REMEDIATE (narrow), chat-only; findings N-1 to N-6, addressed by R2 below. Not an acceptance.)*
- [ ] A final narrow fresh-context independent verification of R2, limited to N-1 to N-6 and the resulting integrity changes.
- [ ] Steps S1 to S12 of `STATE-007` §1 are completed in order, each separately authorised, before any `AIX-PAR-001 STATE: ACTIVE` comment; this includes the owner's decision on the exact published head (S5), T-1, the digests of the reviewed path inventory and raw-file manifest, and the amended blob identity.
- [ ] Finding dispositions (`PAR-N22`, `PAR-N23`, `PAR-N24`, `PAR-N28`, `PAR-N29`, `GOV-FIND-001`) are recorded only by the owner's decision with evidence (see [03-evidence.md](03-evidence.md) §8).

## R1 update (remediation after independent review 1; preparation only)

- **Owner decision (SESSION-RELAYED, no GitHub or repository text):** the narrow `STATE-004` amendment route recommended in section G.5 of the review; `STATE-004` and `STATE-007` are reviewed and published together in one pull request; F-1 to F-14 are remediated as applicable without widening the pilot. It authorises preparation only, not acceptance, finding closure, commit or activation.
- **Eight authorised paths:** the seven of round 0 plus `docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md`. Nothing else changed.
- **Mapping:** F-1/F-2 by the amendment (incorporation subsection, pointer bullet, gate-1 T-1 sentence); F-3 by the twelve-step sequence S1 to S12, `par_commit_bind`, mandatory `DECISION_AT` and the §8.3 bootstrap; F-14 by the read/write boundary table and `par_write_ok`; F-4 to F-13 by the block corrections and record corrections listed in [03-evidence.md](03-evidence.md) §10.
- **Not done (by instruction):** commit, stage, push, pull request, merge, ruleset, credential or connector change, finding closure, `OPEN_FINDINGS.md` edit, X1/X2/X3 implementation, activation.

## R2 update (narrow remediation after the R1 targeted delta review; preparation only)

- **Owner decision (SESSION-RELAYED, no GitHub or repository text):** a focused remediation of N-1 to N-6 only. It authorises neither commitment, publication, acceptance nor activation.
- **Incremental scope:** four existing candidate files only: `AIX_PAR_001_PRE_ACTIVATION_SUPPLEMENT.md`, `01-plan.md`, `02-implementation-report.md`, `03-evidence.md`. The other four candidate files (`STATE-004`, `CURRENT_STATE.md`, `DOCUMENT_REGISTER.md`, `task.json`) are byte-identical to the R1 versions, and the amended `STATE-004` blob is unchanged. Consequently `task.json` still reads `remediation: 1` and the `CURRENT_STATE.md` and register wording still say R1; that wording is stale-but-not-wrong and is left for the owner to decide, because changing those files was outside the R2 allowlist.
- **Mapping:** N-1a and N-1b by the §7 write table, the revised `par_write_ok` and the new `par_lex_under` and `par_meta_symlinks`, plus X3 write-boundary tests W1 to W7; N-2 by the correction in `03-evidence.md` §10.3; N-3 by V4, S10 and the new `par_policy_pin`; N-4 by §8.1 item (iv), S5, V8 and the new `par_t1_adopted` (no `STATE-004` change); N-5 by relabelling round-0 G1 to G7 and V1 to V8 references; N-6 by the corrected archive description in `03-evidence.md` §10.7. Detail and tests: [03-evidence.md](03-evidence.md) §11.
- **Not done (by instruction):** commit, stage, push, pull request, merge, fetch, GitHub write, ruleset or setting change, finding closure, `OPEN_FINDINGS.md` or `STATE-004` edit, real X1/X2/X3 tests, activation.

## R3 update (narrow remediation after the R2 final verification; preparation only)

- **Owner decision (SESSION-RELAYED, no GitHub or repository text):** a strictly targeted remediation of NF-1 (shared object-store containment) and the associated observations L-1 (symlink wording), L-2 (T-1 decision binding) and I-1 (integration-merge compatibility). It authorises neither commitment, publication, acceptance nor activation. F-1 to F-13 and N-1 to N-6 are not reopened.
- **Incremental scope:** the same four existing candidate files as R2: `AIX_PAR_001_PRE_ACTIVATION_SUPPLEMENT.md`, `01-plan.md`, `02-implementation-report.md`, `03-evidence.md`. The other four candidate files (`STATE-004`, `CURRENT_STATE.md`, `DOCUMENT_REGISTER.md`, `task.json`) are byte-identical to R2 and the amended `STATE-004` blob is unchanged. The stale R1 wording in the three of them stays as disclosed in [03-evidence.md](03-evidence.md) §11.2.
- **Mapping:** NF-1 by the §7 object-store rules, the rewritten object rows of the write table, the narrowed `par_write_ok`, the new detective `par_objects_snapshot` and `par_objects_delta`, the expanded W7 (W7a to W7h) and the X3 requirements X3-a to X3-e; L-1 by the corrected path-validation text, a code change (a path spelled inside the common directory that resolves outside it is now STOP) and the schedule on which `par_meta_symlinks` and the object checks run; L-2 by the hardened `par_t1_adopted` (plain-ASCII body, exactly one accepted-head line, exactly one T-1 mention in any spelling); I-1 by stating that integration merges are serial operator operations and by identifying, without granting, the one permission a lane-run merge would need. V9 is unchanged and still prohibits activation unless every X3 test is TECHNICAL in the real environment. Detail and tests: [03-evidence.md](03-evidence.md) §12.
- **Not done (by instruction):** commit, stage, push, pull request, merge, fetch, GitHub write, ruleset or setting change, finding closure, `OPEN_FINDINGS.md` or `STATE-004` edit, real X1/X2/X3 configuration or tests, any construction of forged Git objects, activation.
