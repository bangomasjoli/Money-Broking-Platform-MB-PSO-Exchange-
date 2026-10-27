# 04 Review — IAM02-AUTHZ-REM-001 (archival summary of review rounds A–D)

> **Archival summary, written after the fact (2026-10-28, Asia/Kuching) by Claude Sonnet.** The reviews below were delivered **in chat** and were never stored in this repository. No original report, execution identifier, manifest, usage record or signature is on file, and none is invented here. Everything under "reviewer-reported" is the reviewers' own statement, summarised; it is **not** repository-verified. Round-specific files (`04-review-r2.md` …) are **not** created because no round's original evidence is recoverable. This record is a judgement summary and **does not constitute acceptance**; human approval is still required (no `06-acceptance.md` exists).

- **Reviewer (primary round, C):** high-risk security reviewer / Claude Opus (`claude-opus-5-5`, as stated by the session) / effort **not recorded**.
- **Decision (round C):** **ACCEPT WITH CONDITIONS** — the reviewer's own wording; the conductor decision vocabulary (ACCEPT | REMEDIATE | ESCALATE | HUMAN_DECISION) has no exact equivalent. A **technical** verdict only, explicitly *not* owner or governance acceptance.
- **Human approval required:** true.
- **Evidence reviewed (round C):** the working tree at `a892bf3` with 11 modified and 9 untracked implementation files, later committed as `39639c0`; `03-evidence.md`; Issue #6 through comment `6446493744`; the focused delta of D7-01 and D7-02 (five files: `routes/roles.ts`, `lib/decision-token.ts`, and the DB, e2e and unit tests).

## Independence and provenance — read first
1. **The strict clean-context D-7 condition is NOT established by anything on file.** Issue #6 comment `6340858922` requires a fresh-context independent Opus security review and states that a new model in the same session is not independent. No round below is recorded as satisfying that condition in full. It must be resolved by a genuine clean-context review **or** a separate, explicit, human-approved exception (Issue #6 comment `6450001986`). No exception is granted by this record.
2. **Round A (2026-10-22)** ran in the implementer's own conversation. Issue #6 comment `6345549226` records that it said so and that it cannot satisfy D-7. Supporting evidence only. Report not on file.
3. **Round B (2026-10-27)** ran in a new session (Issue #6 comment `6446493744`). Verdict **REMEDIATE**; findings D7-01 (HIGH) and D7-02 (LOW). Its report is **not on file**, and whether it inherited project-memory material is **not on file**.
4. **Round C (2026-10-28)** ran in a new session relative to the implementation sessions and independently re-ran its checks on disposable databases, **but** (a) it **automatically inherited project-memory material** — a memory index and an IAM-02 project-state note, which recorded earlier verdicts and the D7 fixes as leads — plus the user-level instruction file; and (b) it **read tracked-diff, status and file-hash snapshots left by an earlier session in that session's scratch directory** to identify which files D7 changed, without verifying who made them. It therefore did not start with no context. It did verify the tree by hash (below).
5. **The round-C conversation also hosted the later work.** After the verdict, the same Claude Code conversation was switched by `/model` to Sonnet, which made the N-1 correction, the two sibling test fixes (`928c828`), the evidence commits, the push and the draft PR #7; then to Opus for round D; then to Sonnet for this record. The post-review changes were therefore authored in the reviewer's own conversation. No later review by an uninvolved session exists.
6. **Round D (PR #7 self-check, 2026-10-28)** ran in that implementation conversation and **declared itself NOT independent** before starting. It must not be cited as an independent review.
7. **Not on file for any round:** original reports; the real-HTTP harness, mutant copies and race scripts (kept in session scratch only); model-execution identifiers; effort levels; signatures.

## Round summary
| Round | Date | Where it ran | Decision | Independent? | On file |
|---|---|---|---|---|---|
| A | 2026-10-22 | implementer's conversation | ACCEPT WITH CONDITIONS | **No** | cited in Issue #6 comment `6345549226` only |
| B | 2026-10-27 | new session | REMEDIATE (D7-01 HIGH, D7-02 LOW) | not established | cited in Issue #6 comment `6446493744` only |
| C | 2026-10-28 | new session, memory and snapshot inherited, same conversation as later work | ACCEPT WITH CONDITIONS | partial; strict D-7 **not** claimed | this summary only |
| D | 2026-10-28 | implementation conversation | MERGE_READY_WITH_NONBLOCKING_CONDITIONS | **No** (self-declared) | this summary only |

## Round C — what the reviewer reported (REVIEWER-REPORTED unless marked)
**Scope.** A focused re-review of D7-01 and D7-02 plus regression and scope checks. It did **not** repeat the full IAM-02 security review. It did **not** review the later N-1 correction, the sibling fixes, the evidence commits or the PR description, which did not exist yet.

**Baseline.** Branch `task/IAM02-AUTHZ-REM-001-impl`, HEAD `a892bf3`, 11 modified and 9 untracked files, no stash; Issue #6 authorisation matched. The reviewer recorded a hash of the whole uncommitted tree before and after to show the review changed nothing.

**D7-01 — role substitution (reported resolved).** `routes/roles.ts` derives `fingerprint({ role_code, target_user_id })` on the server from the role actually assigned and the URL target; a caller-supplied `current_payload_hash` is only a consistency check and the server value is never null.
- An independent real-HTTP harness (real IAM-01 and IAM-02 processes, each logged in as its own runtime role only, disposable database) passed **25 of 25** checks in each of **two complete runs** (a first attempt aborted on a harness SQL typing error, not a product defect).
- Covered: A→A succeeds with and without a hash; A approved and B executed refused with A's hash, B's hash and no hash; target X→Y refused with X's hash, Y's hash and none; inconsistent hash; forged null-hash tokens; a guard-shaped token with no approval; fabricated `approval_id`; explicit deny after approval; replay.
- Every payload-hash and binding mismatch revoked the token and committed exactly one Critical audit; entitlement-deny, provenance and schema refusals left the token active; audit text never contained a hash value.
- Concurrency: 24 trials of 8 concurrent redemptions of one token and 24 mixed A/B races never produced more than one success or any role B; role B was never assigned in the whole database.
- **Mutation checks** on scratch copies: restoring trust in the caller hash assigned role B (15/25 passed); removing only the asserted-hash comparison failed exactly the two "supplied hash must match" checks (23/25). The fix is causal for the protection.
- Sonnet's eight D7-01 integration tests were executed (not silently skipped) and wrote real rows.

**D7-02 — e2e isolation (reported resolved).** The e2e file creates and drops its own disposable database; the shared database held 0 identities, 0 outbox rows and 0 user roles afterwards; no `aix_e2e_*` database survived any run; an unreachable server or missing CREATEDB privilege fails every test with a named prerequisite; an unset URL gives a named skip; T-51 counts are scoped to the test identity; no assertion was removed. Race matrix: e2e alone 4/4 clean; `iam-db` alone 4/4; `iam-db` + new e2e **10/10**; `iam-db` + `iam-session-introspection` **0/10** on the working tree **and 0/10 on an export of `a892bf3`**, failing the same assertion (`iam-db.test.ts:179`, `expected 2 to be 1`). The reviewer concluded that pairing fails **deterministically in its environment** and is pre-existing. Twenty earlier runs in the matrix were discarded as invalid (a harness database-naming error).

**Regression.** IAM-02 batch 257 passed, 0 failed, 0 skipped, three runs. Full suite 5589 tests: 5533 passed, **3 failed (`perf-m2a-observe`, also failing at `a892bf3`)**, 53 skipped. An earlier full run was discarded as invalid for SEC-01 (wrong ingest tokens in the reviewer's template). `npm run typecheck` exit 0; a forced build in a scratch copy exit 0, and a deliberately broken copy exit 1 (negative control).

**Scope.** No grants, seeds, migration 073, consumer production code, register or governance-document changes; migration 072 contains no GRANT, REVOKE or INSERT; R-1…R-7 still described as residual in code.

**Reviewer limits.** One environment (macOS, PostgreSQL 17.10, disposable local clusters). Production collation not stress-tested. Author of the pre-D7 snapshot not verified. The harness is not stored.

## Findings
These are **review observations with the reviewers' own labels**. They are **not** the task-proposed findings F01…F11 and **not** rows in `docs/OPEN_FINDINGS.md`. Nothing here promotes or closes any finding.

| ID | Severity (reviewer) | Category | Description | Evidence | Status / action |
|---|---|---|---|---|---|
| D7-01 | HIGH | authorisation | Role substitution: the redemption trusted the caller's payload hash, so an approval for role A could assign role B | round B report (Issue #6); round C harness and mutant M1 | Implemented in `39639c0`; **reviewer-reported resolved** (round C); not re-reviewed since |
| D7-02 | LOW | test isolation | The new e2e file wrote into the shared database and counted global audit events | round B (Issue #6); round C race matrix | Implemented in `39639c0`; **reviewer-reported resolved**; the `iam-db` ↔ `iam-session-introspection` race is pre-existing and **not** remediated |
| N-1 | LOW | false-green tests | `iam2-authz-rem-db.test.ts` returned early when the schema was missing, so tests passed without running | round C (reviewer-reported) | Fixed in `39639c0` and, for the two sibling files, `928c828`; **not independently re-reviewed**; other legacy suites keep the pattern (see conditions) |
| N-2 | INFO | audit usability | The `caller_hash_differs_from_server_derived` reason does not say whether the token was approved for a different operation; a substitution sent with no hash carries no reason | round C | Open; not changed |
| N-3 | INFO | test strength | The D7-01 null-hash integration test asserts only "not 200, no role row", not the error code or token revocation (the reviewer's harness did) | round C | Open; not changed |
| O-1 | observation | maker-checker workflow | `approval_request` stores a payload hash and a maker-controlled free-text `payload_ref`; the human checker cannot reliably see the role and target being approved | round C | **Unresolved**; a dependency for real-approval UAT; not a registered finding |
| PR7-OBS-1 | LOW | test strength | `iam2-authz-rem-db`'s grant probe checks only SELECT on `approval_request`; the sibling files probe more grants. A partial grant still fails visibly in the tests | round D (non-independent) | Open; not changed |
| PR7-OBS-2 | LOW | diagnostics | A `TEST_DATABASE_URL` login without privileges is reported as "schema … missing" because `information_schema` hides schemas it cannot use | round D (non-independent) | Open; not changed |
| PR7-OBS-3 | INFO | evidence wording | `03-evidence.md` §16.6 implied the `perf-m2a-observe` failures occur in every run; they are environment-dependent | round D (non-independent) | Addressed by the §16.6 clarification and §17 in `03-evidence.md` (documentation) |

(`PR7-OBS-n` labels are assigned by this record for traceability only.)

## Conditions stated with the round-C verdict
1. Record the D7 evidence and the deterministic `iam-db` ↔ `iam-session-introspection` race in the task record — done in `03-evidence.md` §15.4 and §16.6.
2. Fix or record N-1 — fixed for the three IAM-02 database files that had the pattern (`iam2-authz-rem-db`, `-decision-db`, `-consumers-real`); the legacy silent-return suites (`iam2-db.test.ts` 48 occurrences, `aml1`/`cfg1`/`clt1-iam2-guard-real` 18/17/25) remain and are disclosed; other modules were not audited.
3. The owner decides whether to track O-1 — open.

## Round D — PR #7 self-check (NOT independent; summarised for completeness)
Verdict **MERGE_READY_WITH_NONBLOCKING_CONDITIONS**, from the implementation conversation. It reported: six commits and 23 files with correct ancestry; the reviewed tree hash reproduced from `39639c0` with the pre-N-1 file swapped back (so the only code change since round C is three test files); all 62 test blocks in the three remediated files identical to their pre-fix versions after normalising the guard line; the setup's privilege-related lines unchanged and the new prerequisite helper read-only; the prerequisite matrix reproduced on a fresh cluster (healthy 70 passed; empty, 071-only, grants-missing, unreachable all failed visibly; unset skipped); IAM-02 batch 257/257; typecheck exit 0; one full-suite run of 5535 passed, **1 failed** (`clt1-db`, the known shared-database race), 53 skipped, with **all three `perf-m2a-observe` tests passing in that run**. It recommended an explicit merge-sequencing decision and that the task-record gaps (this checkpoint) be closed before acceptance. It confirmed in code that multi-approver stays fail-closed, maker account status is still a no-op, caller-asserted identities remain, and no policy rows, grants or migration 073 exist.

## Escalation decision
None recorded. A clean-context re-review, or an explicit human-approved exception, is required before acceptance (see "Independence and provenance", item 1).

## Rationale
Round C found no blocking technical defect in the D7 delta and showed, with a reproduced attack and mutants, that the fix is causal. Its reach is limited to that delta and to regression, and its provenance is mixed: new session, but with inherited memory, a prior session's snapshot, and a later co-located implementation conversation. Round D adds same-conversation consistency checks only. Together they support a technical statement that no blocking defect was found in what was examined; they do not support acceptance, merge-by-default, production or UAT readiness, or closure of any finding. Open items: R-1…R-7, O-1, OD-2 (consumer payload delivery), OD-3 (approval-policy matrix), OD-4 (checker roles and grants), migration 073, the multi-approver restriction, and the legacy false-green suites.

> This review is a judgement over the evidence and **does not by itself constitute acceptance**. Human approval is still required.
