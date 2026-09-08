/**
 * FND-01 service builder. Wires request context, routes, and the no-Exchange boot guard.
 * `buildApp` is pure (no listen/DB connect) so tests can construct the app in isolation.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { assertNoExchangeRuntime, type AppConfig } from "@aix/foundation";
import { registerRequestContext } from "./plugins/request-context.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerRegistryRoutes } from "./routes/registry.js";
import { registerSchedulerRoutes } from "./routes/scheduler.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerSmokeRoutes } from "./routes/smoke.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    // Structured logs; do not log secrets/PII (NFR log safety). Redact common sensitive headers.
    logger: {
      level: config.environment === "prod" ? "info" : "warn",
      redact: ["req.headers.authorization", "req.headers['x-internal-service-token']"],
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
