/**
 * IMP-02 measurement harness (Turn M-A) — `perf/src/secret-scan.ts`. Mirrors IMP-02 Turn C's
 * private-key-marker discipline and FND-FIND-010's DATABASE_URL-never-logged discipline, applied
 * to every measurement evidence write.
 */
import { describe, expect, it } from "vitest";
import { assertNoSecrets, scanForSecrets, SecretScanFailedError } from "../../perf/src/secret-scan.js";

describe("scanForSecrets — private key PEM markers", () => {
  it("flags an RSA private key marker", () => {
    const result = scanForSecrets({ text: "before\n-----BEGIN RSA PRIVATE KEY-----\nMIIB...\nafter" });
    expect(result.clean).toBe(false);
    expect(result.reasons).toContain("PRIVATE_KEY_PEM_MARKER");
  });

  it("flags a generic PRIVATE KEY marker", () => {
    const result = scanForSecrets({ text: "-----BEGIN PRIVATE KEY-----" });
    expect(result.clean).toBe(false);
    expect(result.reasons).toContain("PRIVATE_KEY_PEM_MARKER");
  });

  it("does not flag ordinary text mentioning 'private key' in prose", () => {
    const result = scanForSecrets({ text: "This evidence file never contains a private key." });
    expect(result.clean).toBe(true);
  });
});

describe("scanForSecrets — credential-embedded URLs (DATABASE_URL shape)", () => {
  it("flags a postgres URL with an inline user:password", () => {
    const result = scanForSecrets({ text: "postgres://aix_user:s3cr3t@db.internal:5432/aix" });
    expect(result.clean).toBe(false);
    expect(result.reasons).toContain("CREDENTIAL_URL_PATTERN");
  });

  it("flags an https URL with inline credentials regardless of scheme", () => {
    const result = scanForSecrets({ text: "https://user:pass@example.internal/path" });
    expect(result.clean).toBe(false);
    expect(result.reasons).toContain("CREDENTIAL_URL_PATTERN");
  });

  it("does not flag a plain URL with no embedded credentials", () => {
    const result = scanForSecrets({ text: "postgres://db.internal:5432/aix" });
    expect(result.clean).toBe(true);
  });
});

describe("scanForSecrets — Authorization bearer values", () => {
  it("flags a Bearer token of realistic length", () => {
    const result = scanForSecrets({ text: "Authorization: Bearer aGVsbG8td29ybGQtdGhpcy1pcy1hLXRlc3QtdG9rZW4" });
    expect(result.clean).toBe(false);
    expect(result.reasons).toContain("AUTHORIZATION_BEARER_PATTERN");
  });

  it("does not flag the bare word 'Bearer' with no token following it", () => {
    const result = scanForSecrets({ text: "the caller presents a Bearer token in Authorization" });
    expect(result.clean).toBe(true);
  });
});

describe("scanForSecrets — known secret values", () => {
  it("flags a known live secret value found verbatim in the text", () => {
    const result = scanForSecrets({ text: "some evidence containing THE_LIVE_TOKEN_VALUE embedded", knownSecrets: ["THE_LIVE_TOKEN_VALUE"] });
    expect(result.clean).toBe(false);
    expect(result.reasons).toContain("KNOWN_SECRET_VALUE_MATCH");
  });

  it("ignores empty/undefined entries in knownSecrets rather than treating them as a wildcard match", () => {
    const result = scanForSecrets({ text: "perfectly ordinary evidence text", knownSecrets: ["", undefined, "   " ] });
    // "   " is non-empty per this module's filter (length > 0) but would only match if the text
    // literally contained three spaces in sequence, which it does via "evidence text" — so use
    // text without that substring to keep this test meaningful.
    expect(result.reasons).not.toContain("KNOWN_SECRET_VALUE_MATCH");
  });

  it("clean text with no known secrets supplied passes", () => {
    const result = scanForSecrets({ text: "perfectly ordinary evidence text" });
    expect(result.clean).toBe(true);
  });
});

describe("assertNoSecrets / SecretScanFailedError — never echoes the matched value", () => {
  it("throws SecretScanFailedError whose message names only category labels, never the secret", () => {
    // Deliberately NOT a Stripe-key-shaped ("sk_live_...") or other recognizable
    // provider-key-shaped string — this repository's push protection correctly treats that
    // shape as a plausible real secret regardless of context, so the test fixture here uses an
    // arbitrary internal-service-token-shaped value instead (this platform's own known-secret
    // convention, per services/wlt1/src/lib/iam-client.ts's token shape) to exercise the same
    // KNOWN_SECRET_VALUE_MATCH code path without resembling any real provider's key format.
    const secretValue = "aix-internal-known-secret-fixture-0123456789abcdef";
    let thrown: unknown;
    try {
      assertNoSecrets({ text: `leaked: ${secretValue}`, knownSecrets: [secretValue] });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(SecretScanFailedError);
    const message = (thrown as Error).message;
    expect(message).toBe("secret scan failed (KNOWN_SECRET_VALUE_MATCH)");
    expect(message).not.toContain(secretValue);
  });

  it("does not throw for clean text", () => {
    expect(() => assertNoSecrets({ text: "nothing sensitive here" })).not.toThrow();
  });
});
