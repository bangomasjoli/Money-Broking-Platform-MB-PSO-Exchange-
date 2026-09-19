import { KycStateLine } from "@/components/admin/client-risk-status";
import { ScreeningStateLine } from "@/components/admin/aml-status";
import { outcomeFor, outcomeLabel } from "@/components/admin/aml-monitoring-data";
import type { ReviewItem } from "@/components/admin/edd-review-data";

/**
 * Review-item state indicator — UI Phase 2Q. Deliberately NOT a new status vocabulary: it delegates to the
 * two source pages' own state lines, so a KYC item reads exactly as on `/admin/client-risk-kyc-kyb` and an
 * AML item exactly as on `/admin/aml-transaction-monitoring`. Icon + governed words, never colour alone,
 * and the icons keep their source meaning (a completed AML screening is a neutral circle whatever it
 * found; a KYC check mark appears only for a `pass`).
 *
 * There is no "review status" to show — no backend review object exists, so nothing here says a review is
 * open, in progress or closed. The state is the SOURCE module's state, and the reason column says why it
 * is listed.
 */
export function ReviewStateLine({ item }: { item: ReviewItem }) {
  if (item.kyc) {
    return <KycStateLine caseStatus={item.kyc.caseStatus} outcome={item.kyc.outcome} />;
  }
  if (!item.aml) return null;

  const outcome = outcomeFor(item.aml);
  return (
    <span className="inline-flex items-center gap-1.5">
      <ScreeningStateLine subject={item.aml} />
      {outcome && <span className="text-xs text-foreground">· {outcomeLabel(item.aml)}</span>}
    </span>
  );
}
