"use client";

import { useState } from "react";
import { DestinationReviewDetail } from "@/components/ops/destination-review-detail";
import { DestinationReviewTable } from "@/components/ops/destination-review-table";
import {
  DEMO_REVIEW_RECORDS,
  destinationReference,
  recordId,
} from "@/components/ops/destination-review-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DESTINATION_STATUSES,
  STATUS_LABELS,
  primaryIdentifier,
  type DestinationStatus,
} from "@/components/wallet-destinations/destination-data";
import { useIsLgUp } from "@/lib/use-is-lg-up";

/**
 * Wallet Destination Review — workspace composition root. UI Phase 2K. Same structure and
 * responsive model as `UI Phase 2J`'s Client Requests workspace, on the same shared `useIsLgUp`:
 * local React state only (`statusFilter`, `selectedId`, `mobileDetailOpen`) — no fetch, server
 * action or mutation.
 *
 * - `≥1024px` (`lg:`): persistent split — queue beside a fixed 320px `DETAIL PANEL` (single leading
 *   `border-l`, `UI-04` §35.17). The table region is then ~623px at 1280px and ~624px at 1024px (the
 *   sidebar's 241px arrives exactly as the viewport gains 256px), which the table's container-query
 *   columns are sized against (see `destination-review-table.tsx`). The brief's `≥1280` persistent
 *   panel and its `1024–1279` "only if measured safe" case therefore resolve identically.
 * - `<1024px`: queue full width; selecting opens a `Sheet` with the identical detail component.
 *
 * **Filter (justified):** a review queue mixes destinations awaiting a decision with ones already
 * approved, active or revoked, and staff need to isolate the former. Options are DERIVED from the
 * governed `DESTINATION_STATUSES` and `STATUS_LABELS` (`UI Phase 2E`'s single label source), so a
 * status cannot be missing or worded differently from the queue. Search is not added: no search
 * capability exists in WLT-01, and with a handful of records it would be decoration.
 *
 * The selected record is derived, not stored-and-synced: if the filter hides the stored selection,
 * the panel shows the first visible record — no effect-driven state repair.
 */

type StatusFilter = "all" | DestinationStatus;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All destinations" },
  ...DESTINATION_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
];

export function DestinationReviewWorkspace() {
  const isLgUp = useIsLgUp();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [storedSelectedId, setStoredSelectedId] = useState<string | undefined>(
    DEMO_REVIEW_RECORDS[0] ? recordId(DEMO_REVIEW_RECORDS[0]) : undefined,
  );
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  if (DEMO_REVIEW_RECORDS.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-6 py-10">
        <p className="text-sm font-medium text-foreground">No wallet destination requests currently require review.</p>
      </div>
    );
  }

  const visible =
    statusFilter === "all"
      ? DEMO_REVIEW_RECORDS
      : DEMO_REVIEW_RECORDS.filter((r) => r.destination.status === statusFilter);
  const selected = visible.find((r) => recordId(r) === storedSelectedId) ?? visible[0];

  function handleSelect(id: string) {
    setStoredSelectedId(id);
    if (!isLgUp) setMobileDetailOpen(true);
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="destination-review-status-filter" className="text-xs font-medium text-foreground">
              Status
            </Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger id="destination-review-status-filter" className="h-10 w-64 max-w-full">
                <SelectValue>{FILTER_OPTIONS.find((option) => option.value === statusFilter)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            Showing {visible.length} of {DEMO_REVIEW_RECORDS.length}{" "}
            {DEMO_REVIEW_RECORDS.length === 1 ? "destination" : "destinations"}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-6 py-10">
            <p className="text-sm font-medium text-foreground">No wallet destination reviews match the current view.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setStatusFilter("all")}>
              Show all destinations
            </Button>
          </div>
        ) : (
          <DestinationReviewTable
            records={visible}
            selectedId={isLgUp && selected ? recordId(selected) : undefined}
            onSelect={handleSelect}
          />
        )}
      </div>

      <aside aria-label="Selected destination" className="hidden lg:block lg:border-l lg:border-border lg:pl-8">
        {selected ? (
          <DestinationReviewDetail record={selected} showHeading />
        ) : (
          <p className="text-sm text-muted-foreground">No destination to display.</p>
        )}
      </aside>

      <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected ? primaryIdentifier(selected.destination) : "Destination"}</SheetTitle>
            <SheetDescription>{selected ? destinationReference(selected) : "No destination selected"}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{selected && <DestinationReviewDetail record={selected} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
