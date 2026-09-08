/**
 * WLT-01 Phase 1B — deterministic Ethereum mainnet address canonicalisation (EIP-55). Pure,
 * in-process, network-free: no RPC call, no wallet/signing library, no private-key handling.
 *
 * Uses `@noble/hashes/sha3`'s `keccak_256` — EXPLICITLY NOT `sha3_256` from the same package.
 * EIP-55's checksum is defined over Keccak-256 (the original Keccak submission, pre-NIST-
 * finalization padding), which is a DIFFERENT digest from NIST SHA3-256 despite the similar name.
 * `@noble/hashes` itself documents this distinction on both exports ("Different from keccak-256" /
 * "Different from SHA3-256") — substituting one for the other would silently produce a checksum
 * that validates against nothing real.
 *
 * EXPLICIT RULE (documented, not implied): the `0x` prefix is required and case-sensitive —
 * `0X...` (uppercase X) is rejected, matching the universal Ethereum tooling convention.
 */
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";
import { containsInvisibleOrControlCharacters, hasSurroundingWhitespace } from "./shared.js";

export const ETHEREUM_CANONICALISATION_VERSION = "ethereum-eip55-v1";

const HEX_BODY_PATTERN = /^[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS_BODY = "0".repeat(40);

export type EthereumCanonicaliseResult =
  | { ok: true; canonicalAddress: string; canonicalisationVersion: typeof ETHEREUM_CANONICALISATION_VERSION }
  | { ok: false; reasonCode: string };

/** Pure EIP-55 checksum computation: hash the lowercase hex body (no `0x`, ASCII bytes) with
 * Keccak-256; for each hex digit that is a letter (a-f), uppercase it if the corresponding nibble
 * of the hash is >= 8, otherwise keep it lowercase. Digits (0-9) are never case-adjusted. */
function eip55Checksum(lowercaseBody: string): string {
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(lowercaseBody)));
  let out = "";
  for (let i = 0; i < lowercaseBody.length; i++) {
    const ch = lowercaseBody[i] as string;
    if (/[a-f]/.test(ch) && parseInt(hash[i] as string, 16) >= 8) {
      out += ch.toUpperCase();
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Canonicalises a raw Ethereum mainnet address. Accepts all-lowercase, all-uppercase, or a
 * correctly EIP-55-checksummed mixed-case body; rejects an incorrect mixed-case checksum, the
 * zero address, malformed hex, and any surrounding whitespace or invisible/control character.
 * `memoTag` must be absent or empty — Ethereum destinations never carry one.
 */
export function canonicaliseEthereumAddress(rawAddress: string, memoTag?: string): EthereumCanonicaliseResult {
  if (memoTag !== undefined && memoTag !== "") {
    return { ok: false, reasonCode: "memo_tag_not_permitted" };
  }
  if (hasSurroundingWhitespace(rawAddress)) {
    return { ok: false, reasonCode: "whitespace_not_permitted" };
  }
  if (containsInvisibleOrControlCharacters(rawAddress)) {
    return { ok: false, reasonCode: "invisible_or_control_character" };
  }
  if (!rawAddress.startsWith("0x")) {
    return { ok: false, reasonCode: "0x_prefix_required" };
  }
  const body = rawAddress.slice(2);
  if (!HEX_BODY_PATTERN.test(body)) {
    return { ok: false, reasonCode: "invalid_hex_body" };
  }
  const lowercaseBody = body.toLowerCase();
  if (lowercaseBody === ZERO_ADDRESS_BODY) {
    return { ok: false, reasonCode: "zero_address" };
  }

  const checksummed = eip55Checksum(lowercaseBody);
  const isAllLower = body === lowercaseBody;
  const isAllUpper = body === body.toUpperCase();
  const isCorrectChecksum = body === checksummed;

  if (!isAllLower && !isAllUpper && !isCorrectChecksum) {
    return { ok: false, reasonCode: "invalid_eip55_checksum" };
  }

  return {
    ok: true,
    canonicalAddress: "0x" + checksummed,
    canonicalisationVersion: ETHEREUM_CANONICALISATION_VERSION,
  };
}
