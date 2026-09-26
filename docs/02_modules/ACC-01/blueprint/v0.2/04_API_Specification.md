# ACC-01 Account Structure
## 04 API Specification (v0.2)

## 1. Principles

1. All routes use the FND standard envelope (`successEnvelope`, request ID, correlation ID) and standard errors (file 09).
2. Three route families with different trust models:
   - **Staff routes** `/acc1/*` — IAM-01 session + IAM-02 permission guard. **Under current IAM-02 the guard on approval-gated actions is not an entitlement check (file 02 §0); real-actor use of governed routes is gated (G1).**
   - **Internal routes** `/internal/acc1/*` — service-to-service, guarded by **per-consumer-module capability secrets**; the caller module is derived from *which secret matched*, never from a header (FND rate-limit engine precedent). Never internet-exposed. **ACC-01 itself never holds CLT-01's or IAM-02's general internal credential** (ACC-REQ-031): it uses dedicated read/verify-scoped credentials (DCR-ACC-CLT-03, DCR-ACC-IAM-05).
   - **Client routes** `/acc1/client/*` — **deferred** (phase 6); membership-scoped; see §5.
3. Every mutation requires `Idempotency-Key`. Mutable rows use optimistic `version`; a stale write ⇒ 409 `ACC1_VERSION_CONFLICT`.
4. **No route path contains** `exchange`, `order-book`, `orderbook`, `matching-engine`, `matching_engine`, `market-maker`, `market_maker`, `market-making`, `principal-dealing`, `principal_dealing`, `spread-markup`, `spread_markup`, `maker-taker`, `maker_taker` or `client-to-client` — the boot-time `assertNoExchangeRuntime` guard would refuse to start the service (ACC-REQ-034). Route names below are chosen accordingly (`scope-validate`, not anything containing a prohibited fragment).
5. Responses never contain another client's identifiers. Staff reads that span clients (`?client_id=`) are sensitive-read-logged (file 08).
6. **No API accepts `client_id` for a subaccount.** Subaccount ownership is derived from the master.
7. All mutating staff routes are `requires_approval` **or** explicitly non-governed (profile update). There is no direct "create account" or "set status" route.

## 2. Staff routes (`/acc1/*`)

### 2.1 Change requests (the only way to create, close, restrict or lift)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/acc1/change-requests` | per change type (§2.1.1) | Submit a governed change request → `201`, status `requested` |
| GET | `/acc1/change-requests/{change_request_id}` | `acc1.change_request.read` | Read request and status |
| GET | `/acc1/change-requests` | `acc1.change_request.read` | List (`status`, `change_type`, `client_id`, paging) |
| POST | `/acc1/change-requests/{change_request_id}/apply` | per change type | Apply with IAM-02 decision token (file 02 §2) |
| POST | `/acc1/change-requests/{change_request_id}/cancel` | `acc1.change_request.cancel` | Maker cancels while `requested` |

#### 2.1.1 Submit body by `change_type`

| change_type | Body (in addition to `change_type`) | Permission |
|---|---|---|
| `create_master_account` | `client_id`, `display_name`, `description?` | `acc1.master_account.create` |
| `create_subaccount` | `master_account_id`, `purpose`, `name`, `description?` | `acc1.subaccount.create` |
| `close_master_account` | `master_account_id`, `reason_code` | `acc1.master_account.close` |
| `close_subaccount` | `subaccount_id`, `reason_code` | `acc1.subaccount.close` |
| `apply_restriction` | `master_account_id` **or** `subaccount_id`, `kind`, `scopes[]`, `source_type`, `source_ref?`, `reason_code`, `effective_from?`, `effective_until?` | `acc1.restriction.apply` |
| `lift_restriction` | `restriction_id`, `lift_evidence_ref`, `reason_code` | `acc1.restriction.lift` |

`additionalProperties: false` on every body. Submit validates shape and cheap preconditions only; **all preconditions are re-checked at apply** (file 02 §2 step A4). Response: `{ change_request_id, status, approval_payload, payload_hash, expires_at_utc }`. `approval_payload` is the **canonical payload** the operator must submit verbatim as `payload` to IAM-02's existing `POST /iam2/approvals/request` (`{ maker_user_id, action, resource, entity_id, client_id, payload }`, with `entity_id = change_request_id`). **IAM-02 computes its own fingerprint** of that payload; ACC-01 never sends a hash to IAM-02 and does not call the approval routes. `payload_hash` is `"sha256:" + 64 hex` (71 chars, `@aix/foundation` `fingerprint`).

Apply body: `{ decision_token, approval_id }` — **apply is bound to the stored `requested_by`** (the request's maker, to whom IAM-02 issued the token); ACC-01 sends `actor_id = stored requested_by` to `execute-verify`, never a caller-supplied actor. It recomputes `payload_hash` from the **stored** payload and passes it as `current_payload_hash` (exact seam field names). Response: the resulting resource summary (`master_account_id` and the default `subaccount_id`, or `subaccount_id`, or `restriction_id`). Outside DEVELOPMENT/TEST a gated change type returns `ACC1_REAL_USE_NOT_PERMITTED` (file 01 §4.5).

### 2.2 Reads

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/acc1/master-accounts` | `acc1.master_account.read` | Filters `client_id`, `status`; paging; cross-client listing is sensitive-read-logged |
| GET | `/acc1/master-accounts/{master_account_id}` | `acc1.master_account.read` | Own status **and** effective status |
| GET | `/acc1/master-accounts/{master_account_id}/subaccounts` | `acc1.subaccount.read` | Staff view may show `is_default`; **no route selects, returns or resolves "the default subaccount" as a target** (ACC-HD-1) |
| GET | `/acc1/subaccounts/{subaccount_id}` | `acc1.subaccount.read` | |
| GET | `/acc1/master-accounts/{id}/restrictions`, `/acc1/subaccounts/{id}/restrictions` | `acc1.restriction.read` | Active and historical |
| GET | `/acc1/master-accounts/{id}/status-history`, `/acc1/subaccounts/{id}/status-history` | `acc1.history.read` | Sensitive-read-logged |

### 2.3 Non-governed profile edits

| Method | Path | Permission | Body |
|---|---|---|---|
| PATCH | `/acc1/master-accounts/{master_account_id}` | `acc1.master_account.update_profile` | `{ version, display_name?, description? }` |
| PATCH | `/acc1/subaccounts/{subaccount_id}` | `acc1.subaccount.update_profile` | `{ version, name?, description? }` |

A body containing `client_id`, `master_account_id`, `purpose`, `status`, `is_default` ⇒ 400 by schema; a *processed* attempt to alter ownership (e.g. via a crafted internal path) is refused and audited Critical (`acc1.ownership_change_blocked`).

### 2.4 Closure seal and completion (preventive sequence — file 02 §7)

| Method | Path | Permission | Effect |
|---|---|---|---|
| POST | `/acc1/master-accounts/{id}/close/seal` | `acc1.master_account.close` | `closing → closure_sealed` (final barrier); master only when **all** children are `closed` |
| POST | `/acc1/subaccounts/{id}/close/seal` | `acc1.subaccount.close` | `closing → closure_sealed` |
| POST | `/acc1/master-accounts/{id}/close/complete` | `acc1.master_account.close` | `closure_sealed → closed` |
| POST | `/acc1/subaccounts/{id}/close/complete` | `acc1.subaccount.close` | `closure_sealed → closed` |

Body `{ change_request_id }` plus `Idempotency-Key`; the call must be bound to the applied closure request for that target (`close_change_request_id`). **Seal** increments `closure_seal_version` and is only legal from `closing`. **Complete** requires status `closure_sealed` **and** fresh, **post-barrier** `clear` attestations from every configured attester carrying the current `seal_version_observed`, `in_flight_predating_seal = 0` and `as_of` within `ACC1_ATTESTATION_MAX_AGE_SECONDS`; it is a compare-and-set on the sealed state. On `ACC1_CLOSURE_BLOCKED` the body lists per-attester outcome codes and the target **remains `closure_sealed`**.

## 3. Internal routes (`/internal/acc1/*`)

Guard: per-consumer-module capability secret ⇒ `caller_module`. Read-only routes use read-scoped secrets; no internal route mutates an account (ACC-01 is the sole writer of its own state — LED-01 etc. can *read*, never change).

### 3.1 Resolve

`GET /internal/acc1/subaccounts/{subaccount_id}/resolve`

```json
{
  "success": true,
  "data": {
    "client_id": "…",
    "master_account_id": "mac_…",
    "subaccount_id": "sac_…",
    "purpose": "trading",
    "status": "active",
    "master_status": "active",
    "client_status": "active",
    "effective_status": "active",
    "blocked_scopes": [],
    "scope_semantics": "explanatory_only",
    "applied_restriction_ids": [],
    "versions": { "subaccount": 4, "master_account": 2 },
    "environment": "DEVELOPMENT",
    "resolved_at_utc": "…"
  }
}
```

- HTTP 200 with `effective_status: "unknown"` when any input is unreadable (CLT-01 unreachable, malformed, unrecognised) — a *valid, conservative answer*; the caller denies.
- **Consumer rule (normative):** `effective_status ≠ active` ⇒ the caller **denies** transaction-producing activity unless that specific activity is explicitly authorised by authoritative policy (none exists yet, DCR-ACC-GOV-04). `blocked_scopes` is **explanatory evidence only** (`scope_semantics`), never an allow/deny list. There is deliberately **no** `permitted`/`allowed`/`enabled` field.
- `applied_restriction_ids` lists every restriction counted as in force at evaluation, **evaluated by time** (`effective_from_utc <= now()`), whether or not housekeeping has advanced its stored state; `versions` are the consumer decision evidence (RF-08).
- **Requires an explicit `subaccount_id`.** There is no resolve by client or by master default; `is_default` is **not** returned.
- HTTP 404 `ACC1_SUBACCOUNT_NOT_FOUND` for an unknown identifier (internal callers only; this is not a client-facing existence oracle).
- HTTP 503 `ACC1_SERVICE_UNAVAILABLE` when ACC-01's own DB is unavailable — never degrades to an empty-but-200 answer; callers fail closed on 503 (CLT-01 principal-membership precedent).
- Response omits display names, descriptions and `is_default`.

`GET /internal/acc1/master-accounts/{master_account_id}/resolve` — same shape without subaccount fields, plus `subaccount_counts` by status.

`POST /internal/acc1/subaccounts/resolve-batch` — `{ subaccount_ids: [≤ 100] }` ⇒ per-id results (`not_found` items explicit); one CLT-01 read per distinct `client_id`.

### 3.2 Scope validation (for IAM-02)

`POST /internal/acc1/scope-validate` — `{ client_id, master_account_id?, subaccount_id? }` ⇒ `{ consistent: bool, subaccount_status?: string, reason?: code }`. Answers *only* "does this triple exist, is it internally consistent, is it not `closed`". **It is not a permission decision** and returns no account detail on inconsistency.

### 3.3 Open accounts (for CLT-01 closure guard — DCR-ACC-CLT-01)

`GET /internal/acc1/clients/{client_id}/open-accounts` ⇒ `{ client_id, non_closed_master_accounts: n, non_closed_subaccounts: m, blocking_restrictions: k }`. CLT-01 must refuse `closed` unless the response is affirmative and both counts are `0`; an unavailable response blocks.

### 3.3a Reconciliation extract (file 13)

`GET /internal/acc1/reconciliation/extract?as_of=&after=&limit=` — keyset-paged read of `(subaccount_id, master_account_id, client_id, status, version)`; no PII.

### 3.4 Health

`GET /internal/acc1/health`, `GET /internal/acc1/readiness` — **readiness validates configuration and contract only, never peer liveness** (RF-10): DB reachable, migration state, required configuration present and valid (`ACC1_MAX_SUBACCOUNTS_PER_MASTER`, `ACC1_ATTESTATION_MAX_AGE_SECONDS`, `ACC1_CHANGE_REQUEST_TTL`, unique consumer secrets, dedicated CLT-01/IAM-02 credentials set), peer base URLs set, and each peer's declared contract version from configuration. It **makes no outbound call to CLT-01, IAM-02, LED-01 or SEC-01**, so a peer outage cannot prevent boot and two services cannot deadlock on each other's readiness.

## 4. Sensitivity and rate limits

| Family | Limit basis |
|---|---|
| Staff mutation | FND-01 rate-limit engine, actor subject |
| Internal resolve | Per-caller-module; generous; alarmed rather than blocked (hot path of ledger/order/withdrawal) |
| Client routes | FND-01 rate-limit engine with ACC-01 consumer secret **before** exposure; still subject to `FND-FIND-001` — no internet exposure until the public-perimeter finding is resolved (DCR-ACC-FND-01) |

## 5. Client routes — deferred (phase 6, not designed to implementation depth)

`GET /acc1/client/master-accounts`, `GET /acc1/client/subaccounts/{subaccount_id}` — **read-only**, resolved by:

1. IAM-01 internal session introspection (accepted, DEC-008) → authenticated `user_id`, `userClass ∈ {client, client_approver}`;
2. CLT-01 `GET /internal/clt1/principals/{iam_user_id}/client-memberships` → the client(s) the principal genuinely governs (a `client_id` query is a *selector only*, never authority);
3. IAM-02 permission and, once built, subaccount-scoped grants (narrowing-only).

Every "no authority" state is observationally identical (`200`, empty list / `404`) — never an existence oracle. Client-initiated requests to create a subaccount are **not** in v0.1 (HD-6).

## 6. Idempotency and replay

Same `Idempotency-Key` + same `requested_by` + same body hash ⇒ original response; same key, different body ⇒ `ACC1_IDEMPOTENCY_CONFLICT`. Replaying `apply` on an `applied` request returns the recorded result and performs no second mutation. Two concurrent applies cannot both pass IAM-02 `execute-verify` (single-use token) and serialise on the row lock. After a failure following a successful verify, the request stays `requested` and a **fresh** IAM-02 approval is required (file 02 §2 step A5).
