# SEC-01 Audit Log / Security Monitoring — Implementation Notes

Module: **SEC-01 Audit Log / Security Monitoring**
Blueprint: `aix-platform-docs/modules/SEC-01_Audit_Log_Security_Monitoring_Blueprint_Pack_v1.2/`
Implementation status: **Phases 0-2 implemented, Opus-reviewed (ACCEPT WITH MINOR CONDITIONS,
`docs/SEC-01_Security_Review_Opus_v0.1.md`), and the one must-fix condition (F1) is now closed
— 278/278 tests green on a fresh disposable Postgres (275 baseline + 3 new F1 regression tests).
Phases 0-2 remain the accepted implementation baseline. See §17 for the F1 patch.**

---

## 1. Scope implemented

- **Phase 0** — new service `services/sec1` (`@aix/service-sec1`), scaffolded as `services/iam2`'s
  own copy (Fastify 5, TypeBox, `removeAdditional: false` override, log redaction, request-context
  plugin, SEC-01's own interim internal-identity guard, boot-time no-Exchange-runtime guard).
  F3(c) import-boundary test proves `services/sec1/src/**` never imports `services/iam/src/**`,
  `services/iam2/src/**`, or `services/fnd/src/**`, and only ever imports `@aix/foundation` via
  its bare public specifier.
- **Phase 1** — schema `sec1`, `role_sec1_runtime` with per-table least-privilege grants (C1
  discipline applied from day one), 5 core tables (`audit_event`, `event_schema`,
  `audit_stream`, `audit_seal_batch`, `source_identity_binding`), seeded catalogue (4 baseline
  `event_schema` rows, 3 `source_identity_binding` rows keyed to per-module bearer tokens).
- **Phase 2** — audit ingestion core: `POST /internal/sec1/audit-events` and
  `POST /internal/sec1/audit-events/batch` (explicit per-event partial success), schema
  registry validation, mandatory-field validation, source identity binding + per-event
  `source_module` authorization check, metadata redaction, per-stream hash-chain with
  `SELECT ... FOR UPDATE` sequencing, dual-layer idempotency (HTTP `Idempotency-Key` +
  business-level `(source_module, event_id)` dedup), and an internal seal stub library
  function.

## 2. FND audit publisher extension (`packages/foundation/src/audit.ts`)

Approved Risk #1 option (a): extended `AuditEvent`/`AuditEnvelope` rather than building a
separate SEC-compatible publisher.

- **Naming-convention decision (explicit judgment call, as instructed):** the pre-existing
  `AuditEvent` fields (`event_type`, `actor_id`, `actor_type`, `entity_type`, `entity_id`,
  `metadata`) are all snake_case. I kept every NEW field snake_case too (`source_module`, not
  `sourceModule`) — one consistent convention for the whole interface, matching what was
  already there, rather than mixing cases within a single type. This is a deliberate departure
  from mirroring `idempotency.ts`'s `IdempotencyScope.sourceModule` (camelCase) — that is a
  different file with its own established convention; `audit.ts`'s own internal consistency
  took priority.
- `source_module: string` is now **required** on `AuditEvent` — a compile-time literal
  hardcoded at each call site, never derived from request/user input (same anti-spoofing
  discipline as `IdempotencyScope.sourceModule`). This is a deliberate breaking change,
  identical in shape to the C2 patch's required `sourceModule` on `IdempotencyScope` — it broke
  every existing `publishAudit` call site at compile time until fixed, which is expected.
- New OPTIONAL fields added: `severity`, `event_category`, `action`, `result`, `session_id`,
  `client_id`, `source_emission_sequence`, `reason_code` — the `08_Audit_Log_Events.md` §3
  mandatory-field superset, minus fields `AuditEvent`/`AuditEnvelope` already carried
  (`request_id`, `correlation_id`, `entity_type`, `entity_id`, `actor_id`, `actor_type`,
  `occurred_at_utc`). All optional because most existing FND-01/IAM-01/IAM-02 call sites
  predate SEC-01 and have no value for several of these yet; SEC-01's OWN ingestion schema
  validation is what actually enforces mandatory-field presence for events flowing through its
  ingestion API.
- `publishAudit`'s `payload_ref` JSON now includes **every** `AuditEvent`/`AuditEnvelope` field
  (not a subset), so a future outbox consumer has full fidelity from the outbox row alone.
  `JSON.stringify` drops undefined-valued keys, so callers that don't use the new fields
  produce a payload byte-identical in shape to the pre-extension version (proven by
  `tests/unit/audit-envelope.test.ts`'s "omits optional fields... rather than serializing them
  as null" test).
- **Every existing `publishAudit` call site updated** across `services/fnd` (3 sites),
  `services/iam` (34 sites), `services/iam2` (17 sites) — each now passes its own hardcoded
  module literal (`"FND-01"` / `"IAM-01"` / `"IAM-02"`) as the very first property after
  `event_type`. Applied via a scripted insertion (verified 1:1 against the exact count of
  `publishAudit(client, {` call sites per file) then spot-checked by hand across several files
  (`guard.ts`'s dynamic `event_type: auditEventType(decision)` call, `mfa.ts`, `decision-token.ts`).
  `tsc -b` compiled clean immediately after with zero manual per-call-site fixups needed.
- No secrets are put in metadata by this change (unchanged discipline; SEC-01's own redaction
  policy is a second, independent safety net — see §4).

## 3. Migration summary

- `infra/migrations/008_sec1_core.cjs` — schema `sec1`, 5 core tables, indexes, seed data.
  Deliberately does NOT create `security_monitoring_rule`, `monitoring_dead_letter`,
  `security_alert`, `alert_triage_note`, `evidence_export`, `sensitive_read_log`,
  `integrity_verification_run`, `interim_audit_handoff`, `audit_correction`,
  `expected_event_reconciliation`, or `recovery_integrity_run` (all later, explicitly deferred
  phases). **Fails closed at migration-run time** if `SEC1_INGEST_TOKEN_FND01`/`_IAM01`/`_IAM02`
  are not set in the environment (needed to seed `source_identity_binding.token_hash`).
- `infra/grants/sec1_runtime_grants.sql` — `role_sec1_runtime` + per-table grants (see §7).
- Both additive; no changes to migrations 001-007.
- Two columns added beyond the blueprint's literal `05_Database_Design.md` table definitions
  (both load-bearing, documented in the migration's own header comment):
  - `sec1.audit_event.ingest_payload_hash` — sha256 of the full validated inbound payload
    (pre-redaction), used ONLY to distinguish a genuine replay from a true conflict on
    `(source_module, event_id)`. The blueprint's own `event_hash` hashes the
    ALREADY-REDACTED `metadata_redacted` form, so it cannot serve this purpose reliably.
  - `sec1.source_identity_binding.token_hash` — the blueprint's `ingestion_identity_id` is
    documented as a human-readable label, not a cryptographic secret. `token_hash` is the real
    security mechanism (sha256 of a bearer token, never the raw token), added alongside it —
    mirrors the hash-only-at-rest convention used everywhere else in this codebase for
    bearer-style secrets (`iam.step_up_assertion`, `iam2.permission_decision_token`,
    `iam.session`).

## 4. Source identity binding model

- `sec1.source_identity_binding` seeded with 3 rows (FND-01/IAM-01/IAM-02), each keyed to a
  distinct per-module bearer token supplied via `SEC1_INGEST_TOKEN_FND01`/`_IAM01`/`_IAM02` at
  migration-run time — only the sha256 hash is ever persisted.
- **Two distinct identity mechanisms, deliberately not conflated** (see
  `services/sec1/src/plugins/internal-identity.ts`'s and `source-identity.ts`'s header
  comments for the full rationale):
  1. `plugins/internal-identity.ts` — SEC-01's generic interim internal-identity guard
     (single shared secret, `SEC1_INTERNAL_SERVICE_TOKEN`), mirroring every other service's
     own copy. Scaffolded per Phase 0's requirement but NOT mounted on this phase's one route
     (a single shared secret cannot tell FND-01/IAM-01/IAM-02 apart) — kept ready for later,
     deferred non-ingestion internal routes (seal, reconciliation, recovery).
  2. `plugins/source-identity.ts` — the REAL Phase 2 mechanism. Resolves a presented bearer
     token to its bound `source_module` by comparing its sha256 hash against every ACTIVE
     `source_identity_binding` row's `token_hash` using `crypto.timingSafeEqual` (never
     `!==`), mirroring IAM-02's own constant-time-compare convention rather than a
     `session.ts`-style indexed-equality SQL lookup (this table is tiny — one row per module —
     so a full active-row scan is cheap).
- **Authentication vs. authorization kept separate on purpose:** the guard only resolves WHO is
  calling (`request.resolvedSourceModule`); `lib/ingest.ts` separately checks that each EVENT's
  own declared `source_module` field matches the resolved identity, rejecting a mismatch with
  `SEC1_SOURCE_MODULE_IDENTITY_MISMATCH`. This means a batch call authenticated as IAM-01 cannot
  smuggle an event declaring `source_module: "IAM-02"` under IAM-01's identity — proven directly
  (`tests/integration/sec1-db.test.ts`, "IAM-01's own token cannot be used to ingest an event
  declaring IAM-02 as source_module").

## 5. Hash-chain model

- Canonical JSON (`services/sec1/src/lib/canonical.ts`): a deterministic, EXPLICITLY
  field-ordered serialization — every object's keys are recursively sorted lexicographically at
  every nesting depth (arrays preserve element order, which IS meaningful). Same algorithm
  `packages/foundation/src/idempotency.ts`'s own (unexported) `canonical()` helper uses; SEC-01
  has its own copy (not imported — that helper isn't part of `@aix/foundation`'s public surface,
  and importing it would also violate the F3(c) import-boundary in spirit even if it were).
- `event_hash = sha256(canonicalJson(explicitFieldSet) + "|" + (previous_hash ?? "GENESIS"))`.
  The explicit field set is an ALLOW-LIST (not "whatever the caller sent"), and binds the
  ALREADY-REDACTED metadata form — the hash-chain protects what SEC-01 actually stored, never a
  raw pre-redaction payload it never persists.
- **Sequencing (F2 lesson applied from day one):** `services/sec1/src/lib/stream.ts`'s
  `lockStreamForUpdate` does `INSERT ... ON CONFLICT (stream_id) DO NOTHING` (idempotent
  create) then `SELECT latest_sequence_no, latest_hash FROM sec1.audit_stream WHERE stream_id =
  $1 FOR UPDATE`, held for the full duration of the ingest transaction — never a racy
  read-then-write, never two queries touching the same stream row concurrently outside strict
  sequential awaits.
- **Stream derivation** (judgment call — no stream-registration API exists this pass): one
  hash-chain stream per source module by default (`stream_id = source_module`), or
  `"<source_module>:<source_emission_stream>"` when the caller supplies
  `source_emission_stream`.
- **Duplicate handling order is what prevents a replay/race from ever burning a sequence
  number:** the stream pointer (`sec1.audit_stream`) is advanced ONLY AFTER the
  `INSERT ... ON CONFLICT (source_module, event_id) DO NOTHING` on `sec1.audit_event` is
  CONFIRMED to have landed (`rowCount > 0`). On a lost race or a genuine replay (0 rows), the
  code re-reads the existing row and compares `ingest_payload_hash`; the stream was NEVER
  touched by that attempt, so no gap or double-count is ever created — this is the FND-01 F1
  pattern (`INSERT ... ON CONFLICT DO NOTHING` + `SELECT` under the unique constraint,
  `FND-01_Final_Review_Opus_v1.0.md` §1) extended with the stream lock, not a new invented
  mechanism.
- Proven under real concurrency (`tests/integration/sec1-db.test.ts`): 8 concurrent ingest calls
  into the same stream produce exactly 8 rows with sequence numbers 1..8, each linked
  end-to-end (`previous_hash[i] === event_hash[i-1]`), and separately, 5 concurrent submissions
  of the SAME `(source_module, event_id)` resolve to exactly 1 stored row with the stream
  pointer left at `latest_sequence_no = 1` (not 5) — no sequence number was ever burned by the
  losing attempts.
- Tamper/gap detection (`services/sec1/src/lib/integrity.ts`'s `verifyChainSegment`, a small
  pure helper — no scheduled job/alerting built this pass, per the brief's "optional, only if
  it fits cleanly"): detects a recomputed-hash mismatch (tampering) and a missing
  `sequence_no` (gap), both proven at the unit level (synthetic chains) AND at the integration
  level (a real DB row mutated/deleted out-of-band via the superuser connection, then
  re-verified through the real helper against the real remaining rows).

## 6. Internal seal stub / external WORM deferred

- `services/sec1/src/lib/seal.ts`'s `sealBatch` — a library function only (no HTTP route, per
  the brief's explicit "an HTTP route is optional"). Computes a batch hash (sha256 of the
  ordered concatenation of each event's `event_hash` over a `[from_sequence_no,
  to_sequence_no]` range) and inserts ONE `sec1.audit_seal_batch` row with `seal_method =
  'internal'`, `external_anchor_ref = null`, `trusted_timestamp_ref = null`,
  `verification_status = 'pending'`.
- Explicitly, unambiguously marked **non-authoritative for production external evidence**
  until a later, infrastructure-dependent phase configures real WORM/object-lock storage and a
  real trusted timestamp authority (05_Database_Design.md §5.5A: "Internal seal is allowed only
  for development/test or pre-production non-authoritative evidence").
- Proven end-to-end (`tests/integration/sec1-db.test.ts`, "internal seal stub").

## 7. Approved SEC exception — `foundation.outbox_event`

`role_sec1_runtime` is granted `SELECT, UPDATE` (explicitly NOT `INSERT`, NOT `DELETE`) on
`foundation.outbox_event` — a documented, narrow exception UNIQUE to SEC-01 in this codebase;
every other module's runtime role keeps the C1-tightened INSERT-ONLY contract
(`infra/grants/iam_runtime_grants.sql` / `iam2_runtime_grants.sql`, unchanged by this pass).
Rationale (also in the grants file's own comment): SEC-01 is the authoritative audit CONSUMER —
a future outbox consumer would need to `SELECT` pending `topic='audit.event'` rows and `UPDATE`
their status to mark them consumed. Added now (Phase 1) even though the consumer itself is
deferred (see §9), so a later phase needs no further grants-file patch. Proven in both
directions: `role_sec1_runtime` genuinely has SELECT+UPDATE but not INSERT/DELETE
(`tests/integration/sec1-db.test.ts`), and the two foreign INSERT-only consumer roles
(`role_iam_runtime`, `role_iam2_runtime`) did NOT gain SELECT/UPDATE from this pass — the
exception did not leak. (`role_fnd_runtime` is excluded from that specific leak-check: it is
`foundation`'s own schema-owner runtime role and has always had full SELECT/INSERT/UPDATE on
every table in that schema, predating SEC-01 entirely and unrelated to this exception — see the
test's own comment for why.)

`foundation.idempotency_record` — SEC-01 is simply the next module using the existing C2
`source_module`-scoped RLS pattern (`infra/migrations/005_fnd_idempotency_module_scope.cjs`),
`sourceModule: "SEC-01"` in every `beginIdempotent`/`completeIdempotent` call site
(`services/sec1/src/routes/internal.ts`). No grant changes to that table's isolation model.

## 8. Idempotency design (two independent, composable layers)

1. **HTTP-level:** the standard `Idempotency-Key` header, required and fail-closed (400 —
   `IDEMPOTENCY_KEY_REQUIRED`) if missing, on both ingestion routes — the standard
   `beginIdempotent`/`completeIdempotent` cycle, `sourceModule: "SEC-01"`. A replay under the
   SAME key + same body returns the same result without redoing ingestion work (in practice, it
   still calls `ingestAuditEvent` again, which is itself idempotent via layer 2 below — this
   keeps the code simple rather than needing to serialize/deserialize a `result_ref` blob). A
   replay under the SAME key with a DIFFERENT body fails closed automatically
   (`beginIdempotent`'s own fingerprint-mismatch check, `VALIDATION_ERROR`).
2. **Business-level:** `(source_module, event_id)` uniqueness on `sec1.audit_event` itself,
   using the FND-01-documented-safe `INSERT ... ON CONFLICT DO NOTHING` + `SELECT` pattern
   (§5). Same payload -> idempotent replay, no second row. Different payload ->
   `SEC1_IDEMPOTENCY_CONFLICT` (409), no second row. This layer is independent of the HTTP
   header — proven directly by replaying the SAME event under a DIFFERENT `Idempotency-Key`
   each time.

## 9. Outbox consumer path — deferred as Phase 2b

**Direct ingestion only was implemented this pass.** A minimal `foundation.outbox_event`
consumer (reading `topic='audit.event'` rows and mapping the enhanced payload into
`sec1.audit_event`) was evaluated and explicitly NOT built, per the brief's own permission to
defer it if building it would risk a rushed/half-built result. Reasoning: a correct consumer
needs its own polling/locking discipline (which rows are "claimed" vs. pending, retry/backoff,
marking `status` without a race against a second poller instance), a mapping layer from the
FND-01 envelope shape to the full `sec1.audit_event` column set (including deriving
`classification`/`retention_class` from the schema registry exactly as the direct path does),
and its own dedicated test coverage for all of the above — doing this properly would have
roughly doubled Phase 2's surface area for a capability that direct ingestion doesn't strictly
need to be complete and correct on its own. The SELECT+UPDATE grant exception on
`foundation.outbox_event` (§7) is already in place so a later phase can build the consumer
without a further grants-file patch, matching the precedent IAM-02 set in this codebase
(granting a table before the exact call site that uses it exists).

## 10. Metadata redaction policy (chosen, not left ambiguous)

`services/sec1/src/lib/redaction.ts`: **REDACT**, not reject, secret-like metadata keys
(case-insensitive substring match on a blocklist — `password`, `token`, `secret`, `otp`,
`mfa_code`/`mfa_seed`, `private_key`, `api_key`, `card_number`, `cvv`, `pin`, `seed_phrase`,
`credential`), applied recursively through nested objects/arrays, BEFORE canonicalisation/
hashing. Chosen because `sec1.audit_event`'s own column is named `metadata_redacted`, not
`metadata` — the schema itself signals redacted-always, and redacting (rather than rejecting
the whole event) preserves audit-trail availability for an otherwise-legitimate sensitive-action
event that happened to include a redactable key, which matters given §5.3/§5.4's "audit must
not silently fail to record a sensitive action" principle.

## 11. Tests added

- **Unit (no DB):** `sec1-canonical.test.ts` (12 — canonical JSON determinism, hash
  determinism/tamper-sensitivity, `verifyChainSegment` gap/broken-link/tamper detection),
  `sec1-redaction.test.ts` (7), `sec1-schema-validation.test.ts` (6), `sec1-source-identity.test.ts`
  (4 — constant-time binding match), `sec1-import-boundary.test.ts` (6), `audit-envelope.test.ts`
  (2 — FND publisher's enhanced outbox payload, fake-client). **37 new unit tests.**
- **Integration (DB-gated, `role_sec1_runtime` via a real LOGIN role from the start):**
  `tests/integration/sec1-db.test.ts` — **27 tests** covering: boot/no-Exchange-runtime;
  cross-schema isolation (F3(a)-equivalent); append-only enforcement (no UPDATE/DELETE on
  `audit_event`); the `foundation.outbox_event` SEC exception in both directions; source
  identity binding (missing/unknown/mismatched token, cross-module smuggling attempt); schema
  registry validation (unknown event_type, missing mandatory field); genesis + monotonic +
  linked hash-chain; duplicate handling (same-payload replay, different-payload conflict,
  HTTP-level replay, missing Idempotency-Key); concurrent ingestion into the same stream (no
  shared sequence numbers, genuinely linked chain, no lost rows) AND concurrent duplicate
  submissions (no burned sequence numbers); batch partial success; tamper detection (real DB
  row mutated out-of-band, re-verified); sequence-gap detection (real DB row deleted
  out-of-band, re-verified); internal seal stub; a REAL (non-fake-client) `publishAudit` call
  proving the enhanced outbox payload lands correctly in `foundation.outbox_event`.
- **Total new tests: 64** — 37 new unit-file tests (12+7+6+4+6+2 across the 6 new unit test
  files above) + 27 integration tests = **64 new tests.**
- **Full regression:** 211 baseline (FND-01 44 + IAM-01 + IAM-02, per the accepted IAM-02
  baseline's own 211/211 total) + 64 new = **275/275 tests passing**, in a single run against a
  genuinely fresh disposable Postgres (see §12 for exact commands).

## 12. Commands run (this verification pass)

```bash
# Fresh disposable Postgres
psql "postgres://postgres@localhost:5432/postgres" -c "CREATE DATABASE aix_sec1_final_<ts>;"

export DATABASE_URL="postgres://postgres@localhost:5432/aix_sec1_final_<ts>"
export SEC1_INGEST_TOKEN_FND01="test-fnd01-ingest-token-it"
export SEC1_INGEST_TOKEN_IAM01="test-iam01-ingest-token-it"
export SEC1_INGEST_TOKEN_IAM02="test-iam02-ingest-token-it"

npx node-pg-migrate -m infra/migrations --no-check-order up   # 001 -> 008, all clean

psql "$DATABASE_URL" -f infra/grants/fnd_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam2_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/sec1_runtime_grants.sql

npx tsc -b                                                     # clean, zero errors

export TEST_DATABASE_URL="$DATABASE_URL"
npx vitest run                                                 # 26 files, 275/275 passing, single run

# Cleanup
psql "postgres://postgres@localhost:5432/postgres" -c "DROP DATABASE aix_sec1_final_<ts>;"
psql "postgres://postgres@localhost:5432/postgres" -c "DROP ROLE fnd_app_test;"
psql "postgres://postgres@localhost:5432/postgres" -c "DROP ROLE iam_app_test;"
psql "postgres://postgres@localhost:5432/postgres" -c "DROP ROLE iam2_app_test;"
psql "postgres://postgres@localhost:5432/postgres" -c "DROP ROLE sec1_app_test;"
```

**Known footgun avoided:** an EARLIER pass in this session re-ran the full suite twice against
the SAME persistent test database (to iterate on two test bugs — see §13) and hit 21 spurious
IAM-02 failures, because IAM-02's bootstrap-to-RBAC-transition test is structurally single-use
per database (by design). Root-caused immediately as DB reuse, NOT a real regression — the DB
was dropped and recreated fresh, migrations+grants+tests re-run exactly once, and the clean
275/275 result above is from that single fresh run. This confirms the documented lesson
("Do not reuse a database across multiple test runs") rather than contradicting it.

## 13. Bugs found and fixed during this pass's own verification (self-review, not yet Opus)

Two test-design bugs (not product-code bugs) were found and fixed while proving out the
integration suite against a real database, before the final clean run:

1. My first draft of the "other module runtime roles... exception did not leak" test asserted
   `role_fnd_runtime` must be INSERT-only on `foundation.outbox_event` — factually wrong,
   because `role_fnd_runtime` is `foundation`'s own schema-owner role and has always had full
   `SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA foundation` (predating SEC-01, unrelated to
   this exception). Fixed to check only the two FOREIGN INSERT-only consumer roles
   (`role_iam_runtime`, `role_iam2_runtime`).
2. My first draft of "FND audit publisher produces the enhanced outbox payload (real DB)"
   reused this test file's own singleton `getPool()` (initialised in `beforeAll` scoped to
   `role_sec1_runtime`, which is deliberately SELECT+UPDATE-only, NOT INSERT, on
   `foundation.outbox_event`) to call `publishAudit`, which needs to INSERT — a "permission
   denied" failure that actually confirmed the grant model is working correctly, just against
   the wrong connection for what the test intended to prove. Fixed by using a raw client off the
   superuser `verifyPool` (already used for fixture/verification queries throughout the file)
   with a manual `BEGIN`/`COMMIT`, which correctly exercises the real `publishAudit`/
   `enqueueOutbox` code path without being entangled in role-grant enforcement.

Neither was a product-code defect; both are called out here in the same spirit as IAM-02's own
implementation notes documenting bugs found during verification, for transparency.

## 14. Known gaps / deferred items for Opus review

Everything in the brief's "DEFERRED — DO NOT BUILD NOW" list remains deferred, unchanged:
real WORM/object-lock storage, real trusted timestamp authority, real SIEM/PagerDuty/Slack/
email notification, expected-event reconciliation, incident break-glass audit-read,
protected-action registry dependency, audit correction workflow, retention/legal hold, recovery
integrity verification, evidence export, advanced security alert lifecycle. Also, specific to
this pass:

- **Outbox consumer (Phase 2b)** — see §9. Direct ingestion only; the grant exception is in
  place for when a later phase builds it.
- **Clock-skew detection (SEC1-FR-028 / §5.5D)** — `sec1.audit_event.clock_skew_seconds` /
  `clock_skew_status` columns exist but are left `NULL`/`'not_evaluated'` respectively this
  pass; no threshold policy exists yet (blueprint Open Item #18: "Final occurred_at_utc skew
  threshold" — genuinely undefined upstream, not an oversight).
  `source_clock_id` is accepted on the wire (per the API sample) but explicitly dropped, not
  persisted or acted on.
- **Source emission sequence continuity verification (SEC1-FR-024/025, §5.5B)** — the
  `source_emission_sequence`/`source_emission_stream` columns and their partial unique
  constraint are built and populated when the caller supplies them, but no CONTINUITY check
  (detecting a gap in a source's OWN emission sequence, as opposed to SEC-01's own
  ingestion-order `sequence_no`) is implemented — out of Phase 0-2 scope per the brief.
- **Event schema management API** — no `POST /sec1/event-schemas` this pass; the 4 seeded rows
  are migration-only. A real event type not covered by one of the 4 generic seeds will be
  rejected with `SEC1_EVENT_TYPE_UNKNOWN` until a later phase adds real per-event-type rows or a
  management API.
- **Sensitive-read logging, search/export APIs, security monitoring rules/alerts, IAM-02
  permission-guard-gated reads** — none of `sec1.*`'s read-side surface is built this pass
  (Phase 0-2 is ingestion-only); every `sec1.*` permission code in `07_Permission_Rules.md` §2
  remains unregistered in IAM-02 (a later, cross-module step).
- **Interim IAM-01/IAM-02 audit handoff/backfill** — not built; existing IAM-01/IAM-02 local
  audit indexes remain non-authoritative until a later phase reconciles them.

## 15. Confirmation: no out-of-scope module/feature code

No CFG-01, CLT/KYC/AML/WLT, LED/DEP/WDR/TRD, E2E/REC/INC/PRT code was added. No Exchange
runtime route, order book, matching engine, market making, principal dealing, or AIX spread
markup code exists anywhere in `services/sec1` — proven by the boot-time
`assertNoExchangeRuntime` guard (same mechanism every other service uses) plus a direct
route-path string check in the integration suite. No ledger/balance/audit-edit helper exists
anywhere in the new code.

## 16. Opus independent review — ACCEPT WITH MINOR CONDITIONS

The independent Opus review (`docs/SEC-01_Security_Review_Opus_v0.1.md`) verdict was **ACCEPT
WITH MINOR CONDITIONS**. FND publisher extension, ingestion, source-identity binding,
grants/append-only enforcement, and out-of-scope/licence posture were all found sound and
independently re-verified (fresh disposable Postgres, 275/275, grant boundaries reproduced
directly under each runtime role). One Medium finding (F1) and two Low observations (L1, L2)
were raised — see §17 for F1's closure. L1/L2 are non-blocking carry-forward items (§18).

## 17. F1 gap patch — event_category hash/column divergence closed

**Root cause (confirmed by the Opus review, reproduced empirically against a live app + DB
before any code was written):** `services/sec1/src/lib/ingest.ts`'s `buildCanonicalFields`
bound `event_category: input.event_category ?? null` into the canonical hash, while the INSERT
stored `input.event_category ?? schema.category` in the column. An event that OMITTED the
optional `event_category` therefore hashed against `null` but persisted the schema-defaulted
category (e.g. `'system'`). Any routine reconstructing canonical fields FROM THE STORED ROW —
exactly what tamper verification must do — would recompute a DIFFERENT hash and report a false
`hashMismatch` on a perfectly untampered event. The review's own probe reproduced this directly:
an event ingested with `event_category` verified clean; an otherwise-identical event omitting it
reconstructed to `event_category='system'` and failed `verifyChainSegment` with
`hashMismatchAt=[1]`.

**Fix.** `event_category` is now resolved **once**, immediately after schema lookup:
```ts
const resolvedEventCategory = input.event_category ?? schema.category;
```
`resolvedEventCategory` is threaded into BOTH `buildCanonicalFields` (the hash) and the INSERT's
`event_category` column — there is no longer a second, independent `?? schema.category`/`?? null`
resolution anywhere in the ingest path. `buildCanonicalFields`'s signature now takes
`resolvedEventCategory` as an explicit parameter rather than deriving it internally, so the two
call sites structurally cannot diverge again.

**Tests added** (`tests/integration/sec1-db.test.ts`, new "F1 fix: event_category hash/column
consistency" describe block, 3 tests):
1. An event ingested WITH explicit `event_category` verifies clean.
2. An event ingested OMITTING `event_category` stores the schema-defaulted category, its
   recomputed hash equals the stored `event_hash`, and it verifies clean — the exact regression
   case (previously would have reported a false `hashMismatch`).
3. Tampering an event that omitted `event_category` is STILL correctly detected as a
   `hashMismatch` — proving the fix closed the false-positive without disabling true-positive
   tamper detection.

**Verification (fresh disposable Postgres, this patch):** `npx tsc -b` clean; migrations
001→008 apply; all 4 grant files apply; **278/278 tests passing** (275 baseline unregressed + 3
new F1 tests) in a single run. All three new tests independently confirmed running (not
vacuously skipped) via a verbose reporter pass.

**SEC-01 Phases 0-2 remain the accepted implementation baseline** after this patch — F1 was the
only must-fix condition from the Opus review, and it is now closed.

## 18. Carry-forward (non-blocking, from the Opus review)

- **L1** — `classification`/`retention_class` are not covered by the event hash (both are
  set-once and schema-derived, so independently re-derivable by a verification job, but a
  DB-level actor could alter them without breaking the hash). Decide whether to hash-bind them
  when the retention/verification phase is built.
- **L2** — metadata redaction (`lib/redaction.ts`) is a key-name-substring blocklist — a safety
  net, not a guarantee (a secret in an innocuously-named key or embedded in a value string is not
  caught). The primary control remains source-side "no secrets in metadata" discipline
  (documented in `packages/foundation/src/audit.ts`'s own header comment); revisit value-level
  scanning if/when a richer classification model lands.
- All Phase 3+ deferred scope from §14 remains unchanged and untouched by this patch (outbox
  consumer, external WORM/TSA, monitoring/alerts, evidence export, IAM-02 `sec1.*` registration,
  interim audit handoff, clock-skew detection, source-emission-sequence continuity, audit
  correction, retention/legal hold, recovery integrity verification, incident break-glass
  audit-read).

## 19. Next step (superseded by §20 below)

**SEC-01 Phases 0-2 are an accepted implementation baseline.** Ready for Phase 3
planning/coding whenever prioritised (external sealing / monitoring / evidence export), per the
standard FND-01 -> IAM-01 -> IAM-02 -> SEC-01 build discipline.

---

## 20. Phase 3 — implemented (integrity verification run + seal verification + L1 hash versioning)

Phase 3 is implemented per `docs/implementation/SEC-01_Phase3_Implementation_Plan_v1.0.md`.
Scope: `sec1.integrity_verification_run` (blueprint §2.11) + a DB-backed wrapper around the
existing pure `verifyChainSegment`; internal seal **verification** (extending the
creation-only Phase 0-2 stub); the L1 carry-forward (`classification`/`retention_class`
hash-binding) closed via a versioned canonical-hash formula; an external-anchor interface
stub with zero call sites. `tsc -b` clean; migrations 001→009 apply; all four grant files
apply; **316/316 tests passing** (278 baseline + 38 net new) on a fresh disposable Postgres,
single run. See §26 for the exact commands.

## 21. Migration 009 — `sec1.integrity_verification_run` + `canonical_format_version`

`infra/migrations/009_sec1_integrity_verification.cjs`, additive only:

- **`sec1.integrity_verification_run`** — exact blueprint §2.11 column set (`id`,
  `verification_id` unique, `stream_id`, `from_sequence_no`, `to_sequence_no`, `result` CHECK
  IN ('pass','fail'), `gap_count`, `mismatch_count`, `findings jsonb`, `run_at_utc`), plus an
  index on `(stream_id, run_at_utc)`. No FK to `sec1.audit_event` (mirrors every other table in
  this schema — no cross-table FK exists in the 5 core tables either).
- **`sec1.audit_event.canonical_format_version`** (smallint) — added via `ADD COLUMN ... NOT
  NULL DEFAULT 1` (Postgres backfills every pre-existing row to `1` at ALTER time — no separate
  `UPDATE` statement needed), then `ALTER COLUMN ... SET DEFAULT 2` so any FUTURE direct-SQL
  insert (bypassing the application) defaults to the current formula rather than silently
  reverting to the old one. The application (`lib/ingest.ts`) always sets this column
  explicitly regardless of the column default.
- **Grants** (`infra/grants/sec1_runtime_grants.sql`): `GRANT SELECT, INSERT ON
  sec1.integrity_verification_run TO role_sec1_runtime` (append-only — no UPDATE/DELETE, same
  posture as `audit_event`), and a narrowly-scoped **column-level** grant — `GRANT UPDATE
  (verification_status) ON sec1.audit_seal_batch TO role_sec1_runtime` — NOT a blanket
  table-level UPDATE. This is the "narrowest practical grant" the brief required: Postgres
  supports column-level UPDATE grants, and using one here means the DB layer independently
  enforces that seal verification can never write `seal_method`/`external_anchor_ref`/
  `trusted_timestamp_ref`, on top of the application code's own structural inability to do so
  (see §23). No UPDATE/DELETE grant changes on `sec1.audit_event` — append-only posture is
  completely unchanged by this migration (re-proven in §25's grant tests).

## 22. `canonical_format_version` (L1) — hash versioning model

The Opus review's L1 carry-forward (§18) is closed: `classification`/`retention_class` are now
bound into the event hash for every row ingested from Phase 3 onward.

**Design chosen: version by omission, not by branching inside the hash function.**
`canonical.ts`'s `canonicalJson` already filters out any object key whose value is
`undefined` before serializing (`Object.keys(obj).filter((k) => obj[k] !== undefined)`) — an
`undefined`-valued key and an ABSENT key serialize identically. This means:

- `CanonicalEventFields` gained two new **optional** fields: `classification?: string` and
  `retention_class?: string`.
- A **v1** row's reconstruction simply OMITS these two fields (leaves them `undefined`) —
  `canonicalJson` then produces **byte-identical** output to the pre-Phase-3 formula. Proven
  directly, not just inferred: `tests/unit/sec1-canonical.test.ts`'s "canonicalJson-undefined-
  filtering equivalence" test builds a `CanonicalEventFields` object with the two fields
  omitted and a second, otherwise-identical object with them explicitly set to `undefined`,
  and asserts `canonicalJson`/`computeEventHash` produce byte-identical output for both.
- A **v2** row's reconstruction POPULATES both with the row's real values.
- **`computeEventHash`/`canonicalJson` themselves needed ZERO changes.** Versioning lives
  entirely in what the CALLER passes into `CanonicalEventFields`, never in the hash function's
  own logic. This was the deliberate minimal-risk choice over branching inside
  `computeEventHash` on a version parameter — it cannot introduce a NEW class of hash-formula
  bug the way an internal branch might, and it keeps the already-reviewed hash function
  untouched.

Three new named constants in `canonical.ts` (never a bare `1`/`2` literal elsewhere):
`CANONICAL_FORMAT_VERSION_V1 = 1`, `CANONICAL_FORMAT_VERSION_V2 = 2`,
`CURRENT_CANONICAL_FORMAT_VERSION = CANONICAL_FORMAT_VERSION_V2`.

**Ingest side (`lib/ingest.ts`):** every fresh ingest now resolves
`schema.classification`/`schema.retention_class` ONCE (same discipline as the F1 fix's
`resolvedEventCategory` — schema-derived, never caller-supplied) and threads the SAME resolved
values into both `buildCanonicalFields` (the hash) and the INSERT's `classification`/
`retention_class` columns — no independent re-derivation in two places. Every fresh ingest
writes `canonical_format_version = CURRENT_CANONICAL_FORMAT_VERSION` (2). The pre-existing
`event_category` F1 fix is completely unchanged.

**Reconstruction side** (`lib/integrity.ts`'s `runIntegrityVerification`, `lib/seal.ts`
implicitly via stored `event_hash` values, and the updated F1-era tests in
`tests/integration/sec1-db.test.ts`): every reconstruction reads the row's OWN
`canonical_format_version` and only populates `classification`/`retention_class` when it is
`>= CANONICAL_FORMAT_VERSION_V2`. A MIXED-version range (v1 rows from before Phase 3, v2 rows
after) is handled correctly because each row is reconstructed under its own formula, never a
single formula applied uniformly — proven end-to-end by `tests/integration/sec1-db.test.ts`'s
"a MIXED-version range... verifies clean end-to-end" test, which manually inserts a genuine v1
row (hash computed WITHOUT classification/retention_class, `canonical_format_version = 1`)
then chains two REAL ingested (v2) events onto it in the same stream, and confirms
`runIntegrityVerification` over the full range reports a clean pass.

**Regression discipline:** fixing three pre-existing Phase 0-2 test reconstruction sites was
required — those tests reconstruct `CanonicalEventFields` from a real ingested row to test
tamper detection, and since every real ingest is now v2 (classification/retention_class ARE
bound into the hash), a reconstruction that omitted them (as they did pre-Phase-3) started
producing a FALSE hash mismatch on an otherwise-clean row — the exact F1-shaped failure mode,
here caused by a formula version change rather than a caller-omitted field, exactly as §9 of
the Phase 3 plan anticipated. Fixed by making those three reconstruction sites version-aware
(reading `canonical_format_version` and conditionally including the two fields), the same
pattern `runIntegrityVerification` uses in production code. This was caught by this
implementation's own full-suite verification pass, not missed.

## 23. Seal verification (`lib/seal.ts` — `verifySealBatch`)

Extends the Phase 0-2 creation-only `sealBatch` (unchanged). `verifySealBatch(client,
sealBatchId)`:

1. Reads the `sec1.audit_seal_batch` row by `seal_batch_id` (404 `NOT_FOUND` — the generic
   foundation code, reused rather than adding a new SEC1-specific catalogue entry for a single
   call site, per `lib/errors.ts`'s own "only add codes this stage's routes can actually throw"
   discipline).
2. Reads the `sec1.audit_event` rows for that seal's `stream_id` within
   `[from_sequence_no, to_sequence_no]`, ordered by `sequence_no`.
3. Recomputes the batch hash using the EXACT SAME method `sealBatch` already uses (ordered
   `event_hash` values joined with `"|"`, sha256) — no separate concatenation logic invented.
4. Compares recomputed vs. stored `batch_hash`; `UPDATE`s **only** `verification_status` to
   `'valid'`/`'failed'`.

**Structurally cannot write `seal_method`/`external_anchor_ref`/`trusted_timestamp_ref`** —
those three columns simply do not appear anywhere in the function's UPDATE write set (no code
path constructs an UPDATE statement naming them), independently reinforced by the column-level
grant (§21). Response: `{ seal_batch_id, verification_status, recomputed_batch_hash,
stored_batch_hash, production_authoritative: false }` — `production_authoritative` is
**unconditionally `false`** this phase (never a branch that could evaluate `true` yet, since
every seal batch this phase has `seal_method = 'internal'` and no external-anchor code path
exists anywhere).

Proven (`tests/integration/sec1-db.test.ts`): a clean sealed range → `'valid'`; a tampered
range (an out-of-band `event_hash` edit on one row within the range, via the superuser
`verifyPool`, simulating a DBA-level rewrite the detector must catch) → `'failed'`; verifying
touches ONLY `verification_status` (read back `seal_method`/`external_anchor_ref`/
`trusted_timestamp_ref` unchanged from what `sealBatch` originally wrote); response always
carries `production_authoritative: false`.

## 24. Integrity verification run (`lib/integrity.ts` — `runIntegrityVerification`)

A DB-backed wrapper around the existing pure `verifyChainSegment` — genuinely low-risk, since
it wires already-tested verification logic to persistence rather than adding new verification
LOGIC of its own. A separate, related mechanism from seal verification (§23): this checks ANY
stream range on demand — sealed or not — matching the blueprint's own two separate tables
(`audit_seal_batch.verification_status` vs. `integrity_verification_run`).

`runIntegrityVerification(client, { streamId, fromSequenceNo, toSequenceNo })`:

1. `SELECT`s the `sec1.audit_event` rows for the range, ordered by `sequence_no`, including
   `canonical_format_version`.
2. Reconstructs `CanonicalEventFields` per row using THAT ROW'S OWN `canonical_format_version`
   (§22) — never a single formula applied uniformly across a mixed-version range.
3. Calls the existing pure `verifyChainSegment` (no duplicated gap/mismatch logic).
4. `INSERT`s one `sec1.integrity_verification_run` row: `result = pass ? 'pass' : 'fail'`,
   `gap_count = gapAt.length`, `mismatch_count = hashMismatchAt.length`,
   `findings = { gapAt, brokenLinkAt, hashMismatchAt }` (jsonb).
5. Returns the persisted row's fields.

**Read-only against `sec1.audit_event`** — only ever `SELECT`s from it; the sole write is the
single `INSERT` into `sec1.integrity_verification_run`. Proven directly
(`tests/integration/sec1-db.test.ts`, "sec1.audit_event is provably UNCHANGED by running
verification" — reads every row's `sequence_no`/`event_hash`/`previous_hash`/`classification`/
`retention_class`/`canonical_format_version` before and after running verification and asserts
byte-for-byte equality).

Proven: a clean range → persisted `result = 'pass'`; a range with a row deleted out-of-band →
`gap_count > 0`, `result = 'fail'`, `findings.gapAt` contains the exact sequence number; a
range with a tampered row → `mismatch_count > 0`, `result = 'fail'`,
`findings.hashMismatchAt` contains the exact sequence number; a mixed-version range (§22)
verifies clean end-to-end.

## 25. Internal routes — seal-batch verify + integrity verify-range

Two new routes, `routes/seals.ts` and `routes/integrity.ts` (split from `routes/internal.ts`
now that the surface is growing, mirroring how IAM-02 split routes by concern once it outgrew
one file), wired into `server.ts` alongside the existing `registerInternalRoutes`:

- `POST /internal/sec1/seal-batches/:seal_batch_id/verify`
- `POST /internal/sec1/integrity/verify-range` (body: `stream_id`, `from_sequence_no`,
  `to_sequence_no`, with `additionalProperties: false` and a `from_sequence_no <=
  to_sequence_no` check that fails closed with `VALIDATION_ERROR`)

Both are guarded by the **generic internal-identity guard** (`plugins/internal-identity.ts`,
`SEC1_INTERNAL_SERVICE_TOKEN`) — **NOT** the per-module source-identity-binding guard
(`plugins/source-identity.ts` is specifically for INGESTION attribution). This is Phase 3's
first actual use of the generic guard, which `config.ts`'s own header comment anticipated
("later phases' non-ingestion internal routes — seal, reconciliation, recovery — have it
ready"): seal verification and integrity-verification-run are SEC-01's OWN operational/
administrative actions, not attributable to a specific external source module. Both require
the standard `Idempotency-Key` header (fail closed 400 `IDEMPOTENCY_KEY_REQUIRED` if missing),
scoped with `sourceModule: "SEC-01"` (this is SEC-01's own action). No IAM-02 permission-guard
gating this phase, matching Phase 0-2's posture. Neither route exposes any search/export/list
surface — single-purpose trigger endpoints only.

Proven end-to-end via `app.inject` (`tests/integration/sec1-db.test.ts`): missing token → 401
`SERVICE_IDENTITY_REQUIRED`; a per-module INGEST token (the wrong guard's own secret) → 401
`SERVICE_IDENTITY_REQUIRED` (proving the two identity mechanisms are genuinely distinct, not
just documented as such); missing `Idempotency-Key` → 400; unknown `seal_batch_id` → 404;
`from_sequence_no > to_sequence_no` → 400 `VALIDATION_ERROR`; an unknown extra body field on
`verify-range` → 400 (schema `additionalProperties: false` genuinely rejects, not silently
strips); both routes succeed end-to-end with the generic internal-identity token.

## 26. External anchor stub (`lib/external-anchor.ts`) — interface only, zero call sites

`services/sec1/src/lib/external-anchor.ts` (new file) exports **only** the
`ExternalSealAnchorProvider` interface:

```ts
export interface ExternalSealAnchorProvider {
  anchorBatch(input: { sealBatchId: string; batchHash: string }): Promise<{
    externalAnchorRef: string;
    trustedTimestampRef: string;
    trustedTimestampUtc: string;
  }>;
}
```

**No implementation. No `NullAnchorProvider`. No default export. Zero call sites anywhere in
`services/sec1/src/**`** — proven STRUCTURALLY, not by absence of evidence, by
`tests/unit/sec1-external-anchor-boundary.test.ts`, which scans the entire `services/sec1/src`
tree for any import specifier containing `external-anchor` and asserts none exist, plus a
direct check that the file itself contains no `NullAnchorProvider`/`AnchorProvider`
class/const/function declaration (only prose explaining why none exists). Deliberately no
no-op stub either, even one obviously fake — a stub that "succeeds" with placeholder values
risks being accidentally wired into a real code path later and producing what LOOKS like a
genuine external anchor, exactly the "no fake external anchor" violation this phase must not
commit. This interface exists purely as a documented seam for a LATER, infrastructure-dependent
phase (real WORM/object-lock storage + a real trusted timestamp authority).

## 27. No scheduler/cron wiring this phase

Both new routes (`seal-batches/:id/verify`, `integrity/verify-range`) are callable **on
demand only**, via internal HTTP call — no scheduled job, cron, or automatic periodic trigger
exists anywhere in this codebase for either operation. This is a real, open gap flagged (not
silently dropped) by the Phase 3 plan §12 risk #3: the blueprint's own go-live checklist gate
implies a scheduled "integrity verification job," which remains future work.

## 28. Carry-forward status after Phase 3

- **L1 (closed this phase)** — see §22. `classification`/`retention_class` are now hash-bound
  for every v2+ row, via a versioned formula rather than an unversioned change, precisely to
  avoid reproducing F1's failure mode through a different mechanism.
- **L2 (unchanged, still deferred)** — `lib/redaction.ts`'s key-name-substring blocklist is
  untouched this phase, per the approved plan's explicit recommendation (value-level scanning
  is a cross-module DLP/classification decision, not SEC-01-specific).
- **Internal-only sealing remains explicitly non-authoritative** — every seal-related response
  (`sealBatch` unchanged, `verifySealBatch` new) carries the non-authoritative posture; this
  phase makes it explicit on the wire via `production_authoritative: false`, unconditionally.
- **WORM/TSA external anchoring** — interface-only stub, zero call sites, proven structurally
  (§26). No implementation exists, cannot exist accidentally.
- **No scheduler wiring** (§27) — both new routes are on-demand only.
- Everything else from §14/§18 (outbox consumer, clock-skew detection, source-emission-
  sequence continuity, event-schema management API, sensitive-read logging, search/export
  APIs, monitoring rules/alerts, IAM-02 registration of `sec1.*` protected actions, interim
  IAM-01/IAM-02 audit handoff/backfill, audit correction, retention/legal hold, recovery
  integrity verification, incident break-glass audit-read) remains deferred exactly as before,
  untouched by this phase.

## 29. Tests added (Phase 3)

- **Unit (no DB):** `tests/unit/sec1-canonical.test.ts` gained a new "canonical_format_version
  (L1) — hash versioning" describe block (8 new tests: format-version constants; the
  canonicalJson-undefined-filtering equivalence proof; a v1 reconstruction round-trips clean;
  a v2 reconstruction round-trips clean; tampering classification detected; tampering
  retention_class detected; v1 vs v2 hash genuinely differ for identical field values; omitted
  `event_category` still verifies clean — F1 regression unaffected). New file
  `tests/unit/sec1-external-anchor-boundary.test.ts` (3 tests: file exists; interface-only, no
  NullAnchorProvider/default-export declaration; zero import call sites anywhere in
  `services/sec1/src/**`).
- **Integration (DB-gated, `tests/integration/sec1-db.test.ts`, role_sec1_runtime via a real
  LOGIN role, same discipline as every existing test in this file):** new describe blocks —
  "Phase 3: canonical_format_version (L1) versioning" (7 tests), "Phase 3: integrity
  verification run" (4 tests), "Phase 3: seal verification" (3 tests), "Phase 3: internal
  routes — seal-batch verify + integrity verify-range" (10 tests), "Phase 3: grants (migration
  009)" (4 tests) — plus three PRE-EXISTING Phase 0-2 reconstruction sites (the "detects
  tampering" test and the two F1-fix-describe-block reconstructions) updated to be
  version-aware (see §22's regression note) so they keep passing under the new v2 hash
  formula.
- **Full regression:** 316/316 tests passing (278 baseline unregressed + 38 net new) in a
  single run against a genuinely fresh disposable Postgres.

## 30. Commands run (this Phase 3 verification pass)

```bash
# Fresh disposable Postgres
psql "postgres://postgres@localhost:5432/postgres" -c "CREATE DATABASE aix_sec1_p3_final_<ts>;"

export DATABASE_URL="postgres://postgres@localhost:5432/aix_sec1_p3_final_<ts>"
export SEC1_INGEST_TOKEN_FND01="test-fnd01-ingest-token-it"
export SEC1_INGEST_TOKEN_IAM01="test-iam01-ingest-token-it"
export SEC1_INGEST_TOKEN_IAM02="test-iam02-ingest-token-it"

npx node-pg-migrate -m infra/migrations --no-check-order up   # 001 -> 009, all clean

psql "$DATABASE_URL" -f infra/grants/fnd_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam2_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/sec1_runtime_grants.sql

npx tsc -b                                                     # clean, zero errors

export TEST_DATABASE_URL="$DATABASE_URL"
npx vitest run                                                 # 27 files, 316/316 passing, single run

# Cleanup
psql "postgres://postgres@localhost:5432/postgres" -c "DROP DATABASE aix_sec1_p3_final_<ts>;"
psql "postgres://postgres@localhost:5432/postgres" -c "DROP ROLE fnd_app_test;"
psql "postgres://postgres@localhost:5432/postgres" -c "DROP ROLE iam_app_test;"
psql "postgres://postgres@localhost:5432/postgres" -c "DROP ROLE iam2_app_test;"
psql "postgres://postgres@localhost:5432/postgres" -c "DROP ROLE sec1_app_test;"
```

**Bug found and fixed during this pass's own verification (self-review, before the final clean
run):** the first full-suite run against a fresh database surfaced 2 failing PRE-EXISTING
tests (the F1-fix describe block's two "verifies clean" assertions) — root-caused immediately
as the reconstruction-site regression described in §22 (those tests' `CanonicalEventFields`
reconstruction predated Phase 3 and omitted the now-hash-bound `classification`/
`retention_class`, so a real v2-ingested row's recomputed hash no longer matched its stored
hash). Fixed by making the three affected reconstruction sites version-aware; re-verified
clean on a genuinely fresh database afterward (the same "do not reuse a database across
multiple runs" discipline was followed for the FINAL clean run — the run used to catch this
bug was discarded, not reused, for the final report).

## 31. Confirmation: no out-of-scope module/feature code (Phase 3)

No CFG-01, CLT/KYC/AML/WLT, LED/DEP/WDR/TRD, E2E/REC/INC/PRT code was added. No Exchange
runtime route, order book, matching engine, market making, principal dealing, or AIX spread
markup code exists anywhere in `services/sec1` — re-proven by the same boot-time
`assertNoExchangeRuntime` guard plus the route-path string check (unchanged this phase). No
real WORM/object-lock, no real trusted timestamp authority, no `NullAnchorProvider` or any
other fake external anchor, no real SIEM/PagerDuty/Slack/email notification, no search/export,
no monitoring alert lifecycle, no expected-event reconciliation, no incident break-glass
audit-read, no protected-action registry dependency, no audit correction workflow, no
retention/legal hold, no recovery integrity verification, no scheduler/cron wiring — all
confirmed absent by direct code inspection and the tests in §29.

## 32. Next step (superseded by §33 below)

**SEC-01 Phase 3 is implemented and self-verified** (316/316 tests, fresh disposable Postgres,
single run, `tsc -b` clean). Ready for Sonnet self-review or Opus independent review, per the
standard build discipline this codebase has followed since FND-01.

---

## 33. P3-F1 gap patch — occurred_at_utc hash/reconstruction divergence closed (+ P3-L1, P3-L3)

**Root cause (confirmed by the Phase 3 Opus review,
`docs/SEC-01_Phase3_Security_Review_Opus_v0.1.md`, reproduced empirically against a live app +
DB before any code was written):** `lib/ingest.ts`'s `buildCanonicalFields` bound the caller's
RAW `occurred_at_utc` string into the canonical hash, while the INSERT also stored that same raw
string into a `timestamptz` column — but Postgres NORMALIZES a `timestamptz` on round-trip
(millisecond truncation, `Z`/offset canonicalization). `lib/integrity.ts`'s
`runIntegrityVerification` reconstructs canonical fields FROM THE STORED ROW via
`row.occurred_at_utc.toISOString()` — the normalized representation, not the raw string that was
hashed. Any caller format other than JS-millisecond ISO (the blueprint's own API sample
`"2026-01-01T00:00:00Z"`, a `+00:00` offset, or Postgres-native microsecond precision) therefore
recomputed a DIFFERENT hash than what was stored and reported a **false `hashMismatch`
(tamper)** on a perfectly untampered event. Identical failure class to the already-fixed F1
(`event_category`), in a different field — see §17.

**Fix (same resolve-once discipline as §17's F1 fix).** `occurred_at_utc` is now resolved
**once**, immediately alongside `resolvedEventCategory` in `ingestAuditEvent`:
```ts
const occurredAt = new Date(input.occurred_at_utc);
if (Number.isNaN(occurredAt.getTime())) {
  throw new Sec1Error("SEC1_AUDIT_EVENT_INVALID", {
    details: [{ field: "occurred_at_utc", issue: "not a parseable timestamp" }],
  });
}
const resolvedOccurredAtUtc = occurredAt.toISOString();
```
`resolvedOccurredAtUtc` is threaded into BOTH `buildCanonicalFields` (the hash) and the INSERT's
`occurred_at_utc` column — `buildCanonicalFields`'s signature now takes it as an explicit
parameter rather than reading `input.occurred_at_utc` internally, so the two call sites
structurally cannot diverge again. `new Date(...).toISOString()` only carries millisecond
precision, so the value written to the column is ALREADY at the same precision the hash was
computed over — there is no further precision loss on the DB round-trip for this to diverge on.
An unparseable `occurred_at_utc` now fails closed with `SEC1_AUDIT_EVENT_INVALID` (previously
this code was defined but unreachable — TypeBox only enforced a 1-64 char string, not a valid
date) rather than silently hashing/storing a garbage value.

**Existing-row compatibility.** No re-hash or migration of previously-ingested rows. Every row
ingested before this patch was hashed against whatever string the caller originally sent; that
hash remains valid for what was actually hashed at the time. This patch only changes what value
FUTURE ingests hash and store (both derived from the SAME `resolvedOccurredAtUtc`, so they agree
by construction going forward) and what value integrity verification reconstructs FROM those
future rows. A pre-patch row whose caller happened to use a non-`toISOString` format retains
whatever hash/verification behaviour it already had — this patch cannot retroactively change
what was already computed and stored.

**P3-L1 closed (same pass):** `routes/integrity.ts`'s `verify-range` now honours
`beginIdempotent`'s `"duplicate"` outcome — a retry with the SAME `Idempotency-Key` + SAME body
looks up and returns the ORIGINAL `integrity_verification_run` row (new
`lib/integrity.ts::getIntegrityVerificationRunById`) instead of calling
`runIntegrityVerification` again and inserting a second run row. Previously the route ignored
`beginIdempotent`'s return value entirely (same gap as Phase 2's routes), so a client retry after
e.g. a network timeout silently produced a duplicate append-only run record instead of replaying
the original response.

**P3-L3 closed (same pass):** `infra/grants/sec1_runtime_grants.sql`'s Phase 0-2 comment block on
`sec1.audit_seal_batch` (lines 27-31) asserted "nothing this stage ever updates ... a seal batch
row" — stale since the Phase 3 column-level `UPDATE (verification_status)` grant was added lower
in the same file. Comment now says the Phase 0-2 grant had no UPDATE and points to the Phase 3
grant section for what changed.

**P3-L2 (partial-range first-row inbound-link blind spot) — carried forward, not addressed this
pass**, per the task brief: `verifyChainSegment` still cannot check the first in-range row's
`previous_hash` against anything when a verification range starts mid-stream. Deferred to when
the verification job is productionized (per the Opus review's own recommendation), same
disposition as before this patch.

**Similar-field review (per the Opus review's own suggestion to check for the same failure
class elsewhere):**
- `metadata_redacted` (jsonb) — **no divergence risk found**. The hash binds
  `canonicalJson()` over the in-memory, already-parsed JS object (never the caller's raw JSON
  text), and `runIntegrityVerification` reconstructs by re-parsing the stored jsonb back into a
  JS object and running it through the SAME `canonicalJson()`. Both paths always go through
  JS's own number/string canonicalization, so jsonb's internal re-formatting of the stored text
  (key order, numeric literal spelling) cannot cause a divergence — unlike `occurred_at_utc`,
  there was never a "raw string vs DB-normalized string" mismatch here to begin with. Proven by
  a new test ingesting nested objects/arrays/numeric values (including a trailing-zero float)
  and confirming verify-range still passes.
- `source_emission_sequence` (bigint) — **no divergence risk found**. node-postgres returns
  `bigint` columns as strings specifically to avoid float precision loss, and
  `lib/integrity.ts` converts via `Number(...)`. Within `Number.MAX_SAFE_INTEGER` this
  round-trips exactly (proven by a new test at exactly that boundary). Beyond it, precision is
  already lost at the JSON-wire-parsing step (Fastify/TypeBox parse the caller's JSON body into
  a JS number before this code ever sees it) — a pre-existing, systemic JSON/JS-number ceiling
  that applies to any JSON API accepting large integers, not a divergence this patch introduces
  or could introduce by normalizing differently on one side vs the other. Out of scope to
  change (would require a wire-format change to accept the field as a string) — no hash/store
  divergence risk was found, so scope was not expanded per the task brief.
- No other `timestamptz` field is bound into the canonical hash (`ingested_at_utc` and
  `run_at_utc` are both server-generated `now()` values, never caller input and never hashed).

**Tests added** (`tests/integration/sec1-db.test.ts`, all through the real HTTP + DB path — ingest
via `POST /internal/sec1/audit-events`, verify via `POST /internal/sec1/integrity/verify-range`):
- "P3-F1 gap patch: occurred_at_utc hash/reconstruction normalization" (6 tests):
  1. Ingest with `"2026-01-01T00:00:00Z"` (the blueprint's own sample format) → verify-range
     `pass`, `mismatch_count: 0` (previously a FALSE `fail`).
  2. Ingest with `"2026-01-01T00:00:00+00:00"` → verify-range `pass` (previously a FALSE
     `fail`).
  3. Ingest with `"2026-01-01T00:00:00.123456Z"` (microsecond precision) → verify-range `pass`
     (previously a FALSE `fail`). **Policy chosen: accept and truncate to millisecond
     precision** (`new Date(...).toISOString()`), not reject — Postgres-native microsecond
     precision is a normal, legitimate input this control must handle, not an error condition.
  4. A genuinely tampered row (`result` flipped out-of-band after ingest with the blueprint
     sample format) still fails verify-range with `mismatch_count: 1` — proving the fix closed
     the false-positive without disabling true-positive tamper detection.
  4b. Tampering `occurred_at_utc` ITSELF (the exact field this patch normalizes, via
      `UPDATE ... SET occurred_at_utc = occurred_at_utc + interval '1 hour'`) still causes a
      `hashMismatch` — the field the patch touches is still covered by tamper detection, not
      exempted from it.
  5. An unparseable `occurred_at_utc` is rejected 400 `SEC1_AUDIT_EVENT_INVALID` at ingest
     (fail closed, not silently accepted).
- "P3-L1 gap patch: verify-range idempotent replay does not duplicate the run row" (1 test):
  6. Two `verify-range` calls with the SAME `Idempotency-Key` + SAME body return the SAME
     `verification_id`, and a direct `verifyPool` count confirms only ONE
     `sec1.integrity_verification_run` row exists for that `verification_id`.
- "Similar-field review: metadata_redacted / source_emission_sequence hash/reconstruction
  stability" (2 tests, see above).
- Remaining REQUIRED TESTS items (existing `new Date().toISOString()` case; v1 legacy row; v2
  row; `event_category` omitted; `classification`/`retention_class` tampering on v2) were
  already covered by pre-existing Phase 3 / F1 regression tests (§17, §22, §29) and were
  re-confirmed green by this pass rather than duplicated.

**Verification (fresh disposable Postgres, this patch, two independent runs):** `npx tsc -b`
clean; migrations 001→009 apply; all 4 grant files apply; **325/325 tests passing** (316
baseline unregressed + 9 new: 6 P3-F1 + 1 P3-L1 + 2 similar-field) in a single run each time.
Independently re-confirmed by direct `psql` inspection of the fresh database used for the final
run (not just the test framework's own assertions):
- The new `occurred_at_utc` rows show `2026-01-01 08:00:00+08` and `2026-01-01 08:00:00.123+08`
  (session timezone display of the correctly-normalized UTC values — microsecond input
  genuinely truncated to millisecond precision before storage).
- `source_emission_sequence = 9007199254740991` (`Number.MAX_SAFE_INTEGER`) round-tripped
  exactly through the `bigint` column.
- The nested `metadata_redacted` object round-tripped through jsonb byte-for-byte in value
  (key order aside, which `canonicalJson`'s own sort already normalizes).
- `sec1.integrity_verification_run` held exactly 18 rows for the final run — confirmed by a
  `GROUP BY (result, mismatch_count)` breakdown: 1 row `fail`/`mismatch_count=0` (the pre-existing
  sequence-gap test), 5 rows `fail`/`mismatch_count=1` (the five distinct genuine-tamper tests,
  including the new `occurred_at_utc`-tamper test), 12 rows `pass`/`mismatch_count=0` — arithmetic
  matches exactly, confirming the P3-L1 replay test's duplicate call did not add an extra row and
  every tamper test genuinely produced exactly one mismatch.

**SEC-01 Phase 3 is ready for Opus re-review** of P3-F1/P3-L1/P3-L3 closure. **Phase 4 remains
NO-GO** until that re-review accepts (per the Phase 3 review's §10 go/no-go).

## 34. Next step (superseded by §35 below)

**SEC-01 Phase 3, with the P3-F1 gap patch (+ P3-L1, P3-L3, similar-field review) applied, is
self-verified** (325/325 tests, fresh disposable Postgres, two independent runs, `tsc -b` clean,
migrations 001→009 + 4 grant files clean). Ready for the short Opus re-review of P3-F1/P3-L1/P3-L3
closure (same pattern as `IAM-02_Security_Review_Opus_v0.2_reverify.md`). Phase 4 is NO-GO until
that re-review accepts.

## 35. Opus re-review complete — SEC-01 Phase 3 ACCEPTED, Phase 4 GO

The independent Opus re-review (`docs/SEC-01_Phase3_Security_Review_Opus_v0.2_reverify.md`)
confirmed P3-F1/P3-L1/P3-L3 are CLOSED: `occurred_at_utc` hash/reconstruction now agree by
construction (post-patch reconstruction matches; the review independently confirmed the
pre-patch raw-string hash would NOT have), verify-range idempotent replay no longer duplicates
a run row, and the stale grant-file comment is corrected. 325/325 tests reproduced on a fresh
disposable Postgres; grant boundaries and the append-only posture on `sec1.audit_event`
re-verified under `SET ROLE`. P3-L2 (partial-range first-row inbound-link blind spot) remains a
tracked non-blocking carry-forward, deferred to when the verification job is productionized.

**SEC-01 Phase 0-3 is now an accepted implementation baseline. Phase 4 is GO.**

Rather than starting CFG-01 immediately, the next session continues SEC-01 into **Phase 4
planning** (read/search API surface over `sec1.audit_event`, sensitive-read evidence logging,
and IAM-02 permission-guard integration/registration of the `sec1.*` protected actions named in
`07_Permission_Rules.md` §2 — see §14/§18/§28 above for the full deferred-scope list Phase 4
draws from). CFG-01 Feature-Flag / Licence-Lock remains the module after SEC-01 Phase 4.

---

## 36. Phase 4 — implemented (audit read/search + sensitive-read logging + IAM-02 permission guard)

Phase 4 is implemented per `docs/implementation/SEC-01_Phase4_Implementation_Plan_v1.0.md`.
Scope: internal `POST /internal/sec1/audit-events/search` and `.../read` routes; an
IAM-02 permission-guard HTTP client (`lib/iam2-client.ts`); a cross-module additive migration
registering three new `iam2.permission` catalogue rows; tier-based read redaction
(`lib/read-redaction.ts`); parameterized search/detail query logic (`lib/read-query.ts`); and
sensitive-read evidence logging (`sec1.sensitive_read_log`, `lib/sensitive-read-log.ts`).
`tsc -b` clean; migrations 001→011 apply; all four grant files apply; **395/395 tests passing**
(325 baseline unregressed + 70 net new: 38 unit + 32 integration) on a fresh disposable
Postgres, single run, with an independent direct-`psql` re-verification of every grant/catalogue
claim below (not just the test framework's own assertions). See §41 for the exact commands.

## 37. Route shape — internal only, public `/sec1/*` deferred to PRT-01

Per the approved structural decision, Phase 4 does NOT build the blueprint's literal
`GET /sec1/audit-events` / `GET /sec1/audit-events/{audit_event_ref}` public surface. SEC-01 has
no session/cookie authentication mechanism of its own anywhere in the accepted codebase — every
route built through Phase 3 is either the per-module source-identity-binding guard (ingestion)
or the generic internal-identity guard (Phase 3's seal-verify/integrity-verify-range). Phase 4's
two new routes use the SAME generic internal-identity guard
(`plugins/internal-identity.ts`, `SEC1_INTERNAL_SERVICE_TOKEN`):

- `POST /internal/sec1/audit-events/search` — body-carried filters (POST, not GET — no existing
  internal route in this codebase is a body-bearing GET, and the filter set doesn't fit a clean
  query-string shape).
- `POST /internal/sec1/audit-events/read` — body `{ audit_event_ref }` OR
  `{ source_module, event_id }` (the table's own two unique constraints), not a path parameter.

`actor_id`/`session_id` are trusted request-body fields from an already-authenticated caller —
the EXACT SAME trust boundary IAM-02's own `POST /internal/iam2/permission/check` already uses
for its own `actor_id` field (`services/iam2/src/routes/internal.ts`). A future PRT-01/staff-
portal BFF is the intended caller; wiring an actual public/cookie-authenticated `/sec1/*`
surface is deferred to PRT-01 integration work, unblocked by anything in this phase.

## 38. IAM-02 permission guard integration (`lib/iam2-client.ts`)

Structurally identical to IAM-02's own `lib/iam01-client.ts` — SEC-01's side of the same
HTTP-only, never-import-the-other-service's-internals pattern (F3(c)). Wraps the ALREADY-
ACCEPTED `POST /internal/iam2/permission/check` (no IAM-02 code changed).

**Two independent checks per request, never one:**
1. **Baseline** (`sec1.audit_event.search` for search, `sec1.audit_event.read` for detail
   read) — a hard gate. Any non-`allow` decision (`deny`, `step_up_required`,
   `approval_required`, `licence_locked`, or IAM-02 being unreachable/erroring) is denied
   identically with `SEC1_UNAUTHORISED_AUDIT_READ` — EXCEPT a `reason` of
   `IAM2_PERMISSION_UNKNOWN` (the catalogue-registration gap IAM-02's own
   `guard.ts::lookupPermission` step-0 fail-closed check produces), which is surfaced as the
   more diagnostic `SEC1_IAM02_REGISTRY_MISSING` instead (SEC1-TC-079).
2. **Sensitive tier** (`sec1.audit_event.read_sensitive`) — does NOT gate the request. A
   non-`allow` here (including IAM-02 unavailable) simply means every row in the response is
   redacted at normal tier — fail-closed falls through to the SAFER tier automatically, with no
   special-case branch needed for "IAM-02 down during this specific check."

**Fail-closed discipline, proven exhaustively** (`tests/unit/sec1-iam2-client.test.ts`, 12
tests): explicit deny, step_up_required, approval_required, licence_locked,
`IAM2_PERMISSION_UNKNOWN`, non-2xx HTTP, malformed/missing `data.decision`, `success:false`,
network error, `res.json()` throwing, and an AbortError-shaped timeout — ALL resolve
`allowed:false`, never treated as a grant.

**Dependency injection for tests** (`Sec1Config.iam2FetchImpl`, mirroring
`Iam2Config.iam01FetchImpl` exactly): no live IAM-02 service is started anywhere in this phase's
test suite — the SAME precedent `tests/integration/iam2-db.test.ts` already set for its own
IAM-01 dependency (`makeFakeIam01Fetch`). Real IAM-02 code is exercised only where it matters
for THIS phase's own correctness claim: the `iam2.permission` catalogue rows migration 011
inserted are verified directly via `psql`/`verifyPool` against the REAL table, not a stub.

## 39. Cross-module permission catalogue registration (migration 011)

`infra/migrations/011_iam2_register_sec1_permissions.cjs` — additive only, inserts exactly
three `iam2.permission` rows:

| permission_code | resource | action | sensitivity | requires_step_up | requires_approval |
|---|---|---|---|---|---|
| `sec1.audit_event.search` | audit_event | search | normal | false | false |
| `sec1.audit_event.read` | audit_event | read | normal | false | false |
| `sec1.audit_event.read_sensitive` | audit_event | read_sensitive | sensitive | false | false |

**Judgment call — permission code naming resolved in favour of the blueprint over the task
brief's own shorthand.** `07_Permission_Rules.md` §2 (SEC-01's own accepted blueprint) names
these `sec1.audit_event.*` (`resource = "audit_event"`, matching the actual table name and
IAM-02's own existing resource-naming convention). The task brief's shorthand (`sec1.audit.*`)
was explicitly marked "suggested" and is NOT what was registered — flagged per this codebase's
"document a deviation, don't silently pick one" discipline.

**`requires_step_up`/`requires_approval` are both false for all three rows** —
`07_Permission_Rules.md` §4's Maker-Checker list item 1 ("Sensitive audit export") is scoped to
EXPORT, not READ; export is not registered by this migration at all (it does not exist as a
callable capability yet).

**No `iam2.role_permission` rows seeded** — migration 006's own bootstrap-role catalogue
comment already established this rule for this codebase: FR-003 requires role-permission
assignment to happen "only through approved workflow," so a raw seed INSERT here would violate
that rule for these permissions exactly as it would have for IAM-02's own provisional roles.
Test fixtures never needed real role grants — every Phase 4 test drives IAM-02's decision via
`iam2FetchImpl` (see §38), and the catalogue-row shape itself is verified directly against the
real table (`tests/integration/sec1-db.test.ts`, "IAM-02 permission catalogue registration
(migration 011)" describe block, independently re-confirmed via `psql` — see §41).

**No placeholder/reserved rows for later SEC-01 permissions** (`verify_integrity`,
`evidence_export`, `security_alert`, `monitoring_rule`, ...) — even though
`status = 'inactive'` would keep them unreachable by the guard, Phase 4 has no code path that
would reference them yet; a later phase adds its own additive migration when it needs them.

**No IAM-02 guard logic changed, no IAM-02 grant relaxed, no IAM-02 Phase 6/7 feature
built** — `services/iam2/src/lib/guard.ts` is byte-for-byte unchanged; `infra/grants/
iam2_runtime_grants.sql` is byte-for-byte unchanged; delegation/temporary-permissions/
steady-state-break-glass/SoD-risk-acceptance remain exactly as deferred as before this phase.

## 40. Sensitive-read logging (`sec1.sensitive_read_log`, `lib/sensitive-read-log.ts`)

`infra/migrations/010_sec1_sensitive_read_log.cjs` — additive, exact blueprint §2.10 column set
plus one load-bearing addition (`metadata jsonb`, safe non-sensitive context only — e.g.
`result_count` for a search — never the disclosed data itself). Append-only:
`GRANT SELECT, INSERT` only, no UPDATE/DELETE ever granted to `role_sec1_runtime` — same
enforced-by-absence-of-grant posture as `sec1.audit_event`.

**Trigger — a property of the EVENT, not the reader:** a row's sensitivity is
`sec1.event_schema.sensitive_read` (the existing, already-seeded per-event-type flag), joined in
at query time by `lib/read-query.ts` (no denormalization onto `audit_event`, no touching the
Phase 0-3 accepted ingestion/hash-chain path at all). A log entry is written when
`actorHasSensitiveTier && row.sensitive_read` is true for at least one row in the response —
computed PER ROW (a search mixing sensitive and non-sensitive event types redacts each row on
its own merits), but logged ONCE PER REQUEST (matching the `integrity_verification_run`
precedent of "one row per invocation," not one row per underlying event touched) — proven
directly (`tests/integration/sec1-db.test.ts`, "a search whose results include a sensitive event
writes exactly ONE log row for the whole request, not one per row").

**Fail-closed write ordering (SEC1-TC-038), proven against a REAL DB-level failure, not
simulated:** the log INSERT happens inside the SAME transaction as the read, BEFORE the
response returns. The test that proves this REVOKEs `INSERT` on `sec1.sensitive_read_log` from
`role_sec1_runtime` for the duration of one test (via the superuser `verifyPool`, restored in a
`finally` block even on assertion failure), confirms the read now fails with 503
`SEC1_SENSITIVE_READ_LOG_FAILED` and no `data` in the response, then re-GRANTs immediately after.

**Anti-recursion — resolved structurally, not by a runtime guard.** `sensitive_read_log` has NO
hash-chain columns (`stream_id`/`sequence_no`/`previous_hash`/`event_hash` — none exist on this
table) and is written by a plain, direct SQL INSERT, never by calling SEC-01's own
`POST /internal/sec1/audit-events` ingestion endpoint. There is therefore no code path where
reading audit events could itself produce a NEW `sec1.audit_event` row (which would in turn need
its own schema lookup, redaction, and read-authorization check) — proven directly
(`tests/integration/sec1-db.test.ts`, "no recursive audit ingestion — a sensitive read never
creates a new sec1.audit_event row," comparing the exact row count before/after).

**Normal (non-sensitive) reads are NOT logged to this table** — the blueprint's own rule 2 says
"sensitive reads are logged," not "all reads are logged"; a normal read's permission DECISION is
still recorded, but by the mechanism that already exists for exactly that purpose (IAM-02's own
`iam2.permission_decision_log`, written by every `evaluatePermission` call regardless of caller).

## 41. Redaction model (`lib/read-redaction.ts`)

Per `07_Permission_Rules.md` §6's table. Tier is computed PER ROW as
`actorHasSensitiveTier && row.sensitive_read`, never a single global decision for the whole
response.

- **Hash-chain/integrity internals are omitted at BOTH tiers** (`event_hash`, `previous_hash`,
  `sequence_no`, `stream_id`, `ingest_payload_hash`, `canonical_format_version`,
  `seal_batch_id`, `external_anchor_ref`, `trusted_timestamp_ref`, `clock_skew_*`, `backfilled`,
  `integrity_from`) — `lib/read-query.ts`'s `SELECT` never even fetches these columns, so there
  is no field to accidentally leak; that surface belongs to the separate, still-deferred
  `sec1.audit_event.verify_integrity` permission/route.
- **`client_id`** — redacted (`null`) at normal tier UNLESS the request was already scoped to
  that exact `client_id` (a search filter or an implicit single-event scope); always visible at
  sensitive tier.
- **`session_id`/`request_id`/`correlation_id`/`metadata_redacted`** — OMITTED (key absent, not
  `null`) at normal tier, so a caller cannot distinguish "redacted" from "genuinely absent" from
  the response shape; present at sensitive tier.
- **`actor_user_id`** — visible at BOTH tiers this phase (flagged explicitly, not silently
  assumed): the blueprint's own table says "visible if permitted," but this codebase has no
  finer per-actor-ownership/scoping model for SEC-01 reads than the tier itself yet.
- **Even at sensitive tier, `metadata_redacted` is always the ingest-time-already-safe form,
  never a raw payload** — SEC-01 never persists a pre-redaction payload for a sensitive-tier
  grant to "unlock" (proven directly: a fixture event ingested with a `password` metadata key
  reads back as `metadata_redacted.password === "[REDACTED]"` at sensitive tier, and the raw
  value string is asserted absent from the full JSON response).

## 42. Query model (`lib/read-query.ts`)

- **Parameterized SQL only, whitelisted filter columns** (`source_module`, `event_type`,
  `severity`, `result`, `actor_user_id`, `client_id`, `entity_type`, `entity_id`,
  `occurred_at_from/to`, `ingested_at_from/to`, `correlation_id`, `request_id`) — every filter
  value is bound positionally (`$1`, `$2`, ...), never string-interpolated into SQL text.
  SQL-injection-shaped filter values proven inert at BOTH the unit level (a fake `PoolClient`
  captures the exact SQL text and asserts the malicious string never appears in it) and the
  integration level (a real Postgres table survives an injection-shaped `event_type` filter,
  returns zero rows, and is confirmed still intact via a direct `psql` count afterward).
- **Deterministic keyset pagination, never `OFFSET`** — `ORDER BY ingested_at_utc DESC,
  audit_event_ref DESC`, cursor = an opaque base64url-encoded `{ingested_at_utc,
  audit_event_ref}` pair, compared via a Postgres row-value comparison
  (`(ae.ingested_at_utc, ae.audit_event_ref) < ($1, $2)`) — stays correct under concurrent
  ingestion, unlike `OFFSET`, which can silently skip or duplicate rows. `limit` is capped at
  `MAX_SEARCH_LIMIT = 200` (TypeBox's own wire-schema `maximum` rejects an out-of-range value
  outright, 400, before the query layer is even reached).
- **Strict date parsing** on all four date filters — `new Date(...)`, rejected
  (`VALIDATION_ERROR`) if unparseable, the identical discipline the P3-F1 fix already applies to
  `occurred_at_utc` on the ingest side.
- **`sec1.event_schema` is INNER JOINed on `event_type`** to resolve `sensitive_read` — safe
  because ingestion never accepts an `event_type` without a matching `event_schema` row, and
  schema rows are never deleted, only deactivated (a status-inactive schema row still joins,
  deliberately, so an event ingested under a since-deactivated type remains readable).
- **Detail read accepts either `audit_event_ref` OR `(source_module, event_id)`** — both are
  already-unique lookup keys on `sec1.audit_event` (no new index needed).
- **Read-only** — `lib/read-query.ts` issues `SELECT` statements only; it never mutates
  `sec1.audit_event` or `sec1.event_schema`.

## 43. Authorization ordering — 404-after-authz, never before

The baseline IAM-02 check runs, and is enforced, BEFORE any database query for both routes. For
the detail-read route specifically: an unauthorized caller gets the IDENTICAL
`SEC1_UNAUTHORISED_AUDIT_READ` / 403 response whether the referenced `audit_event_ref` exists or
not — proven directly by injecting both a real ref and a fabricated one under a denying
`iam2FetchImpl` and asserting identical status/error codes. A `NOT_FOUND` / 404 is only ever
reachable AFTER the baseline check has already resolved `allow`.

## 44. Tests added (Phase 4)

- **Unit (no DB, 38 new tests):** `tests/unit/sec1-iam2-client.test.ts` (12 — every fail-closed
  branch enumerated in §38, plus the allow path and optional-field forwarding);
  `tests/unit/sec1-read-redaction.test.ts` (7 — both tiers, client_id scoping, hash-chain-field
  absence, cross-tier field parity); `tests/unit/sec1-read-query.test.ts` (19 — parameterization,
  SQL-injection inertness, whitelist columns, the event_schema join, limit capping, keyset
  cursor mechanics, cursor encode/decode round-trip and malformed-cursor rejection, date
  validation, both detail-lookup keys, VALIDATION_ERROR when neither is supplied). The existing
  `tests/unit/sec1-import-boundary.test.ts` scans the entire `services/sec1/src` tree and
  automatically covers every new file — re-confirmed green with zero changes needed to that test
  itself.
- **Integration (DB-gated, `tests/integration/sec1-db.test.ts`, `role_sec1_runtime` via the
  same real LOGIN role this file has used since Phase 0-2; 32 new tests across seven describe
  blocks under "Phase 4: audit read/search + sensitive-read logging + IAM-02 permission guard"):**
  permission-guard integration (6 — allow/deny/unavailable/malformed/sensitive-denied/
  sensitive-allowed, all through `config.iam2FetchImpl`); authorization ordering (2 —
  §43); sensitive-read logging (6 — §40, including the real REVOKE/GRANT fail-closed proof and
  the no-recursion row-count proof); redaction (3 — §41, including the real ingested-secret
  round-trip); query (7 — §42, including the real-Postgres injection-inertness proof and a
  real two-page keyset-pagination round-trip); grants (5 — sensitive_read_log SELECT/INSERT
  granted, UPDATE/DELETE denied, no leak to fnd/iam/iam2 roles, `audit_event` append-only
  posture re-confirmed unchanged, no new grant into `iam2.*`); IAM-02 permission catalogue
  registration (3 — §39, against the REAL `iam2.permission` table, not a stub).
- **Full regression:** 325 baseline (unregressed) + 70 new = **395/395 tests passing**, fresh
  disposable Postgres, single run. See §45 for the exact commands and the independent
  direct-`psql` re-verification performed on top of the test framework's own assertions.

## 45. Commands run (this Phase 4 verification pass)

```bash
# Fresh disposable Postgres
psql "postgres://postgres@localhost:5432/postgres" -c "CREATE DATABASE aix_sec1_p4_final_<ts>;"

export DATABASE_URL="postgres://postgres@localhost:5432/aix_sec1_p4_final_<ts>"
export SEC1_INGEST_TOKEN_FND01="test-fnd01-ingest-token-it"
export SEC1_INGEST_TOKEN_IAM01="test-iam01-ingest-token-it"
export SEC1_INGEST_TOKEN_IAM02="test-iam02-ingest-token-it"

npx node-pg-migrate -m infra/migrations --no-check-order up   # 001 -> 011, all clean

psql "$DATABASE_URL" -f infra/grants/fnd_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam2_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/sec1_runtime_grants.sql

npx tsc -b                                                     # clean, zero errors

export TEST_DATABASE_URL="$DATABASE_URL"
npx vitest run                                                 # 30 files, 395/395 passing, single run

# Independent direct-psql re-verification (not just the test framework's own assertions):
#   - the 3 iam2.permission rows: correct resource/action/sensitivity/flags/status/owner_module
#   - sec1.sensitive_read_log column shape matches the migration exactly
#   - role_sec1_runtime: SELECT+INSERT yes, UPDATE+DELETE no, on sensitive_read_log
#   - role_sec1_runtime: still zero privilege on iam2.permission
#   - role_iam2_runtime / role_iam_runtime / role_fnd_runtime: zero privilege on sensitive_read_log
#   - sensitive_read_log genuinely populated by the real test run (8 rows: 5 read + 3 search)

# Cleanup
psql "postgres://postgres@localhost:5432/postgres" -c "DROP DATABASE aix_sec1_p4_final_<ts>;"
psql "postgres://postgres@localhost:5432/postgres" -c "DROP ROLE fnd_app_test;"
psql "postgres://postgres@localhost:5432/postgres" -c "DROP ROLE iam_app_test;"
psql "postgres://postgres@localhost:5432/postgres" -c "DROP ROLE iam2_app_test;"
psql "postgres://postgres@localhost:5432/postgres" -c "DROP ROLE sec1_app_test;"
```

**Bug caught and fixed during this pass's own verification (test-design bug, not a product-code
bug):** the first draft of the SQL-injection integration test used the `source_module` filter
(wire-schema `maxLength: 16`) for a >16-character malicious string — TypeBox correctly rejected
it with 400 `VALIDATION_ERROR` before the query layer was ever reached, which is a genuine
defense-in-depth result but not what that specific test needed to prove (that the QUERY layer
itself is injection-safe). Fixed by switching to the `event_type` filter (`maxLength: 128`), so
the malicious string reaches `lib/read-query.ts` intact and the test genuinely exercises
parameterization end-to-end. Re-verified clean on a second genuinely fresh database (the
"do not reuse a database across multiple test runs" discipline followed for the final report,
same as every prior phase).

## 46. Deferred items (unchanged scope confirmation)

Explicitly NOT built by Phase 4, exactly as scoped: evidence export (`sec1.evidence_export`, the
export/download API surface), `sec1.audit_event.verify_integrity` staff-facing route (the
existing internal `verify-range`/seal-verify operational routes from Phase 3 remain the only way
to trigger integrity verification), security alert lifecycle, monitoring rules, real
SIEM/PagerDuty/Slack/email notification, real WORM/object-lock, trusted timestamp authority,
scheduler/cron, audit correction, retention/legal hold, incident break-glass audit-read,
expected-event reconciliation, `interim_audit_handoff`, a public/session-authenticated `/sec1/*`
surface (deferred to PRT-01 integration — §37), IAM-02 Phase 6/7 (delegation, temporary
permissions, steady-state break-glass, SoD risk acceptance — untouched, migration 011 registers
catalogue rows only), CFG-01, any business-tier module, and any Exchange runtime feature (order
book, matching engine, market making, principal dealing, AIX spread markup) — re-confirmed
absent by the unchanged boot-time `assertNoExchangeRuntime` guard and route-path check.
Carry-forwards from earlier phases (P3-L2, L2 metadata-redaction key-name-substring model,
`computeIngestPayloadHash` raw-input retry-formatting caveat) are unchanged and untouched by
this phase.

## 47. Sonnet self-review (before Opus) — two gaps found and closed, one style nit noted

A dedicated self-review pass was run against the actual committed files (not from memory),
reading `packages/foundation/src/db.ts`'s real `withTransaction` implementation to confirm the
BEGIN/fn/COMMIT-or-ROLLBACK contract the fail-closed logging guarantee (§40) depends on, then
re-reading `routes/read.ts`, `lib/iam2-client.ts`, `lib/read-redaction.ts`, `lib/read-query.ts`,
`lib/sensitive-read-log.ts`, both new migrations, the grants diff, and `config.ts` line by line.
Two real gaps were found and fixed; nothing found rose to a security-bypass level.

1. **Gap (code): `entityId` was not passed to the baseline permission check on the
   `(source_module, event_id)` detail-read lookup path** — only the `audit_event_ref` path set
   it. Not a security bug (`entityId` is context-only for IAM-02's own decision log this stage,
   never used for the allow/deny decision — `guard.ts`'s own header comment), but it meant
   `iam2.permission_decision_log` lost which event was actually being accessed whenever a
   caller used the alternative lookup key. **Fixed**: `routes/read.ts` now resolves
   `requestedEntityId = body.audit_event_ref ?? body.event_id` once and passes it on the
   baseline check regardless of which lookup key was supplied.
2. **Gap (test coverage): SEC1-TC-079 (`sec1.audit_event.*` not yet registered in IAM-02's
   catalogue → `SEC1_IAM02_REGISTRY_MISSING`) was only proven at the `lib/iam2-client.ts` unit
   level** (that the CLIENT correctly surfaces IAM-02's raw `IAM2_PERMISSION_UNKNOWN` reason
   string verbatim) — there was no test proving `routes/read.ts`'s `denyUnlessAllowed` actually
   translates that reason into the distinct `SEC1_IAM02_REGISTRY_MISSING` code (vs. the generic
   `SEC1_UNAUTHORISED_AUDIT_READ`) at the real HTTP-route level, for EITHER route. **Fixed**:
   added an integration test driving both `/audit-events/search` and `/audit-events/read`
   through a stubbed IAM-02 response of `{decision:"deny", reason:"IAM2_PERMISSION_UNKNOWN"}`
   and asserting 503 `SEC1_IAM02_REGISTRY_MISSING` on both.
3. **Test coverage gap (defensive, not a required scenario): the `SEC1_SENSITIVE_READ_LOG_FAILED`
   fail-closed proof (§40, the real `REVOKE INSERT` test) only covered the detail-read route,
   not search** — both routes call the exact same `writeSensitiveReadLog` inside the same
   `withTransaction` shape, so the risk of a code-path-specific bug was low, but the task
   brief's own test list named this generically ("sensitive_read_log failure blocks response"),
   not route-specifically. **Closed for completeness**: added the equivalent
   REVOKE/GRANT-bracketed test for the search route.

**Not changed (reviewed and judged sound, not a bug):** the "two IAM-02 round-trips per request"
design (baseline + sensitive-tier, always both) is a deliberate, already-documented tradeoff
(§38), not a defect; `getAuditEventDetail` not filtering on `audit_event.status` (`active`/
`corrected`/`archived`) is intentional — an audit trail should remain readable regardless of
correction/archival state; `decodeCursor`'s malformed-input handling was traced through
`Buffer.from(..., "base64url")` (Node's lenient decoder) into `JSON.parse` (which does throw)
and confirmed to fail closed correctly, matching its own passing test.

**Re-verified after both fixes**: `tsc -b` clean; fresh disposable Postgres; migrations
001→011 + all 4 grant files clean; **397/397 tests passing** (395 + 2 new) in a single run.

## 48. Next step (superseded by §50 below)

**SEC-01 Phase 4 is implemented, self-reviewed, and self-verified** (397/397 tests, fresh
disposable Postgres, `tsc -b` clean, migrations 001→011 + 4 grant files clean, independent
direct-`psql` re-verification of every grant/catalogue claim, one round of self-review with two
real gaps found and closed — see §47). Ready for Opus independent security/compliance review,
per the standard build discipline this codebase has followed since FND-01.

---

## 49. Opus independent review — ACCEPT WITH MINOR CONDITIONS; F-1 gap patch

The independent Opus review verdict was **ACCEPT WITH MINOR CONDITIONS**. The IAM-02 guard
integration, fail-closed read posture, sensitive-read logging, append-only grants, cross-module
catalogue registration, and out-of-scope/licence posture were all found sound and independently
re-verified (fresh disposable Postgres, 397/397, grant boundaries reproduced under real
`SET ROLE` DML — not just catalog metadata). One blocking-to-Phase-5 finding, **F-1 (Medium)**,
was raised and empirically reproduced before any code was written.

**F-1 root cause:** `lib/read-query.ts`'s keyset-pagination cursor carried `ingested_at_utc` as
a JS `Date`-derived ISO string (`Date.toISOString()`, millisecond precision), but
`sec1.audit_event.ingested_at_utc` is `timestamptz` (microsecond precision, matching Postgres's
own internal resolution). The boundary comparison `(ingested_at_utc, audit_event_ref) <
(cursor_ts, cursor_ref)` therefore excluded same-millisecond rows whose microseconds fell
between the truncated cursor value and the true boundary — a silent, no-error omission from the
result set. The Opus review reproduced this directly: three rows in one millisecond bucket
(`.123000`/`.123400`/`.123800`); after a page ending on `.123800`, the `.123400` row vanished
from the ENTIRE paginated result, with only `.123000` reappearing on the next page. An audit/
investigation search silently dropping matching events, with no error surfaced, is a genuine
completeness defect for this module's purpose — masked by all 397 prior tests because per-
millisecond row density in the test fixtures was low.

**F-1 gap patch (this pass).** The root problem was that `ingested_at_utc` could never survive
a round-trip through a JS `Date` without losing precision (`Date` has no microsecond field —
this is a JS language limitation, not a bug in `toIso()`'s formula). The fix therefore avoids
that round-trip entirely for the CURSOR (the response body's display field is untouched — the
bug was only ever in the pagination boundary, never in what a client sees):

- `SELECT_COLUMNS` (`lib/read-query.ts`) gained a new projected column,
  `to_char(ae.ingested_at_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS
  ingested_at_utc_cursor` — a FULL-MICROSECOND-PRECISION text string rendered by Postgres
  itself, never touching a JS `Date`. (`AT TIME ZONE 'UTC'` makes the rendering independent of
  session timezone configuration.)
- `nextCursor` is now built from `ingested_at_utc_cursor` (the raw `RawRow`, pre-redaction),
  never from `toIso(row.ingested_at_utc)` — the previous, lossy source.
- The boundary comparison casts the incoming cursor value back explicitly:
  `(ae.ingested_at_utc, ae.audit_event_ref) < ($1::timestamptz, $2)`. This is a LOSSLESS
  round-trip specifically because Postgres itself stores no finer than microsecond precision —
  the text form can carry everything the column could ever hold.
- `SearchCursor.ingested_at_utc`'s own doc comment was updated to state the new precision
  contract, so a future reader cannot silently reintroduce a `Date`-derived value here.
- The response body's own `ingested_at_utc` display field (`RedactableAuditEventRow`,
  `toRedactableRow`/`toIso`) is UNCHANGED — millisecond precision there was never the bug and
  remains the same shape as before this patch; only the internal pagination boundary changed.

**No other Phase 4 behaviour touched:** authorization-before-existence ordering, redaction
tiers, `sensitive_read_log` fail-closed logging, IAM-02 fail-closed checks, filter whitelisting,
parameterization, and the `limit` cap are all byte-for-byte unchanged — confirmed by every
pre-existing Phase 4 test passing unmodified (only the two tests that asserted the OLD lossy
cursor SQL shape needed a one-line update to expect the new `::timestamptz` cast).

**Tests added:**
- `tests/unit/sec1-read-query.test.ts` (2 new): the SELECT text now includes the `to_char(...)`
  cursor column; `nextCursor` is proven to come from `ingested_at_utc_cursor` specifically (a
  fake-client test where the Date-typed field is identical across three rows but the precise
  text field differs, so only a correct implementation can produce the right `nextCursor`).
- `tests/integration/sec1-db.test.ts` (2 new, real Postgres, real HTTP route):
  1. **The exact Opus reproduction shape**, closed: three rows inserted directly at
     `.123800`/`.123400`/`.123000` in one millisecond bucket (far-future `ingested_at_utc` + a
     per-test-unique `entity_type` filter so the fixture is isolated from the hundreds of other
     rows earlier tests in this suite have already inserted), then paged with `limit: 1` three
     times: page 1 = `.123800` row, page 2 = `.123400` row (the one F-1 dropped), page 3 =
     `.123000` row, and `next_cursor` is `null` after the 3rd page (no duplicates, no phantom
     4th page).
  2. **Cursor stability when two rows share the EXACT same `ingested_at_utc`** — both returned,
     ordered by the `audit_event_ref DESC` tiebreaker, proving the fix didn't accidentally
     collapse or hide genuinely-identical-timestamp rows.
- Independently re-confirmed via direct `psql` (not just the test framework's own assertions):
  a fresh 3-row fixture at the exact Opus-reported microsecond values, reading the RAW
  `to_char(...)` text Postgres renders, then running the boundary query by hand with that exact
  cursor text cast to `timestamptz` — the previously-dropped `.123400` row is now present in the
  result.

**Verification (fresh disposable Postgres, this patch, two independent runs):** `npx tsc -b`
clean; migrations 001→011 apply; all 4 grant files apply; **401/401 tests passing** (397
baseline unregressed + 4 new: 2 unit + 2 integration) in a single run each time.

**Bug found and fixed during this pass's own verification (test-design bug, not a product-code
bug):** the first draft of the "same-millisecond rows all returned" integration test dated its
fixture rows in the past (`2026-06-01`), which — since ordering is `ingested_at_utc DESC` and
every OTHER fixture in this large, cumulative test file is inserted with `now()` (mid-2026) —
meant the 3 test rows would sort BEHIND hundreds of pre-existing rows, making them unreachable
within any reasonable page-count budget; separately, a companion tiebreaker test used
`limit: 1000`, exceeding the route's own `maximum: MAX_SEARCH_LIMIT` (200) wire-schema cap,
which would have failed with `VALIDATION_ERROR` before ever reaching the code under test. Both
fixed: fixture rows now use a far-future `ingested_at_utc` (sorts first, deterministically) plus
a per-test-unique `entity_type` filter (isolates the fixture from all other rows in the shared
test database), and the tiebreaker test's limit was reduced to a schema-valid value. A third,
smaller issue (passing `cursor: null` explicitly to the wire schema, which only accepts a string
or an absent field, not `null`) was caught the same way and fixed by omitting the field instead.
None of the three were product-code defects — all were artifacts of the test fixtures'
assumptions about the shared test database's accumulated state, caught by this pass's own
verification before being reported, in the same transparency spirit as every prior phase's
"bugs found during this pass's own verification" section.

## 50. Next step

**SEC-01 Phase 4, with the F-1 gap patch applied, is an ACCEPTED implementation baseline.** The
short independent Opus re-review of the F-1 closure returned **F-1 CLOSED — SEC-01 Phase 4
ACCEPTED**: it independently reproduced the fix on a fresh disposable Postgres (401/401 tests,
migrations 001→011 + 4 grant files clean), directly confirmed the load-bearing lossless-round-trip
property (`to_char(...'US'...)::timestamptz = ingested_at_utc` exact for every row), reproduced the
previously-dropped `.123400` row now correctly returned on page 2, verified the pre-patch
ms-cursor genuinely WOULD have dropped it (so the regression tests discriminate fixed-from-broken),
and confirmed timezone-independence of the `AT TIME ZONE 'UTC'` render under a non-UTC session
timezone. One informational, non-blocking observation was noted (a structurally-valid cursor
carrying an unparseable timestamp produces a DB cast error rather than a clean 400 — identical to
pre-patch behaviour, fails closed, applies only to a client misusing an opaque server-issued
cursor). **Verdict: GO for SEC-01 Phase 5 planning**, carrying F-2…F-6 forward as non-blocking
conditions.

**Carry-forward, unchanged by this patch (from the Opus review, non-blocking):**
- **F-2** — confirm the sensitive-read-logging POLICY for normal-tier access to a
  `sensitive_read=true` event (only sensitive-TIER disclosure is logged today; a normal-tier
  reader sees a sensitive event's base fields with no log entry — a defensible reading of
  "sensitive reads are logged" but flagged for explicit compliance/product-owner confirmation).
- **F-3** — no finer object-level/client-scoped read authorization than the coarse
  `sec1.audit_event.search`/`.read` grant exists yet; `actor_user_id` is visible at both tiers
  and `client_id` is only redacted, not filtered, at normal tier.
- **F-4** — `reason`/purpose-of-access is optional, not mandatory, for a sensitive-tier read.
- **F-5** — the interim shared `SEC1_INTERNAL_SERVICE_TOKEN` + trusted-`actor_id` model is the
  sole security anchor of the whole read surface (same class of carry-forward as IAM-02's own
  L3 interim shared-internal-token trust model) — must be replaced by a real service-identity
  model before any less-trusted caller (e.g. a public/PRT-01 front end) is placed in front of
  these routes.
- **F-6** — `search_scope_hash` records a hash of the query filters, not the exact set of
  events actually disclosed; a reviewer cannot reconstruct precisely which events a user saw
  without re-running a (possibly since-changed) query. A limitation of the blueprint's own
  §2.10 schema, not an implementation defect.
- Pre-existing, unrelated to Phase 4: **P3-L2** (partial-range first-row inbound-link blind
  spot), **L2** (metadata redaction remains a key-name-substring blocklist, not value-level
  scanning), and the **`computeIngestPayloadHash`** raw-input retry-formatting caveat (retries
  must reuse identical payload formatting for the idempotency dedup to recognise them as the
  same submission).

---

## 51. Phase 5 — implemented (security monitoring rule engine + alert lifecycle + monitoring dead-letter)

Phase 5 is implemented per the approved implementation brief (P0 alerting slice). Scope:
`sec1.security_monitoring_rule`/`monitoring_dead_letter`/`security_alert`/`alert_triage_note`
(migration 012, sec1 schema); a threshold/count-window rule evaluator
(`lib/monitoring-rules.ts`) run **after** the ingest transaction commits, never inside it;
alert creation from the rule engine AND from the Phase 3 integrity/seal verification-failure
paths (closing the `failed -> alert_created` state-machine transition, `06_State_Machine.md`
§4); an alert lifecycle (`lib/alerts.ts`, `routes/alerts.ts`: search/read/assign/triage/close);
IAM-02 permission-guard integration for `sec1.security_alert.read`/`.triage`/`.close`
(migration 013, iam2 schema); a Critical-severity closure model requiring an IAM-02
approval/decision-token binding, verified via IAM-02's **existing** generic execute-verify
endpoint (`lib/iam2-client.ts::verifyDecisionToken`) — no IAM-02 code changed. `tsc -b` clean;
migrations 001→013 apply; all four grant files apply; **469/469 tests passing** (401 baseline
unregressed + 68 net new: 47 unit + 21 integration) on a fresh disposable Postgres, two
independent runs.

## 52. Migration 012 — the 4 Phase 5 tables + a deliberate grant-posture departure

`infra/migrations/012_sec1_monitoring_alerts.cjs` — additive only, exact blueprint
§2.5-2.8 column sets, plus 3 migration-seeded P0 rules (see §54).

**`pgm.sql()` gotcha found during this pass's own verification (test-design/tooling bug, not a
product-code bug):** the first draft of the seed-rule INSERT used `pgm.sql(sqlText, params)`
as if it were `pg`'s own `client.query(sql, params)` (positional `$1` binding) — but
`node-pg-migrate`'s `pgm.sql()` does `{name}`-token *string* substitution, not positional
parameter binding, and threw `Invalid regular expression: /{0}/g: Nothing to repeat` at
migration-run time. Fixed by embedding the seed values via JS template-literal interpolation
with explicit single-quote-doubling escaping (`sqlString`/`sqlJsonb` helpers), the same
convention migration 008's own seed data already used (its own values simply never happened to
contain a quote, so the escaping need was latent, not previously exercised). Caught immediately
on the first real migration-run attempt, before any test ran against it.

**Grant posture — the first genuinely mutable table in this schema.** `sec1.audit_event` /
`sensitive_read_log` / `integrity_verification_run` are strictly append-only (no UPDATE grant,
ever). `sec1.security_alert` is different: `status`/`assigned_to`/`closed_at_utc`/
`closure_reason`/`closure_evidence_ref` legitimately change over its
open→assigned→triaged→{closed,escalated} lifecycle — the same class of table as
`sec1.audit_stream` (SELECT/INSERT/UPDATE, no DELETE), not the same class as `audit_event`. The
append-only EVIDENCE trail for what happened to an alert lives in `alert_triage_note` (one new
row per triage action, never edited) and in the underlying `audit_event`/`sensitive_read_log`
rows an alert references. `monitoring_dead_letter` gets the same SELECT/INSERT/UPDATE posture
(retry_count/status/next_retry_at_utc/failure_reason mutate on replay).
`security_monitoring_rule` is SELECT-only — migration-seeded, no rule-management API this
phase (mirrors `event_schema`'s own Phase 0-2 posture).

## 53. Migration 013 — IAM-02 alert permission registration, same shape as migration 011

`infra/migrations/013_iam2_register_sec1_alert_permissions.cjs` registers exactly 3 rows:
`sec1.security_alert.read`/`.triage`/`.close`, all `requires_step_up = false`,
`requires_approval = false`, `owner_module = 'SEC-01'`. No `iam2.role_permission` seeded (same
FR-003 "approved-workflow-only assignment" rule migration 006/011 already established). No
IAM-02 guard/grant change.

**`requires_approval = false` on `.close` is deliberate, not an oversight** — see §55 for why.

## 54. Rule engine (`lib/monitoring-rules.ts`) — threshold/count-window only

**Trigger point — after commit, never inside the ingest transaction.** `routes/internal.ts`
calls `evaluateRulesForEvent` AFTER `withTransaction(...ingestAuditEvent...)` has already
resolved (both the single-event and batch routes; skipped on a replayed event, since a replay
creates no new row for a count-window rule to newly count). This is a hard design constraint:
monitoring must never be able to slow down, block, or roll back the hash-chain write path
Phases 0-3 already proved race-safe.

**Fail-open for monitoring, fail-closed for ingestion.** `evaluateRulesForEvent` is
structurally unable to throw back to the ingest route: the rule-lookup query and each
individual rule's evaluation each run inside their OWN `try`/`catch`, dead-lettering
(`sec1.monitoring_dead_letter`) on failure with the FAILING rule's own severity (a Critical
rule's evaluation failure is itself flagged Critical — FR-032's starting point) — a malformed
`condition`/`threshold` never aborts evaluation of the OTHER rules and never touches the
already-committed `audit_event` row. Proven directly (integration suite): a rule with a
non-numeric `threshold.count` writes exactly one dead-letter row, and the triggering ingest
still returns 200 with its `audit_event` row intact.

**Rule shape:** `event_type_filter` (jsonb array), `condition` (`{ scope_column?:
"actor_user_id"|"client_id", action?: string, result?: string }` — `action`/`result` are
optional exact-match narrowing filters layered on top of `event_type_filter`, needed because
the only ingestible event types in this codebase today are the 4 generic catch-all rows
migration 008 seeded), `threshold` (`{ count, window_seconds }`), `severity` (the ALERT's
severity if triggered, not the event's own severity).

**De-duplication:** an alert fires once per `(rule_id, scope value)` while one is still OPEN
(`status <> 'closed'`) — a burst of matching events does not flood the alert table; a new
alert becomes possible only after the existing one closes. Proven directly: 6 matching events
against a 5-count threshold produce exactly 1 alert, not 2.

**Anti-recursion — resolved structurally, not by a runtime guard**, same class of design as
Phase 4's `sensitive_read_log`: none of the 4 new tables are hash-chained, and none are written
via SEC-01's own ingestion endpoint (SEC-01 has no ingestion token for itself). Proven directly:
firing the count=1 SoD-conflict rule (which creates an alert) leaves exactly ONE
`sec1.audit_event` row for that `event_id`, not two.

**P0 seed rules (3, not the full SEC1-TC-019..028 catalogue — a defensible proof set, not
exhaustive rule-content coverage, per the approved brief's own framing):**

| rule_id | event_type_filter | condition | threshold | severity |
|---|---|---|---|---|
| `rule_failed_login_spike` | `iam01.generic_event` | `action=login, result=failure, scope=actor_user_id` | 5 / 300s | high |
| `rule_mfa_reset_abuse` | `iam01.generic_event` | `action=mfa_reset, scope=actor_user_id` | 3 / 3600s | critical |
| `rule_sod_conflict_approval_abuse` | `iam02.generic_event` | `action=sod_conflict, scope=actor_user_id` | 1 / 60s | critical |

## 55. Alert lifecycle (`lib/alerts.ts`, `routes/alerts.ts`)

Internal routes only (`POST /internal/sec1/security-alerts/{search,read,assign,triage,close}`,
`POST /internal/sec1/monitoring-dead-letter/replay`), same generic internal-identity guard +
IAM-02 permission-guard-over-HTTP pattern Phase 4's `routes/read.ts` established. Authorization
runs BEFORE existence disclosure (a denied `read` returns the identical error/status for a real
vs. fabricated `alert_id` — proven directly).

**Lifecycle enforced EXACTLY as `06_State_Machine.md` §2 draws it**:
`open -> assigned -> triaged -> {closed, escalated}`. No transition invented beyond it — an
`escalated` alert has no forward transition this phase (INC-01 does not exist yet); it simply
stays `escalated`. A `SELECT ... FOR UPDATE` lock (mirroring `lockStreamForUpdate`/
`lookupApprovalForUpdate`) guards every transition; an out-of-sequence attempt (e.g. closing an
`open` alert directly) fails closed with the new `SEC1_ALERT_INVALID_TRANSITION`.
`closure_reason`/`closure_evidence_ref` are mandatory on EVERY closure, not just Critical
(SEC1-TC-032) — `SEC1_ALERT_CLOSURE_EVIDENCE_REQUIRED`.

**Critical alert closure — the one genuinely new architectural decision this phase.** IAM-02's
guard precedence chain gates `requires_step_up`/`requires_approval` as a static, binary
property of the permission CODE — it cannot express "approval required only when severity is
Critical" (the blueprint's own "Critical alert closure **where configured**" phrasing implies
exactly that conditionality). Per the approved brief: `sec1.security_alert.close` is registered
with `requires_approval = false`, and the Critical-only requirement is enforced at the SEC-01
ROUTE layer instead — reusing IAM-02's **existing** generic maker-checker surface
(`/iam2/approvals/request` + `/iam2/approvals/:id/approve`, run by an operator OUTSIDE this
route — out of this route's own scope) as a building block, never a new IAM-02 mechanism:

1. Baseline IAM-02 `sec1.security_alert.close` check must `allow` (both severities).
2. For `severity = 'critical'` ONLY: the caller must additionally present `approval_id` +
   `decision_token`. SEC-01 recomputes `fingerprint({ alert_id, severity, closure_reason,
   closure_evidence_ref })` (`@aix/foundation`'s existing canonical-JSON+sha256 helper — the
   SAME function IAM-02's own `routes/approvals.ts` already uses to hash an approval's
   `payload`) and calls IAM-02's **existing** `POST /internal/iam2/permission/execute-verify`
   (`lib/iam2-client.ts::verifyDecisionToken`, new client function, zero IAM-02 code touched)
   with `action="sec1.security_alert.close"`, `resource="security_alert"`,
   `entity_id=alert_id`, `current_payload_hash`. IAM-02's own `verifyAndConsumeDecisionToken`
   (already-accepted F1-fixed binding check) does the real work: actor/action/resource/
   entity/payload-hash/cache-version verification, single-use consumption.
3. Any non-authorised outcome (missing token, `IAM2_DECISION_TOKEN_INVALID`,
   `IAM2_PAYLOAD_HASH_MISMATCH`, `IAM2_DECISION_TOKEN_STALE`, or IAM-02 unreachable) collapses
   to the SAME generic `SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED` — same
   generic-on-the-wire discipline as `SEC1_UNAUTHORISED_AUDIT_READ`.
4. **Never holds a Postgres row lock across the IAM-02 network round-trip** — the
   pre-critical-check alert read is a plain `SELECT` (via `getAlertDetail`), not
   `lockAlertForUpdate`; the actual DB write (`closeAlert`) re-locks and re-validates the
   `'triaged'` transition itself afterward, so a state change between the pre-check and the
   write (a TOCTOU race) still fails closed.
5. **Documented operational contract** (not enforced by any code, since the approval-creation
   step is out of this route's scope): whoever creates the IAM-02 approval must hash the SAME
   `{ alert_id, severity, closure_reason, closure_evidence_ref }` shape as the `payload` field
   at `/iam2/approvals/request` time, or the resulting token's payload hash will never match at
   execute-verify time.

Proven end-to-end (4 tests, `config.iam2FetchImpl` faking both `/permission/check` and
`/permission/execute-verify`): no token → 403; `IAM2_DECISION_TOKEN_INVALID` → 403;
`IAM2_PAYLOAD_HASH_MISMATCH` → 403; a confirmed-valid token → 200, alert closed. A non-critical
('high'-severity) closure succeeds with NO token presented at all.

**SoD rule 2 ("audit admin cannot close alert about own action") is NOT enforced this
phase** — the approved implementation brief's own scope list for §6/§7 does not name it (an
earlier, broader planning pass had proposed it as a P0 nice-to-have; the actual approved brief
narrowed scope to the items listed in §12/§56 below). Flagged as a carry-forward, alongside the
already-deferred full IAM-02 `sod_rule`-table integration (SoD rule 6 and others).

## 56. Monitoring dead-letter (`lib/monitoring-dead-letter.ts`) — replay, no scheduler

Route-triggered only (`POST /internal/sec1/monitoring-dead-letter/replay`, IAM-02-gated on
`sec1.security_alert.triage` — least privilege, per the approved brief), either a specific
`dead_letter_id` or a batch of up to `limit` eligible (`status IN ('pending','failed')` AND
`next_retry_at_utc <= now()`) rows, oldest first. `retry_count` increments and
`failure_reason` is overwritten with the LATEST failure on every failed replay (no separate
"last_error" column — the blueprint's own column list has exactly one text reason column;
documented as a judgment call, not an oversight); `retry_count >= 5`
(`DEAD_LETTER_ESCALATE_AFTER_RETRIES`, a placeholder threshold, not a documented blueprint
requirement) escalates to `status = 'escalated'`. **No DELETE, ever** — a dead-letter row is
never removed, only transitioned. **No scheduler/cron this phase** — same disposition as
Phase 3's integrity-verification job; FR-032's "guarantee eventual rule evaluation" is
satisfied by the MECHANISM existing and being provably correct, with its SCHEDULING flagged as
the carry-forward gap.

Proven directly: a malformed rule fixed out-of-band then replayed by ID transitions
`pending -> replayed` and creates the alert the original evaluation should have; a
STILL-malformed rule replayed again increments `retry_count` to 1 and records the new
`failure_reason` (containing the actual validation message, e.g. "threshold.count"), never
deletes the row.

## 57. Two new error codes beyond the approved brief's named three — flagged explicitly

The approved brief named exactly three new codes (`SEC1_ALERT_CLOSURE_EVIDENCE_REQUIRED`,
`SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED`, `SEC1_ALERT_PIPELINE_BACKLOG`); this
implementation adds two more, both flagged here rather than silently folded into an
ill-fitting existing code:

- **`SEC1_ALERT_INVALID_TRANSITION`** (409) — the brief's own test list requires "invalid
  transition rejected" as a DISTINCT, diagnosable outcome from a missing-evidence close or an
  unauthorised caller. Reusing `SEC1_ALERT_CLOSURE_EVIDENCE_REQUIRED` for a state-machine
  violation would have been a real semantic bug on the wire, not a stylistic choice.
- **`SEC1_UNAUTHORISED_ALERT_ACTION`** (403) — Phase 4's `SEC1_UNAUTHORISED_AUDIT_READ` has the
  wire message "You are not authorised to **read this audit data**"; reusing it for an alert
  assign/triage/close denial (a mutation, on a different resource) would be wrong on the wire.
  Alerts get their own generic-deny code, same fail-closed-collapsing discipline.

## 58. Confirmation: no out-of-scope module/feature code

No CFG-01, business-tier, or Exchange runtime code was added — re-confirmed by the unchanged
boot-time `assertNoExchangeRuntime` guard. Not built, exactly as scoped as deferred: rule
management/create/update API (`POST /sec1/monitoring-rules`), evidence export, `verify_integrity`
staff-facing route, alert-to-incident handoff (INC-01 does not exist), full IAM-02
`sod_rule`-table integration, real notification delivery (no fake Slack/email/PagerDuty — alert
row creation is the notification baseline this phase, per the brief's own instruction;
`security_monitoring_rule.recipient_policy` is accepted/stored but not acted upon), real
WORM/object-lock, trusted timestamp authority, scheduler/cron, audit correction,
retention/legal hold, incident break-glass audit-read, IAM-02 Phase 6/7. **No IAM-02 source
file was modified** — `lib/iam2-client.ts::verifyDecisionToken` is a new SEC-01-side client
function calling IAM-02's pre-existing, pre-accepted `execute-verify` route; `services/iam2/src/**`
is untouched (re-confirmed by the existing F3(c) import-boundary test, unmodified).

**Carry-forward (non-blocking):** F-2…F-6 (Phase 4, unrelated to this phase's own concern) all
remain exactly as before — none are closed by this slice. **F-5 (interim shared internal-token
+ trusted-`actor_id` trust model) grows more consequential** as Phase 5 adds five more routes
under the same interim model — flagged explicitly, not newly introduced. SoD rule 2 (alert
self-close block) and the full `sod_rule`-table integration (SoD rule 6 and others) are new
Phase-5-adjacent carry-forwards (§55). Rule-content coverage (the remaining SEC1-TC-019..028
scenarios beyond the 3 P0 rules) is a follow-on catalogue-content task, not a code gap.

## 59. Sonnet self-review (before Opus) — two real gaps found and closed

A dedicated self-review pass was run against the actual committed files (not from memory),
mirroring Phase 4's own §47 discipline. Two real, confirmed gaps were found; both closed
before this phase went to Opus.

1. **Bug: the close route could leave an idempotency record permanently stuck at
   `'processing'`, causing a same-key retry to return a misleading 200.**
   `beginIdempotent` for `POST /internal/sec1/security-alerts/close` runs in its OWN
   transaction (committing immediately), deliberately separate from the eventual write — so
   the IAM-02 `execute-verify` network round-trip never happens under a held Postgres row lock
   (see §55 point 4). But this meant any throw between that commit and `completeIdempotent`
   (alert not found, missing decision token, invalid/mismatched token) left the row
   permanently at `status = 'processing'`. The route's own "duplicate" branch did not inspect
   `recordStatus`, so a caller retrying with the SAME `Idempotency-Key` + the SAME
   (still-incomplete) body got back the alert's CURRENT, still-`'triaged'`/unclosed state
   wrapped in a 200 success envelope — silently implying the close had already happened when
   it never had. **Fixed:** the "duplicate" branch now only short-circuits when
   `idem.recordStatus === "completed"` (a genuine prior success); any other status (most
   commonly a stuck `'processing'` row from an earlier failed attempt) falls through and
   REPROCESSES the request from scratch, reproducing the SAME honest outcome for an unchanged
   body (e.g. the same `SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED`) rather than a
   misleading success. (A retry with a genuinely FIXED body — a token added — still correctly
   requires a NEW `Idempotency-Key`, since `beginIdempotent`'s own pre-existing fingerprint
   check rejects a body change under the same key; that part of the behaviour was already
   correct and by design, not part of this bug.) New regression test: same key + identical
   incomplete body retried twice returns the SAME 403 both times, the alert stays `'triaged'`,
   and a third attempt under a NEW key with the token added succeeds normally.
2. **Bug: concurrent rule evaluations for the same rule+scope could create duplicate alerts.**
   `evaluateOneRule`'s threshold-count check, open-alert de-dup check
   (`findOpenAlertByRuleScope`), and the eventual `security_alert` INSERT were three separate
   statements with no row to lock (the alert doesn't exist yet) and no unique constraint — under
   READ COMMITTED, two events for the SAME rule+scope crossing the threshold via concurrent
   HTTP requests could each see "no open alert yet" before either committed its INSERT,
   producing two alerts for what the de-dup logic is meant to guarantee is exactly one. Every
   prior phase's own precedent for this exact race class (`lib/stream.ts`'s
   `SELECT ... FOR UPDATE` hash-chain sequencing, IAM-02's `checkApprovalSodConflict`
   sequential-await fix) uses a lock; this evaluator had none. **Fixed:** a
   `pg_advisory_xact_lock(hashtext(...))` keyed on `(rule_id, scope_column, scope_value)`,
   acquired at the start of each rule's own evaluation transaction and released automatically
   on that transaction's commit/rollback — the second of two concurrent evaluations for the
   SAME key now blocks until the first commits, then correctly observes the first's
   already-created alert and skips. New regression test: 2 threshold-crossing ingests fired via
   real concurrent HTTP requests (`Promise.all`) against the same actor produce exactly ONE
   alert, not two.

Neither gap was a security bypass (both are correctness/data-integrity defects — a misleading
success response and a duplicate-alert race — not an authorization or licence-lock hole).

**Re-verified after both fixes:** `tsc -b` clean; fresh disposable Postgres; migrations
001→013 + all 4 grant files clean; **471/471 tests passing** (469 + 2 new regression tests) in
a single run.

## 60. Second Sonnet self-review pass — one more real gap found, one hardening applied

A second, independent self-review pass was run against the actual committed files (including
the §59 fixes), per the approved brief's own explicit checklist. One more real gap was found
and closed; one additional hardening (not itself exploitable with current seed data, but the
same class of gap) was applied for consistency.

1. **Bug: concurrent failed-seal-verification calls on the SAME `seal_batch_id` could create
   duplicate alerts** — the same race class as §59 finding 2, in a sibling code path.
   `createAlertForFailedSealVerification`'s de-dup check and INSERT were unprotected, and
   `routes/seals.ts`'s own route (per its own header comment) re-runs `verifySealBatch`
   UNCONDITIONALLY on every call — including the idempotency "duplicate" case, which this route
   never checks (unlike `routes/integrity.ts`'s P3-L1-fixed verify-range) — so two concurrent
   verify calls against the same batch each independently compute `'failed'` and could both
   observe "no open alert yet." **Fixed:** the same `pg_advisory_xact_lock` pattern, factored
   into a shared `lockAlertEntity` helper and applied to BOTH verification-failure hooks.
   Applying it to `createAlertForFailedIntegrityVerification` too is a no-op in practice
   (`verification_id` is a fresh UUID per invocation, so two calls never contend on the same
   lock key) but keeps both hooks structurally consistent. New regression test: two concurrent
   seal-verify calls against the same tampered batch produce exactly one alert.
2. **Hardening, not a currently-exploitable bug: the Critical-closure decision-token verify
   call did not bind `client_id`.** `entity_id` was already conditionally forwarded to
   `verifyDecisionToken`; `client_id` was not, even though `VerifyDecisionTokenInput` supports
   it. With today's 3 seed rules (all `actor_user_id`-scoped), no alert this phase ever carries
   a `client_id`, so this had no observable effect yet — but a future client-scoped rule
   producing a Critical alert with a `client_id` would have its legitimately-bound decision
   token rejected (IAM-02's own binding check treats a presented `undefined` as only matching a
   token bound to `null`). **Fixed:** `client_id` is now forwarded from the alert's own record,
   symmetric with `entity_id`.

**Re-verified after both changes:** `tsc -b` clean; two independent fresh disposable Postgres
runs; migrations 001→013 + all 4 grant files clean; **472/472 tests passing** both runs (471 +
1 new regression test).

## 61. Opus independent review — ACCEPT WITH MINOR CONDITIONS

The independent Opus review verdict was **ACCEPT WITH MINOR CONDITIONS** — no Critical, High,
or Medium findings. Grant posture, catalogue registration, rule-engine fail-open/fail-closed
boundary, verification-failure hooks (including the concurrency fix), alert lifecycle, and the
Critical-closure decision-token binding (including the `client_id` fix) were all independently
reproduced: fresh disposable Postgres, migrations 001→013 + all 4 grant files, 472/472 tests,
direct `has_table_privilege` grant-boundary reproduction under `role_sec1_runtime` and every
other runtime role, direct catalogue-row inspection, and an independent `fingerprint()`
determinism/tamper-sensitivity probe confirming the payload-hash contract holds by construction
between SEC-01's close route and IAM-02's approval-request hashing. **SEC-01 Phase 5 is an
accepted implementation baseline.**

Two minor conditions were raised, both closed in this same pass (§62):
- **LOW-1** — the last-resort dead-letter-write-failure swallow paths (`lib/monitoring-
  rules.ts::safeDeadLetter`, `routes/integrity.ts`, `routes/seals.ts`) logged nothing; if
  `sec1.monitoring_dead_letter`'s own INSERT also failed, a Critical rule-evaluation or
  verification-failure alert-creation failure was lost with zero observability.
- **LOW-3** — the Critical-closure `decision_token` (a single-use bearer credential transiting
  `POST /internal/sec1/security-alerts/close`'s request body) was not in SEC-01's Fastify/pino
  log-redaction list, unlike the ingestion bearer token header and raw metadata.

Three further items were noted as non-blocking carry-forwards, not conditions: LOW-2
(post-ingest evaluation is awaited in the ingest response — latency-only, never a durability/
correctness concern), INFO-4 (no live IAM-02-backed Critical-closure test yet — the binding is
proven by shared-`fingerprint()` construction + exhaustive fail-closed stubbed tests, same
precedent Phase 4 already established), INFO-5 (a few benign lifecycle supersets vs. the
literal state-machine diagram — re-assign, re-triage, `assigned→escalated`-via-triage — none
permit an invalid close/escalate).

## 62. LOW-1 / LOW-3 minor-condition patch — closed

**LOW-1 — dead-letter-write-failure observability.** A new `logDeadLetterWriteFailure` helper
in `lib/monitoring-rules.ts` (used by `safeDeadLetter`) and a matching inline `request.log.warn`
call in `routes/integrity.ts`/`routes/seals.ts`'s own nested catch now log a structured warning
whenever `sec1.monitoring_dead_letter`'s own INSERT fails — the one failure mode this codebase's
fail-open-for-monitoring design previously could not record anywhere durable. The log carries
ONLY stable identifiers and the two already-safe, code-generated failure-reason strings:
`code: "SEC1_MONITORING_DEAD_LETTER_WRITE_FAILED"`, `rule_id`/`audit_event_ref` (rule-engine
path) or `entity_type`/`entity_id` (verification-hook path), `severity`, `request_id`/
`correlation_id` where available, `original_failure_reason`, `write_failure_reason` — never a
raw payload, raw metadata, or any token. `JustIngestedEvent` gained two fields
(`requestId`/`correlationId`, populated in `routes/internal.ts::toJustIngestedEvent` and
`lib/monitoring-rules.ts::fetchAuditEventAsJustIngestedEvent` from the already-NOT-NULL
`sec1.audit_event.request_id`/`correlation_id` columns) purely so the rule-engine path's log
line can include them "where available," per the review's own ask — no other behaviour change.
`lib/monitoring-rules.ts` has no access to a Fastify request logger (it runs as post-commit
background work, not inside a request handler, and no shared logger utility exists in
`@aix/foundation` for that case) — uses `console.warn` with one-line structured JSON;
`routes/integrity.ts`/`routes/seals.ts` (genuinely inside a request handler) use Fastify's own
`request.log.warn`, which already attaches request/correlation IDs automatically.

**LOW-3 — `decision_token` log redaction.** `server.ts`'s inline Fastify `redact.paths` array is
now the exported `SEC1_LOG_REDACT_PATHS` constant (directly unit-testable without introspecting
pino internals) with `"req.body.decision_token"` added, alongside the pre-existing
`x-internal-service-token` header and `req.body.metadata` entries. `approval_id` is
deliberately NOT redacted — it identifies an approval record, not a secret bearer credential
(the same distinction IAM-02 itself draws).

**Tests added:**
- `tests/integration/sec1-db.test.ts` — one new test: REVOKEs INSERT on
  `sec1.monitoring_dead_letter` (mirroring the existing sensitive_read_log fail-closed
  REVOKE/GRANT-in-`finally` convention), spies on `console.warn`, ingests an event matching a
  deliberately-malformed rule (so BOTH the rule evaluation AND the dead-letter write fail),
  and asserts: ingestion still returns 200 with its `audit_event` row intact; no
  `monitoring_dead_letter` row exists (the INSERT was genuinely denied); the warning was logged
  with the expected `rule_id`/`severity`/`request_id`/`correlation_id`; and a deliberately
  planted secret metadata value never appears in any logged line.
- `tests/unit/sec1-log-redaction.test.ts` (new file, 3 tests) — asserts `SEC1_LOG_REDACT_PATHS`
  contains `req.body.decision_token`, still contains the two pre-existing paths, and does NOT
  contain `req.body.approval_id`.

**Verification (fresh disposable Postgres, two independent runs):** `npx tsc -b` clean;
migrations 001→013 apply; all 4 grant files apply; **476/476 tests passing** (472 baseline
unregressed + 4 new) in a single run each time.

**No out-of-scope code touched** — this patch is scoped to exactly the two named conditions;
no rule-management API, evidence export, `verify_integrity` route, incident handoff, real
notification provider, scheduler/cron, WORM/TSA, business-tier, or Exchange-shaped code exists
anywhere in the diff. **SEC-01 Phase 5 remains an accepted implementation baseline.**

**Carry-forward, unchanged by this patch:**
- INFO-4 (live IAM-02-backed Critical-closure test) remains a tracked, non-blocking carry-forward.
- F-2…F-6 (Phase 4) remain open; **F-5 (interim shared internal-token + trusted-`actor_id`
  trust model) remains more load-bearing** after Phase 5's five new routes and the
  Critical-closure trust decision under that same interim model.
- SoD rule 2 (alert self-close block) remains deferred, documented, out-of-scope (§55) — not
  addressed by this patch, per its own explicit scope.

## 63. Next step

**SEC-01 Phase 5 is an accepted implementation baseline** — Opus-reviewed (ACCEPT WITH MINOR
CONDITIONS), both minor conditions (LOW-1, LOW-3) closed and re-verified in this pass
(476/476 tests, two independent fresh disposable Postgres runs, `tsc -b` clean, migrations
001→013 + all 4 grant files clean). MODULE_STATUS.md / PROJECT_HANDOVER.md /
SESSION_START_PROMPT.md are the next artifacts to sync to reflect this acceptance. CFG-01
Feature-Flag / Licence-Lock remains the next module after SEC-01 Phase 5.
