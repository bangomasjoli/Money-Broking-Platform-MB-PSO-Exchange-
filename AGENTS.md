# AIX Full Compliance — shared coding-agent instructions

These instructions apply to repository-aware ChatGPT/Codex, Claude Code, and other authorised coding/review agents. **Read and follow [`CLAUDE.md`](CLAUDE.md)** (the existing authoritative repository operating rules) and the approved sources it identifies before acting. This file is a cross-agent entry point, **not** a replacement for those instructions or an independent source of project authority.

## Project boundaries
- This is independently developed software; do not imply it or its owner holds a licence. Preserve the approved licence scope, permanently prohibited MB Spot internal matching/principal dealing, production-gated Exchange/RWA capabilities, and all current runtime restrictions. See `CLAUDE.md` §§1–3 for exact boundaries and qualifications.
- Search/list first. Read `docs/00_project_state/CURRENT_STATE.md`, `docs/DOCUMENT_REGISTER.md`, `docs/OPEN_FINDINGS.md`, relevant `docs/DECISION_LOG.md` entries, accepted masters, and actual implementation evidence as needed. A prior chat or model summary is not source authority.

## Accuracy & Verification Protocol
Read [`docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md`](docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md#accuracy--verification-protocol). For any coding, architecture, review or completion claim:
1. Inspect relevant actual code, callers, tests and accepted requirements before proposing or implementing changes; verify the baseline commit/ref.
2. Clearly distinguish **VERIFIED**, **INFERRED**, **PROPOSED**, and **UNVERIFIED**; do not invent integrations, approvals, results or acceptance evidence.
3. Prefer reuse and the smallest **complete, correct, secure, maintainable** solution. Preserve requirements, negative tests, financial integrity, audit trails, idempotency, SoD, step-up and permission checks; never optimise away safeguards.
4. Resolve material conflicts with approved architecture before changing it. Escalate critical ambiguity about funds, custody, identity, permission or irreversible operations rather than guessing.
5. Run appropriate tests when authorised and possible; report exact commands, results, missing checks, material risks and affected files. Unit/stubbed results are not evidence of end-to-end operations.
6. Maintain fresh-context **independent review** for critical security and finance changes; switching models in a shared session is not independent evidence.
7. Never treat proposed or blueprint-only work as implemented, accepted, licensed or production-ready. Respect human authorisation for protected actions, migrations, push/merge, acceptance and deployment.

## Scope and nested rules
- Follow `CLAUDE.md` §§4–7 for status discipline, task selection, branch safety and human approvals. No task is active by default; an authorised request is needed.
- For web work, also follow `platform/apps/web/CLAUDE.md` and its existing `platform/apps/web/AGENTS.md` (Next.js version-specific rules). Do not replace those files.
- These repo instructions do **not** install a model plugin, modify ChatGPT Project settings or guarantee automatic loading in every chat interface. Confirm your host's instruction loading; otherwise use the explicit task prompt.
