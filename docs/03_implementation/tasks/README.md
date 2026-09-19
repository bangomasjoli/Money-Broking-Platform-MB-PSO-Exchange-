---
document_id: TASKS-IDX
title: AIX Conductor-Managed Task Records — Index
version: N/A
document_status: DRAFT
implementation_status: N/A
module: N/A
control: Canonical durable location and rules for conductor-managed task records
owner: Unassigned
effective_date: 2026-09-19
last_reviewed: 2026-09-19
supersedes: none
baseline_commit: ae3322e
---

# Conductor-Managed Task Records

**Location:** `docs/03_implementation/tasks/<TASK-ID>/` is the **canonical, durable** record of one conductor-managed development task. The conductor's own `state/` directory is only a working copy, superseded at each record checkpoint.

**Scope:** conductor-managed work going forward. Historical acceptance and governance records stay authoritative where they already are (`02_modules/<MODULE>/acceptance/`, `03_implementation/IMP-0x/`, `DOCUMENT_REGISTER.md`, `OPEN_FINDINGS.md`). Nothing is migrated, and no folder is created for past modules.

Companion: [CURRENT_STATE.md](../../00_project_state/CURRENT_STATE.md) names the active task; the conductor repository (`aix-conductor`) implements the rules below.

## Folder layout

```
tasks/<TASK-ID>/
├── 01-plan.md
├── 02-implementation-report.md
├── 03-evidence.md
├── 04-review.md            (04-review-r2.md … one file per review round)
├── 05-remediation.md       (only if remediation occurs)
├── 06-acceptance.md        (only after acceptance)
├── task.json               (compact machine state + references)
└── executions/             (only once provider executions exist)
    ├── <executionId>.json            ModelExecutionRecord
    ├── <executionId>.manifest.json   context manifest (path, hash, bytes, category — never content)
    └── <executionId>.result.json     structured result (PlanResult / ImplementationResult / ReviewResult)
```

Templates: [`_templates/`](_templates/). Copy, fill, keep compact. Task IDs match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` (e.g. `UI-2R-001`, `WLT-3A-001`). Findings raised by a task are `<TASK-ID>-F01…`; a human promotes them to `OPEN_FINDINGS.md`.

## What each record is for

| File | Purpose | Proves correctness? |
|---|---|---|
| `01-plan.md` | Approved objective, scope, exclusions, risk, selected model role/effort, context references, acceptance criteria | No — it is the contract |
| `02-implementation-report.md` | What the implementer says it did: model, effort, baseline/resulting commit, changed-files summary, known issues | **No** |
| `03-evidence.md` | Independent facts read from the repository: commits, git status, diff stat, tests, typecheck, lint, migrations, evidence references | Yes — this is the evidence |
| `04-review.md` | Reviewer, model/effort, decision (ACCEPT / REMEDIATE / ESCALATE / HUMAN_DECISION), findings, evidence references, escalation decision | Judgement over the evidence |
| `05-remediation.md` | Findings being remediated, approved scope, implementing agent, result | — |
| `06-acceptance.md` | Final decision, accepted commit, acceptance evidence, carry-forward LOW/MEDIUM findings, reviewer/model metadata | The acceptance record |

**No model may mark a task or module accepted because an implementation report says tests passed.** Acceptance rests on `03-evidence.md` and the review, and a human approves it. Where a module already keeps a durable acceptance record under `02_modules/<M>/acceptance/`, `06-acceptance.md` is a short pointer to it, not a second copy.

## What must NOT be stored

Model hidden reasoning or chain-of-thought; chat transcripts; copies of source files; large raw diffs or logs (reference the commit or a file path instead); prompts assembled with file contents; secrets, tokens, credentials or authentication data; machine-specific absolute paths (use repo-relative paths).

## What IS stored

Task definition; selected model, effort and reason; context **manifest** (path, sha256, bytes, category — not content); prompt-template name + hash; structured results; concise human-readable summaries; commit hashes; findings; remediation and acceptance decisions; usage metadata where the provider exposes it; resulting task state.

## Record checkpoint (controlled documentation write)

Writing these records into this repository is a **RECORD CHECKPOINT**, not an implementation write. It is another controlled writer under the one-writer rule.

- **Allowlist (initial):** `docs/00_project_state/CURRENT_STATE.md` and `docs/03_implementation/tasks/**`. Nothing else, and never broad `docs/**`. Inside `tasks/**` only `.md` and `.json` files are permitted.
- **Never writable by a checkpoint:** application source, migrations, dependencies, secrets, runtime or deployment configuration, `platform/**`, `.claude/**`, `.mcp.json`.
- **Other governed files** (`OPEN_FINDINGS.md`, `MODULE_STATUS.md`, `DECISION_LOG.md`, `DOCUMENT_REGISTER.md`) may be changed only when the approved task or checkpoint explicitly names that exact file.
- **Preconditions:** explicit human approval; AIX working tree clean before starting; no implementation agent writing (no task `IMPLEMENTING`, no write lease held).
- **Before commit:** show the changed files; every changed path must be inside the allowlist (and not a symlink).
- **Commit:** a separate governance/evidence commit (`docs(control): …`), unless intentionally included in an approved task commit. The tree must be clean afterward.
- Implementation and checkpoint writers never run concurrently.

## Field reference for `task.json`

Machine state and references only — never long Markdown.

| Field | Meaning |
|---|---|
| `schemaVersion` | `1` |
| `taskId`, `title`, `category` | identity; category is free text for later analysis |
| `state` | conductor task state (`IDLE` … `ACCEPTED`, `FAILED`) |
| `risk` | `ROUTINE` / `MODERATE` / `HIGH` / `CRITICAL` |
| `baselineCommit`, `resultingCommit` | full or ≥7-char hashes, or `null` |
| `planner`, `implementer`, `reviewer` | `{ role, provider, model, effort }` of the latest execution in that capacity, or `null` |
| `selectedEfforts` | latest effective effort per logical role |
| `roundCounts` | planning / architecture / review / remediation / escalation |
| `findingsSummary` | open counts by severity, open finding IDs, carry-forward IDs |
| `acceptanceStatus` | `NOT_ACCEPTED` / `ACCEPTED` / `FAILED` |
| `relevantRecordPaths` | repo-relative paths of this task's records |
| `createdAt`, `updatedAt` | ISO-8601 UTC |
