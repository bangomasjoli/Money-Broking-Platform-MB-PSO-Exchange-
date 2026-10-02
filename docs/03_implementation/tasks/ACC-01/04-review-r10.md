# 04 Review (round 10) — ACC-01: Account Structure blueprint pack v0.10

- **Task ID:** ACC-01 (planning task — blueprint pack, no implementation)
- **Reviewer:** independent high-risk architecture / PostgreSQL security / governance reviewer / claude-opus-5-5 / HIGH
- **Pack under review:** `docs/02_modules/ACC-01/blueprint/v0.10/` at `87af6940db4b91ba8e547ff9fe502047dd93e3a9`. This is the remediation of `04-review-r9.md` (R9-F01 MEDIUM, R9-F02 LOW, R9-F03 INFO), after the procedural checkpoint `8f93da6`.
- **Author of v0.10:** blueprint planner (per the `87af694` commit). The reviewer is not the remediation author.
- **Independence:** **separate context.**
  - This review ran in a **new Claude Code session**. It carried no conversation from any authoring, remediation, checkpoint or earlier review session.
  - The primary technical adjudication (§4–§12) was derived from:
    - the complete v0.10 text, and the v0.9 → v0.10 diff of all 18 files;
    - `04-review-r9.md` (for the finding definitions only), `06-human-decision-r9.md` and `task.json`;
    - `docs/OPEN_FINDINGS.md` and the IAM-02 routes;
    - the local `aix-conductor` (read-only);
    - a disposable PostgreSQL 17.10 scratch cluster (§13).
  - `05-remediation-r9.md` was **not** used as evidence. It was opened only **after** the independent pass was finished, for two limited purposes: its §2 list of author-introduced design choices (each attacked in §9), and its §1 procedural record (cross-checked against `task.json` and the conductor in §16).
- **Decision:** **ACCEPT** (blueprint / architecture only)
- **Implementation authorised:** **No.**
  - This review does not create human acceptance.
  - No `06-acceptance.md` exists or is created.
  - This review does not modify `task.json`.
  - `PLAN_READY` is not set.

## 1. Baseline verification (all passed)

| Check | Result |
|---|---|
| Worktree | `/Users/AimanRahimi/AIX-worktrees/acc-01` (the main checkout `/Users/AimanRahimi/AIX-Full-Compliance` was not used) |
| `git fetch origin --prune` | Done before review |
| Branch | `module/ACC-01` |
| `HEAD` / `origin/module/ACC-01` | Both `87af6940db4b91ba8e547ff9fe502047dd93e3a9` |
| Working tree | Clean (`git status --short` empty) before this review |
| `main` / `origin/main` | Both `43f2f34a1640dde2934c591342abfc7b14e0082c`. Nothing is merged |
| `87af694` parent | `8f93da675b643c5a3a17ff00d2506d24cbe21e32` — exactly one commit after the round-9 checkpoint |
| `87af694` changed paths | `docs/02_modules/ACC-01/README.md`; `docs/02_modules/ACC-01/blueprint/v0.10/**` (18 files); `docs/03_implementation/tasks/ACC-01/05-remediation-r9.md`; `docs/03_implementation/tasks/ACC-01/task.json`. Nothing else |
| Historical packs | `git diff e506e69 HEAD` is empty for every one of `blueprint/v0.1` … `v0.9`. Each pack's last commit is its own authoring commit (`42316fe`, `8ff4e9d`, `194aff0`, `a865d63`, `826ab45`, `aa66084`, `0d7cfb0`, `e30cf8d`, `e506e69`). All remain unmodified historical evidence |
| Branch scope since `43f2f34` | 0 paths outside `docs/02_modules/ACC-01/**` and `docs/03_implementation/tasks/ACC-01/**` |

## 2. Scope

Reviewed in full:

- v0.10 file 05 (database design), all 972 lines;
- file 10 §24 (T-401…T-431) in full;
- the rewritten T-320, T-361, T-369, T-390, T-391 and T-396;
- the README.

Reviewed as diff against v0.9: files 01, 02, 03, 04, 06, 07, 08, 09, 11, 12, 13, 14, 15, 16 and 17.

Every line removed from v0.9 was checked to be replaced by an expanded statement, not silently dropped. Files 03, 07, 08, 13, 15 and 16 change only their version label.

Prior human decisions, treated as approved and binding and **not reinterpreted**:

- ACC-R2-HD-01…08
- ACC-R3-HD-01…03
- ACC-R4-HD-01…02
- ACC-R5-HD-01

`06-human-decision-r9.md` is procedural only. It records the procedural question, and no design decision.

## 3. v0.9 → v0.10 diff — what actually changed

| Area | Change (v0.10 text) |
|---|---|
| 05 §1 rule 8 | `TEMPORARY` deliberately **not** revoked; temporary relations are declared "attacker-controlled but irrelevant" |
| 05 §1 rule 10, §5.7 (new) | Every ACC-01 function uses `SET search_path = pg_catalog, acc1, pg_temp` **and** schema-qualified `acc1.<name>` relations (rules N1–N8), with a function inventory |
| 05 §2.4 | Applied maker-only `CHECK` now includes `approval_id_source IS NULL` |
| 05 §2.4.2 | Lifecycle step (5): the completeness proof |
| 05 §2.4.3 | `required_attesters` exactly-once semantics, with bidirectional equality |
| 05 §2.9 | `UNIQUE (seal_pin_id, readiness_id)` |
| 05 §5 table | `trg_acc1_status_history_ins`/`_upd` and `trg_acc1_restriction_version_ins`/`_upd` pairs |
| 05 §5 table | Named `trg_acc1_restriction_cancel_recheck` |
| 05 §5 table | New `trg_acc1_initiation_apply_complete` (I1), `trg_acc1_initiation_family_scope` (I2), `trg_acc1_initiation_history_scope` (I3) and `trg_acc1_family_member_window` |
| 05 §5 table, §5.4 rule F | Predicate (1)(c): no abort in the transaction that applied the initiation |
| 05 §5.3 | Timing inventory, with the clock-based exception |
| 05 §5.6, §5.6.1 (new) | Initiation-completeness proof I-1…I-6 |
| 05 §6, §7 (rules 5z, 5aa), §8 | Functions, data rules, migration requirements |
| 01 | ACC-REQ-065, -066; -063/-064 extended |
| 02, 04, 06, 09 | Matching statements; new `ACC1_CLOSURE_INITIATION_INCOMPLETE`; `ACC1_CLOSURE_ABORT_INVALID` extended |
| 10 | Six historical tests rewritten or extended; §24 (T-401…T-431) added |
| 11, 12 (rows 56–58), 14, 17 §4.10, README | Matching statements |

## 4. R9-F01 — re-adjudicated from scratch: **CLOSED IN BLUEPRINT**

**The rule as specified.** 05 §1 rule 10 and §5.7 N1–N8:

- **Path.** Every function the ACC-01 migration creates is created with `SET search_path = pg_catalog, acc1, pg_temp`, exactly those three elements, `pg_temp` explicit and last. That covers every `trg_acc1_*` function (both members of each split pair), the `SECURITY DEFINER` restriction function, `fn_acc1_abort_set_proof`, `fn_acc1_initiation_proof` and the shared abort-branch predicate. No `public`, no `"$user"`.
- **Qualification.** Every `acc1` relation is qualified in every access form: `FROM`, `JOIN`, `INSERT`, `UPDATE`, `DELETE`, `FOR SHARE/UPDATE`, `LOCK TABLE`, `%ROWTYPE`, subqueries.
- **Both controls are required** (N3).
- **No dynamic SQL**, and every helper call is qualified (N4).
- **Definer specifics** (N5).
- **Temporary relations are irrelevant**; the tests run with `TEMPORARY` granted and revoked (N6).
- **`CHECK`s and defaults** use only built-ins (N7).
- **The session path cannot override** the function attribute (N8).

**Inventory completeness.** Every trigger named anywhere in the 05 §5 table appears in the §5.7 inventory:

- the immutables, `trg_acc1_sa_owner`, `trg_acc1_status_transition` and `trg_acc1_recovery_bind`;
- the history pair, `trg_acc1_append_only`, `trg_acc1_restriction_terminal`, `trg_acc1_default_protected` and `trg_acc1_seal`;
- `trg_acc1_readiness_insert`, `trg_acc1_attestation_bind`, the E1–E3 scopes, `trg_acc1_change_request_status` and `trg_acc1_change_request_immutable`;
- `trg_acc1_family_abort_guard`, `trg_acc1_history_stamp`, `trg_acc1_pin_stamp`, `trg_acc1_counter_guard`, `trg_acc1_seal_pin_bind` and `trg_acc1_seal_pin_complete`;
- `trg_acc1_restriction_cancel_recheck`, I1–I3, `trg_acc1_family_member_window`, `trg_acc1_closure_family`, `trg_acc1_master_default_invariant` and `trg_acc1_family_membership`;
- the restriction-version pair and `trg_acc1_pin_readiness_window`.

`trg_acc1_closure_barrier` is correctly recorded as folded into the guard.

The inventory is declared "a baseline, not a limit". T-401 derives the actual set mechanically, as every function in schema `acc1` plus every `pg_trigger.tgfoid` on an `acc1` table, and requires it to equal the inventory. A helper omitted from the text therefore fails the catalogue test. One relation-list imprecision is recorded as R10-F01.4; N2 covers it regardless.

**Attacks (each probed or adjudicated):**

| # | Attack | Result |
|---|---|---|
| 1 | `TEMPORARY` retained by the runtime role | Irrelevant under N1+N2. Probed with `has_database_privilege(..., 'TEMPORARY') = t` (§13 N-1) |
| 2 | Fresh-session temp shadowing | **Defeated.** In a fresh runtime session, shadow `subaccount` and `closure_recovery` were created and granted to `PUBLIC` before any trigger ran, with session path `pg_temp, public, acc1`. The restriction `INSERT` bumped the **real** row 4 → 5 (shadow stayed 4). A forged temp recovery row did **not** satisfy the abort branch (`ACC1_CLOSURE_RECOVERY_INTEGRITY`, n = 0) |
| 3 | Warm-session / cached plans | Qualification binds a plan to the `acc1` relation OID, so a cached plan cannot point at a shadow. The pinned path makes the first resolution `acc1`. The pack's test design keeps the fresh-session position primary, and T-409 adds the warm variant (`04-review-r9.md` §19 observation preserved) |
| 4 | Session `search_path` changes | `proconfig` replaces the session path for the call. Probed: session path `pg_temp, public, acc1` had no effect |
| 5 | `%ROWTYPE` / composite capture | Probed: `DECLARE r subaccount%ROWTYPE` resolves to **`acc1`** under the pinned path, and to **`pg_temp_7`** without it. N2 additionally requires `acc1.<name>%ROWTYPE`. Both controls are effective |
| 6 | Function / operator capture | PostgreSQL never searches `pg_temp` for functions or operators. Probed: an unqualified call to a `pg_temp` function → "function does not exist". The runtime role has no `CREATE` on `public` or `acc1` (probed). `pg_catalog` is first, so built-ins cannot be shadowed. No user-defined operator is used |
| 7 | `SECURITY DEFINER` ownership / `EXECUTE` | Owner role, `EXECUTE` revoked from `PUBLIC`, not granted to the runtime role (probed `has_function_privilege = f`). The trigger still fires (a trigger is not `EXECUTE`-checked) |
| 8 | `public` / `$user` entering resolution | Excluded by N1. T-401 parses `proconfig` and fails on any extra element |
| 9 | A helper or proof procedure omitted | Covered by the N1 wording ("every helper or proof procedure"), the catalogue derivation in T-401 and the source lint with a negative control in T-402 |
| 10 | Prose that permits an unqualified relation | **None found.** Sweep: the only remaining `pg_catalog, acc1` without `pg_temp` appear as "withdrawn" statements. Every illustrative fragment in 05 (e.g. `UPDATE acc1.<target> SET updated_at_utc …`) is qualified. N2 enumerates the permitted unqualified identifiers exhaustively |
| — | Casts, dynamic SQL, trigger `WHEN`, `CHECK`, defaults | No dynamic SQL (N4, T-402). Trigger `WHEN` and `CHECK` expressions are stored as parsed trees with resolved OIDs. Defaults use `pg_catalog` built-ins only (N7). Types used (`varchar`, `jsonb`, `xid8`, `uuid`, `timestamptz`) are in `pg_catalog`, first on the path |

**Control independence (T-410), probed:**

| Variant | Result |
|---|---|
| Pinned without qualification | Real row touched |
| Qualified without the `SET`, under session path `pg_temp, …` | Real row touched |
| **v0.9 form** `pg_catalog, acc1` with unqualified relations | **The shadow is touched and the real version does not move** |

The claim "each control suffices alone; both required for edit-resilience" is accurate.

**Disposition:** R9-F01 required corrections 1–3 (normative rule for every function, the `TEMPORARY` statement, and fresh-session catalogue and shadow tests) are all present and coherent. **R9-F01: CLOSED IN BLUEPRINT.**

## 5. R9-F02 — re-adjudicated from scratch: **CLOSED IN BLUEPRINT**

### 5.1 I1 / I2 / I3 completeness

**Forward direction (applied initiation ⇒ effect)** holds, from I-1…I-6:

- I-1: the request is applied in this transaction, maker-only, with the `CHECK` and `result_ref`.
- I-2: every `t ∈ T` is live in `closing`/`closure_sealed`/`closed` with `close_change_request_id = X` (and `closure_family_id = X` for family targets).
- I-3: exactly one history row per `t`, with coherent versions.
- I-4: the family with id `X`, the right master and client, and status `open`/`completed`.
- I-5: `SNAP = HIS = LIVE`, plus every non-`closed` child in the snapshot.
- I-6: `independent_preserved` untouched.

| Attack | Refused by |
|---|---|
| Applied with zero closing target | I-2 (probed A) |
| Target closing under wrong request / wrong `close_change_request_id` | I-2 |
| Wrong `result_ref` | I-1 |
| Missing history | I-3 |
| Duplicate filter-matching history | I-3 "exactly one" (probed I) |
| Wrong `created_xact_id` | Stamped by `trg_acc1_history_stamp`, not caller-writable |
| Wrong `version_before`/`_after` | I-3 coherence |
| Stale / earlier-transaction request | I-1 `applied_xact_id` (probed H1) |
| Family without an applied initiation | I2 → I-1 (probed R2) |
| History without an applied initiation | I3 → I-1 |
| Family with an incomplete transition set | I-5 (probed S) |
| Rows in a different order | The proof is order-independent; wrong orders fail closed (rule E needs the family before the master's entry; the window needs members before it) |
| Replay / double apply | The status guard makes the request terminal. A second request for an already-`closing` target has no effect → I-2 |
| Idempotent replay after partial failure | Nothing persists from a refused commit |

**Independence.** The three entry points are separate constraint triggers on three different tables. I1 fires with no family or history row; I2 and I3 fire with no applied request. T-423 tests each with the others disabled by the **test-only** owner (§11).

**Reverse direction (evidence row ⇒ real initiation).**

- A raw family or history row **without** an applied same-transaction request is refused (probed).
- **One precision gap.** The proof is anchored on `X`, not on the row that fired I3. A forged `closure_initiation` history row that cites a **genuinely** applied same-transaction `X` but:
  - names a target outside `T` (independent initiation), or
  - does not match the I-3 filter (e.g. `to_status = 'closed'`)

  is not counted by I-3 and **commits** (probed FH1/FH2).
- No safety property depends on it: I-2 and I-5 read the live rows, so a forged row cannot substitute for a missing transition. The pack already accepts raw history rows of other cause types; only `closure_abort` (E2) and the seal-bound row are reverse-guarded.
- The 05 I3 row overstates the claim ("a raw `closure_initiation` history row … cannot commit"). Recorded as **R10-F01.1 (INFO)**, not blocking.

### 5.2 Master family-set proof

| Attack | Result |
|---|---|
| Exactly one master / one default | I-4 and `trg_acc1_family_membership` |
| Wrong master (`master` row naming another target) | **Refused indirectly but soundly.** `LIVE` contains the real master (rule E (ii) needs no member row). Any subaccount in `LIVE` entered through rule E (iii), which requires membership `default`/`master_directed_child`. `UNIQUE (closure_family_id, target_id)` gives a target one membership. So the `master` row's target can only be in `LIVE ∩ SNAP` if it is the master itself; otherwise `SNAP ≠ LIVE` |
| `default` label on a non-default child | Not bound to `is_default`. Cosmetic only, because default protections key on `is_default` → R10-F01.3 (INFO) |
| Omitted child | I-5 completeness and `trg_acc1_closure_family` (probed O) |
| Extra child / child of another master or client | `SNAP ≠ LIVE`. Rule E (iii) is bound to "this row's master"; composite FKs bind the client |
| Duplicate member | `UNIQUE (closure_family_id, target_id)` |
| Wrong / stale / second family | I-4 id = `X`; I-2 `closure_family_id = X`; a second family under the same id is impossible (`UNIQUE`) |
| Member changed between proof executions | Append-only plus `trg_acc1_family_member_window` (probed J, W) |
| Child created during the transaction | `trg_acc1_sa_owner` after the master leaves operational. Before that it must be in the snapshot |
| Closed child | May be absent. If listed `master_directed_child` it is not in `LIVE` (refused); if listed `independent_preserved`, `trg_acc1_family_membership` refuses (needs `closing`/`closure_sealed`) |
| Master-directed member left operational | I-2/I-5 (probed S) |
| Member entered under another initiation | I-2/I-5 (`close_change_request_id = X`) |
| Family open / completed / aborted | I-4 admits `open`/`completed`. `aborted` queues E4, whose S4 cannot hold for a `closing` target |
| Master forward progress / completion | Stays within the I-2 status set; I-4 admits `completed` |

The relationship among the six tables is sufficient: `closure_family`, `closure_family_member`, `master_account`, `subaccount`, `account_status_history` and `account_change_request`.

### 5.3 `independent_preserved`

v0.10 does **not** do any of the following:

- force it to close under the master request (I-6 refuses `close_change_request_id = X`);
- move it into `HIS`/`LIVE` (I-6);
- rewrite its `close_change_request_id` (class P; rule E (iii) refuses `independent_preserved`);
- assign it `closure_family_id` (I-6 requires NULL);
- return it in a master abort (S2 unchanged).

Its later independent abort rights are untouched:

- the I-proof runs only in the initiating transaction (every entry point requires `applied_xact_id` = current);
- predicate (1)(c) is scoped to **that member's own** `OLD.close_change_request_id`, applied in an earlier transaction.

ACC-R3-HD-01, ACC-R4-HD-01 and ACC-R5-HD-01 hold. A mixed family (default, master-directed child, `independent_preserved` closing) committed in probe M0.

### 5.4 Deferred trigger / savepoint adversarial pass (PostgreSQL 17.10, §13)

| Case | Result |
|---|---|
| A. apply → `COMMIT` without closing | Refused at `COMMIT` |
| B. apply → `SAVEPOINT` → closing → `ROLLBACK TO` → `COMMIT` | Refused |
| C. `SAVEPOINT` → apply + closing → `ROLLBACK TO` → `COMMIT` | Commits, empty; the event is discarded with the subtransaction |
| D. apply → `IMMEDIATE` before closing | Refused at the `SET` |
| E. complete → `IMMEDIATE` → same-transaction abort | Refused immediately (`ACC1_CLOSURE_ABORT_INVALID`). **Control (refusal disabled, test-only):** the regress commits an applied initiation over an operational target. With the refusal disabled but **no** early `IMMEDIATE`, I1 still refuses at `COMMIT`. So (1)(c) is exactly what closes the early-firing window |
| F. complete inside a savepoint → early pass → `ROLLBACK TO` → `COMMIT` | **Re-fires and refuses.** PostgreSQL un-marks an event fired inside an aborted subtransaction |
| G. early pass → forward progress (`closing → closure_sealed`) | Commits; stays in the I-2 set |
| H. early pass → family mutation | `open → aborted` queues E4 (S4 fails for a `closing` target). Members are append-only and windowed |
| I. early pass → history insertion | A fresh I3 event refuses the duplicate (probed) |
| J. early pass → member insertion | Window refuses immediately (probed) |
| K. multiple queued events for one `X` | Read-only and idempotent; the retry path commits |
| L. nested savepoints (apply; `SAVEPOINT a`; `SAVEPOINT b`; closing; `IMMEDIATE`; `RELEASE b`; `ROLLBACK TO a`) | Re-fires and refuses |
| M. `IMMEDIATE` then `DEFERRED` | A later insert's event is deferred to `COMMIT` and refuses there |
| N. PL/pgSQL `EXCEPTION` block swallowing the closing `UPDATE` | Refused at `COMMIT` |

**Key question: can an early pass regress silently?** **No.** Each asserted fact is one of the following:

- **Terminal:** the request.
- **Append-only, with a fresh event on insert:** history.
- **Class-P:** counters and pointers.
- **Exit-guarded:** status, by (1)(c) and rule F.
- **Re-queued:** the family (E4).
- **Windowed:** members.
- **Owner-gated:** new children.
- **Monotone:** version.

A rollback that removes facts re-queues the event. This matches the 05 §5.6.1 table.

**Disposition:** the forward requirement of R9-F02 (option (a)) is met, the savepoint test exists (T-413/T-414), and the reverse entry points work. The remaining precision is INFO. **R9-F02: CLOSED IN BLUEPRINT.**

## 6. R9-F03 — six corrections: **ALL COHERENT** (two INFO cross-reference residues)

| # | Item | Result |
|---|---|---|
| 1 | Status-history DDL | `_ins` = `AFTER INSERT`, no `WHEN`; `_upd` = `AFTER UPDATE OF status … WHEN (OLD.status IS DISTINCT FROM NEW.status)`; one function, `TG_OP` only in the body. **Probed:** the v0.9 forms fail (`column "tg_op" does not exist`; "INSERT trigger's WHEN condition cannot reference OLD values"), the pair is created, `INSERT` fires `_ins`, and `SET status = status` fires nothing. No duplicate history (no overlapping events) |
| 2 | Restriction no-op | Same pair shape on `account_restriction`. **Probed:** `INSERT` +1 (4→5), `SET status = status` +0, a real status change +1 (5→6). The rule A wording "any owner-context `updated_at_utc`-only `UPDATE` is a touch, upward-only" is stated |
| 3 | Clock recheck | Named `trg_acc1_restriction_cancel_recheck`; in the §5.3 inventory; explicitly **not** "correct whenever it fires"; statement-time check authoritative; deferred check only narrows; `SET CONSTRAINTS` behaviour stated honestly. Whole-pack sweep: every other "correct whenever it fires" phrase refers to a read-only proof. No contradiction (DC-4, §9) |
| 4 | Required attesters | Non-empty; unique `attester_module` and `readiness_id`; duplicate payload refused; count equality; payload → rows **and** rows → payload; hash is evidence only (§2.4.3, T-427). **Residue:** §2.4.3 says a duplicated payload is refused "by `trg_acc1_seal_pin_bind` (§5.5 step 9)", but §5.5 step 9 does not list the distinctness test. Safety holds regardless, because `[A,A]` vs rows `[A,B]` fails (iii) in `trg_acc1_seal` and `trg_acc1_seal_pin_complete` → R10-F01.2 (INFO) |
| 5 | Maker-only `CHECK` | **Probed:** the applied maker-only row is accepted only with `entitlement_evidence_ref`, `actor_assertion_authority`, `sec_audit_ref` and `result_ref` non-null **and** `approval_id`, `approval_id_source`, `approver_user_id` and `approval_policy_id` all NULL. Each of the four populated alone is refused; a missing maker field is refused; a `requested` row with everything NULL is accepted. The `requested_by NOT NULL` actor evidence is unchanged |
| 6 | T-320 / T-361 | (i) A raw write of a protected column is refused by `42501` (runtime) or Rule 0 (owner) and never reaches the abort branch. (ii) The abort branch is exercised only by a status `UPDATE` without this target's recovery row. T-429 discriminates the error codes |

## 7. R8 non-regression

| Finding | Result |
|---|---|
| **R8-F01** | Holds. The protected set is unchanged, with no runtime privilege on it (§6 grant text unchanged). The immediate guard has no `OF`/`WHEN`. There is one `OLD.version + 1`. No rewind. `status = status` gives 0. Restriction change gives exactly +1 (now also +0 on a restriction no-op). The rule F abort branch gains (1)(c), which **only adds** a refusal |
| **R8-F02** | Holds. The pin is legal only inside its own seal; the stored payload is authoritative; the caller cannot cure staleness; ownership classes are unchanged; the deferred orphan proof and savepoint behaviour are unchanged. Strengthened by `UNIQUE (seal_pin_id, readiness_id)` |
| **R8-F03** | Holds. `INSERT requested` → `UPDATE applied`; no checker; evidence conditional on `applied` (now with the complete NULL set); direct `INSERT applied` refused; the seal keeps its checker (T-393) |
| **R8-F04** | Holds. Timing precision is improved (the clock exception is inventoried); `xid8` is correlation only; runtime non-ownership (with `TEMPORARY` now explicitly addressed); references pre-allocated; request id immutable; `updated_at_utc` non-security |

**`xid8` note for (1)(c).** After a logical dump/restore, an old initiation's `applied_xact_id` could coincide with one future `pg_current_xact_id()`. An abort of that one target in that one transaction would then be refused. That is fail-closed, and a retry succeeds. This is within R8-F04.2's stated "correlation only" posture, not a regression.

## 8. Prior human decisions — regression check

| Decision | Result |
|---|---|
| ACC-R2-HD-01…08 | **Hold.** No change to dependency evidence, configuration, peer credentials or environment rules |
| ACC-R3-HD-01 (family semantics) | **Holds.** v0.10 adds the window (snapshot written before closing, which was already the normative order) and I-4/I-5. Child-before-master sealing, the default-in-closure rules and `trg_acc1_master_default_invariant` are unchanged |
| ACC-R3-HD-02 (maker-only initiation) | **Holds.** No checker is added; the completeness proof is a database atomicity property |
| ACC-R3-HD-03 (authoritative dependency evidence) | **Holds.** `checker_rejected_seal` is still hard-unavailable |
| ACC-R4-HD-01/-02 | **Hold.** `independent_preserved` semantics are unchanged (§5.3). ACC-01 is not registered in the conductor runtime store |
| ACC-R5-HD-01 (target-scoped family recovery) | **Holds.** Abort semantics are unchanged; (1)(c) cannot affect a legitimately approved abort (§9 DC-1) |
| Checker-before-seal, readiness pinning, required-attester equality, strong attester identity, renewable post-seal attestations, master-family atomic completion, abort / recovery reverse proof, closure barriers | **All unchanged**, or strengthened (exactly-once attesters) |

No v0.10 correction conflicts with an approved decision. **No HUMAN_DECISION is needed.**

## 9. Author-introduced design choices — attacked explicitly

These are from `05-remediation-r9.md` §2, read after the independent pass. All five had already been attacked independently above. The record contains no other unflagged design choice.

**DC-1 — same-transaction abort prohibition. Sound; mechanical; no human decision.**

- **Technically necessary.** Probe E′: without it, early `IMMEDIATE` followed by an abort commits an applied initiation over an operational target. PostgreSQL does not re-fire an event that passed.
- **Correctly scoped** to THIS initiation. It reads the request named by the row's own `OLD.close_change_request_id`.
- **No false positive for an unrelated abort** in the same top-level transaction. Probed DC1: an abort of a target initiated earlier, inside a savepoint, alongside a new initiation, committed. `pg_current_xact_id()` is savepoint-stable, so savepoints create no false positive.
- **No approved abort path becomes unreachable.** A legitimate abort needs a checker-approved `abort_closure` payload bound to the post-initiation live `version`/cycle, and that approval is obtained from IAM-02 out of band, after the initiation commits. So it cannot occur in the initiating transaction.
- Master-family abort and independent recovery in a later transaction are unaffected (T-422).

**DC-2 — reverse entry points. Sound, with one precision residue (R10-F01.1).**

- X is identified correctly (`NEW.closure_family_id` / `NEW.cause_ref`).
- Orphans without an applied same-transaction request are refused.
- There are no dependency cycles: all are read-only deferred proofs, and nothing they read is written by them.
- They do not conflict with the legitimate order: deferred, so order-independent within the transaction.
- `WHEN (NEW.cause_type = 'closure_initiation')` and `AFTER INSERT` mean they never fire on historical or non-initiation history.
- Raw inserts fail closed, never into false acceptance of an effect. The residue: forged rows coexisting with a genuine `X` are not row-checked.

**DC-3 — family member window. Sound.**

- **Allowed window:** family `open` **and** master in an operational status.
- **Race-free:** a concurrent transaction cannot see an uncommitted family (FK), and a committed `open` family always has a `closing`-or-later master (I2).
- Raw insertion after closing is refused (probed W, J).
- Savepoints do not reopen it: the window reads the live master state.
- The legitimate order (05 §5.6 step 5 before step 6) is preserved, and `independent_preserved` capture occurs in step 5.
- No member can be appended after an early proof.

**DC-4 — restriction cancel recheck. Sound and consistent** (§6 item 3). It is the one clock-based deferred check; the statement-time check is authoritative.

**DC-5 — `UNIQUE (seal_pin_id, readiness_id)`. Sound.**

- A readiness row belongs to exactly one attester and is pinned at most once per pin. `(seal_pin_id, attester_module)` already gives one row per attester, and `trg_acc1_seal` checks identity equality with the referenced readiness row.
- The same readiness row under a different pin (a later reseal) is unaffected.
- The legitimate readiness/attester model is not invalidated.

## 10. External gates — status

| Gate | Status |
|---|---|
| ACC-01-RF-01 (HIGH) — IAM-02 entitlement / actor binding | **OPEN** (`IAM2-FIND-002` OPEN in `docs/OPEN_FINDINGS.md`, unchanged from `main`) |
| ACC-01-RF-02 (MEDIUM) — mistaken-creation / closability | **OPEN** (`DEP-LED-CLOSURE-CONTRACT`) |
| ACC-01-RF-05 (MEDIUM) — least-privilege credentials | **OPEN** |
| ACC-01-RF-09 (LOW) — freeze ownership | **OPEN** |
| DCR-ACC-IAM-07 / DCR-ACC-IAM-08 / DCR-ACC-FND-02 | **Open.** IAM-02 routes: 7 `app.post`, **0** `GET`, so DCR-ACC-IAM-08 is unmet |
| `DEP-IAM-SEAL-REJECTION-EVIDENCE` | **Hard-unsatisfied**; `checker_rejected_seal` unavailable |
| LED-01 commit ordering | Proven only by LED-01's reviewed implementation |
| Consumer barrier / drain adoption | Open (DCR-ACC-LED-01b/-01e, CONS-01, CFG-01) |
| CFG-01 environment availability | Open; CFG-01 is the sole authority |
| A2-Q1 / A2-Q2 | Open (client-money go-live) |
| IAM2-FIND-002 / FND-FIND-001 | Both **OPEN** (HIGH) |

v0.10 represents every gate honestly: the README section "What the database still does not prove", file 17 §4.10 (c)/(d), and T-431 "not claimed closed". **None is closed by ACC blueprint text, and none is a ground for rejecting the blueprint.**

## 11. Test catalogue T-001…T-431

**Mechanical check.** 431 rows; `001`…`431` contiguous and in order; 0 duplicates; 0 gaps; 0 extras.

**Substance of T-401…T-431:**

- **Name resolution.** T-401 derives the function set from the catalogue (not from the text). T-402 has a negative control. T-403/T-410 include v0.9-form negative controls proving the harness can see the defect. **Fresh-session shadows precede the first trigger execution** (the §24 preamble, §5.7 "Test method"). T-409's warm variant is supplementary, with the fresh position kept primary.
- **Initiation.** T-412…T-416 encode the dangerous sequences (A–F, L, M) and the regress negative control. T-417…T-419 cover the fact-by-fact negatives.
- **Precision.** T-424…T-429 assert real PostgreSQL behaviour, with T-424 also asserting that the invalid DDL fails.
- The tests prove dangerous cases; they do not merely restate the design.

**Test-only controls.** T-416, T-423 and T-410 disable a trigger, or use scratch-schema variants, via the test-only owner. Each is labelled "test-only", "scratch schema, never the migration" or "never part of the migration". 05 §1 rule 8 states that test-only owner roles never exist in a production role set. None becomes a normative production assumption.

**Historical rewrites.** T-320, T-361, T-369, T-390, T-391 and T-396 are consistent with v0.10 (§6 item 6; T-369 adds the shadow and pair statements; T-396 adds `TEMPORARY` true/false).

**Gap (part of R10-F01.1).** There is no test for a forged `closure_initiation` history row coexisting with a genuine same-transaction independent initiation. T-418 covers the non-member row for a master only.

## 12. New findings

Severity uses HIGH / MEDIUM / LOW / INFO. **No new blocking finding.**

### ACC-01-R10-F01 — INFO — Precision residues of the round-9 remediation

None weakens a stated safety property. Each is a blueprint-text precision item for the implementation to resolve; none needs a human decision.

**1. I3 is `X`-anchored, not row-anchored.**

- **Evidence.** 05 §5 I3 row and §5.6.1 I-3: "for every `t` in `T`: exactly one row … with operational `from_status`, `to_status = 'closing'` …". For an independent initiation nothing requires `HIS = T`.
- **Failure mode** (probed FH1/FH2). Inside a transaction that genuinely applies independent initiation `X` of `S`, a raw history row (`S2`, `closure_initiation`, `X`, `active → closing`) commits, and so does a raw row for `S` citing `X` with `to_status = 'closed'`. The I3 row's claim "a raw `closure_initiation` history row … cannot commit" is therefore overstated.
- **Impact.** A forged audit row only. I-2/I-5 still read live rows, rule E (iv) can only refuse, and raw history of other cause types is already not reverse-guarded.
- **Residual.** Blueprint text; the implementation follows it.
- **Minimum correction** (implementation or the next text revision):
  - define `HIS` for **both** initiation kinds as every `closure_initiation` row with `cause_ref = X` and `created_xact_id` = current;
  - require `HIS = T` exactly once, with every such row matching the I-3 field filter (equivalently, I3 proves its firing row belongs to the proven set);
  - add a test.

**2. Attester distinctness cross-reference.** 05 §2.4.3 assigns the duplicate-element refusal to "`trg_acc1_seal_pin_bind` (§5.5 step 9)". §5.5 steps 5/9 do not list it.

- Safety holds through the (i)–(iii) bijection in `trg_acc1_seal` / `trg_acc1_seal_pin_complete`.
- **Correction:** add the distinctness test to §5.5 step 5 or 9 (T-427 already expects step 9).

**3. Snapshot role labels.**

- The `master` label is bound to the family's master **indirectly but soundly** (§5.2).
- The `default` label is not bound to `is_default` by any stated check. A mislabel is cosmetic, because `trg_acc1_default_protected`, the default `CHECK` and `trg_acc1_master_default_invariant` key on `is_default`. Recovery `family_role` would carry the mislabel consistently.
- **Correction:** state in `trg_acc1_family_membership` or I-4 that the `master` member is `closure_family.master_account_id` and the `default` member is the master's `is_default` subaccount.

**4. Inventory relation list.**

- `trg_acc1_recovery_bind`'s `family_completion_unattainable` check ("latest attestation for at least one **pinned** attester") may read `acc1.closure_seal_pin_readiness`, which its §5.7 row does not list.
- This is covered by N2 ("every relation"), the "baseline, not a limit" note and T-401/T-402's mechanical derivation.
- **Correction:** add the relation to the row.

**Human decision required: NO.**

**Totals (new):** BLOCKER 0, HIGH 0, MEDIUM 0, LOW 0, INFO 1 (four items).

## 13. PostgreSQL 17.10 probes performed

A disposable cluster (`initdb` in the reviewer's session scratch directory, localhost TCP only) was created and destroyed afterwards. It used a non-superuser owner `acc1_owner` and a grantee `role_acc1_runtime`. Models were in schemas `acc1`, `ctl` (scratch control variants) and `im` (initiation model). The repository was not touched, and these are models of PostgreSQL semantics, not an instantiation of the blueprint.

| Probe | Result |
|---|---|
| N-1 | `has_database_privilege('role_acc1_runtime','acc','TEMPORARY') = t` |
| N-2 | Fresh runtime session, session path `pg_temp, public, acc1`, `PUBLIC`-granted shadow `subaccount` + `closure_recovery` before any trigger ran. Restriction `INSERT` bumped the real row 4→5 (shadow 4). Forged temp recovery row → `ACC1_CLOSURE_RECOVERY_INTEGRITY (n=0)` |
| N-3 | Restriction pair: `SET status = status` → +0; real change → +1 |
| N-4 | Pinned-only → real touched (7); qualified-only under a `pg_temp`-first session path → real touched (8); **v0.9 form → real unchanged (8), shadow touched** |
| N-5 | `%ROWTYPE`: pinned → `acc1`; unpinned with a `pg_temp`-first session → `pg_temp_7` |
| N-6 | Unqualified call to a `pg_temp` function → "does not exist"; runtime `CREATE` on `public`/`acc1` = f/f; runtime `EXECUTE` on the definer function = f (the trigger still fires) |
| I-A…I-N, I-E′, I-E″ | §5.4 table (all as stated there) |
| H1, R2, FH1, FH2 | Earlier-transaction history and raw family refused; FH1/FH2 forged rows commit under the literal I-3 (R10-F01.1) |
| M0, J, W, O, S | Master family: normal commit with `independent_preserved`; window refusals; omitted child refused; swallowed child closing refused |
| DC1 | An unrelated same-transaction abort (inside a savepoint) beside a new initiation commits |
| F3-DDL | v0.9 `WHEN` forms fail with the two documented errors; the `_ins`/`_upd` pair and the deferred `cancel_recheck` form are created; `SET status = status` fires no `_upd` |
| F3-CHECK | Maker-only applied `CHECK`: 2 accepted (requested; correct applied), 5 refused (each checker field populated, a missing maker field) |

**Limit:** a probe demonstrates PostgreSQL semantics only. That v0.10's text instantiates the model is argued from the text (§4–§6), not from the probe.

## 14. Task / governance status (observed at `87af694`)

| Field | Observed |
|---|---|
| `state` | `PLANNING` |
| `roundCounts` | `planning` 10, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| `resultingCommit` | `null` |
| `PLAN_READY` | Absent; no `06-acceptance.md` |
| `findingsSummary` | BLOCKER 0, HIGH 1, MEDIUM 3, LOW 2; open: RF-01, RF-02, RF-05, RF-09, R9-F01, R9-F02 (pending this review) |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` (`aix-conductor` `dist/records.js`, imported read-only; conductor HEAD `00a7bde`, 0 changed files) |
| Legality of `planning = 10` | `87af694` changed `HUMAN_DECISION_REQUIRED → PLANNING` and 9 → 10. That is the human-authorised over-limit re-entry (`TRANSITIONS.HUMAN_DECISION_REQUIRED` → `PLANNING`, gate `resolve_human_decision`; `maxPlanningRounds` = 3 unchanged), recorded as approved by AimanRahimi ("approve ACC R9 procedural continuation"). `PLANNING → PLAN_READY` is a legal, ungated transition from this state. Runtime store: no ACC-01 record (ACC-R4-HD-02) |

**`task.json` is not modified by this review.**

**What a later HUMAN/GOVERNANCE checkpoint should transcribe** (not performed here):

1. `04-review-r10.md` verdict **ACCEPT** (blueprint/architecture only), added to `relevantRecordPaths`.
2. ACC-01-R9-F01 (MEDIUM) and ACC-01-R9-F02 (LOW) **CLOSED IN BLUEPRINT**, leaving the open list. R9-F03 (INFO) closed. ACC-01-R10-F01 is INFO and, by the existing convention, not counted.
3. `openFindingIds` = ACC-01-RF-01, ACC-01-RF-02, ACC-01-RF-05, ACC-01-RF-09 (all external carry-forward gates). Counts: **BLOCKER 0, HIGH 1** (RF-01), **MEDIUM 2** (RF-02, RF-05), **LOW 1** (RF-09).
4. Any move to `PLAN_READY`, any human acceptance record, and any implementation authorisation (`start_implementation` gate) are separate human/governance decisions. They should weigh that RF-01 (HIGH) and the other gates remain open external dependencies. This review makes none of those decisions.

## 15. Verdict

**ACCEPT.**

- R9-F01 is closed in blueprint.
- R9-F02 is closed in blueprint.
- All six R9-F03 corrections are coherent.
- No material regression was found against R8-F01…F04 or any prior human decision.
- No new blocking finding exists. ACC-01-R10-F01 is INFO and carried for implementation.
- External gates are carried honestly and remain open.

Not ESCALATE: no reviewer or model capacity limit. Not HUMAN_DECISION: no approved decision is in conflict, and DC-1 enforces atomicity mechanically.

---

# ACC-01 v0.10 BLUEPRINT / ARCHITECTURE ACCEPTED

# IMPLEMENTATION NOT AUTHORISED

Reviewer acceptance is architecture review only. It is not human acceptance, does not set `PLAN_READY`, does not create `06-acceptance.md`, does not close any external gate, and does not authorise application code, migrations or a merge.

---

## 16. What this review does not do

It does not:

- modify v0.10 (or v0.1…v0.9), `task.json`, any other module, `platform/**`, the conductor or `main`;
- create v0.11 or remediate;
- create `06-acceptance.md` or any acceptance record;
- set `PLAN_READY`;
- take any human decision;
- merge.

The scratch PostgreSQL cluster of §13 was created and destroyed inside the reviewer's session scratch directory. It is outside the repository and is not an implementation.
