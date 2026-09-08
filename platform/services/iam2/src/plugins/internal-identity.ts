/**
 * IAM-02's OWN interim internal-service-identity guard.
 *
 * Deliberately NOT imported from services/iam or services/fnd (that would violate the F3(c)
 * module-import boundary being proven for this module too) — this is a fresh copy of the
 * same constant-time-comparison pattern IAM-01 uses for its own copy. Fails closed when the
 * header is absent, blank, or wrong. Sensitive internal actions that pass this guard must
 * still emit their own audit event in the route handler.
 *
 * This is an interim seam, same rationale as IAM-01's: the IAM-02_Implementation_Plan_v1.0
 * §5 "Service-identity replacement plan" documents that IAM-02's own guard will eventually
 * become the internal-identity mechanism for inter-service calls (a `service` actor type
 * checked against `iam2.role_permission`), but that is realistically a Phase 6/7 item — the
 * guard needs to exist and work first (this stage) before it can authorize anything else.
 * Until then, IAM-02's own `/internal/iam2/*` endpoints keep a copy of the same interim
 * shared-token guard pattern IAM-01 uses, clearly commented as "replaced once the guard can
 * self-host service-identity."
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

export function makeIam2InternalIdentityGuard(expectedToken: string) {
  return async function requireIam2InternalIdentity(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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
    // Interim: treat the caller as a generic IAM-02 internal service actor.
    request.ctx.actor_id = request.ctx.actor_id ?? "iam2_internal_service";
    request.ctx.actor_type = "service";
  };
}
