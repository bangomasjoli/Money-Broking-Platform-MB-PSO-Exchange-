import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DestinationStatusBadge } from "@/components/wallet-destinations/destination-status";
import {
  DEMO_DESTINATIONS,
  STATUS_CATEGORY,
  destinationTypeLabel,
  primaryIdentifier,
} from "@/components/wallet-destinations/destination-data";

/**
 * Wallet & Payout Destinations Summary — UI Phase 2F, `WORKSPACE PANEL`. Reuses `UI Phase 2E`'s
 * real `DEMO_DESTINATIONS` fixture directly (same contract shape as `GET /wlt1/destinations` —
 * `A`-backed) — no second, inconsistent fixture source, and no numeric metric that could read as
 * a live figure beyond a plain destination count (this turn's own "do not create fake numeric
 * metrics that look live" instruction, read as: a *count of demo rows* is fine, since it is
 * transparently the same 5 rows the Wallet page itself shows and links to; a fabricated
 * percentage or trend would not be).
 *
 * NOT the full table (`UI-04` §37's `DestinationTable`) — a compact breakdown by semantic
 * category (`UI-04` §21: neutral/pending/active/blocked, `STATUS_CATEGORY` — already governed,
 * not reinvented) plus the 3 most recently registered destinations, each using the same shared
 * `DestinationStatusBadge` the Wallet page itself uses (not a duplicate status component).
 */
export function DestinationSummary() {
  const destinations = DEMO_DESTINATIONS;
  const byCategory = { neutral: 0, pending: 0, active: 0, blocked: 0 };
  for (const d of destinations) byCategory[STATUS_CATEGORY[d.status]] += 1;

  const recent = [...destinations]
    .sort((a, b) => new Date(b.created_at_utc).getTime() - new Date(a.created_at_utc).getTime())
    .slice(0, 3);

  return (
    <section aria-labelledby="destination-summary-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="destination-summary-heading" className="text-lg font-semibold tracking-tight text-foreground">
          Wallet & Payout Destinations
        </h2>
        <Link
          href="/app/wallet-destinations"
          className="flex items-center gap-0.5 text-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          View Wallet & Payout Destinations
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        {destinations.length} governed destination{destinations.length === 1 ? "" : "s"} —{" "}
        {byCategory.active} active, {byCategory.pending} pending, {byCategory.blocked} revoked
        {byCategory.neutral > 0 ? `, ${byCategory.neutral} draft` : ""}.
      </p>

      <ul className="mt-4 flex flex-col gap-1">
        {recent.map((destination) => (
          <li
            key={destination.destination_id}
            className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">
                {primaryIdentifier(destination)}
              </span>
              <span className="text-xs text-muted-foreground">
                {destinationTypeLabel(destination.destination_type)}
              </span>
            </span>
            <DestinationStatusBadge status={destination.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
