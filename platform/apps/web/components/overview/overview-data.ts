import { DEMO_DESTINATIONS, type PublicDestination } from "@/components/wallet-destinations/destination-data";
import { DEMO_CLIENT_STATE, KYC_CASE_LABELS } from "@/components/client/client-demo-data";

/**
 * Client Overview — data layer. UI Phase 2F, refactored in UI Phase 2G to source lifecycle/KYC/
 * eligibility state from the shared `components/client/client-demo-data.ts` module (extracted
 * this turn) rather than declaring its own copy — so this page and `UI Phase 2G`'s Profile /
 * Organisation page can never disagree about client lifecycle, KYC/KYB state, or eligibility.
 * `ClientLifecycleStatus`/`KycCaseStatus`/`CLIENT_LIFECYCLE_LABELS`/`DEMO_ORGANISATION_STATUS`
 * (the type this file's own `organisation-status.tsx` still imports by that name) are re-exported
 * below for backward compatibility — no consuming component needed to change its own imports.
 *
 * `UI Phase 2F`'s own B-classification rule still holds unchanged: destination-derived data
 * reuses `UI Phase 2E`'s real `DEMO_DESTINATIONS` fixture (`A`-backed capability, demo data);
 * organisation/KYC state is explicit demo state using real governed terminology — never invented
 * words like "Healthy"/"Verified"/"Excellent"/"Compliant." No public client-facing projection
 * route exists for any of it — re-verified this turn (`UI-04` §41/§42's capability maps).
 */

export type { ClientLifecycleStatus, KycCaseStatus } from "@/components/client/client-demo-data";
export { CLIENT_LIFECYCLE_LABELS, KYC_CASE_LABELS } from "@/components/client/client-demo-data";

export interface DemoOrganisationStatus {
  clientLifecycle: typeof DEMO_CLIENT_STATE.clientLifecycle;
  kycCaseStatus: typeof DEMO_CLIENT_STATE.kycCaseStatus;
  eligible: boolean;
}

/** Thin, page-shaped view over the shared `DEMO_CLIENT_STATE` — same values, not re-declared. */
export const DEMO_ORGANISATION_STATUS: DemoOrganisationStatus = {
  clientLifecycle: DEMO_CLIENT_STATE.clientLifecycle,
  kycCaseStatus: DEMO_CLIENT_STATE.kycCaseStatus,
  eligible: DEMO_CLIENT_STATE.eligible,
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

/** `UI Phase 2G`: "Profile / Organisation" moves from "Interface planned" to "Available" — its
 * page is now real (`/app/profile`). "KYC / KYB Compliance Status" remains "Interface planned" —
 * still no page this turn. */
export const CAPABILITY_STATUS_ITEMS: CapabilityStatusItem[] = [
  { label: "Wallet & Payout Destinations", status: "Available", href: "/app/wallet-destinations" },
  { label: "Profile / Organisation", status: "Available", href: "/app/profile" },
  { label: "KYC / KYB Compliance Status", status: "Interface planned" },
];
