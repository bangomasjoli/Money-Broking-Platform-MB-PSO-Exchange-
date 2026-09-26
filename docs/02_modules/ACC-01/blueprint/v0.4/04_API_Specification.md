# ACC-01 Account Structure
## 04 API Specification (v0.4)

## 1. Principles

1. All routes use the FND standard envelope (`successEnvelope`, request ID, correlation ID) and standard errors (file 09).
2. Three route families with different trust models:
   - **Staff routes** `/acc1/*` — IAM-01 session + IAM-02 permission guard. **Under current IAM-02 the guard on approval-gated actions is not an entitlement check and the apply actor is not proven to be the maker (file 02 §0); governed routes refuse `ACC1_DEPENDENCY_NOT_SATISFIED` until `DEP-IAM-ENTITLEMENT` and `DEP-IAM-ACTOR-BINDING` are evidenced **per call by IAM-02 itself — never by a configured contract version** (file 01 §4.5) — in every environment, with no environment logic.**
   - **Internal routes** `/internal/acc1/*` — service-to-service, guarded by **per-consumer-module capability secrets**; the caller module is derived from *which secret matched*, never from a header (FND rate-limit engine precedent). Never internet-exposed. **ACC-01 itself never holds CLT-01's or IAM-02's general internal credential, in any environment** (ACC-REQ-031, ACC-R2-HD-08): it uses dedicated read/verify-scoped credentials (DCR-ACC-CLT-03, DCR-ACC-IAM-05) or explicit labelled test doubles; every CLT-01 status read — resolve, batch, submit, apply, reconciliation R-3 — goes through the one read-scoped client.
   - **Client routes** `/acc1/client/*` — **deferred** (phase 6); membership-scoped; see §5.
3. Every mutation requires `Idempotency-Key`. Mutable rows use optimistic `version`; a stale write ⇒ 409 `ACC1_VERSION_CONFLICT`.
4. **No route path contains** `exchange`, `order-book`, `orderbook`, `matching-engine`, `matching_engine`, `market-maker`, `market_maker`, `market-making`, `principal-dealing`, `principal_dealing`, `spread-markup`, `spread_markup`, `maker-taker`, `maker_taker` or `client-to-client` — the boot-time `assertNoExchangeRuntime` guard would refuse to start the service (ACC-REQ-034). Route names below are chosen accordingly (`scope-validate`, not anything containing a prohibited fragment).
5. Responses never contain another client's identifiers. Staff reads that span clients (`?client_id=`) are sensitive-read-logged (file 08).
6. **No API accepts `client_id` for a subaccount.** Subaccount ownership is derived from the master.
7. All mutating staff routes are (a) maker-checker `requires_approval` change requests, (b) **maker-only, entitlement-checked, audited closure initiation** (ACC-R3-HD-02, §2.4), (c) machine-verified evidence collection and completion (§2.4), or (d) explicitly non-governed (profile update). There is no direct "create account" or "set status" route.

## 2. Staff routes (`/acc1/*`)

### 2.1 Change requests (the maker-checker way to create, seal, abort, restrict, lift or cancel)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/acc1/change-requests` | per change type (§2.1.1) | Submit a governed change request → `201`, status `requested` |
| GET | `/acc1/change-requests/{change_request_id}` | `acc1.change_request.read` | Read request and status |
| GET | `/acc1/change-requests` | `acc1.change_request.read` | List (`status`, `change_type`, `client_id`, paging) |
| POST | `/acc1/change-requests/{change_request_id}/apply` | per change type | Apply with IAM-02 decision token (file 02 §2). The authenticated caller is the IAM-01 session principal |
| POST | `/acc1/change-requests/{change_request_id}/cancel` | `acc1.change_request.cancel` | Maker's own request only, while `requested`: the session principal must equal `requested_by` (`ACC1_ACTOR_BINDING_MISMATCH` otherwise). Not to be confused with cancelling a *restriction* (`cancel_scheduled_restriction`) |

#### 2.1.1 Submit body by `change_type`

| change_type | Body (in addition to `change_type`) | Permission |
|---|---|---|
| `create_master_account` | `client_id`, `display_name`, `description?` | `acc1.master_account.create` |
| `create_subaccount` | `master_account_id`, `purpose`, `name`, `description?` | `acc1.subaccount.create` |
| `apply_restriction` | `master_account_id` **or** `subaccount_id`, `kind`, `scopes[]`, `source_type`, `source_ref?`, `reason_code`, `effective_from?`, `effective_until?` | `acc1.restriction.apply` |
| `lift_restriction` | `restriction_id`, `lift_evidence_ref`, `reason_code` | `acc1.restriction.lift` |
| `cancel_scheduled_restriction` **(R2-F07)** | `restriction_id`, `reason_code`, `cancel_evidence_ref?` (required for authority sources) | `acc1.restriction.cancel` |
| `seal_closure` **(R2, R3)** | `master_account_id` **or** `subaccount_id`, `closure_change_request_id` (the maker-only initiation). ACC-01 builds the canonical payload and **pins** into it: the target `version`, `closure_cycle`, the initiation id, per attester the **`readiness_id`, `readiness_seq`, `journal_watermark` (W_pre) and `readiness_payload_hash`** of the latest ready row, for a master-directed child the `closure_family_id`, and for a master the **`family_set_hash`** (each master-directed member's id, membership, `closure_cycle`, `closure_seal_version`, `closure_sealed_at_version`, pinned readiness ids, latest attestation ids). **The checker's approval of this request is the ONE final human approval for that target** | `acc1.master_account.close_seal` / `acc1.subaccount.close_seal` |
| `abort_closure` **(R2, R3)** | `master_account_id` **or** `subaccount_id`, `reason_code` (closed set, file 02 §7.7), `evidence_ref?`; a **master** abort binds the `closure_family_id` and every participating member (id, `closure_cycle`, `closure_seal_version`) and may cite evidence of the master, the default or any master-directed child (never an independent child); a subaccount abort is legal only for an **independent** closure | `acc1.master_account.close_abort` / `acc1.subaccount.close_abort` |

`additionalProperties: false` on every body. Submit validates shape and cheap preconditions only; **all preconditions are re-checked at apply** (file 02 §2 step A4). Response: `{ change_request_id, status, approval_payload, payload_hash, expires_at_utc }`. `approval_payload` is the **canonical payload** the operator must submit verbatim as `payload` to IAM-02's existing `POST /iam2/approvals/request` (`{ maker_user_id, action, resource, entity_id, client_id, payload }`, with `entity_id = change_request_id`). **IAM-02 computes its own fingerprint** of that payload; ACC-01 never sends a hash to IAM-02 and does not call the approval routes. `payload_hash` is `"sha256:" + 64 hex` (71 chars, `@aix/foundation` `fingerprint`).

Apply body: `{ decision_token, approval_id }` plus the caller's **IAM-01 session / recent-auth reference as received** (a header, forwarded unchanged — ACC-01 never mints, signs or transforms an identity assertion). **(R2-F04, R3-F04, ACC-R2-HD-07)** ACC-01 does **not** claim that today's `execute-verify` proves the authenticated caller is the maker or verifies `approval_id` (file 02 §0). Real governed apply requires the IAM-02 **actor-binding contract** (`DEP-IAM-ACTOR-BINDING`, DCR-ACC-IAM-06), in which **IAM-02 verifies the actor from an authority outside ACC-01's body assertion** (IAM-01 session reference, recent-auth reference or an IAM-01-produced verifiable assertion, validated through IAM-02's own trusted seam), and whose response ACC-01 consumes as **attested facts**; an assertion minted by ACC-01 itself does **not** satisfy the dependency. The proposed target binds at least:

| Bound / returned by IAM-02 | Used by ACC-01 |
|---|---|
| `actor_assertion_authority` **(R3)** | recorded; must name an authority **other than ACC-01** (the one IAM-02 verified the actor against) |
| `approval_id` | recorded (`approval_id_source = iam2_attested`); body value must equal it |
| `authenticated_actor_id` | must equal `maker_user_id` and the stored `requested_by` |
| `maker_user_id` | must equal stored `requested_by` |
| checker/approver identity | recorded (`approver_user_id`); must differ from the maker |
| `policy_id` | recorded (`approval_policy_id`) |
| entitlement evidence **(R3)** | per role (`maker`, `checker`; `initiator` for initiation): `{ evaluated: true, actor_id, permission_code, decision: "allow", grant_ref, policy_id, evaluated_at }`; each must be for the identified actor and the expected `acc1.*` code; recorded as `entitlement_evidence_ref` |
| `credential_scope` **(R3)** | the scope of the credential ACC-01 presented; must be the narrow scope (`DEP-IAM-SCOPED-CREDENTIAL`) |
| `payload_hash` | must equal the hash ACC-01 recomputed from the **stored** payload (`current_payload_hash`) |
| `action`, `resource` | must equal the request's `acc1.*` code and resource |
| entity/client scope (`entity_id` = `change_request_id`, `client_id`) | must equal the request |

ACC-01 never sends a caller-supplied `actor_id` as proof, and a response that omits any bound field, entitlement block or the scope statement is refused **before** ACC-01's transaction. As **local defence in depth** the IAM-01 session principal must equal `requested_by` (`ACC1_ACTOR_BINDING_MISMATCH`, Critical audit, both identities audited); this does not lift the dependency. Until the owning IAM-02 change exists, governed apply returns `ACC1_DEPENDENCY_NOT_SATISFIED` (`DEP-IAM-ACTOR-BINDING`). ACC-01 recomputes `payload_hash` from the **stored** payload. Response: the resulting resource summary (`master_account_id` and the default `subaccount_id`, or `subaccount_id`, or `restriction_id`). Dependency refusals name the dependency id and the evidence `provider` (`real`/`test_double`) — never environment names (file 01 §4.5).

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

### 2.4 Closure: maker-only initiation, evidence collection and completion (preventive sequence — file 02 §7)

Closure **initiation** is a **maker-only, entitlement-checked, audited** action (ACC-R3-HD-02) — not a change request and not maker-checker. **Seal** and **abort** are governed change requests (§2.1.1). The routes below initiate, collect machine evidence and perform machine-verified completion:

| Method | Path | Permission | Effect |
|---|---|---|---|
| GET | `/acc1/master-accounts/{id}/close/preview` | `acc1.master_account.close_initiate` | **(R3)** Lists every non-closed subaccount (default included; id, `version`, status; whether it is already in an independent closure) and returns the `family_set_hash`. Read-only |
| POST | `/acc1/master-accounts/{id}/close/initiate` | `acc1.master_account.close_initiate` | **(R3)** Body `{ reason_code, family_set_hash }`. Atomically moves the master, its default and every operational child to `closing` under a new `closure_family_id`; independent closures are recorded and left untouched. Mismatch ⇒ `ACC1_CLOSURE_FAMILY_SET_CHANGED` |
| POST | `/acc1/subaccounts/{id}/close/initiate` | `acc1.subaccount.close_initiate` | **(R3)** Body `{ reason_code }`. A **non-default** subaccount under an operational master enters `closing` as an **independent closure**; the default ⇒ `ACC1_DEFAULT_SUBACCOUNT_PROTECTED` |
| POST | `/acc1/master-accounts/{id}/close/readiness` | `acc1.master_account.close_collect_evidence` | Collect **pre-seal readiness** from every configured attester (target `closing`); append `closure_readiness` rows. A row the database refuses (target no longer `closing`) ⇒ `ACC1_CLOSURE_READINESS_REFUSED` and is not recorded |
| POST | `/acc1/subaccounts/{id}/close/readiness` | `acc1.subaccount.close_collect_evidence` | Same |
| POST | `/acc1/master-accounts/{id}/close/attestation` | `acc1.master_account.close_collect_evidence` | Collect the **post-barrier attestation** (target `closure_sealed`), sending the **pinned** `preseal_watermark_ref`; append `closure_attestation` rows |
| POST | `/acc1/subaccounts/{id}/close/attestation` | `acc1.subaccount.close_collect_evidence` | Same |
| POST | `/acc1/master-accounts/{id}/close/complete` | `acc1.master_account.close_complete` | **(R3)** `closure_sealed → closed` — machine-verified, **atomic family completion** when the master has a family: closes every master-directed child, the default and the master in one transaction |
| POST | `/acc1/subaccounts/{id}/close/complete` | `acc1.subaccount.close_complete` | Compare-and-set for an **independent** subaccount only. A master-directed child (default included) ⇒ `ACC1_CLOSURE_FAMILY_MEMBER` |

`close_initiate`, `close_collect_evidence` and `close_complete` are **non-approval** codes, so the baseline check reaches guard step 10 — a **real** entitlement — unlike the approval-gated codes (file 07 §2). **No approval-gated code is used for initiation** (so the `approval_required` short-circuit of `IAM2-FIND-002` cannot bypass the maker's entitlement). Initiation additionally needs the attested maker-initiation decision (DCR-ACC-IAM-07; file 01 §4.5); until it exists **real initiation is externally gated**. Bodies carry `Idempotency-Key`; readiness/attestation/complete carry `{ closure_change_request_id }`. Collection is repeatable (latest row wins until the seal; thereafter the pin governs). **There is no `/seal` or `/unseal` route**: sealing is the applied `seal_closure` request carrying the final human approval, and recovery is the applied `abort_closure` request (the barrier is cleared nowhere else).

**Complete (independent)** requires status `closure_sealed` **and** `closure_barrier = true` **and** the **latest** attestation of **every** configured attester `clear` at the current `closure_seal_version`, `binding_ok`, with `committed_after_preseal_watermark = 0`, `max_resolution_version_committed < closure_sealed_at_version`, `in_flight_status ∈ {none, refused_by_fence}`, `balance_state ∈ {none, returned}`, `open_item_count = 0`, `preseal_watermark_ref` equal to the **pinned** readiness watermark (never "the latest readiness") and `as_of` within `ACC1_ATTESTATION_MAX_AGE_SECONDS` (secondary guard); it is a compare-and-set on the sealed state, with **no second checker**. **Complete (master family)** applies the same checks to the master **and to every master-directed child against that child's own pin**, plus equality of the recomputed `family_set_hash` with the master's pinned hash, in **one** transaction under the master-then-children lock order; a failure rolls all of it back. On `ACC1_CLOSURE_BLOCKED` the body lists per-attester and per-member outcome codes and every member **remains `closure_sealed`** (still barred; the governed abort is available).

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
    "restriction_status": { "master_account": "active", "subaccount": "active" },
    "effective_status": "active",
    "closure_barrier": false,
    "closure_draining": false,
    "closure": {
      "closure_seal_version": { "subaccount": 0, "master_account": 0 },
      "closure_sealed_at_version": { "subaccount": null, "master_account": null },
      "closure_cycle": { "subaccount": 0, "master_account": 0 },
      "closure_initiation_id": { "subaccount": null, "master_account": null }
    },
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
- **Consumer evaluation order (normative — ACC-R2-HD-05; file 01 §10, file 06 §2.0):** (1) **`closure_barrier`** — `true` ⇒ the caller **denies every** transaction-producing activity, absolutely, **independently of `effective_status`** (which may read `frozen`, `suspended`, `restricted` or anything else; a more severe descriptive status never masks the barrier); (2) **structural status and restrictions, conjunctive over components** (`client_status`, master and subaccount stored status **and** `restriction_status`), with the closure-drain allow-list as the only narrowing exception when `closure_draining = true`; (3) product/activity policy. `effective_status` is descriptive. `blocked_scopes` is **explanatory evidence only** (`scope_semantics`), never an allow/deny list. There is deliberately **no** `permitted`/`allowed`/`enabled` field.
- `closure_barrier` is the authoritative independent fact (stored, file 05 §2.1): `true` if the subaccount **or** its master carries the barrier. `closure_draining` is `true` if either is `closing`. `closure` carries the seal/cycle evidence per level and the **closure initiation id** per level (the discriminator for CDA-1: a consumer binds a closure balance return to it, R3-F07.3). Family membership and pins are **not** exposed to consumers. `restriction_status` is the time-effective projection per level, kept separate from lifecycle.
- `applied_restriction_ids` lists every restriction counted as in force at evaluation, **evaluated by time** (`effective_from_utc <= clock_timestamp()`, database clock), whether or not housekeeping has advanced its stored state; `versions` are the consumer decision evidence (RF-08).
- **Requires an explicit `subaccount_id`.** There is no resolve by client or by master default; `is_default` is **not** returned.
- Requires `DEP-CLT-READ-SCOPE`: the CLT-01 status response must **state** that it was served to the narrow read scope; a response without that statement, or with another scope, makes the answer `unknown`/503 — there is no fallback to a broader token, and "the token worked" is not evidence.
- HTTP 404 `ACC1_SUBACCOUNT_NOT_FOUND` for an unknown identifier (internal callers only; this is not a client-facing existence oracle).
- HTTP 503 `ACC1_SERVICE_UNAVAILABLE` when ACC-01's own DB is unavailable — never degrades to an empty-but-200 answer; callers fail closed on 503 (CLT-01 principal-membership precedent).
- Response omits display names, descriptions and `is_default`.

`GET /internal/acc1/master-accounts/{master_account_id}/resolve` — same shape without subaccount fields (`closure_barrier`, `closure_draining`, `closure`, `restriction_status.master_account`), plus `subaccount_counts` by status.

`POST /internal/acc1/subaccounts/resolve-batch` — `{ subaccount_ids: [≤ 100] }` ⇒ per-id results (`not_found` items explicit); one CLT-01 read per distinct `client_id`.

### 3.2 Scope validation (for IAM-02)

`POST /internal/acc1/scope-validate` — `{ client_id, master_account_id?, subaccount_id? }` ⇒ `{ consistent: bool, subaccount_status?: string, reason?: code }`. Answers *only* "does this triple exist, is it internally consistent, is it not `closed`". **It is not a permission decision** and returns no account detail on inconsistency.

### 3.3 Open accounts (for CLT-01 closure guard — DCR-ACC-CLT-01)

`GET /internal/acc1/clients/{client_id}/open-accounts` ⇒ `{ client_id, non_closed_master_accounts: n, non_closed_subaccounts: m, blocking_restrictions: k }`. CLT-01 must refuse `closed` unless the response is affirmative and both counts are `0`; an unavailable response blocks.

### 3.3a Reconciliation extract (file 13)

`GET /internal/acc1/reconciliation/extract?as_of=&after=&limit=` — keyset-paged read of `(subaccount_id, master_account_id, client_id, status, version)`; no PII.

### 3.4 Health

`GET /internal/acc1/health`, `GET /internal/acc1/readiness` — **service readiness validates ACC-01's own configuration only, never peer liveness or peer contract** (RF-10): DB reachable, migration state, required configuration present and valid (`ACC1_MAX_SUBACCOUNTS_PER_MASTER`, `ACC1_ATTESTATION_MAX_AGE_SECONDS`, `ACC1_CHANGE_REQUEST_TTL`, unique and mutually distinct consumer secrets and dedicated credentials), peer base URLs set. **(R3)** It **never reports a `DEP-*` as satisfied**: runtime dependencies appear as `VERIFIED_PER_OPERATION` and governance-only ones as `HARD_UNSATISFIED`; it reports no "declared contract version" as evidence. It contains **no environment-based branch** (ACC-REQ-035). It **makes no outbound call to CLT-01, IAM-02, LED-01 or SEC-01**, so a peer outage cannot prevent boot and two services cannot deadlock on each other's readiness.

## 4. Sensitivity and rate limits

| Family | Limit basis |
|---|---|
| Staff mutation | FND-01 rate-limit engine, actor subject |
| Internal resolve | Per-caller-module; generous; alarmed rather than blocked (hot path of ledger/order/withdrawal) |
| Client routes | FND-01 rate-limit engine with ACC-01 consumer secret **before** exposure; **`DEP-PUBLIC-PERIMETER` is hard-unsatisfied in code and the client routes are not served** until `FND-FIND-001` is closed by an authoritative record and an approved ACC-01 task lifts the gate (DCR-ACC-FND-01) |

## 5. Client routes — deferred (phase 6, not designed to implementation depth)

`GET /acc1/client/master-accounts`, `GET /acc1/client/subaccounts/{subaccount_id}` — **read-only; not served while `DEP-PUBLIC-PERIMETER` is hard-unsatisfied**; when lifted, resolved by:

1. IAM-01 internal session introspection (accepted, DEC-008) → authenticated `user_id`, `userClass ∈ {client, client_approver}`;
2. CLT-01 `GET /internal/clt1/principals/{iam_user_id}/client-memberships` → the client(s) the principal genuinely governs (a `client_id` query is a *selector only*, never authority);
3. IAM-02 permission and, once built, subaccount-scoped grants (narrowing-only).

Every "no authority" state is observationally identical (`200`, empty list / `404`) — never an existence oracle. Client-initiated requests to create a subaccount are **not** in this version (HD-6).

## 6. Idempotency and replay

Same `Idempotency-Key` + same `requested_by` + same body hash ⇒ original response; same key, different body ⇒ `ACC1_IDEMPOTENCY_CONFLICT`. Replaying `apply` on an `applied` request returns the recorded result and performs no second mutation. Two concurrent applies cannot both pass IAM-02 `execute-verify` (single-use token) and serialise on the row lock. After a failure following a successful verify, the request stays `requested` and a **fresh** IAM-02 approval is required (file 02 §2 step A5). `cancel` and `apply` are both bound to the IAM-01 session principal = `requested_by` (defence in depth, §2.1).
