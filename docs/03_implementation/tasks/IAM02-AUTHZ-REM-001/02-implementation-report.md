# 02 Implementation Report — IAM02-AUTHZ-REM-001

> **Retrospective record, written after the fact (2026-10-28, Asia/Kuching) by Claude Sonnet from the committed code, GitHub Issue #6 and the already-recorded evidence.** It is the implementer's own account. It is **not** a conductor execution: there is no `ModelExecutionRecord`, execution identifier, manifest or usage record for any of this work, and none is invented here. It does **not** prove correctness and does **not** replace `03-evidence.md`. Task status is unchanged: `IMPLEMENTATION_COMPLETE` / `NOT_ACCEPTED`.

- **Implementation model / effort:** Claude Sonnet. The model identifier and effort of the implementation sessions of 2026-10-22…27 are **not recorded** in the repository. The later sessions (N-1, sibling test fixes, commits, push, draft PR, this record) stated `claude-sonnet-5-5`; effort not recorded.
- **Round:** initial implementation (Issue #6 comment `6340858922`) plus four owner-authorised remediation passes, traced in `05-remediation.md`. Round counts in `task.json` are a manual tally, not conductor-driven.
- **Baseline commit:** `a892bf374de2bf1291f7ba269d69bcfde9a9d66c` (documentation checkpoint, revision 3); code baseline `main` at `effcdf39c6666f014ce7c9776f83903f6263381f`.
- **Resulting commit (code):** `39639c0b6c5cc45b7e9012680cfd5268e037b318`. Later test-only commit: `928c828cc67b56ccac756070188a0ae4a8a2e760`. Evidence commits `64889785888b68107ed58517c827b3ca9edcaced` and `5969c2cb606dcb2476f514fd124853db0577e79e`. Branch `task/IAM02-AUTHZ-REM-001-impl`; draft PR #7 (open, unmerged).

Status words: **VERIFIED** = checked against git or GitHub when this record was written; **IMPLEMENTER-REPORTED** = Sonnet's own run results (recorded in `03-evidence.md` §15.3, §16.4–§16.6), not independently reproduced; **REVIEWER-REPORTED** = from the Opus reviews summarised in `04-review.md`.

## Authorised implementation scope (VERIFIED against Issue #6)
Authority: comment `6340858922` (Phase B), with decisions D-1…D-8 (`6339447853`) and OD-1 Option A (`6340362022`).
- Implement the approved AZ-01…AZ-20 contract, the two binding clarifications (X-2 duplicate-decision coverage; mixed `staff`/`admin` identity pairs eligible, each field tested independently) and a narrow additive IAM-01 change.
- IAM-02 library and routes; the IAM-01 `verify-assertion` response; **schema-only migration 072** executed on **disposable databases only**; security, negative, concurrency and audit tests.
- **Excluded:** migration 073, live policy matrix or seeding, role grants and checker roster, consumer production code, unrelated IAM-01 behaviour, capability unlock, register or finding changes, any production or UAT claim, push, merge, deployment, shared-database activity, acceptance.
- The authorisation left the code uncommitted for review; the first code commit was separately authorised (comment `6448272837`).

## Changed files in the code commit `39639c0` (VERIFIED by `git show --numstat`)
20 files, +4656 / −198. Source and migration:
- `platform/infra/migrations/072_iam2_approval_authz_hardening.cjs` (+177) — schema only: policy snapshot columns on `iam2.approval_request`; immutability trigger over snapshot and approval-binding columns; `revoked` policy status (terminal; `down` refuses if any policy is `revoked`); policy shape checks; one active policy per action/resource; request snapshot limited to `required_count = 1`. No grant, seed or data statement.
- `platform/services/iam/src/routes/step-up.ts` (+32 −4) — **IAM-01 additive:** `verify-assertion` also returns the assertion owner's live `user_type`, `user_class` and `user_status` (null when the identity row is unreadable). `valid` and every existing field are unchanged; no new condition is added to `valid`.
- `platform/services/iam2/src/lib/decision-token.ts` (+236 −29) — approval-id binding; token row read `FOR UPDATE` and consumed by a conditional update with a row-count check; the central `verifyAndConsumeForExecution` wrapper (live entitlement re-check, approval provenance, `revoked`-policy check); `assertedPayloadHash` (D7-01).
- `platform/services/iam2/src/lib/guard.ts` (+119 −17) — chain parameterised behind three entry points; `evaluatePermission` unchanged, plus `evaluatePermissionWithStepUp` and `evaluateEntitlement`. Step 3 (account/session freeze) is still a documented no-op.
- `platform/services/iam2/src/lib/iam01-client.ts` (+171 −2) — approver-eligibility verification (`verifyApproverStepUp`, `requireEligibleHumanChecker`); a verified step-up is tracked in a module-private `WeakSet` so a fabricated object is not honoured; failure is always fail-closed.
- `platform/services/iam2/src/routes/approvals.ts` (+398 −110) — create, approve and reject gated by entitlement; policy snapshot at creation; approve verifies the purpose-bound assertion before the row lock opens; checker-role and separation-of-duties checks; decision inserted under a SAVEPOINT; denials return a structured outcome so their evidence commits, and the error is thrown after commit.
- `platform/services/iam2/src/routes/roles.ts` (+37 −18) — role assignment uses the central wrapper and, after D7-01, a **server-derived** `fingerprint({ role_code, target_user_id })`; a caller-supplied hash is only a consistency check; the recorded `approval_id` is the verified one.
- `platform/services/iam2/src/routes/internal.ts` (+10 −4) — `execute-verify` uses the central wrapper and passes the presented `approval_id`.
- `platform/services/iam2/src/lib/errors.ts` (+23) — eight approval-authorisation codes added to the single canonical `IAM2_ERROR_CODES` catalogue (two are blueprint-catalogued; six are implementer-proposed).
- `platform/services/iam2/src/lib/sod.ts` (+24) — `lookupActiveRoleCodes` for the checker-role test.
- `platform/services/iam2/src/lib/approval-decision.ts` (+71, new) — SAVEPOINT-protected insert of `approval_decision` (only the named duplicate constraint is treated as a duplicate).

Tests (counts are from the recorded 257-test batch run, IMPLEMENTER-REPORTED):
- New: `iam2-authz-rem-db` (54), `iam2-authz-rem-decision-db` (5), `iam2-authz-rem-consumers-real` (11), `iam2-authz-rem-iam01-e2e` (6, own disposable database), `iam2-migration-072` (5), `iam-verify-assertion-runtime-role` (8) under `platform/tests/integration/`; `platform/tests/unit/iam2-authz-rem.test.ts` (21).
- Modified, within owner-approved exceptions: `iam2-db.test.ts` (X-1: the approver step-up purpose is now `iam2_approval:<approval_id>`; X-2: the duplicate-decision test now runs at count 1 with the unreachable duplicate branch covered by the database-level test; approve requests now carry the assertion) and `iam2-guard.test.ts` (X-3: the exact error-code key list was extended, not discarded).

Not changed (VERIFIED by path inspection): consumer services, grants, seeds, migration 073, registers, `CLAUDE.md`, `AGENTS.md`.

## Implementation summary
The remediation makes approval additive to, never a substitute for, the maker's underlying entitlement: it is re-evaluated at request and at execution, so a deny, revocation, licence lock or `prohibited` flag overrides a valid token. A presented `approval_id` must equal the token's bound approval and the approval is re-read for provenance. Tokens are single use under a row lock. The approver must hold an active `staff`/`admin` identity with a user- and approval-bound step-up assertion; service-class, client-class and non-active approvers are refused. The policy in force is snapshotted onto the request, and a `revoked` policy blocks pending approvals and outstanding unredeemed tokens. Role assignment binds the approved role and target by a hash the server derives itself.

## Verification, by provenance
- **IMPLEMENTER-REPORTED (Sonnet), disposable PostgreSQL 17.10 only:** targeted IAM-02 / IAM-01 / consumer batch **257 passed, 0 failed, 0 skipped**, three runs; D7-01 subset 8 passed; `npm run typecheck` exit 0. Full-suite runs were **not clean**: the 3 `perf-m2a-observe` failures and intermittent shared-database races appear in the recorded runs (`03-evidence.md` §15.3, §16.6). Earlier interim test counts from the first implementation pass are not on file in the repository and are not relied on.
- **REVIEWER-REPORTED (Opus, `04-review.md`):** independent real-HTTP attack harness for D7-01 25/25 in two complete runs; mutants of the fix reproduced the vulnerability; D7-02 isolation and race results; technical verdict **ACCEPT WITH CONDITIONS**.
- **Not independently reproduced by anyone else:** the Sonnet runs above. **Not run at all:** any execution against a shared, staging or production database; UAT; real approval flows for the six consumers.

## Known issues / deviations / limits
- The fixes for IMPL-01…IMPL-04, X-3, D7-01, D7-02 and N-1 were made on the uncommitted tree and first committed together in `39639c0`, so no per-fix commit or per-fix diff exists; the before/after effect of each is documented in `05-remediation.md`. `iam2-authz-rem-db.test.ts` in `39639c0` already contains the N-1 correction, which was made **after** the independent Opus review (the only code changed after that review; test-only).
- The two sibling files `iam2-authz-rem-decision-db` and `iam2-authz-rem-consumers-real` were corrected afterwards in `928c828`.
- Six of the eight new error codes are implementer-proposed, not blueprint-catalogued.
- Existing silent-return (`if (!schemaReady) return;`) suites remain outside this work: `iam2-db.test.ts` and the AML-01, CFG-01 and CLT-01 `*-iam2-guard-real` tests. Other modules' suites were not audited.
- Open and not remediated here: residuals R-1…R-7 (maker account status; caller-asserted identities L3; CFG-01 gates; time-of-check/time-of-use; step-up reuse; classification not personhood; approver status at execution), O-1 (checker comprehension), OD-2 consumer payload delivery, OD-3 approval-policy matrix, OD-4 checker roles and grants, migration 073, and the multi-approver restriction (fail-closed).
- Migration 072 was executed only on disposable local databases. Nothing is deployed, accepted or production-ready.
