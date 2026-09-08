/**
 * WLT-01 Phase 3A-1/3B — Proof-of-Control frozen constants/types shared by `message.ts`/
 * `crypto.ts` and the challenge-lifecycle route (`routes/proof-of-control.ts`). Pure types and
 * frozen literal constants only — no DB access, no HTTP, no crypto call here.
 *
 * Phase 3 architecture (frozen): Proof-of-Control only (never ownership/beneficial-ownership/
 * custody). Exactly ONE proof method (`signed_message`) for both supported schemes. Phase 3A
 * shipped `eip191_personal_sign` (ethereum/mainnet); Phase 3B adds `tron_personal_sign`
 * (tron/mainnet, TronWeb `signMessageV2`-compatible dynamic-length digest — NOT the legacy fixed
 * `"\x19TRON Signed Message:\n32"` prefix). No third scheme exists; `proof_method` is unchanged.
 */

/** The only PoC message byte layout Phase 3A can build or accept. A future Phase 3B/3C format
 * gets its own version number and its own builder — this file never silently reinterprets an
 * unknown version as version 1. */
export const POC_MESSAGE_FORMAT_VERSION_1 = 1;

/** Phase 3A's only proof method — matches migration 053's `proof_method` CHECK exactly. */
export const POC_PROOF_METHOD_SIGNED_MESSAGE = "signed_message";

/** Phase 3A's EVM verification scheme — matches migration 053's `verification_scheme` CHECK. */
export const POC_VERIFICATION_SCHEME_EIP191_PERSONAL_SIGN = "eip191_personal_sign";

/** Phase 3B's TRON verification scheme (migration 054 widens the `verification_scheme` CHECK to
 * allow this value alongside the EVM one). TronWeb `signMessageV2`/`verifyMessageV2`-compatible:
 * dynamic-length `"\x19TRON Signed Message:\n" + byteLength` prefix — never the legacy fixed
 * `"\x19TRON Signed Message:\n32"` form. */
export const POC_VERIFICATION_SCHEME_TRON_PERSONAL_SIGN = "tron_personal_sign";

/** The five `Wlt1Config.environment` values PoC snapshots into `domain_environment` — reuses the
 * existing `@aix/foundation` `Environment` vocabulary; no new `WLT1_POC_DOMAIN` config exists. */
export const POC_DOMAIN_ENVIRONMENTS = ["dev", "qa", "uat", "staging", "prod"] as const;
export type PocDomainEnvironment = (typeof POC_DOMAIN_ENVIRONMENTS)[number];

/** Every field the frozen 14-line canonical PoC message needs. `messageFormatVersion` is carried
 * explicitly (never inferred) so the builder can dispatch on it and fail closed on an unknown
 * value — see `message.ts`'s own header comment. */
export interface CanonicalPocMessageFields {
  domainEnvironment: PocDomainEnvironment;
  challengeId: string;
  nonce: string;
  clientId: string;
  destinationId: string;
  chain: string;
  network: string;
  canonicalAddress: string;
  addressHash: string;
  issuedAtUtc: string;
  expiresAtUtc: string;
}

/** `chain`/`network` -> the ONE verification scheme that pair can verify, or explicitly
 * unsupported (never a silent default). Exactly two supported pairs after Phase 3B
 * (`ethereum/mainnet` -> EIP-191, `tron/mainnet` -> TRON V2); every other pair resolves
 * unsupported. */
export type PocApplicabilityResult =
  | { supported: true; verificationScheme: typeof POC_VERIFICATION_SCHEME_EIP191_PERSONAL_SIGN }
  | { supported: true; verificationScheme: typeof POC_VERIFICATION_SCHEME_TRON_PERSONAL_SIGN }
  | { supported: false };

/** Bounded reason codes for the crypto verification seam (`crypto.ts`'s own
 * `verifyEip191PersonalSignSignature`/`canonicalizeAixSignature`) plus one Phase 3A-3 addition,
 * `recovered_address_mismatch` — produced by the ROUTE layer (`routes/proof-of-control.ts`), never
 * by `crypto.ts` itself, since crypto.ts has no knowledge of which address is "expected" (that is
 * DB-sourced data outside its pure scope). This is an internal, never-HTTP-exposed vocabulary
 * (Part BA/T) — every cryptographically-evaluated failure maps to the SAME bounded public error,
 * `WLT1_PROOF_OF_CONTROL_FAILED`; only `last_failure_reason_code`/the failed-proof audit ever carry
 * the specific reason. */
export type PocSignatureRejectionReasonCode =
  | "malformed_hex"
  | "invalid_length"
  | "invalid_v"
  | "r_out_of_range"
  | "s_out_of_range"
  | "high_s"
  | "recovery_failed"
  | "recovered_address_mismatch";

export type PocSignatureVerificationResult =
  | { ok: true; recoveredAddress: string; canonicalSignatureHex: string; signatureHash: string }
  | { ok: false; reasonCode: PocSignatureRejectionReasonCode };
