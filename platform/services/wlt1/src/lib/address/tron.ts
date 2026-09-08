/**
 * WLT-01 Phase 1B — deterministic TRON mainnet address canonicalisation (Base58Check). Pure,
 * in-process, network-free: no TronWeb, no RPC call, no wallet/signing library.
 *
 * TRON mainnet addresses are Base58Check-encoded 21-byte payloads: a fixed 1-byte mainnet prefix
 * (`0x41`) followed by the 20-byte address, with a 4-byte double-SHA256 checksum appended before
 * Base58 encoding — the same construction Bitcoin uses for its own Base58Check addresses.
 * `@scure/base`'s `createBase58check(sha256)` performs the double-hash internally
 * (`sha256(sha256(payload))`, confirmed by reading its own source), so a single-hash `sha256` is
 * the correct argument, never a pre-doubled one.
 *
 * Hex-form TRON addresses (`41` + 40 hex chars, no Base58 encoding) are DELIBERATELY NOT accepted
 * this phase — the blueprint does not require them, and accepting a second raw input shape would
 * double the canonicalisation surface for no Phase 1B need.
 */
import { sha256 } from "@noble/hashes/sha2";
import { base58, createBase58check } from "@scure/base";
import { containsInvisibleOrControlCharacters, hasSurroundingWhitespace } from "./shared.js";

export const TRON_CANONICALISATION_VERSION = "tron-base58check-v1";

/** TRON mainnet address prefix byte — the first byte of every valid mainnet Base58Check payload. */
const TRON_MAINNET_PREFIX = 0x41;
/** Prefix byte (1) + address bytes (20). */
const TRON_PAYLOAD_LENGTH = 21;

const base58check = createBase58check(sha256);

export type TronCanonicaliseResult =
  | { ok: true; canonicalAddress: string; canonicalisationVersion: typeof TRON_CANONICALISATION_VERSION }
  | { ok: false; reasonCode: string };

/**
 * Canonicalises a raw TRON mainnet Base58Check address. Rejects an invalid Base58 alphabet
 * character (shape defect), a valid-alphabet-but-invalid checksum (canonicalisation defect,
 * distinguished from the alphabet case — see the two-step decode below), a wrong payload length,
 * a non-mainnet prefix byte, and the
 * all-zero address (deterministically defined as a 20-byte all-zero payload, chain-agnostic —
 * TRON has no single universally-cited "burn address" string, so this is the general rule rather
 * than a hardcoded literal). `memoTag` must be absent or empty — TRON destinations never carry one
 * in Phase 1B.
 */
export function canonicaliseTronAddress(rawAddress: string, memoTag?: string): TronCanonicaliseResult {
  if (memoTag !== undefined && memoTag !== "") {
    return { ok: false, reasonCode: "memo_tag_not_permitted" };
  }
  if (hasSurroundingWhitespace(rawAddress)) {
    return { ok: false, reasonCode: "whitespace_not_permitted" };
  }
  if (containsInvisibleOrControlCharacters(rawAddress)) {
    return { ok: false, reasonCode: "invisible_or_control_character" };
  }
  if (!rawAddress.startsWith("T")) {
    return { ok: false, reasonCode: "t_prefix_required" };
  }

  // Two-step decode so an invalid ALPHABET character (a shape defect, -> WLT1_WALLET_ADDRESS_
  // INVALID) is distinguishable from a valid-alphabet string whose CHECKSUM fails
  // (-> WLT1_ADDRESS_CANONICALISATION_FAILED) — @scure/base's checksummed decoder throws on
  // either, collapsing both into one error otherwise. Decoding twice on the valid-alphabet path is
  // a bounded, deterministic cost, not a network/vendor call.
  try {
    base58.decode(rawAddress);
  } catch {
    return { ok: false, reasonCode: "invalid_base58_alphabet" };
  }
  let payload: Uint8Array;
  try {
    payload = base58check.decode(rawAddress);
  } catch {
    return { ok: false, reasonCode: "invalid_base58check_checksum" };
  }

  if (payload.length !== TRON_PAYLOAD_LENGTH) {
    return { ok: false, reasonCode: "invalid_payload_length" };
  }
  if (payload[0] !== TRON_MAINNET_PREFIX) {
    return { ok: false, reasonCode: "invalid_network_prefix" };
  }
  const addressBytes = payload.slice(1);
  if (addressBytes.every((b) => b === 0)) {
    return { ok: false, reasonCode: "zero_address" };
  }

  // Re-encode from the validated payload (never trust the caller's exact string as-is) so the
  // stored canonical form is always the deterministic Base58Check re-encoding of the decoded
  // bytes, not merely "whatever string happened to decode successfully".
  const canonicalAddress = base58check.encode(payload);

  return {
    ok: true,
    canonicalAddress,
    canonicalisationVersion: TRON_CANONICALISATION_VERSION,
  };
}

/**
 * WLT-01 Phase 3B — derives the canonical TRON mainnet Base58Check address from a recovered
 * 20-byte hash160 (the last 20 bytes of `keccak_256(uncompressed_pubkey[1..65])`, the SAME
 * derivation TRON's own `signMessageV2`/`verifyMessageV2` uses). Reuses the SAME `base58check`
 * encoder instance this file's own `canonicaliseTronAddress` decodes with — never a second
 * Base58Check implementation. The 21-byte payload (`0x41` mainnet prefix || hash160) is encoded
 * once here, then re-decoded through `canonicaliseTronAddress` so a Proof-of-Control recovered
 * address is canonicalised through the EXACT SAME validation path a registered destination
 * address already went through — never a divergent second canonicalisation route.
 */
export function deriveTronMainnetAddress(hash160: Uint8Array): TronCanonicaliseResult {
  if (hash160.length !== TRON_PAYLOAD_LENGTH - 1) {
    return { ok: false, reasonCode: "invalid_payload_length" };
  }
  const payload = new Uint8Array(TRON_PAYLOAD_LENGTH);
  payload[0] = TRON_MAINNET_PREFIX;
  payload.set(hash160, 1);
  const rawAddress = base58check.encode(payload);
  return canonicaliseTronAddress(rawAddress);
}
