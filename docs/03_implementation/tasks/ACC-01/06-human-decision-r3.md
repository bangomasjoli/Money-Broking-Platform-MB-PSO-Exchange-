# 06 Human-decision checkpoint (round 3) — ACC-01: Account Structure

- **Task ID:** ACC-01 (planning task — blueprint pack, **documentation only**)
- **Trigger:** [`04-review-r3.md`](04-review-r3.md) — v0.3 at `194aff0`, separate-context review, verdict **REMEDIATE** (recorded at `3b3a3ee`). Its §12 states that the next planning turn requires `HUMAN_DECISION_REQUIRED` and that a v0.4 must not be started silently.
- **Recorded by:** blueprint planner / claude-sonnet-5, on the instruction of the human (Aiman).
- **Nothing is accepted. Implementation is not authorised. `PLAN_READY` is not set. No `06-acceptance.md` exists.**
- **File-name note:** the conductor defines no human-decision record name (its `taskRecordPaths` knows `01`…`06-acceptance`, `04-review-rN`, `task.json`, `executions/`). This file uses `06-human-decision-r3.md` under the human's explicit fall-back instruction. It is **not** an acceptance record and does not occupy the `06-acceptance.md` slot.

## 1. Conductor semantics found (read-only inspection of `aix-conductor` at `00a7bde`, clean, not modified)

Files inspected: `src/state.ts`, `src/types.ts`, `src/records.ts` (`validateTaskManifest`), `src/planningCheckpoint.ts`, `src/normalCycle.ts`, `src/implementation.ts`, `src/recovery.ts`, `src/checkpoint.ts`, `src/cli.ts` (command list), `config/example.config.json` and `config/local.config.json` (`loopLimits`), `tests/state.test.ts`, `docs/phase4c-repeatable-cycles.md`, `docs/model-routing.md`.

| Rule | Where | Fact |
|---|---|---|
| Limit | both config files | `maxPlanningRounds` = **3**; no per-task override exists |
| Entering `PLANNING` consumes a round | `state.ts` `ROUND_ON_ENTER` | The `planning` counter is incremented on entry. Beyond the limit, entry is **redirected** to `HUMAN_DECISION_REQUIRED`, the counter is rolled back, and the history entry carries `limitRedirect` |
| `PLANNING → PLANNING` | `TRANSITIONS` | **Not a legal transition.** Only `PLANNING → {PLAN_READY, HUMAN_DECISION_REQUIRED, FAILED}` |
| `PLANNING → HUMAN_DECISION_REQUIRED` | `TRANSITIONS` (`HDR`) | Legal, **no gate, no approval needed** ("always safe") |
| Exit from `HUMAN_DECISION_REQUIRED` | `TRANSITIONS` | `→ PLANNING`, `APPROVED_FOR_IMPLEMENTATION`, `REMEDIATION_REQUIRED`, `REVIEWING`, `FAILED` each need a `resolve_human_decision` approval; `→ ACCEPTED` needs `accept_module`. **`→ PLAN_READY` is not legal**, and `→ IMPLEMENTING` is not legal |
| Human-authorised over-limit entry | `state.ts` `transitionTask` (`humanAuthorised`) | A gated move out of `HUMAN_DECISION_REQUIRED` into `PLANNING` is "the human explicitly authorising rounds beyond the limit". The counter **still records the real count** (limit + 1); it is never reset; every later over-limit entry redirects again. Unit-tested in `tests/state.test.ts` |
| Approval shape | `types.ts` `HumanApproval` | `{ gate: 'resolve_human_decision', approvedBy (non-empty), approvedAt, note? }` |
| Escalation counter | `ROUND_ON_ENTER` | `escalation` is consumed only by `ESCALATION_REQUIRED` (a reviewer `ESCALATE` decision). Entering `HUMAN_DECISION_REQUIRED` consumes **no** counter |
| Manifest | `records.ts` `validateTaskManifest` | Rejects unknown keys. `task.json` carries **no history and no approval record**; it holds `state`, `roundCounts`, `findingsSummary`, `relevantRecordPaths` and references only |
| Runtime record | `state/tasks/` | No `ACC-01.json` exists in the conductor's runtime state directory. The AIX `task.json` is the only durable machine record of this task. The conductor has **no CLI command** that resolves a `HUMAN_DECISION_REQUIRED` for a manual planning task; the transition rules are library rules (`transitionTask`) |

Consequences, stated plainly:

- The only legal continuation from an exhausted `PLANNING` is `PLANNING → HUMAN_DECISION_REQUIRED → (resolve_human_decision approval) → PLANNING`. It needs **no conductor, code or governance change**, so v0.4 is not blocked.
- That re-entry is **not** an ordinary planning round. The conductor records it as a human-authorised over-limit entry, and the counter becomes 4 by the conductor's own rule. The count is **not reset** and **not invented**.
- The re-entry lands in `PLANNING`, never `PLAN_READY`. `PLAN_READY` needs a separate re-review and is not reachable from `HUMAN_DECISION_REQUIRED`.
- `task.json` cannot store the transition history or the approval, so this file is the record of both. `task.json` is changed only by the two legal transitions below plus the finding transcription in §5. No key was added and `maxPlanningRounds` was not touched.

Verification of the above by execution (in-memory only; no conductor state written): a `TaskRecord` at `PLANNING` with `rounds.planning = 3` was passed through `transitionTask` from `dist/state.js`.

| Step | Result |
|---|---|
| `PLANNING → PLANNING` | `canTransition` = false |
| `PLANNING → HUMAN_DECISION_REQUIRED` | `HUMAN_DECISION_REQUIRED`, `planning` stays 3, no approval required |
| `HUMAN_DECISION_REQUIRED → PLANNING` without approval | `ApprovalRequiredError` |
| `HUMAN_DECISION_REQUIRED → PLAN_READY` | `InvalidTransitionError` |
| `HUMAN_DECISION_REQUIRED → PLANNING` with `resolve_human_decision` by `AimanRahimi` | `PLANNING`, `planning` = **4**, `escalation` = 0, history entry carries the approval |

## 2. Before state (`3b3a3ee`)

| Field | Value |
|---|---|
| `state` | `PLANNING` |
| `roundCounts` | `planning` 3, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` |
| Open findings in the manifest | RF-01, RF-02, RF-05, RF-09, R2-F01…R2-F09 (stale: `04-review-r3.md` §12 says the manifest was left untouched for the conductor or human to transcribe) |

## 3. Legal transitions

| # | Transition | Gate | Applied at | Effect on counters |
|---|---|---|---|---|
| T1 | `PLANNING → HUMAN_DECISION_REQUIRED` | none | **this checkpoint** (commit 1). Reason: `maxPlanningRounds` (3) reached; `04-review-r3.md` §12 | none (`planning` stays 3) |
| T2 | `HUMAN_DECISION_REQUIRED → PLANNING` | `resolve_human_decision`, `approvedBy` = Aiman (AimanRahimi) | **the remediation checkpoint** (commit 2), when v0.4 is written under this authorisation | `planning` 3 → **4** (human-authorised over-limit entry, real count) |

- T2 is **authorised now but not applied in this checkpoint.** After commit 1 the task is at `HUMAN_DECISION_REQUIRED`, with no v0.4.
- `approvedBy`/`approvedAt`: the human's decisions were taken in ChatGPT and relayed to this session as the instruction for this task. The original decision time is **not recorded** anywhere this session can read, so it is not stated. The approval is recorded as **relayed**, not as a typed conductor prompt.
- Timestamps in this file and in `task.json` are the true UTC clock time of the recording. The previous manifest value `2026-09-26T21:00:00.000Z` (r2 remediation) is later than the real commit times (`194aff0` = 10:30Z, `3b3a3ee` = 15:03Z), so `updatedAt` goes backwards relative to it. That value was not a true clock reading. It is not "corrected" retroactively.

## 4. Human decisions — authoritative (approved by Aiman; decided in ChatGPT, relayed verbatim in substance)

These are recorded as given. They are not reinterpreted. ACC-R3-HD-01 **amends** the relevant part of ACC-R2-HD-04. Full application is in v0.4 file 17 §4.4 and `05-remediation-r3.md` (written in the remediation checkpoint).

### ACC-R3-HD-01 — Master-family closure (APPROVED)

Structural invariant: **every non-`closed` master account has exactly one non-`closed` default `general` subaccount.** A master-directed closure must not permanently close its default or other master-directed children before the master can itself complete.

1. Master closure begins.
2. Master, default and every master-directed non-closed child enter `closing` under the governed family closure.
3. Each child drains, reaches pre-seal ready, and receives the applicable final checker approval / seal control.
4. Each master-directed child reaches `closure_sealed` with `closure_barrier = true`, the current seal version, and a clear latest post-barrier attestation.
5. Master-directed children **stop at `closure_sealed`**. They do not individually become `closed`.
6. The master may enter `closure_sealed` only when every master-directed child is `closure_sealed` with a fresh, current, clear attestation; any child whose closure is independent of the master is treated by its own lifecycle and must satisfy the family eligibility rule; and the master's own readiness passes.
7. Final master completion is **one atomic transaction**: re-verify the master's latest current attestation; re-verify every master-directed child's latest attestation at its current seal version; verify barriers remain true; verify no version or readiness evidence changed; close every master-directed child; close the default; close the master. The family goes `closed` atomically.
8. Master abort, before family completion, reverses the master, the default and every master-directed child still participating in that family closure. Their barriers are cleared only by the governed abort transaction. A child closure initiated **independently** before the master closure must **not** be silently reversed because the master aborts. The blueprint must define how independently initiated child closures are identified and preserved.
9. This eliminates "ACTIVE master + `closed` default". A `closed` child from an independently completed closure may remain `closed` only if the structural / default invariant still holds and the family rules explicitly support it. **The default may never be independently closed while the master is non-`closed`.**

### ACC-R3-HD-02 — Closure initiation / OQ-13 (APPROVED)

Closure initiation is **maker-only + entitlement-checked + audited**. It is **not** maker-checker.

1. Entitled maker initiates.
2. Drain / readiness.
3. The checker gives the **one** final human approval immediately before the seal, after drain, pre-seal readiness and exact evidence binding.
4. Seal.
5. Machine attestation.
6. Machine completion.

Do not reuse an approval-gated IAM code for initiation if current IAM-02's approval short-circuit would bypass entitlement. The owning IAM-02 / Role Matrix change must expose an entitlement-checkable maker-initiation permission or an equivalent governed seam. Until that exists, **real closure initiation remains externally gated.** OQ-13 is resolved by this decision.

### ACC-R3-HD-03 — Dependency evidence (APPROVED)

A configuration string or self-declared contract version can **never** by itself satisfy a safety dependency. A `DEP` prerequisite is satisfied only by:

- **A.** behaviour or evidence that ACC-01 can verify from the authoritative owning service; **or**
- **B.** an authoritative governance / control source outside ACC-01's own mutable configuration.

For runtime service dependencies, prefer behavioural verification: IAM-02 independently validates the authenticated actor source; the attested IAM decision explicitly proves the entitlement / policy evaluation; the CLT-01 seam or credential metadata proves the narrow scope; ACC-01 verifies the actual LED-01 attester descriptor / contract or calls the actual seam as required.

Governance-only dependencies with **no** runtime verification seam remain **hard-unsatisfied in ACC-01** until an authoritative governance checkpoint closes them. No `config.freeze_governance_ref = "…"` ⇒ satisfied. No local Boolean pretending a governance decision exists. The conductor / governance layer may authorise a later code or config change that removes the hard gate once the authoritative record exists. **CFG-01 remains the sole owner of `ENVIRONMENT_AVAILABILITY`**; this decision does not move environment control back into ACC-01.

## 5. Human authorisation of the remediation, and task manifest transcription

- The human authorised remediation of `04-review-r3.md` R3-F01…R3-F07 in a new pack `v0.4` under the decisions above, **documentation only**. Scope, exclusions and the two-commit history are as in the instruction; they are applied in `05-remediation-r3.md`.
- **Not authorised and not done:** application code, migrations, any change to `platform/**`, IAM-02, CLT-01, LED-01, CFG-01, FND-01, `DECISION_LOG`, `OPEN_FINDINGS`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`, `main`; setting `PLAN_READY`; resetting or editing any historical round count; merging.
- **`task.json` transcription of `04-review-r3.md`** (the review asked the conductor or human to transcribe it). This checkpoint transcribes it into `findingsSummary` only:
  - R2-F01 and R2-F02 are superseded by R3-F02 and R3-F01. R2-F03…R2-F09 are recorded by that review as closed in blueprint. All nine leave the open list.
  - R3-F01…R3-F07 enter the open list. RF-01, RF-02, RF-05 and RF-09 stay open as external gates.
  - Counts follow the existing convention (INFO is not counted): HIGH 1 (RF-01), MEDIUM 5 (RF-02, RF-05, R3-F01, R3-F02, R3-F03), LOW 4 (RF-09, R3-F04, R3-F05, R3-F06). R3-F07 is INFO.
  - `04-review-r3.md` and this file are added to `relevantRecordPaths`.

## 6. After state (this checkpoint, commit 1)

| Field | Value |
|---|---|
| `state` | **`HUMAN_DECISION_REQUIRED`** |
| `roundCounts` | `planning` 3, `architecture` 0, `review` 0, `remediation` 0, `escalation` 0 (unchanged; not reset) |
| `acceptanceStatus` | `NOT_ACCEPTED` |
| Implementation eligibility | **none** (`PLAN_READY` not set) |
| `validateTaskManifest` | `{"ok":true,"errors":[]}` (executed against this commit's `task.json`) |

The task is intentionally stopped here. Continuation is T2, recorded in the remediation checkpoint.
