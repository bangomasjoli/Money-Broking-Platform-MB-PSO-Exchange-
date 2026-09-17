import type { ReactNode } from "react";
import { AuthenticatedSidebar } from "@/components/shell/authenticated-sidebar";
import { AuthenticatedTopbar } from "@/components/shell/authenticated-topbar";
import type { NavItem, Surface } from "@/components/shell/nav-data";

/**
 * Authenticated platform shell — UI Phase 2B (`UI-04` §13's structural model, implemented).
 * One shared composition root used by all three surface layouts (`app/app/layout.tsx`,
 * `app/ops/layout.tsx`, `app/admin/layout.tsx`) — each surface gets its OWN layout instance and
 * its own typed nav data, not one shared navigation tree (`UI-04` §4's "not one giant navigation
 * tree" requirement).
 *
 * Structure matches `UI-04` §13's diagram exactly: a full-width top bar above everything, then a
 * row containing the persistent sidebar (`xl:` and up) beside the main content workspace.
 *
 * Main content: fluid width, responsive horizontal padding only (`px-4 sm:px-6 xl:px-8`,
 * matching the top bar's own gutters so both align vertically) — deliberately NO max-width
 * constraint, per this turn's explicit "fluid workspace... not a narrow centered marketing
 * container" instruction; a governed max-width is left for a later page-type-specific decision,
 * not fixed here. `py-6` (24px) top/bottom spacing for placeholder content.
 *
 * This component itself is a plain Server Component — it renders no hook and needs no
 * `"use client"` directive; the interactive pieces (`AuthenticatedTopbar`/`AuthenticatedSidebar`/
 * `AuthenticatedMobileNav`) each carry their own directive where they actually need one.
 */
export function AuthenticatedShell({
  surface,
  navItems,
  children,
}: {
  surface: Surface;
  navItems: NavItem[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AuthenticatedTopbar surface={surface} navItems={navItems} />

      <div className="flex flex-1">
        <AuthenticatedSidebar surface={surface} navItems={navItems} />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 xl:px-8">{children}</main>
      </div>
    </div>
  );
}
