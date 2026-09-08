/**
 * WLT-01 service builder. Wires request context, the system routes (health only this phase), and
 * the no-Exchange boot guard. `buildApp` is pure (no listen/DB connect) so tests can construct
 * the app in isolation — mirrors services/aml1/src/server.ts / services/clt1/src/server.ts /
 * services/kyc1/src/server.ts exactly (F3(c): this is WLT-01's own copy, not imported from
 * services/aml1, services/clt1, services/kyc1, services/cfg1, services/sec1, services/iam2, or
 * services/fnd).
 *
 * Phase 2C-C2 (P2CC1-MED-1 closure): `buildApp` is the SOLE production call site that constructs
 * a `ScreeningApplicationService` — `createScreeningApplication(config)`, called exactly ONCE per
 * app boot from this function's own validated `config` argument (which, in real server startup,
 * originates from `config.ts`'s `loadWlt1Config` — never hand-assembled). The constructed service
 * is handed to `registerScreeningRoutes` as an opaque dependency; no route file imports the
 * factory or the config loader — see `tests/unit/wlt1-screening-composition-boundary.test.ts` for
 * the committed source guard proving this. Per-`buildApp`-call instance, never a cross-app global
 * singleton, so two independently configured apps (e.g. different
 * `WLT1_SCREENING_MAX_VALIDITY_HOURS` values) each get their own correctly-scoped ceiling.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { assertNoExchangeRuntime } from "@aix/foundation";
import type { Wlt1Config } from "./config.js";
import { registerRequestContext } from "./plugins/request-context.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerWalletDestinationRoutes } from "./routes/wallet-destinations.js";
import { registerScreeningRoutes } from "./routes/wallet-screening.js";
import { registerProviderReceiptRoutes } from "./routes/provider-receipt.js";
import { registerProofOfControlRoutes } from "./routes/proof-of-control.js";
import { registerDestinationApprovalRoutes } from "./routes/destination-approval.js";
import { registerEvaluateUseRoutes } from "./routes/evaluate-use.js";
import { registerDecisionVerifyRoutes } from "./routes/decision-verify.js";
import { registerDecisionConsumeRoutes } from "./routes/decision-consume.js";
import { registerDestinationRevokeRoutes } from "./routes/destination-revoke.js";
import { registerAmlRevocationRoutes } from "./routes/aml-revocation.js";
import { registerRescreeningRunRoutes } from "./routes/rescreening-run.js";
import { registerFiatPayoutDestinationRoutes } from "./routes/payout-destinations.js";
import { registerEvidenceExportRoutes } from "./routes/evidence-export.js";
import { registerInboundSourceScreeningRoutes } from "./routes/inbound-source-screening.js";
import { registerStuckScreeningRoutes } from "./routes/stuck-screening.js";
import { createScreeningApplication } from "./lib/screening-application.js";
import { createWlt1ProviderReceiptAuthenticator } from "./plugins/receipt-auth.js";

declare module "fastify" {
  interface FastifyInstance {
    config: Wlt1Config;
  }
}

/**
 * Fastify/pino log-redaction paths — never log secrets (mirrors AML1_LOG_REDACT_PATHS /
 * CLT1_LOG_REDACT_PATHS / CFG1_LOG_REDACT_PATHS / SEC1_LOG_REDACT_PATHS). Phase 1B addition:
 * `req.body.address`/`req.body.memo_tag` — the wallet-registration route's own restricted/
 * AML-sensitive request fields (`16_Data_Classification.md`); a full address is never returned by
 * any Phase 1B response either (see `lib/safe-response.ts`'s own masking), but this is a defensive
 * second layer so the raw request body carrying it is never written to the request/error logs.
 */
export const WLT1_LOG_REDACT_PATHS = [
  "req.headers['x-internal-service-token']",
  "req.body.address",
  "req.body.memo_tag",
  // Phase 2C-D1: the provider-receipt authentication secret must never reach any log line, same
  // rationale as x-internal-service-token above.
  "req.headers['x-wlt1-provider-receipt-token']",
  // Phase 4A-1: the IAM-02 decision token must never reach any log line — same rationale as every
  // other secret above.
  "req.body.decision_token",
  // Fiat Payout Destinations (APAC): the raw bank account identifier and beneficiary name are
  // Restricted/AML-sensitive request fields — never written to the request/error logs, same
  // rationale as req.body.address/req.body.memo_tag above. bank_identifier (BIC)/branch_identifier
  // are deliberately NOT redacted — both are public routing data, returned unmasked in every API
  // response.
  "req.body.account_identifier",
  "req.body.beneficiary_name",
];

export async function buildApp(config: Wlt1Config): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's AJV default is `removeAdditional: true`, which SILENTLY STRIPS unknown
    // body/params fields instead of rejecting the request even when a TypeBox schema sets
    // `additionalProperties: false` (IAM-01_IMPLEMENTATION_NOTES.md §6 gap 10 lesson, reused by
    // every module scaffold since). Set from Phase 0 so the override is already in place before
    // Phase 1's first body-accepting route lands.
    ajv: { customOptions: { removeAdditional: false } },
    // Structured logs; never log secrets.
    logger: {
      level: config.environment === "prod" ? "info" : "warn",
      redact: {
        paths: WLT1_LOG_REDACT_PATHS,
        censor: "[redacted]",
      },
    },
  });

  app.decorate("config", config);

  // P2CC1-MED-1 closure — constructed exactly once, here, from this call's own validated config.
  // No route file may construct this service itself.
  const screeningApplication = createScreeningApplication(config);

  // H-D2-1 closure (Phase 2C-D2R) — constructed exactly once, here, from this call's own validated
  // config, mirroring the screening-application composition above. No route file may construct
  // this authenticator itself; see receipt-auth.ts's own header comment.
  const receiptAuthenticator = createWlt1ProviderReceiptAuthenticator(config);

  await registerRequestContext(app);
  await registerSystemRoutes(app);
  await registerWalletDestinationRoutes(app);
  await registerScreeningRoutes(app, { screeningApplication });
  // Phase 2C-D3B: the SAME `screeningApplication` instance constructed once above (never a second
  // `createScreeningApplication(config)` call — P2CC1-MED-1's single-construction-site invariant is
  // unaffected by handing the existing instance to a second route) is now also the sole terminal-
  // application authority the receipt route uses.
  await registerProviderReceiptRoutes(app, { receiptAuthenticator, screeningMaxValidityHours: config.screeningMaxValidityHours, screeningApplication });
  // Phase 3A-2: challenge issuance + current-proof read surface. No injected service — reads
  // config directly (mirrors wallet-destinations.ts's own dependency-free registration).
  await registerProofOfControlRoutes(app);
  // Phase 4A-1: destination whitelist maker-checker approval. No injected service — reads config
  // directly (mirrors proof-of-control.ts's own dependency-free registration).
  await registerDestinationApprovalRoutes(app);
  // Phase 4A-2: evaluate-use + opaque decision-token issuance. No injected service — reads config
  // directly.
  await registerEvaluateUseRoutes(app);
  // Phase 4A-3: read-only destination-decision verification. No injected service — reads config
  // directly (mirrors evaluate-use.ts's own dependency-free registration).
  await registerDecisionVerifyRoutes(app);
  // Phase 4B: single-use verify-and-consume. No injected service — reads config directly (mirrors
  // decision-verify.ts's own dependency-free registration).
  await registerDecisionConsumeRoutes(app);
  // Destination Revocation + AML Revocation Signal Ingestion: immediate operator containment + AML
  // risk-signal ingestion. No injected service — reads config directly (mirrors decision-
  // consume.ts's own dependency-free registration). No IAM-02, no maker-checker (deliberate).
  await registerDestinationRevokeRoutes(app);
  await registerAmlRevocationRoutes(app);
  // Ongoing Rescreening: periodic due-based + operator-forced single-destination rescreening. No
  // injected service — reads config directly (mirrors decision-consume.ts's own dependency-free
  // registration). No IAM-02, no scheduler, no background loop.
  await registerRescreeningRunRoutes(app);
  // Fiat Payout Destinations (APAC): registration + read + assess. No injected service — reads
  // config directly (mirrors rescreening-run.ts's own dependency-free registration). Technical
  // support for all four APAC corridors ships dormant (activation_status='inactive'); this route
  // registration does not itself activate anything.
  await registerFiatPayoutDestinationRoutes(app);
  // Evidence Export: maker-checker export request/apply + status/download. No injected service
  // — reads config directly (mirrors payout-destinations.ts's own dependency-free registration).
  await registerEvidenceExportRoutes(app);
  // Inbound-Source Screening: assesses the risk of an inbound transfer's external source address.
  // No injected service — reads config directly (mirrors evidence-export.ts's own dependency-free
  // registration). AML-01 is deliberately NOT in this path — see the route file's own header.
  await registerInboundSourceScreeningRoutes(app);
  // Named Vendor-Result Ingestion / Async Path — Stuck-Screening Operational Closure: visibility +
  // deterministic recovery for a pending wallet screening whose provider never delivered a
  // receipt and whose caller never resumed. NOT a new ingestion path — provider-receipt.ts /
  // vendor_result_inbox remain untouched. No injected service — reads config directly.
  await registerStuckScreeningRoutes(app);

  await app.ready();

  // Boot-time licence lock: no registered route may expose an Exchange runtime surface. Money
  // Broking + PSO only; Exchange application PENDING. Same guard every prior module runs at boot
  // (FND-01 §5.7/§11, reused by IAM-01/IAM-02/SEC-01/CFG-01/CLT-01/AML-01/KYC-01) — checked
  // automatically against Phase 0's own route surface too, not bolted on later.
  const routePaths = app
    .printRoutes({ commonPrefix: false })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  assertNoExchangeRuntime(routePaths);

  return app;
}
