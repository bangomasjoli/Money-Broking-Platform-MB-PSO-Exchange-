# 04 Review (round 3) — ACC-01: Account Structure blueprint pack v0.3

- **Task ID:** ACC-01 (planning task — blueprint pack, no implementation)
- **Reviewer:** independent architecture / compliance reviewer / claude-opus-5-5 / HIGH
- **Pack under review:** `docs/02_modules/ACC-01/blueprint/v0.3/` at `194aff0` (the remediation of `04-review-r2.md`, which gave verdict REMEDIATE at `b5c21bd`)
- **Author of v0.1, v0.2 and v0.3:** blueprint planner / claude-sonnet-5 (per `01-plan.md`, `05-remediation.md`, `05-remediation-r2.md`)
- **Independence:** **separate context.**
  - This review ran in a **new Claude Code session**. It carried no conversation from the authoring, remediation or earlier review sessions.
  - Everything below was re-derived from the repository: the v0.3 text, the governing decisions and masters, and the IAM-02 and CLT-01 source.
  - `05-remediation-r2.md` was read only as a map of what was claimed. It was **not** used as evidence.
  - The reviewer is the same model as the round-1 and round-2 reviewers, and a different model from the author.
- **Decision:** **REMEDIATE**
- **Implementation authorised:** **No.** Nothing is accepted. No `06-acceptance.md` exists or is created.
- **Conductor consequence:** planning rounds are exhausted (3 of `maxPlanningRounds` 3). **The next planning turn requires HUMAN_DECISION_REQUIRED / conductor escalation. A v0.4 must not be started silently** (§11).

## 1. Baseline verification (all passed)

| Check | Result |
|---|---|
| Worktree | `/Users/AimanRahimi/AIX-worktrees/acc-01` |
| Branch | `module/ACC-01` |
| HEAD | `194aff0` (= `origin/module/ACC-01` after fetch) |
| Working tree | clean before this review |
| History | `43f2f34` → `42316fe` (v0.1) → `2e26d13` (review 1) → `8ff4e9d` (v0.2) → `b5c21bd` (review 2) → `194aff0` (v0.3) |
| `main` / `origin/main` | both `43f2f34`; untouched; `43f2f34` is an ancestor of HEAD; nothing merged |
| Diff `43f2f34..194aff0` | **All** files are under `docs/02_modules/ACC-01/**` or `docs/03_implementation/tasks/ACC-01/**`. No `platform/**`, no migration, no master, no register |

## 2. Sources reviewed

**Decisions:**

- `DEC-011`, `DEC-013`, `DEC-014`.
- The approved human decisions recorded in v0.3 file 17 §4.1 and §4.3 (ACC-HD-1…3, RF-02, Closure safety, Retention, ACC-R2-HD-01…08).

**Masters (relevant sections only):**

- Workflow Map v1.3 WF-27 §31 (steps 1–11; blocking conditions).
- Role & Permission Matrix v1.3 L417 ("Close client account").
- Decision pack §4.7 (purpose of the default subaccount: "subaccount dimension present from the first migration").
- Doc 00 §1.D and Module Index §19 rule 7, as cited by round 2.

**Task records:**

- `04-review.md`, `04-review-r2.md`, `05-remediation.md`, `05-remediation-r2.md`.
- **All 18 v0.3 files were read in full.**

**Source inspected read-only:**

| Area | Fact re-verified at HEAD |
|---|---|
| IAM-02 `lib/guard.ts` | Step 6 (`requires_step_up`) precedes step 7 (`requires_approval` → `approval_required`), which precedes the step-10 role lookup |
| IAM-02 `routes/internal.ts` | `execute-verify` takes `actor_id` from the body, `approval_id` is optional, and `current_payload_hash` is ≤ 128 characters |
| IAM-02 `routes/approvals.ts` | Guarded only by `iam2InternalServiceToken`. `maker_user_id` / `approver_user_id` are body fields. The `decision_token` is returned in the `/approve` response |
| CLT-01 `routes/clients.ts` | `/internal/clt1/clients/:client_id/status` is guarded by the single `clt1InternalServiceToken`. The same guard factory is used 28 times across CLT-01 routes |
| Conductor `aix-conductor` `00a7bde` (not modified) | `PLANNING → {PLAN_READY, HUMAN_DECISION_REQUIRED, FAILED}`. Entering `PLANNING` consumes `maxPlanningRounds` (`config/example.config.json`: 3) and redirects to `HUMAN_DECISION_REQUIRED` beyond the limit. `validateTaskManifest(task.json)` → `{"ok":true,"errors":[]}` |

The pack's §0 statements about current IAM-02 (file 02) match this source.

## 3. Verdict

**REMEDIATE.**

v0.3 is a substantial and largely honest remediation. It removes the round-2 money trap and the round-2 deadlock:

- funded accounts can now drain;
- sealing requires pre-seal readiness;
- a governed exit exists;
- master and default no longer block each other.

It also:

- makes the closure barrier an independent fact evaluated first;
- withdraws every false IAM-02 claim;
- removes all environment-name logic.

Three **MEDIUM** blueprint defects remain in the high-focus areas:

1. **R3-F01.** A master abort after its children have closed leaves an **ACTIVE master with a permanently CLOSED default**. There is no path to restore a default, and the next master closure is undefined. Correcting it needs an amendment to an approved human decision (ACC-R2-HD-04).
2. **R3-F02.** Completion compares the post-barrier attestation against **"the latest readiness for the cycle"**, not against the readiness the checker approved and the seal was applied on. Readiness rows can be appended after the seal, and the post-barrier attestation carries no "drained" assertion. The seal-to-completion race closure therefore depends on a binding the pack does not pin.
3. **R3-F03.** Several `DEP-*` prerequisites can be satisfied by **self-declared configuration**. The type-G dependencies are a configuration string presented as governance evidence.

These are not external dependencies. They must be corrected, and R3-F01 needs a human decision first, before the pack can be accepted.

## 4. R2-F01 … R2-F09 disposition

| Finding | Sev | Disposition | Basis (v0.3 text) |
|---|---|---|---|
| **R2-F01** funded account can never drain or exit | HIGH | **SUPERSEDED BY NEW FINDING — R3-F02** (core defect closed; LED-01 contract remains an external gate) | Items 1–3, 5 and 6 are delivered. Drain allow-list: 01 §7.1, ACC-REQ-043, 06 §2.0. Seal precondition: 01 §7.2, 02 §7.3–7.4, `trg_acc1_seal`, T-166/167. Governed abort: 01 §7.3, 02 §7.7. Latest-row semantics: T-172/173. Entitled seal/complete once IAM is fixed: 07 §2. The money trap is gone. **Item 4** (the race closure) is only as strong as the watermark the attestation is compared against. That binding is not pinned (R3-F02) |
| **R2-F02** master/default deadlock | MEDIUM | **SUPERSEDED BY NEW FINDING — R3-F01** (deadlock closed) | The circular rule is removed. Master and default enter `closing` atomically, and the default follows the ordinary child path (05 `trg_acc1_default_protected`, `trg_acc1_closure_family`; T-031, T-160, T-162). The `FOR SHARE` master read covers A4 and `trg_acc1_sa_owner` (T-164). The replacement design introduces the invalid recovered master of R3-F01 |
| **R2-F03** barrier masked by worst-of status | MEDIUM | **CLOSED IN BLUEPRINT** | `closure_barrier` is stored, returned separately and evaluated first, and no status can mask it (01 §10, ACC-REQ-042; 04 §3.1; 06 §2.0, §2.3). Components are conjunctive. `effective_status` is descriptive. GOV-04 is defined over components. Tests T-153…157. Enforcement in consumers remains DCR-ACC-LED-01b/-CONS-01 (external, correctly carried) |
| **R2-F04** apply actor binding | LOW | **CLOSED IN BLUEPRINT** — real apply is an **EXTERNAL GATE** (`DEP-IAM-ACTOR-BINDING`) | False claims withdrawn (02 §0 facts 4–6; 07 §3–4). Token delivery corrected. `approval_id_source = caller_asserted`. Step-up ordering corrected and matches `guard.ts`. Target contract DCR-ACC-IAM-06. Residual precision gap in that DCR: **R3-F04** (LOW) |
| **R2-F05** credential gate coverage | LOW | **CLOSED IN BLUEPRINT** — credentials remain an **EXTERNAL GATE** (DCR-ACC-CLT-03, -IAM-05) | `DEP-CLT-READ-SCOPE` covers resolve, batch, submit, every apply and R-3 (01 §4.5; T-186). General tokens are forbidden in every environment, and doubles are dependency injection (T-188). Overclaimed detection of the general token: see R3-F03 |
| **R2-F06** residual entitlement tests | LOW | **CLOSED IN BLUEPRINT** | T-048/T-066 rewritten with `KNOWN_GAP_IAM2_FIND_002` and the `DEP-IAM-ENTITLEMENT` gate (T-189). No remaining test asserts an approval-gated denial by current IAM-02 |
| **R2-F07** restriction lifecycle | LOW | **CLOSED IN BLUEPRINT** | `cancel_scheduled_restriction` (02 §6; 05 §2.3–2.4; 06 §3). Inline activation on lift. Legality by effective time, never by housekeeping. Version bump on cancel. Composite FKs untouched. Maker-checker (`acc1.restriction.cancel` approval-gated) plus `DEP-FREEZE-GOVERNANCE`. Tests T-192…198. Minor time-source precision is noted in R3-F07 (INFO) |
| **R2-F08** parallel environment control | MEDIUM | **CLOSED IN BLUEPRINT** | G1–G6 are withdrawn. A full grep of v0.3 finds environment names only in recording, tests parameterised identically over all five environments, and negations. No branch logic. CFG-01 is the sole authority (ACC-R2-HD-06; DCR-ACC-CFG-02). The strength of the replacement `DEP-*` evidence is a **new** defect: R3-F03 |
| **R2-F09** editorial | INFO | **CLOSED IN BLUEPRINT** | README cites 17 §4.2 and OQ refs. T-045 and 04 §5 updated. 05 §2.2 has a single index statement (line 82 is an explanatory note, not a duplicate) |

## 5. Prior RF findings

| RF | Disposition | Check |
|---|---|---|
| **RF-04** `blocked_scopes` fail-open | **CLOSED — not regressed** | Still explanatory only (`scope_semantics`). The consumer rule is strengthened (barrier first, conjunctive). T-041/140/141 intact. The drain exception applies only under `closing` and only to CDA-1…4 |
| **RF-06** restriction owner binding | **CLOSED — not regressed** | 05 §2.3 composite FKs unchanged. Cancel columns added without touching them. T-145 |
| **RF-08** scheduled-restriction timing | **CLOSED — not regressed** | Time-effective rule intact (06 §3). Cancel and inline activation bump `version`. `applied_restriction_ids` unchanged |
| **RF-10** DCR classification / dependencies | **CLOSED — not regressed** | Five classes. New DCRs classified. Readiness makes no peer call (T-132/191). No ACC-01 → CFG-01 edge |
| **RF-11** not an eligibility authority | **CLOSED — not regressed** | 01 §4.6, ACC-REQ-013, T-150 |
| **RF-01** IAM-02 entitlement | **EXTERNAL GATE REMAINS** — honestly carried | `DEP-IAM-ENTITLEMENT`; `IAM2-FIND-002` not claimed fixed. **Caveat R3-F03:** the gate's evidence form is a declared contract version that nothing verifies |
| **RF-02** mistaken-creation deadlock | **EXTERNAL GATE REMAINS** — honestly carried | `DEP-LED-CLOSURE-CONTRACT` gates creation. **Caveat R3-F03:** at creation time that dependency is satisfied by declared configuration alone. The approved RF-02 substance ("creation only once closure is completable") is therefore not enforced against a declared-but-absent attester |
| **RF-05** CLT-01 credential | **EXTERNAL GATE REMAINS** — honestly carried | `DEP-CLT-READ-SCOPE`. **Caveat R3-F03:** until DCR-ACC-CLT-03 lands, the only credential that works against real CLT-01 **is** the general token (S9 re-verified). ACC-01 cannot detect that it has been given it |
| **RF-09** freeze ownership | **EXTERNAL GATE REMAINS** — honestly carried | `DEP-FREEZE-GOVERNANCE` (type G). Nothing invented. **Caveat R3-F03:** type-G evidence can be self-declared |

## 6. New findings

Severity uses HIGH / MEDIUM / LOW / INFO. "Blocking" means blocking **acceptance of the pack or of the named phase**.

### ACC-01-R3-F01 — MEDIUM — Master abort after child closure leaves an ACTIVE master with a permanently CLOSED default; the default invariant cannot be restored and future master closure is undefined

**Evidence:**

1. **Children close irreversibly before the master's own readiness is known.** ACC-R2-HD-04 / ACC-REQ-046 / 02 §7.8 require every child, the default included, to reach `closed` before the master may seal. The master's own pre-seal readiness and final approval come only after that (02 §7.8; T-160).
2. **A master-level failure after that point is recovered by a master abort.** Examples: a master readiness `not_ready` (for instance a master-level reconciliation break), a blocked master attestation, or an authority restriction on the master. The abort returns "the master and every listed non-closed child", and "Children already `closed` stay `closed`" (01 §7.3 L262; 02 §7.7 item 2; 06 §1 rule 8). T-176 asserts this, including for the default. 13 R-8 explicitly declares "a closed default under a still-open master is legitimate after an abort".
3. **The resulting state cannot be repaired:**
   - `UNIQUE (master_account_id) WHERE is_default` is **not** filtered by status (05 §2.2 L78). A second default can never be inserted, even though the first is `closed`.
   - `is_default` is immutable (`trg_acc1_sa_immutable`, 05 L251).
   - No change type creates or designates a default after master creation (02 §1; 04 §2.1.1). The default is created only "atomically with the master" (ACC-REQ-018, ACC-HD-1).
4. **The pack's own reason for the default is lost.** "It exists so LED-01 always has a subaccount dimension" (01 §8). That matches decision pack §4.7 ("dimension present from the first migration, even if only a single default subaccount is provisioned"). A master closed down to its default and then aborted is **ACTIVE with zero open subaccounts**. The author's "harmless because nothing resolves the default" (01 §7.3) addresses only fallback resolution (ACC-HD-1). It does not address the structural invariant.
5. **The next master closure is undefined.** ACC-REQ-046, 02 §7.1 item 2 and 06 §1 rule 7 require "the master **and its default** `general` subaccount enter `closing` atomically". For this master that rule cannot be satisfied.
   - The DB (`trg_acc1_closure_family`) would admit a closure without the default.
   - The application rule as written would refuse it.
   - An implementer must choose. Refusing makes the master, and through DCR-ACC-CLT-01 the client, **permanently un-closable** (the R2-F02 consequence again). Admitting it silently departs from ACC-REQ-046.
   - No test covers either path.
6. **Other invariants checked (these hold):**
   - Account resolution of the closed default resolves `closure_barrier = true` ⇒ deny (correct).
   - `scope-validate` refuses a `closed` triple, so IAM-02 grants scoped to the old default fail closed (correct).
   - `open-accounts` counts the recovered master (correct).
   - Default uniqueness holds, but only by making restoration impossible.

**Affected sections:** 01 §7.3, §8, ACC-REQ-018, -045, -046; 02 §7.1, §7.7, §7.8; 05 §2.2 (default index), §5 (`trg_acc1_default_protected`, `trg_acc1_closure_family`); 06 §1 rules 7–8, §6; 10 T-160, T-176; 13 R-8; 17 ACC-R2-HD-04.

**Required correction (architecture):**

- State a **structural invariant**: *every non-`closed` master has exactly one non-`closed` default subaccount*. Enforce it with a deferred constraint trigger, R-8 and a test.
- **Recommended architecture: a reversible fenced intermediate for master-directed children.**
  - Children that entered `closing` through the master's closure, the default always among them, advance to `closure_sealed` with a `clear` **latest** post-barrier attestation. They **stop there**. The barrier stands, so they are fenced, and they remain reversible through the existing governed abort.
  - The master may seal when every master-directed child is sealed and attested `clear`, and every other child is `closed`.
  - The master's completion compare-and-set closes the master **and** every master-directed child **atomically**, re-verifying each child's latest attestation at its current seal version in the same transaction.
  - A master abort returns every master-directed child, clearing their barriers in the same recovery transaction.
  - The default then reaches `closed` only together with its master, so the invariant holds. No circularity returns: child completion waits on master **completion**, master seal waits on child **seal**.
- **Alternatives, each also touching an approved decision:**
  - (b) the abort transaction re-establishes a new default. This needs a status-filtered default index and a governed "restore default" inside recovery, and touches ACC-HD-1 "created atomically with the master" and ACC-R2-HD-03 "restores the projection".
  - (c) the invariant is formally dropped. ACC-REQ-018 becomes creation-only, and the rule for closing a master without an open default is defined explicitly. This touches ACC-HD-1 and ACC-R2-HD-04.
- In all options, add tests for: master abort after the default closed; the next closure of that master; and client closure afterwards.

**Implementation impact:** phase 1 (index, triggers, deferred invariant), phase 5 (closure sequencing, completion, abort), and reconciliation R-8. Phases 0 and 2–4 are unaffected.

**Human decision required: YES.** The recommended architecture amends ACC-R2-HD-04 ("all children … must reach `closed` before the master may enter `closure_sealed`"). Options (b) and (c) touch ACC-HD-1 / ACC-R2-HD-03. The reviewer does not choose.

### ACC-01-R3-F02 — MEDIUM — The readiness the checker approved is not pinned to the seal; completion compares against "the latest readiness for the cycle", which can change after the seal

**Evidence:**

1. The whole resolved-before-seal / committed-after-seal defence rests on one number: W_pre, the readiness `journal_watermark`.
   - The post-barrier attestation carries **no** balance or open-item assertion (01 §7.2 table; 05 §2.7; DCR-ACC-LED-01c (iv)).
   - "Drained" is established **only** by the pre-seal readiness at W_pre, plus `committed_after_preseal_watermark = 0` relative to W_pre.
2. **Where W_pre is taken from is stated inconsistently:**
   - 01 §7.2 L244 and 02 §7.6 say "the **recorded** readiness watermark".
   - `trg_acc1_seal` (05 L258), the DB backstop, says `preseal_watermark_ref` "equals the **latest** readiness `journal_watermark` for that cycle".
   - 02 §7.5 does not say which value ACC-01 sends to the attester.
3. **Nothing prevents a readiness row from being appended after the seal in the same `closure_cycle`:**
   - The seal does not persist the sealed readiness watermark or row id on the target row. 05 §2.1 has no such column.
   - `closure_readiness` has no trigger requiring the target to be `closing` at insert. `trg_acc1_append_only` only blocks UPDATE/DELETE.
   - The readiness route checks "(target `closing`)" (04 §2.4) but is non-governed. Its sequence is status check → outbound attester call → insert, with no stated row lock, so it can race a concurrent seal apply.
   - `closure_cycle` does not change at seal (only at `closing` entry and abort).
4. **Attack sequence:**
   1. The seal is applied at approved W_pre.
   2. A posting resolved before the seal commits after it (for example completion of an open settlement under CDA-3).
   3. A readiness collection that raced the seal inserts W' > W_pre for the same cycle. Its status may even be `not_ready`, because the trigger compares only the watermark.
   4. Completion then takes `preseal_watermark_ref = W'`. The attester reports `committed_after_preseal_watermark = 0` relative to W'. `max_resolution_version_committed < closure_sealed_at_version` also passes, because the posting was resolved **before** the seal.
   5. **Closure completes with a post-seal posting and possibly a balance.** R-6 would detect this only after the fact.
5. **The watermark property the guarantee needs is unstated.** DCR-ACC-LED-01c says a posting committed after the seal "has a journal position after W_pre". That holds only if the watermark is **commit-ordered**. An insert-time sequence (identity/serial) can assign a position below W_pre to a transaction that commits later. The contract must require a commit-ordered position, or the equivalent LED-01-side guarantee.
6. **Change after approval.** The seal payload binds target `version` (04 §2.1.1), but 02 §7.4 step 3 does not list "current target `version` = approved `version`" among the A4 re-checks. T-168 covers only a watermark change. The readiness row does not record the closure request id or the target version it was taken against, although the route receives `closure_change_request_id` (04 §2.4).

**Affected sections:** 01 §7.2; 02 §7.3–7.6; 04 §2.4; 05 §2.1, §2.6, §5 (`trg_acc1_seal`); 06 §5; 10 T-168, T-170, T-171; 17 DCR-ACC-LED-01c.

**Required correction:**

1. At seal apply (A4), **persist on the target row** the sealed readiness binding per attester: readiness row id and W_pre. This is immutable until abort, and abort clears it. Completion, the attestation request and `trg_acc1_seal` all compare against that **persisted** value, never against "latest readiness". Align 01 §7.2, 02 §7.5–7.6 and 05.
2. **Readiness inserts are legal only while the target is `closing` at the current cycle,** checked under the target row lock in the inserting transaction (DB trigger). A readiness collected after the seal is refused.
3. The seal requires that the **persisted** readiness row is `ready` (as the latest at seal time) **and** that its watermark equals the approved W_pre.
4. A4 re-checks current target `version` = the approved payload `version`. Any restriction or other mutation after approval refuses the seal (new request). Add the closure request id and the observed target version to `closure_readiness`.
5. DCR-ACC-LED-01c requires W_pre and the attestation watermark to be a **commit-ordered** position, and states the consequence if LED-01 cannot provide one.
6. **Defence in depth:** the post-barrier attestation also asserts `balance_state ∈ {none, returned}` and zero open items at attestation time.
7. **Tests:** a readiness collection racing the seal (both orders), a post-seal readiness insert refused, completion against a later readiness refused, a restriction applied between approval and seal apply refusing the seal, and an out-of-order-commit posting detected.

**Implementation impact:** phase 1 (columns, triggers) and phase 5 (seal apply, completion, readiness route); LED-01c text.

**Human decision required: NO.** This is within ACC-R2-HD-02 and the closure-safety decision.

### ACC-01-R3-F03 — MEDIUM — `DEP-*` prerequisites can be satisfied by self-declared configuration; type G is a boolean presented as governance evidence

**Evidence:**

1. **Type G** (`DEP-FREEZE-GOVERNANCE`, `DEP-PUBLIC-PERIMETER`).
   - The evidence is a "declared governance reference". ACC-01 checks only that it is "present, well-formed and declared" (01 §4.5 L134–135, L152; 14 §2).
   - Any operator who sets a well-formed reference satisfies it. The underlying records are both **open** today: DCR-ACC-GOV-05 is undecided, and `FND-FIND-001` is HIGH and open.
   - The pack admits this ("ACC-01 does not pretend a declared reference is proof"). But the gate still **opens** on the declaration.
   - This is not fail-closed. It is a configuration boolean with an audit label.
2. **Type P is only partly verified by behaviour.**
   - `DEP-IAM-ACTOR-BINDING` is genuinely enforced per call: apply requires attested fields the current IAM-02 cannot return (02 §1 step 7; T-181).
   - The following are not:
     - **`DEP-IAM-ENTITLEMENT`.** Its evidence is a "declared IAM-02 contract version that enforces entitlement". Once DCR-ACC-IAM-06 exists, nothing in the attested record (01 §4.5; 04 §2.1; 17 DCR-ACC-IAM-06) proves that maker and checker entitlement was evaluated. A declared version then satisfies it even if `IAM2-FIND-002` is still open.
     - **`DEP-LED-CLOSURE-CONTRACT` at creation.** Creation makes no LED-01 call. "At least one attester configured and its declared contract version supports readiness + attestation" is satisfied by configuration alone. The approved RF-02 decision ("unavailable for real governed use until the LED-01 readiness attester exists") is therefore enforced only against an **empty** configuration, not against a declared attester that does not exist.
     - **`DEP-CLT-READ-SCOPE` / `DEP-IAM-SCOPED-CREDENTIAL`.**
       - Today both seams accept **only** the general token (source re-verified). The only credential that works against the real CLT-01 or IAM-02 **is** the general token, and ACC-01 cannot tell (01 §13 L341 "as far as detectable").
       - T-146, T-187 and 09 `ACC1_CONFIG_INVALID` nevertheless claim boot refuses "a dedicated credential equal to a general peer token". ACC-01 does not hold that value, so it cannot compare against it. That claim is untestable and overstated.
3. **The combined effect.** ACC-01 does not consume CFG-01 (01 §12; DCR-ACC-CFG-02 is GO-LIVE). The `DEP-*` checks are therefore the **only runtime interlock** on ACC-01's governed operations in any environment. For the dependencies above, a single configuration edit opens them.

**Affected sections:** 01 §4.5, §13, §16; 04 §2.1, §3.4; 09 `ACC1_CONFIG_INVALID`; 10 T-121, T-146, T-187, T-189; 14 §2, §4; 17 DCR-ACC-IAM-06, DCR-ACC-GOV-05, DCR-ACC-FND-01, DCR-ACC-CFG-02.

**Required correction:**

1. **Evidence rule.** A `DEP-*` is satisfied only by evidence ACC-01 can verify, or that an authority other than ACC-01's own configuration asserts. A declared string alone never satisfies a dependency in the production composition root.
2. **Type P options (the author chooses, per dependency):**
   - (a) **Per-operation behavioural verification.**
     - The IAM-06 attested record includes an explicit entitlement attestation (maker and checker entitlement evaluated, with the policy and grant references).
     - Creation apply fetches and verifies the LED-01 attester's contract descriptor (an operation-time call, outside readiness, so RF-10 still holds).
     - The CLT-01 read seam asserts the credential's scope in its response, or offers an introspection seam ACC-01 checks.
   - (b) Where that is not possible, the dependency stays **unsatisfiable** outside the test composition root until the owning module delivers the verifiable seam.
3. **Type G:** remove "declared reference" as sufficient evidence. Either:
   - (a) the prerequisite is represented as an authoritative CFG-01 availability entry (DCR-ACC-CFG-02) or another governed register ACC-01 reads through an authoritative seam; or
   - (b) the dependency is **hard-unsatisfied in code**, liftable only by an approved ACC-01 task that cites the closing governance record and changes the code under review. That is the honest form of a gate with no runtime signal. It is not an environment switch, so ACC-R2-HD-06 is respected.
4. **Remove the overclaim** that boot detects a general-token value (T-146, T-187, 09). Replace it with what ACC-01 can prove: distinct configured values, no general-token variable name (source guard), and the per-call scope assertion of item 2(a).
5. State in 14 §2 which dependencies are behaviourally verified and which rest on deployment review.

**Implementation impact:** phase 0 (boot/dependency evaluation), phase 3 (creation), phase 4 (restriction operations), phase 6; and the DCR text for IAM-06, CLT-03, LED-01c.

**Human decision required: PARTLY.**

- The fail-closed default in item 3(b) and items 1, 2(b), 4 and 5 need no decision.
- Choosing where type-G closure is attested needs a human / CFG-01 decision: item 3(a) makes CFG-01 represent a governance prerequisite.

### ACC-01-R3-F04 — LOW — DCR-ACC-IAM-06 leaves the provenance of the "authenticated actor assertion" undefined

**Evidence:**

- DCR-ACC-IAM-06 (17 L39), 07 §4.1 and 02 §1 step 7 require IAM-02 to verify "an authenticated actor assertion (not a body id)" and return `authenticated_actor_id`.
- None of them says **who produces the assertion, or what IAM-02 verifies it against**.
- If ACC-01 produces it (ACC-01 is the only caller of the verify seam and holds the IAM-01 session), the "attested" `authenticated_actor_id` is ACC-01's own claim echoed back. That is the caller-asserted posture ACC-R2-HD-07 forbids.

**Required correction:** the DCR requires an assertion IAM-02 can verify **independently of ACC-01**, for example an IAM-01 session or recent-auth reference that IAM-02 introspects with IAM-01. It records that an ACC-01-minted assertion does not satisfy `DEP-IAM-ACTOR-BINDING`. Add a test against the target-contract double: an assertion not verifiable by IAM-02 is refused.

**Affected sections:** 01 §4.5; 02 §1; 04 §2.1; 07 §4.1; 17 DCR-ACC-IAM-06; 10 T-180.

**Implementation impact:** phase 3 target-contract double; DCR text.

**Human decision required: NO.**

### ACC-01-R3-F05 — LOW — Governed abort is gated on the dependency it recovers from, and its evidence scope for master families is undefined

**Evidence:**

1. **Abort is gated on the failing dependency.** Abort requires the governed-apply set **plus `DEP-LED-CLOSURE-CONTRACT`** (01 §4.5 L146). Yet its purpose includes `postseal_attestation_unavailable` and `attester_contract_fault` (02 §7.7). If the attester dependency becomes unsatisfied after a seal (configuration removed, or a contract version withdrawn), the recovery path is refused at the moment it is needed. The target stays barred until configuration is restored. Abort makes **no** LED-01 call: it verifies ACC-01's own readiness and attestation rows.
2. **Evidence scope is undefined for families.** The evidence check is described for "the target" (02 §7.7 item 1). For a **master** abort it does not say whether the evidence may be a child's: a child's blocked attestation, or an authority restriction on a child. Children under a closing master cannot be aborted alone.
3. **Children's own closures are reversed without their own evidence.** A master abort returns "every listed non-closed child". That includes a non-default child whose **own, independently approved** closure was already in progress, possibly sealed with a `clear` attestation (02 §7.1 item 2 "recorded as-is"). The child's barrier is cleared and its closure reversed without child-specific evidence.
4. **In `closing`, the evidence condition is satisfied by any undrained target.** Any undrained target yields a `not_ready` readiness row. "Not a normal operational shortcut" therefore rests on maker-checker alone. This is acceptable, but the pack should say so plainly.

**Required correction:**

- Remove `DEP-LED-CLOSURE-CONTRACT` from abort's dependency set, keeping the governed-apply set.
- Define family evidence: a master abort may cite blocking evidence of the master or of any master-directed child.
- Children whose closure was initiated independently of the master closure are either left in their own closure, or returned only with their own evidence. The approach should be consistent with R3-F01.
- State item 4 honestly.
- Tests for each case.

**Affected sections:** 01 §4.5, §7.3; 02 §7.1, §7.7; 06 §1 rule 8; 10 T-174…T-179.

**Implementation impact:** phase 5.

**Human decision required: NO**, unless R3-F01's decision changes the abort scope.

### ACC-01-R3-F06 — LOW — OQ-13 is labelled "not decided", but v0.3 has already built its architecture on a checker at initiation

**Evidence:** see §9. The catalogue marks `acc1.master_account.close` and `acc1.subaccount.close` `requires_approval = true` (07 §2). The common mechanism (02 §1), the transition table ("Request + verify", 06 §1.1), the API (04 §2.1.1) and ACC-REQ-012 all make initiation maker-checker. File 17 OQ-13 nevertheless says "Not decided".

**Required correction:**

- Record OQ-13 as: *"v0.3 architecture: initiation is maker-checker (a stricter-than-WF-27 default); pending human confirmation."*
- State that a maker-only choice needs a **new non-approval initiation path**, touches the catalogue migration (phase 1) and interacts with pending HD-4 (no single-actor restrict path, because `closing` halts client activity).
- Move the decision point to **before phase 1 approval**, not "non-blocking".

**Affected sections:** 17 OQ-13; README; 14 §1.

**Implementation impact:** phase 1 catalogue rows; phase 5 workflow, if changed.

**Human decision required: YES** (confirm or change the default).

### ACC-01-R3-F07 — INFO — Precision and editorial

1. **Master pre-seal readiness wording.** 01 §7.2 L233 lists "the master-level attestation clear" as a **pre-seal** readiness condition. The attestation is a post-barrier concept. Reword to the master-level readiness conditions.
2. **Restriction timing.**
   - Cancel and lift legality is decided by effective time at apply. With PostgreSQL `now()` (transaction start), a cancel whose transaction started just before `effective_from_utc` can commit after it. The restriction was counted in force by resolves in that window and is then cancelled without lift evidence.
   - Specify the statement or commit time source (for example `clock_timestamp()` in the locked check). Give `trg_acc1_restriction_terminal` a DB-level backstop: `cancelled` only while `effective_from_utc > clock_timestamp()`.
   - Authority-sourced rows already require evidence.
3. **CDA-1 vs "no new withdrawal".** CDA-1 (balance return) and CDA-2's "no new withdrawal" need a consumer-visible discriminator. DCR-ACC-LED-01e should bind CDA-1 activity to the closure request id, so a consumer cannot treat any withdrawal to a verified own-name destination as a closure return.

Fix these when next editing. Not blocking on their own.

**Totals (new):** MEDIUM 3, LOW 3, INFO 1.

## 7. Closure adversarial results

| # | Focus | Result |
|---|---|---|
| 1 | **Closure-drain allow-list** | **Holds.** CDA-1…4 are explicit and CDA-5 is empty (01 §7.1). Drain never overrides a restriction or a client status (01 §10 step 2). `closing` is not a general transaction state: deposits, trades, new destinations, subscriptions and Exchange activity are denied (T-158/159). A remaining balance **can** be returned before the seal (CDA-1), subject to an existing verified own-name destination and no overriding authority. Otherwise the governed abort applies (`authority_restriction_blocks_closure`). Consumer enforcement is external (DCR-ACC-LED-01e, -CONS-01). Discriminator point: R3-F07.3 |
| 2 | **Pre-seal readiness** | A funded or unsettled account cannot seal. `ready` requires `balance_state ≠ present` and zero counts (05 §2.6 `CHECK`; T-166/167). Readiness is bound to the target, `closure_cycle`, the latest row per attester, freshness and watermark. **Gaps:** not bound to the closure request id or the observed target version, and appendable after the seal → **R3-F02** |
| 3 | **Final checker** | The approval binds the readiness ids and W_pre, and seal apply re-collects and requires the same watermark (T-168). **But** the sealed binding is not persisted, completion reads "latest readiness", and target-version equality at apply is not stated → **R3-F02** |
| 4 | **Post-seal fence** | **Holds.** `closure_barrier` is stored and returned independently, is evaluated first by normative rule, and `frozen`/`suspended`/`restricted` cannot mask it (T-153…156). It is cleared only by a recovery row (`trg_acc1_closure_barrier`). Consumer adoption is external |
| 5 | **Post-seal LED evidence** | Stale `as_of`, old seal version, old closure cycle and non-latest attestation are all rejected (T-136, T-170, T-172/173). Concurrent abort vs complete serialises on the row lock: complete-first leaves abort refused on `closed`; abort-first makes the CAS fail. In-flight postings are fenced or `unresolved` ⇒ blocked. **Resolve-before-seal / commit-after-seal:** sound **only if** W_pre is pinned and commit-ordered → **R3-F02** |
| 6 | **Abort / recovery** | One transaction, `closure_cycle`++, seal version never reset, barrier cleared only here, projection recomputed by time, never restores another authority's denial (T-174…179). **Invalid recovered master** → **R3-F01**. Dependency gating and family evidence → **R3-F05** |
| 7 | **Master/child concurrency** | **Holds.** `FOR SHARE` on the master in A4 and in `trg_acc1_sa_owner` against `FOR UPDATE` in the closure apply: creation-first changes the listed set and the closure is refused; closure-first rejects the creation (T-164). Default and master enter `closing` atomically under the same request (`trg_acc1_default_protected`; deferred `trg_acc1_closure_family`). The sequence (children first, then master) cannot deadlock. The cost of that ordering is R3-F01 |

## 8. Closure / abort adjudication (the high-focus question)

**Question:** can "master abort returns non-closed children, already-`closed` children stay `closed`" produce an invalid recovered master?

**Answer: yes, deterministically.** The state is reached by the most ordinary master-level blocker after the children have closed. The author's "harmless because nothing resolves the default" is **not proven**:

- **True for fallback resolution.** ACC-HD-1 holds: resolve, `scope-validate` and grants all fail closed on a closed default.
- **False for the structural invariant.** The default exists to guarantee a subaccount dimension, and it can never be restored (non-status-filtered unique index, immutable `is_default`, no creation path).
- **Undefined for the next master closure.** ACC-REQ-046 is unsatisfiable; the only choices are an un-closable master and client, or a silent deviation.

**Required architecture:** the **reversible fenced intermediate** described in R3-F01:

- master-directed children stop at `closure_sealed` with a clear latest attestation;
- the master seals on that;
- master completion closes the whole family atomically;
- a master abort reverses the whole family.

This keeps every current safety property (the barrier stands on every child from its seal to its close) and removes the invalid state. It **amends ACC-R2-HD-04**, so it is a **human decision** (R3-F01).

## 9. OQ-13 adjudication

**Question:** has v0.3 already implicitly chosen a checker at closure initiation?

**Answer: yes — explicitly, not implicitly.**

- `acc1.*.close` is approval-gated (07 §2).
- The common mechanism is request → approval → apply for `close_master_account` / `close_subaccount` (02 §1, §7.1).
- The transition table says "Request + verify" (06 §1.1).
- ACC-REQ-012 makes initiation a governed change request.
- File 17 OQ-13 itself states that this is the v0.3 default.

**Classification:**

- **Not an architecture contradiction.** The pack is internally coherent, and a checker at initiation contradicts no master. WF-27 places its single maker/checker pair at steps 9–10, with step 1 a plain request. The Role Matrix row "Close client account" is `S request` → `R/M` → `K/A`. An extra control is permitted. ACC-R2-HD-02 says "maker requests closure → target enters `closing`" and "no second checker **after sealing**". It does not forbid a checker before `closing`.
- **Not merely wording ambiguity.** The label "not decided" misdescribes a choice already built into the catalogue, workflow and state machine (**R3-F06**).
- **It is a genuine human decision still required:**
  - The plain reading of ACC-R2-HD-02 and WF-27 step 1 is maker-only initiation.
  - The masters do not require a checker at initiation.
  - Choosing maker-only would need a new non-approval initiation path, and it interacts with pending HD-4.
- The reviewer does **not** make the decision. It must be taken **before phase 1 approval**, because the catalogue migration encodes `requires_approval` on `*.close`.

## 10. IAM / credential and dependency / CFG adjudication

**IAM / credentials:**

| Check | Result |
|---|---|
| No claim that current IAM-02 proves the authenticated apply actor | **Holds** (02 §0; 07 §3–4; 04 §2.1; T-130, T-181) |
| No caller-supplied `actor_id` treated as proof | **Holds** (ACC-REQ-048; T-182). Session principal = `requested_by` is described as defence in depth only |
| DCR-ACC-IAM-06 defines the missing contract | **Mostly.** The field set is right. The **provenance of the actor assertion** is undefined → R3-F04. No entitlement attestation → R3-F03 |
| `approval_id` limitations | **Honestly stated** (`approval_id_source`, R-7, T-184) |
| Step-up ordering | **Matches source** (`guard.ts` step 6 before step 7; 07 §2; T-185) |
| Every CLT-01 read uses the scoped credential | **Required** for resolve, batch, submit, every apply and R-3 (T-186) |
| No broad token even in DEV/TEST | **Stated and source-guarded by variable name**, but not detectable by value; the overclaim → R3-F03 |
| Test doubles are dependency injection | **Holds.** Test composition root only; no config, environment variable or environment name selects one (T-188) |

**Dependency / CFG:**

- ACC-01 reproduces **no** DEVELOPMENT/TEST/UAT/DEMO/PRODUCTION availability logic. The full-pack grep and T-111/112/190 confirm it. CFG-01 remains the sole environment-availability authority (ACC-R2-HD-06).
- The `DEP-*` names are environment-agnostic in form.
- **However, `DEP-FREEZE-GOVERNANCE` and `DEP-PUBLIC-PERIMETER` are not sufficiently fail-closed.** An unevidenced, well-formed reference satisfies them. This is a self-asserted boolean presented as governance evidence.
- The same weakness affects `DEP-IAM-ENTITLEMENT`, `DEP-LED-CLOSURE-CONTRACT` at creation, and the credential-scope dependencies.
- Because ACC-01 deliberately does not consume CFG-01 until DCR-ACC-CFG-02, these declarations are the only runtime interlock. The finding is **R3-F03**.

**Restrictions:** cancel, time-effective lift, housekeeping independence, version bump, composite ownership and maker-checker are coherent and fail closed. There is one time-source precision point (R3-F07.2).

**Default subaccount (ACC-HD-1 re-test):** it is never a permission, product, trading, payment or missing-subaccount fallback:

- resolve requires an explicit `subaccount_id`;
- `is_default` is never returned by internal seams;
- a missing id ⇒ deny;
- T-122…125.

The closure/abort invariant **fails**: R3-F01.

## 11. Remaining external gates (correctly carried; none is closed by this pack)

- **`DEP-IAM-ACTOR-BINDING`** (DCR-ACC-IAM-06).
- **`DEP-IAM-ENTITLEMENT`** (`IAM2-FIND-002`; DCR-ACC-IAM-03/-04/-02b/-02c; DCR-ACC-GOV-02).
- **`DEP-IAM-SCOPED-CREDENTIAL`** (DCR-ACC-IAM-05).
- **`DEP-CLT-READ-SCOPE`** (DCR-ACC-CLT-03).
- **`DEP-LED-CLOSURE-CONTRACT`** (DCR-ACC-LED-01c/-01e).
- **`DEP-FREEZE-GOVERNANCE`** (DCR-ACC-GOV-05).
- **`DEP-PUBLIC-PERIMETER`** (`FND-FIND-001`; DCR-ACC-FND-01, -IAM-01/-03).
- **Consumer adoption** of barrier-first evaluation and the drain allow-list (DCR-ACC-LED-01b, -CONS-01, -CFG-01).
- **Environment availability** of ACC-01 operations (DCR-ACC-CFG-02, CFG-01).
- **Client-money questions** `A2-Q1`/`A2-Q2`.

RF-01, RF-02, RF-05 and RF-09 remain **EXTERNAL GATE REMAINS**, subject to the R3-F03 evidence caveat.

## 12. Task / conductor consequence

- `task.json`: state **`PLANNING`**, `roundCounts.planning = 3`. The conductor's `maxPlanningRounds` is **3** (`aix-conductor` `00a7bde`). Entering `PLANNING` again consumes a round and, beyond the limit, is redirected to `HUMAN_DECISION_REQUIRED` (`src/state.ts` `ROUND_ON_ENTER`).
- **NEXT PLANNING TURN REQUIRES HUMAN_DECISION_REQUIRED / CONDUCTOR ESCALATION** rather than silently starting v0.4.
- The human must at least decide:
  - **R3-F01** (amend ACC-R2-HD-04, or choose alternative (b) or (c));
  - **R3-F06 / OQ-13** (confirm or change initiation approval);
  - the type-G authority in **R3-F03** item 3;
  - whether a fourth planning round is authorised beyond the limit.
- `PLAN_READY` was **not** set. Implementation eligibility was **not** created. `acceptanceStatus` stays `NOT_ACCEPTED`.
- **`task.json` is not modified by this review.** `validateTaskManifest` returns `{"ok":true,"errors":[]}` on the current file, so no change is required for schema validity. Its `findingsSummary` still lists R2-F01…F09 as open. This record, not the manifest, carries the round-3 dispositions and the new R3 findings, for the conductor or human to transcribe.

## 13. What this review does not do

It does not:

- modify v0.3 (or v0.1/v0.2), `task.json`, any master or register (`OPEN_FINDINGS`, `DECISION_LOG`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`), `platform/**`, or `main`;
- create `06-acceptance.md`;
- take any human decision;
- start remediation.

**Implementation is not authorised.**
