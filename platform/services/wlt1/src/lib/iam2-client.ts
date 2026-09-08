/**
 * WLT-01 -> IAM-02 HTTP client (Phase 4A-1). The ONLY way WLT-01 may consume IAM-02's permission
 * guard or approval/execute-verify surface — never import services/iam2/src/** (F3(c)
 * module-import boundary). This is WLT-01's own fresh copy of CFG-01's/CLT-01's identical pattern
 * (services/cfg1/src/lib/iam2-client.ts, services/clt1/src/lib/iam2-client.ts) — not imported from
 * either, F3(c) applies between every pair of service directories.
 *
 * Wraps two IAM-02 routes:
 *   - `POST /internal/iam2/permission/check` — baseline permission decision (advisory-only, never
 *     itself authorises a mutation). Used by `approve/request`'s own baseline check.
 *   - `POST /internal/iam2/permission/execute-verify` — the approval-to-execution binding check
 *     (services/iam2/src/lib/decision-token.ts). Used ONLY by `approve/apply`
 *     (services/wlt1/src/routes/destination-approval.ts) — the sole WLT-01 action requiring a real
 *     IAM-02-issued decision token bound to a real human actor and the exact approval payload.
 *
 * FAIL-CLOSED, always: a network error, a timeout, a non-2xx response, a malformed/unexpected
 * response body, `execution_authorised !== true` (execute-verify), or a genuinely NEGATIVE
 * `checkPermission` decision (`deny`/`licence_locked`) are ALL treated identically as "not
 * authorised" — never treated as a grant.
 *
 * ---------------------------------------------------------------------------------------
 * `checkPermission`'s BASELINE interpretation — `approval_required`/`step_up_required` also PASS.
 * ---------------------------------------------------------------------------------------
 * `services/iam2/src/lib/guard.ts`'s precedence chain returns `approval_required` (if
 * `permission.requires_approval`) or `step_up_required` (if `permission.requires_step_up`)
 * UNCONDITIONALLY for any permission carrying that flag — before role grants are even looked up.
 * `wlt1.destination.approve_apply` carries `requires_approval = true` (migration
 * `056_iam2_register_wlt1_destination_permissions.cjs`) — by design, so the catalogue itself
 * documents which action is approval-sensitive. The REAL gate for `approve_apply` is always
 * `verifyDecisionToken`/execute-verify (§ above), never this baseline call — `approve/request`'s
 * own baseline call (against `wlt1.destination.approve_request`, which carries
 * `requires_approval = false`) exists only to catch genuine denials (`deny`/`licence_locked`) and
 * IAM-02 unavailability before wasting an approval cycle.
 *
 * WLT-01's own 5000ms timeout convention (mirrors `lib/clt1-client.ts`'s `CLT1_CLIENT_TIMEOUT_MS`)
 * — CFG-01's/CLT-01's own copies of this file set no timeout; WLT-01's own established convention
 * is followed here rather than the omission. No retry loop inside this client (a caller-level
 * retry, if any, is the caller's own decision, never hidden here).
 *
 * Dependency injection for tests: `fetchImpl` lets a test stub this call instead of requiring a
 * live IAM-02 service (Wlt1Config.iam2FetchImpl — never populated from env, test-only) — mirrors
 * `Clt1Config.iam2FetchImpl`/`Cfg1Config.iam2FetchImpl` exactly.
 */
export interface Iam2ClientConfig {
  baseUrl: string;
  internalServiceToken: string;
  /** Test-only DI seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Bounded so a hung/slow IAM-02 can never block a WLT-01 approval route indefinitely. */
const IAM2_CLIENT_TIMEOUT_MS = 5000;

export interface CheckPermissionInput {
  actorId: string;
  sessionId?: string;
  /** Fully-qualified iam2.permission.permission_code, e.g. "wlt1.destination.approve_request". */
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

/** Decisions that PASS WLT-01's baseline check — see this file's header comment for why
 * `approval_required`/`step_up_required` belong here alongside `allow`. Only `deny`/
 * `licence_locked` (and unavailable/malformed) are genuine baseline failures. */
const BASELINE_PASS_DECISIONS = new Set(["allow", "approval_required", "step_up_required"]);

interface Iam2PermissionCheckResponseBody {
  success: boolean;
  data?: { decision: string; reason: string };
}

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
      return { allowed: false, reason: "iam2_unavailable" };
    }

    const body = (await res.json()) as Iam2PermissionCheckResponseBody;
    if (!body?.success || !body.data?.decision) {
      return { allowed: false, reason: "iam2_unavailable" };
    }
    if (!BASELINE_PASS_DECISIONS.has(body.data.decision)) {
      return { allowed: false, reason: body.data.reason };
    }
    return { allowed: true, reason: body.data.reason };
  } catch {
    // Network error / timeout (AbortSignal.timeout firing) / malformed JSON -> fail closed, never
    // treated as success.
    return { allowed: false, reason: "iam2_unavailable" };
  }
}

/**
 * IAM-02's side of the approval-to-execution binding
 * (`services/iam2/src/lib/decision-token.ts`, `POST /internal/iam2/permission/execute-verify`).
 * Used by WLT-01's `approve/apply` route to verify+consume a decision token a maker-checker
 * approval flow already minted via IAM-02's EXISTING generic `/iam2/approvals/request` +
 * `/iam2/approvals/:id/approve` endpoints (run by an operator OUTSIDE WLT-01's own routes, exactly
 * as CLT-01/CFG-01/SEC-01's own precedent) — no new IAM-02 code, no IAM-02 guard change, and
 * WLT-01 never calls `/iam2/approvals/request` itself.
 *
 * IAM-02's execute-verify route THROWS (non-2xx) on any failure — unlike `permission/check`, which
 * always returns 200 with a `decision` field even for a deny. This client therefore treats a
 * non-2xx response the same way `checkPermission` treats an unavailable/erroring call:
 * `authorised: false`, never a grant. The specific IAM-02 reason code (e.g.
 * `IAM2_DECISION_TOKEN_INVALID`, `IAM2_PAYLOAD_HASH_MISMATCH`, `IAM2_DECISION_TOKEN_STALE`) is
 * surfaced when parseable, purely for diagnostics — `routes/destination-approval.ts` collapses ALL
 * of them to a single generic `WLT1_APPROVAL_REQUIRED`, same discipline CLT-01/CFG-01/SEC-01
 * already apply.
 */
export interface VerifyDecisionTokenInput {
  decisionToken: string;
  approvalId?: string;
  /** Must equal the IAM-02 approval's own `maker_user_id` — the decision token IAM-02 mints is
   * bound to the ORIGINAL requester, not the approver. WLT-01 passes the caller-supplied
   * `actor_id` from `approve/apply`'s own request body. */
  actorId: string;
  sessionId?: string;
  /** Fully-qualified iam2.permission.permission_code this token must be bound to. */
  action: string;
  resource: string;
  entityId?: string;
  clientId?: string;
  /** WLT-01's own recomputed `fingerprint()` of the destination's current approval payload — must
   * match the hash bound into the token at approval-creation time exactly, or IAM-02 reports
   * IAM2_PAYLOAD_HASH_MISMATCH and revokes the token. */
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

    if (!res.ok) {
      let reason = "iam2_unavailable";
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
      return { authorised: false, reason: "iam2_unavailable" };
    }
    return { authorised: true };
  } catch {
    return { authorised: false, reason: "iam2_unavailable" };
  }
}
