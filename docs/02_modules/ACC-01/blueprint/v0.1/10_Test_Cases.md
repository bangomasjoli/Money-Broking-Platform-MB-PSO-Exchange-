# ACC-01 Account Structure
## 10 Test Cases

Test plan only — no test exists. IDs `ACC1-T-nnn`. "DB" = integration test against a real PostgreSQL under the **non-superuser** `role_acc1_runtime` (M-REV-1 lesson: a superuser run proves nothing about grants). Every DB-dependent file carries a **fail-loud canary** (H-D3C-1) and scopes its fixtures/assertions to rows it owns — never an unscoped `DELETE`/`COUNT` on a shared table (M-1, MIG-004-O1).

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
| 016 | Policy limit 1: second `create_master_account` for the same client ⇒ `ACC1_MASTER_ACCOUNT_LIMIT_REACHED` | API |
| 017 | Raising `ACC1_MAX_MASTER_ACCOUNTS_PER_CLIENT` to 2 permits a second **without a migration** | API |
| 018 | Closed master accounts do not count against the limit | API |
| 019 | Concurrency: two simultaneous approved creations for one client, limit 1 ⇒ exactly one succeeds (advisory lock) | DB |
| 020 | Subaccount limit enforced under the same lock; concurrent creations cannot exceed it | DB |
| 021 | Duplicate subaccount name (case-insensitive) among non-terminal siblings ⇒ `ACC1_DUPLICATE_SUBACCOUNT_NAME`; allowed once the sibling is `closed` | DB |
| 022 | At most one `is_default` per master (partial unique) | DB |

## 3. Lifecycle and state machine (ACC-REQ-010/011/016/017)

| ID | Test | Type |
|---|---|---|
| 023 | No account row exists without a `creation_change_request_id` that resolves to an `applied` request | DB |
| 024 | Every legal transition of file 06 §1.1 succeeds via its governed path | API+DB |
| 025 | Every *illegal* transition (exhaustive over the 6×6 matrix) rejected by `trg_acc1_status_transition` | DB |
| 026 | `closed` is terminal: any `UPDATE` (status, profile, restriction insert) rejected | DB |
| 027 | Direct status `UPDATE` with no session cause/actor set ⇒ commit fails (`trg_acc1_status_history`) | DB |
| 028 | Every status change writes exactly one history row with `sec_audit_ref` populated, same transaction | DB |
| 029 | Stored status equals the last history `to_status` for every row (invariant query) | DB |
| 030 | No `DELETE` possible (grant) | DB |
| 031 | Default subaccount cannot close independently; can close with its master | API |
| 032 | Master `closing` blocked while any subaccount is non-`closed` and not covered by the request | API |
| 033 | Subaccount creation refused under `suspended`/`frozen`/`closing`/`closed` master; allowed under `active`/`restricted` | DB |
| 034 | Default `general` subaccount created atomically with the master (HD-1 accepted); a failure of either rolls back both | DB |

## 4. Effective status (ACC-REQ-013/014)

| ID | Test | Type |
|---|---|---|
| 035 | Client `active` ⇒ effective = own/master worst-of | Unit |
| 036 | Client `active_limited` ⇒ effective `restricted` with all four transactional scopes blocked | Unit |
| 037 | Client `restricted` ⇒ strictest partial; `suspended` ⇒ suspended; `closed` ⇒ closed | Unit |
| 038 | Client `pending`, an unrecognised value, or a missing status ⇒ `unknown` | Unit |
| 039 | CLT-01 non-2xx / timeout / malformed body / network error ⇒ `unknown` (resolve) and `ACC1_CLIENT_LOOKUP_UNAVAILABLE` (create) | Unit |
| 040 | Precedence matrix exhaustive: every combination of the 7 statuses across 3 inputs yields the documented worst-of, `unknown` dominant | Unit |
| 041 | `blocked_scopes` = union per file 06 §2.2 | Unit |
| 042 | Master restricted ⇒ subaccount effective restricted **without any write to the subaccount row** (no fan-out); lift ⇒ restored exactly | DB |
| 043 | Client class `retail`/`unknown` ⇒ creation `ACC1_CLIENT_CLASS_NOT_ALLOWED`; client status outside {active, active_limited} ⇒ `ACC1_CLIENT_NOT_ELIGIBLE` | API |
| 044 | Creation while client `active_limited` succeeds and account is inert; becomes usable when CLT-01 reports `active` with no ACC-01 write | API |
| 045 | Resolve never returns a cached `active` after CLT-01 turns `suspended` (no cache in v0.1) | API |
| 046 | Resolve returns `versions`, `environment`, `caller_module` derivation; omits names/descriptions | API |

## 5. Change requests and maker-checker (ACC-REQ-012/023)

| ID | Test | Type |
|---|---|---|
| 047 | Every creation/closure/restriction/lift route requires a change request; no direct create/set-status route exists (route-table source guard) | Source |
| 048 | Maker-only baseline: caller lacking the permission ⇒ deny; IAM-02 unreachable/malformed ⇒ `ACC1_PERMISSION_UNAVAILABLE` (fail closed) | API |
| 049 | Apply without an approval ⇒ `ACC1_APPROVAL_REQUIRED` | API |
| 050 | Approval by the maker themselves ⇒ blocked (`IAM2_SELF_APPROVAL_BLOCKED` translated to `ACC1_SELF_APPROVAL_BLOCKED`) | API |
| 051 | `payload_hash` mismatch (request mutated in DB) ⇒ apply refused | API+DB |
| 052 | Replay of a consumed decision token ⇒ refused; no second mutation | API |
| 053 | Idempotent submit: same key + body ⇒ same request; same key + different body ⇒ `ACC1_IDEMPOTENCY_CONFLICT` | API |
| 054 | Preconditions re-checked at apply: client turned `closed` between submit and apply ⇒ request `failed`, nothing created | API |
| 055 | **Crash window:** kill after `execute-verify`, before mutation ⇒ request `applying` with `verification_ref`; recovery completes exactly once without re-verify | API+DB |
| 056 | Crash before `verification_ref` stored ⇒ recovery marks `failed` (`ACC1_APPLY_VERIFICATION_UNCERTAIN`), never retries blindly | API+DB |
| 057 | Concurrent `apply` on one request ⇒ one claim wins (CAS), the other gets in-progress, no double mutation | DB |
| 058 | Expired / cancelled / rejected requests cannot be applied | API |

## 6. Permission and scope (ACC-REQ-019…022)

| ID | Test | Type |
|---|---|---|
| 059 | Catalogue rows present with `licence_locked = false`, `prohibited = false`; approval flags as file 07 §2; **no `role_permission` row seeded** by the migration | DB |
| 060 | Default deny: with zero `role_permission` rows every human route denies (IAM2-FIND-002 reality) | API |
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
| 077 | Closure request → approval → apply ⇒ `closing`, new-activity scopes blocked | API |
| 078 | `close/complete` with every attester `clear` and fresh ⇒ `closed`, `closed_at_utc` set, Critical audit | API |
| 079 | Any attester `blocked` ⇒ `ACC1_CLOSURE_BLOCKED`; stays `closing`; attester outcomes returned as codes | API |
| 080 | Attester unreachable/timeout/malformed ⇒ `unavailable` ⇒ blocked (fail closed) | API |
| 081 | **Empty attester configuration ⇒ closure disabled** (`ACC1_CLOSURE_ATTESTERS_UNCONFIGURED`), not "nothing to check" | API |
| 082 | Stale attestation (older than max age) ⇒ blocked | API |
| 083 | Active `court_order`/`regulatory_directive` restriction ⇒ completion refused | API |
| 084 | No transition `closing → active`, `closed → *`; identifiers not reusable | DB |
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
| 105 | Migration up / down / re-up committed regression; down does not widen `role_acc1_runtime` | DB |
| 106 | Column-level `UPDATE` grants exactly as file 05 §6 (introspect `information_schema.column_privileges`) | DB |
| 107 | `iam2.permission` catalogue migration is `iam2`-scoped; inserts only the file 07 rows; seeds zero `role_permission`; down removes only its rows | DB |
| 108 | No test pins the global migration head number | Source |
| 109 | Suite runs green under a non-superuser role; a superuser-only pass is rejected by a role-identity canary | DB |
| 110 | Every `CHECK` enumeration rejects an out-of-set value | DB |

## 12. Environment and DEC-013 (ACC-REQ-021/035/036)

| ID | Test | Type |
|---|---|---|
| 111 | Identical behaviour, identical error codes across DEVELOPMENT/TEST/UAT/DEMO/PRODUCTION (parameterised) | Integration |
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
| 119 | Each check R-1…R-8 detects a seeded fault and passes on clean data | DB |
| 120 | Reconciliation read role/route cannot mutate | DB |

## 15. Contract tests owned elsewhere (recorded so they are not lost)

LED-01: denies ledger-account creation/posting for non-`active`/`unknown` subaccount; stores `subaccount_id`; provides attestation. CLT-01: refuses client closure on non-zero/unavailable `open-accounts`. IAM-02: narrowing-only scoped grants; §29 item 39. CFG-01: treats `unknown` as deny for condition 9. These are dependency-change deliverables (file 17), tested in those modules' suites.
