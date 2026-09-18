import { Ban, CheckCircle2, Circle, Hourglass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_CATEGORY, STATUS_LABELS, type DestinationStatus } from "@/components/wallet-destinations/destination-data";

/**
 * Shared destination-status indicator — UI Phase 2E. Used inside both `DestinationTable` (as a
 * compact `Badge`, per "Badge is appropriate for a short, scannable status token inside a dense
 * table row," `UI-04` §21) and `DestinationDetail` (as a plain text+icon row, since a detail view
 * is a narrative/single-record context, not a scannable grid — `Badge` there would re-introduce
 * the "excessive pill elements" pattern `UI-01` §4 rejects). One shared icon-selection function
 * (`STATUS_ICON`) guarantees the two presentations never drift.
 *
 * **Never color-only** (`UI-04` §21, `UI-QA-006` precedent): every status carries a distinct icon
 * AND its exact governed label text — `outline` `Badge` variant is used uniformly (no per-status
 * fill color), since no final status palette is approved (`UI-02` §17) and this turn does not
 * invent one. Differentiation comes entirely from icon shape + text, not hue.
 */

const STATUS_ICON: Record<DestinationStatus, typeof Circle> = {
  draft: Circle,
  pending_screening: Hourglass,
  pending_review: Hourglass,
  approved_pending_cooling: Hourglass,
  active: CheckCircle2,
  revoked: Ban,
};

export function DestinationStatusBadge({ status }: { status: DestinationStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge variant="outline" className="gap-1 text-xs font-medium">
      <Icon className="size-3" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function DestinationStatusLine({ status }: { status: DestinationStatus }) {
  const Icon = STATUS_ICON[status];
  const category = STATUS_CATEGORY[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
      data-status-category={category}
    >
      <Icon className="size-4" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
