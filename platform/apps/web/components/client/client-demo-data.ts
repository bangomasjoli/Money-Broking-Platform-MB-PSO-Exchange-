/**
 * Shared client-level demo state — UI Phase 2G extraction. Centralizes the client
 * lifecycle/KYC/eligibility demo state `UI Phase 2F` (Client Overview) first established, now
 * also joined by real `CLT-01` organisation-identity/classification fields for `UI Phase 2G`
 * (Client Profile / Organisation). Both pages import from this ONE module — neither declares its
 * own copy — so Overview and Profile can never disagree about lifecycle/KYC/eligibility state,
 * per this turn's own explicit "Overview and Profile must agree" instruction. Deliberately does
 * NOT absorb `UI Phase 2E`'s `DEMO_DESTINATIONS` (WLT-specific, already correctly scoped to
 * `components/wallet-destinations/`) — this module holds only stable, CLT-owned client-level
 * state, per this turn's own "do not move page-specific WLT fixtures unless beneficial" guidance.
 *
 * Every value/type below traces to real governed backend source, verified this turn:
 *
 * - `ClientLifecycleStatus` — the exact `CLIENT_PROFILE_REACHABLE_STATUSES` tuple from
 *   `platform/services/clt1/src/lib/client-profiles.ts`.
 * - `KycCaseStatus` — the exact `KYC_CASE_STATUSES` tuple from
 *   `platform/services/kyc1/src/lib/kyc-case.ts`.
 * - `ClientClass` — the exact `CLIENT_CLASSES` tuple from
 *   `platform/services/clt1/src/routes/applications.ts`.
 * - `ApplicantType` — the exact `APPLICANT_TYPES` tuple, same file.
 * - Organisation identity fields (`legalName`/`registrationNumber`/`countryOfIncorporation`) —
 *   the exact `clt1.client_profile` columns populated at approval
 *   (`platform/services/clt1/src/routes/decisions.ts`'s own `INSERT INTO clt1.client_profile`).
 *
 * **No public client-facing projection route exists for any of this** — re-verified this turn by
 * re-scanning every backend service's registered routes (unchanged from `UI Phase 2A`/`2E`/`2F`'s
 * own findings). This is why every consumer of this module stays `B`-classified.
 */

export type ClientLifecycleStatus = "active_limited" | "suspended" | "closed";
export type KycCaseStatus = "pending_documents" | "completed" | "remediation";
export type ClientClass = "institutional" | "hnwi" | "professional" | "retail" | "unknown";
export type ApplicantType = "individual" | "corporate" | "institutional";

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

export const CLIENT_CLASS_LABELS: Record<ClientClass, string> = {
  institutional: "Institutional",
  hnwi: "HNWI",
  professional: "Professional",
  retail: "Retail",
  unknown: "Unknown",
};

export const APPLICANT_TYPE_LABELS: Record<ApplicantType, string> = {
  individual: "Individual",
  corporate: "Corporate",
  institutional: "Institutional",
};

/** Small, self-contained demo lookup — deliberately not shared with `wallet-destinations`' own
 * `countryLabel` (bank country), a different real-world concept (country of incorporation) that
 * only coincidentally could share a display format. */
const DEMO_COUNTRY_NAMES: Record<string, string> = {
  SG: "Singapore",
  MY: "Malaysia",
  HK: "Hong Kong",
};

export function countryOfIncorporationLabel(iso2: string): string {
  return DEMO_COUNTRY_NAMES[iso2] ?? iso2;
}

export interface DemoClientState {
  legalName: string;
  registrationNumber: string;
  countryOfIncorporation: string;
  applicantType: ApplicantType;
  clientClass: ClientClass;
  clientLifecycle: ClientLifecycleStatus;
  kycCaseStatus: KycCaseStatus;
  eligible: boolean;
}

/** Obviously fictitious — not a real registered entity, registration number, or jurisdiction. */
export const DEMO_CLIENT_STATE: DemoClientState = {
  legalName: "Example Institutional Holdings Ltd.",
  registrationNumber: "DEMO-2024-00123",
  countryOfIncorporation: "SG",
  applicantType: "institutional",
  clientClass: "institutional",
  clientLifecycle: "active_limited",
  kycCaseStatus: "pending_documents",
  eligible: true,
};
