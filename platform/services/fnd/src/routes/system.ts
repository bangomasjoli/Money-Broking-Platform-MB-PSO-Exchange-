/**
 * System foundation endpoints: health, readiness, version, time, rate-limit check.
 * (FND-01 §04.3.1–3.3, 3.5, 3.11.) Reads only — no sensitive state mutation.
 */
import type { FastifyInstance } from "fastify";
import { getPool, pingDatabase, successEnvelope, systemTime, type Environment } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";

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

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
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

  // Rate-limit decision interface baseline (§04.3.11). MVP: allow-by-default, logged seam.
  app.post("/foundation/rate-limit/check", async (request, reply) => {
    return reply.send(
      successEnvelope({ decision: "allow", limit_ref: null, retry_after_seconds: null }, meta(request)),
    );
  });
}

async function outboxReachable(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1 FROM foundation.outbox_event LIMIT 1");
    return true;
  } catch {
    return false;
  }
}
