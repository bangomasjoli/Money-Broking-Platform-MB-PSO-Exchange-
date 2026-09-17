import { PublicHeader } from "@/components/site/public-header";
import { PublicHero } from "@/components/site/public-hero";
import { PublicOperatingModel } from "@/components/site/public-operating-model";
import { PublicTrustControl } from "@/components/site/public-trust-control";
import { PublicCapabilities } from "@/components/site/public-capabilities";
import { PublicProductPreview } from "@/components/site/public-product-preview";
import { PublicFinalCta } from "@/components/site/public-final-cta";

/**
 * AIX public-site preview — UI Phase 1H.
 *
 * This page exists to review the accepted public header (`PublicHeader`, UI Phase 1B) and hero
 * (`PublicHero`, UI Phase 1C — both VISUALLY ACCEPTED) together with the "How AIX Works"
 * operating-model section (`PublicOperatingModel`, UI Phase 1D), the "Trust, Governance &
 * Control" section (`PublicTrustControl`, UI Phase 1E), the "Platform Capabilities" section
 * (`PublicCapabilities`, UI Phase 1F), the "Product Experience" preview section
 * (`PublicProductPreview`, UI Phase 1G), and the new closing "Request Access" section
 * (`PublicFinalCta`, UI Phase 1H) — Phases 1D-1H all have visual QA intentionally deferred. It is
 * NOT a complete homepage — no footer or further content section exists yet; the blank area
 * below the closing section is deliberate scroll headroom only.
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
        <PublicFinalCta />

        <div className="flex min-h-[30vh] items-center justify-center px-6 pb-24 text-center">
          <p className="text-xs text-muted-foreground">
            UI Phase 1H preview — the closing &ldquo;Request Access&rdquo; section above is
            implemented with visual QA deferred (see
            docs/04_ui/AIX_UI_MEASUREMENT_SPEC_v0.1.md §26). No footer or further homepage
            section exists yet.
          </p>
        </div>
      </main>
    </div>
  );
}
