import type { Metadata } from "next";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell";
import { CLIENT_NAV } from "@/components/shell/nav-data";

/**
 * Client Portal route group — UI Phase 2B shell only. See `docs/04_ui/
 * AIX_AUTHENTICATED_PLATFORM_UI_ARCHITECTURE_v0.1.md` (`UI-04`) §6/§12 for the approved
 * information architecture and route-prefix rationale. No authentication/session/authorization
 * logic exists here — this route is reachable by anyone until real auth is implemented in a
 * later, separate turn; it presents no real client data.
 */
export const metadata: Metadata = {
  title: "AIX — Client Portal",
  description:
    "AIX authenticated Client Portal shell — architecture demonstration only, no product page implemented.",
};

export default function ClientPortalLayout({ children }: LayoutProps<"/app">) {
  return (
    <AuthenticatedShell surface="client" navItems={CLIENT_NAV}>
      {children}
    </AuthenticatedShell>
  );
}
