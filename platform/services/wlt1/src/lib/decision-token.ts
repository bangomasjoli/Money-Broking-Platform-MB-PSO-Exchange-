/**
 * WLT-01 Phase 4A-2/4A-3 — opaque decision-token identifier/format helpers + timing-safe hash
 * comparison. Implements the FROZEN token security model exactly (WLT-01 Phase 4A freeze): opaque
 * random token + persisted SHA-256 hash — mirrors the accepted CFG-01 precedent
 * (`services/cfg1/src/lib/decision-token.ts`) byte-for-byte on the cryptographic primitives, own
 * copy, F3(c).
 *
 * ISSUANCE (Phase 4A-2) — `hashToken` computes the value `routes/evaluate-use.ts` persists at
 * INSERT time. The raw token is generated here and returned to the caller exactly once — this
 * module never persists, logs, or audits it; that discipline is enforced by the route/caller, not
 * by this file (a pure formatting/hashing module has no I/O to misuse).
 *
 * VERIFICATION (Phase 4A-3, this addition) — `tokenHashMatches` is the ONLY sanctioned way to
 * compare a caller-presented raw token against a persisted `token_hash`. It is deliberately
 * `crypto.timingSafeEqual`-based, not `===`, over two ALWAYS-32-byte buffers (SHA-256 hex is
 * always exactly 64 hex characters, decoding to exactly 32 bytes — `timingSafeEqual` requires
 * equal-length buffers and would otherwise throw on any length mismatch, which structurally
 * cannot happen here). `DUMMY_TOKEN_HASH` exists so `routes/decision-verify.ts` can run the
 * IDENTICAL comparison shape (same function, same buffer sizes, same code path) when the
 * `decision_id` itself does not exist — mirrors `plugins/receipt-auth.ts`'s own established
 * "compare against a fixed-length dummy secret so an unconfigured/unknown identity carries no
 * timing signal" discipline. `DUMMY_TOKEN_HASH` is a fixed, public, non-secret placeholder — never
 * a real digest of anything, never derived from config. This module still exposes NO lookup-by-
 * hash/lookup-by-id function — that stays the route's own DB-touching responsibility, per the
 * established `lib/evaluate-use.ts` pattern of keeping pure crypto/format helpers separate from
 * I/O.
 */
import { randomBytes, createHash, randomUUID, timingSafeEqual } from "node:crypto";

const RAW_TOKEN_PREFIX = "wlt1dt_";
const DECISION_ID_PREFIX = "wlt1dec_";

/** `wlt1dt_` + 32 CSPRNG bytes, base64url-encoded (43 characters) — 50 characters total. */
export const RAW_TOKEN_REGEX = /^wlt1dt_[A-Za-z0-9_-]{43}$/;

/** `wlt1dec_` + a UUID (36 characters, lowercase hex + hyphens). */
export const DECISION_ID_REGEX = /^wlt1dec_[0-9a-f-]{36}$/;

/** Mints a new opaque raw decision token. Never derived from any caller input — always a fresh
 * CSPRNG value. */
export function mintDecisionToken(): string {
  return RAW_TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

/** Mints a new decision_id — the PUBLIC identifier a caller may reference, distinct from the raw
 * token itself. */
export function mintDecisionId(): string {
  return DECISION_ID_PREFIX + randomUUID();
}

/** SHA-256 of the raw token, lowercase hex (64 characters) — the ONLY form ever persisted. */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Fixed, public, non-secret 64-hex-character placeholder — never a real digest of anything.
 * Phase 4A-3's own "unknown decision_id" path compares against this so the comparison shape
 * (hash + 32-byte buffer conversion + `timingSafeEqual`) is identical whether or not a row exists,
 * carrying no existence-timing signal (see this file's own header comment). */
export const DUMMY_TOKEN_HASH = "0".repeat(64);

/** Timing-safe comparison of a caller-presented raw token against a persisted (or dummy)
 * `token_hash`. The ONLY sanctioned way to authenticate a decision token — never `===` on the
 * hash strings themselves. Never throws merely because `rawToken` is malformed/non-canonical:
 * `hashToken` accepts any string and always produces a valid 64-hex digest, so both operands
 * always decode to exactly 32 bytes and `timingSafeEqual` (which requires equal-length buffers)
 * can never throw on a length mismatch here. */
export function tokenHashMatches(rawToken: string, storedHash: string): boolean {
  const presented = Buffer.from(hashToken(rawToken), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (presented.length !== stored.length) return false;
  return timingSafeEqual(presented, stored);
}
