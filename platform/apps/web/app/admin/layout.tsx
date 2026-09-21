import type { Metadata } from "next";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell";
import { ADMIN_NAV } from "@/components/shell/nav-data";

/**
 * Admin/Compliance Portal route group — UI Phase 2B shell. `UI Phase 2N` added the first real page (Compliance
 * Overview, `/admin`), `2O` the second (Client Risk / KYC-KYB, `/admin/client-risk-kyc-kyb`), `2P` the third
 * (AML / Transaction Monitoring, `/admin/aml-transaction-monitoring`), `2Q` the fourth (EDD / Review,
 * `/admin/edd-review`), `2R` the fifth (Approval Queue, `/admin/approval-queue`) and `2S` the sixth (Users / Roles /
 * Permissions, `/admin/users-roles-permissions`). See `UI-04` §9/§12/§49 for the approved B-classified information
 * architecture and route-prefix rationale. No authentication/session/authorization logic exists here
 * yet; no internal-service data is called or shown.
 */
export const metadata: Metadata = {
  title: "AIX — Admin / Compliance",
  description:
    "AIX authenticated Admin/Compliance Portal — Compliance Overview, Client Risk / KYC-KYB, AML / Transaction Monitoring, EDD / Review, Approval Queue and Users / Roles / Permissions interface previews; other Admin areas are planned.",
};

export default function AdminCompliancePortalLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AuthenticatedShell surface="admin" navItems={ADMIN_NAV}>
      {children}
    </AuthenticatedShell>
  );
}
