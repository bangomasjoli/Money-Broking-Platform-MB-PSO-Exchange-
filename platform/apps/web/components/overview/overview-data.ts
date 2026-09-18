import { DEMO_DESTINATIONS, type PublicDestination } from "@/components/wallet-destinations/destination-data";

/**
 * Client Overview — data layer. UI Phase 2F.
 *
 * `UI Phase 2F`'s own B-classification rule: every value here either (a) reuses `UI Phase 2E`'s
 * real `DEMO_DESTINATIONS` fixture (same contract shape as the real `GET /wlt1/destinations`
 * response — `A`-backed capability, demo data), so this page can never disagree with the Wallet &
 * Payout Destinations page about how many destinations exist or what state they are in — one
 * source of truth, imported directly, not re-declared; or (b) is explicit organisation/KYC demo
 * state using REAL governed terminology verified against backend source this turn — never
 * invented words like "Healthy"/"Verified"/"Excellent"/"Compliant":
 *
 * - Client lifecycle values (`active_limited`/`suspended`/`closed`) — the exact
 *   `CLIENT_PROFILE_REACHABLE_STATUSES` tuple from
 *   `platform/services/clt1/src/lib/client-profiles.ts`.
 * - KYC/KYB case status values (`pending_documents`/`completed`/`remediation`) — the exact
 *   `KYC_CASE_STATUSES` tuple from `platform/services/kyc1/src/lib/kyc-case.ts`.
 * - "Eligibility" — the real derived concept `WLT-01` itself checks before allowing any
 *   destination registration (`platform/services/wlt1/src/lib/clt1-client.ts`'s own
 *   `checkClientStatus`), not an invented UI notion.
 *
 * **No public client-facing projection route exists for ANY of this organisation/KYC state** —
 * verified by re-scanning every backend service's registered routes this turn (confirmed
 * unchanged from `UI Phase 2A`/`2E`'s own findings: only `iam`'s `/auth/*` and `wlt1`'s 6-route
 * public contract are browser-callable; `clt1`/`kyc1`/`aml1`/`cfg1`/`iam2`/`sec1` remain entirely
 * internal). This is exactly why the page stays `B`-classified — the owning modules and their
 * real internal data models exist, but the client-facing read capability this page would need
 * does not yet exist. See `UI-04` §41's capability map and backend-gap record for the full
 * reasoning.
 */

// ---------------------------------------------------------------------------
// A. Organisation status — DEMO ONLY (no public projection exists for any of this).
// ---------------------------------------------------------------------------

export type ClientLifecycleStatus = "active_limited" | "suspended" | "closed";
export type KycCaseStatus = "pending_documents" | "completed" | "remediation";

export const CLIENT_LIFECYCLE_LABELS: Record<ClientLifecycleStatus, string> = {
  active_limited: "Active (Limited)",
  suspended: "Suspended",
  closed: "Closed",
};

export const KYC_CASE_LABELS: Record<KycCaseStatus, string> = {
  pending_documents: "Pending Documents",
  completed: "Completed",
  remediation: "Remediation Required",
};

export interface DemoOrganisationStatus {
  clientLifecycle: ClientLifecycleStatus;
  kycCaseStatus: KycCaseStatus;
  eligible: boolean;
}

export const DEMO_ORGANISATION_STATUS: DemoOrganisationStatus = {
  clientLifecycle: "active_limited",
  kycCaseStatus: "pending_documents",
  eligible: true,
};

// ---------------------------------------------------------------------------
// B. Attention items — mixed: destination-derived items are A-backed (real contract shape via
// the shared DEMO_DESTINATIONS fixture); the one organisation-level item is demo-only, using the
// SAME KYC case status already shown in section A, not a second invented KYC state.
// ---------------------------------------------------------------------------

const ATTENTION_DESTINATION_STATUSES = ["pending_screening", "pending_review", "approved_pending_cooling"] as const;

export interface AttentionItem {
  id: string;
  title: string;
  reason: string;
  kind: "destination" | "organisation";
  /** Present only for `kind: "destination"` items — links to the real destination-management page. */
  destinationId?: string;
}

export function deriveAttentionItems(destinations: PublicDestination[]): AttentionItem[] {
  const destinationItems: AttentionItem[] = destinations
    .filter((d) => (ATTENTION_DESTINATION_STATUSES as readonly string[]).includes(d.status))
    .map((d) => ({
      id: d.destination_id,
      title: d.destination_type === "wallet" ? "Wallet destination under review" : "Bank payout destination under review",
      reason:
        d.status === "pending_screening"
          ? "Screening in progress"
          : d.status === "pending_review"
            ? "Pending compliance review"
            : "Approved — in mandatory cooling-off",
      kind: "destination",
      destinationId: d.destination_id,
    }));

  const organisationItem: AttentionItem = {
    id: "demo-org-kyc",
    title: "KYC / KYB documents outstanding",
    reason: KYC_CASE_LABELS[DEMO_ORGANISATION_STATUS.kycCaseStatus],
    kind: "organisation",
  };

  return [...destinationItems, organisationItem];
}

export const DEMO_ATTENTION_ITEMS: AttentionItem[] = deriveAttentionItems(DEMO_DESTINATIONS);

// ---------------------------------------------------------------------------
// D. Platform access / capability status — exactly the 3 real Client Portal nav items
// (`components/shell/nav-data.ts`'s `CLIENT_NAV`), never a C-classified item. "Available" is used
// only for Wallet & Payout Destinations, since it is the one page with a real implementation
// behind it this turn; the other two use "Interface planned" (this turn's own suggested wording),
// never implying they are live.
// ---------------------------------------------------------------------------

export interface CapabilityStatusItem {
  label: string;
  status: "Available" | "Interface planned";
  href?: string;
}

export const CAPABILITY_STATUS_ITEMS: CapabilityStatusItem[] = [
  { label: "Wallet & Payout Destinations", status: "Available", href: "/app/wallet-destinations" },
  { label: "Profile / Organisation", status: "Interface planned" },
  { label: "KYC / KYB Compliance Status", status: "Interface planned" },
];
