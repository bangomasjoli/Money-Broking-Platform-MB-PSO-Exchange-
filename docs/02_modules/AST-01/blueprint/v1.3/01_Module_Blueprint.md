# AST-01 — 01 Module Blueprint (v1.3)

**Status: REMEDIATED / AWAITING RE-REVIEW.** Nothing here is accepted or approved for implementation. v1.0 (`78ec1e4`) and v1.1 (`e20b8ca`) are reviewed historical evidence (both `REMEDIATE`). Reviews: [`04-review.md`](../../../../03_implementation/tasks/AST-01/04-review.md) (v1.0), [`04-review-r2.md`](../../../../03_implementation/tasks/AST-01/04-review-r2.md) (v1.1). Finding-by-finding records: [`05-remediation.md`](../../../../03_implementation/tasks/AST-01/05-remediation.md) (v1.1), [`05-remediation-r2.md`](../../../../03_implementation/tasks/AST-01/05-remediation-r2.md) (v1.2). Changes from v1.1 are tagged **[v1.2: Fnn]**. **v1.3** remediates the round-3 review [`04-review-r3.md`](../../../../03_implementation/tasks/AST-01/04-review-r3.md) (v1.2, `REMEDIATE`: F27, F26 MEDIUM; F28 LOW); record: [`05-remediation-r3.md`](../../../../03_implementation/tasks/AST-01/05-remediation-r3.md); changes from v1.2 are tagged **[v1.3: Fnn]**. v1.0–v1.2 are unchanged reviewed evidence.

Sources: `DEC-012` clause 6; `DEC-013` clauses 2–5, 7–11; `DEC-014`; Doc 00 v1.5 §1.D, §12A, §12B, §12E.2, §21A, §25.3 (`MIG-010`); Module Index v1.4 §5.4, §6, §9, §19 (rules 2, 3, 5A, 5B, 13, 14); SRS v1.3 `AST-SRS-001`, `001A`; System Rules v1.3 `SYS-RULE-009`, `SYS-RULE-010`, `ASSET-RULE-001`, `ASSET-RULE-002`, `LED-RULE-005`; Workflow Map v1.3 `WF-32`, `WF-35`; Role Matrix v1.3 §3.4, §3.7, §5.2, **§19 rule 9**, **§23**, **§28**. Human decisions recorded in the round-2 remediation instruction: `AST-HD-5`, `AST-HD-7`, `AST-P-3`, `AST-P-4`, `AST-R2-HD-01` (17 §1.1).

---

## 1. Purpose and ownership

AST-01 is the **single platform-wide** registry of assets and instruments and the **only** place a regulatory classification is recorded and product eligibility derived from it. It is not RWA-only (Doc 00 §12A). One registry, because splitting classification from eligibility "would allow eligibility to drift from classification" (Module Index §9).

### 1.1 AST-01 owns

| # | Concern | Notes |
|---|---|---|
| 1 | Asset identity, instrument identity | Asset = the concept; instrument = the classifiable, admissible unit (§3.1) |
| 2 | **Fiat currency reference data** | Identity, precision, MYR attribute, ledger/payment references, pair-configuration inputs — **outside the §12A classification/eligibility API** (§3.10) |
| 3 | Regulatory classification, lifecycle, evidence, **lineage** | Append-only, maker-checkered, bound to identity and lineage (§4) |
| 4 | Asset classes, jurisdictions, issuer reference, underlying reference | Descriptive; class is narrowing only |
| 5 | Network / contract details, precision | §3.7, §3.8 |
| 6 | Custody support, transfer restrictions | Facts and restrictions; enforced elsewhere |
| 7 | Derived product eligibility and **domain-aware** operational eligibility | §5. Computed, never stored |
| 8 | Narrowing conjuncts | Holds, product admission, attestation record, jurisdiction rules, operational state |

### 1.2 AST-01 does not own (must not build)

| Not AST-01 | Owner | Boundary |
|---|---|---|
| Trading, order handling, routing | `OMS-01`, `TRD-01`, `EXE-01`, `LQD-01` | Consume AST-01 eligibility **and** verify a bound token before routing (Module Index §19 rule 2), at **every** routing/execution attempt |
| Securities-market listing, order book, matching | `EXM-01`, `EXO-01` | AST-01 records only an admission **attestation** (§8.6). The matching engine is never reachable from AST-01 (`DEC-013` cl. 5, 7) |
| Ledger, balances, precision *application* | `LED-01` | AST-01 states `amount_scale` |
| RWA issuance, issuer KYB/UBO | `RWA-01`…`RWA-04` | AST-01 holds an issuer **reference** |
| Wallet addresses, screening, address format | `WLT-01` | AST-01 states which instrument-networks exist; WLT-01 remains authority for address validity and screening coverage. **WLT-01's binding to AST-01 is specified in §5.8 and DCR-AST1-002** |
| Client KYC / class / jurisdiction of a client | `KYC-01`, `CLT-01` | Callers pass the client fact in |
| Feature flags, environment availability, production activation, permissions | `CFG-01`, `IAM-02` | AST-01 answers one conjunct only |
| **Pair configuration, pair activation, MYR-pair control** | Not assigned in Module Index v1.4 (OQ-6); **no such control exists in code today** | AST-01 supplies fiat/digital identity, the MYR attribute and the fail-closed `NOT_ASSESSED` result for digital MYR (§3.10); it does not decide a pair and enforces no pair rule |
| Fees | `FEE-01` | — |

### 1.3 Build state (`DEC-013` clause 2)

`CAPABILITY_BUILD_STATE` = `SPECIFIED` **only after** re-review and acceptance of this pack (it is not accepted today). `ENVIRONMENT_AVAILABILITY` and `PRODUCTION_ACTIVATION_STATE` are CFG-01's and are never stored here; `PRODUCT_ASSET_ELIGIBILITY_STATE` is owned here for the instrument × subject dimension and is derived. AST-01 `ACCEPTED`, if it ever occurs, never means an instrument is production-activated (Module Index §5.4).

---

## 2. Non-negotiable invariants

| ID | Invariant | Defended by |
|---|---|---|
| **INV-01** | An instrument whose effective outcome is `SECURITY_OR_SECURITY_TOKEN` (real, or synthetic-emulating) is **never** `ELIGIBLE` for **any MB/PSO-domain subject** — `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO` — in every environment | Four layers: total frozen matrix + exhaustive boot invariant; pure derivation; **authoritative SQL backstop that reads the classification ledger, not application-supplied columns, at token mint AND at token consumption** (05 §7, §7A); service allow-list + token binding (§5.8) |
| **INV-02** | No valid effective classification ⇒ every subject `NOT_ASSESSED` ⇒ deny. `UNRESOLVED` is the absence of a valid record, not a settable flag | Derivation; no defaulting column |
| **INV-03** | No eligibility-shaped column exists outside the append-only decision log and token tables; eligibility is computed, never stored or set | Schema-lint T-SCH-01 |
| **INV-04** | Every other control (hold, admission, operational state, custody, restrictions, jurisdiction, prohibited attributes, attestation) is **conjunct-only**: it can deny; it can never turn `INELIGIBLE` or `NOT_ASSESSED` into `ELIGIBLE` | Derivation shape; T-DER-03 |
| **INV-05** | Classification records are append-only, evidenced, maker-checkered and bound to the identity fingerprint and lineage. **Maker ≠ checker is verified only against approver identity that IAM-02 attests** (DCR-AST1-001(d)); AST-01 does not claim to verify it from data IAM-02 does not provide | IAM-02 attestation; DB CHECK on the stored attested values; apply disabled until DCR-AST1-001(a)+(d) (§4.8) |
| **INV-06** | Environment is read from AST-01's own validated config; the caller's value is an asserted consistency field. Unknown ⇒ PRODUCTION | Route layer; T-ENV-* |
| **INV-07** | `SYNTHETIC_TEST_INSTRUMENT` is valid only in DEVELOPMENT/TEST/UAT/DEMO, fails closed in PRODUCTION, and is structurally unpromotable. `declared_synthetic` and `synthetic_emulates` live **only** on the instrument, immutable from `INSERT` | DB triggers/CHECKs; T-SYN-* |
| **INV-08** | A non-production classification is never evidence in PRODUCTION (Doc 00 §21A rule 4) | `recorded_environment` binding |
| **INV-09** | **Human-initiated** tightening and loosening are both maker-checkered until the Role Matrix establishes a single-actor authority (DCR-AST1-006). **System-detected integrity failure** fails closed immediately and needs no human approval. `SYS-RULE-008` and the kill switch are **precedent, not authority** | 07 §5 |
| **INV-10** | AST-01 never emits "access granted". Every response names `conjunct: PRODUCT_ASSET_ELIGIBILITY` and lists what it did not evaluate | Response schema |
| **INV-11** | Prohibited categories deny with no override path for any role, including Super Admin (`ASSET-RULE-001` rule 6) | No clear endpoint; attributes immutable after lock |
| **INV-12** | Every evaluate decision is logged with the classification record used and the matrix version | `eligibility_decision_log` |
| **INV-13** | AST-01 imports no other service's source and holds no grant into other modules' schemas (F3(c)) | Import/grant tests |
| **INV-14** | No AST-01 route path contains an `assertNoExchangeRuntime` fragment, notably `exchange` | Boot self-test over its own route table |
| **INV-15** | **Domain and consumer binding.** Every subject belongs to one domain (`MB_PSO`, `RWA`, `SECURITIES`). Each calling service is allow-listed to specific subjects; a decision token binds subject, domain, consumer service, instrument, environment and classification record; a token for one subject/domain never verifies for another (Module Index §19 rule 5A). **[v1.2: F23]** The allow-list is a frozen constant with a boot invariant, and the client facts a conjunct used are part of the bound payload | 04 §1.1, §6; T-TOK-*, T-DOM-* |
| **INV-16** | Fiat is reference data only. It has no §12A outcome, no classification case and no product admission, and is **never** returned as a digital-asset `INELIGIBLE` | Trigger; API `not_applicable` contract (§3.10) |
| **INV-17** | **Lineage.** Any prior real `SECURITY` determination anywhere in an instrument's lineage, **or in the lineage of an instrument it wraps**, triggers the elevated approval path for any later loosening; it cannot be avoided by an interim `UNRESOLVED`, a replacement instrument/asset under continuity, or by editing lineage fields (immutable from creation). **A `SECURITY` determination — appended as a record *or* joined to an instrument's lineage by a governed merge — also immediately fail-closes every linked `NON_SECURITY` instrument whose current record predates it** until an explicit elevated review (§4.7A) [F19, F20; v1.3: F27] | Lineage tables, trigger-computed; derived conjunct with a merge clause; SQL B8; merge-apply narrowing in the merge transaction; §4.7, §4.7A |
| **INV-18** | **Canonical resolution.** An instrument is identified by exactly one canonical identity (token: chain + network + contract address; native: chain + network). Symbol, asset code, chain or network alone never resolve an instrument. 0 or >1 matches ⇒ `NOT_ASSESSED`, no token; a sibling is never guessed [F17] | Unique identity indexes over all statuses; single-selector schema; T-RES-* |
| **INV-19** | **Real instruments need a production-applicable basis.** A real instrument is never eligible on a test, provisional or non-production-only classification (Doc 00 §1.D rule 4, strict reading — `AST-R2-HD-01`). Non-production product testing uses synthetic instruments [F25] | §4.3, §4.4; SQL B11 |
| **INV-20** | **Consumption is serialised with mutation.** Mint and consume each run in one transaction under one lock order (instrument before token); the SQL backstop re-runs at the consuming `UPDATE`; token binding columns are immutable [F18]. **[v1.3]** The one order is total across the module: governed change → lineage gate → asset → instruments ascending → tokens → append-only inserts; lineage-wide and asset-wide writers lock their whole affected set before they write, and the first-instrument insert and the asset-class writer lock the same asset row | 05 §7A; T-CON-*, T-LOK-* |
| **INV-21** | **Server-authoritative ordering.** Every security-relevant "newer than" is a comparison of DB-assigned values drawn from **one** sequence under the §7A locks (records, lineage merges, evidence, correction markers). No application-supplied timestamp or sequence participates, and `recorded_at_utc` is trigger-filled and audit-only [F27, F28.b] | 05 §1 rule 12, §5, §7; T-ADR-* |
| **INV-22** | **The classification is bound to the identity it classified, in SQL.** SQL compares the current record's fingerprint with the instrument's; a mismatch (rule B12) denies every eligibility or action that relies on the record — no mint, no consumption, no admission, no attestation. A governed `ASSET_CLASS_CORRECTION` is such a mismatch by design and revokes tokens in its own transaction [F26] | 05 §7 B12, §7A; T-FPR-* |
| **INV-23** | **The database enforces the canonical contract identity and the lineage kind.** A non-canonical contract address is rejected by the database (the unique identity index operates only on validated values); `lineage.synthetic` is immutable from `INSERT` [F28.a, F28.c] | 05 §2.1, §3; T-ADR-* |

---

## 3. Identity model

### 3.1 Asset, instrument, lineage

```
Issuer ref ──< Asset >── Lineage (economic-subject continuity) ──< Instrument >── Network registry
                                                    │
                                                    ├── Underlying refs      ├── Classification records (append-only)
                                                    ├── Custody / operational └── Holds, admissions, restrictions, jurisdiction rules
```

| | **Asset** | **Instrument** |
|---|---|---|
| Meaning | The economic/technical thing | One holdable representation: asset on one network + contract, a native coin, an off-chain record, or (reference-only) a fiat currency |
| Classification | **None** — no eligibility semantics | **Per instrument** (AST-HD-9). Bridged/wrapped variants are different contracts and must be classified on their own evidence; evidence may be referenced across siblings, approval may not |
| Mapping to existing code | `asset_code` ↔ WLT-01 `asset_or_currency` — a **label**, never a resolution key | **Canonical identity (§3.11)** — a token is `(chain, network, contract_address_canonical)`. WLT-01 has no contract field today: an external gate (DCR-AST1-002) [F17] |
| **Lineage** | Each asset belongs to one lineage | Instruments inherit their asset's lineage. Classification is per instrument, **history follows the lineage** (§3.9, §4.7) |

### 3.2 Codes

`asset_code` `^[A-Z0-9]{2,16}$`. `instrument_code` `^[A-Z0-9][A-Z0-9._:-]{1,47}$`, unique, **immutable from insert**. **Synthetic codes match `^SYN[.-]`; real codes do not** (CHECK both ways), so synthetic instruments are structurally distinguishable everywhere (`AST-SRS-001A` req 5).

### 3.3 Identity fingerprint

`identity_fingerprint = sha256(canonicalJson({asset_code, asset_class, instrument_form, chain, network, contract_address_canonical, token_standard, issuer_ref_id, lineage_id, underlying[], amount_scale, declared characteristics, declared_synthetic, synthetic_emulates}))` (foundation canonical-JSON fingerprint, as CFG-01 change payloads). Every classification record stores the fingerprint it classified; mismatch ⇒ effective `UNRESOLVED` — `CLASSIFICATION_REQUIRED_AFTER_CORRECTION` when a governed `ASSET_CLASS_CORRECTION` explains it (05 §5.3; expected, no hold), `CLASSIFICATION_IDENTITY_DRIFT` when nothing does (integrity failure, `SYSTEM` hold) [v1.3: F26]. SQL compares the record's stored fingerprint with the instrument's cached one (rule B12); the hash itself is computed and re-verified in TypeScript and by the sweep. Identity columns are mutable only in `DRAFT`, **except** `instrument_code`, `declared_synthetic`, `synthetic_emulates` (§4.5) and the lineage-/identity-critical `asset_id`, `instrument_form`, `chain`, `network`, `contract_address_canonical` (§3.9), which are immutable from `INSERT`. After the first case is submitted the instrument is `IDENTITY_LOCKED`. **An identity error in a locked instrument is not corrected by editing, and not by retire-and-recreate on the same contract or native identity either** — a canonical identity is registered once, ever (§3.9 A, E; v1.1 described a path its own unique index made impossible [F19.E]). The instrument is retired (its identity stays permanently registered) and a replacement is a **new contract** under a declared predecessor or the same asset's lineage. A mislabelled asset *class* is corrected by the governed `ASSET_CLASS_CORRECTION` (§3.4), which is the **only** governed write to the cached fingerprint and is visible to SQL as a record/instrument fingerprint mismatch (INV-22). `POST /instruments/validate` (04 §2.1) is the dry run that avoids burning an identity on a typo (OQ-8).

### 3.4 Asset classes (`AST-SRS-001`)

`FIAT_CURRENCY`, `DIGITAL_CURRENCY`, `STABLECOIN`, `SECURITY`, `SECURITY_TOKEN`, `RWA_TOKEN`, `TOKENISED_DEBT`, `TOKENISED_FUND`, `TOKENISED_COMMODITY`, `OTHER_PERMITTED`.

The class is **descriptive and narrowing only**; it never supplies eligibility. Families used by the matrix:

| Family | Members | Use |
|---|---|---|
| `MB_CANDIDATE` | `DIGITAL_CURRENCY`, `STABLECOIN` | The only classes for which MB/PSO subjects can ever be class-permitted (`DEC-012` cl. 5: "eligible non-security digital currencies") |
| `RWA_FAMILY` | `RWA_TOKEN`, `TOKENISED_DEBT`, `TOKENISED_FUND`, `TOKENISED_COMMODITY` | Object of the RWA lifecycle |
| `SECURITY_LABELLED` | `SECURITY`, `SECURITY_TOKEN` | The class label itself asserts a security. A `NON_SECURITY` outcome for these is refused as a **definitional inconsistency** (`CLASS_CLASSIFICATION_CONFLICT`). **Approved (`AST-P-3`).** *This is not the presumption rejected by AST-HD-4 (below); it is not extended to `TOKENISED_DEBT`, `TOKENISED_FUND` or any other class.* |
| `REFERENCE` | `FIAT_CURRENCY` | Outside the §12A API (§3.10) |
| — | `OTHER_PERMITTED` | `NOT_ASSESSED` until a class rule is approved |

**AST-HD-4 (approved).** `TOKENISED_DEBT` and `TOKENISED_FUND` are **not** treated as securities because of their class label. They start `UNRESOLVED` like every instrument and take whatever outcome the governed classification and evidence establish. This blueprint answers neither `R4-Q3` nor `R4-Q6`. Where the outcome is a defined `SECURITY / SECURITY TOKEN`, the MB prohibition is absolute (INV-01).

**Class correction [AST-P-3; v1.3: F26].** An asset explicitly labelled `SECURITY` or `SECURITY_TOKEN` cannot receive a `NON_SECURITY` outcome while it keeps that contradictory label. `asset_class` is **frozen once any instrument of the asset exists**; the only change is the governed **`ASSET_CLASS_CORRECTION`** (maker `INSTRUMENT_CLASSIFIER`; when it moves a class **out of** `SECURITY`/`SECURITY_TOKEN`, `COMPLIANCE_OFFICER` **and** `MLRO` attested — it loosens). It preserves the lineage (no lineage field changes) and never crosses the fiat boundary once an instrument exists (`FIAT_CURRENCY` ⇔ `instrument_form = 'FIAT'`, [F22]). **v1.3 makes its effect enforceable below TypeScript.** The correction is a locked, single-transaction writer (05 §7A: governed change → asset row `FOR UPDATE` → **every** instrument of the asset ascending → tokens). In that transaction it recomputes the cached fingerprint of every instrument, records a `class_correction_marker` (the **governing change reference**) per classified instrument, and **revokes every outstanding token** (`asset_class_corrected`). The old records stay in the ledger, historical and unchanged, but SQL sees `record_fingerprint_matches = false` and rule **B12** denies every mint, consumption, admission approval and attestation that would rely on them (INV-22). The instrument derives `NOT_ASSESSED` **`CLASSIFICATION_REQUIRED_AFTER_CORRECTION`** — an **expected governed state**, not an integrity failure: **no `SYSTEM` hold** is placed for a correction that governance approved, and the sweep tells it apart from unexplained drift by the marker (05 §5.3, §7.1). A **new governed classification is mandatory** before eligibility can return. Correction **into** `SECURITY`/`SECURITY_TOKEN`: the stale `NON_SECURITY` record can no longer be used by SQL, and only `SECURITY` or `UNRESOLVED` can be recorded next. Correction **out of** them: the earlier `SECURITY` record stays in the lineage, so the next `NON_SECURITY` classification is on the **elevated** path (§4.7), and B1 keeps denying MB/PSO subjects on the stored `SECURITY` outcome meanwhile. The alternative to a correction is a **replacement contract** (new address) under lineage (§3.9). Same-contract re-registration is impossible (§3.9 E).

### 3.5 Issuer reference

Descriptive reference only (`source` `RWA01` — opaque RWA-01 id — or `EXTERNAL`); legal name, LEI, jurisdiction, informational `verification_status`. No KYB.

### 3.6 Underlying reference

Zero or more `instrument_underlying` rows (`underlying_type`, optional `underlying_instrument_id`, `backing_model`). `ALGORITHMIC` backing requires `attr_algorithmic_stablecoin = true`. A `STABLECOIN` needs ≥ 1 row with known backing before a case can be submitted. Evidence input for the classifier. A descriptive underlying changes no derived answer by itself. **[v1.2: F19.B]** An `INSTRUMENT` underlying link is also a deterministic **lineage signal**: insert-only (cannot be removed), added only in `DRAFT`, acyclic (depth ≤ 8), and same-kind (real↔real, synthetic↔synthetic). If the linked instrument's lineage holds a real `SECURITY` determination, the wrapper takes the elevated path (§4.7) and is fail-closed by the lineage conjunct (§4.7A). It does **not** declare the wrapper a security.

### 3.7 Network and contract details

`network_registry` read-only at runtime; a chain/network absent from it cannot carry an instrument. Contract addresses are canonicalised before the uniqueness check and before every resolution (§3.11). **[v1.3: F28.a]** The canonical form is **enforced by the database, not only by TypeScript**: a versioned SQL canonicaliser keyed on the network's registered `address_format`/`canonicalisation_version` backs a `CHECK` and a `BEFORE INSERT` trigger that **reject** any supplied value that is not already canonical (never silently rewriting or storing a second spelling); the unique identity index therefore operates only on validated canonical values, the resolver uses the same SQL function, the TypeScript function is a parity-tested mirror, and the sweep re-canonicalises every stored identity and flags collisions. A network with no supported rule cannot carry a token instrument (fail closed). See 05 §2.1. This does **not** replace WLT-01's `chain_coverage`; consumers AND both (DCR-AST1-002).

### 3.8 Precision (`LED-RULE-005` rules 1, 10)

`amount_scale` NOT NULL, no default, `≤ on_chain_decimals`, in the fingerprint, immutable after lock. AST-01 states the scale; rounding, residual accounts and pair precision are LED-01/pair-configuration concerns.

### 3.9 Lineage (F06 / AST-HD-9; v1.2: F19, F20)

**Purpose:** a previous `SECURITY` determination must not be escapable by re-registering the same thing, and must not leave a related instrument silently eligible.

- **Entity.** `lineage` groups instruments by **economic-subject continuity**. Each `asset` belongs to exactly one lineage, assigned at creation. A **real** and a **synthetic** lineage can never merge (CHECK). **[v1.3: F28.c] `lineage.synthetic` is immutable from `INSERT`**: lineage rows are insert-only, no role has an `UPDATE` route and a trigger refuses mutation by every role, so real and synthetic histories can never be converted into one another by editing the lineage row (05 §3).
- **A. Canonical identity is registered once — token and native.** Token identity is `(chain, network, contract_address_canonical)`; native identity is `(chain, network)`. Both are unique over **every** lifecycle status, including `RETIRED` and abandoned drafts. A retired or replaced native instrument can therefore not be re-registered, under a new asset or otherwise [F19.A].
- **E. No same-contract recreation.** There is **no** retire-and-recreate on the same canonical identity: v1.1's continuity trigger and "retire-and-recreate inside the same lineage" path were unreachable under its own unique index and are **withdrawn**. A **replacement contract has a new address**. It reaches the old lineage by (i) being created under the **same asset** (inherits the asset's lineage), (ii) a **declared predecessor** `SAME_ECONOMIC_SUBJECT`, or (iii) a governed **lineage merge** [F19.E].
- **D. Lineage assignment is immutable from creation.** `asset.lineage_id`, `predecessor_declaration`, `predecessor_ref`, `predecessor_attested_by`, `instrument.asset_id` and the identity keys are never `UPDATE`d, in any status, by any role. The only governed lineage operation is the **irreversible lineage merge** (a tightening). There is no un-merge and no lineage edit; a wrongly merged lineage is never split and its members take the elevated path [F19.D].
- **Declared continuity.** Creating an asset requires a `predecessor_declaration`: `NONE_DECLARED` (with a proposer attestation) or `SAME_ECONOMIC_SUBJECT(instrument_id | asset_id)`. A declared predecessor places the new asset in that lineage's root by trigger.
- **B. Wrapped / underlying history.** If an instrument's declared underlying (transitively, via `instrument_underlying`) is an instrument in a lineage with any real `SECURITY` determination, the new instrument **cannot obtain a `NON_SECURITY` outcome without the elevated SECURITY-history review** (§4.7). It is **not** thereby declared `SECURITY`; classification stays per instrument [F19.B].
- **C. Code hash — the v1.1 signal is withdrawn.** v1.1 listed "same contract code hash" as a candidate signal with no column, source or computation. AST-01 has no on-chain data source (OQ-5), and a proposer-typed hash would be no more deterministic than `NONE_DECLARED`. **v1.2 claims no code-hash control** [F19.C]. If OQ-5 later assigns a trustworthy source, a code-hash *candidate-link* signal (governed resolution, never automatic legal equivalence) can be added in a later version.
- **Candidate surfacing (advisory).** At submission AST-01 lists **lineage candidates** to the checker — same issuer reference, shared underlying instrument, similar name — and the approval payload binds the candidate list and carries the attestation "lineage reviewed". A candidate the checker judges continuous is linked by a governed lineage merge, **which immediately narrows every already-classified `NON_SECURITY` member the merge puts next to a `SECURITY` determination (F27)** — the merge is the AR-19 remedy path and it now does what it promises. Candidates are advisory; the deterministic signals above are not.
- **F20/F27. Siblings and merges.** A real `SECURITY` determination that enters an instrument's lineage — as a **new record** *or* by a **governed merge** joining an older determination to it — fail-closes every real `NON_SECURITY` instrument whose current record predates it, immediately, through a **derived conjunct** (§4.7A). **A lineage merge is a ledger event**: it carries a DB-assigned `merge_global_seq` from the same sequence as classification records, is applied with every affected instrument locked ascending, and in its own transaction revokes the tokens of the narrowed instruments and audits the propagation (05 §7A). Classification remains per instrument and is never rewritten.
- **Residual risk (AR-19, stated).** Only the genuinely non-deterministic case remains: an economic-subject replacement where **no canonical identifier matches, no underlying relationship exists, no predecessor is declared, no same-asset membership exists and no lineage signal is surfaced** — including a code-identical redeployment that shares no issuer reference, because AST-01 has no code-hash source. That case is handled by the human classifier and evidence process. AR-19 is **not** used to excuse any signal the platform can deterministically know.

### 3.10 Fiat currencies — reference data only (F08 / AST-HD-1)

`instrument_form = FIAT`, `asset_class = FIAT_CURRENCY`. AST-01 stores currency identity (ISO 4217 code), `amount_scale` (`LED-RULE-005` rule 2), the `attr_myr_denominated` attribute, and ledger/payment reference identifiers. Fiat **never** has a classification case, outcome, product admission, hold-derived outcome or eligibility answer (trigger-enforced).

**Contract (04 §2.2, §6.4).**
- Consumers resolve a fiat leg through the **reference-data** endpoint (`GET …/currencies/{code}`), which returns identity, precision, `myr_denominated`, `status`, and `classification_regime: "NOT_APPLICABLE_FIAT"`. A missing, retired or precision-invalid fiat is a reference-data failure, not a digital-asset ineligibility.
- If a consumer nevertheless calls `evaluate` with a fiat instrument, the response is **`200` with `decision: "not_applicable"`, `eligibility_state: "NOT_APPLICABLE"`, `reason_code: "SUBJECT_NOT_APPLICABLE_FIAT"`, no token**. It is not `deny`, and it is explicitly **not** a statement that the fiat leg may not be used.
- **Fiat legs and Pay are not made impossible:** the digital leg of a Spot/OTC pair is evaluated with `evaluate`; the fiat leg is a reference lookup. **But no MYR-pair control exists today.** `ASSET-RULE-001` (MYR pairs prohibited unless separately approved; a pair cannot activate if either leg is prohibited) and `DEC-013` cl. 6 need a pair-level control; no module owns it (OQ-6) and no code implements it (only WLT-01 MYR *payout* rails mention MYR). **MYR-pair prevention is therefore not enforced anywhere until OQ-6 assigns an owner**, and AST-01 does not claim otherwise [F21]. AST-01 provides: fiat/digital identity, the `attr_myr_denominated` attribute (`myr_denominated` on the fiat surface), and the fail-closed result below.
- **Digital MYR (`AST-P-4`, approved with correction).** A digital instrument with `attr_myr_denominated = true` derives **`NOT_ASSESSED`, reason `MYR_PAIR_CONTROL_UNRESOLVED`** (conjunct C1m; SQL B10) — *not* a permanent prohibited-category `ASSET_NOT_ALLOWED`. It stays that way until a pair-control owner and approval rule exist. **There is no override path inside AST-01**: no flag, endpoint, role, configuration value or record clears it; relaxing it is a change to a later blueprint version made once the owner exists.
- **Consumers fail closed.** A consumer must not activate a digital MYR-denominated instrument, or any pair containing one, while it derives `NOT_ASSESSED`. A consumer that puts a `myr_denominated` **fiat** leg into a trading pair must deny unless it holds a recorded pair-level MYR approval from an authoritative pair-control owner; with no owner or approval it denies. MYR payment and payout rails are not trading pairs and are unaffected. Any consumer blueprint that activates a fiat-quoted or MYR pair needs the owner and rule first (DCR-AST1-008(c), DCR-AST1-004).

### 3.11 Canonical instrument resolution (F17)

An instrument reference that could match more than one instrument must never be accepted. Symbol, `asset_code`, chain or network alone are **not** identity: one asset may hold several contracts on one network (per-instrument classification of bridged and wrapped variants, AST-HD-9).

| Form | The only accepted selectors | Resolves by |
|---|---|---|
| `TOKEN_CONTRACT` | `instrument_id`; or `instrument_ref {chain, network, contract_address}` | exact match on `(chain, network, contract_address_canonical)` after canonicalisation by the network's rules |
| `NATIVE_COIN` | `instrument_id`; or `instrument_ref {chain, network, native: true}` | exact match on `(chain, network)` among native instruments |
| `OFF_CHAIN_RECORD` | `instrument_id` or `instrument_code` | unique code |
| `FIAT` | the fiat reference surface (`GET /currencies/{iso}`); never `evaluate` | ISO code |

1. **Exactly one selector** per request; none or several is a schema error (`400`, consumers deny).
2. **Exactly one match.** The unique identity indexes make >1 match impossible at write time; the resolver still counts and treats >1 as `INSTRUMENT_REFERENCE_AMBIGUOUS` (defence in depth against restored or tampered data). **0 matches** ⇒ `INSTRUMENT_NOT_FOUND`. Both are `deny` / `NOT_ASSESSED`, **no token**, logged with a null instrument and the canonical requested reference.
3. **Never guess.** AST-01 never selects "the eligible sibling", never falls back to another instrument of the same asset and never resolves by symbol. A reference that does not canonicalise for its network matches nothing.
4. **Retired instruments resolve** (to `INSTRUMENT_RETIRED`, `INELIGIBLE`). An identity is never freed, so a retired contract cannot be reached as "not found" and re-admitted.
5. `asserted_asset_code` is an optional consistency check on the *resolved* instrument, never a selector (mismatch ⇒ `INSTRUMENT_REFERENCE_MISMATCH`).
6. **Consumer contract.** A consumer identifies an instrument by canonical identity, or by an `instrument_id` it obtained from a canonical resolution, and binds that `instrument_id` at `verify-decision`. **WLT-01 must supply enough inbound transfer data to identify the actual instrument** — for a token transfer, the observed token contract address on its `(chain, network)`; for a native transfer, `(chain, network)`. WLT-01 today identifies assets by `(asset_or_currency, chain, network)` with no contract field (verified in migrations `049`/`066` by the round-2 review): an **external integration gate** (DCR-AST1-002). An **unsolicited inbound whose instrument cannot be uniquely identified is quarantined with no ledger credit.** A security sibling is never credited under a non-security sibling's classification, because no path leads from a contract to any instrument but its own.

---

## 4. Classification

### 4.1 Outcomes (Doc 00 §12A; `WF-35` §33F.5)

| Outcome | Stored as | Meaning |
|---|---|---|
| **UNRESOLVED** | **Absence** of a valid effective record (or an explicit `UNRESOLVED` reversion record) | Default. Fail closed |
| `NON_SECURITY_DIGITAL_ASSET` | record | *May be considered* for Spot/OTC subject to every other rule |
| `SECURITY_OR_SECURITY_TOKEN` | record | Never MB/PSO-domain. Securities route only (§5) |
| `SYNTHETIC_TEST_INSTRUMENT` | record, only for `declared_synthetic` instruments | Non-production only (§4.5) |

### 4.2 The ledger

`classification_record` is append-only. The **effective** classification of an instrument at time *t* is its highest-`record_seq` record, then subjected to the validity checks in §4.4 (looking at the newest record only is deliberate: selecting "the latest for this environment" would let an older record apply behind a newer one). A record requires: outcome; `identity_fingerprint`; `lineage_id`; `recorded_environment`; evidence standard and bundle hash; `maker_actor_id`; **IAM-02-attested** `checker_actor_ids[]` and `approval_policy_id`; `approval_id`; rationale; `record_seq`. **There is no `synthetic_emulates` column on the record** — the instrument is the single source of truth (§4.5).

### 4.3 Evidence and the evidence standard (`R4-Q3` open)

Immutable evidence items: type, title, `content_sha256`, opaque `object_ref` (no bytes in the DB), classifier of record, `synthetic` flag, author, timestamp; bundle hash bound into the approval payload. **AST-01 hard-codes no evidence standard, evidence types or securities-features checklist** (`R4-Q3` is unresolved). The standard is governed data (`evidence_standard`): classification approval needs an `APPROVED` standard whose `applicable_environments` includes the current canonical environment; a PRODUCTION-applicable standard needs a non-null `r4q3_resolution_ref` (a pointer to the governance decision — AST-01 answers nothing). Today no such standard exists ⇒ **no real instrument can obtain a usable `NON_SECURITY` classification in any environment** (`EVIDENCE_STANDARD_NOT_ESTABLISHED`) and real instruments stay `NOT_ASSESSED`. **[v1.2: `AST-R2-HD-01` — strict reading of Doc 00 §1.D rule 4.]** A real instrument is never eligible on the strength of a test, provisional or non-production-only classification. A non-production evidence standard therefore serves only (i) **synthetic** instruments and (ii) the **restrictive** outcomes (`SECURITY`, `UNRESOLVED`) of real instruments; it can never carry a real `NON_SECURITY`. **Non-production product testing of eligible instruments uses synthetic instruments with `synthetic_emulates`** (§4.5) so development is not blocked (`DEC-013` cl. 4); a provisional real-asset classification is never used to enable Spot, OTC, RWA or securities-market actions (INV-19). A non-production classification is in any case never evidence in PRODUCTION (INV-08).

### 4.4 Validity checks (each collapses the effective outcome to `UNRESOLVED` with the reason)

| Check | Reason |
|---|---|
| Newest record's `recorded_environment` ≠ AST-01's canonical environment | `CLASSIFICATION_ENVIRONMENT_MISMATCH` |
| Record fingerprint ≠ the instrument's fingerprint (SQL: cached value, rule B12; TypeScript: recomputed from the live identity), **and a verified `class_correction_marker` explains it** [v1.3: F26] | `CLASSIFICATION_REQUIRED_AFTER_CORRECTION` (expected governed state; **no hold**) |
| Record fingerprint ≠ the instrument's fingerprint, **no** verified marker (unexplained) | `CLASSIFICATION_IDENTITY_DRIFT` (integrity failure; `SYSTEM` hold) |
| PRODUCTION and record's standard not `APPROVED` (or retired) | `EVIDENCE_STANDARD_NOT_ESTABLISHED` |
| **[v1.2: F25]** **Real** instrument, newest record is `NON_SECURITY_DIGITAL_ASSET`, and its standard is not `APPROVED` **and PRODUCTION-applicable** (`applicable_environments ∋ PRODUCTION` ∧ `r4q3_resolution_ref` set) — in **any** environment | `REAL_INSTRUMENT_NON_PRODUCTION_BASIS` (`EVIDENCE_STANDARD_NOT_ESTABLISHED` if the standard was retired) |
| Synthetic outcome and PRODUCTION | `SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION` |
| Instrument `RETIRED` | `INSTRUMENT_RETIRED` |
| Any read/parse failure | `CLASSIFICATION_UNREADABLE` |

The F25 row collapses **loosening outcomes only**: a real `SECURITY` outcome stays in force as `SECURITY` (the hard rule still applies) whatever its standard, and always counts for lineage (§4.7). A **hold is not in this table**: it is a conjunct (§4.6) and never alters the classification outcome; nor is the lineage conjunct (§4.7A).

### 4.5 Synthetic and test instruments (`AST-SRS-001A`, `MIG-010`, AST-HD-3, F09)

- `declared_synthetic` and `synthetic_emulates` exist **only** on `instrument` and are **immutable from `INSERT`** (trigger — not "immutable after lock"). `declared_synthetic ⇔ synthetic_emulates IS NOT NULL ⇔ instrument_code ~ '^SYN[.-]'` (CHECKs). `synthetic_emulates ∈ {NON_SECURITY, SECURITY}` is valid **only** for a declared synthetic instrument.
- A declared-synthetic instrument can only receive a `SYNTHETIC_TEST_INSTRUMENT` record; a real instrument can never receive one (trigger). The record carries no emulation value, so it **cannot contradict** the instrument. There is no promotion operation.
- Valid only where canonical environment ≠ PRODUCTION. In PRODUCTION every subject derives `INELIGIBLE` `SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION`, plus a critical audit event and a **system hold**.
- `synthetic_emulates` lets the whole lifecycle — including the securities route — be built and tested with synthetic instruments (Doc 00 §12B; `DEC-013` cl. 9), and lets the hard rule be tested end to end with a security-like instrument.
- Synthetic evidence may not be cited by a real instrument's bundle; synthetic lineages never merge with real ones.
- **Non-production testing route [`AST-R2-HD-01`].** Product testing in DEVELOPMENT/TEST/UAT/DEMO uses synthetic instruments (`SYN→NON_SECURITY` for Spot/OTC/Pay/MB custody; `SYN→SECURITY` for the securities route) — never a provisional real-asset classification (§4.3).

### 4.6 Holds — a narrowing conjunct (F07 / AST-HD-6)

A **hold** is a conjunct (`INSTRUMENT_ON_HOLD`, state `NOT_ASSESSED`) applied after the hard rule and before other conjuncts. It **does not write a classification record and does not change the effective outcome**; the response still reports the real outcome plus `hold: true`. Consequently a held `SECURITY` instrument still returns `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` for MB/PSO subjects.

| Origin | Authority |
|---|---|
| **System-detected integrity failure** (**unexplained** identity drift — a governed `ASSET_CLASS_CORRECTION` awaiting reclassification is *expected* and places no hold [v1.3: F26] —, synthetic-in-PRODUCTION, evidence-standard retirement, decision-log backstop trip, sweep anomaly, non-canonical or colliding contract identity, a failed lineage propagation) | **Immediate, no human approval** (`SYS-RULE-010`: unknown/unreadable denies). `hold_origin = SYSTEM` |
| **Human-initiated hold** | **Maker-checker** (`hold_origin = HUMAN`, governed change required). No single-actor human authority is invented; `SYS-RULE-008` and the CFG-01 kill switch (`SECURITY_ADMIN`/`SUPER_ADMIN`, post-hoc review; Role Matrix §19A) are **precedent only** |
| **Release** (either origin) | Maker-checker |

A backstop trip is **not** written by the raising trigger: the transaction rolls back and the **application** places the `SYSTEM` hold in a separate controlled transaction (05 §7) [F24].

If the Role Matrix later establishes a single-actor human authority (DCR-AST1-006), it may be adopted **with post-hoc review** in a later blueprint version.

### 4.7 Elevated approval and lineage controls (F06 / AST-HD-8; v1.2: F19)

For a proposed record on instrument *X* in lineage *L*:

```
elevated_basis(X) :=
    { OWN_LINEAGE         if ∃ real (non-synthetic) record r, any instrument in L, any time, any evidence standard,
                             with r.outcome = SECURITY_OR_SECURITY_TOKEN }
  ∪ { UNDERLYING_LINEAGE  if ∃ a transitive underlying instrument U of X (instrument_underlying, depth ≤ 8)
                             whose lineage root holds such a record r }
elevated(X) := elevated_basis(X) ≠ ∅            -- depth > 8 counts as true (fail-closed)
```

If `elevated` and the proposed outcome is `NON_SECURITY_DIGITAL_ASSET` (first classification, change from `UNRESOLVED`, or reaffirmation):
1. **Two distinct IAM-02-attested checkers**, `COMPLIANCE_OFFICER` and `MLRO`, neither the maker;
2. **[v1.3: F28.b, F27] the evidence bundle must contain ≥ 1 item whose DB-assigned `evidence_global_seq` is greater than the review floor** — the newest triggering event over every basis tree: a real `SECURITY` record's `global_seq`, or the `merge_global_seq` of a merge that joined security history (§4.7A) — and **no item whose `content_sha256` appears in the newest `SECURITY` record's bundle** counts toward the requirement. The comparison is between sequence values assigned by the database under the instrument and lineage locks (INV-21); **no application-supplied timestamp is used, and `recorded_at_utc` plays no part**;
3. the approval payload includes the checker attestation "lineage reviewed" (for `UNDERLYING_LINEAGE`: that the relationship to the underlying's determination was assessed) and binds the lineage candidate list;
4. **[v1.3: F28.b] explicit binding:** at submit, AST-01 records on the case *which* event the review follows (`follows_event_kind`, `follows_event_id`, `follows_event_global_seq` — computed from the ledger, never supplied by the maker). At apply the trigger recomputes the floor under the locks; if a newer triggering event has appeared in between, the binding is stale and the record is refused (`AST1_ELEVATED_APPROVAL_REQUIRED`, `binding_stale`): the review must follow the newest event.

A wrapper is **not** automatically declared `SECURITY`: the review may conclude `NON_SECURITY`. It simply cannot reach a usable `NON_SECURITY` — and so cannot become MB/PSO-eligible — without the elevated path [F19.B].

The rule reads **any** prior determination and the underlying chain, not the immediately previous row, so it closes:

| Bypass | Closed by |
|---|---|
| `SECURITY → UNRESOLVED → NON_SECURITY` | `elevated` reads history, not the previous row |
| retire → recreate on the same contract | **Impossible**: a canonical identity is registered once, ever (§3.9 A/E) |
| native coin retired and re-registered under a new asset | Same: `(chain, network)` is unique for native instruments in every status |
| new instrument under a replacement asset | Declared predecessor + same-asset membership + lineage merge (§3.9) — a merge that joins security history immediately narrows the members (§4.7A); residual AR-19 |
| wrapper/derivative whose underlying's lineage holds a `SECURITY` determination | `UNDERLYING_LINEAGE` basis; insert-only underlying link |
| editing lineage, predecessor or asset link while `DRAFT` | Immutable from `INSERT` (§3.9 D) |

`elevated`, `elevated_basis` and their inputs are computed **by trigger from the ledger, under the instrument locks**, never supplied by the application.

### 4.7A Lineage-linked security determination — a fail-closed conjunct (F20; v1.3: F27)

Lineage asserts economic-subject continuity, but `elevated` guards only *future loosening*. If instrument *B* was `NON_SECURITY` **before** a `SECURITY` determination entered its lineage, B must not simply carry on. v1.2 recognised only one way in: a `SECURITY` record **appended** into the lineage with a higher `global_seq` than B's record. A **governed lineage merge** is the other way in — an *older* `SECURITY` determination is joined to a *newer* `NON_SECURITY` instrument without any new record — and v1.2's conjunct did not fire for it (F27). v1.3 states one rule that covers both.

**Rule (identical in TypeScript C0b and SQL B8; formal definition in 05 §7).** A real instrument X whose current record *c* is `NON_SECURITY_DIGITAL_ASSET` derives **`NOT_ASSESSED`, `LINEAGE_SECURITY_REVIEW_REQUIRED`** (conjunct C0b) for **every** subject, and the SQL backstop denies (B8), whenever, in the merge tree of X's own asset **or** of any transitive underlying instrument (or the underlying chain is deeper than 8):

- **(a)** a real `SECURITY` record on another instrument has `global_seq > c.global_seq`; **or**
- **(b)** a lineage merge has `merge_global_seq > c.global_seq` and the tree holds a real `SECURITY` record recorded **before** that merge (`r.global_seq < merge_global_seq`).

Clause (b) is a **fail-closed over-approximation**: it does not ask which side of the merge a member came from, so it also narrows members that were already reviewed when an unrelated clean tree is merged into their security-holding tree. That costs availability (AR-24) and never safety. All comparisons are between DB-assigned values from one sequence (INV-21).

- **Immediate, in the merge transaction.** The predicate is derived from the ledger at read time, so it takes effect at the commit of the triggering record **or merge**, with no row to write, forget or race. In the same transaction the merge (or record) apply **identifies every affected real instrument, revokes their outstanding tokens** (`lineage_security_determination`), emits `ast1.lineage.security_determination_propagated` and applies the same propagation to **wrappers** whose underlying is in an affected tree (05 §7A). Independently, a surviving token is rejected at consumption because the predicate is recomputed there. **No later sweep is needed for safety; the sweep only detects a control that failed** (05 §7.1).
- **Not a reclassification.** No record of X is rewritten and none is silently made `SECURITY`; legal classification stays per instrument (AST-HD-9). It is a safety conjunct based on lineage history (the AST-HD-6 model): it only denies.
- **Cleared only by a newer elevated review.** X receives a **newer** record through the **elevated governed path** (two attested checkers, "lineage reviewed", evidence with `evidence_global_seq` newer than the review floor, and the explicit `follows_event_*` binding to the newest triggering event — a merge counts): `NON_SECURITY` to reaffirm (a `RECLASSIFICATION` case whose proposed outcome equals the current one), `SECURITY`, or `UNRESOLVED`. **A pre-merge `NON_SECURITY` record can never clear a post-merge review requirement**: its `global_seq` is lower than the merge's. A reaffirmation that is **not** elevated (one checker, no new evidence, stale binding) is refused by the record trigger and therefore never becomes a record, so it cannot clear anything. Because the tree now holds a `SECURITY` determination, no non-elevated record can be appended; nothing else — no hold release, admission, flag, role or configuration — clears it.
- **Serialised.** The `SECURITY` record's apply and the merge's apply lock the lineage gate exclusively and every affected instrument (siblings, members of both merge trees and wrappers), ascending, before they write (05 §7A); a consumer or mint either commits first (and the writer then revokes the token) or sees the determination.
- **Scope.** Real instruments only; a synthetic `SECURITY` never triggers it, and real and synthetic lineages never merge. An instrument that is itself `SECURITY` is already `INELIGIBLE` for MB/PSO by the hard rule. **Extension beyond F20's wording, flagged for the re-reviewer:** instruments that **wrap** a security-determined instrument (via the underlying link) are treated like siblings, so the `UNDERLYING_LINEAGE` elevated basis (§4.7) has no post-hoc gap — **including through a merge of the underlying's tree (F27 item 3).**

### 4.8 Governed classification apply is disabled until IAM-02 attests (F05)

IAM-02 `execute-verify` today returns no approver identity (`services/iam2/src/routes/internal.ts`). AST-01 therefore **cannot** independently verify maker ≠ checker. **Until DCR-AST1-001(a)+(d) is delivered — IAM-02 returns the verified approver identity(ies) and approval-policy identity — real governed classification apply cannot be enabled** (an implementation gate for that phase, not only go-live). Development and non-production testing use an IAM-02 **stub that implements the extended contract**, clearly labelled as a stub. AST-01 stores only IAM-02-attested identities.

---

## 5. Derivation of eligibility

### 5.1 Subjects and domains (F01, F02)

| Domain | Subjects |
|---|---|
| **`MB_PSO`** (Money Broking + PSO/Pay) | `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO` |
| **`RWA`** | `RWA` |
| **`SECURITIES`** (AIX securities-market domain) | `SECONDARY_MARKET`, `SECURITIES_MARKET`, `DEPOSIT_SECURITIES`, `WITHDRAWAL_SECURITIES` |

Deposit and withdrawal are **domain-scoped subjects**, not generic. A `SECURITY` instrument is **never** deposit-/withdrawal-eligible in the `MB_PSO` domain merely because a securities-domain product permits it.

`PRODUCT_ASSET_ELIGIBILITY_STATE` vocabulary (`DEC-013`): `NOT_ASSESSED` / `INELIGIBLE` / `ELIGIBLE`; `NOT_ASSESSED` denies (`SYS-RULE-009`). AST-01 additionally returns the sentinel `NOT_APPLICABLE` for fiat only (§3.10). Distinction: `INELIGIBLE` = definitively excluded; `NOT_ASSESSED` = missing, unresolved, or dependent on an open question. Both deny.

### 5.2 Formula (every step only narrows)

```
-1 resolve by canonical identity (§3.11): 0 matches → NOT_ASSESSED INSTRUMENT_NOT_FOUND; >1 → NOT_ASSESSED INSTRUMENT_REFERENCE_AMBIGUOUS (no token)
0  instrument_form = FIAT                       → NOT_APPLICABLE (no decision; §3.10)   [form, not class; class/form inconsistency → deny ELIGIBILITY_STATE_UNREADABLE]
1  E := effective outcome (§4.4 collapses to UNRESOLVED, incl. a real NON_SECURITY without a production-applicable basis, and a record whose fingerprint no longer matches the instrument — CLASSIFICATION_REQUIRED_AFTER_CORRECTION or CLASSIFICATION_IDENTITY_DRIFT)
2  hard rule: subject ∈ MB_PSO ∧ E = SECURITY  → INELIGIBLE  SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT
3  P := MATRIX[E, kind(real|synthetic), class, subject, environment]      (§5.3, TOTAL)
4  P ≠ PERMITS                                 → return P
5  conjuncts, each only denies:
     C0 hold                → NOT_ASSESSED  INSTRUMENT_ON_HOLD
     C0b lineage security   → NOT_ASSESSED  LINEAGE_SECURITY_REVIEW_REQUIRED   (§4.7A: newer SECURITY record OR a merge that joined security history)
     C1 prohibited category → INELIGIBLE    ASSET_NOT_ALLOWED                  (privacy coin, algorithmic stablecoin, yield, derivative, ALGORITHMIC backing)
     C1m digital MYR        → NOT_ASSESSED  MYR_PAIR_CONTROL_UNRESOLVED        (§3.10; no override)
     C2 admission           → APPROVED and bound to the CURRENT record, else NOT_ASSESSED
     C3 jurisdiction rules and INVESTOR_CLASS_ONLY vs supplied client facts
     C4 transfer-restriction profile assessed (RWA, SECONDARY_MARKET, SECURITIES_MARKET, custody subjects)
     C5 attestation (SECURITIES_MARKET) bound to the CURRENT record
     C6 custody/operational (custody subjects): custody APPROVED for the capability, network ACTIVE, state ENABLED,
        and ≥ 1 product admission APPROVED in the same domain against the current record
6  ELIGIBLE iff P = PERMITS ∧ C0…C6 incl. C0b, C1m (as applicable)
```

Nothing after step 4 can change a non-`PERMITS`. The function has no input through which a stored flag overrides steps 1–4.

### 5.3 The matrix — **total** (`ELIGIBILITY_MATRIX_V2`) (F10, F03)

**Totality rule:** every combination of *outcome* × *class* × *subject* × *synthetic-emulation state* (× environment for synthetic) **has a defined result. Any combination not explicitly listed below evaluates `NOT_ASSESSED` (`MATRIX_CELL_NOT_DEFINED`), which denies.** Result vocabulary: `PERMITS` (internal to the matrix, never returned as such), `INELIGIBLE`, `NOT_ASSESSED`, `NOT_APPLICABLE` (fiat only).

Outcome axis: `UNRESOLVED`, `NON_SECURITY`, `SECURITY`, `SYNTH→NON_SECURITY`, `SYNTH→SECURITY` (synthetic uses its emulated outcome in non-production; in PRODUCTION every synthetic cell is `INELIGIBLE`). MBC = `MB_CANDIDATE`; RWAF = `RWA_FAMILY`; SL = `SECURITY_LABELLED`.

| Outcome (kind) | Class | `SPOT`,`OTC`,`PAY` | `DEPOSIT_MB_PSO`,`WITHDRAWAL_MB_PSO` | `RWA` | `SECONDARY_MARKET` | `SECURITIES_MARKET`, `DEPOSIT_SECURITIES`, `WITHDRAWAL_SECURITIES` |
|---|---|---|---|---|---|---|
| any | FIAT | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE |
| `UNRESOLVED` | any non-fiat | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED |
| `NON_SECURITY` (real) | MBC | PERMITS | PERMITS | INELIGIBLE | INELIGIBLE | INELIGIBLE |
| `NON_SECURITY` (real) | RWAF | NOT_ASSESSED ¹ | NOT_ASSESSED ¹ | PERMITS | NOT_ASSESSED ² | INELIGIBLE |
| `NON_SECURITY` (real) | SL | NOT_ASSESSED ⁴ | NOT_ASSESSED ⁴ | NOT_ASSESSED ⁴ | NOT_ASSESSED ⁴ | NOT_ASSESSED ⁴ |
| `NON_SECURITY` (real) | `OTHER_PERMITTED` | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED | INELIGIBLE |
| **`SECURITY` (real)** | any non-fiat | **INELIGIBLE** ³ | **INELIGIBLE** ³ | NOT_ASSESSED ⁵ | NOT_ASSESSED ⁵ | NOT_ASSESSED ⁵ |
| `SYNTH→NON_SECURITY` (non-prod) | as `NON_SECURITY` rows for the same class | as real | as real | as real | as real | as real |
| `SYNTH→SECURITY` (non-prod) | any non-fiat | **INELIGIBLE** ³ | **INELIGIBLE** ³ | PERMITS if RWAF or `SECURITY_TOKEN`, else INELIGIBLE | PERMITS | PERMITS ⁶ |
| any synthetic (PRODUCTION) | any non-fiat | INELIGIBLE (`SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION`) — all subjects | | | | |

¹ Non-security RWA on MB/PSO rails: `R4-Q6`/`R4-Q7` open — AST-01 does not assume an answer.
² Non-security RWA secondary trading: route membership is `R4-Q7` (open) — a route-membership question, so `NOT_ASSESSED` here (§5.9).
³ `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT`. Environment-independent, not configurable, asserted at boot (§5.5). Covers **Pay** (`AST-HD-5`, approved: default-deny, no local override; 17 §1.1) and **MB/PSO custody** (F01).
⁴ Unreachable by construction (refused at record time as a class-label conflict, §3.4) but defined, so the matrix stays total.
⁵ **Real instruments never derive a securities-route `PERMITS`** (F03): Doc 00 §12E.2 states `PRODUCT_ASSET_ELIGIBILITY_STATE` is `NOT_ASSESSED` for every real instrument and synthetic instruments only in non-production; §12B and `DEC-013` cl. 9 confine non-production security-route work to synthetic instruments. *Build and test permission is not asset eligibility*: the full securities lifecycle is built and tested with synthetic instruments; a real instrument's route membership stays `NOT_ASSESSED`. Reason `SECURITIES_ROUTE_REAL_INSTRUMENT_NOT_ASSESSED`. The cell is lifted only by a Doc 00 revision (DCR-AST1-008).
⁶ `SECURITIES_MARKET` additionally requires the attestation (C5).
⁷ **[v1.2: F25]** Every `NON_SECURITY` (real) row applies only when the effective record is usable (§4.4: production-applicable standard); otherwise the instrument is `UNRESOLVED` for enforcement and every cell is `NOT_ASSESSED`. Synthetic rows are unaffected.

### 5.4 Chain `RWA → SECONDARY_MARKET → SECURITIES_MARKET` and `WF-32` sequencing (F13)

`WF-32` steps 1–3: `EXM-01` requests admission for a classified instrument; **AST-01 verifies the classification and derives `SECONDARY_MARKET`** (evaluated with subject `SECONDARY_MARKET`, which does **not** depend on any attestation); step 4 admission review; only afterwards does `EXM-01` post the **attestation**, and only then can subject `SECURITIES_MARKET` derive `ELIGIBLE`. There is no circular dependency: `EXM-01` never needs `SECURITIES_MARKET` eligibility in order to request admission. `WF-32` step 7 (production activation gate) remains `CFG-01`'s.

### 5.5 Where the hard rule is enforced (INV-01)

1. **Matrix constant** — frozen. At module load `assertMatrixInvariants()` **exhaustively** evaluates every cell over the *complete* vocabulary (5 outcome states × 10 classes × 10 subjects × 6 environments incl. unknown) and **throws — the service refuses to start —** if: any cell is undefined-but-not-`NOT_ASSESSED`; any `SECURITY`-outcome (real or emulated) MB/PSO-domain cell is not `INELIGIBLE`; any `UNRESOLVED` cell is not `NOT_ASSESSED`; any real-instrument securities-route cell is `PERMITS`; any fiat cell is not `NOT_APPLICABLE`; any non-fiat cell is `NOT_APPLICABLE`. A second boot invariant, `assertAllowlistInvariants()` (§5.8), and a schema check that both canonical-identity unique indexes exist and cover every status (§3.11), have the same effect.
2. **Derivation** — pure; exhaustively property-tested with an independent oracle.
3. **Authoritative SQL backstop (05 §7, §7A)** — triggers on the decision log, token (**at mint and at consumption**), admission and attestation tables call a SQL function that reads the **classification ledger, instrument, hold and lineage tables themselves**. It does not trust `effective_outcome`, environment, or `synthetic_emulates` columns supplied by the application; they are audit copies. Product admission is bound to the current record by the same function. **[v1.3]** The same function compares the current record's fingerprint with the instrument's (rule B12) and evaluates the merge-aware lineage predicate (B8), so neither an `ASSET_CLASS_CORRECTION` nor a lineage merge is visible only to TypeScript.
4. **Service and token binding (§5.8)** — allow-listed subjects per caller (a frozen, boot-asserted constant); tokens bound to subject/domain/consumer/instrument/environment/record and to the client facts used.
5. **Verify-decision** — one transaction under the instrument lock — re-derives against live state; the SQL trigger independently re-checks at the consuming `UPDATE`.

*Residual (stated):* the SQL backstop guarantees that no `allow` row exists for instrument X × MB/PSO subject unless X's ledger permits it; it cannot prove the application logged the decision against the instrument it actually evaluated. That is closed by consumers binding the instrument id at verify (§5.8) and by canonical, never-ambiguous resolution (§3.11).

### 5.6 `product_admission` is a narrowing conjunct (AST-HD-2)

Records that Compliance reviewed this instrument for this subject (`AST-SRS-002` req 1; `ASSET-RULE-001` rule 7; Role Matrix §23 "Asset approval"). It can exist and be approved only while the matrix says `PERMITS` for the **current** effective record (service check **and** DB trigger against the ledger); it is bound to that record's id; **a newer record leaves it inert** (`NOT_ASSESSED: PRODUCT_ADMISSION_NOT_APPROVED`), never `ELIGIBLE`. It is read only as C2, and never exposed as an eligibility value. It can never convert `INELIGIBLE` or `NOT_ASSESSED` into `ELIGIBLE`.

### 5.7 Operational eligibility — domain-aware (F01)

```
DEPOSIT_MB_PSO / WITHDRAWAL_MB_PSO  ELIGIBLE iff
     matrix cell PERMITS (⇒ E = NON_SECURITY, class ∈ MBC; SECURITY is INELIGIBLE by the hard rule)
   ∧ no hold ∧ no prohibited attribute
   ∧ custody_support APPROVED with deposit/withdrawal supported ∧ network ACTIVE ∧ operational_state ENABLED
   ∧ ≥ 1 MB/PSO-domain product admission APPROVED against the current record
   ∧ (WITHDRAWAL) ACTIVE transfer restrictions published for enforcement
DEPOSIT_SECURITIES / WITHDRAWAL_SECURITIES
   real instrument → NOT_ASSESSED (custody basis R4-Q5 open; EXC-01/RWA-04 custody design absent; §5.3 ⁵)
   synthetic→SECURITY, non-production → same conjunct chain, in the SECURITIES domain only
```

The "at least one product" test counts only products **of the same domain**. AST-01 makes no statement that a securities-domain custody path exists; it states that the MB/PSO path can never carry a security instrument.

### 5.8 Consumer, domain and token binding (F01, F02) — DCR-AST1-002/-004

**Service allow-list (AST-01 frozen constant, boot-asserted [F23]).** Each service identity is allow-listed to specific subjects; a call outside it is refused before any state is read (`AST1_SUBJECT_NOT_PERMITTED_FOR_CALLER`).

| Caller | Permitted subjects |
|---|---|
| `OMS-01`, `TRD-01`, `EXE-01`, `LQD-01` | `SPOT`, `OTC` |
| `WLT-01` | `DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO` — **never** any securities-domain subject |
| `PAY-01` | `PAY` |
| `RWA-01`…`RWA-04` | `RWA` |
| `EXM-01`, `EXP-01` | `SECONDARY_MARKET`, `SECURITIES_MARKET` |
| `EXC-01`, `RWA-04` (holder-registry custody) | `DEPOSIT_SECURITIES`, `WITHDRAWAL_SECURITIES` |
| `CFG-01`, `SUR-01`, UI BFF | read-only summary |

No MB-domain service is ever allow-listed to a `SECURITIES` or `RWA` subject, mirroring Module Index §19 rule 5A. The allow-list is a **deep-frozen constant**, not runtime configuration, and `assertAllowlistInvariants()` throws at boot (the service refuses to start) unless every MB/PSO service identity (`OMS-01`, `TRD-01`, `EXE-01`, `LQD-01`, `WLT-01`, `PAY-01`) maps only to MB/PSO subjects, `WLT-01` maps to exactly `DEPOSIT_MB_PSO`/`WITHDRAWAL_MB_PSO`, and no securities/RWA identity maps to an MB/PSO subject (04 §1.1). The MB/PSO identity set is duplicated in SQL (05 §7, B9). A `consumer_service` other than the caller may be named for a token (e.g. `OMS-01` pre-flight for `TRD-01`) only if **both** are allow-listed for the subject.

**Token binding.** A token binds `{instrument_id, subject, domain, consumer_service, canonical environment, classification_record_id, record_seq, matrix_version, payload_hash}`, where `payload_hash` covers the **client-dependent facts the derivation used** (client jurisdiction, client class, any fact a conjunct uses), the authoritative order/operation reference and the client reference [F23]. Binding columns are immutable after mint (DB trigger). `verify-decision` — one transaction under the instrument lock (05 §7A), the consumer re-supplying the bound facts — requires: authenticated service identity **=** token `consumer_service`; the caller-stated `subject` **=** token `subject`; the caller-stated `instrument_id` **=** token instrument; environment **=** AST-01's own; and a fresh re-derivation, using the bound facts, against the **current record id** (not only sequence) still `ELIGIBLE`, with an independent SQL re-check at the consuming update. A token minted for `RWA`, `SECONDARY_MARKET` or `SECURITIES_MARKET` cannot verify for `SPOT`, `OTC`, `PAY`, MB/PSO custody, or any other caller.

**WLT-01 contract (DCR-AST1-002, not implemented here).** (1) **Identify the actual instrument** from the transfer by canonical identity — the observed token contract address on `(chain, network)`, or native `(chain, network)` — never by `(asset_or_currency, chain, network)`. 0 or >1 matches, or an instrument WLT-01 cannot identify ⇒ deny. WLT-01 has **no contract identity field today**: an **external integration gate** (§3.11). (2) Evaluate `DEPOSIT_MB_PSO`/`WITHDRAWAL_MB_PSO` only and **verify a token per operation**. (3) Enforce published restrictions. (4) Fiat legs use the reference endpoint, not `evaluate`; MYR payout rails are unaffected, and a MYR-denominated **digital** instrument evaluates `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED` and is not credited. (5) An **unsolicited inbound** instrument that AST-01 does not permit for `DEPOSIT_MB_PSO` — including any `SECURITY` outcome, an **unregistered contract, or an ambiguous or unidentifiable instrument** — is **quarantined with no ledger credit**; WLT-01 never guesses a sibling and never credits under another instrument's classification. (6) WLT-01 has no code path that calls a securities-domain subject; the MB wallet path never accepts a security instrument.

**Token is not an order-lifetime entitlement (AST-HD-10).** TTL 60 s, single use. Orders may remain pending (`DEC-012` cl. 1 rule 5); consumers **re-evaluate and re-verify at each routing or execution attempt** and never store a token as an entitlement (DCR-AST1-004).

### 5.9 Rule for open regulatory questions (F11)

Three buckets. They must not be mixed.

| Bucket | Rule | Questions |
|---|---|---|
| **A. Classification / route-membership** (what regime an instrument belongs to; whether it may be assessed at all) | **AST-01 `NOT_ASSESSED`** (or, for evidence, refuses to classify) | `R4-Q3` (evidence standard → no PRODUCTION classification), `R4-Q7` (non-security RWA secondary route) |
| **B. Operating permission** (may AIX operate the capability live) | **CFG-01 `PRODUCTION_ACTIVATION_STATE`**, not AST-01. AST-01 derives no `NOT_ASSESSED` for these merely because they are open | `R1-Q1b`, `R4-Q1`, `R4-Q2`, `R4-Q6`, `R5-Q1`, `R3-Q6`, `R6-Q1` |
| **C. Doc 00 states an eligibility position explicitly** | AST-01 follows Doc 00 verbatim | §12E.2: real instruments `NOT_ASSESSED` for the securities market; §12B/`DEC-013` cl. 9: security-route non-production work uses synthetic instruments (§5.3 ⁵) |
| *Boundary* | Fail closed pending the owning module | `R4-Q5` (custody basis) → securities-domain custody `NOT_ASSESSED`; `R4-Q4` → RWA-04; `A2-Q1/Q2` → CLT-01/KYC-01/LED-01; **OQ-6** (pair-control owner) → digital MYR `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED` |

Consequence: non-security RWA × `RWA` subject derives `PERMITS` (route known; operating permission `R4-Q6` is CFG-01's, bucket B); non-security RWA × secondary derives `NOT_ASSESSED` (bucket A). The earlier v1.0 asymmetry is thereby explained rather than implicit.

---

## 6. Custody support

Facts, not eligibility. `custody_model ∈ {THIRD_PARTY_CUSTODIAN, NOT_SUPPORTED}` — **no value exists for AIX self-custody or AIX key custody** (Doc 00 §8.2). `custodian_ref` is an opaque provider id. Approval opens a deposit path and is maker-checkered. Absent ⇒ not supported. No adequacy claim (`R4-Q5`).

## 7. Transfer restrictions

`transfer_restriction_profile` (`UNASSESSED` default | `NONE_CONFIRMED` | `DEFINED`) plus rows of type `HOLDER_WHITELIST_REQUIRED`, `LOCKUP_UNTIL`, `INVESTOR_CLASS_ONLY`, `MAX_HOLDER_COUNT`, `MIN_HOLDING`, `ISSUER_CONSENT_REQUIRED`, `FORCED_TRANSFER_POSSIBLE`, `SANCTIONS_FREEZE_CAPABLE`. `effect = DENY` only — a restriction can never grant. `INVESTOR_CLASS_ONLY` is evaluated against `client_facts.client_class` supplied by `CLT-01`/`KYC-01` (missing ⇒ deny `CLIENT_CLASS_REQUIRED`). AST-01 is system of record and publisher; enforcement lives at `WLT-01`, `RWA-04`, `EXP-01` and on-chain (`onchain_enforced` + `contract_ref`, reconciled by `RWA-02`). Human-initiated additions and lifts are maker-checkered (INV-09).

## 8. Jurisdictions

Origin and issuer jurisdiction are descriptive evidence inputs. `jurisdiction_rule` per (instrument, subject-product): `BLOCK` always denies; `ALLOW_ONLY` denies unless listed; missing client jurisdiction with `ALLOW_ONLY` ⇒ `CLIENT_JURISDICTION_REQUIRED`. Admission approval must attest `jurisdiction_assessed = true` ("nobody looked" ≠ "unrestricted"). Global sanctions blocking is AML-01/CFG-01. AST-01 does not verify the client's jurisdiction.

### 8.6 Securities-market admission attestation (F13, F15)

`EXM-01` is the authority for securities-market listing status. AST-01 stores an attestation (opaque `EXM-01` admission id, status) received over a service identity at route `/internal/ast1/securities-market-admissions`. It is accepted **only** if the instrument's effective outcome is `SECURITY` (or synthetic→`SECURITY` in non-production) **and** it is **bound to the current classification record id** (trigger). **Reclassification (any new record) makes the old attestation inert** — C5 then derives `NOT_ASSESSED` `SECURITIES_MARKET_ATTESTATION_STALE` until `EXM-01` re-attests. It is conjunct C5, withdrawable by `EXM-01` (a service-origin tightening, audited), and never creates eligibility. `EXM-01` does not yet exist: this is a specified contract (DCR-AST1-004).

## 9. Where AST-01 sits in the access formula

```
permission (IAM-02) ∧ environment availability (CFG-01) ∧ product activation (CFG-01)
  ∧ asset eligibility (AST-01) ∧ production regulatory gate (CFG-01, PRODUCTION only)
```

An `ELIGIBLE` from AST-01 says nothing about the other conjuncts. Responses carry `not_evaluated`.

## 10. `AST-SRS-001` field mapping (F12)

**READ-THROUGH / EXTERNAL CONJUNCT** = another module owns it; AST-01 does **not** duplicate storage.

| SRS group / field | v1.1 treatment |
|---|---|
| Identity: instrument code, name, asset class, **asset type**, decimal precision | Stored (`instrument_code`, `asset_name`, `asset_class`, `instrument_form` + `token_standard` = asset type, `amount_scale`) |
| Legal/regulatory: classification, classifier of record, evidence reference, classification status | Stored (`classification_record`, `classification_evidence.classifier_of_record`, evidence bundle, case state) |
| Origin: issuer, underlying, jurisdiction | Stored |
| Technical: network, contract address, custody capability | Stored |
| Product eligibility ×5 (+ SECURITIES_MARKET, custody) | **Derived output only** |
| Operational: deposit status, withdrawal status | Stored inputs (`operational_state`) → derived subject answers |
| **Listing status** | MB/PSO/RWA/secondary subjects: `product_admission.status` (stored conjunct). **Securities-market listing status: EXTERNAL CONJUNCT — `EXM-01` owns it; AST-01 holds only the attestation** |
| Transfer restrictions | Stored |
| Access: **client eligibility** | Instrument-level restriction only: `INVESTOR_CLASS_ONLY` vs supplied `client_class`. Client status itself is **EXTERNAL** (`CLT-01`/`KYC-01`) |
| Access: jurisdiction eligibility | Stored `jurisdiction_rule` |
| **Production activation status** | **READ-THROUGH — `CFG-01` owns it** (Doc 00 §1.D state 3). Never stored or duplicated in AST-01; listed under `not_evaluated`; a UI composes it from CFG-01. Doc 00 v1.5 ownership prevails over the SRS field list (DCR-AST1-008(e)) |
| Controls: **risk classification** | Stored as an **informational** `risk_tier` (`UNASSESSED` default; governed) in `instrument_risk_profile`. It is **not** an input to derivation in v1.1 and cannot affect classification or eligibility |
| Controls: admissibility status | Derived from the `attr_*` declarations (C1) |
| Controls: compliance approval status | `product_admission.status` + the maker-checkered classification record |
