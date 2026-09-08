/**
 * SEC-01's OWN generic interim internal-service-identity guard.
 *
 * Deliberately NOT imported from services/iam, services/iam2, or services/fnd (F3(c)
 * import-boundary) — a fresh copy of the same constant-time-comparison pattern every other
 * service uses for its own internal routes. Fails closed when the header is absent, blank, or
 * wrong.
 *
 * NOT mounted on this phase's one route (`POST /internal/sec1/audit-events`) — that route
 * needs to distinguish WHICH of several approved source modules is calling, which a single
 * shared "any internal caller" secret cannot do; it is instead guarded by the more specific
 * per-module source-identity-binding mechanism (plugins/source-identity.ts). This generic
 * guard is scaffolded now anyway (Phase 0 requirement, mirroring IAM-01/IAM-02's own copy so
 * later, non-ingestion internal routes — seal, reconciliation, recovery, all deferred phases —
 * have it ready without a further scaffold patch.
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@aix/foundation";
import { meta } from "./request-context.js";

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // Different lengths are never equal; timingSafeEqual requires equal-length buffers.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function makeSec1InternalIdentityGuard(expectedToken: string) {
  return async function requireSec1InternalIdentity(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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
    request.ctx.actor_id = request.ctx.actor_id ?? "sec1_internal_service";
    request.ctx.actor_type = "service";
  };
}
