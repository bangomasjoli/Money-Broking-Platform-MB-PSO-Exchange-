import Link from "next/link";
import { DEMO_ATTENTION_ITEMS } from "@/components/overview/overview-data";

/**
 * Items Requiring Attention — UI Phase 2F, `ACTION PANEL`-adjacent treatment (`UI-04` §35.17): a
 * subtle `bg-muted/40` per-row background distinguishes "needs action" content from the purely
 * passive Organisation Status display above it — one of the few places that distinction actually
 * matters visually, per §35.17's own guidance.
 *
 * Mixed provenance, per row: `destination`-kind items derive from the real `DEMO_DESTINATIONS`
 * fixture (same contract shape as `GET /wlt1/destinations` — `A`-backed) and link to the real
 * `/app/wallet-destinations` route; the one `organisation`-kind item is demo-only (no public KYC
 * projection exists) and renders as plain text, never a link to a nonexistent Profile/KYC page
 * ("inert future actions must be clearly non-live or omitted" — omitted here, not faked). No
 * invented urgency color — every row is plain text/icon-free, differentiated only by its own
 * `reason` text.
 *
 * Empty state (0 items) is a valid, calmly-presented state, not an error — handled explicitly
 * below rather than assumed unreachable.
 */
export function AttentionItems() {
  const items = DEMO_ATTENTION_ITEMS;

  return (
    <section aria-labelledby="attention-items-heading">
      <h2 id="attention-items-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Items Requiring Attention
      </h2>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No items requiring attention.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-md bg-muted/40 px-3 py-2.5">
              {item.kind === "destination" ? (
                <Link
                  href="/app/wallet-destinations"
                  className="flex flex-col gap-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                >
                  <span className="text-sm font-medium text-foreground">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.reason}</span>
                </Link>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.reason}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
