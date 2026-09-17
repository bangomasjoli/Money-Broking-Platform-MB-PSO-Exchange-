"use client";

import { User } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthenticatedMobileNav } from "@/components/shell/authenticated-mobile-nav";
import { SURFACES, getActiveLabel, type NavItem, type Surface } from "@/components/shell/nav-data";

/**
 * Authenticated top bar — UI Phase 2B structure, UI Phase 2C visual treatment. 56px height
 * (`h-14`) — reuses the exact value the public site's own compact/mobile header already uses
 * (`public-header.tsx`'s `MobileNav`, `h-14`), rather than inventing a new governed height;
 * chosen over 64px to read denser/more operational per `UI-01` §3's "restrained... operational
 * efficiency" authenticated-platform direction. Preserved unchanged this turn.
 *
 * `UI Phase 2C` `SURFACE-1` treatment (`UI-04` §35.6/§35.11): `bg-sidebar`/`text-sidebar-
 * foreground` and `border-sidebar-border` — grouping the top bar with the sidebar as one chrome
 * tier, per `UI-04` §35.6's own example. No shadow, no gradient.
 *
 * Left: mobile nav trigger (hidden at `xl:`, `AuthenticatedSidebar` takes over) + the current
 * page/section context — derived from the active nav item, falling back to the surface label.
 * Surface identity itself (brand + surface name) lives in the sidebar/mobile-nav header only —
 * not repeated here, per this turn's "surface identity... without decorative duplication" rule.
 *
 * Right: for the Client surface only, a static organisation-context text pairing — refined this
 * turn (`UI-04` §35.12) from a bordered/backgrounded box to plain inline text (a label plus a
 * value, separated by a quiet `border-l`), so it reads as contextual metadata rather than a
 * badge. Shown only at `xl:` (alongside the persistent sidebar) rather than from `sm:` up as
 * before — a deliberate, conservative choice: no screenshot/browser tool is available this turn
 * (see `UI-04`'s new Phase 2D visual-QA-blocked record) to confirm the tighter text pairing
 * fits without collision across the full 640–1279px tablet range, so it is not risked in the
 * topbar there; the same context is instead shown inside `AuthenticatedMobileNav`'s Sheet header
 * below `xl:`, where there is no width constraint to collide with. Still a plain, non-interactive
 * `<div>` (no `onClick`, no `role="button"`, not focusable), its value a clearly-labeled "Demo
 * placeholder," never a fabricated client name.
 *
 * Every surface carries a generic inert account affordance — `disabled` (so it is not a
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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground sm:px-6 xl:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <AuthenticatedMobileNav surface={surface} navItems={navItems} />
        <span className="truncate text-sm font-medium text-sidebar-foreground">{pageLabel}</span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {surface === "client" && (
          <div
            className="hidden items-center gap-2 border-l border-sidebar-border pl-3 text-xs xl:flex"
            aria-label="Current organisation context — demo placeholder, not real client data"
          >
            <span className="text-sidebar-foreground/60">Organisation</span>
            <span className="font-medium text-sidebar-foreground">Demo placeholder</span>
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
