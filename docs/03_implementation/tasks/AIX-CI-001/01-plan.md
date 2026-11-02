# 01 Plan — AIX-CI-001: fail-loud PR verification pilot

- **Task ID:** AIX-CI-001
- **Risk:** HIGH — false-green CI and privileged disposable test setup can conceal security defects.
- **Category:** CI assurance / test execution integrity
- **Planner:** Owner-directed planning; no conductor planning execution.
- **Selected implementer:** Claude Code Sonnet; independent review requested from fresh-context Claude Opus.
- **Implementation baseline:** `dd730962860d9e3e1e2469b37b4303b57d9f865c`
- **Owner implementation approval:** 2026-11-03 (Asia/Kuching), GitHub Issue #11 comment `6583611337`.
- **Publication approval:** Issue #11 comment `6584399766`; Ready-for-Review and merge permissions were separately granted later.
- **Governance checkpoint:** owner instruction 2026-11-03 to prepare CI acceptance documentation and mandatory CI protection; **final human task acceptance not yet recorded**.

## Objective

Establish the smallest useful pull-request CI pilot that refuses to pass on missing, failed or unexpectedly skipped required tests, while preserving runtime, IAM, finance and licence controls.

## Approved scope

- Add one PR-to-`main` GitHub Actions workflow with static/web checks, unit tests, verifier self-tests and a targeted disposable PostgreSQL migration-072 regression.
- Verify Vitest JSON reports independently from Vitest exit codes; require actual executed tests with zero failures and skips.
- Require an isolated loopback PostgreSQL test database and cluster-safety checks; no production or shared database access.
- Record independent review and hosted evidence. Maintain the code and PR approval trail.

## Exclusions

- No full integration-suite, UAT, production or regulated activity claims.
- No change to IAM, grants, migrations, runtime guards, operational approval policies or other application source.
- No branch-protection settings changes in the implementation PR; separate owner-approved settings task required.
- No change to G-1 or L-1/L-2/L-3 status absent evidence and human decision.
- No parallel-writing authorisation and no V2 UI implementation.

## Context references

| Category | Path / reference | Purpose |
|---|---|---|
| control | `CLAUDE.md` | Repository boundary and acceptance requirements |
| control | `docs/03_implementation/tasks/README.md` | Durable task record rules |
| control | `docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md` | Model choice and focused diffs |
| source | `.github/workflows/aix-ci-pr.yml` | Hosted PR checks and final aggregate |
| source | `platform/ci/verify-vitest-report.mjs` | Reject false-green test results |
| source | `platform/ci/assert-disposable-database.mjs` | Prevent non-disposable database execution |
| tests | `platform/ci/verify-vitest-report.selftest.mjs` | Positive/negative report controls |
| tests | `platform/ci/assert-disposable-database.selftest.mjs` | Database guard controls |
| tests | `platform/tests/integration/iam2-migration-072.test.ts` | Selected privileged migration/grant regression |
| evidence | GitHub PR #13, Issue #11, Actions run `41497209788` | Source and hosted test evidence |

## Acceptance criteria

- [x] Exact reviewed five-file commit merged using the approved merge-commit method.
- [x] Hosted static/web, unit, verifier and selected PostgreSQL regression checks completed successfully with no unexpected skipped tests.
- [x] Independent review found no BLOCKER/HIGH defects; all residual findings documented.
- [x] G-1 and LOW findings preserved OPEN in separate follow-up issues (#14, #15).
- [ ] Owner explicitly accepts the **CI pilot scope only** and authorises final `06-acceptance.md` / `task.json` transition.
- [ ] Mandatory CI status check applied in branch ruleset and verified (separate governance action).
