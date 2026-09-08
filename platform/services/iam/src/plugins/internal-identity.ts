/**
 * IAM's OWN interim internal-service-identity guard (decision #4).
 *
 * Deliberately NOT imported from services/fnd (that would violate the F3(c) module-import
 * boundary being proven this pass) — this is a fresh copy with one hardening change over
 * FND's version: the token comparison uses `crypto.timingSafeEqual` (constant-time) instead
 * of `!==`, closing FND-01 review observation O2 for IAM's own copy. Fails closed when the
 * header is absent, blank, or wrong. Sensitive internal actions that pass this guard must
 * still emit their own audit event in the route handler.
 *
 * This is an interim seam: it will be replaced by real IAM-01 service identity +
 * IAM-02 permission guard.
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@aix/foundation";
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

export function makeIamInternalIdentityGuard(expectedToken: string) {
  return async function requireIamInternalIdentity(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const provided = request.headers["x-internal-service-token"];
    const token = Array.isArray(provided) ? provided[0] : provided;
    const err = new AppError("SERVICE_IDENTITY_REQUIRED");
    if (!token || !constantTimeEquals(token, expectedToken)) {
      await reply.code(err.http).send({
        success: false,
        ...meta(request),
        error: { code: err.code, message: err.message, details: err.details },
      });
      return reply;
    }
    // Interim: treat the caller as a generic IAM internal service actor.
    request.ctx.actor_id = request.ctx.actor_id ?? "iam_internal_service";
    request.ctx.actor_type = "service";
  };
}
