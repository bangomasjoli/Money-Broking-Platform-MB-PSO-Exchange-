"use client";

import { ReviewStateLine } from "@/components/admin/edd-review-state";
import {
  REVIEW_AREA_LABELS,
  REVIEW_REASON_LABELS,
  reviewItemReference,
  type ReviewItem,
} from "@/components/admin/edd-review-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Review-attention list — UI Phase 2Q, primary region of the List + Detail workspace (`UI-04` §35.16). Two
 * presentations of the SAME rows, switched by CSS (`hidden md:block` / `md:hidden` — only one is ever in
 * the accessibility tree):
 *
 * - `≥768px` (`md:`): a real `<table>`, `COMPACT` 40px rows (`h-10`), hairline dividers, no zebra, header
 *   by weight + `border-b` (§35.14/§35.15). Columns: Subject, Review Area, Reason, then State and Source as
 *   room allows. **There is no EDD Status, Case Owner, Priority, Risk Score, SLA, Due Date or Updated
 *   column** — none exists (`UI-04` §52.1), and "Updated" would mean a screening date for AML but nothing
 *   at all for KYC, whose shared data carries no timestamp.
 * - `<768px`: a compact separated list (reference; area and reason; state) — a five-column table forced
 *   into 430px would be horizontal-scroll-only.
 *
 * **Reason is in the base columns and State is not, on purpose.** Reason is derived from State, so they
 * overlap heavily ("Pending required information" / "Pending Documents"); at the persistent-split width
 * there is room for only one, and the reason says why the row is listed. State appears once the region
 * allows, and is always in the detail. Reasons are projection labels, not backend states — the state
 * column is where the exact governed wording lives.
 *
 * **Responsive columns use a container query** (`@container` on the wrapper), because the table's width
 * depends on whether the detail panel is beside it. By arithmetic, not by rendering (visual QA is
 * deferred): the persistent split leaves ~623px at 1024px and at 1280px (no sidebar at 1024; 240px at
 * 1280), where the three base columns fit (~448px including cell padding: reference ~108 + area ~107 +
 * reason ≤233, the widest being "Potential match awaiting review" at ~31 characters). State (~203px) appears
 * once the region is ≥48rem (768px) — ~651px in all — and Source (~70px) at ≥56rem (896px). The widest reason
 * is the cell to check first in visual QA; the split has ~175px to spare, so a longer label would still fit.
 *
 * **Selection is keyboard-native:** the Subject cell holds a real `<button>` (one tab stop per row,
 * Enter/Space natively, `aria-current` marks the open item). Its accessible name begins with the visible
 * reference (label-in-name). The `<tr>` `onClick` is a mouse-only convenience — no tab stop, no role — and
 * the button has no `onClick` of its own, so its native click bubbles to the row handler and selection
 * never fires twice.
 */

const STATE_COL = "hidden @3xl:table-cell";
const SOURCE_COL = "hidden @4xl:table-cell";

export function ReviewAttentionTable({
  items,
  selectedKey,
  onSelect,
}: {
  items: ReviewItem[];
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
}) {
  return (
    <>
      <div className="hidden md:block @container">
        <Table aria-label="Review attention items">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Subject</TableHead>
              <TableHead>Review Area</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className={STATE_COL}>State</TableHead>
              <TableHead className={SOURCE_COL}>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const isSelected = item.key === selectedKey;
              return (
                <TableRow
                  key={item.key}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={() => onSelect(item.key)}
                  className="group/row h-10 cursor-pointer"
                >
                  <TableCell className="border-l-2 border-l-transparent group-data-[state=selected]/row:border-l-foreground">
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      aria-label={reviewItemReference(item)}
                      className="rounded-sm text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {item.subjectRef}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{REVIEW_AREA_LABELS[item.area]}</TableCell>
                  <TableCell className="text-foreground">{REVIEW_REASON_LABELS[item.reason]}</TableCell>
                  <TableCell className={STATE_COL}>
                    <ReviewStateLine item={item} />
                  </TableCell>
                  <TableCell className={`${SOURCE_COL} text-muted-foreground`}>{item.sourceModule}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Review attention items" className="flex flex-col md:hidden">
        {items.map((item) => (
          <li key={item.key} className="border-t border-border first:border-t-0">
            <button
              type="button"
              onClick={() => onSelect(item.key)}
              className="flex w-full flex-col gap-1 rounded-sm py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="text-sm font-medium text-foreground">{item.subjectRef}</span>
              <span className="text-xs text-muted-foreground">
                {REVIEW_AREA_LABELS[item.area]} · {REVIEW_REASON_LABELS[item.reason]}
              </span>
              <ReviewStateLine item={item} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
