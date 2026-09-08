# SEC-01 Audit Log / Security Monitoring — Phase 4 Implementation Plan (v1.0, planning only)

Module: **SEC-01 Audit Log / Security Monitoring**
Blueprint: `aix-platform-docs/modules/SEC-01_Audit_Log_Security_Monitoring_Blueprint_Pack_v1.2/`
Baseline: SEC-01 Phases 0-3 accepted implementation baseline (325/325 tests; Opus re-review
accepted P3-F1/P3-L1/P3-L3 closure — `docs/SEC-01_Phase3_Security_Review_Opus_v0.2_reverify.md`).
Status: **PLANNING ONLY. No code, no migration, no tests written this pass.**

---

## 1. Scope read (from the blueprint)

`04_API_Specification.md` §4 "Audit Search / Read APIs":

- **`GET /sec1/audit-events`** — search, filterable by `event_type`, `source_module`,
  `actor_user_id`, `client_id`, `entity_type`, `entity_id`, `request_id`, `correlation_id`,
  `severity`, `time_from`, `time_to`. Rules: (1) IAM-02 permission required, (2) sensitive
  reads are logged, (3) result redaction applies based on permission/classification.
- **`GET /sec1/audit-events/{audit_event_ref}`** — single-event detail read, same three rules.
- **`GET /sec1/audit-streams/{stream_id}/verify`** — a user-facing wrapper over the
  already-built (Phase 3) `runIntegrityVerification`. **Explicitly deferred out of this plan**
  — not named in the task brief's "Focus on" list, and the internal operational route
  (`POST /internal/sec1/integrity/verify-range`) already exists for on-demand use. Revisit
  when `sec1.audit_event.verify_integrity` needs a staff-facing surface.

`07_Permission_Rules.md` §2/§6/§8 supply the permission/redaction model (§6 below);
`05_Database_Design.md` §2.10 supplies the exact `sec1.sensitive_read_log` column set (§6
below); `10_Test_Cases.md` SEC1-TC-035/036/037/038/079/080 and `04_API_Specification.md` §10
error codes (`SEC1_UNAUTHORISED_AUDIT_READ`, `SEC1_SENSITIVE_READ_LOG_FAILED`,
`SEC1_IAM02_REGISTRY_MISSING`) supply the fail-closed contract.

**Confirmed out of scope this phase** (per the task brief and unchanged from the Phase 3 notes'
own deferred-scope list): evidence export (§5 of the API spec), security alert APIs (§6),
monitoring rule APIs (§7), external seal anchoring, recovery/reconciliation, incident
break-glass read, audit correction, retention/legal hold, real SIEM/notification integration,
scheduler/cron, CFG-01, business modules, Exchange runtime.

---

## 2. Proposed Phase 4 implementation plan — phased build order

**P0 (this phase, if approved):**

1. IAM-02 permission-guard HTTP client (`lib/iam2-client.ts`) — SEC-01's side of the same
   pattern IAM-02 built against IAM-01 (`services/iam2/src/lib/iam01-client.ts`).
2. `sec1.audit_event.read` / `sec1.audit_event.read_sensitive` / `sec1.audit_event.search`
   registered as real `iam2.permission` catalogue rows (migration on the IAM-02 side — see §4).
3. `sec1.sensitive_read_log` table (migration on the SEC-01 side — see §4) + a small
   `lib/sensitive-read-log.ts` writer.
4. `lib/read-redaction.ts` — tier-based field redaction, separate from the existing
   ingest-time `lib/redaction.ts` (different concern; see §7).
5. `lib/read-query.ts` — the actual `sec1.audit_event` SELECT/filter/pagination logic.
6. Two new internal routes (`routes/read.ts`): search + detail read (see §8 for why these are
   internal-guarded, not public-facing, this phase).
7. Tests (§10).

**Deferred (explicitly, not built this phase):** evidence export, `verify_integrity`
staff-facing route, security alerts, monitoring rules, a public/session-authenticated
`/sec1/*` surface (see §8's open question), event-schema management API.

This mirrors the Phase 0-2 → Phase 3 discipline: each phase adds one coherent capability
slice, additive-only migrations, no rewriting of accepted code.

---

## 3. Minimum files likely to change

**New files:**
- `services/sec1/src/lib/iam2-client.ts` — HTTP client to `POST /internal/iam2/permission/check`.
- `services/sec1/src/lib/sensitive-read-log.ts` — writes `sec1.sensitive_read_log` rows.
- `services/sec1/src/lib/read-redaction.ts` — tier-based response shaping.
- `services/sec1/src/lib/read-query.ts` — search/detail SELECT logic.
- `services/sec1/src/routes/read.ts` — the two new routes.
- `infra/migrations/010_sec1_sensitive_read_log.cjs` — new `sec1.sensitive_read_log` table.
- `infra/migrations/011_iam2_register_sec1_permissions.cjs` — new `iam2.permission` rows for
  `sec1.audit_event.read`/`read_sensitive`/`search` (see §4 for why this is IAM-02-owned, not
  SEC-01-owned).
- New unit test files (canonical-style, no DB): redaction-tier logic, query-filter building.
- New integration test blocks in `tests/integration/sec1-db.test.ts` (or a new
  `sec1-read-db.test.ts` if the existing file is getting large — judgment call at coding time).

**Changed files:**
- `services/sec1/src/config.ts` — add `iam2BaseUrl` + `IAM2_INTERNAL_SERVICE_TOKEN` (the
  credential SEC-01 presents to IAM-02's own internal-identity guard, mirroring how IAM-02
  configured `IAM01_INTERNAL_SERVICE_TOKEN` for its own IAM-01 client).
- `services/sec1/src/lib/errors.ts` — add `SEC1_UNAUTHORISED_AUDIT_READ` and
  `SEC1_SENSITIVE_READ_LOG_FAILED` (both already named in the blueprint's own §10 error table;
  only added now because this is the first phase that can actually throw them, matching the
  file's own stated discipline of not pre-adding unreachable codes).
- `services/sec1/src/server.ts` — wire `registerReadRoutes`, mirroring how `seals.ts`/
  `integrity.ts` were wired in Phase 3.
- `infra/grants/sec1_runtime_grants.sql` — SELECT+INSERT on `sec1.sensitive_read_log` (new
  "Phase 4 additions" section, same pattern as the file's existing "Phase 3 additions" section).
- `infra/grants/iam2_runtime_grants.sql` — likely **no change** (SEC-01 never touches
  `iam2.*` tables directly; it only calls IAM-02's own HTTP API, which already runs under
  `role_iam2_runtime`'s existing grants). Flagged for confirmation at coding time, not assumed.

**Explicitly NOT touched:** `lib/ingest.ts`, `lib/integrity.ts`, `lib/seal.ts`, `lib/stream.ts`,
`lib/canonical.ts`, `lib/redaction.ts` (ingest-time), migrations 008/009, any `iam`/`iam2`
source file other than the new permission-seeding migration.

---

## 4. Migration requirements

**Two additive migrations, next numbers after 009 — each scoped to ONE schema, per this
codebase's established convention (every migration to date touches exactly one module's own
schema; no migration has ever written into another module's tables):**

- **`010_sec1_sensitive_read_log.cjs`** (sec1 schema) — creates `sec1.sensitive_read_log` per
  `05_Database_Design.md` §2.10's exact column list (`id`, `read_id` unique, `user_id`,
  `action` [search/read/export/download], `audit_event_ref` nullable, `export_id` nullable
  [unused this phase — export is deferred, column exists for shape-completeness per the
  blueprint but is always NULL], `search_scope_hash` nullable, `reason` text, `request_id`,
  `correlation_id`, `occurred_at_utc`), plus the blueprint's own named index
  `sensitive_read_log(user_id, occurred_at_utc)` (§3 index list, item 11). No hash-chain
  columns on this table — see §6 for why that is the deliberate anti-recursion design, not an
  oversight.

- **`011_iam2_register_sec1_permissions.cjs`** (iam2 schema) — **open design point, resolved
  below (§9, point 3):** inserts 3 new rows into `iam2.permission`
  (`sec1.audit_event.read`, `sec1.audit_event.read_sensitive`, `sec1.audit_event.search`),
  each `licence_locked = false`, `prohibited = false`, `requires_step_up = false`,
  `requires_approval = false` (per `07_Permission_Rules.md` §4's Maker-Checker list — sensitive
  audit EXPORT requires step-up, not sensitive READ; confirmed by re-reading that list
  carefully, item 1 is scoped to export only). **Recommended to be an IAM-02-owned migration
  file** (numbered in the shared `infra/migrations` sequence, but conceptually belonging to
  `iam2`'s schema) rather than a SEC-01-authored migration reaching into `iam2.*` — mirrors how
  `role_sec1_runtime` has zero grants into `iam2.*` (an explicit, tested absence — see
  `infra/grants/sec1_runtime_grants.sql`'s own comment) and how migration 008 seeded
  `sec1.event_schema` with hardcoded per-module rows rather than letting FND-01/IAM-01/IAM-02
  write their own rows into SEC-01's catalogue. Same ownership principle, opposite direction.

No changes to migrations 001-009. No RLS added to either new table — `sensitive_read_log` has
no single-owner-row concept relevant to this phase (it is itself evidence of what was read, not
data being protected by row ownership); `iam2.permission` already has no RLS (a global
catalogue, confirmed by reading `iam2`'s existing schema — `iam2.user_role`/
`iam2.user_permission_override` are the RLS-protected tables, not `iam2.permission`).

---

## 5. IAM-02 permission guard integration model

**New `services/sec1/src/lib/iam2-client.ts`, structurally identical to
`services/iam2/src/lib/iam01-client.ts`:**

- Calls `POST /internal/iam2/permission/check` (the existing, already-accepted IAM-02 endpoint
  — `services/iam2/src/routes/internal.ts`) with `x-internal-service-token` set to SEC-01's own
  `iam2InternalServiceToken` config value (a NEW credential, distinct from every existing
  `SEC1_INGEST_TOKEN_*`/`SEC1_INTERNAL_SERVICE_TOKEN` — SEC-01 is here acting as a CLIENT of
  IAM-02's internal-identity guard, the same relationship IAM-02 has with IAM-01).
- Body: `{ actor_id, session_id?, action: "sec1.audit_event.search" | "sec1.audit_event.read" |
  "sec1.audit_event.read_sensitive", resource: "audit_event", entity_id?, client_id? }` — no
  `payload_hash` (a read has nothing to bind an execution token to; §5.14 of the Phase 4 route
  design below never issues or expects a decision token).
- **Two checks per request, not one** (see §7): the route ALWAYS checks the baseline action
  (`.search` or `.read`) first — a `deny`/`step_up_required`/`approval_required`/
  `licence_locked` result there is a hard stop, `SEC1_UNAUTHORISED_AUDIT_READ`. Only if that
  first check resolves `allow` does the route make a SECOND check against
  `sec1.audit_event.read_sensitive` to decide the RESPONSE TIER (not a second gate — an
  `allow`/anything-else on this second check is not itself an error; a non-allow here simply
  means "return normal-tier redaction", per §7).
- **Fail-closed, identical discipline to `iam01-client.ts`:** a network error, a non-2xx
  response, or any `decision !== "allow"` are ALL treated as "not authorised" for that
  particular check — never distinguished into a separate "IAM-02 unavailable, degrade
  gracefully" path. This directly satisfies the task brief's open question #4 ("How to handle
  IAM-02 permission guard unavailable?") — the answer is: it is handled by NOT handling it
  specially. IAM-02 down = every read denied, exactly like IAM-01 down already means every
  step-up-gated IAM-02 action is denied today. `09_Error_Handling.md`'s own "Audit unavailable
  → action cannot proceed" fail-closed principle (already applied to ingestion) is the same
  principle applied here to reads.
- `SEC1_IAM02_REGISTRY_MISSING` (blueprint §10) is what `IAM2_PERMISSION_UNKNOWN` from IAM-02
  surfaces as, translated at the SEC-01 boundary — if migration 011 has not run yet (or a typo
  exists in the action string), IAM-02's own step-0 fail-closed check
  (`guard.ts::lookupPermission` returning `undefined` → `deny`/`unknown_permission_code`)
  already produces a deny; SEC-01's client maps that specific `reason` string to the more
  diagnostic `SEC1_IAM02_REGISTRY_MISSING` rather than the generic
  `SEC1_UNAUTHORISED_AUDIT_READ`, satisfying SEC1-TC-079.
- **Dependency injection for tests**, same seam as `iam01-client.ts`'s `fetchImpl` — no live
  IAM-02 service required for unit tests; the read-DB integration tests can either stub this or
  (preferred, matching this codebase's "prove it against the real thing" discipline used for
  IAM-02→IAM-01) run against a REAL disposable IAM-02 instance seeded with real role/permission
  rows, the same way SEC-01's Phase 0-2 tests proved the real `publishAudit`/outbox path rather
  than a fake client wherever feasible.

---

## 6. Sensitive-read logging model

- **Trigger:** a `sensitive_read_log` row is written whenever a response is about to disclose
  ANY row at sensitive-tier fidelity — i.e., the actor's second IAM-02 check
  (`sec1.audit_event.read_sensitive`) resolved `allow` AND at least one row in the result set
  belongs to an event type whose `sec1.event_schema.sensitive_read = true` (the existing,
  already-seeded column — see `lib/schema-registry.ts`'s `EventSchemaRow.sensitive_read` and
  migration 008's seed data, where `sec1.self_audit_event` is already `sensitive_read = true`).
  This resolves the brief's open question #7/#8 cleanly: sensitivity is a property of the
  EVENT (schema-declared, at ingest time), not a property of the requester or the query.
- **Determining sensitivity requires joining `sec1.audit_event` to `sec1.event_schema` on
  `event_type` at query time** — a read-only join, no new column on `audit_event` and no
  migration to that already-accepted table. Chosen over denormalizing a `sensitive_read`
  column onto `audit_event` at ingest time specifically to avoid touching the Phase 0-3
  accepted ingestion path or its hash-chain (adding a column there would also re-open the
  canonical-hash-versioning question §22/§L1 already closed in Phase 3 — not worth reopening
  for a read-side concern).
- **Write path — inside the SAME transaction as the read**, per SEC1-TC-038 ("sensitive read
  log fails → read denied"): `lib/sensitive-read-log.ts` INSERTs the row BEFORE the route
  returns its response; if that INSERT fails, the transaction rolls back and the WHOLE request
  fails closed with `SEC1_SENSITIVE_READ_LOG_FAILED` — no data is ever returned without its
  accompanying log entry having successfully committed. This is a plain `withTransaction`
  wrapper (existing `@aix/foundation` helper, same one every other SEC-01 route already uses),
  not a new mechanism.
- **Anti-recursion (open question #8), resolved structurally, not by a runtime guard:**
  `sensitive_read_log` is a **separate, non-hash-chained table**, written to by a **direct SQL
  INSERT**, never by calling SEC-01's own `POST /internal/sec1/audit-events` ingestion
  endpoint. There is therefore no code path where reading audit events could itself produce a
  new `sec1.audit_event` row that requires the hash-chain lock, the schema registry, redaction,
  or — critically — another read-authorization check. This matches the blueprint's own table
  design (`05_Database_Design.md` §2.10 has no `stream_id`/`sequence_no`/`event_hash` columns
  at all) — the blueprint's authors already avoided this trap; Phase 4 preserves that design
  rather than "improving" it into a self-referential audit-of-audits.
- **Normal (non-sensitive) reads are NOT logged this phase.** The blueprint's rule 2 says
  "sensitive reads are logged," not "all reads are logged" — a normal-tier search/read still
  gets its permission DECISION recorded, but that recording already happens inside IAM-02's own
  `iam2.permission_decision_log` (every `evaluatePermission` call writes one row there,
  regardless of caller — see `guard.ts::recordDecision`), so a normal read is not silently
  unaudited; it is audited by the mechanism that already exists for exactly this purpose.

---

## 7. Redaction / query model

`07_Permission_Rules.md` §6's table is the source of truth:

| Data | Normal Read | Sensitive Read |
|---|---|---|
| Event type | Visible | Visible |
| Actor ID | Visible if permitted | Visible |
| Client ID | Redacted if no scope | Visible if scoped |
| Metadata | Redacted | Controlled full/safe metadata |
| Security finding | Limited | Full if permitted |

**`lib/read-redaction.ts` design:**

- A `RedactionTier = "normal" | "sensitive"` computed once per request (from the second IAM-02
  check, §5/§6) and applied uniformly to every row in the response — never decided per-row
  from client-supplied input.
- `actor_user_id`: normal tier shows it "if permitted" — but Phase 4 has no finer-grained
  actor-scoping concept than the tier itself (no per-actor-ownership check like WLT-01/DEP-01's
  client-scoping exists for SEC-01 reads yet), so this plan resolves it as: **visible at both
  tiers** this phase (the blueprint's "if permitted" degrades to "the baseline
  `.search`/`.read` grant IS the permission" in the absence of a finer model) — flagged
  explicitly for product-owner confirmation, not silently assumed.
- `client_id`: **redacted at normal tier unless the caller's IAM-02 check body included a
  matching `client_id`** (the existing `PermissionCheckInput.clientId`/context field — already
  wired end-to-end in IAM-02's guard, just not yet used for a "scope" decision by any caller).
  Phase 4 uses it exactly as documented: if the request itself was scoped to one `client_id`
  (i.e. the caller is asking "show me this client's audit trail" and that client_id was part of
  what got permission-checked), that one client_id is visible; a broader unscoped search always
  redacts `client_id` at normal tier. At sensitive tier, always visible.
- `metadata_redacted`: **always passes through the existing ingest-time
  `redactMetadata`/secret-blocklist form regardless of tier** — that blocklist is a safety net
  against secrets ever having been persisted at all (§4/§10 of the ingest-time module), never
  something a read-time permission grant can "unlock." What DIFFERS by tier is whether the
  (already-safe) `metadata_redacted` object is returned in full or replaced with a coarser
  summary/omitted at normal tier — this plan recommends normal tier omits `metadata_redacted`
  from the response body entirely (not just re-redacts it further, since it is already safe);
  sensitive tier returns it in full.
- **Hash-chain fields (`event_hash`, `previous_hash`, `sequence_no`, `stream_id`,
  `ingest_payload_hash`, `canonical_format_version`) are omitted from BOTH tiers this phase**
  — resolving open question #6. These are the domain of `sec1.audit_event.verify_integrity`
  (a distinct, deferred permission/route per §1/§2 — the existing internal
  `verify-range`/seal-verify routes already serve that need operationally). Exposing chain
  internals through a general-purpose read/search endpoint has no blueprint requirement behind
  it and would grow the surface without a corresponding test-case basis.
- **`lib/read-query.ts`** builds the `WHERE` clause from the documented filter set only
  (`event_type`, `source_module`, `actor_user_id`, `client_id`, `entity_type`, `entity_id`,
  `request_id`, `correlation_id`, `severity`, `time_from`/`time_to` on `occurred_at_utc`) —
  every filter is an exact-match `AND`, no free-text search this phase (not in the blueprint's
  filter list). Pagination: a `limit` (capped, e.g. max 200 — mirrors the existing batch-ingest
  `maxItems: 200` convention) + `sequence_no`-based keyset cursor (never `OFFSET`, to stay
  correct under concurrent inserts) — a judgment call flagged for confirmation at coding time,
  since the blueprint does not specify a pagination mechanism.

---

## 8. API design

**Open question, resolved with a recommendation (not silently assumed):** the blueprint writes
these as `GET /sec1/audit-events` (no `/internal/` prefix), suggesting an eventual
publicly-reachable, session-authenticated surface. But SEC-01 has **no session/cookie
authentication mechanism of its own** anywhere in the accepted codebase (Phases 0-3 built only
internal-service-token and source-identity-binding guards) — building one from scratch this
phase would be significant new surface with no blueprint-documented shape, and would duplicate
what PRT-01 (the presentation layer, "owns no truth/state," per its own accepted blueprint) is
specifically designed to front.

**Recommendation:** build these as **`/internal/sec1/*` routes this phase**, guarded by the
existing generic internal-identity guard (`plugins/internal-identity.ts` — the same one Phase
3's seal-verify/integrity-verify-range routes use), accepting `actor_id`/`session_id` as
explicit trusted request fields from an already-authenticated caller — **exactly the same trust
boundary IAM-02's own `permission/check` endpoint already uses** (`PermissionCheckBody.actor_id`
is likewise a trusted field from a caller who has already established the human's identity, not
re-derived from a session cookie IAM-02 parses itself). A future PRT-01/staff-portal BFF is the
intended caller; wiring an actual public/cookie-authenticated `/sec1/*` surface is deferred to
whenever PRT-01 integration work reaches SEC-01, not blocking Phase 4's core objective (the
IAM-02 integration + sensitive-read control), which works identically either way.

- **`POST /internal/sec1/audit-events/search`** (POST, not GET, despite the blueprint's `GET`
  — the filter set plus `actor_id`/`session_id` trust fields don't fit a clean query-string
  shape and this codebase has no precedent for a body-bearing internal GET; every existing
  internal route in this codebase is POST). Body: `{ actor_id, session_id?, filters: {...},
  limit?, cursor? }`. Guarded by `requireInternalIdentity` + the two-check IAM-02 flow (§5).
- **`POST /internal/sec1/audit-events/detail`** — body `{ actor_id, session_id?,
  audit_event_ref }`. Same guard/IAM-02 flow. 404 (`NOT_FOUND`) if the ref doesn't exist —
  checked AFTER authorization, not before (never leak existence to an unauthorized caller).
- Both require the standard `Idempotency-Key`? **No** — same reasoning `routes/internal.ts`
  (IAM-02) already documented for its own `permission/check`: these are read/decision
  operations, not a mutation whose replay would be harmful. (The sensitive-read LOG write is an
  internal side effect of a read, not a client-facing mutation with replay risk — a retried
  search naturally logs a second read event, which is CORRECT: a second read is a second read.)

---

## 9. Runtime-role grant changes

- **`role_sec1_runtime`**: `GRANT SELECT, INSERT ON sec1.sensitive_read_log` (append-only, same
  posture as `audit_event`/`audit_seal_batch`/`integrity_verification_run` — no UPDATE/DELETE
  ever). `GRANT SELECT` already exists on `sec1.audit_event`/`sec1.event_schema` (Phase 0-2) —
  the new read/search queries need no additional grant there, just the new JOIN capability
  (already covered by existing SELECT grants on both tables).
- **No new grant into `iam2.*`.** SEC-01 talks to IAM-02 exclusively over HTTP
  (`lib/iam2-client.ts`) — reconfirms the existing, tested "no blanket grant into iam, iam2, or
  any other module schema" invariant (`infra/grants/sec1_runtime_grants.sql`'s own comment,
  re-verified by the F3(a)-equivalent test in Phase 0-2). This is the single clearest structural
  guarantee that a compromised or buggy SEC-01 runtime role could never directly manipulate
  `iam2.permission`/`iam2.user_role` to self-grant read access.
- **No new grant needed on `role_iam2_runtime`** — SEC-01 only calls the ALREADY-GRANTED
  `permission/check` HTTP endpoint; it never reaches `iam2.*` tables at all.

---

## 10. Tests likely needed

**Unit (no DB):**
- `iam2-client` — allow/deny/step_up/network-error/non-2xx/malformed-JSON all fail closed
  (mirrors `iam01-client`'s own test shape, if one exists — verify at coding time).
- `read-redaction` — normal vs. sensitive tier field-by-field (actor_id, client_id, metadata,
  hash-chain-fields-always-omitted) for every combination in §7's table.
- `read-query` filter-building — each documented filter produces the expected WHERE clause;
  unknown/extra filter rejected (`additionalProperties: false` at the schema level).

**Integration (DB-gated, `role_sec1_runtime` + a REAL `role_iam2_runtime`-backed IAM-02
instance, same "connect as the real least-privilege runtime role from the start" discipline
every phase since FND-01 has followed):**
- SEC1-TC-035 — authorised normal read → allowed, normal-tier redaction applied.
- SEC1-TC-036 — unauthorised read (no role grant) → denied, `SEC1_UNAUTHORISED_AUDIT_READ`.
- SEC1-TC-037 — sensitive read → `sensitive_read_log` row written, sensitive-tier fields
  visible.
- SEC1-TC-038 — sensitive-read-log INSERT forced to fail (e.g. a constraint violation injected
  via the superuser connection, or a deliberately-broken transaction) → the READ itself is
  denied, no data returned, `SEC1_SENSITIVE_READ_LOG_FAILED`.
- SEC1-TC-079 — action string not yet registered in `iam2.permission` (migration 011 not
  applied / a typo) → fail closed, `SEC1_IAM02_REGISTRY_MISSING`.
- SEC1-TC-080 — the same actor allowed for `.search` but denied for `.read_sensitive` → normal
  read succeeds, sensitive fields never appear, no log row written.
- IAM-02-unavailable simulation (network error via `fetchImpl` DI, or a real IAM-02 instance
  stopped mid-test) → deny, never a 200.
- Detail-read on a nonexistent `audit_event_ref` for an AUTHORIZED actor → 404 `NOT_FOUND`; for
  an UNAUTHORIZED actor → 403/`SEC1_UNAUTHORISED_AUDIT_READ` (existence never leaked first).
- Cross-schema isolation re-check (F3(a)-equivalent) — `role_sec1_runtime` still cannot SELECT
  directly from `iam2.permission`/`iam2.user_role` even after this phase.
- Full regression: 325 baseline + new Phase 4 tests, fresh disposable Postgres, single run —
  same verification discipline as every prior phase (§12/§30 of the implementation notes).

---

## 11. Risks / questions before coding

1. **Public vs. internal route shape (§8)** — recommended internal-only this phase; flagged for
   explicit product-owner confirmation before coding starts, since it's a real deviation from
   the blueprint's literal `GET /sec1/...` path (in prefix and in HTTP verb).
2. **Migration 011 ownership (§4/§9)** — recommended as an IAM-02-side migration seeding
   SEC-01's permission codes, not a SEC-01-side migration reaching into `iam2.*`. This needs
   explicit confirmation: it is the first time this codebase has needed one module's migration
   to seed catalogue rows consumed by a DIFFERENT already-accepted module's schema, and there is
   no exact precedent (closest is SEC-01's own migration 008 seeding `event_schema` with
   hardcoded per-module rows — but that was SEC-01 seeding its OWN schema about other modules,
   not writing into another module's schema).
3. **`actor_user_id` visibility at normal tier (§7)** — resolved as "visible at both tiers" in
   the absence of a finer per-actor-ownership model; flagged because the blueprint's own table
   says "visible if permitted," implying a scoping concept that doesn't exist yet anywhere in
   this codebase for SEC-01 reads.
4. **Pagination mechanism (§7)** — not specified in the blueprint; recommended keyset (
   `sequence_no`/`occurred_at_utc` cursor) over `OFFSET` for correctness under concurrent
   ingestion, but this is this plan's own judgment call, not a documented requirement.
5. **`search_sensitive` naming inconsistency** — `07_Permission_Rules.md` §2's own permission
   list has `sec1.audit_event.search` (no `_sensitive` variant), but §8's protected-action list
   separately names `sec1.audit_event.search_sensitive`. This plan treats them as the SAME
   underlying control (`.search` + a `.read_sensitive`-gated tier, §5/§6/§7 above) rather than
   inventing a fourth permission code the blueprint's own §2 table never defines — flagged as a
   blueprint-internal inconsistency, not silently resolved without noting it.
6. **`GET /sec1/audit-streams/{stream_id}/verify`** intentionally excluded from this phase's
   scope (§1) — confirm this is acceptable before treating Phase 4 as "the read layer" in full.

---

## 12. Go/no-go recommendation

**GO for Phase 4 planning-to-coding handoff**, conditional on resolving risk items 1 and 2
above before the first line of code is written (both are structural/ownership decisions, not
implementation details — getting either wrong would mean rework of the route layer or the
migration, not a small patch). Items 3-6 can be resolved as explicit, documented judgment calls
at coding time (same discipline every prior phase has used for genuinely ambiguous blueprint
text), each flagged in the implementation notes exactly as F1/L1/P3-F1 and their peers were.

No code, migration, or test has been written as part of this planning pass.

---

## 13. Out-of-scope confirmation

Not built, not started, not touched by this plan: evidence export, security alert
lifecycle, monitoring rules, real SIEM/PagerDuty/Slack/email notification, real WORM/
object-lock, trusted timestamp authority, scheduler/cron, audit correction, retention/legal
hold, incident break-glass audit-read, expected-event reconciliation, `interim_audit_handoff`,
CFG-01, any business-tier module, any Exchange runtime feature (order book, matching engine,
market making, principal dealing, AIX spread markup). Licence lock (Money Broking + PSO only,
agency back-to-back execution, disclosed brokerage fee only) is unaffected — this phase adds a
read/authorization layer over an already-accepted audit store, nothing that touches execution,
custody, or fee logic.
