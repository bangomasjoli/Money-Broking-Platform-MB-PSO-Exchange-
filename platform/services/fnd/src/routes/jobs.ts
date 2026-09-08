/**
 * Background job enqueue (FND-01 §04.3.10 / FND-FR-015/018).
 * Internal identity only. Correlation ID is REQUIRED and the enqueue + audit commit in one
 * transaction (§5.5/§5.6). Public clients must not reach this endpoint.
 */
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AppError,
  beginIdempotent,
  completeIdempotent,
  publishAudit,
  successEnvelope,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeInternalIdentityGuard } from "../plugins/internal-identity.js";

const EnqueueBody = Type.Object(
  {
    job_type: Type.String({ minLength: 1, maxLength: 128 }),
    owner_module: Type.String({ minLength: 1, maxLength: 32 }),
    payload_ref: Type.String({ minLength: 1, maxLength: 512 }),
    idempotency_key: Type.String({ minLength: 1, maxLength: 128 }),
    causation_id: Type.Optional(Type.String({ maxLength: 128 })),
    source_ref: Type.Optional(Type.String({ maxLength: 128 })),
  },
  { additionalProperties: false },
);

interface EnqueueBodyT {
  job_type: string;
  owner_module: string;
  payload_ref: string;
  idempotency_key: string;
  causation_id?: string;
  source_ref?: string;
}

export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeInternalIdentityGuard(app.config.internalServiceToken);

  app.post(
    "/foundation/jobs/enqueue",
    { preHandler: requireInternal, schema: { body: EnqueueBody } },
    async (request, reply) => {
      const body = request.body as EnqueueBodyT;
      const correlationId = request.ctx.correlation_id;
      if (!correlationId) {
        // Defence in depth: context always sets one, but a queued job without a trace fails closed.
        throw new AppError("ASYNC_CORRELATION_MISSING");
      }

      // §3.7 idempotency baseline: fail closed before any DB work if the header is absent.
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = request.ctx.actor_id ?? "internal_service";
      const scope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "foundation.jobs.enqueue",
        key: idempotencyKey,
        request: body,
        sourceModule: "FND-01",
      };

      const queueMessageId = "qmsg_" + body.idempotency_key;

      const result = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, scope);
        if (idem.status === "duplicate") {
          // Same key + same fingerprint: replay the prior result, do NOT repeat work/audit.
          return {
            replayed: true as const,
            queue_message_id: idem.resultRef ?? queueMessageId,
            status: "queued",
            correlation_id: correlationId,
          };
        }

        await client.query(
          `INSERT INTO foundation.job_queue_message
             (queue_message_id, job_type, owner_module, payload_ref, status, correlation_id,
              causation_id, source_ref, idempotency_key, available_at_utc, attempt_count, max_attempts,
              created_at_utc, updated_at_utc)
           VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, $8, now(), 0, 5, now(), now())
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            queueMessageId,
            body.job_type,
            body.owner_module,
            body.payload_ref,
            correlationId,
            body.causation_id ?? null,
            body.source_ref ?? null,
            body.idempotency_key,
          ],
        );

        await publishAudit(client, {
          event_type: "foundation.job.enqueued",
          source_module: "FND-01",
          actor_id: actorId,
          actor_type: "service",
          entity_type: "job_queue_message",
          entity_id: queueMessageId,
          metadata: { job_type: body.job_type, owner_module: body.owner_module },
        });

        await completeIdempotent(client, scope, queueMessageId);

        return { replayed: false as const, queue_message_id: queueMessageId, status: "queued", correlation_id: correlationId };
      });

      return reply.code(result.replayed ? 200 : 202).send(successEnvelope(result, meta(request)));
    },
  );
}
