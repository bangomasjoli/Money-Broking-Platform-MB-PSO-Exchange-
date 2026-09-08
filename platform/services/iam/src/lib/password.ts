/**
 * IAM-01 password hashing (decision #1 / IAM-FR-002 / §05.2.2).
 * Argon2id via @node-rs/argon2 (prebuilt NAPI binaries, no native compile toolchain
 * required). `hash()` returns a single PHC-formatted string that already encodes the
 * algorithm, parameters, salt, and derived hash — that whole string is what we persist as
 * `credential_password.password_hash`; we never handle/store the plaintext password, the
 * salt, or the raw hash bytes separately. Never log the password or the returned hash.
 */
import { hash, verify, Algorithm } from "@node-rs/argon2";

const ARGON2ID_OPTIONS = { algorithm: Algorithm.Argon2id } as const;

export interface HashedPassword {
  /** Full PHC-encoded string: algorithm + params + salt + hash. */
  hash: string;
  algorithm: "argon2id";
  /** Safe params echo for credential_password.hash_params (no secret pepper — §05.2.2 rule 2/3). */
  params: { encoding: "phc"; note: string };
}

export async function hashPassword(plaintext: string): Promise<HashedPassword> {
  const encoded = await hash(plaintext, ARGON2ID_OPTIONS);
  return {
    hash: encoded,
    algorithm: "argon2id",
    params: { encoding: "phc", note: "memory/time/parallelism cost encoded in the PHC hash string itself" },
  };
}

export async function verifyPassword(storedHash: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext);
  } catch {
    // Malformed/foreign hash string — fail closed as "does not match", never throw into
    // the caller (which would risk leaking hash-format details or crashing the request).
    return false;
  }
}

/**
 * A fixed, precomputed Argon2id PHC hash of a value nobody will ever submit as a real
 * password. Used to run a dummy verify() when the identifier does not resolve to a user,
 * so login timing does not disclose whether the account exists (§09 Error Handling §3.3).
 */
export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$PVwN+JhO0zhLquF6VD4URg$XPq1u7nZdtKa834jEd9hGquoOL+xQrweNrfygIn7b08";

/**
 * Password-reset confirm needs SOME policy floor (blueprint §05 §9: "minimum length,
 * complexity/passphrase rules"). Password history count / breach-check-provider are explicit
 * DEFERRED items (see IAM-01_IMPLEMENTATION_NOTES.md) — this is deliberately a minimal,
 * self-contained floor, not a full policy engine: minimum length (matches the >=12 already
 * enforced on the bootstrap admin password in config.ts) plus a basic letter+digit mix so an
 * all-numeric or all-alphabetic 12-char string does not pass. Never logs the candidate value.
 */
export function validatePasswordPolicy(plaintext: string): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (plaintext.length < 12) issues.push("must be at least 12 characters");
  if (plaintext.length > 512) issues.push("must be at most 512 characters");
  if (!/[a-zA-Z]/.test(plaintext)) issues.push("must contain at least one letter");
  if (!/[0-9]/.test(plaintext)) issues.push("must contain at least one digit");
  return { ok: issues.length === 0, issues };
}
