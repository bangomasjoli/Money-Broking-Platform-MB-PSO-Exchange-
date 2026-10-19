---
document_id: STATE-004
title: AIX Platform — Claude Code Usage Rules
version: N/A
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Model selection / working-discipline rules
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# Claude Code Usage Rules

## Model selection
| Model | Use for |
|---|---|
| **Sonnet** | Normal coding, testing, refactoring, doc editing, mechanical fixes |
| **Opus** | Architecture, security, compliance, and fund-flow review only |
| **Fable** | UX copy, help text, error/notification wording only |

## Working discipline
- **Search/list before opening files.** Do not open files speculatively.
- **Focused diffs only.** Change the minimum; do not rewrite whole packs.
- **One module per session.** Finish, accept, then move on.
- Run **`/compact`** (or start a fresh session) after each module completes.
- On a **human-signed** acceptance, update [CURRENT_STATE.md](CURRENT_STATE.md), [MODULE_STATUS.md](MODULE_STATUS.md) and [DOCUMENT_REGISTER.md](../DOCUMENT_REGISTER.md). [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) is a historical narrative and is no longer maintained.
- **Do not upload or analyse unrelated files** or deep-scan the whole repository.

## Guardrails
- Enforce the licence boundary in every review. Authority: [CURRENT_STATE.md](CURRENT_STATE.md) §9, Doc 00 v1.5 and `DEC-012`/`DEC-013` in [DECISION_LOG.md](../DECISION_LOG.md) — not PROJECT_HANDOVER.md, which is historical.
  - **MB Spot:** external LP routing, agency / back-to-back; no internal client-to-client matching, no AIX order book or matching engine for MB Spot, no proprietary market making, no principal dealing — permanent, in every environment.
  - **AIX Exchange (securities):** architecture, implementation and controlled testing authorised; production activation gated; no regulatory approval implied. "Locked" means production activation closed, not "may not build".
  - **Runtime:** `assertNoExchangeRuntime` stays active; `MIG-001` is specified, not authorised. Never weaken or bypass a runtime guard.
  - **`DEC-015` / `STR-04` v0.4:** NOT_ACCEPTED; not authoritative.
- No code during architecture/security reviews — return gaps, corrections, and parameters only.
