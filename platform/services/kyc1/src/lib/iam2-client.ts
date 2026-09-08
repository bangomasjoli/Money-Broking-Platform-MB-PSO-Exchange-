/**
 * KYC-01 -> IAM-02 HTTP client (Phase 3A baseline check, Phase 3B execute-verify). The ONLY way
 * KYC-01 may consume IAM-02's permission guard or approval/execute-verify surface — never import
 * `services/iam2/src/**` (F3(c) module-import boundary; the boundary test already forbids `iam2`).
 * This is KYC-01's own fresh copy of AML-01's/CLT-01's/CFG-01's/SEC-01's identical pattern
 * (services/aml1/src/lib/iam2-client.ts) — not imported from any of them, F3(c) applies between
 * every pair of service directories.
 *
 * Wraps TWO IAM-02 routes:
 *   - `POST /internal/iam2/permission/check` — baseline permission decision (advisory-only, never
 *     itself authorises a mutation). Used by the sensitive evidence-read route
 *     (`routes/sensitive-evidence.ts`, Phase 3A) BEFORE the target row is fetched
 *     (permission-before-existence), and by the Phase 3B outcome-override request/apply routes
 *     (`routes/outcome-override.ts`) — catches genuine `deny`/`licence_locked`/IAM-02-outage
 *     before wasting an approval cycle.
 *   - `POST /internal/iam2/permission/execute-verify` — the approval-to-execution binding check
 *     (services/iam2/src/lib/decision-token.ts). Used ONLY by the Phase 3B outcome-override apply
 *     route (`routes/outcome-override.ts`) — the sole KYC-01 action requiring a real
 *     IAM-02-issued decision token bound to a real human actor and the exact mutation payload.
 *
 * FAIL-CLOSED, always: a network error, a request timeout, a non-2xx response, a malformed/
 * unexpected response body, `execution_authorised !== true` (execute-verify), or a genuinely
 * NEGATIVE `checkPermission` decision (`deny`/`licence_locked`) are ALL treated identically as
 * "not authorised" — never treated as a grant. Every call is TIMEOUT-BOUNDED (5s) via
 * `AbortSignal.timeout` so a hung IAM-02 can never hang a KYC-01 route indefinitely.
 *
 * ---------------------------------------------------------------------------------------
 * `checkPermission`'s BASELINE interpretation — `approval_required`/`step_up_required` also PASS.
 * ---------------------------------------------------------------------------------------
 * `services/iam2/src/lib/guard.ts`'s precedence chain returns `approval_required` (if
 * `permission.requires_approval`) or `step_up_required` (if `permission.requires_step_up`)
 * UNCONDITIONALLY for any permission carrying that flag — before role grants are even looked up.
 * `kyc1.outcome.override` carries `requires_approval=true` (migration
 * `046_iam2_register_kyc1_phase3b_permissions.cjs`) — by design, so the catalogue itself documents
 * which action is approval-sensitive. Treating this the same as a real `deny` would make the
 * BASELINE check permanently unsatisfiable for the override request/apply routes — exactly the
 * CFG-01 Phase 3A F-1 shape, defended against here since Phase 3A's own forward-looking coverage
 * (added specifically so this exact permission would not trigger the regression once it landed).
 * The REAL gate for override-apply was always `verifyDecisionToken`/execute-verify (see above),
 * never this baseline call — this baseline call exists only to catch genuine denials
 * (`deny`/`licence_locked`) and IAM-02 unavailability before wasting an approval cycle.
 *
 * Dependency injection for tests: `fetchImpl` lets a test stub this call instead of requiring a
 * live IAM-02 service (Kyc1Config.iam2FetchImpl — never populated from env, test-only) — mirrors
 * every prior module's own `iam2FetchImpl` exactly.
 */
export interface Iam2ClientConfig {
  baseUrl: string;
  internalServiceToken: string;
  /** Test-only DI seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Bounded so a hung/slow IAM-02 can never block a KYC-01 route indefinitely. */
const IAM2_CLIENT_TIMEOUT_MS = 5000;

export interface CheckPermissionInput {
  actorId: string;
  sessionId?: string;
  /** Fully-qualified iam2.permission.permission_code, e.g. "kyc1.evidence.sensitive_read". */
  action: string;
  resource: string;
  entityId?: string;
  clientId?: string;
}

/**
 * `reason` on the denied branch is IAM-02's own public `reason` string verbatim when a real
 * response was received, or the sentinel `"iam2_unavailable"` when the call itself failed
 * (network error / timeout / non-2xx / malformed body) — callers that need to distinguish "IAM-02
 * said no" from "IAM-02 could not be reached" may inspect this value, but BOTH cases are
 * `allowed: false` and must be treated identically for authorization purposes (fail-closed).
 */
export type CheckPermissionResult = { allowed: true; reason: string } | { allowed: false; reason: string };

/** Decisions that PASS KYC-01's baseline check — see this file's header comment for why
 * `approval_required`/`step_up_required` belong here alongside `allow`. Only `deny`/
 * `licence_locked` (and unavailable/malformed) are genuine baseline failures. */
const BASELINE_PASS_DECISIONS = new Set(["allow", "approval_required", "step_up_required"]);

interface Iam2PermissionCheckResponseBody {
  success: boolean;
  data?: { decision: string; reason: string };
}

/** Sentinel reason used for network error / timeout / non-2xx / malformed response — never
 * treated as a grant, only ever surfaced for diagnostics. */
const UNAVAILABLE_REASON_CODE = "iam2_unavailable";

export async function checkPermission(config: Iam2ClientConfig, input: CheckPermissionInput): Promise<CheckPermissionResult> {
  const doFetch = config.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${config.baseUrl}/internal/iam2/permission/check`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": config.internalServiceToken,
      },
      body: JSON.stringify({
        actor_id: input.actorId,
        ...(input.sessionId ? { session_id: input.sessionId } : {}),
        action: input.action,
        resource: input.resource,
        ...(input.entityId ? { entity_id: input.entityId } : {}),
        ...(input.clientId ? { client_id: input.clientId } : {}),
      }),
      signal: AbortSignal.timeout(IAM2_CLIENT_TIMEOUT_MS),
    });

    // Non-2xx -> fail closed. IAM-02's own permission/check route always returns 200 with a
    // decision field (even for a deny) — a non-2xx here means something is structurally wrong,
    // never a legitimate decision to interpret.
    if (!res.ok) {
      return { allowed: false, reason: UNAVAILABLE_REASON_CODE };
    }

    const body = (await res.json()) as Iam2PermissionCheckResponseBody;
    if (!body?.success || !body.data?.decision) {
      return { allowed: false, reason: UNAVAILABLE_REASON_CODE };
    }
    if (!BASELINE_PASS_DECISIONS.has(body.data.decision)) {
      return { allowed: false, reason: body.data.reason };
    }
    return { allowed: true, reason: body.data.reason };
  } catch {
    // Network error / timeout (AbortSignal.timeout firing) / malformed JSON -> fail closed, never
    // treated as success.
    return { allowed: false, reason: UNAVAILABLE_REASON_CODE };
  }
}

/**
 * IAM-02's side of the approval-to-execution binding
 * (`services/iam2/src/lib/decision-token.ts`, `POST /internal/iam2/permission/execute-verify`).
 * Used by the Phase 3B outcome-override apply route (`routes/outcome-override.ts`) to verify+
 * consume a decision token a maker-checker approval flow already minted via IAM-02's EXISTING
 * generic `/iam2/approvals/request` + `/iam2/approvals/:id/approve` endpoints (run by an operator
 * OUTSIDE KYC-01's own routes, exactly as AML-01/CLT-01/CFG-01/SEC-01's own precedent) — no new
 * IAM-02 code, no IAM-02 guard change.
 *
 * IAM-02's execute-verify route THROWS (non-2xx) on any failure — unlike `permission/check`, which
 * always returns 200 with a `decision` field even for a deny. This client therefore treats a
 * non-2xx response the same way `checkPermission` treats an unavailable/erroring call:
 * `authorised: false`, never a grant. The specific IAM-02 reason code (e.g.
 * `IAM2_DECISION_TOKEN_INVALID`, `IAM2_PAYLOAD_HASH_MISMATCH`, `IAM2_DECISION_TOKEN_STALE`) is
 * surfaced when parseable, purely for diagnostics — `routes/outcome-override.ts`'s own apply route
 * collapses ALL of them to a single generic `KYC1_APPROVAL_REQUIRED`, same discipline
 * AML-01/CFG-01/SEC-01/CLT-01 already apply. The ONE reason value treated specially is the
 * `UNAVAILABLE_REASON_CODE` sentinel below (network/timeout/non-2xx-with-unparseable-body/
 * malformed-200-body) — the caller maps THAT specific reason to `KYC1_IAM2_UNAVAILABLE`, every
 * other reason (a genuine IAM-02-issued denial code) to `KYC1_APPROVAL_REQUIRED`.
 */
export interface VerifyDecisionTokenInput {
  decisionToken: string;
  approvalId?: string;
  /** Must equal the IAM-02 approval's own `maker_user_id` — the decision token IAM-02 mints is
   * bound to the ORIGINAL requester, not the approver (services/iam2/src/routes/approvals.ts
   * issues the token with `actorUserId: approval.maker_user_id`). `routes/outcome-override.ts`
   * passes the stored `manual_override_request` row's own `requested_by` value here, never a
   * caller-presented arbitrary actor from the apply request body. */
  actorId: string;
  sessionId?: string;
  /** Fully-qualified iam2.permission.permission_code this token must be bound to. */
  action: string;
  resource: string;
  entityId?: string;
  clientId?: string;
  /** `routes/outcome-override.ts`'s own recomputed `fingerprint()` of the override request's
   * canonical payload — must match the hash bound into the token at approval-creation time
   * exactly, or IAM-02 reports `IAM2_PAYLOAD_HASH_MISMATCH` and revokes the token. Recomputed from
   * the STORED `manual_override_request` row, never from caller-supplied apply-body fields. */
  currentPayloadHash?: string;
}

export type VerifyDecisionTokenResult = { authorised: true } | { authorised: false; reason: string };

interface Iam2ExecuteVerifyResponseBody {
  success: boolean;
  data?: { execution_authorised?: boolean };
}

interface Iam2ErrorResponseBody {
  success?: boolean;
  error?: { code?: string };
}

export async function verifyDecisionToken(config: Iam2ClientConfig, input: VerifyDecisionTokenInput): Promise<VerifyDecisionTokenResult> {
  const doFetch = config.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${config.baseUrl}/internal/iam2/permission/execute-verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": config.internalServiceToken,
      },
      body: JSON.stringify({
        decision_token: input.decisionToken,
        ...(input.approvalId ? { approval_id: input.approvalId } : {}),
        actor_id: input.actorId,
        ...(input.sessionId ? { session_id: input.sessionId } : {}),
        action: input.action,
        resource: input.resource,
        ...(input.entityId ? { entity_id: input.entityId } : {}),
        ...(input.clientId ? { client_id: input.clientId } : {}),
        ...(input.currentPayloadHash ? { current_payload_hash: input.currentPayloadHash } : {}),
      }),
      signal: AbortSignal.timeout(IAM2_CLIENT_TIMEOUT_MS),
    });

    // Non-2xx: IAM-02's execute-verify route throws on any failure, unlike permission/check.
    // Surface the specific IAM-02 error code for diagnostics when parseable; the sentinel
    // otherwise. Both are `authorised: false`, never a grant.
    if (!res.ok) {
      let reason = UNAVAILABLE_REASON_CODE;
      try {
        const body = (await res.json()) as Iam2ErrorResponseBody;
        if (body?.error?.code) reason = body.error.code;
      } catch {
        // Non-JSON/unparseable error body — keep the generic sentinel.
      }
      return { authorised: false, reason };
    }

    const body = (await res.json()) as Iam2ExecuteVerifyResponseBody;
    if (!body?.success || body.data?.execution_authorised !== true) {
      return { authorised: false, reason: UNAVAILABLE_REASON_CODE };
    }
    return { authorised: true };
  } catch {
    // Network error / timeout (AbortSignal.timeout firing) / malformed JSON -> fail closed, never
    // treated as success.
    return { authorised: false, reason: UNAVAILABLE_REASON_CODE };
  }
}
