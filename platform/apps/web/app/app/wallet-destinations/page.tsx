import { Info } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { AddDestinationDialog } from "@/components/wallet-destinations/add-destination-dialog";
import { WalletDestinationsWorkspace } from "@/components/wallet-destinations/wallet-destinations-workspace";

/**
 * Client Portal — Wallet & Payout Destinations. UI Phase 2E — the first `A`-classified
 * authenticated client page (`UI-04` §6/§7), implemented as UI-first / backend-deferred
 * (`UI-04` §35's Phase 2E scope): no `fetch`, no server action, no session/auth logic anywhere
 * on this route — `DEMO_DESTINATIONS` (`components/wallet-destinations/destination-data.ts`) is
 * static, local, fictitious fixture data, never live client records.
 *
 * Governed label preserved exactly — "Wallet & Payout Destinations," not shortened to "Wallets,"
 * "Address Book," "Beneficiaries," "Crypto Addresses," or "Withdrawal Addresses" anywhere on this
 * page, matching the primary-nav label (`components/shell/nav-data.ts`).
 *
 * "Add Destination" is the page's one primary action (`UI-04` §17's "at most one"), justified
 * because the governed public contract actually supports registration
 * (`POST /wlt1/wallet-destinations`, `POST /wlt1/payout-destinations` — verified this turn, not
 * assumed) — see `add-destination-dialog.tsx` for the exact field-to-schema mapping.
 *
 * Visual QA for this page is explicitly DEFERRED, per this turn's own program decision — full
 * rendered visual review happens after the authenticated UI build-out completes, not per page.
 */
export default function WalletDestinationsPage() {
  return (
    <div>
      <PageHeader
        title="Wallet & Payout Destinations"
        description="Manage governed payout destinations and review their approval status."
        action={<AddDestinationDialog />}
      />

      <p role="note" className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5" aria-hidden="true" />
        Interface preview — demo data. No live client records are shown; backend integration is
        separate, later work.
      </p>

      <WalletDestinationsWorkspace />
    </div>
  );
}
