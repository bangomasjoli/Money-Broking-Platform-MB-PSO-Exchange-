import Link from "next/link";
import type { ReactNode } from "react";
import {
  DEMO_AUDIT_EVENTS,
  OPS_WORKFLOW_AVAILABILITY,
  formatOccurredAt,
} from "@/components/ops/ops-data";

/**
 * Workflow Availability + Recent Staff Activity — UI Phase 2I, secondary column, `DETAIL/
 * EVIDENCE PANEL` treatment (single leading `border-l`, `UI-04` §35.17 — the same pattern every
 * prior client-page secondary column already uses).
 *
 * Workflow Availability shows exactly the 4 OTHER `B`-classified Ops nav items (`UI-04` §8) —
 * "Operational Overview" itself is omitted (this page IS that item; linking to itself would be
 * pointless). All 4 read "Interface planned," none is a real link — `UI Phase 2B`'s own inert-nav
 * convention is preserved, not activated early, per this turn's explicit "do NOT activate other
 * routes in this turn" instruction. No `C`-classified Ops capability (Deposit/Withdrawal/Broking-
 * RFQ Operations, Settlement, Reconciliation, Exceptions/Breaks) appears here in any form.
 *
 * Recent Staff Activity shows only the confirmed-SAFE (already tier-redacted) `SEC-01` field
 * subset — `event_type`/`actor_type`/`entity_type`/`action`/`result`/`occurred_at_utc` — verified
 * against `lib/read-redaction.ts`'s own `RedactableAuditEventRow` this turn. No actor identity
 * (even a demo-shaped one), no raw payload, no hash-chain/integrity field, no drill-down — full
 * detail belongs to the future dedicated Audit / Activity page, not this overview.
 */
export function WorkflowAvailability() {
  return (
    <section aria-labelledby="workflow-availability-heading">
      <h2 id="workflow-availability-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Workflow Availability
      </h2>

      <dl className="mt-4 flex flex-col gap-3">
        {OPS_WORKFLOW_AVAILABILITY.map((item) => (
          <Row key={item.label} label={item.label} href={item.href}>
            {item.status}
          </Row>
        ))}
      </dl>
    </section>
  );
}

export function RecentActivity() {
  return (
    <section aria-labelledby="recent-activity-heading" className="mt-8">
      <h2 id="recent-activity-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Recent Staff Activity
      </h2>

      <ul className="mt-4 flex flex-col gap-3">
        {DEMO_AUDIT_EVENTS.map((event) => (
          <li key={event.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm text-foreground">{event.eventType}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {event.result === "success" ? "Succeeded" : "Failed"} · {event.actorType} ·{" "}
              {formatOccurredAt(event.occurredAtUtc)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ label, href, children }: { label: string; href?: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <dt className="text-sm text-muted-foreground">
        {href ? (
          <Link
            href={href}
            className="font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {label}
          </Link>
        ) : (
          label
        )}
      </dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}
