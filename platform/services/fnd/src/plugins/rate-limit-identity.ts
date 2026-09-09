/**
 * Shared Rate-Limit Engine — internal caller guard (WLT-01 BLOCKER-2 prerequisite, DEC-009).
 *
 * A DEDICATED capability guard, bound to a PER-CONSUMER-MODULE secret map
 * (`FND_RATE_LIMIT_CONSUMER_SECRETS`, `services/fnd/src/config.ts`) — never the general
 * `INTERNAL_SERVICE_TOKEN`, and never a single shared secret across every consumer. Module
 * identity is derived from WHICH configured secret matched the presented token — a caller
 * NEVER supplies its own module name (the request schema for `POST /foundation/rate-limit/
 * check` has no `module` field at all), so a module's identity is established purely by
 * possession of its own secret, closing the confused-deputy risk a body-supplied module field
 * would otherwise create.
 *
 * Mirrors `services/fnd/src/plugins/internal-identity.ts`'s constant-time comparison
 * (FINDING-1 closure) — each candidate secret is compared with `crypto.timingSafeEqual`, never
 * `===`/`!==`.
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError, errorEnvelope } from "@aix/foundation";
import { meta } from "./request-context.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Set only after `makeRateLimitConsumerGuard` succeeds — the calling module's identity,
     * derived from which configured secret matched. Never trust any other source for this. */
    rateLimitConsumerModule?: string;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function makeRateLimitConsumerGuard(consumerSecrets: Readonly<Record<string, string>>) {
  return async function requireRateLimitConsumer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const provided = request.headers["x-internal-service-token"];
    const token = Array.isArray(provided) ? provided[0] : provided;

    let matchedModule: string | undefined;
    if (token) {
      // Compare against every configured secret — the FIRST match (if any) determines the
      // caller's module identity. No DB work, no counter/policy access happens before this
      // resolves; a rejected caller reaches none of it.
      for (const [moduleId, secret] of Object.entries(consumerSecrets)) {
        if (constantTimeEquals(token, secret)) {
          matchedModule = moduleId;
          break;
        }
      }
    }

    if (!matchedModule) {
      const err = new AppError("SERVICE_IDENTITY_REQUIRED");
      await reply.code(err.http).send(errorEnvelope(err, meta(request)));
      return reply;
    }

    request.rateLimitConsumerModule = matchedModule;
    request.ctx.actor_id = request.ctx.actor_id ?? `${matchedModule.toLowerCase()}_rate_limit_consumer`;
    request.ctx.actor_type = "service";
  };
}
