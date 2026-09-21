import {
  APPROVAL_TYPES,
  DEFAULT_APPROVAL_POLICY,
  DEMO_APPROVAL_REQUESTS_ALL,
  formatRequestDateTime,
  type ApprovalModule,
  type ApprovalStatus,
  type DemoApprovalRequest,
} from "@/components/ops/approval-request-data";

/**
 * Admin / Compliance — Approval Queue. Data layer. UI Phase 2R.
 *
 * **An oversight projection over the SHARED Phase 2L approval data — no fixture of its own.** The six
 * requests are `DEMO_APPROVAL_REQUESTS_ALL` (`ops/approval-request-data.ts`), the same objects the Ops
 * Maker-Checker Queue, the Operational Overview, Wallet Destination Review, Client Requests and the
 * Compliance Overview already read, so a request cannot be pending on one page and approved on another.
 * **No request was added** (`UI-04` §53.3): an Admin-only request would contradict the Ops queue — a
 * pending one would be missing from its Pending view, a terminal one from its "All requests" — so reuse is
 * the only way a cross-page contradiction is impossible.
 *
 * **What differs from Ops is the reading, not the facts** (`UI-04` §53.1): a register (every state, newest
 * first) instead of a work queue (pending first); control evidence instead of a checker's actions; text
 * about what IAM-02 enforces instead of disabled decision buttons. Nothing here changes a request.
 *
 * **What IAM-02 really is, re-verified from source this turn** (full capability map: `UI-04` §53.2):
 * - three `POST` routes only (`request`, `approve`, `reject`) — **no list, get or search route**, and the
 *   acting user is a request-body field, so nothing here is browser-callable;
 * - `cancelled` is in the DB CHECK and **never written**, so it is not modelled;
 * - **no service code creates an approval request** — operators call IAM-02 directly — so a request's
 *   originating module is never stored; it is read off the `action` prefix;
 * - `approve` refuses the maker (audited; the request stays `pending`), runs a SoD check that blocks on a
 *   conflict, and enforces step-up only when a policy demands it; **`reject` does none of these**, and
 *   neither route checks that the deciding user holds any role or permission;
 * - `approval_policy` has no seeded row and the runtime role holds `SELECT` only, so every request takes
 *   the defaults (`DEFAULT_APPROVAL_POLICY`); `required_approver_roles` is stored and read by no code;
 * - only **two** SoD rules are seeded (both "meta" rules between managing conflict rules and assigning
 *   roles/permissions), and only `role_role`/`permission_permission` rules are evaluated;
 * - `approval_decision` and `sod_check` are INSERT-only for IAM-02's runtime role — decision evidence is
 *   write-only today.
 *
 * **Deliberately NOT here:** the payload, payload hash, decision token, the deciding user, matched SoD rule
 * ids, any name, any financial figure, an approval rate/average/score, and an Admin decision control. The
 * maker is a demo CLASS label (`maker_user_id` is an opaque id and IAM-02 holds no name). The decision
 * reason is optional free text (≤512), so it is shown only as "No reason recorded" — never an invented value.
 */

// ---------------------------------------------------------------------------
// Register projection — every state, newest first.
// ---------------------------------------------------------------------------

/** The Admin register order: newest request first. The Ops queue instead lists pending requests first,
 * soonest expiry first — a work order. Same objects, different reading. */
export const ADMIN_APPROVAL_REQUESTS: DemoApprovalRequest[] = [...DEMO_APPROVAL_REQUESTS_ALL].sort((a, b) =>
  b.createdAtUtc.localeCompare(a.createdAtUtc),
);

/** "DEMO-APR-001, Destination approval" — begins with the visible reference (label-in-name). */
export function adminApprovalReference(request: DemoApprovalRequest): string {
  return `${request.ref}, ${APPROVAL_TYPES[request.action].label}`;
}

/** The module that owns the workflow, read off the request's `action` (IAM-02 stores no originating module). */
export function domainOf(request: DemoApprovalRequest): ApprovalModule {
  return APPROVAL_TYPES[request.action].module;
}

/** Domains that actually have a request, in a stable order — so the filter never offers an empty choice. */
export function domainsPresent(requests: DemoApprovalRequest[] = ADMIN_APPROVAL_REQUESTS): ApprovalModule[] {
  return Array.from(new Set(requests.map(domainOf))).sort();
}

// ---------------------------------------------------------------------------
// Counts — understated, derived from the shared requests, never a rate or a score.
// ---------------------------------------------------------------------------

const STATUS_SHORT_LABELS: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  blocked: "Blocked",
};

const STATUS_ORDER: ApprovalStatus[] = ["pending", "approved", "rejected", "expired", "blocked"];

/** "2 Pending · 2 Approved · 1 Expired · 1 Blocked" — only statuses present, counts by governed status. It
 * is a summary of the rows shown, not an approval rate, an average or a control-effectiveness measure. */
export function statusCountsLine(requests: DemoApprovalRequest[]): string {
  const parts = STATUS_ORDER.map((status) => ({ status, n: requests.filter((r) => r.status === status).length }))
    .filter((entry) => entry.n > 0)
    .map((entry) => `${entry.n} ${STATUS_SHORT_LABELS[entry.status]}`);
  return parts.length === 0 ? "No requests" : parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Control evidence — derived from the status by the code's own invariants, never invented per request.
// ---------------------------------------------------------------------------

export interface SodCheckEvidence {
  /** The result IAM-02's `sod_check` would hold for this status. */
  result: string;
  note: string;
}

/**
 * What the segregation-of-duties check shows for a request in this status. These follow from
 * `routes/approvals.ts`: an `approved` request can only have got there by passing the check (a conflict
 * sets `blocked` before any decision is written); `reject` runs no SoD check at all; and a request that
 * expired, or is still pending, has had no approval attempted that reached it. So this is an invariant of
 * the code, not a fixture — and it says nothing about WHICH rules were compared (only two are seeded, and
 * the matched rule ids are never shown).
 */
export function sodCheckEvidence(status: ApprovalStatus): SodCheckEvidence {
  switch (status) {
    case "pending":
      return { result: "Not yet evaluated", note: "The check runs when an approval is attempted." };
    case "approved":
      return { result: "Passed", note: "A pass means no seeded conflict rule matched. It is recorded with the approving decision." };
    case "blocked":
      return { result: "Conflict detected", note: "The request was blocked. The matched rule is not shown." };
    case "rejected":
      return { result: "Not evaluated", note: "Rejecting a request does not run this check." };
    case "expired":
      return { result: "Not evaluated", note: "No approval reached the check before the request expired." };
  }
}

export interface DecisionEvidence {
  /** What IAM-02 holds as a decision for this request. */
  recorded: string;
  /** Present only when a decision row exists (approved / rejected). */
  decidedAt: string | null;
  reason: string | null;
  note: string | null;
}

/**
 * The decision evidence for a request. `approval_decision` holds one row per approve/reject decision; a
 * `blocked` request has NO decision row (the conflict returns before the insert — its evidence is the
 * `sod_check` row and an audit event), and an `expired` or `pending` one has none either. The deciding user
 * is an opaque id that no read returns, so it is never shown; the reason is optional free text and appears
 * only as "No reason recorded" for a decided request.
 */
export function decisionEvidence(request: DemoApprovalRequest): DecisionEvidence {
  switch (request.status) {
    case "approved":
      return {
        recorded: "Approval recorded",
        decidedAt: request.completedAtUtc ? formatRequestDateTime(request.completedAtUtc) : null,
        reason: request.decisionReason ?? "No reason recorded",
        note: "The deciding user is recorded by IAM-02 as an opaque user id and is not shown.",
      };
    case "rejected":
      return {
        recorded: "Rejection recorded",
        decidedAt: request.completedAtUtc ? formatRequestDateTime(request.completedAtUtc) : null,
        reason: request.decisionReason ?? "No reason recorded",
        note: "The deciding user is recorded by IAM-02 as an opaque user id and is not shown.",
      };
    case "blocked":
      return {
        recorded: "None",
        decidedAt: null,
        reason: null,
        note: "No approval decision was recorded. The segregation-of-duties check that blocked the request is recorded separately.",
      };
    case "expired":
      return { recorded: "None", decidedAt: null, reason: null, note: "No decision was recorded before the request expired." };
    case "pending":
      return { recorded: "None", decidedAt: null, reason: null, note: "No decision has been recorded yet." };
  }
}

/** What every request takes today — `approval_policy` has no seeded row (`DEFAULT_APPROVAL_POLICY`). */
export const APPROVAL_REQUIREMENT_DEFAULTS = {
  policy: "None — defaults apply",
  stepUp: DEFAULT_APPROVAL_POLICY.requiresStepUp ? "Required" : "Not required",
  expiryWindow: `${DEFAULT_APPROVAL_POLICY.expiryHours} hours from request`,
} as const;

/** The Compliance Overview's link to this page (the route is the nav label's slug). */
export const APPROVAL_QUEUE_HREF = "/admin/approval-queue";
