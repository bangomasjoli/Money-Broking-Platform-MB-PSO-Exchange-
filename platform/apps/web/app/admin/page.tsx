import { ClientComplianceState } from "@/components/admin/client-compliance-state";
import { ComplianceAttention } from "@/components/admin/compliance-attention";
import { ControlDependencies } from "@/components/admin/control-dependencies";
import { ReviewAreas } from "@/components/admin/review-areas";
import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Admin/Compliance Portal — Compliance Overview. UI Phase 2N — the first real page on this surface,
 * replacing `UI Phase 2B`'s shell placeholder. `B`-classified (`UI-04` §9/§49): the compliance modules
 * genuinely own real, governed state models, but every route is `requireInternal`-guarded, and — the
 * decisive finding — **no cross-client aggregation exists**: `KYC-01`'s case list requires a
 * client/application scope, `AML-01`'s risk-signal list requires a subject, and `CLT-01` and `IAM-02`
 * have no list at all. So nothing here is callable from an admin browser session, and every count is
 * demo aggregation over the shared fixtures. Hence the demo disclosure, and no fetch, server action,
 * auth, permission check or mutation of any kind.
 *
 * A compliance workbench overview, deliberately NOT a dashboard: no KPI cards, no score, no chart, no
 * percentage, and no unsupported risk, AML or EDD content (`UI-04` §49.4). Composition: Compliance
 * Attention and Approval / Control Dependencies (primary); Client Compliance and Review Areas
 * (secondary, `≥1280px` only). "Platform Compliance Surfaces" is folded into Review Areas as the
 * owning-module column rather than repeated as its own section.
 *
 * Informational only: no review or approval action, and no link to an Ops page or to an unbuilt Admin
 * route. `≥1280px` (`xl:`): the same split breakpoint and 320px secondary column every prior page
 * uses; below it, one column in the same order.
 */
export default function ComplianceOverviewPage() {
  return (
    <div>
      <PageHeader
        title="Compliance Overview"
        description="Monitor governed client-compliance, approval and control-review areas across the AIX platform."
      />

      <DemoDisclosure>
        Interface preview — compliance summaries are demonstrative until the relevant staff-facing projections and
        integrations are connected.
      </DemoDisclosure>

      <div className="xl:grid xl:grid-cols-[1fr_320px] xl:items-start xl:gap-8">
        <div className="flex flex-col gap-8">
          <ComplianceAttention />
          <ControlDependencies />
        </div>

        <aside
          aria-label="Compliance context"
          className="mt-8 xl:mt-0 xl:border-l xl:border-border xl:pl-8"
        >
          <ClientComplianceState />
          <ReviewAreas />
        </aside>
      </div>
    </div>
  );
}
