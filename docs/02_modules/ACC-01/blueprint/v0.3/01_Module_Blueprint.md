# ACC-01 Account Structure — Master Account & Subaccount
## 01 Module Blueprint (v0.3)

**Status: REMEDIATED (round 2) / AWAITING RE-REVIEW. Planning only — no code, no migration. Nothing is accepted; implementation is not authorised.**

v0.3 remediates `04-review-r2.md` (R2-F01…F09) and records the eight round-2 human decisions ACC-R2-HD-01…08 (file 17 §4.3). Changed ACC-01 rules are marked **(R2)**.

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
| Legal entity, client identity, client status/class | **CLT-01** (sole) | Consumes: **every** ACC-01 code path that reads client status/class (resolve, batch, submit, apply, reconciliation R-3) uses **one dedicated read-scoped CLT-01 credential in every environment** (DCR-ACC-CLT-03; ACC-R2-HD-08) |
| Membership / authorised principals | **CLT-01** (sole), bound to IAM via `iam_user_id` | Consumes only. **Never creates a second membership system** |
| Master account, subaccount: identity, status, restriction state, closure state | **ACC-01** (sole) | Owns |
| Ledger account, balances, journals, postings, holds, safeguarding | **LED-01** (sole) | Never stores or mirrors. LED-01 references `subaccount_id` |
| Permission evaluation, roles, approvals, SoD, scope *grants*, maker/checker authority | **IAM-02** + the Role & Permission Matrix | Registers permission codes; consumes guard and approval flow; provides scope-*validation* only. **Assigns no roles** (ACC-HD-2) |
| Capability evaluation (product, **environment availability**, asset, activation gate) | **CFG-01** (sole) | Supplies account/subaccount status as an input; **never** evaluates a capability and **implements no environment-availability control of its own** (ACC-R2-HD-06, §4.5) |
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

`DEC-011 #n` = decision pack §4.9 item *n*. **N** = new or materially changed in v0.2; **(R2)** = new or materially changed in v0.3.

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
| ACC-REQ-012 | Create, close (initiation), **seal**, **abort closure**, restrict, lift and **cancel a scheduled restriction** occur only through a governed change request with IAM-02 request/apply and execute-verify, mirroring the accepted CLT-01/CFG-01 pattern (**N**, RF-07; **(R2)** seal/abort/cancel added). Closure *completion* is not a change request: it is a machine-verified compare-and-set (ACC-REQ-044) | DEC-011 #7; Module Index rule 10; Role Matrix §23 |
| ACC-REQ-013 | A master account may be created only for a client that is `active` or `active_limited` and whose class is institutional, HNWI or professional; anything else, or an unreadable CLT-01, fails closed. **This is a local structural backstop, not an eligibility authority** (**N**, RF-11) | Doc 00 §10.2A; System Rules fail-closed |
| ACC-REQ-014 | Effective status is computed live from client, master and subaccount state; any unreadable input yields `unknown`, which consumers must treat as deny | Doc 00 §21 rule 1, condition 9 |
| ACC-REQ-015 | Restrictions (partial, suspension, full freeze) apply to a master account or one subaccount and are lifted under maker-checker, with the FRZ-RULE-002 scopes that apply to accounts | FRZ-RULE-001/002; WF-26; Role Matrix §23 |
| ACC-REQ-016 | Closure is preventive and multi-step: `closing` (**draining**, closure-drain allow-list only) → pre-seal readiness → **final checker approval** → `closure_sealed` (barrier) → fresh **post-barrier** attestation → machine-verified `closed`. A posting barrier is in force before the final attestation is taken, and closure completes only while the barrier stands. A governed abort path exists (ACC-REQ-045) (**N**, RF-03; **(R2)** F01) | OFF-RULE-001; WF-27; approved closure-safety decision; ACC-R2-HD-01/02/03 |
| ACC-REQ-017 | No account row is ever hard-deleted; retention follows the platform/client-record retention policy once defined; ACC-01 sets none (**N**) | DEC-011 #6; approved retention decision |
| ACC-REQ-018 | A master account is created with exactly one default `general` subaccount, atomically. The default is **structural only** (**N**, ACC-HD-1) | Decision pack §4.7; ACC-HD-1 |

### 4.3 Permissions and eligibility

| ID | Requirement | Source |
|---|---|---|
| ACC-REQ-019 | Permission codes `acc1.*` are registered in the IAM-02 catalogue; `licence_locked = false` | migration 022 precedent |
| ACC-REQ-020 | ACC-01 supplies a scope-*validation* seam for narrowing-only subaccount-scoped grants; IAM-02 owns grant model and enforcement | DEC-011 #8; Role Matrix §5.2A, §30 item 19 |
| ACC-REQ-021 | A permission grant, a subaccount purpose, an account status, or the default subaccount never activates a capability | DEC-013; DEC-014; Role Matrix §3.7; Module Index rule 11 |
| ACC-REQ-022 | Client-facing reads are membership-scoped; a foreign or unknown account is observationally identical to "no access" | CLT-01 principal-membership seam |
| ACC-REQ-023 | Maker ≠ checker; the approval is bound to the exact request payload fingerprint. **Under current IAM-02, neither maker nor checker is entitlement-checked, and the authenticated caller performing apply is not proven to be the maker; real governed apply is therefore gated by `DEP-IAM-ENTITLEMENT` and `DEP-IAM-ACTOR-BINDING`** (**N**, RF-01; **(R2)** F04) | Role Matrix §3.4; `IAM2-FIND-002`; ACC-R2-HD-07 |
| ACC-REQ-038 | **N** ACC-01 assigns no roles and invents no maker/checker authority; the Role & Permission Matrix and IAM-02 define them | ACC-HD-2 |
| ACC-REQ-039 | **N** For any transaction-producing activity, a non-`active` account state means **DENY** unless that specific activity is explicitly authorised by authoritative policy (the closure-drain allow-list of ACC-REQ-043 is the only such authorisation defined in this pack); `blocked_scopes` is explanatory evidence, never an allow/deny list. **(R2)** Consumers evaluate **`closure_barrier` first**, then the structural component statuses, then product/activity policy (§10); the single `effective_status` label is descriptive and never the gate | RF-04; ACC-R2-HD-05 |

### 4.4 Audit, integration, environment

| ID | Requirement | Source |
|---|---|---|
| ACC-REQ-024 | Every creation, state change, restriction, lift, closure step and blocked ownership mutation emits SEC-01 audit; a state-changing action fails closed if its audit cannot be recorded | DEC-011 #6; Module Index rule 9 |
| ACC-REQ-025 | Status history is append-only and gap-free relative to stored status | file 13 |
| ACC-REQ-026 | Audit records and resolve responses carry the evaluating environment | Role Matrix §3.8 rule 5 |
| ACC-REQ-027 | Resolve returns `client_id`, `master_account_id`, `subaccount_id`, purpose, own/master/client status, time-effective restriction status per level, effective status (descriptive), **`closure_barrier`, `closure_draining` and closure/seal version evidence (R2)**, explanatory scopes, applied restriction ids, and version evidence | DEC-011 #9–#12; ACC-R2-HD-05 |
| ACC-REQ-028 | A batch resolve exists for high-volume consumers | Performance |
| ACC-REQ-029 | An open-accounts seam lets CLT-01 refuse client closure while non-closed accounts exist | OFF-RULE-001; DCR-ACC-CLT-01 |
| ACC-REQ-030 | Closure requires (a) an affirmative **pre-seal readiness** result before the seal and (b) a **post-barrier** attestation from LED-01 (and later WLT-01/others) carrying the observed seal version, journal watermark, maximum resolution version observed by committed postings and in-flight status; only the **latest** attestation per target + attester + current seal version counts; absent, unreachable, unconfigured or mismatched ⇒ blocked (fail closed) (**N**; **(R2)** F01) | OFF-RULE-001 items 1–5 |
| ACC-REQ-031 | Internal seams use per-consumer-module capability secrets; ACC-01 itself **never** holds CLT-01's or IAM-02's general internal credential, **in any environment** — least-privilege peer credentials (or explicit labelled test doubles) are required in DEVELOPMENT and TEST too; no "temporary broad token" exception exists (**N**, RF-05; **(R2)** F05, ACC-R2-HD-08) | FND rate-limit precedent; `IAM_INTROSPECTION_SERVICE_TOKEN` precedent |
| ACC-REQ-032 | A read-only reconciliation extract supports LED-01/REC-01 structural reconciliation | DEC-011 #12 |
| ACC-REQ-033 | FND envelope, request/correlation IDs, idempotency keys on mutations | CLT-01 04 §1 |
| ACC-REQ-034 | No route path contains a fragment rejected by `assertNoExchangeRuntime` | `no-exchange.ts` |
| ACC-REQ-035 | **(R2)** Behaviour is identical in the five environments. ACC-01 contains **no environment-name logic that permits, denies or relaxes any operation**; environment availability of ACC-01 capability belongs to CFG-01 (ACC-R2-HD-06). The evaluating environment is recorded in audit and responses (ACC-REQ-026) and is never a branch condition. Environment-agnostic dependency prerequisites (§4.5) apply identically everywhere | DEC-013 clause 2; Doc 00 §21A rule 7; §1.D |
| ACC-REQ-036 | No column, flag or field is named or used as an `enabled` capability boolean | DEC-013; DEC-014 |
| ACC-REQ-037 | The model supports wallet-destination scoping, ledger posting, Spot/OTC/Pay/RWA attribution and reconciliation without coupling to any product | DEC-011 #9–#12 |
| ACC-REQ-040 | **N** Readiness validates peer **configuration and contract version only**, never peer liveness, so no boot-order cycle exists | RF-10 |
| ACC-REQ-041 | **N** Every restriction change (apply, activation, lift, expiry, **cancellation**) increments the target row's `version`; a scheduled restriction is effective from `effective_from_utc` regardless of housekeeping (**RF-08**) | RF-08 |
| ACC-REQ-042 | **(R2)** `closure_barrier` is an **authoritative independent fact** stored on each master and subaccount and returned by `resolve`, with closure/seal version evidence. It is set only by the `closing → closure_sealed` transition and cleared only by the governed recovery transaction (ACC-REQ-045). It is **never** encoded solely through `effective_status`; a more severe descriptive status (`frozen`, `suspended`, `restricted`, anything) never masks it | ACC-R2-HD-05; R2-F03 |
| ACC-REQ-043 | **(R2)** A target in `closing` may perform **only** the explicit **closure-drain allow-list** (§7.1): the activity required to satisfy WF-27 / OFF-RULE-001. `closing` is not a generally active state; the allow-list is closed, fail-closed, and changeable only by an authoritative master via governed change | ACC-R2-HD-01; R2-F01 |
| ACC-REQ-044 | **(R2)** Closure timing follows WF-27: pre-seal readiness proves the target drained and closure-ready; a **checker's final human approval** is given immediately before the seal (a governed change request); after the seal, the fresh post-barrier attestation and `closed` are **machine-verified**, with **no second checker** | ACC-R2-HD-02; WF-27 steps 9–10 |
| ACC-REQ-045 | **(R2)** A governed **abort / recovery** path exists from `closing` and from `closure_sealed`: maker-checker only, fully audited (Critical), evidence-conditioned (not a normal operational shortcut; cannot bypass closure requirements); it invalidates all closure evidence, bumps versions, clears the barrier only inside that transaction, restores only ACC-01's own recomputed projection and never restores anything another authority denied. There is no uncontrolled "reopen" route | ACC-R2-HD-03; R2-F01 |
| ACC-REQ-046 | **(R2)** On master closure the master **and its default `general` subaccount** enter `closing` atomically (with every other listed child); every child, the default included, must reach `closed` before the master may enter `closure_sealed`. No rule makes a child wait for its master to close | ACC-R2-HD-04; R2-F02 |
| ACC-REQ-047 | **(R2)** ACC-01 enforces **environment-agnostic dependency prerequisites** (`DEP-*`, §4.5) and nothing else about availability. Development/testing may satisfy a dependency with an explicit **labelled test double** injected at a test composition root — dependency injection, not an ACC-01 environment bypass | ACC-R2-HD-06; R2-F08 |
| ACC-REQ-048 | **(R2)** ACC-01 never claims that current IAM-02 proves the authenticated caller performing apply is the maker. Real governed apply requires attested actor binding from IAM-02 (`DEP-IAM-ACTOR-BINDING`, DCR-ACC-IAM-06); ACC-01 consumes attested facts, never body-asserted `actor_id` / `approval_id` | ACC-R2-HD-07; R2-F04 |
| ACC-REQ-049 | **(R2)** A scheduled restriction that has **not yet become effective** can be cancelled through a governed `cancel_scheduled_restriction`; a restriction already effective **by time** can be lifted even if housekeeping has not advanced its stored state. Effective-time evaluation alone decides legality; the housekeeping job never does | R2-F07 |

### 4.5 Dependency prerequisites (RF-01, RF-02, RF-05, RF-09; ACC-HD-2; **(R2)** ACC-R2-HD-06/07/08)

**Ownership rule (ACC-R2-HD-06).** ACC-01 implements **no** environment-availability control. **CFG-01 is the sole authority** for whether an ACC-01 capability is available in DEVELOPMENT, TEST, UAT, DEMO or PRODUCTION. v0.2's real-use gates G1–G6 keyed operations on environment names ("DEV/TEST allowed; UAT, DEMO, PRODUCTION and unknown refuse"); that was a parallel `ENVIRONMENT_AVAILABILITY` matrix and is **withdrawn**. There is no `if environment == …` allow, deny or relax anywhere in ACC-01, and the evaluating environment is never a branch condition.

What ACC-01 **does** enforce are **environment-agnostic safety/dependency prerequisites**: a governed operation refuses (`ACC1_DEPENDENCY_NOT_SATISFIED`, carrying the dependency id, audited) while a *named dependency's safety property is not evidenced*. The same rule applies identically in every environment. These are safety/dependency states, **not** capability-environment states (ACC-REQ-036 unchanged: nothing is an `enabled` flag).

| Dependency | Safety property that must be evidenced | Evidence form (fail closed if absent) | Delivered by (external — **none has changed**) |
|---|---|---|---|
| **DEP-IAM-ACTOR-BINDING** | IAM-02 proves, from attested facts, that the **authenticated apply actor** is the approved maker, and returns approval id/policy, checker identity and payload binding (§5 of file 02; ACC-R2-HD-07) | Declared IAM-02 contract version that provides the actor-binding contract, with the scoped verify credential configured | DCR-ACC-IAM-06 |
| **DEP-IAM-ENTITLEMENT** | Maker **and** checker entitlement is enforced for approval-gated actions, not bypassed by the `approval_required` short-circuit; maker/checker authority governed; approval policy rows seeded | Declared IAM-02 contract version that enforces entitlement | DCR-ACC-IAM-03, -04, -02b, -02c; DCR-ACC-GOV-02 |
| **DEP-IAM-SCOPED-CREDENTIAL** | ACC-01 can call **only** `permission/check` and `permission/execute-verify` (or the actor-binding successor), never IAM-02's approval-creating or other mutating routes (ACC-R2-HD-08) | Dedicated IAM-02 verify-scoped credential configured, distinct from every other configured token | DCR-ACC-IAM-05 |
| **DEP-CLT-READ-SCOPE** | ACC-01 reads CLT-01 client status/class only through a **read-scoped** credential, for **every** read: resolve, batch, submit, **apply-time** reads for create/close/restrict/lift, reconciliation R-3 (ACC-R2-HD-08) | Dedicated CLT-01 status-read credential configured, distinct from CLT-01's general token and from every other token | DCR-ACC-CLT-03 |
| **DEP-LED-CLOSURE-CONTRACT** | LED-01 provides the closure contract: barrier refusal, closure-drain allow-list, **pre-seal readiness**, **post-barrier attestation** with watermark and resolution-version evidence (file 17 DCR-ACC-LED-01c/-01e). Account *creation* also requires it, because a created account must be closable (the approved RF-02 decision: no void/bypass) | At least one attester configured **and** its declared contract version supports readiness + attestation; empty attester set ⇒ unsatisfied (`ACC1_CLOSURE_ATTESTERS_UNCONFIGURED`) | DCR-ACC-LED-01c, -01e |
| **DEP-FREEZE-GOVERNANCE** | Ownership of whole-client freeze, `login_block` and their relation to an ACC-01 restriction is governed (WF-26) | Declared governance reference to the closing record (**type G**, below) | DCR-ACC-GOV-05 |
| **DEP-PUBLIC-PERIMETER** | The public-perimeter/rate-limit prerequisites for any client-facing route are closed (`FND-FIND-001`, FND-01 engine, IAM-01/-03 for scoped reads) | Declared governance reference to the closing record (**type G**) | FND-FIND-001 resolution; DCR-ACC-FND-01, DCR-ACC-IAM-01/-03 |

`DEP-IAM-SCOPED-CREDENTIAL` is an addition to the six named examples of ACC-R2-HD-06; it is needed because ACC-R2-HD-08 requires least-privilege peer credentials in every environment.

**Which operation needs which dependency** (an operation refuses unless **all** listed dependencies are satisfied):

| Operation | Required dependencies |
|---|---|
| Any governed apply (create, close initiation, **seal**, **abort**, restrict, lift, **cancel**) | DEP-IAM-ACTOR-BINDING, DEP-IAM-ENTITLEMENT, DEP-IAM-SCOPED-CREDENTIAL, DEP-CLT-READ-SCOPE (apply-time status read) |
| Change-request **submit** (any type) | DEP-CLT-READ-SCOPE (submit reads CLT-01), DEP-IAM-SCOPED-CREDENTIAL (baseline `permission/check`) |
| `create_master_account`, `create_subaccount` | the governed-apply set **plus** DEP-LED-CLOSURE-CONTRACT |
| Closure operations (initiation, seal, abort, `close/complete`) | the governed-apply set (completion: DEP-IAM-SCOPED-CREDENTIAL only — it is a non-approval, entitlement-checked route) **plus** DEP-LED-CLOSURE-CONTRACT |
| `apply_restriction`, `lift_restriction`, `cancel_scheduled_restriction` | the governed-apply set **plus** DEP-FREEZE-GOVERNANCE |
| `resolve`, `resolve-batch` | DEP-CLT-READ-SCOPE |
| `open-accounts`, `scope-validate`, reconciliation extract | none (they make no CLT-01 or IAM-02 call) |
| `/acc1/client/*` (phase 6) | DEP-PUBLIC-PERIMETER, plus DEP-CLT-READ-SCOPE |

**Two evidence types.** *Type P (peer contract)* — the peer seam's dedicated credential and declared contract version are configured; readiness validates configuration and contract only, never calls the peer (ACC-REQ-040). *Type G (governance evidence)* — a declared reference to the governance record that closes the prerequisite. ACC-01 can check only that the reference is present, well-formed and declared; **whether the record is truly closed is a governance/deployment-review matter and, for availability, CFG-01's** (see DCR-ACC-CFG-02). ACC-01 does not pretend a declared reference is proof.

**Test doubles — dependency injection, not an environment exception (ACC-R2-HD-06).** Development and testing may satisfy a dependency with an **explicit, labelled test double** (`provider = test_double`, with a label). The double is injected only at a **test composition root**; the service's production composition root imports none, and **no configuration value, environment variable or environment name can select one** (source guard, T-121). Every dependency evidence record carries its `provider` (`real` | `test_double`) into readiness output and audit, so the difference is always visible. A double satisfies a dependency exactly as a real one would — there is no environment-conditional path.

**Least privilege in every environment (ACC-R2-HD-08).** ACC-01 is never provisioned CLT-01's general write-capable token or IAM-02's general mutation-capable token — not in DEVELOPMENT, not in TEST, not temporarily. For local automated testing use explicit test doubles or dedicated scoped test credentials. No "temporary broad token" exception exists.

**If a dependency is later represented in CFG-01**, ACC-01 consumes that authoritative decision; it does not duplicate it (DCR-ACC-CFG-02). OQ-11 is **RESOLVED** by ACC-R2-HD-06 (file 17).

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
| Master account → subaccounts | one-to-many | `ACC1_MAX_SUBACCOUNTS_PER_MASTER`: **no default in code; no arbitrary number in the architecture.** Must be explicitly configured as a positive integer. **Missing or invalid ⇒ boot refuses (`ACC1_CONFIG_INVALID`) and any creation fails closed.** A concrete operational value must be explicitly configured before real use (test fixtures set their own) |
| Master account → default subaccount | at most one (`is_default`) | one, atomic with the master; **counts against** the subaccount limit, so a limit < 1 is invalid |
| Subaccount → ledger accounts | LED-01's concern | — |

- **`closing` and `closure_sealed` rows count against every limit and against name uniqueness**; only `closed` frees them. A `closing` row is therefore never an escape from the limits (RF-02).
- Limits are enforced inside the creation transaction under a per-`client_id` `pg_advisory_xact_lock`.
- Raising a limit is a configuration change, never a schema change — which is what makes one-to-many non-migratory.

## 7. Lifecycle (summary — file 06 is authoritative)

Operational projection: `active` ⇄ `restricted` | `suspended` | `frozen` (projection of active restrictions). Closure lifecycle **(R2)**:

```txt
ACTIVE / RESTRICTED / SUSPENDED / FROZEN
  → CLOSING (draining)             closure-drain allow-list only
  → PRE-SEAL READY                 evidence, not a status (file 05 closure_readiness)
  → FINAL CHECKER APPROVAL         governed seal request (the final human approval)
  → CLOSURE_SEALED                 closure_barrier = true
  → POST-BARRIER LED ATTESTATION   fresh, latest-per-attester
  → CLOSED                         machine-verified compare-and-set (terminal)

governed abort: CLOSING | CLOSURE_SEALED → recomputed operational projection
```

- No `pending` state on the row: a proposed account exists only as a **change request** until an approved apply creates it `active`.
- **Closure is preventive (approved) and completable.** The v0.2 design let a funded account enter `closing` and become un-drainable and un-exitable (R2-F01). v0.3 fixes that in four ways: (a) `closing` permits the **closure-drain allow-list** (§7.1); (b) a **pre-seal readiness** result must show the target drained before a seal can be requested and again immediately before it is applied; (c) a **governed abort** exists (§7.3); (d) the attestation contract is version/watermark based and latest-attestation-only (§7.2).
- **`closure_barrier` is an independent fact.** Sealing sets `closure_barrier = true` and increments `closure_seal_version`. Every consumer, LED-01 included, refuses **every new posting when `closure_barrier = true`** — never "when `effective_status == closure_sealed`" — regardless of whether the descriptive status is `frozen`, `suspended`, `restricted` or anything else (§10, ACC-REQ-042).
- **Final approval timing (ACC-R2-HD-02, aligned with WF-27 steps 9–10).** The closure request (maker) puts the target in `closing`. After drain, pre-seal readiness proves it closure-ready; a **checker performs the final human approval immediately before sealing** — the `seal_closure` change request, whose approved payload binds the pre-seal readiness evidence. After the seal, the post-barrier attestation and completion are **machine-verified**; **no second checker** is required and none is designed. This replaces v0.2's claim that one early approval covers the whole sequence.
- **Master closure and children (ACC-R2-HD-04).** A master closure request lists **every** non-closed subaccount (ids, versions, statuses), including the default, bound into the approved payload. On apply the master **and its default `general` subaccount** enter `closing` atomically, together with every other listed child. Each child — the default included — then drains, seals (own final approval), is attested and closes under the **same child-account rules**. The master may enter `closure_sealed` only when **every** child is `closed`, then completes its own attestation and closure. Nothing makes a child wait for its master to close, so the v0.2 circular rule is gone. A subaccount created after the request changes the listed set ⇒ the request no longer matches ⇒ new request; subaccount creation additionally locks the master so a child cannot appear after master closure has begun (file 05 §5).
- `closed` is terminal; identifiers are never reused.

### 7.1 Closure-drain allow-list (ACC-R2-HD-01)

A target in `closing` may perform **only** the activity below, and only where **every other component** still permits it (a time-effective restriction or a non-`active` client status continues to deny; drain never overrides a restriction or another authority). Everything else stays denied: no new trade, deposit, investment/subscription, payout destination or Exchange/securities-market activity, and no other transaction-producing business unrelated to closure.

| ID | Closure-drain activity | Bound |
|---|---|---|
| CDA-1 | Return the remaining client balance to a **verified own-name** destination | Existing verified destination only; **no new payout destination** |
| CDA-2 | Finish an **already-open** withdrawal | Only where completion is required for closure; no new withdrawal |
| CDA-3 | Finish an **already-open** settlement | Only where completion is required for closure; no new settlement |
| CDA-4 | Resolve reconciliation breaks necessary for closure | Structural/ledger repair only through the owning module's governed process |
| CDA-5 | Other closure-only operations **explicitly required by an authoritative master** | **None defined in v0.3.** Adding one needs a master citation and a governed change to this list (fail closed) |

`closing` is **not** a generally active state. The list is closed, explicit and fail closed: an activity not named here is denied under `closing`. Consumers evaluate it as a narrowing exception in §10 step 2; ACC-01 supplies `closure_draining` and never itself performs the activity. Broader status→activity policy for other non-`active` states remains DCR-ACC-GOV-04.

### 7.2 Pre-seal readiness and post-barrier attestation (DCR-ACC-LED-01c)

**Pre-seal readiness** (target in `closing`; ACC-01 → LED-01 attester port; recorded in `closure_readiness`). It prevents sealing a funded or undrained account. It must return an affirmative result proving **at minimum**:

- no remaining balance **or** the authorised balance-return action complete (`balance_state ∈ {none, returned}`; **no amount is ever stored**, ACC-REQ-007);
- no open withdrawal requiring completion; no open settlement requiring completion;
- no unresolved reconciliation break that blocks closure;
- no in-flight posting that has not been accounted for;
- all required **child closure conditions** satisfied where applicable — for a master, every child `closed` (ACC-01's own fact) and the master-level attestation clear.

It also returns `journal_watermark` (the pre-seal watermark, W_pre), `max_resolution_version_observed`, `closure_cycle_observed`, `evidence_ref` and `as_of`. A seal request is legal only when the **latest** readiness at the target's current `closure_cycle` is `ready`, fresh, and re-verified at apply (file 02 §7.4).

**Post-barrier attestation** (target `closure_sealed`; taken **after** the barrier). Version and watermark evidence — wall-clock is only a secondary freshness guard:

| Field | Meaning | Must satisfy for `clear` |
|---|---|---|
| `target_type` / `target_id` | The master account or subaccount | equals the target |
| `seal_version_observed` | `closure_seal_version` the attester observed | equals the target's **current** `closure_seal_version` |
| `journal_watermark` | Target-scoped journal position at attestation | opaque, recorded |
| `preseal_watermark_ref` | W_pre echoed from the readiness ACC-01 sent | equals the recorded readiness `journal_watermark` |
| `committed_after_preseal_watermark` | Count of postings committed after W_pre | **0** |
| `max_resolution_version_committed` | Maximum ACC-01 resolution `version` (target level) observed by any **committed** posting, as stored with each posting | **< `closure_sealed_at_version`** (the target `version` written by the seal) |
| `in_flight_count` / `in_flight_status` | Postings resolved on pre-seal evidence and not yet committed at attestation | status ∈ {`none`, `refused_by_fence`}; never `unresolved` |
| `attestation_status` | `clear` \| `blocked` | `clear` |
| `evidence_ref`, `as_of` | Fresh attestation evidence | `as_of` within `ACC1_ATTESTATION_MAX_AGE_SECONDS` |

**Why this closes the pre-resolve/post-commit race.** A posting resolved before the seal but committed after it has a journal position after W_pre, so `committed_after_preseal_watermark > 0` and completion blocks; a posting that ignored the barrier carries a resolution version at or after the seal, so `max_resolution_version_committed ≥ closure_sealed_at_version` and completion blocks. The two checks are independent. LED-01's duty (DCR-ACC-LED-01c): refuse every new posting when `closure_barrier = true`, store the resolve `versions` with each posting, and fence in-flight postings before attesting (refuse them; they are counted, never committed).

**Latest-attestation semantics.** Attestations are append-only rows with a monotonic sequence. Only the **latest** row for **target + attester + current `closure_seal_version`** may satisfy completion; a later `blocked` supersedes an earlier `clear`, and a later `clear` supersedes a `blocked` (re-collection is allowed and needs no abort). Completion requires the latest row of **every configured attester** to be `clear`. The same latest-row rule applies to readiness per target + attester + `closure_cycle`.

### 7.3 Governed abort / unseal (ACC-R2-HD-03; OQ-07 resolved)

If closure cannot safely complete, a **governed recovery** — never an uncontrolled "reopen" route — may return the target from `closing` **or** `closure_sealed` to its operational projection.

- **Maker-checker only**, an IAM-02 governed change request (`abort_closure`), fully audited (**Critical** `acc1.account_closure_aborted`), and **not a normal operational shortcut**: it is legal only when machine evidence shows a closure invariant failing or a blocked/unavailable attestation or readiness (`reason_code` ∈ `preseal_readiness_blocked`, `postseal_attestation_blocked`, `postseal_attestation_unavailable`, `closure_invariant_failed`, `authority_restriction_blocks_closure`, `attester_contract_fault`), which ACC-01 verifies at apply. It cannot be used to bypass a closure requirement and can never apply to a `closed` row.
- In **one transaction**: invalidate all closure-readiness and post-seal attestations (evidence is keyed to `closure_cycle` and `closure_seal_version`; abort bumps `closure_cycle`, never resets `closure_seal_version`, so old evidence can never match a later seal); bump `version`; **clear `closure_barrier` only here**; recompute the stored status as the **projection of the restrictions in force by time** — never a remembered "prior status"; write history and a `closure_recovery` row; emit the Critical audit.
- **Never restores what another authority denied.** Abort restores only ACC-01's own structural projection. Effective status is still computed live, so a client CLT-01 has suspended, a restriction still in force, or a capability CFG-01 withholds remains denied.
- **Scope.** A subaccount whose master is `closing`/`closure_sealed`, and the default subaccount, cannot be aborted on their own (`ACC1_CLOSURE_ABORT_INVALID`, `ACC1_DEFAULT_SUBACCOUNT_PROTECTED`): aborting the **master** returns the master **and every listed non-closed child** in one transaction. Children already `closed` stay `closed` (terminal); if the default is among them the master is left with no open default — structural only, harmless because nothing resolves "the default".

## 8. Subaccount lifecycle and the default subaccount

Same statuses. A subaccount is created only under an existing `active`-or-`restricted` master whose own effective status permits creation (not `suspended`/`frozen`/`closing`/`closure_sealed`/`closed`). **(R2)** The creation transaction reads the master row **`FOR SHARE`** (file 05 §5 `trg_acc1_sa_owner`; apply step A4), so it serialises with a concurrent master-closure apply: a master in `closing` or later rejects new child creation (`ACC1_PARENT_NOT_USABLE`), and a child can never appear after master closure has begun. `purpose` ∈ `general` · `trading` · `treasury` · `payments` · `rwa`; **immutable; a classification label only** (§11.3).

**The default `general` subaccount (ACC-HD-1) is structural only.** It exists so LED-01 always has a subaccount dimension. It must **never** be treated as:

- a catch-all permission scope;
- a fallback trading account;
- a fallback payment account;
- a default product-authorisation target;
- evidence that any capability is available.

Enforcement in this design: (a) no internal seam resolves "the default subaccount of a client/master" — `resolve` **requires an explicit `subaccount_id`**; (b) `is_default` is **not** returned by any internal seam and is never a selector; (c) a consumer with a missing `subaccount_id` must deny, not default; (d) the default subaccount is subject to the same explicit account, permission, product and eligibility controls as any other subaccount; (e) tests in file 10 (T-122…T-125). **(R2, ACC-R2-HD-04) Closure of the default:** it enters `closing` **only in the same transaction** as its master's `closing`, and thereafter drains, seals, is attested and closes under the **same child rules** as every other child — before the master seals. It cannot be closed or aborted independently of that master closure (`ACC1_DEFAULT_SUBACCOUNT_PROTECTED`). v0.2's circular rule ("default closes only after its master" / "master seals only after the default closes") is removed.

## 9. Legal-entity ownership and immutability

`DEC-011` #5 requires ownership to be *immutable after financial activity absent a governed migration path*. ACC-01 cannot observe financial activity, and a rule depending on a cross-module signal is a race. This pack therefore **strengthens** the requirement (reviewed and found a safe strengthening in `04-review.md` Q4):

1. `client_id` and `master_account_id` are immutable **from creation**: column-level `UPDATE` grants exclude them; a `BEFORE UPDATE` trigger rejects any change; composite foreign keys tie subaccounts **and restrictions** to their owner.
2. **Wrongly-created accounts — lifecycle, stated plainly (RF-02).** Ownership is never edited. There is **no bypass, void or override** because LED-01 does not yet exist. Instead: (a) account creation **requires `DEP-LED-CLOSURE-CONTRACT`** (§4.5) — an environment-agnostic prerequisite, not an environment switch — so no wrongly-created account can arise while closure is not completable; whether creation is *available* in a given environment is CFG-01's decision (ACC-R2-HD-06); (b) where accounts are fixture data (test doubles satisfying the dependency), a wrongly-created account is removed by the disposable-environment reset procedure **outside ACC-01** — ACC-01 offers no void; (c) once `DEP-LED-CLOSURE-CONTRACT` is satisfied, correction is governed **closure and re-creation**, and the closure follows the full preventive sequence of §7 (a master can now complete it: R2-F02) — it is **not** trivial and does not "clear trivially"; (d) a row in `closing`/`closure_sealed` continues to count against limits and name uniqueness; (e) while any non-`closed` account exists, DCR-ACC-CLT-01 correctly prevents client closure (OFF-RULE-001) — acceptable because creation cannot happen before closure is completable.
3. **No ownership-transfer or account-migration path is designed** (OQ-01). An attempted ownership change is refused, audited Critical (`acc1.ownership_change_blocked`), and never partially applied.

## 10. Effective status and the consumer evaluation order

Stored status is **own-level only**. A subaccount's *effective* status is computed at read:

```txt
effective(subaccount) = worst( client-derived , master.status , subaccount.status , time-effective restrictions )
```

- Precedence `closed > frozen > suspended > closure_sealed > closing > restricted > active`; any unreadable input → `unknown`. **(R2) This label is descriptive.** The statuses are not totally ordered — lifecycle and restriction are different dimensions — so **no protection ever depends on the ranking** (R2-F03).
- **Resolve exposes the independent facts (R2):** `closure_barrier`, `closure_draining`, closure/seal version evidence, and the **time-effective restriction status per level** alongside the stored statuses and `effective_status` (file 04 §3.1).
- **Consumer evaluation order (normative, ACC-R2-HD-05, RF-04).** For any transaction-producing activity, in this order:
  1. **`closure_barrier`.** If `true` ⇒ **DENY every** transaction-producing activity, absolutely — no policy, allow-list or status can override it, and it does not matter whether `effective_status` shows `frozen`, `suspended`, `restricted` or anything else. `unknown`, an unavailable `resolve`, or a missing `subaccount_id` ⇒ DENY (never default).
  2. **Structural account status and restrictions — conjunctive over components.** Permit only if **every** component — client-derived, master (stored lifecycle **and** time-effective restriction status) and subaccount (same) — is `active`, with one narrowing exception: where a component is in `closing` (`closure_draining = true`), the closure-drain allow-list (§7.1) permits **only** those activities **and only if every component that is not itself in `closing` is still `active`** (drain never overrides a restriction or a client status). Any other non-`active` state ⇒ DENY unless an authoritative policy authorises that specific activity (DCR-ACC-GOV-04 — none exists, so today: deny).
  3. **Product/activity policy** (CFG-01, IAM-02, the consuming module) applies afterwards. ACC-01's answer is a necessary condition, never a sufficient one.
- `blocked_scopes` (FRZ-RULE-002 vocabulary) is **explanatory evidence only** — never the gate; an activity absent from it is **not** thereby permitted.
- Client-derived `active_limited` and `restricted` ⇒ **report-only** semantics: every transaction-producing activity denies — trading, deposit, withdrawal, settlement, wallet/payout activation, Exchange/securities-market access, and any other activity that produces a transaction (CLT-01 §5.19). This includes closure-drain activity (fail closed).
- **No fan-out of restriction state.** Restricting a master does not update its subaccounts' rows; lifting it restores them exactly.
- Resolve returns version evidence `(client_status, master_version, subaccount_version)`, closure/seal version evidence **and** `applied_restriction_ids` — the restrictions counted as effective at evaluation, including time-effective ones the housekeeping job has not yet processed.

## 11. Subaccount scoping

### 11.1 What ACC-01 provides (registry side)
The validated `(client_id, master_account_id, subaccount_id)` triple; `POST /internal/acc1/scope-validate` for IAM-02 ("exists, internally consistent, not `closed`" — never a permission decision); `resolve` for eligibility inputs (CFG-01 condition 9).

### 11.2 What ACC-01 does **not** provide
Role grants, scope grants or their storage (`iam2.user_role.client_id` is written and read nowhere today — decision pack §4.4; `IAM2-FIND-002`); enforcement of narrowing-only (IAM-02's; Role Matrix §29 item 39). ACC-01 relies on: **a scoped grant narrows, never widens, and combining scoped grants never yields an unscoped one** (§5.2A).

### 11.3 Purpose is not authorisation
`purpose = payments` or `rwa` labels an operational pocket. It does not make AIX Pay or AIX RWA available and is never read by any control as activation (Role Matrix §3.7; DEC-013). Creating such a subaccount neither requires nor grants a CFG-01 capability (OQ-03). Purpose is used only to tighten governance, never to grant.

## 12. Relationship to DEC-013 and DEC-014

ACC-01 is **not a capability** and carries **no** `CAPABILITY_BUILD_STATE`, `ENVIRONMENT_AVAILABILITY`, `PRODUCTION_ACTIVATION_STATE` or `PRODUCT_ASSET_ELIGIBILITY_STATE` of its own. It contributes exactly one input to the access conjunction: **account / subaccount status active** (Doc 00 §21 condition 9). It never reads or writes `cfg1.feature.current_state` or `environment_scope`, and an `active` account is never evidence that any activation gate has passed. ACC-01 is buildable and testable in all five environments; its **dependency prerequisites** (§4.5) are environment-agnostic, fail-closed safety interlocks about *safe operation* — not a regulatory, capability or **environment-availability** state. Environment availability of ACC-01 capability is CFG-01's alone (ACC-R2-HD-06); ACC-01 does not read `environment_scope` and does not duplicate it.

## 13. Integration contracts and runtime dependency graph

| Peer | Direction | Seam | Failure posture |
|---|---|---|---|
| CLT-01 | ACC-01 → CLT-01 | `GET /internal/clt1/clients/:client_id/status` (exists) — **via a dedicated read-scoped credential (DCR-ACC-CLT-03) for every read (resolve, batch, submit, apply, R-3), never CLT-01's general internal token, in every environment** | Non-2xx / malformed ⇒ governed action denied; resolve ⇒ `unknown` |
| CLT-01 | CLT-01 → ACC-01 | `GET /internal/acc1/clients/:client_id/open-accounts` (new, DCR-ACC-CLT-01) | CLT-01 must refuse `closed` on unavailable/non-zero |
| IAM-02 | ACC-01 → IAM-02 | `permission/check`, `permission/execute-verify` (exist) over HTTP, **via scoped credential (DCR-ACC-IAM-05) in every environment**; the actor-binding successor contract (DCR-ACC-IAM-06) once delivered | Non-affirmative ⇒ deny |
| IAM-02 | IAM-02 → ACC-01 | `scope-validate` (new, DCR-ACC-IAM-01) | IAM-02 fails closed |
| SEC-01 | ACC-01 → SEC-01 | audit ingestion | Mutation fails closed if audit unrecordable |
| LED-01 | LED-01 → ACC-01 | `resolve` before creating/posting; `subaccount_id` reference | LED-01 applies the consumer evaluation order (§10): **`closure_barrier = true` ⇒ refuse every new posting**, then component statuses (closure-drain allow-list under `closing`), or `unknown` ⇒ deny |
| LED-01 | ACC-01 → LED-01 | pre-seal readiness port and post-barrier attestation port (DCR-ACC-LED-01c) | Absent/unreachable/mismatched ⇒ closure blocked |
| CFG-01 | CFG-01 → ACC-01 | `resolve` for condition 9 | `unknown` ⇒ deny |
| WLT-01, DEP-01, WDR-01, OMS-01, PAY-01, RWA-*, TRE-01, FEE-01, REC-01 | → ACC-01 | `resolve`, `resolve-batch`, extract | Deny per consumer rule |

**Runtime dependencies that are bidirectional or re-entrant (documented, RF-10):**

1. **ACC-01 ↔ CLT-01:** ACC-01 reads client status (every resolve); CLT-01 reads open accounts (client closure). Neither is a boot dependency; an unreadable CLT-01 yields `unknown` (denies money flows — correct, must be operationally owned).
2. **ACC-01 ↔ LED-01:** LED-01 reads `resolve` (every posting / ledger-account creation); ACC-01 reads LED-01 attestation only during closure. LED-01 unavailability blocks closure only; ACC-01 unavailability blocks LED-01 posting (fail closed).
3. **ACC-01 → IAM-02 → ACC-01:** ACC-01 calls IAM-02 for permission/verify; IAM-02 (extension) calls ACC-01 `scope-validate`. Re-entrancy is safe **only because** `scope-validate` is a read seam guarded by its own capability secret and never itself calls IAM-02 (test T-126). Build-time cycle broken by phasing (§16).
4. **Lifecycle coupling:** client closure → account closure → LED-01 attester/contract → `DEP-LED-CLOSURE-CONTRACT` → creation. Correctly ordered by the dependency prerequisites.

**Readiness (RF-10, ACC-REQ-040):** `readiness` validates **configuration and contract only** — required config present and valid (limits, attestation age, consumer secrets unique, peer base URLs set, dedicated credentials distinct from any general token *as far as detectable*, environment valid, each `DEP-*` evidence record present with its `provider` label) and migration state — and reports a peer's *declared contract version* from config. It **never calls a peer**; peer liveness is monitored separately. A peer outage therefore can never prevent ACC-01 from booting, and two services can never deadlock on each other's readiness.

## 14. Non-functional requirements

1. **Fail closed** on every ambiguity.
2. **Concurrency:** optimistic `version`; advisory lock for limits; `SELECT … FOR UPDATE` on target rows inside apply; unique constraints, not application checks, are the last line.
3. **Idempotency:** `Idempotency-Key` on all mutations; `UNIQUE (requested_by, idempotency_key)`.
4. **Performance:** resolve is on the hot path of every posting/order/withdrawal. **No caching in v0.3** — a stale `active` is a safety defect; any cache is OQ-04.
5. **No RLS in v0.3:** tables are not actor-owned.
6. **Rate limiting** through the FND-01 shared engine before any public route (DCR-ACC-FND-01).
7. **Retention:** never delete; platform/client-record retention policy applies once defined (DCR-ACC-GOV-06).

## 15. Non-goals (explicit)

Legal-entity creation or edit; membership; KYC/KYB; balances or holds; ledger accounts; account numbers/IBANs; fee or limit configuration of business limits; product or asset eligibility; capability activation; ownership transfer; sub-subaccounts; client self-service creation (HD-6); Exchange-participant modelling (`EXP-01`, OQ-08); role assignments (ACC-HD-2); client-level freeze or `login_block` (DCR-ACC-GOV-05); void/bypass of wrongly-created accounts.

## 16. Build phasing (design intent; each phase needs its own approved task)

| Phase | Content | Prerequisite to **build** (peers may be test doubles) | Dependency prerequisites to **operate** (§4.5; environment-agnostic) |
|---|---|---|---|
| 0 | Service scaffold, config, boot guards, internal-identity guard | Pack approved | — |
| 1 | `acc1` schema, migration, grants, triggers; IAM-02 catalogue migration | Migration number at the time; DCR-ACC-IAM-02(a) | — |
| 2 | Reads, `resolve`, `resolve-batch`, `scope-validate`, `open-accounts` | Phase 1 | DEP-CLT-READ-SCOPE (DCR-ACC-CLT-03) |
| 3 | Change-request + apply: create master (+default), create subaccount, profile edit | Phase 1; IAM-02 as an explicit labelled test double | governed-apply set (DEP-IAM-ACTOR-BINDING, -ENTITLEMENT, -SCOPED-CREDENTIAL, DEP-CLT-READ-SCOPE) + DEP-LED-CLOSURE-CONTRACT |
| 4 | Restrictions apply/lift/**cancel scheduled**, time-effective resolution, housekeeping job | Phase 3 | governed-apply set + DEP-FREEZE-GOVERNANCE |
| 5 | Closure: initiation → drain → pre-seal readiness → final-approval seal → post-barrier attestation → complete; **governed abort**; attester port | Phase 3; LED-01 contract (DCR-ACC-LED-01c/-01e) for a real attester, otherwise a labelled test double | governed-apply set + DEP-LED-CLOSURE-CONTRACT |
| 6 | Client read routes | Phase 2 | DEP-PUBLIC-PERIMETER + DEP-CLT-READ-SCOPE |
| 7 | Reconciliation extract + checks | LED-01 / REC-01 | — |

ACC-01 sits **before** LED-01 in the build sequence (Module Index §18). Phases 0–5 build against **explicit labelled test doubles** for the IAM-02 actor-binding and entitlement contracts; operating them with real actors requires `DEP-IAM-ACTOR-BINDING` and `DEP-IAM-ENTITLEMENT` to be evidenced — the v0.1 claim that the accepted IAM-02 baseline was sufficient stays withdrawn (RF-01, R2-F04). Real governed ACC-01 apply remains gated until the owning IAM-02 change exists (ACC-R2-HD-07). No phase may provision a general CLT-01 or IAM-02 token, even for DEVELOPMENT/TEST (ACC-R2-HD-08).
