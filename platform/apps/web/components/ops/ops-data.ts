import { STATUS_LABELS as CLIENT_WLT_STATUS_LABELS, type DestinationStatus } from "@/components/wallet-destinations/destination-data";

/**
 * Staff/Operations — Operational Overview. Data layer. UI Phase 2I.
 *
 * Full capability map: `UI-04` §44.1. Every enum/state below traces to real governed backend
 * source, verified this turn — every route it sits behind is `requireInternal`-guarded (verified
 * by re-scanning every backend service's registered routes this turn; unchanged from every prior
 * UI phase's own findings) — none of it is callable from a staff browser session today, exactly
 * the same boundary that has applied to every client-page turn so far, now confirmed for Ops too:
 *
 * - `ClientApplicationStatus` — the exact status literals found in
 *   `platform/services/clt1/src/routes/applications.ts`/`decisions.ts`
 *   (`draft`/`submitted`/`under_review`/`held`/`approved`/`rejected`/`cancelled`).
 * - Wallet destination status reuses `UI Phase 2E`'s own `STATUS_LABELS` from
 *   `wallet-destinations/destination-data.ts` DIRECTLY — the same `wlt1.destination.status`
 *   column, the same governed values. Verified this turn that the internal "safe staff" response
 *   shape (`safeWalletDestinationResponse`, `lib/safe-response.ts`) masks the address IDENTICALLY
 *   to the public client response — staff do NOT get an unmasked view; the only real difference is
 *   `client_id` being present (staff need to know whose destination it is). Reusing the client
 *   labels is therefore a deliberate choice, not an oversight — the underlying fact and its
 *   correct human phrasing are identical; Ops additionally shows the owning client reference,
 *   which the client's own page omits (redundant for a client viewing their own destination).
 * - `MakerCheckerStatus` — the exact status literals from `platform/services/iam2/src/routes/
 *   approvals.ts` (`pending`/`approved`/`rejected`/`expired`/`blocked` — the last set when an
 *   `iam2.sod_check` blocks a self-approval attempt).
 * - Audit/Activity fields — the exact SAFE (already tier-redacted) field set from
 *   `platform/services/sec1/src/lib/read-redaction.ts`'s own `RedactableAuditEventRow` —
 *   `event_type`/`actor_type`/`entity_type`/`action`/`result`/`occurred_at_utc` only. Hash-chain/
 *   integrity internals and raw payloads are never selected by that module either — there is
 *   nothing sensitive to accidentally leak by using this exact field subset. `actor_user_id` is
 *   deliberately NOT shown even though the real redaction model marks it visible at both tiers —
 *   this turn's own "do not fabricate approver/actor names" instruction is read to also mean "do
 *   not show even a real-shaped fake identifier" for demo data; `actor_type` (a role class, not an
 *   identity) is shown instead.
 *
 * Deliberately NOT modeled — no client-visible severity/urgency field exists in any of these
 * governed models (none was found by direct inspection); no financial figure (revenue, volume,
 * settlement total, fee) exists in any of `CLT-01`/`WLT-01`/`IAM-02`/`SEC-01` (all confirmed
 * absent by inspection, not assumed).
 */

// ---------------------------------------------------------------------------
// A. Client Requests — CLT-01 client_application.status.
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

/** Statuses that represent staff work still outstanding — mirrors the real `start-review`/
 * `hold`/`reject`/`approve` transition set actually registered on `routes/applications.ts`. */
const CLIENT_APPLICATION_OPEN_STATUSES: ClientApplicationStatus[] = ["submitted", "under_review", "held"];

export interface DemoClientRequest {
  id: string;
  reference: string;
  status: ClientApplicationStatus;
}

/** 2 records — obviously fictitious references, no real application IDs from the repo. */
export const DEMO_CLIENT_REQUESTS: DemoClientRequest[] = [
  { id: "demo-app-001", reference: "Client Application DEMO-001", status: "submitted" },
  { id: "demo-app-002", reference: "Client Application DEMO-002", status: "under_review" },
];

// ---------------------------------------------------------------------------
// B. Wallet Destination Review — WLT-01 wlt1.destination.status, reusing client-facing labels.
// ---------------------------------------------------------------------------

export const WLT_STATUS_LABELS = CLIENT_WLT_STATUS_LABELS;

const WLT_REVIEW_OPEN_STATUSES: DestinationStatus[] = ["pending_screening", "pending_review"];

export interface DemoWalletReviewItem {
  id: string;
  reference: string;
  clientReference: string;
  status: DestinationStatus;
}

export const DEMO_WALLET_REVIEW_ITEMS: DemoWalletReviewItem[] = [
  {
    id: "demo-wlt-001",
    reference: "Wallet Destination DEMO-WLT-001",
    clientReference: "Client Application DEMO-002",
    status: "pending_screening",
  },
  {
    id: "demo-wlt-002",
    reference: "Wallet Destination DEMO-WLT-002",
    clientReference: "Client Application DEMO-001",
    status: "pending_review",
  },
];

// ---------------------------------------------------------------------------
// C. Maker-Checker Queue — IAM-02 iam2.approval_request.status.
// ---------------------------------------------------------------------------

export type MakerCheckerStatus = "pending" | "approved" | "rejected" | "expired" | "blocked";

export const MAKER_CHECKER_STATUS_LABELS: Record<MakerCheckerStatus, string> = {
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  blocked: "Blocked — Segregation of Duties",
};

export interface DemoApprovalRequest {
  id: string;
  reference: string;
  /** The real governed action/resource shape (`iam2.approval_request.action`/`.resource`) — a
   * namespaced action string, never a fabricated approver or initiator name. */
  action: string;
  subjectReference: string;
  status: MakerCheckerStatus;
}

/** The two demo items below deliberately reference the SAME two demo records already used above
 * (`Wallet Destination DEMO-WLT-002`, `Client Application DEMO-001`) — architecturally accurate,
 * not coincidental: both `WLT-01`'s destination-approval flow and `CLT-01`'s application-approval
 * flow route through this exact IAM-02 request/apply mechanism in the real system. */
export const DEMO_APPROVAL_REQUESTS: DemoApprovalRequest[] = [
  {
    id: "demo-apr-001",
    reference: "Approval Request DEMO-APR-001",
    action: "wlt1.destination.approve",
    subjectReference: "Wallet Destination DEMO-WLT-002",
    status: "pending",
  },
  {
    id: "demo-apr-002",
    reference: "Approval Request DEMO-APR-002",
    action: "clt1.application.approve",
    subjectReference: "Client Application DEMO-001",
    status: "pending",
  },
];

// ---------------------------------------------------------------------------
// Work Requiring Attention — a rollup COUNT over the three queues above, not a duplicate record
// list (`Operational Queues` shows the itemised records; this section is a glanceable summary).
// ---------------------------------------------------------------------------

export interface AttentionRollupRow {
  label: string;
  count: number;
}

export const ATTENTION_ROLLUP: AttentionRollupRow[] = [
  {
    label: "Client Requests",
    count: DEMO_CLIENT_REQUESTS.filter((r) => CLIENT_APPLICATION_OPEN_STATUSES.includes(r.status)).length,
  },
  {
    label: "Wallet Destination Review",
    count: DEMO_WALLET_REVIEW_ITEMS.filter((r) => WLT_REVIEW_OPEN_STATUSES.includes(r.status)).length,
  },
  {
    label: "Maker-Checker Queue",
    count: DEMO_APPROVAL_REQUESTS.filter((r) => r.status === "pending").length,
  },
];

// ---------------------------------------------------------------------------
// D. Workflow Availability — the 4 other B-classified Ops nav items (`UI-04` §8), none built yet.
// ---------------------------------------------------------------------------

export interface OpsWorkflowAvailabilityItem {
  label: string;
  status: "Interface planned";
}

export const OPS_WORKFLOW_AVAILABILITY: OpsWorkflowAvailabilityItem[] = [
  { label: "Client Requests", status: "Interface planned" },
  { label: "Wallet Destination Review", status: "Interface planned" },
  { label: "Maker-Checker Queue", status: "Interface planned" },
  { label: "Audit / Activity", status: "Interface planned" },
];

// ---------------------------------------------------------------------------
// E. Recent Staff Activity — SEC-01 safe (already tier-redacted) audit-event field subset only.
// ---------------------------------------------------------------------------

export interface DemoAuditEvent {
  id: string;
  eventType: string;
  actorType: string;
  entityType: string;
  action: string;
  result: "success" | "failure";
  occurredAtUtc: string;
}

/** 2 records — safe field subset only, no actor identity, no raw payload, no hash-chain field. */
export const DEMO_AUDIT_EVENTS: DemoAuditEvent[] = [
  {
    id: "demo-audit-001",
    eventType: "wlt1.destination_registration_refused",
    actorType: "system",
    entityType: "destination_registration",
    action: "register",
    result: "failure",
    occurredAtUtc: "2026-09-18T10:15:00Z",
  },
  {
    id: "demo-audit-002",
    eventType: "clt1.application_submitted",
    actorType: "user",
    entityType: "client_application",
    action: "submit",
    result: "success",
    occurredAtUtc: "2026-09-18T09:40:00Z",
  },
];

export function formatOccurredAt(occurredAtUtc: string): string {
  const date = new Date(occurredAtUtc);
  if (Number.isNaN(date.getTime())) return occurredAtUtc;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
