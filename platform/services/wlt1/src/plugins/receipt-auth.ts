/**
 * WLT-01 Phase 2C-D1/D2 — the provider-receipt authentication guard for
 * `POST /internal/wlt1/provider-results/receipt`.
 *
 * DISTINCT from `internal-identity.ts`'s `makeWlt1InternalIdentityGuard` — that guard proves "some
 * approved AIX-internal caller", never WHICH provider. This guard proves "the caller possesses the
 * shared secret provisioned for provider X", establishing PROVIDER IDENTITY specifically, which is
 * the load-bearing fact the whole Phase 2C-D receipt architecture is built on (correlation and
 * evidence binding both key off the AUTHENTICATED provider id, never the bare
 * `x-wlt1-provider-id` header claim alone).
 *
 * Frozen headers: `x-wlt1-provider-id` (claimed identity only, untrusted until the token check
 * passes) + `x-wlt1-provider-receipt-token` (compared via `timingSafeEqual` against
 * `config.providerReceiptSecrets[claimedProviderId]`). This architecture deliberately proves ONLY
 * "the caller holds the configured secret for this provider id" — NOT a cryptographic payload
 * signature, NOT payload authorship, NOT timestamp-replay protection, NOT mTLS identity. Those
 * remain out of scope until a real vendor contract requires them, at which point they land as an
 * honestly-named, separate mechanism — never retrofitted onto this one (mirrors migration 050's
 * own `signature_valid` -> `source_authenticated` renaming rationale for the identical
 * "never assert verification of something not actually computed" principle).
 *
 * ENUMERATION RESISTANCE: unknown provider id, wrong token, and missing header(s) all return the
 * IDENTICAL generic `SERVICE_IDENTITY_REQUIRED` (401) shape. An unconfigured provider id is NEVER
 * distinguished from a configured-but-wrong-token provider id — both paths run the SAME
 * `timingSafeEqual` comparison shape (against a fixed-length dummy secret when the provider id is
 * unconfigured), so the auth outcome carries no provider-existence timing signal beyond ordinary
 * network jitter. No DB query, no inbox row, and no screening-existence check of any kind happens
 * before this guard succeeds — see the receipt route's own header comment.
 *
 * H-D2-1 REMEDIATION (Phase 2C-D2R) — CREDENTIAL-AUTHORITY BINDING: an independent Opus review of
 * the Phase 2C-D2 candidate proved the PRIOR shape of this module — an EXPORTED, UNBOUND
 * `authenticateProviderReceipt(secrets, claimedProviderId, providedToken)` accepting the credential
 * map as an ordinary call argument — was insufficient. Any production module could fabricate its
 * own `secrets` object (with no relationship whatsoever to the real, validated
 * `WLT1_PROVIDER_RECEIPT_SECRETS` configuration) and a matching fake token, and the function would
 * happily mint a real, brand-matching `AuthenticatedReceiptProvenance` from it. The mistake: the
 * function proved "the caller's token matches the caller's OWN map", never "the caller's token
 * matches the SERVER's trusted configuration". A brand can only ever prove "this value was
 * constructed by this module's own code" — it can never prove WHICH data that code was fed, so an
 * unbound function accepting the comparison data as a plain argument can never be a real security
 * boundary, no matter how the credential comparison inside it is implemented.
 *
 * THE FIX: this module no longer exports ANY function that accepts a caller-supplied secrets map.
 * The ONLY exported construction path is `createWlt1ProviderReceiptAuthenticator(config)` — a BOUND
 * factory, called EXACTLY ONCE per app boot, from `server.ts`'s own `buildApp(config)`, using the
 * SAME validated `Wlt1Config` instance (produced by `config.ts`'s `loadWlt1Config` — never
 * hand-assembled) that configures the rest of the running application. This mirrors
 * `lib/screening-application.ts`'s own already-accepted P2CC1-MED-1 composition pattern exactly:
 * `createScreeningApplication(config)` is constructed once in `server.ts` and handed to
 * `registerScreeningRoutes` as an opaque dependency; `createWlt1ProviderReceiptAuthenticator(config)`
 * is constructed once in `server.ts` and handed to `registerProviderReceiptRoutes` as an opaque
 * dependency the SAME way (see `provider-receipt.ts`'s own `RegisterProviderReceiptRoutesDeps`).
 * No route file imports `Wlt1Config`, `loadWlt1Config`, or this factory itself — see the committed
 * single-composition-site source guard, `tests/unit/wlt1-receipt-evidence-boundary.test.ts`.
 *
 * The returned `Wlt1ProviderReceiptAuthenticator` closes over `config.providerReceiptSecrets` in a
 * private closure variable; its ONLY method, `.authenticate(claimedProviderId, providedToken)`,
 * takes NO secrets argument at all — there is structurally no way for a caller of `.authenticate`
 * to substitute a different credential authority, because the authority was already fixed at
 * construction time and is never re-read from any call argument.
 *
 * HONEST SCOPE OF WHAT THIS BOUNDARY ACTUALLY PROVES (M-D2-1 correction — do not overstate it):
 * this is a COMPOSITION-SITE boundary, not a cryptographically unforgeable one. It guarantees that
 * every `.authenticate(...)` call reachable from ordinary application code (the real HTTP route,
 * and any test fixture built the same way `lib/screening-application.ts`'s own 43 direct
 * `createScreeningApplication(testWlt1Config())` fixtures are) is checked against the SAME
 * configuration source `loadWlt1Config` produced — never an ad-hoc caller-invented map. It does
 * NOT, and cannot, defend against a hostile actor who can already inject and compile arbitrary new
 * source files into `services/wlt1/src/**` itself (such an actor could always construct a
 * structurally-`Wlt1Config`-shaped object literal and call the exported factory with it — the
 * identical residual risk `createScreeningApplication(config)` has always carried, unaddressed
 * there for the same reason: a TypeScript structural type cannot itself distinguish "produced by
 * `loadWlt1Config`'s own validation pipeline" from "an object literal with the same shape". Closing
 * that residual would require nominally branding `Wlt1Config` itself — a broad, invasive change to
 * a type used throughout every WLT-01 route file, explicitly out of scope for this narrow
 * remediation. The property this fix DOES deliver, and the one Opus's H-D2-1 finding actually
 * named, is the one that matters for THIS module's own attack surface: no exported API takes an
 * arbitrary caller-supplied secrets map and returns a real branded value from it — the credential
 * comparison is reachable ONLY through a config-bound instance, never parameterized per-call.
 *
 * `makeWlt1ProviderReceiptAuthGuard` (the Fastify preHandler) is now a thin wrapper around a given
 * `Wlt1ProviderReceiptAuthenticator` instance — it extracts the two headers, delegates the real
 * comparison to `.authenticate(...)`, and handles the Fastify-specific 401 reply / request
 * decoration on the two possible outcomes. It takes the BOUND authenticator, never a raw secrets
 * map, so this guard itself cannot be constructed with a substitute credential authority either.
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@aix/foundation";
import { meta } from "./request-context.js";
import type { Wlt1Config } from "../config.js";

/** Module-private brand — NEVER exported, in any form (not the symbol itself, not a `typeof`
 * alias, not re-exported by another module). This is what makes `AuthenticatedReceiptProvenance`
 * un-forgeable via a plain object literal from any other file: TypeScript requires the exact same
 * `unique symbol` value to satisfy a computed property key of this type, and no other module can
 * ever spell it. (The brand alone does NOT prevent forgery via THIS module's own construction
 * path being fed fake data — that is what the credential-authority binding above closes; the brand
 * and the authority binding are two separate, complementary controls, not substitutes for each
 * other.) */
const RECEIPT_AUTHENTICATED_BRAND: unique symbol = Symbol("wlt1.receipt_authenticated_provenance");

/** Unforgeable-by-plain-object proof that receipt authentication succeeded, carrying the
 * server-computed SHA-256 payload hash it was minted for. Exported as a TYPE only (for
 * `providers/types.ts`'s own `ScreeningEvidenceEnvelope` union to reference in a type position) —
 * there is no exported value anywhere in this codebase that can construct one except through a
 * config-bound `Wlt1ProviderReceiptAuthenticator`'s own `.authenticate`/`.mintProvenance`. */
export interface AuthenticatedReceiptProvenance {
  readonly [RECEIPT_AUTHENTICATED_BRAND]: true;
  /** Server-computed SHA-256 (64 lowercase hex chars) over the exact raw receipt body bytes —
   * never a caller-supplied value, never derived from parsed/canonicalized JSON. */
  readonly payloadHash: string;
}

/** The capability an authenticated receipt request holds — obtainable ONLY from a config-bound
 * `Wlt1ProviderReceiptAuthenticator`'s `.authenticate(...)` (directly, or via the Fastify guard
 * below, which delegates to the same bound instance) after a REAL credential match against that
 * instance's own closed-over configuration. `providerId` is the AUTHENTICATED identity (never the
 * bare unauthenticated header claim); `mintProvenance` is the only way to turn a server-computed
 * payload hash into `AuthenticatedReceiptProvenance`. */
export interface AuthenticatedProviderReceipt {
  readonly providerId: string;
  mintProvenance(payloadHash: string): AuthenticatedReceiptProvenance;
}

/** Module-private constructor for the capability object — NEVER exported. The ONLY call site is
 * inside `Wlt1ProviderReceiptAuthenticator.authenticate` below, after the credential comparison has
 * already succeeded against that instance's own bound secrets. */
function buildAuthenticatedCapability(providerId: string): AuthenticatedProviderReceipt {
  return {
    providerId,
    mintProvenance(payloadHash: string): AuthenticatedReceiptProvenance {
      return { [RECEIPT_AUTHENTICATED_BRAND]: true, payloadHash };
    },
  };
}

/** A fixed-length placeholder compared against when the claimed provider id has no configured
 * secret (or no token was supplied at all) — ensures the SAME `timingSafeEqual` code path and
 * comparison length always execute, regardless of whether the provider id is known, so response
 * timing carries no provider-existence signal. Never a real credential; structurally cannot equal
 * any real configured secret because the config loader's own validation never persists this exact
 * literal (an operator would have to deliberately choose this precise placeholder string). */
const DUMMY_COMPARISON_SECRET = "x".repeat(64);

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // Different lengths are never equal; timingSafeEqual requires equal-length buffers. Comparing
  // against a fixed-length buffer either way still bounds the leak to length, not content — same
  // established pattern as internal-identity.ts's own constantTimeEquals.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** The bound authentication component — the ONLY thing capable of producing
 * `AuthenticatedProviderReceipt`/`AuthenticatedReceiptProvenance` values. Obtainable ONLY from
 * `createWlt1ProviderReceiptAuthenticator(config)`; carries no method that accepts a secrets map,
 * so a holder of one instance can never redirect it to compare against different credentials. */
export interface Wlt1ProviderReceiptAuthenticator {
  /** Performs the real `timingSafeEqual` comparison against THIS instance's own bound
   * `config.providerReceiptSecrets[claimedProviderId]` (or a fixed-length dummy when the provider
   * id is unconfigured, so timing never signals provider existence) and returns an
   * `AuthenticatedProviderReceipt` capability ONLY when the comparison succeeds — `undefined` on
   * every failure path (unknown provider id, wrong token, missing provider id, missing token, both
   * missing, cross-provider token reuse). There is no separate "just mint it" path and no argument
   * through which a caller can substitute a different credential authority. */
  authenticate(claimedProviderId: string | undefined, providedToken: string | undefined): AuthenticatedProviderReceipt | undefined;
}

/**
 * THE single production construction site for a `Wlt1ProviderReceiptAuthenticator` — module-
 * private credential comparison logic, bound once to `config.providerReceiptSecrets` (the
 * validated map `config.ts`'s `loadWlt1Config` produced) in a closure variable that never changes
 * for the lifetime of the returned instance. Called EXACTLY ONCE per app boot, from `server.ts`'s
 * own `buildApp(config)` — see this file's own header comment (H-D2-1 remediation) for the full
 * rationale and the single-composition-site source guard this mirrors
 * (`lib/screening-application.ts`'s own `createScreeningApplication`, P2CC1-MED-1).
 */
export function createWlt1ProviderReceiptAuthenticator(config: Wlt1Config): Wlt1ProviderReceiptAuthenticator {
  const secrets = config.providerReceiptSecrets;
  return {
    authenticate(claimedProviderId, providedToken) {
      const isKnownProvider = claimedProviderId !== undefined && Object.prototype.hasOwnProperty.call(secrets, claimedProviderId);
      const comparisonSecret = isKnownProvider ? secrets[claimedProviderId as string]! : DUMMY_COMPARISON_SECRET;
      // ALWAYS runs — even when providedToken/claimedProviderId is entirely absent — so a
      // missing-header request and a present-but-wrong-token request take an observably similar
      // code path, never an early-return that skips the comparison outright.
      const tokenMatches = constantTimeEquals(providedToken ?? "", comparisonSecret);

      if (!isKnownProvider || !tokenMatches) return undefined;
      return buildAuthenticatedCapability(claimedProviderId as string);
    },
  };
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set ONLY by `makeWlt1ProviderReceiptAuthGuard` on successful authentication — the
     * AUTHENTICATED capability, never a bare unauthenticated header claim. */
    wlt1ReceiptAuth?: AuthenticatedProviderReceipt;
  }
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function makeWlt1ProviderReceiptAuthGuard(authenticator: Wlt1ProviderReceiptAuthenticator) {
  return async function requireWlt1ProviderReceiptAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const claimedProviderId = headerString(request.headers["x-wlt1-provider-id"]);
    const providedToken = headerString(request.headers["x-wlt1-provider-receipt-token"]);

    const capability = authenticator.authenticate(claimedProviderId, providedToken);

    if (!capability) {
      const err = new AppError("SERVICE_IDENTITY_REQUIRED");
      await reply.code(err.http).send({
        success: false,
        ...meta(request),
        error: { code: err.code, message: err.message, details: err.details },
      });
      return reply;
    }

    request.wlt1ReceiptAuth = capability;
    request.ctx.actor_id = request.ctx.actor_id ?? `wlt1_provider_receipt:${capability.providerId}`;
    request.ctx.actor_type = "service";
  };
}
