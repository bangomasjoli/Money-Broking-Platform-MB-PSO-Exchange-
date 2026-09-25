# 03 Evidence — MIG-004

> Facts read from the repository and from check output. Collected by the implementing session; an independent reviewer should re-collect before acceptance.

- **Collected:** 2026-09-25T18:48Z
- **Baseline commit:** `bdc5dfc` (main = origin/main, tree clean before editing)
- **Resulting commit:** `5a4f8728684f1f8ee34b6b56b48eb49780aa5263` (`feat(cfg1): enforce environment capability availability (MIG-004)`)
- **Branch:** main. Working tree clean when the evidence runs below were taken.
- **Database:** a real local PostgreSQL 17.10 cluster. Every full run used a **fresh disposable database**: `migrate:up`, then all nine `infra/grants/*_runtime_grants.sql` files, then `TEST_DATABASE_URL`. This is the SEC-01-notes convention: one fresh DB per run. `TEST_DATABASE_URL` was set, so no DB-gated test self-skipped for lack of a database; the 53 skipped tests are the same 53 as baseline.

## Checks
| Check | Command | Status | Evidence |
|---|---|---|---|
| typecheck | `npx tsc -b` | PASS, exit 0 | at `5a4f872` |
| migration up (clean DB) | `node-pg-migrate -m infra/migrations --no-check-order up` | PASS, head `071_cfg1_environment_scope`, 71 migrations | fresh DBs `aix_mig004_evidence`, `aix_mig004_evidence3` |
| migration 071 regression (private DB) | `vitest run tests/integration/cfg1-migration-071-regression.test.ts` | PASS 29/29 | backfill, CHECK, grants-before-071 ordering, down/up |
| MIG-004 decision matrix (private DB) | `vitest run tests/integration/cfg1-mig004-environment-availability-private.test.ts` | PASS 35/35 | six CFG-01 apps, real `role_cfg1_runtime` |
| CFG-01 unit | `vitest run tests/unit/cfg1-environment-availability.test.ts tests/unit/cfg1-decision-token.test.ts` | PASS 62 + 20 | parser, mapping, static guards, token checks |
| CFG-01 existing integration | `vitest run tests/integration/cfg1-db.test.ts` | PASS 88/88 | shared fresh DB |
| full suite, MIG-004 (fresh DB, clean tree), run 1 | `npx vitest run` | 5423 total / 5368 passed / **2 failed** / 53 skipped | both failures in the pre-existing CLT-01 race pair (below) |
| full suite, MIG-004 (fresh DB, clean tree), run 3 | `npx vitest run` | 5423 / 5368 / **2 failed** / 53 | both failures in the same CLT-01 race pair |
| full suite, **baseline `bdc5dfc`** (fresh 070 DB), run a | `npx vitest run` | 5291 / 5233 / **5 failed** / 53 | all 5 in the same CLT-01 race pair |
| full suite, **baseline `bdc5dfc`** (fresh 070 DB), run b | `npx vitest run` | 5291 / 5236 / **2 failed** / 53 | both in the same CLT-01 race pair |
| lint | n/a: `lint:web` covers `apps/web` only, which was not touched | NOT_RUN | — |

**Regression verdict: ZERO DIFFERENTIAL FAILURES attributable to MIG-004.**
- Every MIG-004-run failure is in `clt1-db.test.ts` / `clt1-principal-membership-route.test.ts`, the pair that fails at baseline `bdc5dfc` too: full suite 5 and 2; the pair alone 2, 5, 4 and 2 over 4 of 4 runs.
- The failing test titles differ run to run, which is the signature of a race. The first baseline run (0 failures) was a scheduling outcome, not a clean pair. See `02-implementation-report.md` MIG-004-O1.
- +132 tests were added, and all pass.
- A second full run on an **already-used** DB is not valid evidence and is excluded. Pre-existing residue causes it to fail; for example, `cfg1-db`'s `test.p3a_no_raw_token_feature` leaves one `cfg1.feature_version` row per run, and the baseline DB shows it too.
- `perf-m2a-observe` passes only on a clean tree, by design (`perf/src/m2a-observe.ts`: a dirty tree returns `INVALID`), which is why the evidence runs were taken after the local commit.

## Mandatory DB validation (task brief) → where it is proven
| Requirement | Proof |
|---|---|
| Clean DB migrates up through 071 | fresh-DB builds above; the private suites migrate to head |
| Pre-existing `cfg1.feature` row → 071 → all-DISABLED backfill | 071 regression **C**: an `enabled`, version-3 row and a `disabled` row are both backfilled to all-DISABLED; `current_state` and `version` are untouched |
| Malformed / missing-key / extra-key / bad-value / `STAGING` probes | 071 regression **F**: 18 malformed shapes each rejected with 23514 on INSERT **and** UPDATE; SQL NULL rejected with 23502; every key accepts all three states |
| Runtime `INSERT(environment_scope)` denied | 071 regression **D** (SET ROLE `role_cfg1_runtime`) and private suite (real LOGIN role): both 42501 |
| Runtime `UPDATE(environment_scope)` denied | the same two suites: 42501, and the row is unchanged |
| Grants applied *before* 071 still end restricted | 071 regression **B→D**. With the migration's REVOKE block removed, test D fails (sabotage check), so the migration-time restriction is load-bearing |
| Down/up round trip | 071 regression **G/H**: down drops the constraint and column and keeps rows; re-up re-backfills all-DISABLED, so availability is not resurrected |

## Non-vacuity checks (temporary sabotage, reverted before commit)
- Evaluating the **asserted** environment instead of the own one, and removing the mismatch deny, the PRODUCTION hold and the `exchange.` deny → **7 of 35** private-suite tests fail (prod and staging matrix rows, trust mismatch, demo mismatch, unlisted `exchange.*`, both PRODUCTION-hold tests).
- Removing migration 071's REVOKE/GRANT block → 071 regression **D** fails.

## Changed files (`git diff --stat bdc5dfc 5a4f872`: 16 files, +1570 / −126)
- `platform/infra/migrations/071_cfg1_environment_scope.cjs` (new)
- `platform/infra/grants/cfg1_runtime_grants.sql`
- `platform/services/cfg1/src/lib/environment-availability.ts` (new)
- `platform/services/cfg1/src/lib/decision.ts`
- `platform/services/cfg1/src/lib/decision-token.ts`
- `platform/services/cfg1/src/routes/features.ts`
- `platform/services/cfg1/src/routes/feature-changes.ts`
- `platform/tests/unit/cfg1-environment-availability.test.ts` (new)
- `platform/tests/unit/cfg1-decision-token.test.ts`
- `platform/tests/integration/cfg1-mig004-environment-availability-private.test.ts` (new)
- `platform/tests/integration/cfg1-migration-071-regression.test.ts` (new)
- `platform/tests/integration/cfg1-db.test.ts`
- `platform/tests/integration/fnd-rate-limit-policy-privilege-ordering.test.ts` (test-only head-pin fix)
- `docs/03_implementation/tasks/MIG-004/02-implementation-report.md` (new), `task.json`, `docs/00_project_state/CURRENT_STATE.md`

No change under `services/wlt1`, `services/fnd`, `services/iam2`, `packages/foundation`, `apps/`, or any historical migration.

## Scope assertions checkable from the diff
- No `isProductionGated` in any CFG-01 code (static guard test, comment-stripped).
- `computeFeatureScopeHash` / `FeatureSealRow` unchanged; `verifyDecisionTimeIntegrity` unchanged (CFG-FIND-002 untouched). Proven by the private-suite seal tests.
- No row is seeded `ENABLED` by any migration; no `environment_scope` write route exists; the runtime role holds neither INSERT nor UPDATE on the column.
