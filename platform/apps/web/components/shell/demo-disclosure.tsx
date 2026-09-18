import type { ReactNode } from "react";
import { Info } from "lucide-react";

/**
 * Demo-data disclosure — UI Phase 2F extraction. First used inline on `UI Phase 2E`'s Wallet &
 * Payout Destinations page; now genuinely repeated on a second page (Client Overview) with the
 * identical visual TREATMENT (small `Info` icon, `text-xs` muted, `mb-6` spacing, subordinate but
 * clearly visible — never a full-page disabled look) but different wording per page's own scope.
 * Extracted per this turn's own "two pages may justify a tiny presentational shared primitive if
 * byte-identical BEHAVIOR exists" allowance — the behavior/structure is byte-identical, the text
 * is not, so `children` carries the page-specific disclosure copy rather than a fixed string.
 */
export function DemoDisclosure({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Info className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}
