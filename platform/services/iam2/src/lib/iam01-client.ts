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
  | { valid: true; userId: string; authLevel: string; freshUntilUtc: string }
  | { valid: false };

interface Iam01VerifyAssertionResponseBody {
  success: boolean;
  data?: { valid: boolean; user_id: string; auth_level: string; fresh_until_utc: string };
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
    };
  } catch {
    // Network error / timeout / malformed JSON -> fail closed, never treated as success.
    return { valid: false };
  }
}
