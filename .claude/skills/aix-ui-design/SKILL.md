---
name: aix-ui-design
description: Use for any AIX UI, frontend, web design, dashboard, portal, component design, shadcn, layout, responsive, or design-review/visual-QA work on this project. AIX-specific — enforces this repo's design governance (docs/04_ui/), not generic frontend advice.
---

# AIX UI Design

Governs UI/frontend work on the AIX platform. The authoritative source of
truth is `docs/04_ui/` — this skill enforces that directory's discipline; it
does not restate design decisions that belong there, since those decisions
change independently of this skill and must stay Git-tracked in one place.

## Before any UI work

1. **Read `docs/04_ui/README.md`, `docs/04_ui/AIX_UI_DESIGN_FOUNDATION_v0.1.md`,
   and `docs/04_ui/AIX_UI_MEASUREMENT_SPEC_v0.1.md` (or their current
   successors — the index README always lists what is current) before
   writing or changing any UI code.** The measurement spec is where actual
   dimensions live (spacing tokens, control heights, radii, typography
   roles, floating-nav geometry, visual QA tolerances) — do not guess a
   value the spec already states. If an even later, more specific UI
   governance document exists (a navigation-architecture doc, a page
   acceptance record), read that too — these documents are a starting
   point, not necessarily the latest word on every subject.
2. **Inspect the actual component/page you are about to change** — its
   current markup, its current styles, its current props/variants — before
   editing it. Do not redesign from memory or assumption.
3. **Search before creating.** Look for an existing component, pattern, or
   token that already does what you need before adding a new one. A new
   component/pattern is justified only when nothing existing fits — and
   that justification should be visible in the change, not silent.

## While implementing

4. **Use existing tokens and components rather than inventing
   replacements.** A new arbitrary spacing/color/radius value is a defect
   unless it is a genuinely new token being deliberately added to the
   system (see `docs/04_ui/AIX_UI_DESIGN_FOUNDATION_v0.1.md` §6/§10) or a
   documented optical-correction exception (§5).
5. **Measure spacing and dimensions explicitly.** State the actual values
   used (in px or token units) rather than eyeballing. No `17px`/`23px`/
   `29px`/`37px`-style arbitrary values without a documented reason.
6. **Avoid generic AI-generated visual patterns** — see the Anti-"AI Look"
   Rules in the foundation document (§4): no giant rounded cards
   everywhere, no four arbitrary KPI cards atop every page, no excessive
   pills/glassmorphism/glowing borders, no arbitrary purple gradients, no
   "Welcome back" hero sections on operational dashboards, no decorative
   charts without operational value, no emoji in professional operational
   UI, no meaningless floating blobs, no identical card treatment for
   every kind of information.
7. **Preserve backend and regulatory truth.** Never invent an API endpoint,
   permission, workflow state, regulatory capability, wallet-accounting
   behavior, trade state, exchange feature, or settlement behavior that
   does not exist or is not approved (`platform/services/`,
   `docs/02_modules/`, `docs/OPEN_FINDINGS.md`, `docs/DECISION_LOG.md`).
   A proposed/future screen must be explicitly marked
   **PROPOSED / NOT YET BACKED BY IMPLEMENTATION**. Preserve the
   regulatory UI boundary (no visual implication of derivatives, margin,
   futures, principal dealing, market making, MYR pairs, privacy coins,
   algorithmic stablecoins, staking, lending, or yield; exchange
   functionality stays visually gated).
8. **Prefer shadcn primitives, but customize them.** shadcn/ui is the
   component foundation, not the finished visual identity — "default
   shadcn look" is never an acceptable final state. Customize typography,
   spacing, color, radii, shadows, borders, tables, forms, navigation,
   status presentation, empty/loading states, and interaction treatment.
9. **Never change unrelated files.** Keep diffs focused on the coherent UI
   scope for the current session (e.g. one shell, one page, one table) —
   do not opportunistically touch unrelated components, pages, or backend
   code in the same change.
10. **Distinguish Public Website from Authenticated Platform** treatment
    (foundation doc §3) — the public site may use stronger visual
    storytelling and motion; authenticated client/staff/admin screens stay
    restrained and data-first. Do not carry marketing decoration into
    staff/admin/compliance screens.
11. **Design mobile intentionally**, not as "desktop stacked vertically."
    State desktop/tablet/mobile behavior for major components rather than
    relying on reflow alone.
12. **Preserve accessibility** — semantic HTML, keyboard navigation, focus
    states, color contrast, and ARIA where shadcn primitives don't already
    handle it.

## After implementing

13. **Perform responsive review** across desktop/tablet/mobile before
    considering a screen done.
14. **Perform screenshot-based visual QA where tooling allows.** Compare
    against the measurement criteria in the foundation document §7
    (alignment, gutters, component heights, spacing-token compliance,
    baseline alignment, icon alignment, breakpoint behavior, overflow,
    truncation, table density, form-field consistency, empty/loading/error
    states).
15. **Report exact measurement deviations, not vague impressions.** Use the
    Visual QA Language in the foundation document §8 — "header is 4px too
    low," "left gutter differs by 8px," "button height does not match the
    40px control token" — never "looks slightly off" or "make cleaner."
    **Never accept "close enough."**
16. **Preserve Git-tracked design decisions.** If a session produces a
    genuinely new, durable design decision (a new token, a finalized
    navigation dimension, an approved reference promotion, a page
    acceptance), record it in `docs/04_ui/` (or the relevant successor
    document) in the same change — chat memory alone is not sufficient per
    this project's Git-is-authoritative principle. Do not invent new
    document structure for this if an existing document already fits;
    check `docs/04_ui/README.md` first.

## Model guidance (informational, not a hard gate this skill enforces)

Sonnet for ordinary implementation/components/responsive/tests/refactoring;
Fable for UX copy/labels/error wording/microcopy; Opus only when UI work
intersects materially with security-sensitive workflow architecture, fund
movement, maker-checker, ledger presentation, compliance decision flows, or
permission architecture. See the foundation document §16 for the full
statement.
