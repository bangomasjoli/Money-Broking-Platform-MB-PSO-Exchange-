/**
 * System foundation endpoints: health, readiness, version, time, rate-limit check.
 * (FND-01 §04.3.1–3.3, 3.5, 3.11.) Reads only — no sensitive state mutation, except the
 * rate-limit check's own counter increment (an enforcement decision, not business state).
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, errorEnvelope, getPool, pingDatabase, successEnvelope, systemTime, type Environment } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeRateLimitConsumerGuard } from "../plugins/rate-limit-identity.js";
import { checkRateLimit } from "../lib/rate-limit.js";

export interface ReadinessCheck {
  name: string;
  status: "pass" | "fail" | "not_configured";
  mode?: string;
  note?: string;
  blocking?: boolean;
}

export interface ReadinessInput {
  dbOk: boolean;
  auditOutboxOk: boolean;
  timeSyncOk: boolean;
  environment: Environment;
}

export interface ReadinessResult {
  status: "ready" | "not_ready";
  http: number;
  checks: ReadinessCheck[];
}

/**
 * FND-01 §04.3.2 readiness computation, kept pure so it is unit-testable without a DB.
 * F2: licence_lock_interface is NOT a real check until CFG-01 exists — it is reported as
 * "not_configured" (never a false "pass"). Non-prod treats it as non-blocking (interim);
 * production fails closed (§5.2) so an unreachable-later CFG-01 cannot silently pass.
 */
export function buildReadiness(input: ReadinessInput): ReadinessResult {
  const isProd = input.environment === "prod";
  const licenceLock: ReadinessCheck = {
    name: "licence_lock_interface",
    status: "not_configured",
    mode: "interim_pre_cfg",
    note: "Interim placeholder — CFG-01 will replace this with a real fail-closed licence-lock check.",
    blocking: isProd,
  };

  const checks: ReadinessCheck[] = [
    { name: "database", status: input.dbOk ? "pass" : "fail" },
    { name: "db_backed_queue", status: input.dbOk ? "pass" : "fail" },
    { name: "time_sync", status: input.timeSyncOk ? "pass" : "fail" },
    licenceLock,
    { name: "db_backed_audit_outbox", status: input.auditOutboxOk ? "pass" : "fail" },
  ];

  const hasFailure = checks.some((c) => c.status === "fail");
  const licenceLockBlocks = licenceLock.status === "not_configured" && licenceLock.blocking === true;
  const ready = !hasFailure && !licenceLockBlocks;

  return { status: ready ? "ready" : "not_ready", http: ready ? 200 : 503, checks };
}

/**
 * Shared Rate-Limit Engine request schema (WLT-01 BLOCKER-2 prerequisite, DEC-009). Deliberately
 * does NOT accept `module` (derived from the matched consumer secret — see
 * `plugins/rate-limit-identity.ts`), `cost`, `limit`, `window`, `policy`, or `scope_hash` — none
 * of those are caller-controllable. `additionalProperties: false` rejects anything else.
 */
const RateLimitCheckBody = Type.Object(
  {
    bucket: Type.String({ minLength: 1, maxLength: 64, pattern: "^[A-Z][A-Z0-9_]{0,63}$" }),
    subject_type: Type.String({ minLength: 1, maxLength: 32, pattern: "^[a-z][a-z0-9_]{0,31}$" }),
    subject_id: Type.String({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false },
);

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  const requireRateLimitConsumer = makeRateLimitConsumerGuard(app.config.rateLimitConsumerSecrets);

  app.get("/foundation/health", async (request, reply) => {
    return reply.send(successEnvelope({ status: "alive" }, meta(request)));
  });

  app.get("/foundation/readiness", async (request, reply) => {
    const dbOk = await pingDatabase(getPool());
    const auditOutboxOk = dbOk ? await outboxReachable() : false;
    const result = buildReadiness({
      dbOk,
      auditOutboxOk,
      timeSyncOk: systemTime.driftStatus() === "normal",
      environment: app.config.environment,
    });
    return reply
      .code(result.http)
      .send(successEnvelope({ status: result.status, checks: result.checks }, meta(request)));
  });

  app.get("/foundation/version", async (request, reply) => {
    const cfg = app.config;
    return reply.send(
      successEnvelope(
        {
          application: "aix-money-broking-platform",
          release_version: cfg.releaseVersion,
          artifact_hash: cfg.artifactHash,
          build_time_utc: cfg.buildTimeUtc,
          environment: cfg.environment,
        },
        meta(request),
      ),
    );
  });

  app.get("/foundation/time", async (request, reply) => {
    return reply.send(
      successEnvelope(
        {
          server_time_utc: systemTime.nowUtc(),
          time_source: systemTime.source(),
          clock_drift_status: systemTime.driftStatus(),
        },
        meta(request),
      ),
    );
  });

  // Shared Rate-Limit Engine (§04.3.11, WLT-01 BLOCKER-2 prerequisite, DEC-009). Guarded by a
  // DEDICATED per-consumer-module capability secret — never the general internal-service token
  // — so `module` identity comes from WHICH secret matched, never from the request body.
  app.post(
    "/foundation/rate-limit/check",
    { preHandler: requireRateLimitConsumer, schema: { body: RateLimitCheckBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof RateLimitCheckBody>;
      const module = request.rateLimitConsumerModule as string; // set by the preHandler on success

      const result = await checkRateLimit({
        module,
        bucket: body.bucket,
        subjectType: body.subject_type,
        subjectId: body.subject_id,
        correlationId: request.ctx.correlation_id,
      });

      if (result.decision === "allow") {
        return reply.send(
          successEnvelope({ decision: "allow", limit_ref: result.limitRef, retry_after_seconds: null }, meta(request)),
        );
      }

      // Genuine quota exceeded — 429, never conflated with an unavailable-enforcement 503.
      void reply.header("Retry-After", String(result.retryAfterSeconds));
      const err = new AppError("RATE_LIMITED", {
        details: [{ field: "retry_after_seconds", issue: String(result.retryAfterSeconds) }],
      });
      return reply.code(err.http).send(errorEnvelope(err, meta(request)));
    },
  );
}

async function outboxReachable(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1 FROM foundation.outbox_event LIMIT 1");
    return true;
  } catch {
    return false;
  }
}
