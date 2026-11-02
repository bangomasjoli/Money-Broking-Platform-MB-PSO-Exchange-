# 06 Acceptance — IAM02-AUTHZ-REM-001

> This is the full task-scoped human acceptance record for this task (owner disposition 3, below). It is distinct from the review (`04-review.md`), which recommended nothing on acceptance. It records a decision the project owner **already made** in Issue #6 comment `6572166977`; the writer of this file made no decision. **Acceptance is of source code only. It is not acceptance of operational exposure, UAT, production use or any regulatory position.**

- **Final decision:** ACCEPTED WITH CONTROLLED CARRY-FORWARDS — SOURCE CODE ONLY
- **Accepted commit (reviewed PR head / accepted source tree):** `b468c5ddaaeafa118685f35a4104c5261c1963d4`
- **Original implementation commit:** `39639c0b6c5cc45b7e9012680cfd5268e037b318` (`task.json.resultingCommit`, unchanged)
- **Accepted by (human):** Aiman (GitHub `bangomasjoli`), 2026-11-02T08:05:46Z
- **Origin of the timestamp:** the creation time of the owner's GitHub comment (Issue #6, comment `6572166977`, <https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/issues/6#issuecomment-6572166977>). It is not the time this file was written.
- **Reviewer / model / effort:** fresh-conversation Claude Opus (`claude-opus-5-5` as stated by the session), effort not recorded; review dated 2026-10-30, delivered in chat and provided by the owner; verdict **ACCEPT WITH CONDITIONS** (the reviewer's own wording). See "Independent review and its limits".
- **Review execution ID:** none exists (no conductor review execution). `task.json.acceptance.reviewExecutionId` is `null`. See "Known control discrepancy".
- **Status of this record:** written locally. Not pushed. PR #7 is draft and unmerged. The authoritative repository task state does not change for anyone else until a separately authorised push.

## Immutable references
| Reference | Meaning |
|---|---|
| `b468c5ddaaeafa118685f35a4104c5261c1963d4` | The commit accepted: the reviewed PR #7 head, parent `5969c2cb606dcb2476f514fd124853db0577e79e`. Its last change is documentation (records 02, 04, 05, evidence, `task.json`). |
| `39639c0b6c5cc45b7e9012680cfd5268e037b318` | The original implementation commit: all service code, migration 072 and the IAM-01 change. |
| `effcdf39c6666f014ce7c9776f83903f6263381f` | Base (`main`) at the time of acceptance; unchanged. |
| `928c828cc67b56ccac756070188a0ae4a8a2e760` | Later **test-only** commit (two files: `iam2-authz-rem-decision-db.test.ts`, `iam2-authz-rem-consumers-real.test.ts`). |

**Code identity (VERIFIED by the record writer at preflight, 2026-11-02):** `git diff 39639c0 b468c5d -- platform/services platform/infra platform/packages` is empty. Production code, migration 072 and runtime grants at the accepted commit are byte-identical to the original implementation commit; the only `platform/**` files that differ are the two test files above.

## Accepted scope
Source code only, as it exists at `b468c5d`:
- Maker entitlement enforced at approval-request creation and again, live, at decision-token execution (no cache-version bump needed for revocation, deny override, licence lock or `prohibited` to take effect).
- Presented approval-ID binding and re-read of the real approval at execution; action / resource / entity / client / payload-hash binding.
- Role and target substitution prevention in `roles.ts` (D7-01): the server derives the payload hash from the operation it performs.
- Atomic single-use decision tokens (row lock plus conditional consume with row-count check).
- Approver step-up verification: purpose `iam2_approval:<approval_id>`, assertion bound to the claimed approver, fresh, held by an active `staff`/`admin` identity per IAM-01's own classification.
- Policy snapshot at creation, retired (`inactive`) vs emergency-`revoked` policy handling, count-1 gate (multi-approver fails closed).
- The minimal additive IAM-01 `verify-assertion` fields (`user_type`, `user_class`, `user_status`).
- Schema-only migration `072_iam2_approval_authz_hardening.cjs` **as source code**.
- The associated regression, negative, concurrency and audit tests.

## Independent review and its limits
All figures below are **reviewer-reported** (the owner provided the report in conversation; it is not a signed or committed GitHub review). They were not independently reproduced by the writer of this record.
- Fresh-conversation Opus review dated 2026-10-30 of PR #7 head `b468c5d`: **ACCEPT WITH CONDITIONS**; no blocking defect.
- Targeted 16-file batch: **257 passed, 0 failed, 0 skipped**.
- Reviewer's adversarial harness: **16 of 16 passed** (concurrent redemption 25 trials × 10, approval races, cross-approval substitution, live revocation, policy revocation, step-up and eligibility negatives, role/target substitution, snapshot-less legacy request, RLS scope under interleaving).
- **Four mutation probes**, each removing one control (token row lock and conditional consume; approval-ID binding; execution-time entitlement re-check; assertion-owner binding), each made the paired attack test fail.
- `npm run typecheck`: exit 0.
- Full suite: **5,531 passed, 5 failed, 53 skipped** (5,589 tests). The five failures: three `perf-m2a-observe` (disclosed in `03-evidence.md` §16.6), one `wlt1-sensitive-read-route` (shared-database race; passed alone 3 of 3), one `wlt1-db` M-REV-1 (review-setup artefact: the test expects a superuser named `postgres`). None of those files is touched by this task.
- Reviewer-run migration 072 checks on a disposable database: `down` refuses atomically when a `revoked` policy exists; otherwise it restores the previous check and `up` re-applies.
- **Evidence retention:** only the full-suite log survived the review session's scratch space (not committed). The 257-run log was not preserved. The harness and mutation script persisted in scratch but their output was not saved. None of this is stored in the repository. The 257/257 result is reproducible from the repository on a freshly migrated, granted database; the harness and mutation probes are not in the repository.
- **Limits stated by the reviewer:** one local environment (PostgreSQL 17.10, disposable clusters); no real-consumer end-to-end run (T-45); the IMPL-01…04 fixes were not re-reviewed line by line; production collation not stress-tested.
- **Review-conversation disclosure:** the review conversation also hosted the later 2026-11-02 acceptance proposal and the writing of this record, after the model was switched from Opus to Sonnet. No code or repository file was changed by the reviewer.

## Qualified D-7 exception (Issue #6 comment `6571763993`)
The owner approved a **narrow, explicit exception** under which the 2026-10-30 fresh-conversation review is accepted as satisfying the purpose of D-7 despite an **automatically injected, metadata-only one-line memory index** (commit identifiers and status: "draft PR #7 open", "NOT_ACCEPTED", "needs clean-context review"). The reviewer reported that the underlying memory file, earlier transcripts, prior scratch snapshots and session summaries were not consulted, and that the same account and model family were used.
- **Do not state that the review had zero inherited context.** It had that index.
- The exception does not waive independent security review for future tasks, does not cover inherited implementer reasoning, and is not acceptance, a PR approval or a finding closure.
- The strict clean-context condition recorded in `04-review.md` ("Independence and provenance", item 1) is resolved **only** by this exception, not by any review having been strictly independent.

## The three owner governance dispositions (Issue #6 comment `6572166977`)
1. **Open findings and HIGH carry-forwards.** The scoped implementation is accepted with **every task-proposed finding F01–F11 remaining PROPOSED/OPEN, including all five HIGH, and all registered `IAM2-FIND-001…004` remaining OPEN**, without promotion, closure or change of severity. `docs/OPEN_FINDINGS.md` remains the authority for registered findings. This is conscious acceptance of the code scope, **not** acceptance of operational exposure, UAT or production risk. HIGH carry-forwards are listed explicitly below in addition to MEDIUM and LOW, **notwithstanding the template's narrower "Carry-forward findings (LOW / MEDIUM)" heading**, on the authority of this owner decision.
2. **Missing conductor review-execution ID.** `reviewExecutionId` is `null` because no conductor review execution ID exists, following the `MIG-004` and `MIG-005` precedent. No non-execution identifier was invented. If automated validation rejects `null`, the discrepancy is recorded and an owner-controlled schema or validator resolution is required (below).
3. **Acceptance-record location.** For this task-scoped remediation, this file is the **full** task acceptance record. The existing IAM-02 module-level acceptance files under `docs/02_modules/IAM-02/acceptance/` remain authoritative for prior baselines and are neither replaced nor duplicated. This is the owner's explicit interpretation of the README's pointer convention for this narrowly distinct task.

## Carry-forward findings — task-proposed (all PROPOSED/OPEN, none promoted or closed)
Severities are the task's own proposals (`01-plan.md` §5). The last column is an informational technical note about the accepted code, **not a disposition and not a closure**.

| ID | Severity | Informational note on the accepted code |
|---|---|---|
| IAM02-AUTHZ-REM-001-F01 | **HIGH** | `roles.ts` now uses the central execution wrapper; deny override or zero-role admin with a token is refused |
| IAM02-AUTHZ-REM-001-F04 | **HIGH** | Maker entitlement enforced at request, approval and execution in IAM-02; consumer baselines remain advisory; R-1, R-3, R-4 remain |
| IAM02-AUTHZ-REM-001-F08 | **HIGH** | Presented `approval_id` bound to the token and the real approval |
| IAM02-AUTHZ-REM-001-F09 | **HIGH** | Atomic single-use consumption; relation to `IAM2-FIND-001` is a triage decision, not equated here |
| IAM02-AUTHZ-REM-001-F10 | **HIGH** (counted) | (a) service-class, client-class and non-active approvers refused within IAM-01's own classification (R-2, R-6 remain); (b) multi-approver is blocked and fails closed, not implemented |
| IAM02-AUTHZ-REM-001-F02 | MEDIUM | Assertion owner compared with the claimed approver |
| IAM02-AUTHZ-REM-001-F03 | MEDIUM | Policy snapshot at creation; no policy rows exist (OD-3) |
| IAM02-AUTHZ-REM-001-F05 | MEDIUM | Live checks replace the cache bump; revocation is still privileged SQL outside IAM-02 (see D7R-02) |
| IAM02-AUTHZ-REM-001-F11 | MEDIUM | Approver status checked at approval time; maker-side status open (R-1) |
| IAM02-AUTHZ-REM-001-F06 | LOW | One active policy per action/resource enforced by index |
| IAM02-AUTHZ-REM-001-F07 | LOW | Duplicate-decision evidence preserved by SAVEPOINT at database level |

`task.json.findingsSummary` is unchanged: BLOCKER 0, HIGH 5, MEDIUM 4, LOW 2, the eleven finding IDs open, `carryForwardIds` empty.

## Carry-forward findings — registered (`docs/OPEN_FINDINGS.md`, unchanged, all OPEN)
- `IAM2-FIND-001` (requires triage) — F09's fix is relevant evidence; whether they are the same defect is an unmade triage decision.
- `IAM2-FIND-002` (HIGH) — the code closure criteria appear addressed in the accepted code, but closure needs separate adjudication. The row's own trigger ("before any browser-originated or real-actor approval integration, before UAT evidencing maker-checker with real actors, and before production exposure") and its L3 caveat remain.
- `IAM2-FIND-003` (MEDIUM) — closure criteria **not** met: no policy rows exist (OD-3). A missing policy now fails closed.
- `IAM2-FIND-004` (LOW) — out of scope; the reject handler's expiry branch still publishes no `iam2.approval_expired` event.

## Residuals and review observations — all still open
- **R-1** maker (and any non-approver) account status is not enforced. **R-2** caller-asserted identities (carry-forward L3), including the reject path. **R-3** CFG-01 capability, kill-switch and licence-profile gates remain consumer gates. **R-4** time-of-check/time-of-use between the wrapper and the consumer's own write. **R-5** step-up assertion reuse within its TTL. **R-6** eligibility is a classification, not proof of personhood. **R-7** approver status is not re-checked at execution.
- **O-1** (human-checker comprehension) — the checker sees a hash and a maker-controlled free-text `payload_ref`, not the role and target being approved; a dependency for real-approval UAT.
- **D7R-01** (LOW, reviewer) — `role_iam2_runtime` holds table-wide `UPDATE` on `iam2.approval_request`, so it can change `status` and `approved_count` (`rejected` → `approved` demonstrated); migration 072 freezes only binding and snapshot columns. Presupposes use or compromise of IAM-02 runtime database credentials. **Separately tracked pre-real-actor-UAT decision** on database integrity, allowed transitions, count invariants and scoped privileges. **No fix or scope expansion approved. Not registered, not closed.**
- **D7R-02** (LOW, reviewer) — a token refused for entitlement stays `active`; if the denial is lifted within its ~12-minute TTL the same token redeems. **Separately tracked pre-real-actor-UAT decision** on retry versus irreversible cancellation, with audit and test requirements. **No policy adopted. Not registered, not closed.**
- **D7R-03** (INFO) — a guard-issued token for an unflagged permission redeems when no `approval_id` is presented; safe today only because of the catalogue flags plus SEC-01's own route check. **D7R-04** (INFO) — an unreachable fail-open fallback (`approved_count + 1`) in the approve handler that predates this task.
- **N-2**, **N-3**, **PR7-OBS-1**, **PR7-OBS-2** (`04-review.md`) — open, unchanged.
- **Legacy false-green test suites** (`iam2-db.test.ts` and the AML-01, CFG-01 and CLT-01 `*-iam2-guard-real` tests keep `if (!schemaReady) return;`; other modules not audited) — disclosed, not remediated.
- **Known test-environment limits:** three `perf-m2a-observe` failures in some runs; shared-database races (`clt1-db`, `wlt1-sensitive-read-route`); the deterministic `iam-db` + `iam-session-introspection` failure, pre-existing.

## Outstanding dependencies and gates (not satisfied by this acceptance)
- **OD-2** real-consumer payload delivery (five non-WLT consumers do not return the payload object).
- **OD-3** approval-policy matrix and **migration 073** (not authored; no `approval_policy` row exists, so with the fail-closed behaviour no protected action can complete an approval).
- **OD-4** role grants, checker roster and provisioning.
- Real-actor end-to-end approval proof for each consumer (T-45) and UAT.
- IAM-01 deployment ordering: the additive `verify-assertion` fields must deploy before or with the IAM-02 change; IAM-02 fails closed against an older IAM-01.
- Registered-finding triage (`IAM2-FIND-001…004`); maker and caller identity residuals (R-1, R-2); multi-approver activation stays blocked (fail-closed).

## Exclusions — this acceptance does NOT mean
No UAT or production readiness; no operational, licensing or regulatory approval or authorisation; no execution of migration 072 in any shared, staging or production environment (it has run only on disposable local databases); no live policy or grant provisioning; no capability activation; no deployment; no finding closure, promotion or severity change; no change to the D-7 standard for future work. Merge, push and PR-metadata changes are separate owner actions.

## Known control discrepancy (to be resolved by the owner, not worked around)
`task.json.acceptance.reviewExecutionId` is `null`, as the owner decided. The conductor repository's task-manifest validator (`aix-conductor`, `src/records.ts`, `validateTaskManifest`) requires `reviewExecutionId` to be a non-empty string, so it is expected to reject this value; `MIG-004` and `MIG-005` carry the same `null`. No string was fabricated and no validator was changed. An owner-controlled schema or validator resolution remains open. The validation result obtained when this record was written is stated in the commit report, not here.

## Conditions noted for the owner's later push, PR and merge decisions
These come from the acceptance proposal and are noted, not imposed; the owner decides at that time.
- Push, PR description refresh (it still states 6 commits and 23 files; the PR has 7 commits and 26 files), ready-for-review and merge each need their own instruction. Under the chosen Option A, acceptance (this record) precedes any merge authorisation.
- Before any merge, `platform/**` should be confirmed byte-identical to `b468c5d` (`git diff b468c5d <merge head> -- platform` empty), and the merge method should preserve the accepted commit identifiers.
- Merging a migration file is not executing it; whether any deployment path would run migration 072 automatically has **not** been verified.

## Pre-UAT conditions (real-actor approval flows)
OD-3 and migration 073 with an independently reviewed per-action policy matrix; OD-4 grants and roster; OD-2 payload delivery; owner decisions on D7R-01 and D7R-02; O-1 resolved; real-actor end-to-end tests per consumer; an owner decision on R-1 and R-2; `IAM2-FIND-003` and `IAM2-FIND-001` handled; IAM-01 ordering confirmed in the target environment. Production adds the operational and regulatory gates outside this record.

## Records
`01-plan.md`, `02-implementation-report.md`, `03-evidence.md`, `04-review.md`, `05-remediation.md`, `task.json`. Owner decisions: Issue #6 comments `6339447853`, `6340362022`, `6340858922`, `6345549226`, `6446493744`, `6448272837`, `6448938869`, `6449571186`, `6450001986`, `6450286654`, `6571763993`, `6571827648`, `6572166977`.
