/**
 * AML-01 Phase 3C — the manual/periodic_due/list_version_changed re-screen route (confirmed
 * decisions D1/D2). `POST /internal/aml1/screening-requests/:screening_request_id/rescreen` creates
 * a BRAND-NEW `screening_request` — the source request/result/match rows are NEVER mutated (D1:
 * history stays append-only). All the actual lifecycle logic (loop prevention, PII carried forward
 * from the source snapshot rather than resupplied by the caller, the shared Phase 3B provider
 * lifecycle, potential-match risk-signal emission) lives in `lib/rescreen.ts`'s `performRescreen` —
 * the SAME function `routes/monitoring.ts`'s route-triggered monitoring run calls, per the
 * confirmed Phase 3C scope ("create re-screen requests using the same re-screen helper/path
 * logic").
 *
 * `trigger_reason` is restricted to exactly `manual`/`periodic_due`/`list_version_changed` at the
 * schema level (a TypeBox literal union) — `kyc_profile_changed`/`transaction_triggered`/
 * `remediation_check` are structurally impossible to submit, never reaching any application code
 * (confirmed decision D2's own deferral list).
 *
 * IAM-02-gated (`aml1.rescreen.request`, `requires_approval=false` — see migration 040's own header
 * comment for why this is permission-gated only, not a full maker-checker cycle). Internal-only,
 * synchronous, same response contract shape as the original create route.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeAml1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { performRescreen } from "../lib/rescreen.js";
import { fetchSafeScreeningResponse } from "../lib/screening-execution.js";
import { Aml1Error } from "../lib/errors.js";
import type { Aml1Config } from "../config.js";

const ScreeningRequestIdParams = Type.Object({ screening_request_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const RescreenBody = Type.Object(
  {
    trigger_reason: Type.Union([Type.Literal("manual"), Type.Literal("periodic_due"), Type.Literal("list_version_changed")]),
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Aml1Error("AML1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Aml1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

export async function registerRescreenRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeAml1InternalIdentityGuard((app.config as Aml1Config).aml1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/aml1/screening-requests/:screening_request_id/rescreen
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/aml1/screening-requests/:screening_request_id/rescreen",
    { preHandler: requireInternal, schema: { params: ScreeningRequestIdParams, body: RescreenBody } },
    async (request, reply) => {
      const { screening_request_id } = request.params as { screening_request_id: string };
      const body = request.body as Static<typeof RescreenBody>;
      assertPoolAvailable();

      const baseline = await checkPermission(iam2Config(app), {
        actorId: body.requested_by,
        action: "aml1.rescreen.request",
        resource: "screening",
        entityId: screening_request_id,
      });
      if (!baseline.allowed) throw new Aml1Error(baseline.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_PERMISSION_DENIED");

      const outcome = await performRescreen({
        app,
        sourceScreeningRequestId: screening_request_id,
        triggerReason: body.trigger_reason,
        requestedBy: body.requested_by,
        requestId: request.ctx.request_id,
        correlationId: request.ctx.correlation_id,
      });

      if (outcome.kind === "source_not_found") throw new Aml1Error("AML1_SCREENING_REQUEST_NOT_FOUND");
      if (outcome.kind === "not_allowed") throw new Aml1Error("AML1_RESCREEN_NOT_ALLOWED");
      if (outcome.kind === "failed") throw new Aml1Error(outcome.errorCode);
      if (outcome.kind === "aborted") {
        // Phase 3D TX2 concurrency guard — see routes/screening.ts's own identical handling.
        throw new Aml1Error("AML1_SCREENING_REQUEST_INVALID_STATE", {
          message: "This re-screen request was recovered as stuck before the provider response could be recorded.",
        });
      }

      const safeResponse = await fetchSafeScreeningResponse(outcome.screeningRequestId);
      return reply.code(201).send(
        successEnvelope(
          { ...safeResponse, rescreen_of_request_id: screening_request_id, trigger_reason: body.trigger_reason },
          meta(request),
        ),
      );
    },
  );
}
