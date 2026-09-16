import { PublicHeader } from "@/components/site/public-header";
import { PublicHero } from "@/components/site/public-hero";

/**
 * AIX public-site preview — UI Phase 1C.
 *
 * This page exists to review the accepted public header (`PublicHeader`, UI Phase 1B —
 * VISUALLY ACCEPTED, unchanged this turn) together with the new landing hero (`PublicHero`,
 * UI Phase 1C). It is NOT a complete homepage — no feature sections, pricing, footer,
 * testimonials, or portal/dashboard content exist yet; the blank area below the hero is
 * deliberate scroll headroom only, not a placeholder for the next section's content.
 *
 * Background uses the PROVISIONAL, public-marketing-scope-only `--marketing-background` token
 * (see app/globals.css) — not the shared `--background` token, and not final AIX color
 * approval; see the header comment there and UI-02 §17.
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--marketing-background)]">
      <PublicHeader />

      <main>
        <PublicHero />

        <div className="flex min-h-[50vh] items-center justify-center px-6 pb-24 text-center">
          <p className="text-xs text-muted-foreground">
            UI Phase 1C preview — the hero section above is pending user visual review. Further
            homepage sections are not yet built.
          </p>
        </div>
      </main>
    </div>
  );
}
