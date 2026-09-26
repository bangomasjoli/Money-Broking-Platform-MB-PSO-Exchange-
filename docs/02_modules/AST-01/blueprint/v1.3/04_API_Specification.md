# AST-01 — 04 API Specification (v1.3)

**Status: REMEDIATED / AWAITING RE-REVIEW. No route is implemented.** Conventions mirror CFG-01/WLT-01: service-to-service routes under `/internal/ast1/…`, service identity required (`SERVICE_IDENTITY_REQUIRED`), FND-01 envelope/request context/idempotency on every mutating `POST`, maker-checker through IAM-02 request/apply, `expected_version` optimistic concurrency. No public/browser route in this phase. Changes from v1.0 are tagged **[v1.1: Fnn]**; changes from v1.1 (round-2 review) are tagged **[v1.2: Fnn]**; changes from v1.2 (round-3 review) are tagged **[v1.3: Fnn]**.

## 1. Cross-cutting rules

### 1.1 Authentication, actor, and the service allow-list [F02, F01]

- **Human actions:** the calling service passes the verified human `actor_id` (IAM-01/IAM-02 seam, `DEC-008`); IAM-02 `permission/check` is evaluated for each action (07 §3). LOOSEN and HUMAN-TIGHTEN kinds alike route through request/apply (INV-09).
- **Evaluate/verify:** the caller is identified by **service identity only**, and each identity is **allow-listed to specific subjects** (01 §5.8). A call for a subject outside the caller's list is refused before any state is read: `403 AST1_SUBJECT_NOT_PERMITTED_FOR_CALLER`. No MB-domain service is ever allow-listed to a `SECURITIES` or `RWA` subject (Module Index §19 rule 5A). **[v1.2: F23]** The allow-list is a **frozen constant** in code (deep-`Object.freeze`, not runtime-configurable) with a **boot invariant** `assertAllowlistInvariants()` that throws — the service refuses to start — unless: every MB/PSO service identity (`OMS-01`, `TRD-01`, `EXE-01`, `LQD-01`, `WLT-01`, `PAY-01`) maps only to MB/PSO subjects; `WLT-01` maps to exactly {`DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO`}; `OMS-01`/`TRD-01`/`EXE-01`/`LQD-01` map only within {`SPOT`, `OTC`}; `PAY-01` maps only to `PAY`; no `RWA-*`, `EXM-01`, `EXP-01` or `EXC-01` identity maps to an MB/PSO subject; every mapped subject is a defined subject. The same MB/PSO identity set is duplicated in SQL (05 §7 B9) and parity-tested.

### 1.2 Environment (INV-06)

`environment` in a request is an **asserted routing-consistency field**. AST-01 uses `canonicalEnvironment(config.environment)` (and `ast1.deployment_environment` for SQL enforcement). Mismatch on `evaluate` ⇒ `200 deny`, reason `environment_mismatch`, logged with the authoritative value, critical event, **never a token** — *except* that the hard rule and prohibited-category reasons take precedence (§6.1 step 3, as `MIG-004` §5). Mismatch on `verify-decision` ⇒ `AST1_DECISION_BINDING_MISMATCH`. Unknown ⇒ PRODUCTION.

### 1.3 Route-name constraint (INV-14) [F15]

`assertNoExchangeRuntime` matches route paths (lower-cased) against fragments including **`exchange`**; it is called at boot by aml1, cfg1, clt1, fnd, iam, iam2, kyc1 and sec1. **No AST-01 route path may contain `exchange`**, `order-book`, `matching-engine`, `market-maker` or `client-to-client`. The securities-market domain is named **`SECURITIES_MARKET`** everywhere — subject enum, tables, routes, events — and **no `exchange.*` or `EXCHANGE` identifier is introduced** (`DEC-013` cl. 10 keeps `exchange.*` as the frozen MB-prohibition namespace). The `EXM-01` attestation route is `/internal/ast1/securities-market-admissions`. A boot self-test runs `findProhibitedExchangeRoutes` over AST-01's own route table; 30 planned v1.0 routes were checked with 0 hits, and v1.1 adds none containing a fragment. Whether AST-01 is an `MB_PRODUCT` call site under a future domain-aware guard is DCR-AST1-007.

### 1.4 Response conventions

- Ordinary **decisions** are `200` bodies — `decision: allow | deny | not_applicable` — never HTTP errors (IAM-02 `permission/check` / CFG-01 `evaluate` precedent).
- **Gating** calls (`verify-decision`, `apply`) throw on any non-success.
- Every eligibility response carries `conjunct: "PRODUCT_ASSET_ELIGIBILITY"` and `not_evaluated: ["PERMISSION","ENVIRONMENT_AVAILABILITY","PRODUCT_ACTIVATION","PRODUCTION_REGULATORY_GATE","CLIENT_ELIGIBILITY"]`. AST-01 never returns `access: granted` (INV-10).
- Cursor pagination, max page 200.

---

## 2. Registry (reference data)

### 2.1 Endpoints

| Method & path | Purpose | Permission | Gov |
|---|---|---|---|
| `POST /internal/ast1/issuer-references` | Create issuer reference | `ast1.registry.propose` | audit |
| `POST /internal/ast1/assets` | Create asset. Body **must** carry `predecessor_declaration` (`NONE_DECLARED` + attestation + **`lineage_synthetic`** [v1.3: F28.c — fixes the immutable `lineage.synthetic`; must equal the predecessor root's value when a predecessor is declared], or `SAME_ECONOMIC_SUBJECT` + `predecessor_ref`) **[F06]** | `ast1.registry.propose` | audit |
| `POST /internal/ast1/instruments/validate` **[v1.2: F19.E; v1.3: F28.a]** | **Dry run** of every create-time check (network, **database canonicalisation check — the same SQL function the insert trigger uses**, identity uniqueness, precision, attributes, synthetic consistency, references). Persists nothing and consumes no identity. Exists because a canonical identity is registered exactly once, ever (05 §4.2) | `ast1.registry.propose` | — |
| `POST /internal/ast1/instruments` | Create `DRAFT`. States every `attr_*`, `amount_scale`, `declared_synthetic`, `synthetic_emulates` (immutable from now) and the identity keys `asset_id`, `instrument_form`, `chain`, `network`, `contract_address` (**immutable from now** [F19.D]) | `ast1.registry.propose` | audit |
| `PUT /internal/ast1/instruments/{id}/draft` | Edit `DRAFT` identity **except** `instrument_code`, `declared_synthetic`, `synthetic_emulates`, `asset_id`, `instrument_form`, `chain`, `network`, `contract_address` (`409 AST1_INSTRUMENT_IMMUTABLE_FIELD`) | `ast1.registry.propose` | audit |
| `POST /internal/ast1/instruments/{id}/underlyings` | Add underlying (`DRAFT` only). An instrument-to-instrument link is **insert-only** and cannot be removed [F19.B/D]; cycles/depth > 8 ⇒ `AST1_UNDERLYING_CYCLE` | `ast1.registry.propose` | audit |
| `GET /internal/ast1/assets[/{id}]`, `/instruments[/{id}]`, `/network-registry` | Read (instrument read includes the **informational** `derived_summary`) | `ast1.registry.read` | — |
| **`GET /internal/ast1/currencies/{iso_code}`** | **Fiat reference lookup [F08]** | `ast1.registry.read`; service allow-list includes `WLT-01`, `LED-01`, `PAY-01`, `TRD-01`, `OMS-01`, `CFG-01` | — |
| `GET /internal/ast1/instruments/{id}/lineage` | Lineage root, members, candidate list, linked `SECURITY` determinations and `lineage_review_required` **[F06, F20]** | `ast1.registry.read` | — |
| `POST /internal/ast1/assets/{id}/class-correction-request` **[v1.2: AST-P-3; v1.3: F26]** | Governed correction of a mislabelled `asset_class`, lineage preserved; elevated (two checkers) when leaving `SECURITY`/`SECURITY_TOKEN`; never crosses the fiat boundary once an instrument exists. **Apply (05 §7A, W13) locks the asset and every instrument of the asset, revokes their tokens (`asset_class_corrected`), records a `class_correction_marker` and leaves every instrument `NOT_ASSESSED` `CLASSIFICATION_REQUIRED_AFTER_CORRECTION` until a new governed classification.** No `SYSTEM` hold is placed. The request response lists the instruments and outstanding tokens the correction will affect | `ast1.asset.class_correction_request` | request → apply |

Create-instrument validation order (all-or-nothing): network in registry **and carrying a supported address rule** → contract canonicalised by the **database** function (`ast1.canonicalise_address`; the TypeScript `canonicaliseContractAddress(network, raw)` is a parity-tested mirror used to produce the canonical value the caller sends) and **rejected if the supplied value is not already canonical (`422 AST1_ADDRESS_NOT_CANONICAL`, `AS005`)** [v1.3: F28.a] → **canonical identity not already registered in any status** (`409 AST1_INSTRUMENT_DUPLICATE_IDENTITY`; a retired or abandoned instrument keeps its identity, and a replacement contract has a new address) [F19.E] → `amount_scale` valid and ≤ `on_chain_decimals` → all `attr_*` present → synthetic code/declaration/emulation consistent → class/issuer/lineage references exist → fiat form/class consistent → underlying links acyclic and same-kind.

### 2.2 Fiat reference contract [F08 / AST-HD-1]

```json
// GET /internal/ast1/currencies/MYR   → 200
{
  "iso_code": "MYR", "instrument_id": "uuid", "instrument_form": "FIAT",
  "amount_scale": 2, "myr_denominated": true, "status": "ACTIVE",
  "ledger_reference": "opaque", "payment_reference": "opaque",
  "classification_regime": "NOT_APPLICABLE_FIAT",
  "pair_control_required": true,
  "conjunct": "REFERENCE_DATA", "note": "Fiat is outside the §12A classification and eligibility API. No MYR-pair control exists today (OQ-6): AST-01 supplies the attribute only and enforces nothing on pairs."
}
```
`pair_control_required` is `true` whenever `myr_denominated` is `true`. **A consumer that puts a `myr_denominated` fiat leg into a trading pair must deny unless it holds a recorded pair-level MYR approval from an authoritative pair-control owner. With no owner or no approval, it denies** [F21]. MYR payment and payout rails are not trading pairs and are unaffected.
Missing/retired fiat ⇒ `404 AST1_CURRENCY_NOT_FOUND` (a reference-data failure). There is **no** classification, eligibility or admission surface for fiat.

---

## 3. Classification

| Method & path | Purpose | Permission | Gov |
|---|---|---|---|
| `POST /internal/ast1/classification-cases` | Open case `{instrument_id, case_kind}` (refused for fiat) | `ast1.classification.open` | audit |
| `POST …/classification-cases/{id}/evidence` | Attach evidence item | `ast1.classification.record_evidence` | audit; immutable |
| `POST …/classification-cases/{id}/submit` | Maker declares `{proposed_outcome, rationale, features_assessment, evidence_standard_id, lineage_reviewed}`; locks identity; **computes `elevated` and required approvers**; creates governed change. No emulation field — the instrument is the source [F09] | `ast1.classification.submit` | request |
| `POST …/classification-cases/{id}/withdraw` | Withdraw | `ast1.classification.submit` | audit |
| `GET …/classification-cases/{id}`, `/instruments/{id}/classification-records` | Read | `ast1.classification.read` | — |
| `POST /internal/ast1/governed-changes/{change_id}/apply` | Verify IAM-02 decision token; apply | (token) | apply |

`submit` response includes `elevated: bool`, `required_checkers` (`[COMPLIANCE_OFFICER]` or `[COMPLIANCE_OFFICER, MLRO]`), `payload_hash`, and the **lineage candidates** the checker must review [F06].

**`apply` steps** (one DB transaction; audit outbox row in the same transaction; **lock order 05 §7A: the governed change row, then the lineage gate (`FOR SHARE`; `FOR UPDATE` for a real `SECURITY` outcome), then the instrument — for a real `SECURITY` outcome, every affected instrument of the merge tree and of instruments wrapping it, ascending `instrument_id`, `FOR UPDATE`** [F18, F20; v1.3: F27]): load change → IAM-02 `execute-verify` bound to the recomputed `payload_hash` → **require the response to carry IAM-02-attested approver identities and approval-policy id and require them to satisfy `required_checkers`, with `maker ∉ approvers`** [F05] → recheck fingerprint, standard, class/outcome, lineage/elevated rule (**including the review-floor evidence and the `follows_event_*` binding — a lineage merge counts as a triggering event** [v1.3: F27, F28.b]) → append `classification_record` (triggers recompute `recorded_environment`, `lineage_id`, `elevated`) → mark change `applied` → **revoke outstanding tokens** for the instrument if any subject narrows, and — when the record is a real `SECURITY` outcome — for **every affected sibling and underlying-linked instrument** (`revoked_reason = lineage_security_determination`; their eligibility is already denied by the derived conjunct `LINEAGE_SECURITY_REVIEW_REQUIRED`, 01 §4.7A) → publish audit (`ast1.lineage.security_determination_propagated`, `trigger = RECORD`). Failure at any step leaves the change `requested`.

**Enabling gate [F05].** `apply` for classification is **disabled in configuration** until `DCR-AST1-001(a)+(d)` is delivered; if IAM-02 returns no approver identities, `apply` fails closed (`AST1_APPROVER_ATTESTATION_MISSING`). Tests use an IAM-02 stub implementing the extended contract, labelled as a stub.

---

## 4. Holds [F07]

| Method & path | Purpose | Permission | Gov |
|---|---|---|---|
| `POST /internal/ast1/instruments/{id}/holds/request` | **Human** hold — creates governed change | `ast1.hold.request` | request → apply (maker-checker) |
| `POST /internal/ast1/holds/{hold_id}/release-request` | Release — governed change | `ast1.hold.release_request` | request → apply |
| *(internal)* system hold | Integrity sweep / derivation guard insert `hold_origin = SYSTEM`; after a **caught backstop error** the application inserts it in a **separate transaction** (the raising trigger cannot) | service identity `ast1` itself | **immediate; no human approval** |
| `GET /internal/ast1/instruments/{id}/holds` | Read | `ast1.registry.read` | — |

A hold never changes the classification outcome. Evaluate responses show `effective_outcome` unchanged and `hold: true`.

---

## 5. Conjunct configuration

Every **human** write is `request`/`apply` with maker-checker, in either direction (INV-09); the server derives `direction` (audit/priority only). `SYSTEM` and `SERVICE` origins are an enumerated allow-list.

| Path | Notes |
|---|---|
| `…/instruments/{id}/product-admissions` (`POST` request; `…/{admission_id}/suspend-request`, `/withdraw-request`) | Refused unless the matrix currently says `PERMITS` for the **current** record: `INSTRUMENT_NOT_ELIGIBLE_FOR_PRODUCT`; `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` for `SPOT`/`OTC`/`PAY` on a security outcome. Products: `SPOT`, `OTC`, `PAY`, `RWA`, `SECONDARY_MARKET`, `SECURITIES_MARKET` |
| `…/instruments/{id}/custody-support` (domain-scoped `MB_PSO`/`SECURITIES`) | An `MB_PSO` custody approval is refused for a security outcome (backstop). Key columns are immutable; a change is a new row [F24] |
| `…/instruments/{id}/operational-state/{subject}` (`DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO`, `DEPOSIT_SECURITIES`, `WITHDRAWAL_SECURITIES`) | Enable/suspend/disable |
| `…/instruments/{id}/transfer-restriction-profile`, `/transfer-restrictions`, `/jurisdiction-rules` | Add/lift |
| `…/instruments/{id}/risk-profile` | Informational tier |
| `…/evidence-standards` (`POST`, `/{id}/approve`, `/{id}/retire`) | PRODUCTION-applicable approve needs `r4q3_resolution_ref` |
| `POST …/lineage-merges/request` | Irreversible lineage merge [F06]; the only governed lineage operation — there is no un-merge and no lineage edit [F19.D]. **[v1.3: F27]** The request resolves both arguments to lineage roots and returns the **affected instruments and wrappers** and the instruments that would be narrowed. `apply` is the merge transaction of 05 §7A/W12: gate + every affected instrument locked ascending, **`merge_global_seq` assigned by the database (no caller value is accepted)**, affected instruments narrowed and their tokens revoked **in that transaction**, `ast1.lineage.merged` + `ast1.lineage.security_determination_propagated` (`trigger = MERGE`) emitted. A `409 AST1_LOCK_SET_CHANGED` means the affected set grew during locking; retry with a fresh approval |
| `POST …/instruments/{id}/retire-request` | Retire. The canonical identity stays registered **permanently**; it can never be registered again [F19.E] |
| `POST /internal/ast1/securities-market-admissions` | `EXM-01` service only; accepted only for a security-outcome instrument and **bound to the current classification record** [F13]; a later record makes it inert; `EXM-01` may withdraw (service-origin) |

There is **no endpoint that accepts an eligibility value** and none in any request/response schema (T-API-01).

---

## 6. Eligibility evaluation

### 6.1 `POST /internal/ast1/eligibility/evaluate`

```json
// request — exactly ONE instrument selector [v1.2: F17]
{
  "instrument_id": "uuid",
  // OR "instrument_code": "…"                                              (unique, immutable; the only key for OFF_CHAIN_RECORD)
  // OR "instrument_ref": { "chain": "…", "network": "…", "contract_address": "0x…" }   (TOKEN_CONTRACT — canonicalised server-side)
  // OR "instrument_ref": { "chain": "…", "network": "…", "native": true }              (NATIVE_COIN)
  "asserted_asset_code": "ABC",        // optional consistency assertion ONLY; never a selector. Mismatch ⇒ deny INSTRUMENT_REFERENCE_MISMATCH
  "subject": "SPOT",   // SPOT|OTC|PAY|RWA|SECONDARY_MARKET|SECURITIES_MARKET|DEPOSIT_MB_PSO|WITHDRAWAL_MB_PSO|DEPOSIT_SECURITIES|WITHDRAWAL_SECURITIES
  "consumer_service": "TRD-01",     // optional; defaults to the caller; both must be allow-listed for the subject
  "environment": "prod",            // asserted; must equal AST-01's own
  "client_facts": { "jurisdiction": "MY", "client_class": "INSTITUTIONAL" },   // from CLT-01/KYC-01; every client fact any conjunct uses [F23]
  "caller_ref": "opaque-order-or-operation-id",   // [F23] authoritative order/operation reference (not PII)
  "client_ref": "opaque-client-ref",              // [F23] optional opaque client reference; bound into payload_hash, never stored in plaintext
  "payload_binding": { "purpose": "order_preflight", "ref": "opaque-caller-ref" }
}
```
**`{asset_code, chain, network}` is no longer a valid `instrument_ref`.** An asset can have several instruments (contracts) on one network, so that tuple cannot identify one. A request with **no** selector, **more than one** selector, or an `instrument_ref` missing its identity keys is a schema error (`400 VALIDATION_ERROR`; consumers treat it as deny). Resolution rules (01 §3.11): the reference is canonicalised, matched **exactly** against the canonical identity index, and must yield **exactly one** instrument. **0 matches ⇒ `200 deny`, `NOT_ASSESSED`, `INSTRUMENT_NOT_FOUND`. More than one, or any doubt ⇒ `200 deny`, `NOT_ASSESSED`, `INSTRUMENT_REFERENCE_AMBIGUOUS`.** No token in either case; the log row carries a null instrument and the canonical `requested_instrument_ref`; AST-01 **never picks a match**, never falls back to a sibling, and never widens the search.

```json
// response 200
{
  "decision_id": "…", "decision": "deny",                            // allow | deny | not_applicable
  "eligibility_state": "INELIGIBLE",                                 // ELIGIBLE | INELIGIBLE | NOT_ASSESSED | NOT_APPLICABLE
  "reason_code": "SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT",
  "subject": "DEPOSIT_MB_PSO", "domain": "MB_PSO",
  "instrument_id": "uuid", "instrument_form": "TOKEN_CONTRACT",
  "effective_outcome": "SECURITY_OR_SECURITY_TOKEN", "synthetic": false, "hold": false,
  "classification_record_id": "…", "classification_record_seq": 3,
  "matrix_version": "ELIGIBILITY_MATRIX_V2",
  "lineage_review_trigger": null,        // [v1.3: F27] SECURITY_RECORD | LINEAGE_MERGE | UNDERLYING_LINEAGE when reason = LINEAGE_SECURITY_REVIEW_REQUIRED, else null
  "conjunct": "PRODUCT_ASSET_ELIGIBILITY",
  "not_evaluated": ["PERMISSION","ENVIRONMENT_AVAILABILITY","PRODUCT_ACTIVATION","PRODUCTION_REGULATORY_GATE","CLIENT_ELIGIBILITY"],
  "restrictions": [ { "type":"…", "scope":"WITHDRAWAL", "enforcement_points":["WLT01"] } ],
  "token": null
}
```

Ordering (fail-closed; **every** outcome writes one `eligibility_decision_log` row):

1. Service identity check; **subject allow-list check** (`AST1_SUBJECT_NOT_PERMITTED_FOR_CALLER`, throws).
2. **Canonical resolution (01 §3.11).** 0 matches ⇒ deny `INSTRUMENT_NOT_FOUND`; >1 or doubt ⇒ deny `INSTRUMENT_REFERENCE_AMBIGUOUS`; `asserted_asset_code` ≠ the resolved asset's code ⇒ deny `INSTRUMENT_REFERENCE_MISMATCH`. All `NOT_ASSESSED`, no token, logged with the canonical requested reference.
3. **`instrument_form = 'FIAT'` (form, not class) ⇒ `200` `not_applicable`, `SUBJECT_NOT_APPLICABLE_FIAT`, no token** (§2.2). *Not* `deny`; not a statement that the leg may not be used. If `instrument_form = 'FIAT'` but the asset class is not `FIAT_CURRENCY` (impossible by trigger) the request denies `ELIGIBILITY_STATE_UNREADABLE`, never `not_applicable` [F22]. **`not_applicable` is never returned for a non-`FIAT`-form instrument;** a consumer that receives it for one treats it as deny/error (DCR-AST1-004).
   *If the decision may end in `allow`, the transaction opens here with `SELECT … FROM instrument … FOR SHARE` (05 §7A) so that steps 4–11 read one stable state.*
4. Compute the effective classification (01 §4.4), including the **real-instrument production-basis** rule: a real `NON_SECURITY` record whose standard is not production-applicable is not usable (`REAL_INSTRUMENT_NON_PRODUCTION_BASIS`, `NOT_ASSESSED`) [F25], and the **record/instrument fingerprint check** [v1.3: F26]: a record whose fingerprint no longer matches the instrument is not usable — `CLASSIFICATION_REQUIRED_AFTER_CORRECTION` when a verified correction marker explains it (expected; no hold), else `CLASSIFICATION_IDENTITY_DRIFT` (integrity; `SYSTEM` hold by the application in a separate transaction). SQL rule B12 denies both.
5. **Hard rule:** subject ∈ MB/PSO domain (`SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO`) and effective outcome `SECURITY_OR_SECURITY_TOKEN` (real or synthetic-emulating) ⇒ deny `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT`. Precedes the environment check: a permanently prohibited request always denies as such even with a mismatched environment (`MIG-004` §5).
6. `environment` mismatch ⇒ deny `environment_mismatch` (critical event; no token).
7. Matrix lookup (01 §5.3, total). Real securities-route subjects ⇒ `NOT_ASSESSED` `SECURITIES_ROUTE_REAL_INSTRUMENT_NOT_ASSESSED`.
8. Conjuncts C0 (hold) → **C0b (lineage security review required: a newer `SECURITY` record *or* a merge that joined security history, 01 §4.7A [v1.3: F27])** → C1 (prohibited category) → **C1m (digital MYR)** → C2 … C6 (01 §5.2).
9. Unknown/unreadable anywhere ⇒ deny `ELIGIBILITY_STATE_UNREADABLE`.
10. Insert the log row. **The authoritative SQL backstop (05 §7) reads the ledger, not the row's own columns.** A trip raises inside the database and rolls the transaction back; **the application catches the integrity error, returns deny, and in a separate controlled transaction places the `SYSTEM` hold** and fires `ast1.eligibility.hard_rule_backstop_triggered` (critical). The trigger itself never writes a hold [F24].
11. If and only if `ELIGIBLE`: mint a single-use token (**TTL 60 s**) binding `{instrument_id, subject, domain, consumer_service, canonical environment, classification_record_id, record_seq, matrix_version, payload_hash}`. **`payload_hash` = sha256(canonicalJson({instrument_id, subject, domain, consumer_service, environment, classification_record_id, matrix_version, client_facts, caller_ref, client_ref, payload_binding}))** — it covers **every client-dependent fact any conjunct used** (client jurisdiction, client class, and any fact a later conjunct adds), the authoritative order/operation reference and the client reference [F23]. Log, token and the mint transaction commit together.

### 6.2 `POST /internal/ast1/eligibility/verify-decision` [F02; v1.2: F18, F23]

Request `{decision_id, token, instrument_id, subject, client_facts, caller_ref, client_ref?, payload_binding}` — the consumer **re-supplies the facts that were bound**. The whole call is **one database transaction** following the lock order and steps of 05 §7A (instrument `FOR SHARE` → token `FOR UPDATE` → resolve and hold the current record and conjunct state → recompute the SQL backstop → verify bindings → conditional consume). It **throws** unless **all** hold:

| Check | Failure |
|---|---|
| Token exists, unexpired (DB clock), unconsumed, unrevoked | `AST1_DECISION_NOT_FOUND` / `_EXPIRED` / `_CONSUMED` / `_REVOKED` |
| **Authenticated service identity = token `consumer_service`** (and the token's `consumer_service` = the log row's, checked again by the DB trigger) | `AST1_DECISION_BINDING_MISMATCH` |
| **Caller-stated `subject` = token `subject`** (and both in the caller's allow-list) | `AST1_DECISION_BINDING_MISMATCH` |
| **Caller-stated `instrument_id` = token instrument** | `AST1_DECISION_BINDING_MISMATCH` |
| Environment = AST-01's own | `AST1_DECISION_BINDING_MISMATCH` |
| **`payload_hash` recomputes from the re-supplied client facts, caller/client references and payload binding** [F23] | `AST1_DECISION_BINDING_MISMATCH` |
| **Fresh re-derivation, using the bound (hash-verified) facts, is still `ELIGIBLE`; the instrument's current `classification_record_id` = the token's; and the SQL backstop (`backstop_permits`, incl. B8/B10/B11) still permits** | `AST1_DECISION_STALE` (token revoked, reason from cause) |
| Lock timeout or deadlock | `AST1_DECISION_UNAVAILABLE` (token left unconsumed; consumer denies) |

If the client's facts have changed since `evaluate` (jurisdiction, class, …), the consumer's re-supplied facts no longer hash to the token: verification fails and the consumer must call `evaluate` again with the current facts. AST-01 does not fetch client facts itself; "a stronger current authoritative version" is a fresh `evaluate`, never a substitution inside `verify-decision`.

A token minted for `RWA`, `SECONDARY_MARKET` or `SECURITIES_MARKET` therefore **cannot verify** for `SPOT`, `OTC`, `PAY`, MB/PSO custody, or a different caller. Success consumes the token atomically. The consuming `UPDATE` fires the **database** `BEFORE UPDATE` trigger, which independently re-checks bindings, current-record equality and `backstop_permits` (`SECURITY → MB/PSO` is refused **in SQL at consumption**, not only at mint; 05 §7). For MB/PSO subjects `verify-decision` **also** re-asserts the hard rule in code before returning. The failure behaviour table (which side effects happen in which *separate* transaction) is in 05 §7A; the failed transaction is always rolled back and the token is not consumed.

**A token is not an order-lifetime entitlement [AST-HD-10].** It is valid for 60 s and one use; consumers re-evaluate and re-verify at each routing or execution attempt (DCR-AST1-004).

### 6.3 `GET /internal/ast1/instruments/{id}/eligibility`

Informational, tokenless, same shape as `derived_summary`; **not authoritative for enforcement**. Not callable for fiat (`not_applicable`).

### 6.4 Consumer summary

| Situation | Call |
|---|---|
| Digital-asset leg of a Spot/OTC pair, Pay instrument | `evaluate` by **instrument id or canonical identity, never by symbol** (+ `verify-decision` before acting) |
| **Fiat leg** | `GET /currencies/{iso}`; **not** `evaluate`. If `myr_denominated` and the leg is in a trading pair ⇒ **deny** unless a pair-level MYR approval from an authoritative pair-control owner is recorded; no owner/approval ⇒ deny (OQ-6) [F21]. `not_applicable` for a non-`FIAT`-form instrument ⇒ deny/error [F22] |
| Digital instrument with `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED` | Consumer **must not** activate the instrument or any pair containing it. There is no override in AST-01 [F21] |
| MB wallet deposit/withdrawal | `evaluate` with `DEPOSIT_MB_PSO` / `WITHDRAWAL_MB_PSO`, identifying the instrument by **on-chain contract identity** (or native `(chain, network)`) as observed in the transfer, never by symbol. Unsolicited inbound that is not permitted, **unregistered, or ambiguous ⇒ quarantine, no ledger credit** [F17] |
| AST-01 error, timeout, unavailable | **Treat as deny** |

---

## 7. Integrity and evidence

| Method & path | Purpose | Phase |
|---|---|---|
| `POST /internal/ast1/integrity/sweep` | Recompute fingerprints; validate effective classifications; find synthetic rows in PRODUCTION; find orphaned admissions/attestations; verify lineage/identity invariants. **[v1.3]** The rules S1–S10 of 05 §7.1: **explained** governed states (a class correction awaiting reclassification; a lineage awaiting elevated review) are reported and **not** held, while **unexplained** fingerprint drift, a lineage-review gap (SQL/independent divergence, a live token, a missing governing change or propagation audit, a non-elevated record after security history — including the **merge-introduced** case, for the `OWN_LINEAGE` and `UNDERLYING_LINEAGE` bases), a non-canonical or colliding contract identity, a ledger-order break and a missing trigger/grant place **SYSTEM** holds; emit events. Defence in depth only — safety does not depend on it | Implementation phase 4 |
| `POST /internal/ast1/evidence-exports/request` … `/apply`, `GET …/download` | Regulator/auditor evidence pack (maker-checkered) | Later |

## 8. Idempotency and concurrency

FND-01 idempotency on mutating `POST`s; `expected_version` on mutable rows (`AST1_VERSION_CONFLICT`). **Locking [v1.2: F18; v1.3: F26, F27]:** one global lock order defined in 05 §7A — governed change → lineage gate → asset row → instrument rows (ascending id) → token rows → append-only inserts; the v1.2 rule "instrument(s) first, then token(s)" is preserved. Every writer of an eligibility input (record, hold, admission, custody, operational state, restrictions, jurisdiction rules, attestation, retire, revoke) takes the instrument row lock `FOR UPDATE` first (after its upstream locks); lineage-wide writers (a real `SECURITY` record, a **lineage merge**) take the gate exclusively and lock every affected instrument ascending; **`ASSET_CLASS_CORRECTION` takes the asset row and every instrument of the asset ascending**; the first instrument insert takes the asset row `FOR SHARE`; `evaluate`-allow and `verify-decision` take the instrument `FOR SHARE`. Mint and consume are each one transaction; consume is a conditional `UPDATE` guarded by the DB trigger. `lock_timeout` is a short constant; a timeout/deadlock ⇒ `AST1_DECISION_UNAVAILABLE` (deny for the consumer).

## 9. Not provided (deliberately)

No endpoint sets, patches or imports eligibility; edits or deletes a classification record, evidence item, log row or lineage merge; clears a prohibited-category attribute; clears/overrides a `SECURITY` determination; promotes a synthetic instrument; classifies or admits a fiat currency; accepts a securities-domain subject from an MB-domain service; or has a route path containing `exchange`.
