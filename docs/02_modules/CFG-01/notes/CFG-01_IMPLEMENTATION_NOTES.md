# CFG-01 Feature Flag / Licence Lock — Implementation Notes

Module: **CFG-01 Feature Flag / Licence Lock**
Blueprint: `aix-platform-docs/modules/CFG-01_Feature_Flag_Licence_Lock_Blueprint_Pack_v1.1/`
Implementation status: **Phase 0 scaffold — ACCEPTED implementation baseline.** A Sonnet
self-review pass found no defects (no patches applied); an independent Opus review returned
**ACCEPT**, zero Critical/High/Medium/Low findings, with every claim in this document
independently re-verified from source (not rubber-stamped) — see §11 below. `MODULE_STATUS.md`
and `PROJECT_HANDOVER.md` (sibling `aix-platform-docs` workspace) have been updated accordingly.

**Approved phase plan** (per the CFG-01 Phase 0 planning session): Phase 0 scaffold (this
document) → Phase 1 core registries + hash-sealed baseline → Phase 2 runtime decision engine →
Phase 3 feature/licence change workflow + kill-switch → Phase 4 deployment gate +
reconciliation → Phase 5 audit-outage handling, evidence export, Exchange activation ceremony
structure.

---

## 1. Scope implemented (Phase 0 — scaffold only)

New service `services/cfg1` (`@aix/service-cfg1`), scaffolded as `services/iam2`'s and
`services/sec1`'s own copy (Fastify 5, TypeBox, `removeAdditional: false` override, log
redaction, request-context plugin, CFG-01's own interim internal-identity guard, boot-time
`assertNoExchangeRuntime`). F3(c) import-boundary test proves `services/cfg1/src/**` never
imports `services/iam/src/**`, `services/iam2/src/**`, `services/sec1/src/**`, or
`services/fnd/src/**`, and only ever imports `@aix/foundation` via its bare public specifier.

**No database work this phase**: no `cfg1` schema, no `role_cfg1_runtime`, no migration, no
grants file. CFG-01 has zero tables and issues zero SQL queries this phase.

**One route only**: `GET /internal/cfg1/health` — unauthenticated liveness check (`{status:
"alive"}`, standard success envelope), mirroring FND-01's `GET /foundation/health` exactly. No
`/internal/cfg1/ready` this phase — FND-01's own `/foundation/readiness` is DB-backed (pings
the database, checks the audit outbox); CFG-01 has nothing meaningful to check readiness
against until Phase 1 introduces `cfg1.*` tables. Deferred to that phase, matching FND-01's own
precedent of reporting `not_configured` rather than a false `pass` for a dependency that
doesn't exist yet.

**No business logic anywhere**: no `/features/evaluate`, no `/verify-decision`, no
licence-profile/feature-state/kill-switch/exchange-activation/deployment-gate/reconciliation/
evidence-export routes. No decision engine, no decision tokens, no config mutation workflow.

## 2. Files added

```
services/cfg1/package.json
services/cfg1/tsconfig.json
services/cfg1/src/index.ts
services/cfg1/src/server.ts
services/cfg1/src/config.ts
services/cfg1/src/lib/errors.ts
services/cfg1/src/plugins/request-context.ts
services/cfg1/src/plugins/internal-identity.ts
services/cfg1/src/routes/system.ts
```

Root wiring (both additive, no unrelated content touched):
- `tsconfig.json` — added `{ "path": "./services/cfg1" }` to `references`.
- `package.json` — added `dev:cfg1`/`start:cfg1` scripts, mirroring `dev:sec1`/`start:sec1`.

Tests added (all under `tests/unit/`, no DB required):
```
tests/unit/cfg1-import-boundary.test.ts
tests/unit/cfg1-app.test.ts
tests/unit/cfg1-internal-identity.test.ts
tests/unit/cfg1-config.test.ts
tests/unit/cfg1-log-redaction.test.ts
tests/unit/cfg1-no-exchange.test.ts
```

`.env.example` was **not** touched — neither IAM-02's nor SEC-01's own internal-service-token
vars were ever added there either (only FND-01/IAM-01 are documented), so CFG-01 follows the
same (pre-existing, not newly introduced) gap rather than being the first to diverge from it.

## 3. Config / internal guard

`services/cfg1/src/config.ts`'s `loadCfg1Config` reuses `@aix/foundation`'s `loadConfig` for
the shared fail-closed baseline (`ENVIRONMENT`/`DATABASE_URL`/`PORT`/minimum-length token), then
layers exactly one CFG-01-specific field: `CFG1_INTERNAL_SERVICE_TOKEN` →
`cfg1InternalServiceToken`. Missing/blank/too-short token throws `CONFIGURATION_INVALID` and
aborts startup, same as every prior service. No cross-service HTTP dependency (IAM-02 permission
guard, SEC-01 audit ingestion) is configured yet — no Phase 0 route calls out to either, so no
`*_BASE_URL`/`*_INTERNAL_SERVICE_TOKEN` pair for a downstream service was added; those seams
will be introduced in the phase that first needs them (mirrors SEC-01 only adding
`IAM02_BASE_URL`/`IAM02_INTERNAL_SERVICE_TOKEN` in its own Phase 4, not its Phase 0).

`services/cfg1/src/plugins/internal-identity.ts`'s `makeCfg1InternalIdentityGuard` is CFG-01's
own copy of the same constant-time-comparison (`crypto.timingSafeEqual`) shared-token guard
every prior service carries. Fails closed (`SERVICE_IDENTITY_REQUIRED`, 401) on a missing,
blank, or wrong `x-internal-service-token` header. No route in Phase 0 actually mounts this
guard (the one route, health, is deliberately public) — it is proven correct via a scratch
Fastify harness built inside `tests/unit/cfg1-internal-identity.test.ts` (never shipped),
ready for Phase 1+ routes to use directly.

## 4. No-Exchange guard

`buildApp()` calls the shared `assertNoExchangeRuntime` (from `@aix/foundation`, unchanged)
over the registered route table after `app.ready()`, exactly as every prior service does. With
only `/internal/cfg1/health` registered, this trivially passes. Proven in
`tests/unit/cfg1-app.test.ts` (clean boot + route-table scan for any `"exchange"` fragment) and
`tests/unit/cfg1-no-exchange.test.ts`, which additionally proves the shared guard's substring
match would genuinely catch a **future** literal route from CFG-01's own blueprint (Phase 5's
deferred `/cfg1/exchange-activation-ceremonies/*` surface) if a later phase ever registered one
as a real Fastify route — not just that the generic mechanism works on synthetic examples.

## 5. Error catalogue

`services/cfg1/src/lib/errors.ts` defines a `Cfg1Error` class shaped identically to
`Iam2Error`/`Sec1Error`, but its `CFG1_ERROR_CODES` catalogue is **deliberately empty this
phase** — no CFG-01-specific code has a route that can throw it yet (the one route, health,
throws nothing). This follows the same "only add codes this stage's routes can actually throw"
discipline IAM-02 and SEC-01 both documented for their own first-stage error catalogues. The
blueprint's `09_Error_Handling.md` codes (`CFG1_FEATURE_UNKNOWN`, `CFG1_LICENCE_LOCKED`,
`CFG1_CONFIG_INTEGRITY_FAILED`, ...) will be added starting with the phase that first builds a
route able to throw each one.

**Judgment call — no `CFG1_INTERNAL_UNAUTHORISED`/`CFG1_CONFIG_INVALID` codes were added**,
despite being named in the Phase 0 task brief as candidates. Every prior service's own guard/
config-loader failures reuse the **shared** `@aix/foundation` generic codes
(`SERVICE_IDENTITY_REQUIRED`, `CONFIGURATION_INVALID`) rather than a module-specific duplicate
for the identical semantic — this is deliberate platform-wide convention (a client integrating
with any AIX internal API only needs to know one code for "internal identity missing/wrong").
Introducing CFG-01-specific duplicates would fragment that shared vocabulary for no behavioural
benefit, so none were added. Boot-time Exchange-route detection likewise reuses the existing
`assertNoExchangeRuntime` mechanism (a plain `Error` that crashes startup before any HTTP
response exists) — no `CFG1_EXCHANGE_RUNTIME_FORBIDDEN` code was needed for it.

## 6. Approved Phase 0 design decisions (carried into implementation)

These were agreed before coding started and are recorded here as CFG-01's own carry-forward
list, not re-decided in this document:

1. **SoD seeding** — no `iam2.sod_rule` rows seeded from CFG-01 in Phase 0 (or at all this
   phase — CFG-01 has no migration yet). The highest-risk CFG-01 SoD rules will be considered
   in the Phase 3 change-workflow slice. IAM-02's own guard logic was not touched.
2. **Integrity seal** — no signing/KMS/PKI config or code exists yet. Phase 1 will use an
   interim sha256 hash-seal (no fake digital signature, no fake KMS/PKI) — flagged as a
   carry-forward for real signing/KMS, consistent with IAM-01's own interim
   passphrase-derived MFA key precedent.
3. **Exchange Activation Ceremony** — not built in Phase 0. When Phase 5 builds it, it must be
   a structural fail-closed placeholder that cannot activate any Exchange feature without real
   LFSA evidence (no fake evidence source), the same "interface stub, zero real path" discipline
   SEC-01 used for its external WORM/TSA anchor.
4. **Audit-outage mode** — no literal `cfg1.audit_outage_mode` table/logic this phase. Early
   phases will rely on the existing FND transaction-coupled audit/outbox pattern (every module
   already durably enqueues its audit event in the same DB transaction as the decision,
   regardless of whether SEC-01's ingestion API is reachable) — a stateful outage tracker is
   only revisited if a live SEC-01 ingestion *dependency* (not just an audit event) appears in a
   later phase.
5. **Internal identity** — CFG-01 uses the same interim shared internal-token guard pattern as
   every other service (§3/§4 above). Documented as a carry-forward trust model, same class as
   IAM-02's own L3 and SEC-01's own F-5 ("should not slip" as more routes accumulate on top of
   it) — no final service-identity model was designed this phase.

## 7. Out-of-scope confirmation

No `cfg1` schema, table, migration, or grants file exists. No runtime decision engine, decision
token, config mutation workflow, kill-switch, IAM-02 catalogue registration, or SoD rule exists.
No CLT/KYC/AML/WLT/LED/DEP/WDR/TRD/E2E/REC/INC/PRT code was added. No Exchange runtime route,
order book, matching engine, market making, principal dealing, or AIX spread markup code exists
anywhere in `services/cfg1` — proven by the boot-time `assertNoExchangeRuntime` guard (same
mechanism every other service uses) plus a direct route-path/reason check in
`tests/unit/cfg1-no-exchange.test.ts` and `tests/unit/cfg1-app.test.ts`.

## 8. Tests added

- `tests/unit/cfg1-import-boundary.test.ts` (1 test) — F3(c), reuses the generic scanner from
  `iam-import-boundary.test.ts`.
- `tests/unit/cfg1-app.test.ts` (6 tests) — clean boot, no-Exchange route surface, only-the-
  health-route-exists (explicit forbidden-substring check against every later-phase business
  route name), health envelope shape, request/correlation-id propagation, 404 envelope.
- `tests/unit/cfg1-internal-identity.test.ts` (5 tests) — missing/wrong/blank/correct token,
  plus a length-boundary case, via a scratch Fastify harness (never shipped) mounting the real
  guard function.
- `tests/unit/cfg1-config.test.ts` (6 tests) — valid load, missing/blank/too-short token all
  fail closed with `CONFIGURATION_INVALID`, shared baseline (`DATABASE_URL`) still enforced.
- `tests/unit/cfg1-log-redaction.test.ts` (2 tests) — `CFG1_LOG_REDACT_PATHS` contains the
  internal-token header path and nothing else this phase.
- `tests/unit/cfg1-no-exchange.test.ts` (4 tests) — proves the shared guard would catch a
  CFG-01-blueprint-shaped Exchange route (the deferred Phase 5 ceremony API) if one were ever
  registered, not just synthetic examples.

**29 new tests, all unit-level, no DB required.**

## 9. Verification performed

`npx tsc -b` — clean across all workspaces (`packages/foundation`, `services/fnd`,
`services/iam`, `services/iam2`, `services/sec1`, `services/cfg1`).

Full suite run twice:
1. With no `TEST_DATABASE_URL` set — all CFG-01 and other unit tests pass; the three DB-gated
   integration test files (`iam-db`, `iam2-db`, `sec1-db`) either skip cleanly or (for
   `sec1-db.test.ts` specifically, a pre-existing behaviour unrelated to this change) fail one
   deliberate "you forgot to configure a test database" assertion when an ambient, unmigrated
   local Postgres happens to be reachable. Traced to `sec1-db.test.ts`'s own `schemasExist()`
   check, not to anything in this change.
2. **Against a genuinely fresh, disposable Postgres** (`aix_cfg1_phase0_verify`, dropped after
   use, along with its four test `LOGIN` roles) — migrations `001`→`013` applied
   (`--no-check-order up`), all four existing grant files applied
   (`fnd`/`iam`/`iam2`/`sec1_runtime_grants.sql`), `TEST_DATABASE_URL` + the three
   `SEC1_INGEST_TOKEN_*` env vars set to the exact values `sec1-db.test.ts` itself expects:

   ```bash
   npx node-pg-migrate -m infra/migrations --no-check-order up   # 001 -> 013, all clean
   psql "$DATABASE_URL" -f infra/grants/fnd_runtime_grants.sql
   psql "$DATABASE_URL" -f infra/grants/iam_runtime_grants.sql
   psql "$DATABASE_URL" -f infra/grants/iam2_runtime_grants.sql
   psql "$DATABASE_URL" -f infra/grants/sec1_runtime_grants.sql
   npx tsc -b                                                     # clean
   npx vitest run                                                 # 39 files, 505/505 passing
   ```

   **Result: 39 test files, 505/505 tests passing, 0 failures** — the pre-existing 476-test
   baseline (FND-01 44 + IAM-01/IAM-02/SEC-01 through Phase 5) unregressed, plus the 29 new
   CFG-01 Phase 0 tests. No CFG-01 migration or schema change exists (Phase 0 uses none), so no
   new migration ran beyond the pre-existing `001`→`013`.

   Disposable database and its four test `LOGIN` roles (`fnd_app_test`, `iam_app_test`,
   `iam2_app_test`, `sec1_app_test`) were dropped after the run; confirmed via `\l` that no
   trace remains.

No migration was added for CFG-01 (Phase 0 has no schema); the `001`→`013` sequence above is
entirely pre-existing FND-01/IAM-01/IAM-02/SEC-01 migrations, applied only to stand up a valid
verification environment for the full suite.

## 10. Next phase recommendation

**Phase 1 — core registries and hash-sealed baseline**: `cfg1` schema, `role_cfg1_runtime`,
`licence_profile`/`feature`/`prohibited_feature`/`feature_version`/`config_integrity_seal`
tables, seeding the Money-Broking/PSO-approved + Exchange-pending licence profiles and the full
19-code prohibited-feature registry, interim sha256 hash-seal (per §6.2 above). Follows the same
discipline as every prior phase of every prior module: a PLANNING pass (Sonnet, no code) before
implementation, then Sonnet implementation + self-review, then an independent Opus review before
acceptance.

## 11. Independent Opus review — ACCEPT

A Sonnet self-review pass (line-by-line trace of every Phase 0 file against the approved scope
and design decisions) found **no defects** and applied no patches. The independent Opus review
that followed re-derived every claim from source rather than trusting either report: re-ran
`tsc -b` clean; re-ran the full suite from scratch against a genuinely fresh disposable Postgres
(migrations 001→013 + all four existing grant files applied, dropped after use) —
**505/505 tests passing, exactly reproducing the self-reported number**; ran independent static
sweeps (import-boundary grep, Exchange-fragment grep, migration/grants filesystem search) with
no reliance on the test suite alone; specifically traced the internal-identity guard's
`request.ctx.actor_id` handling end-to-end and confirmed no client-supplied header can ever
reach it before the guard's fixed-value fallback applies.

**Verdict: ACCEPT CFG-01 Phase 0 — zero Critical/High/Medium/Low findings.** Two informational
(non-blocking) observations were noted, both already carried forward in §6 above: the interim
shared-token trust model, and the log-redaction list extending as business fields appear.

**CFG-01 Phase 0 is an accepted implementation baseline.** `MODULE_STATUS.md` and
`PROJECT_HANDOVER.md` (sibling `aix-platform-docs` workspace) have been updated to reflect this.
Next: a Phase 1 planning pass (Sonnet, no code) before Phase 1 implementation begins.

---

## 12. Phase 1 implemented — core registries + sealed baseline

Phase 1 implementation status: **ACCEPTED implementation baseline.** A Sonnet self-review pass
found one documentation-only defect (a stale header comment in `server.ts`, patched — no
functional defects); an independent Opus review returned **ACCEPT**, zero Critical/High/Medium
findings, with every claim independently re-verified from source (fresh disposable Postgres,
direct `SET ROLE role_cfg1_runtime` grant-boundary proofs, direct SQL inspection of all seed
data, empirical `localeCompare`-vs-codepoint determinism check) — see §12.11 below.
`MODULE_STATUS.md`/`PROJECT_HANDOVER.md`/`SESSION_START_PROMPT.md` (sibling
`aix-platform-docs` workspace) have been updated accordingly.

### 12.1 Schema, tables, grants

Migration `infra/migrations/014_cfg1_core.cjs` creates schema `cfg1` and exactly the 5 tables
the approved Phase 1 scope covers: `licence_profile`, `feature`, `prohibited_feature`,
`feature_version`, `config_integrity_seal`. No `feature_state_change`, decision-engine,
kill-switch, deployment-gate, reconciliation, or Exchange-activation-ceremony tables — all
explicitly deferred to later phases, mirroring how `008_sec1_core.cjs` phased SEC-01's own
schema.

`infra/grants/cfg1_runtime_grants.sql` creates `role_cfg1_runtime` (`NOLOGIN`) with **SELECT
only** on all 5 tables — no INSERT/UPDATE/DELETE/TRUNCATE anywhere, no grant into
`foundation`/`iam`/`iam2`/`sec1`. This is also Phase 1's structural-immutability mechanism for
`prohibited_feature` (approved decision #15): a `role_cfg1_runtime`-connected caller cannot
mutate the prohibited registry even if a future bug introduced a code path that tried to — the
DB itself refuses it, proven directly under the real runtime role in
`tests/integration/cfg1-db.test.ts` (Postgres error code 42501 on every attempted
INSERT/UPDATE/DELETE), the same proof pattern every prior module's own grant-boundary tests use.

**Documentation-artifact judgment calls (approved before coding):** the blueprint's
`05_Database_Design.md` §2.1 lists `signature_ref` and `doc00_baseline_hash` twice each on
`licence_profile`, and both `registry_hash`/`config_hash` as separate near-identical columns —
each is defined exactly once (`config_hash` chosen over `registry_hash`). `evidence_verification_
source`, `evidence_verified_by`, `effective_from_utc`, `effective_to_utc` (present in the
blueprint's full column list) are deliberately not added — nothing in Phase 1 populates or reads
them; added only when a real caller needs them (Phase 5's ceremony or a licence-profile-change
workflow).

**Structural "at most one active seal per scope" invariant:** a partial unique index,
`cfg1_config_integrity_seal_one_active_per_scope ON cfg1.config_integrity_seal (config_scope)
WHERE status = 'active'` — the DB itself cannot hold two simultaneously-active seals for one
scope, independent of any application check. Proven in two layers in
`tests/integration/cfg1-db.test.ts`: (1) a direct duplicate-active INSERT attempt fails with
Postgres error 23505 (unique_violation); (2) the index is deliberately dropped, a duplicate
active row inserted, and the readiness route's own `seal_duplicate_active` check is proven to
still fail closed — genuine defense-in-depth per blueprint §5.4A rule 6 ("migration/DBA/infra
writes must not become trusted until reconciled"), not dead code.

### 12.2 Reconciled prohibited-feature registry — 30 codes (not 31)

**Correction to the Phase 1 planning output:** the Phase 1 plan proposed and labelled this "the
31-code reconciled registry," but the actual enumerated list — both in that plan and in the
subsequent approval — contains exactly **30** distinct codes. This was a genuine miscount in the
planning message, not a discrepancy the user introduced. The migration's own structural
self-check (`if (DOC00_PROHIBITED_FEATURES.length !== 30) throw ...`) caught this immediately
during the first verification run (it failed loudly with "found 30", not silently seeding an
incomplete registry) — the label has been corrected everywhere (migration, vendored baseline
constant, tests, this document); the enumerated code list itself was never in question. All 30
codes are seeded `active`, reconciling blueprint `07_Permission_Rules.md` §7's original 19 with
`00_Licence_Scope_And_Feature_Lock_v1.3.md` §8/§9.2-derived additions (securities, investment
advice, self-custody, lending, derivatives, margin, staking, yield, internal fallback pricing,
internal inventory, synthetic liquidity).

`applies_until`: the 5 codes genuinely locked only because Exchange approval is pending
(`exchange.public_order_book`, `.matching_engine`, `.client_to_client_matching`,
`.public_exchange_trading`, `.public_market_depth`) use `until_formal_exchange_licence_approval`.
Every other code — including `exchange.market_maker`/`exchange.principal_dealing`, which share
the `exchange.*` namespace — uses `permanent`, since Doc00 §4.1/§8.1 and Master System Rules
LIC-RULE-003 frame market-making/principal-dealing as permanent MB-module-inherent restrictions
that would not lapse on Exchange approval, a deliberate distinction documented inline.

### 12.3 Licence-profile seed — layered Exchange enforcement

Exactly 3 rows: `MB` approved/LFSA, `PSO` approved/LFSA, `EXCHANGE` pending/LFSA. Per the
approved design, Exchange `pending` status is **not** the primary enforcement mechanism — three
independent layers keep Exchange non-runtime-active: (1) the licence_status itself; (2) every
Exchange-shaped feature code is *separately* hard-blocked in `prohibited_feature` regardless of
licence status (prohibited ≠ ordinary licence-gated flag — only a future Exchange Activation
Ceremony can ever remove one); (3) `assertNoExchangeRuntime`'s boot-time route-table scan
(Phase 0), independent of DB state entirely. All three proven in
`tests/integration/cfg1-db.test.ts`.

### 12.4 Integrity seal / vendored Doc00 baseline

`services/cfg1/src/lib/doc00-baseline.ts` — a vendored, in-repo canonical extraction of Doc00
v1.3's licence-status and prohibited-scope facts (`DOC00_SOURCE_VERSION = "v1.3"`,
`DOC00_LICENCE_PROFILES`, `DOC00_PROHIBITED_FEATURES`, `computeDoc00BaselineHash()`).
Deliberately does **not** hash the live `aix-platform-docs` markdown file at runtime (approved
decisions #3/#4) — no filesystem dependency on the sibling docs repo, immune to irrelevant
prose/formatting edits, kept in sync by hand when Doc00's licence facts actually change (same
"operator-managed" caveat every other cross-repo constant in this codebase already carries).

`services/cfg1/src/lib/canonical.ts` — CFG-01's own copy of the deterministic canonical-JSON +
sha256 algorithm (recursive lexicographic key sort, array order preserved), not imported from
`services/sec1/src/lib/canonical.ts` (F3(c)). Hash format is `sha256:`-prefixed, per CFG-01's own
blueprint's documented example (`04_API_Specification.md` §2.1), not SEC-01's bare-hex
convention.

`services/cfg1/src/lib/integrity-seal.ts` — explicit allow-list hash computation per scope
(`licence_profile`, `prohibited_registry`), excluding mutable/runtime-only columns
(`created_at_utc`, `updated_at_utc`, `last_integrity_check_utc`) so a read-only readiness call
could never invalidate its own seal. `evaluateScopeSeal` fails closed on all three bad states —
missing seal, duplicate active seal, hash mismatch — never silently picks "the first matching
seal."

`infra/migrations/014_cfg1_core.cjs` duplicates the canonical-JSON algorithm and both baseline
constants inline in plain JS (a migration cannot import TypeScript service source without a
build step). The two copies are proven to agree — not merely asserted — by
`tests/integration/cfg1-db.test.ts`'s readiness tests, which recompute every hash through the
TypeScript library and compare against exactly what the migration seeded.

**No fake KMS/PKI/digital signature (approved decisions #6-#10, carry-forward):** `signed_by`,
`signature_ref`, `approval_id` are left `NULL` on every seed row — nothing that could look like a
real signature. This is a **detection-only** interim seal: it catches out-of-band drift (a
migration/DBA edit that touches the data but forgets to also update the seal) but does **not**
defend against a DB-write-capable attacker who could rewrite the seal to match tampered data.
Real signing/KMS remains deferred and must stay a loud, visible carry-forward into every future
phase, not something silently treated as already solved.

### 12.5 Readiness route

`GET /internal/cfg1/readiness` (extends `services/cfg1/src/routes/system.ts`) recomputes both
sealed scopes' hashes and compares against the active `config_integrity_seal` rows. **Readiness,
not boot-time hard-fail** (approved decision #13) — `assertNoExchangeRuntime` remains the only
boot-time throw; a transient DB hiccup during startup must not crash the process, mirroring
FND-01's own `licence_lock_interface` precedent. Response is deliberately minimal: `{scope,
status, reason}` only per check — **never** raw licence/prohibited row content, and **never**
the computed or stored hash values (this data is classified Restricted/Security-Critical per
`16_Data_Classification.md`, and no IAM-02 read-guard exists yet to gate a real inspection
route). Unauthenticated, same rationale as `/health` — an orchestration probe must not need a
secret to ask "are you healthy." Does **not** replace Phase 2's real per-decision integrity check
(approved decision #14, blueprint §5.4A rule 3) — this is early operational visibility only.

### 12.6 Files changed

```
infra/migrations/014_cfg1_core.cjs                        (new)
infra/grants/cfg1_runtime_grants.sql                       (new)
services/cfg1/src/lib/doc00-baseline.ts                    (new)
services/cfg1/src/lib/canonical.ts                         (new)
services/cfg1/src/lib/integrity-seal.ts                    (new)
services/cfg1/src/routes/system.ts                         (extended — readiness route)
tests/unit/cfg1-canonical.test.ts                          (new)
tests/unit/cfg1-doc00-baseline.test.ts                     (new)
tests/unit/cfg1-integrity-seal.test.ts                     (new)
tests/unit/cfg1-app.test.ts                                (extended — readiness fail-closed/no-leak tests)
tests/integration/cfg1-db.test.ts                          (new)
```

### 12.7 Tests added

Unit (no DB, 24 new tests across 3 new files + 2 added to `cfg1-app.test.ts`): canonical-JSON
key-order/array-order/tamper-sensitivity; Doc00 baseline constant shape (3 licence facts, 30
prohibited codes matching the approved list exactly, no duplicates, correct `applies_until`
split); scope-hash order-independence/tamper-sensitivity; `evaluateScopeSeal`'s all four
outcomes (pass, missing, duplicate, mismatch); readiness fails closed (503) with no DB pool
initialised; readiness response never contains raw registry content or hash values.

Integration (DB-gated, `role_cfg1_runtime` via a real `LOGIN` role from the start — S1 lesson
applied from day one, 16 new tests): boot + no-Exchange under the runtime role; F3(a)-equivalent
cross-schema isolation (denied on foundation/iam/iam2/sec1, allowed on cfg1); INSERT/UPDATE/
DELETE denied on all 5 tables; exact 3-row licence_profile seed content; exact 30-row active
prohibited_feature seed content; layered Exchange enforcement (pending status + 7 separately
hard-blocked exchange.* codes); exact 2-row active seal seed; `feature`/`feature_version` empty;
migration/library hash agreement; readiness clean-state 200; out-of-band tamper detection on
both scopes (503 hash_mismatch); missing active seal (503 seal_missing); duplicate active seal
both structurally blocked (23505) and, with the constraint deliberately defeated, still caught at
the application layer (503 seal_duplicate_active).

### 12.8 Verification performed

`npx tsc -b` clean across all workspaces. Full suite run against a genuinely fresh disposable
Postgres (`aix_cfg1_p1_verify`, dropped after use along with its five test `LOGIN` roles):

```bash
npx node-pg-migrate -m infra/migrations --no-check-order up   # 001 -> 014, all clean
psql "$DATABASE_URL" -f infra/grants/fnd_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam2_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/sec1_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/cfg1_runtime_grants.sql
npx tsc -b                                                     # clean
npx vitest run                                                 # 43 files, 547/547 passing
```

**Result: 43 test files, 547/547 tests passing, 0 failures** — the pre-existing 505-test baseline
(476 platform baseline + 29 CFG-01 Phase 0) unregressed, plus 42 new Phase 1 tests. `tsc -b`
clean. Disposable database and its five test `LOGIN` roles dropped after the run; confirmed via
`\l` that no trace remains.

### 12.9 Out-of-scope confirmation

No runtime feature-decision endpoint, no verify-decision endpoint, no decision tokens, no
mutation workflow, no kill-switch, no IAM-02 permission registration, no SEC-01 audit
integration, no SoD rules, no Exchange Activation Ceremony, no `audit_outage_mode`, no
deployment gate, no reconciliation, no evidence export, no business-module logic. No
CLT/KYC/AML/WLT/LED/DEP/WDR/TRD/E2E/REC/INC/PRT code. No Exchange runtime, order book, matching
engine, market making, principal dealing, or AIX spread markup code anywhere — re-proven by
`assertNoExchangeRuntime` at boot (unchanged from Phase 0) plus the layered licence-profile/
prohibited-feature seed data itself being the enforcement mechanism, not a runtime capability.

### 12.10 Sonnet self-review

Line-by-line trace of every Phase 1 file against the approved scope and design decisions found
**one documentation-only defect**: `server.ts`'s header comment still said "Phase 0 scaffold
only" / "the one Phase 0 route (health)," inaccurate after Phase 1 added the readiness route.
Patched (comment only, no logic change). No functional defects found. Independently re-ran
`tsc -b` and the full suite against a fresh disposable Postgres (migrations 001→014 + all 5
grant files) — 547/547 tests, reproducing the implementation pass's own number.

### 12.11 Independent Opus review — ACCEPT

The independent Opus review re-derived every claim from source rather than trusting either
report: re-ran `tsc -b` clean; re-ran the full suite from scratch against a genuinely fresh
disposable Postgres — **547/547 tests, exactly reproducing the self-reported number**; ran
static import-boundary and no-Exchange greps independently of the test suite; **directly tested
grant boundaries via `SET ROLE role_cfg1_runtime`** (not only through the test harness) —
SELECT allowed, INSERT/UPDATE/DELETE denied (42501), `iam2`/`sec1`/`foundation.outbox_event`/
`foundation.idempotency_record` all denied at the schema level; independently inspected all
seed data via direct SQL and diffed the seeded 30 prohibited-feature codes against the approved
list (exact match); empirically confirmed `localeCompare` row-ordering currently matches
codepoint order for the seeded data (so no live defect), while flagging the locale-sensitivity
itself as a carry-forward before Phase 2 depends on it.

**Verdict: ACCEPT CFG-01 Phase 1 — zero Critical/High/Medium findings.** Two Low,
non-blocking observations were raised (both already carried forward in §12.4 above and in
`MODULE_STATUS.md`): **F-1** locale-sensitive `localeCompare` seal row-ordering should become
codepoint-based before Phase 2's decision-time checks depend on it; **F-2** Phase 2's
decision-time integrity check must verify DB-to-vendored-Doc00 agreement (including
`doc00_source_version`), not only the DB-to-seal internal consistency Phase 1's readiness
performs.

**CFG-01 Phase 1 is an accepted implementation baseline.** Next: a Phase 2 planning pass
(Sonnet, no code) — runtime feature decision engine (`POST /internal/cfg1/features/evaluate` +
`verify-decision`, decision tokens, SEC-01 audit integration for decisions) — before Phase 2
implementation begins, incorporating F-1/F-2 as part of or immediately before the decision-time
integrity check work.

---

## 13. Phase 2 implemented — runtime decision engine + decision tokens

Phase 2 implementation status: **ACCEPTED implementation baseline after independent Opus
review.** See §13.14 for the Opus review outcome.

### 13.1 F-1 closed — locale-independent row ordering

`services/cfg1/src/lib/canonical.ts` gained `codePointCompare(a, b)`, a plain three-way
codepoint comparator (`a < b ? -1 : a > b ? 1 : 0`) — host-collation-independent, unlike
`String.prototype.localeCompare` (ICU-backed, can differ across OS/Node/locale configuration).
`services/cfg1/src/lib/doc00-baseline.ts`'s `computeDoc00BaselineHash()` and
`services/cfg1/src/lib/integrity-seal.ts`'s `computeLicenceProfileScopeHash`/
`computeProhibitedRegistryScopeHash` all now sort with `codePointCompare` instead of
`localeCompare`. `infra/migrations/015_cfg1_decision_engine.cjs` carries a byte-identical inline
copy of the same comparator (migrations cannot import TypeScript service source) and uses it to
**re-verify, not rewrite**, Phase 1's already-seeded seal hashes against the real
`cfg1.licence_profile`/`cfg1.prohibited_feature` rows at migration time — `throw`s loudly with a
detailed mismatch list if the two orderings ever diverge, rather than silently leaving
`localeCompare`-computed seals in place. This ran clean on real Phase 1 seed data (no
divergence), confirming the Opus Phase 1 finding was latent, not an active defect — but the fix
closes the risk before Phase 2's decision-time check depends on ordering-stable hashes.

### 13.2 F-2 closed — decision-time DB-to-vendored-Doc00 agreement

`verifyDecisionTimeIntegrity()` (new, `integrity-seal.ts`) is a **stronger, additional** check
used only by the decision engine (`evaluateFeature`), never by the Phase 1 readiness route,
which keeps its original, unchanged `checkConfigIntegritySeals()` (DB-to-seal consistency only —
a deliberate, documented minimal-diff scoping decision, not an oversight). The new check runs,
per scope, in this order (first failure wins, fail closed):

1. Seal resolution (missing / duplicate-active) and DB-to-seal hash match — same as Phase 1.
2. The active seal's own `doc00_baseline_hash` must equal `computeDoc00BaselineHash()`
   freshly recomputed from the vendored `doc00-baseline.ts` constant right now.
3. The active seal's own `doc00_source_version` must equal `DOC00_SOURCE_VERSION`.
4. A direct, hash-free, field-by-field comparison of the **live DB rows** against the
   **vendored** `DOC00_LICENCE_PROFILES`/`DOC00_PROHIBITED_FEATURES` constants — never mediated
   through the seal at all.

Step 4 is what closes F-2: an attacker who rewrites both the registry rows and the seal's own
recomputed `config_hash`/`doc00_baseline_hash` to agree with each other still cannot pass this
check, because nothing in step 4 ever reads from the (in that scenario, already-tampered)
`config_integrity_seal` table. Proven by four targeted unit tests in
`tests/unit/cfg1-integrity-seal.test.ts`, each reproducing one of the required attack scenarios:
a stale `doc00_baseline_hash` with an otherwise-agreeing `config_hash`; a stale
`doc00_source_version`; a prohibited feature code removed from the live DB with the seal
recomputed to match the tampered (shrunk) registry; and the `EXCHANGE` licence profile flipped
to `approved` with the seal recomputed to match the tampered row. All four are caught.
`evaluateFeature()` runs this check **first, unconditionally**, before any precedence step —
documented in `lib/errors.ts`'s header comment as a deliberate reordering from the blueprint's
literal step-9 placement: nothing read from `cfg1.prohibited_feature`/`cfg1.licence_profile`
can be trusted for a decision unless the tables themselves have already passed this check.

### 13.3 Decision precedence chain

`services/cfg1/src/lib/decision.ts`'s `evaluateFeature()` implements the blueprint's
(`07_Permission_Rules.md` §6) 12-step precedence chain adapted honestly to what this codebase
structurally has today — documented step-by-step in the file's own header comment:

- **Live and reachable this phase:** prohibited-feature deny (step 1, highest precedence,
  distinguishes `exchange_pending_locked` from `prohibited` by `applies_until`); feature-state
  disabled deny (step 8); stale-requested-version deny (step 10, interpreted against
  `prohibited_registry_version` — the only real, security-critical version number Phase 2 has,
  since `feature_config_version` has no populated per-feature data yet); explicit allow (step
  11); default deny for any unrecognised `feature_code` (step 12, `unknown_fail_closed`).
- **Live but reachable only via synthetic test fixtures this phase** (approved decision #6):
  licence-lock deny (steps 2/3) and feature-state/allow (steps 8/11) — `cfg1.feature` stays
  empty in production seed (approved decision #5), so these paths only execute against
  test-inserted rows in `tests/integration/cfg1-db.test.ts`.
- **Structurally N/A, not merely unpopulated** (steps 4/5/6/7 — environment constraint,
  client-class constraint, kill-switch, dependency-not-ready): no schema column or table exists
  for any of these yet (`cfg1.feature` has no `environment_scope` column; no `cfg1.kill_switch`
  table). Documented as N/A rather than silently skipped.
- **Reordered to run first, not ninth** (step 9, config integrity): see §13.2 above.

### 13.4 Decision logging + audit integration

`logFeatureEvaluation()` (`decision.ts`) writes exactly one `cfg1.feature_decision_log` row per
`evaluate()` call and calls `@aix/foundation`'s `publishAudit` (transaction-coupled
outbox-insert, not a direct SEC-01 HTTP call — approved decision #9) on the **same**
`withTransaction` connection as the decision-log write and the decision logic itself. Both
outcome kinds are logged and audited, including an integrity-check failure — per blueprint
§5.4A rule 5, an out-of-band config tamper must itself raise a Critical SEC-01 alert, so
`logFeatureEvaluation` runs (and emits `cfg1.feature_evaluation.denied` **and**
`cfg1.integrity_check.failed`, both Critical) even on the `integrity_failed` outcome, rather
than short-circuiting before any audit trail exists. An ordinary decision emits
`cfg1.feature_evaluation.allowed`/`.denied`; a prohibited/`exchange_pending_locked` denial emits
an additional Critical `cfg1.prohibited_feature.blocked` event layered on top. `verify-decision`
emits `cfg1.feature_decision.verified`/`.rejected` on its own transaction, same pattern.

**Fail-closed on audit/outbox failure (approved decisions #10/#11):** both route handlers
(`routes/features.ts`) wrap their `withTransaction` call in a `try`/`catch` that converts
**any** failure inside the transaction — including the `publishAudit` outbox insert itself — into
a single `CFG1_AUDIT_REQUIRED` (503) outcome. No decision (allow, deny, or verified) is ever
returned to a caller without its decision-log row and audit/outbox event having durably
committed first. Learning directly from IAM-02's own documented bug
(`IAM-02_IMPLEMENTATION_NOTES.md` §6): the decision logic itself never throws from inside the
`withTransaction` callback for an ordinary deny/failure outcome (that would roll back the
callback's own writes) — it returns a structured `EvaluateOutcome`/verify result, and the
**route**, after the transaction has already committed, inspects that outcome and throws
`CFG1_CONFIG_INTEGRITY_FAILED` or the specific decision-token error code only then. Proven by an
integration test that revokes CFG-01's own `foundation.outbox_event` INSERT grant mid-test to
force the transaction to fail, and confirms both that the caller receives `CFG1_AUDIT_REQUIRED`
and that no orphaned `feature_decision_log` row exists afterward (row count unchanged
before/after the forced failure).

### 13.5 Decision tokens — bounded reuse, not single-use

`services/cfg1/src/lib/decision-token.ts` issues an opaque, base64url-encoded 32-byte random
token on every `allow` decision (`issueDecisionToken`); only its sha256 hash is ever persisted
to `cfg1.feature_decision_token` (approved decision #12 — proven by a unit test asserting the
raw token never appears in any INSERT parameter, and an integration test serializing the full
stored row and asserting the raw token is absent). The raw token is returned to the caller
exactly once and is on the `CFG1_LOG_REDACT_PATHS` redaction list (`server.ts`), so it can never
appear in request logs either (approved decision #13).

**Deliberately bounded-reuse, not single-use** (approved decision #1) — a departure from
IAM-02's own decision-token model, which consumes a token on first successful use. Safety under
reuse comes from re-checking everything on every `verify-decision` call (approved decision #2),
not from consumption:

1. Exact, null-safe binding-field match (`decision_id`, `feature_code`, `action`, `resource`,
   `caller_module`, `client_id`, `client_class`, `environment`) plus a recomputed
   `payload_hash` (defence in depth on top of the individual field checks) — checked from day
   one, directly modeled on IAM-02's own F1 finding (binding checked only after a live attack
   was reproduced) to avoid repeating it.
2. A fresh `verifyDecisionTimeIntegrity()` run on the same transaction before the token check —
   if the underlying config has failed integrity since issuance, verification fails closed
   regardless of the token itself.
3. The token's bound `prohibited_registry_version`/`prohibited_registry_hash` re-compared
   against the **current** values on every call — a registry change invalidates every
   outstanding token on its very next use, independent of whether it has nominally expired.

Any mismatch (binding or config-changed) revokes the token immediately (approved decision #3) —
a corrected retry with the same token can never succeed afterward. TTL is 5 minutes
(`DECISION_TOKEN_TTL_MS`), shorter than IAM-01's 10-minute step-up window and IAM-02's
12-minute decision-token TTL, deliberately more aggressive given the Phase 1 Opus review's own
observation that licence-lock/prohibited-feature state is more consequential to get stale than
an ordinary permission decision. Proven end-to-end in `tests/integration/cfg1-db.test.ts`: the
same token verifies successfully twice within its TTL (bounded reuse); a config-version bump
invalidates a still-unexpired token on its next verify; a mismatched binding field revokes the
token and a retry with the same (now-revoked) token fails with `CFG1_DECISION_TOKEN_REVOKED`,
not `CFG1_DECISION_BINDING_MISMATCH`, on the second attempt.

**`caller_module` remains a declared, not authenticated, field** (approved decisions #7/#8) —
the shared internal-service-token proves only "an approved internal caller," never which
module. Documented in `routes/features.ts`'s header comment as more load-bearing here than for
Phase 0/1's readiness route, since decision logs and audit trails now attribute real decisions
to a caller-supplied value any token-holder could spoof. Flagged as an unresolved carry-forward,
not solved this phase.

### 13.6 Endpoints

**`POST /internal/cfg1/features/evaluate`** — guarded by CFG-01's own internal-identity guard;
`additionalProperties: false` TypeBox body (`feature_code`, `action`, optional `resource`,
`environment` enum, optional `client_id`/`client_class`, `caller_module`,
optional `requested_config_version`). No `Idempotency-Key` required (approved decision #4 — a
decision is a legitimate answer, not a mutating request needing replay protection, mirroring
IAM-02's own `permission/check`). Never throws for an ordinary deny (prohibited, unknown,
feature-disabled, stale-revalidate) — returns `200` with `{decision, reason_code, feature_code,
feature_config_version, licence_profile_version, prohibited_registry_version,
prohibited_registry_hash, doc00_source_version, integrity_status, decision_id, decision_token,
expires_at_utc}`; `decision_token`/`expires_at_utc` are `null` for any non-allow outcome. Throws
`CFG1_CONFIG_INTEGRITY_FAILED` (503) when decision-time integrity fails,
`CFG1_AUDIT_REQUIRED` (503) on any transaction/audit-write failure, or
`CFG1_DECISION_ENGINE_UNAVAILABLE` (503) when the DB pool itself is unreachable (probed eagerly
via `assertPoolAvailable()` before the transaction even opens, so this is reported distinctly
from a generic `CFG1_AUDIT_REQUIRED`).

**`POST /internal/cfg1/features/verify-decision`** — same guard, same no-Idempotency-Key
decision. By contrast to `evaluate`, **throws on every non-success outcome** — mirrors IAM-02's
`execute-verify` rather than `permission/check`, since this endpoint gates a binary "can I
proceed using this decision" question. Re-runs `verifyDecisionTimeIntegrity()` fresh (throwing
`CFG1_CONFIG_INTEGRITY_FAILED` if it now fails, independent of whether it passed at issuance
time), then `verifyDecisionToken()`, throwing the specific `CFG1_DECISION_TOKEN_INVALID` /
`_EXPIRED` / `_REVOKED` / `CFG1_DECISION_BINDING_MISMATCH` code on failure. On success, returns
`200` with `{verified: true, decision_id, feature_code, token_id}`.

### 13.7 Error catalogue additions

`services/cfg1/src/lib/errors.ts` grew from an empty catalogue (Phase 0/1) to 8 codes:
`CFG1_CONFIG_INTEGRITY_FAILED` (503), `CFG1_FEATURE_DENIED` (403 — catalogued per the blueprint
but not currently thrown by any Phase 2 path, since ordinary denials are 200 decision reports,
the same "defined but not yet reachable" class as IAM-02's own `IAM2_ROLE_UNKNOWN`),
`CFG1_DECISION_TOKEN_INVALID`/`_EXPIRED`/`_REVOKED` (409 each, kept distinct so operators can
tell "never existed" apart from "existed, then expired" apart from "existed, then got revoked
by a mismatch"), `CFG1_DECISION_BINDING_MISMATCH` (409), `CFG1_AUDIT_REQUIRED` (503),
`CFG1_DECISION_ENGINE_UNAVAILABLE` (503). Guard/config/boot failures continue reusing the
shared `@aix/foundation` generic codes unchanged (no `CFG1_INTERNAL_UNAUTHORISED` duplicate).

### 13.8 Migration, schema, grants

`infra/migrations/015_cfg1_decision_engine.cjs` (the first async migration in this codebase —
`pgm.db.query` confirmed as a real API from `node-pg-migrate`'s own type declarations before
use) creates exactly two tables, both scoped to `cfg1`:

- **`feature_decision_log`** (23 columns) — append-only decision evidence: full binding
  context, `decision`/`reason_code`, the resolved `feature_config_version`/
  `licence_profile_version`/`prohibited_registry_version`/`prohibited_registry_hash`/
  `doc00_source_version`, `integrity_status`, `payload_hash`, `audit_event_ref`, request/
  correlation IDs, timestamps. Indexed on `(feature_code, occurred_at_utc)` and
  `(correlation_id)`.
- **`feature_decision_token`** (21 columns) — `decision` CHECK constrained to `allow` only
  (deny outcomes never issue a token, enforced structurally, not just by application logic);
  `status` CHECK constrained to `active`/`revoked` only (no `expired`/`consumed` — expiry is
  derived at verify-time from `expires_at_utc`, and bounded-reuse tokens are never
  "consumed"). Indexed on `decision_id`, `feature_code`, `expires_at_utc`, `status`.

Also performs the F-1 re-verification described in §13.1, against the real Phase 1 seed data,
as part of `up`.

`infra/grants/cfg1_runtime_grants.sql` gained: `GRANT SELECT, INSERT ON
cfg1.feature_decision_log` (append-only, same posture as `sec1.audit_event`); `GRANT SELECT,
INSERT, UPDATE ON cfg1.feature_decision_token` (UPDATE narrowly for the lifecycle columns a
bounded-reuse token legitimately changes — `status`, `revoked_at_utc`, `revoked_reason`,
`last_verified_at_utc` — never DELETE/TRUNCATE); and CFG-01's **first cross-schema grant**,
`GRANT USAGE ON SCHEMA foundation` + `GRANT INSERT ON foundation.outbox_event`, needed because
Phase 2 is the first phase that calls `publishAudit`. Explicitly no
`foundation.idempotency_record` grant (approved decision #4) and no `iam2`/`sec1` grant (no
IAM-02 permission registration, no direct SEC-01 ingestion this phase) — asserted by the
existing F3(a)-equivalent cross-schema isolation test in `tests/integration/cfg1-db.test.ts`.
Phase 1's 5 tables remain unchanged, SELECT-only.

### 13.9 Files changed

```
infra/migrations/015_cfg1_decision_engine.cjs              (new)
infra/grants/cfg1_runtime_grants.sql                        (extended — Phase 2 tables + foundation.outbox_event)
services/cfg1/src/lib/canonical.ts                          (extended — codePointCompare, F-1)
services/cfg1/src/lib/doc00-baseline.ts                     (extended — F-1 ordering fix)
services/cfg1/src/lib/integrity-seal.ts                     (extended — F-1 ordering fix + verifyDecisionTimeIntegrity, F-2)
services/cfg1/src/lib/errors.ts                              (extended — 8 Phase 2 error codes)
services/cfg1/src/lib/decision.ts                            (new — precedence chain + decision logging)
services/cfg1/src/lib/decision-token.ts                      (new — token issuance/verification)
services/cfg1/src/routes/features.ts                         (new — evaluate + verify-decision)
services/cfg1/src/server.ts                                  (extended — route registration + redaction path)
tests/unit/cfg1-canonical.test.ts                             (extended — codePointCompare tests)
tests/unit/cfg1-integrity-seal.test.ts                        (extended — verifyDecisionTimeIntegrity + 4 attack scenarios)
tests/unit/cfg1-decision.test.ts                              (new)
tests/unit/cfg1-decision-token.test.ts                        (new)
tests/unit/cfg1-app.test.ts                                   (extended — route-surface assertion updated for 2 new routes)
tests/unit/cfg1-log-redaction.test.ts                         (extended — decision_token redaction path)
tests/integration/cfg1-db.test.ts                              (extended — Phase 2 grants, evaluate/verify-decision, audit/outbox, token lifecycle)
```

### 13.10 Tests added

49 new tests (547 → 596): 5 new unit tests in `cfg1-canonical.test.ts` (codepoint comparator);
6 new unit tests in `cfg1-integrity-seal.test.ts` (`verifyDecisionTimeIntegrity` clean pass +
the 4 required attack scenarios + the still-works Phase-1-layer `hash_mismatch` case); 5 new
unit tests in `cfg1-decision.test.ts` (`computeDecisionPayloadHash` purity/determinism/
tamper-sensitivity, `evaluateFeature`'s integrity-failed passthrough via a fake client); 9 new
unit tests in `cfg1-decision-token.test.ts` (no-raw-token-in-params, bounded future expiry,
freshness/distinctness, token-not-found/revoked/expired/binding-mismatch/config-changed, null
never a wildcard); 1 updated unit test in `cfg1-log-redaction.test.ts`; 1 updated unit test in
`cfg1-app.test.ts`; 23 new integration tests in `cfg1-db.test.ts` across new describe blocks
covering Phase 2 grants, evaluate deny paths against real seeded data, evaluate allow path
(synthetic test-fixture feature only, per approved decision #6), transaction-coupled audit/
outbox writes (including the forced-failure `CFG1_AUDIT_REQUIRED` proof), verify-decision, and
no-raw-token-ever-stored.

### 13.11 Verification performed

`npx tsc -b` clean across all workspaces. Full suite run against a genuinely fresh disposable
Postgres (`aix_cfg1_p2_verify`, dropped after use along with its five test `LOGIN` roles):

```bash
npx node-pg-migrate -m infra/migrations --no-check-order up   # 001 -> 015, all clean (incl. F-1 re-verification)
psql "$DATABASE_URL" -f infra/grants/fnd_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam2_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/sec1_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/cfg1_runtime_grants.sql
npx tsc -b                                                     # clean
npx vitest run                                                 # 45 files, 596/596 passing
```

**Result: 45 test files, 596/596 tests passing, 0 failures** — the pre-existing 547-test baseline
(Phase 0/1 + all prior modules) unregressed, plus 49 new Phase 2 tests. Migration 015's own
inline F-1 re-verification step passed silently (no divergence between `localeCompare`- and
codepoint-ordered hashes on real seed data). Disposable database and its five test `LOGIN` roles
dropped after the run; confirmed via `psql -tAc "SELECT datname FROM pg_database WHERE datname
LIKE 'aix_cfg1%'"` that no trace remains.

**Note on test-database reuse:** an earlier run in this same verification pass reused an
already-exercised disposable database across multiple `vitest run` invocations, producing 21
spurious failures in `iam-db.test.ts` and IAM-02's bootstrap-to-RBAC transition test — both are
structurally single-use per database, a documented pre-existing footgun (SEC-01's own
implementation notes), not a Phase 2 regression. Resolved by dropping and recreating the
database fresh and running the full suite exactly once, per the discipline above.

### 13.12 Out-of-scope confirmation

No feature/licence mutation workflow, no kill-switch mutation workflow, no IAM-02 permission
registration, no SoD rules, no Exchange Activation Ceremony, no `audit_outage_mode`, no
deployment gate, no reconciliation, no evidence export, no business-module logic. No
CLT/KYC/AML/WLT/LED/DEP/WDR/TRD/E2E/REC/INC/PRT code. No Exchange runtime, order book, matching
engine, market making, principal dealing, or AIX spread markup code anywhere — re-proven by
`assertNoExchangeRuntime` at boot (unchanged) and the route-surface assertion in
`cfg1-app.test.ts`. `cfg1.feature`/`cfg1.feature_version` remain empty in production seed
(approved decision #5); the allow path is reachable only via synthetic test-fixture rows
(approved decision #6). SEC-01 audit integration uses only `@aix/foundation`'s `publishAudit`/
outbox pattern — no direct SEC-01 HTTP call exists anywhere in `services/cfg1`.

### 13.13 Sonnet self-review

A self-review pass traced every Phase 2 file against the 13 approved decisions and the approved
scope/out-of-scope lists. No functional or scope defects were found. Two pre-existing test
assertions were found legitimately stale (not defects in Phase 2 code, but assertions that
predated it and needed updating to reflect the newly-approved route surface): `cfg1-app.test.ts`'s
route-surface test included `features/evaluate` in its forbidden-substring list, which Phase 2
legitimately adds as a real route — updated to assert the two new routes exist and are excluded
from the forbidden list, while every still-out-of-scope route name remains forbidden;
`cfg1-log-redaction.test.ts`'s exact-array assertion expected exactly one redaction path —
updated to expect both the pre-existing internal-token header path and the new
`decision_token` body-field path. Both changes are recorded in §13.10 above. `tsc -b` and the
full suite were independently re-run against a fresh disposable Postgres, reproducing the
596/596 result.

**CFG-01 Phase 2 implementation + Sonnet self-review are complete. Ready for independent Opus
review.**

### 13.14 Independent Opus review — ACCEPT

The independent Opus review re-derived every claim from source rather than trusting either
report: re-ran `tsc -b` clean; rebuilt a genuinely fresh disposable Postgres from scratch,
applied migrations 001→015 (migration 015's own F-1 re-verification step passed against real
seed data) and all 5 grant files, and re-ran the full suite — **596/596 tests, exactly
reproducing the self-reported number**; independently ran CFG-01's 120 tests in isolation;
ran static sweeps (F3(c) import-boundary grep, residual-`localeCompare` grep, Exchange-route
grep, raw-token-in-INSERT-params/logging grep) with no reliance on the test suite alone; traced
`verifyDecisionTimeIntegrity`'s step-4 comparison directly against the vendored `doc00-baseline.ts`
constant to confirm it never reads from the (potentially tampered) seal; confirmed the
forced-outbox-grant-revoke integration test genuinely proves no orphaned `feature_decision_log`
row survives a failed audit write; confirmed the token-revocation test proves a corrected retry
with the same token fails as `_REVOKED`, not the original mismatch reason. One process note, not
a CFG-01 finding: the reviewer's first two full-suite attempts showed 66 unrelated `sec1-db.test.ts`
failures, traced to the reviewer's own harness using `SEC1_INGEST_TOKEN_*` values that didn't
match that test's hardcoded literals — resolved by using the exact expected values; CFG-01's own
tests passed in isolation throughout and were never implicated.

**Verdict: ACCEPT CFG-01 Phase 2 — zero Critical/High/Medium findings.** Two Low, non-blocking
observations:

- **Low-1**: the F-2 step-4 direct fact comparison currently verifies only the fields the
  decision engine actually reads (licence `licence_status`; prohibited-feature code
  *presence*) — it does not independently re-verify every vendored field (e.g. `authority`,
  `applies_until`, `prohibition_reason`), which remain covered only via the seal-mediated
  `config_hash` (in scope of the already-accepted detection-only-seal limitation). No live
  exposure this phase since no decision path consumes those fields yet. **Carry-forward**:
  extend step 4 if a later phase makes any of those fields decision-load-bearing.
- **Low-2**: audit events omit the optional `event_category` field on `AuditEvent`. Valid
  against the shared contract and consistent with older call sites; populating it would improve
  SEC-01-side categorization/alert-routing fidelity. Cosmetic, no live impact — deferred.

**CFG-01 Phase 2 is an accepted implementation baseline.** `MODULE_STATUS.md`,
`PROJECT_HANDOVER.md`, and `SESSION_START_PROMPT.md` (sibling `aix-platform-docs` workspace)
have been updated accordingly. CFG-01 Phase 3 (feature/licence mutation workflow + kill-switch)
has **not** been started — next step is a Phase 3 planning pass (Sonnet, no code).

---

## 14. Phase 3A — feature/licence mutation workflow, IAM-02 approval binding, reseal

Phase 3A implementation status: **ACCEPTED implementation baseline after short independent Opus
re-review.** See §15 for the full review history (initial DO NOT ACCEPT on F-1 High, the
blocking-fix patch, and the final ACCEPT verdict).

### 14.1 Phase split

Per the approved Phase 3 planning pass, Phase 3 was split into **3A** (this phase: feature-state
+ licence-profile mutation, IAM-02 approval binding, reseal, decision-token invalidation) and
**3B** (deferred: kill-switch workflow + decision-engine integration). Phase 3A implements
**none** of Phase 3B's scope — no `kill_switch`/`kill_switch_event` table, no kill-switch route,
no kill-switch precedence-chain integration.

### 14.2 IAM-02 approval reuse model (approved decision #1/#2/#3)

CFG-01 builds **no maker-checker tables of its own**. Every mutation APPLY route requires a real,
IAM-02-issued decision token — verified via IAM-02's **existing** `POST /internal/iam2/
permission/execute-verify` — before any state mutation, exactly the pattern SEC-01 Phase 5's
Critical-alert-closure route already established (no new IAM-02 code, no IAM-02 guard change).
The maker-checker workflow itself (`POST /iam2/approvals/request` + `/iam2/approvals/:id/
approve`) runs entirely outside CFG-01, operated by a human via existing IAM-02 endpoints.
`caller_module` + the shared internal-service-token are therefore **never** sufficient to
authorise a mutation on their own — closing the Phase 2/Phase 3 planning carry-forward
("mutation routes must not trust caller_module + shared token alone").

**Identity binding**: IAM-02's decision token is bound to the approval's `maker_user_id` (the
ORIGINAL requester), not the approver — `services/iam2/src/routes/approvals.ts` issues the token
with `actorUserId: approval.maker_user_id`. CFG-01's apply routes therefore pass the STORED
change row's own `requested_by` as `actor_id` to `execute-verify`, never a caller-supplied value.

**Operational payload-hash contract** (mirrors SEC-01's own documented precedent): an operator's
IAM-02 approval must be created with a `payload` object whose `fingerprint()` equals exactly the
`payload_hash` the `request` route returns. Exact shapes:
- Feature: `{ change_id, feature_code, to_state, feature_name, licence_code }`
- Licence profile: `{ change_id, licence_profile_id, licence_code, to_status }`

`apply` recomputes this hash from the **stored change row**, never from a re-submitted body — the
apply body carries only `{ change_id, approval_id, decision_token }`.

**Token-consumed-after-verify discipline**: `execute-verify` is called BEFORE the local
transaction opens (no DB lock held across the network call, per the approved scope). IAM-02's
token is single-use (unlike CFG-01's own Phase 2 bounded-reuse tokens) — the moment
`verifyDecisionToken` returns `authorised: true`, the approval is consumed regardless of what
CFG-01 does next. If the subsequent local transaction then fails (state mutation, reseal, or —
the common case — the audit/outbox write itself), the row is **deliberately left exactly as it
was** (`requested`), not forced into a separate `failed` state: a second "mark as failed" write
would face the identical audit-durability requirement that may itself be what's broken, so it
cannot be relied on to succeed either. A `requested` row is always safely retriable with a
**fresh** IAM-02 approval — only the now-consumed token needs replacing. `recordFailureAudit()`
in both route files makes a best-effort (never required to succeed) attempt to publish a
`.change_failed`/`.reseal.failed` audit event for observability when the failure is NOT itself an
audit/outbox failure; if it also fails, the original error is still what the caller sees.

### 14.3 Feature mutation workflow

`POST /internal/cfg1/feature-changes/request` (`services/cfg1/src/routes/feature-changes.ts`):
baseline IAM-02 permission check (`cfg1.feature.change_request`) → `lib/decision.ts`'s
`isFeatureMutationBlocked()` guard (prohibited-registry membership OR structural `exchange.`
prefix — checked here so a doomed proposal never wastes an IAM-02 approval cycle) → creates a
`requested` `cfg1.feature_state_change` row + `cfg1.feature_state.change_requested` audit event,
transaction-coupled. No state mutation, no reseal. `to_state` is restricted to
`enabled`/`disabled` this phase (`locked` remains a legal CHECK-constraint value, reserved for a
later phase that registers a corresponding IAM-02 permission). Enabling a `feature_code` with no
existing row requires `feature_name` in the body (first-time creation); disabling/locking a
non-existent feature fails closed (`NOT_FOUND`).

`POST /internal/cfg1/feature-changes/apply`: looks up the change row (must be `requested`) →
baseline IAM-02 permission check (`cfg1.feature.enable`/`.disable`, resolved from the row's own
`to_state`) → `execute-verify` (payload-hash-bound to the stored row) → re-locks the row
(`FOR UPDATE`, detects a lost race against a concurrent apply of the same `change_id`) →
re-checks `isFeatureMutationBlocked()` (defence in depth) → creates or updates `cfg1.feature`
(first-time creation writes `current_state`/`licence_profile_id`/`version=1`; an existing row's
`current_state`/`version` are updated) → inserts a `cfg1.feature_version` row → `resealScope(client,
"feature", ...)` → marks the change row `applied` → publishes `.change_applied` +
`.reseal.completed`, all one transaction. **This is the first code path in CFG-01 that can ever
create a production `cfg1.feature` row** — `feature_name`/`licence_code` come only from the
change row's own immutable, payload-hash-bound fields, never a fresh request body.

### 14.4 Licence-profile mutation workflow (blueprint extension — approved decision #4)

The blueprint's `05_Database_Design.md` §2 never defines a `licence_profile_change` table — only
`feature_state_change`. `cfg1.licence_profile_change` (migration `016_cfg1_mutation_workflow.cjs`)
is a **documented extension**, mirroring `feature_state_change`'s shape (`from_status`/`to_status`
substituted for `from_state`/`to_state`, matching `cfg1.licence_profile.licence_status`'s own
column naming). Only the three Phase-1-seeded rows (`MB`/`PSO`/`EXCHANGE`) can ever be a mutation
target — no row is ever created. `to_status` is restricted to `approved`/`suspended`/`revoked`
(`locked`/`retired` remain legal CHECK values, reserved — no corresponding IAM-02 permission
exists this phase). The apply route resolves the required permission from `to_status`:
`approved` → `cfg1.licence_profile.activate`, `suspended` → `.suspend`, `revoked` → `.revoke`.

**Critical, load-bearing interaction with F-2 (documented, not a bug)**: `verifyDecisionTimeIntegrity`
(Phase 2 F-2) compares live `cfg1.licence_profile.licence_status` directly against the **vendored**
`DOC00_LICENCE_PROFILES` fact for that `licence_code` (`MB`/`PSO` = `approved`, `EXCHANGE` =
`pending`) — this check was deliberately built to defeat "attacker rewrites both the row and the
seal." Phase 3A's mutation workflow can now legitimately change `licence_status` away from that
vendored value (e.g. suspending PSO, or approving EXCHANGE) — F-2 cannot distinguish a
governed, IAM-02-approved change from an attacker's, because both look identical at the row
level; the authorisation proof lives in IAM-02's approval trail, which F-2 does not (and was not
asked to) inspect. **The APPLY itself does not call F-2 and succeeds normally** — but every
SUBSEQUENT `evaluate()`/`verify-decision()` call (both run F-2 first, unconditionally) will report
`CFG1_CONFIG_INTEGRITY_FAILED` (503) for **every feature, platform-wide**, not merely the mutated
licence, until an operator updates and redeploys `doc00-baseline.ts`'s `DOC00_LICENCE_PROFILES`
to reflect the new regulatory reality — exactly matching that file's own pre-existing
"kept in sync by the operator, no automated sync mechanism" documented convention. This is
treated as **correct, deliberate, conservative behaviour** for a licence-lock platform (a
licence-profile status change is exactly the class of event that should halt all decisions until
a human consciously acknowledges the new baseline), not a defect — and it is a considerably
stronger invalidation than "just this one token": it fails EVERY outstanding token and every new
decision, platform-wide. Proven by two integration tests (PSO suspend, EXCHANGE approve) that
deliberately assert the `CFG1_CONFIG_INTEGRITY_FAILED` outcome rather than treating it as a test
failure. **Operational carry-forward**: a licence-profile mutation must be paired with a
`doc00-baseline.ts` update + redeploy before the platform resumes evaluating decisions — this
should be documented in any future operator runbook.

**Exchange non-enablement regression (unchanged)**: flipping `EXCHANGE` to `approved` via the
governed apply path still cannot enable any `exchange.*` feature — `cfg1.prohibited_feature`
remains immutable (approved decisions #5/#6/#7) and `assertNoExchangeRuntime` remains
independent of any DB state. Proven directly (a feature-changes/request attempt for
`exchange.matching_engine` still returns `CFG1_FEATURE_PROHIBITED`).

### 14.5 Reseal / versioning model

`services/cfg1/src/lib/integrity-seal.ts` gained `computeFeatureScopeHash()` (the same
allow-list-hash discipline as the two Phase 1 scope-hash functions, applied to `cfg1.feature` —
`config_scope = 'feature'` was already a legal CHECK-constraint value since migration 014, but no
seal row for it was ever seeded until Phase 3A's first feature mutation) and `resealScope(client,
scope, { approvalId })`, CFG-01's only write path onto `cfg1.config_integrity_seal`. Locks any
existing active seal for the scope (`FOR UPDATE`), recomputes the hash from the live rows in the
SAME transaction as the caller's mutation, and — **supersedes the old active row BEFORE inserting
the new one** (an ordering bug found and fixed during verification: inserting first violates the
partial unique index `cfg1_config_integrity_seal_one_active_per_scope`, since both rows would
briefly be `active` simultaneously). Never deletes a superseded row (`status = 'superseded'`,
kept forever). `signed_by`/`signature_ref` remain `NULL` on every row this function inserts —
still the interim, detection-only sha256 seal; real signing/KMS remains deferred (approved
decision #10, unchanged).

### 14.6 Decision-token invalidation through version/hash change (approved decision #8)

`services/cfg1/src/lib/decision-token.ts`'s `CurrentIntegrityState` gained `licenceProfileVersion`
and `featureConfigVersion` (previously only `prohibitedRegistryVersion`/`Hash` — nothing else was
mutable before Phase 3A). `verifyDecisionToken`'s `configChanged` check now also compares the
token's bound `licence_profile_version` against the current value, and (when the token was issued
with a non-null `feature_config_version` — always true for any actually-issued Phase 2 token,
since only an `allow` decision mints one) the bound `feature_config_version` against the
**current** `cfg1.feature.version` for that specific `feature_code`, freshly looked up by
`routes/features.ts`'s `verify-decision` handler on every call. A feature-state or licence-profile
mutation therefore invalidates every outstanding token bound to the mutated scope on its very
next verify — the same guarantee Phase 2 already gave the prohibited registry. Proven by two new
unit tests (`cfg1-decision-token.test.ts`) and by integration tests that issue a real token via
`evaluate()`, apply a real mutation via the governed workflow, and confirm the old token then
fails.

### 14.7 Prohibited-feature protection (approved decisions #5/#6/#7 — unchanged, re-verified)

No route anywhere in Phase 3A writes to `cfg1.prohibited_feature`. `role_cfg1_runtime` remains
SELECT-only on that table (regression-tested directly under the runtime role: INSERT/UPDATE/
DELETE all still return 42501). `cfg1.prohibited_feature.manage` is **not** registered in
migration 017's IAM-02 catalogue at all — not even as an unreachable placeholder row, matching
`011_iam2_register_sec1_permissions.cjs`'s own "no placeholder for a capability that doesn't
exist yet" discipline. `isFeatureMutationBlocked()` additionally blocks ANY `exchange.`-prefixed
`feature_code` structurally, independent of prohibited-registry content — defence in depth against
a future Exchange-shaped code that has not yet been added to the 30-code registry.

### 14.8 Audit/outbox

Same FND `publishAudit`/outbox pattern as every prior phase, no direct SEC-01 HTTP. New event
types: `cfg1.feature_state.change_requested`/`.change_applied`/`.change_failed`,
`cfg1.licence_profile.change_requested`/`.change_applied`/`.change_failed`,
`cfg1.reseal.completed`/`.failed`, `cfg1.prohibited_mutation.blocked` (Critical). Every mutation
write (state change, `feature_version` insert, reseal, change-row status update, audit publish)
happens on ONE transaction — proven fail-closed by an integration test that revokes CFG-01's own
`foundation.outbox_event` INSERT grant mid-apply: the caller gets `CFG1_AUDIT_REQUIRED` (503), no
`cfg1.feature` row is created, and the change row is left exactly as it was (`requested`,
retriable — see §14.2's token-consumed-after-verify discipline for why no separate "mark failed"
write is attempted).

### 14.9 Grants

`infra/grants/cfg1_runtime_grants.sql` gained CFG-01's **first write capability** on
`cfg1.licence_profile`/`cfg1.feature`/`cfg1.config_integrity_seal` (Phase 1/2 kept these
SELECT-only). Every new UPDATE grant is **column-scoped**, mirroring SEC-01's own
`GRANT UPDATE (verification_status) ON sec1.audit_seal_batch` precedent:
- `feature_state_change`/`licence_profile_change`: SELECT, INSERT, and `UPDATE (status,
  approval_id, decision_token_hash, previous_version, new_version, applied_at_utc,
  effective_at_utc)` only — `payload_hash`/`change_id`/`feature_code`/`to_state`/`feature_name`/
  `licence_code`/`requested_by`/`change_reason` remain structurally immutable once inserted, even
  under this grant (regression-tested directly).
- `cfg1.feature`: INSERT + `UPDATE (current_state, version, updated_at_utc)` only.
- `cfg1.feature_version`: INSERT only (append-only, same posture as `feature_decision_log`).
- `cfg1.licence_profile`: `UPDATE (licence_status, version, updated_at_utc)` only (SELECT
  unchanged from Phase 1).
- `cfg1.config_integrity_seal`: INSERT + `UPDATE (status)` only — a reseal always INSERTs a new
  row rather than mutating an existing one's hash/version.

`cfg1.prohibited_feature` remains completely untouched (SELECT-only, unchanged since Phase 1).
Still no `iam2.*`/`sec1.*` grant (CFG-01 reaches IAM-02 only over HTTP); `foundation.outbox_event`
INSERT-only remains CFG-01's only cross-schema grant. No DELETE/TRUNCATE anywhere, ever.

### 14.10 IAM-02 permission catalogue registration

`infra/migrations/017_iam2_register_cfg1_mutation_permissions.cjs` — `iam2`-scoped, additive
only (same precedent as `011`/`013`): registers exactly the 8 approved `cfg1.*` permission codes
(`owner_module = 'CFG-01'`), no `role_permission` seed rows (role wiring only through IAM-02's own
approved workflow), no IAM-02 guard/grant change. `requires_approval`/`requires_step_up` on this
catalogue are **advisory context only** — IAM-02's guard precedence chain can't express
"approval required only for apply, not propose" as a static permission-code property; the REAL
gate is CFG-01's own route-layer `execute-verify` requirement (§14.2), same limitation `013`'s
header comment already documents for SEC-01's identical Critical-only closure rule. No
`cfg1.prohibited_feature.manage`, no `cfg1.kill_switch.*`, no Exchange-activation/deployment-gate/
evidence-export/reconciliation permission registered.

### 14.11 Files changed

```
infra/migrations/016_cfg1_mutation_workflow.cjs                    (new)
infra/migrations/017_iam2_register_cfg1_mutation_permissions.cjs   (new)
infra/grants/cfg1_runtime_grants.sql                                (extended — first write grants)
services/cfg1/src/config.ts                                         (extended — IAM02_BASE_URL/IAM02_INTERNAL_SERVICE_TOKEN/iam2FetchImpl)
services/cfg1/src/lib/iam2-client.ts                                 (new — own copy, F3(c))
services/cfg1/src/lib/integrity-seal.ts                              (extended — computeFeatureScopeHash, resealScope)
services/cfg1/src/lib/decision.ts                                    (extended — isFeatureMutationBlocked)
services/cfg1/src/lib/decision-token.ts                              (extended — CurrentIntegrityState licence/feature version fields)
services/cfg1/src/lib/errors.ts                                      (extended — 5 Phase 3A error codes)
services/cfg1/src/routes/features.ts                                 (extended — verify-decision now supplies licence/feature version; assertPoolAvailable exported)
services/cfg1/src/routes/feature-changes.ts                          (new)
services/cfg1/src/routes/licence-changes.ts                          (new)
services/cfg1/src/server.ts                                          (extended — route registration)
tests/unit/cfg1-config.test.ts                                       (extended — IAM02_* fail-closed tests)
tests/unit/cfg1-app.test.ts                                          (extended — route-surface assertion updated)
tests/unit/cfg1-decision.test.ts                                     (extended — isFeatureMutationBlocked tests)
tests/unit/cfg1-decision-token.test.ts                               (extended — licence/feature version invalidation tests)
tests/unit/cfg1-integrity-seal.test.ts                               (extended — computeFeatureScopeHash + resealScope tests)
tests/unit/cfg1-iam2-client.test.ts                                  (new)
tests/integration/cfg1-db.test.ts                                    (extended — Phase 3A catalogue/grants/mutation/reseal/audit tests)
```

### 14.12 Tests added

36 new tests across unit files (config: 2, app: route-surface update, decision: 3, decision-token:
3, integrity-seal: 7, iam2-client: 14 new file) plus a substantial integration extension covering:
IAM-02 permission catalogue registration (exact 8 codes, no prohibited/kill-switch rows, no
`role_permission` seeds), grants (column-scoped UPDATE boundaries, `prohibited_feature`
regression), feature-changes request/apply (baseline deny, prohibited/Exchange-shaped block,
missing-feature_name validation, not-found, full request→apply cycle, already-applied
idempotent-state rejection, disable-invalidates-old-token), licence-profile-changes request/apply
(full PSO cycle including the F-2 interaction, EXCHANGE non-enablement regression), forced
audit/outbox failure (no orphan feature row, row stays `requested`), and no-raw-token-storage.

### 14.13 Verification performed

`npx tsc -b` clean across all workspaces. Full suite run against a genuinely fresh disposable
Postgres (`aix_cfg1_p3a_final`, dropped after use along with its five test `LOGIN` roles):

```bash
npx node-pg-migrate -m infra/migrations --no-check-order up   # 001 -> 017, all clean
psql "$DATABASE_URL" -f infra/grants/fnd_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam2_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/sec1_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/cfg1_runtime_grants.sql
npx tsc -b                                                     # clean
npx vitest run                                                 # 46 files, 646/646 passing
```

**Result: 46 test files, 646/646 tests passing, 0 failures** — the pre-existing 596-test baseline
unregressed, plus 50 new Phase 3A tests. Disposable database and its five test `LOGIN` roles
dropped after the run; confirmed no trace remains.

**Bugs found and fixed during this verification pass** (not present in the final code, listed for
the record):
1. `resealScope` originally INSERTed the new active seal before superseding the old one,
   violating the partial unique index (`23505` on a real reseal attempt) — reordered (§14.5).
2. The original `recordFailure` design forced the change row to `status = 'failed'` in a recovery
   transaction that ALSO called `publishAudit` — under the audit/outbox-forced-failure test
   scenario specifically, that recovery transaction hit the exact same broken grant and rolled
   back too, silently leaving the row `requested` instead of `failed`. Redesigned as
   `recordFailureAudit` (§14.2): no row mutation in the recovery path at all, only a best-effort
   audit-only attempt — simpler, and correct under an audit outage.
3. A test asserted `payload_ref LIKE '%<event_type>%'`, but `event_type` is its own
   `foundation.outbox_event` column, never embedded inside `payload_ref`'s JSON (confirmed by
   reading `packages/foundation/src/audit.ts`'s `enqueueOutbox` call) — fixed to query the
   `event_type` column directly.
4. `iam2.role_permission`'s primary key column is `id`, not `role_permission_id` — a test typo,
   fixed by reading `006_iam2_core.cjs`'s actual `CREATE TABLE` statement.
5. Two tests initially asserted a licence-profile mutation would only invalidate the one
   affected decision token (409) — the actual, stronger, and correct behaviour is a
   platform-wide `CFG1_CONFIG_INTEGRITY_FAILED` (503) via F-2 (§14.4) — tests corrected to assert
   the true, more conservative outcome rather than weakening the code to match a wrong
   expectation.

### 14.14 Out-of-scope confirmation

No kill-switch code, table, route, or decision-engine integration (Phase 3B). No
`cfg1.prohibited_feature` mutation path or permission. No Exchange Activation Ceremony, no
`audit_outage_mode`, no deployment gate, no reconciliation, no evidence export, no business-module
logic. No CLT/KYC/AML/WLT/LED/DEP/WDR/TRD/E2E/REC/INC/PRT code. No Exchange runtime, order book,
matching engine, market making, principal dealing, or AIX spread markup code anywhere — re-proven
by `assertNoExchangeRuntime` at boot (unchanged) and the extended route-surface assertion in
`cfg1-app.test.ts`.

### 14.15 Remaining deferred items / carry-forwards

- **Phase 3B**: kill-switch workflow, `kill_switch`/`kill_switch_event` tables, decision-engine
  precedence-chain integration (blueprint step 6, currently `STRUCTURALLY N/A`).
- **Real service identity**: `caller_module` on the Phase 2 evaluate/verify-decision read path
  remains declared, not authenticated — unchanged carry-forward. Mutation routes no longer share
  this weakness for AUTHORISATION purposes (IAM-02 approval binding is a real, cryptographic
  proof), but `requested_by`/actor attribution on `feature_state_change`/`licence_profile_change`
  rows is still only as trustworthy as the internal shared-token guard around the whole service.
- **Real signing/KMS/PKI**: still deferred; the sha256 seal (including the new `feature` scope)
  remains detection-only.
- **F-2/licence-mutation operational interaction** (§14.4): a licence-profile status mutation
  away from the Doc00 baseline halts ALL feature decisions platform-wide until an operator
  updates and redeploys `doc00-baseline.ts` — this needs a documented operator runbook before any
  real production use of the licence-profile mutation workflow.
- **SoD**: no bespoke `iam2.sod_rule` row was seeded for CFG-01 — maker≠approver is enforced for
  free by IAM-02's own unconditional `approvals.ts` check; the blueprint's role-specific SoD rules
  (§07 §5, e.g. "Compliance must approve licence-sensitive features") require real IAM-02 roles
  that do not yet exist in the platform's provisional role catalogue and remain a tracked,
  deferred gap, same class as IAM-02's own Phase 6/7 deferral.
- **`status = 'approved'`/`'rejected'`/`'cancelled'`/`'rolled_back'`** on both change tables
  remain legal CHECK-constraint values, reserved for future phases (no code path sets them this
  phase — request→apply is atomic, with no distinct reject/cancel/rollback route).

**Phase 3A implementation + Sonnet self-review are complete. Ready for independent Opus review.**

---

## 15. Independent Opus review — initial verdict: DO NOT ACCEPT — F-1 High, fixed and re-verified

The independent Opus review of Phase 3A returned **DO NOT ACCEPT**, one High-severity blocking
finding (F-1), plus two Low findings (Low-1, Low-2). Migrations/grants/schema, the approval-
binding design, reseal, decision-token invalidation, prohibited-registry protection, and out-of-
scope discipline were all independently verified as correct — the blocker was narrow but real.

### 15.1 F-1 (High) — root cause and fix

`017_iam2_register_cfg1_mutation_permissions.cjs` originally registered the six sensitive CFG-01
mutation permissions (`feature.enable`/`.disable`, all four `licence_profile.*` actions) with
`licence_locked = true`, reasoning loosely that anything licence-related should carry the licence
flag. `services/iam2/src/lib/guard.ts`'s step 1 treats `licence_locked = true` as an
UNCONDITIONAL, non-overridable deny — checked before any role, approval, or override logic runs
at all, real enforcement since IAM-02 Phase 2, not a stub. It exists to hard-block genuinely
licence-locked BUSINESS capabilities (the Exchange-shaped features `cfg1.prohibited_feature`
independently blocks) — not to flag "this permission concerns licence administration." The result:
IAM-02 denied every real feature-apply and every licence-profile call outright, for every actor,
always — Phase 3A's mutation workflow was fail-closed but permanently non-functional against the
real guard. Every integration test stubbed `iam2FetchImpl` to return `allow` directly, so this was
invisible to the self-reported 646/646 result; the independent Opus review caught it by reading
`guard.ts`'s own source and tracing the real decision path, not by running the test suite.

**Fix**: all 8 Phase 3A permissions now carry `licence_locked = false`. They remain correctly
gated by `requires_approval` (`true` on every apply action), `requires_step_up` (`true` on
`licence_profile.activate`), and the CFG-01 route-layer execute-verify binding — never by the
licence-lock step, which stays reserved for business-capability locks CFG-01's own registry owns.

### 15.2 Second finding discovered while building Low-2's real-guard coverage — fixed alongside F-1

Building Task 2's real-IAM-02-guard regression test (§15.3) surfaced a SECOND defect of the
identical shape, one precedence step later, empirically confirmed against the real guard (not
inferred): `guard.ts` step 6 (`requires_step_up`) and step 7 (`requires_approval`) both return a
non-`allow` decision (`step_up_required`/`approval_required` respectively) UNCONDITIONALLY for any
permission carrying that flag — before role grants are even looked up at step 10. All 6 sensitive
CFG-01 permissions carry `requires_approval = true` (kept, per approved decision — see below), and
`licence_profile.activate` additionally carries `requires_step_up = true` (which fires first, so
that action returns `step_up_required`, never reaching `approval_required`). CFG-01's own baseline
`checkPermission()` originally treated any `decision !== "allow"` as `allowed: false` — meaning the
baseline check inside `feature-changes.ts`/`licence-changes.ts` was **permanently unsatisfiable**
for all 6 apply-action permissions, for any actor, including one with a genuine role grant — the
exact same unconditional-block symptom as F-1, hidden by the exact same test-stub blind spot.

**Fix scope decision**: SEC-01's own identical dependency avoids this entirely by registering its
Critical-closure permission with `requires_approval = false` (`011`/`013`'s own documented
precedent) and enforcing the real approval requirement purely at its route layer. CFG-01
deliberately does NOT follow that path — per this patch's approved scope, `requires_approval =
true` (and `.activate`'s `requires_step_up = true`) stay on the catalogue so an operator reading
`iam2.permission` directly can see which CFG-01 actions are approval/step-up-sensitive. Instead,
`services/cfg1/src/lib/iam2-client.ts`'s `checkPermission` was corrected to treat
`approval_required`/`step_up_required` as a baseline PASS alongside `allow` (only `deny`/
`licence_locked`, or IAM-02 unavailability, are genuine baseline failures) — the real
authorisation gate was always the separate, mandatory `verifyDecisionToken`/execute-verify call,
never this advisory baseline probe. Documented in full in that file's own header comment.

### 15.3 Low-2 fix — real IAM-02 guard regression coverage

New `tests/integration/cfg1-iam2-guard-real.test.ts` — the first CFG-01 test that does NOT stub
IAM-02. Builds and `app.listen()`s a real `services/iam2/src/server.ts` app on an ephemeral port,
backed by the same disposable Postgres, and calls CFG-01's own production `iam2-client.ts`
`checkPermission()` against it over real HTTP (not `app.inject()` — a genuine network round-trip,
the same code path the mutation routes actually use). Covers: direct catalogue inspection (all 8
permissions `licence_locked = false`); an unprovisioned actor never receiving `licence_locked` for
any of the 6 sensitive permissions (the direct F-1 regression proof); a properly-provisioned actor
(real `iam2.role` + `iam2.role_permission` + `iam2.user_role` rows, cleaned up in `afterAll`)
reaching a genuine `allow` for `cfg1.feature.change_request`; and CFG-01's own client reaching
`allowed: true` for `cfg1.feature.enable` even for an unprovisioned actor (`approval_required`,
correctly not treated as a denial) — the direct proof for §15.2's fix. **Regression-proofed
directly**: this test was run against a deliberately-reverted copy of the ORIGINAL (buggy)
migration and confirmed to fail on 6 of 8 assertions, then re-run against the fixed migration and
confirmed to pass on all 8 — proving the test genuinely catches the class of defect it exists to
catch, not merely passing by construction.

### 15.4 Low-1 fix

`routes/feature-changes.ts`'s header comment (previously describing the abandoned "change row
marked `failed` in a separate recovery transaction" design) corrected to match the actual,
already-correct in-body behaviour and `licence-changes.ts`'s own header: on any post-verification
failure the whole transaction rolls back, the row is left `requested` (retriable with a fresh
IAM-02 approval), and no separate unreliable "mark as failed" write is attempted under an audit
outage.

### 15.5 Verification performed (this patch)

`npx tsc -b` clean. Full suite run against a genuinely fresh disposable Postgres (migrations
001→017 + all 5 grant files):

```bash
npx node-pg-migrate -m infra/migrations --no-check-order up   # 001 -> 017, all clean
psql "$DATABASE_URL" -f infra/grants/fnd_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam2_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/sec1_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/cfg1_runtime_grants.sql
npx tsc -b                                                     # clean
npx vitest run                                                 # 47 files, 657/657 passing
```

**Result: 47 test files, 657/657 tests passing, 0 failures** — the pre-existing 646-test baseline
unregressed, plus 11 new tests (8 in the new real-guard file, 3 in `cfg1-iam2-client.test.ts`
covering `licence_locked` still denying correctly and `approval_required`/`step_up_required` now
passing). Direct catalogue inspection confirmed all 8 `cfg1.*` permissions `licence_locked =
false`, zero `role_permission` rows, exactly the approved 8 codes present, none of the forbidden
codes (`prohibited_feature.manage`, `kill_switch.*`) present. Static sweeps (kill-switch,
`prohibited_feature` writes, Exchange routes, F3(c) import-boundary) all clean. Disposable
database and test roles dropped after the run.

### 15.6 Files changed (this patch)

```
infra/migrations/017_iam2_register_cfg1_mutation_permissions.cjs   (fixed — licence_locked=false, header comment)
services/cfg1/src/lib/iam2-client.ts                                (fixed — approval_required/step_up_required baseline interpretation)
services/cfg1/src/routes/feature-changes.ts                         (fixed — stale header comment)
tests/unit/cfg1-iam2-client.test.ts                                  (extended — licence_locked/approval_required/step_up_required tests)
tests/integration/cfg1-iam2-guard-real.test.ts                       (new — real IAM-02 guard regression coverage)
docs/implementation/CFG-01_IMPLEMENTATION_NOTES.md                   (this section)
```

### 15.7 Independent Opus re-review — ACCEPT

A short, focused re-review (scoped to the F-1 fix, the second same-class defect, Low-1, and
Low-2 — not a from-scratch re-review of all of Phase 3A) independently re-derived every claim:
`tsc -b` clean; fresh disposable Postgres, migrations 001→017 + all 5 grants clean; full suite
**657/657 reproduced exactly**; the real-guard test file re-run in isolation (8/8); direct
catalogue query confirmed all 8 permissions `licence_locked=false` with `requires_approval`/
`requires_step_up` preserved as intended, zero `role_permission` rows, no forbidden codes; both
apply routes independently traced end-to-end to confirm `checkPermission`'s baseline-pass
reinterpretation cannot itself authorise a mutation — the mandatory `execute-verify` call remains
the unconditional gate in both `feature-changes.ts` and `licence-changes.ts`; static sweeps
(kill-switch, `prohibited_feature` writes, Exchange routes, F3(c) import-boundary) all clean.

**Verdict: ACCEPT CFG-01 Phase 3A.** No new findings. The four items from the initial review
(F-1 High, the second `requires_approval`/`requires_step_up` defect, Low-1, Low-2) are all
closed. The previously-accepted parts of Phase 3A (grants, reseal ordering, prohibited-registry
lock, decision-token invalidation, the F-2/licence-mutation interaction) were re-confirmed
undisturbed by the patch.

**CFG-01 Phase 3A is an accepted implementation baseline.** `MODULE_STATUS.md`,
`PROJECT_HANDOVER.md`, and `SESSION_START_PROMPT.md` (sibling `aix-platform-docs` workspace)
have been updated accordingly. Carry-forwards into Phase 3B: register any `cfg1.kill_switch.*`
permissions with `licence_locked=false` from the start (the corrected pattern) and extend
`tests/integration/cfg1-iam2-guard-real.test.ts` to cover them — do not rely on
`iam2FetchImpl` stubs alone for the positive path. Phase 3B (kill-switch workflow +
decision-engine integration) has not been started — next step is a Phase 3B planning pass
(Sonnet, no code).

## 16. Phase 3B — ACCEPTED implementation baseline after independent Opus review — feature-scoped kill-switch workflow, decision-engine integration

### 16.1 Scope

A feature-scoped emergency kill-switch: activate (single-step, permission-gated), deactivate
(two-step request→apply, IAM-02-approval-bound), and live integration into both the runtime
decision engine (`evaluateFeature()`) and `verify-decision`'s token-verification path. Applied
per the 13-item approved Phase 3B scope and the 16 approved design decisions — carried forward
verbatim from the Phase 3B planning pass. **Not implemented, by design**:
`cfg1.kill_switch.read`, any kill-switch read/list route, a global/platform-wide kill-switch, a
`scope` jsonb column, `prohibited_feature` mutation of any kind, the Exchange Activation
Ceremony, `audit_outage_mode`, a deployment gate, reconciliation, evidence export, or any
business-module logic (CLT/KYC/AML/WLT, LED/DEP/WDR/TRD, E2E/REC/INC/PRT, Exchange runtime).

### 16.2 Data model (migration 018)

Three new tables, all `cfg1` schema:

- **`cfg1.kill_switch`** — current state per `feature_code`, one row per feature across its whole
  activate/deactivate lifecycle (reactivation UPDATEs the existing row rather than inserting a
  new one). `status` CHECK `active`/`inactive`. A partial unique index
  (`cfg1_kill_switch_one_active_per_feature ON cfg1.kill_switch (feature_code) WHERE status =
  'active'`) is the structural backstop against two simultaneously-active rows for the same
  feature, mirroring migration 014's `cfg1_config_integrity_seal_one_active_per_scope` exactly.
- **`cfg1.kill_switch_deactivation_request`** — a genuine third table (not the event log
  overloaded), mirroring Phase 3A's `feature_state_change`/`licence_profile_change` shape
  (`status`: `requested`→`applied`/`rejected`/`cancelled`/`failed`, `FOR UPDATE`-lockable,
  `payload_hash`-bound). Needed because the append-only event log cannot safely double as a
  "find the latest unresolved request" tracker without either breaking append-only-ness or
  risking races.
- **`cfg1.kill_switch_event`** — pure append-only history (`activated`, `deactivation_requested`,
  `deactivated`, `deactivation_rejected`, `failed`), same posture as `feature_decision_log`/
  `feature_version`.

No `scope` jsonb column anywhere (approved decision #3) — `feature_code` is required
everywhere, no global/platform-wide switch (decisions #1/#2). None of the three tables
participate in seal/reseal/Doc00-baseline (decision #12) — kill-switch state is live
operational/emergency state with no regulatory anchor, read directly and freshly on every
decision via `isKillSwitchActiveForFeature()`, the single source of truth every kill-switch-aware
code path calls.

### 16.3 IAM-02 permission registration (migration 019)

Three permission codes, all `owner_module = 'CFG-01'`, all `licence_locked = false` (the
mandatory rule established by the Phase 3A F-1 fix — see §15.1/§15.6):

| Code | requires_approval | requires_step_up | Rationale |
|---|---|---|---|
| `cfg1.kill_switch.activate` | false | false | Emergency action must be fast; no execute-verify fallback exists (see §16.4). |
| `cfg1.kill_switch.deactivate_request` | false | false | Proposing is low-risk; the real gate is the apply step. |
| `cfg1.kill_switch.deactivate` | true | false | Restoring normal operation is approval-bound (decision #5). |

The blueprint (`07_Permission_Rules.md` §2) names a single `cfg1.feature.kill_switch` code, but
IAM-02's guard gates `requires_approval`/`requires_step_up` as **static** properties of the
permission code (checked before role-grant lookup) — activation (no approval) and deactivation
(approval required) cannot share one code. Three separate codes is a documented deviation from
the blueprint's literal naming, same class as prior naming judgment calls in this project (e.g.
SEC-01's migration 011). `cfg1.kill_switch.read` is deliberately **not** registered (decision
#10) — no route can call it, and registering an unreachable permission violates the
no-placeholder discipline established since Phase 1. No `role_permission` seed rows (decision
#9 / same convention as every prior `cfg1.*` permission).

### 16.4 Activation workflow

`POST /internal/cfg1/kill-switches/activate` (`routes/kill-switches.ts`) is a **single step** —
unlike every other CFG-01 mutation permission, there is no execute-verify following it (decision
#4). Because `cfg1.kill_switch.activate` has `requires_approval=false`/`requires_step_up=false`,
the real IAM-02 guard can only ever return `allow` or `deny` for it — but the route additionally
asserts `baseline.reason === "permission_granted"` as defence-in-depth, a structural guarantee
that a future accidental catalogue-flag change cannot silently let a bare baseline pass authorise
an emergency control action. `lib/kill-switch.ts`'s `activateKillSwitch()` locks any existing row
`FOR UPDATE` first: if active, returns `already_active` (no write, `CFG1_KILL_SWITCH_ALREADY_ACTIVE`);
if inactive, reactivates via UPDATE (same `kill_switch_id`, version incremented); if none,
INSERTs a fresh row (version 1). Writes a `kill_switch_event` row and a `cfg1.kill_switch.activated`
audit event (severity `critical`) in the same transaction.

### 16.5 Deactivation workflow

Two-step, mirroring `feature-changes.ts`/`licence-changes.ts` exactly: `POST
/internal/cfg1/kill-switch-deactivation-requests/request` (permission-gated only, no
execute-verify) creates a `requested` row; `POST
/internal/cfg1/kill-switch-deactivation-requests/apply` requires a mandatory IAM-02
execute-verify against a freshly-recomputed payload hash (`computeKillSwitchDeactivationPayloadHash`,
never a re-submitted request body) before mutating anything. **Partial SoD mitigation +
documented residual gap** (decisions #6/#7): `requestKillSwitchDeactivation()` rejects a proposer
who equals the kill-switch's own `activated_by` — CFG-01 already owns that comparison, cheaply
and reliably. It **cannot** verify that the eventual IAM-02 approver of a different proposer's
request is not the original activator: `execute-verify` binds and returns only the token's MAKER
identity (`services/iam2/src/lib/decision-token.ts`), never the approver's, which lives only in
`iam2.approval_decision.approver_user_id`, a table CFG-01 has no grant to read. This is an
accepted, explicitly documented residual gap, not silently ignored — no IAM-02 code, schema, or
`sod_rule` change was made (decisions #8/#9). On apply, `applyKillSwitchDeactivation()` re-locks
(`FOR UPDATE`) both the change row and the kill-switch row fresh (trusts nothing from the earlier
unlocked read), UPDATEs `kill_switch` to `inactive` (version incremented), marks the request
`applied`, writes a `deactivated` event, and audits (severity `high`).

### 16.6 Decision-engine integration

`evaluateFeature()` (`lib/decision.ts`) now checks `isKillSwitchActiveForFeature()` immediately
after the prohibited-feature check and **before** the `cfg1.feature` row lookup — so an active
kill-switch pre-emptively blocks even a `feature_code` with no `cfg1.feature` row yet, mirroring
the prohibited-feature check's own precedent. New reason code: `kill_switch_active`.

### 16.7 verify-decision live check + token invalidation

**Critical design correction from the planning pass**: `verifyDecisionToken()` does **not**
re-run `evaluateFeature()` (confirmed by direct code reading), so a kill-switch check added only
inside `evaluateFeature()` would never protect outstanding decision tokens issued before
activation. `routes/features.ts`'s verify-decision handler now performs an **explicit, separate**
live `isKillSwitchActiveForFeature()` check and threads the result into `verifyDecisionToken()`
as a new 4th parameter (`killSwitchActive: boolean`) — deliberately **not** folded into the
existing `CurrentIntegrityState` version-comparison mechanism, which would have required an
`ALTER TABLE` on the already-accepted Phase 2 `cfg1.feature_decision_token` table for a boolean
state class that doesn't benefit from version-hash drift detection. The check is positioned
right after the binding-mismatch check and before the existing `configChanged` check — kill-switch
is treated as the stronger/more urgent condition, same precedence `evaluateFeature()` gives it.
When true, the token is revoked (`revoke(client, row.token_id, "kill_switch_active")`) and the
call fails closed with a new error code, `CFG1_TOKEN_REVOKED_BY_KILL_SWITCH` (409). This means an
allow token issued **before** an activation fails on its very next verify, even though nothing
about the token's own binding fields changed (decision #14, proven end-to-end in
`tests/integration/cfg1-db.test.ts`'s "Kill-switch live check in verify-decision" block).

### 16.8 Audit/outbox

Every mutating kill-switch operation (`activateKillSwitch`, `requestKillSwitchDeactivation`,
`applyKillSwitchDeactivation`) calls `publishAudit` inside the same transaction as its table
writes — an outbox failure rolls back the whole transaction (fail closed), proven directly by
revoking `INSERT` on `foundation.outbox_event` mid-test and confirming `CFG1_AUDIT_REQUIRED` with
no orphaned row. The deactivation-apply route additionally has a best-effort
`recordFailureAudit()` for post-execute-verify transaction failures (`cfg1.kill_switch.failed`),
mirroring `feature-changes.ts`'s identical pattern — no separate "mark as failed" write is
attempted on the change row itself, since that would face the same audit-durability requirement
that is already what's broken in that failure path.

### 16.9 Grants

`infra/grants/cfg1_runtime_grants.sql`'s Phase 3B section: `SELECT, INSERT` + a narrowly
column-scoped `UPDATE` on `cfg1.kill_switch` and `cfg1.kill_switch_deactivation_request`;
`INSERT`-only on `cfg1.kill_switch_event` (append-only, no `UPDATE`/`DELETE` grant ever). No
`DELETE`/`TRUNCATE` grant anywhere. `cfg1.prohibited_feature` remains completely unchanged
(`SELECT`-only, regression-proofed directly in `tests/integration/cfg1-db.test.ts`).

### 16.10 Tests added

- `tests/unit/cfg1-kill-switch.test.ts` (new, 15 tests) — pure branching logic of
  `lib/kill-switch.ts` against a fake `PoolClient`, including a dedicated test asserting the
  advisory lock is taken first with the expected key (§16.10.1).
- `tests/unit/cfg1-decision-token.test.ts` (+2 tests, 14 total) — `killSwitchActive` revocation
  branch.
- `tests/unit/cfg1-app.test.ts` — route-surface assertion extended for the 3 new routes plus
  explicit negative assertions for `kill-switches/read`/`kill-switches/list`.
- `tests/integration/cfg1-db.test.ts` — full DB-backed workflow: IAM-02 permission catalogue
  registration + grants; activate (deny, non-genuine-allow, success, already-active, concurrent
  race, Exchange-independence); kill-switch precedence in `evaluateFeature()` (including the
  no-feature-row pre-emptive block, and restoration after deactivation); the verify-decision live
  check + token revocation; deactivation request (not-active, self-deactivation-blocked, success);
  deactivation apply (not-found, execute-verify-invalid, success, raced, no-raw-token-stored);
  audit/outbox forced-failure fail-closed for both activation and deactivation-apply; no
  seal/reseal participation; `prohibited_feature` regression proof; no read/list route.
- `tests/integration/cfg1-iam2-guard-real.test.ts` — extended with the same "unprovisioned
  actor" + "properly provisioned actor" real-guard proof pattern the Phase 3A re-review
  established, applied to all 3 new `cfg1.kill_switch.*` codes (direct catalogue
  `licence_locked=false` check, plus `checkPermission()` reaching a genuine `allow` for a really
  role-granted actor on `cfg1.kill_switch.activate` — the exact baseline the activation route's
  defence-in-depth assertion requires).

### 16.10.1 Self-review finding, fixed before Opus review

**Concurrent first-ever activation could surface as a misleading 503.** `lookupKillSwitch`'s
`FOR UPDATE` only takes a row lock when a matching row already exists — it does nothing for the
TRUE first-ever-activation race, where two concurrent callers on the same never-activated
`feature_code` both see zero rows and both attempt an INSERT. The partial unique index
(`cfg1_kill_switch_one_active_per_feature`) still prevents two active rows from ever existing,
but the loser of that race would previously surface as a raw Postgres unique-violation (23505),
which `routes/kill-switches.ts`'s `.catch()` would mis-translate into `CFG1_AUDIT_REQUIRED` (503,
"audit unavailable") instead of the correct, clean `CFG1_KILL_SWITCH_ALREADY_ACTIVE` (409) — a
misleading error for what is actually a successful-but-raced activation attempt. **Fixed** by
adding a transaction-scoped advisory lock (`SELECT pg_advisory_xact_lock(hashtext($1))`, keyed by
`cfg1.kill_switch:${featureCode}`) at the top of `activateKillSwitch`, taken before the lookup —
the exact idiom SEC-01 already established for the identical class of problem
(`services/sec1/src/lib/alerts.ts`, `services/sec1/src/lib/monitoring-rules.ts`, both proven with
their own "concurrent ... pg_advisory_xact_lock serialization" tests). This fully serializes
concurrent activation attempts on the same `feature_code` before either the lookup or the
INSERT/UPDATE branch runs, making the zero-existing-row case safe too. Found and fixed during
this implementation's own self-review pass (caught by reasoning through the concurrent-activation
integration test's actual guarantees, not by a test failure — the original, timing-dependent test
happened to pass by luck in every run performed, which is itself why the fix and the new
dedicated unit test in §16.10 matter). Verified with `tsc -b` clean and a full fresh-database
suite re-run (§16.11) — 708/708 passing, one test added (the new advisory-lock-ordering unit
test).

### 16.11 Verification performed

`npx tsc -b` clean throughout. Full suite run against a genuinely fresh disposable Postgres
(migrations 001→019 + all 5 grant files), interleaved in the order the migrations themselves
require (`006_iam2_core` → `iam2_runtime_grants.sql` → `007_iam2_seed_sod_rules`, which contains
an inline `GRANT EXECUTE ... TO role_iam2_runtime` and therefore genuinely requires the role to
already exist — the other grant files have no such inline migration dependency):

```bash
npx node-pg-migrate -m infra/migrations --no-check-order up 001_fnd_core
psql "$DATABASE_URL" -f infra/grants/fnd_runtime_grants.sql
npx node-pg-migrate -m infra/migrations --no-check-order up   # 002 -> 006
psql "$DATABASE_URL" -f infra/grants/iam_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/iam2_runtime_grants.sql
SEC1_INGEST_TOKEN_FND01=... SEC1_INGEST_TOKEN_IAM01=... SEC1_INGEST_TOKEN_IAM02=... \
  npx node-pg-migrate -m infra/migrations --no-check-order up   # 007 -> 019, all clean
psql "$DATABASE_URL" -f infra/grants/sec1_runtime_grants.sql
psql "$DATABASE_URL" -f infra/grants/cfg1_runtime_grants.sql
npx tsc -b                                                     # clean
npx vitest run                                                 # 48 files, 708/708 passing
```

**Result: 48 test files, 708/708 tests passing, 0 failures** (final run, after the §16.10.1
advisory-lock fix) — the pre-existing 657-test baseline unregressed, plus 51 new tests (15
kill-switch unit, 2 decision-token unit, ~30 kill-switch integration, 4 real-guard). Direct
catalogue inspection confirmed exactly the 3 approved `cfg1.kill_switch.*` codes, all
`licence_locked=false`, correct `requires_approval`/`requires_step_up` per code, zero
`role_permission` rows, no `cfg1.kill_switch.read` row. Static sweeps confirmed: no
Exchange-runtime route/config surface added; no `prohibited_feature` INSERT/UPDATE/DELETE
anywhere in `services/cfg1/src`; no `kill-switches/read` or `kill-switches/list` route or
permission anywhere. Two self-caught issues were found and fixed during this pass: (1) an
evaluate() reason-code test assertion for `exchange.matching_engine` expected `"prohibited"` but
the real precedence is `"exchange_pending_locked"` (the structural Exchange-lock check runs
before the general prohibited-registry check, same as every other `exchange.*` test in the file);
(2) the concurrent-first-activation race condition documented in §16.10.1.

**Environment note (not a Phase 3B finding)**: `tests/integration/sec1-db.test.ts` requires its
own migration-time env vars (`SEC1_INGEST_TOKEN_FND01`/`_IAM01`/`_IAM02`) to be seeded with the
**exact** values the test file itself hardcodes (`TOKENS` constant) — using different placeholder
values at migration time causes every SEC-01 ingestion test to fail closed with 401, unrelated to
any code defect. This was hit and resolved during this verification pass (not a regression; no
SEC-01 code or test was touched). Also observed: `tests/integration/iam2-db.test.ts` and
`tests/integration/cfg1-iam2-guard-real.test.ts` both create a runtime role named
`iam2_app_test` — running the full suite in Vitest's default parallel-worker mode can race on
that `CREATE ROLE`, unrelated to Phase 3B (both files pre-date this phase; only
`cfg1-iam2-guard-real.test.ts`'s test *cases*, not its setup/role name, were touched here). This
run used `--pool=forks --poolOptions.forks.singleFork=true` to avoid the race; flagged here for a
future infra cleanup, out of scope for this phase.

### 16.12 Files changed

```
infra/migrations/018_cfg1_kill_switch.cjs                              (new)
infra/migrations/019_iam2_register_cfg1_kill_switch_permissions.cjs    (new)
services/cfg1/src/lib/kill-switch.ts                                    (new)
services/cfg1/src/lib/decision.ts                                       (extended — kill-switch precedence step)
services/cfg1/src/lib/decision-token.ts                                 (extended — killSwitchActive param + revocation)
services/cfg1/src/routes/features.ts                                    (extended — verify-decision live kill-switch check)
services/cfg1/src/lib/errors.ts                                         (extended — 4 new error codes)
services/cfg1/src/routes/kill-switches.ts                               (new)
services/cfg1/src/server.ts                                             (extended — route wiring)
infra/grants/cfg1_runtime_grants.sql                                    (extended — Phase 3B grants)
tests/unit/cfg1-kill-switch.test.ts                                     (new)
tests/unit/cfg1-decision-token.test.ts                                  (extended)
tests/unit/cfg1-app.test.ts                                             (extended)
tests/integration/cfg1-db.test.ts                                       (extended — Phase 3B workflow + fixed 2 stale Phase 3A assertions)
tests/integration/cfg1-iam2-guard-real.test.ts                          (extended — kill-switch real-guard coverage)
docs/implementation/CFG-01_IMPLEMENTATION_NOTES.md                      (this section)
```

### 16.13 Remaining deferred items

- Approver-side SoD verification (decision #7's residual gap) — needs an IAM-02 change
  (`execute-verify` exposing approver identity) that is explicitly out of scope for this phase.
- `cfg1.kill_switch.read` / any read-list route, global kill-switch, `scope` jsonb — all
  deliberately deferred per the approved scope, not gaps.
- The pre-existing `iam2_app_test` role-name collision between `iam2-db.test.ts` and
  `cfg1-iam2-guard-real.test.ts` under parallel test execution (test-infra cleanup, not a
  Phase 3B code issue).
- Docs-workspace status update (`MODULE_STATUS.md`/`PROJECT_HANDOVER.md`/
  `SESSION_START_PROMPT.md` in the sibling `aix-platform-docs` workspace) — done, see §16.14.

### 16.14 Independent Opus review — ACCEPT

Independently reproduced from a genuinely fresh disposable Postgres (migrations 001→019 run
straight through, then all 5 grant files in one pass): **708/708 tests, 48 files, 0 failures**;
`tsc -b` clean. Direct SQL catalogue inspection confirmed all 3 `cfg1.kill_switch.*` codes
present with the exact documented `licence_locked`/`requires_approval`/`requires_step_up` flags,
zero `role_permission` rows, no `.read` row. Direct `information_schema` grant inspection
confirmed the column-scoped `UPDATE` grants exactly as documented on `kill_switch`/
`kill_switch_deactivation_request`, `INSERT`-only on `kill_switch_event`, no `DELETE`/`TRUNCATE`
anywhere, `cfg1.prohibited_feature` unchanged, no `iam2.*`/`sec1.*` cross-schema grant.
`cfg1-iam2-guard-real.test.ts` independently re-run in isolation (14/14) — a real listening
IAM-02 server, not a stub, confirms the positive path for all 3 new codes, including that
`.activate` reaches a genuine `permission_granted` allow for a properly-provisioned actor (the
exact baseline the activation route's defence-in-depth assertion requires) and that `.deactivate`
correctly returns `approval_required` for an unprovisioned actor (safe only because execute-verify
remains mandatory). Static sweeps (Exchange route/config, `prohibited_feature` write, kill-switch
read/list, raw-token storage/logging) all clean. The §16.10.1 advisory-lock fix was independently
read and confirmed correct.

**Verdict: ACCEPT CFG-01 Phase 3B.** No Critical/High/Medium findings. Two Low/informational,
non-blocking items, neither a Phase 3B code defect:
- **L1** — the partial SoD self-block (`requested_by ≠ activated_by`) is bounded by the same
  declared-identity trust model flagged since Phase 2 (`activated_by`/`requested_by` are declared
  body fields, authenticated only by the shared internal-service-token) — its real teeth come
  from the mandatory IAM-02 `execute-verify` on deactivation, not the self-block alone. Unchanged
  posture, not a regression.
- **L2** — pre-existing test-harness fragility, unrelated to Phase 3B code: `iam2-db.test.ts` and
  `cfg1-iam2-guard-real.test.ts` share the runtime-role name `iam2_app_test`, forcing single-fork
  test execution to avoid a `CREATE ROLE` race under Vitest's default parallel mode; and the
  Phase 1 "`cfg1.feature` intentionally empty" seed assertion is sensitive to shared-database test
  ordering (passes 88/88 on a pristine database). Tracked as test-infra cleanup, carried forward.

No code was written or changed during the review. `MODULE_STATUS.md`, `PROJECT_HANDOVER.md`, and
`SESSION_START_PROMPT.md` (sibling `aix-platform-docs` workspace) have been updated accordingly.

**CFG-01 Phase 3B is an accepted implementation baseline. Next: CFG-01 next phase planning /
post-Phase-3 consolidation.**
