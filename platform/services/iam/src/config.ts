/**
 * IAM-01 configuration loader. Reuses @aix/foundation's `loadConfig` (fail-closed baseline:
 * ENVIRONMENT/DATABASE_URL/PORT/internal-service-token validation) for the shared shape, then
 * layers IAM-specific config on top. `IAM_INTERNAL_SERVICE_TOKEN` is mapped onto the shared
 * loader's `INTERNAL_SERVICE_TOKEN` slot so IAM has exactly ONE interim internal-identity
 * secret (its own — decision #4 — not FND's), while still reusing the shared length/presence
 * validation instead of reimplementing it.
 */
import { AppError, loadConfig, type AppConfig, type RawEnv } from "@aix/foundation";

export interface RateLimitConfig {
  loginMaxAttempts: number;
  loginLockoutMinutes: number;
  mfaMaxAttempts: number;
  mfaLockoutMinutes: number;
  passwordResetMaxAttempts: number;
  passwordResetLockoutMinutes: number;
  refreshMaxAttempts: number;
  refreshLockoutMinutes: number;
}

export interface IamConfig extends AppConfig {
  /** IAM's own interim internal-identity shared secret (decision #4). Never logged. */
  iamInternalServiceToken: string;
  /**
   * Internal Session Introspection seam (WLT-01 BLOCKER-1 prerequisite) — a DEDICATED
   * capability secret guarding `POST /internal/auth/session/validate`, deliberately DISTINCT
   * from `iamInternalServiceToken`. IAM-01 has no per-caller service-identity model (every
   * `/internal/auth/*` route shares one generic guard); a separate token narrows this specific
   * capability to whichever service is provisioned with it, without inventing a second
   * authentication mechanism or a service-account scope check. Never logged.
   */
  iamIntrospectionServiceToken: string;
  bootstrapEnabled: boolean;
  bootstrapAdminIdentifier?: string;
  bootstrapAdminPassword?: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  rateLimit: RateLimitConfig;
  /**
   * Placeholder-KMS passphrase for MFA TOTP secret envelope encryption (lib/mfa-secret-
   * crypto.ts). Real KMS/HSM integration is a known open item — see IAM-01_IMPLEMENTATION_
   * NOTES.md. Never logged. Defaults to a clearly-fake dev value so local/test boot does not
   * require extra setup; a production deploy MUST override it.
   */
  mfaSecretEncryptionKey: string;
  /**
   * FND-FIND-010 — IAM's own explicit database-pool concurrency ceiling (`pg.Pool`'s `max`).
   * Required when `environment === "prod"` (no production default exists or is invented here);
   * optional in every other environment. Absent outside prod means the shared `@aix/foundation`
   * pool is constructed exactly as it was before this remediation (node-postgres library
   * default), never a value substituted by this loader. This is a capacity INPUT only — it does
   * not itself constitute an approved production numeric policy (see `IMP-02` / FND-FIND-001).
   */
  dbPoolMax?: number;
  /**
   * FND-FIND-010 — pool-acquisition timeout in milliseconds (node-postgres `connectionTimeoutMillis`).
   * Governs how long a queued `pool.connect()` waits when the pool is exhausted before failing —
   * NOT a SQL statement/query timeout, NOT WLT's HTTP client timeout, NOT an edge timeout. Same
   * required-in-prod / optional-elsewhere rule as `dbPoolMax`.
   */
  dbConnectionTimeoutMs?: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Strict positive-integer parser for FND-FIND-010's two capacity inputs — deliberately NOT the
 * lenient `parsePositiveInt` above (which silently falls back on any malformed value). A
 * capacity governance value must never silently substitute a fallback: "10abc", "10.5", "0",
 * "-1", and whitespace-only are all rejected outright, never coerced.
 *
 * Returns:
 *   undefined  — the variable is absent, or present but empty/whitespace-only (treated
 *                identically to absent — an empty string carries no governance intent)
 *   "invalid"  — present with content that is not a strictly positive safe integer
 *   number     — the parsed value
 */
function parseStrictPositiveInt(raw: string | undefined): number | undefined | "invalid" {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (!/^[0-9]+$/.test(trimmed)) return "invalid";
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0) return "invalid";
  return n;
}

export function loadIamConfig(env: RawEnv = process.env): IamConfig {
  const iamInternalServiceToken = env.IAM_INTERNAL_SERVICE_TOKEN?.trim();
  const iamIntrospectionServiceToken = env.IAM_INTROSPECTION_SERVICE_TOKEN?.trim();

  // Reuse the foundation loader's fail-closed validation (presence/length/ENVIRONMENT/
  // DATABASE_URL/PORT) by feeding it IAM's own token under the shared field name.
  const base = loadConfig({ ...env, INTERNAL_SERVICE_TOKEN: iamInternalServiceToken });

  const problems: string[] = [];

  // Internal Session Introspection seam: required, non-empty, no production default, and must
  // differ from the general internal-service token — a distinct capability secret is the whole
  // point of scoping introspection separately (see IamConfig's own field comment).
  if (!iamIntrospectionServiceToken) {
    problems.push("IAM_INTROSPECTION_SERVICE_TOKEN is required (internal session introspection seam)");
  } else if (iamIntrospectionServiceToken.length < 8) {
    problems.push("IAM_INTROSPECTION_SERVICE_TOKEN too short");
  } else if (iamInternalServiceToken && iamIntrospectionServiceToken === iamInternalServiceToken) {
    problems.push("IAM_INTROSPECTION_SERVICE_TOKEN must differ from IAM_INTERNAL_SERVICE_TOKEN");
  }

  // FND-FIND-010 — explicit IAM DB-pool capacity inputs. `base.environment` is already validated
  // (loadConfig above throws before this point if ENVIRONMENT is missing/invalid), so it is a
  // trustworthy discriminator for the prod-required rule.
  const isProd = base.environment === "prod";

  const dbPoolMax = parseStrictPositiveInt(env.IAM_DB_POOL_MAX);
  if (dbPoolMax === "invalid") {
    problems.push("IAM_DB_POOL_MAX must be a strictly positive integer (no fractional/negative/zero/non-numeric value)");
  } else if (dbPoolMax === undefined && isProd) {
    problems.push("IAM_DB_POOL_MAX is required when ENVIRONMENT=prod (FND-FIND-010 — explicit IAM DB-pool capacity, no production default)");
  }

  const dbConnectionTimeoutMs = parseStrictPositiveInt(env.IAM_DB_CONNECTION_TIMEOUT_MS);
  if (dbConnectionTimeoutMs === "invalid") {
    problems.push(
      "IAM_DB_CONNECTION_TIMEOUT_MS must be a strictly positive integer in milliseconds (no fractional/negative/zero/non-numeric value)",
    );
  } else if (dbConnectionTimeoutMs === undefined && isProd) {
    problems.push(
      "IAM_DB_CONNECTION_TIMEOUT_MS is required when ENVIRONMENT=prod (FND-FIND-010 — explicit IAM DB-pool acquisition timeout, no production default)",
    );
  }

  const bootstrapEnabled = (env.IAM_BOOTSTRAP_ENABLED ?? "false").trim().toLowerCase() === "true";
  const bootstrapAdminIdentifier = env.IAM_BOOTSTRAP_ADMIN_IDENTIFIER?.trim();
  const bootstrapAdminPassword = env.IAM_BOOTSTRAP_ADMIN_PASSWORD;
  if (bootstrapEnabled) {
    if (!bootstrapAdminIdentifier) problems.push("IAM_BOOTSTRAP_ADMIN_IDENTIFIER is required when IAM_BOOTSTRAP_ENABLED=true");
    if (!bootstrapAdminPassword || bootstrapAdminPassword.length < 12) {
      problems.push("IAM_BOOTSTRAP_ADMIN_PASSWORD is required (>=12 chars) when IAM_BOOTSTRAP_ENABLED=true");
    }
  }

  if (problems.length > 0) {
    throw new AppError("CONFIGURATION_INVALID", {
      message: "Critical IAM configuration invalid; startup aborted.",
      details: problems.map((issue) => ({ issue })),
    });
  }

  return {
    ...base,
    iamInternalServiceToken: iamInternalServiceToken as string,
    iamIntrospectionServiceToken: iamIntrospectionServiceToken as string,
    bootstrapEnabled,
    ...(bootstrapAdminIdentifier ? { bootstrapAdminIdentifier } : {}),
    ...(bootstrapAdminPassword ? { bootstrapAdminPassword } : {}),
    accessTokenTtlSeconds: parsePositiveInt(env.IAM_ACCESS_TOKEN_TTL_SECONDS, 900),
    refreshTokenTtlSeconds: parsePositiveInt(env.IAM_REFRESH_TOKEN_TTL_SECONDS, 1_209_600),
    mfaSecretEncryptionKey:
      env.IAM_MFA_SECRET_ENC_KEY?.trim() || "CHANGE_ME_DEV_ONLY_MFA_KEY_PLACEHOLDER_NOT_FOR_PROD",
    ...(typeof dbPoolMax === "number" ? { dbPoolMax } : {}),
    ...(typeof dbConnectionTimeoutMs === "number" ? { dbConnectionTimeoutMs } : {}),
    rateLimit: {
      loginMaxAttempts: parsePositiveInt(env.IAM_LOGIN_MAX_ATTEMPTS, 5),
      loginLockoutMinutes: parsePositiveInt(env.IAM_LOGIN_LOCKOUT_MINUTES, 15),
      mfaMaxAttempts: parsePositiveInt(env.IAM_MFA_MAX_ATTEMPTS, 5),
      mfaLockoutMinutes: parsePositiveInt(env.IAM_MFA_LOCKOUT_MINUTES, 15),
      passwordResetMaxAttempts: parsePositiveInt(env.IAM_PASSWORD_RESET_MAX_ATTEMPTS, 5),
      passwordResetLockoutMinutes: parsePositiveInt(env.IAM_PASSWORD_RESET_LOCKOUT_MINUTES, 30),
      refreshMaxAttempts: parsePositiveInt(env.IAM_REFRESH_MAX_ATTEMPTS, 20),
      refreshLockoutMinutes: parsePositiveInt(env.IAM_REFRESH_LOCKOUT_MINUTES, 15),
    },
  };
}
