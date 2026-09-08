/**
 * KYC-01 configuration loader.
 *
 * Reuses @aix/foundation's `loadConfig` (fail-closed baseline: ENVIRONMENT/DATABASE_URL/PORT/
 * internal-service-token presence + minimum length) for the shared shape, then layers KYC-01's
 * own interim internal-identity token on top. `KYC1_INTERNAL_SERVICE_TOKEN` is mapped onto the
 * shared loader's `INTERNAL_SERVICE_TOKEN` slot so KYC-01 has exactly ONE interim internal-identity
 * secret for its own `/internal/kyc1/*` routes — mirrors every prior service's own Phase 0 decision
 * (services/aml1/src/config.ts, services/clt1/src/config.ts, services/cfg1/src/config.ts,
 * services/sec1/src/config.ts, services/iam2/src/config.ts). Own copy, not imported — F3(c).
 *
 * APPROVED PHASE 0 DECISION (interim identity, carry-forward, not a new one): this is the SAME
 * interim shared-secret guard pattern every other service in this codebase already carries as a
 * documented, non-blocking carry-forward. No final service-identity model is designed here.
 *
 * No business route exists in Phase 0 — the one route this phase registers (`GET
 * /internal/kyc1/health`) is unauthenticated and does not query the database, so this config
 * carries no CLT1/IAM2/AML1 base-URL/token field this phase — those are added only once a phase
 * actually needs them (Phase 2 delivery, Phase 3 IAM-02), named after the DEPENDENCY, not the
 * caller, mirroring every prior module's own convention.
 *
 * Phase 1 addition: no new config field — Phase 1's routes are entirely internal-identity-guarded,
 * DB-backed, with no cross-module HTTP dependency of any kind (no CLT-01 client, no IAM-02 client,
 * no vendor). `KYC1_ERROR_CODES` (lib/errors.ts) gains its first real, reachable codes this phase.
 *
 * Phase 2B addition: `CLT1_BASE_URL` / `CLT1_INTERNAL_SERVICE_TOKEN` — KYC-01's first cross-module
 * HTTP dependency (`lib/clt1-client.ts`), used by `POST .../outcome-publications/:id/deliver` to
 * POST a mapped `kyc_kyb` outcome into CLT-01's EXISTING `POST .../applications/:id/outcomes`
 * receipt endpoint. Named after the DEPENDENCY, not the caller, mirroring AML-01's own identical
 * `CLT1_BASE_URL`/`CLT1_INTERNAL_SERVICE_TOKEN` convention — NOT `KYC1_CLT1_*`.
 * `CLT1_INTERNAL_SERVICE_TOKEN` here MUST be configured to the SAME shared-secret value CLT-01's
 * own `CLT1_INTERNAL_SERVICE_TOKEN` env var holds — the same operator-managed shared-secret-sync
 * caveat every other cross-service credential in this codebase already carries.
 *
 * Phase 3A addition: `IAM02_BASE_URL` / `IAM02_INTERNAL_SERVICE_TOKEN` — KYC-01's second
 * cross-module HTTP dependency (`lib/iam2-client.ts`), used by the sensitive evidence-read route
 * (`routes/sensitive-evidence.ts`) to call IAM-02's `POST /internal/iam2/permission/check`. Named
 * after the DEPENDENCY, not the caller, mirroring every prior module's own identical
 * `IAM02_BASE_URL`/`IAM02_INTERNAL_SERVICE_TOKEN` convention — NOT `KYC1_IAM2_*`.
 * `IAM02_INTERNAL_SERVICE_TOKEN` here MUST be configured to the SAME shared-secret value IAM-02's
 * own internal-identity guard expects — the same operator-managed shared-secret-sync caveat as
 * `CLT1_INTERNAL_SERVICE_TOKEN` above.
 */
import { AppError, loadConfig, type AppConfig, type RawEnv } from "@aix/foundation";

export interface Kyc1Config extends AppConfig {
  /** KYC-01's own interim internal-identity shared secret. Never logged. */
  kyc1InternalServiceToken: string;
  /** Base URL of CLT-01's HTTP surface, e.g. "http://localhost:8085". Phase 2B outcome-delivery dependency. */
  clt1BaseUrl: string;
  /** Shared secret expected by CLT-01's own internal-identity guard. Never logged. */
  clt1InternalServiceToken: string;
  /**
   * Test-only dependency-injection seam for lib/clt1-client.ts (never populated from env) — lets
   * tests stub the CLT-01 HTTP call instead of requiring a live CLT-01 service. Left undefined in
   * every real/loaded config; only ever set by hand in test fixtures. Mirrors AML-01's own
   * `clt1FetchImpl` exactly.
   */
  clt1FetchImpl?: typeof fetch;
  /** Base URL of IAM-02's HTTP surface, e.g. "http://localhost:8082". Phase 3A permission-guard dependency. */
  iam2BaseUrl: string;
  /** Shared secret expected by IAM-02's own internal-identity guard. Never logged. */
  iam2InternalServiceToken: string;
  /**
   * Test-only dependency-injection seam for lib/iam2-client.ts (never populated from env) — lets
   * tests stub the IAM-02 HTTP call instead of requiring a live IAM-02 service. Mirrors
   * `clt1FetchImpl` exactly.
   */
  iam2FetchImpl?: typeof fetch;
}

export function loadKyc1Config(env: RawEnv = process.env): Kyc1Config {
  const kyc1InternalServiceToken = env.KYC1_INTERNAL_SERVICE_TOKEN?.trim();
  const clt1BaseUrl = env.CLT1_BASE_URL?.trim();
  const clt1InternalServiceToken = env.CLT1_INTERNAL_SERVICE_TOKEN?.trim();
  const iam2BaseUrl = env.IAM02_BASE_URL?.trim();
  const iam2InternalServiceToken = env.IAM02_INTERNAL_SERVICE_TOKEN?.trim();

  // Reuse the foundation loader's fail-closed validation (presence/length/ENVIRONMENT/
  // DATABASE_URL/PORT) by feeding it KYC-01's own token under the shared field name. A
  // missing/blank/too-short token fails startup closed (CONFIGURATION_INVALID), same as every
  // other service — no KYC-01-specific weak/default-token rule is added here.
  const base = loadConfig({ ...env, INTERNAL_SERVICE_TOKEN: kyc1InternalServiceToken });

  const problems: string[] = [];
  if (!kyc1InternalServiceToken) {
    // loadConfig already fails closed on a missing/blank INTERNAL_SERVICE_TOKEN; kept explicit
    // for clarity/defence, same as every prior module's equivalent check.
    problems.push("KYC1_INTERNAL_SERVICE_TOKEN is required");
  }
  if (!clt1BaseUrl) problems.push("CLT1_BASE_URL is required (KYC-01 -> CLT-01 outcome delivery)");
  if (!clt1InternalServiceToken) problems.push("CLT1_INTERNAL_SERVICE_TOKEN is required (shared secret with CLT-01)");
  if (!iam2BaseUrl) problems.push("IAM02_BASE_URL is required (KYC-01 -> IAM-02 permission guard)");
  if (!iam2InternalServiceToken) problems.push("IAM02_INTERNAL_SERVICE_TOKEN is required (shared secret with IAM-02)");

  if (problems.length > 0) {
    throw new AppError("CONFIGURATION_INVALID", {
      message: "Critical KYC-01 configuration invalid; startup aborted.",
      details: problems.map((issue) => ({ issue })),
    });
  }

  return {
    ...base,
    kyc1InternalServiceToken: kyc1InternalServiceToken as string,
    clt1BaseUrl: clt1BaseUrl as string,
    clt1InternalServiceToken: clt1InternalServiceToken as string,
    iam2BaseUrl: iam2BaseUrl as string,
    iam2InternalServiceToken: iam2InternalServiceToken as string,
  };
}
