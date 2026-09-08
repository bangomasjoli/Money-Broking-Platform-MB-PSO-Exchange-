/**
 * RFC 6238 TOTP implementation — no DB required.
 * Vector-tests against the well-known RFC 6238 Appendix B test secret/values so the HMAC-
 * SHA1/HOTP wiring is verified against a spec, not just self-consistency.
 */
import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecretBase32, totpAt, verifyTotp } from "../../services/iam/src/lib/totp.js";

// RFC 6238 Appendix B uses the ASCII secret "12345678901234567890" for the SHA1 test vectors.
const RFC_SECRET_ASCII = "12345678901234567890";
const RFC_SECRET_BASE32 = base32Encode(Buffer.from(RFC_SECRET_ASCII, "ascii"));

describe("IAM-01 TOTP (RFC 6238)", () => {
  it("base32 encode/decode roundtrips arbitrary bytes", () => {
    const original = Buffer.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255, 17, 42]);
    const encoded = base32Encode(original);
    expect(/^[A-Z2-7]+$/.test(encoded)).toBe(true);
    expect(base32Decode(encoded).equals(original)).toBe(true);
  });

  it("matches the RFC 6238 Appendix B test vector at T=59s (counter=1) -> 94287082", () => {
    const code = totpAt(RFC_SECRET_BASE32, 59_000, { digits: 8, periodSeconds: 30 });
    expect(code).toBe("94287082");
  });

  it("matches the RFC 6238 Appendix B test vector at T=1111111109s -> 07081804", () => {
    const code = totpAt(RFC_SECRET_BASE32, 1_111_111_109_000, { digits: 8, periodSeconds: 30 });
    expect(code).toBe("07081804");
  });

  it("matches the RFC 6238 Appendix B test vector at T=1111111111s -> 14050471", () => {
    const code = totpAt(RFC_SECRET_BASE32, 1_111_111_111_000, { digits: 8, periodSeconds: 30 });
    expect(code).toBe("14050471");
  });

  it("generateTotpSecretBase32 produces a usable secret whose own code verifies", () => {
    const secret = generateTotpSecretBase32();
    const now = Date.now();
    const code = totpAt(secret, now, { digits: 6, periodSeconds: 30 });
    expect(verifyTotp(secret, code, { atMs: now })).toBe(true);
  });

  it("verifyTotp rejects a wrong code", () => {
    const secret = generateTotpSecretBase32();
    expect(verifyTotp(secret, "000000", { atMs: Date.now() })).toBe(false);
  });

  it("verifyTotp accepts a code from one step back within the drift window, rejects two steps back", () => {
    const secret = generateTotpSecretBase32();
    const now = Date.now();
    const oneStepBack = totpAt(secret, now - 30_000, { digits: 6, periodSeconds: 30 });
    const twoStepsBack = totpAt(secret, now - 60_000, { digits: 6, periodSeconds: 30 });
    expect(verifyTotp(secret, oneStepBack, { atMs: now, windowSteps: 1 })).toBe(true);
    expect(verifyTotp(secret, twoStepsBack, { atMs: now, windowSteps: 1 })).toBe(false);
  });

  it("verifyTotp rejects malformed input (non-numeric, wrong length) without throwing", () => {
    const secret = generateTotpSecretBase32();
    expect(verifyTotp(secret, "abcdef", { atMs: Date.now() })).toBe(false);
    expect(verifyTotp(secret, "123", { atMs: Date.now() })).toBe(false);
    expect(verifyTotp(secret, "", { atMs: Date.now() })).toBe(false);
  });
});
