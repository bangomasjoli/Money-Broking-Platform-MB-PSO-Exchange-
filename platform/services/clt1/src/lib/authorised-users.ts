/**
 * CLT-01 Phase 3 — pure authorised-user state-transition and gate-interpretation logic. No DB
 * access, no HTTP — routes/authorised-users.ts is the only caller. Kept pure and DB-free so every
 * rule here is unit-testable without a database, same discipline lib/applications.ts and
 * lib/outcomes.ts already established.
 *
 * `role` is the blueprint's own real enum (`05_Database_Design.md` §2.4) — `client_admin`/
 * `client_maker`/`client_approver`/`viewer`. `status` is the blueprint's own real enum —
 * `active`/`inactive`/`suspended`/`revoked` — with no `pending` value: mirroring `client_profile`,
 * a row is only ever inserted directly at `status='active'` by `add/apply`; there is nothing to
 * be pending on the row itself.
 */
import { Clt1Error } from "./errors.js";

export const AUTHORISED_USER_ROLES = ["client_admin", "client_maker", "client_approver", "viewer"] as const;
export type AuthorisedUserRole = (typeof AUTHORISED_USER_ROLES)[number];

export const AUTHORISED_USER_STATUSES = ["active", "inactive", "suspended", "revoked"] as const;
export type AuthorisedUserStatus = (typeof AUTHORISED_USER_STATUSES)[number];

export interface AuthorisedUserRow {
  authorised_user_id: string;
  client_id: string;
  user_reference: string;
  role: AuthorisedUserRole;
  status: AuthorisedUserStatus;
  approval_id: string | null;
  requested_by: string;
  version: number;
  created_at_utc: string;
  updated_at_utc: string;
  /** Authenticated Principal -> Client Membership Authority (frozen architecture): OPTIONAL
   * binding to an IAM `user_id`. NULL means an UNBOUND, still-valid governed CLT record (a
   * declared signatory with no platform IAM account) that never resolves through the
   * authenticated-principal membership route. Never runtime-updatable after INSERT — the
   * column-scoped UPDATE grant on this table deliberately omits it; identity correction is a
   * governed remove -> new add/request, never an in-place rebind. */
  iam_user_id: string | null;
}

/**
 * Non-PII projection of an authorised_user row (approved Phase 3 design decision: `user_reference`
 * is stored but never returned by the default list route) — the single choke point every route
 * response passes through, mirroring `safeApplicationResponse`'s own discipline exactly.
 */
export function safeAuthorisedUserResponse(row: AuthorisedUserRow): Record<string, unknown> {
  return {
    authorised_user_id: row.authorised_user_id,
    client_id: row.client_id,
    role: row.role,
    status: row.status,
    version: row.version,
    created_at_utc: row.created_at_utc,
    updated_at_utc: row.updated_at_utc,
  };
}

/** Throws CLT1_SELF_APPROVAL_BLOCKED if the requester's declared identity is the same as the
 * person being added — blueprint SoD spirit (both directions of signing-authority change are
 * abuse-prone), applied the only way CLT-01 can check it locally: exact declared-identity match,
 * same weak-but-real check Phase 2 already applies to `assigned_reviewer` vs. `requested_by`. */
export function requireNotSelfAdd(requestedBy: string, userReference: string): void {
  if (requestedBy === userReference) {
    throw new Clt1Error("CLT1_SELF_APPROVAL_BLOCKED");
  }
}

/** Throws CLT1_AUTHORISED_USER_INVALID_STATE if `currentStatus` does not allow `action`. */
export function validateAuthorisedUserTransition(currentStatus: AuthorisedUserStatus, action: "suspend" | "reactivate" | "remove"): void {
  const allowed: Record<typeof action, readonly AuthorisedUserStatus[]> = {
    suspend: ["active"],
    reactivate: ["suspended"],
    remove: ["active", "suspended"],
  } as const;
  if (!allowed[action].includes(currentStatus)) {
    throw new Clt1Error("CLT1_AUTHORISED_USER_INVALID_STATE", {
      details: [{ field: "status", issue: `cannot perform '${action}' on an authorised user in status '${currentStatus}'` }],
    });
  }
}

export function authorisedUserNotFound(): never {
  throw new Clt1Error("CLT1_AUTHORISED_USER_NOT_FOUND");
}

// -------------------------------------------------------------------------------------------
// Authenticated Principal -> Client Membership Authority — pure projection + conflict-detection
// logic for the new `GET /internal/clt1/principals/:iam_user_id/client-memberships` seam. The
// resolution SQL itself lives in routes/principal-memberships.ts (this file stays DB-free, per
// this file's own established discipline — see header comment).
// -------------------------------------------------------------------------------------------

/** One row of the resolution join: an authorised_user row (already filtered to
 * `iam_user_id = <route param>` AND `status = 'active'`) joined to its client_profile's own
 * `status` (already filtered to `active`/`active_limited`). */
export interface AuthorisedUserMembershipRow {
  client_id: string;
  authorised_user_id: string;
  role: AuthorisedUserRole;
  status: AuthorisedUserStatus;
  version: number;
  client_status: string;
}

/**
 * Frozen SIX-key membership item projection (Final Implementation-Exactness Micro-Clarification,
 * Issue 12) — no `user_reference`, no `iam_user_id` per item (echoed once at the response
 * top-level instead), no email/name/KYC/UBO, no IAM token/session data.
 */
export function safeMembershipResponse(row: AuthorisedUserMembershipRow): Record<string, unknown> {
  return {
    client_id: row.client_id,
    authorised_user_id: row.authorised_user_id,
    role: row.role,
    membership_status: row.status,
    membership_version: row.version,
    client_status: row.client_status,
  };
}

/** Detects the specific partial-unique-index violation this table can raise (migration 067's
 * `idx_clt1_authorised_user_one_active_per_iam_client`) so it can be mapped to the existing
 * CLT1_AUTHORISED_USER_INVALID_STATE (409), never a raw/unclassified 23505 — same discipline
 * routes/related-party-edges.ts's own `isDuplicateEdgeViolation` and
 * routes/mandates.ts's own `isDuplicateActiveMandateViolation` already established. */
export function isDuplicateActiveMembershipViolation(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === "23505" && pgErr?.constraint === "idx_clt1_authorised_user_one_active_per_iam_client";
}
