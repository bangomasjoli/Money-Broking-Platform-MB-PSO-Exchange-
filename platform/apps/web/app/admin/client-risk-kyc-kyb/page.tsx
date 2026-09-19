import { ClientRiskWorkspace } from "@/components/admin/client-risk-workspace";
import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Admin/Compliance Portal — Client Risk / KYC-KYB. UI Phase 2O. `B`-classified (`UI-04` §9/§50.1):
 * `KYC-01` and `CLT-01` genuinely own the case, checklist, outcome and lifecycle models, but every route
 * is `requireInternal`-guarded and **no cross-client read exists** — `KYC-01`'s case list needs an
 * `application_id` or `client_id`, and `CLT-01` has no client list. So nothing here is callable from an
 * admin browser session, and the records are a small demo set. Hence the demo disclosure, and no fetch,
 * server action, auth, permission check or mutation of any kind.
 *
 * A LIST / DETAIL WORKSPACE (`UI-04` §35.16): the client compliance list is the primary region, the
 * selected client's detail the secondary. All behavior lives in `ClientRiskWorkspace`. Not a KPI
 * dashboard, not a card grid, and — deliberately — no risk score, heat map, gauge or completion
 * percentage: the governed risk rating is not readable, so none is shown or inferred (`UI-04` §50.5).
 *
 * Read-only: no approve, reject, request-documents, override, escalate, EDD or rating action. Each would
 * be a governed workflow needing its own authority, and Admin visibility does not imply mutation
 * authority. AML monitoring, EDD review, the approval queue, user/role administration, configuration and
 * sensitive-access audit are separate future Admin pages and are not absorbed here.
 */
export default function ClientRiskKycKybPage() {
  return (
    <div>
      <PageHeader
        title="Client Risk / KYC-KYB"
        description="Review safe client-level KYC/KYB, CDD and compliance-status information across governed AIX workflows."
      />
      <DemoDisclosure>
        Interface preview — client compliance records are demonstrative until the required cross-client and admin-safe
        projections are integrated.
      </DemoDisclosure>
      <ClientRiskWorkspace />
    </div>
  );
}
