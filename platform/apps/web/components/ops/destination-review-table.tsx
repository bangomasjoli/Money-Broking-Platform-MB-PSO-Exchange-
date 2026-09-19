"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRequestDate } from "@/components/ops/client-request-data";
import { destinationReference, recordId, type DestinationReviewRecord } from "@/components/ops/destination-review-data";
import { DestinationStatusLine } from "@/components/wallet-destinations/destination-status";
import {
  destinationTypeLabel,
  networkContext,
  primaryIdentifier,
} from "@/components/wallet-destinations/destination-data";

/**
 * Destination review queue — UI Phase 2K, primary region of the List + Detail workspace (`UI-04`
 * §35.16). Same two-presentation pattern as `UI Phase 2J`'s Client Requests queue, switched by CSS
 * so only one is ever in the accessibility tree:
 *
 * - `≥768px` (`md:`): a real `<table>`, `COMPACT` 40px rows (`h-10`; "Wallet Destination Review" is
 *   named in `UI-04` §35.14's "standard lists" tier), hairline dividers, no zebra striping. Columns
 *   are only what the internal safe responses back: Destination (masked), Network / Rail and Status
 *   always; Registered, Type and Client as room allows. No balance, amount, risk-score or
 *   settlement column: WLT-01 owns none of them.
 * - `<768px`: a compact separated list (masked identifier, client, type · network, state, date).
 *
 * Columns respond to a **container query** on the table region (the split panel makes the viewport
 * the wrong measure): Registered at `≥42rem` (672px), Type at `≥48rem` (768px), Client at `≥56rem`
 * (896px). Worst cases, by arithmetic (estimated text widths; not rendered — visual QA deferred):
 * the persistent split leaves ~623px at 1280px and ~624px at 1024px, where the 3 base columns
 * (~500px, status as icon + text, no Badge) fit with ~120px to spare; the full-width table at 768px
 * is 720px and adds Registered (~600px); Type and Client only appear once ≥768px / ≥896px is
 * genuinely available (~700px / ~800px needed).
 *
 * **Selection is keyboard-native**, exactly as in `client-request-table.tsx`: the Destination cell
 * holds a real `<button>` (one tab stop per row; `aria-current` marks the open record); the `<tr>`
 * `onClick` only enlarges the mouse hit area, adds no role or tab stop, and the button has no
 * `onClick` of its own, so selection never fires twice.
 *
 * Only masked values are ever shown (`address_masked` / `account_identifier_masked`, already masked
 * by `WLT-01`'s `maskAddress`); there is no reveal control anywhere on this page.
 */

const REGISTERED_COL = "hidden @2xl:table-cell";
const TYPE_COL = "hidden @3xl:table-cell";
const CLIENT_COL = "hidden @4xl:table-cell";

export function DestinationReviewTable({
  records,
  selectedId,
  onSelect,
}: {
  records: DestinationReviewRecord[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="hidden md:block @container">
        <Table aria-label="Wallet destination reviews">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Destination</TableHead>
              <TableHead className={TYPE_COL}>Type</TableHead>
              <TableHead>Network / Rail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className={REGISTERED_COL}>Registered</TableHead>
              <TableHead className={CLIENT_COL}>Client</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => {
              const id = recordId(record);
              const isSelected = id === selectedId;
              return (
                <TableRow
                  key={id}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={() => onSelect(id)}
                  className="group/row h-10 cursor-pointer"
                >
                  <TableCell className="border-l-2 border-l-transparent group-data-[state=selected]/row:border-l-foreground">
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      aria-label={`${primaryIdentifier(record.destination)}, open ${destinationReference(record)}`}
                      className="rounded-sm text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {primaryIdentifier(record.destination)}
                    </button>
                  </TableCell>
                  <TableCell className={`${TYPE_COL} text-muted-foreground`}>
                    {destinationTypeLabel(record.destination.destination_type)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{networkContext(record.destination)}</TableCell>
                  <TableCell>
                    <DestinationStatusLine status={record.destination.status} />
                  </TableCell>
                  <TableCell className={`${REGISTERED_COL} text-muted-foreground`}>
                    {formatRequestDate(record.destination.created_at_utc)}
                  </TableCell>
                  <TableCell className={`${CLIENT_COL} text-muted-foreground`}>{record.review.clientRef}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Wallet destination reviews" className="flex flex-col md:hidden">
        {records.map((record) => (
          <li key={recordId(record)} className="border-t border-border first:border-t-0">
            <button
              type="button"
              onClick={() => onSelect(recordId(record))}
              className="flex w-full flex-col gap-1 rounded-sm py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">
                  {primaryIdentifier(record.destination)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRequestDate(record.destination.created_at_utc)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {record.review.clientRef} · {destinationTypeLabel(record.destination.destination_type)} ·{" "}
                {networkContext(record.destination)}
              </span>
              <DestinationStatusLine status={record.destination.status} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
