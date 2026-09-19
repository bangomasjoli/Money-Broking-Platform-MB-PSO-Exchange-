"use client";

import { useState } from "react";
import { ApprovalRequestDetail } from "@/components/ops/approval-request-detail";
import { ApprovalRequestTable } from "@/components/ops/approval-request-table";
import {
  APPROVAL_STATUSES,
  APPROVAL_STATUS_LABELS,
  APPROVAL_TYPES,
  DEMO_APPROVAL_REQUESTS_ALL,
  approvalReference,
  type ApprovalStatus,
} from "@/components/ops/approval-request-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsLgUp } from "@/lib/use-is-lg-up";

/**
 * Maker-Checker Queue — workspace composition root. UI Phase 2L. Same structure and responsive model
 * as the Client Requests / Wallet Destination Review workspaces, on the shared `useIsLgUp`: local
 * React state only (`statusFilter`, `selectedId`, `mobileDetailOpen`) — no fetch, server action or
 * mutation. **Nothing here ever changes a request's status** — no local fake approval, no optimistic
 * update; the fixtures are read-only.
 *
 * - `≥1024px` (`lg:`): persistent split — queue beside a fixed 320px `DETAIL PANEL` (single leading
 *   `border-l`, `UI-04` §35.17). The table region is ~623px at 1280px and ~624px at 1024px (the
 *   sidebar's 241px arrives exactly as the viewport gains 256px), so the brief's `≥1280` panel and
 *   its `1024–1279` "if measured safe" case resolve identically.
 * - `<1024px`: queue full width; selecting opens a `Sheet` with the identical detail component.
 *
 * **Default view: Pending.** The page is a *queue*: its primary job is the requests a checker must
 * act on, and the Overview's "Maker-Checker Queue — N items" counts exactly those, so opening the page
 * on the same set keeps the two coherent. History is not hidden — the labelled Status filter reaches
 * every terminal state and "All requests" in one step, and the live region always reports "Showing N
 * of M". (The other Ops queues default to "All" because their records mix work and context; here
 * terminal requests are pure history.)
 *
 * The filter options are DERIVED from the governed status enum and its label map, so a status can
 * never be missing or worded differently from the queue. Search is not added: `IAM-02` has no
 * search capability and six records do not justify one. The selected request is derived, not stored
 * and synced — if the filter hides the stored selection the panel shows the first visible one.
 */

type StatusFilter = "all" | ApprovalStatus;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All requests" },
  ...APPROVAL_STATUSES.map((status) => ({ value: status, label: APPROVAL_STATUS_LABELS[status] })),
];

export function ApprovalRequestsWorkspace() {
  const isLgUp = useIsLgUp();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [storedSelectedId, setStoredSelectedId] = useState<string | undefined>(undefined);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  if (DEMO_APPROVAL_REQUESTS_ALL.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-6 py-10">
        <p className="text-sm font-medium text-foreground">No maker-checker requests are available.</p>
      </div>
    );
  }

  const visible =
    statusFilter === "all"
      ? DEMO_APPROVAL_REQUESTS_ALL
      : DEMO_APPROVAL_REQUESTS_ALL.filter((r) => r.status === statusFilter);
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
            <Label htmlFor="approval-request-status-filter" className="text-xs font-medium text-foreground">
              Status
            </Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger id="approval-request-status-filter" className="h-10 w-72 max-w-full">
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
            Showing {visible.length} of {DEMO_APPROVAL_REQUESTS_ALL.length}{" "}
            {DEMO_APPROVAL_REQUESTS_ALL.length === 1 ? "request" : "requests"}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-6 py-10">
            <p className="text-sm font-medium text-foreground">
              {statusFilter === "pending"
                ? "No approval requests currently require checker action."
                : "No approval requests match the current view."}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => setStatusFilter("all")}>
              Show all requests
            </Button>
          </div>
        ) : (
          <ApprovalRequestTable
            requests={visible}
            selectedId={isLgUp && selected ? selected.id : undefined}
            onSelect={handleSelect}
          />
        )}
      </div>

      <aside aria-label="Selected approval request" className="hidden lg:block lg:border-l lg:border-border lg:pl-8">
        {selected ? (
          <ApprovalRequestDetail request={selected} showHeading />
        ) : (
          <p className="text-sm text-muted-foreground">No approval request to display.</p>
        )}
      </aside>

      <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected ? APPROVAL_TYPES[selected.action].label : "Approval request"}</SheetTitle>
            <SheetDescription>{selected ? approvalReference(selected) : "No request selected"}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{selected && <ApprovalRequestDetail request={selected} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
