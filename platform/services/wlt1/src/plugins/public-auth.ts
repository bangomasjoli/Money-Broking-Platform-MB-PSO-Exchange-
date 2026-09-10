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
 * exact bucket/subject. Maps a genuine quota exceed to the SHARED foundation `RATE_LIMITED` (429)
 * and every other outcome (unavailable, non-200, timeout, network error, malformed body) to the
 * SHARED foundation `RATE_LIMIT_UNAVAILABLE` (503) — never invents a WLT-local duplicate of
 * either, and an engine outage is never mapped to 429.
 */
export async function checkPublicRateLimit(config: Wlt1Config, input: RateLimitCheckInput): Promise<void> {
  const result = await checkRateLimit(fndConfig(config), input);
  if (result.outcome === "allow") return;
  if (result.outcome === "rate_limited") {
    throw new AppError("RATE_LIMITED", { details: [{ field: "retry_after_seconds", issue: String(result.retryAfterSeconds) }] });
  }
  throw new AppError("RATE_LIMIT_UNAVAILABLE");
}
