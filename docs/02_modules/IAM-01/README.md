---
document_id: IAM-01-IDX
title: IAM-01 — Authentication / MFA / Session
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: IAM-01
control: Auth, MFA, session, step-up
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# IAM-01 — Authentication / MFA / Session

**Module ID:** IAM-01
**Module name:** Authentication / MFA / Session
**Available blueprint versions:** v1.1, v1.2
**Authoritative blueprint version:** v1.2 (see [DOCUMENT_REGISTER.md](../../DOCUMENT_REGISTER.md) — this README does not independently decide authority)
**Blueprint authority status:** APPROVED — certified via [FND-01/IAM-01 delta note](../_cross_module/reviews/FND-01_IAM-01_v1.1_to_v1.2_Delta_Note.md)
**Implementation status:** ACCEPTED (see [00_project_state/MODULE_STATUS.md](../../00_project_state/MODULE_STATUS.md) for detail)

**Post-acceptance extension:** Internal Session Introspection (`POST /internal/auth/session/validate`) — COMPLETE / ACCEPTED. Added as the WLT-01 BLOCKER-1 prerequisite: the sole internal seam by which another module resolves a client bearer token to an authenticated identity/`user_class`, reusing the canonical `validateAccessToken` with no duplicated session-validation semantics. Implementation `5794ffe`, test-harness remediation `5a29559`. See acceptance evidence below and [DECISION_LOG.md](../../DECISION_LOG.md) DEC-008.

## Reviews

- [IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.0_Review.md](reviews/IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.0_Review.md)
- [IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.1_Review.md](reviews/IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.1_Review.md)

## Acceptance evidence

- [IAM-01_Final_Review_Opus_v1.0.md](acceptance/IAM-01_Final_Review_Opus_v1.0.md)
- [IAM-01_Security_Review_Opus_v0.1.md](acceptance/IAM-01_Security_Review_Opus_v0.1.md)
- [IAM-01_Session_Introspection_Opus_v1.0.md](acceptance/IAM-01_Session_Introspection_Opus_v1.0.md) — Internal Session Introspection seam, independent final acceptance (WLT-01 BLOCKER-1 prerequisite)

## Implementation notes / plans

- [IAM-01_IMPLEMENTATION_NOTES.md](notes/IAM-01_IMPLEMENTATION_NOTES.md)

## Open findings

Carried, non-blocking, from the Session Introspection acceptance: IAM1-FIND-001 through
IAM1-FIND-005 (INFORMATIONAL/LOW/MEDIUM, none fixed by design). IAM1-FIND-006 and
IAM1-FIND-007 (test-harness only) are CLOSED. See [OPEN_FINDINGS.md](../../OPEN_FINDINGS.md)
for the full register and current status of each.
