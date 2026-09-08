/**
 * SEC-01 Phase 3 seal-verification route (SEC1-FR-006 continuation; approved plan §5/§7).
 *
 * `POST /internal/sec1/seal-batches/:seal_batch_id/verify` is guarded by the GENERIC
 * internal-identity guard (plugins/internal-identity.ts, `SEC1_INTERNAL_SERVICE_TOKEN`) — NOT
 * the per-module source-identity-binding guard (plugins/source-identity.ts is specifically
 * for INGESTION attribution; see that plugin's own header comment). Seal verification is
 * SEC-01's OWN operational/administrative action, not attributable to a specific external
 * source module — this is Phase 3's first actual use of the generic guard, which
 * config.ts's header comment already anticipated ("later phases' non-ingestion internal
 * routes — seal, reconciliation, recovery — have it ready").
 *
 * Standard `Idempotency-Key` requirement (fail closed 400 if missing), `sourceModule:
 * "SEC-01"` idempotency scope (this is SEC-01's own action, not attributable to an external
 * caller module). No IAM-02 permission-guard gating this phase — matches Phase 0-2's posture.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  beginIdempotent,
  completeIdempotent,
  successEnvelope,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeSec1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { verifySealBatch } from "../lib/seal.js";
import { createAlertForFailedSealVerification } from "../lib/alerts.js";
import { writeMonitoringDeadLetter } from "../lib/monitoring-dead-letter.js";

const VerifySealBatchParams = Type.Object(
  { seal_batch_id: Type.String({ minLength: 1, maxLength: 64 }) },
  { additionalProperties: false },
);

export async function registerSealRoutes(app: FastifyInstance): Promise<void> {
  const requireInternalIdentity = makeSec1InternalIdentityGuard(app.config.sec1InternalServiceToken);

  app.post(
    "/internal/sec1/seal-batches/:seal_batch_id/verify",
    { preHandler: requireInternalIdentity, schema: { params: VerifySealBatchParams } },
    async (request, reply) => {
      const { seal_batch_id: sealBatchId } = request.params as Static<typeof VerifySealBatchParams>;
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = request.ctx.actor_id ?? "sec1_internal_service";

      const idemScope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "sec1.seal_batches.verify",
        key: idempotencyKey,
        request: { seal_batch_id: sealBatchId },
        sourceModule: "SEC-01",
      };

      const result = await withTransaction(async (client) => {
        await beginIdempotent(client, idemScope);
        const verifyResult = await verifySealBatch(client, sealBatchId);
        await completeIdempotent(client, idemScope, verifyResult.seal_batch_id);
        return verifyResult;
      });

      // Phase 5: closes the `failed -> alert_created` state-machine transition
      // (06_State_Machine.md §4), symmetric with routes/integrity.ts's own hook. Best-effort,
      // run AFTER `result` is already computed/persisted above; naturally idempotent (de-dupes
      // on an already-open alert for this seal_batch_id) — safe even though this route, unlike
      // integrity's verify-range, re-runs verifySealBatch unconditionally on every call
      // (no idempotent-replay short-circuit exists here — see this route's own header comment).
      if (result.verification_status === "failed") {
        try {
          await withTransaction((client) =>
            createAlertForFailedSealVerification(client, { sealBatchId: result.seal_batch_id }),
          );
        } catch (err) {
          const alertCreationFailureReason = `Failed to create alert for failed seal verification ${result.seal_batch_id}: ${
            err instanceof Error ? err.message : String(err)
          }`;
          try {
            await withTransaction((client) =>
              writeMonitoringDeadLetter(client, {
                auditEventRef: null,
                ruleId: null,
                failureReason: alertCreationFailureReason,
                severity: "critical",
              }),
            );
          } catch (dlqErr) {
            // Monitoring-of-monitoring failure — nothing further to do; the verification
            // result above is already returned to the caller regardless. LOW-1 (Opus review):
            // otherwise-silent, so log it. No sensitive payload/token/raw metadata — only
            // stable identifiers and the two (already-safe, code-generated) failure reasons.
            // Fastify's own request-scoped logger already attaches request/correlation IDs.
            request.log.warn(
              {
                code: "SEC1_MONITORING_DEAD_LETTER_WRITE_FAILED",
                entity_type: "audit_seal_batch",
                entity_id: result.seal_batch_id,
                severity: "critical",
                original_failure_reason: alertCreationFailureReason,
                write_failure_reason: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
              },
              "sec1.monitoring_dead_letter write itself failed",
            );
          }
        }
      }

      return reply.send(successEnvelope(result, meta(request)));
    },
  );
}
