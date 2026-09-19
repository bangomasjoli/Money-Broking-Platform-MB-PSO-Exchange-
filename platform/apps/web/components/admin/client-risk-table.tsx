"use client";

import { KycStateLine } from "@/components/admin/client-risk-status";
import {
  checklistSummary,
  clientClassLabel,
  clientReference,
  lifecycleLabel,
  type DemoClientCompliance,
} from "@/components/admin/client-risk-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Client compliance list — UI Phase 2O, primary region of the List + Detail workspace (`UI-04`
 * §35.16). Two presentations of the SAME rows, switched by CSS (`hidden md:block` / `md:hidden` — only
 * one is ever in the accessibility tree):
 *
 * - `≥768px` (`md:`): a real `<table>`, `COMPACT` 40px rows (`h-10`), hairline dividers, no zebra, header
 *   by weight + `border-b` (§35.14/§35.15). Columns are governed concepts only: Client, Organisation,
 *   KYC / KYB, Checklist, then Lifecycle and Client Class as room allows. **There is deliberately no
 *   Risk, Screening or Score column** — no safe projection returns a rating (`UI-04` §50.1), and the page
 *   title's word "Risk" is not a reason to invent one.
 * - `<768px`: a compact separated list (organisation, reference · lifecycle, KYC/KYB state, checklist
 *   summary) — a six-column table forced into 430px would be horizontal-scroll-only.
 *
 * **The KYC / KYB cell carries the outcome for a completed case** (`kycStateLabel`), because `completed`
 * covers both `pass` and `fail`. That is why there is no separate CDD column: at the persistent-split
 * width a sixth column would not fit, and the outcome would only ever be visible when it is redundant.
 *
 * **Responsive columns use a container query** (`@container` on the wrapper), because the table's width
 * depends on whether the detail panel is beside it. By arithmetic, not by rendering (visual QA is
 * deferred): the persistent split leaves ~623px at 1024px and at 1280px (no sidebar at 1024; sidebar
 * 240px at 1280), where the four base columns fit (~580px: reference ~108 + organisation ≤160 + KYC/KYB
 * ~160 + checklist ~152). At 768px the full-width table is 720px — the same four. Lifecycle (~120px)
 * appears once the region is ≥48rem (768px) and Client Class (~110px) once ≥56rem (896px).
 *
 * **Selection is keyboard-native:** the Client cell holds a real `<button>` (one tab stop per row,
 * Enter/Space natively, `aria-current` marks the open client). Its accessible name begins with the
 * visible reference (label-in-name). The `<tr>` `onClick` is a mouse-only convenience — no tab stop, no
 * role — and the button has no `onClick` of its own, so its native click bubbles to the row handler and
 * selection never fires twice.
 */

const LIFECYCLE_COL = "hidden @3xl:table-cell";
const CLASS_COL = "hidden @4xl:table-cell";

export function ClientRiskTable({
  clients,
  selectedRef,
  onSelect,
}: {
  clients: DemoClientCompliance[];
  selectedRef: string | undefined;
  onSelect: (clientRef: string) => void;
}) {
  return (
    <>
      <div className="hidden md:block @container">
        <Table aria-label="Client compliance records">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Client</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>KYC / KYB</TableHead>
              <TableHead>Checklist</TableHead>
              <TableHead className={LIFECYCLE_COL}>Lifecycle</TableHead>
              <TableHead className={CLASS_COL}>Client Class</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => {
              const isSelected = client.clientRef === selectedRef;
              return (
                <TableRow
                  key={client.clientRef}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={() => onSelect(client.clientRef)}
                  className="group/row h-10 cursor-pointer"
                >
                  <TableCell className="border-l-2 border-l-transparent group-data-[state=selected]/row:border-l-foreground">
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      aria-label={clientReference(client)}
                      className="rounded-sm text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {client.clientRef}
                    </button>
                  </TableCell>
                  <TableCell className="max-w-36 truncate text-foreground">{client.legalName}</TableCell>
                  <TableCell>
                    <KycStateLine caseStatus={client.caseStatus} outcome={client.outcome} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{checklistSummary(client.checklist)}</TableCell>
                  <TableCell className={`${LIFECYCLE_COL} text-muted-foreground`}>
                    {lifecycleLabel(client.clientLifecycle)}
                  </TableCell>
                  <TableCell className={`${CLASS_COL} text-muted-foreground`}>
                    {clientClassLabel(client.clientClass)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Client compliance records" className="flex flex-col md:hidden">
        {clients.map((client) => (
          <li key={client.clientRef} className="border-t border-border first:border-t-0">
            <button
              type="button"
              onClick={() => onSelect(client.clientRef)}
              className="flex w-full flex-col gap-1 rounded-sm py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{client.legalName}</span>
              <span className="text-xs text-muted-foreground">
                {client.clientRef} · {lifecycleLabel(client.clientLifecycle)}
              </span>
              <KycStateLine caseStatus={client.caseStatus} outcome={client.outcome} />
              <span className="text-xs text-muted-foreground">{checklistSummary(client.checklist)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
