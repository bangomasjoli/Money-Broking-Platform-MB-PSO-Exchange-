# AST-01 — 04 API Specification (v1.1)

**Status: REMEDIATED / AWAITING RE-REVIEW. No route is implemented.** Conventions mirror CFG-01/WLT-01: service-to-service routes under `/internal/ast1/…`, service identity required (`SERVICE_IDENTITY_REQUIRED`), FND-01 envelope/request context/idempotency on every mutating `POST`, maker-checker through IAM-02 request/apply, `expected_version` optimistic concurrency. No public/browser route in this phase. Changes from v1.0 are tagged **[v1.1: Fnn]**.

## 1. Cross-cutting rules

### 1.1 Authentication, actor, and the service allow-list [F02, F01]

- **Human actions:** the calling service passes the verified human `actor_id` (IAM-01/IAM-02 seam, `DEC-008`); IAM-02 `permission/check` is evaluated for each action (07 §3). LOOSEN and HUMAN-TIGHTEN kinds alike route through request/apply (INV-09).
- **Evaluate/verify:** the caller is identified by **service identity only**, and each identity is **allow-listed to specific subjects** (01 §5.8). A call for a subject outside the caller's list is refused before any state is read: `403 AST1_SUBJECT_NOT_PERMITTED_FOR_CALLER`. No MB-domain service is ever allow-listed to a `SECURITIES` or `RWA` subject (Module Index §19 rule 5A).

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
| `POST /internal/ast1/assets` | Create asset. Body **must** carry `predecessor_declaration` (`NONE_DECLARED` + attestation, or `SAME_ECONOMIC_SUBJECT` + `predecessor_ref`) **[F06]** | `ast1.registry.propose` | audit |
| `POST /internal/ast1/instruments` | Create `DRAFT`. States every `attr_*`, `amount_scale`, `declared_synthetic`, `synthetic_emulates` (immutable from now) | `ast1.registry.propose` | audit |
| `PUT /internal/ast1/instruments/{id}/draft` | Edit `DRAFT` identity **except** `instrument_code`/`declared_synthetic`/`synthetic_emulates` (`409 AST1_INSTRUMENT_IMMUTABLE_FIELD`) | `ast1.registry.propose` | audit |
| `POST /internal/ast1/instruments/{id}/underlyings` | Add underlying (DRAFT) | `ast1.registry.propose` | audit |
| `GET /internal/ast1/assets[/{id}]`, `/instruments[/{id}]`, `/network-registry` | Read (instrument read includes the **informational** `derived_summary`) | `ast1.registry.read` | — |
| **`GET /internal/ast1/currencies/{iso_code}`** | **Fiat reference lookup [F08]** | `ast1.registry.read`; service allow-list includes `WLT-01`, `LED-01`, `PAY-01`, `TRD-01`, `OMS-01`, `CFG-01` | — |
| `GET /internal/ast1/instruments/{id}/lineage` | Lineage root, members, candidate list **[F06]** | `ast1.registry.read` | — |

Create-instrument validation order (all-or-nothing): network in registry → contract canonicalised → on-chain identity **not previously registered outside its lineage** [F06] → `amount_scale` valid and ≤ `on_chain_decimals` → all `attr_*` present → synthetic code/declaration/emulation consistent → class/issuer/lineage references exist → fiat form/class consistent.

### 2.2 Fiat reference contract [F08 / AST-HD-1]

```json
// GET /internal/ast1/currencies/MYR   → 200
{
  "iso_code": "MYR", "instrument_id": "uuid", "instrument_form": "FIAT",
  "amount_scale": 2, "myr_denominated": true, "status": "ACTIVE",
  "ledger_reference": "opaque", "payment_reference": "opaque",
  "classification_regime": "NOT_APPLICABLE_FIAT",
  "conjunct": "REFERENCE_DATA", "note": "Fiat is outside the §12A classification and eligibility API. Pair/product controls decide MYR restrictions; AST-01 supplies the attribute only."
}
```
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

**`apply` steps** (one DB transaction; audit outbox row in the same transaction): load change → IAM-02 `execute-verify` bound to the recomputed `payload_hash` → **require the response to carry IAM-02-attested approver identities and approval-policy id and require them to satisfy `required_checkers`, with `maker ∉ approvers`** [F05] → recheck fingerprint, standard, class/outcome, lineage/elevated rule → append `classification_record` (triggers recompute `recorded_environment`, `lineage_id`, `elevated`) → mark change `applied` → **revoke outstanding tokens** for the instrument if any subject narrows → publish audit. Failure at any step leaves the change `requested`.

**Enabling gate [F05].** `apply` for classification is **disabled in configuration** until `DCR-AST1-001(a)+(d)` is delivered; if IAM-02 returns no approver identities, `apply` fails closed (`AST1_APPROVER_ATTESTATION_MISSING`). Tests use an IAM-02 stub implementing the extended contract, labelled as a stub.

---

## 4. Holds [F07]

| Method & path | Purpose | Permission | Gov |
|---|---|---|---|
| `POST /internal/ast1/instruments/{id}/holds/request` | **Human** hold — creates governed change | `ast1.hold.request` | request → apply (maker-checker) |
| `POST /internal/ast1/holds/{hold_id}/release-request` | Release — governed change | `ast1.hold.release_request` | request → apply |
| *(internal)* system hold | Integrity sweep / derivation guard / backstop trip insert `hold_origin = SYSTEM` | service identity `ast1` itself | **immediate; no human approval** |
| `GET /internal/ast1/instruments/{id}/holds` | Read | `ast1.registry.read` | — |

A hold never changes the classification outcome. Evaluate responses show `effective_outcome` unchanged and `hold: true`.

---

## 5. Conjunct configuration

Every **human** write is `request`/`apply` with maker-checker, in either direction (INV-09); the server derives `direction` (audit/priority only). `SYSTEM` and `SERVICE` origins are an enumerated allow-list.

| Path | Notes |
|---|---|
| `…/instruments/{id}/product-admissions` (`POST` request; `…/{admission_id}/suspend-request`, `/withdraw-request`) | Refused unless the matrix currently says `PERMITS` for the **current** record: `INSTRUMENT_NOT_ELIGIBLE_FOR_PRODUCT`; `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` for `SPOT`/`OTC`/`PAY` on a security outcome. Products: `SPOT`, `OTC`, `PAY`, `RWA`, `SECONDARY_MARKET`, `SECURITIES_MARKET` |
| `…/instruments/{id}/custody-support` (domain-scoped `MB_PSO`/`SECURITIES`) | An `MB_PSO` custody approval is refused for a security outcome (backstop) |
| `…/instruments/{id}/operational-state/{subject}` (`DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO`, `DEPOSIT_SECURITIES`, `WITHDRAWAL_SECURITIES`) | Enable/suspend/disable |
| `…/instruments/{id}/transfer-restriction-profile`, `/transfer-restrictions`, `/jurisdiction-rules` | Add/lift |
| `…/instruments/{id}/risk-profile` | Informational tier |
| `…/evidence-standards` (`POST`, `/{id}/approve`, `/{id}/retire`) | PRODUCTION-applicable approve needs `r4q3_resolution_ref` |
| `POST …/lineage-merges/request` | Irreversible lineage merge [F06] |
| `POST …/instruments/{id}/retire-request` | Retire (never re-registrable outside lineage) |
| `POST /internal/ast1/securities-market-admissions` | `EXM-01` service only; accepted only for a security-outcome instrument and **bound to the current classification record** [F13]; a later record makes it inert; `EXM-01` may withdraw (service-origin) |

There is **no endpoint that accepts an eligibility value** and none in any request/response schema (T-API-01).

---

## 6. Eligibility evaluation

### 6.1 `POST /internal/ast1/eligibility/evaluate`

```json
// request
{
  "instrument_id": "uuid",                                           // OR
  "instrument_ref": { "asset_code": "ABC", "chain": "…", "network": "…" },
  "subject": "SPOT",   // SPOT|OTC|PAY|RWA|SECONDARY_MARKET|SECURITIES_MARKET|DEPOSIT_MB_PSO|WITHDRAWAL_MB_PSO|DEPOSIT_SECURITIES|WITHDRAWAL_SECURITIES
  "consumer_service": "TRD-01",     // optional; defaults to the caller; both must be allow-listed for the subject
  "environment": "prod",            // asserted; must equal AST-01's own
  "client_facts": { "jurisdiction": "MY", "client_class": "INSTITUTIONAL" },   // from CLT-01/KYC-01
  "payload_binding": { "purpose": "order_preflight", "ref": "opaque-caller-ref" }
}
```
```json
// response 200
{
  "decision_id": "…", "decision": "deny",                            // allow | deny | not_applicable
  "eligibility_state": "INELIGIBLE",                                 // ELIGIBLE | INELIGIBLE | NOT_ASSESSED | NOT_APPLICABLE
  "reason_code": "SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT",
  "subject": "DEPOSIT_MB_PSO", "domain": "MB_PSO",
  "effective_outcome": "SECURITY_OR_SECURITY_TOKEN", "synthetic": false, "hold": false,
  "classification_record_id": "…", "classification_record_seq": 3,
  "matrix_version": "ELIGIBILITY_MATRIX_V2",
  "conjunct": "PRODUCT_ASSET_ELIGIBILITY",
  "not_evaluated": ["PERMISSION","ENVIRONMENT_AVAILABILITY","PRODUCT_ACTIVATION","PRODUCTION_REGULATORY_GATE","CLIENT_ELIGIBILITY"],
  "restrictions": [ { "type":"…", "scope":"WITHDRAWAL", "enforcement_points":["WLT01"] } ],
  "token": null
}
```

Ordering (fail-closed; **every** outcome writes one `eligibility_decision_log` row):

1. Service identity check; **subject allow-list check** (`AST1_SUBJECT_NOT_PERMITTED_FOR_CALLER`, throws).
2. Resolve instrument; unresolvable ⇒ deny `INSTRUMENT_NOT_FOUND`.
3. **Fiat class ⇒ `200` `not_applicable`, `SUBJECT_NOT_APPLICABLE_FIAT`, no token** (§2.2). *Not* `deny`; not a statement that the leg may not be used.
4. Compute the effective classification (01 §4.4).
5. **Hard rule:** subject ∈ MB/PSO domain (`SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO`) and effective outcome `SECURITY_OR_SECURITY_TOKEN` (real or synthetic-emulating) ⇒ deny `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT`. Precedes the environment check: a permanently prohibited request always denies as such even with a mismatched environment (`MIG-004` §5).
6. `environment` mismatch ⇒ deny `environment_mismatch` (critical event; no token).
7. Matrix lookup (01 §5.3, total). Real securities-route subjects ⇒ `NOT_ASSESSED` `SECURITIES_ROUTE_REAL_INSTRUMENT_NOT_ASSESSED`.
8. Conjuncts C0 (hold) → C1 (prohibited category) → C2 … C6 (01 §5.2).
9. Unknown/unreadable anywhere ⇒ deny `ELIGIBILITY_STATE_UNREADABLE`.
10. Insert the log row. **The authoritative SQL backstop (05 §7) reads the ledger, not the row's own columns.** A trip ⇒ the request returns deny, a `SYSTEM` hold is placed, and `ast1.eligibility.hard_rule_backstop_triggered` (critical) fires.
11. If and only if `ELIGIBLE`: mint a single-use token (**TTL 60 s**) binding `{instrument_id, subject, domain, consumer_service, canonical environment, classification_record_id, record_seq, matrix_version, payload_hash}`.

### 6.2 `POST /internal/ast1/eligibility/verify-decision` [F02]

Request `{decision_id, token, instrument_id, subject, payload_binding}`. **Throws** unless **all** hold:

| Check | Failure |
|---|---|
| Token exists, unexpired, unconsumed, unrevoked | `AST1_DECISION_EXPIRED` / `_CONSUMED` / `_REVOKED` |
| **Authenticated service identity = token `consumer_service`** | `AST1_DECISION_BINDING_MISMATCH` |
| **Caller-stated `subject` = token `subject`** (and both in the caller's allow-list) | `AST1_DECISION_BINDING_MISMATCH` |
| **Caller-stated `instrument_id` = token instrument** | `AST1_DECISION_BINDING_MISMATCH` |
| Environment = AST-01's own | `AST1_DECISION_BINDING_MISMATCH` |
| `payload_hash` recomputes | `AST1_DECISION_BINDING_MISMATCH` |
| **Fresh re-derivation is still `ELIGIBLE` and the instrument's current `classification_record_id` = the token's** (not only the sequence) | `AST1_DECISION_STALE` (token revoked `instrument_reclassified`) |

A token minted for `RWA`, `SECONDARY_MARKET` or `SECURITIES_MARKET` therefore **cannot verify** for `SPOT`, `OTC`, `PAY`, MB/PSO custody, or a different caller. Success consumes the token atomically (`UPDATE … WHERE consumed_at IS NULL`). For MB/PSO subjects `verify-decision` **re-asserts the hard rule in code** before returning.

**A token is not an order-lifetime entitlement [AST-HD-10].** It is valid for 60 s and one use; consumers re-evaluate and re-verify at each routing or execution attempt (DCR-AST1-004).

### 6.3 `GET /internal/ast1/instruments/{id}/eligibility`

Informational, tokenless, same shape as `derived_summary`; **not authoritative for enforcement**. Not callable for fiat (`not_applicable`).

### 6.4 Consumer summary

| Situation | Call |
|---|---|
| Digital-asset leg of a Spot/OTC pair, Pay instrument | `evaluate` (+ `verify-decision` before acting) |
| **Fiat leg** | `GET /currencies/{iso}` + pair/product control (OQ-6); **not** `evaluate` |
| MB wallet deposit/withdrawal | `evaluate` with `DEPOSIT_MB_PSO` / `WITHDRAWAL_MB_PSO`; unsolicited inbound not permitted ⇒ quarantine, no credit |
| AST-01 error, timeout, unavailable | **Treat as deny** |

---

## 7. Integrity and evidence

| Method & path | Purpose | Phase |
|---|---|---|
| `POST /internal/ast1/integrity/sweep` | Recompute fingerprints; validate effective classifications; find synthetic rows in PRODUCTION; find orphaned admissions/attestations; verify lineage continuity (same-contract instruments outside a shared lineage); place **SYSTEM** holds; emit events | Implementation phase 4 |
| `POST /internal/ast1/evidence-exports/request` … `/apply`, `GET …/download` | Regulator/auditor evidence pack (maker-checkered) | Later |

## 8. Idempotency and concurrency

FND-01 idempotency on mutating `POST`s; `expected_version` on mutable rows (`AST1_VERSION_CONFLICT`); `record_seq` serialised by `SELECT … FOR UPDATE` on the instrument row; token consume is one conditional `UPDATE`.

## 9. Not provided (deliberately)

No endpoint sets, patches or imports eligibility; edits or deletes a classification record, evidence item, log row or lineage merge; clears a prohibited-category attribute; clears/overrides a `SECURITY` determination; promotes a synthetic instrument; classifies or admits a fiat currency; accepts a securities-domain subject from an MB-domain service; or has a route path containing `exchange`.
