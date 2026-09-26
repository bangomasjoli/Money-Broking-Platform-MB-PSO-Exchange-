# AST-01 — 10 Test Cases (v1.1)

**Status: REMEDIATED / AWAITING RE-REVIEW. No test code is written by this task.** Strategy follows Master Testing Strategy: `vitest`, real Postgres for DB-level tests (the repository's existing pattern), pure-function tests without I/O for derivation. Every test here maps to an invariant (01 §2), and the security hard rule gets **exhaustive** rather than sampled coverage.

Test IDs are stable; the implementation task's `03-evidence.md` must report pass/fail per ID.

## T-DER — derivation (pure function, exhaustive)

| ID | Test |
|---|---|
| T-DER-01 | **Total-grid boot invariant and oracle [F10]:** for every (outcome state ∈ {UNRESOLVED, NON_SECURITY, SECURITY, SYNTH→NON_SECURITY, SYNTH→SECURITY}) × (**all 10 asset classes**) × (**all 10 subjects**) × (environment ∈ 5 canonical + unknown) — assert a defined result in the vocabulary, and compare against an independently hand-written oracle in the test (not derived from the constant) |
| T-DER-02 | **Totality:** remove one cell from a test-only clone of `ELIGIBILITY_MATRIX_V2` ⇒ that cell evaluates `NOT_ASSESSED` `MATRIX_CELL_NOT_DEFINED`, and `assertMatrixInvariants()` flags the clone; **no cell may evaluate `PERMITS`/`ELIGIBLE` by default** |
| T-DER-03 | Every conjunct (C0–C6) failing individually turns `PERMITS` into a non-`ELIGIBLE`; **none** turns `INELIGIBLE`/`NOT_ASSESSED` into `ELIGIBLE` (property test, random conjunct states) (INV-04, AST-HD-2) |
| T-DER-04 | `NON_SECURITY` × `RWA_FAMILY` × {Spot, OTC, Pay, MB custody} ⇒ `NOT_ASSESSED` (`R4-Q6`/`R4-Q7` not assumed); × `RWA` subject ⇒ `PERMITS`; × `SECONDARY_MARKET` ⇒ `NOT_ASSESSED` (01 §5.9) |
| T-DER-05 | Determinism and purity (no clock, no I/O) |
| T-DER-06 | Class is narrowing only: no class alone yields `ELIGIBLE` without a classification |
| T-DER-07 | `OTHER_PERMITTED` ⇒ `NOT_ASSESSED`; **`FIAT_CURRENCY` ⇒ `NOT_APPLICABLE` for every subject, never `INELIGIBLE`** [F08] |
| T-DER-08 | Deposit/withdrawal **per domain**: each conjunct removed ⇒ not `ELIGIBLE`; ≥ 1 same-domain admission required; **`SECURITY` × `DEPOSIT_MB_PSO`/`WITHDRAWAL_MB_PSO` ⇒ `INELIGIBLE` even when `RWA`/`SECONDARY_MARKET`/`SECURITIES_MARKET` subjects permit** [F01] |
| T-DER-09 | **Real `SECURITY` × {`RWA`, `SECONDARY_MARKET`, `SECURITIES_MARKET`, `DEPOSIT_SECURITIES`, `WITHDRAWAL_SECURITIES}` ⇒ `NOT_ASSESSED` `SECURITIES_ROUTE_REAL_INSTRUMENT_NOT_ASSESSED` in every environment** [F03]; **synthetic→SECURITY in non-production ⇒ `PERMITS`** on the same cells; synthetic in PRODUCTION ⇒ `INELIGIBLE` |
| T-DER-10 | `SECURITIES_MARKET` chain: `SECONDARY_MARKET` derives without any attestation; `SECURITIES_MARKET` requires the attestation **bound to the current record**; a newer record ⇒ `SECURITIES_MARKET_ATTESTATION_STALE` [F13] |
| T-DER-11 | A hold yields `INSTRUMENT_ON_HOLD` **without altering `effective_outcome`**; a held `SECURITY` instrument still returns `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` for MB/PSO subjects [F07] |
| T-DER-12 | `TOKENISED_DEBT`/`TOKENISED_FUND` start `UNRESOLVED`, accept `NON_SECURITY` or `SECURITY` on evidence, and are **not** rejected by the class-label rule (AST-HD-4); `SECURITY`/`SECURITY_TOKEN` classes + `NON_SECURITY` ⇒ `AST1_CLASS_CLASSIFICATION_CONFLICT` |

## T-SEC — the hard rule (INV-01) — **release-blocking**

| ID | Test |
|---|---|
| T-SEC-01 | Property test over all inputs: `SECURITY` outcome (real or synthetic-emulating) × **every MB/PSO-domain subject** (`SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO`) **never** yields `ELIGIBLE`, all classes, all environments including DEVELOPMENT/TEST/UAT/DEMO and unknown, with every conjunct at its most permissive value |
| T-SEC-02 | Matrix boot self-test: a test-only clone with a `SECURITY×MB/PSO` cell set to `PERMITS` (or any undefined cell defaulting to permit) ⇒ `assertMatrixInvariants()` throws; the service refuses to start |
| T-SEC-03 | **Authoritative SQL backstop [F04]:** raw `INSERT` into `eligibility_decision_log` with `decision='allow'` for an MB/PSO subject where the **ledger** says `SECURITY` ⇒ raises, **even when the row's own `effective_outcome`/`environment`/`synthetic_emulates` columns are falsified to say `NON_SECURITY`**. Same for the token table |
| T-SEC-04 | Backstop with **no current record**, `UNRESOLVED`, environment mismatch (via `deployment_environment`), fiat, synthetic-in-PRODUCTION, held, retired, real security on a securities-route subject ⇒ each raises for `allow` |
| T-SEC-05 | `allow` whose `classification_record_id` is **not the current record** ⇒ raises |
| T-SEC-06 | `product_admission` for `SPOT`/`OTC`/`PAY` against a `SECURITY` record ⇒ raises **even `PROPOSED`**; admission approved against a **stale** record ⇒ raises [F04, AST-HD-2] |
| T-SEC-07 | Admission/custody/operational APIs for MB/PSO subjects on a security instrument ⇒ `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` + event |
| T-SEC-08 | End-to-end: `NON_SECURITY`, admission `APPROVED`, `ELIGIBLE`, token → reclassify `SECURITY` → `verify-decision` ⇒ `AST1_DECISION_STALE`; tokens revoked; `instrument_revoked` event |
| T-SEC-09 | New `SECURITY` record leaves the earlier Spot admission **inert**, not eligible |
| T-SEC-10 | **Elevated-path bypass suite [F06]:** `SECURITY → UNRESOLVED → NON_SECURITY`; retire → recreate on the same contract; new asset with `SAME_ECONOMIC_SUBJECT` predecessor; merged lineage — **each** requires two distinct attested checkers and new post-`SECURITY` evidence, else `AST1_ELEVATED_APPROVAL_REQUIRED` |
| T-SEC-11 | `verify-decision` re-asserts the hard rule in code for MB/PSO subjects even if a token row is forced into a test DB lacking the constraint |
| T-SEC-12 | **Parity [T-DB-09]:** SQL backstop vs TypeScript matrix over all instrument states — the backstop denies wherever B1/B3/B5 apply and never allows a cell the matrix denies for B1/B3/B5 |

## T-DOM — domain and consumer binding [F01, F02]

| ID | Test |
|---|---|
| T-DOM-01 | A token minted for `RWA`, `SECONDARY_MARKET`, `SECURITIES_MARKET`, `DEPOSIT_SECURITIES` **does not verify** for `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO` or `WITHDRAWAL_MB_PSO` (`AST1_DECISION_BINDING_MISMATCH`) — full cross-product of subjects |
| T-DOM-02 | Token minted for consumer A does not verify for consumer B; caller-stated `subject`/`instrument_id` must equal the token's |
| T-DOM-03 | Service allow-list: an MB-domain service (`OMS-01`, `TRD-01`, `WLT-01`, `PAY-01`) calling any `RWA`/`SECURITIES` subject ⇒ `AST1_SUBJECT_NOT_PERMITTED_FOR_CALLER` before any state is read; `WLT-01` calling `DEPOSIT_SECURITIES` refused |
| T-DOM-04 | `consumer_service` distinct from caller only if **both** allow-listed for the subject |
| T-DOM-05 | Token bound to `classification_record_id` (not only seq): a record replaced with same seq (forced in test) ⇒ stale |
| T-DOM-06 | Consumer contract tests (stubs, for DCR-AST1-002/-004): unsolicited inbound security-token deposit ⇒ evaluate `DEPOSIT_MB_PSO` ⇒ `INELIGIBLE` ⇒ quarantine, no credit |

## T-FIA — fiat reference data [F08, AST-HD-1]

| ID | Test |
|---|---|
| T-FIA-01 | `evaluate` for a fiat instrument ⇒ `200`, `decision: not_applicable`, `NOT_APPLICABLE`, `SUBJECT_NOT_APPLICABLE_FIAT`, **no token**, never `deny`/`INELIGIBLE`; log row written; **no `allow` can be inserted for fiat** (backstop B3) |
| T-FIA-02 | Fiat cannot receive a classification case/record/admission/hold-derived outcome (triggers) |
| T-FIA-03 | `GET /currencies/{iso}` returns precision, `myr_denominated`, `classification_regime: NOT_APPLICABLE_FIAT`; retired/missing ⇒ `404 AST1_CURRENCY_NOT_FOUND` |
| T-FIA-04 | Contract test: a Spot pair `USDT/MYR` evaluates only the digital leg via `evaluate`; the fiat leg is a reference lookup — no consumer path treats `not_applicable` as deny |
| T-FIA-05 | Fiat form ⇔ fiat class; fiat cannot be synthetic or carry digital-only attributes |
| T-FIA-06 | Digital instrument with `attr_myr_denominated` ⇒ `ASSET_NOT_ALLOWED` (conservative carry-forward until OQ-6 assigns a pair-level MYR control) |

## T-SCH — schema shape (INV-03)

| ID | Test |
|---|---|
| T-SCH-01 | Introspect `information_schema.columns` for schema `ast1`: **no** column name matches `/eligib/i` except an allow-list `{eligibility_decision_log.eligibility_state, eligibility_decision_token.*}`; adding one fails the test |
| T-SCH-02 | No table/column named or defaulting to a classification outcome; `UNRESOLVED` appears only as a `CHECK` member on `classification_case`/`classification_record` |
| T-SCH-03 | `instrument.attr_*`, `amount_scale`, `declared_synthetic` are `NOT NULL` with **no default** |
| T-SCH-04 | No `DELETE` grant on any `ast1` table for the runtime role; no `UPDATE` on ledger/evidence/log/lineage merge |
| T-SCH-06 | **[F09]** `classification_record` has **no** synthetic-emulation column; `instrument_code`, `declared_synthetic`, `synthetic_emulates` are rejected on any UPDATE in every status |
| T-SCH-07 | `deployment_environment` is single-row and has no runtime write grant |
| T-SCH-05 | No FK or grant into other modules' schemas (F3(c)) |

## T-CLS — classification lifecycle

| ID | Test |
|---|---|
| T-CLS-01 | New instrument: derives `UNRESOLVED`; evaluating any product denies; no record exists |
| T-CLS-02 | Full happy path: propose → case → evidence → submit → IAM-02 approval → apply → record with `record_seq=1`; identity locked |
| T-CLS-03 | **[F05]** With an IAM-02 stub implementing the extended contract: maker ∈ attested approvers ⇒ rejected at the service and at the DB CHECK. **With a stub returning no approver identity ⇒ `AST1_APPROVER_ATTESTATION_MISSING`, nothing applied.** Governed classification apply is disabled in configuration until DCR-AST1-001(a)+(d) |
| T-CLS-04 | Checker who attached evidence ⇒ `AST1_CHECKER_CONFLICT` |
| T-CLS-05 | Approval bound to a different `payload_hash` ⇒ `AST1_APPROVAL_INVALID`; evidence added after request ⇒ `AST1_PAYLOAD_DRIFT`; change stays `requested`, retriable with a fresh approval |
| T-CLS-06 | Records append-only: UPDATE/DELETE via SQL rejected; `record_seq` gapless under concurrent submits (advisory lock/row lock test) |
| T-CLS-07 | Identity drift: mutate an identity column by direct SQL on a test DB without the trigger ⇒ derivation collapses to `UNRESOLVED` `CLASSIFICATION_IDENTITY_DRIFT` and integrity sweep places a system hold |
| T-CLS-08 | Identity edit after lock ⇒ `AST1_INSTRUMENT_IDENTITY_LOCKED` |
| T-CLS-09 | `elevated` is computed **by trigger from the ledger**; an application-supplied `elevated=false` is ignored; two attested checkers (`COMPLIANCE_OFFICER` + `MLRO`) and new post-`SECURITY` evidence required (AST-HD-8) |
| T-CLS-10 | `SECURITY`/`SECURITY_TOKEN` class + `NON_SECURITY` ⇒ `AST1_CLASS_CLASSIFICATION_CONFLICT`; `TOKENISED_DEBT`/`TOKENISED_FUND` not rejected by class label (AST-HD-4) |
| T-CLS-11 | Reversion to `UNRESOLVED` record ⇒ all products `NOT_ASSESSED` |
| T-CLS-12 | Only one non-terminal case per instrument |
| T-CLS-14 | **Lineage [F06]:** on-chain identity of any prior (incl. retired) instrument forces its lineage (`AST1_LINEAGE_CONTINUITY_REQUIRED` otherwise); lineage merge irreversible; real and synthetic lineages cannot merge; integrity sweep flags same-contract instruments outside a shared lineage (`ast1.integrity.lineage_gap_found`) |
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

## T-SYN — synthetic instruments (INV-07, `AST-SRS-001A`, AST-HD-3) [F09]

| ID | Test |
|---|---|
| T-SYN-01 | Synthetic outcome in `PRODUCTION` ⇒ all subjects `INELIGIBLE` `SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION`, critical event, SYSTEM hold |
| T-SYN-02 | Real instrument + synthetic outcome ⇒ refused; synthetic instrument + `NON_SECURITY`/`SECURITY` outcome ⇒ refused (no promotion path) |
| T-SYN-03 | `declared_synthetic ⇔ synthetic_emulates IS NOT NULL ⇔ code ~ '^SYN[.-]'` (CHECKs, all directions) |
| T-SYN-04 | **Single source of truth:** there is no emulation column on the record; a record cannot contradict the instrument. `synthetic_emulates` valid only for a declared synthetic instrument |
| T-SYN-05 | `instrument_code`, `declared_synthetic`, `synthetic_emulates` **immutable from INSERT** — UPDATE rejected in `DRAFT` and every later status |
| T-SYN-06 | Synthetic→SECURITY in non-production: Spot/OTC/Pay/MB custody never eligible (T-SEC-01); securities-route subjects derive normally (T-DER-09) |
| T-SYN-07 | Restoring a non-production DB into a PRODUCTION-config service: every record's `recorded_environment` (trigger-filled from `deployment_environment`) ≠ PRODUCTION ⇒ everything collapses to `UNRESOLVED` (INV-08) |
| T-SYN-08 | Synthetic evidence cannot enter a real instrument's bundle; synthetic and real lineages never merge |

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
| T-CNJ-01 | Prohibited attributes (`privacy_coin`, `algorithmic_stablecoin`, `yield_bearing`, `derivative_like`, digital `myr_denominated`, `ALGORITHMIC` backing) each ⇒ `ASSET_NOT_ALLOWED`; no endpoint or role (incl. Super Admin) can clear one. Fiat `myr_denominated` is an attribute only (T-FIA-06) |
| T-CNJ-02 | Admission requires `PERMITS` for the **current** record; approved admission against a superseded record ⇒ inert `PRODUCT_ADMISSION_NOT_APPROVED`; **an admission never converts `INELIGIBLE`/`NOT_ASSESSED` into `ELIGIBLE`** (AST-HD-2) |
| T-CNJ-03 | Jurisdiction: `BLOCK`, `ALLOW_ONLY`, missing jurisdiction with `ALLOW_ONLY` ⇒ `CLIENT_JURISDICTION_REQUIRED`; no rule + `jurisdiction_assessed=false` cannot approve admission |
| T-CNJ-04 | Transfer restriction: `effect` other than `DENY` rejected (CHECK); `UNASSESSED` profile blocks RWA/secondary/Exchange and security-outcome withdrawal; published `restrictions` list returned to caller |
| T-CNJ-05 | Custody: no enum value for AIX self-custody; `NOT_SUPPORTED`/absent ⇒ deposit/withdrawal not eligible |
| T-CNJ-06 | Operational state `ENABLED` requires an approved governed change (CHECK); **every human-initiated change, including suspend/disable, is maker-checkered** (INV-09); only SYSTEM/SERVICE origins apply without human approval, from an enumerated allow-list |
| T-CNJ-07 | Attestation from `EXM-01` for a non-security instrument, or bound to a non-current record ⇒ `AST1_ATTESTATION_INVALID`; later classification record ⇒ attestation inert (`ast1.securities_market_admission.stale`) [F13] |
| T-CNJ-08 | Precision: `amount_scale > on_chain_decimals` ⇒ `ASSET_PRECISION_INVALID`; scale immutable after lock |
| T-CNJ-09 | Network not in registry ⇒ `AST1_NETWORK_NOT_REGISTERED`; duplicate on-chain identity ⇒ `AST1_INSTRUMENT_DUPLICATE_IDENTITY`; address canonicalisation makes case/format variants collide |
| T-CNJ-10 | Underlying: self-reference/cycle rejected; `ALGORITHMIC` requires the attribute |

## T-HLD — holds and revocation [F07, AST-HD-6]

| ID | Test |
|---|---|
| T-HLD-01 | A **human** hold requires an approved governed change (CHECK `hold_origin='HUMAN' ⇒ placed_change_id`); there is **no single-actor human path**; release is maker-checker |
| T-HLD-02 | A hold **writes no classification record and leaves `effective_outcome` unchanged**; response shows `hold: true`, reason `INSTRUMENT_ON_HOLD` |
| T-HLD-03 | **System** holds fire immediately with no approval for: fingerprint mismatch, synthetic-in-PRODUCTION, standard retirement, backstop trip, sweep anomalies |
| T-HLD-04 | Outstanding tokens revoked on hold; release restores nothing beyond removing the conjunct |
| T-HLD-05 | Held `SECURITY` instrument: MB/PSO subjects still return the hard-rule reason (hold does not mask it) |

## T-TOK — evaluate/verify

| ID | Test |
|---|---|
| T-TOK-01 | Token single-use under concurrency (N parallel verifies ⇒ exactly one success); **TTL 60 s**; a token is not reusable across routing attempts (AST-HD-10) |
| T-TOK-02 | Expired token rejected (clock injected); `payload_binding`, **subject, consumer, instrument, record-id** mismatch rejected (T-DOM-*) |
| T-TOK-03 | Only `allow` mints; deny returns `token: null`; DB CHECK on token `decision` |
| T-TOK-04 | Every evaluate outcome writes exactly one log row incl. unresolved instrument |
| T-TOK-05 | Internal error/timeout in evaluate ⇒ deny `ELIGIBILITY_STATE_UNREADABLE`, never allow |

## T-API — contract and boundary

| ID | Test |
|---|---|
| T-API-04a | Fiat: no classification, eligibility-setting or admission route accepts a fiat instrument; `GET /currencies/{iso}` is the fiat surface [F08] |
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
| T-BND-04 | **[F15]** The word `exchange` appears in no AST-01 route path and no new `exchange.*` identifier is introduced; the enum value **`EXCHANGE` does not exist** — the domain is `SECURITIES_MARKET`; grep test over source and schema |

## T-AUD — audit and evidence (INV-12)

| ID | Test |
|---|---|
| T-AUD-01 | Each state-changing route emits its 08 event in the same transaction (kill the process between write and publish ⇒ neither persists) |
| T-AUD-02 | Decision-log row contains record id/seq and matrix version for every decision; reconstruction test rebuilds "why" from ledger + log alone |
| T-AUD-03 | No evidence bytes, raw tokens or client ids in audit metadata (secret-scan test on captured events) |
| T-AUD-04 | Decision log and classification tables reject UPDATE/DELETE |

## T-DB — database backstops (run against a real migrated DB)

`T-DB-01` identity immutability trigger **and immutability of `instrument_code`/`declared_synthetic`/`synthetic_emulates` from insert**; `T-DB-02` lifecycle transition guard (no `IDENTITY_LOCKED → DRAFT`); `T-DB-03` `record_seq` gapless/unique; `T-DB-04` class/outcome trigger; `T-DB-05` standard applicability trigger; `T-DB-06` `governed_change` CHECK: a `HUMAN` change is `applied` only with attested approvers/policy and maker ∉ approvers, for **both** directions (no TIGHTEN exemption); `T-DB-07` partial unique index (one open case; one live admission per instrument/product); `T-DB-08` privilege matrix (05 §10); `T-DB-09` **SQL backstop ⇄ TS matrix parity (T-SEC-12)**; `T-DB-10` `classification_record` trigger recomputes `recorded_environment`, `lineage_id`, `elevated`, ignoring supplied values; `T-DB-11` attestation/admission binding to the current record.

## T-INT — integrity sweep

`T-INT-01` detects fingerprint drift; `T-INT-02` detects orphaned admissions; `T-INT-03` detects synthetic rows in PRODUCTION; `T-INT-04` idempotent and non-destructive (only places holds/emits events).

## T-ERR

`T-ERR-01` every thrown code has HTTP mapping and is documented in 09; `T-ERR-02` every reason code length ≤ 48 (column width); `T-ERR-03` master-defined codes spelled verbatim.

## Non-goals of this suite

No trading, matching, ledger, issuance or venue tests (other modules). No test asserts that any real asset is or is not a security. No test depends on `R4-Q*` being answered.
