import type { ReactNode } from "react";
import { ApprovalStatusLine } from "@/components/ops/approval-request-status";
import {
  APPROVAL_STATUS_NOTES,
  APPROVAL_TYPES,
  formatRequestDateTime,
  type DemoApprovalRequest,
} from "@/components/ops/approval-request-data";
import {
  APPROVAL_REQUIREMENT_DEFAULTS,
  decisionEvidence,
  domainOf,
  sodCheckEvidence,
} from "@/components/admin/approval-oversight-data";

/**
 * Approval-control detail — UI Phase 2R, the secondary/evidence region of the List + Detail workspace. Pure
 * content with no boundary of its own: the caller supplies it (the `DETAIL PANEL`'s single leading
 * `border-l` on desktop, the `Sheet`'s overlay container below `lg:`), so one component renders identically
 * in both places. `showHeading` is true only for the desktop panel — the Sheet carries the reference and
 * type in its own title/description, so each appears exactly once either way.
 *
 * **Read the order as an oversight reader would** (`UI-04` §53.1): identify the request and its control
 * domain; see the requirement it carried; then the evidence IAM-02 holds — decision, segregation-of-duties
 * check — and what the control did not verify. It is not the Ops checker panel: there is **no Checker
 * Action section, no button of any kind, and no link** (not even a disabled Approve/Reject pair, which
 * would make this page look like the surface that decides). Admin visibility does not grant approval
 * authority.
 *
 * **Every claim is either a real field or an invariant of `routes/approvals.ts`, never a per-request
 * invention:** the SoD result follows from the status (an `approved` request can only have passed; reject
 * runs no check); the decision evidence follows from which rows the routes write (a `blocked` request has
 * no decision row). The deciding user, decision token, payload, payload hash and matched conflict rules are
 * never shown — the deciding user is opaque and unreadable (`approval_decision` is INSERT-only), and the
 * rest is security material. The reason is optional free text, so it appears only as "No reason recorded".
 *
 * **Not a claim of authorisation.** The Authorization Boundary states, as fact, that IAM-02 does not check
 * that the deciding user holds a role or permission and that no policy applies; it never says "only
 * authorised approvers can approve", because the backend does not enforce that. The full statement of what
 * is and is not enforced — including the approve/reject asymmetry — is the page's Approval Control Boundary
 * section, so this panel does not repeat it per request.
 */
export function AdminApprovalDetail({ request, showHeading = false }: { request: DemoApprovalRequest; showHeading?: boolean }) {
  const type = APPROVAL_TYPES[request.action];
  const sod = sodCheckEvidence(request.status);
  const decision = decisionEvidence(request);

  return (
    <div className="flex flex-col gap-6">
      {showHeading && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{type.label}</p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{request.ref}</h2>
        </div>
      )}

      <section aria-label="Request Summary">
        <h3 className="text-sm font-semibold text-foreground">Request Summary</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Status">
            <ApprovalStatusLine status={request.status} size="xs" />
          </Row>
          <Row label="Created">{formatRequestDateTime(request.createdAtUtc)}</Row>
          <Row label="Expires">{formatRequestDateTime(request.expiresAtUtc)}</Row>
          {request.completedAtUtc && <Row label="Completed">{formatRequestDateTime(request.completedAtUtc)}</Row>}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">{APPROVAL_STATUS_NOTES[request.status]}</p>
      </section>

      <section aria-label="Originating Control">
        <h3 className="text-sm font-semibold text-foreground">Originating Control</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Domain">{domainOf(request)}</Row>
          <Row label="Workflow">{type.workflow}</Row>
          <Row label="Action">
            <code className="text-xs">{type.action}</code>
          </Row>
          <Row label="Resource type">
            <code className="text-xs">{type.resource}</code>
          </Row>
          <Row label="Subject">{request.subjectLabel}</Row>
          {request.clientRef && <Row label="Client">{request.clientRef}</Row>}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          IAM-02 does not record which module raised a request; the domain is read from the action.
        </p>
      </section>

      <section aria-label="Initiator">
        <h3 className="text-sm font-semibold text-foreground">Initiator</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Initiator class">{request.makerLabel}</Row>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Demonstrative class label — IAM-02 records the initiator as an opaque user id and holds no name.
        </p>
      </section>

      <section aria-label="Approval Requirement">
        <h3 className="text-sm font-semibold text-foreground">Approval Requirement</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Approvals">
            {request.approvedCount} of {request.requiredCount} required
          </Row>
          <Row label="Policy">{APPROVAL_REQUIREMENT_DEFAULTS.policy}</Row>
          <Row label="Step-up verification">{APPROVAL_REQUIREMENT_DEFAULTS.stepUp}</Row>
          <Row label="Expiry window">{APPROVAL_REQUIREMENT_DEFAULTS.expiryWindow}</Row>
        </dl>
      </section>

      <section aria-label="Decision Evidence">
        <h3 className="text-sm font-semibold text-foreground">Decision Evidence</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Decision recorded">{decision.recorded}</Row>
          {decision.decidedAt && <Row label="Decided">{decision.decidedAt}</Row>}
          {decision.reason && <Row label="Reason">{decision.reason}</Row>}
        </dl>
        {decision.note && <p className="mt-3 text-xs text-muted-foreground">{decision.note}</p>}
      </section>

      <section aria-label="Segregation of Duties">
        <h3 className="text-sm font-semibold text-foreground">Segregation of Duties</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Conflict check">{sod.result}</Row>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">{sod.note}</p>
      </section>

      <section aria-label="Authorization Boundary">
        <h3 className="text-sm font-semibold text-foreground">Authorization Boundary</h3>
        <p className="mt-3 text-xs text-muted-foreground">
          IAM-02 does not check that the deciding user holds a particular role or permission, and no approval policy
          applies to this request. What is and is not enforced is stated under Approval Control Boundary.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        The payload, payload hash, decision token, deciding user and matched conflict rules are not shown here.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm text-foreground">{children}</dd>
    </div>
  );
}
