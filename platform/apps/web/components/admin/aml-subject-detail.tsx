import type { ReactNode } from "react";
import { ScreeningStateLine } from "@/components/admin/aml-status";
import {
  AML_SUBJECT_TYPE_LABELS,
  MATCH_CATEGORY_LABELS,
  MATCH_STATUS_LABELS,
  PROVENANCE_LABELS,
  SIGNAL_SEVERITY_LABELS,
  SIGNAL_STATUS_LABELS,
  SIGNAL_TYPE_LABELS,
  SIGNAL_TYPE_MEANINGS,
  formatAge,
  isStalled,
  lastScreeningDateTime,
  outcomeLabel,
  type DemoAmlSubject,
} from "@/components/admin/aml-monitoring-data";
import { formatRequestDateTime } from "@/components/ops/client-request-data";

/**
 * AML subject detail — UI Phase 2P, the secondary/evidence region of the List + Detail workspace. Pure
 * content with no boundary of its own: the caller supplies it (the `DETAIL PANEL`'s single leading
 * `border-l` on desktop, the `Sheet`'s overlay container below `lg:`), so one component renders
 * identically in both places. `showHeading` is true only for the desktop panel — the Sheet already has a
 * `SheetTitle`/`SheetDescription` carrying the reference and type, and repeating them would duplicate the
 * dialog's own title.
 *
 * Sections appear only where an AML-01 concept backs them (`UI-04` §51.1): Subject Summary, Screening,
 * Matches (only when there are any), and Risk Signals. There is **no transaction section** — none of this
 * describes transactions, and the page states that once, in its own Transaction Monitoring section,
 * rather than repeating it under every subject. There is no Review Actions section and no control of any
 * kind: retry, recover, acknowledge, confirm, dismiss and escalate are each a governed, authority-checked
 * workflow (match disposition is maker-checker; recovery is a separate permission), and Admin visibility
 * does not imply mutation authority.
 *
 * **What the screening rows can and cannot say.** A `requested` or `failed` screening has no result, so
 * its outcome is "No result" — never blank, never implied clear. A stalled screening states its age and
 * that recovery is a separate operation not offered here (the recover route exists; this preview does not
 * call it). Only the coarse match category and status are shown: names, scores, list sources and details
 * are sensitive-tier (`aml1.screening.sensitive_read`, audited) and never appear.
 *
 * **Signal severity is not a client risk rating.** The word "severity" and the values Low/Medium/High
 * overlap CLT-01's `low|medium|high|prohibited` rating, so the Risk Signals section says plainly that the
 * value belongs to the signal and is not that rating — which no read projection returns.
 */
export function AmlSubjectDetail({ subject, showHeading = false }: { subject: DemoAmlSubject; showHeading?: boolean }) {
  const stalled = isStalled(subject);
  const categories = Array.from(new Set(subject.matches.map((match) => MATCH_CATEGORY_LABELS[match.category])));

  return (
    <div className="flex flex-col gap-6">
      {showHeading && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{AML_SUBJECT_TYPE_LABELS[subject.subjectType]}</p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{subject.subjectRef}</h2>
        </div>
      )}

      <Section title="Subject Summary">
        <Row label="Subject type">{AML_SUBJECT_TYPE_LABELS[subject.subjectType]}</Row>
        {subject.parentRef && <Row label="Client application">{subject.parentRef}</Row>}
        <Row label="Identity basis">{PROVENANCE_LABELS[subject.provenance]}</Row>
      </Section>

      <section aria-label="Screening">
        <h3 className="text-sm font-semibold text-foreground">Screening</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Status">
            <ScreeningStateLine subject={subject} />
          </Row>
          <Row label="Outcome">{outcomeLabel(subject)}</Row>
          {subject.screeningStatus === "completed" && (
            <>
              <Row label="Matched categories">{categories.length === 0 ? "None" : categories.join(", ")}</Row>
              <Row label="Last screened">{lastScreeningDateTime(subject)}</Row>
            </>
          )}
          {subject.screeningStatus !== "completed" && (
            <Row label="Requested">{formatRequestDateTime(subject.requestedAtUtc)}</Row>
          )}
          {stalled && subject.stalledAgeSeconds !== null && (
            <Row label="In flight for">{formatAge(subject.stalledAgeSeconds)}</Row>
          )}
        </dl>
        {stalled && (
          <p className="mt-3 text-xs text-muted-foreground">
            This request has stayed in flight past the stuck threshold, so the subject cannot be rescreened until it is
            recovered. Recovery is a separate, permission-gated operation and is not available in this preview.
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
            Matched names, scores and list sources are not shown here.
          </p>
        </section>
      )}

      <section aria-label="Risk Signals">
        <h3 className="text-sm font-semibold text-foreground">Risk Signals</h3>
        {subject.signals.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No risk signals are recorded for this subject in this demo view.</p>
        ) : (
          <>
            <ul className="mt-3 flex flex-col gap-3">
              {subject.signals.map((signal, index) => (
                <li
                  key={`${signal.type}-${index}`}
                  className="border-t border-border pt-3 first:border-t-0 first:pt-0"
                >
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
              Severity belongs to the signal and is set when AML-01 raises it. It is not a client risk rating.
            </p>
          </>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Screening provider payloads, matched-person details, identity documents and reviewer notes are not shown here.
      </p>
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
