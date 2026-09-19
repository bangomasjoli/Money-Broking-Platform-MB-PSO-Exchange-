# 01 Plan — IMP02-MA-HARDEN-001: Harden IMP-02 Turn M-A evidence paths and result validation

- **Task ID:** IMP02-MA-HARDEN-001
- **Risk:** MODERATE
- **Category:** IMP-02 security hardening
- **Planner:** routine_planner / gpt-5.6-sol / LOW (codex_cli)
- **Recommended implementer:** implementer / claude-sonnet-5 / MEDIUM
- **Planning baseline commit:** 7b5ce3d3848b4c64c385c355d7a4023b4509bc25
- **Plan source:** the validated `PlanResult` of conductor provider-validation execution `PV-20260919T162254Z-001` (`records/provider-validation/PV-20260919T162254Z-001` at conductor commit `51cbce74b616`). Rendered from that record; not regenerated.
- **Recorded by:** conductor record checkpoint, authorised by the human in the Phase 2A instruction (section 3), 2026-09-20
- **Implementation approval:** NOT YET GIVEN. Human approval (`humanApprovalRequired: true`) is required before implementation starts; it is given by typing APPROVE at the implementation run, not by this record.

## Objective
Implement the two mandatory Turn M-B gate fixes for IMP-02-FIND-010 and IMP-02-FIND-011 in one focused IMP-02 hardening turn.

## Approved scope
- Add realpath-based containment validation to the Turn M-A evidence writer after target-directory creation and before writing.
- Add runtime allowlist validation for measurement status and measurement_id in createMeasurementResult.
- Add focused regression tests for symlink escape attempts and invalid runtime status/measurement IDs.

## Exclusions (must not be done)
- Do not begin Turn M-B or add CLI, JSON, untyped, or externally influenced entrypoints.
- Do not alter production thresholds, internet exposure, perimeter policy, TLS policy, or deployment architecture.
- Do not modify unrelated modules or mark findings closed without the repository-required independent acceptance evidence.

## Context references (explicit repo-relative files; excerpts use `path#anchor`)
| Category | Reference |
|---|---|
| control | `docs/00_project_state/CURRENT_STATE.md` |
| control | `docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md` |
| task | `docs/OPEN_FINDINGS.md#IMP-02-FIND-010` |
| task | `docs/OPEN_FINDINGS.md#IMP-02-FIND-011` |
| module_docs | `docs/03_implementation/IMP-02/README.md#Independent Review Findings` |
| source | `platform/perf/src/evidence-store.ts` |
| source | `platform/perf/src/schema.ts` |

## Implementation instruction (from the PlanResult)
Work only in the IMP-02 Turn M-A measurement-harness surface. Search before opening or editing and identify the existing focused tests for platform/perf. In platform/perf/src/evidence-store.ts, add a realpathSync-based containment check on the resolved target directory after mkdirSync and before the final write, so a symlink beneath perf/evidence cannot redirect output outside the real evidence root. In platform/perf/src/schema.ts, make createMeasurementResult reject status values outside its five controlled states and measurement_id values outside ALL_MEASUREMENT_IDS at runtime, including calls that bypass TypeScript. Add focused regression tests proving both protections and preserving valid behavior. Keep the diff minimal. Do not start Turn M-B, introduce new input entrypoints, change perimeter/deployment policy, edit unrelated modules, or claim the findings closed; closure requires repository evidence and independent acceptance.

## Acceptance criteria (checkable from repository evidence)
- [ ] A focused regression test proves an in-root symlink that resolves outside the real evidence root is rejected and no file is written outside that root.
- [ ] Focused runtime tests prove createMeasurementResult rejects at least status "APPROVED" and measurement IDs "M2" and "M8b" when supplied through a type-bypassing caller.
- [ ] Existing valid measurement statuses and IDs continue to pass the focused test suite.
- [ ] The relevant platform test command and npm run typecheck complete successfully.
- [ ] The final diff is confined to IMP-02 Turn M-A source/tests needed for these fixes and contains no Turn M-B, production-policy, deployment, or unrelated-module changes.
