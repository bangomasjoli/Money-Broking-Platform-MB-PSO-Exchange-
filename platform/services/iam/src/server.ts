/**
 * IAM-01 service builder. Wires request context, routes, and the no-Exchange boot guard.
 * `buildApp` is pure (no listen/DB connect) so tests can construct the app in isolation —
 * mirrors services/fnd/src/server.ts exactly (F3(c): this is IAM's own copy, not imported
 * from services/fnd).
 */
import Fastify, { type FastifyInstance } from "fastify";
import { assertNoExchangeRuntime } from "@aix/foundation";
import type { IamConfig } from "./config.js";
import { registerRequestContext } from "./plugins/request-context.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerMfaRoutes } from "./routes/mfa.js";
import { registerStepUpRoutes } from "./routes/step-up.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerPasswordResetRoutes } from "./routes/password-reset.js";

declare module "fastify" {
  interface FastifyInstance {
    config: IamConfig;
  }
}

export async function buildApp(config: IamConfig): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's AJV default is `removeAdditional: true`, which SILENTLY STRIPS unknown
    // body/params fields instead of rejecting the request even when a TypeBox schema sets
    // `additionalProperties: false`. That is weaker than the "backend validation" contract
    // (silently dropping an unexpected field can mask a client bug or a smuggled field);
    // override it here so `additionalProperties: false` genuinely rejects with
    // VALIDATION_ERROR (400), matching every route schema in routes/*.ts.
    ajv: { customOptions: { removeAdditional: false } },
    // Structured logs; never log secrets/PII (NFR log safety §09/§5 rule 4). Redact bearer
    // tokens, internal-service token, and every field that could ever carry a raw
    // credential/token/MFA code even if a handler ever logged a body by mistake.
    logger: {
      level: config.environment === "prod" ? "info" : "warn",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers['x-internal-service-token']",
          "req.body.password",
          "req.body.new_password",
          "req.body.refresh_token",
          "req.body.code_or_assertion",
          "req.body.code",
          "req.body.recent_auth_assertion",
          "req.body.credential",
          "req.body.reset_token",
          "req.body.enrolment_session_id",
        ],
        censor: "[redacted]",
      },
    },
  });

  app.decorate("config", config);

  await registerRequestContext(app);
  await registerAuthRoutes(app);
  await registerMfaRoutes(app);
  await registerStepUpRoutes(app);
  await registerInternalRoutes(app);
  await registerPasswordResetRoutes(app);

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
