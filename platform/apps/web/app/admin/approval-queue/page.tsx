import { AdminApprovalWorkspace } from "@/components/admin/admin-approval-workspace";
import { ApprovalControlBoundary } from "@/components/admin/approval-control-boundary";
import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Admin/Compliance Portal — Approval Queue. UI Phase 2R. `B`-classified (`UI-04` §9/§53.2): `IAM-02`
 * genuinely owns the approval-request, decision and segregation-of-duties model, but every route is
 * `requireInternal`-guarded, **no list, get or search route exists**, and the deciding user is a
 * request-body field (IAM-02 has no session surface) — nothing here is callable from an admin browser
 * session. Hence the demo disclosure, and no fetch, server action, auth, permission check or mutation.
 *
 * **An oversight register, not a second Maker-Checker Queue** (`UI-04` §53.1). The Ops page at
 * `/ops/maker-checker-queue` is a work queue for a checker (Pending by default, soonest expiry first,
 * disabled Approve/Reject). This page reads the SAME shared requests as a register — every state by default,
 * newest first — and puts the control facts first: what evidence IAM-02 holds, and what the approval control
 * does and does not enforce. Zero decision controls, and no links: Admin visibility does not imply approval
 * authority, and the page is not an Ops navigation hub.
 *
 * Composition: the Approval Requests workspace (List + Detail, §35.16), then an Approval Control Boundary
 * section stating, as fact, the approve/reject asymmetry, the missing approver-authority check, the absent
 * policy configuration and the write-only decision records. Not a KPI dashboard: the only figure is a
 * one-line count by status, derived from the shared requests — no approval rate, average time or
 * control-effectiveness score. Users / Roles / Permissions, Feature Flags / Configuration and Audit /
 * Sensitive Access are separate future Admin pages and are not absorbed here; SEC-01's audit events are not
 * merged — the page uses IAM-02's own evidence.
 */
export default function ApprovalQueuePage() {
  return (
    <div>
      <PageHeader
        title="Approval Queue"
        description="Review governed approval requests and maker-checker control evidence across AIX workflows."
      />
      <DemoDisclosure>
        Interface preview — approval records are demonstrative until the required Admin-safe IAM-02 projections and
        authorization controls are integrated.
      </DemoDisclosure>

      <div className="flex flex-col gap-8">
        <section aria-labelledby="approval-requests-heading">
          <h2 id="approval-requests-heading" className="mb-4 text-lg font-semibold tracking-tight text-foreground">
            Approval Requests
          </h2>
          <AdminApprovalWorkspace />
        </section>

        <ApprovalControlBoundary />
      </div>
    </div>
  );
}
