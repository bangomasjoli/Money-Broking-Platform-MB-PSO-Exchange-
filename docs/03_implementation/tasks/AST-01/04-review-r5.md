# 04 Review R5 — AST-01: Asset & Instrument Registry + Regulatory Classification (blueprint v1.4)

- **Task ID:** AST-01
- **Review type:** Separate-context independent re-review of the v1.4 remediation. Review only: no remediation, implementation, migration or merge.
- **Reviewer:** high_risk_reviewer / claude-opus-5-5 / HIGH
- **Reviewed commit:** `a33cc3d` on `module/AST-01` (v1.4 remediation). History: `78ec1e4` (v1.0) → `45d9a2f` (R1 `REMEDIATE`) → `e20b8ca` (v1.1) → `ccec2ff` (R2 `REMEDIATE`) → `f769689` (v1.2) → `56b0d6d` (R3 `REMEDIATE`) → `b56950f` (v1.3) → `3c222f4` (R4 `REMEDIATE`) → `a33cc3d` (v1.4).
- **Reviewed against:** `04-review-r4.md` (primary: F29–F32; regression: F18, F19, F22–F25, F27, F28; external gates: F02, F05, F17, F21), `05-remediation-r4.md`, and the v1.4 pack itself.
- **Not relied on:** the status columns of `05-remediation-r4.md` or the v1.4 README. Every disposition below comes from the v1.4 text, principally 05 §§1–7A, checked against PostgreSQL locking, snapshot and trigger semantics.

## Decision

# **REMEDIATE**

v1.4 fixes the substance of three of the four round-4 findings:
- **F29.** `asset_class_at_record` plus `class_binding_matches` makes a *stale* record SQL-unusable after a correction, whatever the correction writer does to the cached fingerprint.
- **F30.** `READ COMMITTED` is asserted and fail-closed. The merge trigger takes the gate before any root decision. The ordering claim is scoped correctly.
- **F31.** The self-first lock inversion is gone. A real `SECURITY` apply now derives its set under the gate and locks it ascending in one pass.

The verdict cannot be `ACCEPT`. Four **LOW** defects remain. None needs a human decision, and none creates an MB/PSO path for a `SECURITY` outcome.

| ID | Summary |
|---|---|
| **F32 (still open, part (a) only)** | The "a referenced canonicaliser version is frozen" rule is exact, but the pack gives no concrete mechanism that enforces it. It is still a promise by migration authors. |
| **AST-01-F33 (new)** | The class-binding concurrency proof depends on an application-only step: the correction locks every instrument before changing `asset_class`. SQL does not enforce that step, so a defective correction writer racing a *first* classification can produce a record whose class binding B12 cannot see. |
| **AST-01-F34 (new, supersedes F31's residue)** | The intra-level guard and the "idempotent re-lock" exception are not mechanically defined. As specified, the guard would raise false `AS006` on the normal merge, real-`SECURITY`, correction and consume paths. |
| **AST-01-F35 (new)** | Recency and ordering residue: <ul><li>a retried or delayed `ADMITTED` attestation that lands after a `WITHDRAWN` wins, so the v1.4 "replayed call cannot shadow" claim is false;</li><li>"the newest `SECURITY` record's bundle" names no ordering key or scope;</li><li>the text disagrees on which sequence correction markers draw from.</li></ul> |

**Implementation is not authorised. Nothing is accepted. `task.json` is unchanged (§17).**

---

## 1. Baseline verification (all PASS)

| Check | Result |
|---|---|
| Branch | `module/AST-01` |
| HEAD | `a33cc3d` (local and `origin/module/AST-01`) |
| Working tree | clean |
| `main` / `origin/main` | both `43f2f34`. Untouched; the `main` worktree (`AIX-Full-Compliance`) is clean at `43f2f34` |
| Diff `43f2f34..a33cc3d` | 9 commits. Every changed path is under `docs/02_modules/AST-01/**` or `docs/03_implementation/tasks/AST-01/**`; **0 paths** outside |
| v1.4 commit `3c222f4..a33cc3d` | Adds `v1.4/**` (12 files) and `05-remediation-r4.md`; edits the module README and `task.json`. v1.0–v1.3 untouched |

## 2. Independence

- **Fresh context.** This review ran in a new Claude Code session. It resumes no authoring, remediation or review session. The only inputs were the task brief and the repository.
- **Model family.** The reviewer is `claude-opus-5-5`, the same model as R1–R4. The v1.4 author is `claude-sonnet-5` (per `05-remediation-r4.md` and the commit trailer). The review is therefore **context-independent but not model-family-independent** with respect to the earlier reviews.

## 3. Seams verified (read-only)

| Claim | Verified at | Result |
|---|---|---|
| No `exchange` route fragment | `platform/packages/foundation/src/no-exchange.ts` `PROHIBITED_EXCHANGE_FRAGMENTS` (15), run over the 41 route-like strings in v1.4 | **0 hits**. No `exchange.*` identifier |
| Only additive control changes | Word-level diff v1.3 → v1.4, all 12 files | One control was relaxed: v1.3 required merge arguments to *be* current roots; v1.4 *resolves* them to roots under the gate. §8 shows this is safe. Every other removal is rewording |
| `task.json` conductor-valid | `aix-conductor/dist/records.js` `validateTaskManifest`, run read-only; conductor repository clean before and after | `{"ok":true,"errors":[]}` |

## 4. Non-negotiable property and regression check

Property: a `SECURITY` / `SECURITY_TOKEN` outcome can never reach `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO` or `WITHDRAWAL_MB_PSO`.

| Item | Result | Basis |
|---|---|---|
| `SECURITY` cannot reach MB/PSO | **Holds** | B1 unchanged and still reads the stored `latest_outcome`. B12 is additional and evaluated after B1–B3 (05 §7) |
| Exact canonical resolution | **Holds** | 04 §6.1 unchanged; the SQL canonicaliser is shared; `NULL` ⇒ `INSTRUMENT_NOT_FOUND` |
| SQL token-consume backstop (F18) | **Holds** | `assert_token_consumable` (i)–(v) unchanged; the token `BEFORE UPDATE` trigger; B12 now has both halves. F34 is an availability defect in the lock helpers and weakens no check |
| F27 merge narrowing | **Holds, strengthened** | Clause (b) unchanged; the merge trigger now takes the gate before root resolution (§8) |
| C0b / B8 parity | **Holds** | 01 §4.7A and 05 §7 `lineage_review_required` are textually unchanged in v1.4; T-LIN-24 / T-DB-17 unchanged |
| Digital MYR ⇒ `NOT_ASSESSED` | **Holds** | B10 unchanged, no override |
| Fiat keyed by `instrument_form` | **Holds** | B3, trigger 5 unchanged |
| Real + test-only classification ⇒ `NOT_ASSESSED` | **Holds** | Trigger 8, B11 unchanged |
| Synthetic cannot become real | **Holds** | `declared_synthetic` immutable from insert; `lineage.synthetic` insert-only; real↔synthetic merge and link refused, and the merge check now runs on roots resolved under the gate |
| Consumer service binding | **Holds** | B9, token binding columns immutable, compared at insert and at consume |
| No `exchange.*` namespace | **Holds** | §3 |
| `lineage.synthetic` immutable | **Holds** | 05 §3 unchanged (insert-only grant plus `trg_lineage_immutable` for every role) |
| F19, F22–F25 | **No regression** | F22's class/form race (asset `FOR SHARE` vs `FOR UPDATE`) unchanged |

## 5. Dispositions

### 5.1 Round-4 findings

| Finding | Disposition | Basis |
|---|---|---|
| **F29** B12 depends on an application-written cached fingerprint | **CLOSED IN BLUEPRINT** | §6. For every record that exists when a correction commits (the F29 threat), `class_binding_matches` denies from stored `asset_class_at_record` against the live `asset.asset_class`. It needs no fingerprint recompute, no marker, and nothing the writer must remember. The adjacent concurrency gap for a record written *during* a correction is new: **F33** |
| **F30** Ordering-visibility gaps (a), (b), (c) | **CLOSED IN BLUEPRINT** | (a) §9; (b) §8; (c) §10. One editorial contradiction about the marker sequence source is carried in F35(c); it affects no predicate |
| **F31** Deadlock-prone self-first lock inversion | **SUPERSEDED BY NEW FINDING (AST-01-F34)** | The inversion itself is **closed** (§11): the real-`SECURITY` apply no longer locks its own instrument first, and the cycle table now covers both previously omitted pairs. But the intra-level guard added to satisfy R4 correction item 4 is not implementable as written: the idempotent re-lock exception has no mechanism, so the specified normal paths would trip it (§12). The residue moves to F34 |
| **F32** (a) canonicaliser version semantics; (b) attestation ordering | **STILL OPEN**, part (a) only | **(b) closed** (§15): `attestation_seq` is DB-assigned under the instrument lock and is the only ordering authority. **(a) partly closed** (§14): the frozen-version rule is exact, and the `UPDATE` arm compares `OLD`/`NEW` only and never re-reads the registry. What remains open is the absence of any **concrete enforcement mechanism**, plus a stale event description (08) |

### 5.2 Earlier findings

| Finding | Disposition |
|---|---|
| **F17** Canonical identity | **EXTERNAL GATE REMAINS** (DCR-AST1-002(7), WLT-01 contract identity) |
| **F21** MYR | **EXTERNAL GATE REMAINS** (DCR-AST1-008(c), OQ-6) |
| **F02** Consumer token adoption | **EXTERNAL GATE REMAINS** (DCR-AST1-004) |
| **F05** Checker identity | **EXTERNAL GATE REMAINS** (DCR-AST1-001(a)+(d)); apply disabled until IAM-02 attests |
| **F18, F19, F22, F23, F24, F25, F27, F28** | **Closed, no regression** (§4) |
| **F26** | Remains superseded by F29 (now closed) |
| **F20** | Remains superseded by F27 (closed) |
| F01, F03, F04, F06–F16 | Not regressed / superseded as recorded in R4 |

## 6. SQL class-binding adjudication (F29)

| Check | Result |
|---|---|
| `asset_class_at_record` is database-filled | **Yes.** 05 §5.1 trigger 4 fills it; "app value ignored" |
| Taken from the authoritative asset row | **Yes.** It is read from the live `ast1.asset.asset_class` of the instrument's asset, not from any cache |
| Immutable | **Yes.** `classification_record` is append-only (trigger 1 rejects `UPDATE`/`DELETE`/`TRUNCATE`; grant `INSERT, SELECT`) |
| Not caller-controlled | **Yes.** It is overwritten by trigger, and no route or parameter carries it |
| B12 compares it independently with the **live** `asset.asset_class` | **Yes.** `authoritative_state()` reads `ast1.asset` live after its instrument lock. B12 denies on `record_fingerprint_matches = false` **or** `class_binding_matches = false`, and each half is sufficient on its own |

**Attack walk-through.** `DIGITAL_CURRENCY` + `NON_SECURITY` record, then a correction to `SECURITY_TOKEN` by a defective fingerprint writer:
- **Fingerprint left unchanged, or the old value written back.** The v1.4 deferred constraint refuses the commit (`identity_fingerprint <> superseded fingerprint`). Even if it did commit (T-FPR-11 stubs it), `asset_class_at_record = DIGITAL_CURRENCY ≠ SECURITY_TOKEN`, so B12 denies.
- **Defective marker.** A marker is a label, not a permission (05 §5.3). It changes only the reason code, and B12 denies either way. `marker.asset_id = instrument.asset_id` is now asserted.

Each path in the brief, for the pre-existing record:

| Path | Result | Mechanism |
|---|---|---|
| Raw `allow` insert | deny | log trigger → `backstop_permits` → B12 |
| Raw token consume | deny | token `BEFORE UPDATE` → `assert_token_consumable` → `backstop_permits` → B12 |
| Admission insert / approval | deny | `trg_admission_backstop` → B12 |
| `ADMITTED` attestation | deny | `backstop_permits(…,'SECURITIES_MARKET')` → B12 |
| Custody approval / operational enable | deny | `backstop_permits` → B12 |

Every path denies until a new valid classification. Into `SECURITY_TOKEN`, only `SECURITY`/`UNRESOLVED` can be recorded (trigger 6). **The property holds for every record that predates the correction.**

**Observation (fail-closed, text only).** A round-trip correction `A → B → A` with no record in between recomputes the original fingerprint. The v1.4 assertion `identity_fingerprint <> superseded_record_fingerprint` then refuses the second correction. This is safe: it stops the old record reviving without a new classification. It should be stated, with the operator route (record `UNRESOLVED` first). T-FPR-05 tests `A → B → C` only.

## 7. Asset-class concurrency adjudication

**Protocol path (correction writer as specified in 05 §7A steps 2–5 / W13):**

| Interleaving | What happens | Class binding correct? | Deadlock? |
|---|---|---|---|
| **A.** Classification writer W holds instrument X; correction C holds the asset `FOR UPDATE` and is locking instruments | C blocks on X **before** its `UPDATE asset` (step 3 precedes step 5). W's plain `SELECT` of `asset_class` does not wait on C's row lock and sees the committed old class. W stamps the old class and commits. C then acquires X; its later statements get fresh `READ COMMITTED` snapshots and see W's record, so the marker and deferred constraint cover it. After C commits, B12 denies W's record | Yes | No. W never requests the asset or anything C holds; C takes no gate |
| **B.** C has the asset and waits for X | Same as A | Yes | No |
| **C.** W commits before C proceeds | C sees W's record under its locks; W's record is stamped old; B12 denies after C | Yes | No |
| **D.** C commits before W begins (or C holds X first and W waits) | W's post-lock statements see the new class. Trigger 4 requires W's fingerprint to equal the corrected cached value, and trigger 6 refuses `NON_SECURITY` under `SECURITY_TOKEN` | Yes | No |

**The stated proof is incomplete (F33).** 05 §5.1 trigger 4 justifies the unlocked read with: "any `ASSET_CLASS_CORRECTION` … must itself lock this exact instrument (§7A step 3) before it updates `asset_class`". That precondition is enforced **only by the application**:
- `trg_asset_class_frozen` branch (b) takes the asset `FOR UPDATE` and nothing else before allowing the change;
- the deferred constraint requires fingerprint changes and markers only for instruments that **have a current record at commit**.

A correction writer that runs `UPDATE asset SET asset_class` before locking its instruments therefore passes SQL, provided the asset has a record-less instrument X. This is the "defective application" the F29 property is meant to survive.

Concrete interleaving:
1. W (first classification of X, `NON_SECURITY`) holds the gate `SHARE` and X.
2. C updates the class to `SECURITY_TOKEN` (uncommitted).
3. W's `SECURITY_LABELLED` check (trigger 6) reads the committed old class `DIGITAL_CURRENCY` and passes.
4. C commits. Its deferred constraint does not see a record on X, so it demands nothing for X.
5. W's stamping read (trigger 4), a separate statement with a new snapshot, sees `SECURITY_TOKEN`.
6. W's fingerprint equals X's cached value, which the defective C never touched.

Result: a `NON_SECURITY` record on a `SECURITY_TOKEN` asset with `class_binding_matches = true` and `record_fingerprint_matches = true`. B12 is silent, and B1–B11 do not read the class. TypeScript (fingerprint recompute from live columns) and sweep S4 still catch it. This needs a writer defect, a race, and trigger 6 evaluated before the stamp. 05 lists trigger 4 before 6 but specifies neither one read nor firing order; separate PostgreSQL triggers fire alphabetically. **LOW.** Correction: §14 F33.

## 8. Lineage-root and merge adjudication (F30(b))

| Check | Result |
|---|---|
| Gate before root resolution, same-root test, real/synthetic check, change binding, lock set, sequence draw | **Yes.** 05 §3 steps 1→7; application steps 2→5 (05 §7A, W12) in the same order |
| Raw opposite merges `A→B` / `B→A` concurrently | **At most one commits.** Both serialise on the gate `FOR UPDATE`. The second re-resolves under a fresh snapshot after the lock wait, finds one root, and is refused `AS004` (T-LIN-28). A three-way ring (`B→A`, `C→B`, `A→C`) is refused the same way |
| Cycle impossible | **Yes.** `UNIQUE (merged_lineage_id)` gives each lineage at most one outgoing edge, and the gate-serialised same-root test refuses any edge whose endpoints already share a root |
| `lineage_root()` contract | **Raises `AS004`** on a cycle, on exceeding the bound, or on a malformed edge. Never returns `NULL` or a partial root. Every caller (derivation, `authoritative_state()`, resolver, sweep, merge trigger) therefore fails closed |
| Relaxation vs v1.3 | v1.3 refused a non-root argument; v1.4 resolves it. **Safe**: resolution happens under the gate, and a merge can only add security history (it narrows). *Implementation note:* state whether the trigger stores the resolved roots or the supplied arguments. A non-root `merged_lineage_id` hits the unique constraint (fail-closed); a non-root `surviving_lineage_id` is structurally harmless |

**Adjudication: closed.**

## 9. Isolation adjudication (F30(a))

The assertion is the literal first statement of `authoritative_state()` and of every lock helper (05 §7, T-ISO-04). 05 §7A makes the helpers "the only code that takes these locks", which covers `trg_asset_class_frozen`, `trg_instrument_asset_lock`, the record, evidence and merge triggers, and the token trigger.

| Attack | Result |
|---|---|
| `REPEATABLE READ` / `SERIALIZABLE` | `AS007` at the first helper or `authoritative_state()` call on every path: record, evidence, merge, correction, asset-class edit, instrument insert, hold, admission, custody, operational, attestation, mint, consume |
| Transaction already ran an earlier query | Irrelevant. `current_setting('transaction_isolation')` reports the effective level of the running transaction, and the level cannot change after the first query |
| Caller skips the application lock helper | The table triggers call the helpers non-optionally |
| Direct trigger path | Same |
| Raw token consume | The trigger's instrument lock goes through a helper, and `assert_token_consumable` calls `authoritative_state()`. `AS007` either way |
| Class edit with "no instrument exists" under a stale snapshot | Covered: the trigger's asset lock is a helper |
| Loosening actions (hold release, restriction lift) | Covered: they call `lock_instrument()` |

**Honesty of the operational requirement:** stated in 05 §7 and 04 §8. The pool must not default any AST-01 connection above `READ COMMITTED`, and a violation is an availability failure. `VOLATILE` is still required so that each statement after a lock wait gets a fresh snapshot. **Adjudication: closed.**

## 10. Sequence-order adjudication (F30(c))

INV-21 (01) and INV-25 plus 05 §7A "Scope of the ordering guarantee" claim sequence order equals commit order **only** for pairs sharing an instrument lock or the exclusive gate.

Every security predicate compares only such pairs:

| Predicate | Pair compared | Why the pair is ordered |
|---|---|---|
| Clause (a) | `r` (exclusive) vs `c` | `r`'s writer locks X as an affected instrument, wrappers included |
| Clause (b) | `m` (exclusive) vs `c`; `r` vs `m` | Both exclusive |
| Review floor and evidence rule | `E` (gate `SHARE` + X) vs `F` (exclusive; its writer locks X) | Shared gate / X |
| `record_seq` / current record | Same instrument | Shared instrument lock |
| Attestation `newest wins` | Same instrument | `attestation_seq` drawn under the instrument lock |

**Correction markers.** Markers are used only existentially: "∃ a marker whose fingerprints chain". Any comparison is between markers of one instrument, drawn under that instrument's lock. No predicate compares a marker with another instrument's event or with a gate event.

**Adjudication: closed.** One editorial contradiction remains: 05 §5.3 draws `marker_global_seq` from `ast1.classification_global_seq`, and S8 checks duplicates "across records/merges/evidence/markers", while 01 INV-21 says markers have their own sequence. Either choice is safe; the text must pick one (F35(c)).

## 11. Full lock-graph adjudication (F31)

Reconstructed independently from 05 §§3–7A, 02 W11–W13 and 04 §8, including hidden waits (FK `KEY SHARE` checks, trigger re-locks, token revocation):

| Path | Sequence | In order? |
|---|---|---|
| Record, non-`SECURITY` | G → 0 `S` → 2 X → 3 → 4 | yes |
| **Real `SECURITY` apply** | G → 0 `X` → derive the full set under the gate with no lock (reads `asset`, `instrument_underlying`, `lineage_merge` only) → 2 whole set ascending in one pass → 3 → 4 | **yes**. Deriving the set takes no lock at any level, so it creates no inversion |
| Evidence insert | 0 `S` → 2 X → 4 | yes |
| Case submit | 2 X (identity lock, stamp) → 4 | yes. No gate; nothing above level 2 is taken afterwards |
| Lineage merge | G → 0 `X` → resolve → 2 ascending → 3 → 4 | yes |
| `ASSET_CLASS_CORRECTION` | G → 1 `X` → 2 all instruments ascending → 3 → 4 | yes |
| First instrument insert | 1 `S` → new row | yes |
| Hold / admission / custody / operational / attestation / retire | (G) → 2 X → (3) → 4 | yes |
| Evidence-standard retirement | (G) → 2 ascending → 3 | yes. No gate; B11 is evaluated live, so a record racing retirement is still denied |
| Mint | 2 `S` → 4 | yes |
| Consume | 2 `S` → 3 `X` → trigger re-lock 2 `S` | yes, given the re-lock exception (see F34) |

**Specific pairs requested:**
- **Correction ↔ real `SECURITY` apply.** Disjoint upper levels (asset vs gate), both purely ascending at level 2, no upper-level wait while holding level 2. Acyclic.
- **Correction ↔ retirement, lineage merge, token consume, hold placement, admission changes.** All at most one upper level, then ascending level 2. Acyclic.
- **Hidden FK waits.** The marker insert takes `KEY SHARE` on its own change row, its own asset and an insert-only record row. The record insert takes `KEY SHARE` on its instrument, the case and the standard. None conflicts with the `FOR NO KEY UPDATE` of a non-key column. No hidden edge.
- **Affected-set derivation.** The reasoning "the gate excludes every writer that could change membership" is too broad: instrument inserts (asset `SHARE`), asset inserts and `DRAFT` wrapper links are not gated. The safety conclusion still holds, because every such newcomer is record-less, and re-derivation raises `AS006` (T-LOK-04). *Editorial:* restate the reason.

**Adjudication:** the self-first inversion is closed and the cycle table is now complete and correct. The residue is the guard's definition (F34).

## 12. Intra-level guard adjudication

The guard records "the **highest** `instrument_id` locked so far" and raises `AS006` when a **lower** id is requested (05 §7A; T-LOK-07). The level rule separately allows "the idempotent re-lock of a row the transaction already holds".

1. **The re-lock exception has no mechanism.** A tracker that holds only "highest level" and "last instrument id" cannot tell a re-lock of a held row from a new lower acquisition. Row locks are not visible to SQL in a usable way. Taken literally, the guard raises a false `AS006` on specified normal paths:
   - the merge trigger re-locks the whole set (05 §3 step 6) after the application locked it (step 4): the first re-lock is the lowest id;
   - record trigger 2(c) re-locks the set after the application's real-`SECURITY` apply locked it;
   - the correction's per-instrument `UPDATE … identity_fingerprint` fires `trg_instrument_lock_on_write` → `lock_instrument(lowest)` after step 3 locked all instruments;
   - merge step 6 evaluates the predicate per affected instrument, and `authoritative_state()` takes `FOR SHARE` from the lowest id again;
   - the consume trigger re-locks the instrument at level 2 after the token at level 3.

   So merges, real-`SECURITY` applies and corrections would never commit, and consume would depend on an undefined exception. Everything fails closed, so this is availability, not safety. It still violates the brief's requirement that no legitimate path falsely trip the guard.
2. **Lock-mode upgrade is undefined.** A transaction holding the gate `SHARE` (for example, an evidence insert) that then appends a real `SECURITY` record (gate `X`) upgrades on one row. So does a writer that calls `authoritative_state()` (`FOR SHARE`) before `lock_instrument()` (`FOR UPDATE`). Two such transactions deadlock. The helpers neither forbid nor detect it.
3. **Reset semantics.** "reset at transaction start by `BEGIN`/the pooler" is the wrong basis. `set_config(…, true)` is transaction-local and reverts on its own at `COMMIT`/`ROLLBACK` and at `ROLLBACK TO SAVEPOINT`, together with any row locks the aborted subtransaction took. PgBouncer in transaction mode performs no reset at all. The design must rely on `is_local = true`, not on `BEGIN` or a pooler, and must treat an empty-string value (what `current_setting(…, true)` returns once a placeholder has existed in the session) as "nothing held".

**Adjudication:** the transaction-local basis is sound. The guard as written is not implementable without false trips (F34).

## 13. Case-submit adjudication

- The case-submit row is present (G-less; 2 X → 4). It takes nothing above level 2 afterwards, so it adds no cycle.
- **Treating `follows_event_*` at submit as advisory is safe.** Trigger 7(iv) recomputes the floor at apply, under the gate `SHARE` and the instrument lock, and refuses any mismatch (`binding_stale`). A stale or wrong stamp can only cause a refusal.
- The stamp is in fact exact for every relevant event. Submit holds X, and every event that can enter X's basis trees (real `SECURITY` record, merge) locks X as an affected instrument, so it cannot commit during submit.

**Adjudication: closed.**

## 14. Canonicaliser-version adjudication (F32(a))

| Requirement | Result |
|---|---|
| Rule: once referenced, `(address_format, canonicalisation_version)` is immutable forever; new semantics ⇒ new version; no change, reinterpretation or drop | **Stated exactly** (05 §1 rule 20, §2.1; 01 INV-23) |
| `UPDATE` trigger compares `OLD`/`NEW` identity columns only | **Yes** (05 §2.1 arm, §4.2) |
| Does not consult current network `ACTIVE`/`SUSPENDED` status | **Yes.** Also, the FK `(chain, network)` is not re-checked on an `UPDATE` that leaves it unchanged, and the canonical `CHECK` re-runs under the row's own frozen version |
| Does not silently move old instruments to a new version | **Yes.** Changing the version raises `AS002` (two triggers). Re-mapping is a separate, collision-checked, governed migration |
| Attack: network suspended → registry version bumped → retire → class correction | **Both `UPDATE`s succeed** (T-ADR-13). Tightening stays possible |
| **Concrete enforcement mechanism** | **Missing.** 05 §2.1 says "a migration may never change what it returns … and may never remove it". §12 lists a "version-immutability discipline". Only T-ADR-13 mentions, parenthetically, "a migration-time check over `information_schema`/a version-registry table". No such table, function or migration gate is specified. `information_schema` cannot detect a semantic change inside a multi-version `IMMUTABLE` function. **This is the promise the brief says not to accept** |
| Consistency | 08 `ast1.integrity.address_canonical_violation` still says "not canonical under the **current network rule**", which contradicts rule 20 and S9 |

**Feasibility.** A concrete mechanism is small and fully SQL-expressible (§18, F32 correction). **Adjudication: STILL OPEN**, part (a) mechanism only.

## 15. Attestation-order adjudication (F32(b))

| Check | Result |
|---|---|
| `attestation_seq` DB-assigned, not caller-controlled | **Yes.** Trigger overwrites it from `ast1.attestation_seq`; `NOT NULL UNIQUE` |
| Monotonic enough for "newest wins" | **Yes.** It is drawn under the instrument lock (05 §6 "every insert … first calls `lock_instrument`"). Both rows of an `(instrument_id, admission_ref)` pair share that lock, so draw order equals commit order |
| `received_at_utc` audit only | **Yes.** Trigger-filled, never read by C5 or the trigger (T-ATT-03) |
| `ADMITTED` then `WITHDRAWN` with a forged old timestamp | **`WITHDRAWN` wins** (T-ATT-01) |
| Reverse insertion with reversed timestamps | Order follows `attestation_seq` only (T-ATT-02) |
| C5 and the sweep use the same authority | **Yes.** C5 (01 §8.6), the table rule (05 §6) and T-ADR-10's extended scan. The orphaned-attestation sweep checks record binding and does not introduce another ordering |

**Adjudication: closed.** One residue is separate from F32(b)'s requirement: ordering by AST-01 insertion means a retried or late `ADMITTED` arriving **after** a `WITHDRAWN` wins, and 01 §8.6's claim that "a replayed call cannot shadow a genuine `WITHDRAWN` row" is not true without a further rule (F35(a)).

## 16. Latest/newest audit

Every security-relevant recency rule in v1.4 (01, 02, 04, 05, 06, 08, 09, 10):

| Rule | Ordering key | Status |
|---|---|---|
| Current / effective record, `latest_outcome`, `current_record_id` | max `record_seq` (DB-assigned under the instrument lock) | OK |
| Admission and attestation bound to "the current record" | same | OK |
| Marker `superseded_record_id` = "newest record" | `record_seq` | OK |
| "Newest marker explains newest fingerprint" | existential chain; same-instrument `marker_global_seq` | OK. Sequence source inconsistent in the text (F35(c)) |
| Review floor / "newest triggering event" | max `global_seq` / `merge_global_seq` | OK |
| `follows_event_*` binding | the same floor, recomputed at apply | OK |
| Clauses (a)/(b), `elevated` | sequence values | OK |
| **"The newest `SECURITY` record's bundle"** (01 §4.7 item 2; 05 trigger 7(iii): "of any basis tree") | **Not stated.** With several basis trees it is ambiguous which record, per tree or overall | **F35(b)** |
| Securities-market attestation "newest wins" | `attestation_seq` | OK for timestamps; **F35(a)** for delivery order |
| Evidence standard of "the newest record" (B11) | via `record_seq` | OK |
| Holds, admissions, custody, operational state, restrictions, jurisdiction rules | status or unique live row; no recency | OK |
| Token expiry | DB `clock_timestamp()`; an expiry check, not an ordering | OK |
| `network_registry.canonicalisation_version` "current" | selects future registrations only | OK |
| 08 `address_canonical_violation` "current network rule" | contradicts rule 20 | **F32(a)** text |

No security-sensitive recency depends on a caller timestamp or wall-clock order. One depends on ambiguous row selection (F35(b)), and one on unconstrained delivery order (F35(a)).

## 17. OQ-8, external gates, task state

- **OQ-8.** **OPEN / UNDECIDED / NON-BLOCKING.** v1.4 adds no draft-correction path. F32(a)'s version freeze governs the meaning of an already-validated identity, is orthogonal to OQ-8, and introduces no safety problem.
- **External gates.** F02 (DCR-AST1-004), F05 (DCR-AST1-001(a)+(d)), F17 (DCR-AST1-002(7)) and F21 (DCR-AST1-008(c), OQ-6) are stated honestly in 17, and none is claimed closed. No DCR is implemented or executed.
- **`task.json`.** `state: IDLE`, `acceptanceStatus: NOT_ACCEPTED`, `PLAN_READY` not set, conductor-valid (§3). **Not modified by this review.** No lifecycle event is invented. `findingsSummary` still lists F29–F32; reconciliation (F29, F30 closed; F31 → F34; F32 open; F33–F35 new) is left to the next remediation checkpoint. The staleness is schema-valid and not a blocker. **`PLAN_READY` must not be set** by any author or reviewer; only the human/conductor `approve-plan` checkpoint sets it, after an `ACCEPT` re-review.

---

## 18. Findings (open after this review)

Severity uses the `OPEN_FINDINGS` vocabulary. **None requires a human decision.**

### AST-01-F32 — LOW — STILL OPEN (part (a) only): canonicaliser-version freeze has no concrete enforcement mechanism

- **Evidence:** §14.
  - 05 §2.1 and §12 state the rule as a migration-author obligation ("may never change … may never remove"; "version-immutability discipline").
  - T-ADR-13 presupposes a "migration-time check over `information_schema`/a version-registry table" that the design never defines.
  - 08 `address_canonical_violation` still says "under the current network rule".
- **Affected sections:** 05 §1 rule 20, §2.1 (Versioning), §12; 01 INV-23; 08 `ast1.integrity.address_canonical_violation`; 10 T-ADR-13, T-INT-12; 12 AR-34.
- **Required correction:**
  1. Specify an insert-only, trigger-immutable (every role) registry:
     - `ast1.address_rule_version (address_format, canonicalisation_version, …)`;
     - a frozen golden-vector table `ast1.address_rule_vector (address_format, canonicalisation_version, raw_input, expected_output)` holding valid, invalid, case and prefix vectors per version.
  2. Specify `ast1.assert_address_rules_frozen()`. The migration runner calls it at the end of **every** migration, inside the migration transaction. For every `(format, version)` referenced by any `instrument` or `network_registry` row it checks that:
     - the pair has a registry row;
     - `address_rule_supported` is true;
     - every stored vector reproduces exactly;
     - every stored instrument value is a fixed point under its own version.

     Any failure raises and aborts the migration.
  3. A `network_registry` `INSERT`/`UPDATE` may name only a registered pair that has vectors.
  4. Rewrite T-ADR-13 against this mechanism, and correct the 08 wording to "under its own stored version".
- **Implementation impact:** P1 schema text: two small tables, one assertion function, one runner hook.
- **Human decision:** No.

### AST-01-F33 — LOW — Class-binding concurrency proof rests on an application-only lock step; SQL does not force the correction to lock instruments before changing the class

- **Evidence:** §7. 05 §5.1 trigger 4 justifies its unlocked `asset_class` read by the correction's step 3 instrument locks, but:
  - `trg_asset_class_frozen` branch (b) takes only the asset lock;
  - the deferred constraint covers only instruments with a current record at commit;
  - trigger 6 (`SECURITY_LABELLED`) and the trigger-4 stamp may read the class in separate statements, in an unspecified firing order.

  A defective correction writer that updates the class before locking a record-less instrument can therefore race that instrument's first classification into a `NON_SECURITY` record stamped with the new `SECURITY_TOKEN` class, with a matching fingerprint. B12 is silent (TypeScript and S4 still catch it). This is the defective-writer class that F29's property is required to survive.
- **Affected sections:** 05 §4.1 `trg_asset_class_frozen` and its deferred constraint, §5.1 triggers 4 and 6, §7A "Asset class correction apply" steps 3–5; 01 §3.4, INV-24; 02 W13; 10 T-FPR-06, T-FPR-11.
- **Required correction:**
  1. `trg_asset_class_frozen` branch (b) itself calls `ast1.lock_asset_instruments(asset_id)` (level 1 → 2, ascending) **before** it permits the change. "Every instrument is locked before the class changes" then becomes SQL-enforced, and trigger 4's proof holds for any writer. This depends on F34's re-lock definition, because the application already holds those locks.
  2. The record insert reads `asset.asset_class` **once** (the trigger-4 stamp), and every class-dependent check in the same insert (trigger 6 and any other) evaluates `NEW.asset_class_at_record`. State this, or state one trigger function with a fixed step order.
  3. Optionally, extend the deferred constraint to require the fingerprint recompute for **every** instrument of the asset, classified or not.
  4. Add a test: a raw correction that updates the class before locking instruments, barrier-raced with the first classification of a record-less instrument. Either the two are serialised, or B12 denies; no `NON_SECURITY` record is ever stamped with a `SECURITY`/`SECURITY_TOKEN` class.
  5. State the round-trip `A → B → A` behaviour (§6 observation).
- **Implementation impact:** small (one helper call in a trigger, one read rule, tests). Blocks **P1** (triggers) and **P3** (correction apply).
- **Human decision:** No.

### AST-01-F34 — LOW — Intra-level guard and idempotent re-lock exception are not mechanically defined; literal implementation false-trips `AS006` on normal paths (supersedes F31's residue)

- **Evidence:** §12.
  - The tracker records only "highest level" and "last instrument id". It cannot recognise a re-lock of a held row.
  - The merge trigger, record trigger 2(c), the correction's fingerprint `UPDATE`s, merge step 6's per-instrument `authoritative_state()` and the consume trigger all re-lock rows below the last id or level taken. Under the rule as written they would raise `AS006`.
  - Lock-mode upgrade (gate or instrument `SHARE → UPDATE`) is neither forbidden nor detected, and it is a two-sharer deadlock.
  - The reset text relies on "`BEGIN`/the pooler" rather than `is_local = true` semantics.
- **Affected sections:** 05 §1 rule 19, §3 step 6, §5.1 trigger 2, §7 (`authoritative_state` lock), §7A "Within a level", "Who takes what", consume steps; 01 INV-20; 09 `AS006`; 10 T-LOK-01, T-LOK-07.
- **Required correction:**
  1. Define the tracker as transaction-local state (`set_config(…, true)`). It reverts on its own at `COMMIT`/`ROLLBACK` and at `ROLLBACK TO SAVEPOINT`, consistently with the row locks the aborted subtransaction took. It holds the **set** of held keys with their mode per level (gate mode, asset ids, instrument ids), the highest level and the highest instrument id. An absent or empty value means nothing is held. Delete the `BEGIN`/pooler wording.
  2. **Idempotent re-lock:** a request for a key already held at the same or a stronger mode returns immediately. It issues no lock, is exempt from the level and intra-level checks, and does not update the tracker. A set request drops already-held members and applies the guard to the remainder only: the smallest remaining id must exceed the highest held id, else `AS006` before any wait.
  3. **Upgrade:** a request for a stronger mode on a held key raises `AS006`. State that writers take the strong mode first (for example, never `authoritative_state()` before `lock_instrument()` in a writer; never an evidence insert before a real-`SECURITY` record in one transaction).
  4. List the re-lock sites explicitly (§12 item 1), plus case submit's identity-lock `UPDATE`. Require multi-instrument `SYSTEM` holds from the sweep (S8) to lock ascending in one pass or use one transaction per instrument.
  5. Tests:
     - T-LOK-07 extended: application set lock, then trigger re-lock ⇒ no `AS006`; consume ⇒ no `AS006`; `SHARE → UPDATE` upgrade ⇒ `AS006`; savepoint rollback ⇒ tracker and locks revert together; transaction-mode pooling ⇒ no carry-over.
     - T-LOK-01 asserts zero false `AS006` over every "Who takes what" path.
- **Implementation impact:** helper contract text plus tests. Blocks **P1** (lock helpers).
- **Human decision:** No.

### AST-01-F35 — LOW — Recency/ordering residue: attestation delivery order, an unkeyed "newest `SECURITY` bundle", and the marker sequence source

- **Evidence:** §§10, 15, 16.
  - **(a)** `attestation_seq` orders by AST-01 insertion. A retried or delayed `ADMITTED` (for example, a timed-out call retried with a fresh idempotency key) that lands **after** `EXM-01`'s `WITHDRAWN` gets a higher sequence and wins, and it still binds to the current record. A withdrawn securities-market admission is then effective again for C5. 01 §8.6 claims "a replayed call cannot shadow a genuine `WITHDRAWN` row", which does not hold. Securities domain only; MB/PSO unaffected.
  - **(b)** 01 §4.7 item 2 ("the newest `SECURITY` record's bundle") and 05 trigger 7(iii) ("the newest real `SECURITY` record of any basis tree") name no ordering key, and are ambiguous across several basis trees. The rule decides which evidence counts as fresh.
  - **(c)** 05 §5.3 draws `marker_global_seq` from `ast1.classification_global_seq`, and S8 checks duplicates across markers. 01 INV-21 says markers use their own sequence.
- **Affected sections:** 01 §4.7, §8.6, INV-21; 05 §5.1 trigger 7(iii), §5.3, §6 `trg_attestation_binding`, §7.1 S8; 17 DCR-AST1-004 (`EXM-01` contract clause); 10 T-ATT, T-ADR-10.
- **Required correction:**
  - **(a)** Make `WITHDRAWN` terminal per `(instrument_id, admission_ref)`: `trg_attestation_binding` refuses an `ADMITTED` row when a `WITHDRAWN` row exists for the pair, so re-admission requires a new `admission_ref` from `EXM-01`. Record this in the DCR-AST1-004 `EXM-01` contract. Correct the 01 §8.6 claim. Add T-ATT-04: `ADMITTED` retried after `WITHDRAWN` ⇒ refused. This is a conservative tightening that uses no timestamps.
  - **(b)** Name `global_seq` as the key. Preferably, exclude the bundles of **every** real `SECURITY` record in `SEC(G)` for every `G ∈ B(X)`: strictly tighter, and no recency choice is needed.
  - **(c)** Pick one sequence source for markers and align 05 §5.3, §7.1 S8 and 01 INV-21.
- **Implementation impact:** small (one trigger condition, text). (a) touches the `EXM-01` contract, which is already an external gate; no new DCR.
- **Human decision:** No.

## 19. Required before the next re-review

1. Correct **F32(a), F33, F34, F35** (all LOW) in a v1.5 pack. v1.4 stays unchanged as reviewed evidence.
2. Editorial items (not acceptance conditions):
   - restate the affected-set stability reason (§11);
   - state whether `lineage_merge` stores resolved roots (§8).
3. The next re-review needs to examine only F32(a) and F33–F35, plus a regression spot-check. F29, F30 and the F31 inversion are closed above.

---

AIX AST-01 v1.4 SEPARATE-CONTEXT RE-REVIEW:
REMEDIATE — IMPLEMENTATION NOT AUTHORISED
