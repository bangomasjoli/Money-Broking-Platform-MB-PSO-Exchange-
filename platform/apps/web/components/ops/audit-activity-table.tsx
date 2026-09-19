"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AuditResultLine } from "@/components/ops/audit-result-line";
import {
  auditActorLabel,
  auditEventLabel,
  auditEventModule,
  formatRequestDateTime,
  type DemoAuditEvent,
} from "@/components/ops/audit-activity-data";

/**
 * Activity list — UI Phase 2M, primary region of the List + Detail workspace (`UI-04` §35.16). The
 * same two-presentation pattern as the other Ops lists, switched by CSS so only one is in the
 * accessibility tree:
 *
 * - `≥768px` (`md:`): a real `<table>` at **`DENSE` 32px** (`h-8`). `UI-04` §18 and §35.14 agree on
 *   this page — "Audit/Activity" is named in the audit/high-volume tier — and every row is short
 *   plain text with no wrapping content, so unlike the Maker-Checker Queue there is no conflict to
 *   resolve. Cells use `py-1` (the shared `Table` default `p-2` would make a 20px line 36px tall and
 *   defeat `h-8`). Columns are what the SEC-01 normal-tier projection backs: Time, Event, Domain,
 *   Actor, Target, Result. No payload, hash, IP, token or error column — none exists in the
 *   projection, and none would be shown if it did.
 * - `<768px`: a compact separated list (event, time, target · domain, actor · result).
 *
 * Columns respond to a **container query** on the table region: Target at `≥48rem` (768px), Domain at
 * `≥56rem` (896px), Actor at `≥64rem` (1024px). Worst cases, by arithmetic (estimated text widths; not
 * rendered — visual QA deferred): the split leaves ~623px at 1280px/1024px, where Time + Event +
 * Result (~510px) fit; ~783px at 1440px adds Target (~750px); 720px at 768px stays at the three base
 * columns. Domain and Actor only appear once ≥896/1024px is genuinely available.
 *
 * **Selection is keyboard-native**, exactly as in the other Ops tables: a real `<button>` in the Event
 * cell (one tab stop per row, `aria-current` marks the open event, accessible name begins with the
 * visible label); the `<tr>` `onClick` only enlarges the mouse hit area, and the button has no
 * `onClick` of its own, so selection never fires twice. There are no per-row actions — the page is
 * read-only.
 */

const TARGET_COL = "hidden @3xl:table-cell";
const DOMAIN_COL = "hidden @4xl:table-cell";
const ACTOR_COL = "hidden @5xl:table-cell";
const CELL = "py-1";

export function AuditActivityTable({
  events,
  selectedId,
  onSelect,
}: {
  events: DemoAuditEvent[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="hidden md:block @container">
        <Table aria-label="Audit activity">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8">Time</TableHead>
              <TableHead className="h-8">Event</TableHead>
              <TableHead className={`h-8 ${DOMAIN_COL}`}>Domain</TableHead>
              <TableHead className={`h-8 ${ACTOR_COL}`}>Actor</TableHead>
              <TableHead className={`h-8 ${TARGET_COL}`}>Target</TableHead>
              <TableHead className="h-8">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => {
              const isSelected = event.id === selectedId;
              return (
                <TableRow
                  key={event.id}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={() => onSelect(event.id)}
                  className="group/row h-8 cursor-pointer"
                >
                  <TableCell className={`${CELL} text-muted-foreground border-l-2 border-l-transparent group-data-[state=selected]/row:border-l-foreground`}>
                    {formatRequestDateTime(event.occurredAtUtc)}
                  </TableCell>
                  <TableCell className={CELL}>
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      aria-label={`${auditEventLabel(event)}, open ${event.ref}`}
                      className="rounded-sm text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {auditEventLabel(event)}
                    </button>
                  </TableCell>
                  <TableCell className={`${CELL} ${DOMAIN_COL} text-muted-foreground`}>
                    {auditEventModule(event)}
                  </TableCell>
                  <TableCell className={`${CELL} ${ACTOR_COL} text-muted-foreground`}>
                    {auditActorLabel(event)}
                  </TableCell>
                  <TableCell className={`${CELL} ${TARGET_COL} text-muted-foreground`}>{event.targetLabel}</TableCell>
                  <TableCell className={CELL}>
                    <AuditResultLine result={event.result} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Audit activity" className="flex flex-col md:hidden">
        {events.map((event) => (
          <li key={event.id} className="border-t border-border first:border-t-0">
            <button
              type="button"
              onClick={() => onSelect(event.id)}
              className="flex w-full flex-col gap-1 rounded-sm py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">{auditEventLabel(event)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatRequestDateTime(event.occurredAtUtc)}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {event.targetLabel} · {auditEventModule(event)}
              </span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{auditActorLabel(event)}</span>
                <AuditResultLine result={event.result} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
