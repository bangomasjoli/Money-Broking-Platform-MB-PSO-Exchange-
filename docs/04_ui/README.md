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
**UI Phase 0B — Visual Reference + Measurement Specification: COMPLETE.**
**UI Phase 1A — Frontend Technical Foundation: COMPLETE.**
**UI Phase 1B — Floating-Pill Public Navigation: VISUALLY ACCEPTED.** The
first real AIX visual component
(`platform/apps/web/components/site/public-header.tsx`, `PublicHeader`) —
implemented at `537c71d`, remediated at `47c0f1a` — is accepted by user
visual review at 1440px, 1024px, 768px, and 430/440px. The original
768px (`md:`) full-desktop threshold was rejected as visibly compressed;
Remediation 01 moved the full-desktop/compact-mobile switch to `lg:`
(1024px), and the resulting responsive rule (full desktop ≥1024px,
compact floating navigation <1024px) is accepted at every tested width.
`47c0f1a` is the accepted implementation baseline. REF-UI-001's floating-
pill concept was successfully adapted, not copied — its scope remains
unchanged (treatment only, never Phantom's branding/colors/typography).
**Not accepted by this turn:** a final AIX color palette, a final font, a
final brand asset/logo, or the full public website — the header still
uses new, explicitly provisional, public-marketing-scope-only tokens, and
shrink-on-scroll remains explicitly deferred. See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md) §10.6–§10.8
and [`AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md`](AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md)
§19 for the full implementation record, findings, and deferred items.
**UI Phase 1C — Public Landing Hero: VISUALLY ACCEPTED.** The second real
AIX visual component
(`platform/apps/web/components/site/public-hero.tsx`, `PublicHero`) —
implemented at `1f9a49b`, remediated at `ddc33a4` — is accepted by user
visual review at 1440px, 1024px, 768px, and 430px. It adds only the
header + hero (no feature/pricing/footer/testimonial/dashboard content) —
the accepted `PublicHeader` (§ above) is unchanged. Headline/copy avoid
every prohibited regulatory claim; the product-preview panel illustrates
the real, already-backed IAM-02 maker-checker workflow, explicitly
labeled "Demo preview," with no fabricated figures. Remediation 01 fixed
two defects the initial review found: "digital-asset" splitting across
its internal hyphen (now an indivisible wrap unit via `whitespace-nowrap`,
with unchanged accessible/text content), and the 768–1023px preview panel
centering inconsistently against the left-aligned copy (now sharing the
same left edge). `ddc33a4` is the accepted implementation baseline.
**Accepted responsive rule:** two-column hero ≥1024px; single-column,
left-aligned stack at 768–1023px; single-column mobile composition with
stacked full-width CTAs <768px. **No new package, no new shadcn
component.** **Not accepted by this turn:** a final AIX color palette, a
final font, a final brand asset/logo, the full public website, remaining
homepage sections, production API wiring, live onboarding, or live
product workflows — all remain pending. See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md) §21–§21.2
and [`AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md`](AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md)
§20 for the full implementation record.
**UI Phase 1D — Public Operating Model Section: IMPLEMENTED, VISUAL QA
DEFERRED.** The third real AIX visual component
(`platform/apps/web/components/site/public-operating-model.tsx`,
`PublicOperatingModel`) adds one homepage section ("How AIX Works") below
the accepted hero — no feature grid, pricing, testimonials, partners,
footer, FAQ, or portal/dashboard content. The 6-step sequence
(Instruction/Control/Funding/Execution/Settlement/Evidence) was checked
against `docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.3.md` and
`docs/01_masters/04_Role_And_Permission_Matrix_v1.2.md` before wording was
finalized — agency/back-to-back execution, pre-funded controls, and
external counterparties only, no principal dealing/market making/
derivatives/margin/staking/lending/yield implied, and the section carries
its own explicit "Operating model / platform design" non-live-status
label. **No new package, no new shadcn component, no final color/font/
brand-asset approval.** See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md) §22
and [`AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md`](AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md)
§21 for the full implementation record, including an open measurement
flag on the desktop 6-column row's fit at exactly 1024–1100px — this flag
remains open; Phase 1E did not touch or resolve it.
**UI Phase 1E — Public Trust, Governance & Control Section: IMPLEMENTED,
VISUAL QA DEFERRED.** The fourth real AIX visual component
(`platform/apps/web/components/site/public-trust-control.tsx`,
`PublicTrustControl`) adds one homepage section ("Trust & Control") below
the operating-model section — not a certification wall, trust-badge
section, regulator-logo section, or feature-card dump. Four control
groups (Authority/Approval/Funds Control/Evidence) are checked against
`docs/01_masters/04_Role_And_Permission_Matrix_v1.2.md` and
`docs/01_masters/02_Software_Requirement_Specification_v1.2.md`
(default-deny enforcement, maker-checker/segregation-of-duties, client
money safeguarding, audit/reconciliation) and rendered as one divided
control list, not four cards. No claim of "fully regulated," "bank-grade
security," "audited security," "regulator certified," or "fully
compliant" appears; the section carries its own "Platform design /
control model" disclosure. **Full visual QA is intentionally deferred
this turn** — no screenshot review requested. **No new package, no new
shadcn component, no final color/font/brand-asset approval.** See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md) §23
and [`AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md`](AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md)
§22 for the full implementation record and the known visual-risk
register (Phase 1D's still-open six-column flag, plus two new Phase 1E
flags: mobile control-stack density, and two-column width balance at
large desktop).
**UI Phase 1F — Public Platform Capabilities Section: IMPLEMENTED,
VISUAL QA DEFERRED.** The fifth real AIX visual component
(`platform/apps/web/components/site/public-capabilities.tsx`,
`PublicCapabilities`) adds one homepage section ("Platform Capabilities")
below the trust/control section — not a feature-card dump, and not a
claim that every capability (or Exchange functionality) is currently
live. Four capability domains (Client & Compliance / Broking & Execution
/ Payments & Settlement / Controls & Reporting) are checked against
`docs/01_masters/03_Master_Module_Index_v1.2.md`,
`docs/01_masters/02_Software_Requirement_Specification_v1.2.md`, and
`docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.3.md`'s Current
Licence Status table, and rendered as a 2×2 rule-divided matrix, not
cards. The Broking & Execution domain carries a quiet, near-verbatim
Exchange-boundary sentence ("Exchange-related functionality remains
controlled and disabled until the applicable approval and go-live
conditions are satisfied") rather than a loud warning box. Retail
onboarding is deliberately not listed (MVP scope is institutional/HNWI-
professional only). **Full visual QA is intentionally deferred this
turn** — no screenshot review requested. **No new package, no new
shadcn component, no final color/font/brand-asset approval.** See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md) §24
and [`AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md`](AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md)
§23 for the full implementation record and the known visual-risk
register (Phase 1D's and 1E's still-open flags, plus three new Phase 1F
flags: mobile capability-list density, matrix quadrant height imbalance,
and the Exchange-boundary note's deliberately low visual prominence).

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
- [`AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md`](AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md)
  (`UI-03`, DRAFT / CONTROLLED IMPLEMENTATION FOUNDATION) — the actual
  `platform/apps/web/` runtime: npm-workspace integration, exact installed
  versions, shadcn/Tailwind initialization decisions (and what was
  overridden from their defaults — font, one stray accent color),
  TypeScript model, directory structure, verification performed, and
  every deferred decision. Toolchain only — no visual design accepted.
- [`references/`](references/) — reference image storage.
  [`REF-UI-001`](references/REF-UI-001_phantom-floating-pill.png) is
  registered; see [`references/README.md`](references/README.md) for the
  registration rule.

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
