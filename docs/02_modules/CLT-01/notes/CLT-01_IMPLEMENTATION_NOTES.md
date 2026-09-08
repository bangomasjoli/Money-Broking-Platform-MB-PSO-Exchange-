# CLT-01 Client Onboarding / Client Profile — Implementation Notes

Blueprint: `CLT-01_Client_Onboarding_Client_Profile_Blueprint_Pack_v1.1` (accepted, sibling
`aix-platform-docs` workspace). A `v1.2` draft directory exists in that workspace with no
corresponding review file — not used here; this implementation targets the accepted v1.1 pack
throughout.

## 1. Phase 0 — ACCEPTED implementation baseline after independent Opus review — scaffold only

New service `services/clt1` (Fastify 5), mirroring the established Phase 0 shape every prior
module used (`services/iam2`, `services/sec1`, `services/cfg1`): own request-context plugin, own
interim internal-identity guard, own config loader, boot-time `assertNoExchangeRuntime`, F3(c)
import-boundary test, one route.

**No `clt1` schema, no migration, no grants, no business tables, no business routes, no CFG-01/
IAM-02/SEC-01 integration this phase** — all of that is explicitly Phase 1+ scope (see the
separate CLT-01 planning report for the proposed 7-phase breakdown: 0 scaffold → 1 intake/
classification/CFG-01 gate → 2 CDD outcome gate + final approval → 3 authorised users/mandate →
4 authorised-party/UBO screening + duplicate/uniqueness → 5 ongoing monitoring + lifecycle → 6
data protection/retention).

### 1.1 Files added

```
services/clt1/package.json
services/clt1/tsconfig.json
services/clt1/src/index.ts
services/clt1/src/server.ts
services/clt1/src/config.ts
services/clt1/src/plugins/request-context.ts
services/clt1/src/plugins/internal-identity.ts
services/clt1/src/lib/errors.ts
services/clt1/src/routes/system.ts
tsconfig.json                                   (extended — added services/clt1 reference)
package.json                                     (extended — added dev:clt1/start:clt1 scripts)
tests/unit/clt1-app.test.ts
tests/unit/clt1-config.test.ts
tests/unit/clt1-log-redaction.test.ts
tests/unit/clt1-import-boundary.test.ts
tests/unit/clt1-no-exchange.test.ts
tests/unit/clt1-internal-identity.test.ts
docs/implementation/CLT-01_IMPLEMENTATION_NOTES.md
```

### 1.2 Config

`loadClt1Config` reuses `@aix/foundation`'s shared `loadConfig` baseline (ENVIRONMENT/
DATABASE_URL/PORT/internal-service-token presence+length, fail-closed) and layers exactly one
CLT-01-specific field on top: `CLT1_INTERNAL_SERVICE_TOKEN` (mapped onto the shared loader's
`INTERNAL_SERVICE_TOKEN` slot, same pattern IAM-02/SEC-01/CFG-01 each use for their own token).
**No CFG-01/IAM-02/SEC-01 base URL or shared secret added this phase** — deliberately, per
approved scope; adding those env vars before any Phase 0 code path reaches them would be
speculative. `NODE_ENV`/`LOG_LEVEL` are not separate CLT-01 config fields — `ENVIRONMENT` (the
shared loader's field) already serves the same purpose every other module uses it for (log level
selection in `server.ts`), and no module in this codebase has a distinct `LOG_LEVEL` env var.

### 1.3 Request-context / internal-identity guard

Own copies (F3(c) — never imported from `services/iam`, `services/iam2`, `services/sec1`, or
`services/cfg1`), byte-for-byte mirroring the established pattern: async-storage-bound
`RequestContext`, `request_id`/`correlation_id` propagation on every response header, unified
error envelope for both `AppError` and (empty-catalogue) `Clt1Error`, standard 404 handler.
`makeClt1InternalIdentityGuard` is the same constant-time-comparison, fail-closed-on-missing/
wrong/blank-token guard every prior module carries — proven directly against a scratch route
(`tests/unit/clt1-internal-identity.test.ts`), since Phase 0's one real route (`/health`) is
deliberately unauthenticated (an orchestration liveness probe must not require a secret, mirroring
`/foundation/health`) and has nothing for the guard to protect yet.

### 1.4 Error catalogue

`lib/errors.ts` ships a **structurally-ready but intentionally empty** `CLT1_ERROR_CODES` object
and a `Clt1Error` class shell — "only add codes this stage's routes can actually throw"
(IAM-02/SEC-01/CFG-01's own repeated, previously-accepted discipline, applied identically here).
Phase 0's actual failure modes all reuse SHARED foundation codes: guard rejection ->
`AppError("SERVICE_IDENTITY_REQUIRED")`; config failure -> `AppError("CONFIGURATION_INVALID")`;
unknown route -> `AppError("NOT_FOUND")`. `assertNoExchangeRuntime`'s own violation throws a raw
`Error` at boot (crashes `buildApp()` before any route could serve a request) — not reachable at
the HTTP layer, so no CLT-01 code corresponds to it either. The blueprint's 29-code catalogue
(`CLT1_RETAIL_LOCKED`, `CLT1_CDD_OUTCOME_REQUIRED`, ...) is deliberately deferred to the phases
that build the routes/logic able to throw them — adding them now would leave a future
catalogue-completeness test asserting against speculative, unreachable codes.

### 1.5 Routes

Exactly one: `GET /internal/clt1/health` (unauthenticated, standard success envelope, mirrors
`/foundation/health`/`/internal/cfg1/health`). **No `/internal/clt1/readiness` this phase** —
CFG-01's own Phase 0 shipped health only and added readiness in Phase 1 alongside its first real
schema to check; CLT-01 has no `clt1.*` table yet, so a readiness route today would either be a
content-free stub or would have to reach into another module's schema it has no business
inspecting. Deferred to whichever Phase 1 slice introduces the first table, exactly the CFG-01
precedent (documented in `routes/system.ts`'s own header comment).

### 1.6 No-Exchange posture

`assertNoExchangeRuntime` runs at boot in `server.ts` (after `app.ready()`), scanning the real
registered route table — identical position/pattern to every prior module. Proven three ways:
(1) `clt1-app.test.ts`'s "boots clean" + exact-route-surface tests, against the real app; (2) the
shared `no-exchange.test.ts` (already proves the underlying `@aix/foundation` mechanism
generically, not repeated); (3) `clt1-no-exchange.test.ts`, CLT-01-specific — proves the guard
would catch a future literal Exchange-onboarding route or a client-to-client-relationship route
(the two Exchange-adjacent vocabulary risks CLT-01's own blueprint could plausibly brush up
against later: item 14 "no Exchange client onboarding," and the structural distinction from
Exchange's client-to-client matching), mirroring `cfg1-no-exchange.test.ts`'s identical shape.
Static grep confirms zero occurrences of `order-book`/`orderbook`/`matching`/`market-making`/
`principal`/`spread`/`trading`/`execution` anywhere in `services/clt1/src`.

### 1.7 Tests added (32 new, 6 files)

- `clt1-app.test.ts` (7) — boot-clean, no-Exchange route surface, exact route-surface assertion
  (health only; explicit negative assertions for every Phase 1+ business path and every
  forbidden Exchange fragment), health envelope, request/correlation-id propagation, 404, and an
  explicit "readiness does not exist yet" 404 assertion.
- `clt1-config.test.ts` (7) — valid load; fail-closed on missing/blank/too-short
  `CLT1_INTERNAL_SERVICE_TOKEN`; `CONFIGURATION_INVALID` code; shared-baseline fail-closed
  (missing `DATABASE_URL`, invalid `ENVIRONMENT`) still works underneath.
- `clt1-log-redaction.test.ts` (2) — the one redact path (internal-service-token header) present,
  no unexpected additions.
- `clt1-import-boundary.test.ts` (6, reuses the shared scanner) — F3(c): `services/clt1/src`
  never imports `services/iam`/`iam2`/`sec1`/`cfg1`/`fnd` internals, never subpath-imports
  `@aix/foundation`.
- `clt1-no-exchange.test.ts` (5) — see §1.6.
- `clt1-internal-identity.test.ts` (5) — missing/wrong/blank/correct token, constant-time
  length-boundary check, against a throwaway scratch route (never shipped) since Phase 0's one
  real route is deliberately unauthenticated.

## 2. Verification performed

```bash
npx tsc -b                                                     # clean
npx node-pg-migrate -m infra/migrations --no-check-order up   # 001 -> 019, all clean (unchanged — no new CLT-01 migration)
psql "$DATABASE_URL" -f infra/grants/fnd_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam2_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/sec1_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/cfg1_runtime_grants.sql
npx vitest run                                                 # 54 files, 740/740 passing
```

**Result: 54 test files, 740/740 tests passing, 0 failures** — the pre-existing 708-test baseline
(FND-01/IAM-01/IAM-02/SEC-01/CFG-01, all phases) unregressed, plus 32 new CLT-01 Phase 0 tests.
Static sweeps confirmed: zero forbidden Exchange-fragment occurrences anywhere in
`services/clt1/src`; zero `infra/migrations`/`infra/grants` files touched or added; exactly one
registered route. Run against a genuinely fresh disposable Postgres, migrations 001→019 applied
in the order those migrations themselves require (unchanged from CFG-01's own documented
interleaving — migration 007 needs `role_iam2_runtime` to already exist), all 5 existing grant
files clean. Disposable database and test server torn down after the run.

## 3. Explicit confirmations

- No `clt1` schema, no migration, no grants file — `infra/migrations/` and `infra/grants/` are
  byte-for-byte unchanged.
- No `client_application`, `client_profile`, `client_classification_evidence`,
  `consent_record`, or any other blueprint table.
- No KYC/KYB logic, no AML logic, no CDD outcome gate, no authorised users, no mandates, no
  duplicate detection, no related-party graph, no data-protection/retention logic.
- No CFG-01 feature-gate calls, no IAM-02 permission registration, no SEC-01 monitoring rules —
  zero cross-service HTTP dependency configured or called this phase.
- No public `/clt1/*` client routes of any kind — only the one internal `/internal/clt1/health`.
- No wallet/custody, deposits, withdrawals, trading, settlement, or Exchange-runtime code —
  confirmed by static grep and the dedicated no-Exchange test file.

## 4. Remaining deferred items

- Real service-to-service identity — CLT-01 inherits the same interim shared-token carry-forward
  every prior module already documents (IAM-02 §10.4 L3, SEC-01 F-5, CFG-01 L1/L2), flagged in
  `config.ts`'s own header comment as *more* consequential here once real routes land, since
  CLT-01 is a PII system of record (blueprint §5.18) — not a new problem, just a higher-stakes
  instance of the existing one.
- `/internal/clt1/readiness` — deferred to whichever Phase 1 slice introduces the first `clt1.*`
  table (CFG-01's own Phase 0→1 precedent).
- The full 24-permission IAM-02 model, the 17-table schema, the CFG-01 gate calls, and the
  29-code error catalogue are all Phase 1+ — see the separate CLT-01 planning report for the
  proposed phase breakdown. That report is a proposal, not a commitment; each later phase needs
  its own planning pass before implementation, per the CFG-01 Phase 3A/3B precedent of
  re-scoping mid-stream once real size became clear.
- The CFG-01 `cfg1.feature`-row operational dependency identified in the planning report (most
  of CLT-01's CFG-01 gates need governed `cfg1.feature` rows created via CFG-01's own accepted
  Phase 3A mutation workflow before `evaluate()` can return anything but `unknown_fail_closed`)
  remains unresolved and is not blocking for Phase 0 — it will block Phase 1's own integration
  tests against anything other than synthetic fixtures.

## 5. Independent Opus review — ACCEPT

Independently reproduced from a genuinely fresh disposable Postgres (migrations 001→019
interleaved with all 5 grant files in the order those migrations themselves require, unchanged —
no new CLT-01 migration): **740/740 tests, 54 files, 0 failures**; `tsc -b` clean both
incrementally and on a forced full rebuild (`--force`). Targeted CLT-01 unit tests independently
re-run in isolation: **32/32 passing** across the 6 new files. Route surface independently
confirmed exactly `GET /internal/clt1/health` — `/internal/clt1/readiness` returns 404, proven by
a dedicated test, not merely absent by omission. F3(c) import-boundary confirmed clean by both
the dedicated test and independent static grep (zero cross-service source imports, zero
`@aix/foundation` subpath imports). Static sweeps confirmed zero occurrences of any forbidden
Exchange/business-surface fragment anywhere in `services/clt1/src` (including in comments), zero
DB/schema access code, and zero `infra/migrations`/`infra/grants` files added, modified, or even
present with a `clt1`-related name.

**Verdict: ACCEPT CLT-01 Phase 0.** No Critical/High/Medium findings. Three Low/informational,
non-blocking items, none a Phase 0 code defect:
- **L1** — `clt1-app.test.ts`'s route-surface forbidden-substring list (`matching`/`principal`/
  `spread`/`trading`/`execution`) is stricter than the real boot guard's own hyphenated/
  underscored-fragment matching (`matching-engine`, `principal-dealing`, ...) — conservative, and
  lives in a test rather than the guard, so it can never weaken the real boot lock. Flagged for
  reconciliation if a legitimate future route needs one of these bare terms (most plausibly
  duplicate-detection wording, blueprint §2.8 `match_type`/`match_score`).
- **L2** — the interim shared-token internal-identity model (carried forward from every prior
  module, unchanged here) is higher-stakes for CLT-01 specifically, since it will become the
  platform's first PII system of record — already flagged in `config.ts`'s own header comment,
  not newly discovered by the review.
- **L3** — pre-existing no-DB `vitest run` canary-failure behaviour in unrelated integration test
  files (`sec1-db.test.ts`/`iam2-db.test.ts`'s own deliberate hard-fail-instead-of-skip design
  when `TEST_DATABASE_URL` is absent) — not CLT-01 code, already a documented CFG-01-era
  carry-forward.

No code was written or changed during the review. `MODULE_STATUS.md`, `PROJECT_HANDOVER.md`, and
`SESSION_START_PROMPT.md` (sibling `aix-platform-docs` workspace) have been updated accordingly.

**CLT-01 Phase 0 is an accepted implementation baseline.**

## 6. Phase 1 — ACCEPTED implementation baseline after independent Opus review — application intake, class claim/evidence, consent, CFG-01 onboarding gate, under-review lifecycle

Scope: `clt1` schema, `role_clt1_runtime`, 4 tables (`client_application`,
`client_profile`-DDL-only, `client_classification_evidence`, `consent_record`), an internal-only
application-intake API, CLT-01's own CFG-01 evaluate-only HTTP client, audit/outbox integration,
and readiness. No public routes, no final approval, no maker-checker, no IAM-02 integration, no
CDD/KYC/KYB/AML, no authorised users/mandates/duplicate detection/related-party graph/monitoring/
data-protection/retention — all explicitly out of scope per the approved Phase 1 planning report.

### 6.1 Schema / migration

`infra/migrations/020_clt1_intake_baseline.cjs` — one migration, no seed data. `client_profile`
is created (DDL only) but **zero Phase 1 code path ever writes a row to it** — inserting a client
identity before any real approval decision exists would fabricate ahead of the decision (blueprint
§5.4 "Onboarding Is Not Approval"); final approval is explicitly out of scope. CHECK constraints
on `client_application.status`, `client_application.client_class_status`, and
`client_classification_evidence.status` carry the FULL blueprint value set even though Phase 1
code only ever produces a subset (`draft/submitted/under_review/cancelled`, `claimed`, `provided`
respectively) — same forward-compatibility discipline as `cfg1.feature.current_state`'s own CHECK
carrying `locked`/`prohibited` before any Phase 3A code path produced them.

### 6.2 Grants

`infra/grants/clt1_runtime_grants.sql` — `role_clt1_runtime`: `SELECT, INSERT` + column-scoped
`UPDATE` on `client_application` (excludes `application_id`/`applicant_type`/`created_by`/
`created_at_utc` — identity-shaping fields set once at creation, same class as
`cfg1.feature.feature_name`); `SELECT` only on `client_profile` (zero writes, mirrors CFG-01's own
Phase 1 precedent of granting `SELECT` on an empty forward-compat table); `SELECT, INSERT` only
(no `UPDATE`) on `client_classification_evidence`/`consent_record` (append-only — no verify/revoke
route this phase); `INSERT` only on `foundation.outbox_event`. No `DELETE`/`TRUNCATE` anywhere. No
`iam2.*`/`sec1.*`/`cfg1.*` grant — CFG-01 reached only over HTTP.

### 6.3 CFG-01 integration — evaluate-only, synthetic fixtures in tests, no production claim

`services/clt1/src/lib/cfg1-client.ts` (own copy, F3(c), never imports `services/cfg1`) wraps
exactly `POST /internal/cfg1/features/evaluate` — **never `verify-decision`, never a stored
decision token**: every Phase 1 gate check is actioned in the same request it is checked in (class
claim/change, submit), so there is no window for a bounded-reuse token to protect.
`onboardingFeatureCodeForClass` maps `institutional`/`hnwi`/`professional` to their own
`onboarding.*` codes and **both `retail` and `unknown` to `onboarding.retail_default`** — no local
special-casing; the block is structural, via CFG-01's own permanently-prohibited registry entry
(migration 014, Doc00 §10.2A / MSR CLT-RULE-001), mirroring CFG-01's own `exchange.` prefix guard
philosophy. Fails closed (network error / non-2xx / malformed body / genuine deny → `allowed:
false`) exactly like `services/cfg1/src/lib/iam2-client.ts`'s `checkPermission`.

**No production `cfg1.feature` row for `onboarding.institutional`/`.hnwi`/`.professional` exists
after this phase ships.** `tests/integration/clt1-db.test.ts` proves the allow path via a
`realisticCfg1Fetch()` stub (simulating an operator having already run CFG-01's own accepted Phase
3A governed mutation workflow) — synthetic, test-only, documented as such. A separate operational
runbook (CFG-01's existing `feature-changes/request`+`apply` routes, IAM-02-approved) must create
the real rows before Phase 1 code can return anything but `unknown_fail_closed` for those three
classes in a real environment. Retail needs no fixture — it hits the real seeded permanent
prohibition.

### 6.4 Application workflow / state machine

`clt1.client_application.status`: `draft → submitted → under_review`, plus `draft|submitted →
cancelled`. No `approved`/`rejected`/`held`/`duplicate_review`/`pending_kyc`/`pending_aml`
transition exists — those belong to later phases (final approval, CDD gate) and are not
reachable via any Phase 1 route despite existing in the CHECK constraint. `start-review` is a
purely administrative marker (no reviewer-permission model exists yet — no IAM-02 integration
this phase) — flagged, not solved, same class of carry-forward as the interim internal-identity
token. Every mutating route embeds its required current `status` directly in the `UPDATE ...
WHERE` clause (e.g. `WHERE application_id = $1 AND status = 'draft'`) — a concurrent conflicting
request simply loses the race and gets `CLT1_APPLICATION_INVALID_STATE`; no separate row locking
needed for these low-throughput admin flows.

### 6.5 Class / evidence / consent

Two-axis model: `client_class_claimed` + `client_class_status` on the application
(`client_class_status` stays `'claimed'` all phase — **no verify/reject route exists**, since no
IAM-02 permission model exists yet to safely gate who may verify a class claim; building an
unguarded verify endpoint would itself be the "silent client-class upgrade" blueprint prohibited-
behaviour #2 protects against). `client_classification_evidence` rows are always `status =
'provided'`, `client_class` inferred from the application's current claim (never independently
supplied, ruling out a mismatch bug class by construction). `consent_record` is append-only; no
revoke route this phase. `submit` requires ≥1 consent row (`CLT1_CONSENT_REQUIRED` otherwise) —
directly justified by blueprint item 13 / FR-019 (terms acknowledgement capture).

### 6.6 PII / sensitive reads

Real PII (`legal_name`/`registration_number`/`country_of_incorporation`/`applicant_email`) is
stored in `client_application` (it must live somewhere as the system of record) but **no Phase 1
route ever returns it** — `safeApplicationResponse()` (`lib/applications.ts`) is the single choke
point every response passes through, deliberately projecting only non-PII operational fields. This
sidesteps SEC-01 sensitive-read logging entirely rather than building a half-guarded version of it
(SEC-01's own Phase 4 required a dedicated permission-guarded route + tier-based redaction to do
this properly). `CLT1_LOG_REDACT_PATHS` extended with the PII-bearing request-body field names as
a defensive second layer.

### 6.7 Error model

Added: `CLT1_CFG_GATE_REQUIRED`, `CLT1_CFG_GATE_DENIED`, `CLT1_RETAIL_ONBOARDING_BLOCKED`,
`CLT1_APPLICATION_INVALID_STATE`, `CLT1_APPLICATION_NOT_FOUND`, `CLT1_CONSENT_REQUIRED`,
`CLT1_AUDIT_REQUIRED`, `CLT1_SERVICE_UNAVAILABLE` — each maps to exactly one reachable Phase 1
code path. `CLT1_CFG_GATE_REQUIRED` specifically guards a defensive invariant (an application must
have a gate check on file before submit re-runs it) that the normal HTTP flow can never actually
trigger (creation always gate-checks) — proven anyway, by directly clearing the stored gate
columns in the integration test, same "defense in depth even though the normal flow already
prevents it" discipline CFG-01's own `isFeatureMutationBlocked` uses. **Deliberately not added**
(no reachable Phase 1 code path throws them): `CLT1_CLIENT_CLASS_UNVERIFIED`,
`CLT1_SENSITIVE_READ_LOG_REQUIRED` — both remain available for whichever later phase builds the
route/logic that can throw them.

### 6.8 Routes

`GET /internal/clt1/health` (unchanged), `GET /internal/clt1/readiness` (new — DB connectivity +
`clt1.*` table reachability ONLY, deliberately never checks CFG-01 reachability, so a CFG-01 blip
never makes a healthy CLT-01 instance report `not_ready`), `POST /internal/clt1/applications`,
`PATCH .../applications/:id`, `POST .../classification-evidence`, `POST .../consents`, `POST
.../submit`, `POST .../start-review`, `POST .../cancel`, `GET .../applications/:id`. All
internal-only (`/internal/clt1/*`) — no public `/clt1/*` surface (IAM-01's session/user-facing
model isn't wired to CLT-01 yet; reusing the interim shared internal-service-token for public
ingress would invert its entire threat model). No `/internal/clt1/clients/{client_id}/status`
route — no `client_profile` row ever exists to have a status.

### 6.9 Audit/outbox

`publishAudit`/`enqueueOutbox`, transaction-coupled with every mutation — never thrown from inside
`withTransaction` (IAM-02 bug lesson, reused via CFG-01's own `routes/features.ts` precedent): a
CFG-01 gate denial is written as an audit event *inside* the transaction as a structured outcome,
and the route throws the specific error only *after* the transaction commits, so a denied attempt
is never left without its audit trail. Events: `clt1.application_created`,
`clt1.application_updated`, `clt1.application_submitted`, `clt1.application_under_review`,
`clt1.application_cancelled`, `clt1.client_class_claimed`, `clt1.classification_evidence_added`,
`clt1.consent_recorded`, `clt1.retail_onboarding_blocked`, `clt1.cfg_gate_denied`.

### 6.10 Files changed

```
infra/migrations/020_clt1_intake_baseline.cjs                  (new)
infra/grants/clt1_runtime_grants.sql                             (new)
services/clt1/src/config.ts                                      (extended)
services/clt1/src/lib/cfg1-client.ts                              (new)
services/clt1/src/lib/errors.ts                                  (extended)
services/clt1/src/lib/applications.ts                             (new)
services/clt1/src/routes/applications.ts                         (new)
services/clt1/src/routes/system.ts                                (extended — readiness)
services/clt1/src/server.ts                                        (extended — route registration, redact paths)
tests/unit/clt1-cfg1-client.test.ts                               (new)
tests/unit/clt1-applications.test.ts                              (new)
tests/unit/clt1-app.test.ts                                        (extended)
tests/unit/clt1-config.test.ts                                    (extended)
tests/unit/clt1-log-redaction.test.ts                             (extended)
tests/integration/clt1-db.test.ts                                  (new)
docs/implementation/CLT-01_IMPLEMENTATION_NOTES.md                 (this section)
```

### 6.11 Verification performed

Fresh disposable Postgres; migrations 001→020 applied in the established batched order (007 needs
`role_iam2_runtime` pre-created); all 6 grant files applied clean (`fnd`/`iam`/`iam2`/`sec1`/
`cfg1`/`clt1`). One conclusive full-suite run against the freshly-migrated database (a prior
same-database re-run produced 22 unrelated failures from IAM-01/IAM-02 bootstrap-tests colliding
with leftover state from an earlier run in the same session — not a CLT-01 regression; resolved by
recreating the database and running the full suite exactly once):

```
npx tsc -b                       # clean
npx tsc -b --force                # clean, full rebuild
npx vitest run --pool=forks --poolOptions.forks.singleFork=true
```

**Result: 57 test files, 806/806 tests passing, 0 failures** (prior accepted baseline: 740/740;
+66 new: 9 `clt1-cfg1-client`, 17 `clt1-applications`, 33 `clt1-db` integration, 2 `clt1-config`,
1 `clt1-log-redaction`, 4 `clt1-app`). Targeted CLT-01 unit tests independently re-run in
isolation: all passing. `clt1-db.test.ts`'s 33 tests exercise every Phase 1 error code against the
real DB + a stubbed CFG-01 (`realisticCfg1Fetch`/`denyAllCfg1`/`cfg1Unreachable`), the real grant
boundary (`DELETE`/`TRUNCATE` rejected everywhere, `client_profile` proven `SELECT`-only,
column-scoped `UPDATE` proven on `client_application`), audit/outbox transaction-coupling
(including a forced-failure rollback proof with no orphaned row), PII exclusion from every GET
response, and `client_profile` remaining empty after every scenario including a full
create→evidence→consent→submit→start-review flow. Static greps confirmed: no public `/clt1/*`
route string anywhere in source; zero forbidden Exchange/business fragments in real code (only in
header-comment cross-references, same as every prior module); zero cross-schema `GRANT` beyond
`foundation.outbox_event`; zero `DELETE`/`TRUNCATE` grant; zero real `import` statement crossing a
service boundary. Disposable database and server torn down after the run.

### 6.12 Remaining deferred items

- The CFG-01 `cfg1.feature`-row operational runbook (§6.3) — not yet executed in any real
  environment; Phase 1 code is correct but the production onboarding gates for institutional/hnwi/
  professional remain effectively `unknown_fail_closed` until it is.
- `start-review`'s reviewer identity is a declared, unauthenticated field — no IAM-02 permission
  model gates who may call it, same interim posture as every other Phase 1 route.
- The interim shared-token internal-identity model — unchanged from Phase 0, still flagged as
  higher-stakes now that real PII-adjacent routes exist (though PII itself is never returned).
- Class-claim verification, final approval, CDD/KYC/KYB/AML, authorised users/mandates, duplicate
  detection, related-party graph, ongoing monitoring, data protection/retention, and evidence
  export all remain fully out of scope — see the Phase 1 planning report's proposed later-phase
  breakdown (not a commitment; each needs its own planning pass).
- L1 from the Phase 0 Opus review (test route-surface strictness vs. the real boot guard) remains
  open and unaffected by Phase 1.

**CLT-01 Phase 1 is an accepted implementation baseline.**

## 7. Independent Opus review — ACCEPT

Independently reproduced from a genuinely fresh disposable Postgres (not trusting the reported
result): migrations 001→020 applied in the established batched order, all 6 grant files
(`fnd`/`iam`/`iam2`/`sec1`/`cfg1`/`clt1`) applied clean. **806/806 tests, 57 files, 0 failures**;
`tsc -b` clean both incrementally and on a forced full rebuild (`--force`).

Grant boundary verified directly via `information_schema.role_table_grants`/
`role_column_grants` — not just by reading the SQL: `role_clt1_runtime`'s column-scoped `UPDATE`
on `client_application` confirmed to exclude `id`/`application_id`/`applicant_type`/
`created_by`/`created_at_utc`; zero grant present in `iam`/`iam2`/`sec1`/`cfg1` schemas. Route
surface independently enumerated from source: exactly the 10 approved internal routes, no
public `/clt1/*` surface. Confirmed only `POST /internal/cfg1/features/evaluate` is ever called
from `lib/cfg1-client.ts` — `verify-decision` is never invoked. Static sweeps (public-route
strings, Exchange/trading fragments in real code, cross-schema grants, `DELETE`/`TRUNCATE`
grants, cross-service imports, decision-token handling) all clean.

**Verdict: ACCEPT CLT-01 Phase 1.** No Critical/High/Medium findings. Four Low/informational,
non-blocking:
- **L1** — `CLT1_SERVICE_UNAVAILABLE`'s catalogue message reads "CLT-01 database is not
  reachable" even when the actual cause is CFG-01 being unreachable (`interpretCfgGate` reuses
  this code for the `cfg1_unavailable` reason). The `details` field is accurate; only the
  top-level message is imprecise for that case. Consider a distinct `CLT1_CFG_GATE_UNAVAILABLE`
  code in a later phase.
- **L2** — audit `actor_id` falls back to `application_id`/`service` for routes with no declared
  human-actor field (`patch`/`submit`/`cancel`, and `start-review` without a `reviewer_id`) —
  weak attribution, acceptable interim given no IAM-02 identity model yet, tighten when IAM-02
  integration lands.
- **L3** — no FK from `client_classification_evidence.application_id`/
  `consent_record.application_id` to `client_application.application_id` — existence is enforced
  only at the API layer (`fetchApplicationOrThrow`). Consistent with the codebase's append-only-
  log FK-avoidance style; a hardening opportunity, not a defect.
- **L4** — readiness probes only `client_application` as the table-reachability proxy, not all
  four `clt1.*` tables (low-risk, since all four are created atomically in one migration).

No code was written or changed during the review. `MODULE_STATUS.md`, `PROJECT_HANDOVER.md`, and
`SESSION_START_PROMPT.md` (sibling `aix-platform-docs` workspace) have been updated accordingly.

## 8. Phase 2 — ACCEPTED implementation baseline after independent Opus review — CDD outcome gate + final approval control

CLT-01's first real IAM-02 integration. Closes the loop from "an application sits in
`under_review`" to a real, capability-limited client. No KYC/KYB/AML/sanctions/PEP/adverse-media
screening logic anywhere — Phase 2 only receives and gates on outcome records (from a future
KYC-01/AML-01 module or, this phase, test fixtures). No public `/clt1/*` route added.

**Schema (`021_clt1_cdd_final_approval.cjs`).** `client_application` gains 4 CDD rollup columns
(`cdd_outcome_status`/`aml_sanctions_status`/`pep_adverse_media_status`/`risk_rating_status`, one
canonical 9-value enum — `pending, pass, fail, hit, rejected, stale, remediation_required,
unavailable, not_required` — used uniformly across all four, normalising the blueprint's own
inconsistent per-column vocabulary) and 6 decision columns
(`approved_at_utc`/`rejected_at_utc`/`held_at_utc`/`approval_id`/`rejection_reason`/`hold_reason`).
Three new tables: `cdd_outcome` (append-only received-outcome log), `handoff_status`
(delivery-tracking only — blueprint data rule 12 keeps delivery separate from outcome status; no
outbound call of any kind, only ever writes `delivery_status='pending'`), and
`application_decision_request` (documented extension beyond the blueprint, mirrors
`cfg1.feature_state_change`'s shape exactly — CLT-01's own request/apply binding row for `approve`
only; `reject`/`hold` never use it). FK hardening: the three new tables + `client_profile` all get
a real FK to `client_application`; Phase 1's `client_classification_evidence`/`consent_record`
deliberately left as-is.

**IAM-02 permissions (`022_iam2_register_clt1_permissions.cjs`).** Exactly 5:
`clt1.application.review`/`.reject`/`.hold`/`clt1.cdd_outcome.read` (`requires_approval=false`,
single-step, `checkPermission`-baseline-gated) and `clt1.application.approve`
(`requires_approval=true`, IAM-02 execute-verify-bound). All `licence_locked=false` from day one —
CFG-01 Phase 3A's F-1 lesson applied up front, not discovered by a later review pass. Zero
`role_permission` seed. `clt1.cdd_outcome.receive` and `clt1.client_profile.create` deliberately
NOT registered — outcome receipt is service-to-service ingestion (internal-identity-guarded only,
same posture as CFG-01's `evaluate()`), and profile creation is never independently invokable (a
same-transaction consequence of a successful `approve/apply`).

**Approval flow.** `approve/request` + `approve/apply` mirror
`services/cfg1/src/routes/feature-changes.ts` exactly: `payload_hash` over
`{decision_id, application_id, client_class_claimed, requested_by}`, snapshotted onto the stored
`application_decision_request` row at request time and recomputed from that STORED row at apply
time (never a live re-read); `execute-verify`'s `actor_id` bound to the stored row's own
`requested_by`, never a caller-supplied value; token-consumed-after-verify discipline (a post-verify
failure rolls the row back to `requested`, safely retriable with a fresh approval, plus a
best-effort `recordFailureAudit`). `approve/apply` requires, both before the network calls and
again inside the locked transaction: at least one KYC and one AML `handoff_status` row
(`CLT1_KYC_HANDOFF_REQUIRED`/`CLT1_AML_HANDOFF_REQUIRED`); all four CDD rollup columns `pass`
(`CLT1_CDD_OUTCOME_REQUIRED`/`CLT1_CDD_OUTCOME_FAILED`, with sharper
`CLT1_AML_SANCTIONS_HIT`/`CLT1_RISK_REJECTED` checked first); a fresh CFG-01 onboarding-gate
re-check (third checkpoint, after create/submit). Local partial-SoD: `approve/request` blocks with
`CLT1_SELF_APPROVAL_BLOCKED` when `requested_by === assigned_reviewer` — IAM-02's own approve
endpoint separately blocks requester==approver, but execute-verify never exposes approver identity
back to CLT-01, so whether the eventual approver is also the reviewer cannot be checked from
CLT-01's side; not invented. `reject`/`hold` are single-step, `checkPermission`-gated only —
deliberately not maker-checker, since only `approve` creates capability.

**client_profile.** Created only as a same-transaction consequence of `approve/apply`, exactly one
row, `status = 'active_limited'` — non-transactional, grants no wallet/deposit/withdrawal/
trading/settlement/Exchange capability. A duplicate/racing apply cannot create a second row
(`FOR UPDATE` lock + status re-check inside the transaction).

**`GET /internal/clt1/clients/{client_id}/status`.** Internal-identity-guarded only (blueprint
frames this as a downstream-module service check, not a human-permission-checked read). Returns
only `client_id`/`status`/`client_class`/`created_at_utc` — never PII, even though
`client_profile` stores it.

**Error model.** `CLT1_SERVICE_UNAVAILABLE` is now reserved strictly for CLT-01's own DB/service
failure (Phase 1 Opus review L1, closed) — `interpretCfgGate` now throws the new
`CLT1_CFG_GATE_UNAVAILABLE` for a CFG-01-unreachable gate check; the new `CLT1_IAM2_UNAVAILABLE`
is thrown symmetrically whenever an IAM-02 baseline `checkPermission` call itself fails
(`reason === "iam2_unavailable"`), distinct from a genuine permission denial
(`CLT1_PERMISSION_DENIED`). `CLT1_APPROVAL_REQUIRED` is reserved for `approve/apply`'s
execute-verify failures specifically (mirrors CFG-01's `CFG1_MUTATION_UNAUTHORISED` /
`CFG1_MUTATION_APPROVAL_REQUIRED` split).

**Grants.** `client_application` UPDATE extended with the new columns; `client_profile` extended
from SELECT-only to SELECT+INSERT (no UPDATE — no suspend/close/upgrade route exists yet);
`cdd_outcome`/`handoff_status` get SELECT+INSERT only (append-only); `application_decision_request`
gets SELECT+INSERT plus a column-scoped UPDATE (`status`/`approval_id`/`decision_token_hash`/
`applied_at_utc` only — `requested_by`/`payload_hash` immutable after creation). Still zero grant
into `iam2`/`sec1`/`cfg1` — CLT-01 reaches both CFG-01 and IAM-02 only over HTTP.

**Verification performed.** Fresh disposable Postgres, migrations 001→022 applied in the
established batched order (grant files interleaved where a later migration's `GRANT ... TO
role_X_runtime` requires the role to already exist), all 6 grant files applied clean including the
extended `clt1_runtime_grants.sql`. `tsc -b --force`: clean. **Full suite: 889/889 tests, 60
files, 0 failures** (806 baseline + 34 new unit tests [`clt1-outcomes.test.ts`,
`clt1-iam2-client.test.ts`] + Phase 2 additions to `clt1-db.test.ts` [72 tests total, up from 33]
+ the new real-listening-IAM-02 file `clt1-iam2-guard-real.test.ts` [7 tests] + small fixes to
pre-existing tests whose expectations changed: `interpretCfgGate`'s new error code,
`start-review`'s now-required `reviewer_id`, the log-redaction path list, the app-level route
inventory, and the `client_profile` grant-boundary test updated from "SELECT only" to "SELECT+INSERT,
no UPDATE"). Static sweeps clean: no public `/clt1/*` route string anywhere; no
Exchange/trading/order-book/matching/principal/spread wording outside the existing boot guard and
explanatory absence-comments; no KYC/AML screening-engine/vendor-call wording; no literal `GRANT
... ON iam2.*/cfg1.*/sec1.*` in `clt1_runtime_grants.sql` (only comments referencing other
modules' schemas for design precedent); no route returns `legal_name`/`applicant_email`/
`registration_number`/`country_of_incorporation` in a response body (only as accepted input or DB
writes). Direct IAM-02 catalogue inspection confirms exactly 5 `clt1.*` permission rows, all
`licence_locked=false`, zero `role_permission` seed; the real (non-stubbed) IAM-02 guard confirms
`clt1.application.approve` resolves to `approval_required` (never `licence_locked`) for an
unprovisioned actor, and a provisioned actor reaches a real `allow` for `clt1.application.review`.

**Remaining deferred items (explicitly out of Phase 2 scope, not oversights):** actual KYC/KYB/AML/
sanctions/PEP/adverse-media screening engines; duplicate detection (blueprint's own "duplicate
flags must be resolved before final approval" rule is not enforced this phase — flagged, not
faked); verified identity graph, related-party graph, authorised users, mandates; `client_profile`
status upgrade path (`active_limited` → `active`) and any suspend/close route; `held` has no exit
route; `country_of_residence`/`jurisdiction`/`onboarding_channel` intake fields remain unimplemented
(carried forward from Phase 1); a distinct `client_profile.create` CFG-01 feature gate (Phase 2
reuses the existing `onboarding.<class>` gate instead — a reasoned simplification, not an
oversight); wallet/custody, deposits, withdrawals, trading, settlement, Exchange runtime, order
book, matching engine, market making, principal dealing, spread markup; data protection/retention,
evidence export; ongoing-monitoring feedback beyond CDD outcome status.

**Sonnet self-review.** No Critical/High/Medium or test-breaking defects found; no code changes
made. One Low, informational finding: `recordFailureAudit()` in `approve/apply` uses the event
type `clt1.cdd_gate_denied` for every post-verify failure path, including a CFG-01
onboarding-gate denial — the `reason_code`/`action` fields disambiguate the real cause, so no
information is lost, but the event name itself is not type-specific.

**Independent Opus review → ACCEPT.** Independently reproduced from a genuinely fresh disposable
Postgres (migrations 001→022, all 6 grant files): **889/889 tests, 60 files, 0 failures** (806
baseline + 83 new), `tsc -b --force` clean (both incrementally and on a forced full rebuild).
IAM-02 catalogue inspected directly (`SELECT ... FROM iam2.permission WHERE permission_code LIKE
'clt1.%'`): exactly 5 rows, all `licence_locked=false`, only `clt1.application.approve`
`requires_approval=true`, zero `role_permission` seed rows. Runtime grants verified directly at
`information_schema.role_table_grants`/`role_column_grants` (not by reading the SQL): `client_profile`
= `{INSERT, SELECT}` with zero UPDATE columns; `application_decision_request`'s column-scoped
UPDATE is exactly `{status, approval_id, decision_token_hash, applied_at_utc}`; zero grant into
`iam`/`iam2`/`sec1`/`cfg1`; zero DELETE/TRUNCATE anywhere. IAM-02's own source
(`services/iam2/src/lib/decision-token.ts`, `routes/approvals.ts`) was cross-checked to confirm
`execute-verify` binds to and returns only `maker_user_id`, never the approver — validating that
CLT-01's `CLT1_SELF_APPROVAL_BLOCKED` design and its documented residual approver-side SoD gap are
both correct. Real (non-stubbed) IAM-02 guard coverage
(`tests/integration/clt1-iam2-guard-real.test.ts`) independently re-run and confirmed genuine.
Static sweeps (public routes, Exchange/trading/orderbook/matching/principal/spread/wallet/deposit/
withdrawal/settlement, screening-engine wording, cross-schema grants, PII in response bodies, raw
decision-token storage) all clean. **No Critical/High/Medium findings.**

Three Low/informational findings, none blocking:
- **L1** (the self-review finding, carried forward and assessed): `recordFailureAudit()` emits
  `clt1.cdd_gate_denied` for every post-verify `approve/apply` failure path — CFG-01 gate denial,
  in-transaction CDD/handoff gate failure, and generic transaction failure alike. Assessed as
  acceptable Low/informational as-is (best-effort audit only, `reason_code`/`action` carry the
  real cause, zero security/correctness/data impact) — but §8's own text above asserted
  `clt1.cfg_gate_denied` is emitted at approval time, which the code does not do. Fix in the next
  CLT-01 touch: either give the CFG-01-denial (and generic) failure path its own accurate
  `event_type`, or correct this section to match the code exactly.
- **L2**: `client_profile` has `UNIQUE(client_id)` but no `UNIQUE(application_id)`. Duplicate-profile
  prevention is currently sound (the `client_application` status guard under a `FOR UPDATE` lock
  makes a second profile unreachable), but there is no structural DB-level backstop. Consider
  adding `UNIQUE(application_id)` in the next `clt1` migration.
- **L3**: `createHandoff(...)` in `routes/outcomes.ts` takes a `ctx` parameter that is never used —
  `handoff_status` has no `request_id`/`correlation_id` columns, unlike `cdd_outcome` and
  `application_decision_request`. Dead parameter plus a minor audit-trail column asymmetry;
  correlation still flows via `publishAudit`'s own ambient context.

No code was written or changed during the review. `MODULE_STATUS.md`, `PROJECT_HANDOVER.md`, and
`SESSION_START_PROMPT.md` (sibling `aix-platform-docs` workspace) have been updated accordingly.

**CLT-01 Phase 2 is an accepted implementation baseline. CLT-01 Phase 3 has not been started.**

## 9. Phase 3 — ACCEPTED implementation baseline after independent Opus review — authorised users + client mandate baseline

CLT-01's second real IAM-02 integration. Gives an `active_limited` client the ability to record
who may act on its behalf (`clt1.authorised_user`) and what they are permitted to do
(`clt1.client_mandate`) — the two structural prerequisites downstream execution modules
(WLT/DEP/WDR/TRD) will eventually need, without building any of those modules, any real
capability, or `clt1.authorised_party` (the blueprint's distinct screening/UBO-linked table,
deferred entirely, not partially built). `client_profile.status` remains `active_limited`
throughout — no route in this codebase writes `'active'`.

**Schema (`023_clt1_authorised_users_mandates.cjs`).** Closes Phase 2 carry-forward L2:
`UNIQUE(application_id)` added to `client_profile`. `clt1.authorised_user` — `role` is the
blueprint's own real enum (`client_admin`/`client_maker`/`client_approver`/`viewer`, not the
task brief's own suggested list, which was actually `authorised_party.party_type` conflated in
the brief's framing); `status` (`active`/`inactive`/`suspended`/`revoked`) has no `pending` value
— mirroring `client_profile`, a row is only ever inserted directly at `status='active'` by
`add/apply`. `user_reference` is a DECLARED string (name/email/external reference), never a
foreign key to `iam.user_identity` — confirmed by direct inspection of `services/iam/src` that
the only code path ever inserting a `user_identity` row is the one-time bootstrap admin; there is
no client-user registration route to connect to. `clt1.client_mandate` — `mandate_type`/`status`
per blueprint; no `'draft'`/`'approval_required'`/`'rejected'` row-state (mirrors
`client_profile`'s own deviation from a literal per-row blueprint state diagram); `rules jsonb`
constrained to `jsonb_typeof(rules)='object'` as a defense-in-depth backstop (full key/shape
validation is TypeBox's job); `iam2_dual_auth_policy_ref` kept nullable, NEVER populated — direct
inspection of the accepted IAM-02 implementation confirms no "WF-IAM02-10" policy concept exists
at all; the blueprint references an IAM-02 contract that was never built. A partial unique index
(`idx_clt1_client_mandate_one_active_per_client`) enforces at most one active mandate per client
at the DB level, mirroring CFG-01 Phase 3B's kill-switch precedent. Two new decision-request
tables (`authorised_user_decision_request` with `decision_type IN ('add','remove')`,
`client_mandate_decision_request` with `decision_type IN ('create','update')`) mirror
`application_decision_request`'s exact request/apply binding shape — one table per entity, a
type variant within it, not two separate tables per action.

**IAM-02 permissions (`024_iam2_register_clt1_phase3_permissions.cjs`).** Exactly 8:
`clt1.authorised_user.add`/`.remove` and `clt1.client_mandate.create`/`.update`
(`requires_approval=true`, execute-verify-bound — blueprint Maker-Checker Required items 5/6
verbatim, followed literally even though `remove` reads as capability-*reducing*: the blueprint's
own reasoning is that both directions of signing-authority change are abuse-prone); `clt1.
authorised_user.read`/`.suspend`/`.reactivate` and `clt1.client_mandate.read`
(`requires_approval=false`, single-step — no blueprint maker-checker requirement for either, both
proportionate reversible protective-control toggles, the same reasoning CFG-01 Phase 3B applied
to kill-switch activation vs. deactivation). All `licence_locked=false` from day one (the CFG-01
F-1 lesson, applied a third time). Zero `role_permission` seed. No `authorised_party`, no
mandate-check permission, no wallet/deposit/withdraw/trade/Exchange permission of any kind.

**Authorised-user / mandate flows.** `add`/`remove`/`create`/`update` mirror `approve/request`+
`approve/apply` exactly: `payload_hash` snapshotted onto the stored decision-request row at
request time, recomputed from that STORED row at apply time; `execute-verify`'s `actor_id` bound
to the stored `requested_by`; token-consumed-after-verify discipline. Self-add block
(`requested_by === user_reference`, reuses `CLT1_SELF_APPROVAL_BLOCKED`) — the only CLT-01-owned
SoD check possible for Phase 3, since (unlike `assigned_reviewer` for applications) there is no
other assigned-relationship to compare a mandate/remove requester against; IAM-02's own
maker≠approver check is the sole additional control, honestly documented as such, not assumed
sufficient. `suspend`/`reactivate` are single-step, `checkPermission`-gated only.
`create`/`add`/`remove` insert or mutate the target row directly inside a `FOR UPDATE`-locked
transaction exactly like `approve/apply`. "Activate" from the brief's "create/update/activate"
workflow is consolidated into `create` (no separate activation step, since the row never exists
pre-active).

**Client status extension.** `GET /internal/clt1/clients/{client_id}/status` gains
`mandate_configured`/`authorised_users_configured` (additive booleans — "≥1 active row exists"),
computed alongside the existing PII-free fields. `client_profile.status` itself is untouched.

**Two real defects found and fixed during implementation** (not merely self-review — caught while
running the integration suite against a real Postgres, before any review pass):
1. `SELECT ... FOR UPDATE` on `client_profile` inside `add/apply` and `create/apply` failed with
   `permission denied` under the real `role_clt1_runtime` — Postgres requires the UPDATE
   privilege for `FOR UPDATE` row locking even on a read-only lock, but `client_profile`
   deliberately has no UPDATE grant (correctly — no Phase 1/2/3 route ever mutates it). Fixed by
   dropping to a plain `SELECT` (no lock needed: no other transaction in this codebase ever
   writes `client_profile.status`, so there is nothing to race against).
2. `remove/apply`'s `UPDATE clt1.authorised_user` statement tried to set `approval_id`, but the
   locked grant for `authorised_user` scopes UPDATE to `status`/`version`/`updated_at_utc` only.
   Fixed in the CODE, not the grant: `approval_id` on `authorised_user` represents the ADD
   approval (set once at INSERT time) and is deliberately not overwritten on removal — the
   removal's own approval reference is already captured on the `authorised_user_decision_request`
   row itself.

**Verification performed.** Fresh disposable Postgres, migrations 001→024 (grant files
interleaved as established), all 6 grant files clean including the extended
`clt1_runtime_grants.sql`. `tsc -b --force`: clean. **Full suite: 949/949 tests, 62 files, 0
failures** (889 baseline + 60 new: 8 `clt1-authorised-users.test.ts` + 11 `clt1-mandates.test.ts`
+ Phase 3 additions to `clt1-db.test.ts` [111 tests total, up from 72] + Phase 3 additions to
`clt1-iam2-guard-real.test.ts`). Static sweeps clean: no public `/clt1/*` route string; no
Exchange/trading/wallet/deposit/withdrawal/settlement wording outside the boot guard; zero
`authorised_party` reference anywhere in `services/clt1/src`; no screening-engine wording; no
literal cross-schema `GRANT`; no PII (`user_reference` included) in any response body. Direct DB
inspection confirms exactly 13 `clt1.*` permissions (5 Phase 2 + 8 Phase 3), all
`licence_locked=false`, zero `role_permission` seed; grants on the four new tables exactly as
locked (`authorised_user`/`client_mandate`/both decision-request tables all SELECT+INSERT, with
the documented column-scoped UPDATE only); the one-active-mandate-per-client partial unique index
confirmed present; `authorised_party` table confirmed absent.

**Remaining deferred items (explicitly out of Phase 3 scope, not oversights):** `clt1.
authorised_party` (director/UBO/controller/screening-linked, a distinct blueprint table/concept);
identity verification / verified identity graph; duplicate detection; a mandate-check endpoint
for downstream modules (no blueprint contract exists to build one against yet, and no real
caller); a sensitive authorised-user detail route; IAM-01 client-user login integration (no real
client-user account creation flow exists yet to connect to); mandate suspend/revoke/expire routes
(blueprint's `active→expired`/`active→revoked` transitions — `expires_at_utc` is stored for a
future scheduled-expiry job, no scheduler exists yet); `client_profile` active/suspend/close
lifecycle; wallet/custody, deposits, withdrawals, trading, settlement, Exchange runtime, order
book, matching engine, market making, principal dealing, spread markup; data protection/
retention, evidence export; ongoing monitoring engine.

**Sonnet self-review.** No Critical/High/Medium or test-breaking defects found; no code changes
made. One Low, informational finding: the "no PII (`user_reference` included) in any response
body" sentence above is grammatically ambiguous — the code and tests confirm the intended
(correct) reading holds.

**Independent Opus review → ACCEPT.** Independently reproduced from a genuinely fresh disposable
Postgres (migrations 001→024, all 6 grant files): **949/949 tests, 62 files, 0 failures** (889
baseline + 60 new), `tsc -b --force` clean. A first reproduction attempt doubled-ran the suite
against the same database and surfaced 22 failures, all confined to IAM-01/IAM-02/CFG-01
bootstrap/seed-state tests (none in CLT-01) — traced to the one-time-per-database IAM
bootstrap-to-RBAC transition being consumed twice by two runs against the same database;
recreating a genuinely fresh database and running exactly once reproduced a clean 949/949, with
CLT-01's own tests (`clt1-db.test.ts` 111, `clt1-iam2-guard-real.test.ts` 9, all unit files)
passing in both runs. IAM-02 catalogue inspected directly (`SELECT ... FROM iam2.permission
WHERE permission_code LIKE 'clt1.%'`): exactly 13 rows (5 Phase 2 + 8 Phase 3), all
`licence_locked=false`, zero `role_permission` seed. Runtime grants verified directly at
`information_schema.role_column_grants`: `authorised_user` UPDATE = exactly `{status,
updated_at_utc, version}`; `client_mandate` UPDATE = exactly `{approval_id,
mandate_schema_version, mandate_type, rules, status, updated_at_utc, version}`; both
decision-request tables UPDATE = exactly `{applied_at_utc, approval_id, decision_token_hash,
status}`; zero grant into `iam`/`iam2`/`cfg1`/`sec1`; zero DELETE/TRUNCATE anywhere. Real
(non-stubbed) IAM-02 guard coverage (`clt1-iam2-guard-real.test.ts`) independently confirmed
genuine for all 8 new permissions — both the unprovisioned-actor and properly-provisioned-actor
paths. Route surface independently enumerated from source: exactly the expected internal routes,
all under `/internal/clt1/*`, no public/mandate-check/sensitive-detail/authorised-party route.
Static sweeps (public routes, Exchange/trading/wallet/deposit/withdrawal/settlement wording,
`authorised_party` implementation, mandate-check route, PII in response bodies, cross-schema
grants) all clean — the only matches were comment-only absence-documentation, not executable
code. `fingerprint()`'s canonical JSON serialization (recursive key-sorting) was independently
confirmed to make the maker-checker payload-hash binding robust to JSONB round-tripping of
`rules`. **No Critical/High/Medium findings.**

Three Low/informational findings, none blocking:
- **F1**: `create/apply` for a client that already has an active mandate surfaces as **503
  `CLT1_AUDIT_REQUIRED`** rather than a 409-class conflict, because the one-active-per-client
  unique-index violation is collapsed into the generic apply-failure catch
  (`routes/mandates.ts`). State is always correct (exactly one active mandate; the decision row
  stays `requested`, safely retriable) and the collapse is documented in-code, but 503 signals
  *transient/retryable* when the condition is a *permanent* conflict. Recommend mapping the
  23505 unique-violation on this specific index to a 409 `CLT1_MANDATE_*` code at the next
  CLT-01 touch.
- **F2**: `lib/errors.ts` describes `CLT1_MANDATE_INVALID_STATE` as "not reachable via any Phase
  3 route today," but two live throw sites exist in `routes/mandates.ts` (update/request's
  non-active-mandate guard, update/apply's raced re-check). The condition is genuinely
  untriggerable this phase (no route transitions a mandate out of `active`), but the wording
  should read "present as a defensive guard, not triggerable this phase" rather than implying
  the code path doesn't exist.
- **F3**: the self-review's own Low finding (this section's "no PII (`user_reference` included)
  in any response body" phrasing) — assessed as acceptable as Low; optional wording cleanup, not
  a precondition for acceptance.

**CLT-01 Phase 3 is an accepted implementation baseline.** No code was written or changed during
the review. Phase 4 has not been started.

## 10. Phase 4 — ACCEPTED implementation baseline after independent Opus review (M1/L1/L2 condition-fixed) — authorised party + screening linkage baseline

Gives an application the ability to record legal/compliance parties (directors, UBOs,
controllers, authorised signatories) and track their identity/sanctions screening outcomes
(`clt1.authorised_party`) — receipt and linkage only, no actual screening engine, no duplicate
detection, no related-party graph. `client_profile.status` remains `active_limited` throughout;
Phase 2's approval gate is untouched.

**Schema (`025_clt1_authorised_parties.cjs`).** `clt1.authorised_party` is APPLICATION-scoped, not
client-scoped — deliberately deviating from the blueprint's own literal §2.12 column list, which
lists both `client_id` and `application_id`. Parties are compliance data captured during CDD,
alongside `client_classification_evidence`/`consent_record` (both Phase 1, application-scoped) —
not alongside `authorised_user`/`client_mandate` (both Phase 3, client-scoped, since those only
make sense for an already-approved client). No `client_id` column is stored; for an approved
client, the party list is derived via `client_profile.application_id ->
client_application.application_id` (the FK Phase 2 already established). Routes are `client_id`-
scoped at the HTTP layer (matching the blueprint's public route shape and Phase 3's own routing
convention) — every route resolves `client_id -> client_profile.application_id` internally before
touching `clt1.authorised_party`.

`party_type` is narrowed to `signatory`/`director`/`controller`/`ubo` — the blueprint's own §2.12
enum also lists `client_admin`/`client_approver`, which are IDENTICAL to `authorised_user.role`
values (a blueprint-side conflation, not a task-brief paraphrase, the mirror image of the
conflation Phase 3 already documented from the brief's side). Excluding them keeps
`authorised_party` (compliance/legal party) and `authorised_user` (operational actor) genuinely
separate. `linked_user_id` (blueprint column) is omitted entirely — no real client-user
account-creation flow exists yet to link to. `party_reference` (declared name/reference,
PII-adjacent) is NOT a blueprint-named column — the blueprint's own §2.12 list has no
declared-identity field at all — added as a necessary, documented extension mirroring
`authorised_user.user_reference` exactly: stored, never returned by the default list route,
redacted from request logs.

`identity_verification_status` (`pending/pass/fail/stale`) and `sanctions_pep_status`
(`pending/clear/hit/review_required`) are the blueprint's own exact §2.12 enums — these ARE the
screening-linkage columns (receipt-only; no actual screening engine, no external vendor call
anywhere in this codebase). `authority_status` reconciles a genuine inconsistency between the
blueprint's own two documents: `05_Database_Design.md` §2.12 (`pending/active/restricted/revoked`)
vs. `06_State_Machine.md`'s diagram (which also needs `rejected` and `suspended`) — the union of
both is used. No reactivation path exists in Phase 4 (approved design decision) — the blueprint's
own diagram draws no arrow back to `active`/`pending` from any of `restricted`/`rejected`/
`revoked`/`suspended`; a corrected party requires a fresh `remove`+`add`, not a transition.
`ownership_percentage` is a plain optional numeric with zero automatic UBO-threshold behaviour —
the blueprint's own `ubo_identification_threshold` parameter is explicitly `to_be_defined`
(`01_Module_Blueprint.md` §5.15). `last_screened_at_utc`/`screening_source_module` mirror
`cdd_outcome.valid_until_utc`/`.source_module`'s own receipt-tracking precedent.
`clt1.authorised_party_decision_request` mirrors `authorised_user_decision_request`'s exact
shape, `decision_type IN ('add','update','remove','activate')` — `restrict`/`reject`/`suspend`
never write a row here, single-step only.

**IAM-02 permissions (`026_iam2_register_clt1_phase4_permissions.cjs`).** Exactly 8:
`authorised_party.add`/`.update`/`.remove`/`.activate` (`requires_approval=true`,
execute-verify-bound). No blueprint "Maker-Checker Required" item names authorised_party
directly (`07_Permission_Rules.md` §3 has exactly 10 items, none covering it) — this is a
documented, reasoned extension of the same abuse-prone-in-both-directions reasoning Phase 3
applied to `authorised_user.remove`, most defensible for `activate` specifically (the moment real
UBO/director/signatory authority becomes usable, directly analogous to Phase 2's
`application.approve`). `authorised_party.read`/`.restrict`/`.reject`/`.suspend`
(`requires_approval=false`, single-step — protective/restrictive actions, same reasoning Phase 3
applied to `suspend`/`.reactivate`). All `licence_locked=false` from day one (the CFG-01 F-1
lesson, applied a fourth time). Zero `role_permission` seed. `screening_outcome.receive` is
deliberately NOT registered — mirrors Phase 2's `cdd_outcome.receive` exactly: service-to-service
ingestion, internal-identity-guarded only, no human-permission gate.

**Authorised-party flows.** `add`/`update`/`remove`/`activate` mirror Phase 2/3's
`request`+`apply` pattern exactly: `payload_hash` snapshotted onto the stored decision-request row
at request time, recomputed from that STORED row at apply time; `execute-verify`'s `actor_id`
bound to the stored `requested_by`; token-consumed-after-verify discipline. `ownership_percentage`
(a `numeric` column) is deliberately stringified (`String(...)`) before it ever enters a
payload-hash computation — node-postgres returns `numeric` columns as strings (never JS numbers,
to avoid float-precision loss), so a request-time hash computed over a JS number and an apply-time
hash recomputed from the same value read back as a string would silently diverge and produce a
permanent payload_hash mismatch on every request carrying this field; normalising both sides to a
string up front keeps the hash stable across the request -> stored-row -> apply round trip. This
was caught and fixed during implementation (before any test ran red), not discovered by a later
review pass — flagged here so the precedent is visible for any future numeric-bearing decision
payload.

Self-action block (`requested_by === party_reference`, reuses `CLT1_SELF_APPROVAL_BLOCKED`) on
both `add` and `remove` where determinable. `add/apply` inserts directly at `authority_status=
'pending'` with both screening columns also `'pending'` (mirrors every prior phase's own
"insert directly at the real starting state" precedent). `activate/apply` requires blueprint Rule
3 (`05_Database_Design.md` §5 item 14 / `01_Module_Blueprint.md` §5.15): `identity_verification_
status='pass'` AND `sanctions_pep_status IN ('clear','review_required')` — checked both at
`activate/request` (fail-fast) and again inside the locked `activate/apply` transaction
(defensive; screening can change between request and apply). `restrict`/`reject`/`suspend` are
single-step, atomic `UPDATE...WHERE authority_status=<from> RETURNING`, exactly like
`authorised_user.suspend`/`.reactivate`.

**Screening-outcome receipt.** `POST .../authorised-parties/:id/screening-outcome` is
internal-identity-only — no IAM-02 `checkPermission` call at all, mirrors `routes/outcomes.ts`'s
`cdd_outcome` receipt exactly (service-to-service ingestion, not a human-permission-checked
action). Updates `identity_verification_status`/`sanctions_pep_status` (at least one required),
`sec_audit_ref`, `last_screened_at_utc`, `screening_source_module`. No external screening call of
any kind — this receives and stores a status a future KYC-01/AML-01 module (or, this phase, test
fixtures) would report.

**Client/application relationship.** Every route requires `client_profile.status =
'active_limited'` (same Phase 3 precondition), resolves `client_id -> client_profile.
application_id`, and stores/queries `authorised_party` exclusively by `application_id`. A
rejected/held/nonexistent application never has a `client_profile` row, so those cases surface as
`CLT1_CLIENT_NOT_FOUND`.

**Client status extension.** `GET /internal/clt1/clients/{client_id}/status` gains
`authorised_parties_configured` (additive boolean — "≥1 `authorised_party` with
`authority_status='active'` exists", queried via `application_id`). `client_profile.status` itself
is untouched — no route in this codebase writes `'active'`. Phase 2's approval gate is
UNCHANGED — `authorised_party_screening` is not wired into `approve/apply`'s CDD gate this phase
(approved design decision; confirmed by a regression test asserting `client_profile.status`
remains `active_limited` and the existing approval flow is unaffected).

**Audit/outbox.** Every mutation transaction-coupled. Blueprint-named events reused verbatim:
`clt1.authorised_party_added`, `clt1.authorised_party_screened`, `clt1.ubo_identified` (fired
additionally when `party_type='ubo'` on a successful add, alongside the generic `_added` event).
Documented extensions: `_add_requested`/`_add_failed`, `_update_requested`/`_updated`/
`_update_failed`, `_remove_requested`/`_removed`/`_remove_failed`, `_activate_requested`/
`_activated`/`_activate_failed`, `_restricted`, `_rejected`, `_suspended`. Audit failure rolls
back the whole apply (no orphaned `authorised_party`, no orphaned applied decision).

**Deviations from the blueprint, all explicitly flagged during Phase 4 planning, none discovered
mid-implementation:** application-scoped storage (not the blueprint's dual client_id/
application_id columns); `party_type` narrowed by two values; `party_reference` added
(blueprint-silent); `linked_user_id` omitted; `authority_status` enum reconciled across two
disagreeing blueprint documents; no reactivation path; no blueprint-documented update/remove/list
endpoint (the blueprint's own API spec, §6, only documents `add` and screening-outcome-receive —
`update`/`remove`/`activate`/`restrict`/`reject`/`suspend`/list are all documented extensions,
same category as Phase 2/3's own decision-request tables).

**Phase 3 carry-forward wording cleanups closed in this touch (since `errors.ts` was already
being extended for Phase 4's own new codes):** Phase 3 F2 — `CLT1_MANDATE_INVALID_STATE`'s
message now reads "present as a defensive guard; not triggerable via any Phase 3 route" instead of
implying the throw sites don't exist. Phase 3 F1 (503 vs. 409 for the one-active-mandate
violation) and Phase 2 L1/L3 remain deferred — no Phase 4 file touches `routes/mandates.ts` or
`routes/outcomes.ts`.

**Verification performed.** Fresh disposable Postgres, migrations 001→026 (grant files
interleaved as established), all 6 grant files clean including the extended
`clt1_runtime_grants.sql`. `tsc -b --force`: clean. **Full suite: 1010/1010 tests, 63 files, 0
failures** (949 baseline + 61 new: 9 `clt1-authorised-parties.test.ts` + Phase 4 additions to
`clt1-db.test.ts` [153 tests total, up from 111] + Phase 4 additions to
`clt1-iam2-guard-real.test.ts` + small additions to `clt1-app.test.ts`/`clt1-log-redaction.test.ts`).
One test-only mistake caught during this same verification pass (not a code defect): the
authorised-parties list-route test initially asserted "no `client_id` anywhere in the response,"
which contradicted the deliberate, Phase-3-precedented envelope shape (`{client_id,
authorised_parties: [...]}`, mirroring `authorised-users.ts`'s identical list-route shape) —
corrected to assert the envelope's own top-level `client_id` is present while each per-party
object has none. Static sweeps clean: no public `/clt1/*` route string; no Exchange/trading/
wallet/deposit/withdrawal/settlement wording outside the boot guard; no identity-verification/
screening-engine implementation; no duplicate-detection/related-party-graph implementation; no
literal cross-schema `GRANT`; no PII (`party_reference`) in any response body. Direct DB
inspection confirms exactly 21 `clt1.*` permissions (5 Phase 2 + 8 Phase 3 + 8 Phase 4), all
`licence_locked=false`, zero `role_permission` seed; grants on both new tables exactly as locked;
`authorised_party` confirmed to have no `client_id`/`linked_user_id` column; 13 `clt1.*` tables
total.

**Remaining deferred items (explicitly out of Phase 4 scope, not oversights):** actual identity
verification / KYC/KYB screening engine; actual AML/sanctions/PEP/adverse-media screening engine;
duplicate detection engine; verified identity graph; related-party graph (blueprint's own
`clt1.related_party_edge`, §2.14 — a distinct, separately-planned table); beneficial-ownership
graph traversal; external vendor integration; UBO threshold enforcement (the blueprint's own
`ubo_identification_threshold` parameter remains `to_be_defined`; `CLT1_UBO_THRESHOLD_REQUIRED` is
registered present-but-defensive, not reachable); wiring `authorised_party_screening` into Phase
2's CDD approval gate; a sensitive authorised-party detail route; IAM-01 client-user login
integration; `client_profile` active/suspend/close lifecycle; mandate-check endpoint;
wallet/custody, deposits, withdrawals, trading, settlement, Exchange runtime, order book, matching
engine, market making, principal dealing, spread markup; data protection/retention, evidence
export; ongoing monitoring engine.

**Sonnet self-review → ACCEPT with one Medium fixed.** The screening-outcome route's "at least
one screening field required" check previously threw `CLT1_AUTHORISED_PARTY_INVALID_STATE` — a
code `errors.ts` itself documents as meaning "authority_status transition not allowed," not a
malformed-body condition. Fixed to throw the shared foundation `AppError("VALIDATION_ERROR")`
instead (same discipline `lib/mandates.ts`'s `validateMandateRules` already established for an
identical class of problem). No test had exercised the old branch, so nothing depended on it.
`tsc`/full suite re-verified after the fix (1010/1010).

**Independent Opus review → ACCEPT WITH MINOR CONDITIONS.** Reproduced 1010/1010 on a fresh
disposable Postgres. Zero Critical/High. One Medium (missed by the self-review) and two Low
findings:
- **M1 (Medium, fixed)** — `update/apply`'s `ownership_percentage`/`sec_audit_ref` UPDATE was an
  unconditional overwrite from the stored decision row: omitting one field in `update/request`
  silently NULLed it on the live party, inconsistent with the adjacent screening-outcome route's
  own `COALESCE`-preserve handling of `sec_audit_ref`. **Fixed** — both columns now use
  `COALESCE($n, <column>)` against the live row, mirroring the screening-outcome route exactly.
  Two new integration tests prove a partial update (only `ownership_percentage`, or only
  `sec_audit_ref`) preserves the other field.
- **L1 (Low, fixed — required a correction mid-fix)** — a schema-valid sub-hundredths
  `ownership_percentage` (e.g. `0.0000001`) renders via JS's own `String(...)` as exponential
  notation (`"1e-7"`), which Postgres's `numeric` column does not preserve on round-trip, silently
  diverging the request-time and apply-time payload hashes. The first fix attempt added TypeBox's
  `multipleOf: 0.01` to the body schema — this was **empirically wrong** and caught by the
  patch's own re-run of the full suite (not merely assumed correct): TypeBox/AJV's `multipleOf`
  is implemented via a raw `value % multipleOf === 0`-shaped check, which is unreliable for
  decimal step values because `0.01` has no exact IEEE-754 binary representation — it rejected
  ordinary values including whole integers (`45 % 0.01 === 0.009999999999999063` in JS), which
  would have made every non-trivial `ownership_percentage` request fail with a confusing 400.
  **Corrected fix:** a new pure function, `validateOwnershipPercentagePrecision`
  (`lib/authorised-parties.ts`), round-trips through a fixed 2-decimal-place rounding
  (`Math.round(value * 100) / 100 !== value`) and throws the shared `VALIDATION_ERROR` on
  mismatch — stable for every real value in `[0,100]`, no silent rounding. Called from both
  `add/request` and `update/request` (not `apply`, which never re-derives from a fresh body).
  Three new unit tests plus two new integration tests (a rejection case and a positive 2-decimal
  round-trip case) cover this.
- **L2 (Low, fixed)** — `registerSingleStepTransition`'s `fromStatus`/`toStatus` were interpolated
  directly into the UPDATE statement's SQL string. Not exploitable (both are TypeScript
  literal-union-typed, supplied only by the three hardcoded call sites, never request-derived),
  but inconsistent with the fully-parameterized convention used everywhere else in this file.
  **Fixed** — both are now bound parameters (`$3`/`$4`). A full sweep of the route file for any
  other `${...}`-in-SQL confirmed none remain (the only two remaining template-literal
  interpolations are a route-path string and an audit `action` string — neither is SQL).

**Verification after all three fixes.** `tsc -b --force`: clean. Fresh disposable Postgres,
migrations 001→026 + all 6 grant files clean. **Full suite: 1017/1017 tests, 63 files, 0
failures** (1010 baseline + 7 new: 3 unit tests for `validateOwnershipPercentagePrecision`, 2
integration tests for the M1 partial-update regression, 2 integration tests for the L1
precision-rejection/round-trip regression). Direct DB inspection re-confirmed the 21-permission
catalogue and both tables' grants are byte-for-byte unchanged by these fixes (the patch touched
only application-layer validation/write logic, no migration, no grant, no permission).

**CLT-01 Phase 4 is an accepted implementation baseline, M1/L1/L2 closed.** No code was written or
changed during the Opus review itself; all three fixes were applied in this follow-up patch pass,
independently re-verified end-to-end (not assumed correct from the patch description).

## 11. Phase 5 — ACCEPTED implementation baseline after independent Opus review — related-party edge baseline

Gives CLT-01 a manually-declared, polymorphic relationship record (`clt1.related_party_edge`)
linking `client`/`application`/`party` entities — declaration and linkage only, no automated
computation of any kind (no duplicate detection, no fuzzy/name/registration-number matching, no
graph traversal, no UBO-threshold enforcement, no risk scoring). `client_profile.status` remains
`active_limited` throughout; Phase 2's approval gate is untouched.

**Schema (`027_clt1_related_party_edges.cjs`).** `clt1.related_party_edge` is the blueprint's own
§2.14 polymorphic shape, adopted verbatim: `from_entity_type`/`from_entity_id` +
`to_entity_type`/`to_entity_id` (entity type enum `client`/`application`/`party` — `party` =
`clt1.authorised_party`; `authorised_user`/`client_mandate` are deliberately NOT node types, per
the blueprint's own enum). This is the first CLT-01 table with NO single owning scope (no
`owning_application_id`/`owning_client_id` column) — every table Phase 1-4 built is owned by
exactly one `application_id`/`client_id`, but an edge inherently spans two potentially-different
entities. No real Postgres FK is possible on the polymorphic columns (Postgres has no
conditional/type-dependent foreign key), so node existence is validated entirely at the
application layer. `relationship_type` is the blueprint's own exact 6-value enum (`ubo`/`director`/
`signatory`/`shared_identity`/`shared_address`/`associated_account`), adopted verbatim even though
it mixes role-echoing labels (overlapping with `authorised_party.party_type`) and matching-signal
labels (that read like duplicate-detection output) — the label does not imply provenance, every
edge is human-declared via a maker-checker route regardless of which value is chosen.

`status` is the blueprint's own exact 2-value enum (`active`/`inactive`) — no state-machine
diagram exists for this table, and the blueprint's own DB design is genuinely this simple; no
invented intermediate states. `add/apply` inserts directly at `status='active'`; `remove/apply`
sets `status='inactive'` (reuses the blueprint's own second value, not an invented `removed`
state) — no reactivation path exists. `update/apply` touches only `evidence_ref` — node
references and `relationship_type` are immutable after creation. The partial unique index
(`idx_clt1_related_party_edge_one_active_per_tuple`) enforces EXACT-TUPLE uniqueness only (no
direction-canonicalization for the naturally-symmetric relationship types) — a documented,
accepted limitation, not an oversight. A self-reference `CHECK` constraint is a backstop; the
primary guard is the pure `validateNotSelfReference` function, checked before a decision request
is ever created. `clt1.related_party_edge_decision_request` mirrors the established decision-
request shape but likewise has no owning-scope column — `target_related_party_edge_id` (nullable,
for update/remove) plus the edge-defining fields for `add`.

**IAM-02 permissions (`028_iam2_register_clt1_phase5_permissions.cjs`).** Exactly 4:
`related_party.add`/`.update`/`.remove` (`requires_approval=true`, execute-verify-bound) —
the blueprint (`07_Permission_Rules.md` §2/§3) names only ONE related-party permission
(`clt1.related_party.read`) and no "Maker-Checker Required" item covers this table at all, so the
mutation permission set is entirely a documented, reasoned extension (an even bigger inferential
leap than Phase 4's own extension, since there is no partial-match blueprint item to anchor
against) — a wrong relationship claim has real compliance-interpretation consequences, the same
reasoning already applied to `authorised_party.add`/`.update`/`.remove`. `related_party.read`
(`requires_approval=false`) is the blueprint's own literal permission. All `licence_locked=false`
from day one (the CFG-01 F-1 lesson, applied a fifth time). Zero `role_permission` seed (25
`clt1.*` permissions total).

**Related-party-edge flows.** `add`/`update`/`remove` mirror the Phase 2/3/4 `request`+`apply`
pattern exactly. `add/request`'s `entityId` for `checkPermission`/`execute-verify` has no natural
single target (no edge exists yet, no owning scope to fall back on) — a synthetic composite
`${from_entity_type}:${from_entity_id}` is used instead, an explicit design choice with no direct
precedent in this codebase. Node existence is validated at `add/request` (both `from` and `to`)
and defensively re-validated at `add/apply` (a referenced node could have been removed between
request and apply) — `client`→`client_profile`, `application`→`client_application`,
`party`→`authorised_party`. **Duplicate-active-edge handling applies the lesson from Phase 4's own
carried-forward F1 finding directly, rather than repeating it in new code**: `add/apply`'s insert
may raise a 23505 unique-violation on the partial index; `withTransaction`
(`packages/foundation/src/db.ts`) rolls back and rethrows the RAW, unwrapped pg error (confirmed
by direct source inspection before writing this code, not assumed), so the outer catch inspects
`err.code`/`err.constraint` and maps this SPECIFIC violation to a real 409
`CLT1_RELATED_PARTY_EDGE_DUPLICATE` — never collapsed into the generic `CLT1_AUDIT_REQUIRED` (503).
A different `relationship_type` between the same two nodes is correctly NOT blocked (exact-tuple
uniqueness only, proven by a dedicated test).

**Structural routing deviation, explicit and deliberate.** `add`/`update`/`remove` routes are
TOP-LEVEL (`/internal/clt1/related-party-edges/...`), not nested under `/clients/:client_id/...`
the way every Phase 3/4 mutation route is — necessary because an edge has no single owning client.
The one client-scoped route is the blueprint's own literal `GET
/internal/clt1/clients/:client_id/related-parties` (`routes/clients.ts`), which resolves the
client's own known node identities (`client_id`, `application_id`, and every `authorised_party_id`
on that application) and returns `active` edges touching ANY of them in either direction — a
bounded, single-hop OR-filter, explicitly NOT graph traversal (no recursion, no multi-hop, no
BFS/DFS). `related_parties_configured` is deliberately NOT added to the client status route
(approved Phase 5 design decision) — computing it correctly would fold in the same multi-node-
identity lookup the read route already performs, graph-adjacent complexity kept out of the simple
status-boolean shape Phase 3/4 established.

**Audit/outbox.** `clt1.related_party_edge_created` is the blueprint's own exact literal audit
event name (`08_Audit_Log_Events.md`), reused verbatim on `add/apply` success — not a locally-
invented `_added`. Documented extensions (no blueprint precedent, since the blueprint documents no
update/remove route at all): `_add_requested`/`_add_failed`, `_update_requested`/`_updated`/
`_update_failed`, `_remove_requested`/`_removed`/`_remove_failed`. Every mutation transaction-
coupled; audit failure rolls back the whole apply (no orphaned edge, no orphaned applied decision).

**Verification performed.** Fresh disposable Postgres, migrations 001→028 (grant files
interleaved as established), all 6 grant files clean including the extended
`clt1_runtime_grants.sql`. `tsc -b --force`: clean. **Full suite: 1065/1065 tests, 64 files, 0
failures** (1017 baseline + 48 new: 9 `clt1-related-party-edges.test.ts` + Phase 5 additions to
`clt1-db.test.ts` [193 tests total, up from 153] + Phase 5 additions to
`clt1-iam2-guard-real.test.ts`). One test-helper bug caught during this same verification pass
(not a code defect): `addRelatedPartyEdge()`'s default `from`/`to` overrides were placeholder
strings that don't correspond to real `client_profile` rows — correctly rejected by node-existence
validation, exposing the test bug rather than a route bug; fixed by having the helper create real
active clients by default. Static sweeps clean: no public `/clt1/*` route string; no
Exchange/trading/wallet/deposit/withdrawal/settlement wording outside the boot guard; no
duplicate-detection/fuzzy-matching/graph-traversal/risk-scoring implementation; no
`related_parties_configured` field anywhere; no `authorised_party.party_reference` joined into any
Phase 5 response; no literal cross-schema `GRANT`. Direct DB inspection confirms exactly 25
`clt1.*` permissions (5 Phase 2 + 8 Phase 3 + 8 Phase 4 + 4 Phase 5), all `licence_locked=false`,
zero `role_permission` seed; grants on both new tables exactly as locked; `related_party_edge`
confirmed to have no `owning_application_id`/`owning_client_id`/`client_id`/`application_id`
column; the partial unique index and self-reference CHECK confirmed present; 15 `clt1.*` tables
total.

**Remaining deferred items (explicitly out of Phase 5 scope, not oversights):** duplicate
detection engine, duplicate scoring, fuzzy/automated name or registration-number matching,
automated shared-address detection; beneficial-ownership graph traversal; UBO-threshold
enforcement (the blueprint's own `ubo_identification_threshold` parameter remains
`to_be_defined`); automatic UBO aggregation; risk scoring / related-party risk engine; external
vendor integration; direction-canonicalization for symmetric relationship types (a declared
symmetric relationship could theoretically be entered twice in reverse order without the DB
catching it); `related_parties_configured` client-status boolean; wiring related-party findings
into Phase 2's CDD approval gate; identity verification / actual KYC/AML/sanctions/PEP screening
engines; a sensitive authorised-party detail route; IAM-01 client-user login integration;
`client_profile` active/suspend/close lifecycle; mandate-check endpoint; data protection/
retention automation; wallet/custody, deposits, withdrawals, trading, settlement, Exchange
runtime, order book, matching engine, market making, principal dealing, spread markup. Carried
forward unchanged: Phase 4 M1/L1/L2 (closed), Phase 3 F1 (503→409 mandate mapping, still open),
Phase 2 L1/L3 (still deferred).

**Sonnet self-review → ACCEPT, no Critical/High/Medium/Low findings** (1065/1065 reproduced;
direct DB inspection of schema/grants/IAM-02 catalogue/`role_permission` seed and static greps for
out-of-scope surface all clean).

**Independent Opus review outcome:**
- Verdict: **ACCEPT**
- 1065/1065 full suite passing
- zero Critical/High/Medium/Low findings
- no code changed during review
- Phase 6 not started

**CLT-01 Phase 5 is an accepted implementation baseline.**

## 12. Phase 6 — ACCEPTED implementation baseline after independent Opus review and targeted L1 condition closure — duplicate-candidate review baseline

Migration `029_clt1_duplicate_candidates.cjs`: `clt1.duplicate_candidate` — reconciles the
blueprint's own `05_Database_Design.md` §2.8 table (which the blueprint already defines with real
columns, a real `06_State_Machine.md` §4 state diagram, one permission `clt1.duplicate.review`, and
one error code `CLT1_DUPLICATE_REVIEW_REQUIRED` — a materially different starting point from
Phase 5, which had almost no blueprint schema to anchor to). The blueprint's own literal shape has
exactly two node-reference columns (`application_id` subject, `matched_client_id` matched) because
its own use case is "a new application might duplicate an existing client." Phase 6 generalizes
both sides into a polymorphic `subject_type/subject_ref` + `matched_type/matched_ref` pair, reusing
the exact `from_entity_type/to_entity_type` idiom `related_party_edge` (Phase 5) established, rather
than inventing a new shape — needed to satisfy the approved scope's explicit `party`-scoped
requirement (a blueprint-silent extension; the blueprint's own duplicate concept never mentions
`authorised_party`). `authorised_user`/`client_mandate` are deliberately NOT node types.

`match_type` and `status` both adopt the blueprint's own exact enums **verbatim**, not the planning
report's own draft suggestions — `06_State_Machine.md` §4 draws a real diagram for this exact table,
so blueprint fidelity was chosen deliberately over an invented cleaner taxonomy (same "adopt
blueprint enum even if imperfect" discipline Phase 5 applied to `relationship_type`). `status`
carries all 4 blueprint values (`open`/`duplicate`/`not_duplicate`/`needs_more_info`) for schema
fidelity, but `needs_more_info` has **zero reachable transition, permission, or route** this phase
(approved design decision, LOCKED DESIGN DECISIONS 14-16) — present-but-defensive, the same posture
`client_mandate.status`'s forward-compat values (Phase 3) and `CLT1_UBO_THRESHOLD_REQUIRED`
(Phase 4) already established. `match_score` (blueprint column, `numeric`) is kept for schema
fidelity but is **never written** by any Phase 6 code path — no scoring engine exists.
`source_type`/`source_ref` are blueprint-silent additions supporting "future detector reference, no
detector": `source_type` CHECK'd to `manual`/`future_detector`, but only `'manual'` is ever written
this phase; `source_ref` stays NULL always.

Unlike `related_party_edge`'s always-on exact-tuple uniqueness, this table's partial unique index
(`idx_clt1_duplicate_candidate_one_open_per_tuple`) is scoped to `WHERE status = 'open'` only
(LOCKED DESIGN DECISIONS 19-23): pair **direction matters** — subject ("the one under review") and
matched ("the one it might duplicate") are not interchangeable roles, so there is deliberately no
canonicalization — and a resolved candidate (`duplicate`/`not_duplicate`) may be legitimately
re-declared later (e.g. new evidence surfaces) without the index blocking it; only simultaneously-
open redundant declarations of the exact same tuple are rejected. `create/apply`'s own
23505-violation-on-this-index handling maps to a real 409 `CLT1_DUPLICATE_CANDIDATE_ALREADY_OPEN`
(not the generic 503 `CLT1_AUDIT_REQUIRED`) — applying the Phase 4 F1 lesson and Phase 5's
`CLT1_RELATED_PARTY_EDGE_DUPLICATE` mapping a third time. Residual, documented gap (mirrors Phase
5's own non-canonicalization carry-forward): a `party`-vs-`party` (or `client`-vs-`client`) pair
declared as `(A,B)` and separately as `(B,A)` is NOT caught as the same open candidate.

Migration `030_iam2_register_clt1_phase6_permissions.cjs`: exactly 5 permissions —
`duplicate_candidate.create`/`.update`/`.confirm`/`.dismiss` (`requires_approval=true`,
execute-verify-bound maker-checker — a documented, reasoned generalization of the blueprint's own
single `clt1.duplicate.review` code, the blueprint's own Maker-Checker Required item 8 "Duplicate
resolution override" being the closest anchor); `duplicate_candidate.read` (single-step); all
`licence_locked=false` from day one, zero `role_permission` seed (30 `clt1.*` permissions total).
The blueprint's own literal `clt1.duplicate.review` code is deliberately **not** dual-registered —
superseded by the granular set. `update` mutates `evidence_ref` only (mirrors Phase 5's own `update`
route exactly). `confirm`/`dismiss` apply routes set `status`/`reviewed_by`/`reviewed_at_utc` (the
blueprint's own columns) alongside `approval_id`/`version`/`updated_at_utc`.

**Blueprint SoD rule 4** (`07_Permission_Rules.md` §3: "Duplicate reviewer cannot approve own
duplicate override if they created the application") is **implemented, not deferred** — a local,
CLT-01-owned check (`checkDuplicateSelfReviewBlocked`, `lib/duplicate-candidates.ts`) at
`confirm/request` and `dismiss/request` only (request-time-only, mirrors every prior self-block
check in this codebase — Phase 2's `CLT1_SELF_APPROVAL_BLOCKED`, Phase 4's `requireNotSelfAction` —
neither of which is re-checked at apply either). Resolves whichever side of the pair is
`application`-typed and compares its `client_application.created_by` against the resolver's
`requested_by`; new code `CLT1_DUPLICATE_SELF_REVIEW_BLOCKED`. Deliberately a **no-op** (never
throws) when neither side of the pair is `application`-typed (e.g. a `party`-vs-`party` candidate)
— the blueprint's own rule has no equivalent "creator" concept for a bare client/party pair, so
there is nothing to compare against, and the function correctly does nothing rather than guessing.

Mutation routes (`create`/`update`/`confirm`/`dismiss`) are TOP-LEVEL
(`/internal/clt1/duplicate-candidates/...`), the same structural posture Phase 5 established for
`related_party_edge` (no single owning scope exists to nest under). **Deliberate variation from
Phase 5's own placement choice** (LOCKED DESIGN DECISION 28): BOTH read routes
(`GET .../applications/:application_id/duplicate-candidates` and
`GET .../clients/:client_id/duplicate-candidates`) live in this same new
`routes/duplicate-candidates.ts` file, rather than being split into the existing
`routes/applications.ts`/`routes/clients.ts` the way Phase 5 put its one read route into
`routes/clients.ts` — `duplicate_candidate` has no owning scope to justify living alongside either
existing file, so keeping both reads together with the mutation routes was simpler and is
documented as an intentional, not accidental, difference from precedent. The client-scoped read
mirrors Phase 5's own bounded single-hop shape exactly (client_id node, application_id node, and
every `authorised_party_id` under that application — no recursion, no traversal).

Node existence validation (`application`→`client_application`, `client`→`client_profile`,
`party`→`authorised_party`) happens entirely at the application layer, re-validated defensively at
`create/apply` — no real Postgres FK is possible on the polymorphic columns, same posture Phase 5
established. Self-candidate (identical `subject`/`matched` type+ref) is rejected with the shared
`VALIDATION_ERROR`, not a new CLT-01 code, backstopped by a DB CHECK constraint.

`CLT1_DUPLICATE_REVIEW_REQUIRED` (the blueprint's own literal error code) is **deliberately not
registered this phase** — zero Phase 6 code path can throw it, since Phase 6 does not touch the
Phase 2 approval gate at all (LOCKED DESIGN DECISION 18, approved scope item). Registering an error
code with no throw site would repeat the exact wording mistake Phase 3 F2 flagged for
`CLT1_MANDATE_INVALID_STATE` ("not reachable" language for a code whose throw sites genuinely exist
just untriggerable — here there is no throw site at all, so the code stays out of the catalogue
entirely rather than being added with a caveat).

Safe response (`safeDuplicateCandidateResponse`) excludes `reviewed_by`/`requested_by`/
`approval_id`/`sec_audit_ref` — actor attribution stays internal, mirroring `related_party_edge`'s
safe response discipline. No PII column exists on `duplicate_candidate` at all (every reference is
an internal ID or enum); no new log-redaction path was needed (`evidence_ref` already covered by
the existing Phase 1 redaction entry, which matches on the bare field name regardless of route).

Grants: `role_clt1_runtime` gets `SELECT, INSERT` on both new tables; `UPDATE` on
`duplicate_candidate` limited to `status, evidence_ref, reviewed_by, reviewed_at_utc, approval_id,
version, updated_at_utc` (node references, `match_type`, `source_type`/`source_ref`, `match_score`,
`requested_by`, and `sec_audit_ref` are never updated by any Phase 6 code path and are deliberately
excluded); `UPDATE` on the decision-request table limited to `status, approval_id,
decision_token_hash, applied_at_utc` (mirrors every prior decision-request grant exactly). No
DELETE/TRUNCATE; no new cross-schema grant.

**Verification performed:** `npx tsc -b --force` clean; fresh disposable Postgres, migrations
001→030 (batched: 001-006 → `iam2_runtime_grants.sql` → 007-030) + all 6 grant files clean; full
suite **1065 baseline + new Phase 6 tests, all passing** on a single clean run; static sweeps for
public-route surface, Exchange/trading/wallet/deposit/withdrawal/settlement,
duplicate-detection/scoring/fuzzy-matching engine code, graph-traversal/UBO-threshold enforcement,
screening engine, `CLT1_DUPLICATE_REVIEW_REQUIRED`, `needs_more_info` route, and direct
iam2/cfg1/sec1 grants all clean; direct DB-level inspection of the IAM-02 permission catalogue (30
`clt1.*` permissions, all `licence_locked=false`, zero `role_permission` seed) and runtime grants
(exact column lists as documented above) via `information_schema`.

**Remaining deferred items (explicitly out of Phase 6 scope, not oversights):** duplicate detection
engine, duplicate scoring engine, fuzzy/automated name/email/address/registration-number/
authorised-party matching, automatic candidate generation; client/application/profile merge, data
consolidation, final duplicate-resolution enforcement; related-party graph traversal; UBO-threshold
enforcement; beneficial ownership aggregation; risk scoring engine; external vendor integration; a
sensitive duplicate-candidate detail route beyond the two bounded list reads; wiring
duplicate-candidate findings into Phase 2's CDD approval gate (`CLT1_DUPLICATE_REVIEW_REQUIRED`
stays unregistered until that phase); the `needs_more_info` transition/permission/route; direction-
canonicalization for symmetric node-type pairs (party-vs-party, client-vs-client); identity
verification / actual KYC/AML/sanctions/PEP screening engines; IAM-01 client-user login
integration; `client_profile` active/suspend/close lifecycle; mandate-check endpoint; data
protection/retention automation; wallet/custody, deposits, withdrawals, trading, settlement,
Exchange runtime, order book, matching engine, market making, principal dealing, spread markup.
Carried forward unchanged: Phase 5 (no findings), Phase 4 M1/L1/L2 (closed), Phase 3 F1 (503→409
mandate mapping, still open), Phase 2 L1/L3 (still deferred).

**Sonnet self-review → ACCEPT, no Critical/High/Medium/Low findings** (1125/1125 reproduced; direct
DB inspection of schema/grants/IAM-02 catalogue/`role_permission` seed and static greps for
out-of-scope surface all clean).

**Independent Opus review → ACCEPT WITH MINOR CONDITIONS.** Zero Critical/High/Medium findings. One
Low finding:
- **L1 (Low)** — `resolveApplicationCreatedBy` (blueprint SoD rule 4 support) short-circuited on the
  subject side (`subjectType==='application' ? subjectRef : matchedType==='application' ?
  matchedRef : null`), so for an **application-vs-application** candidate — a pair shape Phase 6's
  own polymorphic generalization permits but the blueprint's original two-column model never
  contemplated — only the subject application's `created_by` was checked; a reviewer who created
  the *matched* application could confirm/dismiss without being blocked.

**L1 fixed in a follow-up patch.** `resolveApplicationCreatedBy` renamed to
`resolveApplicationCreatedByValues` and now resolves **every** application-typed side of the pair
(subject, matched, or both) via a single `WHERE application_id = ANY($1)` query, returning a
`string[]`. `checkDuplicateSelfReviewBlocked` (`lib/duplicate-candidates.ts`) now takes
`applicationCreatedByValues: readonly string[]` and blocks if `requestedBy` matches **any** of them
(`.includes(requestedBy)`), rather than a single nullable value — client-vs-client and
party-vs-party remain a correct no-op (empty array). Four new integration tests prove: (1)
app-vs-app confirm blocked when the requester created the subject application; (2) app-vs-app
confirm blocked when the requester created the *matched* application (the exact gap L1 named); (3)
app-vs-app confirm succeeds when the requester created neither; (4) app-vs-app dismiss blocked when
the requester created the matched application. A genuine party-vs-party no-op test was also added
(the pre-existing test's title claimed "(or party-vs-party)" coverage it did not actually exercise
— now split into two accurately-titled tests, one per node-type pair). Five new unit tests cover
the `checkDuplicateSelfReviewBlocked` array-membership semantics directly. The informational
audit-test naming nit was also closed: the create-audit test's title now states exactly what it
asserts (only `_created`, since `_create_requested`'s `entity_id` is the decision_id, not the
candidate_id, and so isn't reachable via a `payload_ref LIKE %candidate_id%` filter) rather than
implying both events were checked.

**Independent targeted Opus re-review outcome:**
- Initial Opus verdict: **ACCEPT WITH MINOR CONDITIONS**
- L1: application-vs-application SoD completeness gap
- L1 fixed by checking both application-typed sides
- Targeted Opus verdict: **CONDITIONS CLOSED — ACCEPT CLT-01 Phase 6**
- 1132/1132 full suite passing
- zero Critical/High/Medium/Low findings remaining
- no code changed during targeted Opus re-review
- Phase 7 not started

**CLT-01 Phase 6 is an accepted implementation baseline.**

## 13. Phase 7 — ACCEPTED implementation baseline after independent Opus review — final approval compliance gate wiring

Wires the already-accepted `clt1.duplicate_candidate` table (Phase 6) into the Phase 2 final
approval guard as a third precondition, exactly mirroring the two gates the guard already has
(`evaluateCddGateForApproval`/`requireHandoffsForApproval`, `lib/outcomes.ts`) — Phase 7 is a third
instance of an already-proven shape, not new architecture. No schema, no migration, no IAM-02
permission, no grant, and no route changed or added — this phase is pure gate-logic wiring inside
the existing `clt1.application.approve` action.

**Duplicate-candidate gate** (`evaluateDuplicateCandidateGateForApproval`, `lib/duplicate-candidates.ts`
— extends the Phase 6 module, not a new "approval-gate" helper, same discipline every prior gate's
logic living in its own resource's domain file): blocks if any touching candidate has status
`open`, `duplicate`, or `needs_more_info`; allows if every touching candidate is `not_duplicate`,
or if the touching-candidate list is empty. `duplicate` blocks deliberately — it means a reviewer
already CONFIRMED an adverse duplicate finding, not a resolved-safe one; approving anyway would
defeat the entire point of that review. `needs_more_info` blocks defensively even though no Phase 6
code path can currently produce it (the DB CHECK constraint still permits it) — a later phase
adding that transition must not silently bypass this gate by omission.

**Node scope**: `application:application_id` and `party:<every authorised_party_id under this
application>`, both sides of the pair checked (bidirectional — mirrors Phase 6's own client-scoped
read query shape exactly). **No `client` node check** — structurally impossible to need one:
`client_profile` does not exist until this exact apply transaction creates it, so no pre-existing
`duplicate_candidate` can reference this application's future `client_id`. The fetch helper
(`fetchTouchingDuplicateCandidatesForApproval`, `routes/decisions.ts`) selects
`duplicate_candidate_id`/`status` only — no `evidence_ref`, no `party_reference`, no PII — and
takes a plain `Sql` (pool or transaction client) so the identical query serves both the pre-check
and the in-transaction re-check call sites.

**Deliberately NOT checked** (approved Phase 7 design decisions): `related_party_edge` — a
declarative relationship record, not a finding outcome, not a direct approval block this phase;
`authorised_party` screening status — stays local to Phase 4's own party-activation gate, not
wired into final client approval. Both are documented gaps, not oversights — see deferred items
below.

**Wired at three checkpoints**, mirroring the CDD/handoff gates' own exact positions:
1. `approve/request` — cheap, local, fail-fast, right after the existing self-approval check,
   before any IAM-02 network call.
2. `approve/apply` pre-check — before `checkPermission`/`verifyDecisionToken`, alongside the
   existing handoff/CDD pre-checks, avoiding wasting a single-use IAM-02 decision token on a
   request that would fail anyway.
3. `approve/apply` in-transaction re-check — inside the `FOR UPDATE`-locked transaction,
   immediately before the `client_profile` INSERT, sharing the existing `gate_failed` outcome
   branch the CDD/handoff re-checks already use (so a candidate becoming blocking strictly
   between the pre-check and this exact point — a genuine concurrent-write race — still fails the
   apply, not silently passes on stale state).

**Not included in `payload_hash`** — re-checked fresh at both checkpoints, same "dynamic, not
hash-bound" posture the CDD/handoff gates already use. This was verified, not just asserted: a
dedicated test side-effects the CFG-01 fetch stub (the only available hook to simulate a genuine
race from a synchronous test — `app.inject` offers no mid-request interception point) to insert a
blocking candidate strictly between the pre-check and the locked re-check, proving the
in-transaction path — not just the pre-check — genuinely blocks and is genuinely audited.

**New error code**: `CLT1_DUPLICATE_REVIEW_REQUIRED` (409) — the blueprint's own literal code
(`09_Error_Handling.md`), deliberately left unregistered in Phase 6 for lack of a throw site; Phase
7 supplies that throw site. Same "precondition not yet satisfied, retry once resolved" family as
`CLT1_CDD_OUTCOME_REQUIRED`/`CLT1_KYC_HANDOFF_REQUIRED`/`CLT1_AML_HANDOFF_REQUIRED` — dismissing
the blocking candidate via Phase 6's own route and retrying the SAME approval request is the
expected remedy. **Deliberately NOT added**: `CLT1_RELATED_PARTY_REVIEW_REQUIRED`,
`CLT1_AUTHORISED_PARTY_REVIEW_REQUIRED` — neither has a reachable code path this phase (same
"no code without a throw site" discipline this codebase has followed since Phase 1).

**Phase 2 L1 CLOSED**: the approval-failure audit wrapper event was renamed from the CDD-specific
`clt1.cdd_gate_denied` to the generic `clt1.application_approval_denied` — Phase 7 adds a THIRD
distinct failure family (duplicate-review) through this exact same function, making the old name
actively misleading rather than just imprecise. `reason_code` (embedded in `outbox_event.payload_ref`,
not a dedicated column — confirmed by reading `packages/foundation/src/audit.ts` directly rather
than assuming) continues to carry the specific `Clt1Error.code` for every family (CFG gate denial,
CDD outcome failure, KYC/AML handoff missing, duplicate review required) — this rename is a
name-only fix, not a new observability mechanism. No other call site referenced the old name
(confirmed by a repo-wide grep before renaming); no test previously asserted on it either.

**Verification performed:** `npx tsc -b --force` clean; fresh disposable Postgres, migrations
001→030 (unchanged — no new migration this phase) + all 6 grant files clean; full suite **1132
baseline + new Phase 7 tests, all passing** on a single clean run; direct DB-level confirmation that
the CLT-01 permission catalogue remains exactly 30 rows with zero `role_permission` seed (no
Phase 7 registration); a repo-wide grep confirms zero remaining `clt1.cdd_gate_denied` references
anywhere (code, tests, docs) after the rename; static sweeps for public-route surface,
duplicate-detection/scoring/fuzzy-matching/merge-consolidation, graph-traversal/UBO-threshold,
screening engine, related-party-edge direct blocking, and authorised-party screening direct
blocking on approval all clean.

**Remaining deferred items (explicitly out of Phase 7 scope, not oversights):** authorised-party
screening status does not block final client approval (a client can reach `active_limited` while an
associated `authorised_party` is still `pending`/failed-screening or does not exist at all — Phase
4's own activation gate is the only screening enforcement point); `related_party_edge` does not
directly block approval (it becomes approval-relevant only via a `duplicate_candidate` that cites
it in `evidence_ref`, a linkage this codebase does not build); no approval override for a blocked
duplicate candidate (the only remedy is resolving the candidate via Phase 6's own `dismiss` route,
then retrying the SAME approval request); direction-canonicalization for symmetric duplicate-
candidate/related-party pairs; duplicate-detection/scoring/fuzzy-matching engines; merge/
consolidation; graph traversal; UBO-threshold enforcement; identity verification / actual KYC/AML/
sanctions/PEP screening engines; IAM-01 client-user login integration; `client_profile`
active/suspend/close lifecycle; mandate-check endpoint; data protection/retention automation;
wallet/custody, deposits, withdrawals, trading, settlement, Exchange runtime, order book, matching
engine, market making, principal dealing, spread markup. Carried forward unchanged: Phase 6 (no
findings), Phase 3 F1 (mandate 503→409 mapping, still open), Phase 2 L3 (unused `ctx` parameter in
`createHandoff`, still deferred — not touched this phase, since it is unrelated to the approval
gate or the audit-event rename).

**Sonnet self-review → ACCEPT, no Critical/High/Medium/Low findings** (1152/1152 reproduced;
direct DB inspection of schema/grants/IAM-02 catalogue/`role_permission` seed and static greps for
out-of-scope surface all clean).

**Independent Opus review outcome:**
- Verdict: **ACCEPT CLT-01 Phase 7**
- 1152/1152 full suite passing
- zero Critical/High/Medium/Low findings
- no code changed during Opus review
- Phase 2 L1 closed
- Phase 8 not started
- informational observation: the party-node branch of the duplicate gate is defensively present
  but organically unreachable under the current workflow (`authorised_party` requires an
  already-`active_limited` client to exist first) — correct, approved, forward-compatible scope,
  not a defect

**CLT-01 Phase 7 is an accepted implementation baseline.**

## 14. Phase 8 — ACCEPTED implementation baseline after independent Opus review — client_profile lifecycle baseline

Adds controlled lifecycle management for existing `clt1.client_profile` rows — suspend, reactivate,
close — the fourth distinct maker-checker + IAM-02 execute-verify workflow shape this codebase has
built (after Phase 2's approve, Phase 3/4's add/create/update, Phase 6's create/confirm/dismiss),
applied to the one CLT-01 table with no prior mutation route at all: `client_profile` itself.

**Reachable statuses / transitions.** `client_profile.status`'s own CHECK constraint (migration
020) has permitted `suspended`/`closed` — and also `active`/`restricted`/`pending` — since Phase 1,
for forward-compat; Phase 8 makes `suspended`/`closed` REACHABLE for the first time, and
deliberately never targets `active`/`restricted`/`pending` (approved design decisions 1-2).
Allowed transitions: `active_limited -> suspended` (suspend), `suspended -> active_limited`
(reactivate), `active_limited -> closed` (close), `suspended -> closed` (close). `closed` is
terminal — no function anywhere in `lib/client-profiles.ts` ever accepts `closed` as a FROM status
(design decisions 3-4). Reactivate restores exactly `active_limited`, never `active` (design
decision 5).

**Maker-checker model.** All three actions are request/apply + mandatory IAM-02 execute-verify —
no single-step lifecycle mutation exists (design decisions 6-7). Migration
`032_iam2_register_clt1_phase8_permissions.cjs` registers exactly 3 permissions
(`clt1.client_profile.suspend`/`.reactivate`/`.close`), all `licence_locked=false` from day one
(the CFG-01 Phase 3A F-1 lesson, applied an eighth time), `requires_approval=true`, zero
`role_permission` seed (design decisions 8-9). **`clt1.client_profile.read` is deliberately NOT
registered** (design decision 10) — the existing `GET /internal/clt1/clients/:client_id/status`
route (`routes/clients.ts`) stays internal-identity-only, the same blueprint §3.5 posture it has
had since Phase 2; unlike every prior phase's provisioned-actor guard test, Phase 8 has no
single-step sibling permission to prove a role-grant reaching `allow` — the real-guard test proves
instead that a granted role still reaches `approval_required` (never `allow`), confirming
IAM-02's guard precedence (`requires_approval=true` is unconditional, checked before role grants)
applies identically here.

**Schema (`031_clt1_client_profile_lifecycle.cjs`).** One new table only:
`clt1.client_profile_lifecycle_decision_request` (`decision_type IN
('suspend','reactivate','close')`), mirroring `application_decision_request`'s exact request/apply
shape. **No `client_profile.status` CHECK alteration and no new `client_profile` column** (design
decisions 14) — `reason`/`evidence_ref` live only on the decision-request row, never on the
profile itself (design decisions 12-13: `reason` required for suspend/close, optional for
reactivate; `evidence_ref` always optional). `client_id` carries a REAL FK to `clt1.client_profile
(client_id)` — the first CLT-01 decision-request table able to do so, since
`client_profile.client_id` has carried a UNIQUE index since migration 020 (Phase 5/6's polymorphic
subject/matched columns could never FK for the same structural reason).

**Grants.** `client_profile` gets its FIRST-EVER UPDATE grant, column-scoped to exactly
`status`/`version`/`updated_at_utc` — `legal_name`/`registration_number`/`country_of_incorporation`/
`client_class`/`client_id`/`application_id`/`applicant_type`/`created_at_utc` remain immutable.
This also newly enables `SELECT ... FOR UPDATE` locking on `client_profile` (Postgres requires the
UPDATE privilege for row locking even on a read-only lock) — Phase 8 is the first code that
actually mutates this table, so the lock is both permitted and appropriate here, unlike the Phase
3 precedent where a lock-only read had to fall back to a plain `SELECT`.
`client_profile_lifecycle_decision_request` gets `SELECT, INSERT` plus a column-scoped UPDATE
limited to `status`/`approval_id`/`decision_token_hash`/`applied_at_utc`, mirroring every prior
decision-request grant exactly. No DELETE/TRUNCATE anywhere; no new cross-schema grant.

**Route model.** Six new routes, client-scoped and nested under `/clients/:client_id/...`
(`{suspend,reactivate,close}/{request,apply}`) — unlike Phase 5/6's top-level placement,
`client_profile` has a natural owning scope, matching the existing `/clients/:client_id/status`
route's own placement. All `/internal/clt1/*`, internal-identity-guarded, no public `/clt1/*`
surface. `routes/client-profiles.ts` builds all six from one parameterised
`registerLifecycleRoutes` helper rather than tripling ~150 lines of otherwise-identical
request/apply code across three near-copies — the first CLT-01 route file to do this, since the
three lifecycle actions are structurally identical in a way no prior phase's action set was
(Phase 3's add/remove and create/update differ in payload shape; Phase 6's
create/update/confirm/dismiss differ in what they mutate). Responses return only
`client_id`/`status`/`decision_id` (`safeLifecycleResponse`) — never `requested_by`/`approval_id`/
`decision_token_hash`/`reason`/`evidence_ref`.

**Existing-route impact — near-zero, by design.** `GET /internal/clt1/clients/:client_id/status`
is UNCHANGED (design decision 15) — it already `SELECT`s and returns `client_profile.status`
verbatim, so it naturally reports `suspended`/`closed` with no code change, proven by a dedicated
integration test rather than merely asserted. **Every client-scoped mutation route already
requires `client_profile.status = 'active_limited'`** — `authorised_user` add/remove (Phase 3, via
the shared `fetchActiveClientOrThrow` precondition), `client_mandate` create/update (Phase 3,
`lib/mandates.ts`'s own `fetchActiveClientOrThrow`), `authorised_party` add/update/remove/activate
(Phase 4) — so a suspended or closed client is automatically rejected with
`CLT1_CLIENT_NOT_ACTIVE` on every such mutation, and automatically un-rejected the moment the
client is reactivated, with **zero retrofit** this phase (design decision 16) — proven by a
dedicated integration test exercising all three downstream families both while blocked and again
after reactivate.

**No close cascade** (design decision 18) — `close/apply`'s locked transaction UPDATEs ONLY
`clt1.client_profile.status`; it never touches `authorised_user`/`client_mandate`/
`authorised_party` rows, proven by a dedicated integration test asserting those rows' own status
columns are byte-identical before and after a close. A closed client can therefore still hold
`active` child rows — their own *mutations* remain blocked by the unchanged `active_limited`
precondition above, but this phase does not proactively deactivate them. Documented as a
deliberate deferral, not an oversight.

**Error model.** Exactly one new code, `CLT1_CLIENT_PROFILE_INVALID_STATE` (409) — covers both a
genuinely illegal transition (including any action attempted from the terminal `closed` status)
and a missing required `reason`. `CLT1_CLIENT_PROFILE_NOT_FOUND` was deliberately NOT added — the
existing `CLT1_CLIENT_NOT_FOUND` is reused as-is (identical condition, same "don't proliferate
codes" discipline every prior phase applied); `CLT1_CLIENT_PROFILE_CLOSED` was deliberately NOT
added either — a `closed -> X` attempt is just another instance of
`CLT1_CLIENT_PROFILE_INVALID_STATE`, not a distinct condition. `CLT1_CLIENT_NOT_FOUND`/
`CLT1_PERMISSION_DENIED`/`CLT1_IAM2_UNAVAILABLE`/`CLT1_APPROVAL_REQUIRED`/
`CLT1_DECISION_REQUEST_INVALID_STATE`/`CLT1_AUDIT_REQUIRED`/`CLT1_SERVICE_UNAVAILABLE` are all
reused as-is.

**Audit/outbox.** Transaction-coupled throughout. Success events:
`clt1.client_profile_suspend_requested`/`_suspended`, `_reactivate_requested`/`_reactivated`,
`_close_requested`/`_closed`. Failure wrapper: a single `clt1.client_profile_lifecycle_denied`
event (design decision 17) carrying `action` + the specific `reason_code` in `payload_ref` —
deliberately mirroring Phase 7's own L1-closing consolidation
(`clt1.application_approval_denied`) rather than reintroducing a per-action `*_failed` fan-out.
**This wrapper fires only for POST-verify failures** (in-transaction `gate_failed`, or a
transaction-level exception) — a PRE-check transition failure (before `checkPermission`/
`verifyDecisionToken` are ever called) throws directly with no audit-wrapper call, identical to
`routes/decisions.ts`'s own `approve/apply` pre-check behaviour for `CLT1_APPLICATION_INVALID_STATE`.
The genuine in-transaction race (a status change occurring strictly between the pre-check and the
locked re-check) is proven — not merely asserted — via an IAM-02 execute-verify stub side-effect
that mutates `client_profile.status` directly, the same synchronous-test technique Phase 7's own
race test established using the CFG-01 stub; the denial IS audited in that case, since the
transaction's own `gate_failed` branch runs after execute-verify has already consumed the decision
token.

**PII/logging.** No new PII field. `reason`/`evidence_ref` are already covered by the existing
generic `req.body.reason`/`req.body.evidence_ref` log-redaction paths (`server.ts`, present since
Phase 2/Phase 1 respectively) — no `CLT1_LOG_REDACT_PATHS` change was needed.

**Verification performed:** `npx tsc -b --force` clean; fresh disposable Postgres, migrations
001→032 (batched: 001-006 → `iam2_runtime_grants.sql` → 007-032) + all 6 grant files clean; full
suite run twice against the same DB surfaced 22 unrelated failures confined entirely to
IAM-01/IAM-02 bootstrap-cascade tests (the documented one-time-per-database bootstrap-to-RBAC
transition artifact, zero CLT-01 involvement) — recreating a genuinely fresh database and running
once produced a clean **1198/1198 tests, 66 files, 0 failures** (1152 baseline + 46 new: 15 unit
[`clt1-client-profiles.test.ts`] + 31 integration [`clt1-db.test.ts`'s Phase 8 block + Phase 8
grants block] + real-guard coverage in `clt1-iam2-guard-real.test.ts`). Direct DB inspection:
exactly 33 `clt1.*` permissions (30 baseline + 3 Phase 8), all `licence_locked=false`, zero
`role_permission` seed; `client_profile` UPDATE grant confirmed exactly
`{status, version, updated_at_utc}`; `client_profile_lifecycle_decision_request` UPDATE grant
confirmed exactly `{status, approval_id, decision_token_hash, applied_at_utc}`; zero DELETE/TRUNCATE
grant anywhere; zero cross-schema grant into `iam2`/`cfg1`/`sec1`; highest migration `032`; 18
`clt1.*` tables (17 + 1). Static sweeps clean: no public `/clt1/*` route string; no Exchange/
trading/wallet/deposit/withdrawal/settlement fragment in the new files; no KYC/AML/screening-engine
wording; no duplicate-detection/scoring/fuzzy/graph/UBO wording; no `clt1.client_profile.read`
permission registered; no lifecycle-history route; no `client_profile.status` ever set to
`'active'`; no cascading UPDATE into `authorised_user`/`client_mandate`/`authorised_party` from
`routes/client-profiles.ts`.

**Two pre-existing test-design corrections made during this pass, not code defects:** (1) the
Phase 7 regression test `"does not add a new route, IAM-02 permission, or grant"` asserted the
LIVE cumulative `clt1.*` permission count (30), which necessarily becomes stale the moment any
later phase adds a permission — updated to 33 with a comment clarifying what the assertion actually
protects (Phase 7 itself added zero permissions, independently confirmed by migration-file
inspection, not by a frozen total). (2) the first draft of the Phase 8 real-guard "provisioned
actor" test assumed a role grant would flip the baseline decision to `allow`, copying the Phase
3-6 template verbatim — but ALL THREE Phase 8 permissions are `requires_approval=true` with no
single-step sibling (unlike every prior phase, which always had at least one `.read` permission to
use for that proof), so IAM-02's own guard precedence (approval-required is unconditional, checked
before role grants) means a grant can never produce `allow` here; the test was corrected to assert
the actually-correct behaviour (`approval_required`, confirmed IAM2_APPROVAL_REQUIRED via CLT-01's
own client) rather than weakened or deleted.

**Remaining deferred items (explicitly out of Phase 8 scope, not oversights):** no lifecycle-history
read route; no `clt1.client_profile.read` permission; no `status_reason`/`evidence_ref` column on
`client_profile` itself (both live only on the decision-request row); no close cascade into
`authorised_user`/`client_mandate`/`authorised_party`; no reopen-from-closed path; no approval
override; authorised-party screening still does not block final client approval (Phase 4's own gate
remains the only enforcement point); `related_party_edge` still does not directly block approval;
symmetric-pair direction-canonicalization remains deferred; duplicate-detection/scoring/
fuzzy-matching/merge-consolidation/graph-traversal/UBO-threshold/screening/identity-verification
engines all remain fully deferred; no real IAM-01 client-user linkage yet; mandate-check endpoint
remains deferred; the residual approver-side SoD gap and the interim shared-token trust model
remain; Phase 3 F1 (`client_mandate` duplicate 503→409 mapping) and Phase 2 L3 (unused `ctx`
parameter in `createHandoff`) remain deferred; no client portal login; no wallet/deposit/withdrawal/
trading/settlement/Exchange runtime.

**Sonnet self-review → ACCEPT, no Critical/High/Medium/Low findings requiring a fix.**
Independently reproduced from a genuinely fresh disposable Postgres (migrations 001→032 batched:
001-006 → `iam2_runtime_grants.sql` → 007-032, all 6 grant files clean): full suite **1198/1198
tests, 66 files, 0 failures**; targeted re-run (`clt1-client-profiles.test.ts` +
`clt1-db.test.ts` + `clt1-iam2-guard-real.test.ts`) **315/315**; `tsc -b --force` clean. Direct DB
inspection independently confirmed: 33 `clt1.*` permissions (3 Phase 8, all `licence_locked=false`
/`prohibited=false`/`requires_approval=true`), zero `role_permission` seed;
`client_profile_lifecycle_decision_request`'s `decision_type`/`status` CHECK constraints and its
real FK to `client_profile(client_id)` read directly from `pg_constraint`; `client_profile`'s
UPDATE grant confirmed exactly `{status, version, updated_at_utc}`; zero DELETE/TRUNCATE grant;
zero cross-schema grant into `iam2`/`cfg1`/`sec1`; zero `foundation.idempotency_record` grant;
highest migration `032`. Static sweeps (public routes, Exchange/trading/wallet/deposit/withdrawal/
settlement, KYC/AML/screening, duplicate-detection/scoring/fuzzy/graph/UBO, `client_profile.read`
permission registration, lifecycle-history route, `client_profile.status='active'` write,
cascading UPDATE into `authorised_user`/`client_mandate`/`authorised_party`) all clean — the only
grep hits were pre-existing Phase 4 artifacts (`CLT1_UBO_THRESHOLD_REQUIRED`, a `director/UBO/
controller` log-redaction comment) and this phase's own absence-documentation comments, not new
Phase 8 surface.

Three items assessed as correct-and-intentional, not defects, each directly confirmed against
existing precedent rather than assumed:
- **No local self-action SoD check** (e.g. `requested_by === some-assigned-actor`) exists for any
  lifecycle action — `client_profile` has no assigned-actor field comparable to `application`'s
  `assigned_reviewer` or `authorised_user`'s own `user_reference`, so there is nothing to compare
  a lifecycle requester against. Confirmed this exact gap already exists, undisputed, for Phase 3's
  `client_mandate` create/update (documented there as "the only CLT-01-owned SoD check possible...
  since there is no other assigned-relationship to compare against") — Phase 8 inherits the same
  honest limitation, not a new one. IAM-02's own maker≠approver check remains the sole additional
  control, as with mandates.
- **Apply-time decision-row mismatch reuses `CLT1_CLIENT_NOT_FOUND`**, not a lifecycle-specific
  code, when `decision_id` doesn't exist or its `client_id`/`decision_type` don't match the route —
  confirmed byte-for-byte identical to `routes/decisions.ts`'s own `approve/apply`
  (`decisionRow.application_id !== application_id` also collapses to `CLT1_APPLICATION_NOT_FOUND`),
  not a Phase-8-specific inconsistency.
- **The payload_hash check is structurally non-forgeable-but-also-non-divergent** — `client_id`/
  `decision_type`/`requested_by` are immutable after INSERT (excluded from the UPDATE grant), so
  `currentPayloadHash` recomputed at apply time can never legitimately differ from the value
  computed at request time. This is the same shape as Phase 6's `duplicate_candidate` confirm/
  dismiss and Phase 3's `authorised_user` add/remove — decision flows with no editable payload
  still use fingerprint verification to bind the execute-verify token to the exact `decision_id`/
  requester/target combination it was minted for, not to detect in-flight content edits.

No code was changed during this review — the implementation as delivered already satisfied every
approved Phase 8 design decision and DO-NOT-ACCEPT item.

**Independent Opus review outcome:**
- Verdict: **ACCEPT CLT-01 Phase 8**
- 1198/1198 full suite passing
- zero Critical/High/Medium/Low findings
- no code changed during Opus review
- Phase 9 not started
- informational observations:
  - no local self-action SoD check exists for lifecycle actions, because `client_profile` has no
    assigned-actor field to compare `requested_by` against — the same inherited limitation
    Phase 3's `client_mandate` create/update already has, not new
  - apply-time decision-row mismatch reuses `CLT1_CLIENT_NOT_FOUND` rather than a
    lifecycle-specific code — byte-identical to `routes/decisions.ts`'s own `approve/apply`
    precedent for a mismatched `application_id`

**CLT-01 Phase 8 is an accepted implementation baseline. CLT-01 Phase 9 has not been started.**

## 15. Phase 9 — implementation baseline (Sonnet self-review pending Opus) — module closure & final hardening baseline

Closure and hardening only — no new business capability, no migration, no new IAM-02 permission,
no new grant, no new route. Closes the last two open carry-forwards (Phase 3 F1, Phase 2 L3) and
consolidates the closure inventories (route/permission/grant/audit-event/error/PII) that prove the
accepted baseline is exactly what every prior phase's acceptance claimed it to be.

**F1 CLOSED** — `client_mandate` `create/apply`'s one-active-mandate-per-client unique-violation
(`idx_clt1_client_mandate_one_active_per_client`, migration 023) now maps to a real 409
`CLT1_MANDATE_ALREADY_ACTIVE`, not the generic `CLT1_AUDIT_REQUIRED` (503) it was collapsed into
since Phase 3. `lib/errors.ts` gains exactly one new code. `routes/mandates.ts` gains
`isDuplicateActiveMandateViolation(err)` — byte-for-byte the same `pgErr.code === "23505" &&
pgErr.constraint === "..."` shape as `related-party-edges.ts`'s `isDuplicateEdgeViolation` (Phase
5) and `duplicate-candidates.ts`'s `isAlreadyOpenViolation` (Phase 6) — branched before the
generic collapse in `create/apply`'s catch block. No schema, permission, approval-model, or
uniqueness-rule change: the fix is pure error-mapping over an index that has existed since Phase
3. The decision-request row is left `requested` either way, safely retriable once the existing
active mandate is no longer active (proven by a direct-DB-update test, since no organic
deactivation route exists this phase — the same "test the unreachable-via-API state directly"
convention Phase 6 already established for `needs_more_info`). A pre-existing Phase 3 test that
asserted the OLD 503 behavior for this exact scenario was updated to assert the corrected 409, not
left as a silently-conflicting duplicate.

**L3 CLOSED** — the unused `ctx: { request_id?: string; correlation_id?: string }` parameter was
removed from `routes/outcomes.ts`'s `createHandoff`, along with both call-site arguments
(`handoff/kyc-kyb`, `handoff/aml`). Behavior-unchanged: `createHandoff` never read `ctx` in the
first place (correlation flows via `publishAudit`'s own ambient async-context, the same mechanism
every other CLT-01 mutation already relies on) — confirmed by direct inspection before removal,
not assumed. The unrelated `request.ctx.request_id`/`request.ctx.correlation_id` usage inside
`receiveOutcome` (the `cdd_outcome` INSERT, which genuinely has `request_id`/`correlation_id`
columns) is untouched.

**Route inventory finalized.** `tests/unit/clt1-app.test.ts`'s route-surface assertion was
hardened from substring/`.toContain` matching (which can prove an EXPECTED route exists but can
never prove an unexpected EXTRA route is absent) to an exact frozen-tree equality check
(`EXACT_ROUTE_TREE`) against a real `app.printRoutes({ commonPrefix: false })` capture — 67 lines,
captured directly from a running `buildApp()`, not hand-transcribed from source. A companion test
confirms the status route and all six lifecycle routes are present in that frozen tree; the
pre-existing forbidden-fragment sweep is retained as defense-in-depth alongside the exact-set
check, not replaced by it.

**Permission inventory finalized.** Exactly 33 `clt1.*` permissions, independently re-classified:
**19 maker-checker** (`requires_approval=true`: Phase 2's `application.approve`; Phase 3's
`authorised_user.add`/`.remove`, `client_mandate.create`/`.update`; Phase 4's
`authorised_party.add`/`.update`/`.remove`/`.activate`; Phase 5's `related_party.add`/`.update`/
`.remove`; Phase 6's `duplicate_candidate.create`/`.update`/`.confirm`/`.dismiss`; Phase 8's
`client_profile.suspend`/`.reactivate`/`.close`) + **14 single-step** (Phase 2's
`application.review`/`.reject`/`.hold`, `cdd_outcome.read`; Phase 3's `authorised_user.read`/
`.suspend`/`.reactivate`, `client_mandate.read`; Phase 4's `authorised_party.read`/`.restrict`/
`.reject`/`.suspend`; Phase 5's `related_party.read`; Phase 6's `duplicate_candidate.read`) = 33.
All `licence_locked=false`, all `prohibited=false`, zero `role_permission` seed — verified directly
against `iam2.permission`/`iam2.role_permission`, not assumed from source. Confirmed absent:
`clt1.client_profile.read`/`.history`/`.activate`/`.reopen`, `clt1.approval.override`,
`clt1.duplicate.override`, and any wallet/trading/deposit/withdraw/settlement/Exchange-fragment
code.

**Grant inventory finalized.** Directly re-verified via `information_schema`: zero DELETE/TRUNCATE
grant anywhere for `role_clt1_runtime`; zero grant into `iam2`/`cfg1`/`sec1`; zero
`foundation.idempotency_record` grant; `foundation.outbox_event` is INSERT-only; `client_profile`'s
UPDATE grant is exactly `{status, updated_at_utc, version}`; every one of the seven
decision-request tables' UPDATE grant is exactly `{applied_at_utc, approval_id,
decision_token_hash, status}` (`application_`, `authorised_user_`, `client_mandate_`,
`authorised_party_`, `related_party_edge_`, `duplicate_candidate_`,
`client_profile_lifecycle_`) — no drift found; the grant file was not touched.

**Audit-event inventory finalized.** The full documented event set (Phase 1 intake through Phase 8
lifecycle, 8 families) confirmed emitted at least once across the suite run; `clt1.cdd_gate_denied`
confirmed absent (0 occurrences, Phase 7 rename holds); both wrapper events
(`clt1.application_approval_denied`, `clt1.client_profile_lifecycle_denied`) confirmed to carry a
non-empty `reason_code` on every occurrence; every `clt1.*` `payload_ref` accumulated across the
full suite run swept for PII key-name leakage (`legal_name`/`applicant_email`/
`registration_number`/`country_of_incorporation`/`user_reference`/`party_reference`) — none found.

**Error-code inventory finalized.** Every `CLT1_*` code has either a reachable throw site or a
documented present-but-defensive justification (`CLT1_MANDATE_INVALID_STATE`,
`CLT1_UBO_THRESHOLD_REQUIRED`) — no code removed, one added (`CLT1_MANDATE_ALREADY_ACTIVE`).

**PII/safe-response sweep finalized.** One route per family re-verified by response-body
inspection (application, client status, authorised-user list, mandate current, authorised-party
list, related-party client-scoped read, duplicate-candidate client-scoped read, client_profile
lifecycle apply) — none return `legal_name`/`registration_number`/`country_of_incorporation`/
`applicant_email`/`user_reference`/`party_reference`/`requested_by`/`approval_id`/
`decision_token_hash`/`reason`/`evidence_ref` where those fields are not part of that route's own
established, legitimate response contract (`duplicate_candidate.evidence_ref` and
`related_party_edge.evidence_ref` are genuine blueprint entity fields on those two tables,
correctly returned — the check does not treat them as a violation, only the Phase 8 decision-flow
`reason`/`evidence_ref` and every route's `requested_by`/`approval_id`/`decision_token_hash` are
asserted absent everywhere). `CLT1_LOG_REDACT_PATHS` reconfirmed to cover
`legal_name`/`applicant_email`/`registration_number`/`country_of_incorporation`/`evidence_ref`/
`reason`/`user_reference`/`party_reference` plus the internal-service-token header — unchanged,
already complete since Phase 4.

**No-Exchange/no-wallet/no-trading posture verified.** `assertNoExchangeRuntime` still runs at
boot over the real route table (unchanged); `client_profile.status` live values (fixture-created
fresh in this phase's own test, since `afterEach` clears the table between tests and nothing
accumulates there) confirmed to be only `active_limited`/`suspended`/`closed` across
`active_limited`, `suspended`, and `closed` fixtures — never `active`/`trading_enabled`/
`wallet_enabled`; the live route surface swept for every forbidden business-capability fragment.

**No migration, no new permission, no grant change, no route change** — migration 031/032 remain
the highest pair; no migration 033 was created; the IAM-02 catalogue and `clt1_runtime_grants.sql`
are byte-identical to the pre-Phase-9 state.

**Remaining deferrals, classified (not hidden gaps):**
- **Future CLT enhancement:** no lifecycle-history read route / `clt1.client_profile.read`
  permission; no `status_reason`/`evidence_ref` column on `client_profile`; no close cascade into
  child rows; no reopen-from-closed path; symmetric-pair direction-canonicalization.
- **Known platform-wide posture/limitation:** no approval override; the residual approver-side SoD
  gap (IAM-02 `execute-verify` never exposes approver identity); the interim shared-token identity
  model.
- **Future module dependency:** authorised-party screening and `related_party_edge` remain
  non-blockers of final approval (need the screening engine to be load-bearing); duplicate-
  detection/scoring/fuzzy/merge/graph/UBO engines; screening/identity-verification engines
  (KYC-01/AML-01); IAM-01 client-user linkage; mandate-check endpoint; wallet/deposit/withdrawal/
  trading/settlement/Exchange capability (WLT/DEP/WDR/LED/TRD; Exchange permanently locked).

**Verification performed:** `npx tsc -b --force` clean; fresh disposable Postgres, migrations
001→032 (batched: 001-006 → `iam2_runtime_grants.sql` → 007-032, unchanged, no migration 033) +
all 6 grant files clean; a first full-suite run against the same DB surfaced 22 unrelated failures
confined entirely to IAM-01/IAM-02 bootstrap-cascade tests (the documented one-time-per-database
artifact, zero CLT-01 involvement) — recreating a genuinely fresh database and running once
produced a clean **1223/1223 tests, 66 files, 0 failures** (1198 baseline + 25 new: F1 regression
+2, permission/grant/audit/PII/no-Exchange closure inventories, route exact-set hardening). One
pre-existing Phase 3 test (asserting the old 503 mandate-duplicate behavior) was corrected to
match the new 409, not left conflicting. Direct DB inspection independently confirmed: 33
permissions (19/14 split), zero seed, all flags correct; exact grant column lists for
`client_profile` and all 7 decision-request tables; zero DELETE/TRUNCATE/cross-schema/
idempotency_record grant; highest migration `032`. Static sweeps of every Phase-9-touched file
clean (the only regex hits were the pre-existing Phase 4 `CLT1_UBO_THRESHOLD_REQUIRED` code and
`client_mandate.status = 'active'` — the mandate's own status column, unrelated to
`client_profile`).

**Sonnet self-review → ACCEPT.** Zero Critical/High/Medium defects in the Phase 9 code. One Low
review-process note (not a code defect): the self-review's first full-suite verification attempt
used `DATABASE_URL` instead of `TEST_DATABASE_URL`, so DB-gated test bodies risked silently
no-op'ing rather than genuinely executing — caught by `cfg1-db.test.ts`/`sec1-db.test.ts`'s hard
`schemaReady` assertions, corrected, and rerun with `TEST_DATABASE_URL` set correctly before
reporting a result.

**Independent Opus review → ACCEPT CLT-01 Phase 9.** Zero Critical/High/Medium/Low findings.
Independently reproduced from a genuinely fresh disposable Postgres (migrations 001→032, all 6
grant files clean, no migration 033): **1223/1223 full suite passing**, `tsc -b --force` clean.
`TEST_DATABASE_URL` explicitly set and independently confirmed to be genuinely exercising
DB-gated test bodies — not silently skipping — by direct proof (3,794 accumulated `clt1.*` audit
events across 67 distinct event types after the run; a no-op run would show zero) rather than by
trusting the pass count alone. IAM-02 catalogue (33 permissions, 19/14 split) and the full grant
matrix independently reproduced at the `information_schema`/`iam2.permission` level. No code was
changed during the Opus review. Two informational, non-blocking observations: the audit-event and
PII-payload closure-inventory tests depend on accumulated `foundation.outbox_event` state from the
whole file's prior Phase 1-8 tests having already run (deliberate, documented design, not a defect
condition on any standard whole-file run); the F1 duplicate-mandate conflict still emits an
inherited `severity: high` failure-audit event for what is a client-side 409 conflict, consistent
with the already-accepted Phase 5/6 precedent, not a Phase 9 regression.

**CLT-01 — Accepted implementation baseline COMPLETE (Phases 0-9).** `MODULE_STATUS.md`,
`PROJECT_HANDOVER.md`, and `SESSION_START_PROMPT.md` (sibling `aix-platform-docs` workspace) have
been updated to this final-complete state. Recommended next runtime module: **AML-01**, with
KYC-01 as a close alternative — CLT-01 already has receipt-only seams (CDD outcomes, KYC/AML
handoff status, authorised-party screening linkage, approval gates) that AML-01 would make
load-bearing.

## 16. KYC-01 Phase 4A prerequisite — ACCEPTED implementation baseline after independent Opus review — application-keyed KYC roster contract

Added in a later session on top of the complete Phases 0-9 baseline, once KYC-01 Phase 4
planning identified a structural blocker: the only existing authorised-party roster read
(`GET /internal/clt1/clients/:client_id/authorised-parties`) is client-keyed and gated on
`client_profile.status='active_limited'`, which is created only at final approval — chronologically
unavailable to KYC-01, which needs the roster while the application is still `under_review`.

New route `GET /internal/clt1/applications/:application_id/kyc-roster` — keyed directly by
`client_application.application_id`, no `client_id`/`client_profile`/`fetchActiveClientOrThrow`
dependency; internal-service-token-only. Response: `{application_id, application_status,
primary_subject_type, authorised_parties, party_count, roster_hash}`; each party
`{authorised_party_id, party_type, authority_status, version}` — no `party_reference`, no PII.
Complete roster, unfiltered by `authority_status`; complete-or-error, hard cap 500 parties.
`roster_hash`: CLT-owned, `@aix/foundation` `fingerprint()` over the roster canonically sorted by
`authorised_party_id` ASC via locale-independent `codePointCompare`. One new error code
`CLT1_KYC_ROSTER_TOO_LARGE` (409). No migration, no schema/grant change, no IAM-02 permission, no
`role_permission` seed, no outbox event, no KYC-01 source change.

Independent **Opus review → ACCEPT WITH LOW FINDINGS** (zero Critical/High/Medium), reproduced via
76 independently-authored adversarial probes on a fresh disposable Postgres, including an
independent hash recomputation from raw DB rows matching the route byte-for-byte and a decisive
collation test. **Phase 4B readiness confirmed**: the contract supplies every element KYC-01
Phase 4B needs, with no missing field or blocking ambiguity.

## 17. Phase 4A.1 — ACCEPTED implementation baseline after independent combined Opus review — atomic KYC roster binding (coordinated prerequisite for KYC-01 Phase 4B)

Closes a confirmed, empirically-reproduced TOCTOU the KYC-01 Phase 4 delivery-atomicity planning
amendment identified: the Phase 4A roster read gives KYC-01 a digest, but the existing KYC/KYB
outcome receipt (`routes/outcomes.ts`) never re-checked it, and shared no lock with the transactions
that can change the roster's hashed content — a roster mutation landing between KYC-01's read and
CLT-01's receipt (or between receipt and final approval) was silently accepted.

Migration `047_clt1_atomic_kyc_roster_binding.cjs`: two nullable columns, no other schema change.
`clt1.client_application.kyc_roster_hash` — the roster digest the LATEST accepted `kyc_kyb`
outcome was validated against; rechecked at final approval. `clt1.cdd_outcome.kyc_roster_hash` —
immutable, append-only, per-receipt evidence, set once at INSERT, never updated (no UPDATE grant
exists on this table). Both share one CHECK: NULL always allowed, else exactly
`^sha256:[0-9a-f]{64}$`. No `roster_version` counter, no new table, no new IAM-02 permission, no
new route, no `role_permission` seed, no cross-schema grant.

`expected_roster_hash` is now REQUIRED (schema-validated) whenever `outcome_type='kyc_kyb'`. A
shared application-scoped `pg_advisory_xact_lock(hashtext('clt1.kyc_roster:'+application_id))`
(`acquireKycRosterLock`, `lib/kyc-roster.ts`) is acquired as the FIRST statement — before any row
read/lock/mutation — in every roster-mutating transaction (`authorised-parties.ts`'s add/update/
remove/activate/restrict/reject/suspend apply routes, 6 call sites), the `kyc_kyb` outcome receipt
(`outcomes.ts`, 1 call site, acquired unconditionally for every outcome type so cross-type races
are also serialized), and the approval recheck (`decisions.ts`'s approve/apply, 1 call site) — 8
source call sites covering 10 runtime transaction paths (restrict/reject/suspend share one
function). The 4 `*/request` routes (staging-table-only INSERTs, never touch `authorised_party`
itself) correctly do NOT hold the lock.

CLT-01 recomputes the current roster hash under the lock (`fetchCurrentRosterHash`, the SAME
canonicalisation/hashing logic Phase 4A's own route uses, deliberately not accepting a
caller-supplied `application_status`/`applicant_type`) and compares it atomically against
`expected_roster_hash`. A mismatch is refused as `CLT1_KYC_ROSTER_STALE`/409 BEFORE any
`cdd_outcome` INSERT or rollup UPDATE, with a committed `clt1.kyc_outcome_refused` high-severity
audit event (`reason_code: roster_stale`) — never a misleading success. On acceptance, the hash is
stored on both `client_application.kyc_roster_hash` and the new `cdd_outcome` row's own
`kyc_roster_hash`.

Final approval (`decisions.ts` approve/apply) independently rechecks the SAME binding under the
SAME advisory lock, as a fourth precondition alongside the existing handoff/CDD-gate/duplicate-
candidate checks: the current roster hash must still equal `client_application.kyc_roster_hash`
(a NULL binding — no `kyc_kyb` outcome ever accepted under this contract — is refused identically
to a mismatch, never treated as "no check configured, allow by default"). A mismatch or NULL
throws `CLT1_KYC_ROSTER_STALE` before the `client_profile` INSERT; no client_profile is ever
created on a stale approval. Recovery is only via a fresh `kyc_kyb` outcome accepted against the
then-current roster.

**Test-only MED-1 micro-patch** (found and closed during the SAME independent combined review that
accepted Phase 4A.1 + KYC-01 Phase 4B): the original lock-position guard test's own name and
comments overclaimed what a text-position check can prove. Corrected to state its scope honestly —
verifies, for the 8 currently-inventoried source transactions (10 runtime paths), that
`acquireKycRosterLock(...)` appears inside that transaction's OWN `withTransaction(...)` block
(via balanced-brace extraction from a maintained ownership-anchor inventory, correctly skipping
comments/strings/template literals) BEFORE every `FOR UPDATE`/`INSERT`/`UPDATE`/`DELETE`/
`publishAudit(...)` call present in that block — and added a genuine negative control (a synthetic
block with the lock deliberately placed after a `FOR UPDATE` is proven to fail the guard). Does
NOT automatically discover a new roster-hash-mutating route (a maintained inventory, not an
inference engine) and does NOT itself prove runtime lock-blocking behaviour — that remains the job
of the three behavioural independent-connection lock-hold tests (outcome receipt, approve/apply,
add/apply) and the concurrent-mutation-vs-receipt test, all of which remained green throughout, no
`40P01` observed. This was a test-file-only correction; the lock discipline itself was never
weakened.

Independent **Opus review of the combined CLT-01 Phase 4A.1 + KYC-01 Phase 4B implementation →
ACCEPT WITH NON-BLOCKING FINDINGS** (0 Critical/High/Medium; 2 Low, 4 Informational — none of which
concern CLT-01/Phase 4A.1 controls directly, see `KYC-01_IMPLEMENTATION_NOTES.md` §Phase 4B for
the full findings list). Independently reproduced: the lock guard's 8-site/10-path inventory and
negative control verified directly against source; migration 047 confirmed intact and unmodified
by KYC-01 Phase 4B; migration 047 down/up round-trip clean; all three behavioural lock tests
confirmed green. Canonical combined full suite **2195/2195 (96/96 test files)** on a fresh
disposable Postgres, `npx tsc -b --force` clean, migrations 001→048 clean, all 8 grant files
clean, same-DB targeted KYC+CLT rerun **606/606**.

**CLT-01 — accepted core implementation (Phases 0-9) plus accepted Phase 4A KYC roster
prerequisite and Phase 4A.1 atomic KYC roster binding.** CLT-01 remains a completed module.
`MODULE_STATUS.md`, `PROJECT_HANDOVER.md`, and `SESSION_START_PROMPT.md` (sibling
`aix-platform-docs` workspace) updated to this state. **D1 (authorised-party-roster-completeness,
KYC-01-side) remains open**: technical roster-binding consistency is now enforced end to end, but
every CLT-01 authorised-party route still requires an approved `active_limited` `client_profile`
(created only at final approval), so the roster KYC-01 fetches during `under_review` is currently
always empty via the supported workflow. **Next: CLT-01 Phase 4A.2 — Pre-Approval
Authorised-Party Capture and KYC Handoff Planning. Use Opus for planning before any coding.**

## 18. Phase 4A.2A — pre-approval authorised-party capture (initial implementation REJECTED, remediated implementation ACCEPTED)

Planning (Opus, no code): inspected whether Phase 4A.2's brief (a full pre-approval capture +
KYC handoff redesign) required new schema. Direct source inspection established
`clt1.authorised_party` / `clt1.authorised_party_decision_request` never had a `client_id` column
— `client_id` was purely a client-keyed ROUTE's own lookup key via `fetchActiveClientOrThrow`
(itself gated on `client_profile.status='active_limited'`, which only exists post-approval). This
meant the party model was already application-scoped, so the minimum safe fix was a
shared-service extraction plus a new application-keyed route family (Phase 4A.2A), with KYC-01
anchor sync deferred to a separate Phase 4A.2B — zero new migration, zero new grant, zero new
IAM-02 permission required for 4A.2A itself.

Implementation (Sonnet): extracted the four existing maker-checker mutation functions
(`requestPartyAdd`/`applyPartyAdd`, `requestPartyUpdate`/`applyPartyUpdate`,
`requestPartyRemoval`/`applyPartyRemoval`, `recordPartyScreeningOutcome`) plus list/lookup helpers
into a new shared service, `services/clt1/src/lib/authorised-party-service.ts`. Refactored
`services/clt1/src/routes/authorised-parties.ts` (the existing client-keyed post-approval routes)
to call the shared service, behavior-preserving (same responses, same error codes, same
`fetchActiveClientOrThrow` gate). Added `services/clt1/src/routes/application-authorised-
parties.ts` — 8 new application-keyed pre-approval routes: `GET .../authorised-parties`,
add/request, add/apply, update/request, update/apply, remove/request, remove/apply,
screening-outcome, all under
`/internal/clt1/applications/:application_id/authorised-parties`. No application-keyed
activate/restrict/reject/suspend routes were added — those remain post-approval-only and
client-keyed. Added two `Clt1Action` entries to `lib/applications.ts`:
`authorised-party-capture` (allowed from `draft`/`submitted`/`under_review`) and
`authorised-party-screening` (allowed only from `under_review`). Registered the new route file in
`server.ts`. Rewrote the lock-position guard and route-tree test to match, and added ~41 new
tests. Canonical suite at this point: **2235/2235 (96/96 test files)**, migration head unchanged
at 048, no migration 049.

Independent **Opus review of the INITIAL implementation → REJECT.** Two empirically-proven
critical findings, reproduced with disposable-Postgres adversarial probe scripts (not accepted on
report): **CRITICAL-1** — `fetchApplicationForPartyCaptureOrThrow`'s lifecycle check ran only as a
route preflight, never re-validated inside the mutation transaction; since `reject`/`hold` take no
roster advisory lock, a party could be inserted into an already-`rejected` application, HTTP 200,
with no refusal. **CRITICAL-2** — the same preflight-only gap allowed a party to be inserted into
an already-`approved` application (with a live `client_profile`) after approval had already
committed and Phase 4A.1's own final-approval roster recheck had already passed, leaving the
accepted `kyc_roster_hash` diverged from the current roster, HTTP 200, no refusal. No fixes were
applied during the review; both probe scripts were created and deleted inside the repo, used only
for verification.

## 19. Phase 4A.2A lifecycle TOCTOU remediation — ACCEPTED after independent Opus re-review

Remediation (Sonnet, narrowly scoped — no Phase 4A.2B, no KYC-01 change, no migration/grant/
permission/error/audit-event change, no held-state fix, no route-surface redesign). Added
`lockAndAssertApplicationLifecycle(txClient, applicationId, allowedApplicationStatuses)` to
`authorised-party-service.ts`: `SELECT status FROM clt1.client_application WHERE application_id =
$1 FOR UPDATE`, called inside all four shared mutation functions — after the existing roster
advisory lock, before any business write, decision-request consumption, or audit publication.
Returns a discriminated `{ok:false, error}` result (not a throw) from the three `apply*` functions
so the outer catch-and-rethrow preserves the accurate `CLT1_APPLICATION_INVALID_STATE` error code
rather than collapsing into `CLT1_AUDIT_REQUIRED`; `recordPartyScreeningOutcome`'s existing outer
catch already rethrew `Clt1Error` instances directly, so it throws there safely. Three trusted,
compile-time-only policy constants gate which statuses each route family may pass in —
`PRE_APPROVAL_PARTY_STATUSES = ["draft","submitted","under_review"]`,
`PRE_APPROVAL_SCREENING_STATUSES = ["under_review"]`, `POST_APPROVAL_PARTY_STATUSES =
["approved"]` — selected by trusted route registration code in both route files, never derived
from caller input. Touched exactly 4 files: `authorised-party-service.ts`, both route files (call-
site wiring only), and `tests/integration/clt1-db.test.ts`.

Deadlock-freedom argument: `client_application` is now held `FOR UPDATE` for the remainder of the
party-mutation transaction; `reject`/`hold` acquire only that same row lock, never the roster
advisory lock, so there is no possible wait-cycle — either `reject`/`hold` commits first (the party
transaction then sees the new status and refuses) or it blocks behind the party transaction (no
cycle, just ordering). `approve/apply` already took the roster advisory lock as its own first
statement pre-remediation, so it was already fully serialized against party mutations at the lock
layer; the new row lock is redundant-but-harmless for that ordering and essential for reject/hold.

Replaced the prior nondeterministic `Promise.all` race test with 9 deterministic tests: a
`raceLifecycleChangeAgainstBlockedAddApply` helper (independent-connection advisory-lock-hold
barrier) proving "reject wins" and "hold wins" for add/apply, plus the same barrier reused for
update/apply, remove/apply, and screening-outcome; an "approval commits first" test using a real
`setTimeout`-based delay embedded in a route-scoped IAM-02 stub (matched on
`body.action === "clt1.authorised_party.add"` only, so only the targeted call is paused — not a
lock-hold-then-release mechanism, which does not guarantee re-acquisition order) proving
`CLT1_APPLICATION_INVALID_STATE`; a complementary "party commits first" test (purely sequential)
proving `CLT1_KYC_ROSTER_STALE`. Added an honest-scope-limitation comment to the lock-position
guard's own header, plus a new supplemental per-function source check (via the pre-existing
`extractOwnTransactionBlock` balanced-brace technique, applied per function rather than as a
whole-file text count) verifying `lockAndAssertApplicationLifecycle(` appears after
`acquireKycRosterLock(` and before any write/`publishAudit(` in each of the four functions' own
transaction blocks. Canonical full suite after remediation: **2241/2241 (96/96 test files)**,
same-DB CLT+KYC rerun 652/652, migration head unchanged at 048, no migration 049.

Independent **Opus re-review of the remediation → ACCEPT REMEDIATED PHASE 4A.2A — WITH
NON-BLOCKING FINDINGS** (0 Critical/High/Medium). Re-ran the ORIGINAL, unmodified CRITICAL-1/
CRITICAL-2 exploit probes against the remediated code — both now refuse with HTTP 409
`CLT1_APPLICATION_INVALID_STATE`, zero corruption — plus 6 additional independently-authored
probes: client-keyed update/apply refusal, remove/apply refusal, screening-outcome refusal, the
full client-keyed post-approval maintenance lifecycle end-to-end, a 6x concurrent add-vs-approve
race (zero both-success outcomes, zero `40P01`), and organic pre-approval capture regression. All
8 probes passed. Deterministic test subset re-run 5x consecutively, 7/7 stable every time.
Independently reproduced `npx tsc -b --force` clean, CLT-01 integration 415/415, KYC-01 regression
237/237, AML-01 regression 191/191, canonical full suite **2241/2241 (96/96 test files)**, same-DB
rerun 652/652, migration head **048**, no migration 049, CLT-01 error catalogue 44, CLT-01 IAM-02
permissions 33, CLT-01 tables 18, CLT-01 route registrations 69. **2 Low** (carried forward,
unchanged framing: the lock-guard's honestly-scoped documentation limitation; application-keyed
list ordering lacks an explicit tie-break) and **3 Informational** (the pre-existing held-state
dead end — no resume/unhold transition exists anywhere, unchanged, explicitly out of scope; the
inherited client-keyed `client_profile.status` preflight-only asymmetry, now flagged for
deliberate future review; a harmless transaction-commits-on-refusal subtlety) — none classified as
acceptance blockers, no fixes required before acceptance.

## 20. Phase 4A.2B — coordinated KYC anchor-sync integration (KYC-01-side implementation, CLT-01-side status closure)

Implemented entirely on the KYC-01 side (`services/kyc1/src/routes/roster-sync.ts`, `lib/kyc-
case-creation.ts`, `lib/roster-controls.ts`; refactors to `routes/handoffs.ts` and `routes/
outcome-publication.ts`; `lib/errors.ts`) — **zero CLT-01 runtime source, migration, grant,
permission, or route change**, confirmed by independent mtime forensics across all three review
passes below. CLT-01's own accepted Phase 4A roster contract (`GET .../kyc-roster`) and Phase
4A.1 atomic receipt (migration 047) are consumed unchanged.

`POST /internal/kyc1/applications/:application_id/roster-sync` — internal KYC service token only,
no IAM-02, no caller-supplied actor identity — fetches CLT-01's roster, requires
`application_status='under_review'`, and creates exactly one KYC `authorised_party` case for
every required party (`authority_status` ∈ pending/active/restricted/suspended) that has no KYC
case at all; any party with ANY existing case, in any status, is skipped — never re-created,
never re-verified. Case creation runs through one shared implementation used by both this new
route and the pre-existing KYC-01 handoff route.

Independent **Opus review of the initial implementation → runtime found correct** (completed-case
idempotency, corrective-case idempotency, concurrent-sync serialization, the handoff-versus-
roster-sync race, audit-failure rollback, and full Phase 4B preservation were each independently
adversarially probed and proven correct on a fresh disposable Postgres), **with one blocking
test-infrastructure finding, MEDIUM-1 — not a runtime defect**: the KYC-01 test suite's exact
21-event audit-inventory assertion was declared before the Phase 4A.2B test block that first
organically emits `kyc1.roster_sync_processed`, so on a genuinely fresh database the assertion
failed (2279/2280 across 96/97 files) while a warm/pre-populated database masked it.

**Remediated (KYC-01 test file only) and independently re-verified → MEDIUM-1 CLOSED.** The
exact-equality assertion — unweakened, same 21-member set — moved to a new, final `describe`
block executing after every KYC-01 event-emitting test, including the whole Phase 4A.2B block; no
event was manually seeded, no runtime source changed anywhere. Independently re-verified on TWO
separately-provisioned fresh databases: canonical `npm test` **2280/2280 across 97/97 files** on
each — proving the fix is genuinely deterministic, not residual-state-dependent. A known,
pre-existing, unrelated same-database limitation was also confirmed: a SECOND consecutive
full-suite run against an already-used database reproduces the documented one-time
IAM-01/IAM-02/CFG-01 bootstrap-idempotency signature (`iam-db`/`iam2-db`/`cfg1-db`) — KYC-01,
CLT-01, and AML-01 all remain fully green in that run; this is not a Phase 4A.2B finding, and
canonical acceptance rests on the two independently fresh-database runs, not a same-database
rerun.

**Organic, no-raw-SQL D1-closing end-to-end test** (`tests/integration/kyc1-clt1-roster-sync-
e2e-real.test.ts`) drives the full supported workflow over real HTTP against both a real CLT-01
app and a real KYC-01 app in one process (a combined-role test fixture plus an inject-fetch
adapter — independently confirmed not to bypass any real authentication, schema validation, or
route logic): create application → submit → start review → capture an authorised party through
the accepted CLT-01 Phase 4A.2A maker-checker routes → create the primary KYC case through the
existing handoff route → invoke KYC roster-sync (creating the authorised-party KYC case with
`party_id` exactly equal to the CLT-generated `authorised_party_id`) → complete evidence/checks/
outcomes for both cases → create the required AML handoff marker → deliver `aml_sanctions`/
`pep_adverse_media`/`risk_rating` → publish the roster-bound KYC outcome → deliver it atomically
to CLT-01 (CLT-01's own migration-047 atomic receipt contract, exercised for real) → request and
apply final approval → `client_profile` created — with zero raw SQL `authorised_party`/`kyc_case`/
`outcome_publication`/`client_profile` inserts, no hand-written roster hash, no fake
caller-supplied party id, and no maker-checker bypass anywhere in the flow.

**Accepted canonical baseline**: `npx tsc -b --force` clean; KYC-01 integration **273/273**;
KYC-01 unit **38/38**; organic CLT-to-KYC E2E **1/1**; CLT-01 regression **415/415** (fully
unchanged — confirming zero CLT-01-side impact); AML-01 regression **191/191**; same-DB targeted
CLT+KYC rerun **887/887**; migrations 001→048 clean; all 8 grant files clean; migration head
**048**; no migration 049; CLT-01 error catalogue **44**, IAM-02 permissions **33**, tables
**18**, route registrations **69** — all unchanged from Phase 4A.2A. KYC-01 error catalogue now
**23** (+1, `KYC1_APPLICATION_INVALID_STATE`); KYC-01 audit-event inventory now **21** (+1,
`kyc1.roster_sync_processed`); KYC-01 route handlers now **17** (+1); KYC-01 tables unchanged
**6**; KYC-01 IAM-02 `kyc1.*` permissions unchanged **2**; no `role_permission` seed; KYC-01
grants unchanged.

**2 Low** (non-blocking, both independently proven correct by adversarial probe despite lacking a
dedicated implementation-suite test): roster-sync's own audit-failure rollback (`REVOKE INSERT` on
the outbox → `KYC1_AUDIT_REQUIRED`, zero case/checklist rows survive, clean retry) and the
handoff-versus-roster-sync `23505` race (whole transaction rolls back atomically, no orphan
checklist/audit, retry converges) — coverage housekeeping only. `primary_anchor_present` may
report `true` when both an individual and an entity primary case exist for one application —
informational-response-only, sync makes no compliance decision, and publication still correctly
refuses `anchor_ambiguous`.

**4 Informational**: the pre-existing held-state dead end (no resume/unhold transition anywhere)
remains a separate, unrelated CLT-01 lifecycle carry-forward, untouched by this phase; the KYC-01
handoff route's relative audit ordering (`handoff_received` before `case_created`) is preserved
but its exact SQL statement position changed during the shared-service extraction (comment wording
imprecise only, no behavioural difference); the combined-role E2E fixture proves the full
route/business workflow but not cross-schema grant isolation on its own — the dedicated KYC-01
grant-boundary tests under the real `role_kyc1_runtime` role remain the authority for that;
`entity_type="roster_sync"` is the first KYC-01 audit `entity_type` with no corresponding physical
table, safely permitted by SEC-01's free-form `entity_type` field.

**CLT-01 — accepted core implementation (Phases 0-9) plus accepted Phase 4A KYC roster
prerequisite, accepted Phase 4A.1 atomic KYC roster binding, accepted Phase 4A.2A pre-approval
authorised-party capture, and accepted coordinated Phase 4A.2B KYC anchor-sync integration.**
CLT-01 remains a completed module. **D1 (authorised-party-roster-completeness) — closed.**
Technical roster-binding consistency is enforced. Pre-approval authorised-party capture is
operational. Deterministic KYC anchor creation is operational. One complete organic CLT-to-KYC
workflow — application creation, submission, review, authorised-party capture, KYC roster sync,
KYC evidence and outcome, roster-bound publication, atomic delivery, and final approval — is
proven end to end with no raw-SQL authorised-party or KYC-case seeding. D1 is closed. Phase
4A.2B is accepted. The next implementation task must be selected from the remaining approved
module roadmap.
