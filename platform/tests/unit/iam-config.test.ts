/**
 * IAM-01's own config loader (services/iam/src/config.ts). Covers FND-FIND-010's two explicit
 * DB-pool capacity inputs (IAM_DB_POOL_MAX / IAM_DB_CONNECTION_TIMEOUT_MS) — required when
 * ENVIRONMENT=prod, optional (and left genuinely absent, never substituted) elsewhere — plus
 * the existing IAM_INTROSPECTION_SERVICE_TOKEN/bootstrap behaviour already covered generically
 * by the shared @aix/foundation loadConfig suite (tests/unit/config.test.ts). No prior
 * dedicated test file existed for this loader before this turn.
 */
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { AppError } from "@aix/foundation";
import { loadIamConfig } from "../../services/iam/src/config.js";
import { deriveMfaEncryptionKey } from "../../services/iam/src/lib/mfa-secret-crypto.js";

const base = {
  ENVIRONMENT: "dev",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  PORT: "8080",
  INTERNAL_SERVICE_TOKEN: "unused-shared-slot",
  IAM_INTERNAL_SERVICE_TOKEN: "iam-internal-token-123",
  IAM_INTROSPECTION_SERVICE_TOKEN: "iam-introspection-token-456",
};

// T-KEY-001 — SYNTHETIC TEST-ONLY key fixtures. Deterministic bytes (never random, never a real
// secret): 32 bytes of 0x42, base64url-encoded = a well-formed 43-character key.
const SYNTHETIC_TEST_ONLY_KEY = Buffer.alloc(32, 0x42).toString("base64url");
const MFA_KEY_DEV_PLACEHOLDER = "CHANGE_ME_DEV_ONLY_MFA_KEY_PLACEHOLDER_NOT_FOR_PROD";
const VALID_MFA = { IAM_MFA_SECRET_ENC_KEY: SYNTHETIC_TEST_ONLY_KEY };

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
      ...VALID_MFA,
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
      loadIamConfig({ ...base, ...VALID_MFA, ENVIRONMENT: "prod", IAM_DB_CONNECTION_TIMEOUT_MS: "5000" }),
    );
    expect(err.details.some((d) => String(d.issue).includes("IAM_DB_POOL_MAX"))).toBe(true);
  });

  it("prod: IAM_DB_CONNECTION_TIMEOUT_MS missing — fails closed", () => {
    const err = throwsConfigInvalid(() => loadIamConfig({ ...base, ...VALID_MFA, ENVIRONMENT: "prod", IAM_DB_POOL_MAX: "20" }));
    expect(err.details.some((d) => String(d.issue).includes("IAM_DB_CONNECTION_TIMEOUT_MS"))).toBe(true);
  });

  it("prod: both missing — fails closed and reports BOTH problems at once", () => {
    const err = throwsConfigInvalid(() => loadIamConfig({ ...base, ...VALID_MFA, ENVIRONMENT: "prod" }));
    const issues = err.details.map((d) => String(d.issue));
    expect(issues.some((i) => i.includes("IAM_DB_POOL_MAX"))).toBe(true);
    expect(issues.some((i) => i.includes("IAM_DB_CONNECTION_TIMEOUT_MS"))).toBe(true);
  });

  it("prod: empty string is treated as missing — fails closed (no distinct 'empty but valid' state)", () => {
    throwsConfigInvalid(() =>
      loadIamConfig({ ...base, ...VALID_MFA, ENVIRONMENT: "prod", IAM_DB_POOL_MAX: "   ", IAM_DB_CONNECTION_TIMEOUT_MS: "5000" }),
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
      loadIamConfig({ ...base, ...VALID_MFA, ENVIRONMENT: "prod", IAM_DB_POOL_MAX: value, IAM_DB_CONNECTION_TIMEOUT_MS: "5000" }),
    );
  });

  it.each(["abc", "10.5", "0", "-1", "10abc"])(
    "rejects IAM_DB_CONNECTION_TIMEOUT_MS=%j in prod as CONFIGURATION_INVALID",
    (value) => {
      throwsConfigInvalid(() =>
        loadIamConfig({ ...base, ...VALID_MFA, ENVIRONMENT: "prod", IAM_DB_POOL_MAX: "20", IAM_DB_CONNECTION_TIMEOUT_MS: value }),
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

// -------------------------------------------------------------------------------------------
// T-KEY-001 / D-KEY-01 (CAN-KEY-01, B2-01) — IAM_MFA_SECRET_ENC_KEY startup guard.
//
// Protected environments (uat, demo, staging, prod) REQUIRE an approved-format key and reject the
// public development placeholder; only dev/qa (synthetic data) keep the development fallback.
// Every fixture below is a clearly labelled SYNTHETIC TEST-ONLY value — no real secret is used.
// These tests validate FORMAT and decoded LENGTH only; they do not (and cannot) prove entropy.
// -------------------------------------------------------------------------------------------
const PROTECTED_ENVIRONMENTS = ["uat", "demo", "staging", "prod"] as const;
const DEV_ENVIRONMENTS = ["dev", "qa"] as const;

/** prod additionally requires the FND-FIND-010 pool inputs; supply them so only the MFA key varies. */
function envFor(environment: string, extra: Record<string, string | undefined> = {}) {
  return {
    ...base,
    ENVIRONMENT: environment,
    ...(environment === "prod" ? { IAM_DB_POOL_MAX: "20", IAM_DB_CONNECTION_TIMEOUT_MS: "5000" } : {}),
    ...extra,
  };
}

function mfaKeyIssues(err: AppError): string[] {
  return err.details.map((d) => String(d.issue)).filter((i) => i.includes("IAM_MFA_SECRET_ENC_KEY"));
}

/** The error must never echo the submitted value, a prefix of it, its digest, or a derived key. */
function expectNoKeyLeak(err: AppError, submitted: string): void {
  const text = JSON.stringify({ message: err.message, details: err.details });
  const trimmed = submitted.trim();
  if (trimmed.length >= 8) {
    expect(text).not.toContain(trimmed);
    expect(text).not.toContain(trimmed.slice(0, 6));
    expect(text).not.toContain(trimmed.slice(-6));
  }
  const digest = createHash("sha256").update(trimmed, "utf8").digest();
  expect(text).not.toContain(digest.toString("hex"));
  expect(text).not.toContain(digest.toString("base64"));
  expect(text).not.toContain(MFA_KEY_DEV_PLACEHOLDER);
}

const B64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// Same 32 decoded bytes as the valid key, but a different final character (non-zero trailing bits).
const NON_CANONICAL_SPELLING =
  SYNTHETIC_TEST_ONLY_KEY.slice(0, -1) +
  B64URL_ALPHABET[(B64URL_ALPHABET.indexOf(SYNTHETIC_TEST_ONLY_KEY.at(-1) as string) + 1) % 64];

describe("T-KEY-001 — protected environments (uat, demo, staging, prod) reject unsafe MFA keys", () => {
  it("fixture sanity: the valid synthetic key is 43 base64url characters decoding to exactly 32 bytes", () => {
    expect(SYNTHETIC_TEST_ONLY_KEY).toHaveLength(43);
    expect(Buffer.from(SYNTHETIC_TEST_ONLY_KEY, "base64url")).toHaveLength(32);
    // The non-canonical spelling really does decode to 32 bytes, so rejecting it proves the
    // canonical round-trip check (not merely the length check) is what applies.
    expect(NON_CANONICAL_SPELLING).not.toBe(SYNTHETIC_TEST_ONLY_KEY);
    expect(Buffer.from(NON_CANONICAL_SPELLING, "base64url")).toHaveLength(32);
  });

  it.each(PROTECTED_ENVIRONMENTS)("%s: key missing — rejected as CONFIGURATION_INVALID naming only the variable", (environment) => {
    const err = throwsConfigInvalid(() => loadIamConfig(envFor(environment)));
    const issues = mfaKeyIssues(err);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("is required");
  });

  it.each(PROTECTED_ENVIRONMENTS)("%s: empty key — rejected", (environment) => {
    const err = throwsConfigInvalid(() => loadIamConfig(envFor(environment, { IAM_MFA_SECRET_ENC_KEY: "" })));
    expect(mfaKeyIssues(err)).toHaveLength(1);
  });

  it.each(PROTECTED_ENVIRONMENTS)("%s: whitespace-only key — rejected", (environment) => {
    const err = throwsConfigInvalid(() => loadIamConfig(envFor(environment, { IAM_MFA_SECRET_ENC_KEY: "   \t " })));
    expect(mfaKeyIssues(err)).toHaveLength(1);
  });

  it("staging is protected exactly like prod, even though staging does not require the prod-only pool inputs", () => {
    // No IAM_DB_POOL_MAX / timeout supplied: staging is not 'prod' for FND-FIND-010, but the MFA
    // key guard follows the canonical environment (staging -> PRODUCTION), not the literal string.
    const err = throwsConfigInvalid(() => loadIamConfig({ ...base, ENVIRONMENT: "staging" }));
    expect(mfaKeyIssues(err)).toHaveLength(1);
    expect(err.details.some((d) => String(d.issue).includes("IAM_DB_POOL_MAX"))).toBe(false);
  });

  it.each(PROTECTED_ENVIRONMENTS)("%s: the public development placeholder — rejected, even when padded with whitespace", (environment) => {
    for (const submitted of [MFA_KEY_DEV_PLACEHOLDER, `  ${MFA_KEY_DEV_PLACEHOLDER}  `]) {
      const err = throwsConfigInvalid(() => loadIamConfig(envFor(environment, { IAM_MFA_SECRET_ENC_KEY: submitted })));
      const issues = mfaKeyIssues(err);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain("development placeholder");
      expectNoKeyLeak(err, submitted);
    }
  });

  it.each(PROTECTED_ENVIRONMENTS)("%s: short key — rejected without echoing it", (environment) => {
    for (const submitted of ["short-key-123", "a", Buffer.alloc(31, 0x42).toString("base64url")]) {
      const err = throwsConfigInvalid(() => loadIamConfig(envFor(environment, { IAM_MFA_SECRET_ENC_KEY: submitted })));
      expect(mfaKeyIssues(err)).toHaveLength(1);
      expectNoKeyLeak(err, submitted);
    }
  });

  it.each(PROTECTED_ENVIRONMENTS)("%s: malformed base64url — rejected", (environment) => {
    const std = Buffer.alloc(32, 0xfb).toString("base64"); // standard base64: contains '+', '/' and '=' padding
    expect(std).toMatch(/[+/]/);
    const malformed = [
      "*".repeat(43), // right length, characters outside the base64url alphabet
      `${SYNTHETIC_TEST_ONLY_KEY.slice(0, 42)}*`, // one bad character
      std, // standard (not URL-safe) base64
      `${SYNTHETIC_TEST_ONLY_KEY}=`, // padded base64url
      `${SYNTHETIC_TEST_ONLY_KEY.slice(0, 20)} ${SYNTHETIC_TEST_ONLY_KEY.slice(21)}`, // embedded whitespace
    ];
    for (const submitted of malformed) {
      const err = throwsConfigInvalid(() => loadIamConfig(envFor(environment, { IAM_MFA_SECRET_ENC_KEY: submitted })));
      expect(mfaKeyIssues(err)).toHaveLength(1);
      expectNoKeyLeak(err, submitted);
    }
  });

  it.each(PROTECTED_ENVIRONMENTS)("%s: wrong decoded length or non-canonical spelling — rejected", (environment) => {
    const wrong = [
      Buffer.alloc(33, 0x42).toString("base64url"), // 33 bytes (44 chars)
      Buffer.alloc(64, 0x42).toString("base64url"), // 64 bytes
      Buffer.alloc(16, 0x42).toString("base64url"), // 16 bytes
      NON_CANONICAL_SPELLING, // 43 chars, decodes to 32 bytes, but not the canonical encoding
    ];
    for (const submitted of wrong) {
      const err = throwsConfigInvalid(() => loadIamConfig(envFor(environment, { IAM_MFA_SECRET_ENC_KEY: submitted })));
      expect(mfaKeyIssues(err)).toHaveLength(1);
      expectNoKeyLeak(err, submitted);
    }
  });

  it.each(PROTECTED_ENVIRONMENTS)("%s: a well-formed synthetic key — accepted", (environment) => {
    const cfg = loadIamConfig(envFor(environment, VALID_MFA));
    expect(cfg.environment).toBe(environment);
    expect(cfg.mfaSecretEncryptionKey).toBe(SYNTHETIC_TEST_ONLY_KEY);
  });

  it("reports the MFA key problem together with other configuration problems (no validation is masked)", () => {
    const err = throwsConfigInvalid(() =>
      loadIamConfig({ ...envFor("prod"), IAM_INTROSPECTION_SERVICE_TOKEN: undefined, IAM_DB_POOL_MAX: undefined }),
    );
    const issues = err.details.map((d) => String(d.issue));
    expect(issues.some((i) => i.includes("IAM_MFA_SECRET_ENC_KEY"))).toBe(true);
    expect(issues.some((i) => i.includes("IAM_INTROSPECTION_SERVICE_TOKEN"))).toBe(true);
    expect(issues.some((i) => i.includes("IAM_DB_POOL_MAX"))).toBe(true);
  });

  it("existing validation still applies alongside a valid key (introspection token, bootstrap)", () => {
    const missingIntrospection = throwsConfigInvalid(() =>
      loadIamConfig(envFor("staging", { ...VALID_MFA, IAM_INTROSPECTION_SERVICE_TOKEN: undefined })),
    );
    expect(missingIntrospection.details.some((d) => String(d.issue).includes("IAM_INTROSPECTION_SERVICE_TOKEN"))).toBe(true);
    expect(mfaKeyIssues(missingIntrospection)).toHaveLength(0);

    const sameToken = throwsConfigInvalid(() =>
      loadIamConfig(envFor("uat", { ...VALID_MFA, IAM_INTROSPECTION_SERVICE_TOKEN: base.IAM_INTERNAL_SERVICE_TOKEN })),
    );
    expect(sameToken.details.some((d) => String(d.issue).includes("must differ"))).toBe(true);

    const bootstrap = throwsConfigInvalid(() => loadIamConfig(envFor("demo", { ...VALID_MFA, IAM_BOOTSTRAP_ENABLED: "true" })));
    expect(bootstrap.details.some((d) => String(d.issue).includes("IAM_BOOTSTRAP_ADMIN_IDENTIFIER"))).toBe(true);
  });
});

describe("T-KEY-001 — configured key is preserved exactly (cryptographic derivation unchanged)", () => {
  it.each(PROTECTED_ENVIRONMENTS)("%s: the loader returns the configured string verbatim (trimmed, as before)", (environment) => {
    const cfg = loadIamConfig(envFor(environment, VALID_MFA));
    expect(cfg.mfaSecretEncryptionKey).toBe(SYNTHETIC_TEST_ONLY_KEY);
    const padded = loadIamConfig(envFor(environment, { IAM_MFA_SECRET_ENC_KEY: `  ${SYNTHETIC_TEST_ONLY_KEY}\n` }));
    expect(padded.mfaSecretEncryptionKey).toBe(SYNTHETIC_TEST_ONLY_KEY);
  });

  it("the unchanged derivation still maps the configured string to SHA-256 of that exact string", () => {
    const cfg = loadIamConfig(envFor("prod", VALID_MFA));
    const expected = createHash("sha256").update(SYNTHETIC_TEST_ONLY_KEY, "utf8").digest();
    expect(deriveMfaEncryptionKey(cfg.mfaSecretEncryptionKey).equals(expected)).toBe(true);
    // Not the decoded bytes: the string — not its base64url decoding — is what is hashed.
    expect(deriveMfaEncryptionKey(cfg.mfaSecretEncryptionKey).equals(Buffer.from(SYNTHETIC_TEST_ONLY_KEY, "base64url"))).toBe(false);
  });
});

describe("T-KEY-001 — dev and qa keep the development fallback (synthetic-data compatibility)", () => {
  it.each(DEV_ENVIRONMENTS)("%s: key absent — existing development fallback preserved", (environment) => {
    const cfg = loadIamConfig(envFor(environment));
    expect(cfg.environment).toBe(environment);
    expect(cfg.mfaSecretEncryptionKey).toBe(MFA_KEY_DEV_PLACEHOLDER);
  });

  it.each(DEV_ENVIRONMENTS)("%s: empty or whitespace-only key — existing fallback preserved", (environment) => {
    expect(loadIamConfig(envFor(environment, { IAM_MFA_SECRET_ENC_KEY: "" })).mfaSecretEncryptionKey).toBe(MFA_KEY_DEV_PLACEHOLDER);
    expect(loadIamConfig(envFor(environment, { IAM_MFA_SECRET_ENC_KEY: "  " })).mfaSecretEncryptionKey).toBe(MFA_KEY_DEV_PLACEHOLDER);
  });

  it.each(DEV_ENVIRONMENTS)("%s: an explicit valid key is accepted", (environment) => {
    expect(loadIamConfig(envFor(environment, VALID_MFA)).mfaSecretEncryptionKey).toBe(SYNTHETIC_TEST_ONLY_KEY);
  });

  it.each(DEV_ENVIRONMENTS)("%s: an explicit legacy synthetic passphrase is still accepted unchanged (no new format rule applies here)", (environment) => {
    const legacy = "test-mfa-secret-enc-key-not-for-prod";
    expect(loadIamConfig(envFor(environment, { IAM_MFA_SECRET_ENC_KEY: legacy })).mfaSecretEncryptionKey).toBe(legacy);
  });

  it("the development fallback exception does not extend to any protected environment", () => {
    for (const environment of PROTECTED_ENVIRONMENTS) {
      throwsConfigInvalid(() => loadIamConfig(envFor(environment)));
    }
  });
});

describe("T-KEY-001 — unknown environments remain fail-closed", () => {
  it.each(["production", "STAGING", "Prod", "test", "development", ""])("ENVIRONMENT=%j is rejected and never reaches the development fallback", (environment) => {
    const err = throwsConfigInvalid(() => loadIamConfig({ ...base, ENVIRONMENT: environment }));
    expect(err.details.some((d) => String(d.issue).includes("ENVIRONMENT"))).toBe(true);
  });
});
