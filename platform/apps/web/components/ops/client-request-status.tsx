import { Ban, Circle, CircleCheck, CirclePause, CircleX, Inbox, Search } from "lucide-react";
import { CLIENT_APPLICATION_STATUS_LABELS, type ClientApplicationStatus } from "@/components/ops/client-request-data";

/**
 * Client-request status indicator — UI Phase 2J. Icon + the exact governed label, never color
 * alone (`UI-04` §21). Plain text+icon, not a `Badge`: in a dense queue where every row carries a
 * status, a pill per row is the "excessive pills" pattern `UI-01` §4 rejects, and no status
 * palette is approved (`UI-02` §17). `held` gets its own pause icon so it can never be mistaken
 * for `under_review` at a glance — they are distinct governed states with different next actions.
 */

const STATUS_ICON: Record<ClientApplicationStatus, typeof Circle> = {
  draft: Circle,
  submitted: Inbox,
  under_review: Search,
  held: CirclePause,
  approved: CircleCheck,
  rejected: CircleX,
  cancelled: Ban,
};

export function RequestStatusLine({
  status,
  size = "sm",
}: {
  status: ClientApplicationStatus;
  size?: "xs" | "sm";
}) {
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
      {CLIENT_APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}
