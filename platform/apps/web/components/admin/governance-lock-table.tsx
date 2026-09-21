"use client";

import { Lock } from "lucide-react";
import { LOCK_DURATION_LABELS, type GovernanceLock } from "@/components/admin/feature-config-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Governance-lock register — UI Phase 2T, primary region of the List + Detail workspace (`UI-04` §35.16). Two
 * presentations of the SAME rows, switched by CSS (`hidden md:block` / `md:hidden` — only one is ever in the
 * accessibility tree):
 *
 * - `≥768px` (`md:`): a real `<table>`, `COMPACT` 40px rows (`h-10`). Columns are only what varies between locks:
 *   Feature (the human-readable name — the exact key is in the detail), **Governance lock** (permanent, or until
 *   Exchange approval — the registry's real `applies_until`), and Reference (the governing Doc 00 section and Master
 *   System Rule). **There is no State column and no Source column, because both are identical on every row** — every
 *   entry is Governance Locked and every source is the sealed registry — and a column of 30 identical cells is noise.
 *   The state is carried by the column header, a lock icon on every row, the count line above the list, and the
 *   detail's own State section, so it is never colour-only. There is no Changed By, Last Approved By or Risk column:
 *   none is real or safe.
 * - `<768px`: a compact separated list (name; "Governance Locked · duration").
 *
 * **Selection is keyboard-native:** the Feature cell holds a real `<button>` (one tab stop per row, Enter/Space
 * natively, `aria-current` marks the open lock). Its accessible name begins with the visible label (label-in-name).
 * The `<tr>` `onClick` is a mouse-only convenience — no tab stop, no role — and the button has no `onClick` of its own,
 * so its native click bubbles to the row handler and selection never fires twice.
 *
 * **Reference appears from a container width of 56rem (896px)** — the persistent split leaves the list ~623px, so it
 * shows only in a full-width list. By arithmetic, not rendering: Feature ~230px (the longest name, "AIX market depth as an
 * exchange", ~215px) plus Governance lock ~200px ("Until Exchange approval" with its icon) fits ~623px with room, and
 * Reference (~190px) is what would not. The reference is always in the detail. Estimates, not measurements — the first
 * thing visual QA should check.
 */

const REFERENCE_COL = "hidden @4xl:table-cell";

export function GovernanceLockTable({
  locks,
  selectedKey,
  onSelect,
}: {
  locks: GovernanceLock[];
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
}) {
  return (
    <>
      <div className="hidden md:block @container">
        <Table aria-label="Governance-locked features">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Feature</TableHead>
              <TableHead>Governance lock</TableHead>
              <TableHead className={REFERENCE_COL}>Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locks.map((lock) => {
              const isSelected = lock.key === selectedKey;
              return (
                <TableRow
                  key={lock.key}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={() => onSelect(lock.key)}
                  className="group/row h-10 cursor-pointer"
                >
                  <TableCell className="border-l-2 border-l-transparent group-data-[state=selected]/row:border-l-foreground">
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      aria-label={`${lock.label}, Governance Locked, ${LOCK_DURATION_LABELS[lock.lock]}`}
                      className="rounded-sm text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {lock.label}
                    </button>
                  </TableCell>
                  <TableCell className="text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {LOCK_DURATION_LABELS[lock.lock]}
                    </span>
                  </TableCell>
                  <TableCell className={`${REFERENCE_COL} text-muted-foreground`}>{lock.reference}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Governance-locked features" className="flex flex-col md:hidden">
        {locks.map((lock) => (
          <li key={lock.key} className="border-t border-border first:border-t-0">
            <button
              type="button"
              onClick={() => onSelect(lock.key)}
              className="flex w-full flex-col gap-1 rounded-sm py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="text-sm font-medium text-foreground">{lock.label}</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                Governance Locked · {LOCK_DURATION_LABELS[lock.lock]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
