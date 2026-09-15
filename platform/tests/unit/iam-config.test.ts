/**
 * IAM-01's own config loader (services/iam/src/config.ts). Covers FND-FIND-010's two explicit
 * DB-pool capacity inputs (IAM_DB_POOL_MAX / IAM_DB_CONNECTION_TIMEOUT_MS) — required when
 * ENVIRONMENT=prod, optional (and left genuinely absent, never substituted) elsewhere — plus
 * the existing IAM_INTROSPECTION_SERVICE_TOKEN/bootstrap behaviour already covered generically
 * by the shared @aix/foundation loadConfig suite (tests/unit/config.test.ts). No prior
 * dedicated test file existed for this loader before this turn.
 */
import { describe, it, expect } from "vitest";
import { AppError } from "@aix/foundation";
import { loadIamConfig } from "../../services/iam/src/config.js";

const base = {
  ENVIRONMENT: "dev",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  PORT: "8080",
  INTERNAL_SERVICE_TOKEN: "unused-shared-slot",
  IAM_INTERNAL_SERVICE_TOKEN: "iam-internal-token-123",
  IAM_INTROSPECTION_SERVICE_TOKEN: "iam-introspection-token-456",
};

function throwsConfigInvalid(fn: () => unknown): AppError {
  try {
    fn();
    throw new Error("expected loadIamConfig to throw");
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    const err = e as AppError;
    expect(err.code).toBe("CONFIGURATION_INVALID");
    return err;
  }
}

describe("IAM config loader — baseline", () => {
  it("loads a valid dev config", () => {
    const cfg = loadIamConfig(base);
    expect(cfg.environment).toBe("dev");
    expect(cfg.iamInternalServiceToken).toBe("iam-internal-token-123");
  });
});

describe("FND-FIND-010 — IAM_DB_POOL_MAX / IAM_DB_CONNECTION_TIMEOUT_MS", () => {
  it("non-prod: both absent — dbPoolMax/dbConnectionTimeoutMs are genuinely undefined, never substituted", () => {
    const cfg = loadIamConfig(base);
    expect(cfg.dbPoolMax).toBeUndefined();
    expect(cfg.dbConnectionTimeoutMs).toBeUndefined();
    expect("dbPoolMax" in cfg).toBe(false);
    expect("dbConnectionTimeoutMs" in cfg).toBe(false);
  });

  it("non-prod: explicit valid values are parsed and used", () => {
    const cfg = loadIamConfig({ ...base, IAM_DB_POOL_MAX: "15", IAM_DB_CONNECTION_TIMEOUT_MS: "3000" });
    expect(cfg.dbPoolMax).toBe(15);
    expect(cfg.dbConnectionTimeoutMs).toBe(3000);
  });

  it("prod: both explicit and valid — loads successfully", () => {
    const cfg = loadIamConfig({
      ...base,
      ENVIRONMENT: "prod",
      IAM_DB_POOL_MAX: "20",
      IAM_DB_CONNECTION_TIMEOUT_MS: "5000",
    });
    expect(cfg.environment).toBe("prod");
    expect(cfg.dbPoolMax).toBe(20);
    expect(cfg.dbConnectionTimeoutMs).toBe(5000);
  });

  it("prod: IAM_DB_POOL_MAX missing — fails closed before any listener could bind", () => {
    const err = throwsConfigInvalid(() =>
      loadIamConfig({ ...base, ENVIRONMENT: "prod", IAM_DB_CONNECTION_TIMEOUT_MS: "5000" }),
    );
    expect(err.details.some((d) => String(d.issue).includes("IAM_DB_POOL_MAX"))).toBe(true);
  });

  it("prod: IAM_DB_CONNECTION_TIMEOUT_MS missing — fails closed", () => {
    const err = throwsConfigInvalid(() => loadIamConfig({ ...base, ENVIRONMENT: "prod", IAM_DB_POOL_MAX: "20" }));
    expect(err.details.some((d) => String(d.issue).includes("IAM_DB_CONNECTION_TIMEOUT_MS"))).toBe(true);
  });

  it("prod: both missing — fails closed and reports BOTH problems at once", () => {
    const err = throwsConfigInvalid(() => loadIamConfig({ ...base, ENVIRONMENT: "prod" }));
    const issues = err.details.map((d) => String(d.issue));
    expect(issues.some((i) => i.includes("IAM_DB_POOL_MAX"))).toBe(true);
    expect(issues.some((i) => i.includes("IAM_DB_CONNECTION_TIMEOUT_MS"))).toBe(true);
  });

  it("prod: empty string is treated as missing — fails closed (no distinct 'empty but valid' state)", () => {
    throwsConfigInvalid(() =>
      loadIamConfig({ ...base, ENVIRONMENT: "prod", IAM_DB_POOL_MAX: "   ", IAM_DB_CONNECTION_TIMEOUT_MS: "5000" }),
    );
  });

  it.each([
    ["abc", "non-numeric"],
    ["10abc", "trailing garbage"],
    ["10.5", "fractional"],
    ["0", "zero"],
    ["-1", "negative"],
    [" ", "whitespace-only (non-prod: treated as absent, so use prod to force validation)"],
    ["9007199254740993", "unsafe integer (beyond Number.isSafeInteger)"],
    ["1e3", "exponential notation, not a plain integer"],
    ["+5", "leading plus sign"],
  ])("rejects IAM_DB_POOL_MAX=%j (%s) in prod as CONFIGURATION_INVALID, never silently coerced", (value) => {
    if (value.trim() === "") return; // covered by the dedicated empty-string test above
    throwsConfigInvalid(() =>
      loadIamConfig({ ...base, ENVIRONMENT: "prod", IAM_DB_POOL_MAX: value, IAM_DB_CONNECTION_TIMEOUT_MS: "5000" }),
    );
  });

  it.each(["abc", "10.5", "0", "-1", "10abc"])(
    "rejects IAM_DB_CONNECTION_TIMEOUT_MS=%j in prod as CONFIGURATION_INVALID",
    (value) => {
      throwsConfigInvalid(() =>
        loadIamConfig({ ...base, ENVIRONMENT: "prod", IAM_DB_POOL_MAX: "20", IAM_DB_CONNECTION_TIMEOUT_MS: value }),
      );
    },
  );

  it("malformed values are rejected in NON-prod too — validation is not skipped merely because the environment is not prod", () => {
    throwsConfigInvalid(() => loadIamConfig({ ...base, IAM_DB_POOL_MAX: "not-a-number" }));
    throwsConfigInvalid(() => loadIamConfig({ ...base, IAM_DB_CONNECTION_TIMEOUT_MS: "-5" }));
  });

  it("accepts large-but-safe positive integers", () => {
    const cfg = loadIamConfig({ ...base, IAM_DB_POOL_MAX: "1000000", IAM_DB_CONNECTION_TIMEOUT_MS: "600000" });
    expect(cfg.dbPoolMax).toBe(1_000_000);
    expect(cfg.dbConnectionTimeoutMs).toBe(600_000);
  });
});
