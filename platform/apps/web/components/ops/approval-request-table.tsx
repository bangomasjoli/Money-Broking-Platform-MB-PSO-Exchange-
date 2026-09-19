"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApprovalStatusLine } from "@/components/ops/approval-request-status";
import {
  APPROVAL_TYPES,
  approvalReference,
  formatRequestDate,
  type DemoApprovalRequest,
} from "@/components/ops/approval-request-data";

/**
 * Approval-request queue — UI Phase 2L, primary region of the List + Detail workspace (`UI-04`
 * §35.16; §13 names a maker-checker detail beside the list as the sanctioned right-panel case).
 * Same two-presentation pattern as Client Requests / Wallet Destination Review, switched by CSS so
 * only one is in the accessibility tree:
 *
 * - `≥768px` (`md:`): a real `<table>`, `COMPACT` 40px rows (`h-10`). Columns are only what
 *   `iam2.approval_request` backs: Request (type), Subject, Status, Created, Expires. No amount,
 *   priority or risk column — `IAM-02` has none. **No Initiator column**: `maker_user_id` is an
 *   opaque id, so only a demo role label exists, and with just two values it earns its space in the
 *   detail panel, not a column.
 * - `<768px`: a compact separated list (type, date, subject · module, status).
 *
 * **Density decision.** `UI-04` §18 lists Maker-Checker Queue under `COMPACT` (40px) but §35.14 under
 * `DENSE` (32px) — while §35.14 also puts the admin "Approval Queue" (same capability) under
 * `COMPACT`. The two sections disagree; resolved toward `COMPACT`: this is a decision surface with few
 * rows, not a high-volume audit list, it matches the other Ops queues, and a 32px row would shrink
 * the keyboard/touch target of the row button. To be revisited in the consolidated visual QA.
 *
 * Columns respond to a **container query** on the table region: Subject at `≥44rem` (704px),
 * Created at `≥56rem` (896px), Expires at `≥64rem` (1024px). Worst cases, by arithmetic (estimated
 * text widths; not rendered — visual QA deferred): the split leaves ~623px at 1280px/1024px, where
 * Request + Status (~440px, the widest status being "Blocked — Segregation of Duties") fit; ~783px at
 * 1440px adds Subject (~680px); 720px at 768px adds Subject too. Created/Expires only appear once
 * ≥896/1024px is genuinely available.
 *
 * **Selection is keyboard-native**, exactly as in the other Ops tables: a real `<button>` in the
 * first cell (one tab stop per row, `aria-current` marks the open request, accessible name begins
 * with the visible label); the `<tr>` `onClick` only enlarges the mouse hit area and the button has
 * no `onClick` of its own, so selection never fires twice.
 */

const SUBJECT_COL = "hidden @[44rem]:table-cell";
const CREATED_COL = "hidden @4xl:table-cell";
const EXPIRES_COL = "hidden @5xl:table-cell";

export function ApprovalRequestTable({
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
              <TableHead className={SUBJECT_COL}>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className={CREATED_COL}>Created</TableHead>
              <TableHead className={EXPIRES_COL}>Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => {
              const isSelected = request.id === selectedId;
              const type = APPROVAL_TYPES[request.action];
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
                      aria-label={`${type.label}, open ${approvalReference(request)}`}
                      className="rounded-sm text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {type.label}
                    </button>
                  </TableCell>
                  <TableCell className={`${SUBJECT_COL} text-muted-foreground`}>{request.subjectLabel}</TableCell>
                  <TableCell>
                    <ApprovalStatusLine status={request.status} />
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
        {requests.map((request) => {
          const type = APPROVAL_TYPES[request.action];
          return (
            <li key={request.id} className="border-t border-border first:border-t-0">
              <button
                type="button"
                onClick={() => onSelect(request.id)}
                className="flex w-full flex-col gap-1 rounded-sm py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{type.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRequestDate(request.createdAtUtc)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {request.subjectLabel} · {type.module}
                </span>
                <ApprovalStatusLine status={request.status} size="xs" />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
