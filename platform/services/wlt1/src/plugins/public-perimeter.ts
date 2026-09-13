/**
 * WLT-01 Public Client Surface — perimeter-provenance admission check (`DECISION_LOG.md` DEC-010,
 * L3). Proves a request arrived through the trusted edge (DEC-010 L1/L2 — a trusted reverse
 * proxy / API gateway plus mandatory network isolation, NEITHER implemented by this file; that is
 * DEC-010's separately-blocked Turn 2). This is infrastructure provenance ONLY — never client
 * identity, IAM identity, CLT authority, or internal-service authority. It never reads
 * `Authorization`, never calls IAM-01/CLT-01/FND-01, and never sets `request.ctx.actor_id`/
 * `actor_type`.
 *
 * Installed as an `onRequest` hook, scoped to the encapsulated public-route plugin ONLY
 * (`server.ts`'s own `app.register(async (publicScope) => {...})` wrapping around exactly the
 * six public `/wlt1/*` route registrations) — never the 27 internal `/internal/wlt1/*` routes,
 * never health/readiness. `onRequest` runs before body parsing and strictly before any
 * IAM/CLT/FND HTTP call or idempotency reservation, per DEC-010's frozen request order (step 5,
 * before step 7 IAM introspection) — a rejected request here causes zero downstream calls and
 * zero database writes.
 *
 * A missing, blank, or wrong token throws the SAME shared `AppError("NOT_FOUND")` the app's own
 * `setNotFoundHandler` (`plugins/request-context.ts`) produces for a genuinely unknown route —
 * reused, not hand-built — so the response is indistinguishable from "route does not exist" or
 * "public surface disabled" (when the surface is disabled, this plugin is never registered at
 * all, and the SAME not-found handler fires for the identical reason). A direct-to-service prober
 * therefore learns nothing: not whether the public surface exists, whether a perimeter exists, or
 * whether the token was close/correct. A legitimate client never reaches this branch — the
 * trusted edge always injects the correct value and strips any client-supplied copy (DEC-010 L1).
 *
 * Fresh copy of the same constant-time-comparison pattern `plugins/internal-identity.ts` already
 * uses for its own, structurally distinct, `x-internal-service-token` guard — deliberately NOT
 * imported from it (this credential must never satisfy that guard, or vice versa; keeping the
 * comparison helper local avoids any accidental sharing of trust class).
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@aix/foundation";

export const PUBLIC_PERIMETER_TOKEN_HEADER = "x-aix-perimeter-token";

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // Different lengths are never equal; timingSafeEqual requires equal-length buffers. Comparing
  // against a fixed-length buffer either way still bounds the leak to length, not content.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * `expectedToken` is `config.publicPerimeterToken` — always a validated, non-blank, >=32-char
 * string by the time this is called (server.ts only registers this hook when
 * `config.publicSurfaceEnabled` is true, and `loadWlt1Config` fails startup closed if enabled
 * without a valid token — see config.ts's own header comment).
 */
export function makePublicPerimeterGuard(expectedToken: string) {
  return async function requirePublicPerimeterProvenance(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const provided = request.headers[PUBLIC_PERIMETER_TOKEN_HEADER];
    const token = Array.isArray(provided) ? provided[0] : provided;
    if (!token || !constantTimeEquals(token, expectedToken)) {
      throw new AppError("NOT_FOUND");
    }
  };
}
