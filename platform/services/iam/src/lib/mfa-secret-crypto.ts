/**
 * Placeholder-KMS envelope encryption for MFA TOTP secrets (`iam.mfa_factor.secret_encrypted`).
 *
 * KNOWN OPEN ITEM: real KMS/HSM-backed key management is out of IAM-01 scope (tracked in
 * IAM-01_IMPLEMENTATION_NOTES.md as a SEC-01/CFG-01 handoff seam). Until then, the
 * encryption key is derived from a single operator-supplied passphrase
 * (`IAM_MFA_SECRET_ENC_KEY`) via SHA-256 into a fixed 32-byte AES-256 key — this gives a
 * real at-rest confidentiality property (no MFA seed is ever stored in plaintext) without
 * pulling in a KDF/HSM dependency this pass. Key rotation is NOT implemented (would require
 * re-encrypting all rows) and is deferred.
 *
 * AES-256-GCM is authenticated (tag verified on decrypt) so tampering with a stored secret
 * is detected, not silently decrypted into garbage.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function deriveMfaEncryptionKey(passphrase: string): Buffer {
  return createHash("sha256").update(passphrase, "utf8").digest();
}

export function encryptMfaSecret(plaintextBase32: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextBase32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptMfaSecret(encoded: string, key: Buffer): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
