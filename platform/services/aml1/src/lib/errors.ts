/**
 * AML-01 domain error catalogue.
 *
 * Same rationale as every prior module's own copy (services/clt1/src/lib/errors.ts /
 * services/cfg1/src/lib/errors.ts / services/sec1/src/lib/errors.ts /
 * services/iam2/src/lib/errors.ts, mirrored, not imported — F3(c)): `@aix/foundation`'s
 * `AppError` is intentionally closed over `FndErrorCode`, and AML-01-specific codes not in the
 * shared foundation catalogue get their own small parallel error type here, carrying the exact
 * same on-wire shape (`{code, message, details}` + `http`), so the request-context error handler
 * can treat both uniformly.
 *
 * PHASE 0 — "only add codes this stage's routes can actually throw" (every prior module's own
 * repeated header-comment discipline, applied identically here). Phase 0 registers exactly one
 * route (`GET /internal/aml1/health`), which is unauthenticated and does not query the database —
 * it has no reachable failure mode of its own. Both of Phase 0's actual failure paths reuse
 * shared foundation codes instead of a new AML-01 code:
 *   - guard rejection (a future guarded route, not reachable this phase) -> `SERVICE_IDENTITY_REQUIRED`
 *   - config load failure -> `CONFIGURATION_INVALID`
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 1 additions (point-in-time screening record & deterministic stub adaptor). Each new code
 * maps to exactly one reachable Phase 1 code path (lib/screening.ts / routes/screening.ts /
 * routes/system.ts's readiness route):
 *   - AML1_SERVICE_UNAVAILABLE   — the DB pool was never reachable (`assertPoolAvailable`) or
 *     readiness's own DB probe failed. Mirrors CLT-01's own `CLT1_SERVICE_UNAVAILABLE`.
 *   - AML1_SCREENING_REQUEST_NOT_FOUND — no `screening_request` row for the given
 *     screening_request_id (the GET-by-id read route).
 *   - AML1_SCREENING_SUBJECT_INVALID — `validateScreeningSubject` rejected the request body's
 *     subject: an unsupported `subject_type`, a `provenance` other than the one value Phase 1 is
 *     permitted to write (`declared_identity`), a blank `declared_identity.name`, or a
 *     `declared_identity.date_of_birth` that is malformed (not `YYYY-MM-DD`) or calendrically
 *     impossible (e.g. Feb 30, a non-leap-year Feb 29) — `isValidCalendarDate` in lib/screening.ts.
 *     Shape-level validation (missing/wrong-typed fields) is caught earlier by TypeBox's own
 *     schema check (`VALIDATION_ERROR`) — this code is reserved for the semantic/policy rules
 *     TypeBox can't express cheaply, same split `lib/mandates.ts`'s own `validateMandateRules`
 *     established.
 *   - AML1_SCREENING_PROVIDER_UNAVAILABLE — the deterministic stub adaptor's own
 *     `PROVIDER_DOWN` fixture path fired. The request row is still durably persisted at
 *     `status='failed'` (an attempted-screen audit record) — this is not an audit/outbox failure,
 *     it is the SCREEN itself reporting it could not complete.
 *   - AML1_AUDIT_REQUIRED — the transaction-coupled audit/outbox write itself failed; mirrors
 *     every prior module's own `*_AUDIT_REQUIRED` (no mutation is ever returned without its audit
 *     trail durably committed first).
 *
 * `AML1_SCREENING_REQUEST_INVALID_STATE` was DELIBERATELY NOT ADDED in Phase 1 (screening was
 * entirely synchronous — no request-lifecycle transition step to race against or find in the
 * wrong state). Phase 2A now gives it a real, reachable throw site (see below) — the first
 * request-lifecycle-aware code path in AML-01.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 2A additions (CLT-01 outcome delivery). Each new code maps to exactly one reachable
 * Phase 2A code path (routes/clt-outcome-delivery.ts):
 *   - AML1_SCREENING_REQUEST_INVALID_STATE — a delivery was attempted on a `screening_request`
 *     whose `status` is not `completed` (still `requested`, or `failed`) — there is no screening
 *     result yet to map into a CLT-01 outcome. The first reachable throw site for this code.
 *   - AML1_DELIVERY_NOT_FOUND — no `clt_outcome_delivery` row for the given `delivery_id` (the
 *     GET-by-id read route, and the retry route's initial lookup).
 *   - AML1_DELIVERY_INVALID_STATE — a retry was attempted on a delivery already `status =
 *     'succeeded'` — nothing left to retry (a `pending` or `failed` delivery may be retried).
 *   - AML1_CLT_DELIVERY_FAILED — a genuine, reachable throw site (micro-stabilization pass): once
 *     the two-phase delivery model has already durably recorded a failed attempt (TX2 committed,
 *     `clt_outcome_delivery.status='failed'`, `aml1.clt_outcome_delivery_failed` audited — see
 *     `attemptDelivery`), BOTH `POST .../clt-outcome` and `POST .../retry` re-throw this code to
 *     the caller so a genuine delivery failure is never silently swallowed into a 20x response.
 *     The failed row remains fully queryable (`GET .../clt-outcome-deliveries/:delivery_id`) and
 *     retriable after the throw — the throw only changes what the ORIGINAL caller sees, never what
 *     is persisted. `details` carry only AML-01's own `delivery_id`/`failure_reason_code` evidence,
 *     never a raw CLT-01 response body or any PII.
 *   - AML1_CLT_OUTCOME_NOT_DELIVERABLE — an `authorised_party` subject's screening request has no
 *     `subject_parent_ref` (no parent `client_id` was captured at screening-request creation time),
 *     so CLT-01's party-receipt URL cannot be constructed; also covers a `screening_request` whose
 *     completed screen has no `screening_result` row (a structural invariant violation — should
 *     never occur, guarded defensively).
 *   - AML1_AUDIT_REQUIRED — unchanged, reused for the Phase 2A delivery-insert/update transactions'
 *     own audit/outbox failure, same discipline as every prior module's `*_AUDIT_REQUIRED`.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 2B additions (human match disposition + IAM-02 + sensitive read). Each new code maps to
 * exactly one reachable Phase 2B code path (routes/matches.ts):
 *   - AML1_SCREENING_MATCH_NOT_FOUND — no `screening_match` row for the given
 *     `screening_match_id` (sensitive-detail read, confirm|dismiss/request).
 *   - AML1_MATCH_INVALID_STATE — a disposition action was attempted on a match whose
 *     `match_status` is not `potential_match` (already `confirmed_hit`/`dismissed` — both
 *     terminal), including the race-loser case caught by the apply transaction's own `FOR UPDATE`
 *     re-check.
 *   - AML1_DISPOSITION_NOT_FOUND — no `match_disposition_decision_request` row for the given
 *     `decision_id` at apply time, or the row's `decision_type`/`screening_match_id` does not
 *     match the apply route/params.
 *   - AML1_DISPOSITION_INVALID_STATE — apply was attempted on a decision row whose `status` is
 *     not `requested` (already `applied` — token reuse — or the race-loser case caught by the
 *     apply transaction's own `FOR UPDATE` re-check on the decision row itself).
 *   - AML1_PERMISSION_DENIED — IAM-02's baseline `checkPermission` returned a genuine `deny`/
 *     `licence_locked` (match-inventory read, sensitive-detail read, confirm|dismiss/request,
 *     confirm|dismiss/apply's own baseline re-check).
 *   - AML1_APPROVAL_REQUIRED — IAM-02's `verifyDecisionToken`/execute-verify call returned
 *     `authorised: false` for any reason OTHER than IAM-02 being unreachable (invalid/stale/
 *     tampered token, payload-hash mismatch) — collapsed to one generic code, mirroring CLT-01's
 *     own `CLT1_APPROVAL_REQUIRED` discipline.
 *   - AML1_IAM2_UNAVAILABLE — IAM-02 could not be reached or returned something unparseable
 *     (`reason === "iam2_unavailable"`), distinct from a genuine `AML1_PERMISSION_DENIED` deny or
 *     `AML1_APPROVAL_REQUIRED` rejection. Reachable from BOTH IAM-02 call shapes: the baseline
 *     `checkPermission` (match-inventory read, sensitive-detail read, confirm|dismiss/request,
 *     confirm|dismiss/apply's own baseline re-check) and, as of the Phase 3A Low-1 fix,
 *     `verifyDecisionToken`/execute-verify itself (confirm|dismiss/apply) — an execute-verify call
 *     that cannot reach IAM-02 must be distinguishable from a genuine approval rejection, since the
 *     two require different operator responses (retry later vs. re-request approval).
 *   - AML1_SELF_DISPOSITION_BLOCKED — the disposition requester (`body.requested_by`) equals the
 *     original screening request's own `requested_by` — checked once, at request time, mirroring
 *     CLT-01's own `CLT1_DUPLICATE_SELF_REVIEW_BLOCKED`/`CLT1_SELF_APPROVAL_BLOCKED` precedent
 *     (approved Phase 2B design decision: strict SoD — the normal workflow needs the screener, the
 *     disposition requester, and the IAM-02 approver as three distinct identities, since IAM-02
 *     separately enforces requester != approver unconditionally).
 *
 * DELIBERATELY NOT ADDED (Phase 2B, approved design decision — see the accepted Phase 2B planning
 * report §12): `AML1_SENSITIVE_READ_FORBIDDEN` — the condition is identical to
 * `AML1_PERMISSION_DENIED`, reused instead of adding a new code for the same condition. No
 * vendor/monitoring/revocation/wallet/trading error code of any kind.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 3B addition (two-phase screening lifecycle + provider adaptor boundary). Exactly one new
 * code, with one reachable throw site (`routes/screening.ts`):
 *   - AML1_VENDOR_RESPONSE_INVALID — the provider answered (`kind !== "unavailable"`) but its
 *     response could not be trusted: either the adaptor itself reported `kind: "invalid_response"`
 *     (a malformed/unparseable provider response), or `lib/screening.ts`'s
 *     `normalizeProviderMatches` rejected a raw match whose category falls outside AML-01's closed
 *     `sanctions`/`pep`/`adverse_media` set (never silently bucketed into `adverse_media`, never
 *     silently dropped). Distinct from `AML1_SCREENING_PROVIDER_UNAVAILABLE` (the provider could
 *     not be reached at all) — both map to the SAME `screening_request.status='failed'` durable
 *     outcome (TX2 still commits `screening_provider_attempt.status='failed'` before either throw),
 *     but the two reason codes let an operator tell "vendor down" from "vendor answered something
 *     we cannot trust" apart.
 *
 * `AML1_SCREENING_PROVIDER_UNAVAILABLE` (Phase 1) is REUSED unchanged for the `kind: "unavailable"`
 * case — no new `AML1_VENDOR_UNAVAILABLE` code was added (would duplicate an already-reachable,
 * already-correct code for the identical condition). No `AML1_VENDOR_PROVIDER_DISABLED` (the
 * production-stub boot guard fails at BOOT as `CONFIGURATION_INVALID` — there is no runtime request
 * path, therefore no reachable throw site). No vendor-evidence/rescreen/monitoring/risk-signal error
 * code of any kind — all out of Phase 3B scope.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 3C additions (re-screening triggers + route-triggered monitoring runs + risk-signal
 * emission, confirmed decisions D1-D9). Exactly four new codes, each with a reachable throw site:
 *   - AML1_RESCREEN_NOT_ALLOWED — the loop-prevention/concurrent-duplicate guard fired: a re-screen
 *     was attempted (`routes/rescreen.ts`, or internally by a monitoring run via
 *     `lib/rescreen.ts`'s `performRescreen`) for a `(subject_type, subject_ref)` that already has
 *     an IN-FLIGHT (`status='requested'`) screening request. Reachable two ways: `lib/rescreen.ts`'s
 *     own proactive `SELECT` check (the common case), and — as a race-safe backstop — migration
 *     039's own partial unique index (`idx_aml1_screening_request_one_inflight_per_subject`)
 *     raising a `23505` that `lib/rescreen.ts` maps to the same code. `routes/screening.ts`'s
 *     ORIGINAL (non-re-screen) create route does NOT map this constraint to this code — see that
 *     file's own header comment.
 *   - AML1_MONITORING_RUN_INVALID_STATE — `routes/monitoring.ts`'s finalize step
 *     (`UPDATE aml1.monitoring_run SET status = ... WHERE run_id = $1 AND status = 'running'`)
 *     affected zero rows — the run row was not in the expected `running` state when the SAME
 *     request that created it tried to finalize it. Present-but-defensive (Phase 3D Low-2 wording
 *     correction): this table is written only by the single request that creates+finalizes a given
 *     `run_id`, so under normal operation no OTHER request can ever race this UPDATE — the guard is
 *     a real, reachable, tested throw site at the LIBRARY level (`lib/monitoring.ts`'s
 *     `finalizeMonitoringRun` is exercised directly by its own unit/integration tests), but it is
 *     NOT organically reachable via a normal HTTP request to `POST /internal/aml1/monitoring-runs`
 *     — it exists as defence-in-depth against a future code change (or an operational anomaly this
 *     codebase has not yet identified) that could violate the single-writer assumption, not because
 *     today's route can trigger it end-to-end.
 *   - AML1_RISK_SIGNAL_NOT_FOUND — no `risk_signal` row for the given `signal_id` (the acknowledge
 *     route's initial lookup).
 *   - AML1_RISK_SIGNAL_INVALID_STATE — an acknowledge was attempted on a signal whose `status` is
 *     not `open` (already `acknowledged`, or the race-loser case caught by the acknowledge route's
 *     own atomic `UPDATE ... WHERE status = 'open'` re-check).
 *
 * DELIBERATELY NOT ADDED (Phase 3C, per the confirmed decision list): `AML1_VENDOR_EVIDENCE_NOT_FOUND`,
 * `AML1_VENDOR_EVIDENCE_FORBIDDEN`, `AML1_KYC_PROFILE_NOT_FOUND`, `AML1_TRANSACTION_SCREENING_REQUIRED`,
 * or any wallet/trading/settlement error code — all out of Phase 3C scope. `AML1_MONITORING_RUN_NOT_FOUND`
 * was also deliberately not added — the monitoring-run read route reuses `@aix/foundation`'s own
 * generic `NOT_FOUND` (mirrors CFG-01's own `routes/kill-switches.ts` precedent for an analogous
 * generic-lookup-miss case), since this condition carries no AML-01-specific handling.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 3D additions (stuck requested-screening detection + operator recovery + TX2 concurrency
 * guard, confirmed decisions D1-D6). Exactly three new codes, each with a reachable throw site
 * (`routes/stuck-screening.ts`):
 *   - AML1_STUCK_SCREENING_NOT_FOUND — the recover route's initial lookup found no
 *     `screening_request` row for the given `screening_request_id`.
 *   - AML1_STUCK_SCREENING_INVALID_STATE — a recovery was attempted on a request whose `status` is
 *     not `requested`, or whose latest `screening_provider_attempt.status` is not `pending`
 *     (already `completed`/`failed`, already recovered, or the narrower "requested with a
 *     non-pending latest attempt" shape — see `lib/stuck-screening.ts`'s own header comment;
 *     surfaced in the stuck list as `recoverable=false` but not recoverable this phase). Also the
 *     race-loser case caught by the recover transaction's own `FOR UPDATE` re-check — the SAME
 *     lock `lib/screening-execution.ts`'s TX2 concurrency guard takes, so whichever of a concurrent
 *     recovery/late-TX2-completion commits first wins the race.
 *   - AML1_STUCK_SCREENING_TOO_FRESH — a recovery was attempted on a request whose age is below
 *     the configured `AML1_STUCK_SCREENING_THRESHOLD_SECONDS` — re-checked inside the recovery
 *     transaction itself, never trusting a caller-supplied age or the list route's own snapshot
 *     (confirmed decision D5's own "never rely only on a list route snapshot" requirement).
 *
 * `AML1_SCREENING_REQUEST_INVALID_STATE` (Phase 2A) is REUSED, with a Phase-3D-specific custom
 * `message`, for the TX2 concurrency guard's own abort path (`routes/screening.ts` /
 * `routes/rescreen.ts`, when `lib/screening-execution.ts`'s `completeScreening` returns
 * `{kind:"aborted"}` because the request was recovered as stuck while its provider call was still
 * in flight) — the condition ("this screening request is not in the lifecycle state this action
 * expects") is the same request-lifecycle-state family this code already covers; no new code was
 * added for the identical condition on a different route.
 *
 * DELIBERATELY NOT ADDED (Phase 3D, per the confirmed decision list): `AML1_STUCK_SCREENING_
 * RECOVERY_NOT_ALLOWED`/`_RECOVERY_NOT_FOUND`/`_RECOVERY_INVALID_STATE` (all three would presuppose
 * a separate recovery decision-request table, which Phase 3D does not add — see
 * `lib/stuck-screening.ts`'s own `recoverStuckScreening` header comment for why single-step
 * recovery needs no such table). No vendor/wallet/trading/KYC/Exchange error code of any kind.
 */
import type { ErrorDetail } from "@aix/foundation";

export interface Aml1ErrorSpec {
  http: number;
  message: string;
}

export const AML1_ERROR_CODES = {
  AML1_SERVICE_UNAVAILABLE: { http: 503, message: "AML-01 database is not reachable." },
  AML1_SCREENING_REQUEST_NOT_FOUND: { http: 404, message: "Screening request not found." },
  AML1_SCREENING_SUBJECT_INVALID: { http: 422, message: "The screening subject is invalid." },
  AML1_SCREENING_PROVIDER_UNAVAILABLE: { http: 503, message: "The screening provider is unavailable; the request was not completed." },
  AML1_AUDIT_REQUIRED: { http: 503, message: "Audit/outbox write failed; action rolled back." },
  AML1_SCREENING_REQUEST_INVALID_STATE: { http: 409, message: "The screening request is not in a state that can be delivered to CLT-01." },
  AML1_DELIVERY_NOT_FOUND: { http: 404, message: "CLT-01 outcome delivery not found." },
  AML1_DELIVERY_INVALID_STATE: { http: 409, message: "This delivery has already succeeded and cannot be retried." },
  AML1_CLT_DELIVERY_FAILED: { http: 502, message: "Delivery to CLT-01 failed." },
  AML1_CLT_OUTCOME_NOT_DELIVERABLE: { http: 409, message: "This screening request cannot be delivered to CLT-01." },
  AML1_SCREENING_MATCH_NOT_FOUND: { http: 404, message: "Screening match not found." },
  AML1_MATCH_INVALID_STATE: { http: 409, message: "This match is not in a state that permits this action." },
  AML1_DISPOSITION_NOT_FOUND: { http: 404, message: "Match disposition decision not found." },
  AML1_DISPOSITION_INVALID_STATE: { http: 409, message: "This disposition decision is not in a state that permits this action." },
  AML1_PERMISSION_DENIED: { http: 403, message: "Permission denied." },
  AML1_APPROVAL_REQUIRED: { http: 403, message: "A valid approval decision token is required." },
  AML1_IAM2_UNAVAILABLE: { http: 503, message: "IAM-02 permission guard is not reachable." },
  AML1_SELF_DISPOSITION_BLOCKED: { http: 403, message: "The disposition requester cannot be the same actor who requested the original screening." },
  AML1_VENDOR_RESPONSE_INVALID: { http: 502, message: "The screening provider's response could not be trusted; the request was not completed." },
  AML1_RESCREEN_NOT_ALLOWED: { http: 409, message: "A screening request is already in flight for this subject; re-screening is not allowed until it resolves." },
  AML1_MONITORING_RUN_INVALID_STATE: { http: 409, message: "This monitoring run is not in a state that permits this action." },
  AML1_RISK_SIGNAL_NOT_FOUND: { http: 404, message: "Risk signal not found." },
  AML1_RISK_SIGNAL_INVALID_STATE: { http: 409, message: "This risk signal is not in a state that permits this action." },
  AML1_STUCK_SCREENING_NOT_FOUND: { http: 404, message: "Stuck screening request not found." },
  AML1_STUCK_SCREENING_INVALID_STATE: { http: 409, message: "This screening request is not in a state that permits stuck-screening recovery." },
  AML1_STUCK_SCREENING_TOO_FRESH: { http: 409, message: "This screening request has not been in-flight long enough to be recovered as stuck." },
} as const satisfies Record<string, Aml1ErrorSpec>;

export type Aml1ErrorCode = keyof typeof AML1_ERROR_CODES;

export class Aml1Error extends Error {
  readonly code: Aml1ErrorCode;
  readonly http: number;
  readonly details: ErrorDetail[];

  constructor(code: Aml1ErrorCode, opts?: { message?: string; details?: ErrorDetail[]; cause?: unknown }) {
    const spec = AML1_ERROR_CODES[code];
    super(opts?.message ?? spec.message);
    this.name = "Aml1Error";
    this.code = code;
    this.http = spec.http;
    this.details = opts?.details ?? [];
    if (opts?.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}
