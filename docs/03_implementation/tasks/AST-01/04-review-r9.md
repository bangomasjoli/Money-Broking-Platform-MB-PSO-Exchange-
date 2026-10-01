# 04 Review R9 — AST-01: Asset & Instrument Registry + Regulatory Classification (blueprint v1.8)

- **Task ID:** AST-01
- **Review type:** Separate-context independent re-review of the v1.8 remediation. Review only: no remediation, implementation, migration or merge.
- **Reviewer:** high_risk_reviewer / claude-opus-5-5 / HIGH
- **Date:** 2026-10-01
- **Reviewed commit:** `8158cba` on `module/AST-01` (v1.8 remediation). History: `78ec1e4` (v1.0) → `45d9a2f` (R1) → `e20b8ca` (v1.1) → `ccec2ff` (R2) → `f769689` (v1.2) → `56b0d6d` (R3) → `b56950f` (v1.3) → `3c222f4` (R4) → `a33cc3d` (v1.4) → `32fadb0` (R5) → `bd753f8` (v1.5) → `3d1dc25` (R6) → `292face` (v1.6) → `ecaf628` (R7) → `d71bd04` (v1.7) → `93139f8` (v1.7 cleanup) → `12f6727` (R8 `REMEDIATE`) → `8158cba` (v1.8).
- **Reviewed against:** `04-review-r8.md` §16, for the **statement** of F42, F43, F44 and F45 only, and the actual v1.8 pack.
- **Not relied on:** `05-remediation-r8.md` (not read) and the README "what changed" column. Every disposition below comes from:
  - the normative v1.8 text;
  - a v1.7 → v1.8 diff (`diff`, with section hashes for the unchanged safety predicates);
  - the platform repository, read-only;
  - the conductor's `validateTaskManifest`, read-only;
  - **live probes on a disposable PostgreSQL 17.10 database** (§2).

## Decision

# **ACCEPT**

**This is BLUEPRINT/ARCHITECTURE acceptance only.** Implementation is not authorised. `PLAN_READY` is not set. No acceptance record is created. Nothing is merged. `task.json` is not modified.

v1.8 corrects all four round-8 findings in the normative text, and the corrections hold up when tested against PostgreSQL itself:

| ID | Sev (R8) | Disposition |
|---|---|---|
| **AST-01-F42** Tracker as lock-ownership proof | LOW | **CLOSED IN BLUEPRINT.** PHYSICAL-LOCK-ALWAYS is normative for every helper. The tracker is declared advisory. A forged tracker cannot remove a physical lock. It can only cause a spurious `AS006` or an ordinary wait/deadlock that PostgreSQL aborts. Tests are rewritten. One stale parenthetical remains (F46(a)) |
| **AST-01-F43** Migration identity | LOW | **CLOSED IN BLUEPRINT.** The design is bound to the actual `AST_MIGRATION_IDENTITY`. The bootstrap install is a separate privileged procedure. The P1 STOP gate has no fallback, and T-ADR-24 runs as the real identity. **DCR-AST1-010 remains an external gate on P1 implementation** |
| **AST-01-F44** Freeze mechanisms | LOW | **CLOSED IN BLUEPRINT.** (a) pinned bootstrap functions; (b) exact OID-derived dispatcher call; (c) policy based on the stored parse tree, with the required body form; (d) `AFTER` final-row backstop plus trigger inventory; (e) no durable `reg*` column; (f) exact-key rebaseline, DB-computed. Four precision residuals are carried as F46(b)–(e) |
| **AST-01-F45** IAM-02 inside the lock | LOW | **CLOSED IN BLUEPRINT.** The apply is two-phase. No row lock and no open transaction is held across `execute-verify`. Every eligibility fact is re-derived under the lock in Phase B |

- **One new finding: AST-01-F46 (LOW, precision, non-blocking; human decision: no).** It covers six residuals. Each fails closed or is editorial. None opens a security-sensitive read or mutation without its control. They are carried as binding **P1 implementation-review items**, and are to be corrected in text by any later blueprint revision (§16).
- **No `SECURITY` → MB/PSO path exists.** B1–B12, `lineage_review_required`, `assert_token_consumable`, record-trigger steps 5–8, §6 conjuncts and `trg_lineage_immutable` are byte-identical to v1.7 (§17).
- **External gates remain external:**
  - F02 (DCR-AST1-004);
  - F05 (DCR-AST1-001(a)+(d));
  - F17 (DCR-AST1-002(7));
  - F21 (DCR-AST1-008(c), OQ-6);
  - **DCR-AST1-010**, which blocks AST-01 **P1 implementation** but not blueprint acceptance (§24).

**Implementation is not authorised. Nothing is accepted beyond the blueprint architecture. `PLAN_READY` is not set. `task.json` is unchanged (§22).**

---

## 1. Baseline verification (all PASS)

| Check | Result |
|---|---|
| Branch / HEAD | `module/AST-01` @ `8158cba`; `origin/module/AST-01` = `8158cba` after `git fetch` |
| Working tree | clean before this record |
| `main` / `origin/main` | both `43f2f34`; `main` is an ancestor of HEAD; untouched |
| Scope | `git diff --name-only main...HEAD`: 0 files outside `docs/02_modules/AST-01/**` and `docs/03_implementation/tasks/AST-01/**` |
| v1.0–v1.7 unchanged | `git diff <commit> HEAD -- blueprint/v1.x` gives 0 files for v1.0 `78ec1e4`, v1.1 `e20b8ca`, v1.2 `f769689`, v1.3 `b56950f`, v1.4 `a33cc3d`, v1.5 `bd753f8`, v1.6 `292face`, v1.7 `93139f8` |
| Earlier review records | `04-review.md` … `04-review-r8.md` are unchanged since their own commits |
| `8158cba` scope | Adds `blueprint/v1.8/**` (12 files) and `05-remediation-r8.md`; edits the module `README.md` and `task.json`. Nothing else |
| Platform facts the pack cites (read-only) | Migration head `071_cfg1_environment_scope.cjs`. `migrate:up` = `node-pg-migrate -m infra/migrations --no-check-order up` (`platform/package.json:19`). `003_iam_rls_token_lookup.cjs:22–30` and `007_iam2_seed_sod_rules.cjs:30–36` record one `postgres` superuser migration identity. No event trigger in any migration. `services/sec1/src/routes/alerts.ts:402–403`: "never hold a Postgres lock across the IAM-02 execute-verify network call" |

## 2. Independence

- **Fresh context.** This is a new Claude Code session. It resumes no authoring, remediation or earlier review session. Inputs:
  - the task brief;
  - the repository;
  - the conductor (read-only);
  - a scratch PostgreSQL cluster.
- **Model family.** The reviewer is `claude-opus-5-5`, as in R1–R8. The v1.8 author is `Claude Sonnet 5.5` (the `8158cba` trailer). This review is **independent in context, not in model family**, with respect to R1–R8.
- **Remediation record not used as proof.** `05-remediation-r8.md` was not opened.
- **Live probes.** PostgreSQL 17.10. The local cluster was started from its stopped state. The probe database `ast1_r9_probe` and roles `r9_mig`/`r9_app` were created, then dropped. The cluster was stopped again. Nothing in any repository was touched.

  | # | Probe | Observed |
  |---|---|---|
  | Q1 | `prosqlbody` for a `RETURN`-form SQL-standard body vs a string-literal (`AS $$…$$`) body | Standard body: `prosqlbody` present (a `{QUERY … :isReturn true …}` node tree). String body: `prosqlbody IS NULL`, text only in `prosrc` |
  | Q2 | Dispatcher pattern: `format('SELECT %I.%I($1)', nspname, proname)` + `EXECUTE … USING p_raw` (`p_raw text`), with a hostile `search_path = public, ast1` and hostile overloads `ast1.f(VARIADIC text[])`, `ast1.f(varchar)`, `public.f(text)` | Returns the **genuine** `ast1.f(text)` result. Adding `ast1.f(text, text DEFAULT …)` raises `function … is not unique`, which fails closed. No overload captured the call |
  | Q3 | `to_regprocedure('ast1.f(text)')` inside a function pinned to `search_path = pg_catalog`, after the session ran `CREATE TEMP TABLE text(…)` | Returns **NULL**: the implicitly-first `pg_temp` captures the type name `text`. With `SET search_path = pg_catalog, pg_temp`, or with `pg_catalog.text` written in the identity, it resolves correctly |
  | Q4 | `md5(pg_get_functiondef(…))` with `quote_all_identifiers` off vs on | **Different** digests |
  | Q5 | A holds `FOR UPDATE`; another session queues `FOR UPDATE`; A re-requests `FOR UPDATE` and then `FOR SHARE` with `lock_timeout = 50ms`. Repeat with A and C both holding `FOR SHARE` (multixact) and a third session queued `FOR UPDATE`; A re-requests `FOR SHARE` | Every re-request by A returns **immediately**. No `55P03`. A does not queue behind the waiter |
  | Q6 | `SECURITY INVOKER` event-trigger function (no `EXECUTE` granted to the DDL issuer) that calls an `INVOKER` assertion; DDL issued by a non-superuser | The trigger **fires**; no `EXECUTE` check on the trigger function at firing. Without `EXECUTE` on the assertion, or `SELECT` on the table it reads, the DDL **aborts** (permission denied). With the two narrow grants it runs **as the DDL issuer**. Non-superuser `SET session_replication_role` is refused; `has_parameter_privilege(…,'SET')` is `false` for both GUCs |
  | Q7 | The same event trigger at default `evtenabled = 'O'` under `session_replication_role = replica` (superuser), then `ENABLE ALWAYS` | `'O'`: does **not** fire. `'A'`: fires |
  | Q8 | `AFTER INSERT` constraint trigger, `DEFERRABLE INITIALLY IMMEDIATE`; `SET CONSTRAINTS ALL DEFERRED`; insert a violating row | The row is visible inside the transaction. `COMMIT` raises and rolls back. The row does not persist |

- **Conductor (read-only).** `validateTaskManifest(task.json)` returned `{"ok":true,"errors":[]}`. `aix-conductor/state` and `records` contain no AST-01 task. `src/records.ts:103` derives `roundCounts` from the runtime task record (`record.rounds`). The conductor repository was clean before and after.

## 3. Dispositions

### 3.1 Round-8 findings

| Finding | Disposition | Basis |
|---|---|---|
| **F42** | **CLOSED IN BLUEPRINT** | §5–§7. Residual F46(a) is one stale parenthetical, contradicted by every normative statement |
| **F43** | **CLOSED IN BLUEPRINT**. **EXTERNAL GATE REMAINS** for P1 implementation (DCR-AST1-010) | §8–§9 |
| **F44** | **CLOSED IN BLUEPRINT** | §10–§15. Residuals F46(b)–(e) are fail-closed precision items |
| **F45** | **CLOSED IN BLUEPRINT** | §16 |

### 3.2 Findings closed earlier (regression-checked, §17)

F29, F30, F31 (inversion), F32(b), F33, F35, F37, F38, F39 and F40: **CLOSED, no regression.** The F37/F40 proof was re-run with a forged tracker (§19).

### 3.3 External gates

| Finding | Disposition |
|---|---|
| **F02** Consumer token adoption | **EXTERNAL GATE REMAINS** (DCR-AST1-004) |
| **F05** Checker identity | **EXTERNAL GATE REMAINS** (DCR-AST1-001(a)+(d)) |
| **F17** Canonical identity (WLT-01) | **EXTERNAL GATE REMAINS** (DCR-AST1-002(7)) |
| **F21** MYR | **EXTERNAL GATE REMAINS** (DCR-AST1-008(c), OQ-6) |

---

## 4. Non-negotiable property

A `SECURITY` / `SECURITY_TOKEN` outcome can never reach `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO` or `WITHDRAWAL_MB_PSO`. **Holds.**
- These sections of 05 are **byte-identical** between v1.7 and v1.8:
  - record-trigger steps 5–8;
  - the `lineage.synthetic` immutability paragraph;
  - §5.2;
  - §6 (conjunct tables).
- The occurrence counts of `lineage_review_required(`, `assert_token_consumable(` and `trg_attestation_binding` are unchanged.
- Every change in §7 is lock wording only:
  - `authoritative_state()`'s `lock_instrument(…, SHARE)` (l.829);
  - token-trigger (2)/(3) (l.879).
- The B-rows are untouched.

## 5. F42 — the tracker is never proof of ownership

**The rule (05 rule 22, l.32; §7A l.948, l.971–977, l.978 step 5, l.992–1007).**
- For a key the tracker shows at the same or a stronger mode, the helper:
  - skips the level/order check;
  - does not add or advance tracker state;
  - raises no `AS006`;
  - **and still issues the PostgreSQL row-lock statement at the requested mode.**
- Weaker → stronger fails `AS006` **before** any statement. That is a refusal, never a skip.
- The tracker is explicitly "advisory ordering state, never evidence that PostgreSQL granted a lock".
- l.976 states the consequence: "No path in this pack lets a tracker entry replace the row-lock statement."

**Per-helper coverage.**

| Helper | Where the physical re-request is stated |
|---|---|
| `lock_governed_change`, `lock_lineage_gate_shared/exclusive`, `lock_asset`, `lock_instrument` | Generic helper preamble (l.948: "On every call, every helper issues the PostgreSQL row-lock statement for each requested key it does not refuse") and rules 1–2 (l.972–973). Gate `SHARE`→`EXCLUSIVE` is `AS006` (3) (l.954, l.989) |
| `lock_instruments` (and `lock_affected_instruments`, `lock_merge_affected_instruments`, `lock_asset_instruments`, which all delegate to it) | Set-lock step 5 (l.978): "physically acquire every requested id — H and N — ascending … an id in H that the transaction does not hold (a forged entry) is genuinely acquired here" |
| `lock_token`, `lock_tokens`, `lock_instrument_tokens` | l.961–963, l.1108. The "instrument already held" precondition is declared ordering bookkeeping only. The security-bearing token triggers call `lock_instrument` (physical) first (l.879) |
| Security-bearing sites | Enumerated table, l.994–1005: underlying guard; `trg_asset_class_frozen` (both branches); `trg_instrument_asset_lock`; `trg_instrument_lock_on_write`; record trigger 2(a)–(c); evidence trigger; merge step 6; token consume/revoke; `authoritative_state()`; admission/attestation/custody/operational/hold/retire writers |

Consistency sweep (`no SQL lock | no row-lock | zero … statement | no-op | issues no`):
- **One stale residue: 05 l.1097**. The `ASSET_CLASS_CORRECTION` apply step 5 parenthetical still reads "an idempotent re-lock … **no SQL lock**, no level check, no `AS006`".
- Every normative statement contradicts it:
  - rule 22;
  - l.948;
  - the security-bearing table (l.997: `trg_asset_class_frozen` → `lock_asset(OLD.asset_id, UPDATE)`, always physical);
  - §4.1 (l.462, rewritten to "still issues the `FOR UPDATE` request on the asset row");
  - Re-lock site 2 (l.981);
  - 02 W13 (l.168);
  - T-LOK-07(i);
  - T-LOK-12(b).
- The same sentence goes on to say the instrument re-requests "return immediately".
- The helper has one implementation, so the narrative cannot produce a separate behaviour. **Editorial, carried as F46(a).**
- Other hits are clean. 12 AR-36's "documented no-op" is a historical v1.5 risk row; AR-45 supersedes it.

## 6. F42 — forged-tracker adjudication

Attacker: an `ast1_app` raw session. It writes any `ast1.*` tracker key with `set_config(…, true)` (R8 probe P2).

| Forgery | Effect on the helper | Security outcome |
|---|---|---|
| Claims `{source, target}` held at `UPDATE`, holds neither; raw `INSERT INTO instrument_underlying` | Both ids fall in H. N is empty, so step 4 is skipped. **Step 5 physically acquires both, ascending** | `trg_underlying_insert_guard` reads both lifecycle statuses only **after** the real locks (05 §4.3 step 2, l.561). F37 is **not** reopened (§19) |
| Claims a key held at `SHARE`; requests `UPDATE` | Rule 3 ⇒ `AS006` before any statement | The forger's own transaction aborts. Nothing is read or written |
| Claims a stronger mode than requested | Rule 2 ⇒ issues the requested (weaker) mode physically | The requested lock is genuinely held |
| Claims a **higher** level, or a higher "highest new id", than reality | A genuinely new key is refused `AS006` (2)/(4) before any statement | Fail-closed, self-inflicted |
| Claims a **lower** level / lower highest-id than reality (falsely "nothing held") | Every key is treated as new. The guard passes and the lock is **genuinely acquired**, possibly out of protocol order | Worst case: an ordinary lock wait (`55P03` under `lock_timeout` ≤ 5 s) or a deadlock (`40P01`). PostgreSQL aborts one side, fail-closed (05 l.977, l.1071). An availability effect, honestly stated |
| Malformed / `''` / `NULL` values | `NULL`/`''` ⇒ empty tracker (l.969), so every key is new and genuinely acquired. An unparseable value raises inside the helper | Fail-closed |
| Set-growth check (`AS006` (1)) | Re-derived from table rows after locking, never from the tracker | Unaffected |

**Can a forged tracker permit a security-sensitive read or mutation without its physical lock?**
- **No.** The only tracker-dependent outcomes are (a) an `AS006` refusal, (b) skipped ordering bookkeeping and (c) skipped tracker mutation (l.976).
- Every check that reads security state runs after a helper call that issued its row-lock statement. That covers trigger sites and `authoritative_state()` alike.
- The executor's own tuple locks (an `UPDATE`'s write, FK `KEY SHARE`) are not tracker-mediated at all.
- T-LOK-12 l.266 asserts the stronger property: the lock statement precedes the check's first read. It also asserts that a forged claim never stops a genuine conflicting holder from blocking the forger.

## 7. F42 tests

| Test | Requirement | Result |
|---|---|---|
| **T-LOK-07(b)** (l.261) | The physical request is issued, ascending; "the test must **not** assert zero row-lock statements"; no blocking (`lock_timeout = 50 ms`, no `Lock` wait event); tracker unchanged; no `AS006`; the lock remains held (second-session `NOWAIT` ⇒ `55P03`) | **Correct.** (a) still asserts **no** statement for a **refused new** key. That is the right contrast, because a refusal precedes acquisition |
| **T-LOK-07(i)** | The correction trigger's `lock_asset` and `lock_asset_instruments` **physically issue** their requests, return without blocking, leave the tracker unchanged, raise no `AS006`, and the rows stay locked | **Correct** |
| **T-LOK-12** (l.266) | Forged claims at every security-bearing site (a)–(e); permitted outcomes are success with the lock held, `AS006`, or `55P03`/`40P01`; **never** a check without its physical lock | **Correct and complete** against the l.994–1005 table |
| **T-LIN-39** (l.170) | Protocol-path re-lock: physical request for both ids, no blocking, tracker unchanged, no `AS006`, locks still held | **Correct**. No zero-statement assertion remains |
| **T-LIN-42** (l.173) | The F37 attack with two forging raw writers, in both orders, with the sweep off. Includes a negative-control build (no physical request) that must reproduce F37 and must not ship | **Correct** |
| T-LIN-41, T-LOK-13 | The property test also runs with forged trackers; the optional static scan is declared not safety-bearing | Correct |

**No test still requires zero physical row-lock statements for an idempotent re-lock.** Probe Q5 confirms the PostgreSQL premise. A re-request of a row the transaction holds at the same or a stronger mode returns at once, even with another session queued on it, including the shared-multixact case. **No new wait edge.**

## 8. F43 — migration-identity gate

**Two identities are distinguished (05 §2.2.0 l.138–142, rule 27 l.37).**
- **A. Routine `AST_MIGRATION_IDENTITY`.** "The **actual** PostgreSQL connection identity that executes AST migrations (`platform migrate:up`) in **every** environment … **not** a role invented by a test". Requirements (1)–(9):
  1. `rolsuper = false`;
  2. not a direct or transitive member of `role_ast1_bootstrap` (`pg_has_role`, plus a walk of `pg_auth_members`);
  3. no `SET ROLE` to it;
  4. cannot grant itself membership (no `ADMIN`; `CREATEROLE` only if proven harmless on the pinned major);
  5. cannot alter, drop or re-own bootstrap objects;
  6. cannot disable, drop or re-own the event triggers;
  7. no `GRANT SET ON PARAMETER` for `session_replication_role` / `event_triggers`;
  8. not the owner of `ast1`;
  9. no equivalent path (membership in a superuser or bootstrap-owning role, a `SECURITY DEFINER` escalation).
- **B. `role_ast1_bootstrap`.** A controlled **superuser** (event-trigger creation and ownership require one, R8 P5). Never the `migrate:up` identity. Used only by `AST-P1-BOOTSTRAP-INSTALL`.

**STOP gate.**
- `AST-P1-MIGRATION-IDENTITY-GATE` (l.146) stops P1 **before any AST P1 migration is applied** if any of (1)–(9) fails.
- **No silent fallback** is stated three ways:
  - no test-created substitute role;
  - no "temporary" superuser run;
  - no weakening of §2.2.1.
- Otherwise "AST-01 P1 returns for a separate architecture review".
- The gate is independent of the event-trigger gate (l.351).

**Current platform reality is recorded honestly.**
- 05 l.136 and l.146, rule 27, and 17 DCR-AST1-010 (l.48) all say it.
- 17 §2.1 (l.60) classifies DCR-AST1-010: "**AST-01 P1 implementation** … P1 STOPS" / Not: "Blueprint review/acceptance; P2–P4 planning".
- It also records that 003's `SECURITY DEFINER` owners depend on the superuser runner. The 003 header (l.29–31) confirms this.
- **Blueprint acceptance therefore coexists with P1 being blocked on DCR-AST1-010. The two are not conflated.**

**T-ADR-24 (l.222) tests the real identity.**
- It connects with "the same connection configuration the deployment's `platform migrate:up` uses".
- It first asserts that `session_user` equals that configured identity **and that the role was not created during the test run**. A test-created role "fails the test".
- Then it checks (1)–(10): catalog facts and behavioural refusals.
- T-ADR-27(g) and T-ADR-28(b) check that a superuser, a bootstrap member, an `ast1` owner, or a `GRANT SET … session_replication_role` holder stops the gate before any `ast1` object exists.

## 9. F43 — bootstrap privilege feasibility

Every capability v1.8 names was checked against PostgreSQL 17:

| Wording | Real PostgreSQL concept? | Notes |
|---|---|---|
| `GRANT SET ON PARAMETER session_replication_role / event_triggers` (PG 15+), `has_parameter_privilege(…,'SET')` | **Yes.** Both GUCs are `PGC_SUSET`. `event_triggers` exists from PG 17 | Probe Q6: the non-superuser `SET` is refused and `has_parameter_privilege` is `false` |
| Event-trigger create/own/alter/drop | **Yes.** Creation requires superuser; the owner must be a superuser; `ALTER/DROP EVENT TRIGGER` is owner-only | R8 P5; v1.8 states this correctly (l.141) |
| Schema ownership | **Yes.** The schema owner can drop any object in the schema. With `ast1` bootstrap-owned and only `USAGE, CREATE` granted, the migration identity has no schema-owner drop path | l.154 |
| Role membership / `SET ROLE` / `ADMIN` / `CREATEROLE` | **Yes.** `CREATEROLE` cannot grant membership in a superuser role. v1.8 still requires proof on the pinned major | Requirement (4) |
| "Unable to bypass triggers through `session_replication_role` or equivalent" | **Yes** for the GUC route. For the table-owner route (`ALTER TABLE … DISABLE TRIGGER` on the migration-owned `instrument`/`network_registry`), v1.8 says honestly that it is **caught by the DDL guard and the assertion, not by privilege** (l.144, l.380). That is correct: the migration identity owns those tables | Precision: requirement (5)'s "(freeze tables, functions, triggers)" privilege-protects triggers on bootstrap-owned **freeze tables** only. Triggers on identity tables are guard-protected, as l.144 states. Not a boundary break |
| Event triggers are default `evtenabled = 'O'` (T-ADR-23 l.221 asserts `'O'`) | **Yes.** Under `session_replication_role = replica` an `'O'` event trigger does **not** fire (probe Q7) | The boundary holds: requirement (7) denies the GUC to the migration identity. But the identity-table row triggers are required `'A'` precisely so they survive replica mode (T-ADR-31(d)), while the event triggers and the freeze-table registration/immutability triggers are left at `'O'`. **F46(c)** |

**The event trigger cannot protect itself from a superuser.** v1.8 says so honestly:
- §2.2.1: "an actor who could already defeat role separation could defeat that check too";
- l.157: step 0 "is a *misconfiguration detector* … not the boundary";
- §2.2.12 l.380: "it does not stop a superuser";
- 05 l.350: the migration identity "cannot disable, drop, replace or alter" the trigger **because of rules 25 and 27** (privilege), not self-protection.

The boundary is exactly what the brief requires: the ordinary identity lacks the privilege, and the bootstrap identity is separately controlled.

**Bootstrap install path (l.144, §12 step 0 l.1267).**
- `AST-P1-BOOTSTRAP-INSTALL` is the **only** place that creates or changes:
  - the bootstrap role and schema;
  - the freeze tables and functions;
  - both event triggers;
  - the `approved_primitive` / `bootstrap_inventory` rows;
  - the rebaseline rows on a major upgrade.
- It runs before the P1 migrations and outside `migrate:up`, with human approval.
- Routine `migrate:up` must not run as bootstrap. T-ADR-28(a) asserts that the migration file set holds no `SET ROLE role_ast1_bootstrap`, no superuser creation and no bootstrap-owned object creation.
- **Maintenance** of bootstrap rows (a new inventory row for a legitimate trigger, rebaseline rows) is routed through the same procedure (l.380, l.360).

## 10. F44(a) — bootstrap search_path and security mode

**Pinning (05 §2.2.1a l.164–167, l.184).**
- Every bootstrap function is declared `SET search_path = pg_catalog`.
- It qualifies every non-`pg_catalog` reference, and uses qualified forms where `pg_temp` (relations, types) or operators could capture a name.
- `PUBLIC EXECUTE` is revoked.
- Step 0(b) verifies the exact `proconfig`, `prosecdef`, owner and ACL against `bootstrap_inventory`.
- T-ADR-29 reproduces R8 P3 (a shadow `ast1.pg_get_functiondef`) and requires identical results.

**Is `search_path = pg_catalog` alone sufficient?**
- **For functions and operators, yes.** `pg_temp` is never searched for them, and `ast1` is not on the path. So an `ast1.pg_get_functiondef` or an `ast1` operator cannot capture a call, and `ast1.address_rule_version` and the like must be written qualified, as v1.8 requires.
- **For relations and types, only together with qualification.** `pg_temp` stays implicitly first. v1.8 recognises this (item 2) and mandates `pg_catalog.text` and similar forms.
- **One residual.** The stored textual identity is forced by its `CHECK` (l.243) to the **unqualified** shape `ast1.f(text)`. Its argument type is then resolved by `to_regprocedure` through `pg_temp`-first. In a session that created a temp type `text`, resolution returns NULL (probe Q3).
  - The outcome is fail-closed: `RULE_FUNCTION_MISSING` / `IDENTITY_UNRESOLVED` / an aborted DDL.
  - The impact is confined to the attacker's own session. Even a resolved hostile overload would fail step 3's exact `(text) → text` signature check and the digest.
  - `SET search_path = pg_catalog, pg_temp`, which R8 F44(a) proposed, removes the capture (probe Q3). **F46(b).**

**SECURITY INVOKER — is it workable? Yes, with the grants v1.8 lists.**
- Probe Q6 shows the governing facts:
  - a trigger or event-trigger function runs **as the issuing role**;
  - PostgreSQL does not check `EXECUTE` on the trigger function at firing (v1.8 l.167 states this correctly);
  - an `INVOKER` callee then needs the issuer's own `EXECUTE`/`SELECT`.
- Function by function:
  - **DDL guard → assertion, as `AST_MIGRATION_IDENTITY`.** It reads `pg_catalog`, which is world-readable, including `prosqlbody`, `pg_trigger` and `proacl`. It reads the freeze tables (`SELECT` granted, l.152) and `instrument` (the migration identity is the owner). It executes the digest helper, the assertion and the dispatcher (all granted, l.171–179) and the rule functions (owner). **No write is needed.** The assertion only raises.
  - **Registration trigger, as the migration identity.** It reads `pg_proc`, `approved_primitive` (`SELECT`) and the digest helper. It writes only `NEW`.
  - **Rebaseline, inventory and primitive inserts.** These are bootstrap-only, enforced by privilege (`SELECT`-only for the migration identity).
  - **Instrument `BEFORE`/`AFTER` triggers, as `ast1_app`.** They read `network_registry` and `address_rule_version` (`SELECT`) and call the dispatcher (`EXECUTE`). They also need `EXECUTE` on the rule function, which the registering migration grants; l.182 says a missing grant fails closed.
- **None needs superuser authority.**
- `INVOKER` avoids the superuser-`DEFINER` escalation class. Grants are narrow (`SELECT`/`EXECUTE`) and confer no modification or bypass.
- **Adjudicated sound.** An implementation-review note (not a finding): the event trigger is database-wide. If DCR-AST1-010 introduces other non-superuser module identities, the guard must classify non-AST DDL as irrelevant before calling the assertion. Otherwise its "when in doubt, run the assertion" rule (l.348) aborts those identities' DDL with a permission error. That is fail-closed but couples availability across modules.

**Digest determinism.**
- `pg_get_functiondef` output depends on the session GUC `quote_all_identifiers` (probe Q4).
- A digest computed or recomputed under a non-default value mismatches. The outcome is fail-closed `DIGEST_MISMATCH`.
- A registration made under the non-default value would permanently fail for that immutable pair.
- The exact-`proconfig` rule (`{search_path=pg_catalog}`, "no more, no less") currently forbids the obvious fix: pinning `quote_all_identifiers = off` on the digest helper. **F46(d).**

## 11. F44(b) — dispatcher invocation

The pattern (05 l.102–107; T-ADR-30):
1. Static registry lookup with bound arguments.
2. `pg_catalog.to_regprocedure(rule_function_identity)`; NULL ⇒ `AS004`.
3. Verify the `pg_proc` row: signature exactly `(text) → text`, `provolatile = 'i'`, owner = `registered_owner`, `sql`, not `prosecdef`, pinned `proconfig`.
4. `format('SELECT %I.%I($1)', nspname, proname)` taken from the resolved row's own catalog names.
5. `EXECUTE … USING p_raw`.

| Attack | Result |
|---|---|
| Caller-controlled identity text | None. `rule_function_identity` comes from the immutable registry row, never from the caller. `p_address_format` and `p_version` are bind values in step 1 only |
| Overload (same name, other signature) in `ast1` | `$1` is bound from `p_raw text`, so its type is `text`. The exact `(text)` candidate wins over `varchar`, `VARIADIC text[]` and polymorphic overloads. A same-effective-signature overload (`(text, text DEFAULT …)`) makes the call **ambiguous ⇒ error** (probe Q2). Execution never resolves differently from registration without failing |
| Same name in a hostile schema / `search_path` manipulation | The schema comes from `pg_namespace` of the verified OID and is always rendered qualified. The dispatcher's own path is pinned. `public.f(text)` is not reachable (Q2) |
| Quoted identifiers | `%I` quotes correctly. The `CHECK` (l.243) already confines identities to `^ast1\.[a-z][a-z0-9_]{0,62}\(text\)$` |
| Raw input as SQL | `p_raw` is only ever a `USING` bind value. T-ADR-30(b) covers injection strings |

**The function executed is the exact registered function, or the call fails closed.**
- Optional hardening for P1, not a finding: render `$1::pg_catalog.text`, or invoke by OID, and add the ambiguous-default overload of probe Q2 to T-ADR-30(d).
- Neither changes the outcome.

## 12. F44(c) — parsed-dependency policy

**Feasible on PostgreSQL 17.**
- `prosqlbody` is a `pg_node_tree` that carries every `:funcid`, `:opno`/`:opfuncid`, `:consttype`, collation and range-table relid (R8 P1; Q1 shows the `QUERY` node).
- The textual node format (`nodeToString`) serialises constants as datum bytes and escapes tokens, so a string literal in the body cannot inject a fake node.

**Body form.**
- Only the SQL-standard form (`RETURN …` / `BEGIN ATOMIC … END`) produces `prosqlbody`. A string-literal body leaves `prosqlbody` NULL (probe Q1).
- **v1.8 requires that form** and refuses anything else:
  - l.187: "`LANGUAGE SQL` with a SQL-standard body";
  - l.193: "**SQL-standard parsed/stored body** (`prosqlbody IS NOT NULL`)";
  - T-ADR-25(f): "have a string body … ⇒ refused".

**Allowed subset is narrow and mechanically checkable.**
- The form: `(text) → text`, `IMMUTABLE`, `STRICT`, not `DEFINER`, pinned path; no dynamic SQL, procedural language, relation, `SubLink`, aggregate, window or SRF.
- The walker enumerates function, operator (→ `oprcode`), type, collation, relation and `SQLValueFunction`/`NextValueExpr`/`CurrentOfExpr` nodes.
- **Default-deny on any unclassified node tag** (l.195). This also covers implicit-function nodes such as `CoerceViaIO`, `MinMaxExpr` and `ArrayCoerceExpr`: they are refused unless the walker classifies them together with their implicit functions.
- Rules 1–4 (l.198–201) refuse each brief-listed dependency by exact allow-list, not keyword:
  - relations and system catalogs;
  - time, randomness and sequences;
  - GUC/session functions;
  - `current_user`/`current_role`/`session_user`;
  - unapproved helpers and extensions.
- The walker's implementation (a PG 17-specific node-tree reader) is left to P1, against an exact acceptance criterion (the object set) and T-ADR-25(a)–(i). That is the right altitude for a blueprint. Its PG-major specificity is covered by the per-major `approved_primitive` rows and the rebaseline re-run (§2.2.10).

**Approved primitives (§2.2.5 l.214–229).**
- Each row pins: exact identity with argument types; per-major approval; expected owner; `expected_provolatile = 'i'` (`CHECK`).
- `FROZEN_BOOTSTRAP` requires the bootstrap owner (`CHECK`), its own digest and its own dependency closure.
- `EXTENSION` requires name, version and digest.
- **A migration-owned helper cannot be approved as `FROZEN_BOOTSTRAP`.**
- A dishonestly-`IMMUTABLE` user helper fails because:
  - it is not in the allow-list, or
  - its owner is not the expected one, or
  - if it is a bootstrap primitive, its digest and closure are frozen, and step 3 recomputes them.
- pg_catalog built-ins are owned by the cluster bootstrap superuser and cannot be altered by the migration identity. Step 3 re-checks owner and volatility on every assertion.
- **Residual:** the `PG_CATALOG` kind is not mechanically bound to the `pg_catalog` namespace. There is no `CHECK` on `object_identity`, and no stated check of the resolved object's `pronamespace`. A bootstrap-procedure error that records an `ast1` helper as `PG_CATALOG` with the migration identity as `expected_owner` would admit an unfrozen helper. The privileged, human-approved install is the control. Making it mechanical is cheap. **F46(e).**

## 13. F44(d) — final-row validation and trigger order

**Backstop (§2.2.12 l.374–378).**
- `trg_instrument_address_final` is a bootstrap-owned `AFTER INSERT OR UPDATE` row constraint trigger, `ENABLE ALWAYS`.
- On `INSERT` it re-validates the **stored** `contract_address_canonical` as a fixed point under the row's own stored format/version, and it requires the stored pair to equal the registered pair and the network to be `ACTIVE`.
- On `UPDATE` it requires the five identity columns to be `IS NOT DISTINCT FROM` their `OLD` values.

**Against the brief's attacks.**
- **A later `BEFORE` trigger rewrites `NEW`.** `AFTER` row triggers fire after **all** `BEFORE` triggers, whatever their names, and see the stored tuple. The rewrite is refused (`AS005`). This does not depend on name ordering.
- **A later `AFTER` trigger issues an `UPDATE`.** That `UPDATE` fires `trg_instrument_immutable_from_insert` (`BEFORE`), the canonical trigger's `UPDATE` arm, and this backstop's `UPDATE` arm, so an identity rewrite is refused.
- **Unapproved triggers.** They are refused at DDL time by the inventory (step 0(c)): no non-internal trigger outside `bootstrap_inventory` on `instrument`/`network_registry`; inventoried triggers must exist, call the inventoried function and be `'A'`.
- **The proof does not rest on name ordering.** The `AFTER` backstop is what makes the stored value canonical (l.380, stated explicitly). The inventory is defence against new triggers, and the DDL guard enforces it.
- **Precision.** The backstop is `DEFERRABLE INITIALLY IMMEDIATE`, so any session can `SET CONSTRAINTS … DEFERRED`. The check then runs at `COMMIT` and still rolls the transaction back (probe Q8). It never persists a non-canonical row. But l.375's "the statement aborts" is then "the transaction aborts at commit", and nothing requires `DEFERRABLE`. **F46(f).**

## 14. F44(e) — no durable `reg*`

- `rule_function_identity text` (l.234) is the authority. No `regprocedure` column remains (grep over v1.8: the only `reg*` mentions are prohibitions, `to_regprocedure` calls and the render check).
- An OID cache is permitted only as non-authoritative and is regenerated after restore/upgrade (l.384).
- T-ADR-32 scans every `ast1` column, including domains and arrays, for a **broader** list than PG 17's `pg_upgrade` refusal set. It checks registration render-equality, dump/restore re-resolution with an empty or corrupted cache, and `pg_upgrade --check`.
- The upgrade narrative (§2.2.10) and the dump/restore negative (T-ADR-27(e)) are consistent with it.
- **Closed.**

## 15. F44(f) — rebaseline digest

- **Rule (l.334, l.357–360).**
  - Running major = `registration_pg_major`: use the original digest and closure.
  - Otherwise: **exactly one** `address_rule_rebaseline` row keyed `(format, version, running major)`.
  - Zero rows, or a lower running major ⇒ `PG_MAJOR_UNREVIEWED`.
  - "No 'latest rebaseline', no timestamp ordering, exact key only".
- The primary key `(address_format, canonicalisation_version, pg_major_version)` (l.284) makes "exactly one" structural.
- `definition_sha256` and `dependency_closure_sha256` are **DB-computed** by the bootstrap-owned `trg_address_rule_rebaseline_register`, overwriting caller values. The trigger accepts only the running major, and re-runs vectors, fixed points and collisions. The `*_verified` booleans are database-derived and `CHECK`-required.
- Append-only: `trg_address_rule_rebaseline_immutable` (`AS002` for every role). Inserts are bootstrap-only by privilege.
- T-ADR-33(a)–(g) covers bogus supplied values, both insertion orders, manipulated `created_at_utc`, and digest-equals-original-but-not-rebaseline.
- **Closed.**

**Event trigger wording.**
- l.348 now states the correct fact: `ddl_command_end` **does** fire for `DROP`, and `sql_drop` is added for the dropped-object detail. They are complementary.
- T-ADR-22(b) asserts that both fire.
- Coverage against the brief's list, via l.348 and step 0:

  | DDL | Coverage |
  |---|---|
  | Replace a rule | Digest |
  | Alter owner | Owner check + `registered_owner` |
  | Drop a rule | `to_regprocedure` NULL |
  | Drop/alter the dispatcher or assertion | Privilege, plus step 0(b) |
  | Schema changes affecting identity | `ast1` not ownable or droppable by the migration identity; rename ⇒ resolution failure |
  | Add an unapproved trigger | Step 0(c) |

- No coverage gap.

## 16. F45 — IAM outside the transaction

**Protocol (05 §7A l.923–945; 04 l.79; 02 W11–W13; 05 l.1079, l.1093).**
- **Phase A:**
  - no transaction and no lock;
  - unlocked read;
  - lock-free prechecks;
  - recompute the payload hash;
  - IAM-02 `execute-verify`;
  - capture `verified_payload_hash` and the attested approvers/policy.
- **Phase B:**
  - `BEGIN`;
  - `lock_governed_change` first;
  - re-read the change under the lock;
  - require `requested`;
  - stored payload recomputes to the stored hash, **and that hash equals IAM's `verified_payload_hash`**;
  - attested approvers satisfy `required_checkers` with `maker ∉ approvers`;
  - then levels 0→1→2→3→writes.
- "No step of any AST flow calls IAM-02 between `BEGIN` and `COMMIT`" (l.925).

**Unlocked-window races.**

| Race during Phase A | Phase B outcome |
|---|---|
| Status moves out of `requested` (a concurrent apply or a cancel) | G serialises. The locked re-read fails closed (`AST1_CHANGE_STATE_INVALID`) |
| Payload edit | `governed_change` has **no DB immutability trigger** on `payload` (§8 l.1165; "immutable" is the recompute check). The binding is still sound: Phase B recomputes the hash from the payload read under G (`FOR UPDATE` blocks further writes) and compares it with the hash IAM verified. Any edit ⇒ `AST1_APPROVAL_INVALID`. Observation only: a DB-level immutability trigger would be cleaner defence in depth |
| A new sibling `SECURITY` determination, or a merge joining security history | Re-derived under the gate and instrument locks. The record trigger computes `elevated`, review floor and binding afresh (§5.1 step 7) and needs ≥ 2 attested checkers. A single-checker IAM result cannot satisfy it ⇒ refused (T-ISO-01(b)) |
| Asset class corrected | The record stamps the **live** class under the instrument lock (step 4). Step 6 / B12 apply. The correction apply itself re-verifies `(from, to)` and approval strength against the live class under locks (l.1096) |
| Lifecycle change (retire, identity lock) | Step 2A under the instrument lock |

**No stale IAM result can override current eligibility facts.** IAM output is used only as attested approver evidence bound to a payload hash. Every eligibility fact is read under levels 0–2 in Phase B.

**Remote-call audit (whole v1.8).**
- The only outbound remote call in any normative write path is IAM-02 `execute-verify`. Every occurrence (05 rule 29, §7A, merge and correction apply, 04 l.79, 02 W11–W13) is in Phase A.
- Other cross-module mentions are **inbound** (WLT-01, OMS-01 and others call `evaluate`/`verify-decision`) or are DCR contracts.
- The evidence document store (DCR-AST1-005) is unassigned, and no normative step calls it inside a transaction. The same rule would apply when it is designed.
- T-LOK-05 (l.259) asserts no AST lock **and** no open transaction (`xact_start`, `backend_xid`, not `idle in transaction`) during the call, plus a static check.
- **No `BEGIN`/lock → remote call → `COMMIT` path exists.**

## 17. Full security regression

| Property | Result |
|---|---|
| `SECURITY` cannot reach MB/PSO | **Holds** (§4) |
| B1–B12 | **Holds**. Section unchanged |
| B8 ≡ C0b parity | **Holds** (`lineage_review_required` unchanged; T-DB-17, T-LIN-24) |
| F27 merge narrowing | **Holds**. Only step-6 lock wording changed (l.431) |
| F33 correction locking | **Holds**. `trg_asset_class_frozen` (b) still calls `lock_asset_instruments`, now explicitly physical (l.462, l.997) |
| F35 `WITHDRAWN` terminal, `SEC(G)` exclusion, marker sequencing | **Holds**. Unchanged |
| F37 recursive basis-tree proof | **Holds**, including under a forged tracker (§19) |
| F38 helper exclusivity | **Holds**. 12-helper family unchanged; T-LOK-07(m) scan unchanged; the stale `05-remediation-r7.md` citation is removed |
| F40 raw underlying guard | **Holds**. Lock first, then read (l.560–561) |
| `READ COMMITTED` precondition | **Holds** (`AS007` first in all 12 helpers and `authoritative_state()`; T-ISO-01(c) now targets the Phase B transaction) |
| Gate-first merge | **Holds** (§3 steps 1–3 unchanged) |
| Attestation sequencing | **Holds** (`attestation_seq`) |
| Marker sequencing | **Holds** (shared sequence, same-instrument comparison) |
| Digital MYR fail-closed | **Holds** (B10) |
| Real/test classification fail-closed | **Holds** (B11, step 8, B4) |
| Synthetic never real | **Holds** |
| `lineage.synthetic` immutable | **Holds** (paragraph byte-identical) |
| Consumer token binding | **Holds** (B9; token trigger (1) unchanged) |
| No `exchange.*` namespace | **Holds**. Every `exchange.` mention is a prohibition (04 l.18, 08 l.5, 10 l.418, 12 l.114, 17 l.41/l.75) |

## 18. Full lock graph (v1.8)

**Outside any transaction:** IAM-02 `execute-verify` (Phase A), for every governed apply. It is not a node in the waits-for graph.

**Inside the transaction** (05 l.1050–1067):

| Path | Walk | In order? |
|---|---|---|
| Record, non-`SECURITY` | G → 0 `SHARE` → 2 `UPDATE` → 2A → 3 → 4 | yes |
| Record, real `SECURITY` | G → 0 `UPDATE` → derive → 2 set ascending, one pass → re-derive → 2A → 3 → 4 | yes |
| Lineage merge | G → 0 `UPDATE` → 2 ascending → trigger re-lock (physical, immediate) → 3 → 4 | yes |
| `ASSET_CLASS_CORRECTION` | G → 1 `UPDATE` → 2 all ascending → trigger re-locks of 1 and 2 (physical, immediate) → 3 → 4 | yes |
| Other governed applies | G → 2 → (3) → 4 | yes |
| Underlying link | 2 `{S,T}` ascending (application, then the trigger's physical re-request; on the raw/forged path, the trigger's genuine acquisition) → FK `KEY SHARE` (subsumed) → 4 | yes |
| Evidence / case submit / instrument insert / mint / consume / revoke | 0→2→4 / 2→4 / 1→4 / 2→4 / 2→3 / 2→3 | yes |

- **Re-locks after F42.** Every trigger re-lock is now a physical request on a row the transaction already holds at the same or a stronger mode. PostgreSQL returns at once **without enqueuing**, even behind a queued waiter (probe Q5). It therefore adds **no wait edge**, and the acyclicity argument (every edge ascends in G→0→1→2→3→4 and in key order within a level) is unchanged.
- The `ASSET_CLASS_CORRECTION` trigger's level-1 re-request after level 2 is on a row already held, so it adds no edge.
- **No supported cycle.**
- Unsupported, fail-closed: raw consume and raw revoke (executor tuple lock first), and any out-of-order acquisition a forged tracker induces. Both are bounded by `lock_timeout` and aborted by the deadlock detector.

## 19. F37 / F40 regression with a forged tracker

The attack: L forges `{S, V}` and raw-inserts S → V. M forges `{X, S}` and raw-inserts X → S. S's identity lock runs concurrently. The sweep is off.

1. **L.** The guard physically locks S and V `FOR UPDATE`. S's identity-lock `UPDATE` must take S's row (`trg_instrument_lock_on_write` → physical `lock_instrument(S, UPDATE)`, plus the executor's own tuple lock), so it **waits** on L.
2. **M.** The guard physically locks X and S and **waits** on L for S.
3. **After L commits**, one of two orders follows:
   - **M first.** M reads S `DRAFT` ⇒ refused (P2). Then S's identity lock commits.
   - **S's identity lock first.** M reads S `IDENTITY_LOCKED` and is admitted. L's S → V is already committed, so every later `B(X)` contains V.
4. **X's classification** needs X `IDENTITY_LOCKED` (step 2A, under X's physical lock). It therefore never classifies `NON_SECURITY` with a `B(X)` that omits V.

- The premises hold under real row locks, whatever the tracker says:
  - **P1:** the source is `DRAFT` at link time, under the source's lock;
  - **P2:** the target is non-`DRAFT`, under the target's lock;
  - **P3:** a classified instrument is `IDENTITY_LOCKED`.
- Classification only on `IDENTITY_LOCKED` is a SQL invariant (rule 24).
- **No sweep dependency** (T-LIN-41, T-LIN-42).

**Round trip / `RETIRED` (05 l.464, 01 l.122, 02 W13, T-FPR).**
- The "record `UNRESOLVED` between hops" route is scoped to `IDENTITY_LOCKED` instruments.
- For `RETIRED`, v1.8 says that route does not exist (step 2A), and that B6 already denies every subject.
- A second hop that returns a retired member's fingerprint to its stale record's value is refused by the deferred constraint, permanently for that asset.
- No replacement workflow is invented.
- **Correct and fail-closed.**

## 20. Latest / newest / current / most-recent audit

- Hits added v1.7 → v1.8: 01 +2, 04 +1, 05 +7, 10 +3 (python diff of matched contexts). Every added hit is one of:
  - "the repository's **current** single-superuser migration identity";
  - "recompute the **current** immutable `payload_hash`";
  - "a `RETIRED` instrument with a **current** record" (max `record_seq`);
  - "No '**latest** rebaseline', no timestamp ordering";
  - "under the **current** major M" (a test).
- **None is a recency choice on a caller-suppliable value.**
- Major-version rebaseline is exact-key (§15).
- Every security-sensitive ordering is unchanged from v1.7: `record_seq`, `global_seq`, `merge_global_seq`, `evidence_global_seq`, same-instrument `marker_global_seq`, `attestation_seq`, DB `clock_timestamp()` token expiry.

## 21. OQ-8

**OPEN / UNDECIDED / NON-BLOCKING** (17 l.31, l.74; README). Not resolved. F42–F45 do not touch the correction of a `DRAFT` typo.

## 22. Task metadata — TM-R8-1 (not modified)

- `task.json`:
  - `state: IDLE`;
  - `acceptanceStatus: NOT_ACCEPTED`;
  - `PLAN_READY` absent;
  - `validateTaskManifest` ⇒ ok.
- **`findingsSummary` is correct for v1.8 as submitted.** Open: HIGH 3 = F02, F05, F17; MEDIUM 1 = F21; LOW 4 = F42–F45. These match the severities recorded in R1 (F02, F05), R2 (F17, F21) and R8 §16 (F42–F45 LOW). F38/F40 closed and F41 superseded are correctly absent.
- **`roundCounts` `{review: 1, remediation: 1}` left unchanged.**
  - The conductor derives `roundCounts` from the runtime task record (`aix-conductor/src/records.ts:103`, `{...record.rounds}`).
  - AST-01 is **not registered** in conductor runtime state (`state/`, `records/`: no AST-01 entry).
  - Raising the counters by hand would assert transitions the conductor never recorded.
  - The validator accepts the manifest as it stands.
  - **Leaving them unchanged is governance-consistent.** The residual is **task-metadata precision**, not a security finding: the manifest under-counts manual rounds R1–R9 and v1.1–v1.8. It should be reconciled when, and only when, the task is registered with the conductor.
- **After this review**, the next checkpoint should record:
  - F42–F45 closed;
  - F46 open (LOW);
  - F02/F05/F17/F21 external.
- **This review changes nothing in `task.json`.**

## 23. External gates and DCR-AST1-010

| Gate | Status | Blocks |
|---|---|---|
| F02 / DCR-AST1-004 | external, honestly stated (17 §2) | go-live; consumer blueprints |
| F05 / DCR-AST1-001(a)+(d) | external | enabling governed classification apply (P3) |
| F17 / DCR-AST1-002(7) | external | real token-deposit go-live |
| F21 / DCR-AST1-008(c), OQ-6 | external | go-live; MYR/fiat-pair consumer blueprints |
| **DCR-AST1-010** (new) | external, platform/DBA-owned, recorded and **not implemented** (no platform file changed) | **AST-01 P1 implementation**, via `AST-P1-MIGRATION-IDENTITY-GATE`. Not blueprint acceptance |
| Event-trigger installability (05 §2.2.9) | P1 STOP gate, unchanged | P1 implementation |

**DCR-AST1-010 does not block this blueprint acceptance.** The design binds the security model to the real identity, the STOP gate is concrete and testable (T-ADR-24/28), and there is no fallback. It **does** block P1: today's repository runs migrations as one superuser identity, and that would fail the gate.

---

## 24. Findings (open after this review)

Severity uses the `OPEN_FINDINGS` vocabulary.

### AST-01-F46 — LOW — v1.8 precision residuals: one stale F42 parenthetical and five fail-closed freeze-mechanism precision items (new; non-blocking)

- **Evidence:** §5, §9, §10, §12, §13; probes Q3, Q4, Q7, Q8.

| Item | Evidence | Why it is only LOW |
|---|---|---|
| **(a)** Stale "no SQL lock" | 05 l.1097: the `trg_asset_class_frozen` asset re-lock is described as "no SQL lock, no level check, no `AS006`" | Contradicted by rule 22, l.948, l.997, l.462, l.981, W13, T-LOK-07(i) and T-LOK-12(b). The helper is single-implementation. Editorial |
| **(b)** `pg_temp`-first type capture | Rule 28(a) / l.164 pins `search_path = pg_catalog`. The identity `CHECK` (l.243) forces an unqualified `(text)`. Q3: a session temp type `text` makes `to_regprocedure` return NULL | Fail-closed (`RULE_FUNCTION_MISSING` / `IDENTITY_UNRESOLVED` / DDL abort), confined to the attacker's own session. No misroute (step-3 signature check plus digest) |
| **(c)** Event triggers not `ENABLE ALWAYS` | T-ADR-23 asserts `evtenabled = 'O'`. Q7: `'O'` does not fire under `session_replication_role = replica`. Freeze-table registration and immutability triggers are also unspecified as `'A'` | The boundary forbids the GUC to the migration identity (requirement (7), T-ADR-24(7)). It is inconsistent with the stated `'A'` rationale for the identity-table triggers (T-ADR-31(d)) |
| **(d)** Digest depends on session GUCs | Q4: `quote_all_identifiers = on` changes `pg_get_functiondef`. Exact `proconfig = {search_path=pg_catalog}` forbids pinning it | Fail-closed `DIGEST_MISMATCH`. A registration under the non-default value would permanently brick that immutable pair |
| **(e)** `PG_CATALOG` kind not namespace-bound | `approved_primitive` (l.214–229): no `CHECK` or verification that a `PG_CATALOG` row resolves into `pg_catalog` | Requires an error in the privileged, human-approved bootstrap install. `FROZEN_BOOTSTRAP` is correctly owner-bound |
| **(f)** `DEFERRABLE` backstop | l.374/375: `DEFERRABLE INITIALLY IMMEDIATE` and "the statement aborts". Q8: any session can defer it to `COMMIT` | Still enforced at `COMMIT`. A non-canonical row never persists |

- **Affected sections:** 05 rule 28, §2.1 (l.102–107), §2.2.1a (l.164–184), §2.2.0 requirement (5) wording, §2.2.4, §2.2.5 (`approved_primitive`, `address_rule_version` `CHECK`), §2.2.9, §2.2.12, §7A "Asset class correction apply" step 5; 08/09 reason names (05 step 0(c) names `UNAPPROVED_TRIGGER` but not `ENFORCEMENT_TRIGGER_DISABLED`, which 09 and T-ADR-31(e) use); 10 T-ADR-23/25/29/30/31.
- **Required correction:** binding at P1 implementation review; to be corrected in text by any later blueprint revision.
  - **(a)** Replace "no SQL lock" at l.1097 with the PHYSICAL-LOCK-ALWAYS wording used at l.981.
  - **(b)** Pin bootstrap functions to `SET search_path = pg_catalog, pg_temp`, with the inventoried `proconfig` updated to match, **or** store and resolve identities with `pg_catalog.text`. Add the temp-type case to T-ADR-29/30.
  - **(c)** Create both event triggers `ENABLE ALWAYS` and the freeze-table registration/immutability triggers `'A'`. Have assertion step 0 (or sweep S10) verify `evtenabled`/`tgenabled`. Update T-ADR-23.
  - **(d)** Make the digest independent of session deparse GUCs. Either pin `quote_all_identifiers = off` (and any other deparse-relevant GUC) on the digest helper and allow exactly that in its inventoried `proconfig`, or refuse registration and assertion under a non-default value. Add a T-ADR case.
  - **(e)** Add `CHECK (primitive_kind <> 'PG_CATALOG' OR object_identity ~ '^(function|operator) pg_catalog\.')` and verify at registration that every `PG_CATALOG` primitive resolves into `pg_catalog`.
  - **(f)** Make `trg_instrument_address_final` `NOT DEFERRABLE`, or restate "aborts" as "aborts the statement, or the transaction at commit if deferred". Name `ENFORCEMENT_TRIGGER_DISABLED` in step 0(c).
  - Optional hardening, not required: `$1::pg_catalog.text` in the dispatcher call and an ambiguous-overload case in T-ADR-30(d) (probe Q2).
  - Optional hardening, not required: guard relevance filtering for non-AST, non-superuser DDL identities (§10).
- **Implementation impact:** P1 function definitions and configuration, one `CHECK`, test additions. No architecture, lock-order, schema-shape or eligibility change.
- **Human decision:** No.
- **Blocking:** No. Every item fails closed or is editorial. None lets a security-sensitive read or mutation run without its control, and none breaks the role-separation boundary.

## 25. Implementation authorisation

**None.**
- This `ACCEPT` is blueprint/architecture acceptance only.
- It is subject to the human/conductor `approve-plan` checkpoint.
- **AST-01 P1 remains blocked** by `AST-P1-MIGRATION-IDENTITY-GATE` / DCR-AST1-010 and by the event-trigger installation gate (05 §2.2.9).
- `PLAN_READY` must not be set by any author or reviewer.
- No acceptance record is created and nothing is merged.

## 26. Carried into the P1 implementation review

1. F46(a)–(f) (§24), as binding acceptance items.
2. DCR-AST1-010: the real migration identity and a separate bootstrap path, proven by T-ADR-24/28 as that identity.
3. Event-trigger installability and T-ADR-22.
4. The parse-tree walker against the T-ADR-25 object-set criterion, default-deny.
5. TM-R8-1: reconcile `task.json` `roundCounts`/`findingsSummary` only through recorded conductor transitions.

---

AIX AST-01 v1.8 SEPARATE-CONTEXT RE-REVIEW:
ACCEPT — IMPLEMENTATION NOT AUTHORISED
