# 04 Review R6 — AST-01: Asset & Instrument Registry + Regulatory Classification (blueprint v1.5)

- **Task ID:** AST-01
- **Review type:** Separate-context independent re-review of the v1.5 remediation. Review only: no remediation, implementation, migration or merge.
- **Reviewer:** high_risk_reviewer / claude-opus-5-5 / HIGH
- **Reviewed commit:** `bd753f8` on `module/AST-01` (v1.5 remediation). History: `78ec1e4` (v1.0) → `45d9a2f` (R1 `REMEDIATE`) → `e20b8ca` (v1.1) → `ccec2ff` (R2 `REMEDIATE`) → `f769689` (v1.2) → `56b0d6d` (R3 `REMEDIATE`) → `b56950f` (v1.3) → `3c222f4` (R4 `REMEDIATE`) → `a33cc3d` (v1.4) → `32fadb0` (R5 `REMEDIATE`) → `bd753f8` (v1.5).
- **Reviewed against:** `04-review-r5.md` (primary: F32(a), F33, F34, F35; closed: F29, F30, F31 inversion, F32(b); external gates: F02, F05, F17, F21), and the v1.5 pack itself.
- **Not relied on:** `05-remediation-r5.md` and the v1.5 README status columns. Every disposition below comes from the v1.5 text, chiefly 05 §§2.1–2.2, 4.1, 5.1, 5.3, 6, 7 and 7A. Each was checked against PostgreSQL locking, MVCC, GUC and constraint semantics, and against a word-level diff of v1.4 → v1.5.

## Decision

# **REMEDIATE**

v1.5 closes the substance of two of the four round-5 findings, and most of a third:
- **F33.** `trg_asset_class_frozen` branch (b) now locks every instrument of the asset itself, so trigger 4's unlocked `asset_class` read is sound for any writer. The first-classification race has exactly the two safe outcomes. The record-insert trigger is one ordered function, and trigger 6 reads `NEW.asset_class_at_record`.
- **F35.** `WITHDRAWN` is terminal per `(instrument_id, admission_ref)`. The elevated-evidence exclusion covers every `SECURITY` record of every basis tree. The marker sequence source is stated once.
- **F34 (substance).** The tracker is now a real data structure: a held-key set with modes, idempotent re-lock, upgrade refusal, and correct `is_local` / savepoint semantics.

The verdict cannot be `ACCEPT`:

| ID | Sev | Summary |
|---|---|---|
| **AST-01-F36 (new, supersedes F32(a))** | LOW | The canonicaliser-freeze mechanism is only partly mechanical. <ul><li>The "semantic digest" is circular and undefined: a no-argument function compares a migration-declared digest with a migration-declared digest.</li><li>The required vector inventory contradicts the canonicaliser's own semantics.</li><li>The `network_registry` "CHECK … EXISTS (SELECT …)" is not valid PostgreSQL.</li><li>The migration hook is an author convention, yet the pack calls it "mechanically enforced, not a migration-author promise".</li></ul> |
| **AST-01-F37 (new)** | **MEDIUM** | Security history can join a classified wrapper's basis through a **late underlying link**. The link is added on a `DRAFT` intermediate instrument after the wrapper's `NON_SECURITY` record, and nothing narrows the wrapper: B8/C0b stay silent, and only sweep S7 notices. This is the F27 shape through `instrument_underlying` instead of `lineage_merge`. It predates v1.5 and no earlier round found it. |
| **AST-01-F38 (new, supersedes F34's residue)** | LOW | v1.5 **deleted** v1.4's rule "lock helpers are the only code that takes these locks". The tracker's idempotency and upgrade rules are sound only if every protocol lock goes through it. Specifically, the F33 trigger's level-1 asset re-lock, which on the protocol path runs *after* level 2 is held, is idempotent only if correction step 2 was taken through `lock_asset`. That site is not listed. Also: `NULL` vs `''` tracker state; the `instrument_underlying` insert is missing from "Who takes what"; FK `KEY SHARE` conflicts with the helpers' `FOR UPDATE`; the `AS006` database-error row is stale. |
| **AST-01-F39 (new)** | LOW | Text precision on security reasoning: <ul><li>The round-trip `A → B → A` protection rests solely on the deferred constraint, which §4.1 calls "not the security control".</li><li>Trigger 4 still cites the application's step 3 as its justification.</li><li>01 §4.7 item 2 words the F35(b) exclusion set differently from 05 trigger 7(iii).</li></ul> |

None of these creates an MB/PSO path for a `SECURITY` outcome (B1 reads the stored outcome and is unchanged). F37 weakens the lineage conjunct for **wrappers** of security-history instruments. None needs a human decision.

**Implementation is not authorised. Nothing is accepted. `task.json` is unchanged (§15).**

---

## 1. Baseline verification (all PASS)

| Check | Result |
|---|---|
| Branch | `module/AST-01` |
| HEAD | `bd753f8` (local and `origin/module/AST-01`, after `git fetch`) |
| Working tree | clean |
| `main` / `origin/main` | both `43f2f34`, untouched |
| Diff `43f2f34..bd753f8` | 11 commits. Every changed path is under `docs/02_modules/AST-01/**` or `docs/03_implementation/tasks/AST-01/**`. **0 paths** outside |
| v1.0–v1.4 unchanged | `git diff <version commit> HEAD -- blueprint/v1.x` is empty for v1.0 (`78ec1e4`), v1.1 (`e20b8ca`), v1.2 (`f769689`), v1.3 (`b56950f`) and v1.4 (`a33cc3d`). Each earlier review file has exactly one commit |
| v1.5 commit | Adds `v1.5/**` (12 files) and `05-remediation-r5.md`; edits the module README and `task.json` (data only) |

## 2. Independence

- **Fresh context.** This review ran in a new Claude Code session. It resumes no authoring, remediation or review session. The only inputs were the task brief, the repository, and (read-only) the conductor's `validateTaskManifest`.
- **Model family.** The reviewer is `claude-opus-5-5`, the same model as R1–R5. The v1.5 author is `claude-sonnet-5` (per `05-remediation-r5.md` and the `bd753f8` trailer). The review is **context-independent but not model-family-independent** with respect to the earlier reviews.
- **Seams checked read-only.** `aix-conductor/dist/records.js` `validateTaskManifest(task.json)` ⇒ `{"ok":true,"errors":[]}`, and the conductor repository was clean before and after. The migration runner is `node-pg-migrate` (`platform/package.json` `migrate:up`), used with no project-level post-migration hook (§5.3).

## 3. Dispositions

### 3.1 Round-5 findings

| Finding | Disposition | Basis |
|---|---|---|
| **F32(a)** Canonicaliser-freeze mechanism | **SUPERSEDED BY NEW FINDING (AST-01-F36)** | §5. Two tables, an assertion and vectors now exist, which is progress. But the semantic-digest step is circular and has no defined input. The vector inventory is internally contradictory. The registry constraint is not valid SQL. The hook is a convention described as mechanically mandatory |
| **F33** SQL did not force the correction to lock instruments first | **CLOSED IN BLUEPRINT** | §6. The trigger enforces the lock for every writer; the lock order and deadlock analysis hold; the first-classification race has two safe outcomes; there is one read. Editorial residue is carried in F39, and the tracker dependency (the asset re-lock) in F38 |
| **F34** Tracker and re-lock not mechanically defined | **SUPERSEDED BY NEW FINDING (AST-01-F38)** | §7. The data model, idempotent re-lock, set algorithm, upgrade refusal, and savepoint/pooling semantics are all correct. But v1.5 removed the helper-exclusivity rule the tracker depends on. The one new re-lock site F33 introduced (a level-1 asset re-lock after level 2) is not listed, and whether it is a no-op or a false `AS006` depends on that deleted rule |
| **F35(a)** `WITHDRAWN` terminal | **CLOSED IN BLUEPRINT** | §8.1 |
| **F35(b)** Unkeyed "newest `SECURITY` bundle" | **CLOSED IN BLUEPRINT** | §8.2. 05 trigger 7(iii) and T-SEC-13 are exact. The 01 wording is aligned under F39, and the basis-set determinism caveat is in F37 |
| **F35(c)** Marker sequence source | **CLOSED IN BLUEPRINT** | §8.3 |

F35 as a whole: **CLOSED IN BLUEPRINT**.

### 3.2 Findings closed in R5 (regression-checked)

| Finding | Result |
|---|---|
| **F29** Class binding independent of the cached fingerprint | **CLOSED, no regression** (§11). B12's two halves, `asset_class_at_record` and `class_binding_matches` are textually unchanged apart from F33's additions |
| **F30** Ordering and visibility | **CLOSED, no regression** (§10) |
| **F31** Original self-first inversion | **CLOSED, no regression** (§9). The real-`SECURITY` apply still derives its set under the gate and locks it ascending in one pass |
| **F32(b)** Attestation ordering | **CLOSED, no regression**. `attestation_seq` is still DB-assigned under the instrument lock and is the only ordering authority. F35(a) adds a refusal on top of it |

### 3.3 Earlier findings

| Finding | Disposition |
|---|---|
| **F17** Canonical identity | **EXTERNAL GATE REMAINS** (DCR-AST1-002(7)) |
| **F21** MYR | **EXTERNAL GATE REMAINS** (DCR-AST1-008(c), OQ-6) |
| **F02** Consumer token adoption | **EXTERNAL GATE REMAINS** (DCR-AST1-004; the `EXM-01` clause (i) is extended for F35(a), and the gate is otherwise unchanged) |
| **F05** Checker identity | **EXTERNAL GATE REMAINS** (DCR-AST1-001(a)+(d)) |
| F18, F19, F22–F28 | Closed, no regression (§§9–11). **F37 is new and adjacent to F19.B/F27**; it does not reopen them as written |
| F20, F26 | Remain superseded (by F27, F29; both closed) |

## 4. Non-negotiable property

A `SECURITY` / `SECURITY_TOKEN` outcome can never reach `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO` or `WITHDRAWAL_MB_PSO`. **Holds.**
- B1 still reads the stored `latest_outcome` (05 §7), and the backstop table B1–B12 is word-identical to v1.4 apart from tags.
- `assert_token_consumable` (i)–(v) is unchanged.
- Trigger 6 now reads `NEW.asset_class_at_record`, which strengthens it.

The v1.4 → v1.5 word diff removes only rewording, with one exception: the deleted helper-exclusivity sentence (F38). It relaxes no predicate.

---

## 5. F32(a) — canonicaliser freeze adjudication

The property required: once `(address_format, canonicalisation_version)` is referenced, its semantics cannot change silently. The goal is not a proof of program equivalence. It is a concrete control where an implementation task knows exactly which immutable artefact is checked.

### 5.1 Semantic digest — **circular and undefined**

| Question | Answer from the v1.5 text (05 §2.2) |
|---|---|
| Who computes the digest? | "**the migration supplies** the current digest of each case it defines". It is a migration-author declaration. No SQL computes it |
| From what bytes? | "sha256 of the rule's normative definition (regex + case rule, as migrated)". No canonical byte representation is defined. The rule lives as one `CASE` arm inside the single multi-version function `ast1.canonicalise_address`, so there is no per-pair artefact to hash |
| How does the supplied digest reach the assertion? | **Undefined.** `ast1.assert_address_rules_frozen()` takes **no arguments**. No table, GUC or parameter carries "the current digest" |
| Can a migration that changes `canonicalise_address` supply the **old** digest? | **Yes**, and step 2 then passes. Nothing ties the supplied value to the function's actual body |
| Can it supply a **new** digest while the registry still holds the old one? | Yes, and step 2 then raises. That only catches an author who honestly reports the change |
| Is step 2 tied to the implementation? | **No.** It compares a declaration against a declaration. T-ADR-15 ("the digest comparison fails") therefore tests the honest-author path only |

**Adjudication:** step 2 is **circular** (self-reported drift detection) and **mechanically undefined** (no input channel, no hashed artefact). It adds no independent enforcement.

**What would make it concrete** (F36 correction 1). Split the rule so each referenced pair has its own immutable artefact. For example, per-pair `IMMUTABLE` functions `ast1.canon__<format>__<version>(text)`, dispatched by `canonicalise_address`. The assertion then computes the digest itself from `pg_catalog`: `sha256(prosrc)` of that per-pair function, plus its signature and volatility, and compares it with the insert-only registry value. The artefact is then exactly identified, computed by SQL, and independent of the migration author. The dispatcher's routing table can be covered the same way, or by the vectors. The alternative is to delete `semantic_digest` and state honestly that the vectors are the behavioural control.

### 5.2 Golden vectors — **the actual behavioural enforcement, with bounded coverage and one internal contradiction**

| Requirement | Result |
|---|---|
| Vectors immutable | **Yes.** Insert-only, trigger-immutable for every role, and the migration role has `INSERT, SELECT` only (05 §2.2, §10; T-ADR-14) |
| A referenced version cannot lose vectors | **Yes**, while the trigger stands. Step 3 also re-checks that the required set exists |
| Required inventory cannot become empty | **Yes.** Step 3 requires the "full required vector set" for every referenced pair |
| Canonicaliser reproduces every vector | **Yes** (step 4) |
| Stored instruments remain fixed points | **Yes** (step 5). This is **more** than a restatement of the `CHECK`: PostgreSQL does not re-validate existing rows when a function used in a `CHECK` is replaced, so step 5 is the only thing that re-evaluates stored rows after a function change |
| Collision check before migration commit | **Yes** (step 6), as the migration's last statement |

**Attack: change semantics only on an input the vectors do not cover.** Example: make `EVM_HEX40` V1 case-preserving for inputs with an uppercase `0X` prefix, or start accepting the `41…` hex spelling for `TRON_BASE58CHECK`.
- Step 2 passes if the author re-supplies the old digest.
- Steps 3–4 pass, because no vector exercises that input.
- Step 5 passes, because stored lower-case values are still fixed points.
- Step 6 passes, because collisions are computed under the *changed* rule, which sees the new spelling as distinct.

The change commits. Afterwards a second spelling of an existing contract can register as a new fixed point (a duplicate identity the unique index cannot see), and the resolver answers raw references differently. Sweep S9 would not flag it, because it also canonicalises under the changed rule.

**The pack therefore overclaims.** Rule 20, INV-23, 01 §3.7, the README and `05-remediation-r5.md` call this a "mechanically enforced invariant, not a migration-author promise". What is actually enforced is:
- behavioural freeze over the frozen vector corpus;
- fixed-point stability of every stored identity;
- no collision under the rule as it now stands.

That is a useful control, and not complete semantic freeze.

**Internal contradiction in the required inventory.** 05 §2.2 requires "a non-canonical equivalent of it (mixed case, alternate prefix, …) with `expected_valid = false`". Step 4 defines `expected_valid ⇔ canonicalise_address(raw) IS NOT NULL`. Under §2.1's own rule, `EVM_HEX40` *accepts* a mixed-case or `0X`-prefixed raw value and returns its lower-case form (not `NULL`). A correct canonicaliser therefore **fails** that mandatory vector, so every migration would abort. An author would "fix" the vector by violating the inventory rule.

The model cannot express the property the `INSERT` path actually enforces: a raw value that is *valid* but *not a fixed point*. The vector needs an `expected_canonical_value` for valid-but-non-canonical input, plus an explicit fixed-point expectation (`raw_input = expected_canonical_value` or not).

### 5.3 Migration hook — **a convention described as mandatory**

- 05 §2.2: every AST-01 migration that touches the listed objects "**must** call `ast1.assert_address_rules_frozen()` as its last statement". Where the harness supports a mandatory hook, that is "the preferred place".
- The project's harness today is plain `node-pg-migrate up` over `infra/migrations/*.cjs`, with no post-migration hook configured. Nothing makes the call automatic. A migration that replaces `canonicalise_address` and omits the call commits unchecked.

That is acceptable as a clearly stated implementation requirement, per the brief. It is **not** acceptable to call it "mechanically enforced". Two mechanisms are available today and should be named:
1. An `ast1` **event trigger** on `ddl_command_end` whose tag filter covers `CREATE FUNCTION` / `ALTER FUNCTION` / `DROP FUNCTION` / `ALTER TABLE` and whose function inspects `pg_event_trigger_ddl_commands()` for the canonicaliser, address-rule and identity objects, then calls the assertion inside the same transaction. This is automatic for any DDL path, but creating it needs superuser, which is a migration-bootstrap decision.
2. A **CI gate**: after `migrate:up` in the integration suite, the assertion is called; and a source scan fails any `infra/migrations/*ast1*` file that touches those objects without the call.

Either is acceptable if stated as what it is.

### 5.4 `network_registry` constraint — **not implementable as written**

05 §2.2 extends the `CHECK` with `EXISTS (SELECT 1 FROM ast1.address_rule_version …)`. PostgreSQL rejects subqueries in `CHECK` constraints ("cannot use subquery in check constraint"). The "required vector set exists" condition also cannot be a `CHECK`.
- Condition (i) should be a composite **foreign key** `(address_format, canonicalisation_version) REFERENCES ast1.address_rule_version`.
- Condition (ii) should be a `BEFORE INSERT OR UPDATE` trigger.

T-ADR-13's last sentence tests the non-existent `CHECK`.

### 5.5 Network / old-instrument regression — **holds**

| Check | Result |
|---|---|
| A network version change affects future registrations only | **Yes.** 05 §2.1 "Versioning", §2.2 last two paragraphs, T-ADR-18 |
| Existing instrument keeps its stored version | **Yes.** `address_canonicalisation_version` is immutable from insert (two triggers) |
| A `SUSPENDED` network does not block retire, class correction or other tightening | **Yes.** The `UPDATE` arm compares `OLD`/`NEW` only and never reads `network_registry` or the new tables. The instrument FK `(chain, network)` is not re-checked on an `UPDATE` that leaves it unchanged. The instrument `CHECK` re-runs under the row's own version, which the freeze keeps defined |
| No current-network reinterpretation of old rows | **Yes.** 08 `address_canonical_violation` is now worded against "the instrument's own stored … version"; S9 likewise |

---

## 6. F33 — SQL-enforced class-correction locking

### 6.1 Actual PostgreSQL lock order

**Protocol path** (05 §7A "Asset class correction apply"):
- G: the change row `FOR UPDATE`.
- Step 2: the asset `FOR UPDATE` (level 1).
- Step 3: `lock_asset_instruments`, ascending `FOR UPDATE` (level 2).
- Step 5: `UPDATE asset SET asset_class`. The executor's tuple lock is on a row the transaction already holds, so there is no wait. Then `trg_asset_class_frozen` fires. Its asset `FOR UPDATE` re-lock and its `lock_asset_instruments` call are both no-ops, **provided both are tracker-recorded** (F38).
- Then the fingerprint `UPDATE`s (each firing `trg_instrument_lock_on_write`, a re-lock no-op), the marker inserts, token revocation (level 3), and the audit rows.

**Raw or defective writer** (`UPDATE asset SET asset_class` with no prior locks):
- The executor locks the asset tuple before the `BEFORE ROW` trigger body runs. In any case the trigger's own `FOR UPDATE` comes first in the body.
- Branch (b) then calls `lock_asset_instruments(asset_id)`, taking every instrument, record-less ones included, `FOR UPDATE` ascending, **before** it permits the change.

The order is **asset (level 1) → instruments ascending (level 2) → only then the class change**, as the brief expects. The new tuple version is not written until the `BEFORE` trigger returns, so no other transaction can observe the new class before every instrument is held.

**Set stability.** An instrument insert takes the asset `FOR SHARE` (`trg_instrument_asset_lock`). That conflicts with both the executor's `FOR NO KEY UPDATE` and the helper's `FOR UPDATE`. So no instrument of this asset can appear between enumeration and commit.

### 6.2 Deadlock analysis — **no cycle**

The feared cycle: correction C holds asset A and waits for instrument I; classification W holds I and waits to read A.

- **Does W's read of `asset.asset_class` wait?** No. Trigger 4's read (05 §5.1) is a plain `SELECT` with no locking clause. Under PostgreSQL MVCC a plain `SELECT` never waits on row locks or on another transaction's uncommitted `UPDATE`. It returns the newest version committed before its statement snapshot, here the pre-correction tuple. (In the raw path, C's new tuple does not even exist yet: the `BEFORE` trigger is blocked in `lock_asset_instruments`.) W's wait-for edge to A does not exist.
- **Does W take any explicit or hidden asset lock?** No.
  - The record trigger, `authoritative_state()` and the lineage derivation read `asset` without a locking clause.
  - `classification_record` has no FK to `asset`.
  - Case submit's identity-lock `UPDATE instrument` does not re-run the FK to `asset`, because `asset_id` is unchanged (and immutable), and PostgreSQL skips the RI check when the FK columns are unchanged.
  - `trg_instrument_asset_lock` is `BEFORE INSERT` only.
- **Other edges.** C takes no gate, so W's gate `SHARE` cannot be something C waits on. The marker insert's FK `KEY SHARE` on the asset, instrument and change row is on rows C already holds.

**The stated lock proof is correct.**

### 6.3 First-classification race (record-less X; correction C vs first classification W)

Both writers take X's row lock `FOR UPDATE` before anything that matters: C in step 3 or in the trigger, W in record-trigger step 2(b). PostgreSQL grants X to one of them at a time.

| Order | What happens | Result |
|---|---|---|
| **W first** | W holds X. C either waits at step 3 (before its `UPDATE`), or, as a raw writer, inside the trigger (before its tuple is written). W's trigger-4 read sees the committed old class and stamps `asset_class_at_record = old`. Trigger 6 reads that same `NEW` value. W commits. C gets X. C's deferred constraint, evaluated at commit with a fresh snapshot, sees W's record and requires the fingerprint change and marker for X; a defective writer that omitted them cannot commit. After C commits, `class_binding_matches(X) = false` (old ≠ new) and **B12 denies** | Outcome 1 |
| **C first** | C holds X until commit, and W's `lock_instrument(X)` waits. After C commits, W's next statement inside the trigger function takes a fresh `READ COMMITTED` snapshot (the function is `VOLATILE`), so trigger 4 stamps the **new** class. Trigger 6 evaluates `NEW.asset_class_at_record ∈ {SECURITY, SECURITY_TOKEN}` and refuses `NON_SECURITY`. Separately, trigger 4's fingerprint equality against C's recomputed cache would also refuse a stale TypeScript fingerprint | Outcome 2 |

**No hybrid record.** The class is read once (trigger 4) and every class-dependent check in the same insert (trigger 6) reads `NEW.asset_class_at_record` (05 §5.1 preamble and step 6). No second live read exists that could produce a mixed snapshot. Trigger 7 reads lineage and `SECURITY` history, not the asset class, so it is unaffected.

### 6.4 Round trip `A → B → A`, re-derived

Let r be instrument I's current record, with class A and fingerprint fA.
- **Hop 1 (A → B).** The cache becomes fB. The deferred constraint requires fB ≠ r.fp (holds), and the marker chains fA → fB.
- **Hop 2 (B → A)**, with no record in between. A correct recompute yields fA again, and the constraint `identity_fingerprint <> r.identity_fingerprint` is false, so **the hop is refused**. A defective writer that leaves fB or writes any fX ≠ fA can commit, but then `record_fingerprint_matches(r) = false` and B12 denies.

So by SQL, after any committed correction, every current record's fingerprint differs from its instrument's cache, and B12's fingerprint half denies. **No class-label round trip revives stale eligibility.** The operator route (record `UNRESOLVED` between hops, T-FPR-13) is sound: the current record becomes u (class B, fB), and after B → A both halves deny for u, while r is no longer current.

**Text defect (F39).** If hop 2 were ever committed with the cache at fA, **both** B12 halves would pass (fA = fA and A = A). The round-trip protection is therefore **entirely** the deferred constraint. Yet 05 §4.1 calls it "a correctness backstop on the writer, not the security control", and 05 §4.1 / 01 §3.4 say "none of [the checks] is satisfied by 'the class matches again' alone". For the round trip, the class-binding half *is* satisfied. The conclusion is right; the stated reason is not.

**Adjudication: F33 CLOSED IN BLUEPRINT.**

---

## 7. F34 — the lock tracker

### 7.1 State and `set_config(…, true)` semantics

| Claim (05 §7A, rule 22, INV-20) | PostgreSQL behaviour | Result |
|---|---|---|
| Transaction-local via `is_local = true` | `set_config(n, v, true)` ≡ `SET LOCAL`. It is discarded at `COMMIT` and at `ROLLBACK` | Correct |
| Reverts at `ROLLBACK TO SAVEPOINT`, together with row locks taken since | GUC changes are stacked by transaction nesting level. A subtransaction abort restores the prior value for both `SET` and `SET LOCAL` ("the effects of `SET` or `SET LOCAL` are also canceled by rolling back to a savepoint that is earlier than the command"). Row locks taken in the aborted subtransaction carry that subtransaction's xid and are released when it aborts. **Both revert together.** The same holds for PL/pgSQL `EXCEPTION` blocks, which are internal subtransactions | Correct |
| Subtransaction commit (`RELEASE`, a block exiting normally) | The GUC entry merges into the parent, and the row locks remain held by the parent | Consistent (not stated; harmless) |
| Function `SET` clauses | `SET LOCAL` inside a function is reverted at exit **only** for a variable the function's own `SET` clause names. A hardening clause such as `SET search_path` does not revert the `ast1.*` tracker keys | Safe, provided no helper declares `SET ast1.…` (implementation note) |
| PgBouncer transaction mode / session reuse | `is_local` state never outlives the transaction, so there is no carry-over. v1.4's reliance on `BEGIN` or the pooler is gone | Correct |
| "`current_setting('ast1.…', true)` returns an empty string for an unset key" | **Inaccurate.** It returns **`NULL`** while no placeholder for that name exists in the session. It returns `''` only after an earlier `set_config` created the placeholder and the value reverted. Helpers must treat `NULL` and `''` alike as "nothing held". A helper that casts `''::bigint` fails closed (availability); one that treats `NULL` as a number is at risk of three-valued-logic slips | **F38** item (ii) |

### 7.2 Idempotent re-lock and the set algorithm

The algorithm in 05 §7A: dedupe → sort → drop keys held at the same or a stronger mode → nothing left ⇒ success → smallest *new* id must exceed the highest id acquired → `AS006` **before** any lock statement → acquire ascending → update the tracker only after the whole batch succeeds.

| Attack | Result |
|---|---|
| Hold low L, then high H; request {L, H} again | Both are dropped in step 3, nothing remains, **success**, no statement, no tracker change (T-LOK-07(b), (f)) |
| Hold high H; request a **new** lower N < H | Step 5: N ≤ H ⇒ **`AS006` before waiting** (T-LOK-07(a) asserts no `FOR UPDATE` on N was issued) |
| Hold L < H; request {L, Z} with Z > H | L is dropped; Z > H; **success** |
| Same key, same or weaker mode | No-op, exempt from the level check (rules 1, 2) |
| Consume: instrument `SHARE` (level 2) → token (level 3) → trigger instrument `SHARE` | Held key, same mode ⇒ no-op, not a downward level re-entry (T-LOK-07(c)) |

**Adjudication:** correct for every key the tracker knows about. The algorithm is only as complete as the set of locks routed through it (§7.4).

### 7.3 Lock-mode upgrade

Held `SHARE`, request `UPDATE` ⇒ `AS006` (rule 3; T-LOK-07(e)). Every path in "Who takes what" was searched for a legitimate upgrade:

| Path | Strong mode first? | False trip? |
|---|---|---|
| `authoritative_state()` inside any writer | Writers call `lock_instrument()` first (§7A "`authoritative_state()` and lock order"); its `SHARE` is then rule 2 | No |
| Record-trigger re-lock (non-`SECURITY`, real `SECURITY`), merge-trigger re-lock | Same mode as the application's locks | No |
| Consume trigger | `SHARE` after `SHARE` | No |
| Case submit | One `UPDATE`, no prior `SHARE` | No |
| Classification writer, evidence | Gate `SHARE` then instrument `UPDATE`, different keys. "Never an evidence insert before a real-`SECURITY` record in one transaction" is stated | No |
| Correction | Asset `UPDATE` then instruments `UPDATE`; the trigger re-locks the same modes | No, **if** step 2 is tracker-recorded (F38) |
| Merge | Gate `UPDATE`, set `UPDATE`; step-6 `authoritative_state` ⇒ rule 2 | No |
| Hold, admission, custody, operational, attestation, retire | App `lock_instrument` first; the table trigger's lock and `backstop_permits` ⇒ rule 1/2 | No |
| Mint (`evaluate`) | `SHARE` only. Holds after a trip are placed in a **separate** transaction (04 §6.1 step 10; 05 §5.2) | No |
| Verify-decision follow-ups (revoke, hold) | "Separate transactions" (05 §7A failure table) | No |
| Sweep | One transaction per instrument, or an ascending set | No |

**Adjudication:** no specified normal path needs an upgrade, and none false-trips, subject to F38(i).

### 7.4 What v1.5 removed: helper exclusivity (F38)

v1.4 05 §7A said: "Lock helpers (`lock_lineage_gate_shared/exclusive`, `lock_asset`, `lock_instrument`, `lock_affected_instruments`, `lock_merge_affected_instruments`, `lock_asset_instruments`) **are the only code that takes these locks**". The v1.5 rewrite of that paragraph dropped the sentence. No other file restates it (`grep "only code"` finds nothing in the blueprint).

Every idempotency and upgrade decision is sound only for locks the tracker recorded. Several protocol locks are written in the v1.5 text as raw SQL:
- correction step 2 ("`SELECT … FOR UPDATE`");
- the trigger's asset lock in §4.1;
- `authoritative_state()`'s `FOR SHARE`;
- mint step 1;
- consume steps 2–3.

The concrete consequence falls on F33's new site. On the protocol path, `trg_asset_class_frozen`'s asset lock (level 1) runs **after** step 3 holds level 2. It is an idempotent re-lock only if step 2 was recorded by `lock_asset`. If step 2 is raw SQL and the trigger uses the helper, the tracker sees a *new* level-1 key after level 2 and raises **`AS006` on every correction**. That is the F34 failure class on a normal path. The site is also missing from the re-lock enumeration (which lists branch (b)'s `lock_asset_instruments()` but not its asset re-lock). T-LOK-01's "zero false `AS006`" sweep would catch it at test time, but the design text leaves it open.

### 7.5 Raw SQL / trigger paths

- **Supported runtime path:** every lock is taken in ascending level and key order through the helpers. The tracker enforces this mechanically (AS006 before any wait).
- **Database-trigger fail-closed path:** a raw `UPDATE … SET consumed_at_utc` takes the token tuple lock in the executor, which the tracker never sees, and then the trigger's instrument `SHARE`. This is inverted (3 → 2), and **the tracker cannot detect it**: the level-3 lock was not taken through a helper. Against a revoker holding the instrument `FOR UPDATE` and wanting the token, PostgreSQL's deadlock detector aborts one side.
  - If the consumer is aborted, nothing is consumed.
  - If the revoker is aborted, its governed change or hold rolls back and is retried. The consumer then consumes only if `assert_token_consumable()` passes under the instrument lock, so the uncommitted narrowing was never in effect. **Safety stays closed.**
- 05 §7A states this honestly ("unsupported; … fail-closed"), and INV-20/rule 19 make no stronger availability claim for raw SQL. **Not penalised.**
- One precision is still owed (F38(iii)): the tracker governs helper-taken locks only. Executor-implicit locks (`UPDATE` tuple locks, FK `KEY SHARE`) are outside it and are covered by the lock-order argument or by deadlock detection, not by `AS006`.

**Adjudication:** the tracker's own design closes F34's required items 1–5. The residue (exclusivity rule deleted, the unlisted level-1 re-lock site, `NULL`/`''`) moves to **F38**.

---

## 8. F35

### 8.1 (a) `WITHDRAWN` terminal — **closed**

- `trg_attestation_binding` (05 §6) takes `lock_instrument(instrument_id)` first. Under it, it refuses an `ADMITTED` insert when **any** `WITHDRAWN` row exists for the same `(instrument_id, admission_ref)`, independently of `attestation_seq` (INV-27, 01 §8.6, 04 route row, 06 SM-8, 09 `AST1_ATTESTATION_INVALID`).
- **`ADMITTED` → `WITHDRAWN` → late or retried `ADMITTED`:** refused (T-ATT-04). A forged `received_at_utc` is irrelevant.
- **Concurrent `WITHDRAWN` vs delayed `ADMITTED`:** both inserts take X's lock first (05 §6: "Every insert/update on these tables first calls `ast1.lock_instrument`").
  - If `WITHDRAWN` commits first, the waiting `ADMITTED`'s existence check runs as a fresh statement after the lock is granted, sees it, and is refused.
  - If `ADMITTED` commits first, `WITHDRAWN` then gets a higher `attestation_seq` and wins.
  - Either way the final state is withdrawn. No revival.
- **Re-admission** needs a new `admission_ref`. DCR-AST1-004 clause (i) now tells `EXM-01` exactly that: never resend `ADMITTED` for a withdrawn `admission_ref`; a genuine re-admission is a new `admission_ref` for a new listing event.

### 8.2 (b) `SECURITY` evidence exclusion — **closed in 05; 01 wording to align (F39)**

| Check | Result |
|---|---|
| No ambiguous "newest `SECURITY` bundle" | **Removed everywhere.** Every remaining hit is a sentence that quotes the withdrawn phrase in order to reject it (01 §4.7, 02 W3, 05 trigger 7(iii), 12 AR-37, README) |
| Exclusion set | 05 trigger 7(iii): the `content_sha256` of any item in the bundle of **any** real `SECURITY_OR_SECURITY_TOKEN` record in `SEC(G)` for **every** `G ∈ B(X)`. This is exact and needs no recency key |
| Underlying trees included | **Yes.** `B(X)` is X's own merge tree plus the merge tree of each transitive underlying (05 §7, depth ≤ 8; depth > 8 fails closed). T-SEC-13 builds one `OWN_LINEAGE` and one `UNDERLYING_LINEAGE` tree |
| Basis-tree set deterministic | **At a fixed ledger state, yes.** Caveat: `B(X)` can grow concurrently through a late `DRAFT` underlying link (F37), which the gate does not serialise. F37's correction fixes both |
| Comparison by content hash | **Yes** (`content_sha256`) |
| Evidence still newer than the floor | **Yes** (`evidence_global_seq > F`) |
| `follows_event_*` binding | **Retained** (7(iv); `binding_stale`) |
| **Wording drift** | 01 §4.7 item 2 says "any … record **contributing security history to the current review floor**". This can be read as narrower than 05's `SEC(G) ∀G ∈ B(X)` (for example, only the record that sets F). 05 is normative and T-SEC-13 pins the broad reading, but a security rule must not have two wordings. **F39** |

### 8.3 (c) Marker sequence source — **closed**

05 §1 rule 20, §5.3, 01 INV-21 and S8 all state that `marker_global_seq` draws from `ast1.classification_global_seq`. `attestation_seq` is the only dedicated sequence, and no text describes a marker-only sequence. T-SCH-13 introspects the source.

**Scope:** the only marker comparison ("the newest marker explains the newest fingerprint") is same-instrument, drawn under that instrument's lock throughout the correction (clause (i) of the scope statement). No claim of global commit order for unrelated events is made.

---

## 9. Full lock-graph regression

Levels: G (change row) → 0 (gate) → 1 (asset) → 2 (instruments ascending) → 3 (tokens) → 4 (append-only). The graph was rebuilt from 05 §§3–7A, 02 W11–W13 and 04 §8, including executor-implicit locks.

| Path | Sequence | In order? |
|---|---|---|
| Classification record, non-`SECURITY` | G → 0 `S` → 2 X → 3 → 4 | yes |
| Real `SECURITY` apply | G → 0 `X` → derive set (no lock) → 2 set ascending, one pass → re-derive → 3 → 4 | yes |
| Evidence insert | 0 `S` → 2 X → 4 | yes |
| Case submit | 2 X (identity-lock `UPDATE`) → 4 | yes |
| Lineage merge | G → 0 `X` → resolve roots under the gate → 2 ascending → trigger re-lock (no-op) → 3 → 4 | yes |
| `ASSET_CLASS_CORRECTION` (protocol) | G → 1 `X` → 2 all instruments ascending → `UPDATE asset` (executor tuple lock on an already-held row; trigger re-locks: no-op **if tracked**, F38) → 3 → 4 | yes |
| `ASSET_CLASS_CORRECTION` (raw) | executor 1 → trigger 1 `X` → 2 ascending → class change | yes |
| First / any instrument insert | 1 `S` → new row → FK `KEY SHARE` on its asset (already held `S`) and `network_registry` (never write-locked at runtime) → 4 | yes |
| Hold (place/release, `SYSTEM`) | (G) → 2 X → 3 → 4 | yes |
| Admission / custody / operational / attestation / retire / restrictions / jurisdiction | (G) → 2 X → (3) → 4. Trigger `lock_instrument` and `backstop_permits` ⇒ re-locks | yes |
| Evidence-standard retirement | (G) → 2 ascending → 3 → 4 | yes |
| Mint | 2 `S` → 4 (FK `KEY SHARE` on an instrument already held `S`) | yes |
| Consume | 2 `S` → 3 `X` → trigger 2 `S` (held) | yes |
| Attestation (F35(a)) | (G) → 2 X → existence check → 4 | yes |
| Integrity sweep | Per instrument, or an ascending set: 2 → 3 → 4 | yes |
| **`instrument_underlying` insert (link)** | **Not in the table.** FK checks take `FOR KEY SHARE` on **two** instrument rows (`instrument_id`, `underlying_instrument_id`) in FK-trigger order, not ascending | **no — see below** |

**Pairwise results:**
- **Correction ↔ classification / real-`SECURITY` apply / merge / retirement / mint / consume / hold / admission / first insert:** acyclic. The analysis in §6.2 and in the R5 lock-graph adjudication is reconfirmed. F33's trigger adds no new edge: in the raw path it only moves the instrument acquisition earlier, keeping the correct order.
- **F34 rule changes add no edge.** A refused upgrade or out-of-order request aborts before waiting.
- **Hidden edge: FK `KEY SHARE` vs `FOR UPDATE`.** R5 §11 concluded "no hidden edge" because FK `KEY SHARE` does not conflict with `FOR NO KEY UPDATE`. But the helpers take **`FOR UPDATE`**, which **does** conflict with `FOR KEY SHARE`.
  - Most FK inserts reference rows the inserter already holds, so they add no edge.
  - The exception is the underlying-link insert. Link L (W → U, W `DRAFT`) takes `KEY SHARE` on W, then U. A correction or real-`SECURITY` writer C holding U (lower id) `FOR UPDATE` waits for W (L holds `KEY SHARE`). L then waits for U. That is a two-cycle. PostgreSQL aborts one side after `deadlock_timeout`. **Fail-closed, availability only.** The case-open insert's single `KEY SHARE` creates no cycle.
  - This predates v1.5, is not introduced by F33/F34, and contradicts "Who takes what (every writer; none unspecified)". Carried in **F38(iv)**.

**Result:** no cycle on the supported paths; F33/F34 introduced none. One unlisted path exists (the link insert), and it deadlock-aborts fail-closed.

## 10. F30 regression

| Item | Result |
|---|---|
| `READ COMMITTED` assertion unavoidable | **Holds.** It is the first statement of `authoritative_state()` and of every lock helper (05 §7; T-ISO-04 lists all seven helpers, `lock_asset` included). F38(i) asks v1.5 to restore the rule that the helpers are the only lock-taking code, which is what makes "every path is covered" true |
| Gate-first lineage merge | **Holds.** 05 §3 steps 1→7 are unchanged in order. The v1.5 editorial overwrites `NEW.surviving/merged_lineage_id` with the resolved roots. *Implementation note:* step 5 matches the change payload against the caller's **original** arguments, so the trigger must capture them before overwriting |
| Sequence-order claim limited to proven pairs | **Holds.** INV-25 and the §7A scope statement are unchanged. The marker scope is stated (§8.3) |

## 11. F27 / F29 regression

| Item | Result |
|---|---|
| Merge narrowing immediate | **Holds.** Clause (b), merge steps 6–9, revocation in the merge transaction |
| Tokens revoked | **Holds.** Merge step 7, correction step 6, `SECURITY` apply |
| B8 ≡ C0b | **Holds.** 05 §7 `lineage_review_required` is textually unchanged; T-DB-17 / T-LIN-24 |
| B12 = fingerprint **and** live class binding | **Holds.** Each half is sufficient; trigger 6 now uses the stamped class (stronger) |
| `SECURITY` cannot reach MB/PSO | **Holds** (§4) |
| **Adjacent gap found** | A late underlying link joins older `SECURITY` history to a classified wrapper with no narrowing: **F37**. It is outside F27's merge path, so F27 is not reopened as written |

## 12. Latest / newest / current / most-recent audit (whole v1.5)

Every hit outside 10 was enumerated (56 hits). Security-relevant ones:

| Rule | Ordering key | Status |
|---|---|---|
| Current / effective record, `latest_outcome`, `current_record_id`, "newest record" (B-rules, S1, consume step 5, admission and attestation binding, marker `superseded_record_id`) | max `record_seq`, DB-assigned under the instrument lock | OK |
| Review floor, "newest triggering event over every basis tree", `follows_event_*`, `review_floor_global_seq` | max of `global_seq` (real `SECURITY` in `SEC(G)`) and qualifying `merge_global_seq` | OK (F37 caveat on `B(X)` growth) |
| Elevated-evidence exclusion | no recency: every `SEC(G)`, `∀G ∈ B(X)` | OK in 05; 01 wording to align (F39) |
| "Newest marker explains newest fingerprint" | same-instrument `marker_global_seq` (shared sequence) under the instrument lock | OK |
| Attestation "newest wins" | `attestation_seq`, plus the `WITHDRAWN`-terminal refusal | OK |
| B11 "newest record's standard" | via `record_seq` | OK |
| `network_registry.canonicalisation_version` "current" | selects future registrations only; never re-applied to stored rows | OK |
| 08 `address_canonical_violation` | "the instrument's own stored … version" | OK (fixed) |
| Token expiry | DB `clock_timestamp()`; an expiry check, not an ordering | OK |
| Holds, admissions, custody, operational state, restrictions, jurisdiction rules | status or unique live row; no recency | OK |

No security-sensitive recency depends on a caller timestamp or an ambiguous row selection.

## 13. OQ-8

**OPEN / UNDECIDED / NON-BLOCKING.** v1.5 adds no draft-correction path (17 §3). Neither F36 nor F37 bears on it. F37's recommended correction (a link target must be non-`DRAFT`) constrains *new links*, not the correction of a `DRAFT` typo, and does not decide OQ-8.

## 14. External gates

- F02 (DCR-AST1-004), F05 (DCR-AST1-001(a)+(d)), F17 (DCR-AST1-002(7)) and F21 (DCR-AST1-008(c), OQ-6) remain stated honestly in 17 §2, and none is claimed closed.
- DCR-AST1-004's `EXM-01` clause (i) is extended for F35(a); it is still a specified contract.
- No DCR is implemented or executed.

## 15. Task state

- `task.json`: `state: IDLE`, `acceptanceStatus: NOT_ACCEPTED`, `PLAN_READY` not set. It is conductor-valid (`{"ok":true,"errors":[]}`).
- **Not modified by this review.** No lifecycle event is invented. `findingsSummary` still lists F32–F35. Reconciling it (F33, F35 closed; F32 → F36; F34 → F38; new F37 MEDIUM, F39 LOW) is left to the next remediation checkpoint.
- **`PLAN_READY` must not be set** by any author or reviewer. Only the human/conductor `approve-plan` checkpoint sets it, after an `ACCEPT` re-review. Even an `ACCEPT` would be architecture/blueprint acceptance only.

---

## 16. Findings (open after this review)

Severity uses the `OPEN_FINDINGS` vocabulary. **None requires a human decision.**

### AST-01-F36 — LOW — Canonicaliser-freeze mechanism is partly declarative: circular semantic digest, contradictory vector inventory, invalid `CHECK`, convention-only hook (supersedes F32(a))

- **Evidence (§5):**
  - 05 §2.2 step 2 compares the registry's `semantic_digest` with "the current digest … the migration supplies", but `assert_address_rules_frozen()` has no parameter, no input channel is defined, and no SQL computes a digest from the implementation. A behaviour-changing migration that re-supplies the old digest passes.
  - The required vector "non-canonical equivalent (mixed case, alternate prefix) with `expected_valid = false`" fails step 4 against §2.1's own `EVM_HEX40` rule, which accepts such input and returns the lower-case form.
  - `network_registry` "`CHECK … EXISTS (SELECT …)`" is rejected by PostgreSQL (no subqueries in `CHECK`).
  - The hook is "must call … as its last statement", with no automatic mechanism in the `node-pg-migrate` harness. Yet rule 20, INV-23, 01 §3.7, README and 12 AR-34 say "mechanically enforced, not a migration-author promise".
  - A semantic change on an input outside the vectors passes every step (§5.2 attack).
- **Affected sections:** 05 §1 rule 20, §2.2 (table comment, vector coverage, steps 2–6, migration hook, `network_registry` constraint), §12; 01 INV-23, §3.7; 12 AR-34; README; 10 T-ADR-13, T-ADR-15.
- **Required correction:**
  1. Make the digest mechanical, or remove it. The recommended form: one `IMMUTABLE` function per `(format, version)`, and the assertion itself computes `sha256` over that function's `pg_proc` source and signature and compares it with the insert-only registry. The dispatcher's routing is covered by vectors or by the same digest. Remove "the migration supplies". If the digest is dropped instead, say so and name the vectors as the behavioural control.
  2. Fix the vector model: a valid-but-non-canonical vector has `expected_valid = true` and `expected_canonical_value ≠ raw_input`. Add a fixed-point expectation, or state the rule `raw_input = expected_canonical_value ⇔ fixed point`. Require, per format, at least one valid-non-canonical vector, one fixed-point vector and one invalid vector per rejection class.
  3. Replace the `CHECK … EXISTS` with a composite FK to `address_rule_version` plus a `BEFORE INSERT OR UPDATE` trigger for "vector set present".
  4. Make the hook automatic (an `ast1` `ddl_command_end` event trigger calling the assertion in-transaction, or a CI gate that runs the assertion after `migrate:up` and source-scans every `ast1` migration), or state it as an implementation requirement without the "mechanically enforced" claim.
  5. Restate the property as what is enforced: behavioural freeze over the frozen vector corpus, fixed-point stability of every stored identity, no collision, and (after 1) an unchanged per-version implementation. Do not claim complete semantic freeze. Rewrite T-ADR-15 against the computed digest, and T-ADR-13's `CHECK` clause against the FK/trigger.
- **Implementation impact:** P1 schema and migration text: per-version functions or a dropped digest, one FK, one trigger, one hook mechanism, vector-model columns.
- **Human decision:** No. (If option 4's event trigger is chosen, whether the migration bootstrap may hold superuser to create it is an ordinary platform-ops choice, not a policy decision.)

### AST-01-F37 — MEDIUM — Late underlying-link extension joins older `SECURITY` history to a classified wrapper without narrowing

- **Evidence:**
  - `instrument_underlying` rows may be inserted while the **linking** instrument is `DRAFT` (05 §4.3 `trg_underlying_insert_only`; 04 `POST …/underlyings`, `ast1.registry.propose`, no checker). Nothing requires the **linked-to** instrument to be non-`DRAFT`.
  - Sequence:
    1. Register U (`DRAFT`), then X (`DRAFT`), and link X → U.
    2. Submit and classify X `NON_SECURITY` (not elevated: no `SECURITY` in `B(X)`).
    3. While U is still `DRAFT`, link U → V, where V's merge tree holds an **older** real `SECURITY` record r.
  - `B(X)` now includes V's tree (05 §7: transitive underlyings, computed live). But `lineage_review_required(X)` fires only for (a) a `SECURITY` record **newer** than X's current record, or (b) a **merge** newer than it. r is older, and a link is neither. B8 and C0b stay false, and X keeps its eligibility (including MB/PSO subjects).
  - X's fingerprint hashes only X's own link descriptors, so B12 is silent too. Only sweep S7 ("security history not reflected in `elevated_basis` although the record's `global_seq` is later") detects it, contrary to rule 13 / T-INT-10 ("safety never waits for a sweep"; safety assertions are made with the sweep disabled) and INV-17 ("cannot be avoided by …").
  - Secondary effects:
    - `B(X)` is not stable at elevated apply, because the gate does not serialise link inserts (§8.2).
    - The v1.5 editorial reason for affected-set stability ("any newcomer is necessarily record-less") is false. A new link on record-less U makes every *classified* wrapper of U a newcomer. That case is saved only by clause (a) for a *new* `SECURITY` record, not by the stated reason.
  - This is the F27 shape (older `SECURITY` joined to a newer `NON_SECURITY`) through `instrument_underlying` instead of `lineage_merge`. It predates v1.5.
- **Affected sections:** 05 §4.3 triggers, §5.1 trigger 2(c) and 7 (basis set), §7 `lineage_review_required`, §7A lock-set re-derivation reason, §7.1 S7; 01 §3.6, INV-17, §4.7, §4.7A; 02 W1 row 4, W11; 04 `…/underlyings`; 10 T-LIN.
- **Required correction (choose one and state it):**
  1. **(recommended)** An `INSTRUMENT` link may target only an instrument that is **not** `DRAFT` (`IDENTITY_LOCKED` or `RETIRED`), checked under that target's lock. Since links are only ever added by a `DRAFT` instrument, every instrument reachable through a link then has a frozen link set, so `B(X)` of any classified X changes only through merges (clause (b), gate-serialised). Restate the §7A/W11 stability reason accordingly.
  2. Or: treat an `INSTRUMENT` link insert as a lineage-wide ledger event. It takes the gate exclusively, locks the wrappers of the linking instrument ascending, draws a `link_global_seq` from the shared sequence, and adds a clause (c) to `lineage_review_required` / C0b (a link newer than X's record whose target tree holds `SECURITY` history). It revokes tokens in the same transaction.
  - Either way, add a test: X classified `NON_SECURITY`, then a late link U → V with older `SECURITY` in V's tree ⇒ refused (option 1), or X is `NOT_ASSESSED` `LINEAGE_SECURITY_REVIEW_REQUIRED` with B8 denying and the sweep disabled (option 2).
- **Implementation impact:** P1 (one trigger condition for option 1; a new event type, clause and parity tests for option 2). Blocks P1/P3 lineage work.
- **Human decision:** No. Option 1 is a tightening inside the approved F19.B / AST-HD-8 design and removes no approved capability. A wrapper's underlying must already exist as a registered instrument, and option 1 only requires it to be identity-locked first.

### AST-01-F38 — LOW — Lock-tracker completeness: helper-exclusivity rule deleted in v1.5; unlisted level-1 re-lock; `NULL` tracker state; unlisted link-insert path (supersedes F34's residue)

- **Evidence (§§7.1, 7.4, 7.5, 9):**
  - **(i)** v1.4's "Lock helpers … are the only code that takes these locks" was dropped in v1.5's rewrite of 05 §7A; no file restates it. Several protocol locks are written as raw `SELECT … FOR …` (correction step 2, §4.1's trigger asset lock, `authoritative_state()`, mint step 1, consume steps 2–3). On the protocol correction path, the F33 trigger's level-1 asset re-lock runs after level 2 is held. It is idempotent only if step 2 went through `lock_asset`; otherwise the tracker raises a false `AS006` on every correction. The site is missing from the re-lock enumeration.
  - **(ii)** "`current_setting(…, true)` returns an empty string for an unset key" is wrong for a fresh session (`NULL`).
  - **(iii)** Scope is unstated: the tracker governs helper-taken locks only. Executor-implicit locks (tuple locks of `UPDATE`, FK `KEY SHARE`, the raw consume's token lock) are outside it.
  - **(iv)** The `instrument_underlying` insert is missing from "Who takes what (every writer; none unspecified)". Its two FK `KEY SHARE`s conflict with the helpers' `FOR UPDATE` and can two-cycle with an ascending writer. PostgreSQL aborts one side (fail-closed). R5 §11's "no hidden edge" reasoning assumed `FOR NO KEY UPDATE`.
  - **(v)** 09 `AS006` (database-error table) is not extended to the upgrade refusal, which the README claims it is (the thrown-error row `AST1_LOCK_SET_CHANGED` is).
- **Affected sections:** 05 §1 rule 22, §4.1, §7, §7A ("Within a level", re-lock enumeration, "Who takes what", mint/consume steps, correction steps 2/5); 01 INV-20; 09 `AS006`; 10 T-LOK-01, T-LOK-07.
- **Required correction:**
  1. Restore the rule: every protocol and trigger lock on levels 0–3 is taken **only** through the named helpers (list them). Write correction step 2, the §4.1 trigger asset lock, `authoritative_state()`'s `SHARE`, mint and consume as helper calls.
  2. Add `trg_asset_class_frozen`'s asset re-lock (level 1 after level 2, same key, same mode ⇒ rule 1) to the re-lock enumeration, and extend T-LOK-07 with it.
  3. State that `NULL` and `''` both mean "nothing held".
  4. State the tracker's scope (helper-taken locks). Name the executor-implicit locks and whether each is covered by the order argument or by deadlock-abort.
  5. Add the link insert to "Who takes what". Either it takes `lock_instrument` on both endpoints ascending before inserting (so the FK `KEY SHARE`s are self-held), or it is documented as a deadlock-abort, fail-closed path.
  6. Fix 09 `AS006`.
- **Implementation impact:** helper-contract text and tests. Blocks P1 (lock helpers, triggers).
- **Human decision:** No.

### AST-01-F39 — LOW — Security-reasoning text precision (round trip, trigger-4 justification, F35(b) wording)

- **Evidence (§§6.4, 8.2):**
  - **(a)** The round-trip `A → B → A` refusal rests entirely on the deferred constraint. Were hop 2 committed with the cache back at fA, both B12 halves would pass. Yet 05 §4.1 calls the constraint "a correctness backstop on the writer, not the security control", and 05 §4.1 / 01 §3.4 say no check "is satisfied by 'the class matches again' alone".
  - **(b)** 05 §5.1 trigger 4 still justifies its unlocked read by "§7A … step 3" (application discipline), not by branch (b) / INV-26.
  - **(c)** 01 §4.7 item 2 ("record contributing security history to the current review floor") and 02 W3 ("qualifying") are not worded as 05 trigger 7(iii)'s `SEC(G) ∀G ∈ B(X)`.
- **Affected sections:** 05 §4.1 (deferred-constraint sentence, round-trip bullet), §5.1 step 4; 01 §3.4, §4.7 item 2; 02 W3 row 2, W13 note.
- **Required correction:**
  - **(a)** State the SQL invariant: after any committed correction, every current record's `identity_fingerprint` ≠ its instrument's cache (deferred constraint), so B12's fingerprint half denies. For round trips this constraint *is* the security control. Reword the "backstop, not the security control" sentence to scope it to the non-round-trip case.
  - **(b)** Cite branch (b) / INV-26 in trigger 4.
  - **(c)** Word 01 §4.7 item 2 and 02 W3 exactly as 05 trigger 7(iii).
- **Implementation impact:** text only. It prevents an implementer from weakening the deferred constraint as "non-security".
- **Human decision:** No.

## 17. Required before the next re-review

1. Correct **F36, F37, F38, F39** in a v1.6 pack. v1.5 stays unchanged as reviewed evidence.
2. The next re-review should examine F36–F39, plus a regression spot-check of F33 (trigger locking with helper-routed asset locks), F34/F38 (tracker), F35 and the lock graph including the link-insert path. F29, F30, F31 (inversion), F32(b), F33 and F35 are closed above.
3. Implementation remains unauthorised. `PLAN_READY` remains unset.

---

AIX AST-01 v1.5 SEPARATE-CONTEXT RE-REVIEW:
REMEDIATE — IMPLEMENTATION NOT AUTHORISED
