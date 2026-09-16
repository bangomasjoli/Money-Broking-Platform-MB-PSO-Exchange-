import { CheckCircle2, Circle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * AIX public-site landing hero (UI Phase 1C) — header + hero only, per this turn's explicit
 * scope. No feature sections, pricing, footer, testimonials, or portal/dashboard UI belong here.
 *
 * HEADER RELATIONSHIP: `PublicHeader` (UI Phase 1B, VISUALLY ACCEPTED) is `fixed` and removed
 * from normal document flow — this section is deliberately the first flow content and owns the
 * top offset that keeps content clear of it. Computed, not guessed:
 *   - compact header (below `lg:`, 1024px): 16px top offset + 56px height = 72px bottom edge
 *   - desktop header (`lg:`, 1024px+): 24px top offset + 64px height = 88px bottom edge
 *   - + a single governed 48px (space-12) breathing gap at every breakpoint
 *   => `pt-[120px]` (72+48) below `lg:`, `lg:pt-[136px]` (88+48) at `lg:` and up.
 * Both values are exact 4px-grid multiples (120/4=30, 136/4=34), not eyeballed.
 *
 * CONTAINER / GUTTERS: content capped at UI-02 §7's `marketing-wide` 1280px, centered via
 * `mx-auto`. Horizontal gutter matches UI-02 §8 exactly for mobile (16px)/tablet (32px)/
 * desktop (48px). The large-desktop (>=1440px) 64px gutter tier is NOT implemented as a fourth
 * explicit breakpoint this turn — beyond 1280+2*48=1376px the container's own centering already
 * produces growing whitespace past that point, which was judged sufficient for this scope; a
 * distinct 1440px step can be added later if visual QA disagrees.
 *
 * LAYOUT: two-column at `lg:` (copy left / product-preview panel right) per this turn's
 * recommended composition — chosen because an asymmetric copy+CTA vs. concrete product-preview
 * split reads more "product-oriented" and less like a generic centered-hype landing page than a
 * centered single column would. Stacks to a single column (copy, then preview) below `lg:`.
 *
 * BACKGROUND: deliberately flat — no gradient/blob layer was added this turn. The brief allows a
 * "very restrained" gradient, but a decorative background layer was judged unnecessary for a
 * first pass and is the single most explicitly flagged anti-pattern ("purple blob background") —
 * safer to ship flat now and add a reviewed, deliberate treatment later than risk drifting toward
 * that pattern. The page's existing `--marketing-background` token (app/page.tsx) already
 * provides the section's background.
 *
 * CTAs: "Request Access" (primary) / "Explore Platform" (secondary) are both fully inert
 * (no `href`, no `onClick`) — the same treatment `PublicHeader`'s accepted CTAs already use, kept
 * consistent rather than introducing a different placeholder convention (e.g. a fragment anchor
 * to a section that does not exist below the hero yet).
 *
 * PRODUCT PREVIEW: an original AIX panel, not a copy of another product's dashboard. It
 * illustrates the maker-checker wallet-destination-approval workflow that is a real, already
 * backed AIX concept (IAM-02 maker-checker + approval-to-execution binding — see
 * docs/00_project_state/PROJECT_HANDOVER.md), not an invented capability. Explicitly labeled
 * "Demo preview" in the panel header and "not connected to live data" in its footer caption — no
 * fabricated dollar amounts, user counts, or volumes appear anywhere in it.
 */

const CTA_GAP_CLASS = "gap-4"; // 16px (space-4) — larger than the header's 12px CTA gap, a
// deliberate, documented choice: these are 48px Large CTAs, not the header's 40px Default ones,
// and the larger control height reads better with proportionally more space between them.

const HEADLINE_MAX_WIDTH = "max-w-[560px]"; // governed cap so Display-size text never runs
// edge-to-edge; kept independent of the grid column's own width.

const PARAGRAPH_MAX_WIDTH = "max-w-[480px]"; // Body-role reading measure, UI-02 §7.

type PreviewStep = {
  label: string;
  status: "Complete" | "Pending" | "Awaiting";
};

const PREVIEW_STEPS: PreviewStep[] = [
  { label: "Request submitted by maker", status: "Complete" },
  { label: "Checker review in progress", status: "Pending" },
  { label: "Two-person approval required before execution", status: "Awaiting" },
];

function PreviewStatusIcon({ status }: { status: PreviewStep["status"] }) {
  const commonProps = { className: "size-4 shrink-0", "aria-hidden": true as const };
  if (status === "Complete") {
    return <CheckCircle2 {...commonProps} className={`${commonProps.className} text-emerald-600 dark:text-emerald-400`} />;
  }
  if (status === "Pending") {
    return <Clock {...commonProps} className={`${commonProps.className} text-amber-600 dark:text-amber-500`} />;
  }
  return <Circle {...commonProps} className={`${commonProps.className} text-muted-foreground`} />;
}

function statusTextClass(status: PreviewStep["status"]) {
  if (status === "Complete") return "text-emerald-600 dark:text-emerald-400";
  if (status === "Pending") return "text-amber-600 dark:text-amber-500";
  return "text-muted-foreground";
}

function ProductPreviewPanel() {
  return (
    <div
      aria-label="Product preview: wallet destination approval, demo data only"
      // rounded-[12px], not the shared rounded-xl utility: rounded-xl resolves to
      // var(--radius)*1.4 = 14px (verified against compiled CSS), which does not match UI-02 §5's
      // governed 12px "Cards/panels" radius tier. An arbitrary value hits the exact governed
      // number instead of drifting off it via the shared --radius scale.
      className="w-full max-w-[420px] rounded-[12px] border border-border/60 bg-[var(--marketing-surface)] p-6 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Wallet Destination Approval</h2>
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Demo preview
        </span>
      </div>

      <div className="mt-4 divide-y divide-border/60">
        {PREVIEW_STEPS.map((step) => (
          <div key={step.label} className="flex items-center gap-3 py-3">
            <PreviewStatusIcon status={step.status} />
            <span className="flex-1 text-sm text-foreground">{step.label}</span>
            <span className={`text-xs font-medium ${statusTextClass(step.status)}`}>
              {step.status}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-border/60 pt-4 text-xs text-muted-foreground">
        Illustrative workflow only — not connected to live data.
      </p>
    </div>
  );
}

export function PublicHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="pt-[120px] pb-16 md:pb-20 lg:pt-[136px] lg:pb-24"
    >
      <div className="mx-auto max-w-[1280px] px-4 md:px-8 lg:px-12">
        <div className="grid grid-cols-1 items-center gap-10 md:gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Digital-Finance Infrastructure
            </p>

            <h1
              id="hero-heading"
              className={`mt-4 text-[40px] leading-[1.1] font-semibold tracking-tight text-foreground md:text-[48px] lg:text-[56px] ${HEADLINE_MAX_WIDTH}`}
            >
              Infrastructure for governed money broking and digital-asset operations.
            </h1>

            <p className={`mt-6 text-base leading-[1.5] text-muted-foreground ${PARAGRAPH_MAX_WIDTH}`}>
              AIX delivers secure, auditable workflows for payments and controlled digital-asset
              operations — built for compliance-first execution and operational transparency, not
              experimental tooling.
            </p>

            <div className={`mt-8 flex flex-col sm:flex-row sm:items-center ${CTA_GAP_CLASS}`}>
              {/* Full-width below `sm:` (640px) — a deliberate mobile tap-target choice, not
                  the desktop content-width shrunk down; reverts to content-width at `sm:` and up
                  once the two CTAs sit side by side. */}
              <Button variant="default" className="h-12 w-full px-6 sm:w-auto">
                Request Access
              </Button>
              <Button variant="outline" className="h-12 w-full px-6 sm:w-auto">
                Explore Platform
              </Button>
            </div>
          </div>

          <div className="flex w-full justify-center lg:justify-start">
            <ProductPreviewPanel />
          </div>
        </div>
      </div>
    </section>
  );
}
