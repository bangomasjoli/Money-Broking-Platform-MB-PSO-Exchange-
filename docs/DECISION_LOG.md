---
document_id: GOV-003
title: AIX Full Compliance — Decision Log
version: 1.0
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Governance decision record
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# AIX Full Compliance — Decision Log

Concise ADR-style entries for high-value, already-established governance decisions.
This is not a record of every historical implementation decision — see
`00_project_state/PROJECT_HANDOVER.md` for the full implementation chronology.

---

### DEC-001 — This git repository is the future single authoritative documentation and code source

- **Date:** 2026 (repository creation, prior turn)
- **Scope:** Repository-wide
- **Decision:** `Money-Broking-Platform-MB-PSO-Exchange-` (this repo, `docs/` + `platform/`)
  is intended to become the single authoritative source for both documentation and code,
  superseding the live, non-git-tracked `aix-platform-docs` and `aix-platform` trees.
- **Rationale:** Two live, non-version-controlled directories with no change history or
  audit trail are unsuitable as an authoritative record for a regulated financial
  platform's SDLC evidence.
- **Status:** ACCEPTED — cutover itself (retiring the live trees, adding compatibility
  symlinks) is **not yet executed**. That is Turn D, not yet authorized.
- **Supersedes / Related:** None
- **Baseline commit:** `e74effd` (initial repository commit)

### DEC-002 — Module-centric documentation structure

- **Date:** Document Control & Repository Information Architecture review (prior turn)
- **Scope:** `docs/` directory structure
- **Decision:** Documentation is organized primarily by module
  (`docs/02_modules/<MODULE>/{blueprint,reviews,acceptance,notes}/`), not by document
  type or project phase alone.
- **Rationale:** The platform's build and acceptance unit is the module; grouping all
  of a module's blueprint, review, acceptance, and implementation-note evidence under
  one path makes the evidence trail auditable per module.
- **Status:** ACCEPTED and implemented (Turns A, A.1, B)
- **Supersedes / Related:** Related to DEC-001
- **Baseline commit:** `c1765f5`

### DEC-003 — Git is the primary change-history mechanism

- **Date:** Document Control & Repository Information Architecture review (prior turn)
- **Scope:** Repository-wide
- **Decision:** All document moves use `git mv` to preserve rename history; no document
  is silently duplicated or deleted where a move suffices. Content changes are committed
  separately from structural moves (Turns A/A.1/B are moves-only; Turn C1 is the first
  turn with intentional content changes).
- **Rationale:** Preserves auditability — reviewers can distinguish "this file moved"
  from "this file's content changed" via `git log --follow` and diff stats.
- **Status:** ACCEPTED and enforced across Turns A, A.1, B, C1
- **Supersedes / Related:** None
- **Baseline commit:** `c1765f5`

### DEC-004 — Blueprint version promotion requires review or delta-note certification

- **Date:** Turn C1 (this turn)
- **Scope:** Module blueprint pack version authority
- **Decision:** A blueprint pack version is authoritative only when a `*_Review.md` or
  `*_v1.x_to_v1.y_Delta_Note.md` exists in the repository certifying it. Version number,
  file modification date, or mere presence on disk do not confer authority.
- **Rationale:** Repository inspection found 11 modules with a `v1.2` pack present but
  no certifying evidence, and one module (WLT-01) with an active documented conflict
  between two tracking documents about which version is controlling. Silent
  version-number-based promotion would have papered over that conflict.
- **Status:** ACCEPTED and implemented in `DOCUMENT_REGISTER.md`
- **Supersedes / Related:** Directly addresses the WLT-01 conflict (see `OPEN_FINDINGS.md`
  is not the right place for this — it is a document-authority question, tracked instead
  as `BP-WLT-01-v1.2` in `DOCUMENT_REGISTER.md`)
- **Baseline commit:** `c1765f5`

### DEC-005 — Open findings are owned by OPEN_FINDINGS.md

- **Date:** Turn C1 (this turn)
- **Scope:** Repository-wide
- **Decision:** `docs/OPEN_FINDINGS.md` is the single current register for unresolved
  findings, deferred controls, environment issues, and blockers. `PROJECT_HANDOVER.md`
  remains the historical narrative of when/how findings arose but is no longer the place
  to look for current status.
- **Rationale:** Findings were previously scattered across `PROJECT_HANDOVER.md` prose,
  `MODULE_STATUS.md` table cells, and individual acceptance review documents, with no
  single current view and no stable finding IDs.
- **Status:** ACCEPTED and implemented
- **Supersedes / Related:** None
- **Baseline commit:** `c1765f5`

### DEC-006 — Document version authority is owned by DOCUMENT_REGISTER.md

- **Date:** Turn C1 (this turn)
- **Scope:** Repository-wide
- **Decision:** `docs/DOCUMENT_REGISTER.md` (formerly `INDEX.md`) is the sole authority
  for controlled-document version, document status, and supersession. `MODULE_STATUS.md`
  no longer carries a competing blueprint-version-authority column; it owns
  implementation status only.
- **Rationale:** `INDEX.md` and `MODULE_STATUS.md` had drifted into disagreement on at
  least one module (WLT-01: `v1.1` vs `v1.2`) with no mechanism to detect or resolve the
  conflict. A single authority removes the possibility of two documents silently
  disagreeing.
- **Status:** ACCEPTED and implemented
- **Supersedes / Related:** `INDEX.md` (renamed/merged via `git mv`, not deleted)
- **Baseline commit:** `c1765f5`

### DEC-007 — AIX Full Compliance is a distinct project from AIX Revamp

- **Date:** Established prior to this turn; restated explicitly per-turn since
- **Scope:** Repository-wide, project identity
- **Decision:** "AIX Full Compliance" (this repository, this document set) must never be
  merged, cross-referenced as equivalent, or conflated with the older "AIX Revamp"
  project.
- **Rationale:** Explicit user instruction, repeated at the start of every Turn C
  directive, to prevent scope/identity confusion between the two projects.
- **Status:** ACCEPTED — standing constraint
- **Supersedes / Related:** None
- **Baseline commit:** N/A (organizational constraint, not tied to a specific commit)

### DEC-008 — IAM-01 internal session-introspection seam: dedicated capability token, 401 negative-collapse, no cached expiry

- **Date:** IAM-01 Session Introspection architecture / implementation / independent
  acceptance (this turn's predecessor turns; commits `5794ffe`, `5a29559`)
- **Scope:** IAM-01 `services/iam/src` — the sole internal seam by which any other
  module (first consumer: WLT-01) may resolve a client bearer access token to an
  authenticated identity
- **Decision:** Add exactly one new internal route, `POST /internal/auth/session/validate`,
  reusing the canonical `validateAccessToken` verbatim (never a second, independently
  implemented definition of session validity). Four specific, deliberate departures from
  the initially candidate contract:
  1. **Path** `/internal/auth/session/validate`, not `/internal/auth/introspect-session`
     — mirrors the existing `/internal/auth/service-account/validate` naming convention
     already established in this codebase, rather than introducing a new verb.
  2. **Caller authority** uses a DEDICATED `IAM_INTROSPECTION_SERVICE_TOKEN`, distinct
     from the general `IAM_INTERNAL_SERVICE_TOKEN` — capability scoping via the existing
     shared-secret guard architecture (`makeIamInternalIdentityGuard`), not a new
     authentication mechanism. Explicitly NOT true per-caller cryptographic service
     identity (see `OPEN_FINDINGS.md` IAM1-FIND-003 / carried FINDING-C).
  3. **Negative-state collapse**: all four canonical negative codes
     (`AUTH_SESSION_REQUIRED`/`AUTH_SESSION_REVOKED`/`AUTH_SESSION_EXPIRED`/
     `AUTH_ACCOUNT_FROZEN`) collapse to a single `AUTH_SESSION_REQUIRED`/401 at this seam
     only — never `200 { valid:false }`. `AUTH_ACCOUNT_FROZEN` alone is 403 elsewhere in
     IAM-01; passing it through unmapped would let an internal caller distinguish "a real,
     frozen account" from "a meaningless token" by status code alone (an account-state
     oracle). Infrastructure/query failure is kept genuinely distinct as
     `AUTH_SESSION_INTROSPECTION_UNAVAILABLE`/503 — never folded into the negative-auth
     result — so a downstream caller can fail closed on IAM unavailability without
     confusing it for an invalid identity.
  4. **Response minimisation**: exactly `valid`/`user_id`/`session_id`/`user_class`.
     `expires_at_utc` is deliberately OMITTED (unlike the initial candidate contract) —
     a caller with no expiry to hold onto cannot be tempted to cache authority across
     requests; every consumer must re-introspect per request.
  Audit outcome: successful introspection publishes NO new SEC-01/business audit event
  (would be high-frequency noise on every downstream public request); a negative result
  writes the IAM-local `iam.session_introspection_denied` row to `iam.auth_event` only.
- **Rationale:** This is a material cross-module authority seam — the first and only
  path by which any module outside IAM-01 can resolve client identity — so its contract
  shape is a governance decision, not an implementation detail. Reusing existing platform
  conventions (naming, guard factory, error-collapse discipline) over inventing new ones
  keeps the interim shared-secret model consistent platform-wide rather than adding a
  second flavour of it.
- **Status:** ACCEPTED and implemented. Architecture independently accepted
  ("IAM-01 SESSION INTROSPECTION: ACCEPTED FOR IMPLEMENTATION"); implementation
  independently re-verified against real databases and adversarial probes (bidirectional
  token-isolation check, live auth-event-write-failure probe, empty-DB false-green
  reproduction) and accepted ("IAM-01 SESSION INTROSPECTION: COMPLETE / ACCEPTED"). Two
  post-acceptance TEST findings (missing fail-loud DB canary; a dead no-op test
  assertion) were closed test-only in `5a29559` — see `OPEN_FINDINGS.md` IAM1-FIND-006/007.
  **This decision satisfies WLT-01 BLOCKER-1.** WLT-01 BLOCKER-2 (shared rate-limit
  engine) is unrelated and remains OPEN; the WLT-01 public-surface contract remains
  FROZEN PENDING PREREQUISITES until BLOCKER-2 is independently accepted.
- **Supersedes / Related:** Related to the WLT-01 Client-Facing Public `/wlt1/*` Surface
  architecture (see `OPEN_FINDINGS.md` WLT-FIND-004) and to CLT-01's Authenticated
  Principal → Client Membership Authority extension (migration 067), the other half of
  the authority chain this seam feeds into (`bearer token → IAM user_id/user_class →
  WLT userClass allowlist → CLT membership resolution`).
- **Baseline commit:** `5794ffe` (implementation); `5a29559` (test-harness remediation)

### DEC-009 — Shared Rate-Limit Engine: architecture + approved v1 numeric policy (WLT-01 BLOCKER-2 prerequisite)

- **Date:** Shared Rate-Limit Engine architecture review, followed by a dedicated
  numeric-policy governance/risk review (both prior turns)
- **Scope:** `foundation.rate_limit_policy` / `foundation.rate_limit_counter` (planned
  migrations `068_fnd_rate_limit_engine`, `069_fnd_rate_limit_policy_seed`) — the
  shared, module-agnostic rate-limit engine and its first consumer's (WLT-01) v1
  numeric policy
- **Decision — architecture (context, not re-litigated here):** the engine is
  PostgreSQL-backed (dual fixed-window counters: burst + sustained, one atomic
  `INSERT … ON CONFLICT DO UPDATE … RETURNING` per check — the platform's own
  established counter idiom, already used by `iam.account_lockout` and
  `foundation.idempotency_record`), owned by FND-01, reached by consumers over HTTP
  only (no shared DB grant into `foundation.rate_limit_*` — WLT DATABASE GRANT DELTA:
  NONE), replacing the existing `POST /foundation/rate-limit/check` allow-by-default
  stub in place (path unchanged). Numeric policy is centrally owned in
  `foundation.rate_limit_policy`, seeded by governance-approved migration only —
  `role_fnd_runtime` holds no INSERT/UPDATE on that table, so a limit can change only
  through a new migration, never at runtime. **Verdict at that review: "SHARED
  RATE-LIMIT ENGINE: ACCEPTED FOR IMPLEMENTATION."**
- **Decision — v1 numeric policy (this decision's actual subject):** exactly four
  policy rows, one per WLT-01 v1 public bucket, each with ONE subject scope (no
  dual-scope checks). `policy_id` is immutable across versions and encodes no numeric
  value; `limit_ref` for traceability in `foundation.rate_limit_decision_log` is
  `<policy_id>:v<version>`.

  | policy_id | module | bucket | subject scope | burst_limit | burst_window_seconds | sustained_limit | sustained_window_seconds | status | version |
  |---|---|---|---|---|---|---|---|---|---|
  | `frl_wlt1_read_list` | WLT-01 | READ_LIST | `client_id` | 100 | 60 | 1200 | 3600 | active | 1 |
  | `frl_wlt1_read_item` | WLT-01 | READ_ITEM | `client_id` | 200 | 60 | 2400 | 3600 | active | 1 |
  | `frl_wlt1_mutate_register` | WLT-01 | MUTATE_REGISTER | `client_id` | 10 | 60 | 60 | 3600 | active | 1 |
  | `frl_wlt1_mutate_poc` | WLT-01 | MUTATE_POC | `iam_user_id` | 10 | 60 | 60 | 3600 | active | 1 |

  These are the exact rows `069_fnd_rate_limit_policy_seed` must insert — no other
  row (in particular, no `AUTH_FAILURE` row and no per-IP row).
- **Rationale — calibration anchors, not invented numbers:** `iam.session_policy`
  already permits a `client` user up to 10 concurrent sessions
  (`client_approver`: 5) — 10 users × 10 sessions opening a dashboard inside one
  minute is exactly what READ_LIST's 100/60s burst absorbs. `WLT1_DESTINATION_
  COOLING_OFF_HOURS = 24` means a registered destination is unusable for 24 hours
  regardless of how fast it was created, so a 60/hour registration ceiling cannot
  obstruct any genuine business process. IAM's own approved lockout thresholds
  (`IAM_LOGIN_MAX_ATTEMPTS=5`, `IAM_REFRESH_MAX_ATTEMPTS=20`) are this platform's own
  precedent that a legitimate recurring operation earns a materially higher
  threshold than an attack-shaped one — mirrored here as reads (generous) vs.
  mutations (tight, 10/burst-minute, 60/hour) vs. MUTATE_POC (same numbers as
  MUTATE_REGISTER, but scoped to the individual user rather than the institution,
  since a compromised credential should not exhaust an entire institution's PoC
  quota). Mutation limits were sized so that two normal network retries (the
  accepted architecture checks rate limit BEFORE idempotency resolution, so a
  retried request consumes quota again) still leave 70%+ of the burst window and
  95%+ of the sustained window unused — no legitimate single/double retry can
  self-lock a client. `frl_wlt1_mutate_poc` is deliberately additional to, not a
  replacement for, the existing `WLT1_POC_MAX_ATTEMPTS`/`WLT1_POC_CHALLENGE_TTL_
  MINUTES` controls: those bound signature attempts against ONE challenge; this
  bounds total challenge-issuance-plus-verify volume (each issuance is a Sensitive
  Read that writes a `wlt1.sensitive_destination_read` SEC-01 evidence row) per user
  per hour — a gap the per-challenge attempt cap does not cover.
- **Decision — subject-scope binding is NOT schema, it is an implementation
  obligation:** `foundation.rate_limit_policy` carries no subject-scope column — the
  consumer supplies `subject_type`/`subject_id` per request. The future WLT-01
  implementation MUST bind: `READ_LIST` → `client_id`, `READ_ITEM` → `client_id`,
  `MUTATE_REGISTER` → `client_id`, `MUTATE_POC` → `iam_user_id`, and assert each
  binding by test. A scope drift at implementation time would apply
  institution-sized numbers to a single user or vice versa with no schema-level
  detection.
- **Decision — failure semantics (unchanged, restated for traceability):** a
  genuine quota exceed is `429 RATE_LIMITED` (public: `429 RATE_LIMITED` +
  `Retry-After`); engine unavailable, DB failure, or a missing/inactive/malformed
  policy row is `503 RATE_LIMIT_UNAVAILABLE` internally, mapped to public `503
  SERVICE_UNAVAILABLE` — never conflated with a genuine deny. A consumer proceeds
  ONLY on `HTTP 200` AND `data.decision === "allow"`; every other outcome
  (429/503/401/400, timeout, network error, malformed body) fails closed. Until
  `069` seeds these four rows, every WLT rate-limit check is a missing-policy 503 —
  the system fails closed, not open, in the interim.
- **Decision — AUTH_FAILURE removed, per-IP rejected, both for v1 only:** no
  `AUTH_FAILURE` bucket exists and none is introduced by this decision. No safe
  bounded-cardinality subject exists pre-authentication (a bearer-token hash or
  request fingerprint is attacker-chosen — unbounded row growth against shared
  foundation storage), and per-IP limiting is rejected because no `trustProxy` /
  trusted-proxy configuration exists anywhere in this platform (`request.ip` is the
  raw socket peer) — enabling it naively would make `X-Forwarded-For`
  client-spoofable. **This does NOT close the associated HIGH finding**
  (unauthenticated garbage-bearer-token requests can reach IAM introspection before
  any identity-based WLT quota applies) — that remains a public-perimeter /
  pre-authentication-abuse control, tracked separately, and is a mandatory
  precondition before any WLT public route is internet-exposed.
- **Decision — change governance:** numeric policy is never runtime-editable
  (`role_fnd_runtime` holds no INSERT/UPDATE on `foundation.rate_limit_policy`).
  Every change to any limit, window, or `status` is a new, governance-approved
  migration. A `DECISION_LOG.md` entry recording the new values and their
  justification MUST exist before that seed/update migration is authored — the same
  sequencing this entry itself satisfies for `069`. `policy_id` is immutable
  (changed by `UPDATE`, never delete-and-reinsert — `limit_ref` traces historical
  denial evidence back to it). `version` increments on any MATERIAL change
  (`burst_limit`, `burst_window_seconds`, `sustained_limit`,
  `sustained_window_seconds`, or a `status` flip to `inactive`) — a non-material
  edit (e.g. a comment) does not. **Review trigger:** these are first-generation
  values with no production telemetry behind them; a review is due at whichever
  comes first — the first genuine client report of an unexpected 429, or an agreed
  future period of real public-surface traffic (no specific date is fixed, since
  none is controlled yet).
- **Status:** ACCEPTED (architecture) / APPROVED (numeric policy) / **IMPLEMENTED
  and independently accepted COMPLETE / ACCEPTED at commit `2cdeaa5`** — migrations
  `068_fnd_rate_limit_engine` and `069_fnd_rate_limit_policy_seed` implement this
  entry's architecture and seed exactly the four rows above, independently
  cross-checked verbatim against this table. **Post-acceptance hardening COMPLETE
  / VERIFIED at commit `eb4a767`** — new migration
  `070_fnd_rate_limit_policy_privilege_hardening` makes the change-governance
  invariant above (`role_fnd_runtime` holds no INSERT/UPDATE/DELETE on
  `foundation.rate_limit_policy`) deployment-order-independent, closing
  `OPEN_FINDINGS.md` FND-FIND-002/003/004 (all CLOSED); FND-FIND-005/006/007/008
  retained non-blocking; FND-FIND-009 newly opened, LOW, non-blocking. Neither the
  implementation nor the hardening altered this entry's architecture or the four
  numeric-policy rows — no new decision entry was required for either. Full
  record: `02_modules/FND-01/acceptance/FND-01_Rate_Limit_Hardening_Opus_v1.0.md`.
  **WLT-01 BLOCKER-2 IS NOW SATISFIED** — this decision's numeric-policy approval
  plus the engine's own independent acceptance and hardening together satisfy it in
  full; the WLT-01 public-surface contract's prerequisites are COMPLETE, though the
  contract itself remains unimplemented. `OPEN_FINDINGS.md` FND-FIND-001 (HIGH,
  pre-authentication abuse) is unrelated to this decision, is NOT closed by it or by
  the engine's implementation/hardening, and remains the separate, mandatory
  precondition before any WLT-01 public route is internet-exposed.
- **Supersedes / Related:** Builds on DEC-008 (the other WLT-01 BLOCKER-1
  prerequisite). Related to `OPEN_FINDINGS.md` WLT-FIND-004 (tracks BLOCKER-2) and
  to CLT-FIND-004 (the migration-068 sequencing predecessor — the global
  migration-head test pin in `tests/integration/clt1-db.test.ts` that would have
  broken the moment migration 068 landed; CLOSED at commit `e6cf4c7`, independently
  clearing the way for `068` to be authored).
- **Baseline commit:** `e6cf4c7` (CLT-FIND-004 closure — the last commit before this
  governance decision; no commit exists yet for the engine itself)

---

Future decisions should be appended below this line, oldest first, using the same
`DEC-NNN` numbering.
