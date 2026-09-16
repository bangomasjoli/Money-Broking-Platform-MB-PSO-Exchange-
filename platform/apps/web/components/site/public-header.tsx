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
 * Breakpoint: the full desktop row (all 5 nav items + wordmark + 2 actions) shows from `md:`
 * (768px) per UI-02 §10.4's tablet range, with the 20px→32px gap step at `lg:` (1024px) exactly
 * as specified. NOTE: this range was NOT empirically verified in a real browser viewport (no
 * screenshot/browser-automation tool was available this turn, and installing one solely for
 * screenshots was explicitly out of scope) — calculated character-width estimates suggest the
 * 768-1023px band may be tight for all 5 labels + wordmark + 2 actions. Flagged for specific
 * attention during the required user visual review; see UI-02's Phase 1B revision note.
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
    <div className="hidden md:block px-6">
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
            <NavigationMenuList className="gap-5 lg:gap-8">
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
    <div className="flex md:hidden px-4">
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

export function PublicHeader() {
  return (
    <header className="fixed inset-x-0 top-4 z-40 md:top-6">
      <DesktopNav />
      <MobileNav />
    </header>
  );
}
