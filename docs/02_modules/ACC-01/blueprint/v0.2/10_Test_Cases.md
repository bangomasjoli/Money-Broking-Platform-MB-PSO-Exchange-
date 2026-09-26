# ACC-01 Account Structure
## 10 Test Cases (v0.2)

Test plan only — no test exists. **v0.2:** rows marked **[v0.2]** are new or rewritten by the remediation of `04-review.md`. IDs `ACC1-T-nnn`. "DB" = integration test against a real PostgreSQL under the **non-superuser** `role_acc1_runtime` (M-REV-1 lesson: a superuser run proves nothing about grants). Every DB-dependent file carries a **fail-loud canary** (H-D3C-1) and scopes its fixtures/assertions to rows it owns — never an unscoped `DELETE`/`COUNT` on a shared table (M-1, MIG-004-O1).

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
| 031 | Default subaccount cannot enter `closing`/`closure_sealed`/`closed` independently; only with its master (T-139) | API |
| 032 | Master `closing` lists **every** non-closed subaccount in the approved payload; a subaccount added afterwards changes the set ⇒ payload mismatch ⇒ new request (T-138) **[v0.2]** | API |
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
| 040 | Precedence matrix exhaustive over the **8** statuses (`closed > frozen > suspended > closure_sealed > closing > restricted > active`, `unknown` dominant) across 3 inputs **[v0.2]** | Unit |
| 041 | **[v0.2]** `blocked_scopes` is **explanatory only**: for every status ≠ `active`, the consumer-conformance vector denies transaction-producing activity **even when `blocked_scopes` is empty or does not name the activity** (T-140/141) | Unit |
| 042 | Master restricted ⇒ subaccount effective restricted **without any write to the subaccount row** (no fan-out); lift ⇒ restored exactly | DB |
| 043 | Client class `retail`/`unknown` ⇒ creation `ACC1_CLIENT_CLASS_NOT_ALLOWED`; client status outside {active, active_limited} ⇒ `ACC1_CLIENT_NOT_ELIGIBLE` | API |
| 044 | Creation while client `active_limited` succeeds and the account is inert (report-only); it becomes usable when CLT-01 reports `active` with no ACC-01 write; ACC-01's checks are asserted to be a **local backstop** (no eligibility ruling emitted) **[v0.2]** | API |
| 045 | Resolve never returns a cached `active` after CLT-01 turns `suspended` (no cache in v0.1) | API |
| 046 | Resolve returns `versions`, `applied_restriction_ids`, `scope_semantics = explanatory_only`, `environment`; omits names, descriptions and `is_default`; contains **no** `allowed`/`permitted`/`enabled` field **[v0.2]** | API |

## 5. Change requests and maker-checker (ACC-REQ-012/023)

| ID | Test | Type |
|---|---|---|
| 047 | Every creation/closure/restriction/lift route requires a change request; no direct create/set-status route exists (route-table source guard) | Source |
| 048 | Maker-only baseline: caller lacking the permission ⇒ deny; IAM-02 unreachable/malformed ⇒ `ACC1_PERMISSION_UNAVAILABLE` (fail closed) | API |
| 049 | Apply without an approval ⇒ `ACC1_APPROVAL_REQUIRED` | API |
| 050 | **[v0.2]** Approval creation by the maker themselves ⇒ blocked **by IAM-02** (`IAM2_SELF_APPROVAL_BLOCKED` translated where surfaced); ACC-01 additionally proves apply is bound to the stored maker (T-130) | API |
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
| 066 | `SUPER_ADMIN`/`ADMIN` without the specific permission cannot create/close/restrict/lift | API |

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
| 077 | **[v0.2]** Closure request → approval → apply ⇒ `closing` (master **and listed children** in one transaction); new-activity scopes reported; only explicitly authorised drain activity (none defined ⇒ consumers deny) | API |
| 078 | **[v0.2]** `close/complete` from `closure_sealed` with every attester `clear`, **post-barrier**, `seal_version_observed` = current, `in_flight_predating_seal = 0`, fresh ⇒ `closed`, `closed_at_utc` set, Critical audit (compare-and-set) | API |
| 079 | Any attester `blocked` ⇒ `ACC1_CLOSURE_BLOCKED`; target **stays `closure_sealed`**; attester outcomes returned as codes **[v0.2]** | API |
| 080 | Attester unreachable/timeout/malformed ⇒ `unavailable` ⇒ blocked (fail closed) | API |
| 081 | **Empty attester configuration ⇒ closure disabled** (`ACC1_CLOSURE_ATTESTERS_UNCONFIGURED`), not "nothing to check" | API |
| 082 | **[v0.2]** Stale attestation (older than `ACC1_ATTESTATION_MAX_AGE_SECONDS`) ⇒ blocked; missing/invalid max-age configuration ⇒ boot refuses and completion fails closed | API |
| 083 | Active `court_order`/`regulatory_directive` restriction ⇒ completion refused | API |
| 084 | No transition `closing → active`, `closure_sealed → anything but closed`, `closed → *`; no unseal; identifiers not reusable **[v0.2]** | DB |
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
| 111 | **[v0.2]** Identical behaviour and error codes across DEVELOPMENT/TEST/UAT/DEMO/PRODUCTION **except** the fail-closed real-use gates (T-121), which only restrict (parameterised) | Integration |
| 112 | Unknown environment ⇒ treated as PRODUCTION; boot refuses an invalid `ENVIRONMENT` | Unit |
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

LED-01: denies ledger-account creation/posting when `effective_status ≠ active` (consumer rule) or `unknown`; **refuses every posting to a `closure_sealed` target**; stores `subaccount_id`; provides post-barrier attestation with `seal_version_observed`, journal watermark and a zero in-flight-predating-seal count. CLT-01: refuses client closure on non-zero/unavailable `open-accounts`. IAM-02: narrowing-only scoped grants; §29 item 39. CFG-01: treats `unknown` as deny for condition 9. These are dependency-change deliverables (file 17), tested in those modules' suites.

## 16. [v0.2] Remediation tests (RF-01…RF-11, approved decisions)

| ID | Test | Finding / decision | Type |
|---|---|---|---|
| 121 | **Real-use gates:** in DEVELOPMENT/TEST every gated operation (G1 apply, G2 creation, G3 resolve, G4 restrictions, G5 closure, G6 client routes) works with fixture actors; in UAT, DEMO, PRODUCTION **and an unknown environment** each refuses `ACC1_REAL_USE_NOT_PERMITTED` with its gate id; no environment variable or runtime toggle lifts a gate (source guard) | RF-01, RF-02, RF-05, RF-09 | Integration+Source |
| 122 | No route resolves "the default subaccount" of a client or master; resolve **requires** an explicit `subaccount_id` | ACC-HD-1 | API |
| 123 | `is_default` is absent from every internal seam and cannot be a selector | ACC-HD-1 | API |
| 124 | Consumer-contract vector: a missing `subaccount_id` ⇒ the reference consumer **denies**, never defaults | ACC-HD-1 | Contract |
| 125 | The default subaccount confers no implicit permission, scope, product target or capability evidence (scope-validate/resolve treat it exactly like any other subaccount) | ACC-HD-1 | API |
| 126 | `scope-validate` makes **no outbound call** (no re-entrancy into IAM-02) | RF-10 | API+Source |
| 127 | Known-gap: a stub of IAM-02 `execute-verify` with **no role check** ⇒ ACC-01 asserts no entitlement; gate G1 blocks the governed apply in UAT/DEMO/PRODUCTION | RF-01 | API |
| 128 | Known-gap: approval creation/approval by non-entitled fixture users succeeds against the stub; the test is labelled `KNOWN_GAP_IAM2_FIND_002` and fails **loudly** if IAM-02 behaviour is ever changed under it, prompting rewrite | RF-01 | Contract |
| 129 | IAM-02 seam contract: ACC-01 sends the canonical `payload` (never a hash) to approval request; stored `payload_hash` matches `^sha256:[0-9a-f]{64}$` and fits the column; `execute-verify` body uses exactly `decision_token, approval_id, actor_id, action, resource, entity_id, client_id, current_payload_hash` (`additionalProperties: false`) | RF-07 | Contract |
| 130 | Apply is bound to the **stored maker**: a different caller cannot apply; `actor_id` = stored `requested_by`, never caller-supplied | RF-07 | API |
| 131 | **Config fail-closed:** missing/invalid `ACC1_MAX_SUBACCOUNTS_PER_MASTER` ⇒ boot refuses (`ACC1_CONFIG_INVALID`); no code default; creation with the limit unavailable fails closed; a limit < 1 invalid | ACC-HD-3 | Unit+API |
| 132 | **Readiness makes zero outbound calls** (fetch spy) and reports ready with every peer down; reports declared contract versions from configuration | RF-10 | API |
| 133 | `closing` and `closure_sealed` rows still count against the master/subaccount limits and name uniqueness; only `closed` frees them | RF-02 | DB |
| 134 | **G2:** account creation is unavailable outside DEV/TEST until the LED-01 attester contract is evidenced; ownership immutability and the empty-attester rule are unchanged; **no void/bypass route exists** (route-table source guard) | RF-02 | Source+Integration |
| 135 | **Barrier:** `closure_sealed` resolves to a status that a conformance consumer denies for **all** transaction-producing activity; only `closed` follows | RF-03 | API |
| 136 | An attestation taken **before** the seal (older/none `seal_version`), with `seal_version_observed` ≠ current, or `in_flight_predating_seal > 0` never satisfies completion | RF-03 | API+DB |
| 137 | **Attest-then-post race:** attester `clear` → a posting attempt after seal is denied by the reference LED-01 consumer contract; if the target state changed, the completion compare-and-set fails | RF-03 | Contract+DB |
| 138 | **Master closure:** master seal blocked while any child is non-`closed` (`ACC1_CLOSURE_SEAL_INVALID`); the approved payload lists children ids+versions; children each need their own post-barrier attestation; master needs its own | RF-03 | API |
| 139 | The default subaccount closes only with its master | ACC-HD-1, RF-03 | API |
| 140 | **Consumer conformance matrix:** for each status ≠ `active` and each transaction-producing activity class (trading, deposit, withdrawal/payout, settlement, wallet/payout activation, internal transfer, fee posting, subscription, payment acceptance, Exchange/securities-market access) the reference consumer denies unless an explicit authoritative allow exists (none ⇒ deny) | RF-04 | Contract |
| 141 | Empty or partial `blocked_scopes` **never** permits an activity; no consumer-side derivation of an allow from scopes | RF-04 | Contract |
| 142 | **Time-effective:** a `scheduled` restriction with `effective_from_utc <= now()` is enforced by resolve **with the housekeeping job stopped**; the job later aligns stored state | RF-08 | DB+API |
| 143 | **Every** restriction change (apply, activation, lift, expiry, cancellation) bumps the target's `version`; a **master** restriction changes the consumer-visible `versions` tuple | RF-08 | DB |
| 144 | `applied_restriction_ids` includes time-effective restrictions not yet processed by housekeeping | RF-08 | API |
| 145 | **Restriction owner binding:** inserting a restriction pairing client A/master A with client B's subaccount ⇒ FK violation; subaccount target with mismatched master or client ⇒ rejected; master target under the wrong client ⇒ rejected | RF-06 | DB |
| 146 | **Credentials:** ACC-01 references no CLT-01 general internal-token variable and no IAM-02 general internal token variable (source guard); it requires dedicated `…_STATUS_READ` / `…_VERIFY` credentials; boot refuses a dedicated credential equal to any other configured token | RF-05 | Source+Unit |
| 147 | **Retention:** no `DELETE`/`TRUNCATE` grant, no purge or retention job, no configured retention period in ACC-01 (source guard) | approved retention | Source+DB |
| 148 | An account row's client-derived input never comes from a cache; a CLT-01 status change is reflected on the next resolve | RF-04 | API |
| 149 | **No role assignment:** the ACC-01 migration/seed inserts **zero** `iam2.role_permission` rows and defines **no** role; no source file assigns a role to a permission | ACC-HD-2 | Source+DB |
| 150 | ACC-01 emits no eligibility verdict: no field, error or event states that a client/product is "eligible"/"approved" (only structural status) | RF-11 | API+Source |
| 151 | **Authority-restriction lift:** a `court_order`/`regulatory_directive` restriction cannot be lifted without authority-release evidence and cannot lapse by time | RF-09 (ungoverned ownership does not weaken this) | API |
| 152 | An ACC-01 restriction never alters CLT-01 client status and no route accepts a "client freeze" (that owner is ungoverned — DCR-ACC-GOV-05) | RF-09 | Source+API |
