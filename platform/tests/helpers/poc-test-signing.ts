/**
 * WLT-01 Phase 3A-3 — TEST-ONLY shared signing helper for real EIP-191 personal-sign signatures
 * over WLT-01's own canonical PoC message. Never imported by any production `src/` file. Reuses
 * the SAME golden test private key already committed in `tests/unit/wlt1-poc-crypto.test.ts`
 * (Phase 3A-1) — never a second key. PRIVATE KEY IS TEST DATA ONLY.
 */
import { randomBytes } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { computeEip191PersonalSignDigest } from "../../services/wlt1/src/lib/proof-of-control/crypto.js";

/** The Phase 3A-1 golden test private key — never used for any production purpose. */
export const POC_TEST_PRIVATE_KEY_HEX = "4c0883a69102937d6231471b5dbb6204fe512961708279e2b8d4c8a0e0f0f0f0";

/** The raw (all-lowercase, always-accepted) form of the golden key's own derived address — pass
 * this as the `address` field when registering a destination that this key can sign for. */
export const POC_TEST_ADDRESS_RAW = "0x6acb427acf0724871b29023428f65aeb3b5d1255";

/** The EIP-55 canonical form `canonicaliseEthereumAddress` produces for `POC_TEST_ADDRESS_RAW` —
 * what `verified_address`/`canonical_address` will read back as. */
export const POC_TEST_ADDRESS_CANONICAL = "0x6acB427AcF0724871b29023428f65aEB3B5d1255";

/**
 * Signs `message` with `privateKeyHex`, returning the frozen AIX external hex format
 * (`0x` + `r(32) || s(32) || v(1)` = 130 hex chars, `v` as the raw 27/28 byte). `extraEntropy`
 * (when supplied) produces a genuinely DIFFERENT, still cryptographically valid low-s signature
 * for the SAME message+key (RFC 6979 deterministic signing is Noble's default; `extraEntropy`
 * deliberately opts out of it) — used only to construct a second, distinct signature that recovers
 * to the SAME address, for the concurrent-different-valid-signature test.
 */
export function signPocMessageWithKey(message: string, privateKeyHex: string, extraEntropy?: Uint8Array): string {
  const digest = computeEip191PersonalSignDigest(message);
  const sig = secp256k1.sign(digest, hexToBytes(privateKeyHex), extraEntropy ? { prehash: false, extraEntropy } : { prehash: false });
  const compact = sig.toBytes("compact");
  const vRaw = sig.recovery === 0 ? "1b" : "1c";
  return "0x" + bytesToHex(compact.slice(0, 32)) + bytesToHex(compact.slice(32, 64)) + vRaw;
}

/** Signs with the golden test key (deterministic RFC 6979 — the SAME message always produces the
 * SAME signature from this function). */
export function signPocMessage(message: string): string {
  return signPocMessageWithKey(message, POC_TEST_PRIVATE_KEY_HEX);
}

/** A SECOND, genuinely different, still-valid low-s signature over the SAME message with the SAME
 * golden key — recovers to the identical address but has a different canonical `signature_hash`. */
export function signPocMessageWithDifferentEntropy(message: string): string {
  return signPocMessageWithKey(message, POC_TEST_PRIVATE_KEY_HEX, randomBytes(32));
}

/** A signature from a DIFFERENT, unrelated private key — recovers to a DIFFERENT address entirely,
 * so verification against `POC_TEST_ADDRESS_CANONICAL` always fails as `recovered_address_mismatch`. */
export function signPocMessageWithWrongKey(message: string, seedByte = "3"): string {
  return signPocMessageWithKey(message, seedByte.repeat(64));
}
