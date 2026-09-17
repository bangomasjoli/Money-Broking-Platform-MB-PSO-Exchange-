/**
 * Client Portal — Overview. Shell-composition placeholder only (UI Phase 2B) — verifies the
 * shell renders correctly; not the future Overview page itself (`UI-04` §6/§7, still `B`-
 * classified pending a public `CLT-01`/`KYC-01` projection route).
 */
export default function ClientOverviewPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        This is the AIX Client Portal shell. The authenticated navigation and layout
        architecture exist to demonstrate shell composition only — no client data, wallet
        destination, profile, or KYC/KYB content is implemented yet.
      </p>
    </div>
  );
}
