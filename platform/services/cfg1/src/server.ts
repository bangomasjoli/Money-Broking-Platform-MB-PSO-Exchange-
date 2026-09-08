/**
 * CFG-01 service builder. Wires request context, the system routes (health, readiness), and the
 * no-Exchange boot guard. `buildApp` is pure (no listen/DB connect) so tests can construct the
 * app in isolation — mirrors services/iam2/src/server.ts / services/sec1/src/server.ts exactly
 * (F3(c): this is CFG-01's own copy, not imported from services/iam, services/iam2,
 * services/sec1, or services/fnd).
 */
import Fastify, { type FastifyInstance } from "fastify";
import { assertNoExchangeRuntime } from "@aix/foundation";
import type { Cfg1Config } from "./config.js";
import { registerRequestContext } from "./plugins/request-context.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerFeatureRoutes } from "./routes/features.js";
import { registerFeatureChangeRoutes } from "./routes/feature-changes.js";
import { registerLicenceChangeRoutes } from "./routes/licence-changes.js";
import { registerKillSwitchRoutes } from "./routes/kill-switches.js";

declare module "fastify" {
  interface FastifyInstance {
    config: Cfg1Config;
  }
}

/**
 * Fastify/pino log-redaction paths — never log secrets (§09 Error Handling / NFR log safety).
 * Exported (rather than inlined into the `Fastify({...})` call) so it is directly unit-testable
 * without needing to introspect pino's internal logger instance — mirrors SEC-01's
 * `SEC1_LOG_REDACT_PATHS` (services/sec1/src/server.ts).
 *
 * Phase 2 addition: `req.body.decision_token` — `POST /internal/cfg1/features/verify-decision`
 * accepts the raw opaque decision token in its request body (approved decision #13: no raw
 * token may be logged) — same redaction discipline SEC-01 Phase 5 applied to its own
 * Critical-alert-closure `decision_token` field.
 */
export const CFG1_LOG_REDACT_PATHS = ["req.headers['x-internal-service-token']", "req.body.decision_token"];

export async function buildApp(config: Cfg1Config): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's AJV default is `removeAdditional: true`, which SILENTLY STRIPS unknown
    // body/params fields instead of rejecting the request even when a TypeBox schema sets
    // `additionalProperties: false` (IAM-01_IMPLEMENTATION_NOTES.md §6 gap 10 lesson, reused
    // by every module scaffold since). Set now so the override is in place before Phase 1+
    // adds the first body-accepting route — no Phase 0 route has a body to exercise this
    // against yet (the one route this phase registers is a bodyless GET).
    ajv: { customOptions: { removeAdditional: false } },
    // Structured logs; never log secrets (§09 Error Handling / NFR log safety).
    logger: {
      level: config.environment === "prod" ? "info" : "warn",
      redact: {
        paths: CFG1_LOG_REDACT_PATHS,
        censor: "[redacted]",
      },
    },
  });

  app.decorate("config", config);

  await registerRequestContext(app);
  await registerSystemRoutes(app);
  await registerFeatureRoutes(app);
  await registerFeatureChangeRoutes(app);
  await registerLicenceChangeRoutes(app);
  await registerKillSwitchRoutes(app);

  await app.ready();

  // §5.5-equivalent boot-time licence lock: no registered route may expose an Exchange runtime
  // surface. Money Broking + PSO only; Exchange application PENDING. Same guard every prior
  // module runs at boot (FND-01 §5.7/§11, reused by IAM-01/IAM-02/SEC-01) — CFG-01 will
  // eventually be the RUNTIME source of truth for this lock (blueprint §5.1), but Phase 0 still
  // carries the same structural, code-level backstop as every other service, independent of any
  // DB state.
  const routePaths = app
    .printRoutes({ commonPrefix: false })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  assertNoExchangeRuntime(routePaths);

  return app;
}
