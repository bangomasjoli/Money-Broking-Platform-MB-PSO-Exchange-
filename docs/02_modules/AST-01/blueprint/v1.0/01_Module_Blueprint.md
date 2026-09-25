# AST-01 — 01 Module Blueprint

**Status: PLANNED / AWAITING REVIEW.** Sources: `DEC-012` clause 6; `DEC-013` clauses 2, 3, 5, 9, 11; `DEC-014`; Doc 00 v1.5 §1.D, §12A, §21A, §25.3 (`MIG-010`); Module Index v1.4 §9 and §5.4/§17 rules; SRS v1.3 `AST-SRS-001`, `001A`; System Rules v1.3 `ASSET-RULE-001`, `ASSET-RULE-002`, `SYS-RULE-009`, `SYS-RULE-010`, `LED-RULE-005`; Workflow Map v1.3 `WF-35`; Role Matrix v1.3 §3.4, §5.2A rule 9.

---

## 1. Purpose and ownership

AST-01 is the **single platform-wide** registry of assets and instruments and the **only** place a regulatory classification is recorded and product eligibility derived from it. It is not RWA-only (Doc 00 §12A). One registry, because "splitting them into two modules would allow eligibility to drift from classification" (Module Index §9).

### 1.1 AST-01 owns

| # | Concern | Notes |
|---|---|---|
| 1 | Asset identity | The economic/technical asset concept and its canonical code |
| 2 | Instrument identity | The unit a product would admit: one asset on one network/contract (or fiat/off-chain record) |
| 3 | Regulatory classification, lifecycle, evidence | The securities-features gate; maker-checkered; append-only |
| 4 | Asset classes | Doc/SRS taxonomy; used only as a **narrowing** input to derivation |
| 5 | Jurisdictions | Origin jurisdiction and instrument-level product jurisdiction rules |
| 6 | Issuer reference | A *reference*, not KYB. RWA-01 owns issuer onboarding |
| 7 | Underlying reference | What the instrument is backed by / represents |
| 8 | Network / contract details | Chain, network, contract address, token standard |
| 9 | Precision | `amount_scale` per instrument (`LED-RULE-005` rule 1, 10) |
| 10 | Custody support | Third-party custody facts only |
| 11 | Transfer restrictions | Recorded and published; enforced elsewhere |
| 12 | Derived product eligibility | Spot, OTC, Pay, RWA, secondary market, Exchange |
| 13 | Operational eligibility | Deposit, withdrawal, listing status |

### 1.2 AST-01 does not own (must not build)

| Not AST-01 | Owner | Boundary |
|---|---|---|
| Trading, order handling, routing | `OMS-01`, `TRD-01`, `EXE-01`, `LQD-01` | Consume AST-01 eligibility before routing (Module Index rule 2) |
| Exchange listing, order book, matching | `EXM-01`, `EXO-01` | AST-01 records only an **admission attestation** from `EXM-01` (§8.6). Matching engine is never reachable from AST-01 (`DEC-013` cl. 5, 7) |
| Ledger, balances, precision *application* | `LED-01` | AST-01 states `amount_scale`; `LED-01` applies it |
| RWA issuance, issuer onboarding, KYB/UBO | `RWA-01`…`RWA-04` | AST-01 holds an issuer **reference** |
| Wallet addresses, screening, address format | `WLT-01` | AST-01 states which instrument-networks exist; `WLT-01` remains authority for address validity and screening coverage |
| Client KYC/class/jurisdiction of a **client** | `KYC-01`, `CLT-01` | Callers pass the client fact in; AST-01 applies instrument-level rules to it |
| Feature flags, environment availability, production activation, permissions | `CFG-01`, `IAM-02` | AST-01 answers one conjunct only |
| Pair configuration and pair activation | Not assigned in Module Index v1.4 (SRS `AST-SRS-003` names legacy `AST-02`/`AST-03`) | See 17 OQ-6. AST-01 supplies per-leg eligibility; it does not define pairs |
| Fees | `FEE-01` | — |

### 1.3 Build state (`DEC-013` clause 2)

| State | AST-01 |
|---|---|
| `CAPABILITY_BUILD_STATE` | `SPECIFIED` upon acceptance of this pack. Implementation is a later, separately approved task |
| `ENVIRONMENT_AVAILABILITY` | Not represented here — `CFG-01` owns it |
| `PRODUCTION_ACTIVATION_STATE` | Not represented here — `CFG-01` owns it. AST-01 never states an instrument is "activated" |
| `PRODUCT_ASSET_ELIGIBILITY_STATE` | **Owned here**, for the instrument × product dimension, derived. Client, jurisdiction-of-client and counterparty dimensions are supplied by callers or owned by other modules |

`AST-01` `ACCEPTED` will never mean an instrument is production-activated (Module Index §5.4 rule 2).

---

## 2. Non-negotiable invariants

Each is testable (file 10) and each names the layer that defends it.

| ID | Invariant | Defended by |
|---|---|---|
| **INV-01** | `SECURITY_OR_SECURITY_TOKEN` (real or synthetic-emulating) × `SPOT`/`OTC` ⇒ **never `ELIGIBLE`**, in every environment | Matrix constant + boot self-test; evaluate path; DB CHECK on decision log and token tables (05 §3.9) |
| **INV-02** | No effective approved classification ⇒ every product `NOT_ASSESSED` ⇒ deny. `UNRESOLVED` is the absence of a record, not a flag | Derivation; schema has no `UNRESOLVED`-defaulting column to forget |
| **INV-03** | No eligibility-shaped column exists outside the append-only decision log. Eligibility is computed, never stored or set | Schema-lint test T-SCH-01; grants |
| **INV-04** | Every other control (admission, operational state, custody, restrictions, jurisdiction, hold, prohibited attributes) is **conjunct-only**: can deny, never grant | Derivation is `class_permits ∧ conjuncts`; T-DER-* |
| **INV-05** | Classification records are append-only, evidenced, maker-checkered, `maker ≠ checker`, and bound to the identity fingerprint they classified | DB CHECK + trigger + IAM-02 approval + local maker≠checker check |
| **INV-06** | Environment is read from AST-01's own validated config (`canonicalEnvironment`), never from the caller. Unknown ⇒ PRODUCTION | Route layer; T-ENV-* |
| **INV-07** | `SYNTHETIC_TEST_INSTRUMENT` is valid only in DEVELOPMENT/TEST/UAT/DEMO, fails closed in PRODUCTION, and is structurally unpromotable | DB CHECKs; separate code namespace; T-SYN-* |
| **INV-08** | A non-production classification is never evidence in PRODUCTION (Doc 00 §21A rule 4) | `recorded_environment` bound to each record; derivation ignores records from another canonical environment |
| **INV-09** | Tightening actions are available to a single authorised actor; loosening actions require maker-checker (mirrors `SYS-RULE-008`) | 07 §5 |
| **INV-10** | AST-01 never emits "access granted". Its output names `conjunct: PRODUCT_ASSET_ELIGIBILITY` and states what it did not evaluate | Response schema; T-API-* |
| **INV-11** | Prohibited categories (privacy coin, algorithmic stablecoin, MYR, derivative/yield/lending/staking/margin features) deny with no override path for any role, including Super Admin (`ASSET-RULE-001` rule 6) | No clear-lock endpoint exists; attributes immutable after lock |
| **INV-12** | Every eligibility decision on an execution path is logged with the classification record it used and the matrix version (pre-trade evidence; DEC-012 cl. 1 rule 7) | `eligibility_decision_log`; T-AUD-* |
| **INV-13** | AST-01 imports no other service's source and holds no grant into other modules' schemas (F3(c)) | Lint/import test; grants |
| **INV-14** | No AST-01 route path contains an `assertNoExchangeRuntime` fragment (notably `exchange`) | Boot self-test over its own route table; T-BND-01 |

---

## 3. Identity model

### 3.1 Asset versus instrument

```
Issuer reference ──< Asset ──< Instrument >── Network registry
                       │            │
                       │            ├── Underlying reference(s)
                       │            ├── Classification records (append-only)
                       │            ├── Custody support / operational state
                       │            ├── Transfer restriction profile
                       │            └── Product admissions / jurisdiction rules
```

| | **Asset** | **Instrument** |
|---|---|---|
| Meaning | The economic/technical thing (e.g. a stablecoin) | The specific holdable/tradable representation: one asset on one network+contract, a native coin, a fiat reference, or an off-chain record |
| Carries | `asset_code`, name, `asset_class`, issuer ref, origin jurisdiction | `instrument_code`, chain, network, contract address, token standard, on-chain and AIX precision, declared characteristics |
| Classification | **None.** An asset has no eligibility semantics | **Yes — per instrument.** Fail-closed: a bridged or wrapped variant is a different contract and must be classified on its own evidence |
| Mapping to existing code | `asset_code` ↔ WLT-01 `asset_or_currency` | `(asset_code, chain, network)` ↔ WLT-01 `(asset_or_currency, chain, network)` |

Per-instrument classification is deliberately more work than per-asset. The alternative lets a multi-chain token inherit an approval its wrapper never earned; the fail-closed direction is per instrument. Evidence bundles may be **reused as references** across sibling instruments; the approval may not.

### 3.2 Codes

- `asset_code`: `^[A-Z0-9]{2,16}$` (fits WLT-01's `varchar(16)`).
- `instrument_code`: `^[A-Z0-9][A-Z0-9._:-]{1,47}$`, unique, immutable, assigned at creation. Recommended form `<asset_code>.<chain>.<network>` for tokens, `<asset_code>` for native coins.
- **Synthetic codes must match `^SYN[.-]`; real codes must not** (DB CHECK against `declared_synthetic`). Synthetic instruments are therefore structurally distinguishable in every surface (`AST-SRS-001A` req 5).

### 3.3 Identity fingerprint

`identity_fingerprint = sha256(canonicalJson({asset_code, asset_class, instrument_form, chain, network, contract_address_canonical, token_standard, issuer_ref_id, underlying[], declared characteristics, declared_synthetic}))` using the foundation canonical-JSON fingerprinting already used by CFG-01 change payloads.

- Every `classification_record` stores the fingerprint it classified.
- Derivation recomputes the fingerprint from live identity rows; **mismatch ⇒ effective `UNRESOLVED`, reason `CLASSIFICATION_IDENTITY_DRIFT`**.
- Identity columns are mutable only in `DRAFT` (06 SM-1). After the first classification case is submitted the instrument is `IDENTITY_LOCKED`; correcting an identity error means retiring it and creating a new instrument, never editing the classified one. This is what makes "classification is bound to what was classified" true.

### 3.4 Asset classes (`AST-SRS-001`)

`FIAT_CURRENCY`, `DIGITAL_CURRENCY`, `STABLECOIN`, `SECURITY`, `SECURITY_TOKEN`, `RWA_TOKEN`, `TOKENISED_DEBT`, `TOKENISED_FUND`, `TOKENISED_COMMODITY`, `OTHER_PERMITTED`.

The class is **descriptive and narrowing only**. It never supplies eligibility on its own. Three derived families:

| Family | Members | Use |
|---|---|---|
| `MB_CANDIDATE` | `DIGITAL_CURRENCY`, `STABLECOIN` | The only classes for which Spot, OTC and Pay may ever derive as class-permitted. Matches `DEC-012` cl. 5 ("eligible non-security digital currencies") |
| `RWA_FAMILY` | `RWA_TOKEN`, `TOKENISED_DEBT`, `TOKENISED_FUND`, `TOKENISED_COMMODITY`, `SECURITY_TOKEN` | Eligible to be an object of the RWA lifecycle |
| `SECURITIES_PRESUMPTIVE` | `SECURITY`, `SECURITY_TOKEN`, `TOKENISED_DEBT`, `TOKENISED_FUND` | A `NON_SECURITY` classification is **refused** for these (`CLASS_CLASSIFICATION_CONFLICT`). Human decision HD-4 |

`OTHER_PERMITTED` derives `NOT_ASSESSED` for every product until a class rule is separately approved. `FIAT_CURRENCY` is handled per HD-1.

### 3.5 Issuer reference

`issuer_reference` is a **descriptive reference**: legal name, LEI (optional), jurisdiction, and a `source` of `RWA01` (opaque id of an issuer onboarded and KYB'd in RWA-01) or `EXTERNAL` (a third-party issuer of a token AIX does not issue, e.g. a stablecoin issuer, recorded descriptively). AST-01 performs no KYB and never treats an issuer reference as verification. `verification_status` is `UNVERIFIED` or `VERIFIED_BY_SOURCE` and is informational. Issuer jurisdiction feeds evidence, not eligibility.

### 3.6 Underlying reference

Zero or more `instrument_underlying` rows: `underlying_type` (`NONE_NATIVE`, `FIAT_CURRENCY`, `INSTRUMENT`, `COMMODITY`, `REAL_ESTATE`, `DEBT_OBLIGATION`, `FUND_UNITS`, `EQUITY`, `OTHER_DESCRIBED`), optional `underlying_instrument_id` (self-reference and cycles rejected; depth ≤ 5), and `backing_model` (`NATIVE`, `FULLY_RESERVED`, `PARTIALLY_RESERVED`, `ALGORITHMIC`, `ISSUER_OBLIGATION`, `UNKNOWN`).

- `ALGORITHMIC` requires `attr_algorithmic_stablecoin = true` (consistency CHECK) ⇒ prohibited-category deny.
- A `STABLECOIN` must have ≥ 1 underlying row with `backing_model ≠ UNKNOWN` before a classification case may be submitted (`INSTRUMENT_PROFILE_INCOMPLETE`). Completeness is a gate on *submission*, not on classification outcome.
- The underlying relationship is evidence for the classifier. It does not, by itself, change any derived answer.

### 3.7 Network and contract details

`network_registry(chain, network, address_format, canonicalisation_version, status)` — the networks AIX recognises for **instrument identity**. Runtime is read-only; rows arrive by migration/governed change. A chain/network not in the registry cannot carry an instrument (fail closed). Contract addresses are canonicalised per `address_format` before uniqueness is enforced: `UNIQUE (chain, network, contract_address_canonical)` for tokens.

This deliberately does **not** replace WLT-01's `chain_coverage` (address validation + screening provider). Consumers must AND both. The overlap (two registries of networks) is recorded as DCR-AST1-002 for a later reconciliation; nothing is changed now.

### 3.8 Precision (`LED-RULE-005` rules 1, 10)

Every instrument declares `amount_scale` (`smallint`, 0–36, NOT NULL, **no default**). `on_chain_decimals` is stored separately for contract-backed tokens; `amount_scale ≤ on_chain_decimals` is enforced (AIX may be coarser than the chain, never finer). Invariants:

- Absent or invalid precision ⇒ instrument cannot leave `DRAFT` (`ASSET_PRECISION_INVALID`), and any evaluate returns deny for a row somehow lacking it.
- `amount_scale` is identity-critical (in the fingerprint) and immutable after `IDENTITY_LOCKED`. LED-01 must never see a precision change on a live instrument; a change is a new instrument.
- AST-01 states the scale. Rounding direction, residual accounts and calculation/display precision per pair are `LED-01`/pair-config concerns (`LED-RULE-005` rules 3–9), not AST-01's.

---

## 4. Classification

### 4.1 Outcomes (Doc 00 §12A; Workflow `WF-35` §33F.5)

| Outcome | Stored as | Meaning |
|---|---|---|
| **UNRESOLVED** | **Absence** of an effective record; or an explicit `UNRESOLVED` record (reversion) | Default. Fail closed |
| `NON_SECURITY_DIGITAL_ASSET` | record | *May be considered* for Spot/OTC, subject to every other rule |
| `SECURITY_OR_SECURITY_TOKEN` | record | Never Spot/OTC. Routes to the securities path |
| `SYNTHETIC_TEST_INSTRUMENT` | record, `synthetic_emulates ∈ {NON_SECURITY, SECURITY}` | Non-production only. See §4.5 |

### 4.2 The classification ledger

`classification_record` is append-only (no UPDATE/DELETE grant; triggers reject both). The **effective** classification of an instrument at time *t* is its highest-`record_seq` record — then subjected to the validity checks in §4.4, which collapse it to `UNRESOLVED` if that record was made in a different canonical environment. (Selecting "the latest record *for this environment*" instead would let an older record from another environment apply behind a newer one; the fail-closed choice is to look at the newest record only.) There is no `current_classification_id` pointer column to drift.

A record requires: outcome; `identity_fingerprint`; `recorded_environment`; `evidence_standard_id` and `evidence_bundle_hash`; `maker_actor_id`; `checker_actor_id` with `checker ≠ maker`; the IAM-02 `approval_id`; rationale; `record_seq`.

### 4.3 Evidence

`classification_evidence` items are immutable: `evidence_type`, title, `content_sha256`, `object_ref` (opaque pointer to the document store — **no document bytes in the database**), author, `classifier_of_record`, `recorded_at`. `evidence_bundle_hash` = sha256 over the ordered `(evidence_id, content_sha256)` list, bound into the approval payload so the checker approves exactly the bundle presented.

**Evidence standard (`R4-Q3` is open).** The legal classifier of record and the binding evidence standard for the securities-features test are **unresolved** (Doc 00 §23, R4-Q3: "holds §12A operation"). AST-01 therefore:

1. Hard-codes **no** evidence standard, evidence type list, or securities-features checklist.
2. Holds them in `evidence_standard` (versioned, governed). `features_assessment` content is validated against the standard's own schema.
3. Refuses to approve a classification unless an `APPROVED` standard whose `applicable_environments` includes the current canonical environment exists. A standard applicable to PRODUCTION **cannot be created** without a non-null `r4q3_resolution_ref` (a pointer to the governance decision that answered R4-Q3 — AST-01 records that pointer and answers nothing).
4. Result today: in PRODUCTION no classification can be approved (`EVIDENCE_STANDARD_NOT_ESTABLISHED`); every real instrument stays `UNRESOLVED`. That is exactly what Doc 00 §24 gate 4 and `DEC-013` cl. 4 require. Non-production may use an explicitly non-production standard so RWA/Exchange development is not blocked (`DEC-013` cl. 4).

### 4.4 Effective-classification validity checks (fail closed)

The effective outcome collapses to `UNRESOLVED` (with the named reason) if any fails:

| Check | Reason code |
|---|---|
| Latest record's `recorded_environment` ≠ current canonical environment | `CLASSIFICATION_ENVIRONMENT_MISMATCH` |
| Record `identity_fingerprint` ≠ recomputed fingerprint | `CLASSIFICATION_IDENTITY_DRIFT` |
| Record's evidence standard not `APPROVED` (or retired since) *and* current env = PRODUCTION | `EVIDENCE_STANDARD_NOT_ESTABLISHED` |
| Outcome `SYNTHETIC_TEST_INSTRUMENT` and current env = PRODUCTION | `SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION` |
| Active hold on the instrument (§4.6) | `INSTRUMENT_ON_HOLD` |
| Instrument `RETIRED` | `INSTRUMENT_RETIRED` |
| Any read/parse failure of the above | `CLASSIFICATION_UNREADABLE` |

### 4.5 Synthetic and test instruments (`AST-SRS-001A`, `MIG-010`)

- Declared at creation (`declared_synthetic = true`); **cannot be changed**. A declared-synthetic instrument can only ever receive a `SYNTHETIC_TEST_INSTRUMENT` record (CHECK); a real instrument can never receive one. So there is **no promotion path to model** — the operation does not exist, and a real asset is classified afresh as a new instrument on real evidence.
- Valid only where `canonicalEnvironment ≠ PRODUCTION`. In PRODUCTION it derives all-`INELIGIBLE` with `SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION`, and additionally raises a critical audit event (a synthetic row existing in PRODUCTION is itself an anomaly).
- `synthetic_emulates` says which real outcome the test instrument behaves as, so Spot/OTC refusal of a security-like instrument can be tested end-to-end (T-SEC-*) and Spot flows can be tested against a non-security-like one. **Design addition needing approval — HD-3.** Default if HD-3 is declined: synthetic derives class-permitted only for `RWA`, `SECONDARY_MARKET`, `EXCHANGE` and never for Spot/OTC/Pay.
- A synthetic classification is never cited as evidence about a real asset: evidence rows and cases for synthetic instruments carry `synthetic = true` and may not be referenced by a real instrument's evidence bundle (CHECK).
- `recorded_environment` for synthetic is never PRODUCTION (CHECK).

### 4.6 Holds (emergency tightening)

A `hold` is a **single-actor**, immediately effective fail-closed action (precedent: `SYS-RULE-008` "deactivation must always be available to a single authorised actor"). It is **not** a classification change and does not write a classification record, so the maker-checker rule for classification (Role Matrix §5.2A rule 9) stays absolute. Effective outcome under an active hold is `UNRESOLVED`. **Releasing a hold requires maker-checker**, and release restores the previously effective classification only if it still validates (§4.4); it never creates a classification. Who may place a hold is not stated in the Role Matrix — HD-6 / DCR-AST1-006.

---

## 5. Derivation of product eligibility

### 5.1 State vocabulary

`DEC-013` `PRODUCT_ASSET_ELIGIBILITY_STATE`: `NOT_ASSESSED` / `INELIGIBLE` / `ELIGIBLE`. **`NOT_ASSESSED` denies** (`SYS-RULE-009`). AST-01 uses `INELIGIBLE` when the classification/class *definitively excludes* the product, and `NOT_ASSESSED` when the answer is missing, unresolved, or depends on an open regulatory question. Both deny; the distinction guides operators and avoids asserting a regulatory answer AIX does not have.

### 5.2 Formula

```
step 1  E  := effective outcome after §4.4 (UNRESOLVED if any check fails)
step 2  P  := matrix[E, class, synthetic_emulates?, product]        → PERMITS | INELIGIBLE | NOT_ASSESSED
step 3  if P ≠ PERMITS → return P (with reason)
step 4  conjuncts (each may only deny):
          C1 no prohibited-category attribute / ALGORITHMIC backing
          C2 product_admission for (instrument, product) is APPROVED and was approved against the
             CURRENT effective record (else NOT_ASSESSED: PRODUCT_ADMISSION_NOT_APPROVED)
          C3 instrument-level jurisdiction rules vs supplied client_jurisdiction
          C4 transfer_restriction_profile assessed (required for RWA/SECONDARY_MARKET/EXCHANGE)
          C5 for EXCHANGE: an EXM-01 admission attestation exists and validates
step 5  ELIGIBLE iff P = PERMITS ∧ C1 ∧ C2 ∧ C3 ∧ C4 ∧ (C5 if EXCHANGE)
```

No step 4 conjunct can change a `NOT_ASSESSED`/`INELIGIBLE` from step 3 into `ELIGIBLE`. The function has no input through which a stored flag can override step 3.

### 5.3 The matrix (frozen constant `ELIGIBILITY_MATRIX_V1`)

Rows are the **effective outcome after synthetic substitution** (a synthetic instrument uses `synthetic_emulates` in non-production; in PRODUCTION it never reaches this table). `MBC` = class ∈ `MB_CANDIDATE`; `RWAF` = class ∈ `RWA_FAMILY`.

| Effective outcome | Spot | OTC | Pay | RWA | Secondary market | Exchange |
|---|---|---|---|---|---|---|
| **UNRESOLVED** | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED |
| **NON_SECURITY**, MBC | PERMITS | PERMITS | PERMITS | INELIGIBLE | INELIGIBLE | INELIGIBLE |
| **NON_SECURITY**, RWAF | NOT_ASSESSED ¹ | NOT_ASSESSED ¹ | NOT_ASSESSED ¹ | PERMITS | NOT_ASSESSED ² | INELIGIBLE |
| **NON_SECURITY**, FIAT (HD-1) | INELIGIBLE | INELIGIBLE | INELIGIBLE | INELIGIBLE | INELIGIBLE | INELIGIBLE |
| **NON_SECURITY**, OTHER_PERMITTED | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED | INELIGIBLE |
| **SECURITY** (any class) | **INELIGIBLE — permanent** ³ | **INELIGIBLE — permanent** ³ | INELIGIBLE ⁴ | PERMITS if RWAF else INELIGIBLE | PERMITS (not FIAT) | PERMITS-pending-C5 |

¹ Non-security RWA on MB rails depends on `R4-Q6`/`R4-Q7` (open): AST-01 does not assume an answer, so it derives `NOT_ASSESSED`, never `PERMITS`.
² Whether non-security RWA secondary trading is MB, Exchange or neither is `R4-Q7` (open).
³ `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT`. Environment-independent, not configurable, asserted at boot (§5.5). This is `ASSET-RULE-002` rule 1.
⁴ No master document authorises a securities-featured instrument as a payment instrument; default deny. HD-5 asks the owner to confirm.

`PERMITS` is **only** a class/classification-level result; it is never returned to a caller as such. Callers see `ELIGIBLE`/`INELIGIBLE`/`NOT_ASSESSED` after step 5.

`RWA` here means "instrument is an object of the RWA lifecycle". Using a stablecoin as the **payment currency** for an RWA subscription is a Pay/ledger-currency question, not an AST-01 `RWA` eligibility answer. Recorded as HD-7 to confirm.

### 5.4 Secondary market and Exchange chain

`RWA → SECONDARY_MARKET → EXCHANGE`, matching Workflow `WF-31` step 19 and `WF-32` steps 1–3 and `EXG-SRS-*`: secondary-market eligibility is derived first; Exchange eligibility additionally requires the `EXM-01` admission (SRS `AST-SRS-001` req 5: "reachable only through a resolved `SECURITY / SECURITY TOKEN` classification and the `EXM-01` admission path"). AST-01 never lists an instrument on an Exchange.

### 5.5 Where the hard rule is enforced

1. **Matrix constant** — `ELIGIBILITY_MATRIX_V1` is `Object.freeze`d. At module load, `assertMatrixInvariants()` iterates every (outcome, class, product) and **throws — the service refuses to start —** if any Spot/OTC cell for `SECURITY` is not `INELIGIBLE`, or any cell for `UNRESOLVED` is not `NOT_ASSESSED`. (Same discipline as `assertNoExchangeRuntime`.)
2. **Derivation function** — pure, no I/O, exhaustively property-tested (T-DER-*, T-SEC-*).
3. **Decision log + token CHECKs** — the database refuses to record an `allow` where `effective_outcome = 'SECURITY_OR_SECURITY_TOKEN'` (or `synthetic_emulates = 'SECURITY'`) and `product IN ('SPOT','OTC')`, or an `allow` for `UNRESOLVED`, or an `allow` for a synthetic row in PRODUCTION (05 §3.9).
4. **Admission trigger** — a `product_admission` row for `SPOT`/`OTC` cannot reference a `SECURITY` (or security-emulating) classification record.
5. **Verify-decision** — re-derives against live state; reclassification after `evaluate` kills the token.

### 5.6 Why `product_admission` is not an "independent eligibility flag"

`product_admission` records that Compliance reviewed *this instrument for this product* (`AST-SRS-002` req 1: "Asset cannot be enabled without compliance approval"; `ASSET-RULE-001` rule 7). It exists because classification only says an instrument "may be considered" (Doc 00 §12A). It is safe against the derivation rule because:

- it can only be created/approved while the matrix says `PERMITS` for the current effective classification (service check **and** DB trigger);
- it is bound to the `classification_record_id` it was approved against — a newer record makes it inert (`NOT_ASSESSED`), never `ELIGIBLE`;
- it is read only as conjunct C2;
- it is never exposed as `*_eligible`; APIs expose only derived outputs with their provenance.

### 5.7 Deposit and withdrawal (operational eligibility, `WF-35` step 6)

Derived the same way — computed, never stored as a flag; the stored inputs are *capabilities and states*, not eligibility answers.

```
DEPOSIT ELIGIBLE  iff  effective outcome ≠ UNRESOLVED
                   ∧ no prohibited attribute
                   ∧ custody_support APPROVED ∧ deposit_supported
                   ∧ network_registry status ACTIVE
                   ∧ operational_state(DEPOSIT) = ENABLED
                   ∧ instrument has ≥ 1 product whose matrix result is PERMITS
                   ∧ (class ∈ RWAF ∨ security-outcome) ⇒ transfer_restriction_profile assessed
WITHDRAWAL        same, with withdrawal_supported / operational_state(WITHDRAWAL),
                   and every ACTIVE transfer restriction whose scope ∈ {WITHDRAWAL, ALL}
                   published to the caller for enforcement
```

The "≥ 1 permitted product" clause stops AIX accepting custody of an instrument no product may ever use. An instrument that is `SECURITY`-classified may be deposit-eligible (for the securities path) without being Spot/OTC-eligible; the deposit answer says nothing about Spot.

### 5.8 Environments

- AST-01 reads `app.config.environment` (validated at bootstrap) → `canonicalEnvironment`. The caller's `environment` field is required for wire consistency but demoted to an **asserted routing-consistency field**; mismatch ⇒ `deny` `environment_mismatch`, logged with the authoritative value (identical pattern to `MIG-004` §5).
- The matrix is **identical in every environment** (`SYS-RULE-007A` control parity) apart from synthetic handling, which is more restrictive in PRODUCTION.
- `staging` and unknown → PRODUCTION (`MIG-005`).
- Non-production availability of AST-01 capabilities is a `CFG-01` matter (DCR-AST1-003); AST-01 does not read or set `environment_scope`.

---

## 6. Custody support

Facts, not eligibility. `custody_support`: `custody_model ∈ {THIRD_PARTY_CUSTODIAN, NOT_SUPPORTED}` — **there is no enum value for AIX self-custody or AIX private-key custody** (Doc 00 §8.2; "third-party custody"), so it cannot be represented. `custodian_ref` is an opaque provider identifier (vendor registry ownership is outside AST-01). `deposit_supported`, `withdrawal_supported` are technical capabilities. Approval of a custody support record is maker-checker (it opens a deposit path). Absence ⇒ not supported. AST-01 makes no statement about the *regulatory* adequacy of a custodian (`R4-Q5` open).

## 7. Transfer restrictions

`transfer_restriction_profile` (status `UNASSESSED` | `NONE_CONFIRMED` | `DEFINED`) plus `transfer_restriction` rows. `UNASSESSED` is the default and blocks the RWA/secondary-market/Exchange products and withdrawal for security-outcome/RWA-family instruments.

Types: `HOLDER_WHITELIST_REQUIRED`, `LOCKUP_UNTIL`, `INVESTOR_CLASS_ONLY`, `MAX_HOLDER_COUNT`, `MIN_HOLDING`, `ISSUER_CONSENT_REQUIRED`, `FORCED_TRANSFER_POSSIBLE` (disclosure), `SANCTIONS_FREEZE_CAPABLE` (disclosure). `effect` is `DENY` only — **a restriction can never grant**. `scope ∈ {DEPOSIT, WITHDRAWAL, SECONDARY_TRANSFER, ALL}`; `enforcement_points` names who must enforce (`WLT01`, `RWA04`, `EXP01`, `ONCHAIN`). AST-01 is the **system of record and publisher**; enforcement lives at those points, and `onchain_enforced = true` carries a `contract_ref` whose reconciliation with the deployed contract is `RWA-02`'s. Adding or tightening a restriction is single-actor; lifting or relaxing one is maker-checker.

## 8. Jurisdictions

1. **Origin jurisdiction** (asset) and **issuer jurisdiction** (issuer reference): descriptive, evidence inputs.
2. **`jurisdiction_rule`** per (instrument, product): `BLOCK(code)` always denies a matching client jurisdiction; `ALLOW_ONLY(code…)` denies unless the client jurisdiction is listed. ISO 3166-1 alpha-2. No rule ⇒ no *instrument-level* restriction — but C2 requires the admission approval to attest `jurisdiction_assessed = true` (so "nobody looked" is not "unrestricted").
3. If any `ALLOW_ONLY` rule exists and the caller supplies no `client_jurisdiction` ⇒ deny `CLIENT_JURISDICTION_REQUIRED` (fail closed).
4. Global sanctioned-jurisdiction blocking belongs to AML-01/CFG-01. AST-01 does not duplicate it.
5. AST-01 **does not verify** the client's jurisdiction; it applies its rules to a fact `CLT-01`/`KYC-01` supplied over an authenticated service identity.

### 8.6 Exchange admission attestation

`EXM-01` is the authority for Exchange listing status. AST-01 stores an `exchange_admission_attestation` (`EXM-01` admission id, status, evidence ref) received over an authenticated service identity via a route named `/internal/ast1/securities-market-admissions` (no `exchange` in the path — INV-14). An attestation is accepted **only if** the instrument's effective outcome is `SECURITY` and class-permits `EXCHANGE` (service + DB trigger); it is conjunct C5, it can be withdrawn by `EXM-01` (tightening), and it never creates eligibility on its own. `EXM-01` does not exist yet: this is a specified contract, recorded as DCR-AST1-004.

---

## 9. Product eligibility versus the four states — a worked read

For an instrument, a consumer's full gate is (Doc 00 §21A rule 2):

```
permission (IAM-02) ∧ environment availability (CFG-01) ∧ product activation (CFG-01)
  ∧ asset eligibility (AST-01, this module) ∧ production regulatory gate (CFG-01, PRODUCTION only)
```

An `ELIGIBLE` from AST-01 in PRODUCTION does **not** mean the instrument may trade: `securities.token_trading`, Model A venue activation, `R4-Q3` and the §21 gate can each still deny. AST-01 responses carry `not_evaluated: [...]` listing those conjuncts so no consumer can mistake the answer for access.
