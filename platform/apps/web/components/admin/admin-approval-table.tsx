"use client";

import { ApprovalStatusLine } from "@/components/ops/approval-request-status";
import { APPROVAL_TYPES, formatRequestDate, type DemoApprovalRequest } from "@/components/ops/approval-request-data";
import { adminApprovalReference, domainOf } from "@/components/admin/approval-oversight-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Approval register — UI Phase 2R, primary region of the List + Detail workspace (`UI-04` §35.16). Two
 * presentations of the SAME rows, switched by CSS (`hidden md:block` / `md:hidden` — only one is ever in the
 * accessibility tree):
 *
 * - `≥768px` (`md:`): a real `<table>`, `COMPACT` 40px rows (`h-10`) — the same tier as the Ops queue, whose
 *   §18/§35.14 disagreement (`UI-04` §47.9) resolved toward `COMPACT`; here `UI-04` §35.14's own "admin
 *   Approval Queue" entry says `COMPACT` too. Hairline dividers, no zebra, header by weight + `border-b`.
 *   Columns are only what `iam2.approval_request` backs: Request, Domain, Action, Status, Created, Expires.
 *   **No Approver Role, Policy, Amount, Priority or Risk column** — the approve route reads no role, no
 *   policy is seeded, and IAM-02 has no amount (`UI-04` §53.2). **No Initiator column** for the same reason
 *   as the Ops page: `maker_user_id` is opaque, so the class label earns its place in the detail.
 * - `<768px`: a compact separated list (reference; domain · action; status; created).
 *
 * **Action shows the type label; the exact governed action string is in the detail.** "Destination approval"
 * fits the split where `wlt1.destination.approve_apply` (~226px) would not, and the code is one selection away.
 *
 * **Responsive columns use a container query** (`@container` on the wrapper), because the table's width
 * depends on whether the detail panel is beside it. By arithmetic, not by rendering (visual QA is deferred):
 * the persistent split leaves ~623px at 1024px and at 1280px, where the four base columns fit (~568px
 * including cell padding: reference ~108 + domain ~76 + action ~156 + status ~228, the widest status being
 * "Blocked — Segregation of Duties"). Created (~90px) appears once the region is ≥48rem (768px) and Expires
 * (~90px) at ≥56rem (896px) — both thresholds a full-width list can actually reach (the Ops queue's Expires
 * threshold is 64rem, above any width its list can have). This is the tightest fit on the page and the first
 * thing visual QA should check.
 *
 * **Selection is keyboard-native:** the Request cell holds a real `<button>` (one tab stop per row, Enter/
 * Space natively, `aria-current` marks the open request). Its accessible name begins with the visible
 * reference (label-in-name). The `<tr>` `onClick` is a mouse-only convenience — no tab stop, no role — and the
 * button has no `onClick` of its own, so its native click bubbles to the row handler and selection never
 * fires twice.
 */

const CREATED_COL = "hidden @3xl:table-cell";
const EXPIRES_COL = "hidden @4xl:table-cell";

export function AdminApprovalTable({
  requests,
  selectedId,
  onSelect,
}: {
  requests: DemoApprovalRequest[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="hidden md:block @container">
        <Table aria-label="Approval requests">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Request</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className={CREATED_COL}>Created</TableHead>
              <TableHead className={EXPIRES_COL}>Expires</TableHead>
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
                      aria-label={adminApprovalReference(request)}
                      className="rounded-sm text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {request.ref}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{domainOf(request)}</TableCell>
                  <TableCell className="text-foreground">{APPROVAL_TYPES[request.action].label}</TableCell>
                  <TableCell>
                    <ApprovalStatusLine status={request.status} size="xs" />
                  </TableCell>
                  <TableCell className={`${CREATED_COL} text-muted-foreground`}>
                    {formatRequestDate(request.createdAtUtc)}
                  </TableCell>
                  <TableCell className={`${EXPIRES_COL} text-muted-foreground`}>
                    {formatRequestDate(request.expiresAtUtc)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Approval requests" className="flex flex-col md:hidden">
        {requests.map((request) => (
          <li key={request.id} className="border-t border-border first:border-t-0">
            <button
              type="button"
              onClick={() => onSelect(request.id)}
              className="flex w-full flex-col gap-1 rounded-sm py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{request.ref}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatRequestDate(request.createdAtUtc)}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {domainOf(request)} · {APPROVAL_TYPES[request.action].label}
              </span>
              <ApprovalStatusLine status={request.status} size="xs" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
