"use client";

import { ScreeningStateLine } from "@/components/admin/aml-status";
import {
  AML_SUBJECT_TYPE_LABELS,
  lastScreeningDate,
  outcomeLabel,
  signalSummary,
  subjectReference,
  type DemoAmlSubject,
} from "@/components/admin/aml-monitoring-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * AML subject list — UI Phase 2P, primary region of the List + Detail workspace (`UI-04` §35.16). Two
 * presentations of the SAME rows, switched by CSS (`hidden md:block` / `md:hidden` — only one is ever in
 * the accessibility tree):
 *
 * - `≥768px` (`md:`): a real `<table>`, `COMPACT` 40px rows (`h-10`), hairline dividers, no zebra, header
 *   by weight + `border-b` (§35.14/§35.15). Columns are AML-01 concepts only: Subject, Type, Screening,
 *   Outcome, Signals, and Last Screening when there is room. **There is deliberately no Transaction,
 *   Alert, Amount, Risk Score or STR column** — none of those exists (`UI-04` §51.1) — and no
 *   organisation or client column, because AML-01's safe reads return neither (subjects are applications
 *   and authorised parties, referenced by an opaque `subject_ref`).
 * - `<768px`: a compact separated list (reference and type; screening state; outcome and signals) — a
 *   six-column table forced into 430px would be horizontal-scroll-only.
 *
 * **Outcome is its own column, in words**, because a completed screening says nothing about what it
 * found: `Completed` next to `Potential match` is the case the icon in `ScreeningStateLine` refuses to
 * gloss over. "No result" (requested/failed) is stated, never left blank or implied clear.
 *
 * **Responsive columns use a container query** (`@container` on the wrapper), because the table's width
 * depends on whether the detail panel is beside it. By arithmetic, not by rendering (visual QA is
 * deferred): the persistent split leaves ~623px at 1024px and at 1280px (no sidebar at 1024; 240px at
 * 1280), where the five base columns fit (~570px including cell padding: reference ~108 + type ~128 +
 * screening ~154 + outcome ~110 + signals ~71). Last Screening (~90px) appears once the region is ≥48rem
 * (768px) — i.e. only in the full-width layout. This is the tightest fit on the page and the first thing
 * visual QA should check.
 *
 * **Selection is keyboard-native:** the Subject cell holds a real `<button>` (one tab stop per row,
 * Enter/Space natively, `aria-current` marks the open subject). Its accessible name begins with the
 * visible reference (label-in-name). The `<tr>` `onClick` is a mouse-only convenience — no tab stop, no
 * role — and the button has no `onClick` of its own, so its native click bubbles to the row handler and
 * selection never fires twice.
 */

const LAST_SCREENING_COL = "hidden @3xl:table-cell";

export function AmlSubjectTable({
  subjects,
  selectedRef,
  onSelect,
}: {
  subjects: DemoAmlSubject[];
  selectedRef: string | undefined;
  onSelect: (subjectRef: string) => void;
}) {
  return (
    <>
      <div className="hidden md:block @container">
        <Table aria-label="AML screening subjects">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Subject</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Screening</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Signals</TableHead>
              <TableHead className={LAST_SCREENING_COL}>Last Screening</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subjects.map((subject) => {
              const isSelected = subject.subjectRef === selectedRef;
              return (
                <TableRow
                  key={subject.subjectRef}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={() => onSelect(subject.subjectRef)}
                  className="group/row h-10 cursor-pointer"
                >
                  <TableCell className="border-l-2 border-l-transparent group-data-[state=selected]/row:border-l-foreground">
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      aria-label={subjectReference(subject)}
                      className="rounded-sm text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {subject.subjectRef}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{AML_SUBJECT_TYPE_LABELS[subject.subjectType]}</TableCell>
                  <TableCell>
                    <ScreeningStateLine subject={subject} />
                  </TableCell>
                  <TableCell className="text-foreground">{outcomeLabel(subject)}</TableCell>
                  <TableCell className="text-muted-foreground">{signalSummary(subject)}</TableCell>
                  <TableCell className={`${LAST_SCREENING_COL} text-muted-foreground`}>
                    {lastScreeningDate(subject)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="AML screening subjects" className="flex flex-col md:hidden">
        {subjects.map((subject) => (
          <li key={subject.subjectRef} className="border-t border-border first:border-t-0">
            <button
              type="button"
              onClick={() => onSelect(subject.subjectRef)}
              className="flex w-full flex-col gap-1 rounded-sm py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="text-sm font-medium text-foreground">{subject.subjectRef}</span>
              <span className="text-xs text-muted-foreground">{AML_SUBJECT_TYPE_LABELS[subject.subjectType]}</span>
              <ScreeningStateLine subject={subject} />
              <span className="text-xs text-muted-foreground">
                Outcome: {outcomeLabel(subject)} · Signals: {signalSummary(subject)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
