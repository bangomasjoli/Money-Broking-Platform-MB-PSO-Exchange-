/**
 * WLT-01 -> CLT-01 HTTP client (Phase 1B). The ONLY way WLT-01 may consume CLT-01's client-status
 * seam — never import `services/clt1/src/**` (F3(c) module-import boundary, forbidding `clt1`
 * since WLT-01 Phase 0 day one for exactly this future wiring). This is WLT-01's own fresh copy of
 * the same shape AML-01/KYC-01 already use for their own `lib/clt1-client.ts` — not imported from
 * either, F3(c) applies between every pair of service directories.
 *
 * Wraps exactly ONE CLT-01 route: `GET /internal/clt1/clients/:client_id/status`. Called BEFORE
 * any WLT-01 transaction opens (resolve-once discipline — see `routes/wallet-destinations.ts`) and
 * is bounded by a 5s timeout so a hung CLT-01 can never hang a WLT-01 registration indefinitely.
 *
 * FAIL-CLOSED, always: a network error, a timeout, a non-2xx response (including 404 — client not
 * found), or a malformed/unparseable response body are ALL treated as "not eligible" — never
 * treated as an active client. No retry loop inside this client (a caller-level retry, if any, is
 * the caller's own decision, never hidden here).
 */
export interface Clt1ClientConfig {
  baseUrl: string;
  internalServiceToken: string;
  /** Test-only DI seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Bounded so a hung/slow CLT-01 can never block a WLT-01 registration route indefinitely. */
const CLT1_CLIENT_TIMEOUT_MS = 5000;

/** The only two statuses `clt1.client_profile.status` this codebase's CLT-01 implementation ever
 * treats as eligible for downstream module action — mirrors CLT-01's own accepted status set.
 * Every other value (including any future/unknown status) fails closed. */
const ELIGIBLE_CLIENT_STATUSES = new Set(["active", "active_limited"]);

export type ClientStatusResult =
  | { eligible: true; status: string }
  | { eligible: false; reasonCode: "client_not_found" | "client_status_ineligible" | "clt1_unavailable"; status?: string };

interface Clt1StatusResponseBody {
  success: boolean;
  data?: { client_id?: string; status?: string };
}

export async function checkClientStatus(config: Clt1ClientConfig, clientId: string): Promise<ClientStatusResult> {
  const doFetch = config.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${config.baseUrl}/internal/clt1/clients/${encodeURIComponent(clientId)}/status`, {
      method: "GET",
      headers: { "x-internal-service-token": config.internalServiceToken },
      signal: AbortSignal.timeout(CLT1_CLIENT_TIMEOUT_MS),
    });
  } catch {
    // Network error / timeout (AbortSignal.timeout firing) -> fail closed, never treated as eligible.
    return { eligible: false, reasonCode: "clt1_unavailable" };
  }

  if (res.status === 404) {
    return { eligible: false, reasonCode: "client_not_found" };
  }
  if (!res.ok) {
    // Any other non-2xx (5xx, unexpected 4xx) means something is structurally wrong with the
    // CLT-01 call itself, never a legitimate status to interpret.
    return { eligible: false, reasonCode: "clt1_unavailable" };
  }

  let body: Clt1StatusResponseBody;
  try {
    body = (await res.json()) as Clt1StatusResponseBody;
  } catch {
    return { eligible: false, reasonCode: "clt1_unavailable" };
  }
  if (!body?.success || typeof body.data?.status !== "string") {
    return { eligible: false, reasonCode: "clt1_unavailable" };
  }

  const status = body.data.status;
  if (!ELIGIBLE_CLIENT_STATUSES.has(status)) {
    return { eligible: false, reasonCode: "client_status_ineligible", status };
  }
  return { eligible: true, status };
}

// -------------------------------------------------------------------------------------------
// Public Client Surface — Authenticated Principal -> Client Membership Authority
// (`GET /internal/clt1/principals/:iam_user_id/client-memberships`, CLT-01 accepted seam).
// -------------------------------------------------------------------------------------------

/** Bounded so a hung/slow CLT-01 can never block the public-auth chain indefinitely. */
const CLT1_MEMBERSHIP_CLIENT_TIMEOUT_MS = 5000;

export interface ClientMembership {
  clientId: string;
  authorisedUserId: string;
  role: string;
  membershipStatus: string;
  clientStatus: string;
}

/**
 * FAIL-CLOSED, always: a network error, a timeout, a non-2xx response, or a malformed/
 * unparseable response body all resolve to `{ available: false }` (CLT-01 unavailable) — NEVER
 * silently treated as "no memberships". `{ available: true, memberships: [] }` is the genuine
 * "authenticated but zero eligible client authority" outcome (mirrors the CLT-01 route's own
 * "never a client/membership-existence oracle" contract — every no-authority state is 200 +
 * empty array on the CLT-01 side, not distinguishable from each other, and this client passes
 * that same observational-identity property straight through).
 */
export type MembershipResolutionResult = { available: true; memberships: ClientMembership[] } | { available: false };

interface MembershipResponseBody {
  success: boolean;
  data?: { iam_user_id?: string; memberships?: Array<{ client_id?: string; authorised_user_id?: string; role?: string; membership_status?: string; client_status?: string }> };
}

export async function resolveClientMemberships(config: Clt1ClientConfig, iamUserId: string): Promise<MembershipResolutionResult> {
  const doFetch = config.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${config.baseUrl}/internal/clt1/principals/${encodeURIComponent(iamUserId)}/client-memberships`, {
      method: "GET",
      headers: { "x-internal-service-token": config.internalServiceToken },
      signal: AbortSignal.timeout(CLT1_MEMBERSHIP_CLIENT_TIMEOUT_MS),
    });
  } catch {
    return { available: false };
  }

  if (!res.ok) {
    return { available: false };
  }

  let body: MembershipResponseBody;
  try {
    body = (await res.json()) as MembershipResponseBody;
  } catch {
    return { available: false };
  }
  if (!body?.success || !Array.isArray(body.data?.memberships)) {
    return { available: false };
  }

  const memberships: ClientMembership[] = [];
  for (const m of body.data.memberships) {
    if (typeof m.client_id !== "string" || typeof m.authorised_user_id !== "string" || typeof m.role !== "string" || typeof m.membership_status !== "string" || typeof m.client_status !== "string") {
      // A malformed individual entry makes the whole response untrustworthy — fail closed on the
      // entire call rather than silently dropping one row and proceeding on a partial list.
      return { available: false };
    }
    memberships.push({ clientId: m.client_id, authorisedUserId: m.authorised_user_id, role: m.role, membershipStatus: m.membership_status, clientStatus: m.client_status });
  }
  return { available: true, memberships };
}
