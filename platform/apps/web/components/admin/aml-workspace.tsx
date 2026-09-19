"use client";

import { useState } from "react";
import { AmlSubjectDetail } from "@/components/admin/aml-subject-detail";
import { AmlSubjectTable } from "@/components/admin/aml-subject-table";
import {
  AML_SUBJECT_TYPE_LABELS,
  DEMO_AML_SUBJECTS,
  SCREENING_STATUS_LABELS,
  type ScreeningStatus,
} from "@/components/admin/aml-monitoring-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsLgUp } from "@/lib/use-is-lg-up";

/**
 * AML screening workspace — composition root. UI Phase 2P. Holds the only client state this page needs
 * (`statusFilter`, `selectedRef`, `mobileDetailOpen` — local React state only; no fetch, no server action,
 * no mutation, and no local state TRANSITION: nothing here can change a screening, a match or a signal)
 * and applies the governed List + Detail transformation (`UI-04` §35.16), reusing `useIsLgUp`:
 *
 * - `≥1024px` (`lg:`): persistent split — list (flexible) beside a fixed 320px `DETAIL PANEL` (single
 *   leading `border-l`, §35.17). The brief's `≥1280` persistent-panel requirement and its `1024–1279`
 *   "if safe" case resolve identically: content width is ~976px at 1024px (no sidebar) and ~975px at
 *   1280px (240px sidebar appears), so the split is exactly as safe in one range as the other.
 * - `<1024px`: list full width; selecting a subject opens a `Sheet` with the identical detail. The
 *   `matchMedia` gate means selecting at `≥1024px` only updates the visible panel and never opens a
 *   redundant overlay on top of it.
 *
 * **One filter, justified:** Screening status — the governed `screening_request.status`. Each of its three
 * values has at least one demo subject, and it isolates the exceptions (stalled, failed) from finished
 * screenings. Options are DERIVED from the same label map the list renders, so a status can never be
 * missing from the filter or worded differently. **A Risk-signal status filter was considered and left
 * out:** the demo has a single signal, `superseded` is never written, and a filter whose options are
 * mostly empty would suggest signals are absent rather than sparse. **No search** — five records and no
 * free-text capability in the backend. **No transaction, alert or risk-rating filter** — no such data.
 *
 * The selected subject is derived, not stored-and-synced: if the filter hides the stored selection, the
 * panel shows the first visible subject instead — no effect-driven state repair.
 */

type StatusFilter = "all" | ScreeningStatus;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All subjects" },
  ...(Object.keys(SCREENING_STATUS_LABELS) as ScreeningStatus[]).map((status) => ({
    value: status,
    label: SCREENING_STATUS_LABELS[status],
  })),
];

export function AmlWorkspace() {
  const isLgUp = useIsLgUp();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [storedSelectedRef, setStoredSelectedRef] = useState<string | undefined>(DEMO_AML_SUBJECTS[0]?.subjectRef);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  if (DEMO_AML_SUBJECTS.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-6 py-10">
        <p className="text-sm font-medium text-foreground">No AML screening records are represented in this demo view.</p>
      </div>
    );
  }

  const visible =
    statusFilter === "all"
      ? DEMO_AML_SUBJECTS
      : DEMO_AML_SUBJECTS.filter((subject) => subject.screeningStatus === statusFilter);
  const selected = visible.find((subject) => subject.subjectRef === storedSelectedRef) ?? visible[0];

  function handleSelect(subjectRef: string) {
    setStoredSelectedRef(subjectRef);
    if (!isLgUp) setMobileDetailOpen(true);
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="aml-screening-status-filter" className="text-xs font-medium text-foreground">
              Screening status
            </Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger id="aml-screening-status-filter" className="h-10 w-64 max-w-full">
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
            Showing {visible.length} of {DEMO_AML_SUBJECTS.length}{" "}
            {DEMO_AML_SUBJECTS.length === 1 ? "subject" : "subjects"}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-6 py-10">
            <p className="text-sm font-medium text-foreground">No AML records match the current view.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setStatusFilter("all")}>
              Show all subjects
            </Button>
          </div>
        ) : (
          <AmlSubjectTable subjects={visible} selectedRef={isLgUp ? selected?.subjectRef : undefined} onSelect={handleSelect} />
        )}
      </div>

      <aside aria-label="Selected AML subject" className="hidden lg:block lg:border-l lg:border-border lg:pl-8">
        {selected ? (
          <AmlSubjectDetail subject={selected} showHeading />
        ) : (
          <p className="text-sm text-muted-foreground">No AML subject to display.</p>
        )}
      </aside>

      <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected ? selected.subjectRef : "AML subject"}</SheetTitle>
            <SheetDescription>
              {selected ? AML_SUBJECT_TYPE_LABELS[selected.subjectType] : "No subject selected"}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{selected && <AmlSubjectDetail subject={selected} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
