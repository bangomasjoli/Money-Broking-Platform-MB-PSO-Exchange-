/**
 * SEC-01 configuration loader. Reuses @aix/foundation's `loadConfig` (fail-closed baseline:
 * ENVIRONMENT/DATABASE_URL/PORT/internal-service-token validation) for the shared shape, then
 * layers SEC-01-specific config on top — mirrors services/iam2/src/config.ts exactly (own
 * copy, not imported; F3(c)).
 *
 * Two DISTINCT identity mechanisms are configured here, deliberately not conflated:
 *
 *   1. `SEC1_INTERNAL_SERVICE_TOKEN` -> `sec1InternalServiceToken` — the generic interim
 *      internal-identity shared secret every service has for its own `/internal/sec1/*`
 *      routes (Phase 0 scaffold requirement, mirroring IAM-01/IAM-02's own copy — see
 *      plugins/internal-identity.ts). No route built in this Phase 0-2 slice actually mounts
 *      this guard (the one route this phase builds, `POST /internal/sec1/audit-events`, is
 *      instead guarded by the MORE SPECIFIC per-module source-identity-binding mechanism
 *      below, which a single shared "any internal caller" secret cannot provide — see
 *      plugins/source-identity.ts's header comment for why). Kept configured/available now so
 *      later phases' non-ingestion internal routes (seal, reconciliation, recovery — all
 *      deferred) have it ready without a further config-loader patch.
 *
 *   2. `SEC1_INGEST_TOKEN_FND01` / `SEC1_INGEST_TOKEN_IAM01` / `SEC1_INGEST_TOKEN_IAM02` — one
 *      DISTINCT bearer token per approved source module, used ONLY by the audit-events
 *      ingestion routes to resolve WHICH module is presenting ingestion credentials and bind
 *      `source_module` authentically (SEC-01 §5.5C ingestion authenticity / SEC1-FR-026). A
 *      single shared secret cannot do this (it would tell you "a legitimate internal caller"
 *      but not "which module"), which is why this is a SEPARATE config surface from
 *      `sec1InternalServiceToken`. The token VALUES here must be identical (hashed, at rest —
 *      see infra/migrations/008_sec1_core.cjs) to whatever seeded
 *      `sec1.source_identity_binding.token_hash` rows migration 008 wrote at deploy time;
 *      operationally this means whoever runs migration 008 and whoever configures these three
 *      env vars must use the SAME three token values (no runtime discovery mechanism, same
 *      "kept in sync by the operator" caveat IAM-02's IAM01_INTERNAL_SERVICE_TOKEN carries).
 *      Fail closed (CONFIGURATION_INVALID) if any of the three is missing/blank — SEC-01 must
 *      never boot in a state where an approved source module has no way to authenticate.
 *
 * Phase 4 addition: `IAM02_BASE_URL` / `IAM02_INTERNAL_SERVICE_TOKEN` — SEC-01's own read/search
 * routes must reach IAM-02's permission guard over HTTP ONLY (never import services/iam2/src/**
 * — F3(c)), for `POST /internal/iam2/permission/check` (lib/iam2-client.ts). Named after the
 * DEPENDENCY, not the caller, exactly mirroring how IAM-02 itself named its own IAM-01
 * dependency `IAM01_BASE_URL`/`IAM01_INTERNAL_SERVICE_TOKEN` (services/iam2/src/config.ts) —
 * NOT `SEC1_IAM2_*`. `IAM02_INTERNAL_SERVICE_TOKEN` here MUST be configured to the SAME
 * shared-secret value IAM-02's own `IAM2_INTERNAL_SERVICE_TOKEN` env var holds — the same
 * operator-managed shared-secret-sync caveat every other cross-service credential in this
 * codebase already carries (IAM-02's own `IAM01_INTERNAL_SERVICE_TOKEN`, SEC-01's own
 * `SEC1_INGEST_TOKEN_*`).
 */
import { AppError, loadConfig, type AppConfig, type RawEnv } from "@aix/foundation";

export interface Sec1Config extends AppConfig {
  /** SEC-01's own generic interim internal-identity shared secret. Never logged. */
  sec1InternalServiceToken: string;
  /** Per-source-module ingestion bearer tokens (raw values; only ever hashed before compare/storage). Never logged. */
  ingestTokens: {
    "FND-01": string;
    "IAM-01": string;
    "IAM-02": string;
  };
  /** Base URL of IAM-02's HTTP surface, e.g. "http://localhost:8082". Phase 4 permission-guard dependency. */
  iam2BaseUrl: string;
  /** Shared secret expected by IAM-02's own internal-identity guard. Never logged. */
  iam2InternalServiceToken: string;
  /**
   * Test-only dependency-injection seam for lib/iam2-client.ts (never populated from env) —
   * lets tests stub the IAM-02 HTTP call instead of requiring a live IAM-02 service. Left
   * undefined in every real/loaded config; only ever set by hand in test fixtures. Mirrors
   * Iam2Config.iam01FetchImpl exactly.
   */
  iam2FetchImpl?: typeof fetch;
}

export function loadSec1Config(env: RawEnv = process.env): Sec1Config {
  const sec1InternalServiceToken = env.SEC1_INTERNAL_SERVICE_TOKEN?.trim();

  // Reuse the foundation loader's fail-closed validation (presence/length/ENVIRONMENT/
  // DATABASE_URL/PORT) by feeding it SEC-01's own token under the shared field name.
  const base = loadConfig({ ...env, INTERNAL_SERVICE_TOKEN: sec1InternalServiceToken });

  const ingestFnd01 = env.SEC1_INGEST_TOKEN_FND01?.trim();
  const ingestIam01 = env.SEC1_INGEST_TOKEN_IAM01?.trim();
  const ingestIam02 = env.SEC1_INGEST_TOKEN_IAM02?.trim();
  const iam2BaseUrl = env.IAM02_BASE_URL?.trim();
  const iam2InternalServiceToken = env.IAM02_INTERNAL_SERVICE_TOKEN?.trim();

  const problems: string[] = [];
  if (!sec1InternalServiceToken) {
    // loadConfig already fails closed on a missing/blank INTERNAL_SERVICE_TOKEN; kept explicit
    // for clarity/defence, same as IAM-02's equivalent check.
    problems.push("SEC1_INTERNAL_SERVICE_TOKEN is required");
  }
  if (!ingestFnd01) problems.push("SEC1_INGEST_TOKEN_FND01 is required (FND-01 audit ingestion identity)");
  if (!ingestIam01) problems.push("SEC1_INGEST_TOKEN_IAM01 is required (IAM-01 audit ingestion identity)");
  if (!ingestIam02) problems.push("SEC1_INGEST_TOKEN_IAM02 is required (IAM-02 audit ingestion identity)");
  if (
    ingestFnd01 &&
    ingestIam01 &&
    ingestIam02 &&
    new Set([ingestFnd01, ingestIam01, ingestIam02]).size !== 3
  ) {
    // Two modules sharing one token would defeat source_module binding entirely (a caller
    // presenting a shared token could not be distinguished from another module using it) —
    // fail closed rather than silently allow ambiguous ingestion identity.
    problems.push("SEC1_INGEST_TOKEN_FND01/IAM01/IAM02 must all be distinct values");
  }
  if (!iam2BaseUrl) problems.push("IAM02_BASE_URL is required (SEC-01 -> IAM-02 permission guard)");
  if (!iam2InternalServiceToken) problems.push("IAM02_INTERNAL_SERVICE_TOKEN is required (shared secret with IAM-02)");

  if (problems.length > 0) {
    throw new AppError("CONFIGURATION_INVALID", {
      message: "Critical SEC-01 configuration invalid; startup aborted.",
      details: problems.map((issue) => ({ issue })),
    });
  }

  return {
    ...base,
    sec1InternalServiceToken: sec1InternalServiceToken as string,
    ingestTokens: {
      "FND-01": ingestFnd01 as string,
      "IAM-01": ingestIam01 as string,
      "IAM-02": ingestIam02 as string,
    },
    iam2BaseUrl: iam2BaseUrl as string,
    iam2InternalServiceToken: iam2InternalServiceToken as string,
  };
}
