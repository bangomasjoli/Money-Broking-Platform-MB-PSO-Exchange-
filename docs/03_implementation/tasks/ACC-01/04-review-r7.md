# 04 Review (round 7) — ACC-01: Account Structure blueprint pack v0.7

- **Task ID:** ACC-01 (planning task — blueprint pack, no implementation)
- **Reviewer:** independent architecture / compliance reviewer / claude-opus-5-5 / HIGH
- **Pack under review:** `docs/02_modules/ACC-01/blueprint/v0.7/` at `0d7cfb0`. This is the remediation of `04-review-r6.md` (R6-F01 MEDIUM, R6-F02 LOW, R6-F03 INFO), after the procedural checkpoint `39f58b1`.
- **Author of v0.1…v0.7:** blueprint planner / claude-sonnet-5
- **Independence:** **separate context.**
  - This review ran in a **new Claude Code session**. It carried no conversation from any author, remediation, review or checkpoint session.
  - Everything below was re-derived from the repository: the v0.7 text, the v0.6 → v0.7 diff, `04-review-r6.md` (for the finding definitions only), `06-human-decision-r6.md`, `task.json`, `docs/OPEN_FINDINGS.md`, the platform migrations and IAM-02 routes on `main`, and the actual local `aix-conductor`.
  - `05-remediation-r6.md` was **not** read or used as evidence.
  - The reviewer is the same model as the round-1…6 reviewers. It is a different model from the author.
- **Decision:** **REMEDIATE**
- **Implementation authorised:** **No.** Nothing is accepted. No `06-acceptance.md` exists or is created. This review does not modify `task.json`. `PLAN_READY` is not set.

## 1. Baseline verification (all passed)

| Check | Result |
|---|---|
| Worktree | `/Users/AimanRahimi/AIX-worktrees/acc-01` (resolves to `/Users/AimanRahimi/aix-worktrees/acc-01` on the case-insensitive volume; same worktree) |
| Branch | `module/ACC-01` |
| HEAD | `0d7cfb0` (= `origin/module/ACC-01`) |
| Working tree | clean before this review |
| History | `43f2f34` → `42316fe` (v0.1) → `2e26d13` → `8ff4e9d` (v0.2) → `b5c21bd` → `194aff0` (v0.3) → `3b3a3ee` → `af5d025` → `a865d63` (v0.4) → `c6957a0` → `038628a` → `826ab45` (v0.5) → `da3ed73` → `9c6f1b9` → `aa66084` (v0.6) → `45f2eed` → `39f58b1` → `0d7cfb0` (v0.7) |
| `main` / `origin/main` | both `43f2f34`. The main worktree (`/Users/AimanRahimi/AIX-Full-Compliance`) is clean at `43f2f34`. Nothing is merged |
| Diff `43f2f34..HEAD` | Every file is under `docs/02_modules/ACC-01/**` or `docs/03_implementation/tasks/ACC-01/**`. No `platform/**`, migration, master or register change |
| Earlier packs | `git log -- blueprint/v0.N` shows each of v0.1…v0.6 touched **only** by its own authoring commit (`42316fe`, `8ff4e9d`, `194aff0`, `a865d63`, `826ab45`, `aa66084`). All are unchanged historical evidence |
| Test ids | T-001…T-328: 328 rows, contiguous, no duplicates |
| Environment branching | The v0.6 → v0.7 diff adds **0** lines matching `PRODUCTION`/`DEVELOPMENT`/`UAT`/`DEMO`/`environment ==`/`NODE_ENV` |

## 2. Sources reviewed

- **Decisions:** ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02 and ACC-R5-HD-01, treated as approved and binding and **not reinterpreted**. `06-human-decision-r6.md` is procedural only and adds no design decision.
- **v0.7:** 05 (read in full), 02 §2 and §7.3–§7.9, 01 §4.5 and §7.3 plus the full v0.6 → v0.7 word diff of 01, 04 `abort_closure`, 06 §4–§5, 13 (read in full), 14 L35, 17 DCR-ACC-IAM-08, 10 §21 (T-307…T-328), README.
- **Source inspected read-only:**

| Area | Fact verified |
|---|---|
| `platform/infra/migrations` on `main` (71 files) | **No** migration uses `xmin`, `pg_current_xact_id()` or `txid_current()`. There is no "established pattern" for transaction identity for v0.7 to defer to. The CLT-01/CFG-01 request tables that ACC-01 mirrors enforce status only by a value `CHECK`; none has a DB status-transition guard |
| IAM-02 `platform/services/iam2/src/routes` | `approvals.ts`, `bootstrap.ts`, `internal.ts`, `roles.ts`. There are **0** `GET` routes. No seam returns an approval outcome to a requesting service. DCR-ACC-IAM-08 remains unmet |
| `docs/OPEN_FINDINGS.md` | `IAM2-FIND-002` (HIGH) **OPEN**; `FND-FIND-001` (HIGH) **OPEN** |
| `aix-conductor` `00a7bde` | Clean and not modified. See §3 |

## 3. Conductor adjudication

Verified by reading `src/state.ts` and `config/local.config.json`, and by executing `dist/records.js` `validateTaskManifest` in memory against the HEAD `task.json`. No conductor state was written.

| Item | Result |
|---|---|
| `task.json` at HEAD | `state = PLANNING`, `roundCounts.planning = 7`, `escalation = 0`, other counters 0, `acceptanceStatus = NOT_ACCEPTED`. `validateTaskManifest` → `{"ok":true,"errors":[]}` |
| `PLAN_READY` | Not set |
| `maxPlanningRounds` | **3** (`config/local.config.json` L82, unchanged) |
| Legality of `planning = 7` | **Legal human-authorised over-limit entry.** Path: `PLANNING(6)` → `HUMAN_DECISION_REQUIRED` (`39f58b1`: state `HUMAN_DECISION_REQUIRED`, planning 6, ungated, and not a `ROUND_ON_ENTER` key so no counter is consumed) → `resolve_human_decision` → `PLANNING(7)` (`0d7cfb0`). `transitionTask` sets `humanAuthorised = (task.state === 'HUMAN_DECISION_REQUIRED')` and skips the over-limit redirect, keeping the real count. **Not rejected for exceeding the limit** |
| Diffs | `45f2eed..39f58b1` changes only `state` and `relevantRecordPaths`/`updatedAt`. `39f58b1..0d7cfb0` changes only `state`, `planning` 6 → 7, the finding lists (transcribing `04-review-r6.md` §18 exactly), `relevantRecordPaths` and `updatedAt` |
| Counts | Nothing was reset. `escalation` stays 0 |
| Runtime record | `state/tasks/` holds only `IMP02-MA-HARDEN-001.json` and `PV-20260919T162254Z-001.json`. No ACC-01 runtime record (consistent with ACC-R4-HD-02) |
| `06-human-decision-r6.md` | Procedural only. It records the human's continuation authorisation verbatim and preserves every prior decision unchanged |

## 4. Verdict

**REMEDIATE.**

v0.7 fixes the core of R6-F01:

- **Pre-abort facts are now stamped.** `trg_acc1_recovery_bind` stamps them from the locked account row, so a sealed master can no longer be recorded as `closing`. The pre-seal converse therefore holds at the database level for a master family (§13).
- **The forward bijection is structural.** Every recovery row must match exactly one same-transaction `closure_abort` history row on target, from/to status and version, and the live row's cycle and seal version must match.
- **Partial family recovery is refused.** A full row set with a member that never transitioned cannot commit.

R6-F02's abort order is now normative, consistent in 02 §7.7 item 3 and 05 §5.1, and implementable. The four-member case commits. R6-F03 (a)–(e) are fixed in substance.

The pack is still not acceptable, for one MEDIUM defect in the new mechanism. This is **R7-F01**: three of the database guarantees that v0.7 claims, and that this round's criteria require, are not provided by the triggers as specified. In each case a new test asserts behaviour that no specified trigger can produce — the same class of defect as round 6's T-279.

1. **"Status transition, no recovery row" is not refused.** `trg_acc1_recovery_scope` is a constraint trigger on `closure_recovery`, so it never fires in a transaction that writes no recovery row for that cause. An independent `closing` target can be returned under `closure_abort` with no recovery row at all (T-309).
2. **The "applied in this transaction" check is not a defined or sound mechanism.** The text says "`xmin` / `pg_current_xact_id()`, whichever the migration's established pattern uses". No such pattern exists. `xmin` records the row's *last writer*, not the transaction that moved it `requested → applied`. `account_change_request` has no database status guard. So an old applied request that is merely re-written in this transaction passes (T-311).
3. **The approved payload is not read by the database.** `target_version_approved` is caller-supplied and compared only with the live row, so at the database level it proves itself (T-316). The request's family, cycle, reason and returned set are never compared with the recovery rows, although T-313 says they are.

A small INFO item (R7-F02) completes the set. **No new human design decision is needed.**

## 5. R6-F01 / R6-F02 / R6-F03 disposition

| Finding | Sev | Disposition | Basis (v0.7 text) |
|---|---|---|---|
| **R6-F01** `closure_recovery` facts caller-written, not DB-bound | MEDIUM | **SUPERSEDED BY NEW FINDING — R7-F01.** Closed: attack (a), converse bypass (stamping); attack (b), partial account-state recovery (forward bijection); attack (d), the stamped facts and the `rejection_*` wording. Still open, re-scoped into R7-F01: attack (c), replay/wrong request (same-transaction proof); the version and approved-payload binding; the reverse direction of the bijection | 05 §2.8 (stamped columns; `rejection_*` re-worded "shape only"), §5 `trg_acc1_recovery_bind`, `trg_acc1_recovery_scope` (6)(7), 5n; 01 ACC-REQ-059; 13 R-9; T-307…T-318. See §8–§13 |
| **R6-F02** Statement order vs immediate triggers unspecified | LOW | **CLOSED IN BLUEPRINT** (INFO residuals → R7-F02) | 05 §5.1 and 02 §7.7 item 3 state one identical normative order. Every trigger's timing is declared (05 §5.1, last paragraph). The row-`CHECK` coupling is stated (step 6). `trg_acc1_default_protected` uses the already-inserted recovery row as immediate evidence, with the deferred pair proving completion. T-319…T-323. See §14, §15 |
| **R6-F03** Precision (a)–(e) | INFO | **CLOSED IN BLUEPRINT** (cross-reference residual → R7-F02; the same-transaction definition in (d) depends on R7-F01(b)) | (a) 02 §7.7 1b, 04 `abort_closure`, 17 DCR-ACC-IAM-08 consumer rule, T-324. (b) 13 R-6 "per pinned required attester", T-327. (c) 01 §4.5 marked historical and superseded, 14 L35, T-328. (d) `trg_acc1_pin_readiness_window`, 5o, T-325. (e) 05 §5 `trg_acc1_seal` names relational equality as normative and the hash as string-equality evidence, T-326. See §16–§18 |

## 6. Regression check

| Item | Result |
|---|---|
| **R3-F02 readiness pinning** | **Not regressed.** Re-run: checker approves A; a posting occurs ⇒ apply-time watermark ≠ A ⇒ `ACC1_CLOSURE_NOT_READY`. B appears before the seal ⇒ A is not latest ⇒ `trg_acc1_seal` refuses. B after the seal ⇒ `trg_acc1_readiness_insert` refuses (target no longer `closing`). An attestation against B ⇒ `preseal_watermark_ref` ≠ the pin ⇒ `binding_ok = false`. Completion compares against the pin only. **No substitution** |
| Re-attestation after seal | **Still possible**, and changes nothing pinned. The family hash covers immutable seal facts only (05 §2.9, §2.10). `trg_acc1_pin_readiness_window` restricts pin-readiness rows only, not `closure_attestation` (5o) |
| Attester removed from configuration | **Still required.** The pinned row stays and R-6 now uses the pinned set (T-327) |
| New attester after seal | **Not retroactive** (05 §2.9; T-254, T-327) |
| Empty pinned set | **Refused** (`pinned_required_attester_count >= 1` + `trg_acc1_seal` count and relational equality; completion refuses an empty set) |
| **Master/default invariant** | **Holds.** `trg_acc1_master_default_invariant` (deferred) and `trg_acc1_default_protected` are unchanged in effect. So is the default-in-closure `CHECK`. No ACTIVE master with a CLOSED default is representable. The default cannot close, complete or abort alone |
| Atomic family completion | **Unchanged** (02 §7.6; 01 §7.4 step 4) |
| Atomic family abort | **Holds for the family.** A partial return is refused by stamping, the forward bijection, the exact-set check, `trg_acc1_default_protected` and `trg_acc1_closure_family` (§11). The residual gap in R7-F01(a) concerns targets that write **no** recovery row. It does not allow a partial master-family return |
| **Dependency evidence (ACC-R3-HD-03)** | **Not regressed.** No configuration string or Boolean satisfies any runtime `DEP-*` (05 §8; 01 §4.5). `checker_rejected_seal` remains **hard-unavailable** (`DEP-IAM-SEAL-REJECTION-EVIDENCE`, `SEAM_ABSENT`; 02 §7.7 1b) pending accepted DCR-ACC-IAM-08. The production root binds every runtime `DEP-*` hard-unsatisfied with `PEER_NOT_AUTHENTICATED` until DCR-ACC-FND-02 |
| CFG-01 sole environment-availability authority; no environment-name branching | **Holds** (0 added environment-name lines; 05 §8) |
| R3-F04 actor provenance, R3-F06 maker-only initiation, R3-F07 `clock_timestamp()`, R2-F03/F05…F08, RF-04/06/08/10/11, default not a fallback, composite ownership | **Not regressed** (v0.7 diff does not touch them) |

## 7. New findings

Severity uses HIGH / MEDIUM / LOW / INFO. "Blocking" means blocking **acceptance of the pack**.

### ACC-01-R7-F01 — MEDIUM — Three database guarantees claimed for the recovery binding are not provided by the specified triggers

The threat model is the one R6-F01 used and v0.7 adopts: a defective apply path, or raw writes as `role_acc1_runtime`, with application validation bypassed (T-298 style). The database cannot prove IAM-02 authorisation, because `role_acc1_runtime` can insert and apply a request row. What it **can** prove, and what v0.7 claims it proves, is that the recovery record, the account transitions and the stored approved request agree. Three parts of that claim fail.

**(a) The reverse direction of the bijection is not enforced when no recovery row exists for the cause.**

*Evidence:*

- `trg_acc1_recovery_scope` is a `DEFERRABLE INITIALLY DEFERRED` constraint trigger **on `closure_recovery`**, "evaluated at commit over the `closure_recovery` rows of each `change_request_id` written in the transaction" (05 §5).
- A PostgreSQL constraint trigger fires only for row events on its own table. If the transaction inserts no `closure_recovery` row, it never runs, and its "for every such history row, exactly one `closure_recovery` row" clause (6) is never evaluated.
- No immediate trigger fills the gap:
  - `trg_acc1_status_transition` requires only an `abort_closure` cause applied in this transaction. It does not require a recovery row, and it does not require the request to name this account or its family.
  - `trg_acc1_closure_barrier` requires "a `closure_recovery` row written in the same transaction". That is neither target-bound nor cause-bound in the text (T-320 reads it as "for it"), and it applies only to rows whose barrier or `closure_family_id` changes.
  - `trg_acc1_default_protected` is target-bound but covers only the default.
  - `trg_acc1_family_membership` lets `open → aborted` happen "with the matching cause reference" and needs no recovery set.

*Attacks that commit as specified:*

1. An independent target X is `closing`. In one transaction, an `abort_closure` request is moved to `applied`, then X is updated `closing →` projection with `cause_type = 'closure_abort'`, `cause_ref` = that request. **No `closure_recovery` row is written.**
   - The barrier stays false and `closure_family_id` is already NULL, so no barrier rule is involved.
   - `trg_acc1_recovery_scope` never fires.
   - The result: an abort with no recovery record, no stamped facts, no reason-code `CHECK` and no evidence. This is exactly **T-309**, which asserts the refusal comes from "`trg_acc1_recovery_scope` bijection, converse direction". The specified trigger cannot provide it.
2. If `trg_acc1_closure_barrier` is implemented as its text reads ("a" recovery row), a **sealed** independent target can be unsealed without its own recovery row. This needs a legitimate recovery for another account in the same transaction, and a second applied request with no rows as X's cause. The pre-seal-ground `CHECK` is then never evaluated for X.
   - The master-family converse is **not** affected (§13): the default's target-bound check and the exact-set check close it.
3. `closure_family.family_status` can move `open → aborted` with no recovery rows and no member transitions. The members stay `closing`/`closure_sealed` under an aborted family. This is the barred (safe) direction, but the family is stranded, which is the R6-F01(b) outcome by another route.

**(b) "Applied in this transaction" has no defined or sound implementation.**

*Evidence:*

- 05 §5 `trg_acc1_status_transition`: "comparing the request row's transaction identity (`xmin` / `pg_current_xact_id()`, whichever the migration's established pattern uses) to the current transaction's". `trg_acc1_recovery_bind` and `trg_acc1_pin_readiness_window` reuse "the same check". README item 3 and T-311 rely on it.
- These are **not alternatives.**
  - `xmin` is a row-version attribute of type `xid`. It names the transaction that **last wrote that row version**.
  - `pg_current_xact_id()` returns the current **top-level** transaction id as `xid8`.
  - The only meaningful test compares the first with the second. The text does not define that comparison.
- **No migration on `main` uses either** (§2). The "established pattern" does not exist.
- **The property proved is "this row was last written in this transaction", not "this row moved `requested → applied` in this transaction".**
  - `account_change_request` has **no database status-transition guard.** 06 §4 is a state diagram only, 05 §5 lists no trigger for the table, and the CLT-01/CFG-01 precedents have none.
  - `role_acc1_runtime` holds `UPDATE (status, applied_at_utc, sec_audit_ref, updated_at_utc, …)` on it (05 §6).
- *Replay that commits:* a defective step 4 issues `UPDATE … SET status = 'applied', applied_at_utc = … WHERE change_request_id = <yesterday's applied abort for this master>`. That is a no-op re-application, which nothing refuses. It re-stamps `xmin` to the current transaction, and every "applied in this transaction" check then passes.
  - Combined with (c), yesterday's approval (for an earlier, aborted family generation of the same master) can ground today's abort of the current family.
  - **T-311** passes only if the replayed row is left untouched. It does not test the property it names.
- *Consistency hazard:* inside any `SAVEPOINT` (a nested-transaction or retry helper), `xmin` is the **subtransaction** id and never equals the top-level id, so a legitimate apply is refused. That is fail-closed, but it is not a consistently implementable rule.
- Two concurrent-transaction cases are **correctly** refused under any reading: another transaction's uncommitted apply is invisible (the row reads `requested`), and a committed one carries a different `xmin`.

**(c) The stored approved payload is not read by the database, so version, family, cycle, reason and returned set are self-proving at the DB level.**

*Evidence:*

- 05 §2.8 `target_version_approved` is "**Caller-supplied** … `trg_acc1_recovery_bind` compares it against the locked target row's actual `version`".
  - A caller that supplies the **live** version always passes.
  - The database never reads the version the checker approved, although it is in the stored `payload` of the very request row the trigger already reads (04 `abort_closure`, R5-F03 version binding).
  - R-9 compares the same caller value with status history, so it is equally self-referential.
  - So **T-316** holds only when the caller is honest. The attack "approval at version 10, restriction → 11, apply" is refused by the application's A4 check. It is **not** refused by the database, contrary to "the same check A4 performs … now repeated structurally at the database" (05 §2.8) and "now enforced twice" (T-316).
- `trg_acc1_recovery_bind` step (2) checks only that the request names `abort_target_id`. It does not compare the request's stored:
  - `closure_family_id`
  - per-member `closure_cycle`, `closure_seal_version` or role
  - returned-member list
  - `reason_code`
  - `evidence_ref` / `evidence_owner_target_id`

  with the recovery rows. `reason_code` and `evidence_*` stay caller-named and unverified by the database.
- **T-313** asserts that a request whose stored `closure_family_id` differs "is refused … because the stamped `closure_family_id` … does not match the request". No specified trigger makes that comparison. Scope (3) compares the rows with `closure_family_member` for the **stamped** family, never with the request.
- 05 §2.8 says `abort_target_id`/`_type` are **stamped** ("never the caller's `INSERT` value"). 05 §5 step (2) says the caller's values are "accepted only if they match". Both are safe, but T-312 is written against the stamping reading.

*Why MEDIUM and blocking:*

- This is the same class of defect, under the same standard and threat model, as R6-F01 (MEDIUM). Four new tests (T-309, T-311, T-313, T-316) assert DB behaviour that the specified triggers cannot provide.
- The pack's headline claims are not true as specified:
  - ACC-REQ-059: "every such transition [has] a recovery row"; "must have moved `requested → applied` in this same transaction"
  - 05 5n and README items 2–3
  - 02 §7.7 item 3: "a transition with no recovery row … refuse[s]"
- This round's acceptance criteria name these exact attacks.
- Direct safety impact is bounded:
  - every abort is maker-checker at the application layer, and A4 re-checks the version under lock;
  - the sealed-master converse holds (§13);
  - attack (a)1 returns a `closing` (unbarred) target;
  - (a)3 fails in the barred direction.
- That is why this is MEDIUM, not HIGH.

**Affected sections:** 05 §2.5 (R6-F01C paragraph), §2.8 (`abort_target_*`, `target_version_approved`, `reason_code`, `evidence_*`, `change_request_id`, the paragraph after the `CHECK`), §5 (`trg_acc1_status_transition`, `trg_acc1_recovery_bind`, `trg_acc1_closure_barrier`, `trg_acc1_recovery_scope`, `trg_acc1_family_membership`, `trg_acc1_pin_readiness_window`), §5.1, 5n, 5o; 05 §2.4 / 06 §4 (no request status guard); 01 ACC-REQ-059, §7.3; 02 §7.7 item 3; 13 R-9; README items 2–3; 10 T-309, T-311, T-312, T-313, T-315, T-316.

**Required correction:**

1. **Reverse direction, enforced from the account side (a).**
   - `trg_acc1_status_transition` (immediate) must require, for every exit from `closing`/`closure_sealed` under `closure_abort`, an **already-inserted, same-transaction** `closure_recovery` row with `target_id` = this row and `change_request_id` = `cause_ref`. The normative order (05 §5.1 step 5 before step 6) already guarantees it.
   - Alternatively, add a deferred constraint trigger on `account_status_history` `AFTER INSERT` for `cause_type = 'closure_abort'` that runs the reverse check.
   - Word `trg_acc1_closure_barrier`'s condition as **this target's** recovery row under **this** cause.
   - Require `closure_family` `open → aborted` to carry a recovery set for `abort_change_request_id`: attach the scope check to that update, or refuse the update unless the master's recovery row exists.
2. **Same-transaction identity (b).**
   - Add a database status guard on `account_change_request`: only `requested → applied | cancelled | expired`, and every later status is terminal. Any write to `status`/`applied_*` on a non-`requested` row raises.
   - On `requested → applied`, stamp an immutable `applied_xact_id xid8 := pg_current_xact_id()`.
   - `trg_acc1_status_transition` and `trg_acc1_recovery_bind` compare `applied_xact_id = pg_current_xact_id()`. That value is the top-level id, is unaffected by savepoints, and records the applying transaction itself, not the last writer.
   - Give `closure_seal_pin` (and, if used, `closure_recovery`) a stamped `created_xact_id xid8` for `trg_acc1_pin_readiness_window` and "written in this transaction" checks, instead of `xmin`.
   - Remove "whichever the migration's established pattern uses".
3. **Approved-payload binding (c).**
   - Define normatively the stored `abort_closure` `payload` fields the database reads: target id and type, `closure_family_id`, `reason_code`, `evidence_ref`/`evidence_owner_target_id`, and per returned member id, `version`, `closure_cycle`, `closure_seal_version` and role.
   - `trg_acc1_recovery_bind` must:
     - require `NEW.target_id` to be in the payload's returned list;
     - **stamp** `target_version_approved` from the payload, then compare it with the locked row's live `version`, raising `ACC1_CLOSURE_APPROVAL_STALE` on a difference;
     - compare the payload's family id, cycle, seal version and role with the stamped values;
     - stamp or compare `reason_code` and `evidence_*` from the payload.
   - `trg_acc1_recovery_scope` must require row set = payload returned set = family set.
   - R-9 compares with the payload.
   - Choose one wording for `abort_target_id`/`_type` (stamp or verify) and use it in 05 §2.8, §5 and T-312.
4. **Tests.** Rewrite T-309, T-311, T-313 and T-316 to name the mechanism that refuses them, and add:
   - an independent `closing` target returned with no recovery row (refused immediately);
   - an old applied request re-written (`SET status = 'applied'`) in the current transaction (refused by the status guard);
   - a legitimate apply inside a `SAVEPOINT` (commits);
   - a caller-supplied live version against a payload holding an older version (refused, stale);
   - a recovery `reason_code` differing from the payload (refused);
   - `closure_family` → `aborted` with no recovery rows (refused).

**Implementation impact:** phase 1 (a new `account_change_request` status guard and xact-id column; the `trg_acc1_status_transition`, `trg_acc1_recovery_bind`, `trg_acc1_closure_barrier`, `trg_acc1_recovery_scope` and `closure_family` checks; `closure_seal_pin` xact-id); phase 5 (the apply path writes the payload fields and stops supplying stamped values); phase 7 (R-9). No API or state-machine change.

**Human decision required: NO.** This completes R6-F01's own required correction (items 2 and 3) within ACC-R3-HD-01 item 8, ACC-R4-HD-01 and ACC-R5-HD-01 as written. No approved text changes.

### ACC-01-R7-F02 — INFO — Precision

1. **Generic A4 order.** 02 §2 A4 still reads "perform the mutation; write status history; set request `applied`". For an abort that order would be refused by the immediate triggers. Add "for `abort_closure`, the order of 05 §5.1 governs" to A4.
2. **Seal statement order not stated.** R6-F02's correction asked for the abort **and seal** orders.
   - `trg_acc1_seal` (immediate, `BEFORE UPDATE OF status`) needs the pin and every pin-readiness row inserted **before** the status `UPDATE`.
   - `trg_acc1_pin_readiness_window` needs the pin before its readiness rows.
   - The row `CHECK`s need `status`, `closure_barrier` and `closure_seal_pin_id` in one `UPDATE`.
   - 02 §7.4 step 3 narrates "sets `closure_barrier` … writes the immutable `closure_seal_pin`". State the seal order once, as for the abort. Any wrong order fails closed.
3. **`version` ownership.**
   - 05 §5.1 step 6 has the application's `UPDATE` set `version`, while `trg_acc1_status_transition` "bumps `version`".
   - If both increment, `version_after = target_version_approved + 2`, and the bijection refuses every legitimate abort.
   - Name one owner, preferably the trigger with `NEW.version := OLD.version + 1`.
4. **Cross-reference.** 05 §2.8 `evidence_ref` and 17 DCR-ACC-IAM-08 say the R6-F03(a) rule is stated normatively in "file 01 §7.3". It is not there; the v0.7 diff of 01 adds no such text. It is in 02 §7.7 1b, 04 and 17. Correct the reference or add the sentence to 01 §7.3.

**Human decision required: NO.**

**Totals (new):** MEDIUM 1, INFO 1.

## 8. Recovery-stamping adjudication (`trg_acc1_recovery_bind`)

| Field | Class in v0.7 | Adjudication |
|---|---|---|
| `target_type`, `target_id` | Caller-named | Acceptable. The target must have a membership row (master abort) or equal the request's target (independent, via the `CHECK`). Payload returned-list membership is not verified → R7-F01(c) |
| `from_status` | **Stamped** from the locked row's live `status` | **Sound.** Under the normative order every recovery row is inserted before any account `UPDATE`. A row inserted after its own `UPDATE` would stamp an operational status and fail the `CHECK IN ('closing','closure_sealed')`, which is fail-closed |
| `closure_cycle_before/after` | **Stamped** (+1 `CHECK`); scope (7) checks the live row at commit | **Sound** |
| `closure_seal_version_at_abort` | **Stamped**; scope (7) checks it | **Sound** |
| `closure_family_id` | **Stamped** from the live row | **Sound** |
| `family_role` | **Derived** from `closure_family_member.membership` at (stamped family, target); no match ⇒ refuse; `independent_preserved` is outside the column's `CHECK` ⇒ refuse | **Sound** |
| `abort_target_type` / `abort_target_id` | Stamped or verified against the request's stored target (the wording differs, R7-F01(c)) | **Sound for target identity**: a row naming target C cannot use A's request (target mismatch, or the role/`target_id = abort_target_id` `CHECK` fails) |
| `abort_target_from_status` | **Stamped** from the abort target's own row (master first) | **Sound.** A sealed master + caller `'closing'` ⇒ stamped `'closure_sealed'` ⇒ pre-seal `CHECK` refuses (T-307, T-318) |
| `barrier_cleared` | **Stamped** from the stamped `from_status` | **Sound** |
| `target_version_approved` | **Caller-supplied**, compared only with the live row | **Self-proving at the DB level** → R7-F01(c) |
| `to_status` | Caller; cross-checked by the bijection against the history row | **Sound** (for rows that have a recovery row) |
| `reason_code`, `evidence_ref`, `evidence_owner_target_id` | Caller-named; not compared with the payload | **Not bound by the DB** → R7-F01(c). The pre-seal converse does not depend on them (the `CHECK` uses the stamped status) |
| `rejection_*` | `CHECK` shape only, now described honestly (05 §2.8 R6-F01F) | **Closed** (R6-F01(d) wording). The ground is hard-unavailable |
| `change_request_id` | Caller-named; must be applied "in this transaction" | Mechanism undefined/unsound → R7-F01(b) |

**Sealed master + caller says `closing` ⇒ fails** (DB sees the sealed master). R6-F01 attack (a) is **closed**.

## 9. Same-transaction request adjudication

| Attack | Result |
|---|---|
| Request applied by another concurrent transaction | **Refused** under any reading (uncommitted: row still `requested`; committed: different `xmin`) |
| Old applied request, untouched, cited today | **Refused** under the `xmin` reading |
| Old applied request **re-written** in today's transaction (no-op re-application or any column update) | **Passes** — `xmin` becomes current, and `account_change_request` has no status guard → **R7-F01(b)** |
| Legitimate apply inside a `SAVEPOINT` | **Refused** under the `xmin` reading (subtransaction id) — not consistently implementable → **R7-F01(b)** |
| `trg_acc1_status_transition` vs `trg_acc1_recovery_bind` consistency | Stated as "the same check", so consistent in wording. Both inherit the undefined mechanism |

**Adjudication: STILL DEFECTIVE → R7-F01(b).** The prompt's standard ("do not accept a vague `xmin`/current-transaction statement if it cannot be implemented consistently") is not met.

## 10. Recovery ↔ status-history bijection adjudication

| Attack | Result |
|---|---|
| Recovery row, no status transition | **Refused at commit** (scope (6), forward) — T-310 |
| Status transition, no recovery row, while other rows of the same cause exist | **Refused at commit** (scope (6), reverse, evaluated because the cause has rows) |
| Status transition, **no recovery row for that cause at all** | **Commits** for a `closing` target (scope never fires) → **R7-F01(a)**. T-309 asserts the opposite |
| Two recovery rows for one transition | **Refused** (reverse: the history row has two rows; also "exactly one target row" for the target) |
| One recovery row for two transitions | **Refused** (forward: two history rows) |
| Correct target, wrong `from_status` | **Unrepresentable** (stamped); a history mismatch is also refused |
| Correct `from_status`, wrong version | `version_after` ≠ `target_version_approved + 1` ⇒ refused. But the caller's version is self-proving against the payload → R7-F01(c) |
| Correct row set, one member never transitioned | **Refused** (forward) — T-308 |

Matching facts: target id, from/to status and `version_after` via history; cycle and seal version via the live row (scope (7)); family via stamping and the exact-set check. **Complete in the forward direction; incomplete in the reverse direction → R7-F01(a).**

## 11. Exact-family-set adjudication

| Attack | Result |
|---|---|
| Master + default transitioned, child C left `closure_sealed` | **Refused.** C is in the family set, so scope (3) needs its row. With the row, forward (6) needs its transition; without it, (3) fails |
| All recovery rows written, C not updated | **Refused** (forward bijection; T-308) |
| All updates performed, C's row omitted | **Refused.** Scope (3) fails (the master's row exists, so the scope trigger runs for that cause), and reverse (6) fails for C's history row under that cause. C under a *different* applied cause with no rows: C's `closure_family_id` clear needs "a" recovery row (R7-F01(a) wording), then scope (3) for the master's cause still fails because C is missing |
| `independent_preserved` member | Excluded (role `CHECK`; scope (3); T-287) |
| RECOVERY SET = TRANSITION SET = master + default + every master-directed child of THIS generation | **Holds** whenever the master's recovery row exists, which a master-family return requires (the default's target-bound check and `trg_acc1_closure_family`) |

## 12. Family role / generation adjudication

- `family_role` comes from `closure_family_member.membership` at the **stamped live** `closure_family_id`. A row from an old, aborted family cannot satisfy the current recovery: the live row points at the current family, and scope (4) needs an `open → aborted` move that an aborted family cannot make.
- No operational member can remain a current participant in an aborted family. An operational row with non-NULL `closure_family_id` is unrepresentable (row `CHECK`), and the forward bijection proves every member's clearing `UPDATE` ran. (The only residual is R7-F01(a)3: an `aborted` family with **no** recovery at all leaves members barred, not operational.)
- Immutable historical membership remains for audit (05 §2.10).

## 13. Version-binding and pre-seal-converse adjudication

**Version binding.**

- Approval at version 10 → restriction bumps the member to 11 → apply: **refused before mutation by the application** (A4, `ACC1_CLOSURE_APPROVAL_STALE`; T-296).
- **At the DB level it is refused only if the caller passes the payload value.** `target_version_approved` is not read from the stored payload → **R7-F01(c)**.
- The status history then proves the +1 transition (bijection).

**Pre-seal converse (ACC-R5-HD-01), re-proved.**

- *Independent target:* its own row is the target row. `abort_target_from_status` is stamped, so a `closure_sealed` target with a pre-seal reason fails the `CHECK`, whenever a recovery row exists. A sealed target needs its barrier cleared, which needs a recovery row. Under the text's non-target-bound wording that could be another target's row → R7-F01(a)2.
- *Master family:* the master's actual status is stamped onto every row. A `closure_sealed` master with a pre-seal reason fails the `CHECK` on every row. Skipping the master's row is impossible:
  - the default must carry its own recovery row (`trg_acc1_default_protected`), which makes the scope trigger run for that cause and require exactly one master row;
  - citing a different request for the default breaks the role/target `CHECK` or the family-carrying check (3).
  - **The converse holds at the DB level for a master family, regardless of inserted values** (T-307, T-318).
- *Returned children may be `closure_sealed`* while the master is `closing` (T-317, T-323). **ACC-R5-HD-01 preserved exactly.**

## 14. Transaction-order and trigger-timing adjudication

- **Order** (05 §5.1 = 02 §7.7 item 3):
  1. lock
  2. re-read
  3. verify
  4. request `applied`
  5. insert stamped recovery rows
  6. one coherent `UPDATE` per row
  7. family `aborted`
  8. audit
  9. commit, with the deferred checks
- **Compatibility with every immediate trigger:**
  - `trg_acc1_recovery_bind` sees the applied request (step 4) and the un-mutated rows (step 5 before 6).
  - `trg_acc1_status_transition` sees the applied request.
  - `trg_acc1_closure_barrier` and `trg_acc1_default_protected` see the already-inserted recovery row.
  - The row `CHECK`s are satisfied by a single coherent `UPDATE` (step 6 names status, barrier, pin, family pointer and version together). **No normative text asks for separate barrier/status/family statements.** The superseded 01 §7.3 narrative is explicitly overridden.
  - `trg_acc1_pin_readiness_window` is not involved in an abort.
- **Deferred:** `trg_acc1_recovery_scope`, `trg_acc1_closure_family`, `trg_acc1_master_default_invariant` and `trg_acc1_family_membership` see the final coherent state.
- **Four-member case** (master `closing`, default `closure_sealed`, A `closure_sealed`, B `closing`): four stamped rows (the master's `abort_target_from_status = 'closing'` on each), four single-statement updates, family `aborted`, then commit.
  - Scope (1)–(7) pass.
  - `trg_acc1_closure_family`: master operational, default operational, no closure-state default.
  - Master/default invariant: M non-`closed` with exactly one non-`closed` default.
  - **Commits** (T-323), subject to the `version` single-owner point (R7-F02.3).
- **Default protection:** immediate evidence is the default's own same-transaction recovery row; completion is proven by the deferred pair. A default-only return is refused at commit (T-322). **Sound.**
- Residuals: generic A4 order and the unstated seal order → R7-F02.1–2.

**R6-F02: CLOSED IN BLUEPRINT.**

## 15. Rejection current-cycle binding (R6-F03(a))

Normative in 02 §7.7 1b, 04 `abort_closure` and the 17 DCR-ACC-IAM-08 consumer rule. The cited request's stored `closure_cycle` must equal the owner's current cycle, **and** its initiation reference must equal:

- the current `closure_family_id` for a master-directed member;
- `independent_initiation_id` for an independent target or an `independent_preserved` member.

A rejection from an old family generation never qualifies (T-324). The ground stays hard-unavailable. **CLOSED IN BLUEPRINT.** The "01 §7.3" cross-reference is inaccurate → R7-F02.4.

## 16. Pin-readiness-window adjudication (R6-F03(d))

`trg_acc1_pin_readiness_window` (immediate `BEFORE INSERT`) refuses a pin-readiness row unless its parent pin was written in this transaction.

- A late extra row after the seal commit is refused **at insert** (T-325).
- Completion-time fail-closed remains a second layer.
- `closure_attestation` stays appendable (5o).
- Because `closure_seal_pin` is append-only, a "last writer" test is sound here, but the transaction-identity definition must be the one R7-F01(b) fixes (savepoint consistency).

**CLOSED IN BLUEPRINT**, with its mechanism definition carried into R7-F01(b).

## 17. Attester-set equality adjudication (R6-F03(e))

`trg_acc1_seal` normatively evaluates **element-by-element relational equality** between the pin-readiness rows and the stored approved payload's attester list, with `pinned_required_attester_count >= 1` equal to the row count. The tuples are module, authenticated identity, contract id, contract version and readiness id.

- **Same count** — the count equality.
- **No duplicates** — PK `(seal_pin_id, attester_module)`; a duplicated payload entry cannot be matched by distinct rows.
- **No missing or extra entries** — element-by-element equality.

No SQL re-implementation of `@aix/foundation` canonicalisation is required. The hash is string-compared as payload/audit evidence only. **CLOSED IN BLUEPRINT.**

## 18. R6-F03(b)/(c)

- **(b)** R-6 is now "per **pinned** required attester, never per configured attester". Configuration changes after the seal cannot alter the reconciliation scope (T-327). **CLOSED.**
- **(c)** 01 §4.5's present-tense endpoint sentence is marked historical and superseded, and the R5 paragraph governs. 14 L35 states the normative rule: a configured endpoint alone never satisfies a runtime dependency; authenticated service identity is required. FND-02 remains external / ACC-REAL-USE. **CLOSED.**

## 19. Remaining external gates (correctly carried; none is claimed closed)

| Gate | Status |
|---|---|
| **RF-01** IAM-02 entitlement / actor binding | **EXTERNAL GATE REMAINS** (DCR-ACC-IAM-02b/c/-03/-04/-06/-07; `IAM2-FIND-002` OPEN) |
| **RF-02** mistaken-creation / closability | **EXTERNAL GATE REMAINS** (`DEP-LED-CLOSURE-CONTRACT`) |
| **RF-05** least-privilege credentials | **EXTERNAL GATE REMAINS** (DCR-ACC-CLT-03, DCR-ACC-IAM-05) |
| **RF-09** freeze ownership | **EXTERNAL GATE REMAINS** (`DEP-FREEZE-GOVERNANCE` hard-unsatisfied; DCR-ACC-GOV-05) |
| **DCR-ACC-IAM-07** maker-initiation seam | Open, ACC-REAL-USE |
| **DCR-ACC-IAM-08** seal-rejection outcome seam | Open, ACC-REAL-USE; `checker_rejected_seal` hard-unavailable; IAM-02 has no `GET` route (§2) |
| **DCR-ACC-FND-02** authenticated channel | Open, ACC-REAL-USE (every runtime `DEP-*`) |
| `DEP-IAM-SEAL-REJECTION-EVIDENCE` | Hard-unsatisfied, `SEAM_ABSENT` |
| LED-01 commit-order property | DCR-ACC-LED-01c. Proven only by LED-01's reviewed implementation |
| Consumer barrier/drain adoption | DCR-ACC-LED-01b/-01e, CONS-01, CFG-01 |
| CFG environment availability | DCR-ACC-CFG-02; CFG-01 is the sole authority |
| `A2-Q1` / `A2-Q2` | Client-money go-live (HD-7 PENDING) |
| `IAM2-FIND-002` / `FND-FIND-001` | Both **OPEN** in `docs/OPEN_FINDINGS.md` |

No external module, master or register is claimed changed (diff scope §1).

## 20. Task / conductor consequence

- **`task.json` is not modified by this review.** State `PLANNING`, `planning = 7` (a legal human-authorised over-limit entry, §3), `acceptanceStatus = NOT_ACCEPTED`.
- **`PLAN_READY` is not set.** No implementation eligibility is created. No `06-acceptance.md`.
- **REMEDIATE ⇒ do not start v0.8 in this state.**
  - `PLANNING → PLANNING` is illegal.
  - `PLANNING → PLAN_READY → PLANNING` would redirect to `HUMAN_DECISION_REQUIRED` (limit 3).
  - The only route to a further planning turn is `PLANNING(7)` → `HUMAN_DECISION_REQUIRED` (ungated; planning stays 7) → `resolve_human_decision` → `PLANNING(8)`.
- **New human DESIGN decision required: NO.** R7-F01 and R7-F02 are technical corrections within ACC-R3-HD-01, ACC-R4-HD-01 and ACC-R5-HD-01. The conductor still needs the human `resolve_human_decision` checkpoint to authorise the planning turn. That is a procedural approval, not a design decision.
- **The next checkpoint should transcribe this review into `findingsSummary`** (convention: INFO not counted):
  - R6-F01 is superseded by R7-F01 (MEDIUM), which enters the open list.
  - R6-F02 is closed and leaves the open list.
  - R6-F03 is closed (INFO).
  - R7-F02 is INFO.
  - RF-01, RF-02, RF-05 and RF-09 remain as external gates.
  - Counts: **HIGH 1** (RF-01), **MEDIUM 3** (RF-02, RF-05, R7-F01), **LOW 1** (RF-09).
- **Not ESCALATE:** these are design corrections, not reviewer or model capacity limits.
- **Not HUMAN_DECISION:** no approved text is in conflict.
- **If a future re-review returns ACCEPT:** that is blueprint/architecture acceptance only. Implementation would still need the human/conductor plan-approval checkpoint and the integration decision.

## 21. What this review does not do

It does not:

- modify v0.7 (or v0.1…v0.6), `task.json`, any master or register, `platform/**`, the conductor or `main`;
- create `06-acceptance.md`;
- take any human decision;
- start remediation;
- merge.

**Implementation is not authorised.**
