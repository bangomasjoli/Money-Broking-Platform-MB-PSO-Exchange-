import type { ReactNode } from "react";
import { ATTENTION_ROLLUP } from "@/components/ops/ops-data";

/**
 * Work Requiring Attention — UI Phase 2I, primary column, `WORKSPACE PANEL` (`UI-04` §35.17). A
 * glanceable ROLLUP (count per queue), deliberately NOT a second copy of the itemised records —
 * `OperationalQueues` (below, same page) shows those. Counts are derived directly from the same
 * demo fixtures that section renders (`ops-data.ts`'s own `ATTENTION_ROLLUP`), so the two can
 * never disagree with each other.
 *
 * Not a KPI-card row — three plain rows, not four arbitrary metric cards; no fabricated
 * percentage, SLA countdown, or severity level (none of those exists in any governed model,
 * verified this turn).
 */
export function WorkRequiringAttention() {
  return (
    <section aria-labelledby="work-attention-heading">
      <h2 id="work-attention-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Work Requiring Attention
      </h2>

      {ATTENTION_ROLLUP.every((row) => row.count === 0) ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No operational items currently require attention.
        </p>
      ) : (
        <dl className="mt-4 flex flex-col gap-3">
          {ATTENTION_ROLLUP.map((row) => (
            <Row key={row.label} label={row.label}>
              {row.count} {row.count === 1 ? "item" : "items"}
            </Row>
          ))}
        </dl>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}
