# 04 Review R2 — AST-01: Asset & Instrument Registry + Regulatory Classification (blueprint v1.1)

- **Task ID:** AST-01
- **Review type:** Separate-context independent re-review of the v1.1 remediation. Review only: no remediation, implementation, migration or merge.
- **Reviewer:** high_risk_reviewer / claude-opus-5-5 / HIGH
- **Reviewed commit:** `e20b8ca` on `module/AST-01` (v1.1 remediation). History: `78ec1e4` (v1.0 authoring) → `45d9a2f` (review R1, `REMEDIATE`) → `e20b8ca` (v1.1).
- **Reviewed against:** `DEC-012`, `DEC-013`, `DEC-014`; Doc 00 v1.5 §1.D, §1.E, §12A–§12E, §21A, §23; Master Module Index v1.4 §19; SRS v1.3 `AST-SRS-001`, `001A`, `002`, `PAY-SRS-009`; Role & Permission Matrix v1.3 §19 rule 9, §19A, §23, §28; Master Workflow Map v1.3 `WF-32` (§33C), `WF-35` (§33F); Master System Rules v1.3 `ASSET-RULE-001`, `ASSET-RULE-002`, `SYS-RULE-008`, `SYS-RULE-009`, `SYS-RULE-010`, `CFG-RULE-004`; `CURRENT_STATE.md`. Source code was read only where needed to verify a claimed seam (§3).
- **Not relied on:** `05-remediation.md`'s status column. Every disposition below comes from reading the v1.1 text and the sources.

## Decision

# **REMEDIATE**

v1.1 is a substantial and mostly correct remediation:
- Eligibility is derived, never stored. `UNRESOLVED` is absence. The matrix is total with a `NOT_ASSESSED` default.
- Real `SECURITY` instruments are `NOT_ASSESSED` on every securities-route subject.
- Synthetic instruments have a single immutable source of truth.
- Holds are a pure narrowing conjunct. Fiat is outside the §12A API.
- The SQL backstop now reads the ledger at the point of **minting**.
- No `exchange.*` identifier exists.

Of the prior findings, **9 are closed in the blueprint**, **2 are correctly handed to external gates**, and **4 are superseded by new findings**.

It is **not yet** acceptable. Two new HIGH defects sit directly on the invariant paths:
- **AST-01-F17:** the instrument-resolution key that WLT-01 and `evaluate` are told to use has no contract address. A security-classified sibling contract can therefore be resolved as the MB-eligible instrument and credited. This reopens the F01 path.
- **AST-01-F19:** deterministic identity and lineage signals are not bound to the elevated path. These are native-coin identity, the underlying-instrument link and the claimed code hash, which has no column. HD-8 is therefore still escapable without a disguised replacement.

Three MEDIUM findings also need correcting:
- **F18:** the SQL backstop does not guard token consumption, and token rows are mutable.
- **F20:** a new `SECURITY` record does not narrow its lineage siblings.
- **F21:** the MYR fiat-leg gate is misstated as "enforced" when nothing enforces it.

All five can be corrected by the blueprint author without a human decision. None of the pending positions (HD-5, HD-7, P-3, P-4) blocks acceptance. See §9.

**Implementation is not authorised. Nothing is accepted. `task.json` is unchanged (§11).**

---

## 1. Pre-review verification (all PASS)

| Check | Result |
|---|---|
| Branch | `module/AST-01` |
| HEAD | `e20b8ca` |
| Working tree | clean |
| `main` / `origin/main` | both `43f2f34`, which is the merge base with `HEAD`. Untouched |
| Diff `43f2f34..e20b8ca` | 3 commits, 29 files, all under `docs/02_modules/AST-01/**` or `docs/03_implementation/tasks/AST-01/**`. No `platform/**`, master, register or other-module path |
| v1.0 pack | Present and unchanged in v1.1's commit (historical evidence) |

## 2. Independence

- **Fresh context.** This review ran in a new Claude Code session. It is not a resumption of the authoring, R1-review or remediation sessions. The only inputs were the task brief and the repository.
- **Model family.** The reviewer is `claude-opus-5-5`, the same model as R1. R1 ran in the author's session. The v1.1 author was `claude-sonnet-5`. This review is therefore **context-independent but not model-family-independent**. Under the MIG-005 precedent the human decides with that known. A GPT-class review remains an option before acceptance, but it is not required by any record I found.

## 3. Seams verified in source (read-only)

| Claim | Verified at | Result |
|---|---|---|
| IAM-02 `execute-verify` returns no approver identity (F05 premise) | `platform/services/iam2/src/routes/internal.ts` success envelope: `execution_authorised`, `decision`, `verified_payload_hash`, `verified_cache_version`, `verified_session` only | **True.** The DCR-AST1-001(d) gate is real |
| Migration head 071 | `platform/infra/migrations/071_cfg1_environment_scope.cjs` is the last file; `CURRENT_STATE.md` agrees | True |
| WLT-01 identifies assets by `(asset_or_currency, chain, network)` with **no contract address** | migrations `049_wlt1_core.cjs` (`chain_coverage` unique on `(chain, network)`), `066_wlt1_limits.cjs:78` (`asset_or_currency varchar(16)`); no `contract` column in any WLT-01 migration | True. This is the basis of **F17** |
| No MYR-pair control exists anywhere in code | `grep -i myr platform/**` finds only WLT-01 fiat **payout** rails (`061_wlt1_fiat_payout_destination.cjs`) | True. This is the basis of **F21** |
| `assertNoExchangeRuntime` fragment list | `platform/packages/foundation/src/no-exchange.ts` `PROHIBITED_EXCHANGE_FRAGMENTS` (15 fragments incl. `exchange`) run over all 35 route strings in v1.1 | **0 hits** |
| `task.json` conductor-valid | `aix-conductor/dist/records.js` `validateTaskManifest`, run read-only; conductor repository clean before and after | `{"ok":true,"errors":[]}` |
| Implementation gate requires `PLAN_READY` | `aix-conductor/src/implementation.ts:252` | True. `IDLE` is refused by the gate |

## 4. Non-negotiable invariants

| # | Invariant | Assessment |
|---|---|---|
| 1 | `SECURITY` / `SECURITY TOKEN` never reaches `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO`, in any environment | **PARTIAL.** Inside AST-01 the invariant holds for a correctly identified instrument: hard-rule step, total matrix, boot invariant, backstop B1 at mint, allow-list and bound tokens. **Open:** F17 (wrong-instrument resolution on the MB custody path); F18 (consumption not backstopped; tokens mutable); F20 (a sibling in a lineage determined to be a security stays MB-eligible) |
| 2 | An RWA / securities-market token cannot verify as an MB token | **HOLDS.** Verify requires caller identity = token `consumer_service`, stated subject = token subject, both allow-listed. No MB-domain identity is allow-listed to an `RWA` or `SECURITIES` subject. Hardening in F23 (allow-list not boot-asserted; SQL does not compare `consumer_service`) |
| 3 | Caller / service / subject / instrument / environment / current-classification bindings complete | **PARTIAL.** All six are bound in the token and checked at verify. However, the *instrument* binding is only as good as resolution (F17), client facts are unbound (F23), and the DB does not re-check bindings on token UPDATE (F18) |
| 4 | Eligibility derived, never independently set | **HOLDS.** No eligibility column outside the log and token tables; schema lint T-SCH-01; no setting endpoint |
| 5 | Product admission only narrows | **HOLDS.** C2 after step 4; bound to the current record by trigger; inert after reclassification |
| 6 | Unresolved / `NOT_ASSESSED` always denies enforcement | **HOLDS** in derivation and verify. The SQL backstop enforces `UNRESOLVED`-denies only for MB/PSO subjects (B2). That is acceptable: the backstop is declared coarser, and it is not the enforcement path for other subjects |
| 7 | Synthetic cannot become production-valid real | **HOLDS.** Code/declaration/emulation CHECKs both ways; immutable from INSERT; record-type trigger; `recorded_environment` from `deployment_environment`; no promotion operation; B4 |
| 8 | Real `SECURITY` instruments stay `NOT_ASSESSED` for securities-route membership | **HOLDS.** Matrix ⁵ for all five securities-route subjects in every environment; boot invariant; backstop B5; T-DER-09. Consistent with Doc 00 §12E.2, §12B.2 and `DEC-013` cl. 9 |
| 9 | AST-01 never becomes the full access / capability authority | **HOLDS.** INV-10; `conjunct` + `not_evaluated` in every response; production activation is read-through; Module Index §19 rule 7 respected |

## 5. Disposition of prior findings F01–F16

Vocabulary: **CLOSED IN BLUEPRINT**, **EXTERNAL GATE REMAINS** (blueprint correct; an external DCR is accurately stated as the gate), **STILL OPEN**, **SUPERSEDED BY NEW FINDING**.

| Finding | Disposition | Basis |
|---|---|---|
| **F01** MB-domain deposit path | **SUPERSEDED BY NEW FINDING (F17)** | All four R1 corrections are made: domain-scoped subjects; MB custody × `SECURITY` = `INELIGIBLE` in matrix, boot invariant and B1; same-domain admission count; securities custody `NOT_ASSESSED`. The WLT-01 quarantine contract is written (DCR-AST1-002). But the resolution key the contract prescribes cannot distinguish sibling contracts, so "unsolicited security deposit ⇒ quarantine, no credit" is not guaranteed (F17). DCR-002 remains a go-live gate |
| **F02** Token not bound to subject/caller | **EXTERNAL GATE REMAINS (DCR-AST1-004)** | Subject, domain, consumer, instrument, environment and record id are bound; verify checks each; per-service allow-list; T-DOM-01…05. Consumer adoption is DCR-004 (go-live and consumer-blueprint gate, accurately stated). LOW hardening in F23 |
| **F03** Real instruments derive securities route | **CLOSED IN BLUEPRINT** | Matrix ⁵, B5, boot invariant clause "any real-instrument securities-route cell is `PERMITS`", T-DER-09. Build-unlocked ≠ eligibility-unlocked is stated explicitly. The lift path (DCR-008(f), Doc 00 revision) is correct |
| **F04** Backstop trusts app columns | **SUPERSEDED BY NEW FINDING (F18)** | The core is fixed: `authoritative_state()` / `backstop_permits()` read ledger, instrument, hold and `deployment_environment`; row copies are ignored; current-record binding on log, token, admission and attestation; `PAY` and MB custody are included. Still open: the consumption path is not backstopped, token rows are mutable, and there is no lock ordering (F18). See §7 |
| **F05** No trustworthy checker identity | **EXTERNAL GATE REMAINS (DCR-AST1-001(a)+(d))** | The claim is corrected everywhere (INV-05, 01 §4.8, 07 §2). Apply is disabled until IAM-02 attests; stub labelled. The seam is verified in source (§3). The gate is correctly classed as an implementation gate for P3 |
| **F06** Elevated-approval bypass | **SUPERSEDED BY NEW FINDING (F19; see also F20)** | `SECURITY→UNRESOLVED→NON_SECURITY` is closed (history read, trigger-computed). Retire → recreate on the same **contract** is closed, more strongly than documented (the unique index forbids any re-registration). Not closed: native-coin identity, a wrapper whose underlying is a `SECURITY` instrument, the claimed "code hash" signal with no schema, and asset lineage mutable in `DRAFT` (F19) |
| **F07** Holds change outcome; mis-cited authority | **CLOSED IN BLUEPRINT** | Hold = conjunct C0 applied after the hard rule. The outcome is unchanged and a held `SECURITY` still returns the hard-rule reason (T-DER-11, T-HLD-05). Human holds are maker-checker; system holds immediate; `SYS-RULE-008` and the kill switch are precedent only (verified: Role Matrix §19A). DCR-006 gates only an optional single-actor path (§8) |
| **F08** Fiat default | **SUPERSEDED BY NEW FINDING (F21; LOW F22)** | Fiat is reference data, outside §12A, `not_applicable` and never `INELIGIBLE`. Fiat quote legs and Pay are not denied (§10). However, v1.1 says MYR restrictions "remain enforced by the pair/product control" and no such control exists. The consumer contract does not fail closed on a MYR fiat leg (F21) |
| **F09** Synthetic single source of truth | **CLOSED IN BLUEPRINT** | Three columns immutable from INSERT; no emulation column on the record; record outcome ⇔ declaration trigger; lineage `synthetic` flag = declaration |
| **F10** Matrix not total | **CLOSED IN BLUEPRINT** | Explicit totality rule with a `MATRIX_CELL_NOT_DEFINED` default; boot invariant over the full vocabulary incl. unknown environment; T-DER-01/02. See §12 |
| **F11** Open-question rule | **CLOSED IN BLUEPRINT** | Three buckets (01 §5.9) are consistent with Doc 00 §12B.2 (non-security route: operating permission `R4-Q6` vs route membership `R4-Q7`) and §12E.2 |
| **F12** SRS field coverage | **CLOSED IN BLUEPRINT** | 01 §10 maps every `AST-SRS-001` field. Production activation is read-through (Doc 00 §1.D state 3 owner). Risk tier is informational. `client_class` is used. DCR-008(e) records the SRS / Doc 00 reconciliation (not a gate) |
| **F13** Attestation currency, `WF-32` sequencing | **CLOSED IN BLUEPRINT** | Attestation bound to the current record by trigger; stale ⇒ `NOT_ASSESSED`. Sequencing matches Workflow Map §33C.3 steps 2–4 (`SECONDARY_MARKET` before admission review; no circularity). `EXM-01`'s obligations are in DCR-004(h) |
| **F14** Citations | **CLOSED IN BLUEPRINT** | Verified: Role Matrix §19 rule 9 (classification maker/checker), §23 rows "Asset approval" and "Asset/pair activation", §28 AST-01 row (makers "Instrument Classifier, Compliance"; checkers "Compliance Officer, MLRO"), §19A kill switch; Module Index §19 rules 2, 3, 5A, 5B, 13, 14. 07 §5 maps every change kind or routes it to DCR-006 |
| **F15** `EXCHANGE` enum | **CLOSED IN BLUEPRINT** | See §14 |
| **F16** `task.json` validity | **CLOSED (remains conductor-valid)** | Validator `{"ok":true,"errors":[]}` on the file at `e20b8ca` |

## 6. New findings

Severity uses the `OPEN_FINDINGS` vocabulary. "Blocker" means the blueprint must be corrected before the named phase is approved.

### AST-01-F17 — HIGH — MB-custody and `evaluate` instrument resolution has no contract-address key; ambiguity is undefined
- **Affected:** 01 §3.1 ("Mapping to existing code"), §5.8 WLT-01 contract step (1); 04 §6.1 `instrument_ref {asset_code, chain, network}`; 17 DCR-AST1-002(1); 05 §4.2 (no uniqueness on `(asset_id, chain, network)`); 12 AR-21.
- **Evidence:**
  - AST-01 explicitly allows several instruments of one asset on one network: per-instrument classification of bridged and wrapped variants (01 §3.1, AST-HD-9). The only on-chain uniqueness is `(chain, network, contract_address_canonical)`.
  - Yet v1.1 prescribes resolution by `(asset_code, chain, network)`, both for WLT-01 (DCR-002(1)) and in the `evaluate` request. WLT-01 has no contract column at all (§3).
  - With asset `ABC` holding instrument I1 (contract `0x1`, `NON_SECURITY`, MB-eligible) and I2 (contract `0x2`, `SECURITY`) on the same network, an inbound I2 transfer resolves to an ambiguous tuple. The blueprint does not say whether that denies. If it yields I1, the consumer obtains and verifies an I1 token and credits a security token to the MB wallet.
  - The AR-21 residual ("consumers bind instrument id at verify") gives no protection here, because the consumer's instrument id comes from the same flawed resolution.
- **Required correction:**
  1. For `TOKEN_CONTRACT` instruments, the resolution key **must include `contract_address_canonical`**; for `NATIVE_COIN`, the key is `(chain, network, NATIVE)`. Remove `{asset_code, chain, network}` as a sufficient `instrument_ref`.
  2. An unresolvable **or ambiguous** reference ⇒ deny (`INSTRUMENT_NOT_FOUND` / a new `INSTRUMENT_REFERENCE_AMBIGUOUS`) and log it. Never pick a match.
  3. Amend DCR-AST1-002(1),(5): WLT-01 identifies inbound transfers by on-chain contract identity, never by symbol or asset code. An unregistered or ambiguous contract ⇒ quarantine, no credit. Record the WLT-01 schema gap (no contract column) in the DCR.
  4. Add T-DOM/T-CNJ tests: two sibling contracts, one `SECURITY` ⇒ the `SECURITY` contract never resolves to the MB-eligible instrument; an ambiguous reference denies.
- **Blocker:** yes for P2 (`evaluate` resolution) and for the DCR-002 contract text. Go-live gate via DCR-002.

### AST-01-F18 — MEDIUM — The SQL backstop does not guard token consumption; token rows are mutable; no lock ordering
- **Affected:** 05 §7 trigger table, §8.1 token table, §10 privileges; 04 §6.2 (consume = conditional `UPDATE`), §8.
- **Evidence:**
  - The backstop fires `BEFORE INSERT` on log and token rows only.
  - `eligibility_decision_token` falls under "other tables: `SELECT, INSERT, UPDATE`", because consumption needs `UPDATE`. So after a correct insert, the application can rewrite `subject`, `instrument_id`, `classification_record_id` or `consumer_service` with no trigger.
  - `verify-decision` is the gate consumers act on (04 §1.4). Its only protection against a reclassification or hold between mint and use (≤ 60 s) is the TypeScript re-derivation. That is the same code path the backstop exists to distrust.
  - `authoritative_state()` specifies no lock. Record insertion takes `FOR UPDATE` on the instrument row, but hold insertion takes none. The mint-time check is therefore a snapshot that a concurrent `SECURITY` record can overtake before commit.
  - The backstop "independently prevents" an `allow` being **written** for a security instrument. It does not independently prevent a stale or altered `allow` being **used**.
- **Required correction:**
  1. Add a `BEFORE UPDATE` trigger on the token table that rejects changes to any column except `consumed_at_utc`, `revoked_at_utc` and `revoked_reason`.
  2. When the update sets `consumed_at_utc`, the trigger re-runs `backstop_permits(instrument_id, subject)` and asserts `classification_record_id = current_record_id` and `consumer_service` = the referenced log row's value. On failure it raises: the consume fails and the token is not consumed.
  3. `authoritative_state()` takes `FOR SHARE` on the instrument row. Hold insertion and release take `FOR UPDATE` on it, as record insertion already does. This serialises mint and consume against reclassification and hold placement.
  4. Add T-SEC tests:
     - raw `UPDATE` of token binding columns ⇒ rejected;
     - token minted, record `SECURITY` committed, raw consume `UPDATE` ⇒ raises;
     - concurrent mint vs `SECURITY` apply ⇒ no committed `allow` against a superseded record.
- **Blocker:** yes, P1/P2 schema. Needed to close F04.

### AST-01-F19 — HIGH — Deterministic lineage signals are not bound to the elevated path (HD-8 remains escapable without a disguised replacement)
- **Affected:** 01 §3.9, §4.7; 05 §3, §4.1, §4.2 (unique index, continuity trigger), §5.1 trigger 6; 12 AR-19; 10 T-SEC-10, T-CLS-14.
- **Evidence:**
  1. **Native coins.** `ux_ast1_instrument_onchain` and `trg_instrument_on_chain_continuity` cover `TOKEN_CONTRACT` only. A `NATIVE_COIN` instrument `(chain, network, contract NULL)` has no uniqueness and no automatic continuity. A native coin with a real `SECURITY` record can be retired, recreated under a new asset with `NONE_DECLARED`, receive a fresh lineage, and move to `NON_SECURITY` with one checker. The identity `(chain, network, NATIVE_COIN)` is fully deterministic.
  2. **Wrappers and derivatives of a security.** `instrument_underlying.underlying_instrument_id` records that instrument W wraps or represents instrument S. If S has a real `SECURITY` record, nothing makes W's `→ NON_SECURITY` elevated. "Same underlying instrument" surfaces only instruments sharing an underlying, not an instrument **whose underlying is** the security.
  3. **Code hash.** "Same contract code hash" is claimed as a candidate signal (01 §3.9, AR-19), but no column, source or computation exists in 05. The claimed control is absent.
  4. **Asset lineage is mutable in `DRAFT`.** `asset.lineage_id` and the predecessor fields are frozen only after an instrument locks. The continuity trigger runs only on instrument `INSERT`. An asset `UPDATE` while the instrument is `DRAFT` (grants allow it; there is no route, but the backstop's premise is not trusting the application) moves the instrument out of the `SECURITY` lineage before `elevated` is computed.
  5. **Internal contradiction (fail-closed).** The unique index includes `RETIRED` rows, so a `TOKEN_CONTRACT` identity can never be registered twice, **even inside its lineage**. The documented identity-error correction ("retire-and-recreate inside the same lineage", 01 §3.3) is therefore impossible for token contracts. The continuity trigger is unreachable for them, and T-SEC-10 "retire → recreate on the same contract" cannot be constructed as written.
- **AR-19 honesty:** the stated residual ("continuity neither on-chain-identical, declared nor surfaced depends on the human checker") is acceptable **only after** items 1–4 are wired. Today deterministic paths are being left to the human.
- **Required correction:**
  1. Extend identity uniqueness and automatic continuity to `NATIVE_COIN` on `(chain, network)`, including `RETIRED` rows.
  2. `elevated` also holds when any `underlying_instrument_id` of the proposed instrument (transitively) belongs to a lineage with a real `SECURITY` record.
  3. Either add `contract_code_hash` to the instrument (identity-locked, in the fingerprint, with a stated source) and make an equal-hash `SECURITY` lineage force elevation, or delete the claim from 01 §3.9 and AR-19.
  4. Make `asset.lineage_id`, `predecessor_declaration` and `predecessor_ref` immutable from `INSERT`. Lineage changes happen only by governed merge.
  5. Resolve the unique-index contradiction. Either keep "never re-registrable" and correct 01 §3.3, T-SEC-10 and the sweep text, or scope the index to non-retired rows and rely on the continuity trigger. The first is simpler and fail-closed.
  6. Add tests for each.
- **Blocker:** yes for P1 (schema) and P3 (classification apply).

### AST-01-F20 — MEDIUM — A new `SECURITY` determination in a lineage does not narrow its siblings
- **Affected:** 01 §3.9, §4.6, §4.7; 05 §5.1, §5.2; 02 W3.
- **Evidence:**
  - Lineage asserts economic-subject continuity. `elevated` guards only *future loosening*.
  - If sibling B (for example a bridged representation) was classified `NON_SECURITY` before sibling A was determined `SECURITY`, B stays `NON_SECURITY`, backstop-clean and Spot-/MB-deposit-eligible. Nothing flags it.
  - AST-HD-9 keeps classification per instrument, which is fine. But a system-detectable condition — a `SECURITY` record appended in a lineage containing real `NON_SECURITY` members — produces no narrowing.
- **Required correction:**
  1. On append of a real `SECURITY` record, place a **`SYSTEM` hold** (`LINEAGE_SECURITY_DETERMINATION`) on every other real instrument in the lineage root whose effective outcome is `NON_SECURITY`.
  2. Revoke their tokens and emit a critical event. Release is maker-checker with a "lineage reviewed" attestation.
  3. This changes no classification. It is the conjunct model AST-HD-6 already approves for system-detected conditions.
  4. Add a test.
- **Blocker:** yes for P3/P4 (small). Not a P1 blocker.

### AST-01-F21 — MEDIUM — The MYR fiat-leg gate is misstated and no consumer is required to fail closed
- **Affected:** 01 §3.10 ("MYR restrictions remain enforced by the pair/product control"); 04 §2.2, §6.4; 17 DCR-AST1-004(g), DCR-002(4), DCR-008(c), §2.1; 12 AR-22.
- **Evidence:**
  - `ASSET-RULE-001` (MYR pairs prohibited unless separately approved; a pair cannot activate if either leg is prohibited) and `DEC-013` cl. 6 (MYR pairs out of scope) need a MYR-pair control.
  - No module owns it (OQ-6). No code implements it (§3: only WLT-01 payout rails mention MYR).
  - v1.0's all-fiat-`INELIGIBLE` blocked MYR by accident. v1.1 correctly removes that, but hands MYR to a control that does not exist, and describes it as "remain enforced".
  - The consumer contract tells OMS/TRD/PAY to resolve the fiat leg via `GET /currencies/{iso}`. It does **not** tell them to deny when `myr_denominated = true`. A consumer built to DCR-004 as written would admit `BTC/MYR`. This is the bypass invariant E asks about. Normal fiat quote and payment use is correctly **not** denied.
- **Required correction:**
  1. Restate 01 §3.10 as: "No MYR-pair control exists today; MYR-pair prevention is **not enforced anywhere** until OQ-6 assigns an owner."
  2. Add to DCR-004(g) and DCR-002(4): a fiat leg with `myr_denominated = true` in a **trading pair** ⇒ the consumer denies unless a recorded pair-level MYR approval exists. Absence of that owner or approval ⇒ deny. MYR payment and payout rails are unaffected.
  3. In 17 §2.1, classify DCR-008(c) as an **implementation gate for any consumer blueprint that activates a fiat-quoted pair**, not only a go-live gate.
- **Blocker:** not for AST-01 P1–P4. It is a text correction required before acceptance, and it gates consumer blueprints.

### AST-01-F22 — LOW — Fiat short-circuit keyed on asset class and ordered before the hard rule; class ⇔ form checked only on instrument write
- **Affected:** 01 §5.2 step 0; 04 §6.1 step 3; 05 §4.1, §4.2 `trg_instrument_fiat_form`.
- **Evidence:**
  - Step 0 returns `not_applicable` by **class**, before the hard rule. The class ⇔ form trigger sits on `instrument` only, while `asset_class` is updatable until lock.
  - A digital instrument whose asset class becomes `FIAT_CURRENCY` while in `DRAFT` would get `not_applicable` for MB subjects, even with a `SECURITY` record, if trigger 4's "fiat" is read by class.
  - No token is minted, so the harm is limited to a consumer misreading `not_applicable`.
- **Required correction:**
  1. Short-circuit on `instrument_form = 'FIAT'`, matching B3.
  2. Enforce class ⇔ form on `asset` UPDATE as well, or make `asset_class` immutable from insert.
  3. State in DCR-004 that `not_applicable` for a non-`FIAT`-form instrument is a deny.
- **Blocker:** no.

### AST-01-F23 — LOW — Binding completeness: client facts, verify inputs, SQL consumer check, allow-list assertion
- **Affected:** 04 §6.1 step 11, §6.2; 05 §8.1; 01 §5.8.
- **Evidence:**
  - `client_facts` drive C3 (jurisdiction, `INVESTOR_CLASS_ONLY`) but are not stated to be in `payload_hash`. The verify request carries no client facts, so the "fresh re-derivation" has no defined client input.
  - The token trigger compares the log row on instrument, subject, domain and record, but not `consumer_service`.
  - The subject allow-list is "AST-01 config" with no boot-time assertion equivalent to the matrix invariant.
- **Required correction:**
  1. Include `client_facts` and a caller order/client reference in `payload_hash`. Verify re-derives with the logged facts.
  2. The token trigger checks `consumer_service`.
  3. Freeze the allow-list as a constant with a boot invariant: MB/PSO-domain identities map only to MB/PSO subjects; `WLT-01` maps only to `*_MB_PSO`.
- **Blocker:** no. Fold into P2.

### AST-01-F24 — LOW — Schema hygiene on backstop inputs and conjunct rows
- **Affected:** 05 §2, §6, §7 ("autonomous path").
- **Evidence:**
  - `deployment_environment` is "written once", but no trigger rejects UPDATE or DELETE by the owning role.
  - "Writes a `SYSTEM` hold in an autonomous path" from a raising trigger is not available natively in PostgreSQL: the hold insert rolls back with the raise.
  - Key columns of approved conjunct rows (`product_admission.instrument_id/product/classification_record_id`, `custody_support.domain`) are updatable. The admission trigger fires on "update to `APPROVED`". This cannot breach INV-01, because the matrix still denies.
- **Required correction:**
  1. Add an immutability trigger on `deployment_environment`.
  2. Specify that the application catches the backstop error and places the hold in a separate transaction; the trigger itself only raises.
  3. Make the key columns of conjunct rows immutable from insert.
- **Blocker:** no.

### AST-01-F25 — LOW — Doc 00 §1.D rule 4 interpretation for real instruments classified provisionally in non-production
- **Affected:** 01 §4.3, §5.3 (real `NON_SECURITY` rows), §4.4.
- **Evidence:**
  - Doc 00 §1.D rule 4: "a real instrument is never eligible on the strength of a test classification."
  - v1.1 lets a real instrument be classified in non-production under a non-production standard. It calls the result "provisional test data … not a determination", yet derives `ELIGIBLE` from it (for example real `NON_SECURITY` stablecoin × `SPOT` in UAT).
  - Module Index §19 rule 14 uses "test classification" for the synthetic/test type, which supports v1.1's reading. §1.E (mock/synthetic execution only outside production) limits the practical effect.
  - The wording tension is real, and the blueprint does not address it.
- **Required correction:**
  1. Either state the interpretation explicitly for human confirmation ("test classification" = `SYNTHETIC_TEST_INSTRUMENT`),
  2. or adopt the fail-closed alternative: a real instrument derives `NOT_ASSESSED` unless its effective record's standard is PRODUCTION-applicable, and non-production Spot/OTC testing uses `SYN→NON_SECURITY` instruments.
- **Blocker:** no. Human confirmation is recommended.

## 7. SQL-backstop adjudication (focus A)

Reviewed from the v1.1 DDL and trigger text in 05 §2, §5.1, §6, §7, §8.1, not from its descriptions.

| Attack | Result |
|---|---|
| Application-supplied denormalised state | **Defeated at INSERT.** Log and token triggers ignore `effective_outcome`, `environment` and `synthetic_emulates`, and read `authoritative_state()`. T-SEC-03 falsifies the copies. **Not defeated after INSERT:** token binding columns are updatable (F18) |
| Stale classification rows | **Defeated at INSERT.** An `allow` requires `classification_record_id = current_record_id` (max `record_seq`, trigger-assigned under the instrument `FOR UPDATE`). An explicit `UNRESOLVED` newest record ⇒ B2 for MB. **Not defeated at consume** (F18) |
| TOCTOU / transaction ordering | **Open.** No lock in `authoritative_state()`. Hold insert takes no instrument lock. Mint can commit against a record superseded mid-transaction. Mitigated today only by TypeScript verify (F18) |
| Environment forgery | **Defeated for the row.** `recorded_environment` is trigger-filled from `deployment_environment`; B2 compares record to deployment; the caller's value is never read. **Residual:** `deployment_environment` has no immutability trigger (F24). A cloned or restored database carries its row, but the boot check against service config refuses to start on disagreement. Acceptable with F24 |
| Incorrect instrument binding ⇒ cross-subject allow | **Inside AST-01: defeated.** Current-record equality implies record ↔ instrument; the token must match the log row. **Across the boundary: open**, because the consumer's instrument id comes from ambiguous resolution (F17) |
| SQL ↔ TypeScript divergence | **Safe in direction.** I found no cell where the backstop permits something the matrix forbids for B1, B3 or B5. B7 and B2 are stricter only where the matrix already denies. A backstop that is stricter than TypeScript fails closed (a trip raises and places a `SYSTEM` hold). Parity is tested (T-DB-09), not proven (AR-20, stated) |
| Independent prevention of security → MB | **At mint: yes.** B1 reads actual-or-emulated `SECURITY` from ledger and instrument and denies all five MB/PSO subjects in every environment. **At use: no** (F18) |
| Product admission / attestation triggers | Correct: `backstop_permits` plus current-record binding, including `PROPOSED` for `SPOT`/`OTC`/`PAY`. Conjunct-row key mutability is LOW (F24) |

**Adjudication:** the F04 design is correct in concept and closes the R1 defect (trusting row copies). It is **not yet a complete independent backstop**, because the gate consumers rely on — consumption — is outside it. F18 is small, schema-local and required.

## 8. Lineage / AR-19 adjudication (focus B)

| Path | Result |
|---|---|
| `SECURITY → UNRESOLVED → NON_SECURITY` | **Closed.** `elevated` reads any real `SECURITY` record in the lineage root, computed by trigger, ignoring the supplied value |
| Retire → recreate, same contract | **Closed (stronger than claimed).** The unique index including `RETIRED` rows blocks any re-registration. The documentation contradicts this (F19.5) |
| Same contract recreated under a new asset | Closed by the same index |
| New asset code with a declared predecessor | Closed: the `SAME_ECONOMIC_SUBJECT` trigger forces the lineage root |
| Lineage merges | Closed: governed, irreversible, root-following reads, real/synthetic separation |
| Predecessor declaration | Closed at insert. **Open while `DRAFT`:** asset lineage and predecessor fields are mutable (F19.4) |
| Native-coin retire/recreate | **Open** (F19.1) |
| Contract wrappers / proxies | **Wrappers open** (F19.2): the underlying link is not wired to `elevated`. **Proxies:** a proxy re-pointing is on-chain and invisible (AR-08, OQ-5, stated). A *new* proxy address around the same implementation needs the code-hash signal, which does not exist (F19.3) |
| Economic-subject replacement (new contract, new asset, nothing declared) | Genuine residual (AR-19). Acceptable **after** F19 is fixed |
| Sibling already `NON_SECURITY` when another sibling becomes `SECURITY` | **Open** (F20) |

**AR-19 verdict:** the residual is honestly described in kind. However, three deterministic paths (native identity, underlying → security, code hash) are currently left to the human checker, contrary to the acceptance condition in the brief. After F19 and F20, AR-19 is an acceptable stated residual.

## 9. Pending positions (not human-approved; not marked approved here)

| Item | v1.1 working default | Safe for blueprint acceptance? | Human decision needed before |
|---|---|---|---|
| **HD-5** Pay × security outcome | `INELIGIBLE` (hard rule), in B1 | **Yes.** Default-deny is fail-closed. No master authorises Pay of a security; `PAY-SRS-009` defers to AST-01 | Only a decision to **permit** it |
| **HD-7** Meaning of `RWA` eligibility | "Object of the RWA lifecycle" | **Yes.** The alternative reading (payment currency) would only widen; under the default, MB-candidate classes × `RWA` = `INELIGIBLE`, which is fail-closed | Before the `RWA-01…04` consumer blueprints |
| **P-3** `SECURITY`/`SECURITY_TOKEN` class + `NON_SECURITY` refused | Refused (definitional) | **Yes.** It only refuses a loosening. It is distinct from the rejected HD-4 presumption. A mislabelled class is corrected by a new asset in the same lineage (after F19.4) | Confirmation only |
| **P-4** Digital MYR-denominated instruments | `ASSET_NOT_ALLOWED` (`INELIGIBLE`, prohibited-category semantics) | **Yes, fail-closed.** Note: it uses prohibited-category semantics (INV-11 "no override path") for what v1.1's own §5.9 would class as a pending question (`NOT_ASSESSED`), so relaxing it later requires a code change. Recommend `NOT_ASSESSED` with a dedicated reason. Not blocking | Before any MYR-denominated digital instrument is admitted |

None of the four is a blocker for acceptance. All four must remain recorded as **pending**, which v1.1 does correctly (17 §1.2). F25 adds a fifth item recommended for human confirmation.

## 10. Focus areas C–H (summary)

- **C. Domain-scoped custody (F01):**
  - WLT-01 is allow-listed only to `DEPOSIT_MB_PSO`/`WITHDRAWAL_MB_PSO`. A securities-domain call is refused before any state is read (T-DOM-03). A securities token can never verify for an MB subject.
  - WLT-01 therefore cannot legitimately obtain a securities-domain result and treat it as MB permission.
  - The quarantine rule exists (DCR-002(5)). It is **defeated by F17's resolution key**, so "no credit" is not yet guaranteed.
- **D. Real instruments (F03):**
  - Build-unlocked ≠ eligibility-unlocked is explicit (⁵).
  - Synthetic `SYN→SECURITY` exercises the full securities lifecycle in non-production, and is `INELIGIBLE` everywhere in PRODUCTION.
  - Real `SECURITY` is `NOT_ASSESSED` on all five securities-route subjects in every environment. This holds.
- **E. Fiat (F08):**
  - Fiat is not classified as a digital asset (no case, record or admission; trigger-enforced).
  - Fiat quote and payment legs are not denied (`not_applicable` plus a reference lookup).
  - **MYR:** v1.1 does not itself create a bypass, but it states a non-existent control as enforcing and leaves consumers without a fail-closed rule (F21).
- **F. Holds (F07):** a separate conjunct C0 after the hard rule. Classification is never rewritten; a held `SECURITY` still reports the hard-rule reason. This holds.
- **G. Matrix (F10):** see §12.
- **H. `SECURITIES_MARKET` rename (F15):** see §14.

## 11. `task.json` / task-state adjudication

- **State:** `IDLE`. It is conductor-valid (`{"ok":true,"errors":[]}`) and fail-closed: the implementation gate starts only from `PLAN_READY` (`implementation.ts:252`). **Not changed by this review.** The brief permits a change only if the strict validator requires one, and it does not.
- **Staleness, not invalidity:** `roundCounts.review` (1), `findingsSummary` and `relevantRecordPaths` do not yet reflect this R2 review or F17–F25. These are updated at the next conductor or remediation checkpoint. They are not implementation-eligibility fields.
- **`PLAN_READY` must not be set** by any reviewer or author. It is written only by the conductor's human `approve-plan` checkpoint. A later human checkpoint is required after an ACCEPT re-review.
- **ACC-01 comparison:** ACC-01's `task.json` on `module/ACC-01` records `PLANNING`, which in conductor semantics denotes a planner run in progress. AST-01's `IDLE` is the more accurate state for a hand-authored plan. The difference is noted and **not harmonised**, and no implementation eligibility is created.

## 12. Matrix totality (focus G)

- The outcome axis (5), class (10), subject (10) and environment (5 + unknown) are all covered. The explicit default is `NOT_ASSESSED` / `MATRIX_CELL_NOT_DEFINED`.
- The boot invariant throws on:
  - any undefined-but-not-`NOT_ASSESSED` cell;
  - any `SECURITY` (real or emulated) MB/PSO cell that is not `INELIGIBLE`;
  - any `UNRESOLVED` cell that is not `NOT_ASSESSED`;
  - any real securities-route `PERMITS`;
  - any fiat mismatch.
- Unlisted combinations checked, each denies:
  - `SYN→NON_SECURITY` × `SECURITY_LABELLED` class ⇒ `NOT_ASSESSED` ⁴;
  - `SYN→SECURITY` × MB-candidate class ⇒ MB `INELIGIBLE`, `RWA` `INELIGIBLE`;
  - synthetic × unknown environment ⇒ treated as PRODUCTION ⇒ `INELIGIBLE`.
- **Total. Closed.**

## 13. DCR / gate adjudication

| DCR | v1.1 statement of the gate | Adjudication |
|---|---|---|
| 001 (a)+(d) IAM-02 | Implementation gate for enabling governed classification apply (P3). (b)+(c) go-live and maker-checker UAT | **Accurate.** Seam verified |
| 002 WLT-01/LED-01 | Go-live gate | Accurate as a gate. **Content must change** per F17 (contract-address resolution; ambiguous/unregistered ⇒ quarantine) and F21 (MYR leg) |
| 003 CFG-01 | (a) before UAT/DEMO availability; (b) go-live | Accurate. Namespace guidance (`asset_registry.*`, not `exchange.`/`securities_market.*`) is correct |
| 004 Consumers | Go-live gate; implementation gate for each consumer's blueprint | Accurate. **Content must add** F21 (MYR fail-closed), F22 (`not_applicable` on a digital leg = deny) and F23 (client facts bound) |
| 005 Document store | Go-live gate for real classification | Accurate |
| 006 Role Matrix | Implementation gate for single-actor human paths only | **Accurate.** The master-compliant actor + `COMPLIANCE_OFFICER` default is used where the matrix is silent, and no authority is invented |
| 007 FND-01/`MIG-001` | Not a blocker | Accurate |
| 008 Masters | (b) fiat scope; (c) go-live; (e), (f) informational | (c) **understated**: it must also gate consumer blueprints that activate fiat-quoted pairs (F21) |
| 009 Control layer | Precedes promotion | Accurate. No control-layer file was touched by v1.1 or by this review |

No DCR is implemented, which is correct. External DCRs need not be implemented for blueprint acceptance, but the blueprint must state them accurately. Once DCR-002/-004/-008(c) carry the F17/F21 corrections, they will.

## 14. `SECURITIES_MARKET` rename (focus H)

- A grep over v1.1 for `exchange\.[a-z_]+` found **0** identifiers.
- The bare `EXCHANGE` appears only in prohibition, rename or test-assertion text (04 §1.3, 10 T-BND-04, README change log, 17 OQ-7 strike-through).
- The fragment guard over all 35 v1.1 route strings found **0** hits.
- The audit namespace is `ast1.*`. The proposed CFG-01 codes are `asset_registry.*`.
- **No new `exchange.*` capability identifier exists. Closed.**

## 15. Required before the next re-review

1. Correct **F17** and **F19** (HIGH) and **F18**, **F20**, **F21** (MEDIUM) in a v1.2 pack. v1.1 stays unchanged as reviewed evidence.
2. Fix F22–F24, or record why not. Put F25 to the human for interpretation, or adopt the fail-closed alternative.
3. Keep HD-5, HD-7, P-3 and P-4 recorded as pending. None needs deciding before acceptance.
4. Re-review with a separate context. Only F04 (via F18), F06 (via F19/F20), F01 (via F17) and F08 (via F21) need re-examination, plus the new findings. F03, F07, F09–F16 are closed.

---

AIX AST-01 v1.1 SEPARATE-CONTEXT RE-REVIEW:
**REMEDIATE — IMPLEMENTATION NOT AUTHORISED**
