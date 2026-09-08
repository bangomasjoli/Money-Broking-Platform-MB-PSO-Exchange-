/**
 * KYC-01 service builder. Wires request context, the system routes (health + readiness), the
 * Phase 1 deterministic KYC/KYB evidence-baseline routes (case creation from handoff, document
 * checklist, evidence references, manual/registry verification-result receipt, deterministic CDD
 * outcome computation), the Phase 2A application-level authoritative-outcome publication routes
 * (`routes/outcome-publication.ts`), the Phase 2B CLT-01 outcome-delivery route (same file), the
 * Phase 3A IAM-02-gated sensitive evidence-read route (`routes/sensitive-evidence.ts`), and the
 * Phase 3B maker-checker manual outcome-override routes (`routes/outcome-override.ts`) — plus the
 * no-Exchange boot guard. `buildApp` is pure (no listen/DB connect) so tests can construct the app
 * in isolation — mirrors services/aml1/src/server.ts / services/clt1/src/server.ts /
 * services/cfg1/src/server.ts / services/sec1/src/server.ts / services/iam2/src/server.ts exactly
 * (F3(c): this is KYC-01's own copy, not imported from services/iam, services/iam2, services/sec1,
 * services/cfg1, services/clt1, services/aml1, or services/fnd).
 *
 * Phase 3B does NOT retro-gate the existing 14 routes with IAM-02 — only the two new
 * outcome-override routes are `kyc1.outcome.override`-gated, mirroring Phase 3A's own precedent
 * of gating only the specific new capability, not the service-to-service pipeline (D6, named
 * residual: publish/deliver remain internal-service-token-only).
 */
import Fastify, { type FastifyInstance } from "fastify";
import { assertNoExchangeRuntime } from "@aix/foundation";
import type { Kyc1Config } from "./config.js";
import { registerRequestContext } from "./plugins/request-context.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerHandoffRoutes } from "./routes/handoffs.js";
import { registerCaseRoutes } from "./routes/cases.js";
import { registerEvidenceRoutes } from "./routes/evidence.js";
import { registerVerificationResultRoutes } from "./routes/verification-results.js";
import { registerOutcomeRoutes } from "./routes/outcome.js";
import { registerOutcomePublicationRoutes } from "./routes/outcome-publication.js";
import { registerSensitiveEvidenceRoutes } from "./routes/sensitive-evidence.js";
import { registerOutcomeOverrideRoutes } from "./routes/outcome-override.js";
import { registerRosterSyncRoutes } from "./routes/roster-sync.js";

declare module "fastify" {
  interface FastifyInstance {
    config: Kyc1Config;
  }
}

/**
 * Fastify/pino log-redaction paths — never log secrets (§09 Error Handling / NFR log safety).
 * Exported (rather than inlined into the `Fastify({...})` call) so it is directly unit-testable
 * without needing to introspect pino's internal logger instance — mirrors CFG-01's
 * `CFG1_LOG_REDACT_PATHS` / SEC-01's `SEC1_LOG_REDACT_PATHS` / CLT-01's `CLT1_LOG_REDACT_PATHS` /
 * AML-01's `AML1_LOG_REDACT_PATHS`.
 *
 * Phase 1 addition: `req.body.evidence_ref` is a defensive second layer — KYC-01 never stores raw
 * document content and never returns `evidence_ref` outside its own safe-projection responses, but
 * an opaque evidence reference can still point at a specific real document location, so it is kept
 * out of request/error logs defensively, the same "add the path when the field first exists"
 * discipline every prior module's own redaction list follows.
 */
export const KYC1_LOG_REDACT_PATHS = ["req.headers['x-internal-service-token']", "req.body.evidence_ref"];

export async function buildApp(config: Kyc1Config): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's AJV default is `removeAdditional: true`, which SILENTLY STRIPS unknown
    // body/params fields instead of rejecting the request even when a TypeBox schema sets
    // `additionalProperties: false` (IAM-01_IMPLEMENTATION_NOTES.md §6 gap 10 lesson, reused by
    // every module scaffold since). Set from Phase 0 so the override was already in place before
    // Phase 1's first body-accepting route landed.
    ajv: { customOptions: { removeAdditional: false } },
    // Structured logs; never log secrets (§09 Error Handling / NFR log safety).
    logger: {
      level: config.environment === "prod" ? "info" : "warn",
      redact: {
        paths: KYC1_LOG_REDACT_PATHS,
        censor: "[redacted]",
      },
    },
  });

  app.decorate("config", config);

  await registerRequestContext(app);
  await registerSystemRoutes(app);
  await registerHandoffRoutes(app);
  await registerCaseRoutes(app);
  await registerEvidenceRoutes(app);
  await registerVerificationResultRoutes(app);
  await registerOutcomeRoutes(app);
  await registerOutcomePublicationRoutes(app);
  await registerSensitiveEvidenceRoutes(app);
  await registerOutcomeOverrideRoutes(app);
  await registerRosterSyncRoutes(app);

  await app.ready();

  // §5.7-equivalent boot-time licence lock: no registered route may expose an Exchange runtime
  // surface. Money Broking + PSO only; Exchange application PENDING. Same guard every prior
  // module runs at boot (FND-01 §5.7/§11, reused by IAM-01/IAM-02/SEC-01/CFG-01/CLT-01/AML-01) —
  // checked automatically against Phase 1's own new routes too, not bolted on later.
  const routePaths = app
    .printRoutes({ commonPrefix: false })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  assertNoExchangeRuntime(routePaths);

  return app;
}
