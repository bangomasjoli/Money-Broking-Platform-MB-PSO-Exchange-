# IMP-01 AIX Master Implementation Handover
## 10 Claude Code / Codex Workflow

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
Read PROJECT_HANDOVER.md and MODULE_STATUS.md first.
Then read SESSION_START_PROMPT.md.
Do not scan the full repo.
Current module: [MODULE CODE + NAME].
Work on this module only.
Use focused diffs.
Search before opening files.
Do not implement Exchange features.
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
- AIX is a regulated Money Broking + PSO platform.
- Exchange runtime is prohibited until licensed.
- No public order book.
- No matching engine.
- No market making.
- No principal dealing.
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
