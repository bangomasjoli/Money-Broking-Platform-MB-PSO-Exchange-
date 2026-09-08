/**
 * IAM-02 service builder. Wires request context, routes, and the no-Exchange boot guard.
 * `buildApp` is pure (no listen/DB connect) so tests can construct the app in isolation —
 * mirrors services/iam/src/server.ts exactly (F3(c): this is IAM-02's own copy, not
 * imported from services/iam or services/fnd).
 */
import Fastify, { type FastifyInstance } from "fastify";
import { assertNoExchangeRuntime } from "@aix/foundation";
import type { Iam2Config } from "./config.js";
import { registerRequestContext } from "./plugins/request-context.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerRoleRoutes } from "./routes/roles.js";
import { registerBootstrapRoutes } from "./routes/bootstrap.js";

declare module "fastify" {
  interface FastifyInstance {
    config: Iam2Config;
  }
}

export async function buildApp(config: Iam2Config): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's AJV default is `removeAdditional: true`, which SILENTLY STRIPS unknown
    // body/params fields instead of rejecting the request even when a TypeBox schema sets
    // `additionalProperties: false` (same lesson IAM-01 learned — see
    // IAM-01_IMPLEMENTATION_NOTES.md §6 gap 10). Override it so `additionalProperties: false`
    // genuinely rejects with VALIDATION_ERROR (400).
    ajv: { customOptions: { removeAdditional: false } },
    // Structured logs; never log secrets (§09 Error Handling / NFR log safety). IAM-02 has
    // no login/session/MFA fields of its own this stage, but the internal-service-token
    // header and the decision-token/assertion field names already known from the blueprint
    // (Phase 3+) are redacted now, before any code path could ever log them.
    logger: {
      level: config.environment === "prod" ? "info" : "warn",
      redact: {
        paths: [
          "req.headers['x-internal-service-token']",
          "req.body.decision_token",
          "req.body.recent_auth_assertion",
          "req.body.step_up_assertion_ref",
        ],
        censor: "[redacted]",
      },
    },
  });

  app.decorate("config", config);

  await registerRequestContext(app);
  await registerInternalRoutes(app);
  await registerApprovalRoutes(app);
  await registerRoleRoutes(app);
  await registerBootstrapRoutes(app);

  await app.ready();

  // §5.7-equivalent boot-time licence lock: no registered route may expose an Exchange
  // runtime surface. IAM-02's catalogue DATA includes prohibited Exchange permission CODES
  // (seeded in infra/migrations/006_iam2_core.cjs) — that is expected and fine; this guard
  // checks registered ROUTES, not catalogue rows, so it does not (and should not) fire on
  // that seed data.
  const routePaths = app
    .printRoutes({ commonPrefix: false })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  assertNoExchangeRuntime(routePaths);

  return app;
}
