"use client";

import { useState } from "react";
import { ClientRiskDetail } from "@/components/admin/client-risk-detail";
import { ClientRiskTable } from "@/components/admin/client-risk-table";
import { DEMO_CLIENT_COMPLIANCE } from "@/components/admin/client-risk-data";
import { KYC_CASE_LABELS, type KycCaseStatus } from "@/components/client/client-demo-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsLgUp } from "@/lib/use-is-lg-up";

/**
 * Client Risk / KYC-KYB — workspace composition root. UI Phase 2O. Holds the only client state this
 * page needs (`statusFilter`, `selectedRef`, `mobileDetailOpen` — local React state only; no fetch, no
 * server action, no mutation) and applies the governed List + Detail transformation (`UI-04` §35.16),
 * reusing `useIsLgUp`:
 *
 * - `≥1024px` (`lg:`): persistent split — list (flexible) beside a fixed 320px `DETAIL PANEL` (single
 *   leading `border-l`, §35.17). The brief's `≥1280` persistent-panel requirement and its `1024–1279`
 *   "if safe" case resolve identically: content width is ~976px at 1024px (no sidebar) and ~975px at
 *   1280px (240px sidebar appears), so the split is exactly as safe in one range as the other.
 * - `<1024px`: list full width; selecting a client opens a `Sheet` with the identical detail. The
 *   `matchMedia` gate means selecting at `≥1024px` only updates the visible panel and never opens a
 *   redundant overlay on top of it.
 *
 * **One filter, justified:** KYC / KYB status — the governed `kyc_case.status` — lets a reviewer isolate
 * the cases that need attention. Its options are DERIVED from the same label map the list renders, so a
 * status can never be missing from the filter or worded differently. A Lifecycle filter was considered
 * and left out: the lifecycle column only appears when the list has room, so a filter on it would act on
 * a column a reader may not see, and with four demo clients it has nothing to isolate. **No search** —
 * no free-text capability exists in the backend and four records need none. **No Risk filter** — there
 * is no risk data to filter.
 *
 * The selected client is derived, not stored-and-synced: if the filter hides the stored selection, the
 * panel shows the first visible client instead — no effect-driven state repair.
 */

type StatusFilter = "all" | KycCaseStatus;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All clients" },
  ...(Object.keys(KYC_CASE_LABELS) as KycCaseStatus[]).map((status) => ({
    value: status,
    label: KYC_CASE_LABELS[status],
  })),
];

export function ClientRiskWorkspace() {
  const isLgUp = useIsLgUp();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [storedSelectedRef, setStoredSelectedRef] = useState<string | undefined>(DEMO_CLIENT_COMPLIANCE[0]?.clientRef);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  if (DEMO_CLIENT_COMPLIANCE.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-6 py-10">
        <p className="text-sm font-medium text-foreground">
          No client compliance records are represented in this demo view.
        </p>
      </div>
    );
  }

  const visible =
    statusFilter === "all"
      ? DEMO_CLIENT_COMPLIANCE
      : DEMO_CLIENT_COMPLIANCE.filter((client) => client.caseStatus === statusFilter);
  const selected = visible.find((client) => client.clientRef === storedSelectedRef) ?? visible[0];

  function handleSelect(clientRef: string) {
    setStoredSelectedRef(clientRef);
    if (!isLgUp) setMobileDetailOpen(true);
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="client-risk-status-filter" className="text-xs font-medium text-foreground">
              KYC / KYB status
            </Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger id="client-risk-status-filter" className="h-10 w-64 max-w-full">
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
            Showing {visible.length} of {DEMO_CLIENT_COMPLIANCE.length}{" "}
            {DEMO_CLIENT_COMPLIANCE.length === 1 ? "client" : "clients"}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-6 py-10">
            <p className="text-sm font-medium text-foreground">
              No client compliance records match the current view.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => setStatusFilter("all")}>
              Show all clients
            </Button>
          </div>
        ) : (
          <ClientRiskTable
            clients={visible}
            selectedRef={isLgUp ? selected?.clientRef : undefined}
            onSelect={handleSelect}
          />
        )}
      </div>

      <aside aria-label="Selected client compliance" className="hidden lg:block lg:border-l lg:border-border lg:pl-8">
        {selected ? (
          <ClientRiskDetail client={selected} showHeading />
        ) : (
          <p className="text-sm text-muted-foreground">No client compliance record to display.</p>
        )}
      </aside>

      <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected ? selected.legalName : "Client compliance"}</SheetTitle>
            <SheetDescription>{selected ? selected.clientRef : "No client selected"}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{selected && <ClientRiskDetail client={selected} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
