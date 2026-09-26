# ACC-01 Account Structure — Master Account & Subaccount
## 01 Module Blueprint (v0.4)

**Status: REMEDIATED (round 3, under a human-decision escalation) / AWAITING RE-REVIEW. Planning only — no code, no migration. Nothing is accepted; implementation is not authorised.**

v0.4 remediates `04-review-r3.md` (R3-F01…F07) under the three round-3 human decisions ACC-R3-HD-01…03 (file 17 §4.4), recorded in `06-human-decision-r3.md`. ACC-R3-HD-01 **amends** ACC-R2-HD-04. Rules changed in v0.3 are marked **(R2)**; rules changed in v0.4 are marked **(R3)**.

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

`DEC-011 #n` = decision pack §4.9 item *n*. **N** = new or materially changed in v0.2; **(R2)** = new or materially changed in v0.3; **(R3)** = new or materially changed in v0.4.

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
| ACC-REQ-012 | Create, **seal**, **abort closure**, restrict, lift and **cancel a scheduled restriction** occur only through a governed maker-checker change request with IAM-02 request/apply and execute-verify, mirroring the accepted CLT-01/CFG-01 pattern (**N**, RF-07; **(R2)** seal/abort/cancel added). **(R3, ACC-R3-HD-02) Closure *initiation* is not maker-checker: it is maker-only, entitlement-checked and audited** (ACC-REQ-054). Closure *completion* is not a change request: it is a machine-verified compare-and-set (ACC-REQ-044) | DEC-011 #7; Module Index rule 10; Role Matrix §23 |
| ACC-REQ-013 | A master account may be created only for a client that is `active` or `active_limited` and whose class is institutional, HNWI or professional; anything else, or an unreadable CLT-01, fails closed. **This is a local structural backstop, not an eligibility authority** (**N**, RF-11) | Doc 00 §10.2A; System Rules fail-closed |
| ACC-REQ-014 | Effective status is computed live from client, master and subaccount state; any unreadable input yields `unknown`, which consumers must treat as deny | Doc 00 §21 rule 1, condition 9 |
| ACC-REQ-015 | Restrictions (partial, suspension, full freeze) apply to a master account or one subaccount and are lifted under maker-checker, with the FRZ-RULE-002 scopes that apply to accounts | FRZ-RULE-001/002; WF-26; Role Matrix §23 |
| ACC-REQ-016 | Closure is preventive and multi-step: `closing` (**draining**, closure-drain allow-list only) → pre-seal readiness → **final checker approval** → `closure_sealed` (barrier) → fresh **post-barrier** attestation → machine-verified `closed`. A posting barrier is in force before the final attestation is taken, and closure completes only while the barrier stands. A governed abort path exists (ACC-REQ-045). **(R3)** For a master, the whole closure family completes in one atomic transaction (ACC-REQ-046) (**N**, RF-03; **(R2)** F01) | OFF-RULE-001; WF-27; approved closure-safety decision; ACC-R2-HD-01/02/03; ACC-R3-HD-01 |
| ACC-REQ-017 | No account row is ever hard-deleted; retention follows the platform/client-record retention policy once defined; ACC-01 sets none (**N**) | DEC-011 #6; approved retention decision |
| ACC-REQ-018 | A master account is created with exactly one default `general` subaccount, atomically. The default is **structural only** (**N**, ACC-HD-1). **(R3)** The default may **never** be closed independently while its master is non-`closed`; it becomes `closed` only in the same transaction as its master (ACC-REQ-046, ACC-REQ-050) | Decision pack §4.7; ACC-HD-1 |

### 4.3 Permissions and eligibility

| ID | Requirement | Source |
|---|---|---|
| ACC-REQ-019 | Permission codes `acc1.*` are registered in the IAM-02 catalogue; `licence_locked = false` | migration 022 precedent |
| ACC-REQ-020 | ACC-01 supplies a scope-*validation* seam for narrowing-only subaccount-scoped grants; IAM-02 owns grant model and enforcement | DEC-011 #8; Role Matrix §5.2A, §30 item 19 |
| ACC-REQ-021 | A permission grant, a subaccount purpose, an account status, or the default subaccount never activates a capability | DEC-013; DEC-014; Role Matrix §3.7; Module Index rule 11 |
| ACC-REQ-022 | Client-facing reads are membership-scoped; a foreign or unknown account is observationally identical to "no access" | CLT-01 principal-membership seam |
| ACC-REQ-023 | Maker ≠ checker; the approval is bound to the exact request payload fingerprint. **Under current IAM-02, neither maker nor checker is entitlement-checked, and the authenticated caller performing apply is not proven to be the maker; real governed apply is therefore gated by `DEP-IAM-ENTITLEMENT` and `DEP-IAM-ACTOR-BINDING`, each satisfied only by per-call behavioural evidence from IAM-02 (§4.5, ACC-REQ-053)** (**N**, RF-01; **(R2)** F04; **(R3)** F03/F04) | Role Matrix §3.4; `IAM2-FIND-002`; ACC-R2-HD-07 |
| ACC-REQ-038 | **N** ACC-01 assigns no roles and invents no maker/checker authority; the Role & Permission Matrix and IAM-02 define them | ACC-HD-2 |
| ACC-REQ-039 | **N** For any transaction-producing activity, a non-`active` account state means **DENY** unless that specific activity is explicitly authorised by authoritative policy (the closure-drain allow-list of ACC-REQ-043 is the only such authorisation defined in this pack); `blocked_scopes` is explanatory evidence, never an allow/deny list. **(R2)** Consumers evaluate **`closure_barrier` first**, then the structural component statuses, then product/activity policy (§10); the single `effective_status` label is descriptive and never the gate | RF-04; ACC-R2-HD-05 |

### 4.4 Audit, integration, environment

| ID | Requirement | Source |
|---|---|---|
| ACC-REQ-024 | Every creation, state change, restriction, lift, closure step and blocked ownership mutation emits SEC-01 audit; a state-changing action fails closed if its audit cannot be recorded | DEC-011 #6; Module Index rule 9 |
| ACC-REQ-025 | Status history is append-only and gap-free relative to stored status | file 13 |
| ACC-REQ-026 | Audit records and resolve responses carry the evaluating environment | Role Matrix §3.8 rule 5 |
| ACC-REQ-027 | Resolve returns `client_id`, `master_account_id`, `subaccount_id`, purpose, own/master/client status, time-effective restriction status per level, effective status (descriptive), **`closure_barrier`, `closure_draining`, closure/seal version evidence (R2) and the closure initiation id (R3, the CDA-1 discriminator)**, explanatory scopes, applied restriction ids, and version evidence | DEC-011 #9–#12; ACC-R2-HD-05 |
| ACC-REQ-028 | A batch resolve exists for high-volume consumers | Performance |
| ACC-REQ-029 | An open-accounts seam lets CLT-01 refuse client closure while non-closed accounts exist | OFF-RULE-001; DCR-ACC-CLT-01 |
| ACC-REQ-030 | Closure requires (a) an affirmative **pre-seal readiness** result before the seal and (b) a **post-barrier** attestation from LED-01 (and later WLT-01/others) carrying the observed seal version, journal watermark, maximum resolution version observed by committed postings and in-flight status; only the **latest** attestation per target + attester + current seal version counts, **and only if bound to the readiness pinned in that seal (ACC-REQ-052)**; absent, unreachable, unconfigured or mismatched ⇒ blocked (fail closed) (**N**; **(R2)** F01; **(R3)** F02) | OFF-RULE-001 items 1–5 |
| ACC-REQ-031 | Internal seams use per-consumer-module capability secrets; ACC-01 itself **never** holds CLT-01's or IAM-02's general internal credential, **in any environment** — least-privilege peer credentials (or explicit labelled test doubles) are required in DEVELOPMENT and TEST too; no "temporary broad token" exception exists (**N**, RF-05; **(R2)** F05, ACC-R2-HD-08) | FND rate-limit precedent; `IAM_INTROSPECTION_SERVICE_TOKEN` precedent |
| ACC-REQ-032 | A read-only reconciliation extract supports LED-01/REC-01 structural reconciliation | DEC-011 #12 |
| ACC-REQ-033 | FND envelope, request/correlation IDs, idempotency keys on mutations | CLT-01 04 §1 |
| ACC-REQ-034 | No route path contains a fragment rejected by `assertNoExchangeRuntime` | `no-exchange.ts` |
| ACC-REQ-035 | **(R2)** Behaviour is identical in the five environments. ACC-01 contains **no environment-name logic that permits, denies or relaxes any operation**; environment availability of ACC-01 capability belongs to CFG-01 (ACC-R2-HD-06). The evaluating environment is recorded in audit and responses (ACC-REQ-026) and is never a branch condition. Environment-agnostic dependency prerequisites (§4.5) apply identically everywhere | DEC-013 clause 2; Doc 00 §21A rule 7; §1.D |
| ACC-REQ-036 | No column, flag or field is named or used as an `enabled` capability boolean | DEC-013; DEC-014 |
| ACC-REQ-037 | The model supports wallet-destination scoping, ledger posting, Spot/OTC/Pay/RWA attribution and reconciliation without coupling to any product | DEC-011 #9–#12 |
| ACC-REQ-040 | **N** Service readiness (`/internal/acc1/readiness`) validates ACC-01's **own configuration only**, never peer liveness or peer contract, and **never reports a `DEP-*` prerequisite as satisfied** (dependency evidence is verified per operation, §4.5), so no boot-order cycle exists. **(R3)** Not to be confused with *closure* pre-seal readiness, which is an attester evidence row | RF-10; R3-F03 |
| ACC-REQ-041 | **N** Every restriction change (apply, activation, lift, expiry, **cancellation**) increments the target row's `version`; a scheduled restriction is effective from `effective_from_utc` regardless of housekeeping (**RF-08**) | RF-08 |
| ACC-REQ-042 | **(R2)** `closure_barrier` is an **authoritative independent fact** stored on each master and subaccount and returned by `resolve`, with closure/seal version evidence. It is set only by the `closing → closure_sealed` transition and cleared only by the governed recovery transaction (ACC-REQ-045). It is **never** encoded solely through `effective_status`; a more severe descriptive status (`frozen`, `suspended`, `restricted`, anything) never masks it | ACC-R2-HD-05; R2-F03 |
| ACC-REQ-043 | **(R2)** A target in `closing` may perform **only** the explicit **closure-drain allow-list** (§7.1): the activity required to satisfy WF-27 / OFF-RULE-001. `closing` is not a generally active state; the allow-list is closed, fail-closed, and changeable only by an authoritative master via governed change | ACC-R2-HD-01; R2-F01 |
| ACC-REQ-044 | **(R2)** Closure timing follows WF-27: an entitled **maker** initiates closure (no checker, ACC-REQ-054); pre-seal readiness proves the target drained and closure-ready; a **checker's ONE final human approval** is given immediately before the seal (a governed change request) and is bound to the exact readiness evidence (ACC-REQ-052); after the seal, the fresh post-barrier attestation and `closed` are **machine-verified**, with **no second checker** | ACC-R2-HD-02; ACC-R3-HD-02; WF-27 steps 9–10 |
| ACC-REQ-045 | **(R2)** A governed **abort / recovery** path exists from `closing` and from `closure_sealed`: maker-checker only, fully audited (Critical), evidence-conditioned (not a normal operational shortcut; cannot bypass closure requirements); it invalidates all closure evidence, bumps versions, clears the barrier only inside that transaction, restores only ACC-01's own recomputed projection and never restores anything another authority denied. There is no uncontrolled "reopen" route. **(R3)** Abort needs **no LED-01 dependency** (it must work when the attester or its contract is what failed) and, for a master, reverses the master, the default and every master-directed child still in the family — never an independently initiated child closure (§7.4) | ACC-R2-HD-03; ACC-R3-HD-01; R3-F05 | ACC-R2-HD-03; R2-F01 |
| ACC-REQ-046 | **(R3, ACC-R3-HD-01 — amends ACC-R2-HD-04)** **Master-family closure.** On master closure the master, its default `general` subaccount and every master-directed non-`closed` child enter `closing` atomically under one closure family. Each master-directed child drains, is pinned-ready, receives its own final checker approval, is sealed and attested — and **stops at `closure_sealed`**; it does **not** become `closed` individually. The master may seal only when every master-directed child is sealed with a fresh clear attestation and every independent child is `closed`. **Final completion closes every master-directed child, the default and the master in ONE atomic transaction** that re-verifies all evidence. Master abort before completion reverses the whole family (§7.4) | ACC-R3-HD-01; R3-F01 |
| ACC-REQ-047 | **(R2)** ACC-01 enforces **environment-agnostic dependency prerequisites** (`DEP-*`, §4.5) and nothing else about availability. Development/testing may satisfy a **runtime** dependency with an explicit **labelled test double of the target contract** injected at a test composition root — dependency injection, not an ACC-01 environment bypass. **(R3)** A double never satisfies a dependency in the production composition root, and no configuration value can | ACC-R2-HD-06; R2-F08; ACC-R3-HD-03 |
| ACC-REQ-048 | **(R2)** ACC-01 never claims that current IAM-02 proves the authenticated caller performing apply is the maker. Real governed apply requires attested actor binding from IAM-02 (`DEP-IAM-ACTOR-BINDING`, DCR-ACC-IAM-06); ACC-01 consumes attested facts, never body-asserted `actor_id` / `approval_id`. **(R3)** The actor must be verified by IAM-02 **independently of ACC-01** (§4.5); an assertion minted by ACC-01 never satisfies `DEP-IAM-ACTOR-BINDING` | ACC-R2-HD-07; R2-F04; R3-F04 |
| ACC-REQ-049 | **(R2)** A scheduled restriction that has **not yet become effective** can be cancelled through a governed `cancel_scheduled_restriction`; a restriction already effective **by time** can be lifted even if housekeeping has not advanced its stored state. Effective-time evaluation alone decides legality; the housekeeping job never does. **(R3)** "Now" is the **database** `clock_timestamp()` read inside the locked check, never the application clock (§7 of file 05; R3-F07) | R2-F07; R3-F07 |
| ACC-REQ-050 | **(R3)** **Structural invariant.** *Every non-`closed` master account has exactly one non-`closed` default `general` subaccount, and a `closed` master has only `closed` subaccounts.* It is enforced by a deferred constraint trigger evaluated at commit (`trg_acc1_master_default_invariant`, file 05 §5), checked by reconciliation R-8 and asserted by tests after every step of every closure scenario (T-206). An `ACTIVE`/non-`closed` master with a `closed` default is unrepresentable | ACC-R3-HD-01; R3-F01 |
| ACC-REQ-051 | **(R3)** **Closure-family membership is explicit and identified.** A master closure creates a `closure_family` (id = the master's initiation record) with an immutable `closure_family_member` row per participant: `master`, `default`, `master_directed_child`, or `independent_preserved` (a child whose own earlier closure is in flight). A subaccount closure is **master-directed** iff its row carries that `closure_family_id`; **independent** iff it entered `closing` through its own `close_subaccount` initiation (`closure_family_id IS NULL`). Independent closures are never adopted, never completed by the family and never reversed by a master abort (§7.4) | ACC-R3-HD-01; R3-F01, R3-F05 |
| ACC-REQ-052 | **(R3)** **The checker's approved readiness is pinned into the seal.** The seal request binds the exact readiness evidence (row id, sequence, watermark, payload hash, closure cycle, target version, family set hash, seal payload hash, approval and policy ids); seal apply persists that binding as an immutable `closure_seal_pin`; completion and the post-barrier attestation compare against the **pin**, never against "the latest readiness". A readiness row cannot be inserted once the target has left `closing` (§7.2) | ACC-R3-HD-01; R3-F02 |
| ACC-REQ-053 | **(R3, ACC-R3-HD-03)** **Dependency evidence rule.** A configuration string or self-declared contract version **never** satisfies a safety dependency. A `DEP-*` is satisfied only by (A) behaviour or evidence ACC-01 verifies from the authoritative owning service at the time of the operation, or (B) an authoritative governance/control source outside ACC-01's own mutable configuration. A governance-only dependency with no runtime seam is **hard-unsatisfied in code** until an authoritative governance checkpoint closes it (§4.5). Missing, unknown, unreadable or malformed evidence never permits | ACC-R3-HD-03; R3-F03 |
| ACC-REQ-054 | **(R3, ACC-R3-HD-02; resolves OQ-13)** **Closure initiation is maker-only + entitlement-checked + audited; it is NOT maker-checker.** It uses a **non-approval** entitlement-checkable permission (`acc1.*.close_initiate`), never an approval-gated code whose `approval_required` short-circuit would bypass entitlement (`IAM2-FIND-002`). The ONE final human approval is the checker's seal approval (ACC-REQ-044). Real initiation is externally gated by `DEP-IAM-ENTITLEMENT`/`DEP-IAM-ACTOR-BINDING` until IAM-02/Role Matrix deliver the maker-initiation seam (DCR-ACC-IAM-07) | ACC-R3-HD-02; R3-F06 |

### 4.5 Dependency prerequisites (RF-01, RF-02, RF-05, RF-09; ACC-HD-2; **(R2)** ACC-R2-HD-06/07/08; **(R3)** ACC-R3-HD-03)

**Ownership rule (ACC-R2-HD-06).** ACC-01 implements **no** environment-availability control. **CFG-01 is the sole authority** for whether an ACC-01 capability is available in DEVELOPMENT, TEST, UAT, DEMO or PRODUCTION (`ENVIRONMENT_AVAILABILITY`). v0.2's real-use gates G1–G6 keyed operations on environment names; they are **withdrawn**. There is no `if environment == …` allow, deny or relax anywhere in ACC-01, and the evaluating environment is never a branch condition. ACC-R3-HD-03 does **not** move environment control back into ACC-01.

What ACC-01 **does** enforce are **environment-agnostic safety/dependency prerequisites**: a governed operation refuses (`ACC1_DEPENDENCY_NOT_SATISFIED`, carrying the dependency id, an `evidence_failure` code and the evidence `provider`, audited) while a *named dependency's safety property is not evidenced*. The same rule applies identically in every environment. These are safety/dependency states, **not** capability-environment states (ACC-REQ-036 unchanged: nothing is an `enabled` flag).

**Evidence rule (ACC-R3-HD-03, ACC-REQ-053).** A configuration string, a configured contract version or any other self-declared value **can never by itself satisfy a safety dependency.** A `DEP-*` is satisfied only by:

- **(A) behaviour or evidence ACC-01 verifies from the authoritative owning service, at the time of the operation** (*runtime* dependencies); **or**
- **(B) an authoritative governance / control source outside ACC-01's own mutable configuration.** Where such a source has **no runtime verification seam**, the dependency is **hard-unsatisfied in code** until an authoritative governance checkpoint closes it (*governance-only* dependencies).

Never permitted: unknown, missing, unreadable, malformed or partially populated evidence ⇒ **refuse**; a peer token "because it functions"; environment-name branching; a local Boolean or `*_REF` / `*_CONTRACT_VERSION` setting that pretends a governance or contract decision exists. Configuration may say **where** to ask (a base URL) and **which narrow credential to present**; it never says **what the answer is**.

| Dependency | Safety property that must be evidenced | Authoritative source | How ACC-01 verifies it | What failure looks like | Class |
|---|---|---|---|---|---|
| **DEP-IAM-ACTOR-BINDING** | The **authenticated apply/initiating actor** is the maker and was authenticated by an authority **outside ACC-01** (ACC-R2-HD-07; R3-F04) | **IAM-02**, verifying the actor against **IAM-01** through its own trusted seam (IAM-01 authenticated-session reference, recent-auth reference, or an IAM-01-produced verifiable identity assertion) | **Per call**, through the actor-binding successor seam of DCR-ACC-IAM-06 (a seam distinct from today's `execute-verify`, so a peer without it answers 404/405 and **no token is consumed**). ACC-01 forwards the IAM-01 session/recent-auth reference **it received from the caller** — it never mints, signs or transforms an identity assertion (an assertion minted by ACC-01 does **not** satisfy the dependency). It requires the attested record to name `actor_assertion_authority` (who verified the actor) and to bind `authenticated_actor_id`, maker/initiating actor, checker where applicable, `approval_id`, `policy_id`, entitlement evidence, `payload_hash`, `action`, `resource`, entity/client scope | Seam absent (404/405/501), non-2xx, timeout, malformed body, any bound field missing or unequal to the request, `actor_assertion_authority` missing ⇒ `ACC1_DEPENDENCY_NOT_SATISFIED`; request unchanged | **Runtime** |
| **DEP-IAM-ENTITLEMENT** | Maker **and** checker (seal, abort, create, restriction changes) or the **initiating maker** (closure initiation, ACC-R3-HD-02) hold an entitlement that IAM-02 **actually evaluated**, not bypassed by the `approval_required` short-circuit | **IAM-02** policy/grant evaluation | **Per call**, from the same attested record (initiation: from the attested maker-initiation decision of DCR-ACC-IAM-07). It must carry explicit `entitlement_evidence` — per relevant role (`maker` / `checker` / `initiator`): `{ evaluated: true, actor_id, permission_code, decision: "allow", grant_ref, policy_id, evaluated_at }`. ACC-01 checks each block is for the identified actor and the expected `acc1.*` code. A bare `approval_required`, or `execution_authorised = true` alone, **never** counts. Whether `IAM2-FIND-002` is open is **not** consulted and cannot be declared: only the presence of the proof counts | Evidence block absent, `evaluated ≠ true`, other actor, other permission code, empty `grant_ref` ⇒ refused | **Runtime** |
| **DEP-IAM-SCOPED-CREDENTIAL** | ACC-01 can call **only** `permission/check` and the actor-binding/verify seam, never IAM-02's approval-creating or other mutating routes (ACC-R2-HD-08) | **IAM-02 credential metadata** | **Per call**: every IAM-02 response states the scope of the credential presented (`credential_scope`, `credential_id`; DCR-ACC-IAM-05). ACC-01 accepts only an exact narrow set (`permission.check`, `permission.verify_attested`); a credential IAM-02 reports as general or mutation-capable, or a response with **no** scope statement, is refused. ACC-01 does **not** compare a configured token to IAM-02's general token (it cannot know that value) | No scope statement, broad/general scope, unknown scope ⇒ refused. Under today's IAM-02 the only working credential is the general one and states no scope ⇒ **unsatisfied by design** | **Runtime** |
| **DEP-CLT-READ-SCOPE** | ACC-01 reads CLT-01 client status/class only through a **read-scoped** credential, for **every** read: resolve, batch, submit, apply-time reads, reconciliation R-3 (ACC-R2-HD-08) | **CLT-01 seam / credential metadata** | **Per read**: the status response states the scope of the credential presented (DCR-ACC-CLT-03), e.g. `clt1.client_status.read`. On the resolve hot path this is a field check of the response ACC-01 already receives — no extra call. Exact match required | No scope statement or another scope ⇒ resolve returns `unknown`; submit/apply refused; R-3 inconclusive. There is **no fallback** to a broader credential | **Runtime** |
| **DEP-LED-CLOSURE-CONTRACT** | LED-01 provides the closure contract: barrier refusal, closure-drain allow-list, **pre-seal readiness**, **post-barrier attestation** with a **commit-ordered** watermark and resolution-version evidence (DCR-ACC-LED-01c/-01e). Creation also requires it because a created account must be closable (approved RF-02 decision) | **The actual LED-01 attester(s)** | (i) At each operation that needs it (creation apply, closure initiation, readiness/attestation collection, seal) ACC-01 **fetches the attester's contract descriptor from the attester itself** — an operation-time call, outside service readiness, so RF-10 holds — and requires every capability it must have to be declared: barrier refusal, allow-list version, readiness, attestation, `commit_ordered_watermark = true`. (ii) Closure calls are themselves behavioural: every readiness/attestation response is shape- and field-validated. The descriptor's contract ref is recorded on every evidence row (`attester_contract_ref`). Attester **base URLs** are configuration; the answer is not | Attester unreachable, descriptor malformed/incomplete/stale, `commit_ordered_watermark ≠ true`, a response failing validation ⇒ refused. Empty attester set ⇒ `ACC1_CLOSURE_ATTESTERS_UNCONFIGURED`. **Honest limit:** at creation the descriptor is the strongest evidence obtainable (a drain cannot be proven before an account exists); it comes from LED-01 at operation time and never from configuration | **Runtime** (not needed by abort, §7.3) |
| **DEP-FREEZE-GOVERNANCE** | Ownership of whole-client freeze, `login_block` and their relation to an ACC-01 restriction is governed (WF-26; DCR-ACC-GOV-05) | An **authoritative governance record** (decision closing DCR-ACC-GOV-05) — no runtime seam exists | **Cannot be verified at runtime.** The production composition root binds a **hard-unsatisfied gate**: `apply_restriction`, `lift_restriction` and `cancel_scheduled_restriction` always refuse. It is lifted only by an **approved, conductor-managed ACC-01 task** that cites the closing governance record and changes that code under independent review. No configuration value, reference string, environment or flag can lift it | Always `ACC1_DEPENDENCY_NOT_SATISFIED` (`evidence_failure = GOVERNANCE_HARD_UNSATISFIED`) | **Governance-only** |
| **DEP-PUBLIC-PERIMETER** | The public-perimeter/rate-limit prerequisites for any client-facing route are closed (`FND-FIND-001`, FND-01 engine, IAM-01/-03 for scoped reads) | An **authoritative governance record** closing `FND-FIND-001` and DCR-ACC-FND-01 — no runtime seam exists | As above: the production composition root binds a hard-unsatisfied gate; `/acc1/client/*` routes are **not served**. Lifted only by an approved ACC-01 task citing the closing record | Client routes absent / `ACC1_DEPENDENCY_NOT_SATISFIED` (`GOVERNANCE_HARD_UNSATISFIED`) | **Governance-only** |

`DEP-IAM-SCOPED-CREDENTIAL` is an addition to the six named examples of ACC-R2-HD-06; it is needed because ACC-R2-HD-08 requires least-privilege peer credentials in every environment.

**Which operation needs which dependency** (an operation refuses unless **all** listed dependencies are satisfied for **that** operation):

| Operation | Required dependencies |
|---|---|
| Any governed apply (create, **seal**, **abort**, restrict, lift, cancel) | DEP-IAM-ACTOR-BINDING, DEP-IAM-ENTITLEMENT, DEP-IAM-SCOPED-CREDENTIAL, DEP-CLT-READ-SCOPE (apply-time status read) |
| Change-request **submit** (any type) | DEP-CLT-READ-SCOPE (submit reads CLT-01), DEP-IAM-SCOPED-CREDENTIAL (baseline `permission/check`) |
| `create_master_account`, `create_subaccount` | the governed-apply set **plus** DEP-LED-CLOSURE-CONTRACT (descriptor fetched at apply) |
| **Closure initiation** (maker-only, **(R3)**) | DEP-IAM-ACTOR-BINDING and DEP-IAM-ENTITLEMENT (attested maker-initiation decision, DCR-ACC-IAM-07), DEP-IAM-SCOPED-CREDENTIAL, DEP-CLT-READ-SCOPE, DEP-LED-CLOSURE-CONTRACT |
| Closure readiness / attestation collection | DEP-IAM-SCOPED-CREDENTIAL (baseline check), DEP-LED-CLOSURE-CONTRACT |
| Closure **seal** | the governed-apply set **plus** DEP-LED-CLOSURE-CONTRACT |
| **Closure abort (R3, R3-F05)** | **the governed-apply set only — NOT DEP-LED-CLOSURE-CONTRACT.** Abort makes no LED-01 call: it verifies ACC-01's own readiness/attestation/family rows, so it stays available when the attester or its contract is the thing that failed |
| Closure **completion** (`close/complete`, family completion) | DEP-IAM-SCOPED-CREDENTIAL (a non-approval, entitlement-checked route). It makes no outbound LED-01 call; it verifies stored evidence whose `attester_contract_ref` was recorded when it was collected |
| `apply_restriction`, `lift_restriction`, `cancel_scheduled_restriction` | the governed-apply set **plus** DEP-FREEZE-GOVERNANCE (**hard-unsatisfied**) |
| `resolve`, `resolve-batch` | DEP-CLT-READ-SCOPE |
| `open-accounts`, `scope-validate`, reconciliation extract | none (they make no CLT-01 or IAM-02 call) |
| `/acc1/client/*` (phase 6) | DEP-PUBLIC-PERIMETER (**hard-unsatisfied**), plus DEP-CLT-READ-SCOPE |

**What ACC-01 can and cannot prove at boot (R3-F03 item 4).** ACC-01 can prove that its own configured secrets and dedicated credentials are present and **mutually distinct**, and — by a source guard — that no code references a general CLT-01/IAM-02 token **variable name**. It **cannot** hold or compare the peers' general token values, so it does **not** claim to detect "a dedicated credential equal to a general peer token" at boot. What it does instead is the **per-call scope assertion** in the table above (IAM-02 and CLT-01 each state the scope of the credential presented; anything but the narrow scope is refused), which is a behavioural proof, not a boot-time guess.

**Test doubles — dependency injection, not an environment exception (ACC-R2-HD-06).** Development and testing may satisfy a **runtime** dependency with an **explicit, labelled test double of the target contract** (`provider = test_double`, with a label). A double is injected only at a **test composition root**; the service's production composition root imports none, and **no configuration value, environment variable or environment name can select one** (source guard, T-121). ACC-01 verifies a double's answers exactly as it would a real peer's, so the tests exercise ACC-01's verification logic. Every dependency verification record carries its `provider` (`real` | `test_double`) into audit. A **governance-only** dependency can likewise be exercised in tests only by a labelled double injected at the test composition root; the production composition root binds the hard-unsatisfied gate (T-224).

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

Operational projection: `active` ⇄ `restricted` | `suspended` | `frozen` (projection of active restrictions). Closure lifecycle **(R2, R3)**:

```txt
ACTIVE / RESTRICTED / SUSPENDED / FROZEN
  → INITIATION                     maker-only, entitlement-checked, audited (ACC-R3-HD-02); NOT maker-checker
  → CLOSING (draining)             closure-drain allow-list only
  → PRE-SEAL READY                 evidence, not a status (file 05 closure_readiness)
  → FINAL CHECKER APPROVAL         the ONE final human approval; binds the EXACT readiness row(s) (R3-F02)
  → CLOSURE_SEALED                 closure_barrier = true; immutable seal pin persisted
  → POST-BARRIER LED ATTESTATION   fresh, latest-per-attester, bound to the pin
  → CLOSED                         machine-verified compare-and-set (terminal)

  independent target       : own compare-and-set closure_sealed → closed
  master-directed child    : STOPS at closure_sealed; becomes closed only inside the master's atomic family completion (§7.4)

governed abort: CLOSING | CLOSURE_SEALED → recomputed operational projection (master abort = whole family, §7.4)
```

- No `pending` state on the row: a proposed account exists only as a **change request** until an approved apply creates it `active`.
- **Closure is preventive (approved) and completable.** The v0.2 design let a funded account enter `closing` and become un-drainable and un-exitable (R2-F01). v0.3 fixed that in four ways — (a) `closing` permits the **closure-drain allow-list** (§7.1); (b) a **pre-seal readiness** result must show the target drained; (c) a **governed abort** exists (§7.3); (d) the attestation contract is version/watermark based and latest-attestation-only (§7.2). **v0.4 adds** (e) the readiness the checker approved is **pinned into the seal** (§7.2, R3-F02) and (f) a master closes as an **atomic family** so no `closed` default ever stands under a non-`closed` master (§7.4, R3-F01).
- **`closure_barrier` is an independent fact.** Sealing sets `closure_barrier = true` and increments `closure_seal_version`. Every consumer, LED-01 included, refuses **every new posting when `closure_barrier = true`** — never "when `effective_status == closure_sealed`" — regardless of whether the descriptive status is `frozen`, `suspended`, `restricted` or anything else (§10, ACC-REQ-042).
- **Initiation and final approval (ACC-R3-HD-02, ACC-R2-HD-02, WF-27).** An entitled **maker initiates** closure with an audited, entitlement-checked, **maker-only** request — there is no checker at initiation. After drain, pre-seal readiness proves the target closure-ready; a **checker performs the one final human approval immediately before sealing** — the `seal_closure` change request, whose approved payload binds the exact pre-seal readiness evidence. After the seal, the post-barrier attestation and completion are **machine-verified**; **no second checker** is required and none is designed. (v0.3's default of a maker-checker initiation, recorded as OQ-13, is **replaced**; OQ-13 is resolved by ACC-R3-HD-02.)
- **Master closure and children (ACC-R3-HD-01, amending ACC-R2-HD-04).** See §7.4: master, default and every master-directed child enter `closing` together, each child seals and **stops at `closure_sealed`**, the master seals when every master-directed child is sealed and attested, and **one atomic transaction** then closes every master-directed child, the default and the master. Master abort before that reverses the whole family. There is no circularity: child sealing waits on nothing; master sealing waits on child *sealing*; completion waits on the master's own attestation and closes all together.
- `closed` is terminal; identifiers are never reused.

### 7.1 Closure-drain allow-list (ACC-R2-HD-01)

A target in `closing` may perform **only** the activity below, and only where **every other component** still permits it (a time-effective restriction or a non-`active` client status continues to deny; drain never overrides a restriction or another authority). Everything else stays denied: no new trade, deposit, investment/subscription, payout destination or Exchange/securities-market activity, and no other transaction-producing business unrelated to closure.

| ID | Closure-drain activity | Bound |
|---|---|---|
| CDA-1 | Return the remaining client balance to a **verified own-name** destination | Existing verified destination only; **no new payout destination**. **(R3-F07.3)** The activity must be **bound to the closure initiation id** (`closure.closure_initiation_id` per level, returned by `resolve`); a consumer never treats an arbitrary withdrawal to a verified own-name destination as a closure return |
| CDA-2 | Finish an **already-open** withdrawal | Only where completion is required for closure; no new withdrawal |
| CDA-3 | Finish an **already-open** settlement | Only where completion is required for closure; no new settlement |
| CDA-4 | Resolve reconciliation breaks necessary for closure | Structural/ledger repair only through the owning module's governed process |
| CDA-5 | Other closure-only operations **explicitly required by an authoritative master** | **None defined.** Adding one needs a master citation and a governed change to this list (fail closed) |

`closing` is **not** a generally active state. The list is closed, explicit and fail closed: an activity not named here is denied under `closing`. Consumers evaluate it as a narrowing exception in §10 step 2; ACC-01 supplies `closure_draining` and never itself performs the activity. **A master-directed child in `closure_sealed` is barred (barrier), not draining; only `closing` drains.** Broader status→activity policy for other non-`active` states remains DCR-ACC-GOV-04.

### 7.2 Pre-seal readiness, the seal pin and post-barrier attestation (DCR-ACC-LED-01c)

**Pre-seal readiness** (target in `closing`; ACC-01 → LED-01 attester port; recorded in `closure_readiness`). It prevents sealing a funded or undrained account. The **attester** must return an affirmative result proving **at minimum**:

- no remaining balance **or** the authorised balance-return action complete (`balance_state ∈ {none, returned}`; **no amount is ever stored**, ACC-REQ-007);
- no open withdrawal requiring completion; no open settlement requiring completion;
- no unresolved reconciliation break that blocks closure;
- no in-flight posting that has not been accounted for.

**Master-level readiness conditions (R3-F07.1).** For a master these are the attester's master-level obligations **plus ACC-01's own family facts** (never attester assertions): every master-directed child (default included) is `closure_sealed`, carries the barrier and its own seal pin, and has a **fresh, clear post-barrier attestation** at its current seal version; every independent child is `closed`. "Attestation" is a post-barrier concept and is **not** a pre-seal readiness condition of the master's own row — it is a *family eligibility* condition checked at the master's seal (§7.4).

The attester also returns `journal_watermark` (W_pre — a **commit-ordered** position, see below), `max_resolution_version_observed`, `closure_cycle_observed`, `evidence_ref` and `as_of`. ACC-01 stores each result as an append-only row with an immutable public id (`readiness_id`, `crd_` + 24 hex), the monotonic `readiness_seq`, the closure initiation id and family id it belongs to, the **database-set** `target_version_observed`, a `readiness_payload_hash` (fingerprint of the canonical readiness payload) and the `attester_contract_ref`.

**Readiness may be inserted only while the target is `closing` (R3-F02).** A database trigger, in the inserting transaction and under a `FOR SHARE` lock on the target row, refuses the insert unless the target is `closing`, its `closure_cycle` equals `closure_cycle_observed` and its initiation id equals the row's. The route's sequence (status check → outbound attester call → insert) can therefore race a concurrent seal harmlessly: if the seal committed first, the late row is refused (`ACC1_CLOSURE_READINESS_REFUSED`) and is never recorded.

**The seal pin (ACC-REQ-052, R3-F02).** The checker approves *specific evidence*, and exactly that evidence is what the seal records:

1. **Seal request** binds into the canonical approval payload: per attester `readiness_id`, `readiness_seq`, `journal_watermark`, `readiness_payload_hash`; the `closure_cycle`; the target `version`; the closure initiation id; for a master the `closure_family_id` and the **family set hash** (§7.4); and it yields the **seal request payload hash** (IAM-02's fingerprint). The checker's approval id and policy id are attested at apply (`DEP-IAM-ACTOR-BINDING`).
2. **Seal apply** (one transaction, under lock) requires: target `version` = the approved `version` (any restriction, profile edit or other mutation after approval refuses the seal, `ACC1_CLOSURE_APPROVAL_STALE`; a new request and a new approval are needed); `closure_cycle` and initiation id equal; **each pinned readiness row is still the latest row of its attester at this cycle**, is `ready`, and carries the approved watermark and payload hash. The apply-time fresh re-collection from the attester (file 02 §2 A2) is a **verification, not a readiness row**: it must be `ready` with the **same** watermark, and its result is recorded on the pin (`apply_verified_watermark`, `apply_verified_as_of_utc`) — it is never inserted into `closure_readiness`, so it cannot displace the pinned row.
3. It **persists an immutable `closure_seal_pin`** (one row per target and seal version) with one `closure_seal_pin_readiness` row per attester, and sets `closure_seal_pin_id` on the target. Nothing changes them until a governed abort (which clears the target's pin id and bumps `closure_cycle`).
4. **After the seal no readiness row can replace the pinned readiness**: the target is no longer `closing`, so the insert trigger refuses any new row (a `not_ready` row included). A readiness collected after the seal is not considered by anything.
5. **Completion and attestation compare against the pin, never against "the latest readiness".** The attestation request carries the **pinned** watermark as `preseal_watermark_ref`; completion requires `attestation.preseal_watermark_ref = pin.pinned_readiness.journal_watermark` and every other bound field (`seal_pin_id`, `pinned_readiness_id`, `closure_cycle_observed`, `seal_version_observed`).
6. If anything differs from what the checker approved, the **seal refuses** (`ACC1_CLOSURE_APPROVAL_STALE` / `ACC1_CLOSURE_NOT_READY`; new request, new approval) or, after the seal, **completion refuses** and the target stays barred until a governed abort, a fresh drain and a new approval.

**Post-barrier attestation** (target `closure_sealed`; taken **after** the barrier). Version and watermark evidence — wall-clock is only a secondary freshness guard:

| Field | Meaning | Must satisfy for `clear` |
|---|---|---|
| `target_type` / `target_id` | The master account or subaccount | equals the target |
| `seal_version_observed` | `closure_seal_version` the attester observed | equals the target's **current** `closure_seal_version` |
| `seal_pin_id` / `pinned_readiness_id` **(R3)** | Set by the database from the target's pin; the attestation is about **that** sealed readiness | equals the target's pin and the pinned readiness for this attester |
| `journal_watermark` | Target-scoped journal position at attestation (commit-ordered) | opaque, recorded |
| `preseal_watermark_ref` | W_pre echoed from the **pin** | equals `pin.pinned_readiness.journal_watermark` |
| `committed_after_preseal_watermark` | Count of postings committed after W_pre | **0** |
| `max_resolution_version_committed` | Maximum ACC-01 resolution `version` (target level) observed by any **committed** posting, as stored with each posting | **< `closure_sealed_at_version`** (the target `version` written by the seal) |
| `in_flight_count` / `in_flight_status` | Postings resolved on pre-seal evidence and not yet committed at attestation | status ∈ {`none`, `refused_by_fence`}; never `unresolved` |
| `balance_state` / `open_item_count` **(R3, defence in depth)** | The attester's assertion that the target is still drained at attestation time | `balance_state ∈ {none, returned}` and `open_item_count = 0` |
| `attestation_status` | `clear` \| `blocked` | `clear` |
| `evidence_ref`, `as_of`, `attester_contract_ref` | Fresh attestation evidence | `as_of` within `ACC1_ATTESTATION_MAX_AGE_SECONDS` |

**Why this closes the pre-resolve/post-commit race — and what it depends on.** A posting resolved before the seal but committed after it has a journal position after W_pre, so `committed_after_preseal_watermark > 0` and completion blocks; a posting that ignored the barrier carries a resolution version at or after the seal, so `max_resolution_version_committed ≥ closure_sealed_at_version` and completion blocks. The two checks are independent, and the drained-state assertion is a third. **This holds only if (i) W_pre is the one the checker approved (the pin, R3-F02) and (ii) the watermark is a *commit-ordered* position** — an insert-time sequence can give a later-committing transaction a position below W_pre. DCR-ACC-LED-01c therefore **requires** a commit-ordered watermark (or an equivalent LED-01-side guarantee), ACC-01 requires the attester's descriptor to declare it (`DEP-LED-CLOSURE-CONTRACT`), and **if LED-01 cannot provide it the dependency stays unsatisfied and closure cannot complete** — the design accepts no weaker guarantee. LED-01's duty (DCR-ACC-LED-01c): refuse every new posting when `closure_barrier = true`, store the resolve `versions` with each posting, and fence in-flight postings before attesting (refuse them; they are counted, never committed).

**Latest-attestation semantics.** Attestations are append-only rows with a monotonic sequence. Only the **latest** row for **target + attester + current `closure_seal_version`** may satisfy completion, and only if its DB-computed `binding_ok` holds against the pin; a later `blocked` supersedes an earlier `clear`, and a later `clear` supersedes a `blocked` (re-collection is allowed and needs no abort). Completion requires the latest row of **every configured attester** to be `clear`. The latest-row rule applies to readiness per target + attester + `closure_cycle` **until the seal**; from the seal on, the **pin** — not the latest readiness row — is the reference.

### 7.3 Governed abort / unseal (ACC-R2-HD-03; OQ-07 resolved)

If closure cannot safely complete, a **governed recovery** — never an uncontrolled "reopen" route — may return the target from `closing` **or** `closure_sealed` to its operational projection.

- **Maker-checker only**, an IAM-02 governed change request (`abort_closure`), fully audited (**Critical** `acc1.account_closure_aborted`), and **not a normal operational shortcut**: it is legal only when machine evidence shows a closure invariant failing or a blocked/unavailable attestation or readiness (`reason_code` ∈ `preseal_readiness_blocked`, `postseal_attestation_blocked`, `postseal_attestation_unavailable`, `closure_invariant_failed`, `authority_restriction_blocks_closure`, `attester_contract_fault`), which ACC-01 verifies at apply **from its own stored rows**. It cannot be used to bypass a closure requirement and can never apply to a `closed` row. *Stated plainly (R3-F05.4):* in `closing`, any undrained target yields a `not_ready` readiness row, so the evidence condition is satisfied whenever a target is simply not yet drained; "not a normal operational shortcut" therefore rests on **maker-checker, the recorded evidence and the Critical audit**, not on the evidence test alone.
- **No LED-01 dependency (R3-F05).** Abort requires the governed-apply set (`DEP-IAM-*`, `DEP-CLT-READ-SCOPE`) and **not** `DEP-LED-CLOSURE-CONTRACT`. It uses ACC-01's existing closure evidence, the governed actor/entitlement controls and the local family state, and makes no LED-01 call, so it stays available when the LED attester or its contract is what failed.
- In **one transaction**: invalidate all closure-readiness and post-seal attestations (evidence is keyed to `closure_cycle` and `closure_seal_version`; abort bumps `closure_cycle`, never resets `closure_seal_version`, so old evidence can never match a later seal); clear the target's `closure_seal_pin_id` (the pin row itself remains as evidence); bump `version`; **clear `closure_barrier` only here**; recompute the stored status as the **projection of the restrictions in force by time** — never a remembered "prior status"; write history and a `closure_recovery` row; emit the Critical audit.
- **Never restores what another authority denied.** Abort restores only ACC-01's own structural projection. Effective status is still computed live, so a client CLT-01 has suspended, a restriction still in force, or a capability CFG-01 withholds remains denied.
- **Scope (R3).** A **master-directed** subaccount (including the default) cannot be aborted on its own (`ACC1_CLOSURE_FAMILY_MEMBER`, `ACC1_DEFAULT_SUBACCOUNT_PROTECTED`): aborting the **master** reverses the master, the default and every master-directed child still in the family, in one transaction (§7.4). An **independently initiated** child closure is **not** reversed by a master abort; it has its own abort (own evidence) at any time it is `closing` or `closure_sealed`.

### 7.4 Master-family closure (ACC-R3-HD-01 — amends ACC-R2-HD-04; R3-F01)

**Structural invariant (ACC-REQ-050).** *Every non-`closed` master account has exactly one non-`closed` default `general` subaccount; a `closed` master has only `closed` subaccounts.* v0.3 let master-directed children — the default included — become `closed` before the master could complete, so a master abort left an `ACTIVE` master with a permanently `closed` default (R3-F01). v0.4 removes that state by construction: **a master-directed child never becomes `closed` on its own.**

**Identification of membership (ACC-REQ-051).** A master closure creates one `closure_family` (id = the master's initiation record id) and one immutable `closure_family_member` row per participant:

| Membership | Who | Closure of that row |
|---|---|---|
| `master` | the master | own seal after its children; completion **is** the family completion |
| `default` | the default `general` subaccount | master-directed (it is always in the family; it can never be independent) |
| `master_directed_child` | every other non-`closed` child that was operational when the family began | master-directed: enters `closing` with the family, seals, **stops at `closure_sealed`** |
| `independent_preserved` | a non-default child already `closing`/`closure_sealed` through **its own** earlier `close_subaccount` initiation | **not adopted, not re-initiated**; continues its own lifecycle and completes itself |

Rows carry `closure_family_id` (set only when they enter `closing` as family members). **A subaccount closure is master-directed iff its row has a `closure_family_id`; independent iff it entered `closing` through its own initiation (`closure_family_id IS NULL`).** The column is set only at entry to `closing` under the family and cleared only by that family's governed abort. Children that are already `closed` are not listed and are unaffected.

**Sequence.**

1. **Initiation** (maker-only, entitlement-checked, audited; file 02 §7.1). The maker supplies the `family_set_hash` of the listing they saw (a preview route returns it). Under `FOR UPDATE` on the master (then children in ascending internal id) ACC-01 re-derives the set; a difference ⇒ `ACC1_CLOSURE_FAMILY_SET_CHANGED`, nothing changes. Then the master, the default and every operational child enter `closing` **atomically** under the family; independent closures are recorded `independent_preserved` (audited) and left untouched.
2. **Each master-directed child, the default included, drains** (closure-drain allow-list), collects readiness, and receives **its own** seal request with **its own** final checker approval (§7.2). On apply it reaches `closure_sealed` with `closure_barrier = true`, its current seal version and its pin, then collects a post-barrier attestation. **It stops there.**
3. **Master seal eligibility (family eligibility rule).** The master may enter `closure_sealed` only when, verified under lock at apply: every master-directed child is `closure_sealed` with the barrier, its pin intact and a **fresh, current, clear** latest attestation of every attester at its current seal version; **every independent child is `closed`** (an independent child still `closing`/`closure_sealed` blocks the master seal — `ACC1_CLOSURE_FAMILY_INELIGIBLE` — and is neither adopted nor forced); and the master's **own** readiness passes and is pinned (§7.2). The master's approved seal payload binds the **family set hash** (each master-directed member's id, membership, `closure_cycle`, `closure_seal_version`, `closure_sealed_at_version`, pinned readiness ids and latest attestation ids); a child re-attested after approval changes the hash and refuses the seal (new request).
4. **Master attestation**, then **final family completion**: **one atomic transaction** which (a) locks the master then every member in ascending internal id, (b) re-verifies the master's latest current attestation against its pin, (c) re-verifies **every master-directed child's** latest attestation at its **current** seal version against that child's pin, (d) verifies every barrier is still `true`, (e) recomputes the family set hash from the live rows and requires it to equal the master's pinned hash (no version or readiness evidence changed), (f) re-checks the eligibility rule and that no authority restriction is in force, and only then (g) **closes every master-directed child, the default and the master**, writing history (cause `closure_family_complete`, ref = family id), the `closure_family` completion and one Critical audit. Any failure rolls back everything; every member stays `closure_sealed` (still barred) and the governed abort remains available.
5. **Master abort before completion** reverses, in one governed transaction, the **master, the default and every master-directed child still participating in the family** (each: barrier cleared only here, `closure_cycle` + 1, seal version retained, pin id cleared, projection recomputed by time, `closure_recovery` row). **Independent closures are not touched.** The family becomes `aborted`. A later closure is a **new** initiation with a new family id (T-204).
6. An **independent closure** that completes (`closed`) before or during a family closure stays `closed` after any abort; this is legitimate **only because** the structural invariant concerns the default, which by rule is never independent. A child closure initiated independently **after** a family began cannot exist: every non-`closed` child is a member, an independent-preserved child, or already `closed`.

**The default may never be independently closed while the master is non-`closed`** (`ACC1_DEFAULT_SUBACCOUNT_PROTECTED`; `trg_acc1_default_protected`). It reaches `closed` **only** in the same transaction as its master's completion.

**Concurrency and lock order.** Every operation touching a family member acquires the **master row first** (`FOR SHARE` for child-level operations, `FOR UPDATE` for master and family operations) and then children in ascending internal id, so completion, abort, child seal, child attestation and child creation can neither deadlock nor interleave into a partial family. Abort and completion serialise on the master lock: completion-first leaves abort refused on `closed`; abort-first makes completion's re-verification fail (T-207).

## 8. Subaccount lifecycle and the default subaccount

Same statuses. A subaccount is created only under an existing `active`-or-`restricted` master whose own effective status permits creation (not `suspended`/`frozen`/`closing`/`closure_sealed`/`closed`). **(R2)** The creation transaction reads the master row **`FOR SHARE`** (file 05 §5 `trg_acc1_sa_owner`; apply step A4), so it serialises with a concurrent master-closure apply: a master in `closing` or later rejects new child creation (`ACC1_PARENT_NOT_USABLE`), and a child can never appear after master closure has begun. `purpose` ∈ `general` · `trading` · `treasury` · `payments` · `rwa`; **immutable; a classification label only** (§11.3).

**The default `general` subaccount (ACC-HD-1) is structural only.** It exists so LED-01 always has a subaccount dimension. It must **never** be treated as:

- a catch-all permission scope;
- a fallback trading account;
- a fallback payment account;
- a default product-authorisation target;
- evidence that any capability is available.

Enforcement in this design: (a) no internal seam resolves "the default subaccount of a client/master" — `resolve` **requires an explicit `subaccount_id`**; (b) `is_default` is **not** returned by any internal seam and is never a selector; (c) a consumer with a missing `subaccount_id` must deny, not default; (d) the default subaccount is subject to the same explicit account, permission, product and eligibility controls as any other subaccount; (e) tests in file 10 (T-122…T-125). **(R3, ACC-R3-HD-01 — amends ACC-R2-HD-04) Closure of the default:** it enters `closing` **only in the same transaction** as its master's `closing`; it then drains, is pinned-ready, receives its own final checker approval, seals and is attested like every other master-directed child, and **stops at `closure_sealed`**. It becomes `closed` **only in the same atomic transaction as its master** (§7.4). It can never be closed, completed or aborted independently while the master is non-`closed` (`ACC1_DEFAULT_SUBACCOUNT_PROTECTED`), so an `ACTIVE`/non-`closed` master with a `closed` default cannot exist (ACC-REQ-050). v0.2's circular rule and v0.3's "default closes before the master seals" rule are both removed.

## 9. Legal-entity ownership and immutability

`DEC-011` #5 requires ownership to be *immutable after financial activity absent a governed migration path*. ACC-01 cannot observe financial activity, and a rule depending on a cross-module signal is a race. This pack therefore **strengthens** the requirement (reviewed and found a safe strengthening in `04-review.md` Q4):

1. `client_id` and `master_account_id` are immutable **from creation**: column-level `UPDATE` grants exclude them; a `BEFORE UPDATE` trigger rejects any change; composite foreign keys tie subaccounts **and restrictions** to their owner.
2. **Wrongly-created accounts — lifecycle, stated plainly (RF-02).** Ownership is never edited. There is **no bypass, void or override** because LED-01 does not yet exist. Instead: (a) account creation **requires `DEP-LED-CLOSURE-CONTRACT`** (§4.5), verified at operation time from the attester's own descriptor, not from configuration — an environment-agnostic prerequisite, not an environment switch — so no wrongly-created account can arise while closure is not completable; whether creation is *available* in a given environment is CFG-01's decision (ACC-R2-HD-06); (b) where accounts are fixture data (test doubles satisfying the dependency), a wrongly-created account is removed by the disposable-environment reset procedure **outside ACC-01** — ACC-01 offers no void; (c) once `DEP-LED-CLOSURE-CONTRACT` is satisfied, correction is governed **closure and re-creation**, and the closure follows the full preventive sequence of §7 (a master completes it as an atomic family: R2-F02, R3-F01) — it is **not** trivial and does not "clear trivially"; (d) a row in `closing`/`closure_sealed` continues to count against limits and name uniqueness; (e) while any non-`closed` account exists, DCR-ACC-CLT-01 correctly prevents client closure (OFF-RULE-001) — acceptable because creation cannot happen before closure is completable.
3. **No ownership-transfer or account-migration path is designed** (OQ-01). An attempted ownership change is refused, audited Critical (`acc1.ownership_change_blocked`), and never partially applied.

## 10. Effective status and the consumer evaluation order

Stored status is **own-level only**. A subaccount's *effective* status is computed at read:

```txt
effective(subaccount) = worst( client-derived , master.status , subaccount.status , time-effective restrictions )
```

- Precedence `closed > frozen > suspended > closure_sealed > closing > restricted > active`; any unreadable input → `unknown`. **(R2) This label is descriptive.** The statuses are not totally ordered — lifecycle and restriction are different dimensions — so **no protection ever depends on the ranking** (R2-F03).
- **Resolve exposes the independent facts (R2):** `closure_barrier`, `closure_draining`, closure/seal version evidence and — **(R3, R3-F07.3)** — the closure initiation id per level, and the **time-effective restriction status per level** alongside the stored statuses and `effective_status` (file 04 §3.1).
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
| IAM-02 | ACC-01 → IAM-02 | `permission/check` (exists) over HTTP **via scoped credential (DCR-ACC-IAM-05) in every environment**; the **actor-binding successor seam** that returns the attested record with independently verified actor, entitlement evidence and credential scope (DCR-ACC-IAM-06, -07) — today's `execute-verify` is **not** used as proof | Non-affirmative, absent seam or incomplete attested record ⇒ deny (`DEP-*` unsatisfied) |
| IAM-02 | IAM-02 → ACC-01 | `scope-validate` (new, DCR-ACC-IAM-01) | IAM-02 fails closed |
| SEC-01 | ACC-01 → SEC-01 | audit ingestion | Mutation fails closed if audit unrecordable |
| LED-01 | LED-01 → ACC-01 | `resolve` before creating/posting; `subaccount_id` reference | LED-01 applies the consumer evaluation order (§10): **`closure_barrier = true` ⇒ refuse every new posting**, then component statuses (closure-drain allow-list under `closing`), or `unknown` ⇒ deny |
| LED-01 | ACC-01 → LED-01 | attester **contract descriptor**, pre-seal readiness port and post-barrier attestation port (DCR-ACC-LED-01c) | Absent/unreachable/mismatched/non-commit-ordered ⇒ closure blocked. **Abort makes no LED-01 call** |
| CFG-01 | CFG-01 → ACC-01 | `resolve` for condition 9 | `unknown` ⇒ deny |
| WLT-01, DEP-01, WDR-01, OMS-01, PAY-01, RWA-*, TRE-01, FEE-01, REC-01 | → ACC-01 | `resolve`, `resolve-batch`, extract | Deny per consumer rule |

**Runtime dependencies that are bidirectional or re-entrant (documented, RF-10):**

1. **ACC-01 ↔ CLT-01:** ACC-01 reads client status (every resolve); CLT-01 reads open accounts (client closure). Neither is a boot dependency; an unreadable CLT-01 yields `unknown` (denies money flows — correct, must be operationally owned).
2. **ACC-01 ↔ LED-01:** LED-01 reads `resolve` (every posting / ledger-account creation); ACC-01 reads LED-01 attestation only during closure. LED-01 unavailability blocks closure only; ACC-01 unavailability blocks LED-01 posting (fail closed).
3. **ACC-01 → IAM-02 → ACC-01:** ACC-01 calls IAM-02 for permission/verify; IAM-02 (extension) calls ACC-01 `scope-validate`. Re-entrancy is safe **only because** `scope-validate` is a read seam guarded by its own capability secret and never itself calls IAM-02 (test T-126). Build-time cycle broken by phasing (§16).
4. **Lifecycle coupling:** client closure → account closure → LED-01 attester/contract → `DEP-LED-CLOSURE-CONTRACT` → creation. Correctly ordered by the dependency prerequisites.

**Service readiness (RF-10, ACC-REQ-040):** `readiness` validates **ACC-01's own configuration only** — required config present and valid (limits, attestation age, consumer secrets unique and mutually distinct, peer base URLs set, dedicated credentials present and distinct from ACC-01's other configured secrets, environment valid) and migration state. It **never calls a peer**, never reports a peer contract version as evidence, and **never reports a `DEP-*` as satisfied**: runtime dependencies are shown as `VERIFIED_PER_OPERATION` and governance-only dependencies as `HARD_UNSATISFIED` (§4.5). A peer outage therefore can never prevent ACC-01 from booting, and two services can never deadlock on each other's readiness.

## 14. Non-functional requirements

1. **Fail closed** on every ambiguity.
2. **Concurrency:** optimistic `version`; advisory lock for limits; `SELECT … FOR UPDATE` on target rows inside apply; unique constraints, not application checks, are the last line.
3. **Idempotency:** `Idempotency-Key` on all mutations; `UNIQUE (requested_by, idempotency_key)`.
4. **Performance:** resolve is on the hot path of every posting/order/withdrawal. **No caching in v0.4** — a stale `active` is a safety defect; any cache is OQ-04.
5. **No RLS in v0.4:** tables are not actor-owned.
6. **Rate limiting** through the FND-01 shared engine before any public route (DCR-ACC-FND-01).
7. **Retention:** never delete; platform/client-record retention policy applies once defined (DCR-ACC-GOV-06).

## 15. Non-goals (explicit)

Legal-entity creation or edit; membership; KYC/KYB; balances or holds; ledger accounts; account numbers/IBANs; fee or limit configuration of business limits; product or asset eligibility; capability activation; ownership transfer; sub-subaccounts; client self-service creation (HD-6); Exchange-participant modelling (`EXP-01`, OQ-08); role assignments (ACC-HD-2); client-level freeze or `login_block` (DCR-ACC-GOV-05); void/bypass of wrongly-created accounts.

## 16. Build phasing (design intent; each phase needs its own approved task)

| Phase | Content | Prerequisite to **build** (peers may be test doubles) | Dependency prerequisites to **operate** (§4.5; environment-agnostic) |
|---|---|---|---|
| 0 | Service scaffold, config, boot guards, internal-identity guard | Pack approved | — |
| 1 | `acc1` schema, migration, grants, triggers; IAM-02 catalogue migration | Migration number at the time; DCR-ACC-IAM-02(a) | — |
| 2 | Reads, `resolve`, `resolve-batch`, `scope-validate`, `open-accounts` | Phase 1 | DEP-CLT-READ-SCOPE (per-read scope evidence, DCR-ACC-CLT-03) |
| 3 | Change-request + apply: create master (+default), create subaccount, profile edit | Phase 1; IAM-02 as an explicit labelled test double | governed-apply set (DEP-IAM-ACTOR-BINDING, -ENTITLEMENT, -SCOPED-CREDENTIAL, DEP-CLT-READ-SCOPE) + DEP-LED-CLOSURE-CONTRACT — each satisfied only by per-call behavioural evidence (§4.5) |
| 4 | Restrictions apply/lift/**cancel scheduled**, time-effective resolution (database clock), housekeeping job | Phase 3 | governed-apply set + DEP-FREEZE-GOVERNANCE (**hard-unsatisfied** until a governance record and an approved ACC-01 code change lift it) |
| 5 | Closure: maker-only initiation → drain → pre-seal readiness → final-approval seal (pinned) → post-barrier attestation → complete (**master family: atomic completion**); **governed abort** (no LED dependency); attester port | Phase 3; LED-01 contract (DCR-ACC-LED-01c/-01e) for a real attester, otherwise a labelled test double | initiation and seal: governed-apply set + DEP-LED-CLOSURE-CONTRACT (initiation also needs the maker-initiation seam, DCR-ACC-IAM-07); abort: governed-apply set only |
| 6 | Client read routes | Phase 2 | DEP-PUBLIC-PERIMETER (**hard-unsatisfied**) + DEP-CLT-READ-SCOPE |
| 7 | Reconciliation extract + checks | LED-01 / REC-01 | — |

ACC-01 sits **before** LED-01 in the build sequence (Module Index §18). Phases 0–5 build against **explicit labelled test doubles** for the IAM-02 actor-binding and entitlement contracts; operating them with real actors requires `DEP-IAM-ACTOR-BINDING` and `DEP-IAM-ENTITLEMENT` to be evidenced **by IAM-02 per call, with the actor verified independently of ACC-01** — the v0.1 claim that the accepted IAM-02 baseline was sufficient stays withdrawn (RF-01, R2-F04). Real governed ACC-01 apply remains gated until the owning IAM-02 change exists (ACC-R2-HD-07). No phase may provision a general CLT-01 or IAM-02 token, even for DEVELOPMENT/TEST (ACC-R2-HD-08).
