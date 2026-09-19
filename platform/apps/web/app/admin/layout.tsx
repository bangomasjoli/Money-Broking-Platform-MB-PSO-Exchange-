import type { Metadata } from "next";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell";
import { ADMIN_NAV } from "@/components/shell/nav-data";

/**
 * Admin/Compliance Portal route group — UI Phase 2B shell; `UI Phase 2N` adds the first real page
 * (Compliance Overview, `/admin`). See `UI-04` §9/§12/§49 for the approved B-classified information
 * architecture and route-prefix rationale. No authentication/session/authorization logic exists here
 * yet; no internal-service data is called or shown.
 */
export const metadata: Metadata = {
  title: "AIX — Admin / Compliance",
  description:
    "AIX authenticated Admin/Compliance Portal — Compliance Overview interface preview; other Admin areas are planned.",
};

export default function AdminCompliancePortalLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AuthenticatedShell surface="admin" navItems={ADMIN_NAV}>
      {children}
    </AuthenticatedShell>
  );
}
