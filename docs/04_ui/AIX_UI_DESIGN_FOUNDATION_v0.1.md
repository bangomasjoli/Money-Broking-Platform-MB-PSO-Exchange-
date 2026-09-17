---
document_id: UI-01
title: AIX UI Design Foundation
version: v0.1
document_status: DRAFT
implementation_status: N/A
module: N/A
control: UI design governance — direction, visual references, measurement discipline, token policy, model-use guidance
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 4c30c58
---

# AIX UI Design Foundation

**Status: DRAFT / CONTROLLED FOUNDATION.** This document records the AIX UI
design *direction* and *discipline* — not a finished visual identity, not a
finalized token set, not approved page designs. Values recorded here as
"provisional" or "initial" are deliberately incomplete and are expected to
be superseded by a later, more specific revision once visual references are
reviewed and real screens are measured. Nothing in this document authorizes
frontend implementation, package installation, or shadcn initialization —
see `03_frontend_scope` in `README.md` for what Phase 0A explicitly excludes.

This document is Git-tracked because **Git is authoritative for AIX project
state**: every meaningful approved UI decision must eventually live here (or
in a successor UI-governance document), not only in chat history. Chat
memory is supplementary only.

---

## 1. Design Philosophy

AIX should feel:

- **Premium** — nothing feels like a free template or a default.
- **Institutional** — the platform reads as a regulated financial system, not
  a startup experiment.
- **Precise** — measurement discipline is visible in the finished product
  (see §5–§6).
- **Modern** — current, not dated, without chasing every visual trend.
- **Technologically advanced** — the product is a digital-asset brokerage;
  the UI may acknowledge that domain.
- **Digital-finance native** — not a generic SaaS dashboard reskinned for
  crypto, and not a generic crypto template reskinned for finance.

The synthesis AIX is aiming for: **institutional fintech clarity**, combined
with **selective** futuristic / blockchain visual language — selective
meaning applied deliberately in specific places (see §3, Public Website vs.
Authenticated Platform), never applied uniformly across every screen.

**AIX must NOT resemble:**

- a generic AI-generated SaaS dashboard
- a generic shadcn demo (the out-of-the-box look — see §2)
- a crypto casino
- a neon Web3 template
- a gaming interface
- an overdesigned cyberpunk UI

## 2. shadcn Rule

shadcn/ui is the **component foundation** — the accessible primitive layer
(buttons, inputs, dialogs, tables, etc.) AIX builds on. It is explicitly
**not** the finished visual identity. "Default shadcn look" is never an
acceptable final state for any AIX screen.

AIX must customize, at minimum:

- typography
- spacing
- colors
- radii
- shadows
- borders
- tables
- forms
- navigation
- status presentation
- empty states
- loading states
- interaction treatment (hover/focus/active/disabled)

No installation or configuration of shadcn happens in this phase — see
`README.md`.

### 2.1 shadcn-first, controlled use (approved UI Phase 1B)

AIX uses shadcn/ui **extensively, but in a controlled, efficient, and
precise way** — not as a rarely-touched dependency, and not as a bulk
component library installed wholesale. The governing rules:

1. Prefer official shadcn primitives whenever they correctly solve the UI
   need — do not hand-roll a component shadcn already provides correctly.
2. Do not bulk-install the entire shadcn catalogue. Add a component only
   when a real, current screen/component actually requires it.
3. Search existing AIX/shadcn components before creating a new one — a
   duplicate component is a defect, not a style choice.
4. shadcn source is **owned and customized by AIX** after addition — it is
   not a vendored, hands-off dependency. Editing an added component's
   source is expected, not a workaround.
5. Default shadcn styling is never automatically accepted as final AIX
   design (restates §2 above, made explicit as a rule of this policy too).
6. Measurements, tokens, variants, spacing, and states must follow AIX
   specs (`UI-02` and successor documents) — a shadcn default that
   conflicts with a governed AIX value must be overridden, not shipped
   as-is, and the override should be recorded where it happened.
7. Preserve Radix/shadcn accessibility behavior when restyling — visual
   customization must never regress keyboard navigation, focus
   management, or ARIA semantics the primitive already provides correctly.
8. Do not create thin `AixXxx` wrappers merely to rename a shadcn
   primitive — that adds indirection without value.
9. Create an AIX/domain wrapper only where it adds real value: repeated
   AIX visual behavior, financial-domain behavior, regulated-workflow
   behavior, shared variants/states, or measurable consistency across
   multiple call sites. Name wrappers by domain/role (e.g. `PublicHeader`),
   never by implementation detail (e.g. never `AixShadcnNavbar`).
10. Prefer composition over duplication — build a new UI need by composing
    existing primitives before reaching for a new one.
11. Community registries or third-party shadcn-ecosystem components
    require a separate, explicit review before adoption — they are not
    pre-approved merely because they use the same CLI/registry format as
    the official shadcn catalogue.

Detailed rationale and precedent live here; `.claude/skills/aix-ui-design/SKILL.md`
references this policy concisely rather than restating it.

## 3. Public Website vs. Authenticated Platform

These are related but **distinct visual modes**, not one visual language
applied everywhere.

### Public AIX Website

May use:

- stronger visual storytelling
- selective gradients
- subtle 3D
- motion
- product demonstrations
- larger typography
- more atmospheric backgrounds
- futuristic visual cues

### Authenticated AIX Platform (Client / Staff / Admin portals)

More restrained. Prioritizes:

- data hierarchy
- clarity
- precision
- tables
- forms
- transaction states
- risk/status visibility
- operational efficiency
- financial-system credibility

**Do not carry excessive marketing decoration into staff/admin/compliance
screens.** A compliance officer reviewing a KYC queue or a maker-checker
approval is not the same audience, task, or emotional register as a visitor
on the marketing homepage.

## 4. Anti-"AI Look" Rules

The following patterns are explicitly rejected as symptomatic of generic
AI-generated UI, and must not appear in AIX screens without a specific,
deliberate, documented reason:

- giant rounded cards everywhere
- four arbitrary KPI cards at the top of every page
- excessive pill elements
- random purple gradient backgrounds
- glowing borders everywhere
- giant "Welcome back" hero sections in operational dashboards
- decorative charts without operational value
- excessive glassmorphism
- arbitrary gradients
- emoji in professional operational UI
- meaningless floating blobs
- identical card treatment for every information type (a KYC status, a
  balance, and a system alert are not the same kind of information and
  should not default to the same visual container)
- inconsistent spacing
- arbitrary pixel values (see §6)
- visually impressive but operationally inefficient layouts

**The authenticated platform must look designed for actual financial
operations** — built for someone doing a job, not for a portfolio
screenshot.

## 5. Measurement Discipline

The user is extremely particular about visual measurement and finishing.
**"Close enough" is not acceptable.** AIX design implementation must use
explicit, measurable rules — not eyeballed approximations.

Design QA must consider:

- exact alignment
- spacing consistency
- symmetry
- component dimensions
- baseline alignment
- optical alignment
- container widths
- row heights
- control heights
- icon dimensions
- padding
- gaps
- border thickness
- radius consistency
- line heights
- responsive spacing
- responsive component geometry

### No Random Pixels

Uncontrolled one-off values (e.g. `17px`, `23px`, `29px`, `37px`) merely
because they "look okay" are not allowed. Prefer a governed spacing system
(§6). Exceptions are permitted only when:

- optical correction is **deliberately documented** (state why the governed
  value looked wrong and what correction was applied), or
- a measured real component genuinely requires a specific value (e.g. an
  icon's intrinsic size, a third-party embed's fixed dimension).

An undocumented exception is a defect, not a style choice.

## 6. Initial Spacing Foundation (Provisional)

A **provisional** 4px-unit spacing basis, recorded now so early exploratory
work has *something* governed to reference instead of inventing values
ad hoc. **This is not the final full token set** — see §10 (Design Token
Policy). Do not treat this list as complete; it is deliberately the minimum
useful starting scale.

```
4   8   12   16   20   24   32   40   48   64
```

The full token system (including control heights, container widths, radii,
shadows, icon sizes, and their responsive variants) will be finalized after
visual-reference review, not invented wholesale in this document.

## 7. Pixel-Precision Acceptance

Every implemented screen must later be reviewed for:

- horizontal alignment
- vertical alignment
- consistent gutters
- equal component heights
- spacing-token compliance
- text baseline alignment
- icon alignment
- responsive breakpoint behavior
- overflow
- truncation
- table density
- form-field consistency
- empty / loading / error states

**Screenshot-based visual QA is required before page acceptance.** A screen
is not "done" because it compiles and renders — it is done when it has been
visually reviewed against these criteria.

## 8. Visual QA Language

Findings must be **measurable**, not vague. Future reviews should read like:

- "header is 4px too low"
- "left gutter differs by 8px"
- "button height does not match the 40px control token"
- "icon is not vertically centered"
- "table row spacing differs between equivalent states"

**Not** like:

- "looks slightly off"
- "make cleaner"
- "make nicer"

A finding that cannot be expressed as a measurable deviation is not
actionable and should be restated before it is recorded.

## 9. Responsive Design

Mobile must be **intentionally designed** — not derived by assumption.
**"Desktop stacked vertically" is not an acceptable definition of responsive
design.**

Every major component must eventually specify distinct, deliberate
behavior for:

- desktop
- tablet
- mobile

This applies to layout, spacing, navigation pattern, and information
density — not merely reflow.

## 10. Design Token Policy

The eventual AIX design system will govern:

- color
- typography
- spacing
- control heights
- container widths
- radii
- borders
- shadows
- icons
- motion
- z-index
- breakpoints
- table density

**Values are not finalized in this document** unless they already exist in
the repository (they do not — see `README.md` §"Existing Frontend
Inventory"). This document establishes the *governance requirement* — that
such a system will exist, will be Git-tracked, and will be referenced rather
than reinvented per-screen — not the values themselves.

## 11. Floating Pill Navigation (Approved Concept, Public Website)

Recorded as a currently **approved concept** for the public website only —
see the Reference Register (§13) for its precise scope. **Concept only; no
dimensions are approved yet.**

**Concept:** a detached / floating rounded navigation container positioned
near the top of the page, visually separated from the page background.

**Dimensions to be defined numerically in a later, dedicated turn** (the
user wants to review measurements before implementation) — recorded here
only as the list of decisions still required, not as placeholder numbers:

- top offset
- height
- max width
- horizontal padding
- item gap
- corner radius
- border / shadow treatment
- background opacity
- scroll behavior
- sticky behavior
- responsive collapse behavior
- CTA relationship

## 12. Backend Reality Rule

**The UI must reflect actual AIX backend state.** UI design and
implementation must not invent:

- API endpoints
- permissions
- workflow states
- regulatory capabilities
- wallet accounting behavior
- trade states
- exchange features
- settlement behavior

that do not exist or are not approved in the platform (`platform/services/`,
`docs/02_modules/`, `docs/OPEN_FINDINGS.md`, `docs/DECISION_LOG.md`).

Future/proposed screens may be designed **only** when explicitly marked:

> **PROPOSED / NOT YET BACKED BY IMPLEMENTATION**

An unmarked proposed screen is a governance defect — it misrepresents
platform capability.

## 13. Regulatory UI Boundary

Current product constraints (see `01_masters/00_Licence_Scope_And_Feature_Lock_v1.3.md`)
must be preserved in every UI surface. The UI must not visually imply
availability of:

- derivatives
- margin
- futures
- principal dealing
- market making
- MYR pairs
- privacy coins
- algorithmic stablecoins
- staking
- lending
- yield

Exchange functionality (order book / matching / market making) remains
gated until regulatory approval / controlled enablement, per the platform's
Money Broking + PSO licence lock. No UI surface may present these as
present or imminent without a separate, explicit governance decision.

## 14. Reference Register

References are **inspiration categories**, not approved exact visual
specifications, unless a row explicitly states otherwise.

| Ref ID | Source | Status | Scope |
|---|---|---|---|
| REF-UI-001 | Phantom.com | **APPROVED CONCEPT REFERENCE** | **Floating pill navigation treatment only** — see §11. Explicitly NOT: Phantom's logo, branding, exact colors, exact typography, or exact proportions. The preference is the floating/detached navigation *concept* (large rounded capsule container, clean internal spacing, soft separation from page background, premium minimal appearance, clear hierarchy), adapted for AIX rather than cloned. |
| REF-UI-002 | Fireblocks | REFERENCE / UNDER REVIEW | Institutional blockchain storytelling (conceptual tone only). |
| REF-UI-003 | Anchorage Digital | REFERENCE / UNDER REVIEW | Regulated / trustworthy digital-asset tone (conceptual tone only). |
| REF-UI-004 | Copper | REFERENCE / UNDER REVIEW | Premium institutional minimalism (conceptual tone only). |
| REF-UI-005 | Revolut Business | REFERENCE / UNDER REVIEW | Product usability and demonstration patterns (conceptual tone only). |
| REF-UI-006 | Kraken Pro (`https://pro.kraken.com/`) | **APPROVED CONCEPT REFERENCE — AUTHENTICATED PLATFORM SCOPE ONLY** (UI Phase 2C) | Dense authenticated-workspace composition/interaction principles only — see `AIX_AUTHENTICATED_PLATFORM_UI_ARCHITECTURE_v0.1.md` (`UI-04`) §35 for the full per-principle assessment. Explicitly NOT the public marketing homepage, NOT a regulatory/product-scope reference, NOT layout/color/iconography/typography/component styling to copy, NOT a statement about AIX's own available asset classes or feature availability. No screenshot captured — `pro.kraken.com` is a login-gated authenticated product and no browser/screenshot tool is available; registered from Kraken Pro's well-documented general characteristics only, same "conceptual tone only" posture as `REF-UI-002`–`REF-UI-005`. |

**ID note:** UI Phase 2C's own brief requested registering Kraken Pro as
`REF-UI-002` — verified against this table before registering and found
`REF-UI-002` already permanently assigned to Fireblocks since UI Phase 0B.
Not overwritten; Kraken Pro registered instead at the actual next-free ID,
`REF-UI-006`. See `UI-04` §35.1 for the full reconciliation record.

`REFERENCE / UNDER REVIEW` means: recorded as a conceptual inspiration
category the user has previously discussed — **not** an approved visual
specification, not a component-copy target, and not to be presented as
finished design guidance until a dedicated review promotes it.

## 15. Portal Categories (Recorded, Not Designed)

High-level UI surfaces the platform is expected to eventually have — named
here for shared vocabulary only. **No page designs exist yet; no workflow
beyond what the backend actually supports is implied.**

- **Public Website**
- **Client Portal**
- **Staff / Operations Portal**
- **Admin / Compliance Portal**

## 16. Claude Model Guidance for UI Work

- **Sonnet** — normal frontend implementation, component work, responsive
  work, tests, refactoring. The default for UI implementation.
- **Fable** — UX copy, help text, labels, error wording, microcopy.
- **Opus** — reserved for UI work that intersects *materially* with:
  security-sensitive workflow architecture, fund movement, maker-checker,
  ledger presentation, compliance decision flows, or permission
  architecture. **Do not use Opus for ordinary spacing/component
  implementation** — that is Sonnet's job and using Opus for it wastes the
  escalation on work that doesn't need it.

## 17. UI Implementation Discipline

Future UI implementation follows **one coherent UI scope per session** —
for example: navigation shell, dashboard shell, wallet destination page,
withdrawal page, client table. **Do not build the entire platform frontend
in one session.** This mirrors the backend's own per-turn implementation
discipline (see `docs/00_project_state/PROJECT_HANDOVER.md`).

## 18. What This Phase Explicitly Did Not Do

Recorded for clarity, not as a limitation to work around — these are
deliberate exclusions of this turn, not gaps:

- No frontend application, page, or component was created.
- No shadcn installation or `shadcn init` was run.
- No package was installed; no lockfile changed.
- No final design token values were fixed (§6/§10 are provisional/
  governance-only).
- No floating-pill-navigation dimensions were chosen (§11).
- No backend, API, database, migration, grant, or edge/perimeter artifact
  was touched.
