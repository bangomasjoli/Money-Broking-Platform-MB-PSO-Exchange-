# 04 Review R8 — AST-01: Asset & Instrument Registry + Regulatory Classification (blueprint v1.7)

- **Task ID:** AST-01
- **Review type:** Separate-context independent re-review of the v1.7 remediation. Review only: no remediation, implementation, migration or merge.
- **Reviewer:** high_risk_reviewer / claude-opus-5-5 / HIGH
- **Reviewed commit:** `93139f8` on `module/AST-01`: v1.7 remediation `d71bd04` plus the escape-only cleanup `93139f8`. History: `78ec1e4` (v1.0) → `45d9a2f` (R1 `REMEDIATE`) → `e20b8ca` (v1.1) → `ccec2ff` (R2) → `f769689` (v1.2) → `56b0d6d` (R3) → `b56950f` (v1.3) → `3c222f4` (R4) → `a33cc3d` (v1.4) → `32fadb0` (R5) → `bd753f8` (v1.5) → `3d1dc25` (R6) → `292face` (v1.6) → `ecaf628` (R7 `REMEDIATE`) → `d71bd04` (v1.7) → `93139f8` (cleanup).
- **Reviewed against:** `04-review-r7.md` (primary: F38, F40, F41; closed: F29, F30, F31 inversion, F32(b), F33, F35, F37, F39; external gates: F02, F05, F17, F21) and the actual v1.7 pack.
- **Not relied on:** `05-remediation-r7.md` (not read) and the README "what changed" column. Every disposition below comes from the normative v1.7 text, checked against three things:
  - a word-level diff of v1.6 → v1.7;
  - the platform repository (migrations, `migrate:up`, existing IAM-02 call sites);
  - **live probes on a disposable PostgreSQL 17.10 database**. It was created and dropped by this review, the probe roles were dropped, and the cluster was returned to its stopped state. Nothing in the repository was touched.

## Decision

# **REMEDIATE**

v1.7 does what round 7 asked for in F38 and F40, and most of what it asked for in F41:
- **F38.** Every raw site is now a helper call. The 12-helper family is complete and consistent in 05, 09 and 10. Level G has a helper. `AS006` reads identically everywhere. Token acquisition is inside the helper contract.
- **F40.** The underlying-link trigger locks both endpoints first. Classification on `DRAFT` is SQL-refused. Both race orders are correct.
- **F41.** The table-reading `CHECK`s are gone. Vector classes are machine-checkable. The readiness trigger is unconditional. The fallback gate is withdrawn.

Four new defects stop acceptance. They sit where the v1.7 design moved the security weight: onto the lock **tracker** (F40) and onto **role separation** plus the **dependency rule** (F41).

| ID | Sev | Summary |
|---|---|---|
| **AST-01-F42** (new; adjacent to F38/F40) | LOW | The idempotent re-lock trusts the tracker. The tracker is a session-writable GUC (probe P2), and a "held" key issues **no** row-lock statement. A raw writer that forges the tracker therefore skips every trigger-taken lock: `trg_underlying_insert_guard`, `trg_asset_class_frozen`, record trigger 2(c), and the merge trigger step 6. With two forged raw link inserts, the F37 late-link attack reopens without SQL noticing |
| **AST-01-F43** (new; supersedes F41 with F44) | LOW | The F41 role-separation boundary is not bound to the identity that actually runs migrations. The platform's migration runner is one `postgres` superuser identity "in every environment" (`003`, `007`). The pack never requires the AST migration identity to be non-superuser or a non-member of the bootstrap role. It puts bootstrap objects inside the ordinary migration sequence (§12(a)) while also saying the bootstrap role "is not used by CI/CD migration runs". It has no STOP gate for this case. T-ADR-24 can pass with a test-created role while production migrations still run as superuser: a silent fallback |
| **AST-01-F44** (new; supersedes F41 with F43) | LOW | Three F41 mechanisms are unsound as specified. **(a)** The bootstrap functions have no name-resolution hardening, so the migration role (which holds `CREATE` on `ast1`) can shadow `pg_get_functiondef` and subvert the digest helper without replacing it (probe P3). **(b)** The dispatcher's invocation pattern is unspecified. **(c)** The dependency rule walks `pg_depend`, which records **no** edge to pinned built-ins: `now()`, `random()`, `current_setting()`, `current_user` and a `pg_class` read all register (probe P1). Further items: **(d)** a later-named `BEFORE` trigger can rewrite the address after validation (probe P6); **(e)** the `regprocedure` column makes the whole cluster ineligible for `pg_upgrade`; **(f)** four precision errors |
| **AST-01-F45** (new) | LOW | Level G (`lock_governed_change`) is held **across** the IAM-02 `execute-verify` network call. The platform rule is the opposite ("never hold a Postgres lock across the IAM-02 execute-verify network call", SEC-01; the same shape in AML-01 and CLT-01) |

- **No `SECURITY` → MB/PSO path exists.** B1–B12, `lineage_review_required`, `assert_token_consumable` and the attestation trigger are byte-identical to v1.6.
- F42 needs a deliberately forging raw writer with runtime credentials. F43 and F44 weaken the address-freeze defence-in-depth layer. F45 is availability and operability only.
- **None needs a human decision** to correct in the blueprint. F43 may lead to a platform DCR at the P1 gate (§16).

**Implementation is not authorised. Nothing is accepted. `PLAN_READY` is not set. `task.json` is unchanged (§15).**

---

## 1. Baseline verification (all PASS)

| Check | Result |
|---|---|
| Branch / HEAD | `module/AST-01` @ `93139f8`; `origin/module/AST-01` = `93139f8` after `git fetch` |
| Working tree | clean (before this record) |
| `main` / `origin/main` | both `43f2f34`, untouched |
| Scope | `git diff --name-only 43f2f34..HEAD`: 113 files, **0** outside `docs/02_modules/AST-01/**` / `docs/03_implementation/tasks/AST-01/**` |
| v1.0–v1.6 unchanged | `git diff <version commit> HEAD -- blueprint/v1.x` has 0 files for v1.0 `78ec1e4`, v1.1 `e20b8ca`, v1.2 `f769689`, v1.3 `b56950f`, v1.4 `a33cc3d`, v1.5 `bd753f8`, v1.6 `292face` |
| Cleanup commit `93139f8` | Touches only `v1.7/10_Test_Cases.md`: 8 lines, removing stray `\'` escapes in T-LIN-36/37/39/40/41 and T-ADR-24/25/26. No semantic change |
| Migration head | `platform/infra/migrations` head `071_cfg1_environment_scope.cjs`. `migrate:up` = `node-pg-migrate -m infra/migrations --no-check-order up` (`platform/package.json:19`). No event trigger or post-migration hook exists. v1.7 claims none (T-ADR-23) |

## 2. Independence

- **Fresh context.** This is a new Claude Code session. It resumes no authoring, remediation or earlier review session. Inputs: the task brief, the repository, the conductor's `validateTaskManifest` (read-only), and a scratch PostgreSQL database.
- **Model family.** The reviewer is `claude-opus-5-5`, as in R1–R7. The v1.7 author is `Claude Sonnet 5.5` (per the `d71bd04`/`93139f8` trailers). The review is **context-independent, not model-family-independent** with respect to the earlier reviews.
- **Seams checked read-only.** `aix-conductor/dist/records.js` `validateTaskManifest(task.json)` ⇒ `{"ok":true,"errors":[]}`. The conductor repository was clean before and after.
- **Live PostgreSQL probes** (PG 17.10, database `ast1_r8_probe` and roles `r8_app`/`r8_mig`, all dropped afterwards):

  | # | Probe | Observed |
  |---|---|---|
  | P1 | `IMMUTABLE STRICT LANGUAGE SQL` SQL-standard body with `SET search_path = pg_catalog`, using `lower(… COLLATE "C")`, `~`, `now()`, `random()`, `current_setting()`, `current_user` and `(SELECT count(*) FROM pg_catalog.pg_class)` | PostgreSQL **accepts** the `IMMUTABLE` declaration. `pg_depend` rows for the function: **`schema ast1 [n]` only**. A user table (`ast1.t`) does get an edge. The `prosqlbody` parse tree does contain every `:funcid` and the `:relid` |
  | P2 | As an unprivileged role: `set_config('ast1.held_instruments','forged',true)` | **succeeds** |
  | P3 | Bootstrap-style plpgsql helper calling unqualified `pg_get_functiondef`. A role with `CREATE` on `ast1` creates `ast1.pg_get_functiondef(oid)` and runs `SET search_path = ast1, pg_catalog` | default path: genuine. Attacker path: **the forged function is called** |
  | P4 | `ddl_command_end` + `sql_drop` triggers, then `DROP FUNCTION` | fired `sql_drop` **and** `ddl_command_end` for `DROP FUNCTION` |
  | P5 | Non-superuser `ALTER EVENT TRIGGER … DISABLE`; `ALTER EVENT TRIGGER … OWNER TO` a non-superuser | `must be owner of event trigger`; `The owner of an event trigger must be a superuser` |
  | P6 | Validating `BEFORE INSERT` trigger `trg_instrument_address_canonical`, plus a later-named `BEFORE INSERT` trigger that rewrites `NEW` | the stored value is the **rewritten, non-canonical** one |
  | P7 | `pg_upgrade` binary strings | "Checking for reg\* data types in user tables". The list includes `regprocedure`, and the check refuses the upgrade |

## 3. Dispositions

### 3.1 Round-7 findings

| Finding | Disposition | Basis |
|---|---|---|
| **F38** Helper exclusivity | **CLOSED IN BLUEPRINT** | §6. All seven R7 corrections are done, and the raw-lock audit is clean (§6.2). The tracker-trust weakness is a new attack on the re-lock rule, not on exclusivity. It is carried as **F42** |
| **F40** Raw-path F37 premises | **CLOSED IN BLUEPRINT** | §7–§9. The trigger locks first, step 2A exists, and both race orders are correct for every raw writer that uses ordinary SQL. A raw writer that **forges the tracker** is the adjacent **F42**. F42 is fixed in the helper contract (§7A), not in F40's trigger design, following the F37 → F40 precedent in R7 §3.1 |
| **F41** Canonicaliser freeze boundary | **SUPERSEDED BY NEW FINDING (AST-01-F43, AST-01-F44)** | §10–§14. R7 corrections 1 (dispatcher), 4 (no table-reading `CHECK`), 5 (vector classes), 6 (readiness, `NULL`-safety, PG pin) and 7 (no fallback) are done. Correction 2 (bootstrap boundary) is designed but not bound to the real migration identity and not hardened: F43, F44(a)(b). Correction 3 (self-containment) is specified on `pg_depend`, which cannot see pinned built-ins: F44(c) |

### 3.2 Findings closed earlier (regression-checked, §17)

| Finding | Result |
|---|---|
| **F29** Live class binding | **CLOSED, no regression.** B12 and `class_binding_matches` are byte-identical to v1.6 |
| **F30** Ordering / visibility | **CLOSED, no regression.** `AS007` is the first operation of `authoritative_state()` and of all 12 helpers. The list is identical in 05 §7, 09 and T-ISO-04, and T-ISO-04 checks it against the catalog |
| **F31** Original self-first inversion | **CLOSED, no regression.** 05 §5.1 2(c) derives the set under the gate and then calls `lock_instruments(set, UPDATE)` in one pass |
| **F32(b)** Attestation ordering | **CLOSED, no regression.** The `trg_attestation_binding` paragraph is byte-identical |
| **F33** SQL-enforced correction locking | **CLOSED, no regression.** Branch (b)'s `lock_asset_instruments` is unchanged, and the asset lock is now a helper. Under F42's forged tracker, B12's live class binding still denies (§6.4) |
| **F35** `WITHDRAWN` terminal, `SEC(G)` exclusion, marker sequence | **CLOSED, no regression.** Trigger 7 and the attestation text are byte-identical |
| **F37** Late underlying link | **CLOSED, no regression** for every ordinary-SQL path (§9). F42 names the one forged-tracker path |
| **F39** Security-reasoning precision | **CLOSED, no regression** |

### 3.3 External gates

| Finding | Disposition |
|---|---|
| **F02** Consumer token adoption | **EXTERNAL GATE REMAINS** (DCR-AST1-004) |
| **F05** Checker identity | **EXTERNAL GATE REMAINS** (DCR-AST1-001(a)+(d)) |
| **F17** Canonical identity (WLT-01) | **EXTERNAL GATE REMAINS** (DCR-AST1-002(7)) |
| **F21** MYR | **EXTERNAL GATE REMAINS** (DCR-AST1-008(c), OQ-6) |

## 4. Non-negotiable property

A `SECURITY` / `SECURITY_TOKEN` outcome can never reach `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO` or `WITHDRAWAL_MB_PSO`. **Holds.**
- A hash comparison of v1.6 and v1.7 05 is **identical** for:
  - the twelve B-rows;
  - `lineage_review_required` clauses (a)/(b);
  - `assert_token_consumable` (i)–(v);
  - record triggers 5–8 (synthetic, `SECURITY_LABELLED`, elevated, evidence standard);
  - `trg_lineage_immutable`.
- The only diffs in the merge trigger (step 6) and `trg_evidence_server_order` replace raw `… FOR UPDATE` with `lock_instruments(…, UPDATE)` / `lock_instrument(…, UPDATE)`.
- No predicate was removed.

---

## 5. Helper family, reconstructed (05 §7A "Lock helper family", lines 820–839)

| Helper | Level | Modes | First op | Tracker | Order guard | Re-lock same/stronger | Upgrade | `NULL`/`''` |
|---|:---:|---|---|---|---|---|---|---|
| `lock_governed_change(change_id)` | G | `UPDATE` | `AS007` | G key | G must be the first level | no-op | n/a (one mode) | both = empty |
| `lock_lineage_gate_shared()` | 0 | `SHARE` | `AS007` | gate mode | level ≤ 0 so far | no-op | — | both = empty |
| `lock_lineage_gate_exclusive()` | 0 | `UPDATE` | `AS007` | gate mode | level ≤ 0 | no-op | `SHARE` held ⇒ `AS006` | both = empty |
| `lock_asset(id, mode)` | 1 | `SHARE`/`UPDATE` | `AS007` | asset set + mode | new key only at level ≤ 1 | no-op, **before any level check** (the correction re-lock, line 852) | `AS006` (3) | both = empty |
| `lock_instrument(id, mode)` | 2 | `SHARE`/`UPDATE` | `AS007` | instrument set + mode, highest-new-id | ascending new ids | no-op | `AS006` (3) | both = empty |
| `lock_instruments(ids, mode)` | 2 | `SHARE`/`UPDATE` | `AS007` | same | dedupe → sort → drop held → smallest new > highest new, else `AS006` (2) **before** any statement → acquire → update the tracker only after the whole batch succeeds (line 849) | dropped per id | `AS006` (3) | both = empty |
| `lock_affected_instruments` / `lock_merge_affected_instruments` / `lock_asset_instruments` | 2 | `UPDATE` | `AS007` | via `lock_instruments` | via `lock_instruments` | via `lock_instruments` | — | — |
| `lock_token(hash, mode)` | 3 | `UPDATE` | `AS007` | token set, highest `(instrument_id, token_hash)` | instrument must be tracker-held, else `AS006` (4) | no-op | — | both = empty |
| `lock_tokens(hashes)` / `lock_instrument_tokens(id)` | 3 | `UPDATE` | `AS007` | same | sort `(instrument_id, token_hash)`, ascending guard | dropped | — | — |

- Every property the brief lists is specified: RC-first, one transaction-local tracker, global level order, idempotent same/stronger re-lock, no upgrade, `NULL`/`''`.
- `authoritative_state()` is not a helper. It calls `lock_instrument(id, SHARE)` after its own `AS007` (line 726).
- The list is identical in 05 §7 (line 724), 09 `AS007` (line 111), T-ISO-04 and 05 §12.

**Minor precision:**
- `lock_tokens`' set form does not restate `lock_token`'s "instrument must be held" precondition (line 836). Without it, the level guard still fails closed at the next level-2 request.
- "A second gate mode" is classed under case (4) in 09/T-LOK-10, and under the upgrade refusal (3) in line 848. It is the same `AS006` either way. Editorial.

## 6. F38 — helper exclusivity

### 6.1 The normative rule

Rule 22 (line 32) covers levels **G, 0, 1, 2, 3**:
- Every governed lock goes through a named helper.
- No writer or trigger issues raw `SELECT … FOR …` outside a helper body.
- The only raw SQL is inside the helper implementations.

The "Notation" paragraph (line 807) fixes `SHARE`/`UPDATE` as helper modes. The rule is coherent and matches T-LOK-07(m)'s acceptance condition.

### 6.2 Raw-lock audit (whole v1.7: `FOR (NO KEY )?UPDATE|FOR (KEY )?SHARE|LOCK TABLE`, 19 hits)

| Location | Class |
|---|---|
| 05 l.32 (rule 22), l.807 (notation), l.822 (family preamble) | rule statement |
| 05 l.363 ("`FOR SHARE`/`FOR UPDATE`, taken inside the helper"), l.457 (guard: "acquires the remainder `FOR UPDATE` internally"), l.845, l.849 (set-lock internals) | (1) helper-implementation description |
| 05 l.559 ("the trigger issues no raw `… FOR UPDATE`"), l.971 ("No raw `SELECT … FOR UPDATE`") | negative statement |
| 05 l.726 (PostgreSQL rejects `FOR SHARE/UPDATE` in non-volatile functions), l.859 (privilege note) | implementation note |
| 05 l.861, l.903, l.975 (FK `FOR KEY SHARE` subsumed) | (2) executor/FK implicit lock |
| 10 l.171 (T-LIN-40), l.254 (T-LOK-07 (a)(b)(i) negative control, (k), (m)) | test instrumentation / negative control |
| 12 l.50 (AR-42), README l.40 | history of the defect |

**Zero illegal raw callers.** Every R7-named site is now a helper call:

| R7 site | v1.7 |
|---|---|
| §4.1 `trg_asset_class_frozen` | `lock_asset(OLD.asset_id, UPDATE)` (l.360) |
| §4.2 `trg_instrument_asset_lock` | `lock_asset(NEW.asset_id, SHARE)` (l.425) |
| §7 `authoritative_state()` | `lock_instrument(p_instrument_id, SHARE)` (l.726) |
| §7A correction step 2 | `lock_asset($a, UPDATE)` (l.946) |
| mint step 1 | l.981 |
| consume steps 2–3 | l.989–990 |
| 04 §6.1 / §6.2 | l.165, l.177 |
| 02 W13 | l.159–164 |
| merge trigger step 6 | via `lock_instruments` |
| evidence trigger | `lock_instrument(…, UPDATE)` |

### 6.3 R7 F38 corrections, item by item

1. **Sites rewritten:** done (§6.2).
2. **Asset re-lock enumerated:** l.852 ("Re-lock sites" item 2). T-LOK-07(i) asserts on the asset key **and** the instrument set, with a raw-step-2 negative control.
3. **`lock_instruments`/`lock_token` in the `AS007` list and T-ISO-04:** done. All 12 helpers are listed, and T-ISO-04 compares against the catalog.
4. **Level G helper:** `lock_governed_change`, inside the scan.
5. **Case (4) in `AST1_LOCK_SET_CHANGED`:** done (09 l.61).
6. **Revocation:** routed through `lock_instrument_tokens`/`lock_tokens`/`lock_token` (l.956–963), with the guard argument stated as well.
7. **01 §3.6 "renumbered" citation:** removed (0 hits).

### 6.4 Adjacent weakness → F42 (tracker trust)

Rules 1/2 (l.846–847) make a same/stronger request return with "**No** `SELECT … FOR …` issued". T-LOK-07(b)(i) and T-LIN-39 assert "zero new row-lock statements". The tracker lives in `set_config('ast1.…', …, true)` (l.843), which any session can write (probe P2). No text treats the tracker as untrusted, and T-LOK-07(m) scans row-lock statements, not tracker writes.

**Attack** (sweep disabled; attacker holds `ast1_app` credentials and issues raw SQL):
1. **L** forges `S` and `V` as held and raw-inserts S → V. The trigger's `lock_instruments({S, V}, UPDATE)` is a no-op, and it reads S `DRAFT` unlocked.
2. S's case submit runs concurrently: it takes `lock_instrument(S, UPDATE)` and commits `IDENTITY_LOCKED`.
3. L's FK `KEY SHARE` on S waits for the submit and then succeeds. L stays open.
4. **M** forges X and S as held and raw-inserts X → S. The trigger sees S `IDENTITY_LOCKED` and X `DRAFT`. M's FK `KEY SHARE` is compatible with L's, and M commits.
5. X identity-locks and classifies `NON_SECURITY` through the protocol. The record trigger locks X only. `B(X)` does not see L's uncommitted S → V, so the record is not elevated.
6. L commits. V's **older** `SECURITY` history is now in `B(X)` after X's record. Clause (a) needs a newer record and clause (b) needs a merge, so B8 stays false.

This is the F37 shape again: premise P1 is violated in SQL, and only S7/S4 notice.
- **Single forged insert.** Every protocol-path follower waits on the FK `KEY SHARE` until the link commits, so the forged link is visible before any record that depends on it. Only the S4 fingerprint drift remains.
- **F33.** A forged correction writer skips `lock_asset_instruments`, but B12's live class binding still denies the stale record (F29).

**Why this is not a reopening of F38 or F40:** exclusivity and the trigger design are right. The weakness is that "held" is decided from caller-writable state.

## 7. Level G

- **Global order** (l.809–818, l.905): G → 0 → 1 → 2 (ascending) → 3 (ascending `(instrument_id, token_hash)`, only under the held instrument) → 4.
- **G's position.** G is the first lock of every apply transaction: record apply, real-`SECURITY` apply, merge, correction, and the governed hold/admission/custody/operational/attestation/retire/risk/standard-retirement paths shown as "(G) → 2".
- **Search for a flow that needs a new G key after level 0/1/2.** None. The triggers read `governed_change` (merge step 5, `trg_asset_class_frozen` branch (b), the marker insert check) but never lock it. `class_correction_marker`'s FK `KEY SHARE` lands on the change row already held at `UPDATE` (subsumed). The backstop-trip `SYSTEM` hold runs in a separate transaction.
- **Two changes in one transaction** (e.g. two correction hops) ⇒ the second G key after level 1–3 ⇒ `AS006` case (4), fail-closed. T-LOK-07(o) and T-LOK-10(4) cover this. A same-key re-lock is idempotent.
- **IAM remote-call pattern — mismatch (F45).** 05 l.813, l.931, l.945, 02 W12/W13 (l.138, l.159), 04 apply steps and T-LOK-05 ("only, at most, the change row") all place `execute-verify` **after** `lock_governed_change` in the same transaction. The G row lock and an open transaction with an assigned xid are therefore held across the network call. The platform's established pattern is the reverse:
  - `services/sec1/src/routes/alerts.ts:402–403`: "never hold a Postgres lock across the IAM-02 execute-verify network call".
  - `services/clt1/src/routes/client-profiles.ts:185–197` and `services/aml1/src/routes/matches.ts:329–347`: unlocked pre-read → verify → locked transaction re-checks.
  - The effect is availability and operability only: double-apply waiters block for the IAM latency, and the running xid holds back the xmin horizon. No safety effect.

## 8. Token lock order

| Attack | Result |
|---|---|
| Revoke set vs consume | Consumer: `lock_instrument(I, SHARE)` → `lock_token(h, UPDATE)`. Revoker: `lock_instrument(I, UPDATE)` (all instruments ascending) → `lock_instrument_tokens`/`lock_tokens`. Instrument `SHARE` vs `UPDATE` serialises them before either touches a token. **No cycle** |
| Two token sets, opposite input order | Both helpers sort by `(instrument_id, token_hash)`, and the level-3 guard refuses a lower new key (`AS006` (2)). **No cycle** |
| Multiple instruments | Instruments are locked ascending (level 2) before any token. A consumer holds one instrument and at most one token, and never needs a second instrument. **No cycle** |
| Raw consume / raw revoke `UPDATE` | The executor tuple-locks the token before the trigger's instrument lock. Declared unsupported and fail-closed (l.776, l.999, l.921) |

**No deadlock-prone supported path.** T-LOK-07(n) tests all three.

## 9. F40 — raw underlying insert, source race, `DRAFT` classification, recursive proof

### 9.1 `trg_underlying_insert_guard` (l.456–464)

It is one ordered function. Step 1 is its **first** security-relevant act:
- `INSTRUMENT` kind: `lock_instruments({NEW.instrument_id, NEW.underlying_instrument_id}, UPDATE)`.
- Any other kind: `lock_instrument(source, UPDATE)`.
- A missing endpoint ⇒ `AS004`.

Only then, in fresh `READ COMMITTED` statements, does it check:
- source `DRAFT` (step 3);
- target `IDENTITY_LOCKED`/`RETIRED` (step 4);
- same-kind (step 5);
- cycle/depth (step 6).

The FK `KEY SHARE`s fire on rows already held at `UPDATE` (subsumed). A raw `INSERT` gets exactly the protocol's serialisation. **Correct** (subject to F42).

### 9.2 Source identity-lock race (non-forging writer)

The identity-lock `UPDATE` goes through `trg_instrument_lock_on_write` → `lock_instrument(S, UPDATE)`.

| Order | Outcome |
|---|---|
| Identity lock first | The link's `lock_instruments` waits on S. After the commit, READ COMMITTED `SELECT … FOR UPDATE` returns the new version, and step 2's fresh read sees `IDENTITY_LOCKED`, so the insert is refused |
| Link locks first | The submit (and any record, which also needs `lock_instrument(S, UPDATE)` and, by rule 24, `IDENTITY_LOCKED`) waits until the link commits. The identity lock then observes the final link set |

- No classification of S can come between them. A wrapper X → S needs S non-`DRAFT` and `lock_instruments({X, S})`, so it also waits for the link.
- Target race (T-LIN-33): symmetric, and safe even unlocked, because lifecycle is monotone away from `DRAFT`.
- **Minor.** T-LIN-37 asserts that S's `identity_fingerprint` "computed at submit" includes the link. The case-submit row (l.871) takes the lock first, but it does not state that the fingerprint is computed after the lock. If it were computed before, the result is S4 drift (fail-closed), not a safety gap. Editorial.

### 9.3 Classification on `DRAFT` (l.560, rule 24)

- Step 2A runs after the step-2 lock (after the whole set in the exclusive case) and **before** `record_seq`/`global_seq`. It refuses unless `IDENTITY_LOCKED`, with `AS004` `AST1_INSTRUMENT_NOT_IDENTITY_LOCKED` and reason `DRAFT`/`RETIRED`.
- A raw insert against `DRAFT` fails. T-LIN-38 asserts that no sequence is consumed.
- **RETIRED policy — not broadened.** v1.6 06 SM-1 made `RETIRED` terminal, with all subjects denied and history retained. It defined no classification of a retired instrument, and v1.7 only makes that SQL-visible. **One unstated consequence (editorial, §18):** 05 §4.1 l.362 prescribes one operator route for a round-trip correction `A → B → A`: record `UNRESOLVED` between the hops. That route is now impossible for a **retired** instrument with a current record. The second hop's deferred constraint therefore refuses **permanently** for any asset that holds such an instrument. This is fail-closed, but B6 already denies a retired instrument on every subject, so the constraint could exempt `RETIRED`. Either state the dead end or scope the constraint.

### 9.4 Recursive F37 proof (re-derived)

For every Y non-`DRAFT` at time *t*, the set reachable through `instrument_underlying` is fixed after *t*.

1. Y's out-links are frozen (P1, guard step 3 under the source lock), and Y never returns to `DRAFT` (SM-1, `trg_instrument_identity_immutable`).
2. Each direct target T was non-`DRAFT` at insert (P2, step 4), and so remains non-`DRAFT`.
3. By induction on insert order, T's reachable set was fixed at that insert.
4. So Y's reachable set is a union of fixed sets over a fixed out-link set. ∎

Classified ⇒ `IDENTITY_LOCKED` at record time (P3, step 2A), so X's link graph is fixed at or before its first record.

**Other graph writers** — none undermines the proof:

| Writer | Effect |
|---|---|
| `UPDATE`/`DELETE`/`TRUNCATE` of `instrument_underlying` | `trg_underlying_immutable`, every role, and no grant |
| Replacement instrument | A new row joins a merge tree; its own links point only to non-`DRAFT` targets |
| `instrument.asset_id`, `asset.lineage_id` | Immutable from insert |
| Merges | Change merge-tree roots, not links; gate-serialised; F27 clause (b) narrows |

**The proof holds on every ordinary-SQL path with the sweep off.** Under a forged tracker, P1 fails (F42).

## 10. F41 — bootstrap trust boundary and the privilege model

### 10.1 What v1.7 specifies (§2.2.1, rule 25, §10)

- **Bootstrap-owned:** digest helper, assertion, registration and immutability triggers, readiness trigger, dispatcher, `freeze_ddl_guard()`, both event triggers, the five freeze tables, and schema `ast1` (the migration role gets `USAGE, CREATE`).
- **Migration-owned:** the version-specific rule functions (and, by implication, `instrument`, `network_registry` and the other `ast1` tables).
- **P1 acceptance:** T-ADR-24 proves the refusals.

### 10.2 Can PostgreSQL enforce it? (object by object)

| Attempt by a **non-superuser, non-member** migration role | Enforced by |
|---|---|
| `CREATE OR REPLACE` / `ALTER` / `DROP` / `ALTER OWNER` on a bootstrap function, table or trigger | ownership (owner or superuser only). **Enforceable** |
| Drop bootstrap objects through schema ownership | schema owned by bootstrap. **Enforceable** (§2.2.1 row 4 closes the R7 concern) |
| `ALTER EVENT TRIGGER … DISABLE` / `DROP EVENT TRIGGER` | owner only, and an event trigger's owner **must be a superuser** (P5). **Enforceable** |
| `ALTER TABLE instrument DISABLE TRIGGER trg_instrument_address_canonical` / `DROP TRIGGER` (migration role owns `instrument`) | not privilege. `ddl_command_end`/`sql_drop` fire, and assertion step 0 checks `tgenabled = 'O'` ⇒ abort. **Enforceable by the guard** |
| `SET session_replication_role = replica` / `SET event_triggers = off` (PG 17) | superuser-only by default, but grantable by `GRANT SET` since PG 15. **Not stated** (F43) |
| **All of the above, when the migration identity is a superuser or can become the bootstrap role** | **nothing**: a superuser owns the whole boundary (F43) |

**The model is sound only if two conditions hold:**
1. The identity that actually executes AST migrations is not a superuser, not a member of `role_ast1_bootstrap`, and has no `SET` grant on those two parameters.
2. The bootstrap code resolves names only through pinned paths (F44(a)).

v1.7 states neither.

### 10.3 The platform's actual migration identity (F43)

- **`platform/infra/migrations/003_iam_rls_token_lookup.cjs:22–30`:** functions are owned by "the role that executes this migration — `postgres` per this repo's documented VERIFY flow, a superuser … a single privileged migration identity". It also records that a non-superuser migration role would require re-owning its `SECURITY DEFINER` functions.
- **`007_iam2_seed_sod_rules.cjs:33–35`:** "expected to be a superuser/BYPASSRLS/table-owning role in every environment".
- **`migrate:up`** is one `node-pg-migrate` connection for all modules.

Against that:
- v1.7 §2.2.1 (l.132) says the bootstrap role "is not used by CI/CD migration runs", yet §12(a) creates "all freeze machinery … owned by `role_ast1_bootstrap`" inside the migration sequence.
- The install path for bootstrap objects, `approved_primitive` rows and `address_rule_rebaseline` rows (all bootstrap-inserted) is undefined.
- No text requires the AST migration identity to be non-superuser. The only STOP gate covers "cannot install the event trigger" (l.272).
- T-ADR-24 tests "the ordinary AST migration role", which a test can create. It can pass while `migrate:up` still runs as `postgres`, and then every refusal in §10.2 is void.

This is the "silent fallback" the brief prohibits.

### 10.4 Name resolution inside the boundary (F44(a))

The migration role holds `CREATE` on `ast1` and chooses its own session `search_path`. The event trigger runs `freeze_ddl_guard()` → the assertion → `function_definition_digest()` **in that session**. No text requires any bootstrap function to pin `search_path` or schema-qualify its calls: §2.2.2 imposes that only on rule functions.

P3 shows the consequence:
1. `CREATE FUNCTION ast1.pg_get_functiondef(oid)` returning the frozen text.
2. `SET search_path = ast1, pg_catalog` (an explicit `pg_catalog` placed after `ast1` loses its implicit precedence).
3. `CREATE OR REPLACE` the V1 rule function with a body that agrees on every vector.
4. The digest step compares the forged text and passes.

**Role separation is bypassed without replacing any bootstrap object.** Operators (`=`, `IS DISTINCT FROM` → `=`) are exposed the same way. If any bootstrap function is `SECURITY DEFINER`, it runs as a superuser (P5 forces a superuser owner for the event trigger), and this becomes privilege escalation (the CVE-2018-1058 class). The platform already applies the fix elsewhere: 003 pins `SET search_path = iam, pg_temp`.

## 11. Event-trigger privilege and coverage

| Attack | v1.7 outcome |
|---|---|
| `CREATE OR REPLACE` a versioned rule function | `ddl_command_end` → assertion step 2 `DIGEST_MISMATCH` ⇒ abort. **Covered**, but see F44(a) (search_path) |
| `DROP FUNCTION` a rule function | `sql_drop` (and `ddl_command_end`, P4) → step 1 `RULE_FUNCTION_MISSING` ⇒ abort. **Covered** |
| `ALTER FUNCTION` (body-neutral: `SET`, `RENAME`, `OWNER`, `SECURITY DEFINER`) | The digest covers `proconfig`, `prosecdef`, `proparallel`, the name/signature and the owner name ⇒ mismatch ⇒ abort. **Covered** |
| `DROP`/`ALTER` dispatcher, freeze assertion, `freeze_ddl_guard()` | Privilege (bootstrap-owned). **Covered** if F43 holds |
| `ALTER`/`DROP` the address-rule tables | Privilege (bootstrap-owned); `UPDATE`/`DELETE`/`TRUNCATE` ⇒ `AS002` for every role. **Covered** if F43 holds |
| `ALTER`/`DROP` the event trigger itself | Owner only, and the owner is a superuser (P5). Not self-protected, **privilege-protected**, as the brief requires. **Covered** if F43 holds |
| `ALTER TABLE instrument` on the canonicalisation columns (type change with `USING`, drop, rename) | `ddl_command_end`/`sql_drop` → steps 7/8 (stored values are fixed points, no collision) or an error ⇒ abort. **Covered** |
| **A new, later-named `BEFORE INSERT/UPDATE` trigger on `instrument` that rewrites `contract_address_canonical` after `trg_instrument_address_canonical` validated it** | `CREATE TRIGGER` fires the guard, but the assertion checks only that the enforcement trigger exists and is enabled, and that the **current** stored rows are fixed points. The rogue trigger is admitted, and later inserts store non-canonical values (P6). S9 detects this after the fact. **Gap — F44(d)** |
| DDL on shared objects / `CREATE`/`ALTER`/`DROP EVENT TRIGGER` | Event triggers do not fire here, which is why privilege is the boundary. Correctly relied on (l.271) |

**Minor:** l.269 says "`ddl_command_end` does not fire for `DROP`". That is false (P4). Installing both triggers is still correct. Editorial (F44(f)).

## 12. Canonicaliser dependency policy (F44(c))

§2.2.3 item 2 has the registration trigger "walk `pg_depend` (`deptype = 'n'`) … require every referenced object to appear in `approved_primitive` as (a) a `pg_catalog` built-in …". Item 3 refuses time, randomness and GUC readers because they are "not on the allow-list". Item 4 adds a parse-tree scan **only** for `SQLValueFunction` nodes.

**PostgreSQL records no `pg_depend` edge to pinned (initdb) objects.** P1 recorded only `schema ast1` for a function calling `now()` (`s`), `random()` (`v`), `current_setting()` (`s`) and `current_user`, and reading `pg_catalog.pg_class`. Consequences:
- A **user table** (edge recorded), a **user function** and an **extension** object (both unpinned) are detected. Items 3(a), (b) and (d) work.
- **Time, randomness, GUC readers and system-catalog reads are invisible to `pg_depend`.** They are refused only if they appear as `SQLValueFunction` (e.g. `current_user`, `CURRENT_TIMESTAMP`), not as ordinary calls (`now()`, `random()`, `current_setting(…)`, `clock_timestamp()`, `txid_current()`, `pg_backend_pid()`, `query_to_xml(…)` which executes SQL text, …) or as relation reads of catalogs.
- PostgreSQL does not verify `IMMUTABLE`. P1's function was accepted.
- T-ADR-25(c) would therefore **fail** against the specified mechanism.
- The allow-list over approved `pg_catalog` primitives is also unenforceable as specified, because approved and unapproved built-ins look identical in `pg_depend`: absent.

**It is mechanically checkable once based on the stored parse tree.** P1 shows `prosqlbody` carries every `:funcid` and the `:relid`. Required correction: see F44(c).

Dynamic SQL is not possible inside a `LANGUAGE SQL` body except through a callee. So a parse-tree allow-list of callee functions that also requires `provolatile = 'i'` excludes `query_to_xml`-style executors. The pack must prohibit such callees **explicitly**, as the brief requires.

## 13. Function digest, dispatcher, dynamic invocation

**Digest (§2.2.4).**
- It is DB-computed and always overwritten (the registration trigger), so the caller cannot supply it.
- It covers `pg_get_functiondef(oid)`, the qualified identity/signature, volatility, strictness, `prosecdef`, `proparallel`, `prolang`, `proconfig` and the owner name.
- Dependency closure is claimed through the registration restriction, **not** the wrapper digest (l.151, l.155). This is honest, but the restriction itself is F44(c).
- The PG major is pinned per registration, and the digest is not claimed to prove engine semantics (l.276). **Correct.**

**Precision:**
- §2.2.8 step 2 compares only the registry digest. After a governed re-baseline, it must compare against the `address_rule_rebaseline` digest for the current major, or T-ADR-26's "restores passing" cannot happen.
- The rebaseline digest is described as "recomputed", but no trigger is named to DB-compute it (F44(f)).

**`regprocedure` and `pg_upgrade` (F44(e)).** `address_rule_version.rule_function regprocedure` is a reg\* type in a user table. `pg_upgrade` refuses such a cluster outright (P7: the check lists `regprocedure`). §2.2.10 describes a governed major upgrade, but this column type blocks the standard in-place upgrade path for the **whole platform database**, not just AST-01.

**Dispatcher (§2.1 l.86–92, §2.2.8 step 5, l.265).**
- One generic registry lookup, `(format, version) → rule_function`. No `CASE`, no inline regex. Bootstrap-owned, `STABLE`, in no `CHECK`.
- The assertion step 5 and readiness step 6 compare the direct rule result with the dispatcher result for every vector. **Correct in design.**

| Attack | Result |
|---|---|
| Deliberate V1 → V2 misroute | **Prevented** by ownership (valid only with F43/F44(a)). **Detected** only when V2 disagrees with V1 on some frozen vector (T-ADR-19(c) uses such a V2). The phrase "detected if misrouted anyway" (l.265) should be scoped to that |
| Dynamic invocation | **Unspecified (F44(b)).** Calling a stored `regprocedure` from plpgsql requires dynamic SQL. The safe pattern is not written down. A naïve `format('SELECT %s($1)', fn::regproc)` renders the name **unqualified whenever it is visible in the caller's `search_path`**, which re-opens P3-style shadowing. The pattern must be pinned: see F44(b). Caller-supplied text is never concatenated (only `p_raw` as a bind value). No SQL-injection route exists **once pinned** |

## 14. Vectors, readiness, table-reading `CHECK`, PostgreSQL upgrade

- **Vectors (§2.2.5–2.2.6).**
  - `vector_class` is a closed `CHECK` enum. The row-local `CHECK`s tie each class to its `(valid, canonical, fixed_point)` structure.
  - `address_rule_vector_requirement` holds one row per `(format, class)`, with `required` or a mandatory `not_applicable_reason`, and a universal floor (`CANONICAL_FIXED_POINT`, `INVALID_LENGTH`).
  - "Required ⊆ present" is plain SQL: 7 requirement rows per format, and `NOT EXISTS (required class without ≥ 1 vector)`.
  - No class is globally mandatory where it does not apply (e.g. `BASE58_FIXED` marks `VALID_NON_CANONICAL` not applicable).
  - **Closed.**
- **Readiness (§2.2.7).** On **every** insert/update, whether or not the pair is referenced, it checks: row exists → function resolves → digest (`IS NOT DISTINCT FROM`) → closure → required classes → every vector directly → every vector through the dispatcher. **Closed** (step 3 inherits F44(c)).
- **Table-reading `CHECK`.**
  - Zero. The only `CHECK (ast1.…(` hit is the SQL comment recording removal (l.57). Every other `CHECK` is row-local.
  - Canonical validity is enforced by `trg_instrument_address_canonical` at `INSERT`. Identity columns are immutable afterwards (`trg_instrument_immutable_from_insert` plus the trigger's own `UPDATE` arm). The unique index, freeze and S9 remain defence in depth.
  - Dump/restore: `pg_dump` emits FKs, triggers and event triggers post-data, so there is no load-order dependency (T-ADR-27(e)). **Closed.**
- **PostgreSQL major (§2.2.10).**
  - Pinned per registration, and fail-closed on `PG_MAJOR_UNREVIEWED`.
  - The upgrade task re-runs vectors, fixed points, collisions and definition recomputation, and writes an append-only re-baseline row. The historical digest is never updated.
  - **Correct as policy.** The digest selection and the `pg_upgrade` blocker are F44(e)(f).

## 15. Task metadata (not modified)

- **State.** `task.json`: `state: IDLE`, `acceptanceStatus: NOT_ACCEPTED`, `PLAN_READY` absent. `validateTaskManifest` ⇒ `{"ok":true,"errors":[]}`.
- **`findingsSummary` is correct.** Open: HIGH 3 = F02, F05, F17 (R1 §F02 HIGH, R1 §F05 HIGH, R2 §F17 HIGH); MEDIUM 1 = F21 (R2 §F21 MEDIUM); LOW 3 = F38, F40, F41 (R7 §16). The IDs are right, and the severity aggregation matches each finding's recorded severity. The "inferred from prior summary" counts are **not** stale.
- **Task-metadata precision item TM-R8-1 (not a blueprint finding).** `roundCounts` reads `{"review": 1, "remediation": 1}` after 8 reviews (R1–R8) and 7 remediations (v1.1–v1.7). It is stale. Reconcile it at the next remediation checkpoint, together with `findingsSummary`:
  - F38 and F40 closed;
  - F41 superseded;
  - F42–F45 open (LOW 4);
  - the gates unchanged.
- **This review changes nothing in `task.json`** and invents no lifecycle event.

## 16. Findings (open after this review)

Severity uses the `OPEN_FINDINGS` vocabulary.

### AST-01-F42 — LOW — Idempotent re-lock trusts a session-writable tracker, so trigger-taken locks can be skipped (new; adjacent to F38/F40)

- **Evidence:** §6.4.
  - 05 l.846–847: rules 1/2 issue no row-lock statement for a key the tracker shows as held.
  - l.843: the tracker is `set_config('ast1.…', …, true)`, writable by any session (P2).
  - T-LOK-07(b)(i) and T-LIN-39 assert "zero new row-lock statements".
  - T-LOK-07(m) scans only `FOR …` statements.
  - Two forged raw link inserts reproduce the F37 late-link outcome with the sweep off. Premise P1 (l.467) and the "SQL-enforced on every path" claims (l.463, l.471, T-LIN-41) are therefore conditional on an untampered tracker.
- **Affected sections:** 05 §1 rule 22, §4.3 (l.463–471), §7A (rules 1/2, "Multi-row set lock" step 3–4, "Re-lock sites", "Tracker scope"); 01 INV-17/INV-20; 10 T-LOK-07(b)(i)(m), T-LIN-39, T-LIN-41; 12 AR-42.
- **Required correction:**
  1. The tracker must never be proof of possession. For a key shown as held at the same or a stronger mode, the helper skips **only** the level and order checks and the tracker update. It still issues the row-lock statement for that key. PostgreSQL grants immediately, with no wait and no new conflict, a lock the transaction already holds at equal or greater strength. A forged entry therefore degrades at worst to a genuine, possibly out-of-order acquisition: deadlock-abort, fail-closed.
     - *Alternative:* keep the no-statement re-lock for ordinary paths, but give the security-bearing trigger sites (guard step 1, `trg_asset_class_frozen`, record 2(c), merge step 6, token trigger (3)) a "verify-or-acquire" variant that always issues the statement.
  2. State that the tracker is advisory ordering state, not a security input.
  3. Rewrite the "zero new statements" assertions (T-LOK-07(b)(i), T-LIN-39) as "no wait, no new conflicting lock, no tracker change, no `AS006`".
  4. Add a negative test: forge the held-set with `set_config`, then raw-insert racing the source's identity lock ⇒ still serialised (T-LIN-36 outcome).
  5. Optionally extend the static scan to `set_config`/`current_setting` on `ast1.*` tracker keys outside the helpers.
- **Implementation impact:** helper-contract text and 3–4 tests (P1). No schema change.
- **Human decision:** No.

### AST-01-F43 — LOW — Role separation is not bound to the platform's actual migration identity; bootstrap install path undefined; no STOP gate (new; supersedes F41 with F44)

- **Evidence:** §10.2–10.3.
  - `platform/infra/migrations/003_iam_rls_token_lookup.cjs:22–30` and `007_iam2_seed_sod_rules.cjs:33–35`: migrations run as one superuser identity in every environment.
  - `platform/package.json:19`: one `migrate:up` connection.
  - 05 l.132 vs §12 l.1118: the bootstrap role is not used by CI/CD, yet bootstrap objects are created in migration (a).
  - `approved_primitive` and `address_rule_rebaseline` are bootstrap-inserted with no defined path.
  - The only STOP gate covers event-trigger installation (l.272).
  - T-ADR-24 tests an abstract role.
  - P5: the event trigger's owner must be a superuser, so the bootstrap role is a superuser, not "superuser-equivalent".
- **Affected sections:** 05 §1 rule 25, §2.2.1, §2.2.9, §10, §12; 01 INV-23; 12 AR-44; 10 T-ADR-24, T-ADR-27; 17 (dependencies/gates).
- **Required correction:**
  1. Define the "ordinary AST migration role" as **the connection identity that executes AST migrations in every environment**. Require it to be:
     - not a superuser;
     - not a member of `role_ast1_bootstrap`, directly or through granted roles;
     - without any role attribute or grant that can confer that membership;
     - without `SET` privilege on `session_replication_role` or `event_triggers`;
     - not the owner of schema `ast1`.
  2. State that `role_ast1_bootstrap` is a **superuser** (event-trigger ownership requires it) and is not usable by the migration runner.
  3. Specify the install and maintenance path for bootstrap-owned objects and rows: a separate, reviewed, privileged step outside CI `migrate:up`, or an explicitly reviewed mechanism. Reconcile §12(a) with it.
  4. Add a **P1 STOP gate**, parallel to l.272. If the deployment cannot run AST migrations under such an identity (today it cannot, and 003's `SECURITY DEFINER` owners depend on the superuser runner), P1 stops for a separately reviewed equivalent control. **No silent fallback.**
  5. T-ADR-24 must execute as the real deployment migration identity and assert `rolsuper = false` and absence of membership (`pg_has_role`), besides the refusals.
  6. Record the platform-side dependency (runner identity) in 17 as a DCR or gate.
- **Implementation impact:** blueprint text, one gate, one test, and a likely platform DCR (migration-runner identity) at P1.
- **Human decision:** No for the blueprint correction. Whether the platform adopts a non-superuser migration identity is a platform-ops decision taken at the P1 gate through the DCR, as R7 §16 treated the event-trigger privilege.

### AST-01-F44 — LOW — F41 mechanisms unsound or unspecified: bootstrap name resolution, dispatcher invocation, `pg_depend`-based dependency rule, trigger-order bypass, `pg_upgrade` blocker (new; supersedes F41 with F43)

- **Evidence:** §10.4, §11, §12, §13; probes P1, P3, P4, P6, P7.
- **Affected sections:** 05 §1 rules 20/25, §2.1 (dispatcher, enforcement list), §2.2.1–2.2.5, §2.2.8 (steps 0, 2, 3, 5 and l.265), §2.2.9 (l.269), §2.2.10, §2.2.11; 01 INV-23; 12 AR-44; 10 T-ADR-13/19/22/25/26/27.
- **Required correction:**
  - **(a) Bootstrap name resolution.**
    - Every bootstrap-owned function (digest helper, assertion, registration/immutability/readiness trigger functions, dispatcher, `freeze_ddl_guard()`) is declared `SET search_path = pg_catalog, pg_temp`.
    - It schema-qualifies every `ast1` reference and uses `OPERATOR(pg_catalog.=)` or equivalent where an operator could be shadowed, or uses SQL-standard bodies where the language permits.
    - State `SECURITY INVOKER` vs `DEFINER` per function. If `DEFINER` (superuser owner), the pinning is mandatory and tested.
    - Assertion step 0 verifies each bootstrap function's `proconfig`.
    - Add a T-ADR test reproducing P3 ⇒ still `DIGEST_MISMATCH`.
  - **(b) Dispatcher invocation pattern.**
    - Resolve `rule_function`, and verify the `pg_proc` row exists with signature `(text) → text`, `IMMUTABLE`, owner as registered.
    - Invoke through `EXECUTE format('SELECT %s($1)', v_fn::oid::regproc) USING p_raw` (or an equivalent OID-derived, identifier-quoted, schema-qualified call) **inside the pinned `search_path`**, so the rendered name is always qualified.
    - No caller text is ever interpolated.
  - **(c) Dependency rule.**
    - Compute the closure from the stored `prosqlbody` parse tree: every function, operator (and its implementing function), type, collation and relation OID.
    - Require every referenced function to be in `approved_primitive` **and** `provolatile = 'i'`.
    - Refuse any relation reference (user table **or** system catalog) and any `SubLink` over a relation. Keep the `SQLValueFunction` refusal.
    - Explicitly prohibit callees that execute SQL text or read session/server state.
    - Keep `pg_depend` only as a secondary check for unpinned objects.
    - State that `pg_depend` omits pinned built-ins. Rewrite §2.2.3 items 2–4 and T-ADR-25(c) accordingly.
  - **(d) Trigger-order bypass.** Either make canonical-form validation run on the final row (e.g. an `AFTER INSERT` row constraint trigger that re-validates, in addition to the `BEFORE` stamp), or have assertion step 0 refuse any unapproved row trigger on `instrument`/`network_registry` (an inventory). Add a test reproducing P6.
  - **(e) `pg_upgrade`.**
    - Replace the `regprocedure` column with a representation `pg_upgrade` accepts, e.g. a text identity resolved with `to_regprocedure()` plus a stored OID treated as a cache.
    - Or state explicitly that the platform database can then be upgraded only by dump/restore or logical replication, and record that as a platform constraint and DCR.
    - Update §2.2.10 and T-ADR-27(f).
  - **(f) Precision.**
    - l.269: `ddl_command_end` does fire for `DROP`.
    - §2.2.8 step 2: name which digest is compared when a re-baseline row exists for the current major.
    - The re-baseline digest (and closure) is DB-computed by a trigger.
    - l.265: detection of a misroute is limited to vectors on which the routed function differs.
- **Implementation impact:** P1 function definitions, one registration-trigger algorithm, one column type, 3–4 tests. No runtime eligibility change.
- **Human decision:** No. Item (e)'s "dump/restore only" variant, if chosen, is a platform-ops choice recorded as a DCR.

### AST-01-F45 — LOW — Level G row lock held across IAM-02 `execute-verify`, contrary to the platform pattern (new)

- **Evidence:** §7.
  - 05 l.813, l.931, l.945; 02 l.138, l.159; 04 l.79 (load change → `execute-verify` inside the apply transaction); T-LOK-05 ("only, at most, the change row"); T-ISO-01 (race window framed inside the open transaction).
  - Platform pattern: `services/sec1/src/routes/alerts.ts:402–403`, `services/clt1/src/routes/client-profiles.ts:185–197`, `services/aml1/src/routes/matches.ts:329–347`.
- **Affected sections:** 05 §7A level-G row, "Lineage merge apply" step 1, "Asset class correction apply" step 1; 02 W12/W13; 04 §3 `apply` steps; 10 T-LOK-05, T-ISO-01; 12 AR-31 ("no lock held across a remote call").
- **Required correction:**
  1. Move `execute-verify` before the transaction: an unlocked read of the change row and payload, local prechecks, then `execute-verify` bound to the recomputed `payload_hash`.
  2. Then open the apply transaction: `lock_governed_change` → re-verify under the lock that the change is still `requested`, that the recomputed `payload_hash` equals IAM-02's `verified_payload_hash`, and that the attested approvers satisfy the policy → levels 0–4 as today.
  3. Retry semantics are unchanged: a failed apply needs a fresh IAM-02 approval, as l.941 already says.
  4. Restate T-LOK-05 as "no row lock and no open transaction held across the call".
  - Alternatively, justify the deviation explicitly, but the platform rule is explicit.
- **Implementation impact:** apply-protocol text and one test. No lock-order change: G stays first in the transaction.
- **Human decision:** No.

## 17. Full security regression

| Property | Result |
|---|---|
| `SECURITY` cannot reach MB/PSO | **Holds** (§4) |
| B1 intact | **Holds** (byte-identical) |
| B8 ≡ C0b parity | **Holds** (`lineage_review_required` byte-identical; T-DB-17, T-LIN-24) |
| F27 merge narrowing | **Holds** (merge steps 6–9; only step 6's lock wording changed) |
| B12 fingerprint + live class binding | **Holds** (byte-identical) |
| `READ COMMITTED` assertion | **Holds** (12 helpers + `authoritative_state()`, one list everywhere) |
| Gate-first merge | **Holds** (trigger steps 1–3 unchanged) |
| `WITHDRAWN` terminal | **Holds** |
| Attestation ordering | **Holds** (`attestation_seq`) |
| Marker ordering | **Holds** (shared sequence, same-instrument comparison only) |
| Digital MYR fail-closed | **Holds** (B10) |
| Real / test-only classification fail-closed | **Holds** (B11, record step 8; B4) |
| Synthetic never becomes real | **Holds** (insert-immutable `declared_synthetic`; guard step 5 same-kind; merge equality) |
| `lineage.synthetic` immutable | **Holds** (`trg_lineage_immutable` byte-identical) |
| Consumer binding | **Holds** (B9; token binding and immutability unchanged) |
| No `exchange.*` identifier | **Holds**. All 7 mentions (unchanged from v1.6) are prohibitions: 04 l.18, 08 l.5, 10 l.409, 12 l.110, 17 l.41/73 |

## 18. Full lock graph (supported paths, v1.7)

| Path | Walk | In order? |
|---|---|---|
| Classification record, non-`SECURITY` | G → 0 `SHARE` → 2 `UPDATE` → **2A** → 3 (revoke on narrowing) → 4 | yes |
| Real `SECURITY` apply | G → 0 `UPDATE` → derive under gate → 2 set ascending, one pass → re-derive → **2A** → 3 → 4 | yes |
| Lineage merge | G → 0 `UPDATE` → roots under gate → 2 set ascending → trigger re-lock (no-op) → 3 → 4 | yes |
| `ASSET_CLASS_CORRECTION` | G → 1 `UPDATE` → 2 every instrument ascending → trigger `lock_asset` / `lock_asset_instruments` (no-ops) → 3 → 4 | yes |
| Underlying link insert | 2 `{source, target}` ascending `UPDATE` (application, then the trigger's no-op; raw: the trigger's own acquisition) → FK `KEY SHARE` ×2 subsumed → 4 | yes |
| First / any instrument insert | 1 `SHARE` → FK (subsumed) → 4 | yes |
| Evidence insert | 0 `SHARE` → 2 `UPDATE` → 4 | yes |
| Case submit (identity lock) | 2 `UPDATE` → 4 | yes |
| Hold / admission / custody / operational state / attestation / retire | (G) → 2 `UPDATE` → (3) → 4 | yes |
| Evidence-standard retirement | (G) → 2 ascending → 3 → 4 | yes |
| Mint | 2 `SHARE` → 4 | yes |
| Consume | 2 `SHARE` → 3 `UPDATE` → trigger 2 `SHARE` (held) | yes |
| Token revocation (standalone) | 2 `UPDATE` → 3 via `lock_instrument_tokens`/`lock_tokens`, ascending `(instrument_id, token_hash)` | yes |
| Integrity sweep | per instrument, or one ascending `lock_instruments` pass → 3 (S5 revoke) → 4 | yes |

- **Pairwise.** Every writer's level-2 set is ascending and derived before locking. Level 0/1 is never taken after level 2. Tokens are only taken under their held instrument. The link insert takes no level 0/1 lock.
- **No supported cycle.**
- **Unsupported, fail-closed:** raw consume and raw revoke (executor token lock first). Under F42, a forged tracker turns trigger re-locks into possible out-of-order acquisitions **only after** the correction. Today it removes the lock.

## 19. `AS006`

The same four cases appear in:
- 05 l.860;
- 09 l.61 (`AST1_LOCK_SET_CHANGED`) and l.110 (database-error table);
- 01 INV-20;
- README l.27/31;
- 10 T-LOK-10.

The four cases:
1. affected set changed;
2. descending new id / lower `(instrument_id, token_hash)`;
3. prohibited upgrade;
4. invalid level/order.

Every location states that a same/stronger re-request is none of them. **No error-table mismatch.** The classification of "second gate mode" under (3) or (4) is editorial (§5).

## 20. Latest / newest / current / most-recent audit

- Hit counts, v1.6 → v1.7, are equal in every file except 10 (29 → 30). The added hits are T-ADR-23 "current absence" and T-ADR-26 "`pg_major_version` ≠ current". Neither is a recency choice.

| Rule | Ordering key | Status |
|---|---|---|
| Current record / `latest_outcome` / "newest record" (B-rules, consume step 5, admission/attestation binding, marker `superseded_record_id`) | max `record_seq` under the instrument lock | OK |
| Review floor, `follows_event_*` | max `global_seq` / qualifying `merge_global_seq` | OK |
| Elevated-evidence exclusion | none needed (every `SEC(G)`, every `G ∈ B(X)`) | OK |
| "Newest marker explains newest fingerprint" | same-instrument `marker_global_seq` | OK |
| Attestation "newest wins" | `attestation_seq` + `WITHDRAWN` terminal | OK |
| `network_registry` "current" version/status | future registrations only | OK |
| Freeze digest vs re-baseline | exact `(format, version, pg_major)` key, no recency | OK as keying. **Which digest step 2 compares is unstated (F44(f))** |
| Token expiry | DB `clock_timestamp()` expiry check, not an ordering | OK |

No security-relevant row choice depends on a caller timestamp or on an ambiguous recency.

## 21. OQ-8

**OPEN / UNDECIDED / NON-BLOCKING** (17 l.31, l.72; README). Not resolved. Step 2A constrains records, not the correction of a `DRAFT` typo. F42–F45 do not touch it.

## 22. External gates

- F02 (DCR-AST1-004), F05 (DCR-AST1-001(a)+(d)), F17 (DCR-AST1-002(7)) and F21 (DCR-AST1-008(c), OQ-6) are stated in 17 §2 as gates. They are honest, not claimed closed, and no DCR is implemented by v1.7.
- F43 and F44(e) may add platform-side dependencies. These are to be recorded as new DCRs, not implemented.

## 23. Implementation authorisation

None. Even an `ACCEPT` would be blueprint acceptance only, pending the human/conductor `approve-plan` checkpoint. `PLAN_READY` must not be set by any author or reviewer.

---

## 24. Required before the next re-review

1. Correct **F42, F43, F44 and F45** in a v1.8 pack. v1.7 stays unchanged as reviewed evidence.
2. Editorial items (not findings):
   - **Round-trip correction and `RETIRED`** (§9.3): state that step 2A makes the "record `UNRESOLVED` between hops" route impossible for a retired classified instrument, or scope the deferred round-trip constraint to non-`RETIRED` instruments (B6 already denies them on every subject).
   - **Case submit**: state that `identity_fingerprint` is computed after `lock_instrument(X, UPDATE)` (T-LIN-37).
   - **`lock_tokens`**: restate the "instrument held" precondition.
   - **"Second gate mode"**: classify it once as case (3) or case (4).
   - **Stale citation**: T-LOK-07(m)'s "Blueprint state" cites `05-remediation-r7.md` as the audit record. The normative test should state its own acceptance condition only.
3. The next re-review should examine:
   - F42 (verify-or-acquire semantics and the forged-tracker test);
   - F43 (the identity requirement, the STOP gate, T-ADR-24 as the real identity);
   - F44 (pinned bootstrap functions, the dispatcher pattern, the parse-tree dependency rule, the trigger inventory or `AFTER` check, the reg\* column);
   - F45 (IAM outside the transaction);
   - a regression spot-check of the lock graph and the F37 proof.

   F29, F30, F31 (inversion), F32(b), F33, F35, F37, F38, F39 and F40 are closed above.
4. Reconcile `task.json` `findingsSummary` and `roundCounts` at that checkpoint (TM-R8-1).
5. Implementation remains unauthorised. `PLAN_READY` remains unset.

---

AIX AST-01 v1.7 SEPARATE-CONTEXT RE-REVIEW:
REMEDIATE — IMPLEMENTATION NOT AUTHORISED
