/**
 * FND-01 service builder. Wires request context, routes, and the no-Exchange boot guard.
 * `buildApp` is pure (no listen/DB connect) so tests can construct the app in isolation.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { assertNoExchangeRuntime } from "@aix/foundation";
import type { FndConfig } from "./config.js";
import { registerRequestContext } from "./plugins/request-context.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerRegistryRoutes } from "./routes/registry.js";
import { registerSchedulerRoutes } from "./routes/scheduler.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerSmokeRoutes } from "./routes/smoke.js";

declare module "fastify" {
  interface FastifyInstance {
    config: FndConfig;
  }
}

/**
 * FND-01's structured-log redaction paths (NFR log safety) — extracted to a named export so it
 * can be asserted directly, mirroring every sibling service's own copy (WLT1_LOG_REDACT_PATHS /
 * CLT1_LOG_REDACT_PATHS / IAM_LOG_REDACT_PATHS / CFG1_LOG_REDACT_PATHS / SEC1_LOG_REDACT_PATHS /
 * AML1_LOG_REDACT_PATHS / KYC1_LOG_REDACT_PATHS). Same two paths FND already redacted (now
 * named, not behaviour-changed): `x-internal-service-token` covers BOTH the general internal
 * guard AND the Shared Rate-Limit Engine's own dedicated per-consumer-module secret — the same
 * header name is presented in both cases, so no new redaction target is needed for the rate-
 * limit consumer guard. The rate-limit request body (`bucket`/`subject_type`/`subject_id`)
 * carries no secret — `subject_id` is a caller-resolved identifier (e.g. `client_id`), the same
 * class of non-secret internal ID already routinely logged platform-wide.
 */
export const FND_LOG_REDACT_PATHS = ["req.headers.authorization", "req.headers['x-internal-service-token']"];

export async function buildApp(config: FndConfig): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's AJV default is `removeAdditional: true`, which SILENTLY STRIPS unknown
    // body/params fields instead of rejecting the request even when a TypeBox schema sets
    // `additionalProperties: false` (established platform-wide fix — every sibling service's
    // own `server.ts` already sets this; FND's own rate-limit-check schema now depends on it
    // genuinely rejecting an extra `module`/`cost`/arbitrary field, not silently dropping it).
    ajv: { customOptions: { removeAdditional: false } },
    // Structured logs; do not log secrets/PII (NFR log safety). Redact common sensitive headers.
    logger: {
      level: config.environment === "prod" ? "info" : "warn",
      redact: FND_LOG_REDACT_PATHS,
    },
  });

  app.decorate("config", config);

  await registerRequestContext(app);
  await registerSystemRoutes(app);
  await registerRegistryRoutes(app);
  await registerSchedulerRoutes(app);
  await registerJobRoutes(app);
  await registerSmokeRoutes(app);

  await app.ready();

  // §5.7 boot-time licence lock: no registered route may expose an Exchange runtime surface.
  const routePaths = app
    .printRoutes({ commonPrefix: false })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  assertNoExchangeRuntime(routePaths);

  return app;
}
