/**
 * WLT-01 -> FND-01 shared rate-limit engine HTTP client (Public Client Surface). The ONLY way
 * WLT-01 may consume FND-01's `POST /foundation/rate-limit/check` — never import
 * `services/fnd/src/**` (F3(c) module-import boundary). WLT-01's own fresh copy of the same shape
 * every prior module's own cross-service client uses — not imported from any of them.
 *
 * Called by `plugins/public-auth.ts` AFTER authentication + client-authority resolution, BEFORE
 * any Idempotency-Key reservation or business mutation (DEC-009's own frozen ordering — a rate
 * limit check always precedes idempotency, so an idempotent replay consumes quota again).
 *
 * OUTCOME MAPPING (frozen, DEC-009 + FND-01 acceptance): HTTP 200 with `data.decision ===
 * "allow"` is the ONLY case that proceeds. A genuine `429 RATE_LIMITED` maps to the shared
 * foundation `RATE_LIMITED` code (429) — never invented locally, since the shared catalogue
 * already carries the exact required semantics. EVERY other outcome — `503
 * RATE_LIMIT_UNAVAILABLE`, any other non-200 status (401/400/5xx), a timeout, a network error, or
 * a malformed/unparseable response body — maps to the shared foundation `RATE_LIMIT_UNAVAILABLE`
 * code (503). An engine outage is NEVER mapped to 429 — 429 means real quota only.
 */
export const RATE_LIMIT_CLIENT_TIMEOUT_MS = 5000;

export interface FndRateLimitClientConfig {
  baseUrl: string;
  consumerToken: string;
  /** Test-only DI seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface RateLimitCheckInput {
  bucket: string;
  subjectType: string;
  subjectId: string;
}

export type RateLimitCheckResult =
  | { outcome: "allow" }
  | { outcome: "rate_limited"; retryAfterSeconds: number }
  | { outcome: "unavailable" };

interface RateLimitCheckResponseBody {
  success: boolean;
  data?: { decision?: string; limit_ref?: string | null; retry_after_seconds?: number | null };
}

export async function checkRateLimit(config: FndRateLimitClientConfig, input: RateLimitCheckInput): Promise<RateLimitCheckResult> {
  const doFetch = config.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${config.baseUrl}/foundation/rate-limit/check`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": config.consumerToken,
      },
      body: JSON.stringify({ bucket: input.bucket, subject_type: input.subjectType, subject_id: input.subjectId }),
      signal: AbortSignal.timeout(RATE_LIMIT_CLIENT_TIMEOUT_MS),
    });
  } catch {
    return { outcome: "unavailable" };
  }

  if (res.status === 429) {
    let retryAfterSeconds = 1;
    const header = res.headers.get("retry-after");
    if (header !== null) {
      const parsed = Number(header);
      if (Number.isFinite(parsed) && parsed > 0) retryAfterSeconds = Math.ceil(parsed);
    }
    return { outcome: "rate_limited", retryAfterSeconds };
  }
  if (res.status !== 200) {
    // Includes 503 RATE_LIMIT_UNAVAILABLE and any other unexpected status (401/400/5xx) — every
    // one of these is enforcement-indeterminate, never a real deny and never an implicit allow.
    return { outcome: "unavailable" };
  }

  let body: RateLimitCheckResponseBody;
  try {
    body = (await res.json()) as RateLimitCheckResponseBody;
  } catch {
    return { outcome: "unavailable" };
  }
  if (!body?.success || body.data?.decision !== "allow") {
    // A 200 that does not genuinely assert decision:"allow" is never treated as an allow — fails
    // closed to "unavailable" rather than silently proceeding.
    return { outcome: "unavailable" };
  }
  return { outcome: "allow" };
}
