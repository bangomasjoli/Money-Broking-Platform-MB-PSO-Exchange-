import type { ReactNode } from "react";
import Link from "next/link";
import { ApprovalStatusLine } from "@/components/ops/approval-request-status";
import {
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_NOTES,
  APPROVAL_TYPES,
  DEFAULT_APPROVAL_POLICY,
  approvalReference,
  formatRequestDateTime,
  isAwaitingChecker,
  type DemoApprovalRequest,
} from "@/components/ops/approval-request-data";
import { Button } from "@/components/ui/button";

/**
 * Approval request detail — UI Phase 2L, the secondary/evidence region of the List + Detail
 * workspace (`UI-04` §13's sanctioned right-panel case: reference + action side by side). Pure
 * content with no boundary of its own — `DETAIL PANEL`'s single leading `border-l` on desktop, the
 * `Sheet` below `lg:` — so one component renders identically in both.
 *
 * Follows the governed maker-checker presentation rules (`UI-04` §22): the initiator is always
 * shown; the status is one of `IAM-02`'s real ones; a rejection reason is never hidden; the
 * effective state after approval is stated; and "pending" says it is waiting on someone else.
 * **Deviation, recorded:** §22 also asks for the "required approver role" — `IAM-02` stores
 * `required_approver_roles` but no code reads it and the approve route checks no role, so the panel
 * states the enforced rule (a different user, no segregation-of-duties conflict) instead of a role
 * that would not be enforced.
 *
 * **Independence is stated in text, next to the controls, not implied by a bare button pair.** The
 * asymmetry is real and shown: `approve` is refused for the maker (`IAM2_SELF_APPROVAL_BLOCKED`) and
 * for a segregation-of-duties conflict; `reject` performs neither check (`routes/approvals.ts`).
 *
 * **Checker Action is a display, not a control surface.** Only a `pending` request offers actions;
 * "Approve Request" / "Reject Request" are the routes' own verbs, natively `disabled` (not
 * focusable) because no decision route is integrated. Nothing mutates and nothing resembles a
 * successful outcome. Terminal requests are read-only — the routes refuse any further decision
 * (`IAM2_APPROVAL_ALREADY_DECIDED`). The optional `decision_reason` (≤512 characters) is described in
 * text rather than as a form field: it is optional, and a disabled input would add a control that
 * does nothing.
 *
 * **Not shown, by decision (`UI-04` §47.6):** payload or payload hash, the decision token, the
 * deciding user, SoD matched-rule ids, any subject-sensitive value (only the originating pages' own
 * reference labels), and any financial figure.
 *
 * `showHeading` is true only for the desktop panel; the Sheet carries the type and reference in its
 * own title/description, so each appears exactly once either way.
 */
export function ApprovalRequestDetail({
  request,
  showHeading = false,
}: {
  request: DemoApprovalRequest;
  showHeading?: boolean;
}) {
  const type = APPROVAL_TYPES[request.action];
  const awaiting = isAwaitingChecker(request);
  const decided = request.status === "approved" || request.status === "rejected";

  return (
    <div className="flex flex-col gap-6">
      {showHeading && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{approvalReference(request)}</p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{type.label}</h2>
        </div>
      )}

      <Section title="Request Summary">
        <Row label="Action">{type.action}</Row>
        <Row label="Created">{formatRequestDateTime(request.createdAtUtc)}</Row>
        <Row label="Expires">{formatRequestDateTime(request.expiresAtUtc)}</Row>
      </Section>

      <Section title="Originating Workflow">
        <Row label="Module">{type.module}</Row>
        <Row label="Workflow">
          {type.href ? (
            <Link
              href={type.href}
              className="font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {type.workflow}
            </Link>
          ) : (
            type.workflow
          )}
        </Row>
        <Row label="Subject">{request.subjectLabel}</Row>
        {request.clientRef && <Row label="Client">{request.clientRef}</Row>}
      </Section>

      <section aria-label="Requested By">
        <h3 className="text-sm font-semibold text-foreground">Requested By</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Requester">{request.makerLabel}</Row>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Demonstrative role label — IAM-02 records the requester as an opaque user id.
        </p>
      </section>

      <section aria-label="Approval Requirement">
        <h3 className="text-sm font-semibold text-foreground">Approval Requirement</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Approvals">
            {request.approvedCount} of {request.requiredCount}
          </Row>
          <Row label="Policy">Default — no approval policy configured</Row>
          <Row label="Step-up verification">{DEFAULT_APPROVAL_POLICY.requiresStepUp ? "Required" : "Not required"}</Row>
          <Row label="Expiry window">{DEFAULT_APPROVAL_POLICY.expiryHours} hours from request</Row>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Independent approval is required: Approve Request must come from a different user than the requester, with no
          segregation-of-duties conflict between them. The requester cannot approve their own request. Reject Request
          is not subject to that check.
        </p>
      </section>

      <section aria-label="Decision State">
        <h3 className="text-sm font-semibold text-foreground">Decision State</h3>
        <div className="mt-3">
          <ApprovalStatusLine status={request.status} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{APPROVAL_STATUS_NOTES[request.status]}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {awaiting ? "If approved and applied by the originating workflow: " : "When applied by the originating workflow: "}
          {type.effect.charAt(0).toLowerCase() + type.effect.slice(1)}
        </p>
      </section>

      <section aria-label="Decision History">
        <h3 className="text-sm font-semibold text-foreground">Decision History</h3>
        <ol className="mt-3 flex flex-col gap-2">
          <li className="flex items-baseline justify-between gap-4 text-xs text-foreground">
            <span>Requested</span>
            <span className="text-muted-foreground">{formatRequestDateTime(request.createdAtUtc)}</span>
          </li>
          {decided && request.completedAtUtc && (
            <li className="flex items-baseline justify-between gap-4 text-xs text-foreground">
              <span>{APPROVAL_STATUS_LABELS[request.status]}</span>
              <span className="text-muted-foreground">{formatRequestDateTime(request.completedAtUtc)}</span>
            </li>
          )}
          {request.status === "expired" && (
            <li className="flex items-baseline justify-between gap-4 text-xs text-foreground">
              <span>Expired</span>
              <span className="text-muted-foreground">{formatRequestDateTime(request.expiresAtUtc)}</span>
            </li>
          )}
        </ol>
        {decided && (
          <dl className="mt-3 flex flex-col gap-3">
            <Row label="Reason">{request.decisionReason ?? "No reason recorded"}</Row>
          </dl>
        )}
        {decided && (
          <p className="mt-2 text-xs text-muted-foreground">
            The deciding user is recorded by IAM-02 as an opaque user id and is not shown in this preview.
          </p>
        )}
      </section>

      <section aria-label="Checker Action">
        <h3 className="text-sm font-semibold text-foreground">Checker Action</h3>
        {awaiting ? (
          <>
            <p className="mt-3 text-xs text-muted-foreground">
              Interface preview — decision routes are not yet integrated, so these actions are unavailable.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              <li>
                <Button type="button" variant="outline" size="sm" disabled>
                  Approve Request
                </Button>
              </li>
              <li>
                <Button type="button" variant="outline" size="sm" disabled>
                  Reject Request
                </Button>
              </li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Whether you could act depends on who you are — you cannot approve a request you initiated. This preview has
              no signed-in user, so eligibility is not evaluated. An optional reason (up to 512 characters) can be
              recorded with either decision.
            </p>
          </>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            This request is {APPROVAL_STATUS_LABELS[request.status]}; no checker action is available.
            {request.status === "expired" || request.status === "blocked"
              ? " A new request must be raised from the originating workflow."
              : ""}
          </p>
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
