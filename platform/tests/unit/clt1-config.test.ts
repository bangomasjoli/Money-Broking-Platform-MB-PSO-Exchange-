/**
 * CLT-01's own config loader (services/clt1/src/config.ts) — fail-closed behaviour for
 * CLT1_INTERNAL_SERVICE_TOKEN, layered on top of the shared @aix/foundation loadConfig baseline
 * (already covered generically by tests/unit/config.test.ts). Phase 1 adds CFG1_BASE_URL/
 * CFG1_INTERNAL_SERVICE_TOKEN (CLT-01's onboarding-gate dependency on CFG-01); Phase 2 adds
 * IAM02_BASE_URL/IAM02_INTERNAL_SERVICE_TOKEN (CLT-01's first IAM-02 dependency) — mirrors
 * tests/unit/cfg1-config.test.ts's own coverage for the identical dependency shape.
 */
import { describe, it, expect } from "vitest";
import { AppError } from "@aix/foundation";
import { loadClt1Config } from "../../services/clt1/src/config.js";

const base = {
  ENVIRONMENT: "dev",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  PORT: "8080",
  CLT1_INTERNAL_SERVICE_TOKEN: "clt1-internal-token-123",
  CFG1_BASE_URL: "http://localhost:8084",
  CFG1_INTERNAL_SERVICE_TOKEN: "cfg1-internal-token-123",
  IAM02_BASE_URL: "http://localhost:8082",
  IAM02_INTERNAL_SERVICE_TOKEN: "iam02-internal-token-123",
};

describe("CLT-01 config loader fail-closed", () => {
  it("loads a valid config", () => {
    const cfg = loadClt1Config(base);
    expect(cfg.environment).toBe("dev");
    expect(cfg.clt1InternalServiceToken).toBe("clt1-internal-token-123");
    expect(cfg.cfg1BaseUrl).toBe("http://localhost:8084");
    expect(cfg.cfg1InternalServiceToken).toBe("cfg1-internal-token-123");
    expect(cfg.iam2BaseUrl).toBe("http://localhost:8082");
    expect(cfg.iam2InternalServiceToken).toBe("iam02-internal-token-123");
  });

  it("fails closed when CFG1_BASE_URL is missing", () => {
    expect(() => loadClt1Config({ ...base, CFG1_BASE_URL: undefined })).toThrowError(AppError);
  });

  it("fails closed when CFG1_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadClt1Config({ ...base, CFG1_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed when IAM02_BASE_URL is missing", () => {
    expect(() => loadClt1Config({ ...base, IAM02_BASE_URL: undefined })).toThrowError(AppError);
  });

  it("fails closed when IAM02_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadClt1Config({ ...base, IAM02_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed when CLT1_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadClt1Config({ ...base, CLT1_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed when CLT1_INTERNAL_SERVICE_TOKEN is blank", () => {
    expect(() => loadClt1Config({ ...base, CLT1_INTERNAL_SERVICE_TOKEN: "   " })).toThrowError(AppError);
  });

  it("fails closed when CLT1_INTERNAL_SERVICE_TOKEN is too short (reuses the shared minimum-length rule)", () => {
    expect(() => loadClt1Config({ ...base, CLT1_INTERNAL_SERVICE_TOKEN: "short" })).toThrowError(AppError);
  });

  it("throws CONFIGURATION_INVALID (not a generic error) on failure", () => {
    try {
      loadClt1Config({ ...base, CLT1_INTERNAL_SERVICE_TOKEN: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe("CONFIGURATION_INVALID");
    }
  });

  it("still fails closed on the shared baseline (e.g. missing DATABASE_URL)", () => {
    expect(() => loadClt1Config({ ...base, DATABASE_URL: undefined })).toThrowError(AppError);
  });

  it("still fails closed on the shared baseline (e.g. invalid ENVIRONMENT)", () => {
    expect(() => loadClt1Config({ ...base, ENVIRONMENT: "production!" })).toThrowError(AppError);
  });
});
