# AST-01 — 10 Test Cases

**Status: PLANNED / AWAITING REVIEW. No test code is written by this task.** Strategy follows Master Testing Strategy: `vitest`, real Postgres for DB-level tests (the repository's existing pattern), pure-function tests without I/O for derivation. Every test here maps to an invariant (01 §2), and the security hard rule gets **exhaustive** rather than sampled coverage.

Test IDs are stable; the implementation task's `03-evidence.md` must report pass/fail per ID.

## T-DER — derivation (pure function, exhaustive)

| ID | Test |
|---|---|
| T-DER-01 | **Full-grid**: for every (effective outcome ∈ {UNRESOLVED, NON_SECURITY, SECURITY, SYNTHETIC-emulating-NON_SECURITY, SYNTHETIC-emulating-SECURITY}) × (asset class ∈ all 10) × (product ∈ 6) × (environment ∈ 5 canonical + unknown) — compare against an independently written expected table (a **second, hand-written oracle** in the test, not derived from the constant) |
| T-DER-02 | `UNRESOLVED` ⇒ `NOT_ASSESSED` for every product/class/env (INV-02) |
| T-DER-03 | Every step-4 conjunct (C1–C5) individually failing turns `PERMITS` into a non-`ELIGIBLE` state; **none** turns a step-3 non-`PERMITS` into `ELIGIBLE` (property test with random conjunct states) (INV-04) |
| T-DER-04 | `NON_SECURITY` × RWA family × Spot/OTC/Pay/secondary ⇒ `NOT_ASSESSED` with `RWA_ROUTE_REGULATORY_QUESTION_OPEN` (R4-Q6/Q7 not assumed) |
| T-DER-05 | Determinism: same inputs ⇒ same output; function is pure (no clock, no I/O) |
| T-DER-06 | Class is narrowing only: no class alone yields `ELIGIBLE` without a classification |
| T-DER-07 | `OTHER_PERMITTED` ⇒ `NOT_ASSESSED` everywhere; `FIAT_CURRENCY` ⇒ `INELIGIBLE` everywhere (HD-1 default) |
| T-DER-08 | Deposit/withdrawal: each conjunct removed individually ⇒ not `ELIGIBLE`; instrument with zero permitted products ⇒ not deposit-eligible |
| T-DER-09 | Chain: `SECONDARY_MARKET` derived before `EXCHANGE`; `EXCHANGE` without attestation ⇒ `NOT_ASSESSED` `SECURITIES_MARKET_ADMISSION_ABSENT` |

## T-SEC — the hard rule (INV-01) — **release-blocking**

| ID | Test |
|---|---|
| T-SEC-01 | Property test over all inputs: `SECURITY` outcome (real or synthetic-emulating) × `SPOT`/`OTC` **never** yields `ELIGIBLE`, across all classes, all environments including DEVELOPMENT/TEST/UAT/DEMO and unknown, with **every** conjunct set to its most permissive value |
| T-SEC-02 | Same for `PAY` (matrix note 4) |
| T-SEC-03 | Matrix boot self-test: mutate `ELIGIBILITY_MATRIX_V1` (test-only clone with a `SECURITY×SPOT` cell set `ELIGIBLE`) ⇒ `assertMatrixInvariants()` throws; service refuses to start |
| T-SEC-04 | **DB backstop**: raw `INSERT` into `eligibility_decision_log` with `decision='allow'`, `subject='SPOT'`, `effective_outcome='SECURITY_OR_SECURITY_TOKEN'` ⇒ CHECK violation. Same for `OTC`, for `synthetic_emulates='SECURITY'`, for `UNRESOLVED`, for synthetic in `PRODUCTION` |
| T-SEC-05 | Raw `INSERT` into `eligibility_decision_token` for a security outcome × Spot/OTC ⇒ CHECK violation |
| T-SEC-06 | Raw `INSERT` of a `product_admission` for `SPOT`/`OTC`/`PAY` against a `SECURITY` record ⇒ trigger raise, **even in `PROPOSED`** |
| T-SEC-07 | Admission API for Spot/OTC on a security instrument ⇒ `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` + `ast1.eligibility.security_instrument_refused_for_mb_product` event |
| T-SEC-08 | End-to-end: instrument classified `NON_SECURITY`, admission `APPROVED`, decision `ELIGIBLE`, token minted → reclassify `SECURITY` → `verify-decision` ⇒ `AST1_DECISION_STALE`; fresh `evaluate` ⇒ deny; token revoked; `instrument_revoked` event |
| T-SEC-09 | Applying the `NON_SECURITY→SECURITY` record leaves the previously `APPROVED` Spot admission **inert**, not eligible |
| T-SEC-10 | Attempt to set an `attr_*`/class/any column to change Spot eligibility of a security instrument: no such column/endpoint exists (covered by T-SCH-01, T-API-01) |
| T-SEC-11 | `verify-decision` re-asserts the hard rule in code: craft a token row for a security outcome (bypassing the CHECK on a test DB without the constraint) ⇒ still refused |

## T-SCH — schema shape (INV-03)

| ID | Test |
|---|---|
| T-SCH-01 | Introspect `information_schema.columns` for schema `ast1`: **no** column name matches `/eligib/i` except an allow-list `{eligibility_decision_log.eligibility_state, eligibility_decision_token.*}`; adding one fails the test |
| T-SCH-02 | No table/column named or defaulting to a classification outcome; `UNRESOLVED` appears only as a `CHECK` member on `classification_case`/`classification_record` |
| T-SCH-03 | `instrument.attr_*`, `amount_scale`, `declared_synthetic` are `NOT NULL` with **no default** |
| T-SCH-04 | No `DELETE` grant on any `ast1` table for the runtime role; no `UPDATE` on ledger/evidence/log |
| T-SCH-05 | No FK or grant into other modules' schemas (F3(c)) |

## T-CLS — classification lifecycle

| ID | Test |
|---|---|
| T-CLS-01 | New instrument: derives `UNRESOLVED`; evaluating any product denies; no record exists |
| T-CLS-02 | Full happy path: propose → case → evidence → submit → IAM-02 approval → apply → record with `record_seq=1`; identity locked |
| T-CLS-03 | Maker = checker rejected at IAM-02 stub, at AST-01 local check, and at DB CHECK (three separate tests) (INV-05) |
| T-CLS-04 | Checker who attached evidence ⇒ `AST1_CHECKER_CONFLICT` |
| T-CLS-05 | Approval bound to a different `payload_hash` ⇒ `AST1_APPROVAL_INVALID`; evidence added after request ⇒ `AST1_PAYLOAD_DRIFT`; change stays `requested`, retriable with a fresh approval |
| T-CLS-06 | Records append-only: UPDATE/DELETE via SQL rejected; `record_seq` gapless under concurrent submits (advisory lock/row lock test) |
| T-CLS-07 | Identity drift: mutate an identity column by direct SQL on a test DB without the trigger ⇒ derivation collapses to `UNRESOLVED` `CLASSIFICATION_IDENTITY_DRIFT` and integrity sweep places a system hold |
| T-CLS-08 | Identity edit after lock ⇒ `AST1_INSTRUMENT_IDENTITY_LOCKED` |
| T-CLS-09 | `SECURITY → NON_SECURITY` needs elevated approval + fresh evidence bundle; reusing the earlier bundle refused (HD-8, if approved) |
| T-CLS-10 | Presumptive-securities class + `NON_SECURITY` ⇒ `AST1_CLASS_CLASSIFICATION_CONFLICT` (HD-4, if approved) |
| T-CLS-11 | Reversion to `UNRESOLVED` record ⇒ all products `NOT_ASSESSED` |
| T-CLS-12 | Only one non-terminal case per instrument |
| T-CLS-13 | Submission gate: stablecoin without known backing ⇒ `INSTRUMENT_PROFILE_INCOMPLETE`; missing precision ⇒ `ASSET_PRECISION_INVALID` |

## T-EVD — evidence standard (R4-Q3 modelled, not answered)

| ID | Test |
|---|---|
| T-EVD-01 | PRODUCTION config: submitting/applying a classification with no approved production standard ⇒ `EVIDENCE_STANDARD_NOT_ESTABLISHED`; instrument stays `UNRESOLVED` |
| T-EVD-02 | A standard applicable to PRODUCTION cannot reach `APPROVED` without `r4q3_resolution_ref` (DB CHECK) |
| T-EVD-03 | Non-production standard allows classification in DEV/TEST/UAT/DEMO |
| T-EVD-04 | Retiring a standard ⇒ system holds on instruments relying on it (in covered environments) |
| T-EVD-05 | No evidence-standard row exists after migrations (nothing seeded APPROVED) |
| T-EVD-06 | `features_assessment` validated against the standard's own schema; AST-01 contains no hard-coded securities-features checklist (grep test on source) |

## T-SYN — synthetic instruments (INV-07, `AST-SRS-001A`)

| ID | Test |
|---|---|
| T-SYN-01 | `SYNTHETIC_TEST_INSTRUMENT` in `PRODUCTION` config ⇒ derives all `INELIGIBLE` `SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION`, critical event, system hold |
| T-SYN-02 | Real instrument + synthetic outcome ⇒ refused (trigger); synthetic instrument + `NON_SECURITY`/`SECURITY` outcome ⇒ refused (**no promotion path exists**) |
| T-SYN-03 | Code prefix: `declared_synthetic` ⇔ `^SYN[.-]` (CHECK both ways) |
| T-SYN-04 | Synthetic evidence cannot be cited by a real instrument's bundle |
| T-SYN-05 | A synthetic record's `recorded_environment = 'PRODUCTION'` rejected by CHECK |
| T-SYN-06 | Synthetic emulating `SECURITY` in non-production: Spot/OTC never eligible (T-SEC-01 covers); RWA/secondary/Exchange derive normally |
| T-SYN-07 | A DB snapshot restored from non-production into a PRODUCTION-config service: every record has `recorded_environment ≠ PRODUCTION` ⇒ everything collapses to `UNRESOLVED` (`CLASSIFICATION_ENVIRONMENT_MISMATCH`) (INV-08) |

## T-ENV — environment handling (INV-06)

| ID | Test |
|---|---|
| T-ENV-01 | Own environment used, not the caller's; caller asserts `dev` against a `prod` service ⇒ deny `environment_mismatch`, log row carries authoritative value, critical event, **no token** |
| T-ENV-02 | `staging` and unknown ⇒ PRODUCTION behaviour |
| T-ENV-03 | Token issued under one environment does not verify under another (`AST1_DECISION_BINDING_MISMATCH`) |
| T-ENV-04 | Control parity: identical derived output in all five environments for a non-synthetic instrument with identical state |
| T-ENV-05 | Permanently prohibited/security request with mismatched environment denies as the hard-rule/prohibited reason, not as mismatch (precedence, as `MIG-004`) |

## T-CNJ — conjunct controls (narrow-only)

| ID | Test |
|---|---|
| T-CNJ-01 | Prohibited attributes (`privacy_coin`, `algorithmic_stablecoin`, `yield_bearing`, `derivative_like`, `myr_denominated`, `ALGORITHMIC` backing) each ⇒ `ASSET_NOT_ALLOWED`; no endpoint or role (incl. Super Admin) can clear one |
| T-CNJ-02 | Admission requires `PERMITS`; approved admission against a superseded record ⇒ `PRODUCT_ADMISSION_NOT_APPROVED` |
| T-CNJ-03 | Jurisdiction: `BLOCK`, `ALLOW_ONLY`, missing jurisdiction with `ALLOW_ONLY` ⇒ `CLIENT_JURISDICTION_REQUIRED`; no rule + `jurisdiction_assessed=false` cannot approve admission |
| T-CNJ-04 | Transfer restriction: `effect` other than `DENY` rejected (CHECK); `UNASSESSED` profile blocks RWA/secondary/Exchange and security-outcome withdrawal; published `restrictions` list returned to caller |
| T-CNJ-05 | Custody: no enum value for AIX self-custody; `NOT_SUPPORTED`/absent ⇒ deposit/withdrawal not eligible |
| T-CNJ-06 | Operational state `ENABLED` requires approved change (CHECK); tighten actions single-actor and immediately effective |
| T-CNJ-07 | Attestation from `EXM-01` for a non-security instrument ⇒ `AST1_ATTESTATION_INVALID` |
| T-CNJ-08 | Precision: `amount_scale > on_chain_decimals` ⇒ `ASSET_PRECISION_INVALID`; scale immutable after lock |
| T-CNJ-09 | Network not in registry ⇒ `AST1_NETWORK_NOT_REGISTERED`; duplicate on-chain identity ⇒ `AST1_INSTRUMENT_DUPLICATE_IDENTITY`; address canonicalisation makes case/format variants collide |
| T-CNJ-10 | Underlying: self-reference/cycle rejected; `ALGORITHMIC` requires the attribute |

## T-HLD — holds and revocation

| ID | Test |
|---|---|
| T-HLD-01 | Single actor places hold ⇒ immediate `UNRESOLVED`; outstanding tokens revoked; release needs M+C |
| T-HLD-02 | Hold placement never writes a classification record |
| T-HLD-03 | System holds fire for: fingerprint mismatch, synthetic-in-PRODUCTION, standard retirement |
| T-HLD-04 | Releasing a hold when the prior record no longer validates ⇒ stays `UNRESOLVED` |

## T-TOK — evaluate/verify

| ID | Test |
|---|---|
| T-TOK-01 | Token single-use under concurrency (N parallel verifies ⇒ exactly one success) |
| T-TOK-02 | Expired token rejected (clock injected); `payload_binding` mismatch rejected |
| T-TOK-03 | Only `allow` mints; deny returns `token: null`; DB CHECK on token `decision` |
| T-TOK-04 | Every evaluate outcome writes exactly one log row incl. unresolved instrument |
| T-TOK-05 | Internal error/timeout in evaluate ⇒ deny `ELIGIBILITY_STATE_UNREADABLE`, never allow |

## T-API — contract and boundary

| ID | Test |
|---|---|
| T-API-01 | No request or response schema in the OpenAPI/zod set contains an eligibility-setting field; the only eligibility fields are derived outputs |
| T-API-02 | Every eligibility response contains `conjunct` and `not_evaluated` (INV-10); never `access`/`granted` |
| T-API-03 | Unlisted service identity ⇒ `SERVICE_IDENTITY_REQUIRED` before any state read |
| T-API-04 | Idempotent replay returns the original result; fingerprint mismatch errors |
| T-API-05 | Stale `expected_version` ⇒ `AST1_VERSION_CONFLICT` |

## T-BND — module boundary (INV-13, INV-14)

| ID | Test |
|---|---|
| T-BND-01 | `findProhibitedExchangeRoutes(ast1RouteTable)` returns empty; boot self-test present |
| T-BND-02 | Import test: no `services/*` source from another service imported; only `@aix/foundation` |
| T-BND-03 | AST-01 exposes no order, matching, quoting, pricing, ledger-posting or issuance function (route and export scan) |
| T-BND-04 | The word `exchange` does not appear in any AST-01 route path or `exchange.*` identifier; `EXCHANGE` occurs only as an enum value |

## T-AUD — audit and evidence (INV-12)

| ID | Test |
|---|---|
| T-AUD-01 | Each state-changing route emits its 08 event in the same transaction (kill the process between write and publish ⇒ neither persists) |
| T-AUD-02 | Decision-log row contains record id/seq and matrix version for every decision; reconstruction test rebuilds "why" from ledger + log alone |
| T-AUD-03 | No evidence bytes, raw tokens or client ids in audit metadata (secret-scan test on captured events) |
| T-AUD-04 | Decision log and classification tables reject UPDATE/DELETE |

## T-DB — database backstops (run against a real migrated DB)

`T-DB-01` identity immutability trigger; `T-DB-02` lifecycle transition guard (no `IDENTITY_LOCKED → DRAFT`); `T-DB-03` `record_seq` gapless/unique; `T-DB-04` class/outcome trigger; `T-DB-05` standard applicability trigger; `T-DB-06` `governed_change` maker≠checker CHECK with `TIGHTEN` exemption; `T-DB-07` partial unique index (one open case; one live admission per instrument/product); `T-DB-08` privilege matrix (05 §8).

## T-INT — integrity sweep

`T-INT-01` detects fingerprint drift; `T-INT-02` detects orphaned admissions; `T-INT-03` detects synthetic rows in PRODUCTION; `T-INT-04` idempotent and non-destructive (only places holds/emits events).

## T-ERR

`T-ERR-01` every thrown code has HTTP mapping and is documented in 09; `T-ERR-02` every reason code length ≤ 48 (column width); `T-ERR-03` master-defined codes spelled verbatim.

## Non-goals of this suite

No trading, matching, ledger, issuance or venue tests (other modules). No test asserts that any real asset is or is not a security. No test depends on `R4-Q*` being answered.
