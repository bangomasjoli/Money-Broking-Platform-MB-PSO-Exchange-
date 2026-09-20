# 02 Implementation Report — IMP02-MA-HARDEN-001

> This report is the implementer's own account plus the recorded chronology. It does **not** prove correctness; see `03-evidence.md`.

- **Implementation model / effort:** claude-sonnet-5 / MEDIUM (Claude Code, run by the conductor in an isolated worktree)
- **Round:** 1
- **Execution:** `IMPL-20260919T191046Z-001` (conductor evidence `records/implementation/IMPL-20260919T191046Z-001/`, conductor commit `1d4ca04c6cac`)
- **Baseline commit:** fd2a1af9eb9b453f6991e9e2ba4abf888766852a
- **Resulting commit:** 9b0bab7bbae7b59ebb75bcc4f963fdb853004363 on `conductor/IMP02-MA-HARDEN-001` (created by the conductor, not by the model)

## Chronology (preserved; the first execution did not succeed normally)
- **Original run:** 1 provider call, approved 2026-09-19T19:10:53.792Z, 90 s. It ended **INVALID_PROVIDER_OUTPUT**: the conductor's own pre-execution hook blocked Claude Code's structured-result tool, so the model's structured result never arrived as an accepted result. The implementation itself was in the worktree, uncommitted. The conductor defect was fixed in conductor commit `b94f726b0266`; the task went to HUMAN_DECISION_REQUIRED.
- **Human recovery:** HUMAN_RECOVERED_BLOCKED_STRUCTURED_OUTPUT, approved by Aiman at 2026-09-19T19:51:42.292Z. No model was called during recovery (additional provider calls: 0); the conductor validated the preserved worktree and committed exactly the three task files.
- **No merge occurred at the implementation stage.** The commit stayed on the task branch until the human acceptance checkpoint (`06-acceptance.md`).

## Changed files (summary)
- `platform/perf/src/evidence-store.ts` — `realpath`-based containment check on the resolved target directory, after directory creation and before the write (IMP-02-FIND-010)
- `platform/perf/src/schema.ts` — runtime allowlist validation of `status` and `measurement_id` in `createMeasurementResult` (IMP-02-FIND-011)
- `platform/tests/unit/perf-evidence-store.test.ts` — regression tests for both controls

Diff stat:
```
 platform/perf/src/evidence-store.ts             | 11 +++-
 platform/perf/src/schema.ts                     | 12 ++++
 platform/tests/unit/perf-evidence-store.test.ts | 83 ++++++++++++++++++++++++-
 3 files changed, 103 insertions(+), 3 deletions(-)
```

## Implementation summary
Adds a symlink-aware containment check to `writeEvidenceAtomic` (a symlink under `perf/evidence/` that resolves outside the real evidence root is rejected and nothing is written outside it), adds runtime allowlist validation to `createMeasurementResult` (`status` against the five controlled states, `measurement_id` against `ALL_MEASUREMENT_IDS`, including for callers that bypass TypeScript), and adds focused regression tests: the symlink escape, `APPROVED` / `M2` / `M8b` and other invalid values rejected, every controlled identifier and status accepted.

## Known issues / deviations
- **REVIEW_CONCERN-001:** In writeEvidenceAtomic, mkdirSync runs before the realpath containment check. A symlink escape may therefore cause creation of an empty directory outside the approved evidence root before the later containment check rejects the evidence write. No evidence file is written outside the approved root. It was ruled acceptable by the independent review and accepted by the human (`06-acceptance.md`).
- (implementer's own report) The schema runtime tests are in perf-evidence-store.test.ts, not the existing perf-schema.test.ts, because only the three listed files could be changed.
- (implementer's own report) mkdirSync(recursive) runs before the containment check, as specified, so a symlinked path with a not-yet-existing subdirectory could create an empty directory outside the root before the write is refused. No file is written outside the root.
- (implementer's own report) npm printed a sandbox-denied network violation for registry.npmjs.org (likely an update check); it did not affect the test or typecheck results.
- (implementer's own report) Both protections still need independent review before OPEN_FINDINGS.md IMP-02-FIND-010 and IMP-02-FIND-011 can be considered closed.
- The first provider execution ended INVALID_PROVIDER_OUTPUT because of a conductor defect (above); the result was recovered under a distinct provenance and re-validated independently.
