import Link from "next/link";
import { CAPABILITY_STATUS_ITEMS } from "@/components/overview/overview-data";

/**
 * Platform Access / Capability Status — UI Phase 2F, secondary column, `DETAIL/EVIDENCE PANEL`
 * treatment (single leading `border-l`, `UI-04` §35.17). Exactly the 3 real Client Portal nav
 * items (`components/shell/nav-data.ts`'s `CLIENT_NAV`) — never a `C`-classified capability
 * (Portfolio/Deposits/Withdrawals/OTC-RFQ/MB Spot Broking Terminal/Open Requests/Transactions).
 * This turn's own instruction names OMIT as the safest default for anything not already governed
 * to appear here, and that default was taken — no "teaser marketplace of future features."
 *
 * Only "Wallet & Payout Destinations" links anywhere (the one item with a real page behind it);
 * the other two render as plain, non-interactive rows with "Interface planned" — never a fake
 * link to a route that does not exist yet.
 */
export function CapabilityStatus() {
  return (
    <section aria-labelledby="capability-status-heading">
      <h2 id="capability-status-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Platform Access
      </h2>

      <ul className="mt-4 flex flex-col gap-3">
        {CAPABILITY_STATUS_ITEMS.map((item) => (
          <li
            key={item.label}
            className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0"
          >
            {item.href ? (
              <Link
                href={item.href}
                className="text-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">{item.label}</span>
            )}
            <span className="shrink-0 text-xs text-muted-foreground">{item.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
