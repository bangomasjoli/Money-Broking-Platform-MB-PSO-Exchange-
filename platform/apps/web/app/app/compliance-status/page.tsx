import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";
import { CurrentStatus } from "@/components/compliance/current-status";
import { OutstandingInformation } from "@/components/compliance/outstanding-information";
import { NextSteps, VerificationAreas } from "@/components/compliance/verification-summary";

/**
 * Client Portal — KYC / KYB Compliance Status. UI Phase 2H — the third `B`-classified
 * authenticated client page. Route: `/app/compliance-status` — this turn's own default
 * suggestion, taken as-is rather than `/app/kyc`: the governed nav label ("KYC / KYB Compliance
 * Status") covers both KYC and KYB, and "kyc" alone would read as narrower than this page's
 * actual scope (unlike `UI Phase 2E`/`2G`'s own route precedent, where the nav label's first word
 * cleanly named the whole page).
 *
 * Stays `B`-classified: `KYC-01` genuinely owns every concept shown (real `kyc_case.status`, real
 * `CHECKLIST_ITEM_STATUSES`, real document types), verified against backend source this turn, but
 * no public client-facing route exists anywhere in `KYC-01` — confirmed by re-scanning every
 * registered route (unchanged from `UI Phase 2A`/`2F`/`2G`'s own findings). `KYC-01`'s own
 * `outcome_publication` mechanism delivers outcomes service-to-service into `CLT-01` only — never
 * to a client-facing surface. Full capability/status map: `UI-04` §43.1.
 *
 * **No file upload, no timeline/progress bar, no risk rating, no AML/screening/EDD/STR detail, no
 * internal case-management data (owner/reviewer/analyst/notes/queue)** — all evaluated and
 * omitted, per this turn's own explicit boundaries; full reasoning in each section's own doc
 * comment and `UI-04` §43.
 *
 * Shares `DEMO_CLIENT_STATE.kycCaseStatus` and `UBO_ON_FILE`
 * (`components/client/client-demo-data.ts`) with `UI Phase 2F`'s Overview and `UI Phase 2G`'s
 * Profile pages — all three can never disagree about KYC/KYB state or beneficial-ownership status.
 *
 * `≥1280px` (`xl:`): asymmetric two-column layout (primary: Current Status + Outstanding
 * Information; secondary: Verification Areas + Next Steps) — same split breakpoint and rationale
 * as `UI Phase 2F`'s Overview page (splitting only where the shell's own sidebar also engages).
 * Below `xl:`: single column, stacked in the same order.
 */
export default function ComplianceStatusPage() {
  return (
    <div>
      <PageHeader
        title="KYC / KYB Compliance Status"
        description="Review the current verification status for your organisation and any outstanding information requirements."
      />

      <DemoDisclosure>
        Interface preview — compliance-status data is demonstrative until the required
        client-facing KYC/KYB projection is implemented.
      </DemoDisclosure>

      <div className="xl:grid xl:grid-cols-[1fr_320px] xl:items-start xl:gap-8">
        <div className="flex flex-col gap-8">
          <CurrentStatus />
          <OutstandingInformation />
        </div>

        <aside className="mt-8 xl:mt-0 xl:border-l xl:border-border xl:pl-8">
          <VerificationAreas />
          <NextSteps />
        </aside>
      </div>
    </div>
  );
}
