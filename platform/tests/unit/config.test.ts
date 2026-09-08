import { describe, it, expect } from "vitest";
import { AppError, loadConfig } from "@aix/foundation";

const base = {
  ENVIRONMENT: "dev",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  INTERNAL_SERVICE_TOKEN: "internal-token-123",
  PORT: "8080",
};

describe("config loader fail-closed (FND-FR-001, §5.2)", () => {
  it("loads a valid config", () => {
    const cfg = loadConfig(base);
    expect(cfg.environment).toBe("dev");
    expect(cfg.port).toBe(8080);
    expect(cfg.releaseVersion).toBe("v0.0.0");
  });

  it("fails closed when DATABASE_URL missing", () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: undefined })).toThrowError(AppError);
  });

  it("fails closed when INTERNAL_SERVICE_TOKEN missing (IAM seam)", () => {
    expect(() => loadConfig({ ...base, INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed on invalid ENVIRONMENT", () => {
    expect(() => loadConfig({ ...base, ENVIRONMENT: "production!" })).toThrowError(AppError);
  });

  it("reports all problems at once", () => {
    try {
      loadConfig({ PORT: "not-a-port" });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe("CONFIGURATION_INVALID");
      expect(err.details.length).toBeGreaterThanOrEqual(3);
    }
  });
});
