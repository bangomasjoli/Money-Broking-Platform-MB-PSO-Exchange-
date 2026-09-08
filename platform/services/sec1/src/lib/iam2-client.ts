/**
 * SEC-01 -> IAM-02 HTTP client (Phase 4). The ONLY way SEC-01 may consume IAM-02's permission
 * guard — never import services/iam2/src/** (F3(c) module-import boundary). Wraps
 * `POST /internal/iam2/permission/check` (services/iam2/src/routes/internal.ts), guarded by
 * IAM-02's own `x-internal-service-token` header.
 *
 * Uses Node's native `fetch` (no new dependency, per the task brief) — structurally identical
 * to services/iam2/src/lib/iam01-client.ts, SEC-01's own copy of the same pattern.
 *
 * FAIL-CLOSED, always: a network error, a non-2xx response, a malformed/unexpected response
 * body, or any `decision !== "allow"` are ALL treated identically as "not authorised" — never
 * treated as a grant. This is deliberately the SAME discipline IAM-02 already applies to its
 * own IAM-01 dependency (`09_Error_Handling.md`'s "audit unavailable -> action cannot proceed"
 * fail-closed principle, applied here to reads instead of ingestion).
 *
 * Dependency injection for tests: `fetchImpl` lets a test stub this call instead of requiring a
 * live IAM-02 service (see Sec1Config.iam2FetchImpl — never populated from env, test-only) —
 * mirrors Iam2Config.iam01FetchImpl exactly, and is used even by this codebase's own DB-gated
 * integration tests for the equivalent IAM-02 -> IAM-01 dependency (tests/integration/
 * iam2-db.test.ts's makeFakeIam01Fetch), not just unit tests.
 */
export interface Iam2ClientConfig {
  baseUrl: string;
  internalServiceToken: string;
  /** Test-only DI seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface CheckPermissionInput {
  actorId: string;
  sessionId?: string;
  /** Fully-qualified iam2.permission.permission_code, e.g. "sec1.audit_event.search". */
  action: string;
  resource: string;
  entityId?: string;
  clientId?: string;
}

/**
 * `reason` on the denied branch is IAM-02's own public `reason` string verbatim (e.g.
 * "IAM2_PERMISSION_UNKNOWN", "IAM2_PERMISSION_DENIED", "IAM2_STEP_UP_REQUIRED",
 * "IAM2_LICENCE_LOCKED_PERMISSION") when a real response was received, or the sentinel
 * `"iam2_unavailable"` when the call itself failed (network error / non-2xx / malformed body) —
 * callers that need to distinguish "IAM-02 said no" from "IAM-02 could not be reached" may
 * inspect this value, but BOTH cases are `allowed: false` and must be treated identically for
 * authorization purposes (fail-closed).
 */
export type CheckPermissionResult = { allowed: true; reason: string } | { allowed: false; reason: string };

interface Iam2PermissionCheckResponseBody {
  success: boolean;
  data?: { decision: string; reason: string };
}

/**
 * Phase 5 addition — SEC-01's side of IAM-02's approval-to-execution binding
 * (`services/iam2/src/lib/decision-token.ts`, `POST /internal/iam2/permission/execute-verify`).
 * Used ONLY by the Critical-severity alert-closure path (`routes/alerts.ts`) to verify+consume
 * a decision token a maker-checker approval flow already minted via IAM-02's EXISTING generic
 * `/iam2/approvals/request` + `/iam2/approvals/:id/approve` endpoints — no new IAM-02 code, no
 * IAM-02 guard change; this file only adds a THIRD HTTP call alongside `checkPermission`'s
 * existing one, structurally identical in every fail-closed respect.
 *
 * IAM-02's execute-verify route THROWS (non-2xx) on any failure — unlike `permission/check`,
 * which always returns 200 with a `decision` field even for a deny. This client therefore
 * treats a non-2xx response the same way `checkPermission` treats an unavailable/erroring call:
 * `authorised: false`, never a grant. The specific IAM-02 reason code (e.g.
 * `IAM2_DECISION_TOKEN_INVALID`, `IAM2_PAYLOAD_HASH_MISMATCH`, `IAM2_DECISION_TOKEN_STALE`) is
 * surfaced when parseable, purely for diagnostics — `routes/alerts.ts` collapses ALL of them to
 * the single generic `SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED`, same discipline
 * `checkPermission`'s callers already apply for `SEC1_UNAUTHORISED_AUDIT_READ`.
 */
export interface VerifyDecisionTokenInput {
  decisionToken: string;
  approvalId?: string;
  actorId: string;
  sessionId?: string;
  /** Fully-qualified iam2.permission.permission_code this token must be bound to. */
  action: string;
  resource: string;
  entityId?: string;
  clientId?: string;
  /** SEC-01's own recomputed `fingerprint()` of the close payload — must match the hash bound
   * into the token at approval-creation time exactly, or IAM-02 reports
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

export async function verifyDecisionToken(
  config: Iam2ClientConfig,
  input: VerifyDecisionTokenInput,
): Promise<VerifyDecisionTokenResult> {
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

export async function checkPermission(
  config: Iam2ClientConfig,
  input: CheckPermissionInput,
): Promise<CheckPermissionResult> {
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
    });

    // Non-2xx -> fail closed. IAM-02's own permission/check route always returns 200 with a
    // decision field (even for a deny) — a non-2xx here means something is structurally wrong
    // (bad request shape, IAM-02 internal error), never a legitimate decision to interpret.
    if (!res.ok) {
      return { allowed: false, reason: "iam2_unavailable" };
    }

    const body = (await res.json()) as Iam2PermissionCheckResponseBody;
    if (!body?.success || !body.data?.decision) {
      return { allowed: false, reason: "iam2_unavailable" };
    }
    if (body.data.decision !== "allow") {
      return { allowed: false, reason: body.data.reason };
    }
    return { allowed: true, reason: body.data.reason };
  } catch {
    // Network error / timeout / malformed JSON -> fail closed, never treated as success.
    return { allowed: false, reason: "iam2_unavailable" };
  }
}
