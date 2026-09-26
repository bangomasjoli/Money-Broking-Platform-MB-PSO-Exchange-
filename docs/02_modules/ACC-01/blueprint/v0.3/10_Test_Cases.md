# ACC-01 Account Structure
## 10 Test Cases (v0.3)

Test plan only — no test exists. **v0.2:** rows marked **[v0.2]** are new or rewritten by the remediation of `04-review.md`. **v0.3:** rows marked **[v0.3]** are rewritten, and §17 (T-153…T-198) added, by the remediation of `04-review-r2.md`. Peers are satisfied with **explicit labelled test doubles or dedicated scoped test credentials — never a general CLT-01/IAM-02 token, in any environment** (ACC-R2-HD-08). IDs `ACC1-T-nnn`. "DB" = integration test against a real PostgreSQL under the **non-superuser** `role_acc1_runtime` (M-REV-1 lesson: a superuser run proves nothing about grants). Every DB-dependent file carries a **fail-loud canary** (H-D3C-1) and scopes its fixtures/assertions to rows it owns — never an unscoped `DELETE`/`COUNT` on a shared table (M-1, MIG-004-O1).

## 1. Identity and ownership (ACC-REQ-001…009)

| ID | Test | Type |
|---|---|---|
| 001 | `master_account_id` matches `^mac_[0-9a-f]{24}$`; `CHECK` rejects others | DB |
| 002 | `subaccount_id` matches `^sac_…`; not derivable from `client_id`/`master_account_id` (statistical: no shared substring across 1,000 creations) | Unit |
| 003 | Two accounts for the same client have different ids; ids never repeat after closure | DB |
| 004 | **Composite FK:** inserting a subaccount whose `client_id` ≠ its master's is rejected by the database | DB |
| 005 | Subaccount insert ignores a caller-supplied `client_id` and takes the master's (`trg_acc1_sa_owner`) | DB |
| 006 | `UPDATE … SET client_id` on master and on subaccount rejected by the trigger **and** by column grants (two independent refusals, asserted separately) | DB |
| 007 | `UPDATE … SET master_account_id` on a subaccount rejected | DB |
| 008 | `UPDATE … SET purpose` / `is_default` rejected | DB |
| 009 | API bodies carrying `client_id`/`status`/`purpose` on PATCH ⇒ 400; no API route accepts `client_id` for a subaccount | API |
| 010 | A processed ownership-change attempt ⇒ `ACC1_OWNERSHIP_IMMUTABLE` **and** `acc1.ownership_change_blocked` Critical audit, no partial write | API+DB |
| 011 | **Schema guard:** no column in `acc1.*` matches `balance|amount|available|holding|price|limit_value|ledger_account`; no `numeric`/`money` type outside allow-list (none) | DB |
| 012 | **Schema guard:** no column named `enabled|is_enabled|active_flag|feature_*` (ACC-REQ-036) | DB |
| 013 | A subaccount has no client profile / mandate / membership rows created anywhere (ACC-01 makes zero writes to `clt1.*`) | Source+DB |
| 014 | `role_acc1_runtime` cannot `SELECT`/`INSERT`/`UPDATE`/`DELETE` on `clt1`, `led1`, `iam2`, `cfg1`, `sec1`; no `DELETE` on any `acc1` table | DB |

## 2. Cardinality and limits (ACC-REQ-008)

| ID | Test | Type |
|---|---|---|
| 015 | Schema permits N master accounts for one client (insert 3 directly as owner ⇒ succeeds: no unique on `client_id`) | DB |
| 016 | Policy limit 1 (DEC-011): second `create_master_account` for the same client ⇒ `ACC1_MASTER_ACCOUNT_LIMIT_REACHED`; an invalid master limit value ⇒ boot refuses | API |
| 017 | Raising the configured master limit to 2 permits a second **without a migration**; **[v0.2]** the subaccount limit has **no code default** — see T-131 | API |
| 018 | Only `closed` master accounts free the limit; **`closing` and `closure_sealed` rows still count** (RF-02, T-133) | API |
| 019 | Concurrency: two simultaneous approved creations for one client, limit 1 ⇒ exactly one succeeds (advisory lock) | DB |
| 020 | Subaccount limit enforced under the same lock; concurrent creations cannot exceed it | DB |
| 021 | Duplicate subaccount name (case-insensitive) among non-`closed` siblings (**`closing`/`closure_sealed` included**) ⇒ `ACC1_DUPLICATE_SUBACCOUNT_NAME`; allowed once the sibling is `closed` **[v0.2]** | DB |
| 022 | At most one `is_default` per master (partial unique) | DB |

## 3. Lifecycle and state machine (ACC-REQ-010/011/016/017)

| ID | Test | Type |
|---|---|---|
| 023 | No account row exists without a `creation_change_request_id` that resolves to an `applied` request | DB |
| 024 | Every legal transition of file 06 §1.1 succeeds via its governed path | API+DB |
| 025 | Every *illegal* transition (exhaustive over the 7×7 status matrix) rejected by `trg_acc1_status_transition` | DB |
| 026 | `closed` is terminal: any `UPDATE` (status, profile, restriction insert) rejected | DB |
| 027 | Direct status `UPDATE` with no session cause/actor set ⇒ commit fails (`trg_acc1_status_history`) | DB |
| 028 | Every status change writes exactly one history row with `sec_audit_ref` populated, same transaction | DB |
| 029 | Stored status equals the last history `to_status` for every row (invariant query) | DB |
| 030 | No `DELETE` possible (grant) | DB |
| 031 | **[v0.3 rewritten — R2-F02]** The default subaccount enters `closing` **only in the same transaction** as its master's `closing`; it cannot be closed or aborted alone (`ACC1_DEFAULT_SUBACCOUNT_PROTECTED`); once `closing` it proceeds `closure_sealed → closed` like any child **before** its master seals. The v0.2 assertion that the default closes only after its master is **removed** (it deadlocked master closure); end-to-end proof in T-160 | API+DB |
| 032 | Master `closing` lists **every** non-closed subaccount, **the default included**, in the approved payload; a subaccount added afterwards changes the set ⇒ payload mismatch ⇒ new request (T-138, T-164) **[v0.2/v0.3]** | API |
| 033 | Subaccount creation refused under `suspended`/`frozen`/`closing`/`closure_sealed`/`closed` master; allowed under `active`/`restricted` **[v0.2]** | DB |
| 034 | The default `general` subaccount is created atomically with the master; a failure of either rolls back both; the default subaccount counts against the configured subaccount limit | DB |

## 4. Effective status (ACC-REQ-013/014)

| ID | Test | Type |
|---|---|---|
| 035 | Client `active` ⇒ effective = own/master worst-of | Unit |
| 036 | **[v0.2]** Client `active_limited` ⇒ client-derived `restricted` with **report-only** semantics; a conformance vector asserts **every** transaction-producing activity denies — trading, deposit, withdrawal, **settlement**, wallet/payout activation, **Exchange/securities-market access**, internal transfer, subscription, payment acceptance | Unit |
| 037 | **[v0.2]** Client `restricted` ⇒ **report-only** (same vector); `suspended` ⇒ suspended; `closed` ⇒ closed | Unit |
| 038 | Client `pending`, an unrecognised value, or a missing status ⇒ `unknown` | Unit |
| 039 | CLT-01 non-2xx / timeout / malformed body / network error ⇒ `unknown` (resolve) and `ACC1_CLIENT_LOOKUP_UNAVAILABLE` (create) | Unit |
| 040 | Precedence matrix exhaustive over the **8** statuses (`closed > frozen > suspended > closure_sealed > closing > restricted > active`, `unknown` dominant) across 3 inputs **[v0.2]**. **[v0.3]** The ranking is **descriptive only**; protection never depends on it — see T-153…T-157 | Unit |
| 041 | **[v0.2]** `blocked_scopes` is **explanatory only**: for every status ≠ `active`, the consumer-conformance vector denies transaction-producing activity **even when `blocked_scopes` is empty or does not name the activity** (T-140/141) | Unit |
| 042 | Master restricted ⇒ subaccount effective restricted **without any write to the subaccount row** (no fan-out); lift ⇒ restored exactly | DB |
| 043 | Client class `retail`/`unknown` ⇒ creation `ACC1_CLIENT_CLASS_NOT_ALLOWED`; client status outside {active, active_limited} ⇒ `ACC1_CLIENT_NOT_ELIGIBLE` | API |
| 044 | Creation while client `active_limited` succeeds and the account is inert (report-only); it becomes usable when CLT-01 reports `active` with no ACC-01 write; ACC-01's checks are asserted to be a **local backstop** (no eligibility ruling emitted) **[v0.2]** | API |
| 045 | Resolve never returns a cached `active` after CLT-01 turns `suspended` (no cache in v0.3) **[v0.3 editorial]** | API |
| 046 | Resolve returns `versions`, `applied_restriction_ids`, `scope_semantics = explanatory_only`, `environment`, **and `closure_barrier`, `closure_draining`, `restriction_status`, closure/seal evidence [v0.3]**; omits names, descriptions and `is_default`; contains **no** `allowed`/`permitted`/`enabled` field **[v0.2]** | API |

## 5. Change requests and maker-checker (ACC-REQ-012/023)

| ID | Test | Type |
|---|---|---|
| 047 | Every creation/closure/restriction/lift route requires a change request; no direct create/set-status route exists (route-table source guard) | Source |
| 048 | **[v0.3 rewritten — R2-F06]** Baseline check honesty: for a **non-approval** code (`acc1.*.read`, `*.update_profile`, `*.close_collect_evidence`, `*.close_complete`) a caller with **no** role grant ⇒ deny (genuine guard step 10); for an **approval-gated** code the observed IAM-02 returns `approval_required` for **any** actor, so a "caller lacking the permission ⇒ deny" assertion is **not** made — that row is `KNOWN_GAP_IAM2_FIND_002` (see T-060) and the external gate is `DEP-IAM-ENTITLEMENT` (T-189). IAM-02 unreachable/malformed ⇒ `ACC1_PERMISSION_UNAVAILABLE` (fail closed) | API |
| 049 | Apply without an approval ⇒ `ACC1_APPROVAL_REQUIRED` | API |
| 050 | **[v0.2]** Approval creation by the maker themselves ⇒ blocked **by IAM-02** (`IAM2_SELF_APPROVAL_BLOCKED` translated where surfaced); ACC-01 makes **no** claim that today's seam binds apply to the maker (T-130 rewritten; target contract T-180, current-seam gate T-181) | API |
| 051 | `payload_hash` recomputed from the **stored** payload at apply; a stored payload mutated in the DB ⇒ apply refused before any network call | API+DB |
| 052 | Replay of a consumed decision token ⇒ refused; no second mutation | API |
| 053 | Idempotent submit: same key + body ⇒ same request; same key + different body ⇒ `ACC1_IDEMPOTENCY_CONFLICT` | API |
| 054 | Preconditions re-checked at apply **before** verify: client turned `closed` between submit and apply ⇒ nothing created, request unchanged | API |
| 055 | **[v0.2 rewritten]** Failure **after** successful `execute-verify` (forced rollback, or audit failure) ⇒ transaction rolls back and the request row is **exactly `requested`**; the same token/approval cannot be reused; a **fresh** approval applies successfully (CLT-01/CFG-01 posture) | API+DB |
| 056 | **[v0.2 rewritten]** No `applying`, `failed`, `rejected` status and no `verification_ref`/`apply_claimed_at_utc` column exist (schema guard) | DB |
| 057 | Concurrent `apply` of one request: at most one passes IAM-02 `execute-verify` (single-use token); the other is refused; no double mutation; serialised on the row lock | API+DB |
| 058 | Expired / cancelled requests cannot be applied; an IAM-02-rejected approval leaves the request `requested` until TTL (ACC-01 does not observe rejection) | API |

## 6. Permission and scope (ACC-REQ-019…022)

| ID | Test | Type |
|---|---|---|
| 059 | Catalogue rows present with `licence_locked = false`, `prohibited = false`, approval flags as file 07 §2; **no `role_permission` row seeded and no role defined** by the migration (ACC-HD-2, T-149) | DB |
| 060 | **[v0.2 rewritten — known-gap test, RF-01]** A stub modelled on **observed** IAM-02 behaviour returns `approval_required` for **any** actor for an approval-gated `acc1.*` code regardless of roles; the test asserts ACC-01's baseline treats it as pass **and** that ACC-01 makes **no claim** of entitlement; labelled `KNOWN_GAP_IAM2_FIND_002` so it is revisited when IAM-02 is fixed. It does **not** assert that empty `role_permission` denies approval-gated actions (that is false today) | API |
| 061 | **Permission ≠ activation:** holding every `acc1.*` permission changes no CFG-01 state and enables no capability | Integration |
| 062 | **Denial attribution:** a status-based denial is never reported as `PERMISSION_DENIED`/`FEATURE_DISABLED`, and a permission denial never as an account-status denial | API |
| 063 | `scope-validate`: consistent triple ⇒ true; mismatched client/master/sub, unknown, or `closed` ⇒ false with no detail; never returns a permission decision | API |
| 064 | Client routes (phase 6): foreign/unknown/inactive-membership/unauthorised all observationally identical | API |
| 065 | Subaccount `purpose = payments|rwa|trading` grants no access and alters no CFG-01 decision | Integration |
| 066 | **[v0.3 rewritten — R2-F06]** For **non-approval** codes, `SUPER_ADMIN`/`ADMIN` without the specific permission is denied (no role-name shortcut). For the **approval-gated** create/close/restrict/lift codes the honest current baseline is that the observed IAM-02 returns `approval_required` for any actor — **no denial is asserted** (`KNOWN_GAP_IAM2_FIND_002`, expected-failure discipline as T-060/T-127/T-128); the external gate `DEP-IAM-ENTITLEMENT` must refuse governed apply (T-189). The test **fails loudly** if IAM-02 behaviour changes under it | API |

## 7. Restrictions (ACC-REQ-015)

| ID | Test | Type |
|---|---|---|
| 067 | Apply `partial_restriction` ⇒ status `restricted`, scopes reflected; `suspension` ⇒ `suspended`; `full_freeze` ⇒ `frozen` | API+DB |
| 068 | `login_block` ⇒ `ACC1_SCOPE_NOT_APPLICABLE` | API |
| 069 | Missing reason / empty scopes / `full_freeze` with extra scopes ⇒ `ACC1_RESTRICTION_INVALID` | API |
| 070 | Two active restrictions ⇒ worst status; lifting the stronger recomputes to the weaker, not `active` | DB |
| 071 | Lift without evidence ⇒ `ACC1_RESTRICTION_LIFT_BLOCKED`; authority-sourced (`court_order`/`regulatory_directive`) without release evidence ⇒ blocked | API |
| 072 | Authority-sourced restriction cannot carry `effective_until`; cannot lapse by job | DB |
| 073 | Scheduled restriction becomes active at `effective_from` via the lifecycle job, audited, status recomputed | Job |
| 074 | Restriction on a `closing` account recorded; stored status stays `closing`; effective status honours it | DB |
| 075 | Restriction on a subaccount does not affect siblings or master; restriction on a master affects all subaccounts' *effective* status | API |
| 076 | Restriction rows never deleted; terminal states immutable | DB |

## 8. Closure (ACC-REQ-016/029/030)

| ID | Test | Type |
|---|---|---|
| 077 | **[v0.3 rewritten]** Closure request → approval → apply ⇒ `closing` (master, **its default subaccount** and every listed child in one transaction; `closure_cycle` incremented); `closure_draining = true`; **only the closure-drain allow-list** is permitted (T-158), everything else denied | API |
| 078 | **[v0.3 rewritten]** `close/complete` from `closure_sealed` with the **latest** attestation of every attester `clear`, **post-barrier**, `seal_version_observed` = current, `committed_after_preseal_watermark = 0`, `max_resolution_version_committed < closure_sealed_at_version`, `in_flight_status ∈ {none, refused_by_fence}`, fresh ⇒ `closed`, `closed_at_utc` set, Critical audit (compare-and-set); **no approval step and no second checker** (T-169) | API |
| 079 | Any attester's **latest** attestation `blocked` ⇒ `ACC1_CLOSURE_BLOCKED`; target **stays `closure_sealed`** (still barred); attester outcomes returned as codes; the governed abort remains available (T-179) **[v0.2/v0.3]** | API |
| 080 | Attester unreachable/timeout/malformed ⇒ `unavailable` ⇒ blocked (fail closed) | API |
| 081 | **Empty attester configuration ⇒ closure disabled** (`ACC1_CLOSURE_ATTESTERS_UNCONFIGURED`), not "nothing to check" | API |
| 082 | **[v0.2]** Stale attestation (older than `ACC1_ATTESTATION_MAX_AGE_SECONDS`) ⇒ blocked; missing/invalid max-age configuration ⇒ boot refuses and completion fails closed | API |
| 083 | Active `court_order`/`regulatory_directive` restriction ⇒ completion refused | API |
| 084 | **[v0.3 rewritten]** `closing`/`closure_sealed` reach the operational projection **only** through the governed `abort_closure` recovery (DB refuses any other path, incl. direct `UPDATE` and `closing → active` without a recovery row); `closure_sealed → closed` only via completion; `closed → *` never; **no ungoverned unseal/reopen route**; identifiers not reusable (T-174…T-178) | DB |
| 085 | `open-accounts` returns non-zero while any account is non-`closed`; unavailable ⇒ CLT-01 contract test expects deny | API |
| 086 | Attestation rows append-only | DB |

## 9. Audit (ACC-REQ-024/025/026)

| ID | Test | Type |
|---|---|---|
| 087 | Every state-changing action emits the event of file 08 with required fields incl. `environment` | API |
| 088 | SEC-01 unreachable during a mutation ⇒ `ACC1_AUDIT_REQUIRED`, **no** state change persisted | API+DB |
| 089 | Cross-client listing and status-history reads emit `acc1.sensitive_account_read`; a failed log ⇒ read denied | API |
| 090 | Audit bodies contain no PII/secret/free text (payload allow-list test) | Unit |
| 091 | Invalid internal secret ⇒ `acc1.internal_caller_denied` | API |
| 092 | History and attestation tables reject `UPDATE`/`DELETE` even for the table owner role used by the runtime | DB |
| 093 | Every `applied` change request has `sec_audit_ref` | DB |

## 10. Internal seams and API (ACC-REQ-027…034)

| ID | Test | Type |
|---|---|---|
| 094 | Each consumer secret maps to its module id; the module is never read from a header; duplicate secret values across modules refused at boot (`ACC1_CONFIG_INVALID`) | Unit |
| 095 | `resolve-batch` ≤ 100; > 100 ⇒ 400; unknown ids explicit; one CLT-01 read per distinct client | API |
| 096 | DB unavailable ⇒ 503, **never** an empty 200 | API |
| 097 | Envelope, request/correlation IDs on every response | API |
| 098 | `Idempotency-Key` required on every mutation | API |
| 099 | `assertNoExchangeRuntime` passes at boot; a source test enumerates every registered route path and asserts none contains a prohibited fragment | Source |
| 100 | No import of any other `services/*/src` (F3(c)) | Source |
| 101 | Reconciliation extract keyset pagination stable under concurrent inserts | API |
| 102 | Readiness fails when the DB, migration state or peer URLs are missing/misconfigured | API |
| 103 | Rate limit: staff mutation limited via FND-01; limiter unavailable ⇒ documented fail posture tested | API |
| 104 | Resolve p95 measurement harness (recorded, not asserted as a gate until targets are set by IMP-02) | Perf |

## 11. Database, migration, grants

| ID | Test | Type |
|---|---|---|
| 105 | Migration up / down / re-up committed regression; down does not widen `role_acc1_runtime`; **[v0.2]** covers new columns, composite FKs and triggers | DB |
| 106 | Column-level `UPDATE` grants exactly as file 05 §6 (introspect `information_schema.column_privileges`), incl. seal columns **[v0.2]** | DB |
| 107 | `iam2.permission` catalogue migration is `iam2`-scoped; inserts only the file 07 rows; seeds zero `role_permission`; down removes only its rows | DB |
| 108 | No test pins the global migration head number | Source |
| 109 | Suite runs green under a non-superuser role; a superuser-only pass is rejected by a role-identity canary | DB |
| 110 | Every `CHECK` enumeration rejects an out-of-set value | DB |

## 12. Environment and DEC-013 (ACC-REQ-021/035/036)

| ID | Test | Type |
|---|---|---|
| 111 | **[v0.3 rewritten — ACC-R2-HD-06]** **Identical** behaviour and error codes across DEVELOPMENT/TEST/UAT/DEMO/PRODUCTION for the same dependency evidence (parameterised over all five `ENVIRONMENT` values). There is **no** environment-conditional exception; only the recorded `environment` value differs | Integration |
| 112 | **[v0.3]** Boot refuses an invalid `ENVIRONMENT` value (`ACC1_CONFIG_INVALID`); the value is recorded in audit/responses and is **never a branch condition** (source guard, T-190). Treating an unknown environment as PRODUCTION is a CFG-01/master concern, not an ACC-01 rule | Unit |
| 113 | ACC-01 never reads or writes `cfg1.feature.current_state`, `environment_scope` or any activation state (source + grant guard) | Source+DB |
| 114 | An `active` account is not evidence of any activation: resolve response contains no capability/enabled field | API |

## 13. Concurrency

| ID | Test | Type |
|---|---|---|
| 115 | Optimistic `version`: stale PATCH ⇒ `ACC1_VERSION_CONFLICT` | API |
| 116 | Concurrent restriction apply and closure request on one target serialise under the row lock; final state legal | DB |
| 117 | Concurrent lift of two restrictions recomputes status correctly (no lost update) | DB |
| 118 | Concurrent default-subaccount creation cannot yield two defaults | DB |

## 14. Reconciliation (file 13)

| ID | Test | Type |
|---|---|---|
| 119 | Each check R-1…R-8 detects a seeded fault and passes on clean data; **[v0.2]** R-6 also detects a `closed` row lacking a post-barrier `clear` attestation | DB |
| 120 | Reconciliation read role/route cannot mutate | DB |

## 15. Contract tests owned elsewhere (recorded so they are not lost)

LED-01: applies the consumer evaluation order — **refuses every new posting when `closure_barrier = true`** (never keyed on `effective_status`), denies when a component ≠ `active` except closure-drain allow-list activity under `closing`, denies on `unknown`; stores `subaccount_id` **and the resolve `versions` with each posting**; provides the **pre-seal readiness** and the **post-barrier attestation** (`seal_version_observed`, watermarks, `committed_after_preseal_watermark`, `max_resolution_version_committed`, in-flight status); fences in-flight postings before attesting. CLT-01: refuses client closure on non-zero/unavailable `open-accounts`. IAM-02: narrowing-only scoped grants; §29 item 39. CFG-01: treats `unknown` as deny for condition 9. These are dependency-change deliverables (file 17), tested in those modules' suites.

## 16. [v0.2] Remediation tests (RF-01…RF-11, approved decisions)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 121 | **[v0.3 rewritten — ACC-R2-HD-06, R2-F08]** **Dependency prerequisites** replace the withdrawn environment gates: each operation of file 01 §4.5 refuses `ACC1_DEPENDENCY_NOT_SATISFIED` (carrying the `DEP-*` id and evidence `provider`) while a required dependency is unevidenced, and proceeds when it is satisfied by real evidence **or** by an explicit labelled test double — identically in every environment (T-189). No environment name, environment variable or runtime toggle selects, lifts or relaxes a prerequisite; no configuration can select a test double (T-188, source guard) | RF-01, RF-02, RF-05, RF-09 | Integration+Source |
| 122 | No route resolves "the default subaccount" of a client or master; resolve **requires** an explicit `subaccount_id` | ACC-HD-1 | API |
| 123 | `is_default` is absent from every internal seam and cannot be a selector | ACC-HD-1 | API |
| 124 | Consumer-contract vector: a missing `subaccount_id` ⇒ the reference consumer **denies**, never defaults | ACC-HD-1 | Contract |
| 125 | The default subaccount confers no implicit permission, scope, product target or capability evidence (scope-validate/resolve treat it exactly like any other subaccount) | ACC-HD-1 | API |
| 126 | `scope-validate` makes **no outbound call** (no re-entrancy into IAM-02) | RF-10 | API+Source |
| 127 | **[v0.3]** Known-gap: a stub of IAM-02 `execute-verify` with **no role check** ⇒ ACC-01 asserts no entitlement; `DEP-IAM-ENTITLEMENT` unsatisfied ⇒ governed apply refused `ACC1_DEPENDENCY_NOT_SATISFIED` **in every environment** (parameterised; no environment-based branch) | RF-01 | API |
| 128 | Known-gap: approval creation/approval by non-entitled fixture users succeeds against the stub; the test is labelled `KNOWN_GAP_IAM2_FIND_002` and fails **loudly** if IAM-02 behaviour is ever changed under it, prompting rewrite | RF-01 | Contract |
| 129 | IAM-02 seam contract: ACC-01 sends the canonical `payload` (never a hash) to approval request; stored `payload_hash` matches `^sha256:[0-9a-f]{64}$` and fits the column; `execute-verify` body uses exactly `decision_token, approval_id, actor_id, action, resource, entity_id, client_id, current_payload_hash` (`additionalProperties: false`) | RF-07 | Contract |
| 130 | **[v0.3 rewritten — R2-F04]** ACC-01 does **not** assert that "a different caller cannot apply" against today's seam (that property is false: `actor_id` is a body field any token-holder can set). It asserts (a) the **local defence in depth** — IAM-01 session principal ≠ stored `requested_by` ⇒ `ACC1_ACTOR_BINDING_MISMATCH` (T-183); (b) ACC-01 never treats a body `actor_id`/`approval_id` as proof (T-182); (c) governed apply is gated on `DEP-IAM-ACTOR-BINDING` (T-181) and proven only against a test double of the **target** contract (T-180) | RF-07, R2-F04 | API |
| 131 | **Config fail-closed:** missing/invalid `ACC1_MAX_SUBACCOUNTS_PER_MASTER` ⇒ boot refuses (`ACC1_CONFIG_INVALID`); no code default; creation with the limit unavailable fails closed; a limit < 1 invalid | ACC-HD-3 | Unit+API |
| 132 | **Readiness makes zero outbound calls** (fetch spy) and reports ready with every peer down; reports declared contract versions from configuration | RF-10 | API |
| 133 | `closing` and `closure_sealed` rows still count against the master/subaccount limits and name uniqueness; only `closed` frees them | RF-02 | DB |
| 134 | **[v0.3 rewritten]** Account creation requires `DEP-LED-CLOSURE-CONTRACT` (an environment-agnostic prerequisite; empty attester set ⇒ unsatisfied); ownership immutability and the empty-attester rule are unchanged; **no void/bypass route exists** (route-table source guard). Whether creation is *available* in an environment is CFG-01's, not tested here | RF-02 | Source+Integration |
| 135 | **[v0.3 rewritten]** **Barrier:** a sealed target resolves with `closure_barrier = true`, which the conformance consumer denies for **all** transaction-producing activity **before** looking at any status (T-153…T-156); only `closed` (barrier stays true) follows, or the governed abort | RF-03 | API |
| 136 | **[v0.3 rewritten]** An attestation taken **before** the seal (older/none `seal_version`), with `seal_version_observed` ≠ current, a non-latest row, or any violated field of T-170 never satisfies completion | RF-03 | API+DB |
| 137 | **[v0.3 rewritten]** **Attest-then-post race:** attester `clear` → a posting attempt after seal is denied by the reference LED-01 consumer contract; if the target state changed (e.g. governed abort), the completion compare-and-set fails; the **resolved-before-seal / committed-after-seal** race is T-171 | RF-03 | Contract+DB |
| 138 | **Master closure:** master seal blocked while any child — **the default included** — is non-`closed` (`ACC1_CLOSURE_SEAL_INVALID`); the approved payload lists children ids+versions; children each need their own readiness, final approval and post-barrier attestation; master needs its own | RF-03 | API |
| 139 | **[v0.3 rewritten]** The default subaccount **enters `closing` with its master and then closes under the ordinary child rules before the master seals**; it never waits for the master to close, and it cannot close alone (T-031, T-160, T-162) | ACC-HD-1, RF-03, R2-F02 | API |
| 140 | **Consumer conformance matrix:** for each status ≠ `active` and each transaction-producing activity class (trading, deposit, withdrawal/payout, settlement, wallet/payout activation, internal transfer, fee posting, subscription, payment acceptance, Exchange/securities-market access) the reference consumer denies unless an explicit authoritative allow exists (none ⇒ deny) | RF-04 | Contract |
| 141 | Empty or partial `blocked_scopes` **never** permits an activity; no consumer-side derivation of an allow from scopes | RF-04 | Contract |
| 142 | **Time-effective:** a `scheduled` restriction with `effective_from_utc <= now()` is enforced by resolve **with the housekeeping job stopped**; the job later aligns stored state | RF-08 | DB+API |
| 143 | **Every** restriction change (apply, activation, lift, expiry, cancellation) bumps the target's `version`; a **master** restriction changes the consumer-visible `versions` tuple | RF-08 | DB |
| 144 | `applied_restriction_ids` includes time-effective restrictions not yet processed by housekeeping | RF-08 | API |
| 145 | **Restriction owner binding:** inserting a restriction pairing client A/master A with client B's subaccount ⇒ FK violation; subaccount target with mismatched master or client ⇒ rejected; master target under the wrong client ⇒ rejected | RF-06 | DB |
| 146 | **[v0.3 rewritten — R2-F05, ACC-R2-HD-08]** **Credentials, every environment:** ACC-01 references no CLT-01 general internal-token variable and no IAM-02 general internal-token variable (source guard); it requires dedicated `…_STATUS_READ` / `…_VERIFY` credentials **or explicit labelled test doubles in DEVELOPMENT and TEST too**; boot refuses a dedicated credential equal to any other configured token, parameterised over all five `ENVIRONMENT` values (T-187); apply-time and reconciliation CLT-01 reads use the read-scoped client (T-186) | RF-05 | Source+Unit |
| 147 | **Retention:** no `DELETE`/`TRUNCATE` grant, no purge or retention job, no configured retention period in ACC-01 (source guard) | approved retention | Source+DB |
| 148 | An account row's client-derived input never comes from a cache; a CLT-01 status change is reflected on the next resolve | RF-04 | API |
| 149 | **No role assignment:** the ACC-01 migration/seed inserts **zero** `iam2.role_permission` rows and defines **no** role; no source file assigns a role to a permission | ACC-HD-2 | Source+DB |
| 150 | ACC-01 emits no eligibility verdict: no field, error or event states that a client/product is "eligible"/"approved" (only structural status) | RF-11 | API+Source |
| 151 | **Authority-restriction lift:** a `court_order`/`regulatory_directive` restriction cannot be lifted without authority-release evidence and cannot lapse by time | RF-09 (ungoverned ownership does not weaken this) | API |
| 152 | An ACC-01 restriction never alters CLT-01 client status and no route accepts a "client freeze" (that owner is ungoverned — DCR-ACC-GOV-05) | RF-09 | Source+API |

## 17. [v0.3] Round-2 remediation tests (R2-F01…R2-F09, ACC-R2-HD-01…08)

Contract tests use a **reference consumer** and a **fake LED-01 attester** (labelled test doubles). "Parameterised" = run for each of DEVELOPMENT, TEST, UAT, DEMO, PRODUCTION with identical expectations.

### 17.1 Closure barrier is an independent fact (R2-F03, ACC-R2-HD-05)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 153 | `closure_barrier = true` **+ `effective_status = suspended`** (in-force suspension on a sealed target) ⇒ the reference consumer denies **every** transaction-producing activity class | R2-F03 | Contract |
| 154 | `closure_barrier = true` **+ `effective_status = frozen`** ⇒ every activity class denied | R2-F03 | Contract |
| 155 | `closure_barrier = true` **+ a restriction** (partial `restricted`; also client-derived `restricted`) ⇒ every activity class denied | R2-F03 | Contract |
| 156 | **Order of evaluation:** for every descriptive `effective_status` (incl. `unknown`) with `closure_barrier = true` the answer is deny, **even when a fixture policy authorises that activity for that status**; with `closure_barrier = false` the component check (step 2) and product policy (step 3) then apply. The LED-01 reference refuses "when `closure_barrier = true`", never "when `effective_status == closure_sealed`" (source assertion on the contract vector) | R2-F03, DCR-ACC-LED-01c | Contract |
| 157 | Resolve exposes `closure_barrier`, `closure_draining`, `restriction_status` per level and closure/seal evidence; stored `closure_barrier = (status IN ('closure_sealed','closed'))` (`CHECK`); it is never computed from `effective_status`; only a `closure_recovery` row can flip it `true → false` (`trg_acc1_closure_barrier`) | ACC-REQ-042 | API+DB |

### 17.2 Closure drain, readiness, final approval (R2-F01, ACC-R2-HD-01/02)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 158 | **Closure-drain allow-list conformance:** under `closing` the consumer permits **only** CDA-1 (balance return to a verified own-name destination), CDA-2 (already-open withdrawal), CDA-3 (already-open settlement), CDA-4 (closure-needed reconciliation break); **denies** new trade, deposit, investment/subscription, new payout destination, Exchange/securities-market activity, new withdrawal/settlement, and any unrelated transaction-producing activity; CDA-5 has no entries ⇒ deny; drain is **denied** while a restriction is in force or the client is `active_limited`/`restricted`/`suspended` | HD-01 | Contract |
| 159 | **Fail closed:** an activity class not on the allow-list (including an unknown/new class) is denied under `closing` | HD-01 | Contract |
| 160 | **Master with only its default subaccount closes end to end:** master + default → `closing` (one TX) → default readiness → default final approval → default sealed → default attested → default `closed` → master readiness → master final approval → master sealed → master attested → master `closed` | R2-F02 | API+DB |
| 161 | Master closure apply moves master, default and every listed child to `closing` in **one** transaction; forcing any step to fail rolls all back | HD-04 | DB |
| 162 | The default cannot enter `closing` alone, be `closed` alone or be aborted alone (`trg_acc1_default_protected`); while its master is `closing` it proceeds `closure_sealed → closed` normally | HD-04 | DB |
| 163 | A master cannot seal while any child (default included) is non-`closed`; the deferred `trg_acc1_closure_family` rejects a commit leaving a `closing` master with an operational child, or a sealed master with a non-`closed` child | R2-F02 | DB |
| 164 | **Concurrency:** `create_subaccount` apply vs master-closure apply, both interleavings (each run repeatedly): creation-first ⇒ closure apply sees the changed set and is refused; closure-first ⇒ creation waits, sees `closing` and is rejected; **no child ever appears under a `closing` master** (`FOR SHARE` on the master in A4 and in `trg_acc1_sa_owner`) | R2-F02 | DB |
| 165 | A master in `closing`, `closure_sealed` or `closed` rejects new child creation (`ACC1_PARENT_NOT_USABLE`) | R2-F02 | API |
| 166 | **Pre-seal readiness (parameterised by condition):** seal refused `ACC1_CLOSURE_NOT_READY` when the latest readiness is missing, `not_ready`, `unavailable`, stale, for another `closure_cycle`, or shows balance `present`, an open withdrawal, an open settlement, a blocking reconciliation break, an unaccounted in-flight posting, or (master) a non-`closed` child | R2-F01 | API |
| 167 | **A funded account cannot be sealed:** fake attester reports `balance_state = present` ⇒ refused; after CDA-1 completes (`returned`) and readiness is `ready` ⇒ the seal request succeeds | R2-F01 | API |
| 168 | Seal **apply** re-collects readiness; a differing `journal_watermark` from the approved W_pre ⇒ `ACC1_CLOSURE_NOT_READY`, request unchanged, new request needed | R2-F01 | API |
| 169 | **Final-approval timing:** the seal needs its **own** applied `seal_closure` request (the initiation approval is not accepted: payload/action mismatch); `close/complete` has no approval step and no second checker (source guard: complete path makes no IAM-02 approval call); the pre-seal readiness ids and W_pre are bound into the approved payload | HD-02 | API+Source |

### 17.3 Attestation contract and latest-attestation semantics (R2-F01, DCR-ACC-LED-01c)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 170 | Each violation alone blocks completion: `seal_version_observed` ≠ current; `preseal_watermark_ref` ≠ recorded W_pre; `committed_after_preseal_watermark > 0`; `max_resolution_version_committed ≥ closure_sealed_at_version`; `in_flight_status = unresolved`; stale `as_of` (secondary guard); wrong target | R2-F01 | API+DB |
| 171 | **Resolved-before-seal / committed-after-seal race:** fake LED-01 resolves at version < seal, commits after the seal ⇒ its journal position is after W_pre ⇒ `committed_after_preseal_watermark > 0` ⇒ completion blocked; a posting that ignored the barrier (resolution version ≥ seal) ⇒ `max_resolution_version_committed ≥ closure_sealed_at_version` ⇒ blocked. No wall-clock assumption in either check | R2-F01 | Contract+DB |
| 172 | **Latest-attestation semantics:** an earlier `clear` followed by a later `blocked` ⇒ blocked; an earlier `blocked` followed by a later `clear` ⇒ completes; a non-latest `clear` never satisfies; evaluated per attester (one blocked attester blocks); rows for an older `closure_seal_version` never count; the same latest-row rule for readiness per `closure_cycle` | R2-F01 | API+DB |
| 173 | `trg_acc1_seal` rejects `closed` in the database when only a non-latest `clear` row exists (independent of application logic) | R2-F01 | DB |

### 17.4 Governed abort / unseal (R2-F01, ACC-R2-HD-03; OQ-07)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 174 | Abort from `closing`: legal only with matching blocking evidence; stored status becomes the **recomputed** projection of restrictions in force by time; `closure_cycle` incremented; earlier readiness rows no longer match; version bumped; `closure_recovery` row; Critical `acc1.account_closure_aborted` | HD-03 | API+DB |
| 175 | Abort from `closure_sealed`: `closure_barrier` cleared **only here**; `closure_seal_version` **retained**; a later re-seal gets a **strictly higher** `closure_seal_version` and the old `clear` rows never satisfy it; version bumped; Critical audit | HD-03 | API+DB |
| 176 | Abort refused (`ACC1_CLOSURE_ABORT_INVALID`) without evidence, for a `closed` row, for a subaccount under a `closing`/`closure_sealed` master, and for the default alone; a master abort returns the master **and every listed non-closed child** in one TX; already-`closed` children stay `closed` (incl. the default) | HD-03, HD-04 | API+DB |
| 177 | **Abort never restores what another authority denied:** CLT-01 reports `suspended` after abort ⇒ effective status still denies; a restriction still in force ⇒ projection stays `restricted`/`suspended`/`frozen`; no `cfg1.*` read or write; no capability/permission state touched | HD-03 | API+Source |
| 178 | **No uncontrolled reopen:** route-table source guard shows no unseal/reopen/revert route and no direct status-write route; the DB refuses `closure_barrier true → false` and `closure_sealed/closing → operational` without a governed recovery row; abort requires maker-checker (approval-gated `*.close_abort`; never break-glass) | HD-03 | Source+DB |
| 179 | **Blocked attestation recovery, end to end:** sealed → latest attestation `blocked` → completion refused (target stays barred) → governed abort → operational projection → a later new closure request proceeds normally | R2-F01 | API+DB |

### 17.5 Apply actor binding (R2-F04, ACC-R2-HD-07)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 180 | Against a **labelled test double of the target contract**: authenticated actor ≠ maker ⇒ refused; checker = maker ⇒ refused; returned `payload_hash` ≠ recomputed ⇒ refused; `action`/`resource`/`entity_id`/`client_id` mismatch ⇒ refused; body `approval_id` ≠ attested id ⇒ refused; on success `approval_id`, checker and `policy_id` are recorded with `approval_id_source = iam2_attested` | HD-07 | Contract |
| 181 | **Current-seam honesty:** a stub modelled on the **observed** `execute-verify` (body `actor_id`, `approval_id` never verified/returned) ⇒ governed apply refused `ACC1_DEPENDENCY_NOT_SATISFIED` (`DEP-IAM-ACTOR-BINDING`), **in every environment**; labelled `KNOWN_GAP_IAM2_ACTOR_BINDING`; fails loudly if IAM-02 behaviour changes under it | HD-07 | API |
| 182 | ACC-01 never derives the proof from a caller-supplied value: source guard — no code path sets the IAM-02 actor from a request body, and none claims verification of a body `approval_id` | HD-07 | Source |
| 183 | IAM-01 session principal ≠ stored `requested_by` at **apply** and at **cancel** ⇒ `ACC1_ACTOR_BINDING_MISMATCH` (Critical; both identities audited); passing this check does **not** satisfy the dependency | R2-F04 | API |
| 184 | A row with `approval_id_source = caller_asserted` is never presented as verified evidence; reconciliation R-7 reports the source | R2-F04 | DB+API |
| 185 | **Step-up rationale:** a stub with guard order (step-up before approval) returns a blocking `step_up_required` for **every** actor when `requires_step_up = true`; the catalogue migration sets `requires_step_up` on **no** `acc1.*` row | R2-F04 | DB+Contract |

### 17.6 Credentials and dependency prerequisites (R2-F05, R2-F08, ACC-R2-HD-06/08)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 186 | **Every** CLT-01 status read — resolve, batch, submit, apply of create/close/seal/abort/restrict/lift/cancel, reconciliation R-3 — goes through the single read-scoped client (source guard: exactly one CLT-01 HTTP client is constructed; no other request to a CLT-01 URL) | R2-F05 | Source |
| 187 | A configuration carrying a general CLT-01 or IAM-02 token value (or a dedicated credential equal to any other token) ⇒ boot refuses `ACC1_CONFIG_INVALID`, **parameterised over all five `ENVIRONMENT` values**; no code path selects credentials by environment; no "temporary broad token" path | HD-08 | Unit+Source |
| 188 | The **test composition root** injects labelled doubles (`provider = test_double` + label); the **production composition root imports none**; no configuration value, environment variable or environment name can select a double | HD-06, HD-08 | Source |
| 189 | **Dependency matrix:** for each operation of file 01 §4.5 and each required `DEP-*`, absence ⇒ `ACC1_DEPENDENCY_NOT_SATISFIED` naming that dependency; satisfied by real evidence **or** a labelled double ⇒ proceeds; **identical outcomes in all five environments** (parameterised); `open-accounts`, `scope-validate` and the reconciliation extract require none | HD-06, R2-F08 | Integration |
| 190 | **No environment logic:** source guard — no conditional in dependency, permission, credential, closure, restriction or route code reads the environment name (only audit/response recording and boot validation of `ENVIRONMENT`); no read of `cfg1.feature.environment_scope` or any CFG-01 environment state | HD-06 | Source |
| 191 | Dependency evidence records expose their `provider` (`real`/`test_double`) in readiness output and audit; readiness still makes **zero** outbound calls (extends T-132) | HD-06 | API |

### 17.7 Restriction lifecycle (R2-F07)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 192 | `cancel_scheduled_restriction` on a scheduled restriction **not yet effective**: maker-checker governed, ⇒ `cancelled`, target `version` bumped, history + audit `acc1.account_restriction_cancelled`; it never appeared in `applied_restriction_ids` | R2-F07 | API+DB |
| 193 | Cancel refused `ACC1_RESTRICTION_ALREADY_EFFECTIVE` once `effective_from_utc <= now()` (decided **at apply**, even if stored `scheduled`); refused `ACC1_RESTRICTION_NOT_IN_FORCE` for lifted/expired/cancelled | R2-F07 | API |
| 194 | Cancelling an authority-sourced (`court_order`/`regulatory_directive`) scheduled restriction needs authority-release `cancel_evidence_ref` (`ACC1_RESTRICTION_LIFT_BLOCKED` otherwise) | R2-F07 | API |
| 195 | **Lift of a time-effective restriction still stored `scheduled`, with the housekeeping job stopped:** succeeds; the lift transaction performs the activation inline (history + `acc1.account_restriction_activated` cause `lift_inline_activation`) then `lifted`; target `version` bumped; both status-history rows present; one transaction | R2-F07 | DB+API |
| 196 | Lift of a **not-yet-effective** restriction ⇒ `ACC1_RESTRICTION_NOT_IN_FORCE` (use cancel); lift of a lapsed one ⇒ `ACC1_RESTRICTION_NOT_IN_FORCE` | R2-F07 | API |
| 197 | **Housekeeping never determines legality:** the same lift/cancel requests give identical legality outcomes with the job stopped, running, and crashed mid-way (parameterised) | R2-F07 | DB+Job |
| 198 | Cancel and lift are approval-gated (no direct route), require `DEP-FREEZE-GOVERNANCE` and the governed-apply set, and audit Critical | R2-F07 | API |
