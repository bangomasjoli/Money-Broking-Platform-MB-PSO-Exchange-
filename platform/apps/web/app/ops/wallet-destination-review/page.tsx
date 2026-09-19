import { DestinationReviewWorkspace } from "@/components/ops/destination-review-workspace";
import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Staff/Operations Portal — Wallet Destination Review. UI Phase 2K. `B`-classified (`UI-04` §8/§46):
 * `WLT-01` genuinely owns the destination lifecycle, approval and revocation model, but every
 * internal route is `requireInternal`-guarded, no list route exists at any layer, and the safe
 * internal responses omit the review evidence (cooling end, screening, proof of control) — nothing
 * here is callable from a staff browser session today. Hence the demo disclosure and no fetch,
 * server action, auth or mutation of any kind.
 *
 * Covers BOTH destination categories WLT-01 reviews — wallet and fiat payout — through the same
 * approve/revoke routes; the nav label "Wallet Destination Review" is `UI-04` §8's governed IA name
 * and is preserved, while the description names both. A LIST / DETAIL WORKSPACE (`UI-04` §35.16);
 * all behavior lives in `DestinationReviewWorkspace`. Not a dashboard: no cards, KPIs, balances or
 * settlement data — WLT-01 owns none.
 */
export default function WalletDestinationReviewPage() {
  return (
    <div>
      <PageHeader
        title="Wallet Destination Review"
        description="Review governed wallet and payout destination requests and their current control state."
      />
      <DemoDisclosure>
        Interface preview — wallet destination review records are demonstrative until the staff-facing WLT review routes
        are integrated.
      </DemoDisclosure>
      <DestinationReviewWorkspace />
    </div>
  );
}
