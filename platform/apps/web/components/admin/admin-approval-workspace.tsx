"use client";

import { useState } from "react";
import { AdminApprovalDetail } from "@/components/admin/admin-approval-detail";
import { AdminApprovalTable } from "@/components/admin/admin-approval-table";
import {
  ADMIN_APPROVAL_REQUESTS,
  domainOf,
  domainsPresent,
  statusCountsLine,
} from "@/components/admin/approval-oversight-data";
import {
  APPROVAL_STATUSES,
  APPROVAL_STATUS_LABELS,
  APPROVAL_TYPES,
  type ApprovalModule,
  type ApprovalStatus,
} from "@/components/ops/approval-request-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsLgUp } from "@/lib/use-is-lg-up";

/**
 * Approval Queue — workspace composition root. UI Phase 2R. Holds the only client state this page needs
 * (`statusFilter`, `domainFilter`, `selectedId`, `mobileDetailOpen` — local React state only; no fetch, no
 * server action, no mutation, and no local state TRANSITION: nothing here can approve, reject, block, cancel
 * or expire anything) and applies the governed List + Detail transformation (`UI-04` §35.16), reusing
 * `useIsLgUp`:
 *
 * - `≥1024px` (`lg:`): persistent split — list (flexible) beside a fixed 320px `DETAIL PANEL` (single
 *   leading `border-l`, §35.17). The brief's `≥1280` persistent-panel requirement and its `1024–1279` "if
 *   safe" case resolve identically: content width is ~976px at 1024px (no sidebar) and ~975px at 1280px
 *   (240px sidebar appears), so the split is exactly as safe in one range as the other.
 * - `<1024px`: list full width; selecting a request opens a `Sheet` with the identical detail. The
 *   `matchMedia` gate means selecting at `≥1024px` only updates the visible panel and never opens a
 *   redundant overlay on top of it.
 *
 * **Default view: ALL, unlike the Ops queue's Pending** (`UI-04` §53.1). The Ops page is a work queue whose
 * Overview count is "N pending", so it opens on the requests a checker must act on. This page is an
 * oversight register: terminal requests — approved, rejected, expired, blocked — are the evidence it exists
 * to show, and hiding them by default would present the control as a queue rather than a record. The
 * "Showing N of M" live region and a one-line count summary state the composition either way.
 *
 * **Two filters, both justified.** Status is the governed IAM-02 model, derived from the same enum and label
 * map the Ops page uses (so "Rejected" is offered even though no demo request has that status — the empty
 * state is the honest answer, and `cancelled`, which nothing writes, is not offered). Domain is useful here
 * and not on the Ops page because this page spans workflows; its options are the modules that actually have a
 * request, so it never offers an empty choice. **No search** — IAM-02 has no search capability and six
 * records do not justify one.
 *
 * The selected request is derived, not stored-and-synced: if a filter hides the stored selection, the panel
 * shows the first visible request instead — no effect-driven state repair.
 */

type StatusFilter = "all" | ApprovalStatus;
type DomainFilter = "all" | ApprovalModule;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  ...APPROVAL_STATUSES.map((status) => ({ value: status as StatusFilter, label: APPROVAL_STATUS_LABELS[status] })),
];

const DOMAIN_OPTIONS: { value: DomainFilter; label: string }[] = [
  { value: "all", label: "All domains" },
  ...domainsPresent().map((domain) => ({ value: domain as DomainFilter, label: domain })),
];

export function AdminApprovalWorkspace() {
  const isLgUp = useIsLgUp();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [domainFilter, setDomainFilter] = useState<DomainFilter>("all");
  const [storedSelectedId, setStoredSelectedId] = useState<string | undefined>(ADMIN_APPROVAL_REQUESTS[0]?.id);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  if (ADMIN_APPROVAL_REQUESTS.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-6 py-10">
        <p className="text-sm font-medium text-foreground">No approval requests are represented in this demo view.</p>
      </div>
    );
  }

  const visible = ADMIN_APPROVAL_REQUESTS.filter(
    (request) =>
      (statusFilter === "all" || request.status === statusFilter) &&
      (domainFilter === "all" || domainOf(request) === domainFilter),
  );
  const selected = visible.find((request) => request.id === storedSelectedId) ?? visible[0];

  function handleSelect(id: string) {
    setStoredSelectedId(id);
    if (!isLgUp) setMobileDetailOpen(true);
  }

  function resetFilters() {
    setStatusFilter("all");
    setDomainFilter("all");
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="admin-approval-status-filter" className="text-xs font-medium text-foreground">
                Status
              </Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger id="admin-approval-status-filter" className="h-10 w-72 max-w-full">
                  <SelectValue>{STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="admin-approval-domain-filter" className="text-xs font-medium text-foreground">
                Domain
              </Label>
              <Select value={domainFilter} onValueChange={(value) => setDomainFilter(value as DomainFilter)}>
                <SelectTrigger id="admin-approval-domain-filter" className="h-10 w-40 max-w-full">
                  <SelectValue>{DOMAIN_OPTIONS.find((option) => option.value === domainFilter)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DOMAIN_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            Showing {visible.length} of {ADMIN_APPROVAL_REQUESTS.length}{" "}
            {ADMIN_APPROVAL_REQUESTS.length === 1 ? "request" : "requests"}
          </p>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {statusCountsLine(ADMIN_APPROVAL_REQUESTS)} · Newest first
        </p>

        {visible.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-6 py-10">
            <p className="text-sm font-medium text-foreground">No approval requests match the current view.</p>
            <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
              Show all requests
            </Button>
          </div>
        ) : (
          <AdminApprovalTable requests={visible} selectedId={isLgUp ? selected?.id : undefined} onSelect={handleSelect} />
        )}
      </div>

      <aside aria-label="Selected approval request" className="hidden lg:block lg:border-l lg:border-border lg:pl-8">
        {selected ? (
          <AdminApprovalDetail request={selected} showHeading />
        ) : (
          <p className="text-sm text-muted-foreground">No approval request to display.</p>
        )}
      </aside>

      <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected ? selected.ref : "Approval request"}</SheetTitle>
            <SheetDescription>{selected ? APPROVAL_TYPES[selected.action].label : "No request selected"}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{selected && <AdminApprovalDetail request={selected} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
