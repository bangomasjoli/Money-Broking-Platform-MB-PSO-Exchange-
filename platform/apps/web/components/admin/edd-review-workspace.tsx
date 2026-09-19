"use client";

import { useState } from "react";
import { ReviewAttentionDetail } from "@/components/admin/edd-review-detail";
import { ReviewAttentionTable } from "@/components/admin/edd-review-table";
import {
  REVIEW_AREA_LABELS,
  REVIEW_ITEMS,
  REVIEW_REASON_LABELS,
  areasPresent,
  type ReviewArea,
} from "@/components/admin/edd-review-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsLgUp } from "@/lib/use-is-lg-up";

/**
 * EDD / Review workspace — composition root. UI Phase 2Q. Holds the only client state this page needs
 * (`areaFilter`, `selectedKey`, `mobileDetailOpen` — local React state only; no fetch, no server action,
 * no mutation, and no local state TRANSITION: nothing here can open, assign, escalate, resolve or close
 * anything) and applies the governed List + Detail transformation (`UI-04` §35.16), reusing `useIsLgUp`:
 *
 * - `≥1024px` (`lg:`): persistent split — list (flexible) beside a fixed 320px `DETAIL PANEL` (single
 *   leading `border-l`, §35.17). The brief's `≥1280` persistent-panel requirement and its `1024–1279`
 *   "if safe" case resolve identically: content width is ~976px at 1024px (no sidebar) and ~975px at
 *   1280px (240px sidebar appears), so the split is exactly as safe in one range as the other.
 * - `<1024px`: list full width; selecting an item opens a `Sheet` with the identical detail. The
 *   `matchMedia` gate means selecting at `≥1024px` only updates the visible panel and never opens a
 *   redundant overlay on top of it.
 *
 * **One filter, justified: Review area.** It separates KYC/KYB from AML screening — two domains whose
 * states must not be read against each other. Its options are the areas that actually have an item
 * (`areasPresent`), so it never offers an empty choice. A Current-state filter was considered and left
 * out: the states are already distinct per area, a second control would let a reader combine states across
 * domains, and there is no "EDD status" to filter (none exists). **No search** — six items and no
 * free-text capability in the backend.
 *
 * **The list is not ranked**, and says so: rows are grouped by review area and there is no priority to
 * sort by (`UI-04` §52.3). The selected item is derived, not stored-and-synced: if the filter hides the
 * stored selection, the panel shows the first visible item instead — no effect-driven state repair.
 */

type AreaFilter = "all" | ReviewArea;

const FILTER_OPTIONS: { value: AreaFilter; label: string }[] = [
  { value: "all", label: "All review areas" },
  ...areasPresent().map((area) => ({ value: area as AreaFilter, label: REVIEW_AREA_LABELS[area] })),
];

export function EddReviewWorkspace() {
  const isLgUp = useIsLgUp();
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("all");
  const [storedSelectedKey, setStoredSelectedKey] = useState<string | undefined>(REVIEW_ITEMS[0]?.key);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  if (REVIEW_ITEMS.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-6 py-10">
        <p className="text-sm font-medium text-foreground">No review items are represented in this demo view.</p>
      </div>
    );
  }

  const visible = areaFilter === "all" ? REVIEW_ITEMS : REVIEW_ITEMS.filter((item) => item.area === areaFilter);
  const selected = visible.find((item) => item.key === storedSelectedKey) ?? visible[0];

  function handleSelect(key: string) {
    setStoredSelectedKey(key);
    if (!isLgUp) setMobileDetailOpen(true);
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="review-area-filter" className="text-xs font-medium text-foreground">
              Review area
            </Label>
            <Select value={areaFilter} onValueChange={(value) => setAreaFilter(value as AreaFilter)}>
              <SelectTrigger id="review-area-filter" className="h-10 w-64 max-w-full">
                <SelectValue>{FILTER_OPTIONS.find((option) => option.value === areaFilter)?.label}</SelectValue>
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
            Showing {visible.length} of {REVIEW_ITEMS.length} {REVIEW_ITEMS.length === 1 ? "item" : "items"}
          </p>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Items are grouped by review area and are not ranked by priority.</p>

        {visible.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-6 py-10">
            <p className="text-sm font-medium text-foreground">No review items match the current view.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setAreaFilter("all")}>
              Show all review items
            </Button>
          </div>
        ) : (
          <ReviewAttentionTable
            items={visible}
            selectedKey={isLgUp ? selected?.key : undefined}
            onSelect={handleSelect}
          />
        )}
      </div>

      <aside aria-label="Selected review item" className="hidden lg:block lg:border-l lg:border-border lg:pl-8">
        {selected ? (
          <ReviewAttentionDetail item={selected} showHeading />
        ) : (
          <p className="text-sm text-muted-foreground">No review item to display.</p>
        )}
      </aside>

      <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected ? selected.subjectRef : "Review item"}</SheetTitle>
            <SheetDescription>
              {selected
                ? `${REVIEW_AREA_LABELS[selected.area]} · ${REVIEW_REASON_LABELS[selected.reason]}`
                : "No item selected"}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{selected && <ReviewAttentionDetail item={selected} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
