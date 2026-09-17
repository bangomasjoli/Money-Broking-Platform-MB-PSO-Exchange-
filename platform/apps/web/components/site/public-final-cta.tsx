import { Button } from "@/components/ui/button";

/**
 * AIX public-site "Final CTA / Request Access" homepage section (UI Phase 1H) — the closing
 * content block, below `PublicProductPreview`. Every prior public-site component
 * (`PublicHeader`/`PublicHero`/`PublicOperatingModel`/`PublicTrustControl`/`PublicCapabilities`/
 * `PublicProductPreview`, Phases 1B-1G) is consumed unchanged, not redesigned.
 *
 * AUDIENCE: institutional / HNWI / professional only, per the platform's own MVP client scope
 * (`docs/01_masters/03_Master_Module_Index_v1.2.md`: "MVP client type = institutional and
 * HNWI/professional only... Retail onboarding is disabled by default" — already confirmed and
 * used in Phase 1F). No retail-oriented copy ("Start trading now," "Open an account in minutes,"
 * "Sign up free," etc.) appears anywhere.
 *
 * REGULATORY BOUNDARY: the note below uses this turn's exact suggested wording — "Access and
 * available functionality are subject to eligibility, onboarding, applicable approvals, and
 * controlled platform enablement" — deliberately, since it was already calibrated to avoid
 * implying that Money Broking/PSO (already `licence_money_broking_status = approved`/
 * `licence_pso_status = approved`, per `docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.3.md`,
 * already used in Phase 1F) are themselves unapproved — "applicable approvals," not a blanket
 * "subject to regulatory approval."
 *
 * COPY NARRATIVE: the heading ("Start a conversation...") and secondary CTA ("Speak With Our
 * Team") deliberately share the same "conversation" framing — a small, intentional copy
 * cohesion choice, not a coincidence. The primary CTA label ("Request Access") is the exact same
 * label `PublicHeader`'s own inert CTA already uses, giving this section a sense of "this is the
 * moment the header's own call-to-action has been pointing toward" rather than introducing a
 * competing label.
 *
 * INTERACTION: both CTAs are fully inert (no `href`, no `onClick`) — the same treatment
 * `PublicHeader`'s and `PublicHero`'s own CTAs already use. No email/KYC/waitlist/account-opening
 * form was built — this turn is section/CTA presentation only, per explicit instruction.
 *
 * LAYOUT: two-column at `lg:` (1024px+) — LEFT heading/copy, RIGHT primary+secondary actions and
 * the boundary note — deliberately echoing `PublicHero`'s own LEFT-copy/RIGHT-content asymmetry
 * (without repeating its content) so this closing section reads as a visual "bookend" to the
 * opening hero, per this turn's "should feel visually conclusive... echoing the hero" intent.
 * Below `lg:`: single column, left-aligned (matching `PublicTrustControl`'s own collapse
 * treatment, since both sections share the same LEFT/RIGHT desktop structure) — copy above,
 * actions below.
 *
 * SURFACE: a full-bleed section background using the existing, already-established
 * `--marketing-surface` token (the same token `PublicHero`'s pill and `PublicOperatingModel`'s/
 * `PublicTrustControl`'s/`PublicCapabilities`'s icon markers already use) — not a new token, and
 * not a contained bordered panel (no radius applies, since the surface spans the full section
 * width, not a boxed container within it). This gives the closing section the "slightly stronger
 * surface separation" this turn suggested from the busier `PublicProductPreview` section above
 * it, without introducing new color.
 */

const CONTAINER_CLASS = "mx-auto max-w-[1280px] px-4 md:px-8 lg:px-12";

export function PublicFinalCta() {
  return (
    <section
      // id added in UI Phase 1I for PublicFooter's same-page anchor — no visual change.
      // scroll-mt-24/lg:scroll-mt-28 added in UI Phase 1L (UI-QA-001 fix) — clears the fixed
      // header's occupied envelope plus 24px breathing margin; see public-operating-model.tsx's
      // own comment for the full arithmetic, identical across all 5 anchored sections.
      id="request-access"
      aria-labelledby="final-cta-heading"
      className="scroll-mt-24 bg-[var(--marketing-surface)] pt-16 pb-20 md:pt-20 md:pb-24 lg:scroll-mt-28 lg:pt-24 lg:pb-28"
    >
      <div className={CONTAINER_CLASS}>
        <div className="grid grid-cols-1 items-center gap-10 md:gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Request Access
            </p>
            <h2
              id="final-cta-heading"
              className="mt-4 max-w-[480px] text-[32px] leading-[1.15] font-semibold tracking-tight text-foreground md:text-[36px] lg:text-[40px]"
            >
              Start a conversation about your operating needs.
            </h2>
            <p className="mt-4 max-w-[440px] text-base leading-[1.5] text-muted-foreground">
              Access to AIX is available to institutional, HNWI, and professional clients,
              subject to eligibility, onboarding, and controlled platform enablement.
            </p>
          </div>

          <div className="lg:flex lg:flex-col lg:items-start">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button variant="default" className="h-12 w-full px-6 sm:w-auto">
                Request Access
              </Button>
              <Button variant="outline" className="h-12 w-full px-6 sm:w-auto">
                Speak With Our Team
              </Button>
            </div>
            <p className="mt-4 max-w-[320px] text-xs leading-[1.5] text-muted-foreground">
              Access and available functionality are subject to eligibility, onboarding,
              applicable approvals, and controlled platform enablement.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
