import { PublicHeader } from "@/components/site/public-header";

/**
 * AIX public-site preview — UI Phase 1B.
 *
 * This page exists ONLY to review the floating-pill navigation (`PublicHeader`) in context.
 * It is NOT a hero section, NOT a dashboard, NOT product content, and NOT a marketing-copy
 * exercise — deliberately minimal per this turn's explicit scope. The tall blank body below
 * exists solely so sticky/fixed header behavior can be verified by scrolling.
 *
 * Background uses the PROVISIONAL, public-marketing-scope-only `--marketing-background` token
 * (see app/globals.css) — not the shared `--background` token, and not final AIX color
 * approval; see the header comment there and UI-02 §17.
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--marketing-background)]">
      <PublicHeader />

      <main className="min-h-[250vh] pt-32">
        <div className="px-6 pt-4 text-center">
          <p className="text-sm text-muted-foreground">
            AIX public-site preview — UI Phase 1B. This page exists only to review the floating
            navigation header above; it is not an approved page design.
          </p>
        </div>

        <div className="flex min-h-[220vh] items-start justify-center pt-24">
          <p className="text-xs text-muted-foreground">
            Scroll to verify the header remains fixed in place.
          </p>
        </div>
      </main>
    </div>
  );
}
