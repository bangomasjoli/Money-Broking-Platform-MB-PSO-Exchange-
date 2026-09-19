import type { NavIconName } from "@/components/shell/nav-icons";

/**
 * Shared authenticated-shell surface/navigation data — UI Phase 2B.
 *
 * Single source of truth consumed by both `AuthenticatedSidebar` (desktop) and
 * `AuthenticatedMobileNav` (Sheet drawer) so the two never carry hand-duplicated nav lists
 * (`UI-04` §13's "shared shell mechanics, surface-specific navigation data" requirement).
 *
 * Every label below is taken verbatim from `UI-04`'s own approved A/B-classified initial IA
 * (§6/§8/§9) — not renamed for layout convenience. C-classified future pages (Portfolio,
 * Deposits, Withdrawals, OTC/RFQ, MB Spot Broking Terminal, Open Requests, Transactions,
 * Deposit/Withdrawal/Broking-RFQ Operations, Settlement, Reconciliation, Exceptions/Breaks,
 * Reporting, Incidents/Exceptions) are intentionally absent — they must not appear as live
 * primary nav per this turn's brief.
 *
 * `href` is present ONLY for the one item per surface whose page actually exists this turn
 * (`Overview` / `Operational Overview` / `Compliance Overview` — each surface's own root
 * placeholder index page, per this turn's explicit "shell-level placeholder/index pages only"
 * scope). Every other item is real, approved IA (A/B-classified per `UI-04`) but has no page
 * yet — rendering it as a live link would either 404 or misrepresent an unimplemented page as
 * live, both explicitly prohibited this turn. `NavList` renders `href`-less items as inert,
 * muted, non-interactive rows instead of hiding them — the surface's approved structure stays
 * visible (this is NOT a C-classified item being suppressed), while nothing false is clickable.
 *
 * `icon` is a string `NavIconName`, not a component reference — this module is imported by
 * Server Component route layouts, and a function value cannot cross into the client-rendered
 * shell subtree as a prop (see `nav-icons.tsx`'s own doc comment for the full reasoning).
 */

export interface NavItem {
  label: string;
  /** Present only when this item's destination page exists this turn. */
  href?: string;
  icon: NavIconName;
}

export type Surface = "client" | "ops" | "admin";

export const SURFACES: Record<Surface, { label: string; rootHref: string }> = {
  client: { label: "Client Portal", rootHref: "/app" },
  ops: { label: "Operations", rootHref: "/ops" },
  admin: { label: "Admin / Compliance", rootHref: "/admin" },
};

/**
 * `UI-04` §6 — Client Portal initial A/B-classified IA.
 *
 * `UI Phase 2E`: "Wallet & Payout Destinations" gains a real `href` — the first nav item to
 * transition from inert to live, since it is the one `A`-classified page with a real backing
 * client-facing route (`GET /wlt1/destinations` et al. — see `UI-04` §37's capability map).
 * Label preserved exactly — not renamed to "Wallets"/"Address Book"/anything shorter.
 *
 * `UI Phase 2G`: "Profile / Organisation" gains a real `href` (`/app/profile`) — `B`-classified
 * (real `CLT-01` fields, no public projection route), same posture as `UI Phase 2F`'s Overview.
 * Label preserved exactly.
 *
 * `UI Phase 2H`: "KYC / KYB Compliance Status" gains a real `href` (`/app/compliance-status`) —
 * `B`-classified (real `KYC-01` case/checklist model, no public projection route). Every Client
 * Portal nav item is now live — no inert item remains on this surface. Label preserved exactly.
 */
export const CLIENT_NAV: NavItem[] = [
  { label: "Overview", href: "/app", icon: "home" },
  { label: "Wallet & Payout Destinations", href: "/app/wallet-destinations", icon: "wallet" },
  { label: "Profile / Organisation", href: "/app/profile", icon: "building-2" },
  { label: "KYC / KYB Compliance Status", href: "/app/compliance-status", icon: "shield-check" },
];

/**
 * `UI-04` §8 — Staff/Operations Portal B-classified IA.
 *
 * `UI Phase 2J`: "Client Requests" gains a real `href` (`/ops/client-requests`) — `B`-classified
 * (real `CLT-01` application/decision model, every route `requireInternal`-guarded). The other
 * three inert rows are unchanged. Label preserved exactly.
 *
 * `UI Phase 2K`: "Wallet Destination Review" gains a real `href` (`/ops/wallet-destination-review`) —
 * `B`-classified (real `WLT-01` destination lifecycle, every internal route `requireInternal`-
 * guarded). "Maker-Checker Queue" and "Audit / Activity" remain inert. Label preserved exactly.
 *
 * `UI Phase 2L`: "Maker-Checker Queue" gains a real `href` (`/ops/maker-checker-queue` — the route is
 * the label's slug, the convention `client-requests`/`wallet-destination-review` already set) —
 * `B`-classified (real `IAM-02` approval model, every route `requireInternal`-guarded). Only
 * "Audit / Activity" remains inert. Label preserved exactly.
 *
 * `UI Phase 2M`: "Audit / Activity" gains a real `href` (`/ops/audit-activity`) — `B`-classified (real
 * `SEC-01` audit search/read, internal-token + IAM-02-permission gated). **Every initial Staff/
 * Operations nav item is now live** — no inert row remains on this surface. Label preserved exactly.
 */
export const OPS_NAV: NavItem[] = [
  { label: "Operational Overview", href: "/ops", icon: "layout-grid" },
  { label: "Client Requests", href: "/ops/client-requests", icon: "inbox" },
  { label: "Wallet Destination Review", href: "/ops/wallet-destination-review", icon: "wallet" },
  { label: "Maker-Checker Queue", href: "/ops/maker-checker-queue", icon: "list-checks" },
  { label: "Audit / Activity", href: "/ops/audit-activity", icon: "history" },
];

/**
 * `UI-04` §9 — Admin/Compliance Portal B-classified IA.
 *
 * `UI Phase 2N`: "Compliance Overview" (`/admin`) is the only real Admin page — it has had an `href`
 * since `UI Phase 2B`, so no nav change is needed. Every other row stays inert and must not gain an
 * `href` until its page exists: visible navigation is not a permission grant, and hidden navigation is
 * not a security control (`UI-04` §10). `C`-classified Reporting and Incidents / Exceptions are absent.
 *
 * `UI Phase 2O`: "Client Risk / KYC-KYB" gains a real `href` (`/admin/client-risk-kyc-kyb` — the label's
 * slug, the convention the Ops routes set) — `B`-classified (real `KYC-01`/`CLT-01` case, outcome and
 * lifecycle models, every route `requireInternal`-guarded, no cross-client read). The six remaining
 * rows stay inert. Label preserved exactly.
 */
export const ADMIN_NAV: NavItem[] = [
  { label: "Compliance Overview", href: "/admin", icon: "layout-grid" },
  { label: "Client Risk / KYC-KYB", href: "/admin/client-risk-kyc-kyb", icon: "shield-alert" },
  { label: "AML / Transaction Monitoring", icon: "activity" },
  { label: "EDD / Review", icon: "search-check" },
  { label: "Approval Queue", icon: "list-checks" },
  { label: "Users / Roles / Permissions", icon: "users" },
  { label: "Feature Flags / Configuration", icon: "sliders-horizontal" },
  { label: "Audit / Sensitive Access", icon: "history" },
];

export function getActiveLabel(navItems: NavItem[], pathname: string): string | undefined {
  return navItems.find((item) => item.href === pathname)?.label;
}
