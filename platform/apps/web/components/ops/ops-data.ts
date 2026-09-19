import {
  APPROVAL_STATUS_LABELS,
  APPROVAL_TYPES,
  DEMO_APPROVAL_REQUESTS_ALL,
  approvalReference,
  isAwaitingChecker,
  type ApprovalStatus,
} from "@/components/ops/approval-request-data";
import {
  AWAITING_STAFF_ACTION_STATUSES,
  DEMO_CLIENT_REQUESTS,
} from "@/components/ops/client-request-data";
import {
  DEMO_REVIEW_RECORDS,
  destinationReference,
  isAwaitingStaffAction,
  recordId,
} from "@/components/ops/destination-review-data";
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
 * - Client Requests — the status enum, labels, demo records and "awaiting staff action" set live
 *   in `client-request-data.ts` since `UI Phase 2J` (a second Ops page now needs them); this file
 *   imports them so the overview and `/ops/client-requests` can never disagree.
 * - Wallet Destination Review — the demo records, status labels and "awaiting staff action" rule live
 *   in `destination-review-data.ts` since `UI Phase 2K` (a second Ops page now needs them). The
 *   status LABELS are still `UI Phase 2E`'s `STATUS_LABELS`, reused directly — the underlying
 *   `wlt1.destination.status` column and its correct phrasing are identical for staff and client.
 *   The overview lists only destinations awaiting staff action (`pending_review`, and a stuck
 *   `pending_screening`), not every non-active one.
 * - Maker-Checker Queue — the demo requests, status labels and "awaiting a checker" rule live in
 *   `approval-request-data.ts` since `UI Phase 2L`. The Overview lists only `pending` requests.
 *   Note `blocked` is set by a role/permission segregation-of-duties CONFLICT found while an approver
 *   tries to approve — NOT by a self-approval attempt (that leaves the request `pending`); this file
 *   said otherwise before `UI Phase 2L` corrected it.
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
// A. Client Requests — CLT-01 client_application.status. Source of truth: client-request-data.ts.
// ---------------------------------------------------------------------------

export { CLIENT_APPLICATION_STATUS_LABELS, DEMO_CLIENT_REQUESTS } from "@/components/ops/client-request-data";

// ---------------------------------------------------------------------------
// B. Wallet Destination Review — WLT-01 wlt1.destination.status. Source of truth:
//    destination-review-data.ts; the Overview lists only destinations AWAITING STAFF ACTION.
// ---------------------------------------------------------------------------

export const WLT_STATUS_LABELS = CLIENT_WLT_STATUS_LABELS;

export interface DemoWalletReviewItem {
  id: string;
  reference: string;
  clientReference: string;
  status: DestinationStatus;
}

export const DEMO_WALLET_REVIEW_ITEMS: DemoWalletReviewItem[] = DEMO_REVIEW_RECORDS.filter(isAwaitingStaffAction).map(
  (record) => ({
    id: recordId(record),
    reference: destinationReference(record),
    clientReference: `Client ${record.review.clientRef}`,
    status: record.destination.status,
  }),
);

// ---------------------------------------------------------------------------
// C. Maker-Checker Queue — IAM-02 iam2.approval_request.status. Source of truth:
//    approval-request-data.ts; the Overview lists only requests AWAITING A CHECKER (`pending`).
// ---------------------------------------------------------------------------

export type MakerCheckerStatus = ApprovalStatus;
export const MAKER_CHECKER_STATUS_LABELS = APPROVAL_STATUS_LABELS;

export interface DemoApprovalRequest {
  id: string;
  reference: string;
  /** The real governed action (`iam2.approval_request.action`), verbatim — never a fabricated
   * approver or initiator name. Corrected in `UI Phase 2L`: `UI Phase 2I`/`2K` showed
   * `wlt1.destination.approve`, which is not a real action; WLT verifies
   * `wlt1.destination.approve_apply` (`routes/destination-approval.ts`). */
  action: string;
  subjectReference: string;
  status: MakerCheckerStatus;
}

export const DEMO_APPROVAL_REQUESTS: DemoApprovalRequest[] = DEMO_APPROVAL_REQUESTS_ALL.filter(isAwaitingChecker).map(
  (request) => ({
    id: request.id,
    reference: approvalReference(request),
    action: APPROVAL_TYPES[request.action].action,
    subjectReference: request.subjectLabel,
    status: request.status,
  }),
);

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
    count: DEMO_CLIENT_REQUESTS.filter((r) => AWAITING_STAFF_ACTION_STATUSES.includes(r.status)).length,
  },
  {
    label: "Wallet Destination Review",
    count: DEMO_WALLET_REVIEW_ITEMS.length,
  },
  {
    label: "Maker-Checker Queue",
    count: DEMO_APPROVAL_REQUESTS.length,
  },
];

// ---------------------------------------------------------------------------
// D. Workflow Availability — the 4 other B-classified Ops nav items (`UI-04` §8); each gains a real `href` as its page lands.
// ---------------------------------------------------------------------------

export interface OpsWorkflowAvailabilityItem {
  label: string;
  status: "Available" | "Interface planned";
  href?: string;
}

export const OPS_WORKFLOW_AVAILABILITY: OpsWorkflowAvailabilityItem[] = [
  { label: "Client Requests", status: "Available", href: "/ops/client-requests" },
  { label: "Wallet Destination Review", status: "Available", href: "/ops/wallet-destination-review" },
  { label: "Maker-Checker Queue", status: "Available", href: "/ops/maker-checker-queue" },
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
