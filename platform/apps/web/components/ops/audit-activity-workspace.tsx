"use client";

import { useState } from "react";
import { AuditActivityDetail } from "@/components/ops/audit-activity-detail";
import { AuditActivityTable } from "@/components/ops/audit-activity-table";
import {
  AUDIT_DOMAINS,
  DEMO_AUDIT_EVENTS,
  auditEventLabel,
  auditEventModule,
  recordsSensitiveAccess,
  type AuditSourceModule,
} from "@/components/ops/audit-activity-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsLgUp } from "@/lib/use-is-lg-up";

/**
 * Audit / Activity — workspace composition root. UI Phase 2M. The same structure and responsive model
 * as the other Ops workspaces, on the shared `useIsLgUp`: local React state only (`domain`,
 * `activity`, `selectedId`, `mobileDetailOpen`) — no fetch, server action, export or mutation. The
 * page is read-only and nothing here changes a record.
 *
 * - `≥1024px` (`lg:`): persistent split — list beside a fixed 320px `DETAIL PANEL` (single leading
 *   `border-l`, `UI-04` §35.17). The table region is ~623px at 1280px and ~624px at 1024px (the
 *   sidebar's 241px arrives exactly as the viewport gains 256px), so the brief's `≥1280` panel and its
 *   `1024–1279` "if measured safe" case resolve identically.
 * - `<1024px`: list full width; selecting opens a `Sheet` with the identical detail component.
 *
 * **Two filters, both justified.** *Domain* — the events span several modules and an auditor
 * naturally narrows to one; its options are DERIVED from the modules actually present, so it can
 * never offer an empty or invented one. *Activity* — "Sensitive access only" isolates the events that
 * record a governed read of restricted data, which the brief singles out and for which real event
 * types exist (`wlt1`/`kyc1`/`aml1` `*_read`). No other filter is added. **No search** (SEC-01's
 * search takes exact-match filters, not free text, and ten events do not justify one) and **no
 * date-range control** (no "Last 24 hours" analytics; SEC-01 does support ranges, but with ten fixtures
 * a range control would be decoration).
 *
 * The default view is everything, newest first — an audit view must not hide history behind a
 * default. The selected event is derived, not stored and synced: if a filter hides the stored
 * selection the panel shows the first visible one.
 */

type DomainFilter = "all" | AuditSourceModule;
type ActivityFilter = "all" | "sensitive";

const DOMAIN_OPTIONS: { value: DomainFilter; label: string }[] = [
  { value: "all", label: "All domains" },
  ...AUDIT_DOMAINS.map((domain) => ({ value: domain, label: domain })),
];

const ACTIVITY_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "sensitive", label: "Sensitive access only" },
];

export function AuditActivityWorkspace() {
  const isLgUp = useIsLgUp();
  const [domain, setDomain] = useState<DomainFilter>("all");
  const [activity, setActivity] = useState<ActivityFilter>("all");
  const [storedSelectedId, setStoredSelectedId] = useState<string | undefined>(undefined);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  if (DEMO_AUDIT_EVENTS.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-6 py-10">
        <p className="text-sm font-medium text-foreground">No audit activity is available.</p>
      </div>
    );
  }

  const visible = DEMO_AUDIT_EVENTS.filter(
    (e) =>
      (domain === "all" || auditEventModule(e) === domain) && (activity === "all" || recordsSensitiveAccess(e)),
  );
  const selected = visible.find((e) => e.id === storedSelectedId) ?? visible[0];

  function handleSelect(id: string) {
    setStoredSelectedId(id);
    if (!isLgUp) setMobileDetailOpen(true);
  }

  function clearFilters() {
    setDomain("all");
    setActivity("all");
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="audit-domain-filter" className="text-xs font-medium text-foreground">
                Domain
              </Label>
              <Select value={domain} onValueChange={(value) => setDomain(value as DomainFilter)}>
                <SelectTrigger id="audit-domain-filter" className="h-10 w-40 max-w-full">
                  <SelectValue>{DOMAIN_OPTIONS.find((option) => option.value === domain)?.label}</SelectValue>
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
            <div className="flex items-center gap-2">
              <Label htmlFor="audit-activity-filter" className="text-xs font-medium text-foreground">
                Activity
              </Label>
              <Select value={activity} onValueChange={(value) => setActivity(value as ActivityFilter)}>
                <SelectTrigger id="audit-activity-filter" className="h-10 w-52 max-w-full">
                  <SelectValue>{ACTIVITY_OPTIONS.find((option) => option.value === activity)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            Showing {visible.length} of {DEMO_AUDIT_EVENTS.length} {DEMO_AUDIT_EVENTS.length === 1 ? "event" : "events"}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-6 py-10">
            <p className="text-sm font-medium text-foreground">No activity matches the current view.</p>
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        ) : (
          <AuditActivityTable
            events={visible}
            selectedId={isLgUp && selected ? selected.id : undefined}
            onSelect={handleSelect}
          />
        )}
      </div>

      <aside aria-label="Selected audit event" className="hidden lg:block lg:border-l lg:border-border lg:pl-8">
        {selected ? (
          <AuditActivityDetail event={selected} showHeading />
        ) : (
          <p className="text-sm text-muted-foreground">No audit event to display.</p>
        )}
      </aside>

      <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected ? auditEventLabel(selected) : "Audit event"}</SheetTitle>
            <SheetDescription>{selected ? selected.ref : "No event selected"}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{selected && <AuditActivityDetail event={selected} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
