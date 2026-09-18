"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DestinationStatusBadge } from "@/components/wallet-destinations/destination-status";
import {
  destinationTypeLabel,
  formatRegisteredDate,
  networkContext,
  primaryIdentifier,
  type PublicDestination,
} from "@/components/wallet-destinations/destination-data";

/**
 * Destination list/table — UI Phase 2E, the primary region of the List + Detail workspace
 * (`UI-04` §35.16's adjudication, applied for the first time). `UI-02` §15's existing table
 * direction is followed unchanged: numeric columns would be right-aligned (none present here —
 * no amount/balance data belongs on this page, `UI-04` §35's ownership boundary), status is a
 * restrained `Badge` (not a large colored pill), row heights are governed (`COMPACT`, 40px —
 * `UI-04` §35.14's mapping for "standard lists"), header is visually distinct by weight only (the
 * shared `Table` primitive's own `TableHead`, unchanged), no giant card wrapper, no zebra
 * striping, hairline `border-b` row dividers (the shared primitive's own default).
 *
 * Row selection reuses the shared `Table` primitive's own `data-[state=selected]:bg-muted`
 * support (already built into `table.tsx`, not added here) — selecting a row is a single action
 * (open its detail), so the whole `<tr>` is the interactive unit: `tabIndex={0}` +
 * `onKeyDown` (Enter/Space) + `aria-selected`, a common accessible pattern for single-action
 * row-selection tables, rather than nesting a button inside one cell.
 *
 * "Registered" (not "Last Updated"): the public contract returns only `created_at_utc`, no
 * update timestamp — verified against `dto.ts` directly, not assumed from the brief's own
 * "likely columns" list.
 */
export function DestinationTable({
  destinations,
  selectedId,
  onSelect,
}: {
  destinations: PublicDestination[];
  selectedId: string | undefined;
  onSelect: (destinationId: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Destination</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Network / Country</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Registered</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {destinations.map((destination) => {
          const isSelected = destination.destination_id === selectedId;
          return (
            <TableRow
              key={destination.destination_id}
              tabIndex={0}
              aria-selected={isSelected}
              data-state={isSelected ? "selected" : undefined}
              onClick={() => onSelect(destination.destination_id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(destination.destination_id);
                }
              }}
              className="h-10 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <TableCell className="font-medium text-foreground">
                {primaryIdentifier(destination)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {destinationTypeLabel(destination.destination_type)}
              </TableCell>
              <TableCell className="text-muted-foreground">{networkContext(destination)}</TableCell>
              <TableCell>
                <DestinationStatusBadge status={destination.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatRegisteredDate(destination.created_at_utc)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
