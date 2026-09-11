/**
 * WLT-01 Public Client Surface — the authoritative chain every public `/wlt1/*` route must run
 * BEFORE any business logic:
 *
 *   client bearer token -> IAM-01 internal session introspection -> valid IAM session -> user_id
 *   -> user_class -> require user_class in {client, client_approver} -> CLT-01 membership
 *   resolution -> active authorised client -> client_id -> (route calls FND-01 rate-limit check
 *   next, see `checkPublicRateLimit` below) -> WLT-01 operation.
 *
 * The request body/params/query NEVER assert client authority directly — `client_id` is ALWAYS
 * derived server-side from this chain, never accepted as caller input on any public route.
 *
 * `X-AIX-Client-Id`, when supplied, is a SELECTOR ONLY — it can only NARROW the set of clients
 * this chain already derived from CLT-01 membership; it can never establish membership on its
 * own, and a value that does not match any membership the caller actually holds is an authority
 * failure (`WLT1_CLIENT_AUTHORITY_REQUIRED`), never treated as if it silently selected nothing.
 *
 * DETERMINISTIC MULTI-MEMBERSHIP RULE (this module's own explicit decision, since CLT-01's own
 * membership route deliberately never auto-selects a "primary" client — see
 * `principal-memberships.ts`'s own header comment): with exactly ONE eligible membership, no
 * header is required — that membership is used automatically. With MORE THAN ONE, `X-AIX-Client-
 * Id` is REQUIRED to disambiguate; its absence (or a non-matching value) is an authority failure,
 * never a guess at "the first one" or "the most recent one".
 *
 * FND-01 rate-limit enforcement is deliberately NOT part of this preHandler — the bucket and
 * subject (client-scoped vs. user-scoped, per DEC-009's exact binding table) differ per route, so
 * each route calls `checkPublicRateLimit` itself, AFTER this preHandler resolves authority and
 * BEFORE any Idempotency-Key reservation or business mutation (the frozen ordering).
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@aix/foundation";
import { meta } from "./request-context.js";
import { introspectSession, ELIGIBLE_IAM_USER_CLASSES, type IamClientConfig } from "../lib/iam-client.js";
import { resolveClientMemberships, type Clt1ClientConfig } from "../lib/clt1-client.js";
import { checkRateLimit, type FndRateLimitClientConfig, type RateLimitCheckInput } from "../lib/fnd-rate-limit-client.js";
import { Wlt1Error } from "../lib/errors.js";
import type { Wlt1Config } from "../config.js";

export interface PublicAuthority {
  /** Server-derived from IAM-01 introspection. Never caller-supplied. */
  iamUserId: string;
  sessionId: string;
  userClass: string;
  /** Server-derived from CLT-01 membership resolution (narrowed only by `X-AIX-Client-Id`, never
   * established by it). The sole authoritative `client_id` for the rest of this request. */
  clientId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set only after `requirePublicClientAuthority` succeeds. Never trust any other source for
     * client authority on a public route. */
    publicAuth?: PublicAuthority;
  }
}

const NARROWING_HEADER = "x-aix-client-id";

function extractBearerToken(request: FastifyRequest): string | undefined {
  const raw = request.headers.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

function extractNarrowingClientId(request: FastifyRequest): string | undefined {
  const raw = request.headers[NARROWING_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function iamConfig(config: Wlt1Config): IamClientConfig {
  return { baseUrl: config.iamBaseUrl, introspectionServiceToken: config.iamIntrospectionServiceToken, fetchImpl: config.iamFetchImpl };
}

function clt1Config(config: Wlt1Config): Clt1ClientConfig {
  return { baseUrl: config.clt1BaseUrl, internalServiceToken: config.clt1InternalServiceToken, fetchImpl: config.clt1FetchImpl };
}

/**
 * Resolves `client_id` from an already-narrowed-by-CLT-01 membership list plus an optional
 * caller-supplied narrowing header. Never falls back to "the first one" — an ambiguous or
 * unmatched selection is always an authority failure.
 */
function resolveClientId(memberships: Array<{ clientId: string }>, narrowingClientId: string | undefined): string | undefined {
  if (memberships.length === 0) return undefined;
  if (memberships.length === 1) {
    const only = memberships[0]!.clientId;
    // A narrowing header MAY be supplied even with a single membership — it must still match
    // (never silently ignored), so a caller's stale/wrong header cannot succeed by accident.
    if (narrowingClientId !== undefined && narrowingClientId !== only) return undefined;
    return only;
  }
  // Multiple eligible memberships — the header is REQUIRED to disambiguate.
  if (narrowingClientId === undefined) return undefined;
  const match = memberships.find((m) => m.clientId === narrowingClientId);
  return match?.clientId;
}

export function makePublicClientAuthorityGuard() {
  return async function requirePublicClientAuthority(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const config = request.server.config as Wlt1Config;

    const token = extractBearerToken(request);
    if (!token) {
      return sendError(reply, request, new Wlt1Error("WLT1_AUTH_REQUIRED"));
    }

    const introspection = await introspectSession(iamConfig(config), token);
    if (introspection.outcome === "invalid") {
      return sendError(reply, request, new Wlt1Error("WLT1_AUTH_REQUIRED"));
    }
    if (introspection.outcome === "unavailable") {
      return sendError(reply, request, new Wlt1Error("WLT1_IAM01_UNAVAILABLE"));
    }

    if (!ELIGIBLE_IAM_USER_CLASSES.has(introspection.userClass)) {
      // Authenticated, but not an eligible actor class for this surface at all (admin/staff/
      // service/unexpected) — an authority failure, never a 401 (the session itself is genuine).
      return sendError(reply, request, new Wlt1Error("WLT1_CLIENT_AUTHORITY_REQUIRED"));
    }

    const membershipResult = await resolveClientMemberships(clt1Config(config), introspection.userId);
    if (!membershipResult.available) {
      return sendError(reply, request, new Wlt1Error("WLT1_CLT1_UNAVAILABLE"));
    }

    const narrowingClientId = extractNarrowingClientId(request);
    const clientId = resolveClientId(membershipResult.memberships, narrowingClientId);
    if (!clientId) {
      return sendError(reply, request, new Wlt1Error("WLT1_CLIENT_AUTHORITY_REQUIRED"));
    }

    request.publicAuth = {
      iamUserId: introspection.userId,
      sessionId: introspection.sessionId,
      userClass: introspection.userClass,
      clientId,
    };
    // Audit/idempotency actor attribution: a real authenticated human end-user drove this
    // request, not an internal service — distinct from every `/internal/wlt1/*` route's own
    // `actor_type: "service"` convention.
    request.ctx.actor_id = introspection.userId;
    request.ctx.actor_type = "user";
  };
}

async function sendError(reply: FastifyReply, request: FastifyRequest, err: Wlt1Error): Promise<void> {
  await reply.code(err.http).send({
    success: false,
    ...meta(request),
    error: { code: err.code, message: err.message, details: err.details },
  });
}

// -------------------------------------------------------------------------------------------
// FND-01 rate-limit check — called explicitly by each route AFTER `requirePublicClientAuthority`
// resolves authority, BEFORE any Idempotency-Key reservation or business mutation.
// -------------------------------------------------------------------------------------------

function fndConfig(config: Wlt1Config): FndRateLimitClientConfig {
  return { baseUrl: config.fndBaseUrl, consumerToken: config.fndRateLimitConsumerToken, fetchImpl: config.fndFetchImpl };
}

/**
 * Throws on anything except an explicit allow — the caller (route handler) never needs its own
 * branching; a route that returns normally from this call has an explicit FND-01 `allow` for this
 * exact bucket/subject. Maps a genuine quota exceed to the SHARED foundation `RATE_LIMITED` (429,
 * `Retry-After` preserved) — never mapped away, a real quota denial always stays 429. Every other
 * outcome (unavailable, non-200, timeout, network error, malformed body) is DEC-009's own
 * enforcement-indeterminate case; DEC-009 requires it stay internal-only as the shared foundation
 * `RATE_LIMIT_UNAVAILABLE`, mapped to a generic public dependency-failure code — this public
 * boundary reuses WLT-01's OWN already-accepted generic-unavailable code
 * `WLT1_SERVICE_UNAVAILABLE` (the same code `assertPoolAvailable`/provider-outage paths already
 * reuse, per `lib/errors.ts`'s own header comment: "the caller cannot act on the two [causes]
 * differently") rather than leaking FND's internal `RATE_LIMIT_UNAVAILABLE` terminology to a
 * public client.
 */
export async function checkPublicRateLimit(config: Wlt1Config, input: RateLimitCheckInput): Promise<void> {
  const result = await checkRateLimit(fndConfig(config), input);
  if (result.outcome === "allow") return;
  if (result.outcome === "rate_limited") {
    throw new AppError("RATE_LIMITED", { details: [{ field: "retry_after_seconds", issue: String(result.retryAfterSeconds) }] });
  }
  throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE");
}

/**
 * Public-surface mutation idempotency must bind BOTH the authenticated human actor AND the
 * derived client authority — never the actor alone. The foundation idempotency scope key is
 * `(source_module, actor_id, action, idempotency_key)` (`packages/foundation/src/idempotency.ts`)
 * with no independent client column; without this, one IAM user holding eligible memberships in
 * two clients could submit the identical Idempotency-Key and body narrowed to a DIFFERENT client
 * on each call and silently have the FIRST client's result replayed onto the second. Colon-
 * composite identifiers are an established repository convention for exactly this kind of derived
 * compound scoping key (e.g. `lib/destinations.ts`'s own `takeRegistrationLock` advisory-lock
 * namespace, `lib/providers/stub-provider.ts`'s `${chain}:${network}:${canonicalAddress}`
 * fixture key). This is NEVER the identity used for audit attribution — every `publishAudit`
 * `actor_id` on the public surface stays the plain `iamUserId` — only the idempotency-record
 * uniqueness key.
 */
export function publicIdempotencyActorId(iamUserId: string, clientId: string): string {
  return `${iamUserId}:${clientId}`;
}
