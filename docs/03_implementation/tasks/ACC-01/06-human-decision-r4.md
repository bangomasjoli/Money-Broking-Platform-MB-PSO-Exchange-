# 06 Human-decision checkpoint (round 4) — ACC-01: Account Structure

- **Task ID:** ACC-01 (planning task — blueprint pack, **documentation only**)
- **Trigger:** [`04-review-r4.md`](04-review-r4.md) — v0.4 at `a865d63`, separate-context review, verdict **REMEDIATE** (recorded at `c6957a0`). Its §16 states that because `roundCounts.planning` is already at a human-authorised over-limit entry (4), another `HUMAN_DECISION_REQUIRED` cycle is required before any further planning turn, and that findings R4-F03 (and, per this checkpoint, R4-F05) need a human decision.
- **Recorded by:** blueprint planner / claude-sonnet-5, on the instruction of the human (Aiman).
- **Nothing is accepted. Implementation is not authorised. `PLAN_READY` is not set. No `06-acceptance.md` exists.**
- **File-name note:** as in round 3, the conductor defines no human-decision record name. This file uses `06-human-decision-r4.md` under the human's explicit instruction, a new file distinct from and not amending `06-human-decision-r3.md`, which remains unmodified historical evidence.

## 1. Conductor semantics reverified (read-only inspection of `aix-conductor` at `00a7bde`, clean, not modified)

Re-inspected in this fresh session: `src/state.ts` (`TRANSITIONS`, `ROUND_ON_ENTER`, `transitionTask`), `src/cli.ts` (the `task transition` subcommand and `taskTransition` handler), `config/local.config.json` (`loopLimits`), `tests/state.test.ts`, and `state/tasks/` (the conductor's runtime task store).

| Rule | Where | Fact |
|---|---|---|
| Limit | `config/local.config.json`, `config/example.config.json` | `maxPlanningRounds` = **3**; unchanged; not edited by this checkpoint |
| `PLANNING → PLANNING` | `TRANSITIONS` | **Not legal** (`canTransition('PLANNING','PLANNING')` = false, re-verified) |
| `PLANNING → HUMAN_DECISION_REQUIRED` | `TRANSITIONS` (`HDR`) | Legal, ungated, always safe. Re-verified: from `planning = 4`, entry to `HUMAN_DECISION_REQUIRED` leaves `planning` at **4** (no round is consumed by an `HDR` entry) |
| `HUMAN_DECISION_REQUIRED → PLANNING` | `TRANSITIONS` | Needs `resolve_human_decision`. Re-verified: without an approval, `transitionTask` throws `ApprovalRequiredError` |
| `HUMAN_DECISION_REQUIRED → PLAN_READY` | `TRANSITIONS` | **Not legal.** Re-verified: `InvalidTransitionError` |
| Human-authorised over-limit re-entry | `state.ts` `transitionTask` (`humanAuthorised`) | A gated `HUMAN_DECISION_REQUIRED → PLANNING` move is a human-authorised over-limit entry: the counter **still increments and records the real count**, is **never reset**. Re-verified in memory from `planning = 4`: the approved re-entry yields `planning = 5`, `escalation` **unchanged at 0** |
| Escalation counter | `ROUND_ON_ENTER` | Consumed only by entry to `ESCALATION_REQUIRED` (a reviewer `ESCALATE` decision). `HUMAN_DECISION_REQUIRED` is not `ESCALATION_REQUIRED`; the escalation counter is **not** incremented by this checkpoint. Confirmed in the re-executed transition above |
| Manifest | `records.ts` `validateTaskManifest` | Rejects unknown keys. Re-run against the current `task.json` (state `PLANNING`, `planning = 4`): `{"ok":true,"errors":[]}` |
| Runtime record | `state/tasks/` | Confirmed again: no `ACC-01.json` exists. Only `IMP02-MA-HARDEN-001.json` and `PV-20260919T162254Z-001.json` are present |

**Correction of a prior factual statement (ACC-R4-HD-02, applies prospectively — see §3).** `06-human-decision-r3.md` §1 and `05-remediation-r3.md` §1 stated: *"The conductor has no CLI command that resolves a `HUMAN_DECISION_REQUIRED` for a manual planning task; the transition rules are library rules."* This is **wrong**. `aix-conductor`'s `src/cli.ts` (lines 386–393, documented at line 119) provides:

```
aix-conductor task transition ID STATE --approved-by NAME [--reason TEXT] [--override CODE,...] [--config FILE]
```

Its handler `taskTransition` (`src/cli.ts` lines 212–232) loads the task's runtime record from `state/tasks/`, derives the required gate with `approvalGateFor`, requires `--approved-by` to be a non-empty name, and requires an **interactive typed APPROVE** confirmation before applying `transitionTask`. This command **could not be used for this checkpoint** for one reason only: **ACC-01 has no runtime record in `aix-conductor/state/tasks/`.** The command operates on the conductor's own task store; ACC-01's planning task exists only as this repository's `task.json` and its git task-record history. This correction is recorded here, prospectively, per ACC-R4-HD-02 below; `06-human-decision-r3.md` and `05-remediation-r3.md` are **not** edited.

## 2. Before state (`c6957a0`)

| Field | Value |
|---|---|
| `state` | `PLANNING` |
| `roundCounts` | `planning` 4, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` |
| Open findings in the manifest | RF-01, RF-02, RF-05, RF-09, R3-F01…R3-F07 (per `04-review-r4.md` §16, this checkpoint's remediation companion transcribes the round-4 dispositions) |

## 3. Legal transitions

| # | Transition | Gate | Applied at | Effect on counters |
|---|---|---|---|---|
| T1 | `PLANNING → HUMAN_DECISION_REQUIRED` | none | **this checkpoint** (commit 1). Reason: `04-review-r4.md` §16 — another human-decision cycle is required before a further planning turn, because `planning` is already at a prior human-authorised over-limit entry | none (`planning` stays 4) |
| T2 | `HUMAN_DECISION_REQUIRED → PLANNING` | `resolve_human_decision`, `approvedBy` = Aiman (AimanRahimi) | **the remediation checkpoint** (commit 2), when v0.5 is written under this authorisation | `planning` 4 → **5** (human-authorised over-limit re-entry, real count, not reset) |

- T2 is **authorised now but not applied in this checkpoint.** After commit 1 the task is at `HUMAN_DECISION_REQUIRED`, with no v0.5.
- `approvedBy`/`approvedAt`: the human's decisions were taken in ChatGPT and relayed to this session as the instruction for this task. The original decision time is **not recorded** anywhere this session can read, so it is not invented. The approval is recorded as **relayed**, not as a typed conductor prompt (per ACC-R4-HD-02, ACC-01 is **not** registered in the conductor's runtime store during this task, so `task transition` is not used here either).
- Timestamps in this file and in `task.json` are the true UTC clock time of the recording.

## 4. Human decisions — authoritative (approved by Aiman; decided in ChatGPT, relayed verbatim in substance)

Recorded as given. Not reinterpreted.

### ACC-R4-HD-01 — Rejected / withdrawn closure initiation (APPROVED)

Where a target is still `closing` and has **not** reached `closure_sealed`, a closure initiation may be returned through governed `abort_closure` when either:

- **A.** the final checker explicitly rejects the seal; or
- **B.** the closure initiation is formally withdrawn before seal.

This return path is maker-checker, fully audited, entitlement-checked, version-bound, evidence-bound, allowed **only** from `closing`, and **never** legal once `closure_sealed`. It represents WF-27 `rejected`. It is **not** a general-purpose reopening path and is **not** valid after seal. It must not bypass a court order, a regulatory restriction, a client status denial, another authoritative freeze, or any other external denial.

For checker rejection: the abort request binds to the actual seal-approval rejection evidence. For withdrawal: a formal withdrawal event/change request is recorded under the governed workflow. A simple maker decision alone must not return the account once initiation has already changed account state — the return is itself maker-checker.

This decision **amends the practical scope of ACC-R2-HD-03**: maker-checker abort is permitted for an explicitly rejected/withdrawn pre-seal closure, even though the account may otherwise be perfectly drained. It does not touch ACC-R2-HD-03's other terms (not a normal operational shortcut; cannot bypass a closure requirement once evidence conditions are otherwise unmet).

### ACC-R4-HD-02 — Conductor runtime registration (APPROVED)

ACC-01 is **not** registered into `aix-conductor/state/tasks/` during this task. Git task records remain the durable authority for this ACC-01 planning task. The historical statement that no CLI command exists for this resolution is corrected **prospectively** (§1); `06-human-decision-r3.md` and `05-remediation-r3.md` are **not** edited solely to correct it. Any future migration of manual module tasks into the conductor runtime store is a **separate governance task**, not decided here.

## 5. Human authorisation of the remediation, and task manifest transcription

- The human authorised remediation of `04-review-r4.md` R4-F01…R4-F06 in a new pack `v0.5` under the decisions above (and under a technical, non-human-decision resolution of R4-F02 using the review's option (b), which the human confirmed does not require a separate decision because it stays within ACC-R3-HD-01), **documentation only**. Scope, exclusions and the two-commit history are as in the instruction; they are applied in `05-remediation-r4.md`.
- **Not authorised and not done:** application code, migrations, any change to `platform/**`, IAM-02, CLT-01, LED-01, CFG-01, FND-01, `DECISION_LOG`, `OPEN_FINDINGS`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`, `main`; setting `PLAN_READY`; resetting or editing any historical round count; registering ACC-01 in the conductor runtime store; merging.
- **`task.json` transcription of `04-review-r4.md`** (§16 asks the conductor or human to transcribe it). This checkpoint transcribes it into `findingsSummary` only:
  - R3-F01 and R3-F05 are superseded by R4-F01 and R4-F02 respectively and leave the open list (the R3-F01 state is itself now unrepresentable; R3-F05 items 1/2/4 are closed and item 3's replacement is R4-F02).
  - R3-F02, R3-F03, R3-F04, R3-F06, R3-F07 are closed in blueprint (per `04-review-r4.md` §5) and leave the open list.
  - R4-F01, R4-F02, R4-F03 (MEDIUM) and R4-F04, R4-F05 (LOW) enter the open list. R4-F06 is INFO and is not counted (existing convention).
  - RF-01, RF-02, RF-05 and RF-09 stay open as external gates (unchanged carry-forward).
  - Counts follow the existing convention (INFO not counted): HIGH 1 (RF-01), MEDIUM 5 (RF-02, RF-05, R4-F01, R4-F02, R4-F03), LOW 3 (RF-09, R4-F04, R4-F05).
  - `04-review-r4.md` and this file are added to `relevantRecordPaths`.

## 6. After state (this checkpoint, commit 1)

| Field | Value |
|---|---|
| `state` | **`HUMAN_DECISION_REQUIRED`** |
| `roundCounts` | `planning` 4, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 (unchanged; not reset) |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| Implementation eligibility | **none** (`PLAN_READY` not set) |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` (executed against this commit's `task.json`) |

The task is intentionally stopped here. Continuation is T2, recorded in the remediation checkpoint.
