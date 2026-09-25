# ACC-01 Account Structure — Master Account & Subaccount
## 01 Module Blueprint

**Status: PLANNED / AWAITING REVIEW. Planning only — no code, no migration.**

## 1. Purpose

ACC-01 is the **account layer between the legal entity and the ledger** (`DEC-011`: *"the account layer between the entity and the ledger, not the entity"*). It provides:

1. Master Account identity and lifecycle.
2. Subaccount identity and lifecycle.
3. Explicit, immutable legal-entity ownership of both.
4. A live **resolution seam** that tells any consuming module which legal entity, master account and subaccount an activity belongs to, and whether that structure is currently usable.
5. The governed registry that subaccount-scoped permissions (IAM-02 extension) and subaccount-scoped eligibility (CFG-01 condition 9) refer to.

ACC-01 is a **structural** module. It never moves, holds, reserves, prices or reports money, and it never decides whether a person or a product may act.

## 2. Ownership boundary

| Concern | Owner | ACC-01's relationship |
|---|---|---|
| Legal entity, client identity, client status/class | **CLT-01** (sole) | Consumes: reads status/class via `GET /internal/clt1/clients/:client_id/status` (exists) |
| Membership / authorised principals | **CLT-01** (sole), bound to IAM via `iam_user_id` (migration 067) | Consumes only. **Never creates a second membership system** (`DEC-011` rule 4) |
| Master account, subaccount: identity, status, restriction state, closure | **ACC-01** (sole) | Owns |
| Ledger account, balances, journals, postings, holds, safeguarding | **LED-01** (sole) | Never stores or mirrors. LED-01 references `subaccount_id` |
| Permission evaluation, roles, approvals, SoD, scope *grants* | **IAM-02** | Registers permission codes; consumes guard and approval flow; provides scope-*validation* only |
| Capability evaluation (product, environment, asset, activation gate) | **CFG-01** (sole) | Supplies account/subaccount status as an input; **never** evaluates a capability |
| Audit evidence | **SEC-01** | Emits |
| Wallet/payout destinations | **WLT-01** | Provides the subaccount a destination may be scoped to; no destination data |
| Freeze/restriction *policy* and triggers (WF-26) | Compliance workflow (CLT-01/AML-01/INC-01 side) | ACC-01 **applies and records** an approved restriction on an account; it does not decide that one is warranted |

**Never in ACC-01:** legal name, registration number, UBO, mandate, KYC/AML outcome, credentials, API keys, wallet addresses, any monetary amount, any balance, any ledger identifier, any product/asset eligibility flag.

## 3. Hierarchy and the three dimensions

```txt
clt1.client_profile.client_id            legal owner          "whose money"          (CLT-01)
  └── acc1.master_account.master_account_id                    operational container  (ACC-01)
        └── acc1.subaccount.subaccount_id  operational scope   "which pocket"         (ACC-01)
              └── led1.ledger_account.account_id  accounting destination "where it posts" (LED-01)
```

Per `DEC-011` §4.10, `client_id`, `subaccount_id` and `ledger_account_id` are **different dimensions**. ACC-01 never lets one stand in for another: `client_id` is never a subaccount identifier, and a subaccount identifier is never a ledger identifier.

## 4. Requirement register

Every requirement traces to a source. `DEC-011 #n` = decision pack §4.9 item *n*.

### 4.1 Identity and ownership

| ID | Requirement | Source |
|---|---|---|
| ACC-REQ-001 | A master account has a stable identifier independent of `client_id` | DEC-011 #1 |
| ACC-REQ-002 | A subaccount has a stable identifier independent of `client_id` and of its master account identifier | DEC-011 #1 |
| ACC-REQ-003 | Every master account records exactly one legal-entity owner (`client_id`) | DEC-011 #2 |
| ACC-REQ-004 | Every subaccount belongs to exactly one master account and carries the same `client_id`; the invariant is **structurally enforced**, not application-checked | DEC-011 #2, #3 |
| ACC-REQ-005 | A subaccount is not a legal client: it has no client profile, KYC/KYB, mandate or membership of its own and inherits legal ownership | Doc 00 §2C rule 2; DEC-011 |
| ACC-REQ-006 | `client_id` and `master_account_id` are immutable for the life of the row | DEC-011 #5 (see §9 for the deliberate strengthening) |
| ACC-REQ-007 | No monetary amount, balance, holding or ledger identifier is stored in ACC-01 | DEC-011 #13; Module Index §19 rule 1 |
| ACC-REQ-008 | The entity→master-account relationship is one-to-many capable in the schema; the initial *policy* limit is configuration, not structure | DEC-011 #14; Doc 00 §2C rule 3 |
| ACC-REQ-009 | ACC-01 exposes identifiers LED-01 can reference; ACC-01 never references ledger accounts | DEC-011 layer 5; Module Index |

### 4.2 Lifecycle

| ID | Requirement | Source |
|---|---|---|
| ACC-REQ-010 | Master account lifecycle states and legal transitions are defined and DB-enforced (file 06) | DEC-011 #4 |
| ACC-REQ-011 | Subaccount lifecycle states and legal transitions are defined and DB-enforced | DEC-011 #4 |
| ACC-REQ-012 | Master/subaccount creation, closure and restriction changes occur only through a governed change request with IAM-02 maker-checker and execute-verify | DEC-011 #7; Module Index rule 10; Role Matrix §23 |
| ACC-REQ-013 | A master account may be created only for a client that is `active` or `active_limited` **and** whose class is institutional, HNWI or professional; any other status, class, or an unreadable CLT-01 fails closed | Doc 00 §10.2A retail lock; System Rules fail-closed; CLT-01 `active_limited` non-transactional |
| ACC-REQ-014 | Effective status is computed live from client, master and subaccount state; any unreadable input yields `unknown`, which consumers must treat as deny | Doc 00 §21 rule 1, condition 9 |
| ACC-REQ-015 | Restrictions (partial, suspension, full freeze) can be applied to a master account or one subaccount and lifted, both under maker-checker, with the FRZ-RULE-002 scopes that apply to accounts | FRZ-RULE-001/002; WF-26; Role Matrix §23 |
| ACC-REQ-016 | Closure is two-phase (`closing` → `closed`), blocked until readiness attestations clear, and terminal (no reopen, no identifier reuse) | OFF-RULE-001; WF-27 |
| ACC-REQ-017 | No account row is ever hard-deleted | DEC-011 #6 (audit); retention |
| ACC-REQ-018 | A master account has a default subaccount so that LED-01 always has a subaccount to reference (subject to HD-1) | Decision pack §4.7 "single default subaccount provisioned initially" |

### 4.3 Permissions and eligibility

| ID | Requirement | Source |
|---|---|---|
| ACC-REQ-019 | Permission codes `acc1.*` are registered in the IAM-02 catalogue; default deny; `licence_locked = false` (CFG-01 F-1 lesson) | Role Matrix §3.1; migration 022 precedent |
| ACC-REQ-020 | ACC-01 supplies a scope-*validation* seam for narrowing-only subaccount-scoped grants; IAM-02 owns the grant model and enforcement | DEC-011 #8; Role Matrix §5.2A, §30 item 19 |
| ACC-REQ-021 | A permission grant, a subaccount purpose, or an account status never activates a capability; ACC-01 exposes status as a *conjunct input* only | DEC-013; DEC-014; Role Matrix §3.7; Module Index rule 11 |
| ACC-REQ-022 | Client-facing reads are membership-scoped; a foreign or unknown account is observationally identical to "no access" | CLT-01 principal-membership seam precedent; Role Matrix §5.1 |
| ACC-REQ-023 | Maker ≠ checker; the approval is bound to the exact request payload hash | Role Matrix §3.4; IAM-02 execute-verify |

### 4.4 Audit, integration, environment

| ID | Requirement | Source |
|---|---|---|
| ACC-REQ-024 | Every creation, state change, restriction, lift, closure step and blocked ownership mutation emits SEC-01 audit; a state-changing action fails closed if its audit cannot be recorded | DEC-011 #6; Module Index rule 9 |
| ACC-REQ-025 | Status history is append-only and gap-free relative to the stored status | Reconciliation (file 13) |
| ACC-REQ-026 | Every audit record and every resolve response carries the evaluating environment | Role Matrix §3.8 rule 5 |
| ACC-REQ-027 | A resolve seam returns `client_id`, `master_account_id`, `subaccount_id`, purpose, own status, effective status, blocked scopes, and version evidence | DEC-011 #9–#12 |
| ACC-REQ-028 | A batch resolve seam exists for high-volume consumers | Performance |
| ACC-REQ-029 | An open-accounts seam lets CLT-01 refuse client closure while non-closed accounts exist | OFF-RULE-001; DCR-ACC-CLT-01 |
| ACC-REQ-030 | Closure requires readiness attestation from LED-01 (and later WLT-01/others); an absent or unreachable attester blocks closure (fail closed) | OFF-RULE-001 items 1–5 |
| ACC-REQ-031 | Internal seams are guarded by per-consumer-module capability secrets; the caller module is recorded | FND rate-limit engine precedent; FND-FIND-001 posture |
| ACC-REQ-032 | A read-only reconciliation extract supports LED-01/REC-01 structural reconciliation | DEC-011 #12 |
| ACC-REQ-033 | Standard FND envelope, request/correlation IDs, idempotency keys on mutations | CLT-01 04 §1 |
| ACC-REQ-034 | No route path contains a fragment rejected by `assertNoExchangeRuntime` | `no-exchange.ts` (15 fragments incl. `exchange`); Module Index rule 5A |
| ACC-REQ-035 | Behaviour is identical in DEVELOPMENT, TEST, UAT, DEMO and PRODUCTION; an unknown environment is treated as PRODUCTION | DEC-013 clause 2; Doc 00 §21A rule 7 |
| ACC-REQ-036 | No column, flag or field in ACC-01 is named or used as an `enabled` capability boolean | DEC-013 clause 2; DEC-014 |
| ACC-REQ-037 | The model supports wallet-destination scoping (WLT-01), ledger posting (LED-01), Spot / OTC / Pay / RWA attribution and reconciliation (REC-01) **without** coupling to any product | DEC-011 #9–#12 |

## 5. Identifiers

| Identifier | Format | Properties |
|---|---|---|
| `master_account_id` | `mac_` + 24 lowercase hex (96 random bits) | Opaque, immutable, unique, generated by ACC-01, **not derived from `client_id`**, never reused |
| `subaccount_id` | `sac_` + 24 lowercase hex | Same; not derived from master or client identifier |
| `change_request_id` | `acr_` + 24 lowercase hex | Governed change-request handle |
| `restriction_id` | `rst_` + 24 lowercase hex | Restriction record handle |

Rules: DB `CHECK` on format; random from the platform CSPRNG (not a sequence, so counts and creation order are not inferable); internal `id uuid` primary keys are never exposed. Human-facing account numbers or IBAN-style references are **not** designed here (open question OQ-05); if introduced they are display aliases and never authority.

## 6. Cardinality and limits

| Relationship | Schema | Initial policy (configuration, not schema) |
|---|---|---|
| Legal entity → master accounts | one-to-many capable (no unique on `client_id`) | `ACC1_MAX_MASTER_ACCOUNTS_PER_CLIENT` = **1** (`DEC-011`: "may initially have exactly one") |
| Master account → subaccounts | one-to-many | `ACC1_MAX_SUBACCOUNTS_PER_MASTER` — value **to be decided** (HD-3); counts non-closed subaccounts |
| Master account → default subaccount | at most one (`is_default`) | one auto-created (HD-1) |
| Subaccount → ledger accounts | LED-01's concern | — |

Limits are enforced inside the creation transaction under a per-`client_id` `pg_advisory_xact_lock`, so two concurrent approved creations cannot both pass a limit of 1. Raising a limit is a configuration change through the platform configuration path, **never** a schema change — which is exactly what makes the one-to-many transition non-migratory.

## 7. Master account lifecycle (summary — file 06 is authoritative)

`active` → `restricted` | `suspended` | `frozen` → `active` (on lift) ; `active`/`restricted`/`suspended`/`frozen` → `closing` → `closed` (terminal).

- No `pending` state on the row: a proposed account exists only as a **change request** until an approved apply creates it `active`. This avoids half-created financial structure and keeps every account row backed by an approval.
- A master account cannot enter `closing` while any of its subaccounts is not `closed`, unless the closure request covers all of them (cascade closure is a single governed request; each subaccount is individually attested).
- `closed` is terminal and identifiers are never reused.

## 8. Subaccount lifecycle (summary)

Same six states. A subaccount is created only under an existing, `active`-or-`restricted` master account whose own effective status permits creation (not `suspended`/`frozen`/`closing`/`closed`). The default subaccount cannot be closed independently of its master account (`ACC1_DEFAULT_SUBACCOUNT_PROTECTED`).

`purpose` ∈ `general` · `trading` · `treasury` · `payments` · `rwa` (`DEC-011` names Trading, Treasury, Payments, RWA; `general` is the default holder, HD-8). Purpose is **immutable** and is a **classification label only** (§11.3).

## 9. Legal-entity ownership and immutability

`DEC-011` #5 requires ownership to be *immutable after financial activity absent a governed migration path*. ACC-01 cannot observe financial activity (that is LED-01's), and a rule that depends on a cross-module signal is a race. This pack therefore **strengthens** the requirement:

1. `client_id` and `master_account_id` are immutable **from creation**, enforced three ways: column-level `UPDATE` grants exclude them; a `BEFORE UPDATE` trigger rejects any change; the composite foreign key ties a subaccount to its master's owner.
2. A wrongly-created account is corrected by governed **closure and re-creation**, never by editing the owner. Because creation carries no financial activity, closure readiness clears trivially.
3. **No ownership-transfer or account-migration path is designed.** Legal-entity succession, merger and re-papering of client money are regulated events touching safeguarding evidence (`A2-Q2`); they need their own governed design (OQ-01). Until then an attempted ownership change is refused, audited as Critical (`acc1.ownership_change_blocked`), and never partially applied.

## 10. Effective status

Stored status is **own-level only**. A subaccount's *effective* status is computed at read:

```txt
effective(subaccount) = worst( client-derived , master.status , subaccount.status )
blocked_scopes        = union of scopes implied by each level's status and active restrictions
```

- Precedence `closed > frozen > suspended > closing > restricted > active`; any unreadable input (CLT-01 unreachable, row missing, malformed) → `unknown`.
- The client-derived mapping and the scope semantics are in file 06 §5.
- **No fan-out writes.** Restricting a master does not update its subaccounts' rows; lifting it restores them exactly, with no stale child state and no partial-cascade failure mode.
- The resolver returns the version evidence tuple `(client_status, master_version, subaccount_version)` so a consuming module can store *which account state it decided against*.

## 11. Subaccount scoping

### 11.1 What ACC-01 provides (registry side)

- A stable, validated `(client_id, master_account_id, subaccount_id)` triple.
- `POST /internal/acc1/scope-validate`: for IAM-02, "does this triple exist, is it internally consistent, and is the subaccount not `closed`?" — never a permission decision.
- The `resolve` seam for eligibility inputs (CFG-01 condition 9).

### 11.2 What ACC-01 does **not** provide

- Role grants, scope grants, or their storage (`iam2.user_role` has a `client_id` column that is never written or read today — `DEC-011` decision pack §4.4; `IAM2-FIND-002`).
- Enforcement of narrowing-only. IAM-02 owns it; the Role Matrix §29 item 39 tests apply to IAM-02. ACC-01 states the invariant it relies on: **a scoped grant narrows, never widens, and combining scoped grants never yields an unscoped one** (Role Matrix §5.2A).

### 11.3 Purpose is not authorisation

`purpose = payments` or `rwa` labels an operational pocket. It does not make AIX Pay or AIX RWA available, does not imply eligibility, and is never read by any control as activation (Role Matrix §3.7 rule 1–3; DEC-013). Creating a `payments`/`rwa` subaccount does not require and does not grant a CFG-01 capability (OQ-03). Product gating remains with the consuming module through CFG-01.

## 12. Relationship to DEC-013 and DEC-014

ACC-01 is **not a capability** and carries **no** `CAPABILITY_BUILD_STATE`, `ENVIRONMENT_AVAILABILITY`, `PRODUCTION_ACTIVATION_STATE` or `PRODUCT_ASSET_ELIGIBILITY_STATE` of its own. It contributes exactly one input to the access conjunction: **account / subaccount status active** (Doc 00 §21 condition 9). It:

- never writes or reads `cfg1.feature.current_state`, `environment_scope` or any activation state;
- is fully buildable, testable and available in all five environments now (build-unlocked; nothing here is production-gated because nothing here is a regulated activity);
- must not be read, by anyone, as evidence that any activation gate has passed — an `active` account is *eligible to be the subject of* a capability decision, nothing more.

Environment behaviour: identical in all five. `ENVIRONMENT` is validated at bootstrap through `@aix/foundation`; unknown ⇒ PRODUCTION. No control is relaxed for non-production convenience.

## 13. Integration contracts

| Peer | Direction | Seam | Failure posture |
|---|---|---|---|
| CLT-01 | ACC-01 → CLT-01 | `GET /internal/clt1/clients/:client_id/status` (exists) | Non-2xx / malformed ⇒ creation denied `ACC1_CLIENT_LOOKUP_UNAVAILABLE`; resolve ⇒ `unknown` |
| CLT-01 | CLT-01 → ACC-01 | `GET /internal/acc1/clients/:client_id/open-accounts` (new) — **DCR-ACC-CLT-01** | CLT-01 must refuse `closed` on unavailable/non-zero |
| IAM-02 | ACC-01 → IAM-02 | `permission/check`, `permission/execute-verify` (exist) — HTTP only, no import | Any non-affirmative ⇒ deny |
| IAM-02 | IAM-02 → ACC-01 | `scope-validate` (new) — **DCR-ACC-IAM-01** | IAM-02 fails closed |
| SEC-01 | ACC-01 → SEC-01 | Audit ingestion | Mutation fails closed if audit unrecordable |
| LED-01 | LED-01 → ACC-01 | `resolve` before creating/posting to a ledger account; `subaccount_id` reference | LED-01 denies on non-`active` / `unknown` — **DCR-ACC-LED-01** |
| LED-01 | ACC-01 → LED-01 | Closure-readiness attestation port | Absent/unreachable ⇒ closure blocked |
| CFG-01 | CFG-01 → ACC-01 | `resolve` for condition 9 | `unknown` ⇒ deny — **DCR-ACC-CFG-01** |
| WLT-01, DEP-01, WDR-01, OMS-01, PAY-01, RWA-*, TRE-01, FEE-01, REC-01 | → ACC-01 | `resolve`, `resolve-batch`, reconciliation extract | Deny on `unknown` |

ACC-01 imports nothing from another service directory (F3(c) module-import boundary); every peer call is HTTP through an ACC-01-local client, as CLT-01 does for IAM-02 and CFG-01.

## 14. Non-functional requirements

1. **Fail closed** on every ambiguity: unreadable peer, missing row, malformed response, unknown environment.
2. **Concurrency:** optimistic `version` on every mutable row; advisory lock for limits; `SELECT … FOR UPDATE` on the target row inside apply; unique constraints, not application checks, are the last line for name and default-subaccount uniqueness.
3. **Idempotency:** `Idempotency-Key` on all mutations; unique `(requested_by, idempotency_key)`.
4. **Performance:** resolve is on the hot path of every ledger post, order and withdrawal. Design target (to be validated, not asserted): single-digit-millisecond resolve at the DB; **no caching in v0.1** because a stale `active` is a safety defect; a bounded-staleness cache is an explicit later decision (OQ-04) and would have to carry the `version` evidence and fail closed on expiry.
5. **No RLS in v0.1:** ACC-01 tables are not actor-owned; scoping is enforced in the application through the CLT-01 membership seam plus IAM-02, and the DB role has no path to any other module's schema.
6. **Rate limiting** through the FND-01 shared engine, with an ACC-01 consumer-module secret, before any public route exists (DCR-ACC-FND-01).

## 15. Non-goals (explicit)

Legal-entity creation or edit; membership; KYC/KYB; balances or holds; ledger accounts; account numbers/IBANs/virtual accounts; fee or limit configuration; product or asset eligibility; capability activation; ownership transfer; sub-subaccounts (the hierarchy is exactly four layers); client self-service account creation (HD-6); Exchange-participant account modelling (owned by `EXP-01`, OQ-08); cross-environment promotion of accounts.

## 16. Build phasing (design intent; each phase needs its own approved task)

| Phase | Content | Prerequisite |
|---|---|---|
| 0 | Service scaffold, config, boot guards, health/readiness, internal-identity guard | Human approval of this pack |
| 1 | `acc1` schema, migration, grants, triggers; IAM-02 catalogue registration (cross-module migration, precedent 022) | Migration number assigned at the time |
| 2 | Read + `resolve` + `resolve-batch` + `scope-validate` + `open-accounts` | Phase 1 |
| 3 | Change-request + maker-checker apply: create master (+ default subaccount), create subaccount, profile update | IAM-02 approval policy rows (IAM2-FIND-003) |
| 4 | Restrictions apply / lift | Phase 3 |
| 5 | Closure (two-phase) with readiness port | LED-01 attestation contract (DCR-ACC-LED-01) |
| 6 | Client-facing read surface | IAM-01 introspection (accepted), FND rate-limit (accepted), `FND-FIND-001` perimeter rule, IAM-02 scope enforcement |
| 7 | Reconciliation extract | LED-01 / REC-01 |

ACC-01 sits **before** LED-01 in the build sequence (Module Index §18, Phase C precedes Phase D). Phases 0–5 depend only on the *accepted* IAM-02 baseline; the IAM-02 ↔ ACC-01 dependency cycle in the Module Index (IAM-02 extension needs ACC-01; ACC-01 needs IAM-02) is broken by that split (DCR-ACC-IAM-01).
