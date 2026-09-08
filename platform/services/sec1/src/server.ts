/**
 * SEC-01 service builder. Wires request context, routes, and the no-Exchange boot guard.
 * `buildApp` is pure (no listen/DB connect) so tests can construct the app in isolation —
 * mirrors services/iam2/src/server.ts exactly (F3(c): this is SEC-01's own copy, not imported
 * from services/iam, services/iam2, or services/fnd).
 */
import Fastify, { type FastifyInstance } from "fastify";
import { assertNoExchangeRuntime } from "@aix/foundation";
import type { Sec1Config } from "./config.js";
import { registerRequestContext } from "./plugins/request-context.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerSealRoutes } from "./routes/seals.js";
import { registerIntegrityRoutes } from "./routes/integrity.js";
import { registerReadRoutes } from "./routes/read.js";
import { registerAlertRoutes } from "./routes/alerts.js";

declare module "fastify" {
  interface FastifyInstance {
    config: Sec1Config;
  }
}

/**
 * Fastify/pino log-redaction paths — never log secrets (§09 Error Handling / NFR log safety).
 * Exported (rather than inlined into the `Fastify({...})` call) so it is directly unit-testable
 * without needing to introspect pino's internal logger instance.
 *
 * `req.body.decision_token` (LOW-3, Opus review): Phase 5's Critical-alert-closure
 * `POST /internal/sec1/security-alerts/close` accepts a single-use, payload-bound bearer token
 * in `decision_token` — hash-only-at-rest on IAM-02's own side (`iam2.permission_decision_
 * token.token_hash`), but the RAW token value transits this route's request body, so it must
 * never appear in a log line the same way the ingestion bearer token / raw metadata already
 * don't. `approval_id` is NOT redacted — it identifies an approval record, not a secret bearer
 * credential (same distinction IAM-02 itself draws between `decision_token` and `approval_id`).
 */
export const SEC1_LOG_REDACT_PATHS = [
  "req.headers['x-internal-service-token']",
  "req.body.metadata",
  "req.body.decision_token",
];

export async function buildApp(config: Sec1Config): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's AJV default is `removeAdditional: true`, which SILENTLY STRIPS unknown
    // body/params fields instead of rejecting the request even when a TypeBox schema sets
    // `additionalProperties: false` (IAM-01_IMPLEMENTATION_NOTES.md §6 gap 10 lesson, reused
    // by every module scaffold since). Override it so `additionalProperties: false` genuinely
    // rejects with VALIDATION_ERROR (400).
    ajv: { customOptions: { removeAdditional: false } },
    // Structured logs; never log secrets (§09 Error Handling / NFR log safety). The ingestion
    // bearer token header, raw metadata, and the Phase 5 decision_token are redacted before any
    // code path could ever log them.
    logger: {
      level: config.environment === "prod" ? "info" : "warn",
      redact: {
        paths: SEC1_LOG_REDACT_PATHS,
        censor: "[redacted]",
      },
    },
  });

  app.decorate("config", config);

  await registerRequestContext(app);
  await registerInternalRoutes(app);
  // Phase 3: seal-verification and integrity-verification-run internal routes — both
  // guarded by the generic internal-identity guard (this phase's first actual use of it),
  // not the ingestion-specific source-identity guard. See routes/seals.ts / routes/
  // integrity.ts header comments.
  await registerSealRoutes(app);
  await registerIntegrityRoutes(app);
  // Phase 4: audit search/detail-read internal routes — same generic internal-identity guard
  // as seal-verify/integrity-verify-range, plus the IAM-02 permission-guard HTTP dependency
  // (lib/iam2-client.ts). See routes/read.ts header comment for the authorization order.
  await registerReadRoutes(app);
  // Phase 5: security alert lifecycle (search/read/assign/triage/close) + monitoring
  // dead-letter replay internal routes — same generic internal-identity guard + IAM-02
  // permission-guard HTTP dependency as Phase 4's read routes. See routes/alerts.ts header
  // comment for the Critical-alert-closure decision-token model.
  await registerAlertRoutes(app);

  await app.ready();

  // §5.7-equivalent boot-time licence lock: no registered route may expose an Exchange
  // runtime surface. Money Broking + PSO only; Exchange application PENDING.
  const routePaths = app
    .printRoutes({ commonPrefix: false })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  assertNoExchangeRuntime(routePaths);

  return app;
}
