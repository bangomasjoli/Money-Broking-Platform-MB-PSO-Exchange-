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

---

## 27. Phase 1I — Public Footer (Geometry, Information Architecture, Anchor Policy, Visual-Risk Register)

**IMPLEMENTED, VISUAL QA DEFERRED** —
`platform/apps/web/components/site/public-footer.tsx` (`PublicFooter`),
the eighth and **final structural component** of the current public
homepage, after `PublicFinalCta` (§26). Every prior component is
unchanged except for one minimal, semantic-only addition (see Anchor
Policy below). **Full visual QA is intentionally deferred this turn,
per explicit instruction** — the next activity is a **consolidated
visual QA pass across the whole homepage**, not a further structural
addition.

**PUBLIC HOMEPAGE STRUCTURE: IMPLEMENTATION COMPLETE / CONSOLIDATED
VISUAL QA PENDING.** This is a structural-completeness statement, not a
visual-acceptance claim — the homepage is **not** visually accepted as a
whole; Phases 1D–1I each remain individually `VISUAL QA DEFERRED` with
their own recorded risk flags below, all still open.

**Brand:** the same temporary "AIX" typographic wordmark `PublicHeader`
already uses — BRAND ASSET PENDING, no logo invented. Descriptor:
"Institutional digital-finance infrastructure for governed operations."
— deliberately worded differently from `PublicHero`'s own headline
("Infrastructure for governed money broking and digital-asset
operations.") to avoid the top and bottom of the same page reading as
repetitive.

**Copyright / legal entity — a real finding, not silently resolved:**
**no registered legal entity name exists anywhere in the governed
project docs.** Checked `docs/01_masters/00_Licence_Scope_And_
Feature_Lock_v1.3.md` and `docs/01_masters/01_Project_Charter_v1.3.md`'s
own Document Control tables (`owner: Unassigned` in both files'
frontmatter) — only "AIX Money Broking Platform" / "AIX MB Platform" (a
*platform* name, not a *legal entity* name) appears anywhere. This
turn's own brief suggested "© 2026 AIX Investment Group Company Ltd."
as an illustrative example but explicitly required confirming the exact
naming first and explicitly prohibited inventing a legal entity suffix —
since none is governed, the copyright line reads **"© 2026 AIX. All
rights reserved."**, with no corporate suffix, deliberately deviating
from the brief's own suggested example because the brief's own
instruction required exactly that verification-before-writing.

**Anchor policy — real destinations only:** five existing section root
elements were each given a same-page `id` this turn — `id="how-it-works"`
on `PublicOperatingModel` (§22), `id="trust"` on `PublicTrustControl`
(§23), `id="capabilities"` on `PublicCapabilities` (§24), `id="product"`
on `PublicProductPreview` (§25), `id="request-access"` on
`PublicFinalCta` (§26). Each addition is exactly one attribute plus one
explanatory comment — **no visual or structural change to any of those
five components** (re-verified: `typecheck:web`/`lint:web`/`build:web`
all still pass, and each section's own existing className/content is
untouched). **No "Platform" or "Company" standalone link, and no
"Security"/"Regulatory Scope" link, was added** — none has a distinct
real destination on this page without either duplicating an anchor
already used for something else or pointing at nothing. "Contact" was
deliberately mapped to `#request-access` (not a separate, duplicate
link) because that section already contains the "Speak With Our Team"
CTA — the genuine contact point. **No fake route, no dead link, no
404-producing href exists in this footer.**

**Contact details:** none shown (no email/phone/address) — none is
approved for public display in any governed document; the existing
`#request-access` anchor is the only contact mechanism, per explicit
instruction not to invent one.

**Social links:** none — no official social-media link exists in
governed project data.

**Boundary note:** "Availability of products and functionality is
subject to eligibility, onboarding, applicable approvals, and controlled
platform enablement" — the same family of language `PublicFinalCta`
(§26) already uses, kept consistent rather than introducing new phrasing
for the same underlying constraint.

**Footer top padding:** `pt-12` = 48px — smaller than every other
section's `pt-16`/`md:pt-20`/`lg:pt-24` sequence, deliberately: the
footer follows `PublicFinalCta`'s own already-generous bottom padding
(80–112px), so a full marketing-section-scale top padding would compound
into excessive combined whitespace (the same category of concern already
flagged in §26). Not responsive-stepped, since the footer's own content
doesn't need to visually expand across breakpoints the way a hero/section
intro does.

**Footer bottom padding:** `pb-8` = 32px — the very end of the page;
deliberately tighter than a mid-page section's bottom padding, since
there is no more content below it to separate from.

**Container:** `max-w-[1280px]`, same gutters as every prior section.

**Desktop layout:** `flex lg:flex-row lg:justify-between lg:gap-16` —
brand block (`max-w-[280px]`, reusing the same value
`PublicProductPreview`'s detail panel, §25, already uses) on the left,
a `<nav aria-label="Footer">` containing the two link groups on the
right, `lg:gap-16` (64px) between them — the same 64px value every other
section's own desktop layout gap already uses.

**Navigation-column geometry:** the two link groups (Platform, Company)
sit in a `flex sm:flex-row sm:gap-12` row (48px gap) once past `sm:`
(640px); group heading `text-xs font-semibold uppercase` (12px, the
site-wide Label-role tier).

**Link vertical gap:** `space-y-2` = 8px between links within one group
— verified in compiled CSS as `margin-block` 8px — a compact,
footer-appropriate spacing, tighter than body-copy line gaps elsewhere
on the page.

**Divider treatment:** two plain `border-t border-border` (1px) rules —
one at the footer's own top edge (separating it from `PublicFinalCta`
above), one between the main footer content and the legal row —
consistent with the plain-border-divider convention already established
by `PublicTrustControl` (§23) and `PublicCapabilities` (§24).

**Legal-row spacing:** `mt-8` (32px) above the row's own top divider,
`pt-6` (24px) between that divider and the legal-row content
(copyright + boundary note).

**Copyright text size:** `text-xs` = 12px — the site-wide minimum text
size already used throughout every prior section's captions/
descriptions, **not** a smaller 10–11px legal-text size, per this
turn's explicit instruction.

**Mobile group spacing:** `gap-8` (32px) between the stacked brand
block, nav block, and legal row at the outermost flex container; `gap-8`
(32px) again between the two link groups themselves once they stack
below `sm:` (640px).

**Surface treatment:** deliberately **does not** repeat
`PublicFinalCta`'s `--marketing-surface` tint — stacking the identical
tinted background across two consecutive sections would blend them into
one block with no visible seam, undermining "close the page cleanly."
The footer instead inherits the page's own base
`--marketing-background` with only the top `border-t` as the closure
mechanism — a deliberate choice, not an oversight, and reported here as
such rather than silently matching the section above it.

**shadcn:** no new component — `Separator` was considered and judged
unnecessary (a plain `border-t border-border` achieves the same result
with one fewer dependency layer); no `Card` was used for the CTA-style
footer content, per explicit instruction.

**Tablet (768–1023px) behavior:** brand block and nav block stack
(`flex-col` below `lg:`); the two link groups sit side by side
(`sm:flex-row` is already active at 768px, `sm:` = 640px).

**Mobile (<768px) behavior:** brand block, then the two link groups
(stacked below `sm:` = 640px, since both `sm:flex-row` conditions are
inactive below that), then the legal row — brand/descriptor first,
navigation groups next, boundary/copyright last, matching this turn's
explicit ordering instruction. No horizontal overflow — no element in
this component has a fixed width wider than its container.

**Accessibility:** semantic `<footer>`; `<nav aria-label="Footer">`
around the two real link groups; every link uses `next/link`'s `Link`
(matching `PublicHeader`'s own wordmark-link pattern) with a real
`href` (a genuine same-page anchor in every case — no
clickable-looking inert text); focus treatment is inherited unmodified
from the browser/Next default link focus style (no custom override was
added that could suppress it).

**Anti-AI-look review performed:** no large black footer, no social-icon
row, no newsletter input, no "Stay updated" copy, no giant CTA inside
the footer, no 5-column sitemap (only brand + 2 compact link groups), no
gradient/glow, no random legal badges, no crypto-community links, no
over-rounding (no rounded elements at all in this component).

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
- **Phase 1H — still open.** Closing-section surface prominence vs. the
  hero; actions-column alignment at tablet width; regulatory-note
  visibility; cumulative vertical whitespace against
  `PublicProductPreview` (§26). Untouched this turn.
- **Phase 1I — footer navigation density on mobile (new).** Below
  `sm:` (640px), the brand block and both link groups (Platform's 4
  items, Company's 1 item) all stack into one long single column before
  the legal row even begins — calculated as a real, if modest, length
  concern, not verified in a rendered mobile viewport.
- **Phase 1I — footer surface-boundary contrast (new).** The footer's
  own base-background choice (vs. `PublicFinalCta`'s tinted surface,
  separated only by a 1px `border-t`) was a deliberate mechanism choice
  (see Surface treatment above) — whether a single 1px line reads as
  sufficient visual closure, or too faint, has not been verified.
- **Phase 1I — CTA-to-footer cumulative spacing (new).** `PublicFinalCta`'s
  own bottom padding (80–112px) plus the footer's `pt-12` (48px) top
  padding combine to 128–160px before footer content begins — a
  distinct instance of the same "cumulative whitespace" category already
  flagged for the `PublicProductPreview`→`PublicFinalCta` boundary in
  §26, now recurring at the `PublicFinalCta`→`PublicFooter` boundary.
- **Phase 1I — legal/boundary-text prominence (new, 4th recurrence).**
  The footer's own boundary note uses the same quiet `text-xs
  text-muted-foreground` treatment as the recurring tension already
  recorded for `PublicCapabilities` (§24), `PublicProductPreview` (§25),
  and `PublicFinalCta` (§26) — now a well-established, deliberate,
  site-wide pattern rather than a newly-discovered issue each time, but
  worth noting once more since this is the note's final, most
  "legal-sounding" occurrence (paired directly with copyright text).
- **Phase 1I — desktop column balance (new).** The brand block
  (`max-w-[280px]`) and the nav-groups block (Platform + Company,
  narrower combined width) are split by `justify-between` across the
  full container width — at wide desktop viewports this could leave a
  visually large gap between the two blocks rather than a balanced
  composition. Calculated from the box model, not observed in a
  rendered viewport.

**Not accepted/changed by this turn:** final AIX font (still pending),
final AIX color palette (still pending), final AIX brand asset (still
pending), every prior section (unchanged except for the five minimal
`id` additions recorded above). **VISUAL QA: DEFERRED** —
not self-declared as accepted; screenshot-based review has not yet been
requested for this section or for the homepage as a whole.

---

## 28. Phase 1J — Consolidated Public Homepage Visual QA (Defect Register)

**QA date:** 2026-09-17.
**Baseline:** `3bcbe8b` (main == origin/main, working tree clean before and after this review).
**Scope:** the complete public homepage — `PublicHeader`, `PublicHero`, `PublicOperatingModel`, `PublicTrustControl`, `PublicCapabilities`, `PublicProductPreview`, `PublicFinalCta`, `PublicFooter`.
**Turn type:** review only. **No code, markup, CSS, package, or lockfile changes were made in this turn** — every finding below was produced by source inspection, rendered-HTML inspection of the running dev server, and byte-level inspection of the actual compiled Tailwind CSS output (never assumed from class names alone), plus deliberate arithmetic (column-width, gap, and occlusion math) shown inline so each number is traceable to its inputs.

**Viewports specified for full-page QA:** 1440×900, 1280×800, 1024×768, 834×1194, 768×1024, 430×932, 390×844.
**Tooling status:** no screenshot/browser-automation tool is installed in this environment (`node_modules` confirmed to contain no Playwright/Puppeteer before this review), and none was installed solely for this turn, per explicit instruction. **No rendered screenshot was captured at any of the seven specified viewports.** Every finding below is therefore one of: (a) a precise, numerically-derived finding from the actual compiled CSS/box model — reported with its full arithmetic, not asserted as a visual impression; or (b) explicitly marked **VISUAL / REQUIRES RENDERED CONFIRMATION** where the outcome genuinely depends on rendered appearance (font metrics, perceived contrast, subjective balance) that box-model math cannot settle. No number in this register was invented.

**Method:** (1) re-read every public-site component's current source; (2) cross-referenced every existing Phase 1D–1I visual-risk flag against the current code to confirm it still applies unchanged; (3) fetched the live-rendered HTML from the running dev server (`localhost:3000`, HMR-current) and the actual compiled CSS chunk to verify structural claims (section-id presence/uniqueness, header offset/height values, absence of scroll-margin compensation) directly rather than by inference; (4) performed explicit arithmetic for every viewport-specific claim, shown inline.

### 28.1 New findings

**UI-QA-001 — Same-page anchor targets are occluded by the fixed header (no scroll-margin compensation)**
- **Severity:** HIGH
- **Viewport(s):** all (mechanism is present at every width; the outcome differs by width — see below)
- **Component/section:** all 5 anchor targets added in Phase 1I (`#how-it-works`, `#trust`, `#capabilities`, `#product`, `#request-access`) and, by the same mechanism, every anchor the header nav already points to
- **Observation:** clicking any of the footer's 5 real anchor links (or any browser-native `#fragment` navigation to these ids) scrolls the target section's root element to the very top of the viewport (`y=0`), but `PublicHeader` is `fixed` and sits on top of that position — confirmed via compiled CSS: `.z-40{z-index:40}`, header `top-4`=16px/`lg:top-6`=24px, height `h-14`=56px/`h-16`=64px (all confirmed against the actual compiled CSS, not assumed). No `scroll-margin-top`/`scroll-padding-top` exists anywhere in the codebase — confirmed via `grep` across `globals.css` and every `site/*.tsx` component: zero matches.
- **Measured evidence:** compact header (below `lg:`, i.e. <1024px) occludes the top **72px** of the viewport (16+56). Desktop header (`lg:`, 1024px+) occludes the top **88px** (24+64). Each target section's own top padding places its `<h2>` heading this far below the section's top edge: `#how-it-works`/`#trust`/`#capabilities`/`#product`/`#request-access` all use `pt-16`(64px, <768px)/`md:pt-20`(80px, 768–1023px)/`lg:pt-24`(96px, ≥1024px). Comparing heading-offset to header-occlusion at each range: **<768px: 64px offset vs. 72px occlusion → the heading is occluded by ~8px** (a real, calculable failure, not marginal). **768–1023px: 80px offset vs. 72px occlusion → clears by only 8px.** **≥1024px: 96px offset vs. 88px occlusion → clears by only 8px.** The 8px "clearance" at tablet/desktop is coincidental (different inputs, same result) but uncomfortably tight in both cases.
- **Design rule violated:** none of `UI-01`/`UI-02` explicitly requires scroll-offset compensation (a genuine gap in the measurement spec, not a violated existing rule) — but this is a real, user-facing functional defect: a purpose-built navigation feature (Phase 1I's own anchors) produces a visibly broken result at the narrowest width it's expected to work at.
- **Recommended remediation scope:** add `scroll-margin-top` (matching each breakpoint's own header-occlusion value, with headroom) to the 5 anchor-target `<section>` elements, or a single global rule if all sections should behave identically. A single, root-cause, low-risk CSS-only fix — not a redesign of any section.
- **Cross-section impact:** affects `PublicOperatingModel`, `PublicTrustControl`, `PublicCapabilities`, `PublicProductPreview`, `PublicFinalCta` identically (same header, same padding pattern) — one fix addresses all five.
- **User visual confirmation required:** not strictly required to *identify* this defect (the math is exact and reproducible), but recommended to confirm the fix's chosen headroom feels right once applied.

**UI-QA-002 — `PublicProductPreview`'s destination table overflows its column at 1024px and at mobile widths, and its overflow container is not keyboard-reachable**
- **Status: CLOSED (UI Phase 1K — see §28.9 for the full remediation record and commit hash).** Both the responsive-overflow defect and the keyboard-accessibility defect are resolved; the finding below is preserved verbatim as the original evidence.
- **Severity:** BLOCKER (per this turn's own severity rubric: "overflow" and "inaccessible content" are both named BLOCKER criteria, and this finding is precisely both at once)
- **Viewport(s):** 1024×768 (and by the same math, the entire 1024–~1100px range the existing Phase 1G flag already named), and every width below `lg:` (768×1024, 430×932, 390×844) where the table is full-width instead of half-width
- **Component/section:** `PublicProductPreview`'s `DestinationTable` inside `PreviewShell`
- **Observation/measured evidence (1024px):** shell `max-w-[1120px]`, but at a 1024px viewport the container's own `lg:px-12` (48px) gutters leave **928px** available, which is *less* than 1120px, so the shell fills to 928px. Subtracting the `w-[200px]` context rail leaves **728px** for the main content column; subtracting that column's own `p-6` (24px each side = 48px) leaves **680px** for the inner `flex-row gap-6` (24px) holding the table and the `lg:w-[280px]` detail panel: `680 − 280 − 24 = 376px` remains for the table. shadcn's `TableCell`/`TableHead` both carry `whitespace-nowrap` by default (unmodified), so no column can wrap. Estimating minimum unwrapped content width at the table's actual font sizes/padding: "Institutional Payout Destination" (Destination column, 14px font-medium, `p-2` cell padding) ≈ 263px; "Bank Transfer" (Network column, 14px) ≈ 107px; an "Evidence Required" `Badge` (12px, its own `px-2` padding, inside a `p-2` cell) ≈ 134px. **Total minimum content width ≈ 504px against only 376px available — a ~128px shortfall**, which the `Table`'s own built-in `overflow-x-auto` wrapper will resolve via horizontal scroll, not by breaking the layout. Below `lg:` the table gets the *full* content-column width instead of a shared half, but that width (≈310px at 390px viewport, after gutters and `p-6`) is still far short of the same ≈504px minimum — the same overflow, more severe.
- **Compounding accessibility defect:** shadcn's `Table` wraps its `<table>` in `<div data-slot="table-container" className="relative w-full overflow-x-auto">` with **no `tabindex` or other keyboard-focus mechanism** — confirmed by reading `components/ui/table.tsx` directly (unmodified from the shadcn CLI's own output). A scrollable container with no way to receive keyboard focus cannot be scrolled by a keyboard-only user via arrow keys — there is no mouse-drag/touch-swipe equivalent available to that user. Given the overflow above is real and calculable (not hypothetical), this means the `Network`/`Status` values for at least the "Institutional Payout Destination" row are **genuinely unreachable for keyboard-only users** at 1024px and below — the severity rubric's own "inaccessible content" BLOCKER criterion, precisely.
- **Design rule violated:** `UI-01` §4/§5 measurement discipline (no "close enough" — an ~128px shortfall at a named, in-scope breakpoint is not marginal); WCAG-adjacent keyboard-operability expectation implicit in `.claude/skills/aix-ui-design/SKILL.md` point 12 ("Preserve accessibility — semantic HTML, keyboard navigation, focus states").
- **Recommended remediation scope:** a `PublicProductPreview`-scoped responsive restructuring of the table/detail-panel geometry (e.g., a narrower/abbreviated Network or Status presentation at constrained widths, a `tabIndex={0}` + visible focus style on the scroll container as a minimum-viable fix, or a different column strategy below `lg:`) — this is genuinely a design decision, not a one-line fix, so it is scoped as its own remediation turn rather than bundled.
- **Cross-section impact:** none — contained to `PublicProductPreview`. Directly refines/elevates the existing Phase 1G flag "destination-table fit at 1024px and on mobile" (`UI-02` §25) from an unverified calculated risk to a confirmed, precisely-measured defect.
- **User visual confirmation required:** yes, to confirm the actual rendered overflow behavior and to validate whichever remediation approach is chosen — the box-model math is exact, but the *chosen fix* needs visual review.

**UI-QA-003 — Site-wide repetition: 5 of 7 content sections share byte-identical eyebrow/heading typography, 3 of 4 icon-bearing sections share a byte-identical 40px marker, and 5 of 7 major page regions share one flat background**
- **Severity:** MEDIUM
- **Viewport(s):** all (a structural/pattern-level finding, not viewport-specific)
- **Component/section:** `PublicOperatingModel`, `PublicTrustControl`, `PublicCapabilities`, `PublicProductPreview`, `PublicFinalCta` (eyebrow/heading); `PublicOperatingModel`, `PublicTrustControl`, `PublicCapabilities` (icon marker); the whole page (background)
- **Observation/measured evidence:** `grep` across the five sections' source confirms the eyebrow paragraph (`text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase`) and the section heading (`mt-4 [max-w-…] text-[32px] leading-[1.15] font-semibold tracking-tight text-foreground md:text-[36px] lg:text-[40px]`) are **byte-identical class strings** in all five files. Separately, `PublicOperatingModel`, `PublicTrustControl`, and `PublicCapabilities` (3 of the page's 4 icon-bearing sections) all use the exact same `flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-[var(--marketing-surface)]` marker — confirmed byte-identical via `grep`. Separately again: of the page's 7 major regions (header, hero, and the 6 remaining sections plus footer, or equivalently the 6 non-hero/non-header sections), only `PublicFinalCta` departs from the base `--marketing-background` (using a full-bleed `--marketing-surface` tint) — the other 5 content sections plus the footer all render against the identical flat base color, with zero surface alternation across roughly two-thirds of the page's total scroll length.
- **Design rule violated:** `UI-01` §4's own anti-"AI look" list explicitly names "identical card treatment for every information type" and (implicitly, via its general intent) mechanical repetition as symptomatic of generic AI-generated UI — this is the same category of concern, applied to typography/marker/surface treatment rather than cards specifically. This turn's own brief explicitly asked to check for exactly this ("too many similar eyebrow-heading-copy stacks... 40px icon circles... excessive neutral sameness").
- **Recommended remediation scope:** a deliberate, design-level pass introducing *some* controlled variation across these five sections (varied heading treatment, marker treatment, or a second surface tone used more than once) — not a mechanical per-section tweak. Explicitly **not resolved or even attempted in this turn**, since this turn is QA-only.
- **Cross-section impact:** global — touches the same typographic/marker "system" used by five different components, so any remediation must be applied consistently across all of them, not just one.
- **User visual confirmation required:** yes — whether this repetition actually *reads* as monotonous (versus as intentional, disciplined consistency, which was this whole page's original design goal) is a judgment call that needs the user's own visual reaction, not something box-model math can settle on its own. Recorded as a finding to surface for that judgment, not a pre-judged verdict.

### 28.2 Refinements to existing flags (existing flag retained; new precision added)

**UI-QA-004 — refines Phase 1D's "desktop six-column process fit around 1024–1100px" (`UI-02` §22)**
- **Severity:** MEDIUM (elaborates, does not itself upgrade, the existing flag's severity — this turn does not reclassify Phase 1D's own risk, only adds precision)
- **Viewport(s):** 1024×768 specifically
- **Component/section:** `PublicOperatingModel`'s `DesktopProcessRow`
- **Observation/measured evidence:** the original Phase 1D estimate ("928px ÷ 6 ≈ 141px per column") did not subtract the `lg:gap-6` (24px) column gaps. Corrected: `928 − (5 × 24) = 808px`, ÷ 6 columns = **≈134.7px per column** — tighter than previously recorded. At that column width (minus the `li`'s own `px-2`, i.e. ≈119px of actual text width at 12px body copy), the longest step description ("AIX acts on an agency / back-to-back basis with approved external counterparties," 84 characters) wraps to an estimated **~5 lines**, versus the shortest ("Client instruction enters the controlled workflow," 52 characters) at an estimated **~3 lines**. Because the `<ol>` is a single-row CSS Grid with default `align-items: stretch` and no `justify-content` override, each `<li>` is stretched to the row's own height (set by the tallest column) while its content still packs from the top — so the number/marker/title stay aligned across all six columns, but the **empty space below each shorter column's description varies by roughly 2 lines' worth of height (~36–44px)** between the shortest and longest steps.
- **Design rule violated:** same as originally recorded in Phase 1D (`UI-01` §5, no "close enough"); this refinement adds that the risk is not just "tight" but produces an asymmetric, uneven-looking row.
- **Recommended remediation scope:** unchanged from Phase 1D's own original framing — a breakpoint/layout decision for this one component, not a global change.
- **Cross-section impact:** none — contained to `PublicOperatingModel`.
- **User visual confirmation required:** yes, as Phase 1D already stated — this turn only sharpens the arithmetic, it does not substitute for rendered confirmation.

**UI-QA-005 — partial downgrade candidate for Phase 1E's "large-desktop two-column width balance" (`UI-02` §23)**
- **Severity:** LOW (down from the implicit MEDIUM the original flag's phrasing suggested — see reasoning below; this is a downgrade *candidate*, not a closure, pending visual confirmation)
- **Viewport(s):** 1440×900 (and, by the same math, any width ≥1280px, since the container caps at `max-w-[1280px]`)
- **Component/section:** `PublicTrustControl`'s two-column grid
- **Observation/measured evidence:** at ≥1280px the container content width is fixed at 1280px (capped); `grid-cols-2`/`lg:gap-16` (64px) yields two **608px** tracks. The left (intro) column's own content is capped at `max-w-[480px]`(heading)/`max-w-[440px]`(copy) — narrower than its 608px track, as originally flagged. **However**, tracing the right column's own markup: the `<ol>`'s rows have no explicit width/flex-grow on their text wrapper `<div>` — only the description `<p>` itself carries `max-w-[440px]`. A plain flex child with no `flex-grow`/explicit width sizes to its own content (capped at 440px by the paragraph inside it), not to the full 608px track. This means the right column's actual rendered "ink" also caps at roughly the same **~440–500px** range as the left column — both columns leave a broadly similar amount of unused track width (~110–170px), rather than the right column stretching edge-to-edge as the original flag's phrasing ("right list feels excessively wide") implied. This is a real refinement, not a full resolution — line-wrapping specifics, font metrics, and the row icon+gap's own visual weight are not something box-model math alone can settle.
- **Design rule violated:** n/a — this entry narrows, rather than confirms, the originally-suspected violation.
- **Recommended remediation scope:** recommend re-verifying this flag first during rendered visual QA before scoping any remediation for it — it may need no change at all.
- **Cross-section impact:** none.
- **User visual confirmation required:** yes, explicitly — this is exactly the kind of finding this turn's own instruction anticipated ("Where exact measurement cannot be derived confidently: say VISUAL / REQUIRES RENDERED CONFIRMATION"). The box-model analysis narrows the concern but does not close it.

### 28.3 Accessibility findings

**UI-QA-006 — status-badge color independence is an accessibility positive, not a defect (informational, cross-referencing existing flag)**
- **Severity:** INFORMATIONAL
- **Component/section:** `PublicProductPreview`'s status `Badge`s (already flagged in Phase 1G, `UI-02` §25, as "status-badge color-neutral hierarchy" — a *visual-variety* concern)
- **Observation:** from an accessibility angle specifically (not the visual-variety angle Phase 1G recorded it under), using text-only differentiation rather than color-coding for status is the *correct* WCAG-aligned choice ("don't rely on color alone" for conveying information) — recorded here as a positive counterpoint so a future remediation doesn't "fix" Phase 1G's flag by adding color-only status differentiation, which would trade a visual-variety gap for a real accessibility regression.
- **Recommended remediation scope:** none required by this finding itself; informs how Phase 1G's own flag should be resolved (any added color differentiation must be paired with the existing text differentiation, never replace it).

**UI-QA-007 — mobile reading order is consistent and correct across every section (informational, clean pass)**
- **Severity:** INFORMATIONAL
- **Observation:** every section uses plain DOM order with CSS-only reflow (no `order-*` utility appears anywhere in `grep` across all `site/*.tsx` files) — the same Header→Hero→OperatingModel→TrustControl→Capabilities→ProductPreview→FinalCta→Footer sequence holds at every breakpoint, with no visual reordering. No defect found; recorded as a verified clean pass rather than left unstated.

### 28.4 Global rhythm findings (verified, no new defect beyond what §28.1/§28.2 already cover)

Computed every section-to-section combined gap (bottom padding of the section above + top padding of the section below) precisely: **Hero→OperatingModel:** 128/160/192px (mobile/tablet/desktop). **OperatingModel→TrustControl, TrustControl→Capabilities, Capabilities→ProductPreview:** all three boundaries are **identical**, 144/176/208px, because all four of those sections share byte-identical `pt-16 pb-20 md:pt-20 md:pb-24 lg:pt-24 lg:pb-28` values (the same repetition already recorded as UI-QA-003). **ProductPreview→FinalCta:** 144/176/208px (already flagged in Phase 1H, `UI-02` §26). **FinalCta→Footer:** 128/144/160px (already flagged in Phase 1I, `UI-02` §27, since the footer's `pt-12` is not responsive-stepped). No new global-rhythm defect beyond the already-recorded Phase 1H/1I flags and the UI-QA-003 repetition finding — this section exists to show the actual arithmetic behind "cumulative whitespace," not to introduce a new ID.

### 28.5 Global alignment findings

All seven sections plus the footer use the identical `mx-auto max-w-[1280px] px-4 md:px-8 lg:px-12` container class (verified via `grep` across every `site/*.tsx` file: byte-identical) — **no section drifts left/right relative to any other**; every section's left edge is governed by the same gutter value at every breakpoint. `PublicHero`'s and `PublicTrustControl`'s own left-aligned intro columns, and `PublicFooter`'s brand block, all begin at that same shared left edge (no additional offset/margin on any of them). **No alignment defect found.**

### 28.6 shadcn consistency findings

`Button`, `NavigationMenu`, `Sheet`, `Table`, `Badge` — reviewed for default-shadcn-look dominance. `Button`'s `rounded-lg` (10px, resolving to the shared `--radius` token) remains an out-of-scope, already-recorded deviation from `UI-02` §5's 8px "Standard" tier (Phase 1B) — still present, still not silently accepted, still out of scope for any single-component fix (it's a shared primitive). `Badge`'s default `rounded-4xl` pill radius remains a similarly-recorded, already-flagged deviation (Phase 1G). Neither is a *new* finding this turn — both are carried forward as already-open items, not re-litigated. No other shadcn primitive shows an unaddressed default-look pattern dominating the page.

### 28.7 Carried-forward flags — verified still open, no new evidence added this turn

Every flag below was re-checked against the current code (confirmed still present/applicable) and is **retained exactly as originally recorded** — none was discarded, none was resolved this turn:

- **Phase 1D** (`UI-02` §22): desktop six-column process fit around 1024–1100px — **see UI-QA-004 above for refined precision on this same flag.**
- **Phase 1E** (`UI-02` §23): mobile control-stack density; large-desktop two-column width balance — **see UI-QA-005 above for a partial-downgrade candidate on the second of these two.**
- **Phase 1F** (`UI-02` §24): mobile capability-list density/scroll length; matrix quadrant height imbalance; Exchange-boundary note prominence.
- **Phase 1G** (`UI-02` §25): destination-table fit at 1024px and on mobile — **superseded by UI-QA-002, CLOSED in UI Phase 1K (§28.9).** Sidebar/content proportion — **substantially addressed as a side effect of UI-QA-002's fix (the sidebar breakpoint move to `xl:`); see §28.9 for why this is not marked separately CLOSED without visual confirmation.** Demo-disclosure prominence; status-badge color-neutral hierarchy — **see UI-QA-006 above for an accessibility-positive counterpoint on this one.** Both remain OPEN.
- **Phase 1H** (`UI-02` §26): closing-section surface prominence vs. the hero; actions-column alignment at tablet width; regulatory-note visibility; cumulative vertical whitespace against `PublicProductPreview` — **quantified precisely in §28.4 above (144/176/208px).**
- **Phase 1I** (`UI-02` §27): footer navigation density on mobile; footer surface-boundary contrast; CTA-to-footer cumulative spacing — **quantified precisely in §28.4 above (128/144/160px)**; legal/boundary-text prominence; desktop column balance.

All carried-forward flags remain **status: OPEN**.

### 28.8 Recommended remediation grouping

- **Remediation A — Anchor scroll-offset compensation.** UI-QA-001 only. Single root-cause CSS fix (scroll-margin-top on the 5 anchor targets), low risk, no visual redesign.
- **Remediation B — Product Preview responsive/table restructuring (BLOCKER).** UI-QA-002 — **CLOSED in UI Phase 1K, see §28.9.** The still-open Phase 1G demo-disclosure-prominence and status-badge-hierarchy flags remain for a future pass (informed by UI-QA-006's accessibility counterpoint); sidebar/content proportion is likely improved as a side effect but not independently re-verified.
- **Remediation C — Operating Model desktop density.** UI-QA-004 (refined Phase 1D flag) — a breakpoint/layout decision specific to this one component.
- **Remediation D — Global rhythm & repetition.** UI-QA-003, the Phase 1H cumulative-whitespace flag, and the Phase 1I CTA-to-footer-spacing flag — all genuinely the same root category (section-boundary spacing and pattern variety), reviewed together rather than as isolated per-section tweaks.
- **Remediation E — Trust & Control / Capabilities polish.** UI-QA-005 (re-verify before touching), Phase 1F's matrix quadrant imbalance and Exchange-boundary-note prominence.
- **Remediation F — Final CTA / Footer closure polish.** The remaining Phase 1H flags (closing-section prominence, tablet action alignment, regulatory-note visibility) and Phase 1I flags (footer surface-boundary contrast, legal-text prominence, desktop column balance).

**No remediation was performed in this turn.** This section is a defect register only, per explicit instruction.

### 28.9 UI Phase 1K — Remediation B (UI-QA-002 closure record)

**Root cause:** the sidebar (`ContextRail`, `w-[200px]`) and the table+detail side-by-side split both activated at the identical `lg:` (1024px) breakpoint, so at exactly 1024px all three (200px sidebar, table, 280px detail panel) competed for the same 928px of available width at once — the table's own minimum unwrapped content (≈504px) could not fit in the ≈376px that remained after the sidebar and detail panel took their share.

**Fix — cascading responsive restructuring (per this turn's required strategy: hide sidebar first, then allow table+detail side by side if that fits, only falling back to accessible scroll where content genuinely cannot fit):**

- `ContextRail`'s wrapper: `hidden w-[200px] shrink-0 border-r border-border p-4 lg:block` → `hidden w-[200px] shrink-0 border-r border-border p-4 xl:block` (Tailwind's default `xl:` = `@media (min-width: 80rem)` = exactly 1280px, confirmed in the compiled CSS — no custom breakpoint config exists in this project).
- `PreviewShell`'s sidebar+content outer row: `flex flex-col lg:flex-row` → `flex flex-col xl:flex-row` (kept in step with the sidebar's own new breakpoint).
- The table+detail-panel inner row's own breakpoint (`lg:flex-row`, `lg:w-[280px]` on the detail panel) was **deliberately left unchanged** — proven below to fit cleanly once the sidebar is out of the way, satisfying the "if that fits cleanly" branch of the required strategy without needing to fall back to stacking.
- `components/ui/table.tsx`'s `Table` container: added `role="region"`, `aria-label="Scrollable table"`, `tabIndex={0}`, and `focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50` (mirroring `Button`'s own existing focus-visible treatment for site-wide consistency) — the WAI-ARIA APG's own recommended pattern for a scrollable-table wrapper. Applied to the **shared** primitive (not a page-specific wrapper), so every current and future use of `Table` benefits, not only this one page.

**Width arithmetic proving the ~128px 1024px shortfall is resolved** (all values re-derived from the actual current compiled CSS, same estimation methodology as the original UI-QA-002 finding, so the comparison is apples-to-apples — the table's own minimum unwrapped content width, ≈504px, is unchanged, since no font size, padding, or truncation was altered, per explicit instruction):

| Viewport | Sidebar | Available table width | vs. ≈504px minimum |
|---|---|---|---|
| 1024px (constrained desktop, sidebar hidden) | none | 1024 − 96 (gutter) = 928 → 928 − 48 (`p-6`) = 880 for table+detail → 880 − 280 (detail) − 24 (gap) = **576px** | **+72px margin** |
| 1280px (`xl:`, sidebar visible) | 200px | container capped at 1120 (shell max-width) − 200 (sidebar) = 920 → 920 − 48 (`p-6`) = 872 for table+detail → 872 − 280 − 24 = **568px** | **+64px margin** |
| 1279px (just below `xl:`, sidebar hidden) | none | container capped at 1120 − 48 = 1072 for table+detail → 1072 − 280 − 24 = **768px** | **+264px margin** |
| 768px (tablet, stacked — table gets full width) | none | 768 − 64 (`md:` gutter) = 704 → 704 − 48 = **656px** | **+152px margin** |
| 584px (calculated crossover point, 16px gutter, stacked) | none | 584 − 32 − 48 = **504px** | **0px — exact threshold** |
| 430px / 390px (tested mobile viewports) | none | ≈398/358 − 32 − 48 = **≈318/278px** | **shortfall remains — genuine, unavoidable given content length** |

**Conclusion:** the specific defect UI-QA-002 named — the 1024–1100px range — is fully resolved with a real, positive margin (+72px at the tightest point in that range, 1024px itself). **Below ≈584px (i.e., the tested 430px/390px viewports and phones generally in that range), horizontal scroll remains genuinely unavoidable** — the table's own content is simply wider than those viewports can show unwrapped, regardless of layout, confirming this turn's own instruction ("If horizontal scrolling remains genuinely necessary at narrower widths: the scroll region must be keyboard-accessible") was the correct fallback to apply there, not a failure to eliminate all overflow everywhere.

**Full breakpoint behavior (7-viewport matrix):**
- **1440×900 / 1280×800:** full shell — sidebar (200px) + table + detail panel (280px), all side by side (both ≥`xl:`/1280px).
- **1024×768:** sidebar hidden; table + detail panel side by side, **576px available for the table (verified above, no overflow).**
- **834×1194 / 768×1024:** sidebar hidden (below `lg:`); detail panel stacks below the table (below `lg:flex-row`'s own threshold); table gets full content-column width, **656px+ available (no overflow).**
- **430×932 / 390×844:** sidebar hidden; detail panel stacked; table's own overflow-x-auto activates (content genuinely exceeds available width) — **now keyboard-reachable** via the container's `tabIndex={0}`/`role="region"`/visible focus ring.

**Accessibility fix:** `tabIndex={0}` + `role="region"` + `aria-label="Scrollable table"` + a visible `focus-visible` ring (matching `Button`'s existing treatment) on `components/ui/table.tsx`'s scroll container — a keyboard user can now `Tab` to the region and use arrow keys to reveal the `Network`/`Status` columns whenever they are genuinely off-screen. **Trade-off, recorded rather than silently accepted:** the container is always focusable, even at widths where nothing actually overflows (e.g. 1024px+, per the table above) — a widely-accepted pattern in production use, since detecting *actual* overflow at runtime would require `ResizeObserver`-based measurement, which was judged unnecessary complexity for this turn's scope.

**Demo data preservation:** all three destination rows (USDT Treasury Wallet/TRC-20/Active; BTC Settlement Wallet/Bitcoin/Pending Approval; Institutional Payout Destination/Bank Transfer/Evidence Required) and the selected detail panel's content (BTC Settlement Wallet, Bitcoin, masked address, Cooling-Off Complete, Pending Checker Review) are byte-identical to before this remediation — verified against the rendered HTML. No font size, padding, or truncation was altered anywhere, per explicit instruction — the fix works entirely by increasing available width, never by shrinking content.

**Status colors:** unchanged — `Badge` `variant="outline"` remains uniform across all three statuses; no color semantics introduced this turn.

**Quality gates:** `typecheck:web`/`lint:web`/`build:web` all re-run clean on the final code.

**UI-QA-002: CLOSED.** Both required conditions are met: (1) the responsive-overflow defect at the named 1024–1100px range is resolved with a positive, calculated margin; (2) the keyboard-accessibility defect is resolved for every width, including the (narrower than originally scoped, now precisely bounded) range where overflow genuinely remains unavoidable.
