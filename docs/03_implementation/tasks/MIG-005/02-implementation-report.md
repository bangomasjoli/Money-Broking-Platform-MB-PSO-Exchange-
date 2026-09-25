# 02 Implementation Report — MIG-005

> This report is the implementer's own account. It does **not** prove correctness; see `03-evidence.md`.

- **Implementation model / effort:** claude-opus-5-5 / HIGH
- **Round:** 1
- **Baseline commit:** `9bc49aa`
- **Resulting commit:** `5f78a0b`

## Changed files (summary)
- `platform/packages/foundation/src/environment.ts` — **new.** Canonical environment model.
- `platform/packages/foundation/src/config.ts` — the local `Environment` type and list removed; `loadConfig` validates through `isEnvironment`.
- `platform/packages/foundation/src/index.ts` — exports `environment.js`.
- `platform/tests/unit/mig005-environment.test.ts` — **new.** 50 targeted tests.

## Implementation summary
The existing lowercase identifiers are persisted in `foundation.release_registry` (migration 001 CHECK) and in WLT-01's signed proof-of-control message and `domain_environment` (migration 053 CHECK), so they are **mapped, not renamed** (`STR-03` §8.3 "Map"). The foundation now exports:

| Export | Semantics |
|---|---|
| `Environment` / `ENVIRONMENTS` | `dev`, `qa`, `uat`, **`demo`** (new), `staging`, `prod`; frozen |
| `CanonicalEnvironment` / `CANONICAL_ENVIRONMENTS` | `DEVELOPMENT`, `TEST`, `UAT`, `DEMO`, `PRODUCTION`; frozen |
| `isEnvironment(v)` | exact, case-sensitive, own-property membership; any non-string → `false` |
| `canonicalEnvironment(v)` | `dev`→DEVELOPMENT, `qa`→TEST, `uat`→UAT, `demo`→DEMO, `prod`→PRODUCTION, **`staging`→PRODUCTION**; **anything else → PRODUCTION** |
| `isProductionGated(v)` | `canonicalEnvironment(v) === "PRODUCTION"`. `false` is not permission |

`loadConfig` behaviour is unchanged except that `ENVIRONMENT=demo` is now accepted. Unknown, malformed or wrong-case values still abort startup (stricter than resolving to PRODUCTION).

**Staging mapping.** Doc 00 §1.E rule 5, `ENV-SRS-007` and MSR §26.1 rule 9 all require the pre-production mirror to inherit PRODUCTION's activation gate, not UAT's, and to fail closed until mapped. `staging` → PRODUCTION is the only mapping those texts permit, and it matches the fail-closed default, so no new governance decision is made here. SRS open item 26 and MSR open item 26 are not edited (see F04).

**Grants nothing.** The module classifies only. `ENVIRONMENT_AVAILABILITY`, `PRODUCTION_ACTIVATION_STATE` and `PRODUCT_ASSET_ELIGIBILITY_STATE` remain unimplemented (CFG-01, `MIG-004`). No capability, feature, CFG-01 row or guard changed. `assertNoExchangeRuntime` is untouched and still environment-blind.

## Review-required observations (not fixed; no scope broadened)
Severity is not assigned here; a human triages them.

- **MIG-005-F01 — literal `=== "prod"` guards do not treat `staging` as production.** Examples: the AML-01/WLT-01 stub-provider bans (`services/aml1/src/config.ts`, `services/wlt1/src/config.ts`), IAM-01 pool requirements (`services/iam/src/config.ts`), the FND-01 readiness licence-lock blocking flag (`services/fnd/src/routes/system.ts`) and the log level in each `server.ts`. These are operational config guards, not the §21 activation gate, and this change leaves their behaviour as it was. A human needs to decide whether they should use `isProductionGated`.
- **MIG-005-F02 — `demo` is not in the vocabularies duplicated downstream.** These are CFG-01 `routes/features.ts` `ENVIRONMENTS`, WLT-01 `POC_DOMAIN_ENVIRONMENTS`, and the CHECK constraints in migrations 001 (`release_registry.environment`) and 053 (`domain_environment`). With `ENVIRONMENT=demo`, three things happen. CFG-01 evaluate rejects `environment: "demo"` at schema validation, which is a fail-closed deny for callers. WLT-01 proof-of-control issuance fails at the DB CHECK, which is also fail-closed. WLT-01's `config.environment as PocDomainEnvironment` casts become unsound. CFG-01 is `MIG-004` scope, and the PoC message vocabulary is frozen, so none of these were changed.
- **MIG-005-F03 — CFG-01 takes `environment` from the caller's request body**, not from its own configured environment. This is harmless today because the environment is hashed and logged but never evaluated. Once `MIG-004` makes step 4 live, a caller could assert a non-production environment to a production CFG-01. **REVIEW REQUIRED before `MIG-004`:** the evaluated environment must be bound to CFG-01's own configuration, or a mismatch must be rejected.
- **MIG-005-F04 — records still say "fail closed until the mapping is decided."** SRS open item 26, MSR open item 26 and Doc 00 §1.E rule 5 still describe the staging mapping as undecided. Recording its closure is a separate governance turn.

## Known issues / deviations
- None beyond F01–F04. **MIG-004 is NOT STARTED.** No regulated capability was enabled, and production-gated capability activation is still impossible because no activation state exists in code.
