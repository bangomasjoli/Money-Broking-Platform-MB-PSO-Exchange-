/**
 * IAM-02 -> IAM-01 HTTP client (Phase 5). The ONLY way IAM-02 may consume IAM-01 — never
 * import services/iam/src/** (F3(c) module-import boundary). Wraps
 * `POST /internal/auth/verify-assertion` (services/iam/src/routes/step-up.ts), guarded by
 * IAM-01's own `x-internal-service-token` header.
 *
 * Uses Node's native `fetch` (no new dependency, per the task brief).
 *
 * FAIL-CLOSED, always: a network error, a non-2xx response, or a `valid:false` body are ALL
 * treated identically as "verification failed" — never treated as success. This is the same
 * fail-closed discipline `09_Error_Handling.md` §3 rule 6 requires ("IAM-01 step-up
 * verification unavailable for required step-up" is an explicit fail-closed case).
 *
 * Dependency injection for tests: `fetchImpl` lets a test stub this call instead of requiring
 * a live IAM-01 service (see Iam2Config.iam01FetchImpl — never populated from env, test-only).
 *
 * ---------------------------------------------------------------------------------------
 * IAM02-AUTHZ-REM-001 (AZ-05, AZ-16, AZ-19, AZ-20; owner decision OD-1 Option A)
 * ---------------------------------------------------------------------------------------
 * `verifyStepUpAssertion` stays the low-level call and stays backward compatible: IAM-01 now
 * additionally returns the assertion owner's LIVE `user_type`, `user_class` and `user_status`
 * (read from the canonical `iam.user_identity` record), and this function passes them through
 * as UNVALIDATED values (`unknown`) so a caller that does not need them — the bootstrap
 * transition, which compares only `userId` — is unaffected.
 *
 * Human-approver eligibility is a SEPARATE step (`requireEligibleHumanChecker`) used only by
 * the approve handler, via `verifyApproverStepUp`, which is the ONLY place a `VerifiedStepUp`
 * is created. A `VerifiedStepUp` is tracked in a module-private WeakSet, so a structurally
 * identical object a caller fabricates (or a field smuggled into a request body) is NOT
 * accepted by `isVerifiedStepUp` — the guard (lib/guard.ts) will only honour step-up evidence
 * that passed through here. It proves, for ONE approval act: a valid purpose-bound MFA
 * assertion, belonging to the claimed approver, fresh, held by an identity IAM-01 classifies
 * as an eligible human class (both `user_type` and `user_class` independently in
 * {staff, admin}) with `active` status. It does NOT authenticate the caller of the IAM-02
 * route in general (carry-forward L3) and says nothing about makers' account status.
 */

export interface Iam01ClientConfig {
  baseUrl: string;
  internalServiceToken: string;
  /** Test-only DI seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface VerifyStepUpAssertionInput {
  recentAuthAssertion: string;
  requiredPurpose: string;
  sessionId?: string;
}

export type VerifyStepUpAssertionResult =
  | {
      valid: true;
      userId: string;
      authLevel: string;
      freshUntilUtc: string;
      /** OD-1 Option A — raw, UNVALIDATED values from IAM-01 (absent from an older IAM-01). */
      userType?: unknown;
      userClass?: unknown;
      userStatus?: unknown;
    }
  | { valid: false };

interface Iam01VerifyAssertionResponseBody {
  success: boolean;
  data?: {
    valid: boolean;
    user_id: string;
    auth_level: string;
    fresh_until_utc: string;
    user_type?: unknown;
    user_class?: unknown;
    user_status?: unknown;
  };
}

export async function verifyStepUpAssertion(
  config: Iam01ClientConfig,
  input: VerifyStepUpAssertionInput,
): Promise<VerifyStepUpAssertionResult> {
  const doFetch = config.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${config.baseUrl}/internal/auth/verify-assertion`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": config.internalServiceToken,
      },
      body: JSON.stringify({
        recent_auth_assertion: input.recentAuthAssertion,
        required_purpose: input.requiredPurpose,
        ...(input.sessionId ? { session_id: input.sessionId } : {}),
      }),
    });

    // Non-2xx (including IAM-01's own AUTH_RECENT_AUTH_INVALID 401) -> fail closed. IAM-01
    // throws (not a 200 success:false) when the assertion is invalid/expired/wrong-purpose —
    // see routes/step-up.ts's `if (!result.valid) throw new IamError(...)`.
    if (!res.ok) {
      return { valid: false };
    }

    const body = (await res.json()) as Iam01VerifyAssertionResponseBody;
    if (!body?.success || !body.data?.valid) {
      return { valid: false };
    }
    return {
      valid: true,
      userId: body.data.user_id,
      authLevel: body.data.auth_level,
      freshUntilUtc: body.data.fresh_until_utc,
      userType: body.data.user_type,
      userClass: body.data.user_class,
      userStatus: body.data.user_status,
    };
  } catch {
    // Network error / timeout / malformed JSON -> fail closed, never treated as success.
    return { valid: false };
  }
}

// ---------------------------------------------------------------------------------------
// Approval-specific step-up purpose and human-checker eligibility (AZ-05, AZ-16).
// ---------------------------------------------------------------------------------------

/** C-4: the IAM-01 step-up assertion is bound to ONE approval: `iam2_approval:<approval_id>`.
 * (`step_up_assertion.purpose` is varchar(64); `"appr_" + uuid` keeps this at 55 characters.) */
export function approvalStepUpPurpose(approvalId: string): string {
  return `iam2_approval:${approvalId}`;
}

/** Owner-approved eligible human classes (OD-1 Option A): each of type and class independently. */
const ELIGIBLE_HUMAN_VALUES: ReadonlySet<string> = new Set(["staff", "admin"]);
const SERVICE_VALUE = "service";

export type ApproverEligibilityFailureCode =
  | "IAM2_STEP_UP_INVALID"
  | "IAM2_APPROVER_NOT_ELIGIBLE"
  | "IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED";

export type ApproverEligibility =
  | { ok: true }
  | { ok: false; code: ApproverEligibilityFailureCode; reason: string };

/**
 * AZ-16 (i)-(v), pure (no I/O). Every missing, blank, non-string, out-of-vocabulary,
 * conflicting or ineligible value FAILS CLOSED; no default is ever assumed.
 *   (i)   `verified.valid` (a failed/unavailable IAM-01 call never reaches here as valid)
 *   (ii)  the assertion's `user_id` equals the claimed approver (no cross-user assertion)
 *   (iii) `fresh_until_utc` present, parseable and in the future at check time
 *   (iv)  `user_type` AND `user_class` each independently in {staff, admin} (a mixed
 *         staff/admin pair is eligible by the owner's rule); service in EITHER field is the
 *         Critical blocked outcome
 *   (v)   `user_status` is exactly `active`
 */
export function requireEligibleHumanChecker(
  verified: VerifyStepUpAssertionResult,
  expected: { approverUserId: string; nowMs: number },
): ApproverEligibility {
  if (!verified.valid) return { ok: false, code: "IAM2_STEP_UP_INVALID", reason: "assertion_invalid_or_unavailable" };
  if (typeof verified.userId !== "string" || verified.userId.length === 0 || verified.userId !== expected.approverUserId) {
    return { ok: false, code: "IAM2_STEP_UP_INVALID", reason: "assertion_user_mismatch" };
  }
  if (typeof verified.authLevel !== "string" || verified.authLevel.length === 0) {
    return { ok: false, code: "IAM2_STEP_UP_INVALID", reason: "auth_level_missing" };
  }
  const freshUntilMs = typeof verified.freshUntilUtc === "string" ? Date.parse(verified.freshUntilUtc) : Number.NaN;
  if (!Number.isFinite(freshUntilMs) || freshUntilMs <= expected.nowMs) {
    return { ok: false, code: "IAM2_STEP_UP_INVALID", reason: "assertion_not_fresh" };
  }

  // A service principal in EITHER classification is the Critical blocked outcome, decided
  // before any "missing field" reasoning so a partially-populated service identity cannot
  // be downgraded to the lesser code.
  if (verified.userType === SERVICE_VALUE || verified.userClass === SERVICE_VALUE) {
    return { ok: false, code: "IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED", reason: "service_principal" };
  }
  if (typeof verified.userType !== "string" || typeof verified.userClass !== "string") {
    return { ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE", reason: "identity_fields_missing_or_invalid" };
  }
  if (!ELIGIBLE_HUMAN_VALUES.has(verified.userType) || !ELIGIBLE_HUMAN_VALUES.has(verified.userClass)) {
    return { ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE", reason: "identity_class_ineligible" };
  }
  if (verified.userStatus !== "active") {
    return { ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE", reason: "identity_not_active" };
  }
  return { ok: true };
}

/** Unforgeable (registry-checked) evidence that ONE approval act is backed by a verified,
 * eligible, fresh step-up assertion. Created only by `verifyApproverStepUp`. */
export interface VerifiedStepUp {
  readonly userId: string;
  readonly purpose: string;
  readonly authLevel: string;
  readonly freshUntilMs: number;
  readonly userType: string;
  readonly userClass: string;
  readonly userStatus: string;
}

const verifiedStepUpRegistry = new WeakSet<object>();

export function isVerifiedStepUp(candidate: unknown): candidate is VerifiedStepUp {
  return typeof candidate === "object" && candidate !== null && verifiedStepUpRegistry.has(candidate);
}

export type VerifyApproverStepUpResult =
  | { ok: true; stepUp: VerifiedStepUp; authLevel: string }
  | {
      ok: false;
      code: ApproverEligibilityFailureCode;
      reason: string;
      /** Raw identity facts for the (secret-free) denial audit, when IAM-01 supplied any. */
      identity?: { userType: unknown; userClass: unknown; userStatus: unknown };
    };

/**
 * Verifies the approver's purpose-bound assertion with IAM-01, applies
 * `requireEligibleHumanChecker`, and only then mints a registered `VerifiedStepUp`.
 */
export async function verifyApproverStepUp(
  config: Iam01ClientConfig,
  input: { recentAuthAssertion: string; approverUserId: string; approvalId: string; nowMs?: number },
): Promise<VerifyApproverStepUpResult> {
  const purpose = approvalStepUpPurpose(input.approvalId);
  const verified = await verifyStepUpAssertion(config, { recentAuthAssertion: input.recentAuthAssertion, requiredPurpose: purpose });
  const nowMs = input.nowMs ?? Date.now();
  const eligibility = requireEligibleHumanChecker(verified, { approverUserId: input.approverUserId, nowMs });
  if (!eligibility.ok || !verified.valid) {
    return {
      ok: false,
      code: eligibility.ok ? "IAM2_STEP_UP_INVALID" : eligibility.code,
      reason: eligibility.ok ? "assertion_invalid_or_unavailable" : eligibility.reason,
      ...(verified.valid ? { identity: { userType: verified.userType, userClass: verified.userClass, userStatus: verified.userStatus } } : {}),
    };
  }
  const stepUp: VerifiedStepUp = Object.freeze({
    userId: verified.userId,
    purpose,
    authLevel: verified.authLevel,
    freshUntilMs: Date.parse(verified.freshUntilUtc),
    userType: verified.userType as string,
    userClass: verified.userClass as string,
    userStatus: verified.userStatus as string,
  });
  verifiedStepUpRegistry.add(stepUp);
  return { ok: true, stepUp, authLevel: verified.authLevel };
}
