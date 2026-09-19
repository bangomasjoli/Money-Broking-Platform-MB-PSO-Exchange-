import Link from "next/link";
import type { ReactNode } from "react";
import { AWAITING_STAFF_ACTION_STATUSES, requestReference } from "@/components/ops/client-request-data";
import {
  CLIENT_APPLICATION_STATUS_LABELS,
  DEMO_APPROVAL_REQUESTS,
  DEMO_CLIENT_REQUESTS,
  DEMO_WALLET_REVIEW_ITEMS,
  MAKER_CHECKER_STATUS_LABELS,
  WLT_STATUS_LABELS,
} from "@/components/ops/ops-data";

/**
 * Operational Queues — UI Phase 2I, primary column, `WORKSPACE PANEL`. Three real, governed
 * queue concepts only (`UI-04` §8's `B`-classified Ops IA) — no C-classified queue (Deposit/
 * Withdrawal/Broking-RFQ Operations, Settlement, Reconciliation, Exceptions/Breaks) appears here
 * in any form. Each sub-queue is its own `<h3>` under this section's own `<h2>`, preserving
 * logical heading hierarchy (this turn's own explicit requirement) rather than three unlabelled
 * lists.
 *
 * `DENSE` row tier (32px, `h-8`) — `UI-04` §35.14/§18's own "audit/reconciliation/high-volume
 * operations" mapping, applied here to every operational queue row per this turn's own "Ops
 * should be denser than Client" direction; hairline dividers, no zebra striping, no giant rounded
 * wrapper, state text never color-only (plain text label, no `Badge`, no colored dot — consistent
 * with every other Ops/Client status presentation on this platform so far).
 *
 * **Maker-Checker semantics never imply self-approval** — each row shows only the action/subject/
 * status; no actor identity, no approve/reject control (that belongs to the future dedicated
 * Maker-Checker Queue page, explicitly not built this turn — this turn's own instruction).
 */
export function OperationalQueues() {
  return (
    <section aria-labelledby="operational-queues-heading">
      <h2 id="operational-queues-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Operational Queues
      </h2>

      <div className="mt-4 flex flex-col gap-6">
        <QueueGroup
          title="Client Requests"
          action={
            <Link
              href="/ops/client-requests"
              aria-label="View all client requests"
              className="text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              View all
            </Link>
          }
        >
          <ul className="flex flex-col">
            {DEMO_CLIENT_REQUESTS.filter((item) => AWAITING_STAFF_ACTION_STATUSES.includes(item.status)).map((item) => (
              <li key={item.id} className="flex h-8 items-center justify-between gap-4 border-t border-border first:border-t-0">
                <span className="truncate text-sm text-foreground">{requestReference(item)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {CLIENT_APPLICATION_STATUS_LABELS[item.status]}
                </span>
              </li>
            ))}
          </ul>
        </QueueGroup>

        <QueueGroup title="Wallet Destination Review">
          <ul className="flex flex-col">
            {DEMO_WALLET_REVIEW_ITEMS.map((item) => (
              <li key={item.id} className="flex h-8 items-center justify-between gap-4 border-t border-border first:border-t-0">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {item.reference} <span className="text-muted-foreground">· {item.clientReference}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{WLT_STATUS_LABELS[item.status]}</span>
              </li>
            ))}
          </ul>
        </QueueGroup>

        <QueueGroup title="Maker-Checker Queue">
          <ul className="flex flex-col">
            {DEMO_APPROVAL_REQUESTS.map((item) => (
              <li key={item.id} className="flex h-8 items-center justify-between gap-4 border-t border-border first:border-t-0">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {item.subjectReference} <span className="text-muted-foreground">· {item.action}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {MAKER_CHECKER_STATUS_LABELS[item.status]}
                </span>
              </li>
            ))}
          </ul>
        </QueueGroup>
      </div>
    </section>
  );
}

function QueueGroup({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
