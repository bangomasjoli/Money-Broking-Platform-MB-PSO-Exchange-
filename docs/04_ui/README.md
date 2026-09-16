---
document_id: UI-IDX
title: AIX UI — Design Governance Index
version: N/A
document_status: DRAFT
implementation_status: N/A
module: N/A
control: UI design governance navigation entry point
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 4c30c58
---

# AIX UI — Design Governance Index

This directory is the **Git-tracked design governance record** for the AIX
UI. Per the project's authoritative-in-Git principle, every meaningful
approved UI decision — direction, references, tokens, measurement rules,
component rules, responsive rules, navigation architecture, important UX
decisions, page acceptance records — must eventually be recorded here, not
only carried in chat memory.

## Status

**UI Phase 0A — Design Governance Foundation: COMPLETE.**
**UI Phase 0B — Visual Reference + Measurement Specification: CURRENT.**
Phase 0B turns Phase 0A's approved direction into explicit, measurable
values (spacing, typography, radii, control heights, floating-navigation
geometry, visual QA tolerances). **No frontend code, page, component, or
package exists yet.** See
[`AIX_UI_DESIGN_FOUNDATION_v0.1.md`](AIX_UI_DESIGN_FOUNDATION_v0.1.md) §18
and [`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md)
§20 for the explicit lists of what each phase did not do.

## Contents

- [`AIX_UI_DESIGN_FOUNDATION_v0.1.md`](AIX_UI_DESIGN_FOUNDATION_v0.1.md)
  (`UI-01`, DRAFT) — design philosophy, shadcn rule, public-vs-platform
  visual modes, anti-"AI look" rules, measurement discipline, provisional
  spacing foundation, responsive rules, token policy, floating-pill-
  navigation concept, backend-reality rule, regulatory UI boundary,
  reference register, portal categories, model-use guidance, and UI
  implementation discipline.
- [`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md)
  (`UI-02`, DRAFT) — the measurable specification built on `UI-01`:
  spacing tokens, control-height system, radius hierarchy, typography
  roles, content-width categories, page gutters, the full floating-pill-
  navigation geometry (desktop/tablet/mobile, sticky/scroll behavior,
  radius/border/shadow), visual QA tolerances, grid/alignment rules, icon
  sizes, and table/form/color direction. Every dimension is PROVISIONAL
  and/or DESIGN REVIEW REQUIRED, not final-approved.
- [`references/`](references/) — reference image storage. **Currently
  empty** — see [`references/README.md`](references/README.md) for the
  registration rule; no image may be registered unless it actually exists
  in this directory.

## Companion Project Skill

`.claude/skills/aix-ui-design/SKILL.md` — the project-local Claude Code
skill that enforces this directory's discipline during UI work (inspect
docs first, measure explicitly, reject generic AI visual patterns, preserve
backend/regulatory truth, prefer-but-customize shadcn primitives, focused
diffs, responsive + screenshot-based visual QA). Invoked automatically for
AIX UI/frontend/design work; see the skill file itself for its exact
trigger description.

## Relationship to Backend Governance

This directory is a peer of `03_implementation/` (backend build-order and
deployment-perimeter governance), not a replacement for it. UI work is
governed by the rules here **in addition to**, never instead of, the
backend-reality and regulatory-boundary constraints recorded in
`01_masters/`, `02_modules/`, `OPEN_FINDINGS.md`, and `DECISION_LOG.md`. A
UI decision that contradicts an approved backend/regulatory position is a
defect in the UI decision, not grounds to reinterpret the backend position.

## Future Structure (not created yet)

As UI work proceeds, this directory is expected to grow — for example,
finalized design-token files, page/screen acceptance records, and
navigation-architecture documents. **Do not pre-create empty structure for
work that has not happened yet** — add files here only when a turn actually
produces the content they would hold.
