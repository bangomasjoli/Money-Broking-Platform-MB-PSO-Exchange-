import { buildAmlAttentionRows } from "@/components/admin/aml-monitoring-data";

/**
 * AML Attention — UI Phase 2P, the first section under the disclosure. A short list of the states AML-01
 * actually defines and that a reviewer would act on — a potential match awaiting review, a stalled or
 * failed screening request, open risk signals — each counted from the same dataset the list below renders
 * (`aml-monitoring-data.ts`), so the two cannot disagree. Not a dashboard: no KPI card, no score, no
 * severity roll-up, no percentage, no trend, and no alert count (no alert exists).
 *
 * The last row is deliberate and is the page's terminology rule made visible: **transaction monitoring is
 * not implemented in the current backend**, stated in the same list as the things that are, so its absence
 * cannot be read as "no transaction alerts". It is plain text, not styled as an error, and it does not
 * claim that the obligation is met. Wording is a governed state label or a plain factual statement —
 * never a judgement ("clear", "all clear", "safe").
 *
 * Informational only: no row has an action, and nothing here grants or exercises review authority.
 */
export function AmlAttention() {
  const rows = buildAmlAttentionRows();

  return (
    <section aria-labelledby="aml-attention-heading">
      <h2 id="aml-attention-heading" className="text-lg font-semibold tracking-tight text-foreground">
        AML Attention
      </h2>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No items are represented in this demo view.</p>
      ) : (
        <ul className="mt-4 flex flex-col">
          {rows.map((row) => (
            <li key={row.id} className="border-t border-border py-3 first:border-t-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium text-foreground">{row.area}</span>
                <span className="shrink-0 text-sm text-foreground">{row.count}</span>
              </div>
              <p className="mt-0.5 text-xs text-foreground">
                {row.status}
                {row.owner && <span className="text-muted-foreground"> · {row.owner}</span>}
              </p>
              <p className="mt-1 max-w-prose text-xs text-muted-foreground">{row.meaning}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
