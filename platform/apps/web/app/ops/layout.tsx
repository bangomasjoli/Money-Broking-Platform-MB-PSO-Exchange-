import type { Metadata } from "next";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell";
import { OPS_NAV } from "@/components/shell/nav-data";

/**
 * Staff/Operations Portal route group — UI Phase 2B shell only. See `UI-04` §8/§12 for the
 * approved B-classified information architecture and route-prefix rationale. No authentication/
 * session/authorization logic exists here yet; no internal-service data is called or shown.
 */
export const metadata: Metadata = {
  title: "AIX — Operations",
  description:
    "AIX authenticated Staff/Operations Portal shell — architecture demonstration only, no product page implemented.",
};

export default function OperationsPortalLayout({ children }: LayoutProps<"/ops">) {
  return (
    <AuthenticatedShell surface="ops" navItems={OPS_NAV}>
      {children}
    </AuthenticatedShell>
  );
}
