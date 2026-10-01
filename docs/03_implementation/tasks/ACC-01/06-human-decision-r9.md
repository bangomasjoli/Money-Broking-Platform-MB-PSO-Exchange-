# 06 Human-decision checkpoint (round 9) — ACC-01: Account Structure

- **Task ID:** ACC-01 (planning task — blueprint pack, **documentation only**)
- **Trigger:** [`04-review-r9.md`](04-review-r9.md) — v0.9 at `e506e69`, separate-context review, verdict **REMEDIATE** (recorded at `bc87a3b`). Its §22 states that `roundCounts.planning` is already at a prior human-authorised over-limit entry (9), so `PLANNING → PLANNING` is illegal and a further planning/remediation turn again needs a `HUMAN_DECISION_REQUIRED` cycle. As in rounds 6, 7 and 8, **no finding needs a human decision** — §22: "New human DESIGN decision required: NO. R9-F01…F03 are technical corrections within ACC-R3-HD-01/-02, ACC-R4-HD-01 and ACC-R5-HD-01 as written. The conductor still needs the human `resolve_human_decision` checkpoint to authorise the planning turn. That is a procedural approval, not a design decision."
- **Recorded by:** blueprint planner / claude-sonnet-5, on the instruction of the human (Aiman).
- **Nothing is accepted. Implementation is not authorised. `PLAN_READY` is not set. No `06-acceptance.md` exists.**
- **File-name note:** as in rounds 3–8, the conductor defines no human-decision record name. This file uses `06-human-decision-r9.md` under the human's explicit instruction, a new file distinct from and not amending `06-human-decision-r3.md` … `06-human-decision-r8.md`, all of which remain unmodified historical evidence.
- **What this checkpoint is NOT:** it is not remediation, not blueprint authoring, not implementation. It does not create `v0.10`. It does not set `PLAN_READY`. It does not create `06-acceptance.md`. It does not merge anything. It does not resolve `HUMAN_DECISION_REQUIRED` — that is a separate, later, explicit human response, not inferred or invented here.

## 1. Conductor semantics independently reverified (read-only inspection of `aix-conductor`, working tree clean, not modified)

Re-inspected in this fresh session, from `src/state.ts`, `src/records.ts` (`validateTaskManifest`) and `config/local.config.json` directly — not inferred from `04-review-r9.md` or from the round-8 checkpoint pattern alone: `aix-conductor` HEAD `00a7bde`, `git status` empty (0 changed files).

| Rule | Where | Fact |
|---|---|---|
| Limit | `config/local.config.json` L82 | `maxPlanningRounds` = **3**; unchanged; not edited by this checkpoint |
| `PLANNING → PLANNING` | `TRANSITIONS['PLANNING']` (`src/state.ts` L49) | **Not legal** — the rule list is `[{to:'PLAN_READY'}, HDR, FAILED]` |
| `PLANNING → HUMAN_DECISION_REQUIRED` | `TRANSITIONS['PLANNING']` (`HDR`) | Legal, **ungated**. `HUMAN_DECISION_REQUIRED` is not a key of `ROUND_ON_ENTER` (L86–91), so entering it consumes no round counter: from `planning = 9`, this transition leaves `planning` at **9** |
| `HUMAN_DECISION_REQUIRED → PLANNING` | `TRANSITIONS['HUMAN_DECISION_REQUIRED']` (L62) | Needs gate `resolve_human_decision`. Without a matching approval with a non-empty `approvedBy`, `transitionTask` throws `ApprovalRequiredError` (L133) |
| `HUMAN_DECISION_REQUIRED → PLAN_READY` | `TRANSITIONS['HUMAN_DECISION_REQUIRED']` | **Not legal** — no such rule; `InvalidTransitionError` |
| Human-authorised over-limit re-entry | `transitionTask` (L117–128) | Entering `PLANNING` runs `rounds.planning += 1`. `humanAuthorised = (task.state === 'HUMAN_DECISION_REQUIRED')` (L122); when true the over-limit check is **skipped** — the transition is not redirected back to `HUMAN_DECISION_REQUIRED` and the incremented counter is kept. From `planning = 9`, a future gated `HUMAN_DECISION_REQUIRED → PLANNING` re-entry would therefore yield `planning = 10` — **not performed by this checkpoint** |
| Escalation counter | `ROUND_ON_ENTER` | Consumed only on entry to `ESCALATION_REQUIRED`. Using `HUMAN_DECISION_REQUIRED` does **not** increment `roundCounts.escalation`, which stays **0** |
| Manifest | `src/records.ts` / `dist/records.js` `validateTaskManifest`, imported read-only | Run against the pre-checkpoint `task.json` (state `PLANNING`, `planning = 9`, `escalation = 0`, `NOT_ACCEPTED`) → `{"ok":true,"errors":[]}`. The after-checkpoint `task.json` (§6) is re-validated the same way before commit |
| Runtime record | `state/tasks/` | Holds only `IMP02-MA-HARDEN-001.json` and `PV-20260919T162254Z-001.json`. No `ACC-01.json`. ACC-01 is not, and by ACC-R4-HD-02 remains not, registered in the conductor's runtime task store |

The actual semantics match the round-9 review's §3 and §22 exactly; **no divergence**, so continuation proceeds. No conductor source, config or state file was modified, no transition was invented, and `PLAN_READY` was not set.

## 2. Before state (`bc87a3b`)

| Field | Value |
|---|---|
| Branch / HEAD | `module/ACC-01` / `bc87a3b` (= `origin/module/ACC-01`), working tree clean; `main` = `origin/main` = `43f2f34` |
| Branch scope | Every changed path since `43f2f34` is under `docs/02_modules/ACC-01/**` or `docs/03_implementation/tasks/ACC-01/**` |
| Historical packs | `git diff <authoring commit> HEAD` is empty for v0.1 (`42316fe`), v0.2 (`8ff4e9d`), v0.3 (`194aff0`), v0.4 (`a865d63`), v0.5 (`826ab45`), v0.6 (`aa66084`), v0.7 (`0d7cfb0`), v0.8 (`e30cf8d`), v0.9 (`e506e69`) |
| `state` | `PLANNING` |
| `roundCounts` | `planning` 9, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` |
| Open findings in the manifest | RF-01, RF-02, RF-05, RF-09, R8-F01, R8-F02, R8-F03 |

## 3. Round-9 review transcription (`04-review-r9.md` at `bc87a3b`)

The authoritative pushed round-9 review's verdict is **REMEDIATE**.

**Closed by this review:**

- ACC-01-R8-F01 — CLOSED IN BLUEPRINT
- ACC-01-R8-F02 — CLOSED IN BLUEPRINT
- ACC-01-R8-F03 — CLOSED IN BLUEPRINT
- ACC-01-R8-F04 (INFO) — CLOSED IN BLUEPRINT

**New findings from round 9:**

- **ACC-01-R9-F01 — MEDIUM** — trigger/function name-resolution hardening: the specified `SECURITY DEFINER` `search_path` (`pg_catalog, acc1`) omits `pg_temp`; reproduced on PostgreSQL 17.10 as a runtime-created temp-table shadow that suppresses the restriction `version` bump and feeds the counter guard's abort branch a forged recovery row.
- **ACC-01-R9-F02 — LOW** — maker-only initiation has no request-level completeness proof; a savepoint-swallowed closing `UPDATE` can leave an inert applied initiation (and, for a master, an orphan `open` `closure_family`).
- **ACC-01-R9-F03 — INFO** — precision corrections (six items: an invalid trigger `WHEN` clause, a synthetic restriction-touch bump on a no-op, an uninventoried deferred clock-based recheck, exactly-once wording for the attester set, a missing `approval_id_source IS NULL` clause, and two test rows naming the wrong refusing layer). **Not counted** in `findingsSummary` (existing convention, same as R7-F02 and R8-F04).

**Existing external findings, unchanged carry-forward:**

- ACC-01-RF-01 — HIGH
- ACC-01-RF-02 — MEDIUM
- ACC-01-RF-05 — MEDIUM
- ACC-01-RF-09 — LOW

**Resulting counts** (INFO not counted, matching `04-review-r9.md` §22): **BLOCKER 0, HIGH 1** (RF-01), **MEDIUM 3** (RF-02, RF-05, R9-F01), **LOW 2** (RF-09, R9-F02).

## 4. Legal transitions

| # | Transition | Gate | Applied at | Effect on counters |
|---|---|---|---|---|
| T1 | `PLANNING → HUMAN_DECISION_REQUIRED` | none | **this checkpoint** (commit 1). Reason: `04-review-r9.md` §22 — a further planning/remediation turn needs a human-decision cycle because `planning` is already at a prior human-authorised over-limit entry (9); no new design decision is at issue | none (`planning` stays 9; `escalation` stays 0) |
| T2 | `HUMAN_DECISION_REQUIRED → PLANNING` | `resolve_human_decision` | **not performed by this checkpoint.** Requires a later, explicit human response authorising one further over-limit planning/remediation turn to address R9-F01, R9-F02 and R9-F03 | not applicable here |

- T2 is **not authorised and not applied by this checkpoint.** This checkpoint performs only T1. After it, the task is at `HUMAN_DECISION_REQUIRED`, with no v0.10 and no human authorisation recorded yet.
- **No human approval is recorded or fabricated here.** Unlike the round-8 checkpoint (which transcribed the human's prior verbal instruction "approve ACC R8 procedural continuation" because that approval had already been given before that checkpoint was written), **no equivalent round-9 approval has been given at the time of this checkpoint.** This file records only the procedural question that the human must still answer: whether to authorise one further over-limit planning/remediation turn to address ACC-01-R9-F01, ACC-01-R9-F02 and ACC-01-R9-F03.
- Timestamp: `task.json` `updatedAt` uses the actual current UTC time of this checkpoint (§6), not a fabricated human-decision timestamp.
- Per ACC-R4-HD-02, ACC-01 remains unregistered in the conductor's runtime store, so `task transition` is not used; this checkpoint is recorded as a direct governance entry for this session.

## 5. Human authorisation status

**No human authorisation has been given for round 9 as of this checkpoint.**

This checkpoint records the **procedural decision the human must make**: whether to authorise one further over-limit planning/remediation turn (`HUMAN_DECISION_REQUIRED → PLANNING(10)`) to address the technical findings ACC-01-R9-F01 (MEDIUM), ACC-01-R9-F02 (LOW) and ACC-01-R9-F03 (INFO) raised by `04-review-r9.md`.

- **Human DESIGN decision required: NO.** `04-review-r9.md` §22 states explicitly that R9-F01…F03 are technical corrections within ACC-R3-HD-01/-02, ACC-R4-HD-01 and ACC-R5-HD-01 as written, and reinterpret no prior human decision.
- **Procedural human decision required: YES.** The conductor's `resolve_human_decision` gate on `HUMAN_DECISION_REQUIRED → PLANNING` cannot be satisfied without it, independent of whether the underlying findings are design-level.
- **Preserved exactly as approved, unchanged by this checkpoint:** ACC-R2-HD-01…08, ACC-R3-HD-01…03, ACC-R4-HD-01…02, ACC-R5-HD-01.

## 6. Task-manifest transcription of `04-review-r9.md`

This checkpoint transcribes `04-review-r9.md` §7 and §22 into `findingsSummary` only:

- R8-F01 (MEDIUM), R8-F02 (LOW) and R8-F03 (LOW) are **closed in blueprint** (`04-review-r9.md` §5) and leave the open list. R8-F04 (INFO) is closed and was never counted.
- R9-F01 (MEDIUM) and R9-F02 (LOW) enter the open list. R9-F03 (INFO) is not counted (existing convention).
- RF-01 (HIGH), RF-02 (MEDIUM), RF-05 (MEDIUM) and RF-09 (LOW) stay open as external gates (unchanged carry-forward).
- Counts, computed from the recorded severities (INFO not counted): **BLOCKER 0, HIGH 1** (RF-01), **MEDIUM 3** (RF-02, RF-05, R9-F01), **LOW 2** (RF-09, R9-F02). These equal the totals stated in `04-review-r9.md` §22.
- `04-review-r9.md` and this file are added to `relevantRecordPaths`.

**Not authorised and not done:** application code, migrations, any change to `platform/**`, IAM-02, CLT-01, LED-01, CFG-01, FND-01, `aix-conductor`, `DECISION_LOG`, `OPEN_FINDINGS`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`, `main`; setting `PLAN_READY`; creating `06-acceptance.md`; resetting or editing any historical round count; changing `maxPlanningRounds`; incrementing `escalation` merely for `HUMAN_DECISION_REQUIRED`; registering ACC-01 in the conductor runtime store; merging; inventing a lifecycle transition; reinterpreting any prior human decision; fabricating or inferring a human's procedural approval for round 9.

## 7. After state (this checkpoint, commit 1)

| Field | Value |
|---|---|
| `state` | **`HUMAN_DECISION_REQUIRED`** |
| `roundCounts` | `planning` 9, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 (unchanged; not reset) |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| `resultingCommit` | `null` |
| Implementation eligibility | **none** (`PLAN_READY` not set; no `06-acceptance.md`) |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` (executed against this commit's `task.json`) |

The task is intentionally stopped here. Continuation (T2) requires a later, explicit human procedural decision — not inferred, not fabricated, not performed by this checkpoint.
