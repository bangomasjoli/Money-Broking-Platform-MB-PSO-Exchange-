# 04 Review R4 — AST-01: Asset & Instrument Registry + Regulatory Classification (blueprint v1.3)

- **Task ID:** AST-01
- **Review type:** Separate-context independent re-review of the v1.3 remediation. Review only: no remediation, implementation, migration or merge.
- **Reviewer:** high_risk_reviewer / claude-opus-5-5 / HIGH
- **Reviewed commit:** `b56950f` on `module/AST-01` (v1.3 remediation). History: `78ec1e4` (v1.0) → `45d9a2f` (R1 `REMEDIATE`) → `e20b8ca` (v1.1) → `ccec2ff` (R2 `REMEDIATE`) → `f769689` (v1.2) → `56b0d6d` (R3 `REMEDIATE`) → `b56950f` (v1.3).
- **Reviewed against:** `DEC-012`, `DEC-013`, `DEC-014`; Doc 00 v1.5 §1.D rule 4; Master Module Index v1.4 §19; SRS v1.3 `AST-SRS-001/001A/002`; Role & Permission Matrix v1.3 §19, §28; Master Workflow Map v1.3 `WF-32`, `WF-35`; Master System Rules v1.3 `ASSET-RULE-001/002`; `CURRENT_STATE.md`; `04-review.md`, `04-review-r2.md`, `04-review-r3.md`, `05-remediation.md`, `05-remediation-r2.md`, `05-remediation-r3.md`.
- **Not relied on:** the status columns of `05-remediation-r3.md` or the v1.3 README. Every disposition below comes from the v1.3 text (principally 05 §§1–7A), checked against PostgreSQL locking and visibility semantics and, where a seam needed it, the source.

## Decision

# **REMEDIATE**

v1.3 fixes the substance of all three round-3 findings:
- **F27.** A lineage merge is now a sequenced ledger event. The two-clause predicate narrows every member the merge puts next to a `SECURITY` determination, in the merge transaction and in SQL. A pre-merge review can no longer clear it.
- **F26.** `ASSET_CLASS_CORRECTION` is a locked writer that revokes tokens, and the SQL backstop can now see it.
- **F28.** The canonical address, the evidence order and `lineage.synthetic` are now held at the database.

The high-focus ordering question gets a qualified yes (§6). For every pair of events the design actually compares, sequence order equals commit order.

Four **LOW** defects remain. Each is small, needs no human decision, and should be fixed in the text before P1 is planned:
- **AST-01-F29.** B12 relies on an application-written cached fingerprint. SQL never checks that a correction changed it. This supersedes F26.
- **AST-01-F30.** Three ordering-visibility gaps:
  - `READ COMMITTED` is load-bearing but not enforced.
  - The merge trigger checks "current roots" before it takes the gate.
  - The ordering claim is stated too broadly.
- **AST-01-F31.** The specified normal path has a **deadlock-prone lock inversion**. A real `SECURITY` apply locks its own instrument before the ascending affected set, so it can deadlock with `ASSET_CLASS_CORRECTION`. This breaks the acceptance criterion "no deadlock-prone cycle may exist in the specified normal path", which is why the verdict cannot be `ACCEPT`.
- **AST-01-F32.** Two residual DB-hygiene gaps: the canonicaliser's version semantics, and the attestation table's "newest row wins" ordering.

None of these creates an MB/PSO path for a `SECURITY` outcome. F29 and F30(a) are the two that can produce a SQL-invisible eligibility widening, and each needs an application defect or a misconfiguration to do so. The integrity sweep detects both afterwards (S4, S7).

**Implementation is not authorised. Nothing is accepted. `task.json` is unchanged (§17).**

---

## 1. Baseline verification (all PASS)

| Check | Result |
|---|---|
| Branch | `module/AST-01` |
| HEAD | `b56950f` (local and `origin/module/AST-01` after `git fetch`) |
| Working tree | clean |
| `main` / `origin/main` | both `43f2f34`. Untouched; the `main` worktree (`AIX-Full-Compliance`) is clean |
| Diff `43f2f34..b56950f` | 7 commits, 57 files, **0 paths** outside `docs/02_modules/AST-01/**` and `docs/03_implementation/tasks/AST-01/**` |
| v1.3 commit `56b0d6d..b56950f` | Adds `v1.3/**` (12 files) and `05-remediation-r3.md`; edits the module README and `task.json`. v1.0–v1.2 untouched |

## 2. Independence

- **Fresh context.** This review ran in a new Claude Code session. It resumes no authoring, remediation or review session. The only inputs were the task brief and the repository.
- **Model family.** The reviewer is `claude-opus-5-5`, the same model as R1–R3. The v1.3 author is `claude-sonnet-5`. The review is therefore **context-independent but not model-family-independent** with respect to the earlier reviews. The human decides with that known (MIG-005 precedent).
- **Correction to R3.** F31's inversion is inherited from v1.2 (v1.2 05 §5.1 trigger 2 also locks the instrument before the set). R3 §7 recorded the lineage-wide writer as "all affected instruments ascending" and missed it.

## 3. Seams verified (read-only)

| Claim | Verified at | Result |
|---|---|---|
| Masters unchanged since R3 | `main` = `43f2f34` (same as R3). Doc 00 v1.5 line 161 (§1.D rule 4); `06_Master_System_Rules_v1.3.md` `ASSET-RULE-001` (line 545) | R3's master adjudications stand |
| No `exchange` route fragment | `platform/packages/foundation/src/no-exchange.ts` `PROHIBITED_EXCHANGE_FRAGMENTS` (15), run over every route string in v1.3 | **0 hits**; no `exchange.*` identifier; prose mentions only |
| `governed_change` status transitions | v1.3 05 §8, 06 SM-7; CFG-01 migration 016 | SM-7 declares `applied` terminal, but no trigger enforces it (CFG-01 has none either). This matters only under the already-stated F05 residual (the runtime role can forge an attested-looking change), so it is recorded as an implementation note, not a finding |
| `task.json` conductor-valid | `aix-conductor/dist/records.js` `validateTaskManifest` (dist newer than `src/records.ts`), run read-only; conductor repository clean before and after | `{"ok":true,"errors":[]}` |

## 4. Non-negotiable property and regression check

Property: a `SECURITY` / `SECURITY_TOKEN` outcome can never reach `SPOT`, `OTC`, `PAY`, `DEPOSIT_MB_PSO` or `WITHDRAWAL_MB_PSO`.

| Item | Result | Basis |
|---|---|---|
| `SECURITY` cannot reach MB/PSO | **Holds** | B1 still reads the stored `latest_outcome` (a drifted `SECURITY` denies as `SECURITY`, 05 §7 rule-order note). It is enforced at mint (log/token insert triggers) and at consumption (`assert_token_consumable`); the matrix and allow-list are unchanged |
| Exact canonical resolution | **Holds** | 04 §6.1 step 2: 0 ⇒ `INSTRUMENT_NOT_FOUND`, >1 ⇒ `INSTRUMENT_REFERENCE_AMBIGUOUS`, no token. `{asset_code, chain, network}` is still rejected (04 line 139). The resolver now uses the SQL canonicaliser (05 §2.1) |
| SQL consume backstop | **Holds** | 05 §7 `assert_token_consumable` (i)–(v); the token `BEFORE UPDATE` trigger; now also B8 clause (b) and B12 |
| Fiat keyed on `instrument_form` | **Holds** | B3 and derivation step 0 are form-based; the class/form race with the first insert is now locked (§13) |
| Digital MYR ⇒ `NOT_ASSESSED` | **Holds** | C1m, B10, 04 line 206; no override |
| Real + test-only classification ⇒ `NOT_ASSESSED` | **Holds** | Trigger 8, B11, 01 §4.4 row |
| Token binding complete | **Holds** | 05 §8.1 binding columns immutable; `consumer_service` compared at insert and consume; B9 |
| No `exchange.*` namespace | **Holds** | §3 |
| Synthetic cannot become real | **Holds, strengthened** | `declared_synthetic` immutable from insert; `lineage.synthetic` now insert-only (F28(c)); real↔synthetic merge and link refused |

The word-level diff v1.2 → v1.3 shows rewordings and extensions only. No control was removed.

## 5. Dispositions

### 5.1 Round-3 findings

| Finding | Disposition | Basis |
|---|---|---|
| **F27** Lineage merge does not fail-close existing `NON_SECURITY` members | **CLOSED IN BLUEPRINT** | §§6–8. `merge_global_seq` is DB-assigned under the exclusive gate. Clause (b) covers all eight required scenarios. Narrowing is derived, so it is SQL-enforced at mint and consume regardless of whether the application revokes. Revocation and audit happen in the merge transaction. A pre-merge review cannot clear the condition. The lock and visibility residue that is not merge-specific is in F30/F31 |
| **F26** `ASSET_CLASS_CORRECTION` invisible to SQL | **SUPERSEDED BY NEW FINDING (AST-01-F29)** | On the governed path, SQL now sees the correction (B12), revokes tokens in the same transaction, and requires a new classification. However, B12's input is the application-written cached fingerprint, and SQL never checks that the correction changed it. SQL visibility therefore still depends on the application in the one respect F26 was about (§9) |
| **F28(a)** Canonical form only in TypeScript | **CLOSED IN BLUEPRINT** | §11. The rule is feasible in pure SQL. `CHECK` plus trigger reject rather than rewrite, and the index sees validated values only. The version-change semantics residue is in F32(a) |
| **F28(b)** Application-suppliable timestamps in the elevated rule | **CLOSED IN BLUEPRINT** | §12. A related ordering on an application-suppliable timestamp outside the elevated rule is in F32(b) |
| **F28(c)** `lineage.synthetic` updatable | **CLOSED IN BLUEPRINT** | Insert-only (`INSERT, SELECT` grant), `trg_lineage_immutable` for every role including the owner, plus the S10 inventory. The value source is fixed at asset creation and a wrong flag can only fail closed (instrument insert requires equality). Real/synthetic separation is absolute |

### 5.2 Earlier findings

| Finding | Disposition |
|---|---|
| **F17** Canonical identity | **EXTERNAL GATE REMAINS** (DCR-AST1-002(7), WLT-01 contract identity). AST-01 side strengthened by F28(a) |
| **F21** MYR | **EXTERNAL GATE REMAINS** (DCR-AST1-008(c), OQ-6). Unchanged, honest |
| **F02** Consumer token adoption | **EXTERNAL GATE REMAINS** (DCR-AST1-004) |
| **F05** Checker identity | **EXTERNAL GATE REMAINS** (DCR-AST1-001(a)+(d)); apply disabled until IAM-02 attests (01 §4.8) |
| **F20** Sibling narrowing | **Remains SUPERSEDED BY F27** (now closed) |
| **F18** Consumption backstop | **Closed, no regression.** The consume path is unchanged (instrument `SHARE` → token `X`). F31's inversion is between two writers and does not touch consumption |
| **F19** Deterministic lineage signals | **Closed, no regression.** Strengthened by F28(c) |
| **F22–F25** | **Closed, no regression.** F22's class/form race is now locked (§13) |
| F03, F07, F09–F16 | Not regressed (§4; change-kind map extended in 07 §5) |
| F01, F04, F06, F08 | Superseded in R2; follow F17, F18, F19/F20→F27, F21/F22 |

## 6. Ordering-domain adjudication (the high-focus question)

**Question.** Does the lock/gate protocol give sequence order the transactional meaning the design assigns to it?

| Sub-question | Finding |
|---|---|
| When are gate locks taken? | By the application as its first statements after `G` (05 §7A), and again, non-optionally, by the `BEFORE INSERT` triggers: record trigger 2(a), `trg_evidence_server_order` step 1, `trg_lineage_merge_apply` step 3. The sequence value is drawn in the same trigger **after** these locks |
| Transaction-scoped and held to commit/rollback? | **Yes.** They are PostgreSQL row locks (`FOR SHARE` / `FOR UPDATE` on `lineage_gate`), held to transaction end. A `ROLLBACK TO SAVEPOINT` releases them only together with the insert that took them, because the trigger runs inside the insert, so a record can never outlive its locks |
| Can two transactions draw in one order and commit in the other? | **Not for any pair the design compares.** An exclusive holder (real `SECURITY` apply, merge) draws only after every `SHARE` holder has ended, and every later `SHARE` holder waits for its commit. So for every pair containing an exclusive event, draw order = commit order. Pairs on one instrument are serialised by the instrument `FOR UPDATE`. **Two `SHARE` holders on different instruments can invert**, for example two non-`SECURITY` records or two evidence items. No rule compares such a pair: clause (a) compares `r` (exclusive) with `c`; clause (b) compares `m` (exclusive) with `c` and `r`; the evidence floor compares `E` with `F` (exclusive). Correction markers are drawn **without** the gate and are never compared. The claim in 05 §7A ("sequence order = commit order for **all** classification events") and INV-21's inclusion of markers are therefore broader than true. INV-21 in 05 §5 is correctly scoped (F30(c), wording only) |
| Rollback / gaps | **Harmless.** `nextval` is non-transactional; a rolled-back draw leaves a gap no row references. No rule assumes contiguity (`record_seq` gaplessness is per instrument and separate) |
| Can the affected set change after it is locked? | **Only by instruments that cannot need narrowing.** Under the exclusive gate, no record or evidence can be written. An instrument inserted concurrently (it takes only its asset `SHARE`) has no record, so B2 denies and there is no token. Its first record must take the gate, so it is written after commit and sees the event (trigger 7 ⇒ elevated). An underlying link can be added only while the wrapper is `DRAFT`, and a `DRAFT` instrument has no record (06: the first case submit locks identity). Membership changes only through merges, which are gate-exclusive |
| Does `AS006` retry close the race? | It is a belt-and-braces check. The set can grow only by record-less instruments, so `AS006` is at worst a spurious retry (availability) and never a safety dependency |
| Are underlying/wrapper sets complete? | **Yes.** The affected set = both trees plus every instrument whose transitive underlying chain reaches either tree, which is exactly the set whose `B(X)` contains the merged tree. Chains deeper than 8 are refused at link insert; where depth > 8 could arise through upstream wrappers, `lineage_review_required` is fail-closed true for that wrapper, so an enumeration cut-off cannot leave it eligible |

**One condition the protocol does not itself guarantee: visibility.** Sequence order is only meaningful if a writer that draws after acquiring the gate **sees** every lower-numbered exclusive event. That is true only when every query in the trigger runs on a fresh snapshot, which requires `READ COMMITTED` together with `VOLATILE` functions. The design states `READ COMMITTED` (05 §7A principle) and `VOLATILE` (05 §7) but does not enforce the isolation level.

Under `REPEATABLE READ`, the apply transaction's snapshot is fixed at its first statement, the `G` lock, which is taken before the IAM-02 call. A real `SECURITY` record committed during that call is then invisible to trigger 7 even after the gate is acquired. The trigger appends a non-elevated `NON_SECURITY` record whose `global_seq` exceeds the `SECURITY` record's, so clause (a) is false and B8 never fires. **Adjudication: the gate gives the right order but not guaranteed visibility; see F30(a).**

## 7. Lineage-merge adjudication

The predicate was worked through for each scenario the brief lists (`c` = X's current record).

| Scenario | Result |
|---|---|
| Older `SECURITY` (r=10, L2) + newer `NON_SECURITY` (c=50, L1), then merge m=60 | (b): 60 > 50, 10 < 60 ⇒ **narrowed** (T-LIN-15) |
| Newer `SECURITY` (r=50, L2) + older `NON_SECURITY` (c=10, L1), then merge | (a): 50 > 10 ⇒ **narrowed** (T-LIN-16) |
| Merge after elevated review (X reviewed at c=50 over r=10; clean tree merged at 60) | (b) true ⇒ narrowed. This is the documented over-approximation: availability cost only (AR-24, T-LIN-25). Re-review floor = 60, so pre-merge evidence cannot clear it |
| Multiple sequential merges | Each merge newer than `c` into a tree holding an earlier `SECURITY` fires (b). A `SECURITY` joined by a later merge makes that later merge the (b) event. **Nothing missed** |
| Clean tree merged into a security tree | Clean-side members: (b) true ⇒ narrowed. Security-side members already reviewed: narrowed (over-approximation) |
| `SECURITY` entered through an earlier merge, X joins later | The joining merge is newer than `c` and the tree holds `r` < merge ⇒ narrowed |
| Underlying tree merge (depth 1–3) | `G ∈ B(X)` through the underlying ⇒ narrowed; the wrapper is in the lock set (T-LIN-17/27) |
| Wrapper's own tree merge | Own tree ∈ `B(X)` ⇒ narrowed |
| Deep underlying (> 8) | Fail-closed true |
| Concurrent classification and merge | Serialised on the gate. A record written after the merge is elevated and must follow the merge (floor includes it). A record written before is older than `m` ⇒ (b) |

**Over-approximation is availability-only.** Clause (b) adds deny conditions beyond the side-aware rule and removes none; it cannot widen eligibility. The only clearing path is a newer record, and trigger 7 forces that record onto the elevated path whenever `SEC(G) ≠ ∅` or the depth is fail-closed. That is exactly when either clause can be true.

**Merge transaction.**

| Property | Result |
|---|---|
| Narrows immediately | Yes: derived, effective at commit, SQL-enforced (B8 at mint and consume) |
| Revokes affected tokens in the same transaction | Yes (05 §7A merge step 7); a failure rolls back the merge |
| Includes wrappers and transitive dependents | Yes |
| Auditable propagation event | Yes: `ast1.lineage.merged`, `…security_determination_propagated` (`trigger = MERGE`), in the outbox, same transaction |
| Cannot commit while revocation fails | Yes (one transaction). Even if the application **omitted** revocation, any live token is refused at consume by B8 (T-LIN-19), so safety does not depend on revocation |
| Cannot miss a concurrent insert or classification | Yes (§6) |

**Clearing.**
- Clearing needs a newer record with (i) two attested checkers, (ii) the "lineage reviewed" attestation, (iii) evidence whose `evidence_global_seq` is above the floor (the floor includes merges that joined security history), and (iv) a `follows_event_*` binding that equals the floor recomputed at apply.
- A pre-merge record has `global_seq < m`, so it **cannot clear**.
- A non-elevated reaffirmation is refused by trigger 7 and **never becomes a record**.
- A new triggering event between submit and apply moves the floor, so the binding goes stale and the record is refused.

## 8. C0b / B8 parity

The definitions were compared text to text: 01 §4.7A (C0b) against 05 §7 (`lineage_review_required`) and the B8 row.

| Element | C0b | B8 | Equal |
|---|---|---|---|
| Scope | real X, current record `NON_SECURITY` | real, `latest_outcome = NON_SECURITY` | yes |
| Basis trees | own asset's merge tree + transitive underlyings' trees; depth > 8 ⇒ true | same | yes |
| (a) | real `SECURITY` on **another** instrument, `global_seq > c` | `r.instrument_id ≠ X`, `r.global_seq > c.global_seq` | yes |
| (b) | merge `> c` and tree holds real `SECURITY` recorded before that merge | `m > c` ∧ ∃ `r < m` in `SEC(G)` | yes |
| Synthetic `SECURITY` | never counts | `SEC(G)` real only | yes |
| Effect | `NOT_ASSESSED LINEAGE_SECURITY_REVIEW_REQUIRED`, every subject | deny any subject | yes (TS applies it after `PERMITS`; the SQL is coarser, never finer) |

**Equivalent.** The sweep has a third, independent computation (S5), and T-LIN-24 parity-tests all three over generated ledgers that include merges. Editorial nit, not a finding: 02 W3 row 2 still says evidence "recorded after the last `SECURITY` record". Trigger 7 (the review floor, including merges) is authoritative and stricter; align the wording in the next version.

## 9. B12 adjudication

| Check | Result |
|---|---|
| `record_fingerprint_matches` derived from stored values, never a parameter | Yes (05 §7; T-FPR-09) |
| B12 denies raw allow insert, raw consume, admission insert/approve, attestation, custody approve, operational enable | Yes: all route through `backstop_permits`; consume through `assert_token_consumable` (T-FPR-01) |
| B1 ahead of B12; drifted `SECURITY` still denies as `SECURITY` | Yes |
| **Does B12 see the mismatch from *authoritative* stored values?** | **Only partly.** The record side (`classification_record.identity_fingerprint`) is trigger-bound to the cached value at record time. The instrument side is the **cached** `identity_fingerprint`, which the correction transaction writes with a value computed in TypeScript. The database cannot recompute it, and neither `trg_asset_class_frozen`, the marker trigger nor the deferred constraint checks that it **changed**. So SQL sees the correction only if the application writes a different value. A correction writer that hashes the pre-update asset row, or skips the instrument `UPDATE`, leaves the cached value equal to the old record's. B12 then stays silent while the class is `SECURITY_TOKEN` and the record is `NON_SECURITY`, which is exactly R3's F26 scenario. TypeScript (recompute from live columns) and the sweep (S4) still catch it. The claim in 05 §7A step 8, "whatever the application does", is not true. The same root cause lets any writer inside a correction transaction restore the pre-correction fingerprint. **AST-01-F29** |

## 10. Class-correction adjudication

| Attack / requirement | Result |
|---|---|
| `DIGITAL_CURRENCY` + `NON_SECURITY` → correction into `SECURITY_TOKEN`; before a new classification: raw allow insert, raw consume, admission approval, attestation, custody/operational enable | **All deny on the correct governed path** (B12) — subject to F29 |
| Token revocation in the correction transaction | Yes, and **non-optional**: the deferred constraint refuses a commit without markers and revocation (T-FPR-07) |
| Correction out of `SECURITY` preserves history | Yes: records are append-only and elevated reads outcomes, not class, so the old `SECURITY` record keeps `OWN_LINEAGE`. B1 denies MB/PSO on the stored outcome meanwhile (T-FPR-02) |
| New classification mandatory | Yes: trigger 4 binds a new record's fingerprint to the corrected cached value. Into a `SECURITY` label, only `SECURITY`/`UNRESOLVED` can follow (trigger 6) |
| Correction ↔ first instrument insert | Serialised on the asset row (`FOR UPDATE` vs `FOR SHARE`). Exactly one order; no class/form interleaving |
| **Marker: forged** | Requires an applied-in-this-transaction correction for (asset, from, to) and the instrument's newest record. Even when forged, it only relabels (hold vs no hold). **B12 denies with or without it** |
| **Marker: stale** | Stops explaining once a new matching record exists (`record_fingerprint_matches` true) |
| **Marker: wrong asset / wrong from-to** | The explained-drift definition requires the change to target the marker's asset and (from, to). *Implementation note:* the insert trigger and S3 should also assert `marker.asset_id = instrument.asset_id`. At worst this is a mislabel; no permission follows |
| **Marker: reused after another identity change** | Explains only while `new_instrument_fingerprint` equals the current cached value. A second correction adds a new marker; an unexplained change ⇒ `SYSTEM` hold |
| **Direct fingerprint tampering** | Trigger-blocked after lock except inside a correction transaction. A tamper that moves the cached value away from the record ⇒ B12 deny + S2/S4 hold. A tamper that restores the record's value ⇒ B12 silent (F29) |
| Governed ⇒ `NOT_ASSESSED`, no hold; unexplained ⇒ `SYSTEM` hold; B12 denies both | Yes (05 §5.3, §7.1 S1–S4) |

## 11. Canonicalisation adjudication (F28(a))

| Check | Result |
|---|---|
| Feasible at DB level | **Yes.** EVM (`0x` + 40 hex, lower-cased), base58 (identity) and TRON base58check (identity, hex form refused) are pure regex + case rules and legitimately `IMMUTABLE`. Chains with no expressible rule cannot carry a token instrument (fail closed). No chain is forced into an unsafe rule |
| Network-specific rule/version authoritative | Yes: the trigger overwrites `address_format`/`address_canonicalisation_version` from `network_registry`; the registry `CHECK` requires a supported rule |
| Non-canonical equivalent spelling rejected, not rewritten | Yes: `AS005` when `canonicalise(x) ≠ x` or `NULL`; the `CHECK` also holds with the trigger disabled (T-ADR-01/02) |
| Unique index over validated values | Yes |
| Resolver uses the same semantic rule | Yes: the same SQL function; `NULL` ⇒ `INSTRUMENT_NOT_FOUND` |
| TypeScript parity failure fails closed | Yes: a TS-mirror divergence surfaces as `AS005` at insert or `INSTRUMENT_NOT_FOUND` at resolve, never as a second row (T-ADR-02/03) |
| Version-change story | Present (pre-activation fixed-point and collision sweep; re-mapping is out-of-pack governed work), but **incomplete**. It permits "changing a rule" for an existing (format, version) pair, which silently changes an `IMMUTABLE` function under a live `CHECK`. And the trigger's `UPDATE` arm is ambiguous: if it re-reads the registry, then after a version bump or a `SUSPENDED` network every `UPDATE` of an existing instrument fails, including the correction's fingerprint update and retire. Fail-closed, availability only. **AST-01-F32(a)** |
| Sweep detects legacy collision | Yes (S9; T-ADR-05) |

## 12. Evidence-ordering adjudication (F28(b))

| Check | Result |
|---|---|
| `evidence_global_seq` not caller-suppliable | Yes: `BEFORE INSERT` overwrites it, drawn after gate `SHARE` + instrument lock (T-ADR-06) |
| Elevated evidence newer than the exact trigger (record **or** merge) | Yes: floor `F` = max of real `SECURITY` `global_seq` and every (b)-qualifying `merge_global_seq` over all basis trees (trigger 7(iii)) |
| `follows_event_*` cannot point at an older convenient event | Yes: set by trigger at submit (maker cannot supply), and at apply it must equal the **recomputed** `F`. An older event is not `F` |
| New trigger between submit and apply ⇒ stale | Yes (`binding_stale`; T-LIN-21, T-ADR-08) |
| No decision on `recorded_at_utc` | Yes for the elevated rule, the lineage predicate and B8 (T-ADR-10). **Outside that scope:** `securities_market_admission_attestation` resolves "the newest row per `(instrument_id, admission_ref)` wins" with no defined ordering key. The only candidate is `received_at_utc DEFAULT now()`, which the application can supply. **AST-01-F32(b)** (securities-domain C5 only; MB/PSO unaffected) |

## 13. Lock-graph adjudication

The stated order is: governed change → gate → asset → instruments ascending → tokens → append-only inserts. Every path in the brief was checked.

| Path | Specified sequence | In order? |
|---|---|---|
| Classification writer (non-`SECURITY`) | G → 0 `S` → 2 (one) → 3 → 4 | yes |
| **Real `SECURITY` writer** | G → 0 `X` → 2 **X first**, then the affected set ascending (05 §5.1 trigger 2(b)→(c); §7A "the instrument, then every affected instrument, ascending") | **No: not ascending within level 2.** W11 says "A and every affected instrument … ascending", which contradicts 05 |
| Evidence insert | 0 `S` → 2 (one) → 4 | yes |
| Lineage merge | G → 0 `X` → 2 ascending → 3 → 4 | yes |
| Hold / admission / custody / operational / attestation / retire | (G) → 2 (one) → 3 → 4 | yes |
| Token consume | 2 `S` → 3 `X` | yes |
| Token revoke | 2 `X` → 3 | yes |
| `ASSET_CLASS_CORRECTION` | G → 1 `X` → 2 ascending → 3 → 4 (no gate) | yes |
| First instrument insert | 1 `S` → new row | yes |
| Asset-class edit (no instrument) | 1 `X` | yes |
| Evidence-standard retirement | (G) → 2 ascending → 3 | yes |
| **Case submit** (identity lock + `follows_event_*` "under the locks of §7A") | **Not in the "Who takes what" table** | unspecified (safety is held by the apply-time recompute; the lock order is not) |

**Specific edges requested:**
- **Asset row vs gate:** no path takes both; the correction takes no gate, and the gate writers take no asset lock.
- **Asset vs instrument:** always 1 → 2. The instrument insert's `FOR SHARE` and the correction's `FOR UPDATE` conflict as intended. No path takes the asset lock while holding an instrument lock (trigger 6 and the fiat trigger only *read* the asset).

**Cycle found (F31).** A real `SECURITY` apply on X holds X and waits for a sibling S with a lower id. A concurrent `ASSET_CLASS_CORRECTION` on the same asset, or an evidence-standard retirement, has taken S first by ascending order and waits for X. That is a cycle in the specified normal path. The level tracker (`AS006`) checks levels only, not intra-level order, so PostgreSQL's deadlock detector aborts one side. The result is fail-closed and retriable, but it contradicts the stated acyclicity. The cycle table omits the correction ↔ real `SECURITY` pair and asserts that "two writers on overlapping instrument sets: ascending order in both" holds. T-LOK-01 as written would fail against the spec. The same order was in v1.2 (§2).

## 14. New findings

Severity uses the `OPEN_FINDINGS` vocabulary. None requires a human decision.

### AST-01-F29 — LOW — B12 depends on an application-written cached fingerprint; SQL never asserts that the correction changed it (supersedes F26)

- **Affected sections:** 05 §4.1 `trg_asset_class_frozen` (iv) and its deferred constraint, §4.2 `trg_instrument_identity_immutable`, §5.3, §7 (`record_fingerprint_matches`, B12), §7A "Asset class correction apply" steps 5 and 8; 01 §3.3, §3.4, INV-22; 02 W13; 10 T-FPR-01/07.
- **Evidence:**
  - `record_fingerprint_matches` compares the record's stored fingerprint with `instrument.identity_fingerprint`, a **cached, application-computed** value. 05 §7 says so: "The database cannot recompute the fingerprint".
  - The correction transaction is the one place allowed to write that column after lock. Nothing in SQL checks the value written:
    - the marker has no `CHECK` tying `new_instrument_fingerprint` to `superseded_record_fingerprint` or to the instrument;
    - the deferred constraint checks only that markers and revocations are present.
  - A defective correction writer (fingerprint hashed from the pre-update asset row, or the instrument `UPDATE` omitted) commits a `SECURITY_TOKEN` asset whose instruments still match their `NON_SECURITY` records. B12 is then false; B1–B11 do not read the class. So a raw `allow` insert, a new token's consumption and an admission approval all pass SQL.
  - TypeScript (recompute from live columns) and the sweep (S4) still deny or hold. This is R3's F26 shape, conditional on a writer defect.
  - The same gap lets a write inside a correction transaction set the cached value **back** to the old record's fingerprint.
  - Design rule 1.6 ("the security backstop never trusts application-supplied denormalised columns") and 05 §7A step 8 ("whatever the application does") are both contradicted.
- **Required correction:**
  1. Make the class binding SQL-authoritative. Add `classification_record.asset_class_at_record`, filled by trigger from the asset row read under the instrument lock and immutable. Extend B12 (or add B12b) to deny when it differs from the live `asset.asset_class`. SQL can check this exactly, independent of any hash.
  2. At minimum, the deferred constraint on branch (b) must require, for every instrument with a record, `instrument.identity_fingerprint <> superseded_record_fingerprint` and `= marker.new_instrument_fingerprint`.
  3. Correct the "whatever the application does" claim to match.
  4. Add tests:
     - a correction whose writer leaves the fingerprint unchanged is refused at commit, or B12 still denies;
     - restoring the old fingerprint inside a correction transaction does not restore eligibility.
- **Implementation impact:** small (one column + one predicate, or one deferred assertion). Blocks **P1** (`authoritative_state`/B12 definition) and **P3** (correction apply).
- **Human decision:** No.

### AST-01-F30 — LOW — Ordering visibility: `READ COMMITTED` is load-bearing but unenforced; the merge trigger checks roots before the gate; the ordering claim is overstated

- **Affected sections:** 05 §1 rule 12, §3 `trg_lineage_merge_apply` steps 1–3 and `lineage_root()`, §5 INV-21 text, §5.1 triggers 2 and 7, §7 (`VOLATILE` note), §7A level 0 and principle; 01 INV-21; 10 T-LIN-22/23, T-ADR-09.
- **Evidence:**
  - **(a) Isolation.** Every "newer than" rule assumes that a trigger which draws after acquiring the gate also **sees** every lower-numbered exclusive event. That holds under `READ COMMITTED` with `VOLATILE` functions, which the blueprint states as a principle but never enforces. The runtime role can run `REPEATABLE READ` (or a pool can default to it). The snapshot is then fixed at the transaction's first statement, the `G` lock before the IAM-02 call.
    - A real `SECURITY` record on a sibling commits during that call.
    - Trigger 7 does not see it and appends a non-elevated `NON_SECURITY` record.
    - That record's `global_seq` exceeds the `SECURITY` record's, so clause (a) and B8 are false and the instrument is MB-eligible.
    - Only sweep S7 detects it afterwards. No lock contention is needed; the IAM-02 call is the window.
  - **(b) Merge roots.** `trg_lineage_merge_apply` step 1 ("both arguments are current roots") runs **before** step 3 takes the gate. On the protocol path the application already holds the gate, so it is safe. For a caller that skipped the application's steps (the case the trigger exists for), two opposite merges (A→B, B→A) can both pass step 1 and serialise at the gate. `UNIQUE (merged_lineage_id)` does not stop the second, and the re-derived set does not grow, so the second commits a **cycle**. `lineage_root()` behaviour on a cycle is unspecified. An implementation that returns `NULL` empties `SEC(G)`, and clause (a), clause (b) and `elevated` all go false.
  - **(c) Wording.** 05 §7A level 0 says "sequence order = commit order for **all** classification events". Two `SHARE` holders on different instruments can invert. INV-21 (01) lists correction markers, which are drawn without the gate. No rule compares either pair (§6), but the invariant should state the exact property.
- **Required correction:**
  1. Every lock helper, and the record, evidence, merge and correction triggers, must assert `current_setting('transaction_isolation') = 'read committed'` (raise `AS006` otherwise, fail closed), unless a `SERIALIZABLE`-safety proof is recorded. Add a test that runs the IAM-window race under `REPEATABLE READ` and gets `AS006`.
  2. Reorder `trg_lineage_merge_apply` so the gate is taken first and the root and real/synthetic checks run under it. Specify that `lineage_root()` raises on a cycle or excessive depth (never returns `NULL` or a partial root). Test concurrent opposite merges on the raw path.
  3. Restate INV-21 and the level-0 rationale as: "for every pair in which one event holds the gate exclusively, and every pair on one instrument"; drop markers from the ordering claim or draw them under the gate.
- **Implementation impact:** small (assertions, a trigger reorder, a function contract, tests). Blocks **P1**.
- **Human decision:** No.

### AST-01-F31 — LOW — Deadlock-prone lock inversion in the specified normal path: real `SECURITY` apply locks its own instrument before the ascending affected set

- **Affected sections:** 05 §5.1 trigger 2(b)–(c); 05 §7A "Who takes what" (real `SECURITY` row), cycle table, "Lock-set re-derivation"; 02 W11 step 1 (contradicts 05); 01 INV-20; 10 T-LOK-01/02, T-FPR-06(iv). The inversion is inherited from v1.2 §5.1 trigger 2.
- **Evidence:**
  - Trigger 2 takes `lock_instrument(X)` and only then `lock_affected_instruments(X)` ascending, and §7A repeats "the instrument, then every affected instrument, ascending".
  - `ASSET_CLASS_CORRECTION` (G → asset → **all** instruments of the asset ascending, no gate) and evidence-standard retirement (instruments ascending, no gate) lock overlapping sets in pure ascending order.
  - With a sibling S < X on the same asset: the `SECURITY` apply holds X and waits for S; the correction holds S and waits for X. That is a waits-for cycle.
  - The gate does not prevent it (neither the correction nor the retirement takes it), and the level tracker does not detect it (same level).
  - The cycle table omits correction ↔ real `SECURITY` apply and asserts that overlapping writers are "ascending in both".
  - Case submit, which sets `follows_event_*` "under the locks of §7A", is missing from the table.
  - PostgreSQL aborts one side (`40P01`), so the outcome is fail-closed and retriable: availability only. It violates the acceptance criterion that the specified normal path has no deadlock-prone cycle.
- **Required correction:**
  1. Under the gate, derive the affected set (it contains X) without first locking X. Asset and lineage membership are immutable, so no instrument lock is needed to derive it. Then lock the whole set ascending, in the trigger and in the application, and align 05 §5.1, §7A and 02 W11.
  2. Add correction ↔ real `SECURITY` apply and standard retirement ↔ real `SECURITY` apply to the cycle table.
  3. Add a case-submit row (for example: G → 0 `SHARE` → 2 X).
  4. Make the level tracker also enforce ascending `instrument_id` within level 2 (it records the last id taken), so a violation raises `AS006` instead of deadlocking.
- **Implementation impact:** small, text and helper contract. Blocks **P1** (lock helpers) and **P3** (`SECURITY` apply).
- **Human decision:** No.

### AST-01-F32 — LOW — Residual DB hygiene: canonicaliser version semantics; attestation ordering on an application-suppliable timestamp

- **Affected sections:** 05 §2.1 (Versioning), §4.2 (`CHECK`, `trg_instrument_address_canonical` `UPDATE` arm), §6 `securities_market_admission_attestation` and the key-immutability table ("newest row … wins"); 01 §8.6; 10 T-ADR-04/05/10.
- **Evidence and required correction:**

  **(a) Versioning and the `UPDATE` arm.**
  - *Evidence:* The canonical-form `CHECK` re-runs `canonicalise_address(format, stored version, value)` on every `UPDATE` of an instrument row. §2.1 lets a migration "add or change a rule" by replacing the function. Changing an existing (format, version) pair's behaviour, or dropping an old version, silently changes an `IMMUTABLE` function under a live `CHECK`. PostgreSQL does not revalidate, so existing rows then fail on any `UPDATE` (retire, identity lock, the correction's fingerprint write) and on dump/restore.
  - *Evidence:* The trigger's `UPDATE` arm is described as existing "only to refuse mutation" but also as reading the registry (network `ACTIVE`, overwrite format/version). If it re-derives on `UPDATE`, then a `SUSPENDED` network or a version bump blocks every `UPDATE` of existing instruments, including a tightening correction.
  - *Correction:* A (format, version) rule is immutable once any row references it; new behaviour is a new version, and the function retains every referenced version. The `UPDATE` arm compares `OLD`/`NEW` identity columns only and never re-reads the registry. Add a test that retires and corrects an instrument on a `SUSPENDED` network and after a version bump.

  **(b) Attestation ordering.**
  - *Evidence:* "The newest row per `(instrument_id, admission_ref)` wins" has no ordering key. The only candidate is `received_at_utc DEFAULT now()`, which the application can supply. A back-dated `WITHDRAWN` row loses to an earlier `ADMITTED` row, so a withdrawn securities-market admission stays effective for C5. This is the same class as F28(b), and T-ADR-10's scan scope excludes it. It affects the securities domain only; MB/PSO is unaffected.
  - *Correction:* Order by a DB-assigned sequence (for example `attestation_seq` from a sequence, trigger-assigned). Fill `received_at_utc` by trigger (audit only). Extend T-ADR-10 to every "newest/latest" rule in the pack.
- **Implementation impact:** P1 schema text; small.
- **Human decision:** No.

## 15. OQ-8

**Stays OPEN. It is not decided or resolved, and no decision is invented.** v1.3 does not make it unsafe:
- The DB canonical check means a malformed spelling is now rejected rather than consuming an identity.
- A well-formed typo still consumes a (wrong) identity, which is harmless and fail-closed.
- No draft-correction path was added (17 §3).

R3 §13's adjudication stands: conservative, operational, non-blocking.

## 16. External gates and DCRs

- **External gates.** F17 (DCR-002(7)), F21 (DCR-008(c), OQ-6), F02 (DCR-004) and F05 (DCR-001(a)+(d)) are stated honestly in 17 §2/§2.1, and none is claimed closed.
- **DCR-006.** Extended for `LINEAGE_MERGE` apply-narrowing and merge-triggered elevated reaffirmation, as R3 §15 asked.
- **Implementation status.** No DCR is implemented or executed, which is correct for a blueprint.

## 17. `task.json` / task state

- **State:** `IDLE`, conductor-valid (`{"ok":true,"errors":[]}`, §3). Implementation-ineligible: the gate starts only from `PLAN_READY`.
- **Not changed by this review.** No lifecycle event is invented; the round counts and `findingsSummary` are left for the next conductor or remediation checkpoint. The current summary does not yet list this R4 or F29–F32, and F26 is superseded by F29. The summary's staleness is not a blocker while it stays schema-valid.
- **`PLAN_READY` must not be set** by any author or reviewer. Only the human/conductor `approve-plan` checkpoint sets it, after an `ACCEPT` re-review.

## 18. Required before the next re-review

1. Correct **F29, F30, F31, F32** (all LOW) in a v1.4 pack. v1.3 stays unchanged as reviewed evidence.
2. Align the editorial nit in 02 W3 row 2 (evidence "after the last `SECURITY` record" → the review floor).
3. Optional implementation notes (not acceptance conditions):
   - SQL enforcement of `governed_change` terminal status (§3);
   - `marker.asset_id = instrument.asset_id` (§10).
4. The next re-review needs to examine only F29–F32. F26 (via F29), F27 and F28 are dispositioned above; F17–F25 and older findings are not regressed.

---

AIX AST-01 v1.3 SEPARATE-CONTEXT RE-REVIEW:
REMEDIATE — IMPLEMENTATION NOT AUTHORISED
