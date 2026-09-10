/**
 * WLT-01 -> IAM-01 HTTP client (Public Client Surface). The ONLY way WLT-01 may consume IAM-01's
 * internal session-introspection seam — never import `services/iam/src/**` (F3(c) module-import
 * boundary). WLT-01's own fresh copy of the same shape every prior module's own cross-service
 * client uses (`lib/clt1-client.ts`/`lib/iam2-client.ts`/`lib/aml1-client.ts`) — not imported from
 * any of them.
 *
 * Wraps exactly ONE IAM-01 route: `POST /internal/auth/session/validate`
 * (`IAM-01_Session_Introspection_Opus_v1.0.md`, COMPLETE/ACCEPTED). Called at the START of the
 * public-auth chain (`plugins/public-auth.ts`), before any CLT-01/FND-01 call, before any
 * transaction, bounded by a timeout so a hung IAM-01 can never hang a WLT-01 public request
 * indefinitely.
 *
 * FAIL-CLOSED, always: only an HTTP 200 body with `data.valid === true` is ever treated as
 * authenticated. A 401 is a genuine "invalid bearer" (mapped by the caller to
 * `WLT1_AUTH_REQUIRED`). EVERY other outcome — a network error, a timeout, a non-200/non-401
 * response, a malformed/unparseable JSON body, a response missing `success`/`data.valid`, or an
 * unexpected `data.user_class` value — is IAM-01-unavailable/indeterminate, never treated as
 * authenticated and never conflated with a genuine 401 (mapped by the caller to
 * `WLT1_IAM01_UNAVAILABLE`, 503). This module itself never throws — it always returns a
 * discriminated result; the caller decides the public error mapping.
 */

/** Bounded so a hung/slow IAM-01 can never block a WLT-01 public route indefinitely. */
const IAM_CLIENT_TIMEOUT_MS = 5000;

/** The only two `user_class` values a WLT-01 public route may ever treat as eligible — mirrors
 * the frozen public-authority-chain contract exactly. Any other value (staff/admin/service, or
 * any future/unknown class) is INDETERMINATE authority, not "unauthenticated" — the caller
 * (`plugins/public-auth.ts`) maps it to `WLT1_CLIENT_AUTHORITY_REQUIRED` (403), never
 * `WLT1_AUTH_REQUIRED` (401), since the session itself genuinely is valid. */
export const ELIGIBLE_IAM_USER_CLASSES = new Set(["client", "client_approver"]);

export interface IamClientConfig {
  baseUrl: string;
  introspectionServiceToken: string;
  /** Test-only DI seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export type IntrospectionResult =
  | { outcome: "authenticated"; userId: string; sessionId: string; userClass: string }
  | { outcome: "invalid" }
  | { outcome: "unavailable" };

interface IntrospectionResponseBody {
  success: boolean;
  data?: { valid?: boolean; user_id?: string; session_id?: string; user_class?: string };
}

export async function introspectSession(config: IamClientConfig, accessToken: string): Promise<IntrospectionResult> {
  const doFetch = config.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${config.baseUrl}/internal/auth/session/validate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": config.introspectionServiceToken,
      },
      body: JSON.stringify({ access_token: accessToken }),
      signal: AbortSignal.timeout(IAM_CLIENT_TIMEOUT_MS),
    });
  } catch {
    // Network error / timeout (AbortSignal.timeout firing) -> IAM-01 unavailable, never treated
    // as authenticated and never treated as a genuine 401.
    return { outcome: "unavailable" };
  }

  if (res.status === 401) {
    return { outcome: "invalid" };
  }
  if (res.status !== 200) {
    // Any other non-200 (5xx, unexpected 4xx) is a structural failure of the call itself, never a
    // legitimate authentication outcome to interpret.
    return { outcome: "unavailable" };
  }

  let body: IntrospectionResponseBody;
  try {
    body = (await res.json()) as IntrospectionResponseBody;
  } catch {
    return { outcome: "unavailable" };
  }

  if (!body?.success || body.data?.valid !== true) {
    // A 200 response that does not genuinely assert valid:true is never treated as authenticated
    // — this covers a malformed/incomplete envelope as well as a (should-be-impossible)
    // valid:false on a 200, both fail closed to "unavailable" rather than silently downgrading to
    // "invalid" (which would incorrectly imply IAM-01 genuinely rejected the token).
    return { outcome: "unavailable" };
  }
  const { user_id: userId, session_id: sessionId, user_class: userClass } = body.data;
  if (typeof userId !== "string" || !userId || typeof sessionId !== "string" || !sessionId || typeof userClass !== "string" || !userClass) {
    return { outcome: "unavailable" };
  }

  return { outcome: "authenticated", userId, sessionId, userClass };
}
