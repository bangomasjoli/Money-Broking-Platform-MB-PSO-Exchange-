/**
 * CFG-01's own config loader (services/cfg1/src/config.ts) — fail-closed behaviour for
 * CFG1_INTERNAL_SERVICE_TOKEN and (Phase 3A) IAM02_BASE_URL/IAM02_INTERNAL_SERVICE_TOKEN,
 * layered on top of the shared @aix/foundation loadConfig baseline (already covered generically
 * by tests/unit/config.test.ts).
 */
import { describe, it, expect } from "vitest";
import { AppError } from "@aix/foundation";
import { loadCfg1Config } from "../../services/cfg1/src/config.js";

const base = {
  ENVIRONMENT: "dev",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  PORT: "8080",
  CFG1_INTERNAL_SERVICE_TOKEN: "cfg1-internal-token-123",
  IAM02_BASE_URL: "http://localhost:8082",
  IAM02_INTERNAL_SERVICE_TOKEN: "iam2-internal-token-123",
};

describe("CFG-01 config loader fail-closed", () => {
  it("loads a valid config", () => {
    const cfg = loadCfg1Config(base);
    expect(cfg.environment).toBe("dev");
    expect(cfg.cfg1InternalServiceToken).toBe("cfg1-internal-token-123");
    expect(cfg.iam2BaseUrl).toBe("http://localhost:8082");
    expect(cfg.iam2InternalServiceToken).toBe("iam2-internal-token-123");
  });

  it("fails closed when CFG1_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadCfg1Config({ ...base, CFG1_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed when IAM02_BASE_URL is missing (Phase 3A mutation-workflow dependency)", () => {
    expect(() => loadCfg1Config({ ...base, IAM02_BASE_URL: undefined })).toThrowError(AppError);
  });

  it("fails closed when IAM02_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadCfg1Config({ ...base, IAM02_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed when CFG1_INTERNAL_SERVICE_TOKEN is blank", () => {
    expect(() => loadCfg1Config({ ...base, CFG1_INTERNAL_SERVICE_TOKEN: "   " })).toThrowError(AppError);
  });

  it("fails closed when CFG1_INTERNAL_SERVICE_TOKEN is too short (reuses the shared minimum-length rule)", () => {
    expect(() => loadCfg1Config({ ...base, CFG1_INTERNAL_SERVICE_TOKEN: "short" })).toThrowError(AppError);
  });

  it("throws CONFIGURATION_INVALID (not a generic error) on failure", () => {
    try {
      loadCfg1Config({ ...base, CFG1_INTERNAL_SERVICE_TOKEN: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe("CONFIGURATION_INVALID");
    }
  });

  it("still fails closed on the shared baseline (e.g. missing DATABASE_URL)", () => {
    expect(() => loadCfg1Config({ ...base, DATABASE_URL: undefined })).toThrowError(AppError);
  });
});
