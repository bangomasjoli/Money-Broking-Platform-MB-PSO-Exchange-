# 03 Evidence — IMP02-MA-HARDEN-001

> Facts read from the repository and check output, not from the implementation report. References commits and files; no large diffs or logs.

- **Collected:** 2026-09-20T07:43:44.962Z
- **Baseline commit:** fd2a1af9eb9b453f6991e9e2ba4abf888766852a
- **Resulting commit:** 9b0bab7bbae7b59ebb75bcc4f963fdb853004363
- **Branch:** conductor/IMP02-MA-HARDEN-001 (main fast-forwarded to the resulting commit at acceptance)
- **Working tree clean:** true (task worktree at the commit, and AIX main after the fast-forward and post-merge validation)
- **Diff sha256:** f8c99d32b6798d5fb146cffeff71633e01d17cd4c0a4ff66347147bf479ac963

## Checks
Run by the conductor (sandboxed, no network), not taken from the implementer.

**On the task worktree at the resulting commit, before merge:**

| Check | Command | Status | Exit |
|---|---|---|---|
| targeted-tests | `npm --prefix platform test -- tests/unit/perf-evidence-store.test.ts` | PASS | 0 |
| regression-tests | `npm --prefix platform test -- tests/unit/perf-` | PASS | 0 |
| typecheck | `npm --prefix platform run typecheck` | PASS | 0 |
| lint | `npm --prefix platform run lint` | NOT_RUN | — |

**On AIX main after the fast-forward, at acceptance:**

| Check | Command | Status | Exit |
|---|---|---|---|
| targeted-tests | `npm --prefix platform test -- tests/unit/perf-evidence-store.test.ts` | PASS | 0 |
| regression-tests | `npm --prefix platform test -- tests/unit/perf-` | PASS | 0 |
| typecheck | `npm --prefix platform run typecheck` | PASS | 0 |
| lint | `npm --prefix platform run lint` | NOT_RUN | — |

- Lint is NOT_RUN: `platform/package.json` defines no lint script.
- Migrations: n/a (no migration touched).

## Changed files
- platform/perf/src/evidence-store.ts
- platform/perf/src/schema.ts
- platform/tests/unit/perf-evidence-store.test.ts

## Diff stat
```
 platform/perf/src/evidence-store.ts             | 11 +++-
 platform/perf/src/schema.ts                     | 12 ++++
 platform/tests/unit/perf-evidence-store.test.ts | 83 ++++++++++++++++++++++++-
 3 files changed, 103 insertions(+), 3 deletions(-)
```

## Targeted evidence references
- Implementation execution `IMPL-20260919T191046Z-001`: model claude-sonnet-5, effort MEDIUM, original provider calls 1, additional provider calls during recovery 0; corrected tool audit PASS (16 calls: Read 4, Grep 1, Edit 6, Bash 3; the two `StructuredOutput` calls were blocked by the old hook and never executed; unknown 0, violations 0). Conductor evidence: `records/implementation/IMPL-20260919T191046Z-001/` at conductor commit `1d4ca04c6cac`.
- Independent review `REV-20260920T063148Z-001` (see `04-review.md`): conductor evidence `records/review/REV-20260920T063148Z-001/`.
- The changed-file list, the diff hash and the commit parent (= the baseline) were re-derived from Git at acceptance; the diff equals the one the reviewer was given.
