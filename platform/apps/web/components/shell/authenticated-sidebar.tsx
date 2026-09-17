"use client";

import { usePathname } from "next/navigation";
import { NavList } from "@/components/shell/nav-list";
import { SURFACES, type NavItem, type Surface } from "@/components/shell/nav-data";

/**
 * Desktop authenticated sidebar — UI Phase 2B structure, UI Phase 2C visual treatment.
 * Persistent at `xl:` (1280px) and above only (`UI-04` §24's persistent-sidebar breakpoint);
 * hidden below `xl:` in favor of `AuthenticatedMobileNav`'s Sheet drawer, per this turn's
 * explicit "simplest coherent responsive shell" instruction — no intermediate 1024–1279px
 * collapsed-icon state, since `UI-04` §14 recorded collapse as "not yet justified" and this turn
 * does not introduce one merely because UI-04 named it as a future conceptual option.
 *
 * Geometry, exactly `UI-04` §14's provisional values (all on the 4px grid, none invented here):
 * 240px expanded width (`xl:w-60`), 40px nav-row height (`NavList`'s own `h-10`), 20px icons
 * (`NavList`'s own `size-5`), 24px "group spacing" — applied as the nav list's own top/bottom
 * padding (`py-6`) and as the gap below the brand/surface header block, since this turn's
 * approved IA has no sub-grouped nav for any surface yet (no multi-group layout to space
 * between) — recorded as provisional until a future surface actually needs grouped sections.
 * Preserved unchanged this turn — no visual defect in the structural geometry was found.
 *
 * `UI Phase 2C` `SURFACE-1` treatment (`UI-04` §35.6/§35.10): `bg-sidebar`/`text-sidebar-
 * foreground` — the already-existing, previously-unused shadcn "Nova" sidebar token family
 * (`oklch(0.985 0 0)` vs. `--background`'s `oklch(1 0 0)` — a subtle, already-shipped tint, no
 * new color introduced). Internal/boundary dividers use `--sidebar-border` rather than the
 * generic `--border` for the same reason (both currently equal in value, this is a semantic
 * correctness change, not a visible one). Brand ("AIX") uses full `text-sidebar-foreground`
 * emphasis; the surface label sits subordinate at `/60` opacity, per this turn's explicit "surface
 * labels... subordinate to AIX... avoid duplicated large surface titles" instruction — no new
 * typography role, an opacity modifier on the existing token.
 *
 * No collapse control, no icon-only rail — brand/surface label and every nav item always show
 * full text, per `UI-01` §4's rejection of "icon-only mystery controls." No shadow, no gradient,
 * no rounded card — a plain, bordered, flat chrome panel per `UI-02` §9's authenticated elevation
 * rule.
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
    <aside className="hidden xl:flex xl:w-60 xl:shrink-0 xl:flex-col xl:border-r xl:border-sidebar-border xl:bg-sidebar xl:text-sidebar-foreground">
      <div className="flex h-14 shrink-0 flex-col justify-center border-b border-sidebar-border px-4">
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">AIX</span>
        <span className="text-xs text-sidebar-foreground/60">{label}</span>
      </div>

      <nav aria-label={`${label} primary`} className="flex flex-1 flex-col overflow-y-auto px-3 py-6">
        <NavList navItems={navItems} pathname={pathname} variant="desktop" />
      </nav>
    </aside>
  );
}
