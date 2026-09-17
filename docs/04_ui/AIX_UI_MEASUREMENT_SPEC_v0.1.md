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
