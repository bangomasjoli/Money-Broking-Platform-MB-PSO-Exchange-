import { AmlAttention } from "@/components/admin/aml-attention";
import { AmlCapabilityBoundary } from "@/components/admin/aml-capability-boundary";
import { AmlWorkspace } from "@/components/admin/aml-workspace";
import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Admin/Compliance Portal — AML / Transaction Monitoring. UI Phase 2P. `B`-classified (`UI-04` §9/§51.1):
 * `AML-01` genuinely owns the screening, match, risk-signal and rescreening-run models, but every route is
 * `requireInternal`-guarded, the risk-signal list needs both `subject_type` and `subject_ref`, and the only
 * cross-subject read lists stuck requests. So nothing here is callable from an admin browser session, and
 * the records are a small demo set. Hence the demo disclosure, and no fetch, server action, auth,
 * permission check or mutation of any kind.
 *
 * **The governed title is kept; the capability behind it is AML screening.** `TRANSACTION MONITORING: NOT
 * IMPLEMENTED IN CURRENT BACKEND` (`UI-04` §51.2) — so the page never says or implies that it monitors
 * transactions. AML-01's "monitoring run" is presented as rescreening; there is no alert, rule, case,
 * amount, wallet or transaction anywhere on the page. Composition: AML Attention (which ends with the
 * plain statement that transaction monitoring is not implemented), the subject screening workspace, and a
 * Transaction Monitoring section stating the boundary and what AML-01 does today.
 *
 * A LIST / DETAIL WORKSPACE (`UI-04` §35.16) for the subjects, not a KPI dashboard, card grid, alert table
 * or sanctions-investigation console. Read-only: no clear, resolve, acknowledge, escalate, retry, recover,
 * confirm or dismiss control, and no local state transition. EDD / Review, the approval queue, user and
 * role administration, configuration and sensitive-access audit are separate future Admin pages and are
 * not absorbed here.
 */
export default function AmlTransactionMonitoringPage() {
  return (
    <div>
      <PageHeader
        title="AML / Transaction Monitoring"
        description="Review governed AML screening and risk-signal information, with current transaction-monitoring capability boundaries clearly identified."
      />
      <DemoDisclosure>
        Interface preview — AML screening and risk-signal records are demonstrative until the required Admin-safe
        projections are integrated. Transaction monitoring is not represented; it is not implemented in the current
        backend.
      </DemoDisclosure>

      <div className="flex flex-col gap-8">
        <AmlAttention />

        <section aria-labelledby="aml-subjects-heading">
          <h2 id="aml-subjects-heading" className="mb-4 text-lg font-semibold tracking-tight text-foreground">
            Subject Screening
          </h2>
          <AmlWorkspace />
        </section>

        <AmlCapabilityBoundary />
      </div>
    </div>
  );
}
