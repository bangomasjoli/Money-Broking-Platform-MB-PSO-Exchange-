"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * AIX public-site header — the floating-pill navigation (UI Phase 1B).
 *
 * REF-UI-001 (docs/04_ui/references/REF-UI-001_phantom-floating-pill.png) approves ONLY the
 * floating/detached pill navigation TREATMENT — not Phantom's logo, colors, typography, exact
 * dimensions, search control, CTA design, or site structure. This is an original AIX
 * interpretation built against docs/04_ui/AIX_UI_MEASUREMENT_SPEC_v0.1.md ("UI-02") §10's
 * provisional geometry.
 *
 * Architecture (LEFT wordmark / CENTER pill / RIGHT actions, all OUTSIDE the pill except the
 * nav items themselves) follows the reference image's actual composition, which places the
 * logo and right-side actions outside the pill — this supersedes UI-02 §10.1's original
 * "logo flush to the pill's left inner padding" assumption (written before the reference image
 * existed). Recorded as an explicit revision in UI-02, not applied silently.
 *
 * BRAND ASSET PENDING: no approved AIX logo exists yet — "AIX" below is a temporary
 * typographic wordmark only, not a logo.
 *
 * Client Login / Request Access are VISUAL/PROPOSED public-site actions only — rendered as
 * inert buttons (no href, no route, no onClick). No authentication is wired, no onboarding API
 * exists. They must never be mistaken for functional flows.
 *
 * Nav labels (Platform/Solutions/Security/Resources/Company) point to same-page fragment
 * anchors for future sections that do not exist yet — never a route that would 404.
 *
 * Layout: a 3-column CSS grid (`1fr auto 1fr`) is used for the desktop row rather than flexbox,
 * because the left (wordmark, ~narrow) and right (two buttons, ~wide) columns have asymmetric
 * content widths — flexbox `justify-between` would visibly skew the pill off-center toward
 * whichever side has less content; grid's `1fr auto 1fr` keeps the middle (auto-sized) track
 * genuinely centered regardless of that asymmetry.
 *
 * Breakpoint: REMEDIATION 01 — user visual QA at 768px showed the full desktop row (5 nav
 * items + wordmark + 2 actions) visibly compressed under UI-02 §10.4's original `md:` (768px)
 * tablet treatment. The full desktop composition now shows only from `lg:` (1024px), which
 * visual QA confirmed has sufficient breathing room; below `lg:` the compact/mobile treatment
 * applies. There is no intermediate squeezed tablet row — the composition is either the complete
 * desktop row or the compact mobile row, never a partial version of either. UI-02 §10.4's
 * original 768px tablet-gap rule is superseded; see UI-02's Phase 1B Remediation 01 note.
 *
 * UI-QA-008 (Phase 1Q): a restrained `HeaderMask` (defined below) was added as this header's own
 * first child, isolating `DesktopNav`'s unprotected LEFT wordmark and RIGHT actions from
 * scrolling page content passing behind them — see that component's own doc comment for the full
 * mask architecture, and UI-02 §28.15 for the closure record. This header's own accepted geometry
 * (offsets, heights, pill dimensions, radius, breakpoint) is otherwise completely unchanged.
 */

const NAV_ITEMS = [
  { label: "Platform", href: "#platform" },
  { label: "Solutions", href: "#solutions" },
  { label: "Security", href: "#security" },
  { label: "Resources", href: "#resources" },
  { label: "Company", href: "#company" },
] as const;

/** Shared visual surface for the pill — desktop and mobile use the same "pill/rounded-container
 * language" (UI-02 §10.5), differing only in height/offset/padding. */
const PILL_SURFACE =
  "rounded-full border border-border/60 bg-[var(--marketing-surface)]/85 shadow-sm backdrop-blur-sm";

function DesktopNav() {
  return (
    <div className="hidden lg:block px-6">
      <div className="mx-auto grid max-w-none grid-cols-[1fr_auto_1fr] items-center gap-6">
        {/* LEFT — temporary AIX wordmark. BRAND ASSET PENDING. */}
        <Link
          href="/"
          aria-label="AIX home — brand asset pending, temporary wordmark"
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          AIX
        </Link>

        {/* CENTER — the approved floating-pill navigation treatment (REF-UI-001 scope).
            NOTE: no extra wrapping <nav> here — NavigationMenu's own Radix root already
            renders a semantic <nav>. An outer <nav aria-label="Primary"> around it previously
            produced two NESTED <nav> landmarks (this one, plus Radix's own default
            aria-label="Main" root) — a real accessibility defect found during HTML review, not
            merely cosmetic. Fixed by styling a <div> for the pill surface and passing
            aria-label="Primary" directly to NavigationMenu so exactly one <nav> landmark exists. */}
        <div className={cn("flex h-16 w-full max-w-[1120px] items-center px-6", PILL_SURFACE)}>
          <NavigationMenu aria-label="Primary" viewport={false} className="max-w-none flex-none">
            {/* REMEDIATION 01: fixed 32px item gap. The prior `gap-5 lg:gap-8` tablet step (20px
                below `lg:`) is unreachable now that this row itself only renders at `lg:` and up
                — kept as dead styling would have been misleading, so it was removed. */}
            <NavigationMenuList className="gap-8">
              {NAV_ITEMS.map((item) => (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink
                    href={item.href}
                    className="flex h-10 items-center justify-center rounded-full px-3 py-0 text-sm font-medium"
                  >
                    {item.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* RIGHT — restrained public-site actions. Visual/proposed only, no functional flow. */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" className="h-10">
            Client Login
          </Button>
          <Button variant="default" className="h-10">
            Request Access
          </Button>
        </div>
      </div>
    </div>
  );
}

function MobileNav() {
  return (
    <div className="flex lg:hidden px-4">
      <div
        className={cn(
          "flex h-14 w-full items-center justify-between px-4",
          PILL_SURFACE,
        )}
      >
        <Link
          href="/"
          aria-label="AIX home — brand asset pending, temporary wordmark"
          className="text-base font-semibold tracking-tight text-foreground"
        >
          AIX
        </Link>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu" className="size-10">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <nav aria-label="Primary" className="flex flex-col gap-1 px-4">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="flex h-10 items-center rounded-lg px-2 text-sm font-medium hover:bg-muted"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="mt-2 flex flex-col gap-3 px-4">
              <Button variant="ghost" className="h-10 justify-center">
                Client Login
              </Button>
              <Button variant="default" className="h-10 justify-center">
                Request Access
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

/**
 * UI-QA-008 remediation (Phase 1Q): the center nav pill has its own protected surface
 * (`PILL_SURFACE`'s background/border/shadow/blur), but `DesktopNav`'s LEFT wordmark and RIGHT
 * actions sit directly over scrolling page content with no surface behind them — during scroll,
 * underlying section text can visually pass behind them. (The compact/mobile header does not
 * have this problem: its wordmark and menu trigger already sit inside the same `PILL_SURFACE`
 * wrapper as everything else, so this mask exists there only for visual consistency, not because
 * it is strictly required.)
 *
 * This mask is a restrained top backdrop layer, not a navbar: a short vertical gradient
 * (`--marketing-background`, the page's own existing token — fully opaque at the very top,
 * smoothly fading to fully transparent by its own bottom edge) plus the same `backdrop-blur-sm`
 * strength `PILL_SURFACE` already uses (not a new, stronger blur value). Height is derived from
 * the accepted header's own occupied envelope plus a deliberate breathing margin — reusing the
 * exact same figures Phase 1L's `scroll-mt-24`/`lg:scroll-mt-28` anchor-offset fix already
 * established for the identical underlying concept ("header envelope + 24px margin"), rather than
 * deriving a new pair of numbers: `h-24` = 96px (compact: 16px top offset + 56px height = 72px
 * envelope + 24px), `lg:h-28` = 112px (desktop: 24px + 64px = 88px envelope + 24px).
 *
 * Layering: `position: fixed` (its own containing block is the true viewport, not this
 * `<header>` — `<header>` has no `transform`/`filter`/`perspective` that would change that), so
 * it starts at true `top: 0` regardless of the header's own `top-4`/`lg:top-6` offset. Rendered as
 * the FIRST child inside this `<header>`, before `DesktopNav`/`MobileNav`: since neither the mask
 * nor those two components carries its own `z-index`, all three participate in the SAME stacking
 * context this `<header>`'s existing `z-40` already establishes, ordered by DOM/paint order — the
 * mask (painted first) sits behind the nav content (painted after) with **no new z-index
 * introduced anywhere**, the smallest deliberate layering change available. `aria-hidden` (purely
 * decorative) and `pointer-events-none` (never intercepts clicks, never enters the tab order,
 * never affects focus rings) — verified via rendered-HTML inspection that it carries no
 * interactive semantics.
 *
 * Not implemented: a blur intensity that itself fades alongside the color gradient — `backdrop-
 * filter` cannot easily express a smooth blur ramp with a single flat layer, and a second stacked
 * layer was judged unnecessary complexity for a "short vertical depth only" mask; the blur is
 * therefore flat across the mask's own height, matching the header's own pill (also a flat blur
 * over a rectangular area), not a gradient blur. No JavaScript, no scroll listener, no
 * shrink-on-scroll — pure CSS, per explicit instruction.
 */
function HeaderMask() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 h-24 bg-gradient-to-b from-[var(--marketing-background)] to-transparent backdrop-blur-sm lg:h-28"
    />
  );
}

export function PublicHeader() {
  return (
    <header className="fixed inset-x-0 top-4 z-40 lg:top-6">
      <HeaderMask />
      <DesktopNav />
      <MobileNav />
    </header>
  );
}
