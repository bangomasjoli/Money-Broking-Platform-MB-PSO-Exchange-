/**
 * Opaque bearer token hashing (decision #2) + MFA secret envelope encryption + rate-limit
 * scope hashing — no DB required. Proves the platform NEVER needs to store a raw
 * token/secret to validate it later (hash-only, deterministic, one-way).
 */
import { describe, expect, it } from "vitest";
import { generateOpaqueToken, sha256Hex } from "../../services/iam/src/lib/session.js";
import { lockoutScopeHash } from "../../services/iam/src/lib/rate-limit.js";
import { decryptMfaSecret, deriveMfaEncryptionKey, encryptMfaSecret } from "../../services/iam/src/lib/mfa-secret-crypto.js";

describe("IAM-01 opaque token hashing (decision #2)", () => {
  it("generateOpaqueToken produces distinct high-entropy tokens", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("sha256Hex is deterministic and never equals its input (never 'stores' the raw value)", () => {
    const token = generateOpaqueToken();
    const hashed1 = sha256Hex(token);
    const hashed2 = sha256Hex(token);
    expect(hashed1).toBe(hashed2);
    expect(hashed1).not.toBe(token);
    expect(/^[0-9a-f]{64}$/.test(hashed1)).toBe(true);
  });

  it("different tokens hash to different digests", () => {
    const a = sha256Hex(generateOpaqueToken());
    const b = sha256Hex(generateOpaqueToken());
    expect(a).not.toBe(b);
  });
});

describe("IAM-01 rate-limit scope hashing", () => {
  it("lockoutScopeHash is deterministic for the same parts", () => {
    expect(lockoutScopeHash("login", "abc")).toBe(lockoutScopeHash("login", "abc"));
  });

  it("lockoutScopeHash differs across actions/identifiers (no accidental cross-scope collision)", () => {
    const loginScope = lockoutScopeHash("login", "user-a");
    const mfaScope = lockoutScopeHash("mfa", "user-a");
    const otherUserScope = lockoutScopeHash("login", "user-b");
    expect(loginScope).not.toBe(mfaScope);
    expect(loginScope).not.toBe(otherUserScope);
  });
});

describe("IAM-01 MFA secret envelope encryption (placeholder-KMS, decision-adjacent)", () => {
  it("round-trips a TOTP secret and never stores it in plaintext", () => {
    const key = deriveMfaEncryptionKey("test-passphrase-not-for-prod");
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptMfaSecret(secret, key);
    expect(encrypted).not.toContain(secret);
    expect(decryptMfaSecret(encrypted, key)).toBe(secret);
  });

  it("decryption fails (throws) under a different key — authenticated encryption, not silently wrong", () => {
    const key1 = deriveMfaEncryptionKey("passphrase-one");
    const key2 = deriveMfaEncryptionKey("passphrase-two");
    const encrypted = encryptMfaSecret("SECRETVALUE", key1);
    expect(() => decryptMfaSecret(encrypted, key2)).toThrow();
  });
});
