/**
 * WLT-01 Phase 3B — TEST-ONLY shared signing helper for real TRON `signMessageV2`-compatible
 * signatures over WLT-01's own canonical PoC message. Never imported by any production `src/`
 * file. Reuses the SAME golden TRON test private key committed in
 * `tests/unit/wlt1-poc-tron-crypto.test.ts` (the key an independently-produced, real TronWeb
 * `signMessageV2`/`verifyMessageV2` static vector was signed with — see that file's own header
 * comment for full provenance) — never a second key. PRIVATE KEY IS TEST DATA ONLY.
 *
 * Signs using this repository's OWN accepted crypto primitives (`@noble/curves/secp256k1` +
 * `buildTronPersonalSignDigest`) rather than re-invoking an external TronWeb process for every
 * test — legitimate ONLY because `wlt1-poc-tron-crypto.test.ts`'s own static vector already proves
 * this codebase's digest/recovery/address-derivation pipeline is byte-compatible with the REAL
 * external TronWeb reference implementation. Mirrors `poc-test-signing.ts`'s own identical
 * precedent for the EVM golden key.
 */
import { randomBytes } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { keccak_256 } from "@noble/hashes/sha3";
import { buildTronPersonalSignDigest } from "../../services/wlt1/src/lib/proof-of-control/crypto.js";
import { deriveTronMainnetAddress } from "../../services/wlt1/src/lib/address/tron.js";

/** The golden TRON test private key — the SAME key the real TronWeb interop vector in
 * `wlt1-poc-tron-crypto.test.ts` was independently signed with. Never used for any production
 * purpose. */
export const POC_TRON_TEST_PRIVATE_KEY_HEX = "09b1b10426fe2cf05819e991eebab69b84806f8631da95f7cfc21f74cd8917e8";

/** The canonical TRON mainnet address this key derives to — independently confirmed against the
 * real TronWeb reference implementation (`TronWeb.address.fromPrivateKey`) in the same static
 * vector. Pass this as the `address` field when registering a destination this key can sign for. */
export const POC_TRON_TEST_ADDRESS = "TBVnfLnh9xL2RcUWziezQFL5P6Z4HekyRC";

/**
 * Signs `message` with `privateKeyHex` using the TRON V2 digest, returning the frozen AIX
 * external hex format (`0x` + `r(32) || s(32) || v(1)` = 130 hex chars, `v` as the raw 27/28 byte)
 * — IDENTICAL byte layout to the EVM signer, only the digest construction differs. `extraEntropy`
 * (when supplied) produces a genuinely DIFFERENT, still cryptographically valid low-s signature
 * for the SAME message+key — used only to construct a second, distinct signature that recovers to
 * the SAME address, for the concurrent-different-valid-signature test.
 */
export function signTronPocMessageWithKey(message: string, privateKeyHex: string, extraEntropy?: Uint8Array): string {
  const digest = buildTronPersonalSignDigest(message);
  const sig = secp256k1.sign(digest, hexToBytes(privateKeyHex), extraEntropy ? { prehash: false, extraEntropy } : { prehash: false });
  const compact = sig.toBytes("compact");
  const vRaw = sig.recovery === 0 ? "1b" : "1c";
  return "0x" + bytesToHex(compact.slice(0, 32)) + bytesToHex(compact.slice(32, 64)) + vRaw;
}

/** Signs with the golden TRON test key (deterministic RFC 6979 — the SAME message always produces
 * the SAME signature from this function). */
export function signTronPocMessage(message: string): string {
  return signTronPocMessageWithKey(message, POC_TRON_TEST_PRIVATE_KEY_HEX);
}

/** A SECOND, genuinely different, still-valid low-s signature over the SAME message with the SAME
 * golden key — recovers to the identical address but has a different canonical `signature_hash`. */
export function signTronPocMessageWithDifferentEntropy(message: string): string {
  return signTronPocMessageWithKey(message, POC_TRON_TEST_PRIVATE_KEY_HEX, randomBytes(32));
}

/** A signature from a DIFFERENT, unrelated private key — recovers to a DIFFERENT TRON address
 * entirely, so verification against `POC_TRON_TEST_ADDRESS` always fails as
 * `recovered_address_mismatch`. */
export function signTronPocMessageWithWrongKey(message: string, seedByte = "7"): string {
  return signTronPocMessageWithKey(message, seedByte.repeat(64));
}

/** Derives the canonical TRON address for an arbitrary private key — used ONLY by
 * `signTronPocMessageWithWrongKey`'s own negative-test callers that need to know the (irrelevant,
 * mismatched) address a wrong key would recover to. Never used to derive the golden address
 * itself — that is the independently-verified `POC_TRON_TEST_ADDRESS` constant above. */
export function deriveTronAddressForPrivateKey(privateKeyHex: string): string {
  const pubkey = secp256k1.getPublicKey(hexToBytes(privateKeyHex), false);
  const hash160 = keccak_256(pubkey.slice(1)).slice(-20);
  const result = deriveTronMainnetAddress(hash160);
  if (!result.ok) throw new Error("test helper: failed to derive TRON address for private key");
  return result.canonicalAddress;
}
