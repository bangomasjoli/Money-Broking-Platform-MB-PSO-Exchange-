import { PageHeader } from "@/components/shell/page-header";

/**
 * Client Portal — Overview. Shell-composition placeholder only (UI Phase 2B/2D) — verifies the
 * shell and governed page-header pattern render correctly; not the future Overview page itself
 * (`UI-04` §6/§7, still `B`-classified pending a public `CLT-01`/`KYC-01` projection route).
 */
export default function ClientOverviewPage() {
  return (
    <PageHeader
      title="Overview"
      description="This is the AIX Client Portal shell. The authenticated navigation and layout architecture exist to demonstrate shell composition only — no client data, wallet destination, profile, or KYC/KYB content is implemented yet."
    />
  );
}
