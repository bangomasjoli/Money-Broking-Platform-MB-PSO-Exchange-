# 05 Remediation — IAM02-AUTHZ-REM-001 (rounds 1–4, retrospective)

> **Retrospective record, written after the fact (2026-10-28, Asia/Kuching) by Claude Sonnet** from the committed code, GitHub Issue #6 and the reviews summarised in `04-review.md`. It is not a conductor execution and carries no execution identifier. The remediation round counts in `task.json` (`remediation: 4`) are a **manual tally** matching the four rounds below. **Nothing here closes, promotes or registers any finding, and the task remains `IMPLEMENTATION_COMPLETE` / `NOT_ACCEPTED`.**

- **Approved by:** the project owner (GitHub `bangomasjoli`), by the Issue #6 comments cited per round. Each comment records the owner's reply "approve" to a specific proposal; none of them is acceptance.
- **Implementation agent:** Claude Sonnet (model identifier and effort of the 2026-10-23 and 2026-10-27 sessions not recorded; later sessions stated `claude-sonnet-5-5`).
- **Baseline commit:** `a892bf374de2bf1291f7ba269d69bcfde9a9d66c` (rounds 1–3 worked on the uncommitted tree on top of it).
- **Resulting commits:** `39639c0b6c5cc45b7e9012680cfd5268e037b318` (rounds 1–3, first committed together) and `928c828cc67b56ccac756070188a0ae4a8a2e760` (round 4, test-only).

## Reading guide: four different things are kept apart
1. **Implemented fix** — code or test changed, in a commit named below.
2. **Verification** — who checked it, and how. *Implementer-reported* = Sonnet's own run (`03-evidence.md` §15.3, §16.4–§16.6). *Reviewer-reported* = an Opus review summarised in `04-review.md`; the original reports are **not on file** and the strict clean-context D-7 condition is **not** claimed to be met.
3. **Task-proposed findings** — `IAM02-AUTHZ-REM-001-F01…F11` in `task.json`: all **PROPOSED and open**, none promoted. The items below (IMPL-01…04, D7-01, D7-02, N-1) are **review observations with the reviewers' labels**, not F-numbers.
4. **Registered findings** — `IAM2-FIND-001…004` in `docs/OPEN_FINDINGS.md`: unchanged, all **open**. This task changes no register.

Because rounds 1–3 were made on the uncommitted tree and first committed together, **no per-fix commit or per-fix diff exists**. The "commit" column therefore means "first committed in".

## Round 1 — X-3 and IMPL-01…IMPL-04
- **Authority:** Issue #6 comment `6345549226` (heading dated 2026-10-23, Asia/Kuching). Authorises focused Sonnet edits only; explicitly not review acceptance, not a commit, not a push.
- **Source of the observations:** round A, the 2026-10-22 Opus review, which ran in the implementer's own conversation and is **not independent** (Issue #6 comment `6345549226`; report not on file). Severities as the owner's authorisation records them: LOW each.
- **Context (earlier approved test exceptions, comment `6340858922`):** X-1 (approver step-up purpose becomes `iam2_approval:<approval_id>`) and X-2 (duplicate-decision test at count 1, with the unreachable duplicate branch covered at database level) were made in `iam2-db.test.ts` during implementation; they are not part of this round.

| Item | Observation | Fix (first committed in `39639c0`) | Before → after | Verification |
|---|---|---|---|---|
| **X-3** | The exact error-code key-list test needed the approved security codes | `platform/tests/unit/iam2-guard.test.ts` (+13 −1): key list extended, exact-key assertion kept | the catalogue test would have failed on the new codes → it still asserts the exact key set, now including them | implementer-reported; in the 257-test batch |
| **IMPL-01** | A parallel error catalogue existed beside the canonical one | eight codes consolidated into `IAM2_ERROR_CODES` (`platform/services/iam2/src/lib/errors.ts` +23); catalogue test `error catalogue (AZ-11, IMPL-01, X-3)` in `platform/tests/unit/iam2-authz-rem.test.ts` | two registries (risk of divergent HTTP mapping) → one registry with the approved HTTP mapping and generic messages | implementer-reported; covered by the unit test |
| **IMPL-02** | `iam2-migration-072.test.ts` passed silently when its database prerequisites were missing | prerequisite error recorded and thrown in every test; named skip when unset (`platform/tests/integration/iam2-migration-072.test.ts`) | silent pass → visible failure with the cause | implementer-reported |
| **IMPL-03** | T-49 asserted too weakly that the immutability trigger fired | T-49 in `platform/tests/integration/iam2-authz-rem-db.test.ts` now asserts SQLSTATE `23514` for every snapshot and approval-binding column | a failure from an unrelated constraint could pass → only the trigger's own error passes | implementer-reported |
| **IMPL-04** | No test proved the IAM-01 additive fields under real `role_iam_runtime` grants and row-level security | new `platform/tests/integration/iam-verify-assertion-runtime-role.test.ts` (own disposable database) | superuser-only proof → proof under the runtime role, and through IAM-02's `verifyApproverStepUp` | implementer-reported; 8 tests in the batch |

**Result.** Implemented. Round C (`04-review.md`) re-ran the 257-test batch that includes these tests; it did not review IMPL-01…04 individually. Security assertions were preserved.

## Round 2 — D7-01 and D7-02
- **Authority:** Issue #6 comment `6446493744` (heading dated 2026-10-27). Focused code and test fixes only; not a commit, push or acceptance.
- **Source:** round B, the new-session D-7 Opus review, verdict **REMEDIATE** (report not on file; findings as the owner's authorisation records them).

| Item | Severity | Fix (first committed in `39639c0`) | Before → after | Verification |
|---|---|---|---|---|
| **D7-01** role substitution | HIGH | `platform/services/iam2/src/routes/roles.ts` derives `fingerprint({ role_code, target_user_id })` from the operation actually executed; `platform/services/iam2/src/lib/decision-token.ts` gained the additive `assertedPayloadHash` (a supplied hash must equal the server value or the token is revoked with a Critical audit and the reason `caller_hash_differs_from_server_derived`). Tests: 8 in `iam2-authz-rem-db.test.ts`, 2 in `platform/tests/unit/iam2-authz-rem.test.ts`. | An approval for role A plus A's approved hash assigned role B, because the caller's hash was compared as given → the server compares its own hash; substitution of role or target is refused with no role row and the token revoked | **Reviewer-reported (round C):** independent real-HTTP harness 25/25 in two complete runs; pre-fix mutant assigned role B; second mutant failed exactly the two hash-consistency checks. Implementer-reported: 8/8 D7-01 tests. |
| **D7-02** e2e isolation | LOW | `platform/tests/integration/iam2-authz-rem-iam01-e2e.test.ts` builds and drops its own disposable database, scopes T-51's audit counts to the test identity, and fails visibly when prerequisites are missing | shared-database writes and global event counts made T-51 flaky and fed the `iam-db` race → isolated; `iam-db` + the e2e file 10/10 clean | **Reviewer-reported (round C):** isolation, teardown, failure modes, race matrix. The pre-existing `iam-db` ↔ `iam-session-introspection` failure was **not** remediated (0/10 clean on the tree and on `a892bf3`). |

**Result.** Implemented; reviewer-reported resolved. Not re-reviewed after round C.

## Round 3 — N-1
- **Authority:** Issue #6 comment `6448272837` (heading dated 2026-10-28). Narrow fix in one file, then two local commits.
- **Source:** round C observation N-1 (LOW).
- **Fix (first committed in `39639c0`):** `platform/tests/integration/iam2-authz-rem-db.test.ts` — the 53 `if (!schemaReady) return;` guards replaced by `assertPrerequisites()`; `beforeAll` records the missing schema, role, migration 072 or grants, or an unreachable server; a named skip when `TEST_DATABASE_URL` is unset.
- **Before → after:** 54 tests passed on an empty database without running an assertion → they fail visibly with the cause. No assertion changed (three hunks: header, declarations, `beforeAll`).
- **Verification:** implementer-reported (scenario matrix, `03-evidence.md` §15.2); reproduced again in the same-conversation round D (non-independent). **Made after the round C review and not independently re-reviewed.**
- **Disclosed deviation:** this change is in the code commit `39639c0`, i.e. it is the one piece of code changed after the independent review.

## Round 4 — the two sibling test files
- **Authority:** Issue #6 comment `6448938869` (heading dated 2026-10-28). Exactly two test files and a local evidence addendum.
- **Source:** found by the implementer while fixing N-1 (not reported by round C); recorded in `03-evidence.md` §15.2.
- **Fix (`928c828`, test-only, +161 −36):** `platform/tests/integration/iam2-authz-rem-decision-db.test.ts` and `platform/tests/integration/iam2-authz-rem-consumers-real.test.ts` use the same prerequisite approach, with grant probes for the tables each file writes. The runtime-role privilege assertion in the decision file is preserved.
- **Before → after:** 16 of 16 passed on an empty database with nothing executed; 5 passed with migration 072 missing; 16 skipped against an unreachable server → all 16 fail visibly with the cause in each case.
- **Verification:** implementer-reported (`03-evidence.md` §16.2–§16.5); round D (non-independent) compared every test block with its pre-fix version (all identical once the guard line is ignored) and re-ran the matrix. **Not independently re-reviewed.**

## Retained open conditions (unchanged by any round above)
- **Residuals R-1…R-7** (maker/non-approver account status; caller-asserted identities L3 including the reject path; CFG-01 capability gates; time-of-check/time-of-use; step-up reuse within its TTL; eligibility is a classification not personhood; approver status not re-checked at execution) — open.
- **O-1** (the human checker cannot reliably see the role and target being approved) — unresolved; a dependency for real-approval UAT; not a registered finding.
- **Findings:** `IAM02-AUTHZ-REM-001-F01…F11` proposed and open; `IAM2-FIND-001…004` open. None is closed, promoted or registered.
- **Review observations still open:** N-2, N-3, PR7-OBS-1 and PR7-OBS-2 (`04-review.md`).
- **Legacy silent-return test suites** (`iam2-db.test.ts`, `aml1`/`cfg1`/`clt1-iam2-guard-real`; other modules not audited) — disclosed, not remediated, not authorised.
- **Dependencies:** OD-2 (consumer payload delivery), OD-3 (approval-policy matrix; no live policy rows), OD-4 (checker roles and grants), migration 073 (not authored), multi-approver (fail-closed restriction).
- **Strict D-7 clean-context review condition** — not established (`04-review.md`); requires a clean-context review or a separate human-approved exception.
- **No production, UAT, deployment or regulatory claim.** Migration 072 was executed only on disposable local databases.
