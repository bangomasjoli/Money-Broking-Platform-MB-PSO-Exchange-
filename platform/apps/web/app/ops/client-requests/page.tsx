import { ClientRequestsWorkspace } from "@/components/ops/client-requests-workspace";
import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Staff/Operations Portal — Client Requests. UI Phase 2J. `B`-classified (`UI-04` §8/§45.1):
 * `CLT-01` genuinely owns the application/review/decision model, but every route that reads or
 * acts on it is `requireInternal`-guarded, and no list route exists at all — nothing here is
 * callable from a staff browser session today. Hence the demo disclosure and no fetch, server
 * action, auth or mutation of any kind.
 *
 * A LIST / DETAIL WORKSPACE (`UI-04` §35.16): the request queue is the primary region, the selected
 * request's detail the secondary. All behavior lives in `ClientRequestsWorkspace`. Not a KPI
 * dashboard, not a card grid.
 */
export default function ClientRequestsPage() {
  return (
    <div>
      <PageHeader
        title="Client Requests"
        description="Review client applications and their current operational review state."
      />
      <DemoDisclosure>
        Interface preview — client request records are demonstrative until the staff-facing CLT projection and action
        routes are integrated.
      </DemoDisclosure>
      <ClientRequestsWorkspace />
    </div>
  );
}
