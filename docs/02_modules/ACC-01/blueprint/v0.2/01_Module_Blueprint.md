# ACC-01 Account Structure — Master Account & Subaccount
## 01 Module Blueprint (v0.2)

**Status: REMEDIATED / AWAITING RE-REVIEW. Planning only — no code, no migration.**

## 1. Purpose

ACC-01 is the **account layer between the legal entity and the ledger** (`DEC-011`: *"the account layer between the entity and the ledger, not the entity"*). It provides:

1. Master Account identity and lifecycle.
2. Subaccount identity and lifecycle.
3. Explicit, immutable legal-entity ownership of both.
4. A live **resolution seam** telling a consuming module which legal entity, master account and subaccount an activity belongs to, and the account structure's current status.
5. The governed registry that subaccount-scoped permissions (IAM-02 extension) and subaccount-scoped eligibility (CFG-01 condition 9) refer to.

ACC-01 is a **structural** module. It never moves, holds, reserves, prices or reports money, and it never decides whether a person, client or product may act.

## 2. Ownership boundary

| Concern | Owner | ACC-01's relationship |
|---|---|---|
| Legal entity, client identity, client status/class | **CLT-01** (sole) | Consumes: reads status/class through a **dedicated read-scoped CLT-01 credential** (DCR-ACC-CLT-03) |
| Membership / authorised principals | **CLT-01** (sole), bound to IAM via `iam_user_id` | Consumes only. **Never creates a second membership system** |
| Master account, subaccount: identity, status, restriction state, closure state | **ACC-01** (sole) | Owns |
| Ledger account, balances, journals, postings, holds, safeguarding | **LED-01** (sole) | Never stores or mirrors. LED-01 references `subaccount_id` |
| Permission evaluation, roles, approvals, SoD, scope *grants*, maker/checker authority | **IAM-02** + the Role & Permission Matrix | Registers permission codes; consumes guard and approval flow; provides scope-*validation* only. **Assigns no roles** (ACC-HD-2) |
| Capability evaluation (product, environment, asset, activation gate) | **CFG-01** (sole) | Supplies account/subaccount status as an input; **never** evaluates a capability |
| Client / product eligibility | **CLT-01, KYC-01, IAM-02, CFG-01, AST-01** | ACC-01 is **not** an eligibility authority (§4.6, RF-11) |
| Audit evidence | **SEC-01** | Emits |
| Wallet/payout destinations | **WLT-01** | Provides the subaccount a destination may be scoped to; no destination data |
| Whole-client freeze; `login_block`; freeze policy and triggers (WF-26) | **Not yet governed** (DCR-ACC-GOV-05) | ACC-01 **applies and records** an approved account-level restriction; it does not decide one is warranted and does **not** own client-level freeze |

**Never in ACC-01:** legal name, registration number, UBO, mandate, KYC/AML outcome, credentials, API keys, wallet addresses, any monetary amount, any balance, any ledger identifier, any product/asset eligibility flag.

## 3. Hierarchy and the three dimensions

```txt
clt1.client_profile.client_id            legal owner          "whose money"          (CLT-01)
  └── acc1.master_account.master_account_id                    operational container  (ACC-01)
        └── acc1.subaccount.subaccount_id  operational scope   "which pocket"         (ACC-01)
              └── led1.ledger_account.account_id  accounting destination "where it posts" (LED-01)
```

Per `DEC-011` §4.10, `client_id`, `subaccount_id` and `ledger_account_id` are **different dimensions**. ACC-01 never lets one stand in for another.

## 4. Requirement register

`DEC-011 #n` = decision pack §4.9 item *n*. **N** = new or materially changed in v0.2.

### 4.1 Identity and ownership

| ID | Requirement | Source |
|---|---|---|
| ACC-REQ-001 | A master account has a stable identifier independent of `client_id` | DEC-011 #1 |
| ACC-REQ-002 | A subaccount has a stable identifier independent of `client_id` and of its master account identifier | DEC-011 #1 |
| ACC-REQ-003 | Every master account records exactly one legal-entity owner (`client_id`) | DEC-011 #2 |
| ACC-REQ-004 | Every subaccount belongs to exactly one master account and carries the same `client_id`; **structurally enforced**; the same holds for every restriction against its target (**N**, RF-06) | DEC-011 #2, #3 |
| ACC-REQ-005 | A subaccount is not a legal client: no client profile, KYC/KYB, mandate or membership of its own | Doc 00 §2C rule 2 |
| ACC-REQ-006 | `client_id` and `master_account_id` are immutable for the life of the row | DEC-011 #5 (deliberate strengthening, §9) |
| ACC-REQ-007 | No monetary amount, balance, holding or ledger identifier is stored in ACC-01 | DEC-011 #13; Module Index §19 rule 1 |
| ACC-REQ-008 | Entity→master-account is one-to-many capable in the schema; the initial *policy* limit is configuration | DEC-011 #14; Doc 00 §2C rule 3 |
| ACC-REQ-009 | ACC-01 exposes identifiers LED-01 can reference; ACC-01 never references ledger accounts | DEC-011 layer 5 |

### 4.2 Lifecycle

| ID | Requirement | Source |
|---|---|---|
| ACC-REQ-010 | Master account lifecycle states and legal transitions are defined and DB-enforced (file 06) | DEC-011 #4 |
| ACC-REQ-011 | Subaccount lifecycle states and legal transitions are defined and DB-enforced | DEC-011 #4 |
| ACC-REQ-012 | Create, close, restrict and lift occur only through a governed change request with IAM-02 request/apply and execute-verify, mirroring the accepted CLT-01/CFG-01 pattern (**N**, RF-07) | DEC-011 #7; Module Index rule 10; Role Matrix §23 |
| ACC-REQ-013 | A master account may be created only for a client that is `active` or `active_limited` and whose class is institutional, HNWI or professional; anything else, or an unreadable CLT-01, fails closed. **This is a local structural backstop, not an eligibility authority** (**N**, RF-11) | Doc 00 §10.2A; System Rules fail-closed |
| ACC-REQ-014 | Effective status is computed live from client, master and subaccount state; any unreadable input yields `unknown`, which consumers must treat as deny | Doc 00 §21 rule 1, condition 9 |
| ACC-REQ-015 | Restrictions (partial, suspension, full freeze) apply to a master account or one subaccount and are lifted under maker-checker, with the FRZ-RULE-002 scopes that apply to accounts | FRZ-RULE-001/002; WF-26; Role Matrix §23 |
| ACC-REQ-016 | Closure is preventive and multi-step (`closing` → `closure_sealed` → `closed`): a posting barrier is in force **before** the final attestation is taken, and closure completes only while the barrier is effective (**N**, RF-03) | OFF-RULE-001; WF-27; approved closure-safety decision |
| ACC-REQ-017 | No account row is ever hard-deleted; retention follows the platform/client-record retention policy once defined; ACC-01 sets none (**N**) | DEC-011 #6; approved retention decision |
| ACC-REQ-018 | A master account is created with exactly one default `general` subaccount, atomically. The default is **structural only** (**N**, ACC-HD-1) | Decision pack §4.7; ACC-HD-1 |

### 4.3 Permissions and eligibility

| ID | Requirement | Source |
|---|---|---|
| ACC-REQ-019 | Permission codes `acc1.*` are registered in the IAM-02 catalogue; `licence_locked = false` | migration 022 precedent |
| ACC-REQ-020 | ACC-01 supplies a scope-*validation* seam for narrowing-only subaccount-scoped grants; IAM-02 owns grant model and enforcement | DEC-011 #8; Role Matrix §5.2A, §30 item 19 |
| ACC-REQ-021 | A permission grant, a subaccount purpose, an account status, or the default subaccount never activates a capability | DEC-013; DEC-014; Role Matrix §3.7; Module Index rule 11 |
| ACC-REQ-022 | Client-facing reads are membership-scoped; a foreign or unknown account is observationally identical to "no access" | CLT-01 principal-membership seam |
| ACC-REQ-023 | Maker ≠ checker; the approval is bound to the exact request payload fingerprint. **Under current IAM-02, neither maker nor checker is entitlement-checked; real-actor governed apply is therefore gated** (**N**, RF-01) | Role Matrix §3.4; `IAM2-FIND-002` |
| ACC-REQ-038 | **N** ACC-01 assigns no roles and invents no maker/checker authority; the Role & Permission Matrix and IAM-02 define them | ACC-HD-2 |
| ACC-REQ-039 | **N** For any transaction-producing activity, `effective_status ≠ active` means **DENY** unless that specific activity is explicitly authorised by authoritative policy; `blocked_scopes` is explanatory evidence, never an allow/deny list | RF-04 |

### 4.4 Audit, integration, environment

| ID | Requirement | Source |
|---|---|---|
| ACC-REQ-024 | Every creation, state change, restriction, lift, closure step and blocked ownership mutation emits SEC-01 audit; a state-changing action fails closed if its audit cannot be recorded | DEC-011 #6; Module Index rule 9 |
| ACC-REQ-025 | Status history is append-only and gap-free relative to stored status | file 13 |
| ACC-REQ-026 | Audit records and resolve responses carry the evaluating environment | Role Matrix §3.8 rule 5 |
| ACC-REQ-027 | Resolve returns `client_id`, `master_account_id`, `subaccount_id`, purpose, own/master/client status, effective status, explanatory scopes, applied restriction ids, and version evidence | DEC-011 #9–#12 |
| ACC-REQ-028 | A batch resolve exists for high-volume consumers | Performance |
| ACC-REQ-029 | An open-accounts seam lets CLT-01 refuse client closure while non-closed accounts exist | OFF-RULE-001; DCR-ACC-CLT-01 |
| ACC-REQ-030 | Closure requires a **post-barrier** readiness attestation from LED-01 (and later WLT-01/others) carrying the observed barrier version; absent, unreachable, unconfigured or mismatched ⇒ blocked (fail closed) (**N**) | OFF-RULE-001 items 1–5 |
| ACC-REQ-031 | Internal seams use per-consumer-module capability secrets; ACC-01 itself **never** holds CLT-01's or IAM-02's general internal credential (**N**, RF-05) | FND rate-limit precedent; `IAM_INTROSPECTION_SERVICE_TOKEN` precedent |
| ACC-REQ-032 | A read-only reconciliation extract supports LED-01/REC-01 structural reconciliation | DEC-011 #12 |
| ACC-REQ-033 | FND envelope, request/correlation IDs, idempotency keys on mutations | CLT-01 04 §1 |
| ACC-REQ-034 | No route path contains a fragment rejected by `assertNoExchangeRuntime` | `no-exchange.ts` |
| ACC-REQ-035 | Behaviour is identical in the five environments except the **real-use gates** of §4.5, which are fail-closed environment restrictions; unknown environment ⇒ PRODUCTION | DEC-013 clause 2; Doc 00 §21A rule 7 |
| ACC-REQ-036 | No column, flag or field is named or used as an `enabled` capability boolean | DEC-013; DEC-014 |
| ACC-REQ-037 | The model supports wallet-destination scoping, ledger posting, Spot/OTC/Pay/RWA attribution and reconciliation without coupling to any product | DEC-011 #9–#12 |
| ACC-REQ-040 | **N** Readiness validates peer **configuration and contract version only**, never peer liveness, so no boot-order cycle exists | RF-10 |
| ACC-REQ-041 | **N** Every restriction change (apply, activation, lift, expiry) increments the target row's `version`; a scheduled restriction is effective from `effective_from_utc` regardless of housekeeping (**RF-08**) | RF-08 |

### 4.5 Real-use gates (RF-01, RF-02, RF-05, RF-09; ACC-HD-2)

DEVELOPMENT and TEST may build, test and run every phase with fixture actors. In **UAT, DEMO, PRODUCTION and any unknown environment (treated as PRODUCTION)** the operations below refuse with `ACC1_REAL_USE_NOT_PERMITTED` until their prerequisites are **evidenced closed** (finding closed on commit + reproduced result, DCR delivered by the owning module).

| Gate | Blocks (outside DEV/TEST) | Prerequisites (all) |
|---|---|---|
| **G1 governed apply** | apply of create / close / restrict / lift | `IAM2-FIND-002` fixed **including** the approval-gated short-circuit dimension (DCR-ACC-IAM-03/-04); maker/checker authority governed in the Role Matrix + IAM-02 (DCR-ACC-GOV-02); approval policy rows seeded (DCR-ACC-IAM-02b); scoped IAM-02 credentials (DCR-ACC-IAM-05) |
| **G2 account creation** | `create_master_account`, `create_subaccount` | G1 **and** the LED-01 closure-readiness attester contract (DCR-ACC-LED-01c) exists (approved RF-02 decision) |
| **G3 resolve** | resolve / batch resolve / open-accounts | dedicated read-scoped CLT-01 status credential (DCR-ACC-CLT-03) |
| **G4 restrictions** | apply / lift restriction | G1 **and** freeze ownership governed (DCR-ACC-GOV-05) |
| **G5 closure** | close request apply, `seal`, `complete` | G1 **and** LED-01 barrier + attestation contract (DCR-ACC-LED-01c) |
| **G6 client routes** | any `/acc1/client/*` route | FND-FIND-001 resolved, DCR-ACC-FND-01, DCR-ACC-IAM-01/-03 |

The gate is a **code-level fail-closed interlock**, lifted only by an approved task that cites the closing evidence — not by an environment variable or runtime toggle, and not a capability flag (ACC-REQ-036). Whether it belongs in CFG-01 instead is recorded as OQ-11 (CFG-01 is the sole capability-eligibility authority, Module Index rule 7).

### 4.6 What ACC-01's checks are not (RF-11)

ACC-01's client status/class check (ACC-REQ-013) and the client-derived status input to effective status are a **local structural backstop** so it never builds structure on an unreadable or ineligible client. ACC-01 is **not** the client or product eligibility authority and does **not** replace CLT-01 (client status and class), KYC-01 (KYC/KYB), IAM-02 (permission), CFG-01 (capability eligibility) or AST-01 (asset/instrument eligibility). Any future retail approval (Doc 00 §10.2A rule 6) is decided in those owners; ACC-01 follows by a governed change.

## 5. Identifiers

| Identifier | Format | Properties |
|---|---|---|
| `master_account_id` | `mac_` + 24 lowercase hex (96 random bits) | Opaque, immutable, unique, generated by ACC-01, **not derived from `client_id`**, never reused |
| `subaccount_id` | `sac_` + 24 lowercase hex | Same; not derived from master or client identifier |
| `change_request_id` | `acr_` + 24 lowercase hex | Governed change-request handle |
| `restriction_id` | `rst_` + 24 lowercase hex | Restriction record handle |

DB `CHECK` on format; random from the platform CSPRNG. Internal `id uuid` keys are never exposed. Human-facing account numbers are not designed (OQ-05).

## 6. Cardinality and limits (ACC-HD-3)

| Relationship | Schema | Policy (configuration, not schema) |
|---|---|---|
| Legal entity → master accounts | one-to-many capable | `ACC1_MAX_MASTER_ACCOUNTS_PER_CLIENT`: **initial policy 1** (DEC-011). If set, must be a valid positive integer, otherwise boot refuses |
| Master account → subaccounts | one-to-many | `ACC1_MAX_SUBACCOUNTS_PER_MASTER`: **no default in code; no arbitrary number in the architecture.** Must be explicitly configured as a positive integer. **Missing or invalid ⇒ boot refuses (`ACC1_CONFIG_INVALID`) and any creation fails closed.** A concrete operational value must be explicitly configured before real use (DEV/TEST fixtures set their own) |
| Master account → default subaccount | at most one (`is_default`) | one, atomic with the master; **counts against** the subaccount limit, so a limit < 1 is invalid |
| Subaccount → ledger accounts | LED-01's concern | — |

- **`closing` and `closure_sealed` rows count against every limit and against name uniqueness**; only `closed` frees them. A `closing` row is therefore never an escape from the limits (RF-02).
- Limits are enforced inside the creation transaction under a per-`client_id` `pg_advisory_xact_lock`.
- Raising a limit is a configuration change, never a schema change — which is what makes one-to-many non-migratory.

## 7. Lifecycle (summary — file 06 is authoritative)

`active` ⇄ `restricted` | `suspended` | `frozen` (projection of active restrictions) ; `active`/`restricted`/`suspended`/`frozen` → `closing` → `closure_sealed` → `closed` (terminal).

- No `pending` state on the row: a proposed account exists only as a **change request** until an approved apply creates it `active`.
- **Closure is preventive (approved).** `closing` = drain (new-activity scopes blocked; only explicitly authorised drain activity). `closure_sealed` = **final barrier**: **all** transactional/posting activity is denied — LED-01 must refuse every posting when resolve shows the target sealed. A **fresh** LED-01 attestation is taken **after** the barrier, carries the barrier (`seal_version`) it observed and a journal watermark, and `closed` is set by compare-and-set only while the target is still `closure_sealed` at that `seal_version`. There is no transition out of `closure_sealed` except `closed` (no unseal in this version — OQ-07), so the barrier remains effective by construction. Attestation freshness is bounded by required configuration `ACC1_ATTESTATION_MAX_AGE_SECONDS` (no default; missing/invalid ⇒ fail closed); it is a second guard, not the primary control — the primary control is the barrier.
- **Master closure and children:** a master closure request lists **every** non-closed subaccount (ids + versions, bound into the approved payload). Approval of that request covers the master and the listed children. Each child then proceeds through `closing → closure_sealed → closed` with its **own** post-barrier attestation; the master may enter `closure_sealed` only when **every** child is `closed`, and `closed` only with its own post-barrier attestation. The default subaccount closes only with its master. A child added after the request changes the listed set ⇒ the request no longer matches ⇒ new request. Cascade is a governed lifecycle move of listed rows, not the forbidden *projection* fan-out (restrictions never write children).
- `closed` is terminal; identifiers are never reused.

## 8. Subaccount lifecycle and the default subaccount

Same statuses. A subaccount is created only under an existing `active`-or-`restricted` master whose own effective status permits creation (not `suspended`/`frozen`/`closing`/`closure_sealed`/`closed`). `purpose` ∈ `general` · `trading` · `treasury` · `payments` · `rwa`; **immutable; a classification label only** (§11.3).

**The default `general` subaccount (ACC-HD-1) is structural only.** It exists so LED-01 always has a subaccount dimension. It must **never** be treated as:

- a catch-all permission scope;
- a fallback trading account;
- a fallback payment account;
- a default product-authorisation target;
- evidence that any capability is available.

Enforcement in this design: (a) no internal seam resolves "the default subaccount of a client/master" — `resolve` **requires an explicit `subaccount_id`**; (b) `is_default` is **not** returned by any internal seam and is never a selector; (c) a consumer with a missing `subaccount_id` must deny, not default; (d) the default subaccount is subject to the same explicit account, permission, product and eligibility controls as any other subaccount; (e) tests in file 10 (T-122…T-125). It cannot be closed independently of its master (`ACC1_DEFAULT_SUBACCOUNT_PROTECTED`).

## 9. Legal-entity ownership and immutability

`DEC-011` #5 requires ownership to be *immutable after financial activity absent a governed migration path*. ACC-01 cannot observe financial activity, and a rule depending on a cross-module signal is a race. This pack therefore **strengthens** the requirement (reviewed and found a safe strengthening in `04-review.md` Q4):

1. `client_id` and `master_account_id` are immutable **from creation**: column-level `UPDATE` grants exclude them; a `BEFORE UPDATE` trigger rejects any change; composite foreign keys tie subaccounts **and restrictions** to their owner.
2. **Wrongly-created accounts — lifecycle, stated plainly (RF-02).** Ownership is never edited. There is **no bypass, void or override** because LED-01 does not yet exist. Instead: (a) account creation is **not available for real governed use** until the LED-01 readiness attester exists (G2), so no wrongly-created account can arise in UAT/DEMO/PRODUCTION before closure is completable; (b) in DEVELOPMENT/TEST, where accounts are fixture data, a wrongly-created account is removed by the disposable-environment reset procedure **outside ACC-01** — ACC-01 offers no void; (c) once G2/G5 are satisfied, correction is governed **closure and re-creation**, and the closure follows the full preventive sequence of §7 — it is **not** trivial and does not "clear trivially"; (d) a row in `closing`/`closure_sealed` continues to count against limits and name uniqueness; (e) while any non-`closed` account exists, DCR-ACC-CLT-01 correctly prevents client closure (OFF-RULE-001) — acceptable because real creation cannot happen before closure is completable.
3. **No ownership-transfer or account-migration path is designed** (OQ-01). An attempted ownership change is refused, audited Critical (`acc1.ownership_change_blocked`), and never partially applied.

## 10. Effective status

Stored status is **own-level only**. A subaccount's *effective* status is computed at read:

```txt
effective(subaccount) = worst( client-derived , master.status , subaccount.status , time-effective restrictions )
```

- Precedence `closed > frozen > suspended > closure_sealed > closing > restricted > active`; any unreadable input → `unknown`.
- **Consumer rule (normative, RF-04):** for any transaction-producing activity, `effective_status ≠ active` ⇒ **DENY**, unless that specific activity is explicitly authorised for that status by authoritative policy (DCR-ACC-GOV-04 — none exists yet, so today: deny). `unknown` ⇒ deny. `blocked_scopes` (FRZ-RULE-002 vocabulary) is **explanatory evidence only** — it is never the gate, and an activity absent from it is **not** thereby permitted.
- Client-derived `active_limited` and `restricted` ⇒ **report-only** semantics: every transaction-producing activity denies — trading, deposit, withdrawal, settlement, wallet/payout activation, Exchange/securities-market access, and any other activity that produces a transaction (CLT-01 §5.19).
- **No fan-out of restriction state.** Restricting a master does not update its subaccounts' rows; lifting it restores them exactly.
- Resolve returns version evidence `(client_status, master_version, subaccount_version)` **and** `applied_restriction_ids` — the restrictions counted as effective at evaluation, including time-effective ones the housekeeping job has not yet processed.

## 11. Subaccount scoping

### 11.1 What ACC-01 provides (registry side)
The validated `(client_id, master_account_id, subaccount_id)` triple; `POST /internal/acc1/scope-validate` for IAM-02 ("exists, internally consistent, not `closed`" — never a permission decision); `resolve` for eligibility inputs (CFG-01 condition 9).

### 11.2 What ACC-01 does **not** provide
Role grants, scope grants or their storage (`iam2.user_role.client_id` is written and read nowhere today — decision pack §4.4; `IAM2-FIND-002`); enforcement of narrowing-only (IAM-02's; Role Matrix §29 item 39). ACC-01 relies on: **a scoped grant narrows, never widens, and combining scoped grants never yields an unscoped one** (§5.2A).

### 11.3 Purpose is not authorisation
`purpose = payments` or `rwa` labels an operational pocket. It does not make AIX Pay or AIX RWA available and is never read by any control as activation (Role Matrix §3.7; DEC-013). Creating such a subaccount neither requires nor grants a CFG-01 capability (OQ-03). Purpose is used only to tighten governance, never to grant.

## 12. Relationship to DEC-013 and DEC-014

ACC-01 is **not a capability** and carries **no** `CAPABILITY_BUILD_STATE`, `ENVIRONMENT_AVAILABILITY`, `PRODUCTION_ACTIVATION_STATE` or `PRODUCT_ASSET_ELIGIBILITY_STATE` of its own. It contributes exactly one input to the access conjunction: **account / subaccount status active** (Doc 00 §21 condition 9). It never reads or writes `cfg1.feature.current_state` or `environment_scope`, and an `active` account is never evidence that any activation gate has passed. ACC-01 is buildable and testable in all five environments now; its **real-use gates** (§4.5) are fail-closed prerequisite interlocks about *safe operation*, not a regulatory or capability activation state.

## 13. Integration contracts and runtime dependency graph

| Peer | Direction | Seam | Failure posture |
|---|---|---|---|
| CLT-01 | ACC-01 → CLT-01 | `GET /internal/clt1/clients/:client_id/status` (exists) — **via a dedicated read-scoped credential (DCR-ACC-CLT-03), never CLT-01's general internal token** | Non-2xx / malformed ⇒ creation denied; resolve ⇒ `unknown` |
| CLT-01 | CLT-01 → ACC-01 | `GET /internal/acc1/clients/:client_id/open-accounts` (new, DCR-ACC-CLT-01) | CLT-01 must refuse `closed` on unavailable/non-zero |
| IAM-02 | ACC-01 → IAM-02 | `permission/check`, `permission/execute-verify` (exist) over HTTP, **via scoped credential (DCR-ACC-IAM-05)** | Non-affirmative ⇒ deny |
| IAM-02 | IAM-02 → ACC-01 | `scope-validate` (new, DCR-ACC-IAM-01) | IAM-02 fails closed |
| SEC-01 | ACC-01 → SEC-01 | audit ingestion | Mutation fails closed if audit unrecordable |
| LED-01 | LED-01 → ACC-01 | `resolve` before creating/posting; `subaccount_id` reference | LED-01 denies on `effective_status ≠ active` (per consumer rule) or `unknown` |
| LED-01 | ACC-01 → LED-01 | closure barrier + post-barrier attestation port | Absent/unreachable/mismatched ⇒ closure blocked |
| CFG-01 | CFG-01 → ACC-01 | `resolve` for condition 9 | `unknown` ⇒ deny |
| WLT-01, DEP-01, WDR-01, OMS-01, PAY-01, RWA-*, TRE-01, FEE-01, REC-01 | → ACC-01 | `resolve`, `resolve-batch`, extract | Deny per consumer rule |

**Runtime dependencies that are bidirectional or re-entrant (documented, RF-10):**

1. **ACC-01 ↔ CLT-01:** ACC-01 reads client status (every resolve); CLT-01 reads open accounts (client closure). Neither is a boot dependency; an unreadable CLT-01 yields `unknown` (denies money flows — correct, must be operationally owned).
2. **ACC-01 ↔ LED-01:** LED-01 reads `resolve` (every posting / ledger-account creation); ACC-01 reads LED-01 attestation only during closure. LED-01 unavailability blocks closure only; ACC-01 unavailability blocks LED-01 posting (fail closed).
3. **ACC-01 → IAM-02 → ACC-01:** ACC-01 calls IAM-02 for permission/verify; IAM-02 (extension) calls ACC-01 `scope-validate`. Re-entrancy is safe **only because** `scope-validate` is a read seam guarded by its own capability secret and never itself calls IAM-02 (test T-126). Build-time cycle broken by phasing (§16).
4. **Lifecycle coupling:** client closure → account closure → LED-01 attester → (G2/G5) real creation. Correctly ordered by the gates.

**Readiness (RF-10, ACC-REQ-040):** `readiness` validates **configuration and contract only** — required config present and valid (limits, attestation age, consumer secrets unique, peer base URLs set, dedicated credentials distinct from any general token *as far as detectable*, environment valid) and migration state — and reports a peer's *declared contract version* from config. It **never calls a peer**; peer liveness is monitored separately. A peer outage therefore can never prevent ACC-01 from booting, and two services can never deadlock on each other's readiness.

## 14. Non-functional requirements

1. **Fail closed** on every ambiguity.
2. **Concurrency:** optimistic `version`; advisory lock for limits; `SELECT … FOR UPDATE` on target rows inside apply; unique constraints, not application checks, are the last line.
3. **Idempotency:** `Idempotency-Key` on all mutations; `UNIQUE (requested_by, idempotency_key)`.
4. **Performance:** resolve is on the hot path of every posting/order/withdrawal. **No caching in v0.2** — a stale `active` is a safety defect; any cache is OQ-04.
5. **No RLS in v0.2:** tables are not actor-owned.
6. **Rate limiting** through the FND-01 shared engine before any public route (DCR-ACC-FND-01).
7. **Retention:** never delete; platform/client-record retention policy applies once defined (DCR-ACC-GOV-06).

## 15. Non-goals (explicit)

Legal-entity creation or edit; membership; KYC/KYB; balances or holds; ledger accounts; account numbers/IBANs; fee or limit configuration of business limits; product or asset eligibility; capability activation; ownership transfer; sub-subaccounts; client self-service creation (HD-6); Exchange-participant modelling (`EXP-01`, OQ-08); role assignments (ACC-HD-2); client-level freeze or `login_block` (DCR-ACC-GOV-05); void/bypass of wrongly-created accounts.

## 16. Build phasing (design intent; each phase needs its own approved task)

| Phase | Content | Prerequisite to **build** (DEV/TEST) | Real-use gate outside DEV/TEST |
|---|---|---|---|
| 0 | Service scaffold, config, boot guards, internal-identity guard | Pack approved | — |
| 1 | `acc1` schema, migration, grants, triggers; IAM-02 catalogue migration | Migration number at the time; DCR-ACC-IAM-02(a) | — |
| 2 | Reads, `resolve`, `resolve-batch`, `scope-validate`, `open-accounts` | Phase 1 | **G3** (DCR-ACC-CLT-03) |
| 3 | Change-request + apply: create master (+default), create subaccount, profile edit | Phase 1; IAM-02 stubbed in tests | **G1 + G2** |
| 4 | Restrictions apply/lift, time-effective resolution, housekeeping job | Phase 3 | **G1 + G4** |
| 5 | Closure (closing → sealed → closed), attester port | Phase 3; LED-01 contract (DCR-ACC-LED-01c) for a real attester | **G1 + G5** |
| 6 | Client read routes | Phase 2 | **G6** |
| 7 | Reconciliation extract + checks | LED-01 / REC-01 | — |

ACC-01 sits **before** LED-01 in the build sequence (Module Index §18). Phases 0–5 build on the *accepted* IAM-02 baseline **for DEV/TEST only**; using them with real actors additionally requires the IAM-02 fixes in G1 — the v0.1 claim that the accepted IAM-02 baseline was sufficient is withdrawn (RF-01).
