import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Authenticated page-header — UI Phase 2C's governed pattern (`UI-04` §17/§35.13), implemented
 * as one shared component (`UI Phase 2D`) rather than hand-repeated per page, since the exact
 * spacing below must stay identical across every future authenticated page, not just the three
 * placeholder pages that first used it — a real, measurable-consistency justification for a
 * shared component (`UI-01` §2.1 rule 9), not a thin rename wrapper.
 *
 * Exact governed spacing, all on the 4px grid, none invented: context→title **4px** (`mt-1` on
 * the title, only applied when a context line is present, so a title with no context above it
 * carries no stray top margin); title→description **8px** (`mt-2`); header block→page content
 * **24px** (`mb-6` on the whole block).
 *
 * `context` is optional and only rendered "if justified" (this turn's own phrasing) — a page
 * whose title alone is unambiguous, and which sits directly at its surface's own root with no
 * deeper breadcrumb hierarchy yet, does not need one; passing it is a per-page decision, not a
 * default. Title uses the existing `UI-02` §6 "Page title" role (`text-2xl`, Semibold) — never
 * the public site's `Display` role; no marketing hero, no "Welcome back," no oversized decorative
 * title.
 *
 * `action` (`UI Phase 2E`) is optional — `UI-04` §17's "at most one primary action" — rendered
 * on the same row as the title, right-aligned, never stacked above/below it. The three
 * placeholder pages (`/app`, `/ops`, `/admin`) omit it; only a page with a real, governed primary
 * action (e.g. Wallet & Payout Destinations' "Add Destination") passes one.
 */
export function PageHeader({
  context,
  title,
  description,
  action,
}: {
  context?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {context && <p className="text-xs text-muted-foreground">{context}</p>}
      <div className="flex items-start justify-between gap-4">
        <h1
          className={cn(
            "text-2xl font-semibold tracking-tight text-foreground",
            context && "mt-1",
          )}
        >
          {title}
        </h1>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {description && (
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
