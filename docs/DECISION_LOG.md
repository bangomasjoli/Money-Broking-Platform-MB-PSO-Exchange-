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

---

### DEC-010 — Public Perimeter / Pre-Authentication Abuse Control: four-layer architecture (FND-FIND-001 + WLT-FIND-010)

- **Date:** WLT-01 Public Client Surface independent Opus architecture review
  (this turn), following the WLT-01 Public Client Surface independent acceptance
  at commit `7f9fc8a` and its governance record at commit `bb1ee1a`
- **Scope:** the public trust boundary in front of WLT-01's six accepted public
  `/wlt1/*` routes — network isolation, trusted-edge pre-authentication
  throttling, a WLT-01-owned public-surface enablement gate, and a distinct
  perimeter-provenance credential. This is a NEW decision, deliberately separate
  from DEC-009: DEC-009 governs the AUTHENTICATED FND shared rate-limit engine
  and WLT-01's bucket/subject bindings for identities that already exist
  (`client_id`/`iam_user_id`); this decision governs the PRE-AUTHENTICATION
  boundary, where no such identity yet exists. Repository inspection confirmed
  no deployment/infrastructure tier exists anywhere in this repository (zero
  Dockerfiles, compose files, Kubernetes/Helm manifests, Terraform, or reverse-
  proxy configuration of any kind), and confirmed every service — WLT-01
  included — binds one Fastify listener on `0.0.0.0` serving internal, public,
  and health/readiness routes together with no listener separation.
- **Decision — four-layer architecture, ACCEPTED FOR IMPLEMENTATION:**

  **L1 — Trusted edge (reverse proxy / API gateway / managed ingress).** Owns:
  TLS termination; the only authoritative source-network identity in the
  platform (it terminates the connection, so it OBSERVES the peer address
  rather than reading a forwardable header); pre-authentication abuse
  throttling (source-IP burst + sustained + concurrent-connection ceiling +
  a global ingress ceiling as a rotating-source-IP backstop, with bounded/
  evicting — never PostgreSQL — counter state, and IPv6 handled by prefix
  aggregation, never unlimited per-address keys); an EXACT allowlist of the
  six public paths (`/internal/*` is never proxied); stripping any
  client-supplied perimeter-provenance header and injecting the edge's own
  trusted value; `Cache-Control: no-store` and baseline security headers on
  every public response (public responses can carry sensitive values — the
  PoC message embeds the canonical wallet address); and a deliberately
  configured, non-allow-all CORS policy (no first-party browser origin is
  currently registered anywhere in this platform). No edge product/provider
  is selected by this decision.

  **L2 — Network isolation (MANDATORY, not defense-in-depth).** The WLT
  listener MUST NOT be directly internet-reachable. This is an architectural
  invariant, not an optional hardening step, precisely because the same
  listener also serves the 27 internal `/internal/wlt1/*` routes (protected
  today only by a shared static bearer secret) and the unauthenticated
  `/internal/wlt1/health`/`/internal/wlt1/readiness` endpoints — exposing the
  public surface without isolation would exposure all of it. The concrete
  mechanism (private subnet, firewall/security-group rule, network policy,
  service mesh, or an ingress-only listener) is a deployment choice deferred
  to Turn 2; that the invariant holds is not deferrable.

  **L3 — WLT-01 public-surface enablement gate + perimeter provenance.**
  WLT-01 owns two new configuration keys (below). Safe default: public
  surface DISABLED. When disabled, the six public routes are NOT registered
  at all (the smallest reachable attack surface — no handler, no
  IAM/CLT/FND client, no DB path exists for a disabled surface; a request to
  any of the six paths falls to the ordinary unknown-route `404`). When
  enabled, a distinct perimeter-provenance credential
  (`x-aix-perimeter-token`, compared via `crypto.timingSafeEqual` with a
  length guard, checked in an `onRequest` hook — before body parsing — and
  BEFORE any IAM call) is required on every public request; a missing or
  mismatched credential is rejected with the SAME `404 NOT_FOUND` a disabled
  surface returns, so a direct-to-service prober cannot distinguish
  "surface disabled" from "surface enabled, provenance rejected" from
  "path does not exist." This credential is infrastructure provenance
  ONLY — it is never client identity, never IAM identity, never CLT
  authority, and it must never be accepted as, or confused with, WLT-01's
  existing `x-internal-service-token` internal-service-identity guard (which
  continues to authenticate the 27 internal routes exactly as accepted, and
  which the perimeter credential must never satisfy in either direction).

  **L4 — Existing accepted authenticated chain (UNCHANGED).** After perimeter
  admission: IAM-01 introspection (fail-closed) → `user_class ∈ {client,
  client_approver}` → CLT-01 membership authority (`X-AIX-Client-Id`
  narrowing-only) → the DEC-009-governed authenticated FND-01 rate-limit
  check → idempotency where applicable (wallet/payout/PoC-challenge; binds
  the derived client authority per `7f9fc8a`) → the business operation →
  Sensitive Read evidence-before-response. None of this decision alters any
  part of L4.

  **Frozen request ordering** (perimeter-provenance rejection strictly
  precedes IAM, which is the load-bearing property this decision exists to
  fix):
  1. network admission (L2) 2. edge pre-auth throttle (L1) 3. edge exact
  path allowlist + header strip/inject (L1) 4. WLT public route exists only
  if enabled (L3) 5. WLT perimeter-provenance check (L3) 6. request
  schema/context 7. IAM-01 introspection (L4) 8. `user_class` gate (L4)
  9. CLT-01 authority (L4) 10. authenticated FND-01 rate limit (L4)
  11. idempotency where applicable (L4) 12. business operation / Sensitive
  Read evidence / response (L4).

- **Decision — the zero-pre-authentication-database-write invariant:** an
  unauthenticated or perimeter-rejected request MUST cause zero database
  writes anywhere in the platform before IAM authentication succeeds. This is
  the precise, testable property that closes FND-FIND-001 once implemented
  and verified: garbage/expired/revoked bearer traffic blocked at the edge
  never reaches IAM, so it can never trigger IAM's own `iam.auth_event`
  negative-outcome write (`services/iam/src/routes/internal.ts`'s
  `insertAuthEvent` call on the `SESSION_VALIDATION_NEGATIVE_CODES` branch) —
  a write path independently confirmed during this review to have no
  retention/eviction policy today.
- **Decision — the authenticated FND-01 engine (DEC-009) is explicitly NOT
  extended to any pre-authentication subject.** No `AUTH_FAILURE` bucket, no
  bearer-token/token-hash/request-fingerprint subject, no untrusted
  `request.ip` subject. Rationale, all independently confirmed against the
  repository: (1) no trusted, bounded-cardinality identity exists before
  authentication — every candidate pre-auth key is attacker-chosen; (2)
  `foundation.rate_limit_counter` has no eviction mechanism, so an
  attacker-chosen subject would create unbounded, permanent row growth in
  shared foundation storage; (3) a pre-auth call into FND-01 would itself add
  an HTTP round-trip plus a PostgreSQL upsert per garbage request — moving
  the amplification FND-FIND-001 describes rather than removing it. This
  reaffirms, rather than revisits, DEC-009's own original rejection of
  `AUTH_FAILURE` and per-IP limiting at that layer.
- **Decision — WLT-01-local IP-based limiting is explicitly rejected as a
  substitute for L1.** Confirmed by repository inspection: `trustProxy` is
  configured nowhere in this platform, so `request.ip` at WLT would resolve
  to the raw socket peer (or, behind a future untrusted intermediary, could
  collapse every client onto one key or become spoofable via a naively
  trusted `X-Forwarded-For`). Source-network throttling belongs solely at the
  connection-terminating edge (L1), which — unlike WLT — genuinely observes
  the peer address rather than reading a forwardable claim.
- **Decision — proposed WLT-01 configuration** (architecture-level; exact
  validation/error-code details are an implementation-turn decision, not
  fixed here):

  | Key | Owner | Secret | Required | Default | Validation |
  |---|---|---|---|---|---|
  | `WLT1_PUBLIC_SURFACE_ENABLED` | WLT-01 | No | Optional | `"false"` | exact case-insensitive `"true"` after trim enables; every other value (including empty, `"1"`, `"yes"`) disables — mirrors the existing `IAM_BOOTSTRAP_ENABLED`/`IAM2_BOOTSTRAP_TRANSITION_ENABLED` convention |
  | `WLT1_PUBLIC_PERIMETER_TOKEN` | WLT-01 | Yes | Conditional — required iff `WLT1_PUBLIC_SURFACE_ENABLED=true` | none | non-blank, minimum 32 characters; if the surface is enabled and this is absent or too short, startup MUST fail (`CONFIGURATION_INVALID`, non-zero exit) — an operator who explicitly requested enablement is never silently downgraded to disabled |

  Header: `x-aix-perimeter-token` — a name distinct from `x-internal-service-
  token`, `x-wlt1-provider-receipt-token`, and every other existing WLT-01
  credential header. Comparison: `crypto.timingSafeEqual` with a length
  guard (the platform's established constant-time-comparison pattern). Log
  redaction: added to WLT-01's redact-path list. The credential is never sent
  to, or accepted from, a browser or mobile client — the edge strips any
  inbound copy and injects its own. Rotation MAY use a two-value acceptance
  window during a controlled rotation; no actual secret value is defined by
  this decision.
- **Decision — public failure semantics** (all preserving existing accepted
  behaviour for L4 outcomes, adding only the two new L3 cases): public
  surface disabled → `404 NOT_FOUND`; missing/invalid perimeter provenance →
  `404 NOT_FOUND` (deliberately indistinguishable from "disabled" — a direct
  prober learns nothing, and no legitimate client ever reaches this branch,
  since the edge always injects the credential); edge pre-auth throttle
  exceeded → `429` + `Retry-After` (edge-generated); edge/perimeter
  unavailable → edge-generated `502`/`503`/`504`; IAM-01 unavailable →
  existing public `503` (unchanged); authenticated FND-01 unavailable/
  indeterminate → existing generic public `503` (unchanged, per
  `7f9fc8a`/WLT-FIND-007); genuine authenticated quota exceed → existing
  public `429 RATE_LIMITED` with `Retry-After` (unchanged). No response at
  any layer may disclose perimeter topology, secrets, IAM state, CLT
  membership, or bearer-token validity.
- **Decision — observability.** WLT-01 may expose bounded, unlabelled-by-
  attacker-input counters for disabled-surface rejections and perimeter-
  provenance rejections; no raw bearer tokens, no perimeter secrets, and no
  attacker-controlled values as metric labels (a second, distinct
  unbounded-cardinality trap this decision explicitly closes off). Pre-
  authentication rejections write no audit/outbox record, and any
  request-level logging of such rejections must be sampled/aggregated, never
  one line per request, so the rejection path cannot itself become a
  disk-amplification vector. Pre-auth throttle telemetry is owned by the
  edge (L1), outside this repository.
- **Decision — module ownership, and an explicit unresolved gap.** WLT-01
  owns L3 in full: the enablement gate, the perimeter-provenance check, its
  own configuration, log redaction, and its own tests. **No module in this
  repository currently owns L1/L2** (the trusted edge and network
  isolation) — `DEP-01` was inspected and confirmed to be "Deposit
  Execution / Inbound Receipt" (a business module, `NOT_STARTED`), not
  deployment infrastructure, and is explicitly NOT assigned any part of this
  work. This decision does not create a new module ID to fill that gap —
  doing so is a separate governance act. Until a deployment/infrastructure
  owner is designated, Turn 2 below remains blocked.
- **Decision — staged implementation, not a single turn:**
  - **Turn 1 (WLT-01, unblocked, may proceed on acceptance of this
    decision):** the L3 enablement gate and perimeter-provenance check,
    configuration, redaction, and WLT-01-owned tests (disabled-surface
    non-reachability with zero IAM/CLT/FND calls; enabled-with-valid-
    provenance reaching the unchanged L4 chain; invalid/missing provenance
    rejected before any L4 call with zero business mutation; config
    fail-closed defaults and fail-loud startup on enabled-without-token;
    unchanged 27-internal/6-public route inventory; full regression).
    Turn 1 alone does **NOT** close FND-FIND-001 (an enabled surface still
    needs L1/L2 to be safe from pre-authentication abuse) and can at most
    make WLT-FIND-010 eligible for closure, and only after independent
    acceptance.
  - **Turn 2 (L1/L2, BLOCKED):** blocked on (a) governance designation of a
    deployment/infrastructure implementation owner, and (b) a separate,
    later governance decision approving the numeric pre-auth policy (burst/
    sustained/concurrency/global ceilings, IPv6 aggregation width) — this
    decision deliberately fixes none of those numbers, following the same
    "architecture first, numbers separately" discipline DEC-009 itself
    used. Turn 2 owns eventual closure of FND-FIND-001.
  - **Turn 3:** independent acceptance of each implemented turn against a
    real deployed topology, followed by the governance update that may
    close FND-FIND-001 and WLT-FIND-010 — never before that evidence
    exists.
- **Status:** ARCHITECTURE ACCEPTED FOR IMPLEMENTATION. **Neither
  FND-FIND-001 nor WLT-FIND-010 is closed by this decision** — architecture
  acceptance is not implementation, is not independent acceptance, and is
  not a deployment-readiness determination. `INTERNET EXPOSURE` remains
  **PROHIBITED**. This decision does not alter DEC-009 (the authenticated
  engine and its numeric policy are unchanged), does not alter the WLT-01
  Public Client Surface acceptance at `7f9fc8a`/`bb1ee1a` (all six public
  routes, their authority chain, and their DEC-009 bindings are unchanged),
  and introduces no migration, no grant change, and no code.
  **Turn 1 / L3 (WLT-01 public-surface enablement gate + perimeter-provenance
  admission) IMPLEMENTED and independently accepted COMPLETE / ACCEPTED at
  commit `af52fe8`** — `WLT1_PUBLIC_SURFACE_ENABLED` (safe default `false`;
  the six public routes are NOT registered at all when disabled) plus
  conditionally-required `WLT1_PUBLIC_PERIMETER_TOKEN` (≥32 chars, boot
  fails closed if enabled without it); the `x-aix-perimeter-token`
  `onRequest` hook independently proven confined to the public route scope,
  running before body parsing and strictly before any IAM/CLT/FND call, with
  zero downstream calls and zero database writes (including
  `foundation.outbox_event`) on rejection, and a 404 response independently
  proven byte-identical to a disabled surface and to a genuinely unknown
  route. **This CLOSES `OPEN_FINDINGS.md` WLT-FIND-010.** Full record:
  `02_modules/WLT-01/acceptance/
  WLT-01_Public_Perimeter_Application_Gate_Opus_Acceptance_v1.0.md`.
  **Turn 2 / L1-L2 (trusted-edge pre-authentication throttling + mandatory
  network isolation) remains NOT IMPLEMENTED**, but its two prerequisites are
  now partially resolved by an independent Opus governance/architecture
  review (DEC-010 Turn 2 Prerequisites, no code/file changes) that concluded
  **PARTIALLY RESOLVED — ADDITIONAL GOVERNANCE REQUIRED**:
  - **Deployment/infrastructure implementation owner — RESOLVED.** L1 and L2
    are owned exclusively by **`IMP-02`** (`03_implementation/IMP-02/
    README.md`), a second instance of the already-governed `03_implementation`
    implementation-handover document class established by `IMP-01` —
    explicitly NOT an 18th `02_modules/` blueprint pack; the platform's
    17-module delivery taxonomy is unchanged. `IMP-02` status: `NOT_STARTED`.
  - **Numeric pre-auth policy — NOT RESOLVED (outcome B).** Production
    thresholds are NOT approved: the load-bearing capacity inputs (negative-
    introspection DB service time; deployed IAM pool concurrency; deployment
    shape; NAT/CGNAT fairness population `K_max`) are unmeasured, and no
    number is invented in their place. A capacity formula, an explicitly
    non-production **INTERNAL-UAT-only provisional policy**, a source-bucket
    aggregation policy (IPv4 `/32` primary / `/24` secondary at 8×; IPv6
    `/64` primary / `/48` secondary at 8×), a three-counter route
    classification (`TOTAL`/`READ`/`MUTATE`, 10:1 ratio inherited from
    DEC-009), a mandatory single-logical-enforcement-point multi-instance
    invariant, HTTP semantics (429 throttle / 404 allowlist, distinct from
    L3's 404), an eight-measurement capacity-calibration framework (M1–M8),
    and a ten-scenario abuse-test acceptance matrix (A1–A10) are all recorded
    in `IMP-02`, none of them as approved production numbers. Production
    approval requires the full M1–M8 evidence pack, explicit signed
    risk-policy terms (`U`, `N`), the A1–A10 matrix passed at production
    shape, independent acceptance, a `DECISION_LOG.md` entry of record, and
    OPS-05 maker-checker sign-off — see `IMP-02` for the full process.
  - **Newly surfaced, OPEN:** the shared `@aix/foundation` connection pool
    (`packages/foundation/src/db.ts`) configures neither `pool.max` nor
    `connectionTimeoutMillis` (both at node-pg library defaults), materially
    blocking accurate M1/M2/M5 capacity calibration — tracked as
    `OPEN_FINDINGS.md` **FND-FIND-010** (MEDIUM).
  - **Still OPEN, unresolved by this review:** cloud provider selection
    (ARC-11 §28 #1), IaC tooling (ARC-11 §28 #5), and a named accountable
    human owner for production numeric-policy sign-off (remains
    `Unassigned`, consistent with every module `owner:` field in this
    repository — not invented here).

  **`FND-FIND-001` (HIGH) is unrelated to Turn 1, is NOT closed by it, is NOT
  closed by this prerequisites review, and REMAINS OPEN** — its Required
  Action now names `IMP-02` as the designated implementation owner.
  **`INTERNET EXPOSURE` REMAINS PROHIBITED** — resolving ownership and
  recording a provisional UAT-only policy authorizes `IMP-02` to begin
  UAT-scoped engineering and abuse-test exercise; it does not approve
  deployment, does not approve internet exposure, and does not mitigate
  FND-FIND-001 (independent acceptance already confirmed that a valid
  perimeter token combined with an invalid bearer still reaches IAM-01 —
  provenance is admission control, not pre-authentication abuse throttling).
- **IMP-02 Turn A / L1 UAT trusted edge — IMPLEMENTED and independently
  accepted COMPLETE / ACCEPTED at commit `65fca52`** (implementation
  `3d4c00f`; first independent review returned REVISE BEFORE ACCEPTANCE on
  two MEDIUM findings — E1 non-admitted traffic could poison shared
  request-rate counters, E2 the HAProxy VERSION pin was not enforced;
  remediated at `65fca52`; narrow independent re-review returned COMPLETE /
  ACCEPTED). Reference technology: HAProxy 3.0.27, pinned upstream source
  build. Delivers the exact six-path allowlist, path-confusion rejection,
  `/internal/*` exclusion, wildcard `x-aix-*` header stripping,
  forwarding-header stripping, trusted `x-aix-perimeter-token` injection,
  IPv4 `/32`+`/24` and IPv6 `/64`+`/48` source-bucket limiting,
  bounded/evicting in-memory limiter state, TOTAL/READ/MUTATE and aggregate
  request-rate limiting, a per-source TCP connection ceiling, `429`+
  `Retry-After`, edge-local `404`, `Cache-Control: no-store`, no wildcard
  CORS, and enforced HAProxy version pinning — all independently verified
  live against a rebuilt binary, not merely declared. Full record:
  `03_implementation/IMP-02/acceptance/
  IMP-02_UAT_Trusted_Edge_Turn_A_Opus_Acceptance_v1.0.md` (`IMP-02-ACC-001`).
  Four LOW, non-blocking findings registered (`IMP-02-FIND-001` through
  `IMP-02-FIND-004`) — none blocked acceptance.
  **This closes NEITHER `FND-FIND-001` nor the internet-exposure
  prohibition.** DEC-010's staging is now explicit as two IMP-02 sub-turns:
  **Turn A (L1 UAT trusted edge) COMPLETE / ACCEPTED at `65fca52`; Turn B (L2
  mandatory network isolation, direct-to-WLT bypass proof) remains NOT
  STARTED.** **TLS termination** — named in IMP-02's own in-scope list —
  was deliberately NOT implemented or validated in Turn A (a TLS-neutral HTTP
  UAT reference edge was built instead); this is an adjudicated, explicit
  scope deferral, not a defect, and **TLS termination REMAINS PENDING IMP-02
  work** before any production-perimeter-readiness determination. Production
  numeric pre-authentication policy **REMAINS NOT APPROVED** — Turn A
  implements only the already-governed provisional UAT values, invents no
  new number, and does not touch the M1–M8/A1–A10/OPS-05 production approval
  path. **`FND-FIND-001` REMAINS HIGH/OPEN. `INTERNET EXPOSURE` REMAINS
  PROHIBITED.**
- **IMP-02 Turn B / L2 mandatory network isolation (UAT proof) — IMPLEMENTED
  and independently accepted COMPLETE / ACCEPTED at commit `7132057`**
  (`feat(imp02): add UAT L2 isolation topology`; single commit, no
  remediation turn required). Proves, inside a disposable, provider-neutral
  Lima UAT harness (genuine Linux network namespaces + veth pairs, no
  Docker/container runtime, no host root), that a direct probe from the
  modeled external/test-client trust zone to the real, unmodified WLT-01
  backend fails at the network layer (independently reproduced as raw-socket
  `ENETUNREACH`, the strongest available negative outcome — not a timeout,
  not `ECONNREFUSED`), while the same client through the real, unmodified
  Turn-A HAProxy edge reaches real WLT-01 application logic (`401
  WLT1_AUTH_REQUIRED`), and the same isolated topology with a deliberately
  wrong edge perimeter token still receives WLT's own unmodified L3
  rejection (`404`, independently attributed to WLT via its structured JSON
  envelope and generated request/correlation IDs, distinguishable from an
  edge-generated denial). Independent review additionally verified: the
  guest root namespace is orchestrator-only with no veth/bridge membership
  and no route into either modeled network; IPv4/IPv6 forwarding explicitly
  disabled in all three namespaces and guest root, with an adversarial test
  confirming isolation holds even after an explicit backend route is added
  to the client namespace (disabled forwarding blocks it independently of
  route absence); the A3/positive-control fail-loud coupling reproduced by
  deliberately breaking the edge path (A3 alone would have passed, but the
  suite correctly withheld the verdict and reported overall FAIL); zero
  internet/host exposure of the topology; and full reversal on
  `topology.sh destroy`. Turn-A artifacts (`haproxy.base.cfg`, `uat/
  haproxy.limits.cfg`, `validate.mjs`, `VERSION`) independently confirmed
  byte-identical across `65fca52`/`cade4e0`/`7132057` — Turn B references
  them at runtime rather than duplicating or modifying them. Turn-A Tier-1
  (47/47), Tier-2 (6/6), and Tier-3 (23/23, under Turn-A's own canonical
  echo-upstream condition) independently reproduced unaffected; full
  canonical platform baseline independently reproduced from a fresh scratch
  Postgres (189/191 files, 5004/5035 tests, 31 skipped exactly = the two
  new env-gated live suites, 0 failures); migration head unchanged at `070`;
  all 9 grants byte-unchanged. Full record: `03_implementation/IMP-02/
  acceptance/IMP-02_UAT_L2_Network_Isolation_Turn_B_Opus_Acceptance_v1.0.md`
  (`IMP-02-ACC-002`). Three new LOW, non-blocking findings registered
  (`IMP-02-FIND-005` through `IMP-02-FIND-007`) — none blocked acceptance.
  **This proves the L2 isolation property only inside a disposable UAT
  harness. It does NOT prove production network isolation, does NOT
  implement TLS, does NOT approve any production numeric policy, and does
  NOT close `FND-FIND-001`.** **TLS termination REMAINS PENDING IMP-02
  work. Production numeric pre-authentication policy REMAINS NOT APPROVED.
  `FND-FIND-001` REMAINS HIGH/OPEN. `FND-FIND-010` REMAINS OPEN. `INTERNET
  EXPOSURE` REMAINS PROHIBITED.**
- **IMP-02 Turn C / L1 UAT TLS termination (functional) — IMPLEMENTED and
  independently accepted COMPLETE / ACCEPTED at commit `d568fa0`**
  (`feat(imp02): add UAT TLS edge termination`; single commit, no
  remediation turn required). Terminates TLS functionally at the accepted
  L1 edge, inside the same disposable Lima UAT harness Turn B established,
  using the same governed HAProxy 3.0.27 source rebuilt with
  `USE_OPENSSL=1`. The modification to the accepted Turn-A
  `haproxy.base.cfg` is narrow and guarded — a single `bind` directive
  behind a `.if defined(EDGE_TLS_ENABLED)/.else/.endif` structure,
  independently confirmed a PRESENCE flag (not a boolean: `false`/`0`
  still select the TLS branch and still fail closed without a certificate
  path) — and independently proven behaviourally inert when unset: the
  accepted Turn-A HTTP mode reproduces Tier-1 47/47, Tier-2 6/6, and
  Tier-3 23/23 under its own canonical echo-upstream condition, unchanged.
  Zero Turn-B artifacts modified (`lima.yaml`/`topology.sh` untouched;
  `libssl-dev` installed guest-locally at runtime instead). Independent
  review additionally verified: T1–T4 each fail for a distinct, isolated
  cause (CA trust / hostname / certificate expiry respectively, via a
  genuine X.509v3 UAT certificate set with correct SANs); TLS 1.0/1.1
  rejection proven non-vacuously (a client first proven capable of
  completing those protocols against a permissive listener was then
  rejected by the governed edge with a genuine `protocol_version` alert);
  TLS 1.2/1.3 succeed; all six governed public routes are admitted through
  the TLS edge and reach the real WLT chain, with path-confusion/
  non-allowlisted probes remaining edge-local denials; client-supplied
  `x-aix-*` and all five forwarding headers are stripped, with only the
  trusted perimeter token (exactly once) reaching the real WLT upstream;
  the MUTATE/READ/TOTAL-burst rate-limit ladder and the 50-connection
  ceiling hold at their exact governed UAT boundaries under TLS; 200
  denied TLS requests produced zero governed-counter movement; source-IP
  spoofing via forged forwarding headers could not evade the limiter,
  confirming TLS did not alter the TCP-peer source model; and Turn-B's own
  A3/positive/A4 property was independently re-run and confirmed
  unaffected. Full record: `03_implementation/IMP-02/acceptance/
  IMP-02_UAT_TLS_Termination_Turn_C_Opus_Acceptance_v1.0.md`
  (`IMP-02-ACC-003`). Two new LOW, non-blocking findings registered
  (`IMP-02-FIND-008`, `IMP-02-FIND-009`) — neither blocked acceptance.
  **This proves TLS is functional only inside a disposable UAT harness. It
  does NOT select a production certificate authority, production cipher
  policy, production SNI/Host policy, or backend/service-to-service TLS or
  mTLS; it does NOT perform M7 capacity calibration; and it does NOT close
  `FND-FIND-001`.** **Production TLS certificate lifecycle, cipher policy,
  and backend TLS/mTLS all REMAIN PENDING. M7 REMAINS NOT PERFORMED/
  PENDING. Production numeric pre-authentication policy REMAINS NOT
  APPROVED. `FND-FIND-001` REMAINS HIGH/OPEN. `FND-FIND-010` REMAINS
  OPEN. `INTERNET EXPOSURE` REMAINS PROHIBITED.**
- **FND-FIND-010 (shared `@aix/foundation` connection pool — unconfigured
  capacity/timeout) — IMPLEMENTED and independently accepted, `CLOSED` at
  commit `6af0d25`** (`fix(iam): govern database pool capacity inputs`;
  single commit, no remediation turn required). Architecture selected IAM
  as the capacity-policy owner and `@aix/foundation` as the mechanism
  owner: `initPool()` gained a deliberately narrow optional
  `{ max?, connectionTimeoutMillis? }` seam, never an arbitrary
  `PoolConfig` pass-through. IAM-01 alone gained `IAM_DB_POOL_MAX`/
  `IAM_DB_CONNECTION_TIMEOUT_MS` — strictly-positive-integer only,
  **required when `ENVIRONMENT=prod`** (independently reproduced: the real
  IAM process aborts before any listener binds if either is missing/empty/
  invalid), optional and genuinely absent (no substituted default) in
  every other environment. Independent review proved, via constructor
  key-sequence comparison against the pre-remediation shape, that all
  eight non-IAM services remain byte-for-byte unaffected, and independently
  proved the mechanism live against the REAL IAM service under a
  controlled TEST-ONLY configuration (`pool.max=1`,
  `connectionTimeoutMillis=800ms`): a second concurrent
  `POST /internal/auth/session/validate` issued while the pool's only
  connection was held returned `503 AUTH_SESSION_INTROSPECTION_UNAVAILABLE`
  in ~0.8s — bounded, not a hang, not a misleading 401 — with clean
  recovery after release. Two INFORMATIONAL, non-blocking observations
  registered as `FND-FIND-011`. **CLOSURE MEANS ONLY that IAM's DB-pool
  capacity inputs are now explicitly governed — it does NOT mean capacity
  calibrated, any production pool value approved, or M2/M5 measurement
  complete.** Preserved for later M1/M2/M5 work: `pool.max` is IAM's
  per-process ceiling, not guaranteed dedicated introspection capacity
  under competing IAM DB traffic; `connectionTimeoutMillis` bounds
  acquisition only, never total request execution once a connection is
  held (independently demonstrated at ~22s under an 800ms acquisition
  timeout) — the eventual production value must be chosen together with
  WLT's caller-side IAM HTTP timeout; and the shared pool's
  `application_name` remains `"aix-fnd"` for all nine services, so
  `pg_stat_activity` cannot attribute connections to IAM by name alone. No
  migration, no grant, no schema change; migration head unchanged at
  `070`; `platform/edge/**` untouched, no IMP-02 re-acceptance implied.
  **`FND-FIND-001` REMAINS HIGH/OPEN — this closure removes one
  calibration blocker only; M1–M8 measurement, production numeric policy,
  production TLS lifecycle, production L2 proof, production deployment,
  and independent acceptance all remain outstanding. `INTERNET EXPOSURE`
  REMAINS PROHIBITED.**
- **IMP-02 M1-M8 Capacity Calibration Architecture** — an independent Opus
  architecture review (architecture-only, no file changes) validated and
  refined the M1-M8 framework: split `M2` into `M2a` (application-side
  `pool.max`, observable now) and `M2b` (deployment IAM process count,
  currently blocked — no evidence source exists anywhere in this
  repository); split `M7` into `M7-UAT` (functional/relative only) and
  `M7-PROD` (the only admissible capacity evidence, additionally blocked on
  a HAProxy stats-socket prerequisite and production TLS decisions); split
  `M8` into `M8a` (the NAT-fairness mechanism test, an engineering
  measurement) and `K_max` (the demographic-sharing assumption, a
  governance input, never an engineering measurement result). Established
  the engineering-vs-governance boundary: `U`/`N`/`K_max` are never
  produced by, defaulted in, or inferable from any harness. Source
  inspection surfaced four architectural gaps, none remediated by that
  turn: production IAM process/deployment topology does not exist; total
  IAM request execution is unbounded after pool acquisition (no
  `statement_timeout` anywhere), so the IAM-acquisition-timeout/WLT-caller-
  timeout inequality is currently unenforceable; HAProxy has no governed
  stats socket; WLT's `IAM_CLIENT_TIMEOUT_MS` is hard-coded. Verdict:
  **SELECTED — READY FOR CONTROLLED MEASUREMENT-HARNESS IMPLEMENTATION.**
  Followed by **Measurement Harness Turn M-A — IMPLEMENTED and
  independently accepted, `COMPLETE / ACCEPTED` at commit `d57b436`**
  (`feat(imp02): add measurement harness foundation`; single commit,
  originally committed locally as `84a1725`, never published, amended once
  before its first push after a GitHub push-protection rejection of a
  Stripe-key-shaped test fixture — independently confirmed as an
  INFORMATIONAL process deviation only, since `84a1725` reached no remote
  branch). **FOUNDATION ONLY — no capacity calibration was performed.**
  Built under `platform/perf/`: a controlled result schema (`OBSERVED`/
  `PASS`/`FAIL`/`INCONCLUSIVE`/`INVALID`, `OBSERVED` default) whose
  `PASS`/`FAIL`-requires-a-governed-`threshold_ref` invariant independent
  review attacked directly with roughly two dozen malformed objects
  (undefined, null, empty, whitespace-only, numeric coercion, object/array
  forms) and found airtight; an environment fingerprint that fails
  explicitly on a missing mandatory field rather than substituting
  "unknown"; a secret scanner and atomic evidence writer (construct → scan
  → validate → write, confined to git-ignored `perf/evidence/`)
  independently attacked across PEM markers, credential URLs, bearer
  tokens, and known-secret values, never echoing a matched secret in its
  own error output; an **M2a observer** reading the EFFECTIVE runtime
  `pool.max`/`connectionTimeoutMillis` a controlled `@aix/foundation`
  `initPool()` call actually constructs, independently verified against an
  independently-constructed control `pg.Pool` across two distinct
  configurations; and pure `C_iam`/DB-wide-budget calculators,
  independently verified across many combined malformed-input cases to
  always return `UNDETERMINED` rather than a fabricated or recommended
  number. The dirty-tree refusal (observer returns `INVALID` without ever
  opening a database connection) was independently reproduced against a
  genuinely dirty tree targeting an unroutable address (33ms, no connection
  attempt). Independent review additionally proved, by direct exploit, that
  a symlink placed inside `perf/evidence/` is followed (registered
  `IMP-02-FIND-010`, LOW) and that `status`/`measurement_id` are validated
  only by TypeScript, not at runtime (registered `IMP-02-FIND-011`, LOW) —
  both assessed non-blocking today (no untrusted/external entrypoint exists
  in Turn M-A) but registered as a **mandatory Turn M-B gate**: both MUST
  close before Turn M-B introduces any externally-influenced path segment
  or untyped/CLI/JSON entrypoint. Two further LOW/INFORMATIONAL findings
  registered as `IMP-02-FIND-012`/`013` (schema cleanliness; bundled
  scanner/test refinements) — none blocked acceptance. Independently
  reproduced the full canonical suite from a fresh scratch Postgres twice
  (**204/207 files passed, 5165/5218 tests passed, 53 skipped, 0
  failures**), migration head unchanged at `070`, all 9 grants
  byte-unchanged, zero `services/`/`packages/`/`edge/`/`infra/` changes.
  **M2a IS NOT M2: does not establish production IAM process count,
  production `C_iam`, approve `IAM_DB_POOL_MAX`, complete M2, or establish
  throughput capacity — verified in runtime output, not only README prose.**
  **`FND-FIND-001` REMAINS HIGH/OPEN. `FND-FIND-010` REMAINS CLOSED
  (unaffected). M1-M8 REMAIN NOT PERFORMED. PRODUCTION `C_IAM` REMAINS
  UNDETERMINED. PRODUCTION PRE-AUTH POLICY REMAINS NOT APPROVED.
  `INTERNET EXPOSURE` REMAINS PROHIBITED.**
- **Supersedes / Related:** Builds on DEC-008 (IAM-01 introspection, L4) and
  DEC-009 (authenticated FND-01 engine + numeric policy, L4) — both left
  unchanged. Directly addresses `OPEN_FINDINGS.md` FND-FIND-001 (HIGH) and
  WLT-FIND-010 (LOW), neither closed here. Related to the WLT-01 Public
  Client Surface acceptance record
  (`02_modules/WLT-01/acceptance/WLT-01_Public_Client_Surface_Opus_Acceptance_v1.0.md`)
  and to the original WLT-01 Client-Facing Public `/wlt1/*` Surface
  architecture addendum, whose third named prerequisite ("a public
  perimeter — not started") this decision is the architecture for, but does
  not itself satisfy.
- **Baseline commit:** `bb1ee1a` (WLT-01 Public Client Surface governance
  record — the last commit before this decision; no implementation commit
  exists yet for either Turn 1 or Turn 2 of this decision).
