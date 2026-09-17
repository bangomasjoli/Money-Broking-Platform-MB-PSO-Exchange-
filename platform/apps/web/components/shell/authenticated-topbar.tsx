"use client";

import { User } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthenticatedMobileNav } from "@/components/shell/authenticated-mobile-nav";
import { SURFACES, getActiveLabel, type NavItem, type Surface } from "@/components/shell/nav-data";

/**
 * Authenticated top bar — UI Phase 2B. 56px height (`h-14`) — reuses the exact value the public
 * site's own compact/mobile header already uses (`public-header.tsx`'s `MobileNav`, `h-14`),
 * rather than inventing a new governed height; chosen over 64px to read denser/more operational
 * per `UI-01` §3's "restrained... operational efficiency" authenticated-platform direction.
 *
 * Left: mobile nav trigger (hidden at `xl:`, `AuthenticatedSidebar` takes over) + the current
 * page/section context — derived from the active nav item, falling back to the surface label.
 * Surface identity itself (brand + surface name) lives in the sidebar/mobile-nav header only —
 * not repeated here, per this turn's "surface identity... without decorative duplication" rule.
 *
 * Right: for the Client surface only, a static organisation-context block (`UI-04` §11/§16 —
 * selector vs. authority; this turn's brief explicitly prefers the simpler non-selector
 * presentation) — a plain, non-interactive `<div>` (no `onClick`, no `role="button"`, not
 * focusable), its value a clearly-labeled "Demo placeholder," never a fabricated client name.
 * Then, on every surface, a generic inert account affordance — `disabled` (so it is not a
 * focusable no-op, and its non-functional state is unambiguous) — per this turn's explicit "no
 * fake personal data" instruction: no name, email, photo, role, or company identity invented.
 */
export function AuthenticatedTopbar({
  surface,
  navItems,
}: {
  surface: Surface;
  navItems: NavItem[];
}) {
  const pathname = usePathname();
  const { label: surfaceLabel } = SURFACES[surface];
  const pageLabel = getActiveLabel(navItems, pathname) ?? surfaceLabel;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6 xl:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <AuthenticatedMobileNav surface={surface} navItems={navItems} />
        <span className="truncate text-sm font-medium text-foreground">{pageLabel}</span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {surface === "client" && (
          <div
            className="hidden items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs sm:flex"
            aria-label="Current organisation context — demo placeholder, not real client data"
          >
            <span className="font-medium text-foreground">Organisation context</span>
            <span className="text-muted-foreground">Demo placeholder</span>
          </div>
        )}

        <Button
          variant="ghost"
          className="h-10 gap-2 px-2.5"
          disabled
          aria-label="Account — placeholder, not yet functional"
        >
          <User className="size-5" aria-hidden="true" />
          <span className="hidden sm:inline">Account</span>
        </Button>
      </div>
    </header>
  );
}
