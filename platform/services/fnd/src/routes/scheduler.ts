/**
 * Scheduler baseline (FND-01 §04.3.7–3.9 / FND-FR-013/014).
 * GET jobs/runs are reads. POST register is a sensitive action: internal identity,
 * backend validation, owner-must-be-registered, critical/high requires missed-run
 * detection, and an audit event committed in the SAME transaction (§5.5).
 */
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AppError,
  beginIdempotent,
  completeIdempotent,
  getPool,
  publishAudit,
  successEnvelope,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeInternalIdentityGuard } from "../plugins/internal-identity.js";

const RegisterJobBody = Type.Object(
  {
    job_code: Type.String({ minLength: 1, maxLength: 128 }),
    owner_module: Type.String({ minLength: 1, maxLength: 32 }),
    schedule: Type.String({ minLength: 1, maxLength: 256 }),
    criticality: Type.Union([
      Type.Literal("critical"),
      Type.Literal("high"),
      Type.Literal("medium"),
      Type.Literal("low"),
    ]),
    max_lateness_minutes: Type.Integer({ minimum: 0, maximum: 10080 }),
    idempotency_strategy: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

interface RegisterJobBodyT {
  job_code: string;
  owner_module: string;
  schedule: string;
  criticality: "critical" | "high" | "medium" | "low";
  max_lateness_minutes: number;
  idempotency_strategy: string;
}

export async function registerSchedulerRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeInternalIdentityGuard(app.config.internalServiceToken);

  app.get("/foundation/scheduler/jobs", async (request, reply) => {
    const rows = await getPool().query(
      `SELECT job_code, owner_module, criticality, schedule_expression, enabled, missed_run_detection
         FROM foundation.scheduled_job ORDER BY job_code`,
    );
    return reply.send(successEnvelope(rows.rows, meta(request)));
  });

  app.get("/foundation/scheduler/runs", async (request, reply) => {
    const rows = await getPool().query(
      `SELECT job_run_id, job_code, owner_module, scheduled_for_utc, status, correlation_id
         FROM foundation.job_run ORDER BY scheduled_for_utc DESC LIMIT 200`,
    );
    return reply.send(successEnvelope(rows.rows, meta(request)));
  });

  app.post(
    "/foundation/scheduler/jobs/register",
    { preHandler: requireInternal, schema: { body: RegisterJobBody } },
    async (request, reply) => {
      const body = request.body as RegisterJobBodyT;

      // §3.7 idempotency baseline: fail closed before any DB work if the header is absent.
      const idempotencyKey = requireIdempotencyKey(request);
      const actorId = request.ctx.actor_id ?? "internal_service";
      const scope: IdempotencyScope = {
        actorId,
        actorType: "service",
        action: "foundation.scheduler.register",
        key: idempotencyKey,
        request: body,
        sourceModule: "FND-01",
      };

      // Critical/High jobs must have missed-run detection (§3.9 constraint 2).
      const missedRunDetection = body.criticality === "critical" || body.criticality === "high";

      const result = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, scope);
        if (idem.status === "duplicate") {
          // Same key + same fingerprint: replay the prior result, do NOT repeat work/audit.
          const existing = await client.query<{ missed_run_detection: boolean }>(
            `SELECT missed_run_detection FROM foundation.scheduled_job WHERE job_code = $1`,
            [body.job_code],
          );
          return {
            replayed: true as const,
            job_code: body.job_code,
            missed_run_detection: existing.rows[0]?.missed_run_detection ?? missedRunDetection,
          };
        }

        // Owner module must be registered (§04.3.8 rule 1).
        const owner = await client.query(
          `SELECT 1 FROM foundation.module_registry WHERE module_code = $1`,
          [body.owner_module],
        );
        if (owner.rowCount === 0) {
          throw new AppError("MODULE_NOT_REGISTERED", {
            message: `Owner module ${body.owner_module} is not registered.`,
          });
        }

        await client.query(
          `INSERT INTO foundation.scheduled_job
             (job_code, owner_module, schedule_expression, criticality, enabled,
              max_lateness_minutes, idempotency_strategy, missed_run_detection, created_at_utc, updated_at_utc)
           VALUES ($1, $2, $3, $4, true, $5, $6, $7, now(), now())
           ON CONFLICT (job_code) DO UPDATE
             SET schedule_expression = EXCLUDED.schedule_expression,
                 criticality = EXCLUDED.criticality,
                 max_lateness_minutes = EXCLUDED.max_lateness_minutes,
                 idempotency_strategy = EXCLUDED.idempotency_strategy,
                 missed_run_detection = EXCLUDED.missed_run_detection,
                 updated_at_utc = now()`,
          [
            body.job_code,
            body.owner_module,
            body.schedule,
            body.criticality,
            body.max_lateness_minutes,
            body.idempotency_strategy,
            missedRunDetection,
          ],
        );

        // Audit committed in the same tx — registration fails closed if audit cannot write.
        await publishAudit(client, {
          event_type: "foundation.scheduled_job.registered",
          source_module: "FND-01",
          actor_id: actorId,
          actor_type: "service",
          entity_type: "scheduled_job",
          entity_id: body.job_code,
          metadata: { owner_module: body.owner_module, criticality: body.criticality },
        });

        await completeIdempotent(client, scope, body.job_code);

        return { replayed: false as const, job_code: body.job_code, missed_run_detection: missedRunDetection };
      });

      return reply.code(result.replayed ? 200 : 201).send(successEnvelope(result, meta(request)));
    },
  );
}
