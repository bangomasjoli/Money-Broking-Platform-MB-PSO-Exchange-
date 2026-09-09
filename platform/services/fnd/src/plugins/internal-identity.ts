/**
 * Interim internal-service-identity guard (IAM handoff seam).
 * FND-01 does not build authentication (out of scope §4.1; IAM-01/IAM-02 own it later).
 * Protected/internal endpoints require a shared internal token header and FAIL CLOSED
 * when it is absent or wrong (§5.2). This is deliberately a placeholder to be replaced
 * by IAM-01 service-identity + IAM-02 permission guard.
 *
 * Shared Rate-Limit Engine implementation (FINDING-1 closure): the token comparison uses
 * `crypto.timingSafeEqual` (constant-time) instead of `!==`, closing FND-01 review
 * observation O2 for FND's own copy — IAM-01 already closed the same observation for its own
 * copy of this guard (`services/iam/src/plugins/internal-identity.ts`). No other behaviour,
 * signature, or route wiring changes.
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError, errorEnvelope } from "@aix/foundation";
import { meta } from "./request-context.js";

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // Different lengths are never equal; timingSafeEqual requires equal-length buffers.
  // Comparing against a fixed-length buffer either way still bounds the leak to length,
  // not content, and length of a shared secret is not itself sensitive here.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function makeInternalIdentityGuard(expectedToken: string) {
  return async function requireInternalIdentity(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const provided = request.headers["x-internal-service-token"];
    const token = Array.isArray(provided) ? provided[0] : provided;
    if (!token || !constantTimeEquals(token, expectedToken)) {
      const err = new AppError("SERVICE_IDENTITY_REQUIRED");
      // Set a resolvable service actor for downstream audit once identity passes.
      await reply.code(err.http).send(errorEnvelope(err, meta(request)));
      return reply;
    }
    // Interim: treat the caller as a generic internal service actor until IAM-01 lands.
    request.ctx.actor_id = request.ctx.actor_id ?? "internal_service";
    request.ctx.actor_type = "service";
  };
}
