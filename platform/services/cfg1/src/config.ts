/**
 * CFG-01 configuration loader.
 *
 * Reuses @aix/foundation's `loadConfig` (fail-closed baseline: ENVIRONMENT/DATABASE_URL/PORT/
 * internal-service-token presence + minimum length) for the shared shape, then layers CFG-01's
 * own internal-identity token on top. `CFG1_INTERNAL_SERVICE_TOKEN` is mapped onto the shared
 * loader's `INTERNAL_SERVICE_TOKEN` slot so CFG-01 has exactly ONE interim internal-identity
 * secret for its own `/internal/cfg1/*` routes — mirrors IAM-02's own Phase 0 decision
 * (services/iam2/src/config.ts) and SEC-01's generic internal-identity token
 * (services/sec1/src/config.ts's `sec1InternalServiceToken`). Own copy, not imported — F3(c).
 *
 * APPROVED PHASE 0 DECISION (internal identity, carry-forward): this is the SAME interim
 * shared-secret guard pattern every other service in this codebase uses for its own
 * `/internal/<module>/*` surface (IAM-01/IAM-02/SEC-01 each keep their own copy). It is not a
 * final service-identity model — IAM-02's own implementation notes (§10.4 L3) and SEC-01's
 * (F-5) already flag that this interim trust model "should not slip" as more routes accumulate
 * on top of it. CFG-01 inherits the same carry-forward for its own `/internal/cfg1/*` guard;
 * Phase 3A does NOT solve this for the read path (evaluate/verify-decision) — but mutation
 * routes no longer rely on it alone for AUTHORISATION (see below).
 *
 * Phase 3A addition: `IAM02_BASE_URL` / `IAM02_INTERNAL_SERVICE_TOKEN` — CFG-01's mutation
 * routes (`routes/feature-changes.ts`/`routes/licence-changes.ts`) must reach IAM-02's
 * permission guard AND approval/execute-verify surface over HTTP ONLY (never import
 * `services/iam2/src/**` — F3(c)), via `lib/iam2-client.ts`. Named after the DEPENDENCY, not the
 * caller, exactly mirroring SEC-01's own identical env-var names for the identical dependency
 * (`services/sec1/src/config.ts`) — NOT `CFG1_IAM2_*`. `IAM02_INTERNAL_SERVICE_TOKEN` here MUST
 * be configured to the SAME shared-secret value IAM-02's own `IAM2_INTERNAL_SERVICE_TOKEN` env
 * var holds — the same operator-managed shared-secret-sync caveat every other cross-service
 * credential in this codebase already carries. This is the mechanism that closes the "mutation
 * authorised by caller_module + shared token alone" gap (Phase 3A approved decision #1): a
 * mutation APPLY call additionally requires a real IAM-02-issued decision token, verified over
 * this HTTP dependency, bound to a real human actor and the exact mutation payload.
 *
 * APPROVED PHASE 0 DECISION (integrity seal, carry-forward): no signing/KMS/PKI config is
 * introduced here. The interim sha256 hash-seal (no fake signature) needs no secret material —
 * it is a deterministic hash, not a keyed operation — so it requires no config addition at all,
 * including for Phase 3A's reseal-on-mutation path (approved decision #10: still deferred).
 */
import { AppError, loadConfig, type AppConfig, type RawEnv } from "@aix/foundation";

export interface Cfg1Config extends AppConfig {
  /** CFG-01's own interim internal-identity shared secret. Never logged. */
  cfg1InternalServiceToken: string;
  /** Base URL of IAM-02's HTTP surface, e.g. "http://localhost:8082". Phase 3A mutation-workflow dependency. */
  iam2BaseUrl: string;
  /** Shared secret expected by IAM-02's own internal-identity guard. Never logged. */
  iam2InternalServiceToken: string;
  /**
   * Test-only dependency-injection seam for lib/iam2-client.ts (never populated from env) — lets
   * tests stub the IAM-02 HTTP call instead of requiring a live IAM-02 service. Left undefined in
   * every real/loaded config; only ever set by hand in test fixtures. Mirrors SEC-01's own
   * `Sec1Config.iam2FetchImpl` exactly.
   */
  iam2FetchImpl?: typeof fetch;
}

export function loadCfg1Config(env: RawEnv = process.env): Cfg1Config {
  const cfg1InternalServiceToken = env.CFG1_INTERNAL_SERVICE_TOKEN?.trim();
  const iam2BaseUrl = env.IAM02_BASE_URL?.trim();
  const iam2InternalServiceToken = env.IAM02_INTERNAL_SERVICE_TOKEN?.trim();

  // Reuse the foundation loader's fail-closed validation (presence/length/ENVIRONMENT/
  // DATABASE_URL/PORT) by feeding it CFG-01's own token under the shared field name. A
  // missing/blank/too-short token fails startup closed (CONFIGURATION_INVALID), same as every
  // other service — no CFG-01-specific weak/default-token rule is added here: no existing
  // service in this codebase differentiates production from other environments for token
  // strength beyond this shared minimum-length check, and inventing a CFG-01-only stricter
  // rule would be a new, inconsistent policy rather than a scaffold decision.
  const base = loadConfig({ ...env, INTERNAL_SERVICE_TOKEN: cfg1InternalServiceToken });

  const problems: string[] = [];
  if (!cfg1InternalServiceToken) {
    // loadConfig already fails closed on a missing/blank INTERNAL_SERVICE_TOKEN; kept explicit
    // for clarity/defence, same as IAM-02's and SEC-01's equivalent check.
    problems.push("CFG1_INTERNAL_SERVICE_TOKEN is required");
  }
  if (!iam2BaseUrl) problems.push("IAM02_BASE_URL is required (CFG-01 -> IAM-02 permission/approval guard)");
  if (!iam2InternalServiceToken) problems.push("IAM02_INTERNAL_SERVICE_TOKEN is required (shared secret with IAM-02)");

  if (problems.length > 0) {
    throw new AppError("CONFIGURATION_INVALID", {
      message: "Critical CFG-01 configuration invalid; startup aborted.",
      details: problems.map((issue) => ({ issue })),
    });
  }

  return {
    ...base,
    cfg1InternalServiceToken: cfg1InternalServiceToken as string,
    iam2BaseUrl: iam2BaseUrl as string,
    iam2InternalServiceToken: iam2InternalServiceToken as string,
  };
}
