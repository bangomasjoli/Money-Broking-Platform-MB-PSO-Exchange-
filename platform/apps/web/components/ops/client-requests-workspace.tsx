"use client";

import { useState } from "react";
import { ClientRequestDetail } from "@/components/ops/client-request-detail";
import { ClientRequestTable } from "@/components/ops/client-request-table";
import {
  CLIENT_APPLICATION_STATUS_LABELS,
  DEMO_CLIENT_REQUESTS,
  requestReference,
  type ClientApplicationStatus,
} from "@/components/ops/client-request-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsLgUp } from "@/lib/use-is-lg-up";

/**
 * Client Requests — workspace composition root. UI Phase 2J. Holds the only client state this
 * page needs (`statusFilter`, `selectedId`, `mobileDetailOpen` — local React state only; no
 * fetch, no server action, no mutation) and applies the governed List + Detail transformation
 * (`UI-04` §35.16), reusing `UI Phase 2E`'s `useIsLgUp`:
 *
 * - `≥1024px` (`lg:`): persistent split — queue (flexible) beside a fixed 320px `DETAIL PANEL`
 *   (single leading `border-l`, `UI-04` §35.17). 320px, not Phase 2E's 360px, because this table
 *   has more columns; the resulting ~623px table region is the worst case the table's own
 *   container-query columns are sized against (see `client-request-table.tsx`). The brief's
 *   `≥1280` persistent-panel requirement and its `1024–1279` "if safe" case resolve identically:
 *   content width is ~976px at 1024px (no sidebar) and ~975px at 1280px (240px sidebar appears),
 *   so the split is exactly as safe in one range as the other.
 * - `<1024px`: queue full width; selecting a request opens a `Sheet` with the identical detail.
 *   The `matchMedia` gate means selecting at `≥1024px` only updates the visible panel and never
 *   opens a redundant overlay on top of it.
 *
 * **Filter (justified, not decorative):** an operational queue mixes work awaiting action with
 * finished history, and staff need to isolate the former. The options are DERIVED from the
 * governed status enum's label map, so a status can never be missing from the filter or worded
 * differently from the queue. Search is deliberately NOT added — no free-text search capability
 * exists in `CLT-01` (`UI-04` §45.5), and with a handful of records it would be decoration.
 *
 * The selected request is derived, not stored-and-synced: if the filter hides the stored
 * selection, the panel shows the first visible request instead — no effect-driven state repair
 * (the `react-hooks/set-state-in-effect` rule would flag that, correctly).
 */

type StatusFilter = "all" | ClientApplicationStatus;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All requests" },
  ...(Object.keys(CLIENT_APPLICATION_STATUS_LABELS) as ClientApplicationStatus[]).map((status) => ({
    value: status,
    label: CLIENT_APPLICATION_STATUS_LABELS[status],
  })),
];

export function ClientRequestsWorkspace() {
  const isLgUp = useIsLgUp();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [storedSelectedId, setStoredSelectedId] = useState<string | undefined>(DEMO_CLIENT_REQUESTS[0]?.id);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  if (DEMO_CLIENT_REQUESTS.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-6 py-10">
        <p className="text-sm font-medium text-foreground">No client requests are currently awaiting review.</p>
      </div>
    );
  }

  const visible =
    statusFilter === "all" ? DEMO_CLIENT_REQUESTS : DEMO_CLIENT_REQUESTS.filter((r) => r.status === statusFilter);
  const selected = visible.find((r) => r.id === storedSelectedId) ?? visible[0];

  function handleSelect(id: string) {
    setStoredSelectedId(id);
    if (!isLgUp) setMobileDetailOpen(true);
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="client-request-status-filter" className="text-xs font-medium text-foreground">
              Status
            </Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger id="client-request-status-filter" className="h-10 w-64 max-w-full">
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
            Showing {visible.length} of {DEMO_CLIENT_REQUESTS.length}{" "}
            {DEMO_CLIENT_REQUESTS.length === 1 ? "request" : "requests"}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-6 py-10">
            <p className="text-sm font-medium text-foreground">No client requests match the current view.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setStatusFilter("all")}>
              Show all requests
            </Button>
          </div>
        ) : (
          <ClientRequestTable
            requests={visible}
            selectedId={isLgUp ? selected?.id : undefined}
            onSelect={handleSelect}
          />
        )}
      </div>

      <aside
        aria-label="Selected client request"
        className="hidden lg:block lg:border-l lg:border-border lg:pl-8"
      >
        {selected ? (
          <ClientRequestDetail request={selected} showHeading />
        ) : (
          <p className="text-sm text-muted-foreground">No client request to display.</p>
        )}
      </aside>

      <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected ? selected.legalName : "Client request"}</SheetTitle>
            <SheetDescription>{selected ? requestReference(selected) : "No request selected"}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{selected && <ClientRequestDetail request={selected} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
