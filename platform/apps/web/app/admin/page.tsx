/**
 * Admin/Compliance Portal — Compliance Overview. Shell-composition placeholder only
 * (UI Phase 2B) — not the future Compliance Overview page itself (`UI-04` §9, `B`-classified,
 * no unified aggregation route exists yet).
 */
export default function ComplianceOverviewPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Compliance Overview
      </h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        This is the AIX Admin/Compliance Portal shell. The authenticated navigation and layout
        architecture exist to demonstrate shell composition only — no risk, AML, approval, or
        configuration content is implemented yet.
      </p>
    </div>
  );
}
