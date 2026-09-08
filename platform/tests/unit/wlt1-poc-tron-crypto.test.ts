/**
 * WLT-01 Phase 3B — TRON `signMessageV2`-compatible digest construction, secp256k1 recovery, and
 * TRON address derivation (`lib/proof-of-control/crypto.ts`'s `buildTronPersonalSignDigest`/
 * `verifyTronPersonalSignSignature`). Pure unit tests, no database.
 *
 * ============================================================================================
 * INDEPENDENT TRONWEB INTEROPERABILITY VECTOR (LOAD-BEARING, Part O) — provenance:
 * ============================================================================================
 * Produced OUTSIDE this repository, in a temporary directory that was completely deleted
 * afterward. TronWeb was NEVER added as a WLT runtime dependency, dev dependency, or any
 * `package.json`/`package-lock.json` entry — grep this repository for "tronweb" to confirm.
 *
 *   1. `npm install tronweb@6.5.0` in a disposable external directory (exact pinned version,
 *      confirmed via that install's own `node_modules/tronweb/package.json`).
 *   2. A fixed TEST-ONLY private key: `sha256("wlt-01-phase3b-tron-test-only-private-key")`.
 *      NEVER used for any production purpose.
 *   3. `TronWeb.address.fromPrivateKey(privateKey)` derived the expected TRON mainnet address.
 *   4. The EXACT canonical WLT PoC message string below was built by THIS repository's OWN
 *      `buildCanonicalPocMessage` (never hand-typed) and handed to TronWeb via a file, never a
 *      copy-pasted literal, eliminating transcription risk.
 *   5. `trx.signMessageV2(canonicalMessage, privateKey)` produced the signature below.
 *   6. `trx.verifyMessageV2(canonicalMessage, signature)` independently confirmed, using TronWeb's
 *      OWN verifier (not this codebase's), that the signature recovers to the expected address.
 *   7. THIS repository's OWN `verifyTronPersonalSignSignature` was then run against the exact same
 *      message + signature and independently recovered the IDENTICAL canonical address — proving
 *      interoperability with the real external oracle, not merely self-consistency.
 *   8. The temporary directory (TronWeb install + all scripts) was deleted in full.
 *
 * Every static value below is copied byte-for-byte from that process's own JSON output.
 */
import { bytesToHex } from "@noble/hashes/utils";
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";
import { describe, expect, it } from "vitest";
import { buildTronPersonalSignDigest, computeEip191PersonalSignDigest, verifyTronPersonalSignSignature, verifyEip191PersonalSignSignature } from "../../services/wlt1/src/lib/proof-of-control/crypto.js";
import { signTronPocMessage, signTronPocMessageWithWrongKey, POC_TRON_TEST_PRIVATE_KEY_HEX, POC_TRON_TEST_ADDRESS } from "../helpers/poc-tron-test-signing.js";

/** TronWeb version pinned for the interop vector below (exact pin, confirmed via that external
 * install's own package.json — see this file's own header comment). */
const TRONWEB_VECTOR_VERSION = "6.5.0";

/** The exact canonical WLT PoC message the vector was signed over (built by this repository's own
 * `buildCanonicalPocMessage`, 544 UTF-8 bytes, no trailing newline). */
const TRONWEB_VECTOR_MESSAGE =
  "AIX WLT-01 Proof of Control\n" +
  "version: 1\n" +
  "purpose: prove_control_of_destination_address\n" +
  "environment: dev\n" +
  "challenge_id: wlt1poc_tronvector0000000000000001\n" +
  "nonce: 2a1e4e0f9e576aedb108e6906a5a57c39c2989274938b70a6421eeaf0bf96bb7\n" +
  "client_id: clt1client_tronvector\n" +
  "destination_id: wlt1dest_tronvector0000000000001\n" +
  "chain: tron\n" +
  "network: mainnet\n" +
  "address: TBVnfLnh9xL2RcUWziezQFL5P6Z4HekyRC\n" +
  "address_hash: sha256:5be3a931301e28cf113ba59f6ebfad529ddad2ec680ed31697cc209262e034bc\n" +
  "issued_at_utc: 2026-01-01T00:00:00.000Z\n" +
  "expires_at_utc: 2026-01-01T00:15:00.000Z";

/** Signature produced by REAL TronWeb `trx.signMessageV2` over the exact message above, with the
 * private key `sha256("wlt-01-phase3b-tron-test-only-private-key")`. */
const TRONWEB_VECTOR_SIGNATURE =
  "0x05a1743b8a390706509f13b0cb1b8e28bcd9ffdbcca1e444df3ef93895fc9a2a0eaa7224181393980803fd837b0768e97b1a4305714a142f00d44eb5fc6f48f01b";

/** Expected TRON mainnet address, independently derived by REAL `TronWeb.address.fromPrivateKey`
 * AND confirmed by REAL `trx.verifyMessageV2`. */
const TRONWEB_VECTOR_ADDRESS = "TBVnfLnh9xL2RcUWziezQFL5P6Z4HekyRC";

/** `keccak_256(prefix || message)` for the vector message above, computed via THIS repository's
 * own `buildTronPersonalSignDigest` (recorded here as a static regression value — a future
 * accidental change to the digest construction would change this hex string). */
const TRONWEB_VECTOR_TRON_DIGEST_HEX = "fe089a63dcf37701909a49d7f573002914ed9bd6a12f47a83c14445b609f0d26";

describe("WLT-01 Phase 3B — buildTronPersonalSignDigest", () => {
  it("uses the UTF-8 BYTE length of the message in the prefix, not the JS character count", () => {
    const withMultiByte = "café";
    const digest = buildTronPersonalSignDigest(withMultiByte);
    const byteLength = Buffer.byteLength(withMultiByte, "utf8");
    expect(byteLength).not.toBe(withMultiByte.length);
    const prefix = new TextEncoder().encode(`\x19TRON Signed Message:\n${byteLength}`);
    const msgBytes = new TextEncoder().encode(withMultiByte);
    const preimage = new Uint8Array(prefix.length + msgBytes.length);
    preimage.set(prefix, 0);
    preimage.set(msgBytes, prefix.length);
    expect(bytesToHex(digest)).toBe(bytesToHex(keccak_256(preimage)));
  });

  it("is exactly 32 bytes", () => {
    expect(buildTronPersonalSignDigest("anything").length).toBe(32);
  });

  it("ASCII message digest matches manual construction", () => {
    const message = "hello tron";
    const digest = buildTronPersonalSignDigest(message);
    const prefix = new TextEncoder().encode(`\x19TRON Signed Message:\n${message.length}`);
    const preimage = new Uint8Array(prefix.length + message.length);
    preimage.set(prefix, 0);
    preimage.set(new TextEncoder().encode(message), prefix.length);
    expect(bytesToHex(digest)).toBe(bytesToHex(keccak_256(preimage)));
  });

  it("empty string is a valid input (dynamic-length prefix handles zero-length message)", () => {
    const digest = buildTronPersonalSignDigest("");
    const prefix = new TextEncoder().encode(`\x19TRON Signed Message:\n0`);
    expect(bytesToHex(digest)).toBe(bytesToHex(keccak_256(prefix)));
    expect(digest.length).toBe(32);
  });

  it("length-boundary message (exactly 32 bytes) still uses the DYNAMIC prefix '...\\n32', not coincidentally matching the legacy FIXED '...\\n32' construction (which hashes the message TWICE)", () => {
    const message32Bytes = "a".repeat(32);
    expect(Buffer.byteLength(message32Bytes, "utf8")).toBe(32);
    const v2Digest = buildTronPersonalSignDigest(message32Bytes);

    // FORBIDDEN LEGACY CONSTRUCTION — reproduced here ONLY to prove inequality with the accepted
    // V2 digest above; NEVER used anywhere in production code (see this file's own crypto.ts
    // import — no legacy function is exported or implemented there).
    const legacyPrefix = new TextEncoder().encode(`\x19TRON Signed Message:\n32`);
    const legacyInnerHash = keccak_256(new TextEncoder().encode(message32Bytes));
    const legacyPreimage = new Uint8Array(legacyPrefix.length + legacyInnerHash.length);
    legacyPreimage.set(legacyPrefix, 0);
    legacyPreimage.set(legacyInnerHash, legacyPrefix.length);
    const legacyDigest = keccak_256(legacyPreimage);

    expect(bytesToHex(v2Digest)).not.toBe(bytesToHex(legacyDigest));
  });

  it("V2 dynamic-length digest != legacy fixed-32 digest for a non-32-byte message", () => {
    const message = "AIX WLT-01 Proof of Control canonical message body, definitely not 32 bytes long";
    expect(Buffer.byteLength(message, "utf8")).not.toBe(32);
    const v2Digest = buildTronPersonalSignDigest(message);

    // FORBIDDEN LEGACY CONSTRUCTION — reproduced here only to prove inequality, never in production.
    const legacyPrefix = new TextEncoder().encode(`\x19TRON Signed Message:\n32`);
    const legacyInnerHash = keccak_256(new TextEncoder().encode(message));
    const legacyPreimage = new Uint8Array(legacyPrefix.length + legacyInnerHash.length);
    legacyPreimage.set(legacyPrefix, 0);
    legacyPreimage.set(legacyInnerHash, legacyPrefix.length);
    const legacyDigest = keccak_256(legacyPreimage);

    expect(bytesToHex(v2Digest)).not.toBe(bytesToHex(legacyDigest));
  });

  it("differs from the EIP-191 EVM digest for the identical message (domain separation by construction)", () => {
    const message = "shared canonical message, two different chains";
    const tronDigest = buildTronPersonalSignDigest(message);
    const evmDigest = computeEip191PersonalSignDigest(message);
    expect(bytesToHex(tronDigest)).not.toBe(bytesToHex(evmDigest));
  });
});

describe("WLT-01 Phase 3B — real TronWeb interoperability vector (Part O, load-bearing)", () => {
  it("REFERENCE: TronWeb 6.5.0 pinned version recorded", () => {
    expect(TRONWEB_VECTOR_VERSION).toBe("6.5.0");
  });

  it("this repository's OWN digest construction matches the vector's recorded TRON V2 digest", () => {
    const digest = buildTronPersonalSignDigest(TRONWEB_VECTOR_MESSAGE);
    expect(bytesToHex(digest)).toBe(TRONWEB_VECTOR_TRON_DIGEST_HEX);
  });

  it("verifyTronPersonalSignSignature independently recovers the EXACT address TronWeb itself reported (interoperability, not self-consistency)", () => {
    const result = verifyTronPersonalSignSignature(TRONWEB_VECTOR_MESSAGE, TRONWEB_VECTOR_SIGNATURE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recoveredAddress).toBe(TRONWEB_VECTOR_ADDRESS);
    }
  });

  it("the signature is well-formed 65-byte AIX external format (0x + 130 hex chars)", () => {
    expect(TRONWEB_VECTOR_SIGNATURE).toMatch(/^0x[0-9a-fA-F]{130}$/);
  });
});

describe("WLT-01 Phase 3B — domain-separation / tamper negatives (Part Q)", () => {
  it("message changed by one byte -> recovered address no longer matches the vector's expected address", () => {
    const tampered = TRONWEB_VECTOR_MESSAGE.slice(0, -1) + "X";
    const result = verifyTronPersonalSignSignature(tampered, TRONWEB_VECTOR_SIGNATURE);
    if (result.ok) {
      expect(result.recoveredAddress).not.toBe(TRONWEB_VECTOR_ADDRESS);
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it("signature changed (tampered r) -> recovery fails or recovers to a different address, never the vector's expected address", () => {
    const tamperedSig = "0x" + "ff" + TRONWEB_VECTOR_SIGNATURE.slice(4);
    const result = verifyTronPersonalSignSignature(TRONWEB_VECTOR_MESSAGE, tamperedSig);
    if (result.ok) {
      expect(result.recoveredAddress).not.toBe(TRONWEB_VECTOR_ADDRESS);
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it("wrong registered TRON address -> the route-level comparison would classify this as recovered_address_mismatch (the crypto seam itself still recovers successfully, just to the SAME correct address, which the CALLER compares against a DIFFERENT expected one)", () => {
    const result = verifyTronPersonalSignSignature(TRONWEB_VECTOR_MESSAGE, TRONWEB_VECTOR_SIGNATURE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recoveredAddress).not.toBe("TLJGUovR8DfANSoDMvsaRu3WnHnfG4EXrG");
    }
  });

  it("the legacy fixed-\\n32 digest construction does NOT validate as V2 — a signature over the legacy digest does not recover to the vector address under verifyTronPersonalSignSignature", () => {
    // Sign the LEGACY digest directly with the SAME golden key (bypassing buildTronPersonalSignDigest
    // entirely) — reproduces what a legacy-signing wallet would have produced, never used in
    // production.
    const legacyPrefix = new TextEncoder().encode(`\x19TRON Signed Message:\n32`);
    const legacyInnerHash = keccak_256(new TextEncoder().encode(TRONWEB_VECTOR_MESSAGE));
    const legacyPreimage = new Uint8Array(legacyPrefix.length + legacyInnerHash.length);
    legacyPreimage.set(legacyPrefix, 0);
    legacyPreimage.set(legacyInnerHash, legacyPrefix.length);
    const legacyDigest = keccak_256(legacyPreimage);

    const sig = secp256k1.sign(legacyDigest, new Uint8Array(Buffer.from(POC_TRON_TEST_PRIVATE_KEY_HEX, "hex")), { prehash: false });
    const compact = sig.toBytes("compact");
    const vRaw = sig.recovery === 0 ? "1b" : "1c";
    const legacySignatureHex = "0x" + bytesToHex(compact.slice(0, 32)) + bytesToHex(compact.slice(32, 64)) + vRaw;

    // verifyTronPersonalSignSignature computes the V2 (dynamic-length) digest internally — feeding
    // it a signature produced over the LEGACY digest must NOT recover to the vector's address.
    const result = verifyTronPersonalSignSignature(TRONWEB_VECTOR_MESSAGE, legacySignatureHex);
    if (result.ok) {
      expect(result.recoveredAddress).not.toBe(TRONWEB_VECTOR_ADDRESS);
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it("an EVM (EIP-191) digest signature does NOT validate as TRON — signing with the EVM prefix and verifying with the TRON verifier does not recover the vector's TRON address", () => {
    const result = verifyEip191PersonalSignSignature(TRONWEB_VECTOR_MESSAGE, TRONWEB_VECTOR_SIGNATURE);
    // The EVM verifier derives an ETHEREUM address (0x-prefixed) from this TRON signature —
    // structurally never equal to a TRON Base58Check address, proving domain separation without
    // ever needing the two encodings to collide.
    if (result.ok) {
      expect(result.recoveredAddress).not.toBe(TRONWEB_VECTOR_ADDRESS);
      expect(result.recoveredAddress.startsWith("0x")).toBe(true);
    }

    // Converse direction: sign the SAME message with the EVM digest+golden key, verify via the
    // TRON verifier — must not recover the vector's TRON address either.
    const evmDigest = computeEip191PersonalSignDigest(TRONWEB_VECTOR_MESSAGE);
    const evmSig = secp256k1.sign(evmDigest, new Uint8Array(Buffer.from(POC_TRON_TEST_PRIVATE_KEY_HEX, "hex")), { prehash: false });
    const compact = evmSig.toBytes("compact");
    const vRaw = evmSig.recovery === 0 ? "1b" : "1c";
    const evmOverTronKeySig = "0x" + bytesToHex(compact.slice(0, 32)) + bytesToHex(compact.slice(32, 64)) + vRaw;
    const crossResult = verifyTronPersonalSignSignature(TRONWEB_VECTOR_MESSAGE, evmOverTronKeySig);
    if (crossResult.ok) {
      expect(crossResult.recoveredAddress).not.toBe(TRONWEB_VECTOR_ADDRESS);
    }
  });
});

describe("WLT-01 Phase 3B — TRON address vector (Part R)", () => {
  it("the golden TRON test key derives EXACTLY the TronWeb-confirmed address via this repository's OWN address derivation", () => {
    expect(POC_TRON_TEST_ADDRESS).toBe(TRONWEB_VECTOR_ADDRESS);
    // Our OWN signer (Noble-based, not TronWeb) over a FRESH message, verified by our OWN
    // verifier — proves the golden key's own derivation independent of the committed vector's
    // specific pre-computed signature.
    const message = "independent freshness check for the golden TRON key";
    const sig = signTronPocMessage(message);
    const result = verifyTronPersonalSignSignature(message, sig);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recoveredAddress).toBe(POC_TRON_TEST_ADDRESS);
  });

  it("the canonical TRON address begins with 'T' (Base58Check mainnet form)", () => {
    expect(POC_TRON_TEST_ADDRESS.startsWith("T")).toBe(true);
  });

  it("a signature from a genuinely different key recovers to a DIFFERENT TRON address", () => {
    const message = "any canonical message body for this test";
    const sig = signTronPocMessageWithWrongKey(message);
    const result = verifyTronPersonalSignSignature(message, sig);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recoveredAddress).not.toBe(POC_TRON_TEST_ADDRESS);
  });
});
