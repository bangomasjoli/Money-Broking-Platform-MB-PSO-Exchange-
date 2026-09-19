# 03 Evidence — <TASK-ID>

> Facts read from the repository and check output, not from the implementation report. Reference commits and files; do not paste large diffs or logs.

- **Collected:** <ISO-8601 UTC>
- **Baseline commit:** <hash>
- **Resulting commit:** <hash>
- **Branch:** <name>
- **Working tree clean:** <true | false>

## Checks
| Check | Command | Status | Exit | Evidence reference |
|---|---|---|---|---|
| tests | <cmd> | <PASS \| FAIL \| NOT_RUN> | <n> | <path or "summary only"> |
| typecheck | <cmd> | | | |
| lint | <cmd> | | | |
| migrations | <cmd, or "n/a"> | | | |

## Changed files
- <path>

## Diff stat
```
<git diff --stat baseline..HEAD>
```

## Targeted evidence references
- <path or commit — what it shows>
