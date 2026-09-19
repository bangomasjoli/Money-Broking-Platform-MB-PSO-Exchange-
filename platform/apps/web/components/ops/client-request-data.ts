import {
  APPLICANT_TYPE_LABELS,
  CLIENT_CLASS_LABELS,
  type ApplicantType,
  type ClientClass,
} from "@/components/client/client-demo-data";

/**
 * Staff/Operations — Client Requests. Shared data layer. UI Phase 2J.
 *
 * ONE source of truth for the `CLT-01` client-application demo records, imported by BOTH Ops
 * pages that show them (`/ops` Operational Overview and `/ops/client-requests`), so the two can
 * never disagree about request counts or states — this turn's own explicit cross-page
 * consistency requirement. Extracted from `UI Phase 2I`'s `ops-data.ts` (where the status enum,
 * label map and 2 demo rows previously lived) now that a second Ops page genuinely needs them.
 *
 * Every enum/field below traces to real `CLT-01` source, verified this turn (full capability map:
 * `UI-04` §45.1). Every route that reads or acts on these records is `requireInternal`-guarded —
 * none is callable from a staff browser session today:
 *
 * - `ClientApplicationStatus` — the 7 statuses `platform/services/clt1/src/lib/applications.ts`'s
 *   `ALLOWED_STATUSES_FOR_ACTION` transition table can actually reach or act on. The DB CHECK
 *   constraint (`infra/migrations/020_clt1_intake_baseline.cjs`) carries 3 more —
 *   `duplicate_review`, `pending_kyc`, `pending_aml` — that NO code path in `services/clt1/src`
 *   ever writes (verified by search; the migration's own header calls them forward-compatibility
 *   values). They are deliberately not modelled: a status nothing can transition into would be
 *   dead UI vocabulary.
 * - `client_class_claimed` — the exact `CLIENT_CLASSES` tuple, reused from
 *   `client/client-demo-data.ts` (same governed vocabulary Phase 2G already shows). `client_class_
 *   status` is always `claimed` today (no verify route exists — `lib/errors.ts`), so it is shown
 *   as a fixed fact, not modelled as a variable.
 * - Timestamps — `created_at_utc`, `submitted_at_utc`, `under_review_at_utc`, `updated_at_utc`,
 *   `held_at_utc`, `approved_at_utc`, `rejected_at_utc`, `cancelled_at_utc`: all real columns,
 *   all in `safeApplicationResponse`.
 * - `hold_reason` / `rejection_reason` — real, optional, in `safeApplicationResponse`, but they
 *   are populated from the decision route's `reason_code` (a short code, max 64 chars, never
 *   free-text notes), so they are modelled as `string | null` and NEVER given an invented value
 *   in the demo fixtures ("Do not invent hold reason").
 * - `client_id` / `approval_id` — set only on approval (`routes/decisions.ts` `approve/apply`);
 *   `approval_id` is the IAM-02 approval request that authorised it.
 * - `assigned_reviewer` — a real staff user id, deliberately modelled as a boolean
 *   (`reviewerAssigned`) only: it matters for the maker-checker boundary (a reviewer cannot
 *   request approval of their own review) but no staff identity, even a fictitious one, is shown.
 *
 * **`legal_name` is a demo-projected field, not a backed one.** The column exists on
 * `clt1.client_application`, but `safeApplicationResponse` — the single choke point every route
 * response passes through — deliberately EXCLUDES it (approved Phase 1 PII decision), together
 * with `registration_number`, `country_of_incorporation` and `applicant_email`. A staff queue
 * with no organisation name is barely usable, so the demo shows `legalName` — clearly disclosed as
 * demonstrative — and `UI-04` §45.10 records the exact projection decision a live page needs.
 * The other three excluded fields are omitted entirely.
 *
 * **Deliberately NOT modelled** (present in the safe response, but compliance-portal domain, not
 * Client Requests): `cdd_outcome_status`, `aml_sanctions_status`, `pep_adverse_media_status`,
 * `risk_rating_status`, `cfg_*` gate columns. No risk score, screening result, SLA or priority
 * field exists in the governed model either.
 */

// ---------------------------------------------------------------------------
// Status vocabulary — client_application.status (reachable subset).
// ---------------------------------------------------------------------------

export type ClientApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "held"
  | "approved"
  | "rejected"
  | "cancelled";

export const CLIENT_APPLICATION_STATUS_LABELS: Record<ClientApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted — Awaiting Review",
  under_review: "Under Review",
  held: "On Hold",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/**
 * Statuses from which a staff action is currently DEFINED — i.e. work genuinely awaiting staff.
 * Deliberately narrower than `UI Phase 2I`'s original set, which also counted `held`: the backend
 * has no resume/un-hold transition (`lib/applications.ts` — every action's allowed-status list
 * omits `held`; the source comment says so explicitly), so a held application has no staff action
 * to await. Refinement recorded in `UI-04` §45.3; revisit if a resume transition is ever added.
 */
export const AWAITING_STAFF_ACTION_STATUSES: readonly ClientApplicationStatus[] = ["submitted", "under_review"];

// ---------------------------------------------------------------------------
// Staff actions — a display of which transitions the backend defines per status. NOT operational:
// no action is wired to anything on this page.
// ---------------------------------------------------------------------------

export type StaffActionKey = "start_review" | "hold" | "reject" | "request_approval" | "cancel";

export const STAFF_ACTION_LABELS: Record<StaffActionKey, string> = {
  start_review: "Start review",
  hold: "Place on hold",
  reject: "Reject",
  request_approval: "Request approval",
  cancel: "Cancel application",
};

/**
 * Derived from `ALLOWED_STATUSES_FOR_ACTION` (`lib/applications.ts`) — `start-review`: `submitted`;
 * `hold`/`reject`/`approve-request`: `under_review`; `cancel`: `draft`/`submitted`. `held`,
 * `approved`, `rejected` and `cancelled` have NO defined staff action (no resume/reopen exists).
 * `patch`/`submit`/`consent`/`classification-evidence` are applicant-intake actions, not staff
 * review actions, and are not listed.
 */
export const NEXT_ACTIONS_BY_STATUS: Record<ClientApplicationStatus, StaffActionKey[]> = {
  draft: ["cancel"],
  submitted: ["start_review", "cancel"],
  under_review: ["hold", "reject", "request_approval"],
  held: [],
  approved: [],
  rejected: [],
  cancelled: [],
};

// ---------------------------------------------------------------------------
// Authorised-party summary — clt1.authorised_party.party_type counts only.
// ---------------------------------------------------------------------------

export type PartyRole = "signatory" | "director" | "controller" | "ubo";

/** Reuses `UI Phase 2G`'s wording for the three roles it already labels; `ubo` is labelled here
 * (Phase 2G models beneficial ownership as a boolean, not a role list). */
export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  signatory: "Authorised Signatory",
  director: "Director",
  controller: "Controller",
  ubo: "Beneficial Owner",
};

const PARTY_ROLE_ORDER: PartyRole[] = ["signatory", "director", "controller", "ubo"];

/** Role counts only — `safeAuthorisedPartyResponse` omits `party_reference` (the party's
 * identity), and so does this summary: no names, no ownership percentages, no screening status. */
export function partySummary(parties: Partial<Record<PartyRole, number>>): string {
  const parts = PARTY_ROLE_ORDER.filter((role) => (parties[role] ?? 0) > 0).map(
    (role) => `${PARTY_ROLE_LABELS[role]} (${parties[role]})`,
  );
  return parts.length > 0 ? parts.join(" · ") : "None captured";
}

// ---------------------------------------------------------------------------
// Demo records.
// ---------------------------------------------------------------------------

export interface DemoClientRequest {
  id: string;
  /** Short obviously-fictitious reference. Real ids are `clt1app_<uuid>`. */
  applicationRef: string;
  legalName: string;
  applicantType: ApplicantType;
  clientClass: ClientClass;
  status: ClientApplicationStatus;
  reviewerAssigned: boolean;
  createdAtUtc: string;
  submittedAtUtc: string | null;
  underReviewAtUtc: string | null;
  updatedAtUtc: string;
  heldAtUtc: string | null;
  holdReason: string | null;
  approvedAtUtc: string | null;
  rejectedAtUtc: string | null;
  rejectionReason: string | null;
  cancelledAtUtc: string | null;
  clientRef: string | null;
  approvalRef: string | null;
  parties: Partial<Record<PartyRole, number>>;
}

/** Owning client of the approved demo application — also the client the Ops wallet-review
 * fixtures reference (`wlt1.destination.client_id` points at a real `client_profile`, which only
 * exists once an application is approved). */
export const DEMO_APPROVED_CLIENT_REF = "DEMO-CLI-001";

/**
 * 4 records, one per lifecycle stage a queue reviewer meets. Obviously fictitious names,
 * references and dates — no real client, application id or repository id. Only `institutional`,
 * `hnwi` and `professional` are used: `retail`/`unknown` map to CFG-01's permanently-blocked
 * `onboarding.retail_default` gate (`lib/cfg1-client.ts`), so such an application can never exist
 * past creation. The held row deliberately has NO reason code — the field is optional and
 * free-form, so any value would be invented.
 *
 * Awaiting staff action: `DEMO-001` (`submitted`) and `DEMO-002` (`under_review`) — the same two
 * records, in the same states, that `UI Phase 2I`'s overview already showed.
 *
 * `DEMO-004` (approved → client `DEMO-CLI-001`) is named "Example Institutional Holdings Ltd." — the
 * same organisation the Client Portal's own demo state shows as an `active_limited` client — so that
 * the client who owns the demo wallet destinations is one organisation across both portals.
 * (`UI Phase 2J` had that name on a still-`submitted` application, which contradicted the Client
 * Portal; corrected in `UI Phase 2K`, `UI-04` §46.4.)
 */
export const DEMO_CLIENT_REQUESTS: DemoClientRequest[] = [
  {
    id: "demo-app-001",
    applicationRef: "DEMO-001",
    legalName: "Illustrative Treasury Services Ltd.",
    applicantType: "institutional",
    clientClass: "institutional",
    status: "submitted",
    reviewerAssigned: false,
    createdAtUtc: "2026-09-15T08:30:00Z",
    submittedAtUtc: "2026-09-16T10:05:00Z",
    underReviewAtUtc: null,
    updatedAtUtc: "2026-09-16T10:05:00Z",
    heldAtUtc: null,
    holdReason: null,
    approvedAtUtc: null,
    rejectedAtUtc: null,
    rejectionReason: null,
    cancelledAtUtc: null,
    clientRef: null,
    approvalRef: null,
    parties: { director: 2, ubo: 1 },
  },
  {
    id: "demo-app-002",
    applicationRef: "DEMO-002",
    legalName: "Demo Capital Partners Ltd.",
    applicantType: "corporate",
    clientClass: "professional",
    status: "under_review",
    reviewerAssigned: true,
    createdAtUtc: "2026-09-12T09:00:00Z",
    submittedAtUtc: "2026-09-13T11:20:00Z",
    underReviewAtUtc: "2026-09-14T09:20:00Z",
    updatedAtUtc: "2026-09-14T09:20:00Z",
    heldAtUtc: null,
    holdReason: null,
    approvedAtUtc: null,
    rejectedAtUtc: null,
    rejectionReason: null,
    cancelledAtUtc: null,
    clientRef: null,
    approvalRef: null,
    parties: { signatory: 1, director: 1 },
  },
  {
    id: "demo-app-003",
    applicationRef: "DEMO-003",
    legalName: "Sample Family Office Ltd.",
    applicantType: "corporate",
    clientClass: "hnwi",
    status: "held",
    reviewerAssigned: true,
    createdAtUtc: "2026-09-09T13:45:00Z",
    submittedAtUtc: "2026-09-10T08:15:00Z",
    underReviewAtUtc: "2026-09-11T10:00:00Z",
    updatedAtUtc: "2026-09-17T14:10:00Z",
    heldAtUtc: "2026-09-17T14:10:00Z",
    holdReason: null,
    approvedAtUtc: null,
    rejectedAtUtc: null,
    rejectionReason: null,
    cancelledAtUtc: null,
    clientRef: null,
    approvalRef: null,
    parties: { controller: 1, ubo: 1 },
  },
  {
    id: "demo-app-004",
    applicationRef: "DEMO-004",
    legalName: "Example Institutional Holdings Ltd.",
    applicantType: "institutional",
    clientClass: "institutional",
    status: "approved",
    reviewerAssigned: true,
    createdAtUtc: "2026-09-01T09:10:00Z",
    submittedAtUtc: "2026-09-02T09:30:00Z",
    underReviewAtUtc: "2026-09-03T10:45:00Z",
    updatedAtUtc: "2026-09-10T15:00:00Z",
    heldAtUtc: null,
    holdReason: null,
    approvedAtUtc: "2026-09-10T15:00:00Z",
    rejectedAtUtc: null,
    rejectionReason: null,
    cancelledAtUtc: null,
    clientRef: DEMO_APPROVED_CLIENT_REF,
    approvalRef: "DEMO-APR-003",
    parties: { signatory: 1, director: 2, ubo: 2 },
  },
];

export function requestReference(request: Pick<DemoClientRequest, "applicationRef">): string {
  return `Client Application ${request.applicationRef}`;
}

/** Reference text for a demo request by id — lets other Ops fixtures point at a request without
 * hard-coding its display string. Falls back to the id so a broken link is visible, not silent. */
export function demoRequestReference(id: string): string {
  const request = DEMO_CLIENT_REQUESTS.find((r) => r.id === id);
  return request ? requestReference(request) : id;
}

export function clientClassLabel(clientClass: ClientClass): string {
  return CLIENT_CLASS_LABELS[clientClass];
}

export function applicantTypeLabel(applicantType: ApplicantType): string {
  return APPLICANT_TYPE_LABELS[applicantType];
}

// ---------------------------------------------------------------------------
// Formatting — timeZone pinned to UTC. These render inside client components that are also
// server-rendered, so a runtime-local timezone would make the server and browser disagree
// (a hydration mismatch); the source columns are `*_utc`, so showing UTC is also the honest one.
// ---------------------------------------------------------------------------

export function formatRequestDate(utc: string): string {
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return utc;
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" }).format(
    date,
  );
}

export function formatRequestDateTime(utc: string): string {
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return utc;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
}
