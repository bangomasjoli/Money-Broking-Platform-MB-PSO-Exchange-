---
document_id: UI-03
title: AIX UI Frontend Technical Foundation
version: v0.1
document_status: DRAFT
implementation_status: IN_PROGRESS
module: N/A
control: UI design governance — frontend runtime/toolchain foundation (Next.js, Tailwind, shadcn/ui, npm workspace integration)
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 38c260c
---

# AIX UI Frontend Technical Foundation

**Status: CONTROLLED IMPLEMENTATION FOUNDATION.** This document records the
technical decisions behind `platform/apps/web/` — the AIX frontend runtime.
**It records a toolchain, not a visual design.** No page design, no color
palette, no font, and no component library beyond a single foundational
primitive is approved here. See
[`AIX_UI_DESIGN_FOUNDATION_v0.1.md`](AIX_UI_DESIGN_FOUNDATION_v0.1.md)
(`UI-01`) and [`AIX_UI_MEASUREMENT_SPEC_v0.1.md`](AIX_UI_MEASUREMENT_SPEC_v0.1.md)
(`UI-02`) for the still-separately-governed direction and measurements this
foundation will eventually be built out to satisfy.

---

## 1. Repository / Package-Manager Inspection

Inspected before any edit: `platform/package.json` declares npm workspaces
(`"workspaces": ["packages/*", "services/*"]`) with a single npm lockfile
(`platform/package-lock.json`, npm-specific format — confirms npm, not
pnpm/yarn/bun, is the repository's authoritative package manager). No
root-level `package.json` exists above `platform/` — `platform/` is the
sole JS/TS workspace root for the entire repository. `engines.node` is
`>=20`; the actual toolchain used for this turn was Node v24.18.0 / npm
11.16.0.

## 2. Frontend Package Architecture

**Decision: `platform/apps/web/`, added as a new `apps/*` glob to
`platform/package.json`'s existing `workspaces` array — a one-line
addition, not a workspace overhaul.** `platform/package.json` now reads
`"workspaces": ["packages/*", "services/*", "apps/*"]`. The single existing
lockfile (`platform/package-lock.json`) is used; no second lockfile was
created. `npm install` was run from the workspace root (`platform/`), never
from inside `apps/web/`.

**Rejected alternative:** a fully separate repository/package-manager
setup for the frontend was considered and rejected — it would duplicate
dependency governance, introduce a second lockfile the backend's own
tooling has no visibility into, and contradict the explicit instruction to
use the repository's existing package manager. Adding one workspace glob
is a minimal, well-understood, reversible change — not the
"architecture-change-larger-than-this-turn" case that would have required
stopping.

**Structural separation:** `platform/services/*` (backend), `platform/apps/*`
(frontend) — parallel, sibling top-level directories under the same
workspace root, making backend/frontend ownership unambiguous at a glance.

## 3. Scaffolding Method

Used `create-next-app@16.3.5` (the current version at the time of this
turn, verified against the live npm registry rather than assumed from
memory) with explicit non-interactive flags:

```
npx create-next-app@16.3.5 apps/web --ts --tailwind --eslint --app --empty \
  --import-alias "@/*" --use-npm --skip-install --disable-git --yes
```

- `--empty` — the current flag for a genuinely minimal scaffold (a bare
  `<div>Hello world!</div>` page, no Next.js/Vercel demo logos or links,
  no `public/` assets). This is why no default-demo removal was needed —
  none was generated.
- `--skip-install` — scaffolding only; dependencies were installed
  afterward from the workspace root so the single lockfile updated
  correctly, not a second one inside `apps/web/`.
- `--disable-git` — critical in a monorepo: without this flag,
  `create-next-app` would initialize a **nested git repository** inside
  `apps/web/`, which would silently make every frontend file invisible to
  the outer repository unless separately added as a submodule.
- No `--src-dir` — `app/`, `components/`, `lib/` sit directly under
  `apps/web/`, matching this turn's proposed structure exactly (not
  nested under `src/`).
- No React Compiler, no Rspack — neither was requested; both add moving
  parts a foundation turn does not need.

**`next.config.ts`** was left at its scaffolded default (`{}`, no options
set) — no configuration was required for this foundation.

## 4. Installed Versions (exact, as resolved into the lockfile)

All current-stable versions, verified against the live npm registry at
implementation time (not assumed from training-data memory) and confirmed
against the actual resolved lockfile entries via `npm ls`:

| Package | Version | Role |
|---|---|---|
| `next` | 16.3.5 | Framework (App Router) |
| `react` / `react-dom` | 19.2.8 | UI runtime |
| `typescript` | 5.9.3 (declared `^5`) | Language — **kept on the 5.x line**, not bumped to the new TypeScript 7.x major (a native-code rewrite that shipped very recently), to avoid running two structurally different type-checker toolchains (backend is TS `^5.7.0`) in one monorepo during a foundation turn |
| `tailwindcss` | 4.3.3 | Styling engine (v4 — CSS-first, no `tailwind.config.js` content globs) |
| `@tailwindcss/postcss` | 4.3.3 | Tailwind v4's PostCSS integration |
| `eslint` | 9.39.5 | Lint |
| `eslint-config-next` | 16.3.5 | Next.js's own lint ruleset |
| `shadcn` | 4.21.0 (CLI) | Component-foundation scaffolding tool |
| `radix-ui` | 1.6.7 | Consolidated Radix UI primitives package (the current official distribution — superseded the many individual `@radix-ui/react-*` packages) |
| `lucide-react` | 1.46.0 | Icon components |
| `class-variance-authority` | 0.7.1 | Variant-driven component styling (shadcn's `cva` pattern) |
| `cn` | 0.3.0 | Official shadcn-maintained `clsx` + `tailwind-merge` replacement (verified via npm registry metadata: maintained by the shadcn project itself, zero runtime dependencies) |
| `tw-animate-css` | 1.4.0 | Tailwind v4-compatible animation utility layer, pulled in by shadcn's own generated CSS |

No floating/unpinned versions were hand-written — every version above is
exactly what the lockfile resolved to; reproducibility comes from the
committed `platform/package-lock.json`, not from re-resolving ranges later.

## 5. TypeScript Model

**`apps/web/` is deliberately NOT added to `platform/tsconfig.json`'s
project-reference graph** (`tsc -b`, used by the backend's `packages/*` and
`services/*`). Next.js apps manage their own incremental type checking
(via `next build`/`next typegen`) and are not idiomatically composed into a
`composite`/declaration-emitting reference graph the way backend libraries
are — forcing it in would be non-standard and was rejected. `apps/web/`
has its own independent, strict `tsconfig.json` (scaffolded by
`create-next-app`, unmodified): `strict: true`, `noEmit: true`,
`moduleResolution: "bundler"`, `jsx: "react-jsx"`, import alias `@/*`
resolving to `./*`.

**Real, empirically-found ordering issue and its fix:** the scaffolded
`app/layout.tsx` used Next 16's `LayoutProps<"/">` global type, which is
generated by Next.js's own route-type codegen (`.next/types/`) — it does
**not** exist until that codegen has run at least once, so a cold
`tsc --noEmit` failed with `Cannot find name 'LayoutProps'`. The correct
fix (found via `next --help`, not assumed) is Next 16's dedicated
`next typegen` command ("Generate TypeScript definitions for routes,
pages, and layouts without running a full build") — `apps/web/package.json`'s
`typecheck` script is `next typegen && tsc --noEmit`, and `layout.tsx`
keeps the officially-scaffolded `LayoutProps<"/">` pattern rather than
reverting to an older manual prop type. This is exactly the kind of
Next-16-differs-from-training-data case `AGENTS.md` (§10 below) warns
about — verified by running the actual tool, not assumed.

## 6. App Router

Confirmed: App Router (`app/`), not Pages Router — no repository constraint
required otherwise. `app/layout.tsx` is the root layout; `app/page.tsx` is
the sole route, the smoke page (§9).

## 7. Directory Structure

```
platform/apps/web/
  app/
    globals.css
    layout.tsx
    page.tsx
  components/
    ui/
      button.tsx        # the one component shadcn init generated
  lib/
    utils.ts            # re-exports `cn` from the `cn` package
  components.json        # shadcn CLI configuration
  eslint.config.mjs
  next.config.ts
  next-env.d.ts           # generated, gitignored
  postcss.config.mjs
  tsconfig.json
  package.json
  README.md
  AGENTS.md               # generated by Next.js itself, see §10
  CLAUDE.md                # `@AGENTS.md` — a one-line include
  .gitignore
```

No `trading/`, `wallet/`, `aml/`, `compliance/`, or `admin/` folders were
pre-created — those are created only when those scopes are actually
implemented, per this turn's explicit instruction. No `public/` directory
exists — `--empty` generated none, and nothing yet needs a static asset.

## 8. Import Aliases

`@/*` → `./*` (the `create-next-app` default, matching this turn's
preference exactly). shadcn's own `components.json` records the
conventional sub-aliases on top of it: `@/components`, `@/components/ui`,
`@/lib`, `@/lib/utils`, `@/hooks` (the last currently has no directory
behind it — created lazily when the first hook is added, not pre-created
empty).

## 9. shadcn/ui Initialization

Run from inside `apps/web/`:

```
npx shadcn@4.21.0 init -t next -b radix --no-monorepo --preset nova -y
```

**Genuinely new CLI behavior found by inspection, not memory:** this
version of the `shadcn` CLI (4.21.0) requires selecting one of eight named
presets (`nova`, `vega`, `maia`, `lyra`, `mira`, `luma`, `sera`, `rhea`) to
initialize at all — there is no flag-driven "neutral/blank" path, and
`--preset custom` (the interactive menu's escape-hatch label) is not a
valid non-interactive value (`Invalid preset: custom`). **`nova`** was
selected because it is the CLI's own first-listed/default preset and pairs
with Lucide icons — already the icon source this project's docs named as
"likely" (`UI-02` §14) — avoiding an unnecessary icon-library mismatch.
`-b radix` selects the Radix-primitives base (the traditional, most mature
accessible-primitives pairing for shadcn) over the CLI's newer `base`/`aria`
alternatives. `baseColor: "neutral"` and `--css-variables` (default) were
used — `components.json` confirms `"baseColor": "neutral"`.

**The preset's actual color values were then treated as scaffolding, not
accepted as AIX styling** (§11) — this satisfies "do NOT accept default
shadcn styling as AIX styling" precisely because the values were inspected
before being trusted, and two problems were found and corrected rather
than shipped as-is:

1. The `nova` preset wires in Google's **Geist** font by default
   (`app/layout.tsx` imported `next/font/google`'s `Geist` and set
   `--font-sans` to it) — a real, undocumented branding decision. **Removed**
   — see §12.
2. Dark mode's `--sidebar-primary` was the *one* chromatic value
   (`oklch(0.488 0.243 264.376)`, a real blue-violet) among ~40 otherwise
   fully achromatic (`oklch(_ 0 0)`) tokens — an unintentional-looking
   stray accent color on an unused (not-yet-installed) sidebar component.
   **Neutralized** to match its achromatic siblings, documented inline in
   `globals.css`.

`shadcn init` created exactly two files: `components/ui/button.tsx` and
`lib/utils.ts` — a single foundational primitive, not "a library of
unnecessary components." **Nothing was removed here** — a single Button
primitive is precisely the minimal foundation this turn's own instructions
call for, and no other demo/example component was generated to begin with.

**Runtime dependencies added by `shadcn init`** — `class-variance-authority`,
`cn`, `lucide-react`, `radix-ui`, `shadcn` itself, `tw-animate-css` — were
each individually checked against npm registry metadata before being
trusted (maintainer identity, dependency count, description) rather than
accepted blindly; all are official, current shadcn/Radix-ecosystem
packages (§4 records exactly what each is).

## 10. Next.js's Own `AGENTS.md` / `CLAUDE.md`

Next.js 16 itself generates `apps/web/AGENTS.md` (and Claude Code reads it
via the one-line `apps/web/CLAUDE.md` → `@AGENTS.md` include this project's
harness supports) — a self-regenerating file (confirmed: it is rewritten
by `next dev`/`next build`, per its own text and
`node_modules/next/dist/server/lib/generate-agent-files.js`) that warns
coding agents Next.js 16 has breaking changes versus older training data
and to consult `node_modules/next/dist/docs/` before writing code. **Kept**
— this is Next.js's own safety mechanism, not project bloat, and it is
exactly the caution that surfaced the real `LayoutProps`/`next typegen`
issue in §5. It does not duplicate `.claude/skills/aix-ui-design/SKILL.md`
(that skill governs AIX-specific design discipline; this file governs
generic Next-16-version awareness).

## 11. Design-Token Scaffolding

`app/globals.css` carries the full semantic token set shadcn's `nova`
preset generated — `background`, `foreground`, `card`, `popover`,
`primary`, `primary-foreground`, `secondary`, `muted`, `muted-foreground`,
`accent`, `destructive`, `border`, `input`, `ring`, `chart-1..5`,
`sidebar*`, plus a `radius` scale — which already meets and exceeds this
turn's example category list (`background`/`foreground`/`surface`/
`surface-elevated`/`border`/`primary`/`primary-foreground`/`muted`/
`muted-foreground`/`success`/`warning`/`danger`; `success`/`warning`/
`danger` specifically are **not yet present** as named tokens — they exist
only implicitly via `destructive` — and are flagged as a deferred decision,
§18). **Every value is explicitly labeled `PROVISIONAL FOUNDATION VALUES`**
in a header comment at the top of `globals.css`, referencing `UI-01`
§10 and `UI-02` §17, and stating plainly that no final AIX palette exists.
Spacing/geometry are explicitly **not** reimplemented as custom Tailwind
utilities here — `UI-02`'s 4px-unit system remains the sole authority for
that, unduplicated.

## 12. Final-Color / Final-Font Status

**FINAL AIX COLOR PALETTE: PENDING DESIGN APPROVAL.** The `nova` preset's
achromatic neutral grayscale is used as inert scaffolding only (§11); no
hex/oklch value in `globals.css` is presented as, or should be read as,
an approved AIX color.

**FINAL AIX FONT: PENDING DESIGN APPROVAL.** `app/layout.tsx` carries this
exact statement in a header comment. The Geist font import shadcn's `nova`
preset wired in was removed; `font-sans` now resolves to Tailwind v4's own
built-in default system-ui stack — a safe technical placeholder, not a
design choice.

## 13. Root Smoke Page

`app/page.tsx` — an intentionally minimal, text-only page (`<h1>`/`<p>`,
Tailwind spacing/type utility classes only, **no shadcn component used**,
so nothing on the page could be mistaken for an approved visual
treatment) stating: *"AIX frontend foundation is initialized."* / *"This
is a technical smoke page, not an approved UI design."* Verified rendering
correctly by starting a real `next dev` server and fetching it — `HTTP
200`, exact expected HTML content present in the response body (§14).

## 14. Verification Performed

- `next typegen && tsc --noEmit` (via `npm run typecheck:web`) — **0
  errors**, after the §5 fix.
- `eslint` (via `npm run lint:web`) — **0 issues**, zero output.
- `next build` (via `npm run build:web`) — **succeeded**, both routes
  (`/` and the built-in `/_not-found`) statically prerendered, Turbopack
  build in 2.6s.
- `next dev` started for real (port 34117, isolated from any default
  port), `curl`'d directly — **HTTP 200**, response body independently
  confirmed to contain the exact smoke-page text from §13, confirming the
  running dev server (not merely the build step) genuinely serves the app.
  Process cleanly terminated afterward.

## 15. Accessibility Baseline

Semantic HTML preserved (`<html lang="en">`, `<main>`, `<h1>`/`<p>`
hierarchy on the smoke page); no accessibility-related ESLint rule was
disabled or weakened (`eslint-config-next`'s defaults, including its
`jsx-a11y`-derived rules, are untouched). shadcn's Radix-primitive base
(§9) carries mature accessibility behavior (focus management, ARIA
attributes, keyboard interaction) into every future component built on it
— a material reason `-b radix` was chosen over the CLI's newer
alternatives. Reduced-motion compatibility is available for later
animation work via `tw-animate-css`'s own `prefers-reduced-motion` support
(already present in `node_modules/shadcn/dist/tailwind.css`'s `shimmer`
utility, §9) — nothing animated exists yet to test against it.

## 16. Responsive Baseline

Next.js's default `<meta name="viewport">` (confirmed present in the
rendered HTML, §14) is correct out of the box — no manual meta-tag
authoring was required. No component-level breakpoints are implemented in
this turn; `UI-02`'s measured responsive rules (desktop/tablet/mobile
behavior per component) remain the sole authority for that work once
components exist to apply them to.

## 17. No Backend API Coupling / Frontend Security Boundary

No backend service source is imported from `apps/web/` — verified: no
`import` anywhere in `apps/web/` references `platform/services/**` or
`platform/packages/**`. No API client, no backend URL configuration, and
no fake/invented API contract was created — Next.js required none of this
to build or run. No frontend `.env` file was created (none was technically
necessary); if one is ever added, it must carry **only** safe public,
non-secret placeholders — `DATABASE_URL`, any internal service token, the
perimeter token, and the IAM introspection token must never appear in
frontend configuration. **Documented rule: anything bundled to the browser
is public** — no regulated/backend secret may ever be referenced from a
Client Component. No such reference exists today because no backend
integration exists today.

## 18. Known Deferred Decisions

Recorded explicitly, not silently left implicit:

- Final AIX color palette (§12) and font (§12) — both `PENDING DESIGN
  APPROVAL`.
- `success`/`warning`/`danger` are not yet distinct named semantic tokens
  (§11) — only `destructive` exists today; adding the other two role
  tokens (values still provisional) is deferred to when they are actually
  needed by a real component.
- The Phantom-inspired floating-pill navigation (`UI-02` §10) — not
  implemented; Phase 1B.
- Testing status: **no frontend test runner is installed** — this
  foundation turn did not add Vitest/Playwright/Testing Library for the
  frontend; establishing one is deferred to a later turn once there is
  real component behavior worth testing.
- Screenshot-based visual-QA tooling status: **not installed** — `UI-01`
  §7/§8 requires it before page acceptance, but no page exists yet to
  QA; tooling selection is deferred alongside the first real page turn.
- API integration status: **none** — §17.
- `success`/`warning`/`danger` color roles, the exact `--radius` base
  value's relationship to `UI-02` §5's radius hierarchy, and Tailwind v4
  theme mapping for `UI-02`'s 4px spacing scale are all **not yet
  reconciled** between this file's inherited shadcn defaults and `UI-02`'s
  own specification — flagged for the first turn that builds a real
  component against both documents simultaneously.

## 19. Phase 1B — Floating-Pill Public Navigation

**Status: IMPLEMENTED, PENDING USER VISUAL REVIEW.** The first real AIX
visual component — `platform/apps/web/components/site/public-header.tsx`,
exporting `PublicHeader`. Full geometry record, revision notes, and
findings: `AIX_UI_MEASUREMENT_SPEC_v0.1.md` ("UI-02") §10.6. This section
records the technical/component-structure side only.

**shadcn components added** (pinned CLI `shadcn@4.21.0`, matching the
version already established in Phase 1A — not an unversioned `@latest`
invocation): `navigation-menu` and `sheet`. `button` was requested in the
same command and correctly **skipped by the CLI itself** ("files might be
identical") — direct, tool-verified confirmation that search-before-create
worked: no duplicate `Button` was generated. No other shadcn component was
added — `separator` was considered (listed as a "possibly" candidate) but
not used anywhere in the implemented header, so it was not installed, per
the shadcn-first policy's "add a component only when a real current
screen/component requires it" (`UI-01` §2.1).

**Component structure:**

```
components/
  ui/
    button.tsx            # Phase 1A, unmodified
    navigation-menu.tsx    # Phase 1B, unmodified shadcn source
    sheet.tsx               # Phase 1B, unmodified shadcn source
  site/
    public-header.tsx       # Phase 1B — the domain component (PublicHeader)
```

`public-header.tsx` composes the three `ui/` primitives directly — no
`AixXxx` rename-wrapper was created around any of them individually; the
one new domain component (`PublicHeader`) is named by role, not
implementation detail, per the shadcn-first policy's naming rule.

**Root page:** `app/page.tsx` replaced with a Phase 1B preview
(`Home` — unnamed-export retained implicitly via the default export
convention) rendering only `<PublicHeader />` plus a tall blank scroll
region, explicitly to validate the fixed-position header through scroll —
not a hero, not a dashboard, not marketing copy, per this turn's explicit
scope.

**New provisional tokens** (`app/globals.css`): `--marketing-background`
and `--marketing-surface` — deliberately **separate** from the shared
`--background`/`--card` tokens (§11 of this document), because the
requested "very soft cool lavender" public-site background direction must
not leak into the shared token set future authenticated-platform screens
also depend on (`UI-01` §3's public-vs-authenticated distinction). Values
are an independently-chosen low-chroma lavender (`oklch(0.975 0.008 296)`
background, `oklch(0.995 0.002 296)` surface) — explicitly not sampled
from `REF-UI-001`'s Phantom screenshot.

**Verification performed** (full detail in `UI-02` §10.6): `typecheck:web`
0 errors, `lint:web` 0 issues (after fixing one real finding — internal
`href="/"` must use `next/link`'s `Link`, not a bare `<a>`, per
`@next/next/no-html-link-for-pages`), `build:web` succeeded. Live `next
dev` server started on an isolated port, fetched via `curl`: HTTP 200,
full structural HTML review performed (single `<nav aria-label="Primary">`
landmark confirmed after the accessibility fix, inert CTA buttons
confirmed to carry no `href`/route). Every governed dimension
independently re-verified against the **actual compiled Tailwind CSS
output** (byte-offset inspection of the generated stylesheet), not
inferred from class names alone.

**No screenshot was captured by this implementation turn** — no
browser-automation/screenshot tool was available in this environment, and
installing one solely for screenshots was explicitly out of scope. The
source/computed-geometry review above is the documented substitute for
that turn, not a claim of equivalent confidence to an actual rendered
screenshot. The user subsequently performed real-browser visual QA
directly (see below) — screenshot acceptance is no longer pending.

**REF-UI-001's approved scope is unchanged**: floating pill navigation
treatment only. Nothing in this implementation claims to be, or was built
from, Phantom's logo, palette, typography, exact measurements, search
control, or CTA design — see the "what AIX takes / does not take" analysis
already recorded in `UI-02` §18, which this implementation follows.

**Remediation 01 update:** the 768–1023px tablet concern flagged above was
confirmed by user visual QA — the `md:` (768px) full-desktop threshold was
visibly compressed. The threshold is now `lg:` (1024px); see `UI-02` §10.7
for the full empirical record.

**Visual acceptance:** following Remediation 01, user visual review
passed at 1440px, 1024px, 768px (compact treatment), and 430/440px.
**AIX UI PHASE 1B: VISUALLY ACCEPTED** — accepted implementation baseline
`47c0f1a` (implementation `537c71d` + remediation `47c0f1a`); see `UI-02`
§10.8 for the full record. This acceptance covers only the public header
component — not a final color palette, final font, final brand asset, or
the full public website, all of which remain pending; shrink-on-scroll
remains explicitly deferred.

## 20. Phase 1C — Public Landing Hero

**IMPLEMENTED, PENDING USER VISUAL REVIEW** —
`platform/apps/web/components/site/public-hero.tsx` (`PublicHero`). Header
+ hero only, per this turn's scope; `PublicHeader` (VISUALLY ACCEPTED,
`47c0f1a`) was consumed, not redesigned. Full geometry, copy, and status
detail recorded in `UI-02` §21 rather than duplicated here.

**No new dependency, package, or shadcn component was added.** Only the
already-installed `Button` (shadcn) and `lucide-react` icons (`CheckCircle2`,
`Clock`, `Circle` — verified to exist in the installed `lucide-react`
version before use) are used. `platform/package-lock.json` is unchanged.

**Root page** (`app/page.tsx`) replaced the Phase 1B review scaffold:
now renders `PublicHeader` + `PublicHero`, plus a minimal blank scroll
area explicitly labeled as a preview boundary — not the next homepage
section.

**A real measurement defect was found and fixed during implementation:**
the product-preview panel's initial `rounded-xl` class was verified
against the compiled CSS to resolve to 14px (`var(--radius)×1.4`), not
this document's own `UI-02` §5 governed 12px "Cards/panels" tier — fixed
to an explicit `rounded-[12px]`, re-verified against the compiled output.

**Quality gates, all independently run and passing on the final code:**
`typecheck:web` 0 errors, `lint:web` 0 issues, `build:web` succeeded (both
routes statically prerendered). **No backend regression required:**
`package-lock.json` unchanged, no `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**` file
touched.

**No screenshot was captured** — no browser-automation/screenshot tool
was available, and installing one solely for this purpose remained out of
scope. Verification performed instead: rendered-HTML structural review
(single `<nav>` landmark preserved, one `<h1>`, correct heading nesting to
the panel's `<h2>`, all 4 decorative icons `aria-hidden`) and compiled-CSS
byte-level confirmation of every governed arbitrary value (`pt-[120px]`,
`lg:pt-[136px]`, `max-w-[1280px]/[560px]/[480px]/[420px]`, `h-12`, `px-6`,
`gap-4`, `lg:gap-16`, `text-[40px]`/`lg:text-[56px]`, `rounded-[12px]`) —
not a claim of equivalent confidence to an actual rendered screenshot.
**VISUAL ACCEPTANCE: PENDING USER REVIEW.**

**Remediation 01 update:** user visual QA found two defects, both
corrected in `public-hero.tsx` — (1) "digital-asset" splitting across its
internal hyphen at 1440px/430px, fixed via `whitespace-nowrap` on that
term only (no `<br>`, no viewport-hard-coded lines, text content
unchanged); (2) the tablet (768–1023px) product-preview panel centered
beneath left-aligned copy, fixed by changing its wrapper from
`justify-center`-below-`lg:` to an unconditional `justify-start`, aligning
it to the same grid left edge as the copy column via normal flexbox
alignment only. No other Phase 1C geometry, wording, or breakpoint
changed; see `UI-02` §21.1 for the full record. Quality gates re-run
clean; `package-lock.json`/backend unchanged, no regression required.
**VISUAL ACCEPTANCE: still PENDING USER REVIEW.**

**Visual acceptance:** following Remediation 01, user visual review
passed at 1440px, 1024px, 768–1023px, and 430px. **AIX UI PHASE 1C:
VISUALLY ACCEPTED** — accepted implementation baseline `ddc33a4`
(implementation `1f9a49b` + remediation `ddc33a4`); see `UI-02` §21.2 for
the full record. This acceptance covers only the header + hero — not a
final color palette, final font, final brand asset, the full public
website, remaining homepage sections, production API wiring, live
onboarding, or live product workflows, all of which remain pending.

## 21. Phase 1D — Public Operating Model Section

**IMPLEMENTED, PENDING USER VISUAL REVIEW** —
`platform/apps/web/components/site/public-operating-model.tsx`
(`PublicOperatingModel`). One homepage section only ("How AIX Works"),
below the accepted hero; `PublicHeader`/`PublicHero` were consumed, not
redesigned. Full geometry, copy, regulatory-terminology validation, and
status detail recorded in `UI-02` §22 rather than duplicated here.

**No new dependency, package, or shadcn component was added.** Only the
already-installed `lucide-react` icons (`ClipboardList`, `ShieldCheck`,
`Wallet`, `ArrowLeftRight`, `BadgeCheck`, `FileText` — verified to exist
in the installed version before use) are used; `Separator`/`Badge`/
`Tooltip` were considered per this turn's shadcn policy and judged
unnecessary. `platform/package-lock.json` is unchanged.

**Root page** (`app/page.tsx`) adds `PublicOperatingModel` below
`PublicHero`; no further homepage section was added.

**Quality gates, all independently run and passing on the final code:**
`typecheck:web` 0 errors, `lint:web` 0 issues, `build:web` succeeded (both
routes statically prerendered). **No backend regression required:**
`package-lock.json` unchanged, no `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**` file
touched.

**No screenshot was captured** — no browser-automation/screenshot tool
was available, and installing one solely for this purpose remained out of
scope. Verification performed instead: rendered-HTML structural review
(exactly one of the three responsive `<ol>` variants visible per
viewport, correct heading nesting, all decorative icons `aria-hidden`,
step copy byte-verified against the intended wording) and compiled-CSS
byte-level confirmation of every governed value (`pt-16`/`md:pt-20`/
`lg:pt-24`, `pb-20`/`md:pb-24`/`lg:pb-28`, `max-w-[720px]`,
`text-[32px]`/`md:text-[36px]`/`lg:text-[40px]`, `lg:gap-6`, `size-10`,
`size-5`) — not a claim of equivalent confidence to an actual rendered
screenshot. The desktop 6-column row's fit at exactly 1024–1100px is
flagged as a specific open question for the user's visual review (`UI-02`
§22). **VISUAL ACCEPTANCE: PENDING USER REVIEW.**

## 22. Phase 1E — Public Trust, Governance & Control Section

**IMPLEMENTED, VISUAL QA DEFERRED** —
`platform/apps/web/components/site/public-trust-control.tsx`
(`PublicTrustControl`). One homepage section ("Trust & Control"), below
`PublicOperatingModel`; `PublicHeader`/`PublicHero`/`PublicOperatingModel`
were consumed, not redesigned. Full geometry, copy, regulatory/claim
discipline, and the visual-risk register are recorded in `UI-02` §23
rather than duplicated here.

**Full visual QA is intentionally deferred this turn, per explicit
instruction** — no screenshot review was requested or performed; this
section is not being sent for visual acceptance now.

**No new dependency, package, or shadcn component was added.** Only the
already-installed `lucide-react` icons (`KeyRound`, `Users`,
`LockKeyhole`, `ListChecks` — verified to exist in the installed version
before use) are used; `Separator`/`Tooltip`/`Accordion` were considered
per this turn's shadcn policy and judged unnecessary.
`platform/package-lock.json` is unchanged.

**Root page** (`app/page.tsx`) adds `PublicTrustControl` below
`PublicOperatingModel`; no further homepage section was added.

**Quality gates, all independently run and passing on the final code:**
`typecheck:web` 0 errors, `lint:web` 0 issues, `build:web` succeeded (both
routes statically prerendered). **No backend regression required:**
`package-lock.json` unchanged, no `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**` file
touched.

**Verification performed instead of screenshot QA:** rendered-HTML
structural review (single `<ol>` present, all 4 control-group titles and
descriptions byte-verified against the intended wording, all decorative
icons `aria-hidden`) and compiled-CSS byte-level confirmation of every
governed value (`max-w-[480px]`/`[440px]`, `py-6`, `divide-y` at 1px,
`lg:gap-16`, `size-10`, `size-5`). Two real, credible visual-risk flags
were identified from layout calculation (not invented) and recorded
rather than silently resolved — see `UI-02` §23's visual-risk register:
mobile control-stack density, and two-column width balance at large
desktop. Phase 1D's own still-open six-column-row flag (§21) was **not**
touched or resolved this turn, per explicit instruction. **VISUAL QA:
DEFERRED.**

## 23. Phase 1F — Public Platform Capabilities Section

**IMPLEMENTED, VISUAL QA DEFERRED** —
`platform/apps/web/components/site/public-capabilities.tsx`
(`PublicCapabilities`). One homepage section ("Platform Capabilities"),
below `PublicTrustControl`; `PublicHeader`/`PublicHero`/
`PublicOperatingModel`/`PublicTrustControl` were consumed, not
redesigned. Full geometry, copy, regulatory/product boundary, and the
visual-risk register are recorded in `UI-02` §24 rather than duplicated
here.

**Full visual QA is intentionally deferred this turn, per explicit
instruction** — no screenshot review was requested or performed.

**No new dependency, package, or shadcn component was added.** Only the
already-installed `lucide-react` icons (`IdCard`, `Handshake`, `Wallet`,
`ClipboardCheck` — verified to exist in the installed version before
use) are used; `Tabs`/`Separator`/`Accordion` were considered per this
turn's shadcn policy and judged unnecessary (fully static presentation
was chosen over any interactive pattern — see `UI-02` §24's Interaction
Decision). `platform/package-lock.json` is unchanged.

**Root page** (`app/page.tsx`) adds `PublicCapabilities` below
`PublicTrustControl`; no further homepage section was added.

**Quality gates, all independently run and passing on the final code:**
`typecheck:web` 0 errors, `lint:web` 0 issues, `build:web` succeeded (both
routes statically prerendered). **No backend regression required:**
`package-lock.json` unchanged, no `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**` file
touched.

**A real geometry defect was found and fixed during implementation:**
the 2×2 desktop matrix's grid wrapper originally carried both a
`gap-x-8` grid gap AND per-cell `lg:pl-8`/`lg:pr-8` padding — these would
have stacked (32px grid gap + 32px + 32px cell padding = 96px combined),
not produced the intended 64px combined gap around the divider line.
Found by reasoning through the box model rather than assumed correct
from the class names, and fixed by removing the redundant grid `gap-x-8`
entirely; re-verified against the compiled CSS after the fix.

**Verification performed instead of screenshot QA:** rendered-HTML
structural review (all 4 domain titles/descriptions/boundary-note text
byte-verified against the intended wording, exactly 4 `<ul>` capability
lists present, all decorative icons/bullets `aria-hidden`) and
compiled-CSS byte-level confirmation of every governed value
(`lg:pl-8`/`lg:pr-8`/`lg:pt-8`/`lg:pb-8` all resolving to 32px,
`lg:border-l`/`lg:border-t` both 1px, `max-w-[720px]`/`[440px]`/`[420px]`,
`size-10`, `size-5`, `size-1`). Three real, credible visual-risk flags
were identified from layout/content calculation (not invented) and
recorded rather than silently resolved — see `UI-02` §24's visual-risk
register: mobile capability-list density, matrix quadrant height
imbalance (the Exchange-boundary note makes one cell taller than its row
partner), and the Exchange-boundary note's deliberately low visual
prominence. Phase 1D's and Phase 1E's still-open flags were **not**
touched or resolved this turn, per explicit instruction. **VISUAL QA:
DEFERRED.**

## 24. Phase 1G — Public Product Experience / Platform Preview

**IMPLEMENTED, VISUAL QA DEFERRED** —
`platform/apps/web/components/site/public-product-preview.tsx`
(`PublicProductPreview`) — a **public demo of the authenticated client
portal's wallet-destination workflow**, not the authenticated portal
itself. One homepage section, below `PublicCapabilities`; every prior
component was consumed, not redesigned. Full geometry, copy, source
validation, and the visual-risk register are recorded in `UI-02` §25
rather than duplicated here.

**Full visual QA is intentionally deferred this turn, per explicit
instruction** — no screenshot review was requested or performed.

**shadcn components added:** `table`, `badge` (pinned CLI 4.21.0).
**Both are pure Tailwind/semantic-HTML components — zero new npm
dependencies.** Verified directly: `git diff --stat` on
`platform/package-lock.json` and `platform/apps/web/package.json`
after running `npx shadcn@4.21.0 add table badge` showed no changes at
all, confirmed **before** writing any component code that consumes
them. `Tabs`/`DropdownMenu`/`Tooltip`/`ScrollArea`/`Separator` were
considered per this turn's shadcn policy and judged unnecessary (fully
static presentation — see `UI-02` §25's Interaction status).

**No API client, no API route, no auth integration, no migration, no
grant.** All demo data (`DESTINATIONS`, `SELECTED_DESTINATION_DETAIL`,
`CONTEXT_RAIL_ITEMS`) is a local `const` inside the component file — no
global mock-data architecture, no backend fixture import, per this
turn's explicit "Demo Data Location" instruction.

**Root page** (`app/page.tsx`) adds `PublicProductPreview` below
`PublicCapabilities`; no further homepage section was added.

**Quality gates, all independently run and passing on the final code:**
`typecheck:web` 0 errors, `lint:web` 0 issues, `build:web` succeeded
(both routes statically prerendered). **No backend regression
required** — `package-lock.json` unchanged (confirmed above), no
`platform/services/**`, `platform/packages/**`, `platform/edge/**`, or
`platform/infra/**` file touched.

**One real type error was found and fixed during implementation:** an
`as const` array where only one context-rail item declared `active:
true` produced a discriminated union where the other items lacked the
`active` property entirely, so `tsc` correctly rejected accessing
`item.active` on them — fixed by giving every item an explicit `active:
boolean` field, re-verified with a clean `typecheck:web` afterward.

**Two real geometry/token deviations were found and fixed during
implementation** (not silently shipped): a context-rail item height of
`h-9` (36px, matching no existing UI-02 control-height tier) was
changed to `h-8` (32px, the existing "Compact" tier); its radius of
`rounded-[6px]` (matching no existing radius tier) was changed to
`rounded-[8px]` (the existing "Standard" tier). Both re-verified
against the compiled CSS after the fix.

**Verification performed instead of screenshot QA:** rendered-HTML
structural review (heading/disclosure/destination-name/status-badge/
masked-address text byte-verified against the intended wording, a real
`<table>` and `<dl>` present, context-rail items rendered as plain
non-interactive `<span>`s rather than fake buttons/links) and
compiled-CSS byte-level confirmation of every governed value
(`max-w-[1120px]`, `rounded-[12px]`/`[8px]`, `h-12`, `h-8`,
`lg:w-[280px]`, `w-[200px]`). Four real, credible visual-risk flags were
identified from layout/content calculation (not invented) and recorded
rather than silently resolved — see `UI-02` §25's visual-risk register:
destination-table fit at 1024px and on mobile, sidebar/content
proportion, demo-disclosure prominence, and status-badge color-neutral
hierarchy. Phase 1D's, 1E's, and 1F's still-open flags were **not**
touched or resolved this turn, per explicit instruction. **VISUAL QA:
DEFERRED.**

## 25. Phase 1H — Public Final CTA / Request Access Section

**IMPLEMENTED, VISUAL QA DEFERRED** —
`platform/apps/web/components/site/public-final-cta.tsx`
(`PublicFinalCta`) — the closing content block of the current homepage,
below `PublicProductPreview`; every prior component was consumed, not
redesigned. Full geometry, copy, audience/claim discipline, and the
visual-risk register are recorded in `UI-02` §26 rather than duplicated
here.

**Full visual QA is intentionally deferred this turn, per explicit
instruction** — no screenshot review was requested or performed.

**No new dependency, package, or shadcn component was added.** Only the
already-installed `Button` (shadcn) is used — no `Card`, no new
component, per this turn's explicit "reuse official shadcn Button, no
need to add new components" instruction. `platform/package-lock.json`
is unchanged.

**Root page** (`app/page.tsx`) adds `PublicFinalCta` below
`PublicProductPreview`; no footer or further homepage section was
added.

**Quality gates, all independently run and passing on the final code:**
`typecheck:web` 0 errors, `lint:web` 0 issues, `build:web` succeeded
(both routes statically prerendered). **No backend regression
required:** `package-lock.json` unchanged, no `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**` file
touched. No API, auth, or form-submission work of any kind.

**One real lint error was found and fixed during implementation:** the
root page's own new preview-status caption used literal `"` characters
around "Request Access" in JSX text (`react/no-unescaped-entities`) —
fixed with `&ldquo;`/`&rdquo;` HTML entities, re-verified with a clean
`lint:web` afterward.

**Verification performed instead of screenshot QA:** rendered-HTML
structural review (heading/copy/CTA-label/boundary-note text
byte-verified against the intended wording; both CTA buttons confirmed
to share the identical `h-12 w-full px-6 sm:w-auto` class string,
structurally guaranteeing the "0px height mismatch" requirement rather
than merely appearing close) and compiled-CSS byte-level confirmation of
every governed value (`max-w-[480px]`/`[440px]`/`[320px]`, `h-12`,
`gap-4`, `lg:gap-16`). Four real, credible visual-risk flags were
identified from layout/content calculation (not invented) and recorded
rather than silently resolved — see `UI-02` §26's visual-risk register:
closing-section surface prominence vs. the hero, actions-column
alignment at tablet width, regulatory-note visibility (the third
occurrence of an already-recorded recurring tension from Phases 1F/1G),
and cumulative vertical whitespace between `PublicProductPreview` and
this section. Phase 1D's, 1E's, 1F's, and 1G's still-open flags were
**not** touched or resolved this turn, per explicit instruction.
**VISUAL QA: DEFERRED.**

## 26. Phase 1I — Public Footer

**IMPLEMENTED, VISUAL QA DEFERRED** —
`platform/apps/web/components/site/public-footer.tsx` (`PublicFooter`)
— the **final structural component** of the current public homepage,
after `PublicFinalCta`. Full geometry, information architecture, anchor
policy, and the visual-risk register are recorded in `UI-02` §27 rather
than duplicated here.

**PUBLIC HOMEPAGE STRUCTURE: IMPLEMENTATION COMPLETE / CONSOLIDATED
VISUAL QA PENDING** — every planned structural component now exists
(`PublicHeader`, `PublicHero`, `PublicOperatingModel`,
`PublicTrustControl`, `PublicCapabilities`, `PublicProductPreview`,
`PublicFinalCta`, `PublicFooter`). This is a structural-completeness
statement only — the homepage is **not** visually accepted as a whole;
the next activity is a consolidated visual QA pass, not a further
structural addition.

**Full visual QA is intentionally deferred this turn, per explicit
instruction** — no screenshot review was requested or performed.

**No new dependency, package, or shadcn component was added.** No
component beyond `next/link`'s own `Link` (already used by
`PublicHeader`) is used. `Separator` was considered per this turn's
shadcn policy and judged unnecessary (a plain `border-t border-border`
achieves the same result). `platform/package-lock.json` is unchanged.

**Five existing files received a minimal, non-visual change:**
`public-operating-model.tsx`, `public-trust-control.tsx`,
`public-capabilities.tsx`, `public-product-preview.tsx`, and
`public-final-cta.tsx` each had exactly one `id` attribute (plus one
explanatory comment) added to their own `<section>` root element, so
`PublicFooter`'s navigation links resolve to real same-page anchors
rather than dead links. No className, content, or structure in any of
those five files changed — re-verified via `typecheck:web`/`lint:web`/
`build:web`, all still passing after the additions.

**A real governance finding, not silently resolved:** no registered
legal entity name exists anywhere in the governed project docs (checked
`docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.3.md` and
`docs/01_masters/01_Project_Charter_v1.3.md`, both frontmatter `owner:
Unassigned`, only the platform name "AIX Money Broking Platform"
appears) — the copyright line therefore reads "© 2026 AIX. All rights
reserved." with no invented corporate suffix, deliberately deviating
from this turn's own suggested example wording because the same turn's
instruction required confirming the exact naming first.

**Root page** (`app/page.tsx`) adds `PublicFooter` after `main`
(outside the `<main>` landmark, as a sibling `<footer>`, per standard
document-structure convention); the prior "blank scroll headroom"
placeholder div is removed, since the footer now closes the page.

**Quality gates, all independently run and passing on the final code:**
`typecheck:web` 0 errors, `lint:web` 0 issues, `build:web` succeeded
(both routes statically prerendered). **No backend regression
required:** `package-lock.json` unchanged, no `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**` file
touched. No API, contact-form, or auth work.

**Verification performed instead of screenshot QA:** rendered-HTML
structural review (a single `<footer>`, correct `<nav aria-label=
"Footer">`, all five new section `id`s present in the DOM, every
footer link's `href` confirmed to be a real same-page anchor — no
fake/dead route, copyright and boundary-note text byte-verified) and
compiled-CSS byte-level confirmation of every governed value (`pt-12`,
`pb-8`, `max-w-[280px]`/`[560px]`, `gap-16`, `sm:gap-12`, `space-y-2`).
Five real, credible visual-risk flags were identified from layout
calculation (not invented) and recorded rather than silently resolved —
see `UI-02` §27's visual-risk register: footer navigation density on
mobile, footer surface-boundary contrast, CTA-to-footer cumulative
spacing, legal/boundary-text prominence (a fourth recorded occurrence of
an already-established recurring pattern), and desktop column balance.
Phase 1D's through 1H's still-open flags were **not** touched or
resolved this turn, per explicit instruction. **VISUAL QA:
DEFERRED.**

## 27. Phase 1J — Consolidated Public Homepage Visual QA

**REVIEW ONLY — no code, markup, CSS, package, or lockfile change was
made in this turn.** A full-homepage QA pass (`PublicHeader` through
`PublicFooter`) was performed via source inspection, rendered-HTML
inspection of the running dev server, and byte-level compiled-CSS
inspection — the same verification discipline every implementation turn
in this document has used, applied here to review rather than to build.
No screenshot/browser-automation tool was available, and none was
installed solely for this turn.

The full defect register — 7 new findings (`UI-QA-001`–`UI-QA-007`,
including 1 BLOCKER and 1 HIGH), all 19 previously-recorded Phase
1D–1I flags carried forward verified and unresolved, exact measured
evidence for every claim, and the recommended remediation grouping — is
recorded in `UI-02` §28, not duplicated here. **VISUAL QA:
REMEDIATION REQUIRED. The homepage is not visually accepted.**

## 28. Phase 1K — Remediation B: Product Preview Responsive / Table Accessibility

**UI-QA-002 (BLOCKER) CLOSED.** `platform/apps/web/components/site/public-product-preview.tsx`:
`ContextRail`'s wrapper and `PreviewShell`'s sidebar+content outer row moved from `lg:` (1024px)
to `xl:` (1280px), so the sidebar no longer competes with the table+detail-panel split at the
exact width the original defect named. `platform/apps/web/components/ui/table.tsx` (a **shared**
primitive): its scroll container gained `role="region"`, `aria-label="Scrollable table"`,
`tabIndex={0}`, and a `focus-visible` ring matching `Button`'s own — every current and future use
of `Table` benefits, not only this page. Full width arithmetic (proving the named 1024–1100px
shortfall is resolved with a positive margin, and precisely bounding the narrower range — below
≈584px — where scroll genuinely remains unavoidable) is recorded in `UI-02` §28.9, not duplicated
here. No package, dependency, or shadcn component added; `platform/package-lock.json` unchanged,
so no backend regression was required. Demo data, status-badge treatment, section copy, shell
radius, top-bar height, and overall section spacing are all unchanged — verified against the
rendered HTML, byte-identical to before this remediation.
`typecheck:web`/`lint:web`/`build:web` all re-run clean on the final code.

## 29. Phase 1L — Remediation A: Anchor Scroll Offset / Fixed Header Occlusion

**UI-QA-001 (HIGH) CLOSED.** A pure-CSS fix — Tailwind's own named `scroll-mt-24`
(96px, below `lg:`) / `lg:scroll-mt-28` (112px, `lg:` and up) utilities, applied
identically to all 5 anchored `<section>` roots
(`public-operating-model.tsx`, `public-trust-control.tsx`,
`public-capabilities.tsx`, `public-product-preview.tsx`,
`public-final-cta.tsx`). No JavaScript, no `tabindex`, no header change.
Values are the accepted header's own occupied envelope (72px compact /
88px desktop) plus a deliberate 24px breathing margin, verified not to
double-count against each section's own existing top padding — full
arithmetic and the 7-viewport clearance table (uniformly +24px, never
negative or marginal) recorded in `UI-02` §28.10, not duplicated here.
No package, dependency, or shadcn component added; `platform/package-lock.json`
unchanged, so no backend regression was required. Section padding,
typography, layout, container width, surfaces, icons, dividers, and both
`PublicHeader` and `PublicFooter` are all unchanged — verified via
`git diff --stat` (one class-string addition per file) and rendered-HTML
inspection. `typecheck:web`/`lint:web`/`build:web` all re-run clean on
the final code.

## 30. Phase 1M — Remediation C: Operating Model Responsive Density

**UI-QA-004 (MEDIUM) and Phase 1D's own underlying flag CLOSED.** The
6-column horizontal process row's breakpoint moved from `lg:` (1024px)
to `xl:` (1280px, Tailwind's own default) in
`public-operating-model.tsx` — the only change: two breakpoint prefixes
(`lg:`→`xl:`) on `DesktopProcessRow`'s and `TabletProcessGrid`'s own
className strings. Verified by arithmetic before implementing (per
explicit instruction to stop and report otherwise): 1024px step width
≈134.67px → 1280px/1440px step width ≈177.33px (+31.7%, container caps
at its own `max-w-[1280px]` so 1280px and 1440px produce an identical
result) — full calculation in `UI-02` §28.11, not duplicated here. The
3×2 tablet grid's own values (`grid-cols-3`/`gap-x-8`/`gap-y-10`) are
unchanged, only its active range widened to match; mobile, desktop-rail
geometry, markers, icons, numbering, and every step's copy are
byte-identical to before. No package, dependency, or shadcn component
added; `platform/package-lock.json` unchanged, so no backend regression
was required. `typecheck:web`/`lint:web`/`build:web` all re-run clean
on the final code.
