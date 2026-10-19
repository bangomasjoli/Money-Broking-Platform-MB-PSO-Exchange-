---
document_id: CFG-01-IDX
title: CFG-01 — Feature Flag / Licence Lock
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: CFG-01
control: Feature flags, licence-lock source-of-truth
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# CFG-01 — Feature Flag / Licence Lock

**Module ID:** CFG-01
**Module name:** Feature Flag / Licence Lock
**Available blueprint versions:** v1.1 (no v1.2 exists)
**Authoritative blueprint version:** v1.1 (see [DOCUMENT_REGISTER.md](../../DOCUMENT_REGISTER.md) — this README does not independently decide authority)
**Blueprint authority status:** APPROVED — own v1.1 review; no v1.2 pack exists
**Implementation status:** ACCEPTED — accepted implementation baseline through Phase 3B, plus `MIG-004` (migration 071, `environment_scope`; accepted at `5a4f872`). The module is partial, not complete: the `feature` config-integrity seal is not verified at decision time (`CFG-FIND-002`) and no `environment_scope` write path exists (see [00_project_state/MODULE_STATUS.md](../../00_project_state/MODULE_STATUS.md) for detail)

## Reviews

- [CFG-01_Feature_Flag_Licence_Lock_Blueprint_Pack_v1.0_Review.md](reviews/CFG-01_Feature_Flag_Licence_Lock_Blueprint_Pack_v1.0_Review.md)
- [CFG-01_Feature_Flag_Licence_Lock_Blueprint_Pack_v1.1_Review.md](reviews/CFG-01_Feature_Flag_Licence_Lock_Blueprint_Pack_v1.1_Review.md)

## Acceptance evidence

- Conductor-managed task acceptance: [`MIG-004`](../../03_implementation/tasks/MIG-004/06-acceptance.md) (environment availability, `5a4f872`). No module-level record exists under this folder.

## Implementation notes / plans

- [CFG-01_IMPLEMENTATION_NOTES.md](notes/CFG-01_IMPLEMENTATION_NOTES.md)

## Open findings

`CFG-FIND-001` (HIGH, CLOSED by `MIG-004` at `5a4f872`); `CFG-FIND-002` (MEDIUM, OPEN — config-integrity seal not verified for the `feature` scope at decision time); and the CFG-01 portion of `FND-FIND-013` (CLOSED; the row stays OPEN for WLT-01). See [OPEN_FINDINGS.md](../../OPEN_FINDINGS.md) for the full register.
