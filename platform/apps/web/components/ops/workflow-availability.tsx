import Link from "next/link";
import type { ReactNode } from "react";
import {
  AUDIT_ACTIVITY_HREF,
  AUDIT_RESULT_LABELS,
  RECENT_AUDIT_EVENTS,
  auditActorLabel,
  auditEventLabel,
  formatRequestDateTime,
} from "@/components/ops/audit-activity-data";
import { OPS_WORKFLOW_AVAILABILITY } from "@/components/ops/ops-data";

/**
 * Workflow Availability + Recent Staff Activity — UI Phase 2I, secondary column, `DETAIL/
 * EVIDENCE PANEL` treatment (single leading `border-l`, `UI-04` §35.17 — the same pattern every
 * prior client-page secondary column already uses).
 *
 * Workflow Availability shows exactly the 4 OTHER `B`-classified Ops nav items (`UI-04` §8) —
 * "Operational Overview" itself is omitted (this page IS that item; linking to itself would be
 * pointless). Each reads "Available" and links once its page exists (Client Requests `UI Phase 2J`,
 * Wallet Destination Review `2K`, Maker-Checker Queue `2L`, Audit / Activity `2M`); as of `UI Phase
 * 2M` all four do, so the whole initial Staff/Operations set is live. No `C`-classified Ops
 * capability (Deposit/Withdrawal/Broking-RFQ Operations, Settlement, Reconciliation, Exceptions/
 * Breaks) appears here in any form.
 *
 * Recent Staff Activity shows the two most recent events from the shared `audit-activity-data.ts` —
 * the SEC-01 normal-tier projection (`lib/read-redaction.ts`), by actor CLASS only: no actor
 * identity, no raw payload, no hash-chain/integrity field. Full detail is on the Audit / Activity
 * page (`UI Phase 2M`), which "View all" links to.
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
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="recent-activity-heading" className="text-lg font-semibold tracking-tight text-foreground">
          Recent Staff Activity
        </h2>
        <Link
          href={AUDIT_ACTIVITY_HREF}
          aria-label="View all audit activity"
          className="text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          View all
        </Link>
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {RECENT_AUDIT_EVENTS.map((event) => (
          <li key={event.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm text-foreground">{auditEventLabel(event)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {AUDIT_RESULT_LABELS[event.result]} · {auditActorLabel(event)} · {formatRequestDateTime(event.occurredAtUtc)}
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
