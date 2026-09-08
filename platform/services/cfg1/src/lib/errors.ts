/**
 * CFG-01 domain error catalogue.
 *
 * Same rationale as `services/iam2/src/lib/errors.ts` / `services/sec1/src/lib/errors.ts`
 * (mirrored, not imported — F3(c)): `@aix/foundation`'s `AppError` is intentionally closed
 * over `FndErrorCode`, and CFG-01-specific codes not in the shared foundation catalogue get
 * their own small parallel error type here, carrying the exact same on-wire shape
 * (`{code, message, details}` + `http`), so the request-context error handler can treat both
 * uniformly.
 *
 * Phase 0/1 kept this catalogue EMPTY ("only add codes this stage's routes can actually
 * throw" — IAM-02's own header comment, repeated by SEC-01). Phase 2 is the first stage with
 * routes that can genuinely throw CFG-01-specific errors (`routes/features.ts`'s `evaluate`/
 * `verify-decision`), so real codes land here now.
 *
 * DESIGN CHOICE, carried forward from Phase 0/1 (not revisited): guard/config/boot failures
 * still reuse the SHARED `@aix/foundation` generic codes (`SERVICE_IDENTITY_REQUIRED`,
 * `CONFIGURATION_INVALID`, `VALIDATION_ERROR`) rather than CFG-01-specific duplicates for the
 * identical semantic — no `CFG1_INTERNAL_UNAUTHORISED` was added.
 *
 * DESIGN CHOICE — evaluate()'s ORDINARY deny outcomes (prohibited, unknown feature, stale
 * requested version) are NOT thrown errors. They are returned inside a normal `200` response
 * body as `{decision: "deny", reason_code: "..."}`, mirroring IAM-02's own
 * `permission/check` precedent ("a permission decision is a legitimate ANSWER, not a request
 * failure" — IAM-02 `lib/errors.ts` header comment) and the blueprint's own
 * `04_API_Specification.md` §2.1 response shape (one `decision` field covering
 * allow/deny/locked/prohibited/unknown_fail_closed/stale_revalidate under one 200, never a
 * different HTTP status per reason). `CFG1_FEATURE_DENIED` below is catalogued per the
 * blueprint but NOT currently thrown by any Phase 2 code path for exactly this reason —
 * defined-but-not-yet-reachable, the same class as IAM-02's own `IAM2_ROLE_UNKNOWN`.
 *
 * DESIGN CHOICE — `verify-decision`, by contrast, THROWS on every non-success outcome (token
 * invalid/expired/revoked/binding-mismatch), mirroring IAM-02's `execute-verify` (which throws
 * `Iam2Error(result.reasonCode)`, not a 200 report) rather than `permission/check`. The
 * distinguishing principle: `evaluate` is advisory (the caller is asking a question);
 * `verify-decision` GATES something (the caller's real question is binary "can I proceed
 * using this decision", which a non-2xx response answers more directly than an embedded
 * boolean).
 *
 * DESIGN CHOICE — `CFG1_CONFIG_INTEGRITY_FAILED` is thrown, not embedded as a `deny` reason.
 * The blueprint's own precedence list places "config integrity mismatch" at step 9 (after
 * prohibited/licence checks), but this implementation runs the integrity check FIRST,
 * unconditionally, before any precedence step: if the integrity check itself cannot be
 * trusted, NOTHING read from `cfg1.prohibited_feature`/`cfg1.licence_profile` afterward can be
 * trusted either — the whole point of the check is to validate those exact tables. Evaluating
 * "is this feature prohibited" using data that has already failed integrity verification
 * would be reading from a source the module itself just proved untrustworthy. This is a
 * deliberate, documented reordering from the blueprint's literal step numbering in favour of
 * the stricter interpretation.
 */
import type { ErrorDetail } from "@aix/foundation";

export interface Cfg1ErrorSpec {
  http: number;
  message: string;
}

export const CFG1_ERROR_CODES = {
  // Critical severity. Thrown by evaluate() when verifyDecisionTimeIntegrity() reports
  // "failed" — runs before any precedence step; see class-level comment.
  CFG1_CONFIG_INTEGRITY_FAILED: { http: 503, message: "This feature is not available." },
  // Medium severity. Catalogued per the blueprint's 09_Error_Handling.md; NOT currently
  // thrown — see class-level comment (ordinary denials are 200 decision reports).
  CFG1_FEATURE_DENIED: { http: 403, message: "This feature is not available." },
  // High severity, generic "recheck required" style — mirrors IAM2_DECISION_TOKEN_INVALID.
  // Not-found, wrong-status (other than already-revoked, which gets its own code below), or
  // structurally malformed token.
  CFG1_DECISION_TOKEN_INVALID: { http: 409, message: "Please retry; re-authentication may be required." },
  // High severity. The token's own expires_at_utc has passed.
  CFG1_DECISION_TOKEN_EXPIRED: { http: 409, message: "Please retry; re-authentication may be required." },
  // High severity. The token was already revoked by an earlier mismatch — a distinct code
  // from DECISION_TOKEN_INVALID so an operator reading logs/metrics can tell "never existed
  // in this shape" apart from "existed, then got burned by a mismatch".
  CFG1_DECISION_TOKEN_REVOKED: { http: 409, message: "Please retry; re-authentication may be required." },
  // Critical severity, "blocked" style — mirrors IAM2_PAYLOAD_HASH_MISMATCH /
  // decision_token_binding_mismatch. A presented field (or the recomputed payload_hash) did
  // not match what the token was actually issued for. Revokes the token (approved decision
  // #3) so a corrected retry with the SAME token can never succeed.
  CFG1_DECISION_BINDING_MISMATCH: { http: 409, message: "This action cannot be completed due to control restrictions." },
  // Critical severity, fail-closed. The decision-log write and the transaction-coupled
  // publishAudit call are ONE atomic transaction (approved decisions #10/#11) — if either
  // fails, NO decision (allow or deny) is ever returned; this is the code that surfaces that.
  CFG1_AUDIT_REQUIRED: { http: 503, message: "This feature is not available." },
  // High severity, fail-closed. The DB/decision engine itself could not be reached at all
  // (getPool() throws / a query fails before any decision logic ran) — mirrors the
  // db_unavailable reason readiness already reports, but as a genuine thrown error here since
  // evaluate/verify-decision are action-oriented endpoints, not a passive status report.
  CFG1_DECISION_ENGINE_UNAVAILABLE: { http: 503, message: "This feature is not available." },

  // ---------------------------------------------------------------------------------------
  // Phase 3A — feature/licence mutation workflow.
  // ---------------------------------------------------------------------------------------
  // Critical severity, blueprint code (09_Error_Handling.md). Thrown by the request AND apply
  // routes when the target feature_code is either directly listed in cfg1.prohibited_feature or
  // structurally Exchange-shaped (lib/decision.ts's isFeatureMutationBlocked) — a mutation must
  // never be the path through which a prohibited/Exchange feature becomes reachable.
  CFG1_FEATURE_PROHIBITED: { http: 403, message: "This feature is not available." },
  // High severity. Baseline IAM-02 permission/check denial (unavailable, deny, or malformed
  // response are ALL collapsed to this single code — fail-closed, mirrors SEC-01's own
  // SEC1_UNAUTHORISED_ALERT_ACTION precedent for the identical dependency shape).
  CFG1_MUTATION_UNAUTHORISED: { http: 403, message: "This feature is not available." },
  // High severity, fail-closed. Thrown by an APPLY route when no approval_id/decision_token was
  // presented, or IAM-02's execute-verify reported ANY failure (invalid/expired/revoked token,
  // binding mismatch, payload-hash mismatch, stale cache version, or IAM-02 itself unreachable)
  // — every one of those collapses to this single code, mirroring SEC-01's own
  // SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED precedent for the identical dependency shape.
  // The underlying IAM-02 reason is preserved only in the audit event's metadata, never surfaced
  // to the caller as a distinct HTTP-visible code.
  CFG1_MUTATION_APPROVAL_REQUIRED: { http: 409, message: "This action cannot be completed due to control restrictions." },
  // Medium severity. An APPLY was called against a change_id whose status is not 'requested'
  // (already applied/failed, or a not-yet-reachable status) — distinct from AppError("NOT_FOUND")
  // for a change_id that does not exist at all.
  CFG1_CHANGE_REQUEST_INVALID_STATE: { http: 409, message: "Please retry; re-authentication may be required." },
  // Critical severity, fail-closed. The reseal step (lib/integrity-seal.ts's resealScope) itself
  // failed — e.g. more than one active seal was found for the scope being resealed. Because
  // resealScope runs on the SAME transaction as the state write and the audit publish, this
  // rolls back the whole mutation; no state change is ever left committed with a stale/missing
  // seal.
  CFG1_RESEAL_FAILED: { http: 503, message: "This feature is not available." },

  // ---------------------------------------------------------------------------------------
  // Phase 3B — kill-switch workflow.
  // ---------------------------------------------------------------------------------------
  // High severity, blueprint code (09_Error_Handling.md, 08_Audit_Log_Events.md). Thrown by
  // verify-decision when a live cfg1.kill_switch check (lib/kill-switch.ts's
  // isKillSwitchActiveForFeature) finds an active kill-switch for the token's bound
  // feature_code — the token is revoked in the same call (lib/decision-token.ts).
  CFG1_TOKEN_REVOKED_BY_KILL_SWITCH: { http: 409, message: "This action cannot be completed due to control restrictions." },
  // Medium severity. The activation route found an already-active kill-switch for the target
  // feature_code (the partial unique index cfg1_kill_switch_one_active_per_feature is the
  // structural backstop; this is the friendly, pre-checked path under a FOR UPDATE lock).
  CFG1_KILL_SWITCH_ALREADY_ACTIVE: { http: 409, message: "Please retry; re-authentication may be required." },
  // Medium severity. A deactivation-request or deactivation-apply was attempted against a
  // feature_code / kill_switch_id with no currently active kill-switch.
  CFG1_KILL_SWITCH_NOT_ACTIVE: { http: 409, message: "Please retry; re-authentication may be required." },
  // High severity. Approved decisions #6/#7 — the deactivation-request PROPOSER may not be the
  // SAME actor who activated the kill-switch (partial SoD mitigation; the residual gap — an
  // activator later approving someone ELSE's deactivation request — is not detectable by
  // CFG-01 with the current IAM-02 execute-verify contract, and is a documented carry-forward,
  // not something this code path can close).
  CFG1_KILL_SWITCH_SELF_DEACTIVATION_BLOCKED: { http: 403, message: "This action cannot be completed due to control restrictions." },
} as const satisfies Record<string, Cfg1ErrorSpec>;

export type Cfg1ErrorCode = keyof typeof CFG1_ERROR_CODES;

export class Cfg1Error extends Error {
  readonly code: Cfg1ErrorCode;
  readonly http: number;
  readonly details: ErrorDetail[];

  constructor(code: Cfg1ErrorCode, opts?: { message?: string; details?: ErrorDetail[]; cause?: unknown }) {
    const spec = CFG1_ERROR_CODES[code];
    super(opts?.message ?? spec.message);
    this.name = "Cfg1Error";
    this.code = code;
    this.http = spec.http;
    this.details = opts?.details ?? [];
    if (opts?.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}
