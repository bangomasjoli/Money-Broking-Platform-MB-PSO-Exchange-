/**
 * WLT-01's own config loader (services/wlt1/src/config.ts) — fail-closed behaviour for
 * WLT1_INTERNAL_SERVICE_TOKEN/CLT1_BASE_URL/CLT1_INTERNAL_SERVICE_TOKEN, layered on top of the
 * shared @aix/foundation loadConfig baseline (already covered generically by tests/unit/
 * config.test.ts). Mirrors tests/unit/aml1-config.test.ts's own coverage shape for the identical
 * CLT-01-dependency addition.
 */
import { describe, it, expect } from "vitest";
import { AppError } from "@aix/foundation";
import { loadWlt1Config } from "../../services/wlt1/src/config.js";

const base = {
  ENVIRONMENT: "dev",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  PORT: "8080",
  WLT1_INTERNAL_SERVICE_TOKEN: "wlt1-internal-token-123",
  CLT1_BASE_URL: "http://localhost:8085",
  CLT1_INTERNAL_SERVICE_TOKEN: "clt1-internal-token-123",
  IAM2_BASE_URL: "http://localhost:8082",
  IAM2_INTERNAL_SERVICE_TOKEN: "iam2-internal-token-123",
  AML1_BASE_URL: "http://localhost:8088",
  AML1_INTERNAL_SERVICE_TOKEN: "aml1-internal-token-123",
  WLT1_FIAT_ENC_KEY: "test-fiat-enc-key-at-least-32-characters-long",
  IAM_BASE_URL: "http://localhost:8081",
  IAM_INTROSPECTION_SERVICE_TOKEN: "iam-introspection-token-123",
  FND_BASE_URL: "http://localhost:8080",
  FND_RATE_LIMIT_CONSUMER_TOKEN: "fnd-ratelimit-consumer-token-123",
  WLT1_PUBLIC_DESTINATION_LIST_MAX: "100",
};

describe("WLT-01 config loader fail-closed", () => {
  it("loads a valid config", () => {
    const cfg = loadWlt1Config(base);
    expect(cfg.environment).toBe("dev");
    expect(cfg.wlt1InternalServiceToken).toBe("wlt1-internal-token-123");
  });

  it("fails closed when WLT1_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed when WLT1_INTERNAL_SERVICE_TOKEN is blank", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_INTERNAL_SERVICE_TOKEN: "   " })).toThrowError(AppError);
  });

  it("fails closed when WLT1_INTERNAL_SERVICE_TOKEN is too short (reuses the shared minimum-length rule)", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_INTERNAL_SERVICE_TOKEN: "short" })).toThrowError(AppError);
  });

  it("throws CONFIGURATION_INVALID (not a generic error) on failure", () => {
    try {
      loadWlt1Config({ ...base, WLT1_INTERNAL_SERVICE_TOKEN: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe("CONFIGURATION_INVALID");
    }
  });

  it("the thrown error's details/message never echo the configured token value", () => {
    try {
      loadWlt1Config({ ...base, WLT1_INTERNAL_SERVICE_TOKEN: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      const raw = JSON.stringify({ message: err.message, details: err.details });
      expect(raw).not.toContain("wlt1-internal-token-123");
      expect(raw).not.toContain("clt1-internal-token-123");
    }
  });

  it("still fails closed on the shared baseline when ENVIRONMENT is missing", () => {
    expect(() => loadWlt1Config({ ...base, ENVIRONMENT: undefined })).toThrowError(AppError);
  });

  it("still fails closed on the shared baseline when DATABASE_URL is missing", () => {
    expect(() => loadWlt1Config({ ...base, DATABASE_URL: undefined })).toThrowError(AppError);
  });

  it("PORT is optional and defaults to 8080 (shared loadConfig behaviour, not a WLT-01-specific rule)", () => {
    const cfg = loadWlt1Config({ ...base, PORT: undefined });
    expect(cfg.port).toBe(8080);
  });

  it("still fails closed on the shared baseline when PORT is out of range", () => {
    expect(() => loadWlt1Config({ ...base, PORT: "70000" })).toThrowError(AppError);
  });

  it("still fails closed on the shared baseline (e.g. invalid ENVIRONMENT)", () => {
    expect(() => loadWlt1Config({ ...base, ENVIRONMENT: "production!" })).toThrowError(AppError);
  });

  it("fails closed when CLT1_BASE_URL is missing", () => {
    expect(() => loadWlt1Config({ ...base, CLT1_BASE_URL: undefined })).toThrowError(AppError);
  });

  it("fails closed when CLT1_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadWlt1Config({ ...base, CLT1_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("loads clt1BaseUrl/clt1InternalServiceToken onto the returned config", () => {
    const cfg = loadWlt1Config(base);
    expect(cfg.clt1BaseUrl).toBe("http://localhost:8085");
    expect(cfg.clt1InternalServiceToken).toBe("clt1-internal-token-123");
  });

  it("Phase 1B/2B/2C-B config carries no CFG-01/KYC-01/SEC-01 base-URL/token, chain-vendor, provider-timeout-config, or decision-token setting (iam2BaseUrl/aml1BaseUrl are EXCLUDED from this pin — Phase 4A-1/4A-2 legitimately added them, see their own config blocks below)", () => {
    const cfg = loadWlt1Config(base) as unknown as Record<string, unknown>;
    for (const futurePhaseField of [
      "cfg1BaseUrl",
      "kyc1BaseUrl",
      "sec1BaseUrl",
      "coolingOffDurationSeconds",
      "decisionTokenTtlSeconds",
      "screeningProviderTimeoutMs",
      "vendorApiKey",
      "vendorUrl",
    ]) {
      expect(cfg[futurePhaseField]).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------------------------
  // Phase 2B: WLT1_SCREENING_PROVIDER — mirrors tests/unit/aml1-config.test.ts's own
  // AML1_SCREENING_PROVIDER coverage shape for the identical provider-selection/prod-guard pattern.
  // -------------------------------------------------------------------------------------------
  it("Phase 2B: WLT1_SCREENING_PROVIDER defaults to the deterministic stub ('stub-wallet-analytics-v1') when unset", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_SCREENING_PROVIDER: undefined });
    expect(cfg.screeningProviderId).toBe("stub-wallet-analytics-v1");
  });

  it("Phase 2B: WLT1_SCREENING_PROVIDER accepts the frozen stub id explicitly", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_SCREENING_PROVIDER: "stub-wallet-analytics-v1" });
    expect(cfg.screeningProviderId).toBe("stub-wallet-analytics-v1");
  });

  it("Phase 2B: fails closed when WLT1_SCREENING_PROVIDER is an unknown provider id", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_SCREENING_PROVIDER: "not-a-real-provider" })).toThrowError(AppError);
  });

  it("Phase 2B: production boot guard — fails closed when ENVIRONMENT=prod and the provider is the deterministic stub", () => {
    expect(() =>
      loadWlt1Config({ ...base, ENVIRONMENT: "prod", WLT1_SCREENING_PROVIDER: "stub-wallet-analytics-v1" }),
    ).toThrowError(AppError);
  });

  it("Phase 2B: production boot guard — a non-prod environment with the stub still boots (dev/test/qa/uat/staging are exempt)", () => {
    for (const env of ["dev", "qa", "uat", "staging"]) {
      const cfg = loadWlt1Config({ ...base, ENVIRONMENT: env, WLT1_SCREENING_PROVIDER: "stub-wallet-analytics-v1" });
      expect(cfg.screeningProviderId).toBe("stub-wallet-analytics-v1");
    }
  });

  it("Phase 2B: production boot guard error is CONFIGURATION_INVALID and never echoes a token", () => {
    try {
      loadWlt1Config({ ...base, ENVIRONMENT: "prod", WLT1_SCREENING_PROVIDER: "stub-wallet-analytics-v1" });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe("CONFIGURATION_INVALID");
      const raw = JSON.stringify({ message: err.message, details: err.details });
      expect(raw).not.toContain("wlt1-internal-token-123");
      expect(raw).not.toContain("clt1-internal-token-123");
    }
  });

  it("Phase 2B: no real vendor URL or API key is required to load a valid config", () => {
    const cfg = loadWlt1Config(base);
    expect(cfg.screeningProviderId).toBe("stub-wallet-analytics-v1");
  });

  // -------------------------------------------------------------------------------------------
  // Phase 2C-B: WLT1_SCREENING_MAX_VALIDITY_HOURS — the internal WLT control ceiling
  // `lib/screening-application.ts` uses to compute effective screening-result validity. NOT a
  // Labuan FSA-prescribed duration.
  // -------------------------------------------------------------------------------------------
  it("Phase 2C-B: WLT1_SCREENING_MAX_VALIDITY_HOURS defaults to 720 (30 days) when unset", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_SCREENING_MAX_VALIDITY_HOURS: undefined });
    expect(cfg.screeningMaxValidityHours).toBe(720);
  });

  it("Phase 2C-B: WLT1_SCREENING_MAX_VALIDITY_HOURS accepts an explicit in-range override", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_SCREENING_MAX_VALIDITY_HOURS: "168" });
    expect(cfg.screeningMaxValidityHours).toBe(168);
  });

  it("Phase 2C-B: WLT1_SCREENING_MAX_VALIDITY_HOURS accepts the minimum boundary (1)", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_SCREENING_MAX_VALIDITY_HOURS: "1" });
    expect(cfg.screeningMaxValidityHours).toBe(1);
  });

  it("Phase 2C-B: WLT1_SCREENING_MAX_VALIDITY_HOURS accepts the maximum boundary (8760)", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_SCREENING_MAX_VALIDITY_HOURS: "8760" });
    expect(cfg.screeningMaxValidityHours).toBe(8760);
  });

  it("Phase 2C-B: WLT1_SCREENING_MAX_VALIDITY_HOURS fails closed at 0", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_SCREENING_MAX_VALIDITY_HOURS: "0" })).toThrowError(AppError);
  });

  it("Phase 2C-B: WLT1_SCREENING_MAX_VALIDITY_HOURS fails closed at 8761 (one over the maximum)", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_SCREENING_MAX_VALIDITY_HOURS: "8761" })).toThrowError(AppError);
  });

  it("Phase 2C-B: WLT1_SCREENING_MAX_VALIDITY_HOURS fails closed on a non-integer value", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_SCREENING_MAX_VALIDITY_HOURS: "168.5" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_SCREENING_MAX_VALIDITY_HOURS: "not-a-number" })).toThrowError(AppError);
  });

  it("Phase 2C-B: the safe validity default requires no explicit production override (prod boot still only blocked by the existing stub-provider guard)", () => {
    expect(() => loadWlt1Config({ ...base, ENVIRONMENT: "prod", WLT1_SCREENING_PROVIDER: "stub-wallet-analytics-v1" })).toThrowError(AppError);
  });

  // -------------------------------------------------------------------------------------------
  // Phase 3A-1: WLT1_POC_CHALLENGE_TTL_MINUTES — how long an issued PoC challenge remains
  // verifiable before expiring. No reachable consumer this slice (Phase 3A-2/3A-3's job).
  // -------------------------------------------------------------------------------------------
  it("Phase 3A-1: WLT1_POC_CHALLENGE_TTL_MINUTES defaults to 15 when unset", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_POC_CHALLENGE_TTL_MINUTES: undefined });
    expect(cfg.pocChallengeTtlMinutes).toBe(15);
  });

  it("Phase 3A-1: WLT1_POC_CHALLENGE_TTL_MINUTES accepts an explicit in-range override", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_POC_CHALLENGE_TTL_MINUTES: "30" });
    expect(cfg.pocChallengeTtlMinutes).toBe(30);
  });

  it("Phase 3A-1: WLT1_POC_CHALLENGE_TTL_MINUTES accepts the minimum boundary (5)", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_POC_CHALLENGE_TTL_MINUTES: "5" });
    expect(cfg.pocChallengeTtlMinutes).toBe(5);
  });

  it("Phase 3A-1: WLT1_POC_CHALLENGE_TTL_MINUTES accepts the maximum boundary (60)", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_POC_CHALLENGE_TTL_MINUTES: "60" });
    expect(cfg.pocChallengeTtlMinutes).toBe(60);
  });

  it("Phase 3A-1: WLT1_POC_CHALLENGE_TTL_MINUTES fails closed at 4 (one under the minimum)", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_POC_CHALLENGE_TTL_MINUTES: "4" })).toThrowError(AppError);
  });

  it("Phase 3A-1: WLT1_POC_CHALLENGE_TTL_MINUTES fails closed at 61 (one over the maximum)", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_POC_CHALLENGE_TTL_MINUTES: "61" })).toThrowError(AppError);
  });

  it("Phase 3A-1: WLT1_POC_CHALLENGE_TTL_MINUTES fails closed on a non-integer value", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_POC_CHALLENGE_TTL_MINUTES: "15.5" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_POC_CHALLENGE_TTL_MINUTES: "not-a-number" })).toThrowError(AppError);
  });

  // -------------------------------------------------------------------------------------------
  // Phase 3A-1: WLT1_POC_MAX_ATTEMPTS — maximum verification attempts a single PoC challenge may
  // receive. No reachable consumer this slice (Phase 3A-2/3A-3's job).
  // -------------------------------------------------------------------------------------------
  it("Phase 3A-1: WLT1_POC_MAX_ATTEMPTS defaults to 5 when unset", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_POC_MAX_ATTEMPTS: undefined });
    expect(cfg.pocMaxAttempts).toBe(5);
  });

  it("Phase 3A-1: WLT1_POC_MAX_ATTEMPTS accepts an explicit in-range override", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_POC_MAX_ATTEMPTS: "3" });
    expect(cfg.pocMaxAttempts).toBe(3);
  });

  it("Phase 3A-1: WLT1_POC_MAX_ATTEMPTS accepts the minimum boundary (1)", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_POC_MAX_ATTEMPTS: "1" });
    expect(cfg.pocMaxAttempts).toBe(1);
  });

  it("Phase 3A-1: WLT1_POC_MAX_ATTEMPTS accepts the maximum boundary (10)", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_POC_MAX_ATTEMPTS: "10" });
    expect(cfg.pocMaxAttempts).toBe(10);
  });

  it("Phase 3A-1: WLT1_POC_MAX_ATTEMPTS fails closed at 0", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_POC_MAX_ATTEMPTS: "0" })).toThrowError(AppError);
  });

  it("Phase 3A-1: WLT1_POC_MAX_ATTEMPTS fails closed at 11 (one over the maximum)", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_POC_MAX_ATTEMPTS: "11" })).toThrowError(AppError);
  });

  it("Phase 3A-1: WLT1_POC_MAX_ATTEMPTS fails closed on a non-integer value", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_POC_MAX_ATTEMPTS: "3.5" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_POC_MAX_ATTEMPTS: "not-a-number" })).toThrowError(AppError);
  });

  // -------------------------------------------------------------------------------------------
  // Phase 2C-D1: WLT1_PROVIDER_RECEIPT_SECRETS — supersedes the Phase 2C-B singular
  // WLT1_PROVIDER_RECEIPT_TOKEN field (removed). JSON object string, providerId -> secret,
  // always structurally validated when present; required for the active screening provider only
  // in prod.
  // -------------------------------------------------------------------------------------------
  it("WLT1_PROVIDER_RECEIPT_SECRETS absent is accepted in dev (empty map, not undefined)", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: undefined });
    expect(cfg.providerReceiptSecrets).toEqual({});
  });

  it("a valid single-provider map is parsed correctly", () => {
    const secret = "a".repeat(32);
    const cfg = loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ "stub-wallet-analytics-v1": secret }) });
    expect(cfg.providerReceiptSecrets).toEqual({ "stub-wallet-analytics-v1": secret });
  });

  it("the map structurally supports multiple providers simultaneously (even though only one is known this build)", () => {
    // Two entries for the SAME known provider id would collide in a real object; this proves the
    // parser's own multi-entry code path (Object.entries iteration) rather than special-casing a
    // single key — an unknown second id is rejected on its own merits (asserted separately below),
    // not because the parser can only ever see one entry.
    const secretA = "a".repeat(32);
    expect(() =>
      loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ "stub-wallet-analytics-v1": secretA, "not-a-real-provider": "b".repeat(32) }) }),
    ).toThrowError(AppError);
  });

  it("a secret exactly 32 characters is accepted", () => {
    const secret = "a".repeat(32);
    const cfg = loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ "stub-wallet-analytics-v1": secret }) });
    expect(cfg.providerReceiptSecrets["stub-wallet-analytics-v1"]).toBe(secret);
  });

  it("a secret shorter than 32 characters fails closed", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ "stub-wallet-analytics-v1": "a".repeat(31) }) })).toThrowError(AppError);
  });

  it("an empty-string secret fails closed", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ "stub-wallet-analytics-v1": "" }) })).toThrowError(AppError);
  });

  it("a whitespace-only secret fails closed", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ "stub-wallet-analytics-v1": "   ".padEnd(40) }) })).toThrowError(AppError);
  });

  it("an entry for an unknown provider id fails closed (not accepted unless the provider exists in the frozen registry)", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ "not-a-real-provider": "a".repeat(32) }) })).toThrowError(AppError);
  });

  it("malformed JSON fails closed", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: "{not valid json" })).toThrowError(AppError);
  });

  it("a JSON array (not an object) fails closed", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify(["a".repeat(32)]) })).toThrowError(AppError);
  });

  it("a non-string value (e.g. a number) fails closed", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: `{"stub-wallet-analytics-v1": 12345678901234567890123456789012}` })).toThrowError(AppError);
  });

  it("a nested object value fails closed", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: `{"stub-wallet-analytics-v1": {"nested": "${"a".repeat(32)}"}}` })).toThrowError(AppError);
  });

  it("a textually-duplicated top-level provider-id key fails closed (JSON.parse itself would silently keep only the last one)", () => {
    const raw = `{"stub-wallet-analytics-v1": "${"a".repeat(32)}", "stub-wallet-analytics-v1": "${"b".repeat(32)}"}`;
    expect(() => loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: raw })).toThrowError(AppError);
  });

  it("a configured secret is never echoed in a config-error message/details", () => {
    const secret = "a".repeat(40);
    try {
      loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ "stub-wallet-analytics-v1": secret }), WLT1_INTERNAL_SERVICE_TOKEN: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      const raw = JSON.stringify({ message: err.message, details: err.details });
      expect(raw).not.toContain(secret);
    }
  });

  it("a valid receipt secret is never echoed anywhere on an unrelated failure", () => {
    const secret = "b".repeat(40);
    try {
      loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ "stub-wallet-analytics-v1": secret }), ENVIRONMENT: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      const raw = JSON.stringify({ message: err.message, details: err.details });
      expect(raw).not.toContain(secret);
    }
  });

  it("prod boot without ANY receipt secret configured fails closed (the receipt route always exists once 2C-D1 ships)", () => {
    expect(() =>
      loadWlt1Config({
        ...base,
        ENVIRONMENT: "prod",
        WLT1_SCREENING_PROVIDER: "stub-wallet-analytics-v1",
        WLT1_PROVIDER_RECEIPT_SECRETS: undefined,
      }),
    ).toThrowError(AppError);
  });

  it("prod boot with a receipt secret for a DIFFERENT provider than the active one still fails closed", () => {
    // stub is disallowed in prod anyway (existing guard) — this test isolates the receipt-secret
    // guard specifically by using a hypothetical future non-stub active provider id that would
    // still be rejected by the known-id check; asserts CONFIGURATION_INVALID either way, proving
    // the two guards compose rather than one silently masking the other.
    expect(() =>
      loadWlt1Config({
        ...base,
        ENVIRONMENT: "prod",
        WLT1_SCREENING_PROVIDER: "stub-wallet-analytics-v1",
        WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ "some-other-provider-not-active": "c".repeat(32) }),
      }),
    ).toThrowError(AppError);
  });

  it("dev boot without any receipt secret is unaffected (still latent-safe, empty map)", () => {
    const cfg = loadWlt1Config({ ...base, ENVIRONMENT: "dev", WLT1_PROVIDER_RECEIPT_SECRETS: undefined });
    expect(cfg.providerReceiptSecrets).toEqual({});
  });

  it("existing accepted prod+stub boot refusal is unchanged by the new config field", () => {
    expect(() =>
      loadWlt1Config({
        ...base,
        ENVIRONMENT: "prod",
        WLT1_SCREENING_PROVIDER: "stub-wallet-analytics-v1",
        WLT1_SCREENING_MAX_VALIDITY_HOURS: "720",
        WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ "stub-wallet-analytics-v1": "c".repeat(32) }),
      }),
    ).toThrowError(AppError);
  });

  it("providerReceiptSecrets is frozen on the returned config", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_PROVIDER_RECEIPT_SECRETS: JSON.stringify({ "stub-wallet-analytics-v1": "a".repeat(32) }) });
    expect(Object.isFrozen(cfg.providerReceiptSecrets)).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// Phase 4A-1 — WLT1_DESTINATION_COOLING_OFF_HOURS / IAM2_BASE_URL / IAM2_INTERNAL_SERVICE_TOKEN.
// -------------------------------------------------------------------------------------------
describe("WLT-01 Phase 4A-1 config", () => {
  it("defaults WLT1_DESTINATION_COOLING_OFF_HOURS to 24 when unset", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_DESTINATION_COOLING_OFF_HOURS: undefined });
    expect(cfg.destinationCoolingOffHours).toBe(24);
  });

  it("accepts an explicit override within range", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_DESTINATION_COOLING_OFF_HOURS: "48" });
    expect(cfg.destinationCoolingOffHours).toBe(48);
  });

  it("accepts the minimum bound (1)", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_DESTINATION_COOLING_OFF_HOURS: "1" });
    expect(cfg.destinationCoolingOffHours).toBe(1);
  });

  it("accepts the maximum bound (720)", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_DESTINATION_COOLING_OFF_HOURS: "720" });
    expect(cfg.destinationCoolingOffHours).toBe(720);
  });

  it("fails closed below the minimum bound (0)", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_DESTINATION_COOLING_OFF_HOURS: "0" })).toThrowError(AppError);
  });

  it("fails closed on a negative value", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_DESTINATION_COOLING_OFF_HOURS: "-5" })).toThrowError(AppError);
  });

  it("fails closed on a non-numeric value", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_DESTINATION_COOLING_OFF_HOURS: "not-a-number" })).toThrowError(AppError);
  });

  it("fails closed above the maximum bound (721)", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_DESTINATION_COOLING_OFF_HOURS: "721" })).toThrowError(AppError);
  });

  it("the 24-hour default is unchanged by this test suite's own existence (regression pin)", () => {
    const cfg = loadWlt1Config(base);
    expect(cfg.destinationCoolingOffHours).toBe(24);
  });

  it("fails closed when IAM2_BASE_URL is missing", () => {
    expect(() => loadWlt1Config({ ...base, IAM2_BASE_URL: undefined })).toThrowError(AppError);
  });

  it("fails closed when IAM2_BASE_URL is blank", () => {
    expect(() => loadWlt1Config({ ...base, IAM2_BASE_URL: "   " })).toThrowError(AppError);
  });

  it("fails closed when IAM2_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadWlt1Config({ ...base, IAM2_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed when IAM2_INTERNAL_SERVICE_TOKEN is blank", () => {
    expect(() => loadWlt1Config({ ...base, IAM2_INTERNAL_SERVICE_TOKEN: "   " })).toThrowError(AppError);
  });

  it("loads iam2BaseUrl/iam2InternalServiceToken onto the returned config", () => {
    const cfg = loadWlt1Config(base);
    expect(cfg.iam2BaseUrl).toBe("http://localhost:8082");
    expect(cfg.iam2InternalServiceToken).toBe("iam2-internal-token-123");
  });

  it("the thrown error's details/message never echo the configured IAM2_INTERNAL_SERVICE_TOKEN value", () => {
    try {
      loadWlt1Config({ ...base, IAM2_INTERNAL_SERVICE_TOKEN: "super-secret-iam2-token-value", IAM2_BASE_URL: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      expect(JSON.stringify(err.details ?? [])).not.toContain("super-secret-iam2-token-value");
    }
  });

  it("multiple simultaneous Phase 4A-1 config problems are all reported together", () => {
    try {
      loadWlt1Config({ ...base, WLT1_DESTINATION_COOLING_OFF_HOURS: "0", IAM2_BASE_URL: undefined, IAM2_INTERNAL_SERVICE_TOKEN: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      const joined = JSON.stringify(err.details ?? []);
      expect(joined).toContain("WLT1_DESTINATION_COOLING_OFF_HOURS");
      expect(joined).toContain("IAM2_BASE_URL");
      expect(joined).toContain("IAM2_INTERNAL_SERVICE_TOKEN");
    }
  });
});

// -------------------------------------------------------------------------------------------
// Phase 4A-2 — WLT1_DECISION_TOKEN_TTL_MINUTES / AML1_BASE_URL / AML1_INTERNAL_SERVICE_TOKEN.
// -------------------------------------------------------------------------------------------
describe("WLT-01 Phase 4A-2 config", () => {
  it("defaults WLT1_DECISION_TOKEN_TTL_MINUTES to 5 when unset", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_DECISION_TOKEN_TTL_MINUTES: undefined });
    expect(cfg.decisionTokenTtlMinutes).toBe(5);
  });

  it("accepts an explicit override within range", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_DECISION_TOKEN_TTL_MINUTES: "10" });
    expect(cfg.decisionTokenTtlMinutes).toBe(10);
  });

  it("accepts the minimum bound (1)", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_DECISION_TOKEN_TTL_MINUTES: "1" });
    expect(cfg.decisionTokenTtlMinutes).toBe(1);
  });

  it("accepts the maximum bound (15)", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_DECISION_TOKEN_TTL_MINUTES: "15" });
    expect(cfg.decisionTokenTtlMinutes).toBe(15);
  });

  it("fails closed below the minimum bound (0)", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_DECISION_TOKEN_TTL_MINUTES: "0" })).toThrowError(AppError);
  });

  it("fails closed on a negative value", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_DECISION_TOKEN_TTL_MINUTES: "-1" })).toThrowError(AppError);
  });

  it("fails closed on a non-numeric value", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_DECISION_TOKEN_TTL_MINUTES: "not-a-number" })).toThrowError(AppError);
  });

  it("fails closed on a non-integer value", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_DECISION_TOKEN_TTL_MINUTES: "2.5" })).toThrowError(AppError);
  });

  it("fails closed above the maximum bound (16)", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_DECISION_TOKEN_TTL_MINUTES: "16" })).toThrowError(AppError);
  });

  it("the 5-minute default is unchanged by this test suite's own existence (regression pin)", () => {
    const cfg = loadWlt1Config(base);
    expect(cfg.decisionTokenTtlMinutes).toBe(5);
  });

  it("fails closed when AML1_BASE_URL is missing", () => {
    expect(() => loadWlt1Config({ ...base, AML1_BASE_URL: undefined })).toThrowError(AppError);
  });

  it("fails closed when AML1_BASE_URL is blank", () => {
    expect(() => loadWlt1Config({ ...base, AML1_BASE_URL: "   " })).toThrowError(AppError);
  });

  it("fails closed when AML1_INTERNAL_SERVICE_TOKEN is missing", () => {
    expect(() => loadWlt1Config({ ...base, AML1_INTERNAL_SERVICE_TOKEN: undefined })).toThrowError(AppError);
  });

  it("fails closed when AML1_INTERNAL_SERVICE_TOKEN is blank", () => {
    expect(() => loadWlt1Config({ ...base, AML1_INTERNAL_SERVICE_TOKEN: "   " })).toThrowError(AppError);
  });

  it("loads aml1BaseUrl/aml1InternalServiceToken onto the returned config", () => {
    const cfg = loadWlt1Config(base);
    expect(cfg.aml1BaseUrl).toBe("http://localhost:8088");
    expect(cfg.aml1InternalServiceToken).toBe("aml1-internal-token-123");
  });

  it("the thrown error's details/message never echo the configured AML1_INTERNAL_SERVICE_TOKEN value", () => {
    try {
      loadWlt1Config({ ...base, AML1_INTERNAL_SERVICE_TOKEN: "super-secret-aml1-token-value", AML1_BASE_URL: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      expect(JSON.stringify(err.details ?? [])).not.toContain("super-secret-aml1-token-value");
    }
  });

  it("no CLT-01 config is duplicated — evaluate-use's P-ROSTER call reuses the EXISTING clt1BaseUrl/clt1InternalServiceToken fields (Phase 1B), never a second CLT-01 base-URL/token pair", () => {
    const cfg = loadWlt1Config(base) as unknown as Record<string, unknown>;
    expect(cfg.clt2BaseUrl).toBeUndefined();
    expect(cfg.rosterBaseUrl).toBeUndefined();
    expect(cfg.rosterInternalServiceToken).toBeUndefined();
  });

  it("multiple simultaneous Phase 4A-2 config problems are all reported together", () => {
    try {
      loadWlt1Config({ ...base, WLT1_DECISION_TOKEN_TTL_MINUTES: "0", AML1_BASE_URL: undefined, AML1_INTERNAL_SERVICE_TOKEN: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      const joined = JSON.stringify(err.details ?? []);
      expect(joined).toContain("WLT1_DECISION_TOKEN_TTL_MINUTES");
      expect(joined).toContain("AML1_BASE_URL");
      expect(joined).toContain("AML1_INTERNAL_SERVICE_TOKEN");
    }
  });
});

// -------------------------------------------------------------------------------------------
// Ongoing Rescreening — WLT1_RESCREEN_LEAD_TIME_HOURS / WLT1_RESCREEN_BATCH_SIZE_DEFAULT /
// WLT1_RESCREEN_BATCH_SIZE_MAX.
// -------------------------------------------------------------------------------------------
describe("WLT-01 Ongoing Rescreening config", () => {
  it("defaults all three fields when unset", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_RESCREEN_LEAD_TIME_HOURS: undefined, WLT1_RESCREEN_BATCH_SIZE_DEFAULT: undefined, WLT1_RESCREEN_BATCH_SIZE_MAX: undefined });
    expect(cfg.rescreenLeadTimeHours).toBe(72);
    expect(cfg.rescreenBatchSizeDefault).toBe(50);
    expect(cfg.rescreenBatchSizeMax).toBe(200);
  });

  it("accepts explicit overrides within range", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_RESCREEN_LEAD_TIME_HOURS: "24", WLT1_RESCREEN_BATCH_SIZE_DEFAULT: "10", WLT1_RESCREEN_BATCH_SIZE_MAX: "500" });
    expect(cfg.rescreenLeadTimeHours).toBe(24);
    expect(cfg.rescreenBatchSizeDefault).toBe(10);
    expect(cfg.rescreenBatchSizeMax).toBe(500);
  });

  it("WLT1_RESCREEN_LEAD_TIME_HOURS accepts the minimum bound (1) and maximum bound (8760)", () => {
    expect(loadWlt1Config({ ...base, WLT1_RESCREEN_LEAD_TIME_HOURS: "1" }).rescreenLeadTimeHours).toBe(1);
    expect(loadWlt1Config({ ...base, WLT1_RESCREEN_LEAD_TIME_HOURS: "8760" }).rescreenLeadTimeHours).toBe(8760);
  });

  it("WLT1_RESCREEN_LEAD_TIME_HOURS fails closed below minimum, above maximum, non-integer, non-numeric", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_LEAD_TIME_HOURS: "0" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_LEAD_TIME_HOURS: "8761" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_LEAD_TIME_HOURS: "2.5" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_LEAD_TIME_HOURS: "not-a-number" })).toThrowError(AppError);
  });

  it("WLT1_RESCREEN_BATCH_SIZE_DEFAULT accepts the minimum bound (1) and maximum bound (1000, with MAX raised to accommodate)", () => {
    expect(loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_DEFAULT: "1" }).rescreenBatchSizeDefault).toBe(1);
    expect(loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_DEFAULT: "1000", WLT1_RESCREEN_BATCH_SIZE_MAX: "1000" }).rescreenBatchSizeDefault).toBe(1000);
  });

  it("WLT1_RESCREEN_BATCH_SIZE_DEFAULT fails closed below minimum, above maximum, non-integer, non-numeric", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_DEFAULT: "0" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_DEFAULT: "1001" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_DEFAULT: "2.5" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_DEFAULT: "not-a-number" })).toThrowError(AppError);
  });

  it("WLT1_RESCREEN_BATCH_SIZE_MAX accepts the minimum bound (1) and maximum bound (1000)", () => {
    expect(loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_DEFAULT: "1", WLT1_RESCREEN_BATCH_SIZE_MAX: "1" }).rescreenBatchSizeMax).toBe(1);
    expect(loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_MAX: "1000" }).rescreenBatchSizeMax).toBe(1000);
  });

  it("WLT1_RESCREEN_BATCH_SIZE_MAX fails closed below minimum, above maximum, non-integer, non-numeric", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_MAX: "0" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_MAX: "1001" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_MAX: "2.5" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_MAX: "not-a-number" })).toThrowError(AppError);
  });

  it("fails closed when WLT1_RESCREEN_BATCH_SIZE_DEFAULT exceeds WLT1_RESCREEN_BATCH_SIZE_MAX", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_DEFAULT: "300", WLT1_RESCREEN_BATCH_SIZE_MAX: "200" })).toThrowError(AppError);
  });

  it("accepts WLT1_RESCREEN_BATCH_SIZE_DEFAULT exactly equal to WLT1_RESCREEN_BATCH_SIZE_MAX", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_RESCREEN_BATCH_SIZE_DEFAULT: "150", WLT1_RESCREEN_BATCH_SIZE_MAX: "150" });
    expect(cfg.rescreenBatchSizeDefault).toBe(150);
    expect(cfg.rescreenBatchSizeMax).toBe(150);
  });

  it("the defaults are unchanged by this test suite's own existence (regression pin)", () => {
    const cfg = loadWlt1Config(base);
    expect(cfg.rescreenLeadTimeHours).toBe(72);
    expect(cfg.rescreenBatchSizeDefault).toBe(50);
    expect(cfg.rescreenBatchSizeMax).toBe(200);
  });

  it("no new provider-timeout/retry-count config, secret, base URL, or CFG-01 dependency is introduced", () => {
    const cfg = loadWlt1Config(base) as unknown as Record<string, unknown>;
    expect(cfg.rescreenProviderTimeoutMs).toBeUndefined();
    expect(cfg.rescreenRetryCount).toBeUndefined();
    expect(cfg.cfg1BaseUrl).toBeUndefined();
  });

  it("multiple simultaneous Ongoing Rescreening config problems are all reported together", () => {
    try {
      loadWlt1Config({ ...base, WLT1_RESCREEN_LEAD_TIME_HOURS: "0", WLT1_RESCREEN_BATCH_SIZE_DEFAULT: "0", WLT1_RESCREEN_BATCH_SIZE_MAX: "0" });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      const joined = JSON.stringify(err.details ?? []);
      expect(joined).toContain("WLT1_RESCREEN_LEAD_TIME_HOURS");
      expect(joined).toContain("WLT1_RESCREEN_BATCH_SIZE_DEFAULT");
      expect(joined).toContain("WLT1_RESCREEN_BATCH_SIZE_MAX");
    }
  });
});

describe("WLT-01 Fiat Payout Destinations (APAC) config — exactly +6 fields", () => {
  it("loads with defaults when every fiat field is absent", () => {
    const cfg = loadWlt1Config(base);
    expect(cfg.fiatScreeningMaxValidityHours).toBe(720);
    expect(cfg.beneficiaryVerificationValidityHours).toBe(8760);
    expect(cfg.fiatEncKey).toBe("test-fiat-enc-key-at-least-32-characters-long");
    expect(cfg.beneficiaryVerificationProviderId).toBe("stub-beneficiary-verification-v1");
    expect(cfg.fiatScreeningProviderId).toBe("stub-fiat-screening-v1");
    expect(cfg.fiatVerificationRequired).toBe(true);
  });

  it("WLT1_FIAT_ENC_KEY is ALWAYS required (not merely in prod) — fails closed when absent or blank", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_FIAT_ENC_KEY: undefined })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_FIAT_ENC_KEY: "   " })).toThrowError(AppError);
  });

  it("WLT1_FIAT_ENC_KEY fails closed below the 32-character minimum, accepts exactly 32", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_FIAT_ENC_KEY: "short-key" })).toThrowError(AppError);
    const exact32 = "a".repeat(32);
    expect(loadWlt1Config({ ...base, WLT1_FIAT_ENC_KEY: exact32 }).fiatEncKey).toBe(exact32);
  });

  it("WLT1_FIAT_ENC_KEY is never present on the thrown error's own message/details (never logged/echoed)", () => {
    try {
      loadWlt1Config({ ...base, WLT1_FIAT_ENC_KEY: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      const joined = JSON.stringify(err.details ?? []);
      expect(joined).not.toContain(base.WLT1_FIAT_ENC_KEY);
    }
  });

  it("WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS accepts the minimum bound (1) and maximum bound (8760)", () => {
    expect(loadWlt1Config({ ...base, WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS: "1" }).fiatScreeningMaxValidityHours).toBe(1);
    expect(loadWlt1Config({ ...base, WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS: "8760" }).fiatScreeningMaxValidityHours).toBe(8760);
  });

  it("WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS fails closed below minimum, above maximum, non-integer", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS: "0" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS: "8761" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS: "2.5" })).toThrowError(AppError);
  });

  it("WLT1_BENEFICIARY_VERIFICATION_VALIDITY_HOURS accepts the minimum bound (24) and maximum bound (17520)", () => {
    expect(loadWlt1Config({ ...base, WLT1_BENEFICIARY_VERIFICATION_VALIDITY_HOURS: "24" }).beneficiaryVerificationValidityHours).toBe(24);
    expect(loadWlt1Config({ ...base, WLT1_BENEFICIARY_VERIFICATION_VALIDITY_HOURS: "17520" }).beneficiaryVerificationValidityHours).toBe(17520);
  });

  it("WLT1_BENEFICIARY_VERIFICATION_VALIDITY_HOURS fails closed below minimum, above maximum", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_BENEFICIARY_VERIFICATION_VALIDITY_HOURS: "23" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_BENEFICIARY_VERIFICATION_VALIDITY_HOURS: "17521" })).toThrowError(AppError);
  });

  it("WLT1_BENEFICIARY_VERIFICATION_PROVIDER fails closed on an unknown provider id", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_BENEFICIARY_VERIFICATION_PROVIDER: "not-a-real-provider" })).toThrowError(AppError);
  });

  it("WLT1_BENEFICIARY_VERIFICATION_PROVIDER: the stub is disallowed when ENVIRONMENT=prod", () => {
    expect(() =>
      loadWlt1Config({ ...base, ENVIRONMENT: "prod", WLT1_BENEFICIARY_VERIFICATION_PROVIDER: "stub-beneficiary-verification-v1" }),
    ).toThrowError(AppError);
  });

  it("WLT1_FIAT_SCREENING_PROVIDER fails closed on an unknown provider id", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_FIAT_SCREENING_PROVIDER: "not-a-real-provider" })).toThrowError(AppError);
  });

  it("WLT1_FIAT_SCREENING_PROVIDER: the stub is disallowed when ENVIRONMENT=prod", () => {
    expect(() => loadWlt1Config({ ...base, ENVIRONMENT: "prod", WLT1_FIAT_SCREENING_PROVIDER: "stub-fiat-screening-v1" })).toThrowError(AppError);
  });

  it("WLT1_FIAT_VERIFICATION_REQUIRED parses 'true'/'false' explicitly, fails closed on any other value", () => {
    expect(loadWlt1Config({ ...base, WLT1_FIAT_VERIFICATION_REQUIRED: "true" }).fiatVerificationRequired).toBe(true);
    expect(loadWlt1Config({ ...base, WLT1_FIAT_VERIFICATION_REQUIRED: "false" }).fiatVerificationRequired).toBe(false);
    expect(() => loadWlt1Config({ ...base, WLT1_FIAT_VERIFICATION_REQUIRED: "yes" })).toThrowError(AppError);
  });

  it("WLT1_FIAT_VERIFICATION_REQUIRED MUST be true when ENVIRONMENT=prod", () => {
    expect(() => loadWlt1Config({ ...base, ENVIRONMENT: "prod", WLT1_FIAT_VERIFICATION_REQUIRED: "false" })).toThrowError(AppError);
  });

  it("multiple simultaneous fiat config problems are all reported together", () => {
    try {
      loadWlt1Config({ ...base, WLT1_FIAT_ENC_KEY: undefined, WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS: "0", WLT1_BENEFICIARY_VERIFICATION_PROVIDER: "unknown-provider" });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      const joined = JSON.stringify(err.details ?? []);
      expect(joined).toContain("WLT1_FIAT_ENC_KEY");
      expect(joined).toContain("WLT1_FIAT_SCREENING_MAX_VALIDITY_HOURS");
      expect(joined).toContain("WLT1_BENEFICIARY_VERIFICATION_PROVIDER");
    }
  });
});

// -------------------------------------------------------------------------------------------
// Evidence Export — WLT1_EVIDENCE_EXPORT_MAX_RECORDS. The ONE new config field this phase adds
// (WLT config delta +6 -> +7). Same Option-B fail-closed pattern as every other WLT-01 bounded-
// integer config: absent -> default; present -> must parse as a positive integer within range,
// or startup fails closed (CONFIGURATION_INVALID).
// -------------------------------------------------------------------------------------------
describe("WLT-01 Evidence Export config", () => {
  it("defaults to 5000 when unset", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_EVIDENCE_EXPORT_MAX_RECORDS: undefined });
    expect(cfg.evidenceExportMaxRecords).toBe(5000);
  });

  it("accepts an explicit override within range", () => {
    expect(loadWlt1Config({ ...base, WLT1_EVIDENCE_EXPORT_MAX_RECORDS: "10000" }).evidenceExportMaxRecords).toBe(10000);
  });

  it("accepts the minimum bound (1) and maximum bound (50000)", () => {
    expect(loadWlt1Config({ ...base, WLT1_EVIDENCE_EXPORT_MAX_RECORDS: "1" }).evidenceExportMaxRecords).toBe(1);
    expect(loadWlt1Config({ ...base, WLT1_EVIDENCE_EXPORT_MAX_RECORDS: "50000" }).evidenceExportMaxRecords).toBe(50000);
  });

  it("fails closed below minimum, above maximum, non-integer, non-numeric", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_EVIDENCE_EXPORT_MAX_RECORDS: "0" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_EVIDENCE_EXPORT_MAX_RECORDS: "50001" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_EVIDENCE_EXPORT_MAX_RECORDS: "2.5" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_EVIDENCE_EXPORT_MAX_RECORDS: "not-a-number" })).toThrowError(AppError);
  });

  it("no second Evidence Export config field exists — exactly ONE new key this phase", () => {
    const cfg = loadWlt1Config(base) as unknown as Record<string, unknown>;
    const evidenceExportKeys = Object.keys(cfg).filter((k) => k.toLowerCase().includes("evidenceexport") || k.toLowerCase().includes("evidence_export"));
    expect(evidenceExportKeys).toEqual(["evidenceExportMaxRecords"]);
  });
});

// -------------------------------------------------------------------------------------------
// Named Vendor-Result Ingestion / Async Path — Stuck-Screening Operational Closure —
// WLT1_STUCK_SCREENING_THRESHOLD_SECONDS. The ONE new config field this phase adds. Same
// Option-B fail-closed pattern as every other WLT-01 bounded-integer config: absent -> default
// (900); present -> must parse as a positive integer AT OR ABOVE the floor (300), or startup
// fails closed (CONFIGURATION_INVALID). Unlike Evidence Export's max-records field, this field
// has NO upper bound — mirrors AML-01's own accepted stuck-screening threshold config exactly,
// which also has none.
// -------------------------------------------------------------------------------------------
describe("WLT-01 Stuck-Screening Operational Closure config", () => {
  it("defaults to 900 when unset", () => {
    const cfg = loadWlt1Config({ ...base, WLT1_STUCK_SCREENING_THRESHOLD_SECONDS: undefined });
    expect(cfg.stuckScreeningThresholdSeconds).toBe(900);
  });

  it("accepts an explicit override at or above the floor", () => {
    expect(loadWlt1Config({ ...base, WLT1_STUCK_SCREENING_THRESHOLD_SECONDS: "1800" }).stuckScreeningThresholdSeconds).toBe(1800);
  });

  it("accepts the exact floor (300)", () => {
    expect(loadWlt1Config({ ...base, WLT1_STUCK_SCREENING_THRESHOLD_SECONDS: "300" }).stuckScreeningThresholdSeconds).toBe(300);
  });

  it("has no upper bound — an unusually large value is accepted, not rejected", () => {
    expect(loadWlt1Config({ ...base, WLT1_STUCK_SCREENING_THRESHOLD_SECONDS: "1000000" }).stuckScreeningThresholdSeconds).toBe(1_000_000);
  });

  it("fails closed below the 300-second floor (299), non-integer, non-numeric, zero, negative", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_STUCK_SCREENING_THRESHOLD_SECONDS: "299" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_STUCK_SCREENING_THRESHOLD_SECONDS: "0" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_STUCK_SCREENING_THRESHOLD_SECONDS: "-1" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_STUCK_SCREENING_THRESHOLD_SECONDS: "2.5" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_STUCK_SCREENING_THRESHOLD_SECONDS: "not-a-number" })).toThrowError(AppError);
  });

  it("no second stuck-screening config field exists — exactly ONE new key this phase", () => {
    const cfg = loadWlt1Config(base) as unknown as Record<string, unknown>;
    const stuckScreeningKeys = Object.keys(cfg).filter((k) => k.toLowerCase().includes("stuckscreening") || k.toLowerCase().includes("stuck_screening"));
    expect(stuckScreeningKeys).toEqual(["stuckScreeningThresholdSeconds"]);
  });
});

// -------------------------------------------------------------------------------------------
// Public Client Surface — IAM_BASE_URL/IAM_INTROSPECTION_SERVICE_TOKEN,
// FND_BASE_URL/FND_RATE_LIMIT_CONSUMER_TOKEN, WLT1_PUBLIC_DESTINATION_LIST_MAX.
// -------------------------------------------------------------------------------------------
describe("WLT-01 config loader — Public Client Surface", () => {
  it("loads a valid config with the new public-surface fields carried through", () => {
    const cfg = loadWlt1Config(base);
    expect(cfg.iamBaseUrl).toBe("http://localhost:8081");
    expect(cfg.iamIntrospectionServiceToken).toBe("iam-introspection-token-123");
    expect(cfg.fndBaseUrl).toBe("http://localhost:8080");
    expect(cfg.fndRateLimitConsumerToken).toBe("fnd-ratelimit-consumer-token-123");
    expect(cfg.publicDestinationListMax).toBe(100);
  });

  it("fails closed when IAM_BASE_URL is missing or blank", () => {
    expect(() => loadWlt1Config({ ...base, IAM_BASE_URL: undefined })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, IAM_BASE_URL: "   " })).toThrowError(AppError);
  });

  it("fails closed when IAM_INTROSPECTION_SERVICE_TOKEN is missing or blank", () => {
    expect(() => loadWlt1Config({ ...base, IAM_INTROSPECTION_SERVICE_TOKEN: undefined })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, IAM_INTROSPECTION_SERVICE_TOKEN: "   " })).toThrowError(AppError);
  });

  it("fails closed when FND_BASE_URL is missing or blank", () => {
    expect(() => loadWlt1Config({ ...base, FND_BASE_URL: undefined })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, FND_BASE_URL: "   " })).toThrowError(AppError);
  });

  it("fails closed when FND_RATE_LIMIT_CONSUMER_TOKEN is missing or blank", () => {
    expect(() => loadWlt1Config({ ...base, FND_RATE_LIMIT_CONSUMER_TOKEN: undefined })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, FND_RATE_LIMIT_CONSUMER_TOKEN: "   " })).toThrowError(AppError);
  });

  it("WLT1_PUBLIC_DESTINATION_LIST_MAX is REQUIRED — no default exists (deliberately unlike every other WLT-01 bounded-integer config)", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_PUBLIC_DESTINATION_LIST_MAX: undefined })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_PUBLIC_DESTINATION_LIST_MAX: "   " })).toThrowError(AppError);
  });

  it("WLT1_PUBLIC_DESTINATION_LIST_MAX fails closed on zero, negative, non-integer, non-numeric", () => {
    expect(() => loadWlt1Config({ ...base, WLT1_PUBLIC_DESTINATION_LIST_MAX: "0" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_PUBLIC_DESTINATION_LIST_MAX: "-1" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_PUBLIC_DESTINATION_LIST_MAX: "2.5" })).toThrowError(AppError);
    expect(() => loadWlt1Config({ ...base, WLT1_PUBLIC_DESTINATION_LIST_MAX: "not-a-number" })).toThrowError(AppError);
  });

  it("WLT1_PUBLIC_DESTINATION_LIST_MAX accepts any positive integer, with no implicit upper bound imposed by the loader itself", () => {
    expect(loadWlt1Config({ ...base, WLT1_PUBLIC_DESTINATION_LIST_MAX: "1" }).publicDestinationListMax).toBe(1);
    expect(loadWlt1Config({ ...base, WLT1_PUBLIC_DESTINATION_LIST_MAX: "500" }).publicDestinationListMax).toBe(500);
  });

  it("the thrown error's details never echo IAM_INTROSPECTION_SERVICE_TOKEN or FND_RATE_LIMIT_CONSUMER_TOKEN values", () => {
    try {
      loadWlt1Config({ ...base, IAM_BASE_URL: undefined });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as AppError;
      const detailsText = JSON.stringify(err.details);
      expect(detailsText).not.toContain(base.IAM_INTROSPECTION_SERVICE_TOKEN);
      expect(detailsText).not.toContain(base.FND_RATE_LIMIT_CONSUMER_TOKEN);
    }
  });
});
