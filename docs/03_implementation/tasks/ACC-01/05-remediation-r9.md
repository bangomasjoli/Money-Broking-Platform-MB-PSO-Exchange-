# 05 Remediation record (round 9, under procedural human-decision approval) — ACC-01: Account Structure

- **Task ID:** ACC-01 (planning task — blueprint pack, **documentation only**)
- **Author:** blueprint remediation author / governance recorder / claude-sonnet-5-5, on the instruction of the human (Aiman)
- **Review remediated:** [`04-review-r9.md`](04-review-r9.md) — v0.9 at `e506e69`, separate-context review, verdict **REMEDIATE**. Round-9 review commit: `bc87a3b661551e3a6694d142bd53258a0e1b4483`
- **Checkpoint record:** [`06-human-decision-r9.md`](06-human-decision-r9.md). Round-9 checkpoint commit: `8f93da675b643c5a3a17ff00d2506d24cbe21e32`. That file correctly records that **no** human approval had been received when it was written; it is **not modified** by this remediation.
- **Human approval, given AFTER that checkpoint:** "approve ACC R9 procedural continuation" — the procedural approval `06-human-decision-r9.md` §4–§5 said was still outstanding. The time at which the human gave it is not known to this session and is not invented.
- **Output:** `docs/02_modules/ACC-01/blueprint/v0.10/` (v0.1 … v0.9 are **unmodified** historical reviewed evidence)
- **Status of v0.10:** **REMEDIATED / AWAITING RE-REVIEW.** Nothing is accepted. **Implementation is not authorised.** No application code, no migration and no test was written or changed. **No other module changed.**
- **Findings status — not claimed closed.** This record does **not** claim that ACC-01-R9-F01 or ACC-01-R9-F02 is closed. It records what v0.10 now specifies. Only an independent separate-context reviewer can close them.
- **Independence caveat:** this remediation was written by the same model family that authored the pack. It is not evidence of correctness. A further **separate-context re-review** (Opus, HIGH) is required before any human acceptance.

## 1. Conductor / approval record

| Item | Value |
|---|---|
| Limit | `maxPlanningRounds` = 3 (`aix-conductor` `config/local.config.json` L82; read-only; not edited) |
| Conductor semantics (re-read from `src/state.ts`, read-only, `aix-conductor` HEAD `00a7bde`, working tree clean) | `PLANNING → PLANNING` is illegal (`TRANSITIONS['PLANNING']` L49). `HUMAN_DECISION_REQUIRED → PLANNING` needs gate `resolve_human_decision` and a non-empty `approvedBy`. Entering `PLANNING` runs `rounds.planning += 1`; `humanAuthorised = (task.state === 'HUMAN_DECISION_REQUIRED')` (L122) skips the over-limit redirect and keeps the real count. `HUMAN_DECISION_REQUIRED` is not a `ROUND_ON_ENTER` key, so `escalation` is consumed only on entry to `ESCALATION_REQUIRED`. The semantics match `06-human-decision-r9.md` §1; no divergence |
| Before (`8f93da6`) | `state` `HUMAN_DECISION_REQUIRED`; `roundCounts.planning` **9**; `escalation` **0**; `acceptanceStatus` `NOT_ACCEPTED`; `PLAN_READY` absent; `validateTaskManifest` → `{"ok":true,"errors":[]}` |
| Transition applied by this remediation | **`HUMAN_DECISION_REQUIRED → PLANNING`** — the equivalent of gate `resolve_human_decision`, `approvedBy` = **AimanRahimi**, authorised by the human's statement "approve ACC R9 procedural continuation" |
| Counters | `planning` **9 → 10** (the real count; not reset; not invented); `escalation` **0 → 0** |
| After (this commit) | `state` **`PLANNING`** (not `PLAN_READY`); `planning` **10**; `architecture`, `review`, `remediation`, `escalation` all 0; `acceptanceStatus` `NOT_ACCEPTED`; `resultingCommit` null; implementation-ineligible; `PLAN_READY` absent |
| What the approval does **not** do | Accept the blueprint, authorise implementation, application code or migrations, set `PLAN_READY`, authorise a merge, close an external gate, create an acceptance record, reinterpret any earlier human design decision |
| Legal alternatives checked and **not** used | `PLANNING → PLANNING` (illegal); `HUMAN_DECISION_REQUIRED → PLAN_READY` (illegal); editing `maxPlanningRounds`; resetting `roundCounts`; incrementing `escalation`; setting `PLAN_READY`; registering ACC-01 in the conductor's runtime store (declined by ACC-R4-HD-02 — `task transition` is therefore not used, and the transition is recorded as a direct governance entry in `task.json`); modifying `aix-conductor` (its working tree is clean, 0 changed files, before and after) |
| `task.json` | `state` `PLANNING`; `planning` 10; `findingsSummary` BLOCKER 0, HIGH 1, MEDIUM 3, LOW 2 with `openFindingIds` RF-01, RF-02, RF-05, RF-09, R9-F01, R9-F02 and `carryForwardIds` RF-01, RF-02, RF-05, RF-09 — **unchanged from the `8f93da6` transcription, pending independent review**; `relevantRecordPaths` gains this record; `updatedAt` = the actual UTC time of this remediation (2026-10-02T14:39:36Z) |
| Validator | `validateTaskManifest` (`aix-conductor` `dist/records.js`, imported read-only): the starting `task.json` (HEAD `8f93da6`) → `{"ok":true,"errors":[]}`; the final `task.json` of this commit → `{"ok":true,"errors":[]}` |

R9-F03 is INFO and, under the existing manifest convention (R7-F02, R8-F04), is not counted.

## 2. Why round 9 has no new human design decision

`04-review-r9.md` answers "Human decision required: NO" on every finding (§7) and §22 states: "New human DESIGN decision required: NO. R9-F01…F03 are technical corrections within ACC-R3-HD-01/-02, ACC-R4-HD-01 and ACC-R5-HD-01 as written." This remediation implements them **within** ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02 and ACC-R5-HD-01; none is reinterpreted, narrowed or extended. **ACC-R3-HD-02 (maker-only initiation) is unchanged:** initiation gains a completeness proof and never a checker; the final seal keeps its checker.

**Design choices the author made that the reviewer should attack, stated plainly rather than buried.** None is a human design decision, but each goes beyond the minimum wording of the review:

1. **No abort in the transaction that applied the initiation** (`trg_acc1_status_transition` (1)(c), the guard's abort branch). It is what lets the deferred initiation proof stay true after an early `SET CONSTRAINTS … IMMEDIATE`: I reproduced on PostgreSQL 17.10 that without it an early pass followed by a regress commits an applied initiation over an operational target. A legitimate abort is a separate, later, separately approved transaction, so no approved abort semantics change (ACC-R5-HD-01 target-scoped recovery is untouched; T-422).
2. **Two reverse entry points** (`trg_acc1_initiation_family_scope`, `trg_acc1_initiation_history_scope`) beside the requested `trg_acc1_initiation_apply_complete`, so that — as for the abort (E1–E4) — no direction needs another table to hold a row first. A raw `closure_family` or `closure_initiation` history row with no applied request would otherwise survive.
3. **`trg_acc1_family_member_window`** (immediate): a snapshot row cannot be added once the master has left the operational statuses. It is what keeps the snapshot facts of the proof from changing after an early firing; it is the analogue of `trg_acc1_pin_readiness_window`.
4. **`trg_acc1_restriction_cancel_recheck`** is the name given to the previously unnamed deferred half of R3-F07.2, so that it can be inventoried (R9-F03.3).
5. **`UNIQUE (seal_pin_id, readiness_id)`** on `closure_seal_pin_readiness` (R9-F03.4, "unique `readiness_id` as applicable").

## 3. R9-F01 … R9-F03 → corrected v0.10 sections

| Finding | Sev | v0.10 location | What v0.10 now specifies |
|---|---|---|---|
| **R9-F01** name-resolution hijack by temporary-table shadowing | MEDIUM | 05 §1 rule 8 (`TEMPORARY` deliberately tolerated), **new §1 rule 10**, **new §5.7**, §5 rows for `trg_acc1_restriction_version_*` / `trg_acc1_counter_guard`, §5.0, §5.4 Definition, §6 "Functions", §7 rule 5z, §8; 01 ACC-REQ-064/-065; 10 T-396 (extended), T-369 (extended), **T-401…T-411**; 11; 12 row 56; 14 | **One normative rule, no exception (§5.7 N1–N8):** every ACC-01 function — every `trg_acc1_*` function, the `SECURITY DEFINER` function, every helper/proof procedure — carries `SET search_path = pg_catalog, acc1, pg_temp` (`pg_temp` explicit and **last**) **and** names every `acc1` relation schema-qualified. Both, not either. The function inventory lists every relation each function touches. Temporary relations are attacker-controlled but irrelevant: correctness does **not** depend on revoking `TEMPORARY`, and the tests run with it granted and revoked (T-408). The v0.9 form `pg_catalog, acc1` is withdrawn |
| **R9-F02** maker-only initiation has no completeness proof (option (a)) | LOW | 05 §2.4 / §2.4.2 (lifecycle step 5), **new §5.6.1**, §5.6 order, §5 rows (`trg_acc1_initiation_apply_complete`, `_family_scope`, `_history_scope`, `trg_acc1_family_member_window`, abort-in-initiating-transaction predicate), §5.3, §7 rule 5aa; 01 ACC-REQ-066; 02 §7.1 (e); 04; 06; 09 (`ACC1_CLOSURE_INITIATION_INCOMPLETE`); 10 **T-412…T-423**; 12 row 57 | **A dedicated deferred maker-only initiation completeness proof** (canonical name `trg_acc1_initiation_apply_complete`, request entry I1; plus I2/I3). A request that reaches `requested → applied` cannot commit unless: the request is applied for the right target and result; the target(s) are `closing` (or a valid later state) under it with `close_change_request_id` = this request; the authoritative same-transaction `closure_initiation` history exists with `cause_ref` = this request and `version_after = version_before + 1`; and, for a master, the `closure_family` (id = the request) exists, the master is bound to it, the immutable snapshot exists, `SNAP = HIS = LIVE` (every master-directed member entered under this exact family) and every `independent_preserved` member keeps its approved semantics. Correct under `COMMIT`, `SET CONSTRAINTS … IMMEDIATE`, `SAVEPOINT` and `ROLLBACK TO SAVEPOINT`, including a satisfying transition rolled back after an early pass; a fact-by-fact table shows why no proven fact can regress afterwards |
| **R9-F03.1** invalid status-history trigger DDL | INFO | 05 §5 (`trg_acc1_status_history_ins` / `_upd`); 10 T-424 | `AFTER INSERT` (no `WHEN`) plus `AFTER UPDATE OF status … WHEN (OLD.status IS DISTINCT FROM NEW.status)`, one shared function; `TG_OP` only inside the body |
| **R9-F03.2** restriction no-op bump | INFO | 05 §5 (`trg_acc1_restriction_version_ins` / `_upd`); 10 T-425 | The same split; `SET status = status` causes no touch and no bump; owner-context `updated_at_utc`-only touch stated as harmless |
| **R9-F03.3** deferred clock check outside the timing inventory | INFO | 05 §5 (`trg_acc1_restriction_cancel_recheck`), §5.3; 10 T-426 | Named and inventoried; statement-time check authoritative; deferred recheck best-effort narrowing, **not** "correct whenever it fires"; early `SET CONSTRAINTS` evaluates an earlier clock; normal apply paths issue no `SET CONSTRAINTS` |
| **R9-F03.4** required attesters exactly-once | INFO | 05 §2.4.3, §2.9; 10 T-427 | Non-empty; unique `attester_module`; unique `readiness_id`; duplicate payload element → `ACC1_SEAL_PIN_INVALID`; count equality; payload → DB **and** DB → payload equality; hash equality is evidence only |
| **R9-F03.5** maker-only `CHECK` | INFO | 05 §2.4; 02 §7.1; 01 ACC-REQ-063; 10 T-390, T-391, T-428 | `approval_id IS NULL AND approval_id_source IS NULL AND approver_user_id IS NULL AND approval_policy_id IS NULL` beside the required maker evidence; schema, prose and tests agree |
| **R9-F03.6** T-320 / T-361 wording | INFO | 10 T-320, T-361 (rewritten), T-429 | A raw clear / re-point of a protected column is refused first by `42501` (runtime) or Rule 0 (privileged / owner context); the abort branch is exercised only by a status `UPDATE` without this target's recovery row |

## 4. PostgreSQL behaviour verified for this remediation

The new text depends on PostgreSQL behaviour, so it was verified rather than assumed, on a **disposable PostgreSQL 17.10 scratch cluster** (`miniforge3/envs/aixpg`, a non-superuser owner role and a grantee `role_acc1_runtime`) created in this session's scratch directory, **outside the repository**, and destroyed afterwards. These are probes of a **small model**, not of the future implementation, which does not exist; they show that the mechanisms the blueprint relies on behave as it states.

| Probe | Result |
|---|---|
| Combined `AFTER INSERT OR UPDATE OF status … WHEN (TG_OP = 'INSERT' OR OLD.status …)` | `column "tg_op" does not exist`; without `TG_OP`: "INSERT trigger's WHEN condition cannot reference OLD values" — R9-F03.1 confirmed |
| `AFTER INSERT` plus `AFTER UPDATE OF status … WHEN (OLD.status IS DISTINCT FROM NEW.status)` | Valid DDL. `INSERT` → one firing; `SET status = status` → **none**; real change → one; same-value repeat → none |
| Deferred `AFTER UPDATE OF status` constraint trigger with a `WHEN` over `OLD`/`NEW` | Valid DDL |
| Temporary-shadow bypass, four function forms | Unsafe path + unqualified names: **bypassed** (real `version` stayed 1). Pinned path alone: protected. Qualification alone: protected. Both: protected. `proconfig` renders `{"search_path=pg_catalog, acc1, pg_temp"}` and parses to `[pg_catalog, acc1, pg_temp]` |
| Unqualified `%ROWTYPE` under each form | Unsafe path: bound to the **temporary** table's type. Pinned path or qualified: bound to the `acc1` type |
| Unqualified function call with `pg_temp` listed **first** | Not captured: PostgreSQL does not search `pg_temp` for function names; only `pg_temp.f()` explicitly |
| Completeness proof, model, eight sequences | applied/no-closing `COMMIT` → refused; `SAVEPOINT` + closing + `ROLLBACK TO` → refused; `SET CONSTRAINTS IMMEDIATE` before closing → refused at the `SET`; early pass **inside** a subtransaction then `ROLLBACK TO` → **refused at `COMMIT`** (the event is re-queued); apply inside a rolled-back savepoint → commits with the request back to `requested`; apply + closing, released savepoint → commits; complete + early pass + same-transaction regress → refused by the same-transaction abort predicate |
| Same early-pass-then-regress sequence **with that predicate disabled** | **Commits** an applied request with the account `active` — the reason the predicate exists (T-416 negative control) |

Not verified here, and not claimed: the full ACC-01 trigger set, any real migration, anything against `platform/**`.

## 5. Prior findings — non-regression, external gates

- **R8-F01…F04 closures preserved:** protected-set ownership; two-layer enforcement (no runtime column privilege + the immediate guard on every `INSERT`/`UPDATE`); single version owner; stale-approval refusal; seal stored-payload authority; seal pin only inside its own seal with the orphan-pin deferred proof; maker-only initiation with no checker; final seal with its checker; `xid8` correlation-only; runtime non-ownership (now with `TEMPORARY` explicitly outside the list); pre-allocated audit / result references. Only additions: the abort-branch predicate and the pinned/qualified function rule — both only narrow what is accepted.
- **Human decisions preserved exactly:** ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02, ACC-R5-HD-01 — family semantics, maker-only initiation, authoritative dependency evidence, target-scoped family recovery, final checker before seal, exact readiness-pin semantics, required-attester-set equality, strong attester identity, post-seal renewable attestations, child-before-master sequencing, master-family atomic completion, abort database proof, recovery/history reverse binding, closure barrier semantics. T-431 re-runs them.
- **External gates carried honestly (none closed, none changed):** ACC-01-RF-01, RF-02, RF-05, RF-09; DCR-ACC-IAM-07, -08; DCR-ACC-FND-02; `DEP-IAM-SEAL-REJECTION-EVIDENCE`; LED-01 commit ordering; consumer barrier/drain adoption; CFG-01 environment availability; A2-Q1, A2-Q2; `IAM2-FIND-002`; `FND-FIND-001`. No external module changed and no DCR was added.

## 6. Consistency checks run on v0.10

| Check | Result |
|---|---|
| v0.1 … v0.9 unchanged | `git diff HEAD` over each `blueprint/v0.N` is empty (9 packs), before commit |
| Every `trg_acc1_*` function covered by the new rule | All 36 trigger names in the §5 table are covered by the §5.7 inventory (pairs by base name); `trg_acc1_closure_barrier` is stated as non-existent (folded into the guard in v0.9) |
| ACC relations in the inventory schema-qualified | 0 unqualified relation tokens in the §5.7 inventory column |
| Unsafe active form `search_path = pg_catalog, acc1` | Absent from every normative sentence. The 4 remaining occurrences (10: T-402 lint rule and T-403 negative control; 12: row 56; README) describe the **withdrawn** form |
| No invalid combined `INSERT`/`UPDATE` trigger `WHEN` | `TG_OP` appears only in statements that the combined form is invalid and that the function body may branch on it |
| Maker-only `CHECK` | Includes `approval_id_source IS NULL`; 05 §2.4, 02 §7.1, 01 ACC-REQ-063, T-390/T-391/T-428 agree |
| Deferred clock check inventoried | Named `trg_acc1_restriction_cancel_recheck` in the §5 table and §5.3, described as not "correct whenever it fires" |
| Attester exactly-once, bidirectional | 05 §2.4.3 (and §2.9, T-427) |
| T-320 / T-361 | Both rewritten to name `42501` / Rule 0 as the refusing layer; T-429 discriminates |
| Initiation proof covers `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` | 05 §5.6.1 case table; T-414, T-415, T-423 |
| Test ids | **T-001 … T-431 — 431 rows, contiguous, no duplicates, in order.** v0.9 ended at T-400; **§24 adds T-401 … T-431 (31 tests)**. Only T-320, T-361, T-369, T-390, T-391 and T-396 differ from v0.9 (rewritten or extended in place, ids unchanged) |
| Markdown table structure | After correcting one malformed row found by this check (a missing closing `|` in file 09), no table row in v0.10 has a different column count from its header; v0.9 had none either |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` on the start and the final `task.json` (§1) |
| Files 03, 07, 08, 13, 15, 16 | Differ from v0.9 in the version label only |
| Environment branching | The v0.9 → v0.10 diff adds no environment-name branching (ACC-R2-HD-01…08 unaffected) |
| `git diff` paths | Only the allowed paths changed (§7) |

## 7. Files changed by this remediation

- `docs/02_modules/ACC-01/blueprint/v0.10/**` — new, 18 files
- `docs/02_modules/ACC-01/README.md`
- `docs/03_implementation/tasks/ACC-01/05-remediation-r9.md` — this file
- `docs/03_implementation/tasks/ACC-01/task.json`

## 8. What this record does not do

It does not accept anything, set `PLAN_READY`, create `06-acceptance.md`, authorise implementation, write or change any application code, migration or test, change `platform/**`, IAM-02, CLT-01, LED-01, CFG-01, FND-01, `aix-conductor`, any master, `OPEN_FINDINGS`, `DECISION_LOG`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS` or `main`, modify `04-review-r9.md` or `06-human-decision-r9.md`, modify v0.1 … v0.9, reset any round count, change `maxPlanningRounds`, increment `escalation`, register ACC-01 in the conductor's runtime store, close an external gate, claim R9-F01 or R9-F02 closed, merge, perform the Round-10 review, or reinterpret any prior human decision.

**Implementation is not authorised. The blueprint is not accepted. `PLAN_READY` is absent.**

**Next action:** a fresh separate-context Opus HIGH review of v0.10 (Round 10), but only after the program controller independently verifies the pushed remediation.
