# AST-01 — 04 API Specification

**Status: PLANNED / AWAITING REVIEW. No route is implemented.** Conventions mirror CFG-01/WLT-01: service-to-service routes under `/internal/ast1/…`, service-identity required (`SERVICE_IDENTITY_REQUIRED`), FND-01 envelope and request context, FND-01 idempotency on every mutating `POST`, maker-checker through IAM-02 request/apply, `expected_version` optimistic concurrency. There is no public/browser route in this phase; staff UI goes through the existing BFF pattern when the UI phase is planned (out of scope).

## 1. Cross-cutting rules

### 1.1 Authentication and actor

- Mutating staff actions: the calling service passes the verified human `actor_id` (IAM-01/IAM-02 seam, `DEC-008`); AST-01 never authenticates humans itself. IAM-02 `permission/check` is evaluated for each action (07 §3); `approval_required` is the *expected* baseline answer for loosening actions and routes to the request/apply pair.
- Evaluate/verify: caller identified by **service identity** only; allow-list in config (`OMS-01`, `TRD-01`, `WLT-01`, `PAY-01`, `RWA-01…04`, `EXM-01`, `EXP-01`, `CFG-01`, `SUR-01` read-only summary). Unlisted service ⇒ `SERVICE_IDENTITY_REQUIRED`.

### 1.2 Environment (INV-06)

Every request that carries `environment` treats it as an **asserted routing-consistency field**. AST-01 uses its own `canonicalEnvironment(config.environment)`. Mismatch on `evaluate` ⇒ HTTP 200 `deny`, reason `environment_mismatch`, logged with the authoritative value, critical audit event, **never a token**. Mismatch on `verify-decision` ⇒ `AST1_DECISION_BINDING_MISMATCH`. Unknown ⇒ PRODUCTION.

### 1.3 Route-name constraint (INV-14)

`assertNoExchangeRuntime` matches route paths lower-cased against fragments including **`exchange`**. **No AST-01 route path may contain `exchange`** (nor `order-book`, `matching-engine`, `market-maker`, `client-to-client`, …). The Exchange product appears **only** as the enum value `EXCHANGE` in a request/response body, and the `EXM-01` attestation route is `/internal/ast1/securities-market-admissions`. A boot self-test runs `findProhibitedExchangeRoutes` over AST-01's own route table. Whether AST-01 is a `MB_PRODUCT`-domain call site under the future `MIG-001` domain-aware guard is a DCR (17 DCR-AST1-007) — until then the unconditional fragment list applies and the design already complies.

### 1.4 Response conventions

- Ordinary **decisions** are `200` bodies (`decision: allow|deny`), never HTTP errors — the IAM-02 `permission/check` / CFG-01 `evaluate` precedent ("a decision is an answer, not a request failure").
- **Gating** calls (`verify-decision`, `apply`) throw on any non-success (`4xx`/`409`), like IAM-02 `execute-verify` and CFG-01 `verify-decision`.
- Every eligibility response carries `conjunct: "PRODUCT_ASSET_ELIGIBILITY"` and `not_evaluated: ["PERMISSION","ENVIRONMENT_AVAILABILITY","PRODUCT_ACTIVATION","PRODUCTION_REGULATORY_GATE","CLIENT_ELIGIBILITY"]`. AST-01 never returns `access: granted` (INV-10).
- List endpoints: cursor pagination, max page 200, stable order.

---

## 2. Registry (reference data)

| Method & path | Purpose | Permission | Gov |
|---|---|---|---|
| `POST /internal/ast1/issuer-references` | Create descriptive issuer reference | `ast1.registry.propose` | audit |
| `POST /internal/ast1/assets` | Create asset | `ast1.registry.propose` | audit |
| `POST /internal/ast1/instruments` | Create instrument (`DRAFT`); body must state every `attr_*` and `amount_scale` | `ast1.registry.propose` | audit |
| `PUT /internal/ast1/instruments/{instrument_id}/draft` | Edit `DRAFT` identity (body includes `expected_version`) | `ast1.registry.propose` | audit; `409 AST1_INSTRUMENT_IDENTITY_LOCKED` after lock |
| `POST /internal/ast1/instruments/{instrument_id}/underlyings` | Add underlying (DRAFT only) | `ast1.registry.propose` | audit |
| `GET /internal/ast1/assets`, `/assets/{id}` | Read | `ast1.registry.read` | — |
| `GET /internal/ast1/instruments`, `/instruments/{id}` | Read incl. **informational** derived summary (below) | `ast1.registry.read` | — |
| `GET /internal/ast1/network-registry` | Read | `ast1.registry.read` | — |

`GET …/instruments/{id}` includes `derived_summary` — identical output to `evaluate` for each product **but marked `informational: true`, with no token**, and the OpenAPI/response schema states that enforcement points MUST call `evaluate`/`verify-decision`, never act on the summary. (UI use.)

Create-instrument validation order (each failure is a `400`/`422`, nothing partially created): network exists in registry → contract address canonicalised per registry → on-chain identity not already taken → `amount_scale` valid and ≤ `on_chain_decimals` → `attr_*` all present → synthetic code/declaration consistency → class/issuer references exist.

---

## 3. Classification

| Method & path | Purpose | Permission | Gov |
|---|---|---|---|
| `POST /internal/ast1/classification-cases` | Open case `{instrument_id, case_kind}` | `ast1.classification.open` | audit |
| `POST /internal/ast1/classification-cases/{case_id}/evidence` | Attach evidence item `{evidence_type,title,content_sha256,object_ref,classifier_of_record}` | `ast1.classification.record_evidence` | audit; immutable |
| `POST /internal/ast1/classification-cases/{case_id}/submit` | Maker declares `{proposed_outcome, synthetic_emulates?, rationale, features_assessment, evidence_standard_id}`; locks identity; creates governed change | `ast1.classification.submit` (maker) | request |
| `POST /internal/ast1/classification-cases/{case_id}/withdraw` | Withdraw non-terminal case | `ast1.classification.submit` | audit |
| `GET /internal/ast1/classification-cases/{case_id}`; `GET /internal/ast1/instruments/{id}/classification-records` | Read case; read ledger | `ast1.classification.read` | — |
| `POST /internal/ast1/governed-changes/{change_id}/apply` | Verify IAM-02 decision token bound to `payload_hash`; apply | (token) | apply |

`submit` response: `{change_id, payload_hash, status: "requested", approval_binding: {action, payload_hash}}` — the caller takes this to IAM-02 to create the approval. **`apply` never trusts the caller's re-submitted body**: it recomputes from the stored change row, the same discipline as CFG-01 (`payload_hash` recomputed and passed to IAM-02 `execute-verify` as `current_payload_hash`).

`apply` steps (single DB transaction, audit outbox row in the same transaction): load change → verify kind/direction → IAM-02 `execute-verify` with the maker's `actor_id` (as CFG-01 does, token is bound to the maker) → require returned/checker identity ≠ maker → recheck instrument fingerprint, standard applicability, class/outcome consistency, hard rule → append record with `record_seq` → mark change `applied` → revoke outstanding tokens if eligibility narrows → publish audit. Failure at any step leaves the change `requested`.

---

## 4. Holds

| Method & path | Purpose | Permission | Gov |
|---|---|---|---|
| `POST /internal/ast1/instruments/{id}/holds` | **Place hold** `{reason_code, detail}` — immediate, single actor | `ast1.hold.place` | single-actor (tighten) |
| `POST /internal/ast1/holds/{hold_id}/release-request` | Create governed change | `ast1.hold.release_request` | request |
| `GET /internal/ast1/instruments/{id}/holds` | Read | `ast1.registry.read` | — |

Hold placement is `200` even if a hold is already active (idempotent), and always revokes outstanding tokens for the instrument.

---

## 5. Conjunct configuration

All write endpoints accept `{…, expected_version}` and are `request`/`apply` for **LOOSEN** kinds, direct single-actor for **TIGHTEN** kinds. `direction` is determined by the server from the kind and current state, never supplied by the caller.

| Path | Loosen (M+C) | Tighten (single actor) |
|---|---|---|
| `…/instruments/{id}/product-admissions` (`POST` request; `…/{admission_id}/suspend`, `/withdraw`) | request → approve | suspend, withdraw |
| `…/instruments/{id}/custody-support` | approve / re-approve | withdraw |
| `…/instruments/{id}/operational-state/{DEPOSIT\|WITHDRAWAL}` | `→ ENABLED` | `→ SUSPENDED`, `→ DISABLED` |
| `…/instruments/{id}/transfer-restriction-profile` | `UNASSESSED → NONE_CONFIRMED\|DEFINED` | `→ UNASSESSED` |
| `…/instruments/{id}/transfer-restrictions` | lift / relax | add / tighten |
| `…/instruments/{id}/jurisdiction-rules` | lift / relax | add / tighten |
| `…/evidence-standards` (`POST`, `…/{id}/approve`, `…/{id}/retire`) | approve (Compliance Officer + Management) | retire |
| `POST …/instruments/{id}/retire` | retire (M+C) | — |

`product-admissions` request refuses with `INSTRUMENT_NOT_ELIGIBLE_FOR_PRODUCT` unless `deriveProductEligibility` step 3 currently returns `PERMITS`; refuses with `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` for `SPOT`/`OTC` on a security outcome. There is **no endpoint that accepts an eligibility value**, and the request/response schemas contain no such field (T-API-01).

`POST /internal/ast1/securities-market-admissions` — `{instrument_id, admission_ref, status}` from `EXM-01` service identity only; accepted only for a security-outcome instrument; conjunct C5 (01 §8.6).

---

## 6. Eligibility evaluation

### 6.1 `POST /internal/ast1/eligibility/evaluate`

```json
// request
{
  "instrument_id": "uuid",                       // OR
  "instrument_ref": { "asset_code": "ABC", "chain": "…", "network": "…" },
  "subject": "SPOT",                             // SPOT|OTC|PAY|RWA|SECONDARY_MARKET|EXCHANGE|DEPOSIT|WITHDRAWAL
  "environment": "prod",                         // asserted; must equal AST-01's own (INV-06)
  "client_facts": { "jurisdiction": "MY", "client_class": "INSTITUTIONAL" },   // optional, supplied by CLT-01/KYC-01 facts
  "payload_binding": { "purpose": "order_preflight", "ref": "opaque-caller-ref" }
}
```

```json
// response 200
{
  "decision_id": "…", "decision": "deny",
  "eligibility_state": "INELIGIBLE",
  "reason_code": "SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT",
  "effective_outcome": "SECURITY_OR_SECURITY_TOKEN", "synthetic": false,
  "classification_record_id": "…", "classification_record_seq": 3,
  "matrix_version": "ELIGIBILITY_MATRIX_V1",
  "conjunct": "PRODUCT_ASSET_ELIGIBILITY",
  "not_evaluated": ["PERMISSION","ENVIRONMENT_AVAILABILITY","PRODUCT_ACTIVATION","PRODUCTION_REGULATORY_GATE","CLIENT_ELIGIBILITY"],
  "restrictions": [ { "type":"…", "scope":"WITHDRAWAL", "enforcement_points":["WLT01"] } ],   // published for the caller to enforce (deposit/withdrawal/secondary only)
  "token": null                                  // present only when decision = allow
}
```

Algorithm and ordering (fail-closed at every step; **every** outcome writes one `eligibility_decision_log` row and, for critical outcomes, an audit event):

1. Service identity check (throws).
2. Resolve instrument; unresolvable ⇒ deny `INSTRUMENT_NOT_FOUND` (logged with null `instrument_id`).
3. **Hard-rule precedence (as `MIG-004` §5 puts prohibited before environment-mismatch):** compute the effective classification (01 §4.4 collapses). If `subject ∈ {SPOT, OTC, PAY}` and the effective outcome is `SECURITY_OR_SECURITY_TOKEN` (real or synthetic-emulating) ⇒ deny `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT`. A permanently prohibited request always denies as such, even when the caller also asserts a mismatched environment.
4. `environment` mismatch ⇒ deny `environment_mismatch` (authoritative value logged; critical event; no token).
5. Prohibited-category attribute / `ALGORITHMIC` backing ⇒ deny `ASSET_NOT_ALLOWED`.
6. Matrix lookup (01 §5.3), then conjuncts C2–C5.
7. Unknown or unreadable at any step ⇒ deny `ELIGIBILITY_STATE_UNREADABLE`.
8. Write the log row. The DB CHECKs are the last line of defence: a violating row fails the insert, the request returns deny, and a critical `ast1.eligibility.hard_rule_backstop_triggered` event fires.
9. If and only if `ELIGIBLE`: mint a single-use token (TTL 60 s; `payload_hash` over `{decision_id, instrument_id, subject, classification_record_seq, environment, payload_binding}`).

All denies are denies; the precedence only fixes which reason code an operator or auditor sees, and it puts the licence-boundary reason first.

### 6.2 `POST /internal/ast1/eligibility/verify-decision`

`{decision_id, token, payload_binding}` from the consumer immediately before it acts. **Throws** unless: token exists, unexpired, not consumed, not revoked; environment binds; `payload_hash` recomputes; the instrument's `classification_record_seq` still equals the token's **and** a fresh derivation is still `ELIGIBLE` (`AST1_DECISION_STALE` otherwise, token revoked `instrument_reclassified`). Success consumes the token atomically (`UPDATE … WHERE consumed_at IS NULL`; concurrent verify ⇒ exactly one succeeds). `verify-decision` for a `SPOT`/`OTC` subject additionally re-asserts the hard rule in code before returning.

### 6.3 `GET /internal/ast1/instruments/{id}/eligibility`

Informational, tokenless; same shape as `derived_summary`. Documented as **not authoritative for enforcement**.

---

## 7. Integrity and evidence

| Method & path | Purpose | Phase |
|---|---|---|
| `POST /internal/ast1/integrity/sweep` | Recompute fingerprints, validate effective classifications, find synthetic rows in PRODUCTION, orphaned admissions; place system holds; emit events | Implementation phase 4 |
| `POST /internal/ast1/evidence-exports/request` … `/apply`, `GET …/{export_id}/download` | Regulator/auditor evidence pack for an instrument (classification ledger, evidence hashes, decisions) — maker-checker, mirrors WLT-01/CFG-01 evidence exports | Later phase, not in the first implementation task |

---

## 8. Idempotency and concurrency

- FND-01 idempotency on all mutating `POST`s (fingerprint mismatch ⇒ existing foundation error).
- `expected_version` on every mutable row; stale ⇒ `409 AST1_VERSION_CONFLICT`.
- `record_seq` allocation serialised by `SELECT … FOR UPDATE` on the instrument row.
- Token consume is a single conditional `UPDATE`.

## 9. Not provided (deliberately)

No endpoint sets, patches or imports eligibility. No endpoint edits or deletes a classification record, evidence item or decision-log row. No endpoint clears a prohibited-category attribute. No bulk import that writes classification. No "promote synthetic" endpoint. No route containing `exchange`.
