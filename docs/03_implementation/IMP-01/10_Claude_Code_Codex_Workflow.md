# IMP-01 AIX Master Implementation Handover
## 10 Claude Code / Codex Workflow

> **Current-authority notice (DOC-AUTH-01, 2026-10-19).** This workflow predates `DEC-012` / `DEC-013`. The prompt templates below have been corrected where they conflicted with current rules; the originals are in Git history. Start every session at [CURRENT_STATE.md](../../00_project_state/CURRENT_STATE.md), not `PROJECT_HANDOVER.md` (historical). Authority: [DECISION_LOG.md](../../DECISION_LOG.md) `DEC-012`, `DEC-013`; Doc 00 v1.5.

## 1. Cost-Saving Model Usage

Use:

```txt
Claude Sonnet = normal coding/testing/refactoring
Claude Opus = architecture/security/ledger/compliance/final review only
ChatGPT = documentation, prompts, planning, review coordination
Codex/Claude Code = repo implementation
```

Avoid:

1. one giant Claude Code session for whole repo.
2. full repo scans when only one module needed.
3. Opus for routine coding.
4. rewriting unrelated files.
5. implementing adjacent modules accidentally.

## 2. Fresh Session Prompt

```txt
Read docs/00_project_state/CURRENT_STATE.md first, then DOCUMENT_REGISTER.md, OPEN_FINDINGS.md and MODULE_STATUS.md.
PROJECT_HANDOVER.md is historical; use only the fenced prompt in SESSION_START_PROMPT.md.
Do not scan the full repo.
Current module: [MODULE CODE + NAME].
Work on this module only.
Use focused diffs.
Search before opening files.
Do not implement anything prohibited for Money Broking Spot (internal client-to-client matching, an AIX order book or matching engine for MB Spot, market making, principal dealing) in any environment.
AIX Exchange (securities domain) work only with explicit human authorisation; production activation stays gated.
Do not weaken or bypass assertNoExchangeRuntime; MIG-001 is not authorised.
Do not implement adjacent module logic unless this module owns it.
```

## 3. Module Coding Prompt

```txt
You are working on the AIX Money Broking + PSO Platform repository.

COST-CONTROL / TOKEN RULES:
- Use focused diffs.
- Search before opening files.
- Do not scan the full repo.
- Do not rewrite unrelated files.
- Do not implement future modules.
- After completing this module, use /compact or start a fresh session.

PROJECT CONTEXT:
- AIX Full Compliance targets a Money Broking + PSO operating model (no regulatory approval is implied by this repository).
- MB Spot: agency / external LP routing; permanently NO internal client-to-client matching, NO AIX order book or matching engine for MB Spot, NO market making, NO principal dealing, in every environment.
- AIX Exchange (securities domain) is a separate domain: build-authorised, production-gated (DEC-013); never reachable from an MB-domain module.
- assertNoExchangeRuntime stays active; MIG-001 is specified, not authorised.
- No AIX spread markup.
- Ledger must be immutable and double-entry.
- Audit must be append-only.

CURRENT MODULE:
[INSERT MODULE CODE + NAME]

FIRST STEP:
Search for existing implementation patterns relevant to this module.
Do not edit files yet.
Return proposed implementation plan and minimum files likely to change.
```

## 4. End-Of-Session Handover

Every Claude Code session should end with:

```txt
Module worked:
Files changed:
Tests added:
Tests run:
Known gaps:
Next step:
Handover notes:
```
