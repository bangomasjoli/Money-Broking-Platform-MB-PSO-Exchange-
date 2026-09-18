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
**UI Phase 1G — Public Product Experience / Platform Preview: IMPLEMENTED,
VISUAL QA DEFERRED.** The sixth real AIX visual component
(`platform/apps/web/components/site/public-product-preview.tsx`,
`PublicProductPreview`) adds one homepage section below the capabilities
section — a **public demo of the authenticated client portal's
wallet-destination workflow**, not the authenticated portal itself and
not a claim that any of it is connected to live production services.
Adds shadcn `table` and `badge` (pinned CLI 4.21.0; both pure Tailwind/
semantic-HTML with zero new npm dependencies, verified via lockfile diff
before use, so no backend regression was required). Three demo
destinations and statuses (Active / Pending Approval / Evidence
Required) map to real governed states from
`docs/01_masters/04_Role_And_Permission_Matrix_v1.2.md` and
`docs/01_masters/05_Master_Workflow_Map_v1.2.md` (payout-destination
maker-checker approval, cooling-off, wallet address ownership evidence)
— no fake portfolio metrics, prices, PnL, or balances appear anywhere.
**Full visual QA is intentionally deferred this turn** — no screenshot
review requested. **No final color/font/brand-asset approval.** See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md) §25
and [`AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md`](AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md)
§24 for the full implementation record and the known visual-risk
register (Phase 1D's, 1E's, and 1F's still-open flags, plus four new
Phase 1G flags: destination-table fit at 1024px/mobile,
sidebar/content proportion, demo-disclosure prominence, and
status-badge color-neutral hierarchy).
**UI Phase 1H — Public Final CTA / Request Access Section: IMPLEMENTED,
VISUAL QA DEFERRED.** The seventh real AIX visual component
(`platform/apps/web/components/site/public-final-cta.tsx`,
`PublicFinalCta`) is the **closing content block** of the current
homepage, below the product-experience preview — institutional/HNWI/
professional audience only, no retail-oriented copy, and a
regulatory-boundary note ("Access and available functionality are
subject to eligibility, onboarding, applicable approvals, and controlled
platform enablement") calibrated to avoid implying that already-approved
Money Broking/PSO scope is itself unapproved. Primary CTA "Request
Access" (the same label `PublicHeader`'s own CTA already uses) and
secondary "Speak With Our Team," both fully inert — no form, no
auth/API work. Two-column at `lg:` (heading/copy left, actions/note
right) deliberately echoes `PublicHero`'s own asymmetry as a visual
"bookend" to the homepage. No new shadcn component (`Button` reused
only). **Full visual QA is intentionally deferred this turn** — no
screenshot review requested. **No final color/font/brand-asset
approval.** See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md) §26
and [`AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md`](AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md)
§25 for the full implementation record and the known visual-risk
register (Phase 1D's, 1E's, 1F's, and 1G's still-open flags, plus four
new Phase 1H flags: closing-section surface prominence vs. the hero,
actions-column alignment at tablet width, regulatory-note visibility,
and cumulative vertical whitespace against `PublicProductPreview`).
**UI Phase 1I — Public Footer: IMPLEMENTED, VISUAL QA DEFERRED.** The
eighth and **final structural component** of the current public
homepage (`platform/apps/web/components/site/public-footer.tsx`,
`PublicFooter`), after the closing CTA section. Brand block (temporary
"AIX" wordmark + descriptor), two real navigation groups (Platform: How
AIX Works/Trust & Governance/Capabilities/Product Experience; Company:
Contact — mapped to the real `#request-access` section), and a legal
row (copyright + boundary note) — no fake routes, no 5-column sitemap,
no social links, no invented contact details. Five prior sections each
received one minimal `id` attribute (no visual change) so the footer's
links resolve to real same-page anchors. **A real governance finding:**
no registered legal entity name exists anywhere in the governed project
docs, so the copyright line reads "© 2026 AIX. All rights reserved."
with no invented corporate suffix, deliberately deviating from this
turn's own suggested example wording. **No new package, no new shadcn
component, no final color/font/brand-asset approval.**

**PUBLIC HOMEPAGE STRUCTURE: IMPLEMENTATION COMPLETE / CONSOLIDATED
VISUAL QA PENDING.** Every planned structural component now exists. This
is **not** a visual-acceptance claim for the homepage as a whole — Phases
1D through 1I each remain individually `VISUAL QA DEFERRED`, with every
recorded risk flag across all six still open; the next activity is a
consolidated visual QA pass, not a further structural addition. See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md) §27
and [`AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md`](AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md)
§26 for the full implementation record and the known visual-risk
register (Phase 1D's through 1H's still-open flags, plus five new Phase
1I flags: footer navigation density on mobile, footer surface-boundary
contrast, CTA-to-footer cumulative spacing, legal/boundary-text
prominence, and desktop column balance).

**UI Phase 1J — Consolidated Public Homepage Visual QA: COMPLETE —
REMEDIATION REQUIRED.** A review-only pass (no code/markup/CSS changed)
across the whole homepage at the full 7-viewport matrix, via
source/rendered-HTML/compiled-CSS analysis (no screenshot tool
available; none installed solely for this turn). Produced a
consolidated, numbered defect register (`UI-QA-001`–`UI-QA-007`) in
`AIX_UI_MEASUREMENT_SPEC_v0.1.md` §28, including: **1 BLOCKER**
(`UI-QA-002` — the product-preview destination table overflows its
column at 1024px/mobile with a precisely measured ~128px shortfall, and
its overflow container has no keyboard-focus mechanism, making that
content genuinely unreachable for keyboard-only users); **1 HIGH**
(`UI-QA-001` — every same-page anchor added in Phase 1I scrolls its
target behind the fixed header, with no `scroll-margin-top`
compensation anywhere in the codebase — confirmed occluded by ~8px at
mobile widths specifically, uncomfortably tight everywhere else); **1
MEDIUM new finding plus 2 refinements** of existing Phase 1D/1E flags
with corrected arithmetic; and **all 19 previously-recorded Phase
1D–1I visual-risk flags retained exactly, verified still open, none
discarded**. See §28 for the full register, severity rationale, exact
measured evidence for every finding, and the recommended remediation
grouping (6 groups, by root cause/component, none bundled merely to
reduce turn count). **The homepage is not visually accepted.**

**UI Phase 1K — Remediation B (Product Preview Responsive / Table
Accessibility): COMPLETE — `UI-QA-002` (the sole BLOCKER) CLOSED.**
`PublicProductPreview`'s sidebar breakpoint moved from `lg:` (1024px)
to `xl:` (1280px), so the sidebar no longer competes with the table at
the exact width the defect named — proven with a positive margin
(+72px at 1024px itself). The shared `Table` primitive
(`components/ui/table.tsx`) gained `tabIndex={0}`/`role="region"`/a
visible focus ring so its scroll region — now precisely bounded to
viewports below ≈584px, where the table's own content genuinely cannot
fit regardless of layout — is keyboard-reachable. No demo data, status
treatment, section spacing, or other section was changed. See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md)
§28.9 for the full closure record and width arithmetic. The remaining
18 flags in the §28 register (1 HIGH, the rest MEDIUM/LOW/
INFORMATIONAL) are unaffected — **the homepage remains not visually
accepted.**

**UI Phase 1L — Remediation A (Anchor Scroll Offset / Fixed Header
Occlusion): COMPLETE — `UI-QA-001` (the sole remaining HIGH) CLOSED.**
A pure-CSS fix — Tailwind's own `scroll-mt-24`(96px)/`lg:scroll-mt-28`
(112px) utilities, applied identically to all 5 anchored sections — adds
the accepted header's own occupied envelope (72px compact/88px desktop)
plus a deliberate 24px breathing margin, verified not to double-count
against each section's existing top padding. Every tested viewport now
clears the header by an identical, positive 24px (up from ~8px, and
negative at mobile, before this fix). No JavaScript, no header change,
no section-layout change. See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md)
§28.10 for the full closure record and the 7-viewport clearance table.
The remaining 17 flags in the §28 register (all MEDIUM/LOW/
INFORMATIONAL) are unaffected — **the homepage remains not visually
accepted.**

**UI Phase 1M — Remediation C (Operating Model Responsive Density):
COMPLETE — `UI-QA-004` CLOSED (and Phase 1D's own underlying flag with
it).** `PublicOperatingModel`'s 6-column horizontal process row moved
from `lg:` (1024px) to `xl:` (1280px) — verified by arithmetic before
implementing: step width increases from ≈134.67px at the old 1024px
threshold to ≈177.33px at 1280px/1440px (+31.7%, since the container
caps at its own 1280px max-width), dropping the longest step
description's estimated wrap from ~5 lines to ~4. The 3×2 tablet grid's
own values are unchanged, only its active range widened to match
(768-1279px); mobile, desktop-rail geometry, markers, icons, step
copy, and numbering are all byte-identical to before. See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md)
§28.11 for the full arithmetic. The remaining 16 flags in the §28
register (all MEDIUM/LOW/INFORMATIONAL) are unaffected — **the
homepage remains not visually accepted.**

**UI Phase 1N — Remediation D (Global Rhythm / Repetition / Homepage
Monotony): COMPLETE — `UI-QA-003` CLOSED.** A controlled-variation
refinement across `PublicTrustControl`, `PublicCapabilities`,
`PublicProductPreview`, and `PublicFinalCta` — `PublicOperatingModel`,
`PublicHeader`, `PublicHero`, and `PublicFooter` intentionally
unchanged. The 4-consecutive-identical section-boundary rhythm became a
deliberate ascending pattern (a 2-run repeat at most); eyebrow treatment
reduced to exactly 2 documented variants plus one deliberate removal;
circular icon markers reduced from 3-of-4 to 1-of-4 icon-bearing
sections (`PublicOperatingModel`'s process-rail markers explicitly
preserved); one additional full-bleed surface tint added to
`PublicTrustControl` (reasoned choice over `PublicProductPreview`, whose
shell already has its own contained tint). No randomness, no new
tokens, no new component pattern. See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md)
§28.12 for the full before/after arithmetic across every dimension. The
Phase 1H cumulative-whitespace/closing-section-prominence flags are
incidentally affected but not independently re-validated or closed. The
remaining 15 flags in the §28 register (all MEDIUM/LOW/INFORMATIONAL)
are unaffected — **the homepage remains not visually accepted.**

**UI Phase 1O — Low-Severity Polish / QA Closure: COMPLETE —
`UI-QA-005` CLOSED, remaining Phase 1E–1I flags adjudicated.**
`UI-QA-005` (Trust & Control large-desktop balance) closed with **no
code change** — re-verification found the left/right columns' actual
used width (480px vs. 476px at 1280px/1440px) to be a conclusive
near-exact match. All 17 retained Phase 1E–1I polish flags were
individually re-verified against the current code: 6 CLOSED (2 by a
small, evidence-backed code change — a quiet top divider on
Capabilities' Exchange-boundary note, and a dead `lg:justify-between`
removed from the footer so its own existing `lg:gap-16` takes effect —
4 by re-verification finding no actual defect), 3 CLOSED BY LATER
CHANGE (resolved as a side effect of Phase 1N's rhythm remediation), 8
remain OPEN / ACCEPTED RISK with recorded reasoning for each (real,
calculated characteristics judged acceptable, not defects). **Count
corrected in UI Phase 1R** — the figures originally recorded here
summed to 16, but the §28.13 table actually contains 17 rows; the
count above is re-verified row-by-row against that table. No
regulatory or product-boundary wording was changed anywhere — every
note's exact meaning is preserved, verified byte-identical against the
rendered HTML. See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md)
§28.13 for the full per-flag adjudication table and code-change
arithmetic. **PUBLIC HOMEPAGE: READY FOR FINAL VISUAL REVIEW** — every
BLOCKER, HIGH, and MEDIUM finding from the Phase 1J register is now
CLOSED; this is not a self-declared visual acceptance — no screenshot
review was performed this turn.

**UI Phase 1P — Final Visual Remediation 01 (Footer Desktop Horizontal
Balance): COMPLETE — `UI-QA-009` CLOSED, pending user recheck.** The
user's own rendered final visual review found a real defect the prior
analytical-only QA passes did not catch: Phase 1O's footer fix (removing
a dead `lg:justify-between`) restored a functional gap but left the
footer's desktop content reading as left-heavy — brand and navigation
clustered together, with the container's remaining width (≈613px)
trailing uselessly after them instead of separating two deliberate
zones. Fixed with a genuine two-zone `grid-cols-[1fr_auto]` layout at
`lg:` — the brand column absorbs the flexible remaining width, anchoring
the navigation column at the container's right portion (≈0px trailing
clearance, down from ≈613px). Brand content, all 5 real navigation
links, the legal copyright/boundary text, and both existing dividers are
unchanged — verified byte-identical. Tablet/mobile behavior untouched.
See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md)
§28.14 for the full before/after geometry. **PUBLIC HOMEPAGE: FINAL
VISUAL REVIEW STILL IN PROGRESS** — not re-declared "ready," pending the
user's recheck of this specific fix.

**UI Phase 1Q — Final Visual Remediation 02 (Fixed Header Scroll-Content
Isolation): COMPLETE — `UI-QA-008` CLOSED PENDING VISUAL RECHECK.** The
accepted `PublicHeader`'s center pill has its own protected surface, but
the wordmark and actions flanking it (deliberately placed outside the
pill since Phase 1B) had none — scrolling content could visually pass
behind them. Fixed with a new `HeaderMask` inside `public-header.tsx`: a
short gradient using the existing `--marketing-background` token plus
the pill's own existing `backdrop-blur-sm` strength, height reusing
Phase 1L's already-governed `scroll-mt-24`/`lg:scroll-mt-28` figures
(96px compact / 112px desktop). **No new z-index anywhere** — the mask
paints behind the header's interactive content purely by DOM order
within the header's existing `z-40` context. `pointer-events-none` +
`aria-hidden`; no interactive attributes. Every accepted header
dimension (offsets, heights, pill geometry, radius, breakpoint) is
unchanged — verified byte-identical. No JavaScript, no scroll listener,
pure CSS. See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md)
§28.15 for the full mask architecture and stacking-order reasoning.
**PUBLIC HOMEPAGE: FINAL VISUAL REVIEW STILL IN PROGRESS.**

**UPDATE — Phase 1Q's fix above did NOT pass the user's own rendered
recheck.** Observed: the AIX wordmark and both action buttons came out
visibly blurred, while the center pill did not — the mask was affecting
the header's own interactive content, not only isolating it from
scrolling page content. `UI-QA-008` reopened OPEN / REMEDIATION
REQUIRED.

**UI Phase 1Q Remediation 01 — Header Mask Stacking Correction:
COMPLETE — `UI-QA-008` CLOSED PENDING VISUAL RECHECK (second attempt).**
Verified root cause (CSS stacking-context spec, not guessed): within one
stacking context, non-positioned in-flow elements paint in an earlier
tier than positioned elements with `z-index: auto`/`0`, regardless of
DOM order — `HeaderMask` (`position: fixed`) landed in the later "on
top" tier, while `DesktopNav`'s/`MobileNav`'s own wrapper `<div>`s had
no `position` at all, landing in the earlier "underneath" tier — the
exact inverse of the DOM-order assumption the first fix relied on. Fixed
with an explicit local stacking model: `isolate` on `<header>`, explicit
`z-0` on `HeaderMask`, explicit `relative z-10` on `DesktopNav`'s and
`MobileNav`'s own wrappers (`relative` with no offset does not move
either element) — paint order is now decided by unambiguous numeric
comparison, not the tier rule that caused the defect. No mask geometry,
blur, gradient, or accepted header dimension was retuned — the defect
was entirely stacking. No `z-50` or arbitrary escalation. No other
homepage component changed. See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md)
§28.16 for the full root-cause analysis and stacking-model reasoning.
**PUBLIC HOMEPAGE: FINAL VISUAL REVIEW STILL IN PROGRESS.**

**UI Phase 1R — Final Public Homepage Visual Acceptance Closure: COMPLETE
(docs only, no frontend code changed).** `PUBLIC HOMEPAGE: VISUALLY
ACCEPTED / GOVERNED / CLOSED.` The user's own rendered final visual
review confirmed `UI-QA-008` (header mask, second attempt) and
`UI-QA-009` (footer desktop balance) both hold in practice — both now
**VISUALLY CONFIRMED CLOSED**, closing the loop computed evidence alone
could not close. Every BLOCKER/HIGH/MEDIUM/LOW formal finding
(`UI-QA-001`–`005`) is CLOSED; `UI-QA-006`/`007` remain INFORMATIONAL /
ACCEPTED POSITIVE. The accepted-risk count is reconciled against the
actual current `UI-02` §28.13 register: **8 OPEN / ACCEPTED RISKS** (not
6 — the prior summary's arithmetic was wrong; see the correction above
and `UI-02` §28.13/§28.17). **Accepted implementation baseline: `42aa380`**
— every component listed above (`PublicHeader` through `PublicFooter`)
plus every remediation through Phase 1Q Remediation 01. No further
public-homepage structural section is required before closure. **Not
accepted by this closure:** final AIX font, final AIX palette, final AIX
brand asset/logo (all **PENDING DESIGN APPROVAL**), the authenticated
Client Portal, Staff/Ops portal, Admin/Compliance portal, live API
integration, Exchange functionality, full platform-module completeness,
production readiness, or internet exposure — all remain separate,
separately-governed matters. Backend/program state (module status, Turn
M-B, `FND-FIND-001`, M1–M8, production exposure) is unchanged by this
UI-governance closure. See
[`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md)
§28.17 for the full final acceptance record. **The next UI phase is
Authenticated Platform Design — not implemented in this turn.**

**PUBLIC HOMEPAGE: VISUALLY ACCEPTED / GOVERNED / CLOSED** (unchanged by
everything below — restated for clarity, not reopened).

**AUTHENTICATED PLATFORM: UI PHASE 2A — DESIGN ARCHITECTURE.** A new
controlled document, [`AIX_AUTHENTICATED_PLATFORM_UI_ARCHITECTURE_v0.1.md`](AIX_AUTHENTICATED_PLATFORM_UI_ARCHITECTURE_v0.1.md)
(`UI-04`, DRAFT / CONTROLLED ARCHITECTURE), establishes — **design
governance and information architecture only, no implementation** — the
three authenticated surfaces (Client Portal, Staff/Operations Portal,
Admin/Compliance Portal), their route/shell/navigation/density models, and
an A/B/C page-classification register checked directly against actual
backend route evidence rather than assumption: **only two backend services
expose any browser-callable route today** — `iam` (`/auth/*`, login/session/
MFA only) and `wlt1`'s independently-accepted 6-route public client
contract (wallet/payout destination registration and proof-of-control).
Every other service (`aml1`, `cfg1`, `clt1`, `iam2`, `kyc1`, `sec1`) is
internal-only. Consequently the Client Portal has exactly one `A`-classified
page (Wallet & Payout Destinations); **no page in the Staff/Operations or
Admin/Compliance Portal is classified `A`** — every capability there is real
and governed but reachable only via internal service-to-service calls
today. Full classification tables, shadcn adoption map (no bulk install),
AIX-wrapper classifications (none created), and implementation sequence are
in `UI-04`. **No authenticated page, route, sidebar, dashboard, or shadcn
component was implemented this turn** — `platform/apps/web/**` is
unchanged. Final AIX font, palette, and brand asset remain **PENDING DESIGN
APPROVAL**.

**AUTHENTICATED PLATFORM: UI PHASE 2B — SHELL IMPLEMENTED / NO PRODUCT
PAGE.** The authenticated shell architecture from `UI-04` §13 is now real
code: `AuthenticatedShell`/`AuthenticatedSidebar`/`AuthenticatedTopbar`/
`AuthenticatedMobileNav` (`platform/apps/web/components/shell/`) power
three distinct route groups — `/app` (Client Portal), `/ops` (Staff/
Operations Portal), `/admin` (Admin/Compliance Portal) — each with its own
layout and its own approved nav data (`UI-04` §6/§8/§9), not one shared
navigation tree. Desktop persistent sidebar (240px) from `1280px` and up;
`Sheet`-drawer navigation below that. Only each surface's own root
placeholder page exists (`Overview`/`Operational Overview`/`Compliance
Overview`) — every other approved nav item renders as a clearly inert,
non-interactive row (not a live link, not hidden) since its page is not
built yet; no `C`-classified item appears in any primary nav. No
authentication, session, API call, or authorization logic exists — every
route is reachable without login, as explicitly authorized for this
shell-only turn. `typecheck:web`/`lint:web`/`build:web` all pass; all 6
routes statically prerender. Full geometry, route structure, and a real
Server/Client prop-serialization defect found and fixed while building it:
`UI-04` §34, `UI-02`'s new "UI Phase 2B — Authenticated Shell Geometry"
section, `UI-03` §37. **No screenshot tool was available — verification
was source/rendered-HTML/compiled-CSS only, not a visual-acceptance
claim.** Public homepage unaffected.

**AUTHENTICATED PLATFORM — updated status:**
- **Phase 2A:** architecture established.
- **Phase 2B:** shell structurally implemented.
- **Phase 2C:** visual direction governed. Kraken Pro registered as
  `REF-UI-006` (authenticated-platform scope only — the brief's requested
  `REF-UI-002` was already permanently assigned to Fireblocks; verified
  against the actual register before registering, not overwritten). 14
  reference principles assessed (all APPROVED or APPROVED WITH AIX
  ADAPTATION — none required outright rejection); a separate, harder
  regulatory/product-scope exclusion list (margin, derivatives, staking,
  live order book, literal Kraken-copying, "trading-app entertainment,"
  etc.) was recorded independently of the principle assessment. Visual
  direction defined: dual/theme-capable token architecture recommended
  with **light as the default theme** (the codebase already ships a
  complete, unused `.dark` token set — no new capability needed, no
  toggle built this turn); a 5-tier surface hierarchy and a border/radius/
  shadow hierarchy, both mapped entirely onto already-existing tokens (no
  new CSS variable introduced); sidebar/top-bar/client-context/page-header
  visual treatment; a density-tier-to-page mapping; table visual
  direction; a List+Detail pattern adjudication (approved, not built);
  a 5-type purpose-classified panel system; provisional direction for the
  future Client Overview, Wallet & Payout Destinations, and MB Spot
  Broking Terminal pages (none implemented); Staff/Ops and Admin/
  Compliance adaptation. Full record: `UI-04` §35, `UI-02`'s new "UI
  Phase 2C" section, `UI-03` §38.
- **Phase 2D:** shell restyled per Phase 2C direction — **NOT visually
  accepted.** `SURFACE-1` tokens (`--sidebar`/`--sidebar-foreground`/
  `--sidebar-border`) applied to the sidebar and top bar; client-context
  treatment refined from a bordered box to a plain inline text pairing,
  shown at `xl:` in the top bar and carried into the mobile Sheet header
  below that; inert nav rows gained `aria-disabled="true"`; a new shared
  `PageHeader` component applies the governed 4px/8px/24px spacing to all
  three placeholder pages; the mobile Sheet header now mirrors the
  sidebar's own brand treatment instead of a bare title. Structural
  geometry (240px sidebar, 40px rows, 20px icons, 56px top bar)
  unchanged. `typecheck:web`/`lint:web`/`build:web` all pass; verified via
  rendered-HTML and compiled-CSS inspection (`UI-04` §36.9). **No
  browser/screenshot tool is available in this environment — checked
  directly this turn, none found.** Per this turn's own explicit
  instruction not to substitute source/CSS inspection for rendered
  acceptance, **`AUTHENTICATED SHELL: VISUALLY ACCEPTED` is not recorded**
  anywhere in this document or `UI-04`/`UI-02`/`UI-03`. Full record:
  `UI-04` §36, `UI-02`'s new "UI Phase 2D" section, `UI-03` §39.
- **Phase 2D status, reclassified (UI Phase 2E program decision):**
  **IMPLEMENTED / VISUAL QA DEFERRED.** The user has explicitly chosen to
  complete the authenticated UI build-out first, then run one
  consolidated full visual QA pass across every page, rather than
  blocking each individual build turn on rendered screenshot review that
  no tooling in this environment can perform. This does not change any
  fact Phase 2D itself recorded (§ above) — the shell is still styled and
  technically verified but has not been reviewed in an actual browser by
  anyone — only the *ongoing status label* changes, from "blocked" to
  "deferred by deliberate program decision." Screenshot QA is no longer
  treated as a per-page blocker in this or subsequent UI build turns.
- **Phase 2E:** the first real authenticated client product page —
  **Wallet & Payout Destinations** (`/app/wallet-destinations`) —
  **IMPLEMENTED / VISUAL QA DEFERRED.** The governed Client-nav item
  (previously inert since `UI Phase 2B`) is now a real link. A List +
  Detail workspace (`UI-04` §35.16's pattern, applied for the first time):
  a `COMPACT`-density destination table (masked address/account, type,
  network/country, status, registered date — columns derived from the
  actual governed WLT-01 public contract, verified against backend
  source this turn, not assumed) beside a detail panel at `≥1024px`,
  collapsing to a `Sheet` below that. Every field shown traces to the
  real `GET /wlt1/destinations` response shape; every Add Destination
  form field traces to the real `POST /wlt1/wallet-destinations`/
  `POST /wlt1/payout-destinations` request schemas — none invented. No
  first-use, limits/velocity/concentration, maker-checker internals,
  Proof-of-Control status, or balance/ledger data is shown, because none
  of those exists in the public contract (verified, not assumed) — the
  status column/badge is the one governed approval signal that does
  exist, mapped to plain-language labels, never color-only. Demo data
  only, explicitly disclosed ("Interface preview — demo data"); no
  `fetch`/API/auth logic anywhere. `Dialog`/`Input`/`Label`/`Select`
  added via shadcn (zero package/lockfile impact). `typecheck:web`/
  `lint:web`/`build:web` all pass; verified via rendered-HTML and
  compiled-CSS inspection plus explicit structural-viewport reasoning at
  1440/1280/1024/768/430 (`UI-04` §37.10) — **not** rendered/screenshot
  review, which remains part of the deferred consolidated pass. Full
  record: `UI-04` §37, `UI-02`'s new "UI Phase 2E" section, `UI-03` §40.
- **First real page: IMPLEMENTED.** Wallet & Payout Destinations is the
  first real authenticated client product page — no other product page
  (Overview, Profile, KYC, any Ops/Admin page) exists yet. No API/auth
  integration exists on it.

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
- [`AIX_AUTHENTICATED_PLATFORM_UI_ARCHITECTURE_v0.1.md`](AIX_AUTHENTICATED_PLATFORM_UI_ARCHITECTURE_v0.1.md)
  (`UI-04`, DRAFT / CONTROLLED ARCHITECTURE) — authenticated-platform
  information architecture: Client/Staff-Operations/Admin-Compliance
  portal boundaries, route/shell/sidebar/top-bar models, page-header/
  density/table/form/status/maker-checker/audit principles, responsive
  shell model, public-vs-authenticated token model, shadcn adoption map,
  AIX-wrapper classifications, and an A/B/C page-classification register
  checked directly against actual backend route evidence. Architecture/
  governance only — no authenticated page, route, or component exists yet.

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
