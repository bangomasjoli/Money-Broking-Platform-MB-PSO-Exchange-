---
document_id: FND-01-IDX
title: FND-01 — Platform Foundation
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: FND-01
control: Platform foundation (scheduler/RLS/audit-outbox/correlation)
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# FND-01 — Platform Foundation

**Module ID:** FND-01
**Module name:** Platform Foundation
**Available blueprint versions:** v1.1, v1.2
**Authoritative blueprint version:** v1.2 (see [DOCUMENT_REGISTER.md](../../DOCUMENT_REGISTER.md) — this README does not independently decide authority)
**Blueprint authority status:** APPROVED — certified via [FND-01/IAM-01 delta note](../_cross_module/reviews/FND-01_IAM-01_v1.1_to_v1.2_Delta_Note.md)
**Implementation status:** ACCEPTED (see [00_project_state/MODULE_STATUS.md](../../00_project_state/MODULE_STATUS.md) for detail)

**Extension — Shared Rate-Limit Engine (WLT-01 BLOCKER-2 prerequisite):** architecture ACCEPTED FOR IMPLEMENTATION, v1 numeric policy APPROVED FOR MIGRATION 069 ([DECISION_LOG.md](../../DECISION_LOG.md) DEC-009), implemented and independently accepted **COMPLETE / ACCEPTED** at commit `2cdeaa5` (migrations `068_fnd_rate_limit_engine`, `069_fnd_rate_limit_policy_seed`), post-acceptance hardening **COMPLETE / VERIFIED** at commit `eb4a767` (migration `070_fnd_rate_limit_policy_privilege_hardening`). Migration head: `070_fnd_rate_limit_policy_privilege_hardening` (70 migrations). **WLT-01 BLOCKER-2 IS SATISFIED** — see [FND-01_Rate_Limit_Hardening_Opus_v1.0.md](acceptance/FND-01_Rate_Limit_Hardening_Opus_v1.0.md) for the full acceptance/hardening/verification record.

## Reviews

- [FND-01_Platform_Foundation_Blueprint_Pack_v1.0_Review.md](reviews/FND-01_Platform_Foundation_Blueprint_Pack_v1.0_Review.md)
- [FND-01_Platform_Foundation_Blueprint_Pack_v1.1_Review.md](reviews/FND-01_Platform_Foundation_Blueprint_Pack_v1.1_Review.md)

## Acceptance evidence

- [FND-01_Final_Review_Opus_v1.0.md](acceptance/FND-01_Final_Review_Opus_v1.0.md)
- [FND-01_Implementation_Review_v0.1.md](acceptance/FND-01_Implementation_Review_v0.1.md)
- [FND-01_Rate_Limit_Hardening_Opus_v1.0.md](acceptance/FND-01_Rate_Limit_Hardening_Opus_v1.0.md) — Shared Rate-Limit Engine implementation acceptance (`2cdeaa5`) + post-acceptance hardening (`eb4a767`)

## Implementation notes / plans

- [FND-01_IMPLEMENTATION_NOTES.md](notes/FND-01_IMPLEMENTATION_NOTES.md)
- [FND-01_Implementation_Plan_v0.1.md](notes/FND-01_Implementation_Plan_v0.1.md)

## Open findings

FND-FIND-001 (HIGH — shared rate-limit engine pre-authentication abuse; a public-
perimeter control, not closed by the DEC-009 numeric policy approval or by the
engine's implementation/hardening — **REMAINS OPEN**, mandatory precondition
before any WLT-01 public route is internet-exposed). Plus FND-FIND-002 through
FND-FIND-009 (Shared Rate-Limit Engine acceptance/hardening findings — see
[OPEN_FINDINGS.md](../../OPEN_FINDINGS.md) for the full register and current
state of each).
