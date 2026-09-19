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

## 31. Phase 1N — Remediation D: Global Rhythm / Repetition / Homepage Monotony

**UI-QA-003 (MEDIUM) CLOSED.** A cross-section, controlled-variation
refinement — no randomness, no new tokens, no new component pattern —
across `public-trust-control.tsx`, `public-capabilities.tsx`,
`public-product-preview.tsx`, and `public-final-cta.tsx`.
`public-operating-model.tsx` (the page's stable "process" archetype),
`public-header.tsx`, `public-hero.tsx`, and `public-footer.tsx` were
**intentionally left unchanged**. Four dimensions varied: (1) section-
boundary rhythm — a 4-consecutive-identical gap sequence became a
deliberate ascending pattern with only a 2-run repeat at the start; (2)
eyebrow treatment — exactly 2 documented variants ("standard" and
"quiet") plus one deliberate removal (`PublicProductPreview`, judged
redundant against its own shell's top bar); (3) icon-marker treatment —
the 40px circular marker reduced from 3-of-4 to 1-of-4 icon-bearing
sections, replaced with a bare 20px icon on `PublicTrustControl`/
`PublicCapabilities`; (4) background/surface — one additional full-bleed
`--marketing-surface` tint added to `PublicTrustControl` (not
`PublicProductPreview`, which already has its own contained shell tint
and would lose contrast against a second full-bleed one). Full
before/after arithmetic for every dimension is recorded in `UI-02`
§28.12, not duplicated here. No package, dependency, or shadcn component
added; `platform/package-lock.json` unchanged, so no backend regression
was required. No heading, ARIA attribute, landmark, or reading order was
altered — verified via rendered-HTML inspection.
`typecheck:web`/`lint:web`/`build:web` all re-run clean on the final
code. The Phase 1H "cumulative whitespace"/"closing-section prominence"
flags are incidentally affected by the rhythm change but were **not**
independently re-validated or closed this turn.

## 32. Phase 1O — Low-Severity Polish / QA Closure

**`UI-QA-005` and all 17 retained Phase 1E–1I polish flags adjudicated
(6 CLOSED, 3 CLOSED BY LATER CHANGE, 8 OPEN/ACCEPTED RISK — count
corrected in UI Phase 1R; see `UI-02` §28.17).**
Full per-flag decision table (CLOSED / CLOSED BY LATER CHANGE / OPEN /
ACCEPTED RISK — none silently dropped) recorded in `UI-02` §28.13, not
duplicated here. `UI-QA-005` (Trust & Control large-desktop balance)
closed with **no code change** — re-verification found the left/right
columns' actual used width (480px vs. 476px at 1280px/1440px) to be a
conclusive near-exact match, not the originally-suspected imbalance.
Two small code changes were made, both using only existing governed
tokens: (1) `public-capabilities.tsx` — a thin `border-border/60` top
divider added before the Exchange-boundary note (the same "quiet
footnote" pattern already used elsewhere on the page), wording
unchanged; (2) `public-footer.tsx` — a dead `lg:justify-between` removed
so the section's own already-present `lg:gap-16` (64px) takes effect,
closing a real ≈681px empty-middle-of-row defect at desktop. No package,
dependency, or shadcn component added; `platform/package-lock.json`
unchanged, so no backend regression was required.
`typecheck:web`/`lint:web`/`build:web` all re-run clean on the final
code. **PUBLIC HOMEPAGE: READY FOR FINAL VISUAL REVIEW** — not a
self-declared visual acceptance; no screenshot review was performed
this turn.

## 33. Phase 1P — Final Visual Remediation 01: Footer Desktop Horizontal Balance

**UI-QA-009 (MEDIUM) — found during the user's own rendered final
visual review, not by any prior analytical QA pass — CLOSED (pending
the user's recheck).** Phase 1O's fix (removing a dead
`lg:justify-between`) was correct on its own terms but left the footer's
desktop content reading as left-heavy: brand and navigation clustered
together with all remaining container width trailing after them. Fixed
in `public-footer.tsx` by replacing the `flex`/`gap-16` row with a
two-zone `grid-cols-[1fr_auto]` layout at `lg:` — the brand column
absorbs the container's flexible remaining width, positioning the
navigation column (sized to its own content) at the container's right
portion instead of immediately beside the brand block. Full before/after
geometry (nav-zone trailing clearance: ≈613px before → ≈0px after) is
recorded in `UI-02` §28.14, not duplicated here. Brand content,
navigation links (all 5 real same-page anchors, unchanged), legal
copyright/boundary text, and both existing dividers are all unchanged —
verified byte-identical against the rendered HTML. Tablet/mobile
behavior (the `<lg:` base class) is untouched. No package, dependency,
or shadcn component added; `platform/package-lock.json` unchanged, so
no backend regression was required. `typecheck:web`/`lint:web`/
`build:web` all re-run clean on the final code. **PUBLIC HOMEPAGE:
FINAL VISUAL REVIEW STILL IN PROGRESS.**

## 34. Phase 1Q — Final Visual Remediation 02: Fixed Header Scroll-Content Isolation

**UI-QA-008 (MEDIUM) — found during the user's own rendered final
visual review — CLOSED PENDING USER VISUAL RECHECK.** The accepted
`PublicHeader`'s center pill has its own protected surface, but the
`DesktopNav`'s wordmark and actions (deliberately placed outside the
pill per Phase 1B's own REF-UI-001-informed composition) had no
equivalent isolation — scrolling content could visually pass behind
them. Fixed in `public-header.tsx` with a new `HeaderMask` component: a
short vertical gradient (`--marketing-background`, the page's own
existing token, fading to `to-transparent`) plus the same
`backdrop-blur-sm` strength the pill already uses. Height reuses the
exact figures Phase 1L's `scroll-mt-24`/`lg:scroll-mt-28` fix already
established (`h-24`=96px compact, `lg:h-28`=112px desktop — "header
envelope + 24px"), not new numbers. **No new z-index anywhere** —
`HeaderMask` is rendered as `<header>`'s first child with no `z-index`
of its own, so it paints behind `DesktopNav`/`MobileNav` purely by DOM
order within the header's existing `z-40` stacking context.
`pointer-events-none` + `aria-hidden`, confirmed via rendered-HTML
inspection to carry no interactive attributes. All accepted header
geometry (offsets, heights, pill dimensions, radius, breakpoint) is
unchanged — verified byte-identical. No package, dependency, or shadcn
component added; `platform/package-lock.json` unchanged, so no backend
regression was required. No JavaScript, no scroll listener, no
shrink-on-scroll — pure CSS. `typecheck:web`/`lint:web`/`build:web` all
re-run clean on the final code. Full mask architecture and stacking-
order reasoning recorded in `UI-02` §28.15, not duplicated here.
**PUBLIC HOMEPAGE: FINAL VISUAL REVIEW STILL IN PROGRESS.**

## 35. Phase 1Q Remediation 01 — Header Mask Stacking Correction

**UI-QA-008's first fix (§34) FAILED the user's own rendered visual
recheck** — the wordmark and both action buttons came out visibly
blurred, while the pill did not; the mask was affecting the header's own
interactive content, not only isolating it from scrolling page content.
Reopened OPEN / REMEDIATION REQUIRED, corrected here.

**Verified root cause (CSS stacking-context spec, inspected directly,
not guessed):** within one stacking context, non-positioned in-flow
block elements paint in an earlier tier than positioned elements with
`z-index: auto`/`0`, regardless of DOM order. `HeaderMask`
(`position: fixed`) landed in the later/"on top" tier; `DesktopNav`'s
and `MobileNav`'s own wrapper `<div>`s had no `position` at all,
landing in the earlier/"underneath" tier — the exact inverse of the
DOM-order assumption the first implementation relied on, so the mask's
own `backdrop-filter: blur` ended up sampling already-drawn header text.

**Fix in `public-header.tsx`:** an explicit local stacking model —
`isolate` added to `<header>`, explicit `z-0` added to `HeaderMask`,
explicit `relative z-10` added to `DesktopNav`'s and `MobileNav`'s own
wrapper `<div>`s (`relative` with no offset does not move either
element). With every relevant element now explicitly positioned and
z-indexed, paint order is decided by unambiguous numeric comparison
instead of the tier rule above — `z-0` reliably behind, `z-10`
reliably in front, for the pill, wordmark, and both buttons alike.

**No mask geometry, blur, gradient, or accepted header dimension was
retuned** — the defect was entirely stacking, confirmed by the fix
resolving it without touching any of those values; all re-verified
byte-identical/unchanged in the rendered HTML and compiled CSS. No
`z-50` or arbitrary escalation — `z-0`/`z-10` are the smallest explicit
hierarchy, both local to the header's own `isolate`d context. No
package, dependency, or shadcn component added; `package-lock.json`
unchanged, so no backend regression was required. No other homepage
component changed — verified via `git diff`.
`typecheck:web`/`lint:web`/`build:web` all re-run clean on the final
code. Full root-cause analysis and stacking-model reasoning recorded in
`UI-02` §28.16, not duplicated here.

**UI-QA-008: VISUALLY CONFIRMED CLOSED (UI Phase 1R — second attempt
passed).** The user's own rendered final visual review confirmed the
AIX wordmark, center pill, "Client Login," and "Request Access" all
render sharp, and scrolling content behind the fixed header is
sufficiently softened with the floating-pill character preserved.
**PUBLIC HOMEPAGE: FINAL VISUAL REVIEW STILL IN PROGRESS.**

## 36. Phase 1R — Final Public Homepage Visual Acceptance Closure (docs only)

**PUBLIC HOMEPAGE: VISUALLY ACCEPTED / GOVERNED / CLOSED.** No frontend
code changed this turn — a docs-only closure recording the user's own
rendered final visual review of the complete homepage. `UI-QA-008`
(header mask, second attempt) and `UI-QA-009` (footer desktop balance)
are both **VISUALLY CONFIRMED CLOSED**, closing the loop the prior
computed-evidence-only verification passes could not close on their
own. Every formal finding `UI-QA-001`–`005` remains CLOSED;
`UI-QA-006`/`007` remain INFORMATIONAL / ACCEPTED POSITIVE. The
accepted-risk count is reconciled against the actual current `UI-02`
§28.13 register at **8 OPEN / ACCEPTED RISKS** (the Phase 1O summary's
"6" was an arithmetic error against the register's actual 17 rows — see
`UI-02` §28.17 for the full corrected accounting and the retained-item
list; nothing was removed). **Accepted implementation baseline:
`42aa380`.** Final AIX font, palette, and brand asset/logo remain
**PENDING DESIGN APPROVAL**; the authenticated Client/Staff-Ops/Admin
portals, live API integration, Exchange functionality, full
platform-module completeness, production readiness, and internet
exposure are unaffected and separately governed. Backend/program state
(module status, Turn M-B, `FND-FIND-001`, M1–M8, production exposure)
is unchanged by this closure. Full record: `UI-02` §28.17. **Next UI
phase: Authenticated Platform Design — not implemented this turn.**

## 37. Phase 2B — Authenticated Platform Shell (implementation)

**Frontend implementation, shell only — no product page.** Adds 13 new
files under `platform/apps/web/` (7 shared shell modules + 3 route groups
× `layout.tsx`/`page.tsx`), no files modified, no package or lockfile
change:

```
components/shell/nav-data.ts
components/shell/nav-icons.tsx
components/shell/nav-list.tsx
components/shell/authenticated-sidebar.tsx
components/shell/authenticated-mobile-nav.tsx
components/shell/authenticated-topbar.tsx
components/shell/authenticated-shell.tsx
app/app/layout.tsx
app/app/page.tsx
app/ops/layout.tsx
app/ops/page.tsx
app/admin/layout.tsx
app/admin/page.tsx
```

**shadcn/dependency impact: none.** `Sheet` and `Button` — both already
installed since UI Phase 1B — are reused unmodified; no new shadcn
primitive was added (`Separator`/`DropdownMenu`/`Tooltip`, all named as
"likely candidates" in this turn's brief, were each evaluated and judged
not yet necessary: dividers reuse the existing plain
`border-t`/`border-b border-border` utility pattern `PublicFooter` already
established rather than installing `Separator`; no real dropdown menu
exists yet, so `DropdownMenu` was not installed; no icon-only control
lacks a text label, so `Tooltip` was not installed). `platform/
package-lock.json` unchanged — confirmed via diff.

**A real build-time defect found and fixed:** the first implementation
stored `NavItem.icon` as a direct Lucide icon component reference. `next
build` failed prerendering `/app`, `/ops`, and `/admin` with "Functions
cannot be passed directly to Client Components" — a genuine React Server
Components boundary violation (`nav-data.ts` is imported by each route's
Server Component `layout.tsx`, which passes it as props into the
`"use client"`-marked shell components; a function value cannot serialize
across that boundary). Fixed by storing a string `NavIconName` in the
shared data and resolving it to the actual component only inside
`nav-list.tsx` (already within the client-marked subtree) via a new
`nav-icons.tsx` lookup module. Full reasoning: `UI-04` §34.3.

**Quality gates, all independently re-run after the fix:**
`typecheck:web` (`next typegen && tsc --noEmit`) — 0 errors. `lint:web`
(`eslint`) — 0 issues. `build:web` (`next build`) — succeeded; `next
build`'s own route table confirms all 6 routes (`/`, `/_not-found`,
`/admin`, `/app`, `/ops`) statically prerendered
(`○ (Static) prerendered as static content`).

**Backend regression:** not required — zero `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**` change;
zero package/lockfile change.

**No API call, no fetch, no server action, no cookie/session parsing, no
auth middleware, no mock authentication, no permission evaluation** —
confirmed via source inspection of every new file; every route is reachable
without authentication (expected and explicitly authorized this turn — real
auth integration is separately governed, later work).

**Public homepage: unaffected.** `app/page.tsx`, `app/layout.tsx`,
`app/globals.css`, and every `components/site/*` file are byte-identical to
baseline — confirmed via `git diff --name-only`, none appear in the diff.

Full route structure, component architecture, geometry rationale, and the
verification method's limits (no screenshot tool — source/rendered-HTML/
compiled-CSS inspection only, not a visual-acceptance claim) are recorded
in `UI-04` §34 and `UI-02`'s new "UI Phase 2B — Authenticated Shell
Geometry" section, not duplicated here.

## 38. Phase 2C — Technical Architecture Implications (no code change)

**Docs only — no `platform/apps/web/**` file touched.** UI Phase 2C's
visual-direction governance (`UI-04` §35) established two implications for
this document's own subject (the actual frontend runtime/token
architecture), recorded here since they are technical-architecture facts,
not narrative:

**Theme-capable token architecture — already present, not newly built.**
`app/globals.css` (Phase 1A scaffolding) already carries a complete `.dark`
CSS-variable set alongside `:root`'s light set, inherited unmodified from
the shadcn "Nova" init preset except for the one stray chromatic
`--sidebar-primary` value neutralized in Phase 1A. UI Phase 2C's dual/
theme-capable architecture recommendation (`UI-04` §35.5) is therefore a
recommendation to **use** an already-existing capability, not to build a
new one — no token file, CSS variable, or dependency change is implied or
made this turn. A working theme toggle (persistence, a switcher control,
contrast verification across both modes for every future component) remains
separately scoped, later implementation work.

**Surface-token extension — none needed.** `UI-04` §35.6's five-tier
surface hierarchy (`BASE`/`SURFACE-1`/`SURFACE-2`/`SURFACE-3`/`OVERLAY`)
maps entirely onto tokens already present in `app/globals.css`
(`--background`, `--sidebar`/`--sidebar-foreground`, `--card`/
`--card-foreground`, `--muted`/`--accent`/`--input`, `--popover`/
`--popover-foreground`) — every one of them already generated by the Nova
preset in Phase 1A, most already wired into `@theme inline`. No new CSS
variable is required to implement the surface hierarchy once a future
styling turn adopts it; the only implication for that future turn is
**which existing token each component should switch to** (most notably:
`AuthenticatedSidebar`/`AuthenticatedTopbar` currently use plain
`bg-background`, not yet the already-available `--sidebar` family) — not a
new architecture.

**No future panel primitive was created or specified as a component this
turn** — `UI-04` §35.17's panel classification is a styling-treatment
taxonomy (which existing surface/border/spacing tokens each panel type
uses), not new component APIs; whether any panel type eventually warrants
its own reusable component remains an implementation-turn decision, per
`UI-01` §2.1's "wrap only where it adds real value" rule.

## 39. Phase 2D — Authenticated Shell Visual Implementation (code, not visually accepted)

**Frontend styling implementation — shell only, no product page.** Applies
`UI-04` §35's Phase 2C visual direction to the existing Phase 2B shell.
Adds 1 new file, modifies 6:

```
components/shell/page-header.tsx          [NEW]
components/shell/authenticated-sidebar.tsx    [modified — SURFACE-1 tokens]
components/shell/authenticated-topbar.tsx     [modified — SURFACE-1 tokens, client-context refinement]
components/shell/authenticated-mobile-nav.tsx [modified — Sheet header restyled to match sidebar]
components/shell/nav-list.tsx                  [modified — aria-disabled on inert rows]
app/app/page.tsx / app/ops/page.tsx / app/admin/page.tsx [modified — now use PageHeader]
```

**shadcn/dependency impact: none.** No new component installed;
`Sheet`/`Button` remain the only ones in use, unmodified as primitives
(only usage-site classNames changed). `platform/package-lock.json`
unchanged — confirmed via diff.

**No structural geometry changed** — 240px sidebar, 40px rows, 20px icons,
56px top bar all preserved exactly; only color tokens, one border-token
reference, one accessibility attribute, and the page-header markup
changed.

**Quality gates, all independently run:** `typecheck:web` — 0 errors.
`lint:web` — 0 issues. `build:web` — succeeded; all 6 routes statically
prerendered, unchanged from Phase 2B's route set (no new route added).

**Verification method and its explicit limit — the load-bearing fact of
this turn:** this session has no browser/screenshot/automation tooling
available. Checked directly rather than assumed: `ToolSearch` for
screenshot/browser/Playwright/Puppeteer tools (none found);
`package.json`/`node_modules` inspected for a locally installed browser-
automation package (none found; `npx playwright` refused to run without
an explicit install, which this turn did not authorize — installing a new
dev dependency solely to work around this turn's own stated stop
condition would defeat its purpose, not satisfy it); `PATH` checked for
`chromium`/`chromium-browser`/`google-chrome`/`playwright`/`puppeteer`
binaries (none found); a system Chrome/Safari application exists on the
host machine, but this session has no mechanism to drive one or capture
from it. Verification actually performed instead: a real `next dev`
server, all routes confirmed `HTTP 200`, rendered HTML fetched and
inspected directly for every new class/attribute, and the compiled CSS
chunk fetched and inspected byte-for-byte (full record: `UI-04` §36.9,
`UI-02`'s new "UI Phase 2D" section). **Per this turn's own explicit
instruction ("do not substitute source/CSS inspection for rendered
acceptance"), this technical verification is not treated as, and does not
constitute, visual acceptance.** `AUTHENTICATED SHELL: VISUALLY ACCEPTED`
is not recorded in this document, `UI-04`, `UI-02`, or `docs/04_ui/
README.md` as a result of this turn.

**Backend regression:** not required — zero `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**` change;
zero package/lockfile change. **No API call, no fetch, no server action,
no cookie/session parsing, no auth middleware** — confirmed via source
inspection of every changed file; unchanged from Phase 2B. **Public
homepage: unaffected** — `app/page.tsx`, `app/layout.tsx`,
`app/globals.css`, and every `components/site/*` file are byte-identical
to baseline, confirmed via `git diff --name-only` (none appear in the
diff).

## 40. Phase 2E — Wallet & Payout Destinations (first product page, visual QA deferred)

**Frontend implementation — first real `A`-classified client page.** Adds
`app/app/wallet-destinations/page.tsx` and 6 new modules under
`components/wallet-destinations/`; modifies `components/shell/nav-data.ts`
(one `href` added) and `components/shell/page-header.tsx` (one optional
`action` prop added, backward-compatible — the three existing placeholder
pages pass no new prop and render unchanged).

**shadcn additions:** `Dialog`, `Input`, `Label`, `Select` (`npx
shadcn@4.21.0 add dialog input label select`) — **zero
`package.json`/`package-lock.json` change**, confirmed via diff; all four
compose entirely from the `radix-ui` dependency already installed since
`UI Phase 1A`. `button.tsx` was offered for overwrite by the same command
and skipped (identical content). Full field-to-governed-schema mapping:
`UI-04` §37.7/§37.15.

**No API/auth integration** — confirmed via source inspection of every
new/changed file: no `fetch`, no server action, no cookie/session
parsing, no auth middleware, no membership-switching logic. Demo fixture
data (`DEMO_DESTINATIONS`) is static and local; the Add Destination
dialog's "Review Destination" step never submits anything.

**Quality gates, all independently run:** `typecheck:web` — 0 errors.
`lint:web` — 0 issues (one real defect found and fixed during
implementation, not left in: the first `useIsLgUp` viewport hook called
`setState` synchronously inside a `useEffect` body, which the project's
own `react-hooks/set-state-in-effect` ESLint rule correctly flagged as a
cascading-render risk — rewritten using `useSyncExternalStore`, the
React-recommended pattern for subscribing to external browser state like
`matchMedia`, which needs no effect-body `setState` at all). `build:web`
— succeeded; 7 routes now statically prerendered (`/`, `/_not-found`,
`/admin`, `/app`, `/app/wallet-destinations`, `/ops`), up from 6.

**Verification method and visual-QA status:** a real `next dev` server,
rendered-HTML inspection, and compiled-CSS inspection were performed
(full record: `UI-04` §37.11, `UI-02`'s new "UI Phase 2E" section) — but
**no rendered screenshot/browser review was performed.** Unlike `UI
Phase 2D` §39 (where this same absence produced an explicit non-
acceptance stop), this turn's own program instruction treats deferred
visual QA as the expected, correct outcome for every UI build-out turn
until the authenticated platform is feature-complete — recorded as
**IMPLEMENTED / VISUAL QA DEFERRED**, not falsely claimed as accepted.

**Backend regression:** not required — zero `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**`
change; zero package/lockfile change. **Public homepage: unaffected** —
`app/page.tsx`, `app/layout.tsx`, `app/globals.css`, and every
`components/site/*` file are byte-identical to baseline, confirmed via
`git diff --name-only`.

## 41. Phase 2F — Client Overview (second product page, visual QA deferred)

**Frontend implementation — the first `B`-classified client page.**
Replaces `UI Phase 2B`'s placeholder `app/app/page.tsx` with the real
Client Overview. Adds 5 new modules under `components/overview/` and 1
new shared module `components/shell/demo-disclosure.tsx` (extracted from
`UI Phase 2E`'s inline implementation — that page's own `page.tsx` was
updated to consume it too, removing the duplicate inline JSX there, so
the file count for this turn is 6 new + 2 modified, not 7 new).

**shadcn/dependency impact: none.** No new component installed; every
element composes from primitives already present (`Badge`, `Link`, plain
HTML). Zero `package.json`/`package-lock.json` change.

**No structural shell geometry changed** — this turn only replaces page
content within the already-existing, already-styled shell
(`AuthenticatedShell`/`AuthenticatedSidebar`/`AuthenticatedTopbar`,
unchanged since `UI Phase 2D`).

**Cross-page data consistency, verified by construction, not merely by
inspection:** `components/overview/overview-data.ts` imports
`DEMO_DESTINATIONS` from `components/wallet-destinations/
destination-data.ts` directly — there is no second fixture array for
this page to drift out of sync with; both pages read the same in-memory
array, so a future edit to one cannot silently desynchronize the other.

**Quality gates, all independently run:** `typecheck:web` — 0 errors.
`lint:web` — 0 issues (no new defect introduced this turn). `build:web`
— succeeded; still 7 routes statically prerendered (`/app` remains a
static route — its content changed, its route count did not).

**Verification method and visual-QA status:** a real `next dev` server,
rendered-HTML inspection, and compiled-CSS inspection were performed
(full record: `UI-04` §41.15, `UI-02`'s new "UI Phase 2F" section) — no
rendered screenshot/browser review was performed, consistent with `UI
Phase 2E`'s own program-decision posture (contrast `UI Phase 2D` §39,
where the same absence produced an explicit non-acceptance stop).
Recorded as **IMPLEMENTED / VISUAL QA DEFERRED**, not falsely claimed as
accepted.

**Backend regression:** not required — zero `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**`
change; zero package/lockfile change. **Public homepage: unaffected** —
confirmed via `git diff --name-only`, no public-site file appears in the
diff.

## 42. Phase 2G — Client Profile / Organisation (third product page, visual QA deferred)

**Frontend implementation — the second `B`-classified client page.**
Adds `app/app/profile/page.tsx` and 5 new modules
(`components/profile/{profile-data.ts, organisation-summary.tsx,
authorised-representatives.tsx, profile-status.tsx}` plus the new shared
`components/client/client-demo-data.ts`); modifies `components/shell/
nav-data.ts` (one `href` added) and `components/overview/overview-data.ts`
(refactored to import shared client state instead of declaring its own
copy — zero consuming-component changes required, verified this turn).

**shadcn/dependency impact: none.** No new component installed; every
element composes from primitives already present (plain HTML `dl`/`dt`/
`dd`, `Link`). Zero `package.json`/`package-lock.json` change.

**Cross-page data consistency, verified by construction:**
`components/client/client-demo-data.ts` is the single source for client
lifecycle/KYC/eligibility state — both `UI Phase 2F`'s Overview page and
this turn's Profile page import from it directly, so a future edit to
one cannot silently desynchronize the other (same pattern `UI Phase 2F`
itself established for `DEMO_DESTINATIONS`, now extended one level
further up the fixture hierarchy).

**Quality gates, all independently run:** `typecheck:web` — 0 errors.
`lint:web` — 0 issues (no new defect introduced this turn). `build:web`
— succeeded; 8 routes now statically prerendered (up from 7),
`/app/profile` added.

**Verification method and visual-QA status:** a real `next dev` server,
rendered-HTML inspection, and compiled-CSS inspection were performed
(full record: `UI-04` §42's own subsections, `UI-02`'s new "UI Phase 2G"
section) — no rendered screenshot/browser review was performed,
consistent with `UI Phase 2E`/`2F`'s own program-decision posture.
Recorded as **IMPLEMENTED / VISUAL QA DEFERRED**, not falsely claimed as
accepted.

**Backend regression:** not required — zero `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**`
change; zero package/lockfile change. **Public homepage: unaffected** —
confirmed via `git diff --name-only`, no public-site file appears in the
diff.

## 43. Phase 2H — Client KYC / KYB Compliance Status (fourth product page, visual QA deferred)

**Frontend implementation — the third `B`-classified client page, and
the last of the four original Client Portal nav items to go live.**
Adds `app/app/compliance-status/page.tsx` and 4 new modules under
`components/compliance/`; modifies `components/shell/nav-data.ts` (one
`href` added), `components/client/client-demo-data.ts` (`UBO_ON_FILE`
added — moved from `UI Phase 2G`'s own `profile-data.ts`),
`components/profile/profile-data.ts` (re-exports `UBO_ON_FILE` instead
of declaring it — zero consuming-component change required),
`components/profile/profile-status.tsx` (Compliance Summary row now
links to the new real page), and `components/overview/overview-data.ts`
+ `components/overview/attention-items.tsx` (KYC/KYB capability status
and the organisation-kind attention item now link to the new real page
— the exact same "route now exists" update `UI Phase 2G` already made
for Profile).

**shadcn/dependency impact: none.** No new component installed; every
element composes from primitives already present (plain HTML `dl`/
`dt`/`dd`, `Link`). Zero `package.json`/`package-lock.json` change.

**Cross-page data consistency, verified by construction:** `UBO_ON_FILE`
now lives in the same shared `components/client/client-demo-data.ts`
module as `DEMO_CLIENT_STATE` — this page's Verification Areas and `UI
Phase 2G`'s Authorised Representatives section import the identical
value, so beneficial-ownership state can never disagree between the two
pages either, extending the same pattern `UI Phase 2G` established for
lifecycle/KYC/eligibility.

**Quality gates, all independently run:** `typecheck:web` — 0 errors.
`lint:web` — 0 issues (no new defect introduced this turn). `build:web`
— succeeded; 9 routes now statically prerendered (up from 8),
`/app/compliance-status` added.

**Verification method and visual-QA status:** a real `next dev` server,
rendered-HTML inspection, and compiled-CSS inspection were performed
(full record: `UI-04` §43's own subsections, `UI-02`'s new "UI Phase
2H" section) — no rendered screenshot/browser review was performed,
consistent with every prior client-page phase's own program-decision
posture. Cross-page consistency independently verified: all of `/app`,
`/app/profile`, `/app/compliance-status` confirmed to render "Pending
Documents" identically; zero remaining `aria-disabled="true"` inert nav
rows anywhere on the Client Portal surface (confirmed via rendered-HTML
inspection of `/app/compliance-status`'s own nav markup — all four
`CLIENT_NAV` items are now live links). Recorded as **IMPLEMENTED /
VISUAL QA DEFERRED**, not falsely claimed as accepted.

**Backend regression:** not required — zero `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**`
change; zero package/lockfile change. **Public homepage: unaffected** —
confirmed via `git diff --name-only`, no public-site file appears in the
diff.

## 44. Phase 2I — Staff/Operations Overview (first Ops page, visual QA deferred)

**Frontend implementation — the first real Staff/Operations page,**
replacing `UI Phase 2B`'s placeholder `app/ops/page.tsx`. Adds 4 new
modules under `components/ops/`; no other file changed — unlike every
prior client-page phase, this turn required no shared-module refactor
(`components/ops/ops-data.ts` imports `STATUS_LABELS` from `UI Phase
2E`'s `wallet-destinations/destination-data.ts` directly, a read-only
reuse, not a moved/shared-state extraction).

**shadcn/dependency impact: none.** No new component installed; every
element composes from plain HTML (`dl`/`dt`/`dd`, `ul`/`li`,
`h2`/`h3`). Zero `package.json`/`package-lock.json` change.

**Cross-module reuse, verified by construction:** `WLT_STATUS_LABELS`
in `ops-data.ts` is a direct re-export of `UI Phase 2E`'s own
`STATUS_LABELS` — the same governed wallet-destination status wording
is used for both the Client-facing Wallet & Payout Destinations page
and this Ops page's Wallet Destination Review section, so the two can
never disagree, and no second WLT status-label map exists anywhere in
the codebase to drift out of sync.

**Quality gates, all independently run:** `typecheck:web` — 0 errors.
`lint:web` — 0 issues (no new defect introduced this turn). `build:web`
— succeeded; still 9 routes statically prerendered (`/ops`'s own
content changed, route count did not).

**Verification method and visual-QA status:** a real `next dev` server,
rendered-HTML inspection, and compiled-CSS inspection were performed
(full record: `UI-04` §44's own subsections, `UI-02`'s new "UI Phase
2I" section) — no rendered screenshot/browser review was performed,
consistent with every prior UI-build phase's own program-decision
posture. Regression-confirmed: all four other Client routes
(`/app`, `/app/wallet-destinations`, `/app/profile`, `/app/compliance-
status`) and `/admin` remain `HTTP 200`, unaffected; the Ops shell's
own sidebar still correctly shows exactly 4 inert nav rows (Client
Requests/Wallet Destination Review/Maker-Checker Queue/Audit-Activity),
none activated early. Recorded as **IMPLEMENTED / VISUAL QA DEFERRED**,
not falsely claimed as accepted.

**Backend regression:** not required — zero `platform/services/**`,
`platform/packages/**`, `platform/edge/**`, or `platform/infra/**`
change; zero package/lockfile change. **Public homepage: unaffected** —
confirmed via `git diff --name-only`, no public-site file appears in
the diff.

## 45. Phase 2J — Staff/Operations Client Requests (second Ops page, visual QA deferred)

`/ops/client-requests` (`UI-04` §45): a List + Detail workspace over
`CLT-01` application records. `B`-classified; demo data only; no fetch,
server action, auth or mutation.

**Files created (8):** `app/ops/client-requests/page.tsx`;
`components/ops/{client-request-data.ts, client-request-status.tsx,
client-request-table.tsx, client-request-detail.tsx,
client-requests-workspace.tsx}`; `lib/use-is-lg-up.ts`.
**Files modified:** `components/shell/nav-data.ts` (Client Requests gains
`href`); `components/ops/{ops-data.ts, operational-queues.tsx,
workflow-availability.tsx}` (consume the shared data; link to the new
page; demo cross-references corrected — `UI-04` §45.3);
`components/wallet-destinations/wallet-destinations-workspace.tsx`
(imports the extracted hook; behaviour unchanged).

**shadcn impact: none** — `Sheet`, `Select`, `Label`, `Button`, `Table`
already installed. **No package or lockfile change.**

**Client/server boundary:** the page is a Server Component; the workspace,
table and detail are client-bundled (interactive state). Detail timestamps
use `timeZone: "UTC"` so server and browser render identical text.

**Container queries.** First use on the platform: `@container` on the
table wrapper with `@3xl:`/`@4xl:` column visibility. Tailwind v4 core —
no plugin. Confirmed present in the compiled stylesheet
(`@container (min-width: 48rem)`, `(min-width: 56rem)`).

**`useIsLgUp` extraction.** The `useSyncExternalStore` media-query hook
moved from Phase 2E's workspace to `lib/use-is-lg-up.ts` when this page
became its second caller (rationale and the `set-state-in-effect` lint
constraint are in the file's own comment).

**Quality gates:** `typecheck:web`, `lint:web`, `build:web` all pass;
**10** static routes (was 9; `/ops/client-requests` added).

**Verification method (screenshot tooling unavailable; unchanged):** dev
server + `curl` + rendered-HTML and compiled-CSS inspection. Confirmed:
one `<h1>`; table headers/rows/values; the mobile list's 4 items; the
labelled filter with its SSR-rendered value; one button per row; the
detail panel's sections and natively-disabled action buttons; the
Overview's "2 items" agreeing with the queue; the sidebar's two live Ops
links and three inert rows; the active-route marker. **Not verifiable
here:** filter/selection/Sheet interaction (no browser or jsdom) — those
paths are reasoned from source, not exercised. Recorded as
**IMPLEMENTED / VISUAL QA DEFERRED**.

**Regression:** `/`, `/app`, `/app/wallet-destinations` (its workspace was
touched by the hook extraction), `/app/profile`, `/app/compliance-status`,
`/ops` and `/admin` all return 200 with unchanged structure. Backend
regression not required — zero `platform/services/**`, `packages/**`,
`edge/**`, `infra/**` change. Public homepage unaffected.

## 46. Tooling — Official shadcn MCP (project-aware configuration)

**Status: CONFIGURED / RESTART REQUIRED.** A tooling and governance change
only: no UI, backend, package or lockfile change, and no component
installed, updated or regenerated. (Executed on `ed1fa15`, one commit ahead
of the brief's stated `766d05b` — that commit was `UI Phase 2J`; the
difference was reviewed and approved before proceeding.)

### 46.1 Configuration

`.mcp.json` at the repository root registers one server, `shadcn`, from the
official registry tooling only. It is launched as:

```json
"command": "sh",
"args": ["-c", "cd platform/apps/web && exec npx shadcn@latest mcp"]
```

**Why the official generated config was not used as-is.** The official
initializer (`npx shadcn@latest mcp init --client claude`, run with `npx`
because `pnpm` is not installed and npm is this project's package manager)
produced a root-oriented `command: "npx", args: ["shadcn@latest", "mcp"]`.
Claude Code starts project MCP servers from the repository root, but this
repository's only shadcn project is nested at `platform/apps/web`. Probed
before adapting: launched from the root, the server reported **no
configured registries at all** (not even `@shadcn`); launched from the
directory holding `components.json`, it reported `@shadcn` plus the
project's own. So the generated config was unsuitable for the nested app.
The `cd` above is a **controlled working-directory adaptation**, not a
different server.

**The initializer also had a side effect**, removed: it created a
repo-root `package.json` (`shadcn ^4.21.0`), a 4,302-line
`package-lock.json` and a 248-package `node_modules`. `shadcn@4.21.0` is
already a dependency of `platform/apps/web`, and the server command needs
no local install, so all three were redundant — and a second npm root above
`platform/` is a hazard. They were deleted the same session they were
created; the tree contains none of them.

**The authoritative shadcn configuration remains solely
`platform/apps/web/components.json`.** No `components.json` exists at the
root, and none may be added.

### 46.2 Verification

Probed over stdio exactly as Claude Code launches it (from the repo root,
through `sh -c`):

| Check | Result |
|---|---|
| Server starts, `initialize` | `shadcn` 1.0.0 |
| Tools exposed (7) | `get_project_registries`, `list_items_in_registries`, `search_items_in_registries`, `view_items_in_registries`, `get_item_examples_from_registries`, `get_add_command_for_items`, `get_audit_checklist` |
| Real repo, `get_project_registries` | `@shadcn` (our `registries` list is empty — acceptable; none added) |
| Nested config actually read | A scratch tree with a marker registry in a nested `components.json` — adapted launch from the tree root listed `@shadcn` **and** the marker; the unadapted launch listed neither |
| `@shadcn` search / view | Works (33 matches for "button"; item details returned) |
| Project aliases / style | **Not exposed by any of the 7 tools.** They apply when `add` runs, from `components.json` in the working directory |

### 46.3 Known limitations (recorded, not worked around)

- **`[object Promise]`:** `search_items_in_registries` prints the literal text
  `[object Promise]` in place of the add command for every result — an upstream MCP defect,
  reproduced from both the repo root and `apps/web`. `get_add_command_for_items`
  returns a well-formed command. AIX does not patch or compensate for it.
- **Add commands are not trusted blindly.** Any future component addition
  is run from `platform/apps/web` and verified against the actual directory
  and `git diff`.
- **`@latest` is unpinned** (as in the official config), so the server
  version follows npm on each launch. Pinning is a possible future
  decision, not made here.

### 46.4 Runtime status

**CONFIGURED / RESTART REQUIRED.** The running Claude Code process has not
loaded `.mcp.json`. After a restart, and approval of the project-scoped
server when prompted, `/mcp` should show `shadcn` as connected. Until that
is observed, the server is not claimed to be connected.

### 46.5 Existing component inventory (from the repo, not memory)

`platform/apps/web/components/ui/` — 9 primitives, 950 lines, all present
in Git with 1–2 commits each. All import `cn` from the `cn` package
(the `shadcn@4` convention; `cn ^0.3.0` is a declared dependency).

| Primitive | Lines | Added | Consumers | Classification |
|---|---|---|---|---|
| `badge` | 48 | `faebd94` | destination status, public product preview | **KEEP** |
| `button` | 66 | `997528e` | 8 files — public site and authenticated shell/pages | **KEEP** |
| `dialog` | 168 | `a07af94` | add-destination dialog | **KEEP** |
| `input` | 18 | `a07af94` | add-destination dialog | **KEEP** |
| `label` | 23 | `a07af94` | add-destination dialog, Client Requests filter | **KEEP** |
| `navigation-menu` | 163 | `537c71d` | public header only (visually accepted, closed) | **KEEP** |
| `select` | 191 | `a07af94` | add-destination dialog, Client Requests filter | **REVIEW LATER** |
| `sheet` | 147 | `537c71d` | public header, authenticated mobile nav, nav list, 2 detail workspaces | **REVIEW LATER** |
| `table` | 126 | `faebd94`, fix `c02a472` | destination table, Client Requests table, public product preview | **REVIEW LATER** |

**Totals: KEEP 6 · REVIEW LATER 3 · UPDATE CANDIDATE 0.**

Rationale for the three REVIEW LATER entries (none is a defect):

- **`select`** — Radix renders `SelectValue` empty during server rendering
  until the client mounts; `UI Phase 2J` handled it at the call site by
  passing the label explicitly. Worth comparing against upstream during QA.
- **`sheet`** — the most-shared overlay (five consumers). Its default
  `w-3/4 sm:max-w-sm` yields ~322px at 430px wide, which `UI-04` §45 only
  *reasoned* about; restyling has been done at call sites.
- **`table`** — the only primitive with an AIX edit inside `ui/`
  (`UI-QA-002`: the scrollable region gained `role="region"`, `tabIndex` and
  an `aria-label`). A blind upstream update would erase it, and its fixed
  label ("Scrollable table") is shared by every table on the platform.

**No primitive is an UPDATE CANDIDATE** — none has a concrete known defect
or unmet requirement, and a newer upstream version alone does not qualify.
No upstream diff was run: comparing against the base registry would use the
wrong style, and comparison belongs to the future audit below.

### 46.6 Workflow and policy

Recorded in `.claude/skills/aix-ui-design/SKILL.md` ("shadcn MCP policy"):
search existing AIX components → reuse an installed primitive → search the
official MCP → install only what the current screen requires → custom UI
last. Official registry only; no bulk installs; no community registries or
wholesale blocks without explicit review; the MCP does not override
`UI-01`–`UI-04` or `REF-UI-006`, and does not authorize upgrades;
shadcn/Radix accessibility preserved; thin AIX wrappers only for repeated
domain behavior.

### 46.7 Global update policy

**DO NOT UPDATE ALL EXISTING SHADCN COMPONENTS NOW.** The existing UI is
already implemented and governed; existing source may carry AIX adaptations
(`table.tsx` does); broad regeneration would create uncontrolled diffs;
and full visual QA is intentionally deferred until the authenticated UI is
complete. Upgrades must be evidence-driven. A separate future turn may run
a **SHADCN CONSISTENCY / UPGRADE AUDIT** after the authenticated UI is
built.

### 46.8 Scope confirmation

No change to `platform/apps/web/**` (including `components/ui/`),
`platform/services/**`, `packages/**`, `edge/**` or `infra/**`; no package
or lockfile change; no component added, updated or regenerated; public
homepage untouched. Quality gates (`typecheck`/`lint`/`build`) not required
— no application or package source changed.

## 47. Phase 2K — Staff/Operations Wallet Destination Review (third Ops page, visual QA deferred)

`/ops/wallet-destination-review` (`UI-04` §46): a List + Detail workspace
over `WLT-01` destinations — wallet and fiat payout. `B`-classified; demo
data only; no fetch, server action, auth or mutation.

**Files created (5):** `app/ops/wallet-destination-review/page.tsx`;
`components/ops/{destination-review-data.ts, destination-review-table.tsx,
destination-review-detail.tsx, destination-review-workspace.tsx}`.
**Files modified:** `components/shell/nav-data.ts` (Wallet Destination
Review gains `href`); `components/ops/{ops-data.ts, operational-queues.tsx}`
(Overview now derives its WLT rows from the shared data and links to the
page); `components/ops/client-request-data.ts` (organisation names of
`DEMO-001`/`DEMO-004` swapped for cross-portal consistency — `UI-04` §46.4).
The Client Portal's `destination-data.ts` is **unchanged**; the staff data
imports its fixtures by reference.

**shadcn impact: none** — `Table`, `Button`, `Sheet`, `Select`, `Label`
already installed; the official shadcn MCP was not needed (policy stopped
at "reuse an installed primitive"). **No package or lockfile change.**

**Client/server boundary:** the page is a Server Component; the workspace,
table and detail are client-bundled. Dates render through UTC-pinned
formatters so server and browser output match. Container queries are reused
from `UI Phase 2J` (`@container` + `@2xl:`/`@3xl:`/`@4xl:`), confirmed in the
compiled stylesheet (`min-width: 42rem`, `48rem`, `56rem`).

**Quality gates:** `typecheck:web`, `lint:web`, `build:web` all pass; **11**
static pages generated (was 10).

**Verification method (screenshot tooling unavailable; unchanged):** dev
server + `curl` + rendered-HTML and compiled-CSS inspection, **plus a
server-side render of the detail component for all six records** (a
scratch `tsx` script in a git-ignored directory, removed afterward — it
found and led to a fix for a review action being offered when its gates
were unmet). Confirmed: one `<h1>`; the 6 queue rows and their values; the
mobile list's 6 items; the labelled filter with its SSR value; the live
region; one button per row; each state's sections and natively-disabled
actions; the Overview's "3 items" agreeing with the queue's awaiting rows;
the sidebar's three live Ops links and two inert rows; no forbidden term
(balance, settlement, reveal, reject, trading…) in the page text. **Not
verifiable here:** filter/selection/Sheet interaction (no browser or
jsdom) — reasoned from source, not exercised.

**Regression:** `/`, `/app`, `/app/wallet-destinations`, `/app/profile`,
`/app/compliance-status`, `/ops`, `/ops/client-requests` and `/admin` all
return 200 with unchanged structure. Backend regression not required — zero
`platform/services/**`, `packages/**`, `edge/**`, `infra/**` change. Public
homepage unaffected.

## 48. Phase 2L — Staff/Operations Maker-Checker Queue (fourth Ops page, visual QA deferred)

`/ops/maker-checker-queue` (`UI-04` §47): a List + Detail workspace over
`IAM-02` approval requests. `B`-classified; demo data only; no fetch, server
action, auth, permission check or mutation — and no local fake success.

**Files created (6):** `app/ops/maker-checker-queue/page.tsx`;
`components/ops/{approval-request-data.ts, approval-request-status.tsx,
approval-request-table.tsx, approval-request-detail.tsx,
approval-requests-workspace.tsx}`.
**Files modified:** `components/shell/nav-data.ts` (Maker-Checker Queue gains
`href`); `components/ops/{ops-data.ts, operational-queues.tsx}` (Overview
derives its Maker-Checker rows from the shared data, links to the page, and no
longer shows the non-existent action `wlt1.destination.approve`);
`components/ops/{client-request-detail.tsx, destination-review-detail.tsx}`
(each states "Approval requested" and drops the redundant "Request approval"
when the shared data has a pending request for that subject).

**shadcn impact: none** — `Table`, `Button`, `Sheet`, `Select`, `Label`
already installed; the REVIEW LATER primitives (`select`, `sheet`, `table`)
were used but not modified. No `Textarea` was needed (the optional decision
reason is described in text). The official shadcn MCP was not needed.
**No package or lockfile change.**

**Client/server boundary:** the page is a Server Component; the workspace,
table and detail are client-bundled. Timestamps use the UTC-pinned formatters.
Container queries are reused; `@[44rem]` is a new arbitrary breakpoint (Tailwind
v4 core), confirmed in the compiled stylesheet alongside `56rem` and `64rem`.

**Quality gates:** `typecheck:web`, `lint:web` (warning-free after removing two
leftover imports) and `build:web` all pass; **12** static pages generated
(was 11).

**Verification method (screenshot tooling unavailable; unchanged):** dev
server + `curl` + rendered-HTML and compiled-CSS inspection, **plus a
server-side render of the detail component for every approval status and for
the two originating pages** (a scratch `tsx` script in a git-ignored directory,
removed afterward). Confirmed: one `<h1>`; the Pending default (2 of 6 rows);
each status's note, history and disabled-only actions; no button on any
terminal request; the Overview's "2 items" equal to the queue's pending rows;
the sidebar's four live Ops links and one inert row; `DEMO-002` and
`DEMO-PAY-001` showing "Approval requested" with the redundant action removed
while `DEMO-001` and `DEMO-WLT-004` are unchanged; no forbidden term
(balance, settlement, trading, fee…) in the page text. **Not verifiable
here:** filter/selection/Sheet interaction (no browser or jsdom) — reasoned
from source, not exercised.

**Regression:** `/`, `/app`, `/app/wallet-destinations`, `/app/profile`,
`/app/compliance-status`, `/ops`, `/ops/client-requests`,
`/ops/wallet-destination-review` and `/admin` all return 200. Backend
regression not required — zero `platform/services/**`, `packages/**`, `edge/**`,
`infra/**` change. Public homepage unaffected.

## 49. Phase 2M — Staff/Operations Audit / Activity (fifth Ops page, visual QA deferred)

`/ops/audit-activity` (`UI-04` §48): a List + Detail workspace over the SEC-01
normal-tier audit projection. `B`-classified; demo data only; no fetch, server
action, auth, permission check, export or mutation. **Completes the initial
Staff/Operations UI set** (`STAFF / OPS INITIAL UI SET: IMPLEMENTED / VISUAL QA
DEFERRED`).

**Files created (6):** `app/ops/audit-activity/page.tsx`;
`components/ops/{audit-activity-data.ts, audit-result-line.tsx,
audit-activity-table.tsx, audit-activity-detail.tsx,
audit-activity-workspace.tsx}`.
**Files modified:** `components/shell/nav-data.ts` (Audit / Activity gains `href`
— no inert Ops row remains); `components/ops/{ops-data.ts,
workflow-availability.tsx}` (the Overview's Recent Staff Activity now derives
from the shared audit data and links to the page; `ops-data.ts` loses its
separate audit fixture and formatter; the four workflow-availability items are
all "Available").

**shadcn impact: none** — `Table`, `Sheet`, `Select`, `Label`, `Button` already
installed; the REVIEW LATER primitives were used but not modified. **No package or
lockfile change.** The official shadcn MCP was not needed.

**Client/server boundary:** the page is a Server Component; the workspace, table
and detail are client-bundled. Timestamps use the UTC-pinned formatters (audit
times are `*_utc`; "UTC" is shown). Container queries reuse `@3xl`/`@4xl`/`@5xl`,
confirmed in the compiled stylesheet with `.h-8` and `.py-1`.

**Quality gates:** `typecheck:web`, `lint:web` (warning-free) and `build:web` all
pass; **13** static pages generated (was 12).

**Verification method (screenshot tooling unavailable; unchanged):** dev server +
`curl` + rendered-HTML and compiled-CSS inspection, **plus a server-side render of
the detail component for the events that exercise each branch** (a scratch `tsx`
script in a git-ignored directory, removed afterward). Confirmed: one `<h1>`; the
10 rows and their values (all `h-8`); two labelled filters with SSR values; one
button per row with a label-in-name accessible name; the panel's zero interactive
elements apart from one link; the sensitive-access section on exactly
`DEMO-EVT-006`; a leak scan of all ten details (only the redaction note mentions
"session"/"correlation"); the Overview's two most recent events matching the
list's top two; the sidebar's **five live Ops links and zero inert rows**; no
forbidden term (balance, settlement, export, replay, reveal, token…) in the page
text. **Not verifiable here:** filter/selection/Sheet interaction (no browser or
jsdom) — reasoned from source, not exercised.

**Regression:** `/`, `/app`, `/app/wallet-destinations`, `/app/profile`,
`/app/compliance-status`, `/ops`, `/ops/client-requests`,
`/ops/wallet-destination-review`, `/ops/maker-checker-queue` and `/admin` all
return 200. Backend regression not required — zero `platform/services/**`,
`packages/**`, `edge/**`, `infra/**` change (IAM-02 and SEC-01 untouched). Public
homepage unaffected.

## 50. Phase 2N — Admin / Compliance Overview (first Admin page, visual QA deferred)

`/admin` (`UI-04` §49): the first real Admin / Compliance page, replacing the
shell placeholder. `B`-classified; demo data only; no fetch, server action, auth,
permission check or mutation. Informational — no review or approval action.

**Files created (5):** `components/admin/{admin-compliance-data.ts,
compliance-attention.tsx, control-dependencies.tsx,
client-compliance-state.tsx, review-areas.tsx}`.
**Files modified:** `app/admin/page.tsx` (placeholder replaced);
`app/admin/layout.tsx` (comment and page metadata no longer say "no product page
implemented"); `components/shell/nav-data.ts` (a comment only — **no nav item
changed**: Compliance Overview has had its `href` since `UI Phase 2B` and the
other seven Admin rows stay inert). **No Ops page was modified.**

**shadcn impact: none — no shadcn primitive is used on this page at all**, so no
REVIEW LATER component was touched and no `Table`, `Select` or `Sheet` appears. The
official shadcn MCP was not needed. **No package or lockfile change.**

**Client/server boundary:** every component is a Server Component — the page has
no interactivity, no client state and no `"use client"`. The projection module
imports the Client and Ops demo-data modules as **data only**.

**Quality gates:** `typecheck:web`, `lint:web` (warning-free) and `build:web` all
pass; **13** static pages generated (unchanged — `/admin` existed).

**Verification method (screenshot tooling unavailable; unchanged):** dev server +
`curl` + rendered-HTML inspection. Confirmed: one `<h1>`; the four `<h2>` sections;
the four attention rows, five dependency rows, seven client-summary rows and seven
review areas with their values; **zero links, buttons, inputs or selects inside
`<main>`**; the sidebar's one live Admin link and seven inert rows; no forbidden or
judgement term (balance, settlement, compliance score, healthy, compliant, all
clear, a percentage, Low/Medium/High, Reporting, Incidents, Approve, Reject).
**Cross-surface consistency was checked programmatically against the rendered
pages** (`UI-04` §49.6): the Client Portal's KYC status, checklist wording,
beneficial-ownership state and lifecycle; the Maker-Checker Queue's default view
and the Ops Overview's count; and the Audit / Activity sensitive-access event —
all consistent. No interaction exists to verify.

**Regression:** `/`, `/app`, `/app/wallet-destinations`, `/app/profile`,
`/app/compliance-status`, `/ops`, `/ops/client-requests`,
`/ops/wallet-destination-review`, `/ops/maker-checker-queue` and
`/ops/audit-activity` all return 200. Backend regression not required — zero
`platform/services/**`, `packages/**`, `edge/**`, `infra/**` change (IAM-02 and
SEC-01 untouched). Public homepage unaffected.

## 51. Phase 2O — Admin / Client Risk / KYC-KYB (second Admin page, visual QA deferred)

`/admin/client-risk-kyc-kyb` (`UI-04` §50): a List + Detail workspace of client-level
KYC/KYB, CDD and lifecycle state. `B`-classified; a four-client demo dataset (no cross-client
read exists in the backend); no fetch, server action, auth, permission check or mutation.
Read-only — no review, override, escalation or rating action.

**Files created (6):** `app/admin/client-risk-kyc-kyb/page.tsx`;
`components/admin/{client-risk-data.ts, client-risk-status.tsx, client-risk-table.tsx,
client-risk-detail.tsx, client-risk-workspace.tsx}`.
**Files modified:** `components/shell/nav-data.ts` (the "Client Risk / KYC-KYB" row gains
`href`; the six other Admin rows stay inert); `app/admin/layout.tsx` (comment and metadata);
and — **three deliberate changes to Phase 2N's `/admin`**, each recorded at `UI-04` §49.15/
§50.8: `components/admin/admin-compliance-data.ts` (the KYC/KYB attention row now derives from
this dataset with unchanged output, a Remediation Required row is added, and
`CHECKLIST_STAFF_LABELS`/the case-type labels now come from `client-risk-data.ts`) and
`components/admin/review-areas.tsx` (the built area is a link marked "Interface preview").
**No Ops or Client page was modified.**

**Client/server boundary:** the page is a Server Component; `ClientRiskWorkspace` and
`ClientRiskTable` are Client Components (`"use client"`) holding only local UI state —
`statusFilter`, `selectedRef`, `mobileDetailOpen`. `ClientRiskDetail` and `KycStateLine` are
plain components with no state, rendered on either side of that boundary. The workspace
reuses `useIsLgUp` (`useSyncExternalStore`).

**Data:** `DEMO-CLI-001` is built from `client-demo-data`, `compliance-data` and
`client-request-data` — never re-declared — so it cannot disagree with the Client Portal or
the Compliance Overview. Every fixture is a reachable KYC-01 state, audited against
`outcome-engine.ts` (`UI-04` §50.2–§50.3). `pass` **and** `fail` both give `completed`, so the
KYC / KYB cell carries the outcome for a completed case and its icon follows the pair.

**shadcn impact: none.** Existing `Table`, `Select`, `Sheet`, `Button`, `Label` used
unchanged; the REVIEW LATER primitives were not touched; the official MCP was not needed. **No
package or lockfile change.**

**Lint finding:** choosing the status icon through a helper function tripped
`react-hooks/static-components` ("component created during render"). Fixed with a
module-level `Record<StateKey, icon>` lookup — the pattern the Ops status lines already use.

**Quality gates:** `typecheck:web`, `lint:web` (warning-free) and `build:web` all pass;
**14** static pages generated (13 + the new route).

**Verification method (screenshot tooling unavailable; unchanged):** dev server + `curl` +
rendered-HTML inspection, and a scratch server-side render (deleted afterwards) for branches
the four fixtures do not reach. Confirmed: one `<h1>`; one labelled table, five rows, the four
clients' cells; the default detail; the active nav item; zero interactive elements in the
detail; label-in-name for all four row buttons; the `completed`+`fail`, `completed`+null,
all-verified and beneficial-ownership-pending branches; compiled CSS carries the `@3xl`/`@4xl`
container rules and the selected-row marker. `DEMO-CLI-001`'s class, lifecycle, KYC/KYB
status, checklist, case type, CDD outcome and beneficial ownership were checked
programmatically against `/app`, `/app/profile`, `/app/compliance-status` and `/admin`.
The Compliance Overview's pre-existing pending row renders byte-identically to Phase 2N. **No
interaction was exercised** — filtering, selection and the Sheet are reasoned from source.

**Regression:** `/`, `/app`, `/app/wallet-destinations`, `/app/profile`,
`/app/compliance-status`, `/ops`, `/ops/client-requests`, `/ops/wallet-destination-review`,
`/ops/maker-checker-queue`, `/ops/audit-activity` and `/admin` all return 200. Backend
regression not required — zero `platform/services/**`, `packages/**`, `edge/**`, `infra/**`
change. Public homepage unaffected.

## 52. Phase 2P — Admin / AML / Transaction Monitoring (third Admin page, visual QA deferred)

`/admin/aml-transaction-monitoring` (`UI-04` §51): AML screening and risk-signal information,
with the transaction-monitoring boundary stated. `B`-classified; a five-subject demo dataset (no
cross-subject read exists in the backend beyond the stuck-request list); no fetch, server action,
auth, permission check, mutation or local state transition. Read-only. **Transaction monitoring
is not implemented in the current backend** (`UI-04` §51.2) and the page never implies otherwise.

**Files created (8):** `app/admin/aml-transaction-monitoring/page.tsx`;
`components/admin/{aml-monitoring-data.ts, aml-status.tsx, aml-subject-table.tsx,
aml-subject-detail.tsx, aml-workspace.tsx, aml-attention.tsx, aml-capability-boundary.tsx}`.
**Files modified:** `components/shell/nav-data.ts` (the "AML / Transaction Monitoring" row gains
`href`; the five other Admin rows stay inert); `app/admin/layout.tsx` (comment and metadata);
and — **the Compliance Overview amendment** recorded at `UI-04` §49.15/§51.9 —
`components/admin/admin-compliance-data.ts` (the "AML screening and EDD" row is split into AML
screening, derived from this dataset, and EDD; Review Areas' AML entry gains `href`).
`review-areas.tsx` needed no change — it already renders any area with an `href` as a link. **No
Ops or Client page was modified.**

**Client/server boundary:** the page is a Server Component; `AmlWorkspace` and `AmlSubjectTable`
are the only Client Components (`"use client"`), holding only local UI state — `statusFilter`,
`selectedRef`, `mobileDetailOpen`. `ScreeningStateLine`, `AmlSubjectDetail`, `AmlAttention` and
`AmlCapabilityBoundary` carry no directive and are stateless: the first two are imported into
the client subtree (so they ship to the browser), the last two render on the server only. The
workspace reuses `useIsLgUp`.

**Data:** subjects are `client_application` and `authorised_party` — never clients — because
AML-01 cannot bind an application to a client and its safe reads return no name. The demo
mirrors AML-01's own rules: an original screening emits no signal, `overall_status` is only
`clear`/`potential_match`, and the outcome shown is **derived from match statuses** (a copy of
`deriveEffectiveStatus`). The Overview and the page share one definition of "needs attention"
(`subjectsNeedingAttention`) so their counts cannot drift. **No monitoring-run fixtures** — a
real run rescreens every eligible subject and its counters could not be reconciled with a
five-row demo.

**shadcn impact: none.** Existing `Table`, `Select`, `Sheet`, `Button`, `Label` used unchanged;
the REVIEW LATER primitives were not touched; the official MCP was not needed. **No package or
lockfile change.**

**Quality gates:** `typecheck:web`, `lint:web` (warning-free) and `build:web` all pass; **15**
static pages generated (14 + the new route). No lint finding this phase — the status icon was
built from a module-level lookup table from the start, applying `UI Phase 2O`'s `react-hooks/
static-components` fix.

**Verification method (screenshot tooling unavailable; unchanged):** dev server + `curl` +
rendered-HTML inspection, and a scratch server-side render (deleted afterwards) for branches the
five fixtures do not reach. Confirmed: one `<h1>` and four `<h2>`; the five attention rows; one
labelled table, five rows and their cells; the default detail; the active nav item; zero
interactive elements in the detail, attention list and boundary section; the amended Overview
rows and Review Areas links; the Overview's "4 subjects" equal to the AML page's own count; the
Ops fixtures' `DEMO-004` (approved) and `DEMO-002` (under review) agreeing with the AML
timeline; `UI Phase 2O`'s page unchanged; the outcome derivation for every branch; neutral icons
regardless of outcome; and **zero banned tokens** (STR, SAR, suspicious, structuring, velocity,
confidence, any amount or percentage) across every rendered surface. **No interaction was
exercised** — filtering, selection and the Sheet are reasoned from source.

**Regression:** `/`, `/app`, `/app/wallet-destinations`, `/app/profile`,
`/app/compliance-status`, `/ops`, `/ops/client-requests`, `/ops/wallet-destination-review`,
`/ops/maker-checker-queue`, `/ops/audit-activity`, `/admin` and `/admin/client-risk-kyc-kyb` all
return 200. Backend regression not required — zero `platform/services/**`, `packages/**`,
`edge/**`, `infra/**` change. Public homepage unaffected.
