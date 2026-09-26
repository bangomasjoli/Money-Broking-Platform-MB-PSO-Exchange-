# AST-01 — 01 Module Blueprint (v1.1)

**Status: REMEDIATED / AWAITING RE-REVIEW.** Nothing here is accepted or approved for implementation. v1.0 (`78ec1e4`) is reviewed historical evidence; the review is [`04-review.md`](../../../../03_implementation/tasks/AST-01/04-review.md) (`REMEDIATE`); the finding-by-finding record is [`05-remediation.md`](../../../../03_implementation/tasks/AST-01/05-remediation.md).

Sources: `DEC-012` clause 6; `DEC-013` clauses 2–5, 7–11; `DEC-014`; Doc 00 v1.5 §1.D, §12A, §12B, §12E.2, §21A, §25.3 (`MIG-010`); Module Index v1.4 §5.4, §6, §9, §19 (rules 2, 3, 5A, 5B, 13, 14); SRS v1.3 `AST-SRS-001`, `001A`; System Rules v1.3 `SYS-RULE-009`, `SYS-RULE-010`, `ASSET-RULE-001`, `ASSET-RULE-002`, `LED-RULE-005`; Workflow Map v1.3 `WF-32`, `WF-35`; Role Matrix v1.3 §3.4, §3.7, §5.2, **§19 rule 9**, **§23**, **§28**.

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
| **Pair configuration, pair activation, MYR-pair control** | Not assigned in Module Index v1.4 (OQ-6) | AST-01 supplies fiat/digital identity and the MYR attribute; it does not decide a pair |
| Fees | `FEE-01` | — |

### 1.3 Build state (`DEC-013` clause 2)

`CAPABILITY_BUILD_STATE` = `SPECIFIED` **only after** re-review and acceptance of this pack (it is not accepted today). `ENVIRONMENT_AVAILABILITY` and `PRODUCTION_ACTIVATION_STATE` are CFG-01's and are never stored here; `PRODUCT_ASSET_ELIGIBILITY_STATE` is owned here for the instrument × subject dimension and is derived. AST-01 `ACCEPTED`, if it ever occurs, never means an instrument is production-activated (Module Index §5.4).

---

## 2. Non-negotiable invariants

| ID | Invariant | Defended by |
|---|---|---|
| **INV-01** | An instrument whose effective outcome is `SECURITY_OR_SECURITY_TOKEN` (real, or synthetic-emulating) is **never** `ELIGIBLE` for **any MB/PSO-domain subject** — `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO` — in every environment | Four layers: total frozen matrix + exhaustive boot invariant; pure derivation; **authoritative SQL backstop that reads the classification ledger, not application-supplied columns** (05 §7); service allow-list + token binding (§5.8) |
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
| **INV-15** | **Domain and consumer binding.** Every subject belongs to one domain (`MB_PSO`, `RWA`, `SECURITIES`). Each calling service is allow-listed to specific subjects; a decision token binds subject, domain, consumer service, instrument, environment and classification record; a token for one subject/domain never verifies for another (Module Index §19 rule 5A) | 04 §1.1, §6; T-TOK-*, T-DOM-* |
| **INV-16** | Fiat is reference data only. It has no §12A outcome, no classification case and no product admission, and is **never** returned as a digital-asset `INELIGIBLE` | Trigger; API `not_applicable` contract (§3.10) |
| **INV-17** | **Lineage.** Any prior real `SECURITY` determination anywhere in an instrument's lineage triggers the elevated approval path for any later loosening; it cannot be avoided by an interim `UNRESOLVED`, retire-and-recreate, or a replacement instrument/asset under continuity | Lineage tables, trigger-computed; §4.7 |

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
| Mapping to existing code | `asset_code` ↔ WLT-01 `asset_or_currency` | `(asset_code, chain, network)` ↔ WLT-01 `(asset_or_currency, chain, network)` |
| **Lineage** | Each asset belongs to one lineage | Instruments inherit their asset's lineage. Classification is per instrument, **history follows the lineage** (§3.9, §4.7) |

### 3.2 Codes

`asset_code` `^[A-Z0-9]{2,16}$`. `instrument_code` `^[A-Z0-9][A-Z0-9._:-]{1,47}$`, unique, **immutable from insert**. **Synthetic codes match `^SYN[.-]`; real codes do not** (CHECK both ways), so synthetic instruments are structurally distinguishable everywhere (`AST-SRS-001A` req 5).

### 3.3 Identity fingerprint

`identity_fingerprint = sha256(canonicalJson({asset_code, asset_class, instrument_form, chain, network, contract_address_canonical, token_standard, issuer_ref_id, lineage_id, underlying[], amount_scale, declared characteristics, declared_synthetic, synthetic_emulates}))` (foundation canonical-JSON fingerprint, as CFG-01 change payloads). Every classification record stores the fingerprint it classified; mismatch ⇒ effective `UNRESOLVED` (`CLASSIFICATION_IDENTITY_DRIFT`). Identity columns are mutable only in `DRAFT`, **except** `instrument_code`, `declared_synthetic` and `synthetic_emulates`, which are immutable from `INSERT` (§4.5). After the first case is submitted the instrument is `IDENTITY_LOCKED`; an identity error is corrected by retire-and-recreate **inside the same lineage** (§3.9, §4.7) — never by editing.

### 3.4 Asset classes (`AST-SRS-001`)

`FIAT_CURRENCY`, `DIGITAL_CURRENCY`, `STABLECOIN`, `SECURITY`, `SECURITY_TOKEN`, `RWA_TOKEN`, `TOKENISED_DEBT`, `TOKENISED_FUND`, `TOKENISED_COMMODITY`, `OTHER_PERMITTED`.

The class is **descriptive and narrowing only**; it never supplies eligibility. Families used by the matrix:

| Family | Members | Use |
|---|---|---|
| `MB_CANDIDATE` | `DIGITAL_CURRENCY`, `STABLECOIN` | The only classes for which MB/PSO subjects can ever be class-permitted (`DEC-012` cl. 5: "eligible non-security digital currencies") |
| `RWA_FAMILY` | `RWA_TOKEN`, `TOKENISED_DEBT`, `TOKENISED_FUND`, `TOKENISED_COMMODITY` | Object of the RWA lifecycle |
| `SECURITY_LABELLED` | `SECURITY`, `SECURITY_TOKEN` | The class label itself asserts a security. A `NON_SECURITY` outcome for these is refused as a **definitional inconsistency** (`CLASS_CLASSIFICATION_CONFLICT`). *This is not the presumption rejected by AST-HD-4 (below); it is not extended to any other class. Working default, flagged for confirmation (17 §1.2, P-3).* |
| `REFERENCE` | `FIAT_CURRENCY` | Outside the §12A API (§3.10) |
| — | `OTHER_PERMITTED` | `NOT_ASSESSED` until a class rule is approved |

**AST-HD-4 (approved).** `TOKENISED_DEBT` and `TOKENISED_FUND` are **not** treated as securities because of their class label. They start `UNRESOLVED` like every instrument and take whatever outcome the governed classification and evidence establish. This blueprint answers neither `R4-Q3` nor `R4-Q6`. Where the outcome is a defined `SECURITY / SECURITY TOKEN`, the MB prohibition is absolute (INV-01).

### 3.5 Issuer reference

Descriptive reference only (`source` `RWA01` — opaque RWA-01 id — or `EXTERNAL`); legal name, LEI, jurisdiction, informational `verification_status`. No KYB.

### 3.6 Underlying reference

Zero or more `instrument_underlying` rows (`underlying_type`, optional `underlying_instrument_id`, `backing_model`). `ALGORITHMIC` backing requires `attr_algorithmic_stablecoin = true`. A `STABLECOIN` needs ≥ 1 row with known backing before a case can be submitted. Evidence input for the classifier; changes no derived answer by itself.

### 3.7 Network and contract details

`network_registry` read-only at runtime; a chain/network absent from it cannot carry an instrument. Contract addresses are canonicalised before the uniqueness check. This does **not** replace WLT-01's `chain_coverage`; consumers AND both (DCR-AST1-002).

### 3.8 Precision (`LED-RULE-005` rules 1, 10)

`amount_scale` NOT NULL, no default, `≤ on_chain_decimals`, in the fingerprint, immutable after lock. AST-01 states the scale; rounding, residual accounts and pair precision are LED-01/pair-configuration concerns.

### 3.9 Lineage (F06 / AST-HD-9)

**Purpose:** a previous `SECURITY` determination must not be escapable by re-registering the same thing.

- **Entity.** `lineage` groups instruments by **economic-subject continuity**. Each `asset` belongs to exactly one lineage, assigned at creation. A **real** and a **synthetic** lineage can never merge (CHECK).
- **Automatic continuity.** A new instrument whose canonical on-chain identity `(chain, network, contract_address_canonical)` equals **any prior instrument, including `RETIRED`**, is forced into that instrument's lineage by trigger (the proposer cannot choose otherwise). A new instrument under an existing asset inherits the asset's lineage.
- **Declared continuity.** Creating an asset (or instrument) requires a `predecessor_declaration`: `NONE_DECLARED` (with a proposer attestation) or `SAME_ECONOMIC_SUBJECT(instrument_id | asset_id)`. A declared predecessor places the new asset in that lineage.
- **Candidate surfacing.** At submission AST-01 lists **lineage candidates** to the checker — same issuer reference, same underlying instrument, same contract code hash, similar name — and the checker's approval payload includes the attestation "lineage reviewed". A candidate the checker judges continuous is linked by a governed **lineage merge** (irreversible; append-only; maker-checkered).
- **Residual risk (stated).** Continuity that is neither on-chain-identical, declared, nor surfaced by candidates (a genuinely disguised replacement) depends on the human checker. Recorded as AR-19 (file 12).

### 3.10 Fiat currencies — reference data only (F08 / AST-HD-1)

`instrument_form = FIAT`, `asset_class = FIAT_CURRENCY`. AST-01 stores currency identity (ISO 4217 code), `amount_scale` (`LED-RULE-005` rule 2), the `attr_myr_denominated` attribute, and ledger/payment reference identifiers. Fiat **never** has a classification case, outcome, product admission, hold-derived outcome or eligibility answer (trigger-enforced).

**Contract (04 §2.2, §6.4).**
- Consumers resolve a fiat leg through the **reference-data** endpoint (`GET …/currencies/{code}`), which returns identity, precision, `myr_denominated`, `status`, and `classification_regime: "NOT_APPLICABLE_FIAT"`. A missing, retired or precision-invalid fiat is a reference-data failure, not a digital-asset ineligibility.
- If a consumer nevertheless calls `evaluate` with a fiat instrument, the response is **`200` with `decision: "not_applicable"`, `eligibility_state: "NOT_APPLICABLE"`, `reason_code: "SUBJECT_NOT_APPLICABLE_FIAT"`, no token**. It is not `deny`, and it is explicitly **not** a statement that the fiat leg may not be used.
- **Fiat legs and Pay are not made impossible:** the digital leg of a Spot/OTC pair is evaluated with `evaluate`; the fiat leg is a reference lookup plus the pair/product control. **MYR restrictions remain enforced by the pair/product control** (owner unassigned — OQ-6); AST-01 supplies the attribute, not the activation decision. Until OQ-6 assigns that control, a **digital** instrument with `attr_myr_denominated = true` stays fail-closed (`ASSET_NOT_ALLOWED`) as a conservative carry-forward; it is relaxed only when a pair-level owner exists.

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

Immutable evidence items: type, title, `content_sha256`, opaque `object_ref` (no bytes in the DB), classifier of record, `synthetic` flag, author, timestamp; bundle hash bound into the approval payload. **AST-01 hard-codes no evidence standard, evidence types or securities-features checklist** (`R4-Q3` is unresolved). The standard is governed data (`evidence_standard`): classification approval needs an `APPROVED` standard whose `applicable_environments` includes the current canonical environment; a PRODUCTION-applicable standard needs a non-null `r4q3_resolution_ref` (a pointer to the governance decision — AST-01 answers nothing). Today no such standard exists ⇒ **PRODUCTION classification is impossible** (`EVIDENCE_STANDARD_NOT_ESTABLISHED`) and real instruments stay `UNRESOLVED`. Non-production may use an explicitly non-production standard so development is not blocked (`DEC-013` cl. 4). **A non-production classification of a real instrument is provisional test data: it is not a determination and is never evidence in PRODUCTION** (INV-08); every surface labels it so.

### 4.4 Validity checks (each collapses the effective outcome to `UNRESOLVED` with the reason)

| Check | Reason |
|---|---|
| Newest record's `recorded_environment` ≠ AST-01's canonical environment | `CLASSIFICATION_ENVIRONMENT_MISMATCH` |
| Record fingerprint ≠ recomputed fingerprint | `CLASSIFICATION_IDENTITY_DRIFT` |
| PRODUCTION and record's standard not `APPROVED` (or retired) | `EVIDENCE_STANDARD_NOT_ESTABLISHED` |
| Synthetic outcome and PRODUCTION | `SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION` |
| Instrument `RETIRED` | `INSTRUMENT_RETIRED` |
| Any read/parse failure | `CLASSIFICATION_UNREADABLE` |

A **hold is not in this table**: it is a conjunct (§4.6) and never alters the classification outcome.

### 4.5 Synthetic and test instruments (`AST-SRS-001A`, `MIG-010`, AST-HD-3, F09)

- `declared_synthetic` and `synthetic_emulates` exist **only** on `instrument` and are **immutable from `INSERT`** (trigger — not "immutable after lock"). `declared_synthetic ⇔ synthetic_emulates IS NOT NULL ⇔ instrument_code ~ '^SYN[.-]'` (CHECKs). `synthetic_emulates ∈ {NON_SECURITY, SECURITY}` is valid **only** for a declared synthetic instrument.
- A declared-synthetic instrument can only receive a `SYNTHETIC_TEST_INSTRUMENT` record; a real instrument can never receive one (trigger). The record carries no emulation value, so it **cannot contradict** the instrument. There is no promotion operation.
- Valid only where canonical environment ≠ PRODUCTION. In PRODUCTION every subject derives `INELIGIBLE` `SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION`, plus a critical audit event and a **system hold**.
- `synthetic_emulates` lets the whole lifecycle — including the securities route — be built and tested with synthetic instruments (Doc 00 §12B; `DEC-013` cl. 9), and lets the hard rule be tested end to end with a security-like instrument.
- Synthetic evidence may not be cited by a real instrument's bundle; synthetic lineages never merge with real ones.

### 4.6 Holds — a narrowing conjunct (F07 / AST-HD-6)

A **hold** is a conjunct (`INSTRUMENT_ON_HOLD`, state `NOT_ASSESSED`) applied after the hard rule and before other conjuncts. It **does not write a classification record and does not change the effective outcome**; the response still reports the real outcome plus `hold: true`. Consequently a held `SECURITY` instrument still returns `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` for MB/PSO subjects.

| Origin | Authority |
|---|---|
| **System-detected integrity failure** (identity drift, synthetic-in-PRODUCTION, evidence-standard retirement, decision-log backstop trip, sweep anomaly) | **Immediate, no human approval** (`SYS-RULE-010`: unknown/unreadable denies). `hold_origin = SYSTEM` |
| **Human-initiated hold** | **Maker-checker** (`hold_origin = HUMAN`, governed change required). No single-actor human authority is invented; `SYS-RULE-008` and the CFG-01 kill switch (`SECURITY_ADMIN`/`SUPER_ADMIN`, post-hoc review; Role Matrix §19A) are **precedent only** |
| **Release** (either origin) | Maker-checker |

If the Role Matrix later establishes a single-actor human authority (DCR-AST1-006), it may be adopted **with post-hoc review** in a later blueprint version.

### 4.7 Elevated approval and lineage controls (F06 / AST-HD-8)

For a proposed record in lineage *L*:

```
elevated  :=  ∃ real (non-synthetic) classification record r in L (any instrument in L, any time)
                with r.outcome = SECURITY_OR_SECURITY_TOKEN
```

If `elevated` and the proposed outcome is `NON_SECURITY_DIGITAL_ASSET`:
1. **Two distinct IAM-02-attested checkers**, `COMPLIANCE_OFFICER` and `MLRO`, neither the maker;
2. the evidence bundle must contain **≥ 1 item recorded after `recorded_at` of the last `SECURITY` record in L**, and **no item whose `content_sha256` appears in that record's bundle** counts toward the requirement;
3. the approval payload includes the checker attestation "lineage reviewed".

The rule reads **any** prior determination, not the immediately previous row, so it closes:

| Bypass | Closed by |
|---|---|
| `SECURITY → UNRESOLVED → NON_SECURITY` | `elevated` reads history, not the previous row |
| retire → recreate on the same contract | Automatic lineage continuity (§3.9) |
| new instrument under a replacement asset | Declared predecessor + candidate surfacing + lineage merge (§3.9); residual AR-19 |

`elevated` and its inputs are computed **by trigger from the ledger**, never supplied by the application.

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
0  FIAT class                                  → NOT_APPLICABLE (no decision; §3.10)
1  E := effective outcome (§4.4 collapses to UNRESOLVED)
2  hard rule: subject ∈ MB_PSO ∧ E = SECURITY  → INELIGIBLE  SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT
3  P := MATRIX[E, kind(real|synthetic), class, subject, environment]      (§5.3, TOTAL)
4  P ≠ PERMITS                                 → return P
5  conjuncts, each only denies:
     C0 hold                → NOT_ASSESSED  INSTRUMENT_ON_HOLD
     C1 prohibited category → INELIGIBLE    ASSET_NOT_ALLOWED
     C2 admission           → APPROVED and bound to the CURRENT record, else NOT_ASSESSED
     C3 jurisdiction rules and INVESTOR_CLASS_ONLY vs supplied client facts
     C4 transfer-restriction profile assessed (RWA, SECONDARY_MARKET, SECURITIES_MARKET, custody subjects)
     C5 attestation (SECURITIES_MARKET) bound to the CURRENT record
     C6 custody/operational (custody subjects): custody APPROVED for the capability, network ACTIVE, state ENABLED,
        and ≥ 1 product admission APPROVED in the same domain against the current record
6  ELIGIBLE iff P = PERMITS ∧ C0…C6 (as applicable)
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
³ `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT`. Environment-independent, not configurable, asserted at boot (§5.5). Covers **Pay** (HD-5 default-deny, see 17 §2) and **MB/PSO custody** (F01).
⁴ Unreachable by construction (refused at record time as a class-label conflict, §3.4) but defined, so the matrix stays total.
⁵ **Real instruments never derive a securities-route `PERMITS`** (F03): Doc 00 §12E.2 states `PRODUCT_ASSET_ELIGIBILITY_STATE` is `NOT_ASSESSED` for every real instrument and synthetic instruments only in non-production; §12B and `DEC-013` cl. 9 confine non-production security-route work to synthetic instruments. *Build and test permission is not asset eligibility*: the full securities lifecycle is built and tested with synthetic instruments; a real instrument's route membership stays `NOT_ASSESSED`. Reason `SECURITIES_ROUTE_REAL_INSTRUMENT_NOT_ASSESSED`. The cell is lifted only by a Doc 00 revision (DCR-AST1-008).
⁶ `SECURITIES_MARKET` additionally requires the attestation (C5).

### 5.4 Chain `RWA → SECONDARY_MARKET → SECURITIES_MARKET` and `WF-32` sequencing (F13)

`WF-32` steps 1–3: `EXM-01` requests admission for a classified instrument; **AST-01 verifies the classification and derives `SECONDARY_MARKET`** (evaluated with subject `SECONDARY_MARKET`, which does **not** depend on any attestation); step 4 admission review; only afterwards does `EXM-01` post the **attestation**, and only then can subject `SECURITIES_MARKET` derive `ELIGIBLE`. There is no circular dependency: `EXM-01` never needs `SECURITIES_MARKET` eligibility in order to request admission. `WF-32` step 7 (production activation gate) remains `CFG-01`'s.

### 5.5 Where the hard rule is enforced (INV-01)

1. **Matrix constant** — frozen. At module load `assertMatrixInvariants()` **exhaustively** evaluates every cell over the *complete* vocabulary (5 outcome states × 10 classes × 10 subjects × 6 environments incl. unknown) and **throws — the service refuses to start —** if: any cell is undefined-but-not-`NOT_ASSESSED`; any `SECURITY`-outcome (real or emulated) MB/PSO-domain cell is not `INELIGIBLE`; any `UNRESOLVED` cell is not `NOT_ASSESSED`; any real-instrument securities-route cell is `PERMITS`; any fiat cell is not `NOT_APPLICABLE`; any non-fiat cell is `NOT_APPLICABLE`.
2. **Derivation** — pure; exhaustively property-tested with an independent oracle.
3. **Authoritative SQL backstop (05 §7)** — triggers on the decision log, token, admission and attestation tables call a SQL function that reads the **classification ledger, instrument, hold and lineage tables themselves**. It does not trust `effective_outcome`, environment, or `synthetic_emulates` columns supplied by the application; they are audit copies. Product admission is bound to the current record by the same function.
4. **Service and token binding (§5.8)** — allow-listed subjects per caller; tokens bound to subject/domain/consumer/instrument/environment/record.
5. **Verify-decision** re-derives against live state.

*Residual (stated):* the SQL backstop guarantees that no `allow` row exists for instrument X × MB/PSO subject unless X's ledger permits it; it cannot prove the application logged the decision against the instrument it actually evaluated. That is closed by consumers binding the instrument id at verify (§5.8).

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

**Service allow-list (AST-01 config).** Each service identity is allow-listed to specific subjects; a call outside it is refused before any state is read (`AST1_SUBJECT_NOT_PERMITTED_FOR_CALLER`).

| Caller | Permitted subjects |
|---|---|
| `OMS-01`, `TRD-01`, `EXE-01`, `LQD-01` | `SPOT`, `OTC` |
| `WLT-01` | `DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO` — **never** any securities-domain subject |
| `PAY-01` | `PAY` |
| `RWA-01`…`RWA-04` | `RWA` |
| `EXM-01`, `EXP-01` | `SECONDARY_MARKET`, `SECURITIES_MARKET` |
| `EXC-01`, `RWA-04` (holder-registry custody) | `DEPOSIT_SECURITIES`, `WITHDRAWAL_SECURITIES` |
| `CFG-01`, `SUR-01`, UI BFF | read-only summary |

No MB-domain service is ever allow-listed to a `SECURITIES` or `RWA` subject, mirroring Module Index §19 rule 5A. A `consumer_service` other than the caller may be named for a token (e.g. `OMS-01` pre-flight for `TRD-01`) only if **both** are allow-listed for the subject.

**Token binding.** A token binds `{instrument_id, subject, domain, consumer_service, canonical environment, classification_record_id, record_seq, matrix_version, payload_hash}`. `verify-decision` requires: authenticated service identity **=** token `consumer_service`; the caller-stated `subject` **=** token `subject`; the caller-stated `instrument_id` **=** token instrument; environment **=** AST-01's own; and a fresh re-derivation against the **current record id** (not only sequence) still `ELIGIBLE`. A token minted for `RWA`, `SECONDARY_MARKET` or `SECURITIES_MARKET` cannot verify for `SPOT`, `OTC`, `PAY`, MB/PSO custody, or any other caller.

**WLT-01 contract (DCR-AST1-002, not implemented here).** (1) Resolve `(asset_or_currency, chain, network)` to an AST-01 instrument; unresolved ⇒ deny. (2) Evaluate `DEPOSIT_MB_PSO`/`WITHDRAWAL_MB_PSO` and **verify a token per operation**. (3) Enforce published restrictions. (4) Fiat legs use the reference endpoint, not `evaluate`. (5) An **unsolicited inbound** instrument that AST-01 does not permit for `DEPOSIT_MB_PSO` (including any `SECURITY` outcome) is **quarantined with no ledger credit**. (6) WLT-01 has no code path that calls a securities-domain subject; the MB wallet path never accepts a security instrument.

**Token is not an order-lifetime entitlement (AST-HD-10).** TTL 60 s, single use. Orders may remain pending (`DEC-012` cl. 1 rule 5); consumers **re-evaluate and re-verify at each routing or execution attempt** and never store a token as an entitlement (DCR-AST1-004).

### 5.9 Rule for open regulatory questions (F11)

Three buckets. They must not be mixed.

| Bucket | Rule | Questions |
|---|---|---|
| **A. Classification / route-membership** (what regime an instrument belongs to; whether it may be assessed at all) | **AST-01 `NOT_ASSESSED`** (or, for evidence, refuses to classify) | `R4-Q3` (evidence standard → no PRODUCTION classification), `R4-Q7` (non-security RWA secondary route) |
| **B. Operating permission** (may AIX operate the capability live) | **CFG-01 `PRODUCTION_ACTIVATION_STATE`**, not AST-01. AST-01 derives no `NOT_ASSESSED` for these merely because they are open | `R1-Q1b`, `R4-Q1`, `R4-Q2`, `R4-Q6`, `R5-Q1`, `R3-Q6`, `R6-Q1` |
| **C. Doc 00 states an eligibility position explicitly** | AST-01 follows Doc 00 verbatim | §12E.2: real instruments `NOT_ASSESSED` for the securities market; §12B/`DEC-013` cl. 9: security-route non-production work uses synthetic instruments (§5.3 ⁵) |
| *Boundary* | Fail closed pending the owning module | `R4-Q5` (custody basis) → securities-domain custody `NOT_ASSESSED`; `R4-Q4` → RWA-04; `A2-Q1/Q2` → CLT-01/KYC-01/LED-01 |

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
