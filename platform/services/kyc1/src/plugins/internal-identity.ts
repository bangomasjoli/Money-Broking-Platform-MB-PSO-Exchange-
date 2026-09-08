/**
 * KYC-01's OWN interim internal-service-identity guard.
 *
 * Deliberately NOT imported from services/fnd, services/iam, services/iam2, services/sec1,
 * services/cfg1, services/clt1, or services/aml1 (that would violate the F3(c) module-import
 * boundary being proven for this module too) — this is a fresh copy of the same constant-time-
 * comparison pattern every prior service uses for its own copy. Fails closed when the header is
 * absent, blank, or wrong.
 *
 * APPROVED PHASE 0 DECISION (carry-forward, not a new one): this is the SAME interim shared-token
 * trust model every other service in this codebase already carries as a documented, non-blocking
 * carry-forward. No final service-identity model is designed here.
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

export function makeKyc1InternalIdentityGuard(expectedToken: string) {
  return async function requireKyc1InternalIdentity(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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
    // Interim: treat the caller as a generic KYC-01 internal service actor. No actor-trust
    // expansion beyond this — a single shared secret still only tells us "some approved
    // internal caller", not which module.
    request.ctx.actor_id = request.ctx.actor_id ?? "kyc1_internal_service";
    request.ctx.actor_type = "service";
  };
}
