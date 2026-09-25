# 01 Plan — MIG-005: Canonical five-environment model in the Foundation `Environment` type

- **Task ID:** MIG-005
- **Risk:** HIGH — reason: foundation-wide capability-control vocabulary consumed by every service; fail-closed semantics for unknown environments
- **Category:** Phase A foundation migration (`DEC-013` capability-control plane)
- **Planner:** human (controlled-turn instruction) / — / —
- **Selected implementer:** architecture/security implementer / claude-opus-5-5 / HIGH — reason: compliance-critical fail-closed control
- **Baseline commit:** `9bc49aa`
- **Human approval:** Aiman, 2026-09-26 (controlled-turn instruction "PHASE A FOUNDATION — MIG-005")

## Objective
Implement `MIG-005` exactly as the accepted masters define it: Foundation `Environment` type → the five canonical environments, adding `demo`; map the pre-production mirror (`staging`), which inherits PRODUCTION's gate; unknown or unrecognised environments resolve to PRODUCTION and fail closed.

## Governing definition (accepted masters)
- Doc 00 v1.5 §25.3 `MIG-005` row, §1.E binding rules 1–5, §25.2 (`FND-01` extension).
- SRS v1.3 `ENV-SRS-001`, `ENV-SRS-002`, `ENV-SRS-007`; open item 26.
- Module Index v1.4 §`MIG-005` → `MIG-004` ordering; MSR v1.3 §26.1 rules 8–9, open item 26.
- `STR-03` §8.3 mapping table: `dev`→DEVELOPMENT, `qa`→TEST, `uat`→UAT, add `demo`→DEMO, `prod`→PRODUCTION, `staging` = pre-production mirror inheriting PRODUCTION's gate.
- `DEC-013` clause 2.

## Approved scope
- One canonical environment module in `@aix/foundation`: deployment identifiers (`Environment`, adding `demo`), canonical names (`CanonicalEnvironment`), a single exact-match membership test, a total fail-closed mapping, and a production-gate applicability predicate.
- `loadConfig` reuses that module (no duplicated vocabulary in the foundation).
- Targeted unit tests.

## Exclusions (must not be done)
- `MIG-004` (CFG-01 `environment_scope`, decision-chain step 4) and every other `MIG-00x`.
- Any DB migration (the accepted definition names the Foundation type only).
- CFG-01, WLT-01 or any service behaviour change; any capability enablement; Exchange / RWA / Pay / `securities_market.*` work.
- Changing `assertNoExchangeRuntime` (`MIG-001`).
- Revising `DEC-013` or any master.

## Acceptance criteria (checkable from repository evidence)
- [ ] `Environment` = `dev | qa | uat | demo | staging | prod`; canonical names are exactly DEVELOPMENT / TEST / UAT / DEMO / PRODUCTION.
- [ ] `staging` and every unknown / malformed / wrong-case value resolve to PRODUCTION.
- [ ] `loadConfig` still aborts startup on any unrecognised `ENVIRONMENT`.
- [ ] No activation, availability or eligibility helper is introduced.
- [ ] No migration file added; migration head remains 070.
- [ ] `npm run typecheck` exit 0; `npm test` introduces no new failure against the baseline.
