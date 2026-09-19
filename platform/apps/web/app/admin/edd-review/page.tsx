import { EddCapabilityBoundary } from "@/components/admin/edd-capability-boundary";
import { EddReviewWorkspace } from "@/components/admin/edd-review-workspace";
import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Admin/Compliance Portal — EDD / Review. UI Phase 2Q. `B`-classified (`UI-04` §9/§52.1): `KYC-01` and
 * `AML-01` genuinely own the case, checklist, screening and risk-signal states this page projects, but
 * every route is `requireInternal`-guarded and no cross-client or cross-subject read exists (beyond
 * AML-01's stuck-request list). So nothing here is callable from an admin browser session, and the items
 * are a demo projection. Hence the demo disclosure, and no fetch, server action, auth, permission check or
 * mutation of any kind.
 *
 * **The governed title is kept; the capability behind it is review attention.** `EDD: NOT IMPLEMENTED`
 * (`UI-04` §52.1) — re-verified from source this turn — so the page never says or implies that it manages
 * EDD cases, and models no EDD case, status, trigger, owner, due date, SLA, decision or evidence. **Review
 * attention is a demo/admin projection, not a single backend case object** (§52.3): each item is computed
 * from the shared `UI Phase 2O` KYC and `UI Phase 2P` AML datasets, so this page owns no domain facts and
 * cannot contradict those pages. Composition: the review-attention workspace, then an EDD Capability
 * section stating the boundary.
 *
 * A LIST / DETAIL WORKSPACE (`UI-04` §35.16), not a KPI dashboard, case-age chart, investigator workbench,
 * assignment queue or approval queue. Read-only: no Start EDD, Assign, Escalate, Resolve, Approve, Reject,
 * Request SOF/SOW or Close control, and no local state transition. The Approval Queue, user and role
 * administration, configuration and sensitive-access audit are separate future Admin pages and are not
 * absorbed here.
 */
export default function EddReviewPage() {
  return (
    <div>
      <PageHeader
        title="EDD / Review"
        description="Review governed compliance conditions that may require further assessment, while preserving the current EDD capability boundary."
      />
      <DemoDisclosure>
        Interface preview — review items are demonstrative projections of existing compliance states. A dedicated EDD
        workflow is not represented; it is not implemented in the current backend.
      </DemoDisclosure>

      <div className="flex flex-col gap-8">
        <section aria-labelledby="review-attention-heading">
          <h2 id="review-attention-heading" className="mb-4 text-lg font-semibold tracking-tight text-foreground">
            Review Attention
          </h2>
          <EddReviewWorkspace />
        </section>

        <EddCapabilityBoundary />
      </div>
    </div>
  );
}
