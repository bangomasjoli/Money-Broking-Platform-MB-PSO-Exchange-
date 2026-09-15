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

**Public perimeter / pre-authentication abuse control:** the closing architecture
for FND-FIND-001 is now **ACCEPTED FOR IMPLEMENTATION** as
[`DECISION_LOG.md`](../../DECISION_LOG.md) DEC-010 — a four-layer design (trusted
edge pre-auth throttling, mandatory network isolation, a WLT-01-owned
public-surface enablement gate/perimeter-provenance credential, and the existing
unchanged authenticated FND-01 chain from DEC-009). The authenticated engine and
its numeric policy (DEC-009) are unchanged and are NOT extended to any
pre-authentication subject. **FND-01 remains owner of the authenticated L4
rate-limit engine and remains the register-holder of FND-FIND-001; it does NOT
own DEC-010's remaining L1/L2 implementation.** An independent Opus governance/
architecture review (DEC-010 Turn 2 Prerequisites, no code) has **RESOLVED**
implementation ownership of the trusted edge (L1) and mandatory network
isolation (L2) — the layers that alone close this finding — to
[**`IMP-02`**](../../03_implementation/IMP-02/README.md)
(`03_implementation/IMP-02/README.md`, `IN_PROGRESS`; a second instance of the
already-governed `03_implementation` document class, explicitly **not** an 18th
`02_modules/` pack), staged as three sub-turns: **Turn A (L1 UAT trusted-edge
HTTP reference implementation) is COMPLETE / ACCEPTED at commit `65fca52`**
([`IMP-02-ACC-001`](../../03_implementation/IMP-02/acceptance/IMP-02_UAT_Trusted_Edge_Turn_A_Opus_Acceptance_v1.0.md));
**Turn B (L2 mandatory network isolation, UAT proof) is COMPLETE /
ACCEPTED at commit `7132057`**
([`IMP-02-ACC-002`](../../03_implementation/IMP-02/acceptance/IMP-02_UAT_L2_Network_Isolation_Turn_B_Opus_Acceptance_v1.0.md))
— proved only inside a disposable, provider-neutral UAT harness, NOT at a
production deployment; **Turn C (UAT TLS termination, functional) is now
COMPLETE / ACCEPTED at commit `d568fa0`**
([`IMP-02-ACC-003`](../../03_implementation/IMP-02/acceptance/IMP-02_UAT_TLS_Termination_Turn_C_Opus_Acceptance_v1.0.md))
— TLS functional only inside the same disposable UAT harness; **production
certificate lifecycle, cipher policy, and backend/service-to-service TLS or
mTLS all remain PENDING IMP-02 work.**
Production numeric pre-auth policy remains **NOT approved**; the explicitly
non-production INTERNAL-UAT-only provisional policy Turn A implements is
authorized for `IMP-02` engineering/abuse-test purposes only. **Turn A,
Turn B, and Turn C together do not close this finding** — L2 and TLS
proven at a real production deployment, and an approved production numeric
policy, are all still required. FND-FIND-001 **REMAINS OPEN**.

## Open findings

FND-FIND-001 (HIGH — shared rate-limit engine pre-authentication abuse; a public-
perimeter control, not closed by the DEC-009 numeric policy approval, by the
engine's implementation/hardening, or by DEC-010's architecture acceptance alone
— **REMAINS OPEN**, mandatory precondition before any WLT-01 public route is
internet-exposed; Required Action now names `IMP-02` as the designated
implementation owner of the remaining L1/L2 work). Plus FND-FIND-002 through
FND-FIND-009 (Shared Rate-Limit Engine acceptance/hardening findings), and
**FND-FIND-010** (MEDIUM, newly opened by the DEC-010 Turn 2 Prerequisites
review — the shared `@aix/foundation` connection pool configures neither
`pool.max` nor `connectionTimeoutMillis`, blocking accurate production capacity
calibration for FND-FIND-001's eventual closure) — see
[OPEN_FINDINGS.md](../../OPEN_FINDINGS.md) for the full register and current
state of each.
