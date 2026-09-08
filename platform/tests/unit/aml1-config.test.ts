/**
 * AML-01's own config loader (services/aml1/src/config.ts) — fail-closed behaviour for
 * AML1_INTERNAL_SERVICE_TOKEN, layered on top of the shared @aix/foundation loadConfig baseline
 * (already covered generically by tests/unit/config.test.ts). Mirrors tests/unit/
 * clt1-config.test.ts's own coverage shape. Phase 2A added CLT1_BASE_URL/CLT1_INTERNAL_SERVICE_TOKEN
 * (AML-01's first cross-module HTTP dependency, on CLT-01). Phase 2B adds IAM02_BASE_URL/
 * IAM02_INTERNAL_SERVICE_TOKEN (AML-01's first IAM-02 dependency) — mirrors CLT-01's own coverage
 * for the identical dependency shape (its own IAM02_BASE_URL/IAM02_INTERNAL_SERVICE_TOKEN).
 */
import { describe, it, expect } from "vitest";
import { AppError } from "@aix/foundation";
import { loadAml1Config } from "../../services/aml1/src/config.js";

const base = {
  ENVIRONMENT: "dev",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  PORT: "8080",
  AML1_INTERNAL_SERVICE_TOKEN: "aml1-internal-token-123",
  CLT1_BASE_URL: "http://localhost:8085",
  CLT1_INTERNAL_SERVICE_TOKEN: "clt1-internal-token-123",
  IAM02_BASE_URL: "http://localhost:8082",
  IAM02_INTERNAL_SERVICE_TOKEN: "iam02-internal-token-123",
};

describe("AML-01 config loader fail-closed", () => {
  it("loads a valid config", () => {
    const cfg = loadAml1Config(base);
    expect(cfg.environment).toBe("dev");
    expect(cfg.aml1InternalServiceToken).toBe("aml1-internal-token-123");
  });

  it("fails closed when AML1_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadAml1Config({ ...base, AML1_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed when AML1_INTERNAL_SERVICE_TOKEN is blank", () => {
    expect(() => loadAml1Config({ ...base, AML1_INTERNAL_SERVICE_TOKEN: "   " })).toThrowError(AppError);
  });

  it("fails closed when AML1_INTERNAL_SERVICE_TOKEN is too short (reuses the shared minimum-length rule)", () => {
    expect(() => loadAml1Config({ ...base, AML1_INTERNAL_SERVICE_TOKEN: "short" })).toThrowError(AppError);
  });

  it("throws CONFIGURATION_INVALID (not a generic error) on failure", () => {
    try {
      loadAml1Config({ ...base, AML1_INTERNAL_SERVICE_TOKEN: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe("CONFIGURATION_INVALID");
    }
  });

  it("still fails closed on the shared baseline when ENVIRONMENT is missing", () => {
    expect(() => loadAml1Config({ ...base, ENVIRONMENT: undefined })).toThrowError(AppError);
  });

  it("still fails closed on the shared baseline when DATABASE_URL is missing", () => {
    expect(() => loadAml1Config({ ...base, DATABASE_URL: undefined })).toThrowError(AppError);
  });

  it("PORT is optional and defaults to 8080 (shared loadConfig behaviour, not a AML-01-specific rule)", () => {
    const cfg = loadAml1Config({ ...base, PORT: undefined });
    expect(cfg.port).toBe(8080);
  });

  it("still fails closed on the shared baseline when PORT is out of range", () => {
    expect(() => loadAml1Config({ ...base, PORT: "70000" })).toThrowError(AppError);
  });

  it("still fails closed on the shared baseline (e.g. invalid ENVIRONMENT)", () => {
    expect(() => loadAml1Config({ ...base, ENVIRONMENT: "production!" })).toThrowError(AppError);
  });

  it("fails closed when CLT1_BASE_URL is missing", () => {
    expect(() => loadAml1Config({ ...base, CLT1_BASE_URL: undefined })).toThrowError(AppError);
  });

  it("fails closed when CLT1_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadAml1Config({ ...base, CLT1_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("loads clt1BaseUrl/clt1InternalServiceToken onto the returned config", () => {
    const cfg = loadAml1Config(base);
    expect(cfg.clt1BaseUrl).toBe("http://localhost:8085");
    expect(cfg.clt1InternalServiceToken).toBe("clt1-internal-token-123");
  });

  it("fails closed when IAM02_BASE_URL is missing", () => {
    expect(() => loadAml1Config({ ...base, IAM02_BASE_URL: undefined })).toThrowError(AppError);
  });

  it("fails closed when IAM02_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadAml1Config({ ...base, IAM02_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("loads iam2BaseUrl/iam2InternalServiceToken onto the returned config", () => {
    const cfg = loadAml1Config(base);
    expect(cfg.iam2BaseUrl).toBe("http://localhost:8082");
    expect(cfg.iam2InternalServiceToken).toBe("iam02-internal-token-123");
  });

  it("Phase 3B: AML1_SCREENING_PROVIDER defaults to the deterministic stub ('stub-v1') when unset", () => {
    const cfg = loadAml1Config({ ...base, AML1_SCREENING_PROVIDER: undefined });
    expect(cfg.screeningProviderId).toBe("stub-v1");
  });

  it("Phase 3B: an explicitly-set known provider id is loaded onto the returned config", () => {
    const cfg = loadAml1Config({ ...base, AML1_SCREENING_PROVIDER: "stub-v1" });
    expect(cfg.screeningProviderId).toBe("stub-v1");
  });

  it("Phase 3B: fails closed when AML1_SCREENING_PROVIDER is an unknown provider id", () => {
    expect(() => loadAml1Config({ ...base, AML1_SCREENING_PROVIDER: "not-a-real-provider" })).toThrowError(AppError);
  });

  it("Phase 3B: production boot guard — fails closed when ENVIRONMENT=prod and the provider is the deterministic stub", () => {
    expect(() => loadAml1Config({ ...base, ENVIRONMENT: "prod", AML1_SCREENING_PROVIDER: "stub-v1" })).toThrowError(AppError);
  });

  it("Phase 3B: production boot guard — a non-stub, non-prod config still boots (dev/test are exempt)", () => {
    const cfg = loadAml1Config({ ...base, ENVIRONMENT: "dev", AML1_SCREENING_PROVIDER: "stub-v1" });
    expect(cfg.environment).toBe("dev");
    expect(cfg.screeningProviderId).toBe("stub-v1");
  });

  it("Phase 3B: production boot guard throws CONFIGURATION_INVALID (not a generic error)", () => {
    try {
      loadAml1Config({ ...base, ENVIRONMENT: "prod", AML1_SCREENING_PROVIDER: "stub-v1" });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe("CONFIGURATION_INVALID");
    }
  });

  it("Phase 3D: AML1_STUCK_SCREENING_THRESHOLD_SECONDS defaults to 900 when unset", () => {
    const cfg = loadAml1Config({ ...base, AML1_STUCK_SCREENING_THRESHOLD_SECONDS: undefined });
    expect(cfg.stuckScreeningThresholdSeconds).toBe(900);
  });

  it("Phase 3D: an explicitly-set override at or above the hard floor is loaded onto the returned config", () => {
    const cfg = loadAml1Config({ ...base, AML1_STUCK_SCREENING_THRESHOLD_SECONDS: "1800" });
    expect(cfg.stuckScreeningThresholdSeconds).toBe(1800);
  });

  it("Phase 3D: accepts exactly the hard floor (300 seconds)", () => {
    const cfg = loadAml1Config({ ...base, AML1_STUCK_SCREENING_THRESHOLD_SECONDS: "300" });
    expect(cfg.stuckScreeningThresholdSeconds).toBe(300);
  });

  it("Phase 3D: fails closed (CONFIGURATION_INVALID) when the override is below the hard floor (299 < 300)", () => {
    expect(() => loadAml1Config({ ...base, AML1_STUCK_SCREENING_THRESHOLD_SECONDS: "299" })).toThrowError(AppError);
    try {
      loadAml1Config({ ...base, AML1_STUCK_SCREENING_THRESHOLD_SECONDS: "299" });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe("CONFIGURATION_INVALID");
    }
  });

  it("Phase 3D: fails closed when the override is non-numeric/non-positive", () => {
    expect(() => loadAml1Config({ ...base, AML1_STUCK_SCREENING_THRESHOLD_SECONDS: "not-a-number" })).toThrowError(AppError);
    expect(() => loadAml1Config({ ...base, AML1_STUCK_SCREENING_THRESHOLD_SECONDS: "0" })).toThrowError(AppError);
    expect(() => loadAml1Config({ ...base, AML1_STUCK_SCREENING_THRESHOLD_SECONDS: "-5" })).toThrowError(AppError);
  });

  // -----------------------------------------------------------------------------------------
  // Phase 3E: AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS
  // -----------------------------------------------------------------------------------------
  it("Phase 3E: AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS defaults to 2160 (90 days) when unset", () => {
    const cfg = loadAml1Config({ ...base, AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS: undefined });
    expect(cfg.pretransactionEvidenceMaxAgeHours).toBe(2160);
  });

  it("Phase 3E: accepts the minimum bound (1 hour)", () => {
    const cfg = loadAml1Config({ ...base, AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS: "1" });
    expect(cfg.pretransactionEvidenceMaxAgeHours).toBe(1);
  });

  it("Phase 3E: accepts the maximum bound (8760 hours = 1 year), given a rescreenDueDays ceiling wide enough to permit it", () => {
    // Isolates the [1,8760] bound check from the separate cross-field rescreenDueDays*24 ceiling
    // (default rescreenDueDays=90 -> 2160h, which would otherwise ALSO reject 8760h).
    const cfg = loadAml1Config({ ...base, AML1_RESCREEN_DUE_DAYS: "365", AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS: "8760" });
    expect(cfg.pretransactionEvidenceMaxAgeHours).toBe(8760);
  });

  it("Phase 3E: fails closed above the maximum bound (8761 > 8760) even with a wide rescreenDueDays ceiling", () => {
    expect(() => loadAml1Config({ ...base, AML1_RESCREEN_DUE_DAYS: "365", AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS: "8761" })).toThrowError(AppError);
  });

  it("Phase 3E: fails closed when zero/negative/non-numeric", () => {
    expect(() => loadAml1Config({ ...base, AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS: "0" })).toThrowError(AppError);
    expect(() => loadAml1Config({ ...base, AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS: "-1" })).toThrowError(AppError);
    expect(() => loadAml1Config({ ...base, AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS: "not-a-number" })).toThrowError(AppError);
  });

  it("Phase 3E: cross-field bound — fails closed when evidence-max-age exceeds rescreenDueDays * 24", () => {
    // rescreenDueDays default is 90 -> 90*24 = 2160. An explicit override of 2161 must fail closed.
    expect(() => loadAml1Config({ ...base, AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS: "2161" })).toThrowError(AppError);
    try {
      loadAml1Config({ ...base, AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS: "2161" });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe("CONFIGURATION_INVALID");
    }
  });

  it("Phase 3E: cross-field bound — a smaller AML1_RESCREEN_DUE_DAYS tightens the effective ceiling", () => {
    // rescreenDueDays=10 -> ceiling 240 hours; 241 must fail even though it is within [1,8760].
    expect(() => loadAml1Config({ ...base, AML1_RESCREEN_DUE_DAYS: "10", AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS: "241" })).toThrowError(AppError);
    const cfg = loadAml1Config({ ...base, AML1_RESCREEN_DUE_DAYS: "10", AML1_PRETRANSACTION_EVIDENCE_MAX_AGE_HOURS: "240" });
    expect(cfg.pretransactionEvidenceMaxAgeHours).toBe(240);
  });

  // -----------------------------------------------------------------------------------------
  // Phase 3E: AML1_PRETRANSACTION_DECISION_TTL_MINUTES
  // -----------------------------------------------------------------------------------------
  it("Phase 3E: AML1_PRETRANSACTION_DECISION_TTL_MINUTES defaults to 5 when unset", () => {
    const cfg = loadAml1Config({ ...base, AML1_PRETRANSACTION_DECISION_TTL_MINUTES: undefined });
    expect(cfg.pretransactionDecisionTtlMinutes).toBe(5);
  });

  it("Phase 3E: accepts the minimum bound (1 minute)", () => {
    const cfg = loadAml1Config({ ...base, AML1_PRETRANSACTION_DECISION_TTL_MINUTES: "1" });
    expect(cfg.pretransactionDecisionTtlMinutes).toBe(1);
  });

  it("Phase 3E: accepts the maximum bound (15 minutes)", () => {
    const cfg = loadAml1Config({ ...base, AML1_PRETRANSACTION_DECISION_TTL_MINUTES: "15" });
    expect(cfg.pretransactionDecisionTtlMinutes).toBe(15);
  });

  it("Phase 3E: fails closed above the maximum bound (16 > 15)", () => {
    expect(() => loadAml1Config({ ...base, AML1_PRETRANSACTION_DECISION_TTL_MINUTES: "16" })).toThrowError(AppError);
  });

  it("Phase 3E: fails closed when zero/negative/non-numeric", () => {
    expect(() => loadAml1Config({ ...base, AML1_PRETRANSACTION_DECISION_TTL_MINUTES: "0" })).toThrowError(AppError);
    expect(() => loadAml1Config({ ...base, AML1_PRETRANSACTION_DECISION_TTL_MINUTES: "-1" })).toThrowError(AppError);
    expect(() => loadAml1Config({ ...base, AML1_PRETRANSACTION_DECISION_TTL_MINUTES: "not-a-number" })).toThrowError(AppError);
  });
});
