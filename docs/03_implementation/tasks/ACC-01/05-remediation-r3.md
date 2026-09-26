# 05 Remediation record (round 3, under human-decision escalation) — ACC-01: Account Structure blueprint pack v0.4

- **Task ID:** ACC-01 (planning task — blueprint pack, **documentation only**)
- **Author:** blueprint planner / claude-sonnet-5 (the model family that authored v0.1, v0.2 and v0.3)
- **Review remediated:** [`04-review-r3.md`](04-review-r3.md) — v0.3 at `194aff0`, separate-context review, verdict **REMEDIATE** (recorded at `3b3a3ee`)
- **Escalation record:** [`06-human-decision-r3.md`](06-human-decision-r3.md) (commit `af5d025`) — the conductor checkpoint, the legal transitions and ACC-R3-HD-01…03 as approved
- **Output:** `docs/02_modules/ACC-01/blueprint/v0.4/` (v0.1, v0.2 and v0.3 are **unmodified** historical reviewed evidence)
- **Status of v0.4:** **REMEDIATED / AWAITING RE-REVIEW.** Nothing is accepted. **Implementation is not authorised.** No application code, no migration, no test was written or changed. **No other module changed** — every IAM-02, CLT-01, LED-01, CFG-01, FND-01 and governance change below is a *request* (file 17), not a delivered fact.
- **Independence caveat:** this remediation was written by the same model family that authored the pack. It is not evidence of correctness. A further **separate-context re-review** is required before any human acceptance.

## 1. Conductor / escalation record

This was **not** an ordinary fourth planning round. `04-review-r3.md` §12 and the conductor both required a human decision first. Full evidence is in `06-human-decision-r3.md`; the summary is:

| Item | Value |
|---|---|
| Limit | `maxPlanningRounds` = 3 (`aix-conductor` `00a7bde`, both config files) |
| Before (`3b3a3ee`) | `state` `PLANNING`; `roundCounts.planning` **3** |
| **T1** `PLANNING → HUMAN_DECISION_REQUIRED` | Ungated; recorded in commit `af5d025`. `planning` stays 3 |
| Human decisions | ACC-R3-HD-01…03, recorded as given in `06-human-decision-r3.md` §4 and file 17 §4.4 |
| **T2** `HUMAN_DECISION_REQUIRED → PLANNING` | Gate `resolve_human_decision`; approval by Aiman (`AimanRahimi`), relayed to this session as the task instruction; original decision time not recorded. Applied at this remediation checkpoint, **2026-09-26T16:07:47.389Z** UTC. By the conductor's own rule (`state.ts` `humanAuthorised`) this is a human-authorised over-limit entry: `planning` becomes **4** (real count, **not reset**, **not invented**); `escalation` stays 0 (no `ESCALATION_REQUIRED` occurred) |
| After (this commit) | `state` **`PLANNING`** (not `PLAN_READY` — that transition is not legal from `HUMAN_DECISION_REQUIRED` and needs a separate re-review); `roundCounts.planning` **4**; `acceptanceStatus` `NOT_ACCEPTED`; implementation-ineligible |
| Legal alternatives checked and **not** used | `PLANNING → PLANNING` (illegal); `HUMAN_DECISION_REQUIRED → PLAN_READY` (illegal); editing `maxPlanningRounds`, resetting `roundCounts` or setting `PLAN_READY` in `task.json` (forbidden and not done) |
| Validator | `validateTaskManifest` (`aix-conductor` `dist/records.js`, `00a7bde`, not modified) on this commit's `task.json` → **`{"ok":true,"errors":[]}`** (executed) |

`task.json` cannot carry history or approvals (unknown keys are rejected), so `06-human-decision-r3.md` and this section are the record of both transitions. The conductor has no CLI command for this resolution of a manual planning task and no runtime `ACC-01` record; the transitions were **verified** against `transitionTask` in memory and are **recorded**, not executed by the conductor.

## 2. Human decisions recorded (ACC-R3-HD-01 … 03, approved by Aiman)

Recorded as given in file 17 §4.4 and summarised in the v0.4 README; ACC-R3-HD-01 **amends** ACC-R2-HD-04 (marked in file 17 §4.3). They do not overwrite ACC-HD-1/2/3, RF-02, Closure safety, Retention or ACC-R2-HD-01/02/03/05/06/07/08.

| ID | Decision (short) | Principal v0.4 locations |
|---|---|---|
| ACC-R3-HD-01 | Master-family closure: invariant "every non-`closed` master has exactly one non-`closed` default"; master-directed children stop at `closure_sealed`; atomic family completion; family abort; independent closures preserved; default never independently closed | 01 ACC-REQ-046/050/051, §7.4, §8; 02 §7; 03 §5a; 05 §2.10, §5; 06 §1 rules 7–8; 10 T-199…212 |
| ACC-R3-HD-02 | Initiation maker-only + entitlement-checked + audited; the one final approval is the checker's before the seal; no approval-gated code for initiation; real initiation externally gated; OQ-13 resolved | 01 ACC-REQ-054; 02 §7.1; 04 §2.4; 07 §2, §4.2; 10 T-240…244; DCR-ACC-IAM-07 |
| ACC-R3-HD-03 | No self-declared dependency evidence; runtime = behavioural from the owning service; governance-only = hard-unsatisfied in code; CFG-01 still owns environment availability | 01 ACC-REQ-053, §4.5; 14 §2; 10 T-223…235; DCR-ACC-IAM-05/-06, -GOV-05, -FND-01 |

## 3. R3-F01 … R3-F07 → corrected v0.4 sections

Status vocabulary: **BLUEPRINT REMEDIATED** = corrected in v0.4, awaiting independent re-review (**not closed**); **EXTERNAL GATE REMAINS** = the blueprint side is done but an external module must deliver.

| Finding | Sev | Status | Correction (v0.4 sections) |
|---|---|---|---|
| **R3-F01** master abort leaves ACTIVE master + `closed` default | MEDIUM | **BLUEPRINT REMEDIATED** (decision ACC-R3-HD-01) | v0.3's rule that master-directed children (default included) close before the master is **removed**. Structural invariant → ACC-REQ-050, deferred `trg_acc1_master_default_invariant`, R-8, T-206. Explicit membership: `closure_family`, immutable `closure_family_member` (`master`, `default`, `master_directed_child`, `independent_preserved`), row column `closure_family_id` → 05 §2.1–2.2, §2.10; 01 §7.4. Children stop at `closure_sealed`; master seal eligibility; **one atomic completion** with master-then-children lock order; family abort; independent closures identified by `closure_family_id IS NULL` + their own initiation id, never adopted or reversed; the default closes only in its master's transaction → 01 §7.4, §8; 02 §7.1, §7.4, §7.6–7.8; 05 §5 (`trg_acc1_default_protected`, `trg_acc1_closure_family`, `trg_acc1_seal`); 06 §1 rules 7–8, §1.1, §6; 03 §5a; 09; 12 rows 40–41; 13 R-8; 17 §4.3–4.4. Tests: T-199…T-212 (only-default, multiple children, abort after all sealed, abort with an independent child, second closure after abort, client closure after completion, invariant after every step, concurrent complete/abort, child change between verification and close) |
| **R3-F02** approved readiness not pinned | MEDIUM | **BLUEPRINT REMEDIATED** (no human decision needed) | Immutable `closure_seal_pin` (+ `closure_seal_pin_readiness`) persisted at seal; seal request pins readiness id, sequence, W_pre, payload hash, cycle, target version, family set hash, seal payload hash, approval/policy ids; seal apply re-checks approved target `version` and that the pinned row is still latest and `ready`; apply-time verification is **not** a readiness row; `trg_acc1_readiness_insert` refuses any readiness row once the target leaves `closing` (both race orders serialise on the target lock); completion and attestation compare against the **pin** (`preseal_watermark_ref` = pinned watermark; DB-computed `binding_ok`); LED-01c requires a **commit-ordered** watermark and stated consequence; attestation also asserts drained state → 01 §7.2, ACC-REQ-052; 02 §7.3–7.6; 04 §2.1.1, §2.4; 05 §2.6, §2.7, §2.9, §5; 06 §5, §6 item 10; 13 R-10; 17 DCR-ACC-LED-01c. Tests: T-213…T-222 (plus T-166/168/170/172 rewritten) |
| **R3-F03** self-declared dependencies | MEDIUM | **BLUEPRINT REMEDIATED**; RF-01/02/05/09 **EXTERNAL GATES REMAIN** (decision ACC-R3-HD-03) | Every `DEP-*` classified with authoritative source, verification, failure form and runtime/governance-only class (table in 01 §4.5, restated in 14 §2). Runtime: IAM-ACTOR-BINDING, IAM-ENTITLEMENT, IAM-SCOPED-CREDENTIAL, CLT-READ-SCOPE, LED-CLOSURE-CONTRACT — verified per operation from the owning service. Governance-only and **hard-unsatisfied in code**: FREEZE-GOVERNANCE, PUBLIC-PERIMETER (lifted only by an approved code change citing the governance record). "Declared reference"/"declared contract version" and the `provider`-record-as-readiness-evidence idea are removed; the boot claim of detecting a general token by value is **withdrawn** (only per-call scope statements) → 01 §4.5, §13; 04 §2.1, §3.4; 05 §8; 09; 10 T-121, T-146, T-187, T-189, T-191, T-223…T-232; 14; 17 DCRs. CFG-01 remains sole owner of environment availability (DCR-ACC-CFG-02 unchanged in substance) |
| **R3-F04** actor provenance undefined | LOW | **BLUEPRINT REMEDIATED**; real apply **EXTERNAL GATE** (`DEP-IAM-ACTOR-BINDING`) | DCR-ACC-IAM-06: IAM-02 verifies the actor from an authority outside ACC-01 (IAM-01 session/recent-auth reference or IAM-01-produced assertion validated through IAM-02's own trusted seam); an ACC-01-minted assertion never satisfies the dependency; attested record binds authenticated actor, maker/initiator, checker, approval id, policy id, entitlement/grant evidence, payload hash, action, resource, entity/client scope, actor-assertion authority, credential scope; successor seam distinct from `execute-verify` so a peer lacking it refuses **before consuming a token** → 01 §4.5; 02 §0, §1 step 7; 04 §2.1; 07 §4.1; 17. Tests: T-180, T-225, T-233…T-235 |
| **R3-F05** abort depends on broken LED; family evidence undefined | LOW | **BLUEPRINT REMEDIATED** | `DEP-LED-CLOSURE-CONTRACT` **removed** from abort (governed-apply set only; no LED-01 call); master abort may cite evidence of master / default / any master-directed child (never an independent child); independent closures preserved and stated/tested; the "any undrained target satisfies the evidence test" limitation stated plainly → 01 §4.5, §7.3, §7.4; 02 §7.7; 06 §1 rule 8; 09; 10 T-176, T-202, T-236…T-239 |
| **R3-F06** OQ-13 mislabelled | LOW | **RESOLVED by ACC-R3-HD-02** (real initiation **EXTERNAL GATE**) | OQ-13 resolved; catalogue `acc1.*.close_initiate` **non-approval** (replaces approval-gated `*.close`); initiation is a maker-only audited action recorded as an `account_change_request` row with `approval_mode = 'maker_only'`; new DCR-ACC-IAM-07 (and DCR-ACC-GOV-02 amended); decision point closed before phase 1; interaction with pending HD-4 recorded honestly → 01 ACC-REQ-012/054; 02 §1, §7.1; 04 §2.1.1, §2.4; 05 §2.4; 06 §1.1; 07 §2, §4.2; 08; 17 OQ-13, §4.2. Tests: T-240…T-244 |
| **R3-F07** INFO precision | INFO | **BLUEPRINT REMEDIATED** | (1) master readiness wording: attestation removed from the pre-seal conditions; family conditions are ACC-01's own facts (01 §7.2; T-245). (2) time source: database `clock_timestamp()` in the locked check plus a deferred commit-time check on `cancelled`; application clock never read; residual commit-latency window stated (02 §5–6; 05 §5, §7 5g; 06 §3; T-246, T-247). (3) CDA-1 discriminator: `closure_initiation_id` returned by `resolve` and bound to CDA-1 activity (01 §7.1; 04 §3.1; 06 §2.3; DCR-ACC-LED-01e; T-248) |

## 4. Prior findings — non-regression

| Finding | Disposition | Check |
|---|---|---|
| R2-F03 … R2-F09 | **CLOSED IN BLUEPRINT** by the round-3 review; **not regressed** | Barrier-first evaluation and the independent stored barrier are intact and now also hold for family members (T-211); apply-actor claims stay withdrawn (and strengthened, R3-F04); credential coverage stays (and the boot claim is corrected); T-048/T-066 unchanged; restriction lifecycle unchanged except the stricter time source; environment names appear only in recording/negations (a diff-scoped grep of v0.4 vs v0.3 found no new branching use); editorial fixes intact |
| R2-F01 / R2-F02 | **SUPERSEDED** by R3-F02 / R3-F01 | Addressed above |
| RF-01, RF-02, RF-05, RF-09 | **EXTERNAL GATE REMAINS** | Honest carry-forward preserved: `DEP-IAM-ENTITLEMENT` (RF-01), `DEP-LED-CLOSURE-CONTRACT` (RF-02), `DEP-CLT-READ-SCOPE` (RF-05), `DEP-FREEZE-GOVERNANCE` (RF-09). The R3-F03 caveat is now **closed in design**: none can be satisfied by declaration. **No external module is considered changed by this branch** |
| RF-04, RF-06, RF-08, RF-10, RF-11 | **CLOSED — not regressed** | `blocked_scopes` still explanatory only; composite FKs untouched; time-effective rule intact (now on the database clock); DCR classification retained (IAM-07 classified ACC-REAL-USE); readiness still makes no peer call (T-132, T-231); ACC-01 still not an eligibility authority |

## 5. Claims withdrawn or corrected in v0.4

- "The default closes before its master seals / a closed default under an open master is legitimate after an abort" (v0.3 01 §7.3, 02 §7.7, 06 §1 rule 8, 13 R-8, T-176) — **withdrawn** (R3-F01).
- "Completion compares against the latest readiness for the cycle" (v0.3 `trg_acc1_seal`) — **withdrawn**; the seal pin is the reference (R3-F02).
- "A declared contract version / governance reference satisfies a dependency"; "readiness reports declared contract versions"; "boot refuses a dedicated credential equal to a general peer token" — **withdrawn** (R3-F03).
- "Closure initiation is a maker-checker governed change request" (v0.3 default, OQ-13 "not decided") — **replaced** by ACC-R3-HD-02.
- "Abort requires `DEP-LED-CLOSURE-CONTRACT`" — **withdrawn** (R3-F05).
- "The master-level attestation is a pre-seal readiness condition" — **corrected** (R3-F07.1).

## 6. Design choices the reviewer may want to test

These are v0.4 authoring decisions inside the approved decisions, not new decisions:

1. **Independent children are never adopted.** A child already in its own closure when the master begins is recorded `independent_preserved`; the master seal waits until it is `closed`. The alternative (adopting it into the family) would change what its own approvals covered. If the human prefers adoption, that is a further decision.
2. **Every master-directed child, the default included, has its own seal request and its own final approval** (ACC-R3-HD-01: "each child receives the applicable final checker approval/seal control"). The master has its own. That is many approvals per family; batching is not designed.
3. **Initiation is stored as an `account_change_request` row (`approval_mode = 'maker_only'`)** so the initiation id, `close_change_request_id` and the family id keep one identifier space (`acr_…`). It is a record, not a change request in the maker-checker sense.
4. **The actor-binding successor seam, the maker-initiation decision, the credential-scope statements and the LED-01 contract descriptor are requested seams** (DCR-ACC-IAM-05/-06/-07, -CLT-03, -LED-01c). None exists. They are the *only* way the runtime dependencies can be satisfied; the design accepts no weaker evidence.
5. **`DEP-FREEZE-GOVERNANCE` hard-unsatisfied means restriction operations are unavailable in the production composition root** until governance closes DCR-ACC-GOV-05 and a code change lifts the gate; tests use a labelled double.
6. **A commit-ordered watermark is a hard requirement on LED-01.** If LED-01 cannot provide one, closure cannot complete — by design.
7. **Family-set hash excludes post-seal `version`** (it uses `closure_sealed_at_version` and pin/attestation ids), so a routine restriction on a sealed member does not itself block completion; an authority restriction does, by its own rule.
8. **Freshness of the attestation (`ACC1_ATTESTATION_MAX_AGE_SECONDS`) is an application check in the locked transaction**, not a database trigger, because it is configuration.
9. **Maker-only initiation is a *de facto* single-actor `closing`.** HD-4 stays an open human decision; the mitigations are recorded (07 §4 item 5).

## 7. Consistency checks run on v0.4

Executed mechanically over all 18 files and the module README (results in the commit):

- relative links resolve (the only forward reference, this record, exists at this commit);
- every `T-nnn` cited (including ranges) is defined; the plan is contiguous T-001…T-248;
- every `ACC1_*` error code cited is defined in file 09 (the four configuration names and the withdrawn v0.2 code are named only as configuration / history);
- every `trg_acc1_*` trigger cited is defined in file 05 §5; every `acc1.*` audit event cited exists in file 08;
- every `ACC-REQ-nnn` and `DCR-ACC-*` id cited is defined (shorthand `DCR-ACC-IAM-02` / `DCR-ACC-LED-01` predate v0.4);
- greps for withdrawn phrases (`type G`, `type P`, "declared governance", "as far as detectable", `acc1.*.close` approval-gated, "children first", `now()` as the effective-time source, "evidence declarations") return **no live use** — only deliberate history/negation.

## 8. What this record does not do

It does not accept anything, create `06-acceptance.md`, set `PLAN_READY`, reset or edit any historical round count, change `maxPlanningRounds`, or modify any master, register (`OPEN_FINDINGS`, `DECISION_LOG`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`), `platform/**`, a migration, IAM-02, CLT-01, LED-01, CFG-01, FND-01, the conductor or `main`. **Implementation is not authorised.**
