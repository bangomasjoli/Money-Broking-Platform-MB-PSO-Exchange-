---
document_id: UI-02
title: AIX UI Measurement Specification
version: v0.1
document_status: DRAFT
implementation_status: N/A
module: N/A
control: UI design governance — dimensional/measurement specification (spacing, typography, radii, control heights, floating navigation geometry, visual QA tolerances)
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: c5981ac
---

# AIX UI Measurement Specification

**Status: DRAFT / MEASUREMENT SPECIFICATION.** This document turns the
approved direction in [`AIX_UI_DESIGN_FOUNDATION_v0.1.md`](AIX_UI_DESIGN_FOUNDATION_v0.1.md)
(`UI-01`) into explicit, measurable values. It is **specification, not
implementation** — nothing here installs a package, writes a Tailwind
config, or builds a component. Every value marked **PROVISIONAL** or
**DESIGN REVIEW REQUIRED** is exactly that: a starting point for the next
implementation turn to build against and for screenshot-based visual QA to
validate, not a value the user has already signed off on pixel-for-pixel.

This document does not restate `UI-01`'s philosophy, anti-patterns, or
governance rules — it assumes them. Read `UI-01` first.

---

## 1. Reference Image Status

`REF-UI-001` (Phantom.com, floating pill navigation container only —
[`UI-01`](AIX_UI_DESIGN_FOUNDATION_v0.1.md) §14) is the primary reference
this specification's §10 draws from.

**REFERENCE IMAGE FILE:**
[`references/REF-UI-001_phantom-floating-pill.png`](references/REF-UI-001_phantom-floating-pill.png)
— supplied and registered (see [`references/README.md`](references/README.md)).
Registration does not change `REF-UI-001`'s approved scope (floating pill
navigation treatment only; see `UI-01` §14) and does not itself constitute
a re-approval of any dimension below. **§10's dimensions have NOT yet been
re-validated pixel-for-pixel against this image** — they were written
conceptually, from the scope and characteristics already recorded in
`UI-01` §11/§14, before the image existed. That re-validation is a
separate, later task; any correction it produces must be recorded as an
explicit revision to this document, not applied silently.

## 2. Measurement Philosophy

Restated as the operating rule for everything below: **no value in this
document is "close enough."** Every reusable UI element that eventually
ships must have explicit values for height, width/max-width, padding, gap,
radius, border, shadow, icon size, font size, line height, alignment, and
breakpoint behavior. Where this document cannot yet state a final value
(because it depends on a reference image not yet supplied, or on a design
review not yet held), it says so explicitly with **PROVISIONAL** or
**DESIGN REVIEW REQUIRED** — it does not silently present a guess as final.

## 3. Base Unit and Spacing Tokens

**Base unit: 4px.** Every spacing value in the system is a multiple of it.

**PROVISIONAL spacing token table** (specification only — no token file,
no CSS variable, no Tailwind config is created by this document):

| Token | Value |
|---|---|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-5` | 20px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-10` | 40px |
| `space-12` | 48px |
| `space-16` | 64px |

Intermediate/off-grid values are not prohibited forever — an optical
correction may exist — but it must be **intentional, documented, and
rare**. An undocumented off-grid value found during visual QA is a defect,
not a style choice (`UI-01` §5).

## 4. Control Height System

A **restrained** family — not ten sizes. Three roles, each serving a
distinct density need:

| Role | Height | **PROVISIONAL / DESIGN REVIEW REQUIRED** |
|---|---|---|
| Compact | 32px | Dense contexts — table-row inline actions, compact filter bars. |
| Default | 40px | The default control height for buttons, inputs, selects across the authenticated platform and most marketing CTAs. |
| Large | 48px | Marketing hero CTAs, and authenticated-platform primary actions that deliberately need more visual weight (e.g. a confirm-and-submit on a high-consequence action). |

**Fit analysis against the institutional-fintech direction:** 32/40/48
sit on the 4px grid with 8px steps, which reads as measured rather than
arbitrary, and 40px as the default matches common dense-financial-UI
practice (enough touch/click target without the oversized feel `UI-01` §4
explicitly rejects). This is a reasonable starting family, but **it has
not been visually validated against a real component or the Phantom
reference** — marking the whole table `PROVISIONAL / DESIGN REVIEW
REQUIRED` rather than approved.

## 5. Radius System

AIX must not default to "everything is `rounded-xl`" (`UI-01` §4). A
**public-vs-authenticated radius rule** applies (also see §9):

| Tier | Context | Radius (PROVISIONAL) |
|---|---|---|
| Micro | Checkboxes, small badges, tags | 4px |
| Standard | Buttons, inputs, most authenticated-platform controls | 8px |
| Cards / panels | Dashboard panels, content cards | 12px |
| Floating navigation | The public-site floating pill nav (§10) | Full pill (radius = half the container height) |
| Full pill controls | Status chips, selective marketing CTAs | Full pill, used sparingly |

**Public marketing surfaces** may lean toward the larger end of this table
(cards/panels, full-pill accents) and toward the floating-pill nav's own
full-radius treatment. **Authenticated operational surfaces** — tables,
forms, compliance screens — should stay at Micro/Standard almost
exclusively; Cards/panels only where a genuine panel boundary exists, never
as decoration. This is the explicit guard against Phantom-style softness
leaking into financial tables and compliance screens (per this turn's
instruction).

**Do not make every card a pill.** The floating nav's pill shape is
deliberately unique to that one component, not a system-wide default.

## 6. Typography Framework

**No final font family is selected in this document** — none is currently
approved anywhere in the repository. This section defines **roles**, not
typefaces.

| Role | Purpose | Size range (PROVISIONAL) | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| Display | Marketing hero statements | 40–64px | Bold/Semibold | Tight (1.05–1.15) | Slightly tight at largest sizes |
| Page title | Authenticated-platform page headers | 24–28px | Semibold | 1.2–1.3 | Normal |
| Section title | Panel/card/section headers | 18–20px | Semibold | 1.3 | Normal |
| Body | Default reading/UI text | 14–16px | Regular | 1.5 | Normal |
| Small body | Secondary text, helper copy | 13px | Regular | 1.45 | Normal |
| Caption | Metadata, timestamps, fine print | 12px | Regular/Medium | 1.4 | Slightly loose |
| Label | Form labels, table column headers | 12–13px | Medium/Semibold | 1.3 | Slightly loose, often uppercase-track when used as an eyebrow |
| Table | Table cell content | 13–14px | Regular | 1.4 | Normal |
| Numeric / financial | Balances, amounts, rates, any monetary or quantity figure | 13–16px depending on context | Regular/Medium | 1.4 | Normal |

**Numeric/financial presentation must prioritize tabular alignment,
clarity, and dense-data readability.** `font-variant-numeric:
tabular-nums` is recorded here as a **likely implementation requirement**
for every numeric/financial role and for table cells generally — so digits
align vertically across rows regardless of which digits appear (`1` and
`8` occupy the same width) — but is not yet applied anywhere, since no
frontend exists.

## 7. Content Width System

**Marketing and operational applications have different width
requirements** — one max-width must not be forced across every page type.
Four provisional categories:

| Category | Use | Max-width (PROVISIONAL) |
|---|---|---|
| `marketing-wide` | Hero sections, full-bleed marketing sections | 1280–1440px, or full-bleed with internal constrained content |
| `marketing-reading` | Marketing body copy, long-form explanatory content | 680–760px (optimal reading measure) |
| `authenticated-app` | Standard authenticated-platform page content (forms, detail views, non-table pages) | 960–1120px |
| `dense-data / full-width` | Tables, data grids, dashboards needing horizontal room | Full available width within the page gutter (§8), no artificial cap |

## 8. Page Gutters

**PROVISIONAL**, on the 4px grid, pending screenshot QA once real layouts
exist:

| Breakpoint | Horizontal gutter |
|---|---|
| Large desktop (≥1440px) | 64px |
| Desktop (1024–1439px) | 48px |
| Tablet (768–1023px) | 32px |
| Mobile (<768px) | 16px |

## 9. Public-vs-Authenticated Elevation and Radius Restatement

Restating the rule from `UI-01` §3 in dimensional terms: **the
authenticated platform uses even less visual elevation than the marketing
website.** Concretely — authenticated surfaces default to a hairline
border (§10's border treatment) with little or no shadow except where a
genuine floating/overlay element requires depth (dropdowns, modals,
toasts); the marketing site may use the softer shadow/backdrop treatment
described for the floating nav (§10) more liberally. Radius follows the
same split — see §5.

---

## 10. Floating Pill Navigation — Geometry (PROVISIONAL)

**This is the primary specification in this document.** Every dimension
below is a **PROVISIONAL** starting point, conceptual (§1) since no
reference image exists yet, and explicitly **not yet approved
pixel-for-pixel** — the user has stated a wish to review measurements
before implementation.

### 10.1 Desktop geometry

| Property | Value (PROVISIONAL) | Rationale |
|---|---|---|
| Top offset | 24px (`space-6`) from viewport top | Enough separation to read as detached, not so much it feels lost |
| Height | 64px | Comfortable containment for a logo mark + nav items + CTA at the Default/Large control heights (§4) without feeling oversized |
| Max width | 1120px | Caps on very large monitors (per this turn's proportion rule) so the pill never spans the full viewport |
| Width behavior below max | Fluid, with side clearance below | See "outer horizontal page clearance" |
| Outer horizontal page clearance | Fluid — never less than 24px from the viewport edge at any width above mobile | Guarantees visible breathing room on both sides at all times, not just at the max-width cap |
| Inner horizontal padding | 24px (`space-6`) | Internal left/right padding inside the pill container |
| Nav-item gap | 32px (`space-8`) between primary nav items | Generous, matching the Phantom-inspired "breathing room" characteristic (`UI-01` §11) without becoming sparse |
| Logo-area relationship | **REVISED, UI Phase 1B — see note below.** ~~Logo sits flush to the pill's left inner padding; a vertical divider or additional gap (`space-6`, 24px) separates it from the first nav item~~ | ~~Keeps the logo as a distinct anchor, not crowded by nav items~~ |
| CTA relationship | **REVISED, UI Phase 1B — see note below.** ~~Primary CTA sits flush to the pill's right inner padding, at the Default control height (40px, §4), vertically centered in the 64px bar~~ | ~~CTA reads as the terminal, weighted action — standard nav-bar convention~~ |

> **Revision (UI Phase 1B, explicit, not silent):** the two rows above were
> written conceptually in Phase 0B, before `REF-UI-001`'s image existed
> (§1). Now that the image is available, it shows the logo and the
> right-side actions sitting **outside** the pill — not inside its inner
> padding as originally assumed. Phase 1B's own governing instructions
> explicitly directed following that composition ("the reference image
> places logo and right-side actions outside the pill. Preserve that
> general composition unless measured layout evidence shows it does not
> work for AIX"). The implemented architecture is therefore: **LEFT**
> (wordmark, outside the pill) / **CENTER** (the pill — nav items only) /
> **RIGHT** (actions, outside the pill) — a 3-column CSS grid
> (`1fr auto 1fr`) keeps the pill genuinely centered regardless of the
> logo/actions columns' differing content widths, which a flexbox
> `justify-between` would not guarantee. See `AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md`
> ("UI-03") §Phase 1B for the implemented component.

### 10.2 Radius, border, shadow, background

| Property | Value (PROVISIONAL) |
|---|---|
| Radius | Full pill — `border-radius: 32px` (half of the 64px height), per §5's floating-navigation tier |
| Border | A single, very low-opacity hairline border (approx. 1px, low-opacity neutral) — never a heavy or saturated border |
| Shadow | Very soft, low-opacity, diffuse — avoids the heavy-drop-shadow look explicitly rejected by this turn's instructions |
| Backdrop | Slight backdrop blur, with a semi-transparent (not fully opaque, not fully transparent) background — enough to read as detached from whatever content scrolls beneath it |
| Background opacity | PROVISIONAL — a value in the 80–92% opacity range against the backdrop blur; exact value **DESIGN REVIEW REQUIRED**, dependent on the final page background treatment |

### 10.3 Sticky / scroll behavior

**Proposed: sticky from the start**, detached at the top offset (§10.1)
from initial page load, remaining fixed at that position through scroll —
rather than only becoming sticky after a scroll threshold. This keeps the
navigation consistently reachable and avoids a layout jump the moment
scrolling begins.

**Optional shrink-on-scroll**, if adopted, must define its dimensional
delta explicitly rather than "get smaller": height reduces from 64px to
56px, top offset reduces from 24px to 12px, background opacity increases
toward the upper end of the §10.2 range. **This shrink behavior itself is
PROVISIONAL / DESIGN REVIEW REQUIRED** — it may be adopted or dropped
entirely once real scroll behavior is reviewed.

**Motion must be subtle and functional** — any transition (shrink, opacity
change) should read as a quiet adjustment, not an animated flourish. No
bounce, no dramatic easing, no attention-seeking motion.

### 10.4 Tablet behavior

**SUPERSEDED, UI Phase 1B Remediation 01 — see 10.6 note below.** ~~At
tablet widths (768–1023px), the same floating-pill structure is
retained, with:~~

- ~~Outer horizontal page clearance reduced to the §8 tablet gutter (32px)~~
- ~~Nav-item gap reduced from 32px to 20px (`space-5`) to accommodate the
  narrower viewport while items remain individually legible~~
- ~~If the full item set does not fit at 20px gap, collapse to the mobile
  treatment (§10.5) rather than compressing items further — items must
  never become illegibly cramped~~

There is no longer a distinct tablet-width row treatment: the full
desktop composition now begins at `lg:` (1024px), and every narrower
width uses the §10.5 mobile/compact treatment directly. See 10.6 for the
empirical reason.

### 10.5 Mobile behavior (dedicated treatment, not a squeeze)

**The desktop nav layout must not simply squeeze onto mobile.** A
dedicated mobile treatment:

- **Compact floating header** — same pill/rounded-container language,
  height reduced to 56px, top offset reduced to 16px (`space-4`)
- **Logo** on the left, at the same inner-padding relationship as desktop
- **One primary action** (if needed) on the right — either the CTA at a
  reduced footprint or omitted in favor of the menu trigger, decided per
  actual content, not decided in this document
- **Menu trigger** (hamburger/equivalent) as the rightmost element,
  opening a full navigation surface — **not** a giant full-screen pill;
  the expanded menu is its own distinct surface/treatment, out of scope
  for this document's geometry (a future, dedicated specification)
- Outer horizontal page clearance follows the §8 mobile gutter (16px)

### 10.6 Phase 1B Implementation Status

**IMPLEMENTED, PENDING USER VISUAL REVIEW** — `platform/apps/web/components/site/public-header.tsx`.
Every dimension in §10.1–§10.5 was implemented exactly via governed
Tailwind utilities and independently re-verified against the actual
compiled CSS output (not assumed from class names): `top-4`/`top-6` =
16/24px, `h-16`/`h-14` = 64/56px, `max-w-[1120px]`, `px-6`/`px-4` = 24/16px
(outer clearance and inner padding, both contexts), `gap-8` = 32px item
gap, `rounded-full` on a 64px-tall element = exactly 32px radius.
`shadow-sm`/`backdrop-blur-sm` and the `/85`,`/60` opacity modifiers were
confirmed via the compiled CSS's `color-mix` `@supports` rules to resolve
to genuine 85%/60% opacity, not merely assumed from the utility names.
**The breakpoint at which `top-4`→`top-6` and the desktop/mobile row
switch was originally `md:` (768px); Remediation 01 (§10.7) revised this
to `lg:` (1024px) after empirical visual QA — the tablet-specific 20px
item gap this paragraph originally described no longer exists, since the
full row now only renders at `lg:` and up.**

**Findings recorded, not silently resolved:**

- **Tablet range (768–1023px) NOT empirically verified.** No browser/
  screenshot tool was available this turn (none was installed, per this
  turn's explicit instruction not to add one solely for screenshots).
  Calculated character-width estimates (5 nav labels + wordmark + 2
  actions at the specified paddings/gaps) suggest this range may be tight
  for the full row at 20px gap. Flagged specifically for the user's visual
  review at this breakpoint — the implementation was NOT unilaterally
  changed to a different collapse point based on unverified hand-math.
- **Button radius deviation, out of this turn's explicit scope.**
  shadcn's `Button` primitive's `rounded-lg` resolves to the shared
  `--radius` token (`0.625rem` = **10px**), not this document's §5
  "Standard" tier value (**8px**). This turn's explicit Button Geometry
  instruction governed height only (40px Default) — not radius — so
  `Button.tsx` was not modified. Recorded here as an unresolved,
  precisely-measured deviation for a future reconciliation, not shipped
  silently.
- **A real accessibility defect was found and fixed during implementation
  (not shipped):** an initial draft wrapped shadcn's `NavigationMenu` (which
  renders its own semantic `<nav>`, defaulting to `aria-label="Main"`) in
  an additional outer `<nav aria-label="Primary">` — producing two nested
  `<nav>` landmarks for one navigation area. Fixed by styling a `<div>` for
  the pill surface and passing `aria-label="Primary"` directly to
  `NavigationMenu`, leaving exactly one `<nav>` landmark in the rendered
  DOM (independently re-verified: `grep -c "<nav"` on the live-rendered
  HTML = 1).
- **CSS shorthand/longhand override ambiguity, investigated and resolved
  correctly, not assumed.** shadcn's `NavigationMenuLink` base classes
  include `p-2`; an initial override attempt of `px-1` alone left `p-2`'s
  vertical padding unexamined. The `cn()` utility (verified directly via
  `node -e`) does **not** dedupe `p-2` against `px-*`/`py-*` the way it
  dedupes same-property utilities (`h-8`→`h-10` was confirmed to dedupe
  cleanly) — both classes remain in the rendered `class` attribute, and
  which one's overlapping declarations win is determined by their order in
  the *compiled stylesheet*, not the JSX. Verified directly against the
  compiled CSS byte offsets that Tailwind v4 consistently orders
  directional longhand utilities (`px-*`/`py-*`) after the `p-*` shorthand,
  so a longhand override does reliably win — but the fix applied was to
  fully specify both axes explicitly (`px-3 py-0`) rather than rely on
  partial-override cascade ordering, removing the ambiguity entirely
  rather than merely trusting it.

No shrink-on-scroll was implemented (explicitly deferred per this turn's
instruction). No final AIX color palette or font was selected — the pill
uses two new, explicitly PROVISIONAL, public-marketing-scope-only tokens
(`--marketing-background`, `--marketing-surface`; see
`AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md` §Phase 1B for the full
token rationale) — never the shared `--background`/`--card` tokens, so
this remains scoped to the public site only per `UI-01` §3.

**SCREENSHOT VISUAL ACCEPTANCE: superseded — see §10.8.** No visual
acceptance was claimed by this section or by the implementation at the
time it was written; visual acceptance was subsequently granted after
Remediation 01 (§10.7), recorded in §10.8. See `UI-03`'s Phase 1B section
for the full verification record (typecheck/lint/build/rendered-HTML/
compiled-CSS review) and its explicit limits.

### 10.7 Phase 1B Remediation 01 — empirical breakpoint correction

User visual QA (real-browser review, not the source/compiled-CSS review
of §10.6) was performed at 1440px, 1024px, 768px, and 440px after Phase
1B's initial implementation. Result:

- **1440px — pass for current stage.**
- **1024px — pass for current stage, kept under observation.**
- **768px — fail.** The full desktop row (wordmark + 5 nav items + 2
  actions) at the `md:` (768px) threshold and 20px item gap was visibly
  compressed, specifically in the side-column relationship — confirming
  the risk flagged as unverified in §10.6.
- **440px — pass for current stage.**

**Decision: the full-desktop-composition threshold is revised from `md:`
(768px) to `lg:` (1024px).** §10.4's dedicated tablet-gap treatment is
superseded (struck through above) rather than retained as an
intermediate state — there is no longer a squeezed tablet row between
mobile and desktop. Below `lg:` (1024px), the §10.5 mobile/compact
treatment applies directly. 1024px is the lowest width at which the full
desktop composition is currently accepted; it remains **under
observation**, not fully closed out. This was an empirical correction
made from user-supplied screenshots, not a unilateral redesign.

### 10.8 Phase 1B Visual Acceptance

**AIX UI PHASE 1B: VISUALLY ACCEPTED**, following Remediation 01. User
visual review confirmed:

- **1440px — pass.**
- **1024px — pass.**
- **768px — pass** (compact floating navigation, after Remediation 01;
  the original `md:` full-desktop treatment at this width was rejected —
  see §10.7).
- **430/440px — pass.**

**Accepted responsive rule:** full desktop navigation ≥1024px (`lg:`);
compact floating navigation <1024px. This is now the governed behavior
for this component, superseding §10.4's original tablet-specific
treatment.

**Accepted implementation baseline: `47c0f1a`** (implementation `537c71d`
+ Remediation 01 `47c0f1a`). REF-UI-001's floating-pill concept was
successfully **adapted, not copied** — its approved scope is unchanged
(the floating/detached pill treatment only; never Phantom's branding,
colors, typography, or exact measurements).

**This acceptance does NOT extend to:** a final AIX color palette, a
final AIX font, a final AIX brand asset/logo, or the full public website
— all remain pending. Shrink-on-scroll (§10.3) remains explicitly
deferred, not implemented. No further UI scope beyond this header has
been implemented.

---

## 11. Floating Nav Character

The nav should feel **premium, light, detached, precise, institutional,
modern**. It should explicitly **not** feel: cartoonishly rounded,
oversized, toy-like, heavy, glowing, Web3-neon, or generic-SaaS. Every
dimension in §10 is chosen with this character in mind — generous but
disciplined spacing (never sparse, never crowded), a soft but not heavy
shadow, a pill shape that reads as precise rather than playful.

## 12. Visual QA Tolerances

Meaningful tolerances only — not pseudo-scientific precision for its own
sake:

| Check | Tolerance |
|---|---|
| Alignment mismatch (edges, columns, shared baselines) | Flag when visibly greater than 1–2px |
| Repeated spacing mismatch (same semantic spacing appearing at two different values) | Flag any deviation from the applicable token (§3) unless documented as an intentional optical correction |
| Equivalent control height mismatch (two controls that should share a height role, §4) | 0px tolerance — they must match exactly |
| Equivalent icon-size mismatch (two icons that should share a size, §13) | 0px tolerance — they must match exactly |
| Baseline inconsistency (text baselines across adjacent elements) | No numeric tolerance — must be visually inspected; text baseline alignment is not reliably reducible to a single pixel threshold across different font metrics |

Consistent with `UI-01` §8: every finding from these checks is reported as
a measurable deviation ("header is 4px too low"), never as a vague
impression.

## 13. Grid / Alignment Rules

- Shared left edges across stacked components in the same content column
- Shared control baselines — controls of the same height role (§4) that
  sit in the same row must align exactly, not merely "look aligned"
- Consistent column gutters within any multi-column layout
- Consistent card-header geometry (title position, action-icon position,
  padding) across every card that carries a header
- Consistent table header/row geometry (§15) across every table
- **No visually drifting components** — a component's position/size must
  be governed by the token system (§3–§8), not by an accumulation of
  small, individually-reasonable-looking adjustments that drift from it
  over time

## 14. Icon System

**Likely source: Lucide** — recorded as the likely direction because
shadcn/ui integrates with it naturally, **not installed in this turn**.

Provisional icon sizes, only where a distinct role is genuinely needed:

| Size | Use |
|---|---|
| 16px | Inline with Small body / Caption / Label text, dense table-row icons |
| 18px | Inline with Body text, most default-control-height icon slots |
| 20px | Inline with Section title text, standalone action icons at Default control height |
| 24px | Standalone icons at Large control height, marketing-context icons |

**Every icon placed next to text or inside a control must pass an optical
alignment check** — vertically centered against the text's cap-height/
x-height or the control's content box, not merely centered against the
control's outer box, which can look off-center even when the CSS reports
"centered."

## 15. Table / Financial-Data Direction

Principles only — no table is built in this turn.

- **Numeric columns right-aligned**, with `tabular-nums` (§6) so digits
  align vertically across rows
- **Status presented as a visually distinct but restrained** element (a
  small label/dot/chip at the Micro radius tier, §5 — not a large colored
  pill dominating the row)
- **Row heights governed** — a single token-derived value per table
  density tier (e.g. Compact rows using the 32px control-height rhythm,
  Default rows using the 40px rhythm), never ad hoc per table
- **Header heights governed** the same way, and visually distinct from
  body rows (weight/color, not necessarily height)
- **No giant card wrapper around every table** — a table is data first;
  wrap it only when a genuine panel boundary is needed (§5), not by
  default
- **Sticky headers where useful** — long tables should keep column headers
  visible on scroll
- **Horizontal overflow intentionally managed** — wide tables scroll
  horizontally within their own contained region rather than breaking the
  page layout; this must be a deliberate choice per table, not an
  accident of unconstrained content

## 16. Form Direction

Principles only — no form is built in this turn.

- **Consistent control heights** — every input/select/textarea-trigger in
  a form uses the same height role (§4) unless there's a specific,
  documented reason not to
- **Consistent label spacing** — a single governed gap (§3) between a
  label and its control, applied uniformly
- **Consistent help/error spacing** — a single governed gap between a
  control and its help text or validation error, applied uniformly
- **Financial amount fields designed intentionally** — currency/asset
  prefix or suffix, numeric alignment, and any max-precision/step behavior
  are a deliberate design decision per field, not a default text input
- **Validation layout must not shift unpredictably** — reserving space for
  an error message (even when absent) is preferred over a layout that
  jumps when validation fires
- **Prefix/suffix geometry governed** — consistent padding and alignment
  for any input prefix/suffix (currency symbol, unit label) across every
  field that uses one

## 17. Color Direction (High-Level Only)

**No full palette and no exact hex values are finalized in this
document** — that requires reference review this turn does not perform.
High-level direction only:

| Role | Direction |
|---|---|
| Base | Institutional neutrals |
| Primary | Deep navy / blue-violet family |
| Accent | Selective lavender / electric-violet influence, used sparingly |
| Success | Restrained financial green |
| Warning | Amber |
| Danger | Controlled red |

**Saturated neon colors are not used as primary surfaces.** Exact hex
values are not derived without reference review — recording this
direction is the extent of this document's color scope.

---

## 18. Phantom Reference Analysis

### What AIX takes from Phantom

- The floating, detached navigation concept itself
- Breathing room — generous spacing, both inside the container and
  between the container and the viewport edges
- Generous but disciplined internal spacing (not sparse, not crowded)
- Clear shape separation from the page background (via the border/shadow/
  backdrop treatment in §10.2)

### What AIX does not take from Phantom

- Exact branding (logo, wordmark, brand identity)
- Exact color palette
- Phantom's playful wallet-brand personality — AIX's authenticated
  platform in particular stays institutional (`UI-01` §3)
- Exact button treatment
- Exact search control (Phantom's search UI is out of scope entirely)
- Exact measurements — every dimension in §10 is an AIX-derived starting
  point, not a measurement taken from Phantom's site

## 19. Other References — Status Unchanged

`REF-UI-002` (Fireblocks), `REF-UI-003` (Anchorage Digital), `REF-UI-004`
(Copper), and `REF-UI-005` (Revolut Business) remain **REFERENCE / UNDER
REVIEW**, per `UI-01` §14 — unchanged by this document. None is elevated
to an approved design reference here; that requires an explicit, separate
user decision.

---

## 20. What This Document Explicitly Did Not Do

- No font family was selected.
- No exact hex color values were derived.
- No package (shadcn, Lucide, a font, or any frontend dependency) was
  installed.
- No component, page, CSS file, or Tailwind/shadcn config was created.
- No floating-nav dimension in §10 was validated against the actual
  Phantom reference image, because that image has not yet been supplied
  (§1).
- No value in this document is presented as final-approved — every
  dimensional table is **PROVISIONAL** and/or **DESIGN REVIEW REQUIRED**
  pending screenshot-based visual QA once real implementation exists.

---

## 21. Phase 1C — Public Landing Hero (Geometry & Implementation Status)

**IMPLEMENTED, PENDING USER VISUAL REVIEW** —
`platform/apps/web/components/site/public-hero.tsx` (`PublicHero`). Header
+ hero only, per this turn's scope; `PublicHeader` (§10.8, VISUALLY
ACCEPTED) is unchanged.

**Header-to-hero top spacing (computed, not guessed):** the accepted
header is `fixed` (out of flow). Compact header (below `lg:`): 16px top
offset + 56px height = 72px bottom edge. Desktop header (`lg:` and up):
24px top offset + 64px height = 88px bottom edge. A single governed 48px
(`space-12`) breathing gap is added at both: **`pt-[120px]`** below `lg:`,
**`lg:pt-[136px]`** at `lg:` and up. Both are exact 4px-grid multiples.

**Container / gutters:** content capped at §7's `marketing-wide` 1280px,
`mx-auto`-centered. Horizontal gutter: 16px mobile / 32px tablet (`md:`) /
48px desktop (`lg:`) — matches §8 exactly for those three tiers. The
§8 large-desktop (≥1440px) 64px gutter tier is **not** implemented as a
distinct fourth breakpoint this turn — past 1280+2×48=1376px the
container's own centering already produces growing whitespace, judged
sufficient for this scope; flagged as a possible future refinement, not a
silent gap.

**Layout:** two-column at `lg:` (`grid-cols-[1.05fr_1fr]`, copy left /
product-preview panel right), single column (copy, then preview) below
`lg:`. Column gap: 40px mobile/tablet (`gap-10`/`md:gap-12`=48px), **64px
desktop** (`lg:gap-16`).

**Headline:** `max-w-[560px]` cap, independent of the grid column's own
width. Size 40px / 48px (`md:`) / 56px (`lg:`) — within §6's Display role
range (40–64px), deliberately not pushed to the top of that range (the
brief explicitly warns against spectacle-sized headlines). Line-height
`1.1` (within §6's 1.05–1.15), weight semibold.

**Supporting paragraph:** `max-w-[480px]` (§7 reading measure), 16px
(§6 Body role), line-height `1.5`.

**CTAs:** "Request Access" (primary, `variant="default"`) / "Explore
Platform" (secondary, `variant="outline"`) — both fully inert (no
`href`/`onClick`), matching the header's already-accepted CTA treatment
rather than introducing a new placeholder convention. Height **48px**
(`h-12`, §4 Large role — this document's own "marketing hero CTAs" case),
explicit `px-6` (24px) horizontal padding overriding the shared `Button`
default (`px-2.5`, too tight at 48px height) — a documented, deliberate
override per `UI-01` §2.1 rule 6. Gap **16px** (`gap-4`) — larger than the
header's 12px CTA gap, a deliberate choice for the taller 48px controls,
not an inconsistency. Full-width (`w-full`) below `sm:` (640px) as a
deliberate mobile tap-target decision, `w-auto` (content-width, side by
side) at `sm:` and up.

**Product-preview panel:** an original AIX panel illustrating the
maker-checker wallet-destination-approval workflow (a real, already-backed
IAM-02 concept — not an invented capability), explicitly labeled "Demo
preview" and "not connected to live data," with no fabricated financial
figures. Width `max-w-[420px]` (`w-full` below that), radius **exactly
12px** via `rounded-[12px]` — **not** the shared `rounded-xl` utility,
which was verified against compiled CSS to resolve to 14px
(`var(--radius)×1.4` = 10×1.4), missing this document's own §5
"Cards/panels" 12px tier. Padding 24px (`p-6`, `space-6`), row
padding 12px (`py-3`), row/icon gap 12px (`gap-3`), border `border-border/60`,
`shadow-sm` — no backdrop blur (reserved for the floating-nav pill; kept
this panel a plain solid card, not a second glass surface). Status icons
16px (§14's dense/inline tier), `aria-hidden` (decorative; the row's own
text label carries the accessible content).

**Tablet (768–1023px) behavior:** single-column stack (same as mobile),
32px page gutter, 48px inter-block gap; compact header (§10.5) applies,
since the accepted header threshold is `lg:`/1024px, not `md:`/768px.

**Mobile (<768px) behavior:** single-column stack, 16px page gutter,
40px inter-block gap; CTAs full-width and stacked; headline/paragraph
caps (560px/480px) do not bind at this width — text fills the actual
(narrower) column width instead, which was a deliberate choice, not an
oversight.

**Background:** deliberately flat — no gradient/blob layer added. The
brief permits a "very restrained" gradient, but a decorative layer was
judged unnecessary for a first pass and is the single most explicitly
flagged anti-pattern ("purple blob background"); safer to ship flat and
add a reviewed treatment later if wanted.

**Color:** no new CSS custom properties/tokens were added. Status icon
colors use Tailwind's stock `emerald-600`/`amber-600` (and their `dark:`
variants) directly, matching §17's Success/Warning direction role-for-role
— not a token extension, not a final-hex approval.

**Copy status:** headline/paragraph avoid every prohibited claim in this
turn's brief (no "regulated exchange," "live trading," "bank-grade,"
"audited," or hype words); direction taken from the brief's preferred
vocabulary (money broking, payments, controlled digital-asset operations,
compliance-first execution, operational transparency). Not a final,
approved marketing-copy sign-off — copy review is separate from visual
review.

**Anti-AI-look review performed:** no gradient/blob background, no
KPI-card row, no badge/chip row beyond the panel's own "Demo preview"
label, no icon-circle decoration, no oversized headline, exactly 2 CTAs,
no glass panel beyond the already-accepted header pill.

**Not accepted/changed by this turn:** final AIX font (still pending),
final AIX color palette (still pending), final AIX brand asset/logo
(still pending — wordmark unchanged), the accepted header (unchanged
except as consumed, not redesigned). **VISUAL ACCEPTANCE: PENDING USER
REVIEW** — not self-declared.

### 21.1 Phase 1C Remediation 01 — headline wrap + tablet preview alignment

User visual QA found two defects, corrected without changing any other
Phase 1C geometry, wording, or breakpoint architecture:

- **Compound-word wrapping defect.** "digital-asset" was observed
  splitting across its internal hyphen (`digital-` / `asset` on separate
  lines) at 1440px and 430px. Fixed by wrapping the term in
  `whitespace-nowrap` so the browser treats it as one unbreakable unit for
  line-wrapping — no `<br>`, no hard-coded viewport-specific line breaks,
  no change to the underlying text (still the plain string
  "digital-asset," a real hyphen-minus; `textContent`/copy-paste/
  screen-reader pronunciation unaffected — independently verified against
  the rendered HTML). The headline continues to wrap naturally everywhere
  else.
- **Tablet horizontal-anchor inconsistency.** At the stacked 768–1023px
  state, the product-preview panel's wrapper used `justify-center` below
  `lg:`, centering the 420px-capped panel beneath the left-aligned copy
  column — two different horizontal anchors on one screen. Fixed by
  changing the wrapper to `justify-start` unconditionally (it was already
  `justify-start` at `lg:`, so this is now a single value at every
  width) — pure normal-flow flexbox alignment, no margin/offset/transform/
  absolute positioning. The panel now shares the copy column's own left
  edge, since both are full-width tracks of the same grid sharing the
  container's padding. At mobile (<768px) this is a visual no-op — the
  panel already fills the narrower-than-420px available track width, so
  centered vs. left-aligned looked identical there.

**No other Phase 1C geometry, wording, color, font, shadow, border,
container width, column gap, CTA sizing, preview width/radius/content, or
breakpoint threshold changed.** Independently re-verified against the
rendered HTML: headline text content is byte-identical to the original;
the preview-wrapper class is now `justify-start` with no responsive
variant. **VISUAL ACCEPTANCE: still PENDING USER REVIEW.**

### 21.2 Phase 1C Visual Acceptance

**AIX UI PHASE 1C: VISUALLY ACCEPTED**, following Remediation 01. User
visual review confirmed:

- **1440px — pass.** (The Remediation 01 headline-wrap fix corrected the
  only defect noted at this width.)
- **1024px — pass** (unchanged since initial review).
- **768–1023px — pass**, following Remediation 01's tablet-alignment fix
  (the preview panel now shares the copy column's left edge).
- **430px — pass**, following Remediation 01's headline-wrap fix.

**Accepted responsive rule:** two-column hero at ≥1024px (`lg:`);
single-column, left-aligned stack (copy, then preview, sharing one left
edge) at 768–1023px; single-column mobile composition with stacked
full-width CTAs below 768px. "digital-asset" must not break across its
internal hyphen at any width — enforced via `whitespace-nowrap`, not a
per-viewport hard-coded line.

**Accepted implementation baseline: `ddc33a4`** (implementation `1f9a49b`
+ Remediation 01 `ddc33a4`). Accepted hero state: headline "Infrastructure
for governed money broking and digital-asset operations."; supporting
copy as implemented; primary CTA "Request Access"; secondary CTA "Explore
Platform"; product preview illustrating the maker-checker
wallet-destination-approval workflow, explicitly demo / not connected to
live data.

**This acceptance does NOT extend to:** a final AIX color palette, a
final AIX font, a final AIX brand asset/logo, the full public website,
remaining homepage sections, production API wiring, live onboarding, or
live product workflows — all remain pending. The accepted `PublicHeader`
(§10.8) is unaffected — this section covers the hero only.

---

## 22. Phase 1D — Public Operating Model Section (Geometry & Implementation Status)

**IMPLEMENTED, PENDING USER VISUAL REVIEW** —
`platform/apps/web/components/site/public-operating-model.tsx`
(`PublicOperatingModel`), the third real AIX visual component. One
homepage section only ("How AIX Works"), below the accepted hero;
`PublicHeader` and `PublicHero` (§10.8/§21.2, both VISUALLY ACCEPTED) are
unchanged.

**Regulatory/business truth:** the 6-step sequence (Instruction / Control
/ Funding / Execution / Settlement / Evidence) was checked against
`docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.3.md`
(`execution_model = agency_back_to_back`; `feature_derivatives`/
`feature_margin_trading`/`feature_staking`/`feature_yield_product` all
`disabled`; principal dealing/market making/internal matching/public
exchange trading explicitly blocked) and
`docs/01_masters/04_Role_And_Permission_Matrix_v1.2.md` ("pre-funded
hold", "LP settlement payment", "Settlement sequence must not create AIX
principal exposure", "reconciliation break", "audit log") before wording
was finalized — every step uses terminology already governed in those
documents. "DvP" is deliberately **not** used as visible copy: the
masters use it only inside an internal control-sequence phrase ("DvP/
safeguarded sequence checks"), not as a universally-applicable
settlement-method claim, so "controlled settlement and reconciliation
sequence" is used instead. The section carries its own explicit
non-live-status label — see below — rather than presenting the sequence
as a live transaction feed.

**Section spacing:** top `pt-16`/`md:pt-20`/`lg:pt-24` = 64/80/96px;
bottom `pb-20`/`md:pb-24`/`lg:pb-28` = 80/96/112px. Deliberately less than
doubling the hero's own bottom padding (64/80/96px) — combined visual gap
between hero and this section is generous without being excessive dead
space.

**Container:** `max-w-[1280px]`, same gutters as the hero (16px mobile /
32px tablet (`md:`) / 48px desktop (`lg:`)) — no new, unrelated container
width introduced, per this turn's explicit instruction.

**Intro block:** `max-w-[720px]`, centered — reuses §7's existing
`marketing-reading` width tier (680–760px) rather than inventing a new
cap. The section heading has no separate narrower cap; it inherits the
720px intro-block width.

**Section heading:** 32px / 36px (`md:`) / 40px (`lg:`) — a **new,
documented sub-role** ("Section heading," marketing, non-hero), not one
of §6's existing roles: Display (40–64px) is reserved for the hero;
authenticated Page title (24–28px) and Section title (18–20px) are the
wrong context (both are authenticated-platform roles). 40px desktop is
deliberately the *floor* of the Display range, and every breakpoint steps
down further from there, so this heading visibly reads as smaller than
the hero's own 40/48/56px sequence — "should not compete with the hero
headline" was a hard requirement, verified by the numbers, not assumed.
Flagged here for the eventual full type-role table finalization rather
than silently added as an unrecorded one-off.

**Desktop process row (`lg:`, 1024px+):** single horizontal row,
`grid-cols-6`, `gap-6` (24px). Each step: a thin 1px (`bg-border`)
connector line running through a 40px (`size-10`, reusing §4's existing
Default control-height token as a circle diameter) circular marker
containing a 20px (`size-5`, reusing §14's existing "standalone action
icon at Default control height" tier) neutral (foreground-colored, not
accent) Lucide icon; the connector is omitted before step 1 and after
step 6. Title 14px semibold, description 12px, both below the marker.

**Tablet (768–1023px):** 2-row × 3-column grid (`grid-cols-3`), `gap-x-8`
(32px) / `gap-y-10` (40px), no connector line — a line crossing a wrapped
2-row grid reads as broken, not measured, so it was omitted rather than
forced; the visible "01"–"06" numbers and the native `<ol>` order already
carry the sequence without it.

**Mobile (<768px):** single vertical column, `space-y-8` (32px) between
steps, with a thin vertical connector (1px, `bg-border`) positioned behind
the 40px circle markers — the brief's suggested "switch to a vertical
connector."

**Open measurement flag:** the desktop 6-column row was sized against a
1024px viewport (928px available content width ÷ 6 columns ≈ 141px per
column before the 24px gaps) — verified against the actual compiled CSS
column width, but **not** verified in a real browser viewport, since no
screenshot/browser-automation tool was available and installing one
solely for this purpose remained out of scope. This is the same category
of risk the Phase 1B header breakpoint turned out to have; it was **not**
unilaterally pushed to a safer/later breakpoint based on unverified
reasoning — flagged here for specific attention during the user's visual
review at 1024–1100px.

**Accessibility:** native `<ol>`/`<li>` (a screen reader announces "item N
of 6" from list semantics regardless of the visual "01"–"06" labels or
connector styling, both of which are presentational only). Exactly one of
the three responsive `<ol>` variants is visible at any given viewport
(the other two are `display:none`, removed from the accessibility tree —
no duplicate announcement). All icons `aria-hidden`; each step's own
title/description text carries the meaning.

**Color:** no new tokens added. Circle markers reuse the existing
`--marketing-surface` token and `border-border`; icons are neutral
(`text-foreground`), not accent-colored, per this turn's "prefer neutral
hierarchy first, accent sparingly" instruction.

**shadcn:** no new shadcn component added — `Separator`/`Badge`/`Tooltip`
were all considered and judged unnecessary (the connector is a single
`h-px bg-border` div, cheaper and more controllable for the flex-1
line-segment pattern than `Separator`; the non-live-status disclosure is
plain text, not a badge chip; no interactive hover content exists to
warrant `Tooltip`).

**Anti-AI-look review performed:** no card wrapper around any step (a
numbered process rail, not a feature-card grid), no badges/chips, no
gradient/glow on the connector or icons, no excessive shadow anywhere in
the component, exactly one purposeful icon per step (not decorative
filler).

**Not accepted/changed by this turn:** final AIX font (still pending),
final AIX color palette (still pending), final AIX brand asset (still
pending), the accepted header/hero (unchanged except as consumed).
**VISUAL ACCEPTANCE: PENDING USER REVIEW** — not self-declared.

---

## 23. Phase 1E — Public Trust, Governance & Control Section (Geometry, Status, Visual-Risk Register)

**IMPLEMENTED, VISUAL QA DEFERRED** —
`platform/apps/web/components/site/public-trust-control.tsx`
(`PublicTrustControl`), the fourth real AIX visual component. One
homepage section ("Trust & Control"), below `PublicOperatingModel`
(§22); `PublicHeader`/`PublicHero`/`PublicOperatingModel` are unchanged.
**Full visual QA is intentionally deferred this turn, per explicit
instruction** — this section is not being sent for screenshot/visual
acceptance now; it is verified via source/layout review and quality
gates only, with known visual-risk flags recorded below for a later
consolidated QA pass.

**Regulatory/claim discipline:** no visible copy claims "fully
regulated," "bank-grade security," "institutional-grade custody,"
"audited security," "regulator certified," a blanket "approved by LFSA,"
or "fully compliant." No regulator logo or certification-seal imagery is
used. Every statement describes AIX's own control *architecture*,
checked against `docs/01_masters/04_Role_And_Permission_Matrix_v1.2.md`
("The platform must use default-deny permission enforcement"; "role,
permission, maker-checker, and segregation-of-duties model") and
`docs/01_masters/02_Software_Requirement_Specification_v1.2.md`
("Client money safeguarding account = required"; safeguarding
computation/reconciliation), plus the real, already-implemented
IAM-02/SEC-01 sensitive-read-logging concept referenced in
`docs/00_project_state/PROJECT_HANDOVER.md`
(`aml1.screening.sensitive_read`, tier-based redaction). The section
carries its own explicit "Platform design / control model" disclosure
line rather than implying completed external audit or certification.

**Content structure:** four control groups — Authority / Approval /
Funds Control / Evidence — rendered as **one** ordered control list
(`<ol>`, `divide-y divide-border`, 1px dividers per the compiled CSS,
i.e. the "one continuous vertical rule" the brief asked for) rather than
four boxed/bordered cards. No per-row background fill, no rounded
container around the whole list.

**Section spacing:** identical to §22's Phase 1D values — top
`pt-16`/`md:pt-20`/`lg:pt-24` = 64/80/96px, bottom `pb-20`/`md:pb-24`/
`lg:pb-28` = 80/96/112px — reused deliberately for homepage-wide
section-rhythm consistency, not re-derived per section.

**Container:** `max-w-[1280px]`, same gutters as every other section
(16px mobile / 32px tablet (`md:`) / 48px desktop (`lg:`)) — no new,
unrelated container width introduced.

**Intro width:** `max-w-[480px]` (heading) / `max-w-[440px]` (supporting
copy and disclosure) within the left grid column.

**Control-system (right column) width:** no separate cap on the column
itself — it fills its grid track; each row's description text is capped
at `max-w-[440px]` (same value as the intro copy, for a consistent
reading measure across both columns).

**Desktop layout (`lg:`, 1024px+):** two-column grid, `grid-cols-2`,
`gap-16` (64px) — the same column-gap value `PublicHero` already
established, reused rather than re-derived. LEFT: intro (eyebrow/
heading/copy/disclosure), left-aligned — matching `PublicHero`'s own
left-aligned intro treatment, a deliberate difference from
`PublicOperatingModel`'s *centered* intro (that section's intro sits
above full-width content; this one sits beside a column, so left-aligned
is the layout-appropriate choice each time, not an inconsistency).
RIGHT: the control list.

**Control-row geometry:** `py-6` (24px vertical padding per row,
verified in compiled CSS as `padding-block: 24px`), `first:pt-0`/
`last:pb-0` (no extra padding outside the list's own bounds), `gap-4`
(16px) between the 40px circle marker and the text block. No internal
horizontal padding — deliberately a plain flush list, not a padded card,
so this is reported as 0 rather than an invented value.

**Divider treatment:** `divide-y divide-border`, confirmed 1px via
compiled CSS (`border-bottom-width: calc(1px * ...)`). Not necessary for
understanding order — the `<ol>`'s native semantics and each row's own
number/title/description carry the sequence regardless.

**Icon source/sizes:** Lucide (`KeyRound`, `Users`, `LockKeyhole`,
`ListChecks`), 20px (`size-5`) inside a 40px (`size-10`) circle — the
same governed marker convention `PublicOperatingModel` established,
reused rather than reinvented. Deliberately a *different* icon set than
`PublicOperatingModel`'s, even where a concept could overlap (e.g. "Funds
Control" here uses `LockKeyhole`, not the `Wallet` icon
`PublicOperatingModel`'s "Funding" step already uses), so the two
sections don't visually repeat the same icon+label pairing.

**Tablet (768–1023px) / Mobile (<768px):** single-column stack (intro,
then the full-width control list) for both — a deliberate choice over a
2×2 matrix at tablet, since restructuring a divided *list* into a grid
would introduce a second, incompatible visual structure just for one
breakpoint; single-column keeps the same list semantics and divider
treatment at every width below `lg:`.

**Accessibility:** native `<ol>`/`<li>` list semantics; all icons
`aria-hidden`; each row's own title/description text carries the
meaning; the divider is not necessary for understanding.

**Anti-AI-look review performed:** no four-card grid, no shield-icon
cliché (`ShieldCheck` was in the brief's suggested icon list but
deliberately not used, to avoid the exact cliché this turn's review
explicitly names), no green checkmarks, no pill labels, no fake
compliance badges, no gradient, no glow, no glass, no excessive rounded
containers.

**shadcn:** no new component added — `Separator`/`Tooltip`/`Accordion`
were all considered and judged unnecessary (the divider is a native
`divide-y` Tailwind utility, cheaper than adding `Separator` for the same
visual result; no interactive hover/expand content exists to warrant
`Tooltip`/`Accordion`).

**Known visual-risk register** (real, observed/credible risks only — none
invented):

- **Phase 1D — still open.** The desktop 6-column process row's fit at
  1024–1100px (§22) remains unresolved; **not** addressed or touched this
  turn, per explicit instruction.
- **Phase 1E — control-stack density at mobile (new).** At <768px, each
  of the 4 rows carries a 1–2 line title plus a 2–3 line, 12px
  description in a narrow (~300–320px) text column beside a 40px icon —
  calculated as tight but legible; not verified in a real mobile
  viewport.
- **Phase 1E — two-column width balance at large desktop (new).** The
  left column's text is capped at 440–480px, while the right column (the
  control list) has no matching cap and fills its full ~50%-width grid
  track — at wide desktop viewports (≥1280px) this could read as
  asymmetric (narrower, capped left text next to a wider, uncapped right
  list), calculated from the grid math but not verified visually.

**Not accepted/changed by this turn:** final AIX font (still pending),
final AIX color palette (still pending), final AIX brand asset (still
pending), the accepted header/hero/operating-model (unchanged except as
consumed). **VISUAL QA: DEFERRED** — not self-declared as accepted or
even as "pending review" in the screenshot sense Phases 1B–1D used;
screenshot-based review for this section has not yet been requested.

---

## 24. Phase 1F — Public Platform Capabilities Section (Geometry, Status, Visual-Risk Register)

**IMPLEMENTED, VISUAL QA DEFERRED** —
`platform/apps/web/components/site/public-capabilities.tsx`
(`PublicCapabilities`), the fifth real AIX visual component. One
homepage section ("Platform Capabilities"), below `PublicTrustControl`
(§23); `PublicHeader`/`PublicHero`/`PublicOperatingModel`/
`PublicTrustControl` are unchanged. **Full visual QA is intentionally
deferred this turn, per explicit instruction.**

**Regulatory/product boundary:** matches
`docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.3.md` §3's "Current
Licence Status" table exactly (Money Broking Licence — Approved, active
build scope; Payment System Operator Licence — Approved, active build
scope; Exchange Application — Pending, "Locked until approval"). The
Broking & Execution domain carries an explicit, quiet boundary sentence
using near-verbatim language from the masters ("Exchange-related
functionality remains controlled and disabled until the applicable
approval and go-live conditions are satisfied") — not a loud warning box.
No principal dealing, proprietary trading, market making, derivatives,
margin, futures, staking, lending, yield, MYR pairs, privacy coins, or
algorithmic stablecoins are named or implied.

**Source validation:** every capability item was checked against
`docs/01_masters/03_Master_Module_Index_v1.2.md` and
`docs/01_masters/02_Software_Requirement_Specification_v1.2.md` before
use — "institutional and HNWI/professional onboarding" (the masters
state "MVP client type = institutional and HNWI/professional only...
Retail onboarding is disabled by default," so retail is deliberately
**not** listed as a capability), KYC/KYB, AML/transaction monitoring,
Travel Rule enforcement, OTC/RFQ, MB Spot Broking Terminal, agency/
back-to-back execution, `deposit_withdrawal = enabled`, pre-funded
controls, settlement, reconciliation, maker-checker, audit logging,
default-deny role/permission controls, and reconciliation/safeguarding
reporting. No capability name was invented for marketing purposes.

**Grouping:** 4 capability domains (Client & Compliance / Broking &
Execution / Payments & Settlement / Controls & Reporting), each with its
own short internal list — not 8–12 small cards.

**Section spacing:** identical to §22/§23's values — top `pt-16`/
`md:pt-20`/`lg:pt-24` = 64/80/96px, bottom `pb-20`/`md:pb-24`/`lg:pb-28`
= 80/96/112px — reused for homepage-wide section-rhythm consistency.

**Container:** `max-w-[1280px]`, same gutters as every prior section
(16px mobile / 32px tablet (`md:`) / 48px desktop (`lg:`)).

**Intro width:** `max-w-[720px]`, centered — the exact same
`marketing-reading`-tier value `PublicOperatingModel` (§22) already uses,
reused because this section's full-width matrix-below-centered-intro
structure matches that section's own pattern (as opposed to
`PublicTrustControl`'s left-aligned-intro-beside-a-column pattern).

**Capability-system width:** the matrix spans the full container width;
no separate cap. Category/detail split (Pattern A, an index + selectable
detail panel) was **not** used, so there is no separate "category-column
width" to report — see Desktop layout below for the pattern actually
built.

**Desktop layout (`lg:`, 1024px+):** a 2×2 "architectural capability
matrix" (`grid-cols-2`, 4 domains), separated by thin rule dividers
rather than card borders — Pattern B/C from the brief, not Pattern A
(no Tabs, no click-to-reveal; all 4 domains are always visible, since
showing everything at once was judged clearer for a first-time visitor
than hiding 3 of 4 behind an interaction — see the Interaction
Decision below).

**Category/detail (matrix-cell) geometry:** each cell carries 32px
(`lg:pl-8`/`lg:pr-8`/`lg:pt-8`/`lg:pb-8`) of internal padding on the
divider-facing side(s) only, so two adjoining cells contribute 32px each
— 64px combined — around a single 1px divider line, which sits centered
in that combined gap rather than touching either cell's content.
**A real defect was found and fixed during implementation:** the grid
wrapper originally also carried `gap-x-8` (32px), which would have
*added* to the per-cell padding rather than replacing it, producing a
96px combined horizontal gap instead of the intended 64px — removed
after being caught by reasoning through the box model, not assumed
correct from the class names.

**Internal padding:** row-gap-equivalent 32px per side (above); no
separate horizontal card padding exists, since domains are not card
boxes — the divider-facing padding above is the only padding this layout
uses.

**Divider treatment:** plain 1px (`border-border`) rules on two axes
(`lg:border-l` for the right column, `lg:border-t` for the bottom row),
forming a single cross rather than four boxed borders. Not necessary for
understanding — heading hierarchy and list structure carry the grouping
regardless.

**Icon treatment:** Lucide (`IdCard`, `Handshake`, `Wallet`,
`ClipboardCheck`), one per domain (not per capability item), 20px
(`size-5`) inside a 40px (`size-10`) circle — the same governed marker
convention every prior homepage section uses. `Wallet` is reused from
`PublicOperatingModel`'s "Funding" step deliberately (both concern
funds, and the label differs enough — "Payments & Settlement" vs.
"Funding" — not to read as a duplicate pairing the way `PublicTrustControl`
avoided reusing `PublicOperatingModel`'s icons for a near-identical
concept/label pair).

**Interaction pattern:** fully static — no Tabs/Accordion/carousel.
`Tabs`/`Separator`/`Accordion` were all considered per this turn's shadcn
policy and judged unnecessary: the divider is a plain Tailwind border
utility, and no interaction was judged to improve comprehension over
showing all 4 domains simultaneously for a capability overview.

**Tablet (768–1023px) / Mobile (<768px):** single-column stack (one
domain after another, full width) for both — the brief's explicit
"simplify deliberately" instruction; a 2×2 grid was judged harder to
read at tablet widths than a straightforward stack, so tablet and mobile
share one simplified structure rather than introducing a third distinct
layout.

**Accessibility:** semantic `<section>`/heading hierarchy (`h2` section
heading, `h3` per domain); capability items use a real `<ul>`/`<li>`
list; all icons and the small dot bullets are `aria-hidden`; no fake
clickable elements (fully static, no `role="button"` on non-interactive
content); reading order is meaningful without CSS (intro, then domains
in the same 1-2-3-4 order at every breakpoint).

**Anti-AI-look review performed:** no card grid, no colored icon boxes
(icons are neutral, `text-foreground`), no pill labels, no rainbow
categories, no gradient panels, no badges, no checkmark list (a small
neutral dot bullet was used instead), no "Everything you need"
startup-copy tone, no fake metrics, no excessive rounding (only the
40px circle markers use `rounded-full`, consistent with every prior
section).

**Known visual-risk register** (real, observed/credible risks only — none
invented):

- **Phase 1D — still open.** Desktop 6-column process row fit at
  1024–1100px (§22). Untouched this turn.
- **Phase 1E — still open.** Mobile control-stack density; large-desktop
  two-column width balance (§23). Untouched this turn.
- **Phase 1F — capability density on mobile (new).** Four stacked
  domains, each with a description plus 3–4 short bullet items, produce
  a long single-column scroll (roughly 150–200px per domain, ~600–800px
  total) — calculated as legible per-item but not verified as a whole
  scrolling experience in a real mobile viewport.
- **Phase 1F — matrix quadrant height imbalance (new).** "Broking &
  Execution" (top-right cell) carries one extra paragraph (the
  Exchange-boundary note) that "Client & Compliance" (top-left, its row
  partner) does not — since CSS Grid rows size to their tallest cell,
  the top row's height will be set by the taller "Broking & Execution"
  cell, leaving "Client & Compliance" with unused space above the
  divider line. Calculated from the content/grid model, not observed in
  a rendered viewport.
- **Phase 1F — Exchange-boundary note prominence (new).** The boundary
  note is styled identically to ordinary domain description text
  (`text-xs text-muted-foreground`), deliberately per this turn's "not a
  marketing distraction" instruction — but this creates a real, honest
  tension worth flagging: a regulatory-boundary statement that is easy
  to visually skip past. Recorded as an open question for user review,
  not a claim that it is wrong.

**Not accepted/changed by this turn:** final AIX font (still pending),
final AIX color palette (still pending), final AIX brand asset (still
pending), the accepted header/hero/operating-model/trust-control
(unchanged except as consumed). **VISUAL QA: DEFERRED** — not
self-declared as accepted; screenshot-based review has not yet been
requested for this section.

---

## 25. Phase 1G — Public Product Experience / Platform Preview (Geometry, Status, Visual-Risk Register)

**IMPLEMENTED, VISUAL QA DEFERRED** —
`platform/apps/web/components/site/public-product-preview.tsx`
(`PublicProductPreview`), the sixth real AIX visual component and the
first to present a **public demo of the authenticated client portal
experience**. One homepage section, below `PublicCapabilities` (§24);
every prior component is unchanged. **Full visual QA is intentionally
deferred this turn, per explicit instruction.**

**Workflow chosen:** Wallet Destination / Approval Status — confirmed
against `docs/01_masters/04_Role_And_Permission_Matrix_v1.2.md`
("Payout destination: Create, verify, approve, reject, delete/
deactivate"; `deposit_address_assignment = maker_checker`; SOD-003
blocks self-approval) and
`docs/01_masters/05_Master_Workflow_Map_v1.2.md` ("Destination becomes
active after cooling-off";
`payout_destination_cooling_off_hard_gate = true`). The three demo
statuses map to real governed states: "Active" (post-cooling-off),
"Pending Approval" (the maker-checker step), and "Evidence Required"
(matching the masters' own "Wallet address ownership evidence"
requirement — deliberately "Evidence," not the brief's suggested
"Proof," to track that exact phrase).

**No fake metrics.** No portfolio value, PnL, price, volume, yield, APY,
or TVL appears anywhere. The detail panel deliberately **omits** the
brief's suggested "Last Review" field — no governed document was found
grounding a specific last-review timestamp for a payout destination
precisely enough to include with confidence, so it was dropped rather
than invented. The one address-like value shown
(`bc1q••••••••92F1`) is a clearly masked placeholder, never a
real-format address.

**Disclosure:** a quiet sentence near the section intro
("Illustrative product preview — demo data only, not connected to live
production services") plus a small "Demo" `Badge` inside the preview
shell's own top bar — deliberately redundant, since this is the most
product-like public section so far.

**shadcn additions this turn:** `table` and `badge` (pinned CLI 4.21.0).
**Both are pure Tailwind/semantic-HTML components with zero new npm
dependencies** — verified: `package-lock.json` unchanged after adding
them, so no backend regression was required. `Badge`'s `outline` variant
is used uniformly for all three statuses — **no per-status color** — per
this turn's explicit "do not invent arbitrary color semantics"
instruction; status is differentiated by label text only.
**`Tabs`/`DropdownMenu`/`Tooltip`/`ScrollArea`/`Separator` were all
considered and judged unnecessary** — the preview is fully static, no
interaction improves comprehension over showing the table and detail
panel simultaneously.

**A precisely-flagged, out-of-scope shadcn deviation:** `Badge`'s default
radius (`rounded-4xl`, ≈26px, effectively a full pill given the 20px
badge height) does not match this document's own §5 "Micro" 4px chip
tier — the same category of deviation already recorded for `Button`'s
radius in Phase 1B. Not silently shipped, not unilaterally redesigned
this turn (that would be a shared-component change beyond this section's
scope).

**Two real geometry values were corrected during implementation** (found
by reasoning through the governed token tables, not assumed correct):
the context-rail item height was initially `h-9` (36px, matching no
existing control-height tier) — changed to `h-8` (32px, the existing
"Compact" tier); its radius was initially `rounded-[6px]` (matching no
existing radius tier) — changed to `rounded-[8px]` (the existing
"Standard" tier). Both re-verified against the compiled CSS after the
fix.

**Section spacing:** identical to §22/§23/§24's values — top `pt-16`/
`md:pt-20`/`lg:pt-24` = 64/80/96px, bottom `pb-20`/`md:pb-24`/`lg:pb-28`
= 80/96/112px — reused for homepage-wide section-rhythm consistency.

**Container:** `max-w-[1280px]`, same gutters as every prior section.

**Intro width:** `max-w-[720px]`, centered — the same value
`PublicOperatingModel` (§22) and `PublicCapabilities` (§24) already use.

**Preview shell max width:** `max-w-[1120px]` — the top of UI-02 §7's
existing `authenticated-app` content-width tier (960–1120px), reused
rather than inventing a new cap, since this shell is explicitly a
preview of authenticated-platform content.

**Preview shell height:** no fixed height — a `min-h` was deliberately
**not** set; the shell's height is fully content-driven (top bar + table
+ detail panel), verified not to consume excessive vertical space by
construction (a 3-row table plus a compact detail panel), rather than
forcing an arbitrary minimum.

**Preview radius:** `rounded-[12px]` — UI-02 §5's existing "Cards/
panels" 12px tier, reused (the same exact value/reasoning as `PublicHero`'s
product-preview panel in Phase 1C).

**Top-bar height:** `h-12` = 48px — UI-02 §4's existing "Large" control-
height tier, reused (chosen over "Default" 40px since the bar holds both
a title and a `Badge` comfortably).

**Context-rail/sidebar width:** `w-[200px]` — a new, deliberately
grid-aligned value (200/4=50) — no existing UI-02 token covers sidebar
width specifically; flagged here, not silently introduced as if
governed.

**Content padding:** `p-6` (24px) on the main content area; `p-4` (16px)
on the context rail — both existing spacing tokens (§3).

**List/table structure:** an official shadcn `Table` (native `<table>`
semantics) — genuinely appropriate given 3 destinations across 3 real
columns (Destination/Network/Status), not a styled `<div>` grid.

**Row height:** the table header row is exactly 40px (`TableHead`'s own
default `h-10`) — this happens to already match UI-02 §4's "Default"
control-height/§15's "Default rows using the 40px rhythm" exactly,
verified rather than assumed. Body rows are content-driven (no explicit
height override) — their default `TableCell` padding (`p-2` = 8px) plus
14px body text produces a compact row close to, but not forced to, the
same 40px rhythm.

**Detail-panel geometry:** `w-full` below `lg:`, `lg:w-[280px]` fixed at
desktop; `rounded-[8px]` (§5 "Standard" tier, reused); `p-4` (16px)
internal padding; a native `<dl>`/`<dt>`/`<dd>` field list (Destination
name as an `<h3>`, then Network/Address/Control Status/Approval Status
as description-list pairs) — real semantic structure, not styled `<div>`
rows pretending to be a list.

**Status treatment:** `Badge` `outline` variant, identical for all three
statuses (see shadcn section above) — restrained, text-differentiated,
no invented color semantics.

**Desktop (`lg:`, 1024px+) behavior:** full shell — top bar, context
rail (200px), table, and detail panel (280px) all visible, table and
detail side by side.

**Tablet (768–1023px) / Mobile (<768px) behavior:** context rail hidden
(`hidden ... lg:block`) — de-emphasizing secondary navigation per this
turn's suggested mobile strategy; detail panel stacks below the table
(`flex-col` below `lg:`) rather than beside it, per the brief's explicit
suggested mobile strategy ("stack detail below list").

**Accessibility:** semantic `<section>`/heading hierarchy (`h2` section
heading, `h3` shell title and detail-panel title); a real `<table>` via
shadcn `Table` (proper `<thead>`/`<tbody>`/`<th>`/`<td>` semantics); the
context rail uses plain `<span>` elements, **not** `<button>`/`<a>`/`<nav>`
— since none of it is functional, avoiding any misleading clickable
affordance was judged more important than using nav-shaped markup for a
non-functional demo list; a real `<dl>` for the detail panel; all
decorative icons `aria-hidden`.

**Interaction status:** fully static. No fake dropdown, filtering, modal,
or tabs were added. No real interaction was implemented either (this is
Phase 1G's own explicit "prefer static preview" instruction) — nothing
in the shell responds to click/hover beyond the `Table`'s own inherited
row-hover highlight (a harmless scanning aid, not a false interactive
claim, since no cursor/focus affordance implies clickability).

**Anti-AI-look review performed:** no KPI cards, no chart, no fake
prices, no glass dashboard (a plain solid `--marketing-surface`
background, no backdrop blur), no floating cards, no neon badges, no
avatars, no "Welcome back," no generic icon-laden SaaS sidebar (the
context rail is 4 plain text labels, no icons, no user avatar, no
collapse control), no excessive rounding, exactly one shadow
(`shadow-sm` on the outer shell only).

**Known visual-risk register** (real, observed/credible risks only — none
invented):

- **Phase 1D — still open.** Desktop 6-column process row fit at
  1024–1100px (§22). Untouched this turn.
- **Phase 1E — still open.** Mobile control-stack density; large-desktop
  two-column width balance (§23). Untouched this turn.
- **Phase 1F — still open.** Mobile capability-list density; matrix
  quadrant height imbalance; Exchange-boundary note prominence (§24).
  Untouched this turn.
- **Phase 1G — destination-table fit at 1024px and on mobile (new).**
  Calculated column math: at a 1024px viewport, the shell's content area
  after the 200px sidebar and `p-6` padding leaves roughly 680px for
  table + detail panel + gap; the fixed 280px detail panel and 24px gap
  leave only ~376px for a 3-column table whose longest label
  ("Institutional Payout Destination") alone approaches or exceeds that
  width — likely triggering the `Table`'s built-in horizontal scroll
  (`overflow-x-auto`) at this range, and more severely at mobile widths
  where even less width is available. Calculated from the box model, not
  observed in a rendered viewport.
- **Phase 1G — sidebar/content proportion (new).** The 200px context
  rail is a fixed width regardless of shell width; at the shell's
  narrower end (near 1024px) this is a larger proportion of the
  available space for 4 short static text labels than the same rail
  would be at wider desktop widths — a proportion-balance question, not
  a claim that it is wrong.
- **Phase 1G — demo-disclosure prominence (new).** The disclosure
  sentence and the in-shell "Demo" badge are both intentionally quiet
  (matching this turn's "not a giant warning banner" instruction) — but
  for the most product-like public section so far, a cropped or
  out-of-context screenshot could plausibly omit both. Recorded as an
  open question for user review, the same honest tension already
  recorded for Phase 1F's Exchange-boundary note.
- **Phase 1G — status-badge color-neutral hierarchy (new).** All three
  statuses use the identical `outline` badge treatment by deliberate
  design (avoiding invented color semantics while the final semantic
  status palette remains pending) — this means status urgency/state can
  only be distinguished by reading the label text, not by glancing at
  color. An intentional trade-off, not an oversight, but worth revisiting
  once a real status-color system is approved.

**Not accepted/changed by this turn:** final AIX font (still pending),
final AIX color palette (still pending), final AIX brand asset (still
pending), the accepted header/hero/operating-model/trust-control/
capabilities sections (unchanged except as consumed). **VISUAL QA:
DEFERRED** — not self-declared as accepted; screenshot-based review has
not yet been requested for this section.

---

## 26. Phase 1H — Public Final CTA / Request Access Section (Geometry, Status, Visual-Risk Register)

**IMPLEMENTED, VISUAL QA DEFERRED** —
`platform/apps/web/components/site/public-final-cta.tsx`
(`PublicFinalCta`), the seventh real AIX visual component and the
**closing content block** of the current homepage, below
`PublicProductPreview` (§25); every prior component is unchanged. **Full
visual QA is intentionally deferred this turn, per explicit
instruction.**

**Audience/claim discipline:** institutional / HNWI / professional only
— matches the platform's own MVP client scope (`docs/01_masters/
03_Master_Module_Index_v1.2.md`: "MVP client type = institutional and
HNWI/professional only... Retail onboarding is disabled by default,"
already used in Phase 1F, §24). No retail-oriented copy ("Start trading
now," "Open an account in minutes," "Sign up free") appears. The
regulatory-boundary note uses this turn's exact suggested wording —
"Access and available functionality are subject to eligibility,
onboarding, applicable approvals, and controlled platform enablement" —
deliberately, since it was already calibrated to avoid implying that
Money Broking/PSO (already approved, per `docs/01_masters/
00_Licence_Scope_And_Feature_Lock_v1.3.md`, already used in Phase 1F)
are themselves unapproved.

**Copy status:** heading "Start a conversation about your operating
needs."; supporting copy states the institutional/HNWI/professional
audience and the eligibility/onboarding/enablement conditions; primary
CTA "Request Access" (the exact same label `PublicHeader`'s own CTA
already uses — deliberate continuity, not a coincidence); secondary CTA
"Speak With Our Team" (chosen over "Contact AIX" to complete the
heading's own "conversation" framing). Not a final, approved marketing-
copy sign-off — copy review is separate from visual review, consistent
with every prior section's own copy-status statement.

**Interaction:** both CTAs fully inert (no `href`, no `onClick`) — the
same treatment `PublicHeader`'s and `PublicHero`'s CTAs already use. No
email/KYC/waitlist/account-opening form was built.

**Section spacing:** identical to §22–§25's values — top `pt-16`/
`md:pt-20`/`lg:pt-24` = 64/80/96px, bottom `pb-20`/`md:pb-24`/`lg:pb-28`
= 80/96/112px — reused for homepage-wide section-rhythm consistency, not
re-derived for a "closing" section.

**Container:** `max-w-[1280px]`, same gutters as every prior section.

**Content width:** no separate content cap beyond the container — the
two-column grid spans the full container width, the same approach
`PublicHero` and `PublicTrustControl` already use for their own
two-column layouts.

**Heading width:** `max-w-[480px]` — the exact same value
`PublicTrustControl` (§23) already uses for its own heading, reused
rather than re-derived.

**Copy width:** `max-w-[440px]` — the exact same value `PublicHero`
(§21) and `PublicTrustControl` (§23) already use.

**CTA dimensions:** `h-12` (48px) on **both** the primary and secondary
button — identical class string on both, so the "0px height mismatch"
requirement is structurally guaranteed, not merely visually close;
`px-6` (24px) horizontal padding on both, reusing the exact override
`PublicHero`'s own 48px CTAs already established (overriding `Button`'s
default `px-2.5`, too tight at 48px height).

**CTA gap:** `gap-4` (16px) — the exact same value `PublicHero`'s own
48px-CTA row already uses.

**Layout gap (desktop two-column):** `lg:gap-16` (64px) — the same
value `PublicHero`, `PublicTrustControl`, and `PublicCapabilities`'s
matrix all already use.

**Boundary-note width:** `max-w-[320px]` — a new, deliberately narrow,
grid-aligned value (320/4=80) chosen so a short quiet note reads as 1–2
lines rather than stretching the full action column's width; flagged
here as a new value, not silently introduced as if already governed.

**Surface treatment:** a full-bleed section background using the
existing `--marketing-surface` token (the same token `PublicHero`'s
pill and every subsequent section's icon markers already use) — not a
new token, and not a contained bordered panel, so **no radius applies**
(radius is reported here as N/A for the same honest reason
`PublicCapabilities`, §24, reported "no separate category-column width"
rather than inventing one). This gives the closing section the
"slightly stronger surface separation" this turn suggested from
`PublicProductPreview` above it, without introducing new color.

**Desktop layout (`lg:`, 1024px+):** two-column grid (`grid-cols-2`),
LEFT heading/copy, RIGHT actions + boundary note — deliberately echoing
`PublicHero`'s own LEFT-copy/RIGHT-content asymmetry (without repeating
its content), so the closing section reads as a visual "bookend" to the
opening hero.

**Tablet (768–1023px) behavior:** single column, left-aligned — matching
`PublicTrustControl`'s own collapse treatment, since both sections share
the same LEFT/RIGHT desktop structure; copy above, actions below. CTAs
are side by side (`sm:flex-row` is already active at this width, `sm:`
= 640px) rather than stacked.

**Mobile (<768px) behavior:** single column; CTAs full-width and
stacked below `sm:` (640px) — the exact same pattern `PublicHero`'s own
CTAs already use and that passed Phase 1C's visual acceptance, reused
rather than re-derived.

**Accessibility:** semantic `<section>`/heading hierarchy (`h2` section
heading); focus treatment is inherited unmodified from the shared
`Button` component (no custom focus override was added, so the existing
`focus-visible` ring remains intact); no misleading live-navigation
implication — both CTAs are visually and semantically plain buttons with
no `href`, consistent with `PublicHeader`'s/`PublicHero`'s own
established inert-CTA convention.

**Anti-AI-look review performed:** no giant rounded CTA card, no purple
gradient, no glowing button, no email-capture form, no three-button row,
no fake urgency, no random badge, no "Ready to get started?" cliché, no
generic SaaS closing-section tone.

**Known visual-risk register** (real, observed/credible risks only — none
invented):

- **Phase 1D — still open.** Desktop 6-column process row fit at
  1024–1100px (§22). Untouched this turn.
- **Phase 1E — still open.** Mobile control-stack density; large-desktop
  two-column width balance (§23). Untouched this turn.
- **Phase 1F — still open.** Mobile capability-list density; matrix
  quadrant height imbalance; Exchange-boundary note prominence (§24).
  Untouched this turn.
- **Phase 1G — still open.** Destination-table fit at 1024px/mobile;
  sidebar/content proportion; demo-disclosure prominence; status-badge
  color-neutral hierarchy (§25). Untouched this turn.
- **Phase 1H — closing-section surface prominence vs. hero (new).** The
  `--marketing-surface` full-bleed background was a deliberate choice to
  give this section "slightly stronger separation" per this turn's own
  instruction — but whether the resulting contrast reads as appropriately
  subtle (not competing with the hero, per the explicit "do not make it
  louder than the hero" instruction) or as too faint/too strong has not
  been verified in a rendered viewport.
- **Phase 1H — actions-column alignment at tablet width (new).** The
  right-hand actions column has no tablet-specific alignment override
  (only `lg:flex lg:flex-col lg:items-start`), relying on default block
  behavior below `lg:` — calculated as correct, but not yet visually
  confirmed at exactly 768–1023px alongside the left column's own
  collapse.
- **Phase 1H — regulatory-note visibility (new).** The boundary note
  uses the same quiet `text-xs text-muted-foreground` treatment already
  flagged for Phase 1F's Exchange-boundary note and Phase 1G's
  demo-disclosure — the same honest, recurring tension (a
  regulatory-relevant statement styled to avoid being a "marketing
  distraction," which also makes it easy to scan past), now present a
  third time in a section whose primary visual focus (the CTA buttons)
  competes directly with it.
- **Phase 1H — cumulative vertical whitespace (new).** `PublicProductPreview`
  (§25) already carries its own generous bottom padding (80–112px) before
  `PublicFinalCta`'s own top padding (64–96px) begins — the combined gap
  between the preview shell's bottom edge and this section's content
  could read as excessive "dead space" (the specific anti-pattern named
  in `UI-01` §4) between two adjacent sections. Calculated from the
  stacked padding values, not observed in a rendered viewport.

**Not accepted/changed by this turn:** final AIX font (still pending),
final AIX color palette (still pending), final AIX brand asset (still
pending), every prior section (unchanged except as consumed). **VISUAL
QA: DEFERRED** — not self-declared as accepted; screenshot-based review
has not yet been requested for this section.
