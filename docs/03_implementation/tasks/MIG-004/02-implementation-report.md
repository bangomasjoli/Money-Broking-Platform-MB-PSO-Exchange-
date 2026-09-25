# 02 Implementation Report — MIG-004

> This report is the implementer's own account. It does **not** prove correctness; see `03-evidence.md`.

- **Implementation model / effort:** claude-opus-5-5 / HIGH
- **Round:** 1
- **Baseline commit:** `bdc5dfc` (approved plan: `01-plan.md`, HD-1…HD-4 decided, DEC-014 recorded)
- **Resulting commit:** `5a4f872` (full hash and evidence in `03-evidence.md`)

## Changed files (summary)
| File | Purpose |
|---|---|
| `platform/infra/migrations/071_cfg1_environment_scope.cjs` | **New.** `environment_scope jsonb NOT NULL DEFAULT` all-DISABLED; strict CHECK; guarded, ordering-independent runtime INSERT restriction |
| `platform/infra/grants/cfg1_runtime_grants.sql` | Table-level `INSERT ON cfg1.feature` → `REVOKE` + column-scoped `INSERT` excluding `environment_scope` |
| `platform/services/cfg1/src/lib/environment-availability.ts` | **New.** CFG-01-owned whole-object parser → `ENABLED`/`DISABLED`/`NOT_APPLICABLE`/`INVALID` |
| `platform/services/cfg1/src/lib/decision.ts` | Approved precedence; structural `exchange.` deny; caller-mismatch deny; step 4 live; PRODUCTION hold; Critical mismatch audit |
| `platform/services/cfg1/src/lib/decision-token.ts` | Caller-assertion check; own-environment binding; `environmentAvailable` re-check; `revokedReason` surfaced |
| `platform/services/cfg1/src/routes/features.ts` | Foundation `ENVIRONMENTS` (local list deleted, `demo` accepted); own `app.config.environment` authoritative; live availability re-read on verify |
| `platform/services/cfg1/src/routes/feature-changes.ts` | `feature_version.state_snapshot` = `{current_state, environment_scope}` from the authoritative row, same transaction |
| `platform/tests/unit/cfg1-environment-availability.test.ts` | **New.** Parser, per-identifier mapping, static guards |
| `platform/tests/integration/cfg1-mig004-environment-availability-private.test.ts` | **New.** §13 decision matrix on a private DB, six CFG-01 apps, real runtime role |
| `platform/tests/integration/cfg1-migration-071-regression.test.ts` | **New.** Backfill, CHECK probes, grants-before-071 ordering, down/up |
| `platform/tests/unit/cfg1-decision-token.test.ts` | New arguments; `revokedReason`; six new MIG-004 token tests |
| `platform/tests/integration/cfg1-db.test.ts` | Request `environment` now equals the app's own (`dev`, 34 sites); fixtures carry an explicit `environment_scope`; apply test strengthened |
| `platform/tests/integration/fnd-rate-limit-policy-privilege-ordering.test.ts` | **Test-only:** global-head pin (`070`) → presence check scoped to 070 (CLT-FIND-004 precedent, `e6cf4c7`) |

## Implementation summary

**Decision order (exact, `lib/decision.ts`).**
1. Integrity verification.
2. Prohibited registry, then the structural `exchange.` deny (`prohibited`; HD-4; `securities_market.*` not affected).
3. Caller-environment mismatch (`environment_mismatch`).
4. Kill switch.
5. Feature lookup (`unknown_fail_closed`).
6. Step 4 environment availability (`environment_scope_invalid` / `environment_not_available`).
7. Stale version.
8. `current_state` (`feature_disabled`).
9. PRODUCTION hold (`production_activation_absent`, canonical PRODUCTION = `prod` and `staging`).
10. Allow.

**Trust boundary (CFG-FIND-001).**
- The route passes `environment = app.config.environment` (CFG-01's own, validated at boot) and, separately, `assertedEnvironment = body.environment`.
- Only the own value is evaluated, hashed, logged and bound into tokens. The asserted value is used only for the equality check and audit metadata.
- **On evaluate**, a mismatch denies, writes the decision log with the own environment, and publishes the Critical `cfg1.feature_decision.environment_mismatch` audit event (`{decision_id, environment, canonical_environment, asserted_environment}`). No token is issued; migration 015's CHECK allows tokens for `allow` only.
- **Prohibited + mismatch**: the mismatch audit is also emitted when a prohibited request carries a mismatched assertion. It is layered on top of the unchanged `.denied` event and the Critical `prohibited_feature.blocked` event, never in place of them. All three are written in one transaction.
- **On verify**, after the existence, revoked and expiry checks:
  - a mismatched assertion revokes with `environment_mismatch`;
  - the token's bound environment is compared against CFG-01's own (cross-environment tokens get `binding_mismatch`);
  - the live `environment_scope` entry for the own canonical environment must be `ENABLED`, otherwise the token is revoked with `environment_unavailable`.
- All three failures return `CFG1_DECISION_BINDING_MISMATCH`.

**Vocabulary (FND-FIND-013, CFG-01 part).** CFG-01's local `["dev","qa","uat","staging","prod"]` list is deleted, and the request schema is built from the foundation's `ENVIRONMENTS`, so `demo` is accepted. The `ENVIRONMENT_AVAILABILITY` vocabulary lives in CFG-01, not the foundation.

**Migration 071 and grants.**
- The column is added with a constant default, so every existing row is backfilled all-DISABLED; nothing is seeded `ENABLED`.
- The CHECK requires an object with exactly the five canonical keys and string values from the three-state set, so a `STAGING` key cannot exist.
- **One addition beyond plan §12's SQL (not a scope change):** following migration 070's precedent, 071 performs the same guarded `REVOKE INSERT` + column-scoped `GRANT INSERT` itself when `role_cfg1_runtime` already exists. Otherwise a deployment that applied grants *before* 071 would keep table-level `INSERT`, which Postgres extends to the new column. This makes plan §9's grant intent hold under either ordering, and test D of the migration suite proves it.

**DEC-014 / HD-3.**
- `current_state` is unchanged in meaning and mechanics; it is simply one conjunct.
- `computeFeatureScopeHash` / `FeatureSealRow` are **unchanged**, there is no reseal, and decision-time seal verification is **not** added: CFG-FIND-002 is untouched.
- No `environment_scope` write path exists.

## Deviations from the approved plan
- **Verify-decision audit attribution (plan §5 point 4):** the plan says the existing `cfg1.feature_decision.rejected` audit "carries `reason_code: environment_mismatch`". That event's `reason_code` already carries the error code (`CFG1_DECISION_BINDING_MISMATCH`), and changing it would alter existing audit semantics for every revocation reason. The revocation reason is therefore added as `metadata.revoked_reason` (alongside `environment` and, on mismatch, `asserted_environment`). The same fact is recorded; `reason_code` semantics are unchanged.
- **Migration 071 grant block:** described above; it strengthens plan §9 and does not change it.
- **FND test file:** the only file outside `services/cfg1` and `tests/cfg1*` touched. It is a test-only replacement of a global migration-head pin that *any* new migration breaks. Recorded precedent: CLT-FIND-004. There is no FND-01 functional change.

## Findings status (not closed; closure only after independent review + human acceptance)
- `CFG-FIND-001`: **OPEN — implemented pending independent acceptance.**
- `FND-FIND-013`: **OPEN — CFG-01 portion implemented pending acceptance; WLT-01 portion and migrations 001/053 remain.**
- `CFG-FIND-002`: **OPEN / MEDIUM — untouched** (separate task).
- `FND-FIND-012`, `WLT-FIND-016`: unchanged.

## New observations (review required; not fixed, scope not broadened)
- **MIG-004-O1 — pre-existing CLT-01 test isolation race.** `tests/integration/clt1-db.test.ts` performs an **unscoped** `DELETE FROM clt1.client_profile` in a hook on the shared test DB, while `tests/integration/clt1-principal-membership-route.test.ts` inserts its own rows concurrently. Run together, the pair fails 1–5 tests on **every** run. This reproduces at baseline `bdc5dfc` with all MIG-004 changes stashed, against a 070 DB (4 of 4 runs failed). In the full suite it appears only when the scheduler overlaps the two files, which is why the baseline full run showed 0 failures. It is unrelated to CFG-01 and to MIG-004, and a human should triage it; it is a candidate CLT finding.
- **MIG-004-O2 — operational consequence (accepted by design, plan §4):** after migration 071, every feature denies in every environment until an `environment_scope` entry is set `ENABLED`, and MIG-004 provides no way to set one outside test fixtures. Separately, canonical PRODUCTION denies everything (HD-2).

## Known issues
- None beyond the observations above. MIG-004 makes nothing production-ready and enables no capability.
