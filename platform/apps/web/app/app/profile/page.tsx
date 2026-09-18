import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";
import { AuthorisedRepresentatives } from "@/components/profile/authorised-representatives";
import { ClientClassification, OrganisationDetails } from "@/components/profile/organisation-summary";
import { ComplianceSummary, ProfileCompleteness } from "@/components/profile/profile-status";

/**
 * Client Portal — Profile / Organisation. UI Phase 2G — the second `B`-classified authenticated
 * client page. Route: `/app/profile` — chosen over `/app/organisation` to match `UI Phase 2E`'s
 * own established precedent of anchoring the route on the governed nav label's FIRST word
 * ("Wallet & Payout Destinations" → `/app/wallet-destinations`; "Profile / Organisation" →
 * `/app/profile`), not a fresh content-based judgment call.
 *
 * Stays `B`-classified: `CLT-01` genuinely owns every field shown (real `client_profile` columns,
 * real `authorised_party` role vocabulary), verified against backend source this turn, but no
 * public client-facing projection route exists for any of it — confirmed by re-scanning every
 * backend service's registered routes (unchanged from `UI Phase 2A`/`2E`/`2F`'s own findings).
 * Full capability map: `UI-04` §42.1.
 *
 * **Two candidate sections were evaluated and OMITTED, not implemented as demo-only** —
 * Registered Address (no address field/table exists anywhere in `CLT-01`'s actual schema — zero
 * evidence, not merely "no public projection") and Primary Contact (only a bare, optional
 * `applicant_email` exists, and only on the pre-approval `client_application` record, never
 * copied to the persisted `client_profile` — showing it as an ongoing "primary contact" would
 * misrepresent its real scope). Full reasoning: `UI-04` §42.1/§42.3.
 *
 * **Read-only.** No client-facing profile-update route exists (`CLT-01` is entirely internal) —
 * no Edit button anywhere on this page; a single closing note states this explicitly rather than
 * shipping a button that does nothing.
 *
 * Shares `DEMO_CLIENT_STATE` (`components/client/client-demo-data.ts`, extracted this turn) with
 * `UI Phase 2F`'s Overview page — client lifecycle, KYC/KYB state, and eligibility can never
 * disagree between the two pages.
 */
export default function ProfilePage() {
  return (
    <div>
      <PageHeader
        title="Profile / Organisation"
        description="Review the organisation information associated with your AIX client profile."
      />

      <DemoDisclosure>
        Interface preview — organisation profile data is demonstrative until the required
        client-facing profile projection is implemented.
      </DemoDisclosure>

      <div className="flex flex-col gap-8">
        <OrganisationDetails />
        <ClientClassification />
        <AuthorisedRepresentatives />
        <ComplianceSummary />
        <ProfileCompleteness />
      </div>

      <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
        Profile updates are not yet available in this interface.
      </p>
    </div>
  );
}
