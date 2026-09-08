/**
 * CLT-01 configuration loader.
 *
 * Reuses @aix/foundation's `loadConfig` (fail-closed baseline: ENVIRONMENT/DATABASE_URL/PORT/
 * internal-service-token presence + minimum length) for the shared shape, then layers CLT-01's
 * own internal-identity token on top. `CLT1_INTERNAL_SERVICE_TOKEN` is mapped onto the shared
 * loader's `INTERNAL_SERVICE_TOKEN` slot so CLT-01 has exactly ONE interim internal-identity
 * secret for its own `/internal/clt1/*` routes — mirrors every prior service's own Phase 0
 * decision (services/iam2/src/config.ts, services/sec1/src/config.ts, services/cfg1/src/
 * config.ts). Own copy, not imported — F3(c).
 *
 * APPROVED PHASE 0 DECISION (internal identity, carry-forward, not a new one): this is the SAME
 * interim shared-secret guard pattern every other service in this codebase already carries as a
 * documented, non-blocking carry-forward (IAM-02's own implementation notes §10.4 L3; SEC-01's
 * F-5; CFG-01's L1/L2 — each flagged as "should not slip" as more routes accumulate on top of
 * it). No final service-identity model is designed here. This carry-forward is more consequential
 * for CLT-01 than for prior modules once real routes land, since CLT-01 is a PII system of
 * record (blueprint §5.18) — flagged now, not deferred silently.
 *
 * Phase 1 addition: `CFG1_BASE_URL` / `CFG1_INTERNAL_SERVICE_TOKEN` — CLT-01's application-intake
 * routes must reach CFG-01's runtime decision engine (`POST /internal/cfg1/features/evaluate`)
 * over HTTP ONLY (never import `services/cfg1/src/**` — F3(c)), via `lib/cfg1-client.ts`. Named
 * after the DEPENDENCY, not the caller, exactly mirroring CFG-01's own `IAM02_BASE_URL` naming
 * for its identical shape of dependency on IAM-02 (services/cfg1/src/config.ts) — NOT
 * `CLT1_CFG1_*`. `CFG1_INTERNAL_SERVICE_TOKEN` here MUST be configured to the SAME shared-secret
 * value CFG-01's own `CFG1_INTERNAL_SERVICE_TOKEN` env var holds — the same operator-managed
 * shared-secret-sync caveat every other cross-service credential in this codebase already
 * carries.
 *
 * Phase 2 addition: `IAM02_BASE_URL` / `IAM02_INTERNAL_SERVICE_TOKEN` — CLT-01's first IAM-02
 * dependency (services/clt1/src/lib/iam2-client.ts), used by the review/approve/reject/hold/
 * outcome-status-read routes' `checkPermission` baseline call and by `approve/apply`'s
 * `verifyDecisionToken` execute-verify call. Same naming/shared-secret-sync convention as
 * CFG-01's own identical dependency (services/cfg1/src/config.ts) — NOT `CLT1_IAM2_*`. Direct
 * SEC-01 audit-ingestion integration remains out of scope (CLT-01 reaches SEC-01 only indirectly,
 * via publishAudit/outbox, same as every other module).
 */
import { AppError, loadConfig, type AppConfig, type RawEnv } from "@aix/foundation";

export interface Clt1Config extends AppConfig {
  /** CLT-01's own interim internal-identity shared secret. Never logged. */
  clt1InternalServiceToken: string;
  /** Base URL of CFG-01's HTTP surface, e.g. "http://localhost:8084". Phase 1 onboarding-gate dependency. */
  cfg1BaseUrl: string;
  /** Shared secret expected by CFG-01's own internal-identity guard. Never logged. */
  cfg1InternalServiceToken: string;
  /**
   * Test-only dependency-injection seam for lib/cfg1-client.ts (never populated from env) — lets
   * tests stub the CFG-01 HTTP call instead of requiring a live CFG-01 service. Left undefined in
   * every real/loaded config; only ever set by hand in test fixtures. Mirrors Cfg1Config's own
   * `iam2FetchImpl` / Sec1Config's own `iam2FetchImpl` exactly.
   */
  cfg1FetchImpl?: typeof fetch;
  /** Base URL of IAM-02's HTTP surface, e.g. "http://localhost:8082". Phase 2 permission/approval dependency. */
  iam2BaseUrl: string;
  /** Shared secret expected by IAM-02's own internal-identity guard. Never logged. */
  iam2InternalServiceToken: string;
  /**
   * Test-only dependency-injection seam for lib/iam2-client.ts (never populated from env) — lets
   * tests stub the IAM-02 HTTP call instead of requiring a live IAM-02 service. Mirrors
   * Cfg1Config's own `iam2FetchImpl` exactly.
   */
  iam2FetchImpl?: typeof fetch;
}

export function loadClt1Config(env: RawEnv = process.env): Clt1Config {
  const clt1InternalServiceToken = env.CLT1_INTERNAL_SERVICE_TOKEN?.trim();
  const cfg1BaseUrl = env.CFG1_BASE_URL?.trim();
  const cfg1InternalServiceToken = env.CFG1_INTERNAL_SERVICE_TOKEN?.trim();
  const iam2BaseUrl = env.IAM02_BASE_URL?.trim();
  const iam2InternalServiceToken = env.IAM02_INTERNAL_SERVICE_TOKEN?.trim();

  // Reuse the foundation loader's fail-closed validation (presence/length/ENVIRONMENT/
  // DATABASE_URL/PORT) by feeding it CLT-01's own token under the shared field name. A
  // missing/blank/too-short token fails startup closed (CONFIGURATION_INVALID), same as every
  // other service — no CLT-01-specific weak/default-token rule is added here.
  const base = loadConfig({ ...env, INTERNAL_SERVICE_TOKEN: clt1InternalServiceToken });

  const problems: string[] = [];
  if (!clt1InternalServiceToken) {
    // loadConfig already fails closed on a missing/blank INTERNAL_SERVICE_TOKEN; kept explicit
    // for clarity/defence, same as every prior module's equivalent check.
    problems.push("CLT1_INTERNAL_SERVICE_TOKEN is required");
  }
  if (!cfg1BaseUrl) problems.push("CFG1_BASE_URL is required (CLT-01 -> CFG-01 onboarding gate)");
  if (!cfg1InternalServiceToken) problems.push("CFG1_INTERNAL_SERVICE_TOKEN is required (shared secret with CFG-01)");
  if (!iam2BaseUrl) problems.push("IAM02_BASE_URL is required (CLT-01 -> IAM-02 permission/approval guard)");
  if (!iam2InternalServiceToken) problems.push("IAM02_INTERNAL_SERVICE_TOKEN is required (shared secret with IAM-02)");

  if (problems.length > 0) {
    throw new AppError("CONFIGURATION_INVALID", {
      message: "Critical CLT-01 configuration invalid; startup aborted.",
      details: problems.map((issue) => ({ issue })),
    });
  }

  return {
    ...base,
    clt1InternalServiceToken: clt1InternalServiceToken as string,
    cfg1BaseUrl: cfg1BaseUrl as string,
    cfg1InternalServiceToken: cfg1InternalServiceToken as string,
    iam2BaseUrl: iam2BaseUrl as string,
    iam2InternalServiceToken: iam2InternalServiceToken as string,
  };
}
