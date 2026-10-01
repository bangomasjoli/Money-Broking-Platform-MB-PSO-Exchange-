# 06 Human-decision checkpoint (round 8) — ACC-01: Account Structure

- **Task ID:** ACC-01 (planning task — blueprint pack, **documentation only**)
- **Trigger:** [`04-review-r8.md`](04-review-r8.md) — v0.8 at `e30cf8d`, separate-context review, verdict **REMEDIATE** (recorded at `3be2698`). Its §21 states that `roundCounts.planning` is already at a prior human-authorised over-limit entry (8), so `PLANNING → PLANNING` is illegal and a further planning turn again needs a `HUMAN_DECISION_REQUIRED` cycle. As in rounds 6 and 7, **no finding needs a human decision** — §21: "New human DESIGN decision required: NO. R8-F01…F04 are technical corrections within ACC-R3-HD-01, ACC-R3-HD-02, ACC-R4-HD-01 and ACC-R5-HD-01 as written. The conductor still needs the human `resolve_human_decision` checkpoint to authorise the planning turn. That is a procedural approval, not a design decision."
- **Recorded by:** blueprint planner / claude-sonnet-5-5, on the instruction of the human (Aiman).
- **Nothing is accepted. Implementation is not authorised. `PLAN_READY` is not set. No `06-acceptance.md` exists.**
- **File-name note:** as in rounds 3–7, the conductor defines no human-decision record name. This file uses `06-human-decision-r8.md` under the human's explicit instruction, a new file distinct from and not amending `06-human-decision-r3.md` … `06-human-decision-r7.md`, all of which remain unmodified historical evidence.

## 1. Conductor semantics reverified (read-only inspection of `aix-conductor`, working tree clean, not modified)

Re-inspected in this fresh session: `src/state.ts` (`TRANSITIONS`, `ROUND_ON_ENTER`, `transitionTask`), `config/local.config.json` (`loopLimits`) and `state/tasks/` (the conductor's runtime task store). `aix-conductor` HEAD `00a7bde`, `git status` empty.

| Rule | Where | Fact |
|---|---|---|
| Limit | `config/local.config.json` L82 | `maxPlanningRounds` = **3**; unchanged; not edited by this checkpoint |
| `PLANNING → PLANNING` | `TRANSITIONS['PLANNING']` | **Not legal** — the rule list is `[{to:'PLAN_READY'}, HDR, FAILED]` |
| `PLANNING → HUMAN_DECISION_REQUIRED` | `TRANSITIONS['PLANNING']` (`HDR`) | Legal, **ungated**. `HUMAN_DECISION_REQUIRED` is not a key of `ROUND_ON_ENTER`, so entering it consumes no round counter: from `planning = 8`, this transition leaves `planning` at **8** |
| `HUMAN_DECISION_REQUIRED → PLANNING` | `TRANSITIONS['HUMAN_DECISION_REQUIRED']` | Needs gate `resolve_human_decision`. Without a matching approval with a non-empty `approvedBy`, `transitionTask` throws `ApprovalRequiredError` |
| `HUMAN_DECISION_REQUIRED → PLAN_READY` | `TRANSITIONS['HUMAN_DECISION_REQUIRED']` | **Not legal** — no such rule; `InvalidTransitionError` |
| Human-authorised over-limit re-entry | `transitionTask` | Entering `PLANNING` runs `rounds.planning += 1`. `humanAuthorised = (task.state === 'HUMAN_DECISION_REQUIRED')`; when true the over-limit check is **skipped** — the transition is not redirected back to `HUMAN_DECISION_REQUIRED` and the incremented counter is kept. From `planning = 8`, a gated `HUMAN_DECISION_REQUIRED → PLANNING` re-entry therefore yields `planning = 9` |
| Escalation counter | `ROUND_ON_ENTER` | Consumed only on entry to `ESCALATION_REQUIRED`. Using `HUMAN_DECISION_REQUIRED` does **not** increment `roundCounts.escalation`, which stays **0** |
| Manifest | `dist/records.js` `validateTaskManifest`, imported read-only | Run against the pre-checkpoint `task.json` (state `PLANNING`, `planning = 8`, `escalation = 0`, `NOT_ACCEPTED`) → `{"ok":true,"errors":[]}`. Checkpoint and final states are validated as recorded in §6 and in `05-remediation-r8.md` |
| Runtime record | `state/tasks/` | Holds only `IMP02-MA-HARDEN-001.json` and `PV-20260919T162254Z-001.json`. No `ACC-01.json`. ACC-01 is not, and by ACC-R4-HD-02 remains not, registered in the conductor's runtime task store |

The actual semantics match the instruction exactly; **no divergence**, so continuation proceeds. No conductor source, config or state file was modified, no transition was invented, and `PLAN_READY` was not set.

## 2. Before state (`3be2698`)

| Field | Value |
|---|---|
| Branch / HEAD | `module/ACC-01` / `3be2698`, working tree clean; `main` = `origin/main` = `43f2f34` |
| Branch scope | Every changed path since `43f2f34` is under `docs/02_modules/ACC-01/**` or `docs/03_implementation/tasks/ACC-01/**` |
| Historical packs | `git diff <authoring commit> HEAD` is empty for v0.1 (`42316fe`), v0.2 (`8ff4e9d`), v0.3 (`194aff0`), v0.4 (`a865d63`), v0.5 (`826ab45`), v0.6 (`aa66084`), v0.7 (`0d7cfb0`), v0.8 (`e30cf8d`) |
| `state` | `PLANNING` |
| `roundCounts` | `planning` 8, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` |
| Open findings in the manifest | RF-01, RF-02, RF-05, RF-09, R7-F01 |

## 3. Legal transitions

| # | Transition | Gate | Applied at | Effect on counters |
|---|---|---|---|---|
| T1 | `PLANNING → HUMAN_DECISION_REQUIRED` | none | **this checkpoint** (commit 1). Reason: `04-review-r8.md` §21 — a further planning turn needs a human-decision cycle because `planning` is already at a prior human-authorised over-limit entry; no new design decision is at issue | none (`planning` stays 8; `escalation` stays 0) |
| T2 | `HUMAN_DECISION_REQUIRED → PLANNING` | `resolve_human_decision`, `approvedBy` = AimanRahimi | **the remediation commit** (commit 2), when v0.9 is written under this authorisation | `planning` 8 → **9** (human-authorised over-limit re-entry, real count, not reset); `escalation` stays 0 |

- T2 is **authorised now but not applied in this checkpoint.** After commit 1 the task is at `HUMAN_DECISION_REQUIRED`, with no v0.9 yet.
- Timestamps in this file and in `task.json` are the actual local recording time available to this session (`date -u`: **2026-10-01T07:36:46Z** for `task.json` `updatedAt`); the original timestamp of the human's message is not known here and is not invented.
- Per ACC-R4-HD-02, ACC-01 remains unregistered in the conductor's runtime store, so `task transition` is not used; the approval is recorded as a direct instruction to this session.

## 4. Human authorisation — recorded as given, not reinterpreted

**"approve ACC R8 procedural continuation"**

This is a **procedural** authorisation of the planning-round continuation (T1 → T2 above) for the technical remediation of ACC-01-R8-F01, ACC-01-R8-F02, ACC-01-R8-F03 and ACC-01-R8-F04. It is **not** a design decision, and it creates, amends or reinterprets no prior human decision. **No new architecture, business, regulatory or product decision is made.** **Preserved exactly as approved, unchanged by this checkpoint:** ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02, ACC-R5-HD-01.

`04-review-r8.md` independently confirms there is nothing here for a human to decide: R8-F01…R8-F04 are each answered **"Human decision required: NO"** (§7) and the review's conclusion is **"New human DESIGN decision required: NO"** (§21).

## 5. Task-manifest transcription of `04-review-r8.md`

This checkpoint transcribes `04-review-r8.md` §7 and §21 into `findingsSummary` only:

- R7-F01 (MEDIUM) is **closed in blueprint** (`04-review-r8.md` §5) and leaves the open list. R7-F02 (INFO) is closed and was never counted.
- R8-F01 (MEDIUM), R8-F02 (LOW) and R8-F03 (LOW) enter the open list. R8-F04 is INFO and is not counted (existing convention).
- RF-01 (HIGH), RF-02 (MEDIUM), RF-05 (MEDIUM) and RF-09 (LOW) stay open as external gates (unchanged carry-forward).
- Counts, computed from the recorded severities (INFO not counted): **BLOCKER 0, HIGH 1** (RF-01), **MEDIUM 3** (RF-02, RF-05, R8-F01), **LOW 3** (RF-09, R8-F02, R8-F03). These equal the totals stated in `04-review-r8.md` §21.
- `04-review-r8.md` and this file are added to `relevantRecordPaths`.

**Not authorised and not done:** application code, migrations, any change to `platform/**`, IAM-02, CLT-01, LED-01, CFG-01, FND-01, `aix-conductor`, `DECISION_LOG`, `OPEN_FINDINGS`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`, `main`; setting `PLAN_READY`; resetting or editing any historical round count; changing `maxPlanningRounds`; incrementing `escalation` merely for `HUMAN_DECISION_REQUIRED`; registering ACC-01 in the conductor runtime store; merging; inventing a lifecycle transition; reinterpreting any prior human decision.

## 6. After state (this checkpoint, commit 1)

| Field | Value |
|---|---|
| `state` | **`HUMAN_DECISION_REQUIRED`** |
| `roundCounts` | `planning` 8, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 (unchanged; not reset) |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| Implementation eligibility | **none** (`PLAN_READY` not set) |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` (executed against this commit's `task.json`) |

The task is intentionally stopped here. Continuation is T2, recorded in the remediation commit (`05-remediation-r8.md`; final `task.json`).
