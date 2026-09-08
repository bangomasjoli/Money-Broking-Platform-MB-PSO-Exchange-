/**
 * IAM-02 configuration loader. Reuses @aix/foundation's `loadConfig` (fail-closed baseline:
 * ENVIRONMENT/DATABASE_URL/PORT/internal-service-token validation) for the shared shape, then
 * layers IAM-02-specific config on top. `IAM2_INTERNAL_SERVICE_TOKEN` is mapped onto the shared
 * loader's `INTERNAL_SERVICE_TOKEN` slot so IAM-02 has exactly ONE interim internal-identity
 * secret (its own, mirroring IAM-01's decision #4 for its own `/internal/iam2/*` endpoints —
 * see plugins/internal-identity.ts), while still reusing the shared length/presence validation
 * instead of reimplementing it.
 *
 * Stage 2 (Phases 3-5) additions:
 *   - `IAM01_BASE_URL` / `IAM01_INTERNAL_SERVICE_TOKEN` — IAM-02 must reach IAM-01 over HTTP
 *     ONLY (never import services/iam/src/**), for step-up assertion verification
 *     (lib/iam01-client.ts). `IAM01_INTERNAL_SERVICE_TOKEN` here MUST be configured to the
 *     SAME shared-secret value IAM-01's own `IAM_INTERNAL_SERVICE_TOKEN` env var holds — these
 *     are the two ends of one shared secret, not two independent tokens. Operationally this
 *     means whoever deploys IAM-01 and IAM-02 must keep the two env vars in sync; there is no
 *     runtime discovery mechanism.
 *   - `IAM2_BOOTSTRAP_TRANSITION_ENABLED` / `IAM2_BOOTSTRAP_ADMIN_USER_ID` — the approved
 *     config-sealed bootstrap-to-RBAC transition (routes/bootstrap.ts). Both default
 *     effectively "off"/absent; only required together when the flag is explicitly true.
 */
import { AppError, loadConfig, type AppConfig, type RawEnv } from "@aix/foundation";

export interface Iam2Config extends AppConfig {
  /** IAM-02's own interim internal-identity shared secret. Never logged. */
  iam2InternalServiceToken: string;
  /** Base URL of IAM-01's HTTP surface, e.g. "http://localhost:8081". */
  iam01BaseUrl: string;
  /** Shared secret expected by IAM-01's own internal-identity guard. Never logged. */
  iam01InternalServiceToken: string;
  /**
   * Test-only dependency-injection seam for lib/iam01-client.ts (never populated from env) —
   * lets tests stub the IAM-01 HTTP call instead of requiring a live IAM-01 service. Left
   * undefined in every real/loaded config; only ever set by hand in test fixtures.
   */
  iam01FetchImpl?: typeof fetch;
  /** APPROVED BOOTSTRAP-TO-RBAC TRANSITION DESIGN — see routes/bootstrap.ts. Default false. */
  bootstrapTransitionEnabled: boolean;
  /** Config-sealed: IAM-01's known bootstrap admin's user_id, copied in by an operator once. */
  bootstrapAdminUserId?: string;
}

export function loadIam2Config(env: RawEnv = process.env): Iam2Config {
  const iam2InternalServiceToken = env.IAM2_INTERNAL_SERVICE_TOKEN?.trim();

  // Reuse the foundation loader's fail-closed validation (presence/length/ENVIRONMENT/
  // DATABASE_URL/PORT) by feeding it IAM-02's own token under the shared field name.
  const base = loadConfig({ ...env, INTERNAL_SERVICE_TOKEN: iam2InternalServiceToken });

  const iam01BaseUrl = env.IAM01_BASE_URL?.trim();
  const iam01InternalServiceToken = env.IAM01_INTERNAL_SERVICE_TOKEN?.trim();
  const bootstrapTransitionEnabled = (env.IAM2_BOOTSTRAP_TRANSITION_ENABLED ?? "false").trim().toLowerCase() === "true";
  const bootstrapAdminUserId = env.IAM2_BOOTSTRAP_ADMIN_USER_ID?.trim();

  const problems: string[] = [];
  if (!iam2InternalServiceToken) {
    // loadConfig already fails closed on a missing/blank INTERNAL_SERVICE_TOKEN, so this
    // branch is unreachable in practice, but keep the explicit check for clarity/defence.
    problems.push("IAM2_INTERNAL_SERVICE_TOKEN is required");
  }
  if (!iam01BaseUrl) problems.push("IAM01_BASE_URL is required (IAM-02 -> IAM-01 step-up verification)");
  if (!iam01InternalServiceToken) problems.push("IAM01_INTERNAL_SERVICE_TOKEN is required (shared secret with IAM-01)");
  if (bootstrapTransitionEnabled && !bootstrapAdminUserId) {
    problems.push("IAM2_BOOTSTRAP_ADMIN_USER_ID is required when IAM2_BOOTSTRAP_TRANSITION_ENABLED=true");
  }

  if (problems.length > 0) {
    throw new AppError("CONFIGURATION_INVALID", {
      message: "Critical IAM-02 configuration invalid; startup aborted.",
      details: problems.map((issue) => ({ issue })),
    });
  }

  return {
    ...base,
    iam2InternalServiceToken: iam2InternalServiceToken as string,
    iam01BaseUrl: iam01BaseUrl as string,
    iam01InternalServiceToken: iam01InternalServiceToken as string,
    bootstrapTransitionEnabled,
    ...(bootstrapAdminUserId ? { bootstrapAdminUserId } : {}),
  };
}
