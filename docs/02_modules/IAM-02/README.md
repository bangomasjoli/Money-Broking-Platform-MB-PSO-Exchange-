---
document_id: IAM-02-IDX
title: IAM-02 — RBAC / Permission Guard / SoD
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: IAM-02
control: RBAC, permission guard, segregation of duties
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# IAM-02 — RBAC / Permission Guard / SoD

**Module ID:** IAM-02
**Module name:** RBAC / Permission Guard / SoD
**Available blueprint versions:** v1.1, v1.2
**Authoritative blueprint version:** v1.2 (see [DOCUMENT_REGISTER.md](../../DOCUMENT_REGISTER.md) — this README does not independently decide authority)
**Blueprint authority status:** APPROVED — certified via IAM-02_v1.1_to_v1.2_Delta_Note.md (see reviews/)
**Implementation status:** ACCEPTED (see [00_project_state/MODULE_STATUS.md](../../00_project_state/MODULE_STATUS.md) for detail)

## Reviews

- [IAM-02_RBAC_Permission_Guard_SoD_Blueprint_Pack_v1.0_Review.md](reviews/IAM-02_RBAC_Permission_Guard_SoD_Blueprint_Pack_v1.0_Review.md)
- [IAM-02_RBAC_Permission_Guard_SoD_Blueprint_Pack_v1.1_Review.md](reviews/IAM-02_RBAC_Permission_Guard_SoD_Blueprint_Pack_v1.1_Review.md)
- [IAM-02_v1.1_to_v1.2_Delta_Note.md](reviews/IAM-02_v1.1_to_v1.2_Delta_Note.md)

## Acceptance evidence

- [IAM-02_Security_Review_Opus_v0.1.md](acceptance/IAM-02_Security_Review_Opus_v0.1.md)
- [IAM-02_Security_Review_Opus_v0.2_reverify.md](acceptance/IAM-02_Security_Review_Opus_v0.2_reverify.md)
- [IAM-02_Approval_Control_Adjudication_Opus_v1.0.md](acceptance/IAM-02_Approval_Control_Adjudication_Opus_v1.0.md) — adjudication of the UI Phase 2L/2R approval-control observations

## Implementation notes / plans

- [IAM-02_IMPLEMENTATION_NOTES.md](notes/IAM-02_IMPLEMENTATION_NOTES.md)
- [IAM-02_Implementation_Plan_v1.0.md](notes/IAM-02_Implementation_Plan_v1.0.md)

## Open findings

IAM2-FIND-001 (double-consume triage required), IAM2-FIND-002 (HIGH — approval endpoints enforce no permission
authorization), IAM2-FIND-003 (MEDIUM — absent approval policy silently yields the weakest control) and
IAM2-FIND-004 (LOW — `iam2.approval_expired` not emitted on the reject path) — see
[OPEN_FINDINGS.md](../../OPEN_FINDINGS.md). Carry-forwards L1/L2/L3 remain tracked in
[IAM-02_Security_Review_Opus_v0.1.md](acceptance/IAM-02_Security_Review_Opus_v0.1.md).
