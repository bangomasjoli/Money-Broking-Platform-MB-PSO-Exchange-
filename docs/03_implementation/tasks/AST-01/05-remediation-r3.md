# 05 Remediation R3 — AST-01: blueprint v1.3

- **Task ID:** AST-01
- **Status:** **REMEDIATED / AWAITING RE-REVIEW.** Nothing is accepted. **Implementation is not authorised.** Documentation only: no implementation, migration or merge.
- **Remediating agent:** Claude Sonnet 5 (`claude-sonnet-5`); effort not specified in the invocation.
- **Reviewed blueprint:** v1.2 @ `f769689` (kept **unchanged**; v1.0 and v1.1 also unchanged)
- **Review:** [04-review-r3.md](04-review-r3.md) at `56b0d6d` — verdict **REMEDIATE**; 2 MEDIUM (F27, F26), 1 LOW (F28)
- **Starting HEAD:** `56b0d6d` (branch `module/AST-01`, tree clean, `main` = `origin/main` = `43f2f34`, untouched)
- **Remediated pack:** [docs/02_modules/AST-01/blueprint/v1.3/](../../../02_modules/AST-01/blueprint/v1.3/README.md)
- **Independence note:** v1.3 is authored by the same model family as v1.0–v1.2 (`claude-sonnet-5`). The review it answers was context-independent but not model-family-independent. **A separate-context re-review is required** before any finding is closed. Findings below are marked *remediated*, not *closed*.

## Human decisions

**None new.** The review found F26, F27 and F28 to be technical corrections inside decisions already approved (AST-P-3, AST-HD-6, AST-HD-8, AST-HD-9): "Human decision: No" on each. The race between `ASSET_CLASS_CORRECTION`/class freeze and the first instrument insert is folded in as a technical correction, as instructed. **OQ-8 stays open** (below).

## Finding map — round 3

| Finding | Sev | Status | v1.3 location | What was done |
|---|---|---|---|---|
| **F27** lineage merge does not fail-close existing `NON_SECURITY` members (supersedes F20) | MED | **REMEDIATED** + DCR-AST1-006 extended | 05 §1 rules 12–13, **§3** (`lineage_merge.merge_global_seq`, `trg_lineage_merge_apply`), **§5.1** triggers 2, 3, 7, **§7** (`lineage_review_required`, B8), **§7.1** S5–S8, **§7A** ("Lineage merge apply"); 01 INV-17, INV-21, §3.9, §4.7, **§4.7A**; 02 W3, W11, **W12**; 04 §3, §5, §7, §8; 06 SM-3, SM-8; 07 §3, §5; 08 §1.1, §1.4, §1.6; 09; 12 AR-19, AR-24; 17 DCR-006. **Tests:** `T-LIN-15…27` (A→`T-LIN-15`, B→`-16`, C→`-17`, D→`-18`, E→`-19`, F→`-20`, G→`-21`, H→`-22`), `T-DER-13`, `T-CLS-17/18`, `T-CON-14`, `T-INT-07` | Every governed merge receives a **DB-assigned `merge_global_seq`** from the *same* sequence as classification records (`ast1.classification_global_seq`), drawn only after the lineage gate and every affected instrument are locked ascending and the change is authorised; no caller value. `lineage_review_required` gains **clause (b)**: a merge newer than X's current record whose tree holds a real `SECURITY` record recorded before it — over X's own merge tree **and** every transitive underlying's tree — alongside clause (a) (newer `SECURITY` record). Defined identically in TypeScript C0b and SQL B8 and parity-tested. **The merge transaction itself narrows**: it identifies the affected real instruments and wrappers, revokes their outstanding tokens (`lineage_security_determination`), emits `ast1.lineage.merged` and `ast1.lineage.security_determination_propagated` (`trigger = MERGE`); no later sweep is needed for safety. Cleared only by a **newer elevated record** whose evidence is newer *by sequence* than the triggering record or merge and explicitly bound to it; a pre-merge record can never clear it and a non-elevated reaffirmation is refused by the trigger. Sweep extended (defence in depth). DCR-006 names merge-triggered elevated reaffirmation/review authority; **no external DCR is executed** |
| **F26** `ASSET_CLASS_CORRECTION` invisible to SQL | MED | **REMEDIATED** | 05 §1 rule 14, **§4.1** (`trg_asset_class_frozen`), §4.2 (`trg_instrument_asset_lock`), **§5.3** (`class_correction_marker`), **§7** (`record_fingerprint_matches`, `drift_explained_by_correction`, **B12**), §7.1 S1–S4, **§7A** ("Asset class correction apply", lock order); 01 INV-22, §3.3, **§3.4**, §4.4, §4.6; 02 W3, W4, **W13**; 04 §2.1, §6.1 step 4; 06 SM-3/4/8; 08; 09 (`CLASSIFICATION_REQUIRED_AFTER_CORRECTION`, `AS001` tag `B12`); 12 AR-27. **Tests:** `T-FPR-01…10` (raw allow insert, raw consume, admission approval, attestation, token revocation → `-01`; correction out of `SECURITY` → `-02`; eligible only after new classification → `-03`; unexplained drift still holds → `-04`), `T-CLS-15`, `T-INT-06`, `T-LOK`, `T-DB-18` | `authoritative_state()` derives **`record_fingerprint_matches`** (newest record's stored fingerprint = instrument's stored fingerprint; never an app-supplied Boolean). New backstop rule **B12** denies any eligibility/action relying on the record: no allow/mint, no consumption (`AS003`), no admission approval, no attestation, no custody/operational enable; B1 stays ahead (a drifted `SECURITY` still denies as `SECURITY`). The correction is now a **locked, single-transaction writer** (governed change → asset row `FOR UPDATE` → **every** instrument of the asset ascending → tokens) that revokes all tokens (`asset_class_corrected`). A **`class_correction_marker`** holds the governing change reference: *governed correction awaiting reclassification* ⇒ `NOT_ASSESSED` `CLASSIFICATION_REQUIRED_AFTER_CORRECTION`, **no `SYSTEM` hold**; *unexplained drift* ⇒ `CLASSIFICATION_IDENTITY_DRIFT` + `SYSTEM` hold. Old records stay historical; a new governed classification is mandatory; out-of-`SECURITY` correction keeps the elevated path because the old `SECURITY` record stays in the lineage |
| **F28(a)** canonical address only in TypeScript | LOW | **REMEDIATED** | 05 §1 rule 15, **§2.1**, §4.2 (columns, `CHECK`, `trg_instrument_address_canonical`, index note), §7.1 S9, §10; 01 INV-23, §3.7; 04 §2.1; 08; 09 (`AST1_ADDRESS_NOT_CANONICAL`, `AS005`); 12 AR-28. **Tests:** `T-ADR-01…05`, `T-RES-07`, `T-SCH-10`, `T-INT-08` | A versioned, deterministic SQL canonicaliser (`ast1.canonicalise_address`, keyed on the registry's `address_format` / `canonicalisation_version`; a closed rule set implemented in the function) backs a `CHECK` **and** a `BEFORE INSERT OR UPDATE` trigger. Both **reject** a supplied value that is not already canonical — never rewrite it, never store a second spelling. A network with no supported rule cannot carry a token instrument. The unique index sees validated values only; the resolver uses the same SQL function; TypeScript is a parity-tested mirror; the sweep re-canonicalises every stored identity and flags collisions. Stated residual: no checksum primitive in the database |
| **F28(b)** application-suppliable timestamps in the elevated-evidence rule | LOW | **REMEDIATED** | 05 §1 rule 12, **§5** (`classification_evidence.evidence_global_seq`, `trg_evidence_server_order`, INV-21 wording, `classification_case.follows_event_*`), §5.1 trigger 7, §3; 01 INV-21, §4.7; 09; 12 AR-29. **Tests:** `T-ADR-06…10`, `T-LIN-26`, `T-SEC-10`, `T-DB-21` | Sequence-and-binding design: evidence gets a DB-assigned `evidence_global_seq` under the instrument lock (and the lineage gate `FOR SHARE`); the elevated rule compares it with the **review floor** (newest triggering `SECURITY` record or merge, by sequence); the case carries a database-computed `follows_event_*` binding that must match the recomputed floor at apply. Exact invariant stated (**INV-21**). Every `*_at_utc` on ledger, evidence and merge tables is trigger-filled and audit-only; no timestamp participates in any security ordering (scan test `T-ADR-10`) |
| **F28(c)** `lineage.synthetic` updatable | LOW | **REMEDIATED** | 05 §1 rule 16, **§3** (`lineage`, `trg_lineage_immutable`), §7.1 S10, §10; 01 §3.9, INV-23; 04 §2.1 (`lineage_synthetic`); 12 AR-30. **Tests:** `T-ADR-11/12`, `T-SCH-11/12` | `lineage` is insert-only: no `UPDATE`/`DELETE`/`TRUNCATE` grant to the runtime role and a trigger that refuses mutation for **every** role including the table owner (same model as `deployment_environment`). Real and synthetic histories cannot be converted by editing a lineage row |

## Deliberate choices and departures — for the re-reviewer

These go beyond, or fill gaps in, the review's wording. Each is fail-closed; none reopens a closed finding.

1. **Clause (b) is an over-approximation (allowed by the instruction).** It does not ask which side of the merge an instrument came from: a merge newer than X's record whose tree holds an earlier real `SECURITY` record narrows X. Cost: merging an unrelated clean tree into a security-holding tree also narrows already-reviewed members (availability only; 12 AR-24, `T-LIN-25`). A side-aware refinement is safety-neutral and left to a later version.
2. **Lineage gate (global singleton row lock).** The review asked that a lineage-wide writer re-derive its affected set. Re-derivation alone leaves a window for an instrument that gains its first record, or a wrapper link, mid-transaction. A `lineage_gate` row (`FOR SHARE` by classification/evidence writers, `FOR UPDATE` by real-`SECURITY` and merge apply) closes it deterministically and makes sequence order equal commit order. Trade-off: rare, governed classification writes serialise. Per-tree locks are permitted only with a recorded proof of the same property.
3. **The review floor includes merges.** v1.2's "evidence newer than the last `SECURITY` record" would let pre-merge evidence justify a post-merge review. The floor is the newest of {`SECURITY` record `global_seq`, security-joining `merge_global_seq`}.
4. **Merge arguments must be current roots**, and the apply trigger takes the locks and draws the sequence itself. This makes the affected set well defined; it tightens, it does not loosen.
5. **`lineage.synthetic` source stated.** v1.2 never said how the value is set. It is now fixed at asset creation (`lineage_synthetic` for `NONE_DECLARED`; the predecessor root's value otherwise) — one new request field in 04 §2.1. A wrongly flagged lineage can only fail closed (its instruments are rejected).
6. **Sweep distinguishes explained from unexplained.** A governed correction awaiting reclassification, and a lineage awaiting elevated review, are *expected*: reported, no hold. `SYSTEM` holds are for a control that failed (SQL/independent divergence, a live token on a review-required instrument, a missing governing change or propagation audit, unexplained drift, non-canonical/colliding identity, ledger-order break). Reason: a hold needs its own maker-checker release, unrelated to the review that actually clears the state, and mislabelling a governed correction as an integrity attack was called out by the instruction. Safety never depends on the sweep.
7. **Class-correction marker.** A small insert-only table records the governing change reference. It only selects a reason code and sweep behaviour; B12 denies with or without it, so a forged marker cannot create eligibility (verified by the sweep, `T-FPR-04`).
8. **IAM-02 verification precedes the gate/asset/instrument locks** in the two new apply paths (merge, correction), so no such lock is held across a remote call (`T-LOK-05`). The payload and preconditions are re-verified under the locks.
9. **Stated limits.** SQL cannot recompute the canonical-JSON fingerprint hash, so B12 compares stored values (the only governed writer of the cached value is the correction; raw tampering is the sweep's and TypeScript's, S4). The database cannot checksum an address.

## Full database lock order (05 §7A)

`G` governed change (apply transactions only) → `0` lineage gate (`SHARE` classification/evidence writers; `EXCLUSIVE` real `SECURITY` apply and merge apply) → `1` asset row (`EXCLUSIVE` asset-class writers; `SHARE` instrument insert) → `2` instrument rows **ascending `instrument_id`** (`FOR UPDATE` writers, `FOR SHARE` mint/consume) → `3` token rows (`FOR UPDATE` consume, `UPDATE` revoke) → `4` append-only inserts. **The accepted v1.2 order — instrument(s) first, then token(s) — is preserved without change**; levels G, 0 and 1 sit *above* it and nothing acquires them while holding level 2 or 3. Level tracking in the lock helpers raises `AS006` on an out-of-order request. The only out-of-order path remains the unsupported raw-SQL consume (fail-closed on deadlock).

**Cycle check** (05 §7A table, `T-LOK-01/02`) over: classification writer, hold, admission, custody, operational state, lineage merge, `ASSET_CLASS_CORRECTION`, token consume, token revoke, first instrument insert — plus evidence insert, real `SECURITY` apply and asset insert. Every arrow goes to a higher level or ascends within one; no cycle.

**Race folded in (review §13):** the FK on `instrument.asset_id` takes only `FOR KEY SHARE`, so it cannot order a class edit against the first instrument insert. `trg_instrument_asset_lock` takes the asset row `FOR SHARE`; every asset-class writer takes it `FOR UPDATE` before deciding "no instrument exists" or the correction preconditions. Exactly one order occurs; neither path relies on a later control to deny an inconsistent class/form.

## Disposition of earlier findings (as recorded by `04-review-r3.md`; this remediation does not change them)

| Finding | Status | Note |
|---|---|---|
| **F17** canonical identity | **External gate remains** (DCR-AST1-002 (7)) | AST-01 side complete; F28(a) hardens it. WLT-01 contract-identity field is external |
| **F18** SQL backstop at consumption | **Closed in blueprint** — preserved | Instrument-before-token order unchanged; consume trigger now also enforces B12 |
| **F19** deterministic lineage signals | **Closed in blueprint** — preserved | Immutability extended to `lineage.synthetic`; no regression |
| **F20** sibling narrowing | **Superseded by F27** | The derived conjunct is retained and extended with the merge clause |
| **F21** MYR | **External gate remains** (DCR-AST1-008(c), OQ-6) | Unchanged |
| **F22–F25** | **Closed in blueprint** — preserved | F22: class freeze race with first insert now locked (technical note, not a reopening). F25/B11 unchanged |
| F02, F05 | External gates remain (DCR-AST1-004; DCR-AST1-001(a)+(d)) | Unchanged |
| F03, F07, F09–F16 | Not regressed | F13/F14: change-kind map extended, never shortened |
| F01, F04, F06, F08 | Superseded (R2) | Follow F17, F18, F19/F20, F21/F22 |

## DCR status (none implemented, none executed)

| DCR | Change in v1.3 | Implemented? |
|---|---|---|
| 001 IAM-02 | Unchanged | **No** |
| 002 WLT-01/LED-01 | Unchanged; (7) contract-identity gap remains external | **No** |
| 003 CFG-01 | Unchanged | **No** |
| 004 Consumers | Unchanged | **No** |
| 005 Document store | Unchanged | **No** |
| **006 Role Matrix** | **Extended: merge-triggered elevated reaffirmation/review authority; `LINEAGE_MERGE` change kind whose apply also narrows and revokes** (with sibling reaffirmation, `ASSET_CLASS_CORRECTION` from v1.2) | **No** |
| 007 FND-01 | Unchanged | **No** |
| 008 Masters | Unchanged; (c) remains a gate | **No** |
| 009 Control layer | Unchanged (refers to v1.2 or later; v1.3 is the pack to register after acceptance) | **No** — `DOCUMENT_REGISTER`, `CURRENT_STATE`, `MODULE_STATUS` not touched |

**No external module is claimed changed.**

## OQ-8

**Still open; not decided; not resolved.** The review (§13) judged the current behaviour conservative, fail-closed, operational and non-blocking. v1.3 invents **no** draft-correction path (17 §3). The database canonical-address check validates identities but does not create a way to free one.

## task.json

Conductor-valid, `state: "IDLE"` — **not** `PLAN_READY`, implementation-ineligible. Inspected `aix-conductor/src/records.ts` `validateTaskManifest` (checks shape only: schema version, task id, state/risk enums, commit-hash format, non-negative integer round counts and severity counts, string arrays, ISO timestamps, `relevantRecordPaths` under `docs/03_implementation/tasks/AST-01/`, strings ≤ 300 characters, `ACCEPTED` ⇔ `acceptanceStatus`). `roundCounts` are counters the conductor increments on entering `REVIEWING` / `REMEDIATION_REQUIRED`, and the only legal exit from `IDLE` is `PLANNING` (`05-remediation-r2.md`), so **`roundCounts` and `state` are left unchanged** — no lifecycle transition is invented. Updated as *data* only: `title` (v1.3), `updatedAt`, `relevantRecordPaths` (adds `04-review-r3.md`, `05-remediation-r3.md`) and `findingsSummary`, reconciled with `04-review-r3.md`: open = the external gates **F02, F05, F17, F21** and the round-3 findings **F26, F27, F28** (remediated, awaiting re-review). F18, F19, F22–F25 are dispositioned *closed in blueprint* by the review, F20 is superseded by F27, and F01, F04, F06, F08 were superseded in R2, so none of these remains in `openFindingIds`; F01 and F08 continue through the F17/F21 gates. Counts by the severities in the reviews: **HIGH 3** (F02, F05, F17), **MEDIUM 3** (F21, F26, F27), **LOW 1** (F28), BLOCKER 0. The validator result is recorded in the final report and the commit. `carryForwardIds` stays empty (its conductor semantics are undefined in the source).

## Boundaries observed

Documentation only. No `platform/**`, migration, test code, IAM-02/WLT-01/LED-01/CFG-01 edit, master/register edit, or `main` merge. v1.0, v1.1 and v1.2 files untouched. Only `docs/02_modules/AST-01/**` and `docs/03_implementation/tasks/AST-01/**` changed; push only to `origin/module/AST-01`.

## Next

Separate-context re-review of v1.3, focused (per `04-review-r3.md` §17) on: the F20 area through F27 (merge sequencing, the two-clause predicate and its TypeScript/SQL parity, in-transaction narrowing, the elevated-evidence floor and binding); the `ASSET_CLASS_CORRECTION` path through F26 (B12, marker semantics, correction locking and token revocation, the first-insert race); F28(a)–(c); and the new lock order and cycle analysis (05 §7A). F17–F19 and F21–F25 are dispositioned; F03, F07 and F09–F16 are not regressed.
