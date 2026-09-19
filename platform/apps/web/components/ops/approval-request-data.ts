import { DEMO_APPROVED_CLIENT_REF, demoRequestReference } from "@/components/ops/client-request-data";
import { demoDestinationReference } from "@/components/ops/destination-review-data";

/**
 * Staff/Operations — Maker-Checker Queue. Shared data layer. UI Phase 2L.
 *
 * ONE source for the demo `IAM-02` approval requests, imported by `/ops/maker-checker-queue` AND by
 * the three pages that reference an approval — the Operational Overview, Wallet Destination Review
 * and Client Requests — so a request cannot be "pending" in one place and absent in another.
 *
 * Every value traces to real `IAM-02` source, verified this turn (full capability map: `UI-04`
 * §47.1). `IAM-02` routes are `requireInternal`-guarded and **no list, get or search route exists**
 * (`routes/approvals.ts` registers only `request`, `:id/approve`, `:id/reject`) — nothing here is
 * callable from a staff browser session today.
 *
 * - `ApprovalStatus` — the 5 statuses code can actually write. The DB CHECK also allows `cancelled`
 *   (`006_iam2_core.cjs`), but nothing in `services/iam2/src` ever writes it (searched), so it is
 *   not modelled — a status nothing can reach would be dead vocabulary. `expired` is written
 *   LAZILY, only when a decision is attempted after `expires_at_utc`; there is no sweeper, so a
 *   request past its expiry can still read `pending`. `blocked` is written when an approve attempt
 *   finds a role/permission segregation-of-duties CONFLICT between maker and approver — it is a
 *   terminal status on the request itself, distinct from `rejected`, and distinct from the
 *   self-approval refusal (approver === maker), which leaves the request `pending`.
 * - Action/resource pairs — the exact `(action, resource)` each real consumer verifies a decision
 *   token against (`verifyDecisionToken` call sites in `wlt1` and `clt1`). No invented request type.
 * - `requiredCount`/`approvedCount`/`createdAtUtc`/`expiresAtUtc`/`completedAtUtc` — real
 *   `approval_request` columns. `completedAtUtc` is set only on `approved`/`rejected`.
 * - `decisionReason` — `approval_decision.decision_reason`, optional free text (≤512), never given
 *   an invented value here.
 * - The maker — `maker_user_id`, an OPAQUE IAM user id. `IAM-02` holds no name or display label, so
 *   the fixtures show a generic role label marked "(demo)"; no personal name is ever invented.
 *
 * **Approval policy.** `approval_policy` rows are not seeded anywhere in the repository, so today
 * EVERY request takes the route's defaults — 1 approval, no step-up, 24-hour expiry
 * (`DEFAULT_APPROVAL_POLICY`). `required_approver_roles` and `threshold_type` exist on the policy
 * table but no code reads them, and the approve route performs no role/permission check on the
 * approver — only "not the maker", "no SoD conflict", and step-up when a policy demands it. So no
 * "required approver role" is modelled: showing one would claim a control that does not exist.
 *
 * **Deliberately NOT modelled:** raw `payload`/`payload_hash`, the decision token, the approver's
 * identity, the SoD matched-rule ids and `sod_check` rows, and any financial figure — none
 * appears in a safe projection, and `IAM-02` has no amount concept.
 */

// ---------------------------------------------------------------------------
// Status vocabulary — iam2.approval_request.status (writable subset).
// ---------------------------------------------------------------------------

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "blocked";

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = ["pending", "approved", "rejected", "expired", "blocked"];

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  blocked: "Blocked — Segregation of Duties",
};

/** Governed maker-checker wording (`UI-04` §21/§22): "approval pending" means waiting on someone
 * else's action, and the UI says so. One sentence per status — never an invented UI-only state. */
export const APPROVAL_STATUS_NOTES: Record<ApprovalStatus, string> = {
  pending:
    "Waiting on an independent approver. If the expiry time passes first, the request becomes expired the next time a decision is attempted.",
  approved:
    "Approved by the required number of approvers. IAM-02 records the approval only — the originating workflow must redeem the single-use decision token (valid for 12 minutes) to apply the change.",
  rejected: "A checker rejected this request. Rejection is final for this request.",
  expired:
    "The expiry time passed before a decision. Expiry is recorded when a decision is attempted afterwards, so the status can lag the expiry time. A new request is required.",
  blocked:
    "A segregation-of-duties conflict was detected between the requester and an approver. Blocked is final for this request, and is not a rejection. A new request is required. The matched rule is not shown.",
};

/** What a request with no matching `approval_policy` row gets (`routes/approvals.ts`). No policy row
 * is seeded, so this applies to every request today. */
export const DEFAULT_APPROVAL_POLICY = { requiredCount: 1, requiresStepUp: false, expiryHours: 24 } as const;

// ---------------------------------------------------------------------------
// Request types — the real (action, resource) pairs.
// ---------------------------------------------------------------------------

export type ApprovalActionId =
  | "wlt1.destination.approve_apply"
  | "clt1.application.approve"
  | "clt1.client_mandate.update"
  | "wlt1.evidence_export.apply";

export type ApprovalModule = "WLT-01" | "CLT-01";

export interface ApprovalTypeInfo {
  action: ApprovalActionId;
  /** `approval_request.resource` — verified against each consumer's own `verifyDecisionToken` call. */
  resource: string;
  module: ApprovalModule;
  /** Short table label. */
  label: string;
  /** The workflow this request came from. */
  workflow: string;
  /** A real Ops page for that workflow, or null when none exists yet (no link is faked). */
  href: string | null;
  /** What the originating workflow does once the approval is redeemed — from that module's own
   * source, NOT from IAM-02, which records the decision only (`UI-04` §22 "effective state"). */
  effect: string;
}

export const APPROVAL_TYPES: Record<ApprovalActionId, ApprovalTypeInfo> = {
  "wlt1.destination.approve_apply": {
    action: "wlt1.destination.approve_apply",
    resource: "destination",
    module: "WLT-01",
    label: "Destination approval",
    workflow: "Wallet Destination Review",
    href: "/ops/wallet-destination-review",
    effect: "The destination moves to Approved — Cooling-Off.",
  },
  "clt1.application.approve": {
    action: "clt1.application.approve",
    resource: "application",
    module: "CLT-01",
    label: "Application approval",
    workflow: "Client Requests",
    href: "/ops/client-requests",
    effect: "The application is approved and the client record is created.",
  },
  "clt1.client_mandate.update": {
    action: "clt1.client_mandate.update",
    resource: "client_mandate",
    module: "CLT-01",
    label: "Mandate update",
    workflow: "Client mandate management",
    href: null,
    effect: "The client mandate is updated.",
  },
  "wlt1.evidence_export.apply": {
    action: "wlt1.evidence_export.apply",
    resource: "evidence_export",
    module: "WLT-01",
    label: "Evidence export",
    workflow: "Wallet destination evidence export",
    href: null,
    effect: "The evidence export is generated.",
  },
};

// ---------------------------------------------------------------------------
// Demo requests.
// ---------------------------------------------------------------------------

export type ApprovalSubjectKind = "destination" | "application" | "client_mandate" | "evidence_export";

export interface DemoApprovalRequest {
  id: string;
  /** Short obviously-fictitious reference. Real ids are `appr_<uuid>`. */
  ref: string;
  action: ApprovalActionId;
  subjectKind: ApprovalSubjectKind;
  /** The originating page's own fixture id where one exists (`demo-dest-003`, `demo-app-002`). */
  subjectId: string;
  subjectLabel: string;
  /** `client_id` — bound for client-scoped requests, null for an application (not yet a client). */
  clientRef: string | null;
  /** A role label marked "(demo)" — `maker_user_id` itself is an opaque id (see header). */
  makerLabel: string;
  status: ApprovalStatus;
  requiredCount: number;
  approvedCount: number;
  createdAtUtc: string;
  expiresAtUtc: string;
  completedAtUtc: string | null;
  decisionReason: string | null;
}

/**
 * 6 requests — one per status except `rejected` (fully supported by the mapping and detail, no
 * fixture: the brief asks for 4–6 and not to overload negatives). A slice of the queue, not the
 * whole register.
 *
 * Consistent with the originating pages by construction: `DEMO-APR-001` targets the payout the
 * Wallet Destination Review page marks approvable; `DEMO-APR-002` targets the application that page
 * shows `under_review`; `DEMO-APR-003` is the approval `client-request-data.ts` records for approved
 * application `DEMO-004`; `DEMO-APR-004` is the approval behind payout `DEMO-PAY-002`'s
 * `approved_pending_cooling`. Every request uses the default policy (1 approval, 24 h).
 */
const RAW_APPROVAL_REQUESTS: DemoApprovalRequest[] = [
  {
    id: "demo-apr-001",
    ref: "DEMO-APR-001",
    action: "wlt1.destination.approve_apply",
    subjectKind: "destination",
    subjectId: "demo-dest-003",
    subjectLabel: demoDestinationReference("demo-dest-003"),
    clientRef: DEMO_APPROVED_CLIENT_REF,
    makerLabel: "Operations Maker (demo)",
    status: "pending",
    requiredCount: 1,
    approvedCount: 0,
    createdAtUtc: "2026-09-18T15:30:00Z",
    expiresAtUtc: "2026-09-19T15:30:00Z",
    completedAtUtc: null,
    decisionReason: null,
  },
  {
    id: "demo-apr-002",
    ref: "DEMO-APR-002",
    action: "clt1.application.approve",
    subjectKind: "application",
    subjectId: "demo-app-002",
    subjectLabel: demoRequestReference("demo-app-002"),
    clientRef: null,
    makerLabel: "Compliance Maker (demo)",
    status: "pending",
    requiredCount: 1,
    approvedCount: 0,
    createdAtUtc: "2026-09-19T08:10:00Z",
    expiresAtUtc: "2026-09-20T08:10:00Z",
    completedAtUtc: null,
    decisionReason: null,
  },
  {
    id: "demo-apr-003",
    ref: "DEMO-APR-003",
    action: "clt1.application.approve",
    subjectKind: "application",
    subjectId: "demo-app-004",
    subjectLabel: demoRequestReference("demo-app-004"),
    clientRef: null,
    makerLabel: "Compliance Maker (demo)",
    status: "approved",
    requiredCount: 1,
    approvedCount: 1,
    createdAtUtc: "2026-09-10T14:20:00Z",
    expiresAtUtc: "2026-09-11T14:20:00Z",
    completedAtUtc: "2026-09-10T14:52:00Z",
    decisionReason: null,
  },
  {
    id: "demo-apr-004",
    ref: "DEMO-APR-004",
    action: "wlt1.destination.approve_apply",
    subjectKind: "destination",
    subjectId: "demo-dest-004",
    subjectLabel: demoDestinationReference("demo-dest-004"),
    clientRef: DEMO_APPROVED_CLIENT_REF,
    makerLabel: "Operations Maker (demo)",
    status: "approved",
    requiredCount: 1,
    approvedCount: 1,
    createdAtUtc: "2026-09-06T10:00:00Z",
    expiresAtUtc: "2026-09-07T10:00:00Z",
    completedAtUtc: "2026-09-06T10:40:00Z",
    decisionReason: null,
  },
  {
    id: "demo-apr-005",
    ref: "DEMO-APR-005",
    action: "wlt1.evidence_export.apply",
    subjectKind: "evidence_export",
    subjectId: "demo-exp-001",
    subjectLabel: "Evidence Export DEMO-EXP-001",
    clientRef: DEMO_APPROVED_CLIENT_REF,
    makerLabel: "Operations Maker (demo)",
    status: "expired",
    requiredCount: 1,
    approvedCount: 0,
    createdAtUtc: "2026-09-16T10:00:00Z",
    expiresAtUtc: "2026-09-17T10:00:00Z",
    completedAtUtc: null,
    decisionReason: null,
  },
  {
    id: "demo-apr-006",
    ref: "DEMO-APR-006",
    action: "clt1.client_mandate.update",
    subjectKind: "client_mandate",
    subjectId: "demo-mnd-001",
    subjectLabel: "Client Mandate DEMO-MND-001",
    clientRef: DEMO_APPROVED_CLIENT_REF,
    makerLabel: "Compliance Maker (demo)",
    status: "blocked",
    requiredCount: 1,
    approvedCount: 0,
    createdAtUtc: "2026-09-17T14:00:00Z",
    expiresAtUtc: "2026-09-18T14:00:00Z",
    completedAtUtc: null,
    decisionReason: null,
  },
];

/**
 * Queue order: pending requests first (soonest expiry first — the one that lapses first is the most
 * urgent), then decided/terminal ones, newest first. Both groups are stable within themselves.
 */
export const DEMO_APPROVAL_REQUESTS_ALL: DemoApprovalRequest[] = [...RAW_APPROVAL_REQUESTS].sort((a, b) => {
  const aPending = a.status === "pending";
  const bPending = b.status === "pending";
  if (aPending !== bPending) return aPending ? -1 : 1;
  if (aPending) return a.expiresAtUtc.localeCompare(b.expiresAtUtc);
  return b.createdAtUtc.localeCompare(a.createdAtUtc);
});

/** Awaiting a checker: `pending` only. Approved/rejected/expired/blocked are terminal and read-only —
 * the routes refuse any further decision (`IAM2_APPROVAL_ALREADY_DECIDED`). */
export function isAwaitingChecker(request: DemoApprovalRequest): boolean {
  return request.status === "pending";
}

/** A pending approval for a subject on another Ops page, if any — lets that page say "approval
 * requested" instead of offering "Request approval" again. */
export function pendingApprovalFor(kind: ApprovalSubjectKind, subjectId: string): DemoApprovalRequest | undefined {
  return DEMO_APPROVAL_REQUESTS_ALL.find(
    (r) => r.subjectKind === kind && r.subjectId === subjectId && isAwaitingChecker(r),
  );
}

export const MAKER_CHECKER_QUEUE_HREF = "/ops/maker-checker-queue";

export function approvalReference(request: Pick<DemoApprovalRequest, "ref">): string {
  return `Approval Request ${request.ref}`;
}

// ---------------------------------------------------------------------------
// Formatting — same UTC-pinned formatters as the other Ops pages.
// ---------------------------------------------------------------------------

export { formatRequestDate, formatRequestDateTime } from "@/components/ops/client-request-data";
