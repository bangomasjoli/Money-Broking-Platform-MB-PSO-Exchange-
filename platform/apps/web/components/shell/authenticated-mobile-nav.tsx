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
 * Mobile/tablet authenticated navigation — UI Phase 2B. Reuses the existing `Sheet` primitive
 * (already installed for the public site's own mobile nav, `public-header.tsx`) rather than
 * installing a new drawer component. Visible only below `xl:` (1280px) — the trigger itself
 * carries `xl:hidden` so it disappears once the persistent sidebar takes over, matching this
 * turn's "simplest coherent responsive shell" (one breakpoint, no separate 1024–1279px
 * intermediate state).
 *
 * Renders the SAME typed `navItems` array `AuthenticatedSidebar` uses (`NavList`, shared) — no
 * hand-duplicated nav list. Each real link is wrapped in `SheetClose asChild` so tapping it both
 * navigates and closes the drawer in one action (Radix `Dialog.Close` composition); inert
 * (`href`-less) rows are not wrapped, since they do nothing to close.
 *
 * 40px trigger touch target (`size-10`) matches the existing public-site mobile menu trigger
 * (`public-header.tsx`'s `MobileNav`) — reused, not a new value.
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
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        <nav aria-label={`${label} primary`} className="flex flex-col px-4 pb-4">
          <NavList navItems={navItems} pathname={pathname} variant="mobile" />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
