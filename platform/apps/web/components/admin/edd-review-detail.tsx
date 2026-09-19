import type { ReactNode } from "react";
import {
  MATCH_CATEGORY_LABELS,
  MATCH_STATUS_LABELS,
  SIGNAL_SEVERITY_LABELS,
  SIGNAL_STATUS_LABELS,
  SIGNAL_TYPE_LABELS,
  SIGNAL_TYPE_MEANINGS,
  formatAge,
  isStalled,
  lastScreeningDateTime,
  outcomeLabel as amlOutcomeLabel,
  type DemoAmlSubject,
} from "@/components/admin/aml-monitoring-data";
import {
  CHECKLIST_STAFF_LABELS,
  KYC_CASE_TYPE_LABELS,
  checklistSummary,
  documentTypeLabel,
  lifecycleLabel,
  outcomeLabel as kycOutcomeLabel,
  outstandingItems,
  type DemoClientCompliance,
} from "@/components/admin/client-risk-data";
import { ReviewStateLine } from "@/components/admin/edd-review-state";
import {
  REVIEW_AREA_LABELS,
  REVIEW_REASON_LABELS,
  type ReviewItem,
} from "@/components/admin/edd-review-data";
import { formatRequestDateTime } from "@/components/ops/client-request-data";

/**
 * Review-item detail — UI Phase 2Q, the secondary/evidence region of the List + Detail workspace. Pure
 * content with no boundary of its own: the caller supplies it (the `DETAIL PANEL`'s single leading
 * `border-l` on desktop, the `Sheet`'s overlay container below `lg:`), so one component renders
 * identically in both places. `showHeading` is true only for the desktop panel — the Sheet already has a
 * `SheetTitle`/`SheetDescription`, and repeating them would duplicate the dialog's own title.
 *
 * **Two source-specific contexts, not one universal case schema** (`UI-04` §52.3): a KYC item shows KYC/KYB
 * Context, an AML item shows AML Context, and both reuse the source pages' own labels and helpers so an
 * item reads exactly as it does on `/admin/client-risk-kyc-kyb` or `/admin/aml-transaction-monitoring`.
 *
 * **Review Condition explains the condition; it does not manufacture a case.** It states the area, the
 * reason, the source module and the source state, and says plainly that this is a projection of an
 * existing state and not an EDD case — with no EDD trigger, owner, due date or decision. There is no
 * assignee, reviewer, owner, timeline or history: none exists. Timestamps appear only where the source has
 * one (an AML screening), never for KYC.
 *
 * **Read-only by construction** — no Start EDD, Assign, Escalate, Resolve, Approve, Reject, Request SOF/SOW,
 * Close or File control, and no local state transition. Match disposition and recovery are separate,
 * permission-gated (and, for disposition, independently approved) operations; this page states that and
 * does not call them. Maker-checker approvals belong to the future Approval Queue and are not shown.
 *
 * **Signal severity is not a priority and not a client risk rating.** It appears only inside AML Context,
 * labelled as the signal's own field. No rating is shown, inferred or derived from a reason, state,
 * severity or class.
 */
export function ReviewAttentionDetail({ item, showHeading = false }: { item: ReviewItem; showHeading?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {showHeading && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{item.subjectTypeLabel}</p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{item.subjectRef}</h2>
        </div>
      )}

      <section aria-label="Review Condition">
        <h3 className="text-sm font-semibold text-foreground">Review Condition</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Review area">{REVIEW_AREA_LABELS[item.area]}</Row>
          <Row label="Reason">{REVIEW_REASON_LABELS[item.reason]}</Row>
          <Row label="Source module">{item.sourceModule}</Row>
          <Row label="Current state">
            <ReviewStateLine item={item} />
          </Row>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          This is a projection of an existing state, not an EDD case. No EDD trigger, owner, due date or decision exists
          for it.
        </p>
      </section>

      {item.kyc && <KycContext client={item.kyc} />}
      {item.aml && <AmlContext subject={item.aml} />}

      <p className="text-xs text-muted-foreground">
        Identity documents, evidence, matched-person details, screening payloads and reviewer notes are not shown here.
      </p>
    </div>
  );
}

function KycContext({ client }: { client: DemoClientCompliance }) {
  const outstanding = outstandingItems(client);

  return (
    <>
      <section aria-label="KYC / KYB Context">
        <h3 className="text-sm font-semibold text-foreground">KYC / KYB Context</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Case type">{KYC_CASE_TYPE_LABELS[client.caseType]}</Row>
          <Row label="CDD outcome">{kycOutcomeLabel(client.outcome)}</Row>
          <Row label="Checklist">{checklistSummary(client.checklist)}</Row>
          <Row label="Client lifecycle">{lifecycleLabel(client.clientLifecycle)}</Row>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Shows the primary case. Cases for authorised parties are not represented in this preview.
        </p>
      </section>

      <section aria-label="Outstanding Information">
        <h3 className="text-sm font-semibold text-foreground">Outstanding Information</h3>
        {outstanding.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No checklist items are outstanding.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {outstanding.map((entry) => (
              <li
                key={entry.id}
                className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0"
              >
                <span className="text-sm text-foreground">{documentTypeLabel(entry)}</span>
                <span className="text-right text-xs text-muted-foreground">{CHECKLIST_STAFF_LABELS[entry.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function AmlContext({ subject }: { subject: DemoAmlSubject }) {
  const stalled = isStalled(subject);
  const categories = Array.from(new Set(subject.matches.map((match) => MATCH_CATEGORY_LABELS[match.category])));

  return (
    <>
      <section aria-label="AML Context">
        <h3 className="text-sm font-semibold text-foreground">AML Context</h3>
        <dl className="mt-3 flex flex-col gap-3">
          {subject.parentRef && <Row label="Client application">{subject.parentRef}</Row>}
          <Row label="Outcome">{amlOutcomeLabel(subject)}</Row>
          {subject.screeningStatus === "completed" ? (
            <>
              <Row label="Matched categories">{categories.length === 0 ? "None" : categories.join(", ")}</Row>
              <Row label="Last screened">{lastScreeningDateTime(subject)}</Row>
            </>
          ) : (
            <Row label="Requested">{formatRequestDateTime(subject.requestedAtUtc)}</Row>
          )}
          {stalled && subject.stalledAgeSeconds !== null && (
            <Row label="In flight for">{formatAge(subject.stalledAgeSeconds)}</Row>
          )}
        </dl>
        {stalled && (
          <p className="mt-3 text-xs text-muted-foreground">
            This request has stayed in flight past the stuck threshold. Recovery is a separate, permission-gated
            operation and is not available in this preview.
          </p>
        )}
        {subject.screeningStatus === "failed" && (
          <p className="mt-3 text-xs text-muted-foreground">
            No result was recorded. Rescreening runs do not retry a failed request; it waits for a manual rescreen.
          </p>
        )}
      </section>

      {subject.matches.length > 0 && (
        <section aria-label="Matches">
          <h3 className="text-sm font-semibold text-foreground">Matches</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {subject.matches.map((match, index) => (
              <li
                key={`${match.category}-${index}`}
                className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0"
              >
                <span className="text-sm text-foreground">{MATCH_CATEGORY_LABELS[match.category]}</span>
                <span className="text-right text-xs text-muted-foreground">
                  {MATCH_STATUS_LABELS[match.status]}
                  {match.reviewedAtUtc ? ` · Reviewed ${formatRequestDateTime(match.reviewedAtUtc)}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Matched names, scores and list sources are not shown here. Confirming or dismissing a match is a separate,
            independently approved step and is not represented.
          </p>
        </section>
      )}

      {subject.signals.length > 0 && (
        <section aria-label="Related Risk Signals">
          <h3 className="text-sm font-semibold text-foreground">Related Risk Signals</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {subject.signals.map((signal, index) => (
              <li key={`${signal.type}-${index}`} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-foreground">{SIGNAL_TYPE_LABELS[signal.type]}</span>
                  <span className="text-right text-xs text-foreground">{SIGNAL_STATUS_LABELS[signal.status]}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Signal severity {SIGNAL_SEVERITY_LABELS[signal.severity]} · Raised{" "}
                  {formatRequestDateTime(signal.createdAtUtc)}
                  {signal.acknowledgedAtUtc ? ` · Acknowledged ${formatRequestDateTime(signal.acknowledgedAtUtc)}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{SIGNAL_TYPE_MEANINGS[signal.type]}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Severity belongs to the signal and is set when AML-01 raises it. It is not a priority and not a client risk
            rating.
          </p>
        </section>
      )}
    </>
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
