import { PageHeader } from "@/components/shell/page-header";

/**
 * Admin/Compliance Portal — Compliance Overview. Shell-composition placeholder only
 * (UI Phase 2B/2D) — not the future Compliance Overview page itself (`UI-04` §9, `B`-classified,
 * no unified aggregation route exists yet).
 */
export default function ComplianceOverviewPage() {
  return (
    <PageHeader
      title="Compliance Overview"
      description="This is the AIX Admin/Compliance Portal shell. The authenticated navigation and layout architecture exist to demonstrate shell composition only — no risk, AML, approval, or configuration content is implemented yet."
    />
  );
}
