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
- On **explicit, documented human acceptance** recorded in the authoritative acceptance record, update [CURRENT_STATE.md](CURRENT_STATE.md), [MODULE_STATUS.md](MODULE_STATUS.md) and [DOCUMENT_REGISTER.md](../DOCUMENT_REGISTER.md). [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) is a historical narrative and is no longer maintained.
- **Do not upload or analyse unrelated files** or deep-scan the whole repository.


## Accuracy & Verification Protocol
**Applies to every authorised Claude, ChatGPT/Codex or other AIX agent** when researching, designing, implementing, testing, reviewing or reporting on this repository. This working discipline is subordinate to the approved masters, controlled decisions, existing project instructions and explicit task boundaries. It does not itself authorise code changes, migrations, pushes, merges, acceptance or production operation.

1. **Verify the baseline.** Before material claims or changes, check the actual repository/ref, affected code, callers, integrations, tests and authoritative source records. Use search/list to find relevant evidence; avoid speculative repo-wide reads. A previous model's summary or memory is a lead, not proof.
2. **Classify evidence.** Distinguish `VERIFIED` (inspected or executed evidence), `INFERRED` (reasoned, not demonstrated), `PROPOSED` (not accepted) and `UNVERIFIED` (insufficient evidence). Quote exact source paths/sections, commit identities and test results when materially relevant. Do not invent live integration, regulatory approval or test outcomes.
3. **Resolve contradictions.** Trace material changes to an accepted requirement, decision, contract or finding. Where evidence conflicts, identify the exact conflict and its consequence. Never silently reinterpret or weaken accepted architecture, runtime gates or legal/regulatory boundaries.
4. **Implement fully, without bloat.** Reuse existing proven services, utilities, UI patterns and dependencies; prefer the simplest **complete and maintainable** implementation. Verify all affected callers, fixtures, configuration and documentation. Do not replace the institutional-grade product mission with an MVP or omit required behaviour to minimise code.
5. **Do not guess at critical ambiguity.** For identity, entitlements, maker-checker controls, client funds, ledger, custody, settlement, compliance or irreversible changes, report interpretations and the required owner decision before writing affected behaviour. For lower-risk ambiguity, document a bounded, testable assumption if compatible with authorisation.
6. **Security and integrity are non-negotiable.** Never remove fail-closed checks, step-up/MFA binding, role entitlement, SoD, audit evidence, error handling, idempotency, transaction safety, trust-boundary validation, privacy or resilience merely for shorter code or passing tests.
7. **Prove completion.** For code changes, report exact changed files, commands run and observed pass/fail/skip counts. Apply unit, negative, integration, concurrency and end-to-end tests proportional to the financial/security risk. A unit test, mocked provider or blueprint is not production evidence. Report unavailable tests without claiming success.
8. **Separate review and acceptance.** Critical security, finance and fund-flow changes require independent scrutiny and human acceptance under existing governance. A switch between models in the **same shared conversation** does not establish reviewer independence. The implementing agent may not self-accept or self-certify production readiness.
9. **Stay within the authorised task.** Keep diffs focused. No unrelated refactoring, speculative new dependency, documentation churn, bypass, forced merge or uncontrolled release. Record genuine blockers rather than restarting planning without new material evidence.
10. **End with an evidence-based status.** State what changed, what is verified versus unverified, what was tested, remaining material risk, and precisely which approval or step comes next. Do not call a task `IMPLEMENTED`, `ACCEPTED` or `PRODUCTION_READY` without the evidence required by root `CLAUDE.md` §4.

This protocol is a discipline for models, **not an enforcement mechanism**. The repository's code-level safeguards, tests, reviews, and approval gates remain the effective controls.

## Guardrails
- Enforce the licence boundary in every review. Authority: [CURRENT_STATE.md](CURRENT_STATE.md) §9, Doc 00 v1.6 and `DEC-012`/`DEC-013` in [DECISION_LOG.md](../DECISION_LOG.md) — not PROJECT_HANDOVER.md, which is historical.
  - **MB Spot:** external LP routing, agency / back-to-back; no internal client-to-client matching, no AIX order book or matching engine for MB Spot, no proprietary market making, no principal dealing — permanent, in every environment.
  - **AIX Exchange (securities) and RWA securities capabilities:** build-authorised, production-gated — architecture, implementation and controlled testing authorised; production activation stays gated; no regulatory approval implied. For these (and only these) "locked" means production activation is closed, not "may not build".
  - **Not production-gated — do not confuse:** the MB Spot prohibitions above are permanent with no activation path, and the out-of-scope items in Doc 00 v1.6 §20.6 (derivatives, futures, margin, lending, staking, yield, privacy coins, algorithmic stablecoins *where currently prohibited*, MYR pairs *where currently prohibited*, self-custody wallet service) have no build authorised (`DEC-013` clauses 5 and 6).
  - **Runtime:** `assertNoExchangeRuntime` stays active; `MIG-001` is specified, not authorised. Never weaken or bypass a runtime guard.
  - **`DEC-015` / `STR-04` v0.4:** NOT_ACCEPTED; not authoritative.
- No code during architecture/security reviews — return gaps, corrections, and parameters only.
