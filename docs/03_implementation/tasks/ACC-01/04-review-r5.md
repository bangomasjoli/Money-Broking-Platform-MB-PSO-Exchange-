# 04 Review (round 5) — ACC-01: Account Structure blueprint pack v0.5

- **Task ID:** ACC-01 (planning task — blueprint pack, no implementation)
- **Reviewer:** independent architecture / compliance reviewer / claude-opus-5-5 / HIGH
- **Pack under review:** `docs/02_modules/ACC-01/blueprint/v0.5/` at `826ab45`. This is the remediation of `04-review-r4.md` under ACC-R4-HD-01 and ACC-R4-HD-02, after the human-decision checkpoint `038628a`.
- **Author of v0.1…v0.5:** blueprint planner / claude-sonnet-5 (per `01-plan.md` and `05-remediation*.md`)
- **Independence:** **separate context.**
  - This review ran in a **new Claude Code session**. It carried no conversation from any author, remediation, review or human-checkpoint session.
  - Everything below was re-derived from the repository: the v0.5 text (all 18 files), the governing decisions and masters, the IAM-02 source, and the actual local `aix-conductor`.
  - `05-remediation-r4.md` was read only as a map of what was claimed. It was **not** used as evidence.
  - The reviewer is the same model as the round-1…4 reviewers, and a different model from the author.
- **Decision:** **REMEDIATE**
- **Implementation authorised:** **No.** Nothing is accepted. No `06-acceptance.md` exists or is created. `task.json` is not modified by this review.

## 1. Baseline verification (all passed)

| Check | Result |
|---|---|
| Worktree | `/Users/AimanRahimi/AIX-worktrees/acc-01` |
| Branch | `module/ACC-01` |
| HEAD | `826ab45` (= `origin/module/ACC-01`) |
| Working tree | clean before this review |
| History | `43f2f34` → `42316fe` (v0.1) → `2e26d13` → `8ff4e9d` (v0.2) → `b5c21bd` → `194aff0` (v0.3) → `3b3a3ee` → `af5d025` (human checkpoint r3) → `a865d63` (v0.4) → `c6957a0` (review 4) → `038628a` (human checkpoint r4) → `826ab45` (v0.5) |
| `main` / `origin/main` | both `43f2f34`. The main worktree (`/Users/AimanRahimi/AIX-Full-Compliance`) is clean. Nothing is merged |
| Diff `43f2f34...HEAD` | **All** files are under `docs/02_modules/ACC-01/**` or `docs/03_implementation/tasks/ACC-01/**`. There is no `platform/**`, no migration, no master and no register change |
| Earlier packs | v0.1…v0.4 are unchanged between `a865d63` and `826ab45` |

## 2. Sources reviewed

- **Decisions:** DEC-011, DEC-013 and DEC-014, as cited by the pack. The human decisions as recorded in `06-human-decision-r3.md` §4, `06-human-decision-r4.md` §4 and v0.5 file 17 §4.
  - ACC-R3-HD-01…03 and ACC-R4-HD-01…02 are treated as approved and binding. They are **not** reinterpreted.
- **Masters (relevant sections):**
  - Workflow Map v1.3 §31 (WF-27 states, including terminal `rejected`; steps 9–10 maker/checker; §31.4 item 9).
  - `docs/OPEN_FINDINGS.md` rows `IAM2-FIND-002`, `IAM2-FIND-003` and `FND-FIND-001` (all OPEN).
- **Task records:** `01-plan.md`, `04-review.md`, `04-review-r2.md` … `04-review-r4.md`, `05-remediation*.md` (map only), `06-human-decision-r3.md`, `06-human-decision-r4.md`, and `task.json` with its diffs at `038628a` and `826ab45`.
- **v0.5:** all 18 files were read. The v0.4 → v0.5 diff was checked line by line for removed controls.
  - Test ids run T-001…T-275, contiguous, with no duplicates.
  - The substance of `trg_acc1_closure_family` and `trg_acc1_master_default_invariant` is unchanged. Only explanatory prose was added.
- **Source inspected read-only:**

| Area | Fact verified |
|---|---|
| IAM-02 `routes/approvals.ts` | `POST /iam2/approvals/:id/reject` (L429–493) **durably records** a rejection: `approval_decision` row `decision = 'reject'`, and `approval_request.status = 'rejected'`. `approver_user_id` is a **body** field (`IAM2-FIND-002`). **No route exposes an approval's outcome to a requesting service** (the only routes are `request`, `approve` and `reject`) |
| IAM-02 `routes/internal.ts` | Two `POST` routes only (`permission/check`, `permission/execute-verify`). Neither returns approval status |
| `platform/services` | No `led1` service exists |
| `aix-conductor` `00a7bde` | Clean and not modified. See §3 |

## 3. Conductor adjudication

Verified by source reading and by **in-memory execution** of `dist/state.js` and `dist/records.js` (built after `src/`). No conductor state was written.

| Item | Result |
|---|---|
| `task.json` at HEAD | `state = PLANNING`, `roundCounts.planning = 5`, `escalation = 0`, `acceptanceStatus = NOT_ACCEPTED`. `validateTaskManifest` → `{"ok":true,"errors":[]}` |
| `maxPlanningRounds` | **3** in `config/local.config.json` and `config/example.config.json` (unchanged) |
| Legality of `planning = 5` | **Legal human-authorised over-limit entry.** Path: `PLANNING(4)` → `HUMAN_DECISION_REQUIRED` (ungated; manifest at `038628a`: state `HUMAN_DECISION_REQUIRED`, planning 4) → `resolve_human_decision` → `PLANNING(5)` (manifest at `826ab45`). `transitionTask` treats a gated exit from `HUMAN_DECISION_REQUIRED` as `humanAuthorised`, so the count records the real value and is not redirected. It is **not** rejected merely for exceeding the limit |
| Counts | No counter was reset. `escalation` stayed 0 through both checkpoints (only `ESCALATION_REQUIRED` consumes it) |
| `PLAN_READY` | Not set. `HUMAN_DECISION_REQUIRED → PLAN_READY` is illegal (`InvalidTransitionError`, re-executed) |
| CLI correction | **Confirmed.** `src/cli.ts` L119 documents `aix-conductor task transition ID STATE --approved-by NAME [--reason TEXT] [--override CODE,...] [--config FILE]`. The handler `taskTransition` (L212–232) loads the runtime record, derives the gate with `approvalGateFor`, needs `--approved-by` and an interactive typed APPROVE, and applies `transitionTask` |
| Why it could not be used | `state/tasks/` holds only `IMP02-MA-HARDEN-001.json` and `PV-20260919T162254Z-001.json`. **There is no `ACC-01.json`**, so `taskTransition` would print `No such task: ACC-01` |

**Re-executed from `planning = 5`:**

- `PLANNING → HUMAN_DECISION_REQUIRED`: planning stays 5.
- `HUMAN_DECISION_REQUIRED → PLANNING` without approval: `ApprovalRequiredError`.
- With `resolve_human_decision`: `PLANNING`, planning **6**, escalation 0.
- `PLANNING → PLAN_READY → PLANNING`: redirected to `HUMAN_DECISION_REQUIRED` (`limitRedirect: maxPlanningRounds`).

**Observation (INFO, R5-F06.3).** `06-human-decision-r4.md` §3 says its timestamps and `task.json`'s are "the true UTC clock time of the recording". This is not accurate:

| Commit | `task.json` `updatedAt` | Actual commit time (UTC) |
|---|---|---|
| `038628a` | `2026-09-28T00:00:00.000Z` | `2026-09-27T18:46:22Z` |
| `826ab45` | `2026-09-28T00:00:01.000Z` | `2026-09-27T19:11:23Z` |

Both values are later than the commits and look like placeholders. This has no effect on conductor legality.

## 4. Verdict

**REMEDIATE.**

v0.5 genuinely fixes the two liveness defects that R4 reported:

- **R4-F01 is fixed.**
  - The family hash now binds only immutable seal facts.
  - Each seal pins its own required attester set.
  - Re-attestation after any seal is ordinary and changes nothing pinned.
  - The stale-attestation deadlock is gone.
- **The R4-F02 mechanism is fixed.**
  - The false "own abort while the master is `closing`" claim is withdrawn.
  - An independent member's blocking evidence can ground the master abort without touching that member.
  - Membership never carries into a later family.
- **Unchanged safety properties** — readiness pinning, the master/default invariant and atomic family completion — are not weakened.

The pack **does not yet correctly implement ACC-R4-HD-01** (R4-F03):

1. **R5-F01 (MEDIUM).** The new pre-seal return is **structurally unreachable inside a master family once any member has sealed**. In the designed sequence, every master-directed child (the default included) is sealed before the master's final approval, so the ground can never be used there.
   - WF-27 `rejected` therefore cannot be represented for the master's own final approval, which is the client-offboarding case WF-27 describes.
   - It also cannot be represented for a master-directed child's rejected seal once a sibling has sealed.
   - The R4-F03 deadlock is reproduced for masters.
   - This needs a narrow human confirmation of ACC-R4-HD-01's scope in a family.
2. **R5-F02 (MEDIUM).** An `independent_preserved` child whose own seal is rejected, or whose initiation is withdrawn, deadlocks the open family. This is the R4-F02 deadlock, reached through the new grounds.
3. **R5-F03 (MEDIUM).** `checker_rejected_seal` does not bind actual rejection evidence, as ACC-R4-HD-01 explicitly requires.
   - Its test is satisfied by a request nobody reviewed.
   - It is also satisfied by one that was **approved** but whose apply rolled back.
   - The abort is also not version-bound, although ACC-REQ-057 says it is.

Two LOW findings (R5-F04, R5-F05) and one INFO (R5-F06) complete the set.

## 5. R4-F01 … R4-F06 disposition

| Finding | Sev | Disposition | Basis (v0.5 text) |
|---|---|---|---|
| **R4-F01** Family completion permanently unattainable after re-attestation | MEDIUM | **CLOSED IN BLUEPRINT** (residual precision → **R5-F05**) | `family_set_hash` binds only `(target_id, membership, closure_family_id, closure_cycle, closure_seal_version, closure_sealed_at_version, seal_pin_id, target_version_approved)` and never an attestation or readiness id (05 §2.10; 02 §7.4 item 1; 04 §2.1.1; T-249). Completion reads the **latest** row per **pinned** attester at the member's current seal version, fresh (05 §5 `trg_acc1_seal`; 02 §7.6; 01 §7.4 step 4; T-250…T-252). The required attester set is `closure_seal_pin_readiness` (05 §2.9, 5i; T-253/T-254). A persistently `blocked`/`unavailable` pinned attester grounds `family_completion_unattainable` (01 §7.3; 02 §7.7 1a; T-255). All three attacks pass (§8). The attestation-driven liveness defect is gone |
| **R4-F02** Independent-child deadlock | MEDIUM | **SUPERSEDED BY NEW FINDING — R5-F02** (the originally reported mechanism is closed) | Option (b) is applied consistently across 01 §7.3/§7.4, 02 §7.7, 04, 05 §2.8/§5, 06 rule 8, 09, 12 row 41, 14 §5 and T-257…T-262. The trigger is unchanged. The false claim is withdrawn. Blocking evidence of an `independent_preserved` member is an admissible master-abort *ground*, with no recovery row for it. A later family never reuses the old membership (05 §2.10, 5j). **But** a drained independent child whose seal is declined has no blocking evidence, so the "no reachable state without an exit" requirement of R4-F02 is still not met → R5-F02 |
| **R4-F03** Drained target stuck in `closing` | MEDIUM | **SUPERSEDED BY NEW FINDINGS — R5-F01, R5-F03** | The false v0.4 mitigation is withdrawn (07 §4 item 5; 12 row 46; T-270). Both grounds exist and are maker-checker and pre-seal (01 §7.3; 02 §7.7 1b; 05 §2.8 `CHECK`; T-263…T-269). For an **independent target** the return works. **But** the per-row `CHECK` makes both grounds unusable in a master family after any member has sealed (R5-F01). `checker_rejected_seal` proves "not applied", not "rejected", and the abort is not version-bound (R5-F03) |
| **R4-F04** Attester set / peer identity / commit ordering | LOW | **SUPERSEDED BY NEW FINDING — R5-F04.** Parts (a) and (c) are closed. **EXTERNAL GATE REMAINS** (DCR-ACC-FND-02; DCR-ACC-LED-01c (v)) | (a) The pinned set replaces "every configured attester" everywhere (05 §2.9, §5; 02 §7.5–7.6; 04 §2.4; 06 §1.1). (c) Commit ordering is stated as LED-01's declared property, proven only by LED-01's reviewed implementation (01 §4.5; 14 §2; 17 LED-01c (v); T-272). (b) The peer trust anchor is now stated honestly (01 §4.5; 14 §2 checklist item; 17 DCR-ACC-FND-02). **But** FND-02 is classed so that it does not block dependency satisfaction, and the pinned attester identity is a bare module label → R5-F04 |
| **R4-F05** Checkpoint misstated the conductor CLI | LOW | **CLOSED IN BLUEPRINT** (task-record correction) | `06-human-decision-r4.md` §1 accurately states that the CLI exists, that ACC-01 has no runtime record, and that ACC-R4-HD-02 says not to register it mid-task. `06-human-decision-r3.md` (last touched `af5d025`) and `05-remediation-r3.md` (last touched `a865d63`) are unmodified. A new timestamp-accuracy observation is recorded as INFO (R5-F06.3) |
| **R4-F06** Precision and editorial | INFO | **CLOSED IN BLUEPRINT** (residual wording → R5-F06) | ACC-REQ-045 now has 3 cells (checked mechanically). The 07 §4 "entitlement honesty" paragraph and 02 §7.1 item 1 carry the asserted-actor qualifier. OQ-04 is relabelled. 01 §7.4 item 6 and 14 §5 were re-written for R4-F01/F02. 07 §2 rows `close_initiate` and `close_collect_evidence` still say "a real entitlement" without the qualifier |

## 6. Regression check

| Item | Result |
|---|---|
| **R3-F02** readiness pinning | **Not regressed.** Adversarial sequence re-run in §16. The attester-set change keeps one pinned readiness row, watermark and payload hash per attester, and completion compares against the pin per pinned attester |
| **R3-F03** dependency evidence | **Not regressed.** No configuration value is read as evidence (05 §8). Governance-only dependencies are hard-unsatisfied. FND-02 adds a new explicit external dependency (classification defect → R5-F04) |
| **R3-F04** actor provenance | **Not regressed** (02 §0, §1 step 7; 04 §2.1) |
| **R3-F06** maker-only initiation | **Not regressed.** The initiation codes are non-approval and externally gated (DCR-ACC-IAM-07) |
| **R3-F07** precision | **Not regressed.** `clock_timestamp()`, deferred cancel check, CDA-1 discriminator |
| **R3-F01** structural invariant | **Not regressed** (§16) |
| R2-F03 barrier independent / first; R2-F05 credentials; R2-F06 entitlement tests; R2-F07 restriction lifecycle; R2-F08 no environment control; R2-F09 editorial | **Not regressed.** The v0.4 → v0.5 diff adds no environment-name condition (0 added lines match `PRODUCTION`/`DEVELOPMENT`/`UAT`/`DEMO`/`environment ==`). No lock, `CHECK`, deferred trigger or refusal was removed; every removed line is replaced by a rewritten version |
| RF-04, RF-06, RF-08, RF-10, RF-11; default `general` not a fallback; composite ownership; CFG-01 sole `ENVIRONMENT_AVAILABILITY` owner | **Not regressed** |

## 7. New findings

Severity uses HIGH / MEDIUM / LOW / INFO. "Blocking" means blocking **acceptance of the pack**.

### ACC-01-R5-F01 — MEDIUM — The ACC-R4-HD-01 return path is structurally unreachable in a master family once any member has sealed; WF-27 `rejected` cannot be represented for a master's final approval

**Evidence:**

1. **The pre-seal `CHECK` is per recovery row.**
   - `closure_recovery` requires `reason_code NOT IN ('checker_rejected_seal','closure_initiation_withdrawn') OR from_status = 'closing'` (05 §2.8).
   - A master abort writes **one row per returned member** with that member's own `from_status` (05 §2.8; 02 §7.7 item 3).
   - R-9 requires such a row "has `from_status = 'closing'` always" (13), and T-265 and 09 `ACC1_CLOSURE_ABORT_INVALID` say the same.
2. **In the designed sequence every master-directed member is sealed before the master's final approval exists.**
   - The master seal needs every master-directed child, the default included, `closure_sealed` (01 §7.4 step 3; 02 §7.8; `trg_acc1_seal`).
   - The master's seal payload binds each member's `closure_seal_version` and `seal_pin_id` (02 §7.4 item 1; 04 §2.1.1). Those exist only after the member's seal.
3. **So the master's own rejection can never be returned.**
   - If the master's checker declines the master seal, the default is `closure_sealed`.
   - A master abort with `checker_rejected_seal` or `closure_initiation_withdrawn` must write a default row with `from_status = 'closure_sealed'`. The `CHECK` refuses it and the transaction rolls back.
   - This holds even for the simplest family (master + default only, T-199).
4. **A master-directed child's rejected seal cannot be returned either, once any sibling is sealed.**
   - Child C cannot be aborted alone (`ACC1_CLOSURE_FAMILY_MEMBER`, 02 §7.7 item 2).
   - `checker_rejected_seal` on the master requires the cited `seal_closure` to target "this account", i.e. the master (01 §7.3; 02 §7.7 1b; T-266). C's request is refused.
   - `closure_initiation_withdrawn` on the master fails the `CHECK` as soon as the default (or any sibling) is sealed.
5. **No other ground applies.** The members are drained (`ready` readiness) and attested `clear`. `family_completion_unattainable` needs a `blocked`/`unavailable` row (02 §7.7 1a).
6. **Consequence.** The R4-F03 state is reproduced for master families:
   - the master stays `closing`;
   - the sealed members stay barred indefinitely;
   - `open-accounts` stays non-zero, so the client cannot be closed;
   - under the one-master-per-client policy (01 §6) no replacement master can be opened;
   - the only exit is to seal and complete.

   WF-27 is *Client Offboarding / Account Closure* (Workflow Map §31), so its `rejected` outcome is unrepresentable for exactly the case WF-27 describes. The mapping claims in 15, T-269, ACC-REQ-057 and README §3 are therefore overstated.
7. **The tests cannot see this.** T-263…T-270 exercise a single target. The T-256 / T-262 property alphabet ("seal / re-attest / age / block-and-recover / block-persistently / complete / abort") has no rejection or withdrawal step. The "no family is left barred with no exit" claims (ACC-REQ-055; 06 rule 8; 03 §5) are therefore unproven for these grounds.

**Why a decision is needed.** Two approved texts meet here:

- ACC-R4-HD-01 applies "where a target is still `closing` and has **not** reached `closure_sealed`", says "a closure initiation may be returned", and is "never legal once `closure_sealed`".
- ACC-R3-HD-01 item 8 says a master abort before completion "reverses the master, the default and every master-directed child", and that "their barriers are cleared only by the governed abort transaction".

v0.5 applies the pre-seal condition to **every returned row**. That reading makes ACC-R4-HD-01 unusable for every master after its first child seals.

The reviewer's reading is different: the condition applies to the **abort's target**, meaning the account whose seal was rejected or whose initiation is withdrawn — the master, for a family. The reversal of sealed members then follows ACC-R3-HD-01 item 8. This reading appears to satisfy both texts. However, it lets a pre-seal-only ground clear the barrier of an account that **is** `closure_sealed`, and that is what "never legal once `closure_sealed`" may have meant to forbid. The reviewer does not decide it.

**Affected sections:** 01 ACC-REQ-045/055/057, §7.3, §7.4 steps 3–5; 02 §7.7 1b, item 2; 03 §5b; 04 §2.1.1 `abort_closure`; 05 §2.8 (`CHECK`, rows), 5k; 06 rule 8, §1.1; 09 `ACC1_CLOSURE_ABORT_INVALID`; 10 T-256, T-262, T-263…T-269; 12 row 46; 13 R-9; 14 §5; 15; README.

**Required correction:**

1. Obtain the human confirmation below, then state the family semantics of both pre-seal grounds explicitly in one place and make every file agree.
2. **If the target reading is confirmed:**
   - scope the `CHECK` and R-9 to the abort's target row (for example by `family_role = 'master'` or an explicit `abort_target` marker), so member rows may carry `from_status = 'closure_sealed'`;
   - let `checker_rejected_seal` in a master abort cite the rejected seal of **any master-directed member of the same family**;
   - align 09 and T-265.
3. **If the per-row reading is confirmed:** state plainly in file 17 §4, the runbooks (14 §5), 07 §4 item 5, 12 row 46 and 15 that a master family whose members have sealed can be resolved only by completion. That is R4-F03 option (b), which the human did not choose, so it needs the human's explicit acceptance.
4. **Tests:**
   - master + default only: the master seal is rejected, then the family is returned;
   - master-directed child C's seal is rejected after the default sealed;
   - withdrawal after partial family sealing;
   - the T-256 / T-262 property alphabet includes rejection and withdrawal.

**Implementation impact:** phase 1 (`closure_recovery` `CHECK`, R-9); phase 5 (abort evidence and family scope); runbooks.

**Human decision required: YES — a narrow confirmation of ACC-R4-HD-01's scope inside a master family.** The question is whether a pre-seal return of a master, whose own seal was rejected or whose initiation was withdrawn, may reverse master-directed members that are already `closure_sealed`, as ACC-R3-HD-01 item 8 provides for master aborts. It can be taken at the `HUMAN_DECISION_REQUIRED` checkpoint that the next planning turn needs anyway (§18).

### ACC-01-R5-F02 — MEDIUM — An `independent_preserved` child whose seal is declined, or whose initiation is withdrawn, deadlocks the open family

**Evidence:**

1. **The setup.**
   - Master M's family is open (`closing`), and its master-directed members are sealed and `clear`.
   - Independent child I (`independent_preserved`) is drained and `closing`.
   - I's own `seal_closure` is declined by its checker, or I's maker wants to withdraw.
2. **I's own return is refused while M is `closing`.**
   - `trg_acc1_closure_family` forbids an operational child under a `closing` master (05 §5).
   - The refusal is stated in 01 §7.3, 02 §7.7 item 2, ACC-REQ-056, 06 rule 8, 09 and T-258.
   - This holds for every ground, including 1b.
3. **M's abort has no admissible ground.**
   - The master abort may cite I's **latest blocking** evidence (02 §7.7 1a; 05 §2.8). I is drained, so it has only `ready` readiness and no attestation. It has no blocking evidence.
   - The 1b grounds on M must cite M's own seal request or M's own initiation (01 §7.3; T-266). In any case they fail the `CHECK` once any master-directed member is sealed (R5-F01).
4. **M cannot seal, and I cannot complete.**
   - M's seal needs I `closed` (`trg_acc1_seal`; 01 §7.4 step 3; `ACC1_CLOSURE_FAMILY_INELIGIBLE`).
   - I cannot complete without its seal, which the checker declined.
5. **Result.** No exit exists: M stays `closing`, every master-directed member stays barred, and the client cannot be closed. T-262's claim ("a governed master abort citing the child's evidence, always eventually available") does not hold for this input, because the property alphabet has no rejection or withdrawal step.

**Affected sections:** 01 ACC-REQ-056, §7.3, §7.4 step 6; 02 §7.7 1a/1b, item 2; 04 §2.1.1; 05 §2.8, §5 (`trg_acc1_closure_family`); 06 rule 8; 09; 10 T-258…T-262; 14 §5.

**Required correction** (the author chooses one; make every file agree):

- **(a)** Admit an `independent_preserved` member's **governed** pre-seal rejection or withdrawal as a ground for the master abort. It would sit in the evidence-conditioned set, legal from `closure_sealed` for the returned members, because the family "cannot safely complete" (ACC-R2-HD-03).
  - The master abort returns M, the default and the master-directed children only, and never touches I.
  - I's own 1b return then proceeds once M is no longer `closing`.
  - The evidence must be as honest as R5-F03 requires.
- **(b)** Exempt the pre-seal return of an `independent_preserved` member from `trg_acc1_closure_family`, invariant 7 and R-8 (R4-F02 option (a)). Add a machine-verifiable master-abort ground, "an `independent_preserved` member is neither `closed` nor in its own closure", verified from ACC-01's rows.

**In both options:** add tests for I being declined or withdrawn while M is `closing`, with and without sealed master-directed members, and extend the property alphabet.

**Implementation impact:** phase 1 (reason codes and trigger, if (b)); phase 5 (abort evidence); reconciliation R-8/R-9.

**Human decision required: NO.** Both options stay within ACC-R3-HD-01 items 6 and 8, ACC-R2-HD-03 and ACC-R4-HD-01. R4 already classified options (a) and (b) as technical choices.

### ACC-01-R5-F03 — MEDIUM — `checker_rejected_seal` does not bind actual rejection evidence as ACC-R4-HD-01 requires; the abort is not version-bound as ACC-REQ-057 claims

**Evidence:**

1. **The decision.** ACC-R4-HD-01: "For checker rejection: the abort request binds to the **actual seal-approval rejection evidence**". The return path is also "version-bound, evidence-bound".
2. **What v0.5 checks.** It verifies only that the cited `seal_closure` request belongs to this target and `closure_cycle` and is still `status = requested` (01 §7.3; 02 §7.7 1b; 03 §5b; T-263, T-266).
   - v0.5 itself says ACC-01 "does **not** learn of an IAM-02 rejection" (02 §1, last paragraph; 06 §4), and that the real control is the abort's own checker (01 §7.3 honesty note; 17 §5 INFO (b)).
3. **`requested` is not rejection.** A `seal_closure` stays `requested` in all of these cases:
   - it was never submitted to IAM-02;
   - it is pending and unreviewed;
   - IAM-02 expired it;
   - IAM-02 was unavailable;
   - **the checker approved it but the apply rolled back after A3.** File 02 §2 A5 says any failure after A3 "leaves the row exactly `requested`".

   A **checker-approved** seal can therefore be cited as `checker_rejected_seal`.
4. **The ground also fails in the real rejection case.** A request the checker really rejected becomes `expired` at `ACC1_CHANGE_REQUEST_TTL`, or `cancelled` if its maker cancels it. From then on the ground is unusable, because the check requires `requested`.
5. **The owning service already holds the evidence, but ACC-01 cannot read it.**
   - IAM-02 records rejections immutably (`approval_decision.decision = 'reject'`, `approval_request.status = 'rejected'`; `routes/approvals.ts` L429–493).
   - It exposes **no read seam** for an approval's outcome.
   - The rejecting `approver_user_id` is body-asserted (`IAM2-FIND-002`).

   So actual rejection evidence exists at the owner, but it is neither reachable nor attestable by ACC-01 today.
6. **What the audit ends up saying.** The Critical audit and `closure_recovery.reason_code` record "checker rejected the seal" when ACC-01 cannot evidence it. WF-27 `rejected` is mapped onto that label (15; T-269).
   - This contradicts ACC-R4-HD-01's explicit evidence binding.
   - It also contradicts ACC-R3-HD-03's principle that a claim is never self-declared.
   - Safety impact is bounded: the abort is itself maker-checker, and `closure_initiation_withdrawn` legitimately covers the same return.
7. **The abort is not version-bound.**
   - ACC-REQ-057 says the return is "bound to … the target, the closure cycle **and the current version**".
   - The `abort_closure` payload (04 §2.1.1) binds the target id, `reason_code` and `evidence_ref`, and for a master the family id and each member's `closure_cycle` and `closure_seal_version`. It does **not** bind the target `version`.
   - Apply A4 (02 §2) lists no `version` re-check for abort.
   - So an abort approved before a later mutation of the target, such as a newly recorded restriction, still applies on the old approval.

**Affected sections:** 01 ACC-REQ-057, §7.3; 02 §7.7 1b; 03 §5b; 04 §2.1.1; 05 §2.8 `evidence_ref`; 08 `acc1.account_closure_aborted`; 09; 10 T-263, T-266, T-269; 12 row 46; 15; 17 §2 (a new IAM-02 DCR), §5 INFO (b).

**Required correction** (either route stays within ACC-R4-HD-01, because route B stays fully available):

1. **Route 1 — gate the ground externally.** Keep `checker_rejected_seal`, but make it usable only with a new IAM-02 DCR:
   - an **attested, immutable approval outcome** for `entity_id = <seal change_request_id>`: status `rejected`, decision id, and the checker identity attested under `DEP-IAM-ACTOR-BINDING` / `DEP-IAM-ENTITLEMENT`;
   - until that seam exists, the ground is hard-unavailable (`ACC1_DEPENDENCY_NOT_SATISFIED`), and a checker-declined seal returns through `closure_initiation_withdrawn`;
   - accept the evidence independent of the ACC-01 request's `requested`/`expired` state.
2. **Route 2 — rename to an honest ground.** Rename and re-scope the ground so it states only what ACC-01 can prove, for example a withdrawal because the seal was not applied, under route B. Remove "checker rejected" from the audit semantics and from the WF-27 mapping text.
3. **In both routes:**
   - bind the target `version` into the `abort_closure` payload (for a master, each returned member's `version` too) and re-check it at A4, or withdraw the "current version" claim;
   - add tests for an approved-but-rolled-back seal (it must **not** qualify), an expired seal request, and a stale-version abort.

**Implementation impact:** phase 1 (reason-code semantics); phase 5 (abort payload and apply checks); a new IAM-02 DCR if route 1 is chosen.

**Human decision required: NO.** Either route implements ACC-R4-HD-01 as written, with route A usable only with real rejection evidence. No approved text is changed.

### ACC-01-R5-F04 — LOW — Pinned attesters are identified only by a module label; the peer-authentication dependency is classed so that it does not block dependency satisfaction; an empty pinned set is vacuous at the database level

**Evidence:**

1. **The pin holds only a label.**
   - `closure_seal_pin_readiness` is keyed `(seal_pin_id, attester_module)`, where `attester_module` is `varchar(16)` holding values like `LED-01` (05 §2.6, §2.9).
   - No service identity, endpoint identity, authenticated peer identity or descriptor `contract_id` is pinned.
   - Readiness and attestation rows record `attester_contract_ref`, but completion never compares the attestation's ref with the pinned readiness's (05 §5; 02 §7.6).
2. **An endpoint change can substitute the responder.** Attester base URLs are configuration (01 §4.5). Changing the configured endpoint for `LED-01` after a seal **silently substitutes the responder**, and its `clear` attestation counts for the pinned `LED-01`.
3. **The external dependency is explicit but not fail-closed.**
   - 01 §4.5 and 14 §2 say DCR-ACC-FND-02 must exist "before any runtime `DEP-*` is relied on for real".
   - File 17 classes FND-02 **GO-LIVE**. Its own §1 defines that class as "**not** ACC-01 build **or dependency satisfaction**".
   - The class that "blocks the real satisfaction of the named `DEP-*`" is **ACC-REAL-USE**.
   - As written, a runtime `DEP-*` can be reported satisfied with `provider = real` against an unauthenticated peer. The only stop is a go-live checklist tick.
4. **An empty pinned set passes completion.**
   - `closure_sealed → closed` requires a clear latest attestation "for every attester in the pinned set" (05 §5). With zero pin-readiness rows this is vacuously true.
   - An empty configuration is refused only in the application (T-081).
   - `trg_acc1_seal` cannot know what is "configured", and it does not require the pin rows to equal the attester list the checker approved.

**Affected sections:** 01 §4.5, §7.2; 02 §7.5–7.6; 05 §2.6, §2.7, §2.9, §5; 14 §2; 17 §1, DCR-ACC-FND-02, summary of classes; 10 T-253, T-254, T-271.

**Required correction:**

1. **Pin a real attester identity.**
   - Pin `attester_module` + authenticated peer/service identity (from FND-02; until then, a clearly labelled deployment-evidence endpoint identity) + descriptor `contract_id`.
   - Record the same identity on every readiness and attestation row.
   - Completion requires equality, or a defined re-verification rule for a contract change after the seal.
2. **Make FND-02 fail closed.**
   - Reclassify it **ACC-REAL-USE**, or model it as a `DEP-*` that the production composition root binds hard-unsatisfied until a reviewed change binds the platform channel.
   - Then real `DEP-*` satisfaction without an authenticated channel fails closed.
3. **Close the empty-set gap.**
   - `trg_acc1_seal` requires at least one pin-readiness row, and exact equality with the attester list in the approved seal payload (hash).
   - Completion refuses an empty pinned set.

**Implementation impact:** phase 1 (pin columns and trigger); phase 5; DCR classification (documentation).

**Human decision required: NO.**

### ACC-01-R5-F05 — LOW — "Persistently blocked/unavailable" for `family_completion_unattainable` is not machine-defined, and the specification is internally inconsistent

**Evidence:**

1. **The ground as specified.** 01 §7.3, 02 §7.7 1a, 05 §2.8 and 09 define it as: the **latest** pinned attestation is `blocked`/`unavailable`. One row suffices.
2. **The stricter wording.** ACC-REQ-055, 03 §5 and 14 §5 add "genuinely **and persistently**".
3. **The test goes further still.** T-255 requires refusing "a first-time `unavailable` result with no re-collection attempted" and says "re-collection must be exhausted".
   - No schema field, count or time window defines exhaustion.
   - `05-remediation-r4.md` §6.2 leaves it to implementation.
   - Either T-255 is unimplementable, or "persistent" becomes operator judgement.
4. **The ground adds little.** It is functionally the same as a master abort citing a member's `postseal_attestation_blocked` / `_unavailable` row, which was already admissible.

**Required correction:** choose one and align ACC-REQ-055, 01, 02, 03, 09, 14 and T-255:

- **(i)** a machine rule, for example: the latest row is `blocked`/`unavailable` **and** there are ≥ N consecutive such rows for that attester at this seal version spanning ≥ T, with N and T as required, validated configuration; **or**
- **(ii)** drop "persistently" and state plainly, as R3-F05.4 does, that the control against misuse is maker-checker plus recorded evidence plus the Critical audit.

**Implementation impact:** phase 5 and tests. **Human decision required: NO.**

### ACC-01-R5-F06 — INFO — Precision and record accuracy

1. **Entitlement wording.** 07 §2 rows `acc1.master_account.close_initiate` (L23) and `close_collect_evidence` (L26) still say "a real entitlement" without the R4-F06 qualifier. That qualifier says the step-10 lookup checks whichever `actor_id` the request body names. 02 §7.1 item 1 opens with "a real check" and qualifies it in the next sentence. Align the wording.
2. **Stale source-check note.** 02 §0 says the IAM-02 facts were "**not re-read for v0.4 or v0.5**". `05-remediation-r4.md` (R4-F06) says `routes/internal.ts` was verified in that session. Reconcile the two.
3. **Record timestamps.** `task.json` `updatedAt` values at `038628a` and `826ab45` are later than the actual commit times (§3), although `06-human-decision-r4.md` §3 says they are true clock time. Record the correction in the next checkpoint and do not edit history.
4. **Withdrawal evidence is trivially met.** `closure_initiation_withdrawn`'s evidence check ("the initiation id belongs to this target at this cycle") holds for **every** `closing` target. State plainly, as R3-F05.4 does, that the control is the maker-checker withdrawal request and the Critical audit (§13). This is consistent with ACC-R4-HD-01.

**Totals (new):** MEDIUM 3, LOW 2, INFO 1.

## 8. Family-attestation adjudication (R4-F01)

| Attack | Result |
|---|---|
| A child's `clear` attestation ages out after the master seal → clear re-attestation → completion | **Passes.** The hash has no attestation field (05 §2.10). Completion re-reads the latest row fresh (01 §7.4 step 4(c); 02 §7.6). T-251 |
| A child is `blocked` after the master seal → later `clear` → completion | **Passes.** Latest-row semantics; T-252. No abort is needed |
| Ordinary re-attestation changes a family hash | **No.** None of the bound fields changes except by a new seal or a family abort (05 §2.10). T-250 asserts pin, hash, cycle and seal version are byte-identical |
| A pinned attester is removed from configuration | **Still required.** Its pin row stays (05 §2.9). Collection from an unconfigured pinned attester records `unavailable` (02 §7.5: "unreachable, unconfigured … ⇒ `unavailable`/`blocked`"), which is an abort ground. T-253 |
| A new attester is added to configuration | **Not retroactively required.** Only a later seal derives a new set (05 §2.9). T-254 |
| Immutable facts separated from renewable evidence | **Yes.** Immutable: pin, pin-readiness rows (the required set), family hash, cycle, seal version, sealed-at version. Renewable: `closure_attestation` rows, latest per (target, attester, seal version) |

## 9. Pinned-attester-set adjudication

- **Strength of identity: insufficient (R5-F04).** The set pins `attester_module` only. It does not pin service identity, endpoint, authenticated peer identity or contract identity.
- **Substitution risk.** Changing the configured endpoint behind `LED-01` after a seal would silently substitute the responder. The design says endpoint authentication is a deployment trust anchor (DCR-ACC-FND-02).
- **Fail-closed status.** That dependency is **explicit** but **not fail-closed**, because its class explicitly does not block dependency satisfaction (R5-F04).
- **Exact readiness pinning is not weakened** (§16). The empty-set gap at the database level is new with v0.5, because the pinned set is now **the** completion criterion (R5-F04.4).

## 10. Family-abort adjudication

| Check | Result |
|---|---|
| `family_completion_unattainable` is machine-verifiable | **Yes** for the core rule: the latest pinned row is `blocked`/`unavailable`, verified from ACC-01's rows under lock. "Persistently" is undefined (R5-F05) |
| Expired clear evidence causes re-attestation, not abort | **Yes** (01 §7.3; 09 `ACC1_CLOSURE_FAMILY_UNATTAINABLE`; T-255) |
| A genuinely blocked or unavailable pinned attester grounds an abort | **Yes** |
| A structural inconsistency that prevents completion has a governed exit | **Yes** for authority restriction, invariant failure and contract fault (1a) |
| No reachable sealed family is barred with neither completion nor abort | **No.** A master whose own seal is declined after its members sealed (R5-F01); a declined master-directed child's seal after a sibling sealed (R5-F01); a declined or withdrawn `independent_preserved` child (R5-F02) |
| Abort is maker-checker | **Yes** (`close_abort` is approval-gated; 07 §2) |

## 11. Independent-child adjudication (R4-F02, option (b))

| Attack | Result |
|---|---|
| The independent child completes while the family waits | **Passes.** A `closed` child is not operational under a `closing` master. The master seal then counts it (T-257) |
| The independent child blocks (undrained or blocked attestation) | **Passes.** Its latest blocking row grounds the master abort, and the child is untouched (T-259) |
| The independent child becomes sealed | **Passes.** It completes on its own evidence, or its blocking row grounds the master abort |
| Master abort | **Passes.** The child's status, barrier, cycle, pin and attestations are unchanged, and no recovery row is written for it (05 §2.8; T-259; R-9) |
| New master closure later | **Passes.** A new `closure_family_id` and a fresh live snapshot. The old `independent_preserved` row is historical only (05 §2.10, 5j; T-261). Evidence citation is restricted to members of **that** family, so old membership cannot leak |
| The independent child is **drained** and its seal is declined, or it is withdrawn, while the master is `closing` | **Fails → R5-F02** |

## 12. Checker-rejection adjudication

**Outcome B.** v0.5 proves only that a `seal_closure` request exists for this target and cycle, has not been applied, and is still `requested`, and that the abort has its own checker. It does **not** prove that a final checker rejected the seal.

- `requested` also covers: unreviewed, IAM-02-expired, IAM unavailable, never submitted, and **approved-but-rolled-back** (02 §2 A5).
- Calling all of these `checker_rejected_seal` misrepresents both WF-27 `rejected` and the Critical audit. It does not meet ACC-R4-HD-01's "binds to the actual seal-approval rejection evidence".
- **Both acceptable outcomes remain open to the author:**
  - (1) gate the ground externally on an IAM-02 seam that returns immutable, attested rejection evidence;
  - (2) rename it to an honest withdrawal-type ground.
- **Finding:** R5-F03. No new human decision is needed.

## 13. Withdrawal adjudication (`closure_initiation_withdrawn`)

| Property | Result |
|---|---|
| Maker-checker | **Yes.** An `abort_closure` change request with an approval-gated `close_abort` code. IAM-02 blocks requester = approver (T-267). Real apply is externally gated on `DEP-IAM-ACTOR-BINDING` / `DEP-IAM-ENTITLEMENT`, fail-closed |
| Formal withdrawal recorded under the governed workflow | **Yes.** The `abort_closure` request is the governed withdrawal change request, with a Critical audit |
| Cycle-bound | **Yes.** The cited initiation id is verified for this target and cycle; a master abort binds each member's `closure_cycle` |
| Version-bound | **No** (R5-F03.7) |
| Pre-seal only | **Yes for a single target** (the `CHECK`). In a family it is unusable once any member has sealed (R5-F01) |
| Audited | **Yes** (Critical `acc1.account_closure_aborted` with `reason_code` and `evidence_ref`) |
| A maker cannot unilaterally revert `closing` | **Holds.** No maker-only route returns a `closing` target. Initiation is maker-only, but every return is maker-checker. The evidence check is trivially met (R5-F06.4), so the control is the checker, as ACC-R4-HD-01 intends |

## 14. WF-27 `rejected` mapping

- **Where the mapping holds:**
  - **independent targets** (non-default subaccounts) — `closing` → maker-checker 1b abort → recomputed operational projection;
  - **a master family before any member has sealed**.
- **Where it fails:**
  - the master's own final approval, where members are necessarily sealed (R5-F01);
  - a master-directed child's rejected seal once a sibling has sealed (R5-F01);
  - a declined independent member under an open family (R5-F02).
- **External denials are never undone.** The abort restores only ACC-01's stored projection, recomputed from restrictions in force by `clock_timestamp()` (02 §7.7 items 3–4; 01 §7.3). Effective status stays live, so:
  - a `court_order` / `regulatory_directive` restriction still projects;
  - a full freeze still projects `frozen`;
  - a CLT-01 client suspension still yields the client-derived status;
  - a capability CFG-01 withholds stays withheld;
  - no permission denied by another authority is restored (T-268).
- **Evidence honesty:** the `rejected` label is not currently evidenced (R5-F03).

## 15. Deployment-trust adjudication (R4-F04)

- **The overclaim is gone.** v0.5 no longer claims that everything is behaviourally provable by ACC-01 (01 §4.5; 14 §2).
- **Two things are distinguished correctly:**
  1. ACC-01 verifies the *content* of a response or descriptor from a peer. It does **not** authenticate the peer; that is a deployment trust anchor (DCR-ACC-FND-02).
  2. ACC-01 **cannot** prove that LED-01's journal is commit-ordered. It verifies only that the descriptor **declares** `commit_ordered_watermark = true`. The truth of that property rests on LED-01's reviewed, accepted implementation and acceptance evidence (01 §4.5; 14 §2; 17 LED-01c (v); T-272).
- **A local configuration Boolean cannot satisfy the dependency.** No configuration key is read as evidence (05 §8; T-223). The descriptor is fetched from the attester at operation time.
- **An arbitrary endpoint can currently satisfy it**, because DCR-ACC-FND-02 is classed GO-LIVE, and that class does not block dependency satisfaction → **R5-F04**.

## 16. Readiness / seal and master / default / family regression

**R3-F02 adversarial sequence, re-run on v0.5 text:**

| Step | Outcome |
|---|---|
| The checker approves readiness A; a posting follows | The apply-time verification watermark ≠ A's watermark ⇒ `ACC1_CLOSURE_NOT_READY` (02 §7.4 item 3; T-222) |
| Readiness B appears before the seal | A is no longer the latest for its attester and cycle ⇒ seal refused (`trg_acc1_seal`; T-215/T-217) |
| B after the seal | Insert refused (`trg_acc1_readiness_insert`; T-214) |
| An attestation computed against B | `preseal_watermark_ref` ≠ the pin row's watermark for that attester ⇒ `binding_ok = false`; never counts (T-220) |
| A completion attempt | Compares each **pinned** attester's latest attestation with **that pin row** and never consults "latest readiness" (05 §5; T-216) |
| Effect of the attester-set change | **None on pinning.** Each pinned-set row *is* the pinned readiness row for its attester. Old evidence cannot be substituted |

**Master / default / family:**

- **Every non-`closed` master has exactly one non-`closed` default.**
  - The deferred `trg_acc1_master_default_invariant` is unchanged.
  - The default enters `closing` only with its master and becomes `closed` only in its master's completion (`trg_acc1_default_protected`, unchanged).
  - An abort returns the default with its master.
  - A failed abort (including the R5-F01 `CHECK` failures) rolls back whole.
- **Atomic completion is unchanged.** One transaction closes every master-directed child, the default and the master (01 §7.4 step 4(g); 02 §7.6). Any failure rolls all of it back.
- **No ACTIVE master with a CLOSED default, and no closed default under an open master:** both are unrepresentable (`trg_acc1_master_default_invariant`; `trg_acc1_closure_family`; R-8; T-206). **The invariant holds.**

## 17. Remaining external gates (correctly carried; none is closed by this pack)

| Gate | Status |
|---|---|
| **RF-01** IAM-02 entitlement | **EXTERNAL GATE REMAINS.** Fail-closed on per-call attested evidence |
| **RF-02** mistaken-creation deadlock | **EXTERNAL GATE REMAINS.** Creation needs the attester's operation-time descriptor |
| **RF-05** CLT-01 credential | **EXTERNAL GATE REMAINS.** Per-read scope statement; no fallback |
| **RF-09** freeze ownership | **EXTERNAL GATE REMAINS.** Hard-unsatisfied in code |
| `DEP-IAM-ACTOR-BINDING` | DCR-ACC-IAM-06 — open |
| `DEP-IAM-ENTITLEMENT` | `IAM2-FIND-002` (OPEN, HIGH); DCR-ACC-IAM-02b/-02c/-03/-04/-07; DCR-ACC-GOV-02 — open |
| `DEP-IAM-SCOPED-CREDENTIAL` | DCR-ACC-IAM-05 — open |
| `DEP-CLT-READ-SCOPE` | DCR-ACC-CLT-03 — open |
| `DEP-LED-CLOSURE-CONTRACT` | DCR-ACC-LED-01c/-01e, including the commit-ordered watermark proven by LED-01's reviewed implementation. No LED-01 service exists — open |
| `DEP-FREEZE-GOVERNANCE` | DCR-ACC-GOV-05 — hard-unsatisfied |
| `DEP-PUBLIC-PERIMETER` | `FND-FIND-001` (OPEN, HIGH); DCR-ACC-FND-01 — hard-unsatisfied |

Also external:

- **peer authentication** — DCR-ACC-FND-02 (its classification defect is R5-F04);
- real closure initiation — DCR-ACC-IAM-07;
- consumer adoption — DCR-ACC-LED-01b/-01e, CONS-01, CFG-01;
- environment availability — DCR-ACC-CFG-02 (CFG-01);
- client money — `A2-Q1` / `A2-Q2`;
- a new IAM-02 approval-outcome seam, if R5-F03 route 1 is chosen.

## 18. Task / conductor consequence

- **`task.json`:** state `PLANNING`, `roundCounts.planning = 5` (a legal human-authorised over-limit entry, §3), `acceptanceStatus = NOT_ACCEPTED`.
  - **Not modified by this review.** `PLAN_READY` is **not** set. Implementation eligibility is **not** created.
- **REMEDIATE ⇒ v0.6 must not be started silently.** Under the actual conductor, re-executed in memory:
  - `PLANNING → PLANNING` is illegal;
  - `PLAN_READY → PLANNING` at `planning = 5` redirects to `HUMAN_DECISION_REQUIRED`;
  - the only route to another planning turn is `PLANNING → HUMAN_DECISION_REQUIRED` (ungated) → `resolve_human_decision` → `PLANNING`, with **`planning` 5 → 6** (a further human-authorised over-limit entry).
- **New human design decision actually required: YES, one and narrow — R5-F01.**
  - The question: does ACC-R4-HD-01's pre-seal return, applied to a master whose own seal is rejected or whose initiation is withdrawn, reverse master-directed members that are already `closure_sealed`, as ACC-R3-HD-01 item 8 provides for master aborts?
  - R5-F02 … R5-F06 need **no** human decision.
- **The next checkpoint should also:**
  - transcribe this review into `findingsSummary` (convention: INFO is not counted).
    - R4-F01, R4-F05 and R4-F06 closed.
    - R4-F02, R4-F03 and R4-F04 superseded by R5-F01…R5-F04.
    - R5-F01, R5-F02 and R5-F03 (MEDIUM) and R5-F04 and R5-F05 (LOW) open.
    - RF-01, RF-02, RF-05 and RF-09 stay as external gates.
  - record R5-F06.3 (timestamp accuracy) prospectively.
- **Not ESCALATE:** these are design corrections, not reviewer or model capacity limits.
- **Not a bare HUMAN_DECISION:** most findings are technical, and the one decision can be taken at the mandatory checkpoint.
- **If a future re-review returns ACCEPT:** that would be blueprint architecture acceptance only. Implementation would still need the human/conductor `approve-plan` checkpoint and branch integration.

## 19. What this review does not do

It does not:

- modify v0.5 (or v0.1…v0.4), `task.json`, any master or register (`OPEN_FINDINGS`, `DECISION_LOG`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`), `platform/**`, the conductor, or `main`;
- create `06-acceptance.md`;
- take any human decision;
- start remediation;
- merge.

**Implementation is not authorised.**
