import type { ReactNode } from "react";
import Link from "next/link";
import { AuditResultLine } from "@/components/ops/audit-result-line";
import {
  AUDIT_ACTOR_NOTES,
  AUDIT_ACTOR_TYPE_LABELS,
  AUDIT_CATEGORY_LABELS,
  AUDIT_EVENT_TYPES,
  AUDIT_SEVERITY_LABELS,
  auditEventLabel,
  auditEventModule,
  formatRequestDateTime,
  recordsSensitiveAccess,
  type DemoAuditEvent,
} from "@/components/ops/audit-activity-data";

/**
 * Audit event detail — UI Phase 2M, the secondary/evidence region of the List + Detail workspace.
 * Pure content with no boundary of its own (`DETAIL PANEL`'s single leading `border-l` on desktop,
 * the `Sheet` below `lg:`), so one component renders identically in both. It clarifies ONE event —
 * the list is the history; there is no timeline and no related-event group.
 *
 * Built against the SEC-01 **normal-tier projection** (`UI-04` §48.1), never a raw row. It shows
 * only fields that projection carries, and says plainly what it does not: session, request and
 * correlation identifiers, the client identifier and event metadata are omitted at this tier.
 * **There is no per-row "redacted" marker, and none is faked** — SEC-01 omits the keys entirely so a
 * caller cannot tell "redacted" from "absent", which is deliberate. The redaction note is therefore
 * one static, accurate statement about the tier, identical for every event.
 *
 * **Sensitive access is represented coarsely.** For an event that RECORDS a governed read of
 * restricted data, the panel says so, with the domain, actor class, target reference and timestamp
 * the rest of the panel already shows — never the value, never a data class (that lives in
 * `metadata`, which is omitted), and there is no reveal control. This is distinct from an event whose
 * OWN detail is sensitive-tier only, which the normal-tier projection cannot signal.
 *
 * **The actor is a class, not a person.** `actor_user_id` is an opaque id and is not shown; a
 * service is named by its emitting module and described as automated.
 *
 * **Read-only by design.** No replay, retry, delete, edit or export control exists in the panel, and
 * SEC-01 has no export route to back one; WLT-01's evidence export is a different, maker-checker-gated
 * feature and is not conflated with audit export.
 *
 * `showHeading` is true only for the desktop panel; the Sheet carries the event and reference in its
 * own title/description, so each appears exactly once either way.
 */
export function AuditActivityDetail({
  event,
  showHeading = false,
}: {
  event: DemoAuditEvent;
  showHeading?: boolean;
}) {
  const type = AUDIT_EVENT_TYPES[event.eventType];
  const sensitive = recordsSensitiveAccess(event);

  return (
    <div className="flex flex-col gap-6">
      {showHeading && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{event.ref}</p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{auditEventLabel(event)}</h2>
        </div>
      )}

      <Section title="Event Summary">
        <Row label="Event type">{event.eventType}</Row>
        <Row label="Domain">{auditEventModule(event)}</Row>
        <Row label="Action">{event.action}</Row>
        <Row label="Severity">{AUDIT_SEVERITY_LABELS[event.severity]}</Row>
        {event.category && <Row label="Category">{AUDIT_CATEGORY_LABELS[event.category]}</Row>}
      </Section>

      <section aria-label="Actor Context">
        <h3 className="text-sm font-semibold text-foreground">Actor Context</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Actor type">{AUDIT_ACTOR_TYPE_LABELS[event.actorType]}</Row>
          {event.actorType === "service" && <Row label="Service">{type.module}</Row>}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">{AUDIT_ACTOR_NOTES[event.actorType]}</p>
      </section>

      <Section title="Target">
        <Row label="Target">{event.targetLabel}</Row>
        <Row label="Target type">{event.entityType}</Row>
        {event.targetHref && (
          <Row label="Related">
            <Link
              href={event.targetHref}
              className="font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Open related page
            </Link>
          </Row>
        )}
      </Section>

      <Section title="Result">
        <Row label="Result">
          <AuditResultLine result={event.result} size="sm" />
        </Row>
        {event.reasonCode && <Row label="Reason code">{event.reasonCode}</Row>}
      </Section>

      {sensitive && (
        <section aria-label="Sensitive Access">
          <h3 className="text-sm font-semibold text-foreground">Sensitive Access</h3>
          <p className="mt-3 text-xs text-foreground">Sensitive access recorded.</p>
          <p className="mt-2 text-xs text-muted-foreground">
            A governed read of restricted data occurred. The value that was read is not part of this record and is never
            shown here; there is no way to reveal it from this page.
          </p>
        </section>
      )}

      <section aria-label="Evidence and Redaction">
        <h3 className="text-sm font-semibold text-foreground">Evidence &amp; Redaction</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Classification">{capitalise(event.classification)}</Row>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Standard-tier view. Session, request and correlation identifiers, the client identifier and event metadata are
          not included, and cannot be revealed from this page.
        </p>
      </section>

      <Section title="Reference">
        <Row label="Event reference">{event.ref}</Row>
        <Row label="Occurred">{formatRequestDateTime(event.occurredAtUtc)}</Row>
        <Row label="Recorded">{formatRequestDateTime(event.ingestedAtUtc)}</Row>
      </Section>
    </div>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
