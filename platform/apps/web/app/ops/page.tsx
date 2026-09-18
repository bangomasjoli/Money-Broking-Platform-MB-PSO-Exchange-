import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";
import { OperationalQueues } from "@/components/ops/operational-queues";
import { RecentActivity, WorkflowAvailability } from "@/components/ops/workflow-availability";
import { WorkRequiringAttention } from "@/components/ops/work-attention";

/**
 * Staff/Operations Portal — Operational Overview. UI Phase 2I — the first real page on this
 * surface, replacing `UI Phase 2B`'s placeholder. `B`-classified (`UI-04` §8): `CLT-01`/`WLT-01`/
 * `IAM-02`/`SEC-01` all genuinely own real, governed workflow/state models (verified against
 * backend source this turn), but every one of them is `requireInternal`-guarded — no route in any
 * of the four is callable from a staff browser session today (re-confirmed by re-scanning every
 * registered route this turn; unchanged from every prior UI phase's own findings for the Client
 * surface, now independently confirmed for Ops too). Full capability map: `UI-04` §44.1.
 *
 * Deliberately NOT a generic admin dashboard, command center, or financial-performance screen —
 * no KPI cards, no revenue/volume/PnL/settlement-total figure anywhere (none exists in any
 * governed module — confirmed by inspection, not assumed). Four sections: a glanceable
 * work-requiring-attention rollup, the three real `B`-classified operational queues (Client
 * Requests / Wallet Destination Review / Maker-Checker Queue — each using its own governed status
 * vocabulary, documented in `ops-data.ts`), Workflow Availability (the 4 other `B`-classified Ops
 * nav items, all still "Interface planned" — none activated early), and a minimal Recent Staff
 * Activity evidence list using only the confirmed-safe (already tier-redacted) `SEC-01` field
 * subset. No `C`-classified Ops capability (Deposit/Withdrawal/Broking-RFQ Operations,
 * Settlement, Reconciliation, Exceptions/Breaks) appears anywhere in any form.
 *
 * `≥1280px` (`xl:`): asymmetric two-column layout (primary: Work Requiring Attention +
 * Operational Queues; secondary: Workflow Availability + Recent Staff Activity) — the same split
 * breakpoint and "split only where the shell's own sidebar also engages" rationale every prior
 * client-page phase already established. Below `xl:`: single column, stacked in the same order.
 */
export default function OperationalOverviewPage() {
  return (
    <div>
      <PageHeader
        title="Operational Overview"
        description="Review current operational work queues, governed review items, and staff workflows requiring attention."
      />

      <DemoDisclosure>
        Interface preview — operational summary data is demonstrative until the required staff
        aggregation routes are implemented.
      </DemoDisclosure>

      <div className="xl:grid xl:grid-cols-[1fr_320px] xl:items-start xl:gap-8">
        <div className="flex flex-col gap-8">
          <WorkRequiringAttention />
          <OperationalQueues />
        </div>

        <aside className="mt-8 xl:mt-0 xl:border-l xl:border-border xl:pl-8">
          <WorkflowAvailability />
          <RecentActivity />
        </aside>
      </div>
    </div>
  );
}
