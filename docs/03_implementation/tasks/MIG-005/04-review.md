# 04 Review — MIG-005 (round 1)

- **Reviewer:** architecture/security/governance reviewer / claude-opus-5-5 / HIGH
- **Decision:** ACCEPT — with controlled carry-forwards (`CFG-FIND-001`, `FND-FIND-012`, `FND-FIND-013`, `WLT-FIND-016`, governance cleanup G-1)
- **Human approval required:** true
- **Evidence reviewed:** `03-evidence.md`; commit `5f78a0b`; `platform/packages/foundation/src/{environment,config,index}.ts`; `platform/tests/unit/mig005-environment.test.ts`; every environment consumer in `platform/{packages,services,apps,edge,perf,infra}`; Doc 00 v1.5 §1.E, §25.2, §25.3; Charter v1.5 §26.1; SRS v1.3 `ENV-SRS-001`…`008` and open item 26; Role Matrix v1.3 §3.8; MSR v1.3 `SYS-RULE-006`…`011`, `SYS-RULE-007A`, `LIC-RULE-002A`, `CFG-RULE-005` and open item 26; `DEC-013`; `STR-03` §8.3; masters 08/10/11 for staging's role.

> **Independence limitation.** This review ran in the same model session that implemented `5f78a0b`. The evidence below was re-collected rather than carried over from the implementation report: a fresh test run at HEAD, a fresh baseline run with the `9bc49aa` sources restored, and runtime probes. Even so, the review is not independent in the sense `tasks/README.md` intends. If independence is required, a reviewer from a different model or session should repeat it before a human accepts.

## 1. Accepted scope (reconstructed from the masters, not from the report)
From Doc 00 §25.3 `MIG-005`, §1.E rules 4–5, `STR-03` §8.3, `ENV-SRS-001`/`002`/`007`, `SYS-RULE-007`:
1. The Foundation `Environment` type maps onto DEVELOPMENT / TEST / UAT / DEMO / PRODUCTION, with `demo` added.
2. The pre-production mirror inherits PRODUCTION's gate, not UAT's.
3. An unknown or unmapped environment is treated as PRODUCTION and fails closed.
4. MIG-005 precedes `MIG-004`, and nothing in it activates or makes available any capability.

Consumer adoption (CFG-01 `environment_scope`, WLT-01, readiness) is **not** in the §25.3 definition.

## 2. Verdicts
| Question | Verdict | Basis |
|---|---|---|
| One canonical model | PASS | `environment.ts` is the only foundation vocabulary; `config.ts` imports it. Downstream copies (CFG-01, WLT-01) predate MIG-005 and are FND-FIND-013 |
| Five canonical environments | PASS | `CANONICAL_ENVIRONMENTS`; test asserts exact list and full coverage |
| `demo` first-class | PASS at foundation; **not yet adopted downstream** (FND-FIND-013, fail-closed) | `loadConfig` accepts `demo` → DEMO |
| `staging` → PRODUCTION | PASS | Only mapping the masters permit; staging is the production mirror (Deployment Strategy v1.2 "mirror production", same artefact promoted). Correct under either reading of "until decided", because the undecided state also fails closed as PRODUCTION |
| Unknown / malformed | PASS | Own-property exact match; prototype keys, whitespace variants, wrong case and non-strings → PRODUCTION; `loadConfig` still aborts startup |
| No capability activation | PASS | Module classifies only. No availability, activation or eligibility state exists. No CFG-01, migration or feature row changed |
| No `non-production == allowed` API | PASS, with a MIG-004 constraint | `isProductionGated() === false` is documented as not permission and has no consumer. MIG-004 must derive availability from an explicit `ENABLED` state, never from `!isProductionGated` |
| Permanent locks | PASS | `no-exchange.ts` untouched and environment-blind; prohibited-feature registry untouched |
| MIG-004 not started | PASS | CFG-01 `decision.ts` step 4 still "STRUCTURALLY N/A"; no `environment_scope` |
| Regression | **BASELINE-EQUIVALENT ENVIRONMENTAL FAILURES / ZERO NEW FAILURES** | HEAD 69 failed / 4953 passed / 269 skipped of 5291. Fresh baseline (`9bc49aa` sources restored) 69 / 4903 / 269 of 5241. Failing sets are identical test for test. All 69 are `tests/integration` DB-setup failures (`TEST_DATABASE_URL` unset, placeholder host `unused`, app not built). No unit-test failure. `tsc -b` exit 0 |

## 3. F01 — production-literal comparisons (complete inventory, 18 sites)
| # | Site | Cat. | Current | Required under DEC-013 | Verdict |
|---|---|---|---|---|---|
| 1–9 | `services/{fnd,iam,iam2,sec1,cfg1,clt1,aml1,kyc1,wlt1}/src/server.ts` log level | E | `info` in prod, `warn` elsewhere (staging = warn) | None | Intentional; no action |
| 10–11 | `services/iam/src/config.ts:117,122,131` DB-pool inputs required in prod | D | prod-only | None (FND-FIND-010 accepted prod-only) | Intentional; no action |
| 12 | `services/aml1/src/config.ts:246` stub screening banned | B | prod-only | Staging data is masked/synthetic (masters 08/10/11); Doc 00 §1.E rule 2 mandates mock integrations outside live operation. The ban protects real subjects, who exist only in prod | Intentional; not the §21 gate; no action |
| 13–15 | `services/wlt1/src/config.ts:586,654,660` stub screening / beneficiary / fiat-screening banned | B | prod-only | As #12 | Intentional; no action |
| 16 | `services/wlt1/src/config.ts:701` receipt secret required | C | prod-only | None; absence already fails closed (unauthenticatable route) | Intentional; no action |
| 17 | `services/wlt1/src/config.ts:666` `WLT1_FIAT_VERIFICATION_REQUIRED` must be true | A | forced true only in prod; settable `false` elsewhere | `SYS-RULE-007A`: no control may be disabled for non-production convenience, so it must be true in **all five** environments once consumed. No runtime consumer exists today (inert) | Pre-existing; not caused by MIG-005 → **WLT-FIND-016** (INFORMATIONAL / FUTURE_CONSUMER) |
| 18 | `services/fnd/src/routes/system.ts:41` readiness `licence_lock_interface` blocking | A | blocking only for `prod`; `staging` reports ready | Mirror inherits PRODUCTION's gate (`SYS-RULE-007`, Doc 00 §1.E rule 5). The licence-lock readiness placeholder is a licence-gate surrogate, so staging should block identically | Permissive in staging → **FND-FIND-012**. Not a MIG-005 defect: consumer adoption is outside the §25.3 scope, and no staging deployment exists |

**F01 acceptance impact:** none. Mass replacement with `isProductionGated` would be wrong for #1–#16.

## 4. F02 — `demo` absent downstream (verified)
- CFG-01 `routes/features.ts:51` TypeBox union rejects `"demo"`. Probe: `Value.Check(schema,"demo") === false`. Callers (CLT-01 `cfg1-client.ts`) treat non-2xx as a fail-closed deny.
- WLT-01 `buildCanonicalPocMessage` throws on `domainEnvironment 'demo'` (`message.ts:80`, probed) **before** signing or persistence. Migration 053 `domain_environment` CHECK is a second barrier.
- `as PocDomainEnvironment` casts at `routes/proof-of-control.ts:264` and `routes/public/proof-of-control.ts:193` became type-unsound with MIG-005. `tsc` cannot see it. The runtime builder check contains it, so the result is fail-closed (500-class error), not unsafe.
- Migration 001 `release_registry.environment` CHECK excludes `demo` (no runtime writer found in `services/**`).
- **Adjudication:** adoption fallout, not a MIG-005 contract breach. The §25.3 definition names the Foundation type only, and every path fails closed. Historical migrations stay immutable: widening needs **new** migrations. Adding `demo` to the PoC vocabulary is additive. Existing signed messages carry `dev`…`prod` and are unaffected, but the frozen v1 message format's value domain belongs to WLT-01 and needs its own decision. The CFG-01 part belongs in MIG-004. Tracked as **FND-FIND-013**; blocks any DEMO deployment, not MIG-005.

## 5. F03 — caller-supplied CFG-01 environment (trust model)
- **Authentication today:** one shared `x-internal-service-token` proves "some approved internal caller" only (`plugins/internal-identity.ts`, an accepted interim model). `environment` and `caller_module` are unauthenticated caller assertions.
- **Current effect:** hashed, logged, stored in the decision log and bound into the decision token (`decision-token.ts:234`). **Not evaluated** (decision chain step 4 N/A). No bypass exists today.
- **After MIG-004:** any holder of the shared token calling a PRODUCTION CFG-01 could assert `dev` and receive an `allow` for a capability ENABLED in DEVELOPMENT but DISABLED in PRODUCTION. The decision token would also verify, because the caller re-asserts the same value. That is a direct `SYS-RULE-007`/`SYS-RULE-011` production-gate bypass.
- **Masters:** Role Matrix §3.8 rule 5 ("records the environment it was **evaluated in**"), `SYS-RULE-007` (enforced at CFG-01 and every service bootstrap) and `CFG-RULE-005` place environment authority at the evaluator. Nothing in the masters authorises a caller to choose it.
- **Required model (A as authority + B as consistency check):** CFG-01 evaluates **only** `canonicalEnvironment(ownConfig.environment)`, i.e. its own bootstrap-validated `ENVIRONMENT`. A caller-supplied `environment`, if kept on the wire, must equal CFG-01's own identifier exactly, or the request is denied fail-closed and audited as an environment mismatch. The decision log and token record CFG-01's own value. Pure A silently hides a misrouted caller (e.g. a staging service pointed at a production CFG-01); B alone would still trust the caller.
- **Registered:** **CFG-FIND-001**. Closure: MIG-004 lands the model above, with tests proving (i) mismatch is denied and audited, (ii) evaluation uses CFG-01's own environment, (iii) a token issued under one environment cannot verify under another CFG-01 environment.

## 6. F04 — "undecided" wording (exact locations)
1. Doc 00 v1.5 §1.E rule 5 (line 219): "fails closed until the mapping is decided (`MIG-005`, §25.3)".
2. Doc 00 v1.5 §25.3 `MIG-005` row (line 2395): status "Specified. Precedes `MIG-004`" (now implemented).
3. Charter v1.5 §26.1 rule 9 (lines 1595–1597): same "until the mapping is decided (`MIG-005`)".
4. SRS v1.3 open item 26 (line 2203): "The pre-production mirror's environment mapping (`MIG-005`)".
5. MSR v1.3 open item 26 (line 2184): combined with `MIG-004`. Only the MIG-005 half is resolved.
6. `STR-03` §8.3 (line 487, DRAFT): "Decided by `MIG-005`; fail closed until then".
7. Unrelated stale residual found while checking this: Charter v1.5 line 1834 `environment_matrix = dev_test_staging_prod` (four-environment config summary) contradicts the Charter's own §26.1 five-environment matrix.

**Adjudication:** stale wording, **not a contradiction**. Every passage fixes the outcome (mirror → PRODUCTION's gate, fail closed until mapped), and the code's mapping equals that fail-closed outcome. Governance cleanup **G-1**, in a separate docs turn: record the mapping as decided in items 1–6, split MSR item 26, and correct item 7. Not a finding; does not block.

## 6A. Corrections to the implementation report (left unedited as the implementer's account)
- It cites "MSR §26.1 rule 9". The rule is **Charter v1.5 §26.1 rule 9**; the MSR equivalent is `SYS-RULE-007`.
- It says WLT-01 PoC issuance with `demo` "fails at the DB CHECK". It actually fails earlier, at `buildCanonicalPocMessage` (`message.ts:80`), before signing or persistence (probed). The migration 053 CHECK is a second barrier.

## 7. Root causes
- **Consumer adoption of the canonical model:** FND-FIND-012 (permissive in staging) and FND-FIND-013 (restrictive in demo). Same root, opposite risk direction and different owners, so kept separate.
- **Trust boundary:** CFG-FIND-001, independent of MIG-005's code; becomes live with MIG-004.
- **Pre-existing SYS-RULE-007A conformance:** WLT-FIND-016, inert.
- **Documentation:** G-1.

## Findings
| ID | Severity | Category | Description | Evidence | Recommended action |
|---|---|---|---|---|---|
| CFG-FIND-001 | HIGH | trust-boundary | CFG-01 evaluates a caller-asserted `environment`; latent production-gate bypass once MIG-004 evaluates it | `services/cfg1/src/routes/features.ts:51,133,218`; `plugins/internal-identity.ts` | Close inside MIG-004 (model §5); MIG-004 acceptance criterion |
| FND-FIND-012 | LOW | adoption | Readiness licence-lock blocks only `prod`; the `staging` mirror reports ready | `services/fnd/src/routes/system.ts:41` | Use `isProductionGated` for this check; before any staging deployment |
| FND-FIND-013 | LOW | adoption | `demo` rejected by CFG-01 schema, WLT-01 PoC vocabulary/builder and migration 001/053 CHECKs; unsound casts | see §4 | MIG-004 (CFG-01); WLT-01 task + new migrations; before any DEMO deployment |
| WLT-FIND-016 | INFORMATIONAL | future-consumer | `WLT1_FIAT_VERIFICATION_REQUIRED` may be `false` outside prod, contrary to `SYS-RULE-007A` | `services/wlt1/src/config.ts:666` | Force `true` in all five environments when a consumer lands |

Severity basis: CFG-FIND-001 follows the register's precedent for a latent control bypass with a trigger (`IAM2-FIND-002`, HIGH). The LOW and INFORMATIONAL rows fail closed or are inert. A human may re-grade.

## Escalation decision
none

## MIG-004 gate
**MIG-004 MAY START** once a human records acceptance of MIG-005, **subject to its approved `01-plan.md` including**:
1. The CFG-FIND-001 trust model (§5) as in-scope work and an acceptance criterion.
2. CFG-01 accepting `demo` (FND-FIND-013, CFG-01 part).
3. Evaluation via `canonicalEnvironment()` of CFG-01's own environment. `staging` shares PRODUCTION's availability and activation.
4. Availability only from an explicit per-environment `ENABLED` state; never `!isProductionGated(...)`; absent or unknown state → deny (`SYS-RULE-010`).

## Rationale
`5f78a0b` delivers exactly the §25.3 foundation contract. It fails closed in every tested unknown or malformed case, grants nothing, and leaves every lock and CFG-01 untouched. Each observation is outside the migration's defined scope, fails closed today, or is inert. None shows that MIG-005 itself fails its contract. The one material risk (CFG-FIND-001) becomes live only with MIG-004 and is gated there.
