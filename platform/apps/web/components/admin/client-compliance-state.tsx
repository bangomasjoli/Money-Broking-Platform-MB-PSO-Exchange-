import { buildClientComplianceRows } from "@/components/admin/admin-compliance-data";

/**
 * Client Compliance — UI Phase 2N, secondary column, `DETAIL/EVIDENCE PANEL` (single leading
 * `border-l`, `UI-04` §35.17). A coarse summary of the ONE demo client, sourced from the very same
 * modules the Client Portal renders (`client-demo-data.ts`, `compliance-data.ts`), so it cannot say
 * "complete" where the Client Portal says "Pending Documents".
 *
 * Only what `KYC-01`'s and `CLT-01`'s safe projections carry: lifecycle, case type and status, whether
 * the CDD outcome has been computed, and checklist counts by governed status. **Not shown, by
 * decision:** names, addresses, dates of birth, identity documents or images, ownership percentages,
 * raw screening results, reviewer notes, and any risk rating (a governed rating exists on
 * `cdd_outcome`, but no read projection returns it). Those belong to the future Client Risk / KYC-KYB
 * page, with their own access controls.
 */
export function ClientComplianceState() {
  const rows = buildClientComplianceRows();

  return (
    <section aria-labelledby="client-compliance-heading">
      <h2 id="client-compliance-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Client Compliance
      </h2>

      <dl className="mt-4 flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0"
          >
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="text-right text-sm font-medium text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        Summary only. Identity, documents, screening detail and ownership detail are not shown here.
      </p>
    </section>
  );
}
