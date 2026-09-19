import { CircleCheck, CircleX, Clock, Hourglass, ShieldAlert } from "lucide-react";
import { APPROVAL_STATUS_LABELS, type ApprovalStatus } from "@/components/ops/approval-request-data";

/**
 * Approval-request status indicator — UI Phase 2L. Icon + the exact governed label, never colour
 * alone (`UI-04` §21). Plain text + icon rather than a `Badge`: in a queue where every row carries a
 * status a pill per row is the "excessive pills" pattern `UI-01` §4 rejects, and §21 prefers plain
 * text in a maker-checker context. `blocked` gets its own shield icon precisely so it is never read
 * as `rejected` — they are different states (a segregation-of-duties conflict vs. a checker's
 * decision). `pending` uses an hourglass: it means "waiting on someone else's action" (`UI-04`
 * §21), not a generic in-progress.
 */

const STATUS_ICON: Record<ApprovalStatus, typeof Clock> = {
  pending: Hourglass,
  approved: CircleCheck,
  rejected: CircleX,
  expired: Clock,
  blocked: ShieldAlert,
};

export function ApprovalStatusLine({ status, size = "sm" }: { status: ApprovalStatus; size?: "xs" | "sm" }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={
        size === "xs"
          ? "inline-flex items-center gap-1.5 text-xs text-foreground"
          : "inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
      }
    >
      <Icon className={size === "xs" ? "size-3.5 shrink-0" : "size-4 shrink-0"} aria-hidden="true" />
      {APPROVAL_STATUS_LABELS[status]}
    </span>
  );
}
