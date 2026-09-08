/**
 * AML-01 service builder. Wires request context, the system routes (health + readiness), the
 * Phase 1 screening-request routes (Phase 3B: two-phase lifecycle + provider adaptor boundary), the
 * Phase 2A CLT-01 outcome-delivery routes, the Phase 2B match-inventory/sensitive-read/disposition
 * routes, the Phase 3B provider-status route, the Phase 3C re-screen/monitoring-run/risk-signal
 * routes, and the no-Exchange boot guard. `buildApp` is pure (no listen/DB connect) so tests can
 * construct the app in isolation — mirrors services/iam2/src/server.ts / services/sec1/src/
 * server.ts / services/cfg1/src/server.ts / services/clt1/src/server.ts exactly (F3(c): this is
 * AML-01's own copy, not imported from services/iam, services/iam2, services/sec1, services/cfg1,
 * services/clt1, or services/fnd).
 */
import Fastify, { type FastifyInstance } from "fastify";
import { assertNoExchangeRuntime } from "@aix/foundation";
import type { Aml1Config } from "./config.js";
import { registerRequestContext } from "./plugins/request-context.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerScreeningRoutes } from "./routes/screening.js";
import { registerCltOutcomeDeliveryRoutes } from "./routes/clt-outcome-delivery.js";
import { registerMatchRoutes } from "./routes/matches.js";
import { registerProviderRoutes } from "./routes/provider.js";
import { registerRescreenRoutes } from "./routes/rescreen.js";
import { registerMonitoringRoutes } from "./routes/monitoring.js";
import { registerRiskSignalRoutes } from "./routes/risk-signals.js";
import { registerStuckScreeningRoutes } from "./routes/stuck-screening.js";
import { registerPreTransactionRoutes } from "./routes/pre-transaction.js";

declare module "fastify" {
  interface FastifyInstance {
    config: Aml1Config;
  }
}

/**
 * Fastify/pino log-redaction paths — never log secrets (§09 Error Handling / NFR log safety).
 * Exported (rather than inlined into the `Fastify({...})` call) so it is directly unit-testable
 * without needing to introspect pino's internal logger instance — mirrors CFG-01's
 * `CFG1_LOG_REDACT_PATHS` / SEC-01's `SEC1_LOG_REDACT_PATHS` / CLT-01's `CLT1_LOG_REDACT_PATHS`.
 *
 * Phase 1 addition: `POST .../screening-requests` accepts the declared-identity subject's PII
 * in its request body (`req.body.declared_identity.*`) — approved design decision: PII is stored
 * but never RETURNED by any route response (see lib/screening.ts's `safeScreeningResponse`); these
 * paths are a defensive second layer so the raw request body carrying that PII is never written
 * to the request/error logs either, same "add the path when the field first exists" discipline
 * every prior module's own redaction list followed (mirrors CLT-01's own Phase 1
 * `CLT1_LOG_REDACT_PATHS` additions exactly).
 *
 * Phase 2B additions: `req.body.reason` (disposition free text — an operator could write anything
 * in it, so it is redacted defensively even though it is not structured PII) and
 * `req.body.decision_token` (the raw IAM-02 decision token — never logged, mirrors CLT-01's own
 * `CLT1_LOG_REDACT_PATHS` Phase 2 addition for the identical field).
 *
 * Phase 3B: NO new path added. `req.body.subject_nature` (the new field on the screening-request
 * body) is a classification (`individual`/`entity`), not PII — no redaction needed. The screening
 * provider's raw request/response payloads are NEVER logged in the first place (they exist only as
 * in-memory values passed between `routes/screening.ts` and `lib/providers/registry.ts`, never
 * attached to any Fastify request/reply object Pino would serialize) — only their `fingerprint()`
 * hashes are ever persisted (`screening_provider_attempt.request_payload_hash`/
 * `response_payload_hash`), so there is no `req.*`/`res.*` path for a provider payload to redact.
 */
export const AML1_LOG_REDACT_PATHS = [
  "req.headers['x-internal-service-token']",
  "req.body.declared_identity.name",
  "req.body.declared_identity.registration_number",
  "req.body.declared_identity.date_of_birth",
  "req.body.declared_identity.nationality",
  "req.body.reason",
  "req.body.decision_token",
];

export async function buildApp(config: Aml1Config): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's AJV default is `removeAdditional: true`, which SILENTLY STRIPS unknown
    // body/params fields instead of rejecting the request even when a TypeBox schema sets
    // `additionalProperties: false` (IAM-01_IMPLEMENTATION_NOTES.md §6 gap 10 lesson, reused by
    // every module scaffold since). Set from Phase 0 so the override was already in place before
    // Phase 1's first body-accepting route (`POST .../screening-requests`) landed.
    ajv: { customOptions: { removeAdditional: false } },
    // Structured logs; never log secrets (§09 Error Handling / NFR log safety).
    logger: {
      level: config.environment === "prod" ? "info" : "warn",
      redact: {
        paths: AML1_LOG_REDACT_PATHS,
        censor: "[redacted]",
      },
    },
  });

  app.decorate("config", config);

  await registerRequestContext(app);
  await registerSystemRoutes(app);
  await registerScreeningRoutes(app);
  await registerCltOutcomeDeliveryRoutes(app);
  await registerMatchRoutes(app);
  await registerProviderRoutes(app);
  await registerRescreenRoutes(app);
  await registerMonitoringRoutes(app);
  await registerRiskSignalRoutes(app);
  await registerStuckScreeningRoutes(app);
  await registerPreTransactionRoutes(app);

  await app.ready();

  // §5.7-equivalent boot-time licence lock: no registered route may expose an Exchange runtime
  // surface. Money Broking + PSO only; Exchange application PENDING. Same guard every prior
  // module runs at boot (FND-01 §5.7/§11, reused by IAM-01/IAM-02/SEC-01/CFG-01/CLT-01) — checked
  // automatically against Phase 1's own new screening-request routes too, not bolted on later.
  const routePaths = app
    .printRoutes({ commonPrefix: false })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  assertNoExchangeRuntime(routePaths);

  return app;
}
