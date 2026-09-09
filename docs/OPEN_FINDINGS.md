---
document_id: GOV-002
title: AIX Full Compliance — Open Findings Register
version: 1.0
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Open findings, blockers, deferrals tracking
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# AIX Full Compliance — Open Findings Register

This is the single current register for unresolved findings, deferred controls, known
environment issues, and blockers across the AIX Full Compliance project. It supersedes
scattered findings text embedded in `00_project_state/PROJECT_HANDOVER.md` for
**current** status purposes — the historical narrative in `PROJECT_HANDOVER.md` is left
intact and remains the record of *when* and *how* each finding arose.

**State values:** `OPEN` · `DEFERRED` · `BLOCKED` · `ENVIRONMENT` · `FUTURE_CONSUMER` · `CLOSED`

A finding is marked `CLOSED` only when repository evidence (a commit, a remediation
turn, an independent re-review) proves closure. All statuses/severities are carried
forward unchanged from their source tracking documents except where a specific row's
own citation shows independently-verified closure evidence (commit + reproduced test
result) — see IAM1-FIND-006/IAM1-FIND-007 for the current example.

---

### CLT-01 — Membership Authority

| Finding ID | Module | Control | Severity / Status | Finding | Required Action | Due / Trigger | Source / Acceptance | State |
|---|---|---|---|---|---|---|---|---|
| CLT-FIND-001 | CLT-01 | Membership Authority | LOW / NON-BLOCKING | Bound `iam_user_id` is absent from authorised-user audit metadata. | No action required for current acceptance; consider adding to audit metadata in a future CLT-01 turn. | None set | CLT-01 Membership Authority independent Opus final acceptance | OPEN |
| CLT-FIND-002 | CLT-01 | Membership Authority | INFORMATIONAL / FUTURE_CONSUMER | Future consumers of the membership-resolution route must: derive `iam_user_id` from authenticated context (never from request input); enforce `userClass ∈ {client, client_approver}`. | Apply this constraint when the public `/wlt1/*` surface or any other consumer integrates against `GET /internal/clt1/principals/:iam_user_id/client-memberships`. | Trigger: any future consumer integration | CLT-01 Membership Authority independent Opus final acceptance | FUTURE_CONSUMER |
| CLT-FIND-003 | CLT-01 | Migration 067 | INFORMATIONAL | Migration 067 uses a non-concurrent index build (`CREATE UNIQUE INDEX`, not `CONCURRENTLY`). | No action required — acceptable for current migration-execution model. Note for any future high-availability migration policy. | None set | CLT-01 Membership Authority independent Opus final acceptance | OPEN |
| CLT-FIND-004 | CLT-01 | Test suite / migration head | LOW / NON-BLOCKING | `tests/integration/clt1-db.test.ts` (in the code tree, `aix-platform`) pins the platform-wide global migration head to `067_clt1_authorised_user_iam_binding`, reproducing the same anti-pattern already fixed for WLT-01's own test. Will break when migration 068 (any module) lands. | Correct in a dedicated, narrowly-scoped CLT-01 test turn, using the same fix pattern already applied to `wlt1-db.test.ts` — remove the global-head pin, keep the CLT-scoped per-migration-exists loop. Must land **before** migration 068. | Trigger: migration 068 (any module) | CLT-01 Membership Authority independent Opus re-review (Finding 5) | OPEN |

### IAM-01 — Internal Session Introspection

`POST /internal/auth/session/validate` — COMPLETE / ACCEPTED (implementation `5794ffe`,
test-harness remediation `5a29559`). Satisfies WLT-01 BLOCKER-1 (see WLT-FIND-004). Full
detail: `02_modules/IAM-01/acceptance/IAM-01_Session_Introspection_Opus_v1.0.md`.

| Finding ID | Module | Control | Severity / Status | Finding | Required Action | Due / Trigger | Source / Acceptance | State |
|---|---|---|---|---|---|---|---|---|
| IAM1-FIND-001 | IAM-01 | Session introspection — userClass semantics | INFORMATIONAL / carried | `user_class` returned by the seam is `iam.session`'s own snapshot column at session creation, not a live read of `iam.user_identity.user_class` — matches pre-existing `requireUserSession` semantics exactly (not new/introduced behaviour). | None required now. Any future user-class mutation path must revoke affected sessions or resolve `userClass` live — a separate IAM-01 task. | Trigger: a future user-class mutation path is introduced | IAM-01 Session Introspection independent Opus acceptance (FINDING-A) | OPEN |
| IAM1-FIND-002 | IAM-01 | Session introspection — last_seen write volume | LOW / carried | Every successful introspection call advances the canonical `iam.session.last_seen_at_utc` touch (existing `validateAccessToken` behaviour, unmodified). Once WLT-01 public traffic exists this raises write volume, though semantics are unchanged and idle-timeout is not enforced today. | No action required now. Raises priority of the already-documented deferred S3 throttle (`services/iam/src/lib/session.ts`). | None set | IAM-01 Session Introspection independent Opus acceptance (FINDING-B) | DEFERRED |
| IAM1-FIND-003 | IAM-01 | Session introspection — caller authority | MEDIUM / carried | The seam is guarded by a dedicated `IAM_INTROSPECTION_SERVICE_TOKEN` shared secret — capability scoping, not true per-caller cryptographic service identity. IAM-01 has no per-caller service-identity model for any `/internal/auth/*` route. | Accepted interim architecture, consistent platform-wide. Should be an early adopter of real per-caller service identity when that model lands. | Trigger: platform-wide service-identity model work begins | IAM-01 Session Introspection independent Opus acceptance (FINDING-C) | OPEN |
| IAM1-FIND-004 | IAM-01 | Session introspection — negative-code exhaustiveness | INFORMATIONAL | `SESSION_VALIDATION_NEGATIVE_CODES` has no compile-time exhaustiveness binding to every code `validateAccessToken` can throw; a future untracked code would fall through to the safe (503 unavailable) direction rather than a false 401/200. | None required — failure direction is already safe. | None set | IAM-01 Session Introspection independent Opus acceptance (NEW-3) | OPEN |
| IAM1-FIND-005 | IAM-01 | Session introspection — denial-audit write failure | INFORMATIONAL | If the `iam.session_introspection_denied` write itself fails, the route surfaces a canonical 500 `INTERNAL_ERROR` rather than the seam's own 503 — independently reproduced by probe. Still fail-closed (never 200/401). | None required. WLT's future IAM client must treat any non-200/non-401 response as unavailable, per the accepted architecture. | None set | IAM-01 Session Introspection independent Opus acceptance (NEW-4) | OPEN |
| IAM1-FIND-006 | IAM-01 | Session introspection — test-harness fail-loud canary | MEDIUM — **CLOSED at commit `5a29559`** | The new introspection acceptance suite lacked the platform's H-D3C-1 fail-loud DB-readiness canary; against an unmigrated database it reported 48/48 passing (every DB-gated test silently early-returned). Zero production impact. | Applied the established H-D3C-1 canary pattern (mirrors `iam-db.test.ts`/`iam2-db.test.ts`/`sec1-db.test.ts`/`cfg1-db.test.ts`/`aml1-db.test.ts`/`wlt1-db.test.ts`). Empirically re-verified: an unmigrated DB now makes the suite fail loudly (vitest exit code 1). | Closed | IAM-01 Session Introspection independent Opus acceptance (NEW-1) → test-harness remediation `5a29559` | CLOSED |
| IAM1-FIND-007 | IAM-01 | Session introspection — dead test assertion | LOW — **CLOSED at commit `5a29559`** | A no-op loop (`for (const c of cases) { void c; }`) asserted nothing under a comment claiming the 403 `AUTH_ACCOUNT_FROZEN` oracle never surfaces from the seam. | Removed without a replacement cosmetic assertion; the adjacent real test already proves the property end-to-end. | Closed | IAM-01 Session Introspection independent Opus acceptance (NEW-2) → test-harness remediation `5a29559` | CLOSED |

### IAM-02

| Finding ID | Module | Control | Severity / Status | Finding | Required Action | Due / Trigger | Source / Acceptance | State |
|---|---|---|---|---|---|---|---|---|
| IAM2-FIND-001 | IAM-02 | RBAC / permission consumption | Requires triage | IAM-02 double-consume issue requires dedicated triage. | Triage and remediate in a separate, dedicated IAM-02-scoped turn. Explicitly not addressed in this or any adjacent turn. | None set | `IAM-02_Security_Review_Opus_v0.1.md` / `v0.2_reverify.md` | OPEN |

### WDR-01

| Finding ID | Module | Control | Severity / Status | Finding | Required Action | Due / Trigger | Source / Acceptance | State |
|---|---|---|---|---|---|---|---|---|
| WDR-FIND-001 | WDR-01 | Implementation prerequisite | BLOCKED | WDR-01 implementation is blocked because KMS (key management service) is UNSATISFIED as a platform prerequisite. | Resolve KMS provisioning/integration before WDR-01 implementation can begin. | Trigger: KMS availability | `MODULE_STATUS.md` | BLOCKED |

### WLT-01

| Finding ID | Module | Control | Severity / Status | Finding | Required Action | Due / Trigger | Source / Acceptance | State |
|---|---|---|---|---|---|---|---|---|
| WLT-FIND-001 | WLT-01 | Monetary amount wire contract | LOW / NON-BLOCKING (2 routes hardened; broader rollout pending) | Ajv/Fastify `coerceTypes: true` allows a JSON numeric `amount` to enter a monetary string schema, silently losing precision beyond ~17 significant digits, unless explicitly rejected pre-coercion. | Two routes already hardened via `preValidation` (`rejectNonStringAmount`) and independently accepted (L-1 closed). Broader precision-hardening across remaining monetary-amount routes remains a dedicated, separate control. | None set | WLT-01 Monetary Amount Wire-Contract Hardening (L-1) independent Opus acceptance | OPEN |
| WLT-FIND-002 | WLT-01 | Concentration control | DEFERRED (by design) | Concentration control deferred at architecture stage. | None — deferred by design, not a defect. | None set | WLT-01 architecture review | DEFERRED |
| WLT-FIND-003 | WLT-01 | Step-up control | DEFERRED (by design) | Step-up control deferred at architecture stage. | None — deferred by design, not a defect. | None set | WLT-01 architecture review | DEFERRED |
| WLT-FIND-004 | WLT-01 | Client-facing public `/wlt1/*` surface | OPEN — final genuine WLT-01 control remaining | The client-facing public `/wlt1/*` surface (6-route contract, FROZEN PENDING PREREQUISITES) is gated on two blockers. **BLOCKER-1 (IAM-01 internal session-introspection seam) is now SATISFIED** — `POST /internal/auth/session/validate`, COMPLETE/ACCEPTED, commits `5794ffe`/`5a29559` (see IAM1-FIND-001…007 and `02_modules/IAM-01/acceptance/IAM-01_Session_Introspection_Opus_v1.0.md`). **BLOCKER-2 (shared rate-limit engine) REMAINS OPEN** — the platform's `/foundation/rate-limit/check` remains an allow-by-default stub; no code written for it. | Implement and independently accept the shared rate-limit engine (BLOCKER-2), then implement the WLT-01 public-surface contract. | None set | WLT-01 Client-Facing Public `/wlt1/*` Surface architecture review; IAM-01 Session Introspection independent Opus acceptance | OPEN |

### Environment

| Finding ID | Module | Control | Severity / Status | Finding | Required Action | Due / Trigger | Source / Acceptance | State |
|---|---|---|---|---|---|---|---|---|
| ENV-FIND-001 | Platform-wide | Shared test database grants | ENVIRONMENT | The shared `aix_platform_test` database contains unrelated grant drift affecting some non-WLT roles. A fresh canonical database proves the grant *files* themselves are correct — the drift is local environment state, not a code or migration defect. | No code/migration action required. Environment cleanup (resetting the shared test DB) is separate from module development and may be done at any time without blocking module work. | None set | WLT-01 acceptance review process | ENVIRONMENT |

---

If a finding above is later closed, update its **State** to `CLOSED` and cite the
commit/review that proves closure — do not delete the row; closed findings remain
part of the historical register.
