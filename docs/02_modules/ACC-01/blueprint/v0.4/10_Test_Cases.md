# ACC-01 Account Structure
## 10 Test Cases (v0.4)

Test plan only — no test exists. **v0.2:** rows marked **[v0.2]** are new or rewritten by the remediation of `04-review.md`. **v0.3:** rows marked **[v0.3]** are rewritten, and §17 (T-153…T-198) added, by the remediation of `04-review-r2.md`. **v0.4:** rows marked **[v0.4]** are rewritten, and §18 (T-199…T-248) added, by the remediation of `04-review-r3.md` under ACC-R3-HD-01…03. **Where a v0.3 row is not marked [v0.4] but conflicts with a [v0.4] row, the [v0.4] row governs** (the v0.3 rows are kept only where still true). Peers are satisfied with **explicit labelled test doubles or dedicated scoped test credentials — never a general CLT-01/IAM-02 token, in any environment** (ACC-R2-HD-08). IDs `ACC1-T-nnn`. "DB" = integration test against a real PostgreSQL under the **non-superuser** `role_acc1_runtime` (M-REV-1 lesson: a superuser run proves nothing about grants). Every DB-dependent file carries a **fail-loud canary** (H-D3C-1) and scopes its fixtures/assertions to rows it owns — never an unscoped `DELETE`/`COUNT` on a shared table (M-1, MIG-004-O1).

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
| 031 | **[v0.4 rewritten — ACC-R3-HD-01, R3-F01]** The default subaccount enters `closing` **only in the same transaction** as its master's `closing`; it then seals under the ordinary child rules (own readiness, own final approval, own pin) and **stops at `closure_sealed`**; it becomes `closed` **only in the same transaction as its master** (family completion). It can never be closed, completed or aborted alone (`ACC1_DEFAULT_SUBACCOUNT_PROTECTED`). v0.3's assertion that the default reaches `closed` **before its master seals** is **removed** — it produced the R3-F01 state (`ACTIVE` master + `closed` default). End to end: T-199 | API+DB |
| 032 | **[v0.4]** Master initiation is bound to the preview: the preview lists **every** non-closed subaccount, **the default included** (id, `version`, status, independent-closure flag) and returns the `family_set_hash`; a subaccount added or changed afterwards ⇒ `ACC1_CLOSURE_FAMILY_SET_CHANGED` ⇒ new preview (T-138, T-164, T-244) | API |
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
| 047 | **[v0.4]** Every creation/seal/abort/restriction/lift/cancel route requires a maker-checker change request; closure **initiation** is the maker-only entitlement-checked route (T-240) and completion is machine-verified; no direct create/set-status route exists (route-table source guard) | Source |
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
| 077 | **[v0.4 rewritten]** **Maker-only** initiation (no approval token, no checker — T-240) ⇒ `closing` (master, **its default subaccount** and every operational child in one transaction under one `closure_family_id`; `closure_cycle` incremented); `closure_draining = true`; **only the closure-drain allow-list** is permitted (T-158); everything else denied | API |
| 078 | **[v0.4 rewritten]** `close/complete` for an **independent** target from `closure_sealed` with the **latest** attestation of every attester `clear`, `binding_ok`, **post-barrier**, `seal_version_observed` = current, `preseal_watermark_ref` = **the pin's** watermark, `committed_after_preseal_watermark = 0`, `max_resolution_version_committed < closure_sealed_at_version`, `in_flight_status ∈ {none, refused_by_fence}`, drained-state fields clear, fresh ⇒ `closed`, `closed_at_utc` set, Critical audit (compare-and-set); **no approval step and no second checker** (T-169). For a master the completion is the atomic family completion (T-199, T-200) | API |
| 079 | Any attester's **latest** attestation `blocked` ⇒ `ACC1_CLOSURE_BLOCKED`; target **stays `closure_sealed`** (still barred); attester outcomes returned as codes; the governed abort remains available (T-179) **[v0.2/v0.3]** | API |
| 080 | Attester unreachable/timeout/malformed ⇒ `unavailable` ⇒ blocked (fail closed) | API |
| 081 | **Empty attester configuration ⇒ closure disabled** (`ACC1_CLOSURE_ATTESTERS_UNCONFIGURED`), not "nothing to check" | API |
| 082 | **[v0.2]** Stale attestation (older than `ACC1_ATTESTATION_MAX_AGE_SECONDS`) ⇒ blocked; missing/invalid max-age configuration ⇒ boot refuses and completion fails closed | API |
| 083 | Active `court_order`/`regulatory_directive` restriction ⇒ completion refused | API |
| 084 | **[v0.4 rewritten]** `closing`/`closure_sealed` reach the operational projection **only** through the governed `abort_closure` recovery (DB refuses any other path, incl. direct `UPDATE` and `closing → active` without a recovery row); `closure_sealed → closed` only via completion (independent target) or the atomic family completion (family member); `closed → *` never; **no ungoverned unseal/reopen route**; identifiers not reusable (T-174…T-178, T-209) | DB |
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

LED-01: applies the consumer evaluation order — **refuses every new posting when `closure_barrier = true`** (never keyed on `effective_status`), denies when a component ≠ `active` except closure-drain allow-list activity under `closing` (CDA-1 only when bound to the closure initiation id), denies on `unknown`; stores `subaccount_id` **and the resolve `versions` with each posting**; publishes its **contract descriptor** (including `commit_ordered_watermark = true`); provides the **pre-seal readiness** and the **post-barrier attestation** (`seal_version_observed`, **commit-ordered** watermarks, `committed_after_preseal_watermark`, `max_resolution_version_committed`, in-flight status, drained-state fields); fences in-flight postings before attesting. IAM-02: the actor-binding and maker-initiation seams of DCR-ACC-IAM-06/-07 (independent actor verification, entitlement evidence, credential scope). CLT-01: the credential-scope statement of DCR-ACC-CLT-03. CLT-01: refuses client closure on non-zero/unavailable `open-accounts`. IAM-02: narrowing-only scoped grants; §29 item 39. CFG-01: treats `unknown` as deny for condition 9. These are dependency-change deliverables (file 17), tested in those modules' suites.

## 16. [v0.2] Remediation tests (RF-01…RF-11, approved decisions)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 121 | **[v0.4 rewritten — ACC-R3-HD-03, R3-F03]** **Dependency prerequisites** replace the withdrawn environment gates: each operation of file 01 §4.5 refuses `ACC1_DEPENDENCY_NOT_SATISFIED` (carrying the `DEP-*` id, the `evidence_failure` code and the evidence `provider`) unless the dependency is evidenced **by behaviour verified from the owning service at operation time** (runtime dependencies) or is a hard-unsatisfied governance-only dependency; it proceeds when satisfied by real evidence **or** by an explicit labelled test double of the target contract — identically in every environment (T-189). **No configuration string or declared version, environment name, environment variable or runtime toggle selects, lifts or relaxes a prerequisite** (T-223, T-224); no configuration can select a test double (T-188, source guard) | RF-01, RF-02, RF-05, RF-09 | Integration+Source |
| 122 | No route resolves "the default subaccount" of a client or master; resolve **requires** an explicit `subaccount_id` | ACC-HD-1 | API |
| 123 | `is_default` is absent from every internal seam and cannot be a selector | ACC-HD-1 | API |
| 124 | Consumer-contract vector: a missing `subaccount_id` ⇒ the reference consumer **denies**, never defaults | ACC-HD-1 | Contract |
| 125 | The default subaccount confers no implicit permission, scope, product target or capability evidence (scope-validate/resolve treat it exactly like any other subaccount) | ACC-HD-1 | API |
| 126 | `scope-validate` makes **no outbound call** (no re-entrancy into IAM-02) | RF-10 | API+Source |
| 127 | **[v0.3]** Known-gap: a stub of IAM-02 `execute-verify` with **no role check** ⇒ ACC-01 asserts no entitlement; `DEP-IAM-ENTITLEMENT` unsatisfied ⇒ governed apply refused `ACC1_DEPENDENCY_NOT_SATISFIED` **in every environment** (parameterised; no environment-based branch) | RF-01 | API |
| 128 | Known-gap: approval creation/approval by non-entitled fixture users succeeds against the stub; the test is labelled `KNOWN_GAP_IAM2_FIND_002` and fails **loudly** if IAM-02 behaviour is ever changed under it, prompting rewrite | RF-01 | Contract |
| 129 | **[v0.4]** IAM-02 seam contract: ACC-01 sends the canonical `payload` (never a hash) to approval request; stored `payload_hash` matches `^sha256:[0-9a-f]{64}$` and fits the column; the **actor-binding seam** body contains exactly `decision_token, approval_id?, actor_session_ref (as received), action, resource, entity_id, client_id, current_payload_hash` (`additionalProperties: false`); **no body `actor_id` is ever sent as proof** and today's `execute-verify` is not used as proof (T-181, T-225) | RF-07 | Contract |
| 130 | **[v0.3 rewritten — R2-F04]** ACC-01 does **not** assert that "a different caller cannot apply" against today's seam (that property is false: `actor_id` is a body field any token-holder can set). It asserts (a) the **local defence in depth** — IAM-01 session principal ≠ stored `requested_by` ⇒ `ACC1_ACTOR_BINDING_MISMATCH` (T-183); (b) ACC-01 never treats a body `actor_id`/`approval_id` as proof (T-182); (c) governed apply is gated on `DEP-IAM-ACTOR-BINDING` (T-181) and proven only against a test double of the **target** contract (T-180) | RF-07, R2-F04 | API |
| 131 | **Config fail-closed:** missing/invalid `ACC1_MAX_SUBACCOUNTS_PER_MASTER` ⇒ boot refuses (`ACC1_CONFIG_INVALID`); no code default; creation with the limit unavailable fails closed; a limit < 1 invalid | ACC-HD-3 | Unit+API |
| 132 | **Readiness makes zero outbound calls** (fetch spy) and reports ready with every peer down; **[v0.4]** it lists each `DEP-*` as `VERIFIED_PER_OPERATION` or `HARD_UNSATISFIED`, never as satisfied, and reports no declared contract version as evidence (T-231) | RF-10 | API |
| 133 | `closing` and `closure_sealed` rows still count against the master/subaccount limits and name uniqueness; only `closed` frees them | RF-02 | DB |
| 134 | **[v0.4 rewritten]** Account creation requires `DEP-LED-CLOSURE-CONTRACT` — an environment-agnostic prerequisite **verified at apply from the attester's own contract descriptor** (empty attester set, unreachable, incomplete or non-commit-ordered descriptor ⇒ unsatisfied; configuration alone never satisfies, T-229); ownership immutability and the empty-attester rule are unchanged; **no void/bypass route exists** (route-table source guard). Whether creation is *available* in an environment is CFG-01's, not tested here | RF-02 | Source+Integration |
| 135 | **[v0.3 rewritten]** **Barrier:** a sealed target resolves with `closure_barrier = true`, which the conformance consumer denies for **all** transaction-producing activity **before** looking at any status (T-153…T-156); only `closed` (barrier stays true) follows, or the governed abort | RF-03 | API |
| 136 | **[v0.4 rewritten]** An attestation taken **before** the seal (older/none `seal_version`), with `seal_version_observed` ≠ current, `binding_ok = false`, a non-latest row, a `preseal_watermark_ref` that differs from the pin's, or any violated field of T-170 never satisfies completion | RF-03 | API+DB |
| 137 | **[v0.3 rewritten]** **Attest-then-post race:** attester `clear` → a posting attempt after seal is denied by the reference LED-01 consumer contract; if the target state changed (e.g. governed abort), the completion compare-and-set fails; the **resolved-before-seal / committed-after-seal** race is T-171 | RF-03 | Contract+DB |
| 138 | **[v0.4 rewritten]** **Master seal eligibility:** the master seal is refused (`ACC1_CLOSURE_FAMILY_INELIGIBLE`) while any master-directed child — **the default included** — is not `closure_sealed` with a fresh clear attestation, or an independent child is not `closed`; the master's approved payload binds the family set hash; every child needs its own readiness, its own final approval and its own post-barrier attestation; the master needs its own (T-200, T-210) | RF-03 | API |
| 139 | **[v0.4 rewritten]** The default subaccount **enters `closing` with its master, seals under the ordinary child rules and waits at `closure_sealed`**; it never closes before its master and cannot close alone; it becomes `closed` only inside the master's atomic completion (T-031, T-160, T-162, T-199) | ACC-HD-1, RF-03, R3-F01 | API |
| 140 | **Consumer conformance matrix:** for each status ≠ `active` and each transaction-producing activity class (trading, deposit, withdrawal/payout, settlement, wallet/payout activation, internal transfer, fee posting, subscription, payment acceptance, Exchange/securities-market access) the reference consumer denies unless an explicit authoritative allow exists (none ⇒ deny) | RF-04 | Contract |
| 141 | Empty or partial `blocked_scopes` **never** permits an activity; no consumer-side derivation of an allow from scopes | RF-04 | Contract |
| 142 | **Time-effective:** a `scheduled` restriction with `effective_from_utc <= clock_timestamp()` (database clock) is enforced by resolve **with the housekeeping job stopped**; the job later aligns stored state | RF-08 | DB+API |
| 143 | **Every** restriction change (apply, activation, lift, expiry, cancellation) bumps the target's `version`; a **master** restriction changes the consumer-visible `versions` tuple | RF-08 | DB |
| 144 | `applied_restriction_ids` includes time-effective restrictions not yet processed by housekeeping | RF-08 | API |
| 145 | **Restriction owner binding:** inserting a restriction pairing client A/master A with client B's subaccount ⇒ FK violation; subaccount target with mismatched master or client ⇒ rejected; master target under the wrong client ⇒ rejected | RF-06 | DB |
| 146 | **[v0.4 rewritten — ACC-R2-HD-08, R3-F03]** **Credentials, every environment:** ACC-01 references no CLT-01 general internal-token variable **name** and no IAM-02 general internal-token variable name (source guard); it requires dedicated `…_STATUS_READ` / `…_VERIFY` credentials **or explicit labelled test doubles in DEVELOPMENT and TEST too**; boot refuses a dedicated credential equal to **another secret configured for ACC-01**, parameterised over all five `ENVIRONMENT` values (T-187). **ACC-01 does not claim to detect a general peer token by value** (it does not hold that value): least privilege is proved **per call** by the scope statements of IAM-02 and CLT-01 (T-227, T-228, T-230); apply-time and reconciliation CLT-01 reads use the read-scoped client (T-186) | RF-05 | Source+Unit |
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
| 160 | **[v0.4 rewritten — R3-F01]** **Master with only its default subaccount closes end to end as a family:** maker-only initiation (master + default → `closing`, one TX) → default readiness → default own final approval → default sealed → default attested → **default waits at `closure_sealed`** → master readiness → master final approval → master sealed → master attested → master `close/complete` closes **default and master in one transaction** (T-199 asserts the invariant after every step) | R3-F01 | API+DB |
| 161 | Master initiation moves master, default and every operational child to `closing` in **one** transaction and writes the `closure_family` and immutable `closure_family_member` rows; forcing any step to fail rolls all back | ACC-R3-HD-01 | DB |
| 162 | **[v0.4 rewritten]** The default cannot enter `closing` alone, be `closed` alone, be completed alone or be aborted alone (`trg_acc1_default_protected`); while its master is `closing` it seals normally and waits; it reaches `closed` only in the master's completion transaction | ACC-R3-HD-01 | DB |
| 163 | **[v0.4 rewritten]** A master cannot seal while any master-directed child (default included) is not sealed and attested or an independent child is not `closed`; the deferred `trg_acc1_closure_family` rejects a commit leaving a `closing` master with an operational child, a `closure_sealed` master with a child that is neither `closure_sealed` master-directed nor `closed` independent, or a `closed` master with a non-`closed` child | R3-F01 | DB |
| 164 | **Concurrency:** `create_subaccount` apply vs master-closure **initiation**, both interleavings (each run repeatedly): creation-first ⇒ the initiation sees the changed family set and is refused (`ACC1_CLOSURE_FAMILY_SET_CHANGED`); closure-first ⇒ creation waits, sees `closing` and is rejected; **no child ever appears under a `closing` master** (`FOR SHARE` on the master in A4 and in `trg_acc1_sa_owner`) | R2-F02 | DB |
| 165 | A master in `closing`, `closure_sealed` or `closed` rejects new child creation (`ACC1_PARENT_NOT_USABLE`) | R2-F02 | API |
| 166 | **Pre-seal readiness (parameterised by condition):** seal refused `ACC1_CLOSURE_NOT_READY` when the pinned readiness is missing, `not_ready`, `unavailable`, stale, superseded, for another `closure_cycle`, or shows balance `present`, an open withdrawal, an open settlement, a blocking reconciliation break or an unaccounted in-flight posting; **[v0.4]** a master's family conditions fail separately as `ACC1_CLOSURE_FAMILY_INELIGIBLE` (T-245) | R2-F01 | API |
| 167 | **A funded account cannot be sealed:** fake attester reports `balance_state = present` ⇒ refused; after CDA-1 completes (`returned`) and readiness is `ready` ⇒ the seal request succeeds | R2-F01 | API |
| 168 | **[v0.4 rewritten]** Seal **apply** obtains a fresh apply-time verification that is **not** inserted as a readiness row (T-222); a differing `journal_watermark` from the approved W_pre ⇒ `ACC1_CLOSURE_NOT_READY`, request unchanged, new request needed | R2-F01 | API |
| 169 | **Final-approval timing:** the seal needs its **own** applied `seal_closure` request (initiation is maker-only, so no earlier approval exists to be mistaken for it); `close/complete` has no approval step and no second checker (source guard: complete path makes no IAM-02 approval call); the pinned readiness ids and W_pre are bound into the approved payload (T-221) | HD-02 | API+Source |

### 17.3 Attestation contract and latest-attestation semantics (R2-F01, DCR-ACC-LED-01c)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 170 | Each violation alone blocks completion: `seal_version_observed` ≠ current; `preseal_watermark_ref` ≠ the **pinned** W_pre (**[v0.4]**, never "the latest readiness"); `committed_after_preseal_watermark > 0`; `max_resolution_version_committed ≥ closure_sealed_at_version`; `in_flight_status = unresolved`; stale `as_of` (secondary guard); wrong target | R2-F01 | API+DB |
| 171 | **Resolved-before-seal / committed-after-seal race:** fake LED-01 resolves at version < seal, commits after the seal ⇒ its journal position is after W_pre ⇒ `committed_after_preseal_watermark > 0` ⇒ completion blocked; a posting that ignored the barrier (resolution version ≥ seal) ⇒ `max_resolution_version_committed ≥ closure_sealed_at_version` ⇒ blocked. No wall-clock assumption in either check | R2-F01 | Contract+DB |
| 172 | **Latest-attestation semantics:** an earlier `clear` followed by a later `blocked` ⇒ blocked; an earlier `blocked` followed by a later `clear` ⇒ completes; a non-latest `clear` never satisfies; evaluated per attester (one blocked attester blocks); rows for an older `closure_seal_version` never count; the same latest-row rule for readiness per `closure_cycle` | R2-F01 | API+DB |
| 173 | `trg_acc1_seal` rejects `closed` in the database when only a non-latest `clear` row exists (independent of application logic) | R2-F01 | DB |

### 17.4 Governed abort / unseal (R2-F01, ACC-R2-HD-03; OQ-07)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 174 | Abort from `closing`: legal only with matching blocking evidence; stored status becomes the **recomputed** projection of restrictions in force by time; `closure_cycle` incremented; earlier readiness rows no longer match; version bumped; `closure_recovery` row; Critical `acc1.account_closure_aborted` | HD-03 | API+DB |
| 175 | Abort from `closure_sealed`: `closure_barrier` cleared **only here**; `closure_seal_version` **retained**; a later re-seal gets a **strictly higher** `closure_seal_version` and the old `clear` rows never satisfy it; version bumped; Critical audit | HD-03 | API+DB |
| 176 | **[v0.4 rewritten]** Abort refused (`ACC1_CLOSURE_ABORT_INVALID` / `ACC1_CLOSURE_FAMILY_MEMBER`) without evidence, for a `closed` row, and for a master-directed child (the default included) alone; a master abort returns the master, the default and **every master-directed child** in one TX; **independent closures are untouched** (T-202); an already-`closed` child can only be an independently completed non-default child and stays `closed`. v0.3's assertion that a `closed` default stays `closed` after an abort is **removed** (that state is now unreachable, T-206) | HD-03, ACC-R3-HD-01 | API+DB |
| 177 | **Abort never restores what another authority denied:** CLT-01 reports `suspended` after abort ⇒ effective status still denies; a restriction still in force ⇒ projection stays `restricted`/`suspended`/`frozen`; no `cfg1.*` read or write; no capability/permission state touched | HD-03 | API+Source |
| 178 | **No uncontrolled reopen:** route-table source guard shows no unseal/reopen/revert route and no direct status-write route; the DB refuses `closure_barrier true → false` and `closure_sealed/closing → operational` without a governed recovery row; abort requires maker-checker (approval-gated `*.close_abort`; never break-glass) | HD-03 | Source+DB |
| 179 | **Blocked attestation recovery, end to end:** sealed → latest attestation `blocked` → completion refused (target stays barred) → governed abort → operational projection → a later new closure request proceeds normally | R2-F01 | API+DB |

### 17.5 Apply actor binding (R2-F04, ACC-R2-HD-07)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 180 | **[v0.4]** Against a **labelled test double of the target contract** (which verifies the forwarded IAM-01 reference itself — T-233…T-235): authenticated actor ≠ maker ⇒ refused; checker = maker ⇒ refused; returned `payload_hash` ≠ recomputed ⇒ refused; `action`/`resource`/`entity_id`/`client_id` mismatch ⇒ refused; body `approval_id` ≠ attested id ⇒ refused; on success `approval_id`, checker and `policy_id` are recorded with `approval_id_source = iam2_attested` | HD-07 | Contract |
| 181 | **Current-seam honesty:** a stub modelled on the **observed** `execute-verify` (body `actor_id`, `approval_id` never verified/returned) ⇒ governed apply refused `ACC1_DEPENDENCY_NOT_SATISFIED` (`DEP-IAM-ACTOR-BINDING`), **in every environment**; labelled `KNOWN_GAP_IAM2_ACTOR_BINDING`; **[v0.4]** with the actor-binding seam absent the refusal happens **before any token is consumed** (T-225); fails loudly if IAM-02 behaviour changes under it | HD-07 | API |
| 182 | ACC-01 never derives the proof from a caller-supplied value: source guard — no code path sets the IAM-02 actor from a request body, and none claims verification of a body `approval_id` | HD-07 | Source |
| 183 | IAM-01 session principal ≠ stored `requested_by` at **apply** and at **cancel** ⇒ `ACC1_ACTOR_BINDING_MISMATCH` (Critical; both identities audited); passing this check does **not** satisfy the dependency | R2-F04 | API |
| 184 | A row with `approval_id_source = caller_asserted` is never presented as verified evidence; reconciliation R-7 reports the source | R2-F04 | DB+API |
| 185 | **Step-up rationale:** a stub with guard order (step-up before approval) returns a blocking `step_up_required` for **every** actor when `requires_step_up = true`; the catalogue migration sets `requires_step_up` on **no** `acc1.*` row | R2-F04 | DB+Contract |

### 17.6 Credentials and dependency prerequisites (R2-F05, R2-F08, ACC-R2-HD-06/08)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 186 | **Every** CLT-01 status read — resolve, batch, submit, apply of create/close/seal/abort/restrict/lift/cancel, reconciliation R-3 — goes through the single read-scoped client (source guard: exactly one CLT-01 HTTP client is constructed; no other request to a CLT-01 URL) | R2-F05 | Source |
| 187 | **[v0.4 rewritten — R3-F03.4]** A dedicated credential equal to **another secret configured for ACC-01**, or a missing value ⇒ boot refuses `ACC1_CONFIG_INVALID`, **parameterised over all five `ENVIRONMENT` values**; a source reference to a general CLT-01/IAM-02 token variable **name** fails the source guard; no code path selects credentials by environment; no "temporary broad token" path. **No claim is made that boot detects a general peer token by value** — ACC-01 cannot know it; that protection is per call (T-227, T-228, T-230) | HD-08 | Unit+Source |
| 188 | The **test composition root** injects labelled doubles (`provider = test_double` + label); the **production composition root imports none**; no configuration value, environment variable or environment name can select a double | HD-06, HD-08 | Source |
| 189 | **[v0.4]** **Dependency matrix:** for each operation of file 01 §4.5 (including maker-only **initiation**, **seal**, **abort** — which needs **no** `DEP-LED-CLOSURE-CONTRACT` — completion and restriction operations) and each required `DEP-*`, absence ⇒ `ACC1_DEPENDENCY_NOT_SATISFIED` naming that dependency and the `evidence_failure`; satisfied by real behavioural evidence **or** a labelled double of the target contract ⇒ proceeds; **identical outcomes in all five environments** (parameterised); governance-only dependencies stay refused (T-224); `open-accounts`, `scope-validate` and the reconciliation extract require none | HD-06, R2-F08 | Integration |
| 190 | **No environment logic:** source guard — no conditional in dependency, permission, credential, closure, restriction or route code reads the environment name (only audit/response recording and boot validation of `ENVIRONMENT`); no read of `cfg1.feature.environment_scope` or any CFG-01 environment state | HD-06 | Source |
| 191 | **[v0.4]** Dependency verification records expose their `provider` (`real`/`test_double`) and `evidence_failure` in **audit**; service readiness reports no dependency as satisfied and still makes **zero** outbound calls (extends T-132, T-231) | HD-06 | API |

### 17.7 Restriction lifecycle (R2-F07)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 192 | `cancel_scheduled_restriction` on a scheduled restriction **not yet effective**: maker-checker governed, ⇒ `cancelled`, target `version` bumped, history + audit `acc1.account_restriction_cancelled`; it never appeared in `applied_restriction_ids` | R2-F07 | API+DB |
| 193 | **[v0.4]** Cancel refused `ACC1_RESTRICTION_ALREADY_EFFECTIVE` once `effective_from_utc <= clock_timestamp()` (database clock, decided **at apply**, even if stored `scheduled`; see T-246); refused `ACC1_RESTRICTION_NOT_IN_FORCE` for lifted/expired/cancelled | R2-F07 | API |
| 194 | Cancelling an authority-sourced (`court_order`/`regulatory_directive`) scheduled restriction needs authority-release `cancel_evidence_ref` (`ACC1_RESTRICTION_LIFT_BLOCKED` otherwise) | R2-F07 | API |
| 195 | **Lift of a time-effective restriction still stored `scheduled`, with the housekeeping job stopped:** succeeds; the lift transaction performs the activation inline (history + `acc1.account_restriction_activated` cause `lift_inline_activation`) then `lifted`; target `version` bumped; both status-history rows present; one transaction | R2-F07 | DB+API |
| 196 | Lift of a **not-yet-effective** restriction ⇒ `ACC1_RESTRICTION_NOT_IN_FORCE` (use cancel); lift of a lapsed one ⇒ `ACC1_RESTRICTION_NOT_IN_FORCE` | R2-F07 | API |
| 197 | **Housekeeping never determines legality:** the same lift/cancel requests give identical legality outcomes with the job stopped, running, and crashed mid-way (parameterised) | R2-F07 | DB+Job |
| 198 | **[v0.4]** Cancel and lift are approval-gated (no direct route), require the governed-apply set and `DEP-FREEZE-GOVERNANCE` — which is **hard-unsatisfied** in the production composition root (T-224), so they are exercised only through a labelled test double — and audit Critical | R2-F07 | API |

## 18. [v0.4] Round-3 remediation tests (R3-F01…R3-F07, ACC-R3-HD-01…03)

Contract tests use a **reference consumer**, a **fake LED-01 attester** and **target-contract doubles** of IAM-02 and CLT-01 (labelled test doubles). "Invariant query" = *select every master with `status <> 'closed'` that does not have exactly one non-`closed` default subaccount, and every `closed` master with a non-`closed` subaccount* (must return zero rows).

### 18.1 Master-family closure (R3-F01, ACC-R3-HD-01)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 199 | **Master with only its default subaccount, end to end:** maker-only initiation (master + default `closing`, one TX) → default readiness → default own final approval → default `closure_sealed` (barrier, pin) → default attested → **default stops at `closure_sealed`** (asserted: `close/complete` on it ⇒ `ACC1_CLOSURE_FAMILY_MEMBER`) → master readiness → master final approval → master sealed → master attested → master `close/complete` closes **default and master in ONE transaction**. After **every** step the invariant query returns zero rows | R3-F01 | API+DB |
| 200 | **Master with multiple children (default + three):** each child has its own readiness, own final approval, seal and attestation and stops at `closure_sealed`; the master seal is refused (`ACC1_CLOSURE_FAMILY_INELIGIBLE`) while any one child is not sealed and attested or has a stale attestation; family completion closes all five rows in one TX; forcing the last row's update to fail rolls back **all** (no member `closed`) | R3-F01 | API+DB |
| 201 | **Master abort after all children sealed** (and after the master sealed and attested): the abort reverses master, default and every master-directed child in one TX — barrier cleared only there, `closure_cycle` + 1, `closure_seal_version` retained, `closure_seal_pin_id` and `closure_family_id` cleared, projection recomputed by time, one `closure_recovery` row per member, family `aborted`. The master is **not** `closed`, its default is **not** `closed`, and the invariant query returns zero rows (the R3-F01 state is unreachable) | R3-F01 | API+DB |
| 202 | **Master abort with one independently initiated child closure:** child C started its own closure (`closing`, and again in a `closure_sealed` variant) before the master initiation ⇒ recorded `independent_preserved` with C's own initiation id; the master abort leaves C's status, barrier, `closure_cycle`, pin and attestations **unchanged**, writes **no** recovery or history row for C, and audits the preserved set; C can still be aborted alone with its **own** evidence, or complete itself | R3-F01, R3-F05 | API+DB |
| 203 | **Independent closure and the eligibility rule:** an independent child still `closing`/`closure_sealed` blocks the master seal (`ACC1_CLOSURE_FAMILY_INELIGIBLE`) and is **not** adopted, forced or re-initiated; once it completes its own closure the master may seal; an independently `closed` child stays `closed` after a master abort while the default is non-`closed` (invariant holds); an independent closure cannot be initiated under a master that is `closing` or later (`ACC1_CLOSURE_FAMILY_MEMBER`) | R3-F01 | API+DB |
| 204 | **Second closure attempt after abort:** a new master initiation creates a **new** `closure_family_id` and increments cycles; the old family is `aborted` and inert; old readiness, pins and attestations never match (cycle, seal version and pin differ); preserved independent children are still not adopted; the second closure completes end to end | R3-F01 | API+DB |
| 205 | **Client closure after a completed master closure:** `open-accounts` returns zero non-`closed` masters and subaccounts (affirmative), so the CLT-01 contract test may permit client `closed`; while any member is still `closure_sealed`, or after a master abort, it returns non-zero | R3-F01, DCR-ACC-CLT-01 | API+Contract |
| 206 | **Structural invariant (ACC-REQ-050):** the database rejects at commit every attempt to leave a non-`closed` master without exactly one non-`closed` default (direct `UPDATE` of the default to `closed`; `close_subaccount`/initiation on the default; a second default; closing the default without its master); a randomised sequence of initiate / seal / attest / complete / abort / independent-closure operations over masters with 0–5 children never produces a violating state (invariant query after every step); reconciliation R-8 detects a seeded violation | R3-F01 | DB+Property |
| 207 | **Concurrent family completion and abort** (both interleavings, repeated): they serialise on the master lock. Completion first ⇒ abort refused (`ACC1_CLOSURE_ABORT_INVALID`, master `closed`); abort first ⇒ completion's re-verification fails and nothing closes. In no interleaving is any member `closed` while another is not; no deadlock (master-then-children lock order) | R3-F01 | DB |
| 208 | **Child state change between family verification and the atomic close:** (a) a child's latest attestation superseded by a `blocked` row after the route's pre-verification but before the transaction; (b) an authority restriction recorded on a child; (c) an attempted change of a member's pin, seal version or cycle (rejected by the triggers); (d) an attempt to create a new child (refused: master `FOR SHARE`); (e) a member's attestation aged past `ACC1_ATTESTATION_MAX_AGE_SECONDS`. Each ⇒ completion re-verifies **under the locks** and refuses; all members stay `closure_sealed` | R3-F01 | DB+API |
| 209 | **A master-directed child cannot be completed, aborted or closed alone:** `close/complete` on it ⇒ `ACC1_CLOSURE_FAMILY_MEMBER`; a child-level `abort_closure` ⇒ refused; a direct/forged `closed` status write for a family member outside the master's `closure_family_complete` transaction ⇒ `trg_acc1_default_protected` / `trg_acc1_seal` raises | R3-F01 | API+DB |
| 210 | **Master seal binds the family set:** the approved `family_set_hash` equals the recomputed hash at apply; a child re-attested (new latest row), re-sealed, given an authority restriction, or added between approval and apply ⇒ `ACC1_CLOSURE_FAMILY_SET_CHANGED` / `ACC1_CLOSURE_APPROVAL_STALE`; a child attestation older than the maximum age ⇒ `ACC1_CLOSURE_FAMILY_INELIGIBLE` | R3-F01, R3-F02 | API+DB |
| 211 | **The barrier stands on every member from its seal to the family close:** while the master is still `closing`, each sealed child resolves `closure_barrier = true` and the consumer denies; the master's own barrier becomes true at its seal; there is no window in which a sealed member resolves `false` before the atomic close or the abort | R3-F01, ACC-REQ-042 | API+Contract |
| 212 | **Membership is explicit and immutable:** `closure_family_member` rows carry the right `membership` for master, default, master-directed and `independent_preserved` (with the child's own initiation id); `UPDATE`/`DELETE` rejected; exactly one master and one default per family; a family is `completed` only if its master is `closed` | R3-F01, ACC-REQ-051 | DB |

### 18.2 Readiness approved by the checker is pinned into the seal (R3-F02)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 213 | The seal persists an immutable `closure_seal_pin` (readiness id, sequence, watermark and payload hash per attester; cycle; approved and sealed-at versions; initiation and family ids; seal payload hash; attested approval id, checker, policy; apply-time verification); `UPDATE`/`DELETE` rejected; an abort clears only the target's pin id and leaves the pin as evidence; a later seal writes a **new** pin at a strictly higher `closure_seal_version` | R3-F02 | DB+API |
| 214 | **No readiness row after the seal:** an insert for a `closure_sealed`/`closed` target is refused by `trg_acc1_readiness_insert` (`ACC1_CLOSURE_READINESS_REFUSED`) — for `ready` and `not_ready` rows, for master and child, for a wrong cycle and for another initiation — and the route reports it without recording a row | R3-F02 | DB+API |
| 215 | **Readiness collection racing the seal, both orders:** readiness first ⇒ the new row is the latest, the pinned row is no longer latest, seal apply refused (`ACC1_CLOSURE_NOT_READY` / `ACC1_CLOSURE_APPROVAL_STALE`); seal first ⇒ the collection's insert is refused. Repeated under load; the target row lock serialises them | R3-F02 | DB |
| 216 | **Completion never uses "the latest readiness":** a later readiness row injected by a test-only owner-role bypass of the trigger (different watermark) has **no effect** on completion, which compares the attestation to the pin; reconciliation R-10 flags the injected row as an integrity break | R3-F02 | DB |
| 217 | **Change after approval:** a restriction, profile edit or other mutation that bumps the target `version` between the checker's approval and seal apply ⇒ `ACC1_CLOSURE_APPROVAL_STALE`, nothing sealed, new request and new approval needed; likewise a changed `closure_cycle` or a superseded pinned readiness | R3-F02 | API+DB |
| 218 | **Commit-ordered watermark:** a fake attester whose descriptor says `commit_ordered_watermark = false` (insert-time sequence) ⇒ `DEP-LED-CLOSURE-CONTRACT` unsatisfied (creation, initiation, collection and seal refused); a conforming fake with a commit-ordered watermark detects a posting resolved before the seal and committed after it that an insert-time sequence would have positioned **below** W_pre (`committed_after_preseal_watermark > 0` ⇒ blocked) | R3-F02 | Contract+DB |
| 219 | **Drained-state assertion:** an attestation with `balance_state = present` or `open_item_count > 0` never counts as `clear` even when every watermark field passes; completion blocked | R3-F02 | API+DB |
| 220 | **Attestation binding:** the database sets `seal_pin_id`, `pinned_readiness_id`, `closure_cycle_observed` and `binding_ok`; an attestation whose `preseal_watermark_ref` differs from the pin's, or that is for an older pin, seal version or cycle, has `binding_ok = false`, is recorded but never counts, and `trg_acc1_seal` refuses `closed` on it | R3-F02 | DB |
| 221 | **Approval binding:** the approved seal payload contains every bound field (readiness id, sequence, watermark, payload hash; cycle; target version; initiation id; family id and set hash); altering any one changes `payload_hash` ⇒ apply refused; the attested approval id, checker and policy are persisted on the pin | R3-F02 | API |
| 222 | **Apply-time verification is not a readiness row:** the fresh attester call at seal apply is recorded only on the pin (`apply_verified_*`) and never inserted into `closure_readiness`, so it cannot displace the pinned row; a differing watermark ⇒ `ACC1_CLOSURE_NOT_READY` | R3-F02 | API+DB |

### 18.3 Dependency evidence (R3-F03, ACC-R3-HD-03)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 223 | **No self-declared string satisfies any dependency:** for every `DEP-*`, configuration values that look like evidence (`…_GOVERNANCE_REF`, `…_CONTRACT_VERSION`, `…_DECLARED_*`, arbitrary well-formed strings) leave the dependency unsatisfied (`ACC1_DEPENDENCY_NOT_SATISFIED`); source guard: no configuration key is read as dependency evidence and no gate reads one; parameterised over all five `ENVIRONMENT` values | R3-F03 | Unit+Source |
| 224 | **Governance-only dependencies are hard-unsatisfied:** `DEP-FREEZE-GOVERNANCE` (restriction apply/lift/cancel) and `DEP-PUBLIC-PERIMETER` (client routes) refuse with `GOVERNANCE_HARD_UNSATISFIED` under every configuration and environment; the production composition root binds the hard-unsatisfied gate (source guard); only the test composition root may inject a labelled double; no environment name, flag or setting lifts it | R3-F03 | Source+Integration |
| 225 | **`DEP-IAM-ACTOR-BINDING` is behavioural:** actor-binding seam absent (404/405) ⇒ refused **before any token is consumed**; a response missing `actor_assertion_authority` or any bound field ⇒ refused; today's `execute-verify` response (body `actor_id`, no attested record) ⇒ refused | R3-F03, R3-F04 | Contract |
| 226 | **`DEP-IAM-ENTITLEMENT` is behavioural:** an attested record with no entitlement block, `evaluated ≠ true`, another actor, another permission code or an empty `grant_ref` ⇒ refused; a bare `approval_required` or `execution_authorised = true` never counts; for initiation only the attested maker-initiation decision counts; whether `IAM2-FIND-002` is open is not consulted | R3-F03, R3-F06 | Contract |
| 227 | **`DEP-IAM-SCOPED-CREDENTIAL` is behavioural:** an IAM-02 response with no credential-scope statement, a general/mutation-capable scope or an unknown scope ⇒ refused, even though the call otherwise "works"; only the narrow set is accepted | R3-F03 | Contract |
| 228 | **`DEP-CLT-READ-SCOPE` is behavioural:** a CLT-01 status response without the credential-scope statement, or with another scope ⇒ resolve `unknown`, submit/apply refused, R-3 inconclusive; **no fallback** to another credential or token | R3-F03 | Contract+API |
| 229 | **`DEP-LED-CLOSURE-CONTRACT` is verified from the attester:** creation apply, initiation, collection and seal fetch the attester's descriptor at operation time; unreachable, malformed, incomplete, stale or `commit_ordered_watermark ≠ true` ⇒ refused; a configured base URL or version alone never satisfies; service readiness makes no such call (T-132) | R3-F03, RF-02 | Contract+API |
| 230 | **No fake boot detection:** boot refuses only what ACC-01 can prove (missing values; duplicate or equal values among ACC-01's own secrets and credentials; a source reference to a general peer token variable **name**); a source guard asserts no code compares a configured credential with a peer's general token value; no document or test claims more (T-146, T-187) | R3-F03 | Unit+Source |
| 231 | **Service readiness never says "satisfied":** the readiness payload lists each `DEP-*` as `VERIFIED_PER_OPERATION` or `HARD_UNSATISFIED`, reports no contract version as evidence, and makes zero outbound calls (fetch spy) | R3-F03, RF-10 | API |
| 232 | **Unknown/missing evidence never permits (fuzz):** for every dependency evidence field, absent, null, wrong type, empty, stale and out-of-range values each ⇒ refused; a peer timeout ⇒ refused; every refusal carries an `evidence_failure`, never an allow | R3-F03 | Unit+Contract |

### 18.4 Authenticated actor provenance (R3-F04)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 233 | **ACC-01-minted assertion refused:** against the target-contract double, an actor assertion produced or signed by ACC-01 (or one IAM-02 cannot verify with IAM-01) ⇒ refused and `DEP-IAM-ACTOR-BINDING` stays unsatisfied; a source guard shows ACC-01 has no code that mints, signs or transforms an identity assertion | R3-F04 | Contract+Source |
| 234 | **Independent verification:** with an IAM-01 session reference that the double verifies through its own IAM-01 stub, the attested `authenticated_actor_id` is recorded with `actor_assertion_authority`; a stale, revoked or foreign-user session ⇒ refused; the reference ACC-01 forwards is byte-identical to the one it received | R3-F04 | Contract |
| 235 | **The attested record binds every field:** `authenticated_actor_id`, maker/initiating actor, checker (where applicable), `approval_id`, `policy_id`, entitlement/grant evidence, `payload_hash`, `action`, `resource`, `entity_id`/`client_id` — a mismatch in any one ⇒ refused | R3-F04 | Contract |

### 18.5 Abort independent of a broken LED-01 (R3-F05)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 236 | **Abort needs no LED-01 dependency:** with the attester unreachable, its descriptor malformed or non-commit-ordered, the attester configuration removed, or `DEP-LED-CLOSURE-CONTRACT` otherwise unsatisfied, a governed abort with matching stored evidence **succeeds** (governed-apply set satisfied); the abort path makes no LED-01 call (fetch spy) | R3-F05 | API+Source |
| 237 | **Family evidence scope:** a master abort accepts evidence of the master, the default or any master-directed child (as the latest row of its kind) and records `evidence_owner_target_id`; evidence of an independent child, of a non-member, or a non-latest row ⇒ `ACC1_CLOSURE_ABORT_INVALID` | R3-F05 | API+DB |
| 238 | **Independent closures survive a master abort** (extends T-202): no state, barrier, cycle, pin or attestation of an independent child changes; `acc1.account_closure_independent_preserved` lists it; an independent child's own abort while its master is `closing` succeeds with its own evidence and touches neither the master nor the family | R3-F05 | API+DB |
| 239 | **Honest evidence statement:** in `closing`, a `not_ready` row from any undrained target is sufficient evidence for a governed abort; the test asserts the abort still requires the maker-checker approval, records the evidence and emits the Critical audit, and that abort with no matching row is refused — no further control is claimed | R3-F05 | API |

### 18.6 Closure initiation — maker-only (R3-F06, ACC-R3-HD-02; OQ-13)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 240 | **Maker-only, entitlement-checked:** initiation succeeds with no approval token, no checker and no IAM-02 approval call (source guard: the initiate path imports no approval seam); it uses a non-approval code (`acc1.*.close_initiate`, catalogue guard `requires_approval = false`); no approval-gated code is used for initiation; an un-entitled actor is denied (guard step 10 in the stub; attested initiator entitlement absent ⇒ refused) | R3-F06 | API+Source+DB |
| 241 | **Initiation is externally gated:** without the attested maker-initiation decision (DCR-ACC-IAM-07) — including against a stub modelled on today's IAM-02 — initiation is refused `ACC1_DEPENDENCY_NOT_SATISFIED` (`DEP-IAM-ENTITLEMENT`, `DEP-IAM-ACTOR-BINDING`) in every environment; a catalogue guard fails if any `acc1.*.close_initiate` row is registered `requires_approval = true` | R3-F06 | API+DB |
| 242 | **Audited or refused:** initiation emits Critical `acc1.account_closure_initiated` with actor, `actor_assertion_authority` and the entitlement evidence reference in the same transaction; SEC-01 unreachable ⇒ initiation refused, no state change | R3-F06 | API+DB |
| 243 | **Exactly one final human approval per target:** across a full closure the approval count is 0 at initiation, exactly 1 (`seal_closure`) per sealed target (the master and each master-directed child) and 0 after the seal (completion makes no approval call); a second checker is never requested | R3-F06, ACC-R2-HD-02 | API+Source |
| 244 | **Initiation binds the family set:** the preview's `family_set_hash` is required for master initiation; a subaccount created, closed or changed in status after the preview ⇒ `ACC1_CLOSURE_FAMILY_SET_CHANGED`; an idempotent replay of an applied initiation returns the recorded result and creates no second family | R3-F06, R3-F01 | API+DB |

### 18.7 Precision (R3-F07)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 245 | **Master readiness wording is structural:** the master's own readiness payload contains no attestation field; the family conditions (children sealed and attested, independent children closed) are evaluated by ACC-01 at the master seal and reported as `ACC1_CLOSURE_FAMILY_INELIGIBLE` with per-member outcomes | R3-F07.1 | API |
| 246 | **Restriction time source:** legality of cancel and lift uses the database `clock_timestamp()` in the locked check; `trg_acc1_restriction_terminal` refuses `cancelled` unless `effective_from_utc > clock_timestamp()`; a cancel whose transaction started before `effective_from_utc` but would commit after it is refused by the deferred commit-time check, so a restriction that a resolve counted in force is never cancelled without lift evidence; the residual commit-latency window is asserted bounded and evidenced by `applied_restriction_ids` and the version bump | R3-F07.2 | DB |
| 247 | **No application clock:** with the application clock skewed ±10 minutes, resolve's in-force set, lift/cancel legality and the abort projection are identical (source guard: no `Date.now()` / `new Date()` in those paths; time comes from the database) | R3-F07.2 | DB+Source |
| 248 | **CDA-1 discriminator:** `resolve` returns `closure_initiation_id` per level under `closing`; the reference consumer treats a withdrawal to a verified own-name destination as CDA-1 **only when bound to that id**; an unbound withdrawal to the same destination is denied under `closing` | R3-F07.3 | Contract |
