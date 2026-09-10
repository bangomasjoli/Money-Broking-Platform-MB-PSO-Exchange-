---
document_id: FND-01-ACC-003
title: FND-01 Shared Rate-Limit Engine — Independent Acceptance + Post-Acceptance Hardening (Opus, v1.0)
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: FND-01
control: Shared rate-limit engine (WLT-01 BLOCKER-2 prerequisite) — POST /foundation/rate-limit/check
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: eb4a767
---

# FND-01 Shared Rate-Limit Engine — Independent Acceptance + Post-Acceptance Hardening (Opus, v1.0)

| Item | Detail |
|---|---|
| Module | FND-01 — new engine (route/lib/guard/migrations) added to the accepted platform foundation baseline |
| Artifact | `services/fnd/src/{config,server}.ts`, `services/fnd/src/lib/rate-limit.ts`, `services/fnd/src/plugins/rate-limit-identity.ts`, `services/fnd/src/routes/system.ts`, `infra/migrations/068_fnd_rate_limit_engine.cjs`, `infra/migrations/069_fnd_rate_limit_policy_seed.cjs`, `infra/migrations/070_fnd_rate_limit_policy_privilege_hardening.cjs`, `infra/grants/fnd_runtime_grants.sql`, `platform/.env.example` |
| Trigger | WLT-01 BLOCKER-2 — the platform's `/foundation/rate-limit/check` was an allow-by-default stub; WLT-01's Client-Facing Public `/wlt1/*` Surface architecture (FROZEN PENDING PREREQUISITES) could not proceed until a real shared rate-limit engine existed and was independently accepted |
| Governance | `DECISION_LOG.md` DEC-009 — Shared Rate-Limit Engine architecture + approved v1 numeric policy (unchanged by this record; the hardening below did not alter architecture or numeric policy) |
| Implementation commit | `2cdeaa5` — `feat(fnd): implement shared rate limit engine` |
| Hardening commit | `eb4a767` — `fix(fnd): harden rate limit deployment controls` |
| Reviewer | Independent Opus acceptance review (three separate turns: original implementation acceptance, post-acceptance narrow hardening verification, this consolidated governance record) |
| Verification | Re-ran `tsc -b` (clean) at both commits; full platform canonical suite independently reproduced fully green at both commits (182/4789 at `2cdeaa5`, 183/4796 at `eb4a767`) on freshly migrated disposable Postgres instances, `--no-file-parallelism`; true multi-process concurrency reproduction (5 separate OS processes); both deployment-order sequences independently reproduced with a genuine restricted LOGIN role executing real INSERT/UPDATE/DELETE statements; a counterfactual reproduction on the pre-070 migration set to prove the closed vulnerability was real |

---

## 1. Verdict

**SHARED RATE-LIMIT ENGINE: COMPLETE / ACCEPTED** (at `2cdeaa5`). **POST-ACCEPTANCE HARDENING: COMPLETE / VERIFIED** (at `eb4a767`).

Module identity for the dedicated consumer guard is derived purely from which configured secret matched a presented token — never asserted by the request body. The engine's dual fixed-window (burst + sustained) counter is a single atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` per check, proven race-free under true multi-process concurrency. `foundation.rate_limit_policy` is governance-owned and runtime-immutable under `role_fnd_runtime`, and — after this hardening — that immutability is now proven **deployment-order-independent**, not dependent on an undocumented "remember to re-run grants after migrations" operational requirement. Two config-validation gaps (ambiguous module identity from a shared secret value; a missing required environment-template entry) are closed. FND-01's own long-carried O2 observation (non-constant-time internal-identity comparison) is closed. FND-FIND-001 (HIGH, pre-authentication abuse) is explicitly **NOT** solved by any of this work and **remains OPEN**.

**WLT-01 BLOCKER-1: SATISFIED** (IAM-01 Internal Session Introspection, unchanged by this record).
**WLT-01 BLOCKER-2: SATISFIED.**
**WLT-01 PUBLIC-SURFACE PREREQUISITES: COMPLETE.** WLT-01 public-surface **implementation** may now proceed; it remains **NOT YET STARTED**. This does **NOT** mean internet exposure is approved.
**FND-FIND-001: REMAINS OPEN (HIGH)** — internet exposure of any WLT-01 public route remains **PROHIBITED** until a separately accepted public-perimeter / pre-authentication-abuse control closes it.

---

## 2. Part A — Original independent engine acceptance (`2cdeaa5`)

### 2.1 Scope / diff

8 files created, 7 modified, 15 total; 2134 insertions (776 production / 1358 test), 19 deletions. No WLT, IAM, IAM-02, CLT, docs, or dependency changes. Migrations only `068`/`069`. Only `fnd_runtime_grants.sql` modified among the 9 grant files.

### 2.2 Route contract

`POST /foundation/rate-limit/check` — path preserved exactly, no `/internal` alias. FND: 11 routes total, 4 guarded (was 3). Request body exactly `bucket` / `subject_type` / `subject_id` (no `module`, `cost`, `scope_hash`, `policy`, `limit`, `window`); `additionalProperties: false` independently confirmed to genuinely reject unknown fields (not merely declared). Positive response is exactly `{decision, limit_ref, retry_after_seconds}`; `decision` is only ever `"allow"` on HTTP 200.

### 2.3 Consumer identity

`FND_RATE_LIMIT_CONSUMER_SECRETS` — a per-consumer-module capability secret map, distinct from `INTERNAL_SERVICE_TOKEN`. `makeRateLimitConsumerGuard` derives module identity from which configured secret matched; the request schema has no `module` field. Independently probed bidirectionally: the rate-limit consumer token cannot open a general FND internal route, and the general internal token cannot open the rate-limit route; absent/wrong tokens both 401.

**Duplicate-secret-value gap identified** (see NEW-2 below): at this commit, two different module ids configured with the same secret value booted successfully — the guard resolved whichever module was iterated first (`Object.entries` order), silently enforcing the second module's traffic under the first module's namespace/policy. Classified MEDIUM at this stage (fixed under Part B).

**Duplicate raw-JSON-key detection**: the pre-parse text scan correctly rejects an ordinary duplicated key. An escaped-key variant (e.g. `WLT-01` vs `WLT-01`) bypasses the scan but `JSON.parse` itself collapses both to one entry, so no ambiguous module identity survives — the discarded credential simply becomes unusable (fails closed with 401). Classified LOW, tracked as NEW-4, deliberately not fixed (see §4).

### 2.4 Constant-time comparison

Both `services/fnd/src/plugins/internal-identity.ts` and `rate-limit-identity.ts` use `crypto.timingSafeEqual` with correct length-guard-then-compare semantics, no early-equality shortcut, and unchanged route wiring. **This closes FND-01's own O2 observation** (`FND-01_Final_Review_Opus_v1.0.md` §3: "Internal-identity token compared with `!==`... acceptable as-is for the interim; when IAM-01 replaces this seam, use a constant-time compare"). O2 was never assigned a controlled `OPEN_FINDINGS.md` finding ID (it lived only in that review's own observations table) — its closure is recorded here rather than as a register status flip.

### 2.5 Migrations 068 / 069

`068_fnd_rate_limit_engine`: `foundation.rate_limit_counter` (composite PK `module,bucket,subject_hash`, module/bucket CHECK patterns, count CHECKs) and `foundation.rate_limit_policy` (`policy_id` UNIQUE, `UNIQUE(module,bucket)`, all four numeric CHECKs `>0`, `burst_window <= sustained_window`, `burst_limit <= sustained_limit`, status vocabulary, `version > 0`); zero seed rows; no RLS (justified — only `role_fnd_runtime` ever holds a grant); evidence-preserving DOWN (refuses while either table holds rows).

`069_fnd_rate_limit_policy_seed`: cites DEC-009; seeds exactly the four approved rows (`frl_wlt1_read_list` 100/60·1200/3600, `frl_wlt1_read_item` 200/60·2400/3600, `frl_wlt1_mutate_register` 10/60·60/3600, `frl_wlt1_mutate_poc` 10/60·60/3600, all v1/active) — independently cross-checked verbatim against `DECISION_LOG.md` DEC-009. No `AUTH_FAILURE` row, no per-IP row, no subject-scope column.

### 2.6 Policy immutability, atomic counter, transition detection

Live-probed against a real restricted LOGIN role: `SELECT` allowed, `INSERT`/`UPDATE`/`DELETE` all denied (`42501`) on `rate_limit_policy`; `rate_limit_counter` remains writable (INSERT/UPDATE, no DELETE — matching the blanket grant shape). The atomic upsert and the transition-only decision-log INSERT run inside the **same** `withTransaction` (real `BEGIN`/`COMMIT` on one pooled client) — proven destructively by forcing the log-write to fail (a CHECK-constraint trap) and confirming the counter increment rolled back with it, returning 503 rather than silently losing denial evidence.

Transition-detection math (`previous_count = new_count - 1`) was independently simulated across 2160 synthetic requests spanning 36 policy/cadence combinations: 0 lost-evidence cases, 0 decision mismatches, 4 "extra-evidence" cases only in mixed-window-rollover edges (tracked as NEW-5, non-blocking).

True concurrency: 5 separate OS processes × 12 concurrent requests against `burst_limit=10` produced exactly 10 allows, 50 denies, and exactly 1 transition-log row — reproduced 3×.

### 2.7 Full regression at `2cdeaa5`

A reported 66-test failure (`sec1-db.test.ts`) in the original implementation report was independently root-caused — **not** an FND-01 product regression — to the shared test database being bootstrapped with SEC-01 ingest tokens that did not match what migration 008 (`sec1.source_identity_binding`) was seeded with; the exact failure signature (66 failed / 37 passed / 36 skipped) was reproduced at will on the current commit purely by varying that environment bootstrap, and eliminated entirely on a correctly-bootstrapped fresh database.

**Independently reproduced: 182 test files / 4789 tests / 0 failures**, `--no-file-parallelism`, freshly migrated disposable Postgres (69 migrations, head `069_fnd_rate_limit_policy_seed`), all 9 grant files applied clean, `tsc -b` 0 errors.

### 2.8 Findings opened at this stage

| ID (this record) | Severity | Origin label | Summary | Disposition |
|---|---|---|---|---|
| FND-FIND-002 | MEDIUM → **CLOSED** (Part B) | NEW-1 | Grant-ordering / policy-immutability deployment-order dependency | See §3.2 |
| FND-FIND-003 | MEDIUM → **CLOSED** (Part B) | NEW-2 | Duplicate consumer-secret-value ambiguity | See §3.3 |
| FND-FIND-004 | MEDIUM → **CLOSED** (Part B) | NEW-3 | `FND_RATE_LIMIT_CONSUMER_SECRETS` missing from `.env.example` | See §3.4 |
| FND-FIND-005 | LOW / OPEN | NEW-4 | Escaped-JSON-key duplicate bypasses the pre-parse text scan | Retained — see §4 |
| FND-FIND-006 | LOW/INFORMATIONAL / OPEN | NEW-5 | Limited extra transition evidence on mixed-window rollover | Retained — see §4 |
| FND-FIND-007 | INFORMATIONAL / OPEN | NEW-6 | Test-quality: shared-pool multi-instance test; originally no restricted-role policy test | Retained, partially mitigated — see §4 |
| FND-FIND-008 | INFORMATIONAL / OPEN | NEW-7 | `policy_id` UNIQUE+NOT NULL not declared PK; `subject_hash varchar(128)` has no hex-format CHECK | Retained — see §4 |

FND-FIND-001 (HIGH, pre-authentication abuse) was reaffirmed unchanged, not solved by any of the above.

---

## 3. Part B — Post-acceptance hardening (`eb4a767`) and its independent narrow verification

### 3.1 Scope

4 modified (`platform/.env.example`, `infra/grants/fnd_runtime_grants.sql`, `services/fnd/src/config.ts`, `tests/unit/fnd-rate-limit.test.ts`), 2 created (`infra/migrations/070_fnd_rate_limit_policy_privilege_hardening.cjs`, `tests/integration/fnd-rate-limit-policy-privilege-ordering.test.ts`). No WLT, IAM, IAM-02, CLT, docs, or dependency changes. **`068`/`069` confirmed byte-unchanged** — identical git blob hashes before and after this commit.

### 3.2 FND-FIND-002 (NEW-1) — grant-ordering / policy-immutability — CLOSED

**Root cause reconfirmed**: policy immutability depended entirely on `fnd_runtime_grants.sql`'s own guarded `REVOKE` running *after* migration 068 creates the table. Under the opposite order — grants applied against a pre-068 database, migrations run later, grants never re-applied — Postgres's own `ALTER DEFAULT PRIVILEGES` automatically grants `role_fnd_runtime` write access to the newly created table, and the guard's `to_regclass` check had already no-opped when the table didn't exist yet.

**Structural remediation**: `070_fnd_rate_limit_policy_privilege_hardening.cjs` performs the identical guarded `REVOKE INSERT, UPDATE, DELETE`, but at MIGRATION TIME, guarded on `role_fnd_runtime` existing (`pg_roles`) rather than on the table existing. This makes the control fire in whichever ordering actually needs it, independent of grants-file re-application timing. `068`/`069` are untouched.

**Independent proof, both orderings, executed (not inferred) statements as a genuine restricted LOGIN role** (confirmed non-superuser, `rolbypassrls=false`):

- **Sequence A** (migrations 001→070, then all 9 grants): `SELECT` → 4 rows; `INSERT`/`UPDATE`/`DELETE` → `permission denied` (SQLSTATE `42501`); counter table remains writable.
- **Sequence B** (migrations 001→067, grants applied pre-068, migrations 068→070, grants **never** re-applied): identical result — `SELECT` succeeds, `INSERT`/`UPDATE`/`DELETE` all denied.

**Counterfactual proof the vulnerability was real**: replaying Sequence B against the parent commit's 69-migration set (no `070`) — the restricted role successfully `INSERT`ed a rogue policy row and successfully raised `frl_wlt1_read_list`'s `burst_limit` from 100 to 1200 (a 12× weakening of its own throttle). Migration 070 is demonstrated to be specifically what closes this.

**Test oracle quality**: `tests/integration/fnd-rate-limit-policy-privilege-ordering.test.ts` uses real disposable per-scenario databases, real restricted LOGIN roles with genuine `role_fnd_runtime` membership, asserts SQLSTATE `42501` specifically, cleans up (zero orphan databases/roles across 3 consecutive re-runs), and fails loud (exit 1) both on an unset `TEST_DATABASE_URL` and an unreachable database. Validated as a genuine (non-tautological) oracle by replaying its exact assertions against a no-070 database and confirming they independently catch the regression via two different assertions (an unexpectedly-successful INSERT, and a CHECK-constraint SQLSTATE mismatch on UPDATE rather than the expected `42501`).

**One new finding surfaced by this proof — FND-FIND-009 (NEW-8), LOW, OPEN, non-blocking** (not closed by this hardening; see §4).

**FND-FIND-002: CLOSED.**

### 3.3 FND-FIND-003 (NEW-2) — duplicate consumer-secret-value ambiguity — CLOSED

`parseRateLimitConsumerSecrets` now tracks `value → moduleId` across the validation loop (after every other per-entry check, so an already-invalid entry never pollutes the tracking map) and rejects a second module id presenting a previously-seen secret value with `CONFIGURATION_INVALID`, naming both colliding module ids but never the secret value itself.

Independently probed: `{"WLT-01":"A…","CLT-01":"A…"}` → rejected, no leak; `{"WLT-01":"A…","CLT-01":"B…"}` → boots normally; a three-module case with two colliding → names exactly the colliding pair. Every pre-existing check (duplicate raw key, module-id shape, blank, min-length, `INTERNAL_SERVICE_TOKEN` collision, JSON validity/shape) independently reprobed and confirmed unweakened, with correct ordering (invalid entries never trigger a misleading duplicate-value error) and no secret value leaked in any error path across every probe combination tried.

**Interaction with FND-FIND-005 (NEW-4, escaped-key) independently reconfirmed unchanged**: the new check is orthogonal (post-parse, across distinct surviving keys) to the pre-parse text-scan gap; `JSON.parse` still collapses an escaped-key duplicate to exactly one surviving entry, so no ambiguous module identity is ever possible from that path, and the discarded credential independently reconfirmed to fail closed (401).

**FND-FIND-003: CLOSED.**

### 3.4 FND-FIND-004 (NEW-3) — missing environment-template entry — CLOSED

`platform/.env.example` now documents `FND_RATE_LIMIT_CONSUMER_SECRETS` in the "Required (critical) — startup aborts if unset" section, with a safe placeholder (`CHANGE_ME_WLT01_RATE_LIMIT_SECRET_PLACEHOLDER` — no real credential), the required flat-JSON-object shape, and the uniqueness/length constraints. Independently confirmed the template's values load through the real config loader without modification, and that all 8 FND production environment variables are now present in the template (was 7/8).

**FND-FIND-004: CLOSED.**

### 3.5 Full regression at `eb4a767`

Independently rebuilt from an empty database each time to avoid state-contamination artifacts (a prior IAM one-time-bootstrap ordering issue was diagnosed as pure test-methodology contamination from repeated ad-hoc runs, not a product defect, and did not reproduce on a freshly bootstrapped database):

- FND suite: 5 files / **97/97**
- IAM: 7 files / **120/120**
- IAM-02: 5 files / **83/83**
- WLT: 76 files / **2210/2210**
- `tsc -b`: **0 errors**
- Clean migration from an empty database through all 70 migrations; all 9 grant files applied clean
- **Full canonical platform suite: 183 files / 4796 tests / 0 failures**, `--no-file-parallelism` — reconciles exactly to the pre-hardening 182/4789 baseline (+1 file / +7 tests: 4 new duplicate-value config unit tests, 3 new deployment-order integration tests)
- Engine driven end-to-end **under the newly-hardened restricted role** (a check the committed test suite does not itself exercise, since it connects as superuser): 10 allows / 2 denies against a `burst_limit=10` DEC-009 bucket, counter correctly incremented to 12, exactly 1 transition-log row — confirming the hardening changed no load-bearing engine behaviour.

---

## 4. Findings register (final state at `eb4a767`)

| Finding ID | Severity | Status | Summary |
|---|---|---|---|
| FND-FIND-001 | HIGH | **OPEN** | Pre-authentication abuse — unauthenticated garbage bearer-token requests reach IAM-01 introspection before any identity-based WLT rate-limit check can apply. Not solved by the engine, its numeric policy, or this hardening. Mandatory precondition before any WLT-01 public route is internet-exposed. |
| FND-FIND-002 (NEW-1) | MEDIUM | **CLOSED** at `eb4a767` | Grant-ordering / policy-immutability deployment-order dependency. Migration 070 + independent dual-ordering proof with a real restricted role. |
| FND-FIND-003 (NEW-2) | MEDIUM | **CLOSED** at `eb4a767` | Duplicate consumer-secret-value ambiguity. Unique-value invariant now enforced at boot; no secret leakage. |
| FND-FIND-004 (NEW-3) | MEDIUM | **CLOSED** at `eb4a767` | `FND_RATE_LIMIT_CONSUMER_SECRETS` missing from `.env.example`. Template now complete and verified loadable. |
| FND-FIND-005 (NEW-4) | LOW | **OPEN** (non-blocking) | Escaped-JSON-key duplicate bypasses the pre-parse duplicate-key text scan. `JSON.parse` still collapses to one entry — no ambiguous module identity results; the discarded credential fails closed. Not eliminated; deliberately not fixed in this turn. |
| FND-FIND-006 (NEW-5) | LOW/INFORMATIONAL | **OPEN** (non-blocking) | Mixed-window-rollover can produce limited extra transition-log evidence (never lost evidence) — independently simulated at 4/2160 synthetic cases. |
| FND-FIND-007 (NEW-6) | INFORMATIONAL | **OPEN** | Test-quality: the committed multi-instance concurrency test shares one module-level connection pool; the original suite lacked a restricted-role policy-immutability test — the latter is now materially mitigated by the new deployment-order integration test (`fnd-rate-limit-policy-privilege-ordering.test.ts`), though the historical observation is preserved, not erased. |
| FND-FIND-008 (NEW-7) | INFORMATIONAL | **OPEN** | `rate_limit_policy.policy_id` is UNIQUE+NOT NULL but not declared PRIMARY KEY; `subject_hash varchar(128)` has no DB-level hex-format CHECK. No current attacker-controlled write path to either. |
| FND-FIND-009 (NEW-8) | LOW | **OPEN** (non-blocking, new at `eb4a767`) | Migration `070`'s DOWN issues an explicit `GRANT INSERT, UPDATE` back to `role_fnd_runtime`, which can widen policy privileges on a deliberate `migrate down` past 070, even against a correctly-restricted database. Forward deployment path is unaffected; state is no worse than the pre-070 accepted baseline; fully recoverable by re-`up`-ing 070 or re-applying the canonical grants file (both independently confirmed to restore the restriction). Does not reopen FND-FIND-002 — that finding concerns normal forward deployment-order independence, which remains proven. Recommended future action: change 070's DOWN to a no-op or an evidence-preserving refusal, matching the repository's own established DOWN-migration convention (17 existing precedents; `068`/`069` both refuse). Not fixed in this governance turn — migration `070` was left unmodified per instruction. |

O2 (FND-01's own pre-existing observation — non-constant-time internal-identity comparison, `FND-01_Final_Review_Opus_v1.0.md` §3) is recorded here as **CLOSED**: both `internal-identity.ts` and `rate-limit-identity.ts` now use `crypto.timingSafeEqual`. O2 was never assigned a controlled `OPEN_FINDINGS.md` finding ID, so no register-row flip was required — its closure is recorded in this document only.

---

## 5. WLT-01 downstream readiness

Independently confirmed the accepted seam is sufficient for a future WLT-01 consumer to: resolve an authenticated/membership-resolved request → derive the approved subject per DEC-009's binding table (`READ_LIST`/`READ_ITEM`/`MUTATE_REGISTER` → `client_id`; `MUTATE_POC` → `iam_user_id`) → call this engine with a WLT-01-configured consumer secret → proceed only on an explicit `allow`. No `AUTH_FAILURE` bucket, no per-IP bucket — both deliberately absent, consistent with FND-FIND-001 remaining the correct, separate control for pre-authentication abuse. These subject bindings are correctly absent from FND-01's own code (WLT-01's responsibility, not built here).

## 6. Documentation impact

This record, plus updates to `OPEN_FINDINGS.md` (register FND-FIND-002 through FND-FIND-009, reconcile `WLT-FIND-004`), `00_project_state/MODULE_STATUS.md` and `00_project_state/PROJECT_HANDOVER.md` (record both commits, migration head `070`, canonical baseline 183/4796, WLT-01 public-surface prerequisites COMPLETE / implementation NOT YET STARTED), `02_modules/FND-01/README.md`, and `DOCUMENT_REGISTER.md` (register this document as `FND-01-ACC-003`). `DECISION_LOG.md` DEC-009 remains authoritative and unchanged — neither the implementation nor the hardening altered the architecture or the numeric policy it approved.

## 7. Final statement

**SHARED RATE-LIMIT ENGINE: COMPLETE / ACCEPTED.**
**POST-ACCEPTANCE HARDENING: COMPLETE / VERIFIED.**
**WLT-01 BLOCKER-1: SATISFIED. WLT-01 BLOCKER-2: SATISFIED. WLT-01 PUBLIC-SURFACE PREREQUISITES: COMPLETE** (implementation itself remains not yet started).
**FND-FIND-001: REMAINS OPEN (HIGH)** — internet exposure of any WLT-01 public route is **PROHIBITED** until this separate public-perimeter / pre-authentication-abuse control is independently resolved.
