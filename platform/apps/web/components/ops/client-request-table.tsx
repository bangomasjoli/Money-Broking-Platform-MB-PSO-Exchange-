"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RequestStatusLine } from "@/components/ops/client-request-status";
import {
  clientClassLabel,
  formatRequestDate,
  requestReference,
  type DemoClientRequest,
} from "@/components/ops/client-request-data";

/**
 * Client Requests queue — UI Phase 2J, primary region of the List + Detail workspace (`UI-04`
 * §35.16). Two deliberate presentations of the SAME rows, switched by CSS (`hidden md:block` /
 * `md:hidden` — only one is ever in the accessibility tree):
 *
 * - `≥768px` (`md:`): a real `<table>`, `COMPACT` 40px rows (`h-10`, `UI-04` §35.14's "standard
 *   lists" tier — Client Requests is named there explicitly), hairline dividers, no zebra
 *   striping, header distinguished by weight + `border-b` (§35.15). Columns are only ones backed
 *   by `client_application` (`UI-04` §45.1): Application, Organisation, Client Class, Status,
 *   Submitted, Last Updated. No SLA, priority or risk column — none exists in the model.
 * - `<768px`: a compact separated list (Organisation/Application, class, state, submitted date) —
 *   a 6-column table forced into 430px would be horizontal-scroll-only, which this turn rules out.
 *
 * **Responsive columns use a container query, not a viewport breakpoint** (`@container` on the
 * wrapper): this table's available width depends on whether the detail panel is beside it, so the
 * viewport is the wrong measure. Client Class appears once the table region is `≥48rem` (768px),
 * Last Updated `≥56rem` (896px). Worst cases, by arithmetic (not rendered — visual QA deferred):
 * the persistent split leaves ~623px at 1280px and ~624px at 1024px (sidebar 240px + padding at
 * 1280; no sidebar at 1024 — the same figure by coincidence of geometry), where the 4 base columns
 * (~600px) fit; at 768px the full-width table is 720px, still 4 base columns (~600px); Client
 * Class (+~110px) only appears once ≥768px is genuinely available.
 *
 * **Selection is keyboard-native:** the Application cell holds a real `<button>` (one tab stop per
 * row, Enter/Space via native button semantics, `aria-current` marks the open request). The
 * `<tr>` `onClick` is a mouse-only convenience that enlarges the hit area; it adds no tab stop and
 * no role, so there is no clickable non-semantic element on the keyboard/AT path. The button has
 * no `onClick` of its own — its native click event bubbles to the row handler — so selection never
 * fires twice.
 */

const CLASS_COL = "hidden @3xl:table-cell";
const UPDATED_COL = "hidden @4xl:table-cell";

export function ClientRequestTable({
  requests,
  selectedId,
  onSelect,
}: {
  requests: DemoClientRequest[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="hidden md:block @container">
        <Table aria-label="Client requests">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Application</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead className={CLASS_COL}>Client Class</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className={UPDATED_COL}>Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => {
              const isSelected = request.id === selectedId;
              return (
                <TableRow
                  key={request.id}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={() => onSelect(request.id)}
                  className="group/row h-10 cursor-pointer"
                >
                  <TableCell className="border-l-2 border-l-transparent group-data-[state=selected]/row:border-l-foreground">
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      aria-label={`Open ${requestReference(request)}`}
                      className="rounded-sm text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {request.applicationRef}
                    </button>
                  </TableCell>
                  <TableCell className="max-w-52 truncate text-foreground">{request.legalName}</TableCell>
                  <TableCell className={`${CLASS_COL} text-muted-foreground`}>
                    {clientClassLabel(request.clientClass)}
                  </TableCell>
                  <TableCell>
                    <RequestStatusLine status={request.status} size="xs" />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {request.submittedAtUtc ? formatRequestDate(request.submittedAtUtc) : "—"}
                  </TableCell>
                  <TableCell className={`${UPDATED_COL} text-muted-foreground`}>
                    {formatRequestDate(request.updatedAtUtc)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Client requests" className="flex flex-col md:hidden">
        {requests.map((request) => (
          <li key={request.id} className="border-t border-border first:border-t-0">
            <button
              type="button"
              onClick={() => onSelect(request.id)}
              className="flex w-full flex-col gap-1 rounded-sm py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">{request.legalName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {request.submittedAtUtc ? formatRequestDate(request.submittedAtUtc) : "Not submitted"}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {requestReference(request)} · {clientClassLabel(request.clientClass)}
              </span>
              <RequestStatusLine status={request.status} size="xs" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
