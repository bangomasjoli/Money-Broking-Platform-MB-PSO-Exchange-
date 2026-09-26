# 04 Review — AST-01: Asset & Instrument Registry + Regulatory Classification (blueprint v1.0)

- **Task ID:** AST-01
- **Review type:** Architecture / compliance review of a blueprint and planning task. Review only; no implementation, no migration.
- **Reviewer:** high_risk_reviewer / claude-opus-5-5 / HIGH
- **Author of the reviewed work:** Claude Sonnet 5 (commit `78ec1e4`)
- **Independence disclosure:** this review ran **in the same session** that authored the blueprint. The model changed from Sonnet to Opus, but the conversation context did not. It is therefore **not context-independent**. The MIG-005 precedent applies: the human decides knowing this. A separate-context review (a fresh session or GPT) is still recommended before approval.
- **Reviewed commit:** `78ec1e4` on `module/AST-01`. Baseline `43f2f34`.

## Decision

# **REMEDIATE**

The core design is sound. Eligibility is derived and never stored. Unresolved means absence. Admission can only narrow. Synthetic instruments are structurally unpromotable. The environment is AST-01's own. The response is one conjunct only.

It does **not yet** make SECURITY → MB-domain reachability structurally impossible, for four reasons:
- the deposit path (F01);
- the token binding at verify (F02);
- the database backstop, which trusts values the application supplies (F04);
- a non-production eligibility rule that contradicts Doc 00 §12E.2 (F03).

The blueprint author can correct all six HIGH findings without a human decision. HD-1, HD-4 and HD-6 then still need human decisions.

**Implementation is not authorised.** Nothing here is accepted.

---

## 1. Pre-review verification (all PASS)

| Check | Result |
|---|---|
| Branch | `module/AST-01` |
| HEAD | `78ec1e4` |
| Working tree | clean |
| `main` untouched | `main` = `origin/main` = `43f2f34` (the baseline) |
| Diff `43f2f34..78ec1e4` | 1 commit, 15 files, **0 paths** outside `docs/02_modules/AST-01/**` and `docs/03_implementation/tasks/AST-01/**` |

## 2. Concrete claims verified against the repository

| Claim in the blueprint | Verified at | Result |
|---|---|---|
| `assertNoExchangeRuntime` rejects route paths containing `exchange` | `platform/packages/foundation/src/no-exchange.ts` (fragment list incl. `"exchange"`); called at boot by aml1, cfg1, clt1, fnd, iam, iam2, kyc1, sec1 | **True** |
| No AST-01 route trips the guard | Ran `findProhibitedExchangeRoutes` logic over all 30 route paths in 04 | **0 hits** |
| WLT-01 `asset_or_currency varchar(16)`, `chain_coverage (chain, network)` | migrations `066_wlt1_limits.cjs:78`, `049_wlt1_core.cjs:174–195` | **True** |
| CFG-01 governed-change pattern, payload hash recomputed at apply, token bound to maker | migration `016_cfg1_mutation_workflow.cjs` header; `services/cfg1/src/lib/iam2-client.ts:169–171` | **True** |
| AST-01 can check maker≠checker locally on a **verified checker identity** | `services/iam2/src/routes/internal.ts:162–173`: `execute-verify` returns only `execution_authorised`, `decision`, `verified_payload_hash`, `verified_cache_version`, `verified_session`. **No approver identity** | **False** → F05 |
| State 4 owner | Doc 00 §1.D row 4: "AST-01 classification (§12A); CFG-01 eligibility"; `DEC-014` | True |
| Real-instrument eligibility | Doc 00 §12E.2: `PRODUCT_ASSET_ELIGIBILITY_STATE` **`NOT_ASSESSED` for every real instrument. Synthetic instruments only in non-production**; §12B security route: non-production "against synthetic instruments"; `DEC-013` cl. 9 "synthetic instruments only" | **Contradicted** by 01 §5.3 → F03 |
| Single-actor tightening authority | `SYS-RULE-008` is scoped to `PRODUCTION_ACTIVATION_STATE`. `CFG-RULE-004` rule 2 and Role Matrix §19A: deactivation = **one actor + single checker**; only the CFG-01 **kill switch** is single-actor (`SECURITY_ADMIN`/`SUPER_ADMIN`, **post-hoc review required**, Role Matrix §19A) | **Mis-cited** → F07 |
| Section citations | Role Matrix "§5.2A rule 9" is §19 rule 9; "§22" checkers row is §28; Module Index "§17 rules 2/3/5B" is §19 | **Wrong** → F14 |

## 3. Non-negotiable invariants

| Invariant | Assessment |
|---|---|
| SECURITY / SECURITY TOKEN never reaches AIX Spot, AIX OTC or Money Broking, in any environment | **PARTIAL.** For the `SPOT`/`OTC` subjects the defence is three layers deep and correct in the matrix: a frozen constant, a boot assertion and DB CHECKs. Open paths: **F01** (MB-domain deposit/withdrawal of security instruments), **F02** (a token minted for another subject or service verifies for an MB caller), **F04** (the DB backstop checks application-supplied columns, not the ledger). Platform-level impossibility also depends on consumers gating on AST-01 (DCR-AST1-002, -004 — go-live blockers) |
| Unresolved classification fails closed | **HOLDS.** Absence semantics, `NOT_ASSESSED` denies, collapse conditions defined. Matrix totality is not stated (F10) |
| Eligibility derived, never independently set | **HOLDS.** No eligibility column or endpoint; schema-lint T-SCH-01 |
| No product admission can override classification | **HOLDS.** Requires `PERMITS`, bound to a record, inert after reclassification, narrow-only. The DB trigger should also require the current record (F04) |
| Synthetic cannot become production | **HOLDS structurally.** Record-type trigger, `recorded_environment` CHECK, PRODUCTION collapse. The declaration is still mutable in `DRAFT`, with two sources of truth (F09) |
| Environment authoritative from AST-01, not the caller | **HOLDS** in the service. The DB `environment` column is application-supplied (F04) |
| AST-01 returns only the asset-eligibility conjunct | **HOLDS.** `conjunct` and `not_evaluated` are in every response; INV-10 |
| Exchange eligibility does not create MB-domain reachability | **PARTIAL.** Routes are clean and the attestation is securities-only, but F02 (no subject or service binding at verify) and F01 (deposit via securities-route products) open MB reachability |
| No open regulatory question silently answered | **PARTIAL.** `R4-Q3`, `R4-Q6`, `R4-Q7` and `R4-Q5` are handled as fail-closed gaps. However, the matrix contradicts §12E.2 for real instruments (F03). The treatment principle is not stated (F12). HD-4's extension to debt and fund classes is a legal presumption (HD-4) |

## 4. Findings

Severity uses the `OPEN_FINDINGS` vocabulary. **"Implementation blocker = yes"** means the blueprint must be corrected before any implementation task for the affected phase is approved.

### AST-01-F01 — HIGH — Deposit/withdrawal eligibility gives security instruments an MB-domain path
- **Affected:** 01 §5.7; 04 §6.1 subjects `DEPOSIT`/`WITHDRAWAL`; 05 §6.1 CHECKs.
- **Evidence:** Deposit eligibility requires "≥ 1 product whose matrix result is PERMITS". For a `SECURITY` outcome, `RWA`, `SECONDARY_MARKET` and `EXCHANGE` are PERMITS, so the instrument is deposit-eligible. The consumer is `WLT-01`, an MB/PSO wallet module, and the subject carries no domain. 01 §5.7 says so directly: "An instrument that is `SECURITY`-classified may be deposit-eligible". The custody basis for such tokens is `R4-Q5` (open).
- **Required correction:**
  1. `DEPOSIT`/`WITHDRAWAL` carry a domain (`MB` | `SECURITIES`).
  2. MB-domain deposit/withdrawal of a security outcome (real or synthetic-emulating) is `INELIGIBLE` with `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT`. Add it to the matrix, the boot invariant, the DB backstop and T-SEC.
  3. Securities-domain custody is `NOT_ASSESSED` until `R4-Q5` and the `EXC-01`/`RWA-04` custody design exist.
  4. The "≥ 1 permitted product" test counts only products of the same domain.
- **Implementation blocker:** yes.

### AST-01-F02 — HIGH — Decision tokens are not bound to subject or caller service at verify
- **Affected:** 04 §1.1, §6.1, §6.2; 05 §6.1 token table.
- **Evidence:** `verify-decision` takes `{decision_id, token, payload_binding}`. The caller never states the subject, the token does not record the evaluating service, and there is no per-service subject allow-list. An MB-domain service (`OMS-01`/`TRD-01`) holding a token minted for `EXCHANGE`, `SECONDARY_MARKET`, `RWA` or `DEPOSIT` receives a success response, and can mistake it for Spot eligibility.
- **Required correction:**
  1. `verify-decision` requires the caller-stated `subject`, which must equal the token's.
  2. The token records the evaluating `caller_service` in the table and in `payload_hash`. Verify requires the same service.
  3. Add a configuration allow-list of subjects per service. MB-domain services (`OMS-01`, `TRD-01`, `EXE-01`, `LQD-01`, `WLT-01` for MB custody) are restricted to `SPOT`, `OTC` and MB-domain `DEPOSIT`/`WITHDRAWAL`. Securities-domain services (`RWA-*`, `EXM-01`, `EXP-01`) are restricted to `RWA`, `SECONDARY_MARKET`, `EXCHANGE` and securities-domain custody. `PAY-01` is restricted to `PAY`.
  4. Add tests for every cross-domain mismatch.
- **Implementation blocker:** yes.

### AST-01-F03 — HIGH — Real instruments can derive securities-route eligibility, contrary to Doc 00 §12E.2 / §12B / `DEC-013` cl. 9
- **Affected:** 01 §4.3 item 4, §5.3 SECURITY row; 02 W2; 10 T-EVD-03.
- **Evidence:** 01 §4.3 lets a non-production evidence standard classify real instruments in DEVELOPMENT/TEST/UAT/DEMO. The matrix then derives `RWA` (for RWA-family classes), `SECONDARY_MARKET` and `EXCHANGE` (after the attestation) as PERMITS for a **real** `SECURITY` instrument. Doc 00 §12E.2 says: "`PRODUCT_ASSET_ELIGIBILITY_STATE` — **`NOT_ASSESSED` for every real instrument. Synthetic instruments only in non-production**". §12B makes the security route available in non-production "against synthetic instruments". `DEC-013` cl. 9 says "synthetic instruments only".
- **Required correction:**
  1. For real instruments with a `SECURITY` outcome, `RWA`, `SECONDARY_MARKET` and `EXCHANGE` derive `NOT_ASSESSED` (new reason, e.g. `SECURITIES_ROUTE_SYNTHETIC_ONLY`) in **every** environment, until a master revision changes §12E.2. Only synthetic instruments emulating `SECURITY` derive PERMITS, and only in non-production.
  2. Mark a non-production classification of any real instrument as provisional. The record references a non-production standard, and every surface must say it is not a determination. Recording this against `R6-Q1` is an external-DEMO concern.
  3. Add a boot invariant and tests.
- **Implementation blocker:** yes.

### AST-01-F04 — HIGH — The DB backstop checks application-supplied denormalised columns, not the ledger
- **Affected:** 01 §5.5 items 3–4; 05 §5 `trg_admission_hard_rule`, §6.1 CHECKs; 10 T-SEC-04…06.
- **Evidence:** The `eligibility_decision_log` and `eligibility_decision_token` CHECKs test `effective_outcome`, `synthetic_emulates` and `environment` as supplied by the same code that derived them. Two kinds of defect write a consistent-looking row that passes: a defect in effective-outcome selection (wrong record, collapse bug, hold ignored), or a misreported environment. The backstop therefore catches only matrix-table defects. Neither the admission trigger nor the attestation checks that the referenced record is the **current** one. `classification_record_id` is nullable on `allow`, and `PAY` is outside the backstop even though HD-5 denies it.
- **Required correction:** Add `BEFORE INSERT` triggers on the log and token tables that:
  1. require non-null `instrument_id` and `classification_record_id` for `allow`;
  2. load the referenced record and assert that it belongs to the instrument, is its maximum `record_seq`, and equals the denormalised outcome and emulation;
  3. re-assert the refusals for `SPOT`, `OTC`, `PAY` and MB-domain custody (F01) **from the loaded record**;
  4. assert no active hold and not `RETIRED`;
  5. evaluate synthetic × PRODUCTION from `instrument.declared_synthetic` and a per-database environment fixed at migration/bootstrap (for example a one-row `ast1.deployment_environment`), not from the row.

  Apply the same current-record check to `product_admission` approval and the securities-market attestation.
- **Implementation blocker:** yes (P1/P2 schema).

### AST-01-F05 — HIGH — Local maker≠checker has no trustworthy checker identity
- **Affected:** 01 INV-05; 04 §3 apply steps; 05 §4.4 and §6 `checker_actor_id`; 07 §2 rule 2; 10 T-CLS-03.
- **Evidence:** IAM-02 `execute-verify` (`services/iam2/src/routes/internal.ts:162–173`) returns no approver identity. `checker_actor_id` could therefore only come from the caller, and a caller-supplied value can be spoofed. INV-05's "enforced three times" reduces to IAM-02 alone. IAM-02 still carries `IAM2-FIND-002` (HIGH, no entitlement evaluation on approve/reject) and `IAM2-FIND-003` (no approval policy seeded).
- **Required correction:**
  1. Extend DCR-AST1-001 with **(d)**: IAM-02 `execute-verify` returns the verified approver identity(ies) and the approval-policy id.
  2. AST-01 stores only IAM-02-returned identities.
  3. Until (d) lands, restate INV-05 as one layer plus the DB constraint on stored values, and do not implement classification apply for real actors.
- **Implementation blocker:** yes, for P3 (governed classification apply). P1/P2 are unaffected.

### AST-01-F06 — HIGH — The HD-8 elevated approval for `SECURITY → NON_SECURITY` is bypassable
- **Affected:** 02 W3; 07 §5; 05 §3.2 `ux_ast1_instrument_onchain`; 01 §3.3 (retire-and-recreate).
- **Evidence:** "Direction" is computed from the immediately previous record. Three paths avoid the elevated gate:
  - **(a)** `SECURITY → UNRESOLVED → NON_SECURITY`, two single-checker steps;
  - **(b)** retire the instrument and recreate it on the same on-chain identity (the unique index excludes `RETIRED` rows), then run a fresh `INITIAL` case;
  - **(c)** recreate it under a new asset to change class (HD-4 path).

  This is the one loosening that reverses a securities determination toward Spot.
- **Required correction:**
  1. Make recreation on a previously registered on-chain identity carry a mandatory `supersedes_instrument_id` lineage.
  2. Require elevated approval whenever any record in the instrument's history **or lineage** (same chain/network/contract, or the same asset) was `SECURITY`.
  3. Require at least one evidence item recorded after the last `SECURITY` record.
  4. Add tests for (a)–(c).
- **Implementation blocker:** yes, for P3.

### AST-01-F07 — MEDIUM — Holds collapse the effective classification, and single-actor tightening rests on a mis-cited rule
- **Affected:** 01 INV-09, §4.4, §4.6; 02 W4; 06 SM-4; 07 §5 rationale; 17 HD-6.
- **Evidence:**
  - `SYS-RULE-008` governs `PRODUCTION_ACTIVATION_STATE` only.
  - `CFG-RULE-004` rule 2 and Role Matrix §19A make deactivation **one actor + single checker**.
  - The only single-actor lever is the CFG-01 **kill switch**, restricted to `SECURITY_ADMIN`/`SUPER_ADMIN` with **post-hoc review**.
  - No master authorises single-actor instrument holds, or single-actor admission suspension, operational suspension or restriction additions. Role Matrix §23 "Asset approval" is maker-checker.
  - Collapsing the effective classification to `UNRESOLVED` under a hold changes what the instrument *is* without a maker-checkered record. That is in tension with Role Matrix §19 rule 9 and `ASSET-RULE-002` rule 4, and it masks the SECURITY reason code.
- **Required correction:**
  1. Model a hold as a **narrowing conjunct** (`INSTRUMENT_ON_HOLD`) that leaves the effective classification unchanged.
  2. Cite `SYS-RULE-008` and the kill switch as **precedent only**.
  3. Until DCR-AST1-006 amends the Role Matrix, every human-initiated tightening defaults to the master-compliant pattern of one actor plus a single checker. Where a master is silent, the design must not invent single-actor authority.
  4. System-detected integrity conditions still deny immediately through derivation (`SYS-RULE-010`), so no human single-actor path is needed for them.
  5. If the human later adopts single-actor holds, require kill-switch-style post-hoc review.
- **Implementation blocker:** yes, for any single-actor human path. No otherwise.

### AST-01-F08 — MEDIUM — The HD-1 working default for fiat ("INELIGIBLE for all six products") is wrong and pushes consumers toward a bypass
- **Affected:** 01 §3.4, §5.3 FIAT row; 17 HD-1; 10 T-DER-07.
- **Evidence:**
  - Fiat is the quote leg of Spot/OTC pairs, the PSO baseline payment currency, and the RWA subscription currency.
  - A consumer applying `ASSET-RULE-001` rule 2 (both legs) would deny every fiat-quoted pair, or learn to skip the fiat leg.
  - "Ineligible" asserts a §12A outcome that does not apply to fiat.
  - The MYR-pair lock needs a fiat-leg rule, and the design has none.
- **Required correction:**
  1. Keep fiat out of the §12A product-eligibility API. A fiat subject gets `422 AST1_SUBJECT_NOT_APPLICABLE_TO_FIAT`, not a deny.
  2. Register fiat as reference data only: precision per `LED-RULE-005` rule 2, plus a MYR attribute consumed by pair configuration (OQ-6).
  3. The human decides HD-1 or amends the master (DCR-AST1-008 (b)).
- **Implementation blocker:** yes for fiat scope only. Digital instruments can proceed.

### AST-01-F09 — MEDIUM — Synthetic declaration has two sources of truth and is mutable in DRAFT
- **Affected:** 01 §3.2, §4.5; 05 §3.2, §4.4.
- **Evidence:** 01 says `instrument_code` and `declared_synthetic` "cannot be changed". In 05, however, identity is mutable in `DRAFT`, and nothing states that `instrument_code`, `declared_synthetic` or `synthetic_emulates` are immutable from insert. `synthetic_emulates` exists on both `instrument` and `classification_record`, with no equality constraint. A security-emulating synthetic could be recorded as emulating non-security.
- **Required correction:**
  1. Make these three columns immutable from `INSERT`.
  2. Keep one source of truth (the instrument), with the record's value enforced equal by trigger.
  3. Add tests.
- **Implementation blocker:** yes (schema).

### AST-01-F10 — MEDIUM — The eligibility matrix is not declared total
- **Affected:** 01 §5.3; 10 T-DER-01, T-SEC-03.
- **Evidence:** The combination class `SECURITY` + outcome `NON_SECURITY` has no row: HD-4 forbids it, but the matrix must not depend on that. Nor do other cross combinations. There is no stated default for an unspecified cell.
- **Required correction:**
  1. State that any unspecified cell is `NOT_ASSESSED`.
  2. Make the boot invariant assert totality over outcome × class × product × emulation.
  3. Make the T-DER-01 oracle cover all 10 classes explicitly.
- **Implementation blocker:** yes (small).

### AST-01-F11 — LOW — The principle for treating open regulatory questions is unstated and applied unevenly
- **Affected:** 01 §5.3 notes ¹ ²; 12 §4; 17 §3.
- **Evidence:** Non-security RWA derives `RWA` PERMITS although `R4-Q6` holds the non-security route (§12B). Spot/OTC/secondary for the same instruments derive `NOT_ASSESSED` citing `R4-Q6`/`R4-Q7`. The rule behind the difference is never stated.
- **Required correction:** State and tabulate the rule:
  - **Route-membership questions** decide which regime an asset belongs to (`R4-Q7`; the §12E.2 real-instrument position). They yield `NOT_ASSESSED` in AST-01.
  - **Operating-permission questions** (`R1-Q1b`, `R4-Q1`, `R4-Q2`, `R4-Q6`, `R5-Q1`) belong to CFG-01 production activation, not AST-01.
- **Implementation blocker:** no.

### AST-01-F12 — LOW — SRS `AST-SRS-001` field coverage is incomplete
- **Affected:** 01 §1.1; 04 §6.1; 05.
- **Evidence:**
  - *Risk classification*: absent.
  - *Listing status*: not explicitly mapped. It is implicitly `product_admission` plus the `EXM-01` attestation.
  - *Production activation status*: required by the SRS as a registry concept, but owned by CFG-01 under Doc 00 §1.D. The blueprint omits it without reconciling.
  - *Client eligibility*: `client_class` is accepted in the request but never used.
- **Required correction:** Map each SRS field. Show production activation as a read-through from CFG-01 that is never stored. Either use `client_class` (for example against `INVESTOR_CLASS_ONLY`) or drop it. Record the SRS/Doc 00 reconciliation under DCR-AST1-008.
- **Implementation blocker:** no.

### AST-01-F13 — LOW — Securities-market attestation currency and `WF-32` sequencing are not stated
- **Affected:** 01 §5.4, §8.6; 05 §5.
- **Evidence:** 01 does not say whether an attestation is inert after reclassification, as admission is. It also does not say that `EXM-01` must evaluate `SECONDARY_MARKET` (not `EXCHANGE`) before admitting, which is needed to avoid a circular dependency (`WF-32` steps 2–3).
- **Required correction:** Bind the attestation to the current record (F04). State the `WF-32` sequencing.
- **Implementation blocker:** no.

### AST-01-F14 — LOW — Citation errors
- **Affected:** 01 header and §4.6; 07 §§1–2, §5; 12 §3; 17 §4; 01-plan.
- **Evidence:**
  - "Role Matrix §5.2A rule 9" should be §19 rule 9.
  - "Role Matrix §22" (Asset & Instrument Registry checkers) should be §28.
  - Module Index "§17 rules 2, 3, 5B" should be §19.
  - The §23 maker-checker rows ("Asset approval", "Asset/pair activation") are not mapped to AST-01 change kinds.
  - `SYS-RULE-008` is cited as authority (see F07).
- **Required correction:** Fix the citations. Map each 07 §5 change kind to a §23 row, or to a DCR where none fits.
- **Implementation blocker:** no.

### AST-01-F15 — LOW — The product enum value `EXCHANGE` sits against `DEC-013` cl. 10
- **Affected:** 01 §5; 04 §1.3; 17 OQ-7.
- **Evidence:** The `exchange.*` namespace is frozen as the MB prohibition namespace, and `securities_market.*` is reserved for AIX Exchange. Any identifier derived from the enum would reintroduce `exchange` strings that hit CFG-01's structural `exchange.` deny or the FND fragment guard. That includes the CFG-01 feature codes under DCR-AST1-003, audit names and metrics.
- **Required correction:** Rename the enum to `SECURITIES_MARKET` before P1. This resolves OQ-7.
- **Implementation blocker:** no, but it is cheapest before P1.

### AST-01-F16 — LOW — `task.json` was not conductor-valid — **FIXED in this review commit**
- **Affected:** `docs/03_implementation/tasks/AST-01/task.json`.
- **Evidence:** `aix-conductor/src/records.ts` `validateTaskManifest` would reject it for five reasons:
  - `state: "PLANNED"` is not in `TASK_STATES` (`aix-conductor/src/types.ts`);
  - unknown keys `statusLabel`, `pendingHumanDecisions`, `dependencyChangeRequests` (the key set is closed, with `acceptance` as the only optional key);
  - `planner.role: "blueprint_author"` is not in `LOGICAL_AGENT_ROLES`;
  - `planner.effort: null` is not in `LOGICAL_EFFORTS`;
  - `relevantRecordPaths` entries lie outside `docs/03_implementation/tasks/AST-01/`.
- **Correction applied:** see §7.
- **Implementation blocker:** no.

## 5. Human-decision adjudication (the decision itself is not made here)

| HD | Adjudication | Reasoning / correction |
|---|---|---|
| **HD-1** Fiat | **HUMAN DECISION REQUIRED** | Fiat must be registered (`LED-RULE-005` rule 2), but the working default of all-`INELIGIBLE` is unsafe (F08). The choice is between a master-defined treatment (DCR-AST1-008 (b)) and keeping fiat entirely outside the §12A API. |
| **HD-2** `product_admission` as a narrowing conjunct | **SUPPORTED WITH CORRECTION** | It is not an independent flag: it requires `PERMITS`, is bound to a record, and can only narrow. It satisfies `AST-SRS-002` req 1 and the Role Matrix §23 "Asset approval" row. Correction: DB-level current-record check at approval (F04). |
| **HD-3** `synthetic_emulates` | **SUPPORTED WITH CORRECTION** | It is the only way to test the hard rule end to end with a security-like instrument, and it is consistent with `AST-SRS-001A`. Corrections: single source of truth, immutable from insert (F09); security-emulating synthetics are the only securities-route PERMITS in non-production (F03). |
| **HD-4** Presumptively securities-featured classes | **HUMAN DECISION REQUIRED** | For `SECURITY` and `SECURITY_TOKEN` the rule is definitional consistency and needs no decision. Extending it to `TOKENISED_DEBT`/`TOKENISED_FUND` is a legal presumption that pre-empts the classifier and bears on `R4-Q3`/`R4-Q6`, so it needs human and legal input. Also: asset class is immutable at asset level, so correcting a class forces a new `asset_code`, which then diverges from WLT-01. Retire-and-recreate needs the lineage from F06. |
| **HD-5** Pay for security outcomes | **SUPPORTED WITH CORRECTION** | Default-deny is correct. No master authorises it, and `PAY-SRS-009` defers to AST-01. Correction: include `PAY` in the DB backstop (F04) so matrix, trigger and CHECK agree. |
| **HD-6** Single-actor hold authority | **HUMAN DECISION REQUIRED** | `SYS-RULE-008` is a **precedent only**: it governs `PRODUCTION_ACTIVATION_STATE`, and even there deactivation is actor plus checker (`CFG-RULE-004` rule 2, Role Matrix §19A). The only single-actor lever in the masters is the kill switch (post-hoc review). A **Role Matrix / master decision is required** (DCR-AST1-006). Until then, the master-compliant actor-plus-checker default applies, and holds are modelled as a conjunct (F07). |
| **HD-7** Meaning of `RWA` eligibility | **SUPPORTED** | "Object of the RWA lifecycle" keeps the payment-currency question with PAY/LED. It is consistent with `WF-31` and `RWA-SRS-005`/`021`. |
| **HD-8** Elevated approval for `SECURITY → NON_SECURITY` | **SUPPORTED WITH CORRECTION** | Stricter than Role Matrix §19 rule 9 and within the §28 checker set (Compliance Officer, MLRO). Correction: close the bypasses via lineage and history (F06), and require evidence recorded after the last `SECURITY` record. |
| **HD-9** Per-instrument classification | **SUPPORTED WITH CORRECTION** | Fail-closed for wrapped and bridged variants. Correction: lineage for recreated instruments (F06). |
| **HD-10** 60-second token, log every decision | **SUPPORTED WITH CORRECTION** | Supports `DEC-012` cl. 1 rule 7 reconstructability. Correction: state that a token is never an order-lifetime entitlement. Orders may remain pending (`DEC-012` cl. 1 rule 5), so eligibility must be re-evaluated and verified at **each** routing or execution attempt. The 60 s TTL and the logging volume (partitioning) are fine. |

## 6. Dependency-change-request adjudication

| DCR | Adjudication | Blocker class |
|---|---|---|
| **DCR-AST1-001** IAM-02 | Valid. **Extend with (d)**: `execute-verify` returns the verified approver identity and policy id (F05). | (a)+(d): **implementation blocker for P3**. (b)+(c): **go-live blocker**, and a blocker for UAT of maker-checker (the `IAM2-FIND-002` trigger). |
| **DCR-AST1-002** WLT-01 / LED-01 | Valid. Until WLT-01 consumes AST-01, it accepts assets that were never classified, contrary to Module Index §19 rule 3. | **Go-live blocker** (before any real-instrument deposit, and before UAT of MB deposit flows). Not an implementation blocker. |
| **DCR-AST1-003** CFG-01 | Valid. Codes must use neither `exchange.` nor, after F15, `.exchange`. | Not an implementation blocker. Before UAT/DEMO availability (with `CFG-FIND-002` a prerequisite). (b) is a **go-live blocker**. |
| **DCR-AST1-004** Consumers | Valid. **Must incorporate F02's subject/service contract** and HD-10's re-evaluation at each routing attempt. | **Go-live blocker** for every consuming product. |
| **DCR-AST1-005** Evidence document store | Valid. No owner exists in Module Index v1.4. | **Go-live blocker** for real classification. Not an implementation blocker. |
| **DCR-AST1-006** Role Matrix hold authority | Valid. **Broaden** from holds to every single-actor tightening kind (F07). | **Implementation blocker** for single-actor human paths only. With the actor-plus-checker default, not a blocker. |
| **DCR-AST1-007** FND-01 / `MIG-001` | Valid. AST-01 already complies (0 of 30 routes hit). | Not a blocker. |
| **DCR-AST1-008** Masters | Valid. Add (e): SRS `AST-SRS-001` "production activation status" versus Doc 00 §1.D ownership (F12). (b) fiat per HD-1. (c) pair ownership. | (b): **implementation blocker for fiat scope**. (c): go-live blocker for pair activation. Others: none. |
| **DCR-AST1-009** Control-layer checkpoint | Valid. | Precedes blueprint promotion, and therefore any implementation approval. |

No DCR was acted on. No other module was modified.

## 7. `task.json` governance correction

- **Authoritative convention:** `aix-conductor/src/types.ts` `TASK_STATES` is `IDLE, PLANNING, PLAN_READY, APPROVED_FOR_IMPLEMENTATION, IMPLEMENTING, IMPLEMENTATION_COMPLETE, REVIEWING, REMEDIATION_REQUIRED, ESCALATION_REQUIRED, HUMAN_DECISION_REQUIRED, ACCEPTED, FAILED`. `PLANNED` is not a state. It also appears in the hand-written MIG-004 and ACC-01 records, which are equally non-conformant.
- **Why not `PLAN_READY`:** in AIX, `PLAN_READY` is written only by the conductor's human `approve-plan` checkpoint, where the operator types `APPROVE PLAN` (`aix-conductor/src/planningCheckpoint.ts`). It is also the precondition the implementation gate checks (`implementation.ts`: "implementation starts only from PLAN_READY"). Recording it here would falsely claim a human plan approval and satisfy one implementation precondition. The same objection applies to `PLANNING`, which denotes a conductor planner run in progress.
- **Why `IDLE`:** it is the template and initial state. It accurately says the conductor has not advanced this task, since this plan was produced outside a conductor planner run. It is also fail-closed: the implementation gate refuses it.
- **Applied:**
  - `state: "IDLE"`;
  - the human-readable status kept in `title` ("PLANNED / AWAITING REVIEW — review: REMEDIATE"), because the key set is closed;
  - unknown keys removed (HDs and DCRs remain in blueprint file 17 and this review);
  - `planner: null`, because authoring provenance (Claude Sonnet 5, effort unrecorded) is kept in `01-plan.md` and an effort must not be invented;
  - `reviewer` set to this review;
  - `roundCounts.review: 1`;
  - findings summary populated;
  - `relevantRecordPaths` limited to the task folder;
  - `createdAt` set to the `78ec1e4` commit time.
- **Validation evidence:** the conductor's compiled `validateTaskManifest` (`aix-conductor/dist/records.js`, built after the last change to `src/records.ts`; run read-only, conductor repository unchanged):
  - new `task.json`: `{"ok":true,"errors":[]}`;
  - `78ec1e4` original: `{"ok":false}`, with three unknown-key errors (the validator stops at key errors before checking fields).

## 8. Required before re-review

1. Correct F01–F06, F09 and F10 in the blueprint (implementation blockers). Correct F07 to the conjunct model with actor-plus-checker defaults.
2. Fix F11–F15, or record why not.
3. Human decisions on HD-1, HD-4 and HD-6.
4. Run a separate-context review (see the independence disclosure).

---

AIX AST-01 INDEPENDENT REVIEW:
**REMEDIATE — IMPLEMENTATION NOT AUTHORISED**
