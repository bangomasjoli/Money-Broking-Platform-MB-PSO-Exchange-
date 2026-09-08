/**
 * CFG-01 -> IAM-02 HTTP client (Phase 3A). The ONLY way CFG-01 may consume IAM-02's permission
 * guard or approval/execute-verify surface — never import services/iam2/src/** (F3(c)
 * module-import boundary). This is CFG-01's own fresh copy of SEC-01's identical pattern
 * (services/sec1/src/lib/iam2-client.ts) — not imported from `services/sec1` (F3(c) applies
 * between every pair of service directories, not just against services/iam/services/iam2).
 *
 * Wraps two IAM-02 routes:
 *   - `POST /internal/iam2/permission/check` — baseline permission decision (advisory-only,
 *     never itself authorises a mutation).
 *   - `POST /internal/iam2/permission/execute-verify` — the approval-to-execution binding check
 *     (services/iam2/src/lib/decision-token.ts). This is what closes Phase 3A approved decision
 *     #1: a mutation APPLY route may never authorise a state change on `caller_module` + shared
 *     token alone — it must additionally hold a real IAM-02-issued decision token, bound to a
 *     real human actor and the exact mutation payload, verified here.
 *
 * FAIL-CLOSED, always: a network error, a non-2xx response, a malformed/unexpected response
 * body, `execution_authorised !== true` (execute-verify), or a genuinely NEGATIVE `checkPermission`
 * decision (`deny`/`licence_locked`) are ALL treated identically as "not authorised" — never
 * treated as a grant. Same discipline SEC-01 already applies to this exact dependency, itself
 * modelled on IAM-02's own fail-closed posture toward IAM-01.
 *
 * ---------------------------------------------------------------------------------------
 * `checkPermission`'s BASELINE interpretation — `approval_required`/`step_up_required` also
 * PASS (second finding closed alongside the F-1 `licence_locked` fix, independent Opus Phase 3A
 * re-review pass).
 * ---------------------------------------------------------------------------------------
 * `services/iam2/src/lib/guard.ts`'s precedence chain returns `approval_required` (step 7, if
 * `permission.requires_approval`) or `step_up_required` (step 6, if `permission.requires_step_up`
 * — checked BEFORE step 7, so a permission with both flags set never even reaches
 * `approval_required`) UNCONDITIONALLY for any permission carrying that flag — before role grants
 * are even looked up (step 10). All 6 sensitive CFG-01 mutation permissions
 * (`feature.enable`/`.disable`, all four `licence_profile.*` actions) carry `requires_approval =
 * true`, and `licence_profile.activate` additionally carries `requires_step_up = true` — by
 * design, so the catalogue itself documents which actions are approval/step-up-sensitive (see
 * `017_iam2_register_cfg1_mutation_permissions.cjs`'s own header comment). Empirically confirmed
 * against the real IAM-02 guard (not a stub): `permission/check` for these actions returns
 * `approval_required`/`step_up_required`, NEVER `allow`, for ANY actor — including one with a
 * genuine role grant, since steps 6/7 short-circuit before step 10 ever runs. Treating this the
 * same as a real `deny` (the original code did, via a strict `decision !== "allow"` check) would
 * make the BASELINE check permanently unsatisfiable for every apply route — the exact same
 * unconditional-block shape as the `licence_locked` bug F-1 fixed, just one precedence step
 * later, and hidden by the same test-stub blind spot (every `iam2FetchImpl` stub in this
 * codebase's test suite hardcodes `decision: "allow"`, so neither the original implementation
 * nor the first review pass exercised what the real guard actually returns for a
 * `requires_approval`/`requires_step_up` permission).
 *
 * SEC-01's OWN identical dependency (`services/sec1/src/lib/iam2-client.ts`) sidesteps this
 * entirely by registering its Critical-closure permission with `requires_approval = false`
 * (`011`/`013`'s header comments) and enforcing the actual approval requirement purely at its own
 * route layer. CFG-01 deliberately does NOT follow that path here — the approved Phase 3A
 * decision keeps `requires_approval = true` (and `.activate`'s `requires_step_up = true`) on the
 * catalogue so an operator reading `iam2.permission` directly can see which CFG-01 actions are
 * approval/step-up-sensitive, matching this file's own pre-existing header note that these flags
 * are "ADVISORY context only." The tradeoff is that `checkPermission`'s OWN interpretation must
 * therefore treat `approval_required`/`step_up_required` as a baseline PASS, not a failure — the
 * REAL gate was always `verifyDecisionToken`/execute-verify (§ above), never this baseline call;
 * this baseline call exists only to catch genuine denials (`deny`/`licence_locked`) and IAM-02
 * unavailability BEFORE wasting time on a doomed apply, not to duplicate the approval gate.
 *
 * Dependency injection for tests: `fetchImpl` lets a test stub this call instead of requiring a
 * live IAM-02 service (Cfg1Config.iam2FetchImpl — never populated from env, test-only) — mirrors
 * Sec1Config.iam2FetchImpl exactly.
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
  /** Fully-qualified iam2.permission.permission_code, e.g. "cfg1.feature.enable". */
  action: string;
  resource: string;
  entityId?: string;
  clientId?: string;
}

/**
 * `reason` on the denied branch is IAM-02's own public `reason` string verbatim when a real
 * response was received, or the sentinel `"iam2_unavailable"` when the call itself failed
 * (network error / non-2xx / malformed body) — callers that need to distinguish "IAM-02 said no"
 * from "IAM-02 could not be reached" may inspect this value, but BOTH cases are `allowed: false`
 * and must be treated identically for authorization purposes (fail-closed).
 */
export type CheckPermissionResult = { allowed: true; reason: string } | { allowed: false; reason: string };

/** Decisions that PASS CFG-01's baseline check — see this file's header comment for why
 * `approval_required`/`step_up_required` belong here alongside `allow`: for CFG-01's own
 * `requires_approval`/`requires_step_up` mutation permissions, IAM-02's guard returns one of
 * these two UNCONDITIONALLY (before role grants are even checked), and the real authorisation
 * gate is always the separate, mandatory `verifyDecisionToken`/execute-verify call — never this
 * one. Only `deny`/`licence_locked` (and unavailable/malformed) are genuine baseline failures. */
const BASELINE_PASS_DECISIONS = new Set(["allow", "approval_required", "step_up_required"]);

interface Iam2PermissionCheckResponseBody {
  success: boolean;
  data?: { decision: string; reason: string };
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
    // Network error / timeout / malformed JSON -> fail closed, never treated as success.
    return { allowed: false, reason: "iam2_unavailable" };
  }
}

/**
 * IAM-02's side of the approval-to-execution binding
 * (`services/iam2/src/lib/decision-token.ts`, `POST /internal/iam2/permission/execute-verify`).
 * Used by every CFG-01 mutation APPLY route to verify+consume a decision token a maker-checker
 * approval flow already minted via IAM-02's EXISTING generic `/iam2/approvals/request` +
 * `/iam2/approvals/:id/approve` endpoints (run by an operator OUTSIDE CFG-01's own routes,
 * exactly as SEC-01's Critical-alert-closure precedent) — no new IAM-02 code, no IAM-02 guard
 * change.
 *
 * IAM-02's execute-verify route THROWS (non-2xx) on any failure — unlike `permission/check`,
 * which always returns 200 with a `decision` field even for a deny. This client therefore treats
 * a non-2xx response the same way `checkPermission` treats an unavailable/erroring call:
 * `authorised: false`, never a grant. The specific IAM-02 reason code (e.g.
 * `IAM2_DECISION_TOKEN_INVALID`, `IAM2_PAYLOAD_HASH_MISMATCH`, `IAM2_DECISION_TOKEN_STALE`) is
 * surfaced when parseable, purely for diagnostics — CFG-01's mutation routes collapse ALL of
 * them to a single generic `CFG1_MUTATION_APPROVAL_REQUIRED`, same discipline SEC-01's own
 * `SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED` already applies.
 */
export interface VerifyDecisionTokenInput {
  decisionToken: string;
  approvalId?: string;
  /** Must equal the IAM-02 approval's own `maker_user_id` — the decision token IAM-02 mints is
   * bound to the ORIGINAL requester, not the approver (services/iam2/src/routes/approvals.ts
   * issues the token with `actorUserId: approval.maker_user_id`). CFG-01 passes the mutation
   * change-row's own `requested_by` value here, never a caller-presented arbitrary actor. */
  actorId: string;
  sessionId?: string;
  /** Fully-qualified iam2.permission.permission_code this token must be bound to. */
  action: string;
  resource: string;
  entityId?: string;
  clientId?: string;
  /** CFG-01's own recomputed `fingerprint()` of the change row's apply payload — must match the
   * hash bound into the token at approval-creation time exactly, or IAM-02 reports
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
