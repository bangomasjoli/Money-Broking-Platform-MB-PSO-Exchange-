/**
 * Argon2id password hashing (decision #1) — no DB required.
 */
import { describe, expect, it } from "vitest";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../../services/iam/src/lib/password.js";

describe("IAM-01 password hashing (Argon2id)", () => {
  it("hash() never returns the plaintext password", async () => {
    const plaintext = "correct-horse-battery-staple";
    const hashed = await hashPassword(plaintext);
    expect(hashed.hash).not.toBe(plaintext);
    expect(hashed.hash).not.toContain(plaintext);
    expect(hashed.algorithm).toBe("argon2id");
    expect(hashed.hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verify() roundtrips: correct password matches, wrong password does not", async () => {
    const hashed = await hashPassword("s3cret-Passw0rd!");
    expect(await verifyPassword(hashed.hash, "s3cret-Passw0rd!")).toBe(true);
    expect(await verifyPassword(hashed.hash, "wrong-password")).toBe(false);
  });

  it("two hashes of the same password are different (random salt) but both verify", async () => {
    const a = await hashPassword("same-password-123");
    const b = await hashPassword("same-password-123");
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPassword(a.hash, "same-password-123")).toBe(true);
    expect(await verifyPassword(b.hash, "same-password-123")).toBe(true);
  });

  it("verifyPassword fails closed (returns false, never throws) against a malformed hash string", async () => {
    await expect(verifyPassword("not-a-real-phc-hash", "anything")).resolves.toBe(false);
  });

  it("the dummy hash used for no-enumeration timing never matches any real submitted password", async () => {
    expect(await verifyPassword(DUMMY_PASSWORD_HASH, "password")).toBe(false);
    expect(await verifyPassword(DUMMY_PASSWORD_HASH, "")).toBe(false);
  });
});
