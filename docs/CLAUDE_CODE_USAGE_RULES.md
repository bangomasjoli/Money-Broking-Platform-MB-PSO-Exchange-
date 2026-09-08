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
- Maintain the short handover docs: update [MODULE_STATUS.md](MODULE_STATUS.md) and [INDEX.md](INDEX.md) on acceptance; keep [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) current.
- **Do not upload or analyse unrelated files** or deep-scan the whole repository.

## Guardrails
- Enforce the licence lock in every review (exchange features LOCKED — see [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md)).
- No code during architecture/security reviews — return gaps, corrections, and parameters only.
