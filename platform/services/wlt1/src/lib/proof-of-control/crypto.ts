/**
 * WLT-01 Phase 3A-1/3A-3/3B — EIP-191 personal-sign AND TRON `signMessageV2`-compatible digest
 * construction, AIX signature parsing/canonicalization, and secp256k1 public-key recovery /
 * chain-specific address derivation. Pure, in-process, no DB access, no HTTP, no RPC/network call
 * of any kind (TRON PoC verification is purely cryptographic — this file never imports application
 * DB logic (`@aix/foundation`'s `query`/`withTransaction`/etc.) and never calls TronGrid/fullNode/
 * any blockchain API), only `@noble/curves`/`@noble/hashes`/`node:crypto` and this service's own
 * EXISTING address canonicalisers (`lib/address/ethereum.ts`, `lib/address/tron.ts` — never a
 * second checksum/Base58Check implementation).
 *
 * PHASE 3B — V2, NOT LEGACY TRON SIGNING: `buildTronPersonalSignDigest` implements ONLY the
 * TronWeb `trx.signMessageV2`/`trx.verifyMessageV2`-compatible dynamic-length prefix
 * (`"\x19TRON Signed Message:\n" + UTF-8 byte length`) — the legacy fixed `"\x19TRON Signed
 * Message:\n32"` header (which signs a PRE-HASHED 32-byte digest, a structurally different
 * construction) is deliberately NEVER implemented anywhere in this codebase.
 *
 * FROZEN NOBLE API SURFACE (dependency-gate ratified, do not deviate):
 *   import { secp256k1 } from "@noble/curves/secp256k1";
 * `secp256k1.recoverPublicKey(...)` is NOT used — 1.9.7's strict TypeScript declaration does not
 * expose it on `CurveFn`. The SINGLE permitted recovery path, verified against a real deterministic
 * vector (the golden vector committed in `tests/unit/wlt1-poc-crypto.test.ts`):
 *   secp256k1.Signature.fromBytes(nobleRecoveredSig, "recovered").recoverPublicKey(digest32).toBytes(false)
 * No `as any`, no type assertion, no `@ts-ignore`/`@ts-expect-error`.
 *
 * SIGNATURE REPRESENTATION (frozen, AIX external format never changes to match Noble):
 *   AIX:   r(32) || s(32) || v(1)          — v is the RAW input byte (27/28 or already 0/1)
 *   Noble "recovered" format: recovery(1) || r(32) || s(32) — reordered internally, never exposed.
 * `v` is normalized 27->0, 28->1; 0/1 accepted as-is; anything else is rejected BEFORE any Noble
 * call. High-`s` (`s > n/2`) is REJECTED, never normalized into low-`s` — AIX code enforces
 * `r,s ∈ [1, n-1]` and `s <= n/2` itself, never relying on a Noble default for this.
 */
import { createHash } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { canonicaliseEthereumAddress } from "../address/ethereum.js";
import { deriveTronMainnetAddress } from "../address/tron.js";
import type { PocSignatureVerificationResult } from "./types.js";

const AIX_SIGNATURE_HEX_PATTERN = /^0x[0-9a-fA-F]{130}$/;
const CURVE_ORDER = secp256k1.Point.Fn.ORDER;
const CURVE_ORDER_HALF = CURVE_ORDER / 2n;

/**
 * EIP-191 personal-sign digest: `keccak_256(UTF8("\x19Ethereum Signed Message:\n" + byteLength) ||
 * UTF8(canonicalMessage))`. `byteLength` is the UTF-8 BYTE length of the message — NOT the
 * JavaScript string's `.length` (character count), which would silently diverge for any
 * multi-byte-UTF-8 character. Noble receives this 32-byte digest DIRECTLY (`prehash: false` in the
 * chosen recovery path below) — no SHA-256 prehash is applied by Noble.
 */
export function computeEip191PersonalSignDigest(canonicalMessage: string): Uint8Array {
  const messageBytes = new TextEncoder().encode(canonicalMessage);
  const prefixBytes = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
  const preimage = new Uint8Array(prefixBytes.length + messageBytes.length);
  preimage.set(prefixBytes, 0);
  preimage.set(messageBytes, prefixBytes.length);
  return keccak_256(preimage);
}

/**
 * Phase 3B — TRON `signMessageV2`/`verifyMessageV2`-compatible digest: `keccak_256(UTF8("\x19TRON
 * Signed Message:\n" + byteLength) || UTF8(canonicalMessage))`. Structurally identical construction
 * to `computeEip191PersonalSignDigest` above (dynamic-length prefix, single keccak_256 pass over
 * prefix||message, no SHA-256 prehash) — ONLY the literal prefix string differs
 * (`"TRON"` vs `"Ethereum"`), which is exactly what gives the two schemes DOMAIN SEPARATION: the
 * same canonical message produces two DIFFERENT 32-byte digests, so a signature valid under one
 * scheme cannot recover to a matching address under the other by construction (verified empirically
 * in `tests/unit/wlt1-poc-tron-crypto.test.ts`'s own cross-domain negative tests). `byteLength` is
 * the UTF-8 BYTE length, never the JS string's character count. This is NOT the legacy TRON
 * fixed-`"\n32"` prefix — see this file's own header comment.
 */
export function buildTronPersonalSignDigest(canonicalMessage: string): Uint8Array {
  const messageBytes = new TextEncoder().encode(canonicalMessage);
  const prefixBytes = new TextEncoder().encode(`\x19TRON Signed Message:\n${messageBytes.length}`);
  const preimage = new Uint8Array(prefixBytes.length + messageBytes.length);
  preimage.set(prefixBytes, 0);
  preimage.set(messageBytes, prefixBytes.length);
  return keccak_256(preimage);
}

interface ParsedAixSignature {
  r: Uint8Array;
  s: Uint8Array;
  /** Normalized to 0 or 1 — never the raw 27/28 input byte. */
  v: 0 | 1;
}

/** Parses+normalizes the AIX external `0x`-prefixed 65-byte (130 hex char) `r||s||v` signature.
 * Deterministically rejects malformed hex, wrong length, and any `v` byte other than 27/28/0/1 —
 * never throws; the caller (`verifyEip191PersonalSignSignature`) converts every rejection into a
 * bounded result, never an unhandled exception. */
function parseAixSignatureHex(aixSignatureHex: string): { ok: true; signature: ParsedAixSignature } | { ok: false; reasonCode: "malformed_hex" | "invalid_length" | "invalid_v" } {
  if (!AIX_SIGNATURE_HEX_PATTERN.test(aixSignatureHex)) {
    // Distinguishes "not hex at all" from "hex but wrong length" only when the length is right but
    // characters aren't — a wrong-length input already fails the single combined pattern above, so
    // both cases collapse to one check; the two reason codes exist for future callers that may want
    // to log which failure mode occurred without a second regex pass.
    const bodyLength = aixSignatureHex.startsWith("0x") ? aixSignatureHex.length - 2 : aixSignatureHex.length;
    if (bodyLength !== 130) return { ok: false, reasonCode: "invalid_length" };
    return { ok: false, reasonCode: "malformed_hex" };
  }
  const bytes = hexToBytes(aixSignatureHex.slice(2).toLowerCase());
  const r = bytes.slice(0, 32);
  const s = bytes.slice(32, 64);
  const vRaw = bytes[64] as number;
  const v: 0 | 1 | -1 = vRaw === 27 ? 0 : vRaw === 28 ? 1 : vRaw === 0 || vRaw === 1 ? (vRaw as 0 | 1) : -1;
  if (v === -1) return { ok: false, reasonCode: "invalid_v" };
  return { ok: true, signature: { r, s, v } };
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt("0x" + bytesToHex(bytes));
}

/** AIX-OWNED range/low-`s` enforcement — `r, s ∈ [1, n-1]` and `s <= n/2`. Never delegated to a
 * Noble default; `r = 0`/`s = 0` are both out-of-range (not a separate "zero" reason), and a
 * high-`s` signature is rejected outright, never normalized into its low-`s` equivalent. */
function validateSignatureRange(r: bigint, s: bigint): { ok: true } | { ok: false; reasonCode: "r_out_of_range" | "s_out_of_range" | "high_s" } {
  if (r < 1n || r > CURVE_ORDER - 1n) return { ok: false, reasonCode: "r_out_of_range" };
  if (s < 1n || s > CURVE_ORDER - 1n) return { ok: false, reasonCode: "s_out_of_range" };
  if (s > CURVE_ORDER_HALF) return { ok: false, reasonCode: "high_s" };
  return { ok: true };
}

/** The ONE canonical AIX signature byte layout (`r || s || normalized_v`, 65 bytes) — computed
 * once a signature has already passed hex/length/`v`/range/low-`s` validation. `signature_hash` is
 * SHA-256 over exactly these bytes, so an input carrying `v=27` and an equivalent input carrying
 * `v=0` produce the IDENTICAL `signature_hash` (enabling idempotent replay detection later). */
function canonicalSignatureBytes(signature: ParsedAixSignature): Uint8Array {
  const out = new Uint8Array(65);
  out.set(signature.r, 0);
  out.set(signature.s, 32);
  out[64] = signature.v;
  return out;
}

function computeSignatureHash(canonicalBytes: Uint8Array): string {
  return createHash("sha256").update(canonicalBytes).digest("hex");
}

/** AIX `r || s || v` -> Noble "recovered" `recovery || r || s` reordering — the ONE conversion this
 * codebase performs; Noble's recovered-signature byte order was verified empirically against a
 * real deterministic vector (never assumed from documentation alone — see the golden vector in `tests/unit/wlt1-poc-crypto.test.ts`). */
function toNobleRecoveredBytes(signature: ParsedAixSignature): Uint8Array {
  const out = new Uint8Array(65);
  out[0] = signature.v;
  out.set(signature.r, 1);
  out.set(signature.s, 33);
  return out;
}

export type CanonicalizeAixSignatureResult =
  | { ok: true; signature: ParsedAixSignature; canonicalSignatureHex: string; signatureHash: string }
  | { ok: false; reasonCode: "malformed_hex" | "invalid_length" | "invalid_v" | "r_out_of_range" | "s_out_of_range" | "high_s" };

/**
 * Phase 3A-3 — the pure parse/normalize/range-validate/hash seam, WITHOUT any Noble recovery call.
 * Extracted so a caller can canonicalize a submitted signature and compare its `signatureHash`
 * against an ALREADY-verified challenge's own persisted `signature_hash` (replay-identity check)
 * without ever re-running cryptographic recovery on an already-decided challenge — recovery is
 * reserved for a genuinely `issued` challenge's first-ever attempt at each nonce. Never duplicated:
 * `verifyEip191PersonalSignSignature` below calls this SAME function for its own parse/range step.
 */
export function canonicalizeAixSignature(aixSignatureHex: string): CanonicalizeAixSignatureResult {
  const parsed = parseAixSignatureHex(aixSignatureHex);
  if (!parsed.ok) return { ok: false, reasonCode: parsed.reasonCode };

  const rangeCheck = validateSignatureRange(bytesToBigInt(parsed.signature.r), bytesToBigInt(parsed.signature.s));
  if (!rangeCheck.ok) return { ok: false, reasonCode: rangeCheck.reasonCode };

  const canonicalBytes = canonicalSignatureBytes(parsed.signature);
  return {
    ok: true,
    signature: parsed.signature,
    canonicalSignatureHex: "0x" + bytesToHex(canonicalBytes),
    signatureHash: computeSignatureHash(canonicalBytes),
  };
}

/** Shared Noble recovery step — used by BOTH `verifyEip191PersonalSignSignature` and
 * `verifyTronPersonalSignSignature` (Phase 3B), since the recovery math itself is chain-agnostic;
 * only the DIGEST fed in and the address derived FROM the recovered key differ per chain. Returns
 * the uncompressed SEC1 public key (`0x04 || X(32) || Y(32)`, 65 bytes) or `null` on any recovery
 * failure (malformed/non-recoverable point, or an unexpected key shape) — never throws. */
function recoverUncompressedPublicKey(canon: Extract<CanonicalizeAixSignatureResult, { ok: true }>, digest32: Uint8Array): Uint8Array | null {
  let recoveredPublicKey: Uint8Array;
  try {
    recoveredPublicKey = secp256k1.Signature.fromBytes(toNobleRecoveredBytes(canon.signature), "recovered").recoverPublicKey(digest32).toBytes(false);
  } catch {
    return null;
  }
  // Uncompressed SEC1 form: 0x04 || X(32) || Y(32), 65 bytes. Address derivation uses pubkey[1..65]
  // (X||Y) — NEVER the 33-byte compressed form.
  if (recoveredPublicKey.length !== 65 || recoveredPublicKey[0] !== 0x04) {
    return null;
  }
  return recoveredPublicKey;
}

/**
 * Full bounded verification seam: canonicalize (parse -> normalize `v` -> AIX-owned range/low-`s`
 * checks) -> Noble recovery (`prehash: false`, digest consumed as-is) -> uncompressed 65-byte
 * public key -> `keccak_256(pubkey[1..65])` last-20-bytes Ethereum address derivation ->
 * canonicalisation through the EXISTING `lib/address/ethereum.ts` EIP-55 implementation (never a
 * second one). A Noble recovery exception (malformed/non-recoverable point) is caught and
 * converted to `{ ok: false, reasonCode: "recovery_failed" }` — never an unhandled exception. This
 * function does NOT look up `wallet_destination.canonical_address` or any other DB row, and does
 * NOT compare the recovered address against an expected one — both belong to the caller
 * (`routes/proof-of-control.ts`'s own verify handler, Phase 3A-3).
 */
export function verifyEip191PersonalSignSignature(canonicalMessage: string, aixSignatureHex: string): PocSignatureVerificationResult {
  const canon = canonicalizeAixSignature(aixSignatureHex);
  if (!canon.ok) return { ok: false, reasonCode: canon.reasonCode };

  const digest32 = computeEip191PersonalSignDigest(canonicalMessage);
  const recoveredPublicKey = recoverUncompressedPublicKey(canon, digest32);
  if (!recoveredPublicKey) {
    return { ok: false, reasonCode: "recovery_failed" };
  }

  const rawAddress = "0x" + bytesToHex(keccak_256(recoveredPublicKey.slice(1)).slice(-20));
  const canonicalised = canonicaliseEthereumAddress(rawAddress);
  if (!canonicalised.ok) {
    // Structurally unreachable — keccak_256's own 20-byte output can never be the zero address
    // for a genuine recovered key, and `rawAddress` is always well-formed lowercase 0x-prefixed
    // hex — but this function makes no authority claim beyond what it can prove, so an
    // inconsistent canonicalisation is treated as a recovery failure, never a silent pass-through
    // of an uncanonicalised address.
    return { ok: false, reasonCode: "recovery_failed" };
  }

  return {
    ok: true,
    recoveredAddress: canonicalised.canonicalAddress,
    canonicalSignatureHex: canon.canonicalSignatureHex,
    signatureHash: canon.signatureHash,
  };
}

/**
 * Phase 3B — TRON `signMessageV2`-compatible verification seam. IDENTICAL structure to
 * `verifyEip191PersonalSignSignature` above (same `canonicalizeAixSignature` parse/range/low-`s`
 * seam, same Noble recovery path via `recoverUncompressedPublicKey` — no separate TRON r/s/v
 * rules) — only the DIGEST (`buildTronPersonalSignDigest`, TRON's own dynamic-length V2 prefix)
 * and the ADDRESS DERIVATION (`keccak_256(pubkey[1..65])` last-20-bytes -> `0x41`-prefixed 21-byte
 * payload -> Base58Check via the EXISTING `lib/address/tron.ts` encoder, never a second one)
 * differ. Purely cryptographic — no RPC/TronGrid/fullNode/contract call of any kind.
 */
export function verifyTronPersonalSignSignature(canonicalMessage: string, aixSignatureHex: string): PocSignatureVerificationResult {
  const canon = canonicalizeAixSignature(aixSignatureHex);
  if (!canon.ok) return { ok: false, reasonCode: canon.reasonCode };

  const digest32 = buildTronPersonalSignDigest(canonicalMessage);
  const recoveredPublicKey = recoverUncompressedPublicKey(canon, digest32);
  if (!recoveredPublicKey) {
    return { ok: false, reasonCode: "recovery_failed" };
  }

  const hash160 = keccak_256(recoveredPublicKey.slice(1)).slice(-20);
  const canonicalised = deriveTronMainnetAddress(hash160);
  if (!canonicalised.ok) {
    // Structurally unreachable — keccak_256's own 20-byte output can never be the all-zero address
    // for a genuine recovered key, and `deriveTronMainnetAddress` always builds a well-formed
    // 21-byte mainnet-prefixed payload — but this function makes no authority claim beyond what it
    // can prove, so an inconsistent canonicalisation is treated as a recovery failure, never a
    // silent pass-through of an uncanonicalised address.
    return { ok: false, reasonCode: "recovery_failed" };
  }

  return {
    ok: true,
    recoveredAddress: canonicalised.canonicalAddress,
    canonicalSignatureHex: canon.canonicalSignatureHex,
    signatureHash: canon.signatureHash,
  };
}
