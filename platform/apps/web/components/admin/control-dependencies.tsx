import { buildControlDependencies } from "@/components/admin/admin-compliance-data";

/**
 * Approval / Control Dependencies — UI Phase 2N, primary column, `WORKSPACE PANEL`. Shows where
 * compliance-relevant workflows depend on independent approval through `IAM-02`: five real
 * approval-gated actions in the compliance modules (`CLT-01`, `WLT-01`, `KYC-01`, `AML-01`, `SEC-01`),
 * each verified at its module's `verifyDecisionToken` call site (`UI-04` §49.1).
 *
 * A pending count is shown ONLY for a workflow that has requests in the shared Maker-Checker
 * fixtures; the others read "Not represented in this preview" — never "0 pending", because "not
 * represented" is not "none". This is NOT a second Maker-Checker Queue: it lists no request, links to
 * none, and offers no action. **It says nothing about who may approve** — approval authority stays
 * backend-governed (`IAM-02`), and being on an Admin page grants none. The control is described as
 * exactly what `IAM-02` enforces on `approve` today: a different user than the requester, with no
 * segregation-of-duties conflict — not a role.
 */
export function ControlDependencies() {
  const rows = buildControlDependencies();

  return (
    <section aria-labelledby="control-dependencies-heading">
      <h2 id="control-dependencies-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Approval / Control Dependencies
      </h2>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        Compliance workflows that require independent approval through IAM-02 — a different user than the requester,
        with no segregation-of-duties conflict. This page does not grant or exercise approval authority.
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No workflows are represented in this demo view.</p>
      ) : (
        <ul className="mt-4 flex flex-col">
          {rows.map((row) => (
            <li
              key={row.workflow}
              className="flex items-baseline justify-between gap-4 border-t border-border py-3 first:border-t-0 first:pt-0"
            >
              <span className="min-w-0">
                <span className="block text-sm text-foreground">{row.workflow}</span>
                <span className="block text-xs text-muted-foreground">{row.owner}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-foreground">
                {row.pending === null ? (
                  <span className="text-muted-foreground">Not represented in this preview</span>
                ) : (
                  `${row.pending} pending`
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
