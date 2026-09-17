import Link from "next/link";
import { SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/components/shell/nav-data";
import { NAV_ICONS } from "@/components/shell/nav-icons";

/**
 * Shared nav-row rendering for `AuthenticatedSidebar` (desktop) and `AuthenticatedMobileNav`
 * (Sheet) — one implementation, not duplicated markup, per `UI-04` §13/`UI Phase 2B` brief's
 * "use shared typed nav data" instruction extended to the rendering itself.
 *
 * Row geometry: 40px height (`h-10`), 20px icons (`size-5`), matching `UI-04` §14's provisional
 * sidebar geometry exactly — the mobile variant reuses the identical row, not a bespoke touch
 * size, since 40px already meets touch-target expectations and a second geometry would be an
 * unjustified new value.
 *
 * Active state ("`UI-04`/this turn: not color-only"): the active row combines THREE non-color-
 * only signals — a left accent border (`border-l-2`, present at all times, just transparent vs.
 * `border-foreground`), a background tint, and a font-weight change — so a user who cannot
 * perceive the color shift still sees the border/weight change.
 *
 * Items without `href` (approved IA per `UI-04`, but no page exists this turn) render as
 * non-interactive, muted rows — not a link, not a button, not focusable, `aria-disabled="true"`
 * (`UI Phase 2D` refinement) — with a visually-hidden "not yet available" note appended to the
 * accessible name for screen-reader users, since a nav-shaped-but-inert row would otherwise be
 * ambiguous to non-visual navigation. This is accessible labeling, not a status-badge system
 * (explicitly not built this turn) — no "Coming Soon" pill, muted text + the sr-only note is the
 * whole treatment.
 */
export function NavList({
  navItems,
  pathname,
  variant = "desktop",
}: {
  navItems: NavItem[];
  pathname: string;
  variant?: "desktop" | "mobile";
}) {
  return (
    <ul className="flex flex-col gap-1">
      {navItems.map((item) => {
        const Icon = NAV_ICONS[item.icon];

        if (!item.href) {
          return (
            <li key={item.label}>
              <div
                aria-disabled="true"
                className="flex h-10 items-center gap-3 rounded-md border-l-2 border-transparent px-3 text-sm text-muted-foreground/60"
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {item.label}
                  <span className="sr-only"> — not yet available</span>
                </span>
              </div>
            </li>
          );
        }

        const isActive = item.href === pathname;
        const link = (
          <Link
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-md border-l-2 px-3 text-sm transition-colors",
              isActive
                ? "border-foreground bg-muted font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );

        return (
          <li key={item.label}>
            {variant === "mobile" ? <SheetClose asChild>{link}</SheetClose> : link}
          </li>
        );
      })}
    </ul>
  );
}
