import { buildAttentionRows } from "@/components/admin/admin-compliance-data";

/**
 * Compliance Attention — UI Phase 2N, primary column, `WORKSPACE PANEL` (`UI-04` §35.17). A short
 * list of the compliance areas that have a REAL governed state and a consistent demo source
 * (`admin-compliance-data.ts`, `UI-04` §49.1) — not a dashboard: no KPI cards, no score, no severity
 * level, no percentage, no trend. Counts are understated list metadata beside each area, derived from
 * the same fixtures the Client Portal and the Ops pages render, so they cannot disagree with them.
 *
 * Each row states: the area, its owning module, a governed state label (or a plain factual statement
 * — never a judgement like "healthy" or "compliant"), a count, and what the count means. The last row
 * is deliberate: AML screening and EDD have real concepts but no admin-safe projection, so the page
 * SAYS they are not represented rather than letting their absence read as "all clear".
 *
 * Rows are wrapped text, not fixed 40px lines: each is ≥40px (`COMPACT`) with a second and third line
 * of muted explanation. State is text, never colour. The page is informational — no row has an action,
 * and nothing here grants or exercises review or approval authority.
 */
export function ComplianceAttention() {
  const rows = buildAttentionRows();

  return (
    <section aria-labelledby="compliance-attention-heading">
      <h2 id="compliance-attention-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Compliance Attention
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
                {row.status} <span className="text-muted-foreground">· {row.owner}</span>
              </p>
              <p className="mt-1 max-w-prose text-xs text-muted-foreground">{row.meaning}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
