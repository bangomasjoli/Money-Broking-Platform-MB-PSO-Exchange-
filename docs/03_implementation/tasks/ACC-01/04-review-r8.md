# 04 Review (round 8) — ACC-01: Account Structure blueprint pack v0.8

- **Task ID:** ACC-01 (planning task — blueprint pack, no implementation)
- **Reviewer:** independent architecture / compliance reviewer / claude-opus-5-5 / HIGH
- **Pack under review:** `docs/02_modules/ACC-01/blueprint/v0.8/` at `e30cf8d`. This is the remediation of `04-review-r7.md` (R7-F01 MEDIUM, R7-F02 INFO), after the procedural checkpoint `01a0153`.
- **Author of v0.1…v0.8:** blueprint planner / claude-sonnet-5 (v0.8 remediation session: claude-sonnet-5-5)
- **Independence:** **separate context.**
  - This review ran in a **new Claude Code session**. It carried no conversation from any author, remediation, review or checkpoint session.
  - Everything below was re-derived from:
    - the v0.8 text and the v0.7 → v0.8 diff;
    - `04-review-r7.md` (for the finding definitions only), `06-human-decision-r7.md` and `task.json`;
    - `docs/OPEN_FINDINGS.md`, the platform migrations and the IAM-02 routes;
    - the actual local `aix-conductor`;
    - a disposable PostgreSQL 17.10 scratch cluster (§19).
  - `05-remediation-r7.md` was **not** read or used as evidence of correctness.
  - The reviewer is the same model as the round-1…7 reviewers. It is a different model from the author.
- **Decision:** **REMEDIATE**
- **Implementation authorised:** **No.**
  - Nothing is accepted.
  - No `06-acceptance.md` exists or is created.
  - This review does not modify `task.json`.
  - `PLAN_READY` is not set.

## 1. Baseline verification (all passed)

| Check | Result |
|---|---|
| Worktree | `/Users/AimanRahimi/AIX-worktrees/acc-01`. On the case-insensitive volume this resolves to `/Users/AimanRahimi/aix-worktrees/acc-01`, the same worktree |
| Branch | `module/ACC-01` |
| HEAD | `e30cf8d` (= `origin/module/ACC-01`) |
| Working tree | Clean before this review |
| `main` / `origin/main` | Both `43f2f34`. Nothing is merged |
| History | `43f2f34` → `42316fe` (v0.1) → `2e26d13` → `8ff4e9d` (v0.2) → `b5c21bd` → `194aff0` (v0.3) → `3b3a3ee` → `af5d025` → `a865d63` (v0.4) → `c6957a0` → `038628a` → `826ab45` (v0.5) → `da3ed73` → `9c6f1b9` → `aa66084` (v0.6) → `45f2eed` → `39f58b1` → `0d7cfb0` (v0.7) → `b2764ac` → `01a0153` → `e30cf8d` (v0.8), exactly as expected |
| Diff `43f2f34..HEAD` | 166 files. Every one is under `docs/02_modules/ACC-01/**` or `docs/03_implementation/tasks/ACC-01/**`. There is no `platform/**`, migration, master or register change |
| `01a0153..e30cf8d` | Adds `blueprint/v0.8/*` and `05-remediation-r7.md`, and modifies `task.json`. Nothing else |
| Earlier packs | `git diff <authoring commit> HEAD` is **empty** for each of v0.1 (`42316fe`) … v0.7 (`0d7cfb0`). Every historical review and human-decision record (`04-review*.md`, `06-human-decision-r3…r7.md`) is also unchanged since its own commit. All remain unchanged historical evidence |
| Test ids | T-001…T-356: 356 rows, contiguous, no duplicates |
| Environment branching | The v0.7 → v0.8 diff adds **0** lines matching `PRODUCTION`/`DEVELOPMENT`/`UAT`/`DEMO`/`environment ==`/`NODE_ENV` |

## 2. Sources reviewed

**Decisions** — treated as approved and binding, and **not reinterpreted**:

- ACC-R2-HD-01…08
- ACC-R3-HD-01…03
- ACC-R4-HD-01…02
- ACC-R5-HD-01

`06-human-decision-r7.md` is procedural only and adds no design decision.

**v0.8 files:**

- 05, read in full.
- 02 §2 (A1–A5), §7.1, §7.4 item 3 and §7.7.
- 01: ACC-REQ-059, ACC-REQ-060 and the v0.7 → v0.8 diff.
- 04 §2.1.1 (the `seal_closure` and `abort_closure` rows).
- 06 §4 and §6.
- 10 §21–§22 (T-309…T-356).
- 13 R-6 and R-9.
- 17: §4, and the v0.7 → v0.8 diff.
- The README.
- Whole-pack sweeps for the R7 terms (§18).

**Source inspected read-only:**

| Area | Fact verified |
|---|---|
| IAM-02 `platform/services/iam2/src/routes` | `approvals.ts`, `bootstrap.ts`, `internal.ts`, `roles.ts`. **0** `GET` routes. DCR-ACC-IAM-08 remains unmet |
| `docs/OPEN_FINDINGS.md` (unchanged from `main`) | `IAM2-FIND-002` (HIGH) **OPEN**; `FND-FIND-001` (HIGH) **OPEN** |
| Platform migrations | Runtime roles are **grantees**, not owners (e.g. `role_clt1_runtime`, migrations 020…032). This is relevant to R8-F04.3 |
| PostgreSQL baseline | The local runtime is **PostgreSQL 17.10** (`miniforge3/envs/aixpg`). It is also the version every IMP-02/MIG-004 acceptance record reproduces against |
| `aix-conductor` `00a7bde` | Clean and not modified (§3) |

## 3. Conductor adjudication

This was verified by reading `src/state.ts` and `config/local.config.json`, and by executing `dist/records.js` `validateTaskManifest` in memory against the HEAD `task.json`. No conductor state was written, and the conductor working tree is still clean.

| Item | Result |
|---|---|
| `task.json` at HEAD | `state = PLANNING`; `roundCounts.planning = 8`; `escalation = 0`; other counters 0; `acceptanceStatus = NOT_ACCEPTED`. `validateTaskManifest` → `{"ok":true,"errors":[]}` |
| `PLAN_READY` | Not set |
| `maxPlanningRounds` | **3** (`config/local.config.json` L82, unchanged) |
| Legality of `planning = 8` | **A legal human-authorised over-limit entry**, so it is **not rejected** for exceeding the limit. Path: `PLANNING(7)` → `HUMAN_DECISION_REQUIRED` at `01a0153`. That step is ungated. `HUMAN_DECISION_REQUIRED` is not a `ROUND_ON_ENTER` key, so no counter is consumed. Then `resolve_human_decision` (`approvedBy` AimanRahimi) → `PLANNING(8)` at `e30cf8d`. `transitionTask` sets `humanAuthorised = (task.state === 'HUMAN_DECISION_REQUIRED')`, skips the over-limit redirect and keeps the real count |
| Transitions | `PLANNING` → [`PLAN_READY`, `HUMAN_DECISION_REQUIRED`, `FAILED`]. `PLANNING → PLANNING` is illegal. `HUMAN_DECISION_REQUIRED → PLANNING` is gated by `resolve_human_decision` |
| `06-human-decision-r7.md` | Consistent with the above. It records the approval verbatim ("approve ACC R7 procedural continuation"), preserves every prior decision and resets no counter |
| Findings transcription | `openFindingIds` = RF-01, RF-02, RF-05, RF-09, R7-F01. Counts are HIGH 1, MEDIUM 3, LOW 1. This transcribes `04-review-r7.md` §20 exactly (R7-F02 is INFO and not counted) |
| Runtime record | `state/tasks/` holds only `IMP02-MA-HARDEN-001.json` and `PV-20260919T162254Z-001.json`. There is no ACC-01 record, which is consistent with ACC-R4-HD-02 |

## 4. Verdict

**REMEDIATE.**

v0.8 fixes R7-F01 and R7-F02 **as they were scoped**.

- **Reverse direction.** The reverse direction of the bijection is now enforced at the account `UPDATE` itself. It is bound to this target, this cause and this transaction. A deferred history-side entry point backs it up, and that entry point fires with zero recovery rows.
- **"Applied in this transaction".** This now has one sound, database-owned, savepoint-stable meaning (`applied_xact_id = pg_current_xact_id()`, verified on PostgreSQL 17.10, §19). A database status guard makes an applied request terminal and impossible to re-stamp.
- **The stored payload is the authority.** It is immutable from `INSERT`, typed and read by the database. Every approval fact on a recovery row is stamped from it and compared with the live row.
- **Statement orders.** The abort and seal orders are normative and implementable. `version` has one owner on a status transition.

**The pack is still not acceptable**, for one MEDIUM finding (R8-F01) and two LOW findings (R8-F02, R8-F03), plus INFO precision (R8-F04).

- **R8-F01 (MEDIUM).** The database-level stale-approval refusal that R7-F01(c) established compares the approved `version`, `closure_cycle` and `closure_seal_version` with the **live account row**. However, `version`, `closure_cycle`, `closure_seal_version`, `closure_sealed_at_version` and the closure pointers are in `role_acc1_runtime`'s `UPDATE` grant. The triggers that own them fire only `BEFORE UPDATE OF status`, so no trigger guards a **non-status** `UPDATE` of them. A preceding `UPDATE … SET version = <approved>` makes a stale approval pass `trg_acc1_recovery_bind` (6), S3 and R-9. The same class of write rewinds `closure_seal_version`, contradicting 05 §2.1 and invariant 06 §6.9. This was reproduced on PostgreSQL 17.10 (§19, P7).
  - This is the same threat model (raw runtime writes, T-298 / §22 preamble), the same class and the same severity as R6-F01 and R7-F01.
  - It is a **new** root cause. It is not a defect of the R7-F01 corrections themselves.
- **R8-F02 (LOW).** The `closure_seal_pin` `INSERT` is unguarded.
  - A pin can commit without its seal, through a savepoint-swallowed seal failure or a raw insert. It then permanently occupies `UNIQUE (target_id, closure_seal_version)` and blocks every later seal of that target.
  - The pin's approval facts (`target_version_approved`, `closure_cycle`, initiation) are caller-written and compared only with the live row, never with the stored seal payload. This is the R7-F01(c) class on the seal side.
- **R8-F03 (LOW).** The new request `INSERT` rule contradicts the maker-only initiation text.
  - 02 §7.1 step 3 writes the row `status = applied`.
  - 05 §2.4 `NOT NULL` rules for `maker_only` rows are not scoped to `applied`.
  - Implemented literally, **every closure initiation is refused**. This fails closed.

**No new human design decision is needed.** Every correction is local to 05/02/10 and sits within ACC-R3-HD-01, ACC-R3-HD-02, ACC-R4-HD-01 and ACC-R5-HD-01 as written.

## 5. R7-F01 / R7-F02 disposition

| Finding | Sev | Disposition | Basis (v0.8 text) |
|---|---|---|---|
| **R7-F01(a)** Reverse direction with zero recovery rows | MEDIUM (part) | **CLOSED IN BLUEPRINT** | 05 §5 `trg_acc1_status_transition` (b): an immediate, target-, cause- and transaction-bound recovery row, matched on status, version, cycle, seal version and family. `trg_acc1_history_abort_scope` (E2) fires on any `closure_abort` history row. `trg_acc1_abort_apply_complete` (E3). `trg_acc1_family_abort_guard`. `trg_acc1_closure_barrier` is now "THIS row, THIS cause, THIS transaction". All nine attacks have a named refusing mechanism (§11) |
| **R7-F01(b)** "Applied in this transaction" | MEDIUM (part) | **CLOSED IN BLUEPRINT** | 05 §2.4 `applied_xact_id xid8`; §2.4.2 `trg_acc1_change_request_status`; §5.0 (one meaning, `xmin` withdrawn); the `created_xact_id` stamps on recovery, history and pin. Verified on PostgreSQL 17.10 (§9, §19) |
| **R7-F01(c)** Stored payload as authority | MEDIUM (part) | **CLOSED IN BLUEPRINT** | 05 §2.4.1 (exact typed shape); §2.4.2 (immutability); §2.8 (one stamping model; the caller names only five columns); `trg_acc1_recovery_bind` (3)(4)(6)(7); §5.3 S3 (the payload is one side of every comparison); 13 R-9. **Residual:** the comparison's other side, the live row's counters, is not protected against non-status writes. That is a **new** root cause, raised as **R8-F01**. It is not a defect of this correction |
| **R7-F01** overall | MEDIUM | **CLOSED IN BLUEPRINT** (see R8-F01 for the new, separate counter-integrity gap) | — |
| **R7-F02.1** Generic A4 order | INFO | **CLOSED IN BLUEPRINT** | 02 §2 A4 now restricts the generic order to ordinary change types and defers to 05 §5.1 / §5.2 |
| **R7-F02.2** Seal statement order | INFO | **CLOSED IN BLUEPRINT** as an order (05 §5.2; 02 §7.4 item 3 points to it). The order is correct, but the pin row it inserts is unguarded → **R8-F02**, a new finding |
| **R7-F02.3** `version` ownership | INFO | **CLOSED IN BLUEPRINT for status transitions** (05 §2.1 L48, §5 `trg_acc1_status_transition` (2), §5.1 step 6, §5.2 step 8, rule 5r; 02 §2 A4, §7.7 step 6; 01 ACC-REQ-060; T-346). **Non-status** writes of `version` are unowned → R8-F01 |
| **R7-F02.4** Cross-reference | INFO | **CLOSED IN BLUEPRINT** | 05 §2.8 `evidence_ref` and 17 DCR-ACC-IAM-08 now cite only 02 §7.7 1b, 04 `abort_closure` and the DCR consumer rule, and state that "file 01 §7.3 … is no longer cited for it". Every remaining "01 §7.3" reference (02 §7.7 1a/1b opening, 07 §4, 17 OQ-07, 12) concerns the governed abort in general, not the rejection cycle/initiation binding |

## 6. Regression check

| Item | Result |
|---|---|
| **ACC-R3-HD-01** (family semantics) | **Holds.** None of these is changed in effect: `trg_acc1_master_default_invariant`; the default-in-closure `CHECK`; `trg_acc1_default_protected` (now cause- and transaction-bound); `trg_acc1_closure_family`; master-directed children closing only inside the master's completion; seal child-then-master (05 §5.2, last paragraph) |
| Every non-`closed` master has exactly one non-`closed` default | **Holds** (deferred invariant; `UNIQUE … WHERE is_default` not status-filtered). No ACTIVE master with a CLOSED default is representable |
| Family abort atomic | **Holds.** The master, the default and every master-directed child return in one transaction, proved four-way at commit (§13). A default-only return is refused (T-322) |
| `independent_preserved` never returned | **Holds.** The role is outside the `family_role` `CHECK`. Bind (6) refuses it. It is in none of PAY/FAM/REC/HIS (T-351, T-287) |
| Default never independently closes or reopens | **Holds** (`trg_acc1_default_protected`; S2 requires the master in every master-family set) |
| **ACC-R3-HD-02** (maker-only initiation) | The decision is **unchanged**. Its implementability is broken by an internal inconsistency new in v0.8 (fail-closed) → **R8-F03** |
| **ACC-R3-HD-03** (authoritative dependency evidence) | **Holds.** No configuration value satisfies a `DEP-*` (05 §8). `checker_rejected_seal` is still **hard-unavailable** (`DEP-IAM-SEAL-REJECTION-EVIDENCE`), and bind (7) claims only the `rejection_*` **shape** (T-337: "no test claims the database attests an IAM-02 outcome") |
| **ACC-R4-HD-01** (pre-seal rejection/withdrawal recovery) | **Holds** (05 §2.8 reason codes and `CHECK`s; bind (7) for `closure_initiation_withdrawn`) |
| **ACC-R5-HD-01** (target-scoped master-family recovery) | **Holds.** The target-scoped `CHECK` on the stamped `abort_target_from_status` is unchanged. S5 restates it across rows. Returned children may be `closure_sealed` while the master is `closing` (T-323). The converse is still structural (T-342) |
| Readiness pinning / no latest-readiness substitution | **Holds as specified** (`trg_acc1_seal` "latest `readiness_seq` for that target + attester + cycle"; `trg_acc1_readiness_insert`). Its **database-level** strength depends on `closure_cycle` and `close_change_request_id` being unforgeable, which R8-F01 shows they are not against a non-status write |
| Immutable pin-readiness set | **Holds and is strengthened.** `trg_acc1_pin_readiness_window` now uses `created_xact_id` plus the legal-sealing-state clause (T-325, T-343) |
| Renewable post-seal attestation | **Holds.** `closure_attestation` stays appendable (5o) and the family hash binds immutable seal facts only |
| Pinned strong attester identities; non-empty set | **Holds** (`binding_ok` identity equality; `pinned_required_attester_count >= 1`; relational equality with the stored seal payload) |
| Config changes not retroactive | **Holds** (pinned set; R-6 per pinned attester; T-327) |
| CFG-01 sole environment-availability authority; no environment-name branching | **Holds** (0 added lines) |
| R3-F04 actor provenance, R3-F07 `clock_timestamp()`, R2-F03/F05…F08, RF-04/06/08/10/11, default not a fallback, composite ownership | **Not regressed** (the v0.8 diff does not touch them) |

## 7. New findings

Severity uses HIGH / MEDIUM / LOW / INFO. "Blocking" means blocking **acceptance of the pack**.

### ACC-01-R8-F01 — MEDIUM (blocking) — `version` and the closure counters are writable outside the transitions that own them, so the database-level stale-approval refusal and counter monotonicity do not hold against raw runtime writes

**Threat model.** This is the model R6-F01, R7-F01 and v0.8 itself adopt (10 §22 preamble: raw-DB adversarial tests "against `role_acc1_runtime` with application validation bypassed").

**Evidence:**

- **The runtime grant includes the counters.** 05 §6 grants `role_acc1_runtime` `UPDATE (… status, close_change_request_id, closure_family_id, closure_seal_pin_id, closure_barrier, closure_cycle, closure_sealed_at_utc, closure_seal_version, closure_sealed_at_version, closed_at_utc, version, updated_at_utc)` on `master_account` and `subaccount`.
- **The owning triggers fire only when `status` is named.**
  - `trg_acc1_status_transition` (owner of `version` and `closure_cycle`) is `BEFORE UPDATE OF status`.
  - `trg_acc1_seal` (owner of `closure_seal_version`, `closure_sealed_at_version`, `closure_sealed_at_utc` and pin setting) is also `BEFORE UPDATE OF status`.
  - Neither fires for a statement that does not name `status`.
- **No other trigger covers them.**
  - `trg_acc1_closure_barrier` fires on `closure_seal_pin_id` and `closure_family_id`. Its rule covers only a barrier `true → false` and the **clearing** of those pointers. It does not cover re-pointing a pin between non-null values, or setting `closure_family_id` outside entry into `closing`.
  - `trg_acc1_ma_immutable` / `trg_acc1_sa_immutable` cover identity columns only.
  - No trigger constrains `version`, `closure_cycle`, `closure_seal_version`, `closure_sealed_at_version` or `close_change_request_id` on a non-status `UPDATE`.
- **Reproduced on PostgreSQL 17.10** (§19, P7). With a status-only owner trigger and `version`/`closure_seal_version` in the column grant, `role_acc1_runtime` runs `UPDATE acct SET version = 10, closure_seal_version = 1` on a row at `version = 11`, `closure_seal_version = 2`. **It succeeds.**

**Attacks that commit as specified:**

1. **Stale approval cured by rewinding the live row (defeats T-316 / T-335 at the DB level).**
   - The payload has `approved_version = 10`. A restriction moves the member to 11.
   - The defective path runs `UPDATE subaccount SET version = 10 WHERE …`, naming no `status`.
   - The abort then passes bind (6), because the payload's 10 equals the live 10. `trg_acc1_status_transition` (b) passes (`target_version_approved = OLD.version = 10`). S3 passes (`version_before = 10`) and R-9 finds nothing.
   - This contradicts 05 §2.8 L308 ("a caller cannot cure a stale approval"), 02 §7.7 item 2 ("refused twice — by A4 and structurally") and T-335 ("no code path lets a stale request be repaired").
   - The same write also defeats RF-08: `version` is the consumer evidence value. A realistic defective path is a lost-update "save entity" from a stale snapshot, which silently rewinds a restriction's bump.
2. **`closure_seal_version` decrement** (contradicts 05 §2.1 L44 "monotonic, never reset or decremented", 06 §6.9 and rule 5d). Old-seal attestations become "at the current seal version" again. R-9's "never lower than any attestation's `seal_version_observed`" detects this only after the fact.
3. **`closure_cycle` / `close_change_request_id` rewind.** Readiness rows of an aborted cycle and initiation become "latest for the current cycle" for `trg_acc1_seal`. That contradicts "aborted-cycle evidence can never match a later cycle" (05 §2.1 L43, 01 L318) at the database level.
4. **`closure_seal_pin_id` re-pointing** between non-null pins on a sealed row. This changes which pinned attester set completion reads.

**Why MEDIUM:**

- This is the same class, standard and threat model as R6-F01 and R7-F01 (MEDIUM): database guarantees the pack states and tests are not provided by the specified triggers and grants.
- The direct safety impact is bounded, as before:
  - A4 re-checks every binding under lock.
  - A compromised runtime role could forge a fresh request anyway (RF-01).
  - Attack 1 still returns only ACC-01's own recomputed projection.

**Affected sections:**

- 05: §2.1 (L43, L44, L48), §2.2, §5 (`trg_acc1_status_transition`, `trg_acc1_seal`, `trg_acc1_closure_barrier`, `trg_acc1_restriction_version`), §6 (grants), §7 rules 5, 5d, 5r
- 06 §6.9
- 02 §7.7 item 2
- 10: T-316, T-335, T-346
- 13 R-9

**Required correction:**

1. Add an **immediate** guard, for example `trg_acc1_counter_guard` (`BEFORE UPDATE` on both tables, every `UPDATE`), with these rules:
   - **`version` is database-owned on every `UPDATE`.** `NEW.version := OLD.version + 1` whenever the row changes. Any caller value is overwritten, so the status transition, the restriction bump and a profile edit each give exactly one increment.
   - `closure_cycle`, `closure_seal_version`, `closure_sealed_at_version`, `closure_sealed_at_utc` and `close_change_request_id` may change **only** inside their owning status transition. Setting or re-pointing `closure_seal_pin_id` / `closure_family_id` is allowed only at seal and at entry into `closing`.
   - Any other change raises.
2. Alternatively, remove these columns from the runtime `UPDATE` grant. Assignments made by a `BEFORE` trigger need no column privilege. Then make `trg_acc1_restriction_version` bump through the owner, for example with `SECURITY DEFINER` or by "touching" the row.
3. Either way, state which mechanism is normative, and keep the single-owner rule of R7-F02.3.
4. Define the semantics of an `UPDATE` that names `status` without changing it (no transition; `version` still owned by the guard).
5. Add raw-DB tests:
   - a non-status `SET version = <older>` is refused or overwritten;
   - a `closure_seal_version` / `closure_cycle` / `close_change_request_id` decrement or re-point is refused;
   - the attack 1 sequence then fails at bind (6).

**Implementation impact:** phase 1 (one trigger, or a grant change plus a `SECURITY DEFINER` adjustment); phase 5 (the profile and restriction paths stop setting `version`). No API or state-machine change.

**Human decision required: NO.**

### ACC-01-R8-F02 — LOW (blocking with R8-F01) — The `closure_seal_pin` insert is unguarded: an orphan pin can permanently block sealing, and the pin's approval facts are self-proving

**Evidence:**

- The runtime role has `INSERT` on `closure_seal_pin` (05 §6). The only trigger on it is `trg_acc1_pin_stamp`, which stamps `created_xact_id`. No legality check exists at insert:
  - the target is not required to be locked and `closing`;
  - `closure_seal_version` is not required to be current + 1;
  - the seal request is not required to be an applied `seal_closure` for this target.
- No deferred check requires a pin created in a transaction to be that transaction's committed seal pin (`closure_seal_pin_id` of a `closure_sealed` target).
- `UNIQUE (target_id, closure_seal_version)` (05 §2.9 L341) and "abort never resets `closure_seal_version`" mean the next seal of the target always needs `(target, current + 1)`.

**Attack:**

1. In the §5.2 order, the step-8 seal `UPDATE` fails inside a `SAVEPOINT`, for example in the ORM/retry helper that v0.8 §5.0 and T-344 explicitly treat as legitimate. The helper rolls back to the savepoint and commits.
2. Alternatively, a raw runtime `INSERT` does the same.
3. The pin (and its pin-readiness rows) commit **without** a seal.
4. Every later seal attempt for that target collides with the orphan on `UNIQUE (target_id, closure_seal_version)`, **permanently**, across aborts and new cycles.

The prompt's premise "pin exists but status transition fails ⇒ rollback removes pin/readiness" holds only for whole-transaction rollback. It fails closed for safety, but makes the account un-sealable and therefore un-closable (the RF-02 closability class).

**Seal-side self-proof** (the R7-F01(c) class):

- `trg_acc1_seal` compares the pin's `target_version_approved`, `closure_cycle` and `closure_sealed_at_version` with the **live** row only.
- These pin columns are caller-written.
- The stored seal payload pins the approved target `version`, `closure_cycle` and initiation id (04 §2.1.1 `seal_closure`). Only its attester list and `required_attester_set_hash` are compared.
- 05 §2.9 L344 nevertheless describes the column as "the target `version` the checker approved".
- Impact is low, because sealing is the restrictive direction and readiness ids bind the cycle. The text overstates what the database proves.

**Affected sections:** 05 §2.9, §5 (`trg_acc1_pin_stamp`, `trg_acc1_seal`), §5.0 ("Seal" bullet), §5.2; 04 §2.1.1; 10 T-352, T-344.

**Required correction:**

1. Make the pin insert legal only in its seal. At `INSERT`:
   - lock the target;
   - require `closing`, `closure_seal_pin_id IS NULL` and `closure_seal_version = current + 1`;
   - require `seal_change_request_id` to be an applied `seal_closure` for this target with `applied_xact_id = pg_current_xact_id()`.
2. **Stamp** `target_version_approved`, `closure_cycle`, `closure_change_request_id`, `closure_family_id` and (master) `family_set_hash` from that stored payload, then compare them with the live row. This is the abort's one stamping model.
3. Add a deferred check that every pin created in the transaction is, at commit, the `closure_seal_pin_id` of its target in `closure_sealed` at that seal version.
4. Add tests:
   - a savepoint-swallowed seal failure followed by `COMMIT` is refused;
   - a raw pin for a future seal version is refused;
   - a stale seal payload version is refused by the database.

**Implementation impact:** phase 1 (the pin-insert trigger plus one deferred check); phase 5 (the seal apply stops supplying stamped pin values). No API change.

**Human decision required: NO.**

### ACC-01-R8-F03 — LOW (blocking with R8-F01) — Maker-only initiation contradicts the new request `INSERT` rule

**Evidence:**

- v0.8 05 §2.4.2 requires every request row to be **`INSERT`ed `status = 'requested'` with every apply-owned field NULL**. The apply-owned fields include `entitlement_evidence_ref`, `actor_assertion_authority` and `sec_audit_ref`.
- 05 §2.4.2 L197 says a `maker_only` initiation is `INSERT`ed `requested` and then `UPDATE`d `applied`. But:
  - **02 §7.1 step 3** (unchanged from v0.7) still says the row "is written with … the attested entitlement evidence reference, and `status = applied`". That is an `INSERT` the guard refuses.
  - **05 §2.4** L127, L142 and L143 state `entitlement_evidence_ref` "NOT NULL … for every `maker_only` row" and `actor_assertion_authority` "NOT NULL when … `approval_mode = 'maker_only'`". These are not scoped to `status = 'applied'`. Implemented as row `CHECK`s, which are immediate, they refuse the `requested` `INSERT` that §2.4.2 mandates.
- Implemented literally, **every closure initiation is refused**. This is fail-closed, but the ACC-R3-HD-02 route becomes unimplementable, and no test exercises initiation under the new guard.

**Affected sections:** 05 §2.4 (L127, L142, L143), §2.4.2; 02 §7.1 step 3; 10 §18.6 (T-240, T-242).

**Required correction:**

1. Scope the `maker_only` `NOT NULL` rules to `status = 'applied'`.
2. Change 02 §7.1 step 3 to "`INSERT` `requested`, then `UPDATE` `requested → applied` in the same transaction", matching 05 §2.4.2.
3. Add a test showing a maker-only initiation commits under `trg_acc1_change_request_status` and acquires `applied_xact_id`.

**Implementation impact:** documentation and `CHECK` wording only.

**Human decision required: NO** (ACC-R3-HD-02 is unchanged).

### ACC-01-R8-F04 — INFO — Precision

1. **Deferred-proof timing.** 05 §5.3 and the "Immediate vs. deferred" paragraph say the proof is "evaluated at commit, once per distinct abort request X" and "evaluated once at commit". PostgreSQL promises neither.
   - Each queued row event fires separately. The duplicates are harmless because the proof is read-only.
   - Any role may issue `SET CONSTRAINTS … IMMEDIATE`, which fires queued events at that point and does **not** re-fire them at commit (§19, P6).
   - The design stays sound because every later write to a proven fact queues a fresh event or is refused immediately. **The account counters are the exception, which is R8-F01.**
   - State that the proof is correct whenever it fires, rather than "once at commit". Optionally, add a source guard that the apply paths never issue `SET CONSTRAINTS`.
2. **`xid8` portability.** 05 §5.0 should state the following:
   - `applied_xact_id` / `created_xact_id` are **same-transaction correlation only**.
   - After a logical dump/restore or a logical-replication migration to a new cluster, old values can recur as future `pg_current_xact_id()` values. `pg_upgrade` preserves the epoch.
   - No decision may rely on long-term `xid8` uniqueness. Reconciliation treats the values as audit data only.
   - Every same-transaction predicate in the pack is paired with a live-state binding (version, cycle, seal version, NULL pin), so a recurrence cannot ground a new action. That pairing is sound once R8-F01 makes the counters monotonic.
3. **Trigger authority depends on non-ownership.**
   - Every "regardless of grants" claim assumes `role_acc1_runtime` does **not** own the `acc1` objects. An owner can `ALTER TABLE … DISABLE TRIGGER`.
   - It also assumes the role cannot set `session_replication_role`.
   - The platform precedent is grantee-only, but T-092's wording ("the table owner role used by the runtime") is ambiguous. State non-ownership normatively in 05 §1.
4. **Terminal apply-owned fields.**
   - Once a request is `applied`, its `sec_audit_ref` / `result_ref` can never be written again.
   - For `abort_closure`, the Critical audit is written at 05 §5.1 step 8, after step 4. The request's `sec_audit_ref` therefore has to be a reference pre-allocated before step 4, as the history rows already need one before step 6.
   - State this, and require that every apply-owned field is written in the single `requested → applied` `UPDATE`.
5. **Minor.**
   - `trg_acc1_change_request_immutable` omits the internal `id` column.
   - `updated_at_utc` remains writable on terminal rows. This is harmless but worth stating.

**Human decision required: NO.**

**Totals (new):** MEDIUM 1, LOW 2, INFO 1.

## 8. Request-status-guard adjudication (`trg_acc1_change_request_status` + `trg_acc1_change_request_immutable`)

| Attack | Result | Mechanism |
|---|---|---|
| `requested → applied` with a payload mutation in the same statement | **Refused** | `trg_acc1_change_request_immutable` fires on every `UPDATE` and compares `payload`, `payload_hash`, targets and other fields with `OLD`. The runtime role is also refused by the column grant. Reproduced (§19, P4) |
| `requested → applied` with a caller-supplied `applied_xact_id` | **Refused / overwritten.** The runtime role cannot name the column (permission error, §19 P3). An owner's value is overwritten by `NEW.applied_xact_id := pg_current_xact_id()` | §2.4.2; T-333 |
| Caller-supplied `applied_at_utc` | **Overwritten** with `clock_timestamp()` (§19 P3b) | §2.4.2 |
| `UPDATE` of an applied row naming one apply-owned column with the same value | **Refused.** A column-list trigger fires when the column is **named**, even with an unchanged value (§19 P2). `OLD.status <> 'requested'` ⇒ `ACC1_CHANGE_REQUEST_STATE_INVALID` | §2.4.2; T-332 |
| `applied → applied` / `→ requested` / `→ cancelled`; `cancelled`/`expired → *` | **Refused** (terminal) | T-333 |
| An `UPDATE` changing a target column without naming `payload` | **Refused** (the immutable trigger covers `target_*`, `client_id`, `change_type`, `approval_mode`, `requested_by`, `idempotency_key`, `environment`, `expires_at_utc`) | §2.4.2 |
| Generic whole-row `UPDATE` | **Refused** if any immutable column differs. Otherwise the status guard governs the status fields | both triggers |
| Cancellation / expiry | **Still possible.** `requested → cancelled | expired` names `status`, the guard allows it, and `applied_*` is forced NULL. The column list does not prevent them | §2.4.2; T-333 |
| Interaction on the **same** `UPDATE` | Both are `BEFORE ROW`. PostgreSQL runs them in name order (`…_immutable` before `…_status`). Neither writes a column the other checks, so the order is immaterial | — |
| Maker-only initiation under the guard | **Inconsistent text → R8-F03** | — |

**Adjudication: CLOSED IN BLUEPRINT** (R8-F03 aside).

## 9. `applied_xact_id` adjudication

| Property | Result |
|---|---|
| Caller cannot control `applied_xact_id` / `created_xact_id` | **Holds.** The value is assigned only in triggers, and `applied_xact_id` is absent from the grant. The other three tables are append-only with a `BEFORE INSERT` stamp |
| `requested → applied` exactly once; `applied → applied` refused; no re-stamp; terminal states stay terminal | **Holds** (§8) |
| An old applied request cannot qualify in another transaction | **Holds.** Untouched: `applied_xact_id ≠ current` (T-311). Re-written: refused by the guard (T-332). Concurrent: invisible or different (T-311) |
| Savepoints | **Holds.** Reproduced on 17.10: `applied_xact_id` = the top-level `pg_current_xact_id()` after `SAVEPOINT … RELEASE`, with an unrelated `ROLLBACK TO` (§19 P1) |
| No remaining `xmin` rule | **Holds.** Every `xmin` occurrence in 01/05/10/11/12/README states it is never used or never compared (whole-pack sweep) |
| Deferred evaluation | The predicate is the same value at statement time and at commit (same top-level transaction) |

**Adjudication: CLOSED IN BLUEPRINT.** The residual portability wording is R8-F04.2.

## 10. Payload shape, immutability and hash adjudication

**Shape (05 §2.4.1).**

- Top-level: `abort_target_type`, `abort_target_id` (verified equal to the request's own immutable target column), `reason_code`, `closure_family_id`, `evidence_ref` / `evidence_owner_target_id` and `rejection_*`.
- Per member: `target_type`, `target_id`, `approved_version`, `closure_cycle`, `closure_seal_version` (integer ≥ 0, never null, 0 ⇔ never sealed) and `family_role`.

The shape is typed and unambiguous enough for database validation.

| Attack | Refusal |
|---|---|
| Duplicate member id / same id with two versions | Bind (3): `NEW.target_id` must appear **exactly once**, never "first matching element". Because PAY = REC (S2), every PAY element receives that check |
| Missing master | S2: PAY ≠ FAM (exactly one `master` member, deferred `trg_acc1_family_membership`); S5 needs exactly one target row |
| Wrong `target_type` | Bind stamps it from the payload and reads the live row. The `mac_`/`sac_` id `CHECK`s make the table unambiguous. A mismatch finds no row (implicit, fail-closed); stating it explicitly would be a nicety |
| Unknown `family_role` | Bind (6) compares it with the authoritative membership, and the column `CHECK` refuses it too |
| String where an integer is expected | Bind (3): "ill-typed field ⇒ `ACC1_CLOSURE_ABORT_INVALID`" (the implementation must test `jsonb_typeof`, not cast) |
| Negative cycle | The §2.4.1 domain is ≥ 0. It would also differ from the live value (bind (6)) |
| `closure_seal_version` ambiguity | Resolved normatively (§2.4.1). T-347 |
| Extra unknown member | S2: PAY ≠ FAM, or bind (3) for a row not in the payload (T-338) |

**Immutability.** `payload`, `payload_hash`, `change_type`, the targets, `client_id`, `approval_mode`, `requested_by`, `environment`, `expires_at_utc`, `idempotency_key` and `created_at_utc` are refused on any `UPDATE` by an unconditional `BEFORE UPDATE` trigger. The column grant is a second layer, and the two together give the claimed immutability. There is no "approve A, apply B".

**Hash honesty.** 05 §2.4 L132 states the database never recomputes `payload_hash` and treats it as stored evidence only. No trigger uses `payload_hash` as proof of the payload's contents. A1 recomputes the hash in the application. The IAM-02 binding of the approval to that hash is stated as the external maker-checker contract (§2.4.1 and RF-01). The one hash the database compares, `required_attester_set_hash`, is declared **string-equality evidence** beside the normative relational equality. **There is no self-proving hash.**

**Adjudication: CLOSED IN BLUEPRINT.**

## 11. Reverse-bijection adjudication (closure_abort ACCOUNT TRANSITION ⇔ `closure_recovery` row)

The match is on target, cause, transaction, pre-state, post-state, version, cycle, seal version and family/role:

- `trg_acc1_status_transition` (b) at the `UPDATE`;
- S3/S4 at commit;
- bind (4)(6) for the role.

| # | Attack | Refusing mechanism |
|---|---|---|
| 1 | Independent `closing` target exits under `closure_abort` with zero recovery rows | **Immediate:** `trg_acc1_status_transition` (b) finds no row ⇒ `ACC1_CLOSURE_RECOVERY_INTEGRITY` (T-309). E2 is the commit backstop |
| 2 | Raw `account_status_history` `closure_abort` row, no recovery row | **At commit:** E2 (`trg_acc1_history_abort_scope`) → S2 `HIS ≠ REC`; S4 (the live row did not transition) (T-330). With no applied request, S1 fails |
| 3 | Recovery row with no status transition | **At commit:** E1 → S2 `REC ≠ HIS`; S4 (T-310, T-340) |
| 4 | Two recovery rows for one transition | **Immediate:** (b) requires **exactly one** row. **At commit:** S2 "exactly once in REC". A row inserted after the `UPDATE` is stamped with an operational `from_status` and fails the `CHECK` |
| 5 | Two history rows for one recovery | **At commit:** S2 "exactly once in HIS" (E2 fires for each) |
| 6 | Recovery and history under different causes | **Immediate:** (b) requires `change_request_id = cause_ref`. **At commit:** S2 for both X and Y |
| 7 | Same cause, different target | **Immediate:** (b) is target-bound (T-329). **At commit:** S2 |
| 8 | One row from a prior transaction | Bind (2) / (b) `created_xact_id = current`; HIS is filtered by `created_xact_id` (T-331) |
| 9 | Correct target and cause, mismatched version | (b) `target_version_approved = OLD.version`; bind (6) payload version = live; S3 `version_before = target_version_approved = approved_version`, `version_after = +1`. **Holds against a caller-supplied value. It does not hold against a preceding non-status rewrite of the live version → R8-F01** |

**Adjudication: CLOSED IN BLUEPRINT**, with R8-F01 noted against case 9.

## 12. Four-entry deferred-proof adjudication (E1–E4)

| Question | Answer |
|---|---|
| Duplicate harmless execution? | **Yes, harmless.** Each row event queues its own execution: E1 per recovery row, E2 per history row, E3 once, E4 once. The proof is read-only and idempotent. "Once per distinct X" is a wording issue (R8-F04.1) |
| Recursion? | **None.** The proof writes nothing, so it queues no events |
| Mutually dependent ordering? | **None.** All four are deferred, read-only and inspect the same final state. No entry depends on another's execution or on PostgreSQL's firing order among deferred triggers |
| One entry sees a state another would repair? | **No.** No deferred trigger repairs anything |
| A path where none runs? | **None found.** Every relevant violation creates at least one event: an account exit from `closing`/`closure_sealed` under `closure_abort` always writes a history row (`trg_acc1_status_history` raises if the cause is unset), giving E2; any other cause is refused by (1); a recovery row gives E1; an applied abort gives E3 (the `WHEN` clause is evaluated immediately on the request row's own values, verified in §19 P6); a family `aborted` gives E4 and the immediate guard |
| E3 created before any recovery rows exist | **Safe.** It is queued at step 4 and evaluated against the final state. 05 §5.3 says so ("E3 with neither") |
| Commit-only assumption | PostgreSQL does not promise it: `SET CONSTRAINTS … IMMEDIATE` fires early and does not re-fire (§19 P6). The design is **still sound**, because every later write to a fact the proof asserts queues a new event or is refused immediately, except the counters (R8-F01). Wording: R8-F04.1 |

**Adjudication: CLOSED IN BLUEPRINT** (subject to R8-F01 and R8-F04.1).

## 13. Four-way family-set adjudication (PAY = FAM = REC = HIS)

- **Set semantics.** S2 defines four sets of `target_id` with **exactly once** in REC and HIS. Bind (3) gives exactly-once in PAY for every element, because PAY = REC.
- **Pairwise facts.** S3 matches, for each `t`, the payload entry, the recovery row and the history row.
- **FAM** is the authoritative `master`/`default`/`master_directed_child` rows of `P.closure_family_id` in the immutable `closure_family_member`. Bind (6) forces `P.closure_family_id` = the live family for every returned row.

| Attack | Refusal |
|---|---|
| Same count, wrong member | Set equality (S2) |
| Duplicate compensating for a missing member | Exactly-once (bind (3); S2) |
| Old family generation | Bind (6) (payload family ≠ live) and S2 (F-old's members ≠ current FAM) (T-313, T-336) |
| `independent_preserved` inserted | Bind (6) and the role `CHECK`. FAM excludes it (T-351) |
| Default omitted | S2 (FAM has the default) and `trg_acc1_default_protected` |
| Child created after approval | `trg_acc1_sa_owner` refuses creation under a `closing`/`closure_sealed` master. Membership is written once at initiation and is append-only. Any member change moves its `version` → bind (6) stale |
| Child role changed / impossible historical row | `closure_family_member` is immutable and scoped to one generation (§2.10). Bind (6) compares against it |

**Stability between approval and apply.** Membership is immutable; children cannot be created under a closing master; every member's version, cycle and seal version are bound; A4 locks master-then-children. Stability is therefore **detected** by the bindings. Their database-level strength depends on the counters (R8-F01).

**Adjudication: CLOSED IN BLUEPRINT.**

## 14. Barrier / pin / family-pointer clear — cause binding

`trg_acc1_closure_barrier` now requires, for a barrier `true → false` and for **clearing** `closure_seal_pin_id` / `closure_family_id`:

- `cause_ref = X`;
- X applied in this transaction;
- **exactly one** `closure_recovery` row with `target_id` = THIS row, `change_request_id = X` and `created_xact_id` = current.

A row for another member, under another cause or from an earlier transaction never authorises the clear (T-329, T-320).

**One coherent `UPDATE`** (05 §5.1 step 6) sets `status`, `closure_barrier`, `closure_seal_pin_id` and `closure_family_id` together. It does not set `version`/`closure_cycle`, which the trigger assigns from `OLD`.

- The row `CHECK`s are satisfied in that single statement: barrier = sealed/closed; pin ⇔ sealed/closed; family NULL or in closure.
- No immediate trigger contradicts it: `closure_barrier` sees the pre-inserted row; `status_transition` (b) the same; `default_protected` its own row; `seal` computes from `OLD`, so the firing order is immaterial.

**Adjudication: CLOSED IN BLUEPRINT for clearing.** **Setting and re-pointing** those pointers outside their owning transitions are unguarded → R8-F01 item 4.

## 15. Family-abort guard adjudication

`trg_acc1_family_abort_guard` (immediate, `BEFORE UPDATE OF family_status, abort_change_request_id, aborted_at_utc`) refuses `open → aborted` unless both exist:

- an `abort_closure` applied in this transaction whose payload names this family and this family's master;
- the master's own recovery row for this family, cause and transaction.

| Attack | Result |
|---|---|
| Raw `UPDATE … SET family_status = 'aborted'` with no request / no recovery row | **Refused at the statement** (T-341) |
| `open → aborted` before every account update | **Passes the statement** once the master's row exists (step 5). **E4 at commit** proves S2/S4/S6 over the final state, so a family aborted with its members still barred cannot commit (T-341 variant). The normative order places it at step 7, after the account updates |
| Exact family set at commit | S2/S6 via E4 (and E1–E3) |

**Adjudication: CLOSED IN BLUEPRINT.**

## 16. Abort transaction-order adjudication (05 §5.1 = 02 §7.7 item 3)

**Order:** lock → re-read → verify → request `applied` → recovery rows → one coherent `UPDATE` per row (the history written by the `AFTER` trigger) → family `aborted` → audit → commit (deferred proof).

**Checked against every immediate trigger:**

| Step | Trigger | What it sees |
|---|---|---|
| 5 | Bind (2) | The applied request (step 4) |
| 5 | Bind (5) | The un-mutated rows |
| 6 | `status_transition` (a)/(b) | The applied request and this row's recovery row |
| 6 | `closure_barrier` / `default_protected` | Their own rows |
| 6 | `status_history` | `SET LOCAL` cause settings (set at step 6) |
| 7 | Family guard | The request and the master's row |

Deferred: E1–E4, `closure_family`, `master_default_invariant` and `family_membership`.

Step 6 also states, correctly, that any mutation of `version` between steps 5 and 6 makes the `UPDATE` fail closed. **Any wrong order fails closed.**

**Adjudication: PRECISE — CLOSED IN BLUEPRINT.** The residual about a request's apply-owned audit reference is R8-F04.4.

## 17. Seal transaction-order adjudication (05 §5.2)

**Order:** lock → re-read → seal request `applied` → pin → pin-readiness rows → relational attester-set equality → one coherent `UPDATE` (`status`, barrier, pin id, `closure_sealed_at_utc`, no `version`) → history (`AFTER`) → audit → commit.

| Attack | Result |
|---|---|
| Pin exists but the status transition fails | Whole-transaction rollback removes the pin and its readiness rows. **But** a savepoint-swallowed failure or a raw insert commits an **orphan pin** that permanently blocks sealing → **R8-F02** |
| Status `UPDATE` before the pin-readiness set is complete | **Refused** by `trg_acc1_seal` (count = `pinned_required_attester_count` ≥ 1; element-by-element equality with the stored seal payload) (T-352) |
| Late pin-readiness row after commit | **Refused at insert** (`trg_acc1_pin_readiness_window`: parent `created_xact_id ≠ current`), and after the seal `UPDATE` in the same transaction (`closure_seal_pin_id IS NOT NULL`) (T-325, T-343) |
| Split `UPDATE` | Row `CHECK`s refuse it |

**Adjudication:** the order is **PRECISE** (R7-F02.2 closed). The pin row itself is unguarded → R8-F02.

## 18. Version-owner adjudication

The whole-pack sweep finds **no** application workflow, trigger or test that sets `version = version + 1` for the same status transition:

- 02 §2 A4 and §7.7 step 6, 05 §5.1 step 6 and §5.2 step 8 explicitly exclude `version` from the application `UPDATE`;
- 01 ACC-REQ-060 states the single owner;
- 03 L192 says "by trg_acc1_status_transition (not the application)";
- T-346 asserts that a caller's value is overwritten.

| Transition | Increments |
|---|---|
| Closing entry | **+1** (trigger; `closure_cycle + 1`) |
| Seal | **+1** (`closure_sealed_at_version = OLD.version + 1`, computed from `OLD` by `trg_acc1_seal`, independent of firing order) |
| Abort | **+1** (+ cycle) |
| Completion | **+1** |

A restriction change is a **separate** mutation: `trg_acc1_restriction_version` gives +1 on the restriction event. If it also changes the account's stored status, the status transition gives its own single +1. There is no double increment of **one** transition.

History records `version_before = OLD.version` and `version_after = NEW.version`, read by the `AFTER` trigger after the owner assigned it.

**Adjudication: CLOSED IN BLUEPRINT for status transitions.** Non-status writes of `version` are unowned → R8-F01.

## 19. `xid8` / PostgreSQL 17 adjudication, including the reproduction

The project runtime baseline is **PostgreSQL 17.10**. `xid8` and `pg_current_xact_id()` exist from PostgreSQL 13, and `xid8` has equality operators usable in `CHECK`s and predicates.

A **disposable scratch cluster** (PostgreSQL 17.10, in the reviewer's session scratch directory, destroyed afterwards; the repository was not touched; this is not an implementation) confirmed:

| Probe | Result |
|---|---|
| P1 | A trigger-stamped `xid8` column inside `SAVEPOINT … RELEASE` (plus an unrelated `ROLLBACK TO`) equals the top-level `pg_current_xact_id()` captured before the savepoint, and equals it again at the end of the transaction |
| P2 | `UPDATE … SET status = 'applied'` on an applied row fires a `BEFORE UPDATE OF status` trigger (the column is named, the value is unchanged) and is refused |
| P3 | The runtime role naming the un-granted `applied_xact_id` gets "permission denied". P3b: the caller's `applied_at` is overwritten by the trigger |
| P4 | A payload change in the same statement as `requested → applied` is refused by the unconditional `BEFORE UPDATE` immutability trigger |
| P6 | A `DEFERRABLE INITIALLY DEFERRED` constraint trigger with `AFTER UPDATE OF status … WHEN (OLD.status='requested' AND NEW.status='applied')` is valid. `SET CONSTRAINTS ALL IMMEDIATE` fires it before commit, and it **does not fire again at commit** (R8-F04.1) |
| P7 | With a status-only owner trigger and `version`/`closure_seal_version` in the column grant, the runtime role **rewinds** `version` 11 → 10 and `closure_seal_version` 2 → 1 with a non-status `UPDATE` (**R8-F01**) |
| P8 | A status `UPDATE` that supplies `version = 500` ends at `OLD.version + 1` (single owner works for status transitions) |

**Implementable under the baseline: YES.** The 05 §8 "assert support, fail loudly" requirement is harmless and, on 17.10, satisfied.

**Dump/restore/history.** The pack uses `xid8` as same-transaction correlation only. Every "in this transaction" comparison is against the live `pg_current_xact_id()` inside the current transaction, and no rule compares two stored `xid8` values across transactions. A value that recurs after a logical restore cannot by itself ground a new action, because each predicate is paired with live-state bindings. The pack does not say this explicitly (R8-F04.2), and the pairing's strength depends on R8-F01.

**Adjudication: CLOSED IN BLUEPRINT** (wording INFO).

## 20. Remaining external gates (correctly carried; none is claimed closed)

| Gate | Status |
|---|---|
| **RF-01** IAM-02 entitlement / actor binding | **EXTERNAL GATE REMAINS** (DCR-ACC-IAM-02b/c/-03/-04/-06/-07; `IAM2-FIND-002` OPEN). The database proves agreement with the stored payload, not IAM-02 authorisation; 05 §2.4.1 says so |
| **RF-02** mistaken-creation / closability | **EXTERNAL GATE REMAINS** (`DEP-LED-CLOSURE-CONTRACT`). R8-F02's orphan-pin case is an **internal** closability defect, separate from this gate |
| **RF-05** least-privilege credentials | **EXTERNAL GATE REMAINS** (DCR-ACC-CLT-03, DCR-ACC-IAM-05) |
| **RF-09** freeze ownership | **EXTERNAL GATE REMAINS** (`DEP-FREEZE-GOVERNANCE` hard-unsatisfied; DCR-ACC-GOV-05) |
| **DCR-ACC-IAM-07** maker-initiation seam | Open, ACC-REAL-USE |
| **DCR-ACC-IAM-08** seal-rejection outcome seam | Open, ACC-REAL-USE. IAM-02 has **0** `GET` routes. `checker_rejected_seal` is hard-unavailable |
| **DCR-ACC-FND-02** authenticated channel | Open, ACC-REAL-USE (every runtime `DEP-*`) |
| `DEP-IAM-SEAL-REJECTION-EVIDENCE` | Hard-unsatisfied, `SEAM_ABSENT`. Bind (7) claims shape only |
| LED-01 commit-order property | DCR-ACC-LED-01c. Proven only by LED-01's reviewed implementation |
| Consumer barrier/drain adoption | DCR-ACC-LED-01b/-01e, CONS-01, CFG-01 |
| CFG-01 environment availability | DCR-ACC-CFG-02. CFG-01 is the sole authority |
| `A2-Q1` / `A2-Q2` | Client-money go-live (HD-7 PENDING) |
| `IAM2-FIND-002` / `FND-FIND-001` | Both **OPEN** (HIGH) in `docs/OPEN_FINDINGS.md` |

All are stated honestly in v0.8 (README L86; 17 §2, §4.8). **None is a ground for blueprint rejection.**

## 21. Task / conductor consequence

- **`task.json` is not modified by this review.** State `PLANNING`; `planning = 8` (a legal human-authorised over-limit entry, §3); `acceptanceStatus = NOT_ACCEPTED`.
- **`PLAN_READY` is not set.** No implementation eligibility is created, and there is no `06-acceptance.md`.
- **REMEDIATE ⇒ do not start v0.9 in this state.**
  - `PLANNING → PLANNING` is illegal.
  - `PLANNING → PLAN_READY → PLANNING` would redirect to `HUMAN_DECISION_REQUIRED` (limit 3).
  - The only route to a further planning turn is `PLANNING(8)` → `HUMAN_DECISION_REQUIRED` (ungated; planning stays 8) → `resolve_human_decision` → `PLANNING(9)`.
- **New human DESIGN decision required: NO.**
  - R8-F01…F04 are technical corrections within ACC-R3-HD-01, ACC-R3-HD-02, ACC-R4-HD-01 and ACC-R5-HD-01 as written.
  - The conductor still needs the human `resolve_human_decision` checkpoint to authorise the planning turn. That is a procedural approval, not a design decision.
- **The next checkpoint should transcribe this review into `findingsSummary`** (convention: INFO not counted):
  - R7-F01 is closed and leaves the open list. R7-F02 is closed (INFO).
  - R8-F01 (MEDIUM), R8-F02 (LOW) and R8-F03 (LOW) enter the open list. R8-F04 is INFO.
  - RF-01, RF-02, RF-05 and RF-09 remain as external gates.
  - Counts: **HIGH 1** (RF-01), **MEDIUM 3** (RF-02, RF-05, R8-F01), **LOW 3** (RF-09, R8-F02, R8-F03).
- **Not ESCALATE:** these are design corrections, not reviewer or model capacity limits.
- **Not HUMAN_DECISION:** no approved text is in conflict.
- **If a future re-review returns ACCEPT:** that is blueprint/architecture acceptance only. Implementation would still need the human/conductor plan-approval checkpoint and the integration decision.

## 22. What this review does not do

It does not:

- modify v0.8 (or v0.1…v0.7), `task.json`, any master or register, `platform/**`, the conductor or `main`;
- create `06-acceptance.md`;
- take any human decision;
- start remediation;
- merge.

The scratch PostgreSQL cluster of §19 was created and destroyed inside the reviewer's session scratch directory. It is outside the repository and is not an implementation.

**Implementation is not authorised.**
