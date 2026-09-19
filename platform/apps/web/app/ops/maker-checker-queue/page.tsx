import { ApprovalRequestsWorkspace } from "@/components/ops/approval-requests-workspace";
import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Staff/Operations Portal — Maker-Checker Queue. UI Phase 2L. `B`-classified (`UI-04` §8/§47):
 * `IAM-02` genuinely owns the approval-request, decision and segregation-of-duties model, but every
 * route is `requireInternal`-guarded, no list/get route exists at any layer, and the acting user is a
 * request-body field (IAM-02 has no user-session surface yet) — nothing here is callable from a staff
 * browser session today. Hence the demo disclosure and no fetch, server action, auth, permission
 * check or mutation of any kind.
 *
 * Route `/ops/maker-checker-queue` — the slug of the governed nav label "Maker-Checker Queue",
 * following the convention `/ops/client-requests` and `/ops/wallet-destination-review` already set
 * (label → slug). The shorter `/ops/maker-checker` was considered and not used: it would break that
 * deterministic mapping for the one page whose label contains a qualifier.
 *
 * A LIST / DETAIL WORKSPACE (`UI-04` §35.16) — not a dashboard, not an "approvals center" grid.
 */
export default function MakerCheckerQueuePage() {
  return (
    <div>
      <PageHeader
        title="Maker-Checker Queue"
        description="Review approval requests that require independent authorization under AIX maker-checker controls."
      />
      <DemoDisclosure>
        Interface preview — approval requests are demonstrative until the staff-facing IAM-02 queue and decision routes
        are integrated.
      </DemoDisclosure>
      <ApprovalRequestsWorkspace />
    </div>
  );
}
