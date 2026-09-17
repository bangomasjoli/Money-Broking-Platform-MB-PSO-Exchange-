import { PublicHeader } from "@/components/site/public-header";
import { PublicHero } from "@/components/site/public-hero";
import { PublicOperatingModel } from "@/components/site/public-operating-model";
import { PublicTrustControl } from "@/components/site/public-trust-control";
import { PublicCapabilities } from "@/components/site/public-capabilities";
import { PublicProductPreview } from "@/components/site/public-product-preview";

/**
 * AIX public-site preview — UI Phase 1G.
 *
 * This page exists to review the accepted public header (`PublicHeader`, UI Phase 1B) and hero
 * (`PublicHero`, UI Phase 1C — both VISUALLY ACCEPTED) together with the "How AIX Works"
 * operating-model section (`PublicOperatingModel`, UI Phase 1D), the "Trust, Governance &
 * Control" section (`PublicTrustControl`, UI Phase 1E), the "Platform Capabilities" section
 * (`PublicCapabilities`, UI Phase 1F), and the new "Product Experience" preview section
 * (`PublicProductPreview`, UI Phase 1G) — Phases 1D-1G all have visual QA intentionally deferred.
 * It is NOT a complete homepage — no pricing, testimonials, partners, footer, FAQ, or the actual
 * authenticated portal exist yet; the blank area below the new section is deliberate scroll
 * headroom only, not a placeholder for the next section's content.
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
        <PublicOperatingModel />
        <PublicTrustControl />
        <PublicCapabilities />
        <PublicProductPreview />

        <div className="flex min-h-[50vh] items-center justify-center px-6 pb-24 text-center">
          <p className="text-xs text-muted-foreground">
            UI Phase 1G preview — the product-experience preview above is implemented with visual
            QA deferred (see docs/04_ui/AIX_UI_MEASUREMENT_SPEC_v0.1.md §25). Further homepage
            sections are not yet built.
          </p>
        </div>
      </main>
    </div>
  );
}
