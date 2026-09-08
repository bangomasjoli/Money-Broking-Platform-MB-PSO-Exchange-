/**
 * CLT-01 service builder. Wires request context, the system routes (health + readiness), the
 * Phase 1 application-intake routes, the Phase 2 outcome/handoff routes, the Phase 2
 * review/approve/reject/hold decision routes, the Phase 2 client-status route (Phase 3- and
 * Phase 4-extended with capability-readiness fields), the Phase 3 authorised-user routes, the
 * Phase 3 mandate routes, the Phase 4 authorised-party routes, the Phase 5 related-party-edge
 * routes, the Phase 6 duplicate-candidate routes, the Phase 8 client_profile lifecycle routes, the
 * Phase 4A application-keyed KYC roster contract, and the no-Exchange boot guard. `buildApp` is pure (no listen/DB connect) so tests can
 * construct the app in isolation — mirrors services/iam2/src/server.ts / services/sec1/src/
 * server.ts / services/cfg1/src/server.ts exactly (F3(c): this is CLT-01's own copy, not imported
 * from services/iam, services/iam2, services/sec1, services/cfg1, or services/fnd).
 */
import Fastify, { type FastifyInstance } from "fastify";
import { assertNoExchangeRuntime } from "@aix/foundation";
import type { Clt1Config } from "./config.js";
import { registerRequestContext } from "./plugins/request-context.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerApplicationRoutes } from "./routes/applications.js";
import { registerOutcomeRoutes } from "./routes/outcomes.js";
import { registerDecisionRoutes } from "./routes/decisions.js";
import { registerClientRoutes } from "./routes/clients.js";
import { registerAuthorisedUserRoutes } from "./routes/authorised-users.js";
import { registerPrincipalMembershipRoutes } from "./routes/principal-memberships.js";
import { registerMandateRoutes } from "./routes/mandates.js";
import { registerAuthorisedPartyRoutes } from "./routes/authorised-parties.js";
import { registerApplicationAuthorisedPartyRoutes } from "./routes/application-authorised-parties.js";
import { registerRelatedPartyEdgeRoutes } from "./routes/related-party-edges.js";
import { registerDuplicateCandidateRoutes } from "./routes/duplicate-candidates.js";
import { registerClientProfileLifecycleRoutes } from "./routes/client-profiles.js";
import { registerKycRosterRoutes } from "./routes/kyc-roster.js";

declare module "fastify" {
  interface FastifyInstance {
    config: Clt1Config;
  }
}

/**
 * Fastify/pino log-redaction paths — never log secrets (§09 Error Handling / NFR log safety).
 * Exported (rather than inlined into the `Fastify({...})` call) so it is directly unit-testable
 * without needing to introspect pino's internal logger instance — mirrors SEC-01's
 * `SEC1_LOG_REDACT_PATHS` and CFG-01's `CFG1_LOG_REDACT_PATHS`.
 *
 * Phase 1 addition: `client_application` stores real intake PII (approved design decision — PII
 * is stored but never RETURNED by any route response; see lib/applications.ts's
 * `safeApplicationResponse`). These paths are a defensive second layer so the raw request bodies
 * carrying that PII are never written to the request/error logs either, even though the standard
 * error handler (plugins/request-context.ts) already never logs bodies on its own.
 */
export const CLT1_LOG_REDACT_PATHS = [
  "req.headers['x-internal-service-token']",
  "req.body.legal_name",
  "req.body.applicant_email",
  "req.body.registration_number",
  "req.body.country_of_incorporation",
  "req.body.evidence_ref",
  "req.body.given_by",
  "req.body.created_by",
  "req.body.assigned_reviewer",
  // Phase 2 — free-text reviewer/decision-context fields. Not schema-defined PII, but a human
  // reviewer could type something sensitive into a reason field; redacted defensively, same
  // caution applied to evidence_ref above.
  "req.body.reason",
  // Phase 3 — declared authorised-user identity (name/email/external reference). Stored but
  // never returned by the default list route (lib/authorised-users.ts's
  // safeAuthorisedUserResponse); redacted from request logs for the same reason legal_name/
  // applicant_email are.
  "req.body.user_reference",
  // Phase 4 — declared authorised-party identity (director/UBO/controller/signatory name or
  // reference). Same posture as user_reference above: stored, never returned by the default list
  // route (lib/authorised-parties.ts's safeAuthorisedPartyResponse), redacted from request logs.
  "req.body.party_reference",
];

export async function buildApp(config: Clt1Config): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's AJV default is `removeAdditional: true`, which SILENTLY STRIPS unknown
    // body/params fields instead of rejecting the request even when a TypeBox schema sets
    // `additionalProperties: false` (IAM-01_IMPLEMENTATION_NOTES.md §6 gap 10 lesson, reused by
    // every module scaffold since). Set now so the override is in place before Phase 1+ adds
    // the first body-accepting route — no Phase 0 route has a body to exercise this against yet
    // (the one route this phase registers is a bodyless GET).
    ajv: { customOptions: { removeAdditional: false } },
    // Structured logs; never log secrets (§09 Error Handling / NFR log safety).
    logger: {
      level: config.environment === "prod" ? "info" : "warn",
      redact: {
        paths: CLT1_LOG_REDACT_PATHS,
        censor: "[redacted]",
      },
    },
  });

  app.decorate("config", config);

  await registerRequestContext(app);
  await registerSystemRoutes(app);
  await registerApplicationRoutes(app);
  await registerOutcomeRoutes(app);
  await registerDecisionRoutes(app);
  await registerClientRoutes(app);
  await registerAuthorisedUserRoutes(app);
  await registerPrincipalMembershipRoutes(app);
  await registerMandateRoutes(app);
  await registerAuthorisedPartyRoutes(app);
  await registerApplicationAuthorisedPartyRoutes(app);
  await registerRelatedPartyEdgeRoutes(app);
  await registerDuplicateCandidateRoutes(app);
  await registerClientProfileLifecycleRoutes(app);
  await registerKycRosterRoutes(app);

  await app.ready();

  // §5.7-equivalent boot-time licence lock: no registered route may expose an Exchange runtime
  // surface. Money Broking + PSO only; Exchange application PENDING. Same guard every prior
  // module runs at boot (FND-01 §5.7/§11, reused by IAM-01/IAM-02/SEC-01/CFG-01) — CLT-01 has
  // no business routes yet this phase, but the guard is wired in from the start so every future
  // phase's routes are checked automatically, not bolted on later.
  const routePaths = app
    .printRoutes({ commonPrefix: false })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  assertNoExchangeRuntime(routePaths);

  return app;
}
