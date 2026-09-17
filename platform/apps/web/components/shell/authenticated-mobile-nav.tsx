"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavList } from "@/components/shell/nav-list";
import { SURFACES, type NavItem, type Surface } from "@/components/shell/nav-data";

/**
 * Mobile/tablet authenticated navigation — UI Phase 2B structure, UI Phase 2C visual treatment.
 * Reuses the existing `Sheet` primitive (already installed for the public site's own mobile nav,
 * `public-header.tsx`) rather than installing a new drawer component. Visible only below `xl:`
 * (1280px) — the trigger itself carries `xl:hidden` so it disappears once the persistent sidebar
 * takes over, matching this turn's "simplest coherent responsive shell" (one breakpoint, no
 * separate 1024–1279px intermediate state).
 *
 * Renders the SAME typed `navItems` array `AuthenticatedSidebar` uses (`NavList`, shared) — no
 * hand-duplicated nav list. Each real link is wrapped in `SheetClose asChild` so tapping it both
 * navigates and closes the drawer in one action (Radix `Dialog.Close` composition); inert
 * (`href`-less) rows are not wrapped, since they do nothing to close.
 *
 * 40px trigger touch target (`size-10`) matches the existing public-site mobile menu trigger
 * (`public-header.tsx`'s `MobileNav`) — reused, not a new value.
 *
 * `UI Phase 2C`'s "style the Sheet consistently with the sidebar, not a separate visual
 * language" (`UI-04` §35): the header now mirrors `AuthenticatedSidebar`'s own brand block
 * exactly (an "AIX" wordmark plus the subordinate surface label, same weight/opacity treatment)
 * instead of a bare `SheetTitle`. Since the top bar's own client-context text pairing is shown
 * only at `xl:` (`AuthenticatedTopbar`'s own doc comment explains why), the same context is
 * carried here for the Client surface below `xl:`, so the information is not lost on mobile/
 * tablet — same wording, same "Demo placeholder, never a fabricated name" rule. The Sheet's own
 * container keeps the `OVERLAY` tier's existing `bg-popover` (`UI-04` §35.6) — unchanged, already
 * correct; only the header content inside is restyled to match the sidebar. Nav rows themselves
 * are identical by construction (`NavList`, shared) — active state, inert/disabled treatment,
 * and icon sizing all come from the same one implementation, never duplicated.
 */
export function AuthenticatedMobileNav({
  surface,
  navItems,
}: {
  surface: Surface;
  navItems: NavItem[];
}) {
  const pathname = usePathname();
  const { label } = SURFACES[surface];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          className="size-10 xl:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle className="text-sm font-semibold tracking-tight text-foreground">
            AIX
          </SheetTitle>
          <span className="text-xs text-muted-foreground">{label}</span>
          {surface === "client" && (
            <div
              className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs"
              aria-label="Current organisation context — demo placeholder, not real client data"
            >
              <span className="text-muted-foreground">Organisation</span>
              <span className="font-medium text-foreground">Demo placeholder</span>
            </div>
          )}
        </SheetHeader>
        <nav aria-label={`${label} primary`} className="flex flex-col px-4 pb-4">
          <NavList navItems={navItems} pathname={pathname} variant="mobile" />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
