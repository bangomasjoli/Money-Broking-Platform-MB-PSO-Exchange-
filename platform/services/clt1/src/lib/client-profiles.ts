/**
 * CLT-01 Phase 8 — pure client_profile lifecycle state logic. No DB access, no HTTP —
 * routes/client-profiles.ts is the only caller. Kept pure and DB-free so every rule here is
 * unit-testable without a database, same discipline lib/mandates.ts / lib/duplicate-candidates.ts
 * already established.
 *
 * Reachable statuses this phase: `active_limited` (existing, Phase 2) plus `suspended`/`closed`
 * (newly reachable). `client_profile.status`'s own CHECK constraint (migration 020) has permitted
 * `suspended`/`closed` — and also `active`/`restricted`/`pending` — since Phase 1, for
 * forward-compat; this module deliberately never targets `active`/`restricted`/`pending` — no
 * function here can ever resolve one as a target status.
 *
 * Allowed transitions (approved Phase 8 design decisions):
 *   active_limited -> suspended   (suspend)
 *   suspended      -> active_limited (reactivate)
 *   active_limited -> closed      (close)
 *   suspended      -> closed      (close)
 * `closed` is terminal — no function here ever returns `closed` as a valid FROM status.
 */
import { Clt1Error } from "./errors.js";

export const CLIENT_PROFILE_LIFECYCLE_ACTIONS = ["suspend", "reactivate", "close"] as const;
export type ClientProfileLifecycleAction = (typeof CLIENT_PROFILE_LIFECYCLE_ACTIONS)[number];

export const CLIENT_PROFILE_REACHABLE_STATUSES = ["active_limited", "suspended", "closed"] as const;
export type ClientProfileReachableStatus = (typeof CLIENT_PROFILE_REACHABLE_STATUSES)[number];

/** FROM-status -> allowed action set. `closed` has no entry — every lookup on it falls through to
 * the empty-set default and every action is rejected, enforcing the terminal-state rule uniformly
 * rather than special-casing `closed` in each branch. */
const ALLOWED_TRANSITIONS: Record<string, ReadonlySet<ClientProfileLifecycleAction>> = {
  active_limited: new Set(["suspend", "close"]),
  suspended: new Set(["reactivate", "close"]),
};

/** suspend -> suspended, reactivate -> active_limited, close -> closed. */
const TARGET_STATUS: Record<ClientProfileLifecycleAction, ClientProfileReachableStatus> = {
  suspend: "suspended",
  reactivate: "active_limited",
  close: "closed",
};

export function targetStatusForAction(action: ClientProfileLifecycleAction): ClientProfileReachableStatus {
  return TARGET_STATUS[action];
}

/** Throws CLT1_CLIENT_PROFILE_INVALID_STATE if `action` is not allowed from `currentStatus` —
 * covers both a genuinely illegal transition (e.g. reactivate from active_limited) and the
 * terminal-state rule (any action from closed). */
export function validateClientProfileTransition(currentStatus: string, action: ClientProfileLifecycleAction): void {
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.has(action)) {
    throw new Clt1Error("CLT1_CLIENT_PROFILE_INVALID_STATE", {
      details: [{ field: "status", issue: `cannot ${action} a client_profile with status=${currentStatus}` }],
    });
  }
}

/** reason is required for suspend and close, optional for reactivate (approved Phase 8 design
 * decision 12) — throws the shared foundation VALIDATION_ERROR, same discipline
 * lib/mandates.ts's validateMandateRules / lib/related-party-edges.ts's validateNotSelfReference
 * already established for a locally-enforced request-shape rule. */
export function validateLifecycleReason(action: ClientProfileLifecycleAction, reason: string | undefined): void {
  if ((action === "suspend" || action === "close") && (!reason || reason.trim().length === 0)) {
    throw new Clt1Error("CLT1_CLIENT_PROFILE_INVALID_STATE", {
      details: [{ field: "reason", issue: `reason is required for ${action}` }],
    });
  }
}

export function lifecycleDecisionPayload(row: { decision_id: string; client_id: string; decision_type: ClientProfileLifecycleAction; requested_by: string }): Record<string, unknown> {
  return { decision_id: row.decision_id, client_id: row.client_id, decision_type: row.decision_type, requested_by: row.requested_by };
}

/** Non-PII projection of the lifecycle-response shape — never requested_by/approval_id/
 * decision_token_hash/reason/evidence_ref (approved Phase 8 design decision). */
export function safeLifecycleResponse(row: { client_id: string; status: string; decision_id: string }): Record<string, unknown> {
  return { client_id: row.client_id, status: row.status, decision_id: row.decision_id };
}
