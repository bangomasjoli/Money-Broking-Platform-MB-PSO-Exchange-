import { PublicHeader } from "@/components/site/public-header";
import { PublicHero } from "@/components/site/public-hero";
import { PublicOperatingModel } from "@/components/site/public-operating-model";
import { PublicTrustControl } from "@/components/site/public-trust-control";
import { PublicCapabilities } from "@/components/site/public-capabilities";
import { PublicProductPreview } from "@/components/site/public-product-preview";
import { PublicFinalCta } from "@/components/site/public-final-cta";
import { PublicFooter } from "@/components/site/public-footer";

/**
 * AIX public homepage — UI Phase 1I.
 *
 * PUBLIC HOMEPAGE STRUCTURE: IMPLEMENTATION COMPLETE / CONSOLIDATED VISUAL QA PENDING. Every
 * planned structural component now exists: the accepted `PublicHeader` (UI Phase 1B) and
 * `PublicHero` (UI Phase 1C, both VISUALLY ACCEPTED), the "How AIX Works" operating-model
 * section (`PublicOperatingModel`, 1D), "Trust, Governance & Control" (`PublicTrustControl`,
 * 1E), "Platform Capabilities" (`PublicCapabilities`, 1F), the "Product Experience" preview
 * (`PublicProductPreview`, 1G), the closing "Request Access" section (`PublicFinalCta`, 1H), and
 * now `PublicFooter` (1I). Phases 1D-1I all have visual QA intentionally deferred — this
 * structural completeness is **not** a visual-acceptance claim; the next activity is a
 * consolidated visual QA pass across the whole page, not a further structural addition. No
 * pricing/testimonials/FAQ/partner content and no authenticated-portal content exist — this
 * remains the public marketing homepage only.
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
      </main>

      <PublicFooter />
    </div>
  );
}
