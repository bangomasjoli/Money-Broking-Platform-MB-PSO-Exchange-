# AML-01 — Sanctions / PEP / Adverse-Media Screening — Implementation Notes

## 0. Module selection

**AML-01 was selected as the next runtime module ahead of KYC-01**, immediately after CLT-01
reached `Accepted implementation baseline COMPLETE (Phases 0-9)`. Reasoning (full analysis in the
next-module planning report):

- CLT-01 already exposes receipt-only seams for both AML/sanctions outcomes
  (`cdd_outcome.outcome_type = 'aml_sanctions'` / `'pep_adverse_media'`) and AML handoff status
  (`handoff_status.target_module = 'AML'`) — today these are populated by test fixtures, not a
  real screening engine.
- Sanctions/PEP/adverse-media screening is a legitimate production workflow to run on **declared**
  identity, before KYC verification completes ("screen early and often") — AML-01 has no hard
  upstream dependency on KYC-01 at the CLT-01 seam.
- AML-01 has the broadest downstream leverage of the two candidates: WLT-01 (wallet screening),
  DEP-01/WDR-01 (revocation-signal subscribers) all depend on AML-01; KYC-01 primarily feeds
  CLT-01 onboarding only.
- **KYC-01 remains the confirmed immediate next module after AML-01.** AML-01's Phase 1 screening
  subject is explicitly **declared identity, not KYC-verified identity** — this is a legitimate
  initial-screening workflow (not a placeholder to be embarrassed about), and gains a
  verified-identity re-screen trigger once KYC-01 lands. No rework is implied; this is additive.

## 1. Phase 0 — ACCEPTED implementation baseline after independent Opus review — service scaffold / boot guard / internal route baseline

**Approved scope: scaffold only.** No schema, no migration, no grants, no `role_aml1_runtime`, no
screening logic, no CLT-01/IAM-02/CFG-01/SEC-01 integration, no vendor/network call, no public
route. Mirrors `services/clt1`'s / `services/cfg1`'s own accepted Phase 0 exactly (same file
shapes, same design discipline), adapted only in naming.

### 1.1 Service identity

- Service folder: `services/aml1`
- Workspace package name: `@aix/service-aml1`
- Module code: `AML-01`
- Route prefix: `/internal/aml1`
- Runtime role name **reserved** for Phase 1 (not created this phase): `role_aml1_runtime`
- `source_module` string **reserved** for Phase 1+ audit events (not emitted this phase — no
  `publishAudit` call exists yet): `"AML-01"`

### 1.2 Files created

```
services/aml1/package.json
services/aml1/tsconfig.json
services/aml1/src/index.ts
services/aml1/src/config.ts
services/aml1/src/server.ts
services/aml1/src/plugins/request-context.ts
services/aml1/src/plugins/internal-identity.ts
services/aml1/src/routes/system.ts
services/aml1/src/lib/errors.ts

tests/unit/aml1-app.test.ts
tests/unit/aml1-config.test.ts
tests/unit/aml1-internal-identity.test.ts
tests/unit/aml1-import-boundary.test.ts
tests/unit/aml1-no-exchange.test.ts

docs/implementation/AML-01_IMPLEMENTATION_NOTES.md   (this file)
```

### 1.3 Files modified (build wiring only, no logic)

- root `tsconfig.json` — added `{ "path": "./services/aml1" }` to `references`.
- root `package.json` — added `dev:aml1` / `start:aml1` scripts, following the existing
  per-service convention exactly.

**No file under `services/clt1/**`, `services/iam2/**`, `services/cfg1/**`, `services/sec1/**`,
`services/iam/**`, `services/fnd/**`, `infra/migrations/**`, or `infra/grants/**` was touched.**

### 1.4 Config model

`Aml1Config extends AppConfig` adds exactly one field: `aml1InternalServiceToken: string`.
`loadAml1Config(env)` maps `AML1_INTERNAL_SERVICE_TOKEN` onto the shared `loadConfig`'s
`INTERNAL_SERVICE_TOKEN` slot (inherits presence/min-length/`ENVIRONMENT`/`DATABASE_URL`/`PORT`
validation), and additionally throws `CONFIGURATION_INVALID` on a missing/blank token — the same
explicit belt-and-braces check every prior module's own config loader performs. **No**
`CLT1_BASE_URL`/`IAM02_BASE_URL`/`CFG1_BASE_URL`/`SEC1_BASE_URL`/vendor API key exists yet — each
will be added, named after the dependency (not the caller), in the phase that first needs it.

**Header-comment carry-forward flag (not a new finding, an inherited one made explicit for
AML-01):** the interim shared-token internal-identity model is the same one every module in this
codebase carries as a documented non-blocking carry-forward. It will be **more consequential for
AML-01** than for any prior module once real routes land — AML-01 will process sanctions/PEP/
adverse-media match detail naming real natural persons, arguably the most sensitive data category
this codebase will ever handle. Flagged now in `config.ts`'s own header, exactly as CLT-01
flagged its PII-system-of-record status at its own Phase 0.

### 1.5 Route model

Exactly one route, registered by `registerSystemRoutes(app)`:

- `GET /internal/aml1/health` → standard success envelope, `{ status: "alive" }`,
  **unauthenticated** (a liveness probe must not require a secret — mirrors every prior module's
  own `/health` route).

**Not present** (each asserted absent by test): `/internal/aml1/readiness` (deferred to Phase 1,
alongside the first `aml1.*` table to check — the CFG-01/CLT-01 Phase 0→1 precedent), any
screening/match/disposition/callback route, any public `/aml1/*` route.

### 1.6 Internal identity / security model

Own copy (`makeAml1InternalIdentityGuard`) of the constant-time-compare guard pattern:
`x-internal-service-token` header vs. configured secret, `timingSafeEqual` after a length check,
fail closed (`SERVICE_IDENTITY_REQUIRED`, 401) on missing/blank/wrong. Never trusts a
caller-supplied `actor_id` — stamps a generic `aml1_internal_service`/`service` actor on success
only. Shipped and independently unit-tested via a scratch route (never registered by the real
service) even though Phase 0's only real route is unauthenticated — proven correct before Phase 1
depends on it, the same discipline CLT-01/CFG-01 applied.

### 1.7 Error model

`AML1_ERROR_CODES = {} as const` — **empty** this phase. `Aml1Error` class shell present (same
on-wire shape as every prior module's error class: `{code, message, details}` + `http`), not yet
instantiable with any real code since none exists. Phase 0's two failure modes both reuse shared
foundation codes: guard rejection → `SERVICE_IDENTITY_REQUIRED`; config failure →
`CONFIGURATION_INVALID`. **Deliberately not added:** `AML1_SERVICE_UNAVAILABLE` (no Phase 0 route
calls `getPool()`/queries the database — no reachable throw site yet; added in the phase that
first does, mirroring `CLT1_SERVICE_UNAVAILABLE`'s own Phase 0→1 introduction).

### 1.8 Boot guard / no-Exchange model

`buildApp` calls `assertNoExchangeRuntime(routePaths)` after `app.ready()`, scanning the
registered Fastify route table — identical control flow to every prior module. A dedicated
`aml1-no-exchange.test.ts` proves AML-01-shaped hypothetical routes using the guard's REAL
fragment list (`order-book`, `matching-engine`, `market-making`, `principal-dealing`,
`spread-markup`, `maker-taker`, `client-to-client`, `exchange` — read directly from
`packages/foundation/src/no-exchange.ts`, not assumed) would be caught if ever registered.

**Correction made during implementation (self-caught, not a defect that shipped):** an earlier
draft of `aml1-no-exchange.test.ts` asserted that `wallet`/`deposit`/`withdrawal`/`trading`/
`settlement`-shaped route fragments would trip `findProhibitedExchangeRoutes`. Reading the actual
`PROHIBITED_EXCHANGE_FRAGMENTS` list showed this guard is Exchange-runtime-specific and does
**not** match those terms — a legitimate future field/route name like `wallet_screening_status`
would otherwise false-positive. The test was rewritten to assert only the guard's real fragment
set, plus a sanity check proving wallet/trading-shaped paths do NOT trip this particular function.
AML-01's actual "no wallet/deposit/withdrawal/trading/settlement capability" constraint is
enforced by (a) Phase 0 registering no such route, and (b) the static source greps run at
implementation/review time — not by this runtime guard. This distinction is preserved directly in
the test file's own header comment so it is not silently re-discovered later.

### 1.9 Import-boundary model

`aml1-import-boundary.test.ts` reuses the shared `findModuleImportBoundaryViolations` scanner.
Forbidden set: `iam`, `iam2`, `sec1`, `cfg1`, `clt1`, `fnd` — **`clt1` included from day one**,
since AML-01's future CLT-01 wiring (deferred past Phase 0) will be HTTP-only via its own
`lib/clt1-client.ts`, never an import.

### 1.10 Documentation

This file. `MODULE_STATUS.md` / `PROJECT_HANDOVER.md` / `SESSION_START_PROMPT.md` (sibling
`aix-platform-docs` workspace) are **deliberately NOT updated** — status-doc sync happens only
after independent Opus acceptance of this phase, per the standing per-phase discipline.

### 1.11 Phase 1 preview (not implemented this phase)

Point-in-time entity-screening record + deterministic stub adaptor, self-contained (no CLT-01
callback until Phase 2): `aml1` schema + `role_aml1_runtime` + core tables (screening request /
append-only screening result-match / declared-identity subject snapshot); a screening adaptor
interface + deterministic, fixture-driven stub provider (no network call, no real watchlist data)
with **mandatory HIT-fixture support** so the eventual gate is provably load-bearing; explicit
**declared-identity provenance** recorded on every screening subject (verified-identity re-screen
deferred to post-KYC-01); `readiness` route lands here. No IAM-02 permissions, no CLT-01 callback,
no CFG-01 gate, no revocation model this phase.

### 1.12 Sonnet self-review outcome

**Verdict: ACCEPT.** Zero Critical/High/Medium/Low defects. No files changed during self-review;
no scope drift. One self-caught correction made during implementation (not a self-review-time
fix): the initial draft of `aml1-no-exchange.test.ts` incorrectly asserted that
`wallet`/`deposit`/`withdrawal`/`trading`/`settlement`-shaped routes would trip the shared
`findProhibitedExchangeRoutes` guard; corrected against the real `PROHIBITED_EXCHANGE_FRAGMENTS`
list before reporting a result (see §1.8).

### 1.13 Independent Opus review outcome

**Verdict: ACCEPT AML-01 Phase 0.** Zero Critical/High/Medium/Low findings.

- **1261/1261 full suite passing** (71 files, 0 failures — 1223 baseline + 38 new), independently
  reproduced from a genuinely fresh disposable Postgres with `TEST_DATABASE_URL` set; `tsc -b` /
  `tsc -b --force` both clean.
- Migrations independently confirmed to remain 001->032 (no new migration); all 6 existing grant
  files clean; direct DB inspection confirmed **zero** `aml1` schema rows in
  `information_schema.schemata` and **zero** `role_aml1_runtime` rows in `pg_roles` (not inferred
  from a file listing alone).
- Import boundary independently re-derived by enumerating every import specifier in
  `services/aml1/src` — confirmed clean (own-tree relative paths, bare `@aix/foundation`,
  `fastify`, `node:crypto` only).
- Static sweeps (public route, Exchange/wallet/trading fragments, vendor/watchlist/network-call
  code, cross-service imports) all independently reproduced clean.
- **No code changed during the Opus review.**
- **AML-01 Phase 1 was not started** during or after this review.
- Two informational, non-blocking observations (carried into §1.11's Phase 1 preview, not
  acceptance conditions):
  - the empty `AML1_ERROR_CODES` catalogue makes `Aml1Error` intentionally uninstantiable until
    Phase 1 adds the first real code — by design, not a defect;
  - the Phase 0 route-fragment test's forbidden-term sweep (`screening`/`match`/`disposition`)
    must be consciously updated once Phase 1 adds AML-01's own legitimate routes using those
    terms — flagged now so it is a deliberate Phase 1 edit, not a surprise regression.

---

**AML-01 was an accepted implementation baseline through Phase 0.** `MODULE_STATUS.md`,
`PROJECT_HANDOVER.md`, and `SESSION_START_PROMPT.md` were updated to that state at the time.

## 2. Phase 1 — ACCEPTED implementation baseline after independent Opus review — point-in-time screening record & deterministic stub adaptor

**Approved scope:** first real AML-01 persistence + a synchronous, deterministic, stub-backed
screening pipeline. No CLT-01 callback, no IAM-02 permissions, no human disposition, no real
vendor/watchlist/network integration.

### 2.1 Schema and grants

Migration `infra/migrations/033_aml1_core.cjs` — `aml1` schema + 4 tables:
- `aml1.screening_request` — workflow row, **NO PII**. `status` CHECK `('requested','completed','failed')`; `provenance` CHECK `('declared_identity','kyc_verified_identity')` (Phase 1 only ever writes `declared_identity`).
- `aml1.screening_subject_snapshot` — the declared-identity PII captured at screen time, isolated in its own table (append-only — a re-screen writes a new row).
- `aml1.screening_result` — append-only, one per completed screen. `overall_status` CHECK carries `('clear','potential_match','confirmed_hit','error')`; Phase 1 only ever writes `clear`/`potential_match`.
- `aml1.screening_match` — append-only, zero-or-more per result. `category` CHECK `('sanctions','pep','adverse_media')`.

No role created inside the migration; no seed data.

`infra/grants/aml1_runtime_grants.sql` — `role_aml1_runtime` (NOLOGIN, idempotent DO-block). `screening_request`: SELECT/INSERT + UPDATE column-scoped to exactly `{status, completed_at_utc, version}`. `screening_subject_snapshot`/`screening_result`/`screening_match`: SELECT/INSERT only — **no UPDATE grant on any PII/append-only table, ever**. `foundation.outbox_event`: INSERT only. Zero DELETE/TRUNCATE anywhere; zero grant into `iam`/`iam2`/`cfg1`/`sec1`/`clt1`; zero `foundation.idempotency_record` grant.

### 2.2 Routes

- `POST /internal/aml1/screening-requests` — runs the entire screening lifecycle **synchronously, in one transaction**: INSERT request (`requested`) → INSERT subject snapshot → run the deterministic stub (`lib/screening.ts`'s `screen()`) → on a screened outcome, INSERT result + zero-or-more matches, UPDATE to `completed`; on provider-unavailable, UPDATE to `failed` instead (no result row). Internal-identity-guarded.
- `GET /internal/aml1/screening-requests/:screening_request_id` — safe-projection read. Internal-identity-guarded.
- `GET /internal/aml1/readiness` — DB/`aml1`-table reachability only, mirrors CLT-01's own precedent. Unauthenticated (like `/health`).

`subject_ref` is an opaque, unverified caller-supplied reference this phase — AML-01 does not call CLT-01 to confirm it exists (no CLT-01 HTTP client yet).

### 2.3 Deterministic stub adaptor and HIT fixtures

`lib/screening.ts`'s `screen()` is pure, DB-free, network-free — a fixed lookup keyed on a normalized subject name against clearly-labeled synthetic `"AML1 TEST ..."` fixtures (never real list data). Mandatory load-bearing proof: a clean name → `clear`/zero matches; one fixture each for **sanctions**, **PEP**, and **adverse-media** → `potential_match` + exactly one match in that category; one **provider-down** fixture → `unavailable`. Scores are fixed deterministic constants — no fuzzy matching, no scoring engine, no entity-resolution engine.

### 2.4 Safe response and PII

`safeScreeningResponse` is the single safe-projection point — returns only `{screening_request_id, subject_type, subject_ref, provenance, status, result:{overall_status, matched_categories, screened_at_utc}}`. Never returns `name`/`registration_number`/`date_of_birth`/`nationality` (subject-snapshot PII) or `matched_name`/`match_detail`/`score` (the match table's most sensitive columns) — only the deduplicated category list. `AML1_LOG_REDACT_PATHS` extended with the four `req.body.declared_identity.*` PII fields. Error `details` never echo a rejected value back. Audit metadata carries only opaque IDs, status, and category list — no PII — proven by a direct DB sweep in the integration suite.

### 2.5 Error model

Five reachable codes added: `AML1_SERVICE_UNAVAILABLE` (503), `AML1_SCREENING_REQUEST_NOT_FOUND` (404), `AML1_SCREENING_SUBJECT_INVALID` (422), `AML1_SCREENING_PROVIDER_UNAVAILABLE` (503), `AML1_AUDIT_REQUIRED` (503). `AML1_SCREENING_REQUEST_INVALID_STATE` and all disposition/vendor/CLT-callback codes deliberately **not** added — screening is entirely synchronous this phase, no reachable throw site exists yet.

### 2.6 Audit/outbox

`aml1.screening_request_created`, `aml1.screening_completed`, `aml1.screening_failed` — all transaction-coupled (`source_module: "AML-01"`), published inside the same transaction as the write they describe. Any audit/outbox failure rolls the whole attempt back as `AML1_AUDIT_REQUIRED`.

### 2.7 Self-review-caught fix: `date_of_birth` validation gap

`declared_identity.date_of_birth` initially accepted any string up to 40 chars at the schema layer. A malformed value would reach the `date`-typed `screening_subject_snapshot.date_of_birth` column and fail the Postgres INSERT inside the transaction, surfacing as an opaque `503 AML1_AUDIT_REQUIRED` instead of a clean `422 AML1_SCREENING_SUBJECT_INVALID`. **Fixed** with `isValidCalendarDate()` — a pure function requiring exact `YYYY-MM-DD` shape *and* a real calendar date (verified by round-tripping the parsed `Date`'s year/month/day back against the input, catching `Date`'s lenient rollover of e.g. Feb 30 into March). Rejects before any database write; `date_of_birth` remains optional; error `details` never echo the rejected value. Calendar validity only — no future-date or minimum-age business rule (out of scope, correctly deferred).

### 2.8 Sonnet self-review outcome

**Verdict: ACCEPT.** Zero Critical/High/Medium defects. One real gap found and fixed (§2.7, the `date_of_birth` validation gap) before Opus review, not left as a residual note.

### 2.9 Independent Opus review outcome

**Verdict: ACCEPT.** Zero Critical/High/Medium/Low findings.

- **1317/1317 full suite passing** (74 files, 0 failures — 1261 baseline + 56 new), independently reproduced from a genuinely fresh disposable Postgres with `TEST_DATABASE_URL` set; `tsc -b --force` clean.
- Migration `033` + `aml1_runtime_grants.sql` independently reproduced clean; grant matrix independently confirmed exact at the `information_schema` level, including a **live proof** that UPDATE is actually denied on the three append-only tables under `role_aml1_runtime` (not just absent from the catalogue).
- Test-count reconciliation independently verified accurate: 94 total AML-01 tests (38 at Phase 0 + 56 net-new this phase: 48 from the original Phase 1 submission + 8 from the `date_of_birth` micro-fix).
- **No code changed during the Opus review.**
- Four informational, non-blocking observations (no fix required): a stale doc-comment in `lib/errors.ts` not yet mentioning the `date_of_birth` case (closed in this status-sync pass, see the edit to `AML1_SCREENING_SUBJECT_INVALID`'s comment); an unused computed value (`matchedCategories`) in the POST handler's transaction-return type on the happy path (the response is re-fetched via `fetchSafeResponseOrThrow` instead); `matched_categories` ordering differs cosmetically between audit metadata (insertion order) and the HTTP response (alphabetical) with no observable effect (Phase 1 fixtures each produce exactly one category); the DOB round-trip validator harmlessly rejects implausible 2-digit-mapped years as a side effect of `Date.UTC`'s year-offset behaviour.
- Residual findings assessed and accepted: `fetchSafeResponseOrThrow`'s 3 sequential queries (acceptable, non-blocking future micro-optimization); the DOB validator checking calendar validity only, not business plausibility (correct scope for Phase 1).

---

## 3. Phase 2A — ACCEPTED implementation baseline after independent Opus review — CLT-01 outcome delivery

**Approved scope:** an AML-01-owned CLT-01 HTTP client, a CLT-01 outcome-mapping library, and the
delivery/retry/status routes that post AML-01 screening outcomes into CLT-01's TWO EXISTING receipt
endpoints. No IAM-02, no human match disposition, no sensitive-read route, no Phase 2B feature.

### 3.1 Schema and grants

Migration `infra/migrations/034_aml1_clt_outcome_delivery.cjs` — additive only, no role created, no
seed data:
- `aml1.screening_request` gains `subject_parent_ref` (nullable `varchar(64)`) — the parent
  `client_id` for an `authorised_party` subject, captured once at screening-request creation time.
  Deliberately excluded from the runtime role's UPDATE grant (INSERT-time only) — AML-01 never
  re-derives or re-asks the delivery caller for this value.
- `aml1.clt_outcome_delivery` — one row per delivery ATTEMPT TARGET (an application-level screen
  plans up to two: `aml_sanctions` + `pep_adverse_media`; an authorised-party-level screen plans
  exactly one, `outcome_type` stays `NULL`). Fields: `delivery_id`, `screening_request_id` (FK),
  `target` CHECK `('application_outcome','authorised_party_screening')`, `outcome_type` CHECK
  `(NULL OR 'aml_sanctions'/'pep_adverse_media')`, `delivered_status`, `effective_status` CHECK
  `('clear','potential_match','confirmed_hit','clear_after_review')`, `status` CHECK
  `('pending','succeeded','failed')`, `attempt_count`, `failure_reason_code`, `response_ref`,
  `requested_by`, `version`, `request_id`, `correlation_id`, timestamps. Indexes on `delivery_id`
  (unique), `screening_request_id`, `status`.

`infra/grants/aml1_runtime_grants.sql` extended: `clt_outcome_delivery` gets `SELECT`/`INSERT` +
column-scoped `UPDATE` limited to exactly `{status, attempt_count, failure_reason_code,
response_ref, delivered_at_utc, version}` — `delivery_id`/`screening_request_id`/`target`/
`outcome_type`/`delivered_status`/`effective_status`/`requested_by`/`created_at_utc` are all
INSERT-time-only. Still zero `DELETE`/`TRUNCATE` anywhere, zero grant into `clt1` or any other
module's schema, zero `foundation.idempotency_record` grant. Independently proven LIVE (not just
read from the SQL): every immutable column denied under `role_aml1_runtime` via direct `SET ROLE`
probes, including `subject_parent_ref`.

### 3.2 CLT-01 client and outcome mapping

`lib/clt1-client.ts` — AML-01's own copy (F3(c), never imports `services/clt1/**`). Wraps exactly
two EXISTING CLT-01 routes, never a new one:
- `POST /internal/clt1/applications/:application_id/outcomes` (`deliverApplicationOutcome`) —
  requires CLT-01's own `client_application.status = 'under_review'`.
- `POST /internal/clt1/clients/:client_id/authorised-parties/:authorised_party_id/screening-outcome`
  (`deliverAuthorisedPartyOutcome`) — requires `client_profile.status = 'active_limited'`; never
  sends `identity_verification_status` (KYC-01's field).

Every call is `AbortSignal.timeout`-bounded (5s) and fails closed on non-2xx, timeout, network
error, or a malformed/unparseable response body — only an opaque `response_ref` (CLT-01's own
`outcome_id`/`authorised_party_id`) is ever extracted; the raw response body and the CLT-01 token
are never logged or returned.

`lib/clt1-outcome-mapping.ts` — pure, DB-free. `deriveEffectiveStatus` reads
`screening_match.match_status` values, never `screening_result.overall_status` directly (a
correction from the accepted Phase 2 planning report: `dismissed` is a match-level value, there is
no result-level `dismissed`). Precedence: any `confirmed_hit` → `confirmed_hit`; else any
`potential_match` → `potential_match`; else (all `dismissed`) → `clear_after_review`; zero matches
→ `clear`. Two independent per-endpoint mappings (CLT-01 exposes different vocabularies and
different lifecycle preconditions per endpoint): application-level `clear`/`clear_after_review`→
`pass`, `potential_match`→`pending`, `confirmed_hit`→`hit` (always plans BOTH `aml_sanctions` and
`pep_adverse_media`, the latter driven by `pep`+`adverse_media` matches since CLT-01 fuses them);
authorised-party-level `clear`/`clear_after_review`→`clear`, `potential_match`→`review_required`,
`confirmed_hit`→`hit`.

### 3.3 Routes and transaction/delivery model

Three new routes, all internal-identity-guarded, TypeBox `additionalProperties:false`:
- `POST /internal/aml1/screening-requests/:screening_request_id/clt-outcome`
- `POST /internal/aml1/clt-outcome-deliveries/:delivery_id/retry`
- `GET /internal/aml1/clt-outcome-deliveries/:delivery_id`

Two-phase delivery model (no HTTP call inside any DB transaction, structurally verified — the
`deliverApplicationOutcome`/`deliverAuthorisedPartyOutcome` calls in `attemptDelivery` sit strictly
before `withTransaction` in source order): TX1 inserts the delivery row `pending` and publishes
`aml1.clt_outcome_delivery_attempted`, commits; the HTTP call happens outside any transaction; TX2
updates the delivery to `succeeded`/`failed`, increments `attempt_count`, records
`response_ref`/`failure_reason_code`, publishes `aml1.clt_outcome_delivery_succeeded`/`_failed`,
commits. A crash between TX1 and TX2 leaves a retriable `pending` row. Retrying an already-
`succeeded` delivery returns `AML1_DELIVERY_INVALID_STATE` (409). At-least-once delivery is the
approved posture — a duplicate successful CLT-01 receipt is safe-but-noisy (proven against a real
listening CLT-01: a second delivery call creates a second `cdd_outcome` row but the rollup column
still converges correctly to the latest value); CLT-01 was not modified to add idempotency.

`subject_parent_ref` is accepted (optional) at screening-request creation and never re-requested at
delivery time — a missing value for an `authorised_party` delivery attempt returns
`AML1_CLT_OUTCOME_NOT_DELIVERABLE` (409) rather than falling back to asking the caller or calling
CLT-01 to look it up.

### 3.4 `AML1_CLT_DELIVERY_FAILED` reachability (micro-stabilization pass)

The first implementation round left `AML1_CLT_DELIVERY_FAILED` registered but unreachable — a
failed delivery was recorded as evidence but the route always returned 20x. A micro-stabilization
pass (after the first independent Opus review round) closed this: both the delivery and retry
routes now throw `AML1_CLT_DELIVERY_FAILED` (502) — but only AFTER TX2 has already durably
committed the failed-delivery row and its audit event. The failed row remains fully queryable via
`GET .../clt-outcome-deliveries/:delivery_id` and remains retriable — the throw changes only what
the original caller sees, never what is persisted. Error `details` carry only AML-01's own
`delivery_id`/`failure_reason_code` evidence, never a raw CLT-01 response body or PII.

### 3.5 Real CLT-01 integration test and the parallelism-collision fix

`tests/integration/aml1-clt1-outcome-delivery-real.test.ts` builds and LISTENS a real CLT-01 app
(`services/clt1/src/server.ts`'s `buildApp`) and calls AML-01's own `lib/clt1-client.ts` against it
over real HTTP — proving the genuine `under_review` precondition (delivery to a `draft`/`submitted`
application is genuinely rejected by CLT-01 itself) and genuine rollup convergence (including an
at-least-once duplicate-delivery case), not a stub-only positive path.

The first version of this test shared the same physical test database every other integration test
uses, and could intermittently fail under the suite's default file-level parallelism because
`clt1-db.test.ts`'s own `afterEach` (unscoped `DELETE FROM clt1.client_application` etc. — correct
for its own single-writer assumption) could fire in a different worker mid-flight through this
file's multi-request CLT-01 lifecycle walk. **Fixed without touching any CLT-01 production or test
code**: the test now provisions its own private, uniquely-named throwaway database in `beforeAll`
(via node-pg-migrate's programmatic `runner()` API — the same one `npm run migrate:up` uses — plus
all 7 grant files applied directly), and drops it in `afterAll`. No other test file can ever see
this database, eliminating the collision by construction. Independently reproduced twice, each
against a genuinely fresh database, under DEFAULT file-level parallelism: 77/77 files, 1388/1388
tests, zero failures both times — no `--no-file-parallelism` flag needed or recommended.

### 3.6 Audit/outbox and PII

`aml1.clt_outcome_delivery_attempted`/`_succeeded`/`_failed` — all transaction-coupled to the write
they describe. Metadata carries only `screening_request_id`/`delivery_id`/`target`/`outcome_type`/
`delivered_status`/`effective_status`/`status`/`reason_code`/`subject_type`/`subject_ref` (+
`subject_parent_ref` for party-level deliveries) — independently swept for 19 PII/secret terms
(subject names, registration numbers, DOB, matched_name, match_detail, scores, tokens) across every
real `aml1.clt_outcome_delivery*` audit payload, all clean.

### 3.7 Error model

Five reachable Phase 2A codes: `AML1_SCREENING_REQUEST_INVALID_STATE` (409 — delivery attempted on
a non-`completed` request), `AML1_DELIVERY_NOT_FOUND` (404), `AML1_DELIVERY_INVALID_STATE` (409 —
retry on an already-`succeeded` delivery), `AML1_CLT_DELIVERY_FAILED` (502 — see §3.4),
`AML1_CLT_OUTCOME_NOT_DELIVERABLE` (409 — missing `subject_parent_ref` for a party delivery, or a
structural missing-`screening_result` invariant violation). No Phase 2B code added
(`AML1_SCREENING_MATCH_NOT_FOUND`/`AML1_MATCH_INVALID_STATE`/`AML1_DISPOSITION_*`/
`AML1_PERMISSION_DENIED`/`AML1_APPROVAL_REQUIRED`/`AML1_IAM2_UNAVAILABLE`/
`AML1_SELF_DISPOSITION_BLOCKED`/`AML1_SENSITIVE_READ_FORBIDDEN` all remain absent from the
catalogue).

### 3.8 Sonnet self-review outcome

**Verdict: ACCEPT.** Two real defects found and fixed before Opus review: `AML1_CLT_DELIVERY_FAILED`
unreachability (§3.4) and the real-CLT-01 test's parallelism collision (§3.5) — both closed in a
dedicated micro-stabilization pass, not left as residual notes.

### 3.9 Independent Opus review outcome

**Verdict: ACCEPT WITH LOW FINDINGS.** Zero Critical/High/Medium findings.

- **1388/1388 full suite passing** (77 files, 0 failures — 1317 baseline + 71 new), independently
  reproduced TWICE, each from a genuinely fresh disposable Postgres, under default file-level
  parallelism; `tsc -b --force` clean.
- Migration `034` + `aml1_runtime_grants.sql` independently reproduced clean on both runs.
- Grant matrix independently confirmed exact at the `information_schema` level AND live-enforced
  under the real runtime role via direct `SET ROLE` probes — every immutable column denied
  (`delivered_status`/`effective_status`/`target`/`requested_by`/`subject_parent_ref`), the six
  mutable delivery columns confirmed writable, `DELETE` denied.
- F3(c) import boundary independently re-derived (every specifier in `services/aml1/src` is either
  own-tree relative, `@aix/foundation`, `@sinclair/typebox`, `fastify`, or `node:crypto`).
- Route surface independently enumerated: exactly the 7 approved `/internal/aml1/*` paths, no
  public route.
- 19 PII/secret terms swept clean across all real `aml1.clt_outcome_delivery*` audit payloads.
- Throwaway-DB isolation independently confirmed genuine: 0 leftover databases before and after the
  real-CLT-01 test run, 0 rows left in the shared test DB; zero CLT-01 file touched (confirmed by
  file mtimes).
- **No code changed during the Opus review.**
- Two Low, three Informational, non-blocking findings: **Low-1** `delivered_status` has no CHECK
  constraint, unlike its sibling enum-like columns (not live-reachable — the mapping library is a
  total function over a closed TypeScript union, and the column carries no UPDATE grant); **Low-2**
  `failure_reason_code` is written from CLT-01's `error.code` with no length clamp before the
  `varchar(64)` column (no live risk — longest real code observed is 40 chars — but an oversized
  value from an untrusted intermediary would fail safe as a misleading `AML1_AUDIT_REQUIRED` rather
  than a clean rejection); **Info-1** a partial-failure response discards the succeeded delivery's
  ID, recoverable only from free-text `details[].issue`, not a structured field; **Info-2**
  `delivery_id`'s index duplicates its own UNIQUE-created index (mirrors migration 033's own
  accepted precedent); **Info-3** the real-CLT-01 test leaves one cluster-global LOGIN role
  uncleaned, consistent with every other integration test file's existing convention.
- Residual findings assessed and accepted as non-blocking carry-forwards, not fixed this pass.

---

**AML-01 — accepted implementation baseline through Phase 2A.** Carry-forwards into Phase 2B:
Low-1/Low-2/Info-1/Info-2/Info-3 above (§3.9); no CLT-01 callback beyond the two existing receipt
endpoints; no human match disposition / maker-checker yet; no AML-01 IAM-02 permissions yet (first
ones must be `licence_locked=false` from day one — the CFG-01 F-1 lesson — with
real-listening-IAM-02 guard tests, never stub-only); no sensitive-read path for full match detail
yet; `screening_match` still carries zero UPDATE grant (Phase 2B's disposition workflow needs its
first deliberate column-scoped grant there, keeping `matched_name`/`match_detail`/`score` immutable);
post-disposition re-delivery should reuse the existing Phase 2A delivery routes unchanged; the
interim shared-token identity model remains a platform-wide carry-forward.

## 4. Phase 2B — ACCEPTED implementation baseline after independent Opus review — human match disposition + IAM-02 + sensitive read

**Approved scope:** an AML-01-owned IAM-02 client, AML-01's first 4 IAM-02 permissions, a PII-free
match-inventory route, a sensitive-detail read route, and the confirm/dismiss disposition
request/apply workflow with strict SoD. Post-disposition re-delivery reuses the EXISTING Phase 2A
delivery route unchanged. No real vendor/list integration, no continuous/periodic monitoring, no
wallet/Travel Rule/deposit/withdrawal/trading/settlement/Exchange scope, no Phase 3 feature.

### 4.1 Schema and grants

Migration `infra/migrations/035_aml1_match_disposition.cjs` — additive only, no role created, no
seed data:
- `aml1.screening_match` gains five review columns: `reviewed_by` (the disposition requester/maker
  — never the IAM-02 approver, whose identity `execute-verify` never exposes), `reviewed_at_utc`,
  `approval_id`, `version`, `updated_at_utc`. `matched_name`/`match_detail`/`score`/`category`/
  `list_source`/`screening_result_id`/`screening_match_id`/`created_at_utc` are untouched and never
  gain an UPDATE grant — permanently immutable.
- `aml1.match_disposition_decision_request` — a new request/apply binding table, the same shape
  every prior maker-checker table in this codebase uses (mirrors CLT-01's own
  `duplicate_candidate_decision_request`): `payload_hash` snapshotted at request time and
  recomputed from the stored row at apply time, `decision_token_hash` (never the raw token) written
  only on apply.
- Phase 2A carry-forward fix (Low-1): `aml1.clt_outcome_delivery.delivered_status` gains a CHECK
  constraint covering the exact 5 values the outcome-mapping library ever writes.

`infra/migrations/036_iam2_register_aml1_permissions.cjs` registers AML-01's first 4 IAM-02
permissions — `aml1.screening.read`/`aml1.screening.sensitive_read` (`requires_approval=false`),
`aml1.match.confirm`/`aml1.match.dismiss` (`requires_approval=true`) — all `licence_locked=false`
(the CFG-01 F-1 lesson applied proactively, not discovered by a later review pass), zero
`role_permission` seed.

`infra/grants/aml1_runtime_grants.sql` extended: `screening_match`'s FIRST-EVER UPDATE grant,
column-scoped to exactly `{match_status, reviewed_by, reviewed_at_utc, approval_id, version,
updated_at_utc}`; `match_disposition_decision_request` gets `SELECT`/`INSERT` + column-scoped
`UPDATE` limited to exactly `{status, approval_id, decision_token_hash, applied_at_utc}`. Still zero
`DELETE`/`TRUNCATE` anywhere, zero grant into `iam2` or any other module's schema. Independently
proven LIVE (not just read from the SQL): every PII/evidence column on `screening_match` denied
under `role_aml1_runtime` via direct `SET ROLE` probes, `match_status` confirmed writable.

### 4.2 IAM-02 client

`lib/iam2-client.ts` — AML-01's own copy (F3(c), never imports `services/iam2/**`). Wraps
`POST /internal/iam2/permission/check` (baseline, advisory-only) and
`POST /internal/iam2/permission/execute-verify` (the real gate for confirm/dismiss/apply). Every
call is `AbortSignal.timeout`-bounded (5s) and fails closed on deny/`licence_locked`/non-2xx/
timeout/network-error/malformed body/`execution_authorised !== true`. `checkPermission`'s baseline
treats `allow`/`approval_required`/`step_up_required` all as a pass — the CFG-01 Phase 3A F-1 shape
applied here from day one, never discovered by a later review pass; the real gate for confirm/
dismiss is always the separate `verifyDecisionToken` call. Neither the IAM-02 token nor the decision
token is ever logged.

### 4.3 Routes

Six new routes, all internal-identity-guarded, TypeBox `additionalProperties:false`:
- `GET /internal/aml1/screening-requests/:screening_request_id/matches` — PII-free match inventory
  (`screening_match_id`/`category`/`match_status`/`reviewed_at_utc` only), gated by
  `aml1.screening.read`. Exists because no prior AML-01 route ever returns `screening_match_id` —
  without it, disposition would be unreachable.
- `GET /internal/aml1/matches/:screening_match_id/sensitive-detail` — the ONLY AML-01 route ever
  returning `matched_name`/`match_detail`/`score`/`list_source`, gated by
  `aml1.screening.sensitive_read`. Write-before-return, same-transaction, fail-closed
  `aml1.sensitive_match_detail_read` audit — if the audit write fails, the read fails as
  `AML1_AUDIT_REQUIRED`, no unlogged sensitive disclosure.
- `POST .../matches/:screening_match_id/{confirm,dismiss}/request` — fetches the match, validates
  `match_status='potential_match'`, enforces strict SoD (disposition requester != the original
  screening request's own `requested_by`, else `AML1_SELF_DISPOSITION_BLOCKED`), calls IAM-02
  baseline `checkPermission`, computes `payload_hash` over `{decision_id, screening_match_id,
  decision_type, reason, requested_by}`, inserts the decision row (`status='requested'`), publishes
  `aml1.match_disposition_requested`.
- `POST .../matches/:screening_match_id/{confirm,dismiss}/apply` — fetches the STORED decision row,
  recomputes `payload_hash` from it (never from caller-supplied apply input), calls IAM-02
  `verifyDecisionToken` bound to the decision row's own `requested_by` (the maker, never the
  approver), then inside a transaction locks both the decision row and the match row
  (`SELECT...FOR UPDATE`), re-checks both under lock, updates `screening_match` and the decision
  row, publishes `aml1.match_disposition_confirmed`/`_dismissed`. Returns the safe match projection
  plus `redelivery_required:true` and `screening_request_id`. Only `fingerprint(decision_token)` is
  ever stored, never the raw token.

Both `potential_match->confirmed_hit`/`dismissed` are terminal — no re-open path; a race loser
resolves to a clean `AML1_DISPOSITION_INVALID_STATE` (decision already applied) or
`AML1_MATCH_INVALID_STATE` (match already resolved by a different decision), never a silent
double-apply.

### 4.4 Post-disposition re-delivery

Disposition apply does NOT auto-call CLT-01 and does not pre-create pending delivery rows. The
apply response includes `redelivery_required:true` + `screening_request_id`; the caller must
explicitly invoke the EXISTING Phase 2A `POST .../screening-requests/:id/clt-outcome` route. Proven
end-to-end with zero changes to `lib/clt1-outcome-mapping.ts`: a dismissed match re-delivers as
`clear_after_review`/`pass`; a confirmed_hit match re-delivers as `confirmed_hit`/`hit`; new
delivery rows are created and the earlier delivery's own rows remain untouched.

### 4.5 Phase 2A carry-forward fixes

**Low-1 fixed:** `delivered_status` CHECK constraint added in migration 035 (§4.1). **Low-2 fixed:**
`clampFailureReasonCode` in `lib/clt1-client.ts` clamps CLT-01's `error.code` to 64 chars before it
reaches the `varchar(64)` column. Info-1/Info-2/Info-3 deliberately deferred, as instructed.

### 4.6 Error model

Exactly 8 new codes, each with a reachable throw site: `AML1_SCREENING_MATCH_NOT_FOUND`,
`AML1_MATCH_INVALID_STATE`, `AML1_DISPOSITION_NOT_FOUND`, `AML1_DISPOSITION_INVALID_STATE`,
`AML1_PERMISSION_DENIED`, `AML1_APPROVAL_REQUIRED`, `AML1_IAM2_UNAVAILABLE`,
`AML1_SELF_DISPOSITION_BLOCKED`. `AML1_SENSITIVE_READ_FORBIDDEN` deliberately not added (identical
condition to `AML1_PERMISSION_DENIED`). No vendor/monitoring/revocation/wallet/trading code.

### 4.7 Audit/outbox and PII

Four new transaction-coupled events: `aml1.match_disposition_requested`/`_confirmed`/`_dismissed`,
`aml1.sensitive_match_detail_read`. `aml1.match_disposition_rejected`/`_failed` deliberately not
added (no reject/failed route exists this phase). No PII in any metadata (no `matched_name`/
`match_detail`/`score`/`list_source`/subject PII/disposition reason free text/decision token/IAM-02
token). `req.body.reason` and `req.body.decision_token` added to `AML1_LOG_REDACT_PATHS`.

### 4.8 Sonnet self-review outcome

**Verdict: ACCEPT.** Two real defects found and fixed before Opus review: the sensitive-detail route
originally returned an extra `screening_match_id` field beyond the approved 6-field set (removed —
the caller already has the ID from the URL param); a stale exhaustive-list assertion in
`aml1-log-redaction.test.ts` had not been updated after the 2 new Phase 2B redaction paths were
added (fixed). Both caught during implementation, before any result was reported.

### 4.9 Independent Opus review outcome

**Verdict: ACCEPT WITH LOW FINDINGS.** Zero Critical/High/Medium findings.

- **1464/1464 full suite passing** (80 files, 0 failures — 1388 baseline + 76 new), independently
  reproduced TWICE, each from a genuinely fresh disposable Postgres, under default file-level
  parallelism; `tsc -b --force` clean.
- Migrations 001->036 + all 7 grant files independently reproduced clean on both runs.
- Grant matrix independently confirmed exact at the `information_schema` level: `screening_match`'s
  6-column UPDATE grant, `match_disposition_decision_request`'s 4-column UPDATE grant, zero
  DELETE/TRUNCATE anywhere, the only cross-schema grant in the entire role remains
  `foundation.outbox_event:INSERT`.
- Migration 035/036 down-migration independently verified to cleanly remove all 4 permissions, the
  new table, and all 5 new `screening_match` columns.
- IAM-02 permission catalogue independently queried: exactly 4 rows, all `licence_locked=false`,
  correct `requires_approval` flags, zero `role_permission` seed — verified against the real,
  listening IAM-02 guard, not a stub.
- Code-only sweep of `services/aml1/src` for 19 out-of-scope terms (vendor/watchlist/fuzzy/
  monitoring/wallet/Travel Rule/deposit/withdrawal/trading/settlement/Exchange/etc.) returned zero
  real violations.
- Status docs confirmed untouched prior to this sync (mtimes predated the implementation work).
- **No code changed during the Opus review.**
- Three Low, non-blocking findings: **Low-1** IAM-02 unreachability during `verifyDecisionToken`
  (execute-verify) is collapsed to `AML1_APPROVAL_REQUIRED`/403 rather than distinguished as
  `AML1_IAM2_UNAVAILABLE`/503 (the four `checkPermission` call sites in the same file DO make this
  distinction) — fail-closed either way, no security impact, a diagnostics-accuracy nit; **Low-2**
  the sensitive-detail route fetches the match row (including PII columns) and throws
  `AML1_SCREENING_MATCH_NOT_FOUND` before calling `checkPermission`, while the inventory route in
  the same file checks permission first — an unpermissioned caller gets a 404-vs-403 existence
  oracle and the PII row is materialised in-process before authorization is established (low risk:
  opaque UUID IDs, enumeration impractical); **Low-3** no regression test proving the disposition
  `reason` free text stays out of audit metadata — holds by inspection (the metadata object literals
  at both the request and apply audit call sites never include `reason`), but the existing
  PII-sweep test executes before any Phase 2B event is emitted, so it doesn't cover this case.
- Residual findings assessed and accepted as non-blocking carry-forwards, not fixed this pass.

---

**AML-01 — accepted implementation baseline through Phase 2B.** Carry-forwards into Phase 3:
Low-1/Low-2/Low-3 above (§4.9); Phase 2A Info-1/Info-2/Info-3 (unchanged, still deferred); the
residual approver-side SoD gap (IAM-02's own `execute-verify` never exposes approver identity — a
platform-wide inherited limitation, not AML-01-specific); the interim shared-token identity model
(now materially more consequential — Phase 2B is the first AML-01 surface returning sanctions/PEP/
adverse-media PII and the first that mutates a compliance decision); AML-01 still screens on a
deterministic stub adaptor, not a real vendor/list integration.

## 5. Phase 3A — ACCEPTED implementation baseline after independent Opus review — micro-hardening (Phase 2B Low-finding closure)

**Approved scope:** close all three Phase 2B Low findings. No migration, schema change, grant
change, route, or permission — pure micro-hardening ahead of Phase 3B's vendor/list adaptor
boundary work.

### 5.1 Low-1 — IAM-02 execute-verify unavailability

`routes/matches.ts`'s confirm/dismiss apply handler previously collapsed every `verifyDecisionToken`
failure to `AML1_APPROVAL_REQUIRED`/403, including genuine IAM-02 unavailability. Fixed with the
same `reason === "iam2_unavailable"` ternary already used at every `checkPermission` call site in
the file:

```ts
if (!verify.authorised) throw new Aml1Error(verify.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_APPROVAL_REQUIRED");
```

`lib/iam2-client.ts` was NOT modified — `verifyDecisionToken` already returned the distinguishing
`reason` on its failure branch. The throw precedes the transaction entirely, so neither the decision
row nor `screening_match` is ever mutated on either failure path; a decision left `requested` by an
unavailability failure is provably retriable once IAM-02 recovers (regression-tested). `lib/errors.ts`'s
header doc-comment for `AML1_IAM2_UNAVAILABLE` was corrected in the same pass — it now documents
both reachable throw sites (`checkPermission` AND `verifyDecisionToken`), comment-only,
`AML1_ERROR_CODES` itself byte-identical.

### 5.2 Low-2 — sensitive-detail existence oracle

The sensitive-detail route previously fetched the `screening_match` row (materialising PII columns
in-process) BEFORE calling `checkPermission`, so an unpermissioned caller could distinguish "match
exists" (403) from "match doesn't exist" (404). Fixed by reordering: `checkPermission` now runs
first; the row query — and the 404 check — run only after a permission pass. Write-before-return,
same-transaction, fail-closed `AML1_AUDIT_REQUIRED` on audit failure, and the exact 6-field response
projection are all unchanged.

### 5.3 Low-3 — disposition reason regression test

New integration test proves the property that previously held only by inspection: a disposition's
`reason` free text is genuinely stored as evidence on `match_disposition_decision_request.reason`
(asserted non-vacuously) while never appearing in any `aml1.match_disposition_*` audit
`payload_ref`. Does not relocate or weaken the existing file-level PII sweep.

### 5.4 Sonnet self-review outcome

**Verdict: ACCEPT.** One real defect found and fixed before the official validation runs: the first
draft of the Low-3 test queried a nonexistent `foundation.outbox_event.entity_id` column (entity
references live inside `payload_ref`, not a separate column) — caught by the first test run, fixed
by scoping the sweep to `event_type LIKE 'aml1.match_disposition_%'`, matching the file's existing
PII-sweep idiom, before running the two official fresh-DB confirmations.

### 5.5 Independent Opus review outcome

**Verdict: ACCEPT.** Zero Critical/High/Medium/Low findings.

- **1468/1468 full suite passing** (80 files, 0 failures — 1464 baseline + 4 new), independently
  reproduced TWICE, each from a genuinely fresh disposable Postgres, under default file-level
  parallelism; `tsc -b --force` clean.
- Migrations 001→036 confirmed unchanged (no migration 037 exists) + all 7 grant files clean on
  both runs.
- Route tree (13), `aml1.*` IAM-02 permission count (4), `aml1` schema table count, and
  `role_aml1_runtime`'s full grant matrix independently confirmed byte-identical to the Phase 2B
  baseline at the `information_schema` level.
- Cross-module consistency check: CLT-01 and CFG-01 both collapse ALL execute-verify failures to a
  single `_APPROVAL_REQUIRED`-style code at 10 combined call sites — confirmed by direct grep, not
  fixed this phase (out of AML-01's scope), logged as a new platform-wide carry-forward.
- Code-only sweep of `services/aml1/src` for Phase 3B/3C terms (provider registry, vendor adaptor,
  rescreen, monitoring, risk signal, `subject_nature`, provider attempt, vendor evidence) returned
  zero new hits.
- Status docs confirmed untouched prior to this sync (mtimes predated the implementation work by
  hours).
- **No code changed during the Opus review.**
- Three informational, non-blocking observations: **I-1** one theoretical branch of the Low-1 fix
  (IAM-02 responding 200 with `execution_authorised: false`) would still map to 503 rather than 403,
  but the IAM-02 client's own header comment documents this shape as unreachable against the real
  execute-verify route (which always returns non-2xx on failure) — confirmed by the real-guard test
  suite, left as-is rather than editing the client for an untriggerable branch; **I-2** CLT-01 and
  CFG-01 still collapse execute-verify unavailability into approval-required-style errors (§5.5
  above) — NEW platform-wide carry-forward, identified by this review; **I-3** the `lib/errors.ts`
  doc-comment correction (§5.1) is comment-only, verified byte-identical elsewhere.
- Residual findings assessed and accepted as non-blocking carry-forwards, not fixed this pass.

---

**AML-01 — accepted implementation baseline through Phase 3A.** Carry-forwards into Phase 3B:
Phase 2A Info-1/Info-2/Info-3 (unchanged, still deferred); the residual approver-side SoD gap
(platform-wide, not AML-01-specific); the interim shared-token identity model (increasingly
consequential as AML-01's PII/compliance-mutation surface expands); the NEW platform-wide
carry-forward that CLT-01/CFG-01 still collapse execute-verify unavailability into approval-required-
style errors (§5.5 I-2); the Phase 3B architectural prerequisite that the Phase 1 screening lifecycle
(`routes/screening.ts`) must be restructured so a future provider call runs OUTSIDE the DB
transaction, mirroring Phase 2A's own two-phase delivery model, before any real vendor/list adaptor
can land; AML-01 still screens on a deterministic stub adaptor.

## 6. Phase 3B — ACCEPTED implementation baseline after independent Opus review — two-phase screening lifecycle + provider adaptor boundary

**Approved scope:** close the Phase 3A architectural prerequisite (restructure the screening
lifecycle so the provider call runs outside any transaction), introduce AML-01's own provider
adaptor boundary with the deterministic stub as the sole registered provider, `subject_nature`,
nullable `score`, and the provider-status route. No real vendor, no Phase 3C feature.

### 6.1 Migration 037 — schema

`aml1.screening_provider_attempt` — one row per screening attempt, `pending → succeeded/failed`,
mirrors the two-phase shape CLT-01 delivery (034) and AML-01's own disposition (035) already use.
`provider_list_version` distinct from `provider_adaptor_version` (list/data version vs. adaptor
build); `request_payload_hash`/`response_payload_hash` are `fingerprint()`s — the raw payload is
never retained. `aml1.screening_subject_snapshot.subject_nature` (`individual`/`entity` CHECK).
`aml1.screening_match.score` — `NOT NULL` dropped.

### 6.2 Migration 038 — IAM-02 permission

`aml1.provider.read` — AML-01's 5th permission, `licence_locked=false`, `requires_approval=false`,
zero `role_permission` seed — the CFG-01 F-1 lesson applied consistently.

### 6.3 Provider adaptor boundary

`lib/providers/types.ts` (`ScreeningProvider` interface, `ProviderScreeningOutcome` =
`screened`/`unavailable`/`invalid_response`), `lib/providers/stub-provider.ts` (the deterministic
stub moved here byte-identical to its pre-Phase-3B fixtures — every existing test using
`"AML1 TEST SANCTIONED ENTITY"` etc. keeps passing unmodified — plus 3 new fixtures: malformed
response, unknown category, null score), `lib/providers/registry.ts` (`screenViaProvider` is the
ONE invocation point, 5s timeout via `Promise.race`, throw/reject/timeout all map to `unavailable`,
NO always-clear fallback ever). `routes/screening.ts` imports the registry only — never the stub
directly, never a vendor SDK (confirmed by grep: zero network primitives anywhere in
`lib/providers/`).

### 6.4 Configuration and production boot guard

`AML1_SCREENING_PROVIDER` defaults to the stub in dev/test, validated against the registry's
known-id set, fail-closed on an unknown id. **Fails closed at boot** (`CONFIGURATION_INVALID`) if
`ENVIRONMENT=prod` and the provider is still the stub — implemented in `loadAml1Config`, which is
the only path `index.ts` (the real production entrypoint) ever calls before `buildApp`.
`screeningProviderImpl` is a test-only DI seam (never populated from env), mirroring
`clt1FetchImpl`/`iam2FetchImpl` exactly.

### 6.5 Two-phase screening lifecycle

`POST .../screening-requests` restructured: TX1 (request `requested` + subject snapshot including
`subject_nature` + provider attempt `pending`, publish `aml1.screening_request_created`, commit) →
provider call OUTSIDE any transaction, timeout-bounded → TX2 (attempt outcome; on success,
`screening_result`/`screening_match` rows + request `completed`, publish `aml1.screening_completed`;
on ANY failure, request `failed`, no result/match row ever written, publish `aml1.screening_failed`)
→ commit BEFORE either throw. HTTP response contract UNCHANGED, stays synchronous — no async/polling.
No retry/resume route this phase.

Independently verified two ways: structurally, by the provider call's line position strictly between
TX1's close and TX2's open; and behaviourally, by a witness-provider integration test whose
`screen()` implementation queries the database over a SEPARATE connection before resolving, and
observes TX1's `requested`/`pending` state already committed.

### 6.6 subject_nature and payload minimization

`subject_nature` (`individual`/`entity`) is a REQUIRED top-level body field, CALLER-SUPPLIED, never
derived by AML-01, stored on `screening_subject_snapshot`. `lib/screening.ts`'s
`buildProviderScreeningPayload` sends `registration_number` only for `entity`, `date_of_birth`/
`nationality` only for `individual`; `subject_ref`/`screening_request_id`/`requested_by`/
`provenance` are NEVER sent (proven both by unit test and by an integration test capturing the
actual payload a spy provider receives). Empty optional fields omitted, never sent as empty strings.
Raw payload never stored/returned/audited/logged — only `fingerprint()` hashes retained. No new
log-redaction path was needed (§6.9 I-2).

### 6.7 Normalization and score nullability

`normalizeProviderMatches` maps raw provider matches onto AML-01's closed `sanctions`/`pep`/
`adverse_media` set; an unknown category returns `null` → the route throws
`AML1_VENDOR_RESPONSE_INVALID` — never bucketed into `adverse_media`, never silently dropped. A
provider can only ever produce `clear`/`potential_match` (`deriveOverallStatus`) — `confirmed_hit`
remains exclusively human-disposition's own output (Phase 2B, unchanged). `score` is clamped into
`[0,1]`/3dp or preserved as `NULL` (decision D3 — never a misleading `0.000` sentinel); `NULL` score
is handled end-to-end by sensitive-detail (returns `null`, HTTP 200) and by disposition
(confirm/dismiss unaffected). `list_source`/`matched_name`/`match_detail`/`failure_reason_code` all
clamped to their column widths.

### 6.8 Provider-status route

`GET /internal/aml1/provider/status` (14th route) — IAM-02-gated (`aml1.provider.read`), returns
`{active_provider_id, adaptor_version, environment, stub_provider}` only; no credentials, no tokens,
no secrets, no base URLs, no live vendor health call this phase.

### 6.9 Sonnet self-review outcome

**Verdict: ACCEPT.** No defects found requiring correction during this pass — the first full-suite
run against a genuinely fresh dev database passed 82/82 clean. One pre-emptive precaution: having
been bitten by an assumed-but-nonexistent `outbox_event.entity_id` column in Phase 3A, the Phase 3B
PII-sweep test was written event-type-scoped from the start.

### 6.10 Independent Opus review outcome

**Verdict: ACCEPT WITH LOW FINDINGS.** Zero Critical/High/Medium findings.

- **1524/1524 full suite passing** (82 files, 0 failures — 1468 baseline + 56 new), independently
  reproduced TWICE, each from a genuinely fresh disposable Postgres, under default file-level
  parallelism; `tsc -b --force` clean.
- Migrations 001→038 + all 7 grant files independently reproduced clean on both runs.
- `screening_provider_attempt`'s 8-column UPDATE grant live-proven under the real runtime role;
  append-once columns (`attempt_id`/`screening_request_id`/`provider_id`/
  `provider_adaptor_version`/`request_payload_hash`/`created_at_utc`) confirmed denied.
- `aml1.provider.read` independently confirmed: `licence_locked=false`, `requires_approval=false`,
  zero `role_permission` seed — AML-01 permission count now 5, all `licence_locked=false`.
- Zero CLT-01 source file touched (mtimes 4+ days stale at review time).
- Code-only sweep for Phase 3C/real-vendor terms (provider SDK, network primitives) — zero hits;
  confirmed `routes/screening.ts` imports the registry only, never the stub directly.
- Down-migrations 038→037 independently verified TWICE: once immediately-after-up, and once by
  DIRECTLY REPRODUCING the flagged risk — seeding a `score = NULL` row and attempting the rollback.
  It fails (`column "score" ... contains null values`), but the failure is fully ATOMIC: the
  permission, the table, the column, and the NULL-score row are all still intact afterward — no
  partial schema state, no data loss.
- **No code changed during the Opus review.**
- One Low, three Informational, non-blocking findings: **Low-1** migration 037's down-migration
  restores `score SET NOT NULL` unconditionally — confirmed by direct reproduction to fail safely
  and atomically when populated NULL scores exist; rollback past migration 037 in a populated
  environment requires manual NULL-score remediation (or a forward-fix plan) first; **I-1** the
  production stub boot guard lives in `loadAml1Config` rather than `buildApp` — the real production
  entrypoint (`index.ts`) is fully covered; a `buildApp`-level second layer may be considered later
  as belt-and-braces; **I-2** no new provider request/response log-redaction paths were added — a
  deliberate spec deviation, since the provider payload is never attached to any Fastify
  request/reply object Pino would serialize, so no `req.*`/`res.*` path exists to redact; **I-3**
  `AML1_SCREENING_PROVIDER_UNAVAILABLE` (503) and `AML1_VENDOR_RESPONSE_INVALID` (502) use
  deliberately different HTTP statuses (retry-later vs. upstream-untrustworthy) — no downstream
  caller yet distinguishes them; re-confirm the semantics once a real vendor lands.
- Residual findings assessed and accepted as non-blocking carry-forwards, not fixed this pass.

---

## 7. Phase 3C — ACCEPTED implementation baseline after independent Opus review — re-screening triggers + route-triggered monitoring runs + risk-signal emission

**Approved scope:** re-screening (manual / periodic_due / list_version_changed triggers only),
route-triggered monitoring runs (no external scheduler/cron/queue), risk-signal emission (AML-01
emits signals only, never freezes/blocks/debits/settles/trades/mutates any downstream module). No
real vendor, no KYC-verified provenance unlock, no Phase 4 feature.

### 7.1 Migration 039 — schema

`aml1.screening_request` gains nullable `rescreen_of_request_id` (points at the source request; NULL
for every original, non-re-screen row) and nullable `trigger_reason` (CHECK restricted to
`manual`/`periodic_due`/`list_version_changed` — `kyc_profile_changed`/`transaction_triggered`/
`remediation_check` deliberately excluded, deferred to phases after KYC-01/WLT-DEP-WDR-TRD/
case-management exist respectively). A partial unique index
(`idx_aml1_screening_request_one_inflight_per_subject`) enforces at most one in-flight
(`status='requested'`) request per `(subject_type, subject_ref)` — the authoritative loop-prevention/
concurrent-duplicate backstop behind `AML1_RESCREEN_NOT_ALLOWED`.

`aml1.monitoring_run` — one row per route-triggered batch; `trigger_reason` CHECK narrower than
`screening_request`'s own (`periodic_due`/`list_version_changed` only — no `manual`); `status`
`running → completed/failed`; no PII column of any kind (this table IS the safe summary
`GET .../monitoring-runs/:run_id` returns).

`aml1.risk_signal` — `signal_type` CHECK `confirmed_hit`/`potential_match_unresolved`/
`rescreen_overdue`; `severity` CHECK `low`/`medium`/`high`/`critical`; `status` CHECK
`open`/`acknowledged`/`superseded` (`superseded` schema-present, unreachable this phase);
`screening_request_id`/`screening_match_id` are optional evidence pointers, not real FKs (mirrors
every other AML-01 cross-reference column's posture). No PII column.

### 7.2 Migration 040 — IAM-02 permissions

Four new permissions, all `licence_locked=false`, all `requires_approval=false`, zero
`role_permission` seed: `aml1.rescreen.request` (resource `screening`), `aml1.monitoring.run`
(resource `monitoring_run` — gates both the create and read routes), `aml1.risk_signal.read` and
`aml1.risk_signal.acknowledge` (resource `risk_signal`). AML-01 permission count 5 → 9.

### 7.3 Runtime grants

`monitoring_run` — SELECT, INSERT, column-scoped UPDATE limited to
`status`/`candidates_selected`/`rescreens_created`/`failures`/`completed_at_utc`; `run_id`/
`trigger_reason`/`requested_by`/`request_id`/`correlation_id`/`started_at_utc`/`id` excluded — no
code path may ever rewrite which run this is, why it ran, or who ran it. `risk_signal` — SELECT,
INSERT, column-scoped UPDATE limited to `status`/`acknowledged_by`/`acknowledged_at_utc`; every
evidence/classification column stays immutable after emission, forever.
`screening_request.rescreen_of_request_id`/`.trigger_reason` are INSERT-time only — the table's
existing `SELECT, INSERT` grant already covers them; deliberately NOT added to the existing
column-scoped UPDATE grant (`status`/`completed_at_utc`/`version`, unchanged since Phase 1/2A). No
DELETE/TRUNCATE anywhere; no grant into `iam2`/`clt1`/`cfg1`/`sec1`/`iam`; no WLT/DEP/WDR/TRD grant —
independently verified live at the `information_schema` level, not just read from the grant SQL.

### 7.4 Shared screening-execution core

`lib/screening-execution.ts` extracts the Phase 3B TX1 → provider-call → TX2 core out of
`routes/screening.ts`'s own inline implementation, split into `beginScreening` (TX1: insert request/
snapshot/provider-attempt, publish the created-event) and `completeScreening` (provider call OUTSIDE
any transaction + TX2: record the outcome, complete or fail the request, optionally emit
`potential_match_unresolved` signals). `executeScreening` composes both for the original create
route's unchanged single-call usage. `routes/screening.ts`'s own behaviour (audit event names, error
codes, response shape) is byte-identical after the extraction — proven by the full pre-existing
Phase 1-3B regression suite passing unmodified.

### 7.5 Re-screening — lib/rescreen.ts + routes/rescreen.ts

`POST /internal/aml1/screening-requests/:screening_request_id/rescreen` — IAM-02-gated
(`aml1.rescreen.request`), `trigger_reason` restricted to `manual`/`periodic_due`/
`list_version_changed` at the TypeBox schema level (the other three trigger values are structurally
impossible to submit, never reaching application code). `resolveRescreenSource` loads the source
request + its latest `screening_subject_snapshot` row and carries `declared_identity`/`provenance`/
`subject_nature` forward verbatim — the caller cannot resupply PII (the request body has no
`declared_identity` field at all; `additionalProperties: false` rejects one if supplied). A brand-new
`screening_request` row is created via the shared execution core; the source request/result/match
rows are never mutated (proven by a full-row equality test before/after). An in-flight duplicate for
the same subject is checked proactively (the common case) and, as a race-safe backstop, migration
039's own partial unique index — both paths map to `AML1_RESCREEN_NOT_ALLOWED` (409). Response
remains synchronous, same contract shape as the original create route.

`claimRescreen`/`completeRescreenClaim` expose the same logic as two separate calls (TX1-only claim,
then provider-call+TX2 complete) — `performRescreen` (used by this route) is implemented as the two
called back-to-back, so the direct route and monitoring's own batch flow (§7.6) can never drift
apart.

### 7.6 Monitoring — lib/monitoring.ts + routes/monitoring.ts

`POST /internal/aml1/monitoring-runs` (`trigger_reason` `periodic_due`/`list_version_changed` only —
`manual` rejected at the schema level) + `GET /internal/aml1/monitoring-runs/:run_id`, both gated by
`aml1.monitoring.run`. No external scheduler/cron/queue — a `monitoring_run` row exists only because
this route was called.

**Candidate selection** always resolves each subject's LATEST screening request first
(`DISTINCT ON (subject_type, subject_ref) ... ORDER BY created_at_utc DESC`); a subject whose latest
request is `requested` (in-flight) or `failed` is never selected — deliberate, not an oversight, and
the mechanism behind the Medium-1 finding below. `periodic_due`: latest completed screen's
`completed_at_utc` older than `AML1_RESCREEN_DUE_DAYS` (config, default 90). `list_version_changed`:
latest successful provider attempt's `provider_list_version` differs from the caller-supplied
`current_list_version` (required in the body for this trigger; no separate list-version registry
table exists — out of scope). Batch size caller-supplied, clamped to `AML1_MONITORING_BATCH_SIZE_MAX`
(config, default 200), defaulting to `AML1_MONITORING_BATCH_SIZE_DEFAULT` (config, default 50).

**Concurrency design (revised during implementation, before acceptance):** the first design held
`pg_advisory_xact_lock` only around the candidate-SELECT query. This does NOT prevent
double-processing — the first run's SELECT doesn't itself change any subject's "due" state, so a
second run's SELECT, running immediately after the first commits, would see the same subjects still
due and select them again. Caught by the implementation's own concurrency test before review.
**Fixed**: PHASE A (locked) — one dedicated connection holds the advisory lock across candidate
SELECTION *and* immediately CLAIMS every selected candidate (`claimRescreen`'s TX1 — reserving the
subject via migration 039's own partial unique index, each claim on its OWN pooled connection) —
only after every candidate is claimed does Phase A commit and release the lock. A second concurrent
run's SELECT can only begin once all of the first run's claims are visible (their subjects' latest
request is now `requested`, no longer "due"), so it naturally excludes them. PHASE B (unlocked) then
runs the provider call + TX2 for each claim (`completeRescreenClaim`) — deliberately outside the lock
and outside any held transaction, so concurrent runs serialize only on the fast claim step, never on
provider latency. Verified empirically: 5 due subjects, two concurrent monitoring-run requests,
each subject re-screened at most once across both runs.

`createMonitoringRun` + `rescreen_overdue` signal emission (periodic_due only — being selected under
that trigger IS the overdue condition) run before the claim loop, on the same held connection —
reduces (does not eliminate) the residual orphan window; see Medium-1.

**Status rule** (`finalizeMonitoringRun`): `failed` only when the run selected at least one candidate
and every single one failed (a systemic signal, e.g. the provider down for the whole batch);
`completed` otherwise, including the legitimate zero-candidate case and any run with at least one
success — a monitoring run may always complete PARTIALLY, and partial success is `completed`, not
`failed`. Each candidate is claimed and completed AT MOST ONCE — no unbounded retry inside one run; a
failed/unclaimed subject remains due for a future run.

### 7.7 Risk signals — lib/risk-signals.ts + routes/risk-signals.ts

`GET /internal/aml1/risk-signals` (`aml1.risk_signal.read`) — `subject_type`+`subject_ref` BOTH
mandatory query parameters (structural, not a soft cap — no global unbounded dump), `status`
optional filter, hard `LIMIT 200`. Returns exactly the approved 11-field safe projection — never
`matched_name`/`match_detail`/`score`/subject name/`registration_number`/DOB/nationality (the table
itself carries none of these).

`POST /internal/aml1/risk-signals/:signal_id/acknowledge` (`aml1.risk_signal.acknowledge`) — unknown
signal → `AML1_RISK_SIGNAL_NOT_FOUND` (404); non-open signal → `AML1_RISK_SIGNAL_INVALID_STATE` (409,
atomic `UPDATE ... WHERE status='open'` re-check); mutates only `status`/`acknowledged_by`/
`acknowledged_at_utc` — never `screening_request`/`screening_result`/`screening_match` or any
downstream module (proven by a full-row equality test on the match before/after acknowledge);
publishes `aml1.risk_signal_acknowledged`, no PII in metadata.

**Emission** (`emitRiskSignal`, always inside the caller's own transaction — never opens one of its
own): `confirmed_hit` fires atomically inside the existing `confirm`-apply transaction in
`routes/matches.ts` (never on `dismiss`), severity `critical`, status `open`. `potential_match_
unresolved` fires inside `completeScreening`'s TX2 for every match a re-screen surfaces (NOT the
original create route — confirmed decision D9's own "from monitoring/re-screen" wording), severity
`high` for `sanctions`, `medium` otherwise (`severityForUnresolvedMatch` — conservative, never
`critical`, which is reserved for a human-confirmed hit). `rescreen_overdue` fires for every
`periodic_due` candidate selected, severity `medium`. Duplicate suppression: match-keyed types
(`confirmed_hit`/`potential_match_unresolved`) dedupe on `screening_match_id`; `rescreen_overdue`
dedupes on `(subject_type, subject_ref)` — see Info-1 for reachability in practice.

### 7.8 Error model

Exactly four new codes, each with a reachable throw site: `AML1_RESCREEN_NOT_ALLOWED` (409),
`AML1_MONITORING_RUN_INVALID_STATE` (409, library-level only — see Low-2), `AML1_RISK_SIGNAL_
NOT_FOUND` (404), `AML1_RISK_SIGNAL_INVALID_STATE` (409). No `AML1_MONITORING_RUN_NOT_FOUND` — the
monitoring-run read route reuses `@aix/foundation`'s generic `NOT_FOUND` (mirrors CFG-01's own
kill-switch-apply precedent). No vendor-evidence/KYC-profile/transaction-screening/wallet/trading/
settlement code of any kind.

### 7.9 Audit/outbox and PII

Seven new transaction-coupled events: `aml1.rescreen_requested`/`_completed`,
`aml1.monitoring_run_started`/`_completed`/`_failed`, `aml1.risk_signal_emitted`/`_acknowledged`
(the pre-existing `aml1.screening_failed` is reused unchanged for a failed re-screen — no
`aml1.rescreen_failed` event exists). PII sweep: real declared-identity PII (name, registration
number, date of birth) seeded through a re-screen and swept from `outbox_event.payload_ref` across
all seven event types — confirmed absent, alongside `matched_name`/`match_detail`/raw provider
payload/vendor secret terms.

### 7.10 CLT-01 delivery impact

No CLT-01 source file touched. No new CLT-01 delivery target added. The existing Phase 2A
`POST .../clt-outcome` route continues to work unchanged for any `completed` screening request,
original or re-screen — it is keyed by `screening_request_id` and carries no restriction against a
re-screen-originated row.

### 7.11 Sonnet self-review outcome

The first monitoring-concurrency design (advisory lock around the candidate SELECT only) was caught
failing its own concurrency test — not by review, by the implementation's own test run — before any
review pass. Redesigned to the claim-inside-the-lock model (§7.6) and re-verified. A `routes/
monitoring.ts` code comment written to justify a related reorder (moving `createMonitoringRun` ahead
of the claim loop) was later found by the independent Opus review to state an incorrect rationale for
an otherwise-correct change (Low-1 below).

### 7.12 Independent Opus review outcome

**Verdict: ACCEPT WITH FINDINGS.** 1 Medium, 2 Low, 3 Informational. Zero Critical/High.

- **1581/1581 full suite passing** (82 files, 0 failures — 1524 baseline + 57 new), independently
  reproduced TWICE, each from a genuinely fresh disposable Postgres; `tsc -b --force` clean.
- Migrations 001→040 + all 7 grant files independently reproduced clean on both runs; no migration
  041; down-migrations 040→039 verified clean, a subsequent up round-trip reproduces an identical
  schema (9 permissions, columns restored).
- Grant boundary verified directly via `information_schema` (not just by reading the grant SQL):
  `monitoring_run`/`risk_signal` UPDATE column sets exact; `screening_request`'s UPDATE grant
  confirmed to exclude `rescreen_of_request_id`/`trigger_reason`; zero DELETE/TRUNCATE anywhere;
  zero cross-schema grant into `iam`/`iam2`/`sec1`/`cfg1`/`clt1`.
- IAM-02 catalogue independently confirmed: exactly 9 `aml1.*` permissions, all
  `licence_locked=false`, zero `role_permission` seed; real (non-stubbed) IAM-02 guard coverage
  (`aml1-iam2-guard-real.test.ts`) confirmed genuine for all 4 new codes.
- Static sweeps (Exchange/orderbook/matching/market-making/wallet/deposit/withdrawal/trading/
  settlement/reconciliation/portfolio/cron/scheduler/vendor-credential terms) across all of
  `services/aml1/src` — clean; the only hits were the two pre-existing Phase 3B provider-timeout
  `setTimeout` calls in `lib/providers/registry.ts`, not a scheduler.
- Zero CLT-01 source file touched; no new CLT-01 delivery target.
- **MEDIUM-1 (mandatory Phase 3D hardening item, not an ordinary carry-forward):** a crash between
  the claim (TX1) and complete (TX2) steps of a re-screen/monitoring attempt can leave
  `screening_request.status='requested'` stuck. Migration 039's own partial unique index then
  permanently blocks any further re-screen of that subject (manual or monitoring); monitoring
  candidate selection excludes the subject because its latest row is no longer `completed` (§7.6);
  no `rescreen_overdue` signal is ever emitted because the subject is never selected as a candidate.
  Empirically reproduced by the reviewer: a seeded stuck row was shown to be invisible to candidate
  selection, blocked from manual re-screen by both the application in-flight guard and the DB
  constraint, and absent from `rescreen_overdue` signals. Recovery today requires direct DBA
  intervention. **Must be closed before Phase 4/real vendor/production use** — real-vendor latency
  and outages will only widen the crash window.
- **Low-1** the code comment justifying the `createMonitoringRun`-before-claim-loop reorder in
  `routes/monitoring.ts` states an incorrect rationale — the reorder is beneficial for a different,
  unstated reason (moving both `lockClient` writes ahead of the claim loop eliminates the orphan path
  for failures in those two specific writes) — comment-only correction for Phase 3D.
- **Low-2** `AML1_MONITORING_RUN_INVALID_STATE` is a real, tested throw site only at the library
  level (`finalizeMonitoringRun`, proven by a direct test seeding a non-`running` row) — not
  organically reachable via the HTTP route in normal operation, since the same request that creates
  a `monitoring_run` row is the only writer that ever finalizes it. Should be documented as
  present-but-defensive, the wording CLT-01 Phase 3's own F2 used for an identical shape.
- **Info-1** match-keyed duplicate suppression is effectively unreachable for `confirmed_hit` (a
  match can only ever be confirmed once — `validateMatchTransition` already makes a second confirm
  unreachable) and for `potential_match_unresolved` (each re-screen inserts NEW `screening_match`
  rows with new IDs, so repeated signals across re-screens are expected, new evidence each time, not
  a leak); only the subject-keyed `rescreen_overdue` dedup is genuinely reachable.
- **Info-2** `selectListVersionChangedCandidates` has no attempt-level tiebreaker when joining
  `screening_provider_attempt` — deterministic today (exactly one attempt per request), but the
  chosen attempt row would become arbitrary if a future retry/resume phase introduces multiple
  attempts per request; revisit then.
- **Info-3** the re-screen path carries `provenance` forward from the source snapshot without
  re-running `validateScreeningSubject`'s `WRITABLE_SCREENING_PROVENANCE` check — safe today since
  only `declared_identity` is ever written, but is the one code path that would propagate
  `kyc_verified_identity` forward if a row ever acquired it; revisit once KYC-01 lands.
- **No code changed during the Opus review.**
- Residual findings assessed and accepted as non-blocking carry-forwards (except Medium-1, which is
  a mandatory Phase 3D precondition), not fixed this pass.

---

## 8. Phase 3D — ACCEPTED implementation baseline after independent Opus review — stuck requested-screening detection / orphan-claim hardening

Closes Phase 3C's own Medium-1 (§7.12): a crash between a screening request's TX1 (insert
`requested`/`pending`) and TX2 (record the provider's answer) could leave the request permanently
stuck — invisible to monitoring candidate selection, blocking any further re-screen of the subject
via migration 039's own partial unique index, and unrecoverable without direct DBA intervention.
Phase 3D adds detection, a safe operator list route, a single-step permission-gated recovery route,
a monitoring-visibility pass, and the TX2 concurrency guard recovery itself requires. No `aml1`
schema change, no runtime grant change, no real vendor code, no KYC unlock, no downstream module
mutation.

### 8.1 Migration 041 — IAM-02 permissions

`041_iam2_register_aml1_phase3d_permissions.cjs` — additive, **permissions-only**, no DDL of any
kind. Registers exactly two permissions, bringing AML-01's total to 11 (9 from Phase 2B/3B/3C + 2):

- `aml1.screening.stuck_read` — resource `screening`, action `stuck_read`, sensitivity `normal`,
  `requires_approval=false`, `licence_locked=false`.
- `aml1.screening.stuck_recover` — resource `screening`, action `stuck_recover`, sensitivity
  `sensitive`, `requires_approval=false`, `licence_locked=false`.

Zero `role_permission` seed (FR-003, unchanged discipline). Down-migration deletes exactly these two
rows — independently verified: reversing 041 restores the catalogue to exactly 9 `aml1.*`
permissions with zero `stuck_*` rows remaining.

### 8.2 Runtime grants — unchanged from Phase 3C

`infra/grants/aml1_runtime_grants.sql` was **not touched**. Recovery's writes
(`screening_request.status`/`.version`; `screening_provider_attempt.status`/`.failure_reason_code`/
`.checked_at_utc`) are already covered by the existing Phase 1/Phase 3B column-scoped UPDATE
grants — no new grant was needed. Independently verified via `information_schema` that the grant
fingerprint (all `role_aml1_runtime` table- and column-level privileges) is **byte-identical** to
the Phase 3C baseline (308 privilege rows, zero drift). Still zero DELETE/TRUNCATE anywhere, zero
cross-schema grant beyond `foundation.outbox_event` (INSERT-only), zero grant into
`iam`/`iam2`/`sec1`/`cfg1`/`clt1`.

### 8.3 TX2 concurrency guard — `lib/screening-execution.ts`

The highest-risk item in this phase. Once a recover route exists, a `screening_request` a
`completeScreening` call is mid-flight on can be marked `failed` by an operator BEFORE the provider
call returns. Without a guard, a late-landing TX2 would write `screening_result`/`screening_match`
rows and resurrect `status` back to `completed` UNDER the operator's own `failed` decision.

Fix: TX2 now opens with `SELECT status FROM screening_request WHERE screening_request_id = $1 FOR
UPDATE` as its FIRST statement — before any `screening_result`/`screening_match` INSERT — and
returns `{kind: "aborted"}` cleanly if the row is no longer `requested`. This is the SAME row lock
the recovery transaction takes, so the two transactions serialize on it: whichever commits first
wins, the loser observes the winner's outcome. The `aborted` outcome is propagated through
`ExecuteScreeningOutcome`/`PerformRescreenOutcome`; `routes/screening.ts` and `routes/rescreen.ts`
map it to the existing `AML1_SCREENING_REQUEST_INVALID_STATE` code (reused, not a new code) with a
Phase-3D-specific message; `routes/monitoring.ts`'s Phase B loop counts it under `failures` (the
same branch an ordinary provider failure takes).

Independently verified under genuine concurrency (not a hand-edited status flag): a real blocking
provider held TX2 open while a real `recoverStuckScreening` call committed underneath it, and
separately, a request row lock was held from an independent connection while recovery blocked on
it and then observed the winner. In all directions: zero orphaned `screening_result`/
`screening_match` rows, no resurrection to `completed`, and a request already `completed` by a
winning TX2 was never clobbered by a losing recovery attempt.

### 8.4 Stuck-screening detection + recovery — `lib/stuck-screening.ts` + `routes/stuck-screening.ts`

Stuck definition: `screening_request.status='requested'` AND `created_at_utc` older than
`AML1_STUCK_SCREENING_THRESHOLD_SECONDS` — deliberately NOT restricted to a `pending` latest
attempt; a `requested` row whose latest attempt is already terminal (`succeeded`/`failed`) is a
narrower, rarer crash shape (between the attempt's own terminal UPDATE and the request's own
terminal UPDATE inside TX2) that this phase surfaces (`recoverable=false`) but does not recover —
`recoverStuckScreening` requires the latest attempt to be `pending`, rejecting anything else as
`AML1_STUCK_SCREENING_INVALID_STATE`. Documented Phase 3D limitation, not an oversight.

`GET /internal/aml1/screening-requests/stuck` (IAM-02-gated, `aml1.screening.stuck_read`) — bounded
(max 200, structural, never caller-adjustable), `min_age_seconds` may only RAISE the effective
threshold, never lower it below the configured floor. Safe projection returns exactly
`screening_request_id`/`subject_type`/`subject_ref`/`subject_parent_ref`/`status`/`trigger_reason`/
`rescreen_of_request_id`/`attempt_id`/`attempt_status`/`age_seconds`/`created_at_utc`/`recoverable`
— never `name`/`registration_number`/`date_of_birth`/`nationality`/`matched_name`/`match_detail`/
`score`/raw provider payload. `age_seconds` is cast `::int` (not `::bigint`) so node-postgres
returns a native JS number, not a string — a bug caught and fixed during this phase's own
validation pass (§8.12).

`POST /internal/aml1/screening-requests/:screening_request_id/recover` (IAM-02-gated,
`aml1.screening.stuck_recover`) — single-step, no maker-checker (confirmed decision D2): the route
asserts a GENUINE `permission_granted` baseline (`approval_required`/`step_up_required` do NOT
authorise recovery — there is no execute-verify fallback for this permission). Body: `actor_id` +
`reason_code` from a closed enum (`process_crash_orphan`/`provider_call_abandoned`/
`deployment_interruption`/`manual_operator_recovery`) — no free text ever accepted or stored.
Marks the request `failed` and its latest attempt `failed` with
`failure_reason_code = "stuck_recovery_<reason_code>"` (distinguishing operator-recovered orphans
from ordinary provider failures IN THE SAME COLUMN — the reason zero schema change was needed),
re-checks BOTH the request's state AND its actual age against the configured threshold inside its
own transaction (never trusting a caller-supplied age or a stale list-route snapshot), and publishes
`aml1.stuck_screening_recovered`. No `screening_result`/`screening_match` row is ever written by
recovery; no evidence is ever deleted; recovery does not itself start a re-screen (confirmed
decision D1 — recovery and re-screen stay separate, independently auditable actions).

### 8.5 Monitoring visibility — `lib/monitoring.ts` + `routes/monitoring.ts`

A stuck-detection pass runs INSIDE Phase A's existing locked transaction (same `lockClient` as
`createMonitoringRun`/`emitOverdueSignalsForCandidates`), for BOTH trigger reasons. It selects
long-stuck requested subjects (bounded by the same batch size), emits a `rescreen_overdue` risk
signal (reused, not a new signal type) plus `aml1.stuck_screening_detected` for each, and is
deliberately NOT folded into ordinary candidate selection or the claim loop: a stuck subject cannot
be re-screened (the partial unique index rejects it), so attempting to claim it would only inflate
`failures` with an always-losing race. Stuck subjects are never counted in
`candidates_selected`/`rescreens_created`/`failures`. Monitoring never mutates `screening_request`
status and never recovers a stuck request automatically (confirmed decision D6) — recovery remains
an explicit, separately-gated operator action.

### 8.6 Config — `AML1_STUCK_SCREENING_THRESHOLD_SECONDS`

Default 900 seconds (15 minutes) — a wide margin over the provider call's own 5s timeout. Unlike
`AML1_RESCREEN_DUE_DAYS`/`AML1_MONITORING_BATCH_SIZE_*`, this one carries a HARD MINIMUM FLOOR
(300 seconds): a value below the floor fails startup closed as `CONFIGURATION_INVALID`, same as a
non-positive/non-numeric override. No per-request operator override of any kind exists — the
recover route re-checks this SAME configured value against the request's actual age inside its own
transaction.

### 8.7 Error model

Exactly three new codes, each with a reachable throw site (`routes/stuck-screening.ts`):
`AML1_STUCK_SCREENING_NOT_FOUND` (404), `AML1_STUCK_SCREENING_INVALID_STATE` (409),
`AML1_STUCK_SCREENING_TOO_FRESH` (409). AML-01's total error code count is now 25. No
`AML1_STUCK_SCREENING_RECOVERY_*` codes were added (would presuppose a decision-request table this
phase does not have). `AML1_SCREENING_REQUEST_INVALID_STATE` (Phase 2A) is reused, with a
Phase-3D-specific message, for the TX2 guard's own abort path — not a new code for an existing
condition.

**Low-2 wording correction (this phase):** `AML1_MONITORING_RUN_INVALID_STATE`'s own doc comment
now describes it as present-but-defensive / reachable at the LIBRARY level
(`finalizeMonitoringRun`'s own direct tests) but NOT organically reachable via the normal HTTP
route — corrected from the prior wording that overstated it as "a real, reachable, tested throw
site" without that qualifier.

### 8.8 Audit/outbox and PII

Exactly two new transaction-coupled events: `aml1.stuck_screening_detected` (monitoring's
detection pass) and `aml1.stuck_screening_recovered` (the recover route). No
`aml1.stuck_screening_recovery_requested`/`_completed`/`_failed` — no request/apply split exists
this phase. Metadata carries `screening_request_id`/`attempt_id`/`subject_type`/`subject_ref`/
`subject_parent_ref`/`trigger_reason`/`age_seconds`/`reason_code` — never `name`/
`registration_number`/`date_of_birth`/`nationality`/`matched_name`/`match_detail`/`score`/raw
provider payload/vendor secrets/free text. No free-text reason exists BY CONSTRUCTION — the closed
`reason_code` enum makes a free-text audit leak structurally impossible, not merely policy.

### 8.9 Operator runbook

`docs/implementation/AML-01_PHASE_3D_STUCK_SCREENING_RUNBOOK.md` — a standalone operational
document, deliberately carrying NO phase-acceptance framing of its own (that lives here). Covers
the detection query (API and direct-SQL forms), the recover route, and the required manual
follow-up re-screen. **Corrected post-review (Low-1, §8.13):** the original text implied a
`periodic_due` monitoring cycle could perform the required follow-up re-screen automatically — false;
a recovered request's latest status is `failed`, which NO detection surface in AML-01 selects for
re-screening (stuck detection wants `requested`, `periodic_due` wants `completed`). The runbook now
states plainly that monitoring will NEVER automatically re-screen a recovered subject and that the
operator must trigger it manually, and separately notes the `rescreen_overdue` signal raised while
the subject was stuck stays `open` through recovery as a secondary (not primary) safety net.

### 8.10 Low-1 cleanup (Phase 3C carry-forward, closed this phase)

The `routes/monitoring.ts` comment justifying the `createMonitoringRun`-before-claim-loop reorder
no longer claims it "preserves the monitoring_run row on rollback" (a rollback discards the whole
transaction, run row included). Corrected to state the real rationale: moving both `lockClient`
writes (the run INSERT and the overdue/stuck-screening signal emissions) ahead of the claim loop
means a failure in either happens BEFORE any claim in that run commits.

### 8.11 Sonnet self-review outcome

A real bug was caught and fixed during this phase's own validation pass, before any review: the
detection query's `age_seconds` column was cast `EXTRACT(EPOCH ...)::bigint`, which node-postgres
returns as a JS **string** (bigint precision safety) — silently breaking the API's documented
numeric contract for `age_seconds` in both the list route and the recovered-row response. Caught by
the implementer's own integration test (`toBeGreaterThanOrEqual` on a string threw a type error),
not by inspection. Fixed by casting `::int` instead (a request's age in seconds never approaches
int overflow — §8.4). No other defect found requiring correction during this pass; the TX2 guard
design (§8.3) was implemented per the accepted Phase 3D planning report's own recommended build
order (guard first, before any route that depends on it) and needed no rework.

### 8.12 Independent Opus review outcome

**Verdict: ACCEPT WITH LOW FINDINGS.** Zero Critical/High/Medium. 2 Low, 5 Informational.

- **1620/1620 full suite passing** (82 files, 0 failures — 1581 baseline + 39 new) on an
  independently-built fresh disposable Postgres; `tsc -b --force` clean.
- Migrations 001→041 + all 7 grant files independently reproduced clean; migration 041's own
  down-migration independently verified to restore the catalogue to exactly 9 `aml1.*` permissions
  with zero `stuck_*` rows remaining; no migration 042.
- Grant fingerprint independently confirmed BYTE-IDENTICAL to the Phase 3C baseline via
  `information_schema` (308 privilege rows, zero drift) — not merely inferred from an unchanged
  grant file.
- IAM-02 catalogue independently confirmed: exactly 11 `aml1.*` permissions, all
  `licence_locked=false`, zero `role_permission` seed.
- **The TX2 concurrency guard (the highest-risk item, §8.3) was independently re-proven under
  genuine concurrency** — a real blocking provider call racing a real recovery commit, and a real
  held-row-lock scenario racing recovery against a winning terminal update — not by re-running the
  implementer's own hand-edited-state test. All race outcomes correct in both directions; zero
  orphaned evidence rows; no resurrection to `completed`; no clobbering of a legitimately-completed
  request by a losing recovery.
- Static sweep (Exchange/orderbook/matching/market-making/wallet/deposit/withdrawal/trading/
  settlement/reconciliation/portfolio/cron/scheduler/vendor-credential/KYC-unlock terms) across all
  of `services/aml1/src` — clean; only comment/doc-string hits, no out-of-scope code.
- The prior "22 failures on a single-DB run" artifact (Phase 3C carry-forward) was independently
  REPRODUCED and re-confirmed confined to `iam-db`/`iam2-db`/`cfg1-db` test-isolation issues on a
  reused database (duplicate seed identifiers, an accumulated user count, a one-shot bootstrap
  already consumed, leftover `cfg1` rows) — zero AML-01 failures on either a fresh or a reused
  database.
- **No code changed during the Opus review.**
- **Low-1** the operator runbook (§8.9) originally implied a `periodic_due` monitoring cycle could
  trigger the required follow-up re-screen — independently DISPROVED by direct test
  (`selectPeriodicDueCandidates` returned zero candidates for a just-recovered subject, whose latest
  status is `failed`, not `completed`) — corrected post-review; the same test confirmed the
  runbook's actual instruction (`POST .../rescreen` from the recovered request) does work.
- **Low-2** the recovery route's staleness gate computes age from the application clock against the
  DB-stored `created_at_utc`, while the detection query computes age from the DB clock (`now()`) —
  a large app/DB clock skew could let recovery pass its threshold gate on a request the database
  still considers fresh. Accepted as Low: requires skew exceeding the 300s hard floor, cannot
  produce a `clear`/`pass` outcome, is not deliverable to CLT-01, and the TX2 guard prevents any
  evidence corruption regardless. Future hardening option: a DB-clock predicate for this one gate.
- **Info-1** a post-recovery detection blind spot remains by design: after recovery the latest
  request is `failed`, a status no AML-01 detection surface (stuck detection wants `requested`,
  `periodic_due` wants `completed`) ever selects. Mitigated by the lingering open `rescreen_overdue`
  signal (§8.9) and the runbook's mandatory manual-follow-up instruction, not eliminated.
- **Info-2** an `aborted` TX2 outcome counts as a `failures` increment in monitoring's Phase B loop
  — effectively unreachable in production (a monitoring claim is seconds old; recovery requires
  ≥300s), but would misattribute an operator recovery as provider trouble if ever reached.
- **Info-3** the latest-attempt tie-break (`ORDER BY created_at_utc DESC LIMIT 1`, both in
  detection and in recovery) is nondeterministic if two attempts share a timestamp — unreachable
  today (exactly one attempt per request, no retry route), but a future retry/resume phase must add
  a deterministic tie-break.
- **Info-4** one integration test's own comment is self-contradictory/brittle (couples to the
  original create route's specific error-code mapping while claiming to avoid exactly that) — no
  runtime issue, test-quality note only.
- **Info-5** the runbook's actual follow-up instruction (manual `/rescreen` from the recovered
  request) is operationally correct post-Low-1-fix but not covered by an automated test — a
  reasonable future test addition, not a defect.
- Residual findings assessed and accepted as non-blocking carry-forwards, not fixed this pass (the
  runbook Low-1 correction was applied in the immediately-following documentation-sync pass, not
  during the review itself).

---

**AML-01 — accepted implementation baseline through Phase 3D.**

- Phase 0 / Phase 1 / Phase 2A / Phase 2B / Phase 3A / Phase 3B / Phase 3C / Phase 3D all accepted.
- Tests: 1620/1620 on fresh DB. Highest migration: 041. Fresh DB migrations 001→041 clean. All 7
  grant files clean after migration 041.
- Route count: 21. IAM-02 permission count: 11. Error code count: 25.
- Grants unchanged from Phase 3C (byte-identical fingerprint). No `aml1` schema DDL in migration
  041. No real vendor code or credentials. No KYC-verified identity unlock. No downstream module
  mutation. No wallet/deposit/withdrawal/trading/Exchange scope. No AML-01 closure review yet.
- **Phase 3C's Medium-1 is now CLOSED**: a stuck subject is detected, signalled
  (`rescreen_overdue` + `aml1.stuck_screening_detected`), and recoverable via a single-step,
  IAM-02-gated operator action; recovery unblocks a future manual re-screen; a late-landing provider
  TX2 cannot resurrect a recovered request nor write orphaned `screening_result`/`screening_match`
  evidence; recovery never deletes evidence, never produces a `clear`/`pass` outcome, is never
  deliverable to CLT-01, and never mutates any downstream module.

Carry-forwards into whatever comes next: **Phase 3D Low-1/Low-2/Info-1/Info-2/Info-3/Info-4/Info-5**
above (§8.12); Phase 3C Info-1/Info-2/Info-3 (§7.12, unchanged); Phase 3B Low-1/I-1/I-2/I-3 (§6.10,
unchanged); Phase 2A Info-1/Info-2/Info-3 (unchanged, still deferred); the residual approver-side
SoD gap (platform-wide — IAM-02's execute-verify does not expose approver identity, not AML-01-
specific); the interim shared-token identity model (increasingly consequential as AML-01's
PII/compliance-mutation surface expands); the platform-wide carry-forward that CLT-01/CFG-01 still
collapse execute-verify unavailability into approval-required-style errors; the same-DB re-run test
artifact in `iam-db`/`iam2-db`/`cfg1-db` (unrelated to AML-01, confined and reconfirmed twice now);
AML-01 still has no real vendor onboarded — no closure review is appropriate until one is live.

**AML-01 pauses after Phase 3D.** No further AML-01 hardening phase is planned at this time. **Do
not proceed to AML-01 Phase 4 (real vendor onboarding)** — Phase 4 remains blocked on procurement,
DPA, vendor credentials, real provider selection, production secret management, and vendor
governance/outsourcing review, none of which this phase (or any prior AML-01 phase) touches. AML-01
closure review remains unavailable until a real provider is live AND Phase 4 is accepted AND the
real-vendor path has itself been independently reviewed.

> **Superseded by §9 below.** The pause above held until WLT-01 Phase 4A planning surfaced a
> load-bearing prerequisite gap (no synchronous pre-transaction AML decision seam existed). Phase
> 3E — unplanned at the time this section was written — was subsequently frozen, implemented, and
> independently accepted. This historical section is preserved unchanged; §9 records the new phase.

---

## 9. Phase 3E — ACCEPTED implementation baseline after independent Opus review — synchronous pre-transaction AML gate

**Architecture objective:** a load-bearing WLT-01 Phase 4A prerequisite. WLT-01 needed a
synchronous, per-transaction AML decision it could consult before authorizing destination use, and
no such seam existed anywhere in AML-01's prior (entirely asynchronous, case/monitoring-oriented)
route surface. Independent Opus review confirmed the gap, froze a Phase 3E architecture plus a
narrow addendum resolving load-bearing ambiguities (client↔subject binding rule, latest-evidence
selection, exact config bounds, complete reason-code enum + precedence, provider provenance
representation, transaction boundary, HTTP/business-decision semantics, subject-ref
canonicalization), and cleared it for implementation. No new architectural decision was made during
implementation or remediation — every design choice traces to the freeze or its addendum.

**No real vendor, no KYC-verified-identity unlock, no transaction monitoring, no amount/velocity/
geography policy, no wallet-address screening, no FIU/STR, no case management, no
`client_application` binding redesign, no new CLT-01 lookup.**

### 9.1 Route and request boundary

Exactly one new route: **`POST /internal/aml1/pre-transaction/screen`**, machine-to-machine only
via `makeAml1InternalIdentityGuard(config.aml1InternalServiceToken)` — no IAM-02 permission (AML
IAM-02 permission count stays **11**). Request: `{client_id, subject_refs: [{subject_type, subject_ref}] (1..20), requested_action: "destination_use", caller_module, destination_ref?, chain?, network?}`,
`additionalProperties: false`. **`subject_type` accepts only `"authorised_party"`** —
`client_application` fails schema validation (400): AML-01 has no local means to bind a
`client_application` subject to `client_id` (no `clt1.*` SQL grant). Subject refs are
canonicalized before evaluation: exact-pair de-duplication (never trimmed/normalized — an opaque
identifier compared exactly), sorted deterministically by `subject_ref` — caller array order can
never affect the resulting decision or reason_code (independently proven both directions).

### 9.2 Evidence-based model — no live provider call

Phase 3E never calls a screening provider on the request path — `lib/pre-transaction.ts` never
imports `lib/providers/registry.ts`'s `screenViaProvider`. It consults already-persisted
`aml1.screening_request`/`screening_result`/`screening_match`/`screening_provider_attempt`
evidence only, inside **one ordinary read-write transaction** (default READ COMMITTED — no
isolation expansion).

### 9.3 Client/subject binding — no enumeration oracle

A subject's evidence may contribute to a decision only when `screening_request.subject_parent_ref
= client_id` is positively proven. This is not a separate verification step: it is embedded
directly in the `WHERE` clause of the same LATERAL subquery that selects each subject's newest
lifecycle row, so a NULL `subject_parent_ref`, a foreign-client subject, and a genuinely unknown
subject_ref are all structurally indistinguishable — none of them matches the predicate, all three
collapse to the identical outcome: `review / subject_client_binding_unprovable`. Independently
proven that a foreign-client probe and an unknown-subject probe return byte-identical responses
(no cross-client existence oracle).

### 9.4 Latest-evidence selection — newest lifecycle wins

All canonical subjects are resolved in **one SQL statement** (`unnest()` + `LEFT JOIN LATERAL`),
never N independent per-subject queries, so every subject is read from a single consistent
snapshot. Each subject's evidence is the row selected by `ORDER BY created_at_utc DESC,
screening_request_id DESC LIMIT 1` — the newest *screening request lifecycle*, never "the latest
*completed* result." A newer `requested`/`failed` request always masks an older `completed`/
`clear` result (proven both at the pure-function unit level and via a real persisted-fixture
integration test with a provenance-complete older `clear` result superseded by a newer `failed`
request → `review/screening_failed`). The trailing tie-break on the `UNIQUE screening_request_id`
column makes the order total and deterministic.

### 9.5 Decision and reason-code vocabulary

Decision vocabulary: exactly `allow` / `review` / `deny` — only `allow` is affirmative. Exactly 11
frozen reason codes, no speculative additions: `evidence_clear`, `matches_dismissed`,
`confirmed_hit`, `undisposed_potential_match`, `screening_result_error`, `screening_in_flight`,
`screening_failed`, `evidence_stale`, `no_current_evidence`, `subject_client_binding_unprovable`,
`unsupported_evidence_state`. **These are business-decision reason values returned in the response
body — they are NOT additions to `AML1_ERROR_CODES`.**

Decision precedence across subjects: strictest wins, `deny > review > allow`. Same-decision reason
precedence: DENY→`confirmed_hit`; REVIEW→`subject_client_binding_unprovable` >
`undisposed_potential_match` > `screening_result_error` > `screening_failed` >
`screening_in_flight` > `evidence_stale` > `no_current_evidence` > `unsupported_evidence_state`;
ALLOW→`matches_dismissed` > `evidence_clear`. Both precedence orders and the underlying
per-subject mapping are independent of the input array's order (proven via array reversal at both
the unit and integration level).

**`confirmed_hit` is never rescued by staleness or by absent provider provenance** — its branch
returns before any freshness or provenance check, both at the initial implementation and after the
C-3E-1 remediation below.

### 9.6 Provider provenance

`evidence_provider_ids: string[]` (not a scalar `provider_id`) is sourced from
`aml1.screening_provider_attempt.provider_id` WHERE `status = 'succeeded'` for the selected
evidence, distinct and sorted lexicographically. The currently-configured provider is never
substituted as historical evidence provenance — an empty array is the only truthful representation
when no succeeded attempt exists. **Load-bearing rule:** otherwise-affirmative evidence
(`clear`, or `potential_match` with all matches dismissed) with **zero** successful provenance
cannot support `allow` — see §9.8 (C-3E-1).

### 9.7 Configuration, authoritative time, decision TTL

Two new bounded config variables, fail-closed at boot via the existing
`parsePositiveIntOverride`/`CONFIGURATION_INVALID` discipline:
- `AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS` — default 2160, min 1, max 8760, cross-field
  checked against `rescreenDueDays * 24`.
- `AML1_PRETRANSACTION_DECISION_TTL_MINUTES` — default 5, min 1, max 15.

PostgreSQL `now()` is read exactly once inside the decision transaction — never `Date.now()`/
`new Date()` — and drives `evaluated_at_utc`, `valid_until_utc` (`evaluated_at_utc` + configured
TTL), and every freshness comparison.

### 9.8 Audit atomicity

Exactly one new audit event type, **`aml1.pre_transaction_evaluated`** (AML audit event types:
9→**10**), emitted once for every returned decision — allow, review, and deny alike — atomic with
the response via the existing `withTransaction` rollback-on-throw mechanism (no new mechanism
required). A forced audit/outbox INSERT failure returns **503 `AML1_AUDIT_REQUIRED`** with **no**
`decision` field in the response and a full rollback — proven via a genuine ACL-revocation test
against `role_aml1_runtime` (the actual grant holder, not the login role) on a private disposable
database, followed by a successful retry proving no residue. Response contract (200 only):
`decision`, `decision_id`, `reason_code`, `evaluated_at_utc`, `valid_until_utc`,
`evidence_provider_ids`, `client_id`, `requested_action` — no matched names, scores, list sources,
raw provider payload, or internal token, independently asserted.

### 9.9 C-3E-1 / H-3E-1 — discovery and remediation

The initial implementation candidate mapped `overallStatus` alone to a decision, never consulting
`evidence_provider_ids` — so `clear` or all-dismissed `potential_match` evidence with **zero**
successful provider attempts incorrectly returned `allow`. Independent Opus review found this
**Critical, fail-open (C-3E-1)**, together with a companion integration test that could not have
caught it — it asserted only that the provenance array was empty, never `decision` or
`reason_code` **(High, H-3E-1)**.

A surgical Sonnet remediation, touching exactly 3 files (`lib/pre-transaction.ts` and its two test
files), gated both affirmative branches (`clear`; `potential_match` with all matches dismissed) on
`providerIds.length > 0`, falling to `review / unsupported_evidence_state` otherwise — checked
locally inside each affirmative branch, never globally, so the `confirmed_hit` branch (which
returns earlier in the function) is structurally unweakened by absent provenance. `
unsupported_evidence_state` now has a genuine production-reachable trigger (missing provenance on
otherwise-affirmative evidence), independent of the retained defensive fallback for out-of-
vocabulary persisted state. The H-3E-1 test now asserts `decision === "review"` and
`reason_code === "unsupported_evidence_state"` directly, paired with a positive control (identical
evidence plus a succeeded provider attempt → `allow`) proving causality. Both closures were
independently re-verified by Opus, including a deliberate revert-then-restore of the production
fix that confirmed the strengthened tests genuinely fail without it (6 failures) and pass with it
restored.

**L-3E-1** (newest-lifecycle-over-provenance-complete-older-evidence coverage gap) and **L-3E-2**
(an auth test named "reaches the route (200 with a decision)" that in fact asserted only
`!== 401` against a payload deliberately producing 400) were both closed test-only, with no
production change.

### 9.10 M-3E-2 — non-blocking carry-forward

`no_current_evidence` remains a defensive reason code — a `completed` `screening_request` with no
`screening_result` row is structurally unreachable under the accepted `lib/screening-execution.ts`
write path (the result is inserted in the same transaction that marks the request `completed`).
Checked anyway, per this codebase's established "structurally unreachable, defended anyway"
discipline (e.g. WLT-01's Model-A verified-row backstop) — reachable today only via a direct
unit-test call bypassing the DB. **OPEN / NON-BLOCKING**, carried forward as a documentation
acknowledgement; not to be closed by manufacturing a production trigger, a migration, or a
persistence change.

### 9.11 Error model — zero new codes, and a pre-existing drift corrected

**Zero new AML error codes.** The live catalogue is confirmed at **26** — unchanged by Phase 3E.
Binding failure, missing evidence, staleness, and missing provenance are all business outcomes
(`HTTP 200` + `review`), never error codes; the only two error codes this route can throw are the
existing `AML1_SERVICE_UNAVAILABLE` (pool unreachable) and `AML1_AUDIT_REQUIRED` (audit-publish
failure).

**Correcting a pre-existing documentation drift:** the Phase 3D closure summary above (§8, "Error
code count: 25") reflects what this document stated at the time, but the live accepted catalogue
was already **26** before Phase 3E began (the Phase 3D closure text itself undercounted by one).
Phase 3E's own delta is **0**. The historical §8 text is left unchanged per this document's own
no-rewrite discipline for accepted sections; this note is the correction of record.

### 9.12 Sonnet self-review outcome

All work completed within the frozen file plan: 4 files created (`lib/pre-transaction.ts`,
`routes/pre-transaction.ts`, `tests/unit/aml1-pre-transaction.test.ts`,
`tests/integration/aml1-pre-transaction-route.test.ts`), 5 files modified (`server.ts`,
`config.ts`, `tests/unit/aml1-app.test.ts`, `tests/unit/aml1-config.test.ts`,
`tests/integration/aml1-db.test.ts` — the last only for a config-literal fix and updating its own
pre-existing exact route-count assertion, 21→22). No file outside this plan was touched. Zero WLT-
01 changes, zero documentation changes (that turn's scope explicitly excluded docs). The
integration test file adopted the established private-disposable-database pattern (mirroring
`wlt1-poc-audit-atomicity-private.test.ts`) rather than the shared canonical database, because
`aml1-db.test.ts`'s own `afterEach` performs an unscoped `DELETE FROM aml1.screening_request` that
would otherwise race this file's fixtures.

### 9.13 Independent Opus review outcome

**Initial review → FINAL ACCEPTANCE BLOCKED**, one Critical (C-3E-1) and one High (H-3E-1) as
detailed in §9.9, both independently reproduced by direct probe against the live source (not by
reading alone) before being reported. Two Low findings (§9.9) noted non-blocking.

**Remediation re-review → AML-01 PHASE 3E: COMPLETE / ACCEPTED.** Diff scope independently
verified as exactly the 3 authorized files (mtime bisection); the full decision matrix
independently re-probed live; the H-3E-1 test's falsifiability independently confirmed by
enumerating which assertions would contradict the old behavior; all inventories (routes, errors,
IAM permissions, audit event types, migration head, grants, dependencies) independently confirmed
unchanged except the test counts. Fresh-database cold sequential canonical suite independently
re-run and matched exactly.

**Final accepted baseline:** platform **3185/3185** tests, **130/130** files (fresh DB, cold
sequential, `--no-file-parallelism`, canonical SEC-01 ingest tokens); AML-01 scoped **480/480**
tests, **18** files; Phase 3E focused **75/75** (38 unit + 37 integration). AML routes **21→22**.
Migration state unchanged (AML at **041**, platform head
`054_wlt1_proof_of_control_tron_scheme`, no migration 055). Grants and dependencies unchanged.

**M-3E-1: CLOSED. C-3E-1: CLOSED. H-3E-1: CLOSED. L-3E-1: CLOSED. L-3E-2: CLOSED. M-3E-2: OPEN /
NON-BLOCKING** (§9.10).

**WLT-01 Phase 4A implementation start is now CLEARED** — the former blocking prerequisite
(§8/pause note above) is satisfied. AML-01 closure review (real vendor onboarding, Phase 4) remains
separately unavailable per §8 — unaffected by Phase 3E, which remains fully evidence-based / no-
live-provider by design.
