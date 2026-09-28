# 04 Review (round 6) — ACC-01: Account Structure blueprint pack v0.6

- **Task ID:** ACC-01 (planning task — blueprint pack, no implementation)
- **Reviewer:** independent architecture / compliance reviewer / claude-opus-5-5 / HIGH
- **Pack under review:** `docs/02_modules/ACC-01/blueprint/v0.6/` at `aa66084`. This is the remediation of `04-review-r5.md` under ACC-R5-HD-01, after the human-decision checkpoint `9c6f1b9`.
- **Author of v0.1…v0.6:** blueprint planner / claude-sonnet-5
- **Independence:** **separate context.**
  - This review ran in a **new Claude Code session**. It carried no conversation from any author, remediation, review or human-checkpoint session.
  - Everything below was re-derived from the repository: the v0.6 text (all 18 files), the v0.5 → v0.6 diff, the governing decisions, `docs/OPEN_FINDINGS.md`, the IAM-02 source and the actual local `aix-conductor`.
  - `05-remediation-r5.md` was **not** used as evidence.
  - The reviewer is the same model as the round-1…5 reviewers. It is a different model from the author.
- **Decision:** **REMEDIATE**
- **Implementation authorised:** **No.** Nothing is accepted. No `06-acceptance.md` exists or is created. This review does not modify `task.json`.

## 1. Baseline verification (all passed)

| Check | Result |
|---|---|
| Worktree | `/Users/AimanRahimi/AIX-worktrees/acc-01` |
| Branch | `module/ACC-01` |
| HEAD | `aa66084` (= `origin/module/ACC-01`) |
| Working tree | clean before this review |
| History | `43f2f34` → `42316fe` (v0.1) → `2e26d13` → `8ff4e9d` (v0.2) → `b5c21bd` → `194aff0` (v0.3) → `3b3a3ee` → `af5d025` → `a865d63` (v0.4) → `c6957a0` → `038628a` → `826ab45` (v0.5) → `da3ed73` → `9c6f1b9` → `aa66084` (v0.6) |
| `main` / `origin/main` | both `43f2f34`. The main worktree (`/Users/AimanRahimi/AIX-Full-Compliance`) is clean at `43f2f34`. Nothing is merged |
| Diff `43f2f34..HEAD` | 124 files. **All** are under `docs/02_modules/ACC-01/**` or `docs/03_implementation/tasks/ACC-01/**`. No `platform/**`, migration, master or register change |
| Earlier packs | `git log -- blueprint/v0.N` shows each of v0.1…v0.5 touched **only** by its own authoring commit (`42316fe`, `8ff4e9d`, `194aff0`, `a865d63`, `826ab45`). All are unchanged historical evidence |
| Test ids | T-001…T-306: contiguous, no duplicates |
| Environment branching | The v0.5 → v0.6 diff adds **0** lines matching `PRODUCTION`/`DEVELOPMENT`/`UAT`/`DEMO`/`environment ==`/`NODE_ENV` |

## 2. Sources reviewed

- **Decisions:** ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02 and ACC-R5-HD-01, treated as approved and binding.
  - ACC-R5-HD-01 in v0.6 file 17 §4.6 was compared mechanically with `06-human-decision-r5.md` §4 (markdown emphasis removed). It is **identical**. It is applied as written and **not reinterpreted**.
- **Task records:** `04-review-r5.md`; `06-human-decision-r5.md`; `task.json` and its diffs at `9c6f1b9` and `aa66084`.
- **v0.6:** all 18 files were read, and the v0.5 → v0.6 diff was checked line by line for removed controls.
  - Every removed line in 05, 06 and 10 was replaced by a rewritten version.
  - The only control deliberately withdrawn is the v0.5 per-row pre-seal `CHECK`, as ACC-R5-HD-01 requires.
- **Source inspected read-only:**

| Area | Fact verified |
|---|---|
| IAM-02 `platform/services/iam2/src/routes` | Only `POST` routes exist, and there is **no `GET` route anywhere** in the service. `approvals.ts` has `request` (L126), `approve` (L215) and `reject` (L431). `reject` writes `status = 'rejected'` (L472) and returns it **only to the rejecting caller** (L493). `internal.ts` has `permission/check` (L65) and `permission/execute-verify` (L127). **No seam returns an approval outcome to a requesting service.** Current IAM-02 does **not** satisfy DCR-ACC-IAM-08 |
| `docs/OPEN_FINDINGS.md` | `IAM2-FIND-002` (HIGH) **OPEN**; `FND-FIND-001` (HIGH) **OPEN** |
| `aix-conductor` `00a7bde` | Clean and not modified. See §3 |

## 3. Conductor adjudication

Verified by reading `src/state.ts` and `config/*.json`, and by executing `dist/records.js` `validateTaskManifest` in memory. `dist` was built after `src`. No conductor state was written.

| Item | Result |
|---|---|
| `task.json` at HEAD | `state = PLANNING`, `roundCounts.planning = 6`, `escalation = 0`, other counters 0, `acceptanceStatus = NOT_ACCEPTED`. `validateTaskManifest` → `{"ok":true,"errors":[]}` |
| `PLAN_READY` | Not set |
| `maxPlanningRounds` | **3** in `config/local.config.json` L82 and `config/example.config.json` L82 (unchanged) |
| Legality of `planning = 6` | **Legal human-authorised over-limit entry.** Path: `PLANNING(5)` → `HUMAN_DECISION_REQUIRED` (ungated; manifest at `9c6f1b9`: state `HUMAN_DECISION_REQUIRED`, planning 5) → `resolve_human_decision` → `PLANNING(6)` (manifest at `aa66084`). The `9c6f1b9` → `aa66084` diff changes only `state`, `planning` 5 → 6, the finding lists, `relevantRecordPaths` and `updatedAt` |
| Why 6 is legal although 6 > 3 | `transitionTask` (`src/state.ts`) sets `humanAuthorised = (task.state === 'HUMAN_DECISION_REQUIRED')` and skips the over-limit redirect for a gated exit. The counter keeps the real count. `HUMAN_DECISION_REQUIRED` is not a key of `ROUND_ON_ENTER`, so entering it consumes no counter. **Not rejected merely for exceeding the limit** |
| Counts | Nothing was reset. `escalation` stays 0: only `ESCALATION_REQUIRED` consumes it, and that state was never entered |
| Runtime record | `state/tasks/` holds only `IMP02-MA-HARDEN-001.json` and `PV-20260919T162254Z-001.json`. **No ACC-01 runtime conductor record was created** (consistent with ACC-R4-HD-02) |
| R5-F06.3 (timestamp accuracy) | **Resolved prospectively.** `updatedAt` at `9c6f1b9` is `13:42:30Z` against a commit at `13:44:03Z`. `updatedAt` at `aa66084` is `14:13:50Z` against a commit at `14:15:22Z`. Both precede their commits and are plausible recording times. Earlier checkpoints are not edited; the correction is noted in 17 §5 |

## 4. Verdict

**REMEDIATE.**

v0.6 corrects the substance of every round-5 finding:

- **Pre-seal recovery is now scoped to the abort target.** A master family can be returned while the master is `closing`, sealed members included, exactly as ACC-R5-HD-01 says (R5-F01).
- **A declined or withdrawn `independent_preserved` child now grounds the master abort** without being touched (R5-F02).
- **`checker_rejected_seal` is honestly hard-unavailable.** Every abort is version-bound (R5-F03).
- **Pinned attesters now carry an authenticated identity.** FND-02 is fail-closed, and an empty pinned set is refused by the database (R5-F04).
- **The undefined "persistently" condition is gone** (R5-F05).
- **The precision items are fixed** (R5-F06).

No previously closed safety property regresses (§6).

The pack is still not acceptable, for one MEDIUM defect in the new mechanism:

- **R6-F01 (MEDIUM).** The pack says the pre-seal-only converse ("never once the master is `closure_sealed`") and "no partial family recovery" are **structurally enforced in the database**. They are not.
  - The target-scoped `CHECK` and `trg_acc1_recovery_scope` compare values the caller writes into `closure_recovery` (`from_status`, `abort_target_from_status`, `target_version_approved`, the returned set, `change_request_id`). No database rule ties them to the account rows actually transitioned.
  - A recovery set that says `'closing'` for a sealed master passes. So does a full recovery row set whose member rows were never transitioned, and one reusing an older applied abort request.
  - T-279 asserts detection that the specified trigger cannot perform.

Two further items, LOW (R6-F02) and INFO (R6-F03), complete the set. **No new human design decision is needed.**

## 5. R5-F01 … R5-F06 disposition

| Finding | Sev | Disposition | Basis (v0.6 text) |
|---|---|---|---|
| **R5-F01** Pre-seal return unreachable in a master family after any member sealed | MEDIUM | **SUPERSEDED BY NEW FINDING — R6-F01** (with R6-F02). **The reported reachability defect is closed** | ACC-R5-HD-01 is applied consistently (01 ACC-REQ-045/057, §7.3, §7.4 step 3; 02 §7.7 1b, item 3; 03 §5b; 04 §2.1.1; 05 §2.8, 5k; 06 rule 8, §1.1; 09; 13 R-9; T-265, T-276…T-283). The per-row `CHECK` is replaced by `CHECK (… OR abort_target_from_status = 'closing')`. `closure_recovery` gains `abort_target_type`/`_id`/`_from_status`. A deferred `trg_acc1_recovery_scope` enforces one target and the exact family set. The master's own final approval and a master-directed child's declined seal are now returnable (T-276…T-278), and the property alphabet includes reject and withdraw (T-283). **But** the new structural enforcement rests on caller-written columns → R6-F01. The statement order needed by the immediate triggers is unspecified → R6-F02 |
| **R5-F02** Declined or withdrawn `independent_preserved` child deadlocks the family | MEDIUM | **CLOSED IN BLUEPRINT** | Option (a) is applied everywhere (01 ACC-REQ-056, §7.3, §7.4 item 6; 02 §7.7 1b; 04; 05 §2.8 `evidence_ref`/`evidence_owner_target_id`; 06 rule 8; 07; 09; 12 row 41; T-284…T-289). The ground is legal only while that member is `closing` and in **this** family (T-286, T-289). The member is never returned and gets no recovery row (T-287). Its own return follows once the master is no longer `closing` (T-288). Withdrawal works today with no IAM-08 dependency. See §11 |
| **R5-F03** `checker_rejected_seal` not bound to real rejection evidence; abort not version-bound | MEDIUM | **CLOSED IN BLUEPRINT; EXTERNAL GATE REMAINS** (DCR-ACC-IAM-08, dependent on `IAM2-FIND-002`). Residual normative precision → R6-F03(a) | Route 1: new `DEP-IAM-SEAL-REJECTION-EVIDENCE`, **hard-unsatisfied** in the production composition root (01 §4.5; 02 §1, §2 A2, §7.7; 09; 14; T-290). A local `requested`/`expired`/`cancelled` status is never evidence (T-290 source guard, T-291, T-292). DCR-ACC-IAM-08 names every required binding (§12). Version binding is added to the payload (04 §2.1.1) and re-checked at A4 **before** mutation (02 §2 A4, §7.7 item 2). `target_version_approved` is recorded, and T-295…T-297 cover it. See §10 and §12 |
| **R5-F04** Attester identity only a label; FND-02 not fail-closed; empty pinned set vacuous | LOW | **CLOSED IN BLUEPRINT; EXTERNAL GATE REMAINS** (DCR-ACC-FND-02). Residual wording → R6-F03(c) | The pin, readiness and attestation rows carry `authenticated_service_identity` + contract id/version, and `binding_ok` compares all of them (05 §2.6, §2.7, §2.9; `trg_acc1_attestation_bind`). FND-02 is **ACC-REAL-USE** (17 §1, §2, summary), with `PEER_NOT_AUTHENTICATED` in the production root (01 §4.5; 08; 09; 14; T-304). The empty set is refused by `pinned_required_attester_count >= 1` plus `trg_acc1_seal` count, list and hash equality, and completion refuses an empty set (T-298, T-299). See §14 and §15 |
| **R5-F05** "Persistently" undefined | LOW | **CLOSED IN BLUEPRINT** | Option (ii) is applied in every file (grep for "persisten"/"exhaust" finds only the withdrawal statements). T-255 is rewritten. See §16 |
| **R5-F06** Precision and record accuracy | INFO | **CLOSED IN BLUEPRINT** | (1) The 07 §2 rows carry the asserted-actor qualifier. (2) 02 §0 is reconciled. (3) Timestamps are recorded prospectively and the new ones are plausible (§3). (4) The trivial-withdrawal-evidence statement appears in 01, 02, 03, 06 and T-264 |

## 6. Regression check

| Item | Result |
|---|---|
| **R3-F02** readiness pinning | **Not regressed.** The sequence was re-run: A approved, then a posting ⇒ apply watermark ≠ A ⇒ `ACC1_CLOSURE_NOT_READY`. B before the seal ⇒ A is not latest ⇒ seal refused. B after the seal ⇒ insert refused (`trg_acc1_readiness_insert`). An attestation against B ⇒ `preseal_watermark_ref` ≠ the pin ⇒ `binding_ok = false`. Completion compares against the pin only (05 §2.9, §5). The new identity columns only add conditions |
| No post-seal readiness substitution | **Holds** (insert trigger requires `closing` at the cycle and initiation) |
| Ordinary re-attestation | Does **not** change the family hash (immutable seal facts only, 05 §2.10) or the seal pin. It **cures** expiry and transient blocks (latest-row rule; T-250…T-252) |
| Pinned attester removed from configuration | **Still required.** Its pin row stays, and collection from it records `unavailable` (T-253, T-300) |
| New attester after the seal | **Not retroactively required** (T-254) |
| **R3-F01** master/default invariant | **Holds.** `trg_acc1_master_default_invariant` (deferred) is unchanged. `trg_acc1_default_protected` is unchanged. The default is returned only with its master, and closes only in the family completion. The `CHECK` "default in a closure state ⇒ `closure_family_id` set" is unchanged. **No ACTIVE master with a CLOSED default** is representable. See §9 for the four-member abort |
| Atomic family completion | **Unchanged.** One transaction closes the master-directed children, the default and the master (01 §7.4 step 4; 02 §7.6) |
| Atomic family abort | **Unchanged in intent**, now target-scoped. Its DB-level atomicity claim is weaker than stated → R6-F01 |
| Default never independently closes or reopens | **Holds** (`ACC1_DEFAULT_SUBACCOUNT_PROTECTED`; trigger unchanged) |
| **Dependency evidence (R3-F03, ACC-R3-HD-03)** | **Not regressed.** No configuration string or Boolean satisfies `DEP-IAM-ACTOR-BINDING`, `-ENTITLEMENT`, `-SCOPED-CREDENTIAL`, `DEP-CLT-READ-SCOPE`, `DEP-LED-CLOSURE-CONTRACT`, `DEP-FREEZE-GOVERNANCE`, `DEP-PUBLIC-PERIMETER` or the new `DEP-IAM-SEAL-REJECTION-EVIDENCE` (01 §4.5; 05 §8 adds that no configuration value is ever written as an `authenticated_service_identity`). Governance-only dependencies remain hard-unsatisfied |
| CFG-01 sole `ENVIRONMENT_AVAILABILITY` authority; no environment-name branching | **Holds** (01 §4.5, §12; 0 added environment-name lines) |
| R3-F04 actor provenance; R3-F06 maker-only initiation; R3-F07 `clock_timestamp()`/CDA-1; R2-F03/F05/F06/F07/F08; RF-04/06/08/10/11; default not a fallback; composite ownership | **Not regressed** |

## 7. New findings

Severity uses HIGH / MEDIUM / LOW / INFO. "Blocking" means blocking **acceptance of the pack**.

### ACC-01-R6-F01 — MEDIUM — `closure_recovery` facts are caller-written and not bound by the database to the transitioned account rows, so the pre-seal converse and "no partial family recovery" are not structurally enforced as claimed

**Evidence:**

1. **What the pack claims is structural.**
   - 02 §7.7 1b says: "The target-scoped `CHECK` on `closure_recovery` and `trg_acc1_recovery_scope` … make both grounds **structurally impossible** once the abort target's `from_status = 'closure_sealed'`".
   - 05 §7 item 5k: "never once the target has reached `closure_sealed` (enforced by the target-scoped `CHECK` … and by `trg_acc1_recovery_scope`)".
   - 05 §2.8: "there is **no partial family recovery**".
   - 01 §7.3 says the same.
2. **What the specified rules actually compare.**
   - The `CHECK` tests `abort_target_from_status`, a column the application writes.
   - `trg_acc1_recovery_scope` (05 §5) checks only relations **among `closure_recovery` rows and `closure_family_member`**:
     - (1) one shared `abort_target_id`/`_type`/`_from_status`/`reason_code`, and one target row;
     - (2) the target row's `from_status` equals `abort_target_from_status` (two caller-written columns);
     - (3) the set of `target_id`s equals the family's master, default and master-directed members;
     - (4) the `closure_family` row moves `open → aborted`;
     - (5) the `CHECK`, restated.
   - Nothing compares a recovery row with the account row it describes: not its pre-transition `status`, `version`, `closure_cycle` or `closure_seal_version`, and not whether that row actually transitioned in this transaction.
   - Unlike `closure_readiness` (`target_version_observed`, `closure_family_id` "set by the trigger … never caller-supplied", 05 §2.6) and `closure_attestation` (`binding_ok` etc. computed by `trg_acc1_attestation_bind`), `closure_recovery` has **no stamping or binding trigger**.
3. **Attacks this admits at the DB level** (writes as `role_acc1_runtime`, which holds `INSERT` on `closure_recovery` and the status/closure columns; equivalently, a defective apply path):
   - **(a) Converse bypass.** The master is `closure_sealed`. Write a complete master-family recovery set with `reason_code = closure_initiation_withdrawn`, `from_status = 'closing'` on the master row and `abort_target_from_status = 'closing'` on every row. Then update the master and members to the projection with cause `closure_abort`.
     - The `CHECK` passes, and (1)–(5) pass.
     - `trg_acc1_status_transition` allows `closure_sealed →` projection under any applied `abort_closure` cause.
     - `trg_acc1_closure_barrier` sees "a `closure_recovery` row written in the same transaction".
     - `account_status_history` records the true `from_status = closure_sealed`, but nothing compares it with the recovery row.
     - This directly contradicts ACC-R5-HD-01's converse ("Once `master.status = closure_sealed`, the pre-seal rejection/withdrawal grounds are no longer legal").
     - **T-279** asserts that such a forged set "is rejected by `trg_acc1_recovery_scope` (target row's `from_status` ≠ recorded target status)". The trigger as specified has no "recorded target status" to compare against. T-279 therefore tests a behaviour that no specified trigger provides.
   - **(b) Partial recovery in account state.** Write the exact family recovery row set but transition only the master and the default, leaving master-directed child C `closure_sealed` with `closure_family_id` pointing at the now-`aborted` family.
     - (1)–(5) pass, because they inspect rows, not transitions.
     - `trg_acc1_closure_family` has no rule for a master-directed child under an operational master whose family is `aborted`.
     - `trg_acc1_master_default_invariant` holds, and R-8 does not check it.
     - C is then stranded. It cannot complete (it is a family member), cannot abort alone (`ACC1_CLOSURE_FAMILY_MEMBER`), and cannot be classified by a new master initiation (`independent_preserved` requires `closure_family_id IS NULL`).
     - This is the safe direction (barrier still true), but it is exactly the "partial family recovery" the pack says cannot commit.
   - **(c) Replay / wrong request.**
     - `trg_acc1_status_transition` requires only that the cause reference "is an applied `abort_closure` request". Nothing binds that request to this target, this family or this transaction.
     - `trg_acc1_recovery_scope` evaluates "the rows of each `change_request_id` written in the transaction". Rows naming an **older**, already-applied abort request, or an abort request whose payload targets another account, are therefore not refused.
   - **(d) Other caller-written facts.**
     - `target_version_approved`, `closure_cycle_before/after`, `closure_seal_version_at_abort`, `closure_family_id` and the row's `family_role` versus the member's `membership` are not checked by the database. R-9 re-checks only `target_version_approved`, and only detectively.
     - The `rejection_approval_request_id`/`rejection_decision_id` `CHECK` requires only non-NULL values. "No `checker_rejected_seal` row can be written" (05 §2.8) is therefore an **application** property (the hard-unsatisfied dependency), not a DB property as worded.
4. **Detective control does not cover it.** R-9 checks that the target row "has `from_status = 'closing'`". It does not compare `from_status` with the history row of the same `cause_ref`, so the forged set in (a) also passes reconciliation.
5. **Why MEDIUM and blocking.**
   - The pack's standard, set by R3-F02 and restated for R5-F04 ("DB enforcement, not merely application validation"), is that evidence fields the controls depend on are stamped or verified by the database.
   - The one DB rule that distinguishes a pre-seal family return from a sealed-master return is built on a self-declared column. A test in the pack asserts otherwise.
   - Direct safety impact is bounded: every abort is maker-checker; a sealed family can already be aborted on an evidence-conditioned ground; (b) fails in the barred direction.
   - That is why this is MEDIUM, not HIGH.

**Affected sections:** 05 §2.8 (`from_status`, `abort_target_*`, `target_version_approved`, `rejection_*`, and the paragraph after the `CHECK`), §5 (`trg_acc1_recovery_scope`, `trg_acc1_closure_barrier`, `trg_acc1_status_transition`), 5k, 5l; 02 §7.7 1b (last bullet), item 3; 01 §7.3, §7.4 step 5; 06 §1.1 abort row, §5 "Recovery"; 13 R-9; 10 T-265(a), T-279, T-280, T-281, T-282.

**Required correction:**

1. **Bind every `closure_recovery` row to the account row it describes, in the database**, in the style of `trg_acc1_readiness_insert`/`trg_acc1_attestation_bind`. Either:
   - a `BEFORE INSERT` trigger that locks the target row and **stamps** `from_status`, `closure_cycle_before`, `closure_seal_version_at_abort`, `closure_family_id` and the pre-abort `version` from it. This requires the recovery row to be inserted **before** that account row's update — see R6-F02; **or**
   - checks in the deferred `trg_acc1_recovery_scope` that verify each row against the `account_status_history` row written in the same transaction with `cause_type = 'closure_abort'` and `cause_ref = change_request_id`: equal `from_status`, `version_after = target_version_approved + 1`, and matching cycle and seal version.
2. **Require a bijection at commit.** Every recovery row has exactly one `closure_abort` status transition of its target in this transaction under that `change_request_id`. Every `closure_abort` transition has exactly one recovery row. For a master abort, every master-directed member of the family is therefore actually transitioned, and no member keeps a `closure_family_id` of an `aborted` family (add this to `trg_acc1_closure_family` or R-8 as well).
3. **Bind the abort request.** The named `abort_closure` request transitions `requested → applied` **in this transaction**, never earlier. Its stored payload's target equals `abort_target_id`, and its `reason_code` equals the rows'. Constrain the `trg_acc1_status_transition` cause check the same way.
4. Verify each row's `family_role` against `closure_family_member.membership`, and `abort_target_from_status` against the target's own stamped `from_status`.
5. Re-word 05 §2.8 so the `rejection_*` `CHECK` is described as shape-only and the "cannot be written" property is attributed to the hard-unsatisfied dependency. Or add a DB-level refusal that is actually structural.
6. Align R-9 (compare `from_status` with the same-cause history row), T-279 (state which mechanism rejects the forged `'closing'` claim), T-280…T-282 and 06 §5.
7. **Tests:** a raw-DB forged set claiming `'closing'` for a sealed master; a full recovery set with one member not transitioned; rows naming an older applied `abort_closure`; rows naming an `abort_closure` for another target; a wrong `family_role`; an old cycle. Each must be refused **at commit** with application validation bypassed (test-only owner role, as T-298).

**Implementation impact:** phase 1 (a `closure_recovery` binding trigger, `trg_acc1_recovery_scope`, the `trg_acc1_status_transition` cause binding, `trg_acc1_closure_family`/R-8); phase 5 (statement order of the abort apply); phase 7 (R-9).

**Human decision required: NO.** This implements ACC-R5-HD-01 and ACC-R3-HD-01 item 8 as written. No approved text changes.

### ACC-01-R6-F02 — LOW — The statement order that the immediate (non-deferred) triggers require inside the family-abort transaction is unspecified, and the pack's narrative order contradicts them

**Evidence:**

1. **Deferred vs immediate.** Only `trg_acc1_closure_family`, `trg_acc1_master_default_invariant`, `trg_acc1_recovery_scope` and the restriction-cancel check are declared deferred (05 §5). `trg_acc1_status_transition` is `BEFORE UPDATE OF status`. `trg_acc1_closure_barrier` and `trg_acc1_default_protected` are given no timing. Row `CHECK`s cannot be deferred in PostgreSQL.
2. **Contradiction 1 — applied request.** `trg_acc1_status_transition` lets `closing`/`closure_sealed` leave to a projection only when "the cause reference is an **applied** `abort_closure` request". But 02 §2 A4 orders the transaction "perform the mutation; write status history; **set request `applied`**". Evaluated immediately, the status update is refused.
3. **Contradiction 2 — recovery row.** `trg_acc1_closure_barrier` allows `true → false` only with "a `closure_recovery` row written in the same transaction". But 02 §7.7 item 3 and 01 §7.3 order it "… clear `closure_barrier` …; recompute the stored status …; write history and a `closure_recovery` row per returned member". Evaluated immediately, the barrier clear on a sealed member is refused.
4. **Unspecified check.** `trg_acc1_default_protected` ("may leave `closing`/`closure_sealed` … only together with its master in the same family abort") has no stated way to see "together" at row time.
5. **Row `CHECK`s.** `status`, `closure_barrier`, `closure_seal_pin_id` and `closure_family_id` must change in **one** `UPDATE` per row (the `CHECK`s tie them together). The narrative lists them as separate steps.
6. **Reconstruction.** For the attack case (master `closing`, default `closure_sealed`, child A `closure_sealed`, child B `closing`), the intended result is reachable and coherent **if** the order is:
   - lock the master, then children ascending;
   - request → `applied`;
   - insert the four recovery rows (stamped, R6-F01);
   - update the master;
   - update the default, A and B, each in one statement;
   - `closure_family` → `aborted`;
   - audit;
   - commit, where the deferred `trg_acc1_recovery_scope`, `trg_acc1_closure_family` and `trg_acc1_master_default_invariant` all pass.

   With the documented order, an implementer following the text either fails or invents unreviewed deferrals. No intermediate state is externally visible, because the whole thing is one transaction.

**Affected sections:** 02 §2 A4, §7.7 item 3; 01 §7.3 "In one transaction"; 05 §5 (`trg_acc1_status_transition`, `trg_acc1_closure_barrier`, `trg_acc1_default_protected` timing); 10 T-281.

**Required correction:** state the normative statement order of the abort (and seal) transaction. Alternatively, declare each cross-row check (applied cause request, recovery row present, default-with-master) a `DEFERRABLE INITIALLY DEFERRED` constraint trigger and say so. Then add a DB test that drives the exact four-member case above to commit, and one that shows each out-of-order statement is refused.

**Implementation impact:** phase 1 trigger timing; phase 5 apply order. **Human decision required: NO.**

### ACC-01-R6-F03 — INFO — Precision

1. **(a) Rejection-citation cycle binding appears only in a test.**
   - T-266 refuses a cited `seal_closure` "that does not belong to the cited owner at its current cycle".
   - The normative texts (01 §7.3, 02 §7.7 1b, 04 §2.1.1, 05 §2.8) say only "a master-directed member of the same family" and "the cited member has no applied seal at its current cycle".
   - Read literally, that admits a rejection from an **earlier, aborted family generation** of the same member, which also has no applied seal at the new cycle.
   - State it normatively, and in DCR-ACC-IAM-08's consumer rule:
     - the cited request's stored payload `closure_cycle` equals the owner's current cycle;
     - its initiation id equals the current `closure_family_id` (master-directed member) or the member's `independent_initiation_id`.
   - It is hard-unavailable today, so this must be fixed before DCR-ACC-IAM-08 lifts the gate.
2. **(b) R-6** (13 §1) still says "per **configured** attester". It should say "per **pinned** required attester" (R4-F01, 05 §7 item 5i). Otherwise LED-01/REC-01 replay flags false breaks after an attester is added, and skips a pinned attester that was removed.
3. **(c) 01 §4.5 L173** still says a configured endpoint "satisfies every runtime dependency exactly as the real peer would", in the present tense, immediately before the R5 paragraph that makes this impossible (L175). Mark L173 as historical or re-word it. 14 L35 is consistent only because L37 follows it.
4. **(d) Pin-readiness inserts are not restricted to the sealing transaction.** `closure_seal_pin_readiness` accepts later `INSERT`s (append-only forbids only `UPDATE`/`DELETE`). A later row fails **closed**: completion refuses because the count differs from `pinned_required_attester_count`, and R-10 detects it. Still, bind the insert to the pin's sealing transaction, as the pin itself is.
5. **(e) Fingerprint in SQL.** `trg_acc1_seal` "recomputed `fingerprint`" requires reproducing `@aix/foundation` canonicalisation in SQL. Element-by-element equality with the stored payload's list, plus equality of the stored `required_attester_set_hash` strings, already enforces the property. State which is normative.

**Human decision required: NO.**

**Totals (new):** MEDIUM 1, LOW 1, INFO 1.

## 8. Recovery-scope adjudication (R5-F01 mechanism)

| Question | Result |
|---|---|
| Can the database distinguish (1) independent recovery, (2) master-family recovery, (3) the target row, (4) returned non-target rows? | **Yes, by schema:** `abort_target_type ∈ {independent, master}`, `CHECK ((abort_target_type='independent') = (family_role='independent_own_abort'))`, `CHECK ((family_role IN ('master','independent_own_abort')) = (target_id = abort_target_id))` |
| Exactly one abort target, and it is the master (family) | **Yes** (`trg_acc1_recovery_scope` (1), (2)) |
| Target master still `closing` | **Only as recorded.** `abort_target_from_status` is caller-written and not bound to the master's actual pre-transition status → **R6-F01(a)** |
| Master has no successful seal in the current cycle | Follows from `closing` (the only seal is `closing → closure_sealed`; only an abort leaves it, and that bumps the cycle), subject to the same binding gap |
| Returned set = master + default + every master-directed child | **Yes for the row set** ((3)). **Not for the account state** → R6-F01(b) |
| `independent_preserved` excluded | **Yes** ((3); T-287) |
| Returned children belong to this family generation | **Yes** ((3) via `closure_family_member` and `closure_family_id`; (4) `open → aborted` is possible only for the open family; families are never reused, 05 §2.10) |
| Children may be `closing` or `closure_sealed` | **Yes** (`from_status` `CHECK`; non-target rows unconstrained by the pre-seal `CHECK`) |
| No `closed` child returned | **Yes, structurally:** `closed` is terminal in `trg_acc1_status_transition`, and master-directed children close only in the family completion |
| Sealed barriers/pins cleared only inside this transaction | **Yes in intent** (`trg_acc1_closure_barrier` + recovery rows). Weakened by R6-F01(c): the recovery row is not bound to this target or request |
| No partial family recovery can commit | **Not structurally** → R6-F01(b). The application's single transaction (T-281) is sound |
| Raw-DB malformed rows | Shape and mixed-target sets are refused. **Self-consistent false sets are not** → R6-F01 |

## 9. Trigger-interaction adjudication (default sealed, A sealed, B closing, master closing)

- **Reachable and coherent** under the ordering in R6-F02 item 6. Each row satisfies the row `CHECK`s in one `UPDATE`.
- The deferred triggers pass at commit:
  - `trg_acc1_recovery_scope`: four rows, target = the master, set = {M, D, A, B}, family `aborted`.
  - `trg_acc1_closure_family`: no closure-state default; family not `completed`.
  - `trg_acc1_master_default_invariant`: M non-`closed` with exactly one non-`closed` default D.
- **The documented order conflicts with the immediate triggers** (A4 sets the request `applied` after the mutation; 02 §7.7 item 3 writes recovery rows after clearing the barrier), and `trg_acc1_default_protected`'s timing is unspecified → **R6-F02**.
- Deferral is correctly used where the family must be inconsistent mid-transaction: the closure-family, master/default and recovery-scope rules.

## 10. Version-binding adjudication

| Attack | Result |
|---|---|
| Payload contents | The target id and `version`. For a master: the family id and, per returned member, id, `version`, `closure_cycle`, `closure_seal_version` and family role (04 §2.1.1; T-297) |
| Approval → restriction on a child → apply | **Stale.** `trg_acc1_restriction_version` bumps the child `version`, and A4 re-checks it ⇒ `ACC1_CLOSURE_APPROVAL_STALE` (T-296) |
| Approval → a sealed child's pin or evidence changes in a version-bumping way → apply | **Stale.** The pin changes only by seal or abort, and both bump `version` (and the seal version or cycle). Attestation inserts do not bump `version`, but the cited evidence is re-verified as the latest row at A4 |
| Checked before mutation? | **Yes.** A4 "re-validate … the abort's version binding …, else `ACC1_CLOSURE_APPROVAL_STALE` … perform the mutation" (02 §2). The abort itself bumps `version`, so a post-transition check could never pass |
| DB-level binding | Application re-check under lock, plus detective R-9. No DB check that `target_version_approved` equals the pre-abort `version` → **R6-F01(d)** |

## 11. Independent-child adjudication (R5-F02)

| Attack | Result |
|---|---|
| I `closing`, family partially sealed, I's checker rejects ⇒ master-family abort | Ground admissible **only** against the IAM-08 double (T-284, T-285). **Hard-unavailable today** (T-290). The same case works today via withdrawal (T-286) |
| Master, default and master-directed children return; I unchanged | **Yes** (T-285, T-287) |
| No `closure_recovery` row for I | **Yes** (`trg_acc1_recovery_scope` (3); T-287; R-9) |
| I keeps its own cycle and evidence | **Yes** ("byte-for-byte unchanged", §20 preamble of file 10) |
| I's own recovery after the master abort | **Yes**, as an independent target (T-288). `trg_acc1_closure_family` no longer applies once the master is operational |
| A later family never reuses old membership | **Yes** (05 §2.10, §7 item 5j; T-261) |
| Withdrawal instead of rejection | **Yes**, available today (T-286). Refused if I is not of this family or no longer `closing` (T-286, T-289) |
| Residual deadlock | None found. A sealed I is covered by completion or 1a (T-259); a closing undrained I by 1a. The master cannot seal while I is not `closed`, so the pre-seal ground always has a `closing` master |

## 12. IAM rejection-evidence adjudication (R5-F03)

- **`checker_rejected_seal` is HARD-UNAVAILABLE today.** Submit and apply refuse `ACC1_DEPENDENCY_NOT_SATISFIED`, `SEAM_ABSENT`, in every environment (01 §4.5; 02 §7.7; T-290).
- **It is not satisfiable by:** ACC request status (`requested`, `expired`, `cancelled`), timeout, never-reviewed, IAM-02 expiry, approved-then-rolled-back (decision `approve`), a local Boolean or a configuration string (T-290 source guard, T-291, T-292; 05 §8).
- **DCR-ACC-IAM-08 binds real owner evidence:** approval request id, entity type/id (= the seal change request), `decision = rejected`, `decision_id`, the rejecting checker verified by IAM-02 under actor-binding provenance (never body- or ACC-01-supplied), policy, IAM-02 decision sequence/time, and a decided payload hash equal to the stored request hash. It must be retrievable after local expiry or cancellation. It names `IAM2-FIND-002` as a precondition.
- **Current IAM-02 does not satisfy it** (§2: no read route exists).
- **Master-directed child rejection:**
  - bound to that child's request (`entity_id` = its `seal_closure`; T-294);
  - the child must be a master-directed member of **this** family (T-266, T-282);
  - a rejection superseded by a later seal is refused (T-282);
  - another family's or an unrelated account's rejection is refused (T-266).
  - **Old cycle / prior aborted generation:** refused by T-266 ("at its current cycle"), but the **normative text does not say so** → R6-F03(a).

## 13. Withdrawal adjudication (`closure_initiation_withdrawn`)

| Property | Result |
|---|---|
| Available without pretending IAM rejected | **Yes.** It is a separate code with no IAM-08 dependency (01 §4.5 operation table) |
| Master family: targets the master's initiation (= `closure_family_id`) | **Yes** (01 §7.3; 02 §7.7 1b) |
| Maker-checker | **Yes** (`close_abort` approval-gated; T-267) |
| Version-bound | **Yes** (§10) |
| Family-bound | **Yes** (family id and exact returned set in the payload) |
| Cycle-bound | **Yes** (initiation id at the current cycle; T-266) |
| Pre-master-seal only | **Yes** in the application (T-279). At the DB level, only as recorded → R6-F01(a) |
| Independent target: same rules | **Yes** (T-264, T-265(a)) |
| Sealed master cannot use it | **Refused by application and API** (T-279). Not structurally refused by the DB as claimed → R6-F01 |
| Evidence honesty | Stated plainly as trivially met; the control is maker-checker, binding and the Critical audit (R5-F06.4) |

## 14. Pinned-attester-identity adjudication (R5-F04)

- **Pinned fields:** `attester_module`, `authenticated_service_identity` (from the authenticated channel, never the body, a URL or configuration), `attester_contract_id`, `attester_contract_version`, `readiness_id`, readiness watermark and payload hash, and at pin level `pinned_required_attester_count` and `required_attester_set_hash` (05 §2.9).
- **Trust boundary:** the channel-authenticated service identity. Interchangeable instances that share an identity are explicitly the boundary. **This is the actual authenticated boundary.**

| Case | Result |
|---|---|
| 1. Endpoint A → B, **same** identity and contract | **Binds and counts** — by design (05 §2.7; T-301) |
| 2. B with a **different** identity | `binding_ok = false`, never counts (T-302) |
| 3. Same module label, different contract (id or version) | `binding_ok = false`. The row is `attester_contract_fault` evidence (T-301, T-303) |
| 4. Same base URL, different authenticated identity | `binding_ok = false` (identity is compared, not the URL; T-302) |
| Unauthenticated response | Recorded only as `unavailable` with NULL identity (05 §2.7) |
| Completion compares identity, not only the module | **Yes.** Every counting latest row's `binding_ok` includes identity and contract equality with the pin row (`trg_acc1_seal`, `trg_acc1_attestation_bind`) |

**DCR-ACC-FND-02:** **ACC-REAL-USE** (17). Until it exists, the production composition root has no identity source, and every runtime `DEP-*` is hard-unsatisfied with `PEER_NOT_AUTHENTICATED`. `provider = real` plus a responding endpoint never satisfies a dependency, and no unauthenticated arbitrary URL can (T-304). Residual wording → R6-F03(c).

## 15. Empty-attester-set adjudication (raw DB)

| Attack | Result |
|---|---|
| Seal with zero `closure_seal_pin_readiness` rows | **Refused** — `CHECK (pinned_required_attester_count >= 1)` plus `trg_acc1_seal` count equality (T-298) |
| Approved list/hash of 2, DB rows 1 | **Refused** — element-by-element equality with the stored approved payload list (T-299) |
| Hash/list mismatch | **Refused** — `required_attester_set_hash` equality of payload and pin (T-299) |
| Enforcement level | **Database** (tested with application validation bypassed, T-298) |
| Completion of an empty set | **Never vacuous** — zero rows, or count ≠ `pinned_required_attester_count`, refuses (05 §5) |
| Residual | A later extra pin-readiness insert fails closed → R6-F03(d) |

## 16. `family_completion_unattainable` adjudication (R5-F05)

- **Rule:** the **latest** attestation of a **pinned** required attester, of the master or a master-directed member, at its current seal version and bound to its current pin, is `blocked` or `unavailable`.
- **No undefined terms:** no "persistently", retry count, N attempts or T minutes. Every v0.6 file agrees (01, 02, 03, 04, 06, 09, 11, 12, 14, README; T-255, T-305).
- **Stale `clear`:** a stale `clear` row alone does **not** ground an abort; it is re-collected. A latest `blocked`/`unavailable` row does.
- **Misuse control:** maker-checker, bound evidence, version/family binding and the Critical audit.
- **Redundancy with `postseal_attestation_blocked`/`_unavailable`:** explicitly the **same predicate**. The difference is scope only: master-only, family-scoped label, never an `independent_preserved` member. It is stated as non-stricter (01 §7.3; 02 §7.7 1a; T-305). **Precise and non-contradictory, so acceptable.**

## 17. Remaining external gates (correctly carried; none is claimed closed)

| Gate | Status |
|---|---|
| **RF-01** IAM-02 entitlement / actor binding | **EXTERNAL GATE REMAINS** (DCR-ACC-IAM-02b/c/-03/-04/-06/-07; `IAM2-FIND-002` OPEN) |
| **RF-02** mistaken-creation / closability | **EXTERNAL GATE REMAINS** (`DEP-LED-CLOSURE-CONTRACT`; no LED-01 service exists) |
| **RF-05** least-privilege credentials | **EXTERNAL GATE REMAINS** (DCR-ACC-CLT-03, DCR-ACC-IAM-05) |
| **RF-09** freeze ownership | **EXTERNAL GATE REMAINS** (`DEP-FREEZE-GOVERNANCE` hard-unsatisfied; DCR-ACC-GOV-05) |
| **DCR-ACC-IAM-07** maker-initiation seam | Open, ACC-REAL-USE |
| **DCR-ACC-IAM-08** seal-rejection outcome seam | Open (new), ACC-REAL-USE; `checker_rejected_seal` hard-unavailable |
| **DCR-ACC-FND-02** authenticated channel | Open, **ACC-REAL-USE** (every runtime `DEP-*`) |
| LED-01 commit-order property | DCR-ACC-LED-01c (v). Proven only by LED-01's reviewed implementation |
| Consumer barrier/drain adoption | DCR-ACC-LED-01b/-01e, CONS-01, CFG-01 |
| CFG environment availability | DCR-ACC-CFG-02; CFG-01 is the sole authority |
| `A2-Q1` / `A2-Q2` | Client-money go-live (HD-7 PENDING) |
| `DEP-PUBLIC-PERIMETER` | `FND-FIND-001` OPEN; hard-unsatisfied |

No external module, master or register is claimed changed (17 preamble; diff scope §1).

## 18. Task / conductor consequence

- **`task.json` is not modified by this review.** State `PLANNING`, `planning = 6` (a legal human-authorised over-limit entry, §3), `acceptanceStatus = NOT_ACCEPTED`.
- **`PLAN_READY` is not set.** No implementation eligibility is created.
- **REMEDIATE ⇒ do not start v0.7 in this state.**
  - The current state is `PLANNING` at `planning = 6`.
  - `PLANNING → PLANNING` is illegal.
  - `PLANNING → PLAN_READY → PLANNING` would redirect to `HUMAN_DECISION_REQUIRED` (limit 3).
  - The only route to a further planning turn is `PLANNING → HUMAN_DECISION_REQUIRED` (ungated, planning stays 6) → `resolve_human_decision` → `PLANNING`, with **`planning` 6 → 7** (a further human-authorised over-limit entry).
- **New human DESIGN decision required: NO.** R6-F01…F03 are technical corrections within ACC-R3-HD-01, ACC-R4-HD-01 and ACC-R5-HD-01. The conductor still needs the human `resolve_human_decision` checkpoint to authorise the planning turn. That is a procedural approval, not a design decision.
- **The next checkpoint should transcribe this review into `findingsSummary`** (convention: INFO not counted):
  - R5-F02, R5-F05 and R5-F06 closed.
  - R5-F03 and R5-F04 closed in the blueprint, with their external gates carried (DCR-ACC-IAM-08, DCR-ACC-FND-02).
  - R5-F01 superseded by R6-F01/R6-F02.
  - R6-F01 (MEDIUM) and R6-F02 (LOW) open; R6-F03 INFO.
  - RF-01, RF-02, RF-05 and RF-09 remain as external gates.
- **Not ESCALATE:** these are design corrections, not reviewer or model capacity limits.
- **Not HUMAN_DECISION:** no approved text is in conflict.
- **If a future re-review returns ACCEPT:** that is blueprint/architecture acceptance only. Implementation would still need the human/conductor plan-approval checkpoint and the integration decision.

## 19. What this review does not do

It does not:

- modify v0.6 (or v0.1…v0.5), `task.json`, any master or register (`OPEN_FINDINGS`, `DECISION_LOG`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`), `platform/**`, the conductor or `main`;
- create `06-acceptance.md`;
- take any human decision;
- start remediation;
- merge.

**Implementation is not authorised.**
