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
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
