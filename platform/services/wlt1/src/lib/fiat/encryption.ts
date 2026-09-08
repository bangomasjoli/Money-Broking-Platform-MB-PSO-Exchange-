/**
 * WLT-01 Fiat Payout Destinations (APAC) — at-rest envelope encryption for the canonical account
 * identity object. Implements the FROZEN architecture exactly (WLT-01 Fiat Payout Destinations
 * Implementation-Exact Architecture Addendum + APAC-First Local-Account Architecture Pivot, both
 * CLOSED).
 *
 * SAME Placeholder-KMS posture as `services/iam/src/lib/mfa-secret-crypto.ts` — no real KMS/HSM
 * exists in this codebase yet; the encryption key is derived from a single operator-supplied
 * passphrase (`WLT1_FIAT_ENC_KEY`, `config.ts`'s own `fiatEncKey`). Own copy, not imported —
 * F3(c); the KDF is DOMAIN-SEPARATED from IAM's bare `sha256(passphrase)` so the two services can
 * never accidentally derive the same key from a shared/reused passphrase value.
 *
 * AES-256-GCM, authenticated (tamper is detected, never silently decrypted into garbage). AAD is
 * bound to `destinationId` — ciphertext cannot be replayed/reattached under a different
 * destination's identity without the authentication tag failing to verify.
 *
 * NO PRODUCTION DECRYPT PATH: this module exports ENCRYPTION ONLY. This phase never reads a bank-
 * account identifier back out of ciphertext — WDR-01/first real payout execution remains
 * hard-blocked before account decryption until real KMS-backed key management and sensitive-read
 * logging are designed (out of WLT-01 scope). A decrypt implementation may exist in a TEST file
 * only, never in production source.
 *
 * Envelope: the raw byte concatenation `"v1" || iv || tag || ciphertext`, base64-encoded as one
 * value — a fixed 2-byte ASCII version marker precedes the 12-byte IV, 16-byte GCM tag, and
 * variable-length ciphertext, all inside the SAME base64 string.
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ENVELOPE_VERSION = "v1";
/** Domain-separation string — distinct from IAM's own MFA-secret KDF, so a shared/reused
 * passphrase value can never derive the same key for both purposes. */
const KDF_DOMAIN = "wlt1.fiat.account_identifier.v1";

export const FIAT_ENC_KEY_MIN_LENGTH = 32;

/** `sha256(passphrase + KDF_DOMAIN)` -> a fixed 32-byte AES-256 key. */
export function deriveFiatAccountEncryptionKey(passphrase: string): Buffer {
  return createHash("sha256").update(passphrase + KDF_DOMAIN, "utf8").digest();
}

/** Encrypts `plaintext` (the canonical account identity object's own `canonicalJSON` text, per
 * the caller's own responsibility — this function has no opinion on what string it is handed) and
 * returns the base64 envelope described above. `destinationId` is bound as AAD — never encoded
 * inside the ciphertext itself. */
export function encryptFiatAccountIdentifier(plaintext: string, key: Buffer, destinationId: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(destinationId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = Buffer.concat([Buffer.from(ENVELOPE_VERSION, "ascii"), iv, tag, ciphertext]);
  return envelope.toString("base64");
}

export const FIAT_ENCRYPTION_IV_LENGTH = IV_LENGTH;
export const FIAT_ENCRYPTION_TAG_LENGTH = TAG_LENGTH;
export const FIAT_ENCRYPTION_ENVELOPE_VERSION = ENVELOPE_VERSION;
