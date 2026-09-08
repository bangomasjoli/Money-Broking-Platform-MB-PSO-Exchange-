/**
 * Deployment smoke test (FND-01 §04.3.6 / FND-FR-012).
 * Internal identity only. Runs non-destructive checks, records run + per-check evidence,
 * and emits an audit event in the same transaction. Must not create financial state or
 * bypass flags (§04.3.6 rules).
 */
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import {
  getPool,
  pingDatabase,
  publishAudit,
  successEnvelope,
  systemTime,
  withTransaction,
} from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeInternalIdentityGuard } from "../plugins/internal-identity.js";

const SmokeBody = Type.Object(
  {
    scope: Type.Union([
      Type.Literal("pre_deploy"),
      Type.Literal("post_deploy"),
      Type.Literal("manual"),
    ]),
    release_id: Type.Optional(Type.String({ maxLength: 128 })),
  },
  { additionalProperties: false },
);

interface SmokeBodyT {
  scope: "pre_deploy" | "post_deploy" | "manual";
  release_id?: string;
}

interface CheckResult {
  check_name: string;
  check_status: "passed" | "failed" | "skipped";
  severity: "critical" | "high" | "medium" | "low";
  message: string;
}

export async function registerSmokeRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeInternalIdentityGuard(app.config.internalServiceToken);

  app.post(
    "/foundation/smoke-test",
    { preHandler: requireInternal, schema: { body: SmokeBody } },
    async (request, reply) => {
      const body = request.body as SmokeBodyT;
      const smokeTestId = "smoke_" + request.ctx.request_id.replace(/^req_/, "");

      const checks = await runChecks();
      const passed = checks.every((c) => c.check_status !== "failed");

      await withTransaction(async (client: PoolClient) => {
        await client.query(
          `INSERT INTO foundation.smoke_test_run
             (smoke_test_id, release_id, environment, scope, status, started_at_utc, completed_at_utc, triggered_by)
           VALUES ($1, $2, $3, $4, $5, now(), now(), $6)`,
          [
            smokeTestId,
            body.release_id ?? null,
            app.config.environment,
            body.scope,
            passed ? "passed" : "failed",
            request.ctx.actor_id ?? "internal_service",
          ],
        );
        for (const c of checks) {
          await client.query(
            `INSERT INTO foundation.smoke_test_check
               (smoke_test_run_id, check_name, check_status, severity, message, evidence, checked_at_utc)
             VALUES ((SELECT id FROM foundation.smoke_test_run WHERE smoke_test_id = $1), $2, $3, $4, $5, '{}'::jsonb, now())`,
            [smokeTestId, c.check_name, c.check_status, c.severity, c.message],
          );
        }
        await publishAudit(client, {
          event_type: "foundation.smoke_test_run",
          source_module: "FND-01",
          actor_id: request.ctx.actor_id ?? "internal_service",
          actor_type: "service",
          entity_type: "smoke_test_run",
          entity_id: smokeTestId,
          metadata: { scope: body.scope, status: passed ? "passed" : "failed" },
        });
      });

      return reply.send(
        successEnvelope(
          { smoke_test_id: smokeTestId, status: passed ? "passed" : "failed", checks },
          meta(request),
        ),
      );
    },
  );
}

/** Non-destructive foundation checks only. */
async function runChecks(): Promise<CheckResult[]> {
  const dbOk = await pingDatabase(getPool());
  return [
    {
      check_name: "database_reachable",
      check_status: dbOk ? "passed" : "failed",
      severity: "critical",
      message: dbOk ? "database reachable" : "database unreachable",
    },
    {
      check_name: "time_source_healthy",
      check_status: systemTime.driftStatus() === "normal" ? "passed" : "failed",
      severity: "high",
      message: `clock drift ${systemTime.driftStatus()}`,
    },
  ];
}
