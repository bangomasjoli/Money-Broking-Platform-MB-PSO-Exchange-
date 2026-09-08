/**
 * Interim internal-service-identity guard (IAM handoff seam).
 * FND-01 does not build authentication (out of scope §4.1; IAM-01/IAM-02 own it later).
 * Protected/internal endpoints require a shared internal token header and FAIL CLOSED
 * when it is absent or wrong (§5.2). This is deliberately a placeholder to be replaced
 * by IAM-01 service-identity + IAM-02 permission guard.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError, errorEnvelope } from "@aix/foundation";
import { meta } from "./request-context.js";

export function makeInternalIdentityGuard(expectedToken: string) {
  return async function requireInternalIdentity(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const provided = request.headers["x-internal-service-token"];
    const token = Array.isArray(provided) ? provided[0] : provided;
    if (!token || token !== expectedToken) {
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
