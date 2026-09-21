"use client";

import { useState } from "react";
import { GovernanceLockDetail } from "@/components/admin/governance-lock-detail";
import { GovernanceLockTable } from "@/components/admin/governance-lock-table";
import {
  GOVERNANCE_LOCKS,
  LOCK_DURATION_LABELS,
  locksCountsLine,
  type LockDuration,
} from "@/components/admin/feature-config-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsLgUp } from "@/lib/use-is-lg-up";

/**
 * Governance Locks — workspace composition root. UI Phase 2T. Holds the only client state this page needs
 * (`lockFilter`, `selectedKey`, `mobileDetailOpen` — local React state only; no fetch, no server action, no mutation,
 * and no local state TRANSITION: nothing here can enable, disable, lift or change a lock) and applies the governed
 * List + Detail transformation (`UI-04` §35.16), reusing `useIsLgUp`:
 *
 * - `≥1024px` (`lg:`): persistent split — list (flexible) beside a fixed 320px `DETAIL PANEL` (single leading
 *   `border-l`, §35.17). The brief's `≥1280` persistent-panel requirement and its `1024–1279` "if safe" case resolve
 *   identically: content width is ~976px at 1024px (no sidebar) and ~976px at 1280px (240px sidebar appears), so the
 *   split is exactly as safe in one range as the other.
 * - `<1024px`: list full width; selecting a lock opens a `Sheet` with the identical detail. The `matchMedia` gate means
 *   selecting at `≥1024px` only updates the visible panel and never opens a redundant overlay on top of it.
 *
 * **One filter, and it is justified.** Thirty locks are enough to want a cut, and the registry has exactly one field
 * that varies between them and is real: whether the lock is permanent or lasts until Exchange approval (`applies_until`).
 * No topic or category filter — the registry has no such field, and a UI-invented taxonomy would present itself as
 * backend truth. **No search** — thirty governed keys in one column do not justify one, and no backend search exists.
 * The "Showing N of M" live region and a one-line count state the composition either way.
 *
 * The selected lock is derived, not stored-and-synced: if the filter hides the stored selection, the panel shows the
 * first visible lock instead — no effect-driven state repair.
 */

type LockFilter = "all" | LockDuration;

const FILTER_OPTIONS: { value: LockFilter; label: string }[] = [
  { value: "all", label: "All locks" },
  { value: "permanent", label: LOCK_DURATION_LABELS.permanent },
  { value: "until_exchange_approval", label: LOCK_DURATION_LABELS.until_exchange_approval },
];

export function GovernanceLockWorkspace() {
  const isLgUp = useIsLgUp();
  const [lockFilter, setLockFilter] = useState<LockFilter>("all");
  const [storedSelectedKey, setStoredSelectedKey] = useState<string | undefined>(GOVERNANCE_LOCKS[0]?.key);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  if (GOVERNANCE_LOCKS.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-6 py-10">
        <p className="text-sm font-medium text-foreground">No configuration records are represented in this demo view.</p>
      </div>
    );
  }

  const visible = GOVERNANCE_LOCKS.filter((lock) => lockFilter === "all" || lock.lock === lockFilter);
  const selected = visible.find((lock) => lock.key === storedSelectedKey) ?? visible[0];

  function handleSelect(key: string) {
    setStoredSelectedKey(key);
    if (!isLgUp) setMobileDetailOpen(true);
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="governance-lock-filter" className="text-xs font-medium text-foreground">
              Lock
            </Label>
            <Select value={lockFilter} onValueChange={(value) => setLockFilter(value as LockFilter)}>
              <SelectTrigger id="governance-lock-filter" className="h-10 w-64 max-w-full">
                <SelectValue>{FILTER_OPTIONS.find((option) => option.value === lockFilter)?.label}</SelectValue>
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
            Showing {visible.length} of {GOVERNANCE_LOCKS.length} {GOVERNANCE_LOCKS.length === 1 ? "lock" : "locks"}
          </p>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {locksCountsLine(GOVERNANCE_LOCKS)} · Every entry is Governance Locked
        </p>

        {visible.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-6 py-10">
            <p className="text-sm font-medium text-foreground">No governance locks match the current filter.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setLockFilter("all")}>
              Show all locks
            </Button>
          </div>
        ) : (
          <GovernanceLockTable locks={visible} selectedKey={isLgUp ? selected?.key : undefined} onSelect={handleSelect} />
        )}
      </div>

      <aside aria-label="Selected governance lock" className="hidden lg:block lg:border-l lg:border-border lg:pl-8">
        {selected ? (
          <GovernanceLockDetail lock={selected} showHeading />
        ) : (
          <p className="text-sm text-muted-foreground">No governance lock to display.</p>
        )}
      </aside>

      <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected ? selected.label : "Governance lock"}</SheetTitle>
            <SheetDescription>{selected ? selected.key : "No lock selected"}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{selected && <GovernanceLockDetail lock={selected} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
