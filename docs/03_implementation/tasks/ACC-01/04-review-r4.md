# 04 Review (round 4) — ACC-01: Account Structure blueprint pack v0.4

- **Task ID:** ACC-01 (planning task — blueprint pack, no implementation)
- **Reviewer:** independent architecture / compliance reviewer / claude-opus-5-5 / HIGH
- **Pack under review:** `docs/02_modules/ACC-01/blueprint/v0.4/` at `a865d63` (the remediation of `04-review-r3.md` under ACC-R3-HD-01…03, after the human-decision checkpoint `af5d025`)
- **Author of v0.1…v0.4:** blueprint planner / claude-sonnet-5 (per `01-plan.md`, `05-remediation*.md`)
- **Independence:** **separate context.**
  - This review ran in a **new Claude Code session**. It carried no conversation from the authoring, remediation or earlier review sessions.
  - Everything below was re-derived from the repository: the v0.4 text (all 18 files), the governing decisions and masters, the IAM-02 source, and the actual local `aix-conductor`.
  - `05-remediation-r3.md` was read only as a map of what was claimed. It was **not** used as evidence.
  - The reviewer is the same model as the round-1…3 reviewers, and a different model from the author.
- **Decision:** **REMEDIATE**
- **Implementation authorised:** **No.** Nothing is accepted. No `06-acceptance.md` exists or is created. `task.json` is not modified by this review.

## 1. Baseline verification (all passed)

| Check | Result |
|---|---|
| Worktree | `/Users/AimanRahimi/AIX-worktrees/acc-01` |
| Branch | `module/ACC-01` |
| HEAD | `a865d63` (= `origin/module/ACC-01`) |
| Working tree | clean before this review |
| History | `43f2f34` → `42316fe` (v0.1) → `2e26d13` (review 1) → `8ff4e9d` (v0.2) → `b5c21bd` (review 2) → `194aff0` (v0.3) → `3b3a3ee` (review 3) → `af5d025` (human checkpoint) → `a865d63` (v0.4) |
| `main` / `origin/main` | both `43f2f34`; untouched; the main worktree is clean; nothing merged |
| Diff `origin/main...HEAD` | **All** files are under `docs/02_modules/ACC-01/**` or `docs/03_implementation/tasks/ACC-01/**`. No `platform/**`, no migration, no master, no register |

## 2. Sources reviewed

- **Decisions:** DEC-011, DEC-013, DEC-014 (as cited by the pack); the approved human decisions of v0.4 file 17 §4.1, §4.3 and §4.4, and `06-human-decision-r3.md` §4. ACC-R3-HD-01…03 are treated as approved and are **not** reinterpreted. ACC-R3-HD-01 amends ACC-R2-HD-04.
- **Masters (relevant sections):** Workflow Map v1.3 §31 (WF-27 states, steps, blocking conditions); Role & Permission Matrix v1.3 (as cited); `OPEN_FINDINGS.md` rows `IAM2-FIND-002`, `IAM2-FIND-003`, `FND-FIND-001` (all **OPEN**).
- **Task records:** `04-review.md`, `04-review-r2.md`, `04-review-r3.md`, `05-remediation*.md` (map only), `06-human-decision-r3.md`, `task.json` and its history at every commit.
- **v0.4:** all 18 files read. Cross-checks: no v0.3 test id (T-001…T-198) or `ACC-REQ-*` was dropped; T-199…T-248 are new.
- **Source inspected read-only:**

| Area | Fact verified |
|---|---|
| IAM-02 `routes/internal.ts` | `POST /internal/iam2/permission/check` takes `actor_id` from the **request body** and passes it to `evaluatePermission` |
| IAM-02 `lib/guard.ts` | Step 7 (`requires_approval` → `approval_required`) precedes the step-10 role-grant lookup |
| `platform/services` | No `led1` service exists; no LED-01 attester or descriptor seam exists |
| `aix-conductor` `00a7bde` (clean, not modified) | See §3 |

## 3. Conductor checkpoint adjudication

**Verified by source reading and by in-memory execution** of `dist/state.js` / `dist/records.js` (built after `src/`). No conductor state was written.

| Claim in `06-human-decision-r3.md` §1 | Verified |
|---|---|
| `maxPlanningRounds` = 3 in both config files; no per-task override | **Correct** |
| Entering `PLANNING` consumes a round; beyond the limit the entry redirects to `HUMAN_DECISION_REQUIRED` with `limitRedirect` and the counter rolled back | **Correct** (`state.ts` `ROUND_ON_ENTER`, `transitionTask`) |
| `PLANNING → PLANNING` is not legal | **Correct** (`canTransition` = false) |
| `PLANNING → HUMAN_DECISION_REQUIRED` is ungated; the counter is unchanged | **Correct** (executed: `planning` stays 3) |
| `HUMAN_DECISION_REQUIRED → PLANNING` needs `resolve_human_decision`; without it `ApprovalRequiredError` | **Correct** (executed) |
| `HUMAN_DECISION_REQUIRED → PLAN_READY` is illegal | **Correct** (`InvalidTransitionError`) |
| A gated move out of `HUMAN_DECISION_REQUIRED` into `PLANNING` is a human-authorised over-limit entry; the counter records the real count (limit + 1) and is never reset | **Correct** (`humanAuthorised`; `tests/state.test.ts` "lets a human authorise an over-limit round…"). Executed: `planning` 3 → **4**, history entry carries the approval |
| `task.json` carries no history or approvals; `validateTaskManifest` rejects unknown keys | **Correct.** Executed on HEAD `task.json`: `{"ok":true,"errors":[]}` |
| No runtime `ACC-01` record in the conductor's `state/tasks/` | **Correct** (only `IMP02-MA-HARDEN-001.json`, `PV-20260919T162254Z-001.json`) |
| **"The conductor has no CLI command that resolves a `HUMAN_DECISION_REQUIRED` for a manual planning task; the transition rules are library rules"** | **Incorrect** → **R4-F05**. `src/cli.ts` L386–393 exposes `task transition ID STATE [--approved-by NAME]`. It derives the gate with `approvalGateFor`, requires `--approved-by` and an interactive typed APPROVE, and applies `transitionTask` (L212–232). It cannot act on ACC-01 **only** because ACC-01 has no runtime record |

**Is `roundCounts.planning = 4` valid?** **Yes**, as a recorded human-authorised over-limit entry. The two legal transitions T1 and T2 are the only conductor-legal continuation from an exhausted `PLANNING`. The manifest diffs at `af5d025` and `a865d63` change only `state`, `roundCounts.planning` (3 → 4 at T2), `findingsSummary`, `relevantRecordPaths` and `updatedAt`. The count is not reset and is not treated as invalid. `PLAN_READY` is not set.

**Observations (no finding against the checkpoint):**

- The manifest's planning counter counts **blueprint versions**, not conductor state entries. `194aff0` raised it 2 → 3 while the task was already in `PLANNING`, which is not a conductor transition (`05-remediation-r2.md` §6: "set to 3 (v0.1, v0.2, v0.3)"). The convention is conservative: it only ever adds human gating. The checkpoint applied the conductor faithfully to the recorded count. Per instruction, the count is not reset.
- T1 and T2 were **recorded**, not executed through the conductor. The approval is **relayed**, and its original time is not recorded. The checkpoint states both honestly.

## 4. Verdict

**REMEDIATE.**

v0.4 is a serious and largely successful remediation.

- The round-3 invalid state is gone by construction. An ACTIVE master with a CLOSED default is unrepresentable: `trg_acc1_master_default_invariant`, the default-only-with-master rule, R-8 and T-206.
- The readiness the checker approves is now genuinely pinned into an immutable seal pin, and nothing after the seal can displace it.
- Every configuration-declared dependency is gone. Runtime dependencies need per-call evidence from the owning service. Governance-only dependencies are hard-unsatisfied in code.
- Actor provenance, abort without an LED-01 dependency, OQ-13 and the precision items are addressed.

**Two new MEDIUM blueprint defects remain in the master-family design.** They are not external dependencies:

1. **R4-F01.** Once the master is sealed, family completion can become **permanently unattainable**. The master's pinned `family_set_hash` includes each child's *latest attestation id*, and completion requires every child attestation to be *fresh*. A child attestation that ages out cannot be refreshed without breaking the hash. The pack's own abort evidence rules then admit **no** governed abort. The whole family stays barred indefinitely, and the client cannot be closed.
2. **R4-F02.** An `independent_preserved` child that cannot complete **deadlocks the family**:
   - the master seal requires it `closed`;
   - a master abort may not cite its evidence;
   - its own abort, which the pack says works "even while its master is `closing`", is refused at commit by the pack's own deferred `trg_acc1_closure_family` (and invariant 7, and R-8).

**A third MEDIUM (R4-F03) needs a human decision.**

- Under maker-only initiation, a **drained** target has no governed way back from `closing` if the checker declines the seal. WF-27's `rejected` outcome is therefore unrepresentable.
- The pack's stated mitigation ("the maker-checker governed abort undoes it") is false under its own evidence rule.

Two LOW findings (R4-F04, R4-F05) and one INFO (R4-F06) complete the set.

## 5. R3-F01 … R3-F07 disposition

| Finding | Sev | Disposition | Basis (v0.4 text) |
|---|---|---|---|
| **R3-F01** Master abort leaves an ACTIVE master with a CLOSED default | MEDIUM | **SUPERSEDED BY NEW FINDING — R4-F01, R4-F02** (the R3-F01 state itself is closed in blueprint) | The invariant is stated and enforced by a deferred constraint trigger (ACC-REQ-050; 05 §5). The default closes only in its master's completion transaction (`trg_acc1_default_protected`; 05 §2.2 `CHECK`). Master-directed children stop at `closure_sealed` (01 §7.4). Family abort reverses master, default and children (02 §7.7). R-8 makes a closed default under a non-closed master a Critical break. Tests T-199…T-212. The next master closure is defined as a new family (T-204), and client closure after completion is covered (T-205). **But** the replacement family design has no governed exit in two reachable states (R4-F01, R4-F02) |
| **R3-F02** Checker-approved readiness not pinned | MEDIUM | **CLOSED IN BLUEPRINT.** The commit-ordered watermark stays an **external gate** (`DEP-LED-CLOSURE-CONTRACT`, DCR-ACC-LED-01c (v)) | All seven required corrections are delivered. (1) Immutable `closure_seal_pin` + `closure_seal_pin_readiness`, cleared only from the target by abort (05 §2.9). (2) `trg_acc1_readiness_insert` refuses any readiness insert unless the target is `closing` at the named cycle and initiation (05 §2.6). (3) The seal requires the pinned row to still be the latest and `ready`, with the approved watermark and hash (`trg_acc1_seal`). (4) A4 re-checks the approved target `version`; readiness records the initiation id and the DB-stamped `target_version_observed`. (5) A commit-ordered watermark is required (01 §7.2; 17 LED-01c (v)). (6) The attestation asserts the drained state (`balance_state`, `open_item_count`). (7) Tests T-213…T-222. Caveat: R4-F04 (a), (c) |
| **R3-F03** `DEP-*` satisfiable by self-declared configuration | MEDIUM | **CLOSED IN BLUEPRINT** — the runtime dependencies remain **external gates**; residual trust-anchor precision → **R4-F04** (LOW) | Evidence rule ACC-REQ-053; 01 §4.5 table. No `*_REF` / `*_CONTRACT_VERSION` / Boolean is read as evidence (05 §8; T-223). The governance-only dependencies are hard-unsatisfied in the production composition root and liftable only by a reviewed ACC-01 code change (T-224). The boot "general-token detection" overclaim is withdrawn (01 §4.5; T-230). Service readiness never reports a `DEP-*` satisfied (T-231). 14 §2 classifies every dependency |
| **R3-F04** Actor-assertion provenance undefined | LOW | **CLOSED IN BLUEPRINT** — **EXTERNAL GATE REMAINS** (`DEP-IAM-ACTOR-BINDING`, DCR-ACC-IAM-06) | IAM-02 must validate an IAM-01 session / recent-auth reference or an IAM-01-produced assertion through its own trusted seam. ACC-01 forwards the reference byte-identical and never mints one. `actor_assertion_authority` is required. An ACC-01-minted assertion never satisfies the dependency (02 §0, §1 step 7; 07 §4.1; 17 IAM-06; T-233…T-235) |
| **R3-F05** Abort gated on LED; family evidence undefined | LOW | **SUPERSEDED BY NEW FINDING — R4-F02** (items 1, 2 and 4 closed) | (1) Abort needs the governed-apply set only and makes no LED-01 call (01 §4.5; 02 §7.7; T-236). (2) The family evidence scope is defined (T-237). (4) The honest statement is made (T-239). **Item 3** (independent closures) is resolved in a way that contradicts the pack's own trigger and deadlocks the family → R4-F02 |
| **R3-F06** OQ-13 mislabelled | LOW | **CLOSED IN BLUEPRINT** (resolved by ACC-R3-HD-02). Real initiation remains an **external gate** (DCR-ACC-IAM-07) | OQ-13 is RESOLVED (17 §3). The catalogue uses non-approval `acc1.*.close_initiate` (07 §2), fixed before phase 1 (14 §1). HD-4 interaction is noted. A new consequence of maker-only initiation → **R4-F03** |
| **R3-F07** Precision | INFO | **CLOSED IN BLUEPRINT** | (1) The master pre-seal readiness wording is structural (01 §7.2; T-245). (2) The database uses `clock_timestamp()` in the locked check, plus a deferred commit-time check on cancel; no application clock (02 §5–6; 05 §5; T-246/247). (3) The CDA-1 discriminator `closure_initiation_id` is returned by `resolve` (06 §2.3; LED-01e; T-248). Consumer adoption is external |

## 6. Regression check

| Item | Result |
|---|---|
| **R2-F03** barrier masked by worst-of status | **Not regressed.** `closure_barrier` is stored and returned independently and evaluated first (01 §10; 06 §2.0). The `CHECK` ties it to status; it is cleared only by recovery (`trg_acc1_closure_barrier`) |
| **R2-F04** apply actor binding | **Not regressed**; strengthened by R3-F04 |
| **R2-F05** credential coverage | **Not regressed.** Every CLT-01 read uses the scoped client. The per-call scope statement replaces the boot overclaim (T-186, T-228) |
| **R2-F06** entitlement tests | **Not regressed.** T-048/T-066 retained; T-226, T-241 added |
| **R2-F07** restriction lifecycle | **Not regressed.** Cancel, inline activation and time-effective legality are intact, with a stronger time source |
| **R2-F08** parallel environment control | **Not regressed.** A full grep finds environment names only in recording, negations, parameterised tests and one example response value (04 §3.1). No branch. CFG-01 is sole `ENVIRONMENT_AVAILABILITY` owner (01 §4.5; 17 CFG-02) |
| **R2-F09** editorial | **Not regressed** (minor new editorial items → R4-F06) |
| **RF-04** `blocked_scopes` fail-open | **Not regressed.** Explanatory only (06 §2.0, §2.2) |
| **RF-06** restriction owner binding | **Not regressed.** 05 §2.3 composite FKs unchanged |
| **RF-08** scheduled-restriction timing | **Not regressed.** Time-effective rule; every restriction change including cancel bumps `version` (`trg_acc1_restriction_version`) |
| **RF-10** DCR classification / readiness | **Not regressed.** Five classes; IAM-07 classified. Service readiness makes no peer call and never reports `DEP-*` satisfied (T-231). Descriptor fetches are operation-time only |
| **RF-11** not an eligibility authority | **Not regressed** (01 §4.6) |
| Default `general` not a fallback | **Not regressed.** Explicit `subaccount_id`; `is_default` never returned by seams; T-122…T-125 |
| Composite ownership, version evidence, closure-barrier order, lift before housekeeping | **Not regressed** |
| CLT credential separation | **Not regressed** (DCR-ACC-CLT-03; no fallback) |
| No environment-name branching | **Not regressed** |

## 7. New findings

Severity uses HIGH / MEDIUM / LOW / INFO. "Blocking" means blocking **acceptance of the pack**.

### ACC-01-R4-F01 — MEDIUM — After the master seal, family completion can become permanently unattainable and no governed abort is admissible; the whole family stays barred

**Evidence:**

1. **The master's seal pins children's attestation ids.**
   - `family_set_hash` is a fingerprint over each master-directed member's "`closure_cycle`, `closure_seal_version`, `closure_sealed_at_version`, pinned readiness ids, **latest attestation ids**" (05 §2.10).
   - It is bound into the master's approved seal payload (02 §7.4 item 1; 04 §2.1.1) and persisted on the master's pin (05 §2.9 `family_set_hash`).
2. **Completion requires the live hash to equal the pinned hash.** 01 §7.4 step 4(e) ("recomputes the family set hash from the live rows and requires it to equal the master's pinned hash"); 02 §7.6; 04 §2.4.
3. **Completion also requires every child attestation to be fresh.**
   - 04 §2.4: "Complete (master family) applies the same checks to the master **and to every master-directed child**", including `as_of` within `ACC1_ATTESTATION_MAX_AGE_SECONDS`.
   - T-208(e): "a member's attestation aged past `ACC1_ATTESTATION_MAX_AGE_SECONDS` ⇒ completion … refuses".
   - 02 §7.5: a child's attestation "is collected **before** the master's seal … and stays current only while it is within `ACC1_ATTESTATION_MAX_AGE_SECONDS`".
4. **Nothing stops child re-attestation after the master seal, and the pack encourages it.**
   - `trg_acc1_attestation_bind` requires only that the child is `closure_sealed` (05 §5).
   - 01 §7.2: "re-collection is allowed and needs no abort".
   - 02 §7.5: "re-collect (latest wins)".
   - T-210 confirms that a re-attested child changes the hash.
5. **Therefore, after the master seal:**
   - If the master's attestation and completion do not both finish within the max age of the **earliest** child attestation, completion fails on freshness.
   - Re-collecting that child (even `clear`) fails on the hash.
   - A transient `blocked` child row (T-208(a)) followed by a `clear` re-collection ends in the same state.
   - The same happens after any routine re-collection of any child.
6. **No governed abort is admissible in that state** (02 §7.7 item 1; 05 §2.8 `reason_code`):
   - latest readiness `not_ready`/`unavailable` — no: the pinned rows are `ready`, and no readiness row can be inserted after a seal (`trg_acc1_readiness_insert`);
   - latest attestation `blocked`/`unavailable` — no: the latest rows are `clear`;
   - "an invariant query failing" — no: a hash mismatch or a stale-but-clear row is not defined as an invariant;
   - authority restriction or attester contract error — no.

   ⇒ `ACC1_CLOSURE_ABORT_INVALID`.
7. **Consequence:**
   - Master, default and every master-directed child keep `closure_barrier = true` indefinitely.
   - `open-accounts` stays non-zero, so the client is un-closable (DCR-ACC-CLT-01).
   - 14 §5's runbook ("if the master cannot complete, abort the **master**") is not available.

   This contradicts **ACC-R2-HD-03** ("a governed recovery path exists if closure cannot safely complete"). It is also not what **ACC-R3-HD-01** item 7 requires: re-verify "every master-directed child's **latest** attestation at its current seal version" and that "no version or readiness evidence changed". It does not require that no **attestation** was re-collected.

**Affected sections:** 01 §7.2 (latest-attestation semantics), §7.4 steps 3–4; 02 §7.4 item 1, §7.5, §7.6, §7.7 item 1; 04 §2.1.1 (`seal_closure`), §2.4; 05 §2.9, §2.10, §2.8 `reason_code`, §5 (`trg_acc1_seal`, `trg_acc1_attestation_bind`); 09 `ACC1_CLOSURE_FAMILY_SET_CHANGED`, `ACC1_CLOSURE_ABORT_INVALID`; 10 T-200, T-208, T-210; 14 §5.

**Required correction:**

1. The master's pinned `family_set_hash` binds only **immutable seal facts** of each member: id, membership, `closure_cycle`, `closure_seal_version`, `closure_sealed_at_version`, seal pin id, pinned readiness ids. It does **not** bind attestation ids.
2. Family completion re-verifies, under the locks, each child's **latest** attestation at its current seal version against that child's pin, including freshness. Re-collection after the master seal therefore stays legal and is the normal cure for staleness.
3. Define a machine-verifiable abort ground for a family whose completion cannot be achieved. Examples: `closure_invariant_failed` defined to include "a family member's latest attestation is not `clear`/fresh/bound", or a recorded completion refusal verified under lock from ACC-01's own rows. Abort stays maker-checker.
4. **Tests:**
   - a child attestation ageing out after the master seal → re-collect → completion succeeds;
   - transient `blocked` → `clear` on a child after the master seal → completion succeeds;
   - where completion genuinely cannot succeed, the master abort is admissible;
   - the family never remains barred with no governed exit.

**Implementation impact:** phase 1 (hash definition, pin columns, `trg_acc1_seal`), phase 5 (completion, abort evidence), reconciliation R-9/R-10 wording.

**Human decision required: NO.** This lies within ACC-R3-HD-01 item 7 and ACC-R2-HD-03.

### ACC-01-R4-F02 — MEDIUM — An `independent_preserved` child that cannot complete deadlocks the master family; its "own abort while the master is `closing`" contradicts the pack's own deferred trigger

**Evidence:**

1. **The master seal requires every independent child to be `closed`.** 01 §7.4 step 3; 06 §1 rule 7; `trg_acc1_seal` ("every `independent_preserved` member `closed`"); T-203.
2. **The pack says the independent child can abort itself during the family.**
   - 02 §7.7 item 2: "An independent child can be aborted **on its own** with **its own** evidence at any time it is `closing` or `closure_sealed`, **even while its master is `closing`**."
   - The same claim appears in 01 §7.3, 14 §5, T-202, and T-238 ("an independent child's own abort while its master is `closing` **succeeds**").
3. **The pack's own database refuses that commit.**
   - An abort lands the child on its operational projection (06 §1).
   - `trg_acc1_closure_family` (deferred, evaluated at commit): "a master in `closing` has **no operational child**" (05 §5).
   - 06 §6 invariant 7 says the same, and 13 R-8 classifies it as a **Critical** break.
   - T-238's success case and the trigger cannot both hold.
4. **A master abort may not cite the independent child's evidence.** 02 §7.7 item 1; 05 §2.8 `evidence_ref`; 04 §2.1.1; T-237 ("evidence of an independent child … ⇒ `ACC1_CLOSURE_ABORT_INVALID`").
5. **Deterministic deadlock.** Take an independent child C that cannot complete: it cannot drain because an authority restriction or client status denies CDA-1…4 (01 §7.1), or its seal is blocked by a `court_order` restriction (02 §7.4). Meanwhile the family members are drained, sealed and `clear`.
   - Master seal: refused forever (`ACC1_CLOSURE_FAMILY_INELIGIBLE`).
   - Master abort: no admissible evidence, because the family members are `ready`/`clear` and C's evidence is excluded.
   - C's own abort: refused at commit by `trg_acc1_closure_family`.

   The master stays `closing` (all non-drain activity denied). Every master-directed child stays barred. The client is un-closable.
6. **If instead the trigger were relaxed to honour 02 §7.7, the family still has no exit.**
   - C returns operational under a `closing` master.
   - C cannot be re-initiated (02 §7.1 item 4: master `closing` ⇒ `ACC1_CLOSURE_FAMILY_MEMBER`).
   - Its immutable member row still says `independent_preserved`, so the master seal still requires it `closed`.
   - The same abort-evidence gap applies, and 01 §7.4 item 6's statement fails.

   Either reading leaves no deterministic exit. This contradicts ACC-R2-HD-03, and ACC-R3-HD-01 items 6 and 8 (the blueprint must *define* how independent closures are identified **and preserved** within a workable family lifecycle).

**Affected sections:** 01 §7.3, §7.4 steps 3, 5, 6; 02 §7.1 item 4, §7.7 items 1–2; 04 §2.1.1 (`abort_closure`); 05 §2.8, §2.10, §5 (`trg_acc1_closure_family`, `trg_acc1_seal`, `trg_acc1_family_membership`); 06 §1 rules 7–8, §6 invariant 7; 07 §2 (`acc1.subaccount.close_abort`); 10 T-202, T-203, T-237, T-238; 12 row 41; 13 R-8; 14 §5.

**Required correction (the author chooses one; make every file agree):**

- **(a) Allow the independent child to return.**
  - Permit an `independent_preserved` member to return to its operational projection under a `closing` master by exempting that membership in `trg_acc1_closure_family`, invariant 7 and R-8.
  - Make "an `independent_preserved` member that is neither `closed` nor still in its own closure" an admissible **ground** for a master abort, verified from ACC-01's rows. The master abort still never touches that child.
- **(b) Keep the trigger.**
  - Withdraw "even while its master is `closing`" and T-238's success case.
  - Make an independent member's latest blocking evidence an admissible **ground** (not a scope) for the master abort. The abort returns only the master, the default and master-directed children, and the independent child's closure is untouched.
- **In both options:**
  - state what the next family initiation does with a preserved row after a family abort;
  - add tests for an independent child that is stuck, one that aborts, and one that completes during a family closure;
  - assert that no reachable state leaves the family without a governed exit.

**Implementation impact:** phase 1 (triggers, membership rules), phase 5 (seal eligibility, abort evidence), reconciliation R-8/R-9.

**Human decision required: NO.** This lies within ACC-R3-HD-01 items 6 and 8. The rule excluding independent evidence was the pack's own design choice following R3-F05, not a human decision.

### ACC-01-R4-F03 — MEDIUM — Under maker-only initiation, a drained target cannot be returned from `closing` if the checker declines the seal; WF-27's `rejected` outcome is unrepresentable and the stated mitigation is false

**Evidence:**

1. **Initiation is applied immediately.** Initiation is maker-only and is `applied` in the same transaction that moves the target (for a master, the whole family) to `closing` (02 §7.1 item 3; ACC-R3-HD-02).
2. **Every abort ground needs failing evidence** (02 §7.7 item 1). A **drained** target yields `ready` readiness and, before the seal, no attestation, so it has no admissible abort evidence (`ACC1_CLOSURE_ABORT_INVALID`).
3. **If the checker declines the seal, the target stays `closing` indefinitely.**
   - All non-drain activity is denied (01 §7.1).
   - It counts against limits (01 §6). With the initial one-master-per-client policy, the client cannot open a replacement master.
   - For a master, every subaccount is affected.
   - The only exit is to seal and complete, i.e. to close.

   A single entitled maker can therefore force a drained account structure into a state whose only exit is closure.
4. **The pack claims the opposite.**
   - 07 §4 item 5: "the maker-checker governed abort that **undoes it**".
   - 12 row 46: "maker-checker governed abort undoes it".

   Under the pack's own evidence rule this is false for exactly the drained case.
5. **This conflicts with WF-27.** Workflow Map §31.2 includes a terminal **`rejected`** state, and §31.4 item 9 blocks closure while "maker-checker incomplete". Under v0.4 a checker's rejection of a drained target's closure is not representable. The account is neither closed nor returned.
6. **The decisions do not cover this case.**
   - ACC-R3-HD-02 accepted that `closing` is restrictive; it did not decide that an unwanted initiation is **irreversible**.
   - ACC-R2-HD-03 limits abort to "if closure cannot safely complete" and "not a normal operational shortcut".

   The reviewer does not reject maker-only initiation. The gap is the missing return path and the false mitigation.

**Affected sections:** 01 ACC-REQ-045, ACC-REQ-054, §7.3; 02 §7.1, §7.7; 06 §1.1; 07 §4 item 5; 12 row 46; 14 §5; 17 HD-4 note, DCR-ACC-IAM-07; 10 T-239…T-243.

**Required correction:**

1. **Now, no decision needed:** withdraw the false mitigation in 07 §4 item 5 and 12 row 46, and state the drained-target consequence plainly.
2. **Human decision** between:
   - **(a)** a maker-checker `abort_closure` ground for a rejected or withdrawn initiation, legal **only from `closing`** (never from `closure_sealed`), fully audited, which represents WF-27 `rejected`; or
   - **(b)** explicit acceptance that an unwanted initiation of a drained target is resolved only by completing the closure, recorded in file 17 §4, the runbooks and the HD-4 note.
3. Tests for whichever is chosen.

**Implementation impact:** phase 1 (`reason_code` set, if (a)), phase 5 (abort), runbooks.

**Human decision required: YES.** Option (a) touches ACC-R2-HD-03 ("not a normal operational shortcut") and the effect of ACC-R3-HD-02.

### ACC-01-R4-F04 — LOW — Configuration still decides *which* attesters completion requires, and 14 §2 overstates what is independent of configuration

**Evidence:**

1. **The attester set is not pinned for completion.**
   - Seal, completion and the DB backstop all require the latest row of "**every configured attester**" (01 §7.2; 02 §7.6; 04 §2.4; 05 §5 `trg_acc1_seal`).
   - The seal pin records one row per attester (05 §2.9), but completion is not bound to that pinned set. Removing an attester from configuration after the seal reduces the evidence completion requires.
   - The DB trigger cannot know "configured": the pack itself says freshness is checked by the application "because that setting is configuration, not database state" (05 §5).
2. **Peer identity is a configuration trust anchor that the pack does not name.**
   - 14 §2 states that for the five runtime dependencies "**nothing** about them rests on ACC-01's configuration".
   - Peer **base URLs** are configuration (01 §4.5; 05 §8), and no authentication of the *responder* is specified (mTLS, signed responses, or an authenticated channel).
   - A service at a configured URL that returns well-formed attested records, scope statements and a descriptor satisfies every runtime `DEP-*`. The test-double source guard (T-121, T-188) covers only in-process imports.
   - This is the ordinary internal trust model, and ACC-R3-HD-03 route A is still met. But the statement is an overclaim, and R3-F03 item 5 asked the pack to say what rests on deployment review.
3. **`commit_ordered_watermark = true` is LED-01's self-declaration.**
   - It appears in LED-01's own descriptor (01 §4.5; 17 LED-01c (vi)). ACC-01 cannot verify commit ordering at runtime.
   - ACC-R3-HD-03 explicitly allows verifying the attester descriptor, so this is acceptable. The proof of the property, however, rests on the reviewed delivery of DCR-ACC-LED-01c. The pack presents it as "behavioural" (14 §2 "Runtime — behavioural").

**Affected sections:** 01 §4.5, §7.2; 02 §7.6; 04 §2.4; 05 §2.9, §5; 14 §2, §4; 17 DCR-ACC-LED-01c.

**Required correction:**

- Pin the attester set in the seal pin and require, at completion, every **pinned** attester, never fewer. Include any attester added later, if the design wants that.
- State in 01 §4.5 and 14 §2 that peer identity (endpoint and network) is a deployment trust anchor. Either require authenticated peer responses, or record the peer-endpoint binding as explicit deployment-review evidence.
- State that commit ordering is LED-01's declared contract, proven by LED-01's reviewed implementation, not by ACC-01 at runtime.

**Implementation impact:** phase 1 (pin columns and trigger), phase 5 (completion); documentation.

**Human decision required: NO.**

### ACC-01-R4-F05 — LOW — The human-decision checkpoint record misstates the conductor's CLI surface

**Evidence:**

- `06-human-decision-r3.md` §1 ("Runtime record" row) and `05-remediation-r3.md` §1 state: "The conductor has **no CLI command** that resolves a `HUMAN_DECISION_REQUIRED` for a manual planning task; the transition rules are library rules (`transitionTask`)".
- The actual `aix-conductor` `00a7bde` `src/cli.ts` L386–393 provides `task transition ID STATE [--approved-by NAME]`.
  - Its handler `taskTransition` (L212–232) loads the runtime record and derives the gate (`resolve_human_decision` for `HUMAN_DECISION_REQUIRED → PLANNING`).
  - It requires `--approved-by` and an interactive typed APPROVE, then applies `transitionTask`.
- The command could not act on ACC-01 **only** because ACC-01 has no runtime record in `state/tasks/`. The accurate statement is: *the CLI exists but operates on the conductor's runtime store, where ACC-01 is not registered.*
- **Substance is unaffected.** The legal path, the over-limit semantics, `planning = 4` and the relayed approval are correct (§3).

**Affected sections:** `06-human-decision-r3.md` §1; `05-remediation-r3.md` §1 (task records, not the blueprint).

**Required correction:** Record the correction in the **next** task/conductor record; do not edit history. That record should also state whether ACC-01 is to be registered in the conductor's runtime store, so that the next `resolve_human_decision` goes through the conductor's typed-APPROVE gate rather than being relayed.

**Implementation impact:** none on v0.4.

**Human decision required: YES (conductor governance).** Whether to register ACC-01 in the conductor runtime state is a human/conductor choice.

### ACC-01-R4-F06 — INFO — Precision and editorial

1. **ACC-REQ-045 table row.** It has a stray fourth cell (`| ACC-R2-HD-03; R2-F01 |`) in a three-column table (01 §4.4).
2. **"A genuine entitlement check."** 02 §7.1 item 1 and 07 §2 call the step-10 lookup for `close_initiate` "a genuine entitlement check". IAM-02 `permission/check` takes `actor_id` from the request body (`routes/internal.ts`), so it checks the entitlement of the **asserted** actor. The pack already requires the attested initiator decision (07 §2, second bullet), which is the real control. Align the wording.
3. **Stale version label.** 17 OQ-04 still says "No cache in v0.3".
4. **Dependent statements.** 01 §7.4 item 6 and the 14 §5 runbook depend on the R4-F01 / R4-F02 corrections. Re-check them after those corrections.

**Totals (new):** MEDIUM 3, LOW 2, INFO 1.

## 8. Master-family closure adjudication (high-focus A)

| # | Attack | Result |
|---|---|---|
| 1 | **Family membership** — a child appearing after closure begins | **Holds.** The master `FOR SHARE` in `trg_acc1_sa_owner` against `FOR UPDATE` at initiation, plus `family_set_hash` preview binding (02 §4 item 3, §7.1 item 5; T-032, T-244) |
| 1 | — a child disappearing | **Holds.** No individual completion or abort of a master-directed child; `closed` only inside `closure_family_complete` (`trg_acc1_status_transition`, `trg_acc1_default_protected`; T-209) |
| 1 | — an independent child adopted, or a master-directed child mislabelled | **Holds.** `closure_family_id` is settable only at entry to `closing` (`trg_acc1_closure_barrier`). `trg_acc1_family_membership` requires `independent_preserved` to be `closing`/`closure_sealed` with `closure_family_id IS NULL` and to carry its own initiation id. Member rows are append-only |
| 1 | — family id / cycle reuse; stale membership on retry | **Holds.** Family id = the unique initiation id. A retry is a new initiation and a new family. Abort bumps cycles and never resets seal versions (T-204). Idempotent replay creates no second family (T-244) |
| 2 | **Default invariant** — abort, partial seal, failed master seal, failed completion, concurrent child close or creation, repeated closure, independent closure | **Holds as a safety invariant.** The deferred `trg_acc1_master_default_invariant`, the default protected rule, a single atomic completion, rollback on failure, the master-first lock order, and property test T-206. **But the invariant is kept partly by making some states unexitable** (R4-F01, R4-F02): the invariant holds, liveness does not |
| 3 | **Independent children** — identification | **Defined** (`closure_family_id IS NULL` + `independent_preserved` member row with its own initiation id) |
| 3 | — independent first / master first / concurrent | **Deterministic.** Both serialise on the master row. Independent first ⇒ the preview hash no longer matches, so re-preview, then `independent_preserved`. Master first ⇒ independent initiation refused (`ACC1_CLOSURE_FAMILY_MEMBER`) |
| 3 | — independent seals, or completes, while the master prepares to seal | **Deterministic.** Master-first locks: completes first ⇒ `closed`, eligible; else `ACC1_CLOSURE_FAMILY_INELIGIBLE` |
| 3 | — independent child **cannot** complete, or must abort, during the family | **Fails** → **R4-F02** |
| 4 | **Atomic completion** — one transaction; deterministic lock order; attestation, seal version, family id, cycle, barrier and pin rechecked under lock; nothing changes between verification and close | **Holds for safety** (01 §7.4 step 4; 02 §7.6; `trg_acc1_seal`; T-207, T-208). **Liveness defect**: the pinned hash includes attestation ids and conflicts with child freshness → **R4-F01** |
| 5 | **Family abort** — returns exactly master + default + master-directed children; never reopens a CLOSED independent child; clears only ACC-01's own projection; never loses or duplicates the default; never restores another authority's denial; family evidence is the latest row | **Holds** (02 §7.7; 05 §2.8; T-201, T-202, T-237). **Evidence gaps** make it unavailable in R4-F01 / R4-F02 states, and unavailable for a drained target (R4-F03) |

## 9. Independent-child adjudication

- **Identification is explicit and immutable**: `closure_family_member.membership = independent_preserved` with the child's own `independent_initiation_id`, and the row's own `closure_family_id IS NULL`.
- **Preservation from a master abort holds.** No status, barrier, cycle, pin or attestation of the child changes, and no recovery row is written.
- **The lifecycle of a preserved child during an open family is not coherent:**
  - its own abort is promised (02 §7.7, T-238) but refused at commit by `trg_acc1_closure_family`;
  - if it cannot complete, the master can neither seal nor abort (R4-F02).
- The race rules themselves are deterministic.

## 10. Readiness-pin adjudication (high-focus B)

**R3-F02 is genuinely closed.** The final checker approves one exact readiness object per attester.

| Binding | Where |
|---|---|
| readiness id, sequence, watermark, payload hash | approval payload (02 §7.4 item 1; 04 §2.1.1) → `closure_seal_pin_readiness` |
| closure cycle, target version, initiation id | payload → pin (`closure_cycle`, `target_version_approved`, `closure_change_request_id`) |
| family id / member set | payload (`closure_family_id`, `family_set_hash`) → pin |
| journal / pre-seal watermark | pin; attestation `preseal_watermark_ref` must equal it; `binding_ok` computed by the DB |
| approval / policy evidence, seal request payload | pin (`approval_id`, `approver_user_id`, `approval_policy_id` — `iam2_attested` only; `seal_payload_hash`) |

**Attack sequence** (approve readiness A → posting → readiness B → seal → attestation against B → completion):

| Step | Outcome |
|---|---|
| A posting after A changes the apply-time verification watermark | Seal refused (`ACC1_CLOSURE_NOT_READY`; T-222) |
| Readiness B inserted before the seal | A is no longer the latest ⇒ seal refused (`trg_acc1_seal`; T-215, T-217) |
| B attempted after the seal | Insert refused (`trg_acc1_readiness_insert`; T-214) |
| An attestation computed against B's watermark | `binding_ok = false`; never counts (T-220) |
| Completion asks for "latest readiness" | Never (T-216; R-10 flags an injected row) |
| Stale approval on a newly drained account, or abort and retry | Cycle and readiness ids differ ⇒ refused (T-204, T-217) |

**All fail, as required.** Residual: the attester set is not pinned for completion (R4-F04 (a)).

## 11. LED-watermark adjudication (high-focus C)

- **The contract is internally coherent.**
  - With a **commit-ordered** W_pre from the pin, a posting resolved before the seal and committed after it has a commit position after W_pre, so `committed_after_preseal_watermark > 0` and completion blocks.
  - A posting that ignored the barrier carries a resolution version ≥ `closure_sealed_at_version`.
  - Neither check uses wall-clock time; `as_of` is secondary.
  - A posting committing between the apply-time verification (A2) and the seal commit is caught by the post-barrier count: the target stays barred and abort is available. This is fail-closed.
- **Honesty:**
  - The pack does not pretend the seam exists. DCR-ACC-LED-01c (v)–(vii) *requires* the ordering and states that without it `DEP-LED-CLOSURE-CONTRACT` stays unsatisfied and closure cannot complete.
  - No `led1` service exists in `platform/services`.
  - **This remains an external gate.**
- The descriptor flag is LED-01's own declaration. Proof rests on LED-01's reviewed implementation (R4-F04 (c)).

## 12. Maker-initiation adjudication (high-focus D)

| Check | Result |
|---|---|
| Not approval-gated through the IAM short-circuit | **Holds.** `acc1.*.close_initiate` has `requires_approval = false`; a catalogue guard (T-240, T-241); no approval seam imported (source guard) |
| Externally gated until the entitlement-checkable seam exists | **Holds.** Needs the attested initiator decision (DCR-ACC-IAM-07/-06; `DEP-IAM-ENTITLEMENT`, `DEP-IAM-ACTOR-BINDING`); refused against today's IAM-02 stub (T-241) |
| No caller-supplied identity proves entitlement | **Holds for the gate.** Precision: the step-10 lookup uses a body `actor_id` (R4-F06.2); the attested record is the control |
| DCR-ACC-IAM-07 coherent | **Yes.** Same attested-record contract for a non-approval code; Role Matrix assigns holders (GOV-02) |
| Final checker immediately before the seal; no second checker invented | **Holds** (02 §7.4 item 2; ACC-REQ-044; T-243) |
| Interaction with pending HD-4 | **Recorded honestly as an interaction** (17 HD-4; IAM-07; 07 §4 item 5). HD-4 is not decided by it. **But** the mitigation "the governed abort undoes it" is false for drained targets → **R4-F03** |

Maker-only initiation itself is **not** rejected. `closing` being restrictive was knowingly accepted by ACC-R3-HD-02.

## 13. DEP evidence adjudication (high-focus E, F)

| DEP | Authoritative source | Evidence produced / asserted by | How ACC-01 verifies | Class | Failure | Config / string / boolean / caller assertion can satisfy? |
|---|---|---|---|---|---|---|
| `DEP-IAM-ACTOR-BINDING` | IAM-02, validating against IAM-01 | IAM-02 attested record: `actor_assertion_authority`, `authenticated_actor_id`, maker, checker, approval, policy, entitlement, payload hash, action, resource, entity/client, credential scope | Per call; every field equal to the request; the forwarded IAM-01 reference is byte-identical; ACC-01 never mints an assertion | Runtime | Seam absent (no token consumed), field missing or mismatched ⇒ refused | **No** (residual: peer-identity anchor, R4-F04 (b)) |
| `DEP-IAM-ENTITLEMENT` | IAM-02 policy/grant evaluation | Per-role `entitlement_evidence` block in the attested record | Per call; actor and permission code must match; `approval_required` / `execution_authorised` alone never counts; `IAM2-FIND-002` status is not consulted | Runtime | Block absent, false, or another actor/code ⇒ refused | **No** |
| `DEP-IAM-SCOPED-CREDENTIAL` | IAM-02 credential metadata | `credential_scope` / `credential_id` on every IAM-02 response | Per call; exact narrow set | Runtime | No statement, or broad/unknown ⇒ refused (unsatisfied today by design) | **No** |
| `DEP-CLT-READ-SCOPE` | CLT-01 seam / credential metadata | Scope statement on the status response | Per read; exact match; no fallback | Runtime | `unknown` / refused / R-3 inconclusive | **No** |
| `DEP-LED-CLOSURE-CONTRACT` | The actual LED-01 attester(s) | Attester descriptor (incl. `commit_ordered_watermark`) plus validated readiness/attestation responses | Operation-time descriptor fetch (never at readiness); per-call response validation; not needed by abort | Runtime | Unreachable, malformed, stale, non-commit-ordered ⇒ refused; empty set ⇒ unconfigured | **No** from a string. Residuals: which attesters are required and where they are is configuration (R4-F04 (a), (b)); commit ordering is LED-01's declaration (R4-F04 (c)) |
| `DEP-FREEZE-GOVERNANCE` | Governance record closing DCR-ACC-GOV-05 | None at runtime | Production composition root binds a hard-unsatisfied gate | Governance-only | Always `GOVERNANCE_HARD_UNSATISFIED` | **No.** Liftable only by an approved, independently reviewed ACC-01 code change citing the record (T-224) |
| `DEP-PUBLIC-PERIMETER` | Governance record closing `FND-FIND-001` / DCR-ACC-FND-01 | None at runtime | As above; client routes not served | Governance-only | Always refused | **No** |

- **No environment logic is reintroduced.** CFG-01 remains the sole `ENVIRONMENT_AVAILABILITY` authority, and DCR-ACC-CFG-02 route B is consumption only.
- **IAM actor provenance (high-focus F):** the target contract binds the authenticated actor, maker/initiator, checker, approval, policy, entitlement/grant evidence, payload, action, resource and client/entity scope. The assertion originates from IAM-01 and is validated by IAM-02 through its own seam; it does not echo ACC-01. The external implementation is pending.

## 14. Abort recovery adjudication (high-focus G)

| Check | Result |
|---|---|
| Abort does not require `DEP-LED-CLOSURE-CONTRACT`; usable when the attester or contract failed | **Holds** (01 §4.5; 02 §7.7; T-236) |
| Master-family evidence semantics | **Defined** (T-237), but **incomplete**: no ground covers an unattainable completion (R4-F01) or a stuck independent member (R4-F02) |
| Independently initiated child closure preserved | **Holds** against master abort; its own abort contradicts the trigger (R4-F02) |
| Maker-checker; not a convenience reopen | **Holds** (approval-gated `*.close_abort`; Critical audit; closed evidence set; no reopen route, T-178). The honest statement of R3-F05.4 is made |

## 15. Remaining external gates (correctly carried; none is closed by this pack)

- **`DEP-IAM-ACTOR-BINDING`** — DCR-ACC-IAM-06.
- **`DEP-IAM-ENTITLEMENT`** — `IAM2-FIND-002` (OPEN, HIGH); DCR-ACC-IAM-03/-04/-02b/-02c/-07; DCR-ACC-GOV-02.
- **`DEP-IAM-SCOPED-CREDENTIAL`** — DCR-ACC-IAM-05.
- **`DEP-CLT-READ-SCOPE`** — DCR-ACC-CLT-03.
- **`DEP-LED-CLOSURE-CONTRACT`** — DCR-ACC-LED-01c/-01e, including the **commit-ordered watermark** and the descriptor seam. No LED-01 service exists.
- **`DEP-FREEZE-GOVERNANCE`** — DCR-ACC-GOV-05; hard-unsatisfied in code.
- **`DEP-PUBLIC-PERIMETER`** — `FND-FIND-001` (OPEN, HIGH); DCR-ACC-FND-01; hard-unsatisfied in code.
- **Real closure initiation** — DCR-ACC-IAM-07.
- **Consumer adoption** of barrier-first evaluation, the drain allow-list and the CDA-1 discriminator — DCR-ACC-LED-01b/-01e, DCR-ACC-CONS-01, DCR-ACC-CFG-01.
- **Environment availability** — DCR-ACC-CFG-02 (CFG-01).
- **Client money** — `A2-Q1` / `A2-Q2`.

| RF | Disposition |
|---|---|
| **RF-01** IAM-02 entitlement | **EXTERNAL GATE REMAINS** — now honestly fail-closed on per-call evidence (the R3-F03 caveat is removed) |
| **RF-02** mistaken-creation deadlock | **EXTERNAL GATE REMAINS** — creation now needs the attester's operation-time descriptor, not configuration. Residual: R4-F04 (b) |
| **RF-05** CLT-01 credential | **EXTERNAL GATE REMAINS** — the general token states no scope ⇒ refused per read |
| **RF-09** freeze ownership | **EXTERNAL GATE REMAINS** — hard-unsatisfied in code |

## 16. Task / conductor consequence

- **`task.json`:** state `PLANNING`, `roundCounts.planning = 4` (a human-authorised over-limit entry, valid per §3), `acceptanceStatus = NOT_ACCEPTED`. **Not modified by this review.** `PLAN_READY` is **not** set. Implementation eligibility is **not** created.
- **REMEDIATE ⇒ a v0.5 must not be started silently.** Under the actual conductor (verified in memory against `dist/state.js`):
  - `PLANNING → PLANNING` is illegal.
  - `PLAN_READY → PLANNING` at `planning = 4` is **redirected** to `HUMAN_DECISION_REQUIRED` (`limitRedirect: maxPlanningRounds`). In any case `PLAN_READY` must not be taken on a REMEDIATE verdict.
  - The only legal route to another planning round is `PLANNING → HUMAN_DECISION_REQUIRED` (ungated) → `resolve_human_decision` → `PLANNING`, with `planning` 4 → **5** (a further human-authorised over-limit entry; executed in memory).
- **Another `HUMAN_DECISION_REQUIRED` cycle is therefore required before any further planning turn.** That checkpoint should also:
  - take the **R4-F03** decision;
  - correct the **R4-F05** statement, and decide whether ACC-01 is registered in the conductor runtime store so that the approval is given through `task transition` rather than relayed;
  - transcribe this review into `findingsSummary`. The existing convention does not count INFO. Transcription: open R4-F01…F05; R3-F02/03/04/06/07 closed; R3-F01 and R3-F05 superseded by R4-F01/F02; RF-01/02/05/09 remain as external gates.
- **Not an ESCALATE:** the defects are design corrections, not reviewer/model capacity limits.
- **Not a bare HUMAN_DECISION:** R4-F01, R4-F02 and R4-F04 need no human decision; R4-F03 and R4-F05 do.
- **If a future re-review returns ACCEPT:** the blueprint architecture would be acceptable, but implementation would remain unauthorised pending the human / conductor `approve-plan` checkpoint and integration of the branch.

## 17. What this review does not do

It does not:

- modify v0.4 (or v0.1…v0.3), `task.json`, any master or register (`OPEN_FINDINGS`, `DECISION_LOG`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`), `platform/**`, the conductor, or `main`;
- create `06-acceptance.md`;
- take any human decision;
- start remediation;
- merge.

**Implementation is not authorised.**
