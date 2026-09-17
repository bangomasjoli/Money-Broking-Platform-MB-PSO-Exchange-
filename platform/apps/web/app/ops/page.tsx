/**
 * Staff/Operations Portal — Operational Overview. Shell-composition placeholder only
 * (UI Phase 2B) — not the future Operational Overview page itself (`UI-04` §8, `B`-classified,
 * no unified aggregation route exists yet).
 */
export default function OperationalOverviewPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Operational Overview
      </h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        This is the AIX Staff/Operations Portal shell. The authenticated navigation and layout
        architecture exist to demonstrate shell composition only — no queue, review, or approval
        content is implemented yet.
      </p>
    </div>
  );
}
