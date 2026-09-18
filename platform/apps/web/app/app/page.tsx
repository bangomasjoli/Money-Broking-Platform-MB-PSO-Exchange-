import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";
import { AttentionItems } from "@/components/overview/attention-items";
import { CapabilityStatus } from "@/components/overview/capability-status";
import { DestinationSummary } from "@/components/overview/destination-summary";
import { OrganisationStatus } from "@/components/overview/organisation-status";

/**
 * Client Portal — Overview. UI Phase 2F — the first `B`-classified authenticated client page
 * implemented as real UI (`UI Phase 2B`'s placeholder replaced). Remains `B`-classified: `CLT-01`
 * and `KYC-01` genuinely own organisation lifecycle/KYC state, and both have real internal data
 * models (verified against backend source this turn — `CLIENT_PROFILE_REACHABLE_STATUSES`,
 * `KYC_CASE_STATUSES`), but neither exposes a public client-facing projection route, confirmed by
 * re-scanning every backend service's registered routes this turn (unchanged from `UI Phase 2A`/
 * `2E`'s own findings). Full capability map: `UI-04` §41.
 *
 * Deliberately NOT a generic fintech dashboard — no KPI cards, no AUM/portfolio-value/balance/PnL
 * figure, no market/price chart, no "Welcome back." Four operational sections instead: real
 * demo-labelled Organisation Status, mixed-provenance Attention Items (destination-derived items
 * are real-contract-shaped, `A`-backed; the one organisation item is demo-only), a Wallet & Payout
 * Destinations summary reusing `UI Phase 2E`'s own `DEMO_DESTINATIONS` fixture directly (one
 * source of truth — this page can never disagree with the Wallet page about destination counts),
 * and Platform Access showing exactly the 3 real Client Portal nav items, never a `C`-classified
 * capability. A fifth candidate section — Recent Client Activity — was evaluated and OMITTED: no
 * client-facing activity/audit feed exists anywhere in the backend (`SEC-01`'s audit routes are
 * entirely internal), and this turn's own instruction is explicit that an absent aggregate feed
 * must be omitted, not faked with invented timestamps.
 *
 * `≥1280px` (`xl:`): asymmetric two-column layout (primary: Organisation Status + Attention
 * Items + Destination Summary; secondary: Platform Access). Below `xl:`: single column, stacked
 * in the same order — chosen deliberately over splitting at `lg:` (1024px, `UI Phase 2E`'s own
 * List+Detail breakpoint) since this is the platform's first purely-editorial asymmetric layout
 * with no established precedent to reuse; splitting only at `xl:` (where the shell's own sidebar
 * also engages) avoids needing new arithmetic to justify a 1024–1279px split, using the brief's
 * own explicitly-permitted "otherwise stacked" fallback for that range instead.
 */
export default function ClientOverviewPage() {
  return (
    <div>
      <PageHeader
        title="Overview"
        description="Review your organisation's current platform status, governed destinations, and items requiring attention."
      />

      <DemoDisclosure>
        Interface preview — overview data is demonstrative until the required client-facing
        aggregation routes are implemented.
      </DemoDisclosure>

      <div className="xl:grid xl:grid-cols-[1fr_320px] xl:items-start xl:gap-8">
        <div className="flex flex-col gap-8">
          <OrganisationStatus />
          <AttentionItems />
          <DestinationSummary />
        </div>

        <aside className="mt-8 xl:mt-0 xl:border-l xl:border-border xl:pl-8">
          <CapabilityStatus />
        </aside>
      </div>
    </div>
  );
}
