import type { ReactNode } from "react";
import Link from "next/link";
import { MAKER_CHECKER_QUEUE_HREF, approvalReference, pendingApprovalFor } from "@/components/ops/approval-request-data";
import { RequestStatusLine } from "@/components/ops/client-request-status";
import { Button } from "@/components/ui/button";
import {
  NEXT_ACTIONS_BY_STATUS,
  STAFF_ACTION_LABELS,
  applicantTypeLabel,
  clientClassLabel,
  formatRequestDateTime,
  partySummary,
  requestReference,
  type DemoClientRequest,
} from "@/components/ops/client-request-data";

/**
 * Client request detail — UI Phase 2J, the secondary/evidence region of the List + Detail
 * workspace. Pure content with no boundary of its own: the caller supplies it (`DETAIL PANEL`'s
 * single leading `border-l` on desktop, the `Sheet`'s own overlay container below `lg:`), so one
 * component renders identically in both places — no duplicated detail markup.
 *
 * Sections appear only where the governed `client_application` model backs them (`UI-04` §45.1):
 * Request Summary, Organisation, Classification, Review State, Decision (only once a decision
 * timestamp exists), Review Actions. No generic "Overview" card. `showHeading` is true only for
 * the desktop panel — the Sheet already has its own `SheetTitle`/`SheetDescription` carrying the
 * organisation and application reference, and repeating them would duplicate the dialog's own
 * title. Either way the application reference appears exactly once.
 *
 * **Application ≠ client.** Everything here describes a `client_application`. No client profile
 * exists until an application is approved (`routes/decisions.ts` `approve/apply` is the only
 * writer), so an approved request additionally shows the `client_id` it produced — and no other
 * request pretends to have one.
 *
 * **Review Actions is a display, not a control surface.** The listed actions are exactly the
 * transitions `lib/applications.ts` defines for the current status; every button is natively
 * `disabled` (not focusable, not announced as available) because no staff action route is
 * integrated. There is no "Approve" button: approval is maker-checker (`approve/request` then an
 * IAM-02 approval by a different actor, then `approve/apply`), so the only maker-side control is
 * "Request approval". `reject`/`hold` are single-step and permission-gated, not maker-checker —
 * the wording never claims otherwise. Nothing here resembles a successful outcome.
 *
 * Not shown, by decision (`UI-04` §45.6/§45.7): KYC/AML/CDD rollup statuses, risk rating,
 * screening results, reviewer identity, registration number, country, applicant email, party
 * names or ownership percentages.
 */
export function ClientRequestDetail({
  request,
  showHeading = false,
}: {
  request: DemoClientRequest;
  showHeading?: boolean;
}) {
  // A request already awaiting a checker means "Request approval" has been done — offering it again
  // would contradict the Maker-Checker Queue, which shows that request as pending.
  const pendingApproval = pendingApprovalFor("application", request.id);
  const actions = NEXT_ACTIONS_BY_STATUS[request.status].filter(
    (action) => !(pendingApproval && action === "request_approval"),
  );
  const hasDecision =
    request.status === "held" ||
    request.status === "approved" ||
    request.status === "rejected" ||
    request.status === "cancelled";

  return (
    <div className="flex flex-col gap-6">
      {showHeading && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{requestReference(request)}</p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{request.legalName}</h2>
        </div>
      )}

      <Section title="Request Summary">
        <Row label="Created">{formatRequestDateTime(request.createdAtUtc)}</Row>
        <Row label="Submitted">
          {request.submittedAtUtc ? formatRequestDateTime(request.submittedAtUtc) : "Not yet submitted"}
        </Row>
        <Row label="Last updated">{formatRequestDateTime(request.updatedAtUtc)}</Row>
      </Section>

      <Section title="Organisation">
        <Row label="Legal name">{request.legalName}</Row>
        <Row label="Applicant type">{applicantTypeLabel(request.applicantType)}</Row>
        <Row label="Authorised parties">{partySummary(request.parties)}</Row>
      </Section>

      <Section title="Classification">
        <Row label="Client class">{clientClassLabel(request.clientClass)}</Row>
        <Row label="Basis">Claimed by applicant</Row>
      </Section>

      <Section title="Review State">
        <Row label="Status">
          <RequestStatusLine status={request.status} size="xs" />
        </Row>
        <Row label="Reviewer">{request.reviewerAssigned ? "Assigned" : "Not yet assigned"}</Row>
        {request.underReviewAtUtc && (
          <Row label="Review started">{formatRequestDateTime(request.underReviewAtUtc)}</Row>
        )}
      </Section>

      {hasDecision && (
        <Section title="Decision">
          {request.status === "held" && (
            <>
              <Row label="Placed on hold">{request.heldAtUtc ? formatRequestDateTime(request.heldAtUtc) : "—"}</Row>
              <Row label="Reason code">{request.holdReason ?? "Not recorded"}</Row>
            </>
          )}
          {request.status === "approved" && (
            <>
              <Row label="Approved">
                {request.approvedAtUtc ? formatRequestDateTime(request.approvedAtUtc) : "—"}
              </Row>
              <Row label="Approval reference">{request.approvalRef ?? "—"}</Row>
              <Row label="Client record">{request.clientRef ?? "—"}</Row>
            </>
          )}
          {request.status === "rejected" && (
            <>
              <Row label="Rejected">
                {request.rejectedAtUtc ? formatRequestDateTime(request.rejectedAtUtc) : "—"}
              </Row>
              <Row label="Reason code">{request.rejectionReason ?? "Not recorded"}</Row>
            </>
          )}
          {request.status === "cancelled" && (
            <Row label="Cancelled">
              {request.cancelledAtUtc ? formatRequestDateTime(request.cancelledAtUtc) : "—"}
            </Row>
          )}
        </Section>
      )}

      <section aria-label="Review Actions">
        <h3 className="text-sm font-semibold text-foreground">Review Actions</h3>
        {pendingApproval && (
          <p className="mt-3 text-xs text-foreground">
            Approval requested — {approvalReference(pendingApproval)} is awaiting an independent approver.{" "}
            <Link
              href={MAKER_CHECKER_QUEUE_HREF}
              className="font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              View in Maker-Checker Queue
            </Link>
          </p>
        )}
        {actions.length === 0 ? (
          pendingApproval ? null : (
            <p className="mt-3 text-xs text-muted-foreground">
              No staff action is currently defined for this status.
            </p>
          )
        ) : (
          <>
            <p className="mt-3 text-xs text-muted-foreground">
              Interface preview — staff action routes are not yet integrated, so these actions are unavailable.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {actions.map((action) => (
                <li key={action}>
                  <Button type="button" variant="outline" size="sm" disabled>
                    {STAFF_ACTION_LABELS[action]}
                  </Button>
                </li>
              ))}
            </ul>
            {actions.includes("request_approval") && (
              <p className="mt-3 text-xs text-muted-foreground">
                Approval is a separate maker-checker step: it is completed by a different authorised approver, not by
                the person who requests it.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <dl className="mt-3 flex flex-col gap-3">{children}</dl>
    </section>
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
