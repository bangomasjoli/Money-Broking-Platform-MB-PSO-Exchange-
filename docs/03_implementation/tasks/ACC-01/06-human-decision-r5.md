# 06 Human-decision checkpoint (round 5) — ACC-01: Account Structure

- **Task ID:** ACC-01 (planning task — blueprint pack, **documentation only**)
- **Trigger:** [`04-review-r5.md`](04-review-r5.md) — v0.5 at `826ab45`, separate-context review, verdict **REMEDIATE** (recorded at `da3ed73`). Its §18 states that `roundCounts.planning` is already at a prior human-authorised over-limit entry (5), so `PLANNING → PLANNING` is illegal and a further planning turn again needs a `HUMAN_DECISION_REQUIRED` cycle, and that finding R5-F01 needs one narrow human decision before remediation.
- **Recorded by:** blueprint planner / claude-sonnet-5, on the instruction of the human (Aiman).
- **Nothing is accepted. Implementation is not authorised. `PLAN_READY` is not set. No `06-acceptance.md` exists.**
- **File-name note:** as in rounds 3 and 4, the conductor defines no human-decision record name. This file uses `06-human-decision-r5.md` under the human's explicit instruction, a new file distinct from and not amending `06-human-decision-r3.md` or `06-human-decision-r4.md`, both of which remain unmodified historical evidence.

## 1. Conductor semantics reverified (read-only inspection of `aix-conductor`, working tree clean, not modified)

Re-inspected in this fresh session: `src/state.ts` (`TRANSITIONS`, `ROUND_ON_ENTER`, `transitionTask`), `config/local.config.json` / `config/example.config.json` (`loopLimits`), and `state/tasks/` (the conductor's runtime task store).

| Rule | Where | Fact |
|---|---|---|
| Limit | `config/local.config.json`, `config/example.config.json` | `maxPlanningRounds` = **3**; unchanged; not edited by this checkpoint |
| `PLANNING → PLANNING` | `TRANSITIONS['PLANNING']` (`src/state.ts` L49) | **Not legal** — the rule list is `[{to:'PLAN_READY'}, HDR, FAILED]`; there is no `PLANNING → PLANNING` entry |
| `PLANNING → HUMAN_DECISION_REQUIRED` | `TRANSITIONS['PLANNING']` (`HDR`, L44/49) | Legal, ungated, always safe. `HUMAN_DECISION_REQUIRED` is not a key of `ROUND_ON_ENTER` (L86–91), so entering it consumes no round counter: from `planning = 5`, this transition leaves `planning` at **5** |
| `HUMAN_DECISION_REQUIRED → PLANNING` | `TRANSITIONS['HUMAN_DECISION_REQUIRED']` (L63) | Needs `resolve_human_decision`. Without a matching approval, `transitionTask` throws `ApprovalRequiredError` (L132–134) |
| `HUMAN_DECISION_REQUIRED → PLAN_READY` | `TRANSITIONS['HUMAN_DECISION_REQUIRED']` (L62–69) | **Not legal** — the rule list has no `PLAN_READY` entry from this state; `InvalidTransitionError` |
| Human-authorised over-limit re-entry | `src/state.ts` `transitionTask` L118–129 | Entering `PLANNING` runs `rounds.planning += 1`. `humanAuthorised = (task.state === 'HUMAN_DECISION_REQUIRED')`. When `humanAuthorised` is true, the over-limit check (`rounds[counter] > opts.limits[limit]`) is **skipped entirely** — the transition is **not** redirected back to `HUMAN_DECISION_REQUIRED`, and the incremented counter is kept. From `planning = 5`, a gated `HUMAN_DECISION_REQUIRED → PLANNING` re-entry therefore yields `planning = 6` |
| Escalation counter | `ROUND_ON_ENTER` (L86–91) | Consumed only on entry to `ESCALATION_REQUIRED`. `HUMAN_DECISION_REQUIRED` is not `ESCALATION_REQUIRED` and is not a key of `ROUND_ON_ENTER`; this checkpoint does not touch `roundCounts.escalation`, which stays **0** |
| Manifest | `records.ts` `validateTaskManifest` | Re-run against the current `task.json` (state `PLANNING`, `planning = 5`, `escalation = 0`, `acceptanceStatus = NOT_ACCEPTED`): `{"ok":true,"errors":[]}` |
| Runtime record | `state/tasks/` | Confirmed again: no `ACC-01.json` exists. ACC-01 is not, and by ACC-R4-HD-02 remains not, registered in the conductor's runtime task store |

No conductor source, config or state file was modified by this inspection. These semantics match `04-review-r5.md` §3 (re-executed independently by that review's separate-context session) exactly.

## 2. Before state (`da3ed73`)

| Field | Value |
|---|---|
| `state` | `PLANNING` |
| `roundCounts` | `planning` 5, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` |
| Open findings in the manifest | RF-01, RF-02, RF-05, RF-09, R4-F01, R4-F02, R4-F03, R4-F04, R4-F05 (per `04-review-r5.md` §5, this checkpoint's remediation companion transcribes the round-5 dispositions) |

## 3. Legal transitions

| # | Transition | Gate | Applied at | Effect on counters |
|---|---|---|---|---|
| T1 | `PLANNING → HUMAN_DECISION_REQUIRED` | none | **this checkpoint** (commit 1). Reason: `04-review-r5.md` §18 — another human-decision cycle is required before a further planning turn, because `planning` is already at a prior human-authorised over-limit entry, and one narrow decision (R5-F01) is needed first | none (`planning` stays 5) |
| T2 | `HUMAN_DECISION_REQUIRED → PLANNING` | `resolve_human_decision`, `approvedBy` = Aiman (AimanRahimi) | **the remediation checkpoint** (commit 2), when v0.6 is written under this authorisation | `planning` 5 → **6** (human-authorised over-limit re-entry, real count, not reset) |

- T2 is **authorised now but not applied in this checkpoint.** After commit 1 the task is at `HUMAN_DECISION_REQUIRED`, with no v0.6 yet.
- `approvedBy`/`approvedAt`: the human's decision (ACC-R5-HD-01, §4 below) was made by Aiman in ChatGPT and relayed to this session as the instruction for this task. The original decision time is **not recorded** anywhere this session can read, so it is not invented. The approval is recorded as **relayed**, not as a typed conductor prompt (per ACC-R4-HD-02, ACC-01 remains unregistered in the conductor's runtime store, so `task transition` is not used here either).
- Timestamps in this file and in `task.json` are the actual recording time available to this session (`date -u`), not the true clock time of the original ChatGPT decision, which this session cannot read and does not invent. This follows the correction recorded in `04-review-r5.md` §3 / R5-F06.3.

## 4. Human decision — authoritative (approved by Aiman; decided in ChatGPT, relayed verbatim in substance)

Recorded as given. Not reinterpreted.

### ACC-R5-HD-01 — Family pre-seal recovery scope (APPROVED)

**Title:** Family pre-seal recovery scope.

**Decision:** The phrase "pre-seal only" (ACC-R4-HD-01) applies to the **target** of the governed abort/withdrawal decision.

For a MASTER FAMILY: if `master.status = closing` **and** the master itself has **not** reached `closure_sealed`, then a governed pre-seal rejection or withdrawal of the master closure **may** trigger a family abort that atomically returns the master, the default, and every master-directed child belonging to that family — **even if** the default or one or more master-directed children have already individually reached `closure_sealed`. Those sealed family members may have their barriers cleared **only** as part of the governed master-family abort transaction defined by ACC-R3-HD-01. They may not be independently reopened. Once `master.status = closure_sealed`, the pre-seal rejection/withdrawal grounds are no longer legal.

This harmonises ACC-R4-HD-01 with ACC-R3-HD-01 item 8, rather than applying the `closing` requirement independently to every returned family member.

A master-directed **child** whose seal is rejected while the master remains `closing` may also provide evidence/ground for the master-family abort. That child is not independently aborted; the family recovery returns the master-directed family atomically.

**What this resolves.** `04-review-r5.md` R5-F01: the v0.5 `closure_recovery` `CHECK` applied the pre-seal condition to every returned row, which made the return path structurally unreachable in a master family once any member had sealed — reproducing the R4-F03 deadlock for masters and leaving WF-27 `rejected` unrepresentable for a master's own final approval. ACC-R5-HD-01 confirms the reviewer's "target reading" (`04-review-r5.md` §7 R5-F01, "Required correction" item 2): the `CHECK` and R-9 are scoped to the abort's target row, and member rows may carry `from_status = 'closure_sealed'` when returned as part of a master-family abort.

**What this does not do.** It does not reopen a target once **that target itself** has reached `closure_sealed`; it does not authorise an independent (non-family) target's abort against a sealed `from_status`; it does not touch ACC-R4-HD-01's other terms (maker-checker, audited, entitlement-checked, evidence-bound, never a bare maker decision, never overriding an external denial); it does not touch ACC-R3-HD-01's atomicity, immutable-history or barrier-clearing-only-inside-the-governed-transaction terms; it does not touch ACC-R5-HD-01's own converse — a `closure_sealed` master remains unreachable by this ground.

## 5. Human authorisation of the remediation, and task-manifest transcription

- The human authorised remediation of `04-review-r5.md` R5-F01…R5-F06 in a new pack `v0.6` under ACC-R5-HD-01 above (R5-F01) and under technical, non-human-decision resolutions of R5-F02…R5-F05 using the routes the review left open to the author (R5-F02 option (a); R5-F03 route 1; R5-F04 as specified; R5-F05 option (ii)), confirmed by the human as staying within the existing approved decisions and needing no separate human decision. R5-F06 is precision/record-accuracy only. Scope, exclusions and the two-commit history are as in the instruction; they are applied in `05-remediation-r5.md`.
- **Not authorised and not done:** application code, migrations, any change to `platform/**`, IAM-02, CLT-01, LED-01, CFG-01, FND-01, `DECISION_LOG`, `OPEN_FINDINGS`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`, `main`; setting `PLAN_READY`; resetting or editing any historical round count; changing `maxPlanningRounds`; registering ACC-01 in the conductor runtime store; merging.
- **`task.json` transcription of `04-review-r5.md`** (§18 asks the conductor or human to transcribe it). This checkpoint transcribes it into `findingsSummary` only:
  - R4-F01, R4-F05 and R4-F06 are closed and leave the open list.
  - R4-F02, R4-F03 and R4-F04 are superseded by R5-F02, R5-F01/R5-F03 and R5-F04 respectively, and leave the open list under their old ids.
  - R5-F01, R5-F02 and R5-F03 (MEDIUM) and R5-F04 and R5-F05 (LOW) enter the open list. R5-F06 is INFO and is not counted (existing convention).
  - RF-01, RF-02, RF-05 and RF-09 stay open as external gates (unchanged carry-forward).
  - Counts follow the existing convention (INFO not counted): HIGH 1 (RF-01), MEDIUM 5 (RF-02, RF-05, R5-F01, R5-F02, R5-F03), LOW 3 (RF-09, R5-F04, R5-F05).
  - `04-review-r5.md` and this file are added to `relevantRecordPaths`.

## 6. After state (this checkpoint, commit 1)

| Field | Value |
|---|---|
| `state` | **`HUMAN_DECISION_REQUIRED`** |
| `roundCounts` | `planning` 5, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 (unchanged; not reset) |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| Implementation eligibility | **none** (`PLAN_READY` not set) |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` (executed against this commit's `task.json`) |

The task is intentionally stopped here. Continuation is T2, recorded in the remediation checkpoint.
