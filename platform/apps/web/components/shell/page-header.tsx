import { cn } from "@/lib/utils";

/**
 * Authenticated page-header — UI Phase 2C's governed pattern (`UI-04` §17/§35.13), implemented
 * as one shared component (`UI Phase 2D`) rather than hand-repeated per page, since the exact
 * spacing below must stay identical across every future authenticated page, not just the three
 * placeholder pages that use it today — a real, measurable-consistency justification for a
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
 */
export function PageHeader({
  context,
  title,
  description,
}: {
  context?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6">
      {context && <p className="text-xs text-muted-foreground">{context}</p>}
      <h1
        className={cn(
          "text-2xl font-semibold tracking-tight text-foreground",
          context && "mt-1",
        )}
      >
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
