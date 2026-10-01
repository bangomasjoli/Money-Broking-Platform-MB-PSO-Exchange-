# 04 Review (round 9) — ACC-01: Account Structure blueprint pack v0.9

- **Task ID:** ACC-01 (planning task — blueprint pack, no implementation)
- **Reviewer:** independent architecture / compliance reviewer / claude-opus-5-5 / HIGH
- **Pack under review:** `docs/02_modules/ACC-01/blueprint/v0.9/` at `e506e69`. This is the remediation of `04-review-r8.md` (R8-F01 MEDIUM, R8-F02 LOW, R8-F03 LOW, R8-F04 INFO), after the procedural checkpoint `c91a800`.
- **Author of v0.9:** blueprint planner / claude-sonnet-5-5 (per the `e506e69` commit trailer).
- **Independence:** **separate context.**
  - This review ran in a **new Claude Code session**. It carried no conversation from any authoring, remediation, checkpoint or earlier review session.
  - Everything below was re-derived from:
    - the v0.9 text;
    - `04-review-r8.md` (for the finding definitions only), `06-human-decision-r8.md` and `task.json`;
    - `docs/OPEN_FINDINGS.md`, the platform migrations and the IAM-02 routes;
    - the actual local `aix-conductor`;
    - a disposable PostgreSQL 17.10 scratch cluster (§19).
  - `05-remediation-r8.md` was **not** read or used as evidence of correctness.
  - The reviewer is the same model as the round-1…8 reviewers. It is a different model from the author.
- **Decision:** **REMEDIATE**
- **Implementation authorised:** **No.**
  - Nothing is accepted.
  - No `06-acceptance.md` exists or is created.
  - This review does not modify `task.json`.
  - `PLAN_READY` is not set.

## 1. Baseline verification (all passed)

| Check | Result |
|---|---|
| Worktree | `/Users/AimanRahimi/AIX-worktrees/acc-01`. On the case-insensitive volume this is the same worktree as `/Users/AimanRahimi/aix-worktrees/acc-01` |
| Branch / HEAD | `module/ACC-01` / `e506e69` (= `origin/module/ACC-01`) |
| Working tree | Clean before this review |
| `main` / `origin/main` | Both `43f2f34`. Nothing is merged |
| History | `43f2f34` → `42316fe` … `3be2698` → `c91a800` → `e506e69`, exactly the 23-commit chain expected |
| Diff `43f2f34..HEAD` | 187 files. Each is under `docs/02_modules/ACC-01/**` (163 paths, including `README.md`) or `docs/03_implementation/tasks/ACC-01/**` (24). There is no `platform/**`, migration, master or register change |
| `e506e69` | Adds `blueprint/v0.9/*` (18 files) and `05-remediation-r8.md`. Modifies `task.json` and the module `README.md`. Nothing else |
| Earlier packs | `git log` for each of `blueprint/v0.1` … `v0.8` returns **only** its own authoring commit (`42316fe`, `8ff4e9d`, `194aff0`, `a865d63`, `826ab45`, `aa66084`, `0d7cfb0`, `e30cf8d`). All remain unchanged historical evidence |
| Test ids | T-001…T-400: 400 rows, contiguous, no duplicates |

## 2. Sources reviewed

**Decisions.** These are treated as approved and binding, and are **not reinterpreted**:

- ACC-R2-HD-01…08
- ACC-R3-HD-01…03
- ACC-R4-HD-01…02
- ACC-R5-HD-01

`06-human-decision-r8.md` is procedural only. It records "approve ACC R8 procedural continuation" and adds no design decision.

**v0.9 files:**

- 05 — read in full.
- 02 — §2 A4, §5, §7.1, §7.4, §7.6, §7.7.
- 10 — §23 (T-357…T-400) in full, plus T-092, T-240, T-242, T-320.
- 01 — ACC-REQ-059 and ACC-REQ-060.
- 03 — abort sequence.
- 04 — profile, initiate and complete rows.
- 06 — §1, §3 and §6.
- 09 — `ACC1_CLOSURE_RECOVERY_INTEGRITY`.
- 11 — implementation prompt, R8 items.
- 12 — rows 52–55.
- 17 — §4 notes.
- The README.
- Whole-pack sweeps for the R8 terms (§17).

**Source inspected read-only:**

| Area | Fact verified |
|---|---|
| IAM-02 `platform/services/iam2/src/routes` | `approvals.ts`, `bootstrap.ts`, `internal.ts`, `roles.ts`: 7 `app.post` routes and **0** `GET` routes. DCR-ACC-IAM-08 remains unmet |
| `docs/OPEN_FINDINGS.md` (unchanged from `main`) | `IAM2-FIND-002` (HIGH) **OPEN**; `FND-FIND-001` (HIGH) **OPEN** |
| Platform migrations | Runtime roles are grantees. Every platform `SECURITY DEFINER` function uses **`SET search_path = <schema>, pg_temp`** with `pg_temp` explicitly **last**, and schema-qualified relations (`003_iam_rls_token_lookup.cjs` L17–19, L59, L77, L88; `007_iam2_seed_sod_rules.cjs` L58). The 003 header states the purpose: "prevents search-path hijacking". This is relevant to **R9-F01** |
| PostgreSQL baseline | Local runtime **PostgreSQL 17.10** (`miniforge3/envs/aixpg`) |

## 3. Conductor adjudication

This was verified by reading `src/state.ts` and `config/local.config.json` in `aix-conductor` (HEAD `00a7bde`, working tree clean, not modified). `dist/records.js` `validateTaskManifest` was executed in memory against the HEAD `task.json`. No conductor state was written.

| Item | Result |
|---|---|
| `task.json` at HEAD | `state = PLANNING`; `roundCounts.planning = 9`; `escalation = 0`; other counters 0; `acceptanceStatus = NOT_ACCEPTED`. `validateTaskManifest` → `{"ok":true,"errors":[]}` |
| `PLAN_READY` | Not set. There is no `06-acceptance.md` |
| `maxPlanningRounds` | **3** (`config/local.config.json` L82, unchanged) |
| Legality of `planning = 9` | **This is a legal human-authorised over-limit entry. It is not rejected for exceeding 3.** Path: `PLANNING(8)` → `HUMAN_DECISION_REQUIRED` at `c91a800`. That step is ungated: `TRANSITIONS.PLANNING` includes `HDR`, and `HUMAN_DECISION_REQUIRED` is not a `ROUND_ON_ENTER` key, so planning stays 8. Then `resolve_human_decision` (`approvedBy` AimanRahimi) → `PLANNING(9)` at `e506e69`. `transitionTask` L122 sets `humanAuthorised = (task.state === 'HUMAN_DECISION_REQUIRED')` and skips the over-limit redirect (L123), keeping the real count |
| Transitions | `PLANNING` → [`PLAN_READY`, `HUMAN_DECISION_REQUIRED`, `FAILED`] (L49). `PLANNING → PLANNING` is illegal. `HUMAN_DECISION_REQUIRED → PLANNING` is gated by `resolve_human_decision` (L63) |
| `06-human-decision-r8.md` | Consistent with the above. It records the approval verbatim, preserves every prior decision, resets no counter and does not increment `escalation` |
| Findings transcription | `openFindingIds` = RF-01, RF-02, RF-05, RF-09, R8-F01, R8-F02, R8-F03. Counts HIGH 1, MEDIUM 3, LOW 3. This equals `04-review-r8.md` §21 (R8-F04 is INFO and not counted) |
| Runtime record | `state/tasks/` holds only `IMP02-MA-HARDEN-001.json` and `PV-20260919T162254Z-001.json`. There is no ACC-01 record (ACC-R4-HD-02) |

## 4. Verdict

**REMEDIATE.**

v0.9 corrects R8-F01…R8-F04 **as they were scoped**, and the corrections are structurally sound:

- **Two layers own the protected counters and pointers.** No runtime column privilege on any protected column, plus an immediate `BEFORE INSERT OR UPDATE` guard with no `OF` list and no `WHEN`.
- **One version owner** with an explicit transition matrix.
- **The seal pin is legal only inside its own seal**, stamped from an exact stored seal payload and backed by a deferred orphan proof.
- **Maker-only initiation follows the request state machine:** `INSERT requested` → `UPDATE applied`, with the `CHECK`s scoped to `applied`.
- **The R8-F04 precision items are stated.**

Each mechanism was checked against PostgreSQL 17.10 semantics (§19).

**The pack is still not acceptable**, for one new MEDIUM finding (R9-F01), one LOW finding (R9-F02) and INFO precision (R9-F03).

- **R9-F01 (MEDIUM).** The `SECURITY DEFINER` restriction touch that v0.9 introduces is specified with `search_path = pg_catalog, acc1`. That form omits `pg_temp`, which PostgreSQL then searches **first** for relation names. No other trigger function's `search_path` or schema qualification is specified, and `role_acc1_runtime` holds the database `TEMPORARY` privilege by default.
  - Reproduced on 17.10: the runtime role creates and grants a temp table named `subaccount`. A restriction it then inserts **commits with no account `version` bump**, so the stale-approval refusal that R8-F01 established is bypassed by another route.
  - In the same way, a temp `closure_recovery` table **satisfies the guard's abort branch with a forged row**.
  - With `pg_temp` listed last, both attacks are refused.
  - The platform's own `SECURITY DEFINER` precedent already uses `pg_temp` last.
  - This is the same threat model, class and severity as R6-F01, R7-F01 and R8-F01.
- **R9-F02 (LOW).** Maker-only initiation has no request-level completeness proof, unlike the abort (E3) and seal (pin proof) paths. A savepoint-swallowed closing `UPDATE` can commit an applied initiation, and for a master an `open` `closure_family` with its member snapshot, with no account in `closing`. The record is inert but dangling.

**No new human design decision is needed.** Every correction sits within ACC-R3-HD-01/-02, ACC-R4-HD-01 and ACC-R5-HD-01 as written.

## 5. R8-F01…R8-F04 disposition

| Finding | Sev | Disposition | Basis (v0.9 text and §19 probes) |
|---|---|---|---|
| **R8-F01** Protected counters / pointers writable outside their owning transitions | MEDIUM | **CLOSED IN BLUEPRINT** (counter/pointer ownership is coherent). The restriction-touch **name-resolution hardening** is a separate root cause that also affects every pre-existing trigger → **R9-F01** | 05 §1 rules 8–9; §2.2.1 (one protected set, column classes I/B/S/P/M); §5.4 rules 0, A–H and the transition matrix; §6 grants (`UPDATE (display_name, description, status)` / `(name, description, status)` only). Probes Q1–Q3, O1–O2. Detail in §8–§12 below |
| **R8-F02** Unguarded pin insert; self-proving pin facts | LOW | **CLOSED IN BLUEPRINT** | 05 §2.4.3 (exact stored seal payload); §2.9.1 (one class per pin column; six-column `INSERT` privilege); §5.5 `trg_acc1_seal_pin_bind` steps 1–9 and `trg_acc1_seal_pin_complete`; `UNIQUE (seal_change_request_id)`. Probes D-A…D-F. Detail in §13–§16 below. Precision residual (`required_attesters` exactly-once wording): R9-F03.4 |
| **R8-F03** Maker-only initiation vs. request `INSERT` rule | LOW | **CLOSED IN BLUEPRINT** | 05 §2.4 (applied-scoped `CHECK`); §2.4.2 (lifecycle); §5.6 (normative order); 02 §7.1 item 3 rewritten; T-386…T-393. Detail in §17 below. The atomicity residual under a swallowed savepoint is **R9-F02**, a new finding: initiation never had a completeness proof, so this is not a defect of the R8-F03 correction |
| **R8-F04** Precision (timing, `xid8`, non-ownership, terminal apply-owned fields, `id` / `updated_at_utc`) | INFO | **CLOSED IN BLUEPRINT** | .1: 05 §5.3 "correct whenever it fires", rule 5y. .2: §5.0 "correlation only", rule 5w. .3: §1 rule 8, rule 5v, T-396. .4: §2.4.2 pre-allocation, rule 5x, T-397. .5/.6: `id` in the immutable trigger; `updated_at_utc` DB-maintained, T-398. The non-ownership list omits `TEMPORARY` / `search_path` (R9-F01). The cancel-time deferred recheck is not in the timing inventory (R9-F03.3) |

## 6. Regression check

| Item | Result |
|---|---|
| **ACC-R2-HD-01…08** | **Hold.** No v0.9 change touches dependency-evidence, configuration, peer-credential or environment rules. The 0 environment-branching rule stands |
| **ACC-R3-HD-01** (family semantics) | **Holds.** These are unchanged in effect: `trg_acc1_master_default_invariant`, the default-in-closure `CHECK`, `trg_acc1_default_protected` (now explicitly status-change-only, which is correct), `trg_acc1_closure_family`, `trg_acc1_family_membership`, and child-before-master sealing (05 §5.2, last paragraph). Rule E (iii) binds a member's closing entry to its `closure_family_member` row under the master's initiation |
| Every non-`closed` master has exactly one non-`closed` default; no ACTIVE master + CLOSED default | **Holds** (deferred invariant; `UNIQUE … WHERE is_default` not status-filtered) |
| Default cannot independently close or reopen | **Holds** (`trg_acc1_default_protected`; abort S2 requires the master in every master-family set) |
| Master-family abort atomic; `independent_preserved` never returned | **Holds** (§20) |
| **ACC-R3-HD-02** (maker-only initiation) | **Holds.** Initiation has no checker: the `CHECK` forces `approval_id`, `approver_user_id` and `approval_policy_id` NULL. `maker_only` is tied to `close_*` by `CHECK`, so it cannot masquerade as `seal_closure`. The seal stays maker-checker (T-393) |
| **ACC-R3-HD-03** (authoritative dependency evidence) | **Holds.** `checker_rejected_seal` is still hard-unavailable (`DEP-IAM-SEAL-REJECTION-EVIDENCE`), and bind (7) claims shape only |
| **ACC-R4-HD-01/-02** | **Hold** (reason codes and `CHECK`s unchanged; ACC-01 not registered in the conductor runtime store) |
| **ACC-R5-HD-01** (target-scoped family recovery) | **Holds.** The target-scoped `CHECK` on the stamped `abort_target_from_status` is unchanged, and S5 restates it. Returned members may be `closure_sealed` while the master is `closing` |
| `closure_cycle` semantics | **Unchanged since R2** (v0.4 and v0.8 L43: "incremented on every entry into `closing` **and** on every governed abort"). See §12 |
| `close_change_request_id` on abort | v0.8 left it unspecified; v0.9 **retains** it (rule E). Every consumer reads it only with the closure statuses, and rule E (iv) refuses reuse of an old initiation. This is a clarification, not a semantic change |

## 7. New findings

Severity uses HIGH / MEDIUM / LOW / INFO. "Blocking" means blocking **acceptance of the pack**.

### ACC-01-R9-F01 — MEDIUM (blocking) — Trigger-function name resolution is not hardened: the specified `SECURITY DEFINER` `search_path` omits `pg_temp`, so the runtime role can shadow `acc1` tables with temp tables and defeat the restriction version bump and the guard's evidence reads

**Threat model.** This is the one the pack adopts: raw `role_acc1_runtime` writes with application validation bypassed (10 §22/§23 preambles). It is also the "regardless of grants" premise that 05 §1 rule 8 sets out to make true.

**Evidence:**

- **The specified value.** 05 §5 (`trg_acc1_restriction_version`) and §6 "Functions" specify the `SECURITY DEFINER` function with `search_path = pg_catalog, acc1`. The touch is written as `UPDATE <target> SET updated_at_utc = clock_timestamp()`, with no schema qualification required.
  - PostgreSQL searches the session temp schema **first** for relations when `pg_temp` is not listed explicitly.
  - The documented secure form for `SECURITY DEFINER` lists `pg_temp` **last**.
- **Other trigger functions.** `trg_acc1_counter_guard` has a "fixed `search_path`" with no value stated. No other `trg_acc1_*` function has a `search_path` or a schema-qualification rule. The invoker-rights triggers read `account_change_request`, `closure_recovery`, `closure_family(_member)`, `closure_seal_pin(_readiness)` and `account_status_history`.
- **The runtime role can create temp tables.** 05 §1 rule 8 enumerates what the runtime role lacks: `TRIGGER`, `REFERENCES`, `TRUNCATE`, `CREATE` on `acc1`, `SUPERUSER`/`BYPASSRLS` and `SET session_replication_role`. It omits **`TEMPORARY`**, which `PUBLIC` holds on every database by default. Verified: `has_database_privilege('role_acc1_runtime', …, 'TEMPORARY') = t`.
- **Platform precedent already does this correctly.** The platform's `SECURITY DEFINER` functions use `SET search_path = iam, pg_temp` / `iam2, pg_temp` and schema-qualified relations (migrations 003, 007).
- **Reproduced on PostgreSQL 17.10** (§19, S1–S3). The guard and the touch were modelled exactly as 05 §5.4/§6 specify. In a fresh session, `role_acc1_runtime` ran `CREATE TEMP TABLE subaccount(...)`, `GRANT ALL ON pg_temp.subaccount TO PUBLIC`, and the same for `closure_recovery` with one forged row. Then:
  - **(a)** `INSERT INTO acc1.account_restriction …` **committed**. The owner-context touch updated `pg_temp.subaccount`, and the real `acc1.subaccount.version` stayed **4 → 4**.
  - **(b)** A status `UPDATE` gated by the guard's "exactly one `closure_recovery` row for THIS target" check **passed** on the forged temp row, with **0** real recovery rows.
  - With `search_path = pg_catalog, acc1, pg_temp`, the same session sequence gave version **6 → 7** (bumped; shadow ignored), and the forged row was **refused** (`ACC1_CLOSURE_RECOVERY_INTEGRITY`).
  - Without the `GRANT` on the temp table, (a) failed closed with "permission denied". The runtime owns its temp table, so it can always grant access.

**Consequences, as specified:**

1. **A restriction becomes invisible to `version` (RF-08, ACC-REQ-041).**
   - The live row keeps `approved_version`, so a closure approval made before the restriction passes `trg_acc1_recovery_bind` (6), `trg_acc1_seal_pin_bind` step 9 and A4's version comparison.
   - This is the outcome of R8-F01 attack 1, reached without writing `version`.
   - Consumers' stored `version` evidence also misses the restriction.
2. **Every invoker-rights trigger that reads an unqualified evidence table can be fed forged rows.** Examples:
   - the guard's abort branch and rule E (applied request, `closure_family`, `closure_family_member`);
   - `trg_acc1_status_transition` (b);
   - `trg_acc1_recovery_bind`, which reads the "stored payload";
   - `trg_acc1_seal_pin_bind` / `trg_acc1_seal`;
   - the deferred proofs.

   An unqualified `INSERT` in `trg_acc1_status_history` would write history into a temp table.
3. Every "the database refuses" claim in the pack carries this unstated precondition. **The two-layer argument of §1 rule 9 is sound only if trigger name resolution is pinned.**

**Why MEDIUM:**

- This is the same class, standard and threat model as R6-F01, R7-F01 and R8-F01: database guarantees that the pack states and tests are not provided by the specified objects. It is reproduced on the baseline PostgreSQL with a default privilege.
- The direct safety impact is bounded, as before:
  - A4 re-checks under lock in the application.
  - A compromised runtime role could forge a fresh request anyway (RF-01).
- **Root cause.** The gap is latent in every version, because no trigger function in v0.1–v0.8 pinned resolution. v0.9 is the first version to pin a value, and the value it pins leaves `pg_temp` first.
- The fix is mechanical.

**Affected sections:**

- 05: §1 rule 8 (privilege list), §1 rule 9, §5 `trg_acc1_restriction_version`, §5.4 "Definition" (the guard's `search_path`), §6 "Functions", §8 (migration requirements)
- 10: T-369, T-396 (neither covers temp shadowing)
- 11: implementation prompt, function-hardening line

**Required correction:**

1. **Normative rule for every `acc1` trigger and `SECURITY DEFINER` function**, with no exception:
   - `SET search_path = pg_catalog, acc1, pg_temp`, with `pg_temp` explicitly **last**;
   - **and** schema-qualify every relation the function reads or writes (`acc1.subaccount`, `acc1.closure_recovery`, …), as the platform precedent does.

   Both, not either: qualification protects against a later edit that drops the `SET`.
2. Add to §1 rule 8 that `role_acc1_runtime` holds no `TEMPORARY` privilege on the database, **or** state explicitly why the rule above makes temp objects inert. Revoking `TEMPORARY` from `PUBLIC` is a platform-wide choice that ACC-01 need not make.
3. Add raw-DB tests and extend T-396's catalogue checks (every `trg_acc1_*` function has `proconfig` containing a `search_path` ending in `pg_temp`):
   - In a **fresh session**, the runtime role creates and grants temp shadow tables for every relation any `acc1` trigger touches, **before** the first trigger execution, because PL/pgSQL plan caching can mask the attack in a warm session (§19 note).
   - It then performs a restriction insert (real `version` bumps), a closure abort with a forged temp recovery row (refused), a seal with a forged temp request or pin (refused), and a closing entry with a forged temp request or family (refused).

**Implementation impact:** phase 1 (a function attribute and qualified names in the migration; catalogue tests). No API, state-machine or design change.

**Human decision required: NO.**

### ACC-01-R9-F02 — LOW (blocking with R9-F01) — Maker-only initiation has no request-level completeness proof: a swallowed closing `UPDATE` can commit an applied initiation, and a master's `open` family, with no account in `closing`

**Evidence:**

- **Abort has a completeness proof:** `trg_acc1_abort_apply_complete` (E3): "an applied abort that returned nothing, or returned only part, cannot commit".
- **Seal has a pin-level proof:** `trg_acc1_seal_pin_complete`.
- **Initiation (05 §5.6) has neither.** Its deferred set is only `trg_acc1_closure_family`, `trg_acc1_master_default_invariant` and `trg_acc1_family_membership`. None of them requires an `open` `closure_family` to have its master in `closing`/`closure_sealed` under it. `trg_acc1_closure_family` only ties `completed` to a `closed` master.
- **v0.9 treats savepoint-swallowing helpers as legitimate** (05 §5.0, §5.5, T-378/T-379). A helper that rolls back to a savepoint around step 6 (the closing `UPDATE`s) and commits leaves behind:
  - an `applied` `maker_only` request;
  - and, for a master initiation, an `open` `closure_family` and its immutable member snapshot (step 5);

  with no account in `closing`.
- **The result is inert but dangling:**
  - It cannot ground any later action: the request is terminal, `applied_xact_id` ≠ current, and rule E (iv) applies.
  - No one-open-family uniqueness exists, so it does not block a new initiation.
  - The `open` family can never complete, and can never be aborted (bind (6) and the family-abort guard need the live family).
  - 02 §2 A5's "any failure … rolls back" posture is not database-enforced for this path.
  - An idempotent replay of the same key would find an `applied` request whose effect never happened.

**Affected sections:** 05 §5.6, §5 (`trg_acc1_closure_family` or a new E3-analogue), §2.10; 02 §7.1 item 3; 10 §23.3.

**Required correction (either):**

- **(a)** Add a deferred constraint trigger on `account_change_request` `requested → applied` for `close_*`. At proof time it requires every initiated target to be in `closing` (or later) with `close_change_request_id` = this request, with a same-transaction `closure_initiation` history row for `cause_ref` = this request, and for a master that `closure_family` = this request is `open` with exactly its master-directed members entered.
- **(b)** Extend `trg_acc1_closure_family` so that an `open` family requires its master in `closing`/`closure_sealed` with `closure_family_id` = that family, and state explicitly that an inert applied initiation is tolerated (as T-379 tolerates an applied seal request without a pin).

In both cases, add a savepoint test (initiation request applied, closing `UPDATE` rolled back to a savepoint, `COMMIT` → refused, or the stated tolerated outcome with no `open` orphan family).

**Implementation impact:** phase 1 (one deferred trigger or one rule). No API change.

**Human decision required: NO** (ACC-R3-HD-02 is unchanged).

### ACC-01-R9-F03 — INFO — Precision

1. **`trg_acc1_status_history` `WHEN` clause is not valid DDL.**
   - 05 §5 specifies `AFTER INSERT OR UPDATE OF status … WHEN (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)`.
   - On PostgreSQL 17.10 this fails with `column "tg_op" does not exist`. Without `TG_OP` it fails with "INSERT trigger's WHEN condition cannot reference OLD values" (§19, O3/O3b).
   - Split it into an `AFTER INSERT` trigger and an `AFTER UPDATE OF status … WHEN (OLD.status IS DISTINCT FROM NEW.status)` trigger, or test inside the function. This fails loud at migration time; it is not a safety gap.
2. **Restriction touch on a no-op.** `trg_acc1_restriction_version` (`AFTER INSERT OR UPDATE OF status`) fires for `UPDATE account_restriction SET status = status` and bumps `version` synthetically.
   - This is upward-only, which means fail-closed staleness, but it is inconsistent with 05 §5.4's no-synthetic-bump principle. Use separate `INSERT` and `UPDATE … WHEN (OLD.status IS DISTINCT FROM NEW.status)` triggers.
   - Also state that rule A cannot distinguish the legitimate touch from **any** owner-context `UPDATE` that changes only `updated_at_utc`. That is harmless, because it is upward-only and the owner is trusted / break-glass.
3. **The R3-F07.2 deferred cancel-time recheck is outside the timing inventory.**
   - `trg_acc1_restriction_terminal`'s deferred commit re-check of `effective_from_utc > clock_timestamp()` is absent from §5.3's deferred list.
   - Because it is clock-based, it is **not** "correct whenever it fires": an early `SET CONSTRAINTS … IMMEDIATE` evaluates it at an earlier clock.
   - State that the statement-time check is authoritative and the deferred check is best-effort narrowing, and list it in the inventory. The apply-path source guard (T-385/T-394) already forbids `SET CONSTRAINTS`.
4. **`required_attesters` exactly-once.**
   - The pin-readiness primary key, count equality and **bidirectional** set equality make the seal check sound.
   - A one-directional implementation ("each payload element has a row" plus count) would accept the payload `[A, A]` against rows `[A, B]`.
   - State it in the abort's terms: unique `attester_module` and `readiness_id` (a duplicate ⇒ `ACC1_SEAL_PIN_INVALID`), and equality in both directions.
5. The applied maker-only `CHECK` (05 §2.4) does not list `approval_id_source IS NULL`, although the prose says it stays NULL. Add it.
6. **T-320 and T-361 wording.** A raw clear or re-point of a protected column is now refused by `42501` or Rule 0 before the guard's abort branch is reached. The abort branch is exercised only by a status `UPDATE` without this target's recovery row. Name the actual refusing layer.

**Human decision required: NO.**

**Totals (new):** MEDIUM 1, LOW 1, INFO 1.

## 8. Protected-column / grant adjudication

| Question | Result |
|---|---|
| Protected set complete? | **Yes.** §2.2.1 classifies every column of both tables, and v0.9 adds `id` and the creation snapshots to class I. Every transition-sensitive counter or pointer is in P: `version`, `close_change_request_id`, `closure_family_id`, `closure_seal_pin_id`, `closure_barrier`, `closure_cycle`, `closure_sealed_at_utc`, `closure_seal_version`, `closure_sealed_at_version`, `closed_at_utc`. `updated_at_utc` is class M (no meaning). `status` is class S, governed by the triggers. Nothing omitted |
| Runtime privileges | `INSERT` / `UPDATE` are **column-level** only. `UPDATE` is exactly B ∪ {`status`}. `INSERT` excludes P and M |
| `UPDATE … SET version = 10` as runtime | **`permission denied`** before any trigger (Q2; Q2b for `INSERT`) |
| Profile `UPDATE` with a guard-assigned `NEW.version` | **Permitted:** version 1 → 2 (Q1). PostgreSQL checks the statement's named columns, not `BEFORE`-trigger assignments. **The column model does not prevent the trigger's assignment** |
| `INSERT … ON CONFLICT DO UPDATE` / table-level grants | Explicitly excluded (§6 comment) |

**Adjudication: CLOSED IN BLUEPRINT.**

## 9. Counter-guard adjudication (`trg_acc1_counter_guard`)

- **Definition.** `BEFORE INSERT OR UPDATE`, `FOR EACH ROW`, no `OF` list and no `WHEN`, so it runs on every row write.
- **Rule 0.** It refuses any statement in which a P column differs from `OLD`, for every role, and it never reads a caller-written P value as input.
- **Firing order** is immaterial. No other `BEFORE` trigger assigns a P column (T-370 source guard), and the others read `OLD`, `NEW.status` and database rows.

| Raw owner/test-role attack | Result |
|---|---|
| Older `version` | Rule 0 refuses (probe O1) |
| Older `closure_cycle` / `closure_seal_version` | Rule 0 refuses (probe O2 for the seal version; same predicate for the cycle) |
| Old initiation id in `close_change_request_id` | Rule 0. The legitimate path also refuses it: rule E needs `R` applied in this transaction **and** never before a `closure_initiation` cause for this target |
| A different non-null pin / family id | Rule 0 / rule F. Legitimate paths only move NULL → value → NULL |
| `INSERT` with a non-initial protected value or a closure status | `INSERT` branch: initial values only; `status = 'active'` only, matching 06 §1 `[*] --> active` |

The privilege layer and the guard are each sufficient against their own attacker (T-367).

**Caveat:** both layers presuppose pinned name resolution in the guard's own evidence reads → **R9-F01**.

**Adjudication: CLOSED IN BLUEPRINT** (subject to R9-F01).

## 10. Version-owner adjudication

Whole-pack search: `version = version + 1` appears **nowhere**. `OLD.version + 1` appears only in 05 (the guard; rule D's `closure_sealed_at_version := OLD.version + 1`, which reads the guard's own value; and statements that `trg_acc1_status_transition` / `trg_acc1_seal` contain none), in 01 ACC-REQ-060 and in 11 (descriptions).

| Path | Increments |
|---|---|
| Profile mutation | +1 (rule A, B-column change) |
| Restriction mutation | +1 (owner-context touch → rule A). A separate status recompute is a separate statement with its own +1. This is two mutations, not a double increment of one |
| Entry to `closing` | +1 |
| Seal | +1 (`closure_sealed_at_version = OLD.version + 1 = NEW.version`; pin stamped `approved + 1`, and the bind proves `approved = live`) |
| Abort | +1 |
| Completion | +1 |
| Operational transition | +1 |
| `SET status = status`, nothing else | **0** (probe Q3: version stayed 2). The guard, `trg_acc1_status_transition`, `trg_acc1_seal`, `trg_acc1_default_protected` and `trg_acc1_status_history` all carry `OLD.status IS DISTINCT FROM NEW.status` |
| `status` named and unchanged, plus a profile change | Exactly +1 (rule A: one increment per row mutation) |

**Adjudication: CLOSED IN BLUEPRINT.** Exactly one owner. The no-op restriction-status wording is R9-F03.2.

## 11. `SECURITY DEFINER` restriction-touch adjudication

| Property | Result |
|---|---|
| Necessary? | **Yes.** The touch must change a row as a role that may write `updated_at_utc`, which the runtime cannot name. An owner-context function is the minimal mechanism |
| Owner | Migration owner role, never `role_acc1_runtime` (§1 rule 8; §8) |
| `EXECUTE` | Revoked from `PUBLIC` and not granted to the runtime role. Verified: the trigger still fires (a trigger is not `EXECUTE`-checked at fire time; probe Q4), and a direct call is refused (Q5). A `RETURNS trigger` function cannot be called directly anyway |
| Schema `CREATE` | The runtime role has none on `acc1`, and `public` is not on the specified path |
| Argument validation / target binding | No arguments. The target comes from the restriction row, which the composite FKs bind to a real account under the same client (RF-06) |
| Can the guard tell a legitimate touch from an arbitrary privileged touch? | Only by "owner context + changes only `updated_at_utc`". Any owner-context touch bumps. That is **harmless:** upward-only, fail-closed staleness, and the owner is trusted. It should be stated (R9-F03.2) |
| Abuse to mutate protected closure state? | **No.** The touch names only `updated_at_utc`. Rule 0 refuses any P change even as owner, and the touch is classified `NONE` (no transition semantics) |
| Recursion | **None.** The touch fires the account triggers; none of them writes `account_restriction`. Deferred account events are queued normally |
| Exactly one increment | **Yes** (Q4: 2 → 3) |
| Arbitrary increments by the runtime role | Only by inserting real restriction rows (a business event it is entitled to perform). Upward-only |
| **`search_path` hardening** | **Defective as specified:** `pg_catalog, acc1` leaves `pg_temp` first for relations. Reproduced bypass → **R9-F01** |

**Adjudication: NOT CLOSED → R9-F01.**

## 12. Raw stale-approval-rewind and closure-cycle adjudication

**Raw rewind.** Approved `version = 10`; a restriction moves the live row to 11.

- `UPDATE target SET version = 10` fails with `permission denied` (runtime) or Rule 0 (owner).
- The abort's `trg_acc1_recovery_bind` (6) and the seal's `trg_acc1_seal_pin_bind` step 9 compare the stamped 10 with live 11 → `ACC1_CLOSURE_APPROVAL_STALE`.
- The same holds conceptually for:
  - `closure_cycle` and `closure_seal_version` (Rule 0; rules B/C);
  - `close_change_request_id` (Rule 0; rule E (iv));
  - `closure_seal_pin_id` (Rule 0; rule F).

**The rewind attack is closed.** The *missing-bump* route to the same outcome is R9-F01.

**Closure cycle.** Rule B (`CLOSING_ENTRY` +1 and `ABORT` +1, otherwise unchanged, never decremented) is **exactly the R2 semantics** (v0.4 and v0.8 §2.1 L43). It was not changed. The abort +1 is consistent with every consumer:

- **Recovery evidence:** `closure_cycle_after = before + 1`; S4 compares it with the live row.
- **Readiness:** `trg_acc1_readiness_insert` needs `closing` at the live cycle, so no readiness exists between abort and re-initiation, and re-initiation adds another +1.
- **Pins:** bind step 9 compares the payload cycle with live (T-375).
- **Attestation:** keyed to the seal version, which abort retains.

**Adjudication: CLOSED IN BLUEPRINT.**

## 13. Seal-payload adjudication (05 §2.4.3)

**Bound facts:**

- `target_type`, `target_id` (stored twice and compared);
- `approved_version`, `closure_cycle`, `closure_change_request_id` (initiation), `closure_family_id` (null-safe);
- `required_attesters`: strong identity and readiness ids per element; non-empty;
- `required_attester_set_hash` (string equality only);
- `family_set_hash` (master only).

Malformed, null or ill-typed fields → `ACC1_SEAL_PIN_INVALID`, tested with `jsonb_typeof`; nothing is cast.

**Immutability:** `trg_acc1_change_request_immutable` covers the payload, hash, targets and type of **every** request type, from `INSERT`. There is no "approve A, apply B". `payload_hash` is stored evidence only and is never treated as SQL proof.

**Set semantics:** bidirectional element equality, count equality (`jsonb_array_length` = rows) and the `(seal_pin_id, attester_module)` primary key together form a bijection. The exactly-once wording should match the abort standard (R9-F03.4).

**Adjudication: CLOSED IN BLUEPRINT.**

## 14. Seal-pin-bind and pin-ownership adjudication

`trg_acc1_seal_pin_bind` (`BEFORE INSERT`) proves:

- the request exists and has `change_type = 'seal_closure'` (steps 1–2);
- it is applied **in this transaction** (steps 3–4);
- the target matches the payload and the request target, and the pin id equals the pre-allocated `result_ref` (step 5);
- the target is locked, `closing`, and has no current pin (step 6);
- the new seal version = current + 1 (step 7).

Step 8 stamps every approval-owned column from the stored payload or the request row, discarding caller values. Step 9 compares with the live row.

**Attack** (approved 10, live 11, caller supplies 11):

- The runtime role cannot name `target_version_approved`, because its `INSERT` privilege covers only the six caller-named columns.
- The owner's value is discarded; the database stamps 10 and refuses (T-374).

**Ownership matrix (§2.9.1).** Every column has exactly one class:

| Class | Columns |
|---|---|
| Caller-named and verified | 6 |
| Payload-stamped | 8 |
| Request-stamped | 4 |
| Live-row-stamped | 1 (`target_type`) |
| DB-generated | 3 |

There is no dual authority. `apply_verified_*` is caller-named, which is correct: it originates in the runtime verification, and the "must equal pinned watermark" rule is unchanged.

**Adjudication: CLOSED IN BLUEPRINT.**

## 15. Orphan-pin proof and `SET CONSTRAINTS` / savepoint adjudication

`trg_acc1_seal_pin_complete` (deferred, per pin) requires each of the following:

- the target is `closure_sealed` on this pin, at this seal version;
- cycle, sealed-at version, barrier, initiation and family all match;
- **exactly one** same-transaction `closing → closure_sealed` history row exists with `cause_ref` = this seal request and `version_before`/`_after` = approved / approved + 1;
- the request is still applied in this transaction;
- the exact approved pin-readiness set exists.

Reproduced on 17.10 with a model of the proof:

| Probe | Sequence | Result |
|---|---|---|
| D-A | pin; `SAVEPOINT`; seal `UPDATE` fails; `ROLLBACK TO`; `COMMIT` | **Commit refused** (`ACC1_SEAL_PIN_ORPHAN`); no pin survives (T-378) |
| D-B | `SAVEPOINT`; pin (+ readiness); failure; `ROLLBACK TO`; `COMMIT` | Commits; the pin and its queued event are discarded; no unique-slot blocker (T-379) |
| D-C | pin; `SAVEPOINT`; seal OK; `SET CONSTRAINTS ALL IMMEDIATE` (passes); `ROLLBACK TO`; `COMMIT` | **The event re-fires at commit and refuses.** PostgreSQL un-marks events fired inside an aborted subtransaction. An early success can be undone only by a rollback, and that rollback restores the event |
| D-D | pin; `SET CONSTRAINTS ALL IMMEDIATE` before the seal | Early refusal (fail closed) |
| D-E | pin; seal; `IMMEDIATE` (passes); later write un-seals; `COMMIT` | PostgreSQL commits (the event does not re-fire). **In ACC every such later write is refused immediately:** the pin pointer, barrier and seal version by Rule 0/F; status out of `closure_sealed` only via a governed abort (which legitimately retains the pin as evidence) or completion; pin-readiness by `trg_acc1_pin_readiness_window`; the request is terminal; pins and readiness are append-only |
| D-F | pin; `SAVEPOINT`; `IMMEDIATE` fails; `ROLLBACK TO`; `COMMIT` | Re-fires at commit and refuses |

**Adjudication: CLOSED IN BLUEPRINT.** T-385 and T-394 assert exactly these behaviours.

## 16. Deferred-trigger timing (R8-F04.1) adjudication

- **Stale phrases.** "evaluated once at commit", "once per" and "only at commit" survive only as statements that they are **withdrawn** (README L89; 12 row 55; 11 L172; 10 T-399).
- **Per-trigger wording.** Each deferred trigger in 05 §5 says "fires at `COMMIT` — or earlier under `SET CONSTRAINTS … IMMEDIATE`; correct whenever it fires".
- **The proofs** are read-only, so repetition is harmless.
- **Every later mutation** of a proven fact is refused or queues a new event. The counters are now covered (§9), and D-C confirms the subtransaction case.
- **One deferred, clock-based check is outside the inventory:** R9-F03.3.

**Adjudication: CLOSED IN BLUEPRINT.**

## 17. Maker-only initiation adjudication (ACC-R3-HD-02)

| Requirement | Result |
|---|---|
| `INSERT requested`, apply-owned fields NULL | Allowed by the status guard's `INSERT` rule and the **applied-scoped** `CHECK` (T-386) |
| Maker entitlement / actor evidence before apply | 05 §5.6 step 0/3; 02 §7.1 (b) |
| `UPDATE requested → applied` in the same transaction | One statement writes `entitlement_evidence_ref`, `actor_assertion_authority`, pre-allocated `sec_audit_ref` and `result_ref`. `applied_xact_id` and `applied_at_utc` are stamped (T-387/388) |
| Applied row requires the exact maker evidence | Scoped `CHECK` (T-390) |
| No checker fields required | They are required to be NULL (T-391). `approval_id_source` NULL is not in the `CHECK` (R9-F03.5) |
| Direct `INSERT applied` | Refused (T-389) |
| Masquerade as `seal_closure` | `CHECK ((approval_mode = 'maker_only') = (change_type IN ('close_master_account','close_subaccount')))` (T-393) |
| Accounts enter `closing` | Rule E verifies `R` applied in this transaction, of the right type and target, with family/member rows, and never before used for this target (T-392) |
| Earlier-transaction applied request reused | Refused (rule E: `applied_xact_id` ≠ current, and (iv)) |
| Request applied, closing transition fails | Whole-transaction failure rolls everything back. **A savepoint-swallowed failure commits an inert applied request (and a master's `open` family) → R9-F02** |

**Adjudication: R8-F03 CLOSED IN BLUEPRINT.** The atomicity residual is R9-F02.

## 18. `xid8`, runtime non-ownership and audit / result-ref adjudication

- **`xid8`** (05 §5.0, rule 5w):
  - The values are correlation only.
  - Every same-transaction predicate is paired with live bindings (version, cycle, seal version, `close_change_request_id`, pin pointer, request status, cause) and with consumed-cause facts (initiation history row, pin per seal request, moved cycle).
  - Reconciliation displays the values only (T-395).
  - **CLOSED IN BLUEPRINT.**
- **Runtime non-ownership** (05 §1 rule 8, T-396). Verified on 17.10 as a grantee:
  - `ALTER TABLE … DISABLE TRIGGER` → "must be owner";
  - `SET session_replication_role = replica` → "permission denied to set parameter" (a PGC_SUSET parameter; PostgreSQL ≥ 15 has `GRANT SET ON PARAMETER`, which the rule correctly denies);
  - `DROP TRIGGER`, `CREATE OR REPLACE FUNCTION` and `ALTER … OWNER` likewise require ownership.

  The named privileges are accurate for PostgreSQL 17. **The list omits `TEMPORARY`** → R9-F01.
- **Audit / result ref** (05 §2.4.2, rule 5x, T-397):
  - Every apply-owned field is written in the single `requested → applied` `UPDATE`.
  - `sec_audit_ref` is pre-allocated before step 4 and reused by the recovery rows, the history cause setting and the later audit/outbox write.
  - `result_ref` is pre-allocated (pin id, created id, restriction id) or already known (abort target, initiation target).
  - No workflow updates either field after apply (sweep of 02/05/10). The status guard would refuse it.
  - **CLOSED IN BLUEPRINT.**
- **Request `id`** is immutable (`trg_acc1_change_request_immutable`). `updated_at_utc` is trigger-maintained, absent from the grant and read by no predicate (T-398). **CLOSED IN BLUEPRINT.**

## 19. PostgreSQL 17.10 reproduction (scratch cluster)

A disposable cluster was created in the reviewer's session scratch directory and destroyed afterwards. It used a non-superuser owner role `acc1_owner` and a grantee `role_acc1_runtime`. The repository was not touched, and this is not an implementation.

| Probe | Result |
|---|---|
| Q1 | Runtime profile `UPDATE` (column grant `name, status` only): a `BEFORE` trigger assigns `NEW.version`; version 1 → 2 |
| Q2 / Q2b | Runtime `UPDATE … SET version` / `INSERT (… version)` → `permission denied` |
| Q3 | `SET status = status` → no bump |
| Q4 | Restriction `INSERT` → `SECURITY DEFINER` touch → guard (`current_user` = `relowner` inside the nested invoker trigger) → exactly +1. The runtime role has no `EXECUTE` on the function, and it still fires |
| Q5 | Direct call of the `SECURITY DEFINER` trigger function → permission denied |
| Q6 | `DISABLE TRIGGER` → must be owner; `SET session_replication_role` → permission denied |
| O1 / O2 | Owner-context `SET version = 1` / `SET closure_seal_version = 7` → Rule 0 refuses |
| O3 / O3b | The pack's `trg_acc1_status_history` `WHEN` clause → DDL error (R9-F03.1) |
| **S1–S3 (as specified, `pg_catalog, acc1`)** | Runtime-created, `PUBLIC`-granted temp `subaccount` and `closure_recovery`: the restriction committed with **no** version bump (4 → 4), and the guard's abort branch **accepted** a forged temp recovery row (**R9-F01**) |
| **S1–S3 (`pg_catalog, acc1, pg_temp`)** | Version bumped (6 → 7); the forged row was refused |
| D-A … D-F | §15 |

**Note on test design.** In a session where a PL/pgSQL trigger has already cached its plan after the session's temp schema existed, a later shadow table is not picked up (the first, warm-session attempt was masked this way). R9-F01's tests must therefore create the shadows in a fresh session before the first trigger execution.

`has_database_privilege('role_acc1_runtime', db, 'TEMPORARY')` = **true** by default.

## 20. Abort and seal / family regression

**Abort (v0.8 proof re-run against v0.9 text).**

- The request status guard and `applied_xact_id` are unchanged.
- Stored payload authority and immutability are unchanged.
- The recovery/history reverse bijection is unchanged: `trg_acc1_status_transition` (b) still requires THIS target's recovery row at the `UPDATE`, matched on `OLD.version`, cycle, seal version and family.
- The four-entry deferred proof (E1–E4) and four-way equality PAY = FAM = REC = HIS are unchanged.
- **Barrier target/cause binding** moved into the guard's abort branch **verbatim** (THIS row, THIS cause, THIS transaction, exactly one row).
- The family-abort guard is unchanged.
- Because the application `UPDATE` now names only `status`, the row `CHECK`s hold on the one coherent row the guard computes.
- R8-F01's guard **strengthens** S3 and S4: the live values they compare can no longer be rewritten.
- **No weakening found** (other than R9-F01's pack-wide resolution precondition).

**Seal / family.**

- The final checker approval is immediately before the seal (request applied in the sealing transaction; approval fields stamped onto the pin).
- The exact checker-approved readiness pin holds, with no readiness substitution ("latest `readiness_seq`" plus relational equality with the stored payload).
- Strong attester identity holds, and the required set is non-empty (`pinned_required_attester_count >= 1`).
- The pin-readiness set is immutable (window trigger plus append-only).
- Post-seal attestation remains renewable (the family hash binds immutable seal facts only).
- Child-before-master sealing and atomic master-family completion are unchanged (05 §5.2, last paragraph; `trg_acc1_closure_family`).
- Every non-`closed` master has exactly one non-`closed` default.
- Master-family abort is atomic; `independent_preserved` is never returned; ACC-R5-HD-01 target-scoped recovery is unchanged.

**All hold.**

## 21. Remaining external gates (correctly carried; none claimed closed)

| Gate | Status |
|---|---|
| **RF-01** IAM-02 entitlement / actor binding | **EXTERNAL GATE REMAINS** (`IAM2-FIND-002` OPEN). The database proves agreement with the stored payload, not IAM-02 authorisation (05 §2.4.1, §2.4.3; README) |
| **RF-02** mistaken-creation / closability | **EXTERNAL GATE REMAINS** (`DEP-LED-CLOSURE-CONTRACT`). R8-F02's internal orphan-pin blocker is closed |
| **RF-05** least-privilege credentials | **EXTERNAL GATE REMAINS** |
| **RF-09** freeze ownership | **EXTERNAL GATE REMAINS** |
| DCR-ACC-IAM-07 (maker-initiation seam) | Open, ACC-REAL-USE |
| DCR-ACC-IAM-08 / `DEP-IAM-SEAL-REJECTION-EVIDENCE` | Open / hard-unsatisfied. IAM-02 has **0** `GET` routes. `checker_rejected_seal` is hard-unavailable |
| DCR-ACC-FND-02 (authenticated channel) | Open, ACC-REAL-USE |
| LED-01 commit ordering (DCR-ACC-LED-01c) | Proven only by LED-01's reviewed implementation |
| Consumer barrier/drain adoption | DCR-ACC-LED-01b/-01e, CONS-01, CFG-01 |
| CFG-01 environment availability (DCR-ACC-CFG-02) | CFG-01 is the sole authority |
| `A2-Q1` / `A2-Q2` | Client-money go-live (HD-7 PENDING) |
| `IAM2-FIND-002` / `FND-FIND-001` | Both **OPEN** (HIGH) in `docs/OPEN_FINDINGS.md` |

These are represented honestly in v0.9 (README §"What the database still does not prove"; 17). **None is a ground for blueprint rejection.**

## 22. Task / conductor consequence

- **`task.json` is not modified by this review.**
  - State: `PLANNING`.
  - `planning = 9` (a legal human-authorised over-limit entry, §3).
  - `acceptanceStatus = NOT_ACCEPTED`.
- **`PLAN_READY` is not set.** No implementation eligibility is created, and there is no `06-acceptance.md`.
- **REMEDIATE ⇒ do not start v0.10 in this state.**
  - `PLANNING → PLANNING` is illegal.
  - `PLANNING → PLAN_READY → PLANNING` would redirect to `HUMAN_DECISION_REQUIRED` (limit 3).
  - The only route to a further planning turn is `PLANNING(9)` → `HUMAN_DECISION_REQUIRED` (ungated; planning stays 9) → `resolve_human_decision` → `PLANNING(10)`.
- **New human DESIGN decision required: NO.**
  - R9-F01…F03 are technical corrections within ACC-R3-HD-01/-02, ACC-R4-HD-01 and ACC-R5-HD-01 as written.
  - The conductor still needs the human `resolve_human_decision` checkpoint to authorise the planning turn. That is a procedural approval, not a design decision.
- **The next checkpoint should transcribe this review into `findingsSummary`** (convention: INFO not counted):
  - R8-F01 (MEDIUM), R8-F02 (LOW) and R8-F03 (LOW) are closed and leave the open list. R8-F04 is closed (INFO).
  - R9-F01 (MEDIUM) and R9-F02 (LOW) enter the open list. R9-F03 is INFO.
  - RF-01, RF-02, RF-05 and RF-09 remain as external gates.
  - Counts: **HIGH 1** (RF-01), **MEDIUM 3** (RF-02, RF-05, R9-F01), **LOW 2** (RF-09, R9-F02).
- **Not ESCALATE:** these are design corrections, not reviewer or model capacity limits.
- **Not HUMAN_DECISION:** no approved text is in conflict.
- **If a future re-review returns ACCEPT:** that is blueprint/architecture acceptance only. Implementation would still need the human/conductor plan-approval checkpoint and the integration decision.

## 23. What this review does not do

It does not:

- modify v0.9 (or v0.1…v0.8), `task.json`, any master or register, `platform/**`, the conductor or `main`;
- create `06-acceptance.md`;
- set `PLAN_READY`;
- take any human decision;
- start remediation;
- merge.

The scratch PostgreSQL cluster of §19 was created and destroyed inside the reviewer's session scratch directory. It is outside the repository and is not an implementation.

**Implementation is not authorised.**
