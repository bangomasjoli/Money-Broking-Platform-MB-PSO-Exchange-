"use client";

import { usePathname } from "next/navigation";
import { NavList } from "@/components/shell/nav-list";
import { SURFACES, type NavItem, type Surface } from "@/components/shell/nav-data";

/**
 * Desktop authenticated sidebar — UI Phase 2B. Persistent at `xl:` (1280px) and above only
 * (`UI-04` §24's persistent-sidebar breakpoint); hidden below `xl:` in favor of
 * `AuthenticatedMobileNav`'s Sheet drawer, per this turn's explicit "simplest coherent
 * responsive shell" instruction — no intermediate 1024–1279px collapsed-icon state, since
 * `UI-04` §14 recorded collapse as "not yet justified" and this turn does not introduce one
 * merely because UI-04 named it as a future conceptual option.
 *
 * Geometry, exactly `UI-04` §14's provisional values (all on the 4px grid, none invented here):
 * 240px expanded width (`xl:w-60`), 40px nav-row height (`NavList`'s own `h-10`), 20px icons
 * (`NavList`'s own `size-5`), 24px "group spacing" — applied as the nav list's own top/bottom
 * padding (`py-6`) and as the gap below the brand/surface header block, since this turn's
 * approved IA has no sub-grouped nav for any surface yet (no multi-group layout to space
 * between) — recorded as provisional until a future surface actually needs grouped sections.
 *
 * No collapse control, no icon-only rail — brand/surface label and every nav item always show
 * full text, per `UI-01` §4's rejection of "icon-only mystery controls."
 */
export function AuthenticatedSidebar({
  surface,
  navItems,
}: {
  surface: Surface;
  navItems: NavItem[];
}) {
  const pathname = usePathname();
  const { label } = SURFACES[surface];

  return (
    <aside className="hidden xl:flex xl:w-60 xl:shrink-0 xl:flex-col xl:border-r xl:border-border">
      <div className="flex h-14 shrink-0 flex-col justify-center border-b border-border px-4">
        <span className="text-sm font-semibold tracking-tight text-foreground">AIX</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>

      <nav aria-label={`${label} primary`} className="flex flex-1 flex-col overflow-y-auto px-3 py-6">
        <NavList navItems={navItems} pathname={pathname} variant="desktop" />
      </nav>
    </aside>
  );
}
