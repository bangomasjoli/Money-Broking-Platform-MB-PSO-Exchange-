# 06 Human-decision checkpoint (round 7) — ACC-01: Account Structure

- **Task ID:** ACC-01 (planning task — blueprint pack, **documentation only**)
- **Trigger:** [`04-review-r7.md`](04-review-r7.md) — v0.7 at `0d7cfb0`, separate-context review, verdict **REMEDIATE** (recorded at `b2764ac`). Its §20 states that `roundCounts.planning` is already at a prior human-authorised over-limit entry (7), so `PLANNING → PLANNING` is illegal and a further planning turn again needs a `HUMAN_DECISION_REQUIRED` cycle. As in round 6, **no finding needs a human decision** — §20: "New human DESIGN decision required: NO. R7-F01 and R7-F02 are technical corrections within ACC-R3-HD-01, ACC-R4-HD-01 and ACC-R5-HD-01. The conductor still needs the human `resolve_human_decision` checkpoint to authorise the planning turn. That is a procedural approval, not a design decision."
- **Recorded by:** blueprint planner / claude-sonnet-5-5, on the instruction of the human (Aiman).
- **Nothing is accepted. Implementation is not authorised. `PLAN_READY` is not set. No `06-acceptance.md` exists.**
- **File-name note:** as in rounds 3–6, the conductor defines no human-decision record name. This file uses `06-human-decision-r7.md` under the human's explicit instruction, a new file distinct from and not amending `06-human-decision-r3.md`, `06-human-decision-r4.md`, `06-human-decision-r5.md` or `06-human-decision-r6.md`, all of which remain unmodified historical evidence.

## 1. Conductor semantics reverified (read-only inspection of `aix-conductor`, working tree clean, not modified)

Re-inspected in this fresh session: `src/state.ts` (`TRANSITIONS`, `ROUND_ON_ENTER`, `transitionTask`), `config/local.config.json` (`loopLimits`), and `state/tasks/` (the conductor's runtime task store).

| Rule | Where | Fact |
|---|---|---|
| Limit | `config/local.config.json` L82 | `maxPlanningRounds` = **3**; unchanged; not edited by this checkpoint |
| `PLANNING → PLANNING` | `TRANSITIONS['PLANNING']` | **Not legal** — the rule list is `[{to:'PLAN_READY'}, HDR, FAILED]` |
| `PLANNING → HUMAN_DECISION_REQUIRED` | `TRANSITIONS['PLANNING']` (`HDR`) | Legal, ungated, always safe. `HUMAN_DECISION_REQUIRED` is not a key of `ROUND_ON_ENTER`, so entering it consumes no round counter: from `planning = 7`, this transition leaves `planning` at **7** |
| `HUMAN_DECISION_REQUIRED → PLANNING` | `TRANSITIONS['HUMAN_DECISION_REQUIRED']` | Needs `resolve_human_decision`. Without a matching approval with a non-empty `approvedBy`, `transitionTask` throws `ApprovalRequiredError` |
| `HUMAN_DECISION_REQUIRED → PLAN_READY` | `TRANSITIONS['HUMAN_DECISION_REQUIRED']` | **Not legal** — no such rule; `InvalidTransitionError` |
| Human-authorised over-limit re-entry | `transitionTask` | Entering `PLANNING` runs `rounds.planning += 1`. `humanAuthorised = (task.state === 'HUMAN_DECISION_REQUIRED')`; when true the over-limit check is **skipped entirely** — the transition is not redirected back to `HUMAN_DECISION_REQUIRED` and the incremented counter is kept. From `planning = 7`, a gated `HUMAN_DECISION_REQUIRED → PLANNING` re-entry therefore yields `planning = 8` |
| Escalation counter | `ROUND_ON_ENTER` | Consumed only on entry to `ESCALATION_REQUIRED`. Using `HUMAN_DECISION_REQUIRED` does **not** increment `roundCounts.escalation`, which stays **0** |
| Manifest | `dist/records.js` `validateTaskManifest`, imported read-only | Run against the pre-checkpoint `task.json` (state `PLANNING`, `planning = 7`, `escalation = 0`, `NOT_ACCEPTED`) → `{"ok":true,"errors":[]}`. Checkpoint and final states are validated as recorded in §6 and in `05-remediation-r7.md` |
| Runtime record | `state/tasks/` | Holds only `IMP02-MA-HARDEN-001.json` and `PV-20260919T162254Z-001.json`. No `ACC-01.json`. ACC-01 is not, and by ACC-R4-HD-02 remains not, registered in the conductor's runtime task store |

No conductor source, config or state file was modified. These semantics match `04-review-r7.md` §3 and §20 exactly.

## 2. Before state (`b2764ac`)

| Field | Value |
|---|---|
| `state` | `PLANNING` |
| `roundCounts` | `planning` 7, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` |
| Open findings in the manifest | RF-01, RF-02, RF-05, RF-09, R6-F01, R6-F02 |

## 3. Legal transitions

| # | Transition | Gate | Applied at | Effect on counters |
|---|---|---|---|---|
| T1 | `PLANNING → HUMAN_DECISION_REQUIRED` | none | **this checkpoint** (commit 1). Reason: `04-review-r7.md` §20 — a further planning turn needs a human-decision cycle because `planning` is already at a prior human-authorised over-limit entry; no new design decision is at issue | none (`planning` stays 7; `escalation` stays 0) |
| T2 | `HUMAN_DECISION_REQUIRED → PLANNING` | `resolve_human_decision`, `approvedBy` = AimanRahimi | **the remediation commit** (commit 2), when v0.8 is written under this authorisation | `planning` 7 → **8** (human-authorised over-limit re-entry, real count, not reset); `escalation` stays 0 |

- T2 is **authorised now but not applied in this checkpoint.** After commit 1 the task is at `HUMAN_DECISION_REQUIRED`, with no v0.8 yet.
- Timestamps in this file and in `task.json` are the actual local recording time available to this session (`date -u`); the original ChatGPT-side timestamp of the human's message is not known here and is not invented.
- Per ACC-R4-HD-02, ACC-01 remains unregistered in the conductor's runtime store, so `task transition` is not used; the approval is recorded as a direct instruction to this session.

## 4. Human authorisation — recorded as given, not reinterpreted

**"approve ACC R7 procedural continuation"**

This is a **procedural** authorisation of the planning-round continuation (T1 → T2 above) for the technical remediation of ACC-01-R7-F01 and ACC-01-R7-F02. It is **not** a design decision, and it creates, amends or reinterprets no prior human decision. **Preserved exactly as approved, unchanged by this checkpoint:** ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02, ACC-R5-HD-01.

`04-review-r7.md` independently confirms there is nothing here for a human to decide: R7-F01 and R7-F02 are each answered **"Human decision required: NO"** (§7) and the review's conclusion is **"New human DESIGN decision required: NO"** (§20).

## 5. Task-manifest transcription of `04-review-r7.md`

This checkpoint transcribes `04-review-r7.md` §20 into `findingsSummary` only:

- R6-F01 (MEDIUM) is superseded by R7-F01 and leaves the open list under its old id.
- R6-F02 (LOW) is closed in blueprint and leaves the open list. R6-F03 (INFO) is closed and was never counted.
- R7-F01 (MEDIUM) enters the open list. R7-F02 is INFO and is not counted (existing convention).
- RF-01, RF-02, RF-05 and RF-09 stay open as external gates (unchanged carry-forward).
- Counts (INFO not counted): **BLOCKER 0, HIGH 1** (RF-01), **MEDIUM 3** (RF-02, RF-05, R7-F01), **LOW 1** (RF-09).
- `04-review-r7.md` and this file are added to `relevantRecordPaths`.

**Not authorised and not done:** application code, migrations, any change to `platform/**`, IAM-02, CLT-01, LED-01, CFG-01, FND-01, `aix-conductor`, `DECISION_LOG`, `OPEN_FINDINGS`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`, `main`; setting `PLAN_READY`; resetting or editing any historical round count; changing `maxPlanningRounds`; registering ACC-01 in the conductor runtime store; merging; inventing a lifecycle transition; reinterpreting any prior human decision.

## 6. After state (this checkpoint, commit 1)

| Field | Value |
|---|---|
| `state` | **`HUMAN_DECISION_REQUIRED`** |
| `roundCounts` | `planning` 7, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 (unchanged; not reset) |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| Implementation eligibility | **none** (`PLAN_READY` not set) |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` (executed against this commit's `task.json`) |

The task is intentionally stopped here. Continuation is T2, recorded in the remediation commit (`05-remediation-r7.md`; final `task.json`).
