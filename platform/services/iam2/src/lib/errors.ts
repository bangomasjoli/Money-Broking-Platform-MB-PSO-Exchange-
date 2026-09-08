/**
 * IAM-02 domain error catalogue (blueprint `09_Error_Handling.md` §2 code/severity table).
 *
 * Same rationale as `services/iam/src/lib/errors.ts` (mirrored, not imported — F3(c)):
 * `@aix/foundation`'s `AppError` is intentionally closed over `FndErrorCode`, and generic/
 * shared codes (VALIDATION_ERROR, SERVICE_IDENTITY_REQUIRED, NOT_FOUND, INTERNAL_ERROR,
 * CONFIGURATION_INVALID, IDEMPOTENCY_KEY_REQUIRED, ...) are still constructed via the real
 * foundation `AppError`. IAM-02-specific codes NOT in the foundation catalogue get their own
 * small parallel error type here, carrying the exact same on-wire shape
 * (`{code, message, details}` + `http`), so the request-context error handler can treat both
 * uniformly.
 *
 * Scope for THIS stage (Phases 0-2 only): only the codes this stage's routes/guard can
 * actually throw are included, per the task brief. `09_Error_Handling.md` §2 lists a much
 * larger catalogue (approval/SoD/delegation/break-glass/decision-token/protected-action
 * codes) that belongs to later phases (3-7) — those are deliberately NOT added yet so the
 * catalogue-completeness test has a real, checkable meaning for this stage rather than
 * asserting against speculative codes with no code path that throws them.
 *
 * `IAM2_SOD_CONFLICT` is included now (per the task brief) even though Phase 2's SoD step is
 * a no-op fall-through this stage (Phase 4 builds real enforcement) — it is defined so the
 * catalogue is ready, but no code path throws it yet.
 *
 * Design note on "throw" vs "return as data": `04_API_Specification.md` §2.1 documents
 * `POST /internal/iam2/permission/check` as returning `decision`/`reason` inside a normal
 * `200 success:true` envelope even for deny/step_up_required/approval_required outcomes — a
 * permission decision is a legitimate ANSWER, not a request failure, so the guard does not
 * throw an HTTP error for those. Most codes below are therefore surfaced as the stable
 * `reason` string inside that 200 response (see `lib/guard.ts`), not as thrown `Iam2Error`s —
 * "stable error codes" (`09_Error_Handling.md` §1 rule 4) applies to the reason vocabulary
 * regardless of whether it travels via an error envelope or a decision envelope. The
 * `Iam2Error` class/HTTP-throw mechanics exist for genuine request failures (and for later
 * phases' mutating admin endpoints — role/permission CRUD, approvals — which DO need a
 * non-2xx response); this stage's only route (`permission/check`) does not throw any of
 * these itself, which is why `IAM2_ROLE_UNKNOWN`/`IAM2_SOD_CONFLICT`/
 * `IAM2_PERMISSION_CACHE_STALE` are defined-but-currently-unreachable — see their individual
 * comments and `lib/guard.ts`.
 *
 * `IAM2_ROLE_UNKNOWN` is explicitly reserved: per the task brief, an actor with zero
 * `iam2.user_role` rows is NOT this case (that is ordinary default-deny, step 11) — this
 * code is for a genuinely unknown/orphaned role reference. Phase 2 never raised it (the
 * `user_role.role_id -> role.role_id` join is FK-enforced); Phase 3-5 gives it its first real
 * caller — `routes/roles.ts`'s role-assignment endpoint throws it when the given `role_code`
 * does not resolve to an active `iam2.role` row.
 *
 * HTTP status choices below are not specified by the blueprint (it lists codes + severity,
 * not transport status) — these are sensible defaults per `09_Error_Handling.md` §2's
 * severity/message-style column, consistent with IAM-01's own judgment calls for its
 * equivalent table.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 3-5 ADDITIONS
 * ---------------------------------------------------------------------------------------
 * The codes from here down are new this stage. Most are lifted verbatim from
 * `09_Error_Handling.md` §2's catalogue (which stage 1 deliberately left out because nothing
 * in Phase 0-2 could throw them yet) — `IAM2_SELF_APPROVAL_BLOCKED`, `IAM2_APPROVAL_EXPIRED`,
 * `IAM2_STEP_UP_INVALID`, `IAM2_PAYLOAD_HASH_MISMATCH`, `IAM2_DECISION_TOKEN_INVALID`,
 * `IAM2_DECISION_TOKEN_STALE`. Two are bespoke additions NOT in the blueprint's fixed
 * catalogue, same class as IAM-01's own `AUTH_SESSION_POLICY_UNAVAILABLE` "defensive
 * addition" judgment call:
 *   - `IAM2_APPROVAL_ALREADY_DECIDED` — the blueprint's catalogue has no code for "this
 *     approval has already reached a terminal decision from this approver" (the DB-level
 *     unique `(approval_id, approver_user_id)` constraint conflict case the brief explicitly
 *     asks to be handled as a clean error, not a crash). Modelled on the same generic/blocked
 *     style as its neighbours.
 *   - `IAM2_BOOTSTRAP_TRANSITION_UNAVAILABLE` — the bootstrap-to-RBAC transition is a bespoke
 *     stage-2 design (product-owner-approved, not a blueprint-documented flow at all), so the
 *     blueprint's catalogue naturally has no corresponding code. Per the approved design, every
 *     failure mode of that endpoint (flag off, wrong/missing assertion, wrong admin, already
 *     consumed) collapses to this ONE generic code/message — deliberately not distinguishing
 *     which condition failed, mirroring IAM-01's own generic-message discipline for its
 *     equivalent security-sensitive flows.
 */
import type { ErrorDetail } from "@aix/foundation";

export interface Iam2ErrorSpec {
  http: number;
  message: string;
}

export const IAM2_ERROR_CODES = {
  // High severity, generic message (§09 Error Handling §2/§4).
  IAM2_PERMISSION_DENIED: { http: 403, message: "You are not authorised to perform this action." },
  // High severity, generic message. Fail-closed: unknown permission code (§09 §3 rule 1).
  IAM2_PERMISSION_UNKNOWN: { http: 403, message: "You are not authorised to perform this action." },
  // Medium severity, generic message. Fail-closed: unknown role reference (§09 §3 rule 2).
  // Not reachable this stage — see class-level comment above.
  IAM2_ROLE_UNKNOWN: { http: 403, message: "You are not authorised to perform this action." },
  // Critical severity, "Blocked" style. Licence-lock supremacy (§5.12) — never overridable.
  IAM2_LICENCE_LOCKED_PERMISSION: { http: 403, message: "This feature is not available." },
  // Critical/High severity, "Blocked" style. Defined now per the task brief (blueprint
  // catalogue item) even though Phase 4 builds real SoD enforcement; no code path throws
  // this yet in this stage (step 5 of the guard is a documented no-op fall-through).
  IAM2_SOD_CONFLICT: { http: 403, message: "This action cannot be completed due to control restrictions." },
  // High severity, "Additional verification required" style.
  IAM2_STEP_UP_REQUIRED: { http: 403, message: "Additional verification is required." },
  // Medium severity, "Action required" style.
  IAM2_APPROVAL_REQUIRED: { http: 403, message: "Approval is required before this action can proceed." },
  // High severity, "Retry/re-auth required" style. Not actually reachable this stage (Phase 2
  // treats a missing cache-version row as version 0 / not-yet-initialised, NOT a failure —
  // see guard.ts) but defined now per the task brief's required-codes list.
  IAM2_PERMISSION_CACHE_STALE: { http: 409, message: "Please retry; re-authentication may be required." },

  // ---- Phase 3-5 additions (see class-level comment above) ----
  // Critical/High severity, generic/blocked style. Maker == approver on the SAME approval.
  IAM2_SELF_APPROVAL_BLOCKED: { http: 403, message: "You cannot approve your own request." },
  // Medium severity. Approval passed its expires_at_utc while still pending.
  IAM2_APPROVAL_EXPIRED: { http: 410, message: "Approval is required before this action can proceed." },
  // High severity, "Re-auth required" style. IAM-01 verify-assertion returned invalid/expired/
  // wrong-purpose, or was unreachable (fail-closed — see lib/iam01-client.ts).
  IAM2_STEP_UP_INVALID: { http: 401, message: "Please verify your identity again." },
  // Critical severity, "Blocked" style. execute-verify's current_payload_hash did not match
  // the decision token's bound payload_hash — the token is revoked on this outcome.
  IAM2_PAYLOAD_HASH_MISMATCH: { http: 409, message: "This action cannot be completed due to control restrictions." },
  // High severity, "Recheck required" style. Token missing/consumed/expired/revoked.
  IAM2_DECISION_TOKEN_INVALID: { http: 409, message: "Please retry; re-authentication may be required." },
  // High/Critical severity, "Recheck required" style. Token's bound cache_version no longer
  // matches the actor's current permission_cache_version (a role/permission mutation happened
  // after the decision was made) — the token is NOT consumed on this outcome (it can be
  // re-evaluated once the caller re-checks permissions).
  IAM2_DECISION_TOKEN_STALE: { http: 409, message: "Please retry; re-authentication may be required." },
  // Bespoke addition (not in blueprint catalogue) — see class-level comment. HTTP 409:
  // this approval decision request conflicts with an already-recorded decision.
  IAM2_APPROVAL_ALREADY_DECIDED: { http: 409, message: "This approval has already been decided." },
  // Bespoke addition (not in blueprint catalogue) — see class-level comment. Deliberately the
  // SAME generic message/code for every failure mode of the bootstrap-transition endpoint.
  IAM2_BOOTSTRAP_TRANSITION_UNAVAILABLE: { http: 403, message: "This operation is not available." },
} as const satisfies Record<string, Iam2ErrorSpec>;

export type Iam2ErrorCode = keyof typeof IAM2_ERROR_CODES;

export class Iam2Error extends Error {
  readonly code: Iam2ErrorCode;
  readonly http: number;
  readonly details: ErrorDetail[];

  constructor(code: Iam2ErrorCode, opts?: { message?: string; details?: ErrorDetail[]; cause?: unknown }) {
    const spec = IAM2_ERROR_CODES[code];
    super(opts?.message ?? spec.message);
    this.name = "Iam2Error";
    this.code = code;
    this.http = spec.http;
    this.details = opts?.details ?? [];
    if (opts?.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}
