/**
 * KYC-01's own config loader (services/kyc1/src/config.ts) — fail-closed behaviour for
 * KYC1_INTERNAL_SERVICE_TOKEN, layered on top of the shared @aix/foundation loadConfig baseline
 * (already covered generically by tests/unit/config.test.ts). Mirrors tests/unit/
 * aml1-config.test.ts's own Phase 0/1 coverage shape.
 */
import { describe, it, expect } from "vitest";
import { AppError } from "@aix/foundation";
import { loadKyc1Config } from "../../services/kyc1/src/config.js";

const base = {
  ENVIRONMENT: "dev",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  PORT: "8080",
  KYC1_INTERNAL_SERVICE_TOKEN: "kyc1-internal-token-123",
  CLT1_BASE_URL: "http://localhost:8085",
  CLT1_INTERNAL_SERVICE_TOKEN: "clt1-shared-token-123",
  IAM02_BASE_URL: "http://localhost:8082",
  IAM02_INTERNAL_SERVICE_TOKEN: "iam2-shared-token-123",
};

describe("KYC-01 config loader fail-closed", () => {
  it("loads a valid config", () => {
    const cfg = loadKyc1Config(base);
    expect(cfg.environment).toBe("dev");
    expect(cfg.kyc1InternalServiceToken).toBe("kyc1-internal-token-123");
    expect(cfg.clt1BaseUrl).toBe("http://localhost:8085");
    expect(cfg.clt1InternalServiceToken).toBe("clt1-shared-token-123");
    expect(cfg.iam2BaseUrl).toBe("http://localhost:8082");
    expect(cfg.iam2InternalServiceToken).toBe("iam2-shared-token-123");
  });

  it("fails closed when CLT1_BASE_URL is missing (Phase 2B outcome-delivery dependency)", () => {
    expect(() => loadKyc1Config({ ...base, CLT1_BASE_URL: undefined })).toThrowError(AppError);
  });

  it("fails closed when CLT1_INTERNAL_SERVICE_TOKEN is missing (Phase 2B outcome-delivery dependency)", () => {
    expect(() => loadKyc1Config({ ...base, CLT1_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed when IAM02_BASE_URL is missing (Phase 3A permission-guard dependency)", () => {
    expect(() => loadKyc1Config({ ...base, IAM02_BASE_URL: undefined })).toThrowError(AppError);
  });

  it("fails closed when IAM02_INTERNAL_SERVICE_TOKEN is missing (Phase 3A permission-guard dependency)", () => {
    expect(() => loadKyc1Config({ ...base, IAM02_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed when KYC1_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadKyc1Config({ ...base, KYC1_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed when KYC1_INTERNAL_SERVICE_TOKEN is blank", () => {
    expect(() => loadKyc1Config({ ...base, KYC1_INTERNAL_SERVICE_TOKEN: "   " })).toThrowError(AppError);
  });

  it("fails closed when KYC1_INTERNAL_SERVICE_TOKEN is too short (reuses the shared minimum-length rule)", () => {
    expect(() => loadKyc1Config({ ...base, KYC1_INTERNAL_SERVICE_TOKEN: "short" })).toThrowError(AppError);
  });

  it("throws CONFIGURATION_INVALID (not a generic error) on failure", () => {
    try {
      loadKyc1Config({ ...base, KYC1_INTERNAL_SERVICE_TOKEN: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe("CONFIGURATION_INVALID");
    }
  });

  it("still fails closed on the shared baseline when ENVIRONMENT is missing", () => {
    expect(() => loadKyc1Config({ ...base, ENVIRONMENT: undefined })).toThrowError(AppError);
  });

  it("still fails closed on the shared baseline when DATABASE_URL is missing", () => {
    expect(() => loadKyc1Config({ ...base, DATABASE_URL: undefined })).toThrowError(AppError);
  });

  it("PORT is optional and defaults to 8080 (shared loadConfig behaviour, not a KYC-01-specific rule)", () => {
    const cfg = loadKyc1Config({ ...base, PORT: undefined });
    expect(cfg.port).toBe(8080);
  });

  it("still fails closed on the shared baseline when PORT is out of range", () => {
    expect(() => loadKyc1Config({ ...base, PORT: "70000" })).toThrowError(AppError);
  });

  it("still fails closed on the shared baseline (e.g. invalid ENVIRONMENT)", () => {
    expect(() => loadKyc1Config({ ...base, ENVIRONMENT: "production!" })).toThrowError(AppError);
  });
});
