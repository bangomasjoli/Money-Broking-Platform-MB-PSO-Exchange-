# 06 Human-decision checkpoint (round 6) — ACC-01: Account Structure

- **Task ID:** ACC-01 (planning task — blueprint pack, **documentation only**)
- **Trigger:** [`04-review-r6.md`](04-review-r6.md) — v0.6 at `aa66084`, separate-context review, verdict **REMEDIATE** (recorded at `45f2eed`). Its §18 states that `roundCounts.planning` is already at a prior human-authorised over-limit entry (6), so `PLANNING → PLANNING` is illegal and a further planning turn again needs a `HUMAN_DECISION_REQUIRED` cycle. Unlike round 5, **no finding needs a human decision** — §18: "New human DESIGN decision required: NO. R6-F01…F03 are technical corrections within ACC-R3-HD-01, ACC-R4-HD-01 and ACC-R5-HD-01. The conductor still needs the human `resolve_human_decision` checkpoint to authorise the planning turn. That is a procedural approval, not a design decision."
- **Recorded by:** blueprint planner / claude-sonnet-5, on the instruction of the human (Aiman).
- **Nothing is accepted. Implementation is not authorised. `PLAN_READY` is not set. No `06-acceptance.md` exists.**
- **File-name note:** as in rounds 3, 4 and 5, the conductor defines no human-decision record name. This file uses `06-human-decision-r6.md` under the human's explicit instruction, a new file distinct from and not amending `06-human-decision-r3.md`, `06-human-decision-r4.md` or `06-human-decision-r5.md`, all of which remain unmodified historical evidence.

## 1. Conductor semantics reverified (read-only inspection of `aix-conductor`, working tree clean, not modified)

Re-inspected in this fresh session: `src/state.ts` (`TRANSITIONS`, `ROUND_ON_ENTER`, `transitionTask`), `config/local.config.json` (`loopLimits`), and `state/tasks/` (the conductor's runtime task store).

| Rule | Where | Fact |
|---|---|---|
| Limit | `config/local.config.json` L82 | `maxPlanningRounds` = **3**; unchanged; not edited by this checkpoint |
| `PLANNING → PLANNING` | `TRANSITIONS['PLANNING']` (`src/state.ts` L49) | **Not legal** — the rule list is `[{to:'PLAN_READY'}, HDR, FAILED]`; there is no `PLANNING → PLANNING` entry |
| `PLANNING → HUMAN_DECISION_REQUIRED` | `TRANSITIONS['PLANNING']` (`HDR`, L44/49) | Legal, ungated, always safe. `HUMAN_DECISION_REQUIRED` is not a key of `ROUND_ON_ENTER` (L86–91), so entering it consumes no round counter: from `planning = 6`, this transition leaves `planning` at **6** |
| `HUMAN_DECISION_REQUIRED → PLANNING` | `TRANSITIONS['HUMAN_DECISION_REQUIRED']` (L63) | Needs `resolve_human_decision`. Without a matching approval, `transitionTask` throws `ApprovalRequiredError` (L134) |
| `HUMAN_DECISION_REQUIRED → PLAN_READY` | `TRANSITIONS['HUMAN_DECISION_REQUIRED']` (L62–69) | **Not legal** — the rule list has no `PLAN_READY` entry from this state; `InvalidTransitionError` |
| Human-authorised over-limit re-entry | `src/state.ts` `transitionTask` L105–146 | Entering `PLANNING` runs `rounds.planning += 1` (L119). `humanAuthorised = (task.state === 'HUMAN_DECISION_REQUIRED')` (L122). When `humanAuthorised` is true, the over-limit check (`rounds[counter] > opts.limits[limit]`) is **skipped entirely** (L123) — the transition is **not** redirected back to `HUMAN_DECISION_REQUIRED`, and the incremented counter is kept. From `planning = 6`, a gated `HUMAN_DECISION_REQUIRED → PLANNING` re-entry therefore yields `planning = 7` |
| Escalation counter | `ROUND_ON_ENTER` (L86–91) | Consumed only on entry to `ESCALATION_REQUIRED`. `HUMAN_DECISION_REQUIRED` is not `ESCALATION_REQUIRED` and is not a key of `ROUND_ON_ENTER`; this checkpoint does not touch `roundCounts.escalation`, which stays **0** |
| Manifest | `records.ts` `validateTaskManifest`, imported read-only from the conductor's own `dist/records.js` (built after `src`; not modified) | Re-run in this session against: (a) the current `task.json` (state `PLANNING`, `planning = 6`, `escalation = 0`, `acceptanceStatus = NOT_ACCEPTED`) → `{"ok":true,"errors":[]}`; (b) the checkpoint state below → `{"ok":true,"errors":[]}`; (c) the remediation-commit state (§6) → `{"ok":true,"errors":[]}` |
| Runtime record | `state/tasks/` | Confirmed again: holds only `IMP02-MA-HARDEN-001.json` and `PV-20260919T162254Z-001.json`. No `ACC-01.json` exists. ACC-01 is not, and by ACC-R4-HD-02 remains not, registered in the conductor's runtime task store |

No conductor source, config or state file was modified by this inspection. These semantics match `04-review-r6.md` §3 (re-executed independently by that review's separate-context session) exactly.

## 2. Before state (`45f2eed`)

| Field | Value |
|---|---|
| `state` | `PLANNING` |
| `roundCounts` | `planning` 6, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` |
| Open findings in the manifest | RF-01, RF-02, RF-05, RF-09, R5-F01, R5-F02, R5-F03, R5-F04, R5-F05 (per `04-review-r6.md` §5, this checkpoint's remediation companion transcribes the round-6 dispositions) |

## 3. Legal transitions

| # | Transition | Gate | Applied at | Effect on counters |
|---|---|---|---|---|
| T1 | `PLANNING → HUMAN_DECISION_REQUIRED` | none | **this checkpoint** (commit 1). Reason: `04-review-r6.md` §18 — another human-decision cycle is required before a further planning turn, because `planning` is already at a prior human-authorised over-limit entry, and the human's procedural authorisation to continue is needed first — no new design decision is at issue | none (`planning` stays 6) |
| T2 | `HUMAN_DECISION_REQUIRED → PLANNING` | `resolve_human_decision`, `approvedBy` = Aiman (AimanRahimi) | **the remediation checkpoint** (commit 2), when v0.7 is written under this authorisation | `planning` 6 → **7** (human-authorised over-limit re-entry, real count, not reset) |

- T2 is **authorised now but not applied in this checkpoint.** After commit 1 the task is at `HUMAN_DECISION_REQUIRED`, with no v0.7 yet.
- `approvedBy`/`approvedAt`: the human's procedural authorisation (§4 below) was given by Aiman directly to this session as the instruction for this task. Timestamps in this file and in `task.json` are the actual recording time available to this session (`date -u`), never invented.
- Per ACC-R4-HD-02, ACC-01 remains unregistered in the conductor's runtime store, so `task transition` is not used here; the approval is recorded as a direct instruction to this session, not as a typed conductor prompt.

## 4. Human authorisation — recorded as given, not reinterpreted

**"Approve ACC R6 procedural continuation. No new design decision; proceed with the technical remediation of R6-F01, R6-F02 and R6-F03."**

This is a **procedural** authorisation of the planning-round continuation (T1 → T2 above), not a design decision. It does not create, amend or reinterpret any prior human decision. **Preserved exactly as approved, unchanged by this checkpoint:** ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02, ACC-R5-HD-01.

`04-review-r6.md` independently confirms there is nothing here for a human to decide: every one of R6-F01, R6-F02 and R6-F03 is answered **"Human decision required: NO"** (§7, entry by entry) and the review's own conclusion is **"New human DESIGN decision required: NO"** (§18). This checkpoint's authorisation is therefore exactly what the review says is needed: a procedural continuation, nothing more.

## 5. Human authorisation of the remediation, and task-manifest transcription

- The human authorised remediation of `04-review-r6.md` R6-F01 (MEDIUM), R6-F02 (LOW) and R6-F03 (INFO) as **technical corrections within the already-approved ACC-R3-HD-01 (item 8), ACC-R4-HD-01 and ACC-R5-HD-01** — the review states this itself (§7, "Human decision required: NO" on each finding) and no separate human decision narrows or widens that scope. Applied in `05-remediation-r6.md`.
- **Not authorised and not done:** application code, migrations, any change to `platform/**`, IAM-02, CLT-01, LED-01, CFG-01, FND-01, `DECISION_LOG`, `OPEN_FINDINGS`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`, `main`; setting `PLAN_READY`; resetting or editing any historical round count; changing `maxPlanningRounds`; registering ACC-01 in the conductor runtime store; merging; inventing a lifecycle transition; reinterpreting any prior human decision.
- **`task.json` transcription of `04-review-r6.md`** (§18 asks the conductor or human to transcribe it). This checkpoint transcribes it into `findingsSummary` only:
  - R5-F02, R5-F05 and R5-F06 are closed and leave the open list.
  - R5-F03 and R5-F04 are closed in the blueprint and leave the open list under their old ids; their external gates (DCR-ACC-IAM-08, DCR-ACC-FND-02) remain and are **not** claimed operationally closed.
  - R5-F01 is superseded by R6-F01/R6-F02 and leaves the open list under its old id.
  - R6-F01 (MEDIUM) and R6-F02 (LOW) enter the open list. R6-F03 is INFO and is not counted (existing convention).
  - RF-01, RF-02, RF-05 and RF-09 stay open as external gates (unchanged carry-forward).
  - Counts follow the existing convention (INFO not counted): **HIGH 1** (RF-01), **MEDIUM 3** (RF-02, RF-05, R6-F01), **LOW 2** (RF-09, R6-F02).
  - `04-review-r6.md`, this file and `05-remediation-r6.md` are added to `relevantRecordPaths`.

## 6. After state (this checkpoint, commit 1)

| Field | Value |
|---|---|
| `state` | **`HUMAN_DECISION_REQUIRED`** |
| `roundCounts` | `planning` 6, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 (unchanged; not reset) |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| Implementation eligibility | **none** (`PLAN_READY` not set) |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` (executed against this commit's `task.json`) |

The task is intentionally stopped here. Continuation is T2, recorded in the remediation checkpoint (`05-remediation-r6.md`; final `task.json`).
